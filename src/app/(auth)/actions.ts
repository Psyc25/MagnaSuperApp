"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeRedirectTarget } from "@/lib/shared/safe-redirect";


/**
 * Login pakai USERNAME, bukan email — email asli tiap staf cuma dipakai
 * sebagai alamat pemulihan password (lihat `requestPasswordReset`), bukan
 * untuk masuk. Karena Supabase Auth secara internal tetap berbasis email,
 * kita cari dulu email yang berpasangan dengan username itu lewat service
 * role (supaya tidak perlu RLS publik yang membocorkan email ke siapa pun
 * yang belum login), baru panggil signInWithPassword dengan email tersebut.
 */
export async function signIn(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectTarget(formData.get("redirectTo"));

  if (!username || !password) {
    redirect(`/login?error=${encodeURIComponent("Username dan password wajib diisi.")}`);
  }

  const admin = createAdminClient();
  const { data: profile, error: lookupError } = await admin
    .from("profiles")
    .select("email")
    .eq("username", username)
    .maybeSingle();

  // Dicatat HANYA di terminal server, tidak pernah ditampilkan ke browser —
  // supaya kita bisa lihat persis di titik mana login gagal (username tidak
  // ketemu vs password salah) tanpa membocorkan info itu ke orang yang
  // sedang mencoba login.
  if (lookupError) {
    console.error("[signIn] Query profiles gagal:", lookupError.message);
  }

  if (!profile?.email) {
    console.log(`[signIn] Username "${username}" tidak ditemukan di tabel profiles.`);
    redirect(`/login?error=${encodeURIComponent("Username atau password salah.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: profile.email, password });

  if (error) {
    console.error(`[signIn] signInWithPassword gagal untuk email terkait username "${username}":`, error.message);
    redirect(`/login?error=${encodeURIComponent("Username atau password salah.")}`);
  }

  console.log(`[signIn] Login berhasil untuk username "${username}".`);
  // `welcome=1` memicu animasi popup selamat datang SEKALI di dashboard
  // (lihat WelcomeSplash.tsx) — dibaca lalu langsung dibuang dari URL di
  // sana, jadi tidak terulang kalau halaman di-refresh/dibuka lagi lewat
  // tombol back.
  const separator = redirectTo.includes("?") ? "&" : "?";
  redirect(`${redirectTo}${separator}welcome=1`);
}

/**
 * "Lupa password" — diminta lewat EMAIL pemulihan langsung (bukan
 * username), karena bagi pengguna ini lebih masuk akal: mereka mengetik
 * alamat Gmail/email pribadinya sendiri, bukan menebak-nebak username app
 * yang mungkin lupa. Supabase sendiri sudah tidak membocorkan apakah email
 * itu terdaftar atau tidak (pesan sukses selalu sama), jadi kita tidak
 * perlu lagi lapisan "cari email dari username" seperti sebelumnya — cukup
 * teruskan langsung ke `resetPasswordForEmail`.
 *
 * `redirectTo` mengarah LANGSUNG ke /reset-password (BUKAN lewat
 * /auth/callback seperti sebelumnya) — itu bug yang baru diperbaiki:
 * /auth/callback cuma menangani `?code=` (alur OAuth Google) lalu
 * me-redirect lagi ke `next`, dan redirect server semacam itu MEMBUANG hash
 * fragment URL (`#access_token=...`) yang justru dipakai Supabase untuk
 * tautan reset password gaya lama — jadi token pemulihannya hilang sebelum
 * sempat diproses. Sekarang /reset-password sendiri (lewat
 * ResetPasswordClient.tsx) yang menangani SEMUA kemungkinan bentuk tautan
 * Supabase: hash fragment, `?code=`, maupun `?token_hash=&type=recovery`.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const genericNotice = "Kalau email itu terdaftar, tautan reset password sudah dikirim ke sana.";

  if (email) {
    try {
      const origin = (await headers()).get("origin") ?? "";
      const supabase = await createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/reset-password`,
      });
      // Dicatat HANYA di terminal server (bukan ditampilkan ke browser) —
      // supaya kita bisa lacak kalau email gagal terkirim (redirect URL
      // belum di-allowlist, rate limit Supabase, dsb) tanpa membocorkan
      // detailnya ke orang yang mengisi form ini.
      if (error) {
        console.error("[requestPasswordReset] resetPasswordForEmail gagal:", error.message);
      } else {
        console.log(`[requestPasswordReset] Permintaan reset diproses untuk ${email}.`);
      }
    } catch (err) {
      console.error("[requestPasswordReset] Error tak terduga:", err);
      // Diamkan dengan sengaja ke pengguna — tetap tampilkan pesan generik
      // di bawah, supaya tidak membocorkan info lewat pesan error yang
      // berbeda-beda (mencegah email enumeration).
    }
  }

  redirect(`/lupa-password?notice=${encodeURIComponent(genericNotice)}`);
}

/**
 * Set password baru — dipanggil dari form di ResetPasswordClient.tsx
 * SETELAH komponen itu berhasil menukar tautan reset dari email jadi sesi
 * resmi (lihat komentar panjang di ResetPasswordClient.tsx soal 3 kemungkinan
 * bentuk tautan yang ditangani), jadi di titik ini pengguna sudah punya sesi
 * yang sah untuk mengganti password miliknya sendiri.
 */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 6) {
    redirect(`/reset-password?error=${encodeURIComponent("Password minimal 6 karakter.")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/reset-password?error=${encodeURIComponent("Konfirmasi password tidak cocok.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?error=${encodeURIComponent("Tautan reset password sudah kedaluwarsa, minta ulang lewat 'Lupa password?'.")}`
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[updatePassword] auth.updateUser gagal:", error.message);
    // Satu kasus yang pesannya memang berguna ditampilkan apa adanya (mirip
    // pola "already been registered" di admin/actions.ts::createStaffAccount)
    // — selain itu, pesan error Supabase mentah tidak pernah ditampilkan.
    const message = error.message.toLowerCase().includes("different from the old password")
      ? "Password baru harus berbeda dari password lama."
      : "Terjadi kesalahan, coba lagi.";
    redirect(`/reset-password?error=${encodeURIComponent(message)}`);
  }

  redirect(`/login?notice=${encodeURIComponent("Password berhasil diubah — silakan masuk.")}`);
}
