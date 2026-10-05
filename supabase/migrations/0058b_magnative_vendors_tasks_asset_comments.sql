-- ============================================================================
-- DIPULIHKAN DARI PRODUCTION (audit migrasi 5 Okt 2026).
-- Migrasi ini SUDAH TERPASANG di production sejak versi 20260922092600 (nama di
-- supabase_migrations.schema_migrations: "0060_magnative_vendors_tasks_asset_comments"), tapi filenya tidak
-- pernah masuk repo -- akibatnya repo tidak bisa membangun ulang database.
-- Isi di bawah garis adalah salinan VERBATIM statements[1] dari production
-- (md5 fca78764941be1fcd087b8dd55b2b817). Diberi nomor 0058b supaya urutannya sama dengan
-- urutan penerapan di production (sesudah 0058a, sebelum 0059).
-- JANGAN dijalankan ulang di production.
-- ============================================================================
-- Update Opsional 2 (gap analysis eksternal Magnativ, 22 Sep 2026):
-- tiga fitur yang tidak butuh keputusan bisnis dari Owner/bahan pihak
-- ketiga, jadi bisa langsung dibangun: (1) manajemen data vendor per
-- proyek, (2) task/timeline per proyek, (3) komentar/anotasi aset
-- kreatif (proofing ringan). Pola RLS & kolom mengikuti persis tabel
-- magnative_* yang sudah ada (lihat magnative_creative_assets untuk pola
-- policy ALL tunggal, dan event_checklist_items untuk pola kolom
-- pic/status/sort_order).

-- ---------------------------------------------------------------------
-- 1) Manajemen data vendor
-- ---------------------------------------------------------------------
create table magnative_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Lainnya'
    check (category = any (array['Venue','Katering','Dekorasi','Sound System & Lighting','Fotografi/Videografi','Percetakan','Lainnya'])),
  contact_name text,
  contact_phone text,
  contact_email text,
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table magnative_vendors is 'Basis data vendor/supplier eksternal yang dipakai proyek Magnativ (venue, katering, dekorasi, dst) -- terpisah dari ProjectCost supaya data kontak vendor tidak perlu diketik ulang tiap ada biaya baru.';

-- Junction: satu proyek bisa pakai banyak vendor, satu vendor bisa dipakai
-- banyak proyek. `biaya_estimasi` MURNI informatif (mis. dari
-- quote/penawaran vendor) -- biaya AKTUAL tetap dicatat lewat ProjectCost
-- (event_expenses) seperti sebelumnya, supaya tidak ada dua sumber
-- kebenaran untuk jurnal akuntansi.
create table magnative_project_vendors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references magnative_projects(id) on delete cascade,
  vendor_id uuid not null references magnative_vendors(id) on delete cascade,
  keterangan text,
  biaya_estimasi integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table magnative_project_vendors is 'Kaitan vendor ke proyek tertentu -- biaya_estimasi informatif saja (bukan sumber jurnal akuntansi, itu tetap event_expenses lewat ProjectCost).';

create index magnative_project_vendors_project_id_idx on magnative_project_vendors(project_id);
create index magnative_project_vendors_vendor_id_idx on magnative_project_vendors(vendor_id);

alter table magnative_vendors enable row level security;
alter table magnative_project_vendors enable row level security;

create policy magnative_vendors_access on magnative_vendors for all
  using (can_access_division('magnative')) with check (can_access_division('magnative'));

create policy magnative_project_vendors_access on magnative_project_vendors for all
  using (can_access_division('magnative')) with check (can_access_division('magnative'));

-- ---------------------------------------------------------------------
-- 2) Task/timeline per proyek
-- ---------------------------------------------------------------------
create table magnative_project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references magnative_projects(id) on delete cascade,
  title text not null,
  detail text,
  status text not null default 'Belum Mulai'
    check (status = any (array['Belum Mulai','Berjalan','Selesai'])),
  due_date date,
  -- Pola sama seperti event_checklist_items.pic -- FK ke auth.users
  -- (bukan profiles) supaya tidak nambah constraint lintas skema RLS.
  -- Nama ditampilkan lewat query terpisah ke profiles (lihat
  -- resolvePicNames di events/data.ts), dipakai ulang polanya di sini.
  pic uuid references auth.users(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table magnative_project_tasks is 'Breakdown task/sub-pekerjaan di dalam satu proyek Magnativ (mis. venue, dekorasi, izin, dst untuk proyek tipe Event Organizer) -- funnel status proyek saja tidak cukup detail untuk melacak siapa mengerjakan apa.';

create index magnative_project_tasks_project_id_idx on magnative_project_tasks(project_id);

alter table magnative_project_tasks enable row level security;

create policy magnative_project_tasks_access on magnative_project_tasks for all
  using (can_access_division('magnative')) with check (can_access_division('magnative'));

-- ---------------------------------------------------------------------
-- 3) Komentar/anotasi aset kreatif (proofing ringan)
-- ---------------------------------------------------------------------
create table magnative_asset_comments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references magnative_creative_assets(id) on delete cascade,
  -- Nama penulis komentar DISNAPSHOT saat insert (bukan join live ke
  -- profiles) -- pola sama seperti picName di addProjectCost/actions.ts,
  -- supaya nama tetap tampil apa adanya meski akun staf berubah nanti.
  author_name text not null,
  comment_text text not null,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table magnative_asset_comments is 'Komentar/feedback per aset kreatif (proofing ringan) -- staf bisa kasih catatan revisi langsung di aset tanpa keluar ke WhatsApp/chat lain, dan tandai selesai (is_resolved) begitu revisinya kelar.';

create index magnative_asset_comments_asset_id_idx on magnative_asset_comments(asset_id);

alter table magnative_asset_comments enable row level security;

create policy magnative_asset_comments_access on magnative_asset_comments for all
  using (can_access_division('magnative')) with check (can_access_division('magnative'));
