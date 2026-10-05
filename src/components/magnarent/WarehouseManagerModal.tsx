"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { addWarehouse, deleteWarehouse, getWarehouses } from "@/lib/magnarent/extras-actions";
import type { Warehouse } from "@/lib/magnarent/extras-types";

/**
 * Kelola daftar gudang bernama (Gap #9/analisis-kompetitor #15, migrasi
 * 0073) -- dibuka dari toolbar Inventaris. Daftar ini dipakai sebagai
 * pilihan lokasi per-unit alat (InventoryUnitsModal) & tujuan transfer
 * antar gudang -- BUKAN pengganti `InventoryItem.location` (teks bebas di
 * level alat) yang tetap ada untuk tampilan ringkas.
 */
export function WarehouseManagerModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [nama, setNama] = useState("");
  const [alamat, setAlamat] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);

  async function reload() {
    setWarehouses(await getWarehouses());
  }

  useEffect(() => {
    let cancelled = false;
    getWarehouses().then((rows) => {
      if (!cancelled) setWarehouses(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await addWarehouse({ nama, alamat: alamat || undefined });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNama("");
    setAlamat("");
    await reload();
    showToast("Gudang berhasil ditambahkan.");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteWarehouse(deleteTarget.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    showToast(`Gudang "${deleteTarget.nama}" berhasil dihapus.`);
    setDeleteTarget(null);
    await reload();
  }

  return (
    <Modal open onClose={onClose} title="Kelola Gudang">
      <div className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-zinc-100 p-3.5 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-3">
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Nama gudang, mis. Gudang Cikarang"
              className="col-span-2 rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
            <input
              value={alamat}
              onChange={(e) => setAlamat(e.target.value)}
              placeholder="Alamat (opsional)"
              className="col-span-2 rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          {error && <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {submitting ? "Menyimpan..." : "+ Tambah Gudang"}
          </button>
        </form>

        {warehouses === null ? (
          <p className="text-xs text-zinc-400">Memuat...</p>
        ) : warehouses.length === 0 ? (
          <EmptyState
            icon={WarehouseIcon}
            title="Belum ada gudang terdaftar"
            description="Tambah gudang pertama di atas supaya unit alat bisa ditempatkan per lokasi."
          />
        ) : (
          <ul className="space-y-2">
            {warehouses.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 px-3.5 py-2.5 text-sm dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-800 dark:text-zinc-100">{w.nama}</p>
                  {w.alamat && <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">{w.alamat}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(w)}
                  className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Gudang"
        description={
          deleteTarget && (
            <>
              Yakin hapus gudang <strong>{deleteTarget.nama}</strong>? Unit alat yang ditempatkan di gudang ini akan
              jadi &ldquo;belum ditempatkan&rdquo;, tindakan ini tidak bisa dibatalkan.
            </>
          )
        }
      />
    </Modal>
  );
}
