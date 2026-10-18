-- =====================================================================
-- 0007_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0007 (Schedule) made, so the
--   tested copy and production can be compared line by line:
--     function - each schedule_* function: body_md5 of its code without
--                comments and spaces, security definer, settings (must say
--                search_path=""), owner, and who may call it
--     table    - each schedule table (incl. schedule_slot_classes, v0.141): RLS on/off and its grants
--     trigger  - every trigger on the three schedule tables
--     constraint    - every table rule: keys, foreign keys (incl. "on
--                     delete cascade" to Testing), checks, unique rules
--     policy        - the read rules (RLS policies)
--     function-kind - each function's volatility and return type
--   (constraint / policy / function-kind added after security review)
--
-- WHY
--   Same idea as 0003/0004_fingerprints.sql: run.mjs prints this for the
--   tested copy; after Jeffrey pastes 0007 into the SQL Editor, Claude
--   runs this on production through the read-only connection and every
--   line must match.
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
   and p.proname like 'schedule\_%'
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
   and c.relname in ('schedule_versions', 'schedule_slots', 'schedule_class_colors', 'schedule_slot_classes')
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid)
  from pg_trigger t
 where t.tgrelid in ('public.schedule_versions'::regclass, 'public.schedule_slots'::regclass,
                     'public.schedule_class_colors'::regclass, 'public.schedule_slot_classes'::regclass)
   and not t.tgisinternal
union all
select 'constraint',
       k.conrelid::regclass::text || '.' || k.conname,
       k.contype::text || ' ' || pg_get_constraintdef(k.oid)
  from pg_constraint k
 where k.conrelid in ('public.schedule_versions'::regclass, 'public.schedule_slots'::regclass,
                      'public.schedule_class_colors'::regclass, 'public.schedule_slot_classes'::regclass)
union all
select 'policy',
       p.tablename || '.' || p.policyname,
       p.cmd || ' roles=' || p.roles::text || ' using=' || coalesce(p.qual, '') || ' check=' || coalesce(p.with_check, '')
  from pg_policies p
 where p.schemaname = 'public'
   and p.tablename in ('schedule_versions', 'schedule_slots', 'schedule_class_colors', 'schedule_slot_classes')
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'schedule\_%'
 order by 1, 2;
