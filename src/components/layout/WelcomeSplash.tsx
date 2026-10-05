"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Popup animasi "Selamat Datang" — permintaan Owner: begitu selesai login
 * dan masuk ke menu, beri efek animasi model popup yang lebih menarik
 * (bukan cuma langsung nongol dashboard polos). Dipicu oleh `?welcome=1`
 * yang ditempel `signIn` (src/app/(auth)/actions.ts) HANYA pada redirect
 * setelah login BERHASIL — begitu terbaca di sini, langsung dibuang dari
 * URL (`router.replace`) supaya animasinya SEKALI SAJA per login (refresh
 * atau buka lagi lewat tombol back tidak akan mengulanginya).
 *
 * Dipasang di AppShell (jadi tampil di halaman dashboard mana pun tujuan
 * redirect login-nya), dibungkus <Suspense> oleh pemanggilnya karena
 * `useSearchParams()` mewajibkannya di App Router.
 */
export function WelcomeSplash({ name }: { name: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Langsung "visible" di render pertama kalau datang dari login -- bukan
  // setState di dalam effect (render berantai + sekilas kosong).
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">(() =>
    searchParams.get("welcome") === "1" ? "visible" : "hidden"
  );

  useEffect(() => {
    if (searchParams.get("welcome") !== "1") return;

    const params = new URLSearchParams(searchParams);
    params.delete("welcome");
    const cleanUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(cleanUrl, { scroll: false });

    const leaveTimer = setTimeout(() => setPhase("leaving"), 1800);
    const hideTimer = setTimeout(() => setPhase("hidden"), 2100);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(hideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/10 backdrop-blur-sm transition-opacity duration-300 dark:bg-black/30",
        phase === "leaving" ? "opacity-0" : "opacity-100"
      )}
      aria-hidden
    >
      <div
        className="animate-welcome-pop flex flex-col items-center gap-2 rounded-3xl bg-gradient-to-br from-[#D4AF37] via-[#E5484D] to-[#0B7A63] px-9 py-8 text-center shadow-2xl shadow-black/30"
        style={{ boxShadow: "0 24px 60px -12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)" }}
      >
        <Sparkles className="h-7 w-7 text-white" />
        <p className="text-lg font-extrabold text-white">Selamat Datang, {name}!</p>
        <p className="text-xs font-medium text-white/80">Semoga harimu produktif</p>
      </div>
    </div>
  );
}
