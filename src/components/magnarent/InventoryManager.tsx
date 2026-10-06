"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  CalendarRange,
  MapPin,
  Package,
  Pencil,
  Plus,
  QrCode,
  ScanLine,
  Search,
  Trash2,
  Warehouse as WarehouseIcon,
  Wrench,
} from "lucide-react";
import { useMagnarentData } from "./MagnarentDataProvider";
import { MaintenanceLogModal } from "./MaintenanceLogModal";
import { InventoryUnitsModal } from "./InventoryUnitsModal";
import { SeasonalPricingModal } from "./SeasonalPricingModal";
import { BulkScanModal } from "./BulkScanModal";
import { WarehouseManagerModal } from "./WarehouseManagerModal";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { getAvailableUnitsInRange, getInventoryStatus } from "@/lib/magnarent/availability";
import { formatRupiah } from "@/lib/magnarent/pricing";
import { todayISO } from "@/lib/magnarent/date";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import type { InventoryItem } from "@/lib/magnarent/types";
import { INVENTORY_STATUS_STYLES as STATUS_STYLES } from "@/lib/status-styles";
import { GLASS_BORDER, GLASS_INPUT, GLASS_SURFACE } from "@/lib/glass";

const GRADIENT = "linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)";

const ALL_CATEGORIES = "Semua Kategori";

const EMPTY_FORM = {
  name: "",
  category: "",
  location: "",
  pricePerDay: "0",
  totalUnit: "1",
  unitMaintenance: "0",
  pricePerWeek: "",
  pricePerMonth: "",
};

function itemToForm(item: InventoryItem) {
  return {
    name: item.name,
    category: item.category,
    location: item.location,
    pricePerDay: String(item.pricePerDay),
    totalUnit: String(item.totalUnit),
    unitMaintenance: String(item.unitMaintenance),
    pricePerWeek: item.pricePerWeek !== undefined ? String(item.pricePerWeek) : "",
    pricePerMonth: item.pricePerMonth !== undefined ? String(item.pricePerMonth) : "",
  };
}

/**
 * Tabel manajemen inventaris + modal tambah/edit alat, dan konfirmasi hapus.
 * Status ketersediaan dihitung ulang setiap render dari data booking aktif —
 * bukan field statis — supaya selalu sinkron begitu ada booking baru masuk.
 * Menghapus alat yang masih dipegang booking aktif diblokir, bukan
 * dibiarkan menghasilkan data booking yang menunjuk ke alat yang sudah hilang.
 */
export function InventoryManager() {
  const { inventory, bookings, addInventoryItem, updateInventoryItem, deleteInventoryItem, getActiveBookingsForItem } =
    useMagnarentData();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  // Tahap 28a: riwayat servis alat — dibuka lewat tombol kunci pas di baris.
  const [maintenanceTarget, setMaintenanceTarget] = useState<InventoryItem | null>(null);
  // Gap #2/#3 analisis Magnarent: unit individual + QR — dibuka lewat tombol QR di baris.
  const [unitsTarget, setUnitsTarget] = useState<InventoryItem | null>(null);
  const [seasonalOpen, setSeasonalOpen] = useState(false);
  const [bulkScanOpen, setBulkScanOpen] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(inventory.map((i) => i.category))),
    [inventory]
  );
  const today = todayISO();

  const filteredInventory = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return inventory.filter((item) => {
      const matchesSearch =
        !term || item.name.toLowerCase().includes(term) || item.location.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === ALL_CATEGORIES || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [inventory, searchTerm, categoryFilter]);

  function openAddModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  function openEditModal(item: InventoryItem) {
    setEditingId(item.id);
    setForm(itemToForm(item));
    setError(null);
    setFormOpen(true);
  }

  function closeFormModal() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const totalUnit = Number(form.totalUnit);
    const unitMaintenance = Number(form.unitMaintenance);
    const pricePerDay = Number(form.pricePerDay);

    if (!form.name.trim() || !form.category.trim() || !form.location.trim()) {
      setError("Nama alat, kategori, dan lokasi wajib diisi.");
      return;
    }
    if (!Number.isFinite(pricePerDay) || pricePerDay < 0) {
      setError("Harga sewa per hari tidak valid.");
      return;
    }
    if (!Number.isFinite(totalUnit) || totalUnit < 1) {
      setError("Total unit minimal 1.");
      return;
    }
    if (!Number.isFinite(unitMaintenance) || unitMaintenance < 0 || unitMaintenance > totalUnit) {
      setError("Unit maintenance tidak valid (tidak boleh melebihi total unit).");
      return;
    }
    const pricePerWeek = form.pricePerWeek.trim() === "" ? undefined : Number(form.pricePerWeek);
    const pricePerMonth = form.pricePerMonth.trim() === "" ? undefined : Number(form.pricePerMonth);
    if (pricePerWeek !== undefined && (!Number.isFinite(pricePerWeek) || pricePerWeek < 0)) {
      setError("Harga per minggu tidak valid.");
      return;
    }
    if (pricePerMonth !== undefined && (!Number.isFinite(pricePerMonth) || pricePerMonth < 0)) {
      setError("Harga per bulan tidak valid.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      location: form.location.trim(),
      pricePerDay,
      totalUnit,
      unitMaintenance,
      pricePerWeek,
      pricePerMonth,
    };

    setSubmitting(true);
    const result = editingId
      ? await updateInventoryItem(editingId, payload)
      : await addInventoryItem(payload);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    showToast(editingId ? `"${payload.name}" berhasil diperbarui.` : `"${payload.name}" berhasil ditambahkan.`);
    closeFormModal();
  }

  const activeBookingsForDeleteTarget = deleteTarget ? getActiveBookingsForItem(deleteTarget.id) : [];
  const deleteBlocked = activeBookingsForDeleteTarget.length > 0;

  async function confirmDelete() {
    if (!deleteTarget || deleteBlocked) return;
    const result = await deleteInventoryItem(deleteTarget.id);
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
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Inventaris Alat</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filteredInventory.length} dari {inventory.length} jenis alat ditampilkan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSeasonalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 px-3.5 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            <CalendarRange className="h-4 w-4" />
            Musim Harga
          </button>
          <button
            type="button"
            onClick={() => setBulkScanOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 px-3.5 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10"
          >
            <ScanLine className="h-4 w-4" />
            Scan Massal
          </button>
          <button
            type="button"
            onClick={() => setWarehouseOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 px-3.5 py-2 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-50 dark:border-teal-500/40 dark:text-teal-300 dark:hover:bg-teal-500/10"
          >
            <WarehouseIcon className="h-4 w-4" />
            Kelola Gudang
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: GRADIENT }}
          >
            <Plus className="h-4 w-4" />
            Tambah Alat
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama alat atau lokasi…"
            className={cn("w-full rounded-full border py-2 pl-9 pr-3.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:text-white", GLASS_INPUT)}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-blue-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
        >
          <option>{ALL_CATEGORIES}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <th className="px-5 py-3">Nama Alat</th>
                <th className="px-5 py-3">Kategori</th>
                <th className="px-5 py-3">Lokasi</th>
                <th className="px-5 py-3 text-right">Harga/Hari</th>
                <th className="px-5 py-3 text-right">Total Unit</th>
                <th className="px-5 py-3 text-right">Maintenance</th>
                <th className="px-5 py-3 text-right">Tersedia Hari Ini</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={Package}
                      title={inventory.length === 0 ? "Belum ada alat terdaftar" : "Tidak ada hasil"}
                      description={
                        inventory.length === 0
                          ? "Klik \"Tambah Alat\" untuk mulai mengisi inventaris."
                          : "Coba ubah kata kunci pencarian atau filter kategori."
                      }
                    />
                  </td>
                </tr>
              )}
              {filteredInventory.map((item) => {
                const availableToday = getAvailableUnitsInRange(item, bookings, today, today);
                const status = getInventoryStatus(item, bookings);
                return (
                  <tr key={item.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="px-5 py-3 font-medium text-zinc-900 dark:text-white">
                      <span className="inline-flex items-center gap-2">
                        <Package className="h-4 w-4 shrink-0 text-zinc-400" />
                        {item.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{item.category}</td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        {item.location}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatRupiah(item.pricePerDay)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {item.totalUnit}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                      {item.unitMaintenance}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-zinc-900 dark:text-white">
                      {Math.max(availableToday, 0)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[status])}>
                        {status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setUnitsTarget(item)}
                          title="Unit individual & QR"
                          aria-label="Unit individual & QR"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                        >
                          <QrCode className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setMaintenanceTarget(item)}
                          title="Riwayat servis alat"
                          aria-label="Riwayat servis alat"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                        >
                          <Wrench className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          title="Edit alat"
                          aria-label="Edit alat"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          title="Hapus alat"
                          aria-label="Hapus alat"
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

      <Modal open={formOpen} onClose={closeFormModal} title={editingId ? "Edit Alat" : "Tambah Alat Baru"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="inventory-name" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Nama Alat
            </label>
            <input
              id="inventory-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="mis. Tenda Roder 5x10m"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="inventory-category" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Kategori
              </label>
              <input
                id="inventory-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="mis. Tenda & Struktur"
                list="kategori-list"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
              <datalist id="kategori-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="inventory-location" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Lokasi/Gudang
              </label>
              <input
                id="inventory-location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="mis. Gudang Cikarang"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label htmlFor="inventory-price-per-day" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Harga Sewa / Hari (Rp)
            </label>
            <input
              id="inventory-price-per-day"
              type="number"
              min={0}
              step={1}
              value={form.pricePerDay}
              onChange={(e) => setForm((f) => ({ ...f, pricePerDay: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="inventory-total-unit" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Total Unit
              </label>
              <input
                id="inventory-total-unit"
                type="number"
                min={1}
                value={form.totalUnit}
                onChange={(e) => setForm((f) => ({ ...f, totalUnit: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="inventory-unit-maintenance" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Unit Maintenance
              </label>
              <input
                id="inventory-unit-maintenance"
                type="number"
                min={0}
                value={form.unitMaintenance}
                onChange={(e) => setForm((f) => ({ ...f, unitMaintenance: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Harga Bertingkat (opsional)
            </p>
            <p className="mb-2 text-[11px] text-zinc-400">
              Kalau diisi, dipakai otomatis untuk sewa panjang (7 hari+/30 hari+) supaya lebih murah dari harga
              harian × jumlah hari.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="inventory-price-per-week" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Harga / Minggu (Rp)
                </label>
                <input
                  id="inventory-price-per-week"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Kosongkan kalau tidak ada"
                  value={form.pricePerWeek}
                  onChange={(e) => setForm((f) => ({ ...f, pricePerWeek: e.target.value }))}
                  className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="inventory-price-per-month" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Harga / Bulan (Rp)
                </label>
                <input
                  id="inventory-price-per-month"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Kosongkan kalau tidak ada"
                  value={form.pricePerMonth}
                  onChange={(e) => setForm((f) => ({ ...f, pricePerMonth: e.target.value }))}
                  className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
                />
              </div>
            </div>
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
              {submitting ? "Menyimpan…" : editingId ? "Simpan Perubahan" : "Simpan Alat"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Alat"
        blocked={deleteBlocked}
        blockedMessage={
          deleteTarget && (
            <>
              <strong>{deleteTarget.name}</strong> tidak bisa dihapus — masih ada{" "}
              {activeBookingsForDeleteTarget.length} booking aktif yang memakainya:
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                {activeBookingsForDeleteTarget.map((b) => (
                  <li key={b.id}>
                    {b.namaKlien} ({b.tanggalMulai} s/d {b.tanggalSelesai})
                  </li>
                ))}
              </ul>
              Batalkan atau selesaikan booking tersebut lebih dulu.
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

      {maintenanceTarget && (
        <MaintenanceLogModal
          itemId={maintenanceTarget.id}
          itemName={maintenanceTarget.name}
          open={maintenanceTarget !== null}
          onClose={() => setMaintenanceTarget(null)}
        />
      )}

      {unitsTarget && (
        <InventoryUnitsModal item={unitsTarget} onClose={() => setUnitsTarget(null)} />
      )}
      {seasonalOpen && <SeasonalPricingModal inventory={inventory} onClose={() => setSeasonalOpen(false)} />}
      {bulkScanOpen && <BulkScanModal onClose={() => setBulkScanOpen(false)} />}
      {warehouseOpen && <WarehouseManagerModal onClose={() => setWarehouseOpen(false)} />}
    </div>
  );
}
