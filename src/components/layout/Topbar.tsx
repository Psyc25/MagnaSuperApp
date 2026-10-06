"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronDown, User as UserIcon } from "lucide-react";
import { signOut } from "@/lib/supabase/actions";
import { formatDisplayName } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_PILL, GLASS_SURFACE_STRONG } from "@/lib/glass";
import { DIVISION_LABELS, type Profile } from "@/lib/supabase/types";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { NotificationInbox } from "@/components/notifications/NotificationInbox";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Bar atas persisten di seluruh /dashboard/** — dipasang di AppShell,
 * bukan per-halaman, jadi tidak remount saat pindah modul. Menampilkan
 * identitas pengguna yang sedang login (dari profiles table Supabase) dan
 * tombol "Keluar". `user` bisa null sesaat (mis. trigger profiles belum
 * sempat jalan) — ditangani dengan fallback yang tetap masuk akal.
 */
function greetingForHour(hour: number): string {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

const subscribeNothing = () => () => {};
const browserGreeting = () => greetingForHour(new Date().getHours());

export function Topbar({ user }: { user: (Profile & { email: string }) | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  // Sapaan netral di server (jam server ≠ jam browser) supaya tidak ada
  // hydration mismatch; di browser langsung mengikuti jam si pengguna.
  const greeting = useSyncExternalStore(subscribeNothing, browserGreeting, () => "Halo");

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const displayName = formatDisplayName(user?.full_name, user?.email) || t("Pengguna");
  const email = user?.email ?? "";


  // Berhenti berlangganan Web Push di perangkat ini sebelum keluar, supaya
  // notifikasi akun ini tidak terus muncul untuk orang berikutnya.
  async function handleSignOut() {
    const formData = new FormData();
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        formData.set("pushEndpoint", subscription.endpoint);
        await subscription.unsubscribe();
      }
    } catch {
      // Push tidak didukung/gagal dilepas -- tetap lanjut keluar.
    }
    await signOut(formData);
  }
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b px-4 md:px-8",
        GLASS_SURFACE_STRONG,
        GLASS_BORDER
      )}
    >
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
        {t(greeting)}, {displayName.split(" ")[0]}
      </p>

      <div className="flex items-center gap-2.5">
      <GlobalSearch />
      <NotificationInbox />
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-3 shadow-sm transition-colors hover:bg-white/70 dark:hover:bg-white/10",
            GLASS_PILL
          )}
        >
          <span className="relative shrink-0">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto dari Supabase Storage, bukan aset lokal Next.js
              <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-200 text-zinc-400 dark:bg-white/10 dark:text-zinc-500">
                <UserIcon className="h-4 w-4" strokeWidth={2.5} />
              </span>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-zinc-950">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-75" />
            </span>
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-xs font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
              {displayName}
            </span>
            <span className="block text-[11px] leading-tight text-zinc-400 dark:text-zinc-500">
              {t(DIVISION_LABELS[user?.division ?? "production"])}
            </span>
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-400 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div
            className={cn(
              "animate-fade-in absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-2xl border",
              GLASS_SURFACE_STRONG,
              GLASS_BORDER
            )}
          >
            <div className={cn("border-b px-4 py-3", GLASS_BORDER)}>
              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{displayName}</p>
              <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                {user?.username ? `@${user.username}` : email}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                {t(DIVISION_LABELS[user?.division ?? "production"])}
              </span>
            </div>
            <Link
              href="/dashboard/pengaturan"
              onClick={() => setOpen(false)}
              className="flex w-full items-center px-4 py-3 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              {t("Pengaturan")}
            </Link>
            <form action={handleSignOut}>
              <button
                type="submit"
                className={cn(
                  "flex w-full items-center border-t px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10",
                  GLASS_BORDER
                )}
              >
                {t("Keluar")}
              </button>
            </form>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
