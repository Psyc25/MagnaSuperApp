import { createClient } from "@/lib/supabase/server";
import { classifyCashFlowCategory, pickCounterLine, type CashFlowCategory } from "./cash-flow-category";
import { ACCOUNT_CODE, DIVISION_LABELS } from "./types";
import type { Account, AccountType, JournalEntry, JournalLine, JournalSourceType, NormalBalance } from "./types";

// Diekspor ulang dari sini (bukan cuma dipakai internal) supaya kode lama
// yang sudah `import { DIVISION_LABELS } from "@/lib/accounting/data"`
// (halaman Laba-Rugi & Arus Kas) tidak perlu diubah.
export { DIVISION_LABELS };

/**
 * Sisi BACA modul "Akuntansi" (Tahap C) -- Laporan Laba-Rugi ditarik
 * langsung dari Jurnal Umum yang sudah diposting Tahap A/B, BUKAN dihitung
 * ulang dari invoices/event_expenses seperti halaman Keuangan/Arus Kas
 * Proyek lama -- ini justru poin utamanya: begitu jurnalnya benar, semua
 * laporan turunan (Laba-Rugi, Neraca nanti di Tahap D, Arus Kas di Tahap
 * E) otomatis konsisten satu sama lain karena sumbernya sama.
 *
 * Query-lalu-gabung di TypeScript (bukan SQL view/RPC agregat) -- pola
 * yang sama dipakai di seluruh modul lain (Keuangan, Laporan, Arus Kas
 * Proyek), supaya gampang dibaca/di-maintain tanpa perlu buka dua tempat
 * (kode + definisi view database) buat ngerti satu angka.
 */

/**
 * Supabase (PostgREST) memotong hasil query DIAM-DIAM di 1000 baris
 * (`max_rows`), dan daftar `.in(...)` dikirim lewat URL yang punya batas
 * panjang. Laporan di bawah dulu mengambil semua ID jurnal sekaligus lalu
 * `.in("journal_entry_id", semuaId)` -- aman saat jurnal masih sedikit,
 * tapi begitu ratusan/ribuan jurnal otomatis terposting, angkanya akan
 * salah tanpa error. Dua helper ini mengambil per halaman & per potongan ID.
 */
const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 150;
/** Titik awal keyset pagination -- semua UUID lebih besar dari UUID nol. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

type PageResult<T> = { data: T[] | null; error: { message: string } | null };
type AllRowsResult<T> = { data: T[]; error: { message: string } | null };

/**
 * Keyset pagination (`id > id terakhir`, urut id) -- bukan offset/range:
 * dengan offset, jurnal yang ditulis bersamaan saat laporan sedang diambil
 * bisa menggeser halaman sehingga ada baris terlewat atau terhitung dua kali.
 * Setiap query WAJIB menyertakan kolom `id`.
 */
async function fetchAllPages<T extends { id: string }>(
  page: (afterId: string) => PromiseLike<PageResult<T>>
): Promise<AllRowsResult<T>> {
  const rows: T[] = [];
  let afterId = NIL_UUID;
  for (;;) {
    const { data, error } = await page(afterId);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
    afterId = data[data.length - 1].id;
  }
}

async function fetchInChunks<T extends { id: string }>(
  ids: string[],
  page: (chunk: string[], afterId: string) => PromiseLike<PageResult<T>>
): Promise<AllRowsResult<T>> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE);
    const result = await fetchAllPages<T>((afterId) => page(chunk, afterId));
    if (result.error) return { data: rows, error: result.error };
    rows.push(...result.data);
  }
  return { data: rows, error: null };
}

export type IncomeStatementLine = {
  accountCode: string;
  accountName: string;
  amount: number;
};

export type DivisionBreakdown = {
  divisionKey: string;
  divisionLabel: string;
  totalPendapatan: number;
  totalBeban: number;
  labaBersih: number;
};

export type IncomeStatement = {
  startDate: string;
  endDate: string;
  pendapatan: IncomeStatementLine[];
  beban: IncomeStatementLine[];
  totalPendapatan: number;
  totalBeban: number;
  labaBersih: number;
  perDivisi: DivisionBreakdown[];
  /** Jumlah entri jurnal yang masuk hitungan -- ditampilkan di UI supaya
   * kelihatan kalau laporannya kosong karena memang belum ada transaksi
   * di rentang tanggal itu (bukan karena ada yang salah). */
  entryCount: number;
};

function emptyIncomeStatement(startDate: string, endDate: string): IncomeStatement {
  return {
    startDate,
    endDate,
    pendapatan: [],
    beban: [],
    totalPendapatan: 0,
    totalBeban: 0,
    labaBersih: 0,
    perDivisi: [],
    entryCount: 0,
  };
}

export async function getIncomeStatement(startDate: string, endDate: string): Promise<IncomeStatement> {
  const supabase = await createClient();

  const { data: entries, error: entriesError } = await fetchAllPages((afterId) =>
    supabase
      .from("journal_entries")
      .select("id, division")
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .gt("id", afterId)
      .order("id")
      .limit(PAGE_SIZE)
      .returns<{ id: string; division: string | null }[]>()
  );

  if (entriesError) {
    console.error("[accounting] getIncomeStatement: gagal ambil journal_entries:", entriesError.message);
    return emptyIncomeStatement(startDate, endDate);
  }
  if (!entries || entries.length === 0) {
    return emptyIncomeStatement(startDate, endDate);
  }

  const divisionByEntry = new Map(entries.map((e) => [e.id, e.division ?? ""]));
  const entryIds = entries.map((e) => e.id);

  const [{ data: lines, error: linesError }, { data: accounts, error: accountsError }] = await Promise.all([
    fetchInChunks(entryIds, (chunk, afterId) =>
      supabase
        .from("journal_entry_lines")
        .select("id, journal_entry_id, account_id, debit, credit")
        .in("journal_entry_id", chunk)
        .gt("id", afterId)
        .order("id")
        .limit(PAGE_SIZE)
        .returns<{ id: string; journal_entry_id: string; account_id: string; debit: number; credit: number }[]>()
    ),
    supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type")
      .returns<{ id: string; account_code: string; account_name: string; account_type: string }[]>(),
  ]);

  if (linesError || accountsError) {
    console.error(
      "[accounting] getIncomeStatement: gagal ambil baris jurnal/daftar akun:",
      linesError?.message,
      accountsError?.message
    );
    return emptyIncomeStatement(startDate, endDate);
  }

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const pendapatanByAccount = new Map<string, number>();
  const bebanByAccount = new Map<string, number>();
  const perDivisiMap = new Map<string, { totalPendapatan: number; totalBeban: number }>();

  for (const line of lines ?? []) {
    const account = accountById.get(line.account_id);
    if (!account) continue;
    const divisionKey = divisionByEntry.get(line.journal_entry_id) ?? "";
    const bucket = perDivisiMap.get(divisionKey) ?? { totalPendapatan: 0, totalBeban: 0 };

    if (account.account_type === "Pendapatan") {
      // Saldo normal Pendapatan ada di sisi Kredit.
      const net = line.credit - line.debit;
      pendapatanByAccount.set(account.account_code, (pendapatanByAccount.get(account.account_code) ?? 0) + net);
      bucket.totalPendapatan += net;
      perDivisiMap.set(divisionKey, bucket);
    } else if (account.account_type === "Beban") {
      // Saldo normal Beban ada di sisi Debit.
      const net = line.debit - line.credit;
      bebanByAccount.set(account.account_code, (bebanByAccount.get(account.account_code) ?? 0) + net);
      bucket.totalBeban += net;
      perDivisiMap.set(divisionKey, bucket);
    }
  }

  const accountsByCode = new Map((accounts ?? []).map((a) => [a.account_code, a]));
  const toLines = (map: Map<string, number>): IncomeStatementLine[] =>
    Array.from(map.entries())
      .filter(([, amount]) => amount !== 0)
      .map(([code, amount]) => ({
        accountCode: code,
        accountName: accountsByCode.get(code)?.account_name ?? code,
        amount,
      }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const pendapatan = toLines(pendapatanByAccount);
  const beban = toLines(bebanByAccount);
  const totalPendapatan = pendapatan.reduce((sum, l) => sum + l.amount, 0);
  const totalBeban = beban.reduce((sum, l) => sum + l.amount, 0);

  const perDivisi: DivisionBreakdown[] = Array.from(perDivisiMap.entries())
    .map(([divisionKey, v]) => ({
      divisionKey,
      divisionLabel: DIVISION_LABELS[divisionKey] ?? divisionKey,
      totalPendapatan: v.totalPendapatan,
      totalBeban: v.totalBeban,
      labaBersih: v.totalPendapatan - v.totalBeban,
    }))
    .sort((a, b) => b.labaBersih - a.labaBersih);

  return {
    startDate,
    endDate,
    pendapatan,
    beban,
    totalPendapatan,
    totalBeban,
    labaBersih: totalPendapatan - totalBeban,
    perDivisi,
    entryCount: entries.length,
  };
}

/**
 * Tahap D -- Neraca. BEDA MENDASAR dari Laba-Rugi di atas: Neraca adalah
 * potret PER TANGGAL (bukan rentang periode) yang mengakumulasi SEMUA
 * jurnal sejak awal sampai `asOfDate` -- aset/kewajiban/modal itu saldo
 * berjalan, bukan angka satu periode yang "ditutup ke nol" tiap bulan.
 *
 * Karena sistem ini SENGAJA tidak mengerjakan jurnal penutup (closing
 * entries) tiap akhir periode -- itu proses akuntansi manual yang di luar
 * cakupan Tahap D -- akun Pendapatan & Beban di jurnal tetap terakumulasi
 * dari awal. Supaya Neraca tetap balance (Aset = Kewajiban + Modal), laba
 * kumulatif (Pendapatan dikurangi Beban sejak awal) DIHITUNG SEBAGAI
 * BAGIAN MODAL di sini ("Laba Berjalan (Belum Ditutup)") -- ini konsep
 * akuntansi standar untuk neraca yang ditarik sebelum jurnal penutup
 * dibuat, bukan pendekatan yang disederhanakan.
 */
export type BalanceSheetLine = {
  accountCode: string;
  accountName: string;
  amount: number;
};

export type BalanceSheet = {
  asOfDate: string;
  aset: BalanceSheetLine[];
  kewajiban: BalanceSheetLine[];
  modal: BalanceSheetLine[];
  labaBerjalanBelumDitutup: number;
  totalAset: number;
  totalKewajiban: number;
  totalModal: number;
  isBalanced: boolean;
  entryCount: number;
};

function emptyBalanceSheet(asOfDate: string): BalanceSheet {
  return {
    asOfDate,
    aset: [],
    kewajiban: [],
    modal: [],
    labaBerjalanBelumDitutup: 0,
    totalAset: 0,
    totalKewajiban: 0,
    totalModal: 0,
    isBalanced: true,
    entryCount: 0,
  };
}

export async function getBalanceSheet(asOfDate: string): Promise<BalanceSheet> {
  const supabase = await createClient();

  const { data: entries, error: entriesError } = await fetchAllPages((afterId) =>
    supabase
      .from("journal_entries")
      .select("id")
      .lte("entry_date", asOfDate)
      .gt("id", afterId)
      .order("id")
      .limit(PAGE_SIZE)
      .returns<{ id: string }[]>()
  );

  if (entriesError) {
    console.error("[accounting] getBalanceSheet: gagal ambil journal_entries:", entriesError.message);
    return emptyBalanceSheet(asOfDate);
  }
  if (!entries || entries.length === 0) {
    return emptyBalanceSheet(asOfDate);
  }

  const entryIds = entries.map((e) => e.id);

  const [{ data: lines, error: linesError }, { data: accounts, error: accountsError }] = await Promise.all([
    fetchInChunks(entryIds, (chunk, afterId) =>
      supabase
        .from("journal_entry_lines")
        .select("id, account_id, debit, credit")
        .in("journal_entry_id", chunk)
        .gt("id", afterId)
        .order("id")
        .limit(PAGE_SIZE)
        .returns<{ id: string; account_id: string; debit: number; credit: number }[]>()
    ),
    supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type")
      .returns<{ id: string; account_code: string; account_name: string; account_type: string }[]>(),
  ]);

  if (linesError || accountsError) {
    console.error(
      "[accounting] getBalanceSheet: gagal ambil baris jurnal/daftar akun:",
      linesError?.message,
      accountsError?.message
    );
    return emptyBalanceSheet(asOfDate);
  }

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const asetByAccount = new Map<string, number>();
  const kewajibanByAccount = new Map<string, number>();
  const modalByAccount = new Map<string, number>();
  let totalPendapatanKumulatif = 0;
  let totalBebanKumulatif = 0;

  for (const line of lines ?? []) {
    const account = accountById.get(line.account_id);
    if (!account) continue;

    if (account.account_type === "Aset") {
      // Saldo normal Aset ada di sisi Debit.
      const net = line.debit - line.credit;
      asetByAccount.set(account.account_code, (asetByAccount.get(account.account_code) ?? 0) + net);
    } else if (account.account_type === "Kewajiban") {
      const net = line.credit - line.debit;
      kewajibanByAccount.set(account.account_code, (kewajibanByAccount.get(account.account_code) ?? 0) + net);
    } else if (account.account_type === "Modal") {
      const net = line.credit - line.debit;
      modalByAccount.set(account.account_code, (modalByAccount.get(account.account_code) ?? 0) + net);
    } else if (account.account_type === "Pendapatan") {
      totalPendapatanKumulatif += line.credit - line.debit;
    } else if (account.account_type === "Beban") {
      totalBebanKumulatif += line.debit - line.credit;
    }
  }

  const accountsByCode = new Map((accounts ?? []).map((a) => [a.account_code, a]));
  const toLines = (map: Map<string, number>): BalanceSheetLine[] =>
    Array.from(map.entries())
      .filter(([, amount]) => amount !== 0)
      .map(([code, amount]) => ({
        accountCode: code,
        accountName: accountsByCode.get(code)?.account_name ?? code,
        amount,
      }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const aset = toLines(asetByAccount);
  const kewajiban = toLines(kewajibanByAccount);
  const modal = toLines(modalByAccount);

  const totalAset = aset.reduce((sum, l) => sum + l.amount, 0);
  const totalKewajiban = kewajiban.reduce((sum, l) => sum + l.amount, 0);
  const totalModalAccounts = modal.reduce((sum, l) => sum + l.amount, 0);
  const labaBerjalanBelumDitutup = totalPendapatanKumulatif - totalBebanKumulatif;
  const totalModal = totalModalAccounts + labaBerjalanBelumDitutup;

  return {
    asOfDate,
    aset,
    kewajiban,
    modal,
    labaBerjalanBelumDitutup,
    totalAset,
    totalKewajiban,
    totalModal,
    // Toleransi 1 rupiah untuk pembulatan -- seharusnya SELALU balance
    // persis karena trigger check_journal_entry_balanced (migrasi 0051)
    // menolak jurnal yang debit/kreditnya tidak sama, jadi ketidakcocokan
    // di sini adalah sinyal ada bug, bukan hal yang wajar terjadi.
    isBalanced: Math.abs(totalAset - (totalKewajiban + totalModal)) < 1,
    entryCount: entries.length,
  };
}


/**
 * Tahap E -- Arus Kas (dari Jurnal). BEDA dari halaman "Arus Kas Proyek"
 * (/dashboard/admin/arus-kas) yang lama -- itu hitung ulang langsung dari
 * event_expenses/invoices per proyek; ini laporan resmi akuntansi: mutasi
 * Kas Kecil (1-1001) + Bank Operasional (1-1002) yang SUDAH terposting ke
 * Jurnal Umum (Tahap A/B), diklasifikasi Operasional/Investasi/Pendanaan
 * seperti Laporan Arus Kas standar (mirip Accurate) -- bukan mengulang
 * logika hitung dari sumbernya lagi, sama seperti Laba-Rugi & Neraca.
 *
 * Klasifikasi ditentukan dari akun LAWAN di baris jurnal yang sama (baris
 * non-kas lain di satu entri jurnal yang sama):
 * - lawan Aset Tetap (mis. beli peralatan) -> Investasi
 * - lawan Modal (mis. setoran modal pemilik) -> Pendanaan
 * - lawan sesama akun Kas/Bank (transfer internal Kas Kecil <-> Bank
 *   Operasional) -> Lainnya, supaya tidak dobel dihitung sebagai
 *   Operasional padahal bukan transaksi ke pihak luar
 * - selain itu (Pendapatan, Beban, Piutang, Hutang jangka pendek) ->
 *   Operasional, karena semuanya berasal dari aktivitas usaha sehari-hari
 */
export type { CashFlowCategory };

export type CashFlowLine = {
  entryId: string;
  entryDate: string;
  description: string;
  division: string;
  sourceType: string;
  cashAccountCode: string;
  cashAccountName: string;
  /** Positif = kas/bank bertambah (masuk), negatif = berkurang (keluar). */
  amount: number;
  category: CashFlowCategory;
  counterAccountName: string;
};

export type CashFlowCategorySummary = {
  category: CashFlowCategory;
  totalMasuk: number;
  totalKeluar: number;
  net: number;
};

export type CashFlowStatement = {
  startDate: string;
  endDate: string;
  /** Saldo Kas+Bank akumulasi dari semua jurnal SEBELUM startDate. */
  saldoAwal: number;
  saldoAkhir: number;
  totalMasuk: number;
  totalKeluar: number;
  netChange: number;
  byCategory: CashFlowCategorySummary[];
  lines: CashFlowLine[];
  entryCount: number;
};

const CASH_ACCOUNT_CODES = [ACCOUNT_CODE.KAS_KECIL, ACCOUNT_CODE.BANK_OPERASIONAL] as const;
const CASH_FLOW_CATEGORY_ORDER: CashFlowCategory[] = ["Operasional", "Investasi", "Pendanaan", "Lainnya"];

function emptyCashFlowStatement(startDate: string, endDate: string, saldoAwal = 0): CashFlowStatement {
  return {
    startDate,
    endDate,
    saldoAwal,
    saldoAkhir: saldoAwal,
    totalMasuk: 0,
    totalKeluar: 0,
    netChange: 0,
    byCategory: [],
    lines: [],
    entryCount: 0,
  };
}

export async function getCashFlowStatement(startDate: string, endDate: string): Promise<CashFlowStatement> {
  const supabase = await createClient();

  const { data: cashAccounts, error: cashAccountsError } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .in("account_code", CASH_ACCOUNT_CODES)
    .returns<{ id: string; account_code: string; account_name: string }[]>();

  if (cashAccountsError || !cashAccounts || cashAccounts.length === 0) {
    console.error("[accounting] getCashFlowStatement: gagal ambil akun Kas/Bank:", cashAccountsError?.message);
    return emptyCashFlowStatement(startDate, endDate);
  }
  const cashAccountIds = cashAccounts.map((a) => a.id);
  const cashAccountById = new Map(cashAccounts.map((a) => [a.id, a]));

  // Saldo awal: akumulasi seluruh jurnal SEBELUM startDate (sejak awal
  // berdiri) yang menyentuh akun Kas/Bank -- sama pola akumulasi kumulatif
  // seperti getBalanceSheet di atas, cuma dibatasi ke 2 akun ini saja.
  const { data: priorEntries, error: priorEntriesError } = await fetchAllPages((afterId) =>
    supabase
      .from("journal_entries")
      .select("id")
      .lt("entry_date", startDate)
      .gt("id", afterId)
      .order("id")
      .limit(PAGE_SIZE)
      .returns<{ id: string }[]>()
  );

  if (priorEntriesError) {
    console.error(
      "[accounting] getCashFlowStatement: gagal ambil jurnal sebelum periode:",
      priorEntriesError.message
    );
    return emptyCashFlowStatement(startDate, endDate);
  }

  let saldoAwal = 0;
  if (priorEntries && priorEntries.length > 0) {
    const { data: priorLines, error: priorLinesError } = await fetchInChunks(
      priorEntries.map((e) => e.id),
      (chunk, afterId) =>
        supabase
          .from("journal_entry_lines")
          .select("id, debit, credit")
          .in("journal_entry_id", chunk)
          .in("account_id", cashAccountIds)
          .gt("id", afterId)
          .order("id")
          .limit(PAGE_SIZE)
          .returns<{ id: string; debit: number; credit: number }[]>()
    );

    if (priorLinesError) {
      console.error("[accounting] getCashFlowStatement: gagal ambil saldo awal kas:", priorLinesError.message);
      return emptyCashFlowStatement(startDate, endDate);
    }
    saldoAwal = (priorLines ?? []).reduce((sum, l) => sum + (l.debit - l.credit), 0);
  }

  // Mutasi dalam periode yang diminta.
  const { data: entries, error: entriesError } = await fetchAllPages((afterId) =>
    supabase
      .from("journal_entries")
      .select("id, entry_date, description, division, source_type")
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .gt("id", afterId)
      .order("id")
      .limit(PAGE_SIZE)
      .returns<
        { id: string; entry_date: string; description: string; division: string | null; source_type: string }[]
      >()
  );

  if (entriesError) {
    console.error("[accounting] getCashFlowStatement: gagal ambil jurnal periode:", entriesError.message);
    return emptyCashFlowStatement(startDate, endDate, saldoAwal);
  }
  if (!entries || entries.length === 0) {
    return emptyCashFlowStatement(startDate, endDate, saldoAwal);
  }

  const entryIds = entries.map((e) => e.id);
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const [{ data: allLines, error: allLinesError }, { data: allAccounts, error: allAccountsError }] =
    await Promise.all([
      fetchInChunks(entryIds, (chunk, afterId) =>
        supabase
          .from("journal_entry_lines")
          .select("id, journal_entry_id, account_id, debit, credit")
          .in("journal_entry_id", chunk)
          .gt("id", afterId)
          .order("id")
          .limit(PAGE_SIZE)
          .returns<{ id: string; journal_entry_id: string; account_id: string; debit: number; credit: number }[]>()
      ),
      supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, account_subtype")
        .returns<
          { id: string; account_code: string; account_name: string; account_type: string; account_subtype: string }[]
        >(),
    ]);

  if (allLinesError || allAccountsError) {
    console.error(
      "[accounting] getCashFlowStatement: gagal ambil baris jurnal/daftar akun periode:",
      allLinesError?.message,
      allAccountsError?.message
    );
    return emptyCashFlowStatement(startDate, endDate, saldoAwal);
  }

  const accountById = new Map((allAccounts ?? []).map((a) => [a.id, a]));

  // Kelompokkan semua baris per entri jurnal supaya tiap baris kas bisa
  // cari "akun lawan"-nya (baris non-kas lain di entri jurnal yang sama).
  const linesByEntry = new Map<string, { account_id: string; debit: number; credit: number }[]>();
  for (const line of allLines ?? []) {
    const bucket = linesByEntry.get(line.journal_entry_id) ?? [];
    bucket.push(line);
    linesByEntry.set(line.journal_entry_id, bucket);
  }

  const lines: CashFlowLine[] = [];
  for (const [entryId, entryLines] of linesByEntry) {
    const entry = entryById.get(entryId);
    if (!entry) continue;
    const cashLines = entryLines.filter((l) => cashAccountIds.includes(l.account_id));
    if (cashLines.length === 0) continue;
    const counterLine = pickCounterLine(entryLines, cashAccountIds, accountById);
    const category = classifyCashFlowCategory(
      counterLine ? accountById.get(counterLine.account_id) : undefined,
      cashAccountIds
    );
    const counterAccountName = counterLine ? (accountById.get(counterLine.account_id)?.account_name ?? "-") : "-";

    for (const line of cashLines) {
      const cashAccount = cashAccountById.get(line.account_id);
      if (!cashAccount) continue;
      const amount = line.debit - line.credit;
      if (amount === 0) continue;
      lines.push({
        entryId,
        entryDate: entry.entry_date,
        description: entry.description,
        division: entry.division ?? "",
        sourceType: entry.source_type,
        cashAccountCode: cashAccount.account_code,
        cashAccountName: cashAccount.account_name,
        amount,
        category,
        counterAccountName,
      });
    }
  }

  lines.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.cashAccountCode.localeCompare(b.cashAccountCode));

  const totalMasuk = lines.filter((l) => l.amount > 0).reduce((sum, l) => sum + l.amount, 0);
  const totalKeluar = lines.filter((l) => l.amount < 0).reduce((sum, l) => sum + Math.abs(l.amount), 0);
  const netChange = totalMasuk - totalKeluar;

  const byCategoryMap = new Map<CashFlowCategory, { totalMasuk: number; totalKeluar: number }>();
  for (const line of lines) {
    const bucket = byCategoryMap.get(line.category) ?? { totalMasuk: 0, totalKeluar: 0 };
    if (line.amount > 0) bucket.totalMasuk += line.amount;
    else bucket.totalKeluar += Math.abs(line.amount);
    byCategoryMap.set(line.category, bucket);
  }
  const byCategory: CashFlowCategorySummary[] = CASH_FLOW_CATEGORY_ORDER.filter((cat) => byCategoryMap.has(cat)).map(
    (cat) => {
      const v = byCategoryMap.get(cat)!;
      return { category: cat, totalMasuk: v.totalMasuk, totalKeluar: v.totalKeluar, net: v.totalMasuk - v.totalKeluar };
    }
  );

  return {
    startDate,
    endDate,
    saldoAwal,
    saldoAkhir: saldoAwal + netChange,
    totalMasuk,
    totalKeluar,
    netChange,
    byCategory,
    lines,
    entryCount: entries.length,
  };
}


/**
 * Tahap F -- sisi BACA untuk halaman "Akuntansi" (/dashboard/admin/
 * akuntansi): Daftar Akun (Chart of Accounts) + Jurnal Manual, DISATUKAN
 * jadi satu halaman/satu tautan navigasi (bukan dua halaman terpisah)
 * supaya menu Admin tidak makin panjang -- beda dari Laba-Rugi/Neraca/
 * Arus Kas (Tahap C/D/E) yang masing-masing laporan besar dengan filter
 * sendiri, Daftar Akun & Jurnal Manual sama-sama alat "input/kelola" yang
 * ukurannya pas digabung satu tempat.
 */
export async function getChartOfAccounts(): Promise<Account[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, account_subtype, normal_balance, is_active, description")
    .order("account_code")
    .returns<
      {
        id: string;
        account_code: string;
        account_name: string;
        account_type: AccountType;
        account_subtype: string;
        normal_balance: NormalBalance;
        is_active: boolean;
        description: string | null;
      }[]
    >();

  if (error) {
    console.error("[accounting] getChartOfAccounts: gagal ambil daftar akun:", error.message);
    return [];
  }

  return (data ?? []).map((a) => ({
    id: a.id,
    code: a.account_code,
    name: a.account_name,
    type: a.account_type,
    subtype: a.account_subtype,
    normalBalance: a.normal_balance,
    isActive: a.is_active,
    description: a.description ?? undefined,
  }));
}

/**
 * Jurnal MANUAL saja (source_type = 'manual') -- jurnal hasil auto-posting
 * (invoice/event_expense) sengaja tidak ditampilkan di sini, siklus
 * hidupnya ikut sumbernya masing-masing (lihat komentar
 * `deleteManualJournalEntry` di actions.ts). Dibatasi 200 entri terbaru --
 * cukup besar untuk pemakaian jurnal koreksi/manual yang jarang, tanpa
 * perlu paginasi di Tahap F ini.
 */
export async function getManualJournalEntries(limit = 200): Promise<JournalEntry[]> {
  const supabase = await createClient();

  const { data: entries, error: entriesError } = await supabase
    .from("journal_entries")
    .select("id, entry_date, reference_number, description, source_type, source_id, division, created_at")
    .eq("source_type", "manual")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<
      {
        id: string;
        entry_date: string;
        reference_number: string | null;
        description: string;
        source_type: string;
        source_id: string | null;
        division: string | null;
        created_at: string;
      }[]
    >();

  if (entriesError) {
    console.error("[accounting] getManualJournalEntries: gagal ambil entri jurnal:", entriesError.message);
    return [];
  }
  if (!entries || entries.length === 0) return [];

  const entryIds = entries.map((e) => e.id);
  const [{ data: lines, error: linesError }, { data: accounts, error: accountsError }] = await Promise.all([
    fetchInChunks(entryIds, (chunk, afterId) =>
      supabase
        .from("journal_entry_lines")
        .select("id, journal_entry_id, account_id, debit, credit, notes")
        .in("journal_entry_id", chunk)
        .gt("id", afterId)
        .order("id")
        .limit(PAGE_SIZE)
        .returns<
          { id: string; journal_entry_id: string; account_id: string; debit: number; credit: number; notes: string | null }[]
        >()
    ),
    supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name")
      .returns<{ id: string; account_code: string; account_name: string }[]>(),
  ]);

  if (linesError || accountsError) {
    console.error(
      "[accounting] getManualJournalEntries: gagal ambil baris jurnal/daftar akun:",
      linesError?.message,
      accountsError?.message
    );
    return [];
  }

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const linesByEntry = new Map<string, JournalLine[]>();
  for (const line of lines ?? []) {
    const account = accountById.get(line.account_id);
    const bucket = linesByEntry.get(line.journal_entry_id) ?? [];
    bucket.push({
      id: line.id,
      accountId: line.account_id,
      accountCode: account?.account_code ?? "-",
      accountName: account?.account_name ?? "(akun sudah dihapus)",
      debit: line.debit,
      credit: line.credit,
      notes: line.notes ?? undefined,
    });
    linesByEntry.set(line.journal_entry_id, bucket);
  }
  // Baris diambil urut id (UUID acak, demi paging stabil) -- urutkan ulang
  // untuk tampilan: debit dulu, lalu nominal terbesar, lalu kode akun.
  for (const bucket of linesByEntry.values()) {
    bucket.sort(
      (a, b) =>
        Number(b.debit > 0) - Number(a.debit > 0) ||
        b.debit + b.credit - (a.debit + a.credit) ||
        a.accountCode.localeCompare(b.accountCode)
    );
  }

  return entries.map((e) => ({
    id: e.id,
    entryDate: e.entry_date,
    referenceNumber: e.reference_number ?? undefined,
    description: e.description,
    sourceType: e.source_type as JournalSourceType,
    sourceId: e.source_id ?? undefined,
    division: e.division ?? undefined,
    createdAt: e.created_at,
    lines: linesByEntry.get(e.id) ?? [],
  }));
}
