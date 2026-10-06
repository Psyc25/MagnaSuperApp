/**
 * Tool laporan (read-only) Asisten AI: faktur, detail event, pengajuan modal,
 * purchase order, rekap pengeluaran, dan ringkasan harian. Dipisah dari
 * tool-handlers.ts supaya file itu tidak makin panjang; dispatch tetap lewat
 * executeToolCall di sana.
 *
 * Semua query memakai klien Supabase milik pengguna, jadi RLS tetap jadi
 * penjaga akhir. Pengecekan ctx.canAccess* di sini hanya supaya AI menolak
 * dengan sopan daripada menerima daftar kosong. Nama tabel/kolom mengikuti
 * skema migrasi (invoices, event_expenses, event_links, capital_requests,
 * production_purchase_orders, production_materials).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolResult, UserContext } from "./types";
import { todayISO } from "@/lib/shared/utils";
import { CHECKLIST_PHASE_LABELS, type ChecklistPhase } from "@/lib/events/types";

type Args = Record<string, unknown>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVOICE_STATUSES = ["Draft", "Terkirim", "Lunas"];
const CAPITAL_STATUSES = ["Menunggu", "Disetujui", "Ditolak"];
const PO_STATUSES = ["Dipesan", "Diterima", "Dibatalkan"];
const EXPENSE_DIVISIONS = ["magnarent", "magnative", "production", "finance", "event"];

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t ? t : undefined;
}

function isoDate(value: unknown): string | undefined {
  const s = str(value);
  return s && ISO_DATE.test(s) ? s : undefined;
}

function limitOf(args: Args): number {
  const n = typeof args.limit === "string" ? Number(args.limit) : args.limit;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 50) : 20;
}

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

/** Selisih hari kalender antara dua tanggal ISO (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

/* ------------------------------- Faktur ------------------------------- */

export async function handleGetInvoices(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessInvoices) return denied("Faktur");
  const today = todayISO();
  const overdueOnly = args.overdueOnly === true || args.overdueOnly === "true";

  let query = supabase
    .from("invoices")
    .select("id, invoice_number, division, client_name, event_name, total, status, issued_date, due_date")
    .order(overdueOnly ? "due_date" : "issued_date", { ascending: overdueOnly });

  const status = str(args.status);
  if (status && INVOICE_STATUSES.includes(status)) query = query.eq("status", status);
  if (overdueOnly) query = query.neq("status", "Lunas").lt("due_date", today);
  const division = str(args.division);
  if (division) query = query.eq("division", division);
  const client = str(args.clientName);
  if (client) query = query.ilike("client_name", likePattern(client));

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_invoices", error.message);

  const invoices = (data ?? []).map((inv) => ({
    ...inv,
    hari_terlambat:
      inv.status !== "Lunas" && inv.due_date && inv.due_date < today ? daysBetween(inv.due_date, today) : 0,
  }));
  const unpaid = invoices.filter((i) => i.status !== "Lunas");
  return {
    success: true,
    data: {
      invoices,
      count: invoices.length,
      total_belum_lunas: sum(unpaid.map((i) => i.total)),
      jumlah_terlambat: invoices.filter((i) => i.hari_terlambat > 0).length,
    },
  };
}

/* ----------------------------- Detail event ----------------------------- */

/** event_links memakai "production_booth_project"; faktur & pengeluaran
 * memakai "production_booth" untuk sumber yang sama. */
function normalizeSourceType(sourceType: string): string {
  return sourceType === "production_booth_project" ? "production_booth" : sourceType;
}

export async function handleGetEventDetail(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessEvents) return denied("Events");
  const today = todayISO();

  let eventQuery = supabase
    .from("events")
    .select("id, name, client_name, location, start_date, end_date, status, notes, event_type:event_types(name)")
    .order("start_date", { ascending: false })
    .limit(1);
  const eventId = str(args.eventId);
  const search = str(args.searchName);
  if (eventId && UUID.test(eventId)) eventQuery = eventQuery.eq("id", eventId);
  else if (search) eventQuery = eventQuery.ilike("name", likePattern(search));
  else return { success: false, error: "Sebutkan nama event atau ID event-nya." };

  const { data: events, error: eventError } = await eventQuery;
  if (eventError) return dbError("get_event_detail", eventError.message);
  const event = events?.[0];
  if (!event) return { success: true, data: { event: null, message: "Event tidak ditemukan." } };

  // Checklist per fase + item yang belum selesai.
  let checklist: Record<string, unknown> | null = null;
  if (ctx.canAccessChecklist) {
    const { data: items, error } = await supabase
      .from("event_checklist_items")
      .select("item_name, category, team, current_phase, due_date")
      .eq("event_id", event.id)
      .limit(1000);
    if (error) console.error("[ai] get_event_detail checklist gagal:", error.message);
    const rows = items ?? [];
    const perFase: Record<string, number> = {};
    for (const it of rows) {
      const label = CHECKLIST_PHASE_LABELS[it.current_phase as ChecklistPhase] ?? it.current_phase;
      perFase[label] = (perFase[label] ?? 0) + 1;
    }
    const pending = rows
      .filter((it) => it.current_phase !== "finish")
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    const finished = rows.length - pending.length;
    checklist = {
      total_item: rows.length,
      item_finish: finished,
      persen_finish: rows.length ? Math.round((finished / rows.length) * 100) : 0,
      per_fase: perFase,
      lewat_tenggat: pending.filter((it) => it.due_date && it.due_date < today).length,
      belum_selesai: pending.slice(0, 15).map((it) => ({
        item: it.item_name,
        kategori: it.category,
        tim: it.team,
        fase: CHECKLIST_PHASE_LABELS[it.current_phase as ChecklistPhase] ?? it.current_phase,
        tenggat: it.due_date,
        terlambat: Boolean(it.due_date && it.due_date < today),
      })),
    };
  }

  // Booking/proyek yang dikaitkan ke event (RLS event_links: 3 divisi + akses penuh).
  const { data: links } = await supabase.from("event_links").select("source_type, source_id").eq("event_id", event.id);
  const sources = (links ?? [])
    .filter((l) => UUID.test(String(l.source_id)))
    .map((l) => ({ type: normalizeSourceType(String(l.source_type)), id: String(l.source_id) }));

  const sourceFilter = (extra: string[] = []) => {
    const parts = [...extra];
    const byType = new Map<string, string[]>();
    for (const s of sources) byType.set(s.type, [...(byType.get(s.type) ?? []), s.id]);
    for (const [type, ids] of byType) parts.push(`and(source_type.eq.${type},source_id.in.(${ids.join(",")}))`);
    return parts.join(",");
  };

  let expenses: Record<string, unknown> | null = null;
  let expenseTotal = 0;
  if (ctx.canAccessExpenses) {
    const { data: rows, error } = await supabase
      .from("event_expenses")
      .select("category, amount, reimbursement_status")
      .or(sourceFilter([`and(source_type.eq.event_tracking,source_id.eq.${event.id})`]))
      .limit(2000);
    if (error) console.error("[ai] get_event_detail expenses gagal:", error.message);
    const perKategori: Record<string, number> = {};
    for (const r of rows ?? []) perKategori[r.category] = (perKategori[r.category] ?? 0) + (Number(r.amount) || 0);
    expenseTotal = sum((rows ?? []).map((r) => r.amount));
    expenses = {
      total: expenseTotal,
      per_kategori: perKategori,
      reimbursement_belum_diganti: sum((rows ?? []).filter((r) => r.reimbursement_status === "Belum Diganti").map((r) => r.amount)),
    };
  }

  let invoices: Record<string, unknown> | null = null;
  if (ctx.canAccessInvoices && sources.length > 0) {
    const { data: rows, error } = await supabase
      .from("invoices")
      .select("invoice_number, total, status, due_date")
      .or(sourceFilter())
      .limit(200);
    if (error) console.error("[ai] get_event_detail invoices gagal:", error.message);
    const total = sum((rows ?? []).map((r) => r.total));
    invoices = {
      daftar: rows ?? [],
      total_tagihan: total,
      sudah_lunas: sum((rows ?? []).filter((r) => r.status === "Lunas").map((r) => r.total)),
      perkiraan_laba: expenses ? total - expenseTotal : null,
    };
  }

  return {
    success: true,
    data: {
      event,
      checklist,
      sumber_terkait: sources.length,
      pengeluaran: expenses,
      faktur: invoices,
      catatan: invoices
        ? undefined
        : "Faktur/perkiraan laba hanya tampil untuk akses penuh, finance, atau investor, dan bila event dikaitkan ke booking/proyek.",
    },
  };
}

/* --------------------------- Pengajuan modal --------------------------- */

export async function handleGetCapitalRequests(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessCapital) return denied("Pengajuan Modal");
  let query = supabase
    .from("capital_requests")
    .select("id, event_name, location, event_date, billing_estimate, modal_estimate, status, investor_note, decided_at, created_at")
    .order("created_at", { ascending: false });
  const status = str(args.status);
  if (status && CAPITAL_STATUSES.includes(status)) query = query.eq("status", status);
  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_capital_requests", error.message);
  const rows = (data ?? []).map((r) => ({
    ...r,
    perkiraan_margin: (Number(r.billing_estimate) || 0) - (Number(r.modal_estimate) || 0),
  }));
  return {
    success: true,
    data: {
      requests: rows,
      count: rows.length,
      total_modal_menunggu: sum(rows.filter((r) => r.status === "Menunggu").map((r) => r.modal_estimate)),
    },
  };
}

/* ---------------------------- Purchase order ---------------------------- */

export async function handleGetPurchaseOrders(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessPurchaseOrders) return denied("Purchase Order");
  let query = supabase
    .from("production_purchase_orders")
    .select("id, supplier_name, qty, unit_price, status, order_date, expected_date, received_date, material:production_materials(name, unit)")
    .order("order_date", { ascending: false });
  const status = str(args.status);
  if (status && PO_STATUSES.includes(status)) query = query.eq("status", status);
  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_purchase_orders", error.message);
  const rows = (data ?? []).map((r) => ({ ...r, total: (Number(r.qty) || 0) * (Number(r.unit_price) || 0) }));
  return { success: true, data: { purchase_orders: rows, count: rows.length } };
}

/* ------------------------------ Pengeluaran ------------------------------ */

export async function handleGetExpenses(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessExpenses) return denied("Realisasi Event");
  const today = todayISO();
  const dateFrom = isoDate(args.dateFrom) ?? `${today.slice(0, 8)}01`;
  const dateTo = isoDate(args.dateTo) ?? today;

  let query = supabase
    .from("event_expenses")
    .select("expense_date, division, category, amount, pic_name, reimbursement_status, notes")
    .gte("expense_date", dateFrom)
    .lte("expense_date", dateTo)
    .order("expense_date", { ascending: false });
  const division = str(args.division);
  if (division && EXPENSE_DIVISIONS.includes(division)) query = query.eq("division", division);

  const { data, error } = await query.limit(2000);
  if (error) return dbError("get_expenses", error.message);
  const rows = data ?? [];
  const perKategori: Record<string, number> = {};
  const perDivisi: Record<string, number> = {};
  for (const r of rows) {
    const amount = Number(r.amount) || 0;
    perKategori[r.category] = (perKategori[r.category] ?? 0) + amount;
    perDivisi[r.division] = (perDivisi[r.division] ?? 0) + amount;
  }
  const belumDiganti = rows.filter((r) => r.reimbursement_status === "Belum Diganti");
  return {
    success: true,
    data: {
      periode: { dari: dateFrom, sampai: dateTo },
      jumlah_transaksi: rows.length,
      total: sum(rows.map((r) => r.amount)),
      per_kategori: perKategori,
      per_divisi: perDivisi,
      reimbursement_belum_diganti: {
        total: sum(belumDiganti.map((r) => r.amount)),
        daftar: belumDiganti.slice(0, 20).map((r) => ({ tanggal: r.expense_date, pic: r.pic_name, jumlah: r.amount, catatan: r.notes })),
      },
      terpotong: rows.length >= 2000,
    },
  };
}

/* ---------------------------- Ringkasan harian ---------------------------- */

export async function handleGetDailySummary(supabase: SupabaseClient, ctx: UserContext): Promise<ToolResult> {
  const today = todayISO();
  const summary: Record<string, unknown> = { tanggal: today };
  const errors: string[] = [];
  const tasks: Array<Promise<void>> = [];

  if (ctx.canAccessMagnarent) {
    tasks.push(
      (async () => {
        const { data, error } = await supabase
          .from("magnarent_bookings")
          .select("nama_klien, jumlah_unit, tanggal_mulai, tanggal_selesai, status, item:magnarent_inventory(name)")
          .neq("status", "Dibatalkan")
          .or(`tanggal_mulai.eq.${today},tanggal_selesai.eq.${today}`)
          .limit(100);
        if (error) return void errors.push(`booking: ${error.message}`);
        const rows = data ?? [];
        summary.booking_keluar_hari_ini = rows.filter((b) => b.tanggal_mulai === today);
        summary.booking_kembali_hari_ini = rows.filter((b) => b.tanggal_selesai === today);
      })()
    );
  }

  if (ctx.canAccessEvents) {
    tasks.push(
      (async () => {
        const { data, error } = await supabase
          .from("events")
          .select("id, name, client_name, location, start_date, end_date")
          .lte("start_date", today)
          .or(`end_date.gte.${today},and(end_date.is.null,start_date.eq.${today})`)
          .limit(50);
        if (error) return void errors.push(`event: ${error.message}`);
        summary.event_berjalan = data ?? [];
      })()
    );
  }

  if (ctx.canAccessInvoices) {
    tasks.push(
      (async () => {
        const { data, error } = await supabase
          .from("invoices")
          .select("invoice_number, client_name, total, due_date")
          .neq("status", "Lunas")
          .lte("due_date", today)
          .order("due_date", { ascending: true })
          .limit(200);
        if (error) return void errors.push(`faktur: ${error.message}`);
        const rows = data ?? [];
        const overdue = rows.filter((r) => r.due_date < today);
        summary.faktur_jatuh_tempo_hari_ini = rows.filter((r) => r.due_date === today);
        summary.faktur_terlambat = { jumlah: overdue.length, total: sum(overdue.map((r) => r.total)), terlama: overdue.slice(0, 5) };
      })()
    );
  }

  if (ctx.canAccessProduction) {
    tasks.push(
      (async () => {
        // PostgREST tidak bisa membandingkan dua kolom, jadi stok vs minimum
        // dihitung di sini.
        const { data, error } = await supabase.from("production_materials").select("name, unit, stock, min_stock").limit(1000);
        if (error) return void errors.push(`material: ${error.message}`);
        summary.material_di_bawah_minimum = (data ?? [])
          .filter((m) => Number(m.min_stock) > 0 && Number(m.stock) < Number(m.min_stock))
          .slice(0, 20);
      })()
    );
  }

  if (ctx.canAccessPurchaseOrders) {
    tasks.push(
      (async () => {
        const { data, error } = await supabase
          .from("production_purchase_orders")
          .select("supplier_name, qty, expected_date, material:production_materials(name, unit)")
          .eq("status", "Dipesan")
          .lte("expected_date", today)
          .limit(50);
        if (error) return void errors.push(`PO: ${error.message}`);
        summary.po_dijadwalkan_datang = data ?? [];
      })()
    );
  }

  if (ctx.canAccessCapital) {
    tasks.push(
      (async () => {
        const { data, error } = await supabase
          .from("capital_requests")
          .select("event_name, modal_estimate, event_date")
          .eq("status", "Menunggu")
          .limit(50);
        if (error) return void errors.push(`modal: ${error.message}`);
        summary.pengajuan_modal_menunggu = data ?? [];
      })()
    );
  }

  await Promise.all(tasks);
  if (errors.length) console.error("[ai] get_daily_summary sebagian gagal:", errors.join(" | "));
  if (errors.length) summary.sebagian_gagal = true;
  return { success: true, data: summary };
}
