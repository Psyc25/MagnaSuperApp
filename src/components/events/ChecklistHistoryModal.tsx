"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { formatDateID, formatTimeID, isoDateInJakarta } from "@/lib/shared/utils";
import { getChecklistStatusLog } from "@/lib/events/actions";
import type { ChecklistStatusLogEntry } from "@/lib/events/types";

const DEFAULT_STATUS_STYLE = "border-zinc-300 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400";
// Label fase (model 8 tahap) + status lama untuk baris riwayat sebelum 0077a.
const CHECKLIST_STATUS_STYLE: Record<string, string> = {
  "Belum Mulai": DEFAULT_STATUS_STYLE,
  Design: "border-pink-300 text-pink-700 dark:border-pink-500/40 dark:text-pink-300",
  Mockup: "border-fuchsia-300 text-fuchsia-700 dark:border-fuchsia-500/40 dark:text-fuchsia-300",
  Completed: "border-teal-300 text-teal-700 dark:border-teal-500/40 dark:text-teal-300",
  "Loading In": "border-indigo-300 text-indigo-700 dark:border-indigo-500/40 dark:text-indigo-300",
  "Loading Out": "border-blue-300 text-blue-700 dark:border-blue-500/40 dark:text-blue-300",
  Sample: "border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300",
  Approval: "border-orange-300 text-orange-700 dark:border-orange-500/40 dark:text-orange-300",
  Preparation: "border-sky-300 text-sky-700 dark:border-sky-500/40 dark:text-sky-300",
  Production: "border-violet-300 text-violet-700 dark:border-violet-500/40 dark:text-violet-300",
  Finish: "border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300",
};

/**
 * Riwayat status & PIC satu item checklist (papan tulis Owner: "Preparation
 * PIC"/"Production PIC"/"Finish PIC" ditulis terpisah per tahap -- field
 * `pic` di `EventChecklistItem` cuma satu nilai yang ditimpa tiap kali
 * status berubah, jadi histori "siapa pegang tahap apa" perlu dilihat di
 * sini). Data DIAMBIL ON-DEMAND saat modal dibuka (bukan preload lewat
 * props Papan Tracking) lewat Server Action `getChecklistStatusLog`,
 * migrasi 0065.
 */
export function ChecklistHistoryModal({
  checklistItemId,
  itemName,
  onClose,
}: {
  checklistItemId: string;
  itemName: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<ChecklistStatusLogEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChecklistStatusLog(checklistItemId).then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [checklistItemId]);

  return (
    <Modal open onClose={onClose} title={`Riwayat — ${itemName}`}>
      {entries === null ? (
        <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">Memuat riwayat…</p>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Belum ada riwayat"
          description="Status/PIC item ini belum pernah diubah lewat Papan Tracking."
        />
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-black/5 px-3.5 py-2.5 dark:border-white/10"
            >
              <div className="min-w-0">
                <span
                  className={cn(
                    "inline-block rounded-full border px-2 py-0.5 text-xs font-semibold",
                    CHECKLIST_STATUS_STYLE[entry.status] ?? DEFAULT_STATUS_STYLE
                  )}
                >
                  {entry.status}
                </span>
                <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  PIC: {entry.picName ?? "Belum ditugaskan"}
                </p>
              </div>
              <span className="shrink-0 text-right text-[11px] text-zinc-400 dark:text-zinc-500">
                {formatDateID(isoDateInJakarta(entry.changedAt))}
                <br />
                {formatTimeID(entry.changedAt)} WIB
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
