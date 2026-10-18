-- =====================================================================
-- 0010_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0010 (Prospects) made, so the
--   tested copy and production can be compared line by line: every
--   prospects_* / prospect_statuses_* function (code fingerprint, security
--   definer, settings, owner, who may call it), the five tables (RLS,
--   grants, column grants), their triggers, rules, policies and indexes,
--   each function's kind, and the two triggers 0010 adds to 0009's tables.
--
-- WHY
--   Same idea as 0003 / 0004 / 0007 / 0008 / 0009_fingerprints.sql: run.mjs prints
--   this for the tested copy; after Jeffrey pastes 0010 into the SQL
--   Editor, Claude runs this on production through the read-only
--   connection and every line must match.
--
-- CONNECTOR-SAFE: a single read-only SELECT; the words the Supabase
-- connection refuses are not used.
-- =====================================================================

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
   and (p.proname like 'prospects\_%' or p.proname like 'prospect\_statuses\_%')
union all
select 'table',
       c.relname,
       'rls=' || c.relrowsecurity::text
         || ' grants=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                       order by a.grantee::regrole::text, a.privilege_type)
                                       from aclexplode(c.relacl) as a), '')
         || ' columns=' || coalesce((select string_agg(att.attname || ':' || array_to_string(att.attacl, ';'), ','
                                                        order by att.attname)
                                        from pg_attribute att
                                       where att.attrelid = c.oid and att.attacl is not null), '')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('prospect_statuses', 'prospects', 'prospect_notes', 'prospect_activity', 'prospect_opens')
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid)
  from pg_trigger t
 where t.tgrelid in (select ('public.' || x)::regclass from unnest(array['prospect_statuses', 'prospects', 'prospect_notes', 'prospect_activity', 'prospect_opens']) as x)
   and not t.tgisinternal
union all
select 'constraint',
       k.conrelid::regclass::text || '.' || k.conname,
       k.contype::text || ' ' || pg_get_constraintdef(k.oid)
  from pg_constraint k
 where k.conrelid in (select ('public.' || x)::regclass from unnest(array['prospect_statuses', 'prospects', 'prospect_notes', 'prospect_activity', 'prospect_opens']) as x)
union all
select 'policy',
       p.tablename || '.' || p.policyname,
       p.cmd || ' roles=' || p.roles::text || ' using=' || coalesce(p.qual, '') || ' check=' || coalesce(p.with_check, '')
  from pg_policies p
 where p.schemaname = 'public'
   and p.tablename in ('prospect_statuses', 'prospects', 'prospect_notes', 'prospect_activity', 'prospect_opens')
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (p.proname like 'prospects\_%' or p.proname like 'prospect\_statuses\_%')
union all
select 'index',
       i.tablename || '.' || i.indexname,
       i.indexdef
  from pg_indexes i
 where i.schemaname = 'public'
   and i.tablename in ('prospect_statuses', 'prospects', 'prospect_notes', 'prospect_activity', 'prospect_opens')
union all
select 'trigger-on-0009',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid)
  from pg_trigger t
 where t.tgname in ('form_submissions_make_prospects', 'class_bookings_follow_prospect')
 order by 1, 2;
