import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { rowToInvoice, type InvoiceRow } from "@/lib/invoices/mappers";
import { renderInvoicePdf } from "@/lib/invoices/pdf";

// @react-pdf/renderer butuh Node.js APIs (Buffer, dsb) — bukan Edge Runtime.
export const runtime = "nodejs";

/**
 * GET /api/invoices/:id/pdf — untuk tombol "Download PDF" di halaman
 * Faktur (staf yang login, sesi cookie biasa lewat `createClient()`, BUKAN
 * jalur API key seperti `/api/products`). PDF di-generate on-demand di sini,
 * tidak disimpan — beda dengan file yang diupload ke Storage saat "Kirim
 * WA" (lihat `sendInvoiceWhatsApp` di src/lib/invoices/actions.ts), yang
 * memang butuh URL publik untuk dipakai n8n/GOWA.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  // Finance boleh membuka halaman Faktur (middleware & page.tsx), jadi juga
  // boleh mengunduh PDF-nya -- dulu dapat 403.
  if (!profile || (profile.division !== "all" && profile.division !== "finance")) {
    return NextResponse.json({ error: "Tidak punya akses." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .returns<InvoiceRow[]>()
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "Invoice tidak ditemukan." }, { status: 404 });
  }

  const invoice = rowToInvoice(row);
  const pdfBuffer = await renderInvoicePdf(invoice);
  const fileName = `${invoice.invoiceNumber.replace(/\//g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
