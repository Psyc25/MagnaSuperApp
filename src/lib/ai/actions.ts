"use server";

import { createClient } from "@/lib/supabase/server";
import { getAgentById, getDefaultAgent, type AIAgent } from "./agents";
import { getAgentPromptBuilder } from "./agent-prompts";
import { buildOperationalPrompt, buildSystemPrompt, buildUserContext } from "./system-prompt";
import { getToolsForAgent, getToolsForUser } from "./tools";
import { executeToolCall } from "./tool-handlers";
import { classifyReply } from "./reply-classifier";
import { modelForAgent, resolveAIConfig } from "./config";
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

// Penyedia AI OpenAI-compatible dari env (AI_API_URL/AI_API_KEY/AI_MODEL) --
// 9Router lokal saat development, penyedia cloud (mis. OpenRouter) di
// production. Lihat src/lib/ai/config.ts.
const AI_CONFIG = resolveAIConfig(process.env);
/** Batas putaran tool per pesan — cukup untuk "cari ID dulu, lalu aksi"
 * tanpa membiarkan model berputar terus memakan kuota. Diturunkan dari 4
 * ke 2 (2026-10-06) -- provider gratis (mis. Groq) punya limit token/menit
 * yang ketat dan dibagi SELURUH aplikasi, jadi tiap putaran tool mahal;
 * 2 putaran masih cukup untuk "cari ID -> aksi" tapi memotong separuh
 * potensi pemakaian token per obrolan dibanding 4. */
const MAX_TOOL_ROUNDS = 2;
const AI_TIMEOUT_MS = 45_000;
/** Suhu rendah untuk tool calling — jawaban data harus konsisten, bukan kreatif. */
const TOOL_TEMPERATURE = 0.3;


export async function getAIMessages(
  /** Agen yang sedang dibuka (nova/reno/crea/fabr/finn); default NOVA.
   * Tiap agen punya riwayat chat sendiri -- lihat kolom agent_id (migrasi
   * add_agent_id_to_ai_assistant_messages, 2026-10-07). */
  agentId?: string
): Promise<{ messages: AIMessage[]; error?: string; notice?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { messages: [], error: "Tidak terautentikasi" };
  }

  const agent = (agentId && getAgentById(agentId)) || getDefaultAgent();

  const { data, error } = await supabase
    .from("ai_assistant_messages")
    .select("id, role, content, created_at, metadata")
    .eq("user_id", user.id)
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    if (error.code === "42P01") {
      return { messages: [], error: "Tabel AI belum dibuat. Jalankan migrasi SQL di Supabase Dashboard." };
    }
    return { messages: [], error: error.message };
  }

  return {
    // Diberi tahu sejak halaman dibuka, bukan baru setelah user mengetik.
    notice: AI_CONFIG.available ? undefined : AI_CONFIG.unavailableReason,
    messages: (data ?? []).map((row) => ({
      id: row.id,
      role: row.role as "user" | "assistant",
      content: row.content,
      createdAt: row.created_at,
      agentId: agent.id,
      pendingAction: row.metadata?.pendingAction as PendingAction | undefined,
    })),
  };
}

/**
 * Panggil penyedia AI (OpenAI-compatible API) dengan dukungan tool calling.
 */
async function callAIWithTools(
  agent: AIAgent,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  toolChoice: "auto" | "none" = "auto"
): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...AI_CONFIG.extraHeaders,
  };
  if (AI_CONFIG.apiKey) {
    headers["Authorization"] = `Bearer ${AI_CONFIG.apiKey}`;
  }

  const model = modelForAgent(AI_CONFIG, agent.model);
  const body: Record<string, unknown> = {
    model,
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
    response = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`[ai] fetch ke ${AI_CONFIG.provider} gagal:`, err);
    if ((err as { name?: string } | null)?.name === "TimeoutError") {
      throw new Error("Asisten AI tidak merespons, coba lagi sebentar lagi.");
    }
    throw new Error(
      AI_CONFIG.provider === "9router"
        ? "AI tidak tersedia. Pastikan 9Router berjalan di localhost:20128, atau isi AI_API_URL/AI_API_KEY ke penyedia AI online."
        : "Layanan AI tidak bisa dihubungi. Coba lagi sebentar lagi."
    );
  }

  if (!response.ok) {
    const errText = await response.text();
    // Detail mentah hanya ke log server -- pesan ke user dibuat jelas tanpa
    // membocorkan respons penyedia.
    console.error(`[ai] ${AI_CONFIG.provider} API error:`, response.status, errText.slice(0, 500));

    if (response.status === 401 || response.status === 403) {
      throw new Error("API key AI tidak valid atau tidak punya akses. Admin perlu memeriksa AI_API_KEY.");
    }
    if (response.status === 402) throw new Error("Kredit/saldo penyedia AI habis. Admin perlu mengisi ulang.");
    if (response.status === 404) throw new Error(`Model AI "${model}" tidak dikenal penyedia. Admin perlu memeriksa AI_MODEL.`);
    if (response.status === 429) throw new Error("Batas pemakaian AI tercapai, coba lagi beberapa saat lagi.");
    if (response.status >= 500) throw new Error("Layanan AI sedang bermasalah, coba lagi sebentar lagi.");
    throw new Error("Permintaan ke AI ditolak. Coba ulangi dengan pesan yang lebih singkat.");
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
    console.error("[ai] respons penyedia bukan JSON:", responseText.slice(0, 500));
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
  if (!AI_CONFIG.available) {
    return { error: AI_CONFIG.unavailableReason ?? "Asisten AI belum dikonfigurasi." };
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
    .eq("agent_id", agent.id)
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

    await supabase.from("ai_assistant_messages").insert({ user_id: user.id, agent_id: agent.id, role: "user", content: text });

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
      .insert({ user_id: user.id, agent_id: agent.id, role: "assistant", content: responseContent, metadata: {} })
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
    await supabase.from("ai_assistant_messages").insert({ user_id: user.id, agent_id: agent.id, role: "user", content: text });
    const { data: cancelMsg, error: cancelErr } = await supabase
      .from("ai_assistant_messages")
      .insert({ user_id: user.id, agent_id: agent.id, role: "assistant", content: "Baik, aksi dibatalkan. Tidak ada data yang diubah.", metadata: {} })
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
    .insert({ user_id: user.id, agent_id: agent.id, role: "user", content: text || "(gambar)", metadata: userMsgMetadata })
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
    .eq("agent_id", agent.id)
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
    .insert({ user_id: user.id, agent_id: agent.id, role: "assistant", content: finalContent, metadata })
    .select("id, role, content, created_at, metadata")
    .single();

  if (assistantErr) return { error: "Gagal menyimpan respons" };

  return {
    message: {
      id: assistantMsg.id,
      role: "assistant",
      content: assistantMsg.content,
      createdAt: assistantMsg.created_at,
      agentId: agent.id,
      pendingAction: pendingActionToSave,
    },
  };
}

export async function clearAIHistory(
  /** Hapus riwayat agen ini saja (nova/reno/crea/fabr/finn). Kalau kosong,
   * hapus SEMUA riwayat user di semua agen -- dipakai cuma untuk kasus lama,
   * UI sekarang selalu kirim agen yang sedang dibuka. */
  agentId?: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Tidak terautentikasi" };

  let query = supabase.from("ai_assistant_messages").delete().eq("user_id", user.id);
  const agent = agentId ? getAgentById(agentId) : undefined;
  if (agent) query = query.eq("agent_id", agent.id);

  const { error } = await query;

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
