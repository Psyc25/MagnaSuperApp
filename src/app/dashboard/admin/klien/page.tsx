import { redirect } from "next/navigation";
import { Users2 } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { rowToClient, rowToProject, type ClientRow, type ProjectRow } from "@/lib/magnative/mappers";
import { rowToBooking, rowToInventory, type BookingRow, type InventoryRow } from "@/lib/magnarent/mappers";
import { rowToBoothProject, type BoothProjectRow } from "@/lib/production/mappers";
import { calculateBookingTotal } from "@/lib/magnarent/pricing";
import { ClientDirectoryTable, type ClientSummary } from "@/components/admin/ClientDirectoryTable";

/**
 * "Direktori Klien Terpadu" — HANYA akses penuh, sama seperti Laporan.
 * Ini pemakaian pertama dari `client_id` yang ditambahkan migrasi 0010:
 * menggabungkan booking Magnarent + proyek Magnative + proyek booth
 * Production PER KLIEN, supaya kelihatan riwayat & nilai satu klien di
 * ketiga lini bisnis sekaligus — bukan tiga catatan terpisah yang cuma
 * kebetulan sama nama.
 *
 * Aman dibaca lintas modul di sini karena `can_access_division()` (migrasi
 * 0004) sudah meloloskan division "all" untuk RLS di SEMUA tabel modul,
 * jadi tidak perlu perubahan RLS tambahan di luar migrasi 0010 (yang cuma
 * melonggarkan SELECT `magnative_clients`).
 *
 * Booking/proyek yang BELUM ditautkan ke klien terdaftar (`client_id`
 * null, mis. dari sebelum fitur ini ada, atau klien one-off) sengaja tidak
 * muncul di sini — itu konsekuensi wajar dari "penautan", bukan bug; nama
 * klien lama tetap kelihatan seperti biasa di halaman modul masing-masing.
 */
export default async function KlienTerpaduPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "all") {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [clientsRes, bookingsRes, inventoryRes, magnativeProjectsRes, boothProjectsRes] = await Promise.all([
    supabase.from("magnative_clients").select("*").order("name", { ascending: true }).returns<ClientRow[]>(),
    supabase.from("magnarent_bookings").select("*").returns<BookingRow[]>(),
    supabase.from("magnarent_inventory").select("*").returns<InventoryRow[]>(),
    supabase.from("magnative_projects").select("*").returns<ProjectRow[]>(),
    supabase.from("production_booth_projects").select("*").returns<BoothProjectRow[]>(),
  ]);

  const clients = (clientsRes.data ?? []).map(rowToClient);
  const bookings = (bookingsRes.data ?? []).map(rowToBooking);
  const inventory = (inventoryRes.data ?? []).map(rowToInventory);
  const magnativeProjects = (magnativeProjectsRes.data ?? []).map(rowToProject);
  const boothProjects = (boothProjectsRes.data ?? []).map(rowToBoothProject);

  const summaries: ClientSummary[] = clients.map((client) => {
    const clientBookings = bookings.filter((b) => b.clientId === client.id);
    const clientMagnative = magnativeProjects.filter((p) => p.clientId === client.id);
    const clientBooth = boothProjects.filter((p) => p.clientId === client.id);

    // Nilai & jumlah transaksi hanya dari yang benar-benar terjadi: booking/
    // proyek "Dibatalkan" dan pitching Magnativ yang belum jadi proyek tidak
    // dihitung (sama seperti Piutang & Pendapatan). Daftar rincian tetap
    // menampilkan semuanya.
    const countedBookings = clientBookings.filter((b) => b.status !== "Dibatalkan");
    const countedMagnative = clientMagnative.filter((p) => p.status !== "Dibatalkan" && p.status !== "Pitching");
    const countedBooth = clientBooth.filter((p) => p.status !== "Dibatalkan");

    const bookingValue = countedBookings.reduce(
      (sum, b) => sum + calculateBookingTotal(b, inventory.find((i) => i.id === b.itemId)),
      0
    );
    const magnativeValue = countedMagnative.reduce((sum, p) => sum + p.budget, 0);
    const boothValue = countedBooth.reduce((sum, p) => sum + p.budget, 0);

    return {
      id: client.id,
      name: client.name,
      industry: client.industry,
      status: client.status,
      totalValue: bookingValue + magnativeValue + boothValue,
      // Dipakai badge "Klien Berulang" (permintaan investor soal repeat
      // order) — total booking/proyek klien ini lintas ketiga modul,
      // TERPISAH dari jumlah lini bisnis yang dipakai (lihat komentar di
      // ClientDirectoryTable.tsx).
      totalTransaksi: countedBookings.length + countedMagnative.length + countedBooth.length,
      bookings: clientBookings.map((b) => ({
        id: b.id,
        label: inventory.find((i) => i.id === b.itemId)?.name ?? "—",
        value: calculateBookingTotal(b, inventory.find((i) => i.id === b.itemId)),
        status: b.status,
        date: b.tanggalMulai,
      })),
      magnativeProjects: clientMagnative.map((p) => ({
        id: p.id,
        label: p.name,
        value: p.budget,
        status: p.status,
        date: p.tanggalMulai,
      })),
      boothProjects: clientBooth.map((p) => ({
        id: p.id,
        label: p.name,
        value: p.budget,
        status: p.status,
        date: p.tanggalMulai,
      })),
    };
  });

  // Klien dengan riwayat di lebih dari satu modul naik ke atas — itulah
  // justru klien yang paling menunjukkan nilai "Super App" ini. Di antara
  // klien dengan jumlah lini bisnis yang sama, klien yang paling sering
  // repeat order (totalTransaksi) naik duluan sebelum nilai total.
  summaries.sort((a, b) => {
    const modulesOf = (s: ClientSummary) =>
      Number(s.bookings.length > 0) + Number(s.magnativeProjects.length > 0) + Number(s.boothProjects.length > 0);
    return modulesOf(b) - modulesOf(a) || b.totalTransaksi - a.totalTransaksi || b.totalValue - a.totalValue;
  });

  return (
    <div className="p-4 md:p-8">
      <div className="animate-fade-up flex items-start gap-4">
        <div className="relative shrink-0">
          <span
            className="absolute -inset-1.5 animate-pulse rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 opacity-30 blur-lg"
            aria-hidden
          />
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-sm">
            <Users2 className="h-6 w-6" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-500 dark:text-indigo-400">
            Admin
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Direktori Klien Terpadu
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Riwayat & nilai satu klien digabung dari Magnarent, Magnativ, dan Production.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ClientDirectoryTable clients={summaries} />
      </div>
    </div>
  );
}
