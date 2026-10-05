import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getImportSources, getProductsWithPhotos } from "@/lib/products/data";
import { ImportSourceManager } from "@/components/products/ImportSourceManager";
import { ProductManager } from "@/components/products/ProductManager";
import { ToastProvider } from "@/components/ui/ToastProvider";

/**
 * Katalog Produk terpusat (migrasi 0013, galeri multi-foto & impor
 * eksternal di migrasi 0029/Tahap 29). Sempat TULIS (tambah/edit/hapus/
 * impor) dibatasi cuma division "all" — tapi permintaan Owner berubah
 * (Tahap 29b, migrasi 0030): "semua divisi bisa akses edit". Jadi RLS-nya
 * sudah dilebarkan ke SEMUA staf login, dan halaman EDIT yang sama
 * (ProductManager + ImportSourceManager) juga didaftarkan di
 * `/dashboard/katalog-produk` (di luar prefix admin) supaya staf divisi
 * lain bisa buka dari subnav modul masing-masing tanpa perlu masuk lewat
 * menu Admin. Halaman DI SINI (`/dashboard/admin/produk`) dipertahankan
 * apa adanya sebagai entry point Owner/Finance dari menu Admin — gerbang
 * `division === "all"` di bawah ini cuma soal DI MANA tautannya muncul,
 * bukan lagi satu-satunya jalan masuk untuk bisa edit.
 */
export default async function ProdukPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "all") {
    redirect("/dashboard");
  }

  const [products, importSources] = await Promise.all([getProductsWithPhotos(), getImportSources()]);

  return (
    <div className="p-4 md:p-8">
      <div className="animate-fade-up flex items-start gap-4">
        <div className="relative shrink-0">
          <span
            className="absolute -inset-1.5 animate-pulse rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 opacity-30 blur-lg"
            aria-hidden
          />
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white shadow-sm">
            <Boxes className="h-6 w-6" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-500 dark:text-teal-400">
            Admin
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Katalog Produk
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Data produk terpusat — Magnarent, Magnativ, dan Production dalam satu tempat, bisa diisi manual, import
            Excel, atau otomatis lewat API/WhatsApp Catalog/website. Setiap produk bisa punya beberapa foto (klik ikon
            mata untuk lihat slider-nya) — semua staf yang login juga bisa tambah/edit di sini lewat menu &ldquo;Katalog
            Produk&rdquo; masing-masing divisi.
          </p>
        </div>
      </div>

      <div className="mt-6">
        {/* ProductManager pakai useToast() untuk feedback tambah/edit/hapus/
            import — beda dari halaman admin lain (Klien/Piutang/dst) yang
            belum butuh toast, jadi provider-nya dipasang di sini saja,
            bukan lewat layout.tsx bersama di /dashboard/admin. */}
        <ToastProvider>
          <div className="space-y-5">
            <ImportSourceManager sources={importSources} />
            <ProductManager products={products} />
          </div>
        </ToastProvider>
      </div>
    </div>
  );
}
