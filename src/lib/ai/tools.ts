/**
 * Tool definitions untuk AI Assistant MagnaSuperApp.
 * Format sesuai OpenRouter/OpenAI function calling spec.
 */

import type { ToolDefinition, UserContext } from "./types";

/**
 * Query Tools - Read-only, aman dijalankan tanpa konfirmasi.
 * RLS Supabase otomatis membatasi data sesuai divisi user.
 */
export const QUERY_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_global",
      description: "Cari data di seluruh aplikasi (booking, inventaris, klien, proyek, material, event). Gunakan untuk mencari berdasarkan nama atau kata kunci.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Kata kunci pencarian (min 2 karakter)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bookings",
      description: "Ambil daftar booking Magnarent. Bisa difilter berdasarkan status, tanggal, atau nama klien.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["Menunggu", "Dikonfirmasi", "Selesai", "Dibatalkan"],
            description: "Filter status booking",
          },
          dateFrom: {
            type: "string",
            description: "Tanggal mulai filter (format: YYYY-MM-DD)",
          },
          dateTo: {
            type: "string",
            description: "Tanggal akhir filter (format: YYYY-MM-DD)",
          },
          clientName: {
            type: "string",
            description: "Filter nama klien (partial match)",
          },
          limit: {
            type: "number",
            description: "Jumlah maksimal hasil (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inventory",
      description: "Ambil daftar inventaris/alat Magnarent. Bisa difilter berdasarkan kategori atau lokasi.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filter kategori alat (contoh: Tenda, Sound System, Kursi)",
          },
          location: {
            type: "string",
            description: "Filter lokasi gudang",
          },
          searchName: {
            type: "string",
            description: "Cari berdasarkan nama alat",
          },
          limit: {
            type: "number",
            description: "Jumlah maksimal hasil (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_clients",
      description: "Ambil daftar klien Magnative. Bisa difilter berdasarkan industri atau status.",
      parameters: {
        type: "object",
        properties: {
          industry: {
            type: "string",
            description: "Filter industri klien",
          },
          status: {
            type: "string",
            enum: ["Prospek", "Aktif", "Selesai", "Tidak Lanjut"],
            description: "Filter status klien",
          },
          searchName: {
            type: "string",
            description: "Cari berdasarkan nama klien",
          },
          limit: {
            type: "number",
            description: "Jumlah maksimal hasil (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_projects",
      description: "Ambil daftar proyek (Magnative atau Production). Bisa difilter berdasarkan tipe, status, atau klien.",
      parameters: {
        type: "object",
        properties: {
          module: {
            type: "string",
            enum: ["magnative", "production"],
            description: "Modul proyek (magnative untuk proyek kreatif, production untuk booth)",
          },
          status: {
            type: "string",
            description:
              "Filter status proyek. Magnative: Pitching, Perencanaan, Berjalan, Selesai, Dibatalkan. Production: Desain, Produksi, Finishing, Instalasi, Selesai, Dibatalkan.",
          },
          clientName: {
            type: "string",
            description: "Filter nama klien",
          },
          limit: {
            type: "number",
            description: "Jumlah maksimal hasil (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_events",
      description: "Ambil daftar event beserta progress checklist. Bisa difilter berdasarkan status atau tanggal.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["Berjalan", "Selesai", "Dibatalkan"],
            description: "Filter status event",
          },
          searchName: {
            type: "string",
            description: "Cari berdasarkan nama event",
          },
          dateFrom: {
            type: "string",
            description: "Tanggal mulai filter (format: YYYY-MM-DD)",
          },
          dateTo: {
            type: "string",
            description: "Tanggal akhir filter (format: YYYY-MM-DD)",
          },
          limit: {
            type: "number",
            description: "Jumlah maksimal hasil (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_materials",
      description: "Ambil daftar material gudang Production. Bisa difilter berdasarkan kategori atau stok.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filter kategori material",
          },
          searchName: {
            type: "string",
            description: "Cari berdasarkan nama material",
          },
          lowStock: {
            type: "boolean",
            description: "Jika true, hanya tampilkan material di bawah stok minimum",
          },
          limit: {
            type: "number",
            description: "Jumlah maksimal hasil (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Cek ketersediaan alat Magnarent untuk rentang tanggal tertentu.",
      parameters: {
        type: "object",
        properties: {
          itemId: {
            type: "string",
            description: "ID alat yang dicek",
          },
          itemName: {
            type: "string",
            description: "Nama alat (jika tidak tahu ID, gunakan ini untuk mencari)",
          },
          dateFrom: {
            type: "string",
            description: "Tanggal mulai (format: YYYY-MM-DD)",
          },
          dateTo: {
            type: "string",
            description: "Tanggal selesai (format: YYYY-MM-DD)",
          },
        },
        required: ["dateFrom", "dateTo"],
      },
    },
  },
];

/**
 * Action Tools - Mutations, HARUS konfirmasi user sebelum eksekusi.
 */
export const ACTION_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_booking",
      description: "Buat booking baru di Magnarent. HARUS konfirmasi dengan user sebelum membuat.",
      parameters: {
        type: "object",
        properties: {
          itemId: {
            type: "string",
            description: "ID alat yang akan dibooking (dari get_inventory/search_global)",
          },
          itemName: {
            type: "string",
            description: "Nama alat (untuk ringkasan konfirmasi)",
          },
          namaKlien: {
            type: "string",
            description: "Nama klien/penyewa",
          },
          teleponKlien: {
            type: "string",
            description: "Nomor telepon klien",
          },
          tanggalMulai: {
            type: "string",
            description: "Tanggal mulai sewa (format: YYYY-MM-DD)",
          },
          tanggalSelesai: {
            type: "string",
            description: "Tanggal selesai sewa (format: YYYY-MM-DD)",
          },
          jumlahUnit: {
            type: "number",
            description: "Jumlah unit yang disewa",
          },
          statusPembayaran: {
            type: "string",
            enum: ["Belum Bayar", "DP", "Lunas"],
            description: "Status pembayaran",
          },
          jumlahDp: {
            type: "number",
            description: "Jumlah DP (jika status DP)",
          },
          catatan: {
            type: "string",
            description: "Catatan tambahan",
          },
        },
        required: ["itemId", "namaKlien", "tanggalMulai", "tanggalSelesai", "jumlahUnit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_booking_status",
      description: "Ubah status booking Magnarent. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          bookingId: {
            type: "string",
            description: "ID booking yang akan diubah (dari get_bookings)",
          },
          namaKlien: {
            type: "string",
            description: "Nama klien booking (untuk ringkasan konfirmasi)",
          },
          status: {
            type: "string",
            enum: ["Menunggu", "Dikonfirmasi", "Selesai", "Dibatalkan"],
            description: "Status baru",
          },
        },
        required: ["bookingId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_event_expense",
      description:
        "Catat pengeluaran (Realisasi Event) — untuk event, booking, proyek, booth, atau operasional umum. Cukup kategori & jumlah; tanggal, PIC, dan metode bayar punya default. Sistem otomatis meminta konfirmasi user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["Sewa Venue", "Dekorasi & Material", "Transportasi", "Konsumsi", "Talent / Vendor", "Percetakan", "Operasional Kantor", "Lain-lain"],
            description: "Kategori pengeluaran",
          },
          amount: {
            type: "number",
            description: "Jumlah pengeluaran (Rupiah)",
          },
          sourceType: {
            type: "string",
            enum: ["event_tracking", "magnarent_booking", "magnative_project", "production_booth", "umum"],
            description:
              "Terkait apa: event (event_tracking), booking Magnarent, proyek Magnativ, booth Production, atau 'umum' (operasional tanpa event/proyek). Default: umum",
          },
          sourceId: {
            type: "string",
            description: "ID event/booking/proyek terkait (wajib kalau sourceType bukan 'umum'; cari dulu lewat query tool)",
          },
          sourceName: {
            type: "string",
            description: "Nama event/booking/proyek terkait (untuk ringkasan konfirmasi)",
          },
          division: {
            type: "string",
            enum: ["magnarent", "magnative", "production", "finance"],
            description: "Divisi pemilik pengeluaran 'umum' (default: divisi user, atau finance)",
          },
          expenseDate: {
            type: "string",
            description: "Tanggal pengeluaran (YYYY-MM-DD, default: hari ini)",
          },
          picName: {
            type: "string",
            description: "Nama PIC yang mengeluarkan dana (default: user yang sedang chat)",
          },
          paymentMethod: {
            type: "string",
            description: "Metode pembayaran, mis. Cash, Transfer BCA, Qris (default: Cash)",
          },
          reimbursementStatus: {
            type: "string",
            enum: ["Dibayar Perusahaan", "Belum Diganti", "Sudah Diganti", "Tidak Perlu"],
            description:
              "Siapa yang membayar. Dibayar Perusahaan = langsung dari kas/rekening perusahaan (default); Belum Diganti = PIC menalangi & belum diganti; Sudah Diganti = PIC menalangi & sudah diganti; Tidak Perlu = PIC bayar pribadi & tidak mengklaim. Tanyakan kalau user menyebut 'pakai uang pribadi' / 'nalangin'.",
          },
          notes: {
            type: "string",
            description: "Catatan/keterangan tambahan",
          },
        },
        required: ["category", "amount"],
      },
    },
  },
];

/**
 * Semua tools yang tersedia untuk AI.
 */
export const AI_TOOLS: ToolDefinition[] = [...QUERY_TOOLS, ...ACTION_TOOLS];

/**
 * Tool yang boleh ditawarkan ke AI untuk user ini — tool di luar akses
 * divisinya tidak dikirim sama sekali, supaya AI tidak mencoba memanggilnya.
 */
export function getToolsForUser(ctx: UserContext): ToolDefinition[] {
  const allowed: Record<string, boolean> = {
    search_global: true,
    get_bookings: ctx.canAccessMagnarent,
    get_inventory: ctx.canAccessMagnarent,
    check_availability: ctx.canAccessMagnarent,
    create_booking: ctx.canAccessMagnarent,
    update_booking_status: ctx.canAccessMagnarent,
    get_clients: ctx.canAccessMagnative,
    get_projects: ctx.canAccessMagnative || ctx.canAccessProduction,
    get_materials: ctx.canAccessProduction,
    get_events: ctx.canAccessEvents,
    create_event_expense: ctx.canAccessExpenses,
  };
  return AI_TOOLS.filter((t) => allowed[t.function.name]);
}

/**
 * Cek apakah tool adalah action (butuh konfirmasi).
 */
export function isActionTool(toolName: string): boolean {
  return ACTION_TOOLS.some((t) => t.function.name === toolName);
}

/**
 * Get tools filtered by agent specialty.
 * NOVA (all) gets all tools, specialized agents get filtered sets.
 */
export function getToolsForAgent(agentId: string): ToolDefinition[] {
  // Tool mappings per specialty
  const MAGNARENT_TOOLS = ["search_global", "get_bookings", "get_inventory", "check_availability", "create_booking", "update_booking_status"];
  const MAGNATIVE_TOOLS = ["search_global", "get_clients", "get_projects"];
  const PRODUCTION_TOOLS = ["search_global", "get_materials", "get_projects"];
  const FINANCE_TOOLS = ["search_global", "create_event_expense"];
  const EVENT_TOOLS = ["search_global", "get_events", "update_checklist_progress"];

  const filterByNames = (names: string[]) =>
    AI_TOOLS.filter((t) => names.includes(t.function.name));

  switch (agentId) {
    case "reno":
      return filterByNames(MAGNARENT_TOOLS);
    case "crea":
      return filterByNames(MAGNATIVE_TOOLS);
    case "fabr":
      return filterByNames([...PRODUCTION_TOOLS, ...EVENT_TOOLS]);
    case "finn":
      return filterByNames(FINANCE_TOOLS);
    case "nova":
    default:
      return AI_TOOLS; // NOVA gets all tools
  }
}
