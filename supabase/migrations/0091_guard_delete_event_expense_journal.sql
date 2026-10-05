-- Hasil review keamanan pra-merge (QC 5 Okt 2026):
--
-- delete_event_expense_journal (migrasi 0052) cuma menolak investor. Staf
-- login divisi MANA PUN bisa memanggilnya lewat /rest/v1/rpc/... untuk id
-- pengeluaran apa pun dan menghapus jurnalnya, padahal baris
-- event_expenses-nya tetap ada -- laporan keuangan jadi kurang catat tanpa
-- jejak.
--
-- Satu-satunya pemanggil sah (deleteEventExpense di
-- src/lib/event-expenses/actions.ts) memanggil fungsi ini SETELAH baris
-- event_expenses-nya terhapus. Jadi guard-nya: selama pengeluaran masih
-- ada, jurnalnya tidak dihapus (no-op diam-diam), kecuali oleh akun akses
-- penuh. Ini sekaligus menutup kasus RLS menolak DELETE (0 baris terhapus
-- tanpa error) lalu jurnal pengeluaran yang masih ada ikut terhapus.
--
-- Investor sekarang no-op diam-diam (sebelumnya raise exception): investor
-- memang tidak bisa menghapus event_expenses (RLS), jadi jalur pemanggil
-- sah tidak pernah sampai ke sini untuk investor.
create or replace function public.delete_event_expense_journal(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_has_full_access()
     or (
       public.current_user_is_investor() is distinct from true
       and (select count(*) from public.event_expenses where id = p_expense_id) = 0
     ) then
    delete from public.journal_entries
      where source_type = 'event_expense' and source_id = p_expense_id;
  end if;
end;
$$;
