"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyDivision } from "@/lib/push/notify";
import { logActivity } from "@/lib/activity/log";
import { getAvailableUnitsInRange, getOverlappingBookings } from "./availability";
import { rowToBooking, rowToInventory, type BookingRow, type InventoryRow } from "./mappers";
import type { Booking, BookingStatus, InventoryItem, PaymentStatus } from "./types";
import { canTransitionBooking } from "./booking-status";

const MODULE_PATH = "/dashboard/magnarent";
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";

export type MutationResult = { ok: true } | { ok: false; error: string };

export type BookingConflict = { overlapping: Booking[]; available: number; requested: number };
export type SaveBookingResult =
  | { ok: true }
  | { ok: false; conflict: BookingConflict }
  | { ok: false; error: string };

export type BookingInput = {
  itemId: string;
  clientId?: string;
  namaKlien: string;
  teleponKlien?: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  jumlahUnit: number;
  statusPembayaran: PaymentStatus;
  /** Nominal DP yang sudah diterima — lihat migrasi 0015. */
  dpAmount?: number;
  catatan?: string;
};

/**
 * Semua Server Action di sini menulis ke Supabase lalu `revalidatePath` —
 * itu otomatis membuat Next.js mengambil ulang data di
 * `src/app/dashboard/magnarent/layout.tsx` (Server Component) dan mengirim
 * props baru ke `MagnarentDataProvider`, jadi UI ter-update tanpa reload
 * manual meski action ini dipanggil langsung sebagai fungsi (bukan lewat
 * atribut `<form action>`).
 *
 * Setiap tabel sudah dijaga RLS (lihat migrasi 0004: `can_access_division`),
 * jadi pengecekan divisi tidak perlu diulang di sini — kalau akun yang
 * memanggil bukan divisi Magnarent/akses penuh, query-nya otomatis kena
 * kosong/ditolak oleh Postgres, bukan cuma disembunyikan di UI.
 */
/** Sama alasannya dengan `validateBookingInput` — dicek ulang di server, bukan cuma diandalkan dari form. */
function validateInventoryInput(input: Omit<InventoryItem, "id">): string | null {
  if (!input.name?.trim() || !input.category?.trim() || !input.location?.trim()) {
    return "Nama, kategori, dan lokasi wajib diisi.";
  }
  if (!Number.isInteger(input.totalUnit) || input.totalUnit <= 0) {
    return "Total unit harus bilangan bulat lebih dari 0.";
  }
  if (!Number.isInteger(input.unitMaintenance) || input.unitMaintenance < 0) {
    return "Unit maintenance tidak boleh negatif.";
  }
  if (input.unitMaintenance > input.totalUnit) {
    return "Unit maintenance tidak boleh lebih besar dari total unit.";
  }
  if (!Number.isFinite(input.pricePerDay) || input.pricePerDay < 0) {
    return "Harga per hari tidak valid.";
  }
  if (input.pricePerWeek !== undefined && (!Number.isFinite(input.pricePerWeek) || input.pricePerWeek < 0)) {
    return "Harga per minggu tidak valid.";
  }
  if (input.pricePerMonth !== undefined && (!Number.isFinite(input.pricePerMonth) || input.pricePerMonth < 0)) {
    return "Harga per bulan tidak valid.";
  }
  return null;
}

export async function addInventoryItem(input: Omit<InventoryItem, "id">): Promise<MutationResult> {
  const validationError = validateInventoryInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_inventory").insert({
    name: input.name,
    category: input.category,
    location: input.location,
    price_per_day: input.pricePerDay,
    total_unit: input.totalUnit,
    unit_maintenance: input.unitMaintenance,
    price_per_week: input.pricePerWeek ?? null,
    price_per_month: input.pricePerMonth ?? null,
  });

  if (error) {
    console.error("[magnarent] addInventoryItem gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);

  // Tahap 35: alat/unit baru masuk inventaris ikut memberi tahu tim Magnarent
  // (+ akses penuh) — sebelumnya cuma booking baru yang memicu notifikasi.
  const {
    data: { user: inventoryCreator },
  } = await supabase.auth.getUser();
  void notifyDivision(
    "magnarent",
    {
      title: "Alat Baru — Magnarent",
      body: `${input.name} (${input.category}) ditambahkan ke inventaris, ${input.totalUnit} unit.`,
      url: "/dashboard/magnarent/inventaris",
    },
    inventoryCreator?.id
  );
  void logActivity({ module: "magnarent", action: "create", entityType: "inventaris", entityLabel: input.name });
  return { ok: true };
}

export async function updateInventoryItem(
  id: string,
  input: Omit<InventoryItem, "id">
): Promise<MutationResult> {
  const validationError = validateInventoryInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("magnarent_inventory")
    .update({
      name: input.name,
      category: input.category,
      location: input.location,
      price_per_day: input.pricePerDay,
      total_unit: input.totalUnit,
      unit_maintenance: input.unitMaintenance,
      price_per_week: input.pricePerWeek ?? null,
      price_per_month: input.pricePerMonth ?? null,
    })
    .eq("id", id);

  if (error) {
    console.error("[magnarent] updateInventoryItem gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnarent", action: "update", entityType: "inventaris", entityLabel: input.name });
  return { ok: true };
}

export async function deleteInventoryItem(id: string): Promise<MutationResult> {
  const supabase = await createClient();

  // Cegah hapus alat yang masih dipegang booking AKTIF — dulu ini cuma
  // dicek di UI (getActiveBookingsForItem); ditegakkan ulang di sini supaya
  // tidak bisa dilewati dengan memanggil action ini langsung.
  const { data: activeRows, error: activeError } = await supabase
    .from("magnarent_bookings")
    .select("id")
    .eq("item_id", id)
    .in("status", ["Menunggu", "Dikonfirmasi"])
    .limit(1);

  if (activeError) {
    console.error("[magnarent] Cek booking aktif sebelum hapus alat gagal:", activeError.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (activeRows && activeRows.length > 0) {
    return { ok: false, error: "Alat masih dipakai booking aktif, tidak bisa dihapus." };
  }

  const { data: itemRow } = await supabase.from("magnarent_inventory").select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from("magnarent_inventory").delete().eq("id", id);
  if (error) {
    console.error("[magnarent] deleteInventoryItem gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnarent", action: "delete", entityType: "inventaris", entityLabel: itemRow?.name });
  return { ok: true };
}

type Capacity = { item: InventoryItem; overlapping: Booking[]; available: number };

/** Ambil data terkini dari DB lalu pakai ulang logika bentrok yang sama persis dengan versi lama (src/lib/magnarent/availability.ts) — supaya aturan bisnisnya tidak berubah, cuma sumber datanya yang sekarang Supabase, bukan React state. */
async function checkBookingCapacity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: BookingInput,
  excludeId?: string
): Promise<Capacity | { error: string }> {
  const { data: itemRow, error: itemError } = await supabase
    .from("magnarent_inventory")
    .select("*")
    .eq("id", input.itemId)
    .maybeSingle<InventoryRow>();

  if (itemError) {
    console.error("[magnarent] Ambil data alat gagal:", itemError.message);
    return { error: GENERIC_ERROR };
  }
  if (!itemRow) {
    return { error: "Alat tidak ditemukan." };
  }

  const { data: bookingRows, error: bookingsError } = await supabase
    .from("magnarent_bookings")
    .select("*")
    .eq("item_id", input.itemId)
    .returns<BookingRow[]>();

  if (bookingsError) {
    console.error("[magnarent] Ambil data booking gagal:", bookingsError.message);
    return { error: GENERIC_ERROR };
  }

  const item = rowToInventory(itemRow);
  const bookings = (bookingRows ?? []).map(rowToBooking);
  const overlapping = getOverlappingBookings(
    bookings,
    input.itemId,
    input.tanggalMulai,
    input.tanggalSelesai,
    excludeId
  );
  const available = getAvailableUnitsInRange(
    item,
    bookings,
    input.tanggalMulai,
    input.tanggalSelesai,
    excludeId
  );

  return { item, overlapping, available };
}

/**
 * Divalidasi ulang di server — form di UI sudah punya `required`/`min`/
 * `type="date"`, tapi `addBooking`/`updateBooking` bisa dipanggil langsung
 * sebagai fungsi, jadi validasi HTML saja tidak cukup untuk mencegah data
 * rusak (mis. jumlah unit negatif, tanggal selesai sebelum tanggal mulai).
 */
function validateBookingInput(input: BookingInput): string | null {
  if (!input.namaKlien?.trim()) return "Nama klien wajib diisi.";
  if (!Number.isInteger(input.jumlahUnit) || input.jumlahUnit <= 0) {
    return "Jumlah unit harus bilangan bulat lebih dari 0.";
  }
  if (!input.tanggalMulai || !input.tanggalSelesai || input.tanggalMulai > input.tanggalSelesai) {
    return "Tanggal selesai tidak boleh sebelum tanggal mulai.";
  }
  if (input.dpAmount !== undefined && (!Number.isFinite(input.dpAmount) || input.dpAmount < 0)) {
    return "Nominal DP tidak valid.";
  }
  return null;
}

export async function addBooking(input: BookingInput): Promise<SaveBookingResult> {
  const validationError = validateBookingInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const capacity = await checkBookingCapacity(supabase, input);
  if ("error" in capacity) return { ok: false, error: capacity.error };

  if (input.jumlahUnit > capacity.available) {
    return {
      ok: false,
      conflict: { overlapping: capacity.overlapping, available: capacity.available, requested: input.jumlahUnit },
    };
  }

  // Pre-check di atas cuma untuk pesan konflik yang informatif — penulisan
  // sungguhan lewat RPC `save_booking_checked` (migrasi 0020) yang
  // menghitung ulang + insert dalam SATU transaksi terkunci, supaya staf
  // lain yang submit nyaris bersamaan untuk alat yang sama tidak bisa lolos
  // bersama-sama (lihat komentar migrasinya untuk detail race condition-nya).
  const { error } = await supabase.rpc("save_booking_checked", {
    p_booking_id: null,
    p_item_id: input.itemId,
    p_client_id: input.clientId ?? null,
    p_nama_klien: input.namaKlien,
    p_telepon_klien: input.teleponKlien ?? null,
    p_tanggal_mulai: input.tanggalMulai,
    p_tanggal_selesai: input.tanggalSelesai,
    p_jumlah_unit: input.jumlahUnit,
    p_status_pembayaran: input.statusPembayaran,
    // DP hanya bermakna untuk status "DP" -- nilai lama yang tertinggal saat
    // status diganti membuat piutang terhitung lebih kecil dari seharusnya.
    p_dp_amount: input.statusPembayaran === "DP" ? (input.dpAmount ?? 0) : 0,
    p_catatan: input.catatan ?? null,
  });

  if (error) {
    if (error.message.startsWith("RACE_CONFLICT:")) {
      return { ok: false, error: error.message.replace("RACE_CONFLICT: ", "") };
    }
    console.error("[magnarent] addBooking gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);

  // Beri tahu tim Magnarent (+ akun akses penuh) ada booking baru masuk.
  // Sengaja tidak di-`await` — kegagalan kirim notifikasi tidak boleh
  // menahan respons ke pengguna yang booking-nya sudah berhasil tersimpan.
  const {
    data: { user: bookingActor },
  } = await supabase.auth.getUser();
  void notifyDivision(
    "magnarent",
    {
      title: "Booking Baru — Magnarent",
      body: `${input.namaKlien} memesan ${capacity.item.name} (${input.jumlahUnit} unit).`,
      url: "/dashboard/magnarent/booking",
    },
    bookingActor?.id
  );
  void logActivity({
    module: "magnarent",
    action: "create",
    entityType: "booking",
    entityLabel: input.namaKlien,
    detail: `${capacity.item.name} × ${input.jumlahUnit} unit`,
  });

  return { ok: true };
}

export async function updateBooking(id: string, input: BookingInput): Promise<SaveBookingResult> {
  const validationError = validateBookingInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const capacity = await checkBookingCapacity(supabase, input, id);
  if ("error" in capacity) return { ok: false, error: capacity.error };

  if (input.jumlahUnit > capacity.available) {
    return {
      ok: false,
      conflict: { overlapping: capacity.overlapping, available: capacity.available, requested: input.jumlahUnit },
    };
  }

  // Sama seperti addBooking — penulisan sungguhan lewat RPC terkunci
  // `save_booking_checked` (migrasi 0020), bukan UPDATE langsung.
  const { error } = await supabase.rpc("save_booking_checked", {
    p_booking_id: id,
    p_item_id: input.itemId,
    p_client_id: input.clientId ?? null,
    p_nama_klien: input.namaKlien,
    p_telepon_klien: input.teleponKlien ?? null,
    p_tanggal_mulai: input.tanggalMulai,
    p_tanggal_selesai: input.tanggalSelesai,
    p_jumlah_unit: input.jumlahUnit,
    p_status_pembayaran: input.statusPembayaran,
    // DP hanya bermakna untuk status "DP" -- nilai lama yang tertinggal saat
    // status diganti membuat piutang terhitung lebih kecil dari seharusnya.
    p_dp_amount: input.statusPembayaran === "DP" ? (input.dpAmount ?? 0) : 0,
    p_catatan: input.catatan ?? null,
  });

  if (error) {
    if (error.message.startsWith("RACE_CONFLICT:")) {
      return { ok: false, error: error.message.replace("RACE_CONFLICT: ", "") };
    }
    console.error("[magnarent] updateBooking gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnarent", action: "update", entityType: "booking", entityLabel: input.namaKlien });
  return { ok: true };
}

export async function deleteBooking(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: bookingRow } = await supabase
    .from("magnarent_bookings")
    .select("nama_klien")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("magnarent_bookings").delete().eq("id", id);
  if (error) {
    console.error("[magnarent] deleteBooking gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "magnarent",
    action: "delete",
    entityType: "booking",
    entityLabel: bookingRow?.nama_klien,
  });
  return { ok: true };
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: bookingRow } = await supabase
    .from("magnarent_bookings")
    .select("nama_klien, status")
    .eq("id", id)
    .maybeSingle<{ nama_klien: string; status: BookingStatus }>();

  if (!bookingRow) return { ok: false, error: "Booking tidak ditemukan." };
  if (!canTransitionBooking(bookingRow.status, status)) {
    return { ok: false, error: `Booking berstatus "${bookingRow.status}" tidak bisa diubah ke "${status}".` };
  }

  // Bersyarat pada status yang tadi dibaca: kalau staf lain sudah mengubahnya
  // duluan (mis. membatalkan), perubahan ini tidak menimpa diam-diam.
  const { data: updated, error } = await supabase
    .from("magnarent_bookings")
    .update({ status })
    .eq("id", id)
    .eq("status", bookingRow.status)
    .select("id");
  if (error) {
    console.error("[magnarent] updateBookingStatus gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Status booking sudah berubah. Muat ulang halaman lalu coba lagi." };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "magnarent",
    action: "status_change",
    entityType: "booking",
    entityLabel: bookingRow?.nama_klien,
    detail: `status → ${status}`,
  });
  return { ok: true };
}
