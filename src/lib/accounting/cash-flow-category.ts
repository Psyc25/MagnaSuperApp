/**
 * Aturan klasifikasi Laporan Arus Kas (metode langsung) -- dipisah dari
 * data.ts (yang butuh klien Supabase server) supaya bisa diuji unit.
 */

export type CashFlowCategory = "Operasional" | "Investasi" | "Pendanaan" | "Lainnya";

export type CashFlowAccount = {
  id: string;
  account_code: string;
  account_type: string;
  account_subtype: string | null;
};

export type CashFlowEntryLine = { account_id: string; debit: number; credit: number };

/**
 * Akun lawan baris Kas/Bank = baris NON-kas dengan nominal terbesar di entri
 * jurnal yang sama (seri: kode akun terkecil) -- tidak bergantung urutan
 * baris dari database. Untuk jurnal 2 baris (mayoritas) hasilnya tunggal.
 */
export function pickCounterLine<T extends CashFlowEntryLine>(
  entryLines: T[],
  cashAccountIds: string[],
  accountById: Map<string, Pick<CashFlowAccount, "account_code">>
): T | undefined {
  const code = (l: T) => accountById.get(l.account_id)?.account_code ?? "";
  return entryLines
    .filter((l) => !cashAccountIds.includes(l.account_id))
    .sort((a, b) => b.debit + b.credit - (a.debit + a.credit) || code(a).localeCompare(code(b)))[0];
}

export function classifyCashFlowCategory(
  counter: CashFlowAccount | undefined,
  cashAccountIds: string[]
): CashFlowCategory {
  if (!counter) return "Lainnya";
  if (cashAccountIds.includes(counter.id)) return "Lainnya"; // transfer internal Kas <-> Bank
  if (counter.account_subtype === "Aset Tetap") return "Investasi";
  if (counter.account_type === "Modal") return "Pendanaan";
  // Dana investor (migrasi 0084) dibukukan sebagai utang (akun 2-1300),
  // bukan Modal -- tapi secara arus kas ini tetap aktivitas Pendanaan,
  // bukan Operasional. Dicek per kode akun (bukan account_type "Kewajiban"
  // secara umum) supaya utang operasional biasa (Hutang Usaha/
  // Reimbursement/Pajak) tetap benar masuk Operasional seperti sebelumnya.
  if (counter.account_code === "2-1300") return "Pendanaan";
  return "Operasional";
}
