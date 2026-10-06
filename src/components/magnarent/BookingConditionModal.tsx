"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { formatRupiah } from "@/lib/magnarent/pricing";
import { cn } from "@/lib/cn";
import {
  getBookingChecks,
  getBookingDeposit,
  removeBookingCheckPhoto,
  saveBookingCheck,
  saveBookingDeposit,
  setDepositReturned,
} from "@/lib/magnarent/extras-actions";
import {
  DEPOSIT_JENIS,
  type BookingCheck,
  type BookingDeposit,
  type CheckStage,
  type DepositJenis,
} from "@/lib/magnarent/extras-types";
import { prepareUploadFiles } from "@/lib/shared/image";
import { useSyncedState } from "@/lib/shared/use-synced-state";

const STAGE_LABEL: Record<CheckStage, string> = { keluar: "Saat Keluar", kembali: "Saat Kembali" };

function CheckStagePanel({
  bookingId,
  stage,
  check,
  onSaved,
}: {
  bookingId: string;
  stage: CheckStage;
  check: BookingCheck | undefined;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [catatan, setCatatan] = useSyncedState(check?.catatan ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    const prepared = await prepareUploadFiles(Array.from(fileInputRef.current?.files ?? []));
    if (!prepared.ok) {
      setSubmitting(false);
      showToast(prepared.error, "error");
      return;
    }
    const formData = new FormData();
    for (const file of prepared.files) formData.append("photos", file);
    const result = await saveBookingCheck(bookingId, stage, catatan, formData);
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
    const result = await removeBookingCheckPhoto(bookingId, stage, url);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    onSaved();
  }

  return (
    <div className="space-y-3 rounded-xl border border-black/5 p-3.5 dark:border-white/10">
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
              <img src={url} alt="Foto kondisi alat" className="h-full w-full object-cover" />
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
        placeholder={`Catatan kondisi alat ${STAGE_LABEL[stage].toLowerCase()}…`}
        className="w-full resize-none rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
      />

      <div className="flex items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" id={`check-file-${stage}`} />
        <label
          htmlFor={`check-file-${stage}`}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          <Upload className="h-3.5 w-3.5" />
          Tambah Foto
        </label>
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Simpan
        </button>
      </div>
    </div>
  );
}

/**
 * Detail booking (Tahap 28a) — gabungan checklist kondisi alat (keluar &
 * kembali) DAN jaminan/deposit, dibuka lewat satu tombol baru di
 * BookingScheduler.tsx supaya tidak perlu dua tombol terpisah lagi di
 * baris tabel yang sudah cukup padat. Datanya di-fetch on-demand tiap
 * modal dibuka, sama seperti MaintenanceLogModal.
 */
export function BookingConditionModal({
  bookingId,
  clientName,
  open,
  onClose,
}: {
  bookingId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [checks, setChecks] = useState<BookingCheck[] | null>(null);
  const [deposit, setDeposit] = useState<BookingDeposit | null | undefined>(undefined);
  const [depositForm, setDepositForm] = useState({ jenis: "Uang Tunai" as DepositJenis, jumlah: "0", keterangan: "" });
  const [savingDeposit, setSavingDeposit] = useState(false);

  function reloadChecks() {
    getBookingChecks(bookingId).then(setChecks);
  }

  useEffect(() => {
    if (!open) return;
    reloadChecks();
    getBookingDeposit(bookingId).then((d) => {
      setDeposit(d);
      if (d) setDepositForm({ jenis: d.jenis, jumlah: String(d.jumlah), keterangan: d.keterangan ?? "" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookingId]);

  async function handleSaveDeposit() {
    const jumlah = Number(depositForm.jumlah) || 0;
    setSavingDeposit(true);
    const result = await saveBookingDeposit(bookingId, {
      jenis: depositForm.jenis,
      jumlah,
      keterangan: depositForm.keterangan,
    });
    setSavingDeposit(false);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("Data jaminan berhasil disimpan.");
    getBookingDeposit(bookingId).then(setDeposit);
  }

  async function handleToggleReturned() {
    const next = !(deposit?.dikembalikan ?? false);
    const result = await setDepositReturned(bookingId, next);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setDeposit((prev) => (prev ? { ...prev, dikembalikan: next } : prev));
    showToast(next ? "Jaminan ditandai sudah dikembalikan." : "Jaminan ditandai belum dikembalikan.");
  }

  const checkByStage = (stage: CheckStage) => checks?.find((c) => c.stage === stage);

  return (
    <Modal open={open} onClose={onClose} title={`Detail Booking — ${clientName}`} maxWidth="max-w-xl">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Checklist Kondisi Alat
        </p>
        {checks === null ? (
          <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">Memuat…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckStagePanel bookingId={bookingId} stage="keluar" check={checkByStage("keluar")} onSaved={reloadChecks} />
            <CheckStagePanel bookingId={bookingId} stage="kembali" check={checkByStage("kembali")} onSaved={reloadChecks} />
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/10">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          Jaminan / Deposit
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="deposit-jenis" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Jenis
            </label>
            <select
              id="deposit-jenis"
              value={depositForm.jenis}
              onChange={(e) => setDepositForm((f) => ({ ...f, jenis: e.target.value as DepositJenis }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              {DEPOSIT_JENIS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
          {depositForm.jenis === "Uang Tunai" && (
            <div>
              <label htmlFor="deposit-jumlah" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Jumlah (Rp)
              </label>
              <input
                id="deposit-jumlah"
                type="number"
                min={0}
                value={depositForm.jumlah}
                onChange={(e) => setDepositForm((f) => ({ ...f, jumlah: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          )}
        </div>

        <div className="mt-3">
          <label htmlFor="deposit-keterangan" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Keterangan (opsional)
          </label>
          <input
            id="deposit-keterangan"
            value={depositForm.keterangan}
            onChange={(e) => setDepositForm((f) => ({ ...f, keterangan: e.target.value }))}
            placeholder="mis. KTP a.n. Budi, no. 3201xxxxx"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          {deposit && (
            <button
              type="button"
              onClick={handleToggleReturned}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                deposit.dikembalikan
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
              )}
            >
              {deposit.dikembalikan ? "Sudah Dikembalikan ✓" : "Tandai Sudah Dikembalikan"}
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveDeposit}
            disabled={savingDeposit}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {savingDeposit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Simpan Jaminan
          </button>
        </div>
        {deposit && deposit.jenis === "Uang Tunai" && deposit.jumlah > 0 && (
          <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            Tersimpan saat ini: {formatRupiah(deposit.jumlah)}
          </p>
        )}
      </div>
    </Modal>
  );
}
