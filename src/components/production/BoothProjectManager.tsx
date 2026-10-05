"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, BadgeCheck, FolderOpen, Hammer, MapPin, Pencil, Plus, Search, Trash2, X as XIcon } from "lucide-react";
import { useProductionData } from "./ProductionDataProvider";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportButton, type ExportSheet } from "@/components/ui/ExportButton";
import { formatDateID, formatRupiah, todayISO } from "@/lib/shared/utils";
import type { MaterialConflict } from "@/lib/production/availability";
import { cn } from "@/lib/cn";
import type { BoothProject, BoothStatus, MaterialItem, PaymentStatus } from "@/lib/production/types";
import type { BomTemplate } from "@/lib/production/extras-types";
import { BOOTH_STATUS_STYLES as STATUS_STYLES, PAYMENT_STYLES } from "@/lib/status-styles";
import { ProjectDetailModal } from "./ProjectDetailModal";
import { GLASS_BORDER, GLASS_INPUT, GLASS_SURFACE } from "@/lib/glass";

/**
 * Template Proposal/BOQ (Tahap 43 — permintaan Owner) — TIDAK dibuat sebagai
 * form isian terpisah yang datanya dobel: BOQ (Bill of Quantities) di sini
 * disusun OTOMATIS dari data yang sudah dicatat tim untuk proyek itu
 * (daftar `materials` yang sudah diisi lewat form Tambah/Edit Proyek +
 * harga satuan dari master Material). Owner tinggal klik "Ekspor
 * Proposal/BOQ" — tidak perlu isi ulang apa-apa, langsung dapat spreadsheet
 * siap kirim ke klien.
 */
function buildBoqSheets(project: BoothProject, materials: MaterialItem[]): ExportSheet[] {
  const materialLines = project.materials.map((usage, i) => {
    const material = materials.find((m) => m.id === usage.materialId);
    const unitPrice = material?.pricePerUnit ?? 0;
    return {
      No: i + 1,
      Material: material?.name ?? "(alat sudah dihapus)",
      Kategori: material?.category ?? "—",
      Qty: usage.qty,
      Satuan: material?.unit ?? "—",
      "Harga Satuan (Rp)": unitPrice,
      "Subtotal (Rp)": unitPrice * usage.qty,
    };
  });
  const totalMaterial = materialLines.reduce((sum, l) => sum + l["Subtotal (Rp)"], 0);
  const sisaJasaLain = Math.max(project.budget - totalMaterial, 0);

  return [
    {
      name: "Proposal",
      rows: [
        {
          "Nama Proyek": project.name,
          Klien: project.namaKlien,
          "Lokasi Acara": project.lokasiAcara,
          "Tanggal Instalasi": project.tanggalInstalasi,
          Tahap: project.status,
          "Total Penawaran (Rp)": project.budget,
        },
      ],
    },
    {
      name: "BOQ Material",
      rows: [
        ...materialLines,
        { No: "", Material: "TOTAL MATERIAL", Kategori: "", Qty: "", Satuan: "", "Harga Satuan (Rp)": "", "Subtotal (Rp)": totalMaterial },
        { No: "", Material: "Jasa, Tenaga Kerja & Lainnya (estimasi)", Kategori: "", Qty: "", Satuan: "", "Harga Satuan (Rp)": "", "Subtotal (Rp)": sisaJasaLain },
        { No: "", Material: "TOTAL PENAWARAN", Kategori: "", Qty: "", Satuan: "", "Harga Satuan (Rp)": "", "Subtotal (Rp)": project.budget },
      ],
    },
  ];
}

const GRADIENT = "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)";

const ALL_STATUSES: BoothStatus[] = ["Desain", "Produksi", "Finishing", "Instalasi", "Selesai", "Dibatalkan"];
const ALL_FILTER = "Semua Status";

type MaterialRow = { materialId: string; qty: string };

function emptyForm() {
  const today = todayISO();
  return {
    name: "",
    clientId: "",
    namaKlien: "",
    lokasiAcara: "",
    status: "Desain" as BoothStatus,
    tanggalMulai: today,
    tanggalInstalasi: today,
    tanggalBongkarEstimasi: "",
    budget: "0",
    statusPembayaran: "Belum Bayar" as PaymentStatus,
    dpAmount: "0",
    catatan: "",
  };
}

function projectToForm(p: BoothProject) {
  return {
    name: p.name,
    clientId: p.clientId ?? "",
    namaKlien: p.namaKlien,
    lokasiAcara: p.lokasiAcara,
    status: p.status,
    tanggalMulai: p.tanggalMulai,
    tanggalInstalasi: p.tanggalInstalasi,
    tanggalBongkarEstimasi: p.tanggalBongkarEstimasi ?? "",
    budget: String(p.budget),
    statusPembayaran: p.statusPembayaran,
    dpAmount: String(p.dpAmount ?? 0),
    catatan: p.catatan ?? "",
  };
}

function projectToMaterialRows(p: BoothProject): MaterialRow[] {
  return p.materials.map((m) => ({ materialId: m.materialId, qty: String(m.qty) }));
}

/**
 * Tracking proyek booth — tabel + modal tambah/edit dengan alokasi material
 * dinamis (baris material bisa ditambah/dihapus bebas), dan konfirmasi
 * hapus. Validasi ketersediaan stok ditegakkan di provider (addProject/
 * updateProject) — saat mengedit, proyek yang sedang diedit dikecualikan
 * dari perhitungan alokasinya sendiri lewat `excludeProjectId`, pola yang
 * sama dengan pencegahan bentrok jadwal booking di Magnarent.
 */
export function BoothProjectManager({ templates = [] }: { templates?: BomTemplate[] }) {
  const { materials, projects, clients, addProject, updateProject, deleteProject, getAvailableStockFor } =
    useProductionData();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);
  const [conflicts, setConflicts] = useState<MaterialConflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BoothProject | null>(null);
  const [detailTarget, setDetailTarget] = useState<BoothProject | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);

  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? "—";
  const clientById = (id?: string) => (id ? clients.find((c) => c.id === id) : undefined);

  /** Pilih klien terdaftar → auto-isi nama klien (bisa tetap diedit manual sesudahnya). */
  function handlePickClient(clientId: string) {
    const picked = clients.find((c) => c.id === clientId);
    setForm((f) => ({ ...f, clientId, namaKlien: picked ? picked.name : f.namaKlien }));
  }

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.tanggalInstalasi.localeCompare(b.tanggalInstalasi)),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortedProjects.filter((p) => {
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.namaKlien.toLowerCase().includes(term) ||
        p.lokasiAcara.toLowerCase().includes(term);
      const matchesStatus = statusFilter === ALL_FILTER || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [sortedProjects, searchTerm, statusFilter]);

  const materialCost = useCallback(
    (materialId: string): number => materials.find((m) => m.id === materialId)?.pricePerUnit ?? 0,
    [materials]
  );

  const estimasiBiayaMaterial = useMemo(
    () =>
      materialRows.reduce((sum, row) => {
        const qty = Number(row.qty);
        if (!row.materialId || !Number.isFinite(qty)) return sum;
        return sum + qty * materialCost(row.materialId);
      }, 0),
    [materialRows, materialCost]
  );

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm());
    setMaterialRows([]);
    setConflicts([]);
    setError(null);
    setFormOpen(true);
  }

  function openEditModal(p: BoothProject) {
    setEditingId(p.id);
    setForm(projectToForm(p));
    setMaterialRows(projectToMaterialRows(p));
    setConflicts([]);
    setError(null);
    setFormOpen(true);
  }

  function closeFormModal() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setMaterialRows([]);
    setConflicts([]);
    setError(null);
  }

  function addMaterialRow() {
    const used = new Set(materialRows.map((r) => r.materialId));
    const next = materials.find((m) => !used.has(m.id));
    setMaterialRows((rows) => [...rows, { materialId: next?.id ?? "", qty: "1" }]);
  }

  function updateMaterialRow(index: number, patch: Partial<MaterialRow>) {
    setMaterialRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeMaterialRow(index: number) {
    setMaterialRows((rows) => rows.filter((_, i) => i !== index));
  }

  /** Muat dari Template BOM (Tahap 44 — gap #2 analisis-gap-production.md):
   * isi ulang baris material dari resep template, qty tetap bisa diedit
   * sesudahnya. Menimpa baris yang sudah ada (dengan konfirmasi ringan via
   * toast) supaya tidak dobel kalau dipilih lebih dari sekali. */
  function loadFromTemplate(templateId: string) {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setMaterialRows(tpl.items.map((item) => ({ materialId: item.materialId, qty: String(item.qty) })));
    showToast(`Template "${tpl.name}" dimuat (${tpl.items.length} material). Qty masih bisa diubah.`, "success");
  }

  function availableOptionsFor(currentMaterialId: string) {
    const usedElsewhere = new Set(
      materialRows.filter((r) => r.materialId !== currentMaterialId).map((r) => r.materialId)
    );
    return materials.filter((m) => !usedElsewhere.has(m.id));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setConflicts([]);
    setError(null);

    const budget = Number(form.budget);

    if (!form.name.trim() || !form.namaKlien.trim() || !form.lokasiAcara.trim()) {
      setError("Nama proyek, klien, dan lokasi acara wajib diisi.");
      return;
    }
    if (!form.tanggalMulai || !form.tanggalInstalasi) {
      setError("Tanggal mulai dan tanggal instalasi wajib diisi.");
      return;
    }
    if (form.tanggalMulai > form.tanggalInstalasi) {
      setError("Tanggal mulai tidak boleh setelah tanggal instalasi.");
      return;
    }
    if (!Number.isFinite(budget) || budget < 0) {
      setError("Budget tidak valid.");
      return;
    }
    for (const row of materialRows) {
      const qty = Number(row.qty);
      if (!row.materialId || !Number.isFinite(qty) || qty < 1) {
        setError("Setiap baris material wajib memilih material dengan kuantitas minimal 1.");
        return;
      }
    }

    const dpAmount = Number(form.dpAmount) || 0;
    if (form.statusPembayaran === "DP") {
      if (dpAmount <= 0) {
        setError("Isi nominal DP yang sudah diterima (harus lebih dari 0).");
        return;
      }
      if (dpAmount > budget) {
        setError("Nominal DP tidak boleh melebihi budget.");
        return;
      }
    }

    const payload = {
      name: form.name.trim(),
      clientId: form.clientId || undefined,
      namaKlien: form.namaKlien.trim(),
      lokasiAcara: form.lokasiAcara.trim(),
      status: form.status,
      tanggalMulai: form.tanggalMulai,
      tanggalInstalasi: form.tanggalInstalasi,
      tanggalBongkarEstimasi: form.tanggalBongkarEstimasi || undefined,
      budget,
      statusPembayaran: form.statusPembayaran,
      dpAmount,
      materials: materialRows.map((r) => ({ materialId: r.materialId, qty: Number(r.qty) })),
      catatan: form.catatan.trim() || undefined,
    };

    setSubmitting(true);
    const result = editingId ? await updateProject(editingId, payload) : await addProject(payload);
    setSubmitting(false);

    if (!result.ok) {
      if ("conflicts" in result) {
        setConflicts(result.conflicts);
      } else {
        setError(result.error);
      }
      return;
    }

    showToast(editingId ? `Proyek "${payload.name}" berhasil diperbarui.` : `Proyek "${payload.name}" berhasil dibuat.`);
    closeFormModal();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteProject(deleteTarget.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    showToast(`Proyek "${deleteTarget.name}" berhasil dihapus.`);
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Tracking Proyek Booth</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filteredProjects.length} dari {projects.length} proyek ditampilkan
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: GRADIENT }}
        >
          <Plus className="h-4 w-4" />
          Buat Proyek
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari proyek, klien, atau lokasi…"
            className={cn("w-full rounded-full border py-2 pl-9 pr-3.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:text-white", GLASS_INPUT)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-amber-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
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
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <th className="px-5 py-3">Proyek</th>
                <th className="px-5 py-3">Klien</th>
                <th className="px-5 py-3">Lokasi Acara</th>
                <th className="px-5 py-3">Instalasi</th>
                <th className="px-5 py-3 text-right">Budget</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Pembayaran</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={Hammer}
                      title={projects.length === 0 ? "Belum ada proyek booth" : "Tidak ada hasil"}
                      description={
                        projects.length === 0
                          ? "Klik \"Buat Proyek\" untuk mulai melacak proyek booth pertama."
                          : "Coba ubah kata kunci pencarian atau filter status."
                      }
                    />
                  </td>
                </tr>
              )}
              {filteredProjects.map((p) => (
                <tr key={p.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-5 py-3 font-medium text-zinc-900 dark:text-white">
                    <span className="inline-flex items-center gap-2">
                      <Hammer className="h-4 w-4 shrink-0 text-zinc-400" />
                      {p.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      {p.namaKlien}
                      {clientById(p.clientId) && (
                        <BadgeCheck
                          className="h-3.5 w-3.5 shrink-0 text-amber-500"
                          aria-label="Klien terdaftar di Magnativ"
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      {p.lokasiAcara}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                    {formatDateID(p.tanggalInstalasi)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatRupiah(p.budget)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[p.status])}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        PAYMENT_STYLES[p.statusPembayaran]
                      )}
                    >
                      {p.statusPembayaran}
                    </span>
                    {p.statusPembayaran === "DP" && p.dpAmount > 0 && (
                      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                        DP: {formatRupiah(p.dpAmount)}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setDetailTarget(p)}
                        title="Detail — checklist & kru"
                        aria-label="Detail — checklist & kru"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </button>
                      <ExportButton
                        sheets={buildBoqSheets(p, materials)}
                        fileName={`proposal-boq-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
                        iconOnly
                        title="Ekspor Proposal/BOQ"
                      />
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        title="Edit proyek"
                        aria-label="Edit proyek"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        title="Hapus proyek"
                        aria-label="Hapus proyek"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={closeFormModal}
        title={editingId ? "Edit Proyek Booth" : "Buat Proyek Booth Baru"}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="booth-project-name" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Nama Proyek
            </label>
            <input
              id="booth-project-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="mis. Booth Pameran IIMS 2026"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          {clients.length > 0 && (
            <div>
              <label htmlFor="booth-client-select" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Klien Terdaftar (opsional)
              </label>
              <select
                id="booth-client-select"
                value={form.clientId}
                onChange={(e) => handlePickClient(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                <option value="">— Bukan dari daftar klien (isi manual) —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.industry})
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                Memilih klien di sini menautkan proyek ini ke riwayat klien lintas modul (lihat Admin → Direktori
                Klien Terpadu).
              </p>
            </div>
          )}

          <div>
            <label htmlFor="booth-client-name" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Nama Klien
            </label>
            <input
              id="booth-client-name"
              value={form.namaKlien}
              onChange={(e) => setForm((f) => ({ ...f, namaKlien: e.target.value, clientId: "" }))}
              placeholder="mis. PT Auto Perkasa"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="booth-lokasi-acara" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Lokasi Acara
              </label>
              <input
                id="booth-lokasi-acara"
                value={form.lokasiAcara}
                onChange={(e) => setForm((f) => ({ ...f, lokasiAcara: e.target.value }))}
                placeholder="mis. JIExpo Kemayoran"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="booth-status" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Status
              </label>
              <select
                id="booth-status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as BoothStatus }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="booth-start-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Mulai
              </label>
              <input
                id="booth-start-date"
                type="date"
                value={form.tanggalMulai}
                onChange={(e) => setForm((f) => ({ ...f, tanggalMulai: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="booth-install-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Instalasi (Deadline)
              </label>
              <input
                id="booth-install-date"
                type="date"
                value={form.tanggalInstalasi}
                onChange={(e) => setForm((f) => ({ ...f, tanggalInstalasi: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="booth-bongkar-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Estimasi Tanggal Bongkar (opsional)
            </label>
            <input
              id="booth-bongkar-date"
              type="date"
              value={form.tanggalBongkarEstimasi}
              onChange={(e) => setForm((f) => ({ ...f, tanggalBongkarEstimasi: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
            <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              Dipakai untuk memperkirakan kapan material proyek ini bisa dipakai ulang proyek lain (lihat Forecast
              Reuse Material di halaman Pemakaian Material).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="booth-budget" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Budget (Rp)
              </label>
              <input
                id="booth-budget"
                type="number"
                min={0}
                step={1_000_000}
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="booth-payment-status" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Status Pembayaran
              </label>
              <select
                id="booth-payment-status"
                value={form.statusPembayaran}
                onChange={(e) => setForm((f) => ({ ...f, statusPembayaran: e.target.value as PaymentStatus }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                <option value="Belum Bayar">Belum Bayar</option>
                <option value="DP">DP</option>
                <option value="Lunas">Lunas</option>
              </select>
            </div>
          </div>

          {form.statusPembayaran === "DP" && (
            <div>
              <label htmlFor="booth-dp-amount" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Nominal DP Diterima (Rp)
              </label>
              <input
                id="booth-dp-amount"
                type="number"
                min={0}
                value={form.dpAmount}
                onChange={(e) => setForm((f) => ({ ...f, dpAmount: e.target.value }))}
                placeholder="mis. 5000000"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
              {Number.isFinite(Number(form.budget)) && (
                <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  Sisa tagihan setelah DP:{" "}
                  {formatRupiah(Math.max(Number(form.budget) - (Number(form.dpAmount) || 0), 0))}
                </p>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Alokasi Material
              </label>
              <div className="flex items-center gap-3">
                {templates.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) loadFromTemplate(e.target.value);
                    }}
                    className="rounded-lg border border-black/10 bg-transparent px-2 py-1 text-xs text-zinc-600 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-zinc-300 dark:[&>option]:bg-zinc-900"
                    title="Muat daftar material dari template BOM"
                  >
                    <option value="">Muat dari Template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={addMaterialRow}
                  disabled={materialRows.length >= materials.length}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Material
                </button>
              </div>
            </div>

            {materialRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-black/10 px-3.5 py-3 text-xs text-zinc-400 dark:border-white/10">
                Belum ada material dialokasikan ke proyek ini.
              </p>
            ) : (
              <div className="space-y-2">
                {materialRows.map((row, index) => {
                  const options = availableOptionsFor(row.materialId);
                  const available = row.materialId
                    ? getAvailableStockFor(row.materialId, editingId ?? undefined)
                    : null;
                  const qty = Number(row.qty);
                  const overAvailable = available !== null && Number.isFinite(qty) && qty > available;
                  return (
                    <div key={index} className="flex items-start gap-2">
                      <select
                        value={row.materialId}
                        onChange={(e) => updateMaterialRow(index, { materialId: e.target.value })}
                        className="min-w-0 flex-1 rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
                      >
                        <option value="">Pilih material…</option>
                        {options.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={(e) => updateMaterialRow(index, { qty: e.target.value })}
                        className={cn(
                          "w-24 shrink-0 rounded-xl border bg-transparent px-3 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:text-white",
                          overAvailable ? "border-rose-300 dark:border-rose-500/40" : "border-black/10 dark:border-white/10"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => removeMaterialRow(index)}
                        title="Hapus baris"
                        aria-label="Hapus baris"
                        className="mt-1.5 shrink-0 rounded-full p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                {materialRows.some((r) => r.materialId) && (
                  <ul className="space-y-0.5 pl-1 text-xs text-zinc-400 dark:text-zinc-500">
                    {materialRows
                      .filter((r) => r.materialId)
                      .map((r, i) => {
                        const available = getAvailableStockFor(r.materialId, editingId ?? undefined);
                        return (
                          <li key={i}>
                            {materialName(r.materialId)}: tersedia {Math.max(available, 0)} unit
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            )}
          </div>

          {estimasiBiayaMaterial > 0 && (
            <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              Estimasi Biaya Material: {formatRupiah(estimasiBiayaMaterial)}
            </div>
          )}

          <div>
            <label htmlFor="booth-catatan" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Catatan (opsional)
            </label>
            <input
              id="booth-catatan"
              value={form.catatan}
              onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
              placeholder="mis. detail desain, kontak PIC lapangan"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          {conflicts.length > 0 && (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Stok material tidak cukup:
              </p>
              <ul className="ml-1 list-disc space-y-0.5 pl-4">
                {conflicts.map((c) => (
                  <li key={c.materialId}>
                    {c.materialName} — diminta {c.requested}, tersisa {Math.max(c.available, 0)}
                  </li>
                ))}
              </ul>
            </div>
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
              {submitting ? "Menyimpan…" : editingId ? "Simpan Perubahan" : "Buat Proyek"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Proyek Booth"
        description={
          deleteTarget && (
            <>
              Yakin hapus proyek <strong>{deleteTarget.name}</strong>? Tindakan ini tidak bisa dibatalkan.
            </>
          )
        }
      />

      {detailTarget && (
        <ProjectDetailModal
          projectId={detailTarget.id}
          projectName={detailTarget.name}
          open={detailTarget !== null}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}
