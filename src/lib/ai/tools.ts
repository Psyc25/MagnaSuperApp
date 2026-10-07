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
  {
    type: "function",
    function: {
      name: "get_invoices",
      description: "Ambil daftar faktur/invoice beserta total, status, dan jatuh tempo. Pakai overdueOnly untuk faktur yang lewat jatuh tempo dan belum lunas (piutang terlambat).",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["Draft", "Terkirim", "Lunas"], description: "Filter status faktur" },
          overdueOnly: { type: "boolean", description: "Hanya faktur belum lunas yang sudah lewat jatuh tempo" },
          division: { type: "string", enum: ["magnarent", "magnative", "production"], description: "Filter divisi" },
          clientName: { type: "string", description: "Filter nama klien (partial match)" },
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_event_detail",
      description: "Detail lengkap satu event: progres checklist per fase, item yang belum selesai (termasuk yang lewat tenggat), total pengeluaran per kategori, faktur dari booking/proyek yang terkait, dan perkiraan laba. Cari dengan eventId atau nama event.",
      parameters: {
        type: "object",
        properties: {
          eventId: { type: "string", description: "ID event (dari get_events)" },
          searchName: { type: "string", description: "Nama event (partial match) kalau ID belum diketahui" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_capital_requests",
      description: "Ambil daftar pengajuan modal event: estimasi tagihan, estimasi modal, status keputusan investor, dan catatan investor.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["Menunggu", "Disetujui", "Ditolak"], description: "Filter status" },
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_purchase_orders",
      description: "Ambil daftar purchase order material Production: supplier, qty, harga, status, tanggal pesan & perkiraan datang.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["Dipesan", "Diterima", "Dibatalkan"], description: "Filter status PO" },
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expenses",
      description: "Rekap pengeluaran (Realisasi Event & operasional) dalam rentang tanggal: total, per kategori, per divisi, dan daftar reimbursement yang belum diganti.",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string", description: "Tanggal mulai (YYYY-MM-DD). Default: awal bulan ini" },
          dateTo: { type: "string", description: "Tanggal akhir (YYYY-MM-DD). Default: hari ini" },
          division: { type: "string", enum: ["magnarent", "magnative", "production", "finance", "event"], description: "Filter divisi" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_summary",
      description: "Ringkasan operasional hari ini (WIB) sesuai akses pengguna: booking keluar & kembali hari ini, event berjalan, faktur jatuh tempo & terlambat, material di bawah stok minimum, PO yang dijadwalkan datang, pengajuan modal yang menunggu.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_maintenance_logs",
      description: "Ambil riwayat servis/maintenance alat Magnarent. Bisa difilter per alat.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "ID alat (dari get_inventory/search_global)" },
          itemName: { type: "string", description: "Nama alat (partial match) kalau ID belum diketahui" },
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deliveries",
      description: "Ambil jadwal pengiriman/pengambilan alat Magnarent (sopir, jam, status). Bisa difilter status atau nama klien.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["Belum Dijadwalkan", "Dijadwalkan", "Selesai"], description: "Filter status penjadwalan" },
          clientName: { type: "string", description: "Filter nama klien booking (partial match)" },
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_tasks",
      description: "Ambil daftar task/sub-pekerjaan dalam proyek Magnativ (venue, dekorasi, izin, dst). Bisa difilter proyek atau status.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek (dari get_projects)" },
          projectName: { type: "string", description: "Nama proyek (partial match) kalau ID belum diketahui" },
          status: { type: "string", enum: ["Belum Mulai", "Berjalan", "Selesai"], description: "Filter status task" },
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_content_posts",
      description: "Ambil kalender konten/jadwal posting sosmed klien Magnativ. Bisa difilter status atau nama klien.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter status post (contoh: Draft, Review, Approved, Posted)" },
          clientName: { type: "string", description: "Filter nama klien (partial match)" },
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_equipment",
      description: "Ambil daftar alat/perkakas Production (bukan material habis pakai): alat berat, perkakas listrik/manual, beserta kondisinya.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["Alat Berat", "Perkakas Listrik", "Perkakas Manual", "Lainnya"], description: "Filter kategori alat" },
          condition: { type: "string", enum: ["Baik", "Perlu Servis", "Rusak"], description: "Filter kondisi alat" },
          searchName: { type: "string", description: "Cari berdasarkan nama alat" },
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_crew",
      description: "Ambil daftar kru yang ditugaskan ke satu proyek booth Production.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek booth (dari get_projects)" },
          projectName: { type: "string", description: "Nama proyek (partial match) kalau ID belum diketahui" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_chart_of_accounts",
      description: "Ambil daftar akun (Chart of Accounts) akuntansi: kode, nama, tipe (Aset/Kewajiban/Modal/Pendapatan/Beban), saldo normal.",
      parameters: {
        type: "object",
        properties: {
          activeOnly: { type: "boolean", description: "Jika true, hanya akun yang masih aktif" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_journal_entries",
      description: "Ambil jurnal manual akuntansi terbaru (tanggal, deskripsi, baris debit/kredit per akun). Tidak termasuk jurnal auto-posting dari invoice/pengeluaran.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20, maks: 100)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_warehouses",
      description: "Ambil daftar gudang fisik Magnarent (nama, alamat, catatan) -- dipakai sebagai pilihan lokasi/tujuan transfer unit alat.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_subrent_records",
      description: "Ambil riwayat alat yang disubrent (dipinjam dari vendor luar) Magnarent. Bisa difilter per booking.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "Filter berdasarkan ID booking (dari get_bookings), opsional -- kosongkan untuk semua riwayat" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_checkin_links",
      description: "Ambil daftar link check-in tamu (QR) untuk satu proyek Magnativ, beserta token-nya.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek (dari get_projects/search_global)" },
          projectName: { type: "string", description: "Nama proyek, dipakai kalau projectId belum diketahui" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_production_vendors",
      description: "Ambil daftar vendor/supplier Production (kayu, cat, hardware, elektrikal, jasa kontraktor, dst) beserta kontaknya.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["Kayu & Panel", "Cat & Finishing", "Hardware & Rangka", "Elektrikal", "Jasa/Kontraktor", "Lainnya"], description: "Filter kategori vendor" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_nc_reports",
      description: "Ambil daftar laporan NC/CAPA (temuan ketidaksesuaian kualitas material/vendor/kru/proses) Production beserta status tindak lanjutnya.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["Open", "Investigasi", "Tindakan Korektif", "Ditutup"], description: "Filter status" },
          severity: { type: "string", enum: ["Rendah", "Sedang", "Tinggi"], description: "Filter tingkat keparahan" },
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_subcontract_orders",
      description: "Ambil daftar pesanan subkontrak (material dikirim ke vendor luar, mis. laser cutting/printing) untuk satu proyek Production.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek booth (dari get_projects/search_global)" },
          projectName: { type: "string", description: "Nama proyek, dipakai kalau projectId belum diketahui" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bom_templates",
      description: "Ambil daftar template BOM (resep alokasi material per tipe booth) Production, beserta daftar item materialnya.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_crew_timelogs",
      description: "Ambil riwayat jam kerja (internal, belum terhubung payroll) satu kru proyek Production.",
      parameters: {
        type: "object",
        properties: {
          projectCrewId: { type: "string", description: "ID penugasan kru (dari get_project_crew)" },
        },
        required: ["projectCrewId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inventory_units",
      description: "Ambil daftar unit fisik individual (dengan kode unit/QR) untuk satu alat Magnarent -- dipakai untuk pelacakan per-unit & transfer gudang, BUKAN untuk cek ketersediaan booking (pakai check_availability).",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "ID alat (dari get_inventory/search_global)" },
          itemName: { type: "string", description: "Nama alat, dipakai kalau itemId belum diketahui" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_warehouse_transfers",
      description: "Ambil riwayat perpindahan satu unit fisik alat Magnarent antar gudang.",
      parameters: {
        type: "object",
        properties: {
          unitId: { type: "string", description: "ID unit fisik (dari get_inventory_units)" },
        },
        required: ["unitId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_booking_deposit",
      description: "Ambil data deposit/jaminan (uang tunai, KTP, SIM, dsb) untuk satu booking Magnarent.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID booking (dari get_bookings/search_global)" },
        },
        required: ["bookingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_seasonal_pricing_rules",
      description: "Ambil daftar aturan SARAN penyesuaian harga musiman (persen naik/turun) Magnarent -- bukan nilai final invoice.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "Filter untuk satu alat spesifik (opsional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_crew_assignments",
      description: "Ambil daftar kru (sopir, rigger, teknisi, dsb) yang ditugaskan untuk satu booking Magnarent.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID booking (dari get_bookings/search_global)" },
        },
        required: ["bookingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_equipment_usage",
      description: "Ambil riwayat pemakaian satu alat berat/perkakas Production (siapa pakai, kapan pinjam/kembali).",
      parameters: {
        type: "object",
        properties: {
          equipmentId: { type: "string", description: "ID alat (dari get_equipment)" },
          equipmentName: { type: "string", description: "Nama alat, dipakai kalau equipmentId belum diketahui" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_crew_piece_payments",
      description: "Ambil riwayat upah borongan (piece-rate) satu kru proyek Production.",
      parameters: {
        type: "object",
        properties: {
          projectCrewId: { type: "string", description: "ID penugasan kru (dari get_project_crew)" },
        },
        required: ["projectCrewId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_portfolio_folders",
      description: "Ambil daftar folder/album portofolio foto Magnativ (ditampilkan lintas divisi di Hub & Ringkasan Magnativ).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_asset_comments",
      description: "Ambil komentar/anotasi ('proofing ringan') pada satu aset kreatif Magnativ.",
      parameters: {
        type: "object",
        properties: {
          assetId: { type: "string", description: "ID aset kreatif" },
          assetTitle: { type: "string", description: "Judul aset (partial match), dipakai kalau assetId belum diketahui" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_content_requests",
      description: "Ambil daftar permintaan konten dari klien Magnativ (antrean masuk sebelum dijadwalkan jadi konten). Bisa difilter status atau nama klien.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["Baru", "Diproses", "Selesai", "Ditolak"], description: "Filter status permintaan" },
          clientName: { type: "string", description: "Filter nama klien (partial match)" },
          limit: { type: "number", description: "Jumlah maksimal hasil (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_vendors",
      description: "Ambil daftar vendor yang dikaitkan ke satu proyek Magnativ, beserta keterangan & estimasi biayanya.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek (dari get_projects)" },
          projectName: { type: "string", description: "Nama proyek (partial match) kalau projectId belum diketahui" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_products",
      description: "Ambil daftar produk katalog (Magnarent/Magnativ/Production/Umum) — nama, kategori, harga, stok, SKU.",
      parameters: {
        type: "object",
        properties: {
          division: { type: "string", enum: ["magnarent", "magnativ", "production", "umum"], description: "Filter divisi produk (opsional)" },
          search: { type: "string", description: "Cari berdasarkan nama/kategori/SKU (opsional)" },
          limit: { type: "number", description: "Maksimal hasil (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_notifications",
      description: "Ambil notifikasi in-app milik user yang sedang chat, termasuk jumlah yang belum dibaca.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "check_crew_conflicts",
      description: "Cek bentrok jadwal satu nama kru Magnarent terhadap booking lain yang tanggalnya tumpang tindih dengan booking ini.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID booking yang ingin dicek (dari get_bookings)" },
          crewName: { type: "string", description: "Nama kru yang ingin dicek" },
        },
        required: ["bookingId", "crewName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_material_transfers",
      description: "Ambil riwayat transfer stok material Production antar lokasi/gudang.",
      parameters: {
        type: "object",
        properties: {
          materialId: { type: "string", description: "ID material (dari get_materials)" },
          materialName: { type: "string", description: "Nama material, dipakai kalau materialId belum diketahui" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_documents",
      description: "Ambil daftar gambar kerja/desain (dokumen) yang terlampir di satu proyek booth Production.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek booth (dari get_projects)" },
          projectName: { type: "string", description: "Nama proyek, dipakai kalau projectId belum diketahui" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_portal_links",
      description: "Ambil daftar link portal klien yang pernah dibuat untuk satu proyek/booking (Magnarent/Magnativ/Production).",
      parameters: {
        type: "object",
        properties: {
          module: { type: "string", enum: ["magnarent", "magnative", "production"], description: "Modul entitas" },
          entityId: { type: "string", description: "ID booking/proyek" },
        },
        required: ["module", "entityId"],
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
  {
    type: "function",
    function: {
      name: "add_maintenance_log",
      description: "Catat alat Magnarent masuk servis/maintenance. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "ID alat (dari get_inventory/search_global)" },
          itemName: { type: "string", description: "Nama alat (untuk ringkasan konfirmasi)" },
          tanggal: { type: "string", description: "Tanggal servis (YYYY-MM-DD, default: hari ini)" },
          jenis: { type: "string", enum: ["Servis Rutin", "Perbaikan", "Lainnya"], description: "Jenis servis" },
          biaya: { type: "number", description: "Biaya servis (Rupiah)" },
          keterangan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["itemId", "jenis", "biaya"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_delivery",
      description: "Jadwalkan pengiriman (keluar) atau pengambilan (kembali) alat untuk satu booking. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID booking (dari get_bookings)" },
          stage: { type: "string", enum: ["pengiriman", "pengambilan"], description: "Tahap: pengiriman (keluar) atau pengambilan (kembali)" },
          status: { type: "string", enum: ["Belum Dijadwalkan", "Dijadwalkan", "Selesai"], description: "Status penjadwalan" },
          driverName: { type: "string", description: "Nama sopir" },
          jadwalTanggal: { type: "string", description: "Tanggal jadwal (YYYY-MM-DD)" },
          jadwalJam: { type: "string", description: "Jam jadwal (contoh: 14:00)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["bookingId", "stage", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_project_task",
      description: "Tambah task/sub-pekerjaan baru ke proyek Magnativ (venue, dekorasi, izin, dst). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek (dari get_projects)" },
          projectName: { type: "string", description: "Nama proyek (untuk ringkasan konfirmasi)" },
          title: { type: "string", description: "Judul task" },
          detail: { type: "string", description: "Detail/deskripsi task" },
          status: { type: "string", enum: ["Belum Mulai", "Berjalan", "Selesai"], description: "Status awal (default: Belum Mulai)" },
          dueDate: { type: "string", description: "Tenggat (YYYY-MM-DD)" },
          biayaEstimasi: { type: "number", description: "Estimasi biaya task (Rupiah)" },
        },
        required: ["projectId", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project_task_status",
      description: "Ubah status task proyek Magnativ. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "ID task (dari get_project_tasks)" },
          status: { type: "string", enum: ["Belum Mulai", "Berjalan", "Selesai"], description: "Status baru" },
        },
        required: ["taskId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "receive_purchase_order",
      description: "Tandai purchase order Production sebagai Diterima -- stok material terkait otomatis bertambah. HARUS konfirmasi dengan user sebelum menandai.",
      parameters: {
        type: "object",
        properties: {
          poId: { type: "string", description: "ID purchase order (dari get_purchase_orders)" },
        },
        required: ["poId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_production_status",
      description: "Ubah status proyek booth Production (Desain/Produksi/Finishing/Instalasi). Tidak bisa dipakai untuk proyek yang sudah Selesai/Dibatalkan. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek booth (dari get_projects)" },
          status: { type: "string", enum: ["Desain", "Produksi", "Finishing", "Instalasi", "Selesai", "Dibatalkan"], description: "Status baru" },
        },
        required: ["projectId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_inventory_item",
      description: "Tambah alat baru ke inventaris Magnarent. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama alat" },
          category: { type: "string", description: "Kategori alat (contoh: Tenda, Sound System, Kursi)" },
          location: { type: "string", description: "Gudang/lokasi fisik" },
          pricePerDay: { type: "number", description: "Harga sewa per hari (Rupiah)" },
          totalUnit: { type: "number", description: "Total unit yang dimiliki" },
          unitMaintenance: { type: "number", description: "Unit yang sedang maintenance (default: 0)" },
          pricePerWeek: { type: "number", description: "Harga sewa per minggu (opsional)" },
          pricePerMonth: { type: "number", description: "Harga sewa per bulan (opsional)" },
        },
        required: ["name", "category", "location", "pricePerDay", "totalUnit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_inventory_item",
      description: "Ubah data alat inventaris Magnarent (harga, lokasi, total unit, dst). Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "ID alat (dari get_inventory/search_global)" },
          name: { type: "string", description: "Nama alat baru" },
          category: { type: "string", description: "Kategori baru" },
          location: { type: "string", description: "Lokasi baru" },
          pricePerDay: { type: "number", description: "Harga sewa per hari baru" },
          totalUnit: { type: "number", description: "Total unit baru" },
          unitMaintenance: { type: "number", description: "Unit maintenance baru" },
          pricePerWeek: { type: "number", description: "Harga sewa per minggu baru" },
          pricePerMonth: { type: "number", description: "Harga sewa per bulan baru" },
        },
        required: ["itemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_client",
      description: "Tambah klien baru ke Magnativ. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama klien" },
          industry: { type: "string", description: "Industri klien" },
          picName: { type: "string", description: "Nama PIC klien" },
          picPhone: { type: "string", description: "Nomor telepon PIC" },
          picEmail: { type: "string", description: "Email PIC" },
          status: { type: "string", enum: ["Prospek", "Aktif", "Selesai", "Tidak Lanjut"], description: "Status klien (default: Prospek)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["name", "industry", "picName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client",
      description: "Ubah data klien Magnativ. Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "ID klien (dari get_clients/search_global)" },
          name: { type: "string", description: "Nama baru" },
          industry: { type: "string", description: "Industri baru" },
          picName: { type: "string", description: "Nama PIC baru" },
          picPhone: { type: "string", description: "Telepon PIC baru" },
          picEmail: { type: "string", description: "Email PIC baru" },
          status: { type: "string", enum: ["Prospek", "Aktif", "Selesai", "Tidak Lanjut"], description: "Status baru" },
          catatan: { type: "string", description: "Catatan baru" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_material",
      description: "Tambah material baru ke gudang Production. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama material" },
          category: { type: "string", enum: ["Kayu & Panel", "Cat & Finishing", "Hardware & Rangka", "Elektrikal", "Lainnya"], description: "Kategori material" },
          unit: { type: "string", enum: ["pcs", "lembar", "batang", "meter", "kg", "liter", "set"], description: "Satuan" },
          location: { type: "string", description: "Lokasi gudang" },
          stock: { type: "number", description: "Stok awal" },
          minStock: { type: "number", description: "Ambang batas stok menipis" },
          pricePerUnit: { type: "number", description: "Harga per satuan (Rupiah)" },
        },
        required: ["name", "category", "unit", "location", "stock", "minStock", "pricePerUnit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_material",
      description: "Ubah data material Production (stok, harga, lokasi, dst). Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          materialId: { type: "string", description: "ID material (dari get_materials/search_global)" },
          name: { type: "string", description: "Nama baru" },
          category: { type: "string", enum: ["Kayu & Panel", "Cat & Finishing", "Hardware & Rangka", "Elektrikal", "Lainnya"], description: "Kategori baru" },
          unit: { type: "string", enum: ["pcs", "lembar", "batang", "meter", "kg", "liter", "set"], description: "Satuan baru" },
          location: { type: "string", description: "Lokasi baru" },
          stock: { type: "number", description: "Stok baru" },
          minStock: { type: "number", description: "Ambang batas baru" },
          pricePerUnit: { type: "number", description: "Harga per satuan baru" },
        },
        required: ["materialId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_purchase_order",
      description: "Buat purchase order material baru ke supplier. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          supplierName: { type: "string", description: "Nama supplier" },
          materialId: { type: "string", description: "ID material terkait (dari get_materials), opsional" },
          qty: { type: "number", description: "Jumlah yang dipesan" },
          unitPrice: { type: "number", description: "Harga per satuan (Rupiah)" },
          orderDate: { type: "string", description: "Tanggal pesan (YYYY-MM-DD, default: hari ini)" },
          expectedDate: { type: "string", description: "Perkiraan tanggal datang (YYYY-MM-DD)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["supplierName", "qty", "unitPrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_invoice_status",
      description: "Ubah status faktur/invoice (Draft/Terkirim/Lunas). Status Lunas otomatis posting jurnal pendapatan. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: { type: "string", description: "ID invoice (dari get_invoices)" },
          status: { type: "string", enum: ["Draft", "Terkirim", "Lunas"], description: "Status baru" },
        },
        required: ["invoiceId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_capital_request",
      description: "Buat pengajuan modal event baru untuk investor (estimasi billing & modal). HANYA bisa dipakai akun akses penuh. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          eventName: { type: "string", description: "Nama event" },
          location: { type: "string", description: "Lokasi event" },
          eventDate: { type: "string", description: "Tanggal event (YYYY-MM-DD)" },
          billingEstimate: { type: "number", description: "Estimasi total billing (Rupiah)" },
          modalEstimate: { type: "number", description: "Estimasi modal yang dibutuhkan (Rupiah)" },
        },
        required: ["eventName", "location", "billingEstimate", "modalEstimate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_subrent_record",
      description: "Catat alat yang dipinjam dari vendor luar (subrent) buat menutupi kekurangan stok Magnarent. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID booking terkait (dari get_bookings), opsional" },
          itemId: { type: "string", description: "ID jenis alat terkait (dari get_inventory), opsional" },
          vendorName: { type: "string", description: "Nama vendor penyedia alat subrent" },
          jumlahUnit: { type: "number", description: "Jumlah unit yang disubrent" },
          hargaSewaTotal: { type: "number", description: "Total harga sewa (Rupiah), opsional" },
          tanggalMulai: { type: "string", description: "Tanggal mulai (YYYY-MM-DD)" },
          tanggalSelesai: { type: "string", description: "Tanggal selesai (YYYY-MM-DD)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["vendorName", "jumlahUnit", "tanggalMulai", "tanggalSelesai"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_checkin_link",
      description: "Buat link check-in tamu (QR) baru untuk satu proyek Magnativ. HARUS konfirmasi dengan user sebelum membuat.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek (dari get_projects/search_global)" },
          projectName: { type: "string", description: "Nama proyek, dipakai kalau projectId belum diketahui" },
          label: { type: "string", description: "Label link, mis. 'Hari-H' atau 'Gala Dinner', opsional" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_magnative_vendor",
      description: "Tambah vendor/supplier baru ke database vendor Magnativ (venue, katering, dekorasi, dst). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama vendor" },
          category: { type: "string", enum: ["Venue", "Katering", "Dekorasi", "Sound System & Lighting", "Fotografi/Videografi", "Percetakan", "Lainnya"], description: "Kategori vendor" },
          contactName: { type: "string", description: "Nama kontak" },
          contactPhone: { type: "string", description: "Nomor telepon kontak" },
          contactEmail: { type: "string", description: "Email kontak" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["name", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_magnative_vendor",
      description: "Ubah data vendor Magnativ. Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          vendorId: { type: "string", description: "ID vendor (dari search_global)" },
          name: { type: "string", description: "Nama vendor baru" },
          category: { type: "string", enum: ["Venue", "Katering", "Dekorasi", "Sound System & Lighting", "Fotografi/Videografi", "Percetakan", "Lainnya"], description: "Kategori baru" },
          contactName: { type: "string", description: "Nama kontak baru" },
          contactPhone: { type: "string", description: "Nomor telepon kontak baru" },
          contactEmail: { type: "string", description: "Email kontak baru" },
          catatan: { type: "string", description: "Catatan baru" },
        },
        required: ["vendorId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_production_vendor",
      description: "Tambah vendor/supplier baru ke database vendor Production (kayu, cat, hardware, elektrikal, jasa kontraktor, dst). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama vendor" },
          category: { type: "string", enum: ["Kayu & Panel", "Cat & Finishing", "Hardware & Rangka", "Elektrikal", "Jasa/Kontraktor", "Lainnya"], description: "Kategori vendor" },
          contactName: { type: "string", description: "Nama kontak" },
          contactPhone: { type: "string", description: "Nomor telepon kontak" },
          contactEmail: { type: "string", description: "Email kontak" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["name", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_production_vendor",
      description: "Ubah data vendor Production. Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          vendorId: { type: "string", description: "ID vendor (dari get_production_vendors/search_global)" },
          name: { type: "string", description: "Nama vendor baru" },
          category: { type: "string", enum: ["Kayu & Panel", "Cat & Finishing", "Hardware & Rangka", "Elektrikal", "Jasa/Kontraktor", "Lainnya"], description: "Kategori baru" },
          contactName: { type: "string", description: "Nama kontak baru" },
          contactPhone: { type: "string", description: "Nomor telepon kontak baru" },
          contactEmail: { type: "string", description: "Email kontak baru" },
          catatan: { type: "string", description: "Catatan baru" },
        },
        required: ["vendorId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_nc_report",
      description: "Catat laporan NC/CAPA baru (temuan ketidaksesuaian kualitas material/vendor/kru/proses) Production. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek terkait, opsional" },
          vendorId: { type: "string", description: "ID vendor terkait, opsional" },
          projectCrewId: { type: "string", description: "ID kru terkait, opsional" },
          kategori: { type: "string", enum: ["Material", "Vendor", "Kru", "Proses", "Lainnya"], description: "Kategori temuan" },
          judul: { type: "string", description: "Judul temuan" },
          deskripsi: { type: "string", description: "Deskripsi detail temuan" },
          severity: { type: "string", enum: ["Rendah", "Sedang", "Tinggi"], description: "Tingkat keparahan" },
          pic: { type: "string", description: "PIC penanggung jawab, opsional" },
          tanggalDitemukan: { type: "string", description: "Tanggal ditemukan (YYYY-MM-DD), default hari ini" },
        },
        required: ["kategori", "judul", "deskripsi", "severity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_nc_report_progress",
      description: "Ubah status & tindak lanjut (akar masalah, tindakan korektif/preventif) satu laporan NC. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          ncReportId: { type: "string", description: "ID laporan NC (dari get_nc_reports)" },
          status: { type: "string", enum: ["Open", "Investigasi", "Tindakan Korektif", "Ditutup"], description: "Status baru" },
          akarMasalah: { type: "string", description: "Akar masalah, opsional" },
          tindakanKorektif: { type: "string", description: "Tindakan korektif, opsional" },
          tindakanPreventif: { type: "string", description: "Tindakan preventif, opsional" },
        },
        required: ["ncReportId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_subcontract_order",
      description: "Buat pesanan subkontrak baru (material BOM proyek dikirim ke vendor luar, mis. laser cutting/printing besar). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek booth" },
          projectName: { type: "string", description: "Nama proyek, dipakai kalau projectId belum diketahui" },
          vendorId: { type: "string", description: "ID vendor Production tujuan, opsional" },
          deskripsiPekerjaan: { type: "string", description: "Deskripsi pekerjaan yang disubkontrakkan" },
          tanggalKirim: { type: "string", description: "Tanggal kirim (YYYY-MM-DD), opsional" },
          estimasiTerima: { type: "string", description: "Perkiraan tanggal terima (YYYY-MM-DD), opsional" },
          biayaJasa: { type: "number", description: "Biaya jasa (Rupiah), opsional" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["deskripsiPekerjaan"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_subcontract_status",
      description: "Ubah status pesanan subkontrak (Dikirim/Diproses/Diterima/Dibatalkan). HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          subcontractOrderId: { type: "string", description: "ID pesanan subkontrak (dari get_subcontract_orders)" },
          status: { type: "string", enum: ["Dikirim", "Diproses", "Diterima", "Dibatalkan"], description: "Status baru" },
          tanggalTerima: { type: "string", description: "Tanggal terima (YYYY-MM-DD), dipakai kalau status Diterima" },
        },
        required: ["subcontractOrderId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_bom_template",
      description: "Buat template BOM baru (resep alokasi material per tipe booth) Production. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama template" },
          description: { type: "string", description: "Deskripsi template, opsional" },
          items: {
            type: "array",
            description: "Daftar item material template (ID material dari get_materials + jumlah)",
            items: {
              type: "object",
              properties: {
                materialId: { type: "string", description: "ID material (dari get_materials)" },
                qty: { type: "number", description: "Jumlah yang dibutuhkan" },
              },
              required: ["materialId", "qty"],
            },
          },
        },
        required: ["name", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_crew_timelog",
      description: "Catat jam kerja kru proyek Production (internal, belum terhubung payroll). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          projectCrewId: { type: "string", description: "ID penugasan kru (dari get_project_crew)" },
          tanggal: { type: "string", description: "Tanggal kerja (YYYY-MM-DD)" },
          jam: { type: "number", description: "Jumlah jam kerja" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["projectCrewId", "tanggal", "jam"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transfer_unit_to_warehouse",
      description: "Pindahkan satu unit fisik alat Magnarent ke gudang lain (tercatat sebagai log histori). HARUS konfirmasi dengan user sebelum menjalankan.",
      parameters: {
        type: "object",
        properties: {
          unitId: { type: "string", description: "ID unit fisik (dari get_inventory_units)" },
          toWarehouseId: { type: "string", description: "ID gudang tujuan (dari get_warehouses)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["unitId", "toWarehouseId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_booking_deposit",
      description: "Simpan/perbarui deposit/jaminan booking Magnarent (uang tunai, KTP, SIM, dsb). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID booking (dari get_bookings/search_global)" },
          jenis: { type: "string", enum: ["Uang Tunai", "KTP", "SIM", "Lainnya"], description: "Jenis jaminan" },
          jumlah: { type: "number", description: "Jumlah/nilai jaminan (Rupiah untuk Uang Tunai, 0 untuk dokumen)" },
          keterangan: { type: "string", description: "Keterangan tambahan" },
        },
        required: ["bookingId", "jenis", "jumlah"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_deposit_returned",
      description: "Tandai deposit/jaminan booking Magnarent sudah dikembalikan ke klien (atau batalkan tanda itu). HARUS konfirmasi dengan user sebelum menjalankan.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID booking (dari get_bookings/search_global)" },
          returned: { type: "boolean", description: "true = sudah dikembalikan, false = batalkan status kembali" },
        },
        required: ["bookingId", "returned"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_seasonal_pricing_rule",
      description: "Tambah aturan SARAN penyesuaian harga musiman Magnarent untuk rentang tanggal tertentu. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          label: { type: "string", description: "Label musim, mis. \"Libur Lebaran 2026\"" },
          startDate: { type: "string", description: "Tanggal mulai (YYYY-MM-DD)" },
          endDate: { type: "string", description: "Tanggal selesai (YYYY-MM-DD)" },
          multiplierPct: { type: "number", description: "Persen penyesuaian, positif = naik, negatif = turun, mis. 20 atau -10" },
          itemId: { type: "string", description: "ID alat spesifik (opsional, kosongkan agar berlaku untuk SEMUA alat)" },
        },
        required: ["label", "startDate", "endDate", "multiplierPct"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_crew_assignment",
      description: "Tugaskan kru (sopir, rigger, teknisi, dsb) ke satu booking Magnarent. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID booking (dari get_bookings/search_global)" },
          crewName: { type: "string", description: "Nama kru" },
          role: { type: "string", enum: ["Sopir", "Rigger", "Teknisi", "Among Alat", "Lainnya"], description: "Peran kru" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["bookingId", "crewName", "role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_equipment",
      description: "Tambah alat berat/perkakas baru ke inventaris Production. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama alat" },
          kategori: { type: "string", enum: ["Alat Berat", "Perkakas Listrik", "Perkakas Manual", "Lainnya"], description: "Kategori alat" },
          kondisi: { type: "string", enum: ["Baik", "Perlu Servis", "Rusak"], description: "Kondisi alat" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["name", "kategori", "kondisi"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_equipment",
      description: "Ubah data alat berat/perkakas Production (field yang tidak disebut tetap memakai nilai lama). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          equipmentId: { type: "string", description: "ID alat (dari get_equipment)" },
          name: { type: "string", description: "Nama alat" },
          kategori: { type: "string", enum: ["Alat Berat", "Perkakas Listrik", "Perkakas Manual", "Lainnya"], description: "Kategori alat" },
          kondisi: { type: "string", enum: ["Baik", "Perlu Servis", "Rusak"], description: "Kondisi alat" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["equipmentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_equipment_usage",
      description: "Catat pemakaian alat berat/perkakas Production (siapa pakai, tanggal pinjam). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          equipmentId: { type: "string", description: "ID alat (dari get_equipment)" },
          equipmentName: { type: "string", description: "Nama alat, dipakai kalau equipmentId belum diketahui" },
          projectId: { type: "string", description: "ID proyek booth terkait (opsional, dari get_projects)" },
          digunakanOleh: { type: "string", description: "Nama pemakai" },
          tanggalPinjam: { type: "string", description: "Tanggal pinjam (YYYY-MM-DD)" },
          tanggalKembali: { type: "string", description: "Tanggal kembali (opsional, YYYY-MM-DD)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["digunakanOleh", "tanggalPinjam"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_equipment_usage_returned",
      description: "Tandai satu catatan pemakaian alat Production sudah dikembalikan. HARUS konfirmasi dengan user sebelum menjalankan.",
      parameters: {
        type: "object",
        properties: {
          usageId: { type: "string", description: "ID catatan pemakaian (dari get_equipment_usage)" },
          tanggalKembali: { type: "string", description: "Tanggal kembali (default hari ini, YYYY-MM-DD)" },
        },
        required: ["usageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_crew_piece_payment",
      description: "Catat kesepakatan upah borongan (piece-rate) kru proyek Production. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          projectCrewId: { type: "string", description: "ID penugasan kru (dari get_project_crew)" },
          deskripsiPekerjaan: { type: "string", description: "Deskripsi pekerjaan borongan" },
          jumlahUnit: { type: "number", description: "Jumlah unit pekerjaan" },
          ratePerUnit: { type: "number", description: "Rate upah per unit (Rupiah)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["projectCrewId", "deskripsiPekerjaan", "jumlahUnit", "ratePerUnit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_crew_piece_payment_status",
      description: "Ubah status pembayaran upah borongan kru Production. HARUS konfirmasi dengan user sebelum menjalankan.",
      parameters: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "ID upah borongan (dari get_crew_piece_payments)" },
          status: { type: "string", enum: ["Belum Dibayar", "Dibayar"], description: "Status pembayaran" },
          tanggalBayar: { type: "string", description: "Tanggal bayar (default hari ini kalau status Dibayar, YYYY-MM-DD)" },
        },
        required: ["paymentId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_project_crew",
      description: "Tugaskan kru baru (koordinator, tukang, desainer, dsb) ke proyek booth Production. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek booth (dari get_projects/search_global)" },
          projectName: { type: "string", description: "Nama proyek, dipakai kalau projectId belum diketahui" },
          nama: { type: "string", description: "Nama kru" },
          peran: {
            type: "string",
            enum: ["Koordinator Lapangan", "Tukang/Instalatur", "Desainer", "Sopir/Logistik", "Lainnya"],
            description: "Peran kru",
          },
          kontak: { type: "string", description: "Kontak kru (opsional)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["nama", "peran"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_magnative_project",
      description: "Tambah proyek Magnativ baru (Event Organizer/Creative Agency/Media Sosial). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "ID klien (dari get_clients/search_global)" },
          clientName: { type: "string", description: "Nama klien, dipakai kalau clientId belum diketahui" },
          name: { type: "string", description: "Nama proyek" },
          type: { type: "string", enum: ["Event Organizer", "Creative Agency", "Media Sosial", "Lainnya"], description: "Tipe proyek" },
          tanggalMulai: { type: "string", description: "Tanggal mulai (YYYY-MM-DD)" },
          tanggalSelesai: { type: "string", description: "Tanggal selesai (YYYY-MM-DD)" },
          budget: { type: "number", description: "Budget proyek (Rupiah)" },
          status: { type: "string", enum: ["Pitching", "Perencanaan", "Berjalan", "Selesai", "Dibatalkan"], description: "Status awal (default: Pitching)" },
          statusPembayaran: { type: "string", enum: ["Belum Bayar", "DP", "Lunas"], description: "Status pembayaran (default: Belum Bayar)" },
          dpAmount: { type: "number", description: "Nominal DP yang sudah diterima (kalau statusPembayaran DP)" },
          sumberUndangan: { type: "string", description: "Sumber undangan pitching, mis. 'Client' atau 'Brand' (opsional)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["name", "type", "tanggalMulai", "tanggalSelesai", "budget"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_magnative_project",
      description: "Ubah data proyek Magnativ (budget, status, tanggal, dst). Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek (dari get_projects)" },
          projectName: { type: "string", description: "Nama proyek, dipakai kalau projectId belum diketahui" },
          clientId: { type: "string", description: "ID klien baru" },
          name: { type: "string", description: "Nama baru" },
          type: { type: "string", enum: ["Event Organizer", "Creative Agency", "Media Sosial", "Lainnya"], description: "Tipe baru" },
          tanggalMulai: { type: "string", description: "Tanggal mulai baru (YYYY-MM-DD)" },
          tanggalSelesai: { type: "string", description: "Tanggal selesai baru (YYYY-MM-DD)" },
          budget: { type: "number", description: "Budget baru (Rupiah)" },
          status: { type: "string", enum: ["Pitching", "Perencanaan", "Berjalan", "Selesai", "Dibatalkan"], description: "Status baru" },
          statusPembayaran: { type: "string", enum: ["Belum Bayar", "DP", "Lunas"], description: "Status pembayaran baru" },
          dpAmount: { type: "number", description: "Nominal DP baru" },
          alasanKalah: { type: "string", description: "Alasan batal/kalah -- WAJIB diisi kalau status diubah ke Dibatalkan" },
          sumberUndangan: { type: "string", description: "Sumber undangan baru" },
          catatan: { type: "string", description: "Catatan baru" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_project_cost",
      description: "Catat biaya/pengeluaran untuk proyek Magnativ (pitching, produksi, vendor, dst). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek (dari get_projects)" },
          projectName: { type: "string", description: "Nama proyek, dipakai kalau projectId belum diketahui" },
          description: { type: "string", description: "Deskripsi biaya" },
          amount: { type: "number", description: "Jumlah (Rupiah)" },
          costDate: { type: "string", description: "Tanggal biaya (YYYY-MM-DD, default: hari ini)" },
          category: { type: "string", description: "Kategori biaya, mis. Sewa Venue, Dekorasi & Material, Talent / Vendor, Lain-lain" },
          paymentMethod: { type: "string", description: "Metode pembayaran, mis. Cash, Transfer BCA" },
        },
        required: ["description", "amount", "category", "paymentMethod"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project_cost",
      description: "Ubah biaya proyek Magnativ yang sudah tercatat. Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          costId: { type: "string", description: "ID biaya proyek" },
          description: { type: "string", description: "Deskripsi baru" },
          amount: { type: "number", description: "Jumlah baru (Rupiah)" },
          costDate: { type: "string", description: "Tanggal baru (YYYY-MM-DD)" },
          category: { type: "string", description: "Kategori baru" },
          paymentMethod: { type: "string", description: "Metode pembayaran baru" },
        },
        required: ["costId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_content_post",
      description: "Jadwalkan konten/post sosmed baru untuk klien Magnativ. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "ID klien (opsional)" },
          clientName: { type: "string", description: "Nama klien, dipakai kalau clientId belum diketahui" },
          title: { type: "string", description: "Judul konten" },
          platform: { type: "string", enum: ["Instagram", "TikTok", "Facebook", "YouTube", "LinkedIn", "Lainnya"], description: "Platform" },
          tanggalPosting: { type: "string", description: "Tanggal posting (YYYY-MM-DD)" },
          status: { type: "string", enum: ["Draft", "Revisi", "Disetujui", "Tayang"], description: "Status awal (default: Draft)" },
          feedbackRevisi: { type: "string", description: "Catatan revisi (wajib kalau status Revisi)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["title", "platform", "tanggalPosting"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_content_post",
      description: "Ubah seluruh data konten Magnativ (judul, platform, tanggal, status, dst). Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          postId: { type: "string", description: "ID konten (dari get_content_posts)" },
          clientId: { type: "string", description: "ID klien baru" },
          title: { type: "string", description: "Judul baru" },
          platform: { type: "string", enum: ["Instagram", "TikTok", "Facebook", "YouTube", "LinkedIn", "Lainnya"], description: "Platform baru" },
          tanggalPosting: { type: "string", description: "Tanggal posting baru (YYYY-MM-DD)" },
          status: { type: "string", enum: ["Draft", "Revisi", "Disetujui", "Tayang"], description: "Status baru" },
          feedbackRevisi: { type: "string", description: "Catatan revisi (wajib kalau status Revisi)" },
          catatan: { type: "string", description: "Catatan baru" },
        },
        required: ["postId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_content_status",
      description: "Ganti status konten Magnativ secara cepat (approve/minta revisi/tandai tayang) tanpa mengubah field lain. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          postId: { type: "string", description: "ID konten (dari get_content_posts)" },
          status: { type: "string", enum: ["Draft", "Revisi", "Disetujui", "Tayang"], description: "Status baru" },
          feedbackRevisi: { type: "string", description: "Catatan revisi (wajib kalau status Revisi)" },
        },
        required: ["postId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_content_request",
      description: "Catat permintaan konten baru dari klien Magnativ (antrean masuk sebelum dijadwalkan). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "ID klien (dari get_clients/search_global)" },
          clientName: { type: "string", description: "Nama klien, dipakai kalau clientId belum diketahui" },
          title: { type: "string", description: "Judul permintaan" },
          description: { type: "string", description: "Deskripsi kebutuhan" },
          deadline: { type: "string", description: "Tenggat (YYYY-MM-DD), opsional" },
          priority: { type: "string", enum: ["Rendah", "Sedang", "Tinggi"], description: "Prioritas (default: Sedang)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["title", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_content_request_status",
      description: "Ubah status permintaan konten Magnativ (Baru/Diproses/Selesai/Ditolak). HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          requestId: { type: "string", description: "ID permintaan konten (dari get_content_requests)" },
          status: { type: "string", enum: ["Baru", "Diproses", "Selesai", "Ditolak"], description: "Status baru" },
        },
        required: ["requestId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_project_vendor",
      description: "Kaitkan vendor ke satu proyek Magnativ, beserta estimasi biaya. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek (dari get_projects)" },
          projectName: { type: "string", description: "Nama proyek, dipakai kalau projectId belum diketahui" },
          vendorId: { type: "string", description: "ID vendor (dari search_global)" },
          vendorName: { type: "string", description: "Nama vendor, dipakai kalau vendorId belum diketahui" },
          keterangan: { type: "string", description: "Keterangan, mis. jenis jasa/produk dari vendor ini" },
          biayaEstimasi: { type: "number", description: "Estimasi biaya dari quote vendor (Rupiah)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project_vendor",
      description: "Ubah keterangan/estimasi biaya kaitan vendor-proyek Magnativ. Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          projectVendorId: { type: "string", description: "ID kaitan vendor-proyek (dari get_project_vendors)" },
          vendorId: { type: "string", description: "ID vendor baru (opsional, untuk ganti vendor)" },
          vendorName: { type: "string", description: "Nama vendor baru, dipakai kalau vendorId belum diketahui" },
          keterangan: { type: "string", description: "Keterangan baru" },
          biayaEstimasi: { type: "number", description: "Estimasi biaya baru (Rupiah)" },
        },
        required: ["projectVendorId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project_task",
      description: "Ubah seluruh data task proyek Magnativ (judul, detail, tenggat, PIC, vendor, estimasi biaya, dst) -- untuk sekadar ganti status cepat pakai update_project_task_status. Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "ID task (dari get_project_tasks)" },
          title: { type: "string", description: "Judul baru" },
          detail: { type: "string", description: "Detail baru" },
          status: { type: "string", enum: ["Belum Mulai", "Berjalan", "Selesai"], description: "Status baru" },
          dueDate: { type: "string", description: "Tenggat baru (YYYY-MM-DD)" },
          pic: { type: "string", description: "ID PIC baru (dari daftar staf yang bisa ditunjuk)" },
          vendorId: { type: "string", description: "ID vendor sourcing baru (opsional)" },
          biayaEstimasi: { type: "number", description: "Estimasi biaya baru (Rupiah)" },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project_pipeline_stage",
      description: "Ubah tahap pipeline proposal (Invitation/Briefing/Submit/Present) proyek Magnativ yang masih Pitching. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "ID proyek (dari get_projects)" },
          projectName: { type: "string", description: "Nama proyek, dipakai kalau projectId belum diketahui" },
          stage: { type: "string", enum: ["Invitation", "Briefing", "Submit", "Present"], description: "Tahap baru" },
        },
        required: ["stage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_asset_comment",
      description: "Tambah komentar/anotasi ('proofing ringan') pada satu aset kreatif Magnativ. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          assetId: { type: "string", description: "ID aset kreatif" },
          assetTitle: { type: "string", description: "Judul aset, dipakai kalau assetId belum diketahui" },
          commentText: { type: "string", description: "Isi komentar" },
        },
        required: ["commentText"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_asset_comment_resolved",
      description: "Tandai komentar aset kreatif Magnativ sebagai selesai/belum selesai ditindaklanjuti. HARUS konfirmasi dengan user sebelum menjalankan.",
      parameters: {
        type: "object",
        properties: {
          commentId: { type: "string", description: "ID komentar (dari get_asset_comments)" },
          isResolved: { type: "boolean", description: "true = selesai, false = belum selesai (default: true)" },
        },
        required: ["commentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_purchase_order",
      description: "Batalkan purchase order material Production yang masih berstatus Dipesan. HARUS konfirmasi dengan user sebelum membatalkan.",
      parameters: {
        type: "object",
        properties: {
          poId: { type: "string", description: "ID purchase order (dari get_purchase_orders)" },
        },
        required: ["poId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "decide_capital_request",
      description: "Putuskan (Setujui/Tolak) satu pengajuan modal event. HANYA bisa dipakai akun investor. HARUS konfirmasi dengan user sebelum memutuskan.",
      parameters: {
        type: "object",
        properties: {
          requestId: { type: "string", description: "ID pengajuan modal (dari get_capital_requests)" },
          status: { type: "string", enum: ["Disetujui", "Ditolak"], description: "Keputusan" },
          note: { type: "string", description: "Catatan investor, opsional" },
        },
        required: ["requestId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_event_expense",
      description: "Ubah pengeluaran (Realisasi Event) yang sudah tercatat (kategori, jumlah, metode bayar, dst). Terkait event/booking/proyeknya TIDAK bisa diubah lewat tool ini. Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          expenseId: { type: "string", description: "ID pengeluaran (dari get_expenses)" },
          category: {
            type: "string",
            enum: ["Sewa Venue", "Dekorasi & Material", "Transportasi", "Konsumsi", "Talent / Vendor", "Percetakan", "Operasional Kantor", "Lain-lain"],
            description: "Kategori baru",
          },
          amount: { type: "number", description: "Jumlah baru (Rupiah)" },
          expenseDate: { type: "string", description: "Tanggal baru (YYYY-MM-DD)" },
          picName: { type: "string", description: "PIC baru" },
          paymentMethod: { type: "string", description: "Metode bayar baru" },
          reimbursementStatus: {
            type: "string",
            enum: ["Dibayar Perusahaan", "Belum Diganti", "Sudah Diganti", "Tidak Perlu"],
            description: "Status penggantian baru",
          },
          notes: { type: "string", description: "Catatan baru" },
        },
        required: ["expenseId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_invoice",
      description: "Buat invoice/faktur baru untuk Magnarent/Magnativ/Production. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          division: { type: "string", enum: ["magnarent", "magnative", "production"], description: "Divisi invoice" },
          clientName: { type: "string", description: "Nama klien" },
          clientPhone: { type: "string", description: "Nomor WhatsApp klien (opsional, dipakai kalau mau kirim invoice)" },
          eventName: { type: "string", description: "Nama acara/proyek (opsional)" },
          items: {
            type: "array",
            description: "Baris item invoice",
            items: {
              type: "object",
              properties: {
                description: { type: "string", description: "Deskripsi item" },
                qty: { type: "number", description: "Jumlah/qty" },
                unitPrice: { type: "number", description: "Harga satuan (Rupiah)" },
              },
              required: ["description", "qty", "unitPrice"],
            },
          },
          shippingCost: { type: "number", description: "Ongkos kirim (opsional, Rupiah)" },
          depositAmount: { type: "number", description: "Jaminan/deposit yang dapat dikembalikan (opsional, Rupiah)" },
          dueDate: { type: "string", description: "Tanggal jatuh tempo (YYYY-MM-DD, opsional)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["division", "clientName", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_invoice",
      description:
        "Ubah data invoice yang sudah ada (klien, item, ongkos kirim, dst). Field yang tidak diisi TETAP memakai nilai lama — kecuali 'items', yang kalau diisi MENGGANTI seluruh baris item lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: { type: "string", description: "ID invoice (dari get_invoices)" },
          clientName: { type: "string", description: "Nama klien baru" },
          clientPhone: { type: "string", description: "Nomor WhatsApp klien baru" },
          eventName: { type: "string", description: "Nama acara/proyek baru" },
          items: {
            type: "array",
            description: "Baris item invoice baru (kalau diisi, MENGGANTI seluruh item lama)",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                qty: { type: "number" },
                unitPrice: { type: "number" },
              },
              required: ["description", "qty", "unitPrice"],
            },
          },
          shippingCost: { type: "number", description: "Ongkos kirim baru (Rupiah)" },
          depositAmount: { type: "number", description: "Jaminan/deposit baru (Rupiah)" },
          dueDate: { type: "string", description: "Tanggal jatuh tempo baru (YYYY-MM-DD)" },
          catatan: { type: "string", description: "Catatan baru" },
        },
        required: ["invoiceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_invoice_whatsapp",
      description: "Generate PDF invoice dan kirim ke nomor WhatsApp klien lewat bot. HARUS konfirmasi dengan user sebelum mengirim.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: { type: "string", description: "ID invoice (dari get_invoices)" },
        },
        required: ["invoiceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_product",
      description: "Tambah produk baru ke katalog (tanpa foto -- foto dikelola manual lewat halaman Produk). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama produk" },
          divisions: {
            type: "array",
            items: { type: "string", enum: ["magnarent", "magnativ", "production", "umum"] },
            description: "Divisi produk (boleh lebih dari satu, default: umum)",
          },
          category: { type: "string", description: "Kategori produk" },
          sku: { type: "string", description: "SKU (opsional, dibuatkan otomatis kalau kosong)" },
          price: { type: "number", description: "Harga" },
          unit: { type: "string", description: "Satuan (default: unit)" },
          stock: { type: "number", description: "Stok" },
          supplier: { type: "string", description: "Supplier (opsional)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_product",
      description:
        "Ubah data teks produk katalog (nama, kategori, harga, stok, dst -- foto dikelola manual lewat halaman Produk). Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string", description: "ID produk (dari get_products)" },
          name: { type: "string", description: "Nama baru" },
          divisions: {
            type: "array",
            items: { type: "string", enum: ["magnarent", "magnativ", "production", "umum"] },
            description: "Divisi baru",
          },
          category: { type: "string", description: "Kategori baru" },
          sku: { type: "string", description: "SKU baru" },
          price: { type: "number", description: "Harga baru" },
          unit: { type: "string", description: "Satuan baru" },
          stock: { type: "number", description: "Stok baru" },
          supplier: { type: "string", description: "Supplier baru" },
          catatan: { type: "string", description: "Catatan baru" },
        },
        required: ["productId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_warehouse",
      description: "Tambah gudang fisik baru untuk Magnarent (lokasi penempatan unit alat). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          nama: { type: "string", description: "Nama gudang" },
          alamat: { type: "string", description: "Alamat (opsional)" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["nama"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_warehouse",
      description: "Ubah data gudang Magnarent. Field yang tidak diisi TETAP memakai nilai lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          warehouseId: { type: "string", description: "ID gudang (dari get_warehouses)" },
          nama: { type: "string", description: "Nama baru" },
          alamat: { type: "string", description: "Alamat baru" },
          catatan: { type: "string", description: "Catatan baru" },
        },
        required: ["warehouseId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_subrent_status",
      description: "Ubah status catatan subrent (sewa alat dari vendor luar) Magnarent. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          subrentId: { type: "string", description: "ID catatan subrent (dari get_subrent_records)" },
          status: { type: "string", enum: ["Dipesan", "Diterima", "Dikembalikan", "Dibatalkan"], description: "Status baru" },
        },
        required: ["subrentId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_scan_update_unit_status",
      description:
        "Update status banyak unit alat Magnarent sekaligus berdasarkan kode unit/RFID tag (hasil scan QR). Kode yang tidak ketemu atau cocok ke lebih dari satu unit akan dilaporkan, bukan diubah. HARUS konfirmasi dengan user sebelum menjalankan.",
      parameters: {
        type: "object",
        properties: {
          codes: { type: "array", items: { type: "string" }, description: "Daftar kode unit atau RFID tag" },
          status: { type: "string", enum: ["Tersedia", "Dipinjam", "Maintenance", "Hilang"], description: "Status baru" },
        },
        required: ["codes", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_bom_template",
      description:
        "Ubah template BOM (Bill of Materials) Production -- nama, deskripsi, daftar item material. Field yang tidak diisi TETAP memakai nilai lama -- kecuali 'items', yang kalau diisi MENGGANTI seluruh item lama. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          templateId: { type: "string", description: "ID template BOM (dari get_bom_templates)" },
          name: { type: "string", description: "Nama baru" },
          description: { type: "string", description: "Deskripsi baru" },
          items: {
            type: "array",
            description: "Daftar item material baru (kalau diisi, MENGGANTI seluruh item lama)",
            items: {
              type: "object",
              properties: {
                materialId: { type: "string", description: "ID material (dari get_materials)" },
                qty: { type: "number", description: "Jumlah kebutuhan" },
              },
              required: ["materialId", "qty"],
            },
          },
        },
        required: ["templateId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transfer_material_stock",
      description:
        "Transfer stok material Production ke lokasi/gudang lain -- mengurangi stok lokasi asal & menambah di lokasi tujuan, serta mencatat riwayatnya. HARUS konfirmasi dengan user sebelum menjalankan.",
      parameters: {
        type: "object",
        properties: {
          materialId: { type: "string", description: "ID material (dari get_materials)" },
          materialName: { type: "string", description: "Nama material, dipakai kalau materialId belum diketahui" },
          qty: { type: "number", description: "Jumlah yang ditransfer" },
          toLocation: { type: "string", description: "Lokasi/gudang tujuan" },
          catatan: { type: "string", description: "Catatan tambahan" },
        },
        required: ["qty", "toLocation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_journal_entry",
      description:
        "Input jurnal akuntansi MANUAL (bukan dari invoice/realisasi event otomatis) -- mis. setoran modal awal, koreksi saldo, penyusutan aset. Total debit harus sama dengan total kredit. HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          entryDate: { type: "string", description: "Tanggal jurnal (YYYY-MM-DD)" },
          description: { type: "string", description: "Keterangan jurnal" },
          division: { type: "string", enum: ["magnarent", "magnative", "production"], description: "Divisi terkait (opsional)" },
          lines: {
            type: "array",
            description: "Baris jurnal, minimal 2 (debit & kredit) -- total debit harus sama dengan total kredit",
            items: {
              type: "object",
              properties: {
                accountCode: { type: "string", description: "Kode akun (dari get_chart_of_accounts)" },
                debit: { type: "number", description: "Nominal debit (isi 0 kalau baris ini kredit)" },
                credit: { type: "number", description: "Nominal kredit (isi 0 kalau baris ini debit)" },
                notes: { type: "string", description: "Catatan baris (opsional)" },
              },
              required: ["accountCode"],
            },
          },
        },
        required: ["entryDate", "description", "lines"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_account",
      description: "Tambah akun baru ke Daftar Akun (Chart of Accounts). HARUS konfirmasi dengan user sebelum menyimpan.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Kode akun" },
          name: { type: "string", description: "Nama akun" },
          type: { type: "string", enum: ["Aset", "Kewajiban", "Modal", "Pendapatan", "Beban"], description: "Tipe akun" },
          subtype: { type: "string", description: "Subtipe akun (opsional)" },
          normalBalance: { type: "string", enum: ["Debit", "Kredit"], description: "Saldo normal" },
          description: { type: "string", description: "Deskripsi akun (opsional)" },
        },
        required: ["code", "name", "type", "normalBalance"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_account_active",
      description:
        "Aktifkan/nonaktifkan akun di Daftar Akun -- akun yang sudah pernah dipakai di jurnal tidak bisa dihapus, cukup dinonaktifkan supaya tidak muncul lagi di pilihan akun baru. HARUS konfirmasi dengan user sebelum mengubah.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "ID akun (dari get_chart_of_accounts)" },
          isActive: { type: "boolean", description: "true = aktifkan, false = nonaktifkan" },
        },
        required: ["accountId", "isActive"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_portal_link",
      description:
        "Buat link portal klien (akses tanpa login) untuk satu booking/proyek Magnarent/Magnativ/Production -- dipakai tombol 'Bagikan ke Klien'. HARUS konfirmasi dengan user sebelum membuat.",
      parameters: {
        type: "object",
        properties: {
          module: { type: "string", enum: ["magnarent", "magnative", "production"], description: "Modul entitas" },
          entityId: { type: "string", description: "ID booking/proyek" },
          clientName: { type: "string", description: "Nama klien (opsional, buat tampil di panel)" },
          expiresInDays: { type: "number", description: "Link berlaku berapa hari (opsional, kosong = tidak kedaluwarsa)" },
        },
        required: ["module", "entityId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "revoke_portal_link",
      description: "Cabut/nonaktifkan satu link portal klien yang sudah dibuat (mis. salah kirim atau proyek batal). HARUS konfirmasi dengan user sebelum mencabut.",
      parameters: {
        type: "object",
        properties: {
          linkId: { type: "string", description: "ID link portal (dari get_portal_links)" },
          module: { type: "string", enum: ["magnarent", "magnative", "production"], description: "Modul entitas" },
        },
        required: ["linkId", "module"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_notification_read",
      description: "Tandai satu notifikasi in-app milik user yang sedang chat sebagai sudah dibaca. HARUS konfirmasi dengan user sebelum menjalankan.",
      parameters: {
        type: "object",
        properties: {
          notificationId: { type: "string", description: "ID notifikasi (dari get_my_notifications)" },
        },
        required: ["notificationId"],
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
    get_event_detail: ctx.canAccessEvents,
    create_event_expense: ctx.canAccessExpenses,
    get_invoices: ctx.canAccessInvoices,
    get_capital_requests: ctx.canAccessCapital,
    get_purchase_orders: ctx.canAccessPurchaseOrders,
    get_expenses: ctx.canAccessExpenses,
    get_daily_summary: true,
    get_maintenance_logs: ctx.canAccessMagnarent,
    get_deliveries: ctx.canAccessMagnarent,
    add_maintenance_log: ctx.canAccessMagnarent,
    schedule_delivery: ctx.canAccessMagnarent,
    get_project_tasks: ctx.canAccessMagnative,
    get_content_posts: ctx.canAccessMagnative,
    add_project_task: ctx.canAccessMagnative,
    update_project_task_status: ctx.canAccessMagnative,
    get_equipment: ctx.canAccessProduction,
    get_project_crew: ctx.canAccessProduction,
    receive_purchase_order: ctx.canAccessPurchaseOrders,
    update_production_status: ctx.canAccessProduction,
    get_chart_of_accounts: ctx.canAccessAccounting,
    get_journal_entries: ctx.canAccessAccounting,
    create_capital_request: ctx.canAccessAdmin,
    add_inventory_item: ctx.canAccessMagnarent,
    update_inventory_item: ctx.canAccessMagnarent,
    add_client: ctx.canAccessMagnative,
    update_client: ctx.canAccessMagnative,
    add_material: ctx.canAccessProduction,
    update_material: ctx.canAccessProduction,
    add_purchase_order: ctx.canAccessPurchaseOrders,
    mark_invoice_status: ctx.canAccessInvoices,
    get_warehouses: ctx.canAccessMagnarent,
    get_subrent_records: ctx.canAccessMagnarent,
    add_subrent_record: ctx.canAccessMagnarent,
    get_checkin_links: ctx.canAccessMagnative,
    create_checkin_link: ctx.canAccessMagnative,
    add_magnative_vendor: ctx.canAccessMagnative,
    update_magnative_vendor: ctx.canAccessMagnative,
    get_production_vendors: ctx.canAccessProduction,
    add_production_vendor: ctx.canAccessProduction,
    update_production_vendor: ctx.canAccessProduction,
    get_nc_reports: ctx.canAccessProduction,
    add_nc_report: ctx.canAccessProduction,
    update_nc_report_progress: ctx.canAccessProduction,
    get_subcontract_orders: ctx.canAccessProduction,
    add_subcontract_order: ctx.canAccessProduction,
    update_subcontract_status: ctx.canAccessProduction,
    get_bom_templates: ctx.canAccessProduction,
    add_bom_template: ctx.canAccessProduction,
    get_crew_timelogs: ctx.canAccessProduction,
    add_crew_timelog: ctx.canAccessProduction,
    get_inventory_units: ctx.canAccessMagnarent,
    get_warehouse_transfers: ctx.canAccessMagnarent,
    transfer_unit_to_warehouse: ctx.canAccessMagnarent,
    get_booking_deposit: ctx.canAccessMagnarent,
    save_booking_deposit: ctx.canAccessMagnarent,
    set_deposit_returned: ctx.canAccessMagnarent,
    get_seasonal_pricing_rules: ctx.canAccessMagnarent,
    add_seasonal_pricing_rule: ctx.canAccessMagnarent,
    get_crew_assignments: ctx.canAccessMagnarent,
    add_crew_assignment: ctx.canAccessMagnarent,
    get_equipment_usage: ctx.canAccessProduction,
    add_equipment: ctx.canAccessProduction,
    update_equipment: ctx.canAccessProduction,
    add_equipment_usage: ctx.canAccessProduction,
    mark_equipment_usage_returned: ctx.canAccessProduction,
    get_crew_piece_payments: ctx.canAccessProduction,
    add_crew_piece_payment: ctx.canAccessProduction,
    update_crew_piece_payment_status: ctx.canAccessProduction,
    add_project_crew: ctx.canAccessProduction,
    get_portfolio_folders: ctx.canAccessMagnative,
    get_asset_comments: ctx.canAccessMagnative,
    get_content_requests: ctx.canAccessMagnative,
    get_project_vendors: ctx.canAccessMagnative,
    add_magnative_project: ctx.canAccessMagnative,
    update_magnative_project: ctx.canAccessMagnative,
    add_project_cost: ctx.canAccessMagnative,
    update_project_cost: ctx.canAccessMagnative,
    add_content_post: ctx.canAccessMagnative,
    update_content_post: ctx.canAccessMagnative,
    update_content_status: ctx.canAccessMagnative,
    add_content_request: ctx.canAccessMagnative,
    update_content_request_status: ctx.canAccessMagnative,
    add_project_vendor: ctx.canAccessMagnative,
    update_project_vendor: ctx.canAccessMagnative,
    update_project_task: ctx.canAccessMagnative,
    update_project_pipeline_stage: ctx.canAccessMagnative,
    add_asset_comment: ctx.canAccessMagnative,
    set_asset_comment_resolved: ctx.canAccessMagnative,
    cancel_purchase_order: ctx.canAccessPurchaseOrders,
    decide_capital_request: ctx.canAccessCapital,
    update_event_expense: ctx.canAccessExpenses,
    get_products: true,
    add_product: ctx.canAccessAdmin,
    update_product: ctx.canAccessAdmin,
    get_my_notifications: true,
    mark_notification_read: true,
    check_crew_conflicts: ctx.canAccessMagnarent,
    add_warehouse: ctx.canAccessMagnarent,
    update_warehouse: ctx.canAccessMagnarent,
    update_subrent_status: ctx.canAccessMagnarent,
    bulk_scan_update_unit_status: ctx.canAccessMagnarent,
    get_material_transfers: ctx.canAccessProduction,
    get_project_documents: ctx.canAccessProduction,
    update_bom_template: ctx.canAccessProduction,
    transfer_material_stock: ctx.canAccessProduction,
    add_invoice: ctx.canAccessInvoices,
    update_invoice: ctx.canAccessInvoices,
    send_invoice_whatsapp: ctx.canAccessInvoices,
    add_journal_entry: ctx.canAccessAccounting,
    add_account: ctx.canAccessAccounting,
    set_account_active: ctx.canAccessAccounting,
    get_portal_links: ctx.canAccessMagnarent || ctx.canAccessMagnative || ctx.canAccessProduction,
    create_portal_link: ctx.canAccessMagnarent || ctx.canAccessMagnative || ctx.canAccessProduction,
    revoke_portal_link: ctx.canAccessMagnarent || ctx.canAccessMagnative || ctx.canAccessProduction,
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
  const COMMON_TOOLS = [
    "search_global",
    "get_daily_summary",
    "get_events",
    "get_event_detail",
    "get_products",
    "get_my_notifications",
    "mark_notification_read",
  ];
  const MAGNARENT_TOOLS = [
    ...COMMON_TOOLS,
    "get_bookings",
    "get_inventory",
    "check_availability",
    "create_booking",
    "update_booking_status",
    "get_maintenance_logs",
    "get_deliveries",
    "add_maintenance_log",
    "schedule_delivery",
    "add_inventory_item",
    "update_inventory_item",
    "get_warehouses",
    "add_warehouse",
    "update_warehouse",
    "get_subrent_records",
    "add_subrent_record",
    "update_subrent_status",
    "get_inventory_units",
    "bulk_scan_update_unit_status",
    "get_warehouse_transfers",
    "transfer_unit_to_warehouse",
    "get_booking_deposit",
    "save_booking_deposit",
    "set_deposit_returned",
    "get_seasonal_pricing_rules",
    "add_seasonal_pricing_rule",
    "get_crew_assignments",
    "add_crew_assignment",
    "check_crew_conflicts",
    "get_portal_links",
    "create_portal_link",
    "revoke_portal_link",
  ];
  const MAGNATIVE_TOOLS = [
    ...COMMON_TOOLS,
    "get_clients",
    "get_projects",
    "get_project_tasks",
    "get_content_posts",
    "add_project_task",
    "update_project_task_status",
    "add_client",
    "update_client",
    "get_checkin_links",
    "create_checkin_link",
    "add_magnative_vendor",
    "update_magnative_vendor",
    "get_portfolio_folders",
    "get_asset_comments",
    "get_content_requests",
    "get_project_vendors",
    "add_magnative_project",
    "update_magnative_project",
    "add_project_cost",
    "update_project_cost",
    "add_content_post",
    "update_content_post",
    "update_content_status",
    "add_content_request",
    "update_content_request_status",
    "add_project_vendor",
    "update_project_vendor",
    "update_project_task",
    "update_project_pipeline_stage",
    "add_asset_comment",
    "set_asset_comment_resolved",
    "get_portal_links",
    "create_portal_link",
    "revoke_portal_link",
  ];
  const PRODUCTION_TOOLS = [
    ...COMMON_TOOLS,
    "get_materials",
    "get_projects",
    "get_purchase_orders",
    "get_equipment",
    "get_project_crew",
    "receive_purchase_order",
    "cancel_purchase_order",
    "update_production_status",
    "add_material",
    "update_material",
    "add_purchase_order",
    "get_production_vendors",
    "add_production_vendor",
    "update_production_vendor",
    "get_material_transfers",
    "transfer_material_stock",
    "get_project_documents",
    "update_bom_template",
    "get_portal_links",
    "create_portal_link",
    "revoke_portal_link",
    "get_nc_reports",
    "add_nc_report",
    "update_nc_report_progress",
    "get_subcontract_orders",
    "add_subcontract_order",
    "update_subcontract_status",
    "get_bom_templates",
    "add_bom_template",
    "get_crew_timelogs",
    "add_crew_timelog",
    "get_equipment_usage",
    "add_equipment",
    "update_equipment",
    "add_equipment_usage",
    "mark_equipment_usage_returned",
    "get_crew_piece_payments",
    "add_crew_piece_payment",
    "update_crew_piece_payment_status",
    "add_project_crew",
  ];
  const FINANCE_TOOLS = [
    ...COMMON_TOOLS,
    "create_event_expense",
    "get_invoices",
    "get_expenses",
    "get_capital_requests",
    "get_chart_of_accounts",
    "get_journal_entries",
    "create_capital_request",
    "mark_invoice_status",
    "decide_capital_request",
    "update_event_expense",
    "add_invoice",
    "update_invoice",
    "send_invoice_whatsapp",
    "add_journal_entry",
    "add_account",
    "set_account_active",
  ];
  const EVENT_TOOLS = [...COMMON_TOOLS, "create_event_expense"];

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
