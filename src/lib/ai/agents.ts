/**
 * Konfigurasi AI Agents untuk MagnaSuperApp.
 * 5 specialized agents, masing-masing dengan keahlian berbeda.
 * Menggunakan 9Router lokal — GRATIS!
 */

export type AIAgent = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  provider: "9router";
  model: string;
  icon: string;
  color: string;
  specialty: string[];
  maxTokens: number;
  temperature: number;
};

/**
 * AI Agents roster:
 * - NOVA: General assistant (all modules)
 * - RENO: Rental specialist (Magnarent)
 * - CREA: Creative partner (Magnative)
 * - FABR: Production expert (Production)
 * - FINN: Finance analyst (Finance)
 */
export const AI_AGENTS: AIAgent[] = [
  {
    id: "nova",
    name: "NOVA",
    shortName: "NOVA",
    description: "Your intelligent operations partner",
    provider: "9router",
    model: "gh/gpt-4o-mini-2024-07-18",
    icon: "◆",
    color: "from-indigo-500 to-violet-600",
    specialty: ["all"],
    maxTokens: 4096,
    temperature: 0.7,
  },
  {
    id: "reno",
    name: "RENO",
    shortName: "RENO",
    description: "Rental & inventory specialist",
    provider: "9router",
    model: "gh/gpt-4o-mini-2024-07-18",
    icon: "🏠",
    color: "from-emerald-500 to-teal-600",
    specialty: ["magnarent"],
    maxTokens: 4096,
    temperature: 0.5,
  },
  {
    id: "crea",
    name: "CREA",
    shortName: "CREA",
    description: "Creative & client partner",
    provider: "9router",
    model: "gh/gpt-4o-mini-2024-07-18",
    icon: "🎨",
    color: "from-fuchsia-500 to-pink-600",
    specialty: ["magnative"],
    maxTokens: 4096,
    temperature: 0.7,
  },
  {
    id: "fabr",
    name: "FABR",
    shortName: "FABR",
    description: "Production & materials expert",
    provider: "9router",
    model: "gh/gpt-4o-mini-2024-07-18",
    icon: "🔧",
    color: "from-amber-500 to-orange-600",
    specialty: ["production"],
    maxTokens: 4096,
    temperature: 0.5,
  },
  {
    id: "finn",
    name: "FINN",
    shortName: "FINN",
    description: "Finance & analytics analyst",
    provider: "9router",
    model: "gh/gpt-4o-mini-2024-07-18",
    icon: "📊",
    color: "from-blue-500 to-cyan-600",
    specialty: ["finance"],
    maxTokens: 4096,
    temperature: 0.5,
  },
];

export function getAgentById(id: string): AIAgent | undefined {
  return AI_AGENTS.find((agent) => agent.id === id);
}

export function getDefaultAgent(): AIAgent {
  return AI_AGENTS[0]; // NOVA
}

export function getAgentBySpecialty(specialty: string): AIAgent | undefined {
  if (specialty === "all") return AI_AGENTS[0];
  return AI_AGENTS.find((agent) => agent.specialty.includes(specialty));
}
