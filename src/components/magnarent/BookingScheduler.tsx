"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Calendar,
  Check,
  ClipboardCheck,
  FileSignature,
  Pencil,
  PackageSearch,
  Plus,
  Search,
  Share2,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import { useMagnarentData, type BookingConflict } from "./MagnarentDataProvider";
import { BookingConditionModal } from "./BookingConditionModal";
import { DeliveryScheduleModal } from "./DeliveryScheduleModal";
import { CrewAssignmentModal } from "./CrewAssignmentModal";
import { SubrentModal } from "./SubrentModal";
import { PortalShareModal } from "@/components/portal/PortalShareModal";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import type { Booking, BookingStatus, PaymentStatus } from "@/lib/magnarent/types";
import { formatDateID, todayISO } from "@/lib/magnarent/date";
import { calculateBookingTotal, formatRupiah } from "@/lib/magnarent/pricing";
import { listSeasonalPricingRules } from "@/lib/magnarent/extras-actions";
import { findApplicableSeasonalRule, type SeasonalPricingRule } from "@/lib/magnarent/extras-types";
import { BOOKING_STATUS_STYLES as STATUS_STYLES, PAYMENT_STYLES } from "@/lib/status-styles";
import { GLASS_BORDER, GLASS_INPUT, GLASS_SURFACE } from "@/lib/glass";

const GRADIENT = "linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)";

const AVATAR_PALETTE = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

const ALL_STATUSES: BookingStatus[] = ["Menunggu", "Dikonfirmasi", "Selesai", "Dibatalkan"];
const ALL_FILTER = "Semua Status";

function emptyForm() {
  const today = todayISO();
  return {
    itemId: "",
    clientId: "",
    namaKlien: "",
    teleponKlien: "",
    tanggalMulai: today,
    tanggalSelesai: today,
    jumlahUnit: "1",
    statusPembayaran: "Belum Bayar" as PaymentStatus,
    dpAmount: "0",
    catatan: "",
  };
}

function bookingToForm(booking: Booking) {
  return {
    itemId: booking.itemId,
    clientId: booking.clientId ?? "",
    namaKlien: booking.namaKlien,
    teleponKlien: booking.teleponKlien ?? "",
    tanggalMulai: booking.tanggalMulai,
    tanggalSelesai: booking.tanggalSelesai,
    jumlahUnit: String(booking.jumlahUnit),
    statusPembayaran: booking.statusPembayaran,
    dpAmount: String(booking.dpAmount ?? 0),
    catatan: booking.catatan ?? "",
  };
}

/**
 * Jadwal booking + modal buat/edit pesanan, dan konfirmasi hapus.
 * Pencegahan bentrok tanggal ditegakkan di provider (addBooking/updateBooking)
 * — saat mengedit, booking yang sedang diedit dikecualikan dari perhitungan
 * ketersediaannya sendiri lewat `excludeId`, supaya tidak "bentrok dengan
 * dirinya sendiri".
 */
export function BookingScheduler() {
  const {
    inventory,
    bookings,
    clients,
    addBooking,
    updateBooking,
    deleteBooking,
    updateBookingStatus,
    checkAvailability,
  } = useMagnarentData();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [conflict, setConflict] = useState<BookingConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);
  // Tahap 28a: checklist kondisi alat + jaminan — dibuka lewat tombol baru di baris.
  const [conditionTarget, setConditionTarget] = useState<Booking | null>(null);
  // Gap #7 analisis Magnarent: penjadwalan pengiriman/pengambilan — dibuka lewat tombol baru di baris.
  const [deliveryTarget, setDeliveryTarget] = useState<Booking | null>(null);
  const [crewTarget, setCrewTarget] = useState<Booking | null>(null);
  const [subrentTarget, setSubrentTarget] = useState<Booking | null>(null);
  const [portalTarget, setPortalTarget] = useState<Booking | null>(null);

  const itemName = (id: string) => inventory.find((i) => i.id === id)?.name ?? "—";
  const clientById = (id?: string) => (id ? clients.find((c) => c.id === id) : undefined);

  /** Pilih klien terdaftar → auto-isi nama/telepon (bisa tetap diedit manual sesudahnya). */
  function handlePickClient(clientId: string) {
    const picked = clients.find((c) => c.id === clientId);
    setForm((f) => ({
      ...f,
      clientId,
      namaKlien: picked ? picked.name : f.namaKlien,
      teleponKlien: picked?.picPhone ? picked.picPhone : f.teleponKlien,
    }));
  }

  const sortedBookings = useMemo(
    () => [...bookings].sort((a, b) => a.tanggalMulai.localeCompare(b.tanggalMulai)),
    [bookings]
  );

  const filteredBookings = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortedBookings.filter((b) => {
      const matchesSearch =
        !term || b.namaKlien.toLowerCase().includes(term) || itemName(b.itemId).toLowerCase().includes(term);
      const matchesStatus = statusFilter === ALL_FILTER || b.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [sortedBookings, searchTerm, statusFilter, inventory]);

  const liveAvailable = useMemo(() => {
    if (!form.itemId || !form.tanggalMulai || !form.tanggalSelesai) return null;
    if (form.tanggalMulai > form.tanggalSelesai) return null;
    return checkAvailability(form.itemId, form.tanggalMulai, form.tanggalSelesai, editingId ?? undefined);
  }, [form.itemId, form.tanggalMulai, form.tanggalSelesai, editingId, checkAvailability]);

  const liveTotal = useMemo(() => {
    const item = inventory.find((i) => i.id === form.itemId);
    const jumlahUnit = Number(form.jumlahUnit);
    if (!item || !form.tanggalMulai || !form.tanggalSelesai || !Number.isFinite(jumlahUnit)) return null;
    if (form.tanggalMulai > form.tanggalSelesai) return null;
    return calculateBookingTotal({ tanggalMulai: form.tanggalMulai, tanggalSelesai: form.tanggalSelesai, jumlahUnit }, item);
  }, [inventory, form.itemId, form.tanggalMulai, form.tanggalSelesai, form.jumlahUnit]);

  // Pricing dinamis musiman (rekomendasi Bagian 5-C #16) -- SARAN saja,
  // tidak mengubah `liveTotal` di atas. Rules diambil sekali saat modal
  // form dibuka (bukan dipreload lewat MagnarentDataProvider, jarang
  // berubah dan cuma relevan saat staf sedang input booking baru).
  const [seasonalRules, setSeasonalRules] = useState<SeasonalPricingRule[]>([]);
  useEffect(() => {
    if (formOpen) listSeasonalPricingRules().then(setSeasonalRules);
  }, [formOpen]);
  const seasonalHint = useMemo(() => {
    if (!form.itemId || !form.tanggalMulai) return null;
    return findApplicableSeasonalRule(seasonalRules, form.itemId, form.tanggalMulai);
  }, [seasonalRules, form.itemId, form.tanggalMulai]);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm());
    setConflict(null);
    setError(null);
    setFormOpen(true);
  }

  function openEditModal(booking: Booking) {
    setEditingId(booking.id);
    setForm(bookingToForm(booking));
    setConflict(null);
    setError(null);
    setFormOpen(true);
  }

  function closeFormModal() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setConflict(null);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setConflict(null);
    setError(null);

    const jumlahUnit = Number(form.jumlahUnit);

    if (!form.itemId) {
      setError("Pilih alat yang ingin dipesan.");
      return;
    }
    if (!form.namaKlien.trim()) {
      setError("Nama klien wajib diisi.");
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
    if (!Number.isFinite(jumlahUnit) || jumlahUnit < 1) {
      setError("Jumlah unit minimal 1.");
      return;
    }

    const dpAmount = Number(form.dpAmount) || 0;
    if (form.statusPembayaran === "DP") {
      if (dpAmount <= 0) {
        setError("Isi nominal DP yang sudah diterima (harus lebih dari 0).");
        return;
      }
      if (liveTotal !== null && dpAmount > liveTotal) {
        setError("Nominal DP tidak boleh melebihi estimasi total.");
        return;
      }
    }

    const payload = {
      itemId: form.itemId,
      clientId: form.clientId || undefined,
      namaKlien: form.namaKlien.trim(),
      teleponKlien: form.teleponKlien.trim() || undefined,
      tanggalMulai: form.tanggalMulai,
      tanggalSelesai: form.tanggalSelesai,
      jumlahUnit,
      statusPembayaran: form.statusPembayaran,
      dpAmount,
      catatan: form.catatan.trim() || undefined,
    };

    setSubmitting(true);
    const result = editingId ? await updateBooking(editingId, payload) : await addBooking(payload);
    setSubmitting(false);

    if (!result.ok) {
      if ("conflict" in result) {
        setConflict(result.conflict);
      } else {
        setError(result.error);
      }
      return;
    }

    showToast(editingId ? `Pesanan "${payload.namaKlien}" berhasil diperbarui.` : `Pesanan "${payload.namaKlien}" berhasil dibuat.`);
    closeFormModal();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteBooking(deleteTarget.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    showToast(`Pesanan "${deleteTarget.namaKlien}" berhasil dihapus.`);
    setDeleteTarget(null);
  }

  async function handleQuickStatus(b: Booking, status: BookingStatus) {
    const result = await updateBookingStatus(b.id, status);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(
      status === "Dikonfirmasi" ? `Pesanan "${b.namaKlien}" dikonfirmasi.` : `Pesanan "${b.namaKlien}" dibatalkan.`,
      status === "Dikonfirmasi" ? "success" : "error"
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Jadwal Booking</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filteredBookings.length} dari {bookings.length} pesanan ditampilkan
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: GRADIENT }}
        >
          <Plus className="h-4 w-4" />
          Buat Pesanan
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari klien atau alat…"
            className={cn("w-full rounded-full border py-2 pl-9 pr-3.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:text-white", GLASS_INPUT)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-blue-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
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
                <th className="px-5 py-3">Klien</th>
                <th className="px-5 py-3">Alat</th>
                <th className="px-5 py-3">Mulai</th>
                <th className="px-5 py-3">Selesai</th>
                <th className="px-5 py-3 text-right">Unit</th>
                <th className="px-5 py-3 text-right">Total Biaya</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Pembayaran</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={Calendar}
                      title={bookings.length === 0 ? "Belum ada pesanan" : "Tidak ada hasil"}
                      description={
                        bookings.length === 0
                          ? "Klik \"Buat Pesanan\" untuk menjadwalkan booking pertama."
                          : "Coba ubah kata kunci pencarian atau filter status."
                      }
                    />
                  </td>
                </tr>
              )}
              {filteredBookings.map((b) => {
                const item = inventory.find((i) => i.id === b.itemId);
                const total = calculateBookingTotal(b, item);
                return (
                  <tr key={b.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white",
                            getAvatarColor(b.namaKlien)
                          )}
                        >
                          {getInitials(b.namaKlien)}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 truncate font-medium text-zinc-900 dark:text-white">
                            <span className="truncate">{b.namaKlien}</span>
                            {clientById(b.clientId) && (
                              <BadgeCheck
                                className="h-3.5 w-3.5 shrink-0 text-blue-500"
                                aria-label="Klien terdaftar di Magnativ"
                              />
                            )}
                          </p>
                          {b.teleponKlien && (
                            <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">{b.teleponKlien}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{itemName(b.itemId)}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {formatDateID(b.tanggalMulai)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {formatDateID(b.tanggalSelesai)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-zinc-900 dark:text-white">
                      {b.jumlahUnit}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatRupiah(total)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[b.status])}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          PAYMENT_STYLES[b.statusPembayaran]
                        )}
                      >
                        {b.statusPembayaran}
                      </span>
                      {b.statusPembayaran === "DP" && b.dpAmount > 0 && (
                        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                          DP: {formatRupiah(b.dpAmount)}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {b.status === "Menunggu" && (
                          <button
                            type="button"
                            onClick={() => handleQuickStatus(b, "Dikonfirmasi")}
                            title="Konfirmasi pesanan"
                            aria-label="Konfirmasi pesanan"
                            className="rounded-full p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConditionTarget(b)}
                          title="Checklist kondisi & jaminan"
                          aria-label="Checklist kondisi & jaminan"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                        >
                          <ClipboardCheck className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeliveryTarget(b)}
                          title="Jadwal pengiriman & pengambilan"
                          aria-label="Jadwal pengiriman & pengambilan"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-500/10 dark:hover:text-orange-300"
                        >
                          <Truck className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCrewTarget(b)}
                          title="Kru bertugas"
                          aria-label="Kru bertugas"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-500/10 dark:hover:text-teal-300"
                        >
                          <Users className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubrentTarget(b)}
                          title="Subrent alat (pinjam dari vendor luar)"
                          aria-label="Subrent alat (pinjam dari vendor luar)"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-cyan-50 hover:text-cyan-600 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-300"
                        >
                          <PackageSearch className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPortalTarget(b)}
                          title="Bagikan ke klien"
                          aria-label="Bagikan ke klien"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                        <a
                          href={`/api/magnarent/bookings/${b.id}/contract`}
                          target="_blank"
                          rel="noreferrer"
                          title="Ekspor Kontrak Sewa"
                          aria-label="Ekspor Kontrak Sewa"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                        >
                          <FileSignature className="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => openEditModal(b)}
                          title="Edit pesanan"
                          aria-label="Edit pesanan"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(b)}
                          title="Hapus pesanan"
                          aria-label="Hapus pesanan"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={formOpen} onClose={closeFormModal} title={editingId ? "Edit Pesanan" : "Buat Pesanan Baru"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="booking-item" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Alat
            </label>
            <select
              id="booking-item"
              value={form.itemId}
              onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              <option value="">Pilih alat…</option>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {formatRupiah(item.pricePerDay)}/hari
                </option>
              ))}
            </select>
          </div>

          {clients.length > 0 && (
            <div>
              <label htmlFor="booking-client-select" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Klien Terdaftar (opsional)
              </label>
              <select
                id="booking-client-select"
                value={form.clientId}
                onChange={(e) => handlePickClient(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                <option value="">— Bukan dari daftar klien (isi manual) —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.industry})
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                Memilih klien di sini otomatis mengisi nama & telepon, dan menautkan booking ini ke riwayat klien
                lintas modul (lihat Admin → Direktori Klien Terpadu).
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="booking-client-name" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Nama Klien
              </label>
              <input
                id="booking-client-name"
                value={form.namaKlien}
                onChange={(e) => setForm((f) => ({ ...f, namaKlien: e.target.value, clientId: "" }))}
                placeholder="mis. PT Sinergi Membangun"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="booking-client-phone" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Telepon (opsional)
              </label>
              <input
                id="booking-client-phone"
                value={form.teleponKlien}
                onChange={(e) => setForm((f) => ({ ...f, teleponKlien: e.target.value }))}
                placeholder="0812-xxxx-xxxx"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="booking-start-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Mulai
              </label>
              <input
                id="booking-start-date"
                type="date"
                value={form.tanggalMulai}
                onChange={(e) => setForm((f) => ({ ...f, tanggalMulai: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="booking-end-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Selesai
              </label>
              <input
                id="booking-end-date"
                type="date"
                value={form.tanggalSelesai}
                onChange={(e) => setForm((f) => ({ ...f, tanggalSelesai: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="booking-unit-count" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Jumlah Unit
              </label>
              <input
                id="booking-unit-count"
                type="number"
                min={1}
                value={form.jumlahUnit}
                onChange={(e) => setForm((f) => ({ ...f, jumlahUnit: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
              {!conflict && liveAvailable !== null && (
                <p
                  className={cn(
                    "mt-1.5 text-xs font-medium",
                    liveAvailable >= Number(form.jumlahUnit || 1)
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  )}
                >
                  Tersedia {Math.max(liveAvailable, 0)} unit.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="booking-payment-status" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Status Pembayaran
              </label>
              <select
                id="booking-payment-status"
                value={form.statusPembayaran}
                onChange={(e) => setForm((f) => ({ ...f, statusPembayaran: e.target.value as PaymentStatus }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                <option value="Belum Bayar">Belum Bayar</option>
                <option value="DP">DP</option>
                <option value="Lunas">Lunas</option>
              </select>
            </div>
          </div>

          {form.statusPembayaran === "DP" && (
            <div>
              <label htmlFor="booking-dp-amount" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Nominal DP Diterima (Rp)
              </label>
              <input
                id="booking-dp-amount"
                type="number"
                min={0}
                value={form.dpAmount}
                onChange={(e) => setForm((f) => ({ ...f, dpAmount: e.target.value }))}
                placeholder="mis. 500000"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
              {liveTotal !== null && (
                <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  Sisa tagihan setelah DP: {formatRupiah(Math.max(liveTotal - (Number(form.dpAmount) || 0), 0))}
                </p>
              )}
            </div>
          )}

          {liveTotal !== null && (
            <div className="rounded-xl bg-blue-50 px-3.5 py-2.5 text-sm font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              Estimasi Total: {formatRupiah(liveTotal)}
            </div>
          )}

          {seasonalHint && liveTotal !== null && (
            <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              <span className="font-semibold">Musim "{seasonalHint.label}"</span> berlaku di tanggal ini (
              {seasonalHint.multiplierPct > 0 ? "+" : ""}
              {seasonalHint.multiplierPct}%) — saran harga:{" "}
              <span className="font-semibold">
                {formatRupiah(Math.round(liveTotal * (1 + seasonalHint.multiplierPct / 100)))}
              </span>{" "}
              (bukan otomatis, sesuaikan manual kalau dipakai).
            </div>
          )}

          <div>
            <label htmlFor="booking-catatan" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Catatan (opsional)
            </label>
            <input
              id="booking-catatan"
              value={form.catatan}
              onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
              placeholder="mis. lokasi acara, kontak PIC"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          {conflict && (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Bentrok jadwal — hanya {Math.max(conflict.available, 0)} unit tersedia, diminta{" "}
                {conflict.requested}.
              </p>
              {conflict.overlapping.length > 0 && (
                <ul className="ml-1 list-disc space-y-0.5 pl-4">
                  {conflict.overlapping.map((b) => (
                    <li key={b.id}>
                      {b.namaKlien} — {formatDateID(b.tanggalMulai)} s/d {formatDateID(b.tanggalSelesai)} (
                      {b.jumlahUnit} unit, {b.status})
                    </li>
                  ))}
                </ul>
              )}
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
              {submitting ? "Menyimpan…" : editingId ? "Simpan Perubahan" : "Buat Pesanan"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Pesanan"
        description={
          deleteTarget && (
            <>
              Yakin hapus pesanan <strong>{deleteTarget.namaKlien}</strong> untuk{" "}
              <strong>{itemName(deleteTarget.itemId)}</strong> ({formatDateID(deleteTarget.tanggalMulai)} s/d{" "}
              {formatDateID(deleteTarget.tanggalSelesai)})? Tindakan ini tidak bisa dibatalkan.
            </>
          )
        }
      />

      {conditionTarget && (
        <BookingConditionModal
          bookingId={conditionTarget.id}
          clientName={conditionTarget.namaKlien}
          open={conditionTarget !== null}
          onClose={() => setConditionTarget(null)}
        />
      )}

      {deliveryTarget && (
        <DeliveryScheduleModal
          bookingId={deliveryTarget.id}
          clientName={deliveryTarget.namaKlien}
          onClose={() => setDeliveryTarget(null)}
        />
      )}
      {crewTarget && (
        <CrewAssignmentModal
          bookingId={crewTarget.id}
          clientName={crewTarget.namaKlien}
          onClose={() => setCrewTarget(null)}
        />
      )}
      {subrentTarget && (
        <SubrentModal
          bookingId={subrentTarget.id}
          clientName={subrentTarget.namaKlien}
          itemId={subrentTarget.itemId || undefined}
          tanggalMulai={subrentTarget.tanggalMulai}
          tanggalSelesai={subrentTarget.tanggalSelesai}
          onClose={() => setSubrentTarget(null)}
        />
      )}
      {portalTarget && (
        <PortalShareModal
          module="magnarent"
          entityId={portalTarget.id}
          entityLabel={portalTarget.namaKlien}
          clientName={portalTarget.namaKlien}
          onClose={() => setPortalTarget(null)}
        />
      )}
    </div>
  );
}
