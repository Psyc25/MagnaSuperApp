"use server";

import { createClient } from "@/lib/supabase/server";
import { getDefaultAgent, getAgentById, type AIAgent } from "./agents";
import { buildUserContext } from "./system-prompt";
import { getAgentPromptBuilder } from "./agent-prompts";
import { getToolsForAgent } from "./tools";
import { executeToolCall } from "./tool-handlers";
import type { UserContext, PendingAction, ToolDefinition, AIAttachment, MessageContent, TextContent, ImageContent } from "./types";

export type AIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  agentId?: string;
  pendingAction?: PendingAction;
  attachment?: AIAttachment;
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: MessageContent; // string or multimodal array
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

// 9Router lokal — GRATIS!
const NINEROUTER_URL = process.env.AI_API_URL || "http://localhost:20128/v1";
const NINEROUTER_KEY = process.env.AI_API_KEY || "";

// Check if AI is available (localhost won't work in production)
const isLocalhost = NINEROUTER_URL.includes("localhost") || NINEROUTER_URL.includes("127.0.0.1");
const isProduction = process.env.NODE_ENV === "production";
const AI_AVAILABLE = !isProduction || !isLocalhost;

export async function getAIMessages(): Promise<{ messages: AIMessage[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { messages: [], error: "Tidak terautentikasi" };
  }

  const { data, error } = await supabase
    .from("ai_assistant_messages")
    .select("id, role, content, created_at, metadata")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    if (error.code === "42P01") {
      return { messages: [], error: "Tabel AI belum dibuat. Jalankan migrasi SQL di Supabase Dashboard." };
    }
    return { messages: [], error: error.message };
  }

  return {
    messages: (data ?? []).map((row) => ({
      id: row.id,
      role: row.role as "user" | "assistant",
      content: row.content,
      createdAt: row.created_at,
      pendingAction: row.metadata?.pendingAction as PendingAction | undefined,
    })),
  };
}

/**
 * Convert tool definitions to OpenAI format.
 */
function convertToolsForAPI(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));
}

/**
 * Panggil 9Router lokal (OpenAI-compatible API).
 */
async function call9RouterAPI(
  agent: AIAgent,
  messages: ChatMessage[],
  tools: ToolDefinition[]
): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (NINEROUTER_KEY) {
    headers["Authorization"] = `Bearer ${NINEROUTER_KEY}`;
  }

  const body: Record<string, unknown> = {
    model: agent.model,
    messages,
    temperature: agent.temperature,
    max_tokens: agent.maxTokens,
    stream: false, // Disable streaming untuk menghindari SSE format
  };

  // Tambahkan tools jika ada
  if (tools.length > 0) {
    body.tools = convertToolsForAPI(tools);
    body.tool_choice = "auto";
  }

  let response: Response;
  try {
    response = await fetch(`${NINEROUTER_URL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (fetchError) {
    console.error("9Router fetch failed:", fetchError);
    throw new Error("AI tidak tersedia. Pastikan 9Router berjalan di localhost:20128 atau gunakan AI API alternatif.");
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error("9Router API error:", response.status, errText);

    if (response.status === 401) throw new Error("API key tidak valid. Cek AI_API_KEY di .env.local");
    if (response.status === 429) throw new Error("Rate limit tercapai, coba lagi nanti");
    throw new Error(`Error ${response.status}: ${errText.slice(0, 200)}`);
  }

  // Parse response - handle SSE format yang mungkin append "data: [DONE]"
  let responseText = await response.text();
  // Strip SSE suffix jika ada
  const doneIndex = responseText.indexOf("\ndata: [DONE]");
  if (doneIndex !== -1) {
    responseText = responseText.slice(0, doneIndex);
  }
  // Strip jika dimulai dengan "data: " (SSE format)
  if (responseText.startsWith("data: ")) {
    responseText = responseText.slice(6);
  }

  const data = JSON.parse(responseText);
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content || "",
    toolCalls: choice?.message?.tool_calls as ToolCall[] | undefined,
  };
}

export async function sendAIMessage(
  userMessage: string,
  agentId?: string,
  imageBase64?: string
): Promise<{ message: AIMessage; error?: string } | { message?: undefined; error: string }> {
  // Check if AI is available
  if (!AI_AVAILABLE) {
    return {
      error: "AI tidak tersedia di production. Untuk menggunakan AI, jalankan aplikasi di local dengan 9Router, atau konfigurasi AI_API_URL di environment variables."
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Tidak terautentikasi" };

  const text = userMessage.trim();
  // Allow empty text if there's an image
  if (!text && !imageBase64) return { error: "Pesan kosong" };
  if (text.length > 8000) return { error: "Pesan terlalu panjang" };

  // Ambil profile untuk konteks
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, division")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "Profile tidak ditemukan" };

  const userContext = buildUserContext(profile);

  // Get agent (use passed agentId or default to NOVA)
  const agent = agentId ? getAgentById(agentId) ?? getDefaultAgent() : getDefaultAgent();

  // Get agent-specific prompt
  const promptBuilder = getAgentPromptBuilder(agent.id);
  const systemPrompt = promptBuilder ? promptBuilder(userContext) : `Kamu adalah ${agent.name}, asisten AI MagnaSuperApp.`;

  // Get agent-specific tools
  const agentTools = getToolsForAgent(agent.id);

  // Cek apakah ini konfirmasi untuk pending action
  const isConfirmation = text.toLowerCase() === "ya" || text.toLowerCase() === "yes";

  // Ambil pesan terakhir untuk cek pending action
  const { data: lastMessages } = await supabase
    .from("ai_assistant_messages")
    .select("id, metadata")
    .eq("user_id", user.id)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1);

  const lastMessage = lastMessages?.[0];
  const pendingAction = lastMessage?.metadata?.pendingAction as PendingAction | undefined;

  // Jika konfirmasi dan ada pending action, eksekusi
  if (isConfirmation && pendingAction) {
    await supabase
      .from("ai_assistant_messages")
      .insert({ user_id: user.id, role: "user", content: text });

    const result = await executeToolCall(supabase, userContext, pendingAction.tool, pendingAction.args, true);

    let responseContent: string;
    if (result.success) {
      responseContent = typeof result.data === "object" && result.data !== null && "message" in result.data
        ? String((result.data as { message: string }).message)
        : "Aksi berhasil dilakukan.";
    } else {
      responseContent = `Gagal: ${result.error}`;
    }

    const { data: assistantMsg, error: assistantErr } = await supabase
      .from("ai_assistant_messages")
      .insert({ user_id: user.id, role: "assistant", content: responseContent, metadata: {} })
      .select("id, role, content, created_at")
      .single();

    if (assistantErr) return { error: "Gagal menyimpan respons" };

    if (lastMessage) {
      await supabase
        .from("ai_assistant_messages")
        .update({ metadata: {} })
        .eq("id", lastMessage.id);
    }

    return {
      message: {
        id: assistantMsg.id,
        role: "assistant",
        content: assistantMsg.content,
        createdAt: assistantMsg.created_at,
      },
    };
  }

  // Simpan pesan user (dengan metadata gambar jika ada)
  const userMsgMetadata = imageBase64 ? { hasImage: true } : {};
  const { data: userMsg, error: userErr } = await supabase
    .from("ai_assistant_messages")
    .insert({ user_id: user.id, role: "user", content: text || "(gambar)", metadata: userMsgMetadata })
    .select("id, role, content, created_at")
    .single();

  if (userErr) {
    if (userErr.code === "42P01") {
      return { error: "Tabel AI belum ada. Jalankan migrasi SQL di Supabase Dashboard." };
    }
    return { error: "Gagal menyimpan pesan: " + userErr.message };
  }

  // Ambil histori
  const { data: history } = await supabase
    .from("ai_assistant_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Build messages dengan system prompt
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...((history ?? []).reverse().slice(0, -1).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))),
  ];

  // Add current user message (potentially with image)
  if (imageBase64) {
    // Multimodal content with image
    const contentParts: (TextContent | ImageContent)[] = [];
    if (text) {
      contentParts.push({ type: "text", text });
    }
    contentParts.push({
      type: "image_url",
      image_url: { url: imageBase64, detail: "auto" },
    });
    messages.push({ role: "user", content: contentParts });
  } else {
    messages.push({ role: "user", content: text });
  }

  // Panggil 9Router API
  let aiResponse: { content: string; toolCalls?: ToolCall[] };
  try {
    aiResponse = await call9RouterAPI(agent, messages, agentTools);
  } catch (err) {
    await supabase.from("ai_assistant_messages").delete().eq("id", userMsg.id);
    return { error: err instanceof Error ? err.message : "Gagal menghubungi AI" };
  }

  // Process tool calls jika ada
  let finalContent = aiResponse.content;
  let pendingActionToSave: PendingAction | undefined;

  if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
    const toolResults: Array<{ id: string; result: string }> = [];

    for (const toolCall of aiResponse.toolCalls) {
      const toolName = toolCall.function.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      const result = await executeToolCall(supabase, userContext, toolName, args, false);

      if (result.requiresConfirmation) {
        pendingActionToSave = result.pendingAction;
        finalContent = result.confirmationMessage || "Konfirmasi diperlukan";
      } else if (result.success) {
        toolResults.push({
          id: toolCall.id,
          result: JSON.stringify(result.data),
        });
      } else {
        toolResults.push({
          id: toolCall.id,
          result: `Error: ${result.error}`,
        });
      }
    }

    // Jika tidak ada pending action, minta AI merangkum hasil
    if (!pendingActionToSave && toolResults.length > 0) {
      const followUpMessages: ChatMessage[] = [
        ...messages,
        {
          role: "assistant",
          content: "",
          tool_calls: aiResponse.toolCalls,
        },
        ...toolResults.map((tr) => ({
          role: "tool" as const,
          content: tr.result,
          tool_call_id: tr.id,
        })),
      ];

      try {
        const followUp = await call9RouterAPI(agent, followUpMessages, []);
        finalContent = followUp.content || "Berikut hasilnya.";
      } catch {
        finalContent = toolResults.map((r) => r.result).join("\n\n");
      }
    }
  }

  // Simpan respons
  const metadata = pendingActionToSave ? { pendingAction: pendingActionToSave } : {};
  const { data: assistantMsg, error: assistantErr } = await supabase
    .from("ai_assistant_messages")
    .insert({ user_id: user.id, role: "assistant", content: finalContent, metadata })
    .select("id, role, content, created_at, metadata")
    .single();

  if (assistantErr) return { error: "Gagal menyimpan respons" };

  return {
    message: {
      id: assistantMsg.id,
      role: "assistant",
      content: assistantMsg.content,
      createdAt: assistantMsg.created_at,
      pendingAction: pendingActionToSave,
    },
  };
}

export async function clearAIHistory(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Tidak terautentikasi" };

  const { error } = await supabase
    .from("ai_assistant_messages")
    .delete()
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
