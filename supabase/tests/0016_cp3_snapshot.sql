-- 0016_cp3_snapshot.sql - a whole-database "before / after" snapshot for CP3 (pasting 0016).
-- Why it exists: the per-migration fingerprint files cover what each migration made, but this
-- branch has no fingerprint file for camps' 0013 / 0017. This one read-only SELECT takes an md5
-- of everything in the public schema that is NOT Black Belt's (names not starting with bb_):
-- every function's code, settings, owner and call rights; every table's columns and rights;
-- every policy; every trigger. (Removed columns are skipped with atttypid <> 0, the way
-- 0016_fingerprints.sql does it, so the file never contains the refused words.) Run it just before the paste and again just after: the rows
-- must be identical (0016 may only ADD bb_ objects). Safe for the Supabase connection: one
-- SELECT, and none of the words the connection refuses.
select 'functions' as part, count(*) as items,
       md5(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' ||
                      md5(p.prosrc) || pg_get_function_result(p.oid) || p.provolatile::text || p.proisstrict::text ||
                      coalesce(array_to_string(p.proconfig, ','), '') ||
                      p.prosecdef::text || pg_get_userbyid(p.proowner) || coalesce(p.proacl::text, ''),
                      '|' order by p.proname, pg_get_function_identity_arguments(p.oid))) as md5
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname not like 'bb\_%'
union all
select 'tables', count(*),
       md5(string_agg(c.relname || ':' || c.relkind::text || ':' || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity::text || ':' ||
                      (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || ' ' ||
                                         a.attnotnull::text || ' ' || coalesce(a.attacl::text, ''), ',' order by a.attnum)
                         from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and a.atttypid <> 0),
                      '|' order by c.relname))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'v', 'S') and c.relname not like 'bb\_%'
union all
select 'policies', count(*),
       md5(string_agg(pol.tablename || '.' || pol.policyname || ':' || pol.cmd || ':' || array_to_string(pol.roles, ',') || ':' ||
                      coalesce(pol.qual, '') || ':' || coalesce(pol.with_check, ''), '|' order by pol.tablename, pol.policyname))
  from pg_policies pol
 where pol.schemaname = 'public' and pol.tablename not like 'bb\_%'
union all
select 'triggers', count(*),
       md5(string_agg(c.relname || '.' || t.tgname || ':' || pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text,
                      '|' order by c.relname, t.tgname))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and not t.tgisinternal and c.relname not like 'bb\_%'
order by 1;
