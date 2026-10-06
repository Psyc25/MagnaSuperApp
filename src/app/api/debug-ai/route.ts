import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { resolveAIConfig } from "@/lib/ai/config";

/**
 * Cek konfigurasi AI di production (hasil resolveAIConfig, sama persis dengan
 * yang dipakai src/lib/ai/actions.ts). API key tidak pernah dikirim -- hanya
 * terisi/tidak. Khusus akun akses penuh (Owner); hapus kalau sudah tidak perlu.
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "all") {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 403 });
  }

  const config = resolveAIConfig(process.env);
  return NextResponse.json({
    env: process.env.NODE_ENV,
    provider: config.provider,
    baseUrlHost: (() => {
      try {
        return new URL(config.baseUrl).host;
      } catch {
        return "(tidak valid)";
      }
    })(),
    model: config.model ?? "(model bawaan agen)",
    apiKeySet: Boolean(config.apiKey),
    available: config.available,
    unavailableReason: config.unavailableReason ?? null,
  });
}
