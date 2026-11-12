-- =====================================================================
-- 0050_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0050 (Camps: one family link
--   and one roster per school, rulebook v0.757) made or replaced, one row
--   each, in 0041_fingerprints.sql's format (kind, item, detail):
--     function    the three functions it replaced (camp_public_camp,
--                 camp_public_signup, camp_staff_signup - now with 16
--                 inputs) and the two it added (camps_keep_public_code_2,
--                 camp_signups_set_school, both trigger functions):
--                 body_md5 (an md5 of its code without comments and
--                 spaces), language, volatility, return type, security
--                 definer, settings (must say search_path=""), owner, and
--                 who may call it (role:EXECUTE, sorted)
--     column      camp_signups.school and camps.public_code_2: type, not
--                 null, default, and who may read them (authenticated:
--                 SELECT, nobody else)
--     constraint  their table rules (exact definitions)
--     trigger     the two triggers (exact definitions)
--     view        camp_roster: an md5 of its definition (one more column,
--                 school, at the end), its options (security_invoker=true)
--                 and who may read it
--
-- WHY
--   Same idea as 0043_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0050) prints these rows for the tested copy. After Jeffrey pastes
--   0050 into the SQL Editor, he runs this file there (or Claude runs it
--   through the read-only connection) and every row must match exactly.
--   That proves production has exactly the code, rights and rules that
--   passed the tests. (Before 0050 it lists only the three older
--   functions, camp_staff_signup with its old 15 inputs, and the roster.)
--   Expected change elsewhere: see SETUP.md 0050c - body md5 of
--   camp_public_camp, camp_public_signup and the roster view in the older
--   fingerprint files, and camp_staff_signup's line (one more input).
--   Every other line - and every other fingerprint file - stays.
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
   and p.proname in ('camp_public_camp', 'camp_public_signup', 'camp_staff_signup', 'camps_keep_public_code_2', 'camp_signups_set_school')
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
 where (t.attrelid = to_regclass('public.camp_signups') and t.attname = 'school')
    or (t.attrelid = to_regclass('public.camps') and t.attname = 'public_code_2')
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       c.contype::text || ' ' || pg_get_constraintdef(c.oid)
  from pg_constraint c
 where (c.conrelid = to_regclass('public.camp_signups') and c.conname = 'camp_signups_school_fk')
    or (c.conrelid = to_regclass('public.camps')
        and c.conname in ('camps_public_code_2_key', 'camps_public_code_2_check', 'camps_public_code_2_both_check'))
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid)
  from pg_trigger t
 where not t.tgisinternal
   and t.tgname in ('camps_before_public_code_2', 'camp_signups_before_school')
union all
select 'view',
       c.relname,
       md5(pg_get_viewdef(c.oid)) || ' options=' || coalesce(array_to_string(c.reloptions, ','), '')
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'camp_roster'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
