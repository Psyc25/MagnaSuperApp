-- ============================================================================
-- DIPULIHKAN DARI PRODUCTION (audit migrasi 5 Okt 2026).
-- Migrasi ini SUDAH TERPASANG di production sejak versi 20260922152654 (nama di
-- supabase_migrations.schema_migrations: "magnarent_gallery_kategori_alat"), tapi filenya tidak
-- pernah masuk repo -- akibatnya repo tidak bisa membangun ulang database.
-- Isi di bawah garis adalah salinan VERBATIM statements[1] dari production
-- (md5 3647cf45c38100abaf0ca56191af9192). Diberi nomor 0058d supaya urutannya sama dengan
-- urutan penerapan di production (sesudah 0058c, sebelum 0059).
-- JANGAN dijalankan ulang di production.
-- ============================================================================
-- Galeri Kategori Alat Magnarent: model folder/album, meniru
-- magnative_portfolio_folders + magnative_portfolio (migrasi 0057), untuk
-- menggantikan PlaceholderGallery statis di halaman Inventaris.

insert into storage.buckets (id, name, public)
values ('magnarent-gallery', 'magnarent-gallery', true)
on conflict (id) do nothing;

create table magnarent_gallery_folders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table magnarent_gallery_photos (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references magnarent_gallery_folders(id) on delete cascade,
  photo_url text not null,
  storage_path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index magnarent_gallery_photos_folder_id_idx on magnarent_gallery_photos(folder_id);

alter table magnarent_gallery_folders enable row level security;
alter table magnarent_gallery_photos enable row level security;

create policy magnarent_gallery_folders_select on magnarent_gallery_folders
  for select using (true);
create policy magnarent_gallery_folders_insert on magnarent_gallery_folders
  for insert with check (can_access_division('magnarent'));
create policy magnarent_gallery_folders_update on magnarent_gallery_folders
  for update using (can_access_division('magnarent')) with check (can_access_division('magnarent'));
create policy magnarent_gallery_folders_delete on magnarent_gallery_folders
  for delete using (can_access_division('magnarent'));

create policy magnarent_gallery_photos_select on magnarent_gallery_photos
  for select using (true);
create policy magnarent_gallery_photos_insert on magnarent_gallery_photos
  for insert with check (can_access_division('magnarent'));
create policy magnarent_gallery_photos_update on magnarent_gallery_photos
  for update using (can_access_division('magnarent')) with check (can_access_division('magnarent'));
create policy magnarent_gallery_photos_delete on magnarent_gallery_photos
  for delete using (can_access_division('magnarent'));

create policy magnarent_gallery_read on storage.objects
  for select using (bucket_id = 'magnarent-gallery');
create policy magnarent_gallery_insert on storage.objects
  for insert with check (bucket_id = 'magnarent-gallery' and can_access_division('magnarent'));
create policy magnarent_gallery_update on storage.objects
  for update using (bucket_id = 'magnarent-gallery' and can_access_division('magnarent'))
  with check (bucket_id = 'magnarent-gallery' and can_access_division('magnarent'));
create policy magnarent_gallery_delete on storage.objects
  for delete using (bucket_id = 'magnarent-gallery' and can_access_division('magnarent'));
