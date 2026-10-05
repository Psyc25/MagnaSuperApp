-- Advisor Supabase 0011 (function_search_path_mutable): trigger penjaga
-- jurnal balance belum mengunci search_path -- disamakan dengan fungsi
-- akuntansi lain yang sudah `set search_path = public`.
alter function public.check_journal_entry_balanced() set search_path = public;
