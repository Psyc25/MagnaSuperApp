-- ============================================================================
-- DIPULIHKAN DARI PRODUCTION (audit migrasi 5 Okt 2026).
-- Migrasi ini SUDAH TERPASANG di production sejak versi 20260916043434 (nama di
-- supabase_migrations.schema_migrations: "revoke_anon_execute_sensitive_functions"), tapi filenya tidak
-- pernah masuk repo -- akibatnya repo tidak bisa membangun ulang database.
-- Isi di bawah garis adalah salinan VERBATIM statements[1] dari production
-- (md5 9fc6c193e145aca511ef2c051d5d2f76). Diberi nomor 0044a supaya urutannya sama dengan
-- urutan penerapan di production (sesudah 0044, sebelum 0045).
-- JANGAN dijalankan ulang di production.
-- ============================================================================
-- Tahap 45 lanjutan: cabut akses EXECUTE dari role anon (pengunjung yang
-- belum login) untuk 8 fungsi SECURITY DEFINER yang seharusnya cuma
-- dipakai lewat aplikasi setelah login. Sudah dicek: kelimanya
-- (decide_capital_request, receive_purchase_order, save_booking_checked,
-- save_booth_project_checked, set_capital_request_payment_proof) cuma
-- dipanggil dari Server Action (src/lib/*/actions.ts), yang selalu jalan
-- dengan sesi pengguna yang sudah login (role `authenticated`) — jadi role
-- `anon` tidak pernah butuh akses ini sama sekali. Dua lainnya
-- (handle_new_user, protect_privileged_profile_columns) adalah fungsi
-- trigger, tidak pernah dipanggil langsung sebagai RPC oleh aplikasi.
-- current_user_has_full_access() cuma dipakai di dalam RLS policy.
--
-- Role `authenticated` SENGAJA TIDAK disentuh — supaya alur aplikasi yang
-- sudah berjalan (pengguna yang sudah login) tidak berubah sama sekali.
-- Ini murni menutup celah "orang belum login bisa memanggil endpoint RPC
-- ini langsung lewat API", bukan mengubah cara aplikasi bekerja.
revoke execute on function public.current_user_has_full_access() from anon;
revoke execute on function public.decide_capital_request(uuid, text, text) from anon;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.protect_privileged_profile_columns() from anon;
revoke execute on function public.receive_purchase_order(uuid) from anon;
revoke execute on function public.save_booking_checked(uuid, uuid, uuid, text, text, date, date, integer, text, integer, text) from anon;
revoke execute on function public.save_booth_project_checked(uuid, text, uuid, text, text, text, date, date, integer, text, integer, jsonb, text) from anon;
revoke execute on function public.set_capital_request_payment_proof(uuid, text, text) from anon;
