"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Plus, Search, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { useProductionData } from "./ProductionDataProvider";
import { addNcReport, deleteNcReport, updateNcReportProgress } from "@/lib/production/extras-actions";
import {
  NC_CATEGORIES,
  NC_SEVERITIES,
  NC_STATUSES,
  type NcCategory,
  type NcReport,
  type NcSeverity,
  type NcStatus,
  type Vendor,
} from "@/lib/production/extras-types";
import { formatDateID, todayISO } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_INPUT, GLASS_SURFACE } from "@/lib/glass";

const GRADIENT = "linear-gradient(135deg, #E11D48 0%, #F59E0B 100%)";
const ALL_FILTER = "Semua";

const SEVERITY_STYLE: Record<NcSeverity, string> = {
  Rendah: "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
  Sedang: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  Tinggi: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

const STATUS_STYLE: Record<NcStatus, string> = {
  Open: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  Investigasi: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  "Tindakan Korektif": "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  Ditutup: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
};

function emptyForm() {
  return {
    projectId: "",
    vendorId: "",
    kategori: NC_CATEGORIES[0] as NcCategory,
    judul: "",
    deskripsi: "",
    severity: "Sedang" as NcSeverity,
    pic: "",
    tanggalDitemukan: todayISO(),
  };
}

function emptyProgressForm(r: NcReport) {
  return {
    status: r.status,
    akarMasalah: r.akarMasalah ?? "",
    tindakanKorektif: r.tindakanKorektif ?? "",
    tindakanPreventif: r.tindakanPreventif ?? "",
  };
}

/**
 * Modul NC/CAPA (analisis-kompetitor #23) -- SENGAJA halaman & komponen
 * terpisah dari checklist instalasi/bongkar di `ProjectDetailModal`. Fokus
 * mencatat TEMUAN ketidaksesuaian kualitas (material/vendor/kru/proses) +
 * tindak lanjut (akar masalah, tindakan korektif/preventif), plus
 * ringkasan riwayat kualitas per vendor & per PIC (kru/penanggung jawab)
 * dari waktu ke waktu. Murni pencatatan manual -- TIDAK ADA skoring/
 * analisis otomatis berbasis AI.
 */
export function NcCapaManager({ ncReports, vendors }: { ncReports: NcReport[]; vendors: Vendor[] }) {
  const { showToast } = useToast();
  const { projects } = useProductionData();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [detailTarget, setDetailTarget] = useState<NcReport | null>(null);
  const [progressForm, setProgressForm] = useState(() => emptyProgressForm({} as NcReport));
  const [progressSubmitting, setProgressSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<NcReport | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);
  const [severityFilter, setSeverityFilter] = useState<string>(ALL_FILTER);

  const vendorName = useCallback((id: string | null) => vendors.find((v) => v.id === id)?.name ?? null, [vendors]);
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return ncReports.filter((r) => {
      const matchesSearch =
        !term ||
        r.judul.toLowerCase().includes(term) ||
        r.deskripsi.toLowerCase().includes(term) ||
        (r.pic ?? "").toLowerCase().includes(term) ||
        (vendorName(r.vendorId) ?? "").toLowerCase().includes(term);
      const matchesStatus = statusFilter === ALL_FILTER || r.status === statusFilter;
      const matchesSeverity = severityFilter === ALL_FILTER || r.severity === severityFilter;
      return matchesSearch && matchesStatus && matchesSeverity;
    });
  }, [ncReports, searchTerm, statusFilter, severityFilter, vendorName]);

  /** Ringkasan riwayat kualitas per vendor -- murni agregasi hitung, non-AI. */
  const vendorSummary = useMemo(() => {
    const map = new Map<string, { name: string; total: number; open: number }>();
    for (const r of ncReports) {
      if (!r.vendorId) continue;
      const name = vendorName(r.vendorId) ?? "Vendor tidak dikenal";
      const entry = map.get(r.vendorId) ?? { name, total: 0, open: 0 };
      entry.total += 1;
      if (r.status !== "Ditutup") entry.open += 1;
      map.set(r.vendorId, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.open - a.open || b.total - a.total);
  }, [ncReports, vendorName]);

  /** Ringkasan riwayat kualitas per PIC/kru (teks bebas, sama pola dengan `ProjectCrew.nama`). */
  const picSummary = useMemo(() => {
    const map = new Map<string, { name: string; total: number; open: number }>();
    for (const r of ncReports) {
      const raw = r.pic?.trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const entry = map.get(key) ?? { name: raw, total: 0, open: 0 };
      entry.total += 1;
      if (r.status !== "Ditutup") entry.open += 1;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.open - a.open || b.total - a.total);
  }, [ncReports]);

  function openAddModal() {
    setForm(emptyForm());
    setFormError(null);
    setFormOpen(true);
  }

  function closeFormModal() {
    setFormOpen(false);
    setForm(emptyForm());
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.judul.trim()) {
      setFormError("Judul temuan wajib diisi.");
      return;
    }
    if (!form.deskripsi.trim()) {
      setFormError("Deskripsi temuan wajib diisi.");
      return;
    }

    setSubmitting(true);
    const result = await addNcReport({
      projectId: form.projectId || undefined,
      vendorId: form.vendorId || undefined,
      kategori: form.kategori,
      judul: form.judul.trim(),
      deskripsi: form.deskripsi.trim(),
      severity: form.severity,
      pic: form.pic.trim() || undefined,
      tanggalDitemukan: form.tanggalDitemukan || undefined,
    });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    showToast(`Temuan "${form.judul.trim()}" berhasil dicatat.`);
    closeFormModal();
  }

  function openDetailModal(r: NcReport) {
    setDetailTarget(r);
    setProgressForm(emptyProgressForm(r));
  }

  function closeDetailModal() {
    setDetailTarget(null);
  }

  async function handleProgressSubmit(e: FormEvent) {
    e.preventDefault();
    if (!detailTarget) return;

    setProgressSubmitting(true);
    const result = await updateNcReportProgress(detailTarget.id, {
      status: progressForm.status,
      akarMasalah: progressForm.akarMasalah.trim() || undefined,
      tindakanKorektif: progressForm.tindakanKorektif.trim() || undefined,
      tindakanPreventif: progressForm.tindakanPreventif.trim() || undefined,
    });
    setProgressSubmitting(false);

    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Status temuan "${detailTarget.judul}" diperbarui menjadi "${progressForm.status}".`);
    closeDetailModal();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteNcReport(deleteTarget.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    showToast(`Temuan "${deleteTarget.judul}" berhasil dihapus.`);
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Temuan NC/CAPA</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filtered.length} dari {ncReports.length} temuan ditampilkan.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: GRADIENT }}
        >
          <Plus className="h-4 w-4" />
          Catat Temuan
        </button>
      </div>

      {(vendorSummary.length > 0 || picSummary.length > 0) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {vendorSummary.length > 0 && (
            <div className={cn("rounded-2xl border p-4 shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <Building2 className="h-3.5 w-3.5" />
                Riwayat Kualitas per Vendor
              </p>
              <ul className="space-y-1.5">
                {vendorSummary.slice(0, 5).map((v) => (
                  <li key={v.name} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-700 dark:text-zinc-200">{v.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {v.open > 0 && <span className="font-semibold text-rose-600 dark:text-rose-300">{v.open} open</span>}
                      {v.open > 0 && " · "}
                      {v.total} total
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {picSummary.length > 0 && (
            <div className={cn("rounded-2xl border p-4 shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <UserRound className="h-3.5 w-3.5" />
                Riwayat Kualitas per PIC/Kru
              </p>
              <ul className="space-y-1.5">
                {picSummary.slice(0, 5).map((p) => (
                  <li key={p.name} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-700 dark:text-zinc-200">{p.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {p.open > 0 && <span className="font-semibold text-rose-600 dark:text-rose-300">{p.open} open</span>}
                      {p.open > 0 && " · "}
                      {p.total} total
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari judul, deskripsi, vendor, atau PIC…"
            className={cn("w-full rounded-full border py-2 pl-9 pr-3.5 text-sm text-zinc-900 outline-none ring-rose-500/40 placeholder:text-zinc-400 focus:ring-2 dark:text-white", GLASS_INPUT)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-rose-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
        >
          <option>{ALL_FILTER}</option>
          {NC_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-rose-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
        >
          <option>{ALL_FILTER}</option>
          {NC_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <th className="px-5 py-3">Temuan</th>
                <th className="px-5 py-3">Kategori</th>
                <th className="px-5 py-3">Terkait</th>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Ditemukan</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={ShieldAlert}
                      title={ncReports.length === 0 ? "Belum ada temuan NC/CAPA" : "Tidak ada hasil"}
                      description={
                        ncReports.length === 0
                          ? 'Klik "Catat Temuan" untuk mulai mencatat ketidaksesuaian kualitas.'
                          : "Coba ubah kata kunci pencarian atau filter."
                      }
                    />
                  </td>
                </tr>
              )}

              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                  <td className="max-w-[260px] px-5 py-3">
                    <p className="font-medium text-zinc-900 dark:text-white">{r.judul}</p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{r.deskripsi}</p>
                  </td>
                  <td className="px-5 py-3 text-zinc-600 dark:text-zinc-300">{r.kategori}</td>
                  <td className="px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {projectName(r.projectId) && <p>{projectName(r.projectId)}</p>}
                    {vendorName(r.vendorId) && <p>{vendorName(r.vendorId)}</p>}
                    {r.pic && <p>PIC: {r.pic}</p>}
                    {!projectName(r.projectId) && !vendorName(r.vendorId) && !r.pic && "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_STYLE[r.severity]}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{formatDateID(r.tanggalDitemukan)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openDetailModal(r)}
                        title="Kelola tindak lanjut"
                        aria-label={`Kelola tindak lanjut ${r.judul}`}
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(r)}
                        title="Hapus temuan"
                        aria-label={`Hapus temuan ${r.judul}`}
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

      <Modal open={formOpen} onClose={closeFormModal} title="Catat Temuan NC/CAPA">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nc-judul" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Judul Temuan
            </label>
            <input
              id="nc-judul"
              value={form.judul}
              onChange={(e) => setForm((f) => ({ ...f, judul: e.target.value }))}
              placeholder="mis. Multiplek retak saat diterima"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="nc-deskripsi" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Deskripsi
            </label>
            <textarea
              id="nc-deskripsi"
              value={form.deskripsi}
              onChange={(e) => setForm((f) => ({ ...f, deskripsi: e.target.value }))}
              rows={3}
              placeholder="Jelaskan ketidaksesuaian yang ditemukan…"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="nc-kategori" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Kategori
              </label>
              <select
                id="nc-kategori"
                value={form.kategori}
                onChange={(e) => setForm((f) => ({ ...f, kategori: e.target.value as NcCategory }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {NC_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="nc-severity" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Severity
              </label>
              <select
                id="nc-severity"
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as NcSeverity }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {NC_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="nc-project" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Proyek Terkait (opsional)
              </label>
              <select
                id="nc-project"
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                <option value="">— Tidak terkait proyek —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="nc-vendor" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Vendor Terkait (opsional)
              </label>
              <select
                id="nc-vendor"
                value={form.vendorId}
                onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                <option value="">— Tidak terkait vendor —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="nc-pic" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                PIC/Kru Terkait (opsional)
              </label>
              <input
                id="nc-pic"
                value={form.pic}
                onChange={(e) => setForm((f) => ({ ...f, pic: e.target.value }))}
                placeholder="mis. Budi (Tukang/Instalatur)"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="nc-tanggal" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Ditemukan
              </label>
              <input
                id="nc-tanggal"
                type="date"
                value={form.tanggalDitemukan}
                onChange={(e) => setForm((f) => ({ ...f, tanggalDitemukan: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          {formError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {formError}
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
              {submitting ? "Menyimpan…" : "Catat Temuan"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={detailTarget !== null} onClose={closeDetailModal} title={detailTarget?.judul ?? "Tindak Lanjut Temuan"}>
        {detailTarget && (
          <form onSubmit={handleProgressSubmit} className="space-y-4">
            <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
              <p className="mb-1">
                <span className="font-semibold">{detailTarget.kategori}</span> ·{" "}
                <span className={`rounded-full px-2 py-0.5 font-semibold ${SEVERITY_STYLE[detailTarget.severity]}`}>
                  {detailTarget.severity}
                </span>{" "}
                · Ditemukan {formatDateID(detailTarget.tanggalDitemukan)}
              </p>
              <p>{detailTarget.deskripsi}</p>
              {(projectName(detailTarget.projectId) || vendorName(detailTarget.vendorId) || detailTarget.pic) && (
                <p className="mt-1.5 text-zinc-500 dark:text-zinc-400">
                  {[projectName(detailTarget.projectId), vendorName(detailTarget.vendorId), detailTarget.pic && `PIC: ${detailTarget.pic}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="nc-status" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Status
              </label>
              <select
                id="nc-status"
                value={progressForm.status}
                onChange={(e) => setProgressForm((f) => ({ ...f, status: e.target.value as NcStatus }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {NC_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="nc-akar" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Akar Masalah (opsional)
              </label>
              <textarea
                id="nc-akar"
                value={progressForm.akarMasalah}
                onChange={(e) => setProgressForm((f) => ({ ...f, akarMasalah: e.target.value }))}
                rows={2}
                placeholder="Penyebab utama ketidaksesuaian…"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="nc-korektif" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tindakan Korektif (opsional)
              </label>
              <textarea
                id="nc-korektif"
                value={progressForm.tindakanKorektif}
                onChange={(e) => setProgressForm((f) => ({ ...f, tindakanKorektif: e.target.value }))}
                rows={2}
                placeholder="Tindakan untuk memperbaiki temuan saat ini…"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="nc-preventif" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tindakan Preventif (opsional)
              </label>
              <textarea
                id="nc-preventif"
                value={progressForm.tindakanPreventif}
                onChange={(e) => setProgressForm((f) => ({ ...f, tindakanPreventif: e.target.value }))}
                rows={2}
                placeholder="Tindakan agar tidak terulang di proyek berikutnya…"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-rose-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeDetailModal}
                className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={progressSubmitting}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                style={{ background: GRADIENT }}
              >
                {progressSubmitting ? "Menyimpan…" : "Simpan Tindak Lanjut"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Temuan"
        description={
          deleteTarget && (
            <>
              Yakin hapus temuan <strong>{deleteTarget.judul}</strong>? Tindakan ini tidak bisa dibatalkan.
            </>
          )
        }
      />
    </div>
  );
}
