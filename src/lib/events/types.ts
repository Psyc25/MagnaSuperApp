import type { Division } from "@/lib/supabase/types";

/**
 * Tipe untuk modul baru "Tracking Progress Event" (ceklis running event,
 * permintaan Owner -- migrasi 0053). Tahap B: kelola jenis event + template
 * checklist standarnya (dikelola Admin, dipakai saat bikin event baru di
 * Tahap C supaya checklist tidak perlu diketik ulang dari nol tiap kali).
 */

export type EventType = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
};

/** Satu baris template checklist milik satu jenis event -- di-clone jadi
 * `event_checklist_items` waktu event baru dibuat dari jenis ini (Tahap C). */
export type EventTypeTemplateItem = {
  id: string;
  eventTypeId: string;
  category: string;
  itemName: string;
  detail?: string;
  qtyInfo?: string;
  notes?: string;
  sortOrder: number;
  /** Default "Perlu Produksi Ya/Tidak" (Tahap 51) untuk item hasil clone
   * dari template ini -- bisa dioverride per item di event nyatanya. */
  defaultNeedsProduction: boolean;
};

export type CreateEventTypeInput = {
  name: string;
  description?: string;
};

export type TemplateItemInput = {
  category: string;
  itemName: string;
  detail?: string;
  qtyInfo?: string;
  notes?: string;
};

/** Field TAMBAHAN khusus checklist event AKTUAL (Tahap C) -- vendor/tim/
 * deadline TIDAK berlaku untuk template jenis event (`TemplateItemInput`
 * di atas dipakai bersama), karena vendor & deadline baru masuk akal
 * begitu event sungguhan sudah dibuat. Migrasi 0063, rekomendasi 3/4/5. */
export type ChecklistItemExtraInput = {
  vendorId?: string | null;
  team?: string;
  dueDate?: string;
  /** Cuma dibaca `addEventChecklistItem` (Tahap F) -- default `true` kalau
   * tidak diisi. Menentukan `current_phase` awal item: "design" kalau
   * perlu produksi, langsung "completed" kalau tidak (lompat Design/
   * Mockup/Sample/Production, sama seperti clone dari template). Diabaikan
   * `updateEventChecklistItem` -- ubah item yang SUDAH ada tetap lewat
   * `setChecklistNeedsProduction` (satu-satunya jalur, supaya current_phase
   * ikut disesuaikan konsisten). */
  needsProduction?: boolean;
};

/**
 * Satu baris hasil parsing Excel/CSV di client (lihat EventTypeManager.tsx)
 * SEBELUM disimpan -- parser mendukung DUA bentuk file sumber:
 *  1. Ada kolom "Kategori" eksplisit di setiap baris (format tabular biasa).
 *  2. TIDAK ada kolom Kategori -- kategori muncul sebagai baris tersendiri
 *     (mis. "A. VENUE") yang isinya cuma nama kategori, lalu diikuti
 *     baris-baris item di bawahnya sampai kategori berikutnya. Ini bentuk
 *     checklist asli yang dicontohkan Owner (mis. "Grab KOL Gathering").
 */
export type TemplateImportRow = {
  category: string;
  itemName: string;
  detail?: string;
  qtyInfo?: string;
  notes?: string;
};

export type TemplateImportSummary = {
  inserted: number;
  skipped: number;
  errors: string[];
};

// ---------------------------------------------------------------------
// Tahap C: event AKTUAL (bukan template lagi) -- dibuat dari salah satu
// EventType di atas (opsional -- boleh juga tanpa jenis, checklist kosong
// lalu diisi manual/import sendiri), checklist-nya hasil clone dari
// template jenis tsb, dan bisa dikaitkan ke booking/proyek yang sudah ada
// di masing-masing divisi (event_links, migrasi 0053) -- itulah dasar
// akses baca lintas-divisi yang diminta Owner.
// ---------------------------------------------------------------------

export type EventStatus = "Berjalan" | "Selesai" | "Dibatalkan";
export const EVENT_STATUSES: EventStatus[] = ["Berjalan", "Selesai", "Dibatalkan"];

/** 5 tahap dari diagram Owner (Sample -> Approval -> Preparation ->
 * Production -> Finish) PLUS "Belum Mulai" sebagai status awal item yang
 * baru di-clone/dibuat -- berlaku untuk SEMUA kategori item (bukan cuma
 * barang fisik), lihat diskusi Tahap awal modul ini. */
export type EventChecklistStatus = "Belum Mulai" | "Sample" | "Approval" | "Preparation" | "Production" | "Finish";
export const EVENT_CHECKLIST_STATUSES: EventChecklistStatus[] = [
  "Belum Mulai",
  "Sample",
  "Approval",
  "Preparation",
  "Production",
  "Finish",
];

/**
 * Redesain besar model checklist (Tahap 51, permintaan Owner) -- 8 fase
 * pengganti `EventChecklistStatus` di atas (yang TETAP DIPERTAHANKAN cuma
 * sebagai arsip data lama, lihat migrasi `event_checklist_phase_model`).
 * Urutan persis dari diskusi ulang dengan Owner:
 * Design -> Mockup -> Sample -> Production -> Completed -> Loading In
 * (mulai dibawa ke lokasi event) -> Loading Out (pulang dari lokasi event)
 * -> Finish. Item yang `needsProduction=false` melompati Design/Mockup/
 * Sample/Production dan mulai langsung dari Completed.
 */
export type ChecklistPhase =
  | "design"
  | "mockup"
  | "sample"
  | "production"
  | "completed"
  | "loading_in"
  | "loading_out"
  | "finish";

export const CHECKLIST_PHASES: ChecklistPhase[] = [
  "design",
  "mockup",
  "sample",
  "production",
  "completed",
  "loading_in",
  "loading_out",
  "finish",
];

export const CHECKLIST_PHASE_LABELS: Record<ChecklistPhase, string> = {
  design: "Design",
  mockup: "Mockup",
  sample: "Sample",
  production: "Production",
  completed: "Completed",
  loading_in: "Loading In",
  loading_out: "Loading Out",
  finish: "Finish",
};

/** Fase yang punya siklus sub-status Proposed -> Revised -> Approved
 * (dengan foto wajib) -- cuma 3 dari 8 fase di atas. */
export type ChecklistReviewPhase = "design" | "mockup" | "sample";
export const CHECKLIST_REVIEW_PHASES: ChecklistReviewPhase[] = ["design", "mockup", "sample"];

/** Monoton -- begitu lewat Proposed tidak pernah mundur, tetap "Revised"
 * sampai akhirnya "Approved" walau berkali-kali revisi (revisionCount naik
 * tiap kali, sub-statusnya sendiri tidak berubah dari "revised"). */
export type ChecklistSubStatus = "proposed" | "revised" | "approved";
export const CHECKLIST_SUB_STATUS_LABELS: Record<ChecklistSubStatus, string> = {
  proposed: "Proposed",
  revised: "Revised",
  approved: "Approved",
};

/** State SAAT INI submission Design/Mockup/Sample satu item -- maksimal 1
 * baris per fase per item (bukan log penuh, itu tugas
 * `event_checklist_status_log`). Approval untuk sementara oleh PIC item itu
 * sendiri (approvedBy = submittedBy), akan dipisah nanti. */
export type ChecklistPhaseReview = {
  id: string;
  checklistItemId: string;
  phase: ChecklistReviewPhase;
  subStatus: ChecklistSubStatus;
  revisionCount: number;
  photoUrl?: string;
  submittedBy?: string;
  submittedByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  updatedAt: string;
};

/**
 * Urutan tetap dipakai untuk hitung progres granular (Tahap 51) -- diminta
 * Owner supaya progres pakai detail sub-fase, bukan cuma posisi fase.
 * Item `needsProduction=true`: 14 posisi (0-13) -- design/mockup/sample
 * masing-masing 3 sub-status (proposed/revised/approved) = 9, + production
 * selesai + completed + loading in + loading out + finish = 14.
 * Item `needsProduction=false`: 4 posisi (0-3) -- completed/loading in/
 * loading out/finish, langsung dari completed.
 */
export function computeChecklistItemProgress(
  item: { needsProduction: boolean; currentPhase: ChecklistPhase },
  reviews: Pick<ChecklistPhaseReview, "phase" | "subStatus">[]
): number {
  const subIdx = (phase: ChecklistReviewPhase) => {
    const found = reviews.find((r) => r.phase === phase);
    if (!found) return 0;
    return found.subStatus === "approved" ? 2 : found.subStatus === "revised" ? 1 : 0;
  };

  if (!item.needsProduction) {
    // Bugfix: order punya 4 posisi (index 0-3), jadi pembaginya harus
    // order.length - 1 (= 3), BUKAN order.length (= 4) -- sebelumnya
    // "Finish" (index 3) cuma dapat 3/4 = 75%, tidak pernah 100%.
    const order: ChecklistPhase[] = ["completed", "loading_in", "loading_out", "finish"];
    const MAX = order.length - 1;
    const idx = order.indexOf(item.currentPhase);
    const step = idx === -1 ? 0 : idx;
    return Math.round((step / MAX) * 100);
  }

  const MAX = 13;
  let step: number;
  switch (item.currentPhase) {
    case "design":
      step = 0 + subIdx("design");
      break;
    case "mockup":
      step = 3 + subIdx("mockup");
      break;
    case "sample":
      step = 6 + subIdx("sample");
      break;
    case "production":
      step = 9;
      break;
    case "completed":
      step = 10;
      break;
    case "loading_in":
      step = 11;
      break;
    case "loading_out":
      step = 12;
      break;
    case "finish":
      step = 13;
      break;
    default:
      step = 0;
  }
  return Math.round((step / MAX) * 100);
}

export type EventSourceType = "magnarent_booking" | "magnative_project" | "production_booth_project";

export const EVENT_SOURCE_LABELS: Record<EventSourceType, string> = {
  magnarent_booking: "Booking Magnarent",
  magnative_project: "Proyek Magnativ",
  production_booth_project: "Proyek Booth Production",
};

export type EventSummary = {
  id: string;
  name: string;
  clientName?: string;
  eventTypeId?: string;
  eventTypeName?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  status: EventStatus;
  notes?: string;
  createdAt: string;
  /** Jumlah item checklist & yang sudah "Finish" (Tahap E) -- dipakai
   * dashboard ringkasan Admin & Papan Tracking untuk progress bar per
   * event, TANPA perlu buka detail satu-satu. undefined kalau caller
   * belum minta dihitung (lihat `getEvents({ withProgress: true })`). */
  checklistTotal?: number;
  checklistDone?: number;
  /** Rata-rata progres granular (0-100) seluruh item checklist event ini,
   * lihat `computeChecklistItemProgress` -- BUKAN cuma checklistDone/Total
   * (itu tetap dihitung terpisah untuk label "x/y item selesai"), dipakai
   * ChecklistProgressRing di kartu event & widget Dashboard Hub (Tahap 51). */
  checklistProgressPercent?: number;
};

export type EventChecklistItem = {
  id: string;
  eventId: string;
  category: string;
  itemName: string;
  detail?: string;
  qtyInfo?: string;
  notes?: string;
  status: EventChecklistStatus;
  /** "PIC Produksi" -- id profil (uuid) staf yang tanggung jawab fase
   * Design/Mockup/Sample/Production, diisi/diubah lewat Papan Tracking
   * (Tahap D), bukan di halaman detail Admin (Tahap C). Sebelum Tahap 52
   * ini satu-satunya PIC untuk seluruh 8 fase; sekarang dipisah dari
   * `picLapangan` di bawah (keputusan Owner: mekanisme dirasa rumit kalau
   * 1 orang dipaksa tanggung jawab dari produksi sampai lapangan). */
  pic?: string;
  /** Nama tampilan untuk `pic` di atas, diresolusi di data.ts (Tahap D) --
   * dipisah dari `pic` (uuid) supaya UI tidak perlu query profiles sendiri. */
  picName?: string;
  /** "PIC Lapangan" (Tahap 52, migrasi `event_checklist_dual_pic`) -- id
   * profil (uuid) staf yang tanggung jawab fase Completed/Loading In/
   * Loading Out/Finish, terpisah dari `pic` ("PIC Produksi") di atas. */
  picLapangan?: string;
  /** Nama tampilan untuk `picLapangan`, pola sama dengan `picName`. */
  picLapanganName?: string;
  sortOrder: number;
  /** Kaitan opsional ke `magnative_vendors` (rekomendasi 3 laporan gap-
   * event vs SOP, migrasi 0063) -- sourcing (harga/kategori vendor)
   * langsung terlihat dari checklist. Diisi/diubah di halaman detail
   * Admin (Tahap C), sama seperti category/itemName. */
  vendorId?: string;
  /** Nama tampilan untuk `vendorId` di atas, diresolusi di data.ts --
   * dipisah dari `vendorId` (uuid) sama pola dengan `picName`. */
  vendorName?: string;
  /** Nama tim penanggung jawab item (mis. "Tim Creative"/"Tim Project"),
   * bebas teks -- rekomendasi 4 laporan gap-event vs SOP, migrasi 0063. */
  team?: string;
  /** Tanggal target/deadline BARIS INI (beda dari tanggal mulai/selesai
   * event secara keseluruhan) -- rekomendasi 5 laporan gap-event vs SOP,
   * migrasi 0063. */
  dueDate?: string;
  /** Apakah item ini perlu melalui Design/Mockup/Sample/Production (Tahap
   * 51) -- default dari `EventTypeTemplateItem.defaultNeedsProduction` saat
   * di-clone, bisa diubah Admin kapan saja di Papan Tracking. `false` =
   * item langsung mulai dari fase Completed. */
  needsProduction: boolean;
  /** Posisi fase saat ini di alur 8-fase baru -- pengganti `status` di atas
   * untuk logika Papan Tracking (status lama tetap disimpan sebagai arsip). */
  currentPhase: ChecklistPhase;
  productionQty?: string;
  productionNotes?: string;
  productionPhotoUrl?: string;
  productionDoneAt?: string;
  productionDoneBy?: string;
  productionDoneByName?: string;
  completedAt?: string;
  completedBy?: string;
  completedByName?: string;
  loadingInAt?: string;
  loadingInBy?: string;
  loadingInByName?: string;
  loadingOutAt?: string;
  loadingOutBy?: string;
  loadingOutByName?: string;
  finishedAt?: string;
  finishedBy?: string;
  finishedByName?: string;
  /** id staf yang MENAMBAHKAN item ini (bukan PIC) -- Tahap F, diisi
   * otomatis waktu ditambahkan lewat Papan Tracking maupun halaman Admin.
   * NULL untuk item lama sebelum kolom ini ada, atau hasil clone template.
   * Staf HANYA bisa edit/hapus item yang `createdBy`-nya dirinya sendiri
   * dari Papan Tracking (lihat guard di actions.ts) -- Admin/Owner selalu
   * bebas, sama seperti sebelumnya. */
  createdBy?: string;
  createdByName?: string;
  /** Cuma diisi `getEventById` (Papan Tracking) -- state Design/Mockup/
   * Sample saat ini, maksimal 3 baris (lihat `ChecklistPhaseReview`). */
  phaseReviews?: ChecklistPhaseReview[];
};

export type EventLink = {
  id: string;
  eventId: string;
  sourceType: EventSourceType;
  sourceId: string;
  sourceLabel: string;
  createdAt: string;
};

export type EventDetail = {
  event: EventSummary;
  checklistItems: EventChecklistItem[];
  links: EventLink[];
};

export type CreateEventInput = {
  name: string;
  clientName?: string;
  eventTypeId?: string | null;
  location?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
};

export type LinkableSource = {
  sourceType: EventSourceType;
  sourceId: string;
  label: string;
};

// ---------------------------------------------------------------------
// Tahap D: "Papan Tracking" -- update status & PIC tiap item checklist,
// terbuka untuk 3 divisi operasional + akses penuh (lihat RLS
// `event_checklist_items_update`, sudah dibuka sejak migrasi 0053).
// Halaman terpisah dari detail Admin (Tahap C) di /dashboard/admin/events
// -- Papan Tracking ada di /dashboard/tracking-event, tanpa fitur kelola
// event (tambah/hapus item, kaitan) yang tetap khusus Admin.
// ---------------------------------------------------------------------

/** Staf yang bisa ditunjuk sebagai PIC -- profil dari 3 divisi operasional
 * + akses penuh (lihat policy profiles baru "Lihat profil staf operasional
 * untuk penunjukan PIC"), TIDAK termasuk investor. */
export type PicOption = {
  id: string;
  fullName: string;
  division: Division;
};

/** Opsi dropdown vendor Magnativ untuk dikaitkan ke checklist item (Tahap
 * C, migrasi 0063, rekomendasi 3) -- dipakai `EventDetailManager.tsx`.
 * Cuma id+name (bukan seluruh `Vendor` dari lib/magnative/types) supaya
 * modul Events tidak perlu import tipe modul Magnative secara langsung,
 * konsisten dengan semangat "tiap modul berdiri sendiri". */
export type VendorOption = {
  id: string;
  name: string;
};

/** Preset nama tim untuk dropdown `team` di form checklist item -- staf
 * tetap bisa isi nama tim lain lewat opsi "Lainnya" (lihat
 * EventDetailManager.tsx), field-nya sendiri bebas teks di DB. */
export const CHECKLIST_TEAM_PRESETS = ["Tim Creative", "Tim Project"] as const;

export type UpdateChecklistProgressInput = {
  status: EventChecklistStatus;
  picId: string | null;
};

/**
 * Satu baris riwayat perubahan status/PIC (papan tulis Owner: "Preparation
 * PIC", "Production PIC", "Finish PIC" ditulis terpisah -- `pic` di
 * `EventChecklistItem` cuma satu nilai yang DITIMPA tiap kali status
 * berubah, tidak ada histori siapa yang pegang di tahap apa). Tabel
 * `event_checklist_status_log` APPEND-ONLY -- satu baris baru ditulis tiap
 * kali `updateEventChecklistProgress` dipanggil (migrasi 0065). */
export type ChecklistStatusLogEntry = {
  id: string;
  checklistItemId: string;
  /** Label fase (Design..Finish, migrasi 0093) atau status lama untuk baris historis. */
  status: string;
  picId?: string;
  picName?: string;
  changedAt: string;
};

/**
 * Satu komentar thread diskusi terikat ke item checklist (rekomendasi
 * Bagian 5-B #7 laporan riset kompetitor 24 Sep 2026 -- "Live document
 * sync + thread diskusi terikat langsung ke item checklist", ala Curate/
 * Tripleseat). Memperkuat histori status/PIC di atas dengan lapisan
 * komunikasi lintas-divisi langsung di item yang relevan. Pola sama persis
 * dengan `AssetComment` di modul Magnative (proofing ringan aset kreatif)
 * -- `authorName` di-snapshot saat komentar dibuat, bukan join live ke
 * profiles. Migrasi 0067.
 */
export type ChecklistComment = {
  id: string;
  checklistItemId: string;
  authorName: string;
  commentText: string;
  isResolved: boolean;
  createdAt: string;
};
