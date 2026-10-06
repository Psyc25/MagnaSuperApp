"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NICKNAME_RULE, isValidNickname, normalizeNickname } from "@/lib/shared/nickname";
import type { LanguagePreference, ThemePreference } from "@/lib/supabase/types";

const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";
const AVATAR_BUCKET = "avatars";

export type MutationResult = { ok: true } | { ok: false; error: string };
export type ProfileUpdateResult = { ok: true; avatarUrl: string | null } | { ok: false; error: string };

/**
 * Tahap 27 — halaman Pengaturan. Semua fungsi di sini SENGAJA cuma
 * menyentuh kolom non-privileged (full_name, avatar, tema, bahasa) —
 * kecuali `updateNickname` di bawah. division/role/username dijaga trigger
 * `protect_privileged_profile_columns` (migrasi 0023) di level database,
 * jadi bukan cuma "tidak ditawarkan di form ini", tapi memang tidak bisa
 * lewat jalur mana pun selain admin.
 */
export async function updateProfileInfo(formData: FormData): Promise<ProfileUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi sudah berakhir, silakan masuk ulang." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) return { ok: false, error: "Nama tidak boleh kosong." };

  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_storage_path")
    .eq("id", user.id)
    .single();

  let avatarUrl: string | null | undefined = undefined;
  let avatarStoragePath: string | null | undefined = undefined;

  const file = formData.get("avatar");
  const removeAvatar = formData.get("removeAvatar") === "1";

  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "File foto bukan gambar." };
    }
    // Tahap 35: dinaikkan dari 3MB — sekarang klien SUDAH mengompres foto
    // sebelum sampai sini (lihat src/lib/shared/image.ts), jadi upload
    // normal praktis tidak akan pernah mendekati batas ini lagi. Batas 8MB
    // di sini murni jaring pengaman terakhir (mis. browser sangat lama yang
    // tidak mendukung kompresi klien), bukan batas yang diharapkan kena
    // dalam pemakaian sehari-hari.
    if (file.size > 8 * 1024 * 1024) {
      return { ok: false, error: "Ukuran foto masih terlalu besar (maksimal 8MB), coba foto lain." };
    }
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
    // Diawali user.id sebagai "folder" — inilah yang dicek policy storage
    // (avatars_insert_own dkk di migrasi 0023) supaya tiap orang cuma bisa
    // menulis ke foldernya sendiri.
    const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) {
      console.error("[settings] Upload foto profil gagal:", uploadError.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
    avatarUrl = publicUrl;
    avatarStoragePath = storagePath;
  } else if (removeAvatar) {
    avatarUrl = null;
    avatarStoragePath = null;
  }

  const updatePayload: Record<string, unknown> = { full_name: fullName };
  if (avatarUrl !== undefined) {
    updatePayload.avatar_url = avatarUrl;
    updatePayload.avatar_storage_path = avatarStoragePath;
  }

  const { error } = await supabase.from("profiles").update(updatePayload).eq("id", user.id);

  if (error) {
    console.error("[settings] updateProfileInfo gagal:", error.message);
    // Foto sudah kadung terupload — bersihkan supaya tidak jadi sampah di storage.
    if (avatarStoragePath) await supabase.storage.from(AVATAR_BUCKET).remove([avatarStoragePath]);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Hapus foto lama SETELAH update sukses (baru dianggap benar-benar diganti).
  const oldPath = current?.avatar_storage_path as string | null | undefined;
  if (oldPath && (avatarStoragePath !== undefined || removeAvatar)) {
    await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
  }

  revalidatePath("/", "layout");
  return { ok: true, avatarUrl: avatarUrl !== undefined ? avatarUrl : null };
}

export async function updateThemePreference(theme: ThemePreference): Promise<MutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi sudah berakhir, silakan masuk ulang." };

  const { error } = await supabase.from("profiles").update({ theme_preference: theme }).eq("id", user.id);
  if (error) {
    console.error("[settings] updateThemePreference gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Supaya <html> di root layout (server component) langsung ikut kepilih
  // ulang di kunjungan/refresh berikutnya — perubahan instan di tab yang
  // sedang terbuka ditangani langsung di klien (lihat ThemeLanguageForm).
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateLanguagePreference(language: LanguagePreference): Promise<MutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi sudah berakhir, silakan masuk ulang." };

  const { error } = await supabase.from("profiles").update({ language_preference: language }).eq("id", user.id);
  if (error) {
    console.error("[settings] updateLanguagePreference gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export type NicknameUpdateResult = { ok: true; nickname: string } | { ok: false; error: string };

/**
 * Ganti nama panggilan SENDIRI (dipakai untuk @tag di Chat). Kolomnya
 * `profiles.username`, yang dijaga trigger protect_privileged_profile_columns
 * dari update langsung oleh pemilik akun -- dulu karena username dipakai
 * login. Sekarang login lewat email, jadi pemilik akun boleh menggantinya;
 * update dijalankan lewat service role, dan server sendiri yang memastikan
 * baris yang diubah HANYA milik pemanggil (id dari sesi, bukan dari form).
 */
export async function updateNickname(input: string): Promise<NicknameUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi sudah berakhir, silakan masuk ulang." };

  const nickname = normalizeNickname(input);
  if (!isValidNickname(nickname)) return { ok: false, error: NICKNAME_RULE };

  const admin = createAdminClient();
  const { data: taken } = await admin
    .from("profiles")
    .select("id")
    .eq("username", nickname)
    .neq("id", user.id)
    .maybeSingle();
  if (taken) return { ok: false, error: `Nama panggilan "@${nickname}" sudah dipakai orang lain.` };

  // app_metadata DULUAN: trigger on_auth_user_created jalan AFTER INSERT OR
  // UPDATE di auth.users (migrasi 0089) dan menyalin app_metadata.username ke
  // profiles setiap kali baris auth berubah -- termasuk setiap login. Kalau
  // cuma profiles yang diubah, nama panggilan balik ke nilai lama saat login
  // berikutnya. Update ini sendiri juga memicu trigger itu, jadi profiles
  // ikut terisi; update profiles di bawah hanya untuk memastikan.
  const { data: fresh } = await admin.auth.admin.getUserById(user.id);
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(fresh?.user?.app_metadata ?? user.app_metadata ?? {}), username: nickname },
  });
  if (metaError) {
    const duplicate = /duplicate|unique/i.test(metaError.message);
    if (duplicate) return { ok: false, error: `Nama panggilan "@${nickname}" sudah dipakai orang lain.` };
    console.error("[settings] updateNickname (app_metadata) gagal:", metaError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const { error } = await admin.from("profiles").update({ username: nickname }).eq("id", user.id);
  if (error) {
    console.error("[settings] updateNickname (profiles) gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath("/", "layout");
  return { ok: true, nickname };
}
