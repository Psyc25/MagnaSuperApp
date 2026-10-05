-- Riwayat fase checklist event hilang sebagian (temuan sweep QC 5 Okt 2026).
--
-- Model fase 8 tahap (migrasi 0077a) menulis log dengan label fase
-- (Design, Mockup, Sample, Production, Completed, Loading In, Loading Out,
-- Finish), tapi CHECK kolom status dari migrasi 0065 hanya mengizinkan
-- status lama. Insert untuk 5 fase ditolak (23514), errornya cuma ke
-- console, dan modal "Riwayat" tidak pernah menampilkan transisi itu.
-- Nilai lama tetap diizinkan untuk baris historis.
alter table public.event_checklist_status_log
  drop constraint event_checklist_status_log_status_check,
  add constraint event_checklist_status_log_status_check
    check (status = any (array[
      'Belum Mulai'::text, 'Sample'::text, 'Approval'::text, 'Preparation'::text, 'Production'::text, 'Finish'::text,
      'Design'::text, 'Mockup'::text, 'Completed'::text, 'Loading In'::text, 'Loading Out'::text
    ]));
