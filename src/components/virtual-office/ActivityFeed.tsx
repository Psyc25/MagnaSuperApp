"use client";

import { useEffect, useState } from "react";
import { Bell, Clock, Rocket } from "lucide-react";
import { listMyNotifications } from "@/lib/notifications/actions";
import type { AppNotification } from "@/lib/notifications/types";
import { ROOM_ACTIVITY_COLORS, ROOM_ACTIVITY_LABELS, type RoomHighlight } from "@/lib/virtual-office/house";

const POLL_MS = 60_000;
const MAX_ITEMS = 12;

/** Format "X menit/jam lalu" sederhana -- pola yang sama dengan `timeAgo`
 * di DeliveryScheduleModal.tsx, sengaja modul lokal (bukan di-share)
 * biar komponen ini berdiri sendiri tanpa dependensi lintas fitur. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes}m lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}j lalu`;
  return `${Math.floor(hours / 24)}h lalu`;
}

/**
 * Feed aktivitas kantor -- ide dari referensi visual yang dikirim Owner
 * (Okt 2026): ruangan isometrik di satu sisi, "feed" update kerjaan
 * dikemas kayak postingan sosmed di sisi lain. Cuma bagian FEED-nya yang
 * diterapkan di sini -- dibangun 100% dari data yang SUDAH ADA
 * (`listMyNotifications`, fungsi yang sama dipakai NotificationInbox &
 * ImportantNotificationBanner), tanpa tabel/migrasi baru. Bagian visual
 * ruangan isometrik di referensi SENGAJA tidak ditiru: itu gaya aset
 * premium (dibeli/lisensi), sedangkan Kantor Virtual sengaja 100%
 * digambar lewat kode (lihat draw2d.ts) -- jadi gaya chunky pixel-art
 * yang sudah ada dipertahankan, bukan ditulis ulang di sini.
 *
 * Bukan media sosial beneran -- nggak ada like/comment sungguhan, itu di
 * referensi cuma bingkai visual. Ini murni daftar notifikasi, dikemas
 * sebagai chat bubble/pill biar kerasa "hidup", dipasang di sebelah
 * kanvas Kantor Virtual (lihat VirtualOfficeClient).
 */
export function ActivityFeed({ roomHighlights = [] }: { roomHighlights?: RoomHighlight[] }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { items: rows } = await listMyNotifications();
      if (!cancelled) {
        setItems(rows.slice(0, MAX_ITEMS));
        setLoaded(true);
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex h-full min-h-[200px] flex-col rounded-2xl border border-white/10 bg-slate-950 shadow-2xl lg:min-h-[280px]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Bell className="h-4 w-4 text-violet-400" />
        <span className="text-sm font-bold text-white">Aktivitas Kantor</span>
      </div>
      {/* Ringkasan ruangan yang lagi "menonjol" sekarang (dikirim live
       * dari VirtualOfficeClient, lihat computeOfficeSnapshot di sana) --
       * ini yang bikin feed kerasa nyambung ke kondisi kantor beneran
       * (permintaan Owner: "feed harus menceritakan keadaan kantor"),
       * bukan cuma daftar notifikasi lama yang generik. Kosong kalau
       * semua ruangan sepi -- tidak dipaksa selalu tampil. */}
      {roomHighlights.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-white/10 px-3 py-2">
          {roomHighlights.map((r) => (
            <span
              key={r.roomId}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
              style={{ backgroundColor: `${ROOM_ACTIVITY_COLORS[r.activity]}26` }}
            >
              {r.icon} {r.label} · {r.occupantCount} · {ROOM_ACTIVITY_LABELS[r.activity]}
            </span>
          ))}
        </div>
      )}
      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {!loaded && <p className="px-1 text-xs text-white/40">Memuat...</p>}
        {loaded && items.length === 0 && <p className="px-1 text-xs text-white/40">Belum ada aktivitas.</p>}
        {items.map((n) => (
          <ActivityRow key={n.id} notification={n} />
        ))}
      </div>
    </div>
  );
}


function ActivityRow({ notification }: { notification: AppNotification }) {
  if (notification.isImportant) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3.5 py-2 text-xs font-bold text-white shadow">
        <Rocket className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{notification.title}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-white/5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-800 text-[11px] font-bold text-white/70">
        <Clock className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-white">{notification.title}</p>
        {notification.body && <p className="truncate text-[11px] text-white/50">{notification.body}</p>}
        <p className="text-[10px] text-white/30">{timeAgo(notification.createdAt)}</p>
      </div>
    </div>
  );
}
