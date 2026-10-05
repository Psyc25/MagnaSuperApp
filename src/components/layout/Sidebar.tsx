"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import {
  ADMIN_LINKS,
  AI_ASSISTANT_LINK,
  CHAT_LINK,
  DIVISION_REPORT_LINKS,
  FINANCE_LINKS,
  HUB_HREF,
  INVESTOR_LINKS,
  REALISASI_EVENT_LINK,
  TRACKING_EVENT_LINK,
  VIRTUAL_OFFICE_LINK,
  getVisibleModules,
} from "@/lib/navigation";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE_STRONG } from "@/lib/glass";
import type { Division } from "@/lib/supabase/types";

/**
 * Sidebar global — dirender sekali di root layout, jadi tetap tampil
 * (dan tidak remount) saat berpindah antar modul maupun antar sub-halaman.
 * Inilah yang membuat pindah modul tidak perlu kembali ke Hub dulu.
 *
 * `division` menentukan modul mana yang ditampilkan (lihat getVisibleModules)
 * — staf satu bagian cuma melihat tautan ke modulnya sendiri, sementara
 * akses penuh ("all") melihat semuanya plus tautan ke halaman Admin
 * (Kelola Pengguna, Laporan, Aktivitas). `ADMIN_LINKS`/`INVESTOR_LINKS`
 * diimpor dari `@/lib/navigation` — SATU-SATUNYA sumber, dipakai juga oleh
 * `MobileNav.tsx`, supaya keduanya tidak bisa beda sendiri lagi.
 */

export function Sidebar({ division }: { division?: Division | null }) {
  const pathname = usePathname();
  const t = useT();
  const modules = getVisibleModules(division);
  const isFullAccess = division === "all";
  const isInvestor = division === "investor";
  const isFinance = division === "finance";
  const isOperationalDivision =
    division === "magnarent" || division === "magnative" || division === "production";
  // Chat (Tahap 37) & Realisasi Event (Tahap B) — terbuka untuk semua divisi KECUALI investor.
  const showChat = division !== "investor";
  const isChatActive = pathname === CHAT_LINK.href || pathname.startsWith(`${CHAT_LINK.href}/`);
  const ChatIcon = CHAT_LINK.icon;
  const isRealisasiEventActive =
    pathname === REALISASI_EVENT_LINK.href || pathname.startsWith(`${REALISASI_EVENT_LINK.href}/`);
  const RealisasiEventIcon = REALISASI_EVENT_LINK.icon;
  const isTrackingEventActive =
    pathname === TRACKING_EVENT_LINK.href || pathname.startsWith(`${TRACKING_EVENT_LINK.href}/`);
  const TrackingEventIcon = TRACKING_EVENT_LINK.icon;
  const isVirtualOfficeActive =
    pathname === VIRTUAL_OFFICE_LINK.href || pathname.startsWith(`${VIRTUAL_OFFICE_LINK.href}/`);
  const VirtualOfficeIcon = VIRTUAL_OFFICE_LINK.icon;
  const isAIAssistantActive =
    pathname === AI_ASSISTANT_LINK.href || pathname.startsWith(`${AI_ASSISTANT_LINK.href}/`);
  const AIAssistantIcon = AI_ASSISTANT_LINK.icon;

  return (
    <aside
      className={cn(
        "relative z-20 hidden w-64 shrink-0 flex-col border-r md:flex",
        GLASS_SURFACE_STRONG,
        GLASS_BORDER
      )}
    >
      <div className={cn("flex h-16 items-center gap-3 border-b px-5", GLASS_BORDER)}>
        <BrandLogo size={36} />
        <span className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">
          MagnaSuperApp
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <Link
          href={HUB_HREF}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
            pathname === HUB_HREF
              ? "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white"
              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
          )}
        >
          <LayoutGrid className="h-[18px] w-[18px]" />
          {t("Dashboard Hub")}
        </Link>

        {modules.length > 0 && (
        <div className="pt-5">
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t("Modul")}
          </p>
          <ul className="space-y-1">
            {modules.map((mod) => {
              const isActive =
                pathname === mod.href || pathname.startsWith(`${mod.href}/`);
              const Icon = mod.icon;

              return (
                <li key={mod.id}>
                  <Link
                    href={mod.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                      isActive
                        ? mod.soft
                        : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                    )}
                  >
                    <Icon
                      className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110"
                      style={isActive ? { color: mod.solid } : undefined}
                    />
                    {t(mod.label)}
                    {isActive && (
                      <span
                        className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: mod.gradient }}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        )}

        {showChat && (
          <div className="pt-5">
            <ul className="space-y-1">
              <li>
                <Link
                  href={CHAT_LINK.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                    isChatActive
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                  )}
                >
                  <ChatIcon className="h-[18px] w-[18px]" />
                  {t(CHAT_LINK.label)}
                </Link>
              </li>
              <li>
                <Link
                  href={REALISASI_EVENT_LINK.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                    isRealisasiEventActive
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                  )}
                >
                  <RealisasiEventIcon className="h-[18px] w-[18px]" />
                  {t(REALISASI_EVENT_LINK.label)}
                </Link>
              </li>
              <li>
                <Link
                  href={TRACKING_EVENT_LINK.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                    isTrackingEventActive
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                  )}
                >
                  <TrackingEventIcon className="h-[18px] w-[18px]" />
                  {t(TRACKING_EVENT_LINK.label)}
                </Link>
              </li>
            </ul>
          </div>
        )}

        {/* Kantor Virtual & Asisten AI -- SENGAJA tidak dibungkus showChat/
            isInvestor, karena modul ini justru harus kelihatan buat SEMUA
            divisi termasuk investor. */}
        <div className="pt-5">
          <ul className="space-y-1">
            <li>
              <Link
                href={VIRTUAL_OFFICE_LINK.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                  isVirtualOfficeActive
                    ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                )}
              >
                <VirtualOfficeIcon className="h-[18px] w-[18px]" />
                {t(VIRTUAL_OFFICE_LINK.label)}
              </Link>
            </li>
            <li>
              <Link
                href={AI_ASSISTANT_LINK.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                  isAIAssistantActive
                    ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                )}
              >
                <AIAssistantIcon className="h-[18px] w-[18px]" />
                {t(AI_ASSISTANT_LINK.label)}
              </Link>
            </li>
          </ul>
        </div>

        {isInvestor && (
          <div className="pt-5">
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("Investor")}
            </p>
            <ul className="space-y-1">
              {INVESTOR_LINKS.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
                const Icon = link.icon;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                        isActive
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {t(link.label)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isFinance && (
          <div className="pt-5">
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("Finance")}
            </p>
            <ul className="space-y-1">
              {FINANCE_LINKS.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
                const Icon = link.icon;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                        isActive
                          ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {t(link.label)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isOperationalDivision && (
          <div className="pt-5">
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("Laporan")}
            </p>
            <ul className="space-y-1">
              {DIVISION_REPORT_LINKS.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
                const Icon = link.icon;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                        isActive
                          ? "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white"
                          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {t(link.label)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isFullAccess && (
          <div className="pt-5">
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("Admin")}
            </p>
            <ul className="space-y-1">
              {ADMIN_LINKS.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
                const Icon = link.icon;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                        isActive
                          ? "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white"
                          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {t(link.label)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>
    </aside>
  );
}
