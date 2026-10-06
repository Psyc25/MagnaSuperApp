import { redirect } from "next/navigation";
import { Wallet2 } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { rowToBooking, rowToInventory, type BookingRow, type InventoryRow } from "@/lib/magnarent/mappers";
import { rowToClient, rowToProject, type ClientRow, type ProjectRow } from "@/lib/magnative/mappers";
import { rowToBoothProject, type BoothProjectRow } from "@/lib/production/mappers";
import { calculateBookingTotal } from "@/lib/magnarent/pricing";
import { formatRupiah } from "@/lib/shared/utils";
import { KeuanganStatGrid } from "./KeuanganStatGrid";
import { PiutangTable, type PiutangModule, type PiutangRow, type PiutangStatus } from "@/components/admin/PiutangTable";
import { TrendBarChart } from "@/components/ui/TrendBarChart";
import { ExportButton, type ExportSheet } from "@/components/ui/ExportButton";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { fetchAllPages, PAGE_SIZE } from "@/lib/shared/paginate";

type PaymentStatusLike = "Belum Bayar" | "DP" | "Lunas";

/**
 * Satu baris gabungan lintas 3 modul — dipakai internal di halaman ini
 * untuk menghitung KPI, daftar piutang, dan tren pendapatan dari satu
 * sumber yang sama, supaya angkanya konsisten di semua bagian halaman.
 */
type Entry = {
  id: string;
  module: PiutangModule;
  label: string;
  namaKlien: string;
  date: string;
  value: number;
  statusPembayaran: PaymentStatusLike;
  /** Nominal DP yang sudah diterima (Rupiah) — 0 kalau bukan status "DP". Migrasi 0015. */
  dpAmount: number;
};

/**
 * Sisa tagihan yang SEBENARNYA untuk satu entry: nilai penuh dikurangi DP
 * yang sudah diterima (kalau statusnya "DP"), tidak pernah negatif. Untuk
 * status "Belum Bayar" ini sama saja dengan nilai penuh (dpAmount = 0).
 */
function outstandingValue(e: Entry): number {
  return Math.max(e.value - e.dpAmount, 0);
}

const MONTHS_BACK = 6;

/**
 * Dashboard Piutang & Pendapatan — HANYA akses penuh, pola sama seperti
 * "Laporan" dan "Klien Terpadu". Menyatukan `status_pembayaran` yang
 * sekarang konsisten di ketiga modul (migrasi 0011) jadi satu gambaran
 * arus kas: siapa yang belum bayar, berapa totalnya per modul, dan tren
 * pendapatan bulanan dari transaksi yang sudah "Lunas".
 *
 * Sejak migrasi 0015, ketiga modul mencatat `dp_amount` sebagai NOMINAL RIIL
 * yang sudah diterima untuk status "DP" (bukan cuma label status seperti
 * sebelumnya) — jadi "Total Piutang" & "Daftar Piutang" di halaman ini
 * sekarang menghitung SISA TAGIHAN SEBENARNYA (nilai penuh dikurangi DP),
 * bukan nilai penuh booking/proyek. Lihat `outstandingValue()` di bawah dan
 * komentar di `PiutangTable.tsx`.
 *
 * "Total Pendapatan" (tren 6 bulan) tetap menghitung nilai penuh dari entry
 * berstatus "Lunas" — sengaja tidak diubah di tahap ini, karena begitu lunas
 * DP tidak lagi relevan (bayangan pendapatan sudah dianggap penuh masuk).
 *
 * Proyek/booking berstatus "Dibatalkan" sengaja dikeluarkan dari semua
 * perhitungan di halaman ini — itu bukan potensi pendapatan yang batal
 * ditagih, jadi tidak masuk hitungan piutang maupun pendapatan.
 */
export default async function KeuanganPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.division !== "all" && profile.division !== "finance")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  // Per halaman: PostgREST memotong di 1000 baris, dan total piutang/
  // pendapatan dulu diam-diam berhenti menghitung begitu tabel lewat 1000.
  const [bookingsRes, inventoryRes, projectsRes, boothRes, clientsRes] = await Promise.all([
    fetchAllPages<BookingRow>((afterId) =>
      supabase.from("magnarent_bookings").select("*").gt("id", afterId).order("id").limit(PAGE_SIZE).returns<BookingRow[]>()
    ),
    supabase.from("magnarent_inventory").select("*").returns<InventoryRow[]>(),
    fetchAllPages<ProjectRow>((afterId) =>
      supabase.from("magnative_projects").select("*").gt("id", afterId).order("id").limit(PAGE_SIZE).returns<ProjectRow[]>()
    ),
    fetchAllPages<BoothProjectRow>((afterId) =>
      supabase.from("production_booth_projects").select("*").gt("id", afterId).order("id").limit(PAGE_SIZE).returns<BoothProjectRow[]>()
    ),
    supabase.from("magnative_clients").select("*").returns<ClientRow[]>(),
  ]);

  const bookings = bookingsRes.data.map(rowToBooking);
  const inventory = (inventoryRes.data ?? []).map(rowToInventory);
  const projects = projectsRes.data.map(rowToProject);
  const boothProjects = boothRes.data.map(rowToBoothProject);
  const clients = (clientsRes.data ?? []).map(rowToClient);

  const entries: Entry[] = [
    ...bookings
      .filter((b) => b.status !== "Dibatalkan")
      .map((b): Entry => ({
        id: b.id,
        module: "magnarent",
        label: inventory.find((i) => i.id === b.itemId)?.name ?? "—",
        namaKlien: b.namaKlien,
        date: b.tanggalMulai,
        value: calculateBookingTotal(b, inventory.find((i) => i.id === b.itemId)),
        statusPembayaran: b.statusPembayaran,
        dpAmount: b.dpAmount ?? 0,
      })),
    ...projects
      // Proyek tahap "Pitching" (migrasi 0016) belum tentu deal — belum
      // punya piutang/pendapatan nyata, jadi dikeluarkan dari perhitungan
      // di halaman ini sampai statusnya naik jadi Perencanaan/Berjalan/dst.
      .filter((p) => p.status !== "Dibatalkan" && p.status !== "Pitching")
      .map((p): Entry => ({
        id: p.id,
        module: "magnative",
        label: p.name,
        namaKlien: clients.find((c) => c.id === p.clientId)?.name ?? "—",
        date: p.tanggalMulai,
        value: p.budget,
        statusPembayaran: p.statusPembayaran,
        dpAmount: p.dpAmount ?? 0,
      })),
    ...boothProjects
      .filter((p) => p.status !== "Dibatalkan")
      .map((p): Entry => ({
        id: p.id,
        module: "production",
        label: p.name,
        namaKlien: p.namaKlien,
        date: p.tanggalMulai,
        value: p.budget,
        statusPembayaran: p.statusPembayaran,
        dpAmount: p.dpAmount ?? 0,
      })),
  ];

  const belumLunas = entries.filter((e) => e.statusPembayaran !== "Lunas");
  const totalPiutang = belumLunas.reduce((sum, e) => sum + outstandingValue(e), 0);
  const totalPendapatan = entries
    .filter((e) => e.statusPembayaran === "Lunas")
    .reduce((sum, e) => sum + e.value, 0);

  const piutangPerModul = (mod: PiutangModule) =>
    belumLunas.filter((e) => e.module === mod).reduce((sum, e) => sum + outstandingValue(e), 0);

  const piutangRows: PiutangRow[] = belumLunas
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      id: `${e.module}-${e.id}`,
      module: e.module,
      label: e.label,
      namaKlien: e.namaKlien,
      date: e.date,
      value: outstandingValue(e),
      dpAmount: e.dpAmount,
      statusPembayaran: e.statusPembayaran as PiutangStatus,
    }));

  const now = new Date();
  const monthBuckets = Array.from({ length: MONTHS_BACK }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1 - i), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
    };
  });
  const revenueTrend = monthBuckets.map(({ key, label }) => ({
    label,
    value: entries
      .filter((e) => e.statusPembayaran === "Lunas" && e.date.slice(0, 7) === key)
      .reduce((sum, e) => sum + e.value, 0),
  }));

  const MODULE_LABEL: Record<PiutangModule, string> = {
    magnarent: "Magnarent",
    magnative: "Magnativ",
    production: "Production",
  };

  // Data buat tombol Ekspor Excel (Tahap 43) — Ringkasan KPI + daftar
  // lengkap piutang (baris yang sama dengan yang dirender PiutangTable di
  // bawah, jadi angkanya pasti konsisten dengan yang terlihat di layar).
  const exportSheets: ExportSheet[] = [
    {
      name: "Ringkasan",
      rows: [
        {
          "Total Piutang (Rp)": totalPiutang,
          "Total Pendapatan 6 Bulan (Rp)": totalPendapatan,
          "Piutang Magnarent (Rp)": piutangPerModul("magnarent"),
          "Piutang Magnativ (Rp)": piutangPerModul("magnative"),
          "Piutang Production (Rp)": piutangPerModul("production"),
          "Jumlah Tertunda": belumLunas.length,
        },
      ],
    },
    {
      name: "Daftar Piutang",
      rows: piutangRows.map((r) => ({
        Modul: MODULE_LABEL[r.module],
        Item: r.label,
        Klien: r.namaKlien,
        Tanggal: r.date,
        "Sisa Tagihan (Rp)": r.value,
        "DP Diterima (Rp)": r.dpAmount,
        Status: r.statusPembayaran,
      })),
    },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="animate-fade-up flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <span
              className="absolute -inset-1.5 animate-pulse rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 opacity-30 blur-lg"
              aria-hidden
            />
            <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-sm">
              <Wallet2 className="h-6 w-6" />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-500 dark:text-rose-400">
              Admin
            </p>
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Piutang &amp; Pendapatan
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              Status pembayaran digabung dari Magnarent, Magnativ, dan Production.
            </p>
          </div>
        </div>
        <ExportButton sheets={exportSheets} fileName="piutang-pendapatan" label="Ekspor Excel" />
      </div>

      <div className="mt-6">
        <KeuanganStatGrid
          totalPiutang={totalPiutang}
          totalPendapatan={totalPendapatan}
          piutangMagnarent={piutangPerModul("magnarent")}
          piutangMagnative={piutangPerModul("magnative")}
          piutangProduction={piutangPerModul("production")}
          jumlahTertunda={belumLunas.length}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <div className={cn("overflow-hidden rounded-2xl border shadow-sm lg:col-span-2", GLASS_SURFACE, GLASS_BORDER)}>
          <div className="border-b border-black/5 px-5 py-3.5 dark:border-white/10">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Tren Pendapatan (Lunas) 6 Bulan</h3>
          </div>
          <div className="px-5 py-5">
            <TrendBarChart data={revenueTrend} formatValue={formatRupiah} />
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Daftar Piutang ({piutangRows.length})
            </h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Diurutkan dari yang paling lama</p>
          </div>
          <PiutangTable rows={piutangRows} />
        </div>
      </div>
    </div>
  );
}
