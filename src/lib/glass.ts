/**
 * "Liquid Glass" (Tahap 38, direvisi Tahap 41) — permintaan Owner: gaya kaca
 * buram/blur ala iOS untuk UI aplikasi. Kelas siap-pakai di sini dipakai
 * lintas Sidebar/Topbar/MobileNav/SubNav/kartu dashboard/Chat supaya satu
 * bahasa visual konsisten, bukan tiap file menuliskan sendiri kombinasi
 * bg-opacity/backdrop-blur/shadow-nya (gampang beda sendiri kalau nanti
 * mau disetel ulang, dan mudah lupa salah satu file).
 *
 * Tahap 41: permintaan Owner — versi Tahap 38 dianggap "terlalu blur/buram"
 * (foggy), maunya lebih BENING/tembus-pandang, mendekati material kaca iOS
 * terbaru (Control Center/Notification Center gaya "Liquid Glass" di iOS
 * generasi baru): blur RADIUS dikecilkan (2xl/xl -> lg/md, konten di
 * belakangnya jadi lebih tajam kebaca bentuknya, bukan cuma gumpalan warna
 * kabur) TAPI saturate dinaikkan (150 -> 200) supaya warna yang tembus tetap
 * hidup/"vibrant" alih-alih pucat — kombinasi blur rendah + saturasi tinggi
 * inilah yang bikin iOS terasa "kaca bening" bukan "kaca embun". Opacity
 * latar juga diturunkan (lebih transparan) di kelas non-STRONG supaya
 * lapisan di baliknya beneran ikut terlihat; STRONG (nav/chrome) tetap
 * dipertahankan agak lebih pekat karena harus tetap legible walau ada
 * konten warna-warni scroll di baliknya. Border dibikin sedikit lebih
 * terang/tebal supaya tepi panel kaca "berkilau" (garis highlight), ciri
 * khas kaca iOS. Berlaku SAMA di kedua tema (terang & gelap) — cuma beda
 * base color, bukan beda treatment blur/saturate.
 *
 * SENGAJA murni kelas utility Tailwind (bg-white/N tembus pandang +
 * backdrop-blur + backdrop-saturate untuk efek "vibrancy", ditambah
 * shadow arbitrary BERTUMPUK: satu shadow biasa untuk elevasi + satu
 * `inset` tipis di tepi atas untuk kesan garis highlight kaca) — TANPA
 * lapisan CSS custom terpisah, konsisten dengan gaya kode di seluruh app
 * ini yang menghindari abstraksi tambahan kalau utility Tailwind saja
 * sudah cukup.
 *
 * Border SENGAJA dipisah dari surface (GLASS_BORDER berdiri sendiri) —
 * tiap pemanggil pilih sendiri sisi border yang relevan (`border-b` untuk
 * Topbar, `border-r` untuk Sidebar, `border` penuh untuk kartu), bukan
 * dipaksa satu bentuk border yang sama di semua tempat.
 *
 * Cakupan (Tahap 38): chrome global (Sidebar/Topbar/MobileNav/SubNav),
 * kartu KPI (StatCard/QuickStatCard) & Dashboard Hub, dan halaman Chat.
 * SENGAJA TIDAK disentuh: badge logo modul di ModuleHeader.tsx (panel
 * putih di baliknya sengaja opak sejak Tahap 31 supaya logo Magnativ/
 * Production yang senada warna dengan gradient di belakangnya tetap
 * kebaca — bikin itu transparan akan memunculkan lagi masalah kontras
 * yang sudah pernah diperbaiki), dan MaintenanceBanner.tsx (banner
 * peringatan sistem sengaja solid & mencolok, bukan kaca pasif). Tabel/
 * form/galeri di dalam tiap modul (Magnarent/Magnative/Production/Admin/
 * Investor) belum ikut tahap ini — bisa menyusul pakai kelas yang sama di
 * sini kalau Owner mau lanjutkan cakupannya.
 */

/** Panel kaca standar — kartu, dropdown ringan, tab bar. Tahap 41: blur
 * dikecilkan (lg, dari 2xl) + saturate dinaikkan (200) + opacity latar
 * diturunkan supaya lebih bening, bukan berkabut. */
export const GLASS_SURFACE =
  "bg-white/40 shadow-[0_8px_32px_-8px_rgba(31,41,55,0.16),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-lg backdrop-saturate-200 dark:bg-zinc-900/35 dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]";

/** Versi lebih pekat — dipakai Topbar/Sidebar/drawer/dropdown menu: teks & ikon
 * harus tetap kebaca jelas walau ada konten warna-warni ter-scroll di baliknya.
 * Tahap 41: blur dikecilkan (xl, dari 2xl) + saturate dinaikkan, opacity
 * dipertahankan lebih pekat dibanding GLASS_SURFACE karena butuh legibility. */
export const GLASS_SURFACE_STRONG =
  "bg-white/65 shadow-[0_8px_32px_-8px_rgba(31,41,55,0.16),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl backdrop-saturate-200 dark:bg-zinc-900/60 dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]";

/** Warna border tembus-pandang yang senada dua treatment di atas. Tahap 41:
 * sedikit lebih terang/tebal supaya tepi panel "berkilau" ala tepi kaca iOS. */
export const GLASS_BORDER = "border-white/60 dark:border-white/15";

/** Pil/tombol/tab kecil bergaya kaca (mis. tab tidak-aktif, tombol ikon).
 * Tahap 41: blur diperkecil (md, dari xl) + saturate dinaikkan + opacity
 * latar diturunkan sedikit. */
export const GLASS_PILL =
  "border-white/60 bg-white/35 backdrop-blur-md backdrop-saturate-200 dark:border-white/15 dark:bg-white/8";

/** Kotak input kaca — dipakai kotak ketik chat. Tahap 41: blur diperkecil
 * (md, dari xl) + saturate ditambahkan + opacity latar diturunkan. */
export const GLASS_INPUT =
  "border-white/60 bg-white/25 backdrop-blur-md backdrop-saturate-150 dark:border-white/15 dark:bg-white/5";

/** Panel dropdown di atas konten (notifikasi, hasil pencarian global).
 * Sengaja HAMPIR PEKAT: dengan GLASS_SURFACE (latar 40%) isi halaman di
 * belakangnya -- terutama Chat yang padat -- ikut terbaca menembus panel
 * dan teksnya bertumpuk (laporan Owner 6 Okt 2026). */
export const DROPDOWN_SURFACE =
  "bg-white/95 shadow-[0_12px_40px_-8px_rgba(31,41,55,0.25)] backdrop-blur-xl dark:bg-zinc-900/95 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]";
