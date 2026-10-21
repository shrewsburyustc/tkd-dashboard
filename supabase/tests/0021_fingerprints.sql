-- =====================================================================
-- 0021_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing the one function migration 0021 replaces,
--   public.prospects_purge_old(): its code fingerprint, security definer,
--   settings, owner and who may call it, plus its volatility and result.
--
-- WHY
--   Same idea as the other *_fingerprints.sql files: run.mjs prints this
--   for the tested copy; after Jeffrey pastes 0021 into the SQL Editor,
--   Claude runs this on production through the read-only connection and
--   every line must match. (0015_fingerprints.sql lists the same function,
--   so its purge line changes with 0021 - expected; run.mjs checks that
--   it is the ONLY line that changes.)
--
-- CONNECTOR-SAFE: a single read-only SELECT without the words the
-- Supabase connection refuses.
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
   and p.proname = 'prospects_purge_old'
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'prospects_purge_old'
 order by 1, 2;
