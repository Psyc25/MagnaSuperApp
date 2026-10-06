"use client";

import { useState } from "react";
import { Copy, KeyRound, Loader2, UserPlus } from "lucide-react";
import { createStaffAccount } from "@/app/dashboard/admin/actions";
import { DIVISION_LABELS, type Division } from "@/lib/supabase/types";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { NICKNAME_RULE } from "@/lib/shared/nickname";

const DIVISION_OPTIONS: Array<{ value: Division; hint: string }> = [
  { value: "production", hint: "Hanya modul Production" },
  { value: "magnarent", hint: "Hanya modul Magnarent" },
  { value: "magnative", hint: "Hanya modul Magnativ" },
  { value: "all", hint: "Semua modul (Owner)" },
  { value: "investor", hint: "Bisa lihat semua divisi (tanpa ubah data) + Approve/Reject Pengajuan Modal" },
  {
    value: "finance",
    hint: "Hanya Piutang & Pendapatan, Akuntansi, Laba-Rugi, Neraca, Arus Kas & Faktur",
  },
];

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Form buat akun staf — pengganti halaman /register publik. Password awal
 * bisa diketik manual atau di-generate acak lalu disalin, supaya admin
 * bisa langsung membagikannya ke staf (WhatsApp, dsb). Staf bisa ganti
 * password itu sendiri nanti lewat "Lupa password?" di halaman login.
 */
export function CreateStaffForm() {
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    setPassword(generatePassword());
    setCopied(false);
  }

  async function handleCopy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Diamkan — clipboard API bisa gagal tanpa izin browser, tidak fatal.
    }
  }

  return (
    <div className={cn("h-fit rounded-2xl border p-5 shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Buat Akun Staf</h2>
      </div>

      <form action={createStaffAccount} onSubmit={() => setIsPending(true)} className="mt-4 space-y-3.5">
        <div>
          <label htmlFor="create-staff-full-name" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Nama Lengkap
          </label>
          <input
            id="create-staff-full-name"
            type="text"
            name="fullName"
            required
            placeholder="mis. Angel Putri"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-indigo-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>

        <div>
          <label htmlFor="create-staff-email" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Email
          </label>
          <input
            id="create-staff-email"
            type="email"
            name="email"
            required
            placeholder="email staf"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-indigo-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />
          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            Dipakai untuk login dan untuk reset password kalau lupa.
          </p>
        </div>

        <div>
          <label htmlFor="create-staff-nickname" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Nama Panggilan <span className="font-normal text-zinc-400">(opsional)</span>
          </label>
          <input
            id="create-staff-nickname"
            type="text"
            name="nickname"
            pattern="[A-Za-z0-9._\-]{3,20}"
            title={NICKNAME_RULE}
            placeholder="mis. angel"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-indigo-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />
          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            Untuk @tag di Chat. Kosongkan untuk dibuat otomatis dari nama depan; staf bisa menggantinya sendiri di Pengaturan.
          </p>
        </div>

        <div>
          <label htmlFor="create-staff-division" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Divisi / Akses
          </label>
          <select
            id="create-staff-division"
            name="division"
            required
            defaultValue="production"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-indigo-500/40 focus:ring-2 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          >
            {DIVISION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {DIVISION_LABELS[opt.value]} — {opt.hint}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="create-staff-password" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Password Awal
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                id="create-staff-password"
                type="text"
                name="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 6 karakter"
                className="w-full rounded-xl border border-black/10 bg-transparent py-2 pl-10 pr-3 text-sm text-zinc-900 outline-none ring-indigo-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              className="shrink-0 rounded-xl border border-black/10 px-3 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              Acak
            </button>
            {password && (
              <button
                type="button"
                onClick={handleCopy}
                title="Salin password"
                aria-label="Salin password"
                className="shrink-0 rounded-xl border border-black/10 px-2.5 text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            {copied ? "Password disalin ke clipboard." : "Bagikan email & password ini langsung ke staf."}
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Buat Akun
        </button>
      </form>
    </div>
  );
}
