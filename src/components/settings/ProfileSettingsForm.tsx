"use client";

import { useRef, useState, type FormEvent } from "react";
import { Camera, Loader2, Trash2, UserRound } from "lucide-react";
import { updateNickname, updateProfileInfo } from "@/lib/settings/actions";
import { NICKNAME_RULE, isValidNickname, normalizeNickname } from "@/lib/shared/nickname";
import { useToast } from "@/components/ui/ToastProvider";
import { getAvatarColor, getInitials } from "@/lib/shared/utils";
import { compressAvatarImage } from "@/lib/shared/image";
import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/supabase/types";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

/**
 * Kartu "Profil" di halaman Pengaturan — ubah nama, nama panggilan (@tag
 * di Chat) & foto profil sendiri.
 * Pola FormData + panggil Server Action langsung (bukan lewat action=
 * di <form>) sama seperti ProductManager.tsx, supaya bisa validasi &
 * preview foto di klien dulu sebelum submit.
 */
export function ProfileSettingsForm({ profile }: { profile: Profile & { email: string } }) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [savedNickname, setSavedNickname] = useState(profile.username || "");
  const [nickname, setNickname] = useState(profile.username || "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [removeFlag, setRemoveFlag] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayedPhoto = preview ?? (removeFlag ? null : avatarUrl);

  function handlePickPhoto() {
    fileInputRef.current?.click();
  }

  /**
   * Tahap 35: foto langsung DIKOMPRES di sini, sebelum ditampilkan sebagai
   * preview — bukan cuma saat submit — supaya `selectedFile` yang dipakai
   * `handleSubmit` sudah pasti versi kecilnya, dan preview yang dilihat
   * pengguna sama persis dengan yang bakal terupload (lihat komentar di
   * src/lib/shared/image.ts untuk alasan lengkap perubahan ini). File input
   * asli (kamera HP dsb.) bisa 5-15MB dan dulu langsung ditolak server
   * dengan pesan kecil yang gampang tidak kelihatan di HP.
   */
  async function handleFileChange() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("File foto bukan gambar.");
      return;
    }
    setError(null);
    setRemoveFlag(false);
    setIsCompressing(true);
    try {
      const compressed = await compressAvatarImage(file);
      setSelectedFile(compressed);
      setPreview(URL.createObjectURL(compressed));
    } finally {
      setIsCompressing(false);
    }
  }

  function handleRemovePhoto() {
    setRemoveFlag(true);
    setPreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) {
      setError("Nama tidak boleh kosong.");
      return;
    }

    const nextNickname = normalizeNickname(nickname);
    const nicknameChanged = nextNickname !== savedNickname;
    if (nicknameChanged && !isValidNickname(nextNickname)) {
      setError(NICKNAME_RULE);
      return;
    }

    const formData = new FormData();
    formData.set("fullName", trimmed);
    if (selectedFile) formData.set("avatar", selectedFile);
    if (removeFlag) formData.set("removeAvatar", "1");

    setError(null);
    setIsPending(true);
    if (nicknameChanged) {
      const nicknameResult = await updateNickname(nextNickname);
      if (!nicknameResult.ok) {
        setIsPending(false);
        setError(nicknameResult.error);
        showToast(nicknameResult.error, "error");
        return;
      }
      setSavedNickname(nicknameResult.nickname);
      setNickname(nicknameResult.nickname);
    }
    const result = await updateProfileInfo(formData);
    setIsPending(false);

    if (!result.ok) {
      // Tahap 35: dulu cuma teks kecil di bawah form (gampang tidak
      // kelihatan/terlewat di layar HP) — sekarang juga muncul sebagai
      // toast supaya kegagalan simpan (mis. sesi habis, upload gagal)
      // tidak terasa seperti "diam saja tanpa respons".
      setError(result.error);
      showToast(result.error, "error");
      return;
    }

    setAvatarUrl(result.avatarUrl);
    setPreview(null);
    setSelectedFile(null);
    setRemoveFlag(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("Profil berhasil diperbarui.");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("h-fit rounded-2xl border p-5 shadow-sm", GLASS_SURFACE, GLASS_BORDER)}
    >
      <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Profil</h2>

      <div className="mt-4 flex items-center gap-4">
        <span className="relative shrink-0">
          {displayedPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto berasal dari Supabase Storage, bukan aset lokal Next.js
            <img
              src={displayedPhoto}
              alt="Foto profil"
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <span
              className={cn(
                "grid h-16 w-16 place-items-center rounded-full text-lg font-bold text-white",
                getAvatarColor(profile.full_name || profile.email)
              )}
            >
              {profile.full_name ? getInitials(profile.full_name) : <UserRound className="h-6 w-6" />}
            </span>
          )}
        </span>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={handlePickPhoto}
            disabled={isCompressing}
            className="flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            {isCompressing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            {isCompressing ? "Memproses foto…" : "Ganti Foto"}
          </button>
          {displayedPhoto && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Hapus Foto
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="settings-full-name" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Nama Lengkap
        </label>
        <input
          id="settings-full-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-indigo-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
        />
      </div>

      <div className="mt-3">
        <label htmlFor="settings-nickname" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Nama Panggilan
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">@</span>
          <input
            id="settings-nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="mis. angel"
            className="w-full rounded-xl border border-black/10 bg-transparent py-2 pl-8 pr-3.5 text-sm text-zinc-900 outline-none ring-indigo-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
          />
        </div>
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
          Dipakai teman setim untuk menandai Anda di Chat. 3-20 karakter, tanpa spasi.
        </p>
      </div>

      <div className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
        <p className="font-semibold text-zinc-500 dark:text-zinc-400">Email (untuk login)</p>
        <p className="mt-0.5 truncate">{profile.email}</p>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
        Email & divisi cuma bisa diubah admin — hubungi admin kalau ada yang perlu diganti.
      </p>

      {error && <p className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending || isCompressing}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Simpan Profil
      </button>
    </form>
  );
}
