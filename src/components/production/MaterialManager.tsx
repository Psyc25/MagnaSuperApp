"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowLeftRight, Boxes, MapPin, Pencil, Plus, QrCode, Search, Trash2 } from "lucide-react";
import { useProductionData } from "./ProductionDataProvider";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRupiah } from "@/lib/shared/utils";
import { isLowStock } from "@/lib/production/availability";
import { cn } from "@/lib/cn";
import type { MaterialCategory, MaterialItem, MaterialUnit } from "@/lib/production/types";
import { QrPrintModal } from "./QrPrintModal";
import { TransferStockModal } from "./TransferStockModal";
import { GLASS_BORDER, GLASS_INPUT, GLASS_SURFACE } from "@/lib/glass";

const GRADIENT = "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)";

const ALL_CATEGORIES: MaterialCategory[] = [
  "Kayu & Panel",
  "Cat & Finishing",
  "Hardware & Rangka",
  "Elektrikal",
  "Lainnya",
];
const ALL_UNITS: MaterialUnit[] = ["pcs", "lembar", "batang", "meter", "kg", "liter", "set"];
const CATEGORY_FILTER_ALL = "Semua Kategori";

function emptyForm() {
  return {
    name: "",
    category: "Kayu & Panel" as MaterialCategory,
    unit: "pcs" as MaterialUnit,
    location: "",
    stock: "0",
    minStock: "0",
    pricePerUnit: "0",
  };
}

function materialToForm(m: MaterialItem) {
  return {
    name: m.name,
    category: m.category,
    unit: m.unit,
    location: m.location,
    stock: String(m.stock),
    minStock: String(m.minStock),
    pricePerUnit: String(m.pricePerUnit),
  };
}

/**
 * Gudang & Material — tabel stok material produksi booth + modal
 * tambah/edit, dan konfirmasi hapus. Menghapus material yang masih
 * dialokasikan ke proyek booth aktif diblokir, sama seperti guard hapus
 * alat di Magnarent dan klien di Magnative — supaya proyek tidak jadi
 * menunjuk material yang sudah hilang dari gudang.
 */
export function MaterialManager() {
  const { materials, addMaterial, updateMaterial, deleteMaterial, getActiveProjectsForMaterial } =
    useProductionData();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MaterialItem | null>(null);
  const [qrTarget, setQrTarget] = useState<MaterialItem | null>(null);
  const [transferTarget, setTransferTarget] = useState<MaterialItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(CATEGORY_FILTER_ALL);
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const filteredMaterials = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return materials.filter((m) => {
      const matchesSearch =
        !term || m.name.toLowerCase().includes(term) || m.location.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === CATEGORY_FILTER_ALL || m.category === categoryFilter;
      const matchesLowStock = !lowStockOnly || isLowStock(m);
      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [materials, searchTerm, categoryFilter, lowStockOnly]);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setFormOpen(true);
  }

  function openEditModal(m: MaterialItem) {
    setEditingId(m.id);
    setForm(materialToForm(m));
    setError(null);
    setFormOpen(true);
  }

  function closeFormModal() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const stock = Number(form.stock);
    const minStock = Number(form.minStock);
    const pricePerUnit = Number(form.pricePerUnit);

    if (!form.name.trim() || !form.location.trim()) {
      setError("Nama material dan lokasi gudang wajib diisi.");
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setError("Stok tidak valid.");
      return;
    }
    if (!Number.isFinite(minStock) || minStock < 0) {
      setError("Ambang stok menipis tidak valid.");
      return;
    }
    if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
      setError("Harga per satuan tidak valid.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      location: form.location.trim(),
      stock,
      minStock,
      pricePerUnit,
    };

    setSubmitting(true);
    // Stok saat form dibuka -- server menolak kalau stok sudah berubah sejak itu.
    const loadedStock = editingId ? materials.find((m) => m.id === editingId)?.stock : undefined;
    const result = editingId ? await updateMaterial(editingId, payload, loadedStock) : await addMaterial(payload);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    showToast(editingId ? `"${payload.name}" berhasil diperbarui.` : `"${payload.name}" berhasil ditambahkan.`);
    closeFormModal();
  }

  const activeProjectsForDeleteTarget = deleteTarget ? getActiveProjectsForMaterial(deleteTarget.id) : [];
  const deleteBlocked = activeProjectsForDeleteTarget.length > 0;

  async function confirmDelete() {
    if (!deleteTarget || deleteBlocked) return;
    const result = await deleteMaterial(deleteTarget.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    showToast(`"${deleteTarget.name}" berhasil dihapus.`);
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Gudang & Material</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filteredMaterials.length} dari {materials.length} jenis material ditampilkan
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: GRADIENT }}
        >
          <Plus className="h-4 w-4" />
          Tambah Material
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari material atau lokasi…"
            className={cn("w-full rounded-full border py-2 pl-9 pr-3.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:text-white", GLASS_INPUT)}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-amber-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
        >
          <option>{CATEGORY_FILTER_ALL}</option>
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm text-zinc-700 dark:text-zinc-200", GLASS_SURFACE, GLASS_BORDER)}>
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-amber-600"
          />
          Stok menipis saja
        </label>
      </div>

      <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <th className="px-5 py-3">Material</th>
                <th className="px-5 py-3">Kategori</th>
                <th className="px-5 py-3">Lokasi</th>
                <th className="px-5 py-3 text-right">Stok</th>
                <th className="px-5 py-3 text-right">Harga/Satuan</th>
                <th className="px-5 py-3 text-right">Nilai Stok</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={Boxes}
                      title={materials.length === 0 ? "Belum ada material terdaftar" : "Tidak ada hasil"}
                      description={
                        materials.length === 0
                          ? "Klik \"Tambah Material\" untuk mulai mengisi data gudang."
                          : "Coba ubah kata kunci pencarian atau filter."
                      }
                    />
                  </td>
                </tr>
              )}
              {filteredMaterials.map((m) => {
                const low = isLowStock(m);
                return (
                  <tr key={m.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="px-5 py-3 font-medium text-zinc-900 dark:text-white">
                      <span className="inline-flex items-center gap-2">
                        <Boxes className="h-4 w-4 shrink-0 text-zinc-400" />
                        {m.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{m.category}</td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        {m.location}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-zinc-900 dark:text-white">
                      {m.stock} {m.unit}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatRupiah(m.pricePerUnit)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatRupiah(m.stock * m.pricePerUnit)}
                    </td>
                    <td className="px-5 py-3">
                      {low ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                          <AlertTriangle className="h-3 w-3" />
                          Stok Menipis
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          Aman
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setQrTarget(m)}
                          title="Label QR"
                          aria-label="Label QR"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                        >
                          <QrCode className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransferTarget(m)}
                          title="Transfer stok"
                          aria-label="Transfer stok"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(m)}
                          title="Edit material"
                          aria-label="Edit material"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(m)}
                          title="Hapus material"
                          aria-label="Hapus material"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={formOpen} onClose={closeFormModal} title={editingId ? "Edit Material" : "Tambah Material Baru"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="material-name" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Nama Material
            </label>
            <input
              id="material-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="mis. Multiplek 18mm"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="material-category" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Kategori
              </label>
              <select
                id="material-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as MaterialCategory }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="material-unit" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Satuan
              </label>
              <select
                id="material-unit"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as MaterialUnit }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {ALL_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="material-location" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Lokasi/Gudang
            </label>
            <input
              id="material-location"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="mis. Gudang Cikarang"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="material-stock" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Stok Saat Ini
              </label>
              <input
                id="material-stock"
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="material-min-stock" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Ambang Stok Menipis
              </label>
              <input
                id="material-min-stock"
                type="number"
                min={0}
                value={form.minStock}
                onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="material-price-per-unit" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Harga per Satuan (Rp)
            </label>
            <input
              id="material-price-per-unit"
              type="number"
              min={0}
              step={1000}
              value={form.pricePerUnit}
              onChange={(e) => setForm((f) => ({ ...f, pricePerUnit: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeFormModal}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              style={{ background: GRADIENT }}
            >
              {submitting ? "Menyimpan…" : editingId ? "Simpan Perubahan" : "Simpan Material"}
            </button>
          </div>
        </form>
      </Modal>

      {qrTarget && (
        <QrPrintModal
          open={qrTarget !== null}
          onClose={() => setQrTarget(null)}
          value={qrTarget.id}
          title={qrTarget.name}
          subtitle={qrTarget.category}
        />
      )}

      {transferTarget && (
        <TransferStockModal
          material={transferTarget}
          open={transferTarget !== null}
          onClose={() => setTransferTarget(null)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Material"
        blocked={deleteBlocked}
        blockedMessage={
          deleteTarget && (
            <>
              <strong>{deleteTarget.name}</strong> tidak bisa dihapus — masih dialokasikan ke{" "}
              {activeProjectsForDeleteTarget.length} proyek aktif:
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                {activeProjectsForDeleteTarget.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
              Lepaskan alokasi material tersebut dari proyek lebih dulu.
            </>
          )
        }
        description={
          deleteTarget && (
            <>
              Yakin hapus <strong>{deleteTarget.name}</strong>? Tindakan ini tidak bisa dibatalkan.
            </>
          )
        }
      />
    </div>
  );
}
