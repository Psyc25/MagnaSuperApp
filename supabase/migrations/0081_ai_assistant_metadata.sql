-- Tahap 80b: Tambah kolom metadata ke ai_assistant_messages
-- untuk menyimpan pending action yang menunggu konfirmasi user.

alter table ai_assistant_messages
  add column if not exists metadata jsonb default '{}'::jsonb;

comment on column ai_assistant_messages.metadata is
  'Metadata tambahan, termasuk pendingAction untuk action yang butuh konfirmasi';
