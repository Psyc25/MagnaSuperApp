"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Loader2, Truck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { getMaterialTransfers, transferMaterialStock } from "@/lib/production/extras-actions";
import type { MaterialTransfer } from "@/lib/production/extras-types";
import type { MaterialItem } from "@/lib/production/types";
import { useResetOnChange } from "@/lib/shared/use-synced-state";

const EMPTY_FORM = { qty: "", toLocation: "", catatan: "" };

// t.createdAt adalah timestamptz LENGKAP (jam+tanggal) dari kolom created_at
// production_material_transfers, BUKAN tanggal murni seperti log.tanggal di
// MaintenanceLogModal — jadi TIDAK bisa pakai formatDateID (itu expect
// string "YYYY-MM-DD" lalu nempelin "T00:00:00", hasilnya "Invalid Date"
// kalau dikasih timestamp lengkap). Pola sama persis dengan formatWaktu di
// ActivityLogTable.tsx untuk kolom timestamptz lain.
function formatWaktuTransfer(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Transfer stok antar gudang/lokasi (Tahap 45 — gap #8 analisis-gap-
 * production.md) — dibuka dari tombol baru di MaterialManager.tsx. Riwayat
 * di-fetch on-demand tiap modal dibuka (bukan lewat ProductionDataProvider),
 * sama pola dengan MaintenanceLogModal Magnarent: murni riwayat tambahan,
 * jarang dibuka, tidak perlu ikut ter-load di setiap render halaman Material.
 *
 * Modal ditutup otomatis setelah transfer sukses (bukan dibiarkan terbuka
 * seperti MaintenanceLogModal) — karena `material` di sini adalah snapshot
 * props dari baris tabel saat tombol diklik, jadi field stok-nya tidak
 * ikut ter-update live kalau modal dibiarkan terbuka setelah RPC mengubah
 * data di server. Tabel di belakangnya sendiri tetap ter-update instan
 * lewat revalidatePath, sama seperti aksi lain di modul ini.
 */
export function TransferStockModal({
  material,
  open,
  onClose,
}: {
  material: MaterialItem;
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [transfers, setTransfers] = useState<MaterialTransfer[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useResetOnChange(open ? material.id : null, (key) => {
    if (key === null) return;
    setForm(EMPTY_FORM);
    setError(null);
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMaterialTransfers(material.id).then((rows) => {
      if (!cancelled) setTransfers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, material.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const qty = Number(form.qty);

    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Jumlah transfer harus lebih dari 0.");
      return;
    }
    if (!form.toLocation.trim()) {
      setError("Lokasi tujuan wajib diisi.");
      return;
    }
    if (form.toLocation.trim() === material.location) {
      setError("Lokasi tujuan tidak boleh sama dengan lokasi asal.");
      return;
    }

    setError(null);
    setSubmitting(true);
    const result = await transferMaterialStock(material.id, {
      qty,
      toLocation: form.toLocation,
      catatan: form.catatan,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    showToast(
      `${qty} ${material.unit} "${material.name}" berhasil dipindah dari ${material.location} ke ${form.toLocation.trim()}.`
    );
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Transfer Stok — ${material.name}`}>
      <div className="mb-4 flex items-center justify-center gap-2.5 rounded-xl bg-zinc-50 px-3.5 py-2.5 text-sm dark:bg-white/5">
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">{material.location}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <span className="text-zinc-400 dark:text-zinc-500">
          {form.toLocation.trim() || "Lokasi tujuan"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="transfer-qty" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Jumlah ({material.unit})
            </label>
            <input
              id="transfer-qty"
              type="number"
              min={1}
              max={material.stock}
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
              placeholder={`Stok saat ini: ${material.stock}`}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="transfer-to-location" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Lokasi Tujuan
            </label>
            <input
              id="transfer-to-location"
              value={form.toLocation}
              onChange={(e) => setForm((f) => ({ ...f, toLocation: e.target.value }))}
              placeholder="mis. Gudang Cikarang"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
        </div>
        <div>
          <label htmlFor="transfer-catatan" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Catatan (opsional)
          </label>
          <input
            id="transfer-catatan"
            value={form.catatan}
            onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
            placeholder="mis. dipindah untuk proyek di lokasi tujuan"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
          Transfer Stok
        </button>
      </form>

      <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/10">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Riwayat Transfer
        </p>
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {transfers === null ? (
            <p className="py-3 text-center text-xs text-zinc-400 dark:text-zinc-500">Memuat…</p>
          ) : transfers.length === 0 ? (
            <p className="py-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
              Belum ada riwayat transfer untuk material ini.
            </p>
          ) : (
            transfers.map((t) => (
              <div
                key={t.id}
                className="rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                    {t.fromLocation} <ArrowRight className="inline h-3 w-3" /> {t.toLocation}
                  </span>
                  <span className="shrink-0 text-zinc-400 dark:text-zinc-500">{formatWaktuTransfer(t.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                  {t.qty} {material.unit}
                  {t.catatan ? ` — ${t.catatan}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
