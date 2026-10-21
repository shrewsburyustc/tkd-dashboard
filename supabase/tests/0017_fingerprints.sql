-- =====================================================================
-- 0017_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Finance's fingerprints AFTER migration 0017 (camp payments in Finance):
--   the same single SELECT as 0011_fingerprints.sql - every finance_
--   function (code md5, security definer, settings, owner, who may call
--   it), the 5 finance tables (RLS, rights, read rules), their triggers,
--   their rules (constraints) and the finance_ indexes - plus 0017's own
--   index camp_payments_paid_on_idx.
--
-- WHY
--   0017 replaces five 0011 functions and widens two rules of
--   finance_day_closing_items, so after it 0011_fingerprints.sql shows
--   exactly those lines changed (expected) and THIS file is the new
--   reference: run.mjs prints it for the tested copy, and after Jeffrey
--   pastes 0017 Claude runs it on production through the read-only
--   connection - every line must match.
--
-- CONNECTOR-SAFE: one read-only SELECT, without the words the Supabase
-- connection refuses (run.mjs checks that).
-- =====================================================================

with tbls(name) as (
  values ('finance_day_closings'), ('finance_day_closing_items'), ('finance_settings'),
         ('finance_reminder_times'), ('finance_exports')
)
select fp.* from (
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
union all
select 'index',
       i.tablename || '.' || i.indexname,
       i.indexdef
  from pg_indexes i
 where i.schemaname = 'public' and (i.indexname like 'finance\_%' or i.indexname = 'camp_payments_paid_on_idx')
) as fp
 order by fp.kind collate "C", fp.item collate "C";
