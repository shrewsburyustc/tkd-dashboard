-- =====================================================================
-- 0023_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0023 (Star
--   result email texts + M5 + the CSV keys), in 0006_fingerprints.sql's format (kind,
--   item, detail):
--     function - the 4 functions 0023 makes or replaces
--                (star_result_text_problem, star_set_result_text,
--                star_update_event, star_results_csv), with: body_md5 (an md5 of its code
--                without comments and spaces), language, volatility,
--                return type, security definer, settings (must say
--                search_path=""), owner, and who may call it
--                (role:EXECUTE, sorted)
--     table    - star_result_texts: RLS on/off and the exact list of
--                rights (table-wide and per column, read from the catalog)
--     policy   - its read rule: command, roles, the rule's text
--     trigger  - every trigger on it
--     seed     - each text's kind, version and an md5 of its text (a
--                version-1 row must show the starting text's md5)
--
-- WHY
--   supabase/tests/pglite/run.mjs (step0023) prints this list for the
--   tested copy. After Jeffrey pastes 0023 into the SQL Editor, Claude
--   runs this on production through the read-only connection and every
--   function / table / policy / trigger line must match exactly (the seed
--   lines too, until an admin changes a text). That proves production has
--   exactly the code, rights and rules that passed the tests.
--   Expected change elsewhere: in 0006_fingerprints.sql only the lines of
--   star_update_event(...) (M5) and star_results_csv(...) (the CSV keys)
--   change; every other 0006 line stays.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (run.mjs checks this).
-- =====================================================================

select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' lang=' || l.lanname
         || ' volatility=' || p.provolatile::text
         || ' returns=' || p.prorettype::regtype::text
         || ' definer=' || p.prosecdef::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname = 'public'
   and p.proname in ('star_result_text_problem', 'star_set_result_text', 'star_update_event', 'star_results_csv')
union all
select 'table',
       c.relname,
       'rls=' || c.relrowsecurity
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
         || ' columns=' || coalesce((select string_agg(t.attname || '>' || a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                       order by t.attname, a.grantee::regrole::text, a.privilege_type)
                                       from pg_attribute t, aclexplode(t.attacl) as a
                                      where t.attrelid = c.oid and t.attnum > 0 and t.atttypid <> 0), '')
         || ' owner=' || c.relowner::regrole::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'star_result_texts'
union all
select 'policy',
       p.tablename || '.' || p.policyname,
       'cmd=' || p.cmd || ' roles=' || array_to_string(p.roles, ',') || ' permissive=' || p.permissive
         || ' using=' || coalesce(p.qual, '') || ' check=' || coalesce(p.with_check, '')
  from pg_policies p
 where p.schemaname = 'public' and p.tablename = 'star_result_texts'
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where t.tgrelid = to_regclass('public.star_result_texts')
   and not t.tgisinternal
union all
select 'seed',
       r.kind,
       'version=' || r.version || ' body_md5=' || md5(r.body)
  from public.star_result_texts r
 order by 1, 2;
