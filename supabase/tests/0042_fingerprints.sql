-- =====================================================================
-- 0042_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with one row about migration 0042 ("Copy to Worcester /
--   Shrewsbury", rulebook v0.642): the ONE function 0042 adds,
--   forms_copy_to_school, in 0034_fingerprints.sql's format (kind, item,
--   detail): body_md5 (an md5 of its code without comments and spaces),
--   language, volatility (v = volatile), return type, security definer,
--   settings (must say search_path=""), owner, and who may call it
--   (role:EXECUTE, sorted).
--
-- WHY
--   Same idea as 0034_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0042) prints this row for the tested copy. After Jeffrey pastes
--   0042 into the SQL Editor, Claude runs this file through the read-only
--   connection and the row must match exactly. That proves production has
--   exactly the code and rights that passed the tests. Before 0042 it
--   answers no row.
--   Expected change elsewhere: 0009_fingerprints.sql lists every forms_*
--   function, so it gains two lines for the new function (its "function"
--   line - the same md5, definer, settings, owner and rights as here -
--   and its "function-kind" line: volatility=v returns=jsonb). Nothing in
--   it changes or goes, and every other fingerprint file stays as it was.
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
   and p.proname = 'forms_copy_to_school'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
