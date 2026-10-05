import { createAdminClientSafe } from "@/lib/supabase/admin";
import type { Division } from "@/lib/supabase/types";

export type OfficeRosterEntry = {
  id: string;
  fullName: string;
  username: string | null;
  division: Division;
  avatarUrl: string | null;
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
      .select("id, full_name, username, division, avatar_url")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("[virtual-office] getOfficeRoster gagal:", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      fullName: row.full_name as string,
      username: (row.username as string | null) ?? null,
      division: row.division as Division,
      avatarUrl: (row.avatar_url as string | null) ?? null,
    }));
  } catch (err) {
    console.error("[virtual-office] getOfficeRoster error:", err);
    return [];
  }
}
