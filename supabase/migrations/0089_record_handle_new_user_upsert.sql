-- Mencatat ke repo kondisi LIVE production yang dulu diubah lewat SQL Editor
-- tanpa file migrasi (audit migrasi 5 Okt 2026):
--
-- 1. handle_new_user() di production punya ON CONFLICT (id) DO UPDATE --
--    repo (0003) cuma INSERT polos.
-- 2. Trigger on_auth_user_created di production berjalan AFTER INSERT OR
--    UPDATE -- repo (0001) cuma AFTER INSERT.
--
-- Keduanya HARUS berpasangan: trigger yang juga jalan saat UPDATE (login,
-- admin updateUserById, ganti email) tanpa upsert akan gagal duplicate key
-- di profiles_pkey. Definisi di bawah = pg_get_functiondef/pg_get_triggerdef
-- production apa adanya, jadi menjalankannya di production tidak mengubah
-- apa pun; tujuannya supaya rebuild dari repo menghasilkan perilaku yang sama.
-- ACL fungsi tidak disentuh: create or replace mempertahankan grant yang ada
-- (0045 cabut dari PUBLIC, 0044a cabut dari anon).
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, full_name, username, division)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_app_meta_data ->> 'username',
    coalesce(new.raw_app_meta_data ->> 'division', 'production')
  )
  on conflict (id) do update
  set email = excluded.email,
      username = coalesce(excluded.username, public.profiles.username),
      division = coalesce(excluded.division, public.profiles.division);
  return new;
end;
$function$;

create or replace trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();
