import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { rowToBooking, rowToInventory, type BookingRow, type InventoryRow } from "@/lib/magnarent/mappers";
import { calculateBookingTotal } from "@/lib/magnarent/pricing";
import { rowToClient, rowToProject, type ClientRow, type ProjectRow } from "@/lib/magnative/mappers";
import { rowToBoothProject, type BoothProjectRow } from "@/lib/production/mappers";
import { rowToInvoice, type InvoiceRow } from "@/lib/invoices/mappers";
import type { InvoiceSourceOption } from "@/lib/invoices/types";
import { InvoiceManager } from "@/components/invoices/InvoiceManager";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { fetchAllPages, PAGE_SIZE } from "@/lib/shared/paginate";

/**
 * Faktur/Invoice terpusat — HANYA akses penuh, pola sama seperti "Katalog
 * Produk"/"Piutang & Pendapatan"/"Klien Terpadu". Invoice bisa dibuat dari
 * booking/proyek yang sudah ada di Magnarent/Magnativ/Production (dipilih
 * dari `sourceOptions` di bawah, pola normalisasi sama seperti `Entry` di
 * halaman Piutang & Pendapatan), atau manual tanpa rujukan sama sekali.
 */
export default async function FakturPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.division !== "all" && profile.division !== "finance")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  // Invoice: SEMUA yang belum Lunas (piutang -- harus selalu bisa ditemukan,
  // ditandai Lunas, dan dikirim ulang) + 300 invoice Lunas terbaru. Dulu
  // hanya 200 invoice terbaru, jadi piutang lama hilang dari halaman ini
  // padahal pengingat jatuh tempo terus menautkan ke sini. Tabel sumber
  // (pilihan "dari booking/proyek") juga diambil per halaman (batas 1000).
  const [openInvoicesRes, paidInvoicesRes, bookingsRes, inventoryRes, projectsRes, boothRes, clientsRes] = await Promise.all([
    fetchAllPages<InvoiceRow>((afterId) =>
      supabase.from("invoices").select("*").neq("status", "Lunas").gt("id", afterId).order("id").limit(PAGE_SIZE).returns<InvoiceRow[]>()
    ),
    supabase.from("invoices").select("*").eq("status", "Lunas").order("created_at", { ascending: false }).limit(300).returns<InvoiceRow[]>(),
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

  const invoices = [...openInvoicesRes.data, ...(paidInvoicesRes.data ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(rowToInvoice);
  const bookings = bookingsRes.data.map(rowToBooking);
  const inventory = (inventoryRes.data ?? []).map(rowToInventory);
  const projects = projectsRes.data.map(rowToProject);
  const boothProjects = boothRes.data.map(rowToBoothProject);
  const clients = (clientsRes.data ?? []).map(rowToClient);

  const sourceOptions: InvoiceSourceOption[] = [
    ...bookings
      .filter((b) => b.status !== "Dibatalkan")
      .map((b): InvoiceSourceOption => {
        const item = inventory.find((i) => i.id === b.itemId);
        const linkedClient = clients.find((c) => c.id === b.clientId);
        return {
          sourceType: "magnarent_booking",
          sourceId: b.id,
          division: "magnarent",
          label: `Sewa ${item?.name ?? "—"} (${b.tanggalMulai} s/d ${b.tanggalSelesai})`,
          clientName: b.namaKlien,
          clientPhone: b.teleponKlien ?? linkedClient?.picPhone,
          amount: calculateBookingTotal(b, item),
          date: b.tanggalMulai,
        };
      }),
    ...projects
      // Proyek yang masih tahap "Pitching" (migrasi 0016) belum tentu deal
      // — jangan ditawarkan sebagai sumber invoice sampai statusnya naik
      // jadi Perencanaan/Berjalan/dst.
      .filter((p) => p.status !== "Dibatalkan" && p.status !== "Pitching")
      .map((p): InvoiceSourceOption => {
        const client = clients.find((c) => c.id === p.clientId);
        return {
          sourceType: "magnative_project",
          sourceId: p.id,
          division: "magnative",
          label: p.name,
          clientName: client?.name ?? "—",
          clientPhone: client?.picPhone,
          amount: p.budget,
          date: p.tanggalMulai,
        };
      }),
    ...boothProjects
      .filter((p) => p.status !== "Dibatalkan")
      .map((p): InvoiceSourceOption => {
        const linkedClient = clients.find((c) => c.id === p.clientId);
        return {
          sourceType: "production_booth",
          sourceId: p.id,
          division: "production",
          label: p.name,
          clientName: p.namaKlien,
          clientPhone: linkedClient?.picPhone,
          amount: p.budget,
          date: p.tanggalMulai,
        };
      }),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-4 md:p-8">
      <div className="animate-fade-up flex items-start gap-4">
        <div className="relative shrink-0">
          <span
            className="absolute -inset-1.5 animate-pulse rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 opacity-30 blur-lg"
            aria-hidden
          />
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
            <Receipt className="h-6 w-6" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-500 dark:text-indigo-400">
            Admin
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">Faktur</h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Buat invoice dari booking/proyek Magnarent, Magnativ, atau Production, download PDF-nya, atau kirim
            langsung ke WhatsApp klien.
          </p>
        </div>
      </div>

      <div className="mt-6">
        {/* InvoiceManager pakai useToast() untuk feedback — lihat catatan di
            src/app/dashboard/admin/produk/page.tsx soal kenapa provider-nya
            dipasang per-halaman, bukan lewat layout.tsx bersama admin. */}
        <ToastProvider>
          <InvoiceManager invoices={invoices} sourceOptions={sourceOptions} />
        </ToastProvider>
      </div>
    </div>
  );
}
