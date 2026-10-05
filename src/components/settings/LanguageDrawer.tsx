"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe, X } from "lucide-react";
import { useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import type { LanguagePreference } from "@/lib/supabase/types";
import { useResetOnChange } from "@/lib/shared/use-synced-state";

/** Selector elemen yang bisa menerima fokus keyboard — dipakai untuk cari
 * elemen pertama/terakhir waktu laci dibuka & untuk jebak Tab di dalamnya.
 * Pola & alasan sama persis dengan `Modal.tsx`, cuma bentuk panelnya beda
 * (laci dari bawah, bukan dialog di tengah) sesuai permintaan "model laci"
 * untuk pemilih bahasa. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type LanguageOption = { value: LanguagePreference; label: string };

export function LanguageDrawer({
  open,
  onClose,
  options,
  value,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  options: LanguageOption[];
  value: LanguagePreference;
  onSelect: (value: LanguagePreference) => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? panel)?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [open]);

  const [entered, setEntered] = useState(false);
  // Ditutup -> kembali ke "belum masuk" saat render itu juga, supaya saat
  // dibuka lagi animasinya mulai dari awal (bukan lewat effect yang memicu
  // render berantai).
  useResetOnChange(open, (isOpen) => {
    if (!isOpen) setEntered(false);
  });
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className={cn(
          "absolute inset-0 bg-zinc-950/50 backdrop-blur-sm transition-opacity duration-200",
          entered ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("Pilih Bahasa")}
        tabIndex={-1}
        className={cn(
          "relative max-h-[75vh] w-full overflow-y-auto rounded-t-2xl border border-black/5 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none transition-transform duration-200 dark:border-white/10 dark:bg-zinc-900",
          "sm:max-w-sm sm:rounded-2xl sm:pb-5",
          entered ? "translate-y-0" : "translate-y-full sm:translate-y-2"
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700 sm:hidden" aria-hidden />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-white">
            <Globe className="h-4.5 w-4.5 text-indigo-500" />
            {t("Pilih Bahasa")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={t("Tutup")}
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="space-y-1.5">
          {options.map((opt) => {
            const isActive = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSelect(opt.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors",
                  isActive
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "border-black/10 text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                )}
              >
                <span>{opt.label}</span>
                {isActive ? <Check className="h-4 w-4" /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
