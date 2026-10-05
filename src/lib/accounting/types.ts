/**
 * Tipe untuk modul baru "Akuntansi" (Tahap A migrasi 0051: Chart of
 * Accounts + Jurnal Umum double-entry). Tahap B: auto-posting dari
 * Realisasi Event (event_expenses) & Faktur (invoices) yang sudah Lunas,
 * plus jurnal manual untuk transaksi yang tidak lewat modul lain.
 */

export type AccountType = "Aset" | "Kewajiban" | "Modal" | "Pendapatan" | "Beban";
export type NormalBalance = "Debit" | "Kredit";

export type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  normalBalance: NormalBalance;
  isActive: boolean;
  description?: string;
};

export type JournalSourceType = "manual" | "invoice" | "event_expense" | "capital_request";

export type JournalLineInput = {
  accountCode: string;
  debit: number;
  credit: number;
  notes?: string;
};

export type ManualJournalDivision = "magnarent" | "magnative" | "production" | "finance";

/** Label tampilan untuk `journal_entries.division` -- disatukan di sini
 * (bukan di data.ts yang mengimpor `@/lib/supabase/server`) supaya bisa
 * dipakai baik dari Server Component/data fetcher MAUPUN Client Component
 * (mis. `ManualJournalManager`) tanpa menyeret modul server-only ke bundle
 * client. */
export const DIVISION_LABELS: Record<string, string> = {
  magnarent: "Magnarent",
  magnative: "Magnativ",
  production: "Production",
  finance: "Finance/Umum",
  // Jurnal dari Realisasi Event yang terkait event umum lintas-divisi
  // (migrasi 0082) & Pengajuan Modal/dana investor (migrasi 0084) --
  // tanpa baris ini, keduanya tetap ikut ke rincian per divisi (fallback
  // `DIVISION_LABELS[key] ?? key` di accounting/data.ts), cuma tampil
  // sebagai teks mentah "event" alih-alih label yang rapi.
  event: "Event (Lintas Divisi)",
  "": "Tanpa Divisi (Jurnal Manual)",
};

export type ManualJournalInput = {
  entryDate: string;
  description: string;
  division?: ManualJournalDivision | null;
  lines: JournalLineInput[];
};

export type JournalLine = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  notes?: string;
};

export type JournalEntry = {
  id: string;
  entryDate: string;
  referenceNumber?: string;
  description: string;
  sourceType: JournalSourceType;
  sourceId?: string;
  division?: string;
  createdAt: string;
  lines: JournalLine[];
};

/**
 * Pemetaan kode akun -- HARUS sinkron dengan seed Daftar Akun di migrasi
 * 0051. Dipakai di sisi TypeScript untuk posting invoice & validasi jurnal
 * manual -- posting dari event_expenses sendiri dipetakan DI DALAM fungsi
 * database `post_event_expense_journal` (migrasi 0052), karena fungsi itu
 * perlu jalan sebagai SECURITY DEFINER lintas divisi (lihat komentar di
 * accounting/actions.ts).
 */
export const ACCOUNT_CODE = {
  KAS_KECIL: "1-1001",
  BANK_OPERASIONAL: "1-1002",
  PENDAPATAN_MAGNARENT: "4-1000",
  PENDAPATAN_MAGNATIV: "4-2000",
  PENDAPATAN_PRODUCTION: "4-3000",
} as const;
