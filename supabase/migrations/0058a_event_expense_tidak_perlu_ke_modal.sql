-- ============================================================================
-- DIPULIHKAN DARI PRODUCTION (audit migrasi 5 Okt 2026).
-- Migrasi ini SUDAH TERPASANG di production sejak versi 20260922071906 (nama di
-- supabase_migrations.schema_migrations: "0059_event_expense_tidak_perlu_ke_modal"), tapi filenya tidak
-- pernah masuk repo -- akibatnya repo tidak bisa membangun ulang database.
-- Isi di bawah garis adalah salinan VERBATIM statements[1] dari production
-- (md5 d5b3f1ac79c0b8b21f7d23ade6e8a5d8). Diberi nomor 0058a supaya urutannya sama dengan
-- urutan penerapan di production (sesudah 0058, sebelum 0059).
-- JANGAN dijalankan ulang di production.
-- ============================================================================
-- Realisasi Event: pengeluaran dengan reimbursement_status "Tidak Perlu"
-- (PIC bayar pribadi, TIDAK minta diganti perusahaan) sebelumnya ikut
-- masuk cabang default post_event_expense_journal (migrasi 0052), jadi
-- kreditnya ke Kas Kecil/Bank Operasional -- seolah kas perusahaan benar-
-- benar keluar, padahal tidak. Dipisah di sini: "Tidak Perlu" dikredit ke
-- Modal Pemilik (3-1000), diperlakukan sebagai kontribusi informal dari
-- staf -- Beban tetap tercatat (mengurangi Laba-Rugi), tapi tidak
-- mengurangi saldo Kas/Bank yang sebenarnya tidak pernah terpakai.
-- "Belum Diganti" & "Sudah Diganti" tidak berubah dari migrasi 0052.
create or replace function public.post_event_expense_journal(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_expense record;
  v_debit_code text;
  v_credit_code text;
  v_debit_account uuid;
  v_credit_account uuid;
  v_entry_id uuid;
begin
  if public.current_user_is_investor() then
    raise exception 'Investor tidak memiliki akses ke jurnal akuntansi.';
  end if;

  select * into v_expense from public.event_expenses where id = p_expense_id;
  if not found then
    return;
  end if;

  delete from public.journal_entries
    where source_type = 'event_expense' and source_id = p_expense_id;

  v_debit_code := case v_expense.category
    when 'Sewa Venue' then '5-1001'
    when 'Dekorasi & Material' then '5-1002'
    when 'Transportasi' then '5-1003'
    when 'Konsumsi' then '5-1004'
    when 'Talent / Vendor' then '5-1005'
    when 'Percetakan' then '5-1006'
    when 'Operasional Kantor' then '5-1007'
    else '5-1008'
  end;

  v_credit_code := case
    when v_expense.reimbursement_status = 'Belum Diganti' then '2-1100'
    when v_expense.reimbursement_status = 'Tidak Perlu' then '3-1000'
    when v_expense.payment_method ilike '%cash%' then '1-1001'
    else '1-1002'
  end;

  select id into v_debit_account from public.chart_of_accounts where account_code = v_debit_code;
  select id into v_credit_account from public.chart_of_accounts where account_code = v_credit_code;

  if v_debit_account is null or v_credit_account is null then
    raise warning 'post_event_expense_journal: akun % atau % tidak ditemukan untuk expense %',
      v_debit_code, v_credit_code, p_expense_id;
    return;
  end if;

  insert into public.journal_entries (entry_date, description, source_type, source_id, division, created_by)
  values (
    v_expense.expense_date,
    'Realisasi Event — ' || v_expense.category || ' (' || v_expense.pic_name || ')',
    'event_expense',
    p_expense_id,
    v_expense.division,
    v_expense.created_by
  )
  returning id into v_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, notes) values
    (v_entry_id, v_debit_account, v_expense.amount, 0, v_expense.notes),
    (v_entry_id, v_credit_account, 0, v_expense.amount, null);
end;
$function$;
