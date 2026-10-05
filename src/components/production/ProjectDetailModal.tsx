"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Boxes, CheckCircle2, ChevronDown, Clock, FileText, Loader2, Paperclip, Share2, Trash2, Upload, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PortalShareModal } from "@/components/portal/PortalShareModal";
import { useToast } from "@/components/ui/ToastProvider";
import { useProductionData } from "./ProductionDataProvider";
import {
  addCrewPiecePayment,
  addCrewTimelog,
  addProjectCrew,
  addProjectDocument,
  addSubcontractOrder,
  deleteCrewPiecePayment,
  deleteCrewTimelog,
  deleteProjectCrew,
  deleteProjectDocument,
  deleteSubcontractOrder,
  getCrewPiecePayments,
  getCrewTimelogs,
  getProjectChecks,
  getProjectCrew,
  getProjectDocuments,
  getSubcontractOrders,
  getVendors,
  removeProjectCheckPhoto,
  saveProjectCheck,
  updateCrewPiecePaymentStatus,
  updateSubcontractStatus,
} from "@/lib/production/extras-actions";
import {
  CREW_ROLES,
  SUBCONTRACT_STATUSES,
  type CheckStage,
  type CrewPiecePayment,
  type CrewRole,
  type CrewTimelog,
  type PiecePaymentStatus,
  type ProjectCheck,
  type ProjectCrew,
  type ProjectDocument,
  type SubcontractMaterialItem,
  type SubcontractOrder,
  type SubcontractStatus,
  type Vendor,
} from "@/lib/production/extras-types";
import { formatDateID, formatRupiah, todayISO } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { useSyncedState, useResetOnChange } from "@/lib/shared/use-synced-state";

const STAGE_LABEL: Record<CheckStage, string> = { instalasi: "Saat Instalasi", bongkar: "Saat Bongkar" };
const EMPTY_CREW_FORM = { nama: "", peran: "Tukang/Instalatur" as CrewRole, kontak: "", catatan: "" };
const EMPTY_TIMELOG_FORM = { tanggal: todayISO(), jam: "1", catatan: "" };
const EMPTY_PIECE_FORM = { deskripsiPekerjaan: "", jumlahUnit: "1", ratePerUnit: "", catatan: "" };
const PIECE_STATUS_STYLE: Record<PiecePaymentStatus, string> = {
  "Belum Dibayar": "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  Dibayar: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
};
const EMPTY_SUBCONTRACT_FORM = {
  vendorId: "",
  deskripsiPekerjaan: "",
  tanggalKirim: todayISO(),
  estimasiTerima: "",
  biayaJasa: "",
  catatan: "",
};
const SUBCONTRACT_STATUS_STYLE: Record<SubcontractStatus, string> = {
  Dikirim: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  Diproses: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  Diterima: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  Dibatalkan: "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400",
};

function CheckStagePanel({
  projectId,
  stage,
  check,
  onSaved,
}: {
  projectId: string;
  stage: CheckStage;
  check: ProjectCheck | undefined;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [catatan, setCatatan] = useSyncedState(check?.catatan ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    const formData = new FormData();
    const files = fileInputRef.current?.files;
    if (files) {
      for (const file of Array.from(files)) formData.append("photos", file);
    }
    setSubmitting(true);
    const result = await saveProjectCheck(projectId, stage, catatan, formData);
    setSubmitting(false);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast(`Checklist "${STAGE_LABEL[stage]}" berhasil disimpan.`);
    onSaved();
  }

  async function handleRemovePhoto(url: string) {
    const result = await removeProjectCheckPhoto(projectId, stage, url);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    onSaved();
  }

  return (
    <div className="space-y-3 rounded-xl border border-black/5 p-3.5 dark:border-white/10">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {STAGE_LABEL[stage]}
      </p>
      {check?.checkedAt && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Sudah dicek {new Date(check.checkedAt).toLocaleString("id-ID")}
        </p>
      )}

      {check && check.photoUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {check.photoUrls.map((url) => (
            <div key={url} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- foto dari Supabase Storage */}
              <img src={url} alt="Foto checklist" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemovePhoto(url)}
                aria-label="Hapus foto ini"
                className="absolute inset-0 hidden items-center justify-center bg-black/50 text-white group-hover:flex"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={catatan}
        onChange={(e) => setCatatan(e.target.value)}
        rows={2}
        placeholder={`Catatan ${STAGE_LABEL[stage].toLowerCase()}…`}
        className="w-full resize-none rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
      />

      <div className="flex items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" id={`project-check-file-${stage}`} />
        <label
          htmlFor={`project-check-file-${stage}`}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          <Upload className="h-3.5 w-3.5" />
          Tambah Foto
        </label>
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Simpan
        </button>
      </div>
    </div>
  );
}

/**
 * Jam kerja kru (Tahap 44 — gap #4 analisis-gap-production.md) — panel
 * expand per baris kru, dibuka lewat toggle di `ProjectDetailModal` supaya
 * daftar kru tidak langsung penuh form jam kerja kalau belum dibutuhkan.
 * Versi INTERNAL saja: jam diisi manual staf, belum terhubung sistem
 * payroll sungguhan (lihat rekomendasi di analisis-gap-production.md).
 */
function CrewTimelogPanel({ crewId, crewName }: { crewId: string; crewName: string }) {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<CrewTimelog[] | null>(null);
  const [form, setForm] = useState(EMPTY_TIMELOG_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function reload() {
    getCrewTimelogs(crewId).then(setLogs);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewId]);

  const totalJam = (logs ?? []).reduce((sum, l) => sum + l.jam, 0);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const jam = Number(form.jam);
    if (!form.tanggal) {
      setError("Tanggal wajib diisi.");
      return;
    }
    if (!Number.isFinite(jam) || jam <= 0) {
      setError("Jam kerja harus lebih dari 0.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await addCrewTimelog(crewId, { tanggal: form.tanggal, jam, catatan: form.catatan });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm(EMPTY_TIMELOG_FORM);
    reload();
    showToast(`Jam kerja ${crewName} berhasil dicatat.`);
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    const result = await deleteCrewTimelog(id);
    setRemovingId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setLogs((prev) => prev?.filter((l) => l.id !== id) ?? null);
  }

  return (
    <div className="mt-2 space-y-2.5 rounded-lg bg-zinc-50 p-3 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Riwayat Jam Kerja
        </p>
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Total {totalJam} jam</span>
      </div>

      {logs === null ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Memuat…</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Belum ada jam kerja tercatat.</p>
      ) : (
        <ul className="space-y-1">
          {logs.map((l) => (
            <li key={l.id} className={cn("flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
              <span className="text-zinc-500 dark:text-zinc-400">{formatDateID(l.tanggal)}</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">{l.jam} jam</span>
              {l.catatan && <span className="min-w-0 flex-1 truncate text-zinc-400 dark:text-zinc-500">{l.catatan}</span>}
              <button
                type="button"
                onClick={() => handleRemove(l.id)}
                disabled={removingId === l.id}
                aria-label="Hapus catatan jam kerja"
                className="shrink-0 rounded-full p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`timelog-tanggal-${crewId}`} className="mb-1 block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
            Tanggal
          </label>
          <input
            id={`timelog-tanggal-${crewId}`}
            type="date"
            value={form.tanggal}
            onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
            className="rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-xs text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>
        <div>
          <label htmlFor={`timelog-jam-${crewId}`} className="mb-1 block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
            Jam
          </label>
          <input
            id={`timelog-jam-${crewId}`}
            type="number"
            min={0.5}
            step={0.5}
            value={form.jam}
            onChange={(e) => setForm((f) => ({ ...f, jam: e.target.value }))}
            className="w-16 rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-xs text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>
        <input
          value={form.catatan}
          onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
          placeholder="Catatan (opsional)"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-2.5 py-1.5 text-xs text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
        />
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
          Catat
        </button>
      </form>
      {error && (
        <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Upah borongan/piece-rate kru (analisis-kompetitor #21) — panel expand
 * terpisah dari `CrewTimelogPanel` (jam kerja per-jam), sama pola tapi
 * mencatat kesepakatan borongan per pekerjaan/unit-booth. Versi INTERNAL
 * saja, belum terhubung payroll sungguhan.
 */
function CrewPiecePaymentPanel({ crewId, crewName }: { crewId: string; crewName: string }) {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<CrewPiecePayment[] | null>(null);
  const [form, setForm] = useState(EMPTY_PIECE_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    getCrewPiecePayments(crewId).then(setPayments);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewId]);

  const totalUpah = (payments ?? []).reduce((sum, p) => sum + p.totalUpah, 0);
  const jumlahUnit = Number(form.jumlahUnit);
  const ratePerUnit = Number(form.ratePerUnit);
  const previewTotal = Number.isFinite(jumlahUnit) && Number.isFinite(ratePerUnit) ? jumlahUnit * ratePerUnit : 0;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!form.deskripsiPekerjaan.trim()) {
      setError("Deskripsi pekerjaan wajib diisi.");
      return;
    }
    if (!Number.isFinite(jumlahUnit) || jumlahUnit <= 0) {
      setError("Jumlah unit harus lebih dari 0.");
      return;
    }
    if (!Number.isFinite(ratePerUnit) || ratePerUnit < 0) {
      setError("Rate per unit tidak valid.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await addCrewPiecePayment(crewId, {
      deskripsiPekerjaan: form.deskripsiPekerjaan,
      jumlahUnit,
      ratePerUnit,
      catatan: form.catatan,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm(EMPTY_PIECE_FORM);
    reload();
    showToast(`Upah borongan ${crewName} berhasil dicatat.`);
  }

  async function handleToggleStatus(p: CrewPiecePayment) {
    setBusyId(p.id);
    const nextStatus: PiecePaymentStatus = p.status === "Dibayar" ? "Belum Dibayar" : "Dibayar";
    const result = await updateCrewPiecePaymentStatus(p.id, nextStatus);
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    reload();
  }

  async function handleRemove(id: string) {
    setBusyId(id);
    const result = await deleteCrewPiecePayment(id);
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setPayments((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  return (
    <div className="mt-2 space-y-2.5 rounded-lg bg-zinc-50 p-3 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Upah Borongan
        </p>
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Total {formatRupiah(totalUpah)}</span>
      </div>

      {payments === null ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Memuat…</p>
      ) : payments.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Belum ada upah borongan tercatat.</p>
      ) : (
        <ul className="space-y-1">
          {payments.map((p) => (
            <li key={p.id} className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-800 dark:text-zinc-100">{p.deskripsiPekerjaan}</p>
                <p className="text-zinc-400 dark:text-zinc-500">
                  {p.jumlahUnit} unit × {formatRupiah(p.ratePerUnit)} = {formatRupiah(p.totalUpah)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleStatus(p)}
                disabled={busyId === p.id}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50 ${PIECE_STATUS_STYLE[p.status]}`}
              >
                {p.status}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(p.id)}
                disabled={busyId === p.id}
                aria-label="Hapus upah borongan"
                className="shrink-0 rounded-full p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <input
          value={form.deskripsiPekerjaan}
          onChange={(e) => setForm((f) => ({ ...f, deskripsiPekerjaan: e.target.value }))}
          placeholder="Deskripsi pekerjaan (mis. instalasi booth 3x3)"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-2.5 py-1.5 text-xs text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
        />
        <div>
          <label htmlFor={`piece-unit-${crewId}`} className="mb-1 block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
            Unit
          </label>
          <input
            id={`piece-unit-${crewId}`}
            type="number"
            min={0.5}
            step={0.5}
            value={form.jumlahUnit}
            onChange={(e) => setForm((f) => ({ ...f, jumlahUnit: e.target.value }))}
            className="w-16 rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-xs text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>
        <div>
          <label htmlFor={`piece-rate-${crewId}`} className="mb-1 block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
            Rate/unit (Rp)
          </label>
          <input
            id={`piece-rate-${crewId}`}
            type="number"
            min={0}
            step={1000}
            value={form.ratePerUnit}
            onChange={(e) => setForm((f) => ({ ...f, ratePerUnit: e.target.value }))}
            className="w-28 rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-xs text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
          Catat ({formatRupiah(previewTotal)})
        </button>
      </form>
      {error && (
        <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Subcontracting tracking terintegrasi BOM (analisis-kompetitor #24) --
 * material dari BOM proyek ini yang dikirim ke vendor eksternal (laser
 * cutting, printing besar, dsb) lalu diterima kembali sebagai barang
 * jadi. Picker material SENGAJA mengambil dari `project.materials` (BOM
 * proyek yang sama, lewat `useProductionData()`) supaya benar-benar
 * "terintegrasi BOM", bukan input bebas. Tidak mengubah stok gudang --
 * murni tracking status pengiriman/penerimaan & vendor.
 */
function SubcontractPanel({ projectId }: { projectId: string }) {
  const { showToast } = useToast();
  const { projects, materials } = useProductionData();
  const project = projects.find((p) => p.id === projectId);
  const bomItems = project?.materials ?? [];

  const [orders, setOrders] = useState<SubcontractOrder[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [form, setForm] = useState(EMPTY_SUBCONTRACT_FORM);
  const [pickMaterialId, setPickMaterialId] = useState("");
  const [pickQty, setPickQty] = useState("1");
  const [selectedMaterials, setSelectedMaterials] = useState<SubcontractMaterialItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    getSubcontractOrders(projectId).then(setOrders);
  }

  useEffect(() => {
    reload();
    getVendors().then(setVendors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function materialName(materialId: string) {
    return materials.find((m) => m.id === materialId)?.name ?? "Material tidak dikenal";
  }
  function vendorName(vendorId: string | null) {
    return vendors.find((v) => v.id === vendorId)?.name ?? null;
  }

  function handleAddMaterial() {
    if (!pickMaterialId) return;
    const qty = Number(pickQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    setSelectedMaterials((prev) => {
      const existing = prev.find((m) => m.materialId === pickMaterialId);
      if (existing) {
        return prev.map((m) => (m.materialId === pickMaterialId ? { ...m, qty } : m));
      }
      return [...prev, { materialId: pickMaterialId, qty }];
    });
    setPickMaterialId("");
    setPickQty("1");
  }

  function handleRemoveMaterial(materialId: string) {
    setSelectedMaterials((prev) => prev.filter((m) => m.materialId !== materialId));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!form.deskripsiPekerjaan.trim()) {
      setError("Deskripsi pekerjaan wajib diisi.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await addSubcontractOrder(projectId, {
      vendorId: form.vendorId || undefined,
      deskripsiPekerjaan: form.deskripsiPekerjaan,
      materialDikirim: selectedMaterials,
      tanggalKirim: form.tanggalKirim || undefined,
      estimasiTerima: form.estimasiTerima || undefined,
      biayaJasa: form.biayaJasa ? Number(form.biayaJasa) : undefined,
      catatan: form.catatan || undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast(`Subkontrak "${form.deskripsiPekerjaan}" berhasil dicatat.`);
    setForm(EMPTY_SUBCONTRACT_FORM);
    setSelectedMaterials([]);
    reload();
  }

  async function handleStatusChange(order: SubcontractOrder, status: SubcontractStatus) {
    setBusyId(order.id);
    const result = await updateSubcontractStatus(order.id, status);
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    reload();
  }

  async function handleRemove(id: string) {
    setBusyId(id);
    const result = await deleteSubcontractOrder(id);
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setOrders((prev) => prev?.filter((o) => o.id !== id) ?? null);
  }

  return (
    <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/10">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        <Boxes className="h-3.5 w-3.5" />
        Subkontrak / Vendor Eksternal
      </p>

      {orders === null ? (
        <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">Memuat…</p>
      ) : orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/10 px-3.5 py-3 text-xs text-zinc-400 dark:border-white/10">
          Belum ada material yang dikirim ke vendor eksternal.
        </p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id} className="rounded-xl border border-black/5 px-3 py-2.5 dark:border-white/10">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{o.deskripsiPekerjaan}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {vendorName(o.vendorId) ?? "Vendor belum ditentukan"} · Dikirim {formatDateID(o.tanggalKirim)}
                    {o.tanggalTerima && ` · Diterima ${formatDateID(o.tanggalTerima)}`}
                    {o.biayaJasa > 0 && ` · ${formatRupiah(o.biayaJasa)}`}
                  </p>
                  {o.materialDikirim.length > 0 && (
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                      {o.materialDikirim.map((m) => `${materialName(m.materialId)} (${m.qty})`).join(", ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(o.id)}
                  disabled={busyId === o.id}
                  aria-label={`Hapus subkontrak ${o.deskripsiPekerjaan}`}
                  className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUBCONTRACT_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusChange(o, s)}
                    disabled={busyId === o.id}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${
                      o.status === s ? SUBCONTRACT_STATUS_STYLE[s] : "bg-zinc-50 text-zinc-400 dark:bg-white/5 dark:text-zinc-500"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="mt-3 space-y-3 rounded-xl border border-black/5 p-3.5 dark:border-white/10">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sub-vendor" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Vendor Eksternal
            </label>
            <select
              id="sub-vendor"
              value={form.vendorId}
              onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              <option value="">— Belum ditentukan —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sub-biaya" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Biaya Jasa (opsional)
            </label>
            <input
              id="sub-biaya"
              type="number"
              min={0}
              step={1000}
              value={form.biayaJasa}
              onChange={(e) => setForm((f) => ({ ...f, biayaJasa: e.target.value }))}
              placeholder="0"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
        </div>

        <input
          value={form.deskripsiPekerjaan}
          onChange={(e) => setForm((f) => ({ ...f, deskripsiPekerjaan: e.target.value }))}
          placeholder="Deskripsi pekerjaan (mis. laser cutting akrilik logo)"
          className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sub-kirim" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Tanggal Kirim
            </label>
            <input
              id="sub-kirim"
              type="date"
              value={form.tanggalKirim}
              onChange={(e) => setForm((f) => ({ ...f, tanggalKirim: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="sub-estimasi" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Estimasi Terima (opsional)
            </label>
            <input
              id="sub-estimasi"
              type="date"
              value={form.estimasiTerima}
              onChange={(e) => setForm((f) => ({ ...f, estimasiTerima: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
        </div>

        {bomItems.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Material dari BOM yang Dikirim (opsional)
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <select
                value={pickMaterialId}
                onChange={(e) => setPickMaterialId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-2.5 py-1.5 text-xs text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                <option value="">Pilih material dari BOM proyek…</option>
                {bomItems.map((m) => (
                  <option key={m.materialId} value={m.materialId}>
                    {materialName(m.materialId)} (alokasi {m.qty})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0.01}
                step={0.5}
                value={pickQty}
                onChange={(e) => setPickQty(e.target.value)}
                className="w-16 rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-xs text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
              <button
                type="button"
                onClick={handleAddMaterial}
                className="rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
              >
                Tambah
              </button>
            </div>
            {selectedMaterials.length > 0 && (
              <ul className="mt-2 space-y-1">
                {selectedMaterials.map((m) => (
                  <li
                    key={m.materialId}
                    className="flex items-center justify-between rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs dark:bg-white/[0.03]"
                  >
                    <span className="text-zinc-700 dark:text-zinc-200">
                      {materialName(m.materialId)} × {m.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMaterial(m.materialId)}
                      aria-label={`Hapus ${materialName(m.materialId)} dari daftar kirim`}
                      className="text-zinc-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <textarea
          value={form.catatan}
          onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
          rows={2}
          placeholder="Catatan (opsional) — mis. instruksi khusus untuk vendor"
          className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
        />

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Catat Pengiriman ke Vendor
        </button>
      </form>
    </div>
  );
}

/**
 * Lampiran gambar kerja/desain (Tahap 44 — gap #6 analisis-gap-production.md)
 * — denah, rendering, shop drawing per proyek. TERPISAH dari dokumentasi
 * before/after instalasi (bucket & tabel beda) karena tujuannya beda: ini
 * arsip kerja tim desain/produksi, bukan bukti hasil akhir ke klien.
 * Mendukung file gambar ATAU PDF, staf saja yang bisa unggah/lihat untuk
 * sekarang (sama seperti seluruh modul Production — belum ada portal
 * klien, lihat rekomendasi Prioritas Tinggi #6 di gap report).
 */
function ProjectDocumentsSection({ projectId }: { projectId: string }) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<ProjectDocument[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function reload() {
    getProjectDocuments(projectId).then(setDocs);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("file", file);
    setUploading(true);
    const result = await addProjectDocument(formData);
    setUploading(false);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    reload();
    showToast(`"${file.name}" berhasil diunggah.`);
  }

  async function handleRemove(doc: ProjectDocument) {
    setRemovingId(doc.id);
    const result = await deleteProjectDocument(doc.id);
    setRemovingId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
    showToast(`"${doc.fileName}" berhasil dihapus.`);
  }

  return (
    <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/10">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        <Paperclip className="h-3.5 w-3.5" />
        Lampiran Gambar Kerja/Desain
      </p>

      {docs === null ? (
        <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">Memuat…</p>
      ) : docs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/10 px-3.5 py-3 text-xs text-zinc-400 dark:border-white/10">
          Belum ada lampiran gambar kerja/desain untuk proyek ini.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-black/5 px-3 py-2 dark:border-white/10">
              <a
                href={d.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-200"
              >
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="truncate">{d.fileName}</span>
              </a>
              <button
                type="button"
                onClick={() => handleRemove(d)}
                disabled={removingId === d.id}
                aria-label={`Hapus lampiran ${d.fileName}`}
                className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
          id="project-document-file"
        />
        <label
          htmlFor="project-document-file"
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? "Mengunggah…" : "Unggah Gambar/PDF"}
        </label>
      </div>
    </div>
  );
}

/**
 * Detail proyek booth (Tahap 28c) — gabungan checklist instalasi & bongkar
 * (dengan foto) DAN penugasan kru, dibuka lewat satu tombol baru di
 * `BoothProjectManager` supaya tidak perlu dua tombol terpisah di baris
 * tabel yang sudah cukup padat. Datanya di-fetch on-demand tiap modal
 * dibuka, sama persis polanya dengan `BookingConditionModal` Magnarent.
 */
export function ProjectDetailModal({
  projectId,
  projectName,
  open,
  onClose,
}: {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [checks, setChecks] = useState<ProjectCheck[] | null>(null);
  const [crew, setCrew] = useState<ProjectCrew[] | null>(null);
  const [crewForm, setCrewForm] = useState(EMPTY_CREW_FORM);
  const [crewError, setCrewError] = useState<string | null>(null);
  const [addingCrew, setAddingCrew] = useState(false);
  const [removingCrewId, setRemovingCrewId] = useState<string | null>(null);
  const [expandedCrewId, setExpandedCrewId] = useState<string | null>(null);
  const [portalShareOpen, setPortalShareOpen] = useState(false);

  function reloadChecks() {
    getProjectChecks(projectId).then(setChecks);
  }

  function reloadCrew() {
    getProjectCrew(projectId).then(setCrew);
  }

  useResetOnChange(open ? projectId : null, (key) => {
    if (key === null) return;
    setCrewForm(EMPTY_CREW_FORM);
    setCrewError(null);
  });

  useEffect(() => {
    if (!open) return;
    reloadChecks();
    reloadCrew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  async function handleAddCrew(e: FormEvent) {
    e.preventDefault();
    if (!crewForm.nama.trim()) {
      setCrewError("Nama kru wajib diisi.");
      return;
    }
    setCrewError(null);
    setAddingCrew(true);
    const result = await addProjectCrew(projectId, {
      nama: crewForm.nama,
      peran: crewForm.peran,
      kontak: crewForm.kontak,
      catatan: crewForm.catatan,
    });
    setAddingCrew(false);

    if (!result.ok) {
      setCrewError(result.error);
      return;
    }
    setCrewForm(EMPTY_CREW_FORM);
    reloadCrew();
    showToast(`Kru "${crewForm.nama.trim()}" berhasil ditambahkan.`);
  }

  async function handleRemoveCrew(id: string, nama: string) {
    setRemovingCrewId(id);
    const result = await deleteProjectCrew(id);
    setRemovingCrewId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setCrew((prev) => prev?.filter((c) => c.id !== id) ?? null);
    showToast(`Kru "${nama}" berhasil dihapus dari proyek.`);
  }

  const checkByStage = (stage: CheckStage) => checks?.find((c) => c.stage === stage);

  return (
    <Modal open={open} onClose={onClose} title={`Detail Proyek — ${projectName}`} maxWidth="max-w-xl">
      <div>
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setPortalShareOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-emerald-50 hover:text-emerald-600 dark:text-zinc-400 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
          >
            <Share2 className="h-3.5 w-3.5" />
            Bagikan ke Klien
          </button>
        </div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Checklist Instalasi & Bongkar
        </p>
        {checks === null ? (
          <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">Memuat…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckStagePanel projectId={projectId} stage="instalasi" check={checkByStage("instalasi")} onSaved={reloadChecks} />
            <CheckStagePanel projectId={projectId} stage="bongkar" check={checkByStage("bongkar")} onSaved={reloadChecks} />
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/10">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          <Users className="h-3.5 w-3.5" />
          Kru Proyek
        </p>

        {crew === null ? (
          <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">Memuat…</p>
        ) : crew.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/10 px-3.5 py-3 text-xs text-zinc-400 dark:border-white/10">
            Belum ada kru ditugaskan ke proyek ini.
          </p>
        ) : (
          <div className="space-y-2">
            {crew.map((c) => {
              const isExpanded = expandedCrewId === c.id;
              return (
                <div key={c.id} className="rounded-xl border border-black/5 px-3 py-2.5 dark:border-white/10">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedCrewId(isExpanded ? null : c.id)}
                      className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                    >
                      <ChevronDown
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                      <span className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                          {c.nama} <span className="font-normal text-zinc-400 dark:text-zinc-500">— {c.peran}</span>
                        </p>
                        {c.kontak && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{c.kontak}</p>}
                        {c.catatan && <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{c.catatan}</p>}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setExpandedCrewId(isExpanded ? null : c.id)}
                        title="Jam kerja"
                        aria-label={`Jam kerja ${c.nama}`}
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCrew(c.id, c.nama)}
                        disabled={removingCrewId === c.id}
                        aria-label={`Hapus kru ${c.nama}`}
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <>
                      <CrewTimelogPanel crewId={c.id} crewName={c.nama} />
                      <CrewPiecePaymentPanel crewId={c.id} crewName={c.nama} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={handleAddCrew} className="mt-3 space-y-3 rounded-xl border border-black/5 p-3.5 dark:border-white/10">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="crew-nama" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Nama Kru
              </label>
              <input
                id="crew-nama"
                value={crewForm.nama}
                onChange={(e) => setCrewForm((f) => ({ ...f, nama: e.target.value }))}
                placeholder="mis. Budi Santoso"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="crew-peran" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Peran
              </label>
              <select
                id="crew-peran"
                value={crewForm.peran}
                onChange={(e) => setCrewForm((f) => ({ ...f, peran: e.target.value as CrewRole }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {CREW_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <input
            value={crewForm.kontak}
            onChange={(e) => setCrewForm((f) => ({ ...f, kontak: e.target.value }))}
            placeholder="Kontak (opsional) — mis. 0812xxxxxxx"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />
          <input
            value={crewForm.catatan}
            onChange={(e) => setCrewForm((f) => ({ ...f, catatan: e.target.value }))}
            placeholder="Catatan (opsional) — mis. bertugas hari H saja"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />

          {crewError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {crewError}
            </p>
          )}

          <button
            type="submit"
            disabled={addingCrew}
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {addingCrew && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Tambah Kru
          </button>
        </form>
      </div>

      <SubcontractPanel projectId={projectId} />

      <ProjectDocumentsSection projectId={projectId} />

      {portalShareOpen && (
        <PortalShareModal
          module="production"
          entityId={projectId}
          entityLabel={projectName}
          onClose={() => setPortalShareOpen(false)}
        />
      )}
    </Modal>
  );
}
