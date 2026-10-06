-- KEAMANAN (sweep QC 5 Okt 2026, diverifikasi): ke-15 bucket Storage punya
-- policy SELECT untuk role `public` (termasuk anon), sehingga siapa pun yang
-- memegang anon key publik bisa MEMBUAT DAFTAR semua file lewat
-- POST /storage/v1/object/list/<bucket> -- diuji: invoice-pdfs mengembalikan
-- file tanpa login. Nama file = path yang bisa langsung diunduh lewat URL
-- publik, jadi "path UUID acak" bukan lagi perlindungan: PDF invoice (data
-- klien, rekening, nominal), bukti transfer investor, lampiran chat, gambar
-- kerja, file proposal, dst.
--
-- URL publik (/storage/v1/object/public/...) TIDAK memakai RLS, jadi
-- tampilan foto/dokumen di aplikasi & portal klien tetap jalan. Policy
-- SELECT hanya dibutuhkan untuk list dan upload dengan upsert/remove dari
-- aplikasi, yang selalu dilakukan user login.
--
-- 1. Semua policy baca dibatasi ke role authenticated.
-- 2. invoice-pdfs hanya akses penuh & finance; capital-request-proofs hanya
--    investor & akses penuh (pihak yang mengunggah/menghapusnya).
alter policy "avatars_read" on storage.objects
  to authenticated
  using (bucket_id = 'avatars');
alter policy "chat_attachments_read" on storage.objects
  to authenticated
  using (bucket_id = 'chat-attachments');
alter policy "event_checklist_photos_read" on storage.objects
  to authenticated
  using (bucket_id = 'event-checklist-photos');
alter policy "event_expense_proofs_storage_read" on storage.objects
  to authenticated
  using (bucket_id = 'event-expense-proofs');
alter policy "magnarent_checks_read" on storage.objects
  to authenticated
  using (bucket_id = 'magnarent-checks');
alter policy "magnarent_gallery_read" on storage.objects
  to authenticated
  using (bucket_id = 'magnarent-gallery');
alter policy "magnative_assets_read" on storage.objects
  to authenticated
  using (bucket_id = 'magnative-assets');
alter policy "magnative_pipeline_files_read" on storage.objects
  to authenticated
  using (bucket_id = 'magnative-pipeline-files');
alter policy "magnative_portfolio_read" on storage.objects
  to authenticated
  using (bucket_id = 'magnative-portfolio');
alter policy "product_photos_read" on storage.objects
  to authenticated
  using (bucket_id = 'product-photos');
alter policy "production_checks_read" on storage.objects
  to authenticated
  using (bucket_id = 'production-checks');
alter policy "production_documentation_read" on storage.objects
  to authenticated
  using (bucket_id = 'production-documentation');
alter policy "production_drawings_read" on storage.objects
  to authenticated
  using (bucket_id = 'production-drawings');

alter policy "invoice_pdfs_read" on storage.objects
  to authenticated
  using (bucket_id = 'invoice-pdfs' and (public.current_user_division() = 'all' or public.current_user_is_finance()));
alter policy "capital_request_proofs_read" on storage.objects
  to authenticated
  using (bucket_id = 'capital-request-proofs' and (public.current_user_is_investor() or public.current_user_division() = 'all'));
