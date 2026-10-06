/**
 * Util generik lintas-modul, dipakai semua modul termasuk Magnarent
 * (src/lib/magnarent/date.ts sekarang tinggal re-export dari sini — dulu
 * py isinya duplikat identik, disatukan supaya perbaikan seperti bug
 * timezone di bawah cukup sekali, tidak perlu diingat-ingat dua tempat).
 */

export function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Format sebuah momen waktu jadi tanggal kalender ISO (YYYY-MM-DD) menurut
 * WIB (Asia/Jakarta) — SENGAJA bukan `date.toISOString().slice(0, 10)` biasa.
 * `toISOString()` selalu UTC apa pun lokasi server/browser-nya; server
 * Vercel jalan di UTC, jadi versi biasa itu menganggap tanggal masih
 * "kemarin" dari jam 00:00-06:59 WIB (WIB = UTC+7) — staf yang buka
 * aplikasi pagi-pagi bisa lihat "hari ini" yang salah (kalender booking,
 * jadwal konten, laporan perputaran alat, dsb). `Intl.DateTimeFormat`
 * dengan `timeZone: "Asia/Jakarta"` menghitung tanggal kalender yang benar
 * di zona itu, terlepas dari zona waktu mesin yang menjalankannya.
 */
function formatISODateJakarta(date: Date): string {
  // Locale "en-CA" kebetulan memformat tanggal sebagai YYYY-MM-DD — pas
  // dengan format ISO date (tanpa waktu) yang dipakai di seluruh aplikasi.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}

/** "Hari ini" menurut WIB — SATU-SATUNYA cara yang benar untuk dapat tanggal hari ini di seluruh aplikasi (lihat catatan di atas). */
export function todayISO(): string {
  return formatISODateJakarta(new Date());
}

/** Tanggal kalender WIB (YYYY-MM-DD) dari timestamp lengkap (mis. `created_at`).
 * Jangan pakai `iso.slice(0, 10)` -- itu tanggal UTC, salah untuk 00:00-06:59 WIB. */
export function isoDateInJakarta(timestamp: string): string {
  return formatISODateJakarta(new Date(timestamp));
}

/** Tanggal ISO N hari dari sekarang, tetap dihitung menurut kalender WIB (mis. untuk window "7 hari ke depan"). */
export function isoDaysFromNow(days: number): string {
  return formatISODateJakarta(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}

export function formatDateID(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format sebuah momen waktu (timestamp lengkap, mis. `created_at` pesan
 * chat) jadi jam:menit menurut WIB — dipakai fitur Chat (Tahap 37). Sama
 * seperti `formatISODateJakarta` di atas, sengaja pakai `timeZone:
 * "Asia/Jakarta"` eksplisit (bukan `toLocaleTimeString()` polos yang ikut
 * zona waktu perangkat) supaya hasilnya IDENTIK dijalankan di server
 * (Vercel, UTC) maupun di browser klien — server component (page.tsx) chat
 * merender pesan awal, lalu client component (ChatClient.tsx) meng-hydrate
 * & merender pesan susulan hasil polling; kalau formatnya beda antara
 * render server & client, React akan melempar peringatan hydration
 * mismatch.
 */
export function formatTimeID(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Format ukuran file (byte) jadi "KB"/"MB" yang gampang dibaca — dipakai
 * lampiran chat (Tahap 38) untuk menampilkan ukuran file di chip lampiran. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Kolom nominal di database masih `integer` (maks Rp 2.147.483.647) --
 * nilai di atasnya ditolak Postgres dengan error yang tidak jelas bagi
 * staf, jadi dicek lebih dulu di server action.
 */
export const MAX_DB_AMOUNT = 2_147_483_647;

export function exceedsDbAmount(...amounts: (number | undefined)[]): boolean {
  return amounts.some((a) => a !== undefined && a > MAX_DB_AMOUNT);
}

export const MAX_DB_AMOUNT_MESSAGE = "Nominal maksimal Rp 2.147.483.647 per isian (batas sistem saat ini).";

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const AVATAR_PALETTE = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/**
 * Nama yang ditampilkan di UI. Kalau `full_name` sudah diisi (lewat
 * halaman Kelola Pengguna), itu yang dipakai apa adanya. Kalau belum —
 * daripada tampil mentah seperti username/email ("aliefaditiyo.n") —
 * di-"rapikan" dulu (titik/underscore jadi spasi, tiap kata dikapital)
 * jadi lebih mirip nama sungguhan ("Aliefaditiyo N"), sambil tetap
 * jelas ini cuma tebakan sementara sampai `full_name` staf yang
 * bersangkutan diisi lengkap oleh admin.
 */
export function formatDisplayName(fullName?: string | null, email?: string | null): string {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed;

  const local = email?.split("@")[0]?.trim();
  if (!local) return "";

  return local
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
