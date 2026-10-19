-- =====================================================================
-- 0010_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0010 (Color Belt
--   phase 3: the Grading tab's results), in 0005_fingerprints.sql's
--   format (kind, item, detail):
--     function   - the 2 new staff functions, the 2 trigger functions and
--                  the 5 functions 0010 replaces, with: body_md5 (an md5
--                  of its code without comments and spaces), security
--                  definer, settings (must say search_path=""), owner,
--                  and who may call it (role:EXECUTE, sorted)
--     table      - testing_results: RLS on/off and the exact list of
--                  rights (table-wide and per column)
--     trigger    - its three triggers
--     constraint - each of its rules (key, foreign key, checks) with the
--                  rule's full text
--
-- WHY
--   Same idea as 0005_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints this list for the tested copy. After Jeffrey pastes 0010 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and every line must match. That proves production has
--   exactly the code, rights and rules that passed the tests.
--   (0005_fingerprints.sql then differs ONLY in the five replaced
--   functions' lines - expected.)
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (removed columns are skipped
-- by their type, atttypid = 0, as in 0005_fingerprints.sql).
-- =====================================================================

with fns(name) as (
  values ('testing_set_result'), ('testing_set_result_note'),
         ('testing_results_before_write'), ('testing_results_log'),
         ('testing_update_student'), ('testing_resolve_duplicate'), ('testing_restore_student'),
         ('testing_add_student'), ('testing_update_event')
)
select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' definer=' || p.prosecdef::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (select name from fns)
union all
select 'table',
       c.relname,
       'rls=' || c.relrowsecurity
         || ' owner=' || c.relowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
         || ' columns=' || coalesce((select string_agg(t.attname || '>' || a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                       order by t.attname, a.grantee::regrole::text, a.privilege_type)
                                       from pg_attribute t, aclexplode(t.attacl) as a
                                      where t.attrelid = c.oid and t.attnum > 0 and t.atttypid <> 0), '')
         || ' policies=' || coalesce((select string_agg(pp.policyname || ':' || pp.cmd || ':' || array_to_string(pp.roles, '+')
                                                        || ':' || coalesce(pp.qual, ''), ',' order by pp.policyname)
                                        from pg_policies pp
                                       where pp.schemaname = 'public' and pp.tablename = c.relname), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'testing_results'
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where t.tgrelid = to_regclass('public.testing_results')
   and not t.tgisinternal
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid = to_regclass('public.testing_results')
 order by 1, 2;
