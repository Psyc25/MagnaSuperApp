"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";
import type { Division } from "@/lib/supabase/types";
import { NICKNAME_RULE, isValidNickname, normalizeNickname, suggestNickname } from "@/lib/shared/nickname";

const VALID_DIVISIONS: Division[] = ["magnarent", "magnative", "production", "all", "investor", "finance"];
/** Konsisten dengan `GENERIC_ERROR` di modul lain (mis. capital-requests/actions.ts) —
 * pesan error Supabase Admin API mentah tidak pernah ditampilkan langsung ke
 * pengguna, cuma dicatat ke server log lewat `console.error` untuk ditelusuri. */
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";

/**
 * Semua Server Action di file ini mengubah data lewat service role
 * (`createAdminClient`), yang MELEWATI RLS sepenuhnya — jadi setiap satu
 * WAJIB mengecek ulang di server bahwa pemanggilnya memang division "all",
 * TIDAK cukup mengandalkan middleware atau UI yang menyembunyikan tombol.
 */
export async function requireFullAccess() {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "all") {
    redirect("/dashboard");
  }
  return profile;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function isNicknameTaken(admin: AdminClient, nickname: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("id").eq("username", nickname).maybeSingle();
  return Boolean(data);
}

async function findFreeNickname(admin: AdminClient, base: string): Promise<string> {
  if (!(await isNicknameTaken(admin, base))) return base;
  for (let i = 2; i <= 99; i += 1) {
    const candidate = `${base.slice(0, 20 - String(i).length)}${i}`;
    if (!(await isNicknameTaken(admin, candidate))) return candidate;
  }
  return `${base.slice(0, 14)}${crypto.randomUUID().slice(0, 6)}`;
}

export async function createStaffAccount(formData: FormData) {
  await requireFullAccess();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const typedNickname = normalizeNickname(formData.get("nickname"));
  const division = String(formData.get("division") ?? "") as Division;
  const password = String(formData.get("password") ?? "");

  if (!fullName || !email || !password) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent("Nama, email, dan password wajib diisi.")}`);
  }
  if (typedNickname && !isValidNickname(typedNickname)) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent(NICKNAME_RULE)}`);
  }
  if (!VALID_DIVISIONS.includes(division)) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent("Divisi tidak valid.")}`);
  }
  if (password.length < 6) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent("Password minimal 6 karakter.")}`);
  }

  const admin = createAdminClient();

  // Nama panggilan unik (kolom profiles.username). Diketik admin -> harus
  // belum dipakai; dikosongkan -> usulan dari nama depan, ditambah angka
  // kalau sudah ada yang memakai.
  let nickname = typedNickname;
  if (typedNickname) {
    if (await isNicknameTaken(admin, typedNickname)) {
      redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent(`Nama panggilan "@${typedNickname}" sudah dipakai.`)}`);
    }
  } else {
    nickname = await findFreeNickname(admin, suggestNickname(fullName, email));
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // full_name di user_metadata (boleh diubah sendiri nanti oleh pemilik
    // akun); nama panggilan (kunci `username`, nama lama) & division di
    // app_metadata -- dibaca trigger handle_new_user (migrasi 0003/0089).
    user_metadata: { full_name: fullName },
    app_metadata: { username: nickname, division },
  });

  if (error) {
    console.error("[admin] createStaffAccount gagal:", error.message);
    const message = error.message.toLowerCase().includes("already been registered")
      ? "Email ini sudah dipakai akun lain."
      : GENERIC_ERROR;
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/dashboard/admin/pengguna");
  void logActivity({
    module: "admin",
    action: "create",
    entityType: "staf",
    entityLabel: fullName,
    detail: `email: ${email}, nama panggilan: @${nickname}, divisi: ${division}`,
  });
  redirect(`/dashboard/admin/pengguna?notice=${encodeURIComponent(`Akun ${fullName} berhasil dibuat.`)}`);
}

export async function updateStaffDivision(formData: FormData) {
  const currentProfile = await requireFullAccess();

  const userId = String(formData.get("userId") ?? "");
  const division = String(formData.get("division") ?? "") as Division;

  if (!userId || !VALID_DIVISIONS.includes(division)) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent("Data tidak valid.")}`);
  }
  if (userId === currentProfile.id) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent("Tidak bisa mengubah divisi akun sendiri.")}`);
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.auth.admin.getUserById(userId);
  const currentAppMetadata = existing?.user?.app_metadata ?? {};

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...currentAppMetadata, division },
  });
  if (authError) {
    console.error("[admin] updateStaffDivision (auth) gagal:", authError.message);
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent(GENERIC_ERROR)}`);
  }

  const { error: profileError } = await admin.from("profiles").update({ division }).eq("id", userId);
  if (profileError) {
    console.error("[admin] updateStaffDivision (profile) gagal:", profileError.message);
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent(GENERIC_ERROR)}`);
  }

  revalidatePath("/dashboard/admin/pengguna");
  const staffName =
    (existing?.user?.user_metadata as { full_name?: string } | null | undefined)?.full_name ||
    existing?.user?.email ||
    userId;
  void logActivity({
    module: "admin",
    action: "update",
    entityType: "staf",
    entityLabel: staffName,
    detail: `divisi → ${division}`,
  });
  redirect(`/dashboard/admin/pengguna?notice=${encodeURIComponent("Divisi berhasil diperbarui.")}`);
}

export async function deleteStaffAccount(formData: FormData) {
  const currentProfile = await requireFullAccess();

  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent("Data tidak valid.")}`);
  }
  if (userId === currentProfile.id) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent("Tidak bisa menghapus akun sendiri.")}`);
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.auth.admin.getUserById(userId);
  const staffName =
    (existing?.user?.user_metadata as { full_name?: string } | null | undefined)?.full_name ||
    existing?.user?.email ||
    userId;

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[admin] deleteStaffAccount gagal:", error.message);
    // Hapus permanen bisa ditolak foreign key (staf yang pernah mengisi
    // checklist event / membuat link portal). Dulu admin cuma dapat "coba
    // lagi" dan staf yang sudah keluar TETAP bisa login. Sebagai gantinya
    // akun dinonaktifkan (ban) -- tidak bisa login/refresh sesi lagi, tapi
    // riwayat yang mengacu ke akun ini tetap utuh.
    const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    if (banError) {
      console.error("[admin] deleteStaffAccount: nonaktifkan juga gagal:", banError.message);
      redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent(GENERIC_ERROR)}`);
    }
    revalidatePath("/dashboard/admin/pengguna");
    void logActivity({ module: "admin", action: "update", entityType: "staf", entityLabel: staffName, detail: "dinonaktifkan" });
    redirect(
      `/dashboard/admin/pengguna?notice=${encodeURIComponent(
        "Akun tidak bisa dihapus permanen karena masih tercatat di riwayat (mis. checklist event atau link portal klien), jadi akun DINONAKTIFKAN: tidak bisa login lagi."
      )}`
    );
  }

  revalidatePath("/dashboard/admin/pengguna");
  void logActivity({ module: "admin", action: "delete", entityType: "staf", entityLabel: staffName });
  redirect(`/dashboard/admin/pengguna?notice=${encodeURIComponent("Akun berhasil dihapus.")}`);
}
