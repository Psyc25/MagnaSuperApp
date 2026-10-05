import { redirect } from "next/navigation";
import { Bot } from "lucide-react";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getAIMessages } from "@/lib/ai/actions";
import { AIAssistantClient } from "./AIAssistantClient";

/**
 * Halaman Asisten AI (Tahap 80) — terkoneksi ke 9Router/Hermes, gateway AI
 * self-hosted milik Magna. Terbuka untuk SEMUA divisi TERMASUK investor
 * (beda dari Chat tim yang menutup investor). Percakapan bersifat PRIBADI
 * per-user, tidak ada akses lintas-user.
 */
export default async function AIAssistantPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/dashboard");
  }

  const { messages } = await getAIMessages();

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-4 md:p-8">
      <div className="animate-fade-up flex shrink-0 items-start gap-4">
        <div className="relative shrink-0">
          <span
            className="absolute -inset-1.5 animate-pulse rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 opacity-30 blur-lg"
            aria-hidden
          />
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
            <Bot className="h-6 w-6" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-500 dark:text-violet-400">
            Hermes AI
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Asisten AI
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Tanya apa saja seputar operasional bisnis, analisis data, atau fitur aplikasi.
          </p>
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1">
        <AIAssistantClient
          initialMessages={messages}
          userName={profile.full_name}
        />
      </div>
    </div>
  );
}
