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
import { addBooking, updateBooking, updateBookingStatus, addInventoryItem, updateInventoryItem } from "@/lib/magnarent/actions";
import { getAvailableUnitsInRange } from "@/lib/magnarent/availability";
import { rowToBooking, rowToInventory, type BookingRow, type InventoryRow } from "@/lib/magnarent/mappers";
import type { BookingStatus, PaymentStatus, InventoryItem, InventoryUnitStatus } from "@/lib/magnarent/types";
import { BOOKING_TRANSITIONS } from "@/lib/magnarent/booking-status";
import {
  addMaintenanceLog,
  saveDelivery,
  getWarehouses,
  getAllSubrentRecords,
  getSubrentRecords,
  addSubrentRecord,
  getInventoryUnits,
  getWarehouseTransfers,
  transferUnitToWarehouse,
  getBookingDeposit,
  saveBookingDeposit,
  setDepositReturned,
  listSeasonalPricingRules,
  addSeasonalPricingRule,
  getCrewAssignments,
  addCrewAssignment,
  findCrewConflicts,
  addWarehouse,
  updateWarehouse,
  updateSubrentStatus,
  bulkScanUpdateStatus,
} from "@/lib/magnarent/extras-actions";
import {
  MAINTENANCE_JENIS,
  DELIVERY_STATUS,
  SUBRENT_STATUS,
  type MaintenanceJenis,
  type DeliveryStage,
  type DeliveryStatus,
  type DepositJenis,
  type CrewRole as MagnarentCrewRole,
  type SubrentStatus,
} from "@/lib/magnarent/extras-types";
import {
  addProjectTask,
  updateProjectTaskStatus,
  updateProjectTask,
  addClient,
  updateClient,
  addVendor as addMagnativeVendorAction,
  updateVendor as updateMagnativeVendorAction,
  createCheckinLink,
  listCheckinLinks,
  addProject as addMagnativeProject,
  updateProject as updateMagnativeProject,
  addProjectCost,
  updateProjectCost,
  addContentPost,
  updateContentPost,
  updateContentStatus,
  addContentRequest,
  updateContentRequestStatus,
  addProjectVendor,
  updateProjectVendor,
  updateProjectPipelineStage,
  addAssetComment,
  setAssetCommentResolved,
  getAssetComments,
  getCheckinStats,
  updatePortfolioFolder,
} from "@/lib/magnative/actions";
import type {
  ProjectTaskStatus,
  Client,
  ClientStatus,
  VendorCategory as MagnativeVendorCategory,
  ProjectType,
  ProjectStatus,
  PaymentStatus as MagnativePaymentStatus,
  Platform,
  ContentStatus,
  ContentRequestPriority,
  ContentRequestStatus,
  PipelineStage,
} from "@/lib/magnative/types";
import { PIPELINE_STAGES } from "@/lib/magnative/types";
import { getPortfolioFolders } from "@/lib/magnative/portfolio-data";
import {
  getEquipment,
  getProjectCrew,
  getVendors as getProductionVendorsAction,
  addVendor as addProductionVendorAction,
  updateVendor as updateProductionVendorAction,
  getNcReports,
  addNcReport,
  updateNcReportProgress,
  getSubcontractOrders,
  addSubcontractOrder,
  updateSubcontractStatus,
  getBomTemplates,
  createBomTemplate,
  getCrewTimelogs,
  addCrewTimelog,
  addEquipment,
  updateEquipment,
  getEquipmentUsage,
  addEquipmentUsage,
  markEquipmentUsageReturned,
  getCrewPiecePayments,
  addCrewPiecePayment,
  updateCrewPiecePaymentStatus,
  addProjectCrew,
  updateBomTemplate,
  transferMaterialStock,
  getMaterialTransfers,
  getProjectDocuments,
} from "@/lib/production/extras-actions";
import type {
  VendorCategory as ProductionVendorCategory,
  NcCategory,
  NcSeverity,
  NcStatus,
  SubcontractStatus,
  SubcontractMaterialItem,
  BomTemplateItem,
  EquipmentCategory,
  EquipmentCondition,
  PiecePaymentStatus,
  CrewRole as ProductionCrewRole,
} from "@/lib/production/extras-types";
import {
  receivePurchaseOrder,
  cancelPurchaseOrder,
  updateProjectStatus,
  addMaterial,
  updateMaterial,
  addPurchaseOrder,
  addProject as addProductionProject,
  updateProject as updateProductionProject,
} from "@/lib/production/actions";
import type {
  BoothStatus,
  MaterialItem,
  MaterialCategory,
  MaterialUnit,
  PaymentStatus as ProductionPaymentStatus,
} from "@/lib/production/types";
import { rowToBoothProject, type BoothProjectRow } from "@/lib/production/mappers";
import { getChartOfAccounts, getManualJournalEntries } from "@/lib/accounting/data";
import { createManualJournalEntry, createAccount, setAccountActive } from "@/lib/accounting/actions";
import type { AccountType, NormalBalance, ManualJournalDivision } from "@/lib/accounting/types";
import { createPortalLink, revokePortalLink, listPortalLinks, listSignatures } from "@/lib/portal/actions";
import type { PortalModule } from "@/lib/portal/types";
import {
  listMyNotifications,
  markNotificationRead,
  listUnreadImportantNotifications,
  markAllNotificationsRead,
} from "@/lib/notifications/actions";
import { sendChatMessage, getChatMessages } from "@/lib/chat/actions";
import { isRoomAllowed, type ChatRoom } from "@/lib/chat/rooms";
import { broadcastNotification } from "@/lib/push/actions";
import { updateNickname } from "@/lib/settings/actions";
import type { Division } from "@/lib/supabase/types";
import { addCapitalRequest, decideCapitalRequest } from "@/lib/capital-requests/actions";
import type { CapitalRequestStatus } from "@/lib/capital-requests/types";
import {
  markInvoiceStatus,
  createInvoice,
  updateInvoice,
  sendInvoiceWhatsApp,
  type InvoiceItemInput,
} from "@/lib/invoices/actions";
import type { Invoice, InvoiceDivision, InvoiceStatus } from "@/lib/invoices/types";
import { rowToInvoice, type InvoiceRow } from "@/lib/invoices/mappers";
import { addProduct, updateProduct } from "@/lib/products/actions";
import type { ProductDivision } from "@/lib/products/types";
import { addEventExpense, updateEventExpense } from "@/lib/event-expenses/actions";
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
      case "get_maintenance_logs":
        return await handleGetMaintenanceLogs(supabase, ctx, args);
      case "get_deliveries":
        return await handleGetDeliveries(supabase, ctx, args);
      case "get_project_tasks":
        return await handleGetProjectTasks(supabase, ctx, args);
      case "get_content_posts":
        return await handleGetContentPosts(supabase, ctx, args);
      case "get_equipment":
        return await handleGetEquipment(ctx, args);
      case "get_project_crew":
        return await handleGetProjectCrew(supabase, ctx, args);
      case "get_chart_of_accounts":
        return await handleGetChartOfAccounts(ctx, args);
      case "get_journal_entries":
        return await handleGetJournalEntries(ctx, args);
      case "get_warehouses":
        return await handleGetWarehouses(ctx);
      case "get_subrent_records":
        return await handleGetSubrentRecords(ctx, args);
      case "get_checkin_links":
        return await handleGetCheckinLinks(supabase, ctx, args);
      case "get_production_vendors":
        return await handleGetProductionVendors(ctx, args);
      case "get_nc_reports":
        return await handleGetNcReports(ctx, args);
      case "get_subcontract_orders":
        return await handleGetSubcontractOrders(supabase, ctx, args);
      case "get_bom_templates":
        return await handleGetBomTemplates(ctx);
      case "get_crew_timelogs":
        return await handleGetCrewTimelogs(ctx, args);
      case "get_inventory_units":
        return await handleGetInventoryUnits(supabase, ctx, args);
      case "get_warehouse_transfers":
        return await handleGetWarehouseTransfers(ctx, args);
      case "get_booking_deposit":
        return await handleGetBookingDeposit(ctx, args);
      case "get_seasonal_pricing_rules":
        return await handleGetSeasonalPricingRules(ctx, args);
      case "get_crew_assignments":
        return await handleGetCrewAssignments(ctx, args);
      case "get_equipment_usage":
        return await handleGetEquipmentUsage(supabase, ctx, args);
      case "get_crew_piece_payments":
        return await handleGetCrewPiecePayments(ctx, args);
      case "get_portfolio_folders":
        return await handleGetPortfolioFolders(ctx);
      case "get_asset_comments":
        return await handleGetAssetComments(supabase, ctx, args);
      case "get_content_requests":
        return await handleGetContentRequests(supabase, ctx, args);
      case "get_project_vendors":
        return await handleGetProjectVendors(supabase, ctx, args);

      // Action tools (sudah dikonfirmasi)
      case "create_booking":
        return await handleCreateBooking(ctx, args);
      case "update_booking_status":
        return await handleUpdateBookingStatus(supabase, ctx, args);
      case "create_event_expense":
        return await handleCreateEventExpense(supabase, ctx, args);
      case "add_maintenance_log":
        return await handleAddMaintenanceLog(ctx, args);
      case "schedule_delivery":
        return await handleScheduleDelivery(ctx, args);
      case "add_project_task":
        return await handleAddProjectTask(ctx, args);
      case "update_project_task_status":
        return await handleUpdateProjectTaskStatus(supabase, ctx, args);
      case "receive_purchase_order":
        return await handleReceivePurchaseOrder(supabase, ctx, args);
      case "update_production_status":
        return await handleUpdateProductionStatus(supabase, ctx, args);
      case "create_capital_request":
        return await handleCreateCapitalRequest(ctx, args);
      case "add_inventory_item":
        return await handleAddInventoryItem(ctx, args);
      case "update_inventory_item":
        return await handleUpdateInventoryItem(supabase, ctx, args);
      case "add_client":
        return await handleAddClient(ctx, args);
      case "update_client":
        return await handleUpdateClient(supabase, ctx, args);
      case "add_material":
        return await handleAddMaterial(ctx, args);
      case "update_material":
        return await handleUpdateMaterial(supabase, ctx, args);
      case "add_purchase_order":
        return await handleAddPurchaseOrder(ctx, args);
      case "mark_invoice_status":
        return await handleMarkInvoiceStatus(supabase, ctx, args);
      case "add_subrent_record":
        return await handleAddSubrentRecord(ctx, args);
      case "create_checkin_link":
        return await handleCreateCheckinLink(supabase, ctx, args);
      case "add_magnative_vendor":
        return await handleAddMagnativeVendor(ctx, args);
      case "update_magnative_vendor":
        return await handleUpdateMagnativeVendor(supabase, ctx, args);
      case "add_production_vendor":
        return await handleAddProductionVendor(ctx, args);
      case "update_production_vendor":
        return await handleUpdateProductionVendor(supabase, ctx, args);
      case "add_nc_report":
        return await handleAddNcReport(ctx, args);
      case "update_nc_report_progress":
        return await handleUpdateNcReportProgress(ctx, args);
      case "add_subcontract_order":
        return await handleAddSubcontractOrder(supabase, ctx, args);
      case "update_subcontract_status":
        return await handleUpdateSubcontractStatus(ctx, args);
      case "add_bom_template":
        return await handleAddBomTemplate(ctx, args);
      case "add_crew_timelog":
        return await handleAddCrewTimelog(ctx, args);
      case "transfer_unit_to_warehouse":
        return await handleTransferUnitToWarehouse(ctx, args);
      case "save_booking_deposit":
        return await handleSaveBookingDeposit(ctx, args);
      case "set_deposit_returned":
        return await handleSetDepositReturned(ctx, args);
      case "add_seasonal_pricing_rule":
        return await handleAddSeasonalPricingRule(ctx, args);
      case "add_crew_assignment":
        return await handleAddCrewAssignment(ctx, args);
      case "add_equipment":
        return await handleAddEquipment(ctx, args);
      case "update_equipment":
        return await handleUpdateEquipment(supabase, ctx, args);
      case "add_equipment_usage":
        return await handleAddEquipmentUsage(supabase, ctx, args);
      case "mark_equipment_usage_returned":
        return await handleMarkEquipmentUsageReturned(ctx, args);
      case "add_crew_piece_payment":
        return await handleAddCrewPiecePayment(ctx, args);
      case "update_crew_piece_payment_status":
        return await handleUpdateCrewPiecePaymentStatus(ctx, args);
      case "add_project_crew":
        return await handleAddProjectCrew(supabase, ctx, args);
      case "add_magnative_project":
        return await handleAddMagnativeProject(supabase, ctx, args);
      case "update_magnative_project":
        return await handleUpdateMagnativeProject(supabase, ctx, args);
      case "add_project_cost":
        return await handleAddProjectCost(supabase, ctx, args);
      case "update_project_cost":
        return await handleUpdateProjectCost(supabase, ctx, args);
      case "add_content_post":
        return await handleAddContentPost(supabase, ctx, args);
      case "update_content_post":
        return await handleUpdateContentPost(supabase, ctx, args);
      case "update_content_status":
        return await handleUpdateContentStatus(supabase, ctx, args);
      case "add_content_request":
        return await handleAddContentRequest(supabase, ctx, args);
      case "update_content_request_status":
        return await handleUpdateContentRequestStatus(supabase, ctx, args);
      case "add_project_vendor":
        return await handleAddProjectVendor(supabase, ctx, args);
      case "update_project_vendor":
        return await handleUpdateProjectVendor(supabase, ctx, args);
      case "update_project_task":
        return await handleUpdateProjectTask(supabase, ctx, args);
      case "update_project_pipeline_stage":
        return await handleUpdateProjectPipelineStage(supabase, ctx, args);
      case "add_asset_comment":
        return await handleAddAssetComment(supabase, ctx, args);
      case "set_asset_comment_resolved":
        return await handleSetAssetCommentResolved(ctx, args);
      case "cancel_purchase_order":
        return await handleCancelPurchaseOrder(supabase, ctx, args);
      case "decide_capital_request":
        return await handleDecideCapitalRequest(supabase, ctx, args);
      case "update_event_expense":
        return await handleUpdateEventExpense(supabase, ctx, args);
      case "get_products":
        return await handleGetProducts(supabase, args);
      case "get_my_notifications":
        return await handleGetMyNotifications();
      case "check_crew_conflicts":
        return await handleCheckCrewConflicts(ctx, args);
      case "get_material_transfers":
        return await handleGetMaterialTransfers(supabase, ctx, args);
      case "get_project_documents":
        return await handleGetProjectDocuments(supabase, ctx, args);
      case "get_portal_links":
        return await handleGetPortalLinks(ctx, args);
      case "add_invoice":
        return await handleAddInvoice(ctx, args);
      case "update_invoice":
        return await handleUpdateInvoice(supabase, ctx, args);
      case "send_invoice_whatsapp":
        return await handleSendInvoiceWhatsapp(ctx, args);
      case "add_product":
        return await handleAddProduct(ctx, args);
      case "update_product":
        return await handleUpdateProduct(supabase, ctx, args);
      case "add_warehouse":
        return await handleAddWarehouse(ctx, args);
      case "update_warehouse":
        return await handleUpdateWarehouse(supabase, ctx, args);
      case "update_subrent_status":
        return await handleUpdateSubrentStatus(supabase, ctx, args);
      case "bulk_scan_update_unit_status":
        return await handleBulkScanUpdateUnitStatus(ctx, args);
      case "update_bom_template":
        return await handleUpdateBomTemplate(supabase, ctx, args);
      case "transfer_material_stock":
        return await handleTransferMaterialStock(supabase, ctx, args);
      case "add_journal_entry":
        return await handleAddJournalEntry(ctx, args);
      case "add_account":
        return await handleAddAccount(ctx, args);
      case "set_account_active":
        return await handleSetAccountActive(ctx, args);
      case "create_portal_link":
        return await handleCreatePortalLink(ctx, args);
      case "revoke_portal_link":
        return await handleRevokePortalLink(ctx, args);
      case "mark_notification_read":
        return await handleMarkNotificationRead(args);
      case "get_checkin_stats":
        return await handleGetCheckinStats(supabase, ctx, args);
      case "get_portal_signatures":
        return await handleGetPortalSignatures(ctx, args);
      case "get_chat_messages":
        return await handleGetChatMessages(ctx, args);
      case "get_unread_important_notifications":
        return await handleGetUnreadImportantNotifications();
      case "update_booking":
        return await handleUpdateBooking(supabase, ctx, args);
      case "add_production_project":
        return await handleAddProductionProject(ctx, args);
      case "update_production_project":
        return await handleUpdateProductionProject(supabase, ctx, args);
      case "update_portfolio_folder":
        return await handleUpdatePortfolioFolder(supabase, ctx, args);
      case "send_chat_message":
        return await handleSendChatMessage(ctx, args);
      case "mark_all_notifications_read":
        return await handleMarkAllNotificationsRead();
      case "broadcast_notification":
        return await handleBroadcastNotification(ctx, args);
      case "update_my_nickname":
        return await handleUpdateMyNickname(args);

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

async function handleGetMaintenanceLogs(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const itemId = str(args.itemId);
  const itemName = str(args.itemName);
  const itemEmbed = itemName ? "item:magnarent_inventory!inner(id, name)" : "item:magnarent_inventory(id, name)";
  let query = supabase
    .from("magnarent_maintenance_logs")
    .select(`id, tanggal, jenis, keterangan, biaya, ${itemEmbed}`)
    .order("tanggal", { ascending: false });
  if (itemId) query = query.eq("item_id", itemId);
  if (itemName) query = query.ilike("item.name", likePattern(itemName));

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_maintenance_logs", error.message);
  return { success: true, data: { logs: data ?? [], count: (data ?? []).length } };
}

async function handleGetDeliveries(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const status = str(args.status);
  const clientName = str(args.clientName);
  const bookingEmbed = clientName
    ? "booking:magnarent_bookings!inner(id, nama_klien, tanggal_mulai, tanggal_selesai)"
    : "booking:magnarent_bookings(id, nama_klien, tanggal_mulai, tanggal_selesai)";
  let query = supabase
    .from("magnarent_deliveries")
    .select(`id, booking_id, stage, driver_name, jadwal_tanggal, jadwal_jam, status, catatan, ${bookingEmbed}`)
    .order("jadwal_tanggal", { ascending: true, nullsFirst: false });
  if (status) query = query.eq("status", status);
  if (clientName) query = query.ilike("booking.nama_klien", likePattern(clientName));

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_deliveries", error.message);
  return { success: true, data: { deliveries: data ?? [], count: (data ?? []).length } };
}

async function handleGetProjectTasks(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const projectId = str(args.projectId);
  const projectName = str(args.projectName);
  const status = str(args.status);
  const projectEmbed = projectName ? "project:magnative_projects!inner(id, name)" : "project:magnative_projects(id, name)";
  let query = supabase
    .from("magnative_project_tasks")
    .select(`id, title, detail, status, due_date, pic, vendor_id, biaya_estimasi, ${projectEmbed}`)
    .order("sort_order", { ascending: true });
  if (projectId) query = query.eq("project_id", projectId);
  if (projectName) query = query.ilike("project.name", likePattern(projectName));
  if (status) query = query.eq("status", status);

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_project_tasks", error.message);
  return { success: true, data: { tasks: data ?? [], count: (data ?? []).length } };
}

async function handleGetContentPosts(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const status = str(args.status);
  const clientName = str(args.clientName);
  const clientEmbed = clientName ? "client:magnative_clients!inner(id, name)" : "client:magnative_clients(id, name)";
  let query = supabase
    .from("magnative_content_posts")
    .select(`id, title, platform, tanggal_posting, status, catatan, feedback_revisi, ${clientEmbed}`)
    .order("tanggal_posting", { ascending: false });
  if (status) query = query.eq("status", status);
  if (clientName) query = query.ilike("client.name", likePattern(clientName));

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_content_posts", error.message);
  return { success: true, data: { posts: data ?? [], count: (data ?? []).length } };
}

async function handleGetEquipment(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  let equipment = await getEquipment();
  const category = str(args.category);
  if (category) equipment = equipment.filter((e) => e.kategori === category);
  const condition = str(args.condition);
  if (condition) equipment = equipment.filter((e) => e.kondisi === condition);
  const search = str(args.searchName)?.toLowerCase();
  if (search) equipment = equipment.filter((e) => e.name.toLowerCase().includes(search));

  const limited = equipment.slice(0, limitOf(args));
  return { success: true, data: { equipment: limited, count: limited.length } };
}

async function handleGetProjectCrew(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  let projectId = str(args.projectId);
  const projectName = str(args.projectName);
  if (!projectId && projectName) {
    const { data } = await supabase
      .from("production_booth_projects")
      .select("id, name")
      .ilike("name", likePattern(projectName))
      .limit(5);
    if (!data || data.length === 0) return { success: false, error: "Proyek tidak ditemukan." };
    if (data.length > 1) {
      return {
        success: true,
        data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: data },
      };
    }
    projectId = data[0].id;
  }
  if (!projectId) return { success: false, error: "ID atau nama proyek harus diisi." };

  const crew = await getProjectCrew(projectId);
  return { success: true, data: { crew, count: crew.length } };
}

async function handleGetChartOfAccounts(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessAccounting) return denied("Akuntansi");

  const accounts = await getChartOfAccounts();
  const result = args.activeOnly === true ? accounts.filter((a) => a.isActive) : accounts;
  return { success: true, data: { accounts: result, count: result.length } };
}

async function handleGetJournalEntries(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessAccounting) return denied("Akuntansi");

  const limit = num(args.limit);
  const entries = await getManualJournalEntries(limit && limit > 0 ? Math.min(Math.floor(limit), 100) : 20);
  return { success: true, data: { entries, count: entries.length } };
}

async function handleGetWarehouses(ctx: UserContext): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const warehouses = await getWarehouses();
  return { success: true, data: { warehouses, count: warehouses.length } };
}

async function handleGetSubrentRecords(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const bookingId = str(args.bookingId);
  const records = bookingId ? await getSubrentRecords(bookingId) : await getAllSubrentRecords();
  return { success: true, data: { records, count: records.length } };
}

async function handleGetCheckinLinks(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  let projectId = str(args.projectId);
  const projectName = str(args.projectName);
  if (!projectId && projectName) {
    const { data } = await supabase
      .from("magnative_projects")
      .select("id, name")
      .ilike("name", likePattern(projectName))
      .limit(5);
    if (!data || data.length === 0) return { success: false, error: "Proyek tidak ditemukan." };
    if (data.length > 1) {
      return {
        success: true,
        data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: data },
      };
    }
    projectId = data[0].id;
  }
  if (!projectId) return { success: false, error: "ID atau nama proyek harus diisi." };

  const links = await listCheckinLinks(projectId);
  return { success: true, data: { links, count: links.length } };
}

async function handleGetProductionVendors(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  let vendors = await getProductionVendorsAction();
  const category = str(args.category);
  if (category) vendors = vendors.filter((v) => v.category === category);
  return { success: true, data: { vendors, count: vendors.length } };
}

async function handleGetNcReports(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  let reports = await getNcReports();
  const status = str(args.status);
  if (status) reports = reports.filter((r) => r.status === status);
  const severity = str(args.severity);
  if (severity) reports = reports.filter((r) => r.severity === severity);
  const limited = reports.slice(0, limitOf(args));
  return { success: true, data: { reports: limited, count: limited.length } };
}

async function handleGetSubcontractOrders(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  let projectId = str(args.projectId);
  const projectName = str(args.projectName);
  if (!projectId && projectName) {
    const { data } = await supabase
      .from("production_booth_projects")
      .select("id, name")
      .ilike("name", likePattern(projectName))
      .limit(5);
    if (!data || data.length === 0) return { success: false, error: "Proyek tidak ditemukan." };
    if (data.length > 1) {
      return {
        success: true,
        data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: data },
      };
    }
    projectId = data[0].id;
  }
  if (!projectId) return { success: false, error: "ID atau nama proyek harus diisi." };

  const orders = await getSubcontractOrders(projectId);
  return { success: true, data: { orders, count: orders.length } };
}

async function handleGetBomTemplates(ctx: UserContext): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const templates = await getBomTemplates();
  return { success: true, data: { templates, count: templates.length } };
}

async function handleGetCrewTimelogs(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const projectCrewId = str(args.projectCrewId);
  if (!projectCrewId) return { success: false, error: "ID penugasan kru harus diisi." };

  const logs = await getCrewTimelogs(projectCrewId);
  return { success: true, data: { logs, count: logs.length } };
}

/** Resolve itemId Magnarent langsung atau lewat nama (mirip resolveProductionProjectId). */
async function resolveMagnarentItemId(
  supabase: SupabaseClient,
  args: Args
): Promise<{ itemId: string } | { error: string } | { candidates: unknown[] }> {
  let itemId = str(args.itemId);
  const itemName = str(args.itemName);
  if (!itemId && itemName) {
    const { data } = await supabase
      .from("magnarent_inventory")
      .select("id, name, category")
      .ilike("name", likePattern(itemName))
      .limit(5);
    if (!data || data.length === 0) return { error: "Alat tidak ditemukan." };
    if (data.length > 1) return { candidates: data };
    itemId = data[0].id;
  }
  if (!itemId) return { error: "ID atau nama alat harus diisi." };
  return { itemId };
}

async function handleGetInventoryUnits(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const resolved = await resolveMagnarentItemId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return { success: true, data: { message: "Ada beberapa alat yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
  }

  const units = await getInventoryUnits(resolved.itemId);
  return { success: true, data: { units, count: units.length } };
}

async function handleGetWarehouseTransfers(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const unitId = str(args.unitId);
  if (!unitId) return { success: false, error: "ID unit fisik harus diisi." };

  const transfers = await getWarehouseTransfers(unitId);
  return { success: true, data: { transfers, count: transfers.length } };
}

async function handleGetBookingDeposit(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const bookingId = str(args.bookingId);
  if (!bookingId) return { success: false, error: "ID booking harus diisi." };

  const deposit = await getBookingDeposit(bookingId);
  return { success: true, data: { deposit } };
}

async function handleGetSeasonalPricingRules(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  let rules = await listSeasonalPricingRules();
  const itemId = str(args.itemId);
  if (itemId) rules = rules.filter((r) => r.itemId === itemId);
  return { success: true, data: { rules, count: rules.length } };
}

async function handleGetCrewAssignments(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const bookingId = str(args.bookingId);
  if (!bookingId) return { success: false, error: "ID booking harus diisi." };

  const assignments = await getCrewAssignments(bookingId);
  return { success: true, data: { assignments, count: assignments.length } };
}

/** Resolve equipmentId Production langsung atau lewat nama. */
async function resolveProductionEquipmentId(
  supabase: SupabaseClient,
  args: Args
): Promise<{ equipmentId: string } | { error: string } | { candidates: unknown[] }> {
  let equipmentId = str(args.equipmentId);
  const equipmentName = str(args.equipmentName);
  if (!equipmentId && equipmentName) {
    const { data } = await supabase
      .from("production_equipment")
      .select("id, name, kategori")
      .ilike("name", likePattern(equipmentName))
      .limit(5);
    if (!data || data.length === 0) return { error: "Alat tidak ditemukan." };
    if (data.length > 1) return { candidates: data };
    equipmentId = data[0].id;
  }
  if (!equipmentId) return { error: "ID atau nama alat harus diisi." };
  return { equipmentId };
}

async function handleGetEquipmentUsage(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const resolved = await resolveProductionEquipmentId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return { success: true, data: { message: "Ada beberapa alat yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
  }

  const usage = await getEquipmentUsage(resolved.equipmentId);
  return { success: true, data: { usage, count: usage.length } };
}

async function handleGetCrewPiecePayments(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const projectCrewId = str(args.projectCrewId);
  if (!projectCrewId) return { success: false, error: "ID penugasan kru harus diisi." };

  const payments = await getCrewPiecePayments(projectCrewId);
  return { success: true, data: { payments, count: payments.length } };
}

async function handleGetPortfolioFolders(ctx: UserContext): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const folders = await getPortfolioFolders();
  const summary = folders.map((f) => ({
    id: f.id,
    title: f.title,
    caption: f.caption ?? null,
    photoCount: f.photos.length,
    createdAt: f.createdAt,
  }));
  return { success: true, data: { folders: summary, count: summary.length } };
}

async function handleGetAssetComments(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  let assetId = str(args.assetId);
  const assetTitle = str(args.assetTitle);
  if (!assetId && assetTitle) {
    const { data } = await supabase.from("magnative_creative_assets").select("id, title").ilike("title", likePattern(assetTitle)).limit(5);
    if (!data || data.length === 0) return { success: false, error: "Aset tidak ditemukan." };
    if (data.length > 1) {
      return { success: true, data: { message: "Ada beberapa aset yang cocok, tanyakan ke user mana yang dimaksud.", candidates: data } };
    }
    assetId = data[0].id;
  }
  if (!assetId) return { success: false, error: "ID atau judul aset harus diisi." };

  const comments = await getAssetComments(assetId);
  return { success: true, data: { comments, count: comments.length } };
}

async function handleGetContentRequests(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const clientName = str(args.clientName);
  const clientEmbed = clientName ? "client:magnative_clients!inner(id, name)" : "client:magnative_clients(id, name)";
  let query = supabase
    .from("magnative_content_requests")
    .select(`id, title, description, deadline, priority, status, catatan, ${clientEmbed}`)
    .order("deadline", { ascending: true, nullsFirst: false });

  const status = str(args.status);
  if (status) query = query.eq("status", status);
  if (clientName) query = query.ilike("client.name", likePattern(clientName));

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_content_requests", error.message);
  return { success: true, data: { requests: data ?? [], count: (data ?? []).length } };
}

async function handleGetProjectVendors(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const resolved = await resolveMagnativeProjectId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return { success: true, data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
  }

  const { data, error } = await supabase
    .from("magnative_project_vendors")
    .select("id, keterangan, biaya_estimasi, vendor:magnative_vendors(id, name, category, contact_name, contact_phone)")
    .eq("project_id", resolved.projectId);
  if (error) return dbError("get_project_vendors", error.message);
  return { success: true, data: { vendors: data ?? [], count: (data ?? []).length } };
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

const BOOTH_STATUSES: BoothStatus[] = ["Desain", "Produksi", "Finishing", "Instalasi", "Selesai", "Dibatalkan"];
const PROJECT_TASK_STATUSES: ProjectTaskStatus[] = ["Belum Mulai", "Berjalan", "Selesai"];

async function handleAddMaintenanceLog(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const itemId = str(args.itemId);
  const jenis = str(args.jenis) as MaintenanceJenis | undefined;
  const biaya = num(args.biaya);
  if (!itemId || !jenis || !MAINTENANCE_JENIS.includes(jenis) || biaya === undefined || biaya < 0) {
    return { success: false, error: "Data servis belum lengkap (alat, jenis, biaya)." };
  }

  const result = await addMaintenanceLog(itemId, {
    tanggal: isoDate(args.tanggal) ?? todayJakarta(),
    jenis,
    keterangan: str(args.keterangan),
    biaya,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Log servis (${jenis}) berhasil dicatat.` } };
}

async function handleScheduleDelivery(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const bookingId = str(args.bookingId);
  const stage = str(args.stage) as DeliveryStage | undefined;
  const status = str(args.status) as DeliveryStatus | undefined;
  if (!bookingId || (stage !== "pengiriman" && stage !== "pengambilan") || !status || !DELIVERY_STATUS.includes(status)) {
    return { success: false, error: "Data pengiriman belum lengkap (booking, tahap, status)." };
  }

  const result = await saveDelivery(bookingId, stage, {
    driverName: str(args.driverName),
    jadwalTanggal: isoDate(args.jadwalTanggal),
    jadwalJam: str(args.jadwalJam),
    status,
    catatan: str(args.catatan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Penjadwalan ${stage} berhasil disimpan.` } };
}

async function handleAddProjectTask(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const projectId = str(args.projectId);
  const title = str(args.title);
  if (!projectId || !title) return { success: false, error: "Proyek dan judul task harus diisi." };
  const status = (str(args.status) as ProjectTaskStatus | undefined) ?? "Belum Mulai";
  if (!PROJECT_TASK_STATUSES.includes(status)) return { success: false, error: "Status task tidak valid." };

  const result = await addProjectTask({
    projectId,
    title,
    detail: str(args.detail),
    status,
    dueDate: isoDate(args.dueDate),
    pic: str(args.pic),
    sortOrder: num(args.sortOrder) ?? 0,
    vendorId: str(args.vendorId),
    biayaEstimasi: num(args.biayaEstimasi) ?? 0,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Task "${title}" berhasil ditambahkan.` } };
}

async function handleUpdateProjectTaskStatus(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const taskId = str(args.taskId);
  const status = str(args.status) as ProjectTaskStatus | undefined;
  if (!taskId || !status || !PROJECT_TASK_STATUSES.includes(status)) {
    return { success: false, error: "ID task atau status tidak valid." };
  }

  const { data: task } = await supabase.from("magnative_project_tasks").select("title").eq("id", taskId).maybeSingle<{ title: string }>();
  if (!task) return { success: false, error: "Task tidak ditemukan." };

  const result = await updateProjectTaskStatus(taskId, status);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Status task "${task.title}" berhasil diubah ke "${status}".` } };
}

async function handleReceivePurchaseOrder(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessPurchaseOrders) return denied("Purchase Order");

  const poId = str(args.poId);
  if (!poId) return { success: false, error: "ID purchase order harus diisi." };

  const { data: po } = await supabase
    .from("production_purchase_orders")
    .select("supplier_name, status")
    .eq("id", poId)
    .maybeSingle<{ supplier_name: string; status: string }>();
  if (!po) return { success: false, error: "Purchase order tidak ditemukan." };
  if (po.status !== "Dipesan") return { success: false, error: `PO ini sudah berstatus "${po.status}".` };

  const result = await receivePurchaseOrder(poId);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `PO ke ${po.supplier_name} ditandai Diterima, stok material sudah bertambah.` } };
}

async function handleUpdateProductionStatus(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const projectId = str(args.projectId);
  const status = str(args.status) as BoothStatus | undefined;
  if (!projectId || !status || !BOOTH_STATUSES.includes(status)) {
    return { success: false, error: "ID proyek atau status tidak valid." };
  }

  const { data: project } = await supabase
    .from("production_booth_projects")
    .select("name, status")
    .eq("id", projectId)
    .maybeSingle<{ name: string; status: BoothStatus }>();
  if (!project) return { success: false, error: "Proyek tidak ditemukan." };
  if (project.status === "Selesai" || project.status === "Dibatalkan") {
    return { success: false, error: `Proyek berstatus "${project.status}" hanya bisa diubah lewat form edit proyek.` };
  }

  const result = await updateProjectStatus(projectId, status, project.status);
  if (!result.ok) return { success: false, error: result.error };
  return {
    success: true,
    data: { message: `Status proyek "${project.name}" berhasil diubah dari "${project.status}" ke "${status}".` },
  };
}

async function handleCreateCapitalRequest(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessAdmin) return denied("Pengajuan Modal");

  const eventName = str(args.eventName);
  const location = str(args.location);
  const billingEstimate = num(args.billingEstimate);
  const modalEstimate = num(args.modalEstimate);
  if (!eventName || !location || billingEstimate === undefined || modalEstimate === undefined) {
    return { success: false, error: "Nama event, lokasi, estimasi billing & modal harus diisi." };
  }

  const result = await addCapitalRequest({
    eventName,
    location,
    eventDate: isoDate(args.eventDate),
    billingEstimate,
    modalEstimate,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Pengajuan modal untuk "${eventName}" berhasil dibuat, menunggu keputusan investor.` } };
}

const CLIENT_STATUSES: ClientStatus[] = ["Prospek", "Aktif", "Selesai", "Tidak Lanjut"];
const MATERIAL_CATEGORIES: MaterialCategory[] = ["Kayu & Panel", "Cat & Finishing", "Hardware & Rangka", "Elektrikal", "Lainnya"];
const MATERIAL_UNITS: MaterialUnit[] = ["pcs", "lembar", "batang", "meter", "kg", "liter", "set"];
const INVOICE_STATUSES: InvoiceStatus[] = ["Draft", "Terkirim", "Lunas"];

async function handleAddInventoryItem(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const name = str(args.name);
  const category = str(args.category);
  const location = str(args.location);
  const pricePerDay = num(args.pricePerDay);
  const totalUnit = num(args.totalUnit);
  if (!name || !category || !location || pricePerDay === undefined || totalUnit === undefined) {
    return { success: false, error: "Nama, kategori, lokasi, harga per hari, dan total unit harus diisi." };
  }

  const result = await addInventoryItem({
    name,
    category,
    location,
    pricePerDay,
    totalUnit,
    unitMaintenance: num(args.unitMaintenance) ?? 0,
    pricePerWeek: num(args.pricePerWeek),
    pricePerMonth: num(args.pricePerMonth),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Alat "${name}" berhasil ditambahkan ke inventaris.` } };
}

async function handleUpdateInventoryItem(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const itemId = str(args.itemId);
  if (!itemId) return { success: false, error: "ID alat harus diisi." };
  const { data: current } = await supabase.from("magnarent_inventory").select("*").eq("id", itemId).maybeSingle<InventoryRow>();
  if (!current) return { success: false, error: "Alat tidak ditemukan." };

  const merged: Omit<InventoryItem, "id"> = {
    name: str(args.name) ?? current.name,
    category: str(args.category) ?? current.category,
    location: str(args.location) ?? current.location,
    pricePerDay: num(args.pricePerDay) ?? current.price_per_day,
    totalUnit: num(args.totalUnit) ?? current.total_unit,
    unitMaintenance: num(args.unitMaintenance) ?? current.unit_maintenance,
    pricePerWeek: num(args.pricePerWeek) ?? current.price_per_week ?? undefined,
    pricePerMonth: num(args.pricePerMonth) ?? current.price_per_month ?? undefined,
  };
  const result = await updateInventoryItem(itemId, merged);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Alat "${merged.name}" berhasil diperbarui.` } };
}

async function handleAddClient(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const name = str(args.name);
  const industry = str(args.industry);
  const picName = str(args.picName);
  if (!name || !industry || !picName) return { success: false, error: "Nama klien, industri, dan nama PIC harus diisi." };
  const status = (str(args.status) as ClientStatus | undefined) ?? "Prospek";
  if (!CLIENT_STATUSES.includes(status)) return { success: false, error: "Status klien tidak valid." };

  const result = await addClient({
    name,
    industry,
    picName,
    picPhone: str(args.picPhone),
    picEmail: str(args.picEmail),
    status,
    catatan: str(args.catatan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Klien "${name}" berhasil ditambahkan.` } };
}

async function handleUpdateClient(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const clientId = str(args.clientId);
  if (!clientId) return { success: false, error: "ID klien harus diisi." };
  const { data: current } = await supabase
    .from("magnative_clients")
    .select("name, industry, pic_name, pic_phone, pic_email, status, catatan")
    .eq("id", clientId)
    .maybeSingle<{
      name: string;
      industry: string;
      pic_name: string;
      pic_phone: string | null;
      pic_email: string | null;
      status: ClientStatus;
      catatan: string | null;
    }>();
  if (!current) return { success: false, error: "Klien tidak ditemukan." };
  const status = (str(args.status) as ClientStatus | undefined) ?? current.status;
  if (!CLIENT_STATUSES.includes(status)) return { success: false, error: "Status klien tidak valid." };

  const merged: Omit<Client, "id"> = {
    name: str(args.name) ?? current.name,
    industry: str(args.industry) ?? current.industry,
    picName: str(args.picName) ?? current.pic_name,
    picPhone: str(args.picPhone) ?? current.pic_phone ?? undefined,
    picEmail: str(args.picEmail) ?? current.pic_email ?? undefined,
    status,
    catatan: str(args.catatan) ?? current.catatan ?? undefined,
  };
  const result = await updateClient(clientId, merged);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Klien "${merged.name}" berhasil diperbarui.` } };
}

async function handleAddMaterial(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const name = str(args.name);
  const category = str(args.category) as MaterialCategory | undefined;
  const unit = str(args.unit) as MaterialUnit | undefined;
  const location = str(args.location);
  const stock = num(args.stock);
  const minStock = num(args.minStock);
  const pricePerUnit = num(args.pricePerUnit);
  if (
    !name ||
    !category ||
    !MATERIAL_CATEGORIES.includes(category) ||
    !unit ||
    !MATERIAL_UNITS.includes(unit) ||
    !location ||
    stock === undefined ||
    minStock === undefined ||
    pricePerUnit === undefined
  ) {
    return { success: false, error: "Nama, kategori, satuan, lokasi, stok, ambang batas, dan harga harus diisi dengan benar." };
  }

  const result = await addMaterial({ name, category, unit, location, stock, minStock, pricePerUnit });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Material "${name}" berhasil ditambahkan.` } };
}

async function handleUpdateMaterial(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const materialId = str(args.materialId);
  if (!materialId) return { success: false, error: "ID material harus diisi." };
  const { data: current } = await supabase
    .from("production_materials")
    .select("name, category, unit, location, stock, min_stock, price_per_unit")
    .eq("id", materialId)
    .maybeSingle<{
      name: string;
      category: MaterialCategory;
      unit: MaterialUnit;
      location: string;
      stock: number;
      min_stock: number;
      price_per_unit: number;
    }>();
  if (!current) return { success: false, error: "Material tidak ditemukan." };

  const merged: Omit<MaterialItem, "id"> = {
    name: str(args.name) ?? current.name,
    category: (str(args.category) as MaterialCategory | undefined) ?? current.category,
    unit: (str(args.unit) as MaterialUnit | undefined) ?? current.unit,
    location: str(args.location) ?? current.location,
    stock: num(args.stock) ?? current.stock,
    minStock: num(args.minStock) ?? current.min_stock,
    pricePerUnit: num(args.pricePerUnit) ?? current.price_per_unit,
  };
  const result = await updateMaterial(materialId, merged, current.stock);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Material "${merged.name}" berhasil diperbarui.` } };
}

async function handleAddPurchaseOrder(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessPurchaseOrders) return denied("Purchase Order");

  const supplierName = str(args.supplierName);
  const qty = num(args.qty);
  const unitPrice = num(args.unitPrice);
  if (!supplierName || qty === undefined || qty <= 0 || unitPrice === undefined || unitPrice < 0) {
    return { success: false, error: "Supplier, qty, dan harga per satuan harus diisi dengan benar." };
  }

  const result = await addPurchaseOrder({
    materialId: str(args.materialId),
    vendorId: str(args.vendorId),
    supplierName,
    qty,
    unitPrice,
    orderDate: isoDate(args.orderDate) ?? todayJakarta(),
    expectedDate: isoDate(args.expectedDate),
    catatan: str(args.catatan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `PO ke ${supplierName} (qty ${qty}) berhasil dibuat.` } };
}

async function handleMarkInvoiceStatus(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessInvoices) return denied("Invoice");

  const invoiceId = str(args.invoiceId);
  const status = str(args.status) as InvoiceStatus | undefined;
  if (!invoiceId || !status || !INVOICE_STATUSES.includes(status)) {
    return { success: false, error: "ID invoice atau status tidak valid." };
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("invoice_number, status")
    .eq("id", invoiceId)
    .maybeSingle<{ invoice_number: string; status: string }>();
  if (!invoice) return { success: false, error: "Invoice tidak ditemukan." };

  const result = await markInvoiceStatus(invoiceId, status);
  if (!result.ok) return { success: false, error: result.error };
  return {
    success: true,
    data: { message: `Status invoice ${invoice.invoice_number} berhasil diubah dari "${invoice.status}" ke "${status}".` },
  };
}

const NC_CATEGORIES_VALUES: NcCategory[] = ["Material", "Vendor", "Kru", "Proses", "Lainnya"];
const NC_SEVERITIES_VALUES: NcSeverity[] = ["Rendah", "Sedang", "Tinggi"];
const NC_STATUSES_VALUES: NcStatus[] = ["Open", "Investigasi", "Tindakan Korektif", "Ditutup"];
const SUBCONTRACT_STATUSES_VALUES: SubcontractStatus[] = ["Dikirim", "Diproses", "Diterima", "Dibatalkan"];
const DEPOSIT_JENIS_VALUES: DepositJenis[] = ["Uang Tunai", "KTP", "SIM", "Lainnya"];
const PIECE_PAYMENT_STATUS_VALUES: PiecePaymentStatus[] = ["Belum Dibayar", "Dibayar"];

async function resolveProductionProjectId(supabase: SupabaseClient, args: Args): Promise<{ projectId: string } | { error: string } | { candidates: unknown[] }> {
  let projectId = str(args.projectId);
  const projectName = str(args.projectName);
  if (!projectId && projectName) {
    const { data } = await supabase
      .from("production_booth_projects")
      .select("id, name")
      .ilike("name", likePattern(projectName))
      .limit(5);
    if (!data || data.length === 0) return { error: "Proyek tidak ditemukan." };
    if (data.length > 1) return { candidates: data };
    projectId = data[0].id;
  }
  if (!projectId) return { error: "ID atau nama proyek harus diisi." };
  return { projectId };
}

async function handleAddSubrentRecord(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const vendorName = str(args.vendorName);
  const jumlahUnit = num(args.jumlahUnit);
  const tanggalMulai = isoDate(args.tanggalMulai);
  const tanggalSelesai = isoDate(args.tanggalSelesai);
  if (!vendorName || jumlahUnit === undefined || !tanggalMulai || !tanggalSelesai) {
    return { success: false, error: "Vendor, jumlah unit, dan tanggal mulai/selesai harus diisi dengan benar." };
  }

  const result = await addSubrentRecord({
    bookingId: str(args.bookingId),
    itemId: str(args.itemId),
    vendorName,
    jumlahUnit,
    hargaSewaTotal: num(args.hargaSewaTotal),
    tanggalMulai,
    tanggalSelesai,
    catatan: str(args.catatan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Subrent ${jumlahUnit} unit dari "${vendorName}" berhasil dicatat.` } };
}

async function handleCreateCheckinLink(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  let projectId = str(args.projectId);
  const projectName = str(args.projectName);
  if (!projectId && projectName) {
    const { data } = await supabase
      .from("magnative_projects")
      .select("id, name")
      .ilike("name", likePattern(projectName))
      .limit(5);
    if (!data || data.length === 0) return { success: false, error: "Proyek tidak ditemukan." };
    if (data.length > 1) {
      return {
        success: true,
        data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: data },
      };
    }
    projectId = data[0].id;
  }
  if (!projectId) return { success: false, error: "ID atau nama proyek harus diisi." };

  const result = await createCheckinLink(projectId, str(args.label));
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Link check-in berhasil dibuat.", token: result.token } };
}

async function handleAddMagnativeVendor(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const name = str(args.name);
  const category = str(args.category) as MagnativeVendorCategory | undefined;
  if (!name || !category) return { success: false, error: "Nama dan kategori vendor harus diisi." };

  const result = await addMagnativeVendorAction({
    name,
    category,
    contactName: str(args.contactName),
    contactPhone: str(args.contactPhone),
    contactEmail: str(args.contactEmail),
    catatan: str(args.catatan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Vendor "${name}" berhasil ditambahkan.` } };
}

async function handleUpdateMagnativeVendor(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const vendorId = str(args.vendorId);
  if (!vendorId) return { success: false, error: "ID vendor harus diisi." };
  const { data: current } = await supabase
    .from("magnative_vendors")
    .select("*")
    .eq("id", vendorId)
    .maybeSingle<{ name: string; category: MagnativeVendorCategory; contact_name: string | null; contact_phone: string | null; contact_email: string | null; catatan: string | null }>();
  if (!current) return { success: false, error: "Vendor tidak ditemukan." };

  const merged = {
    name: str(args.name) ?? current.name,
    category: (str(args.category) as MagnativeVendorCategory | undefined) ?? current.category,
    contactName: str(args.contactName) ?? current.contact_name ?? undefined,
    contactPhone: str(args.contactPhone) ?? current.contact_phone ?? undefined,
    contactEmail: str(args.contactEmail) ?? current.contact_email ?? undefined,
    catatan: str(args.catatan) ?? current.catatan ?? undefined,
  };
  const result = await updateMagnativeVendorAction(vendorId, merged);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Vendor "${merged.name}" berhasil diperbarui.` } };
}

async function handleAddProductionVendor(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const name = str(args.name);
  const category = str(args.category) as ProductionVendorCategory | undefined;
  if (!name || !category) return { success: false, error: "Nama dan kategori vendor harus diisi." };

  const result = await addProductionVendorAction({
    name,
    category,
    contactName: str(args.contactName),
    contactPhone: str(args.contactPhone),
    contactEmail: str(args.contactEmail),
    catatan: str(args.catatan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Vendor "${name}" berhasil ditambahkan.` } };
}

async function handleUpdateProductionVendor(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const vendorId = str(args.vendorId);
  if (!vendorId) return { success: false, error: "ID vendor harus diisi." };
  const { data: current } = await supabase
    .from("production_vendors")
    .select("*")
    .eq("id", vendorId)
    .maybeSingle<{ name: string; category: ProductionVendorCategory; contact_name: string | null; contact_phone: string | null; contact_email: string | null; catatan: string | null }>();
  if (!current) return { success: false, error: "Vendor tidak ditemukan." };

  const merged = {
    name: str(args.name) ?? current.name,
    category: (str(args.category) as ProductionVendorCategory | undefined) ?? current.category,
    contactName: str(args.contactName) ?? current.contact_name ?? undefined,
    contactPhone: str(args.contactPhone) ?? current.contact_phone ?? undefined,
    contactEmail: str(args.contactEmail) ?? current.contact_email ?? undefined,
    catatan: str(args.catatan) ?? current.catatan ?? undefined,
  };
  const result = await updateProductionVendorAction(vendorId, merged);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Vendor "${merged.name}" berhasil diperbarui.` } };
}

async function handleAddNcReport(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const kategori = str(args.kategori) as NcCategory | undefined;
  const judul = str(args.judul);
  const deskripsi = str(args.deskripsi);
  const severity = str(args.severity) as NcSeverity | undefined;
  if (!kategori || !NC_CATEGORIES_VALUES.includes(kategori) || !judul || !deskripsi || !severity || !NC_SEVERITIES_VALUES.includes(severity)) {
    return { success: false, error: "Kategori, judul, deskripsi, dan severity temuan harus diisi dengan benar." };
  }

  const result = await addNcReport({
    projectId: str(args.projectId),
    vendorId: str(args.vendorId),
    projectCrewId: str(args.projectCrewId),
    kategori,
    judul,
    deskripsi,
    severity,
    pic: str(args.pic),
    tanggalDitemukan: isoDate(args.tanggalDitemukan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Laporan NC "${judul}" berhasil dicatat.` } };
}

async function handleUpdateNcReportProgress(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const ncReportId = str(args.ncReportId);
  const status = str(args.status) as NcStatus | undefined;
  if (!ncReportId || !status || !NC_STATUSES_VALUES.includes(status)) {
    return { success: false, error: "ID laporan NC atau status tidak valid." };
  }

  const result = await updateNcReportProgress(ncReportId, {
    status,
    akarMasalah: str(args.akarMasalah),
    tindakanKorektif: str(args.tindakanKorektif),
    tindakanPreventif: str(args.tindakanPreventif),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Status laporan NC berhasil diubah ke "${status}".` } };
}

async function handleAddSubcontractOrder(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const deskripsiPekerjaan = str(args.deskripsiPekerjaan);
  if (!deskripsiPekerjaan) return { success: false, error: "Deskripsi pekerjaan harus diisi." };

  const resolved = await resolveProductionProjectId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return { success: true, data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
  }

  const result = await addSubcontractOrder(resolved.projectId, {
    vendorId: str(args.vendorId),
    deskripsiPekerjaan,
    tanggalKirim: isoDate(args.tanggalKirim),
    estimasiTerima: isoDate(args.estimasiTerima),
    biayaJasa: num(args.biayaJasa),
    catatan: str(args.catatan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Pesanan subkontrak "${deskripsiPekerjaan}" berhasil dibuat.` } };
}

async function handleUpdateSubcontractStatus(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const subcontractOrderId = str(args.subcontractOrderId);
  const status = str(args.status) as SubcontractStatus | undefined;
  if (!subcontractOrderId || !status || !SUBCONTRACT_STATUSES_VALUES.includes(status)) {
    return { success: false, error: "ID pesanan subkontrak atau status tidak valid." };
  }

  const result = await updateSubcontractStatus(subcontractOrderId, status, isoDate(args.tanggalTerima));
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Status pesanan subkontrak berhasil diubah ke "${status}".` } };
}

async function handleAddBomTemplate(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const name = str(args.name);
  const items = Array.isArray(args.items) ? (args.items as SubcontractMaterialItem[]) : [];
  if (!name || items.length === 0) return { success: false, error: "Nama template dan daftar item material harus diisi." };

  const result = await createBomTemplate({ name, description: str(args.description), items: items as unknown as BomTemplateItem[] });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Template BOM "${name}" berhasil dibuat.` } };
}

async function handleAddCrewTimelog(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const projectCrewId = str(args.projectCrewId);
  const tanggal = isoDate(args.tanggal);
  const jam = num(args.jam);
  if (!projectCrewId || !tanggal || jam === undefined || jam <= 0) {
    return { success: false, error: "Penugasan kru, tanggal, dan jam kerja harus diisi dengan benar." };
  }

  const result = await addCrewTimelog(projectCrewId, { tanggal, jam, catatan: str(args.catatan) });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Jam kerja (${jam} jam) berhasil dicatat.` } };
}

async function handleTransferUnitToWarehouse(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const unitId = str(args.unitId);
  const toWarehouseId = str(args.toWarehouseId);
  if (!unitId || !toWarehouseId) return { success: false, error: "Unit dan gudang tujuan harus diisi." };

  const result = await transferUnitToWarehouse(unitId, toWarehouseId, str(args.catatan));
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Transfer unit ke gudang baru berhasil dicatat." } };
}

async function handleSaveBookingDeposit(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const bookingId = str(args.bookingId);
  const jenis = str(args.jenis) as DepositJenis | undefined;
  const jumlah = num(args.jumlah);
  if (!bookingId || !jenis || !DEPOSIT_JENIS_VALUES.includes(jenis) || jumlah === undefined || jumlah < 0) {
    return { success: false, error: "Booking, jenis jaminan, dan jumlah harus diisi dengan benar." };
  }

  const result = await saveBookingDeposit(bookingId, { jenis, jumlah, keterangan: str(args.keterangan) });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Deposit (${jenis}) berhasil disimpan.` } };
}

async function handleSetDepositReturned(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const bookingId = str(args.bookingId);
  if (!bookingId || typeof args.returned !== "boolean") {
    return { success: false, error: "Booking dan status pengembalian harus diisi." };
  }

  const result = await setDepositReturned(bookingId, args.returned);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: args.returned ? "Deposit ditandai sudah dikembalikan." : "Status pengembalian deposit dibatalkan." } };
}

async function handleAddSeasonalPricingRule(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const label = str(args.label);
  const startDate = isoDate(args.startDate);
  const endDate = isoDate(args.endDate);
  const multiplierPct = num(args.multiplierPct);
  if (!label || !startDate || !endDate || endDate < startDate || multiplierPct === undefined) {
    return { success: false, error: "Label, rentang tanggal, dan persen penyesuaian harus diisi dengan benar." };
  }

  const result = await addSeasonalPricingRule({ itemId: str(args.itemId), label, startDate, endDate, multiplierPct });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Aturan harga musiman "${label}" berhasil disimpan.` } };
}

async function handleAddCrewAssignment(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const bookingId = str(args.bookingId);
  const crewName = str(args.crewName);
  const role = str(args.role) as MagnarentCrewRole | undefined;
  if (!bookingId || !crewName || !role) return { success: false, error: "Booking, nama kru, dan peran harus diisi." };

  const result = await addCrewAssignment(bookingId, { crewName, role, catatan: str(args.catatan) });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Kru "${crewName}" (${role}) berhasil ditugaskan.` } };
}

async function handleAddEquipment(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const name = str(args.name);
  const kategori = str(args.kategori) as EquipmentCategory | undefined;
  const kondisi = str(args.kondisi) as EquipmentCondition | undefined;
  if (!name || !kategori || !kondisi) return { success: false, error: "Nama, kategori, dan kondisi alat harus diisi." };

  const result = await addEquipment({ name, kategori, kondisi, catatan: str(args.catatan) });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Alat "${name}" berhasil ditambahkan.` } };
}

async function handleUpdateEquipment(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const equipmentId = str(args.equipmentId);
  if (!equipmentId) return { success: false, error: "ID alat harus diisi." };
  const { data: current } = await supabase
    .from("production_equipment")
    .select("name, kategori, kondisi, catatan")
    .eq("id", equipmentId)
    .maybeSingle<{ name: string; kategori: EquipmentCategory; kondisi: EquipmentCondition; catatan: string | null }>();
  if (!current) return { success: false, error: "Alat tidak ditemukan." };

  const merged = {
    name: str(args.name) ?? current.name,
    kategori: (str(args.kategori) as EquipmentCategory | undefined) ?? current.kategori,
    kondisi: (str(args.kondisi) as EquipmentCondition | undefined) ?? current.kondisi,
    catatan: str(args.catatan) ?? current.catatan ?? undefined,
  };
  const result = await updateEquipment(equipmentId, merged);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Alat "${merged.name}" berhasil diperbarui.` } };
}

async function handleAddEquipmentUsage(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const resolved = await resolveProductionEquipmentId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return { success: true, data: { message: "Ada beberapa alat yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
  }

  const digunakanOleh = str(args.digunakanOleh);
  const tanggalPinjam = isoDate(args.tanggalPinjam);
  if (!digunakanOleh || !tanggalPinjam) return { success: false, error: "Nama pemakai dan tanggal pinjam harus diisi." };

  const result = await addEquipmentUsage(resolved.equipmentId, {
    projectId: str(args.projectId),
    digunakanOleh,
    tanggalPinjam,
    tanggalKembali: isoDate(args.tanggalKembali),
    catatan: str(args.catatan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Pemakaian alat oleh "${digunakanOleh}" berhasil dicatat.` } };
}

async function handleMarkEquipmentUsageReturned(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const usageId = str(args.usageId);
  if (!usageId) return { success: false, error: "ID catatan pemakaian harus diisi." };

  const result = await markEquipmentUsageReturned(usageId, isoDate(args.tanggalKembali) ?? todayJakarta());
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Pemakaian alat ditandai sudah dikembalikan." } };
}

async function handleAddCrewPiecePayment(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const projectCrewId = str(args.projectCrewId);
  const deskripsiPekerjaan = str(args.deskripsiPekerjaan);
  const jumlahUnit = num(args.jumlahUnit);
  const ratePerUnit = num(args.ratePerUnit);
  if (!projectCrewId || !deskripsiPekerjaan || jumlahUnit === undefined || jumlahUnit <= 0 || ratePerUnit === undefined || ratePerUnit < 0) {
    return { success: false, error: "Penugasan kru, deskripsi pekerjaan, jumlah unit, dan rate harus diisi dengan benar." };
  }

  const result = await addCrewPiecePayment(projectCrewId, { deskripsiPekerjaan, jumlahUnit, ratePerUnit, catatan: str(args.catatan) });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Upah borongan "${deskripsiPekerjaan}" berhasil dicatat.` } };
}

async function handleUpdateCrewPiecePaymentStatus(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const paymentId = str(args.paymentId);
  const status = str(args.status) as PiecePaymentStatus | undefined;
  if (!paymentId || !status || !PIECE_PAYMENT_STATUS_VALUES.includes(status)) {
    return { success: false, error: "ID upah borongan dan status tidak valid." };
  }

  const result = await updateCrewPiecePaymentStatus(paymentId, status, isoDate(args.tanggalBayar));
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Status upah borongan berhasil diubah ke "${status}".` } };
}

async function handleAddProjectCrew(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const resolved = await resolveProductionProjectId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return { success: true, data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
  }

  const nama = str(args.nama);
  const peran = str(args.peran) as ProductionCrewRole | undefined;
  if (!nama || !peran) return { success: false, error: "Nama dan peran kru harus diisi." };

  const result = await addProjectCrew(resolved.projectId, { nama, peran, kontak: str(args.kontak), catatan: str(args.catatan) });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Kru "${nama}" (${peran}) berhasil ditugaskan ke proyek.` } };
}

/** Resolve ID proyek Magnativ dari ID langsung atau nama -- dipakai di beberapa
 * tool (update_magnative_project, add_project_cost, add_project_vendor,
 * update_project_pipeline_stage, get_project_vendors). */
async function resolveMagnativeProjectId(
  supabase: SupabaseClient,
  args: Args
): Promise<{ projectId: string } | { error: string } | { candidates: unknown[] }> {
  let projectId = str(args.projectId);
  const projectName = str(args.projectName);
  if (!projectId && projectName) {
    const { data } = await supabase.from("magnative_projects").select("id, name").ilike("name", likePattern(projectName)).limit(5);
    if (!data || data.length === 0) return { error: "Proyek tidak ditemukan." };
    if (data.length > 1) return { candidates: data };
    projectId = data[0].id;
  }
  if (!projectId) return { error: "ID atau nama proyek harus diisi." };
  return { projectId };
}

const PROJECT_TYPES: ProjectType[] = ["Event Organizer", "Creative Agency", "Media Sosial", "Lainnya"];
const PROJECT_STATUSES: ProjectStatus[] = ["Pitching", "Perencanaan", "Berjalan", "Selesai", "Dibatalkan"];
const MAGNATIVE_PAYMENT_STATUSES: MagnativePaymentStatus[] = ["Belum Bayar", "DP", "Lunas"];
const CONTENT_PLATFORMS: Platform[] = ["Instagram", "TikTok", "Facebook", "YouTube", "LinkedIn", "Lainnya"];
const CONTENT_STATUSES: ContentStatus[] = ["Draft", "Revisi", "Disetujui", "Tayang"];
const CONTENT_REQUEST_PRIORITIES: ContentRequestPriority[] = ["Rendah", "Sedang", "Tinggi"];
const CONTENT_REQUEST_STATUSES: ContentRequestStatus[] = ["Baru", "Diproses", "Selesai", "Ditolak"];

/** Cari klien Magnativ by nama -- dipakai beberapa tool content/project yang menerima clientName selain clientId. */
async function resolveMagnativeClientId(
  supabase: SupabaseClient,
  clientName: string
): Promise<{ clientId: string } | { error: string } | { candidates: unknown[] }> {
  const { data } = await supabase.from("magnative_clients").select("id, name").ilike("name", likePattern(clientName)).limit(5);
  if (!data || data.length === 0) return { error: "Klien tidak ditemukan." };
  if (data.length > 1) return { candidates: data };
  return { clientId: data[0].id };
}

async function handleAddMagnativeProject(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  let clientId = str(args.clientId);
  const clientName = str(args.clientName);
  if (!clientId && clientName) {
    const resolved = await resolveMagnativeClientId(supabase, clientName);
    if ("error" in resolved) return { success: false, error: resolved.error };
    if ("candidates" in resolved) {
      return { success: true, data: { message: "Ada beberapa klien yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
    }
    clientId = resolved.clientId;
  }
  const name = str(args.name);
  const type = str(args.type) as ProjectType | undefined;
  const tanggalMulai = isoDate(args.tanggalMulai);
  const tanggalSelesai = isoDate(args.tanggalSelesai);
  const budget = num(args.budget);
  if (!clientId || !name || !type || !PROJECT_TYPES.includes(type) || !tanggalMulai || !tanggalSelesai || budget === undefined) {
    return { success: false, error: "Klien, nama, tipe, tanggal mulai/selesai, dan budget harus diisi dengan benar." };
  }
  const status = (str(args.status) as ProjectStatus | undefined) ?? "Pitching";
  if (!PROJECT_STATUSES.includes(status)) return { success: false, error: "Status proyek tidak valid." };
  const statusPembayaran = (str(args.statusPembayaran) as MagnativePaymentStatus | undefined) ?? "Belum Bayar";
  if (!MAGNATIVE_PAYMENT_STATUSES.includes(statusPembayaran)) return { success: false, error: "Status pembayaran tidak valid." };
  if (status === "Dibatalkan" && !str(args.alasanKalah)) {
    return { success: false, error: "Alasan batal/kalah wajib diisi kalau status Dibatalkan." };
  }

  const result = await addMagnativeProject({
    clientId,
    name,
    type,
    tanggalMulai,
    tanggalSelesai,
    budget,
    status,
    statusPembayaran,
    dpAmount: statusPembayaran === "DP" ? num(args.dpAmount) ?? 0 : 0,
    catatan: str(args.catatan),
    alasanKalah: str(args.alasanKalah),
    sumberUndangan: str(args.sumberUndangan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Proyek "${name}" berhasil ditambahkan.` } };
}

async function handleUpdateMagnativeProject(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const resolved = await resolveMagnativeProjectId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return { success: true, data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
  }

  const { data: current } = await supabase
    .from("magnative_projects")
    .select("client_id, name, type, tanggal_mulai, tanggal_selesai, budget, status, status_pembayaran, dp_amount, catatan, alasan_kalah, pipeline_stage, sumber_undangan")
    .eq("id", resolved.projectId)
    .maybeSingle<{
      client_id: string;
      name: string;
      type: ProjectType;
      tanggal_mulai: string;
      tanggal_selesai: string;
      budget: number;
      status: ProjectStatus;
      status_pembayaran: MagnativePaymentStatus;
      dp_amount: number;
      catatan: string | null;
      alasan_kalah: string | null;
      pipeline_stage: PipelineStage | null;
      sumber_undangan: string | null;
    }>();
  if (!current) return { success: false, error: "Proyek tidak ditemukan." };

  const status = (str(args.status) as ProjectStatus | undefined) ?? current.status;
  if (!PROJECT_STATUSES.includes(status)) return { success: false, error: "Status proyek tidak valid." };
  const alasanKalah = str(args.alasanKalah) ?? current.alasan_kalah ?? undefined;
  if (status === "Dibatalkan" && !alasanKalah) {
    return { success: false, error: "Alasan batal/kalah wajib diisi kalau status diubah ke Dibatalkan." };
  }
  const statusPembayaran = (str(args.statusPembayaran) as MagnativePaymentStatus | undefined) ?? current.status_pembayaran;
  if (!MAGNATIVE_PAYMENT_STATUSES.includes(statusPembayaran)) return { success: false, error: "Status pembayaran tidak valid." };

  const name = str(args.name) ?? current.name;
  const result = await updateMagnativeProject(resolved.projectId, {
    clientId: str(args.clientId) ?? current.client_id,
    name,
    type: (str(args.type) as ProjectType | undefined) ?? current.type,
    tanggalMulai: isoDate(args.tanggalMulai) ?? current.tanggal_mulai,
    tanggalSelesai: isoDate(args.tanggalSelesai) ?? current.tanggal_selesai,
    budget: num(args.budget) ?? current.budget,
    status,
    statusPembayaran,
    dpAmount: statusPembayaran === "DP" ? num(args.dpAmount) ?? current.dp_amount : 0,
    catatan: str(args.catatan) ?? current.catatan ?? undefined,
    alasanKalah,
    pipelineStage: current.pipeline_stage ?? undefined,
    sumberUndangan: str(args.sumberUndangan) ?? current.sumber_undangan ?? undefined,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Proyek "${name}" berhasil diperbarui.` } };
}

async function handleAddProjectCost(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const resolved = await resolveMagnativeProjectId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return { success: true, data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
  }

  const description = str(args.description);
  const amount = num(args.amount);
  const category = str(args.category);
  const paymentMethod = str(args.paymentMethod);
  if (!description || amount === undefined || amount <= 0 || !category || !paymentMethod) {
    return { success: false, error: "Deskripsi, jumlah, kategori, dan metode bayar harus diisi dengan benar." };
  }

  const result = await addProjectCost({
    projectId: resolved.projectId,
    description,
    amount,
    costDate: isoDate(args.costDate) ?? todayJakarta(),
    category,
    paymentMethod,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Biaya proyek "${description}" (${num(args.amount) !== undefined ? `Rp ${Math.round(amount).toLocaleString("id-ID")}` : "-"}) berhasil dicatat.` } };
}

async function handleUpdateProjectCost(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const costId = str(args.costId);
  if (!costId) return { success: false, error: "ID biaya proyek harus diisi." };

  const { data: current } = await supabase
    .from("event_expenses")
    .select("source_id, notes, amount, category, payment_method, expense_date, source_type")
    .eq("id", costId)
    .maybeSingle<{
      source_id: string | null;
      notes: string | null;
      amount: number;
      category: string;
      payment_method: string;
      expense_date: string;
      source_type: string;
    }>();
  if (!current || current.source_type !== "magnative_project" || !current.source_id) {
    return { success: false, error: "Biaya proyek tidak ditemukan." };
  }

  const description = str(args.description) ?? current.notes ?? undefined;
  const amount = num(args.amount) ?? current.amount;
  if (!description || amount <= 0) return { success: false, error: "Deskripsi harus diisi dan jumlah harus lebih dari 0." };

  const result = await updateProjectCost(costId, {
    projectId: current.source_id,
    description,
    amount,
    costDate: isoDate(args.costDate) ?? current.expense_date,
    category: str(args.category) ?? current.category,
    paymentMethod: str(args.paymentMethod) ?? current.payment_method,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Biaya proyek "${description}" berhasil diperbarui.` } };
}

async function handleAddContentPost(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  let clientId = str(args.clientId);
  const clientName = str(args.clientName);
  if (!clientId && clientName) {
    const resolved = await resolveMagnativeClientId(supabase, clientName);
    if ("error" in resolved) return { success: false, error: resolved.error };
    if ("candidates" in resolved) {
      return { success: true, data: { message: "Ada beberapa klien yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
    }
    clientId = resolved.clientId;
  }

  const title = str(args.title);
  const platform = str(args.platform) as Platform | undefined;
  const tanggalPosting = isoDate(args.tanggalPosting);
  if (!title || !platform || !CONTENT_PLATFORMS.includes(platform) || !tanggalPosting) {
    return { success: false, error: "Judul, platform, dan tanggal posting harus diisi dengan benar." };
  }
  const status = (str(args.status) as ContentStatus | undefined) ?? "Draft";
  if (!CONTENT_STATUSES.includes(status)) return { success: false, error: "Status konten tidak valid." };
  const feedbackRevisi = str(args.feedbackRevisi);
  if (status === "Revisi" && !feedbackRevisi) return { success: false, error: "Catatan revisi wajib diisi kalau status Revisi." };

  const result = await addContentPost({
    clientId,
    title,
    platform,
    tanggalPosting,
    status,
    catatan: str(args.catatan),
    feedbackRevisi,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Konten "${title}" (${platform}) berhasil dijadwalkan.` } };
}

async function handleUpdateContentPost(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const postId = str(args.postId);
  if (!postId) return { success: false, error: "ID konten harus diisi." };

  const { data: current } = await supabase
    .from("magnative_content_posts")
    .select("client_id, title, platform, tanggal_posting, status, catatan, feedback_revisi")
    .eq("id", postId)
    .maybeSingle<{
      client_id: string | null;
      title: string;
      platform: Platform;
      tanggal_posting: string;
      status: ContentStatus;
      catatan: string | null;
      feedback_revisi: string | null;
    }>();
  if (!current) return { success: false, error: "Konten tidak ditemukan." };

  const status = (str(args.status) as ContentStatus | undefined) ?? current.status;
  if (!CONTENT_STATUSES.includes(status)) return { success: false, error: "Status konten tidak valid." };
  const feedbackRevisi = str(args.feedbackRevisi) ?? current.feedback_revisi ?? undefined;
  if (status === "Revisi" && !feedbackRevisi) return { success: false, error: "Catatan revisi wajib diisi kalau status Revisi." };

  const title = str(args.title) ?? current.title;
  const result = await updateContentPost(postId, {
    clientId: str(args.clientId) ?? current.client_id ?? undefined,
    title,
    platform: (str(args.platform) as Platform | undefined) ?? current.platform,
    tanggalPosting: isoDate(args.tanggalPosting) ?? current.tanggal_posting,
    status,
    catatan: str(args.catatan) ?? current.catatan ?? undefined,
    feedbackRevisi,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Konten "${title}" berhasil diperbarui.` } };
}

async function handleUpdateContentStatus(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const postId = str(args.postId);
  const status = str(args.status) as ContentStatus | undefined;
  if (!postId || !status || !CONTENT_STATUSES.includes(status)) {
    return { success: false, error: "ID konten atau status tidak valid." };
  }
  if (status === "Revisi" && !str(args.feedbackRevisi)) {
    return { success: false, error: "Catatan revisi wajib diisi kalau status Revisi." };
  }

  const { data: post } = await supabase.from("magnative_content_posts").select("title").eq("id", postId).maybeSingle<{ title: string }>();
  if (!post) return { success: false, error: "Konten tidak ditemukan." };

  const result = await updateContentStatus(postId, status, str(args.feedbackRevisi));
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Status konten "${post.title}" berhasil diubah ke "${status}".` } };
}

async function handleAddContentRequest(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  let clientId = str(args.clientId);
  const clientName = str(args.clientName);
  if (!clientId && clientName) {
    const resolved = await resolveMagnativeClientId(supabase, clientName);
    if ("error" in resolved) return { success: false, error: resolved.error };
    if ("candidates" in resolved) {
      return { success: true, data: { message: "Ada beberapa klien yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
    }
    clientId = resolved.clientId;
  }

  const title = str(args.title);
  const description = str(args.description);
  if (!clientId || !title || !description) {
    return { success: false, error: "Klien, judul, dan deskripsi permintaan harus diisi." };
  }
  const priority = (str(args.priority) as ContentRequestPriority | undefined) ?? "Sedang";
  if (!CONTENT_REQUEST_PRIORITIES.includes(priority)) return { success: false, error: "Prioritas tidak valid." };

  const result = await addContentRequest({
    clientId,
    title,
    description,
    deadline: isoDate(args.deadline),
    priority,
    catatan: str(args.catatan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Permintaan konten "${title}" berhasil dicatat.` } };
}

async function handleUpdateContentRequestStatus(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const requestId = str(args.requestId);
  const status = str(args.status) as ContentRequestStatus | undefined;
  if (!requestId || !status || !CONTENT_REQUEST_STATUSES.includes(status)) {
    return { success: false, error: "ID permintaan atau status tidak valid." };
  }

  const { data: reqRow } = await supabase.from("magnative_content_requests").select("title").eq("id", requestId).maybeSingle<{ title: string }>();
  if (!reqRow) return { success: false, error: "Permintaan konten tidak ditemukan." };

  const result = await updateContentRequestStatus(requestId, status);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Status permintaan konten "${reqRow.title}" berhasil diubah ke "${status}".` } };
}

async function handleAddProjectVendor(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const resolved = await resolveMagnativeProjectId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return { success: true, data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
  }

  let vendorId = str(args.vendorId);
  const vendorName = str(args.vendorName);
  if (!vendorId && vendorName) {
    const { data } = await supabase.from("magnative_vendors").select("id, name").ilike("name", likePattern(vendorName)).limit(5);
    if (!data || data.length === 0) return { success: false, error: "Vendor tidak ditemukan." };
    if (data.length > 1) {
      return { success: true, data: { message: "Ada beberapa vendor yang cocok, tanyakan ke user mana yang dimaksud.", candidates: data } };
    }
    vendorId = data[0].id;
  }
  if (!vendorId) return { success: false, error: "ID atau nama vendor harus diisi." };

  const result = await addProjectVendor({
    projectId: resolved.projectId,
    vendorId,
    keterangan: str(args.keterangan),
    biayaEstimasi: num(args.biayaEstimasi) ?? 0,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Vendor berhasil dikaitkan ke proyek." } };
}

async function handleUpdateProjectVendor(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const linkId = str(args.projectVendorId);
  if (!linkId) return { success: false, error: "ID kaitan vendor-proyek harus diisi." };

  const { data: current } = await supabase
    .from("magnative_project_vendors")
    .select("project_id, vendor_id, keterangan, biaya_estimasi")
    .eq("id", linkId)
    .maybeSingle<{ project_id: string; vendor_id: string; keterangan: string | null; biaya_estimasi: number }>();
  if (!current) return { success: false, error: "Kaitan vendor-proyek tidak ditemukan." };

  let vendorId = str(args.vendorId) ?? current.vendor_id;
  const vendorName = str(args.vendorName);
  if (!str(args.vendorId) && vendorName) {
    const { data } = await supabase.from("magnative_vendors").select("id, name").ilike("name", likePattern(vendorName)).limit(5);
    if (!data || data.length === 0) return { success: false, error: "Vendor tidak ditemukan." };
    if (data.length > 1) {
      return { success: true, data: { message: "Ada beberapa vendor yang cocok, tanyakan ke user mana yang dimaksud.", candidates: data } };
    }
    vendorId = data[0].id;
  }

  const result = await updateProjectVendor(linkId, {
    projectId: current.project_id,
    vendorId,
    keterangan: str(args.keterangan) ?? current.keterangan ?? undefined,
    biayaEstimasi: num(args.biayaEstimasi) ?? current.biaya_estimasi,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Kaitan vendor-proyek berhasil diperbarui." } };
}

async function handleUpdateProjectTask(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const taskId = str(args.taskId);
  if (!taskId) return { success: false, error: "ID task harus diisi." };

  const { data: current } = await supabase
    .from("magnative_project_tasks")
    .select("project_id, title, detail, status, due_date, pic, sort_order, vendor_id, biaya_estimasi")
    .eq("id", taskId)
    .maybeSingle<{
      project_id: string;
      title: string;
      detail: string | null;
      status: ProjectTaskStatus;
      due_date: string | null;
      pic: string | null;
      sort_order: number;
      vendor_id: string | null;
      biaya_estimasi: number | null;
    }>();
  if (!current) return { success: false, error: "Task tidak ditemukan." };

  const status = (str(args.status) as ProjectTaskStatus | undefined) ?? current.status;
  if (!PROJECT_TASK_STATUSES.includes(status)) return { success: false, error: "Status task tidak valid." };

  const title = str(args.title) ?? current.title;
  const result = await updateProjectTask(taskId, {
    projectId: current.project_id,
    title,
    detail: str(args.detail) ?? current.detail ?? undefined,
    status,
    dueDate: isoDate(args.dueDate) ?? current.due_date ?? undefined,
    pic: str(args.pic) ?? current.pic ?? undefined,
    sortOrder: num(args.sortOrder) ?? current.sort_order,
    vendorId: str(args.vendorId) ?? current.vendor_id ?? undefined,
    biayaEstimasi: num(args.biayaEstimasi) ?? current.biaya_estimasi ?? undefined,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Task "${title}" berhasil diperbarui.` } };
}

async function handleUpdateProjectPipelineStage(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const resolved = await resolveMagnativeProjectId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return { success: true, data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates } };
  }

  const stage = str(args.stage) as PipelineStage | undefined;
  if (!stage || !PIPELINE_STAGES.includes(stage)) {
    return { success: false, error: `Tahap pipeline tidak valid. Pilihan: ${PIPELINE_STAGES.join(", ")}.` };
  }

  const result = await updateProjectPipelineStage(resolved.projectId, stage);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Tahap pipeline proyek berhasil diubah ke "${stage}".` } };
}

async function handleAddAssetComment(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  let assetId = str(args.assetId);
  const assetTitle = str(args.assetTitle);
  if (!assetId && assetTitle) {
    const { data } = await supabase.from("magnative_creative_assets").select("id, title").ilike("title", likePattern(assetTitle)).limit(5);
    if (!data || data.length === 0) return { success: false, error: "Aset tidak ditemukan." };
    if (data.length > 1) {
      return { success: true, data: { message: "Ada beberapa aset yang cocok, tanyakan ke user mana yang dimaksud.", candidates: data } };
    }
    assetId = data[0].id;
  }
  const commentText = str(args.commentText);
  if (!assetId || !commentText) return { success: false, error: "ID/judul aset dan isi komentar harus diisi." };

  const result = await addAssetComment(assetId, commentText);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Komentar berhasil ditambahkan." } };
}

async function handleSetAssetCommentResolved(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");

  const commentId = str(args.commentId);
  if (!commentId) return { success: false, error: "ID komentar harus diisi." };
  const isResolved = typeof args.isResolved === "boolean" ? args.isResolved : true;

  const result = await setAssetCommentResolved(commentId, isResolved);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Komentar ditandai ${isResolved ? "selesai" : "belum selesai"}.` } };
}

async function handleCancelPurchaseOrder(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessPurchaseOrders) return denied("Purchase Order");

  const poId = str(args.poId);
  if (!poId) return { success: false, error: "ID purchase order harus diisi." };

  const { data: po } = await supabase
    .from("production_purchase_orders")
    .select("supplier_name, status")
    .eq("id", poId)
    .maybeSingle<{ supplier_name: string; status: string }>();
  if (!po) return { success: false, error: "Purchase order tidak ditemukan." };
  if (po.status !== "Dipesan") return { success: false, error: `PO ini sudah berstatus "${po.status}", tidak bisa dibatalkan.` };

  const result = await cancelPurchaseOrder(poId);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `PO ke "${po.supplier_name}" berhasil dibatalkan.` } };
}

async function handleDecideCapitalRequest(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessCapital) return denied("Pengajuan Modal");

  const requestId = str(args.requestId);
  const status = str(args.status) as CapitalRequestStatus | undefined;
  if (!requestId || (status !== "Disetujui" && status !== "Ditolak")) {
    return { success: false, error: "ID pengajuan dan status (Disetujui/Ditolak) harus diisi." };
  }

  const { data: reqRow } = await supabase
    .from("capital_requests")
    .select("event_name, status")
    .eq("id", requestId)
    .maybeSingle<{ event_name: string; status: string }>();
  if (!reqRow) return { success: false, error: "Pengajuan modal tidak ditemukan." };
  if (reqRow.status !== "Menunggu") return { success: false, error: `Pengajuan ini sudah berstatus "${reqRow.status}".` };

  const result = await decideCapitalRequest(requestId, status, str(args.note) ?? "");
  if (!result.ok) return { success: false, error: result.error };
  return {
    success: true,
    data: { message: `Pengajuan modal "${reqRow.event_name}" berhasil di${status === "Disetujui" ? "setujui" : "tolak"}.` },
  };
}

async function handleUpdateEventExpense(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessExpenses) return denied("Realisasi Event");

  const expenseId = str(args.expenseId);
  if (!expenseId) return { success: false, error: "ID pengeluaran harus diisi." };

  const { data: current } = await supabase
    .from("event_expenses")
    .select("expense_date, division, source_type, source_id, category, amount, pic_name, payment_method, reimbursement_status, notes")
    .eq("id", expenseId)
    .maybeSingle<{
      expense_date: string;
      division: ExpenseDivision;
      source_type: ExpenseSourceType;
      source_id: string | null;
      category: ExpenseCategory;
      amount: number;
      pic_name: string;
      payment_method: string;
      reimbursement_status: ReimbursementStatus;
      notes: string | null;
    }>();
  if (!current) return { success: false, error: "Pengeluaran tidak ditemukan." };

  const category = (str(args.category) as ExpenseCategory | undefined) ?? current.category;
  if (!EXPENSE_CATEGORIES.includes(category)) return { success: false, error: "Kategori tidak valid." };
  const amount = num(args.amount) ?? current.amount;
  if (amount <= 0) return { success: false, error: "Jumlah pengeluaran harus lebih dari 0." };
  const reimbursementStatus = (str(args.reimbursementStatus) as ReimbursementStatus | undefined) ?? current.reimbursement_status;
  if (!REIMBURSEMENT_STATUSES.includes(reimbursementStatus)) return { success: false, error: "Status penggantian tidak valid." };

  const result = await updateEventExpense(expenseId, {
    expenseDate: isoDate(args.expenseDate) ?? current.expense_date,
    division: current.division,
    sourceType: current.source_type,
    sourceId: current.source_id,
    category,
    amount,
    picName: str(args.picName) ?? current.pic_name,
    paymentMethod: str(args.paymentMethod) ?? current.payment_method,
    reimbursementStatus,
    notes: str(args.notes) ?? current.notes ?? undefined,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Pengeluaran "${category}" berhasil diperbarui.` } };
}

// ============================================================================
// WAVE 6 -- Invoice, Produk, Gudang/Subrent/Bulk-scan, BOM/Transfer Material,
// Jurnal/Daftar Akun, Link Portal, Notifikasi
// ============================================================================

const INVOICE_DIVISIONS: InvoiceDivision[] = ["magnarent", "magnative", "production"];
const PRODUCT_DIVISIONS: ProductDivision[] = ["magnarent", "magnativ", "production", "umum"];
const INVENTORY_UNIT_STATUSES: InventoryUnitStatus[] = ["Tersedia", "Dipinjam", "Maintenance", "Hilang"];
const MANUAL_JOURNAL_DIVISIONS: ManualJournalDivision[] = ["magnarent", "magnative", "production", "finance"];
const ACCOUNT_TYPES: AccountType[] = ["Aset", "Kewajiban", "Modal", "Pendapatan", "Beban"];
const NORMAL_BALANCES: NormalBalance[] = ["Debit", "Kredit"];

/** Resolve materialId Production langsung atau lewat nama (mirip resolveProductionEquipmentId). */
async function resolveProductionMaterialId(
  supabase: SupabaseClient,
  args: Args
): Promise<{ materialId: string } | { error: string } | { candidates: unknown[] }> {
  let materialId = str(args.materialId);
  const materialName = str(args.materialName);
  if (!materialId && materialName) {
    const { data } = await supabase
      .from("production_materials")
      .select("id, name, category")
      .ilike("name", likePattern(materialName))
      .limit(5);
    if (!data || data.length === 0) return { error: "Material tidak ditemukan." };
    if (data.length > 1) return { candidates: data };
    materialId = data[0].id;
  }
  if (!materialId) return { error: "ID atau nama material harus diisi." };
  return { materialId };
}

async function handleGetProducts(supabase: SupabaseClient, args: Args): Promise<ToolResult> {
  let query = supabase
    .from("products")
    .select("id, name, division, divisions, category, sku, price, unit, stock, supplier, catatan");

  const division = str(args.division);
  if (division) query = query.contains("divisions", [division]);
  const search = str(args.search);
  if (search) {
    const pattern = likePattern(search);
    query = query.or(`name.ilike.${pattern},category.ilike.${pattern},sku.ilike.${pattern}`);
  }

  const { data, error } = await query.limit(limitOf(args));
  if (error) return dbError("get_products", error.message);
  return { success: true, data: { products: data ?? [], count: (data ?? []).length } };
}

async function handleGetMyNotifications(): Promise<ToolResult> {
  const { items, unreadCount } = await listMyNotifications();
  return { success: true, data: { notifications: items, unreadCount } };
}

async function handleCheckCrewConflicts(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const bookingId = str(args.bookingId);
  const crewName = str(args.crewName);
  if (!bookingId || !crewName) return { success: false, error: "ID booking dan nama kru harus diisi." };

  const conflicts = await findCrewConflicts(bookingId, crewName);
  return { success: true, data: { conflicts, count: conflicts.length } };
}

async function handleGetMaterialTransfers(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const resolved = await resolveProductionMaterialId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return {
      success: true,
      data: { message: "Ada beberapa material yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates },
    };
  }

  const transfers = await getMaterialTransfers(resolved.materialId);
  return { success: true, data: { transfers, count: transfers.length } };
}

async function handleGetProjectDocuments(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const resolved = await resolveProductionProjectId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return {
      success: true,
      data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates },
    };
  }

  const documents = await getProjectDocuments(resolved.projectId);
  return { success: true, data: { documents, count: documents.length } };
}

async function handleGetPortalLinks(ctx: UserContext, args: Args): Promise<ToolResult> {
  const portalModule = str(args.module) as PortalModule | undefined;
  const entityId = str(args.entityId);
  if (!portalModule || !entityId) return { success: false, error: "Modul dan ID entitas harus diisi." };

  const moduleAccess: Record<PortalModule, boolean> = {
    magnarent: ctx.canAccessMagnarent,
    magnative: ctx.canAccessMagnative,
    production: ctx.canAccessProduction,
  };
  if (!moduleAccess[portalModule]) return denied(portalModule);

  const links = await listPortalLinks(portalModule, entityId);
  return { success: true, data: { links, count: links.length } };
}

async function handleAddInvoice(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessInvoices) return denied("Invoice");

  const division = str(args.division) as InvoiceDivision | undefined;
  const clientName = str(args.clientName);
  const itemsArg = Array.isArray(args.items) ? (args.items as Args[]) : [];
  if (!division || !INVOICE_DIVISIONS.includes(division) || !clientName || itemsArg.length === 0) {
    return { success: false, error: "Divisi, nama klien, dan minimal satu item harus diisi." };
  }

  const items: InvoiceItemInput[] = itemsArg.map((it) => ({
    description: str(it.description) ?? "",
    qty: num(it.qty) ?? 0,
    unitPrice: num(it.unitPrice) ?? 0,
  }));

  const result = await createInvoice({
    division,
    clientName,
    clientPhone: str(args.clientPhone),
    eventName: str(args.eventName),
    items,
    shippingCost: num(args.shippingCost),
    depositAmount: num(args.depositAmount),
    dueDate: isoDate(args.dueDate),
    catatan: str(args.catatan),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Invoice untuk "${clientName}" berhasil dibuat.`, id: result.id } };
}

async function handleUpdateInvoice(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessInvoices) return denied("Invoice");

  const invoiceId = str(args.invoiceId);
  if (!invoiceId) return { success: false, error: "ID invoice harus diisi." };

  const { data: row } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle<InvoiceRow>();
  if (!row) return { success: false, error: "Invoice tidak ditemukan." };
  const current: Invoice = rowToInvoice(row);

  const itemsArg = Array.isArray(args.items) ? (args.items as Args[]) : undefined;
  const items: InvoiceItemInput[] = itemsArg
    ? itemsArg.map((it) => ({ description: str(it.description) ?? "", qty: num(it.qty) ?? 0, unitPrice: num(it.unitPrice) ?? 0 }))
    : current.items.map((it) => ({
        description: it.description,
        qty: it.qty,
        unitPrice: it.unitPrice,
        qtyLabel: it.qtyLabel,
        unitLabel: it.unitLabel,
        note: it.note,
      }));

  const result = await updateInvoice(invoiceId, {
    division: current.division,
    sourceType: current.sourceType,
    sourceId: current.sourceId,
    documentLabel: current.documentLabel,
    picName: current.picName,
    picPhone: current.picPhone,
    clientName: str(args.clientName) ?? current.clientName,
    clientPhone: str(args.clientPhone) ?? current.clientPhone,
    eventName: str(args.eventName) ?? current.eventName,
    eventLocation: current.eventLocation,
    eventDateLabel: current.eventDateLabel,
    loadingInfo: current.loadingInfo,
    durationLabel: current.durationLabel,
    deliveryMethod: current.deliveryMethod,
    items,
    shippingCost: num(args.shippingCost) ?? current.shippingCost,
    depositAmount: num(args.depositAmount) ?? current.depositAmount,
    depositLabel: current.depositLabel,
    bankName: current.bankName,
    bankAccountHolder: current.bankAccountHolder,
    bankAccountNumber: current.bankAccountNumber,
    paymentNote: current.paymentNote,
    termsConditions: current.termsConditions,
    issuedDate: current.issuedDate,
    dueDate: isoDate(args.dueDate) ?? current.dueDate,
    catatan: str(args.catatan) ?? current.catatan,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Invoice "${current.invoiceNumber}" berhasil diperbarui.` } };
}

async function handleSendInvoiceWhatsapp(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessInvoices) return denied("Invoice");

  const invoiceId = str(args.invoiceId);
  if (!invoiceId) return { success: false, error: "ID invoice harus diisi." };

  const result = await sendInvoiceWhatsApp(invoiceId);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Invoice berhasil dikirim ke WhatsApp klien." } };
}

async function handleAddProduct(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessAdmin) return denied("Produk");

  const name = str(args.name);
  if (!name) return { success: false, error: "Nama produk harus diisi." };

  const divisions = Array.isArray(args.divisions)
    ? (args.divisions as unknown[]).filter((d): d is ProductDivision => typeof d === "string" && PRODUCT_DIVISIONS.includes(d as ProductDivision))
    : [];

  const fd = new FormData();
  fd.set("name", name);
  fd.set("divisions", JSON.stringify(divisions.length > 0 ? divisions : ["umum"]));
  fd.set("category", str(args.category) ?? "");
  fd.set("sku", str(args.sku) ?? "");
  fd.set("price", String(num(args.price) ?? 0));
  fd.set("unit", str(args.unit) ?? "unit");
  fd.set("stock", String(num(args.stock) ?? 0));
  fd.set("supplier", str(args.supplier) ?? "");
  fd.set("catatan", str(args.catatan) ?? "");

  const result = await addProduct(fd);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Produk "${name}" berhasil ditambahkan.` } };
}

async function handleUpdateProduct(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessAdmin) return denied("Produk");

  const productId = str(args.productId);
  if (!productId) return { success: false, error: "ID produk harus diisi." };

  const { data: current } = await supabase
    .from("products")
    .select("name, divisions, category, sku, price, unit, stock, supplier, catatan")
    .eq("id", productId)
    .maybeSingle<{
      name: string;
      divisions: ProductDivision[] | null;
      category: string;
      sku: string | null;
      price: number;
      unit: string;
      stock: number;
      supplier: string | null;
      catatan: string | null;
    }>();
  if (!current) return { success: false, error: "Produk tidak ditemukan." };

  const divisionsArg = Array.isArray(args.divisions)
    ? (args.divisions as unknown[]).filter((d): d is ProductDivision => typeof d === "string" && PRODUCT_DIVISIONS.includes(d as ProductDivision))
    : undefined;
  const divisions = divisionsArg && divisionsArg.length > 0 ? divisionsArg : current.divisions ?? ["umum"];

  const merged = {
    name: str(args.name) ?? current.name,
    category: str(args.category) ?? current.category,
    sku: str(args.sku) ?? current.sku ?? "",
    price: num(args.price) ?? current.price,
    unit: str(args.unit) ?? current.unit,
    stock: num(args.stock) ?? current.stock,
    supplier: str(args.supplier) ?? current.supplier ?? "",
    catatan: str(args.catatan) ?? current.catatan ?? "",
  };

  const fd = new FormData();
  fd.set("name", merged.name);
  fd.set("divisions", JSON.stringify(divisions));
  fd.set("category", merged.category);
  fd.set("sku", merged.sku);
  fd.set("price", String(merged.price));
  fd.set("unit", merged.unit);
  fd.set("stock", String(merged.stock));
  fd.set("supplier", merged.supplier);
  fd.set("catatan", merged.catatan);

  const result = await updateProduct(productId, fd);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Produk "${merged.name}" berhasil diperbarui.` } };
}

async function handleAddWarehouse(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const nama = str(args.nama);
  if (!nama) return { success: false, error: "Nama gudang harus diisi." };

  const result = await addWarehouse({ nama, alamat: str(args.alamat), catatan: str(args.catatan) });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Gudang "${nama}" berhasil ditambahkan.` } };
}

async function handleUpdateWarehouse(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const warehouseId = str(args.warehouseId);
  if (!warehouseId) return { success: false, error: "ID gudang harus diisi." };

  const { data: current } = await supabase
    .from("magnarent_warehouses")
    .select("nama, alamat, catatan")
    .eq("id", warehouseId)
    .maybeSingle<{ nama: string; alamat: string | null; catatan: string | null }>();
  if (!current) return { success: false, error: "Gudang tidak ditemukan." };

  const merged = {
    nama: str(args.nama) ?? current.nama,
    alamat: str(args.alamat) ?? current.alamat ?? undefined,
    catatan: str(args.catatan) ?? current.catatan ?? undefined,
  };

  const result = await updateWarehouse(warehouseId, merged);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Gudang "${merged.nama}" berhasil diperbarui.` } };
}

async function handleUpdateSubrentStatus(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const subrentId = str(args.subrentId);
  const status = str(args.status) as SubrentStatus | undefined;
  if (!subrentId || !status || !SUBRENT_STATUS.includes(status)) {
    return { success: false, error: "ID subrent dan status (dari daftar yang valid) harus diisi." };
  }

  const result = await updateSubrentStatus(subrentId, status);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Status subrent berhasil diubah ke "${status}".` } };
}

async function handleBulkScanUpdateUnitStatus(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");

  const codes = Array.isArray(args.codes)
    ? (args.codes as unknown[]).filter((c): c is string => typeof c === "string" && c.trim() !== "")
    : [];
  const status = str(args.status) as InventoryUnitStatus | undefined;
  if (codes.length === 0 || !status || !INVENTORY_UNIT_STATUSES.includes(status)) {
    return { success: false, error: "Daftar kode dan status (dari daftar yang valid) harus diisi." };
  }

  const result = await bulkScanUpdateStatus(codes, status);
  if (!result.ok) return { success: false, error: result.error };
  return {
    success: true,
    data: {
      message: `${result.matchedCount} unit berhasil diubah ke status "${status}".${
        result.notFound.length > 0 ? ` Tidak ketemu: ${result.notFound.join(", ")}.` : ""
      }${result.ambiguous.length > 0 ? ` Ambigu (cocok lebih dari satu unit): ${result.ambiguous.join(", ")}.` : ""}`,
      matchedCount: result.matchedCount,
      notFound: result.notFound,
      ambiguous: result.ambiguous,
    },
  };
}

async function handleUpdateBomTemplate(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const templateId = str(args.templateId);
  if (!templateId) return { success: false, error: "ID template BOM harus diisi." };

  const { data: current } = await supabase
    .from("production_bom_templates")
    .select("name, description, items")
    .eq("id", templateId)
    .maybeSingle<{ name: string; description: string | null; items: BomTemplateItem[] }>();
  if (!current) return { success: false, error: "Template BOM tidak ditemukan." };

  const itemsArg = Array.isArray(args.items)
    ? (args.items as Args[]).map((it) => ({ materialId: str(it.materialId) ?? "", qty: num(it.qty) ?? 0 }))
    : undefined;

  const merged = {
    name: str(args.name) ?? current.name,
    description: str(args.description) ?? current.description ?? undefined,
    items: itemsArg && itemsArg.length > 0 ? itemsArg : current.items,
  };

  const result = await updateBomTemplate(templateId, merged);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Template BOM "${merged.name}" berhasil diperbarui.` } };
}

async function handleTransferMaterialStock(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");

  const resolved = await resolveProductionMaterialId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return {
      success: true,
      data: { message: "Ada beberapa material yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates },
    };
  }

  const qty = num(args.qty);
  const toLocation = str(args.toLocation);
  if (!qty || qty <= 0 || !toLocation) return { success: false, error: "Jumlah transfer dan lokasi tujuan harus diisi." };

  const result = await transferMaterialStock(resolved.materialId, { qty, toLocation, catatan: str(args.catatan) });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Transfer ${qty} unit ke "${toLocation}" berhasil dicatat.` } };
}

async function handleAddJournalEntry(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessAccounting) return denied("Akuntansi");

  const entryDate = isoDate(args.entryDate);
  const description = str(args.description);
  const lines = Array.isArray(args.lines) ? (args.lines as Args[]) : [];
  if (!entryDate || !description || lines.length < 2) {
    return { success: false, error: "Tanggal, keterangan, dan minimal 2 baris jurnal harus diisi." };
  }

  const division = str(args.division) as ManualJournalDivision | undefined;
  const journalLines = lines.map((l) => ({
    accountCode: str(l.accountCode) ?? "",
    debit: num(l.debit) ?? 0,
    credit: num(l.credit) ?? 0,
    notes: str(l.notes),
  }));

  const result = await createManualJournalEntry({
    entryDate,
    description,
    division: division && MANUAL_JOURNAL_DIVISIONS.includes(division) ? division : null,
    lines: journalLines,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Jurnal "${description}" berhasil disimpan.` } };
}

async function handleAddAccount(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessAccounting) return denied("Akuntansi");

  const code = str(args.code);
  const name = str(args.name);
  const type = str(args.type) as AccountType | undefined;
  const normalBalance = str(args.normalBalance) as NormalBalance | undefined;
  if (!code || !name || !type || !ACCOUNT_TYPES.includes(type) || !normalBalance || !NORMAL_BALANCES.includes(normalBalance)) {
    return { success: false, error: "Kode, nama, tipe, dan saldo normal akun harus diisi dengan benar." };
  }

  const result = await createAccount({ code, name, type, subtype: str(args.subtype), normalBalance, description: str(args.description) });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Akun "${code} — ${name}" berhasil ditambahkan.` } };
}

async function handleSetAccountActive(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessAccounting) return denied("Akuntansi");

  const accountId = str(args.accountId);
  if (!accountId || typeof args.isActive !== "boolean") {
    return { success: false, error: "ID akun dan status aktif harus diisi." };
  }

  const result = await setAccountActive(accountId, args.isActive);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: args.isActive ? "Akun berhasil diaktifkan." : "Akun berhasil dinonaktifkan." } };
}

async function handleCreatePortalLink(ctx: UserContext, args: Args): Promise<ToolResult> {
  const portalModule = str(args.module) as PortalModule | undefined;
  const entityId = str(args.entityId);
  if (!portalModule || !entityId) return { success: false, error: "Modul dan ID entitas harus diisi." };

  const moduleAccess: Record<PortalModule, boolean> = {
    magnarent: ctx.canAccessMagnarent,
    magnative: ctx.canAccessMagnative,
    production: ctx.canAccessProduction,
  };
  if (!moduleAccess[portalModule]) return denied(portalModule);

  const result = await createPortalLink({
    module: portalModule,
    entityId,
    clientName: str(args.clientName),
    expiresInDays: num(args.expiresInDays),
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Link portal berhasil dibuat.", token: result.token } };
}

async function handleRevokePortalLink(ctx: UserContext, args: Args): Promise<ToolResult> {
  const portalModule = str(args.module) as PortalModule | undefined;
  const linkId = str(args.linkId);
  if (!portalModule || !linkId) return { success: false, error: "ID link dan modul harus diisi." };

  const moduleAccess: Record<PortalModule, boolean> = {
    magnarent: ctx.canAccessMagnarent,
    magnative: ctx.canAccessMagnative,
    production: ctx.canAccessProduction,
  };
  if (!moduleAccess[portalModule]) return denied(portalModule);

  const result = await revokePortalLink(linkId, portalModule);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Link portal berhasil dicabut." } };
}

async function handleMarkNotificationRead(args: Args): Promise<ToolResult> {
  const notificationId = str(args.notificationId);
  if (!notificationId) return { success: false, error: "ID notifikasi harus diisi." };

  const result = await markNotificationRead(notificationId);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Notifikasi ditandai sudah dibaca." } };
}

// ============================================================================
// WAVE 7 -- Edit booking lengkap, Proyek booth Production, Folder portofolio,
// Chat tim, Statistik check-in, Tanda tangan portal, Notifikasi lanjutan
// ============================================================================

const PRODUCTION_PAYMENT_STATUSES: ProductionPaymentStatus[] = ["Belum Bayar", "DP", "Lunas"];
const BROADCASTABLE_DIVISIONS: Division[] = ["magnarent", "magnative", "production"];

async function handleGetCheckinStats(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");
  const resolved = await resolveMagnativeProjectId(supabase, args);
  if ("error" in resolved) return { success: false, error: resolved.error };
  if ("candidates" in resolved) {
    return {
      success: true,
      data: { message: "Ada beberapa proyek yang cocok, tanyakan ke user mana yang dimaksud.", candidates: resolved.candidates },
    };
  }
  const stats = await getCheckinStats(resolved.projectId);
  return { success: true, data: stats };
}

async function handleGetPortalSignatures(ctx: UserContext, args: Args): Promise<ToolResult> {
  const portalModule = str(args.module) as PortalModule | undefined;
  const entityId = str(args.entityId);
  if (!portalModule || !entityId) return { success: false, error: "Modul dan ID entitas harus diisi." };
  const moduleAccess: Record<PortalModule, boolean> = {
    magnarent: ctx.canAccessMagnarent,
    magnative: ctx.canAccessMagnative,
    production: ctx.canAccessProduction,
  };
  if (!moduleAccess[portalModule]) return denied(portalModule);
  const signatures = await listSignatures(portalModule, entityId);
  return { success: true, data: { signatures, count: signatures.length } };
}

async function handleGetChatMessages(ctx: UserContext, args: Args): Promise<ToolResult> {
  const room = str(args.room) as ChatRoom | undefined;
  if (!room || !isRoomAllowed(room, ctx.division as Division)) {
    return { success: false, error: "Ruang chat tidak valid atau tidak bisa diakses." };
  }
  const { messages } = await getChatMessages(room);
  return { success: true, data: { messages, count: messages.length } };
}

async function handleGetUnreadImportantNotifications(): Promise<ToolResult> {
  const notifications = await listUnreadImportantNotifications();
  return { success: true, data: { notifications, count: notifications.length } };
}

async function handleUpdateBooking(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent) return denied("Magnarent");
  const bookingId = str(args.bookingId);
  if (!bookingId) return { success: false, error: "ID booking harus diisi." };
  const { data: row } = await supabase.from("magnarent_bookings").select("*").eq("id", bookingId).maybeSingle<BookingRow>();
  if (!row) return { success: false, error: "Booking tidak ditemukan." };
  const current = rowToBooking(row);

  const statusPembayaran =
    args.statusPembayaran !== undefined && PAYMENT_STATUSES.includes(args.statusPembayaran as PaymentStatus)
      ? (args.statusPembayaran as PaymentStatus)
      : current.statusPembayaran;

  const merged = {
    itemId: str(args.itemId) ?? current.itemId,
    clientId: current.clientId,
    namaKlien: str(args.namaKlien) ?? current.namaKlien,
    teleponKlien: str(args.teleponKlien) ?? current.teleponKlien,
    tanggalMulai: isoDate(args.tanggalMulai) ?? current.tanggalMulai,
    tanggalSelesai: isoDate(args.tanggalSelesai) ?? current.tanggalSelesai,
    jumlahUnit: num(args.jumlahUnit) ?? current.jumlahUnit,
    statusPembayaran,
    dpAmount: statusPembayaran === "DP" ? num(args.jumlahDp) ?? current.dpAmount : 0,
    catatan: str(args.catatan) ?? current.catatan,
  };

  const result = await updateBooking(bookingId, merged);
  if (!result.ok) {
    if ("conflict" in result) {
      return {
        success: false,
        error: `Jadwal bentrok: hanya ${Math.max(0, result.conflict.available)} unit tersedia, diminta ${result.conflict.requested}.`,
      };
    }
    return { success: false, error: result.error };
  }
  return { success: true, data: { message: `Booking "${merged.namaKlien}" berhasil diperbarui.` } };
}

async function handleAddProductionProject(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");
  const name = str(args.name);
  const namaKlien = str(args.namaKlien);
  const lokasiAcara = str(args.lokasiAcara);
  const tanggalMulai = isoDate(args.tanggalMulai);
  const tanggalInstalasi = isoDate(args.tanggalInstalasi);
  const budget = num(args.budget);
  if (!name || !namaKlien || !lokasiAcara || !tanggalMulai || !tanggalInstalasi || budget === undefined) {
    return { success: false, error: "Nama proyek, klien, lokasi, tanggal, dan budget harus diisi." };
  }
  const status = BOOTH_STATUSES.includes(args.status as BoothStatus) ? (args.status as BoothStatus) : "Desain";
  const statusPembayaran = PRODUCTION_PAYMENT_STATUSES.includes(args.statusPembayaran as ProductionPaymentStatus)
    ? (args.statusPembayaran as ProductionPaymentStatus)
    : "Belum Bayar";
  const materials = Array.isArray(args.materials)
    ? (args.materials as Args[]).map((m) => ({ materialId: str(m.materialId) ?? "", qty: num(m.qty) ?? 0 }))
    : [];

  const result = await addProductionProject({
    name,
    namaKlien,
    lokasiAcara,
    status,
    tanggalMulai,
    tanggalInstalasi,
    tanggalBongkarEstimasi: isoDate(args.tanggalBongkarEstimasi),
    budget,
    statusPembayaran,
    dpAmount: statusPembayaran === "DP" ? num(args.jumlahDp) : undefined,
    materials,
    catatan: str(args.catatan),
  });

  if (!result.ok) {
    if ("conflicts" in result) {
      const list = result.conflicts.map((c) => `${c.materialName}: diminta ${c.requested}, tersedia ${c.available}`).join("; ");
      return { success: false, error: `Stok material tidak cukup — ${list}.` };
    }
    return { success: false, error: result.error };
  }
  return { success: true, data: { message: `Proyek booth "${name}" berhasil dibuat.` } };
}

async function handleUpdateProductionProject(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction) return denied("Production");
  const projectId = str(args.projectId);
  if (!projectId) return { success: false, error: "ID proyek harus diisi." };
  const { data: row } = await supabase
    .from("production_booth_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle<BoothProjectRow>();
  if (!row) return { success: false, error: "Proyek tidak ditemukan." };
  const current = rowToBoothProject(row);

  const statusPembayaran =
    args.statusPembayaran !== undefined && PRODUCTION_PAYMENT_STATUSES.includes(args.statusPembayaran as ProductionPaymentStatus)
      ? (args.statusPembayaran as ProductionPaymentStatus)
      : current.statusPembayaran;
  const status =
    args.status !== undefined && BOOTH_STATUSES.includes(args.status as BoothStatus) ? (args.status as BoothStatus) : current.status;
  const materialsArg = Array.isArray(args.materials)
    ? (args.materials as Args[]).map((m) => ({ materialId: str(m.materialId) ?? "", qty: num(m.qty) ?? 0 }))
    : undefined;

  const merged = {
    name: str(args.name) ?? current.name,
    clientId: current.clientId,
    namaKlien: str(args.namaKlien) ?? current.namaKlien,
    lokasiAcara: str(args.lokasiAcara) ?? current.lokasiAcara,
    status,
    tanggalMulai: isoDate(args.tanggalMulai) ?? current.tanggalMulai,
    tanggalInstalasi: isoDate(args.tanggalInstalasi) ?? current.tanggalInstalasi,
    tanggalBongkarEstimasi: isoDate(args.tanggalBongkarEstimasi) ?? current.tanggalBongkarEstimasi,
    budget: num(args.budget) ?? current.budget,
    statusPembayaran,
    dpAmount: statusPembayaran === "DP" ? num(args.jumlahDp) ?? current.dpAmount : 0,
    materials: materialsArg && materialsArg.length > 0 ? materialsArg : current.materials,
    catatan: str(args.catatan) ?? current.catatan,
  };

  const result = await updateProductionProject(projectId, merged);
  if (!result.ok) {
    if ("conflicts" in result) {
      const list = result.conflicts.map((c) => `${c.materialName}: diminta ${c.requested}, tersedia ${c.available}`).join("; ");
      return { success: false, error: `Stok material tidak cukup — ${list}.` };
    }
    return { success: false, error: result.error };
  }
  return { success: true, data: { message: `Proyek booth "${merged.name}" berhasil diperbarui.` } };
}

async function handleUpdatePortfolioFolder(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative) return denied("Magnativ");
  const folderId = str(args.folderId);
  if (!folderId) return { success: false, error: "ID folder harus diisi." };
  const { data: current } = await supabase
    .from("magnative_portfolio_folders")
    .select("title, caption")
    .eq("id", folderId)
    .maybeSingle<{ title: string; caption: string | null }>();
  if (!current) return { success: false, error: "Folder portofolio tidak ditemukan." };
  const merged = { title: str(args.title) ?? current.title, caption: str(args.caption) ?? current.caption ?? undefined };
  const result = await updatePortfolioFolder(folderId, merged);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Folder portofolio "${merged.title}" berhasil diperbarui.` } };
}

async function handleSendChatMessage(ctx: UserContext, args: Args): Promise<ToolResult> {
  const room = str(args.room) as ChatRoom | undefined;
  const message = str(args.message);
  if (!room || !isRoomAllowed(room, ctx.division as Division) || !message) {
    return { success: false, error: "Ruang chat dan isi pesan harus diisi dengan benar." };
  }
  const result = await sendChatMessage(room, message);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: "Pesan berhasil dikirim ke chat." } };
}

async function handleMarkAllNotificationsRead(): Promise<ToolResult> {
  const { items } = await listMyNotifications();
  const unreadIds = items.filter((n) => !n.isRead).map((n) => n.id);
  if (unreadIds.length === 0) return { success: true, data: { message: "Tidak ada notifikasi yang belum dibaca." } };
  const result = await markAllNotificationsRead(unreadIds);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `${unreadIds.length} notifikasi ditandai sudah dibaca.` } };
}

async function handleBroadcastNotification(ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessAdmin) return denied("Admin");
  const divisions = Array.isArray(args.divisions)
    ? (args.divisions as unknown[]).filter((d): d is Division => typeof d === "string" && BROADCASTABLE_DIVISIONS.includes(d as Division))
    : [];
  const title = str(args.title);
  const body = str(args.body);
  if (divisions.length === 0 || !title || !body) {
    return { success: false, error: "Divisi tujuan, judul, dan isi notifikasi harus diisi." };
  }
  const result = await broadcastNotification(divisions, { title, body, url: str(args.url) });
  if (!result.ok) return { success: false, error: result.message };
  return { success: true, data: { message: result.message ?? "Notifikasi sedang dikirim." } };
}

async function handleUpdateMyNickname(args: Args): Promise<ToolResult> {
  const nickname = str(args.nickname);
  if (!nickname) return { success: false, error: "Nama panggilan baru harus diisi." };
  const result = await updateNickname(nickname);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: `Nama panggilan berhasil diubah jadi "@${result.nickname}".` } };
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
  } else if (toolName === "add_maintenance_log") {
    const itemId = str(args.itemId);
    const { data: item } = itemId
      ? await supabase.from("magnarent_inventory").select("name").eq("id", itemId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!item) return { success: false, error: "Alat tidak ditemukan. Cari dulu ID alat yang benar." };
    description = [
      "Catat servis alat:",
      `- Alat: ${item.name}`,
      `- Tanggal: ${isoDate(args.tanggal) ?? `${todayJakarta()} (hari ini)`}`,
      `- Jenis: ${args.jenis}`,
      `- Biaya: ${rupiah(args.biaya)}`,
      `- Keterangan: ${str(args.keterangan) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "schedule_delivery") {
    const bookingId = str(args.bookingId);
    const { data: booking } = bookingId
      ? await supabase.from("magnarent_bookings").select("nama_klien").eq("id", bookingId).maybeSingle<{ nama_klien: string }>()
      : { data: null };
    if (!booking) return { success: false, error: "Booking tidak ditemukan. Cari dulu ID booking yang benar." };
    description = [
      `Jadwalkan ${args.stage}:`,
      `- Klien: ${booking.nama_klien}`,
      `- Status: ${args.status}`,
      `- Sopir: ${str(args.driverName) ?? "-"}`,
      `- Jadwal: ${str(args.jadwalTanggal) ?? "-"} ${str(args.jadwalJam) ?? ""}`.trim(),
      `- Catatan: ${str(args.catatan) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "add_project_task") {
    const projectId = str(args.projectId);
    const { data: project } = projectId
      ? await supabase.from("magnative_projects").select("name").eq("id", projectId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!project) return { success: false, error: "Proyek tidak ditemukan. Cari dulu ID proyek yang benar." };
    description = [
      "Tambah task proyek:",
      `- Proyek: ${project.name}`,
      `- Judul: ${args.title}`,
      `- Status: ${str(args.status) ?? "Belum Mulai"}`,
      `- Tenggat: ${str(args.dueDate) ?? "-"}`,
      `- Estimasi biaya: ${args.biayaEstimasi !== undefined ? rupiah(args.biayaEstimasi) : "-"}`,
    ].join("\n");
  } else if (toolName === "update_project_task_status") {
    const taskId = str(args.taskId);
    const { data: task } = taskId
      ? await supabase
          .from("magnative_project_tasks")
          .select("title, status")
          .eq("id", taskId)
          .maybeSingle<{ title: string; status: string }>()
      : { data: null };
    if (!task) return { success: false, error: "Task tidak ditemukan. Cari dulu ID task yang benar." };
    description = ["Ubah status task:", `- Task: ${task.title}`, `- Status: ${task.status} → ${args.status}`].join("\n");
  } else if (toolName === "receive_purchase_order") {
    const poId = str(args.poId);
    const { data: po } = poId
      ? await supabase
          .from("production_purchase_orders")
          .select("supplier_name, qty, status")
          .eq("id", poId)
          .maybeSingle<{ supplier_name: string; qty: number; status: string }>()
      : { data: null };
    if (!po) return { success: false, error: "Purchase order tidak ditemukan. Cari dulu ID PO yang benar." };
    description = [
      "Tandai PO Diterima:",
      `- Supplier: ${po.supplier_name}`,
      `- Qty: ${po.qty}`,
      `- Status sekarang: ${po.status} → Diterima`,
      "- Stok material terkait otomatis bertambah.",
    ].join("\n");
  } else if (toolName === "update_production_status") {
    const projectId = str(args.projectId);
    const { data: project } = projectId
      ? await supabase
          .from("production_booth_projects")
          .select("name, status")
          .eq("id", projectId)
          .maybeSingle<{ name: string; status: string }>()
      : { data: null };
    if (!project) return { success: false, error: "Proyek tidak ditemukan. Cari dulu ID proyek yang benar." };
    description = ["Ubah status proyek booth:", `- Proyek: ${project.name}`, `- Status: ${project.status} → ${args.status}`].join(
      "\n"
    );
  } else if (toolName === "create_capital_request") {
    description = [
      "Buat pengajuan modal:",
      `- Event: ${args.eventName}`,
      `- Lokasi: ${args.location}`,
      `- Tanggal: ${str(args.eventDate) ?? "-"}`,
      `- Estimasi billing: ${rupiah(args.billingEstimate)}`,
      `- Estimasi modal: ${rupiah(args.modalEstimate)}`,
      "- Akan dikirim ke investor untuk diputuskan.",
    ].join("\n");
  } else if (toolName === "add_inventory_item") {
    description = [
      "Tambah alat baru:",
      `- Nama: ${args.name}`,
      `- Kategori: ${args.category}`,
      `- Lokasi: ${args.location}`,
      `- Harga/hari: ${rupiah(args.pricePerDay)}`,
      `- Total unit: ${args.totalUnit}`,
    ].join("\n");
  } else if (toolName === "update_inventory_item") {
    const itemId = str(args.itemId);
    const { data: item } = itemId
      ? await supabase.from("magnarent_inventory").select("name").eq("id", itemId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!item) return { success: false, error: "Alat tidak ditemukan. Cari dulu ID alat yang benar." };
    description = [`Ubah data alat "${item.name}":`, "- Field yang tidak disebut tetap memakai nilai lama."].join("\n");
  } else if (toolName === "add_client") {
    description = [
      "Tambah klien baru:",
      `- Nama: ${args.name}`,
      `- Industri: ${args.industry}`,
      `- PIC: ${args.picName}`,
      `- Status: ${str(args.status) ?? "Prospek"}`,
    ].join("\n");
  } else if (toolName === "update_client") {
    const clientId = str(args.clientId);
    const { data: client } = clientId
      ? await supabase.from("magnative_clients").select("name").eq("id", clientId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!client) return { success: false, error: "Klien tidak ditemukan. Cari dulu ID klien yang benar." };
    description = [`Ubah data klien "${client.name}":`, "- Field yang tidak disebut tetap memakai nilai lama."].join("\n");
  } else if (toolName === "add_material") {
    description = [
      "Tambah material baru:",
      `- Nama: ${args.name}`,
      `- Kategori: ${args.category}`,
      `- Stok awal: ${args.stock} ${args.unit}`,
      `- Harga/satuan: ${rupiah(args.pricePerUnit)}`,
    ].join("\n");
  } else if (toolName === "update_material") {
    const materialId = str(args.materialId);
    const { data: material } = materialId
      ? await supabase.from("production_materials").select("name").eq("id", materialId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!material) return { success: false, error: "Material tidak ditemukan. Cari dulu ID material yang benar." };
    description = [`Ubah data material "${material.name}":`, "- Field yang tidak disebut tetap memakai nilai lama."].join("\n");
  } else if (toolName === "add_purchase_order") {
    description = [
      "Buat purchase order:",
      `- Supplier: ${args.supplierName}`,
      `- Qty: ${args.qty}`,
      `- Harga/satuan: ${rupiah(args.unitPrice)}`,
      `- Tanggal pesan: ${isoDate(args.orderDate) ?? `${todayJakarta()} (hari ini)`}`,
      `- Perkiraan datang: ${str(args.expectedDate) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "mark_invoice_status") {
    const invoiceId = str(args.invoiceId);
    const { data: invoice } = invoiceId
      ? await supabase
          .from("invoices")
          .select("invoice_number, client_name, status")
          .eq("id", invoiceId)
          .maybeSingle<{ invoice_number: string; client_name: string; status: string }>()
      : { data: null };
    if (!invoice) return { success: false, error: "Invoice tidak ditemukan. Cari dulu ID invoice yang benar." };
    description = [
      "Ubah status invoice:",
      `- Invoice: ${invoice.invoice_number} (${invoice.client_name})`,
      `- Status: ${invoice.status} → ${args.status}`,
    ].join("\n");
  } else if (toolName === "add_subrent_record") {
    description = [
      "Catat subrent alat Magnarent:",
      `- Vendor: ${str(args.vendorName) ?? "-"}`,
      `- Jumlah unit: ${args.jumlahUnit ?? "-"}`,
      `- Periode: ${str(args.tanggalMulai) ?? "-"} s/d ${str(args.tanggalSelesai) ?? "-"}`,
      `- Harga sewa total: ${args.hargaSewaTotal !== undefined ? rupiah(args.hargaSewaTotal) : "-"}`,
    ].join("\n");
  } else if (toolName === "create_checkin_link") {
    description = [
      "Buat link check-in tamu Magnativ:",
      `- Proyek: ${str(args.projectName) ?? str(args.projectId) ?? "-"}`,
      `- Label: ${str(args.label) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "add_magnative_vendor" || toolName === "add_production_vendor") {
    description = [
      `Tambah vendor ${toolName === "add_magnative_vendor" ? "Magnativ" : "Production"} baru:`,
      `- Nama: ${str(args.name) ?? "-"}`,
      `- Kategori: ${str(args.category) ?? "-"}`,
      `- Kontak: ${str(args.contactName) ?? "-"} (${str(args.contactPhone) ?? "-"})`,
    ].join("\n");
  } else if (toolName === "update_magnative_vendor" || toolName === "update_production_vendor") {
    const vendorId = str(args.vendorId);
    const table = toolName === "update_magnative_vendor" ? "magnative_vendors" : "production_vendors";
    const { data: vendor } = vendorId
      ? await supabase.from(table).select("name").eq("id", vendorId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!vendor) return { success: false, error: "Vendor tidak ditemukan. Cari dulu ID vendor yang benar." };
    description = [`Ubah data vendor "${vendor.name}":`, "- Field yang tidak disebut tetap memakai nilai lama."].join("\n");
  } else if (toolName === "add_nc_report") {
    description = [
      "Catat laporan NC/CAPA Production baru:",
      `- Judul: ${str(args.judul) ?? "-"}`,
      `- Kategori: ${str(args.kategori) ?? "-"} | Severity: ${str(args.severity) ?? "-"}`,
      `- Deskripsi: ${str(args.deskripsi) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "update_nc_report_progress") {
    const ncReportId = str(args.ncReportId);
    const { data: nc } = ncReportId
      ? await supabase.from("production_nc_reports").select("judul, status").eq("id", ncReportId).maybeSingle<{ judul: string; status: string }>()
      : { data: null };
    if (!nc) return { success: false, error: "Laporan NC tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Ubah status laporan NC "${nc.judul}":`,
      `- Status: ${nc.status} → ${args.status}`,
    ].join("\n");
  } else if (toolName === "add_subcontract_order") {
    description = [
      "Buat pesanan subkontrak Production baru:",
      `- Proyek: ${str(args.projectName) ?? str(args.projectId) ?? "-"}`,
      `- Pekerjaan: ${str(args.deskripsiPekerjaan) ?? "-"}`,
      `- Biaya jasa: ${args.biayaJasa !== undefined ? rupiah(args.biayaJasa) : "-"}`,
    ].join("\n");
  } else if (toolName === "update_subcontract_status") {
    const subcontractOrderId = str(args.subcontractOrderId);
    const { data: order } = subcontractOrderId
      ? await supabase
          .from("production_subcontract_orders")
          .select("deskripsi_pekerjaan, status")
          .eq("id", subcontractOrderId)
          .maybeSingle<{ deskripsi_pekerjaan: string; status: string }>()
      : { data: null };
    if (!order) return { success: false, error: "Pesanan subkontrak tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Ubah status subkontrak "${order.deskripsi_pekerjaan}":`,
      `- Status: ${order.status} → ${args.status}`,
    ].join("\n");
  } else if (toolName === "add_bom_template") {
    const items = Array.isArray(args.items) ? args.items.length : 0;
    description = [
      "Buat template BOM Production baru:",
      `- Nama: ${str(args.name) ?? "-"}`,
      `- Jumlah item material: ${items}`,
    ].join("\n");
  } else if (toolName === "add_crew_timelog") {
    description = [
      "Catat jam kerja kru Production:",
      `- Tanggal: ${str(args.tanggal) ?? "-"}`,
      `- Jam: ${args.jam ?? "-"}`,
    ].join("\n");
  } else if (toolName === "transfer_unit_to_warehouse") {
    const unitId = str(args.unitId);
    const { data: unit } = unitId
      ? await supabase.from("magnarent_inventory_units").select("kode_unit").eq("id", unitId).maybeSingle<{ kode_unit: string }>()
      : { data: null };
    const { data: warehouse } = str(args.toWarehouseId)
      ? await supabase.from("magnarent_warehouses").select("nama").eq("id", str(args.toWarehouseId)).maybeSingle<{ nama: string }>()
      : { data: null };
    if (!unit) return { success: false, error: "Unit fisik tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Pindahkan unit "${unit.kode_unit}" ke gudang "${warehouse?.nama ?? "-"}":`,
      `- Catatan: ${str(args.catatan) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "save_booking_deposit") {
    const bookingId = str(args.bookingId);
    const { data: booking } = bookingId
      ? await supabase.from("magnarent_bookings").select("nama_klien").eq("id", bookingId).maybeSingle<{ nama_klien: string }>()
      : { data: null };
    if (!booking) return { success: false, error: "Booking tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Simpan deposit booking ${booking.nama_klien}:`,
      `- Jenis: ${str(args.jenis) ?? "-"}`,
      `- Jumlah: ${args.jumlah !== undefined ? rupiah(args.jumlah) : "-"}`,
    ].join("\n");
  } else if (toolName === "set_deposit_returned") {
    const bookingId = str(args.bookingId);
    const { data: booking } = bookingId
      ? await supabase.from("magnarent_bookings").select("nama_klien").eq("id", bookingId).maybeSingle<{ nama_klien: string }>()
      : { data: null };
    if (!booking) return { success: false, error: "Booking tidak ditemukan. Cari dulu ID yang benar." };
    description = `Tandai deposit booking ${booking.nama_klien} sebagai ${args.returned ? "SUDAH dikembalikan" : "BELUM dikembalikan"}.`;
  } else if (toolName === "add_seasonal_pricing_rule") {
    description = [
      "Tambah aturan harga musiman Magnarent:",
      `- Label: ${str(args.label) ?? "-"}`,
      `- Rentang: ${str(args.startDate) ?? "-"} s/d ${str(args.endDate) ?? "-"}`,
      `- Penyesuaian: ${args.multiplierPct ?? "-"}%`,
      `- Berlaku untuk: ${str(args.itemId) ? "satu alat spesifik" : "SEMUA alat"}`,
    ].join("\n");
  } else if (toolName === "add_crew_assignment") {
    const bookingId = str(args.bookingId);
    const crewName = str(args.crewName);
    const { data: booking } = bookingId
      ? await supabase.from("magnarent_bookings").select("nama_klien").eq("id", bookingId).maybeSingle<{ nama_klien: string }>()
      : { data: null };
    if (!booking) return { success: false, error: "Booking tidak ditemukan. Cari dulu ID yang benar." };
    const conflicts = bookingId && crewName ? await findCrewConflicts(bookingId, crewName) : [];
    description = [
      `Tugaskan kru "${crewName ?? "-"}" (${str(args.role) ?? "-"}) ke booking ${booking.nama_klien}:`,
      conflicts.length > 0
        ? `- PERINGATAN: kru ini sudah ditugaskan di ${conflicts.length} booking lain dengan tanggal bersinggungan.`
        : "- Tidak ada bentrok jadwal yang terdeteksi.",
    ].join("\n");
  } else if (toolName === "add_equipment") {
    description = [
      "Tambah alat/perkakas Production baru:",
      `- Nama: ${str(args.name) ?? "-"}`,
      `- Kategori: ${str(args.kategori) ?? "-"} | Kondisi: ${str(args.kondisi) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "update_equipment") {
    const equipmentId = str(args.equipmentId);
    const { data: equipment } = equipmentId
      ? await supabase.from("production_equipment").select("name").eq("id", equipmentId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!equipment) return { success: false, error: "Alat tidak ditemukan. Cari dulu ID yang benar." };
    description = [`Ubah data alat "${equipment.name}":`, "- Field yang tidak disebut tetap memakai nilai lama."].join("\n");
  } else if (toolName === "add_equipment_usage") {
    description = [
      "Catat pemakaian alat Production:",
      `- Alat: ${str(args.equipmentName) ?? str(args.equipmentId) ?? "-"}`,
      `- Dipakai oleh: ${str(args.digunakanOleh) ?? "-"}`,
      `- Tanggal pinjam: ${str(args.tanggalPinjam) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "mark_equipment_usage_returned") {
    description = `Tandai pemakaian alat (ID: ${str(args.usageId) ?? "-"}) sudah dikembalikan.`;
  } else if (toolName === "add_crew_piece_payment") {
    description = [
      "Catat upah borongan kru Production:",
      `- Pekerjaan: ${str(args.deskripsiPekerjaan) ?? "-"}`,
      `- ${args.jumlahUnit ?? "-"} unit x ${args.ratePerUnit !== undefined ? rupiah(args.ratePerUnit) : "-"}`,
    ].join("\n");
  } else if (toolName === "update_crew_piece_payment_status") {
    const paymentId = str(args.paymentId);
    const { data: payment } = paymentId
      ? await supabase
          .from("production_crew_piece_payments")
          .select("deskripsi_pekerjaan, status")
          .eq("id", paymentId)
          .maybeSingle<{ deskripsi_pekerjaan: string; status: string }>()
      : { data: null };
    if (!payment) return { success: false, error: "Upah borongan tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Ubah status upah borongan "${payment.deskripsi_pekerjaan}":`,
      `- Status: ${payment.status} → ${args.status}`,
    ].join("\n");
  } else if (toolName === "add_project_crew") {
    description = [
      "Tugaskan kru baru ke proyek booth Production:",
      `- Proyek: ${str(args.projectName) ?? str(args.projectId) ?? "-"}`,
      `- Nama: ${str(args.nama) ?? "-"} (${str(args.peran) ?? "-"})`,
    ].join("\n");
  } else if (toolName === "add_magnative_project") {
    description = [
      "Tambah proyek Magnativ baru:",
      `- Klien: ${str(args.clientName) ?? str(args.clientId) ?? "-"}`,
      `- Nama: ${str(args.name) ?? "-"}`,
      `- Tipe: ${str(args.type) ?? "-"}`,
      `- Periode: ${str(args.tanggalMulai) ?? "-"} s/d ${str(args.tanggalSelesai) ?? "-"}`,
      `- Budget: ${rupiah(args.budget)}`,
      `- Status awal: ${str(args.status) ?? "Pitching"}`,
    ].join("\n");
  } else if (toolName === "update_magnative_project") {
    const magProjectId = str(args.projectId);
    const { data: magProject } = magProjectId
      ? await supabase.from("magnative_projects").select("name").eq("id", magProjectId).maybeSingle<{ name: string }>()
      : { data: null };
    const magProjectLabel = magProject?.name ?? str(args.projectName) ?? magProjectId ?? "-";
    description = [
      `Ubah data proyek Magnativ "${magProjectLabel}":`,
      str(args.name) !== undefined ? `- Nama baru: ${str(args.name)}` : null,
      str(args.type) !== undefined ? `- Tipe baru: ${str(args.type)}` : null,
      args.budget !== undefined ? `- Budget baru: ${rupiah(args.budget)}` : null,
      str(args.status) !== undefined ? `- Status baru: ${str(args.status)}` : null,
      str(args.statusPembayaran) !== undefined ? `- Status pembayaran baru: ${str(args.statusPembayaran)}` : null,
      str(args.alasanKalah) !== undefined ? `- Alasan: ${str(args.alasanKalah)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "add_project_cost") {
    description = [
      "Catat biaya proyek Magnativ:",
      `- Proyek: ${str(args.projectName) ?? str(args.projectId) ?? "-"}`,
      `- Deskripsi: ${str(args.description) ?? "-"}`,
      `- Jumlah: ${rupiah(args.amount)}`,
      `- Kategori: ${str(args.category) ?? "-"}`,
      `- Metode bayar: ${str(args.paymentMethod) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "update_project_cost") {
    const costId = str(args.costId);
    const { data: cost } = costId
      ? await supabase.from("event_expenses").select("notes, amount").eq("id", costId).maybeSingle<{ notes: string | null; amount: number }>()
      : { data: null };
    description = [
      `Ubah biaya proyek "${cost?.notes ?? costId ?? "-"}":`,
      str(args.description) !== undefined ? `- Deskripsi baru: ${str(args.description)}` : null,
      args.amount !== undefined ? `- Jumlah baru: ${rupiah(args.amount)}` : `- Jumlah sekarang: ${cost ? rupiah(cost.amount) : "-"}`,
      str(args.category) !== undefined ? `- Kategori baru: ${str(args.category)}` : null,
      str(args.paymentMethod) !== undefined ? `- Metode bayar baru: ${str(args.paymentMethod)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "add_content_post") {
    description = [
      "Jadwalkan konten baru:",
      `- Klien: ${str(args.clientName) ?? str(args.clientId) ?? "-"}`,
      `- Judul: ${str(args.title) ?? "-"}`,
      `- Platform: ${str(args.platform) ?? "-"}`,
      `- Tanggal posting: ${str(args.tanggalPosting) ?? "-"}`,
      `- Status awal: ${str(args.status) ?? "Draft"}`,
    ].join("\n");
  } else if (toolName === "update_content_post") {
    const updPostId = str(args.postId);
    const { data: updPost } = updPostId
      ? await supabase.from("magnative_content_posts").select("title").eq("id", updPostId).maybeSingle<{ title: string }>()
      : { data: null };
    description = [
      `Ubah konten "${updPost?.title ?? updPostId ?? "-"}":`,
      str(args.title) !== undefined ? `- Judul baru: ${str(args.title)}` : null,
      str(args.platform) !== undefined ? `- Platform baru: ${str(args.platform)}` : null,
      str(args.tanggalPosting) !== undefined ? `- Tanggal posting baru: ${str(args.tanggalPosting)}` : null,
      str(args.status) !== undefined ? `- Status baru: ${str(args.status)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "update_content_status") {
    const statusPostId = str(args.postId);
    const { data: statusPost } = statusPostId
      ? await supabase.from("magnative_content_posts").select("title, status").eq("id", statusPostId).maybeSingle<{ title: string; status: string }>()
      : { data: null };
    if (!statusPost) return { success: false, error: "Konten tidak ditemukan. Cari dulu ID konten yang benar." };
    description = [`Ubah status konten "${statusPost.title}":`, `- Status: ${statusPost.status} → ${args.status}`].join("\n");
  } else if (toolName === "add_content_request") {
    description = [
      "Catat permintaan konten baru:",
      `- Klien: ${str(args.clientName) ?? str(args.clientId) ?? "-"}`,
      `- Judul: ${str(args.title) ?? "-"}`,
      `- Deskripsi: ${str(args.description) ?? "-"}`,
      `- Prioritas: ${str(args.priority) ?? "Sedang"}`,
      `- Deadline: ${str(args.deadline) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "update_content_request_status") {
    const contentReqId = str(args.requestId);
    const { data: contentReq } = contentReqId
      ? await supabase.from("magnative_content_requests").select("title, status").eq("id", contentReqId).maybeSingle<{ title: string; status: string }>()
      : { data: null };
    if (!contentReq) return { success: false, error: "Permintaan konten tidak ditemukan. Cari dulu ID yang benar." };
    description = [`Ubah status permintaan konten "${contentReq.title}":`, `- Status: ${contentReq.status} → ${args.status}`].join("\n");
  } else if (toolName === "add_project_vendor") {
    description = [
      "Kaitkan vendor ke proyek Magnativ:",
      `- Proyek: ${str(args.projectName) ?? str(args.projectId) ?? "-"}`,
      `- Vendor: ${str(args.vendorName) ?? str(args.vendorId) ?? "-"}`,
      `- Keterangan: ${str(args.keterangan) ?? "-"}`,
      `- Estimasi biaya: ${args.biayaEstimasi !== undefined ? rupiah(args.biayaEstimasi) : "-"}`,
    ].join("\n");
  } else if (toolName === "update_project_vendor") {
    description = [
      "Ubah kaitan vendor-proyek Magnativ:",
      `- ID kaitan: ${str(args.projectVendorId) ?? "-"}`,
      str(args.vendorName) !== undefined ? `- Vendor baru: ${str(args.vendorName)}` : null,
      str(args.keterangan) !== undefined ? `- Keterangan baru: ${str(args.keterangan)}` : null,
      args.biayaEstimasi !== undefined ? `- Estimasi biaya baru: ${rupiah(args.biayaEstimasi)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "update_project_task") {
    const updTaskId = str(args.taskId);
    const { data: updTask } = updTaskId
      ? await supabase.from("magnative_project_tasks").select("title").eq("id", updTaskId).maybeSingle<{ title: string }>()
      : { data: null };
    description = [
      `Ubah task "${updTask?.title ?? updTaskId ?? "-"}":`,
      str(args.title) !== undefined ? `- Judul baru: ${str(args.title)}` : null,
      str(args.status) !== undefined ? `- Status baru: ${str(args.status)}` : null,
      str(args.dueDate) !== undefined ? `- Tenggat baru: ${str(args.dueDate)}` : null,
      str(args.pic) !== undefined ? `- PIC baru: ${str(args.pic)}` : null,
      args.biayaEstimasi !== undefined ? `- Estimasi biaya baru: ${rupiah(args.biayaEstimasi)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "update_project_pipeline_stage") {
    description = [
      "Ubah tahap pipeline proyek:",
      `- Proyek: ${str(args.projectName) ?? str(args.projectId) ?? "-"}`,
      `- Tahap baru: ${str(args.stage) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "add_asset_comment") {
    description = [
      "Tambah komentar pada aset kreatif:",
      `- Aset: ${str(args.assetTitle) ?? str(args.assetId) ?? "-"}`,
      `- Komentar: ${str(args.commentText) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "set_asset_comment_resolved") {
    description = [
      "Tandai komentar aset kreatif:",
      `- ID komentar: ${str(args.commentId) ?? "-"}`,
      `- Status: ${args.isResolved === false ? "Belum selesai" : "Selesai"}`,
    ].join("\n");
  } else if (toolName === "cancel_purchase_order") {
    const cancelPoId = str(args.poId);
    const { data: cancelPo } = cancelPoId
      ? await supabase
          .from("production_purchase_orders")
          .select("supplier_name, status")
          .eq("id", cancelPoId)
          .maybeSingle<{ supplier_name: string; status: string }>()
      : { data: null };
    if (!cancelPo) return { success: false, error: "Purchase order tidak ditemukan. Cari dulu ID PO yang benar." };
    if (cancelPo.status !== "Dipesan") return { success: false, error: `PO ini sudah berstatus "${cancelPo.status}", tidak bisa dibatalkan.` };
    description = ["Batalkan purchase order:", `- Supplier: ${cancelPo.supplier_name}`, `- Status sekarang: ${cancelPo.status} → Dibatalkan`].join(
      "\n"
    );
  } else if (toolName === "decide_capital_request") {
    const decideReqId = str(args.requestId);
    const { data: decideReq } = decideReqId
      ? await supabase
          .from("capital_requests")
          .select("event_name, status")
          .eq("id", decideReqId)
          .maybeSingle<{ event_name: string; status: string }>()
      : { data: null };
    if (!decideReq) return { success: false, error: "Pengajuan modal tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Putuskan pengajuan modal "${decideReq.event_name}":`,
      `- Status: ${decideReq.status} → ${args.status}`,
      str(args.note) !== undefined ? `- Catatan: ${str(args.note)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "update_event_expense") {
    const expId = str(args.expenseId);
    const { data: exp } = expId
      ? await supabase
          .from("event_expenses")
          .select("notes, category, amount")
          .eq("id", expId)
          .maybeSingle<{ notes: string | null; category: string; amount: number }>()
      : { data: null };
    description = [
      `Ubah pengeluaran "${exp?.notes ?? exp?.category ?? expId ?? "-"}":`,
      str(args.category) !== undefined ? `- Kategori baru: ${str(args.category)}` : null,
      args.amount !== undefined ? `- Jumlah baru: ${rupiah(args.amount)}` : `- Jumlah sekarang: ${exp ? rupiah(exp.amount) : "-"}`,
      str(args.paymentMethod) !== undefined ? `- Metode bayar baru: ${str(args.paymentMethod)}` : null,
      str(args.reimbursementStatus) !== undefined ? `- Status penggantian baru: ${str(args.reimbursementStatus)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "add_invoice") {
    const items = Array.isArray(args.items) ? (args.items as Args[]) : [];
    const itemsTotal = items.reduce((sum, it) => sum + (num(it.qty) ?? 0) * (num(it.unitPrice) ?? 0), 0);
    description = [
      "Buat invoice baru:",
      `- Divisi: ${str(args.division) ?? "-"}`,
      `- Klien: ${str(args.clientName) ?? "-"}`,
      `- Jumlah item: ${items.length}`,
      `- Estimasi subtotal: ${rupiah(itemsTotal)}`,
      args.shippingCost !== undefined ? `- Ongkos kirim: ${rupiah(args.shippingCost)}` : null,
      args.depositAmount !== undefined ? `- Deposit: ${rupiah(args.depositAmount)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "update_invoice") {
    const updInvId = str(args.invoiceId);
    const { data: updInv } = updInvId
      ? await supabase
          .from("invoices")
          .select("invoice_number, client_name")
          .eq("id", updInvId)
          .maybeSingle<{ invoice_number: string; client_name: string }>()
      : { data: null };
    if (!updInv) return { success: false, error: "Invoice tidak ditemukan. Cari dulu ID yang benar." };
    const updItems = Array.isArray(args.items) ? (args.items as Args[]) : undefined;
    description = [
      `Ubah invoice "${updInv.invoice_number}" (klien: ${updInv.client_name}):`,
      str(args.clientName) !== undefined ? `- Klien baru: ${str(args.clientName)}` : null,
      updItems ? `- Jumlah item baru: ${updItems.length}` : null,
      args.shippingCost !== undefined ? `- Ongkos kirim baru: ${rupiah(args.shippingCost)}` : null,
      args.depositAmount !== undefined ? `- Deposit baru: ${rupiah(args.depositAmount)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "send_invoice_whatsapp") {
    const sendInvId = str(args.invoiceId);
    const { data: sendInv } = sendInvId
      ? await supabase
          .from("invoices")
          .select("invoice_number, client_name, client_phone")
          .eq("id", sendInvId)
          .maybeSingle<{ invoice_number: string; client_name: string; client_phone: string | null }>()
      : { data: null };
    if (!sendInv) return { success: false, error: "Invoice tidak ditemukan. Cari dulu ID yang benar." };
    if (!sendInv.client_phone) return { success: false, error: "Klien ini belum punya nomor WhatsApp yang tercatat." };
    description = [
      `Kirim invoice "${sendInv.invoice_number}" ke WhatsApp:`,
      `- Klien: ${sendInv.client_name}`,
      `- Nomor WA: ${sendInv.client_phone}`,
    ].join("\n");
  } else if (toolName === "add_product") {
    description = [
      "Tambah produk baru:",
      `- Nama: ${str(args.name) ?? "-"}`,
      `- Divisi: ${Array.isArray(args.divisions) ? (args.divisions as unknown[]).join(", ") : "-"}`,
      str(args.category) !== undefined ? `- Kategori: ${str(args.category)}` : null,
      args.price !== undefined ? `- Harga: ${rupiah(args.price)}` : null,
      args.stock !== undefined ? `- Stok: ${num(args.stock)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "update_product") {
    const updProdId = str(args.productId);
    const { data: updProd } = updProdId
      ? await supabase.from("products").select("name").eq("id", updProdId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!updProd) return { success: false, error: "Produk tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Ubah produk "${updProd.name}":`,
      str(args.name) !== undefined ? `- Nama baru: ${str(args.name)}` : null,
      str(args.category) !== undefined ? `- Kategori baru: ${str(args.category)}` : null,
      args.price !== undefined ? `- Harga baru: ${rupiah(args.price)}` : null,
      args.stock !== undefined ? `- Stok baru: ${num(args.stock)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "add_warehouse") {
    description = [`Tambah gudang baru:`, `- Nama: ${str(args.nama) ?? "-"}`, str(args.alamat) !== undefined ? `- Alamat: ${str(args.alamat)}` : null]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "update_warehouse") {
    const updWhId = str(args.warehouseId);
    const { data: updWh } = updWhId
      ? await supabase.from("magnarent_warehouses").select("nama").eq("id", updWhId).maybeSingle<{ nama: string }>()
      : { data: null };
    if (!updWh) return { success: false, error: "Gudang tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Ubah gudang "${updWh.nama}":`,
      str(args.nama) !== undefined ? `- Nama baru: ${str(args.nama)}` : null,
      str(args.alamat) !== undefined ? `- Alamat baru: ${str(args.alamat)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "update_subrent_status") {
    const subrentId = str(args.subrentId);
    const { data: subrent } = subrentId
      ? await supabase
          .from("magnarent_subrent_records")
          .select("vendor_name, status")
          .eq("id", subrentId)
          .maybeSingle<{ vendor_name: string; status: string }>()
      : { data: null };
    if (!subrent) return { success: false, error: "Catatan subrent tidak ditemukan. Cari dulu ID yang benar." };
    description = [`Ubah status subrent vendor "${subrent.vendor_name}":`, `- Status: ${subrent.status} → ${str(args.status)}`].join("\n");
  } else if (toolName === "bulk_scan_update_unit_status") {
    const codes = Array.isArray(args.codes) ? (args.codes as unknown[]) : [];
    description = [`Ubah status massal via scan:`, `- Jumlah kode: ${codes.length}`, `- Status baru: ${str(args.status) ?? "-"}`].join("\n");
  } else if (toolName === "update_bom_template") {
    const bomId = str(args.templateId);
    const { data: bom } = bomId
      ? await supabase.from("production_bom_templates").select("name").eq("id", bomId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!bom) return { success: false, error: "Template BOM tidak ditemukan. Cari dulu ID yang benar." };
    const bomItems = Array.isArray(args.items) ? (args.items as Args[]) : undefined;
    description = [
      `Ubah template BOM "${bom.name}":`,
      str(args.name) !== undefined ? `- Nama baru: ${str(args.name)}` : null,
      bomItems ? `- Jumlah item baru: ${bomItems.length}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "transfer_material_stock") {
    description = [
      "Transfer stok material:",
      `- Material: ${str(args.materialName) ?? str(args.materialId) ?? "-"}`,
      `- Jumlah: ${num(args.qty) ?? "-"}`,
      `- Tujuan: ${str(args.toLocation) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "add_journal_entry") {
    const lines = Array.isArray(args.lines) ? (args.lines as Args[]) : [];
    const totalDebit = lines.reduce((sum, l) => sum + (num(l.debit) ?? 0), 0);
    description = [
      "Simpan jurnal manual:",
      `- Tanggal: ${str(args.entryDate) ?? "-"}`,
      `- Keterangan: ${str(args.description) ?? "-"}`,
      `- Jumlah baris: ${lines.length}`,
      `- Total debit: ${rupiah(totalDebit)}`,
    ].join("\n");
  } else if (toolName === "add_account") {
    description = [
      "Tambah akun baru:",
      `- Kode: ${str(args.code) ?? "-"}`,
      `- Nama: ${str(args.name) ?? "-"}`,
      `- Tipe: ${str(args.type) ?? "-"}`,
      `- Saldo normal: ${str(args.normalBalance) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "set_account_active") {
    const accId = str(args.accountId);
    const { data: acc } = accId
      ? await supabase
          .from("chart_of_accounts")
          .select("account_code, account_name, is_active")
          .eq("id", accId)
          .maybeSingle<{ account_code: string; account_name: string; is_active: boolean }>()
      : { data: null };
    if (!acc) return { success: false, error: "Akun tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Ubah status akun "${acc.account_code} — ${acc.account_name}":`,
      `- Status: ${acc.is_active ? "Aktif" : "Nonaktif"} → ${args.isActive ? "Aktif" : "Nonaktif"}`,
    ].join("\n");
  } else if (toolName === "create_portal_link") {
    description = [
      "Buat link portal baru:",
      `- Modul: ${str(args.module) ?? "-"}`,
      str(args.clientName) !== undefined ? `- Klien: ${str(args.clientName)}` : null,
      args.expiresInDays !== undefined ? `- Masa berlaku: ${num(args.expiresInDays)} hari` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "revoke_portal_link") {
    description = [`Cabut link portal:`, `- ID link: ${str(args.linkId) ?? "-"}`, `- Modul: ${str(args.module) ?? "-"}`].join("\n");
  } else if (toolName === "mark_notification_read") {
    description = `Tandai notifikasi sudah dibaca (ID: ${str(args.notificationId) ?? "-"}).`;
  } else if (toolName === "update_booking") {
    const updBookingId = str(args.bookingId);
    const { data: updBooking } = updBookingId
      ? await supabase.from("magnarent_bookings").select("nama_klien").eq("id", updBookingId).maybeSingle<{ nama_klien: string }>()
      : { data: null };
    if (!updBooking) return { success: false, error: "Booking tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Ubah booking "${updBooking.nama_klien}":`,
      str(args.namaKlien) !== undefined ? `- Klien baru: ${str(args.namaKlien)}` : null,
      str(args.tanggalMulai) !== undefined || str(args.tanggalSelesai) !== undefined
        ? `- Tanggal baru: ${str(args.tanggalMulai) ?? "-"} s/d ${str(args.tanggalSelesai) ?? "-"}`
        : null,
      args.jumlahUnit !== undefined ? `- Jumlah unit baru: ${num(args.jumlahUnit)}` : null,
      str(args.statusPembayaran) !== undefined ? `- Status pembayaran baru: ${str(args.statusPembayaran)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "add_production_project") {
    const projMaterials = Array.isArray(args.materials) ? (args.materials as Args[]) : [];
    description = [
      "Buat proyek booth baru:",
      `- Nama: ${str(args.name) ?? "-"}`,
      `- Klien: ${str(args.namaKlien) ?? "-"}`,
      `- Lokasi: ${str(args.lokasiAcara) ?? "-"}`,
      `- Budget: ${rupiah(args.budget)}`,
      `- Jumlah alokasi material: ${projMaterials.length}`,
    ].join("\n");
  } else if (toolName === "update_production_project") {
    const updProjId = str(args.projectId);
    const { data: updProj } = updProjId
      ? await supabase.from("production_booth_projects").select("name").eq("id", updProjId).maybeSingle<{ name: string }>()
      : { data: null };
    if (!updProj) return { success: false, error: "Proyek booth tidak ditemukan. Cari dulu ID yang benar." };
    const updProjMaterials = Array.isArray(args.materials) ? (args.materials as Args[]) : undefined;
    description = [
      `Ubah proyek booth "${updProj.name}":`,
      str(args.name) !== undefined ? `- Nama baru: ${str(args.name)}` : null,
      str(args.status) !== undefined ? `- Tahapan baru: ${str(args.status)}` : null,
      args.budget !== undefined ? `- Budget baru: ${rupiah(args.budget)}` : null,
      updProjMaterials ? `- Jumlah alokasi material baru: ${updProjMaterials.length}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "update_portfolio_folder") {
    const folderId = str(args.folderId);
    const { data: folder } = folderId
      ? await supabase.from("magnative_portfolio_folders").select("title").eq("id", folderId).maybeSingle<{ title: string }>()
      : { data: null };
    if (!folder) return { success: false, error: "Folder portofolio tidak ditemukan. Cari dulu ID yang benar." };
    description = [
      `Ubah folder portofolio "${folder.title}":`,
      str(args.title) !== undefined ? `- Judul baru: ${str(args.title)}` : null,
      str(args.caption) !== undefined ? `- Caption baru: ${str(args.caption)}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  } else if (toolName === "send_chat_message") {
    const chatMsg = str(args.message) ?? "";
    description = [
      `Kirim pesan ke ruang chat "${str(args.room) ?? "-"}":`,
      `"${chatMsg.length > 200 ? `${chatMsg.slice(0, 197)}...` : chatMsg}"`,
    ].join("\n");
  } else if (toolName === "mark_all_notifications_read") {
    description = "Tandai semua notifikasi yang belum dibaca sebagai sudah dibaca.";
  } else if (toolName === "broadcast_notification") {
    const broadcastDivisions = Array.isArray(args.divisions) ? (args.divisions as unknown[]) : [];
    description = [
      "Kirim notifikasi broadcast:",
      `- Tujuan: ${broadcastDivisions.join(", ") || "-"}`,
      `- Judul: ${str(args.title) ?? "-"}`,
      `- Isi: ${str(args.body) ?? "-"}`,
    ].join("\n");
  } else if (toolName === "update_my_nickname") {
    description = `Ganti nama panggilan jadi "@${str(args.nickname) ?? "-"}".`;
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
