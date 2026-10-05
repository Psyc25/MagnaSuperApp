"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";
import { notifyDivision, notifyUsers } from "@/lib/push/notify";
import {
  CHECKLIST_PHASE_LABELS,
  type ChecklistComment,
  type ChecklistItemExtraInput,
  type ChecklistPhase,
  type ChecklistReviewPhase,
  type ChecklistStatusLogEntry,
  type CreateEventInput,
  type CreateEventTypeInput,
  type EventSourceType,
  type EventStatus,
  type LinkableSource,
  type TemplateImportRow,
  type TemplateImportSummary,
  type TemplateItemInput,
  type UpdateChecklistProgressInput,
} from "./types";

// Tahap G: halaman "Jenis Event" sudah digabung jadi tab di dalam
// "/dashboard/admin/events" (`EventAdminTabs`), jadi dulu ada MODULE_PATH
// terpisah yang menunjuk ke halaman jenis-event lama -- sekarang sama
// dengan EVENTS_PATH, jadi cukup satu konstanta ini saja.
const EVENTS_PATH = "/dashboard/admin/events";
/** Papan Tracking (Tahap D) -- halaman terpisah dari EVENTS_PATH di atas,
 * dibuka untuk 3 divisi operasional + akses penuh (lihat page.tsx-nya). */
const TRACKING_PATH = "/dashboard/tracking-event";
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";
const CHECKLIST_PHOTO_BUCKET = "event-checklist-photos";
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Tambah jenis event baru (Tahap B) -- daftar TERBUKA, Admin (division
 * "all") bisa terus menambah jenis baru kapan saja (mis. muncul jenis event
 * baru yang belum pernah ada template-nya), bukan daftar tertutup yang
 * dikunci dari awal.
 */
export async function createEventType(input: CreateEventTypeInput): Promise<MutationResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama jenis event wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.from("event_types").insert({
    name,
    description: input.description?.trim() || null,
  });

  if (error) {
    console.error("[events] createEventType gagal:", error.message);
    if (error.code === "23505") {
      return { ok: false, error: `Jenis event "${name}" sudah ada.` };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(EVENTS_PATH);
  void logActivity({ module: "admin", action: "create", entityType: "jenis event", entityLabel: name });
  return { ok: true };
}

export async function updateEventType(id: string, input: CreateEventTypeInput): Promise<MutationResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama jenis event wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_types")
    .update({ name, description: input.description?.trim() || null })
    .eq("id", id);

  if (error) {
    console.error("[events] updateEventType gagal:", error.message);
    if (error.code === "23505") {
      return { ok: false, error: `Jenis event "${name}" sudah ada.` };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(EVENTS_PATH);
  void logActivity({ module: "admin", action: "update", entityType: "jenis event", entityLabel: name });
  return { ok: true };
}

/** Nonaktifkan/aktifkan jenis event -- SENGAJA tidak ada hapus permanen:
 * jenis event yang sudah pernah dipakai bisa saja masih dirujuk oleh event
 * lama (`events.event_type_id`, on delete set null kalau tetap dihapus,
 * tapi itu akan memutus riwayat jenis event-nya secara diam-diam). Sama
 * seperti pola `setAccountActive` di modul Akuntansi. */
export async function setEventTypeActive(id: string, isActive: boolean): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("event_types")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) return { ok: false, error: "Jenis event tidak ditemukan." };

  const { error } = await supabase.from("event_types").update({ is_active: isActive }).eq("id", id);
  if (error) {
    console.error("[events] setEventTypeActive gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(EVENTS_PATH);
  void logActivity({
    module: "admin",
    action: "update",
    entityType: "jenis event",
    entityLabel: `${existing.name} (${isActive ? "diaktifkan" : "dinonaktifkan"})`,
  });
  return { ok: true };
}

/**
 * Hapus jenis event PERMANEN -- HANYA diizinkan kalau belum ada satu pun
 * event yang memakai jenis ini (`events.event_type_id`). Kalau sudah
 * pernah dipakai, tolak dan arahkan ke nonaktifkan (`setEventTypeActive`)
 * saja -- lihat komentar di fungsi itu kenapa hapus paksa berbahaya untuk
 * riwayat event lama. Template checklist-nya (`event_type_template_items`)
 * ikut terhapus otomatis lewat ON DELETE CASCADE kalau memang lolos cek.
 */
export async function deleteEventType(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("event_types")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) return { ok: false, error: "Jenis event tidak ditemukan." };

  const { count, error: countError } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("event_type_id", id);

  if (countError) {
    console.error("[events] deleteEventType: gagal cek pemakaian:", countError.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Jenis event "${existing.name}" sudah dipakai ${count} event. Tidak bisa dihapus permanen -- nonaktifkan saja supaya tidak muncul lagi di pilihan baru.`,
    };
  }

  const { error } = await supabase.from("event_types").delete().eq("id", id);
  if (error) {
    console.error("[events] deleteEventType gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(EVENTS_PATH);
  void logActivity({ module: "admin", action: "delete", entityType: "jenis event", entityLabel: existing.name });
  return { ok: true };
}

export async function addTemplateItem(eventTypeId: string, input: TemplateItemInput, sortOrder: number): Promise<MutationResult> {
  const category = input.category.trim();
  const itemName = input.itemName.trim();
  if (!category) return { ok: false, error: "Kategori wajib diisi." };
  if (!itemName) return { ok: false, error: "Nama item wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.from("event_type_template_items").insert({
    event_type_id: eventTypeId,
    category,
    item_name: itemName,
    detail: input.detail?.trim() || null,
    qty_info: input.qtyInfo?.trim() || null,
    notes: input.notes?.trim() || null,
    sort_order: sortOrder,
  });

  if (error) {
    console.error("[events] addTemplateItem gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(EVENTS_PATH);
  return { ok: true };
}

export async function updateTemplateItem(id: string, input: TemplateItemInput): Promise<MutationResult> {
  const category = input.category.trim();
  const itemName = input.itemName.trim();
  if (!category) return { ok: false, error: "Kategori wajib diisi." };
  if (!itemName) return { ok: false, error: "Nama item wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_type_template_items")
    .update({
      category,
      item_name: itemName,
      detail: input.detail?.trim() || null,
      qty_info: input.qtyInfo?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .eq("id", id);

  if (error) {
    console.error("[events] updateTemplateItem gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(EVENTS_PATH);
  return { ok: true };
}

export async function deleteTemplateItem(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_type_template_items").delete().eq("id", id);
  if (error) {
    console.error("[events] deleteTemplateItem gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(EVENTS_PATH);
  return { ok: true };
}

export type BulkImportResult = { ok: true; summary: TemplateImportSummary } | { ok: false; error: string };

/**
 * Import massal template checklist dari Excel/CSV (Tahap B) -- file
 * di-parse di BROWSER (lihat EventTypeManager.tsx, pakai library `xlsx`,
 * pola sama seperti ProductManager.tsx) supaya Server Action ini cukup
 * menerima array data biasa.
 *
 * `mode: "replace"` menghapus SEMUA template item jenis event ini dulu
 * sebelum menyisipkan hasil import -- ini pilihan DEFAULT di UI karena
 * kasus paling umum adalah "koreksi file lalu import ulang", bukan
 * menumpuk baris duplikat. `mode: "append"` menambahkan tanpa menghapus,
 * untuk kasus menggabungkan beberapa file sumber.
 */
export async function bulkImportTemplateItems(
  eventTypeId: string,
  rows: TemplateImportRow[],
  mode: "replace" | "append"
): Promise<BulkImportResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "Tidak ada baris data untuk diimpor." };
  }

  const supabase = await createClient();

  const { data: eventType, error: eventTypeError } = await supabase
    .from("event_types")
    .select("name")
    .eq("id", eventTypeId)
    .maybeSingle();
  if (eventTypeError || !eventType) {
    return { ok: false, error: "Jenis event tidak ditemukan." };
  }

  if (mode === "replace") {
    const { error: deleteError } = await supabase
      .from("event_type_template_items")
      .delete()
      .eq("event_type_id", eventTypeId);
    if (deleteError) {
      console.error("[events] bulkImportTemplateItems: gagal hapus item lama:", deleteError.message);
      return { ok: false, error: GENERIC_ERROR };
    }
  }

  const summary: TemplateImportSummary = { inserted: 0, skipped: 0, errors: [] };
  const toInsert: {
    event_type_id: string;
    category: string;
    item_name: string;
    detail: string | null;
    qty_info: string | null;
    notes: string | null;
    sort_order: number;
  }[] = [];

  rows.forEach((row, index) => {
    const category = row.category?.trim();
    const itemName = row.itemName?.trim();
    if (!category || !itemName) {
      summary.skipped++;
      summary.errors.push(`Baris ${index + 1}: kategori atau nama item kosong, dilewati.`);
      return;
    }
    toInsert.push({
      event_type_id: eventTypeId,
      category,
      item_name: itemName,
      detail: row.detail?.trim() || null,
      qty_info: row.qtyInfo?.trim() || null,
      notes: row.notes?.trim() || null,
      sort_order: index * 10,
    });
  });

  if (toInsert.length === 0) {
    return { ok: false, error: "Semua baris tidak valid (kategori/nama item kosong)." };
  }

  const { error: insertError } = await supabase.from("event_type_template_items").insert(toInsert);
  if (insertError) {
    console.error("[events] bulkImportTemplateItems: gagal simpan:", insertError.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  summary.inserted = toInsert.length;

  revalidatePath(EVENTS_PATH);
  void logActivity({
    module: "admin",
    action: "create",
    entityType: "template checklist event",
    entityLabel: `${eventType.name} (${summary.inserted} item diimpor)`,
  });
  return { ok: true, summary };
}

// ---------------------------------------------------------------------
// Tahap C: event AKTUAL -- lihat komentar di types.ts.
// ---------------------------------------------------------------------

export type CreateEventResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Bikin event baru (titik "Event In" di diagram Owner) -- SENGAJA cuma
 * akses penuh yang bisa (RLS `events_insert`), staf 3 divisi operasional
 * baru terlibat lewat checklist & kaitan sesudahnya. Kalau `eventTypeId`
 * diisi, template checklist jenis itu langsung di-clone jadi checklist
 * AKTUAL event ini -- kalau kosong, checklist dimulai kosong (diisi
 * manual/import lewat halaman detail).
 *
 * Notifikasi ke 3 divisi operasional dikirim SETELAH event (+ clone
 * checklist) berhasil tersimpan -- best-effort, gagal kirim tidak
 * membatalkan event yang sudah dibuat (lihat komentar `notifyDivision`).
 */
export async function createEvent(input: CreateEventInput): Promise<CreateEventResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama event wajib diisi." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      name,
      client_name: input.clientName?.trim() || null,
      event_type_id: input.eventTypeId || null,
      location: input.location?.trim() || null,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      notes: input.notes?.trim() || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !event) {
    console.error("[events] createEvent gagal:", error?.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (input.eventTypeId) {
    const { data: templateItems, error: templateError } = await supabase
      .from("event_type_template_items")
      .select("category, item_name, detail, qty_info, notes, sort_order, default_needs_production")
      .eq("event_type_id", input.eventTypeId)
      .order("sort_order", { ascending: true });

    if (templateError) {
      console.error("[events] createEvent: gagal ambil template:", templateError.message);
    } else if (templateItems && templateItems.length > 0) {
      const { error: cloneError } = await supabase.from("event_checklist_items").insert(
        templateItems.map((t) => ({
          event_id: event.id,
          category: t.category,
          item_name: t.item_name,
          detail: t.detail,
          qty_info: t.qty_info,
          notes: t.notes,
          sort_order: t.sort_order,
          // Tahap 51: titik mulai alur fase baru langsung ditentukan dari
          // default template -- "Tidak" melompati Design/Mockup/Sample/
          // Production dan mulai dari Completed (lihat CHECKLIST_PHASES).
          needs_production: t.default_needs_production,
          current_phase: t.default_needs_production ? "design" : "completed",
        }))
      );
      if (cloneError) {
        console.error("[events] createEvent: gagal clone template:", cloneError.message);
      }
    }
  }

  revalidatePath(EVENTS_PATH);
  void logActivity({ module: "admin", action: "create", entityType: "event", entityLabel: name });
  void notifyDivision(
    ["magnarent", "magnative", "production"],
    {
      title: "Event Baru",
      body: `${name}${input.clientName ? ` — ${input.clientName.trim()}` : ""} baru dibuat. Cek checklist & kaitkan booking/proyek yang relevan.`,
      // Event baru sengaja ditandai "penting" (migrasi 0062) -- muncul
      // sebagai banner mencolok di AppShell (ImportantNotificationBanner)
      // dan push notification yang tidak hilang sendiri (lihat public/sw.js),
      // beda dari notifikasi rutin lain seperti booking/stok menipis.
      important: true,
    },
    user?.id
  );

  return { ok: true, id: event.id };
}

export async function updateEventStatus(id: string, status: EventStatus): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("events").select("name").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "Event tidak ditemukan." };

  const { error } = await supabase.from("events").update({ status }).eq("id", id);
  if (error) {
    console.error("[events] updateEventStatus gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(EVENTS_PATH);
  revalidatePath(`${EVENTS_PATH}/${id}`);
  void logActivity({
    module: "admin",
    action: "update",
    entityType: "event",
    entityLabel: `${existing.name} (status → ${status})`,
  });
  return { ok: true };
}

/**
 * Hapus event PERMANEN -- beda dari `updateEventStatus(id, "Dibatalkan")`
 * yang cuma mengubah status (dipakai kalau event batal tapi datanya tetap
 * mau disimpan sebagai riwayat). Ini untuk kasus event salah input/dibuat
 * coba-coba yang belum ada progres nyata.
 *
 * Checklist (`event_checklist_items`) dan kaitan booking/proyek
 * (`event_links`) ikut terhapus otomatis lewat ON DELETE CASCADE. TAPI
 * kalau salah satu booking/proyek yang dikaitkan ke event ini SUDAH punya
 * pengeluaran Realisasi Event tercatat (`event_expenses`, yang juga sudah
 * kepost ke jurnal akuntansi), hapus permanen DITOLAK -- supaya jejak
 * "pengeluaran ini untuk event apa" tidak hilang diam-diam. Untuk kasus
 * itu pakai ubah status ke "Dibatalkan" saja.
 */
export async function deleteEvent(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("events")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) return { ok: false, error: "Event tidak ditemukan." };

  const { data: links, error: linksError } = await supabase
    .from("event_links")
    .select("source_type, source_id")
    .eq("event_id", id);

  if (linksError) {
    console.error("[events] deleteEvent: gagal cek kaitan:", linksError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Pengeluaran yang dicatat LANGSUNG ke event ini (opsi "Event (Lintas
  // Divisi)" di Realisasi Event) + pengeluaran milik booking/proyek yang
  // dikaitkan. event_links menamai proyek booth 'production_booth_project',
  // sedangkan event_expenses memakai 'production_booth'.
  const expenseSources = [
    { source_type: "event_tracking", source_id: id },
    ...(links ?? []).map((link) => ({
      source_type: link.source_type === "production_booth_project" ? "production_booth" : link.source_type,
      source_id: link.source_id,
    })),
  ];
  for (const source of expenseSources) {
    const { count, error: expenseError } = await supabase
      .from("event_expenses")
      .select("id", { count: "exact", head: true })
      .eq("source_type", source.source_type)
      .eq("source_id", source.source_id);

    if (expenseError) {
      console.error("[events] deleteEvent: gagal cek pengeluaran:", expenseError.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error:
          'Event ini sudah punya pengeluaran Realisasi Event yang tercatat (sudah masuk jurnal akuntansi). Tidak bisa dihapus permanen -- pakai ubah status ke "Dibatalkan" saja supaya riwayatnya tetap ada.',
      };
    }
  }

  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) {
    console.error("[events] deleteEvent gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(EVENTS_PATH);
  void logActivity({ module: "admin", action: "delete", entityType: "event", entityLabel: existing.name });
  return { ok: true };
}

export async function addEventChecklistItem(
  eventId: string,
  input: TemplateItemInput & ChecklistItemExtraInput,
  sortOrder: number
): Promise<MutationResult> {
  const category = input.category.trim();
  const itemName = input.itemName.trim();
  if (!category) return { ok: false, error: "Kategori wajib diisi." };
  if (!itemName) return { ok: false, error: "Nama item wajib diisi." };

  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);

  // Tahap F: staf 3 divisi operasional kini boleh menambah item SENDIRI
  // langsung dari Papan Tracking (RLS event_checklist_items_insert sudah
  // terbuka ke mereka sejak migrasi 0053), TAPI cuma selama event masih
  // "Berjalan" (keputusan Owner: "terbuka sampai event selesai"). Admin/
  // Owner (akses penuh) TIDAK dibatasi status ini -- tetap bisa kelola
  // checklist event yang sudah Selesai/Dibatalkan dari halaman Admin
  // untuk keperluan koreksi/arsip, sama seperti sebelumnya.
  if (!access.isFullAccess) {
    const { data: eventRow } = await supabase
      .from("events")
      .select("status")
      .eq("id", eventId)
      .maybeSingle<{ status: string }>();
    if (!eventRow) return { ok: false, error: "Event tidak ditemukan." };
    if (eventRow.status !== "Berjalan") {
      return { ok: false, error: "Event ini sudah selesai/dibatalkan, tidak bisa menambah item lagi." };
    }
  }

  const needsProduction = input.needsProduction ?? true;
  const { error } = await supabase.from("event_checklist_items").insert({
    event_id: eventId,
    category,
    item_name: itemName,
    detail: input.detail?.trim() || null,
    qty_info: input.qtyInfo?.trim() || null,
    notes: input.notes?.trim() || null,
    sort_order: sortOrder,
    // Vendor/tim/deadline (rekomendasi 3/4/5, migrasi 0063) -- opsional,
    // TIDAK berlaku untuk template jenis event (lihat komentar
    // `ChecklistItemExtraInput` di types.ts).
    vendor_id: input.vendorId || null,
    team: input.team?.trim() || null,
    due_date: input.dueDate || null,
    // Tahap 51/F: titik mulai alur fase ditentukan dari toggle "Perlu
    // Produksi" (default Ya kalau tidak diisi) -- sebelumnya form Admin
    // tidak punya toggle ini sama sekali, item baru selalu diam-diam pakai
    // default kolom DB, jadi item yang sebetulnya tidak perlu produksi
    // tetap harus lewat Design/Mockup/Sample/Production dulu.
    needs_production: needsProduction,
    current_phase: needsProduction ? "design" : "completed",
    // Tahap F: siapa yang menambahkan (bukan PIC) -- dipakai guard
    // update/delete di bawah supaya staf cuma bisa ubah/hapus item
    // buatannya sendiri, Admin/Owner selalu bebas.
    created_by: access.userId,
  });

  if (error) {
    console.error("[events] addEventChecklistItem gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(`${EVENTS_PATH}/${eventId}`);
  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

export async function updateEventChecklistItem(
  id: string,
  eventId: string,
  input: TemplateItemInput & ChecklistItemExtraInput
): Promise<MutationResult> {
  const category = input.category.trim();
  const itemName = input.itemName.trim();
  if (!category) return { ok: false, error: "Kategori wajib diisi." };
  if (!itemName) return { ok: false, error: "Nama item wajib diisi." };

  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);

  // Tahap F: staf (bukan akses penuh) cuma boleh edit item yang DIA
  // SENDIRI tambahkan (lihat `created_by` di addEventChecklistItem), dan
  // cuma selama event masih "Berjalan" -- Admin/Owner tetap bebas edit
  // item siapapun kapan saja, sama seperti sebelumnya.
  if (!access.isFullAccess) {
    const [{ data: itemRow }, { data: eventRow }] = await Promise.all([
      supabase.from("event_checklist_items").select("created_by").eq("id", id).maybeSingle<{ created_by: string | null }>(),
      supabase.from("events").select("status").eq("id", eventId).maybeSingle<{ status: string }>(),
    ]);
    if (!itemRow) return { ok: false, error: "Item tidak ditemukan." };
    if (!access.userId || itemRow.created_by !== access.userId) {
      return { ok: false, error: "Anda hanya bisa mengedit item yang anda tambahkan sendiri." };
    }
    if (!eventRow || eventRow.status !== "Berjalan") {
      return { ok: false, error: "Event ini sudah selesai/dibatalkan, tidak bisa diedit lagi." };
    }
  }

  const { error } = await supabase
    .from("event_checklist_items")
    .update({
      category,
      item_name: itemName,
      detail: input.detail?.trim() || null,
      qty_info: input.qtyInfo?.trim() || null,
      notes: input.notes?.trim() || null,
      vendor_id: input.vendorId || null,
      team: input.team?.trim() || null,
      due_date: input.dueDate || null,
    })
    .eq("id", id);

  if (error) {
    console.error("[events] updateEventChecklistItem gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(`${EVENTS_PATH}/${eventId}`);
  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

/**
 * Update status & PIC satu item checklist (Tahap D, "Papan Tracking") --
 * SENGAJA action terpisah dari `updateEventChecklistItem` di atas: yang
 * itu untuk Admin edit kategori/nama/detail item (Tahap C), ini khusus
 * untuk staf 3 divisi operasional update progress di halaman tracking
 * mereka sendiri. RLS `event_checklist_items_update` sudah membuka UPDATE
 * ke 3 divisi + akses penuh sejak migrasi 0053, jadi tidak perlu guard
 * tambahan di sini -- Supabase yang menolak kalau bukan haknya.
 */
export async function updateEventChecklistProgress(
  id: string,
  eventId: string,
  input: UpdateChecklistProgressInput
): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("event_checklist_items")
    .update({ status: input.status, pic: input.picId })
    .eq("id", id);

  if (error) {
    console.error("[events] updateEventChecklistProgress gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Riwayat PIC per tahap (papan tulis Owner: "Preparation PIC",
  // "Production PIC", "Finish PIC" ditulis terpisah) -- baris log
  // APPEND-ONLY ditulis SETELAH update utama berhasil, migrasi 0065. Gagal
  // tulis log TIDAK membatalkan update status/PIC di atas (sudah berhasil
  // & sudah dilihat user) -- cukup dicatat ke console, konsisten dengan
  // pola `void logActivity(...)` di tempat lain di file ini.
  const { error: logError } = await supabase
    .from("event_checklist_status_log")
    .insert({ checklist_item_id: id, status: input.status, pic: input.picId });
  if (logError) {
    console.error("[events] gagal tulis riwayat status checklist:", logError.message);
  }

  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  revalidatePath(`${EVENTS_PATH}/${eventId}`);
  return { ok: true };
}

type ChecklistStatusLogRow = {
  id: string;
  checklist_item_id: string;
  status: ChecklistStatusLogEntry["status"];
  pic: string | null;
  changed_at: string;
};

/**
 * Riwayat lengkap satu item checklist, terbaru dulu -- dipanggil ON-DEMAND
 * dari `ChecklistHistoryModal` (bukan di-preload lewat `getEventById`)
 * supaya halaman Papan Tracking tidak perlu tarik histori SEMUA item
 * sekaligus tiap kali dibuka. Resolusi nama PIC pola sama persis dengan
 * `resolvePicNames` di data.ts, cuma tidak diekspor dari sana jadi ditulis
 * ulang ringkas di sini (migrasi 0065).
 */
export async function getChecklistStatusLog(checklistItemId: string): Promise<ChecklistStatusLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_checklist_status_log")
    .select("id, checklist_item_id, status, pic, changed_at")
    .eq("checklist_item_id", checklistItemId)
    .order("changed_at", { ascending: false })
    .returns<ChecklistStatusLogRow[]>();

  if (error) {
    console.error("[events] getChecklistStatusLog gagal:", error.message);
    return [];
  }

  const picIds = Array.from(new Set((data ?? []).map((r) => r.pic).filter((v): v is string => !!v)));
  let picNameById = new Map<string, string>();
  if (picIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", picIds);
    if (profilesError) {
      console.error("[events] getChecklistStatusLog: gagal ambil nama PIC:", profilesError.message);
    } else {
      picNameById = new Map((profiles ?? []).map((r) => [r.id as string, r.full_name as string]));
    }
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    checklistItemId: row.checklist_item_id,
    status: row.status,
    picId: row.pic ?? undefined,
    picName: row.pic ? picNameById.get(row.pic) : undefined,
    changedAt: row.changed_at,
  }));
}

export async function deleteEventChecklistItem(id: string, eventId: string): Promise<MutationResult> {
  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);

  // Tahap F: sama persis aturannya dengan `updateEventChecklistItem` di
  // atas -- staf cuma boleh hapus item buatannya sendiri, selama event
  // masih "Berjalan"; Admin/Owner tetap bebas.
  if (!access.isFullAccess) {
    const [{ data: itemRow }, { data: eventRow }] = await Promise.all([
      supabase.from("event_checklist_items").select("created_by").eq("id", id).maybeSingle<{ created_by: string | null }>(),
      supabase.from("events").select("status").eq("id", eventId).maybeSingle<{ status: string }>(),
    ]);
    if (!itemRow) return { ok: false, error: "Item tidak ditemukan." };
    if (!access.userId || itemRow.created_by !== access.userId) {
      return { ok: false, error: "Anda hanya bisa menghapus item yang anda tambahkan sendiri." };
    }
    if (!eventRow || eventRow.status !== "Berjalan") {
      return { ok: false, error: "Event ini sudah selesai/dibatalkan, tidak bisa dihapus lagi." };
    }
  }

  const { error } = await supabase.from("event_checklist_items").delete().eq("id", id);
  if (error) {
    console.error("[events] deleteEventChecklistItem gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(`${EVENTS_PATH}/${eventId}`);
  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

/** Import massal checklist AKTUAL satu event -- sama persis pola/parser
 * dengan `bulkImportTemplateItems`, cuma target tabelnya `event_checklist_
 * items` (status default "Belum Mulai", pic kosong -- diisi belakangan di
 * Papan Tracking, Tahap D).
 * `needsProduction` berlaku untuk SEMUA baris yang diimpor (dipilih Admin
 * di modal import) -- sebelumnya field ini tidak diisi sama sekali saat
 * import, jadi semua item diam-diam pakai default kolom DB (lewat Design/
 * Mockup/Sample/Production dulu) walau item itu sebenarnya tidak perlu
 * produksi, bikin Papan Tracking kelihatan "salah fase semua" buat PIC. */
export async function bulkImportEventChecklistItems(
  eventId: string,
  rows: TemplateImportRow[],
  mode: "replace" | "append",
  needsProduction: boolean = true
): Promise<{ ok: true; summary: TemplateImportSummary } | { ok: false; error: string }> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "Tidak ada baris data untuk diimpor." };
  }

  const supabase = await createClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("name")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError || !event) return { ok: false, error: "Event tidak ditemukan." };

  if (mode === "replace") {
    const { error: deleteError } = await supabase.from("event_checklist_items").delete().eq("event_id", eventId);
    if (deleteError) {
      console.error("[events] bulkImportEventChecklistItems: gagal hapus item lama:", deleteError.message);
      return { ok: false, error: GENERIC_ERROR };
    }
  }

  const summary: TemplateImportSummary = { inserted: 0, skipped: 0, errors: [] };
  const toInsert: {
    event_id: string;
    category: string;
    item_name: string;
    detail: string | null;
    qty_info: string | null;
    notes: string | null;
    sort_order: number;
    needs_production: boolean;
    current_phase: "design" | "completed";
  }[] = [];

  rows.forEach((row, index) => {
    const category = row.category?.trim();
    const itemName = row.itemName?.trim();
    if (!category || !itemName) {
      summary.skipped++;
      summary.errors.push(`Baris ${index + 1}: kategori atau nama item kosong, dilewati.`);
      return;
    }
    toInsert.push({
      event_id: eventId,
      category,
      item_name: itemName,
      detail: row.detail?.trim() || null,
      qty_info: row.qtyInfo?.trim() || null,
      notes: row.notes?.trim() || null,
      sort_order: index * 10,
      needs_production: needsProduction,
      current_phase: needsProduction ? "design" : "completed",
    });
  });

  if (toInsert.length === 0) {
    return { ok: false, error: "Semua baris tidak valid (kategori/nama item kosong)." };
  }

  const { error: insertError } = await supabase.from("event_checklist_items").insert(toInsert);
  if (insertError) {
    console.error("[events] bulkImportEventChecklistItems: gagal simpan:", insertError.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  summary.inserted = toInsert.length;

  revalidatePath(`${EVENTS_PATH}/${eventId}`);
  void logActivity({
    module: "admin",
    action: "create",
    entityType: "checklist event",
    entityLabel: `${event.name} (${summary.inserted} item diimpor)`,
  });
  return { ok: true, summary };
}

/** Cari booking/proyek yang sudah ada di satu divisi untuk dikaitkan ke
 * event (dipanggil dari kotak pencarian di halaman detail event) -- baca
 * biasa, TAPI harus lewat Server Action (bukan data.ts) karena dipicu
 * interaksi client (mengetik kata kunci), bukan render awal halaman. */
export async function searchLinkableSources(sourceType: EventSourceType, query: string): Promise<LinkableSource[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = await createClient();
  const like = `%${q}%`;

  if (sourceType === "magnarent_booking") {
    const { data } = await supabase
      .from("magnarent_bookings")
      .select("id, nama_klien, tanggal_mulai")
      .ilike("nama_klien", like)
      .limit(20);
    return (data ?? []).map((r) => ({
      sourceType,
      sourceId: r.id as string,
      label: `${r.nama_klien} — ${r.tanggal_mulai ?? "?"}`,
    }));
  }
  if (sourceType === "magnative_project") {
    const { data } = await supabase.from("magnative_projects").select("id, name").ilike("name", like).limit(20);
    return (data ?? []).map((r) => ({ sourceType, sourceId: r.id as string, label: r.name as string }));
  }
  const { data } = await supabase.from("production_booth_projects").select("id, name").ilike("name", like).limit(20);
  return (data ?? []).map((r) => ({ sourceType, sourceId: r.id as string, label: r.name as string }));
}

export async function addEventLink(
  eventId: string,
  sourceType: EventSourceType,
  sourceId: string,
  label: string
): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("event_links")
    .insert({ event_id: eventId, source_type: sourceType, source_id: sourceId });

  if (error) {
    console.error("[events] addEventLink gagal:", error.message);
    if (error.code === "23505") return { ok: false, error: "Data ini sudah dikaitkan ke event." };
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(`${EVENTS_PATH}/${eventId}`);
  void logActivity({
    module: "admin",
    action: "create",
    entityType: "kaitan event",
    entityLabel: label,
  });
  return { ok: true };
}

export async function removeEventLink(id: string, eventId: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_links").delete().eq("id", id);
  if (error) {
    console.error("[events] removeEventLink gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(`${EVENTS_PATH}/${eventId}`);
  return { ok: true };
}

type ChecklistCommentRow = {
  id: string;
  checklist_item_id: string;
  author_name: string;
  comment_text: string;
  is_resolved: boolean;
  created_at: string;
};

function rowToChecklistComment(row: ChecklistCommentRow): ChecklistComment {
  return {
    id: row.id,
    checklistItemId: row.checklist_item_id,
    authorName: row.author_name,
    commentText: row.comment_text,
    isResolved: row.is_resolved,
    createdAt: row.created_at,
  };
}

/**
 * Thread diskusi per item checklist (rekomendasi Bagian 5-B #7, migrasi
 * 0067) -- pola sama persis dengan `getAssetComments` di modul Magnative:
 * data diambil ON-DEMAND lewat Server Action saat modal dibuka, bukan
 * di-preload lewat `getEventById`/Papan Tracking supaya tidak membebani
 * halaman dengan komentar SEMUA item sekaligus.
 */
export async function getChecklistComments(checklistItemId: string): Promise<ChecklistComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_checklist_comments")
    .select("*")
    .eq("checklist_item_id", checklistItemId)
    .order("created_at", { ascending: true })
    .returns<ChecklistCommentRow[]>();

  if (error) {
    console.error("[events] getChecklistComments gagal:", error.message);
    return [];
  }
  return (data ?? []).map(rowToChecklistComment);
}

export async function addChecklistComment(checklistItemId: string, commentText: string): Promise<MutationResult> {
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
    .from("event_checklist_comments")
    .insert({ checklist_item_id: checklistItemId, author_name: authorName, comment_text: text });

  if (error) {
    console.error("[events] addChecklistComment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(TRACKING_PATH);
  return { ok: true };
}

export async function setChecklistCommentResolved(id: string, isResolved: boolean): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_checklist_comments").update({ is_resolved: isResolved }).eq("id", id);
  if (error) {
    console.error("[events] setChecklistCommentResolved gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(TRACKING_PATH);
  return { ok: true };
}

export async function deleteChecklistComment(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_checklist_comments").delete().eq("id", id);
  if (error) {
    console.error("[events] deleteChecklistComment gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(TRACKING_PATH);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Tahap 51: redesain besar Papan Tracking -- alur 8 fase (Design→Mockup→
// Sample→Production→Completed→Loading In→Loading Out→Finish), gantikan
// `updateEventChecklistProgress` di atas (TETAP DIPERTAHANKAN, tidak
// dipanggil lagi dari UI baru, tapi tidak dihapus supaya tidak ada
// referensi patah kalau ada halaman lain yang masih memakainya).
//
// Aturan akses (keputusan Owner): PIC item itu sendiri yang self-approve
// tiap fase ("untuk sementara", approver terpisah menyusul); akses penuh
// (division "all") selalu boleh bertindak sebagai override -- dipakai juga
// supaya Admin bisa membantu kalau PIC berhalangan pas H-1/H event.
// ---------------------------------------------------------------------

type ChecklistItemCore = {
  id: string;
  item_name: string;
  pic: string | null;
  pic_lapangan: string | null;
  needs_production: boolean;
  current_phase: ChecklistPhase;
  production_photo_url: string | null;
};

/** Fase Design/Mockup/Sample/Production tanggung jawab "PIC Produksi"
 * (`pic`); Completed/Loading In/Loading Out/Finish tanggung jawab
 * "PIC Lapangan" (`pic_lapangan`) -- keputusan Owner Tahap 52. */
function picFieldForPhase(phase: ChecklistPhase): "pic" | "pic_lapangan" {
  return phase === "completed" || phase === "loading_in" || phase === "loading_out" || phase === "finish"
    ? "pic_lapangan"
    : "pic";
}

const PHASE_ORDER: ChecklistPhase[] = [
  "design",
  "mockup",
  "sample",
  "production",
  "completed",
  "loading_in",
  "loading_out",
  "finish",
];

function nextPhaseAfter(phase: ChecklistPhase): ChecklistPhase {
  const idx = PHASE_ORDER.indexOf(phase);
  return PHASE_ORDER[Math.min(idx + 1, PHASE_ORDER.length - 1)];
}

async function getCurrentUserAccess(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ userId: string | null; isFullAccess: boolean }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, isFullAccess: false };
  const { data: profile } = await supabase
    .from("profiles")
    .select("division")
    .eq("id", user.id)
    .maybeSingle<{ division: string }>();
  return { userId: user.id, isFullAccess: profile?.division === "all" };
}

async function getChecklistItemCore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
): Promise<ChecklistItemCore | null> {
  const { data } = await supabase
    .from("event_checklist_items")
    .select("id, item_name, pic, pic_lapangan, needs_production, current_phase, production_photo_url")
    .eq("id", id)
    .maybeSingle<ChecklistItemCore>();
  return data ?? null;
}

/** "PIC yang bertanggung jawab" (keputusan Owner) -- akses penuh selalu
 * boleh override. */
function canActOnItem(itemPic: string | null, access: { userId: string | null; isFullAccess: boolean }): boolean {
  if (access.isFullAccess) return true;
  if (!access.userId) return false;
  return itemPic === access.userId;
}

async function writeChecklistPhaseLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  item: { id: string; pic: string | null; pic_lapangan: string | null },
  phase: ChecklistPhase
) {
  // Kolom `pic` di log ini catat PIC yang tanggung jawab fase yang SEDANG
  // dicatat (Produksi atau Lapangan, lihat `picFieldForPhase`) -- bukan
  // selalu `item.pic` lagi sejak PIC dipisah 2 (Tahap 52).
  const relevantPic = picFieldForPhase(phase) === "pic_lapangan" ? item.pic_lapangan : item.pic;
  const { error } = await supabase.from("event_checklist_status_log").insert({
    checklist_item_id: item.id,
    status: CHECKLIST_PHASE_LABELS[phase],
    pic: relevantPic,
    phase,
    sub_status: null,
  });
  if (error) console.error("[events] writeChecklistPhaseLog gagal:", error.message);
}

/** Notifikasi personal ke PIC item (pola `notifyUsers`, sama seperti
 * @mention Chat) -- fase baru terbuka, PIC (Produksi atau Lapangan,
 * tergantung fase berikutnya, lihat `picFieldForPhase`) perlu tahu tanpa
 * harus buka Papan Tracking berkala cuma untuk cek. */
function notifyItemPic(
  item: { pic: string | null; pic_lapangan: string | null; item_name: string },
  nextPhase: ChecklistPhase,
  eventId: string
) {
  const targetPic = picFieldForPhase(nextPhase) === "pic_lapangan" ? item.pic_lapangan : item.pic;
  if (!targetPic) return;
  void notifyUsers([targetPic], {
    title: "Fase Berikutnya Terbuka",
    body: `${item.item_name}: fase ${CHECKLIST_PHASE_LABELS[nextPhase]} sudah bisa dikerjakan.`,
    url: `${TRACKING_PATH}/${eventId}`,
  });
}

/**
 * Submit/revisi lampiran konfirmasi Design/Mockup/Sample (Tahap 51) --
 * lampiran (foto ATAU file dokumen, PIC pilih salah satu lewat
 * AttachmentPickerButtons di UI) WAJIB sebelum bisa disetujui
 * (`approveChecklistPhaseReview`). Submit ulang sebelum disetujui otomatis
 * naik jadi "revised" + revisionCount++ (monoton, lihat types.ts), TIDAK
 * bisa lagi kalau sudah "approved".
 */
export async function submitChecklistPhaseReview(formData: FormData): Promise<MutationResult> {
  const itemId = String(formData.get("itemId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const phase = String(formData.get("phase") ?? "") as ChecklistReviewPhase;
  const file = formData.get("file");

  if (!itemId || !["design", "mockup", "sample"].includes(phase)) {
    return { ok: false, error: "Data tidak lengkap." };
  }

  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  const item = await getChecklistItemCore(supabase, itemId);
  if (!item) return { ok: false, error: "Item tidak ditemukan." };
  if (!canActOnItem(item.pic, access)) return { ok: false, error: "Hanya PIC item ini yang bisa mengisi." };
  if (item.current_phase !== phase) {
    return { ok: false, error: `Item ini sedang di fase ${CHECKLIST_PHASE_LABELS[item.current_phase]}.` };
  }

  let photoUrl: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO_SIZE_BYTES) return { ok: false, error: "Ukuran lampiran maksimal 10MB." };
    // Foto ATAU file dokumen -- PIC pilih salah satu mode lewat
    // AttachmentPickerButtons di UI, server tidak lagi membatasi tipe
    // MIME di sini (cuma ukuran) supaya kedua mode sama-sama lewat jalur
    // upload yang sama. Tipe file ditebak balik dari ekstensi URL saat
    // ditampilkan (lihat isImageAttachment di EventTrackingBoard.tsx).
    const ext = file.name.includes(".") ? file.name.split(".").pop()! : "bin";
    const storagePath = `${crypto.randomUUID()}.${ext.toLowerCase()}`;
    const { error: uploadError } = await supabase.storage
      .from(CHECKLIST_PHOTO_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) {
      console.error("[events] submitChecklistPhaseReview: upload gagal:", uploadError.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(CHECKLIST_PHOTO_BUCKET).getPublicUrl(storagePath);
    photoUrl = publicUrl;
  }

  const { data: existing } = await supabase
    .from("event_checklist_phase_reviews")
    .select("id, sub_status, revision_count, photo_url")
    .eq("checklist_item_id", itemId)
    .eq("phase", phase)
    .maybeSingle<{ id: string; sub_status: string; revision_count: number; photo_url: string | null }>();

  if (existing?.sub_status === "approved") {
    return { ok: false, error: "Fase ini sudah disetujui, tidak bisa diubah lagi." };
  }
  if (!photoUrl && !existing?.photo_url) {
    return { ok: false, error: "Unggah foto atau file konfirmasi." };
  }

  const { error } = await supabase.from("event_checklist_phase_reviews").upsert(
    {
      checklist_item_id: itemId,
      phase,
      sub_status: existing ? "revised" : "proposed",
      revision_count: existing ? (existing.revision_count ?? 0) + 1 : 0,
      photo_url: photoUrl ?? existing?.photo_url ?? null,
      submitted_by: access.userId,
    },
    { onConflict: "checklist_item_id,phase" }
  );
  if (error) {
    console.error("[events] submitChecklistPhaseReview gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

/** Setujui Design/Mockup/Sample yang sedang aktif -- fitur berikutnya
 * langsung terbuka ("gembok", keputusan Owner), item.current_phase
 * otomatis maju. Sesuai diagram use case: HANYA Admin/Owner (akses penuh)
 * yang boleh memutuskan lolos/tidak, PIC yang mengerjakan tidak bisa
 * menyetujui pekerjaannya sendiri lagi (Tahap 52, siklus review). */
export async function approveChecklistPhaseReview(
  itemId: string,
  eventId: string,
  phase: ChecklistReviewPhase
): Promise<MutationResult> {
  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  const item = await getChecklistItemCore(supabase, itemId);
  if (!item) return { ok: false, error: "Item tidak ditemukan." };
  if (!access.isFullAccess) return { ok: false, error: "Hanya Admin/Owner yang bisa menyetujui fase ini." };
  if (item.current_phase !== phase) return { ok: false, error: "Fase item sudah berubah, muat ulang halaman." };

  const { data: review } = await supabase
    .from("event_checklist_phase_reviews")
    .select("id, photo_url, sub_status")
    .eq("checklist_item_id", itemId)
    .eq("phase", phase)
    .maybeSingle<{ id: string; photo_url: string | null; sub_status: string }>();
  if (!review || !review.photo_url) {
    return { ok: false, error: "Unggah foto konfirmasi dulu sebelum menyetujui fase ini." };
  }
  if (review.sub_status === "approved") return { ok: true };

  const { error: reviewError } = await supabase
    .from("event_checklist_phase_reviews")
    .update({ sub_status: "approved", approved_by: access.userId, approved_at: new Date().toISOString() })
    .eq("id", review.id);
  if (reviewError) {
    console.error("[events] approveChecklistPhaseReview: update review gagal:", reviewError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const nextPhase = nextPhaseAfter(phase);
  const { error: itemError } = await supabase
    .from("event_checklist_items")
    .update({ current_phase: nextPhase })
    .eq("id", itemId);
  if (itemError) {
    console.error("[events] approveChecklistPhaseReview: update item gagal:", itemError.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  await writeChecklistPhaseLog(supabase, item, nextPhase);
  notifyItemPic(item, nextPhase, eventId);

  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

/** Tolak Design/Mockup/Sample yang sedang diajukan ("jika tidak lolos" di
 * diagram use case) -- HANYA Admin/Owner. Baris review fase yang ditolak
 * dihapus sekalian (reset total, bukan cuma ubah sub_status), jadi begitu
 * PIC mengunggah foto lagi itu dihitung ulang sebagai "Proposed".
 *
 * Disederhanakan (Tahap 52, keputusan Owner: mekanisme dirasa masih
 * rumit) -- SEBELUMNYA reject Mockup/Sample "restart total" balik ke
 * Design (fase sebelumnya yang sudah "approved" ikut direset). Sekarang
 * TETAP 3 fase review terpisah, tapi reject cuma mundurkan 1 langkah:
 * cuma fase yang ditolak itu sendiri yang reset, `current_phase` TIDAK
 * pernah berubah (guard di atas sudah memastikan `current_phase` = fase
 * yang ditolak), fase-fase lain tidak tersentuh. Tidak bisa dipakai kalau
 * sudah "approved" (kunci akhir, lihat `approveChecklistPhaseReview`). */
export async function rejectChecklistPhaseReview(
  itemId: string,
  eventId: string,
  phase: ChecklistReviewPhase
): Promise<MutationResult> {
  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  const item = await getChecklistItemCore(supabase, itemId);
  if (!item) return { ok: false, error: "Item tidak ditemukan." };
  if (!access.isFullAccess) return { ok: false, error: "Hanya Admin/Owner yang bisa menolak fase ini." };
  if (item.current_phase !== phase) return { ok: false, error: "Fase item sudah berubah, muat ulang halaman." };

  const { data: review } = await supabase
    .from("event_checklist_phase_reviews")
    .select("id, sub_status")
    .eq("checklist_item_id", itemId)
    .eq("phase", phase)
    .maybeSingle<{ id: string; sub_status: string }>();
  if (!review) return { ok: false, error: "Belum ada foto yang diajukan untuk fase ini." };
  if (review.sub_status === "approved") {
    return { ok: false, error: "Fase ini sudah disetujui, tidak bisa ditolak lagi." };
  }

  const { error } = await supabase.from("event_checklist_phase_reviews").delete().eq("id", review.id);
  if (error) {
    console.error("[events] rejectChecklistPhaseReview gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // `current_phase` TIDAK diubah -- guard di atas sudah memastikan
  // `current_phase === phase` yang ditolak, jadi tidak perlu di-set ulang,
  // dan tidak ada lagi cascade ke fase-fase lain (Tahap 52).
  if (item.pic) {
    void notifyUsers([item.pic], {
      title: "Perlu Revisi",
      body: `${item.item_name}: fase ${CHECKLIST_PHASE_LABELS[phase]} ditolak, unggah ulang foto/file konfirmasi.`,
      url: `${TRACKING_PATH}/${eventId}`,
    });
  }

  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

/** Simpan draft Production (qty/catatan/lampiran foto ATAU file) -- BELUM
 * menandai selesai, lihat `markProductionDone` untuk itu. Bisa dipanggil
 * berkali-kali (autosave-style) selama masih di fase Production. */
export async function updateChecklistProduction(formData: FormData): Promise<MutationResult> {
  const itemId = String(formData.get("itemId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const qty = String(formData.get("qty") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const file = formData.get("file");
  if (!itemId) return { ok: false, error: "Item tidak ditemukan." };

  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  const item = await getChecklistItemCore(supabase, itemId);
  if (!item) return { ok: false, error: "Item tidak ditemukan." };
  if (!canActOnItem(item.pic, access)) return { ok: false, error: "Hanya PIC item ini yang bisa mengisi." };
  if (item.current_phase !== "production") return { ok: false, error: "Item ini bukan di fase Production." };

  let photoUrl: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO_SIZE_BYTES) return { ok: false, error: "Ukuran lampiran maksimal 10MB." };
    // Foto ATAU file dokumen -- lihat catatan sama di submitChecklistPhaseReview.
    const ext = file.name.includes(".") ? file.name.split(".").pop()! : "bin";
    const storagePath = `${crypto.randomUUID()}.${ext.toLowerCase()}`;
    const { error: uploadError } = await supabase.storage
      .from(CHECKLIST_PHOTO_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) {
      console.error("[events] updateChecklistProduction: upload gagal:", uploadError.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(CHECKLIST_PHOTO_BUCKET).getPublicUrl(storagePath);
    photoUrl = publicUrl;
  }

  const patch: Record<string, unknown> = { production_qty: qty || null, production_notes: notes || null };
  if (photoUrl) patch.production_photo_url = photoUrl;

  const { error } = await supabase.from("event_checklist_items").update(patch).eq("id", itemId);
  if (error) {
    console.error("[events] updateChecklistProduction gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

/** Tandai Production selesai -- WAJIB sudah ada lampiran foto/file (di
 * draft atau disertakan sekaligus lewat `updateChecklistProduction`
 * sebelumnya). Fase maju ke Completed. */
export async function markProductionDone(itemId: string, eventId: string): Promise<MutationResult> {
  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  const item = await getChecklistItemCore(supabase, itemId);
  if (!item) return { ok: false, error: "Item tidak ditemukan." };
  if (!canActOnItem(item.pic, access)) return { ok: false, error: "Hanya PIC item ini yang bisa menandai selesai." };
  if (item.current_phase !== "production") return { ok: false, error: "Item ini bukan di fase Production." };
  if (!item.production_photo_url)
    return { ok: false, error: "Unggah foto atau file produksi dulu sebelum menandai selesai." };

  const { error } = await supabase
    .from("event_checklist_items")
    .update({ production_done_at: new Date().toISOString(), production_done_by: access.userId, current_phase: "completed" })
    .eq("id", itemId);
  if (error) {
    console.error("[events] markProductionDone gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  await writeChecklistPhaseLog(supabase, item, "completed");
  notifyItemPic(item, "completed", eventId);

  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

/** Konfirmasi Completed -- cuma konfirmasi, tanpa foto (berlaku SAMA untuk
 * item `needsProduction=true` maupun `false`, keputusan Owner). Fase maju
 * ke Loading In. */
export async function confirmChecklistCompleted(itemId: string, eventId: string): Promise<MutationResult> {
  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  const item = await getChecklistItemCore(supabase, itemId);
  if (!item) return { ok: false, error: "Item tidak ditemukan." };
  if (!canActOnItem(item.pic_lapangan, access))
    return { ok: false, error: "Hanya PIC Lapangan item ini yang bisa konfirmasi." };
  if (item.current_phase !== "completed") return { ok: false, error: "Item ini bukan di fase Completed." };

  const { error } = await supabase
    .from("event_checklist_items")
    .update({ completed_at: new Date().toISOString(), completed_by: access.userId, current_phase: "loading_in" })
    .eq("id", itemId);
  if (error) {
    console.error("[events] confirmChecklistCompleted gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  await writeChecklistPhaseLog(supabase, item, "loading_in");
  notifyItemPic(item, "loading_in", eventId);

  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

const LOADING_PREDECESSOR: Record<"loading_in" | "loading_out" | "finish", ChecklistPhase> = {
  loading_in: "completed",
  loading_out: "loading_in",
  finish: "loading_out",
};

const LOADING_MILESTONE_TITLE: Record<"loading_in" | "loading_out" | "finish", string> = {
  loading_in: "Semua Item Sudah Loading In",
  loading_out: "Semua Item Sudah Loading Out",
  finish: "Event Checklist Selesai",
};

/**
 * Tandai Loading In/Out/Finish untuk BANYAK item sekaligus (keputusan
 * Owner: "ditandai sekaligus tapi dibuat agar tidak ada item yang
 * terlewat") -- daftar `itemIds` datang dari UI yang menampilkan SEMUA
 * item (termasuk yang bukan PIC pengguna, untuk visibilitas), tapi cuma
 * item yang (a) PIC-nya pengguna ini (atau akses penuh) DAN (b) fasenya
 * sudah di predecessor yang benar yang benar-benar diproses -- sisanya
 * dilewati diam-diam, jumlahnya dilaporkan balik ke UI.
 */
export async function bulkAdvanceChecklistPhase(
  eventId: string,
  itemIds: string[],
  targetPhase: "loading_in" | "loading_out" | "finish"
): Promise<{ ok: true; advanced: number; skipped: number } | { ok: false; error: string }> {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return { ok: false, error: "Pilih minimal satu item." };

  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  if (!access.userId) return { ok: false, error: "Sesi tidak valid, muat ulang halaman." };

  const { data: items, error } = await supabase
    .from("event_checklist_items")
    .select("id, item_name, pic, pic_lapangan, current_phase")
    .in("id", itemIds)
    .eq("event_id", eventId)
    .returns<
      { id: string; item_name: string; pic: string | null; pic_lapangan: string | null; current_phase: ChecklistPhase }[]
    >();
  if (error || !items) {
    console.error("[events] bulkAdvanceChecklistPhase: gagal ambil item:", error?.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const predecessor = LOADING_PREDECESSOR[targetPhase];
  // Loading In/Out/Finish semuanya fase "PIC Lapangan" (Tahap 52).
  const eligible = items.filter((it) => it.current_phase === predecessor && canActOnItem(it.pic_lapangan, access));
  if (eligible.length === 0) {
    return { ok: false, error: "Tidak ada item yang bisa diproses (bukan PIC Lapangan-nya, atau fase belum sesuai)." };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { current_phase: targetPhase };
  if (targetPhase === "loading_in") {
    patch.loading_in_at = now;
    patch.loading_in_by = access.userId;
  } else if (targetPhase === "loading_out") {
    patch.loading_out_at = now;
    patch.loading_out_by = access.userId;
  } else {
    patch.finished_at = now;
    patch.finished_by = access.userId;
  }

  const eligibleIds = eligible.map((it) => it.id);
  const { error: updateError } = await supabase.from("event_checklist_items").update(patch).in("id", eligibleIds);
  if (updateError) {
    console.error("[events] bulkAdvanceChecklistPhase: update gagal:", updateError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  await Promise.all(
    eligible.map((it) => writeChecklistPhaseLog(supabase, { id: it.id, pic: it.pic, pic_lapangan: it.pic_lapangan }, targetPhase))
  );

  revalidatePath(`${TRACKING_PATH}/${eventId}`);

  // Milestone level EVENT (bukan per-item) -- notifikasi ke 3 divisi +
  // akses penuh cuma kalau SEMUA item event ini sudah mencapai fase target,
  // supaya tidak spam notifikasi tiap kali satu batch kecil ditandai.
  void (async () => {
    const { data: event } = await supabase.from("events").select("name").eq("id", eventId).maybeSingle<{ name: string }>();
    const { data: allItems } = await supabase
      .from("event_checklist_items")
      .select("current_phase")
      .eq("event_id", eventId)
      .returns<{ current_phase: ChecklistPhase }[]>();
    if (!event || !allItems || allItems.length === 0) return;
    const targetIdx = PHASE_ORDER.indexOf(targetPhase);
    const allReached = allItems.every((it) => PHASE_ORDER.indexOf(it.current_phase) >= targetIdx);
    if (!allReached) return;
    void notifyDivision(["magnarent", "magnative", "production"], {
      title: LOADING_MILESTONE_TITLE[targetPhase],
      body: `${event.name}: seluruh item checklist sudah mencapai fase ${CHECKLIST_PHASE_LABELS[targetPhase]}.`,
      url: `${TRACKING_PATH}/${eventId}`,
      important: targetPhase === "finish",
    });
  })();

  return { ok: true, advanced: eligible.length, skipped: itemIds.length - eligible.length };
}

/**
 * Kembalikan item checklist ke fase SEBELUMNYA -- permintaan Owner
 * (staf sering "kepencet" salah pindah fase, terutama tombol bulk Loading
 * In/Out/Finish yang checkbox-nya sudah tercentang semua dari awal, dan
 * sebelumnya SAMA SEKALI tidak ada cara membalikkan selain edit database
 * manual). HANYA Admin/akses penuh (division "all") yang boleh, sama
 * seperti approve/reject fase review.
 *
 * Membalikkan = membatalkan PERSIS transisi TERAKHIR yang membawa item ke
 * fase saat ini -- kebalikan `approveChecklistPhaseReview` /
 * `markProductionDone` / `confirmChecklistCompleted` /
 * `bulkAdvanceChecklistPhase`: hapus timestamp/pelaku yang tercatat waktu
 * transisi itu terjadi, dan untuk Mockup/Sample/Production, buka kunci
 * lagi review fase sebelumnya (approved -> revised, pola sama dengan
 * cascading di `rejectChecklistPhaseReview`) supaya bisa disetujui ulang.
 *
 * Item di fase paling awal (Design untuk `needsProduction=true`, atau
 * Completed untuk `needsProduction=false` yang tidak pernah lewat
 * Production) tidak punya fase sebelumnya -- ditolak.
 */
export async function revertChecklistPhase(itemId: string, eventId: string): Promise<MutationResult> {
  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  if (!access.isFullAccess) return { ok: false, error: "Hanya Admin/akses penuh yang bisa mengembalikan fase." };

  const { data: item } = await supabase
    .from("event_checklist_items")
    .select("id, item_name, pic, pic_lapangan, current_phase, production_done_at")
    .eq("id", itemId)
    .maybeSingle<{
      id: string;
      item_name: string;
      pic: string | null;
      pic_lapangan: string | null;
      current_phase: ChecklistPhase;
      production_done_at: string | null;
    }>();
  if (!item) return { ok: false, error: "Item tidak ditemukan." };

  const phase = item.current_phase;
  const patch: Record<string, unknown> = {};
  let targetPhase: ChecklistPhase;

  if (phase === "mockup" || phase === "sample" || phase === "production") {
    const reviewPhase: ChecklistReviewPhase = phase === "mockup" ? "design" : phase === "sample" ? "mockup" : "sample";
    const { error: reviewError } = await supabase
      .from("event_checklist_phase_reviews")
      .update({ sub_status: "revised", approved_by: null, approved_at: null })
      .eq("checklist_item_id", itemId)
      .eq("phase", reviewPhase);
    if (reviewError) {
      console.error("[events] revertChecklistPhase: reset review gagal:", reviewError.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    targetPhase = reviewPhase;
  } else if (phase === "completed") {
    if (!item.production_done_at) {
      return { ok: false, error: "Item ini sudah di fase paling awal, tidak ada fase sebelumnya." };
    }
    patch.production_done_at = null;
    patch.production_done_by = null;
    targetPhase = "production";
  } else if (phase === "loading_in") {
    patch.completed_at = null;
    patch.completed_by = null;
    targetPhase = "completed";
  } else if (phase === "loading_out") {
    patch.loading_in_at = null;
    patch.loading_in_by = null;
    targetPhase = "loading_in";
  } else if (phase === "finish") {
    patch.loading_out_at = null;
    patch.loading_out_by = null;
    targetPhase = "loading_out";
  } else {
    return { ok: false, error: "Item ini sudah di fase paling awal, tidak ada fase sebelumnya." };
  }

  patch.current_phase = targetPhase;
  const { error } = await supabase.from("event_checklist_items").update(patch).eq("id", itemId);
  if (error) {
    console.error("[events] revertChecklistPhase gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  await writeChecklistPhaseLog(supabase, { id: item.id, pic: item.pic, pic_lapangan: item.pic_lapangan }, targetPhase);
  // Beritahu PIC yang tanggung jawab fase TUJUAN (Produksi atau Lapangan,
  // lihat `picFieldForPhase`) -- dia yang harus kerjakan ulang dari sana.
  const notifyPicId = picFieldForPhase(targetPhase) === "pic_lapangan" ? item.pic_lapangan : item.pic;
  if (notifyPicId) {
    void notifyUsers([notifyPicId], {
      title: "Fase Dikembalikan",
      body: `${item.item_name}: Admin mengembalikan fase ke ${CHECKLIST_PHASE_LABELS[targetPhase]}.`,
      url: `${TRACKING_PATH}/${eventId}`,
    });
  }

  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

/** Admin/akses penuh bisa ubah "Perlu Produksi Ya/Tidak" kapan saja
 * (keputusan Owner: "atur saja") -- histori fase sebelumnya TETAP
 * tersimpan (baris log/phase_reviews tidak dihapus), cuma tidak lagi jadi
 * syarat begitu dimatikan; dinyalakan lagi TIDAK memundurkan progres. */
export async function setChecklistNeedsProduction(
  itemId: string,
  eventId: string,
  needsProduction: boolean
): Promise<MutationResult> {
  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  if (!access.isFullAccess) return { ok: false, error: "Hanya Admin/akses penuh yang bisa mengubah ini." };

  const item = await getChecklistItemCore(supabase, itemId);
  if (!item) return { ok: false, error: "Item tidak ditemukan." };

  const patch: Record<string, unknown> = { needs_production: needsProduction };
  const preProductionPhases: ChecklistPhase[] = ["design", "mockup", "sample", "production"];
  if (!needsProduction && preProductionPhases.includes(item.current_phase)) {
    patch.current_phase = "completed";
  }

  const { error } = await supabase.from("event_checklist_items").update(patch).eq("id", itemId);
  if (error) {
    console.error("[events] setChecklistNeedsProduction gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}

/**
 * Tugaskan/ubah "PIC Lapangan" satu item checklist (Tahap 52) -- pasangan
 * `handlePicChange`/`updateEventChecklistProgress` di atas yang menangani
 * "PIC Produksi" (kolom `pic` lama). Dipisah supaya Admin/PIC bisa
 * menugaskan 2 orang berbeda untuk produksi vs hari-H di lapangan, sesuai
 * keputusan Owner. TIDAK menulis ke `event_checklist_status_log` (log itu
 * tetap fokus riwayat status/PIC Produksi lama) -- kalau nanti histori
 * PIC Lapangan juga dibutuhkan, tabel log itu perlu kolom terpisah dulu.
 */
export async function updateChecklistPicLapangan(
  id: string,
  eventId: string,
  picLapanganId: string | null
): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_checklist_items").update({ pic_lapangan: picLapanganId }).eq("id", id);
  if (error) {
    console.error("[events] updateChecklistPicLapangan gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(`${TRACKING_PATH}/${eventId}`);
  return { ok: true };
}
