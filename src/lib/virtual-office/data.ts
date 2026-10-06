import { createAdminClientSafe } from "@/lib/supabase/admin";
import type { Division } from "@/lib/supabase/types";
import { defaultLook, sanitizeLook, type AvatarLook } from "./avatar-look";

export type OfficeRosterEntry = {
  id: string;
  fullName: string;
  username: string | null;
  division: Division;
  look: AvatarLook;
};

/**
 * Daftar SEMUA staf (lintas divisi, termasuk investor & finance -- Owner:
 * "semua staf yang login" boleh masuk Kantor Virtual) buat dipetakan jadi
 * avatar. RLS `profiles` normal TIDAK membuka lintas-divisi seluas ini
 * (cuma dibuka sebagian utk keperluan PIC di Papan Tracking, migrasi
 * `event_tracking_board_pic_visibility`) -- jadi dipakai `createAdminClient`
 * (service role) di sini, sama seperti pola `searchTaggableUsers` di
 * lib/chat/actions.ts. Aman: yang diekspos cuma nama/username/divisi/foto
 * profil, bukan data sensitif, dan cuma dipanggil dari Server Component
 * (tidak pernah sampai ke browser).
 */
export async function getOfficeRoster(): Promise<OfficeRosterEntry[]> {
  const admin = createAdminClientSafe();

  // Graceful fallback jika admin client tidak tersedia
  if (!admin) {
    console.warn("[virtual-office] Admin client tidak tersedia, roster kosong");
    return [];
  }

  try {
    const { data, error } = await admin
      .from("profiles")
      // Hanya kolom yang dipakai UI -- data ini dikirim ke SEMUA browser yang
      // membuka Kantor Virtual lewat service role (melewati RLS profiles).
      // avatar_url tidak dipakai; username investor tidak dikirim (chat
      // memang tidak menerima mention investor).
      .select("id, full_name, username, division")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("[virtual-office] getOfficeRoster gagal:", error.message);
      return [];
    }

    const looks = await getAvatarLooks(admin);

    return (data ?? []).map((row) => ({
      id: row.id as string,
      fullName: row.full_name as string,
      username: row.division === "investor" ? null : ((row.username as string | null) ?? null),
      division: row.division as Division,
      look: looks.get(row.id as string) ?? defaultLook(row.id as string),
    }));
  } catch (err) {
    console.error("[virtual-office] getOfficeRoster error:", err);
    return [];
  }
}

/** Tampilan karakter tiap akun (user_metadata.avatar_look, diisi lewat
 * saveAvatarLook). Gagal membaca -> semua orang memakai tampilan bawaan. */
async function getAvatarLooks(admin: NonNullable<ReturnType<typeof createAdminClientSafe>>): Promise<Map<string, AvatarLook>> {
  const looks = new Map<string, AvatarLook>();
  try {
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        console.error("[virtual-office] listUsers gagal:", error.message);
        break;
      }
      for (const user of data.users) {
        const raw = (user.user_metadata as { avatar_look?: unknown } | null)?.avatar_look;
        if (raw) looks.set(user.id, sanitizeLook(raw, user.id));
      }
      if (data.users.length < 200) break;
    }
  } catch (err) {
    console.error("[virtual-office] getAvatarLooks error:", err);
  }
  return looks;
}
