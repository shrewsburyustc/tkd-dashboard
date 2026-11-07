-- =====================================================================
-- 0044_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0044 (Color Belt
--   rolling check step A: the form's own Paying by, Edit event Undo in one
--   call, each payment's school; SETUP.md 0044a), and again before its
--   undo (0044e). One row:
--     new_columns           how many of 0044's four columns exist
--                           (paying_by_on_form x2, school x2): 0 before,
--                           4 after
--     old_signatures        testing_mark_paid_by / testing_private_mark_paid_by
--                           with 0030's 4 inputs: 2 before, 0 after
--     new_signatures        ... with 0044's 5 inputs: 0 before, 2 after
--     undo_event_edit       testing_undo_event_edit there? 0 before, 1 after
--     replaced_found        how many of the 8 functions 0044 replaces exist,
--                           one version each: 8
--     replaced_as_tested    how many of them still have EXACTLY 0030's code
--                           (the code 0044 was built on; body md5 without
--                           comments and spaces, as in the fingerprint
--                           files): 8 before, 0 after
--     applied_as_tested     how many of them have EXACTLY 0044's code:
--                           0 before, 8 after
--     form_rows_no_history  family-form registrations without their
--                           change_log insert row (they will read "at the
--                           desk" after 0044): expected 0
--     payments_off_school   payments whose stored school differs from the
--                           event's / private testing's school (only
--                           after 0044: money taken at the other school's
--                           desk). What 0044's undo refuses on: it must be
--                           0 before the undo.
--   The payment rows are read through to_jsonb(), so this query works
--   before 0044 too (the column isn't there yet; then it answers 0).
--
-- WHY
--   0044 replaces eight live functions with copies of their 0030 code
--   plus the school. If another change had replaced one of them since,
--   pasting 0044 would silently undo that change.
--     0 / 2 / 0 / 0 / 8 / 8 / 0 / 0 / 0  -> go on
--     4 / 0 / 2 / 1 / 8 / 0 / 8 / 0 / n  -> 0044 is already applied
--   Anything else: stop and tell Claude.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0044) checks this, and the
-- answers before 0044, after it, and after the undo.
-- =====================================================================

with f as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('testing_mark_paid_by', 'testing_private_mark_paid_by', 'testing_undo_payment',
                       'testing_private_undo_payment', 'testing_edit_payment', 'testing_private_edit_payment',
                       'testing_move_to_private', 'testing_private_undo_move')
), built_on (proname, body_md5) as (
  values ('testing_mark_paid_by',         'd43f4bab7a1fdf970eed5a7851a4b326'),   -- 0030
         ('testing_private_mark_paid_by', 'fb09eddf5771f5adfa3919164770f0d2'),   -- 0030
         ('testing_undo_payment',         '288ea3ca644ad5301e584cf060ff40c9'),   -- 0030
         ('testing_private_undo_payment', '8aaf68d52f2f65a05e0e9aa65666cfae'),   -- 0030
         ('testing_edit_payment',         '64fd0630522388407b26a5924095ee8c'),   -- 0030
         ('testing_private_edit_payment', 'be2497fb4d2f02dc7840782cff5a0acc'),   -- 0030
         ('testing_move_to_private',      '219d283d6a015c58ed04793e622367da'),   -- 0030
         ('testing_private_undo_move',    '402f97bafff85e609d0d5204fef47f8f')    -- 0030
), applied (proname, body_md5) as (
  values ('testing_mark_paid_by',         'ea95d04d98082e63f8ebcc5778bfd274'),   -- 0044
         ('testing_private_mark_paid_by', 'def53887d96ce8f875d1fe65828ff336'),   -- 0044
         ('testing_undo_payment',         'a7825fe60dfe4b530305f7d7c110edaf'),   -- 0044
         ('testing_private_undo_payment', '5f1f36328e76bbf35ae11496d3120882'),   -- 0044
         ('testing_edit_payment',         '179ce3dbe53de9123123f88c298b76f0'),   -- 0044
         ('testing_private_edit_payment', 'bd23c0ad3687ff4875f72ad9b3ac9849'),   -- 0044
         ('testing_move_to_private',      '4e92e3611ca81417e4c1b4ceb2b607a0'),   -- 0044
         ('testing_private_undo_move',    '7cbb20dccaf715e16a9f59a981dc9e72')    -- 0044
)
select (select count(*)::integer from pg_attribute a
         where (a.attrelid = to_regclass('public.testing_registrations') and a.attname = 'paying_by_on_form')
            or (a.attrelid = to_regclass('public.testing_private') and a.attname = 'paying_by_on_form')
            or (a.attrelid = to_regclass('public.testing_payments') and a.attname = 'school')
            or (a.attrelid = to_regclass('public.testing_private_payments') and a.attname = 'school'))   as new_columns,
       ((to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer)') is not null)::integer
        + (to_regprocedure('public.testing_private_mark_paid_by(uuid, integer, text, integer)') is not null)::integer)
                                                                                              as old_signatures,
       ((to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer, text)') is not null)::integer
        + (to_regprocedure('public.testing_private_mark_paid_by(uuid, integer, text, integer, text)') is not null)::integer)
                                                                                              as new_signatures,
       (to_regprocedure('public.testing_undo_event_edit(uuid, integer, text, date, jsonb, date, text, boolean)') is not null)::integer
                                                                                              as undo_event_edit,
       (select count(distinct f.proname)::integer from f
         where (select count(*) from f as g where g.proname = f.proname) = 1)                as replaced_found,
       (select count(*)::integer from f join built_on t on t.proname = f.proname and t.body_md5 = f.body_md5) as replaced_as_tested,
       (select count(*)::integer from f join applied t on t.proname = f.proname and t.body_md5 = f.body_md5)  as applied_as_tested,
       (select count(*)::integer from public.testing_registrations r
         where r.source = 'form'
           and not exists (select 1 from public.change_log l
                            where l.table_name = 'testing_registrations' and l.record_id = r.id and l.op = 'insert'))
                                                                                              as form_rows_no_history,
       ((select count(*) from public.testing_payments p
          join public.testing_registrations r on r.id = p.registration_id
          join public.testing_events e on e.id = r.event_id
         where (to_jsonb(p) ->> 'school') is distinct from e.location_code
           and (to_jsonb(p) ->> 'school') is not null)
        + (select count(*) from public.testing_private_payments x
          join public.testing_private v on v.id = x.private_id
         where (to_jsonb(x) ->> 'school') is distinct from v.location_code
           and (to_jsonb(x) ->> 'school') is not null))::integer                              as payments_off_school;
