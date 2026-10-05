"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useResetOnChange } from "@/lib/shared/use-synced-state";

/** Selector elemen yang bisa menerima fokus keyboard — dipakai untuk cari
 * elemen pertama/terakhir waktu modal dibuka & untuk jebak Tab di dalamnya. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Tutup dengan tombol Escape — kenyamanan standar untuk modal.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Manajemen fokus: begitu modal terbuka, ingat elemen yang sedang fokus
  // (biasanya tombol yang memicu modal ini) lalu pindahkan fokus ke dalam
  // dialog — tanpa ini, pengguna keyboard/screen reader bisa Tab tembus ke
  // konten di belakang modal yang cuma diredupkan secara visual tapi
  // sebenarnya masih bisa diinteraksi. Begitu modal ditutup, fokus
  // dikembalikan ke elemen semula supaya posisi keyboard tidak "hilang".
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? dialog)?.focus();

    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  // Jebak Tab/Shift+Tab supaya fokus tetap berputar di dalam dialog selama
  // modal terbuka (WCAG 2.4.3 — focus order tidak boleh "bocor" ke belakang).
  useEffect(() => {
    if (!open) return;
    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
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

  // Transisi masuk (fade + scale) tanpa dependency tambahan — mulai dari
  // state "belum masuk" lalu pindah ke "masuk" sesaat setelah mount.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          "absolute inset-0 bg-zinc-950/50 backdrop-blur-sm transition-opacity duration-200",
          entered ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-black/5 bg-white p-6 shadow-2xl transition-all duration-200 outline-none dark:border-white/10 dark:bg-zinc-900",
          entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-1 scale-95 opacity-0",
          maxWidth
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="Tutup"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
