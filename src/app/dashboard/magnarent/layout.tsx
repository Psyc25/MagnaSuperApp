import type { ReactNode } from "react";
import { SubNav } from "@/components/layout/SubNav";
import { MODULES } from "@/lib/navigation";
import { MagnarentDataProvider } from "@/components/magnarent/MagnarentDataProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { createClient } from "@/lib/supabase/server";
import { rowToBooking, rowToInventory, type BookingRow, type InventoryRow } from "@/lib/magnarent/mappers";
import { rowToClient, type ClientRow } from "@/lib/magnative/mappers";
import { fetchAllPages, PAGE_SIZE } from "@/lib/shared/paginate";

const mod = MODULES.find((m) => m.id === "magnarent")!;

/**
 * Layout modul Magnarent — Server Component ini yang mengambil data
 * inventaris & booking dari Supabase (bukan lagi mock data statis di
 * memori) dan meneruskannya sebagai props ke `MagnarentDataProvider`.
 * Karena Next.js tidak me-remount layout saat berpindah antar sub-rute
 * (Ringkasan/Inventaris/Kalender/Booking), data ini tetap tersedia selama
 * pengguna berada di dalam modul; begitu ada mutasi (lewat Server Action di
 * `src/lib/magnarent/actions.ts`), `revalidatePath` membuat layout ini
 * dijalankan ulang otomatis dan provider menerima data terbaru.
 *
 * RLS (migrasi 0004) sudah membatasi baris yang kebaca cuma milik divisi
 * Magnarent/akses penuh — middleware juga sudah menolak staf divisi lain
 * sebelum sampai ke sini, jadi query di bawah tidak perlu filter divisi lagi.
 */
export default async function MagnarentLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const [inventoryResult, bookingsResult, clientsResult] = await Promise.all([
    supabase
      .from("magnarent_inventory")
      .select("*")
      .order("created_at", { ascending: true })
      .returns<InventoryRow[]>(),
    // Semua booking diambil per halaman (PostgREST memotong di 1000 baris --
    // dulu booking TERBARU yang hilang dari halaman Booking, kalender, dan
    // pratinjau ketersediaan begitu datanya lewat 1000).
    fetchAllPages<BookingRow>((afterId) =>
      supabase
        .from("magnarent_bookings")
        .select("*")
        .gt("id", afterId)
        .order("id")
        .limit(PAGE_SIZE)
        .returns<BookingRow[]>()
    ),
    // Daftar klien Magnative — dibaca di sini cuma untuk pilihan "Klien
    // Terdaftar" di form booking (migrasi 0010 sudah mengizinkan siapa pun
    // yang login membaca tabel ini). Kepemilikan datanya tetap di Magnative.
    supabase.from("magnative_clients").select("*").order("name", { ascending: true }).returns<ClientRow[]>(),
  ]);

  if (inventoryResult.error) {
    console.error("[magnarent] Gagal memuat inventaris:", inventoryResult.error.message);
  }
  if (bookingsResult.error) {
    console.error("[magnarent] Gagal memuat booking:", bookingsResult.error.message);
  }
  if (clientsResult.error) {
    console.error("[magnarent] Gagal memuat daftar klien:", clientsResult.error.message);
  }

  const inventory = (inventoryResult.data ?? []).map(rowToInventory);
  const bookings = bookingsResult.data
    .map(rowToBooking)
    .sort((a, b) => a.tanggalMulai.localeCompare(b.tanggalMulai));
  const clients = (clientsResult.data ?? []).map(rowToClient);

  return (
    <ToastProvider>
      <MagnarentDataProvider inventory={inventory} bookings={bookings} clients={clients}>
        <div>
          <SubNav items={mod.subnav} gradient={mod.gradient} />
          <div className="p-4 md:p-8">{children}</div>
        </div>
      </MagnarentDataProvider>
    </ToastProvider>
  );
}
