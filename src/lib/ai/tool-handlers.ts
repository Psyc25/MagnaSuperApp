/**
 * Tool handlers untuk AI Assistant MagnaSuperApp.
 *
 * Nama tabel & kolom di sini HARUS sama persis dengan skema Supabase
 * (kolom inventaris/klien/event berbahasa Inggris: `name`, `category`,
 * `start_date`, dst — bukan `nama`/`kategori`). Versi awal Tahap 80 menebak
 * nama kolom sehingga hampir semua tool gagal dengan error Postgres.
 *
 * Action tools SENGAJA memanggil Server Action yang sama dengan UI
 * (`addBooking`, `updateBookingStatus`, `addEventExpense`) supaya aturan
 * bisnisnya ikut berlaku: validasi input, cek bentrok jadwal + RPC
 * terkunci `save_booking_checked`, posting jurnal otomatis, log aktivitas,
 * notifikasi, dan revalidasi halaman. RLS tetap jadi penjaga akhir.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolResult, UserContext } from "./types";
import { isActionTool } from "./tools";
import { addBooking, updateBookingStatus } from "@/lib/magnarent/actions";
import { getAvailableUnitsInRange } from "@/lib/magnarent/availability";
import { rowToBooking, rowToInventory, type BookingRow, type InventoryRow } from "@/lib/magnarent/mappers";
import type { BookingStatus, PaymentStatus } from "@/lib/magnarent/types";
import { BOOKING_TRANSITIONS } from "@/lib/magnarent/booking-status";
import { addEventExpense } from "@/lib/event-expenses/actions";
import {
  EXPENSE_CATEGORIES,
  REIMBURSEMENT_STATUSES,
  type ExpenseCategory,
  type ReimbursementStatus,
  type ExpenseDivision,
  type ExpenseSourceType,
} from "@/lib/event-expenses/types";
import { CHECKLIST_PHASE_LABELS, type ChecklistPhase } from "@/lib/events/types";
import {
  handleGetCapitalRequests,
  handleGetDailySummary,
  handleGetEventDetail,
  handleGetExpenses,
  handleGetInvoices,
  handleGetPurchaseOrders,
} from "./report-tools";

type Args = Record<string, unknown>;

const BOOKING_STATUSES: BookingStatus[] = ["Menunggu", "Dikonfirmasi", "Selesai", "Dibatalkan"];
const PAYMENT_STATUSES: PaymentStatus[] = ["Belum Bayar", "DP", "Lunas"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Execute a tool call and return the result.
 * Action tools return requiresConfirmation=true on first call.
 */
export async function executeToolCall(
  supabase: SupabaseClient,
  ctx: UserContext,
  toolName: string,
  args: Args,
  confirmed = false
): Promise<ToolResult> {
  if (isActionTool(toolName) && !confirmed) {
    try {
      return await buildConfirmationResponse(supabase, toolName, args, ctx);
    } catch (err) {
      console.error(`[ai] konfirmasi ${toolName} gagal:`, err);
      return { success: false, error: "Gagal menyiapkan ringkasan aksi, coba lagi." };
    }
  }

  try {
    switch (toolName) {
      // Query tools
      case "search_global":
        return await handleSearchGlobal(supabase, args);
      case "get_bookings":
        return await handleGetBookings(supabase, ctx, args);
      case "get_inventory":
        return await handleGetInventory(supabase, ctx, args);
      case "get_clients":
        return await handleGetClients(supabase, ctx, args);
      case "get_projects":
        return await handleGetProjects(supabase, ctx, args);
      case "get_events":
        return await handleGetEvents(supabase, ctx, args);
      case "get_materials":
        return await handleGetMaterials(supabase, ctx, args);
      case "check_availability":
        return await handleCheckAvailability(supabase, ctx, args);
      case "get_invoices":
        return await handleGetInvoices(supabase, ctx, args);
      case "get_event_detail":
        return await handleGetEventDetail(supabase, ctx, args);
      case "get_capital_requests":
        return await handleGetCapitalRequests(supabase, ctx, args);
      case "get_purchase_orders":
        return await handleGetPurchaseOrders(supabase, ctx, args);
      case "get_expenses":
        return await handleGetExpenses(supabase, ctx, args);
      case "get_daily_summary":
        return await handleGetDailySummary(supabase, ctx);

      // Action tools (sudah dikonfirmasi)
      case "create_booking":
        return await handleCreateBooking(ctx, args);
      case "update_booking_status":
        return await handleUpdateBookingStatus(supabase, ctx, args);
      case "create_event_expense":
        return await handleCreateEventExpense(supabase, ctx, args);

      default:
        return { success: false, error: `Tool tidak dikenal: ${toolName}` };
    }
  } catch (err) {
    console.error(`[ai] tool ${toolName} gagal:`, err);
    return { success: false, error: "Terjadi kesalahan saat menjalankan tool." };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function isoDate(value: unknown): string | undefined {
  const s = str(value);
  return s && ISO_DATE.test(s) ? s : undefined;
}

function limitOf(args: Args): number {
  const n = num(args.limit);
  return n && n > 0 ? Math.min(Math.floor(n), 50) : 20;
}

/** Escape karakter wildcard/pemisah filter PostgREST supaya input bebas dari AI
 * tidak bisa mengubah arti filter `ilike`. */
function likePattern(value: string): string {
  return `%${value.replace(/[%_,()\\]/g, " ").trim()}%`;
}

function denied(module: string): ToolResult {
  return { success: false, error: `Tidak memiliki akses ke ${module}` };
}

function dbError(scope: string, message: string): ToolResult {
  console.error(`[ai] ${scope} gagal:`, message);
  return { success: false, error: "Gagal mengambil data, coba lagi." };
}

// ============================================================================
// QUERY HANDLERS
// ============================================================================

async function handleSearchGlobal(supabase: SupabaseClient, args: Args): Promise<ToolResult> {
  const query = str(args.query) ?? "";
  if (query.length < 2) {
    return { success: false, error: "Kata kunci minimal 2 karakter" };
  }

  const { data, error } = await supabase.rpc("global_search", { q: query });
  if (error) return dbError("search_global", error.message);

  const results = (data ?? []).slice(0, 30);
  return { success: true, data: { query, results, count: results.length } };
}

async function handleGetBookings(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  let query = supabase
    .from("magnarent_bookings")
    .select(
      "id, nama_klien, telepon_klien, tanggal_mulai, tanggal_selesai, jumlah_unit, status, status_pembayaran, dp_amount, catatan, item:magnarent_inventory(id, name, category)"
    )
    .order("tanggal_mulai", { ascending: true });

  const status = str(args.status);
  if (status && BOOKING_STATUSES.includes(status as BookingStatus)) query = query.eq("status", status);
  // Filter rentang = booking yang BERSINGGUNGAN dengan [dateFrom, dateTo],
  // bukan yang seluruhnya di dalam rentang — booking 28 Okt-2 Nov tetap
  // muncul saat ditanya "booking minggu depan (30 Okt-5 Nov)".
  const dateFrom = isoDate(args.dateFrom);
  const dateTo = isoDate(args.dateTo);
  if (dateFrom) query = query.gte("tanggal_selesai", dateFrom);
  if (dateTo) query = query.lte("tanggal_mulai", dateTo);
  const clientName = str(args.clientName);
  if (clientName) query = query.ilike("nama_klien", likePattern(clientName));

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_bookings", error.message);

  return { success: true, data: { bookings: data ?? [], count: (data ?? []).length } };
}

async function handleGetInventory(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  let query = supabase
    .from("magnarent_inventory")
    .select("id, name, category, location, total_unit, unit_maintenance, price_per_day, price_per_week, price_per_month")
    .order("name", { ascending: true });

  const category = str(args.category);
  if (category) query = query.ilike("category", likePattern(category));
  const location = str(args.location);
  if (location) query = query.ilike("location", likePattern(location));
  const search = str(args.searchName);
  if (search) query = query.ilike("name", likePattern(search));

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_inventory", error.message);

  const inventory = (data ?? []).map((row) => ({
    ...row,
    unit_siap_sewa: Math.max(0, row.total_unit - row.unit_maintenance),
  }));
  return { success: true, data: { inventory, count: inventory.length } };
}

async function handleGetClients(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  let query = supabase
    .from("magnative_clients")
    .select("id, name, industry, pic_name, pic_phone, pic_email, status")
    .order("name", { ascending: true });

  const industry = str(args.industry);
  if (industry) query = query.ilike("industry", likePattern(industry));
  const status = str(args.status);
  if (status) query = query.eq("status", status);
  const search = str(args.searchName);
  if (search) query = query.ilike("name", likePattern(search));

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_clients", error.message);

  return { success: true, data: { clients: data ?? [], count: (data ?? []).length } };
}

async function handleGetProjects(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  // Tanpa `module`, pilih modul yang memang bisa diakses user -- staf
  // Production yang bertanya "proyek apa saja" tidak boleh dijawab "tidak
  // punya akses Magnativ".
  const requestedModule = str(args.module);
  const projectModule =
    requestedModule === "production" || requestedModule === "magnative"
      ? requestedModule
      : ctx.canAccessMagnative
        ? "magnative"
        : "production";
  const limit = limitOf(args);
  const status = str(args.status);
  const clientName = str(args.clientName);

  if (projectModule === "production") {
    if (!ctx.canAccessProduction) return denied("Production");

    let query = supabase
      .from("production_booth_projects")
      .select("id, name, nama_klien, lokasi_acara, status, tanggal_mulai, tanggal_instalasi, tanggal_bongkar_estimasi, budget, status_pembayaran")
      .order("tanggal_mulai", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    if (clientName) query = query.ilike("nama_klien", likePattern(clientName));

    const { data, error } = await query;
    if (error) return dbError("get_projects(production)", error.message);
    return { success: true, data: { projects: data ?? [], module: "production", count: (data ?? []).length } };
  }

  if (!ctx.canAccessMagnative) return denied("Magnativ");

  // `!inner` supaya filter nama klien benar-benar menyaring proyek (tanpa
  // itu PostgREST cuma mengosongkan embed klien, proyek tetap ikut tampil).
  const clientEmbed = clientName ? "client:magnative_clients!inner(id, name)" : "client:magnative_clients(id, name)";
  let query = supabase
    .from("magnative_projects")
    .select(`id, name, type, tanggal_mulai, tanggal_selesai, status, pipeline_stage, budget, status_pembayaran, ${clientEmbed}`)
    .order("tanggal_mulai", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);
  if (clientName) query = query.ilike("client.name", likePattern(clientName));

  const { data, error } = await query;
  if (error) return dbError("get_projects(magnative)", error.message);
  return { success: true, data: { projects: data ?? [], module: "magnative", count: (data ?? []).length } };
}

async function handleGetEvents(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessEvents) return denied("Events");

  let query = supabase
    .from("events")
    .select("id, name, client_name, location, start_date, end_date, status, event_type:event_types(name)")
    .order("start_date", { ascending: false });

  const status = str(args.status);
  if (status) query = query.eq("status", status);
  const dateFrom = isoDate(args.dateFrom);
  const dateTo = isoDate(args.dateTo);
  // Event tanpa tanggal selesai (end_date null, boleh di form) dinilai dari
  // tanggal mulainya -- tanpa ini event seperti itu hilang dari filter.
  if (dateFrom) query = query.or(`end_date.gte.${dateFrom},and(end_date.is.null,start_date.gte.${dateFrom})`);
  if (dateTo) query = query.lte("start_date", dateTo);
  const search = str(args.searchName);
  if (search) query = query.ilike("name", likePattern(search));

  const { data: events, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_events", error.message);
  if (!events || events.length === 0) return { success: true, data: { events: [], count: 0 } };

  // Progres checklist mengikuti fase Papan Tracking (`current_phase`),
  // bukan kolom `status` lama yang sudah tidak diperbarui UI.
  const progressByEvent = new Map<string, { total: number; finish: number; perFase: Record<string, number> }>();
  if (ctx.canAccessChecklist) {
    const { data: items, error: itemsError } = await supabase
      .from("event_checklist_items")
      .select("event_id, current_phase")
      .in(
        "event_id",
        events.map((e) => e.id)
      );
    if (itemsError) console.error("[ai] get_events checklist gagal:", itemsError.message);
    for (const item of items ?? []) {
      const entry = progressByEvent.get(item.event_id) ?? { total: 0, finish: 0, perFase: {} };
      const label = CHECKLIST_PHASE_LABELS[item.current_phase as ChecklistPhase] ?? item.current_phase;
      entry.total += 1;
      if (item.current_phase === "finish") entry.finish += 1;
      entry.perFase[label] = (entry.perFase[label] ?? 0) + 1;
      progressByEvent.set(item.event_id, entry);
    }
  }

  const result = events.map((e) => {
    const p = progressByEvent.get(e.id);
    return {
      ...e,
      checklist: p
        ? { total_item: p.total, item_finish: p.finish, persen_finish: Math.round((p.finish / p.total) * 100), per_fase: p.perFase }
        : null,
    };
  });
  return { success: true, data: { events: result, count: result.length } };
}

async function handleGetMaterials(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  let query = supabase
    .from("production_materials")
    .select("id, name, category, unit, location, stock, min_stock, price_per_unit")
    .order("name", { ascending: true });

  const category = str(args.category);
  if (category) query = query.ilike("category", likePattern(category));
  const search = str(args.searchName);
  if (search) query = query.ilike("name", likePattern(search));

  if (args.lowStock === true) {
    // PostgREST tidak bisa membandingkan dua kolom, jadi disaring di sini.
    const { data, error } = await query;
    if (error) return dbError("get_materials", error.message);
    const lowStockItems = (data ?? []).filter((m) => Number(m.stock) <= Number(m.min_stock)).slice(0, limitOf(args));
    return { success: true, data: { materials: lowStockItems, count: lowStockItems.length, lowStockOnly: true } };
  }

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_materials", error.message);
  return { success: true, data: { materials: data ?? [], count: (data ?? []).length } };
}

async function handleCheckAvailability(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const dateFrom = isoDate(args.dateFrom);
  const dateTo = isoDate(args.dateTo);
  if (!dateFrom || !dateTo) {
    return { success: false, error: "Tanggal mulai dan selesai harus diisi (format YYYY-MM-DD)" };
  }
  if (dateFrom > dateTo) {
    return { success: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai" };
  }

  let itemRow: InventoryRow | null = null;
  const itemId = str(args.itemId);
  const itemName = str(args.itemName);
  if (itemId) {
    const { data } = await supabase.from("magnarent_inventory").select("*").eq("id", itemId).maybeSingle<InventoryRow>();
    itemRow = data;
  } else if (itemName) {
    const { data } = await supabase
      .from("magnarent_inventory")
      .select("*")
      .ilike("name", likePattern(itemName))
      .order("name")
      .limit(5)
      .returns<InventoryRow[]>();
    if (data && data.length > 1) {
      return {
        success: true,
        data: {
          message: "Ada beberapa alat yang cocok, tanyakan ke user mana yang dimaksud.",
          candidates: data.map((r) => ({ id: r.id, name: r.name, category: r.category })),
        },
      };
    }
    itemRow = data?.[0] ?? null;
  } else {
    return { success: false, error: "ID atau nama alat harus diisi" };
  }

  if (!itemRow) return { success: false, error: "Alat tidak ditemukan" };

  const { data: bookingRows, error } = await supabase
    .from("magnarent_bookings")
    .select("*")
    .eq("item_id", itemRow.id)
    .returns<BookingRow[]>();
  if (error) return dbError("check_availability", error.message);

  // Logika sama persis dengan form booking (src/lib/magnarent/availability.ts):
  // unit maintenance dikurangi, booking Menunggu/Dikonfirmasi yang
  // bersinggungan dihitung terpakai.
  const item = rowToInventory(itemRow);
  const bookings = (bookingRows ?? []).map(rowToBooking);
  const availableUnits = getAvailableUnitsInRange(item, bookings, dateFrom, dateTo);
  const bookable = item.totalUnit - item.unitMaintenance;

  return {
    success: true,
    data: {
      item: { id: item.id, name: item.name },
      dateRange: { from: dateFrom, to: dateTo },
      totalUnits: item.totalUnit,
      maintenanceUnits: item.unitMaintenance,
      bookedUnits: bookable - availableUnits,
      availableUnits: Math.max(0, availableUnits),
      isAvailable: availableUnits > 0,
    },
  };
}

// ============================================================================
// ACTION HANDLERS (dijalankan setelah konfirmasi)
// ============================================================================

async function handleCreateBooking(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const itemId = str(args.itemId);
  const namaKlien = str(args.namaKlien);
  const tanggalMulai = isoDate(args.tanggalMulai);
  const tanggalSelesai = isoDate(args.tanggalSelesai);
  const jumlahUnit = num(args.jumlahUnit);
  if (!itemId || !namaKlien || !tanggalMulai || !tanggalSelesai || jumlahUnit === undefined) {
    return { success: false, error: "Data booking belum lengkap (alat, klien, tanggal, jumlah unit)." };
  }
  const statusPembayaran = PAYMENT_STATUSES.includes(args.statusPembayaran as PaymentStatus)
    ? (args.statusPembayaran as PaymentStatus)
    : "Belum Bayar";

  const result = await addBooking({
    itemId,
    namaKlien,
    teleponKlien: str(args.teleponKlien),
    tanggalMulai,
    tanggalSelesai,
    jumlahUnit,
    statusPembayaran,
    dpAmount: statusPembayaran === "DP" ? num(args.jumlahDp) : undefined,
    catatan: str(args.catatan),
  });

  if (!result.ok) {
    if ("conflict" in result) {
      return {
        success: false,
        error: `Jadwal bentrok: hanya ${Math.max(0, result.conflict.available)} unit tersedia, diminta ${result.conflict.requested}.`,
      };
    }
    return { success: false, error: result.error };
  }

  return { success: true, data: { message: `Booking untuk ${namaKlien} berhasil dibuat (status: Menunggu).` } };
}

// Transisi status yang sah: BOOKING_TRANSITIONS (src/lib/magnarent/booking-status.ts),
// sama dengan halaman Booking & updateBookingStatus di server.

type BookingForStatus = {
  id: string;
  nama_klien: string;
  status: BookingStatus;
  tanggal_mulai: string;
  tanggal_selesai: string;
  item: { name: string } | null;
};

async function loadBookingForStatusChange(
  supabase: SupabaseClient,
  bookingId: string | undefined,
  status: string | undefined
): Promise<{ booking: BookingForStatus } | { error: string }> {
  if (!bookingId || !status || !BOOKING_STATUSES.includes(status as BookingStatus)) {
    return { error: "ID booking atau status tidak valid." };
  }
  const { data: booking } = await supabase
    .from("magnarent_bookings")
    .select("id, nama_klien, status, tanggal_mulai, tanggal_selesai, item:magnarent_inventory(name)")
    .eq("id", bookingId)
    .maybeSingle<BookingForStatus>();
  if (!booking) return { error: "Booking tidak ditemukan." };
  if (booking.status === status) return { error: `Booking ini sudah berstatus "${status}".` };
  if (!BOOKING_TRANSITIONS[booking.status].includes(status as BookingStatus)) {
    return {
      error:
        booking.status === "Dibatalkan" || booking.status === "Selesai"
          ? `Booking berstatus "${booking.status}" sudah final dan tidak bisa dibuka lagi -- buat booking baru supaya ketersediaan alat dicek ulang.`
          : `Status "${booking.status}" tidak bisa langsung diubah ke "${status}".`,
    };
  }
  return { booking };
}

async function handleUpdateBookingStatus(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  // Dicek ulang saat eksekusi -- status bisa berubah (atau booking dihapus)
  // di antara ringkasan konfirmasi dan user mengetik "Ya".
  const check = await loadBookingForStatusChange(supabase, str(args.bookingId), str(args.status));
  if ("error" in check) return { success: false, error: check.error };
  const status = args.status as BookingStatus;

  const result = await updateBookingStatus(check.booking.id, status);
  if (!result.ok) return { success: false, error: result.error };

  return {
    success: true,
    data: { message: `Status booking ${check.booking.nama_klien} berhasil diubah dari "${check.booking.status}" ke "${status}".` },
  };
}

/** Sumber pengeluaran -> tabel untuk validasi, kolom nama, dan divisi pemiliknya. */
const EXPENSE_SOURCES: Record<
  Exclude<ExpenseSourceType, "umum">,
  { table: string; nameColumn: string; division: ExpenseDivision }
> = {
  event_tracking: { table: "events", nameColumn: "name", division: "event" },
  magnarent_booking: { table: "magnarent_bookings", nameColumn: "nama_klien", division: "magnarent" },
  magnative_project: { table: "magnative_projects", nameColumn: "name", division: "magnative" },
  production_booth: { table: "production_booth_projects", nameColumn: "name", division: "production" },
};
const UMUM_DIVISIONS: ExpenseDivision[] = ["magnarent", "magnative", "production", "finance"];

function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

/**
 * Desain fleksibel (dari main, 26ce311): cukup kategori + jumlah, sisanya
 * default (tanggal hari ini WIB, PIC = user, Cash, 'umum'). Tetap lewat
 * addEventExpense supaya validasi, posting jurnal otomatis & log aktivitas
 * ikut jalan -- insert langsung ke tabel melewati semua itu. Divisi selalu
 * diturunkan ke nilai yang diizinkan CHECK constraint (bukan 'all'/'investor'
 * dari profil user, yang akan ditolak database).
 */
async function handleCreateEventExpense(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessExpenses) return denied("Realisasi Event");

  const category = str(args.category) as ExpenseCategory | undefined;
  if (!category || !EXPENSE_CATEGORIES.includes(category)) {
    return { success: false, error: `Kategori tidak valid. Pilihan: ${EXPENSE_CATEGORIES.join(", ")}.` };
  }
  const amount = num(args.amount);
  if (amount === undefined || amount <= 0) {
    return { success: false, error: "Jumlah pengeluaran harus lebih dari 0." };
  }

  const rawSourceType = str(args.sourceType) ?? "umum";
  const sourceType = (rawSourceType in EXPENSE_SOURCES ? rawSourceType : "umum") as ExpenseSourceType;
  let sourceId: string | null = null;
  let sourceLabel = "Umum (tanpa event/proyek)";
  let division: ExpenseDivision;

  if (sourceType === "umum") {
    const requested = str(args.division) as ExpenseDivision | undefined;
    division =
      requested && UMUM_DIVISIONS.includes(requested)
        ? requested
        : UMUM_DIVISIONS.includes(ctx.division as ExpenseDivision)
          ? (ctx.division as ExpenseDivision)
          : "finance";
  } else {
    const source = EXPENSE_SOURCES[sourceType];
    sourceId = str(args.sourceId) ?? null;
    if (!sourceId) return { success: false, error: "ID event/booking/proyek terkait belum diisi." };
    // Pastikan sumbernya ada & terlihat oleh user ini (RLS) sebelum dicatat.
    const { data: row } = await supabase
      .from(source.table)
      .select(`id, ${source.nameColumn}`)
      .eq("id", sourceId)
      .maybeSingle<Record<string, string>>();
    if (!row) return { success: false, error: "Event/booking/proyek terkait tidak ditemukan." };
    sourceLabel = row[source.nameColumn] ?? sourceLabel;
    division = source.division;
  }

  const result = await addEventExpense({
    expenseDate: isoDate(args.expenseDate) ?? todayJakarta(),
    division,
    sourceType,
    sourceId,
    category,
    amount,
    picName: str(args.picName) ?? ctx.userName,
    paymentMethod: str(args.paymentMethod) ?? "Cash",
    reimbursementStatus: REIMBURSEMENT_STATUSES.includes(args.reimbursementStatus as ReimbursementStatus)
      ? (args.reimbursementStatus as ReimbursementStatus)
      : "Dibayar Perusahaan",
    notes: str(args.notes),
  });
  if (!result.ok) return { success: false, error: result.error };

  return {
    success: true,
    data: {
      message: `Pengeluaran ${category} Rp ${Math.round(amount).toLocaleString("id-ID")} (${sourceLabel}) berhasil dicatat.`,
    },
  };
}

// ============================================================================
// KONFIRMASI
// ============================================================================

/**
 * Ringkasan yang ditampilkan sebelum user mengetik "Ya". Nama alat/booking/
 * sumber pengeluaran DIAMBIL DARI DATABASE berdasarkan ID yang benar-benar
 * akan dieksekusi -- bukan dari nama yang dikirim model (itemName/namaKlien/
 * sourceName), yang bisa saja tidak cocok dengan ID-nya (mis. model memilih
 * baris booking yang salah tapi menulis nama klien yang benar).
 */
async function buildConfirmationResponse(
  supabase: SupabaseClient,
  toolName: string,
  args: Args,
  ctx: UserContext
): Promise<ToolResult> {
  const rupiah = (v: unknown) => `Rp ${Math.round(num(v) ?? 0).toLocaleString("id-ID")}`;
  let description: string;

  if (toolName === "create_booking") {
    const itemId = str(args.itemId);
    const { data: item } = itemId
      ? await supabase.from("magnarent_inventory").select("name").eq("id", itemId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!item) return { success: false, error: "Alat tidak ditemukan. Cari dulu ID alat yang benar." };
    description = [
      "Buat booking:",
      `- Alat: ${item.name}`,
      `- Klien: ${args.namaKlien}`,
      `- Tanggal: ${args.tanggalMulai} s/d ${args.tanggalSelesai}`,
      `- Unit: ${args.jumlahUnit}`,
      `- Pembayaran: ${str(args.statusPembayaran) ?? "Belum Bayar"}${args.statusPembayaran === "DP" ? ` (${rupiah(args.jumlahDp)})` : ""}`,
    ].join("\n");
  } else if (toolName === "update_booking_status") {
    const check = await loadBookingForStatusChange(supabase, str(args.bookingId), str(args.status));
    if ("error" in check) return { success: false, error: check.error };
    const b = check.booking;
    description = [
      "Ubah status booking:",
      `- Klien: ${b.nama_klien}`,
      `- Alat: ${b.item?.name ?? "—"}`,
      `- Tanggal: ${b.tanggal_mulai} s/d ${b.tanggal_selesai}`,
      `- Status: ${b.status} → ${args.status}`,
    ].join("\n");
  } else if (toolName === "create_event_expense") {
    const sourceType = str(args.sourceType) ?? "umum";
    let sourceLabel = "Umum (tanpa event/proyek)";
    if (sourceType in EXPENSE_SOURCES) {
      const source = EXPENSE_SOURCES[sourceType as Exclude<ExpenseSourceType, "umum">];
      const sourceId = str(args.sourceId);
      const { data: row } = sourceId
        ? await supabase.from(source.table).select(source.nameColumn).eq("id", sourceId).maybeSingle<Record<string, string>>()
        : { data: null };
      if (!row) return { success: false, error: "Event/booking/proyek terkait tidak ditemukan." };
      sourceLabel = row[source.nameColumn] ?? sourceLabel;
    }
    description = [
      "Catat pengeluaran:",
      `- Terkait: ${sourceLabel}`,
      `- Tanggal: ${isoDate(args.expenseDate) ?? `${todayJakarta()} (hari ini)`}`,
      `- Kategori: ${args.category}`,
      `- Jumlah: ${rupiah(args.amount)}`,
      `- PIC: ${str(args.picName) ?? ctx.userName}`,
      `- Metode bayar: ${str(args.paymentMethod) ?? "Cash"}`,
      `- Dibayar oleh: ${str(args.reimbursementStatus) ?? "Dibayar Perusahaan"}`,
      `- Catatan: ${str(args.notes) ?? "-"}`,
    ].join("\n");
  } else {
    description = `Jalankan ${toolName}`;
  }

  return {
    success: true,
    requiresConfirmation: true,
    confirmationMessage: `${description}\n\nSudah benar? Ketik 'Ya' untuk lanjut, atau 'Batal' kalau tidak jadi.`,
    pendingAction: { tool: toolName, args, description },
  };
}
