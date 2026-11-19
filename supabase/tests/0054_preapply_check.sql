-- =====================================================================
-- 0054_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0054 (Finance's event
--   money report), and again right after. One row:
--     core_is_0052   true = finance_money_rows_core is exactly 0052's
--                    version (the one 0054 was built over: md5
--                    534cb48c5cc6d5f6c9be6ce4ca0e0d8d of its code without
--                    comments and spaces, the same md5 the guard at the top
--                    of 0054 checks). false = something changed it since:
--                    0054 would refuse to run - rebuild it first.
--     table_there    true once finance_event_exports exists (after 0054)
--     functions      how many of the six new functions exist (0 before
--                    0054, 6 after)
--   Before 0054: true / false / 0. After 0054: true / true / 6.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses (run.mjs checks that).
-- =====================================================================

select coalesce((select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) = '534cb48c5cc6d5f6c9be6ce4ca0e0d8d'
                   from pg_proc p
                  where p.oid = to_regprocedure('public.finance_money_rows_core(text, date, date, text, uuid)')), false) as core_is_0052,
       to_regclass('public.finance_event_exports') is not null as table_there,
       (select count(*)
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('finance_event_check', 'finance_event_items', 'finance_event_figures', 'finance_event_extras',
                             'finance_event_report', 'finance_event_export'))::integer as functions;
