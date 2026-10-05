"use client";

import { useEffect } from "react";
import { RefreshCw, ServerCrash } from "lucide-react";
import { BRAND_GRADIENT } from "@/lib/navigation";
import { BrandLogo } from "@/components/layout/BrandLogo";

/**
 * Jaring pengaman error tingkat root — Next.js otomatis menampilkan file ini
 * kalau ada error yang tidak tertangkap di rute manapun yang TIDAK punya
 * `error.tsx` sendiri (mis. halaman login/register di luar `/dashboard`).
 * Rute di dalam `/dashboard/**` punya boundary sendiri yang lebih spesifik
 * (lihat `src/app/dashboard/error.tsx`) supaya Sidebar/Topbar tetap tampil
 * saat terjadi error, bukan ikut hilang.
 *
 * Sebelum file ini ditambahkan, error yang tidak tertangkap = layar putih
 * kosong bawaan Next.js — sekarang tampil pesan yang jelas + tombol "Coba
 * Lagi" yang memanggil ulang render segmen yang error (tanpa reload penuh).
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[RootError]", error);
  }, [error]);

  return (
    <div className="app-backdrop relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div
        className="animate-blob pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: BRAND_GRADIENT }}
        aria-hidden
      />
      <div className="relative w-full max-w-md animate-fade-up text-center">
        <div className="mb-6 flex flex-col items-center">
          <BrandLogo size={56} rounded="rounded-2xl" />
        </div>
        <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-xl shadow-black/5 dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/30">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
            <ServerCrash className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-extrabold text-zinc-900 dark:text-white">Terjadi kesalahan</h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Maaf, ada yang tidak beres saat memuat halaman ini. Coba muat ulang — kalau masih terjadi terus, kabari
            tim teknis.
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
      </div>
    </div>
  );
}
