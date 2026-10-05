"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { loadXlsx } from "@/lib/shared/xlsx";

export type ExportSheet = {
  /** Nama tab di file Excel — dipotong ke 31 karakter (batas format .xlsx). */
  name: string;
  rows: Record<string, string | number>[];
};

/**
 * Tombol ekspor generik (Tahap 43 — permintaan Owner) — dipakai di halaman
 * Laporan & Piutang/Pendapatan supaya datanya bisa diunduh sebagai .xlsx
 * untuk dikirim ke investor/klien/akuntan, tanpa harus screenshot tabel.
 *
 * Pola sama persis dengan import Excel/CSV di ProductManager.tsx: paket
 * "xlsx" (SheetJS) di-dynamic-import supaya tidak ikut ke bundle awal
 * halaman (cuma dipakai saat tombol ini benar-benar diklik), dan hasil
 * modulnya di-typing `any` dengan sengaja karena bentuk `.default` paket
 * CJS ini tidak konsisten di type-check Vercel — lihat komentar di
 * ProductManager.tsx untuk detail lengkapnya.
 *
 * SENGAJA cuma jalan di BROWSER (client-side): workbook dibangun dan
 * langsung diunduh dari data yang sudah ada di halaman (props, hasil query
 * server yang sama dengan yang dirender ke layar) — tidak ada
 * round-trip/Server Action baru, jadi tidak nambah beban server maupun
 * risiko timeout seperti kasus Asisten AI.
 */
export function ExportButton({
  sheets,
  fileName,
  label = "Ekspor Excel",
  className,
  iconOnly = false,
  title,
}: {
  sheets: ExportSheet[];
  /** Tanpa ekstensi — ".xlsx" ditambahkan otomatis. */
  fileName: string;
  label?: string;
  className?: string;
  /** Tampilan tombol bundar cuma-ikon (Tahap 43) — dipakai di baris tabel yang
   * aksinya sudah berupa deretan tombol bundar (mis. Edit/Hapus), supaya
   * tombol Ekspor konsisten gayanya, bukan pill bertuliskan di tengah baris. */
  iconOnly?: boolean;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const XLSX = await loadXlsx();
      const workbook = XLSX.utils.book_new();

      const usedNames = new Set<string>();
      for (const sheet of sheets) {
        // Nama tab Excel maksimal 31 karakter & harus unik dalam satu
        // workbook — dipotong & digenapkan di sini supaya tidak error diam-
        // diam kalau ada label panjang atau dua sheet kebetulan mirip nama.
        let safeName = sheet.name.slice(0, 31) || "Sheet";
        let suffix = 2;
        while (usedNames.has(safeName)) {
          const base = sheet.name.slice(0, 31 - String(suffix).length - 1);
          safeName = `${base}_${suffix}`;
          suffix += 1;
        }
        usedNames.add(safeName);

        const worksheet =
          sheet.rows.length > 0
            ? XLSX.utils.json_to_sheet(sheet.rows)
            : XLSX.utils.aoa_to_sheet([["Tidak ada data"]]);
        XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
      }

      const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([arrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `${fileName}-${stamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[export] Gagal membuat file Excel:", err);
      setError("Gagal membuat file Excel — coba lagi sebentar.");
    } finally {
      setBusy(false);
    }
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy}
        title={title ?? label}
        aria-label={title ?? label}
        className={cn(
          "rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300",
          className
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5",
          className
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? "Menyiapkan…" : label}
      </button>
      {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
