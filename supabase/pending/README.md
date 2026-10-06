# Migrasi tertunda (belum diterapkan ke production)

File di folder ini SENGAJA di luar `supabase/migrations/` supaya repo tetap
identik dengan database production (CI menjalankan ulang seluruh
`supabase/migrations/` dari database kosong). Semuanya sudah diuji di
database hasil rebuild lokal.

| File | Isi | Kenapa tertunda |
| --- | --- | --- |
| `0096_rls_portal_signatures_capital_invoice_pdfs.sql` | Token portal klien & tanda tangan per divisi; pengajuan modal terkunci setelah diputuskan investor; upload/hapus PDF faktur untuk finance | Ditolak saat akan diterapkan (6 Okt 2026) |
| `0097_fk_set_null_for_staff_deletion.sql` | Hapus akun staf tidak lagi diblokir foreign key; riwayat chat staf yang dihapus tidak ikut hilang | Menunggu persetujuan |
| `0098_audit_log_event_links_role_hardening.sql` | Log aktivitas tidak bisa dipalsukan; staf hanya bisa mengaitkan booking/proyek divisinya sendiri ke event; policy Production hanya untuk user login | Menunggu persetujuan |

Cara menerapkan setelah disetujui: pindahkan ke `supabase/migrations/`
dengan nomor berikutnya, lalu jalankan isinya di Supabase SQL Editor.
