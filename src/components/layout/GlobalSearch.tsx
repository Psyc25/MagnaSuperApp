"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { searchGlobal, type SearchResult } from "@/lib/search/actions";
import { useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

const MODULE_LABEL: Record<string, string> = {
  magnarent: "Magnarent",
  magnative: "Magnativ",
  production: "Production",
  admin: "Admin",
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

/**
 * Kotak cari global di Topbar (Tahap 23) — cari lintas SEMUA modul
 * sekaligus (booking, inventaris, klien, proyek, invoice, produk,
 * pengajuan modal, dst), bukan cuma modul yang sedang dibuka. Hasilnya
 * otomatis dibatasi RLS lewat RPC `global_search` (migrasi 0022) — staf
 * cuma lihat hasil dari data yang memang boleh dia akses, persis seperti
 * kalau buka menunya satu-satu secara manual.
 *
 * Pola dropdown (ref + mousedown listener untuk klik-di-luar-menutup) sama
 * persis dengan `PushNotificationBell`/menu profil di Topbar.tsx — sengaja
 * disamakan supaya perilakunya konsisten di seluruh header.
 */
export function GlobalSearch() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const data = await searchGlobal(trimmed);
        setResults(data);
      });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function closeAndReset() {
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function handleSelect(url: string) {
    closeAndReset();
    router.push(url);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") closeAndReset();
  }

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.module] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn("grid h-9 w-9 place-items-center rounded-full border text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-white/5", GLASS_SURFACE, GLASS_BORDER)}
        aria-label={t("Cari")}
      >
        <Search className="h-4 w-4" />
      </button>

      {open && (
        <div className={cn("animate-fade-in fixed inset-x-4 top-[4.5rem] z-40 overflow-hidden rounded-2xl border shadow-xl shadow-black/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:z-auto sm:mt-2 sm:w-96", GLASS_SURFACE, GLASS_BORDER)}>
          <div className="border-b border-black/5 p-3 dark:border-white/10">
            <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <Search className="h-4 w-4 shrink-0 text-zinc-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("Cari booking, klien, invoice, dll…")}
                className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
              />
              {isPending && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {query.trim().length < MIN_QUERY_LENGTH ? (
              <p className="px-2 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
                {t("Ketik minimal {n} huruf untuk mulai cari.").replace("{n}", String(MIN_QUERY_LENGTH))}
              </p>
            ) : results.length === 0 && !isPending ? (
              <p className="px-2 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
                {t("Tidak ada hasil untuk")} &quot;{query.trim()}&quot;.
              </p>
            ) : (
              Object.entries(grouped).map(([moduleKey, items]) => (
                <div key={moduleKey} className="mb-1 last:mb-0">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {t(MODULE_LABEL[moduleKey] ?? moduleKey)}
                  </p>
                  {items.map((item) => (
                    <button
                      key={`${item.entityType}-${item.entityId}`}
                      type="button"
                      onClick={() => handleSelect(item.url)}
                      className="flex w-full flex-col items-start rounded-xl px-2 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5"
                    >
                      <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                        {item.title}
                      </span>
                      <span className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                        {item.entityType} — {item.subtitle}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
