import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/shared/utils";
import { ACCOUNT_CODE } from "./types";
import type { InvoiceDivision } from "@/lib/invoices/types";

/*
 * Posting jurnal pelunasan invoice -- dipindah dari accounting/actions.ts:
 * file "use server" mengekspos SETIAP fungsi async yang diekspor sebagai
 * Server Action yang bisa dipanggil langsung dari browser dengan argumen
 * apa pun (mis. jurnal pendapatan palsu bersumber "invoice" yang tidak bisa
 * dihapus lewat UI). Modul ini hanya untuk dipanggil dari server.
 */

const PENDAPATAN_BY_DIVISION: Record<InvoiceDivision, string> = {
  magnarent: ACCOUNT_CODE.PENDAPATAN_MAGNARENT,
  magnative: ACCOUNT_CODE.PENDAPATAN_MAGNATIV,
  production: ACCOUNT_CODE.PENDAPATAN_PRODUCTION,
};

export type InvoiceForJournal = {
  id: string;
  invoiceNumber: string;
  division: InvoiceDivision;
  clientName: string;
  total: number;
  issuedDate: string;
  createdBy: string | null;
};

/**
 * Posting otomatis saat invoice ditandai "Lunas" -- dipanggil dari
 * `markInvoiceStatus`/`updateInvoice` (src/lib/invoices/actions.ts). TIDAK
 * butuh SECURITY DEFINER (beda dari event_expenses, lihat migrasi 0052)
 * karena halaman Faktur sendiri sudah membatasi akses cuma division "all"
 * (redirect di admin/faktur/page.tsx) -- pemanggil di sini sudah pasti
 * lolos RLS chart_of_accounts/journal_entries yang juga cuma division
 * "all", jadi cukup pakai client Supabase biasa.
 *
 * Best-effort: gagal posting jurnal TIDAK membatalkan perubahan status
 * invoice-nya sendiri -- cuma dicatat ke console, sama seperti pola
 * `logActivity` di modul lain. Kalau nanti ketahuan sering gagal, itu baru
 * kelihatan dari log server, bukan bikin staf tidak bisa menandai invoice
 * Lunas.
 *
 * ASUMSI yang didokumentasikan: invoice belum punya kolom metode
 * pembayaran, jadi pelunasan SELALU diposting ke akun "Bank Operasional"
 * (bukan Kas Kecil) -- wajar untuk invoice B2B/klien korporat. Kalau nanti
 * ada pelunasan tunai yang perlu dibedakan, ini perlu disesuaikan setelah
 * kolom metode pembayaran ditambahkan ke tabel invoices.
 */
export async function postInvoiceLunasJournal(invoice: InvoiceForJournal): Promise<void> {
  try {
    const supabase = await createClient();

    // Tanggal jurnal = tanggal PELUNASAN, bukan tanggal terbit invoice --
    // dulu invoice terbit 15 Sep yang lunas 10 Okt tercatat sebagai kas masuk
    // September. Re-posting (invoice Lunas diedit) mempertahankan tanggal
    // jurnal yang sudah ada; posting pertama memakai hari ini (WIB).
    const { data: existing } = await supabase
      .from("journal_entries")
      .select("entry_date")
      .eq("source_type", "invoice")
      .eq("source_id", invoice.id)
      .order("entry_date", { ascending: true })
      .limit(1)
      .maybeSingle<{ entry_date: string }>();
    const entryDate = existing?.entry_date ?? todayISO();

    // Re-posting (invoice yang sudah Lunas diedit lagi) -- hapus dulu
    // supaya tidak dobel, baru buat dari data terkini.
    await supabase.from("journal_entries").delete().eq("source_type", "invoice").eq("source_id", invoice.id);

    if (invoice.total <= 0) return;

    const pendapatanCode = PENDAPATAN_BY_DIVISION[invoice.division];
    const { data: accounts, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code")
      .in("account_code", [ACCOUNT_CODE.BANK_OPERASIONAL, pendapatanCode]);

    if (accountsError) {
      console.error("[accounting] postInvoiceLunasJournal: gagal ambil akun:", accountsError.message);
      return;
    }

    const bankAccount = accounts?.find((a) => a.account_code === ACCOUNT_CODE.BANK_OPERASIONAL);
    const pendapatanAccount = accounts?.find((a) => a.account_code === pendapatanCode);
    if (!bankAccount || !pendapatanAccount) {
      console.error("[accounting] postInvoiceLunasJournal: akun tidak ditemukan untuk divisi", invoice.division);
      return;
    }

    const { data: entry, error: entryError } = await supabase
      .from("journal_entries")
      .insert({
        entry_date: entryDate,
        description: `Pelunasan Invoice ${invoice.invoiceNumber} — ${invoice.clientName}`,
        source_type: "invoice",
        source_id: invoice.id,
        division: invoice.division,
        created_by: invoice.createdBy,
      })
      .select("id")
      .single();

    if (entryError || !entry) {
      console.error("[accounting] postInvoiceLunasJournal: gagal buat entri jurnal:", entryError?.message);
      return;
    }

    const { error: linesError } = await supabase.from("journal_entry_lines").insert([
      { journal_entry_id: entry.id, account_id: bankAccount.id, debit: invoice.total, credit: 0 },
      { journal_entry_id: entry.id, account_id: pendapatanAccount.id, debit: 0, credit: invoice.total },
    ]);

    if (linesError) {
      console.error("[accounting] postInvoiceLunasJournal: gagal buat baris jurnal:", linesError.message);
      await supabase.from("journal_entries").delete().eq("id", entry.id);
    }
  } catch (err) {
    console.error("[accounting] postInvoiceLunasJournal: exception:", err instanceof Error ? err.message : err);
  }
}

/**
 * Hapus jurnal yang terhubung ke satu invoice -- dipanggil saat invoice
 * dihapus, atau statusnya mundur dari "Lunas" ke status lain (koreksi
 * kesalahan input).
 */
export async function deleteInvoiceJournal(invoiceId: string): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("journal_entries").delete().eq("source_type", "invoice").eq("source_id", invoiceId);
  } catch (err) {
    console.error("[accounting] deleteInvoiceJournal: exception:", err instanceof Error ? err.message : err);
  }
}

