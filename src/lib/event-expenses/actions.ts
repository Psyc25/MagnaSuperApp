"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity, type ActivityModule } from "@/lib/activity/log";
import { buildProofFileName } from "./naming";
import { rowToEventExpense, rowToExpenseProof, type EventExpenseProofRow, type EventExpenseRow } from "./mappers";
import type {
  EventExpense,
  ExpenseCategory,
  ExpenseDivision,
  ExpenseProof,
  ExpenseSourceType,
  ReimbursementStatus,
} from "./types";

const MODULE_PATH = "/dashboard/realisasi-event";
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";
const BUCKET = "event-expense-proofs";
/** Batas ukuran & tipe file bukti (perbaikan pasca-review) — sebelumnya
 * cuma dicek lewat `accept` di `<input type="file">`, yang cuma hint UI dan
 * gampang dilewati (upload langsung lewat DevTools/API). Divalidasi ulang
 * di sini supaya benar-benar ditegakkan. */
const MAX_PROOF_SIZE_BYTES = 10 * 1024 * 1024;
const LOAD_MORE_BATCH = 200;

export type MutationResult = { ok: true } | { ok: false; error: string };

/** activity_log.module (migrasi 0008) belum mengenal "finance" maupun
 * "event" (migrasi 0082) — keduanya dipetakan ke "admin" sebagai kategori
 * terdekat, sekadar label log, tidak memengaruhi akses/RLS event_expenses
 * itu sendiri. */
function toActivityModule(division: ExpenseDivision): ActivityModule {
  return division === "finance" || division === "event" ? "admin" : division;
}

export type AddEventExpenseInput = {
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
};

/** Divalidasi ulang di server — form UI sudah punya `required`, tapi Server
 * Action ini bisa dipanggil langsung sebagai fungsi. */
function validateExpenseInput(input: AddEventExpenseInput): string | null {
  if (!input.expenseDate) return "Tanggal pengeluaran wajib diisi.";
  if (!input.picName?.trim()) return "PIC yang mengeluarkan dana wajib diisi.";
  if (!input.paymentMethod?.trim()) return "Metode pembayaran wajib diisi.";
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Nominal harus lebih dari 0.";
  if (input.sourceType !== "umum" && !input.sourceId) {
    return 'Pilih event/proyek terkait, atau pilih "Finance/Umum" kalau tidak terikat event.';
  }
  return null;
}

export async function addEventExpense(
  input: AddEventExpenseInput
): Promise<{ ok: true; expense: EventExpense } | { ok: false; error: string }> {
  const validationError = validateExpenseInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("event_expenses")
    .insert({
      // Siapa yang MEMASUKKAN data (beda dari pic_name = siapa yang
      // membayar); ikut disalin ke jurnal otomatis oleh post_event_expense_journal.
      created_by: user?.id ?? null,
      expense_date: input.expenseDate,
      division: input.division,
      source_type: input.sourceType,
      source_id: input.sourceType === "umum" ? null : input.sourceId,
      category: input.category,
      amount: Math.round(input.amount),
      pic_name: input.picName.trim(),
      payment_method: input.paymentMethod.trim(),
      reimbursement_status: input.reimbursementStatus,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single<EventExpenseRow>();

  if (error || !data) {
    console.error("[event-expenses] addEventExpense gagal:", error?.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Posting jurnal otomatis (Tahap B modul Akuntansi, migrasi 0052) --
  // best-effort, tidak membatalkan pencatatan pengeluaran ini kalau
  // gagal. Dibungkus SECURITY DEFINER karena modul ini dipakai staf non-
  // Finance juga (lihat komentar fungsinya di migrasi 0052).
  // Di-await (bukan fire-and-forget): di serverless, promise yang tidak
  // ditunggu bisa terputus begitu respons dikirim -> jurnal tidak terposting.
  const { error: rpcError } = await supabase.rpc("post_event_expense_journal", { p_expense_id: data.id });
  if (rpcError) console.error("[event-expenses] post_event_expense_journal gagal:", rpcError.message);

  revalidatePath(MODULE_PATH);
  void logActivity({
    module: toActivityModule(input.division),
    action: "create",
    entityType: "realisasi event",
    entityLabel: `${input.category} — Rp${Math.round(input.amount).toLocaleString("id-ID")}`,
  });
  return { ok: true, expense: rowToEventExpense(data, []) };
}

/**
 * Edit pengeluaran yang sudah tersimpan (perbaikan pasca-review — sebelumnya
 * cuma bisa hapus lalu catat ulang kalau ada salah input, yang juga ikut
 * menghapus bukti yang sudah diunggah). Bukti transaksi SENGAJA tidak
 * disentuh di sini — dikelola terpisah lewat `addExpenseProof`/
 * `deleteExpenseProof` (lihat `EventExpenseFormModal.tsx` mode edit),
 * supaya klik "Simpan Perubahan" tidak pernah tidak sengaja menghapus bukti
 * yang sudah ada.
 */
export async function updateEventExpense(
  id: string,
  input: AddEventExpenseInput
): Promise<{ ok: true; expense: EventExpense } | { ok: false; error: string }> {
  const validationError = validateExpenseInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();

  const { data: existingProofRows } = await supabase
    .from("event_expense_proofs")
    .select("*")
    .eq("expense_id", id)
    .returns<EventExpenseProofRow[]>();

  const { data, error } = await supabase
    .from("event_expenses")
    .update({
      expense_date: input.expenseDate,
      division: input.division,
      source_type: input.sourceType,
      source_id: input.sourceType === "umum" ? null : input.sourceId,
      category: input.category,
      amount: Math.round(input.amount),
      pic_name: input.picName.trim(),
      payment_method: input.paymentMethod.trim(),
      reimbursement_status: input.reimbursementStatus,
      notes: input.notes?.trim() || null,
    })
    .eq("id", id)
    .select("*")
    .single<EventExpenseRow>();

  if (error || !data) {
    console.error("[event-expenses] updateEventExpense gagal:", error?.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Re-posting jurnal dari data terbaru (fungsi ini menghapus jurnal lama
  // untuk expense ini dulu sebelum buat yang baru) -- lihat komentar di
  // addEventExpense di atas.
  // Di-await (bukan fire-and-forget): di serverless, promise yang tidak
  // ditunggu bisa terputus begitu respons dikirim -> jurnal tidak terposting.
  const { error: rpcError } = await supabase.rpc("post_event_expense_journal", { p_expense_id: id });
  if (rpcError) console.error("[event-expenses] post_event_expense_journal (update) gagal:", rpcError.message);

  revalidatePath(MODULE_PATH);
  void logActivity({
    module: toActivityModule(input.division),
    action: "update",
    entityType: "realisasi event",
    entityLabel: `${input.category} — Rp${Math.round(input.amount).toLocaleString("id-ID")}`,
  });

  const proofs = (existingProofRows ?? [])
    .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))
    .map(rowToExpenseProof);
  return { ok: true, expense: rowToEventExpense(data, proofs) };
}

export async function deleteEventExpense(id: string): Promise<MutationResult> {
  const supabase = await createClient();

  const [{ data: proofRows }, { data: expenseRow }] = await Promise.all([
    supabase.from("event_expense_proofs").select("storage_path").eq("expense_id", id),
    supabase.from("event_expenses").select("category, amount, division").eq("id", id).maybeSingle<{
      category: string;
      amount: number;
      division: ExpenseDivision;
    }>(),
  ]);

  const { error } = await supabase.from("event_expenses").delete().eq("id", id);
  if (error) {
    console.error("[event-expenses] deleteEventExpense gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Baris `event_expense_proofs` sudah ikut terhapus lewat "on delete
  // cascade" (migrasi 0049) — file di Storage-nya tidak otomatis ikut
  // terhapus (Storage bukan bagian dari transaksi Postgres), jadi
  // dibersihkan manual di sini supaya tidak jadi file yatim piatu.
  const paths = (proofRows ?? []).map((p) => p.storage_path).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths);
  }

  // Di-await (bukan fire-and-forget): di serverless, promise yang tidak
  // ditunggu bisa terputus begitu respons dikirim -> jurnal tidak terposting.
  const { error: rpcError } = await supabase.rpc("delete_event_expense_journal", { p_expense_id: id });
  if (rpcError) console.error("[event-expenses] delete_event_expense_journal gagal:", rpcError.message);

  revalidatePath(MODULE_PATH);
  if (expenseRow) {
    void logActivity({
      module: toActivityModule(expenseRow.division),
      action: "delete",
      entityType: "realisasi event",
      entityLabel: `${expenseRow.category} — Rp${Number(expenseRow.amount).toLocaleString("id-ID")}`,
    });
  }
  return { ok: true };
}

/**
 * Upload SATU file bukti — dipanggil sekali per file dari form kalau user
 * pilih lebih dari satu bukti sekaligus (loop di client, bukan satu
 * FormData berisi banyak file), supaya kalau salah satu gagal, yang lain
 * tetap tersimpan dan errornya jelas menunjuk file yang mana.
 *
 * Urutan upload-lalu-insert (bukan sebaliknya) sengaja dipilih, pola sama
 * dengan `addPortfolioPhoto` (src/lib/magnative/actions.ts) — kalau insert
 * baris metadata gagal, file yang sudah terlanjur ter-upload langsung
 * dibersihkan supaya tidak ada file yatim piatu di bucket.
 */
export async function addExpenseProof(
  formData: FormData
): Promise<{ ok: true; proof: ExpenseProof } | { ok: false; error: string }> {
  const supabase = await createClient();
  const file = formData.get("file");
  const expenseId = String(formData.get("expenseId") ?? "");
  const picName = String(formData.get("picName") ?? "");
  const expenseDate = String(formData.get("expenseDate") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const note = String(formData.get("note") ?? "");
  const index = Number(formData.get("index") ?? 1);

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pilih file bukti terlebih dahulu." };
  }
  if (!expenseId) {
    return { ok: false, error: "Pengeluaran tidak ditemukan." };
  }
  if (file.size > MAX_PROOF_SIZE_BYTES) {
    return { ok: false, error: "Ukuran file bukti maksimal 10MB." };
  }
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return { ok: false, error: "Format file tidak didukung — gunakan foto (JPG/PNG/HEIC) atau PDF." };
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop()! : "jpg";
  const displayName = buildProofFileName({ picName, expenseDate, amount, note, index, extension: ext });
  const storagePath = `${crypto.randomUUID()}.${ext.toLowerCase()}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined });

  if (uploadError) {
    console.error("[event-expenses] Upload bukti gagal:", uploadError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data, error: insertError } = await supabase
    .from("event_expense_proofs")
    .insert({ expense_id: expenseId, file_url: publicUrl, storage_path: storagePath, file_name: displayName })
    .select("*")
    .single<EventExpenseProofRow>();

  if (insertError || !data) {
    console.error("[event-expenses] Simpan data bukti gagal:", insertError?.message);
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  return { ok: true, proof: rowToExpenseProof(data) };
}

export async function deleteExpenseProof(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("event_expense_proofs")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle<{ storage_path: string }>();

  const { error } = await supabase.from("event_expense_proofs").delete().eq("id", id);
  if (error) {
    console.error("[event-expenses] deleteExpenseProof gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (row?.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
  }

  revalidatePath(MODULE_PATH);
  return { ok: true };
}

/**
 * Muat pengeluaran yang lebih lama (perbaikan pasca-review) — halaman
 * awalnya cuma menampilkan 500 baris terbaru (`getEventExpensesPageData`,
 * lihat komentar Tahap 14 di sana) tanpa cara melihat sisanya begitu data
 * bertambah banyak. Dipanggil dari tombol "Muat Lebih Banyak" di
 * `EventExpenseManager.tsx` dengan `offset` = jumlah baris yang sudah
 * ditampilkan; urutannya harus identik dengan query awal (expense_date
 * desc) supaya tidak ada baris yang terlewat/dobel.
 */
export async function loadMoreEventExpenses(
  offset: number
): Promise<{ ok: true; expenses: EventExpense[]; hasMore: boolean } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("event_expenses")
    .select("*")
    .order("expense_date", { ascending: false })
    .range(offset, offset + LOAD_MORE_BATCH - 1)
    .returns<EventExpenseRow[]>();

  if (error) {
    console.error("[event-expenses] loadMoreEventExpenses gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const ids = (rows ?? []).map((r) => r.id);
  const { data: proofRows } =
    ids.length > 0
      ? await supabase.from("event_expense_proofs").select("*").in("expense_id", ids).returns<EventExpenseProofRow[]>()
      : { data: [] as EventExpenseProofRow[] };

  const proofsByExpense = new Map<string, EventExpenseProofRow[]>();
  for (const proof of proofRows ?? []) {
    const list = proofsByExpense.get(proof.expense_id) ?? [];
    list.push(proof);
    proofsByExpense.set(proof.expense_id, list);
  }

  const expenses = (rows ?? []).map((row) =>
    rowToEventExpense(
      row,
      (proofsByExpense.get(row.id) ?? [])
        .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))
        .map(rowToExpenseProof)
    )
  );

  return { ok: true, expenses, hasMore: expenses.length === LOAD_MORE_BATCH };
}
