"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, PackageSearch, Users } from "lucide-react";
import { useProductionData } from "./ProductionDataProvider";
import { getProjectCrewForProjects } from "@/lib/production/extras-actions";
import {
  findCrewScheduleConflicts,
  findMaterialPressure,
  rankActiveProjectsByPriority,
  type CrewScheduleConflict,
  type MaterialPressure,
} from "@/lib/production/autoschedule";
import { formatDateID } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

/**
 * Autoschedule heuristik crew & material lintas proyek paralel
 * (analisis-kompetitor #22) -- panel read-only di halaman Jadwal Produksi,
 * menghitung ulang tiap kali proyek/material di context berubah. Semua
 * murni heuristik EDF + overlap tanggal, TIDAK ada panggilan AI/LLM.
 */
export function AutoscheduleConflictsPanel() {
  const { projects, materials } = useProductionData();
  const [fetchedCrewConflicts, setCrewConflicts] = useState<CrewScheduleConflict[] | null>(null);
  const materialPressure: MaterialPressure[] = findMaterialPressure(projects, materials);
  const activeIds = useMemo(() => rankActiveProjectsByPriority(projects).map((p) => p.id), [projects]);
  // Tanpa proyek aktif tidak ada yang perlu diambil -- langsung "tidak ada
  // bentrok", bukan setState di dalam effect.
  const crewConflicts = activeIds.length === 0 ? [] : fetchedCrewConflicts;

  useEffect(() => {
    if (activeIds.length === 0) return;
    let cancelled = false;
    getProjectCrewForProjects(activeIds).then((crew) => {
      if (cancelled) return;
      const refs = crew.map((c) => ({ projectId: c.projectId, nama: c.nama }));
      setCrewConflicts(findCrewScheduleConflicts(projects, refs));
    });
    return () => {
      cancelled = true;
    };
  }, [projects, activeIds]);

  const hasCrewIssue = (crewConflicts?.length ?? 0) > 0;
  const hasMaterialIssue = materialPressure.length > 0;

  if (crewConflicts !== null && !hasCrewIssue && !hasMaterialIssue) {
    return (
      <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
        Tidak ada bentrok jadwal kru atau tekanan material antar proyek aktif saat ini.
      </div>
    );
  }

  return (
    <div className="mb-5 space-y-3">
      {crewConflicts === null ? (
        <div className={cn("flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400", GLASS_SURFACE, GLASS_BORDER)}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Menghitung bentrok jadwal lintas proyek…
        </div>
      ) : (
        hasCrewIssue && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
              <Users className="h-4 w-4" />
              Bentrok Kru Lintas Proyek ({crewConflicts.length})
            </p>
            <ul className="space-y-1.5">
              {crewConflicts.map((c, i) => (
                <li key={i} className="text-xs text-amber-900 dark:text-amber-200">
                  <span className="font-semibold">{c.crewName}</span> ditugaskan ke{" "}
                  <span className="font-semibold">{c.keepProjectName}</span> (instalasi {formatDateID(c.keepDeadline)}) DAN{" "}
                  <span className="font-semibold">{c.atRiskProjectName}</span> (instalasi {formatDateID(c.atRiskDeadline)})
                  yang jadwalnya tumpang tindih. Saran: pertahankan di{" "}
                  <span className="font-semibold">{c.keepProjectName}</span> (deadline lebih dekat), carikan kru
                  pengganti untuk <span className="font-semibold">{c.atRiskProjectName}</span>.
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {hasMaterialIssue && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-rose-800 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            Tekanan Material Lintas Proyek ({materialPressure.length})
          </p>
          <ul className="space-y-2">
            {materialPressure.map((m) => (
              <li key={m.materialId} className="text-xs text-rose-900 dark:text-rose-200">
                <p className="flex items-center gap-1 font-semibold">
                  <PackageSearch className="h-3 w-3" />
                  {m.materialName}: butuh {m.totalRequested}, stok {m.stock} (kurang {m.shortfall})
                </p>
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  {m.affected.map((a) => (
                    <li key={a.projectId}>
                      #{a.priorityRank} <span className="font-semibold">{a.projectName}</span> — {a.qty} unit,
                      instalasi {formatDateID(a.tanggalInstalasi)}
                      {a.priorityRank === 1 ? " (prioritas, dapat alokasi duluan)" : " (perlu PO tambahan/alternatif)"}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
