"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, PackagePlus, Plus, Search, Trash2, XCircle } from "lucide-react";
import { useProductionData } from "./ProductionDataProvider";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateID, formatRupiah, todayISO } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/lib/production/types";
import type { Vendor } from "@/lib/production/extras-types";
import { PURCHASE_ORDER_STATUS_STYLES as STATUS_STYLES } from "@/lib/status-styles";
import { GLASS_BORDER, GLASS_INPUT, GLASS_SURFACE } from "@/lib/glass";

const GRADIENT = "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)";

const ALL_STATUSES: PurchaseOrderStatus[] = ["Dipesan", "Diterima", "Dibatalkan"];
const ALL_FILTER = "Semua Status";

function emptyForm() {
  return {
    materialId: "",
    vendorId: "",
    supplierName: "",
    qty: "1",
    unitPrice: "0",
    orderDate: todayISO(),
    expectedDate: "",
    catatan: "",
  };
}

/**
 * Modul Pembelian/PO — jawaban atas badge "stok menipis" di tab Material
 * yang sejauh ini tidak punya langkah lanjut di aplikasi (harus dicatat
 * manual di luar sistem begitu ada pemesanan ulang ke supplier). Begitu PO
 * ditandai "Diterima", stok material terkait otomatis bertambah lewat
 * fungsi database `receive_purchase_order` (migrasi 0018) — dikonfirmasi
 * dulu lewat dialog karena aksi ini mengubah stok fisik secara permanen.
 */
export function PurchaseOrderManager({ vendors = [] }: { vendors?: Vendor[] }) {
  const { materials, purchaseOrders, addPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder, deletePurchaseOrder } =
    useProductionData();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);

  const materialName = useCallback(
    (id?: string) => (id ? materials.find((m) => m.id === id)?.name ?? "—" : "—"),
    [materials]
  );

  /** Pilih vendor terdaftar (Tahap 44 — gap #5 analisis-gap-production.md) → auto-isi nama supplier (tetap bisa diedit manual sesudahnya, mis. kalau beli dari cabang/kontak lain vendor yang sama). */
  function handlePickVendor(vendorId: string) {
    const picked = vendors.find((v) => v.id === vendorId);
    setForm((f) => ({ ...f, vendorId, supplierName: picked ? picked.name : f.supplierName }));
  }

  const sorted = useMemo(
    () => [...purchaseOrders].sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [purchaseOrders]
  );

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sorted.filter((po) => {
      const matchesSearch =
        !term ||
        po.supplierName.toLowerCase().includes(term) ||
        materialName(po.materialId).toLowerCase().includes(term);
      const matchesStatus = statusFilter === ALL_FILTER || po.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [sorted, searchTerm, statusFilter, materialName]);

  function openAddModal() {
    setForm(emptyForm());
    setError(null);
    setFormOpen(true);
  }

  function closeFormModal() {
    setFormOpen(false);
    setForm(emptyForm());
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const qty = Number(form.qty);
    const unitPrice = Number(form.unitPrice);

    if (!form.supplierName.trim()) {
      setError("Nama supplier wajib diisi.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Qty harus lebih dari 0.");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Harga satuan tidak valid.");
      return;
    }
    if (!form.orderDate) {
      setError("Tanggal pesan wajib diisi.");
      return;
    }

    setSubmitting(true);
    const result = await addPurchaseOrder({
      materialId: form.materialId || undefined,
      vendorId: form.vendorId || undefined,
      supplierName: form.supplierName.trim(),
      qty,
      unitPrice,
      orderDate: form.orderDate,
      expectedDate: form.expectedDate || undefined,
      catatan: form.catatan.trim() || undefined,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast(`PO ke "${form.supplierName.trim()}" berhasil dicatat.`);
    closeFormModal();
  }

  async function confirmReceive() {
    if (!receiveTarget) return;
    setActingId(receiveTarget.id);
    const result = await receivePurchaseOrder(receiveTarget.id);
    setActingId(null);
    setReceiveTarget(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(
      receiveTarget.materialId
        ? `PO diterima — stok "${materialName(receiveTarget.materialId)}" bertambah ${receiveTarget.qty}.`
        : "PO ditandai diterima."
    );
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setActingId(cancelTarget.id);
    const result = await cancelPurchaseOrder(cancelTarget.id);
    setActingId(null);
    setCancelTarget(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("PO dibatalkan.");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActingId(deleteTarget.id);
    const result = await deletePurchaseOrder(deleteTarget.id);
    setActingId(null);
    setDeleteTarget(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("PO berhasil dihapus.");
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Daftar Purchase Order</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filtered.length} dari {purchaseOrders.length} PO ditampilkan
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: GRADIENT }}
        >
          <Plus className="h-4 w-4" />
          Buat PO
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari supplier atau material…"
            className={cn("w-full rounded-full border py-2 pl-9 pr-3.5 text-sm text-zinc-900 outline-none ring-orange-500/40 placeholder:text-zinc-400 focus:ring-2 dark:text-white", GLASS_INPUT)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-orange-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
        >
          <option>{ALL_FILTER}</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Material</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3">Tgl Pesan</th>
                <th className="px-5 py-3">Perkiraan Tiba</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={PackagePlus}
                      title={purchaseOrders.length === 0 ? "Belum ada purchase order" : "Tidak ada hasil"}
                      description={
                        purchaseOrders.length === 0
                          ? 'Klik "Buat PO" untuk mulai mencatat pesanan ke supplier.'
                          : "Coba ubah kata kunci pencarian atau filter status."
                      }
                    />
                  </td>
                </tr>
              )}
              {filtered.map((po) => (
                <tr key={po.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-5 py-3 font-medium text-zinc-900 dark:text-white">{po.supplierName}</td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{materialName(po.materialId)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{po.qty}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatRupiah(po.qty * po.unitPrice)}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                    {formatDateID(po.orderDate)}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                    {po.expectedDate ? formatDateID(po.expectedDate) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[po.status])}>
                      {po.status}
                    </span>
                    {po.status === "Diterima" && po.receivedDate && (
                      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                        {formatDateID(po.receivedDate)}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      {po.status === "Dipesan" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setReceiveTarget(po)}
                            disabled={actingId === po.id}
                            title="Tandai diterima (stok bertambah)"
                            aria-label="Tandai diterima (stok bertambah)"
                            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCancelTarget(po)}
                            disabled={actingId === po.id}
                            title="Batalkan PO"
                            aria-label="Batalkan PO"
                            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {po.status !== "Diterima" && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(po)}
                          disabled={actingId === po.id}
                          title="Hapus PO"
                          aria-label="Hapus PO"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={formOpen} onClose={closeFormModal} title="Buat Purchase Order">
        <form onSubmit={handleSubmit} className="space-y-4">
          {vendors.length > 0 && (
            <div>
              <label htmlFor="po-vendor" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Vendor Terdaftar (opsional)
              </label>
              <select
                id="po-vendor"
                value={form.vendorId}
                onChange={(e) => handlePickVendor(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-orange-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                <option value="">— Tidak dari database vendor —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.category})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="po-supplier-name" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Supplier
            </label>
            <input
              id="po-supplier-name"
              value={form.supplierName}
              onChange={(e) => setForm((f) => ({ ...f, vendorId: "", supplierName: e.target.value }))}
              placeholder="mis. Toko Bangunan Jaya Abadi"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-orange-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="po-material" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Material (opsional)
            </label>
            <select
              id="po-material"
              value={form.materialId}
              onChange={(e) => setForm((f) => ({ ...f, materialId: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-orange-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              <option value="">Belum terdaftar di Gudang & Material</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (stok {m.stock} {m.unit}, min {m.minStock})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="po-qty" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Qty</label>
              <input
                id="po-qty"
                type="number"
                min={1}
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-orange-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="po-unit-price" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Harga Satuan (Rp)
              </label>
              <input
                id="po-unit-price"
                type="number"
                min={0}
                value={form.unitPrice}
                onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-orange-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          {Number.isFinite(Number(form.qty)) && Number.isFinite(Number(form.unitPrice)) && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Total: {formatRupiah((Number(form.qty) || 0) * (Number(form.unitPrice) || 0))}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="po-order-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Pesan
              </label>
              <input
                id="po-order-date"
                type="date"
                value={form.orderDate}
                onChange={(e) => setForm((f) => ({ ...f, orderDate: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-orange-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="po-expected-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Perkiraan Tiba (opsional)
              </label>
              <input
                id="po-expected-date"
                type="date"
                value={form.expectedDate}
                onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-orange-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="po-catatan" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Catatan (opsional)
            </label>
            <input
              id="po-catatan"
              value={form.catatan}
              onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
              placeholder="mis. nomor invoice supplier, kontak"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-orange-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
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
              {submitting ? "Menyimpan…" : "Buat PO"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={receiveTarget !== null}
        onClose={() => setReceiveTarget(null)}
        onConfirm={confirmReceive}
        title="Tandai PO Diterima"
        description={
          receiveTarget && (
            <>
              Stok <strong>{materialName(receiveTarget.materialId)}</strong> akan bertambah{" "}
              <strong>{receiveTarget.qty}</strong> begitu PO dari <strong>{receiveTarget.supplierName}</strong> ini
              ditandai diterima. Lanjutkan?
            </>
          )
        }
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        title="Batalkan PO"
        description={
          cancelTarget && (
            <>
              Yakin batalkan PO ke <strong>{cancelTarget.supplierName}</strong>? Stok tidak akan berubah.
            </>
          )
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus PO"
        description={
          deleteTarget && (
            <>
              Yakin hapus riwayat PO ke <strong>{deleteTarget.supplierName}</strong>? Tindakan ini tidak bisa
              dibatalkan.
            </>
          )
        }
      />
    </div>
  );
}
