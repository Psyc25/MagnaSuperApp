import { NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { rowToCapitalRequest, type CapitalRequestRow } from "@/lib/capital-requests/mappers";
import { renderCapitalRequestReportPdf } from "@/lib/capital-requests/pdf";
import { todayISO } from "@/lib/shared/utils";

// @react-pdf/renderer butuh Node.js APIs (Buffer, dsb) — bukan Edge Runtime,
// sama seperti /api/invoices/[id]/pdf.
export const runtime = "nodejs";

/**
 * GET /api/investor/capital-requests/pdf — tombol "Unduh Laporan PDF" di
 * halaman Pengajuan Modal investor (Tahap 28d: "ekspor laporan PDF sendiri",
 * investor tidak perlu minta Admin buatkan). Dibatasi investor/akses penuh
 * saja (sama seperti `requireInvestorAccess` yang menjaga halamannya) —
 * endpoint API ini di luar layout dashboard jadi perlu jaga akses sendiri.
 * RLS `capital_requests_select_investor` (migrasi 0019) sudah membatasi
 * baris yang kebaca lewat `createClient()` biasa, tidak perlu service role.
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.division !== "investor" && profile.division !== "all")) {
    return NextResponse.json({ error: "Tidak punya akses." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("capital_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<CapitalRequestRow[]>();

  if (error) {
    console.error("[capital-requests] Gagal memuat data untuk laporan PDF:", error.message);
    return NextResponse.json({ error: "Gagal memuat data." }, { status: 500 });
  }

  const requests = (data ?? []).map(rowToCapitalRequest);
  const pdfBuffer = await renderCapitalRequestReportPdf(requests);
  const fileName = `laporan-pengajuan-modal-${todayISO()}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
