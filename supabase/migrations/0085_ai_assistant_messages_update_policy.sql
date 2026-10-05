-- Perbaikan Tahap 80b: ai_assistant_messages belum punya policy UPDATE.
--
-- sendAIMessage (src/lib/ai/actions.ts) mengosongkan metadata.pendingAction
-- setelah aksi dikonfirmasi/dibatalkan lewat UPDATE -- tanpa policy ini RLS
-- diam-diam menolak (0 baris, tanpa error), pendingAction tetap menempel,
-- dan mengetik "Ya" lagi menjalankan aksi yang SAMA untuk kedua kalinya
-- (mis. booking dobel). Dibatasi ke baris milik sendiri, sama dengan
-- policy select/insert/delete yang sudah ada (migrasi 0080).
create policy ai_assistant_messages_update_own on public.ai_assistant_messages
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
