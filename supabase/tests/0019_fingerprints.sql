-- =====================================================================
-- 0019_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0019 (school phone) made: the
--   two functions (code fingerprint, security definer, settings, owner,
--   who may call them), the phone column, its check, the new trigger,
--   and the read rights on public.locations (table and column grants).
--
-- WHY
--   Same idea as the other *_fingerprints.sql files: run.mjs prints this
--   for the tested copy; after Jeffrey pastes 0019 into the SQL Editor,
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
   and p.proname in ('settings_update_school_contact', 'locations_phone_before_write')
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('settings_update_school_contact', 'locations_phone_before_write')
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
   and c.relname = 'locations'
union all
select 'column',
       a.attname,
       format_type(a.atttypid, a.atttypmod) || ' notnull=' || a.attnotnull::text
         || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where a.attrelid = 'public.locations'::regclass and a.attname = 'phone'
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid)
  from pg_trigger t
 where not t.tgisinternal
   and t.tgrelid = 'public.locations'::regclass
union all
select 'constraint',
       k.conrelid::regclass::text || '.' || k.conname,
       k.contype::text || ' ' || pg_get_constraintdef(k.oid)
  from pg_constraint k
 where k.conrelid = 'public.locations'::regclass
   and k.conname = 'locations_phone_check'
 order by 1, 2;
