"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck, Loader2 } from "lucide-react";
import { listMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";
import type { AppNotification } from "@/lib/notifications/types";
import { useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

const POLL_MS = 45_000;

function relativeTime(iso: string, t: (s: string) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t("Baru saja");
  if (minutes < 60) return `${minutes} ${t("menit lalu")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${t("jam lalu")}`;
  const days = Math.floor(hours / 24);
  return `${days} ${t("hari lalu")}`;
}

/**
 * Kotak masuk notifikasi in-app (Update Opsional 1, item 1 & 6) — persis
 * di sebelah Pencarian Global di Topbar, menggantikan lonceng Web Push
 * lama (`PushNotificationBell`, sekarang dipindah jadi toggle biasa di
 * Pengaturan, lihat `PushToggleSettingsForm`). Beda dari Web Push yang
 * ephemeral/browser-only, daftar di sini PERSISTEN (tabel `notifications`,
 * migrasi 0055) — jadi kejadian bisnis (booking baru, event baru, dst)
 * selalu tercatat & terlihat di sini, terlepas dari apakah staf yang
 * bersangkutan pernah mengaktifkan Web Push atau tidak.
 *
 * Polling ringan (bukan realtime channel) setiap 45 detik supaya lencana
 * jumlah belum dibaca tetap mutakhir walau dropdown-nya sedang tertutup —
 * cukup murah karena query-nya cuma dua SELECT kecil yang sudah dibatasi
 * RLS (lihat `listMyNotifications`), pola sama seperti `usePushSubscription`.
 */
export function NotificationInbox() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const { items: fetched, unreadCount: unread } = await listMyNotifications();
    setItems(fetched);
    setUnreadCount(unread);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listMyNotifications().then(({ items: fetched, unreadCount: unread }) => {
        if (cancelled) return;
        setItems(fetched);
        setUnreadCount(unread);
      });
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await refresh();
      setLoading(false);
    }
  }

  async function handleSelect(item: AppNotification) {
    if (!item.isRead) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      void markNotificationRead(item.id);
    }
    if (item.url) {
      setOpen(false);
      router.push(item.url);
    }
  }

  async function handleMarkAllRead() {
    const unreadIds = items.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    void markAllNotificationsRead(unreadIds);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-full border border-black/5 bg-white text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5",
          unreadCount > 0 && "text-indigo-600 dark:text-indigo-400"
        )}
        aria-label={t("Notifikasi")}
      >
        {unreadCount > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={cn("animate-fade-in fixed inset-x-4 top-[4.5rem] z-40 overflow-hidden rounded-2xl border shadow-xl shadow-black/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:z-auto sm:mt-2 sm:w-96", GLASS_SURFACE, GLASS_BORDER)}>
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{t("Notifikasi")}</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t("Tandai semua dibaca")}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
                {t("Belum ada notifikasi.")}
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 border-b border-black/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-zinc-50 dark:border-white/5 dark:hover:bg-white/5",
                    !item.isRead && "bg-indigo-50/50 dark:bg-indigo-500/5"
                  )}
                >
                  <div className="flex w-full items-center gap-2">
                    {!item.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />}
                    <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {item.title}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{item.body}</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{relativeTime(item.createdAt, t)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
