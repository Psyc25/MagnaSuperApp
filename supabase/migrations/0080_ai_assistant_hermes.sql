-- Tahap 80: Fitur Asisten AI dengan 9Router/Hermes — mengembalikan tabel
-- ai_assistant_messages yang sebelumnya dihapus di migrasi 0042, dengan
-- desain yang sama (flat, satu baris per pesan role 'user'/'assistant').
-- Kali ini terkoneksi ke 9Router gateway self-hosted milik Magna yang
-- menjalankan model Hermes.

create table if not exists ai_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) > 0 and char_length(content) <= 8000),
  created_at timestamptz not null default now()
);

create index if not exists ai_assistant_messages_user_created_idx
  on ai_assistant_messages (user_id, created_at);

alter table ai_assistant_messages enable row level security;

-- Percakapan PRIBADI — user cuma boleh melihat/menulis/menghapus miliknya sendiri.
create policy ai_assistant_messages_select_own
  on ai_assistant_messages for select
  using (user_id = auth.uid());

create policy ai_assistant_messages_insert_own
  on ai_assistant_messages for insert
  with check (user_id = auth.uid());

create policy ai_assistant_messages_delete_own
  on ai_assistant_messages for delete
  using (user_id = auth.uid());
