"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";
import { invoiceItemToRow, rowToInvoice, type InvoiceRow } from "./mappers";
import { renderInvoicePdf } from "./pdf";
import { triggerInvoiceWhatsAppWebhook } from "./whatsapp";
import { postInvoiceLunasJournal, deleteInvoiceJournal } from "@/lib/accounting/invoice-journal";
import type { Invoice, InvoiceDivision, InvoiceSourceType, InvoiceStatus } from "./types";
import { exceedsDbAmount, MAX_DB_AMOUNT_MESSAGE, todayISO } from "@/lib/shared/utils";

const MODULE_PATH = "/dashboard/admin/faktur";
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";
const PDF_BUCKET = "invoice-pdfs";
const VALID_DIVISIONS: InvoiceDivision[] = ["magnarent", "magnative", "production"];
const VALID_STATUSES: InvoiceStatus[] = ["Draft", "Terkirim", "Lunas"];

export type MutationResult = { ok: true } | { ok: false; error: string };
export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

export type InvoiceItemInput = {
  description: string;
  qty: number;
  unitPrice: number;
  qtyLabel?: string;
  unitLabel?: string;
  note?: string;
};

export type InvoiceFormInput = {
  division: InvoiceDivision;
  sourceType?: InvoiceSourceType;
  sourceId?: string;
  documentLabel?: string;
  picName?: string;
  picPhone?: string;
  clientName: string;
  clientPhone?: string;
  eventName?: string;
  eventLocation?: string;
  eventDateLabel?: string;
  loadingInfo?: string;
  durationLabel?: string;
  deliveryMethod?: string;
  items: InvoiceItemInput[];
  shippingCost?: number;
  depositAmount?: number;
  depositLabel?: string;
  bankName?: string;
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  paymentNote?: string;
  termsConditions?: string;
  issuedDate?: string;
  dueDate?: string;
  catatan?: string;
};

/**
 * Validasi + hitung ulang subtotal DI SERVER dari `items` yang dikirim
 * klien — jangan percaya subtotal/total yang (mungkin) dihitung di
 * browser, supaya angka di invoice yang tersimpan selalu konsisten dengan
 * baris item-nya sendiri. `qtyLabel`/`unitLabel`/`note` cuma presentasi,
 * diteruskan apa adanya tanpa masuk hitungan.
 */
type BuiltItems = { rows: ReturnType<typeof invoiceItemToRow>[]; subtotal: number };

function buildItemRows(items: InvoiceItemInput[]): BuiltItems | { error: string } {
  const EMPTY_ERROR = "Minimal satu baris item dengan deskripsi, qty, dan harga yang valid.";
  if (!Array.isArray(items) || items.length === 0) return { error: EMPTY_ERROR };

  const rows: ReturnType<typeof invoiceItemToRow>[] = [];
  let subtotal = 0;
  for (const [index, item] of items.entries()) {
    const description = item.description?.trim();
    const qty = Number(item.qty);
    const unitPrice = Number(item.unitPrice);
    // Baris yang benar-benar kosong (belum diisi) dilewati. Baris yang
    // terisi sebagian DITOLAK -- dulu ikut dilewati diam-diam, jadi total
    // invoice yang tersimpan & terkirim ke klien lebih kecil dari pratinjau.
    if (!description && !(Number(item.unitPrice) > 0)) continue;
    if (!description || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      return { error: `Baris item #${index + 1}: deskripsi, qty lebih dari 0, dan harga (0 atau lebih) wajib diisi.` };
    }
    const itemSubtotal = Math.round(qty * unitPrice);
    subtotal += itemSubtotal;
    rows.push(
      invoiceItemToRow({
        description,
        qty,
        unitPrice,
        subtotal: itemSubtotal,
        qtyLabel: item.qtyLabel?.trim() || undefined,
        unitLabel: item.unitLabel?.trim() || undefined,
        note: item.note?.trim() || undefined,
      })
    );
  }

  if (rows.length === 0) return { error: EMPTY_ERROR };
  return { rows, subtotal };
}

/**
 * Ongkos kirim & deposit DI SERVER juga — sama seperti item, jangan
 * percaya angka yang (mungkin) dihitung di browser. Ongkos kirim PENDAPATAN
 * riil (ikut `total`), deposit REFUNDABLE jadi SENGAJA dipisah dan tidak
 * pernah ikut `total`/jurnal akuntansi (lihat komentar di src/lib/invoices/
 * types.ts dan migrasi 0058_invoice_full_detail.sql).
 */
function sanitizeMoneyInput(value: number | undefined): number {
  const n = Math.round(Number(value) || 0);
  return n > 0 ? n : 0;
}

function validateInvoiceInput(input: InvoiceFormInput): string | null {
  if (!VALID_DIVISIONS.includes(input.division)) return "Divisi tidak valid.";
  if (!input.clientName?.trim()) return "Nama klien wajib diisi.";
  return null;
}

export async function createInvoice(input: InvoiceFormInput): Promise<CreateResult> {
  const validationError = validateInvoiceInput(input);
  if (validationError) return { ok: false, error: validationError };

  const built = buildItemRows(input.items);
  if ("error" in built) return { ok: false, error: built.error };

  const shippingCost = sanitizeMoneyInput(input.shippingCost);
  const depositAmount = sanitizeMoneyInput(input.depositAmount);
  // total = subtotal item + ongkos kirim (keduanya pendapatan riil).
  // depositAmount SENGAJA tidak ditambahkan ke sini — lihat komentar
  // sanitizeMoneyInput di atas.
  const total = built.subtotal + shippingCost;
  if (exceedsDbAmount(total, depositAmount)) return { ok: false, error: MAX_DB_AMOUNT_MESSAGE };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      division: input.division,
      source_type: input.sourceType ?? null,
      source_id: input.sourceId ?? null,
      document_label: input.documentLabel?.trim() || null,
      pic_name: input.picName?.trim() || null,
      pic_phone: input.picPhone?.trim() || null,
      client_name: input.clientName.trim(),
      client_phone: input.clientPhone?.trim() || null,
      event_name: input.eventName?.trim() || null,
      event_location: input.eventLocation?.trim() || null,
      event_date_label: input.eventDateLabel?.trim() || null,
      loading_info: input.loadingInfo?.trim() || null,
      duration_label: input.durationLabel?.trim() || null,
      delivery_method: input.deliveryMethod?.trim() || null,
      items: built.rows,
      subtotal: built.subtotal,
      shipping_cost: shippingCost,
      total,
      deposit_amount: depositAmount,
      deposit_label: input.depositLabel?.trim() || null,
      bank_name: input.bankName?.trim() || null,
      bank_account_holder: input.bankAccountHolder?.trim() || null,
      bank_account_number: input.bankAccountNumber?.trim() || null,
      payment_note: input.paymentNote?.trim() || null,
      terms_conditions: input.termsConditions?.trim() || null,
      // Tanggal WIB dari server -- default kolom (current_date) memakai jam UTC
      // database, jadi invoice 00:00-06:59 WIB dulu bertanggal kemarin.
      issued_date: input.issuedDate || todayISO(),
      due_date: input.dueDate || null,
      catatan: input.catatan?.trim() || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[invoices] createInvoice gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATH);
  void logActivity({ module: "admin", action: "create", entityType: "invoice", entityLabel: input.clientName });
  return { ok: true, id: data.id };
}

export async function updateInvoice(id: string, input: InvoiceFormInput): Promise<MutationResult> {
  const validationError = validateInvoiceInput(input);
  if (validationError) return { ok: false, error: validationError };

  const built = buildItemRows(input.items);
  if ("error" in built) return { ok: false, error: built.error };

  const shippingCost = sanitizeMoneyInput(input.shippingCost);
  const depositAmount = sanitizeMoneyInput(input.depositAmount);
  const total = built.subtotal + shippingCost;
  if (exceedsDbAmount(total, depositAmount)) return { ok: false, error: MAX_DB_AMOUNT_MESSAGE };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("invoices")
    .update({
      division: input.division,
      document_label: input.documentLabel?.trim() || null,
      pic_name: input.picName?.trim() || null,
      pic_phone: input.picPhone?.trim() || null,
      client_name: input.clientName.trim(),
      client_phone: input.clientPhone?.trim() || null,
      event_name: input.eventName?.trim() || null,
      event_location: input.eventLocation?.trim() || null,
      event_date_label: input.eventDateLabel?.trim() || null,
      loading_info: input.loadingInfo?.trim() || null,
      duration_label: input.durationLabel?.trim() || null,
      delivery_method: input.deliveryMethod?.trim() || null,
      items: built.rows,
      subtotal: built.subtotal,
      shipping_cost: shippingCost,
      total,
      deposit_amount: depositAmount,
      deposit_label: input.depositLabel?.trim() || null,
      bank_name: input.bankName?.trim() || null,
      bank_account_holder: input.bankAccountHolder?.trim() || null,
      bank_account_number: input.bankAccountNumber?.trim() || null,
      payment_note: input.paymentNote?.trim() || null,
      terms_conditions: input.termsConditions?.trim() || null,
      due_date: input.dueDate || null,
      catatan: input.catatan?.trim() || null,
    })
    .eq("id", id)
    .select("status, invoice_number, division, client_name, total, issued_date, created_by")
    .single();

  if (error || !updated) {
    console.error("[invoices] updateInvoice gagal:", error?.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Invoice yang sudah "Lunas" lalu diedit (mis. koreksi total) -- jurnal
  // yang sudah terlanjur diposting perlu diperbarui juga, kalau tidak
  // Laba-Rugi/Neraca nanti masih pakai angka lama. Lihat komentar di
  // postInvoiceLunasJournal (src/lib/accounting/actions.ts).
  if (updated.status === "Lunas") {
    // Di-await: di serverless, posting yang tidak ditunggu bisa terputus
    // setelah respons dikirim -> pendapatan hilang/terduplikasi.
    await postInvoiceLunasJournal({
      id,
      invoiceNumber: updated.invoice_number,
      division: updated.division,
      clientName: updated.client_name,
      total: updated.total,
      issuedDate: updated.issued_date,
      createdBy: updated.created_by,
    });
  }

  revalidatePath(MODULE_PATH);
  void logActivity({ module: "admin", action: "update", entityType: "invoice", entityLabel: input.clientName });
  return { ok: true };
}

export async function deleteInvoice(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: invoiceRow } = await supabase
    .from("invoices")
    .select("invoice_number, pdf_storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) {
    console.error("[invoices] deleteInvoice gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (invoiceRow?.pdf_storage_path) {
    await supabase.storage.from(PDF_BUCKET).remove([invoiceRow.pdf_storage_path]);
  }
  await deleteInvoiceJournal(id);
  revalidatePath(MODULE_PATH);
  void logActivity({ module: "admin", action: "delete", entityType: "invoice", entityLabel: invoiceRow?.invoice_number });
  return { ok: true };
}

export async function markInvoiceStatus(id: string, status: InvoiceStatus): Promise<MutationResult> {
  if (!VALID_STATUSES.includes(status)) return { ok: false, error: "Status tidak valid." };

  const supabase = await createClient();
  const { data: invoiceRow, error } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", id)
    .select("invoice_number, division, client_name, total, issued_date, created_by")
    .single();

  if (error) {
    console.error("[invoices] markInvoiceStatus gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // "Lunas" -- posting jurnal (Debit Bank, Kredit Pendapatan). Status
  // lain (termasuk mundur DARI "Lunas" karena koreksi kesalahan) -- hapus
  // jurnal yang sudah terlanjur ada, supaya tidak ada pendapatan tercatat
  // untuk invoice yang sebenarnya belum/tidak jadi lunas.
  if (status === "Lunas") {
    // Di-await: di serverless, posting yang tidak ditunggu bisa terputus
    // setelah respons dikirim -> pendapatan hilang/terduplikasi.
    await postInvoiceLunasJournal({
      id,
      invoiceNumber: invoiceRow.invoice_number,
      division: invoiceRow.division,
      clientName: invoiceRow.client_name,
      total: invoiceRow.total,
      issuedDate: invoiceRow.issued_date,
      createdBy: invoiceRow.created_by,
    });
  } else {
    await deleteInvoiceJournal(id);
  }

  revalidatePath(MODULE_PATH);
  void logActivity({
    module: "admin",
    action: "status_change",
    entityType: "invoice",
    entityLabel: invoiceRow?.invoice_number,
    detail: `status → ${status}`,
  });
  return { ok: true };
}

/**
 * Generate ulang PDF invoice, upload ke bucket `invoice-pdfs` (path
 * deterministik `${id}.pdf`, di-upsert supaya versi lama tertimpa kalau
 * invoice-nya diedit lalu dikirim ulang), lalu trigger webhook n8n supaya
 * WhatsApp bot Magnarent yang meneruskan PDF-nya ke GOWA di jaringan kantor.
 * Sukses mengirim otomatis menandai status invoice jadi "Terkirim" (kecuali
 * sudah "Lunas" — tidak boleh mundur ke "Terkirim").
 */
export async function sendInvoiceWhatsApp(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .returns<InvoiceRow[]>()
    .single();

  if (error || !row) {
    console.error("[invoices] sendInvoiceWhatsApp: invoice tidak ditemukan:", error?.message);
    return { ok: false, error: "Invoice tidak ditemukan." };
  }

  const invoice: Invoice = rowToInvoice(row);
  if (!invoice.clientPhone) {
    return { ok: false, error: "Nomor WhatsApp klien belum diisi di invoice ini." };
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderInvoicePdf(invoice);
  } catch (err) {
    console.error("[invoices] Gagal generate PDF:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Gagal membuat file PDF invoice." };
  }

  const storagePath = `${invoice.id}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    console.error("[invoices] Upload PDF gagal:", uploadError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PDF_BUCKET).getPublicUrl(storagePath);

  const webhookResult = await triggerInvoiceWhatsAppWebhook({
    phone: invoice.clientPhone,
    clientName: invoice.clientName,
    invoiceNumber: invoice.invoiceNumber,
    pdfUrl: publicUrl,
    total: invoice.total,
  });

  // URL PDF-nya tetap disimpan walau pengiriman webhook gagal — supaya
  // tombol "Download PDF"/percobaan kirim ulang berikutnya tidak perlu
  // generate ulang dari nol, dan staf bisa lihat linknya manual kalau perlu.
  await supabase
    .from("invoices")
    .update({
      pdf_url: publicUrl,
      pdf_storage_path: storagePath,
      ...(webhookResult.ok ? { status: invoice.status === "Lunas" ? "Lunas" : "Terkirim" } : {}),
    })
    .eq("id", id);

  // `revalidatePath` dipanggil di sini (sebelum cek webhook) karena update DB
  // di atas (pdf_url/pdf_storage_path) sudah terjadi apa pun hasil webhook-nya
  // — kalau ditaruh cuma di jalur sukses, halaman Faktur bisa nyangkut
  // menampilkan data lama (link PDF belum muncul) kalau webhook-nya gagal.
  revalidatePath(MODULE_PATH);

  if (!webhookResult.ok) {
    return { ok: false, error: webhookResult.error };
  }

  void logActivity({
    module: "admin",
    action: "status_change",
    entityType: "invoice",
    entityLabel: invoice.invoiceNumber,
    detail: `Dikirim ke WhatsApp ${invoice.clientPhone}`,
  });
  return { ok: true };
}
