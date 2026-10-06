/**
 * Konfigurasi penyedia AI (OpenAI-compatible) dari environment variable.
 *
 * Dulu kode terkunci ke 9Router lokal (http://localhost:20128) dengan nama
 * model khusus 9Router ("gh/gpt-4o-mini-..."): di Vercel localhost tidak
 * terjangkau sehingga Asisten AI di production selalu "tidak tersedia",
 * dan mengarahkan AI_API_URL ke penyedia lain tetap gagal karena nama
 * modelnya tidak dikenal di sana. Sekarang:
 *
 *   AI_API_URL  base URL OpenAI-compatible, mis. https://openrouter.ai/api/v1,
 *               https://api.openai.com/v1, https://api.groq.com/openai/v1
 *   AI_API_KEY  API key penyedia tsb (wajib untuk penyedia cloud)
 *   AI_MODEL    (opsional) model untuk SEMUA agen; kalau kosong dipilih
 *               default yang cocok untuk penyedianya
 *
 * Modul murni (tanpa import server) supaya bisa diuji unit.
 */

export const DEFAULT_LOCAL_AI_URL = "http://localhost:20128/v1";

export type AIConfig = {
  baseUrl: string;
  apiKey: string;
  provider: "9router" | "openrouter" | "openai" | "groq" | "other";
  /** null = pakai model bawaan agen (khusus 9Router). */
  model: string | null;
  available: boolean;
  /** Alasan untuk ditampilkan ke user kalau `available` false. */
  unavailableReason?: string;
  extraHeaders: Record<string, string>;
};

type Env = Record<string, string | undefined>;

const DEFAULT_MODEL_BY_PROVIDER: Record<AIConfig["provider"], string | null> = {
  "9router": null,
  openrouter: "openai/gpt-4o-mini",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  other: null,
};

function detectProvider(baseUrl: string): AIConfig["provider"] {
  let host = "";
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return "other";
  }
  if (host === "localhost" || host === "127.0.0.1" || baseUrl.includes(":20128")) return "9router";
  if (host.endsWith("openrouter.ai")) return "openrouter";
  if (host === "api.openai.com") return "openai";
  if (host.endsWith("groq.com")) return "groq";
  return "other";
}

export function resolveAIConfig(env: Env): AIConfig {
  const baseUrl = (env.AI_API_URL?.trim() || DEFAULT_LOCAL_AI_URL).replace(/\/+$/, "");
  const apiKey = env.AI_API_KEY?.trim() ?? "";
  const provider = detectProvider(baseUrl);
  const model = env.AI_MODEL?.trim() || DEFAULT_MODEL_BY_PROVIDER[provider];
  const isProduction = env.NODE_ENV === "production";

  const extraHeaders: Record<string, string> = {};
  if (provider === "openrouter") {
    // Opsional di OpenRouter, dipakai untuk identifikasi aplikasi di dasbornya.
    if (env.NEXT_PUBLIC_SITE_URL) extraHeaders["HTTP-Referer"] = env.NEXT_PUBLIC_SITE_URL;
    extraHeaders["X-Title"] = "MagnaSuperApp";
  }

  let unavailableReason: string | undefined;
  if (provider === "9router" && isProduction) {
    unavailableReason =
      "Asisten AI belum dikonfigurasi untuk server online. Admin perlu mengisi AI_API_URL dan AI_API_KEY (penyedia OpenAI-compatible, mis. OpenRouter) di Environment Variables Vercel, lalu redeploy.";
  } else if (provider !== "9router" && !apiKey) {
    unavailableReason = "AI_API_KEY belum diisi untuk penyedia AI yang dipakai. Hubungi admin.";
  } else if (provider === "other" && !model) {
    unavailableReason = "AI_MODEL belum diisi untuk penyedia AI yang dipakai. Hubungi admin.";
  }

  return { baseUrl, apiKey, provider, model, available: !unavailableReason, unavailableReason, extraHeaders };
}

/** Model yang dikirim ke penyedia untuk agen tertentu. */
export function modelForAgent(config: AIConfig, agentModel: string): string {
  return config.model ?? agentModel;
}
