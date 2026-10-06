"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyDivision } from "@/lib/push/notify";
import { logActivity } from "@/lib/activity/log";
import { ACTIVE_BOOTH_STATUSES, findMaterialConflicts, type MaterialConflict } from "./availability";
import { rowToBoothProject, rowToMaterial, type BoothProjectRow, type MaterialRow } from "./mappers";
import type { BoothStatus, MaterialItem, MaterialUsage, PaymentStatus, PurchaseOrder } from "./types";
import { exceedsDbAmount, MAX_DB_AMOUNT_MESSAGE } from "@/lib/shared/utils";

const MODULE_PATH = "/dashboard/production";
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Pola sama persis dengan `src/lib/magnarent/actions.ts`: tulis ke Supabase
 * lalu `revalidatePath` — Next.js otomatis mengambil ulang data di
 * `src/app/dashboard/production/layout.tsx` dan mengirim props baru ke
 * `ProductionDataProvider`. RLS (migrasi 0006) sudah membatasi baris yang
 * kebaca/tertulis cuma milik divisi Production/akses penuh.
 */
/** Divalidasi ulang di server — form di UI sudah punya `required`/`min`, tapi Server Action ini bisa dipanggil langsung sebagai fungsi. */
function validateMaterialInput(input: Omit<MaterialItem, "id">): string | null {
  if (!input.name?.trim() || !input.location?.trim()) {
    return "Nama dan lokasi material wajib diisi.";
  }
  if (!Number.isInteger(input.stock) || input.stock < 0) {
    return "Stok tidak boleh negatif.";
  }
  if (!Number.isInteger(input.minStock) || input.minStock < 0) {
    return "Stok minimum tidak boleh negatif.";
  }
  if (!Number.isFinite(input.pricePerUnit) || input.pricePerUnit < 0) {
    return "Harga per unit tidak valid.";
  }
  return null;
}

export async function addMaterial(input: Omit<MaterialItem, "id">): Promise<MutationResult> {
  const validationError = validateMaterialInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("production_materials").insert({
    name: input.name,
    category: input.category,
    unit: input.unit,
    location: input.location,
    stock: input.stock,
    min_stock: input.minStock,
    price_per_unit: input.pricePerUnit,
  });

  if (error) {
    console.error("[production] addMaterial gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "production", action: "create", entityType: "material", entityLabel: input.name });

  // Tahap 35: material baru ditambahkan (bukan cuma alarm "stok menipis")
  // juga diberi tahu ke tim Production (+ akses penuh) — item baru masuk
  // gudang termasuk "input baru" yang ingin diketahui Owner.
  const {
    data: { user: materialCreator },
  } = await supabase.auth.getUser();
  void notifyDivision(
    "production",
    {
      title: "Material Baru — Production",
      body: `${input.name} (${input.category}) ditambahkan ke gudang, stok awal ${input.stock}.`,
      url: "/dashboard/production/material",
    },
    materialCreator?.id
  );

  await notifyLowStockIfNeeded(supabase, input.name, input.stock, input.minStock);
  return { ok: true };
}

/**
 * `expectedStock` = stok yang tampil saat form edit dibuka. Update bersyarat
 * pada nilai itu: kalau sementara itu stok berubah (penerimaan PO, transfer
 * gudang oleh staf lain), simpan DITOLAK -- dulu angka lama dari halaman
 * menimpa stok terbaru dan barang yang baru diterima "hilang" tanpa jejak.
 */
export async function updateMaterial(
  id: string,
  input: Omit<MaterialItem, "id">,
  expectedStock?: number
): Promise<MutationResult> {
  const validationError = validateMaterialInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  let query = supabase
    .from("production_materials")
    .update({
      name: input.name,
      category: input.category,
      unit: input.unit,
      location: input.location,
      stock: input.stock,
      min_stock: input.minStock,
      price_per_unit: input.pricePerUnit,
    })
    .eq("id", id);
  if (expectedStock !== undefined) query = query.eq("stock", expectedStock);
  const { data: updated, error } = await query.select("id");

  if (error) {
    console.error("[production] updateMaterial gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error:
        "Stok material ini sudah berubah sejak halaman dibuka (mis. ada penerimaan PO atau transfer gudang). Muat ulang halaman, lalu ulangi perubahan.",
    };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "production", action: "update", entityType: "material", entityLabel: input.name });
  await notifyLowStockIfNeeded(supabase, input.name, input.stock, input.minStock);
  return { ok: true };
}

/**
 * Dipanggil setelah tambah/ubah material — kalau stok sudah di titik minimum
 * atau di bawahnya, kirim satu notifikasi ke tim Production (+ akses penuh).
 * Tidak di-`await` oleh pemanggil (dipanggil dengan `await` di sini tapi
 * `notifyDivision` sendiri tidak melempar error) supaya kegagalan kirim
 * notifikasi tidak pernah membatalkan aksi simpan material yang sudah sukses.
 */
async function notifyLowStockIfNeeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  materialName: string,
  stock: number,
  minStock: number
): Promise<void> {
  if (stock > minStock) return;
  const {
    data: { user: materialActor },
  } = await supabase.auth.getUser();
  void notifyDivision(
    "production",
    {
      title: "Stok Menipis — Production",
      body: `Stok "${materialName}" tersisa ${stock}, sudah di titik minimum (${minStock}).`,
      url: "/dashboard/production/gudang",
    },
    materialActor?.id
  );
}

export async function deleteMaterial(id: string): Promise<MutationResult> {
  const supabase = await createClient();

  // Cegah hapus material yang masih dialokasikan ke proyek booth AKTIF —
  // dulu cuma dicek di UI (getActiveProjectsForMaterial); ditegakkan ulang
  // di sini supaya tidak bisa dilewati dengan memanggil action ini langsung.
  // `materials` disimpan sebagai jsonb array, jadi dicek pakai containment
  // operator `@>` — cukup mengandung objek dengan materialId ini.
  const { data: activeRows, error: activeError } = await supabase
    .from("production_booth_projects")
    .select("id, status, materials")
    .in("status", ACTIVE_BOOTH_STATUSES)
    .returns<Pick<BoothProjectRow, "id" | "status" | "materials">[]>();

  if (activeError) {
    console.error("[production] Cek proyek aktif sebelum hapus material gagal:", activeError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const stillUsed = (activeRows ?? []).some((p) =>
    (p.materials ?? []).some((m: MaterialUsage) => m.materialId === id)
  );
  if (stillUsed) {
    return { ok: false, error: "Material masih dialokasikan ke proyek booth aktif, tidak bisa dihapus." };
  }

  const { data: materialRow } = await supabase.from("production_materials").select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from("production_materials").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteMaterial gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "production", action: "delete", entityType: "material", entityLabel: materialRow?.name });
  return { ok: true };
}

export type NewBoothProjectInput = {
  name: string;
  clientId?: string;
  namaKlien: string;
  lokasiAcara: string;
  status: BoothStatus;
  tanggalMulai: string;
  tanggalInstalasi: string;
  /** Estimasi tanggal bongkar (dismantle) — dipakai forecast reuse material ke depan. Migrasi 0077. */
  tanggalBongkarEstimasi?: string;
  budget: number;
  statusPembayaran: PaymentStatus;
  /** Nominal DP yang sudah diterima — lihat migrasi 0015. */
  dpAmount?: number;
  materials: MaterialUsage[];
  catatan?: string;
};

export type SaveBoothProjectResult =
  | { ok: true }
  | { ok: false; conflicts: MaterialConflict[] }
  | { ok: false; error: string };

/** Ambil ulang material + proyek terkini dari DB lalu pakai ulang logika cek stok yang sama persis (src/lib/production/availability.ts) — aturan bisnisnya tidak berubah, cuma sumber datanya sekarang Supabase. */
async function checkMaterialAvailability(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requested: MaterialUsage[],
  excludeProjectId?: string
): Promise<MaterialConflict[] | { error: string }> {
  const [materialsResult, projectsResult] = await Promise.all([
    supabase.from("production_materials").select("*").returns<MaterialRow[]>(),
    supabase
      .from("production_booth_projects")
      .select("*")
      .in("status", ACTIVE_BOOTH_STATUSES)
      .returns<BoothProjectRow[]>(),
  ]);

  if (materialsResult.error) {
    console.error("[production] Ambil data material gagal:", materialsResult.error.message);
    return { error: GENERIC_ERROR };
  }
  if (projectsResult.error) {
    console.error("[production] Ambil data proyek gagal:", projectsResult.error.message);
    return { error: GENERIC_ERROR };
  }

  const materials = (materialsResult.data ?? []).map(rowToMaterial);
  const projects = (projectsResult.data ?? []).map(rowToBoothProject);
  return findMaterialConflicts(requested, materials, projects, excludeProjectId);
}

/** Sama alasannya dengan `validateMaterialInput` — dicek ulang di server, bukan cuma diandalkan dari form. */
function validateBoothProjectInput(input: NewBoothProjectInput): string | null {
  if (!input.name?.trim() || !input.namaKlien?.trim() || !input.lokasiAcara?.trim()) {
    return "Nama proyek, nama klien, dan lokasi acara wajib diisi.";
  }
  if (!input.tanggalMulai || !input.tanggalInstalasi || input.tanggalMulai > input.tanggalInstalasi) {
    return "Tanggal instalasi tidak boleh sebelum tanggal mulai.";
  }
  if (!Number.isFinite(input.budget) || input.budget < 0) {
    return "Budget tidak boleh negatif.";
  }
  if (input.dpAmount !== undefined && (!Number.isFinite(input.dpAmount) || input.dpAmount < 0)) {
    return "Nominal DP tidak valid.";
  }
  if (exceedsDbAmount(input.budget, input.dpAmount)) return MAX_DB_AMOUNT_MESSAGE;
  for (const m of input.materials) {
    if (!Number.isInteger(m.qty) || m.qty <= 0) {
      return "Jumlah alokasi material harus bilangan bulat lebih dari 0.";
    }
  }
  return null;
}

export async function addProject(input: NewBoothProjectInput): Promise<SaveBoothProjectResult> {
  const validationError = validateBoothProjectInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();

  // Hanya alokasi proyek yang statusnya aktif yang benar-benar menahan
  // stok — proyek baru dengan status Selesai/Dibatalkan tidak perlu dicek.
  if (ACTIVE_BOOTH_STATUSES.includes(input.status)) {
    const conflicts = await checkMaterialAvailability(supabase, input.materials);
    if ("error" in conflicts) return { ok: false, error: conflicts.error };
    if (conflicts.length > 0) return { ok: false, conflicts };
  }

  // Pre-check di atas cuma untuk pesan konflik yang informatif — penulisan
  // sungguhan lewat RPC `save_booth_project_checked` (migrasi 0020) yang
  // menghitung ulang alokasi + insert dalam SATU transaksi terkunci per
  // material, supaya dua proyek yang rebutan material yang sama tidak bisa
  // lolos bersamaan (lihat komentar migrasinya untuk detail race condition-nya).
  const { error } = await supabase.rpc("save_booth_project_checked", {
    p_project_id: null,
    p_name: input.name,
    p_client_id: input.clientId ?? null,
    p_nama_klien: input.namaKlien,
    p_lokasi_acara: input.lokasiAcara,
    p_status: input.status,
    p_tanggal_mulai: input.tanggalMulai,
    p_tanggal_instalasi: input.tanggalInstalasi,
    p_budget: input.budget,
    p_status_pembayaran: input.statusPembayaran,
    // DP hanya bermakna untuk status "DP" -- nilai lama yang tertinggal saat
    // status diganti membuat piutang terhitung lebih kecil dari seharusnya.
    p_dp_amount: input.statusPembayaran === "DP" ? (input.dpAmount ?? 0) : 0,
    p_materials: input.materials,
    p_catatan: input.catatan ?? null,
    p_tanggal_bongkar_estimasi: input.tanggalBongkarEstimasi || null,
  });

  if (error) {
    if (error.message.startsWith("RACE_CONFLICT:")) {
      return { ok: false, error: error.message.replace("RACE_CONFLICT: ", "") };
    }
    console.error("[production] addProject gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);

  // Beri tahu tim Production (+ akun akses penuh) ada proyek booth baru —
  // tidak di-`await` supaya kegagalan kirim notifikasi tidak menahan respons.
  const {
    data: { user: boothActor },
  } = await supabase.auth.getUser();
  void notifyDivision(
    "production",
    {
      title: "Proyek Booth Baru — Production",
      body: `Proyek "${input.name}" untuk ${input.namaKlien} baru dibuat.`,
      url: "/dashboard/production/proyek",
    },
    boothActor?.id
  );
  void logActivity({
    module: "production",
    action: "create",
    entityType: "proyek booth",
    entityLabel: input.name,
    detail: input.namaKlien,
  });

  return { ok: true };
}

export async function updateProject(id: string, input: NewBoothProjectInput): Promise<SaveBoothProjectResult> {
  const validationError = validateBoothProjectInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();

  // Proyek ini sendiri dikecualikan dari perhitungan alokasinya
  // (excludeProjectId) supaya tidak "bentrok dengan dirinya sendiri".
  if (ACTIVE_BOOTH_STATUSES.includes(input.status)) {
    const conflicts = await checkMaterialAvailability(supabase, input.materials, id);
    if ("error" in conflicts) return { ok: false, error: conflicts.error };
    if (conflicts.length > 0) return { ok: false, conflicts };
  }

  // Sama seperti addProject — penulisan sungguhan lewat RPC terkunci
  // `save_booth_project_checked` (migrasi 0020), bukan UPDATE langsung.
  const { error } = await supabase.rpc("save_booth_project_checked", {
    p_project_id: id,
    p_name: input.name,
    p_client_id: input.clientId ?? null,
    p_nama_klien: input.namaKlien,
    p_lokasi_acara: input.lokasiAcara,
    p_status: input.status,
    p_tanggal_mulai: input.tanggalMulai,
    p_tanggal_instalasi: input.tanggalInstalasi,
    p_budget: input.budget,
    p_status_pembayaran: input.statusPembayaran,
    // DP hanya bermakna untuk status "DP" -- nilai lama yang tertinggal saat
    // status diganti membuat piutang terhitung lebih kecil dari seharusnya.
    p_dp_amount: input.statusPembayaran === "DP" ? (input.dpAmount ?? 0) : 0,
    p_materials: input.materials,
    p_catatan: input.catatan ?? null,
    p_tanggal_bongkar_estimasi: input.tanggalBongkarEstimasi || null,
  });

  if (error) {
    if (error.message.startsWith("RACE_CONFLICT:")) {
      return { ok: false, error: error.message.replace("RACE_CONFLICT: ", "") };
    }
    console.error("[production] updateProject gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "production",
    action: "update",
    entityType: "proyek booth",
    entityLabel: input.name,
    detail: `status: ${input.status}`,
  });
  return { ok: true };
}

export async function deleteProject(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: projectRow } = await supabase
    .from("production_booth_projects")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("production_booth_projects").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteProject gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "production",
    action: "delete",
    entityType: "proyek booth",
    entityLabel: projectRow?.name,
  });
  return { ok: true };
}

/**
 * Modul Pembelian/PO (migrasi 0018) — jawaban atas badge "stok menipis"
 * yang sejauh ini tidak punya langkah lanjut di aplikasi.
 */
export async function addPurchaseOrder(
  input: Omit<PurchaseOrder, "id" | "status" | "receivedDate">
): Promise<MutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("production_purchase_orders").insert({
    material_id: input.materialId ?? null,
    vendor_id: input.vendorId ?? null,
    supplier_name: input.supplierName,
    qty: input.qty,
    unit_price: input.unitPrice,
    order_date: input.orderDate,
    expected_date: input.expectedDate || null,
    catatan: input.catatan ?? null,
    created_by: user?.id ?? null,
  });

  if (error) {
    console.error("[production] addPurchaseOrder gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);

  // Tahap 35: PO baru ikut memberi tahu tim Production (+ akses penuh) —
  // sebelumnya cuma "stok menipis"/proyek booth baru yang memicu notifikasi.
  void notifyDivision(
    "production",
    {
      title: "Purchase Order Baru — Production",
      body: `PO ke ${input.supplierName} — qty ${input.qty}.`,
      url: "/dashboard/production/pembelian",
    },
    user?.id
  );
  void logActivity({
    module: "production",
    action: "create",
    entityType: "purchase order",
    entityLabel: input.supplierName,
    detail: `qty: ${input.qty}`,
  });
  return { ok: true };
}

/**
 * Panggil fungsi database `receive_purchase_order` (migrasi 0018) — SATU
 * transaksi yang menandai PO "Diterima" SEKALIGUS menambah stok material
 * terkait, supaya tidak ada celah "PO ke-mark Diterima tapi stok gagal
 * ke-update" kalau dilakukan lewat dua UPDATE terpisah dari sini.
 */
export async function receivePurchaseOrder(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_purchase_order", { po_id: id });

  if (error) {
    console.error("[production] receivePurchaseOrder gagal:", error.message);
    return { ok: false, error: error.message || GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "production", action: "status_change", entityType: "purchase order", detail: "Diterima" });
  return { ok: true };
}

export async function cancelPurchaseOrder(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: poRow } = await supabase
    .from("production_purchase_orders")
    .select("status, supplier_name")
    .eq("id", id)
    .maybeSingle();

  if (poRow && poRow.status !== "Dipesan") {
    return { ok: false, error: "Purchase order ini sudah tidak berstatus Dipesan." };
  }

  // Bersyarat pada status "Dipesan": kalau PO baru saja diterima staf lain
  // (stok sudah bertambah), pembatalan tidak boleh menimpanya.
  const { data: cancelled, error } = await supabase
    .from("production_purchase_orders")
    .update({ status: "Dibatalkan" })
    .eq("id", id)
    .eq("status", "Dipesan")
    .select("id");

  if (error) {
    console.error("[production] cancelPurchaseOrder gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!cancelled || cancelled.length === 0) {
    return { ok: false, error: "Purchase order ini sudah tidak berstatus Dipesan. Muat ulang halaman." };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "production",
    action: "status_change",
    entityType: "purchase order",
    entityLabel: poRow?.supplier_name,
    detail: "Dibatalkan",
  });
  return { ok: true };
}

export async function deletePurchaseOrder(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: poRow } = await supabase
    .from("production_purchase_orders")
    .select("status, supplier_name")
    .eq("id", id)
    .maybeSingle();

  // PO yang sudah "Diterima" sudah mengubah stok fisik secara nyata —
  // menghapus baris riwayatnya berisiko bikin perubahan stok itu tidak
  // terlacak asal-usulnya, jadi sengaja tidak boleh dihapus dari sini.
  if (poRow?.status === "Diterima") {
    return { ok: false, error: "PO yang sudah Diterima tidak bisa dihapus (mengubah riwayat stok)." };
  }

  // Bersyarat juga di query-nya: PO yang diterima tepat di antara cek di
  // atas dan hapus ini tidak ikut terhapus.
  const { data: deleted, error } = await supabase
    .from("production_purchase_orders")
    .delete()
    .eq("id", id)
    .neq("status", "Diterima")
    .select("id");
  if (error) {
    console.error("[production] deletePurchaseOrder gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "PO ini sudah Diterima atau sudah dihapus. Muat ulang halaman." };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "production",
    action: "delete",
    entityType: "purchase order",
    entityLabel: poRow?.supplier_name,
  });
  return { ok: true };
}

/**
 * Aksi cepat dari papan Jadwal (kanban) untuk memajukan tahap produksi.
 * Sengaja tidak melalui pengecekan konflik material — proyek yang sudah
 * disetujui alokasinya boleh berpindah tahap tanpa harus mengisi ulang form.
 */
/**
 * Pindah tahap cepat dari Linimasa Produksi. `fromStatus` = status yang
 * tampil di kartu: kalau sudah berubah (staf lain membatalkan/menyelesaikan
 * proyek), perubahan DITOLAK -- dulu kartu basi bisa menghidupkan lagi
 * proyek Dibatalkan/Selesai dan materialnya langsung memesan stok lagi
 * tanpa cek ketersediaan. Proyek final hanya bisa diubah lewat form edit
 * (save_booth_project_checked, dengan cek stok).
 */
export async function updateProjectStatus(id: string, status: BoothStatus, fromStatus?: BoothStatus): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: projectRow } = await supabase
    .from("production_booth_projects")
    .select("name, status")
    .eq("id", id)
    .maybeSingle<{ name: string; status: BoothStatus }>();

  if (!projectRow) return { ok: false, error: "Proyek tidak ditemukan." };
  const staleMessage = "Status proyek sudah berubah. Muat ulang halaman lalu coba lagi.";
  if (fromStatus && projectRow.status !== fromStatus) return { ok: false, error: staleMessage };
  if (projectRow.status === "Selesai" || projectRow.status === "Dibatalkan") {
    return { ok: false, error: `Proyek berstatus "${projectRow.status}" hanya bisa diubah lewat form edit proyek.` };
  }

  const { data: updated, error } = await supabase
    .from("production_booth_projects")
    .update({ status })
    .eq("id", id)
    .eq("status", projectRow.status)
    .select("id");
  if (error) {
    console.error("[production] updateProjectStatus gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!updated || updated.length === 0) return { ok: false, error: staleMessage };
  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "production",
    action: "status_change",
    entityType: "proyek booth",
    entityLabel: projectRow?.name,
    detail: `status → ${status}`,
  });
  return { ok: true };
}
