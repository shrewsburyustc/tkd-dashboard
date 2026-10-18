-- =====================================================================
-- 0008_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0008 (Calendar) made, so the
--   tested copy and production can be compared line by line:
--     function      - each calendar_* function: body_md5 of its code
--                     without comments and spaces, security definer,
--                     settings (must say search_path=""), owner, and who
--                     may call it
--     table         - each calendar table: RLS on/off and its grants
--     trigger       - every trigger on the four calendar tables
--     constraint    - every table rule (keys, foreign keys, checks)
--     policy        - the read rules (RLS policies)
--     function-kind - each function's volatility and return type
--     index         - every index (incl. the "type names are unique
--                     ignoring case" one)
--
-- WHY
--   Same idea as 0003/0004/0007_fingerprints.sql: run.mjs prints this for
--   the tested copy; after Jeffrey pastes 0008 into the SQL Editor,
--   Claude runs this on production through the read-only connection and
--   every line must match.
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
   and p.proname like 'calendar\_%'
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
   and c.relname in ('calendar_event_types', 'calendar_events', 'calendar_closures', 'calendar_closure_classes')
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid)
  from pg_trigger t
 where t.tgrelid in ('public.calendar_event_types'::regclass, 'public.calendar_events'::regclass,
                     'public.calendar_closures'::regclass, 'public.calendar_closure_classes'::regclass)
   and not t.tgisinternal
union all
select 'constraint',
       k.conrelid::regclass::text || '.' || k.conname,
       k.contype::text || ' ' || pg_get_constraintdef(k.oid)
  from pg_constraint k
 where k.conrelid in ('public.calendar_event_types'::regclass, 'public.calendar_events'::regclass,
                      'public.calendar_closures'::regclass, 'public.calendar_closure_classes'::regclass)
union all
select 'policy',
       p.tablename || '.' || p.policyname,
       p.cmd || ' roles=' || p.roles::text || ' using=' || coalesce(p.qual, '') || ' check=' || coalesce(p.with_check, '')
  from pg_policies p
 where p.schemaname = 'public'
   and p.tablename in ('calendar_event_types', 'calendar_events', 'calendar_closures', 'calendar_closure_classes')
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'calendar\_%'
union all
select 'index',
       i.tablename || '.' || i.indexname,
       i.indexdef
  from pg_indexes i
 where i.schemaname = 'public'
   and i.tablename in ('calendar_event_types', 'calendar_events', 'calendar_closures', 'calendar_closure_classes')
 order by 1, 2;
