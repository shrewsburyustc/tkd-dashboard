-- =====================================================================
-- 0047_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing the five functions migration 0047 replaces
--   (finance_money_rows_core, finance_money_rows, finance_day,
--   finance_payment_detail, finance_export): each one's code fingerprint,
--   security definer, settings, owner and who may call it, plus its
--   volatility, language and RESULT (for the two internal ones the result
--   table now ends with was_school).
--
-- WHY
--   Same idea as the other *_fingerprints.sql files: run.mjs (step0047)
--   prints this for the tested copy; after Jeffrey pastes 0047 into the
--   SQL Editor, Claude runs this on production through the read-only
--   connection and every line must match. (0011's, camps' 0017's, 0018's,
--   0026's and 0037's fingerprints files list some of these functions, so
--   their lines change with 0047 - expected; run.mjs checks that only these
--   five functions' lines change.)
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
   and p.proname in ('finance_money_rows_core', 'finance_money_rows', 'finance_day', 'finance_payment_detail', 'finance_export')
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' language=' || l.lanname || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname = 'public'
   and p.proname in ('finance_money_rows_core', 'finance_money_rows', 'finance_day', 'finance_payment_detail', 'finance_export')
 order by 1, 2;
