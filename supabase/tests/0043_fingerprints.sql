-- =====================================================================
-- 0043_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0043 (Camps Fill in, rulebook
--   v0.740 / v0.741) made or replaced, one row each, in
--   0041_fingerprints.sql's format (kind, item, detail):
--     function    the three functions it replaced (camp_public_signup_core,
--                 now with 18 inputs; camp_public_signup;
--                 camp_camper_detail) and the two it added
--                 (camp_staff_form, camp_staff_signup): body_md5 (an md5
--                 of its code without comments and spaces), language,
--                 volatility, return type, security definer, settings
--                 (must say search_path=""), owner, and who may call it
--                 (role:EXECUTE, sorted)
--     column      camp_signups.source and camp_signups.entered_by: type,
--                 not null, default, and who may read them (nobody but
--                 the owner: the app reads them through the functions)
--     constraint  their two table rules (exact definitions)
--
-- WHY
--   Same idea as 0041_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0043) prints these rows for the tested copy. After Jeffrey pastes
--   0043 into the SQL Editor, he runs this file there (or Claude runs it
--   through the read-only connection) and every row must match exactly.
--   That proves production has exactly the code, rights and rules that
--   passed the tests. (Before 0043 it lists only the three older
--   functions, the core with its old 16 inputs.)
--   Expected change elsewhere: in 0013_fingerprints.sql and
--   0022_fingerprints.sql only the lines of camp_public_signup_core (two
--   more inputs and a new body md5; the rest of the line the same),
--   camp_public_signup and camp_camper_detail (body md5 only). Every other
--   line - and every other fingerprint file - stays.
--   Sorted with collate "C" (byte order), so PGlite and production list
--   the rows in the same order.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses. run.mjs checks this.
-- =====================================================================

select fp.kind, fp.item, fp.detail from (
select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' lang=' || l.lanname
         || ' volatility=' || p.provolatile::text
         || ' returns=' || p.prorettype::regtype::text
         || ' definer=' || p.prosecdef::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname = 'public'
   and p.proname in ('camp_public_signup_core', 'camp_public_signup', 'camp_camper_detail', 'camp_staff_form', 'camp_staff_signup')
union all
select 'column',
       t.attrelid::regclass::text || '.' || t.attname,
       format_type(t.atttypid, t.atttypmod) || ' notnull=' || t.attnotnull::text
         || ' default=' || coalesce((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
                                      where d.adrelid = t.attrelid and d.adnum = t.attnum), '')
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(t.attacl) as a), '')
  from pg_attribute t
 where t.attrelid = to_regclass('public.camp_signups')
   and t.attname in ('source', 'entered_by')
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       c.contype::text || ' ' || pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid = to_regclass('public.camp_signups')
   and c.conname in ('camp_signups_source_check', 'camp_signups_entered_by_check')
) as fp
 order by fp.kind collate "C", fp.item collate "C";
