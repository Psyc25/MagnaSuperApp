"use client";

import { AI_AGENTS, type AIAgent } from "@/lib/ai/agents";
import { cn } from "@/lib/cn";

type AgentSelectorProps = {
  selectedId: string;
  onSelect: (agent: AIAgent) => void;
  compact?: boolean;
};

export function AgentSelector({ selectedId, onSelect, compact = false }: AgentSelectorProps) {
  if (compact) {
    // Compact mode: horizontal pills
    return (
      <div className="flex flex-wrap gap-1.5">
        {AI_AGENTS.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onSelect(agent)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
              selectedId === agent.id
                ? `bg-gradient-to-r ${agent.color} text-white shadow-sm`
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            )}
          >
            <span>{agent.icon}</span>
            <span>{agent.shortName}</span>
          </button>
        ))}
      </div>
    );
  }

  // Full mode: cards with descriptions
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {AI_AGENTS.map((agent) => (
        <button
          key={agent.id}
          onClick={() => onSelect(agent)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-all",
            selectedId === agent.id
              ? `border-transparent bg-gradient-to-br ${agent.color} text-white shadow-lg`
              : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
          )}
        >
          <span className="text-2xl">{agent.icon}</span>
          <span className="text-sm font-bold">{agent.name}</span>
          <span className={cn(
            "text-[10px] leading-tight",
            selectedId === agent.id ? "text-white/80" : "text-zinc-500"
          )}>
            {agent.description}
          </span>
        </button>
      ))}
    </div>
  );
}

// Single agent badge for display
export function AgentBadge({ agent, size = "sm" }: { agent: AIAgent; size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        `bg-gradient-to-r ${agent.color} text-white`,
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"
      )}
    >
      <span>{agent.icon}</span>
      <span>{agent.shortName}</span>
    </div>
  );
}
