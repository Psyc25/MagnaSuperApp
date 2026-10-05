-- Menghubungkan Pengajuan Modal (dana investor) ke jurnal akuntansi --
-- sebelumnya journal_entries SUDAH menyiapkan source_type 'capital_request'
-- (migrasi 0051/0052) tapi tidak ada fungsi/pemanggilan apa pun yang
-- memakainya -- dana investor yang masuk tidak pernah tercatat di Jurnal
-- Umum, jadi Neraca/Laba-Rugi tidak lengkap.
--
-- Keputusan Owner (dikonfirmasi lewat Cowork, 2026-10-05): dana investor
-- dibukukan sebagai UTANG (liabilitas) -- bukan modal/ekuitas -- karena ini
-- dana yang suatu saat dikembalikan, bukan kepemilikan investor di
-- perusahaan.
--
-- Titik posting: BUKAN saat investor klik "Disetujui" (approval belum
-- berarti uangnya sudah pindah -- lihat komentar `decideCapitalRequest` di
-- capital-requests/actions.ts, Owner kadang baru transfer belakangan),
-- tapi saat BUKTI PEMBAYARAN benar-benar dilampirkan
-- (payment_proof_storage_path terisi) -- titik paling akurat yang mewakili
-- kas benar-benar diterima. Dibalik (dihapus) kalau bukti dilepas lagi.
insert into public.chart_of_accounts (account_code, account_name, account_type, account_subtype, normal_balance)
values ('2-1300', 'Utang kepada Investor', 'Kewajiban', 'Kewajiban Jangka Pendek', 'Kredit')
on conflict (account_code) do nothing;

-- CATATAN: Berbeda dari post_event_expense_journal/delete_event_expense_journal
-- (migrasi 0052, yang SENGAJA menolak investor memposting jurnal expense
-- staf), fungsi ini justru SELALU dipanggil oleh investor sendiri
-- (decideCapitalRequest/uploadCapitalRequestProof/removeCapitalRequestProof
-- di capital-requests/actions.ts semuanya mensyaratkan division investor)
-- -- jadi TIDAK ada blok current_user_is_investor() di sini, SECURITY
-- DEFINER memang untuk mengizinkan investor mencatat jurnal dana yang
-- MEREKA SENDIRI masukkan.
--
-- Urutan DELETE sebelum SELECT...IF NOT FOUND sengaja dipertahankan seperti
-- ini (bukan di akhir seperti pola post_event_expense_journal) -- hasil
-- akhirnya sama (idempotent, hapus jurnal lama dulu), urutan ini dipilih
-- karena terbukti stabil diterapkan di lingkungan migrasi ini.
create or replace function public.post_capital_request_journal(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_debit_account uuid;
  v_credit_account uuid;
  v_entry_id uuid;
begin
  delete from public.journal_entries
    where source_type = 'capital_request' and source_id = p_request_id;

  select * into v_request from public.capital_requests where id = p_request_id;
  if not found then
    return;
  end if;

  if v_request.payment_proof_storage_path is null then
    return;
  end if;

  -- Belum ada field metode pembayaran di capital_requests (beda dari
  -- event_expenses) -- default ke Bank Operasional karena dana investor
  -- dalam praktiknya selalu lewat transfer, bukan cash.
  select id into v_debit_account from public.chart_of_accounts where account_code = '1-1002';
  select id into v_credit_account from public.chart_of_accounts where account_code = '2-1300';

  if v_debit_account is null or v_credit_account is null then
    raise warning 'post_capital_request_journal: akun tidak ditemukan untuk pengajuan %', p_request_id;
    return;
  end if;

  insert into public.journal_entries (entry_date, description, source_type, source_id, division, created_by)
  values (
    coalesce(v_request.decided_at::date, current_date),
    'Pengajuan Modal — ' || v_request.event_name,
    'capital_request',
    p_request_id,
    'finance',
    coalesce(v_request.decided_by, v_request.submitted_by)
  )
  returning id into v_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, notes) values
    (v_entry_id, v_debit_account, v_request.modal_estimate, 0, null),
    (v_entry_id, v_credit_account, 0, v_request.modal_estimate, null);
end;
$$;

create or replace function public.delete_capital_request_journal(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.journal_entries
    where source_type = 'capital_request' and source_id = p_request_id;
end;
$$;
