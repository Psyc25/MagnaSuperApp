"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PackageSearch, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { formatRupiah } from "@/lib/magnarent/pricing";
import {
  addSubrentRecord,
  deleteSubrentRecord,
  getSubrentRecords,
  updateSubrentStatus,
} from "@/lib/magnarent/extras-actions";
import { SUBRENT_STATUS, type SubrentRecord, type SubrentStatus } from "@/lib/magnarent/extras-types";

function emptyForm(itemId?: string, tanggalMulai?: string, tanggalSelesai?: string) {
  return {
    itemId: itemId ?? "",
    vendorName: "",
    jumlahUnit: "1",
    hargaSewaTotal: "",
    tanggalMulai: tanggalMulai ?? "",
    tanggalSelesai: tanggalSelesai ?? "",
    catatan: "",
  };
}

const STATUS_STYLE: Record<SubrentStatus, string> = {
  Dipesan: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300",
  Diterima: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
  Dikembalikan: "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400",
  Dibatalkan: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
};

/**
 * Subrent tracking per booking (analisis-kompetitor #15, migrasi 0073) --
 * catat alat yang dipinjam dari vendor luar buat menutupi kekurangan stok
 * in-house saat fulfillment booking ini (mis. butuh 50 kursi, stok cuma
 * 30, 20 sisanya disubrent). `itemId`/rentang tanggal booking diisi
 * otomatis sebagai default form, tapi tetap bisa diedit staf.
 */
export function SubrentModal({
  bookingId,
  clientName,
  itemId,
  tanggalMulai,
  tanggalSelesai,
  onClose,
}: {
  bookingId: string;
  clientName: string;
  itemId?: string;
  tanggalMulai?: string;
  tanggalSelesai?: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [records, setRecords] = useState<SubrentRecord[] | null>(null);
  const [form, setForm] = useState(emptyForm(itemId, tanggalMulai, tanggalSelesai));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SubrentRecord | null>(null);

  function reload() {
    getSubrentRecords(bookingId).then(setRecords);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await addSubrentRecord({
      bookingId,
      itemId: form.itemId || undefined,
      vendorName: form.vendorName,
      jumlahUnit: Number(form.jumlahUnit),
      hargaSewaTotal: form.hargaSewaTotal.trim() === "" ? undefined : Number(form.hargaSewaTotal),
      tanggalMulai: form.tanggalMulai,
      tanggalSelesai: form.tanggalSelesai,
      catatan: form.catatan,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast("Catatan subrent berhasil ditambahkan.");
    setForm(emptyForm(itemId, tanggalMulai, tanggalSelesai));
    setError(null);
    reload();
  }

  async function handleStatusChange(record: SubrentRecord, status: SubrentStatus) {
    const result = await updateSubrentStatus(record.id, status);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    reload();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteSubrentRecord(deleteTarget.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    showToast(`Catatan subrent dari "${deleteTarget.vendorName}" berhasil dihapus.`);
    setDeleteTarget(null);
    reload();
  }

  return (
    <Modal open onClose={onClose} title={`Subrent Alat — ${clientName}`}>
      <div className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-black/5 p-3.5 dark:border-white/10">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Nama Vendor
              </label>
              <input
                value={form.vendorName}
                onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                placeholder="mis. CV Sewa Alat Jaya"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-cyan-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Jumlah Unit
              </label>
              <input
                type="number"
                min={1}
                value={form.jumlahUnit}
                onChange={(e) => setForm((f) => ({ ...f, jumlahUnit: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-cyan-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Mulai
              </label>
              <input
                type="date"
                value={form.tanggalMulai}
                onChange={(e) => setForm((f) => ({ ...f, tanggalMulai: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-cyan-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Selesai
              </label>
              <input
                type="date"
                value={form.tanggalSelesai}
                onChange={(e) => setForm((f) => ({ ...f, tanggalSelesai: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-cyan-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Total Biaya Sewa (Rp, opsional)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.hargaSewaTotal}
              onChange={(e) => setForm((f) => ({ ...f, hargaSewaTotal: e.target.value }))}
              placeholder="Kosongkan kalau belum diketahui"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-cyan-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <input
            value={form.catatan}
            onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
            placeholder="Catatan (opsional)"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-cyan-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-cyan-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Menyimpan…" : "+ Catat Subrent"}
            </button>
          </div>
        </form>

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {records === null && <p className="py-4 text-center text-sm text-zinc-400">Memuat…</p>}
          {records?.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-black/10 py-6 text-center dark:border-white/10">
              <PackageSearch className="h-7 w-7 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Belum ada catatan subrent untuk booking ini.</p>
            </div>
          )}
          {records?.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-black/5 p-2.5 dark:border-white/10"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                  {r.vendorName} · {r.jumlahUnit} unit
                </p>
                <p className="text-xs text-zinc-400">
                  {r.tanggalMulai} – {r.tanggalSelesai}
                  {r.hargaSewaTotal ? ` · ${formatRupiah(r.hargaSewaTotal)}` : ""}
                  {r.catatan ? ` — ${r.catatan}` : ""}
                </p>
              </div>
              <select
                value={r.status}
                onChange={(e) => handleStatusChange(r, e.target.value as SubrentStatus)}
                className={cnStatus(r.status)}
              >
                {SUBRENT_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setDeleteTarget(r)}
                aria-label="Hapus catatan subrent"
                className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Catatan Subrent"
        description={
          deleteTarget && (
            <>
              Yakin hapus catatan subrent dari <strong>{deleteTarget.vendorName}</strong>?
            </>
          )
        }
      />
    </Modal>
  );
}

function cnStatus(status: SubrentStatus): string {
  return `shrink-0 rounded-full border-0 px-2.5 py-1 text-xs font-semibold outline-none [&>option]:bg-white dark:[&>option]:bg-zinc-900 ${STATUS_STYLE[status]}`;
}
