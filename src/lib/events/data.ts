import { createClient } from "@/lib/supabase/server";
import { fetchInChunks, PAGE_SIZE } from "@/lib/shared/paginate";
import {
  computeChecklistItemProgress,
  type ChecklistPhase,
  type ChecklistPhaseReview,
  type ChecklistReviewPhase,
  type ChecklistSubStatus,
  type EventChecklistItem,
  type EventDetail,
  type EventLink,
  type EventSourceType,
  type EventStatus,
  type EventSummary,
  type EventType,
  type EventTypeTemplateItem,
  type PicOption,
  type VendorOption,
} from "./types";

type EventTypeRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

function mapEventType(row: EventTypeRow): EventType {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

/** Semua jenis event, TERMASUK yang nonaktif -- dipakai halaman Admin
 * (Tahap B) supaya jenis lama yang sudah tidak dipakai lagi tetap kelihatan
 * (untuk dinonaktifkan/diaktifkan lagi), bukan cuma yang aktif. Saat bikin
 * event baru (Tahap C), pemilihan jenis event akan difilter ke yang aktif
 * saja di sisi situ. */
export async function getEventTypes(): Promise<EventType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_types")
    .select("id, name, description, is_active, created_at")
    .order("name", { ascending: true })
    .returns<EventTypeRow[]>();

  if (error) {
    console.error("[events] getEventTypes gagal:", error.message);
    return [];
  }
  return (data ?? []).map(mapEventType);
}

type TemplateItemRow = {
  id: string;
  event_type_id: string;
  category: string;
  item_name: string;
  detail: string | null;
  qty_info: string | null;
  notes: string | null;
  sort_order: number;
  default_needs_production: boolean;
};

function mapTemplateItem(row: TemplateItemRow): EventTypeTemplateItem {
  return {
    id: row.id,
    eventTypeId: row.event_type_id,
    category: row.category,
    itemName: row.item_name,
    detail: row.detail ?? undefined,
    qtyInfo: row.qty_info ?? undefined,
    notes: row.notes ?? undefined,
    sortOrder: row.sort_order,
    defaultNeedsProduction: row.default_needs_production,
  };
}

/** SEMUA template item lintas jenis event, diambil sekaligus (bukan per
 * jenis event satu-satu) -- jumlahnya wajar untuk dimuat sekaligus (tiap
 * jenis event biasanya puluhan item, lihat contoh "Grab KOL Gathering" yang
 * ~90 baris), jadi halaman Admin cukup satu query lalu difilter di client
 * saat Admin memilih satu jenis event untuk dikelola -- sama seperti pola
 * ProductManager memuat seluruh katalog produk sekaligus. */
export async function getAllEventTypeTemplateItems(): Promise<EventTypeTemplateItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_type_template_items")
    .select("id, event_type_id, category, item_name, detail, qty_info, notes, sort_order, default_needs_production")
    .order("sort_order", { ascending: true })
    .returns<TemplateItemRow[]>();

  if (error) {
    console.error("[events] getAllEventTypeTemplateItems gagal:", error.message);
    return [];
  }
  return (data ?? []).map(mapTemplateItem);
}

// ---------------------------------------------------------------------
// Tahap C: event AKTUAL -- lihat komentar di types.ts.
// ---------------------------------------------------------------------

type EventRow = {
  id: string;
  name: string;
  client_name: string | null;
  event_type_id: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  event_types: { name: string } | null;
};

function mapEvent(row: EventRow): EventSummary {
  return {
    id: row.id,
    name: row.name,
    clientName: row.client_name ?? undefined,
    eventTypeId: row.event_type_id ?? undefined,
    eventTypeName: row.event_types?.name ?? undefined,
    location: row.location ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    status: row.status as EventStatus,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

const EVENT_SELECT =
  "id, name, client_name, event_type_id, location, start_date, end_date, status, notes, created_at, event_types(name)";

/** Semua event, terbaru duluan -- halaman Admin (Tahap C) belum perlu
 * paginasi, jumlah event yang sedang berjalan/baru selesai wajar untuk
 * ditampilkan sekaligus.
 *
 * `withProgress` (Tahap E, dashboard ringkasan) -- kalau true, tiap event
 * ikut dilengkapi `checklistTotal`/`checklistDone` (lihat
 * `attachChecklistProgress` di bawah). Opsional (default false) supaya
 * pemanggil yang tidak butuh progress (mis. dropdown pilih event di form
 * lain) tidak menanggung query tambahan itu. */
export async function getEvents(options?: { withProgress?: boolean }): Promise<EventSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .order("created_at", { ascending: false })
    .returns<EventRow[]>();

  if (error) {
    console.error("[events] getEvents gagal:", error.message);
    return [];
  }
  const events = (data ?? []).map(mapEvent);
  if (!options?.withProgress) return events;
  return attachChecklistProgress(supabase, events);
}

/** Isi `checklistTotal`/`checklistDone` tiap event dalam SATU query
 * tambahan (bukan N+1 per event) -- ambil `event_id, status` semua item
 * checklist milik event-event yang diminta, lalu dihitung di JS. Dipakai
 * dashboard ringkasan Admin (Tahap E) & daftar Papan Tracking (Tahap D). */
async function attachChecklistProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  events: EventSummary[]
): Promise<EventSummary[]> {
  if (events.length === 0) return events;
  const ids = events.map((e) => e.id);
  // Per halaman & per potongan id: total item checklist semua event mudah
  // melewati batas 1000 baris PostgREST (template ~90 item/event), dan dulu
  // event terbaru yang progresnya hilang/salah.
  type ProgressRow = { id: string; event_id: string; status: string; needs_production: boolean; current_phase: ChecklistPhase };
  const { data: rows, error } = await fetchInChunks<ProgressRow>(ids, (chunk, afterId) =>
    supabase
      .from("event_checklist_items")
      .select("id, event_id, status, needs_production, current_phase")
      .in("event_id", chunk)
      .gt("id", afterId)
      .order("id")
      .limit(PAGE_SIZE)
      .returns<ProgressRow[]>()
  );
  if (error) {
    console.error("[events] attachChecklistProgress gagal:", error.message);
    return events;
  }

  // Progres granular (Tahap 51) butuh sub-status Design/Mockup/Sample tiap
  // item yang masih di salah satu dari 3 fase itu -- satu query tambahan,
  // BUKAN N+1 (sama pola dengan query utama di atas).
  const itemIds = rows.map((r) => r.id as string);
  const reviewsByItem = await fetchPhaseReviewsByItem(supabase, itemIds);

  const countByEvent = new Map<string, { total: number; done: number; percentSum: number }>();
  for (const row of rows) {
    const bucket = countByEvent.get(row.event_id) ?? { total: 0, done: 0, percentSum: 0 };
    bucket.total += 1;
    if (row.current_phase === "finish") bucket.done += 1;
    bucket.percentSum += computeChecklistItemProgress(
      { needsProduction: row.needs_production as boolean, currentPhase: row.current_phase as ChecklistPhase },
      reviewsByItem.get(row.id as string) ?? []
    );
    countByEvent.set(row.event_id, bucket);
  }

  return events.map((event) => {
    const counts = countByEvent.get(event.id);
    return {
      ...event,
      checklistTotal: counts?.total ?? 0,
      checklistDone: counts?.done ?? 0,
      checklistProgressPercent: counts && counts.total > 0 ? Math.round(counts.percentSum / counts.total) : 0,
    };
  });
}

type PhaseReviewRow = {
  id: string;
  checklist_item_id: string;
  phase: ChecklistReviewPhase;
  sub_status: ChecklistSubStatus;
  revision_count: number;
  photo_url: string | null;
  submitted_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
};

/** Ambil `event_checklist_phase_reviews` untuk sekumpulan item sekaligus
 * (bukan N+1), dikelompokkan per `checklist_item_id` -- dipakai
 * `attachChecklistProgress` (ringkas, bukan resolusi nama) & `getEventById`
 * (lengkap, dengan nama, lihat pembungkus `fetchPhaseReviewsWithNames`). */
async function fetchPhaseReviewsByItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemIds: string[]
): Promise<Map<string, ChecklistPhaseReview[]>> {
  const map = new Map<string, ChecklistPhaseReview[]>();
  if (itemIds.length === 0) return map;
  // Dipotong per 150 id (URL .in() punya batas panjang) & per halaman.
  const { data, error } = await fetchInChunks<PhaseReviewRow>(itemIds, (chunk, afterId) =>
    supabase
      .from("event_checklist_phase_reviews")
      .select("id, checklist_item_id, phase, sub_status, revision_count, photo_url, submitted_by, approved_by, approved_at, updated_at")
      .in("checklist_item_id", chunk)
      .gt("id", afterId)
      .order("id")
      .limit(PAGE_SIZE)
      .returns<PhaseReviewRow[]>()
  );
  if (error) {
    console.error("[events] fetchPhaseReviewsByItem gagal:", error.message);
    return map;
  }
  for (const row of data) {
    const bucket = map.get(row.checklist_item_id) ?? [];
    bucket.push({
      id: row.id,
      checklistItemId: row.checklist_item_id,
      phase: row.phase,
      subStatus: row.sub_status,
      revisionCount: row.revision_count,
      photoUrl: row.photo_url ?? undefined,
      submittedBy: row.submitted_by ?? undefined,
      approvedBy: row.approved_by ?? undefined,
      approvedAt: row.approved_at ?? undefined,
      updatedAt: row.updated_at,
    });
    map.set(row.checklist_item_id, bucket);
  }
  return map;
}

type ChecklistItemRow = {
  id: string;
  event_id: string;
  category: string;
  item_name: string;
  detail: string | null;
  qty_info: string | null;
  notes: string | null;
  status: string;
  pic: string | null;
  pic_lapangan: string | null;
  sort_order: number;
  vendor_id: string | null;
  team: string | null;
  due_date: string | null;
  needs_production: boolean;
  current_phase: ChecklistPhase;
  production_qty: string | null;
  production_notes: string | null;
  production_photo_url: string | null;
  production_done_at: string | null;
  production_done_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  loading_in_at: string | null;
  loading_in_by: string | null;
  loading_out_at: string | null;
  loading_out_by: string | null;
  finished_at: string | null;
  finished_by: string | null;
  created_by: string | null;
};

const CHECKLIST_ITEM_SELECT =
  "id, event_id, category, item_name, detail, qty_info, notes, status, pic, pic_lapangan, sort_order, vendor_id, team, due_date, " +
  "needs_production, current_phase, production_qty, production_notes, production_photo_url, production_done_at, production_done_by, " +
  "completed_at, completed_by, loading_in_at, loading_in_by, loading_out_at, loading_out_by, finished_at, finished_by, created_by";

function mapChecklistItem(row: ChecklistItemRow): EventChecklistItem {
  return {
    id: row.id,
    eventId: row.event_id,
    category: row.category,
    itemName: row.item_name,
    detail: row.detail ?? undefined,
    qtyInfo: row.qty_info ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status as EventChecklistItem["status"],
    pic: row.pic ?? undefined,
    picLapangan: row.pic_lapangan ?? undefined,
    sortOrder: row.sort_order,
    vendorId: row.vendor_id ?? undefined,
    team: row.team ?? undefined,
    dueDate: row.due_date ?? undefined,
    needsProduction: row.needs_production,
    currentPhase: row.current_phase,
    productionQty: row.production_qty ?? undefined,
    productionNotes: row.production_notes ?? undefined,
    productionPhotoUrl: row.production_photo_url ?? undefined,
    productionDoneAt: row.production_done_at ?? undefined,
    productionDoneBy: row.production_done_by ?? undefined,
    completedAt: row.completed_at ?? undefined,
    completedBy: row.completed_by ?? undefined,
    loadingInAt: row.loading_in_at ?? undefined,
    loadingInBy: row.loading_in_by ?? undefined,
    loadingOutAt: row.loading_out_at ?? undefined,
    loadingOutBy: row.loading_out_by ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    finishedBy: row.finished_by ?? undefined,
    createdBy: row.created_by ?? undefined,
  };
}

type LinkRow = {
  id: string;
  event_id: string;
  source_type: EventSourceType;
  source_id: string;
  created_at: string;
};

/** Label manusiawi tiap sumber kaitan -- diambil TERPISAH per tabel divisi
 * (bukan embedded select) karena tabel sumbernya beda-beda (magnarent_
 * bookings pakai nama_klien, dua lainnya pakai name) dan `event_links`
 * tidak punya FK literal ke salah satu tabel tsb (source_id polimorfik). */
async function resolveSourceLabels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceType: EventSourceType,
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  if (sourceType === "magnarent_booking") {
    const { data } = await supabase.from("magnarent_bookings").select("id, nama_klien, tanggal_mulai").in("id", ids);
    return new Map((data ?? []).map((r) => [r.id as string, `${r.nama_klien} — ${r.tanggal_mulai ?? "?"}`]));
  }
  if (sourceType === "magnative_project") {
    const { data } = await supabase.from("magnative_projects").select("id, name").in("id", ids);
    return new Map((data ?? []).map((r) => [r.id as string, r.name as string]));
  }
  const { data } = await supabase.from("production_booth_projects").select("id, name").in("id", ids);
  return new Map((data ?? []).map((r) => [r.id as string, r.name as string]));
}

/** Detail satu event lengkap dengan checklist & kaitannya -- dipakai
 * halaman detail Admin (Tahap C: `/dashboard/admin/events/[id]`). */
export async function getEventById(id: string): Promise<EventDetail | null> {
  const supabase = await createClient();
  const { data: eventRow, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("id", id)
    .maybeSingle<EventRow>();

  if (error || !eventRow) {
    if (error) console.error("[events] getEventById gagal:", error.message);
    return null;
  }

  const [{ data: itemRows, error: itemsError }, { data: linkRows, error: linksError }] = await Promise.all([
    supabase
      .from("event_checklist_items")
      .select(CHECKLIST_ITEM_SELECT)
      .eq("event_id", id)
      .order("sort_order", { ascending: true })
      .returns<ChecklistItemRow[]>(),
    supabase
      .from("event_links")
      .select("id, event_id, source_type, source_id, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: true })
      .returns<LinkRow[]>(),
  ]);

  if (itemsError) console.error("[events] getEventById: gagal ambil checklist:", itemsError.message);
  if (linksError) console.error("[events] getEventById: gagal ambil kaitan:", linksError.message);

  const linksBySource = new Map<EventSourceType, LinkRow[]>();
  for (const link of linkRows ?? []) {
    const bucket = linksBySource.get(link.source_type) ?? [];
    bucket.push(link);
    linksBySource.set(link.source_type, bucket);
  }

  const labelMaps = await Promise.all(
    Array.from(linksBySource.entries()).map(async ([sourceType, rows]) => [
      sourceType,
      await resolveSourceLabels(supabase, sourceType, rows.map((r) => r.source_id)),
    ] as const)
  );
  const labelBySourceType = new Map(labelMaps);

  const links: EventLink[] = (linkRows ?? []).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceLabel: labelBySourceType.get(row.source_type)?.get(row.source_id) ?? "(data tidak ditemukan)",
    createdAt: row.created_at,
  }));

  const actorIds = new Set<string>();
  for (const r of itemRows ?? []) {
    for (const v of [
      r.pic,
      r.pic_lapangan,
      r.production_done_by,
      r.completed_by,
      r.loading_in_by,
      r.loading_out_by,
      r.finished_by,
      r.created_by,
    ]) {
      if (v) actorIds.add(v);
    }
  }
  const vendorIds = Array.from(new Set((itemRows ?? []).map((r) => r.vendor_id).filter((v): v is string => !!v)));
  const itemIds = (itemRows ?? []).map((r) => r.id);
  const [actorNameById, vendorNameById, reviewsByItem] = await Promise.all([
    resolvePicNames(supabase, Array.from(actorIds)),
    resolveVendorNames(supabase, vendorIds),
    fetchPhaseReviewsByItem(supabase, itemIds),
  ]);
  // Nama untuk `submittedBy`/`approvedBy` tiap phase review -- sama daftar
  // profil dengan `actorNameById` di atas (PIC self-approve, jadi hampir
  // selalu overlap), diresolusi ulang di sini kalau ada id yang tidak
  // kebetulan sudah ada di situ (mis. review dibuat orang lain).
  const reviewActorIds = Array.from(reviewsByItem.values())
    .flat()
    .flatMap((r) => [r.submittedBy, r.approvedBy])
    .filter((v): v is string => !!v && !actorNameById.has(v));
  const extraNameById = reviewActorIds.length > 0 ? await resolvePicNames(supabase, reviewActorIds) : new Map<string, string>();
  const nameOf = (id?: string) => (id ? actorNameById.get(id) ?? extraNameById.get(id) : undefined);

  const checklistItems: EventChecklistItem[] = (itemRows ?? []).map((row) => ({
    ...mapChecklistItem(row),
    picName: nameOf(row.pic ?? undefined),
    picLapanganName: nameOf(row.pic_lapangan ?? undefined),
    vendorName: row.vendor_id ? vendorNameById.get(row.vendor_id) : undefined,
    productionDoneByName: nameOf(row.production_done_by ?? undefined),
    completedByName: nameOf(row.completed_by ?? undefined),
    loadingInByName: nameOf(row.loading_in_by ?? undefined),
    loadingOutByName: nameOf(row.loading_out_by ?? undefined),
    finishedByName: nameOf(row.finished_by ?? undefined),
    createdByName: nameOf(row.created_by ?? undefined),
    phaseReviews: (reviewsByItem.get(row.id) ?? []).map((r) => ({
      ...r,
      submittedByName: nameOf(r.submittedBy),
      approvedByName: nameOf(r.approvedBy),
    })),
  }));

  return {
    event: mapEvent(eventRow),
    checklistItems,
    links,
  };
}

/** Nama tampilan untuk kolom `pic` (uuid) tiap item checklist -- lihat
 * komentar `picName` di types.ts. Query terpisah (bukan embedded select)
 * karena `event_checklist_items.pic` sengaja tidak diberi FK literal ke
 * `profiles` (menghindari constraint tambahan lintas skema RLS berbeda). */
async function resolvePicNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  picIds: string[]
): Promise<Map<string, string>> {
  if (picIds.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", picIds);
  if (error) {
    console.error("[events] resolvePicNames gagal:", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.id as string, r.full_name as string]));
}

/** Nama tampilan untuk `vendor_id` (uuid) tiap item checklist -- pola sama
 * persis dengan `resolvePicNames` di atas (rekomendasi 3 laporan gap-event
 * vs SOP, migrasi 0063). Query ke `magnative_vendors`, bukan modul Events
 * sendiri -- konsisten dengan cara `resolveSourceLabels` membaca tabel
 * divisi lain. */
async function resolveVendorNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vendorIds: string[]
): Promise<Map<string, string>> {
  if (vendorIds.length === 0) return new Map();
  const { data, error } = await supabase.from("magnative_vendors").select("id, name").in("id", vendorIds);
  if (error) {
    console.error("[events] resolveVendorNames gagal:", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.id as string, r.name as string]));
}

/** Semua vendor Magnativ, buat dropdown "Kaitkan Vendor" di form checklist
 * item halaman detail Admin (Tahap C) -- lihat `VendorOption` di types.ts.
 * Cuma id+name (bukan `getVendorsForMagnative` penuh, yang tidak ada di
 * modul ini) supaya query tetap ringan dan tidak bergantung tipe Magnative. */
export async function getVendorOptions(): Promise<VendorOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("magnative_vendors").select("id, name").order("name", { ascending: true });
  if (error) {
    console.error("[events] getVendorOptions gagal:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string }));
}

type PicProfileRow = { id: string; full_name: string; division: PicOption["division"] };

/** Staf yang bisa ditunjuk sebagai PIC di Papan Tracking (Tahap D) -- 3
 * divisi operasional + akses penuh, diurutkan per divisi lalu nama supaya
 * gampang di-scan di dropdown. Bergantung pada RLS `profiles` baru
 * ("Lihat profil staf operasional untuk penunjukan PIC", migrasi
 * `event_tracking_board_pic_visibility`) yang membuka lintas-divisi khusus
 * untuk keperluan ini -- sebelumnya staf cuma bisa lihat profil sendiri. */
export async function getAssignablePics(): Promise<PicOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, division")
    .in("division", ["magnarent", "magnative", "production", "all"])
    .order("division", { ascending: true })
    .order("full_name", { ascending: true })
    .returns<PicProfileRow[]>();

  if (error) {
    console.error("[events] getAssignablePics gagal:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name, division: row.division }));
}
