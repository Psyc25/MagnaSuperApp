-- Celah akses terpisah yang ditemukan sambil menghubungkan Realisasi Event
-- ke event umum (migrasi 0082): kebijakan "events_select" (migrasi 0053)
-- cuma mengizinkan 3 divisi operasional (magnarent/magnative/production) +
-- akses penuh ('all') -- belum mengenal role Finance (migrasi 0061,
-- dibuat SETELAH migrasi 0053). Akibatnya staf Finance tidak bisa baca
-- tabel `events` sama sekali, jadi opsi "Event (Lintas Divisi)" baru di
-- Realisasi Event tidak akan muncul buat mereka walau sudah terhubung di
-- sisi kode. Tambahkan 'finance' supaya konsisten dengan tujuan modul
-- Realisasi Event yang sengaja dipakai staf Finance juga (migrasi 0049).
--
-- Catatan: pakai ALTER POLICY (bukan DROP + CREATE) supaya idempotent
-- tanpa memicu isu locking pada environment ini.
alter policy "events_select" on public.events
  using (public.current_user_division() in ('magnarent', 'magnative', 'production', 'finance', 'all'));
