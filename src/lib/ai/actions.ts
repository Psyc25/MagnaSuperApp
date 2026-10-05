"use server";

import { createClient } from "@/lib/supabase/server";
import { getDefaultAgent, type AIAgent } from "./agents";
import { buildSystemPrompt, buildUserContext } from "./system-prompt";
import { getToolsForUser } from "./tools";
import { executeToolCall } from "./tool-handlers";
import type { PendingAction, ToolCall, ToolDefinition } from "./types";

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
/** Batas putaran tool per pesan — cukup untuk "cari ID dulu, lalu aksi"
 * tanpa membiarkan model berputar terus memakan kuota. */
const MAX_TOOL_ROUNDS = 4;
const AI_TIMEOUT_MS = 45_000;
/** Suhu rendah untuk tool calling — jawaban data harus konsisten, bukan kreatif. */
const TOOL_TEMPERATURE = 0.3;

const CONFIRM_WORDS = new Set(["ya", "iya", "yes", "y", "ok", "oke", "okay", "lanjut", "konfirmasi", "setuju", "benar"]);
const CANCEL_WORDS = new Set(["batal", "tidak", "gak", "nggak", "no", "cancel", "jangan", "batalkan"]);

function normalizeReply(text: string): string {
  return text.toLowerCase().replace(/[^a-z\s]/g, "").trim();
}

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
  tools: ToolDefinition[],
  toolChoice: "auto" | "none" = "auto"
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
    temperature: tools.length > 0 ? TOOL_TEMPERATURE : agent.temperature,
    max_tokens: agent.maxTokens,
  };

  // Tambahkan tools jika bukan local (local mungkin tidak support)
  if (!isLocal && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("AI API fetch gagal:", err);
    throw new Error("Asisten AI tidak merespons, coba lagi sebentar lagi.");
  }

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
  // Dipertahankan untuk kompatibilitas pemanggil lama (UI dulu punya model
  // picker); model sekarang selalu dari getDefaultAgent().
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _agentId?: string
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

  const reply = normalizeReply(text);
  const isConfirmation = CONFIRM_WORDS.has(reply);
  const isCancel = CANCEL_WORDS.has(reply);

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
  if (isConfirmation && pendingAction && lastMessage) {
    // KLAIM dulu secara atomik (kosongkan pendingAction hanya kalau masih
    // ada), baru eksekusi. Kalau user klik/kirim "Ya" dua kali nyaris
    // bersamaan, cuma satu request yang dapat baris ini -- aksi tidak
    // pernah jalan dua kali (mis. booking dobel).
    const { data: claimed, error: claimErr } = await supabase
      .from("ai_assistant_messages")
      .update({ metadata: {} })
      .eq("id", lastMessage.id)
      .not("metadata->pendingAction", "is", null)
      .select("id");

    if (claimErr) {
      console.error("[ai] klaim pending action gagal:", claimErr.message);
      return { error: "Gagal memproses konfirmasi, coba lagi." };
    }
    if (!claimed || claimed.length === 0) {
      return { error: "Aksi ini sudah diproses sebelumnya." };
    }

    await supabase.from("ai_assistant_messages").insert({ user_id: user.id, role: "user", content: text });

    const result = await executeToolCall(supabase, userContext, pendingAction.tool, pendingAction.args, true);

    let responseContent: string;
    if (result.success) {
      responseContent =
        typeof result.data === "object" && result.data !== null && "message" in result.data
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

    return {
      message: {
        id: assistantMsg.id,
        role: "assistant",
        content: assistantMsg.content,
        createdAt: assistantMsg.created_at,
      },
    };
  }

  // Pending action yang tidak dikonfirmasi selalu dibuang -- dibatalkan
  // eksplisit, atau user lanjut bicara hal lain (jangan sampai "ya" untuk
  // pertanyaan berikutnya tidak sengaja menjalankan aksi lama).
  if (pendingAction && lastMessage) {
    await supabase.from("ai_assistant_messages").update({ metadata: {} }).eq("id", lastMessage.id);
  }

  if (isCancel && pendingAction) {
    await supabase.from("ai_assistant_messages").insert({ user_id: user.id, role: "user", content: text });
    const { data: cancelMsg, error: cancelErr } = await supabase
      .from("ai_assistant_messages")
      .insert({ user_id: user.id, role: "assistant", content: "Baik, aksi dibatalkan. Tidak ada data yang diubah.", metadata: {} })
      .select("id, role, content, created_at")
      .single();
    if (cancelErr) return { error: "Gagal menyimpan respons" };
    return {
      message: { id: cancelMsg.id, role: "assistant", content: cancelMsg.content, createdAt: cancelMsg.created_at },
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

  const tools = getToolsForUser(userContext);
  let finalContent = "";
  let pendingActionToSave: PendingAction | undefined;

  // Loop tool calling: model boleh memanggil query tool beberapa putaran
  // (mis. cari ID alat -> cek ketersediaan -> siapkan booking) sebelum
  // menjawab. Begitu ada action tool, loop berhenti dan konfirmasi
  // ditampilkan ke user -- aksi baru dijalankan setelah user mengetik "Ya".
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const isLastRound = round === MAX_TOOL_ROUNDS - 1;
      // Putaran terakhir: definisi tool tetap dikirim (sebagian provider
      // menolak riwayat berisi hasil tool tanpa definisinya), tapi model
      // dipaksa menjawab teks -- tidak boleh memanggil tool lagi.
      const aiResponse = await callAIWithTools(agent, messages, tools, isLastRound ? "none" : "auto");
      const toolCalls = aiResponse.toolCalls ?? [];

      if (toolCalls.length === 0) {
        finalContent = aiResponse.content;
        break;
      }

      const toolMessages: ChatMessage[] = [];
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          args = {};
        }

        const result = await executeToolCall(supabase, userContext, toolName, args, false);

        if (result.requiresConfirmation) {
          // Satu konfirmasi per giliran -- action tool lain di putaran yang
          // sama diabaikan, user bisa memintanya lagi setelah ini.
          if (!pendingActionToSave) {
            pendingActionToSave = result.pendingAction;
            finalContent = result.confirmationMessage || "Konfirmasi diperlukan";
          }
          toolMessages.push({ role: "tool", content: "Menunggu konfirmasi user.", tool_call_id: toolCall.id });
        } else {
          toolMessages.push({
            role: "tool",
            content: result.success ? JSON.stringify(result.data) : `Error: ${result.error}`,
            tool_call_id: toolCall.id,
          });
        }
      }

      if (pendingActionToSave) break;

      messages.push({ role: "assistant", content: aiResponse.content || "", tool_calls: toolCalls }, ...toolMessages);
    }
  } catch (err) {
    await supabase.from("ai_assistant_messages").delete().eq("id", userMsg.id);
    return { error: err instanceof Error ? err.message : "Gagal menghubungi AI" };
  }

  if (!finalContent.trim()) {
    finalContent = "Maaf, saya belum bisa menjawab itu. Coba ulangi dengan kalimat lain.";
  }
  // Kolom content dibatasi 8000 karakter (migrasi 0080).
  if (finalContent.length > 8000) finalContent = finalContent.slice(0, 7990) + "…";

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
