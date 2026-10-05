-- Hapus fungsi sisa uji coba ping_test_fn* (tertinggal saat debugging
-- migrasi 0084). Sejak migrasi 0086 hak eksekusinya sudah dicabut dari
-- semua role, jadi ini murni bersih-bersih skema.
--
-- CATATAN: belum diterapkan otomatis -- tool migrasi menolak DROP tanpa
-- konfirmasi manual. Jalankan isi file ini di Supabase SQL Editor.
drop function if exists public.ping_test_fn();
drop function if exists public.ping_test_fn3();
drop function if exists public.ping_test_fn4();
drop function if exists public.ping_test_fn5(uuid);
drop function if exists public.ping_test_fn6(uuid);
drop function if exists public.ping_test_fn7(uuid);
drop function if exists public.ping_test_fn9(uuid);
drop function if exists public.ping_test_fn11(uuid);
drop function if exists public.ping_test_fn12(uuid);
