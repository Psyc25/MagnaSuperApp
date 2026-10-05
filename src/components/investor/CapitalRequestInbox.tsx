"use client";

import { useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  File as FileIcon,
  HandCoins,
  MapPin,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrendBarChart } from "@/components/ui/TrendBarChart";
import { prepareUploadFiles } from "@/lib/shared/image";
import { formatDateID, formatRupiah } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import type { CapitalRequest, CapitalRequestStatus } from "@/lib/capital-requests/types";
import { decideCapitalRequest, removeCapitalRequestProof, uploadCapitalRequestProof } from "@/lib/capital-requests/actions";
import { CAPITAL_REQUEST_STATUS_STYLES as STATUS_STYLES } from "@/lib/status-styles";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

/** Warna avatar ikon per kartu — status "Menunggu" pakai warna netral/amber
 * supaya kontras dengan kartu yang sudah diputuskan (hijau/merah), konsisten
 * dengan pola avatar-berwarna di `InvestorSectionHeader`/`ClientDirectoryTable`. */
const ICON_BG: Record<CapitalRequestStatus, string> = {
  Menunggu: "#F59E0B",
  Disetujui: "#10B981",
  Ditolak: "#EF4444",
};

const TREND_MONTHS_BACK = 6;

/** Tren "Modal Disetujui" 6 bulan terakhir, dihitung dari `decidedAt` request
 * berstatus "Disetujui" — dipakai investor untuk lihat pola pendanaan bulanan
 * tanpa harus buka satu-satu dari daftar "Riwayat Keputusan" (Tahap 28d).
 * Dihitung di klien (data sudah ada di prop `requests`) supaya tidak perlu
 * query server tambahan, pola sama dengan `revenueTrend` di
 * src/app/dashboard/admin/keuangan/page.tsx tapi versi client-side. */
function useApprovedModalTrend(requests: CapitalRequest[]) {
  return useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: TREND_MONTHS_BACK }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (TREND_MONTHS_BACK - 1 - i), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
      };
    });
    return buckets.map(({ key, label }) => ({
      label,
      value: requests
        .filter((r) => r.status === "Disetujui" && r.decidedAt && r.decidedAt.slice(0, 7) === key)
        .reduce((sum, r) => sum + r.modalEstimate, 0),
    }));
  }, [requests]);
}

/**
 * Kotak masuk investor untuk "Pengajuan Modal" (rancangan Owner: "Notifikasi
 * = notif masuk untuk event dalam pengajuan modal, Approve/Reject dan
 * berikan note untuk keterangan"). Keputusan lewat `decideCapitalRequest`,
 * yang di baliknya memanggil fungsi database `decide_capital_request`
 * (migrasi 0019) — mengunci baris supaya tidak bisa diputuskan dua kali.
 *
 * Dipisah jadi dua seksi ("Menunggu Keputusan"/"Riwayat Keputusan") dan
 * dibatasi lebarnya (max-w-3xl) supaya tidak terasa kosong/berantakan kalau
 * cuma ada sedikit pengajuan — sebelumnya satu daftar rata kiri selebar
 * layar dengan ruang kosong besar di bawah kartu terakhir. Angka yang
 * ditampilkan cuma "Modal Dibutuhkan" & "Estimasi Pendapatan" — sengaja TIDAK
 * ada "Margin"/persentase: itu cuma rumus turunan (Billing − Modal) / Billing,
 * bukan angka yang perlu dilihat investor untuk memutuskan.
 *
 * Tahap 28d menambah 3 hal ke halaman ini: (1) upload bukti pembayaran saat
 * Approve (atau menyusul dari kartu riwayat, lihat `RequestCard`), (2) grafik
 * tren modal disetujui 6 bulan di atas daftar, (3) tombol unduh laporan PDF
 * self-service (lewat /api/investor/capital-requests/pdf, tidak perlu minta
 * Admin). Item ke-4 (ringkasan otomatis berkala via push) murni cron
 * server-side, tidak ada UI-nya — lihat src/app/api/cron/investor-capital-summary/.
 */
export function CapitalRequestInbox({ requests }: { requests: CapitalRequest[] }) {
  const { showToast } = useToast();
  const trend = useApprovedModalTrend(requests);

  const [decisionTarget, setDecisionTarget] = useState<{ request: CapitalRequest; status: CapitalRequestStatus } | null>(
    null
  );
  const [note, setNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const pending = useMemo(
    () => requests.filter((r) => r.status === "Menunggu").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [requests]
  );
  const decided = useMemo(
    () =>
      requests
        .filter((r) => r.status !== "Menunggu")
        .sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt)),
    [requests]
  );

  function openDecision(request: CapitalRequest, status: CapitalRequestStatus) {
    setDecisionTarget({ request, status });
    setNote("");
    setProofFile(null);
  }

  function closeDecision() {
    setDecisionTarget(null);
    setNote("");
    setProofFile(null);
  }

  async function confirmDecision() {
    if (!decisionTarget) return;
    setSubmitting(true);
    let proofFormData: FormData | undefined;
    if (decisionTarget.status === "Disetujui" && proofFile) {
      const prepared = await prepareUploadFiles([proofFile]);
      if (!prepared.ok) {
        setSubmitting(false);
        showToast(prepared.error, "error");
        return;
      }
      proofFormData = new FormData();
      proofFormData.set("proof", prepared.files[0]);
    }
    const result = await decideCapitalRequest(decisionTarget.request.id, decisionTarget.status, note, proofFormData);
    setSubmitting(false);

    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(
      decisionTarget.status === "Disetujui"
        ? `"${decisionTarget.request.eventName}" disetujui — staf sudah dapat pengumuman.`
        : `"${decisionTarget.request.eventName}" ditolak.`
    );
    closeDecision();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Kotak Masuk Pengajuan Modal</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {pending.length > 0 ? `${pending.length} menunggu keputusan Anda` : "Tidak ada yang menunggu keputusan"} —{" "}
            {requests.length} total tercatat.
          </p>
        </div>
        <a
          href="/api/investor/capital-requests/pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3.5 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <Download className="h-3.5 w-3.5" />
          Unduh Laporan PDF
        </a>
      </div>

      {requests.length > 0 && (
        <div className={cn("mb-6 overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
          <div className="border-b border-black/5 px-5 py-3.5 dark:border-white/10">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Tren Modal Disetujui 6 Bulan</h3>
          </div>
          <div className="px-5 py-5">
            <TrendBarChart
              data={trend}
              formatValue={formatRupiah}
              emptyMessage='Belum ada pengajuan berstatus "Disetujui" di rentang bulan ini.'
            />
          </div>
        </div>
      )}

      {requests.length === 0 ? (
        <div className={cn("rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
          <EmptyState
            icon={HandCoins}
            title="Belum ada pengajuan modal"
            description="Begitu Owner mengajukan modal untuk event baru, akan muncul di sini."
          />
        </div>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Menunggu Keputusan
              </p>
              <div className="space-y-3">
                {pending.map((req) => (
                  <RequestCard key={req.id} request={req} onDecide={openDecision} />
                ))}
              </div>
            </section>
          )}

          {decided.length > 0 && (
            <section>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Riwayat Keputusan
              </p>
              <div className="space-y-3">
                {decided.map((req) => (
                  <RequestCard key={req.id} request={req} onDecide={openDecision} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Modal
        open={decisionTarget !== null}
        onClose={closeDecision}
        title={decisionTarget?.status === "Disetujui" ? "Approve Pengajuan Modal" : "Reject Pengajuan Modal"}
      >
        <div className="space-y-4">
          {decisionTarget && (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {decisionTarget.status === "Disetujui" ? (
                <>
                  <strong>{decisionTarget.request.eventName}</strong> akan disetujui — staf Magnarent/Magnativ/
                  Production otomatis dapat pengumuman untuk bersiap.
                </>
              ) : (
                <>
                  <strong>{decisionTarget.request.eventName}</strong> akan ditolak. Event tidak dilanjutkan.
                </>
              )}
            </p>
          )}
          <div>
            <label htmlFor="capital-request-decision-note" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Catatan (opsional)
            </label>
            <textarea
              id="capital-request-decision-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="mis. alasan keputusan, syarat tambahan, dsb."
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-emerald-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          {decisionTarget?.status === "Disetujui" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Bukti Pembayaran (opsional — boleh diunggah menyusul)
              </label>
              <input
                ref={proofInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => proofInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3.5 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {proofFile ? "Ganti File" : "Pilih File"}
                </button>
                {proofFile && (
                  <span className="inline-flex min-w-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <FileIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{proofFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setProofFile(null);
                        if (proofInputRef.current) proofInputRef.current.value = "";
                      }}
                      className="shrink-0 text-zinc-400 hover:text-rose-500"
                      aria-label="Batalkan file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeDecision}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={confirmDecision}
              disabled={submitting}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60",
                decisionTarget?.status === "Disetujui" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"
              )}
            >
              {submitting ? "Menyimpan…" : decisionTarget?.status === "Disetujui" ? "Ya, Approve" : "Ya, Reject"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function RequestCard({
  request: req,
  onDecide,
}: {
  request: CapitalRequest;
  onDecide: (request: CapitalRequest, status: CapitalRequestStatus) => void;
}) {
  const { showToast } = useToast();
  const [proofBusy, setProofBusy] = useState(false);
  const inlineProofInputRef = useRef<HTMLInputElement>(null);

  async function handleInlineProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofBusy(true);
    const prepared = await prepareUploadFiles([file]);
    if (!prepared.ok) {
      setProofBusy(false);
      if (inlineProofInputRef.current) inlineProofInputRef.current.value = "";
      showToast(prepared.error, "error");
      return;
    }
    const formData = new FormData();
    formData.set("proof", prepared.files[0]);
    const result = await uploadCapitalRequestProof(req.id, formData);
    setProofBusy(false);
    if (inlineProofInputRef.current) inlineProofInputRef.current.value = "";
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("Bukti pembayaran tersimpan.");
  }

  async function handleRemoveProof() {
    setProofBusy(true);
    const result = await removeCapitalRequestProof(req.id);
    setProofBusy(false);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("Bukti pembayaran dihapus.");
  }

  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5", GLASS_SURFACE, GLASS_BORDER)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm"
            style={{ background: ICON_BG[req.status] }}
          >
            <HandCoins className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">{req.eventName}</h3>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLES[req.status])}>
                {req.status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {req.location || "Lokasi belum diisi"}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                {req.eventDate ? formatDateID(req.eventDate) : "Tanggal belum pasti"}
              </span>
            </div>
          </div>
        </div>
        {req.status === "Menunggu" && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => onDecide(req, "Ditolak")}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3.5 py-1.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            <button
              type="button"
              onClick={() => onDecide(req, "Disetujui")}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
            <TrendingDown className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">Modal Dibutuhkan</p>
            <p className="truncate text-base font-extrabold text-zinc-900 dark:text-white">
              {formatRupiah(req.modalEstimate)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">Estimasi Pendapatan</p>
            <p className="truncate text-base font-extrabold text-zinc-900 dark:text-white">
              {formatRupiah(req.billingEstimate)}
            </p>
          </div>
        </div>
      </div>

      {req.status !== "Menunggu" && req.decidedAt && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
          <Clock className="h-3.5 w-3.5" />
          Diputuskan {formatDateID(req.decidedAt.slice(0, 10))}
        </p>
      )}

      {req.investorNote && (
        <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
          Catatan Anda: &ldquo;{req.investorNote}&rdquo;
        </p>
      )}

      {req.status === "Disetujui" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3 dark:border-white/10">
          <input
            ref={inlineProofInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleInlineProofChange}
            className="hidden"
          />
          {req.paymentProofUrl ? (
            <>
              <a
                href={req.paymentProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/20"
              >
                <FileIcon className="h-3.5 w-3.5" />
                Lihat Bukti Pembayaran
              </a>
              <button
                type="button"
                onClick={() => inlineProofInputRef.current?.click()}
                disabled={proofBusy}
                className="text-xs font-semibold text-zinc-400 transition-colors hover:text-zinc-600 disabled:opacity-50 dark:hover:text-zinc-200"
              >
                Ganti
              </button>
              <button
                type="button"
                onClick={handleRemoveProof}
                disabled={proofBusy}
                className="text-xs font-semibold text-rose-400 transition-colors hover:text-rose-600 disabled:opacity-50"
              >
                Hapus
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => inlineProofInputRef.current?.click()}
              disabled={proofBusy}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-black/15 px-3 py-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:text-zinc-400 dark:hover:bg-white/5"
            >
              <Upload className="h-3.5 w-3.5" />
              {proofBusy ? "Mengunggah…" : "Unggah Bukti Pembayaran"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
