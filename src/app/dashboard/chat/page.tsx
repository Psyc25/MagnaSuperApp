import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getChatMessages } from "@/lib/chat/actions";
import { availableChatRooms, type ChatRoom } from "@/lib/chat/rooms";
import { ChatClient } from "./ChatClient";

/**
 * Halaman Chat (Tahap 37) — permintaan Owner: obrolan untuk keseluruhan tim
 * KECUALI investor, dengan @tag username yang otomatis kirim notifikasi.
 * Investor diblokir tiga lapis: di sini (redirect), di middleware.ts
 * (CHAT_PREFIX), dan di RLS `chat_messages` (migrasi 0038) — jadi tetap
 * aman walau salah satu lapis kelewatan.
 *
 * Pesan AWAL diambil di server (SSR, ikut RLS lewat createClient() biasa)
 * supaya begitu halaman terbuka riwayat obrolan langsung kelihatan tanpa
 * jeda loading — pesan-pesan BERIKUTNYA diambil lewat polling ringan dari
 * ChatClient (Client Component), sesuai keputusan Owner (bukan Realtime).
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; mention?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.division === "investor") {
    redirect("/dashboard");
  }

  const rooms = availableChatRooms(profile.division);
  const { room, mention } = await searchParams;
  const initialRoom: ChatRoom = rooms.includes(room as ChatRoom) ? (room as ChatRoom) : "bersama";
  // "?mention=username" -- deep-link dari Kantor Virtual (tombol "Chat
  // dengan X" saat dua avatar berdekatan) supaya composer sudah terisi
  // "@username " begitu halaman Chat terbuka, bukan cuma pindah ruang.
  const initialMention = mention && mention.trim().length > 0 ? mention.trim() : null;

  const { messages } = await getChatMessages(initialRoom);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-4 md:p-8">
      <div className="animate-fade-up flex shrink-0 items-start gap-4">
        <div className="relative shrink-0">
          <span
            className="absolute -inset-1.5 animate-pulse rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 opacity-30 blur-lg"
            aria-hidden
          />
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-sm">
            <MessageSquare className="h-6 w-6" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-500 dark:text-indigo-400">
            Chat
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Obrolan Tim
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Ketik <span className="font-semibold text-zinc-700 dark:text-zinc-300">@nama panggilan</span> untuk menandai
            rekan kerja — otomatis mengirim notifikasi ke orang yang ditandai.
          </p>
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1">
        <ChatClient
          rooms={rooms}
          initialRoom={initialRoom}
          initialMessages={messages}
          initialMention={initialMention}
          currentUser={{
            id: profile.id,
            username: profile.username,
            fullName: profile.full_name,
            division: profile.division,
          }}
        />
      </div>
    </div>
  );
}
