import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  BellRing,
  BookOpenText,
  Bot,
  Boxes,
  CalendarClock,
  ClipboardList,
  Factory,
  Gamepad2,
  HandCoins,
  History,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  Receipt,
  ReceiptText,
  Scale,
  TrendingUp,
  Users,
  Users2,
  Wallet,
  Wallet2,
  Wrench,
} from "lucide-react";

/** Katalog Produk read-only untuk semua tim (Tahap 29) — satu halaman
 * bersama di luar prefix modul divisi manapun (lihat src/middleware.ts),
 * ditautkan dari subnav ketiga modul supaya gampang ditemukan staf. */
const KATALOG_PRODUK_SUBNAV: SubNavItem = { label: "Katalog Produk", href: "/dashboard/katalog-produk" };

export type SubNavItem = {
  label: string;
  href: string;
};

export type ModuleConfig = {
  id: string;
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
  /** Logo resmi divisi (Tahap 31) — file gambar dari desainer brand
   * (`public/brand/*.png`), dipakai di badge `ModuleHeader` & kartu modul di
   * Dashboard Hub menggantikan ikon Lucide generik. `icon` di atas
   * dipertahankan sebagai fallback (dipakai di daftar Sidebar/MobileNav yang
   * ruangnya terlalu sempit untuk logo lockup, dan buat modul yang suatu
   * saat belum punya logo resmi). */
  logo: string;
  gradient: string;
  solid: string;
  soft: string;
  subnav: SubNavItem[];
};

export const HUB_HREF = "/dashboard";

// Tahap 31: diambil LANGSUNG dari warna asli tiga logo resmi divisi (emas
// Production, merah Magnarent, teal Magnativ — lihat MODULES di bawah)
// supaya identitas brand keseluruhan aplikasi benar-benar senada dengan
// logo resmi, bukan cuma perkiraan warna dari render 3D ikon (Tahap 30).
export const BRAND_GRADIENT =
  "linear-gradient(135deg, #D4AF37 0%, #E5484D 50%, #0B7A63 100%)";

export const MODULES: ModuleConfig[] = [
  {
    id: "magnative",
    label: "Magnativ",
    href: "/dashboard/magnative",
    description: "Manajemen EO, creative agency & media sosial",
    icon: Megaphone,
    logo: "/brand/magnativ-logo.png",
    // Tahap 31: teal, diambil dari logo resmi Magnativ (sebelumnya ungu/pink generik)
    gradient: "linear-gradient(135deg, #0B7A63 0%, #14B8A6 100%)",
    solid: "#0B7A63",
    soft: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300",
    subnav: [
      { label: "Ringkasan", href: "/dashboard/magnative" },
      { label: "Sosial Media", href: "/dashboard/magnative/sosial-media" },
      { label: "Permintaan Konten", href: "/dashboard/magnative/permintaan" },
      { label: "Aset Kreatif", href: "/dashboard/magnative/aset" },
      { label: "Klien", href: "/dashboard/magnative/klien" },
      { label: "Proyek", href: "/dashboard/magnative/proyek" },
      KATALOG_PRODUK_SUBNAV,
    ],
  },
  {
    id: "magnarent",
    label: "Magnarent",
    href: "/dashboard/magnarent",
    description: "Rental booking, inventaris & kalender interaktif",
    icon: CalendarClock,
    logo: "/brand/magnarent-logo.png",
    // Tahap 31: navy -> merah, diambil dari logo resmi Magnarent (sebelumnya biru/cyan generik)
    gradient: "linear-gradient(135deg, #262C3A 0%, #E5484D 100%)",
    solid: "#E5484D",
    soft: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
    subnav: [
      { label: "Ringkasan", href: "/dashboard/magnarent" },
      { label: "Inventaris", href: "/dashboard/magnarent/inventaris" },
      { label: "Kalender", href: "/dashboard/magnarent/kalender" },
      { label: "Booking", href: "/dashboard/magnarent/booking" },
      { label: "Perputaran", href: "/dashboard/magnarent/utilisasi" },
      KATALOG_PRODUK_SUBNAV,
    ],
  },
  {
    id: "production",
    label: "Production",
    href: "/dashboard/production",
    description: "Produksi booth, interior & material gudang",
    icon: Factory,
    logo: "/brand/production-logo.png",
    // Tahap 31: emas, diambil dari logo resmi Production (sebelumnya amber/merah generik)
    gradient: "linear-gradient(135deg, #B8860B 0%, #F4D35E 100%)",
    solid: "#B8860B",
    soft: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    subnav: [
      { label: "Ringkasan", href: "/dashboard/production" },
      { label: "Material", href: "/dashboard/production/material" },
      { label: "Proyek Booth", href: "/dashboard/production/proyek" },
      { label: "Template BOM", href: "/dashboard/production/bom" },
      { label: "Dokumentasi", href: "/dashboard/production/dokumentasi" },
      { label: "Alat & Perkakas", href: "/dashboard/production/alat" },
      { label: "Jadwal", href: "/dashboard/production/jadwal" },
      { label: "Pemakaian & MRP", href: "/dashboard/production/pemakaian" },
      { label: "Pembelian", href: "/dashboard/production/pembelian" },
      { label: "Vendor", href: "/dashboard/production/vendor" },
      { label: "NC/CAPA", href: "/dashboard/production/kualitas" },
      KATALOG_PRODUK_SUBNAV,
    ],
  },
];

export type QuickLink = {
  href: string;
  /** Label lengkap — dipakai Sidebar (layar lebar, ruang cukup). */
  label: string;
  /** Label singkat — dipakai MobileNav (pill horizontal-scroll, ruang sempit). */
  shortLabel: string;
  icon: LucideIcon;
};

/**
 * Tautan halaman Admin (khusus division "all") — SATU-SATUNYA sumber untuk
 * Sidebar (desktop) & MobileNav (HP). Sebelumnya dua array terpisah nyaris
 * identik ditulis manual di kedua komponen itu — sekali nambah halaman Admin
 * baru dan lupa update salah satu file, tampilan desktop & HP jadi beda
 * sendiri tanpa ada yang sadar. Sekarang cukup tambah satu baris di sini.
 */
export const ADMIN_LINKS: QuickLink[] = [
  { href: "/dashboard/admin/pengguna", label: "Kelola Pengguna", shortLabel: "Pengguna", icon: Users },
  { href: "/dashboard/admin/notifikasi", label: "Kirim Notifikasi", shortLabel: "Notifikasi", icon: BellRing },
  { href: "/dashboard/admin/laporan", label: "Laporan", shortLabel: "Laporan", icon: BarChart3 },
  { href: "/dashboard/admin/aktivitas", label: "Aktivitas", shortLabel: "Aktivitas", icon: History },
  { href: "/dashboard/admin/klien", label: "Klien Terpadu", shortLabel: "Klien", icon: Users2 },
  { href: "/dashboard/admin/keuangan", label: "Piutang & Pendapatan", shortLabel: "Piutang", icon: Wallet2 },
  { href: "/dashboard/admin/akuntansi", label: "Akuntansi", shortLabel: "Akuntansi", icon: BookOpenText },
  { href: "/dashboard/admin/events", label: "Event", shortLabel: "Event", icon: CalendarClock },
  { href: "/dashboard/admin/laba-rugi", label: "Laba-Rugi", shortLabel: "Laba-Rugi", icon: TrendingUp },
  { href: "/dashboard/admin/neraca", label: "Neraca", shortLabel: "Neraca", icon: Scale },
  { href: "/dashboard/admin/arus-kas-akuntansi", label: "Arus Kas (Jurnal)", shortLabel: "Arus Kas Jurnal", icon: Wallet },
  { href: "/dashboard/admin/produk", label: "Katalog Produk", shortLabel: "Produk", icon: Boxes },
  { href: "/dashboard/admin/faktur", label: "Faktur", shortLabel: "Faktur", icon: Receipt },
  { href: "/dashboard/admin/arus-kas", label: "Arus Kas Proyek", shortLabel: "Arus Kas", icon: ArrowLeftRight },
  { href: "/dashboard/admin/pengajuan-modal", label: "Pengajuan Modal", shortLabel: "Pengajuan Modal", icon: HandCoins },
  { href: "/dashboard/admin/status-sistem", label: "Status Sistem", shortLabel: "Status", icon: Wrench },
];

/**
 * Tahap 35 — Laporan & Aktivitas dibuka ke 3 divisi operasional (Magnarent/
 * Magnative/Production), TAPI versi read-only & dibatasi cuma data divisi
 * sendiri (lihat page.tsx masing-masing — cabang selain division "all").
 * SENGAJA array terpisah dari ADMIN_LINKS (bukan filter dari situ) supaya
 * urutan/isinya bisa berubah independen tanpa mengubah menu akses penuh.
 */
export const DIVISION_REPORT_LINKS: QuickLink[] = [
  { href: "/dashboard/admin/laporan", label: "Laporan", shortLabel: "Laporan", icon: BarChart3 },
  { href: "/dashboard/admin/aktivitas", label: "Aktivitas", shortLabel: "Aktivitas", icon: History },
];

/**
 * Tautan Chat (Tahap 37) — SATU-SATUNYA halaman ini, tapi tetap dibungkus
 * `QuickLink` (bukan string href polos) supaya Sidebar/MobileNav bisa
 * render dengan komponen tombol yang sama seperti tautan admin/laporan
 * lainnya. Terbuka untuk SEMUA divisi KECUALI investor (lihat isInvestor
 * di Sidebar.tsx/MobileNav.tsx) — investor juga diblokir middleware.ts &
 * RLS chat_messages (migrasi 0038), ini cuma soal tautannya ditampilkan
 * atau tidak.
 */
export const CHAT_LINK: QuickLink = {
  href: "/dashboard/chat",
  label: "Chat",
  shortLabel: "Chat",
  icon: MessageSquare,
};

/**
 * Tautan "Realisasi Event" (Tahap B modul baru, didiskusikan dulu dengan
 * Owner) — pencatatan pengeluaran lintas 3 divisi + Finance/Umum. Terbuka
 * untuk SEMUA divisi KECUALI investor, sama persis alasannya dengan
 * CHAT_LINK di atas (lihat RLS `event_expenses` di migrasi 0049) — sengaja
 * satu QuickLink berdiri sendiri (bukan masuk MODULES) karena bukan milik
 * satu divisi tertentu, sama seperti Katalog Produk & Chat.
 */
export const REALISASI_EVENT_LINK: QuickLink = {
  href: "/dashboard/realisasi-event",
  label: "Realisasi Event",
  shortLabel: "Realisasi",
  icon: ReceiptText,
};

/**
 * Tautan "Papan Tracking" (Tahap D modul Tracking Progress Event) — sama
 * persis alasannya dengan REALISASI_EVENT_LINK di atas: terbuka untuk
 * SEMUA divisi KECUALI investor (lihat RLS event_checklist_items_update di
 * migrasi 0053 & src/middleware.ts).
 */
export const TRACKING_EVENT_LINK: QuickLink = {
  href: "/dashboard/tracking-event",
  label: "Papan Tracking",
  shortLabel: "Tracking",
  icon: ClipboardList,
};

/**
 * Tautan "Kantor Virtual" (Tahap H, permintaan Owner: model kantor virtual
 * 2D yang lagi viral) — beda dari CHAT_LINK/REALISASI_EVENT_LINK/
 * TRACKING_EVENT_LINK di atas: SENGAJA terbuka untuk LITERALLY SEMUA
 * divisi TERMASUK investor & finance (jadi dirender TANPA embel-embel
 * `showChat`/`isInvestor` di Sidebar.tsx & MobileNav.tsx) — ini murni
 * kolaborasi & suasana kantor, bukan modul data operasional, tidak ada
 * alasan menutup siapa pun.
 */
export const VIRTUAL_OFFICE_LINK: QuickLink = {
  href: "/dashboard/kantor-virtual",
  label: "Kantor Virtual",
  shortLabel: "Kantor",
  icon: Gamepad2,
};

/**
 * Tautan "Asisten AI" (Tahap 80) — terkoneksi ke 9Router/Hermes, gateway AI
 * self-hosted milik Magna. SENGAJA terbuka untuk SEMUA divisi TERMASUK
 * investor (beda dari Chat tim yang menutup investor) — percakapan bersifat
 * PRIBADI per-user, tidak ada akses lintas-user.
 */
export const AI_ASSISTANT_LINK: QuickLink = {
  href: "/dashboard/ai-assistant",
  label: "Asisten AI",
  shortLabel: "AI",
  icon: Bot,
};

/** Tautan halaman Investor (division "investor" atau "all") — sama alasannya dengan ADMIN_LINKS di atas. */
export const INVESTOR_LINKS: QuickLink[] = [
  { href: "/dashboard/investor", label: "Ringkasan Investor", shortLabel: "Ringkasan", icon: LayoutGrid },
  {
    href: "/dashboard/investor/pengajuan-modal",
    label: "Pengajuan Modal",
    shortLabel: "Pengajuan Modal",
    icon: HandCoins,
  },
];

/**
 * Tautan khusus division "finance" (migrasi 0061_finance_role.sql) — SUBSET
 * dari ADMIN_LINKS, cuma 7 halaman keuangan. Sisanya (Kelola Pengguna,
 * Kirim Notifikasi, Laporan, Aktivitas, Klien Terpadu, Jenis Event, Event,
 * Katalog Produk, Pengajuan Modal, Status Sistem) TETAP tertutup untuk
 * Finance -- itu urusan Owner/Admin. Array terpisah (bukan filter dari
 * ADMIN_LINKS) sama alasannya dengan DIVISION_REPORT_LINKS/INVESTOR_LINKS:
 * urutan/isinya independen dari menu akses penuh.
 */
export const FINANCE_LINKS: QuickLink[] = [
  { href: "/dashboard/admin/keuangan", label: "Piutang & Pendapatan", shortLabel: "Piutang", icon: Wallet2 },
  { href: "/dashboard/admin/akuntansi", label: "Akuntansi", shortLabel: "Akuntansi", icon: BookOpenText },
  { href: "/dashboard/admin/laba-rugi", label: "Laba-Rugi", shortLabel: "Laba-Rugi", icon: TrendingUp },
  { href: "/dashboard/admin/neraca", label: "Neraca", shortLabel: "Neraca", icon: Scale },
  { href: "/dashboard/admin/arus-kas-akuntansi", label: "Arus Kas (Jurnal)", shortLabel: "Arus Kas Jurnal", icon: Wallet },
  { href: "/dashboard/admin/faktur", label: "Faktur", shortLabel: "Faktur", icon: Receipt },
  { href: "/dashboard/admin/arus-kas", label: "Arus Kas Proyek", shortLabel: "Arus Kas", icon: ArrowLeftRight },
];

export function getModuleByPath(pathname: string): ModuleConfig | undefined {
  return MODULES.find(
    (mod) => pathname === mod.href || pathname.startsWith(`${mod.href}/`)
  );
}

/**
 * Modul yang boleh dilihat pengguna sesuai divisinya — dipakai Sidebar,
 * MobileNav, dan Hub supaya staf satu bagian tidak melihat tautan ke modul
 * lain yang toh akan diblokir middleware kalau diklik. `division` "all"
 * (Owner/Finance/Investor) atau kosong (fallback aman) melihat semuanya.
 */
export function getVisibleModules(division?: string | null): ModuleConfig[] {
  if (division === "all") return MODULES;
  // Investor punya area sendiri (/dashboard/investor, read only lintas
  // divisi) — bukan modul operasional biasa, jadi sengaja tidak ditampilkan
  // di sini (lihat Sidebar.tsx untuk tautan investor).
  if (division === "investor") return [];
  // Finance punya area sendiri juga (FINANCE_LINKS -- halaman keuangan),
  // sama sekali bukan modul operasional Magnarent/Magnativ/Production.
  if (division === "finance") return [];
  // Fail-closed: divisi tidak dikenali/kosong dianggap akses paling
  // terbatas, konsisten dengan default di getCurrentProfile().
  return MODULES.filter((mod) => mod.id === (division ?? "production"));
}
