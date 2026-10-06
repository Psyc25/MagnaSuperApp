"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity/log";
import {
  rowToBookingCheck,
  rowToBookingDeposit,
  rowToDelivery,
  rowToMaintenanceLog,
  type BookingCheck,
  type BookingCheckRow,
  type BookingDeposit,
  type BookingDepositRow,
  type CheckStage,
  type Delivery,
  type DeliveryRow,
  type DeliveryStage,
  type DeliveryStatus,
  type DepositJenis,
  type MaintenanceJenis,
  type MaintenanceLog,
  type MaintenanceLogRow,
  rowToSeasonalPricingRule,
  type SeasonalPricingRule,
  type SeasonalPricingRuleRow,
  rowToCrewAssignment,
  dateRangesOverlap,
  type CrewAssignment,
  type CrewAssignmentRow,
  type CrewConflict,
  type CrewRole,
  rowToWarehouse,
  type Warehouse,
  type WarehouseRow,
  rowToWarehouseTransfer,
  type WarehouseTransfer,
  type WarehouseTransferRow,
  rowToSubrentRecord,
  type SubrentRecord,
  type SubrentRecordRow,
  type SubrentStatus,
} from "./extras-types";
import { rowToInventoryUnit, type InventoryUnitRow } from "./mappers";
import type { InventoryUnit, InventoryUnitStatus } from "./types";

const MODULE_PATH = "/dashboard/magnarent/booking";
const INVENTORY_PATH = "/dashboard/magnarent/inventaris";
const GALLERY_PATH = INVENTORY_PATH;
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";
const CHECKS_BUCKET = "magnarent-checks";
const GALLERY_BUCKET = "magnarent-gallery";

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Checklist kondisi alat (Tahap 28a) — satu baris per (booking, stage),
 * di-upsert lewat unique(booking_id, stage) di migrasi 0025 supaya staf
 * bisa perbarui catatan/foto yang sama tanpa bikin duplikat baris.
 */
export async function getBookingChecks(bookingId: string): Promise<BookingCheck[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_booking_checks")
    .select("*")
    .eq("booking_id", bookingId)
    .returns<BookingCheckRow[]>();

  if (error) {
    console.error("[magnarent] getBookingChecks gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToBookingCheck);
}

export async function saveBookingCheck(
  bookingId: string,
  stage: CheckStage,
  catatan: string,
  formData: FormData
): Promise<MutationResult> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("magnarent_booking_checks")
    .select("photo_urls, photo_storage_paths")
    .eq("booking_id", bookingId)
    .eq("stage", stage)
    .maybeSingle();

  const photoUrls: string[] = existing?.photo_urls ?? [];
  const photoPaths: string[] = existing?.photo_storage_paths ?? [];

  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  // Foto yang gagal diunggah dilaporkan (dulu dilewati diam-diam lalu
  // "berhasil disimpan" -- padahal foto kondisi adalah bukti klaim kerusakan).
  const failedFiles: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      failedFiles.push(file.name);
      continue;
    }
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
    const storagePath = `${bookingId}/${stage}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(CHECKS_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) {
      console.error("[magnarent] Upload foto checklist gagal:", uploadError.message);
      failedFiles.push(file.name);
      continue;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(CHECKS_BUCKET).getPublicUrl(storagePath);
    photoUrls.push(publicUrl);
    photoPaths.push(storagePath);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("magnarent_booking_checks").upsert(
    {
      booking_id: bookingId,
      stage,
      catatan: catatan.trim() || null,
      photo_urls: photoUrls,
      photo_storage_paths: photoPaths,
      checked_by: user?.id ?? null,
      checked_at: new Date().toISOString(),
    },
    { onConflict: "booking_id,stage" }
  );

  if (error) {
    console.error("[magnarent] saveBookingCheck gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  if (failedFiles.length > 0) {
    return {
      ok: false,
      error: `Catatan tersimpan, tapi ${failedFiles.length} foto gagal diunggah (${failedFiles.join(", ")}). Pastikan file berupa foto lalu unggah ulang.`,
    };
  }
  return { ok: true };
}

export async function removeBookingCheckPhoto(
  bookingId: string,
  stage: CheckStage,
  photoUrl: string
): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("magnarent_booking_checks")
    .select("photo_urls, photo_storage_paths")
    .eq("booking_id", bookingId)
    .eq("stage", stage)
    .maybeSingle();

  if (fetchError || !existing) return { ok: false, error: GENERIC_ERROR };

  const urls: string[] = existing.photo_urls ?? [];
  const paths: string[] = existing.photo_storage_paths ?? [];
  const idx = urls.indexOf(photoUrl);
  if (idx === -1) return { ok: true };

  const removedPath = paths[idx];
  urls.splice(idx, 1);
  paths.splice(idx, 1);

  const { error } = await supabase
    .from("magnarent_booking_checks")
    .update({ photo_urls: urls, photo_storage_paths: paths })
    .eq("booking_id", bookingId)
    .eq("stage", stage);

  if (error) {
    console.error("[magnarent] removeBookingCheckPhoto gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (removedPath) await supabase.storage.from(CHECKS_BUCKET).remove([removedPath]);
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Deposit/jaminan booking — satu baris per booking (unique booking_id di
 * migrasi 0025), di-upsert supaya form "Jaminan" bisa dipakai berulang
 * untuk menambah/mengubah tanpa perlu tombol tambah/edit terpisah.
 */
export async function getBookingDeposit(bookingId: string): Promise<BookingDeposit | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_booking_deposits")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle<BookingDepositRow>();

  if (error || !data) return null;
  return rowToBookingDeposit(data);
}

export async function saveBookingDeposit(
  bookingId: string,
  input: { jenis: DepositJenis; jumlah: number; keterangan?: string }
): Promise<MutationResult> {
  if (!Number.isFinite(input.jumlah) || input.jumlah < 0) {
    return { ok: false, error: "Jumlah jaminan tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_booking_deposits").upsert(
    {
      booking_id: bookingId,
      jenis: input.jenis,
      jumlah: input.jumlah,
      keterangan: input.keterangan?.trim() || null,
    },
    { onConflict: "booking_id" }
  );

  if (error) {
    console.error("[magnarent] saveBookingDeposit gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function setDepositReturned(bookingId: string, returned: boolean): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("magnarent_booking_deposits")
    .update({ dikembalikan: returned, dikembalikan_at: returned ? new Date().toISOString() : null })
    .eq("booking_id", bookingId);

  if (error) {
    console.error("[magnarent] setDepositReturned gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Log riwayat servis/perbaikan alat — banyak baris per alat (murni riwayat,
 * tidak di-upsert), dibuka dari InventoryManager.tsx.
 */
export async function getMaintenanceLogs(itemId: string): Promise<MaintenanceLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_maintenance_logs")
    .select("*")
    .eq("item_id", itemId)
    .order("tanggal", { ascending: false })
    .returns<MaintenanceLogRow[]>();

  if (error) {
    console.error("[magnarent] getMaintenanceLogs gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToMaintenanceLog);
}

/**
 * Semua log maintenance LINTAS alat (bukan per-item seperti
 * `getMaintenanceLogs` di atas) -- dipakai notifikasi proaktif (rekomendasi
 * Bagian 5-C #12, migrasi tidak diperlukan/tabel sudah ada) untuk mendeteksi
 * tren biaya maintenance naik per alat, dibanding 90 hari sebelumnya.
 */
export async function getAllMaintenanceLogs(): Promise<MaintenanceLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_maintenance_logs")
    .select("*")
    .order("tanggal", { ascending: false })
    .returns<MaintenanceLogRow[]>();

  if (error) {
    console.error("[magnarent] getAllMaintenanceLogs gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToMaintenanceLog);
}

export async function addMaintenanceLog(
  itemId: string,
  input: { tanggal: string; jenis: MaintenanceJenis; keterangan?: string; biaya: number }
): Promise<MutationResult> {
  if (!input.tanggal) return { ok: false, error: "Tanggal wajib diisi." };
  if (!Number.isFinite(input.biaya) || input.biaya < 0) {
    return { ok: false, error: "Biaya tidak valid." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("magnarent_maintenance_logs").insert({
    item_id: itemId,
    tanggal: input.tanggal,
    jenis: input.jenis,
    keterangan: input.keterangan?.trim() || null,
    biaya: input.biaya,
    created_by: user?.id ?? null,
  });

  if (error) {
    console.error("[magnarent] addMaintenanceLog gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(INVENTORY_PATH);
  void logActivity({ module: "magnarent", action: "create", entityType: "servis alat", entityLabel: input.jenis });
  return { ok: true };
}

export async function deleteMaintenanceLog(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_maintenance_logs").delete().eq("id", id);
  if (error) {
    console.error("[magnarent] deleteMaintenanceLog gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(INVENTORY_PATH);
  return { ok: true };
}


/**
 * Unit individual per alat + kode untuk QR (Gap #2/#3 analisis Magnarent) —
 * banyak baris per alat, TIDAK dipakai untuk hitung kapasitas booking (itu
 * tetap murni berbasis JUMLAH di magnarent_inventory.total_unit/availability.ts).
 * Ini murni lapisan identifikasi fisik: staf gudang scan QR untuk tahu unit
 * mana yang mana & status kasarnya, dibuka dari InventoryManager.tsx.
 */
export async function getInventoryUnits(itemId: string): Promise<InventoryUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_inventory_units")
    .select("*")
    .eq("item_id", itemId)
    .order("kode_unit", { ascending: true })
    .returns<InventoryUnitRow[]>();

  if (error) {
    console.error("[magnarent] getInventoryUnits gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToInventoryUnit);
}

export async function addInventoryUnit(
  itemId: string,
  input: { kodeUnit: string; status: InventoryUnitStatus; catatan?: string; rfidTag?: string; warehouseId?: string }
): Promise<MutationResult> {
  if (!input.kodeUnit?.trim()) return { ok: false, error: "Kode unit wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_inventory_units").insert({
    item_id: itemId,
    kode_unit: input.kodeUnit.trim(),
    status: input.status,
    catatan: input.catatan?.trim() || null,
    rfid_tag: input.rfidTag?.trim() || null,
    warehouse_id: input.warehouseId || null,
  });

  if (error) {
    if (error.message.includes("duplicate key")) {
      return { ok: false, error: "Kode unit atau tag RFID ini sudah dipakai." };
    }
    console.error("[magnarent] addInventoryUnit gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(INVENTORY_PATH);
  void logActivity({ module: "magnarent", action: "create", entityType: "unit alat", entityLabel: input.kodeUnit });
  return { ok: true };
}

export async function updateInventoryUnit(
  id: string,
  input: { kodeUnit: string; status: InventoryUnitStatus; catatan?: string; rfidTag?: string; warehouseId?: string }
): Promise<MutationResult> {
  if (!input.kodeUnit?.trim()) return { ok: false, error: "Kode unit wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("magnarent_inventory_units")
    .update({
      kode_unit: input.kodeUnit.trim(),
      status: input.status,
      catatan: input.catatan?.trim() || null,
      rfid_tag: input.rfidTag?.trim() || null,
      warehouse_id: input.warehouseId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (error.message.includes("duplicate key")) {
      return { ok: false, error: "Kode unit atau tag RFID ini sudah dipakai." };
    }
    console.error("[magnarent] updateInventoryUnit gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(INVENTORY_PATH);
  return { ok: true };
}

/**
 * Bulk-scan gudang (pelengkap QR per-unit, laporan Bagian 5-C #17) — staf
 * scan/tempel banyak kode sekaligus (kode_unit ATAU rfid_tag, dua-duanya
 * dicoba) lalu satu aksi update status semua unit yang cocok, dipakai saat
 * bongkar/pasang alat event besar biar tidak perlu buka form satu-satu.
 * Lintas semua alat (bukan cuma satu item), makanya createClient tanpa filter item_id.
 */
export async function bulkScanUpdateStatus(
  codes: string[],
  status: InventoryUnitStatus
): Promise<{ ok: true; matchedCount: number; notFound: string[]; ambiguous: string[] } | { ok: false; error: string }> {
  const cleaned = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean)));
  if (cleaned.length === 0) return { ok: false, error: "Tidak ada kode yang bisa diproses." };

  const supabase = await createClient();
  const { data: matches, error: findError } = await supabase
    .from("magnarent_inventory_units")
    .select("id, kode_unit, rfid_tag")
    .or(`kode_unit.in.(${cleaned.map((c) => `"${c}"`).join(",")}),rfid_tag.in.(${cleaned.map((c) => `"${c}"`).join(",")})`)
    .returns<{ id: string; kode_unit: string; rfid_tag: string | null }[]>();

  if (findError) {
    console.error("[magnarent] bulkScanUpdateStatus (find) gagal:", findError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // kode_unit hanya unik PER ALAT (mis. "Kursi Chiavari Putih" & "Pink"
  // sama-sama punya KCP-01). Kode yang cocok ke lebih dari satu unit
  // DILEWATI dan dilaporkan, supaya unit alat lain yang masih di gudang tidak
  // ikut berubah status.
  const matchedRows = matches ?? [];
  const rowsByCode = new Map<string, string[]>();
  for (const code of cleaned) {
    const lower = code.toLowerCase();
    const ids = matchedRows
      .filter((m) => m.kode_unit.toLowerCase() === lower || m.rfid_tag?.toLowerCase() === lower)
      .map((m) => m.id);
    rowsByCode.set(code, ids);
  }
  const notFound = cleaned.filter((c) => (rowsByCode.get(c) ?? []).length === 0);
  const ambiguous = cleaned.filter((c) => (rowsByCode.get(c) ?? []).length > 1);
  const matchedIds = Array.from(
    new Set(cleaned.filter((c) => (rowsByCode.get(c) ?? []).length === 1).flatMap((c) => rowsByCode.get(c) ?? []))
  );

  if (matchedIds.length > 0) {
    const { error: updateError } = await supabase
      .from("magnarent_inventory_units")
      .update({ status, updated_at: new Date().toISOString() })
      .in("id", matchedIds);

    if (updateError) {
      console.error("[magnarent] bulkScanUpdateStatus (update) gagal:", updateError.message);
      return { ok: false, error: GENERIC_ERROR };
    }
  }

  revalidatePath(INVENTORY_PATH);
  void logActivity({
    module: "magnarent",
    action: "update",
    entityType: "bulk scan unit",
    entityLabel: `${matchedIds.length} unit → ${status}`,
  });
  return { ok: true, matchedCount: matchedIds.length, notFound, ambiguous };
}

export async function deleteInventoryUnit(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_inventory_units").delete().eq("id", id);
  if (error) {
    console.error("[magnarent] deleteInventoryUnit gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(INVENTORY_PATH);
  return { ok: true };
}

/**
 * Penjadwalan pengiriman/pengambilan (Gap #7 analisis Magnarent) — satu
 * baris per (booking, stage), di-upsert lewat unique(booking_id, stage) di
 * migrasi 0061, dibuka dari BookingScheduler.tsx.
 */
export async function getDeliveries(bookingId: string): Promise<Delivery[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_deliveries")
    .select("*")
    .eq("booking_id", bookingId)
    .returns<DeliveryRow[]>();

  if (error) {
    console.error("[magnarent] getDeliveries gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToDelivery);
}

export async function saveDelivery(
  bookingId: string,
  stage: DeliveryStage,
  input: { driverName?: string; jadwalTanggal?: string; jadwalJam?: string; status: DeliveryStatus; catatan?: string }
): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_deliveries").upsert(
    {
      booking_id: bookingId,
      stage,
      driver_name: input.driverName?.trim() || null,
      jadwal_tanggal: input.jadwalTanggal || null,
      jadwal_jam: input.jadwalJam || null,
      status: input.status,
      catatan: input.catatan?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "booking_id,stage" }
  );

  if (error) {
    console.error("[magnarent] saveDelivery gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Live location dispatch berbasis browser geolocation (Gap laporan Bagian
 * 5-C) -- pelengkap ringan buat penjadwalan pengiriman/pengambilan di
 * atas, BUKAN app terpisah buat sopir. Staf buat/ambil link lewat
 * `getOrCreateTrackingLink` (RLS staf biasa), sopir buka link itu di HP
 * (halaman publik `/lacak/[token]`) lalu browser kirim lat/lng berkala
 * lewat `getDeliveryTrackingInfo` + `submitDriverLocation` pakai
 * `createAdminClient` (bypass RLS) -- sama pola dengan check-in QR
 * Magnativ, sopir TIDAK perlu login.
 */
export async function getOrCreateTrackingLink(deliveryId: string): Promise<MutationResult & { token?: string }> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("magnarent_deliveries")
    .select("tracking_token")
    .eq("id", deliveryId)
    .maybeSingle<{ tracking_token: string | null }>();

  if (fetchError) {
    console.error("[magnarent] getOrCreateTrackingLink (fetch) gagal:", fetchError.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (existing?.tracking_token) return { ok: true, token: existing.tracking_token };

  const token = randomBytes(20).toString("hex");
  const { error } = await supabase
    .from("magnarent_deliveries")
    .update({ tracking_token: token })
    .eq("id", deliveryId);

  if (error) {
    console.error("[magnarent] getOrCreateTrackingLink (update) gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  return { ok: true, token };
}

export type DeliveryTrackingInfo = { clientName: string; stage: DeliveryStage } | null;

export async function getDeliveryTrackingInfo(token: string): Promise<DeliveryTrackingInfo> {
  const admin = createAdminClient();
  const { data: delivery } = await admin
    .from("magnarent_deliveries")
    .select("booking_id, stage")
    .eq("tracking_token", token)
    .maybeSingle<{ booking_id: string; stage: DeliveryStage }>();

  if (!delivery) return null;

  const { data: booking } = await admin
    .from("magnarent_bookings")
    .select("nama_klien")
    .eq("id", delivery.booking_id)
    .maybeSingle<{ nama_klien: string }>();

  if (!booking) return null;
  return { clientName: booking.nama_klien, stage: delivery.stage };
}

export async function submitDriverLocation(token: string, lat: number, lng: number): Promise<MutationResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Koordinat tidak valid." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("magnarent_deliveries")
    .update({ last_lat: lat, last_lng: lng, last_location_at: new Date().toISOString() })
    .eq("tracking_token", token);

  if (error) {
    console.error("[magnarent] submitDriverLocation gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Galeri Kategori Alat — model folder/album, meniru fungsi-fungsi
 * portofolio di `src/lib/magnative/actions.ts` (migrasi 0057). Satu folder
 * = satu kategori alat (mis. "Tenda & Struktur"), bisa diisi banyak foto
 * sekaligus. Menggantikan `PlaceholderGallery` statis yang tadinya
 * nangkring di halaman Inventaris — lihat `getGalleryFolders` di
 * `gallery-data.ts` untuk query baca gabungan folder+foto.
 */
function extractGalleryFiles(formData: FormData): File[] {
  return formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

async function uploadGalleryPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  files: File[]
): Promise<{ ok: true; storagePaths: string[] } | { ok: false; error: string; uploadedPaths: string[] }> {
  const uploadedPaths: string[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "Semua file yang dipilih harus berupa gambar.", uploadedPaths };
    }
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
    const storagePath = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(GALLERY_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined });

    if (uploadError) {
      console.error("[magnarent] Upload foto galeri gagal:", uploadError.message);
      return { ok: false, error: GENERIC_ERROR, uploadedPaths };
    }
    uploadedPaths.push(storagePath);
  }

  return { ok: true, storagePaths: uploadedPaths };
}

export async function createGalleryFolder(formData: FormData): Promise<MutationResult> {
  const supabase = await createClient();
  const title = String(formData.get("title") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim();
  const files = extractGalleryFiles(formData);

  if (!title) return { ok: false, error: "Nama kategori wajib diisi." };
  if (files.length === 0) return { ok: false, error: "Pilih minimal satu foto terlebih dahulu." };

  const uploadResult = await uploadGalleryPhotos(supabase, files);
  if (!uploadResult.ok) {
    if (uploadResult.uploadedPaths.length > 0) {
      await supabase.storage.from(GALLERY_BUCKET).remove(uploadResult.uploadedPaths);
    }
    return { ok: false, error: uploadResult.error };
  }

  const { data: folderRow, error: folderError } = await supabase
    .from("magnarent_gallery_folders")
    .insert({ title, caption: caption || null })
    .select("id")
    .single();

  if (folderError || !folderRow) {
    console.error("[magnarent] Buat folder galeri gagal:", folderError?.message);
    await supabase.storage.from(GALLERY_BUCKET).remove(uploadResult.storagePaths);
    return { ok: false, error: GENERIC_ERROR };
  }

  const photoRows = uploadResult.storagePaths.map((storagePath, index) => ({
    folder_id: folderRow.id,
    storage_path: storagePath,
    photo_url: supabase.storage.from(GALLERY_BUCKET).getPublicUrl(storagePath).data.publicUrl,
    position: index,
  }));

  const { error: insertError } = await supabase.from("magnarent_gallery_photos").insert(photoRows);
  if (insertError) {
    console.error("[magnarent] Simpan data foto galeri gagal:", insertError.message);
    await supabase.storage.from(GALLERY_BUCKET).remove(uploadResult.storagePaths);
    await supabase.from("magnarent_gallery_folders").delete().eq("id", folderRow.id);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(GALLERY_PATH);
  void logActivity({ module: "magnarent", action: "create", entityType: "galeri kategori", entityLabel: title });
  return { ok: true };
}

export async function addPhotosToGalleryFolder(folderId: string, formData: FormData): Promise<MutationResult> {
  const supabase = await createClient();
  const files = extractGalleryFiles(formData);
  if (files.length === 0) return { ok: false, error: "Pilih minimal satu foto terlebih dahulu." };

  const { data: lastPhoto } = await supabase
    .from("magnarent_gallery_photos")
    .select("position")
    .eq("folder_id", folderId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();

  const uploadResult = await uploadGalleryPhotos(supabase, files);
  if (!uploadResult.ok) {
    if (uploadResult.uploadedPaths.length > 0) {
      await supabase.storage.from(GALLERY_BUCKET).remove(uploadResult.uploadedPaths);
    }
    return { ok: false, error: uploadResult.error };
  }

  const startPosition = (lastPhoto?.position ?? -1) + 1;
  const photoRows = uploadResult.storagePaths.map((storagePath, index) => ({
    folder_id: folderId,
    storage_path: storagePath,
    photo_url: supabase.storage.from(GALLERY_BUCKET).getPublicUrl(storagePath).data.publicUrl,
    position: startPosition + index,
  }));

  const { error: insertError } = await supabase.from("magnarent_gallery_photos").insert(photoRows);
  if (insertError) {
    console.error("[magnarent] Tambah foto ke folder galeri gagal:", insertError.message);
    await supabase.storage.from(GALLERY_BUCKET).remove(uploadResult.storagePaths);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(GALLERY_PATH);
  void logActivity({
    module: "magnarent",
    action: "update",
    entityType: "galeri kategori",
    entityLabel: `+${files.length} foto`,
  });
  return { ok: true };
}

export async function updateGalleryFolder(
  id: string,
  input: { title: string; caption?: string }
): Promise<MutationResult> {
  const supabase = await createClient();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Nama kategori wajib diisi." };

  const { error } = await supabase
    .from("magnarent_gallery_folders")
    .update({ title, caption: input.caption?.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[magnarent] updateGalleryFolder gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(GALLERY_PATH);
  void logActivity({ module: "magnarent", action: "update", entityType: "galeri kategori", entityLabel: title });
  return { ok: true };
}

/** Hapus satu foto DI DALAM folder (folder & foto lainnya tetap ada) - lihat `deleteGalleryFolder` untuk hapus seluruh folder sekaligus. */
export async function deleteGalleryPhoto(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: photoRow } = await supabase
    .from("magnarent_gallery_photos")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("magnarent_gallery_photos").delete().eq("id", id);
  if (error) {
    console.error("[magnarent] deleteGalleryPhoto gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (photoRow?.storage_path) {
    await supabase.storage.from(GALLERY_BUCKET).remove([photoRow.storage_path]);
  }
  revalidatePath(GALLERY_PATH);
  void logActivity({ module: "magnarent", action: "delete", entityType: "galeri kategori" });
  return { ok: true };
}

/**
 * Hapus seluruh folder sekaligus semua fotonya — baris `magnarent_gallery_photos`
 * ikut terhapus otomatis lewat `on delete cascade`, tapi file di Supabase
 * Storage TIDAK ikut terhapus otomatis oleh cascade itu (cascade cuma
 * untuk baris database) - path-nya makanya diambil dulu di sini sebelum
 * folder (dan foto-fotonya) dihapus.
 */
export async function deleteGalleryFolder(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: folderRow } = await supabase.from("magnarent_gallery_folders").select("title").eq("id", id).maybeSingle();
  const { data: photoRows } = await supabase.from("magnarent_gallery_photos").select("storage_path").eq("folder_id", id);

  const { error } = await supabase.from("magnarent_gallery_folders").delete().eq("id", id);
  if (error) {
    console.error("[magnarent] deleteGalleryFolder gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const storagePaths = (photoRows ?? []).map((row) => row.storage_path).filter(Boolean);
  if (storagePaths.length > 0) {
    await supabase.storage.from(GALLERY_BUCKET).remove(storagePaths);
  }
  revalidatePath(GALLERY_PATH);
  void logActivity({ module: "magnarent", action: "delete", entityType: "galeri kategori", entityLabel: folderRow?.title });
  return { ok: true };
}

/**
 * Pricing dinamis musiman (rekomendasi Bagian 5-C #16, migrasi 0069) --
 * lihat komentar `SeasonalPricingRule` di extras-types.ts. `itemId`
 * undefined saat dibuat = berlaku untuk semua alat.
 */
export async function listSeasonalPricingRules(): Promise<SeasonalPricingRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_seasonal_pricing_rules")
    .select("*")
    .order("start_date", { ascending: true })
    .returns<SeasonalPricingRuleRow[]>();

  if (error) {
    console.error("[magnarent] listSeasonalPricingRules gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToSeasonalPricingRule);
}

export async function addSeasonalPricingRule(input: {
  itemId?: string;
  label: string;
  startDate: string;
  endDate: string;
  multiplierPct: number;
}): Promise<MutationResult> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Label musim wajib diisi." };
  if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
    return { ok: false, error: "Rentang tanggal tidak valid." };
  }
  if (!Number.isFinite(input.multiplierPct)) return { ok: false, error: "Persen penyesuaian tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_seasonal_pricing_rules").insert({
    item_id: input.itemId || null,
    label,
    start_date: input.startDate,
    end_date: input.endDate,
    multiplier_pct: Math.round(input.multiplierPct),
  });

  if (error) {
    console.error("[magnarent] addSeasonalPricingRule gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(INVENTORY_PATH);
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function deleteSeasonalPricingRule(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_seasonal_pricing_rules").delete().eq("id", id);
  if (error) {
    console.error("[magnarent] deleteSeasonalPricingRule gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(INVENTORY_PATH);
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Crew/labor scheduling terintegrasi booking alat (Gap laporan Bagian
 * 5-C, migrasi 0072) -- staf tambah nama kru + peran per booking lewat
 * `addCrewAssignment`, dan bisa cek bentrok jadwal lewat
 * `findCrewConflicts` SEBELUM menyimpan (heuristik overlap tanggal murni,
 * BUKAN AI) -- dibuka dari CrewAssignmentModal.tsx di BookingScheduler.
 */
export async function getCrewAssignments(bookingId: string): Promise<CrewAssignment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_crew_assignments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true })
    .returns<CrewAssignmentRow[]>();

  if (error) {
    console.error("[magnarent] getCrewAssignments gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToCrewAssignment);
}

export async function addCrewAssignment(
  bookingId: string,
  input: { crewName: string; role: CrewRole; catatan?: string }
): Promise<MutationResult> {
  if (!input.crewName?.trim()) return { ok: false, error: "Nama kru wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_crew_assignments").insert({
    booking_id: bookingId,
    crew_name: input.crewName.trim(),
    role: input.role,
    catatan: input.catatan?.trim() || null,
  });

  if (error) {
    console.error("[magnarent] addCrewAssignment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnarent", action: "create", entityType: "penugasan kru", entityLabel: input.crewName });
  return { ok: true };
}

export async function deleteCrewAssignment(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_crew_assignments").delete().eq("id", id);
  if (error) {
    console.error("[magnarent] deleteCrewAssignment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Cek bentrok jadwal kru: cari nama kru yang sama di booking LAIN yang
 * rentang tanggalnya tumpang tindih dengan booking ini -- dua query
 * (kru dulu, baru booking-nya) daripada join langsung supaya tidak
 * bergantung nama relasi FK Supabase yang belum tentu terdeteksi.
 */
export async function findCrewConflicts(bookingId: string, crewName: string): Promise<CrewConflict[]> {
  if (!crewName?.trim()) return [];
  const supabase = await createClient();

  const { data: thisBooking } = await supabase
    .from("magnarent_bookings")
    .select("tanggal_mulai, tanggal_selesai")
    .eq("id", bookingId)
    .maybeSingle<{ tanggal_mulai: string; tanggal_selesai: string }>();
  if (!thisBooking) return [];

  const { data: crewRows, error } = await supabase
    .from("magnarent_crew_assignments")
    .select("booking_id, role")
    .ilike("crew_name", crewName.trim())
    .neq("booking_id", bookingId)
    .returns<{ booking_id: string; role: CrewRole }[]>();

  if (error || !crewRows || crewRows.length === 0) return [];

  const otherBookingIds = Array.from(new Set(crewRows.map((r) => r.booking_id)));
  const { data: bookings } = await supabase
    .from("magnarent_bookings")
    .select("id, nama_klien, tanggal_mulai, tanggal_selesai")
    .in("id", otherBookingIds)
    .returns<{ id: string; nama_klien: string; tanggal_mulai: string; tanggal_selesai: string }[]>();

  const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));
  const conflicts: CrewConflict[] = [];
  for (const row of crewRows) {
    const b = bookingById.get(row.booking_id);
    if (!b) continue;
    if (dateRangesOverlap(thisBooking.tanggal_mulai, thisBooking.tanggal_selesai, b.tanggal_mulai, b.tanggal_selesai)) {
      conflicts.push({
        bookingId: b.id,
        namaKlien: b.nama_klien,
        tanggalMulai: b.tanggal_mulai,
        tanggalSelesai: b.tanggal_selesai,
        role: row.role,
      });
    }
  }
  return conflicts;
}

const WAREHOUSE_PATH = INVENTORY_PATH;

/**
 * Manajemen gudang bernama (Gap #9/analisis-kompetitor #15, migrasi 0073)
 * -- daftar gudang fisik dipakai sebagai pilihan lokasi per-unit alat &
 * tujuan transfer, terpisah dari `magnarent_inventory` (jenis alat).
 */
export async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_warehouses")
    .select("*")
    .order("nama", { ascending: true })
    .returns<WarehouseRow[]>();

  if (error) {
    console.error("[magnarent] getWarehouses gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToWarehouse);
}

export async function addWarehouse(input: { nama: string; alamat?: string; catatan?: string }): Promise<MutationResult> {
  if (!input.nama?.trim()) return { ok: false, error: "Nama gudang wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_warehouses").insert({
    nama: input.nama.trim(),
    alamat: input.alamat?.trim() || null,
    catatan: input.catatan?.trim() || null,
  });

  if (error) {
    if (error.message.includes("duplicate key")) {
      return { ok: false, error: "Nama gudang ini sudah dipakai." };
    }
    console.error("[magnarent] addWarehouse gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(WAREHOUSE_PATH);
  void logActivity({ module: "magnarent", action: "create", entityType: "gudang", entityLabel: input.nama });
  return { ok: true };
}

export async function updateWarehouse(
  id: string,
  input: { nama: string; alamat?: string; catatan?: string }
): Promise<MutationResult> {
  if (!input.nama?.trim()) return { ok: false, error: "Nama gudang wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("magnarent_warehouses")
    .update({ nama: input.nama.trim(), alamat: input.alamat?.trim() || null, catatan: input.catatan?.trim() || null })
    .eq("id", id);

  if (error) {
    if (error.message.includes("duplicate key")) {
      return { ok: false, error: "Nama gudang ini sudah dipakai." };
    }
    console.error("[magnarent] updateWarehouse gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(WAREHOUSE_PATH);
  return { ok: true };
}

export async function deleteWarehouse(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_warehouses").delete().eq("id", id);

  if (error) {
    console.error("[magnarent] deleteWarehouse gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(WAREHOUSE_PATH);
  return { ok: true };
}

/**
 * Pindahkan satu unit fisik ke gudang lain + catat log transfer -- beda
 * dari sekadar `updateInventoryUnit` set warehouseId (itu buat penempatan
 * awal/koreksi data tanpa histori); ini SELALU menulis baris log supaya
 * jejak "unit X pernah di gudang mana saja" bisa ditelusuri.
 */
export async function transferUnitToWarehouse(
  unitId: string,
  toWarehouseId: string,
  catatan?: string
): Promise<MutationResult> {
  const supabase = await createClient();

  const { data: unit, error: findError } = await supabase
    .from("magnarent_inventory_units")
    .select("warehouse_id")
    .eq("id", unitId)
    .maybeSingle<{ warehouse_id: string | null }>();

  if (findError || !unit) {
    console.error("[magnarent] transferUnitToWarehouse (find) gagal:", findError?.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const { error: updateError } = await supabase
    .from("magnarent_inventory_units")
    .update({ warehouse_id: toWarehouseId, updated_at: new Date().toISOString() })
    .eq("id", unitId);

  if (updateError) {
    console.error("[magnarent] transferUnitToWarehouse (update) gagal:", updateError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const { error: logError } = await supabase.from("magnarent_warehouse_transfers").insert({
    unit_id: unitId,
    from_warehouse_id: unit.warehouse_id,
    to_warehouse_id: toWarehouseId,
    catatan: catatan?.trim() || null,
  });
  if (logError) {
    console.error("[magnarent] transferUnitToWarehouse (log) gagal:", logError.message);
  }

  revalidatePath(INVENTORY_PATH);
  void logActivity({ module: "magnarent", action: "update", entityType: "transfer gudang", entityLabel: "1 unit alat" });
  return { ok: true };
}

export async function getWarehouseTransfers(unitId: string): Promise<WarehouseTransfer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_warehouse_transfers")
    .select("*")
    .eq("unit_id", unitId)
    .order("transferred_at", { ascending: false })
    .returns<WarehouseTransferRow[]>();

  if (error) {
    console.error("[magnarent] getWarehouseTransfers gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToWarehouseTransfer);
}

/**
 * Subrent tracking (analisis-kompetitor #15, migrasi 0073) -- catat alat
 * yang dipinjam dari vendor luar buat menutupi kekurangan stok in-house
 * saat fulfillment booking. `bookingId` opsional: bisa dicatat lepas dari
 * booking tertentu (mis. nambah stok umum sementara jelang musim ramai).
 */
export async function getSubrentRecords(bookingId: string): Promise<SubrentRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_subrent_records")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .returns<SubrentRecordRow[]>();

  if (error) {
    console.error("[magnarent] getSubrentRecords gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToSubrentRecord);
}

export async function getAllSubrentRecords(): Promise<SubrentRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnarent_subrent_records")
    .select("*")
    .order("tanggal_mulai", { ascending: false })
    .returns<SubrentRecordRow[]>();

  if (error) {
    console.error("[magnarent] getAllSubrentRecords gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToSubrentRecord);
}

export async function addSubrentRecord(input: {
  bookingId?: string;
  itemId?: string;
  vendorName: string;
  jumlahUnit: number;
  hargaSewaTotal?: number;
  tanggalMulai: string;
  tanggalSelesai: string;
  catatan?: string;
}): Promise<MutationResult> {
  if (!input.vendorName?.trim()) return { ok: false, error: "Nama vendor wajib diisi." };
  if (!input.tanggalMulai || !input.tanggalSelesai) return { ok: false, error: "Tanggal mulai & selesai wajib diisi." };
  if (input.tanggalMulai > input.tanggalSelesai) return { ok: false, error: "Tanggal mulai tidak boleh setelah tanggal selesai." };
  if (!input.jumlahUnit || input.jumlahUnit < 1) return { ok: false, error: "Jumlah unit minimal 1." };

  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_subrent_records").insert({
    booking_id: input.bookingId || null,
    item_id: input.itemId || null,
    vendor_name: input.vendorName.trim(),
    jumlah_unit: input.jumlahUnit,
    harga_sewa_total: input.hargaSewaTotal ?? null,
    tanggal_mulai: input.tanggalMulai,
    tanggal_selesai: input.tanggalSelesai,
    catatan: input.catatan?.trim() || null,
  });

  if (error) {
    console.error("[magnarent] addSubrentRecord gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnarent", action: "create", entityType: "subrent alat", entityLabel: input.vendorName });
  return { ok: true };
}

export async function updateSubrentStatus(id: string, status: SubrentStatus): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_subrent_records").update({ status }).eq("id", id);

  if (error) {
    console.error("[magnarent] updateSubrentStatus gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function deleteSubrentRecord(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnarent_subrent_records").delete().eq("id", id);

  if (error) {
    console.error("[magnarent] deleteSubrentRecord gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  return { ok: true };
}
