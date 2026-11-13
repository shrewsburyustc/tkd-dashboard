-- =====================================================================
-- 0052_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing the five Finance functions migration 0052 replaces
--   (finance_chain_steps_core, finance_money_rows_core, finance_day,
--   finance_payment_detail, finance_export) and the one table rule it
--   rebuilds (finance_day_closing_items_source_check): each function's
--   code fingerprint, security definer, settings, owner and who may call
--   it, plus its volatility, language and RESULT; the rule's text.
--
-- WHY
--   Same idea as the other *_fingerprints.sql files: run.mjs (step0052)
--   prints this for the tested copy; after Jeffrey pastes 0052 into the
--   SQL Editor, Claude runs this on production through the read-only
--   connection and every line must match. (0011's, camps' 0017's, 0018's,
--   0026's, 0037's, 0047's and 0022's fingerprints files list some of
--   these functions and the rule, so their lines change with 0052 -
--   expected; run.mjs checks that only these functions' and this rule's
--   lines change.)
--
-- CONNECTOR-SAFE: a single read-only SELECT without the words the
-- Supabase connection refuses. The rows are sorted byte by byte
-- (collate "C"), so the list comes out in the same order in PGlite and on
-- production (ICU text sorting).
-- =====================================================================

with fns(name) as (
  values ('finance_chain_steps_core'), ('finance_money_rows_core'), ('finance_day'), ('finance_payment_detail'), ('finance_export')
)
select fp.* from (
select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' definer=' || p.prosecdef::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (select name from fns)
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' language=' || l.lanname || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname = 'public'
   and p.proname in (select name from fns)
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conname = 'finance_day_closing_items_source_check'
   and c.connamespace = 'public'::regnamespace
) as fp
 order by fp.kind collate "C", fp.item collate "C";
