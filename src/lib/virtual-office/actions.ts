"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeLook, type AvatarLook } from "./avatar-look";

export type SaveLookResult = { ok: true; look: AvatarLook } | { ok: false; error: string };

/**
 * Simpan tampilan karakter Kantor Virtual milik pengguna yang sedang login
 * ke user_metadata-nya sendiri (lewat sesi pengguna, bukan service role --
 * Supabase hanya mengizinkan mengubah user_metadata akun sendiri).
 */
export async function saveAvatarLook(input: unknown): Promise<SaveLookResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi sudah berakhir, silakan masuk ulang." };

  const look = sanitizeLook(input, user.id);
  const { error } = await supabase.auth.updateUser({ data: { avatar_look: look } });
  if (error) {
    console.error("[virtual-office] saveAvatarLook gagal:", error.message);
    return { ok: false, error: "Karakter gagal disimpan, coba lagi." };
  }

  revalidatePath("/dashboard/kantor-virtual");
  return { ok: true, look };
}
