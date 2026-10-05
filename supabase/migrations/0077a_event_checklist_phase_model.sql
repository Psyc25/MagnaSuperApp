-- ============================================================================
-- DIPULIHKAN DARI PRODUCTION (audit migrasi 5 Okt 2026).
-- Migrasi ini SUDAH TERPASANG di production sejak versi 20260929073451 (nama di
-- supabase_migrations.schema_migrations: "event_checklist_phase_model"), tapi filenya tidak
-- pernah masuk repo -- akibatnya repo tidak bisa membangun ulang database.
-- Isi di bawah garis adalah salinan VERBATIM statements[1] dari production
-- (md5 738f4b19d6e2c0799c1ac1b16aa5ab0b). Diberi nomor 0077a supaya urutannya sama dengan
-- urutan penerapan di production (sesudah 0077, sebelum 0078).
-- JANGAN dijalankan ulang di production.
-- ============================================================================
-- Redesain besar model checklist event: 8 fase (Design, Mockup, Sample,
-- Production, Completed, Loading In, Loading Out, Finish) menggantikan
-- status datar lama (Belum Mulai/Sample/Approval/Preparation/Production/Finish).
-- Kolom `status` lama TETAP DIPERTAHANKAN sebagai arsip historis, tidak dihapus.
-- Approval untuk sementara oleh PIC item itu sendiri (approved_by saat ini
-- selalu = submitted_by); kolom sudah disiapkan agar bisa dipisah nanti
-- tanpa migrasi besar lagi.

-- 1) Default kebutuhan produksi per template item (dipakai saat clone ke event baru)
alter table public.event_type_template_items
  add column if not exists default_needs_production boolean not null default true;

-- 2) Kolom fase baru di event_checklist_items
alter table public.event_checklist_items
  add column if not exists needs_production boolean not null default true,
  add column if not exists current_phase text not null default 'design'
    check (current_phase in ('design','mockup','sample','production','completed','loading_in','loading_out','finish')),
  add column if not exists production_qty text,
  add column if not exists production_notes text,
  add column if not exists production_photo_url text,
  add column if not exists production_done_at timestamptz,
  add column if not exists production_done_by uuid references public.profiles(id),
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles(id),
  add column if not exists loading_in_at timestamptz,
  add column if not exists loading_in_by uuid references public.profiles(id),
  add column if not exists loading_out_at timestamptz,
  add column if not exists loading_out_by uuid references public.profiles(id),
  add column if not exists finished_at timestamptz,
  add column if not exists finished_by uuid references public.profiles(id);

-- 3) Riwayat sub-status Design/Mockup/Sample -- state SAAT INI saja (bukan log
-- penuh), maksimal 1 baris per fase per item (3 baris/item). Foto WAJIB
-- sebelum fase berikutnya terbuka -- gembok ini ditegakkan di kode aplikasi,
-- bukan constraint DB, karena baris dibuat dulu di 'proposed' sebelum foto
-- sempat diunggah.
create table if not exists public.event_checklist_phase_reviews (
  id uuid primary key default gen_random_uuid(),
  checklist_item_id uuid not null references public.event_checklist_items(id) on delete cascade,
  phase text not null check (phase in ('design','mockup','sample')),
  sub_status text not null default 'proposed' check (sub_status in ('proposed','revised','approved')),
  revision_count integer not null default 0,
  photo_url text,
  submitted_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (checklist_item_id, phase)
);

create index if not exists event_checklist_phase_reviews_item_idx
  on public.event_checklist_phase_reviews (checklist_item_id);

create trigger set_updated_at
  before update on public.event_checklist_phase_reviews
  for each row execute function set_updated_at();

alter table public.event_checklist_phase_reviews enable row level security;

create policy event_checklist_phase_reviews_select on public.event_checklist_phase_reviews
  for select to authenticated
  using (current_user_division() = any (array['magnarent','magnative','production','all']));

create policy event_checklist_phase_reviews_insert on public.event_checklist_phase_reviews
  for insert to authenticated
  with check (current_user_division() = any (array['magnarent','magnative','production','all']));

create policy event_checklist_phase_reviews_update on public.event_checklist_phase_reviews
  for update to authenticated
  using (current_user_division() = any (array['magnarent','magnative','production','all']))
  with check (current_user_division() = any (array['magnarent','magnative','production','all']));

create policy event_checklist_phase_reviews_delete on public.event_checklist_phase_reviews
  for delete to authenticated
  using (current_user_division() = any (array['magnarent','magnative','production','all']));

-- 4) Perluas log status (APPEND-ONLY, TIDAK diisi mundur untuk baris lama)
alter table public.event_checklist_status_log
  add column if not exists phase text,
  add column if not exists sub_status text;

-- 5) Bucket storage foto konfirmasi fase, mengikuti pola bucket event lain
-- (public=true, tulis dibatasi RLS by divisi yang sama dengan event_checklist_items)
insert into storage.buckets (id, name, public)
values ('event-checklist-photos', 'event-checklist-photos', true)
on conflict (id) do nothing;

create policy event_checklist_photos_read on storage.objects
  for select to public
  using (bucket_id = 'event-checklist-photos');

create policy event_checklist_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-checklist-photos' and current_user_division() = any (array['magnarent','magnative','production','all']));

create policy event_checklist_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'event-checklist-photos' and current_user_division() = any (array['magnarent','magnative','production','all']))
  with check (bucket_id = 'event-checklist-photos' and current_user_division() = any (array['magnarent','magnative','production','all']));

create policy event_checklist_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-checklist-photos' and current_user_division() = any (array['magnarent','magnative','production','all']));
