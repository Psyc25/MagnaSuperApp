"use client";

import { useEffect, useState } from "react";
import { MapPin, Share2, Truck, Undo2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/cn";
import { getDeliveries, getOrCreateTrackingLink, saveDelivery } from "@/lib/magnarent/extras-actions";
import { DELIVERY_STATUS, type Delivery, type DeliveryStage, type DeliveryStatus } from "@/lib/magnarent/extras-types";
import { useResetOnChange } from "@/lib/shared/use-synced-state";

/** Format "X menit/jam lalu" sederhana, tanpa library eksternal. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

/**
 * Panel live location dispatch (Gap laporan Bagian 5-C) -- tombol buat
 * link `/lacak/[token]` buat dibagikan ke sopir via WhatsApp, plus
 * tampilan lokasi terakhir (link Google Maps) kalau sopir sudah pernah
 * kirim koordinat. Cuma muncul kalau baris delivery-nya sudah pernah
 * disimpan (perlu id), jadi staf isi jadwal dulu baru bagikan link.
 */
function LiveLocationPanel({ delivery }: { delivery: Delivery }) {
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);

  async function handleShareLink() {
    setCreating(true);
    const result = await getOrCreateTrackingLink(delivery.id);
    setCreating(false);
    if (!result.ok || !result.token) {
      showToast(result.ok ? "Gagal membuat link." : result.error, "error");
      return;
    }
    const url = `${window.location.origin}/lacak/${result.token}`;
    const text = encodeURIComponent(`Halo, tolong bagikan lokasi selama perjalanan lewat link ini ya: ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-white/5">
      <div className="min-w-0">
        {delivery.lastLat != null && delivery.lastLng != null && delivery.lastLocationAt ? (
          <a
            href={`https://www.google.com/maps?q=${delivery.lastLat},${delivery.lastLng}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-medium text-sky-600 hover:underline dark:text-sky-300"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            Lihat lokasi terakhir ({timeAgo(delivery.lastLocationAt)})
          </a>
        ) : (
          <span className="text-zinc-400">Belum ada lokasi dikirim sopir.</span>
        )}
      </div>
      <button
        type="button"
        onClick={handleShareLink}
        disabled={creating}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-300 px-2.5 py-1 font-semibold text-orange-600 disabled:opacity-60 dark:border-orange-500/40 dark:text-orange-300"
      >
        <Share2 className="h-3 w-3" />
        {creating ? "…" : "Bagikan Link Lacak"}
      </button>
    </div>
  );
}

const STAGE_LABEL: Record<DeliveryStage, string> = { pengiriman: "Pengiriman", pengambilan: "Pengambilan" };
const STAGE_ICON: Record<DeliveryStage, typeof Truck> = { pengiriman: Truck, pengambilan: Undo2 };

const STATUS_STYLE: Record<DeliveryStatus, string> = {
  "Belum Dijadwalkan": "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400",
  Dijadwalkan: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300",
  Selesai: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
};

function emptyStageForm() {
  return { driverName: "", jadwalTanggal: "", jadwalJam: "", status: "Belum Dijadwalkan" as DeliveryStatus, catatan: "" };
}

function StagePanel({
  bookingId,
  stage,
  delivery,
  onSaved,
}: {
  bookingId: string;
  stage: DeliveryStage;
  delivery: Delivery | undefined;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyStageForm());
  const [submitting, setSubmitting] = useState(false);
  const Icon = STAGE_ICON[stage];

  useResetOnChange(delivery, (d) => {
    setForm({
      driverName: d?.driverName ?? "",
      jadwalTanggal: d?.jadwalTanggal ?? "",
      jadwalJam: d?.jadwalJam ?? "",
      status: d?.status ?? "Belum Dijadwalkan",
      catatan: d?.catatan ?? "",
    });
  });

  async function handleSave() {
    setSubmitting(true);
    const result = await saveDelivery(bookingId, stage, form);
    setSubmitting(false);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Jadwal ${STAGE_LABEL[stage].toLowerCase()} berhasil disimpan.`);
    onSaved();
  }

  return (
    <div className="space-y-3 rounded-xl border border-black/5 p-3.5 dark:border-white/10">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        <Icon className="h-3.5 w-3.5" />
        {STAGE_LABEL[stage]}
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[form.status])}>
          {form.status}
        </span>
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Sopir/PIC</label>
          <input
            value={form.driverName}
            onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))}
            placeholder="Nama sopir/PIC"
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DeliveryStatus }))}
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
          >
            {DELIVERY_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Tanggal</label>
          <input
            type="date"
            value={form.jadwalTanggal}
            onChange={(e) => setForm((f) => ({ ...f, jadwalTanggal: e.target.value }))}
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Jam</label>
          <input
            type="time"
            value={form.jadwalJam}
            onChange={(e) => setForm((f) => ({ ...f, jadwalJam: e.target.value }))}
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>
      </div>

      <textarea
        value={form.catatan}
        onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
        rows={2}
        placeholder={`Catatan ${STAGE_LABEL[stage].toLowerCase()}… (mis. alamat tujuan, patokan lokasi)`}
        className="w-full resize-none rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
      />

      {delivery && <LiveLocationPanel delivery={delivery} />}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-full bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

/**
 * Penjadwalan pengiriman & pengambilan alat per booking (Gap #7 analisis
 * gap Magnarent) — versi ringan: sopir/PIC, tanggal, jam, status per
 * booking, TANPA optimasi rute otomatis (itu butuh bahan/API eksternal,
 * dicatat sebagai gap terpisah di laporan). Data on-demand per booking,
 * sama pola dengan BookingConditionModal.
 */
export function DeliveryScheduleModal({
  bookingId,
  clientName,
  onClose,
}: {
  bookingId: string;
  clientName: string;
  onClose: () => void;
}) {
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);

  function reload() {
    getDeliveries(bookingId).then(setDeliveries);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const findStage = (stage: DeliveryStage) => deliveries?.find((d) => d.stage === stage);

  return (
    <Modal open onClose={onClose} title={`Jadwal Pengiriman — ${clientName}`}>
      <div className="space-y-3">
        {deliveries === null ? (
          <p className="py-6 text-center text-sm text-zinc-400">Memuat…</p>
        ) : (
          <>
            <StagePanel bookingId={bookingId} stage="pengiriman" delivery={findStage("pengiriman")} onSaved={reload} />
            <StagePanel bookingId={bookingId} stage="pengambilan" delivery={findStage("pengambilan")} onSaved={reload} />
          </>
        )}
      </div>
    </Modal>
  );
}
