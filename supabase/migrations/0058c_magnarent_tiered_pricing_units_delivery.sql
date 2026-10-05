-- ============================================================================
-- DIPULIHKAN DARI PRODUCTION (audit migrasi 5 Okt 2026).
-- Migrasi ini SUDAH TERPASANG di production sejak versi 20260922125056 (nama di
-- supabase_migrations.schema_migrations: "magnarent_tiered_pricing_units_delivery"), tapi filenya tidak
-- pernah masuk repo -- akibatnya repo tidak bisa membangun ulang database.
-- Isi di bawah garis adalah salinan VERBATIM statements[1] dari production
-- (md5 98a78904faeef11a6dca90edcbff7c5b). Diberi nomor 0058c supaya urutannya sama dengan
-- urutan penerapan di production (sesudah 0058b, sebelum 0059).
-- JANGAN dijalankan ulang di production.
-- ============================================================================
-- Tahap gap-analysis Magnarent: harga bertingkat, pelacakan unit individual
-- + QR, dan penjadwalan pengiriman sederhana. Mengikuti pola "extras" yang
-- sudah ada (magnarent_booking_checks/deposits/maintenance_logs): tabel
-- baru berdiri sendiri, tidak menyentuh alur booking/availability inti
-- yang sudah teruji (RPC save_booking_checked tetap hitung kapasitas per
-- JUMLAH unit, bukan per unit spesifik).

-- 1) Harga bertingkat (opsional) di inventaris
alter table magnarent_inventory
  add column price_per_week integer,
  add column price_per_month integer;

alter table magnarent_inventory
  add constraint magnarent_inventory_price_per_week_check
    check (price_per_week is null or price_per_week >= 0),
  add constraint magnarent_inventory_price_per_month_check
    check (price_per_month is null or price_per_month >= 0);

-- 2) Pelacakan unit individual + kode untuk QR
create table magnarent_inventory_units (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references magnarent_inventory(id) on delete cascade,
  kode_unit text not null,
  status text not null default 'Tersedia'
    check (status = any (array['Tersedia','Dipinjam','Maintenance','Hilang'])),
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, kode_unit)
);

create index magnarent_inventory_units_item_id_idx on magnarent_inventory_units(item_id);

alter table magnarent_inventory_units enable row level security;

create policy magnarent_inventory_units_access on magnarent_inventory_units
  for all
  using (can_access_division('magnarent'))
  with check (can_access_division('magnarent'));

-- 3) Penjadwalan pengiriman & pengambilan alat per booking (2 tahap, sama
-- pola dengan magnarent_booking_checks: unique(booking_id, stage) supaya
-- bisa di-upsert berulang tanpa duplikat baris).
create table magnarent_deliveries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references magnarent_bookings(id) on delete cascade,
  stage text not null check (stage = any (array['pengiriman','pengambilan'])),
  driver_name text,
  jadwal_tanggal date,
  jadwal_jam text,
  status text not null default 'Belum Dijadwalkan'
    check (status = any (array['Belum Dijadwalkan','Dijadwalkan','Selesai'])),
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, stage)
);

create index magnarent_deliveries_booking_id_idx on magnarent_deliveries(booking_id);

alter table magnarent_deliveries enable row level security;

create policy magnarent_deliveries_access on magnarent_deliveries
  for all
  using (can_access_division('magnarent'))
  with check (can_access_division('magnarent'));
