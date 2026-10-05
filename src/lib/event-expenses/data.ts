import { createClient } from "@/lib/supabase/server";
import { rowToBooking, type BookingRow } from "@/lib/magnarent/mappers";
import { rowToProject, type ProjectRow } from "@/lib/magnative/mappers";
import { rowToBoothProject, type BoothProjectRow } from "@/lib/production/mappers";
import {
  rowToEventExpense,
  rowToExpenseProof,
  type EventExpenseProofRow,
  type EventExpenseRow,
} from "./mappers";
import type { EventExpense, ExpenseSourceOption } from "./types";

/** Baris ringkas dari `public.events` (modul Tracking Progress Event,
 * migrasi 0053) — cuma kolom yang dipakai untuk membangun opsi "Event/
 * Proyek Terkait" di sini, bukan tipe `EventSummary` penuh milik modul itu
 * (src/lib/events/types.ts), supaya data.ts ini tidak ikut terseret
 * dependensi tipe modul lain yang tidak dipakai. */
type EventRow = { id: string; name: string; client_name: string | null; status: string };

/**
 * Data untuk halaman "Realisasi Event" — dipanggil dari page.tsx (Server
 * Component). Dibatasi 500 baris terbaru (Tahap 14 — batasi query yang bisa
 * membengkak) karena tabel ini baru dibuat lewat migrasi 0049, jadi belum
 * ada riwayat data lama yang berisiko "hilang" seperti kasus Magnarent
 * kalender — beda dari itu, di sini batas dipasang dari awal.
 *
 * `sourceOptions` dipakai form "Catat Pengeluaran" untuk memilih event/
 * proyek terkait — pola sama dengan `InvoiceSourceOption` di halaman Faktur
 * (src/app/dashboard/admin/faktur/page.tsx), ditambah satu opsi tetap
 * "Finance/Umum" untuk pengeluaran operasional yang tidak terikat event.
 */
export async function getEventExpensesPageData(): Promise<{
  expenses: EventExpense[];
  sourceOptions: ExpenseSourceOption[];
  /** true kalau kemungkinan masih ada baris lebih lama di luar 500 yang
   * dimuat di sini — dipakai `EventExpenseManager.tsx` untuk menampilkan
   * tombol "Muat Lebih Banyak" (perbaikan pasca-review, lewat
   * `loadMoreEventExpenses` di actions.ts). */
  hasMore: boolean;
}> {
  const supabase = await createClient();
  const [expensesRes, proofsRes, bookingsRes, projectsRes, boothRes, eventsRes] = await Promise.all([
    supabase
      .from("event_expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .limit(500)
      .returns<EventExpenseRow[]>(),
    supabase.from("event_expense_proofs").select("*").returns<EventExpenseProofRow[]>(),
    supabase.from("magnarent_bookings").select("*").returns<BookingRow[]>(),
    supabase.from("magnative_projects").select("*").returns<ProjectRow[]>(),
    supabase.from("production_booth_projects").select("*").returns<BoothProjectRow[]>(),
    // Tambahan migrasi 0082 — event umum lintas-divisi (modul Tracking
    // Progress Event, migrasi 0053) ikut jadi opsi "Event/Proyek Terkait"
    // supaya pengeluaran seperti bon/nota untuk event ini bisa dikaitkan
    // langsung, bukan cuma lewat booking/proyek per-divisi.
    supabase
      .from("events")
      .select("id, name, client_name, status")
      .neq("status", "Dibatalkan")
      .returns<EventRow[]>(),
  ]);

  const proofsByExpense = new Map<string, EventExpenseProofRow[]>();
  for (const proof of proofsRes.data ?? []) {
    const list = proofsByExpense.get(proof.expense_id) ?? [];
    list.push(proof);
    proofsByExpense.set(proof.expense_id, list);
  }

  const expenses = (expensesRes.data ?? []).map((row) =>
    rowToEventExpense(
      row,
      (proofsByExpense.get(row.id) ?? [])
        .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))
        .map(rowToExpenseProof)
    )
  );

  const bookings = (bookingsRes.data ?? []).map(rowToBooking);
  const projects = (projectsRes.data ?? []).map(rowToProject);
  const boothProjects = (boothRes.data ?? []).map(rowToBoothProject);
  const events = eventsRes.data ?? [];

  const sourceOptions: ExpenseSourceOption[] = [
    { sourceType: "umum", sourceId: null, division: "finance", label: "Finance / Umum (tidak terikat event)" },
    ...bookings
      .filter((b) => b.status !== "Dibatalkan")
      .map(
        (b): ExpenseSourceOption => ({
          sourceType: "magnarent_booking",
          sourceId: b.id,
          division: "magnarent",
          label: `${b.namaKlien} — ${b.tanggalMulai} s/d ${b.tanggalSelesai}`,
        })
      ),
    ...projects
      .filter((p) => p.status !== "Dibatalkan")
      .map(
        (p): ExpenseSourceOption => ({
          sourceType: "magnative_project",
          sourceId: p.id,
          division: "magnative",
          label: p.name,
        })
      ),
    ...boothProjects
      .filter((p) => p.status !== "Dibatalkan")
      .map(
        (p): ExpenseSourceOption => ({
          sourceType: "production_booth",
          sourceId: p.id,
          division: "production",
          label: p.name,
        })
      ),
    ...events.map(
      (e): ExpenseSourceOption => ({
        sourceType: "event_tracking",
        sourceId: e.id,
        division: "event",
        label: e.client_name ? `${e.name} — ${e.client_name}` : e.name,
      })
    ),
  ];

  return { expenses, sourceOptions, hasMore: expenses.length === 500 };
}
