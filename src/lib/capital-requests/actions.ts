"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { notifyDivision } from "@/lib/push/notify";
import { logActivity } from "@/lib/activity/log";
import { exceedsDbAmount, formatRupiah, MAX_DB_AMOUNT_MESSAGE } from "@/lib/shared/utils";
import type { CapitalRequestStatus } from "./types";

const ADMIN_PATH = "/dashboard/admin/pengajuan-modal";
const INVESTOR_PATH = "/dashboard/investor/pengajuan-modal";
const GENERIC_ERROR = "Terjadi kesalahan, coba lagi.";
const PROOF_BUCKET = "capital-request-proofs";

export type MutationResult = { ok: true } | { ok: false; error: string };

export type NewCapitalRequestInput = {
  eventName: string;
  location: string;
  eventDate?: string;
  billingEstimate: number;
  modalEstimate: number;
};

/**
 * HANYA akses penuh (Owner/Finance/Admin) yang boleh mengajukan modal —
 * sesuai rancangan, pengajuan ini datang dari Owner, bukan staf per divisi.
 * Begitu tersimpan, investor langsung dapat notifikasi push untuk memutuskan.
 */
export async function addCapitalRequest(input: NewCapitalRequestInput): Promise<MutationResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "all") {
    return { ok: false, error: "Hanya akun akses penuh yang bisa mengajukan modal." };
  }

  // Divalidasi ulang di server — form di UI sudah punya `required`/`min`,
  // tapi Server Action ini bisa dipanggil langsung sebagai fungsi (bukan
  // cuma lewat submit form biasa), jadi validasi HTML saja tidak cukup.
  const eventName = input.eventName?.trim();
  const location = input.location?.trim();
  if (!eventName || !location) {
    return { ok: false, error: "Nama event dan lokasi wajib diisi." };
  }
  if (
    !Number.isFinite(input.billingEstimate) ||
    input.billingEstimate < 0 ||
    !Number.isFinite(input.modalEstimate) ||
    input.modalEstimate < 0
  ) {
    return { ok: false, error: "Perkiraan Billing dan Modal harus angka 0 atau lebih." };
  }
  if (exceedsDbAmount(input.billingEstimate, input.modalEstimate)) return { ok: false, error: MAX_DB_AMOUNT_MESSAGE };

  const supabase = await createClient();
  const { error } = await supabase.from("capital_requests").insert({
    event_name: eventName,
    location,
    event_date: input.eventDate || null,
    billing_estimate: input.billingEstimate,
    modal_estimate: input.modalEstimate,
    submitted_by: profile.id,
  });

  if (error) {
    console.error("[capital-requests] addCapitalRequest gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(INVESTOR_PATH);
  void logActivity({
    module: "admin",
    action: "create",
    entityType: "pengajuan modal",
    entityLabel: eventName,
    detail: `Billing ${formatRupiah(input.billingEstimate)}, Modal ${formatRupiah(input.modalEstimate)}`,
  });
  void notifyDivision(["investor"], {
    title: "Pengajuan Modal Baru",
    body: `${eventName} — Billing ${formatRupiah(input.billingEstimate)} / Modal ${formatRupiah(input.modalEstimate)}`,
    url: INVESTOR_PATH,
  });

  return { ok: true };
}

/**
 * HANYA boleh menghapus pengajuan yang masih "Menunggu" — begitu investor
 * sudah memutuskan (Disetujui/Ditolak), keputusan itu jadi jejak permanen,
 * sama seperti alasan `production_purchase_orders` tidak bisa dihapus
 * setelah "Diterima" (migrasi 0018).
 */
export async function deleteCapitalRequest(id: string): Promise<MutationResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "all") {
    return { ok: false, error: "Hanya akun akses penuh yang bisa menghapus pengajuan." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("capital_requests")
    .select("event_name, status")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: "Pengajuan ini sudah tidak ada — mungkin sudah dihapus lebih dulu." };
  }
  if (existing.status !== "Menunggu") {
    return { ok: false, error: "Pengajuan yang sudah diputuskan investor tidak bisa dihapus." };
  }

  const { error } = await supabase.from("capital_requests").delete().eq("id", id);
  if (error) {
    console.error("[capital-requests] deleteCapitalRequest gagal:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(INVESTOR_PATH);
  void logActivity({
    module: "admin",
    action: "delete",
    entityType: "pengajuan modal",
    entityLabel: existing?.event_name,
  });

  return { ok: true };
}

/**
 * Keputusan investor (Approve/Reject + catatan) — dieksekusi lewat fungsi
 * database `decide_capital_request` (migrasi 0019) yang mengunci baris &
 * mengecek ulang divisi di server, supaya tidak bisa diputuskan dua kali
 * atau dipanggil orang yang bukan investor walau lolos dari UI.
 *
 * Begitu disetujui, staf operasional (Magnarent/Magnative/Production) dapat
 * notifikasi pengumuman biasa untuk bersiap — mereka TIDAK ikut memutuskan,
 * sesuai rancangan Owner.
 */
/**
 * Keputusan investor, dengan opsi langsung melampirkan bukti pembayaran
 * (Tahap 28d) kalau statusnya "Disetujui" — `proofFormData` opsional karena
 * Owner kadang baru transfer belakangan, investor tetap harus bisa Approve
 * dulu tanpa bukti. Kegagalan upload bukti SENGAJA tidak membatalkan
 * keputusan yang sudah tersimpan (sama seperti `notifyDivision`/`logActivity`
 * — efek samping, bukan bagian inti aksi ini); investor tinggal coba lagi
 * lewat `uploadCapitalRequestProof` dari kartu "Riwayat Keputusan".
 */
export async function decideCapitalRequest(
  id: string,
  status: CapitalRequestStatus,
  note: string,
  proofFormData?: FormData
): Promise<MutationResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "investor") {
    return { ok: false, error: "Hanya akun investor yang bisa memutuskan pengajuan modal." };
  }
  if (status !== "Disetujui" && status !== "Ditolak") {
    return { ok: false, error: "Status tidak valid." };
  }

  const supabase = await createClient();
  const { data: requestRow } = await supabase
    .from("capital_requests")
    .select("event_name, location, event_date")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.rpc("decide_capital_request", {
    request_id: id,
    new_status: status,
    note: note.trim() || null,
  });

  if (error) {
    console.error("[capital-requests] decideCapitalRequest gagal:", error.message);
    return { ok: false, error: error.message || GENERIC_ERROR };
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(INVESTOR_PATH);
  void logActivity({
    module: "admin",
    action: "status_change",
    entityType: "pengajuan modal",
    entityLabel: requestRow?.event_name,
    detail: `status → ${status}${note.trim() ? `, catatan: ${note.trim()}` : ""}`,
  });

  if (status === "Disetujui" && requestRow) {
    const tanggal = requestRow.event_date ? ` (${requestRow.event_date})` : " (tanggal menyusul)";
    void notifyDivision(["magnarent", "magnative", "production"], {
      title: "Event Baru Disetujui — Siap-siap!",
      body: `${requestRow.event_name}${tanggal} di ${requestRow.location} sudah disetujui investor, segera persiapan.`,
      url: "/dashboard",
    });
  }

  const proofFile = status === "Disetujui" ? proofFormData?.get("proof") : null;
  if (proofFile instanceof File && proofFile.size > 0) {
    if (!proofFile.type.startsWith("image/") && proofFile.type !== "application/pdf") {
      console.error("[capital-requests] Bukti pembayaran dilewati: tipe file tidak didukung.");
    } else {
      const ext = proofFile.name.includes(".") ? proofFile.name.split(".").pop()!.toLowerCase() : "jpg";
      const storagePath = `${id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(PROOF_BUCKET)
        .upload(storagePath, proofFile, { contentType: proofFile.type || undefined });

      if (uploadError) {
        console.error("[capital-requests] Upload bukti pembayaran gagal:", uploadError.message);
      } else {
        const {
          data: { publicUrl },
        } = supabase.storage.from(PROOF_BUCKET).getPublicUrl(storagePath);
        const { error: attachError } = await supabase.rpc("set_capital_request_payment_proof", {
          request_id: id,
          proof_url: publicUrl,
          proof_path: storagePath,
        });
        if (attachError) {
          console.error("[capital-requests] Menempelkan bukti pembayaran gagal:", attachError.message);
          await supabase.storage.from(PROOF_BUCKET).remove([storagePath]);
        } else {
          // Posting jurnal otomatis (migrasi 0084) -- baru di titik INI dana
          // investor benar-benar dianggap diterima (bukti pembayaran sudah
          // dilampirkan), bukan saat status cuma berubah "Disetujui" (lihat
          // komentar fungsi ini di atas). Best-effort, sama seperti
          // post_event_expense_journal di event-expenses/actions.ts.
          // Di-await (bukan fire-and-forget): di serverless, promise yang tidak
          // ditunggu bisa terputus begitu respons dikirim -> jurnal tidak terposting.
          const { error: rpcError } = await supabase.rpc("post_capital_request_journal", { p_request_id: id });
          if (rpcError) console.error("[capital-requests] post_capital_request_journal gagal:", rpcError.message);
          revalidatePath(ADMIN_PATH);
          revalidatePath(INVESTOR_PATH);
        }
      }
    }
  }

  return { ok: true };
}

/**
 * Unggah/ganti bukti pembayaran untuk pengajuan yang SUDAH disetujui —
 * dipakai dari kartu "Riwayat Keputusan" saat investor belum sempat
 * melampirkan bukti waktu Approve, atau salah unggah dan mau ganti file.
 * Bukti lama (kalau ada) dihapus dari Storage setelah yang baru berhasil
 * ditempelkan, supaya tidak ada file yatim menumpuk di bucket.
 */
export async function uploadCapitalRequestProof(id: string, formData: FormData): Promise<MutationResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "investor") {
    return { ok: false, error: "Hanya akun investor yang bisa mengunggah bukti pembayaran." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("capital_requests")
    .select("status, event_name, payment_proof_storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (existing.status !== "Disetujui") {
    return { ok: false, error: "Bukti pembayaran hanya bisa diunggah untuk pengajuan yang sudah disetujui." };
  }

  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pilih file terlebih dahulu." };
  }
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return { ok: false, error: "File harus berupa gambar atau PDF." };
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
  const storagePath = `${id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined });

  if (uploadError) {
    console.error("[capital-requests] Upload bukti pembayaran gagal:", uploadError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PROOF_BUCKET).getPublicUrl(storagePath);

  const { error } = await supabase.rpc("set_capital_request_payment_proof", {
    request_id: id,
    proof_url: publicUrl,
    proof_path: storagePath,
  });

  if (error) {
    console.error("[capital-requests] uploadCapitalRequestProof gagal:", error.message);
    await supabase.storage.from(PROOF_BUCKET).remove([storagePath]);
    return { ok: false, error: error.message || GENERIC_ERROR };
  }

  if (existing.payment_proof_storage_path) {
    await supabase.storage.from(PROOF_BUCKET).remove([existing.payment_proof_storage_path]);
  }

  // Posting jurnal otomatis (migrasi 0084) — lihat komentar di
  // decideCapitalRequest; fungsi ini idempotent (hapus jurnal lama dulu
  // sebelum buat yang baru), jadi aman dipanggil lagi kalau bukti diganti.
  // Di-await (bukan fire-and-forget): di serverless, promise yang tidak
  // ditunggu bisa terputus begitu respons dikirim -> jurnal tidak terposting.
  const { error: rpcError } = await supabase.rpc("post_capital_request_journal", { p_request_id: id });
  if (rpcError) console.error("[capital-requests] post_capital_request_journal gagal:", rpcError.message);

  revalidatePath(ADMIN_PATH);
  revalidatePath(INVESTOR_PATH);
  void logActivity({
    module: "admin",
    action: "update",
    entityType: "pengajuan modal",
    entityLabel: existing.event_name,
    detail: "bukti pembayaran diunggah",
  });

  return { ok: true };
}

/** Hapus bukti pembayaran yang sudah diunggah — investor salah lampir file. */
export async function removeCapitalRequestProof(id: string): Promise<MutationResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "investor") {
    return { ok: false, error: "Hanya akun investor yang bisa menghapus bukti pembayaran." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("capital_requests")
    .select("payment_proof_storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!existing?.payment_proof_storage_path) return { ok: true };

  const { error } = await supabase.rpc("set_capital_request_payment_proof", {
    request_id: id,
    proof_url: null,
    proof_path: null,
  });

  if (error) {
    console.error("[capital-requests] removeCapitalRequestProof gagal:", error.message);
    return { ok: false, error: error.message || GENERIC_ERROR };
  }

  // Bukti dilepas = dana dianggap belum/tidak terbukti diterima, jadi
  // jurnal yang sudah terposting (migrasi 0084) harus ikut dibalik.
  // Di-await (bukan fire-and-forget): di serverless, promise yang tidak
  // ditunggu bisa terputus begitu respons dikirim -> jurnal tidak terposting.
  const { error: rpcError } = await supabase.rpc("delete_capital_request_journal", { p_request_id: id });
  if (rpcError) console.error("[capital-requests] delete_capital_request_journal gagal:", rpcError.message);

  await supabase.storage.from(PROOF_BUCKET).remove([existing.payment_proof_storage_path]);
  revalidatePath(ADMIN_PATH);
  revalidatePath(INVESTOR_PATH);
  return { ok: true };
}

/** Dipakai layout /dashboard/investor untuk menolak akses selain investor/akses penuh. */
export async function requireInvestorAccess() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.division !== "investor" && profile.division !== "all")) {
    redirect("/dashboard");
  }
  return profile;
}
