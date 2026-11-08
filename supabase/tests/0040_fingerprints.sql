-- =====================================================================
-- 0040_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing the two functions migration 0040 (the clean-up
--   after 0036: no old child shape, no plain-text Address; rulebook
--   v0.640) replaced, one row each:
--     function       forms_check_answers and forms_submit_core:
--                    body_md5 (an md5 of its code without comments and
--                    spaces), security definer (must say false), settings
--                    (must say search_path=""), owner, and who may call it
--                    (role:EXECUTE, sorted; "-" would mean PUBLIC - for
--                    these two only the owner: postgres:EXECUTE)
--     function-kind  the same two: volatility and return type
--
-- WHY
--   Same idea as 0036_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints these rows for the tested copy. After Jeffrey pastes 0040 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and the rows must match. That proves production has
--   exactly the code, rights and rules that passed the tests. (Before
--   0040 the same two rows show 0036's bodies - compare them with
--   0036_fingerprints.sql.)
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
         || ' definer=' || p.prosecdef::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('forms_check_answers', 'forms_submit_core')
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('forms_check_answers', 'forms_submit_core')
) as fp
 order by fp.kind collate "C", fp.item collate "C";
