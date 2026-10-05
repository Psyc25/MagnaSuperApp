/**
 * Tipe untuk modul "Realisasi Event" (Tahap B, migrasi 0049) — pencatatan
 * pengeluaran lintas 3 divisi (Magnarent/Magnative/Production) + Finance/
 * Umum untuk pengeluaran operasional yang tidak terikat event tertentu.
 */

export type ExpenseDivision = "magnarent" | "magnative" | "production" | "finance" | "event";

export const EXPENSE_DIVISION_LABELS: Record<ExpenseDivision, string> = {
  magnarent: "Magnarent",
  magnative: "Magnativ",
  production: "Production",
  finance: "Finance / Umum",
  // Label baru (migrasi 0082) — dipakai pengeluaran yang dikaitkan ke event
  // umum lintas-divisi dari modul Tracking Progress Event ("Papan Tracking
  // Event", migrasi 0053), BUKAN booking/proyek spesifik satu divisi.
  event: "Event (Lintas Divisi)",
};

export type ExpenseSourceType =
  | "magnarent_booking"
  | "magnative_project"
  | "production_booth"
  | "umum"
  | "event_tracking";

export type ExpenseCategory =
  | "Sewa Venue"
  | "Dekorasi & Material"
  | "Transportasi"
  | "Konsumsi"
  | "Talent / Vendor"
  | "Percetakan"
  | "Operasional Kantor"
  | "Lain-lain";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Sewa Venue",
  "Dekorasi & Material",
  "Transportasi",
  "Konsumsi",
  "Talent / Vendor",
  "Percetakan",
  "Operasional Kantor",
  "Lain-lain",
];

export type ReimbursementStatus = "Tidak Perlu" | "Belum Diganti" | "Sudah Diganti";

export const REIMBURSEMENT_STATUSES: ReimbursementStatus[] = ["Tidak Perlu", "Belum Diganti", "Sudah Diganti"];

/** Saran tampil di UI (datalist) — bukan daftar tertutup, staf boleh ketik
 * metode/rekening lain sendiri (lihat komentar migrasi 0049). */
export const PAYMENT_METHOD_SUGGESTIONS = ["Transfer BCA", "Qris", "Cash", "Kantong Jago", "Transfer Jago"];

export type ExpenseProof = {
  id: string;
  expenseId: string;
  fileUrl: string;
  storagePath: string;
  fileName: string;
  uploadedAt: string;
};

export type EventExpense = {
  id: string;
  expenseDate: string;
  division: ExpenseDivision;
  sourceType: ExpenseSourceType;
  sourceId: string | null;
  category: ExpenseCategory;
  amount: number;
  picName: string;
  paymentMethod: string;
  reimbursementStatus: ReimbursementStatus;
  notes?: string;
  createdBy: string | null;
  createdAt: string;
  proofs: ExpenseProof[];
};

/** Opsi "Event/Proyek Terkait" di form — dibangun dari booking Magnarent,
 * proyek Magnative, dan booth project Production yang sudah ada (pola sama
 * seperti `InvoiceSourceOption` di src/lib/invoices/types.ts), plus satu
 * opsi tetap "Finance/Umum" untuk pengeluaran yang tidak terikat event, dan
 * (migrasi 0082) satu opsi per event umum lintas-divisi dari modul Tracking
 * Progress Event (tabel `public.events`) supaya pengeluaran terkait event
 * seperti "GRAB X KOMDIGI" bisa langsung dikaitkan di sini juga. */
export type ExpenseSourceOption = {
  sourceType: ExpenseSourceType;
  sourceId: string | null;
  division: ExpenseDivision;
  label: string;
  /** Sumbernya sudah "Dibatalkan" -- tetap dikirim supaya label pengeluaran
   * lama tidak jadi "—", tapi form tidak menawarkannya untuk pilihan baru
   * (kecuali sumber yang sedang dipakai pengeluaran yang diedit). */
  cancelled?: boolean;
};
