-- =====================================================================
-- 0045_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with one row about migration 0045 (the Calendar reader,
--   rulebook v0.645): the ONE function 0045 adds, calendar_items, in
--   0034_fingerprints.sql's format (kind, item, detail): body_md5 (an md5
--   of its code without comments and spaces), language, volatility
--   (s = stable: it can't write), return type, security definer, settings
--   (must say search_path=""), owner, and who may call it (role:EXECUTE,
--   sorted).
--
-- WHY
--   Same idea as 0034_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0045) prints this row for the tested function. After Jeffrey
--   pastes 0045 into the SQL Editor, Claude runs this file through the
--   read-only connection and the row must match exactly. That proves
--   production has exactly the code and rights that passed the tests.
--   Before 0045 it answers no row.
--   Expected change elsewhere: 0008_fingerprints.sql lists every function
--   whose name starts calendar_, so it gains two lines for the new function
--   (its "function" line - the same md5, definer, settings, owner and rights
--   as here - and its "function-kind" line: volatility=s returns=jsonb).
--   Nothing in it changes or goes, and every other fingerprint file stays
--   exactly as it was.
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
   and p.proname = 'calendar_items'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
