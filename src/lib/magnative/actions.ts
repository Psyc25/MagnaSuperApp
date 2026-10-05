"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDivision } from "@/lib/push/notify";
import { logActivity } from "@/lib/activity/log";
import { addEventExpense, deleteEventExpense, updateEventExpense } from "@/lib/event-expenses/actions";
import type { ExpenseCategory, ReimbursementStatus } from "@/lib/event-expenses/types";
import type {
  AssetComment,
  CheckinLink,
  CheckinStats,
  Client,
  ContentPost,
  ContentRequest,
  ContentRequestStatus,
  ContentStatus,
  CreativeAssetCategory,
  PipelineStage,
  Project,
  ProjectCost,
  ProjectTask,
  ProjectTaskStatus,
  ProjectVendor,
  Vendor,
} from "./types";
import {
  rowToAssetComment,
  rowToCheckin,
  rowToCheckinLink,
  type AssetCommentRow,
  type CheckinLinkRow,
  type CheckinRow,
} from "./mappers";

const MODULE_PATH = "/dashboard/magnative";
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";
const PORTFOLIO_BUCKET = "magnative-portfolio";
const CREATIVE_ASSETS_BUCKET = "magnative-assets";
/** Rekomendasi 2 laporan gap-event vs SOP (migrasi 0064) -- lihat komentar `PipelineFile` di types.ts. */
const PIPELINE_FILES_BUCKET = "magnative-pipeline-files";

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Pola sama persis dengan `src/lib/magnarent/actions.ts`: tulis ke Supabase
 * lalu `revalidatePath` — itu otomatis membuat Next.js mengambil ulang data
 * di `src/app/dashboard/magnative/layout.tsx` (Server Component) dan
 * mengirim props baru ke `MagnativeDataProvider`. RLS (migrasi 0005) sudah
 * membatasi baris yang kebaca/tertulis cuma milik divisi Magnative/akses
 * penuh, jadi pengecekan divisi tidak diulang di sini.
 */
/** Divalidasi ulang di server — form di UI sudah punya `required`, tapi Server Action ini bisa dipanggil langsung sebagai fungsi. */
function validateClientInput(input: Omit<Client, "id">): string | null {
  if (!input.name?.trim() || !input.industry?.trim() || !input.picName?.trim()) {
    return "Nama klien, industri, dan nama PIC wajib diisi.";
  }
  return null;
}

export async function addClient(input: Omit<Client, "id">): Promise<MutationResult> {
  const validationError = validateClientInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("magnative_clients").insert({
    name: input.name,
    industry: input.industry,
    pic_name: input.picName,
    pic_phone: input.picPhone ?? null,
    pic_email: input.picEmail ?? null,
    status: input.status,
    catatan: input.catatan ?? null,
  });

  if (error) {
    console.error("[magnative] addClient gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "create", entityType: "klien", entityLabel: input.name });
  return { ok: true };
}

export async function updateClient(id: string, input: Omit<Client, "id">): Promise<MutationResult> {
  const validationError = validateClientInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("magnative_clients")
    .update({
      name: input.name,
      industry: input.industry,
      pic_name: input.picName,
      pic_phone: input.picPhone ?? null,
      pic_email: input.picEmail ?? null,
      status: input.status,
      catatan: input.catatan ?? null,
    })
    .eq("id", id);

  if (error) {
    console.error("[magnative] updateClient gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "update", entityType: "klien", entityLabel: input.name });
  return { ok: true };
}

export async function deleteClient(id: string): Promise<MutationResult> {
  const supabase = await createClient();

  // Cegah hapus klien yang masih punya proyek AKTIF (Pitching/Perencanaan/
  // Berjalan) — dulu cuma dicek di UI (getActiveProjectsForClient);
  // ditegakkan ulang di sini supaya tidak bisa dilewati dengan memanggil
  // action ini langsung. "Pitching" ikut dihitung aktif sejak migrasi 0016
  // — lead yang masih dalam proses pitching juga bukan klien yang aman
  // dihapus begitu saja.
  const { data: activeRows, error: activeError } = await supabase
    .from("magnative_projects")
    .select("id")
    .eq("client_id", id)
    .in("status", ["Pitching", "Perencanaan", "Berjalan"])
    .limit(1);

  if (activeError) {
    console.error("[magnative] Cek proyek aktif sebelum hapus klien gagal:", activeError.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (activeRows && activeRows.length > 0) {
    return { ok: false, error: "Klien masih punya proyek aktif, tidak bisa dihapus." };
  }

  const { data: clientRow } = await supabase.from("magnative_clients").select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from("magnative_clients").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deleteClient gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "delete", entityType: "klien", entityLabel: clientRow?.name });
  return { ok: true };
}

/** Sama alasannya dengan `validateClientInput` — dicek ulang di server, bukan cuma diandalkan dari form. */
function validateMagnativeProjectInput(input: Omit<Project, "id">): string | null {
  if (!input.name?.trim()) return "Nama proyek wajib diisi.";
  if (!input.tanggalMulai || !input.tanggalSelesai || input.tanggalMulai > input.tanggalSelesai) {
    return "Tanggal selesai tidak boleh sebelum tanggal mulai.";
  }
  if (!Number.isFinite(input.budget) || input.budget < 0) {
    return "Budget tidak boleh negatif.";
  }
  if (input.dpAmount !== undefined && (!Number.isFinite(input.dpAmount) || input.dpAmount < 0)) {
    return "Nominal DP tidak valid.";
  }
  // Rekomendasi 1 laporan gap-event vs SOP (migrasi 0063) -- Owner minta
  // alasan kalah/batal WAJIB diisi begitu status proyek diubah ke
  // "Dibatalkan", ditegakkan di sini (bukan CHECK constraint DB) supaya
  // konsisten dengan pola validasi lain di fungsi ini.
  if (input.status === "Dibatalkan" && !input.alasanKalah?.trim()) {
    return 'Alasan kalah/batal wajib diisi saat status diubah ke "Dibatalkan".';
  }
  return null;
}

export async function addProject(input: Omit<Project, "id">): Promise<MutationResult> {
  const validationError = validateMagnativeProjectInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("magnative_projects").insert({
    client_id: input.clientId,
    name: input.name,
    type: input.type,
    tanggal_mulai: input.tanggalMulai,
    tanggal_selesai: input.tanggalSelesai,
    budget: input.budget,
    status: input.status,
    status_pembayaran: input.statusPembayaran,
    dp_amount: input.dpAmount ?? 0,
    catatan: input.catatan ?? null,
    alasan_kalah: input.alasanKalah?.trim() || null,
    pipeline_stage: input.pipelineStage ?? null,
    sumber_undangan: input.sumberUndangan?.trim() || null,
  });

  if (error) {
    console.error("[magnative] addProject gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);

  // Beri tahu tim Magnative (+ akun akses penuh) ada proyek baru — tidak
  // di-`await` supaya kegagalan kirim notifikasi tidak menahan respons.
  const {
    data: { user: projectActor },
  } = await supabase.auth.getUser();
  void notifyDivision(
    "magnative",
    {
      title: "Proyek Baru — Magnativ",
      body: `Proyek "${input.name}" (${input.type}) baru dibuat.`,
      url: "/dashboard/magnative/proyek",
    },
    projectActor?.id
  );
  void logActivity({ module: "magnative", action: "create", entityType: "proyek", entityLabel: input.name });

  return { ok: true };
}

export async function updateProject(id: string, input: Omit<Project, "id">): Promise<MutationResult> {
  const validationError = validateMagnativeProjectInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("magnative_projects")
    .update({
      client_id: input.clientId,
      name: input.name,
      type: input.type,
      tanggal_mulai: input.tanggalMulai,
      tanggal_selesai: input.tanggalSelesai,
      budget: input.budget,
      status: input.status,
      status_pembayaran: input.statusPembayaran,
      dp_amount: input.dpAmount ?? 0,
      catatan: input.catatan ?? null,
      alasan_kalah: input.alasanKalah?.trim() || null,
      pipeline_stage: input.pipelineStage ?? null,
      sumber_undangan: input.sumberUndangan?.trim() || null,
    })
    .eq("id", id);

  if (error) {
    console.error("[magnative] updateProject gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "magnative",
    action: "update",
    entityType: "proyek",
    entityLabel: input.name,
    detail: `status: ${input.status}`,
  });
  return { ok: true };
}

export async function deleteProject(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: projectRow } = await supabase.from("magnative_projects").select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from("magnative_projects").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deleteProject gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "delete", entityType: "proyek", entityLabel: projectRow?.name });
  return { ok: true };
}

/**
 * Biaya/pengeluaran per proyek — lihat komentar `ProjectCost` di types.ts.
 * Tidak perlu cek `status` proyek: biaya boleh dicatat di tahap apa pun,
 * termasuk "Pitching" yang belum pasti deal.
 *
 * Tahap C modul "Realisasi Event" (migrasi 0050): baris biaya sekarang
 * ditulis ke tabel terpadu `event_expenses` lewat action yang sama dipakai
 * halaman Realisasi Event — bukan lagi ke `magnative_project_costs`
 * (tabel lama dibiarkan ada untuk riwayat, tidak ditulis lagi). Kategori &
 * metode pembayaran diisi sendiri oleh staf lewat modal ini (perbaikan
 * pasca-review — sebelumnya dipaksa "Lain-lain"/"Tidak dicatat" otomatis,
 * bikin rekap di halaman Realisasi Event kurang rinci untuk biaya proyek
 * Magnative). Kalau perlu bukti transaksi foto nota, catat langsung dari
 * halaman Realisasi Event — baris yang sama bakal muncul di kedua tempat
 * karena source-nya identik (source_type "magnative_project").
 */
function validateProjectCostInput(input: Omit<ProjectCost, "id">): string | null {
  if (!input.description?.trim()) return "Deskripsi biaya wajib diisi.";
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Nominal biaya harus lebih dari 0.";
  if (!input.category?.trim()) return "Kategori biaya wajib dipilih.";
  if (!input.paymentMethod?.trim()) return "Metode pembayaran wajib diisi.";
  return null;
}

export async function addProjectCost(input: Omit<ProjectCost, "id">): Promise<MutationResult> {
  const validationError = validateProjectCostInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let picName = "Tidak diketahui";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string }>();
    picName = profile?.full_name?.trim() || picName;
  }

  const result = await addEventExpense({
    expenseDate: input.costDate,
    division: "magnative",
    sourceType: "magnative_project",
    sourceId: input.projectId,
    category: input.category as ExpenseCategory,
    amount: input.amount,
    picName,
    paymentMethod: input.paymentMethod,
    // Biaya proyek dicatat dari modal Biaya Proyek = biaya perusahaan (migrasi
    // 0090). Dulu "Tidak Perlu", yang dijurnal ke Modal Pemilik.
    reimbursementStatus: "Dibayar Perusahaan",
    notes: input.description,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Edit biaya proyek yang sudah tersimpan (perbaikan pasca-review — sebelum
 * ini cuma bisa hapus lalu catat ulang kalau salah input). PIC & status
 * penggantian dana yang sudah ada di baris itu DIPERTAHANKAN (diambil ulang
 * dari `event_expenses`, bukan dari form ini yang sengaja tetap ringkas)
 * supaya edit deskripsi/nominal/tanggal/kategori/metode tidak tidak sengaja
 * menimpa field lain yang tidak ditampilkan di modal ini.
 */
export async function updateProjectCost(id: string, input: Omit<ProjectCost, "id">): Promise<MutationResult> {
  const validationError = validateProjectCostInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("event_expenses")
    .select("pic_name, reimbursement_status")
    .eq("id", id)
    .maybeSingle<{ pic_name: string; reimbursement_status: ReimbursementStatus }>();

  if (!existing) {
    return { ok: false, error: GENERIC_ERROR };
  }

  const result = await updateEventExpense(id, {
    expenseDate: input.costDate,
    division: "magnative",
    sourceType: "magnative_project",
    sourceId: input.projectId,
    category: input.category as ExpenseCategory,
    amount: input.amount,
    picName: existing.pic_name,
    paymentMethod: input.paymentMethod,
    reimbursementStatus: existing.reimbursement_status,
    notes: input.description,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function deleteProjectCost(id: string): Promise<MutationResult> {
  // Tahap C: baris ini sekarang milik `event_expenses` (lihat
  // `addProjectCost` di atas) — hapus lewat action yang sama dipakai
  // halaman Realisasi Event, supaya bukti transaksi & file di Storage-nya
  // (kalau sempat ditambahkan dari sana) ikut dibersihkan.
  const result = await deleteEventExpense(id);
  if (!result.ok) {
    return result;
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/** Sama untuk add & update — status "Revisi" tanpa catatan bikin reviewer lain tidak tahu apa yang perlu diperbaiki. */
function validateContentPostInput(input: Omit<ContentPost, "id">): string | null {
  if (!input.title?.trim()) return "Judul konten wajib diisi.";
  if (!input.tanggalPosting) return "Tanggal posting wajib diisi.";
  if (input.status === "Revisi" && !input.feedbackRevisi?.trim()) {
    return 'Catatan revisi wajib diisi kalau status "Revisi".';
  }
  return null;
}

export async function addContentPost(input: Omit<ContentPost, "id">): Promise<MutationResult> {
  const validationError = validateContentPostInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("magnative_content_posts").insert({
    client_id: input.clientId ?? null,
    title: input.title,
    platform: input.platform,
    tanggal_posting: input.tanggalPosting,
    status: input.status,
    catatan: input.catatan ?? null,
    feedback_revisi: input.status === "Revisi" ? input.feedbackRevisi!.trim() : null,
  });

  if (error) {
    console.error("[magnative] addContentPost gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "create", entityType: "konten", entityLabel: input.title });
  return { ok: true };
}

export async function updateContentPost(id: string, input: Omit<ContentPost, "id">): Promise<MutationResult> {
  const validationError = validateContentPostInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("magnative_content_posts")
    .update({
      client_id: input.clientId ?? null,
      title: input.title,
      platform: input.platform,
      tanggal_posting: input.tanggalPosting,
      status: input.status,
      catatan: input.catatan ?? null,
      feedback_revisi: input.status === "Revisi" ? input.feedbackRevisi!.trim() : null,
    })
    .eq("id", id);

  if (error) {
    console.error("[magnative] updateContentPost gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "update", entityType: "konten", entityLabel: input.title });
  return { ok: true };
}

/**
 * Aksi cepat ganti status konten (Tahap 28b) — dipakai tombol
 * "Setujui"/"Minta Revisi"/"Tandai Tayang" di baris tabel ContentPlanner,
 * TANPA harus buka modal edit penuh. Terpisah dari `updateContentPost`
 * (yang mengubah seluruh field) supaya klik satu tombol tidak perlu
 * mengirim ulang judul/platform/tanggal yang tidak berubah.
 */
export async function updateContentStatus(
  id: string,
  status: ContentStatus,
  feedbackRevisi?: string
): Promise<MutationResult> {
  if (status === "Revisi" && !feedbackRevisi?.trim()) {
    return { ok: false, error: 'Catatan revisi wajib diisi supaya tim tahu apa yang perlu diperbaiki.' };
  }

  const supabase = await createClient();
  const { data: postRow } = await supabase
    .from("magnative_content_posts")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("magnative_content_posts")
    .update({
      status,
      feedback_revisi: status === "Revisi" ? feedbackRevisi!.trim() : null,
    })
    .eq("id", id);

  if (error) {
    console.error("[magnative] updateContentStatus gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "magnative",
    action: "update",
    entityType: "konten",
    entityLabel: postRow?.title,
    detail: `status → ${status}`,
  });
  return { ok: true };
}

export async function deleteContentPost(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: postRow } = await supabase
    .from("magnative_content_posts")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("magnative_content_posts").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deleteContentPost gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "delete", entityType: "konten", entityLabel: postRow?.title });
  return { ok: true };
}

/**
 * Galeri portofolio Magnativ — model FOLDER/ALBUM (migrasi 0057,
 * direstrukturisasi dari flat photo migrasi 0012) menggantikan
 * PlaceholderGallery statis lama di halaman Ringkasan Magnative. Pakai
 * `FormData` (bukan objek biasa seperti action lain di file ini) karena
 * action pembuatan/penambahan foto perlu membawa banyak `File` sekaligus
 * lewat batas Server Action — payload JSON tidak bisa membawa data biner.
 *
 * Update Opsional 1 butir 5: satu folder sekarang bisa memuat BANYAK foto
 * sekaligus (ditampilkan sebagai slide lewat `PhotoCarousel`) dan
 * portofolio tampil lintas divisi (widget Dashboard Hub) — makanya tiap
 * mutasi di bawah ini juga `revalidatePath("/dashboard")`, bukan cuma
 * `MODULE_PATH`.
 *
 * Urutan upload-lalu-insert (bukan sebaliknya) tetap dipertahankan (sama
 * seperti sebelum migrasi 0057) supaya kalau insert baris metadata gagal,
 * file yang sudah terlanjur ter-upload langsung dibersihkan
 * (`storage.remove`) — tidak ada file yatim piatu di bucket yang tidak
 * tercatat di tabel.
 */
function extractPortfolioFiles(formData: FormData): File[] {
  return formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

async function uploadPortfolioPhotos(
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
      .from(PORTFOLIO_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined });

    if (uploadError) {
      console.error("[magnative] Upload foto portofolio gagal:", uploadError.message);
      return { ok: false, error: GENERIC_ERROR, uploadedPaths };
    }
    uploadedPaths.push(storagePath);
  }

  return { ok: true, storagePaths: uploadedPaths };
}

export async function createPortfolioFolder(formData: FormData): Promise<MutationResult> {
  const supabase = await createClient();
  const title = String(formData.get("title") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim();
  const files = extractPortfolioFiles(formData);

  if (!title) {
    return { ok: false, error: "Judul folder wajib diisi." };
  }
  if (files.length === 0) {
    return { ok: false, error: "Pilih minimal satu foto terlebih dahulu." };
  }

  const uploadResult = await uploadPortfolioPhotos(supabase, files);
  if (!uploadResult.ok) {
    if (uploadResult.uploadedPaths.length > 0) {
      await supabase.storage.from(PORTFOLIO_BUCKET).remove(uploadResult.uploadedPaths);
    }
    return { ok: false, error: uploadResult.error };
  }

  const { data: folderRow, error: folderError } = await supabase
    .from("magnative_portfolio_folders")
    .insert({ title, caption: caption || null })
    .select("id")
    .single();

  if (folderError || !folderRow) {
    console.error("[magnative] Buat folder portofolio gagal:", folderError?.message);
    await supabase.storage.from(PORTFOLIO_BUCKET).remove(uploadResult.storagePaths);
    return { ok: false, error: GENERIC_ERROR };
  }

  const photoRows = uploadResult.storagePaths.map((storagePath, index) => ({
    folder_id: folderRow.id,
    storage_path: storagePath,
    photo_url: supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(storagePath).data.publicUrl,
    position: index,
  }));

  const { error: insertError } = await supabase.from("magnative_portfolio").insert(photoRows);

  if (insertError) {
    console.error("[magnative] Simpan data foto portofolio gagal:", insertError.message);
    await supabase.storage.from(PORTFOLIO_BUCKET).remove(uploadResult.storagePaths);
    await supabase.from("magnative_portfolio_folders").delete().eq("id", folderRow.id);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  revalidatePath("/dashboard");
  void logActivity({ module: "magnative", action: "create", entityType: "portofolio", entityLabel: title });
  return { ok: true };
}

/**
 * Tambah foto baru ke folder yang sudah ada (Update Opsional 1 butir 5 —
 * "dalam 1 folder porto dibuat bisa menambah beberapa foto") — `position`
 * lanjut dari foto terakhir di folder itu supaya urutan slide-nya tidak
 * kacau/tertumpuk di posisi 0.
 */
export async function addPhotosToFolder(folderId: string, formData: FormData): Promise<MutationResult> {
  const supabase = await createClient();
  const files = extractPortfolioFiles(formData);

  if (files.length === 0) {
    return { ok: false, error: "Pilih minimal satu foto terlebih dahulu." };
  }

  const { data: lastPhoto } = await supabase
    .from("magnative_portfolio")
    .select("position")
    .eq("folder_id", folderId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();

  const uploadResult = await uploadPortfolioPhotos(supabase, files);
  if (!uploadResult.ok) {
    if (uploadResult.uploadedPaths.length > 0) {
      await supabase.storage.from(PORTFOLIO_BUCKET).remove(uploadResult.uploadedPaths);
    }
    return { ok: false, error: uploadResult.error };
  }

  const startPosition = (lastPhoto?.position ?? -1) + 1;
  const photoRows = uploadResult.storagePaths.map((storagePath, index) => ({
    folder_id: folderId,
    storage_path: storagePath,
    photo_url: supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(storagePath).data.publicUrl,
    position: startPosition + index,
  }));

  const { error: insertError } = await supabase.from("magnative_portfolio").insert(photoRows);

  if (insertError) {
    console.error("[magnative] Tambah foto ke folder portofolio gagal:", insertError.message);
    await supabase.storage.from(PORTFOLIO_BUCKET).remove(uploadResult.storagePaths);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  revalidatePath("/dashboard");
  void logActivity({
    module: "magnative",
    action: "update",
    entityType: "portofolio",
    entityLabel: `+${files.length} foto`,
  });
  return { ok: true };
}

export async function updatePortfolioFolder(
  id: string,
  input: { title: string; caption?: string }
): Promise<MutationResult> {
  const supabase = await createClient();
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "Judul folder wajib diisi." };
  }

  const { error } = await supabase
    .from("magnative_portfolio_folders")
    .update({ title, caption: input.caption?.trim() || null })
    .eq("id", id);

  if (error) {
    console.error("[magnative] updatePortfolioFolder gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  revalidatePath("/dashboard");
  void logActivity({ module: "magnative", action: "update", entityType: "portofolio", entityLabel: title });
  return { ok: true };
}

/** Hapus satu foto DI DALAM folder (folder & foto lainnya tetap ada) — lihat `deletePortfolioFolder` untuk hapus seluruh folder sekaligus. */
export async function deletePortfolioPhoto(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: photoRow } = await supabase
    .from("magnative_portfolio")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("magnative_portfolio").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deletePortfolioPhoto gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (photoRow?.storage_path) {
    await supabase.storage.from(PORTFOLIO_BUCKET).remove([photoRow.storage_path]);
  }
  revalidatePath(MODULE_PATH);
  revalidatePath("/dashboard");
  void logActivity({ module: "magnative", action: "delete", entityType: "portofolio" });
  return { ok: true };
}

/**
 * Hapus seluruh folder sekaligus semua fotonya — baris `magnative_portfolio`
 * ikut terhapus otomatis lewat `on delete cascade` (migrasi 0057), tapi
 * file di Supabase Storage TIDAK ikut terhapus otomatis oleh cascade itu
 * (cascade cuma untuk baris database) — path-nya makanya diambil dulu di
 * sini sebelum folder (dan foto-fotonya) dihapus.
 */
export async function deletePortfolioFolder(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: folderRow } = await supabase
    .from("magnative_portfolio_folders")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  const { data: photoRows } = await supabase.from("magnative_portfolio").select("storage_path").eq("folder_id", id);

  const { error } = await supabase.from("magnative_portfolio_folders").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deletePortfolioFolder gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const storagePaths = (photoRows ?? []).map((row) => row.storage_path).filter(Boolean);
  if (storagePaths.length > 0) {
    await supabase.storage.from(PORTFOLIO_BUCKET).remove(storagePaths);
  }
  revalidatePath(MODULE_PATH);
  revalidatePath("/dashboard");
  void logActivity({ module: "magnative", action: "delete", entityType: "portofolio", entityLabel: folderRow?.title });
  return { ok: true };
}

/**
 * Permintaan konten dari klien (Tahap 28b, migrasi 0026) — lihat komentar
 * `ContentRequest` di types.ts untuk kenapa tabel ini terpisah dari
 * `ContentPost`.
 */
export async function addContentRequest(input: Omit<ContentRequest, "id" | "status">): Promise<MutationResult> {
  if (!input.clientId) {
    return { ok: false, error: "Klien wajib dipilih." };
  }
  if (!input.title?.trim() || !input.description?.trim()) {
    return { ok: false, error: "Judul dan deskripsi kebutuhan wajib diisi." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("magnative_content_requests").insert({
    client_id: input.clientId,
    title: input.title.trim(),
    description: input.description.trim(),
    deadline: input.deadline || null,
    priority: input.priority,
    catatan: input.catatan?.trim() || null,
    created_by: user?.id ?? null,
  });

  if (error) {
    console.error("[magnative] addContentRequest gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);

  void notifyDivision("magnative", {
    title: "Permintaan Konten Baru",
    body: `Permintaan konten "${input.title.trim()}" baru masuk — prioritas ${input.priority}.`,
    url: "/dashboard/magnative/permintaan",
  });
  void logActivity({ module: "magnative", action: "create", entityType: "permintaan konten", entityLabel: input.title });
  return { ok: true };
}

export async function updateContentRequestStatus(id: string, status: ContentRequestStatus): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: reqRow } = await supabase
    .from("magnative_content_requests")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("magnative_content_requests").update({ status }).eq("id", id);
  if (error) {
    console.error("[magnative] updateContentRequestStatus gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "magnative",
    action: "update",
    entityType: "permintaan konten",
    entityLabel: reqRow?.title,
    detail: `status → ${status}`,
  });
  return { ok: true };
}

export async function deleteContentRequest(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: reqRow } = await supabase
    .from("magnative_content_requests")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("magnative_content_requests").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deleteContentRequest gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "delete", entityType: "permintaan konten", entityLabel: reqRow?.title });
  return { ok: true };
}

/**
 * Galeri aset kreatif (Tahap 28b, migrasi 0026) — pola upload sama persis
 * dengan `addPortfolioPhoto` (FormData supaya bisa membawa `File`,
 * upload-lalu-insert supaya file yatim piatu dibersihkan kalau insert
 * metadatanya gagal), bedanya file di sini boleh gambar ATAU video (bukan
 * cuma gambar), jadi `file_type` disimpan supaya UI tahu cara menampilkan
 * pratinjaunya (`<img>`/`<video>`/ikon generik untuk file lain seperti PDF
 * template desain).
 */
export async function addCreativeAsset(formData: FormData): Promise<MutationResult> {
  const supabase = await createClient();
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "Lainnya") as CreativeAssetCategory;
  const caption = String(formData.get("caption") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pilih file terlebih dahulu." };
  }
  if (!title) {
    return { ok: false, error: "Judul aset wajib diisi." };
  }

  const fileType: "image" | "video" | "other" = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : "other";

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
  const storagePath = `${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(CREATIVE_ASSETS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined });

  if (uploadError) {
    console.error("[magnative] Upload aset kreatif gagal:", uploadError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CREATIVE_ASSETS_BUCKET).getPublicUrl(storagePath);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: insertError } = await supabase.from("magnative_creative_assets").insert({
    title,
    category,
    file_url: publicUrl,
    storage_path: storagePath,
    file_type: fileType,
    caption: caption || null,
    uploaded_by: user?.id ?? null,
  });

  if (insertError) {
    console.error("[magnative] Simpan data aset kreatif gagal:", insertError.message);
    await supabase.storage.from(CREATIVE_ASSETS_BUCKET).remove([storagePath]);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "create", entityType: "aset kreatif", entityLabel: title });
  return { ok: true };
}

export async function deleteCreativeAsset(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: assetRow } = await supabase
    .from("magnative_creative_assets")
    .select("title, storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("magnative_creative_assets").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deleteCreativeAsset gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (assetRow?.storage_path) {
    await supabase.storage.from(CREATIVE_ASSETS_BUCKET).remove([assetRow.storage_path]);
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "delete", entityType: "aset kreatif", entityLabel: assetRow?.title });
  return { ok: true };
}

/**
 * Komentar/anotasi aset kreatif ("proofing ringan", Update Opsional 2) —
 * lihat komentar `AssetComment` di types.ts. `getAssetComments` sengaja
 * ada di file "use server" ini (bukan data.ts) supaya modal komentar bisa
 * memanggilnya langsung sebagai Server Action saat dibuka per aset, tanpa
 * membebani MagnativeDataProvider dengan komentar SEMUA aset sekaligus
 * (kebanyakan aset tidak pernah dibuka untuk direview).
 */
export async function getAssetComments(assetId: string): Promise<AssetComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnative_asset_comments")
    .select("*")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: true })
    .returns<AssetCommentRow[]>();

  if (error) {
    console.error("[magnative] getAssetComments gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToAssetComment);
}

export async function addAssetComment(assetId: string, commentText: string): Promise<MutationResult> {
  const text = commentText.trim();
  if (!text) return { ok: false, error: "Komentar tidak boleh kosong." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let authorName = "Tidak diketahui";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string }>();
    authorName = profile?.full_name?.trim() || authorName;
  }

  const { error } = await supabase
    .from("magnative_asset_comments")
    .insert({ asset_id: assetId, author_name: authorName, comment_text: text });

  if (error) {
    console.error("[magnative] addAssetComment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function setAssetCommentResolved(id: string, isResolved: boolean): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnative_asset_comments").update({ is_resolved: isResolved }).eq("id", id);
  if (error) {
    console.error("[magnative] setAssetCommentResolved gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function deleteAssetComment(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnative_asset_comments").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deleteAssetComment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Basis data vendor/supplier (Update Opsional 2) — lihat komentar `Vendor`
 * di types.ts. CRUD sederhana, sama pola dengan `Client`.
 */
function validateVendorInput(input: Omit<Vendor, "id">): string | null {
  if (!input.name?.trim()) return "Nama vendor wajib diisi.";
  return null;
}

export async function addVendor(input: Omit<Vendor, "id">): Promise<MutationResult> {
  const validationError = validateVendorInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("magnative_vendors").insert({
    name: input.name.trim(),
    category: input.category,
    contact_name: input.contactName?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    contact_email: input.contactEmail?.trim() || null,
    catatan: input.catatan?.trim() || null,
  });

  if (error) {
    console.error("[magnative] addVendor gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "create", entityType: "vendor", entityLabel: input.name });
  return { ok: true };
}

export async function updateVendor(id: string, input: Omit<Vendor, "id">): Promise<MutationResult> {
  const validationError = validateVendorInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("magnative_vendors")
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
    console.error("[magnative] updateVendor gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "update", entityType: "vendor", entityLabel: input.name });
  return { ok: true };
}

/** Cegah hapus vendor yang masih terkait ke proyek mana pun -- staf harus lepas kaitannya dulu di tiap proyek (lihat `deleteProjectVendor`). */
export async function deleteVendor(id: string): Promise<MutationResult> {
  const supabase = await createClient();

  const { count, error: linkError } = await supabase
    .from("magnative_project_vendors")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", id);

  if (linkError) {
    console.error("[magnative] Cek kaitan vendor sebelum hapus gagal:", linkError.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Vendor ini masih dikaitkan ke proyek. Lepas kaitannya dulu di tiap proyek sebelum menghapus." };
  }

  const { data: vendorRow } = await supabase.from("magnative_vendors").select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from("magnative_vendors").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deleteVendor gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "delete", entityType: "vendor", entityLabel: vendorRow?.name });
  return { ok: true };
}

/** Kaitkan/lepas vendor ke satu proyek tertentu -- lihat komentar `ProjectVendor` di types.ts. */
export async function addProjectVendor(input: Omit<ProjectVendor, "id">): Promise<MutationResult> {
  if (!input.vendorId) return { ok: false, error: "Vendor wajib dipilih." };

  const supabase = await createClient();
  const { error } = await supabase.from("magnative_project_vendors").insert({
    project_id: input.projectId,
    vendor_id: input.vendorId,
    keterangan: input.keterangan?.trim() || null,
    biaya_estimasi: input.biayaEstimasi || 0,
  });

  if (error) {
    console.error("[magnative] addProjectVendor gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function updateProjectVendor(id: string, input: Omit<ProjectVendor, "id">): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("magnative_project_vendors")
    .update({
      vendor_id: input.vendorId,
      keterangan: input.keterangan?.trim() || null,
      biaya_estimasi: input.biayaEstimasi || 0,
    })
    .eq("id", id);

  if (error) {
    console.error("[magnative] updateProjectVendor gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function deleteProjectVendor(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnative_project_vendors").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deleteProjectVendor gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Task/sub-pekerjaan per proyek (Update Opsional 2) -- lihat komentar
 * `ProjectTask` di types.ts. `updateProjectTaskStatus` terpisah dari
 * `updateProjectTask` (pola sama seperti `updateContentStatus`) supaya
 * tombol ganti status cepat di daftar tidak perlu mengirim ulang seluruh
 * field yang tidak berubah.
 */
function validateProjectTaskInput(input: Omit<ProjectTask, "id" | "picName">): string | null {
  if (!input.title?.trim()) return "Judul task wajib diisi.";
  return null;
}

export async function addProjectTask(input: Omit<ProjectTask, "id" | "picName">): Promise<MutationResult> {
  const validationError = validateProjectTaskInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("magnative_project_tasks").insert({
    project_id: input.projectId,
    title: input.title.trim(),
    detail: input.detail?.trim() || null,
    status: input.status,
    due_date: input.dueDate || null,
    pic: input.pic || null,
    sort_order: input.sortOrder ?? 0,
    vendor_id: input.vendorId || null,
    biaya_estimasi: input.biayaEstimasi ?? null,
  });

  if (error) {
    console.error("[magnative] addProjectTask gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "create", entityType: "task proyek", entityLabel: input.title });
  return { ok: true };
}

export async function updateProjectTask(id: string, input: Omit<ProjectTask, "id" | "picName">): Promise<MutationResult> {
  const validationError = validateProjectTaskInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("magnative_project_tasks")
    .update({
      title: input.title.trim(),
      detail: input.detail?.trim() || null,
      status: input.status,
      due_date: input.dueDate || null,
      pic: input.pic || null,
      sort_order: input.sortOrder ?? 0,
      vendor_id: input.vendorId || null,
      biaya_estimasi: input.biayaEstimasi ?? null,
    })
    .eq("id", id);

  if (error) {
    console.error("[magnative] updateProjectTask gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function updateProjectTaskStatus(id: string, status: ProjectTaskStatus): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnative_project_tasks").update({ status }).eq("id", id);
  if (error) {
    console.error("[magnative] updateProjectTaskStatus gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function deleteProjectTask(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: taskRow } = await supabase.from("magnative_project_tasks").select("title").eq("id", id).maybeSingle();

  const { error } = await supabase.from("magnative_project_tasks").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deleteProjectTask gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "delete", entityType: "task proyek", entityLabel: taskRow?.title });
  return { ok: true };
}

/**
 * Modul "Pipeline Proposal" (rekomendasi 2 laporan gap-event vs SOP,
 * migrasi 0064) -- mendigitalkan tahap SEBELUM menang/kalah (papan tulis
 * Owner: Invitation -> Briefing -> Submit -> Present). `updateProjectPipelineStage`
 * terpisah dari `updateProject` (pola sama seperti `updateProjectTaskStatus`)
 * supaya tombol "majukan tahap" di modal tidak perlu mengirim ulang seluruh
 * field proyek yang tidak berubah.
 */
export async function updateProjectPipelineStage(
  projectId: string,
  stage: PipelineStage | null
): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnative_projects").update({ pipeline_stage: stage }).eq("id", projectId);
  if (error) {
    console.error("[magnative] updateProjectPipelineStage gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Upload file pendukung tiap tahap pipeline (MOM/rekaman/draft proposal) --
 * pola upload sama persis dengan `addCreativeAsset`: FormData supaya bisa
 * membawa `File`, upload-lalu-insert supaya file yatim piatu dibersihkan
 * kalau insert metadatanya gagal. Bebas format (PDF/Word/PPT/audio/dll),
 * disetujui Owner lewat pertanyaan klarifikasi -- lihat komentar migrasi 0064.
 */
export async function uploadPipelineFile(formData: FormData): Promise<MutationResult> {
  const supabase = await createClient();
  const file = formData.get("file");
  const projectId = String(formData.get("projectId") ?? "").trim();
  const stage = String(formData.get("stage") ?? "") as PipelineStage;
  const notes = String(formData.get("notes") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pilih file terlebih dahulu." };
  }
  if (!projectId) {
    return { ok: false, error: "Proyek tidak ditemukan." };
  }
  if (!["Invitation", "Briefing", "Submit", "Present"].includes(stage)) {
    return { ok: false, error: "Tahap pipeline tidak valid." };
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
  const storagePath = `${projectId}/${stage}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PIPELINE_FILES_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined });

  if (uploadError) {
    console.error("[magnative] Upload file pipeline gagal:", uploadError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PIPELINE_FILES_BUCKET).getPublicUrl(storagePath);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: insertError } = await supabase.from("magnative_pipeline_files").insert({
    project_id: projectId,
    stage,
    file_name: file.name,
    file_url: publicUrl,
    storage_path: storagePath,
    notes: notes || null,
    uploaded_by: user?.id ?? null,
  });

  if (insertError) {
    console.error("[magnative] Simpan data file pipeline gagal:", insertError.message);
    await supabase.storage.from(PIPELINE_FILES_BUCKET).remove([storagePath]);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "create", entityType: "file pipeline proposal", entityLabel: file.name });
  return { ok: true };
}

export async function deletePipelineFile(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: fileRow } = await supabase
    .from("magnative_pipeline_files")
    .select("file_name, storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("magnative_pipeline_files").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deletePipelineFile gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (fileRow?.storage_path) {
    await supabase.storage.from(PIPELINE_FILES_BUCKET).remove([fileRow.storage_path]);
  }
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "magnative", action: "delete", entityType: "file pipeline proposal", entityLabel: fileRow?.file_name });
  return { ok: true };
}

/**
 * Check-in QR & analitik on-site sederhana (rekomendasi Bagian 5-B #10,
 * migrasi 0068) -- staf membuat link per proyek (`createCheckinLink`),
 * tamu scan QR-nya dan submit lewat halaman publik `/checkin/[token]`
 * (`getCheckinLinkInfo` + `submitCheckin`, pakai `createAdminClient`
 * seperti portal klien -- bukan lewat RLS staf). Staf lihat rekap
 * kehadiran lewat `getCheckinStats`.
 */
export async function createCheckinLink(projectId: string, label?: string): Promise<MutationResult & { token?: string }> {
  const token = randomBytes(20).toString("hex");
  const supabase = await createClient();
  const { error } = await supabase
    .from("magnative_checkin_links")
    .insert({ project_id: projectId, token, label: label?.trim() || null });

  if (error) {
    console.error("[magnative] createCheckinLink gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true, token };
}

export async function listCheckinLinks(projectId: string): Promise<CheckinLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magnative_checkin_links")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .returns<CheckinLinkRow[]>();

  if (error) {
    console.error("[magnative] listCheckinLinks gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToCheckinLink);
}

export async function deleteCheckinLink(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("magnative_checkin_links").delete().eq("id", id);
  if (error) {
    console.error("[magnative] deleteCheckinLink gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATH);
  return { ok: true };
}

export async function getCheckinStats(projectId: string): Promise<CheckinStats> {
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("magnative_checkin_links")
    .select("id")
    .eq("project_id", projectId)
    .returns<{ id: string }[]>();

  const linkIds = (links ?? []).map((l) => l.id);
  if (linkIds.length === 0) return { totalCheckins: 0, checkins: [] };

  const { data, error } = await supabase
    .from("magnative_checkins")
    .select("*")
    .in("checkin_link_id", linkIds)
    .order("checked_in_at", { ascending: false })
    .returns<CheckinRow[]>();

  if (error) {
    console.error("[magnative] getCheckinStats gagal:", error.message);
    return { totalCheckins: 0, checkins: [] };
  }
  const checkins = (data ?? []).map(rowToCheckin);
  return { totalCheckins: checkins.length, checkins };
}

export type CheckinLinkInfo = { projectName: string; label?: string } | null;

/**
 * Info link check-in untuk halaman publik `/checkin/[token]` -- PAKAI
 * `createAdminClient` (service-role, bypass RLS) sama seperti
 * `getPortalSummaryByToken` di lib/portal/actions.ts, karena tamu yang
 * scan QR TIDAK login.
 */
export async function getCheckinLinkInfo(token: string): Promise<CheckinLinkInfo> {
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("magnative_checkin_links")
    .select("id, label, project_id")
    .eq("token", token)
    .maybeSingle<{ id: string; label: string | null; project_id: string }>();

  if (!link) return null;

  const { data: project } = await admin
    .from("magnative_projects")
    .select("name")
    .eq("id", link.project_id)
    .maybeSingle<{ name: string }>();

  if (!project) return null;
  return { projectName: project.name, label: link.label ?? undefined };
}

export async function submitCheckin(token: string, guestName?: string): Promise<MutationResult> {
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("magnative_checkin_links")
    .select("id")
    .eq("token", token)
    .maybeSingle<{ id: string }>();

  if (!link) return { ok: false, error: "Link check-in tidak valid." };

  const { error } = await admin
    .from("magnative_checkins")
    .insert({ checkin_link_id: link.id, guest_name: guestName?.trim() || null });

  if (error) {
    console.error("[magnative] submitCheckin gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  return { ok: true };
}
