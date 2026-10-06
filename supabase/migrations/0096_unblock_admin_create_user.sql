-- PERBAIKAN 0094: constraint trigger block_public_signup ikut MENOLAK akun
-- yang dibuat admin lewat auth.admin.createUser (log Auth 6 Okt 2026:
-- POST /admin/users -> 500 "Pendaftaran mandiri dinonaktifkan"). Asumsi di
-- 0094 -- GoTrue mengisi app_metadata kustom di transaksi yang sama dengan
-- INSERT -- tidak berlaku untuk GoTrue yang berjalan di production: saat
-- COMMIT, division belum ada.
--
-- Fungsinya dijadikan no-op (bukan DROP: DROP trigger di auth.users timeout
-- lewat MCP). Perlindungan terhadap signup publik tetap ada:
--   * current_user_division() (0094 bagian 2) jatuh ke 'none' kalau JWT tidak
--     membawa app_metadata.division -> can_access_division() false untuk
--     semua modul. app_metadata hanya bisa diisi service role/admin.
--   * Matikan "Allow new users to sign up" di Supabase Dashboard ->
--     Authentication -> Sign In / Providers (createUser admin tetap jalan).
create or replace function public.block_public_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Dinonaktifkan (0096): ikut menolak auth.admin.createUser. Perlindungan
  -- signup publik ada di current_user_division() -> 'none'.
  return null;
end;
$$;
