"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { updateOwnPassword } from "@/lib/settings/actions";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

/**
 * Kartu "Ganti Password" di halaman Pengaturan (permintaan Owner Okt
 * 2026) -- supaya staf bisa ganti password akun sendiri kapan saja tanpa
 * perlu menghubungi admin atau lewat "Lupa password?" (yang butuh email
 * benar-benar terkirim). Wajib isi password SAAT INI dulu -- diverifikasi
 * server lewat `updateOwnPassword` (lihat komentar di sana) sebelum
 * password baru disimpan.
 *
 * Form dikirim manual lewat `handleSubmit` (bukan `action=` langsung di
 * <form>) supaya hasilnya (sukses/gagal) bisa ditampilkan sebagai toast +
 * field di bawah form dibersihkan setelah berhasil -- pola sama dengan
 * ProfileSettingsForm.tsx. `PasswordInput` murni uncontrolled (tanpa
 * value/onChange), jadi dibersihkan lewat `form.reset()` bawaan browser.
 */
export function ChangePasswordForm() {
  const { showToast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);

    setError(null);
    setIsPending(true);
    const result = await updateOwnPassword(formData);
    setIsPending(false);

    if (!result.ok) {
      setError(result.error);
      showToast(result.error, "error");
      return;
    }

    formEl.reset();
    showToast("Password berhasil diganti.");
  }

  return (
    <form onSubmit={handleSubmit} className={cn("h-fit rounded-2xl border p-5 shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Ganti Password</h2>
      </div>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
        Ganti password akun Anda sendiri kapan saja -- tidak perlu menghubungi admin.
      </p>

      <div className="mt-4 space-y-3.5">
        <div>
          <label
            htmlFor="settings-current-password"
            className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
          >
            Password Saat Ini
          </label>
          <PasswordInput
            id="settings-current-password"
            name="currentPassword"
            required
            autoComplete="current-password"
            placeholder="password Anda sekarang"
          />
        </div>
        <div>
          <label
            htmlFor="settings-new-password"
            className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
          >
            Password Baru
          </label>
          <PasswordInput
            id="settings-new-password"
            name="newPassword"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="min. 6 karakter"
          />
        </div>
        <div>
          <label
            htmlFor="settings-confirm-new-password"
            className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
          >
            Konfirmasi Password Baru
          </label>
          <PasswordInput
            id="settings-confirm-new-password"
            name="confirmPassword"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="ulangi password baru"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Simpan Password Baru
      </button>
    </form>
  );
}
