-- STATUS: BELUM DITERAPKAN. Penerapan ke production ditolak Owner saat
-- dijalankan (6 Okt 2026), jadi file ini sengaja di luar supabase/migrations
-- supaya repo tetap sama dengan production. Sudah diuji di database hasil
-- rebuild. Kalau disetujui: pindahkan ke supabase/migrations/ (nomor
-- berikutnya) lalu jalankan di Supabase SQL Editor.
--
-- Pengetatan RLS dari sweep QC 5 Okt 2026 (diverifikasi dengan membaca kode
-- pemanggil):
--
-- 1. client_portal_links: policy lama mengizinkan SEMUA user login (termasuk
--    investor & divisi lain) membaca token portal klien lintas modul -- token
--    itu membuka data proyek/booking lewat service role di /portal/<token> --
--    serta mengubah/menghidupkan lagi link yang sudah dicabut. Sekarang hanya
--    divisi modulnya (can_access_division mencakup akses penuh).
-- 2. document_signatures: tanda tangan klien ditulis lewat service role dari
--    portal (src/lib/portal/actions.ts); staf cukup membaca riwayatnya.
--    Dulu semua user login bisa menyisipkan tanda tangan palsu atau
--    menghapus yang asli. Tulis/hapus kini hanya akses penuh; baca per modul.
-- 3. capital_requests: akses penuh dulu bisa mengubah baris SETELAH investor
--    memutuskan (memalsukan persetujuan, menaikkan nominal yang sudah
--    disetujui) atau menghapusnya. Keputusan & bukti transfer hanya lewat
--    RPC SECURITY DEFINER (decide_capital_request,
--    set_capital_request_payment_proof), jadi edit/hapus langsung kini dibatasi
--    ke pengajuan yang masih "Menunggu".
-- 4. invoice-pdfs (Storage): finance boleh membuka halaman Faktur tapi
--    upload/hapus PDF ditolak RLS ("Kirim ke WhatsApp" gagal). Disamakan
--    dengan policy baca di 0095.
alter policy "staff_full_access_portal_links" on public.client_portal_links
  using ((select public.can_access_division(module)))
  with check ((select public.can_access_division(module)));

alter policy "staff_full_access_signatures" on public.document_signatures
  using ((select public.current_user_division()) = 'all')
  with check ((select public.current_user_division()) = 'all');
create policy "document_signatures_select_module" on public.document_signatures
  for select to authenticated
  using ((select public.can_access_division(module)));

alter policy "capital_requests_update" on public.capital_requests
  using (public.current_user_division() = 'all' and status = 'Menunggu')
  with check (public.current_user_division() = 'all' and status = 'Menunggu' and decided_by is null and decided_at is null);
alter policy "capital_requests_delete" on public.capital_requests
  using (public.current_user_division() = 'all' and status = 'Menunggu');

alter policy "invoice_pdfs_insert" on storage.objects
  to authenticated
  with check (bucket_id = 'invoice-pdfs' and (public.current_user_division() = 'all' or public.current_user_is_finance()));
alter policy "invoice_pdfs_update" on storage.objects
  to authenticated
  using (bucket_id = 'invoice-pdfs' and (public.current_user_division() = 'all' or public.current_user_is_finance()));
alter policy "invoice_pdfs_delete" on storage.objects
  to authenticated
  using (bucket_id = 'invoice-pdfs' and (public.current_user_division() = 'all' or public.current_user_is_finance()));
