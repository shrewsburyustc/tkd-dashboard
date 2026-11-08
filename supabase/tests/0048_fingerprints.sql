-- =====================================================================
-- 0048_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with one row about migration 0048 (Black Belt: the results
--   CSV lists Worcester before Shrewsbury): the ONE function 0048
--   replaces, bb_results_csv(p_cycle_id uuid), in 0046_fingerprints.sql's
--   format (kind, item, detail): body_md5 (an md5 of its code without
--   comments and spaces), language, volatility (v = volatile), return
--   type, security definer, settings (must say search_path=""), owner,
--   and who may call it (role:EXECUTE, sorted).
--
-- WHY
--   Same idea as 0046_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0048) prints this row for the tested copy. After 0048 is applied
--   to production, this file is run there and the row must match exactly.
--   That proves production has exactly the code and rights that passed
--   the tests.
--   Expected change elsewhere: in 0016_fingerprints.sql and 0025_fingerprints.sql (each lists
--   every Black Belt function) only the bb_results_csv line changes - its
--   body md5 - and every other fingerprint file stays as it was.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses. run.mjs checks this.
-- =====================================================================

select fp.* from (
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
   and p.proname = 'bb_results_csv'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
