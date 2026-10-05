"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, History, Trash2 } from "lucide-react";
import { useProductionData } from "./ProductionDataProvider";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { formatDateID, todayISO } from "@/lib/shared/utils";
import {
  addEquipmentUsage,
  deleteEquipmentUsage,
  getEquipmentUsage,
  markEquipmentUsageReturned,
} from "@/lib/production/extras-actions";
import type { EquipmentUsage } from "@/lib/production/extras-types";
import { useResetOnChange } from "@/lib/shared/use-synced-state";

const EMPTY_FORM = { projectId: "", digunakanOleh: "", tanggalPinjam: todayISO(), catatan: "" };

/**
 * Riwayat pemakaian per alat berat/perkakas (Tahap 28c) — dibuka dari
 * tombol baru di `EquipmentManager`. Data di-fetch on-demand tiap modal
 * dibuka (bukan lewat context), sama persis polanya dengan
 * `MaintenanceLogModal` Magnarent — riwayat ini jarang dibuka, tidak perlu
 * ikut ter-load di setiap render halaman Alat & Perkakas.
 */
export function EquipmentUsageModal({
  equipmentId,
  equipmentName,
  open,
  onClose,
}: {
  equipmentId: string;
  equipmentName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { projects } = useProductionData();
  const { showToast } = useToast();
  const [logs, setLogs] = useState<EquipmentUsage[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useResetOnChange(open ? equipmentId : null, (key) => {
    if (key === null) return;
    setForm(EMPTY_FORM);
    setError(null);
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getEquipmentUsage(equipmentId).then((rows) => {
      if (!cancelled) setLogs(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, equipmentId]);

  function reload() {
    getEquipmentUsage(equipmentId).then(setLogs);
  }

  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name : undefined);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await addEquipmentUsage(equipmentId, {
      projectId: form.projectId || undefined,
      digunakanOleh: form.digunakanOleh,
      tanggalPinjam: form.tanggalPinjam,
      catatan: form.catatan,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm(EMPTY_FORM);
    reload();
    showToast("Pemakaian alat berhasil dicatat.");
  }

  async function handleMarkReturned(id: string) {
    setBusyId(id);
    const result = await markEquipmentUsageReturned(id, todayISO());
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    reload();
    showToast("Alat ditandai sudah dikembalikan.");
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    const result = await deleteEquipmentUsage(id);
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setLogs((prev) => prev?.filter((l) => l.id !== id) ?? null);
    showToast("Riwayat pemakaian berhasil dihapus.");
  }

  return (
    <Modal open={open} onClose={onClose} title={`Riwayat Pemakaian — ${equipmentName}`}>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {logs === null ? (
          <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">Memuat…</p>
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
            Belum ada riwayat pemakaian untuk alat ini.
          </p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-black/5 px-3 py-2.5 dark:border-white/10"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{log.digunakanOleh}</p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {projectName(log.projectId) ?? "Bukan untuk proyek tertentu"}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  Dipinjam {formatDateID(log.tanggalPinjam)}
                  {log.tanggalKembali ? ` — Kembali ${formatDateID(log.tanggalKembali)}` : " — Belum dikembalikan"}
                </p>
                {log.catatan && (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{log.catatan}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!log.tanggalKembali && (
                  <button
                    type="button"
                    onClick={() => handleMarkReturned(log.id)}
                    disabled={busyId === log.id}
                    title="Tandai sudah dikembalikan"
                    aria-label="Tandai sudah dikembalikan"
                    className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(log.id)}
                  disabled={busyId === log.id}
                  aria-label="Hapus riwayat pemakaian ini"
                  className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-black/5 pt-4 dark:border-white/10">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          <History className="h-3.5 w-3.5" />
          Catat Pemakaian Baru
        </p>
        <div>
          <label htmlFor="usage-project" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Proyek Booth (opsional)
          </label>
          <select
            id="usage-project"
            value={form.projectId}
            onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
          >
            <option value="">— Bukan untuk proyek tertentu —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="usage-digunakan-oleh" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Digunakan Oleh
            </label>
            <input
              id="usage-digunakan-oleh"
              value={form.digunakanOleh}
              onChange={(e) => setForm((f) => ({ ...f, digunakanOleh: e.target.value }))}
              placeholder="mis. Tim Instalasi A"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="usage-tanggal-pinjam" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Tanggal Pinjam
            </label>
            <input
              id="usage-tanggal-pinjam"
              type="date"
              value={form.tanggalPinjam}
              onChange={(e) => setForm((f) => ({ ...f, tanggalPinjam: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
        </div>
        <div>
          <label htmlFor="usage-catatan" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Catatan (opsional)
          </label>
          <input
            id="usage-catatan"
            value={form.catatan}
            onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
            placeholder="mis. dipakai untuk bongkar panggung"
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
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {submitting ? "Menyimpan…" : "Catat Pemakaian"}
        </button>
      </form>
    </Modal>
  );
}
