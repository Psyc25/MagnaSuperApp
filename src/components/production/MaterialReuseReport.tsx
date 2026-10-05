"use client";

import { useMemo, useState } from "react";
import { Boxes, ChevronDown, PackageSearch, Recycle, Repeat } from "lucide-react";
import { useProductionData } from "./ProductionDataProvider";
import { computeMaterialReuse } from "@/lib/production/materialUsageReport";
import { formatDateID } from "@/lib/magnarent/date";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { BOOTH_STATUS_STYLES as STATUS_BADGE } from "@/lib/status-styles";
import { GLASS_BORDER, GLASS_INPUT, GLASS_SURFACE } from "@/lib/glass";

const ACCENT_ORANGE = "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)";
const ACCENT_EMERALD = "linear-gradient(135deg, #10B981 0%, #22D3EE 100%)";
const ACCENT_ZINC = "linear-gradient(135deg, #71717A 0%, #A1A1AA 100%)";

const ALL_FILTER = "Semua Material";
const REUSED_FILTER = "Dipakai Ulang (>1 Proyek)";
const UNUSED_FILTER = "Belum Pernah Dipakai";

/**
 * Rekap pemakaian material lintas proyek booth — jawaban langsung untuk
 * permintaan investor (diteruskan owner) soal pelacakan material yang
 * dipakai ULANG di beberapa proyek berbeda, bukan cuma sekali pakai/beli
 * baru tiap proyek. Diurutkan dari yang paling sering dipakai ulang dulu
 * — itu material yang paling penting dijaga stoknya karena permintaannya
 * berulang, kebalikan dari laporan "Perputaran Alat" Magnarent yang
 * justru menyorot alat yang JARANG dipakai (kandidat dilepas).
 */
export function MaterialReuseReport() {
  const { materials, projects } = useProductionData();
  const [filter, setFilter] = useState<string>(ALL_FILTER);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => computeMaterialReuse(materials, projects), [materials, projects]);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.projectCount - a.projectCount), [rows]);

  const filtered = useMemo(() => {
    if (filter === REUSED_FILTER) return sorted.filter((r) => r.projectCount > 1);
    if (filter === UNUSED_FILTER) return sorted.filter((r) => r.projectCount === 0);
    return sorted;
  }, [sorted, filter]);

  const summary = useMemo(() => {
    const reused = rows.filter((r) => r.projectCount > 1).length;
    const unused = rows.filter((r) => r.projectCount === 0).length;
    return { total: rows.length, reused, unused };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Jenis Material" value={String(summary.total)} icon={Boxes} accent={ACCENT_ZINC} />
        <StatCard
          label="Dipakai Ulang (>1 Proyek)"
          value={String(summary.reused)}
          icon={Recycle}
          accent={ACCENT_EMERALD}
          delayMs={60}
          ratio={
            summary.total > 0
              ? { value: summary.reused, total: summary.total, caption: `dari ${summary.total} jenis material` }
              : undefined
          }
        />
        <StatCard
          label="Belum Pernah Dipakai"
          value={String(summary.unused)}
          icon={PackageSearch}
          accent={ACCENT_ORANGE}
          delayMs={120}
          ratio={
            summary.total > 0
              ? { value: summary.unused, total: summary.total, caption: `dari ${summary.total} jenis material` }
              : undefined
          }
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Pemakaian Material per Proyek</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Diurutkan dari yang paling sering dipakai ulang — ini material yang paling penting dijaga stoknya.
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-orange-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
        >
          <option>{ALL_FILTER}</option>
          <option>{REUSED_FILTER}</option>
          <option>{UNUSED_FILTER}</option>
        </select>
      </div>

      <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Recycle}
            title={rows.length === 0 ? "Belum ada material terdaftar" : "Tidak ada hasil"}
            description={
              rows.length === 0
                ? "Tambahkan material di tab Material untuk mulai memantau pemakaiannya."
                : "Coba ubah filter di atas."
            }
          />
        ) : (
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {filtered.map((r) => {
              const isOpen = expandedId === r.material.id;
              return (
                <div key={r.material.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : r.material.id)}
                    disabled={r.projectCount === 0}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-white/5"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        r.projectCount === 0 ? "text-zinc-200 dark:text-zinc-700" : "text-zinc-400",
                        isOpen && "rotate-180"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                        {r.material.name}
                      </p>
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {r.material.category} · {r.material.location}
                      </p>
                    </div>
                    <div className="hidden shrink-0 gap-6 sm:flex">
                      <div className="w-28 text-right">
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Total Qty Terpakai</p>
                        <p className="text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                          {r.totalQtyUsed} {r.material.unit}
                        </p>
                      </div>
                      <div className="w-32 text-right">
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Dipakai Di</p>
                        {r.projectCount > 1 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <Repeat className="h-3 w-3" />
                            {r.projectCount} proyek
                          </span>
                        ) : r.projectCount === 1 ? (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">1 proyek</span>
                        ) : (
                          <span className="text-xs text-zinc-300 dark:text-zinc-600">Belum pernah</span>
                        )}
                      </div>
                    </div>
                  </button>

                  {isOpen && r.projects.length > 0 && (
                    <div className="border-t border-black/5 bg-zinc-50/60 px-5 py-4 dark:border-white/5 dark:bg-white/[0.02]">
                      <ul className="space-y-1.5">
                        {r.projects.map((ref) => (
                          <li
                            key={ref.projectId}
                            className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg px-3 py-1.5 text-xs shadow-sm", GLASS_SURFACE, GLASS_BORDER)}
                          >
                            <span className="font-medium text-zinc-700 dark:text-zinc-200">{ref.projectName}</span>
                            <span className="text-zinc-400 dark:text-zinc-500">{formatDateID(ref.date)}</span>
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_BADGE[ref.status])}>
                              {ref.status}
                            </span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                              {ref.qty} {r.material.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
