-- =====================================================================
-- 0039_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0039 (Camps Record refund,
--   rulebook v1.039 / v1.040 / v0.743) made or replaced, one row each, in
--   0043_fingerprints.sql's format (kind, item, detail):
--     function    the three functions it replaced (camp_payments_guard,
--                 camp_undo_payment, camp_edit_payment) and the two it
--                 added (camp_record_refund, camp_undo_refund): body_md5
--                 (an md5 of its code without comments and spaces),
--                 language, volatility, return type, security definer,
--                 settings (must say search_path=""), owner, and who may
--                 call it (role:EXECUTE, sorted)
--     constraint  camp_payments_kind_check, the kind rule (its exact
--                 definition)
--     view        camp_roster: an md5 of its definition, its options
--                 (must say security_invoker=true) and who may read it
--
-- WHY
--   Same idea as 0043_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0039) prints these rows for the tested copy. After Jeffrey pastes
--   0039 into the SQL Editor, he runs this file there (or Claude runs it
--   through the read-only connection) and every row must match exactly.
--   That proves production has exactly the code, rights and rules that
--   passed the tests. (Before 0039 it lists the three older functions,
--   0022's kind rule and 0033's view.)
--   Expected change elsewhere: in 0013_fingerprints.sql only the lines of
--   camp_payments_guard, camp_undo_payment and camp_edit_payment (body md5
--   only) and the camp_roster view (its md5 only); in
--   0022_fingerprints.sql only camp_edit_payment (body md5 only) and the
--   camp_payments_kind_check line (the new rule); in 0033_fingerprints.sql
--   only camp_undo_payment and camp_edit_payment (body md5 only) and the
--   view line (its md5 only). Every other line - and every other
--   fingerprint file - stays.
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
   and p.proname in ('camp_payments_guard', 'camp_undo_payment', 'camp_edit_payment', 'camp_record_refund', 'camp_undo_refund')
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       c.contype::text || ' ' || pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid = to_regclass('public.camp_payments')
   and c.conname = 'camp_payments_kind_check'
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
