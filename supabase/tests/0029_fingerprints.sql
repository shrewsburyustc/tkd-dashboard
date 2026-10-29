-- =====================================================================
-- 0029_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing the one function migration 0029 replaces,
--   public.finance_reminder_time_is_valid(time): its code fingerprint,
--   security definer, settings, owner and who may call it, plus its
--   volatility and result - and the one table rule that uses it
--   (finance_reminder_times_time_check, which 0029 does NOT change).
--
-- WHY
--   Same idea as the other *_fingerprints.sql files: run.mjs (step0029)
--   prints this for the tested copy; after Jeffrey pastes 0029 into the
--   SQL Editor, Claude runs this on production through the read-only
--   connection and every line must match. (0011's, camps' 0017's, 0018's
--   and 0026's fingerprints files list every finance_ function, so their
--   finance_reminder_time_is_valid line changes with 0029 - expected;
--   run.mjs checks that it is the ONLY line that changes.)
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
   and p.proname = 'finance_reminder_time_is_valid'
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' language=' || l.lanname || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname = 'public'
   and p.proname = 'finance_reminder_time_is_valid'
union all
select 'rule',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid = to_regclass('public.finance_reminder_times')
   and c.conname = 'finance_reminder_times_time_check'
 order by 1, 2;
