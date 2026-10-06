"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";
import type { Division } from "@/lib/supabase/types";

const VALID_DIVISIONS: Division[] = ["magnarent", "magnative", "production", "all", "investor", "finance"];
const USERNAME_PATTERN = /^[a-z0-9._-]{3,20}$/;
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

export async function createStaffAccount(formData: FormData) {
  await requireFullAccess();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const recoveryEmail = String(formData.get("recoveryEmail") ?? "").trim();
  const division = String(formData.get("division") ?? "") as Division;
  const password = String(formData.get("password") ?? "");

  if (!fullName || !username || !recoveryEmail || !password) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent("Semua kolom wajib diisi.")}`);
  }
  if (!USERNAME_PATTERN.test(username)) {
    redirect(
      `/dashboard/admin/pengguna?error=${encodeURIComponent(
        "Username 3-20 karakter: huruf kecil, angka, titik, garis bawah, atau strip."
      )}`
    );
  }
  if (!VALID_DIVISIONS.includes(division)) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent("Divisi tidak valid.")}`);
  }
  if (password.length < 6) {
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent("Password minimal 6 karakter.")}`);
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: recoveryEmail,
    password,
    email_confirm: true,
    // full_name di user_metadata (boleh diubah sendiri nanti oleh pemilik
    // akun); username & division di app_metadata (cuma admin yang bisa
    // ubah — lihat catatan di middleware.ts & migration 0003).
    user_metadata: { full_name: fullName },
    app_metadata: { username, division },
  });

  if (error) {
    console.error("[admin] createStaffAccount gagal:", error.message);
    const message = error.message.toLowerCase().includes("already been registered")
      ? "Email pemulihan ini sudah dipakai akun lain."
      : GENERIC_ERROR;
    redirect(`/dashboard/admin/pengguna?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/dashboard/admin/pengguna");
  void logActivity({
    module: "admin",
    action: "create",
    entityType: "staf",
    entityLabel: fullName,
    detail: `username: ${username}, divisi: ${division}`,
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
