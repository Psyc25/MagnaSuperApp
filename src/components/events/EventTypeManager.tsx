"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/cn";
import {
  addTemplateItem,
  bulkImportTemplateItems,
  createEventType,
  deleteEventType,
  deleteTemplateItem,
  setEventTypeActive,
  updateEventType,
  updateTemplateItem,
} from "@/lib/events/actions";
import { parseChecklistSheet } from "@/lib/events/importParser";
import type { EventType, EventTypeTemplateItem, TemplateImportRow } from "@/lib/events/types";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { loadXlsx } from "@/lib/shared/xlsx";
import { useSyncedState } from "@/lib/shared/use-synced-state";

function emptyEventTypeForm() {
  return { name: "", description: "" };
}

function emptyItemForm() {
  return { category: "", itemName: "", detail: "", qtyInfo: "", notes: "" };
}

/**
 * Halaman kelola "Jenis Event" + template checklist standarnya (Tahap B
 * modul Tracking Progress Event) -- daftar jenis event TERBUKA (Admin bisa
 * terus menambah), tiap jenis punya template checklist yang di-clone jadi
 * checklist AKTUAL saat event baru dibuat dari jenis itu (Tahap C).
 *
 * Data (jenis event + SEMUA template item lintas jenis) dimuat sekaligus
 * dari Server Component (lihat page.tsx) lalu difilter di sini per jenis
 * yang dipilih -- sama seperti pola ProductManager memuat seluruh katalog
 * produk sekaligus, karena jumlah totalnya wajar untuk dimuat langsung
 * (tiap jenis event biasanya puluhan item).
 */
export function EventTypeManager({
  initialEventTypes,
  initialTemplateItems,
}: {
  initialEventTypes: EventType[];
  initialTemplateItems: EventTypeTemplateItem[];
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [eventTypes, setEventTypes] = useSyncedState(initialEventTypes);
  const [templateItems, setTemplateItems] = useSyncedState(initialTemplateItems);

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(initialEventTypes[0]?.id ?? null);
  const selectedType = useMemo(
    () => eventTypes.find((t) => t.id === selectedTypeId) ?? null,
    [eventTypes, selectedTypeId]
  );

  const itemsForSelectedType = useMemo(
    () =>
      templateItems
        .filter((i) => i.eventTypeId === selectedTypeId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [templateItems, selectedTypeId]
  );
  const groupedItems = useMemo(() => {
    const map = new Map<string, EventTypeTemplateItem[]>();
    for (const item of itemsForSelectedType) {
      const bucket = map.get(item.category) ?? [];
      bucket.push(item);
      map.set(item.category, bucket);
    }
    return Array.from(map.entries()).map(([category, list]) => ({ category, list }));
  }, [itemsForSelectedType]);

  // --- Modal: tambah/edit jenis event ---
  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<EventType | null>(null);
  const [typeForm, setTypeForm] = useState(emptyEventTypeForm);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [typeSubmitting, setTypeSubmitting] = useState(false);
  const [togglingTypeId, setTogglingTypeId] = useState<string | null>(null);
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<EventType | null>(null);
  const [deletingType, setDeletingType] = useState(false);

  function openAddType() {
    setEditingType(null);
    setTypeForm(emptyEventTypeForm());
    setTypeError(null);
    setTypeFormOpen(true);
  }

  function openEditType(t: EventType) {
    setEditingType(t);
    setTypeForm({ name: t.name, description: t.description ?? "" });
    setTypeError(null);
    setTypeFormOpen(true);
  }

  async function handleTypeSubmit(e: FormEvent) {
    e.preventDefault();
    if (!typeForm.name.trim()) {
      setTypeError("Nama jenis event wajib diisi.");
      return;
    }
    setTypeSubmitting(true);
    const result = editingType
      ? await updateEventType(editingType.id, typeForm)
      : await createEventType(typeForm);
    setTypeSubmitting(false);

    if (!result.ok) {
      setTypeError(result.error);
      return;
    }
    showToast(editingType ? "Jenis event diperbarui." : "Jenis event baru ditambahkan.");
    setTypeFormOpen(false);
    router.refresh();
  }

  async function handleToggleTypeActive(t: EventType) {
    setTogglingTypeId(t.id);
    const result = await setEventTypeActive(t.id, !t.isActive);
    setTogglingTypeId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setEventTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, isActive: !x.isActive } : x)));
    showToast(t.isActive ? "Jenis event dinonaktifkan." : "Jenis event diaktifkan kembali.");
  }

  async function confirmDeleteType() {
    if (!deleteTypeTarget) return;
    setDeletingType(true);
    const result = await deleteEventType(deleteTypeTarget.id);
    setDeletingType(false);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTypeTarget(null);
      return;
    }
    setEventTypes((prev) => prev.filter((x) => x.id !== deleteTypeTarget.id));
    setTemplateItems((prev) => prev.filter((i) => i.eventTypeId !== deleteTypeTarget.id));
    setSelectedTypeId((prev) => (prev === deleteTypeTarget.id ? null : prev));
    showToast("Jenis event dihapus.");
    setDeleteTypeTarget(null);
  }

  // --- Modal: tambah/edit item template ---
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EventTypeTemplateItem | null>(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [itemError, setItemError] = useState<string | null>(null);
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] = useState<EventTypeTemplateItem | null>(null);

  function openAddItem() {
    setEditingItem(null);
    setItemForm({ ...emptyItemForm(), category: groupedItems[groupedItems.length - 1]?.category ?? "" });
    setItemError(null);
    setItemFormOpen(true);
  }

  function openEditItem(item: EventTypeTemplateItem) {
    setEditingItem(item);
    setItemForm({
      category: item.category,
      itemName: item.itemName,
      detail: item.detail ?? "",
      qtyInfo: item.qtyInfo ?? "",
      notes: item.notes ?? "",
    });
    setItemError(null);
    setItemFormOpen(true);
  }

  async function handleItemSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedTypeId) return;
    if (!itemForm.category.trim() || !itemForm.itemName.trim()) {
      setItemError("Kategori dan nama item wajib diisi.");
      return;
    }
    setItemSubmitting(true);
    const result = editingItem
      ? await updateTemplateItem(editingItem.id, itemForm)
      : await addTemplateItem(selectedTypeId, itemForm, itemsForSelectedType.length * 10);
    setItemSubmitting(false);

    if (!result.ok) {
      setItemError(result.error);
      return;
    }
    showToast(editingItem ? "Item template diperbarui." : "Item template ditambahkan.");
    setItemFormOpen(false);
    router.refresh();
  }

  async function confirmDeleteItem() {
    if (!deleteItemTarget) return;
    const result = await deleteTemplateItem(deleteItemTarget.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteItemTarget(null);
      return;
    }
    setTemplateItems((prev) => prev.filter((i) => i.id !== deleteItemTarget.id));
    showToast("Item template dihapus.");
    setDeleteItemTarget(null);
  }

  // --- Modal: import Excel/CSV ---
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<TemplateImportRow[] | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");
  const [importSummary, setImportSummary] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(
    null
  );
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  function openImportModal() {
    setImportRows(null);
    setImportFileName(null);
    setImportSummary(null);
    setImportError(null);
    setImportMode("replace");
    setImportOpen(true);
  }

  function closeImportModal() {
    setImportOpen(false);
    setImportRows(null);
    setImportFileName(null);
    setImportSummary(null);
    setImportError(null);
    if (importInputRef.current) importInputRef.current.value = "";
  }

  async function handleImportFileChange() {
    const file = importInputRef.current?.files?.[0];
    setImportSummary(null);
    setImportError(null);
    if (!file) {
      setImportRows(null);
      setImportFileName(null);
      return;
    }

    setImportParsing(true);
    setImportFileName(file.name);
    try {
      // Import dinamis -- lihat komentar di src/lib/shared/xlsx.ts.
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const raw2d = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];

      const { rows, error } = parseChecklistSheet(raw2d);
      if (error) {
        setImportError(error);
        setImportRows(null);
        return;
      }
      if (rows.length === 0) {
        setImportError("Tidak ada baris item yang bisa dibaca dari file ini.");
        setImportRows(null);
        return;
      }
      setImportRows(rows);
    } catch (err) {
      console.error("[events] Gagal membaca file:", err);
      setImportError("Gagal membaca file -- pastikan formatnya .xlsx, .xls, atau .csv.");
      setImportRows(null);
    } finally {
      setImportParsing(false);
    }
  }

  async function handleImportConfirm() {
    if (!importRows || importRows.length === 0 || !selectedTypeId) return;
    setImportSubmitting(true);
    setImportError(null);
    const result = await bulkImportTemplateItems(selectedTypeId, importRows, importMode);
    setImportSubmitting(false);

    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    setImportSummary(result.summary);
    setImportRows(null);
    showToast(`Import selesai: ${result.summary.inserted} item tersimpan.`);
    router.refresh();
  }

  const importCategoryCounts = useMemo(() => {
    if (!importRows) return [];
    const map = new Map<string, number>();
    for (const row of importRows) map.set(row.category, (map.get(row.category) ?? 0) + 1);
    return Array.from(map.entries());
  }, [importRows]);

  return (
    <div className="space-y-6">
      <section className={cn("rounded-2xl border p-5", GLASS_SURFACE, GLASS_BORDER)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Jenis Event</h2>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
              Daftar terbuka -- tambah jenis baru kapan saja sesuai kebutuhan event yang datang.
            </p>
          </div>
          <button
            type="button"
            onClick={openAddType}
            className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Jenis Event
          </button>
        </div>

        {eventTypes.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Belum ada jenis event"
            description='Klik "Tambah Jenis Event" untuk mulai, mis. "KOL Gathering" atau "Wedding".'
          />
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {eventTypes.map((t) => {
              const active = t.id === selectedTypeId;
              const count = templateItems.filter((i) => i.eventTypeId === t.id).length;
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-1.5 py-1 pl-3.5 text-sm transition-colors",
                    active
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/5",
                    !t.isActive && "opacity-50"
                  )}
                >
                  <button type="button" onClick={() => setSelectedTypeId(t.id)} className="font-semibold">
                    {t.name}
                    <span className="ml-1.5 font-normal text-xs opacity-70">({count} item)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditType(t)}
                    title="Edit jenis event"
                    className="rounded-full p-1 text-current opacity-60 hover:opacity-100"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleTypeActive(t)}
                    disabled={togglingTypeId === t.id}
                    title={t.isActive ? "Nonaktifkan" : "Aktifkan"}
                    className="rounded-full p-1 text-current opacity-60 hover:opacity-100 disabled:opacity-30"
                  >
                    {togglingTypeId === t.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : t.isActive ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Ban className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTypeTarget(t)}
                    title="Hapus permanen"
                    className="rounded-full p-1 text-current opacity-60 hover:bg-rose-50 hover:text-rose-600 hover:opacity-100 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {selectedType && (
        <section className={cn("rounded-2xl border p-5", GLASS_SURFACE, GLASS_BORDER)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                Template Checklist -- {selectedType.name}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                {itemsForSelectedType.length} item -- di-clone jadi checklist aktual tiap kali event baru dibuat dari
                jenis ini.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openImportModal}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Import Excel/CSV
              </button>
              <button
                type="button"
                onClick={openAddItem}
                className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Item
              </button>
            </div>
          </div>

          {groupedItems.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Belum ada item template"
              description='Klik "Tambah Item" atau "Import Excel/CSV" untuk mengisi checklist standar jenis event ini.'
            />
          ) : (
            <div className="mt-4 space-y-5">
              {groupedItems.map(({ category, list }) => (
                <div key={category}>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {category}
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-zinc-100 dark:border-zinc-800">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
                          <th className="px-3 py-2 font-medium">Item</th>
                          <th className="px-3 py-2 font-medium">Detail</th>
                          <th className="px-3 py-2 font-medium">Qty/Durasi</th>
                          <th className="px-3 py-2 font-medium">Keterangan</th>
                          <th className="px-3 py-2 text-right font-medium">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((item) => (
                          <tr key={item.id} className="border-t border-zinc-100 dark:border-zinc-800">
                            <td className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200">{item.itemName}</td>
                            <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{item.detail || "—"}</td>
                            <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{item.qtyInfo || "—"}</td>
                            <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{item.notes || "—"}</td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditItem(item)}
                                  title="Edit item"
                                  className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteItemTarget(item)}
                                  title="Hapus item"
                                  className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Modal tambah/edit jenis event */}
      <Modal
        open={typeFormOpen}
        onClose={() => setTypeFormOpen(false)}
        title={editingType ? "Edit Jenis Event" : "Tambah Jenis Event"}
      >
        <form onSubmit={handleTypeSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Nama Jenis Event</label>
            <input
              value={typeForm.name}
              onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="mis. KOL Gathering"
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Deskripsi <span className="font-normal text-zinc-400">(opsional)</span>
            </label>
            <textarea
              value={typeForm.description}
              onChange={(e) => setTypeForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </div>
          {typeError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {typeError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setTypeFormOpen(false)}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={typeSubmitting}
              className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
            >
              {typeSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal tambah/edit item template */}
      <Modal
        open={itemFormOpen}
        onClose={() => setItemFormOpen(false)}
        title={editingItem ? "Edit Item Template" : "Tambah Item Template"}
      >
        <form onSubmit={handleItemSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Kategori</label>
            <input
              value={itemForm.category}
              onChange={(e) => setItemForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="mis. A. VENUE"
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Nama Item</label>
            <input
              value={itemForm.itemName}
              onChange={(e) => setItemForm((f) => ({ ...f, itemName: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Detail <span className="font-normal text-zinc-400">(opsional)</span>
              </label>
              <input
                value={itemForm.detail}
                onChange={(e) => setItemForm((f) => ({ ...f, detail: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Qty/Durasi <span className="font-normal text-zinc-400">(opsional)</span>
              </label>
              <input
                value={itemForm.qtyInfo}
                onChange={(e) => setItemForm((f) => ({ ...f, qtyInfo: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Keterangan <span className="font-normal text-zinc-400">(opsional)</span>
            </label>
            <input
              value={itemForm.notes}
              onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </div>
          {itemError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {itemError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setItemFormOpen(false)}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={itemSubmitting}
              className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
            >
              {itemSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteItemTarget}
        onClose={() => setDeleteItemTarget(null)}
        onConfirm={confirmDeleteItem}
        title="Hapus Item Template"
        description={`Hapus item "${deleteItemTarget?.itemName}" dari template ini?`}
        confirmLabel="Hapus"
      />

      <ConfirmDialog
        open={!!deleteTypeTarget}
        onClose={() => setDeleteTypeTarget(null)}
        onConfirm={confirmDeleteType}
        title="Hapus Jenis Event"
        description={`Hapus permanen jenis event "${deleteTypeTarget?.name}" beserta seluruh template checklist-nya? Hanya bisa dilakukan kalau belum pernah dipakai event manapun -- kalau sudah pernah dipakai, nonaktifkan saja.`}
        confirmLabel={deletingType ? "Menghapus…" : "Hapus"}
      />

      {/* Modal import Excel/CSV */}
      <Modal open={importOpen} onClose={closeImportModal} title={`Import Template -- ${selectedType?.name ?? ""}`}>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Pilih file (.xlsx, .xls, atau .csv)
            </label>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFileChange}
              className="w-full rounded-xl border border-zinc-300 bg-transparent px-3.5 py-2.5 text-sm outline-none file:mr-3 file:rounded-full file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-violet-700 dark:border-zinc-700 dark:file:bg-violet-500/10 dark:file:text-violet-300"
            />
            <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              Mendukung file yang punya kolom &ldquo;Kategori&rdquo; eksplisit, ATAU checklist dengan baris judul kategori
              tersendiri (mis. &ldquo;A. VENUE&rdquo;) diikuti baris-baris item -- persis seperti contoh checklist Owner. Kolom
              yang dikenali: No, Item, Detail, Qty/Durasi, Keterangan (kolom Status/PIC di file sumber dilewati --
              itu urusan checklist AKTUAL per event, bukan template).
            </p>
          </div>

          {importRows && !importSummary && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Kalau template ini sudah ada isinya
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode("replace")}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                    importMode === "replace"
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
                  )}
                >
                  Ganti semua item lama
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode("append")}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                    importMode === "append"
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
                  )}
                >
                  Tambahkan ke yang sudah ada
                </button>
              </div>
            </div>
          )}

          {importParsing && <p className="text-sm text-zinc-500 dark:text-zinc-400">Membaca file…</p>}

          {importError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {importError}
            </p>
          )}

          {importRows && !importSummary && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm dark:border-zinc-700 dark:bg-white/5">
              <p className="font-semibold text-zinc-700 dark:text-zinc-200">
                Ditemukan {importRows.length} baris item di &quot;{importFileName}&quot;, {importCategoryCounts.length}{" "}
                kategori:
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {importCategoryCounts.slice(0, 12).map(([category, count]) => (
                  <li key={category}>
                    {category} -- {count} item
                  </li>
                ))}
                {importCategoryCounts.length > 12 && <li>…dan {importCategoryCounts.length - 12} kategori lainnya.</li>}
              </ul>
            </div>
          )}

          {importSummary && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
              <p className="font-semibold">{importSummary.inserted} item berhasil disimpan.</p>
              {importSummary.errors.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-emerald-700 dark:text-emerald-300">
                  {importSummary.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {importSummary.errors.length > 10 && <li>…dan {importSummary.errors.length - 10} lainnya.</li>}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeImportModal}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              {importSummary ? "Tutup" : "Batal"}
            </button>
            {!importSummary && (
              <button
                type="button"
                onClick={handleImportConfirm}
                disabled={!importRows || importSubmitting}
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
              >
                <UploadCloud className="h-4 w-4" />
                {importSubmitting ? "Memproses…" : "Proses Import"}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
