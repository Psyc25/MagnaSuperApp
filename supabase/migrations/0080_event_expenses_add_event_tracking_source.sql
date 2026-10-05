-- Tahap F dari modul "Realisasi Event" (lanjutan migrasi 0049/0050) --
-- menghubungkan ke entitas "Event" umum lintas-divisi (modul Tracking
-- Progress Event / "Papan Tracking Event", migrasi 0053: tabel
-- `public.events`) sebagai salah satu "Event/Proyek Terkait" yang bisa
-- dipilih waktu mencatat pengeluaran -- sebelumnya source_type hanya
-- mencakup booking/proyek per-divisi (migrasi 0049), sehingga event umum
-- seperti "GRAB X KOMDIGI" (dibuat lewat modul Tracking Progress Event)
-- tidak punya cara untuk dikaitkan ke pengeluaran apa pun.
--
-- Nilai baru:
--  - division: 'event' -- label kategori baru "Event (Lintas Divisi)",
--    dipakai waktu staf memilih event umum (bukan booking/proyek spesifik
--    satu divisi) sebagai Event/Proyek Terkait. Konsisten dengan makna
--    `division` di tabel ini (lihat komentar migrasi 0049): murni label
--    kategori pengeluaran untuk rekap, BUKAN penentu hak akses (RLS tetap
--    `not current_user_is_investor()`, tidak berubah).
--  - source_type: 'event_tracking' -- merujuk ke `public.events.id`
--    (bukan FK, pola polimorfik yang sama seperti source_type lain di
--    tabel ini).
alter table public.event_expenses
  drop constraint if exists event_expenses_division_check;
alter table public.event_expenses
  add constraint event_expenses_division_check
  check (division in ('magnarent', 'magnative', 'production', 'finance', 'event'));

alter table public.event_expenses
  drop constraint if exists event_expenses_source_type_check;
alter table public.event_expenses
  add constraint event_expenses_source_type_check
  check (source_type in ('magnarent_booking', 'magnative_project', 'production_booth', 'umum', 'event_tracking'));

-- journal_entries.division (migrasi 0051) harus ikut diperlonggar supaya
-- `post_event_expense_journal` (migrasi 0052) tidak gagal INSERT waktu
-- posting otomatis jurnal untuk pengeluaran dengan division = 'event'.
alter table public.journal_entries
  drop constraint if exists journal_entries_division_check;
alter table public.journal_entries
  add constraint journal_entries_division_check
  check (division in ('magnarent', 'magnative', 'production', 'finance', 'event'));
