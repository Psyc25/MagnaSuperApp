"use server";

import { redirect } from "next/navigation";
import { createClient } from "./server";

/**
 * Sign out — dipakai sebagai Server Action dari tombol "Keluar" di Topbar.
 * Diletakkan terpisah dari src/app/(auth)/actions.ts (sign in/sign up)
 * supaya bisa diimpor dari komponen dashboard tanpa ikut menyeret rute
 * grup (auth).
 */
export async function signOut(formData?: FormData) {
  const supabase = await createClient();
  // Lepaskan langganan Web Push perangkat ini dari akun yang keluar -- dulu
  // perangkat bersama tetap menerima notifikasi akun sebelumnya (nama klien,
  // nominal invoice, dst) setelah logout. Dihapus selagi sesi masih ada
  // (RLS push_subscriptions: hanya milik sendiri).
  const endpoint = formData?.get("pushEndpoint");
  if (typeof endpoint === "string" && endpoint) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
      if (error) console.error("[auth] signOut: gagal hapus langganan push:", error.message);
    }
  }
  await supabase.auth.signOut();
  redirect("/login");
}
