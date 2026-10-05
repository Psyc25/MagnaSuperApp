-- Sidik skema per objek (kolom, constraint, index, policy, RLS, fungsi,
-- grant fungsi, trigger, bucket) -- satu baris "kategori:objek md5". Jalankan
-- di database hasil rebuild DAN di production (SQL Editor), lalu bandingkan.
-- Fungsi milik ekstensi & ping_test_fn* sengaja dikecualikan.
with
cols as (
  select 'col:'||c.relname k, md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''), ',' order by a.attname)) h
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
  where c.relkind in ('r','p') group by c.relname),
cons as (
  select 'con:'||c.relname k, md5(string_agg(co.conname||'='||pg_get_constraintdef(co.oid), ',' order by co.conname)) h
  from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  group by c.relname),
idx as (
  select 'idx:'||t.relname k, md5(string_agg(pg_get_indexdef(i.indexrelid), ',' order by pg_get_indexdef(i.indexrelid))) h
  from pg_index i join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace and n.nspname='public'
  group by t.relname),
pol as (
  select 'pol:'||schemaname||'.'||tablename k, md5(string_agg(policyname||'|'||cmd||'|'||permissive||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), ',' order by policyname)) h
  from pg_policies where schemaname in ('public','storage') group by schemaname, tablename),
rls as (
  select 'rls:'||c.relname k, md5(c.relrowsecurity::text) h
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public' where c.relkind='r'),
fn as (
  select 'fn:'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k,
    md5(p.prosecdef::text||'|'||coalesce(array_to_string(p.proconfig,','),'')||'|'||pg_get_function_result(p.oid)||'|'||regexp_replace(replace(p.prosrc,E'\r',''),'\s+',' ','g')) h
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname not like 'ping_test%' and not exists (select 1 from pg_depend dep where dep.objid=p.oid and dep.deptype='e')),
acl as (
  select 'acl:'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k,
    md5(has_function_privilege('anon',p.oid,'execute')::text||has_function_privilege('authenticated',p.oid,'execute')::text) h
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname not like 'ping_test%' and not exists (select 1 from pg_depend dep where dep.objid=p.oid and dep.deptype='e')),
trg as (
  select 'trg:'||c.relname k, md5(string_agg(pg_get_triggerdef(t.oid), ',' order by t.tgname)) h
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users')) group by c.relname),
bkt as (
  select 'bucket:'||id k, md5(public::text) h from storage.buckets)
select k||' '||h from (select * from cols union all select * from cons union all select * from idx union all select * from pol
  union all select * from rls union all select * from fn union all select * from acl union all select * from trg union all select * from bkt) x
order by 1;
