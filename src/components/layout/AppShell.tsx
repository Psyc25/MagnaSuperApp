import { Suspense, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { Topbar } from "./Topbar";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { ImportantNotificationBanner } from "@/components/notifications/ImportantNotificationBanner";
import { PullToRefresh } from "./PullToRefresh";
import { WelcomeSplash } from "./WelcomeSplash";
import { AIFloatingChat } from "@/components/ai/AIFloatingChat";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { formatDisplayName } from "@/lib/shared/utils";
import type { Profile } from "@/lib/supabase/types";
import type { MaintenanceStatus } from "@/lib/system-status/actions";

/**
 * Shell tingkat aplikasi: dipasang SEKALI di app/dashboard/layout.tsx.
 * Sidebar + Topbar + MobileNav ada di luar {children}, sehingga tetap
 * persist di seluruh pohon rute — pindah modul atau pindah sub-halaman
 * apa pun tidak pernah membongkar ulang shell ini.
 *
 * Tahap 36: `<PwaInstallPrompt />` SUDAH TIDAK dipasang di sini lagi — pindah
 * ke root layout (src/app/layout.tsx) supaya banner install (dan pendaftaran
 * Service Worker yang jadi syaratnya) aktif juga di halaman publik
 * (/login, /register), bukan cuma setelah pengguna berhasil login. Lihat
 * komentar panjang di PwaInstallPrompt.tsx untuk kronologi bug-nya.
 *
 * `user` diambil server-side (Supabase session + profiles table) di
 * dashboard/layout.tsx dan diteruskan turun ke Topbar untuk ditampilkan.
 */
export function AppShell({
  children,
  user,
  maintenance,
}: {
  children: ReactNode;
  user: (Profile & { email: string }) | null;
  maintenance?: MaintenanceStatus;
}) {
  return (
    <LocaleProvider locale={user?.language_preference ?? "id"}>
      {/* useSearchParams() di WelcomeSplash mewajibkan boundary Suspense di
          App Router — fallback null karena popup ini murni bonus visual,
          tidak boleh memblokir render dashboard itu sendiri. */}
      <Suspense fallback={null}>
        <WelcomeSplash name={formatDisplayName(user?.full_name, user?.email) || "Anda"} />
      </Suspense>
      <div className="app-backdrop flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Sidebar division={user?.division} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />
          <MobileNav division={user?.division} />
          <ImportantNotificationBanner />
          {maintenance?.active && <MaintenanceBanner message={maintenance.message} />}
          <main className="flex-1">
            <PullToRefresh>{children}</PullToRefresh>
          </main>
        </div>
      </div>
      {/* Floating AI Chat Widget — tersedia di SEMUA halaman dashboard */}
      <AIFloatingChat />
    </LocaleProvider>
  );
}
