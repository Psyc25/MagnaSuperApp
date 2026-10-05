"use server";

import { createClient } from "@/lib/supabase/server";
import { getDefaultAgent, type AIAgent } from "./agents";
import { buildSystemPrompt, buildUserContext } from "./system-prompt";
import { AI_TOOLS, isActionTool } from "./tools";
import { executeToolCall } from "./tool-handlers";
import type { ToolCall, UserContext, PendingAction } from "./types";

export type AIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  agentId?: string;
  /** Pending action menunggu konfirmasi user */
  pendingAction?: PendingAction;
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const LOCAL_AI_URL = process.env.AI_API_URL || "http://localhost:20128/v1";

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
 * Panggil AI dengan tool calling support.
 */
async function callAIWithTools(
  agent: AIAgent,
  messages: ChatMessage[],
  tools: typeof AI_TOOLS
): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  const isLocal = agent.provider === "local";
  const apiUrl = isLocal ? LOCAL_AI_URL : OPENROUTER_URL;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!isLocal) {
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY belum diset di .env.local. Daftar gratis di openrouter.ai/keys");
    }
    headers["Authorization"] = `Bearer ${OPENROUTER_API_KEY}`;
    headers["HTTP-Referer"] = "https://magnasuperapp.vercel.app";
    headers["X-Title"] = "MagnaSuperApp";
  }

  const body: Record<string, unknown> = {
    model: agent.model,
    messages,
    temperature: agent.temperature,
    max_tokens: agent.maxTokens,
  };

  // Tambahkan tools jika bukan local (local mungkin tidak support)
  if (!isLocal && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI API error:", response.status, errText);

    if (response.status === 401) throw new Error("API key tidak valid");
    if (response.status === 402) throw new Error("Kredit habis, top up di openrouter.ai");
    if (response.status === 429) throw new Error("Rate limit, coba lagi");
    throw new Error(`Error ${response.status}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content || "",
    toolCalls: choice?.message?.tool_calls as ToolCall[] | undefined,
  };
}

export async function sendAIMessage(
  userMessage: string,
  agentId?: string
): Promise<{ message: AIMessage; error?: string } | { message?: undefined; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Tidak terautentikasi" };

  const text = userMessage.trim();
  if (!text || text.length > 8000) return { error: "Pesan kosong atau terlalu panjang" };

  // Ambil profile untuk konteks
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, division")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "Profile tidak ditemukan" };

  const userContext = buildUserContext(profile);
  const agent = getDefaultAgent();

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
    // Simpan pesan user "Ya"
    await supabase
      .from("ai_assistant_messages")
      .insert({ user_id: user.id, role: "user", content: text });

    // Eksekusi action
    const result = await executeToolCall(supabase, userContext, pendingAction.tool, pendingAction.args, true);

    // Buat response
    let responseContent: string;
    if (result.success) {
      responseContent = typeof result.data === "object" && result.data !== null && "message" in result.data
        ? String((result.data as { message: string }).message)
        : "Aksi berhasil dilakukan.";
    } else {
      responseContent = `Gagal: ${result.error}`;
    }

    // Simpan response (tanpa pending action)
    const { data: assistantMsg, error: assistantErr } = await supabase
      .from("ai_assistant_messages")
      .insert({ user_id: user.id, role: "assistant", content: responseContent, metadata: {} })
      .select("id, role, content, created_at")
      .single();

    if (assistantErr) return { error: "Gagal menyimpan respons" };

    // Clear pending action dari pesan sebelumnya
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

  // Simpan pesan user
  const { data: userMsg, error: userErr } = await supabase
    .from("ai_assistant_messages")
    .insert({ user_id: user.id, role: "user", content: text })
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
  const systemPrompt = buildSystemPrompt(userContext);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...((history ?? []).reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))),
  ];

  // Panggil AI dengan tools
  let aiResponse: { content: string; toolCalls?: ToolCall[] };
  try {
    aiResponse = await callAIWithTools(agent, messages, AI_TOOLS);
  } catch (err) {
    await supabase.from("ai_assistant_messages").delete().eq("id", userMsg.id);
    return { error: err instanceof Error ? err.message : "Gagal menghubungi AI" };
  }

  // Process tool calls jika ada
  let finalContent = aiResponse.content;
  let pendingActionToSave: PendingAction | undefined;

  if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
    const toolResults: string[] = [];

    for (const toolCall of aiResponse.toolCalls) {
      const toolName = toolCall.function.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      // Eksekusi tool
      const result = await executeToolCall(supabase, userContext, toolName, args, false);

      if (result.requiresConfirmation) {
        // Simpan pending action, jangan eksekusi dulu
        pendingActionToSave = result.pendingAction;
        finalContent = result.confirmationMessage || "Konfirmasi diperlukan";
      } else if (result.success) {
        // Format hasil untuk AI
        toolResults.push(`Tool ${toolName}: ${JSON.stringify(result.data)}`);
      } else {
        toolResults.push(`Tool ${toolName} error: ${result.error}`);
      }
    }

    // Jika tidak ada pending action, minta AI merangkum hasil
    if (!pendingActionToSave && toolResults.length > 0) {
      const followUpMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: "", tool_calls: aiResponse.toolCalls },
        ...toolResults.map((r, i) => ({
          role: "tool" as const,
          content: r,
          tool_call_id: aiResponse.toolCalls![i].id,
        })),
      ];

      try {
        const followUp = await callAIWithTools(agent, followUpMessages, []);
        finalContent = followUp.content || "Berikut hasilnya.";
      } catch {
        finalContent = toolResults.join("\n\n");
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
