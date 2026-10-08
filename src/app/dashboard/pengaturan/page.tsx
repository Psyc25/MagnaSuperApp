import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { getCurrentProfile } from "@/lib/supabase/server";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm";
import { AppearanceSettingsForm } from "@/components/settings/AppearanceSettingsForm";
import { PushToggleSettingsForm } from "@/components/settings/PushToggleSettingsForm";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { t } from "@/lib/i18n/dictionary";

/**
 * Tahap 27 — halaman Pengaturan akun. Terbuka untuk SEMUA divisi (beda dari
 * halaman /dashboard/admin/** yang cuma akses penuh) karena ini murni
 * pengaturan milik akun masing-masing, bukan data operasional — pola
 * pengecekannya jadi cuma "sudah login atau belum" (dijamin middleware),
 * tanpa pengecekan division tambahan seperti halaman admin.
 */
export default async function PengaturanPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const locale = profile.language_preference;

  return (
    <div className="p-4 md:p-8">
      <div className="animate-fade-up flex items-start gap-4">
        <div className="relative shrink-0">
          <span
            className="absolute -inset-1.5 animate-pulse rounded-2xl bg-gradient-to-br from-zinc-500 to-zinc-700 opacity-30 blur-lg"
            aria-hidden
          />
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-zinc-500 to-zinc-700 text-white shadow-sm">
            <Settings className="h-6 w-6" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            {t(locale, "Akun")}
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            {t(locale, "Pengaturan")}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            {t(locale, "Foto profil, nama, tampilan, dan bahasa — cuma berlaku buat akunmu sendiri.")}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <ToastProvider>
          <ProfileSettingsForm profile={profile} />
        </ToastProvider>
        <ToastProvider>
          <AppearanceSettingsForm
            initialTheme={profile.theme_preference}
            initialLanguage={profile.language_preference}
          />
        </ToastProvider>
        <ToastProvider>
          <ChangePasswordForm />
        </ToastProvider>
        <PushToggleSettingsForm />
      </div>
    </div>
  );
}
