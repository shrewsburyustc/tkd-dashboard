-- =====================================================================
-- 0026_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query about migration 0026 (Finance: Black Belt payments in the
--   Daily report), in 0011_fingerprints.sql's format (kind, item, detail):
--     function   - the nine Finance functions 0026 replaces, with:
--                  body_md5 (an md5 of its code without comments and
--                  spaces), security definer, settings (must say
--                  search_path=""), owner, and who may call it
--                  (role:EXECUTE, sorted)
--     constraint - the two table rules 0026 replaces:
--                  finance_day_closing_items_source_check (+ black_belt)
--                  and finance_day_closings_counts_check (a counted card
--                  total may be below 0 when the expected one is)
--
-- WHY
--   supabase/tests/pglite/run.mjs prints this list for the tested copy.
--   After Jeffrey pastes 0026 into the SQL Editor, Claude runs this on
--   production through the read-only connection and every line must
--   match. (0011_fingerprints.sql, 0017_fingerprints.sql and
--   0018_fingerprints.sql then differ from their earlier records in
--   exactly these functions' and rules' lines - expected.)
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (run.mjs checks that). The
-- rows are sorted byte by byte (collate "C"), so the list comes out in
-- the same order in PGlite and on production (ICU text sorting).
-- =====================================================================

with fns(name) as (
  values ('finance_chain_steps_core'), ('finance_money_rows_core'), ('finance_figures_from'),
         ('finance_closing_changes_from'), ('finance_payment_detail'), ('finance_day'), ('finance_export'),
         ('finance_close_day'), ('finance_day_both')
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
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conname in ('finance_day_closing_items_source_check', 'finance_day_closings_counts_check')
   and c.connamespace = 'public'::regnamespace
) as fp
 order by fp.kind collate "C", fp.item collate "C";
