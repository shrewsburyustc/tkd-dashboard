-- =====================================================================
-- 0054_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0054 (Finance's event money
--   report and CSV rows) adds, in 0052_fingerprints.sql's format
--   (kind, item, detail):
--     function       the six new functions (four internal helpers and the
--                    two app functions finance_event_report and
--                    finance_event_export): code fingerprint (an md5 of
--                    the code without comments and spaces), security
--                    definer, settings (must say search_path=""), owner
--                    and who may call it (role:EXECUTE, sorted)
--     function-kind  each one's volatility, language and result
--     table          finance_event_exports: RLS on/off, owner, the exact
--                    list of rights (there must be none for anyone in the
--                    app) and read rules (there must be none)
--     trigger        the three triggers on it (append-only, history, no
--                    "empty the table" shortcut)
--     constraint     each table rule with its full text
--
-- WHY
--   Same idea as the other *_fingerprints.sql files: run.mjs (step0054)
--   prints this for the tested copy; after Jeffrey pastes 0054 into the
--   SQL Editor, Claude runs this on production through the read-only
--   connection and every line must match. (0011's, 0017's, 0018's,
--   0026's, 0037's and 0047's fingerprints files list every finance_*
--   function, so each gains the six new function lines - expected;
--   run.mjs checks that nothing else in any file moves.)
--
-- CONNECTOR-SAFE: a single read-only SELECT without the words the
-- Supabase connection refuses. The rows are sorted byte by byte
-- (collate "C"), so the list comes out in the same order in PGlite and on
-- production (ICU text sorting).
-- =====================================================================

with fns(name) as (
  values ('finance_event_check'), ('finance_event_items'), ('finance_event_figures'), ('finance_event_extras'),
         ('finance_event_report'), ('finance_event_export')
)
select fp.* from (
select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' definer=' || p.prosecdef::text
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
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' language=' || l.lanname || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
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
                                                       order by t.attname collate "C", a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                       from pg_attribute t, aclexplode(t.attacl) as a
                                      where t.attrelid = c.oid and t.attnum > 0 and t.atttypid <> 0), '')
         || ' policies=' || coalesce((select string_agg(pp.policyname || ':' || pp.cmd || ':' || array_to_string(pp.roles, '+')
                                                        || ':' || coalesce(pp.qual, ''), ',' order by pp.policyname collate "C")
                                        from pg_policies pp
                                       where pp.schemaname = 'public' and pp.tablename = c.relname), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'finance_event_exports'
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where t.tgrelid = to_regclass('public.finance_event_exports')
   and not t.tgisinternal
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid = to_regclass('public.finance_event_exports')
) as fp
 order by fp.kind collate "C", fp.item collate "C";
