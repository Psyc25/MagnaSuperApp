-- KRITIS (sweep QC 5 Okt 2026): pendaftaran mandiri Supabase Auth masih
-- AKTIF (GET /auth/v1/settings -> disable_signup=false). Halaman /register
-- memang sudah dialihkan, tapi siapa pun bisa memanggil POST /auth/v1/signup
-- langsung dengan anon key publik. Akun seperti itu tidak punya
-- app_metadata.division -> handle_new_user & current_user_division()
-- jatuh ke 'production' -> baca/tulis seluruh data Production lewat
-- PostgREST. Saat migrasi ini dibuat belum ada akun asing (18 user, semua
-- punya division).
--
-- 1. Constraint trigger DEFERRED (dicek saat COMMIT) menolak user baru yang
--    sampai akhir transaksi tidak punya app_metadata.division. Akun sah
--    selalu dibuat admin lewat auth.admin.createUser dengan app_metadata
--    { username, division } (src/app/dashboard/admin/actions.ts). GoTrue
--    meng-INSERT user dulu dengan app_metadata {provider, providers} saja,
--    lalu UPDATE app_metadata kustom di transaksi yang SAMA -- karena itu
--    pengecekan harus DEFERRED (trigger BEFORE INSERT biasa akan ikut
--    menolak akun buatan admin). Signup publik meng-commit tanpa division
--    -> ditolak, transaksi dibatalkan.
-- 2. current_user_division() tidak lagi jatuh ke 'production' kalau JWT
--    tidak membawa division, tapi ke 'none' (tidak memberi akses modul apa
--    pun lewat can_access_division).
--
-- Tetap matikan "Allow new users to sign up" di Supabase Dashboard ->
-- Authentication -> Sign In / Providers; trigger ini jaring pengaman.
create or replace function public.block_public_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_division text;
begin
  -- NEW = baris saat INSERT; baca ulang versi terakhir di transaksi ini.
  select raw_app_meta_data ->> 'division' into v_division from auth.users where id = new.id;
  if found and coalesce(v_division, '') = '' then
    raise exception 'Pendaftaran mandiri dinonaktifkan. Akun MagnaSuperApp dibuat oleh admin.'
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

revoke execute on function public.block_public_signup() from public, anon, authenticated;

drop trigger if exists block_public_signup on auth.users;
create constraint trigger block_public_signup
  after insert on auth.users
  deferrable initially deferred
  for each row execute function public.block_public_signup();

create or replace function public.current_user_division()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'division', 'none');
$$;
