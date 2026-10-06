import type { createClient } from "@/lib/supabase/server";
import type { ProductDivision } from "./types";
import { fetchAllPages, PAGE_SIZE } from "@/lib/shared/paginate";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Kode SKU ringkas otomatis (Tahap 29c) — sebelumnya field SKU produk hasil
 * impor otomatis diisi mentah-mentah dari ID sumber luar (mis. `retailer_id`
 * WhatsApp Catalog seperti "prod_01K4QVKVQXRRPXXBGPS7RFRYPP", tidak mudah
 * dibaca tim). Sekarang SKU dibuat sendiri oleh aplikasi, format ringkas
 * "PREFIX-DIVISI + nomor urut per divisi" (mis. "MR-001", "UM-014") — dipakai
 * konsisten baik saat tambah/edit produk manual (kalau field SKU dikosongkan)
 * maupun hasil impor WhatsApp Catalog/website/Excel. ID asli dari sumber luar
 * tetap tersimpan lengkap di `external_ref` (dipakai buat sinkron ulang),
 * jadi tidak ada data yang hilang — cuma tidak lagi dipasang sebagai SKU.
 */
const DIVISION_SKU_PREFIX: Record<ProductDivision, string> = {
  magnarent: "MR",
  magnativ: "MV",
  production: "PR",
  umum: "UM",
};

export async function generateSku(supabase: SupabaseClient, division: ProductDivision): Promise<string> {
  const prefix = DIVISION_SKU_PREFIX[division] ?? "UM";
  // Semua SKU berawalan ini, per halaman -- dulu terpotong di 1000 baris
  // sehingga nomor "berikutnya" sudah dipakai dan setiap tambah/impor
  // produk gagal "SKU sudah dipakai" begitu produk lewat ~1000.
  const { data } = await fetchAllPages<{ id: string; sku: string | null }>((afterId) =>
    supabase.from("products").select("id, sku").like("sku", `${prefix}-%`).gt("id", afterId).order("id").limit(PAGE_SIZE)
  );

  let max = 0;
  for (const row of data) {
    const match = /^([A-Z]+)-(\d+)$/.exec(row.sku ?? "");
    if (match && match[1] === prefix) {
      const n = parseInt(match[2], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/** True kalau error di atas adalah bentrok SKU (unique constraint
 * `products_sku_key`) — dipakai buat tahu kapan aman dicoba lagi dengan
 * nomor urut berikutnya (kemungkinan kecil dua orang/proses generate nomor
 * yang sama persis di saat yang nyaris bersamaan), vs. error lain yang harus
 * langsung dilaporkan apa adanya. */
export function isSkuConflict(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23505" && (error.message ?? "").toLowerCase().includes("sku");
}
