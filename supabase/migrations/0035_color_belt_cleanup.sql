-- =====================================================================
-- 0035_color_belt_cleanup.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The small clean-up migration 0030 promised (plan: docs/Testing/
--   Color Belt Testing/TKD-ColorBelt-0030-Plan.md, "later a small
--   migration removes the old 2-argument functions"). It runs after 0030
--   (live since 2026-10-29) and stops with a clear message if 0030's
--   replacements are missing.
--
-- WHY IT EXISTS
--   0030 added "Mark paid with a way to pay" under NEW names, so the live
--   site could keep calling the old one-click functions until the new app
--   was deployed. Since main 801b757 went live the app calls only
--   testing_mark_paid_by and testing_private_mark_paid_by. The two old
--   functions are now unused doors into the payment tables; removing
--   them leaves one way to mark a student paid.
--
-- WHAT IT REMOVES (nothing else changes)
--   public.testing_mark_paid(uuid, integer)          - 0005, section 14i
--   public.testing_private_mark_paid(uuid, integer)  - 0014, section 8e
--   No table, column, row, right, rule, trigger or other function is
--   touched. Payments the old functions recorded stay exactly as they are
--   (Undo payment, Edit payment, Finance and the History line read the
--   payment rows, never these functions).
--
-- WHO ELSE CALLS THEM (checked 2026-11-04)
--   No migration's function, view, trigger or policy calls either one
--   (only 0005 / 0014 create them; 0030 names them in its guard and
--   comments). On production, no function body, view, policy, trigger
--   or pg_depend row refers to them. Section 1 checks this again at
--   paste time and stops if anything does.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase warns about destructive operations: this time they are real
--   (two functions are removed). Confirm only with Jeffrey's OK.
--   Safe to run again ("if exists": a second run changes nothing).
--   Undo: supabase/SETUP.md, "Migration 0035", 0035e.
--
-- RE-RUN ORDER (read before ever re-running an older file)
--   * Re-running 0005 or 0014 after this file puts the old function back
--     - re-run 0030 and then 0035 straight after it.
--   * Re-running 0030 after this file is fine: its guard accepts either
--     the old functions or its own *_by ones.
--
-- TESTS AFTER IT
--   0035_tests.sql, then 0005_, 0010_, 0011_, 0014_, 0018_, 0026_ and
--   0030_tests.sql again: their test payments go through a pg_temp helper
--   in each file that calls the old function while it exists and the
--   *_by version after 0035, so they run before and after it.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard. Stops - and changes nothing - when:
--    a. 0030's replacements are missing (the app would have no Mark paid)
--    b. anything else in the database still refers to the old functions
--       by name: another function's code, a view, or a read rule. (A
--       trigger can only run a trigger function, and these two are not
--       trigger functions; "drop function" without "cascade" also stops
--       on any recorded dependency.)
-- ---------------------------------------------------------------------
do $$
declare
  v_users text;
begin
  if to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer)') is null
     or to_regprocedure('public.testing_private_mark_paid_by(uuid, integer, text, integer)') is null then
    raise exception '0035 needs migration 0030 (Color Belt: Mark paid with a way to pay) first';
  end if;

  select string_agg(x.who, ', ' order by x.who) into v_users
    from (
      select 'function ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as who
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname not in ('pg_catalog', 'information_schema')
         and p.oid not in (coalesce(to_regprocedure('public.testing_mark_paid(uuid, integer)'), 0),
                           coalesce(to_regprocedure('public.testing_private_mark_paid(uuid, integer)'), 0))
         and p.prosrc ~ '(testing_mark_paid|testing_private_mark_paid)([^_a-z0-9]|$)'
      union all
      select 'view ' || v.schemaname || '.' || v.viewname
        from pg_views v
       where v.schemaname not in ('pg_catalog', 'information_schema')
         and v.definition ~ '(testing_mark_paid|testing_private_mark_paid)([^_a-z0-9]|$)'
      union all
      select 'read rule ' || pol.schemaname || '.' || pol.tablename || '.' || pol.policyname
        from pg_policies pol
       where coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')
             ~ '(testing_mark_paid|testing_private_mark_paid)([^_a-z0-9]|$)'
    ) as x;
  if v_users is not null then
    raise exception '0035 stopped: these still use the old Mark paid functions: %', v_users;
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. Remove the two old one-click Mark paid functions
--    No "cascade": if anything depended on them, this stops (and,
--    being one transaction, nothing is kept).
-- ---------------------------------------------------------------------
drop function if exists public.testing_mark_paid(uuid, integer);
drop function if exists public.testing_private_mark_paid(uuid, integer);


commit;
