"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity/log";
import type { PortalModule, PortalSummary } from "./types";

export type MutationResult = { ok: true } | { ok: false; error: string };
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";

const MODULE_PATHS: Record<PortalModule, string> = {
  magnative: "/dashboard/magnative",
  magnarent: "/dashboard/magnarent",
  production: "/dashboard/production",
};

/**
 * Dipanggil dari sisi STAF (login) untuk membuat link portal baru --
 * dipakai dari tombol "Bagikan ke Klien" di detail proyek/booking. Token
 * acak 24-byte hex (48 karakter) supaya praktis tidak bisa ditebak.
 */
export async function createPortalLink(input: {
  module: PortalModule;
  entityId: string;
  clientName?: string;
  expiresInDays?: number;
}): Promise<MutationResult & { token?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak valid, silakan login ulang." };

  const token = randomBytes(24).toString("hex");
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { error } = await supabase.from("client_portal_links").insert({
    token,
    module: input.module,
    entity_id: input.entityId,
    client_name: input.clientName ?? null,
    created_by: user.id,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("createPortalLink", error);
    return { ok: false, error: GENERIC_ERROR };
  }

  void logActivity({
    module: input.module,
    action: "create",
    entityType: "link portal klien",
    entityLabel: input.clientName ?? input.entityId,
  });

  revalidatePath(MODULE_PATHS[input.module]);
  return { ok: true, token };
}

/** Cabut/nonaktifkan link portal (mis. kalau salah kirim / proyek batal). */
export async function revokePortalLink(id: string, module: PortalModule): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("client_portal_links").update({ revoked: true }).eq("id", id);
  if (error) {
    console.error("revokePortalLink", error);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(MODULE_PATHS[module]);
  return { ok: true };
}

/** Daftar link portal yang pernah dibuat untuk satu entitas (proyek/booking) -- ditampilkan di panel "Bagikan ke Klien". */
export async function listPortalLinks(module: PortalModule, entityId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_portal_links")
    .select("id, token, client_name, created_at, expires_at, last_accessed_at, revoked")
    .eq("module", module)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listPortalLinks", error);
    return [];
  }
  return data ?? [];
}

/**
 * Dipanggil dari halaman publik `/portal/[token]` (TANPA login) -- pakai
 * admin client (service role) supaya bisa baca lintas tabel tanpa
 * terhalang RLS, tapi HANYA proyeksi field yang aman ditampilkan ke klien
 * (lihat komentar `PortalSummary` di types.ts). Token yang tidak
 * ketemu/revoked/kedaluwarsa mengembalikan `null` -- halaman menampilkan
 * pesan "link tidak valid" tanpa membocorkan alasan detail.
 */
export async function getPortalSummaryByToken(
  token: string
): Promise<{ summary: PortalSummary; clientName?: string } | null> {
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("client_portal_links")
    .select("id, module, entity_id, client_name, expires_at, revoked")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.revoked) return null;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return null;

  // Catat kapan terakhir link ini dibuka. Harus di-await: query builder
  // Supabase baru mengirim request saat di-await/then -- `void admin...`
  // dulu tidak pernah terkirim sehingga last_accessed_at selalu kosong.
  await admin
    .from("client_portal_links")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", link.id);

  const summary = await buildSummary(admin, link.module as PortalModule, link.entity_id);
  if (!summary) return null;

  return { summary, clientName: link.client_name ?? undefined };
}

async function buildSummary(
  admin: ReturnType<typeof createAdminClient>,
  module: PortalModule,
  entityId: string
): Promise<PortalSummary | null> {
  if (module === "magnative") {
    const { data: project } = await admin
      .from("magnative_projects")
      .select("id, name, type, tanggal_mulai, tanggal_selesai, status, status_pembayaran, budget, dp_amount, client_id")
      .eq("id", entityId)
      .maybeSingle();
    if (!project) return null;

    const { data: client } = await admin
      .from("magnative_clients")
      .select("name")
      .eq("id", project.client_id)
      .maybeSingle();

    const { data: invoiceRows } = await admin
      .from("invoices")
      .select("invoice_number, total, status, due_date, pdf_url")
      .eq("source_type", "magnative_project")
      .eq("source_id", entityId);

    return {
      module: "magnative",
      projectName: project.name,
      clientName: client?.name ?? "-",
      eventType: project.type,
      tanggalMulai: project.tanggal_mulai,
      tanggalSelesai: project.tanggal_selesai,
      status: project.status,
      statusPembayaran: project.status_pembayaran,
      budget: project.budget,
      dpAmount: project.dp_amount ?? 0,
      invoices: (invoiceRows ?? []).map((row) => ({
        invoiceNumber: row.invoice_number,
        total: row.total,
        status: row.status,
        dueDate: row.due_date ?? undefined,
        pdfUrl: row.pdf_url ?? undefined,
      })),
    };
  }

  if (module === "magnarent") {
    const { data: booking } = await admin
      .from("magnarent_bookings")
      .select("id, nama_klien, tanggal_mulai, tanggal_selesai, jumlah_unit, status, status_pembayaran, dp_amount")
      .eq("id", entityId)
      .maybeSingle();
    if (!booking) return null;

    const { data: deliveryRows } = await admin
      .from("magnarent_deliveries")
      .select("stage, driver_name, jadwal_tanggal, jadwal_jam, status")
      .eq("booking_id", entityId);

    return {
      module: "magnarent",
      bookingId: booking.id,
      clientName: booking.nama_klien,
      tanggalMulai: booking.tanggal_mulai,
      tanggalSelesai: booking.tanggal_selesai,
      jumlahUnit: booking.jumlah_unit,
      status: booking.status,
      statusPembayaran: booking.status_pembayaran,
      dpAmount: booking.dp_amount ?? 0,
      deliveries: (deliveryRows ?? []).map((row) => ({
        stage: row.stage,
        driverName: row.driver_name ?? undefined,
        jadwalTanggal: row.jadwal_tanggal ?? undefined,
        jadwalJam: row.jadwal_jam ?? undefined,
        status: row.status,
      })),
    };
  }

  const { data: project } = await admin
    .from("production_booth_projects")
    .select("id, name, nama_klien, lokasi_acara, tanggal_mulai, tanggal_instalasi, status, status_pembayaran, dp_amount")
    .eq("id", entityId)
    .maybeSingle();
  if (!project) return null;

  const { data: docRows } = await admin
    .from("production_project_documents")
    .select("file_name, file_url, file_type")
    .eq("project_id", entityId);

  return {
    module: "production",
    projectName: project.name,
    clientName: project.nama_klien,
    lokasiAcara: project.lokasi_acara,
    tanggalMulai: project.tanggal_mulai,
    tanggalInstalasi: project.tanggal_instalasi,
    status: project.status,
    statusPembayaran: project.status_pembayaran,
    dpAmount: project.dp_amount ?? 0,
    documents: (docRows ?? []).map((row) => ({
      fileName: row.file_name,
      fileUrl: row.file_url,
      fileType: row.file_type ?? undefined,
    })),
  };
}

/**
 * Klien tanda tangan lewat canvas di halaman portal publik (tanpa login).
 * IP diambil dari header `x-forwarded-for` (Vercel selalu mengisinya) --
 * bagian dari audit trail pengganti tanda tangan basah, sesuai keputusan
 * Owner untuk bangun e-signature in-house (bukan provider berbayar).
 */
export async function submitPortalSignature(input: {
  token: string;
  documentLabel: string;
  signerName: string;
  signerRole?: string;
  signatureDataUrl: string;
}): Promise<MutationResult> {
  if (!input.signerName?.trim()) return { ok: false, error: "Nama penanda tangan wajib diisi." };
  if (!input.signatureDataUrl?.startsWith("data:image/")) {
    return { ok: false, error: "Tanda tangan belum digambar." };
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("client_portal_links")
    .select("id, module, entity_id, revoked, expires_at")
    .eq("token", input.token)
    .maybeSingle();

  if (!link || link.revoked) return { ok: false, error: "Link portal tidak valid." };
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { ok: false, error: "Link portal sudah kedaluwarsa." };
  }

  const headerList = await headers();
  const ipAddress = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? undefined;
  const userAgent = headerList.get("user-agent") ?? undefined;

  const { error } = await admin.from("document_signatures").insert({
    module: link.module,
    entity_id: link.entity_id,
    document_label: input.documentLabel,
    signer_name: input.signerName,
    signer_role: input.signerRole ?? null,
    signature_data_url: input.signatureDataUrl,
    ip_address: ipAddress ?? null,
    user_agent: userAgent ?? null,
    portal_link_id: link.id,
  });

  if (error) {
    console.error("submitPortalSignature", error);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(MODULE_PATHS[link.module as PortalModule]);
  return { ok: true };
}

/** Dipakai dari sisi staf (mis. panel detail proyek) untuk melihat riwayat tanda tangan suatu entitas. */
export async function listSignatures(module: PortalModule, entityId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_signatures")
    .select("id, document_label, signer_name, signer_role, signed_at, signature_data_url")
    .eq("module", module)
    .eq("entity_id", entityId)
    .order("signed_at", { ascending: false });
  if (error) {
    console.error("listSignatures", error);
    return [];
  }
  return data ?? [];
}
