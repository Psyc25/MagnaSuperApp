import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_AUTH_ROUTES = ["/login", "/register", "/lupa-password"];

// Path prefix modul -> divisi yang boleh mengaksesnya. "/reset-password"
// SENGAJA tidak masuk PUBLIC_AUTH_ROUTES: rute itu dikunjungi sesaat
// setelah pengguna (jadi "sudah login" lewat sesi recovery) klik tautan
// reset email — kalau ikut di-redirect-away seperti /login, alur ganti
// password akan rusak sebelum sempat submit form.
const MODULE_DIVISION_PREFIXES: Array<{ prefix: string; division: string }> = [
  { prefix: "/dashboard/magnative", division: "magnative" },
  { prefix: "/dashboard/magnarent", division: "magnarent" },
  { prefix: "/dashboard/production", division: "production" },
];

const ADMIN_PREFIX = "/dashboard/admin";
// Tahap 35: dua halaman di bawah prefix admin ini SENGAJA dikecualikan dari
// blokir "division !== all" — dibuka read-only ke 3 divisi operasional
// (Magnarent/Magnative/Production), sisanya (Kelola Pengguna, Faktur, dst.)
// tetap tertutup rapat untuk mereka. Pembatasan SEBENARNYA (data cuma
// divisi sendiri, tidak ada tombol hapus) ditegakkan di page.tsx
// masing-masing + RLS (migrasi 0037 untuk activity_log) — daftar ini
// cuma soal boleh/tidaknya rute ini di-render sama sekali.
const ADMIN_ROUTES_OPEN_TO_DIVISIONS = ["/dashboard/admin/laporan", "/dashboard/admin/aktivitas"];
// Peran baru "finance" (migrasi 0061) — akses HANYA ke halaman keuangan ini,
// BUKAN seluruh prefix admin seperti division "all". Dicek terpisah dari
// ADMIN_ROUTES_OPEN_TO_DIVISIONS di atas (yang khusus 3 divisi operasional)
// supaya daftar keduanya independen -- finance tidak otomatis kebagian
// Laporan/Aktivitas, dan operasional tidak otomatis kebagian halaman ini.
const FINANCE_ROUTES = [
  "/dashboard/admin/keuangan",
  "/dashboard/admin/akuntansi",
  "/dashboard/admin/laba-rugi",
  "/dashboard/admin/neraca",
  "/dashboard/admin/arus-kas-akuntansi",
  "/dashboard/admin/faktur",
  "/dashboard/admin/arus-kas",
];
// Area khusus akun investor (read only lintas divisi + Approve/Reject
// Pengajuan Modal, lihat migrasi 0019) — akses penuh ("all") boleh ikut
// mengintip halaman ini, staf divisi manapun TIDAK.
const INVESTOR_PREFIX = "/dashboard/investor";
// Tahap 37: fitur Chat — terbuka untuk SEMUA divisi KECUALI investor (tidak
// ada prefix modul yang otomatis menutupinya, jadi perlu dicek eksplisit di
// sini seperti INVESTOR_PREFIX di atas). Lapis kedua/ketiga ada di
// page.tsx (redirect) & RLS chat_messages (migrasi 0038).
const CHAT_PREFIX = "/dashboard/chat";
// Tahap B modul Realisasi Event — sama persis alasannya dengan CHAT_PREFIX
// di atas: terbuka untuk SEMUA divisi KECUALI investor (lihat RLS
// event_expenses di migrasi 0049).
const REALISASI_EVENT_PREFIX = "/dashboard/realisasi-event";
// Tahap D modul Tracking Progress Event ("Papan Tracking") — sama persis
// alasannya dengan REALISASI_EVENT_PREFIX di atas: terbuka untuk SEMUA
// divisi KECUALI investor (lihat RLS event_checklist_items_update, sudah
// dibuka ke 3 divisi + akses penuh sejak migrasi 0053).
const TRACKING_EVENT_PREFIX = "/dashboard/tracking-event";

/**
 * Middleware ini punya tiga tugas dalam satu jalan:
 * 1. Menyegarkan sesi Supabase (token refresh) pada setiap request.
 * 2. Menjaga rute: `/dashboard/**` wajib login, dan pengguna yang SUDAH
 *    login tidak boleh melihat /login, /register, /lupa-password lagi.
 * 3. Membatasi akses per DIVISI — staf satu bagian (mis. "production")
 *    tidak bisa membuka modul bagian lain, dan halaman admin
 *    ("Kelola Pengguna") hanya untuk akses penuh (division === "all").
 *
 * `division` diambil dari `user.app_metadata`, BUKAN `user_metadata` —
 * app_metadata hanya bisa diisi lewat Admin API/service role, jadi tidak
 * bisa diutak-atik sendiri oleh pengguna dari browser (beda dengan
 * user_metadata yang bisa diubah lewat `supabase.auth.updateUser()`).
 */
export async function middleware(request: NextRequest) {
  // Bug ditemukan lewat auth_logs Supabase: Next.js App Router otomatis
  // mem-PREFETCH di background untuk tiap <Link> yang masuk viewport —
  // halaman dgn banyak link (Dashboard Hub, Topbar, sidebar) bisa memicu
  // PULUHAN request middleware nyaris bersamaan. Tiap request di sini
  // memanggil supabase.auth.getUser(), yang otomatis me-refresh access
  // token kalau sudah dekat kedaluwarsa — karena refresh token Supabase
  // "rotating" (sekali pakai), banyak refresh BERSAMAAN dari request-request
  // prefetch itu saling tabrakan: satu menang dapat token baru, sisanya
  // gagal dengan error "Refresh Token Not Found" dan sesi jadi mati/invalid
  // TANPA aksi eksplisit apa pun dari pengguna. Ini persis yang terlihat di
  // log produksi (bukan cuma dev lokal) dan cocok dengan laporan "profil/
  // pencarian/notifikasi tiba-tiba tidak bisa diakses" — sebenarnya BUKAN
  // fitur itu sendiri yang rusak, tapi seluruh sesi login mati diam-diam
  // sehingga SEMUA halaman /dashboard/** ikut tidak bisa diakses.
  //
  // Perbaikan: request prefetch murni (bukan navigasi sungguhan yang
  // diklik/diketik pengguna) tidak perlu memicu pengecekan/refresh sesi di
  // sini sama sekali — biarkan lolos apa adanya. Ini aman karena proteksi
  // data yang sesungguhnya ada di RLS Postgres (lihat can_access_division
  // dkk di setiap tabel), bukan di middleware ini — middleware cuma lapisan
  // redirect UX. Navigasi ASLI (klik link / ketik URL) tetap kena semua
  // pengecekan session-refresh & divisi di bawah seperti biasa.
  if (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.includes("prefetch")
  ) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = PUBLIC_AUTH_ROUTES.includes(pathname);
  const isProtectedRoute = pathname.startsWith("/dashboard");

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isProtectedRoute) {
    // Tanpa division di app_metadata = tidak punya akses modul apa pun
    // (sama dengan current_user_division() di database sejak migrasi 0094;
    // dulu jatuh ke "production" sehingga akun hasil signup publik bisa
    // membuka modul Production).
    const division = (user.app_metadata as { division?: string } | null | undefined)?.division ?? "none";

    if (division !== "all") {
      const isOpenAdminRouteForDivision =
        (["magnarent", "magnative", "production"].includes(division) &&
          ADMIN_ROUTES_OPEN_TO_DIVISIONS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) ||
        (division === "finance" && FINANCE_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
      const isAdminRoute =
        !isOpenAdminRouteForDivision && (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`));
      const isBlockedModule = MODULE_DIVISION_PREFIXES.some(
        (m) => (pathname === m.prefix || pathname.startsWith(`${m.prefix}/`)) && m.division !== division
      );
      const isInvestorRoute = pathname === INVESTOR_PREFIX || pathname.startsWith(`${INVESTOR_PREFIX}/`);
      const isBlockedInvestorRoute = isInvestorRoute && division !== "investor";
      const isChatRoute = pathname === CHAT_PREFIX || pathname.startsWith(`${CHAT_PREFIX}/`);
      const isBlockedChatRoute = isChatRoute && division === "investor";
      const isRealisasiEventRoute =
        pathname === REALISASI_EVENT_PREFIX || pathname.startsWith(`${REALISASI_EVENT_PREFIX}/`);
      const isBlockedRealisasiEventRoute = isRealisasiEventRoute && division === "investor";
      const isTrackingEventRoute =
        pathname === TRACKING_EVENT_PREFIX || pathname.startsWith(`${TRACKING_EVENT_PREFIX}/`);
      const isBlockedTrackingEventRoute = isTrackingEventRoute && division === "investor";

      if (
        isAdminRoute ||
        isBlockedModule ||
        isBlockedInvestorRoute ||
        isBlockedChatRoute ||
        isBlockedRealisasiEventRoute ||
        isBlockedTrackingEventRoute
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
