"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, X } from "lucide-react";
import { listUnreadImportantNotifications, markNotificationRead } from "@/lib/notifications/actions";
import type { AppNotification } from "@/lib/notifications/types";

const POLL_MS = 30_000;

/**
 * Banner mencolok untuk notifikasi "penting" (migrasi 0062) -- saat ini
 * cuma dipakai "Event Baru" (lihat createEvent di lib/events/actions.ts),
 * SENGAJA terpisah dari `NotificationInbox` (lonceng di Topbar) yang
 * baur dengan notifikasi rutin lain (booking baru, stok menipis, dst) --
 * permintaan Owner: notifikasi event baru harus "beda karena itu
 * notifikasi penting".
 *
 * Dipasang di AppShell (sama posisi seperti `MaintenanceBanner`, gaya
 * visual sengaja disamakan: gradient + shimmer) supaya tampil di SEMUA
 * halaman dashboard, bukan cuma satu modul. Poll ringan 30 detik (lebih
 * cepat dari NotificationInbox yang 45 detik, karena ini memang dibuat
 * untuk terasa "segera") -- query-nya sendiri kecil (limit 10, lihat
 * `listUnreadImportantNotifications`), jadi aman untuk interval sesering
 * ini.
 *
 * HANYA menampilkan SATU notifikasi tidak terbaca dalam satu waktu (yang
 * paling baru) -- kalau ada lebih dari satu, sisanya tetap ada di
 * `NotificationInbox` biasa, banner cuma untuk "yang paling butuh
 * perhatian sekarang" supaya tidak menumpuk banner bertingkat-tingkat di
 * atas layar.
 */
export function ImportantNotificationBanner() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listUnreadImportantNotifications().then((fetched) => {
        if (!cancelled) setItems(fetched);
      });
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const current = items[0];
  if (!current) return null;

  function removeFromQueue(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleOpen() {
    removeFromQueue(current.id);
    void markNotificationRead(current.id);
    if (current.url) router.push(current.url);
  }

  function handleDismiss() {
    removeFromQueue(current.id);
    // Ditutup TANPA dibuka = tetap ditandai dibaca, supaya tidak nongol lagi
    // di poll berikutnya -- staf yang cuma mau "oke, saya lihat nanti" tidak
    // dipaksa banner yang sama muncul terus tiap 30 detik. Riwayatnya tetap
    // ada di NotificationInbox biasa kalau mau dibuka lagi.
    void markNotificationRead(current.id);
  }

  return (
    <div className="relative flex items-center gap-3 overflow-hidden bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 px-4 py-3 text-white shadow-lg">
      <span className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <CalendarClock className="h-5 w-5 shrink-0 animate-pulse" aria-hidden />
      <button type="button" onClick={handleOpen} className="relative min-w-0 flex-1 text-left">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">Penting — {current.title}</p>
        <p className="truncate text-xs font-semibold sm:text-sm">{current.body}</p>
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Tutup pemberitahuan"
        className="relative shrink-0 rounded-full p-1.5 transition-colors hover:bg-white/20"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
