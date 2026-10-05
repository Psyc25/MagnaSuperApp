/**
 * Tool handlers untuk AI Assistant MagnaSuperApp.
 * Mengeksekusi query dan action tools dengan keamanan RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolResult, UserContext } from "./types";
import { isActionTool } from "./tools";

type Args = Record<string, unknown>;

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
  // Untuk action tools, cek apakah sudah dikonfirmasi
  if (isActionTool(toolName) && !confirmed) {
    return buildConfirmationResponse(toolName, args);
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

      // Action tools (sudah dikonfirmasi)
      case "create_booking":
        return await handleCreateBooking(supabase, ctx, args);
      case "update_booking_status":
        return await handleUpdateBookingStatus(supabase, ctx, args);
      case "create_event_expense":
        return await handleCreateEventExpense(supabase, ctx, args);
      case "update_checklist_progress":
        return await handleUpdateChecklistProgress(supabase, ctx, args);

      default:
        return { success: false, error: `Tool tidak dikenal: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan";
    return { success: false, error: message };
  }
}

// ============================================================================
// QUERY HANDLERS
// ============================================================================

async function handleSearchGlobal(supabase: SupabaseClient, args: Args): Promise<ToolResult> {
  const query = String(args.query || "").trim();
  if (query.length < 2) {
    return { success: false, error: "Kata kunci minimal 2 karakter" };
  }

  const { data, error } = await supabase.rpc("global_search", { q: query });

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      query,
      results: data || [],
      count: (data || []).length,
    },
  };
}

async function handleGetBookings(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses ke Magnarent" };
  }

  let query = supabase
    .from("magnarent_bookings")
    .select("id, nama_klien, telepon_klien, tanggal_mulai, tanggal_selesai, jumlah_unit, status, status_pembayaran, item:magnarent_inventory(id, nama, kategori)")
    .order("tanggal_mulai", { ascending: true });

  if (args.status) {
    query = query.eq("status", args.status);
  }
  if (args.dateFrom) {
    query = query.gte("tanggal_mulai", args.dateFrom);
  }
  if (args.dateTo) {
    query = query.lte("tanggal_selesai", args.dateTo);
  }
  if (args.clientName) {
    query = query.ilike("nama_klien", `%${args.clientName}%`);
  }

  const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      bookings: data || [],
      count: (data || []).length,
    },
  };
}

async function handleGetInventory(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses ke Magnarent" };
  }

  let query = supabase
    .from("magnarent_inventory")
    .select("id, nama, kategori, lokasi, jumlah_total, harga_sewa_harian, satuan")
    .order("nama", { ascending: true });

  if (args.category) {
    query = query.ilike("kategori", `%${args.category}%`);
  }
  if (args.location) {
    query = query.ilike("lokasi", `%${args.location}%`);
  }

  const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      inventory: data || [],
      count: (data || []).length,
    },
  };
}

async function handleGetClients(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnative && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses ke Magnative" };
  }

  let query = supabase
    .from("magnative_clients")
    .select("id, nama, industri, nama_pic, telepon_pic, email_pic, status")
    .order("nama", { ascending: true });

  if (args.industry) {
    query = query.ilike("industri", `%${args.industry}%`);
  }
  if (args.status) {
    query = query.eq("status", args.status);
  }
  if (args.searchName) {
    query = query.ilike("nama", `%${args.searchName}%`);
  }

  const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      clients: data || [],
      count: (data || []).length,
    },
  };
}

async function handleGetProjects(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  const module = args.module as string | undefined;

  if (module === "magnative" && !ctx.canAccessMagnative && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses ke Magnative" };
  }
  if (module === "production" && !ctx.canAccessProduction && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses ke Production" };
  }

  const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;

  if (module === "production") {
    let query = supabase
      .from("production_booth_projects")
      .select("id, nama, klien, lokasi, tanggal_mulai, tanggal_selesai, status, budget")
      .order("tanggal_mulai", { ascending: false })
      .limit(limit);

    if (args.status) query = query.eq("status", args.status);
    if (args.clientName) query = query.ilike("klien", `%${args.clientName}%`);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    return { success: true, data: { projects: data || [], module: "production", count: (data || []).length } };
  }

  // Default: magnative
  let query = supabase
    .from("magnative_projects")
    .select("id, nama, tipe, tanggal_mulai, tanggal_selesai, status, budget, client:magnative_clients(id, nama)")
    .order("tanggal_mulai", { ascending: false })
    .limit(limit);

  if (args.status) query = query.eq("status", args.status);
  if (args.clientName) query = query.ilike("magnative_clients.nama", `%${args.clientName}%`);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  return { success: true, data: { projects: data || [], module: "magnative", count: (data || []).length } };
}

async function handleGetEvents(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessEvents && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses ke Events" };
  }

  let query = supabase
    .from("events")
    .select("id, nama, tanggal_mulai, tanggal_selesai, status, lokasi, event_type:event_types(nama)")
    .order("tanggal_mulai", { ascending: false });

  if (args.status) {
    query = query.eq("status", args.status);
  }
  if (args.dateFrom) {
    query = query.gte("tanggal_mulai", args.dateFrom);
  }
  if (args.dateTo) {
    query = query.lte("tanggal_selesai", args.dateTo);
  }

  const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      events: data || [],
      count: (data || []).length,
    },
  };
}

async function handleGetMaterials(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessProduction && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses ke Production" };
  }

  let query = supabase
    .from("production_materials")
    .select("id, nama, kategori, stok, stok_minimum, satuan, harga_satuan")
    .order("nama", { ascending: true });

  if (args.category) {
    query = query.ilike("kategori", `%${args.category}%`);
  }
  if (args.lowStock === true) {
    // Filter di client-side karena kita perlu compare stok < stok_minimum
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const lowStockItems = (data || []).filter((m: { stok: number; stok_minimum: number }) => m.stok < m.stok_minimum);
    return {
      success: true,
      data: {
        materials: lowStockItems,
        count: lowStockItems.length,
        lowStockOnly: true,
      },
    };
  }

  const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      materials: data || [],
      count: (data || []).length,
    },
  };
}

async function handleCheckAvailability(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses ke Magnarent" };
  }

  const dateFrom = args.dateFrom as string;
  const dateTo = args.dateTo as string;

  if (!dateFrom || !dateTo) {
    return { success: false, error: "Tanggal mulai dan selesai harus diisi" };
  }

  // Jika ada itemName tapi tidak itemId, cari dulu
  let itemId = args.itemId as string | undefined;
  if (!itemId && args.itemName) {
    const { data: items } = await supabase
      .from("magnarent_inventory")
      .select("id, nama")
      .ilike("nama", `%${args.itemName}%`)
      .limit(1);

    if (!items || items.length === 0) {
      return { success: false, error: `Alat "${args.itemName}" tidak ditemukan` };
    }
    itemId = items[0].id;
  }

  if (!itemId) {
    return { success: false, error: "ID atau nama alat harus diisi" };
  }

  // Get item info
  const { data: item } = await supabase
    .from("magnarent_inventory")
    .select("id, nama, jumlah_total")
    .eq("id", itemId)
    .single();

  if (!item) {
    return { success: false, error: "Alat tidak ditemukan" };
  }

  // Count booked units in date range
  const { data: bookings } = await supabase
    .from("magnarent_bookings")
    .select("jumlah_unit")
    .eq("item_id", itemId)
    .in("status", ["Menunggu", "Dikonfirmasi"])
    .or(`tanggal_mulai.lte.${dateTo},tanggal_selesai.gte.${dateFrom}`);

  const bookedUnits = (bookings || []).reduce((sum: number, b: { jumlah_unit: number }) => sum + b.jumlah_unit, 0);
  const availableUnits = item.jumlah_total - bookedUnits;

  return {
    success: true,
    data: {
      item: { id: item.id, nama: item.nama },
      dateRange: { from: dateFrom, to: dateTo },
      totalUnits: item.jumlah_total,
      bookedUnits,
      availableUnits,
      isAvailable: availableUnits > 0,
    },
  };
}

// ============================================================================
// ACTION HANDLERS (dijalankan setelah konfirmasi)
// ============================================================================

async function handleCreateBooking(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses untuk membuat booking" };
  }

  const { data, error } = await supabase
    .from("magnarent_bookings")
    .insert({
      item_id: args.itemId,
      nama_klien: args.namaKlien,
      telepon_klien: args.teleponKlien || null,
      tanggal_mulai: args.tanggalMulai,
      tanggal_selesai: args.tanggalSelesai,
      jumlah_unit: args.jumlahUnit,
      status: "Menunggu",
      status_pembayaran: args.statusPembayaran || "Belum Bayar",
      jumlah_dp: args.jumlahDp || null,
      catatan: args.catatan || null,
    })
    .select("id, nama_klien, tanggal_mulai, tanggal_selesai")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      message: "Booking berhasil dibuat",
      booking: data,
    },
  };
}

async function handleUpdateBookingStatus(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessMagnarent && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses untuk mengubah booking" };
  }

  const { data, error } = await supabase
    .from("magnarent_bookings")
    .update({ status: args.status })
    .eq("id", args.bookingId)
    .select("id, nama_klien, status")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      message: `Status booking berhasil diubah ke "${args.status}"`,
      booking: data,
    },
  };
}

async function handleCreateEventExpense(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessEvents && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses untuk mencatat pengeluaran" };
  }

  const { data, error } = await supabase
    .from("event_expenses")
    .insert({
      event_id: args.eventId,
      tanggal: args.tanggal,
      kategori: args.kategori,
      keterangan: args.keterangan,
      jumlah: args.jumlah,
      metode_bayar: args.metodeBayar || "Cash",
      user_id: ctx.userId,
    })
    .select("id, kategori, jumlah, keterangan")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      message: "Pengeluaran berhasil dicatat",
      expense: data,
    },
  };
}

async function handleUpdateChecklistProgress(supabase: SupabaseClient, ctx: UserContext, args: Args): Promise<ToolResult> {
  if (!ctx.canAccessEvents && ctx.division !== "all") {
    return { success: false, error: "Tidak memiliki akses untuk update checklist" };
  }

  const updateData: Record<string, unknown> = { status: args.status };
  if (args.picLapangan) updateData.pic_lapangan = args.picLapangan;
  if (args.picProduksi) updateData.pic_produksi = args.picProduksi;

  const { data, error } = await supabase
    .from("event_checklist_items")
    .update(updateData)
    .eq("id", args.checklistItemId)
    .eq("event_id", args.eventId)
    .select("id, nama, status")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      message: `Checklist berhasil diupdate ke "${args.status}"`,
      item: data,
    },
  };
}

// ============================================================================
// HELPER
// ============================================================================

function buildConfirmationResponse(toolName: string, args: Args): ToolResult {
  const descriptions: Record<string, (args: Args) => string> = {
    create_booking: (a) =>
      `Buat booking:\n- Klien: ${a.namaKlien}\n- Tanggal: ${a.tanggalMulai} s/d ${a.tanggalSelesai}\n- Unit: ${a.jumlahUnit}`,
    update_booking_status: (a) =>
      `Ubah status booking ${a.bookingId} menjadi "${a.status}"`,
    create_event_expense: (a) =>
      `Catat pengeluaran:\n- Kategori: ${a.kategori}\n- Jumlah: Rp ${Number(a.jumlah).toLocaleString("id-ID")}\n- Keterangan: ${a.keterangan}`,
    update_checklist_progress: (a) =>
      `Update checklist ${a.checklistItemId} ke status "${a.status}"`,
  };

  const descFn = descriptions[toolName];
  const description = descFn ? descFn(args) : `Jalankan ${toolName}`;

  return {
    success: true,
    requiresConfirmation: true,
    confirmationMessage: `${description}\n\nApakah data ini benar? Ketik 'Ya' untuk konfirmasi.`,
    pendingAction: {
      tool: toolName,
      args,
      description,
    },
  };
}
