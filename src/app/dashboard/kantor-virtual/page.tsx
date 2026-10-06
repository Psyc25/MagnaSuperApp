import { redirect } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getOfficeRoster } from "@/lib/virtual-office/data";
import { defaultLook } from "@/lib/virtual-office/avatar-look";
import { VirtualOfficeClient } from "@/components/virtual-office/VirtualOfficeClient";

/**
 * Halaman "Kantor Virtual" (Tahap H, permintaan Owner) -- peta kantor 2D
 * ala Gather.town, SENGAJA terbuka untuk SEMUA divisi TANPA kecuali
 * (termasuk investor & finance, beda dari Chat/Realisasi Event/Papan
 * Tracking yang menutup investor) -- ini murni kolaborasi & suasana
 * "ngantor bareng", bukan modul data operasional, jadi tidak ada alasan
 * membatasi siapa yang boleh lihat siapa online.
 */
export default async function KantorVirtualPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const roster = await getOfficeRoster();
  const me = roster.find((r) => r.id === profile.id);

  return (
    <div className="p-4 md:p-8">
      <div className="animate-fade-up flex items-start gap-4">
        <div className="relative shrink-0">
          <span
            className="absolute -inset-1.5 animate-pulse rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 opacity-30 blur-lg"
            aria-hidden
          />
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
            <Gamepad2 className="h-6 w-6" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-500 dark:text-indigo-400">
            Kantor Virtual
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Rumah Magna
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Rekan yang sedang membuka aplikasi terlihat di rumah; yang tidak, sedang tidur di Kamar Staff. Dekati rekan atau NPC untuk ngobrol.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <VirtualOfficeClient
          currentUser={{
            id: profile.id,
            fullName: profile.full_name,
            username: profile.username,
            division: profile.division,
            look: me?.look ?? defaultLook(profile.id),
          }}
          roster={roster}
        />
      </div>
    </div>
  );
}
