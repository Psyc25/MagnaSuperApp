"use server";

import { createClient } from "@/lib/supabase/server";
import { AI_AGENTS, getAgentById, getDefaultAgent, type AIAgent } from "./agents";

export type AIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  agentId?: string;
};

type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const LOCAL_AI_URL = process.env.AI_API_URL || "http://localhost:20128/v1";

export { AI_AGENTS };

export async function getAIMessages(): Promise<{ messages: AIMessage[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { messages: [], error: "Tidak terautentikasi" };
  }

  const { data, error } = await supabase
    .from("ai_assistant_messages")
    .select("id, role, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    // Table might not exist - return empty without error for better UX
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
    })),
  };
}

async function callAI(agent: AIAgent, messages: ChatCompletionMessage[]): Promise<string> {
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

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: agent.model,
      messages,
      temperature: agent.temperature,
      max_tokens: agent.maxTokens,
    }),
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
  return data.choices?.[0]?.message?.content || "Tidak ada respons";
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

  const agent = agentId ? getAgentById(agentId) : getDefaultAgent();
  if (!agent) return { error: "Agent tidak ditemukan" };

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

  const messages: ChatCompletionMessage[] = [
    { role: "system", content: agent.systemPrompt },
    ...((history ?? []).reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))),
  ];

  // Panggil AI
  let content: string;
  try {
    content = await callAI(agent, messages);
  } catch (err) {
    await supabase.from("ai_assistant_messages").delete().eq("id", userMsg.id);
    return { error: err instanceof Error ? err.message : "Gagal menghubungi AI" };
  }

  // Simpan respons
  const { data: assistantMsg, error: assistantErr } = await supabase
    .from("ai_assistant_messages")
    .insert({ user_id: user.id, role: "assistant", content })
    .select("id, role, content, created_at")
    .single();

  if (assistantErr) return { error: "Gagal menyimpan respons" };

  return {
    message: {
      id: assistantMsg.id,
      role: "assistant",
      content: assistantMsg.content,
      createdAt: assistantMsg.created_at,
      agentId: agent.id,
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
