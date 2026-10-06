"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";
import { type AccountType, type ManualJournalInput, type NormalBalance } from "./types";

const MODULE_PATH = "/dashboard/admin/akuntansi";
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";

export type MutationResult = { ok: true } | { ok: false; error: string };

function validateManualJournal(input: ManualJournalInput): string | null {
  if (!input.entryDate) return "Tanggal jurnal wajib diisi.";
  if (!input.description?.trim()) return "Keterangan jurnal wajib diisi.";
  if (!Array.isArray(input.lines) || input.lines.length < 2) {
    return "Jurnal minimal punya 2 baris (debit dan kredit).";
  }
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of input.lines) {
    const debit = Math.round(Number(line.debit) || 0);
    const credit = Math.round(Number(line.credit) || 0);
    if (!line.accountCode) return "Setiap baris wajib memilih akun.";
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      return "Setiap baris cuma boleh isi salah satu: debit ATAU kredit, tidak dua-duanya atau kosong.";
    }
    totalDebit += debit;
    totalCredit += credit;
  }
  if (totalDebit !== totalCredit) {
    return `Jurnal tidak balance: total debit Rp${totalDebit.toLocaleString("id-ID")} vs kredit Rp${totalCredit.toLocaleString("id-ID")}.`;
  }
  return null;
}

/**
 * Input jurnal MANUAL -- untuk transaksi yang tidak lewat modul lain
 * (mis. setoran modal awal, koreksi saldo, penyusutan aset). Beda dari
 * posting otomatis invoice/event_expense, ini dipakai langsung oleh staf
 * Finance/Owner lewat halaman Akuntansi (Tahap F) -- makanya sengaja pakai
 * client Supabase biasa yang tunduk RLS "division = all", TIDAK perlu
 * SECURITY DEFINER seperti auto-posting event_expenses.
 */
export async function createManualJournalEntry(input: ManualJournalInput): Promise<MutationResult> {
  const validationError = validateManualJournal(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const codes = Array.from(new Set(input.lines.map((l) => l.accountCode)));
  const { data: accounts, error: accountsError } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code")
    .in("account_code", codes);

  if (accountsError) {
    console.error("[accounting] createManualJournalEntry: gagal ambil akun:", accountsError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const accountIdByCode = new Map((accounts ?? []).map((a) => [a.account_code, a.id]));
  const missing = codes.filter((c) => !accountIdByCode.has(c));
  if (missing.length > 0) {
    return { ok: false, error: `Kode akun tidak ditemukan: ${missing.join(", ")}` };
  }

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({
      entry_date: input.entryDate,
      description: input.description.trim(),
      source_type: "manual",
      division: input.division ?? null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (entryError || !entry) {
    console.error("[accounting] createManualJournalEntry: gagal buat entri:", entryError?.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const { error: linesError } = await supabase.from("journal_entry_lines").insert(
    input.lines.map((line) => ({
      journal_entry_id: entry.id,
      account_id: accountIdByCode.get(line.accountCode)!,
      debit: Math.round(Number(line.debit) || 0),
      credit: Math.round(Number(line.credit) || 0),
      notes: line.notes?.trim() || null,
    }))
  );

  if (linesError) {
    console.error("[accounting] createManualJournalEntry: gagal buat baris (jurnal tidak balance?):", linesError.message);
    await supabase.from("journal_entries").delete().eq("id", entry.id);
    return { ok: false, error: "Jurnal tidak balance atau data tidak valid — pastikan total debit sama dengan total kredit." };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "admin",
    action: "create",
    entityType: "jurnal akuntansi",
    entityLabel: input.description.trim(),
  });
  return { ok: true };
}

/**
 * Hapus jurnal MANUAL saja -- jurnal hasil auto-posting (invoice/event
 * expense) sengaja tidak bisa dihapus langsung dari sini; siklus hidupnya
 * ikut sumbernya (edit/hapus invoice atau event_expense itu sendiri).
 */
export async function deleteManualJournalEntry(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id, source_type, description")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Jurnal tidak ditemukan." };
  if (existing.source_type !== "manual") {
    return { ok: false, error: "Jurnal otomatis tidak bisa dihapus langsung — edit atau hapus data sumbernya." };
  }

  const { error } = await supabase.from("journal_entries").delete().eq("id", id);
  if (error) {
    console.error("[accounting] deleteManualJournalEntry gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "admin",
    action: "delete",
    entityType: "jurnal akuntansi",
    entityLabel: existing.description,
  });
  return { ok: true };
}


export type CreateAccountInput = {
  code: string;
  name: string;
  type: AccountType;
  subtype?: string;
  normalBalance: NormalBalance;
  description?: string;
};

/**
 * Tambah akun baru ke Daftar Akun (Tahap F) -- dipakai kalau akun bawaan
 * seed migrasi 0051 belum cukup (mis. buka rekening bank baru, kategori
 * beban baru). SENGAJA tidak ada validasi "kode harus mengikuti pola
 * 1-xxxx/2-xxxx dst" -- itu cuma konvensi penomoran, bukan aturan yang
 * ditegakkan database, supaya staf Finance tetap bebas menomori sesuai
 * kebutuhan mereka sendiri.
 */
export async function createAccount(input: CreateAccountInput): Promise<MutationResult> {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return { ok: false, error: "Kode akun wajib diisi." };
  if (!name) return { ok: false, error: "Nama akun wajib diisi." };
  if (!input.type) return { ok: false, error: "Tipe akun wajib dipilih." };
  if (!input.normalBalance) return { ok: false, error: "Saldo normal wajib dipilih." };

  const supabase = await createClient();
  const { error } = await supabase.from("chart_of_accounts").insert({
    account_code: code,
    account_name: name,
    account_type: input.type,
    account_subtype: input.subtype?.trim() || "",
    normal_balance: input.normalBalance,
    description: input.description?.trim() || null,
  });

  if (error) {
    console.error("[accounting] createAccount gagal:", error.message);
    if (error.code === "23505") {
      return { ok: false, error: `Kode akun "${code}" sudah dipakai akun lain.` };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "admin",
    action: "create",
    entityType: "daftar akun",
    entityLabel: `${code} — ${name}`,
  });
  return { ok: true };
}

/**
 * Aktifkan/nonaktifkan akun -- SENGAJA tidak ada hapus akun permanen dari
 * UI. Akun yang sudah pernah dipakai punya baris jurnal yang mereferensi
 * `account_id`-nya (FK ke journal_entry_lines); menghapus akun akan
 * merusak riwayat laporan lama. "Nonaktif" cukup menyembunyikan akun itu
 * dari pilihan akun BARU (form Jurnal Manual memfilter is_active) tanpa
 * mengubah satu pun data historis.
 */
export async function setAccountActive(id: string, isActive: boolean): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("chart_of_accounts")
    .select("account_code, account_name")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return { ok: false, error: "Akun tidak ditemukan." };
  }

  const { error } = await supabase.from("chart_of_accounts").update({ is_active: isActive }).eq("id", id);
  if (error) {
    console.error("[accounting] setAccountActive gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "admin",
    action: "update",
    entityType: "daftar akun",
    entityLabel: `${existing.account_code} — ${existing.account_name} (${isActive ? "diaktifkan" : "dinonaktifkan"})`,
  });
  return { ok: true };
}

/**
 * Hapus akun PERMANEN -- HANYA diizinkan kalau akun ini belum pernah
 * dipakai di satu baris jurnal pun (`journal_entry_lines.account_id`, FK
 * "NO ACTION" jadi database sendiri sebenarnya sudah menolak kalau masih
 * dipakai -- cek manual di sini cuma supaya pesan errornya jelas dalam
 * Bahasa Indonesia, bukan kode error Postgres mentah). Kalau sudah pernah
 * dipakai, tolak dan arahkan ke nonaktifkan (`setAccountActive`) saja --
 * lihat komentar di fungsi itu kenapa hapus paksa berbahaya untuk riwayat
 * laporan lama.
 */
export async function deleteAccount(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("chart_of_accounts")
    .select("account_code, account_name")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return { ok: false, error: "Akun tidak ditemukan." };
  }

  const { count, error: countError } = await supabase
    .from("journal_entry_lines")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id);

  if (countError) {
    console.error("[accounting] deleteAccount: gagal cek pemakaian:", countError.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Akun "${existing.account_code} — ${existing.account_name}" sudah dipakai di ${count} baris jurnal. Tidak bisa dihapus permanen -- nonaktifkan saja.`,
    };
  }

  const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
  if (error) {
    console.error("[accounting] deleteAccount gagal:", error.message);
    if (error.code === "23503") {
      return {
        ok: false,
        error: `Akun "${existing.account_code} — ${existing.account_name}" masih dipakai di data lain. Tidak bisa dihapus permanen -- nonaktifkan saja.`,
      };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "admin",
    action: "delete",
    entityType: "daftar akun",
    entityLabel: `${existing.account_code} — ${existing.account_name}`,
  });
  return { ok: true };
}
