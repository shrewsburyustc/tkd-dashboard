-- =====================================================================
-- 0024_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0024 (the Black
--   Belt rubric editor), in 0016_fingerprints.sql's format (kind, item,
--   detail):
--     function   - every function 0024 creates or replaces (the 5 staff
--                  write functions, the 3 replaced 0016 functions, the
--                  replaced trigger function bb_cycles_rules and the 14
--                  internal helpers / trigger functions), with: body_md5
--                  (an md5 of its code without comments and spaces),
--                  security definer, volatility, settings (must say
--                  search_path=""), owner, and who may call it
--     table      - bb_default_rubric and bb_rubric_undo: RLS on/off, owner,
--                  the exact rights (table-wide and per column)
--     policy     - their read rules
--     trigger    - every trigger on the two tables, and bb_cycles'
--                  bb_cycles_before_write and bb_cycles_rules (with their
--                  arguments)
--     constraint - the two tables' rules, and bb_cycles_requirements_check
--     index      - the two tables' indexes
--     check      - one row "0016_rerun": "ok" while 0024's rules are in
--                  place; "0016 RE-RUN OVER 0024 ..." if 0016 was pasted
--                  again after 0024 (which silently puts back 0016's
--                  copy and lock rules - SETUP "Migration 0024", 0024f)
-- The rows are sorted byte by byte (collate "C"), so the list comes out in
-- the same order in PGlite and on production.
--
-- WHY
--   supabase/tests/pglite/run.mjs (step0024) prints this list for the
--   tested copy. After Jeffrey pastes 0024 into the SQL Editor, Claude runs
--   this on production through the read-only connection and every line
--   must match: production then has exactly the code, rights and rules
--   that passed the tests.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses. run.mjs checks that.
-- =====================================================================

with fns(name) as (
  values ('bb_save_default_dan'), ('bb_undo_default_dan'), ('bb_save_cycle_dan'), ('bb_undo_cycle_dan'),
         ('bb_undo_first_open'), ('bb_set_registration'), ('bb_add_cycle'), ('bb_public_cycle'), ('bb_cycles_rules'),
         ('bb_rubric_num_ok'), ('bb_rubric_int_ok'), ('bb_rubric_letters'), ('bb_rubric_brackets_problems'),
         ('bb_rubric_dan_problems'), ('bb_rubric_is_valid'), ('bb_rubric_part_max'), ('bb_rubric_most_points'),
         ('bb_rubric_from_v1'), ('bb_rubric_fresh_copy'), ('bb_rubric_public'), ('bb_rubric_put_dan'),
         ('bb_default_rubric_guard'), ('bb_rubric_undo_guard')
),
tbls(name) as (
  values ('bb_default_rubric'), ('bb_rubric_undo')
)
select fp.* from (
select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' definer=' || p.prosecdef::text
         || ' volatile=' || p.provolatile::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
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
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
         || ' columns=' || coalesce((select string_agg(t.attname || '>' || a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                       order by t.attname collate "C", a.grantee::regrole::text collate "C",
                                                                a.privilege_type collate "C")
                                       from pg_attribute t, aclexplode(t.attacl) as a
                                      where t.attrelid = c.oid and t.attnum > 0 and t.atttypid <> 0), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in (select name from tbls)
union all
select 'policy',
       pp.tablename || '.' || pp.policyname,
       pp.cmd || ' ' || pp.permissive || ' to=' || array_to_string(pp.roles, '+') || ' using=' || coalesce(pp.qual, '')
         || ' check=' || coalesce(pp.with_check, '')
  from pg_policies pp
 where pp.schemaname = 'public' and pp.tablename in (select name from tbls)
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where not t.tgisinternal
   and (t.tgrelid in (select to_regclass('public.' || name) from tbls)
        or (t.tgrelid = to_regclass('public.bb_cycles') and t.tgname in ('bb_cycles_before_write', 'bb_cycles_rules')))
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid in (select to_regclass('public.' || name) from tbls)
    or (c.conrelid = to_regclass('public.bb_cycles') and c.conname = 'bb_cycles_requirements_check')
union all
select 'index',
       i.tablename || '.' || i.indexname,
       i.indexdef
  from pg_indexes i
 where i.schemaname = 'public' and i.tablename in (select name from tbls)
union all
-- the re-run detector: 0024's rule on the rubric column, 0024's trigger
-- function (it knows the action tag bb_save_cycle_dan) and 0024's
-- trigger arguments ("requirements" as a no-bump column) must all be there
select 'check',
       '0016_rerun',
       case when coalesce((select pg_get_constraintdef(c.oid) like '%bb_rubric_is_valid%'
                             from pg_constraint c
                            where c.conrelid = to_regclass('public.bb_cycles') and c.conname = 'bb_cycles_requirements_check'), false)
             and coalesce((select p.prosrc like '%bb_save_cycle_dan%'
                             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                            where n.nspname = 'public' and p.proname = 'bb_cycles_rules'), false)
             and coalesce((select pg_get_triggerdef(t.oid) like '%''requirements''%'
                             from pg_trigger t
                            where t.tgrelid = to_regclass('public.bb_cycles') and t.tgname = 'bb_cycles_before_write'), false)
            then 'ok'
            else '0016 RE-RUN OVER 0024 — run SETUP §0024f or re-apply 0024' end
) as fp
 order by fp.kind collate "C", fp.item collate "C";
