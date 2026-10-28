-- =====================================================================
-- 0028_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with one row about migration 0028 (Star start times 6:00
--   AM - 10:00 PM every 5 minutes): the ONE function 0028 replaces,
--   public.star_start_time_is_valid, in 0023_fingerprints.sql's format
--   (kind, item, detail): body_md5 (an md5 of its code without comments
--   and spaces), language, volatility (i = immutable), return type,
--   security definer, settings (must say search_path=""), owner, and who
--   may call it (role:EXECUTE, sorted; must be the owner postgres only).
--
-- WHY
--   Same idea as 0023_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0028) prints this row for the tested copy. After Jeffrey pastes
--   0028 into the SQL Editor, he runs this file there (or Claude runs it
--   through the read-only connection) and the row must match exactly.
--   That proves production has exactly the code and rights that passed
--   the tests.
--   Expected change elsewhere: in 0006_fingerprints.sql only the line of
--   star_start_time_is_valid(p_time time) changes (its body md5); every
--   other 0006 line - and every other fingerprint file - stays.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses. run.mjs checks this.
-- =====================================================================

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
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname = 'public'
   and p.proname = 'star_start_time_is_valid'
 order by 1, 2;
