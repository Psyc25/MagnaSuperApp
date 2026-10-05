/**
 * Konfigurasi AI Agent untuk MagnaSuperApp.
 * Menggunakan 9Router lokal — GRATIS, tidak pakai token eksternal!
 */

export type AIAgent = {
  id: string;
  name: string;
  description: string;
  provider: "9router";
  model: string;
  icon: string;
  color: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
};

const BASE_SYSTEM_PROMPT = `Kamu adalah asisten AI untuk MagnaSuperApp. Jawab singkat, padat, dan dalam Bahasa Indonesia. Gunakan bullet points jika perlu.`;

/**
 * Default agent menggunakan 9Router lokal.
 * GRATIS karena pakai server sendiri!
 */
export const AI_AGENTS: AIAgent[] = [
  {
    id: "9router-gpt4o-mini",
    name: "GPT-4o Mini",
    description: "Model cepat via 9Router lokal",
    provider: "9router",
    model: "gh/gpt-4o-mini-2024-07-18",
    icon: "🚀",
    color: "from-violet-500 to-purple-600",
    systemPrompt: BASE_SYSTEM_PROMPT,
    maxTokens: 4096,
    temperature: 0.7,
  },
];

export function getAgentById(id: string): AIAgent | undefined {
  return AI_AGENTS.find((agent) => agent.id === id);
}

export function getDefaultAgent(): AIAgent {
  return AI_AGENTS[0];
}
