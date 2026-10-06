"use client";

/**
 * Kompresi & validasi file di BROWSER sebelum dikirim ke Server Action.
 *
 * Kenapa perlu: Server Action Next.js membatasi body request (default 1MB,
 * di sini dinaikkan ke 4MB lewat `serverActions.bodySizeLimit` di
 * next.config.ts -- Vercel sendiri memotong body di 4,5MB). Foto kamera HP
 * hampir selalu 2-15MB, jadi tanpa kompresi unggahan foto gagal dengan error
 * yang tidak jelas. Foto diperkecil dulu ke dimensi wajar lalu diekspor
 * ulang sebagai JPEG; hasilnya biasanya < 1MB. File non-gambar (PDF, dsb)
 * dikirim apa adanya dan dicek ukurannya supaya user dapat pesan yang jelas.
 *
 * Tahap 35 (foto profil) memakai helper yang sama dengan dimensi 512px.
 */

/** Batas total body per unggahan, menyisakan ruang untuk overhead multipart. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 - 64 * 1024;
export const MAX_UPLOAD_LABEL = "4MB";

const DEFAULT_MAX_DIMENSION = 2048;
const DEFAULT_JPEG_QUALITY = 0.82;
/** Foto di bawah ukuran ini tidak perlu dikompres. */
const SKIP_BELOW_BYTES = 700 * 1024;
/** Format yang aman digambar ulang ke canvas (GIF/SVG sengaja dilewati). */
const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function compressImageFile(
  file: File,
  { maxDimension = DEFAULT_MAX_DIMENSION, quality = DEFAULT_JPEG_QUALITY, skipBelowBytes = SKIP_BELOW_BYTES } = {}
): Promise<File> {
  // Bukan gambar raster yang bisa digambar ke canvas -- atau browser tidak
  // mendukung createImageBitmap untuk formatnya (mis. HEIC di Chrome) --
  // biarkan file asli lewat, validasi ukuran yang jadi jaring pengaman.
  if (!COMPRESSIBLE_TYPES.has(file.type) || file.size < skipBelowBytes) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const targetWidth = Math.round(bitmap.width * scale);
    const targetHeight = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // Latar putih dulu -- PNG transparan tidak jadi hitam saat diekspor
    // sebagai JPEG (JPEG tidak punya kanal alpha).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    // Hasil kompresi (jarang) lebih besar dari aslinya -> pakai yang asli.
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    // Kompresi gagal karena alasan apa pun -- jangan memblokir unggahan.
    return file;
  }
}

export async function compressAvatarImage(file: File): Promise<File> {
  return compressImageFile(file, { maxDimension: 512, quality: 0.85, skipBelowBytes: 0 });
}

export type PreparedUpload = { ok: true; files: File[] } | { ok: false; error: string };

/** Jalankan `fn` untuk tiap item dengan batas konkurensi, bukan semua
 * sekaligus -- dipakai `prepareUploadFiles` di bawah supaya upload banyak
 * foto (20-30 foto kamera HP) tidak nge-decode semua gambar resolusi penuh
 * BERSAMAAN (yang bisa menghabiskan memori/CPU browser sampai terasa
 * "rendering terus"/macet, terutama di laptop/HP yang kurang kuat).
 * Default 3 paralel: tetap jauh lebih cepat dari murni satu-satu, tapi
 * beban kerja browser tetap terkendali. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Kompres semua foto (berurutan per batch kecil, lihat `mapWithConcurrency`)
 * lalu pastikan TOTAL ukurannya muat dalam satu Server Action. Pakai ini
 * sebelum memasukkan file ke FormData. `compress: false` untuk file hasil
 * karya (aset desain, file pipeline, dokumen) yang tidak boleh diubah
 * kualitasnya -- hanya dicek ukurannya. `onProgress` opsional untuk
 * menampilkan "Mengompres n/total..." saat foto-nya banyak.
 */
export async function prepareUploadFiles(
  files: File[],
  { compress = true, onProgress }: { compress?: boolean; onProgress?: (done: number, total: number) => void } = {}
): Promise<PreparedUpload> {
  let done = 0;
  const prepared = compress
    ? await mapWithConcurrency(files, 3, async (f) => {
        const result = await compressImageFile(f);
        done++;
        onProgress?.(done, files.length);
        return result;
      })
    : files;
  const total = prepared.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) {
    const tooBig = prepared.find((f) => f.size > MAX_UPLOAD_BYTES);
    return {
      ok: false,
      error: tooBig
        ? `File "${tooBig.name}" terlalu besar. Maksimal ${MAX_UPLOAD_LABEL} per unggahan.`
        : `Total ukuran file maksimal ${MAX_UPLOAD_LABEL} per unggahan. Unggah sebagian dulu, lalu sisanya.`,
    };
  }
  return { ok: true, files: prepared };
}
