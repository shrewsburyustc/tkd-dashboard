-- =====================================================================
-- 0049_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with one row about migration 0049 (the top-bar people
--   search, Dashboard core M16, rulebook v1.144): the ONE function 0049
--   adds, people_search, in 0034_fingerprints.sql's format (kind, item,
--   detail): body_md5 (an md5 of its code without comments and spaces),
--   language, volatility (s = stable: it can't write), return type,
--   security definer, settings (must say search_path=""), owner, and who
--   may call it (role:EXECUTE, sorted).
--
-- WHY
--   Same idea as 0034_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0049) prints this row for the tested function. After Jeffrey
--   pastes 0049 into the SQL Editor, Claude runs this file through the
--   read-only connection and the row must match exactly. That proves
--   production has exactly the code and rights that passed the tests.
--   Before 0049 it answers no row.
--   Expected change elsewhere: none. No other fingerprint file lists a
--   function named people_search, so every other fingerprint file stays
--   exactly as it was (run.mjs step0049 checks that).
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
   and p.proname = 'people_search'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
