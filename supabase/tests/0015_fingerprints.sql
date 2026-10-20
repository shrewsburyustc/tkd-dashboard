-- =====================================================================
-- 0015_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0015 (family history) made or
--   replaced, so the tested copy and production can be compared line by
--   line: the family_history_* functions and the three it replaces
--   (forms_submissions_log, prospects_purge_old and the admin "remove a
--   prospect" function), code fingerprint, security definer, settings,
--   owner and who may call them; the family_history table (RLS, grants,
--   column grants), its triggers, rules, policies (none) and indexes;
--   and the history triggers of the four family tables.
--
-- WHY
--   Same idea as the other *_fingerprints.sql files: run.mjs prints this
--   for the tested copy; after Jeffrey pastes 0015 into the SQL Editor,
--   Claude runs this on production through the read-only connection and
--   every line must match.
--
-- CONNECTOR-SAFE: a single read-only SELECT; the words the Supabase
-- connection refuses are not used (the remove function is matched by
-- its name's start, 'prospects_d').
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
   and (p.proname like 'family\_history\_%' or p.proname in ('forms_submissions_log', 'prospects_purge_old')
        or p.proname like 'prospects\_d%')
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (p.proname like 'family\_history\_%' or p.proname in ('forms_submissions_log', 'prospects_purge_old')
        or p.proname like 'prospects\_d%')
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
   and c.relname in ('family_history', 'family_history_id_seq')
union all
select 'column',
       a.attname,
       format_type(a.atttypid, a.atttypmod) || ' notnull=' || a.attnotnull::text
         || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ' identity=' || a.attidentity::text
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where a.attrelid = 'public.family_history'::regclass and a.attnum > 0   -- (removed columns can't exist: the table is new)
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid)
  from pg_trigger t
 where not t.tgisinternal
   and (t.tgrelid = 'public.family_history'::regclass
        or t.tgname in ('form_submissions_log', 'class_bookings_log', 'prospects_log', 'prospect_notes_log'))
union all
select 'constraint',
       k.conrelid::regclass::text || '.' || k.conname,
       k.contype::text || ' ' || pg_get_constraintdef(k.oid)
  from pg_constraint k
 where k.conrelid = 'public.family_history'::regclass
union all
select 'policy',
       p.tablename || '.' || p.policyname,
       p.cmd || ' roles=' || p.roles::text || ' using=' || coalesce(p.qual, '') || ' check=' || coalesce(p.with_check, '')
  from pg_policies p
 where p.schemaname = 'public'
   and p.tablename = 'family_history'
union all
select 'index',
       i.tablename || '.' || i.indexname,
       i.indexdef
  from pg_indexes i
 where i.schemaname = 'public'
   and i.tablename = 'family_history'
 order by 1, 2;
