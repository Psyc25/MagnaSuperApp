"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import {
  Building2,
  CalendarClock,
  FileSpreadsheet,
  Link2,
  ListChecks,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/cn";
import { formatDateID } from "@/lib/shared/utils";
import {
  addEventChecklistItem,
  addEventLink,
  bulkImportEventChecklistItems,
  deleteEvent,
  deleteEventChecklistItem,
  removeEventLink,
  searchLinkableSources,
  updateEventChecklistItem,
  updateEventStatus,
} from "@/lib/events/actions";
import { parseChecklistSheet } from "@/lib/events/importParser";
import {
  CHECKLIST_PHASE_LABELS,
  CHECKLIST_TEAM_PRESETS,
  EVENT_SOURCE_LABELS,
  EVENT_STATUSES,
  type EventChecklistItem,
  type EventLink,
  type EventSourceType,
  type EventStatus,
  type EventSummary,
  type LinkableSource,
  type TemplateImportRow,
  type VendorOption,
} from "@/lib/events/types";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { loadXlsx } from "@/lib/shared/xlsx";
import { useSyncedState } from "@/lib/shared/use-synced-state";

function emptyItemForm() {
  return {
    category: "",
    itemName: "",
    detail: "",
    qtyInfo: "",
    notes: "",
    vendorId: "",
    team: "",
    dueDate: "",
    needsProduction: true,
  };
}

const STATUS_BADGE: Record<EventStatus, string> = {
  Berjalan: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  Selesai: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  Dibatalkan: "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400",
};

const SOURCE_TABS: EventSourceType[] = ["magnarent_booking", "magnative_project", "production_booth_project"];

/**
 * Detail satu event (Tahap C) -- kelola checklist AKTUAL (clone dari
 * template, atau kosong lalu diisi manual/import) dan kaitan ke booking/
 * proyek yang sudah ada. HANYA akses penuh (halaman ini, lihat page.tsx),
 * sama seperti daftar event -- update status/PIC tiap item terbuka untuk 3
 * divisi operasional (RLS `event_checklist_items_update`), tapi UI-nya
 * disatukan di halaman terpisah "Papan Tracking" (Tahap D), bukan di sini.
 */
export function EventDetailManager({
  event,
  initialChecklistItems,
  initialLinks,
  vendorOptions,
}: {
  event: EventSummary;
  initialChecklistItems: EventChecklistItem[];
  initialLinks: EventLink[];
  /** Dropdown "Kaitkan Vendor" di form checklist item -- basis data
   * `magnative_vendors`, lihat komentar `VendorOption` di types.ts
   * (rekomendasi 3 laporan gap-event vs SOP, migrasi 0063). */
  vendorOptions: VendorOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [checklistItems, setChecklistItems] = useSyncedState(initialChecklistItems);
  const [links, setLinks] = useSyncedState(initialLinks);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleteEventConfirmOpen, setDeleteEventConfirmOpen] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);

  const groupedItems = useMemo(() => {
    const map = new Map<string, EventChecklistItem[]>();
    for (const item of [...checklistItems].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const bucket = map.get(item.category) ?? [];
      bucket.push(item);
      map.set(item.category, bucket);
    }
    return Array.from(map.entries()).map(([category, list]) => ({ category, list }));
  }, [checklistItems]);

  async function handleStatusChange(status: EventStatus) {
    setStatusUpdating(true);
    const result = await updateEventStatus(event.id, status);
    setStatusUpdating(false);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Status event diubah ke "${status}".`);
    router.refresh();
  }

  async function handleDeleteEvent() {
    setDeletingEvent(true);
    const result = await deleteEvent(event.id);
    setDeletingEvent(false);
    setDeleteEventConfirmOpen(false);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("Event dihapus.");
    router.push("/dashboard/admin/events");
  }

  // --- Modal: tambah/edit item checklist ---
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EventChecklistItem | null>(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [itemError, setItemError] = useState<string | null>(null);
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] = useState<EventChecklistItem | null>(null);

  function openAddItem() {
    setEditingItem(null);
    setItemForm({ ...emptyItemForm(), category: groupedItems[groupedItems.length - 1]?.category ?? "" });
    setItemError(null);
    setItemFormOpen(true);
  }

  function openEditItem(item: EventChecklistItem) {
    setEditingItem(item);
    setItemForm({
      category: item.category,
      itemName: item.itemName,
      detail: item.detail ?? "",
      qtyInfo: item.qtyInfo ?? "",
      notes: item.notes ?? "",
      vendorId: item.vendorId ?? "",
      team: item.team ?? "",
      dueDate: item.dueDate ?? "",
      needsProduction: item.needsProduction,
    });
    setItemError(null);
    setItemFormOpen(true);
  }

  async function handleItemSubmit(e: FormEvent) {
    e.preventDefault();
    if (!itemForm.category.trim() || !itemForm.itemName.trim()) {
      setItemError("Kategori dan nama item wajib diisi.");
      return;
    }
    setItemSubmitting(true);
    const result = editingItem
      ? await updateEventChecklistItem(editingItem.id, event.id, itemForm)
      : await addEventChecklistItem(event.id, itemForm, checklistItems.length * 10);
    setItemSubmitting(false);

    if (!result.ok) {
      setItemError(result.error);
      return;
    }
    showToast(editingItem ? "Item checklist diperbarui." : "Item checklist ditambahkan.");
    setItemFormOpen(false);
    router.refresh();
  }

  async function confirmDeleteItem() {
    if (!deleteItemTarget) return;
    const result = await deleteEventChecklistItem(deleteItemTarget.id, event.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteItemTarget(null);
      return;
    }
    setChecklistItems((prev) => prev.filter((i) => i.id !== deleteItemTarget.id));
    showToast("Item checklist dihapus.");
    setDeleteItemTarget(null);
  }

  // --- Modal: import Excel/CSV ---
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<TemplateImportRow[] | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");
  const [importNeedsProduction, setImportNeedsProduction] = useState(true);
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
    setImportNeedsProduction(true);
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
    if (!importRows || importRows.length === 0) return;
    setImportSubmitting(true);
    setImportError(null);
    const result = await bulkImportEventChecklistItems(event.id, importRows, importMode, importNeedsProduction);
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

  // --- Kaitan ke data divisi ---
  const [linkTab, setLinkTab] = useState<EventSourceType>("magnarent_booking");
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<LinkableSource[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkAddingId, setLinkAddingId] = useState<string | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<EventLink | null>(null);

  async function handleLinkSearch(e: FormEvent) {
    e.preventDefault();
    setLinkSearching(true);
    const results = await searchLinkableSources(linkTab, linkQuery);
    setLinkSearching(false);
    setLinkResults(results);
  }

  async function handleAddLink(source: LinkableSource) {
    setLinkAddingId(source.sourceId);
    const result = await addEventLink(event.id, source.sourceType, source.sourceId, source.label);
    setLinkAddingId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("Berhasil dikaitkan.");
    setLinkResults((prev) => prev.filter((r) => r.sourceId !== source.sourceId));
    router.refresh();
  }

  async function confirmUnlink() {
    if (!unlinkTarget) return;
    const result = await removeEventLink(unlinkTarget.id, event.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setUnlinkTarget(null);
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== unlinkTarget.id));
    showToast("Kaitan dilepas.");
    setUnlinkTarget(null);
  }

  const linkedIds = useMemo(() => new Set(links.map((l) => `${l.sourceType}:${l.sourceId}`)), [links]);

  return (
    <div className="space-y-6">
      <section className={cn("rounded-2xl border p-5", GLASS_SURFACE, GLASS_BORDER)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{event.name}</h2>
            {event.clientName && <p className="text-sm text-zinc-500 dark:text-zinc-400">{event.clientName}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400 dark:text-zinc-500">
              {event.eventTypeName && <span>Jenis: {event.eventTypeName}</span>}
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {event.location}
                </span>
              )}
              {(event.startDate || event.endDate) && (
                <span>
                  {event.startDate ?? "?"} – {event.endDate ?? "?"}
                </span>
              )}
            </div>
            {event.notes && <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{event.notes}</p>}
          </div>
          <div className="flex items-center gap-2">
            <NextLink
              href={`/dashboard/tracking-event/${event.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Papan Tracking
            </NextLink>
            <span className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", STATUS_BADGE[event.status])}>
              {event.status}
            </span>
            <select
              value={event.status}
              disabled={statusUpdating}
              onChange={(e) => handleStatusChange(e.target.value as EventStatus)}
              className="rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            >
              {EVENT_STATUSES.map((s) => (
                <option key={s} value={s} disabled={s === event.status}>
                  {s === event.status ? `${s} (status saat ini)` : `Ubah ke: ${s}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setDeleteEventConfirmOpen(true)}
              title="Hapus event permanen"
              className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      <section className={cn("rounded-2xl border p-5", GLASS_SURFACE, GLASS_BORDER)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Checklist</h2>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
              {checklistItems.length} item -- status &amp; PIC tiap item diisi bersama 3 divisi di Papan Tracking.
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
            icon={FileSpreadsheet}
            title="Checklist masih kosong"
            description='Klik "Tambah Item" atau "Import Excel/CSV" untuk mengisi checklist event ini.'
          />
        ) : (
          <div className="mt-4 space-y-5">
            {groupedItems.map(({ category, list }) => (
              <div key={category}>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  {category}
                </p>
                <div className="overflow-x-auto rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">Detail</th>
                        <th className="px-3 py-2 font-medium">Qty/Durasi</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 text-right font-medium">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((item) => (
                        <tr key={item.id} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200">
                            {item.itemName}
                            {(item.vendorName || item.team || item.dueDate) && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {item.vendorName && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                                    <Building2 className="h-2.5 w-2.5" />
                                    {item.vendorName}
                                  </span>
                                )}
                                {item.team && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                                    <Users className="h-2.5 w-2.5" />
                                    {item.team}
                                  </span>
                                )}
                                {item.dueDate && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                                    <CalendarClock className="h-2.5 w-2.5" />
                                    {formatDateID(item.dueDate)}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{item.detail || "—"}</td>
                          <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{item.qtyInfo || "—"}</td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                item.currentPhase === "finish"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                  : "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400"
                              )}
                            >
                              {CHECKLIST_PHASE_LABELS[item.currentPhase]}
                            </span>
                          </td>
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

      <section className={cn("rounded-2xl border p-5", GLASS_SURFACE, GLASS_BORDER)}>
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Kaitan ke Data Divisi</h2>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            Kaitkan booking/proyek yang sudah ada supaya divisi lain bisa ikut memantau data itu dari event ini.
          </p>
        </div>

        {links.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map((link) => (
              <span
                key={link.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 py-1 pl-3 pr-1.5 text-xs dark:border-zinc-700 dark:bg-white/5"
              >
                <Link2 className="h-3 w-3 text-zinc-400" />
                <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                  {EVENT_SOURCE_LABELS[link.sourceType]}:
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">{link.sourceLabel}</span>
                <button
                  type="button"
                  onClick={() => setUnlinkTarget(link)}
                  title="Lepas kaitan"
                  className="rounded-full p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          {SOURCE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setLinkTab(tab);
                setLinkResults([]);
                setLinkQuery("");
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                linkTab === tab
                  ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                  : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
              )}
            >
              {EVENT_SOURCE_LABELS[tab]}
            </button>
          ))}
        </div>

        <form onSubmit={handleLinkSearch} className="mt-3 flex gap-2">
          <input
            value={linkQuery}
            onChange={(e) => setLinkQuery(e.target.value)}
            placeholder={`Cari nama klien/proyek ${EVENT_SOURCE_LABELS[linkTab].toLowerCase()}…`}
            className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          />
          <button
            type="submit"
            disabled={linkSearching || !linkQuery.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
          >
            {linkSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cari"}
          </button>
        </form>

        {linkResults.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {linkResults.map((r) => {
              const already = linkedIds.has(`${r.sourceType}:${r.sourceId}`);
              return (
                <li
                  key={r.sourceId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800"
                >
                  <span className="text-zinc-700 dark:text-zinc-200">{r.label}</span>
                  <button
                    type="button"
                    onClick={() => handleAddLink(r)}
                    disabled={already || linkAddingId === r.sourceId}
                    className="shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    {already ? "Sudah dikaitkan" : linkAddingId === r.sourceId ? "Menyimpan…" : "+ Kaitkan"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Modal tambah/edit item checklist */}
      <Modal
        open={itemFormOpen}
        onClose={() => setItemFormOpen(false)}
        title={editingItem ? "Edit Item Checklist" : "Tambah Item Checklist"}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Vendor <span className="font-normal text-zinc-400">(opsional)</span>
              </label>
              <select
                value={itemForm.vendorId}
                onChange={(e) => setItemForm((f) => ({ ...f, vendorId: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">-- Tidak dikaitkan --</option>
                {vendorOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Target <span className="font-normal text-zinc-400">(opsional)</span>
              </label>
              <input
                type="date"
                value={itemForm.dueDate}
                onChange={(e) => setItemForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Tim <span className="font-normal text-zinc-400">(opsional)</span>
            </label>
            <input
              list="checklist-team-presets"
              value={itemForm.team}
              onChange={(e) => setItemForm((f) => ({ ...f, team: e.target.value }))}
              placeholder="mis. Tim Creative"
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <datalist id="checklist-team-presets">
              {CHECKLIST_TEAM_PRESETS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Perlu Produksi?
            </label>
            <div className="flex gap-2">
              {[
                { value: true, label: "Ya -- lewat Design/Mockup/Sample/Production dulu" },
                { value: false, label: "Tidak -- langsung mulai dari Completed" },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  disabled={!!editingItem}
                  onClick={() => setItemForm((f) => ({ ...f, needsProduction: opt.value }))}
                  className={cn(
                    "flex-1 rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition-colors",
                    editingItem && "cursor-not-allowed opacity-60",
                    itemForm.needsProduction === opt.value
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {editingItem && (
              <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                Sudah terkunci sesuai fase berjalan item ini -- untuk mengubahnya, buka Papan Tracking.
              </p>
            )}
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
        title="Hapus Item Checklist"
        description={`Hapus item "${deleteItemTarget?.itemName}" dari checklist event ini?`}
        confirmLabel="Hapus"
      />

      <ConfirmDialog
        open={deleteEventConfirmOpen}
        onClose={() => setDeleteEventConfirmOpen(false)}
        onConfirm={handleDeleteEvent}
        title="Hapus Event"
        description={`Hapus permanen event "${event.name}" beserta seluruh checklist dan kaitan booking/proyeknya? Hanya bisa dilakukan kalau belum ada pengeluaran Realisasi Event tercatat -- kalau sudah ada, ubah status ke "Dibatalkan" saja supaya riwayatnya tetap ada.`}
        confirmLabel={deletingEvent ? "Menghapus…" : "Hapus"}
      />

      <ConfirmDialog
        open={!!unlinkTarget}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={confirmUnlink}
        title="Lepas Kaitan"
        description={`Lepas kaitan ke "${unlinkTarget?.sourceLabel}"? Divisi terkait tidak akan lagi otomatis melihat data ini dari event.`}
        confirmLabel="Lepas"
      />

      {/* Modal import Excel/CSV */}
      <Modal open={importOpen} onClose={closeImportModal} title="Import Checklist Event">
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
              Mendukung file dengan kolom &ldquo;Kategori&rdquo; eksplisit, ATAU checklist dengan baris judul kategori tersendiri
              (mis. &ldquo;A. VENUE&rdquo;) diikuti baris-baris item -- persis seperti contoh checklist Owner. Kolom Status/PIC
              di file sumber dilewati -- semua item baru masuk dengan status &ldquo;Belum Mulai&rdquo;.
            </p>
          </div>

          {importRows && !importSummary && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Kalau checklist ini sudah ada isinya
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

          {importRows && !importSummary && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Semua item di file ini perlu lewat Design/Mockup/Sample/Production dulu?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImportNeedsProduction(true)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                    importNeedsProduction
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
                  )}
                >
                  Ya -- ada proses produksi
                </button>
                <button
                  type="button"
                  onClick={() => setImportNeedsProduction(false)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                    !importNeedsProduction
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
                  )}
                >
                  Tidak -- langsung mulai dari Completed
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                Berlaku untuk SEMUA item di file ini. Kalau campuran (sebagian perlu produksi, sebagian tidak), import
                dulu lalu ubah per-item lewat Papan Tracking.
              </p>
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
