-- Gap yang ditemukan saat QC event "GRAB MODIS" (6 Okt 2026): tidak ada
-- notifikasi otomatis saat event MULAI (start_date tiba) atau SELESAI
-- (end_date lewat) -- cuma ada "Event Baru" saat dibuat & milestone
-- loading (lihat src/lib/events/actions.ts). Dua kolom timestamp ini
-- menandai kapan masing-masing notifikasi sudah terkirim, supaya cron
-- harian (/api/cron/event-date-notifications) tidak kirim notifikasi
-- berulang setiap hari untuk event yang sama.
alter table public.events
  add column if not exists start_notified_at timestamptz,
  add column if not exists end_notified_at timestamptz;

comment on column public.events.start_notified_at is
  'Waktu notifikasi "Event Dimulai" terkirim (cron event-date-notifications) -- NULL kalau belum pernah.';
comment on column public.events.end_notified_at is
  'Waktu notifikasi "Event Selesai" terkirim (cron event-date-notifications) -- NULL kalau belum pernah.';
