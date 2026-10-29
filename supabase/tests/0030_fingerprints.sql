-- =====================================================================
-- 0030_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0030 (Color Belt: Mark paid
--   with a way to pay, History, results CSV) adds or replaces, each with
--   a "fingerprint":
--     function   the 5 new app functions, the helper
--                testing_history_strip, the guard testing_downloads_guard
--                and the 6 REPLACED live functions (the 2 Undo payment,
--                the 2 Edit payment, Move to private and Undo move -
--                v0.418 / v0.419): body_md5 (an
--                md5 of the code without comments and spaces), security
--                definer, settings (must say search_path=""), owner, and
--                who may call it (role:EXECUTE, sorted)
--     table      testing_downloads: RLS on/off, owner, table rights,
--                column rights, read rules (policies)
--     column     the two new paying_by_before columns: type, nullable,
--                and who may read them (must be nobody)
--     trigger    testing_downloads' triggers, with their full text
--     constraint testing_downloads' rules and the two new
--                paying_by_before rules, with their full text
--
-- WHY
--   Same idea as 0014_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints this list for the tested copy. After Jeffrey pastes 0030 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and every line must match. That proves production has
--   exactly the code, rights and rules that passed the tests.
--   (0003_, 0005_ and 0014_fingerprints.sql then differ from before 0030
--   ONLY as SETUP.md 0030c says: the six replaced function lines, the new
--   testing_* function lines in 0003's list, and in 0014's file the new
--   paying_by_before rule line and column right.)
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (run.mjs checks this).
-- =====================================================================

with fns(name) as (
  values ('testing_mark_paid_by'), ('testing_private_mark_paid_by'),
         ('testing_undo_payment'), ('testing_private_undo_payment'),
         ('testing_edit_payment'), ('testing_private_edit_payment'),
         ('testing_move_to_private'), ('testing_private_undo_move'),
         ('testing_history_strip'), ('testing_registration_history'), ('testing_private_history'),
         ('testing_downloads_guard'), ('testing_results_csv')
),
cols(tbl, col) as (
  values ('testing_payments', 'paying_by_before'), ('testing_private_payments', 'paying_by_before')
),
cons(name) as (
  values ('testing_payments_paying_by_before_check'), ('testing_private_payments_paying_by_before_check')
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
 where n.nspname = 'public' and c.relname = 'testing_downloads'
union all
select 'column',
       x.tbl || '.' || x.col,
       format_type(t.atttypid, t.atttypmod) || ' notnull=' || t.attnotnull
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(t.attacl) as a), '')
  from cols x
  join pg_attribute t on t.attrelid = to_regclass('public.' || x.tbl) and t.attname = x.col and t.attnum > 0
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where t.tgrelid = to_regclass('public.testing_downloads')
   and not t.tgisinternal
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid = to_regclass('public.testing_downloads')
    or (c.conrelid in (to_regclass('public.testing_payments'), to_regclass('public.testing_private_payments'))
        and c.conname in (select name from cons))
 order by 1, 2;
