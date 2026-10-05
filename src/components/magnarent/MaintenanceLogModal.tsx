"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2, Wrench } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { formatRupiah } from "@/lib/magnarent/pricing";
import { formatDateID, todayISO } from "@/lib/magnarent/date";
import {
  addMaintenanceLog,
  deleteMaintenanceLog,
  getMaintenanceLogs,
} from "@/lib/magnarent/extras-actions";
import { MAINTENANCE_JENIS, type MaintenanceJenis, type MaintenanceLog } from "@/lib/magnarent/extras-types";
import { useResetOnChange } from "@/lib/shared/use-synced-state";

const EMPTY_FORM = { tanggal: todayISO(), jenis: "Servis Rutin" as MaintenanceJenis, keterangan: "", biaya: "0" };

/**
 * Riwayat servis/perbaikan per alat (Tahap 28a) — dibuka dari tombol
 * baru di InventoryManager.tsx. Data di-fetch on-demand tiap modal dibuka
 * (bukan lewat MagnarentDataProvider) karena ini murni riwayat tambahan,
 * jarang dibuka, tidak perlu ikut ter-load di setiap render halaman
 * Inventaris.
 */
export function MaintenanceLogModal({
  itemId,
  itemName,
  open,
  onClose,
}: {
  itemId: string;
  itemName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<MaintenanceLog[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  useResetOnChange(open ? itemId : null, (key) => {
    if (key === null) return;
    setForm(EMPTY_FORM);
    setError(null);
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMaintenanceLogs(itemId).then((rows) => {
      if (!cancelled) setLogs(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, itemId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const biaya = Number(form.biaya) || 0;

    setError(null);
    setSubmitting(true);
    const result = await addMaintenanceLog(itemId, {
      tanggal: form.tanggal,
      jenis: form.jenis,
      keterangan: form.keterangan,
      biaya,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setForm(EMPTY_FORM);
    getMaintenanceLogs(itemId).then(setLogs);
    showToast("Riwayat servis berhasil dicatat.");
  }

  async function handleDelete(id: string) {
    setDeleteTargetId(id);
    const result = await deleteMaintenanceLog(id);
    setDeleteTargetId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setLogs((prev) => prev?.filter((l) => l.id !== id) ?? null);
    showToast("Riwayat servis berhasil dihapus.");
  }

  return (
    <Modal open={open} onClose={onClose} title={`Riwayat Servis — ${itemName}`}>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {logs === null ? (
          <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">Memuat…</p>
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
            Belum ada riwayat servis untuk alat ini.
          </p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-black/5 px-3 py-2.5 dark:border-white/10"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {log.jenis} — {formatDateID(log.tanggal)}
                </p>
                {log.keterangan && (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{log.keterangan}</p>
                )}
                {log.biaya > 0 && (
                  <p className="mt-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    {formatRupiah(log.biaya)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(log.id)}
                disabled={deleteTargetId === log.id}
                aria-label="Hapus riwayat servis ini"
                className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-black/5 pt-4 dark:border-white/10">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          <Wrench className="h-3.5 w-3.5" />
          Catat Servis Baru
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="maintenance-tanggal" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Tanggal
            </label>
            <input
              id="maintenance-tanggal"
              type="date"
              value={form.tanggal}
              onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="maintenance-jenis" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Jenis
            </label>
            <select
              id="maintenance-jenis"
              value={form.jenis}
              onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value as MaintenanceJenis }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              {MAINTENANCE_JENIS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="maintenance-keterangan" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Keterangan (opsional)
          </label>
          <input
            id="maintenance-keterangan"
            value={form.keterangan}
            onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
            placeholder="mis. ganti kain tenda yang sobek"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>
        <div>
          <label htmlFor="maintenance-biaya" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Biaya (Rp, opsional)
          </label>
          <input
            id="maintenance-biaya"
            type="number"
            min={0}
            value={form.biaya}
            onChange={(e) => setForm((f) => ({ ...f, biaya: e.target.value }))}
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
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
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Catat Servis
        </button>
      </form>
    </Modal>
  );
}
