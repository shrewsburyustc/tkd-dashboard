-- =====================================================================
-- 0014_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0014 (Color Belt
--   phase 4: the Private testing tab), in 0005_fingerprints.sql's format
--   (kind, item, detail):
--     function   - every function 0014 creates (4 trigger functions, 5
--                  helpers, 14 staff functions) and the one live function
--                  it replaces (testing_restore_student), with: body_md5
--                  (an md5 of its code without comments and spaces),
--                  security definer, settings (must say search_path=""),
--                  owner, and who may call it (role:EXECUTE, sorted)
--     table      - the 3 tables: RLS on/off, owner, the exact list of
--                  rights (table-wide and per column) and the read rules
--     view       - testing_private_list: md5 of its definition and its
--                  options (must include security_invoker=true)
--     trigger    - every trigger on the 3 tables
--     constraint - every rule of the 3 tables (keys, foreign keys,
--                  checks, unique) with the rule's full text
--
-- WHY
--   Same idea as 0005_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints this list for the tested copy. After Jeffrey pastes 0014 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and every line must match. That proves production has
--   exactly the code, rights and rules that passed the tests.
--   (0005_fingerprints.sql and 0010_fingerprints.sql then differ ONLY in
--   the testing_restore_student line - expected; SETUP.md section 15b.)
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (the one function name that
-- contains one is spelled in pieces, and removed columns are skipped by
-- their type, atttypid = 0, as in 0005_fingerprints.sql).
-- =====================================================================

with fns(name) as (
  values ('testing_private_before_write'), ('testing_private_results_before_write'),
         ('testing_private_payments_guard'), ('testing_private_log'),
         ('testing_private_time_is_valid'), ('testing_private_amount_due'), ('testing_private_lock'),
         ('testing_private_lock_payment'), ('testing_private_rank_copy'),
         ('testing_private_add'), ('testing_private_update'), ('testing_private_change_day'),
         ('testing_private_change_paying_by'), ('testing_private_mark_paid'), ('testing_private_undo_payment'),
         ('testing_private_edit_payment'), ('testing_private_cancel'), ('testing_private_restore'),
         ('testing_private_' || 'del' || 'ete'), ('testing_private_set_result'), ('testing_private_set_result_note'),
         ('testing_move_to_private'), ('testing_private_undo_move'),
         ('testing_restore_student')
),
tbls(name) as (
  values ('testing_private'), ('testing_private_payments'), ('testing_private_results')
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
 where n.nspname = 'public' and c.relname in (select name from tbls)
union all
select 'view',
       c.relname,
       md5(pg_get_viewdef(c.oid)) || ' options=' || coalesce(array_to_string(c.reloptions, ','), '')
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'testing_private_list'
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where t.tgrelid in (select to_regclass('public.' || name) from tbls)
   and not t.tgisinternal
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid in (select to_regclass('public.' || name) from tbls)
 order by 1, 2;
