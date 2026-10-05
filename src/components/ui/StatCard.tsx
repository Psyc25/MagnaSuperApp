"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

export type StatCardRatio = {
  value: number;
  total: number;
  caption: string;
};

/**
 * Animasi hitung-naik dari 0 ke angka asli tiap kali kartu ini muncul di
 * layar — dipecah dari format tampilannya (lihat `renderAnimatedValue` di
 * bawah) supaya berlaku otomatis baik untuk angka polos ("5") maupun yang
 * sudah diformat mata uang ("Rp16.950.000"), tanpa tiap pemanggil harus
 * kirim dua versi nilai (mentah + terformat).
 */
function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

/**
 * `value` datang sebagai string yang SUDAH diformat pemanggil (mis.
 * `formatRupiah(...)` atau `String(count)`) — supaya animasi hitung-naik
 * tetap jalan tanpa mengubah kontrak StatCard, angka di dalam string itu
 * diekstrak, dianimasikan, lalu ditata ulang dengan prefix/suffix aslinya
 * (mis. "Rp" dan pemisah ribuan) tetap utuh. Kalau tidak ada angka sama
 * sekali di dalam `value` (kasus langka), tampilkan apa adanya tanpa animasi.
 */
function AnimatedValue({ value }: { value: string }) {
  const match = value.match(/^(\D*)([\d.,]+)(\D*)$/);
  const animated = useCountUp(match ? Number(match[2].replace(/\D/g, "")) || 0 : 0);

  if (!match) return <>{value}</>;

  const [, prefix, , suffix] = match;
  const formatted = new Intl.NumberFormat("id-ID").format(animated);
  return (
    <>
      {prefix}
      {formatted}
      {suffix}
    </>
  );
}

/**
 * Kartu KPI generik — dipakai di ketiga halaman Ringkasan (Magnarent,
 * Magnative, Production) dan Laporan Lintas Divisi, menggantikan markup KPI
 * yang sebelumnya copy-paste identik di beberapa tempat. `ratio` opsional
 * menampilkan bar proporsi tipis di bawah angka (mis. "3 dari 5 booking
 * aktif") — dihitung dari data asli, bukan angka tren yang dikarang-karang.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  ratio,
  delayMs = 0,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: string;
  ratio?: StatCardRatio;
  delayMs?: number;
}) {
  const pct =
    ratio && ratio.total > 0 ? Math.min(100, Math.max(0, (ratio.value / ratio.total) * 100)) : null;

  return (
    <div
      className={cn(
        "animate-fade-up group relative overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg",
        GLASS_SURFACE,
        GLASS_BORDER
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} aria-hidden />
      <div className="relative">
        <span
          className="absolute -inset-1 rounded-xl opacity-25 blur-md transition-opacity group-hover:opacity-40"
          style={{ background: accent }}
          aria-hidden
        />
        <div
          className="relative grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-110"
          style={{ background: accent }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p
        className={cn(
          "mt-3.5 font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white",
          value.length > 10 ? "text-lg" : "text-2xl"
        )}
      >
        <AnimatedValue value={value} />
      </p>
      <p className="mt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>

      {pct !== null && ratio && (
        <div className="mt-3.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%`, background: accent }}
            />
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{ratio.caption}</p>
        </div>
      )}
    </div>
  );
}
