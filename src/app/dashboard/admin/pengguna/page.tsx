import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, Users } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { CreateStaffForm } from "@/components/admin/CreateStaffForm";
import { StaffTable } from "@/components/admin/StaffTable";

/**
 * Halaman "Kelola Pengguna" — HANYA untuk akun akses penuh (division
 * "all": Owner/Finance/Investor). Ini pengganti pendaftaran mandiri lewat
 * /register: sekarang akun staf baru dibuat dari sini, langsung aktif
 * (tanpa konfirmasi email) dengan email+password yang admin tentukan.
 *
 * Penjagaan dobel dengan sengaja: middleware.ts sudah memblokir rute ini
 * untuk division selain "all", dan requireFullAccess() di actions.ts
 * mengecek ulang sebelum tiap mutasi — halaman ini menambah lapis ketiga
 * supaya kalau ada yang somehow lolos, tidak ada data yang bocor ke sini.
 */
export default async function KelolaPenggunaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "all") {
    redirect("/dashboard");
  }

  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, username, email, division, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="p-4 md:p-8">
      <div className="animate-fade-up flex items-start gap-4">
        <div className="relative shrink-0">
          <span
            className="absolute -inset-1.5 animate-pulse rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 opacity-30 blur-lg"
            aria-hidden
          />
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-sm">
            <Users className="h-6 w-6" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-500 dark:text-indigo-400">
            Admin
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Kelola Pengguna
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Tambahkan anggota tim di sini — mereka tinggal login pakai email &amp; password yang Anda buatkan.
          </p>
        </div>
      </div>

      {notice && (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[22rem_1fr]">
        <CreateStaffForm />
        <StaffTable staff={staff ?? []} currentUserId={profile.id} />
      </div>
    </div>
  );
}
