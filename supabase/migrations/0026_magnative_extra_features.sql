-- Tahap 28b: 4 fitur baru Magnativ yang diusulkan & dikonfirmasi user —
-- alur approval konten, permintaan konten dari klien, galeri aset kreatif,
-- dan statistik performa konten per platform (yang terakhir ini murni
-- query dari data yang sudah ada, tidak perlu tabel baru).

-- 1) ALUR APPROVAL KONTEN — status lama (Draft/Review/Terjadwal/Tayang)
-- diganti jadi alur approval yang eksplisit: Draft (sedang dibuat) →
-- Revisi (dikembalikan dengan catatan apa yang perlu diperbaiki) →
-- Disetujui (lolos review, tinggal tunggu tanggal tayang) → Tayang (sudah
-- posting). "Terjadwal" dilebur ke "Disetujui" (maknanya sama: siap tayang
-- di tanggal_posting) dan "Review" dilebur ke "Revisi" (data lama di status
-- itu memang sedang dalam proses direview/diperbaiki).
alter table public.magnative_content_posts
  add column if not exists feedback_revisi text;

-- Urutan: constraint lama dihapus DULU, baru data dipetakan, baru
-- constraint baru dipasang (perbaikan audit migrasi 5 Okt 2026 -- urutan
-- semula UPDATE-dulu gagal kalau ada baris 'Review'/'Terjadwal', karena
-- 'Revisi'/'Disetujui' belum diizinkan constraint lama). Hasil akhir sama.
alter table public.magnative_content_posts
  drop constraint if exists magnative_content_posts_status_check;

update public.magnative_content_posts set status = 'Revisi' where status = 'Review';
update public.magnative_content_posts set status = 'Disetujui' where status = 'Terjadwal';

alter table public.magnative_content_posts
  add constraint magnative_content_posts_status_check
  check (status in ('Draft', 'Revisi', 'Disetujui', 'Tayang'));

-- 2) PERMINTAAN KONTEN DARI KLIEN — antrean masuk sebelum jadi jadwal
-- konten sungguhan di magnative_content_posts. Sengaja dipisah (bukan
-- langsung insert ke content_posts berstatus Draft) supaya ada tahap
-- triase permintaan mentah (masih bisa berupa ide kasar/brief singkat)
-- sebelum staf mengubahnya jadi entri konten terjadwal yang lengkap.
create table if not exists public.magnative_content_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.magnative_clients (id) on delete cascade,
  title text not null,
  description text not null,
  deadline date,
  priority text not null default 'Sedang' check (priority in ('Rendah', 'Sedang', 'Tinggi')),
  status text not null default 'Baru' check (status in ('Baru', 'Diproses', 'Selesai', 'Ditolak')),
  catatan text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.magnative_content_requests;
create trigger set_updated_at before update on public.magnative_content_requests
  for each row execute function public.set_updated_at();

alter table public.magnative_content_requests enable row level security;

drop policy if exists "magnative_content_requests_access" on public.magnative_content_requests;
create policy "magnative_content_requests_access"
  on public.magnative_content_requests for all
  to authenticated
  using (public.can_access_division('magnative'))
  with check (public.can_access_division('magnative'));

-- 3) GALERI ASET KREATIF — perpustakaan kerja internal tim (template,
-- foto mentah, video, file desain) — BEDA dari magnative_portfolio
-- (migrasi 0012) yang isinya showcase hasil jadi untuk klien/investor.
-- Bucket terpisah karena tujuan & siklus hidup filenya beda (aset kreatif
-- lebih sering ganti/dibuang, portofolio lebih permanen).
create table if not exists public.magnative_creative_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Lainnya' check (category in ('Template', 'Foto Mentah', 'Video', 'Desain Grafis', 'Lainnya')),
  file_url text not null,
  storage_path text not null,
  file_type text not null default 'other' check (file_type in ('image', 'video', 'other')),
  caption text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.magnative_creative_assets enable row level security;

drop policy if exists "magnative_creative_assets_access" on public.magnative_creative_assets;
create policy "magnative_creative_assets_access"
  on public.magnative_creative_assets for all
  to authenticated
  using (public.can_access_division('magnative'))
  with check (public.can_access_division('magnative'));

-- Bucket public — pola sama persis dengan magnative-portfolio (migrasi
-- 0012): baca bebas (biar bisa ditampilkan langsung lewat <Image>/<video>
-- tanpa signed URL), tulis dibatasi ke staf Magnativ/akses penuh.
insert into storage.buckets (id, name, public)
values ('magnative-assets', 'magnative-assets', true)
on conflict (id) do nothing;

drop policy if exists "magnative_assets_read" on storage.objects;
create policy "magnative_assets_read"
  on storage.objects for select
  to public
  using (bucket_id = 'magnative-assets');

drop policy if exists "magnative_assets_insert" on storage.objects;
create policy "magnative_assets_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'magnative-assets' and public.can_access_division('magnative'));

drop policy if exists "magnative_assets_update" on storage.objects;
create policy "magnative_assets_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'magnative-assets' and public.can_access_division('magnative'))
  with check (bucket_id = 'magnative-assets' and public.can_access_division('magnative'));

drop policy if exists "magnative_assets_delete" on storage.objects;
create policy "magnative_assets_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'magnative-assets' and public.can_access_division('magnative'));
