"use server";

import { createClient } from "@/lib/supabase/server";
import { getAgentById, getDefaultAgent, type AIAgent } from "./agents";
import { getAgentPromptBuilder } from "./agent-prompts";
import { buildOperationalPrompt, buildSystemPrompt, buildUserContext } from "./system-prompt";
import { getToolsForAgent, getToolsForUser } from "./tools";
import { executeToolCall } from "./tool-handlers";
import type { AIAttachment, ImageContent, MessageContent, PendingAction, TextContent, ToolCall, ToolDefinition } from "./types";

export type AIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  agentId?: string;
  /** Pending action menunggu konfirmasi user */
  pendingAction?: PendingAction;
  attachment?: AIAttachment;
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: MessageContent; // string atau array multimodal (teks + gambar)
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

// 9Router lokal (OpenAI-compatible) — GRATIS, tanpa token eksternal.
const NINEROUTER_URL = process.env.AI_API_URL || "http://localhost:20128/v1";
const NINEROUTER_KEY = process.env.AI_API_KEY || "";
/** Batas putaran tool per pesan — cukup untuk "cari ID dulu, lalu aksi"
 * tanpa membiarkan model berputar terus memakan kuota. */
const MAX_TOOL_ROUNDS = 4;
const AI_TIMEOUT_MS = 45_000;
/** Suhu rendah untuk tool calling — jawaban data harus konsisten, bukan kreatif. */
const TOOL_TEMPERATURE = 0.3;

const CONFIRM_WORDS = new Set([
  "ya", "iya", "yes", "y", "ok", "oke", "okay", "okey", "lanjut", "lanjutkan", "konfirmasi", "setuju", "benar",
  "betul", "simpan", "boleh", "silakan", "siap", "sip", "gas", "yup", "yap",
]);
const CANCEL_WORDS = new Set(["batal", "batalkan", "tidak", "gak", "nggak", "enggak", "no", "cancel", "jangan"]);
/** Kata pelengkap yang boleh menyertai jawaban ya/batal ("ya simpan saja",
 * "tidak jadi", "oke deh"). */
const FILLER_WORDS = new Set(["saja", "aja", "usah", "dong", "deh", "kok", "jadi", "sudah", "udah", "kak", "min", "please", "tolong"]);

/**
 * "ya lanjut" / "oke simpan aja" = konfirmasi; "tidak jadi" = batal. Dulu cuma
 * satu kata persis yang dikenali, jadi "Ya, lanjut" diam-diam MEMBUANG aksi
 * yang sedang menunggu konfirmasi. Kalimat yang mengandung hal lain (mis.
 * "ya tapi tanggalnya ganti") tetap diteruskan ke AI.
 */
function classifyReply(text: string): "confirm" | "cancel" | null {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return null;
  const onlyFrom = (set: Set<string>) => words.every((w) => set.has(w) || FILLER_WORDS.has(w));
  if (words.some((w) => CANCEL_WORDS.has(w)) && onlyFrom(CANCEL_WORDS)) return "cancel";
  if (words.some((w) => CONFIRM_WORDS.has(w)) && onlyFrom(CONFIRM_WORDS)) return "confirm";
  return null;
}

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
 * Panggil 9Router lokal (OpenAI-compatible API) dengan dukungan tool calling.
 */
async function callAIWithTools(
  agent: AIAgent,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  toolChoice: "auto" | "none" = "auto"
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
    temperature: tools.length > 0 ? TOOL_TEMPERATURE : agent.temperature,
    max_tokens: agent.maxTokens,
    stream: false, // Disable streaming untuk menghindari SSE format
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  let response: Response;
  try {
    response = await fetch(`${NINEROUTER_URL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("9Router fetch gagal:", err);
    if ((err as { name?: string } | null)?.name === "TimeoutError") {
      throw new Error("Asisten AI tidak merespons, coba lagi sebentar lagi.");
    }
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
  const doneIndex = responseText.indexOf("\ndata: [DONE]");
  if (doneIndex !== -1) {
    responseText = responseText.slice(0, doneIndex);
  }
  if (responseText.startsWith("data: ")) {
    responseText = responseText.slice(6);
  }

  let data: { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error("9Router respons bukan JSON:", responseText.slice(0, 500));
    throw new Error("Respons Asisten AI tidak bisa dibaca, coba lagi.");
  }
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content || "",
    toolCalls: choice?.message?.tool_calls,
  };
}

export async function sendAIMessage(
  userMessage: string,
  /** Agen yang dipilih user (nova/reno/crea/fabr/finn); default NOVA. */
  agentId?: string,
  /** Gambar (struk/nota/screenshot) sebagai data URL base64 yang sudah
   * dikompres di klien (maks 1024px, lihat utils/image.ts). */
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
  // Teks boleh kosong kalau ada gambar.
  if (!text && !imageBase64) return { error: "Pesan kosong" };
  if (text.length > 8000) return { error: "Pesan terlalu panjang" };
  if (imageBase64 && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(imageBase64)) {
    return { error: "Format gambar tidak didukung." };
  }

  // Ambil profile untuk konteks
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, division")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "Profile tidak ditemukan" };

  const userContext = buildUserContext(profile);
  const agent = (agentId && getAgentById(agentId)) || getDefaultAgent();

  const reply = classifyReply(text);
  // Pesan yang membawa gambar selalu diproses sebagai pesan baru, bukan
  // jawaban "Ya"/"Batal" untuk aksi yang menunggu konfirmasi.
  const isConfirmation = !imageBase64 && reply === "confirm";
  const isCancel = !imageBase64 && reply === "cancel";

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

  // Simpan pesan user (gambar tidak disimpan, cuma penandanya di metadata)
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
  // Persona agen (agent-prompts.ts, dari main) + aturan operasional bersama.
  const personaBuilder = getAgentPromptBuilder(agent.id);
  const systemPrompt = personaBuilder
    ? `${personaBuilder(userContext)}\n\n${buildOperationalPrompt(userContext)}`
    : buildSystemPrompt(userContext);
  // Histori TANPA pesan terbaru (baris yang baru disimpan di atas) -- pesan
  // terbaru ditambahkan terpisah supaya bisa membawa gambar (multimodal).
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(history ?? [])
      .reverse()
      .slice(0, -1)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];
  if (imageBase64) {
    const contentParts: (TextContent | ImageContent)[] = [];
    if (text) contentParts.push({ type: "text", text });
    contentParts.push({ type: "image_url", image_url: { url: imageBase64, detail: "auto" } });
    messages.push({ role: "user", content: contentParts });
  } else {
    messages.push({ role: "user", content: text });
  }

  // Dua lapis: tool harus sesuai spesialisasi agen DAN akses divisi user.
  const agentToolNames = new Set(getToolsForAgent(agent.id).map((t) => t.function.name));
  const tools = getToolsForUser(userContext).filter((t) => agentToolNames.has(t.function.name));
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
