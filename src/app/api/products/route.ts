import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductDivision } from "@/lib/products/types";

const VALID_DIVISIONS: ProductDivision[] = ["magnarent", "magnativ", "production", "umum"];
const MAX_PRODUCTS_PER_REQUEST = 500;

/**
 * API eksternal untuk Katalog Produk — dipakai automation DI LUAR aplikasi
 * (mis. workflow n8n yang baca file Excel lalu POST hasil parsingnya ke
 * sini) untuk push/pull data produk otomatis, tanpa perlu login manual.
 *
 * Autentikasi lewat header `x-api-key`, dibandingkan dengan env var
 * `PRODUCTS_API_KEY` (HANYA di server — set di Vercel Project Settings >
 * Environment Variables, dan di .env.local untuk dev lokal, JANGAN diberi
 * prefix NEXT_PUBLIC_). ini BUKAN Supabase Auth biasa (tidak ada sesi
 * cookie dari browser staf), jadi memakai `createAdminClient()` (service
 * role, melewati RLS sepenuhnya) — pengecekan akses di sini gantinya RLS
 * tabel `products` yang cuma mengizinkan sesi staf akses-penuh.
 */
function checkApiKey(req: NextRequest): boolean {
  const expected = process.env.PRODUCTS_API_KEY;
  if (!expected) {
    console.error("[api/products] PRODUCTS_API_KEY belum diset di environment variables.");
    return false;
  }
  const provided = req.headers.get("x-api-key");
  return provided === expected;
}

function unauthorized() {
  return NextResponse.json({ error: "API key tidak valid atau belum diset." }, { status: 401 });
}

/** GET /api/products — daftar semua produk (dipakai automation untuk "pull" data terbaru). */
export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) return unauthorized();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ products: data });
}

type IncomingProduct = {
  name: string;
  division?: string;
  category?: string;
  sku?: string;
  price?: number;
  unit?: string;
  stock?: number;
  supplier?: string;
  catatan?: string;
};

/**
 * POST /api/products — upsert massal (dipakai automation untuk "push" data
 * hasil olahan Excel). Body: { "products": [ { "name": "...", ... }, ... ] }.
 * Sama seperti `bulkImportProducts` di actions.ts: produk dengan `sku` yang
 * sudah ada di database DIPERBARUI, yang lain jadi baris baru.
 */
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) return unauthorized();

  let body: { products?: IncomingProduct[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body request bukan JSON yang valid." }, { status: 400 });
  }

  const products = Array.isArray(body.products) ? body.products : null;
  if (!products || products.length === 0) {
    return NextResponse.json(
      { error: 'Body harus berupa { "products": [ { "name": "...", ... }, ... ] }.' },
      { status: 400 }
    );
  }

  // Diproses satu per satu (cek SKU + upsert), jadi batch raksasa bisa
  // melewati batas waktu fungsi serverless di tengah jalan -- separuh data
  // masuk, separuh tidak. Automation diminta memecah kiriman.
  if (products.length > MAX_PRODUCTS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Maksimal ${MAX_PRODUCTS_PER_REQUEST} produk per request — pecah kiriman jadi beberapa batch.` },
      { status: 413 }
    );
  }

  const supabase = createAdminClient();
  const summary = { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] };

  for (const [index, item] of products.entries()) {
    const name = item.name?.trim();
    if (!name) {
      summary.skipped++;
      summary.errors.push(`Item ${index + 1}: "name" wajib diisi.`);
      continue;
    }

    const validDivision =
      item.division && VALID_DIVISIONS.includes(item.division as ProductDivision)
        ? (item.division as ProductDivision)
        : undefined;
    const division: ProductDivision = validDivision ?? "umum";
    const sku = item.sku?.trim() || null;
    // Baris baru: kolom yang tidak dikirim diisi default. `divisions` (array,
    // yang dibaca katalog) ikut diisi -- dulu hanya kolom lama `division`.
    const payload = {
      name,
      division,
      divisions: [division],
      category: item.category?.trim() || "",
      sku,
      price: Number.isFinite(item.price) ? Number(item.price) : 0,
      unit: item.unit?.trim() || "unit",
      stock: Number.isFinite(item.stock) ? Number(item.stock) : 0,
      supplier: item.supplier?.trim() || null,
      catatan: item.catatan?.trim() || null,
    };
    // Update SKU yang sudah ada: hanya kolom yang benar-benar dikirim --
    // dulu kiriman "harga saja" mereset stok jadi 0, kategori, satuan,
    // supplier & catatan ke default.
    const updatePayload: Record<string, unknown> = { name };
    if (validDivision) {
      updatePayload.division = validDivision;
      updatePayload.divisions = [validDivision];
    }
    if (item.category !== undefined) updatePayload.category = item.category?.trim() || "";
    if (Number.isFinite(item.price)) updatePayload.price = Number(item.price);
    if (item.unit !== undefined) updatePayload.unit = item.unit?.trim() || "unit";
    if (Number.isFinite(item.stock)) updatePayload.stock = Number(item.stock);
    if (item.supplier !== undefined) updatePayload.supplier = item.supplier?.trim() || null;
    if (item.catatan !== undefined) updatePayload.catatan = item.catatan?.trim() || null;

    if (sku) {
      const { data: existing } = await supabase.from("products").select("id").eq("sku", sku).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("products").update(updatePayload).eq("id", existing.id);
        if (error) {
          summary.skipped++;
          summary.errors.push(`Item ${index + 1} (${name}): ${error.message}`);
        } else {
          summary.updated++;
        }
        continue;
      }
    }

    const { error } = await supabase.from("products").insert(payload);
    if (error) {
      summary.skipped++;
      summary.errors.push(`Item ${index + 1} (${name}): ${error.message}`);
    } else {
      summary.inserted++;
    }
  }

  return NextResponse.json({ ok: true, summary });
}
