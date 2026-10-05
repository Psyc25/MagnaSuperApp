"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";
import {
  rowToBomTemplate,
  rowToCrewPiecePayment,
  rowToCrewTimelog,
  rowToEquipment,
  rowToEquipmentUsage,
  rowToMaterialTransfer,
  rowToNcReport,
  rowToSubcontractOrder,
  rowToProjectCheck,
  rowToProjectCrew,
  rowToProjectDocument,
  rowToVendor,
  type BomTemplate,
  type BomTemplateItem,
  type BomTemplateRow,
  type CheckStage,
  type CrewPiecePayment,
  type CrewPiecePaymentRow,
  type CrewRole,
  type CrewTimelog,
  type CrewTimelogRow,
  type PiecePaymentStatus,
  type DocumentationTahap,
  type Equipment,
  type EquipmentCategory,
  type EquipmentCondition,
  type EquipmentRow,
  type EquipmentUsage,
  type EquipmentUsageRow,
  type MaterialTransfer,
  type MaterialTransferRow,
  type NcCategory,
  type NcReport,
  type NcReportRow,
  type NcSeverity,
  type NcStatus,
  type ProjectCheck,
  type ProjectCheckRow,
  type ProjectCrew,
  type ProjectCrewRow,
  type ProjectDocument,
  type ProjectDocumentRow,
  type ProjectPhotoRow,
  type SubcontractMaterialItem,
  type SubcontractOrder,
  type SubcontractOrderRow,
  type SubcontractStatus,
  type Vendor,
  type VendorCategory,
  type VendorRow,
} from "./extras-types";

const PROYEK_PATH = "/dashboard/production/proyek";
const DOKUMENTASI_PATH = "/dashboard/production/dokumentasi";
const ALAT_PATH = "/dashboard/production/alat";
const BOM_PATH = "/dashboard/production/bom";
const VENDOR_PATH = "/dashboard/production/vendor";
const PEMBELIAN_PATH = "/dashboard/production/pembelian";
const KUALITAS_PATH = "/dashboard/production/kualitas";
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";
const CHECKS_BUCKET = "production-checks";
const DOCS_BUCKET = "production-documentation";
const DRAWINGS_BUCKET = "production-drawings";

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Checklist instalasi & bongkar (Tahap 28c) — satu baris per (project,
 * stage), di-upsert lewat unique(project_id, stage) di migrasi 0027, sama
 * persis polanya dengan checklist kondisi alat Magnarent (Tahap 28a).
 */
export async function getProjectChecks(projectId: string): Promise<ProjectCheck[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_project_checks")
    .select("*")
    .eq("project_id", projectId)
    .returns<ProjectCheckRow[]>();

  if (error) {
    console.error("[production] getProjectChecks gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToProjectCheck);
}

export async function saveProjectCheck(
  projectId: string,
  stage: CheckStage,
  catatan: string,
  formData: FormData
): Promise<MutationResult> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("production_project_checks")
    .select("photo_urls, photo_storage_paths")
    .eq("project_id", projectId)
    .eq("stage", stage)
    .maybeSingle();

  const photoUrls: string[] = existing?.photo_urls ?? [];
  const photoPaths: string[] = existing?.photo_storage_paths ?? [];

  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
    const storagePath = `${projectId}/${stage}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(CHECKS_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) {
      console.error("[production] Upload foto checklist gagal:", uploadError.message);
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

  const { error } = await supabase.from("production_project_checks").upsert(
    {
      project_id: projectId,
      stage,
      catatan: catatan.trim() || null,
      photo_urls: photoUrls,
      photo_storage_paths: photoPaths,
      checked_by: user?.id ?? null,
      checked_at: new Date().toISOString(),
    },
    { onConflict: "project_id,stage" }
  );

  if (error) {
    console.error("[production] saveProjectCheck gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(PROYEK_PATH);
  return { ok: true };
}

export async function removeProjectCheckPhoto(
  projectId: string,
  stage: CheckStage,
  photoUrl: string
): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("production_project_checks")
    .select("photo_urls, photo_storage_paths")
    .eq("project_id", projectId)
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
    .from("production_project_checks")
    .update({ photo_urls: urls, photo_storage_paths: paths })
    .eq("project_id", projectId)
    .eq("stage", stage);

  if (error) {
    console.error("[production] removeProjectCheckPhoto gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (removedPath) await supabase.storage.from(CHECKS_BUCKET).remove([removedPath]);
  revalidatePath(PROYEK_PATH);
  return { ok: true };
}

/**
 * Penugasan kru per proyek booth (Tahap 28c) — banyak baris per proyek,
 * nama bebas (bukan menautkan ke akun `profiles`, lihat komentar migrasi
 * 0027 & extras-types.ts).
 */
export async function getProjectCrew(projectId: string): Promise<ProjectCrew[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_project_crew")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .returns<ProjectCrewRow[]>();

  if (error) {
    console.error("[production] getProjectCrew gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToProjectCrew);
}

/**
 * Ambil kru dari BANYAK proyek sekaligus dalam satu query -- dipakai oleh
 * panel Autoschedule (analisis-kompetitor #22) untuk cek bentrok kru lintas
 * proyek aktif, supaya tidak perlu N kali panggil `getProjectCrew`.
 */
export async function getProjectCrewForProjects(projectIds: string[]): Promise<ProjectCrew[]> {
  if (projectIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_project_crew")
    .select("*")
    .in("project_id", projectIds)
    .returns<ProjectCrewRow[]>();

  if (error) {
    console.error("[production] getProjectCrewForProjects gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToProjectCrew);
}

export async function addProjectCrew(
  projectId: string,
  input: { nama: string; peran: CrewRole; kontak?: string; catatan?: string }
): Promise<MutationResult> {
  if (!input.nama.trim()) return { ok: false, error: "Nama kru wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.from("production_project_crew").insert({
    project_id: projectId,
    nama: input.nama.trim(),
    peran: input.peran,
    kontak: input.kontak?.trim() || null,
    catatan: input.catatan?.trim() || null,
  });

  if (error) {
    console.error("[production] addProjectCrew gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(PROYEK_PATH);
  return { ok: true };
}

export async function deleteProjectCrew(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("production_project_crew").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteProjectCrew gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(PROYEK_PATH);
  return { ok: true };
}

/**
 * Galeri dokumentasi before/after (Tahap 28c) — dipakai halaman
 * /dashboard/production/dokumentasi, mirip `addPortfolioPhoto` Magnativ
 * tapi selalu bertaut ke satu proyek booth + tahap Sebelum/Sesudah.
 */
export async function addProjectPhoto(formData: FormData): Promise<MutationResult> {
  const projectId = String(formData.get("projectId") ?? "");
  const tahap = String(formData.get("tahap") ?? "") as DocumentationTahap;
  const caption = String(formData.get("caption") ?? "").trim();
  const file = formData.get("photo");

  if (!projectId) return { ok: false, error: "Pilih proyek booth terlebih dahulu." };
  if (tahap !== "Sebelum" && tahap !== "Sesudah") return { ok: false, error: "Tahap tidak valid." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih foto terlebih dahulu." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "File harus berupa gambar." };

  const supabase = await createClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
  const storagePath = `${projectId}/${tahap.toLowerCase()}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) {
    console.error("[production] Upload foto dokumentasi gagal:", uploadError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(DOCS_BUCKET).getPublicUrl(storagePath);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("production_project_photos").insert({
    project_id: projectId,
    tahap,
    photo_url: publicUrl,
    storage_path: storagePath,
    caption: caption || null,
    uploaded_by: user?.id ?? null,
  });

  if (error) {
    console.error("[production] addProjectPhoto gagal:", error.message);
    await supabase.storage.from(DOCS_BUCKET).remove([storagePath]);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(DOKUMENTASI_PATH);
  void logActivity({ module: "production", action: "create", entityType: "dokumentasi proyek", detail: tahap });
  return { ok: true };
}

export async function deleteProjectPhoto(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: photoRow } = await supabase
    .from("production_project_photos")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle<Pick<ProjectPhotoRow, "storage_path">>();

  const { error } = await supabase.from("production_project_photos").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteProjectPhoto gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (photoRow?.storage_path) await supabase.storage.from(DOCS_BUCKET).remove([photoRow.storage_path]);
  revalidatePath(DOKUMENTASI_PATH);
  return { ok: true };
}

/**
 * Alat berat/perkakas + riwayat pemakaian (Tahap 28c) — registry alat mirip
 * `MaterialManager`, riwayat pemakaian mirip `MaintenanceLogModal` Magnarent
 * tapi mencatat proyek & tanggal pinjam/kembali, bukan biaya servis.
 */
export async function getEquipment(): Promise<Equipment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_equipment")
    .select("*")
    .order("name", { ascending: true })
    .returns<EquipmentRow[]>();

  if (error) {
    console.error("[production] getEquipment gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToEquipment);
}

function validateEquipmentInput(input: { name: string }): string | null {
  if (!input.name?.trim()) return "Nama alat wajib diisi.";
  return null;
}

export async function addEquipment(input: {
  name: string;
  kategori: EquipmentCategory;
  kondisi: EquipmentCondition;
  catatan?: string;
}): Promise<MutationResult> {
  const validationError = validateEquipmentInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("production_equipment").insert({
    name: input.name.trim(),
    kategori: input.kategori,
    kondisi: input.kondisi,
    catatan: input.catatan?.trim() || null,
  });

  if (error) {
    console.error("[production] addEquipment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(ALAT_PATH);
  void logActivity({ module: "production", action: "create", entityType: "alat/perkakas", entityLabel: input.name });
  return { ok: true };
}

export async function updateEquipment(
  id: string,
  input: { name: string; kategori: EquipmentCategory; kondisi: EquipmentCondition; catatan?: string }
): Promise<MutationResult> {
  const validationError = validateEquipmentInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("production_equipment")
    .update({
      name: input.name.trim(),
      kategori: input.kategori,
      kondisi: input.kondisi,
      catatan: input.catatan?.trim() || null,
    })
    .eq("id", id);

  if (error) {
    console.error("[production] updateEquipment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(ALAT_PATH);
  void logActivity({ module: "production", action: "update", entityType: "alat/perkakas", entityLabel: input.name });
  return { ok: true };
}

export async function deleteEquipment(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: equipmentRow } = await supabase
    .from("production_equipment")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("production_equipment").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteEquipment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(ALAT_PATH);
  void logActivity({ module: "production", action: "delete", entityType: "alat/perkakas", entityLabel: equipmentRow?.name });
  return { ok: true };
}

export async function getEquipmentUsage(equipmentId: string): Promise<EquipmentUsage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_equipment_usage")
    .select("*")
    .eq("equipment_id", equipmentId)
    .order("tanggal_pinjam", { ascending: false })
    .returns<EquipmentUsageRow[]>();

  if (error) {
    console.error("[production] getEquipmentUsage gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToEquipmentUsage);
}

export async function addEquipmentUsage(
  equipmentId: string,
  input: { projectId?: string; digunakanOleh: string; tanggalPinjam: string; tanggalKembali?: string; catatan?: string }
): Promise<MutationResult> {
  if (!input.digunakanOleh.trim()) return { ok: false, error: "Nama pemakai wajib diisi." };
  if (!input.tanggalPinjam) return { ok: false, error: "Tanggal pinjam wajib diisi." };
  if (input.tanggalKembali && input.tanggalKembali < input.tanggalPinjam) {
    return { ok: false, error: "Tanggal kembali tidak boleh sebelum tanggal pinjam." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("production_equipment_usage").insert({
    equipment_id: equipmentId,
    project_id: input.projectId || null,
    digunakan_oleh: input.digunakanOleh.trim(),
    tanggal_pinjam: input.tanggalPinjam,
    tanggal_kembali: input.tanggalKembali || null,
    catatan: input.catatan?.trim() || null,
    created_by: user?.id ?? null,
  });

  if (error) {
    console.error("[production] addEquipmentUsage gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(ALAT_PATH);
  void logActivity({ module: "production", action: "create", entityType: "pemakaian alat", entityLabel: input.digunakanOleh });
  return { ok: true };
}

export async function markEquipmentUsageReturned(id: string, tanggalKembali: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("production_equipment_usage")
    .update({ tanggal_kembali: tanggalKembali })
    .eq("id", id);

  if (error) {
    console.error("[production] markEquipmentUsageReturned gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(ALAT_PATH);
  return { ok: true };
}

export async function deleteEquipmentUsage(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("production_equipment_usage").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteEquipmentUsage gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(ALAT_PATH);
  return { ok: true };
}

/**
 * Template BOM per tipe booth (Tahap 44) — CRUD sederhana, `items`
 * disimpan langsung sebagai jsonb array (sama pola dengan kolom
 * `materials` di production_booth_projects), jadi tidak perlu tabel item
 * terpisah dan bisa langsung "dimuat ulang" ke form proyek.
 */
export async function getBomTemplates(): Promise<BomTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_bom_templates")
    .select("*")
    .order("name", { ascending: true })
    .returns<BomTemplateRow[]>();

  if (error) {
    console.error("[production] getBomTemplates gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToBomTemplate);
}

export async function createBomTemplate(input: {
  name: string;
  description?: string;
  items: BomTemplateItem[];
}): Promise<MutationResult> {
  if (!input.name.trim()) return { ok: false, error: "Nama template wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.from("production_bom_templates").insert({
    name: input.name.trim(),
    description: input.description?.trim() || null,
    items: input.items,
  });

  if (error) {
    console.error("[production] createBomTemplate gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(BOM_PATH);
  void logActivity({ module: "production", action: "create", entityType: "template BOM", entityLabel: input.name });
  return { ok: true };
}

export async function updateBomTemplate(
  id: string,
  input: { name: string; description?: string; items: BomTemplateItem[] }
): Promise<MutationResult> {
  if (!input.name.trim()) return { ok: false, error: "Nama template wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("production_bom_templates")
    .update({ name: input.name.trim(), description: input.description?.trim() || null, items: input.items })
    .eq("id", id);

  if (error) {
    console.error("[production] updateBomTemplate gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(BOM_PATH);
  void logActivity({ module: "production", action: "update", entityType: "template BOM", entityLabel: input.name });
  return { ok: true };
}

export async function deleteBomTemplate(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: templateRow } = await supabase
    .from("production_bom_templates")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("production_bom_templates").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteBomTemplate gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(BOM_PATH);
  void logActivity({
    module: "production",
    action: "delete",
    entityType: "template BOM",
    entityLabel: templateRow?.name,
  });
  return { ok: true };
}

/**
 * Database vendor/supplier (Tahap 44) — mirror pola `MaterialManager`,
 * dipakai sebagai picker opsional di form Purchase Order (tetap bisa isi
 * nama supplier bebas kalau vendor belum terdaftar).
 */
export async function getVendors(): Promise<Vendor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_vendors")
    .select("*")
    .order("name", { ascending: true })
    .returns<VendorRow[]>();

  if (error) {
    console.error("[production] getVendors gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToVendor);
}

function validateVendorInput(input: { name: string }): string | null {
  if (!input.name?.trim()) return "Nama vendor wajib diisi.";
  return null;
}

export async function addVendor(input: {
  name: string;
  category: VendorCategory;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  catatan?: string;
}): Promise<MutationResult> {
  const validationError = validateVendorInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("production_vendors").insert({
    name: input.name.trim(),
    category: input.category,
    contact_name: input.contactName?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    contact_email: input.contactEmail?.trim() || null,
    catatan: input.catatan?.trim() || null,
  });

  if (error) {
    console.error("[production] addVendor gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(VENDOR_PATH);
  revalidatePath(PEMBELIAN_PATH);
  void logActivity({ module: "production", action: "create", entityType: "vendor", entityLabel: input.name });
  return { ok: true };
}

export async function updateVendor(
  id: string,
  input: {
    name: string;
    category: VendorCategory;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    catatan?: string;
  }
): Promise<MutationResult> {
  const validationError = validateVendorInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("production_vendors")
    .update({
      name: input.name.trim(),
      category: input.category,
      contact_name: input.contactName?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      contact_email: input.contactEmail?.trim() || null,
      catatan: input.catatan?.trim() || null,
    })
    .eq("id", id);

  if (error) {
    console.error("[production] updateVendor gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(VENDOR_PATH);
  revalidatePath(PEMBELIAN_PATH);
  void logActivity({ module: "production", action: "update", entityType: "vendor", entityLabel: input.name });
  return { ok: true };
}

export async function deleteVendor(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: vendorRow } = await supabase.from("production_vendors").select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from("production_vendors").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteVendor gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(VENDOR_PATH);
  revalidatePath(PEMBELIAN_PATH);
  void logActivity({ module: "production", action: "delete", entityType: "vendor", entityLabel: vendorRow?.name });
  return { ok: true };
}

/**
 * Jam kerja kru (Tahap 44) — banyak baris per penugasan
 * `production_project_crew`, dibuka on-demand dari `ProjectDetailModal`
 * sama pola dengan checklist/kru itu sendiri. Versi internal saja (belum
 * terhubung payroll sungguhan — lihat analisis-gap-production.md).
 */
export async function getCrewTimelogs(projectCrewId: string): Promise<CrewTimelog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_crew_timelogs")
    .select("*")
    .eq("project_crew_id", projectCrewId)
    .order("tanggal", { ascending: false })
    .returns<CrewTimelogRow[]>();

  if (error) {
    console.error("[production] getCrewTimelogs gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToCrewTimelog);
}

export async function addCrewTimelog(
  projectCrewId: string,
  input: { tanggal: string; jam: number; catatan?: string }
): Promise<MutationResult> {
  if (!input.tanggal) return { ok: false, error: "Tanggal wajib diisi." };
  if (!Number.isFinite(input.jam) || input.jam <= 0) return { ok: false, error: "Jam kerja harus lebih dari 0." };

  const supabase = await createClient();
  const { error } = await supabase.from("production_crew_timelogs").insert({
    project_crew_id: projectCrewId,
    tanggal: input.tanggal,
    jam: input.jam,
    catatan: input.catatan?.trim() || null,
  });

  if (error) {
    console.error("[production] addCrewTimelog gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(PROYEK_PATH);
  return { ok: true };
}

export async function deleteCrewTimelog(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("production_crew_timelogs").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteCrewTimelog gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(PROYEK_PATH);
  return { ok: true };
}

/**
 * Upah borongan (piece-rate) kru (analisis-kompetitor #21) — panel terpisah
 * dari `CrewTimelogPanel`, dibuka di `ProjectDetailModal` per baris kru.
 * Total dihitung di sini (bukan trigger DB) supaya konsisten dengan pola
 * `magnarent_subrent_records`.
 */
export async function getCrewPiecePayments(projectCrewId: string): Promise<CrewPiecePayment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_crew_piece_payments")
    .select("*")
    .eq("project_crew_id", projectCrewId)
    .order("created_at", { ascending: false })
    .returns<CrewPiecePaymentRow[]>();

  if (error) {
    console.error("[production] getCrewPiecePayments gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToCrewPiecePayment);
}

export async function addCrewPiecePayment(
  projectCrewId: string,
  input: { deskripsiPekerjaan: string; jumlahUnit: number; ratePerUnit: number; catatan?: string }
): Promise<MutationResult> {
  if (!input.deskripsiPekerjaan.trim()) return { ok: false, error: "Deskripsi pekerjaan wajib diisi." };
  if (!Number.isFinite(input.jumlahUnit) || input.jumlahUnit <= 0)
    return { ok: false, error: "Jumlah unit harus lebih dari 0." };
  if (!Number.isFinite(input.ratePerUnit) || input.ratePerUnit < 0)
    return { ok: false, error: "Rate per unit tidak valid." };

  const totalUpah = input.jumlahUnit * input.ratePerUnit;
  const supabase = await createClient();
  const { error } = await supabase.from("production_crew_piece_payments").insert({
    project_crew_id: projectCrewId,
    deskripsi_pekerjaan: input.deskripsiPekerjaan.trim(),
    jumlah_unit: input.jumlahUnit,
    rate_per_unit: input.ratePerUnit,
    total_upah: totalUpah,
    catatan: input.catatan?.trim() || null,
  });

  if (error) {
    console.error("[production] addCrewPiecePayment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(PROYEK_PATH);
  return { ok: true };
}

export async function updateCrewPiecePaymentStatus(
  id: string,
  status: PiecePaymentStatus,
  tanggalBayar?: string
): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("production_crew_piece_payments")
    .update({
      status,
      tanggal_bayar: status === "Dibayar" ? tanggalBayar || new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);

  if (error) {
    console.error("[production] updateCrewPiecePaymentStatus gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(PROYEK_PATH);
  return { ok: true };
}

export async function deleteCrewPiecePayment(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("production_crew_piece_payments").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteCrewPiecePayment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(PROYEK_PATH);
  return { ok: true };
}

/**
 * Lampiran gambar kerja/desain per proyek (Tahap 44) — pola sama dengan
 * `addProjectPhoto`, tapi mendukung file gambar ATAU PDF, dan disimpan ke
 * bucket terpisah `production-drawings` supaya tidak campur dengan foto
 * dokumentasi before/after instalasi.
 */
export async function addProjectDocument(formData: FormData): Promise<MutationResult> {
  const projectId = String(formData.get("projectId") ?? "");
  const file = formData.get("file");

  if (!projectId) return { ok: false, error: "Proyek booth tidak valid." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih file terlebih dahulu." };
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return { ok: false, error: "File harus berupa gambar atau PDF." };
  }

  const supabase = await createClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
  const storagePath = `${projectId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(DRAWINGS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) {
    console.error("[production] Upload gambar kerja gagal:", uploadError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(DRAWINGS_BUCKET).getPublicUrl(storagePath);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("production_project_documents").insert({
    project_id: projectId,
    file_name: file.name,
    file_url: publicUrl,
    storage_path: storagePath,
    file_type: file.type || null,
    uploaded_by: user?.id ?? null,
  });

  if (error) {
    console.error("[production] addProjectDocument gagal:", error.message);
    await supabase.storage.from(DRAWINGS_BUCKET).remove([storagePath]);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(PROYEK_PATH);
  void logActivity({
    module: "production",
    action: "create",
    entityType: "gambar kerja/desain",
    entityLabel: file.name,
  });
  return { ok: true };
}

export async function getProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_project_documents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .returns<ProjectDocumentRow[]>();

  if (error) {
    console.error("[production] getProjectDocuments gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToProjectDocument);
}

export async function deleteProjectDocument(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: docRow } = await supabase
    .from("production_project_documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle<Pick<ProjectDocumentRow, "storage_path">>();

  const { error } = await supabase.from("production_project_documents").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteProjectDocument gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (docRow?.storage_path) await supabase.storage.from(DRAWINGS_BUCKET).remove([docRow.storage_path]);
  revalidatePath(PROYEK_PATH);
  return { ok: true };
}


/**
 * Transfer stok material antar gudang/lokasi (Tahap 45 — gap #8
 * analisis-gap-production.md). Panggil RPC atomik `transfer_material_stock`
 * (migrasi 0060): kurangi stok baris asal, tambah/insert baris tujuan, DAN
 * catat riwayat — semua satu transaksi database, bukan tiga panggilan
 * terpisah dari app (lihat komentar receive_purchase_order di migrasi 0018
 * untuk pola yang sama persis). Revalidate seluruh "/dashboard/production"
 * (bukan cuma halaman Material) karena Pemakaian & MRP juga menampilkan
 * data material yang sama lewat ProductionDataProvider.
 */
export async function transferMaterialStock(
  materialId: string,
  input: { qty: number; toLocation: string; catatan?: string }
): Promise<MutationResult> {
  if (!Number.isFinite(input.qty) || input.qty <= 0) {
    return { ok: false, error: "Jumlah transfer harus lebih dari 0." };
  }
  if (!input.toLocation?.trim()) {
    return { ok: false, error: "Lokasi tujuan wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_material_stock", {
    p_material_id: materialId,
    p_qty: input.qty,
    p_to_location: input.toLocation.trim(),
    p_catatan: input.catatan?.trim() || null,
  });

  if (error) {
    console.error("[production] transferMaterialStock gagal:", error.message);
    return { ok: false, error: error.message || GENERIC_ERROR };
  }
  revalidatePath("/dashboard/production");
  void logActivity({
    module: "production",
    action: "update",
    entityType: "material",
    detail: `Transfer ${input.qty} unit ke ${input.toLocation.trim()}`,
  });
  return { ok: true };
}

export async function getMaterialTransfers(materialId: string): Promise<MaterialTransfer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_material_transfers")
    .select("*")
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .returns<MaterialTransferRow[]>();

  if (error) {
    console.error("[production] getMaterialTransfers gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToMaterialTransfer);
}

/**
 * Modul NC/CAPA (non-conformance & tindakan korektif/preventif --
 * analisis-kompetitor #23) -- SENGAJA terpisah dari `getProjectChecks`/
 * `saveProjectCheck` di atas (checklist rutin instalasi/bongkar). Ini
 * mencatat TEMUAN ketidaksesuaian kualitas dan tindak lanjutnya, ditautkan
 * opsional ke proyek/vendor/kru. Murni pencatatan manual staf -- TIDAK ADA
 * skoring/analisis otomatis berbasis AI di sini.
 */
export async function getNcReports(): Promise<NcReport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_nc_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<NcReportRow[]>();

  if (error) {
    console.error("[production] getNcReports gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToNcReport);
}

function validateNcReportInput(input: { judul: string; deskripsi: string }): string | null {
  if (!input.judul?.trim()) return "Judul temuan wajib diisi.";
  if (!input.deskripsi?.trim()) return "Deskripsi temuan wajib diisi.";
  return null;
}

export async function addNcReport(input: {
  projectId?: string;
  vendorId?: string;
  projectCrewId?: string;
  kategori: NcCategory;
  judul: string;
  deskripsi: string;
  severity: NcSeverity;
  pic?: string;
  tanggalDitemukan?: string;
}): Promise<MutationResult> {
  const validationError = validateNcReportInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    project_id: input.projectId || null,
    vendor_id: input.vendorId || null,
    project_crew_id: input.projectCrewId || null,
    kategori: input.kategori,
    judul: input.judul.trim(),
    deskripsi: input.deskripsi.trim(),
    severity: input.severity,
    pic: input.pic?.trim() || null,
  };
  if (input.tanggalDitemukan) payload.tanggal_ditemukan = input.tanggalDitemukan;

  const { error } = await supabase.from("production_nc_reports").insert(payload);
  if (error) {
    console.error("[production] addNcReport gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(KUALITAS_PATH);
  void logActivity({ module: "production", action: "create", entityType: "nc_report", entityLabel: input.judul });
  return { ok: true };
}

/** Update status + tindak lanjut (akar masalah, tindakan korektif/preventif) satu NC report. */
export async function updateNcReportProgress(
  id: string,
  input: {
    status: NcStatus;
    akarMasalah?: string;
    tindakanKorektif?: string;
    tindakanPreventif?: string;
  }
): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("production_nc_reports")
    .update({
      status: input.status,
      akar_masalah: input.akarMasalah?.trim() || null,
      tindakan_korektif: input.tindakanKorektif?.trim() || null,
      tindakan_preventif: input.tindakanPreventif?.trim() || null,
      tanggal_ditutup: input.status === "Ditutup" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);

  if (error) {
    console.error("[production] updateNcReportProgress gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(KUALITAS_PATH);
  void logActivity({ module: "production", action: "update", entityType: "nc_report", entityLabel: input.status });
  return { ok: true };
}

export async function deleteNcReport(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: ncRow } = await supabase.from("production_nc_reports").select("judul").eq("id", id).maybeSingle();

  const { error } = await supabase.from("production_nc_reports").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteNcReport gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(KUALITAS_PATH);
  void logActivity({ module: "production", action: "delete", entityType: "nc_report", entityLabel: ncRow?.judul });
  return { ok: true };
}

/**
 * Subcontracting tracking terintegrasi BOM (analisis-kompetitor #24) --
 * material dari BOM proyek yang dikirim ke vendor eksternal (laser
 * cutting, printing besar, dsb) lalu diterima kembali sebagai barang
 * jadi. `materialDikirim` sengaja mengacu ke item BOM proyek yang sama
 * (bukan input bebas). Tidak mengubah stok gudang -- murni tracking
 * status pengiriman/penerimaan.
 */
export async function getSubcontractOrders(projectId: string): Promise<SubcontractOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_subcontract_orders")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .returns<SubcontractOrderRow[]>();

  if (error) {
    console.error("[production] getSubcontractOrders gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToSubcontractOrder);
}

function validateSubcontractInput(input: { deskripsiPekerjaan: string }): string | null {
  if (!input.deskripsiPekerjaan?.trim()) return "Deskripsi pekerjaan wajib diisi.";
  return null;
}

export async function addSubcontractOrder(
  projectId: string,
  input: {
    vendorId?: string;
    deskripsiPekerjaan: string;
    materialDikirim?: SubcontractMaterialItem[];
    tanggalKirim?: string;
    estimasiTerima?: string;
    biayaJasa?: number;
    catatan?: string;
  }
): Promise<MutationResult> {
  const validationError = validateSubcontractInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    project_id: projectId,
    vendor_id: input.vendorId || null,
    deskripsi_pekerjaan: input.deskripsiPekerjaan.trim(),
    material_dikirim: input.materialDikirim ?? [],
    biaya_jasa: input.biayaJasa ?? 0,
    catatan: input.catatan?.trim() || null,
  };
  if (input.tanggalKirim) payload.tanggal_kirim = input.tanggalKirim;
  if (input.estimasiTerima) payload.estimasi_terima = input.estimasiTerima;

  const { error } = await supabase.from("production_subcontract_orders").insert(payload);
  if (error) {
    console.error("[production] addSubcontractOrder gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(PROYEK_PATH);
  void logActivity({
    module: "production",
    action: "create",
    entityType: "subcontract_order",
    entityLabel: input.deskripsiPekerjaan,
  });
  return { ok: true };
}

export async function updateSubcontractStatus(
  id: string,
  status: SubcontractStatus,
  tanggalTerima?: string
): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("production_subcontract_orders")
    .update({
      status,
      tanggal_terima: status === "Diterima" ? tanggalTerima || new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);

  if (error) {
    console.error("[production] updateSubcontractStatus gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(PROYEK_PATH);
  return { ok: true };
}

export async function deleteSubcontractOrder(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("production_subcontract_orders").delete().eq("id", id);
  if (error) {
    console.error("[production] deleteSubcontractOrder gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(PROYEK_PATH);
  return { ok: true };
}
