"use client";

import { useMemo } from "react";
import { ArrowRight, CalendarClock, MapPin } from "lucide-react";
import { useProductionData } from "./ProductionDataProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { formatDateID, formatRupiah, todayISO } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import type { BoothProject, BoothStatus } from "@/lib/production/types";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

const STAGE_ORDER: BoothStatus[] = ["Desain", "Produksi", "Finishing", "Instalasi", "Selesai"];

const STAGE_DOT: Record<BoothStatus, string> = {
  Desain: "bg-sky-500",
  Produksi: "bg-amber-500",
  Finishing: "bg-violet-500",
  Instalasi: "bg-cyan-500",
  Selesai: "bg-emerald-500",
  Dibatalkan: "bg-rose-500",
};

/**
 * Papan kanban linimasa produksi booth — proyek dikelompokkan per tahap
 * (Desain → Produksi → Finishing → Instalasi → Selesai). Proyek yang
 * Dibatalkan sengaja tidak ditampilkan di papan ini (lihat detail/kelola
 * statusnya di tab Proyek Booth) supaya papan tetap fokus pada pipeline
 * yang masih berjalan. Tombol panah adalah aksi cepat memajukan tahap
 * tanpa perlu membuka modal edit penuh.
 */
export function ProductionSchedule() {
  const { projects, updateProjectStatus } = useProductionData();
  const { showToast } = useToast();
  const today = todayISO();

  const columns = useMemo(() => {
    return STAGE_ORDER.map((stage) => ({
      stage,
      items: projects
        .filter((p) => p.status === stage)
        .sort((a, b) => a.tanggalInstalasi.localeCompare(b.tanggalInstalasi)),
    }));
  }, [projects]);

  async function advance(p: BoothProject) {
    const idx = STAGE_ORDER.indexOf(p.status);
    if (idx === -1 || idx === STAGE_ORDER.length - 1) return;
    const next = STAGE_ORDER[idx + 1];
    const result = await updateProjectStatus(p.id, next, p.status);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`"${p.name}" dipindah ke tahap ${next}.`);
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">Linimasa Produksi</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Pipeline proyek booth dari desain hingga instalasi di lokasi acara.
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map(({ stage, items }) => (
          <div key={stage} className="w-72 shrink-0">
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className={cn("h-2 w-2 rounded-full", STAGE_DOT[stage])} />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{stage}</h3>
              <span className="text-xs font-medium text-zinc-400">{items.length}</span>
            </div>

            <div className="space-y-2.5">
              {items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-black/10 px-3.5 py-6 text-center text-xs text-zinc-400 dark:border-white/10">
                  Tidak ada proyek.
                </div>
              )}
              {items.map((p) => {
                const overdue = p.tanggalInstalasi < today && stage !== "Selesai";
                const isLast = stage === "Selesai";
                return (
                  <div
                    key={p.id}
                    className={cn("rounded-2xl border p-3.5 shadow-sm", GLASS_SURFACE, GLASS_BORDER)}
                  >
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{p.name}</p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{p.namaKlien}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{p.lokasiAcara}</span>
                    </p>
                    <p
                      className={cn(
                        "mt-1 flex items-center gap-1.5 text-xs font-medium",
                        overdue ? "text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400"
                      )}
                    >
                      <CalendarClock className="h-3 w-3 shrink-0" />
                      Instalasi {formatDateID(p.tanggalInstalasi)}
                      {overdue && " (lewat jadwal)"}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        {formatRupiah(p.budget)}
                      </span>
                      {!isLast && (
                        <button
                          type="button"
                          onClick={() => advance(p)}
                          title={`Majukan ke ${STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1]}`}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                        >
                          Majukan
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
