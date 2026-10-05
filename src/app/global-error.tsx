"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Jaring pengaman TERAKHIR — dipanggil Next.js kalau error terjadi di ROOT
 * LAYOUT itu sendiri (`src/app/layout.tsx`), bukan di halaman anaknya. Ini
 * satu-satunya `error.tsx` yang wajib merender `<html>`/`<body>` sendiri,
 * karena file ini MENGGANTIKAN seluruh root layout, bukan cuma konten di
 * dalamnya. Sengaja dibuat sesederhana mungkin (tanpa font Google/komponen
 * lain) supaya kecil kemungkinan halaman fallback ini sendiri ikut gagal.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="id">
      <body className="bg-zinc-950 text-white antialiased">
        <div className="flex min-h-screen items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900 p-7 text-center shadow-xl shadow-black/30">
            <h1 className="text-lg font-extrabold">MagnaSuperApp tidak bisa dimuat</h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              Terjadi kesalahan serius saat memuat aplikasi. Coba muat ulang halaman ini.
            </p>
            {error.digest && <p className="mt-3 text-[11px] text-zinc-600">Kode referensi: {error.digest}</p>}
            <button
              type="button"
              onClick={() => reset()}
              className="mt-5 inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #6366F1 0%, #EC4899 55%, #F59E0B 100%)" }}
            >
              Muat Ulang
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
