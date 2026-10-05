-- Status penggantian dana baru "Dibayar Perusahaan" + jadi default
-- (keputusan QC 5 Okt 2026, didelegasikan Owner: "tangani keseluruhan").
--
-- Masalah: default lama "Tidak Perlu" sejak migrasi 0058a dijurnal ke Modal
-- Pemilik (3-1000) -- artinya "PIC bayar pribadi & tidak mengklaim". Padahal
-- "Tidak Perlu" juga dipilih (sebagai default form & biaya proyek Magnativ)
-- untuk pengeluaran yang dibayar LANGSUNG dari kas/rekening perusahaan,
-- sehingga saldo Kas/Bank tidak pernah berkurang untuk pengeluaran itu.
--
-- Solusi tanpa mengubah arti status yang sudah ada: tambah "Dibayar
-- Perusahaan". post_event_expense_journal tidak perlu diubah -- status ini
-- jatuh ke cabang default fungsi itu (Kas Kecil 1-1001 kalau metode bayar
-- cash, selain itu Bank Operasional 1-1002). Saat migrasi ini diterapkan
-- event_expenses masih 0 baris, jadi tidak ada data lama yang perlu diubah.
alter table public.event_expenses
  drop constraint event_expenses_reimbursement_status_check,
  add constraint event_expenses_reimbursement_status_check
    check (reimbursement_status = any (array['Dibayar Perusahaan'::text, 'Tidak Perlu'::text, 'Belum Diganti'::text, 'Sudah Diganti'::text]));
alter table public.event_expenses
  alter column reimbursement_status set default 'Dibayar Perusahaan';
