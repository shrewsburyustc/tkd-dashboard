-- =====================================================================
-- 0027_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with one row about migration 0027 (Edit camp refuses
--   changes that break campers' extras): the ONE function 0027 replaces,
--   public.camp_update_camp, with: body_md5 (an md5 of its code without
--   comments and spaces), security definer, settings (must say
--   search_path=""), owner, and who may call it (role:EXECUTE, sorted;
--   "-" would mean PUBLIC; must be postgres and authenticated only).
--
-- WHY
--   Same idea as 0022_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints this row for the tested copy. After Jeffrey pastes 0027 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and the row must match. That proves production has
--   exactly the code and rights that passed the tests.
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
   and p.proname = 'camp_update_camp'
 order by pg_get_function_identity_arguments(p.oid) collate "C";
