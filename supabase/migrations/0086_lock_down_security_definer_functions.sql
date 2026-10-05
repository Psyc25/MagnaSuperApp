-- Hasil QC keamanan (Supabase advisor 0028/0029):
--
-- 1. Beberapa fungsi SECURITY DEFINER bisa dieksekusi role `anon` -- artinya
--    SIAPA PUN yang memegang anon key publik (memang ter-bundle ke browser)
--    bisa memanggilnya lewat /rest/v1/rpc/... TANPA login. Paling berbahaya:
--    delete_capital_request_journal (tanpa pengecekan apa pun) bisa dipakai
--    menghapus jurnal dana investor dari Jurnal Umum. Fungsi lain sudah
--    punya guard internal, tapi tetap dicabut dari anon (defense in depth).
--
-- 2. delete_capital_request_journal (migrasi 0084) juga bisa dipanggil staf
--    login divisi mana pun. Pemanggil sahnya cuma investor
--    (capital-requests/actions.ts) -- ditambah guard investor/akses penuh
--    (no-op diam-diam kalau tidak berhak). post_capital_request_journal
--    TIDAK diubah: idempotent & selalu membangun ulang jurnal yang benar
--    dari isi capital_requests, jadi pemanggil lain tidak bisa memalsukan
--    apa pun -- cukup dicabut dari anon.
--
-- 3. Fungsi sisa uji coba ping_test_fn* (tertinggal saat debugging migrasi
--    0084) ikut terekspos ke anon, salah satunya bisa MENYISIPKAN jurnal.
--    Hak eksekusinya dicabut total; dihapus di migrasi 0087.

create or replace function public.delete_capital_request_journal(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_is_investor() or public.current_user_has_full_access() then
    delete from public.journal_entries
      where source_type = 'capital_request' and source_id = p_request_id;
  end if;
end;
$$;

revoke execute on function public.post_capital_request_journal(uuid) from public, anon;
revoke execute on function public.delete_capital_request_journal(uuid) from public, anon;
revoke execute on function public.post_event_expense_journal(uuid) from public, anon;
revoke execute on function public.delete_event_expense_journal(uuid) from public, anon;
revoke execute on function public.transfer_material_stock(uuid, integer, text, text) from public, anon;
revoke execute on function public.save_booth_project_checked(uuid, text, uuid, text, text, text, date, date, integer, text, integer, jsonb, text, date) from public, anon;

grant execute on function public.post_capital_request_journal(uuid) to authenticated;
grant execute on function public.delete_capital_request_journal(uuid) to authenticated;
grant execute on function public.post_event_expense_journal(uuid) to authenticated;
grant execute on function public.delete_event_expense_journal(uuid) to authenticated;
grant execute on function public.transfer_material_stock(uuid, integer, text, text) to authenticated;
grant execute on function public.save_booth_project_checked(uuid, text, uuid, text, text, text, date, date, integer, text, integer, jsonb, text, date) to authenticated;

revoke execute on function public.ping_test_fn() from public, anon, authenticated;
revoke execute on function public.ping_test_fn3() from public, anon, authenticated;
revoke execute on function public.ping_test_fn4() from public, anon, authenticated;
revoke execute on function public.ping_test_fn5(uuid) from public, anon, authenticated;
revoke execute on function public.ping_test_fn6(uuid) from public, anon, authenticated;
revoke execute on function public.ping_test_fn7(uuid) from public, anon, authenticated;
revoke execute on function public.ping_test_fn9(uuid) from public, anon, authenticated;
revoke execute on function public.ping_test_fn11(uuid) from public, anon, authenticated;
revoke execute on function public.ping_test_fn12(uuid) from public, anon, authenticated;
