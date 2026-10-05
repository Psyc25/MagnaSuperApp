import type * as XLSXModule from "xlsx";

/**
 * Import dinamis SheetJS (`xlsx`) -- dimuat cuma saat user benar-benar
 * ekspor/impor Excel, supaya tidak ikut membebani bundle awal halaman.
 *
 * `xlsx` paket CommonJS: tergantung bundler/versi TypeScript, hasil dynamic
 * import-nya kadang berbentuk `{ default: modul }`, kadang modul itu sendiri
 * (build Vercel pernah gagal type-check karena ini). Fallback `.default ??
 * modul` menangani keduanya di RUNTIME, sementara tipe hasilnya tetap
 * `typeof XLSX` yang lengkap -- dulu ditulis ulang di 4 file dengan `any`.
 */
export async function loadXlsx(): Promise<typeof XLSXModule> {
  const mod = (await import("xlsx")) as typeof XLSXModule & { default?: typeof XLSXModule };
  return mod.default ?? mod;
}
