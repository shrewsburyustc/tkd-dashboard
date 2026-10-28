-- =====================================================================
-- 0031_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0031 (class ages on the
--   booking forms, rulebook v0.619) made or replaced, one row each:
--     function       the new schedule_set_class_ages and the five it
--                    replaced (schedule_before_write, forms_open_times,
--                    forms_public_get, forms_public_submit,
--                    prospects_open_times): body_md5 (an md5 of its code
--                    without comments and spaces), security definer,
--                    settings (must say search_path=""), owner, and who
--                    may call it (role:EXECUTE, sorted; "-" would mean
--                    PUBLIC)
--     function-kind  the same six: volatility and return type
--     table          schedule_class_ages: RLS on, table and column rights
--     trigger / constraint / policy   on schedule_class_ages
--
-- WHY
--   Same idea as 0027_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints these rows for the tested copy. After Jeffrey pastes 0031 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and the rows must match. That proves production has
--   exactly the code and rights that passed the tests. (Before 0031 it
--   lists only the five older functions: compare those with the 0007 /
--   0009 / 0012 records.)
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses. run.mjs checks this.
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
   and p.proname in ('schedule_set_class_ages', 'schedule_before_write', 'forms_open_times', 'forms_public_get',
                     'forms_public_submit', 'prospects_open_times')
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('schedule_set_class_ages', 'schedule_before_write', 'forms_open_times', 'forms_public_get',
                     'forms_public_submit', 'prospects_open_times')
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
   and c.relname = 'schedule_class_ages'
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname = 'schedule_class_ages'
   and not t.tgisinternal
union all
select 'constraint',
       k.conrelid::regclass::text || '.' || k.conname,
       k.contype::text || ' ' || pg_get_constraintdef(k.oid)
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname = 'schedule_class_ages'
union all
select 'policy',
       p.tablename || '.' || p.policyname,
       p.cmd || ' roles=' || p.roles::text || ' using=' || coalesce(p.qual, '') || ' check=' || coalesce(p.with_check, '')
  from pg_policies p
 where p.schemaname = 'public'
   and p.tablename = 'schedule_class_ages'
 order by 1, 2;
