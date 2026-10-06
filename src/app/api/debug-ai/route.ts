import { NextResponse } from "next/server";

/**
 * Debug endpoint untuk cek konfigurasi AI di production.
 * HAPUS SETELAH DEBUGGING SELESAI!
 */
export async function GET() {
  const AI_API_URL = process.env.AI_API_URL || "(not set)";
  const AI_API_KEY = process.env.AI_API_KEY ? "***set***" : "(not set)";
  const AI_PROVIDER = process.env.AI_PROVIDER || "(not set)";

  const isLocalhost = AI_API_URL.includes("localhost") || AI_API_URL.includes("127.0.0.1");
  const isProduction = process.env.NODE_ENV === "production";

  return NextResponse.json({
    env: process.env.NODE_ENV,
    AI_API_URL: AI_API_URL.replace(/^(https?:\/\/[^\/]+).*/, "$1/..."), // hide full path
    AI_API_KEY,
    AI_PROVIDER,
    isLocalhost,
    isProduction,
    wouldBeAvailable: !isProduction || !isLocalhost,
  });
}
