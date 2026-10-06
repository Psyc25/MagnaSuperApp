"use client";

import { useState, type FormEvent } from "react";
import { ScanLine } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { bulkScanUpdateStatus } from "@/lib/magnarent/extras-actions";
import type { InventoryUnitStatus } from "@/lib/magnarent/types";

const ALL_STATUSES: InventoryUnitStatus[] = ["Tersedia", "Dipinjam", "Maintenance", "Hilang"];

/** Hasil terakhir ditampilkan di dalam modal, bukan toast — supaya daftar kode yang tidak ketemu tetap kelihatan sampai staf tutup modal. */
type ScanResult = { matchedCount: number; notFound: string[]; ambiguous: string[] };

/**
 * Bulk-scan gudang (pelengkap QR per-unit, laporan Bagian 5-C #17) — staf
 * tempel/scan banyak kode kode_unit ATAU tag RFID sekaligus (satu per
 * baris, atau dipisah koma — cocok buat scanner RFID yang ketik cepat lalu
 * Enter/koma), lalu satu aksi update status semua unit yang cocok. Dipakai
 * saat bongkar/pasang alat event besar biar tidak perlu buka form per-unit
 * satu-satu di InventoryUnitsModal.
 */
export function BulkScanModal({ onClose }: { onClose: () => void }) {
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState<InventoryUnitStatus>("Dipinjam");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  function parseCodes(value: string): string[] {
    return value
      .split(/[\n,]/)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const codes = parseCodes(raw);
    if (codes.length === 0) {
      setError("Tempel/scan minimal satu kode dulu.");
      return;
    }
    setError(null);
    setResult(null);
    setSubmitting(true);
    const res = await bulkScanUpdateStatus(codes, status);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult({ matchedCount: res.matchedCount, notFound: res.notFound, ambiguous: res.ambiguous });
    setRaw("");
  }

  return (
    <Modal open onClose={onClose} title="Scan Massal Gudang (QR/RFID)">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Tempel atau scan banyak kode unit / tag RFID sekaligus (satu per baris, atau dipisah koma) untuk
          langsung ubah status semua unit yang cocok — cocok dipakai saat bongkar/pasang alat event besar.
        </p>
        <div>
          <label htmlFor="scan-codes" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Kode Unit / Tag RFID
          </label>
          <textarea
            id="scan-codes"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            placeholder={"TND-01\nTND-02\nE28011...\n..."}
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-violet-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>

        <div>
          <label htmlFor="scan-status" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Ubah status jadi
          </label>
          <select
            id="scan-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as InventoryUnitStatus)}
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-violet-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-1.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <p className="font-semibold">{result.matchedCount} unit berhasil diperbarui ke status &quot;{status}&quot;.</p>
            {result.notFound.length > 0 && (
              <p>
                Tidak ketemu ({result.notFound.length}): {result.notFound.join(", ")}
              </p>
            )}
            {result.ambiguous.length > 0 && (
              <p className="text-amber-700 dark:text-amber-300">
                Dilewati karena kodenya dipakai lebih dari satu alat ({result.ambiguous.length}):{" "}
                {result.ambiguous.join(", ")} -- ubah statusnya lewat menu unit di alat yang bersangkutan.
              </p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            Tutup
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            <ScanLine className="h-3.5 w-3.5" />
            {submitting ? "Memproses…" : "Proses Scan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
