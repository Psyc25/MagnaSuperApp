"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  History,
  Link2,
  MapPin,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/cn";
import {
  addEventChecklistItem,
  approveChecklistPhaseReview,
  bulkAdvanceChecklistPhase,
  confirmChecklistCompleted,
  deleteEventChecklistItem,
  markProductionDone,
  rejectChecklistPhaseReview,
  revertChecklistPhase,
  setChecklistNeedsProduction,
  submitChecklistPhaseReview,
  updateChecklistPicLapangan,
  updateChecklistProduction,
  updateEventChecklistItem,
  updateEventChecklistProgress,
} from "@/lib/events/actions";
import { ChecklistHistoryModal } from "./ChecklistHistoryModal";
import { ChecklistDiscussionModal } from "./ChecklistDiscussionModal";
import { ChecklistProgressRing } from "./ChecklistProgressRing";
import {
  CHECKLIST_PHASES,
  CHECKLIST_PHASE_LABELS,
  CHECKLIST_REVIEW_PHASES,
  CHECKLIST_SUB_STATUS_LABELS,
  EVENT_SOURCE_LABELS,
  computeChecklistItemProgress,
  type ChecklistPhase,
  type ChecklistPhaseReview,
  type ChecklistReviewPhase,
  type EventChecklistItem,
  type EventLink,
  type EventSummary,
  type PicOption,
} from "@/lib/events/types";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { prepareUploadFiles } from "@/lib/shared/image";

const STATUS_BADGE: Record<string, string> = {
  Berjalan: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  Selesai: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  Dibatalkan: "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400",
};

/** Penjelasan singkat tiap istilah fase/sub-status buat staff lapangan
 * yang tidak familiar istilah produksi -- ditampilkan lewat `title`
 * (tooltip) di pill fase & badge sub-status, sebelumnya cuma label
 * polos tanpa konteks. */
const CHECKLIST_PHASE_HINTS: Record<ChecklistPhase, string> = {
  design: "Design: sketsa/konsep awal diajukan PIC Produksi untuk direview.",
  mockup: "Mockup: contoh bentuk/ukuran kasar, dibuat setelah Design disetujui.",
  sample: "Sample: contoh jadi mendekati hasil akhir, direview sebelum produksi massal.",
  production: "Production: barang diproduksi sesuai Sample yang sudah disetujui.",
  completed: "Completed: produksi selesai, barang siap dibawa ke lokasi event.",
  loading_in: "Loading In: barang sedang/sudah dibawa masuk ke lokasi event.",
  loading_out: "Loading Out: barang sudah dibongkar & dibawa pulang dari lokasi event.",
  finish: "Finish: seluruh proses item ini selesai.",
};
const CHECKLIST_SUB_STATUS_HINTS: Record<"proposed" | "revised" | "approved", string> = {
  proposed: "Proposed: baru diajukan PIC Produksi, menunggu review Admin/Owner.",
  revised: "Revised: sudah diunggah ulang setelah direvisi/ditolak, menunggu review lagi.",
  approved: "Approved: sudah disetujui Admin/Owner, lanjut ke fase berikutnya.",
};

const DIVISION_LABEL: Record<string, string> = {
  magnarent: "Magnarent",
  magnative: "Magnativ",
  production: "Production",
  all: "Admin/Owner",
};

const BTN =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-violet-700 dark:hover:text-violet-300";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-violet-500 dark:hover:bg-violet-400";
const BTN_DANGER =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10";
const INPUT_XS =
  "rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950";

/** "PIC yang bertanggung jawab" (keputusan Owner) -- akses penuh selalu
 * boleh override. Tahap 52: PIC dipisah 2 (Produksi vs Lapangan), jadi
 * fungsi ini generik menerima id PIC yang relevan langsung (`item.pic`
 * untuk kartu Design/Mockup/Sample/Production, `item.picLapangan` untuk
 * Completed s/d Finish) -- bukan lagi selalu `item.pic`. */
function canActOnItem(itemPicId: string | undefined, currentUserId: string | null, isFullAccess: boolean): boolean {
  if (isFullAccess) return true;
  if (!currentUserId) return false;
  return itemPicId === currentUserId;
}

function emptyTrackingItemForm() {
  return { category: "", itemName: "", detail: "", qtyInfo: "", notes: "", needsProduction: true };
}

/**
 * Modal tambah/edit item checklist -- Tahap F: SENGAJA form ringkas (tanpa
 * vendor/tim/tanggal target, beda dari form lengkap di EventDetailManager)
 * karena ini dipakai staf lapangan langsung dari Papan Tracking untuk
 * menambah item yang mendadak diperlukan, bukan pengganti pengelolaan
 * lengkap Admin. Toggle "Perlu Produksi" cuma tampil waktu MENAMBAH (bukan
 * edit) -- ubah item yang sudah ada tetap lewat `setChecklistNeedsProduction`
 * (satu-satunya jalur, supaya current_phase ikut disesuaikan konsisten).
 */
function AddOrEditItemModal({
  open,
  onClose,
  eventId,
  editingItem,
  categoryOptions,
  nextSortOrder,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  editingItem: EventChecklistItem | null;
  categoryOptions: string[];
  nextSortOrder: number;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyTrackingItemForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastEditingId, setLastEditingId] = useState<string | null | undefined>(undefined);

  // Sinkronisasi form ke item yang diedit (atau kosong kalau tambah baru)
  // -- dilakukan di sini (bukan `useEffect`) supaya form sudah terisi
  // benar di render pertama saat modal dibuka, tanpa kedipan.
  const editingKey = editingItem?.id ?? null;
  if (open && editingKey !== lastEditingId) {
    setLastEditingId(editingKey);
    setForm(
      editingItem
        ? {
            category: editingItem.category,
            itemName: editingItem.itemName,
            detail: editingItem.detail ?? "",
            qtyInfo: editingItem.qtyInfo ?? "",
            notes: editingItem.notes ?? "",
            needsProduction: editingItem.needsProduction,
          }
        : emptyTrackingItemForm()
    );
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.category.trim() || !form.itemName.trim()) {
      setError("Kategori dan nama item wajib diisi.");
      return;
    }
    setSubmitting(true);
    const result = editingItem
      ? await updateEventChecklistItem(editingItem.id, eventId, form)
      : await addEventChecklistItem(eventId, form, nextSortOrder);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast(editingItem ? "Item checklist diperbarui." : "Item checklist ditambahkan.");
    onClose();
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={editingItem ? "Edit Item Checklist" : "Tambah Item Checklist"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Kategori</label>
          <input
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="mis. A. VENUE"
            list="tracking-category-options"
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          />
          <datalist id="tracking-category-options">
            {categoryOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Nama Item</label>
          <input
            value={form.itemName}
            onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))}
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Detail <span className="font-normal text-zinc-400">(opsional)</span>
            </label>
            <input
              value={form.detail}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Qty/Durasi <span className="font-normal text-zinc-400">(opsional)</span>
            </label>
            <input
              value={form.qtyInfo}
              onChange={(e) => setForm((f) => ({ ...f, qtyInfo: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Keterangan <span className="font-normal text-zinc-400">(opsional)</span>
          </label>
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          />
        </div>
        {!editingItem && (
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
                  onClick={() => setForm((f) => ({ ...f, needsProduction: opt.value }))}
                  className={cn(
                    "flex-1 rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition-colors",
                    form.needsProduction === opt.value
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
          >
            {editingItem ? "Simpan" : "Tambah"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Ekstensi umum untuk gambar -- dipakai `isImageAttachment` menebak
 * balik dari URL lampiran (foto atau file) apakah dia gambar (dirender
 * jadi thumbnail) atau file dokumen biasa (dirender jadi kartu link). */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|avif|heic)$/i;
function isImageAttachment(url: string): boolean {
  return IMAGE_EXT_RE.test(url.split("?")[0]);
}

/** Nama file dari URL lampiran (fallback "file" kalau gagal parse) --
 * dipakai label kartu link lampiran non-gambar. */
function attachmentFileName(url: string): string {
  try {
    const last = url.split("?")[0].split("/").pop();
    return last ? decodeURIComponent(last) : "file";
  } catch {
    return "file";
  }
}

/** Thumbnail (gambar) atau kartu link (file dokumen) untuk satu lampiran
 * yang sudah tersimpan -- dipakai di kartu review fase & Production. */
function AttachmentPreview({ url, alt }: { url: string; alt: string }) {
  if (isImageAttachment(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="h-16 w-16 rounded-lg object-cover" />
      </a>
    );
  }
  const name = attachmentFileName(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={name}
      className="mt-2 inline-flex max-w-[10rem] items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{name}</span>
    </a>
  );
}

/** Dua tombol pilihan mode lampiran -- "Ambil Foto" (langsung buka kamera
 * HP lewat `capture="environment"`) ATAU "Pilih File" (dialog file biasa,
 * bisa dokumen/PDF/dll) -- PIC tinggal pilih salah satu, keduanya menulis
 * ke state `file` yang sama karena server (lihat actions.ts) tidak lagi
 * membedakan tipe, cuma menyimpan sebagai satu lampiran. */
function AttachmentPickerButtons({
  file,
  onSelect,
  disabled,
  photoLabel,
  fileLabel,
}: {
  file: File | null;
  onSelect: (file: File | null) => void;
  disabled?: boolean;
  photoLabel?: string;
  fileLabel?: string;
}) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => {
          onSelect(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        disabled={disabled}
        onChange={(e) => {
          onSelect(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
        className="hidden"
      />
      <button type="button" onClick={() => photoInputRef.current?.click()} disabled={disabled} className={BTN}>
        <Camera className="h-3.5 w-3.5" />
        {photoLabel ?? "Ambil Foto"}
      </button>
      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled} className={BTN}>
        <Paperclip className="h-3.5 w-3.5" />
        {fileLabel ?? "Pilih File"}
      </button>
      {file && (
        <span className="max-w-[9rem] truncate text-[11px] text-zinc-500 dark:text-zinc-400" title={file.name}>
          {file.name}
        </span>
      )}
    </div>
  );
}

/** Ringkasan visual posisi item di alur 8-fase (atau 4-fase kalau
 * `needsProduction=false`, lompat langsung dari Completed). */
function PhaseStepper({ item }: { item: EventChecklistItem }) {
  const seq: ChecklistPhase[] = item.needsProduction
    ? CHECKLIST_PHASES
    : ["completed", "loading_in", "loading_out", "finish"];
  const currentIdx = seq.indexOf(item.currentPhase);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {seq.map((phase, i) => (
        <span
          key={phase}
          title={CHECKLIST_PHASE_HINTS[phase]}
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            i < currentIdx
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              : i === currentIdx
                ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                : "bg-zinc-100 text-zinc-400 dark:bg-white/5 dark:text-zinc-500"
          )}
        >
          {CHECKLIST_PHASE_LABELS[phase]}
        </span>
      ))}
    </div>
  );
}

/** Kartu aksi Design/Mockup/Sample -- siklus Proposed -> Revised ->
 * Approved, foto WAJIB sebelum fase berikutnya terbuka (keputusan Owner). */
function ReviewPhaseCard({
  item,
  phase,
  review,
  canAct,
  isFullAccess,
  eventId,
  onChanged,
}: {
  item: EventChecklistItem;
  phase: ChecklistReviewPhase;
  review: ChecklistPhaseReview | undefined;
  canAct: boolean;
  isFullAccess: boolean;
  eventId: string;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  // Owner: dulu approve/reject langsung eksekusi begitu tombol ditekan
  // (rawan "kepencet") -- sekarang WAJIB konfirmasi dulu lewat ConfirmDialog.
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  // Reject MENGHAPUS baris review (lihat rejectChecklistPhaseReview) --
  // tanpa penanda lokal ini, kartu balik kosong polos sama seperti item
  // yang belum pernah diisi, bikin PIC mengira datanya hilang/error,
  // bukan paham itu artinya "ditolak, unggah ulang". Reset otomatis
  // begitu `review` ada lagi (submit ulang berhasil).
  const [justRejected, setJustRejected] = useState(false);
  const subStatus = review?.subStatus;

  function submit() {
    if (!file) return;
    startTransition(async () => {
      const prepared = await prepareUploadFiles([file]);
      if (!prepared.ok) {
        showToast(prepared.error, "error");
        return;
      }
      const fd = new FormData();
      fd.set("itemId", item.id);
      fd.set("eventId", eventId);
      fd.set("phase", phase);
      fd.set("file", prepared.files[0]);
      const result = await submitChecklistPhaseReview(fd);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast("Lampiran tersimpan.");
      setFile(null);
      onChanged();
    });
  }

  function approve() {
    startTransition(async () => {
      const result = await approveChecklistPhaseReview(item.id, eventId, phase);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(`${CHECKLIST_PHASE_LABELS[phase]} disetujui.`);
      onChanged();
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectChecklistPhaseReview(item.id, eventId, phase);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(`${CHECKLIST_PHASE_LABELS[phase]} ditolak, PIC perlu unggah ulang.`);
      setJustRejected(true);
      onChanged();
    });
  }

  return (
    <div className="mt-2 rounded-xl border border-zinc-100 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          title={CHECKLIST_PHASE_HINTS[phase]}
          className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
        >
          {CHECKLIST_PHASE_LABELS[phase]}
        </p>
        {subStatus ? (
          <span
            title={CHECKLIST_SUB_STATUS_HINTS[subStatus]}
            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
          >
            {CHECKLIST_SUB_STATUS_LABELS[subStatus]}
            {review && review.revisionCount > 0 ? ` (revisi ${review.revisionCount})` : ""}
          </span>
        ) : justRejected ? (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
            Ditolak
          </span>
        ) : null}
      </div>

      {review?.photoUrl && <AttachmentPreview url={review.photoUrl} alt="Lampiran konfirmasi" />}

      {!canAct ? (
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          Menunggu PIC Produksi ({item.picName ?? "belum ditugaskan"}).
        </p>
      ) : subStatus === "approved" ? (
        <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Disetujui.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!review && justRejected && (
            <p className="w-full text-xs font-medium text-rose-600 dark:text-rose-300">
              Ditolak oleh Admin/Owner -- silakan unggah ulang foto/file konfirmasi.
            </p>
          )}
          <AttachmentPickerButtons
            file={file}
            onSelect={setFile}
            disabled={pending}
            photoLabel={review ? "Ambil Ulang Foto" : "Ambil Foto"}
            fileLabel={review ? "Ganti File" : "Pilih File"}
          />
          <button type="button" onClick={submit} disabled={pending || !file} className={BTN}>
            {review ? "Simpan Revisi" : "Kirim"}
          </button>
          {isFullAccess && review?.photoUrl && (
            <>
              <button
                type="button"
                onClick={() => setConfirmAction("approve")}
                disabled={pending}
                className={cn(BTN_PRIMARY, "inline-flex items-center gap-1")}
              >
                <Check className="h-3.5 w-3.5" />
                Setujui
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction("reject")}
                disabled={pending}
                className={cn(BTN_DANGER, "ml-2 inline-flex items-center gap-1")}
              >
                <X className="h-3.5 w-3.5" />
                Tolak
              </button>
            </>
          )}
          {!isFullAccess && review?.photoUrl && (
            <p className="w-full text-[11px] text-zinc-400 dark:text-zinc-500">
              Menunggu persetujuan Admin/Owner.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction === "approve") approve();
          else if (confirmAction === "reject") reject();
          setConfirmAction(null);
        }}
        title={confirmAction === "approve" ? `Setujui ${CHECKLIST_PHASE_LABELS[phase]}?` : `Tolak ${CHECKLIST_PHASE_LABELS[phase]}?`}
        description={
          confirmAction === "approve"
            ? `Fase ${CHECKLIST_PHASE_LABELS[phase]} untuk "${item.itemName}" akan disetujui dan lanjut ke fase berikutnya.`
            // Disederhanakan (Tahap 52) -- reject SEKARANG cuma mundurkan
            // fase ini sendiri (bukan lagi cascading balik ke Design),
            // jadi pesannya sama untuk ketiga fase review. Ditegaskan di
            // teks (bukan cuma di komentar kode) karena Admin/Owner yang
            // masih ingat perilaku lama bisa ragu-ragu menekan Tolak.
            : `Fase ${CHECKLIST_PHASE_LABELS[phase]} untuk "${item.itemName}" akan ditolak -- PIC perlu unggah ulang foto/file konfirmasi. Hanya fase ini yang diulang; fase lain yang sudah disetujui sebelumnya TIDAK ikut berubah.`
        }
        confirmLabel={confirmAction === "approve" ? "Setujui" : "Tolak"}
        confirmVariant={confirmAction === "approve" ? "primary" : "danger"}
      />
    </div>
  );
}

/** Kartu aksi fase Production -- draft qty/catatan/foto bisa disimpan
 * berkali-kali, "Tandai Selesai" baru aktif setelah ada foto tersimpan. */
function ProductionCard({
  item,
  eventId,
  canAct,
  onChanged,
}: {
  item: EventChecklistItem;
  eventId: string;
  canAct: boolean;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState(item.productionQty ?? "");
  const [notes, setNotes] = useState(item.productionNotes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [confirmDone, setConfirmDone] = useState(false);

  function saveDraft() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("itemId", item.id);
      fd.set("eventId", eventId);
      fd.set("qty", qty);
      fd.set("notes", notes);
      if (file) {
        const prepared = await prepareUploadFiles([file]);
        if (!prepared.ok) {
          showToast(prepared.error, "error");
          return;
        }
        fd.set("file", prepared.files[0]);
      }
      const result = await updateChecklistProduction(fd);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast("Draft produksi disimpan.");
      setFile(null);
      onChanged();
    });
  }

  function markDone() {
    startTransition(async () => {
      const result = await markProductionDone(item.id, eventId);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast("Production selesai.");
      onChanged();
    });
  }

  if (!canAct) {
    return (
      <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
        Menunggu PIC Produksi ({item.picName ?? "belum ditugaskan"}) mengisi Production.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-zinc-100 p-3 dark:border-white/10">
      <div className="flex flex-wrap gap-2">
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="Qty"
          disabled={pending}
          className={cn(INPUT_XS, "w-20")}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Catatan produksi"
          disabled={pending}
          className={cn(INPUT_XS, "min-w-[8rem] flex-1")}
        />
        <AttachmentPickerButtons
          file={file}
          onSelect={setFile}
          disabled={pending}
          photoLabel="Ambil Foto Produksi"
          fileLabel="Pilih File Produksi"
        />
      </div>
      {item.productionPhotoUrl && <AttachmentPreview url={item.productionPhotoUrl} alt="Lampiran produksi" />}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={saveDraft} disabled={pending} className={BTN}>
          Simpan Draft
        </button>
        <button
          type="button"
          onClick={() => setConfirmDone(true)}
          disabled={pending || !item.productionPhotoUrl}
          title={!item.productionPhotoUrl ? "Simpan draft dengan foto/file dulu" : undefined}
          className={BTN_PRIMARY}
        >
          Tandai Selesai
        </button>
      </div>

      <ConfirmDialog
        open={confirmDone}
        onClose={() => setConfirmDone(false)}
        onConfirm={() => {
          markDone();
          setConfirmDone(false);
        }}
        title="Tandai Production Selesai?"
        description={`Item "${item.itemName}" akan lanjut ke fase Completed.`}
        confirmLabel="Tandai Selesai"
        confirmVariant="primary"
      />
    </div>
  );
}

/** Kartu aksi fase Completed -- cuma konfirmasi, tanpa foto (berlaku sama
 * untuk item `needsProduction` true maupun false, keputusan Owner). */
function CompletedCard({
  item,
  eventId,
  canAct,
  onChanged,
}: {
  item: EventChecklistItem;
  eventId: string;
  canAct: boolean;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!canAct) {
    return (
      <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
        Menunggu konfirmasi PIC Lapangan ({item.picLapanganName ?? "belum ditugaskan"}).
      </p>
    );
  }

  function confirm() {
    startTransition(async () => {
      const result = await confirmChecklistCompleted(item.id, eventId);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast("Completed dikonfirmasi.");
      onChanged();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setConfirmOpen(true)} disabled={pending} className={cn(BTN_PRIMARY, "mt-2")}>
        Konfirmasi Completed
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          confirm();
          setConfirmOpen(false);
        }}
        title="Konfirmasi Completed?"
        description={`Item "${item.itemName}" akan lanjut ke fase Loading In.`}
        confirmLabel="Konfirmasi"
        confirmVariant="primary"
      />
    </>
  );
}

const BULK_STAGES: { target: "loading_in" | "loading_out" | "finish"; predecessor: ChecklistPhase; label: string }[] = [
  { target: "loading_in", predecessor: "completed", label: "Loading In (mulai dibawa ke lokasi event)" },
  { target: "loading_out", predecessor: "loading_in", label: "Loading Out (pulang dari lokasi event)" },
  { target: "finish", predecessor: "loading_out", label: "Finish" },
];

/** Ditandai sekaligus (keputusan Owner: "ditandai sekaligus") tapi SEMUA
 * item event ditampilkan (bukan cuma yang siap) supaya tidak ada yang
 * terlewat -- checkbox cuma aktif untuk item yang fasenya sudah pas DAN
 * PIC-nya pengguna ini (atau akses penuh), sisanya tetap terlihat dengan
 * keterangan kenapa belum bisa ditandai. */
function BulkLoadingSection({
  items,
  eventId,
  currentUserId,
  isFullAccess,
  onChanged,
}: {
  items: EventChecklistItem[];
  eventId: string;
  currentUserId: string | null;
  isFullAccess: boolean;
  onChanged: () => void;
}) {
  return (
    <section className={cn("rounded-2xl border p-5", GLASS_SURFACE, GLASS_BORDER)}>
      <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Loading &amp; Finish</h2>
      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
        Tandai sekaligus per tahap -- semua item ditampilkan supaya tidak ada yang terlewat.
      </p>
      <div className="mt-4 space-y-6">
        {BULK_STAGES.map((stage) => (
          <BulkStageGroup
            key={stage.target}
            stage={stage}
            items={items}
            eventId={eventId}
            currentUserId={currentUserId}
            isFullAccess={isFullAccess}
            onChanged={onChanged}
          />
        ))}
      </div>
    </section>
  );
}

function BulkStageGroup({
  stage,
  items,
  eventId,
  currentUserId,
  isFullAccess,
  onChanged,
}: {
  stage: { target: "loading_in" | "loading_out" | "finish"; predecessor: ChecklistPhase; label: string };
  items: EventChecklistItem[];
  eventId: string;
  currentUserId: string | null;
  isFullAccess: boolean;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const predecessorIdx = CHECKLIST_PHASES.indexOf(stage.predecessor);

  // Loading In/Out/Finish semuanya fase "PIC Lapangan" (Tahap 52).
  const eligibleIds = useMemo(
    () =>
      items
        .filter((i) => i.currentPhase === stage.predecessor && canActOnItem(i.picLapangan, currentUserId, isFullAccess))
        .map((i) => i.id),
    [items, stage.predecessor, currentUserId, isFullAccess]
  );
  const eligibleKey = eligibleIds.join(",");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligibleIds));
  const [lastKey, setLastKey] = useState(eligibleKey);
  // Owner: checkbox di bawah sudah tercentang OTOMATIS buat semua item yang
  // siap -- satu tap tombol besar di bawah bisa memindahkan banyak item
  // sekaligus tanpa sengaja. ConfirmDialog ini WAJIB tampil dulu dan
  // menyebutkan NAMA-NAMA item yang persis akan berubah (bukan cuma
  // jumlahnya), supaya "kepencet" kelihatan sebelum benar-benar terjadi.
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (eligibleKey !== lastKey) {
    setLastKey(eligibleKey);
    setSelected(new Set(eligibleIds));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmBulk() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await bulkAdvanceChecklistPhase(eventId, ids, stage.target);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(
        `${result.advanced} item ditandai ${CHECKLIST_PHASE_LABELS[stage.target]}` +
          (result.skipped > 0 ? `, ${result.skipped} dilewati.` : ".")
      );
      onChanged();
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{stage.label}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{eligibleIds.length} siap ditandai</span>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-zinc-100 p-2 dark:border-white/10">
        {items.map((item) => {
          const itemIdx = CHECKLIST_PHASES.indexOf(item.currentPhase);
          const isEligible = item.currentPhase === stage.predecessor;
          const canAct = canActOnItem(item.picLapangan, currentUserId, isFullAccess);
          const alreadyPast = itemIdx > predecessorIdx;
          return (
            <label
              key={item.id}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1 text-xs",
                !(isEligible && canAct) && "opacity-60"
              )}
            >
              <input
                type="checkbox"
                disabled={!isEligible || !canAct || pending}
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
              />
              <span className="flex-1 truncate text-zinc-600 dark:text-zinc-300">{item.itemName}</span>
              {alreadyPast ? (
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">sudah</span>
              ) : !isEligible ? (
                <span className="text-[10px] text-zinc-400">belum sampai</span>
              ) : !canAct ? (
                <span className="text-[10px] text-zinc-400">PIC Lapangan: {item.picLapanganName ?? "-"}</span>
              ) : null}
            </label>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={pending || selected.size === 0}
        className={cn(BTN_PRIMARY, "mt-2")}
      >
        Tandai {selected.size} item {CHECKLIST_PHASE_LABELS[stage.target]}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          confirmBulk();
          setConfirmOpen(false);
        }}
        title={`Tandai ${selected.size} Item ${CHECKLIST_PHASE_LABELS[stage.target]}?`}
        description={
          <div className="space-y-1.5">
            <p>Item berikut akan berpindah fase ke {CHECKLIST_PHASE_LABELS[stage.target]}:</p>
            <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4">
              {items
                .filter((i) => selected.has(i.id))
                .map((i) => (
                  <li key={i.id}>{i.itemName}</li>
                ))}
            </ul>
          </div>
        }
        confirmLabel="Tandai"
        confirmVariant="primary"
      />
    </div>
  );
}

/**
 * "Papan Tracking" (Tahap D, redesain besar Tahap 51) -- halaman TERBUKA
 * untuk 3 divisi operasional + akses penuh, alur 8 fase Design->Mockup->
 * Sample->Production->Completed->Loading In->Loading Out->Finish (lihat
 * types.ts `ChecklistPhase`). PIC item self-approve tiap fase (keputusan
 * Owner: "PIC yang bertanggung jawab"), akses penuh selalu boleh override.
 * SENGAJA tidak ada fitur tambah/hapus item atau kelola kaitan di sini --
 * itu tetap milik halaman detail Admin (`/dashboard/admin/events/[id]`,
 * Tahap C). State di-refresh lewat `router.refresh()` (bukan optimistic
 * update manual) karena struktur phase reviews sudah cukup bercabang.
 */
export function EventTrackingBoard({
  event,
  initialChecklistItems,
  links,
  picOptions,
  currentUserId,
  isFullAccess,
}: {
  event: EventSummary;
  initialChecklistItems: EventChecklistItem[];
  links: EventLink[];
  picOptions: PicOption[];
  currentUserId: string | null;
  isFullAccess: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const items = initialChecklistItems;
  const [savingId, setSavingId] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<EventChecklistItem | null>(null);
  const [discussionTarget, setDiscussionTarget] = useState<EventChecklistItem | null>(null);
  // Tahap F: staf (bukan cuma Admin) sekarang bisa menambah item sendiri
  // selagi event masih "Berjalan", dan hanya boleh edit/hapus item yang
  // dia buat sendiri -- lihat guard di actions.ts (`getCurrentUserAccess`).
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EventChecklistItem | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<EventChecklistItem | null>(null);
  // Owner: sebelumnya TIDAK ADA cara mengembalikan item yang "kepencet"
  // salah pindah fase selain edit database manual -- tombol ini (khusus
  // Admin/Owner, lihat `revertChecklistPhase`) mengisi celah itu.
  const [revertTarget, setRevertTarget] = useState<EventChecklistItem | null>(null);
  const [reverting, setReverting] = useState(false);
  // Owner: checklist per kategori dibuat "laci" (dropdown/accordion) --
  // dengan puluhan item per event, tampilan flat lama jadi berantakan.
  // Default semua tertutup, staf buka kategori yang relevan saja.
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());

  function handleChanged() {
    router.refresh();
  }

  // Staf boleh nambah item selagi event "Berjalan"; akses penuh selalu
  // boleh (mengikuti guard `getCurrentUserAccess` di actions.ts).
  const canAddItem = isFullAccess || event.status === "Berjalan";

  // Edit/hapus cuma untuk pembuat item sendiri + event masih Berjalan,
  // akses penuh selalu boleh override -- pola yang sama dengan
  // `canActOnItem` di atas.
  function canEditItem(item: EventChecklistItem): boolean {
    if (isFullAccess) return true;
    return item.createdBy === currentUserId && event.status === "Berjalan";
  }

  function openAddItem() {
    setEditingItem(null);
    setItemFormOpen(true);
  }

  function openEditItem(item: EventChecklistItem) {
    setEditingItem(item);
    setItemFormOpen(true);
  }

  async function confirmDeleteItem() {
    if (!deleteItemTarget) return;
    const result = await deleteEventChecklistItem(deleteItemTarget.id, deleteItemTarget.eventId);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteItemTarget(null);
      return;
    }
    showToast("Item checklist dihapus.");
    setDeleteItemTarget(null);
    router.refresh();
  }

  // Fase paling awal (Design untuk item yang perlu produksi, Completed
  // untuk yang tidak) tidak punya fase sebelumnya -- sembunyikan tombolnya
  // di kasus itu (server tetap validasi ulang, ini cuma penyaring di UI).
  function canRevertPhase(item: EventChecklistItem): boolean {
    if (!isFullAccess) return false;
    if (item.currentPhase === "design") return false;
    if (item.currentPhase === "completed" && !item.needsProduction) return false;
    return true;
  }

  async function confirmRevertPhase() {
    if (!revertTarget) return;
    setReverting(true);
    const result = await revertChecklistPhase(revertTarget.id, revertTarget.eventId);
    setReverting(false);
    setRevertTarget(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("Fase item dikembalikan.");
    router.refresh();
  }

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const groupedItems = useMemo(() => {
    const map = new Map<string, EventChecklistItem[]>();
    for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const bucket = map.get(item.category) ?? [];
      bucket.push(item);
      map.set(item.category, bucket);
    }
    return Array.from(map.entries()).map(([category, list]) => ({
      category,
      list,
      done: list.filter((i) => i.currentPhase === "finish").length,
    }));
  }, [items]);

  // Opsi kategori (buat datalist di modal tambah/edit) + urutan berikut
  // buat item baru -- dilempar ke bawah antrean supaya tidak menyerobot
  // urutan item Admin yang sudah ada.
  const categoryOptions = useMemo(() => Array.from(new Set(items.map((i) => i.category))).sort(), [items]);
  const nextSortOrder = useMemo(
    () => (items.length === 0 ? 10 : Math.max(...items.map((i) => i.sortOrder)) + 10),
    [items]
  );

  // Pencarian (Owner: "tambahkan fungsi search agar mudah mencari suatu
  // barang") -- saat aktif, kategori yang punya hasil otomatis terbuka
  // (override state manual expandedCategories) dan cuma item yang cocok
  // yang dirender; kategori tanpa hasil disembunyikan seluruhnya.
  const searchQuery = search.trim().toLowerCase();
  const isSearching = searchQuery.length > 0;
  const visibleGroups = useMemo(() => {
    const withFiltered = groupedItems.map((g) => ({
      ...g,
      filteredList: isSearching
        ? g.list.filter((item) => {
            const haystack = `${item.itemName} ${item.detail ?? ""} ${item.qtyInfo ?? ""} ${item.notes ?? ""}`.toLowerCase();
            return haystack.includes(searchQuery);
          })
        : g.list,
    }));
    return isSearching ? withFiltered.filter((g) => g.filteredList.length > 0) : withFiltered;
  }, [groupedItems, isSearching, searchQuery]);

  const progressPct = useMemo(() => {
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, item) => acc + computeChecklistItemProgress(item, item.phaseReviews ?? []), 0);
    return Math.round(sum / items.length);
  }, [items]);

  const finishedCount = items.filter((i) => i.currentPhase === "finish").length;

  async function handlePicChange(item: EventChecklistItem, picId: string | null) {
    setSavingId(item.id);
    const result = await updateEventChecklistProgress(item.id, item.eventId, { status: item.status, picId });
    setSavingId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("PIC Produksi disimpan.");
    router.refresh();
  }

  /** Pasangan `handlePicChange` di atas -- Tahap 52, "PIC Lapangan"
   * (Completed s/d Finish) dipisah dari "PIC Produksi" (Design/Mockup/
   * Sample/Production). */
  async function handlePicLapanganChange(item: EventChecklistItem, picId: string | null) {
    setSavingId(item.id);
    const result = await updateChecklistPicLapangan(item.id, item.eventId, picId);
    setSavingId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("PIC Lapangan disimpan.");
    router.refresh();
  }

  async function handleNeedsProductionToggle(item: EventChecklistItem, needsProduction: boolean) {
    setSavingId(item.id);
    const result = await setChecklistNeedsProduction(item.id, item.eventId, needsProduction);
    setSavingId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("Perlu Produksi diperbarui.");
    router.refresh();
  }

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
          </div>
          <span className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", STATUS_BADGE[event.status])}>
            {event.status}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-4 border-t border-zinc-100 pt-4 dark:border-white/10">
          <ChecklistProgressRing percent={progressPct} size={56} strokeWidth={6} />
          <div>
            <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">Progress checklist</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {finishedCount}/{items.length} item selesai
            </p>
          </div>
        </div>
      </section>

      {links.length > 0 && (
        <section className={cn("rounded-2xl border p-5", GLASS_SURFACE, GLASS_BORDER)}>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Kaitan ke Data Divisi</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {links.map((link) => (
              <span
                key={link.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs dark:border-zinc-700 dark:bg-white/5"
              >
                <Link2 className="h-3 w-3 text-zinc-400" />
                <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                  {EVENT_SOURCE_LABELS[link.sourceType]}:
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">{link.sourceLabel}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className={cn("rounded-2xl border p-5", GLASS_SURFACE, GLASS_BORDER)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Checklist</h2>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
              Isi tiap fase sesuai progres pekerjaan divisimu -- foto konfirmasi wajib sebelum fase berikutnya terbuka.
              <br />
              <span className="font-medium">Design–Production</span> diisi <span className="font-medium">PIC
              Produksi</span>, <span className="font-medium">Completed–Finish</span> diisi{" "}
              <span className="font-medium">PIC Lapangan</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {groupedItems.length > 0 && (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari item..."
                    className={cn(INPUT_XS, "w-40 pl-8 sm:w-52")}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedCategories(new Set(groupedItems.map((g) => g.category)))}
                  className={BTN}
                >
                  Buka Semua
                </button>
                <button type="button" onClick={() => setExpandedCategories(new Set())} className={BTN}>
                  Tutup Semua
                </button>
              </>
            )}
            {canAddItem && (
              <button type="button" onClick={openAddItem} className={BTN_PRIMARY}>
                <Plus className="h-3.5 w-3.5" />
                Tambah Item
              </button>
            )}
          </div>
        </div>

        {groupedItems.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Checklist masih kosong"
            description={
              canAddItem
                ? 'Belum ada item checklist untuk event ini -- klik "Tambah Item" untuk mulai menambahkan.'
                : "Admin belum mengisi checklist untuk event ini."
            }
          />
        ) : visibleGroups.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Tidak ditemukan"
            description={`Tidak ada item yang cocok dengan "${search}".`}
          />
        ) : (
          <div className="mt-4 space-y-3">
            {visibleGroups.map(({ category, list, filteredList, done }) => {
              const isOpen = isSearching || expandedCategories.has(category);
              const renderList = isSearching ? filteredList : list;
              return (
                <div key={category} className="rounded-xl border border-zinc-100 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    disabled={isSearching}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left disabled:cursor-default"
                  >
                    <span className="flex items-center gap-2">
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform",
                          !isOpen && "-rotate-90"
                        )}
                      />
                      <span className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        {category}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        done === list.length
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
                      )}
                    >
                      {done}/{list.length}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 px-3 pb-3">
                      {renderList.map((item) => {
                    // Tahap 52: PIC dipisah 2 -- "PIC Produksi" (`pic`)
                    // tanggung jawab Design/Mockup/Sample/Production,
                    // "PIC Lapangan" (`picLapangan`) tanggung jawab
                    // Completed s/d Finish. Masing-masing dicek terpisah,
                    // bukan lagi satu `canAct` dipakai untuk semua kartu.
                    const canActProduksi = canActOnItem(item.pic, currentUserId, isFullAccess);
                    const canActLapangan = canActOnItem(item.picLapangan, currentUserId, isFullAccess);
                    const activeReview = CHECKLIST_REVIEW_PHASES.includes(item.currentPhase as ChecklistReviewPhase)
                      ? item.phaseReviews?.find((r) => r.phase === item.currentPhase)
                      : undefined;
                    return (
                      <div key={item.id} className={cn("rounded-2xl border p-3.5", GLASS_SURFACE, GLASS_BORDER)}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-zinc-700 dark:text-zinc-200">{item.itemName}</p>
                            {(item.detail || item.qtyInfo) && (
                              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                {[item.detail, item.qtyInfo].filter(Boolean).join(" · ")}
                              </p>
                            )}
                            {item.notes && (
                              <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{item.notes}</p>
                            )}
                            <div className="mt-2">
                              <PhaseStepper item={item} />
                            </div>

                            {CHECKLIST_REVIEW_PHASES.includes(item.currentPhase as ChecklistReviewPhase) && (
                              <ReviewPhaseCard
                                item={item}
                                phase={item.currentPhase as ChecklistReviewPhase}
                                review={activeReview}
                                canAct={canActProduksi}
                                isFullAccess={isFullAccess}
                                eventId={item.eventId}
                                onChanged={handleChanged}
                              />
                            )}
                            {item.currentPhase === "production" && (
                              <ProductionCard item={item} eventId={item.eventId} canAct={canActProduksi} onChanged={handleChanged} />
                            )}
                            {item.currentPhase === "completed" && (
                              <CompletedCard item={item} eventId={item.eventId} canAct={canActLapangan} onChanged={handleChanged} />
                            )}
                            {(item.currentPhase === "loading_in" || item.currentPhase === "loading_out") && (
                              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                                Lanjut di bagian &quot;Loading &amp; Finish&quot; di bawah.
                              </p>
                            )}
                            {item.currentPhase === "finish" && (
                              <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Selesai.</p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {isFullAccess && (
                              <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                Produksi:
                                <select
                                  value={item.needsProduction ? "ya" : "tidak"}
                                  disabled={savingId === item.id}
                                  onChange={(e) => handleNeedsProductionToggle(item, e.target.value === "ya")}
                                  className={cn(INPUT_XS, "text-[11px]")}
                                >
                                  <option value="ya">Ya</option>
                                  <option value="tidak">Tidak</option>
                                </select>
                              </label>
                            )}
                            <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                              PIC Produksi:
                              <select
                                value={item.pic ?? ""}
                                disabled={savingId === item.id}
                                onChange={(e) => handlePicChange(item, e.target.value || null)}
                                className={cn(INPUT_XS, "max-w-[9.5rem]")}
                              >
                                <option value="">Belum ditugaskan</option>
                                {picOptions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.fullName} ({DIVISION_LABEL[p.division] ?? p.division})
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                              PIC Lapangan:
                              <select
                                value={item.picLapangan ?? ""}
                                disabled={savingId === item.id}
                                onChange={(e) => handlePicLapanganChange(item, e.target.value || null)}
                                className={cn(INPUT_XS, "max-w-[9.5rem]")}
                              >
                                <option value="">Belum ditugaskan</option>
                                {picOptions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.fullName} ({DIVISION_LABEL[p.division] ?? p.division})
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => setHistoryTarget(item)}
                              title="Lihat riwayat status & PIC"
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-500 transition-colors hover:border-violet-300 hover:text-violet-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-violet-700 dark:hover:text-violet-300"
                            >
                              <History className="h-3 w-3" />
                              <span className="hidden sm:inline">Riwayat</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDiscussionTarget(item)}
                              title="Diskusi item ini"
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-500 transition-colors hover:border-violet-300 hover:text-violet-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-violet-700 dark:hover:text-violet-300"
                            >
                              <MessageSquare className="h-3 w-3" />
                              <span className="hidden sm:inline">Diskusi</span>
                            </button>
                            {canRevertPhase(item) && (
                              <button
                                type="button"
                                onClick={() => setRevertTarget(item)}
                                title="Kembalikan ke fase sebelumnya"
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-600 transition-colors hover:border-amber-300 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10"
                              >
                                <Undo2 className="h-3 w-3" />
                                <span className="hidden sm:inline">Kembalikan Fase</span>
                              </button>
                            )}
                            {canEditItem(item) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditItem(item)}
                                  title="Edit item ini"
                                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-500 transition-colors hover:border-violet-300 hover:text-violet-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-violet-700 dark:hover:text-violet-300"
                                >
                                  <Pencil className="h-3 w-3" />
                                  <span className="hidden sm:inline">Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteItemTarget(item)}
                                  title="Hapus item ini"
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span className="hidden sm:inline">Hapus</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {items.length > 0 && (
        <BulkLoadingSection
          items={items}
          eventId={event.id}
          currentUserId={currentUserId}
          isFullAccess={isFullAccess}
          onChanged={handleChanged}
        />
      )}

      {historyTarget && (
        <ChecklistHistoryModal
          checklistItemId={historyTarget.id}
          itemName={historyTarget.itemName}
          onClose={() => setHistoryTarget(null)}
        />
      )}

      {discussionTarget && (
        <ChecklistDiscussionModal
          checklistItemId={discussionTarget.id}
          itemName={discussionTarget.itemName}
          onClose={() => setDiscussionTarget(null)}
        />
      )}

      <AddOrEditItemModal
        open={itemFormOpen}
        onClose={() => setItemFormOpen(false)}
        eventId={event.id}
        editingItem={editingItem}
        categoryOptions={categoryOptions}
        nextSortOrder={nextSortOrder}
        onSaved={handleChanged}
      />

      <ConfirmDialog
        open={!!deleteItemTarget}
        onClose={() => setDeleteItemTarget(null)}
        onConfirm={confirmDeleteItem}
        title="Hapus Item Checklist"
        description={`Hapus item "${deleteItemTarget?.itemName}" dari checklist event ini?`}
        confirmLabel="Hapus"
      />

      <ConfirmDialog
        open={!!revertTarget}
        onClose={() => setRevertTarget(null)}
        onConfirm={confirmRevertPhase}
        title="Kembalikan ke Fase Sebelumnya?"
        description={
          revertTarget
            ? `Item "${revertTarget.itemName}" (sekarang di fase ${CHECKLIST_PHASE_LABELS[revertTarget.currentPhase]}) akan dikembalikan ke fase sebelumnya. Kalau fasenya Mockup/Sample/Production, persetujuan fase sebelumnya juga dibuka lagi supaya bisa disetujui ulang.`
            : undefined
        }
        confirmLabel={reverting ? "Memproses…" : "Kembalikan"}
        confirmVariant="primary"
      />
    </div>
  );
}
