-- =====================================================================
-- 0051_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0051 (Board breaking,
--   rulebook v1.300-v1.303; SETUP.md 0051a), and again right after. One
--   row:
--     prereqs_found     how many of the 14 things 0051 needs exist: the
--                       tables locations and change_log, and the functions
--                       has_data_access, is_admin, change_log_actor_name,
--                       change_log_write, current_session_id,
--                       testing_refuse_truncate, testing_normalize_name,
--                       testing_name_is_valid, testing_line_is_valid,
--                       testing_today, testing_school_date and
--                       testing_new_public_code (0001-0005's helpers): 14
--     locations_found   how many of the two schools exist in
--                       public.locations ('worcester', 'shrewsbury'): 2
--     brk_tables        how many of the 9 Board breaking tables exist
--                       (brk_settings, brk_chart, brk_events,
--                       brk_event_classes, brk_registrations,
--                       brk_payments, brk_public_attempts,
--                       brk_square_events, brk_cleared_links): 0 before, 9 after
--     brk_functions     how many functions in schema public have a name
--                       starting with brk_ (the 26 the app and the two
--                       logins call, plus the internal helpers and trigger
--                       functions): 0 before, the same number as in
--                       0051_fingerprints.sql after
--     brk_roles         how many of the two logins exist (brk_registrar,
--                       brk_square): 0 before, 2 after
--
-- WHY
--   0051 only ADDS things (it replaces nothing of another section), so the
--   only ways it can go wrong are a missing prerequisite or a name that is
--   already taken. Reading this first shows both.
--     14 / 2 / 0 / 0 / 0   -> go on (nothing of 0051 yet, everything it
--                             needs is there)
--     14 / 2 / 9 / n / 2   -> 0051 is already applied (n = the number of
--                             rows of kind "function" in
--                             0051_fingerprints.sql)
--   Anything else: stop and tell Claude. A "partly there" answer such as
--   14 / 2 / 3 / 5 / 0 means something with a brk_ name exists that 0051
--   did not make, or an earlier paste stopped half way.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0051) checks this, and that it
-- answers the "go on" row before 0051 and the "already applied" row after
-- it.
-- =====================================================================

select (select count(*)::integer
          from (values ('public.locations'), ('public.change_log')) as t (name)
         where to_regclass(t.name) is not null)
       + (select count(*)::integer
            from (values ('public.has_data_access()'), ('public.is_admin()'), ('public.change_log_actor_name()'),
                         ('public.change_log_write()'), ('public.current_session_id()'), ('public.testing_refuse_truncate()'),
                         ('public.testing_normalize_name(text)'), ('public.testing_name_is_valid(text)'),
                         ('public.testing_line_is_valid(text, integer)'), ('public.testing_today()'),
                         ('public.testing_school_date(timestamptz)'), ('public.testing_new_public_code()')) as f (sig)
           where to_regprocedure(f.sig) is not null)                                          as prereqs_found,
       (select count(*)::integer from public.locations l where l.code in ('worcester', 'shrewsbury')) as locations_found,
       (select count(*)::integer
          from (values ('public.brk_settings'), ('public.brk_chart'), ('public.brk_events'), ('public.brk_event_classes'),
                       ('public.brk_registrations'), ('public.brk_payments'), ('public.brk_public_attempts'),
                       ('public.brk_square_events'), ('public.brk_cleared_links')) as t (name)
         where to_regclass(t.name) is not null)                                               as brk_tables,
       (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'brk\_%')                              as brk_functions,
       (select count(*)::integer from pg_roles r where r.rolname in ('brk_registrar', 'brk_square')) as brk_roles;
