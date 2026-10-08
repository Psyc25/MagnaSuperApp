"use client";

import { useRef, useState } from "react";
import { Copy, KeyRound, Trash2, Users } from "lucide-react";
import { deleteStaffAccount, resetStaffPassword, updateStaffDivision } from "@/app/dashboard/admin/actions";
import { DIVISION_BADGE_CLASSES, DIVISION_LABELS, type Division } from "@/lib/supabase/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

/** Sama persis dengan generatePassword() di CreateStaffForm.tsx -- dipakai
 * lagi di sini untuk mengisi awal password reset, admin tetap bebas
 * mengetik sendiri kalau mau. Diduplikasi (bukan diimpor) sengaja, pola
 * sudah dipakai di tempat lain di modul ini untuk helper kecil semacam ini. */
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

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
  const [resetTarget, setResetTarget] = useState<StaffRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetCopied, setResetCopied] = useState(false);

  function openResetModal(s: StaffRow) {
    setResetTarget(s);
    setResetPassword(generatePassword());
    setResetCopied(false);
  }

  async function handleResetCopy() {
    if (!resetPassword) return;
    try {
      await navigator.clipboard.writeText(resetPassword);
      setResetCopied(true);
      setTimeout(() => setResetCopied(false), 2000);
    } catch {
      // Diamkan -- clipboard API bisa gagal tanpa izin browser, tidak fatal.
    }
  }

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
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openResetModal(s)}
                            title="Reset password"
                            aria-label="Reset password"
                            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
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
                        </div>
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

      {/*
        Reset password staf lain -- jalur yang sebelumnya tidak ada sama
        sekali (permintaan Owner Okt 2026): dulu password staf hanya bisa
        diatur SEKALI saat `createStaffAccount`, tidak ada cara mengubahnya
        lagi dari dalam app kalau staf lupa dan email "Lupa password?"
        tidak bisa diandalkan. Password BARU digenerate/diketik di sini,
        DIPERLIHATKAN APA ADANYA (bukan PasswordInput tersembunyi) supaya
        admin bisa menyalin & membagikannya ke staf -- begitu modal ditutup
        atau form berhasil disubmit, nilainya hilang dari layar ini
        SELAMANYA (server tidak pernah menyimpannya di tempat lain, lihat
        komentar `resetStaffPassword` di actions.ts), jadi peringatan
        "salin dulu" di bawah ini penting, bukan formalitas.
      */}
      <Modal open={resetTarget !== null} onClose={() => setResetTarget(null)} title="Reset Password Staf" maxWidth="max-w-sm">
        {resetTarget && (
          <form action={resetStaffPassword} className="space-y-4">
            <input type="hidden" name="userId" value={resetTarget.id} />
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Atur password baru untuk{" "}
              <strong>{resetTarget.full_name || resetTarget.username || resetTarget.email}</strong>. Password lamanya
              langsung tidak berlaku begitu disimpan.
            </p>

            <div>
              <label
                htmlFor="reset-staff-password"
                className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
              >
                Password Baru
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="reset-staff-password"
                    type="text"
                    name="password"
                    required
                    minLength={6}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="min. 6 karakter"
                    className="w-full rounded-xl border border-black/10 bg-transparent py-2 pl-10 pr-3 text-sm text-zinc-900 outline-none ring-indigo-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setResetPassword(generatePassword());
                    setResetCopied(false);
                  }}
                  className="shrink-0 rounded-xl border border-black/10 px-3 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                >
                  Acak
                </button>
                <button
                  type="button"
                  onClick={handleResetCopy}
                  title="Salin password"
                  aria-label="Salin password"
                  className="shrink-0 rounded-xl border border-black/10 px-2.5 text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                {resetCopied
                  ? "Password disalin ke clipboard."
                  : "Salin dulu sebelum menyimpan -- tidak akan ditampilkan lagi sesudah ini."}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={resetPassword.length < 6}
                className="rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset Password Sekarang
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
