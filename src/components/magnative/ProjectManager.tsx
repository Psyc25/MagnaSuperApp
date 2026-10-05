"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Briefcase, Building2, ListChecks, Pencil, Plus, QrCode, Search, Share2, Trash2, Wallet2, Workflow } from "lucide-react";
import { useMagnativeData } from "./MagnativeDataProvider";
import { ProjectCostModal } from "./ProjectCostModal";
import { ProjectTaskModal } from "./ProjectTaskModal";
import { ProjectVendorModal } from "./ProjectVendorModal";
import { ProjectPipelineModal } from "./ProjectPipelineModal";
import { CheckinModal } from "./CheckinModal";
import { PortalShareModal } from "@/components/portal/PortalShareModal";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateID, formatRupiah } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import type { PaymentStatus, Project, ProjectStatus, ProjectType } from "@/lib/magnative/types";
import { SUMBER_UNDANGAN_PRESETS } from "@/lib/magnative/types";
import { PROJECT_STATUS_STYLES as STATUS_STYLES, PAYMENT_STYLES } from "@/lib/status-styles";
import { computeLeadScore, LEAD_SCORE_LABEL_STYLE } from "@/lib/magnative/leadScoring";
import { GLASS_BORDER, GLASS_INPUT, GLASS_SURFACE } from "@/lib/glass";

const GRADIENT = "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)";

const ALL_TYPES: ProjectType[] = ["Event Organizer", "Creative Agency", "Media Sosial", "Lainnya"];
const ALL_STATUSES: ProjectStatus[] = ["Pitching", "Perencanaan", "Berjalan", "Selesai", "Dibatalkan"];
const ALL_FILTER = "Semua Status";

function emptyForm() {
  return {
    clientId: "",
    name: "",
    type: "Event Organizer" as ProjectType,
    tanggalMulai: "",
    tanggalSelesai: "",
    budget: "0",
    status: "Pitching" as ProjectStatus,
    statusPembayaran: "Belum Bayar" as PaymentStatus,
    dpAmount: "0",
    catatan: "",
    alasanKalah: "",
    sumberUndangan: "",
  };
}

function projectToForm(p: Project) {
  return {
    clientId: p.clientId,
    name: p.name,
    type: p.type,
    tanggalMulai: p.tanggalMulai,
    tanggalSelesai: p.tanggalSelesai,
    budget: String(p.budget),
    status: p.status,
    statusPembayaran: p.statusPembayaran,
    dpAmount: String(p.dpAmount ?? 0),
    catatan: p.catatan ?? "",
    alasanKalah: p.alasanKalah ?? "",
    sumberUndangan: p.sumberUndangan ?? "",
  };
}

/**
 * Tracker proyek/event per klien — tabel + modal tambah/edit, dan
 * konfirmasi hapus. Proyek terhubung ke klien lewat `clientId`, jadi kalau
 * daftar klien berubah (tambah klien baru di tab Klien), dropdown di sini
 * langsung ikut update tanpa reload berkat MagnativeDataProvider yang sama.
 */
export function ProjectManager() {
  const { clients, projects, pipelineFiles, addProject, updateProject, deleteProject } = useMagnativeData();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [costTarget, setCostTarget] = useState<Project | null>(null);
  const [taskTarget, setTaskTarget] = useState<Project | null>(null);
  const [vendorTarget, setVendorTarget] = useState<Project | null>(null);
  const [pipelineTarget, setPipelineTarget] = useState<Project | null>(null);
  const [portalTarget, setPortalTarget] = useState<Project | null>(null);
  const [checkinTarget, setCheckinTarget] = useState<Project | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);

  const clientName = useCallback((id: string) => clients.find((c) => c.id === id)?.name ?? "—", [clients]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.tanggalMulai.localeCompare(a.tanggalMulai)),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortedProjects.filter((p) => {
      const matchesSearch =
        !term || p.name.toLowerCase().includes(term) || clientName(p.clientId).toLowerCase().includes(term);
      const matchesStatus = statusFilter === ALL_FILTER || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [sortedProjects, searchTerm, statusFilter, clientName]);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setFormOpen(true);
  }

  function openEditModal(p: Project) {
    setEditingId(p.id);
    setForm(projectToForm(p));
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

    const budget = Number(form.budget);

    if (!form.clientId) {
      setError("Pilih klien untuk proyek ini.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama proyek wajib diisi.");
      return;
    }
    if (!form.tanggalMulai || !form.tanggalSelesai) {
      setError("Tanggal mulai dan selesai wajib diisi.");
      return;
    }
    if (form.tanggalMulai > form.tanggalSelesai) {
      setError("Tanggal mulai tidak boleh setelah tanggal selesai.");
      return;
    }
    if (!Number.isFinite(budget) || budget < 0) {
      setError("Budget tidak valid.");
      return;
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

    // Rekomendasi 1 laporan gap-event vs SOP (migrasi 0063) -- Owner minta
    // alasan kalah/batal WAJIB diisi begitu status diubah ke "Dibatalkan".
    // Dicek ulang juga di server (validateMagnativeProjectInput) -- form ini
    // hanya memberi umpan balik lebih cepat sebelum request dikirim.
    if (form.status === "Dibatalkan" && !form.alasanKalah.trim()) {
      setError('Alasan kalah/batal wajib diisi saat status diubah ke "Dibatalkan".');
      return;
    }

    const payload = {
      clientId: form.clientId,
      name: form.name.trim(),
      type: form.type,
      tanggalMulai: form.tanggalMulai,
      tanggalSelesai: form.tanggalSelesai,
      budget,
      status: form.status,
      statusPembayaran: form.statusPembayaran,
      dpAmount,
      catatan: form.catatan.trim() || undefined,
      alasanKalah: form.alasanKalah.trim() || undefined,
      sumberUndangan: form.sumberUndangan.trim() || undefined,
      // Form edit proyek ini TIDAK punya field pipelineStage sendiri (itu
      // dikelola lewat ProjectPipelineModal terpisah). Tanpa baris ini,
      // updateProject akan mengirim pipelineStage=undefined setiap kali --
      // dan actions.ts menulis `pipeline_stage: input.pipelineStage ?? null`
      // tanpa syarat, jadi SETIAP edit proyek biasa (ganti nama, budget,
      // dll) diam-diam menghapus tahap pipeline yang sudah diisi. Ambil
      // nilai pipelineStage proyek yang sedang diedit dari context supaya
      // ikut terkirim balik tanpa berubah.
      pipelineStage: editingId ? projects.find((p) => p.id === editingId)?.pipelineStage : undefined,
    };

    setSubmitting(true);
    const result = editingId ? await updateProject(editingId, payload) : await addProject(payload);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
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
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Daftar Proyek</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filteredProjects.length} dari {projects.length} proyek ditampilkan
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          disabled={clients.length === 0}
          title={clients.length === 0 ? "Tambahkan klien terlebih dahulu di tab Klien" : undefined}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
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
            placeholder="Cari proyek atau klien…"
            className={cn("w-full rounded-full border py-2 pl-9 pr-3.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:text-white", GLASS_INPUT)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-fuchsia-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
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
                <th className="px-5 py-3">Proyek</th>
                <th className="px-5 py-3">Klien</th>
                <th className="px-5 py-3">Tipe</th>
                <th className="px-5 py-3">Mulai</th>
                <th className="px-5 py-3">Selesai</th>
                <th className="px-5 py-3 text-right">Budget</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Pembayaran</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={Briefcase}
                      title={projects.length === 0 ? "Belum ada proyek" : "Tidak ada hasil"}
                      description={
                        projects.length === 0
                          ? "Klik \"Buat Proyek\" untuk mulai melacak proyek pertama."
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
                      <Briefcase className="h-4 w-4 shrink-0 text-zinc-400" />
                      {p.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{clientName(p.clientId)}</td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                    {p.type}
                    {p.sumberUndangan && (
                      <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">via {p.sumberUndangan}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                    {formatDateID(p.tanggalMulai)}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                    {formatDateID(p.tanggalSelesai)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatRupiah(p.budget)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[p.status])}>
                      {p.status}
                    </span>
                    {p.status === "Dibatalkan" && p.alasanKalah && (
                      <p className="mt-1 max-w-[160px] truncate text-[11px] text-zinc-400 dark:text-zinc-500" title={p.alasanKalah}>
                        {p.alasanKalah}
                      </p>
                    )}
                    {p.status === "Pitching" &&
                      (() => {
                        const lead = computeLeadScore(p, projects, pipelineFiles);
                        return (
                          <span
                            title={`Skor lead ${lead.score}/100 — sumber ${lead.breakdown.sourcePoints}, histori klien ${lead.breakdown.historyPoints}, momentum ${lead.breakdown.momentumPoints}`}
                            className={cn(
                              "ml-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              LEAD_SCORE_LABEL_STYLE[lead.label]
                            )}
                          >
                            Lead {lead.label} ({lead.score})
                          </span>
                        );
                      })()}
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
                        onClick={() => setCostTarget(p)}
                        title="Biaya proyek"
                        aria-label="Biaya proyek"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                      >
                        <Wallet2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskTarget(p)}
                        title="Task proyek"
                        aria-label="Task proyek"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                      >
                        <ListChecks className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setVendorTarget(p)}
                        title="Vendor proyek"
                        aria-label="Vendor proyek"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                      >
                        <Building2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPipelineTarget(p)}
                        title="Pipeline proposal"
                        aria-label="Pipeline proposal"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                      >
                        <Workflow className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPortalTarget(p)}
                        title="Bagikan ke klien"
                        aria-label="Bagikan ke klien"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckinTarget(p)}
                        title="Check-in on-site"
                        aria-label="Check-in on-site"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-500/10 dark:hover:text-teal-300"
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        title="Edit proyek"
                        aria-label="Edit proyek"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-600 dark:hover:bg-fuchsia-500/10 dark:hover:text-fuchsia-300"
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

      <Modal open={formOpen} onClose={closeFormModal} title={editingId ? "Edit Proyek" : "Buat Proyek Baru"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="project-client" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Klien
            </label>
            <select
              id="project-client"
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              <option value="">Pilih klien…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="project-name" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Nama Proyek
            </label>
            <input
              id="project-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="mis. Product Launch App v2"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="project-type" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tipe
              </label>
              <select
                id="project-type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ProjectType }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="project-status" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Status
              </label>
              <select
                id="project-status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="project-sumber-undangan" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Sumber Undangan (opsional)
            </label>
            <input
              id="project-sumber-undangan"
              list="sumber-undangan-presets"
              value={form.sumberUndangan}
              onChange={(e) => setForm((f) => ({ ...f, sumberUndangan: e.target.value }))}
              placeholder="mis. Client, Brand"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
            <datalist id="sumber-undangan-presets">
              {SUMBER_UNDANGAN_PRESETS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              Undangan pitching datang dari mana -- langsung dari klien, atau lewat brand/Admin.
            </p>
          </div>

          {form.status === "Dibatalkan" && (
            <div>
              <label htmlFor="project-alasan-kalah" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Alasan Kalah/Batal
              </label>
              <textarea
                id="project-alasan-kalah"
                required
                rows={2}
                value={form.alasanKalah}
                onChange={(e) => setForm((f) => ({ ...f, alasanKalah: e.target.value }))}
                placeholder="mis. budget klien tidak sesuai, kalah dari kompetitor lain"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="project-start-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Mulai
              </label>
              <input
                id="project-start-date"
                type="date"
                value={form.tanggalMulai}
                onChange={(e) => setForm((f) => ({ ...f, tanggalMulai: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="project-end-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Selesai
              </label>
              <input
                id="project-end-date"
                type="date"
                value={form.tanggalSelesai}
                onChange={(e) => setForm((f) => ({ ...f, tanggalSelesai: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="project-budget" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Budget (Rp)
              </label>
              <input
                id="project-budget"
                type="number"
                min={0}
                step={1_000_000}
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="project-payment-status" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Status Pembayaran
              </label>
              <select
                id="project-payment-status"
                value={form.statusPembayaran}
                onChange={(e) => setForm((f) => ({ ...f, statusPembayaran: e.target.value as PaymentStatus }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                <option value="Belum Bayar">Belum Bayar</option>
                <option value="DP">DP</option>
                <option value="Lunas">Lunas</option>
              </select>
            </div>
          </div>

          {form.statusPembayaran === "DP" && (
            <div>
              <label htmlFor="project-dp-amount" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Nominal DP Diterima (Rp)
              </label>
              <input
                id="project-dp-amount"
                type="number"
                min={0}
                value={form.dpAmount}
                onChange={(e) => setForm((f) => ({ ...f, dpAmount: e.target.value }))}
                placeholder="mis. 5000000"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
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
            <label htmlFor="project-catatan" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Catatan (opsional)
            </label>
            <input
              id="project-catatan"
              value={form.catatan}
              onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
              placeholder="mis. lokasi acara, jumlah tamu"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
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
              {submitting ? "Menyimpan…" : editingId ? "Simpan Perubahan" : "Buat Proyek"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Proyek"
        description={
          deleteTarget && (
            <>
              Yakin hapus proyek <strong>{deleteTarget.name}</strong>? Tindakan ini tidak bisa dibatalkan.
            </>
          )
        }
      />

      {costTarget && <ProjectCostModal project={costTarget} onClose={() => setCostTarget(null)} />}
      {taskTarget && <ProjectTaskModal project={taskTarget} onClose={() => setTaskTarget(null)} />}
      {vendorTarget && <ProjectVendorModal project={vendorTarget} onClose={() => setVendorTarget(null)} />}
      {pipelineTarget && <ProjectPipelineModal project={pipelineTarget} onClose={() => setPipelineTarget(null)} />}
      {portalTarget && (
        <PortalShareModal
          module="magnative"
          entityId={portalTarget.id}
          entityLabel={portalTarget.name}
          clientName={clientName(portalTarget.clientId)}
          onClose={() => setPortalTarget(null)}
        />
      )}
      {checkinTarget && <CheckinModal project={checkinTarget} onClose={() => setCheckinTarget(null)} />}
    </div>
  );
}
