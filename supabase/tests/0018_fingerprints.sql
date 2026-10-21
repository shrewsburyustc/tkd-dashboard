-- =====================================================================
-- 0018_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query about migration 0018 (Finance: Color Belt private testing
--   payments), in 0011_fingerprints.sql's format (kind, item, detail):
--     function - the six Finance functions 0018 replaces, with: body_md5
--                (an md5 of its code without comments and spaces),
--                security definer, settings (must say search_path=""),
--                owner, and who may call it (role:EXECUTE, sorted)
--     index    - finance_testing_private_payments_paid_on_idx
--
-- WHY
--   supabase/tests/pglite/run.mjs prints this list for the tested copy.
--   After Jeffrey pastes 0018 into the SQL Editor, Claude runs this on
--   production through the read-only connection and every line must
--   match. (0011_fingerprints.sql then differs from its earlier record in
--   exactly these six functions' lines and its one extra index line -
--   expected.)
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (run.mjs checks that). The
-- rows are sorted byte by byte (collate "C"), so the list comes out in
-- the same order in PGlite and on production (ICU text sorting).
-- =====================================================================

with fns(name) as (
  values ('finance_chain_steps_core'), ('finance_chain_items'), ('finance_money_rows_core'),
         ('finance_figures_from'), ('finance_closing_changes_from'), ('finance_payment_detail')
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
select 'index',
       i.tablename || '.' || i.indexname,
       i.indexdef
  from pg_indexes i
 where i.schemaname = 'public' and i.indexname = 'finance_testing_private_payments_paid_on_idx'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
