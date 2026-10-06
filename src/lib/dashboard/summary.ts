import { createClient } from "@/lib/supabase/server";
import { ACTIVE_BOOTH_STATUSES } from "@/lib/production/availability";
import { formatDateID, isoDaysFromNow, todayISO } from "@/lib/shared/utils";

/**
 * Angka ringkasan untuk Dashboard Hub (`src/app/dashboard/page.tsx`).
 * Sengaja pakai client Supabase biasa (bukan admin/service-role) — RLS
 * per modul (migrasi 0004-0006) sudah otomatis membatasi baris yang
 * terhitung cuma milik divisi staf yang login (atau semua, untuk akun
 * akses penuh), jadi tidak perlu filter divisi manual di sini. Kalau
 * dipanggil oleh staf yang tidak punya akses ke modul terkait, hasilnya
 * otomatis 0 (bukan error) — pemanggil tetap harus mengecek visibilitas
 * modul dulu (lihat getVisibleModules) supaya kartu yang tidak relevan
 * tidak ditampilkan sama sekali.
 */

export type MagnarentSummary = { bookingAktif: number; bookingBulanIni: number };

export async function getMagnarentSummary(): Promise<MagnarentSummary> {
  const supabase = await createClient();
  // Awal bulan menurut WIB (server Vercel berjalan di UTC -- dulu 7 jam
  // pertama bulan baru masih menghitung seluruh bulan lalu).
  const startOfMonth = `${todayISO().slice(0, 7)}-01T00:00:00+07:00`;

  const [aktif, bulanIni] = await Promise.all([
    supabase
      .from("magnarent_bookings")
      .select("id", { count: "exact", head: true })
      .in("status", ["Menunggu", "Dikonfirmasi"]),
    supabase
      .from("magnarent_bookings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth),
  ]);

  return {
    bookingAktif: aktif.count ?? 0,
    bookingBulanIni: bulanIni.count ?? 0,
  };
}

export type MagnativeSummary = { proyekBerjalan: number; kontenMingguIni: number };

export async function getMagnativeSummary(): Promise<MagnativeSummary> {
  const supabase = await createClient();
  const today = todayISO();
  const in7Days = isoDaysFromNow(7);

  const [berjalan, konten] = await Promise.all([
    supabase.from("magnative_projects").select("id", { count: "exact", head: true }).eq("status", "Berjalan"),
    supabase
      .from("magnative_content_posts")
      .select("id", { count: "exact", head: true })
      .gte("tanggal_posting", today)
      .lte("tanggal_posting", in7Days),
  ]);

  return {
    proyekBerjalan: berjalan.count ?? 0,
    kontenMingguIni: konten.count ?? 0,
  };
}

export type ProductionSummary = { proyekAktif: number; stokMenipis: number };

export async function getProductionSummary(): Promise<ProductionSummary> {
  const supabase = await createClient();

  const [aktif, materials] = await Promise.all([
    supabase
      .from("production_booth_projects")
      .select("id", { count: "exact", head: true })
      .in("status", ACTIVE_BOOTH_STATUSES),
    supabase.from("production_materials").select("stock, min_stock"),
  ]);

  // Perbandingan dua kolom (stock <= min_stock) tidak didukung langsung
  // lewat filter PostgREST biasa, jadi dihitung di JS — tabel material
  // biasanya kecil (puluhan baris), jadi ini tetap murah.
  const stokMenipis = (materials.data ?? []).filter(
    (m: { stock: number; min_stock: number }) => m.stock <= m.min_stock
  ).length;

  return {
    proyekAktif: aktif.count ?? 0,
    stokMenipis,
  };
}

/**
 * Pengingat Otomatis (Tahap 43 — permintaan Owner): "muncul sebagai
 * notifikasi di dalam app" tanpa perlu infrastruktur baru (tidak ada cron
 * job Vercel, tidak ada tabel baru) — dihitung LANGSUNG dari data yang
 * sudah ada setiap kali Dashboard Hub dibuka, mirip pola getMagnarentSummary
 * dkk di atas (client Supabase biasa, RLS yang membatasi baris per divisi).
 * Sengaja tidak dipersist ke tabel manapun: begitu kondisinya sudah tidak
 * lagi terpenuhi (booking sudah lewat, stok sudah diisi ulang), pengingatnya
 * otomatis hilang sendiri tanpa perlu ditandai "sudah dibaca" secara manual.
 */
export type ReminderSeverity = "danger" | "warning";

export type Reminder = {
  id: string;
  severity: ReminderSeverity;
  title: string;
  detail: string;
  href: string;
};

const REMINDER_WINDOW_BOOKING_DAYS = 2;
const REMINDER_WINDOW_DEADLINE_DAYS = 3;

async function getMagnarentReminders(): Promise<Reminder[]> {
  const supabase = await createClient();
  const today = todayISO();
  const windowEnd = isoDaysFromNow(REMINDER_WINDOW_BOOKING_DAYS);

  const [bookingsRes, maintenanceRes] = await Promise.all([
    supabase
      .from("magnarent_bookings")
      .select("id, nama_klien, tanggal_mulai")
      .in("status", ["Menunggu", "Dikonfirmasi"])
      .gte("tanggal_mulai", today)
      .lte("tanggal_mulai", windowEnd)
      .order("tanggal_mulai", { ascending: true }),
    // "Pelacakan kondisi alat" (permintaan Owner) sudah ada duluan lewat
    // Riwayat Servis per alat (Tahap 28a, lihat MaintenanceLogModal.tsx) —
    // bukan dibangun ulang, cukup disurfacekan di sini: alat yang field
    // `unit_maintenance`-nya > 0 (sedang diperbaiki/servis) ikut muncul
    // sebagai pengingat, supaya tidak ada yang lupa alat itu masih belum
    // siap disewakan lagi.
    supabase.from("magnarent_inventory").select("id, name, unit_maintenance, total_unit").gt("unit_maintenance", 0),
  ]);

  const bookingReminders: Reminder[] = (bookingsRes.data ?? []).map((b) => ({
    id: `booking-${b.id}`,
    severity: b.tanggal_mulai === today ? "danger" : "warning",
    title: "Booking segera mulai",
    detail: `${b.nama_klien} — mulai ${formatDateID(b.tanggal_mulai)}`,
    href: "/dashboard/magnarent/booking",
  }));

  const maintenanceReminders: Reminder[] = (maintenanceRes.data ?? []).map((m) => ({
    id: `maintenance-${m.id}`,
    severity: m.unit_maintenance >= m.total_unit ? "danger" : "warning",
    title: "Alat sedang maintenance",
    detail: `${m.name}: ${m.unit_maintenance} dari ${m.total_unit} unit belum siap disewakan`,
    href: "/dashboard/magnarent/inventaris",
  }));

  return [...bookingReminders, ...maintenanceReminders];
}

async function getMagnativeReminders(): Promise<Reminder[]> {
  const supabase = await createClient();
  const today = todayISO();
  const windowEnd = isoDaysFromNow(REMINDER_WINDOW_DEADLINE_DAYS);

  const [projectsRes, contentRes] = await Promise.all([
    supabase
      .from("magnative_projects")
      .select("id, name, tanggal_selesai")
      .in("status", ["Perencanaan", "Berjalan"])
      .gte("tanggal_selesai", today)
      .lte("tanggal_selesai", windowEnd)
      .order("tanggal_selesai", { ascending: true }),
    supabase
      .from("magnative_content_requests")
      .select("id, title, deadline")
      .in("status", ["Baru", "Diproses"])
      .not("deadline", "is", null)
      .gte("deadline", today)
      .lte("deadline", windowEnd)
      .order("deadline", { ascending: true }),
  ]);

  const projectReminders: Reminder[] = (projectsRes.data ?? []).map((p) => ({
    id: `proyek-${p.id}`,
    severity: p.tanggal_selesai === today ? "danger" : "warning",
    title: "Proyek mendekati tenggat",
    detail: `${p.name} — selesai ${formatDateID(p.tanggal_selesai)}`,
    href: "/dashboard/magnative/proyek",
  }));

  const contentReminders: Reminder[] = (contentRes.data ?? [])
    .filter((c): c is { id: string; title: string; deadline: string } => Boolean(c.deadline))
    .map((c) => ({
      id: `konten-${c.id}`,
      severity: c.deadline === today ? "danger" : "warning",
      title: "Permintaan konten mendekati deadline",
      detail: `${c.title} — deadline ${formatDateID(c.deadline)}`,
      href: "/dashboard/magnative/permintaan",
    }));

  return [...projectReminders, ...contentReminders];
}

async function getProductionReminders(): Promise<Reminder[]> {
  const supabase = await createClient();
  const today = todayISO();
  const windowEnd = isoDaysFromNow(REMINDER_WINDOW_DEADLINE_DAYS);

  const [materialsRes, boothRes] = await Promise.all([
    supabase.from("production_materials").select("id, name, unit, stock, min_stock"),
    supabase
      .from("production_booth_projects")
      .select("id, name, nama_klien, tanggal_instalasi")
      .in("status", ACTIVE_BOOTH_STATUSES)
      .gte("tanggal_instalasi", today)
      .lte("tanggal_instalasi", windowEnd)
      .order("tanggal_instalasi", { ascending: true }),
  ]);

  const stockReminders: Reminder[] = (materialsRes.data ?? [])
    .filter((m) => m.stock <= m.min_stock)
    .map((m) => ({
      id: `stok-${m.id}`,
      severity: m.stock <= 0 ? "danger" : "warning",
      title: "Stok material menipis",
      detail: `${m.name}: sisa ${m.stock} ${m.unit} (minimum ${m.min_stock} ${m.unit})`,
      href: "/dashboard/production/material",
    }));

  const boothReminders: Reminder[] = (boothRes.data ?? []).map((p) => ({
    id: `instalasi-${p.id}`,
    severity: p.tanggal_instalasi === today ? "danger" : "warning",
    title: "Instalasi booth mendekat",
    detail: `${p.name} — ${p.nama_klien}, instalasi ${formatDateID(p.tanggal_instalasi)}`,
    href: "/dashboard/production/proyek",
  }));

  return [...stockReminders, ...boothReminders];
}

/**
 * `visibleModuleIds` datang dari `getVisibleModules()` yang sama dipakai
 * Sidebar/Hub — pengingat cuma dihitung untuk modul yang memang kelihatan
 * buat staf yang login (RLS tetap jadi lapis pertahanan terakhir kalau ada
 * salah kode, sama seperti summary lain di atas).
 */
export async function getReminders(visibleModuleIds: Set<string>): Promise<Reminder[]> {
  const [magnarent, magnative, production] = await Promise.all([
    visibleModuleIds.has("magnarent") ? getMagnarentReminders() : Promise.resolve([]),
    visibleModuleIds.has("magnative") ? getMagnativeReminders() : Promise.resolve([]),
    visibleModuleIds.has("production") ? getProductionReminders() : Promise.resolve([]),
  ]);

  // Urutan tampil: danger (hari ini/sudah lewat) dulu, baru warning — dalam
  // grup yang sama urutan aslinya (per tanggal, dari masing-masing query)
  // tetap dipertahankan lewat sort yang stabil.
  return [...magnarent, ...magnative, ...production].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "danger" ? -1 : 1
  );
}
