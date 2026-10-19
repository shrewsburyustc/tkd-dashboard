-- =====================================================================
-- 0011_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0011 (Finance),
--   in 0005_fingerprints.sql's format (kind, item, detail):
--     function   - every finance_* function (the 13 the app calls and
--                  the internal helpers and trigger functions), with:
--                  body_md5 (an md5 of its code without comments and
--                  spaces), security definer, settings (must say
--                  search_path=""), owner, and who may call it
--                  (role:EXECUTE, sorted)
--     table      - the 5 finance_* tables: RLS on/off, owner, the exact
--                  list of rights (table-wide and per column) and read
--                  rules (there must be none)
--     trigger    - every trigger on those tables
--     constraint - each table rule (key, foreign key, checks) with the
--                  rule's full text
--
-- WHY
--   supabase/tests/pglite/run.mjs prints this list for the tested copy.
--   After Jeffrey pastes 0011 into the SQL Editor, Claude runs this on
--   production through the read-only connection and every line must
--   match. That proves production has exactly the code, rights and rules
--   that passed the tests.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (run.mjs checks that).
-- =====================================================================

with tbls(name) as (
  values ('finance_day_closings'), ('finance_day_closing_items'), ('finance_settings'),
         ('finance_reminder_times'), ('finance_exports')
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
   and p.proname like 'finance\_%'
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
