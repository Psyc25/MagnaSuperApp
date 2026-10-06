import type { NextConfig } from "next";

/**
 * `images.remotePatterns` perlu didaftarkan eksplisit supaya `next/image`
 * mau me-render foto portofolio Magnativ (migrasi 0012) yang URL-nya dari
 * Supabase Storage, bukan dari /public — tanpa ini Next.js menolak
 * (400 Bad Request) memuat gambar dari domain yang tidak dikenal.
 */
const nextConfig: NextConfig = {
  // Hasil "Konten" di pencarian global (fungsi DB global_search, migrasi
  // 0036) menautkan ke /dashboard/magnative/konten yang tidak pernah ada.
  async redirects() {
    return [{ source: "/dashboard/magnative/konten", destination: "/dashboard/magnative/sosial-media", permanent: false }];
  },
  experimental: {
    serverActions: {
      // Default 1MB membuat hampir semua foto kamera HP gagal diunggah lewat
      // Server Action. Vercel memotong body request di 4,5MB, jadi 4MB adalah
      // batas efektif; foto dikompres dulu di browser (src/lib/shared/image.ts).
      bodySizeLimit: "4mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "xbynsiafccsfgeayakma.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
