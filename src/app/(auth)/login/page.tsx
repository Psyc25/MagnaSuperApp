import Link from "next/link";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { signIn } from "../actions";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { LoginSubmitButton } from "./LoginSubmitButton";
import { cn } from "@/lib/cn";
import { GLASS_INPUT } from "@/lib/glass";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; redirectTo?: string }>;
}) {
  const { error, notice, redirectTo } = await searchParams;

  return (
    <div>
      <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Masuk</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Masuk dengan email akun tim Magna Technology Anda.
      </p>

      {notice && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form action={signIn} className="mt-6 space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo ?? "/dashboard"} />

        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="login-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="nama@email.com"
              className={cn(
                "w-full rounded-xl border py-2.5 pl-10 pr-3.5 text-sm text-zinc-900 outline-none ring-[#D4AF37]/40 placeholder:text-zinc-400 focus:ring-2 dark:text-white",
                GLASS_INPUT
              )}
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Password
          </label>
          <PasswordInput id="login-password" name="password" required autoComplete="current-password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" />
        </div>

        <div className="flex justify-end">
          <Link
            href="/lupa-password"
            className="text-xs font-semibold text-[#B8860B] hover:underline dark:text-[#D4AF37]"
          >
            Lupa password?
          </Link>
        </div>

        <LoginSubmitButton />
      </form>

      <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
        Belum punya akun? Hubungi admin Magna Technology untuk dibuatkan akun.
      </p>
    </div>
  );
}
