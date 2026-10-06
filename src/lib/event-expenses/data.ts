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
import { fetchAllPages, fetchInChunks, PAGE_SIZE } from "@/lib/shared/paginate";

/** Baris ringkas dari `public.events` (modul Tracking Progress Event,
 * migrasi 0053) — cuma kolom yang dipakai untuk membangun opsi "Event/
 * Proyek Terkait" di sini, bukan tipe `EventSummary` penuh milik modul itu
 * (src/lib/events/types.ts), supaya data.ts ini tidak ikut terseret
 * dependensi tipe modul lain yang tidak dipakai. */
type EventRow = { id: string; name: string; client_name: string | null; status: string };

function withCancelled(label: string, status: string): string {
  return status === "Dibatalkan" ? `${label} (Dibatalkan)` : label;
}

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
  const [expensesRes, bookingsRes, projectsRes, boothRes, eventsRes] = await Promise.all([
    supabase
      .from("event_expenses")
      .select("*")
      // Urutan deterministik (tanggal sama -> created_at -> id) supaya
      // "Muat Lebih Banyak" tidak mengulang/melewatkan baris di batas 500.
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500)
      .returns<EventExpenseRow[]>(),
    // Sumber (pilihan form + label tabel) diambil per halaman: dulu dibatasi
    // 1000 baris sehingga booking/proyek terbaru tidak bisa dipilih dan
    // pengeluaran yang terkait tampil "—".
    fetchAllPages<BookingRow>((afterId) =>
      supabase.from("magnarent_bookings").select("*").gt("id", afterId).order("id").limit(PAGE_SIZE).returns<BookingRow[]>()
    ),
    fetchAllPages<ProjectRow>((afterId) =>
      supabase.from("magnative_projects").select("*").gt("id", afterId).order("id").limit(PAGE_SIZE).returns<ProjectRow[]>()
    ),
    fetchAllPages<BoothProjectRow>((afterId) =>
      supabase.from("production_booth_projects").select("*").gt("id", afterId).order("id").limit(PAGE_SIZE).returns<BoothProjectRow[]>()
    ),
    // Tambahan migrasi 0082 — event umum lintas-divisi (modul Tracking
    // Progress Event, migrasi 0053) ikut jadi opsi "Event/Proyek Terkait"
    // supaya pengeluaran seperti bon/nota untuk event ini bisa dikaitkan
    // langsung, bukan cuma lewat booking/proyek per-divisi.
    supabase.from("events").select("id, name, client_name, status").returns<EventRow[]>(),
  ]);

  // Bukti hanya untuk pengeluaran yang dimuat, per potongan id -- dulu SEMUA
  // bukti diambil tanpa urutan dan terpotong di 1000 baris, sehingga bukti
  // pengeluaran terbaru tampil "Belum diunggah".
  const expenseIds = (expensesRes.data ?? []).map((r) => r.id);
  const proofsRes = await fetchInChunks<EventExpenseProofRow>(expenseIds, (chunk, afterId) =>
    supabase.from("event_expense_proofs").select("*").in("expense_id", chunk).gt("id", afterId).order("id").limit(PAGE_SIZE).returns<EventExpenseProofRow[]>()
  );
  if (proofsRes.error) console.error("[event-expenses] gagal memuat bukti:", proofsRes.error.message);

  const proofsByExpense = new Map<string, EventExpenseProofRow[]>();
  for (const proof of proofsRes.data) {
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

  const bookings = bookingsRes.data.map(rowToBooking);
  const projects = projectsRes.data.map(rowToProject);
  const boothProjects = boothRes.data.map(rowToBoothProject);
  const events = eventsRes.data ?? [];

  // Sumber yang "Dibatalkan" SENGAJA tetap disertakan (ditandai
  // `cancelled`) -- sebelumnya dibuang di sini, akibatnya pengeluaran yang
  // terlanjur dikaitkan sebelum booking/proyek/event dibatalkan tampil "—"
  // di tabel & ekspor, dan kaitannya hilang saat diedit. Form yang
  // menyembunyikannya dari pilihan baru (EventExpenseFormModal).
  const sourceOptions: ExpenseSourceOption[] = [
    { sourceType: "umum", sourceId: null, division: "finance", label: "Finance / Umum (tidak terikat event)" },
    ...bookings
      .map(
        (b): ExpenseSourceOption => ({
          sourceType: "magnarent_booking",
          sourceId: b.id,
          division: "magnarent",
          label: withCancelled(`${b.namaKlien} — ${b.tanggalMulai} s/d ${b.tanggalSelesai}`, b.status),
          cancelled: b.status === "Dibatalkan",
        })
      ),
    ...projects
      .map(
        (p): ExpenseSourceOption => ({
          sourceType: "magnative_project",
          sourceId: p.id,
          division: "magnative",
          label: withCancelled(p.name, p.status),
          cancelled: p.status === "Dibatalkan",
        })
      ),
    ...boothProjects
      .map(
        (p): ExpenseSourceOption => ({
          sourceType: "production_booth",
          sourceId: p.id,
          division: "production",
          label: withCancelled(p.name, p.status),
          cancelled: p.status === "Dibatalkan",
        })
      ),
    ...events.map(
      (e): ExpenseSourceOption => ({
        sourceType: "event_tracking",
        sourceId: e.id,
        division: "event",
        label: withCancelled(e.client_name ? `${e.name} — ${e.client_name}` : e.name, e.status),
        cancelled: e.status === "Dibatalkan",
      })
    ),
  ];

  return { expenses, sourceOptions, hasMore: expenses.length === 500 };
}
