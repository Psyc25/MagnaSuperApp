import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getAIMessages } from "@/lib/ai/actions";
import { getAgentById, getDefaultAgent } from "@/lib/ai/agents";
import { AIAssistantClient } from "./AIAssistantClient";

/**
 * Halaman AI Assistant — terkoneksi ke 9Router, gateway AI lokal GRATIS.
 * Terbuka untuk SEMUA divisi TERMASUK investor. Percakapan bersifat PRIBADI
 * per-user. Mendukung multiple AI agents (NOVA, RENO, CREA, FABR, FINN).
 */
export default async function AIAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/dashboard");
  }

  const { messages } = await getAIMessages();
  const params = await searchParams;
  const agentId = params.agent;
  const agent = agentId ? getAgentById(agentId) ?? getDefaultAgent() : getDefaultAgent();

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-4 md:p-8">
      <div className="animate-fade-up flex shrink-0 items-start gap-4">
        <div className="relative shrink-0">
          <span
            className={`absolute -inset-1.5 animate-pulse rounded-2xl bg-gradient-to-br ${agent.color} opacity-30 blur-lg`}
            aria-hidden
          />
          <div className={`relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${agent.color} text-white shadow-sm`}>
            <span className="text-2xl">{agent.icon}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-500 dark:text-violet-400">
            AI Agents
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            {agent.name}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            {agent.description}
          </p>
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1">
        <AIAssistantClient
          initialMessages={messages}
          userName={profile.full_name}
          initialAgentId={agentId}
        />
      </div>
    </div>
  );
}
