"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Trash2, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { formatDateID, formatTimeID } from "@/lib/shared/utils";
import {
  createCheckinLink,
  deleteCheckinLink,
  getCheckinStats,
  listCheckinLinks,
} from "@/lib/magnative/actions";
import type { CheckinLink, CheckinStats, Project } from "@/lib/magnative/types";

/**
 * Check-in QR & analitik on-site sederhana (rekomendasi Bagian 5-B #10
 * laporan riset kompetitor 24 Sep 2026) -- staf bikin link per proyek/sesi,
 * cetak/tampilkan QR-nya di venue, tamu scan lalu isi nama (opsional) lewat
 * halaman publik `/checkin/[token]`. Panel ini menampilkan rekap kehadiran
 * sebagai bukti keterlibatan on-site untuk laporan pasca-event ke klien
 * "Brand pitching". Migrasi 0068.
 */
export function CheckinModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { showToast } = useToast();
  const [links, setLinks] = useState<CheckinLink[] | null>(null);
  const [stats, setStats] = useState<CheckinStats | null>(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const [linkRows, statRows] = await Promise.all([listCheckinLinks(project.id), getCheckinStats(project.id)]);
    setLinks(linkRows);
    setStats(statRows);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCheckinLinks(project.id), getCheckinStats(project.id)]).then(([linkRows, statRows]) => {
      if (cancelled) return;
      setLinks(linkRows);
      setStats(statRows);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  async function handleCreate() {
    setCreating(true);
    const result = await createCheckinLink(project.id, label);
    setCreating(false);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setLabel("");
    await reload();
    showToast("Link check-in dibuat.");
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    const result = await deleteCheckinLink(id);
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    await reload();
  }

  function checkinUrl(token: string) {
    return `${window.location.origin}/checkin/${token}`;
  }

  return (
    <Modal open onClose={onClose} title={`Check-in On-site — ${project.name}`}>
      <div className="space-y-5">
        <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3.5 py-2.5 text-xs text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
          Total check-in tercatat: <span className="font-bold">{stats?.totalCheckins ?? 0}</span> tamu
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="checkin-label" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Label sesi/hari (opsional)
            </label>
            <input
              id="checkin-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="mis. Hari 1 - Pagi"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-violet-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={handleCreate}
            className="rounded-full bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {creating ? "Membuat..." : "+ Buat QR"}
          </button>
        </div>

        {links === null ? (
          <p className="text-xs text-zinc-400">Memuat...</p>
        ) : links.length === 0 ? (
          <EmptyState icon={Users} title="Belum ada QR check-in" description="Buat link check-in untuk sesi/hari event ini." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {links.map((l) => (
              <div key={l.id} className="flex flex-col items-center gap-2 rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
                <QRCodeSVG value={checkinUrl(l.token)} size={140} />
                <p className="text-center text-xs font-semibold text-zinc-700 dark:text-zinc-200">{l.label || "Tanpa label"}</p>
                <p className="max-w-full truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                  {checkinUrl(l.token).replace(/^https?:\/\//, "")}
                </p>
                <button
                  type="button"
                  onClick={() => handleDelete(l.id)}
                  disabled={busyId === l.id}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500 hover:underline disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" /> Hapus
                </button>
              </div>
            ))}
          </div>
        )}

        {stats && stats.checkins.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Linimasa Check-in Terbaru
            </p>
            <ul className="max-h-56 space-y-1.5 overflow-y-auto">
              {stats.checkins.slice(0, 30).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-xs dark:bg-white/5"
                >
                  <span className="text-zinc-700 dark:text-zinc-200">{c.guestName || "Tamu (tanpa nama)"}</span>
                  <span className="text-zinc-400 dark:text-zinc-500">
                    {formatDateID(c.checkedInAt.slice(0, 10))} {formatTimeID(c.checkedInAt)} WIB
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
