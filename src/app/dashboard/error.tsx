"use client";

import { useEffect } from "react";
import { RefreshCw, ServerCrash } from "lucide-react";
import { BRAND_GRADIENT } from "@/lib/navigation";

/**
 * Boundary error KHUSUS untuk rute di dalam `/dashboard/**` — lebih spesifik
 * daripada `src/app/error.tsx` (root), jadi Next.js memilih file ini duluan
 * untuk error apa pun di bawah `/dashboard`. Bedanya dari yang root: file ini
 * dirender DI DALAM `DashboardLayout` (AppShell), jadi Sidebar/Topbar/Menu
 * Bawah tetap tampil & tetap bisa dipakai pindah ke modul lain — pengguna
 * tidak "terjebak" di halaman kosong, cuma satu halaman yang gagal.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <div className="animate-fade-up flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
        <ServerCrash className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white">Halaman ini gagal dimuat</h2>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        Ada yang tidak beres saat mengambil data. Coba lagi, atau buka menu lain dari sidebar sementara ini
        diperbaiki.
      </p>
      {error.digest && (
        <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-600">Kode referensi: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-5 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
        style={{ background: BRAND_GRADIENT }}
      >
        <RefreshCw className="h-4 w-4" />
        Coba Lagi
      </button>
    </div>
  );
}
