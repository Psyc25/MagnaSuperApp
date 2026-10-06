"use client";

import { useRef, useState } from "react";
import { Trash2, Users } from "lucide-react";
import { deleteStaffAccount, updateStaffDivision } from "@/app/dashboard/admin/actions";
import { DIVISION_BADGE_CLASSES, DIVISION_LABELS, type Division } from "@/lib/supabase/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

type StaffRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string;
  division: Division;
  created_at: string;
};

const DIVISION_OPTIONS: Division[] = ["magnarent", "magnative", "production", "all", "investor", "finance"];

// Warna solid untuk titik kecil di legenda — beda dari DIVISION_BADGE_CLASSES
// (yang pastel, untuk latar pill) supaya titiknya tetap terlihat jelas di
// mode terang maupun gelap.
const DIVISION_DOT_CLASSES: Record<Division, string> = {
  magnarent: "bg-sky-500",
  magnative: "bg-fuchsia-500",
  production: "bg-orange-500",
  all: "bg-amber-500",
  investor: "bg-emerald-500",
  finance: "bg-violet-500",
};

/**
 * Daftar staf terdaftar + kontrol ubah-divisi (select yang langsung submit
 * saat berubah) dan hapus akun. Baris akun sendiri sengaja dikunci —
 * mencegah admin tidak sengaja menurunkan akses atau menghapus akunnya
 * sendiri (server action juga menolak, ini cuma lapisan UX-nya).
 */
export function StaffTable({ staff, currentUserId }: { staff: StaffRow[]; currentUserId: string }) {
  const deleteFormRefs = useRef<Map<string, HTMLFormElement>>(new Map());
  const [confirmTarget, setConfirmTarget] = useState<StaffRow | null>(null);

  return (
    <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
      {staff.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-black/5 px-4 py-2.5 text-[11px] text-zinc-400 dark:border-white/10 dark:text-zinc-500">
          <span className="font-semibold text-zinc-500 dark:text-zinc-400">Warna divisi:</span>
          {(["all", "finance", "magnarent", "magnative", "production", "investor"] as Division[]).map((d) => (
            <span key={d} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", DIVISION_DOT_CLASSES[d])} />
              {DIVISION_LABELS[d]}
              {d === "all" && " (semua modul)"}
            </span>
          ))}
        </div>
      )}
      {staff.length === 0 ? (
        <EmptyState icon={Users} title="Belum ada akun staf" description="Buat akun pertama lewat form di sebelah." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Nama Panggilan</th>
                <th className="px-4 py-3">Email Pemulihan</th>
                <th className="px-4 py-3">Divisi / Akses</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const isSelf = s.id === currentUserId;
                return (
                  <tr key={s.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                    <td className="px-4 py-3 font-semibold text-zinc-800 dark:text-zinc-100">
                      {s.full_name || "—"}
                      {isSelf && (
                        <span className="ml-1.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                          Anda
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                      {s.username ? `@${s.username}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{s.email}</td>
                    <td className="px-4 py-3">
                      <form action={updateStaffDivision}>
                        <input type="hidden" name="userId" value={s.id} />
                        <select
                          name="division"
                          defaultValue={s.division}
                          disabled={isSelf}
                          onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          className={cn(
                            "rounded-full border-0 px-2.5 py-1 text-xs font-bold outline-none disabled:opacity-50",
                            DIVISION_BADGE_CLASSES[s.division]
                          )}
                        >
                          {DIVISION_OPTIONS.map((d) => (
                            <option
                              key={d}
                              value={d}
                              className={cn("font-semibold text-zinc-900 dark:text-white", GLASS_SURFACE, GLASS_BORDER)}
                            >
                              {DIVISION_LABELS[d]}
                            </option>
                          ))}
                        </select>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isSelf && (
                        <form
                          action={deleteStaffAccount}
                          ref={(el) => {
                            if (el) deleteFormRefs.current.set(s.id, el);
                            else deleteFormRefs.current.delete(s.id);
                          }}
                          className="inline"
                        >
                          <input type="hidden" name="userId" value={s.id} />
                          <button
                            type="button"
                            onClick={() => setConfirmTarget(s)}
                            title="Hapus akun"
                            aria-label="Hapus akun"
                            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => {
          const id = confirmTarget?.id;
          setConfirmTarget(null);
          if (id) deleteFormRefs.current.get(id)?.requestSubmit();
        }}
        title="Hapus Akun Staf"
        description={
          confirmTarget && (
            <>
              Hapus akun <strong>{confirmTarget.full_name || confirmTarget.username || confirmTarget.email}</strong>?
              Tindakan ini tidak bisa dibatalkan.
            </>
          )
        }
      />
    </div>
  );
}
