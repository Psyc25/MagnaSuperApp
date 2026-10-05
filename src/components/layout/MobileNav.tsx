"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Menu, X } from "lucide-react";
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
import { GLASS_BORDER, GLASS_SURFACE, GLASS_SURFACE_STRONG } from "@/lib/glass";
import type { Division } from "@/lib/supabase/types";

/**
 * Pengganti Sidebar di layar kecil — sebelumnya strip pill yang di-scroll
 * horizontal (Tahap 25: diganti jadi laci/drawer lewat tombol hamburger,
 * biar layar mobile tidak penuh baris tombol dan terasa lebih bersih).
 * Isi lacinya SAMA PERSIS dengan Sidebar.tsx (Hub + Modul sesuai divisi +
 * link Investor/Admin) — sumber datanya tetap satu dari @/lib/navigation,
 * cuma tampilannya beda.
 */
export function MobileNav({ division }: { division?: Division | null }) {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const modules = getVisibleModules(division);
  const isFullAccess = division === "all";
  const isInvestor = division === "investor";
  const isFinance = division === "finance";
  const isOperationalDivision =
    division === "magnarent" || division === "magnative" || division === "production";
  // Chat (Tahap 37) — terbuka untuk semua divisi KECUALI investor.
  const showChat = division !== "investor";

  // Laci otomatis tertutup begitu pindah halaman (klik salah satu link di
  // dalamnya) -- disesuaikan LANGSUNG saat render (bukan lewat useEffect
  // seperti sebelumnya), ini pola resmi React "adjust state when a prop
  // changes" (bukan anti-pattern setState-in-effect yang baru dilarang
  // linter react-hooks versi terbaru):
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Escape buat menutup (pola sama dengan Modal.tsx) + kunci scroll body
  // selagi laci terbuka supaya halaman di belakangnya tidak ikut kescroll.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const activeModule = modules.find((mod) => pathname === mod.href || pathname.startsWith(`${mod.href}/`));
  const activeAdminLink = isFullAccess
    ? ADMIN_LINKS.find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    : undefined;
  const activeInvestorLink = isInvestor
    ? INVESTOR_LINKS.find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    : undefined;
  const activeReportLink = isOperationalDivision
    ? DIVISION_REPORT_LINKS.find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    : undefined;
  const activeFinanceLink = isFinance
    ? FINANCE_LINKS.find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    : undefined;
  const isChatActive = showChat && (pathname === CHAT_LINK.href || pathname.startsWith(`${CHAT_LINK.href}/`));
  const ChatIcon = CHAT_LINK.icon;
  const isRealisasiEventActive =
    showChat &&
    (pathname === REALISASI_EVENT_LINK.href || pathname.startsWith(`${REALISASI_EVENT_LINK.href}/`));
  const RealisasiEventIcon = REALISASI_EVENT_LINK.icon;
  const isTrackingEventActive =
    showChat &&
    (pathname === TRACKING_EVENT_LINK.href || pathname.startsWith(`${TRACKING_EVENT_LINK.href}/`));
  const TrackingEventIcon = TRACKING_EVENT_LINK.icon;
  const isVirtualOfficeActive =
    pathname === VIRTUAL_OFFICE_LINK.href || pathname.startsWith(`${VIRTUAL_OFFICE_LINK.href}/`);
  const VirtualOfficeIcon = VIRTUAL_OFFICE_LINK.icon;
  const isAIAssistantActive =
    pathname === AI_ASSISTANT_LINK.href || pathname.startsWith(`${AI_ASSISTANT_LINK.href}/`);
  const AIAssistantIcon = AI_ASSISTANT_LINK.icon;
  const currentLabel =
    pathname === HUB_HREF
      ? t("Dashboard Hub")
      : t(
          activeModule?.label ??
            activeAdminLink?.label ??
            activeInvestorLink?.label ??
            activeReportLink?.label ??
            activeFinanceLink?.label ??
            (isChatActive ? CHAT_LINK.label : undefined) ??
            (isRealisasiEventActive ? REALISASI_EVENT_LINK.label : undefined) ??
            (isTrackingEventActive ? TRACKING_EVENT_LINK.label : undefined) ??
            (isVirtualOfficeActive ? VIRTUAL_OFFICE_LINK.label : undefined) ??
            (isAIAssistantActive ? AI_ASSISTANT_LINK.label : undefined) ??
            "Menu"
        );

  function linkClass(isActive: boolean, activeClass: string) {
    return cn(
      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
      isActive
        ? activeClass
        : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
    );
  }

  return (
    <>
      <div
        className={cn(
          "relative z-20 flex items-center gap-3 border-b px-4 py-3 md:hidden",
          GLASS_SURFACE_STRONG,
          GLASS_BORDER
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("Buka menu")}
          className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full border text-zinc-600 shadow-sm dark:text-zinc-300", GLASS_SURFACE, GLASS_BORDER)}
        >
          <Menu className="h-4 w-4" />
        </button>
        <p className="truncate text-sm font-bold text-zinc-800 dark:text-zinc-100">{currentLabel}</p>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            className={cn(
              "animate-slide-in-left absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col",
              GLASS_SURFACE_STRONG
            )}
          >
            <div className={cn("flex h-16 shrink-0 items-center justify-between gap-3 border-b px-5", GLASS_BORDER)}>
              <div className="flex items-center gap-3">
                <BrandLogo size={32} />
                <span className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">
                  MagnaSuperApp
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("Tutup menu")}
                className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-5">
              <Link
                href={HUB_HREF}
                className={linkClass(pathname === HUB_HREF, "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white")}
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
                      const isActive = pathname === mod.href || pathname.startsWith(`${mod.href}/`);
                      const Icon = mod.icon;
                      return (
                        <li key={mod.id}>
                          <Link href={mod.href} className={linkClass(isActive, mod.soft)}>
                            <Icon
                              className="h-[18px] w-[18px] shrink-0"
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
                        className={linkClass(
                          isChatActive,
                          "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                        )}
                      >
                        <ChatIcon className="h-[18px] w-[18px]" />
                        {t(CHAT_LINK.label)}
                      </Link>
                    </li>
                    <li>
                      <Link
                        href={REALISASI_EVENT_LINK.href}
                        className={linkClass(
                          isRealisasiEventActive,
                          "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                        )}
                      >
                        <RealisasiEventIcon className="h-[18px] w-[18px]" />
                        {t(REALISASI_EVENT_LINK.label)}
                      </Link>
                    </li>
                    <li>
                      <Link
                        href={TRACKING_EVENT_LINK.href}
                        className={linkClass(
                          isTrackingEventActive,
                          "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                        )}
                      >
                        <TrackingEventIcon className="h-[18px] w-[18px]" />
                        {t(TRACKING_EVENT_LINK.label)}
                      </Link>
                    </li>
                  </ul>
                </div>
              )}

              {/* Kantor Virtual & Asisten AI -- SENGAJA tidak dibungkus
                  showChat/isInvestor, karena modul ini harus kelihatan buat
                  SEMUA divisi termasuk investor. */}
              <div className="pt-5">
                <ul className="space-y-1">
                  <li>
                    <Link
                      href={VIRTUAL_OFFICE_LINK.href}
                      className={linkClass(
                        isVirtualOfficeActive,
                        "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                      )}
                    >
                      <VirtualOfficeIcon className="h-[18px] w-[18px]" />
                      {t(VIRTUAL_OFFICE_LINK.label)}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={AI_ASSISTANT_LINK.href}
                      className={linkClass(
                        isAIAssistantActive,
                        "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
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
                            className={linkClass(
                              isActive,
                              "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
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
                            className={linkClass(
                              isActive,
                              "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
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
                          <Link href={link.href} className={linkClass(isActive, "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white")}>
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
                            className={linkClass(isActive, "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white")}
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
        </div>
      )}
    </>
  );
}
