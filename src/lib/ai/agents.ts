/**
 * Konfigurasi AI Agents untuk MagnaSuperApp.
 * Fokus pada model GRATIS dan HEMAT TOKEN dengan kinerja baik.
 */

export type AIAgent = {
  id: string;
  name: string;
  description: string;
  provider: "openrouter" | "local";
  model: string;
  icon: string;
  color: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
};

const BASE_SYSTEM_PROMPT = `Kamu adalah asisten AI untuk MagnaSuperApp. Jawab singkat, padat, dan dalam Bahasa Indonesia. Gunakan bullet points jika perlu.`;

export const AI_AGENTS: AIAgent[] = [
  // === GRATIS & Hemat Token ===
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    description: "Gratis! Coding & analisis terbaik",
    provider: "openrouter",
    model: "deepseek/deepseek-chat",
    icon: "🔮",
    color: "from-violet-500 to-purple-600",
    systemPrompt: BASE_SYSTEM_PROMPT,
    maxTokens: 2048,
    temperature: 0.7,
  },
  {
    id: "qwen-coder",
    name: "Qwen Coder",
    description: "Gratis! Spesialis coding",
    provider: "openrouter",
    model: "qwen/qwen-2.5-coder-32b-instruct",
    icon: "💻",
    color: "from-cyan-500 to-blue-500",
    systemPrompt: BASE_SYSTEM_PROMPT,
    maxTokens: 2048,
    temperature: 0.5,
  },
  {
    id: "llama-3.3-70b",
    name: "Llama 3.3 70B",
    description: "Gratis! Model terbaru Meta",
    provider: "openrouter",
    model: "meta-llama/llama-3.3-70b-instruct",
    icon: "🦙",
    color: "from-blue-500 to-indigo-600",
    systemPrompt: BASE_SYSTEM_PROMPT,
    maxTokens: 2048,
    temperature: 0.7,
  },
  {
    id: "gemini-flash",
    name: "Gemini Flash",
    description: "Gratis! Cepat dari Google",
    provider: "openrouter",
    model: "google/gemini-2.0-flash-exp:free",
    icon: "⚡",
    color: "from-amber-500 to-orange-500",
    systemPrompt: BASE_SYSTEM_PROMPT,
    maxTokens: 2048,
    temperature: 0.7,
  },
  {
    id: "mistral-nemo",
    name: "Mistral Nemo",
    description: "Gratis! Ringan & cepat",
    provider: "openrouter",
    model: "mistralai/mistral-nemo",
    icon: "🌊",
    color: "from-sky-500 to-blue-600",
    systemPrompt: BASE_SYSTEM_PROMPT,
    maxTokens: 2048,
    temperature: 0.7,
  },
  // === Premium (Murah) ===
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Murah & handal dari OpenAI",
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    icon: "🤖",
    color: "from-emerald-500 to-teal-500",
    systemPrompt: BASE_SYSTEM_PROMPT,
    maxTokens: 2048,
    temperature: 0.7,
  },
  {
    id: "claude-haiku",
    name: "Claude Haiku",
    description: "Murah & cepat dari Anthropic",
    provider: "openrouter",
    model: "anthropic/claude-3-haiku",
    icon: "🧠",
    color: "from-orange-500 to-red-500",
    systemPrompt: BASE_SYSTEM_PROMPT,
    maxTokens: 2048,
    temperature: 0.7,
  },
  // === Local ===
  {
    id: "hermes-local",
    name: "Hermes Local",
    description: "Model lokal (9Router/Ollama)",
    provider: "local",
    model: "hermes",
    icon: "🏠",
    color: "from-zinc-500 to-zinc-700",
    systemPrompt: BASE_SYSTEM_PROMPT,
    maxTokens: 2048,
    temperature: 0.7,
  },
];

export function getAgentById(id: string): AIAgent | undefined {
  return AI_AGENTS.find((agent) => agent.id === id);
}

export function getDefaultAgent(): AIAgent {
  return AI_AGENTS[0]; // DeepSeek V3 - gratis & powerful
}
