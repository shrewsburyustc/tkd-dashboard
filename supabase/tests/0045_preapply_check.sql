-- =====================================================================
-- 0045_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0045 (the Calendar
--   reader calendar_items, rulebook v0.645; SETUP.md 0045a), and again
--   AFTER it and after an undo (0045e). One row:
--     calendar_versions  how many calendar_items functions exist
--                        (0 before 0045; 1 after - one version, arguments
--                        date + date)
--     calendar_is_0045   true = the one that exists is exactly 0045's
--                        (false before 0045: there is none)
--     needs_found        how many of the 64 columns 0045 reads exist, in the
--                        12 tables testing_events, testing_event_classes,
--                        testing_private, star_events, star_candidates,
--                        camps, camp_days, bb_cycles, bb_cycle_days, forms,
--                        form_submissions, prospects (the same list the
--                        migration's guard checks; includes star_events'
--                        end_time (0041) and prospects' child_last_name
--                        (0036)). Must be 64.
--   A body is recognised by the md5 of its code with every comment and
--   every space taken out - the same "body_md5" the fingerprint files
--   print, so a change of comments or spacing alone doesn't count.
--     0045's calendar_items: 903a135a992584d3215447e1d2545495
--
-- WHY
--   Before 0045: 0 / false / 64 -> go on.
--   needs_found below 64 means an earlier migration is missing - stop and
--   tell Claude (0045 would refuse to run anyway).
--   After 0045: 1 / true / 64.
--   After an undo: as before 0045.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0045) checks this, and its
-- answers before 0045, after it, and after the undo.
-- =====================================================================

with fn as (
  select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'calendar_items'
)
select (select count(*) from fn)::integer as calendar_versions,
       coalesce((select bool_and(f.body_md5 = '903a135a992584d3215447e1d2545495') from fn f), false) as calendar_is_0045,
       (select count(*) from (values
      ('testing_events', 'id'), ('testing_events', 'location_code'), ('testing_events', 'name'),
      ('testing_events', 'testing_date'), ('testing_events', 'auto_close_on'), ('testing_event_classes', 'event_id'),
      ('testing_event_classes', 'start_time'), ('testing_event_classes', 'end_time'), ('testing_private', 'id'),
      ('testing_private', 'location_code'), ('testing_private', 'first_name'), ('testing_private', 'last_name'),
      ('testing_private', 'status'), ('testing_private', 'private_date'), ('testing_private', 'private_time'),
      ('star_events', 'id'), ('star_events', 'name'), ('star_events', 'testing_date'),
      ('star_events', 'start_time'), ('star_events', 'end_time'), ('star_events', 'auto_close_on'),
      ('star_candidates', 'id'), ('star_candidates', 'event_id'), ('star_candidates', 'first_name'),
      ('star_candidates', 'last_name'), ('star_candidates', 'location_code'), ('star_candidates', 'status'),
      ('star_candidates', 'private_on'), ('star_candidates', 'private_time'), ('camps', 'id'),
      ('camps', 'location_code'), ('camps', 'both_schools'), ('camps', 'name'),
      ('camps', 'start_time'), ('camps', 'end_time'), ('camps', 'signup_opens_on'),
      ('camps', 'signup_closes_on'), ('camps', 'early_until'), ('camp_days', 'camp_id'),
      ('camp_days', 'day'), ('bb_cycles', 'id'), ('bb_cycles', 'name'),
      ('bb_cycles', 'application_due'), ('bb_cycles', 'submissions_due'), ('bb_cycle_days', 'id'),
      ('bb_cycle_days', 'cycle_id'), ('bb_cycle_days', 'name'), ('bb_cycle_days', 'day_date'),
      ('bb_cycle_days', 'start_time'), ('bb_cycle_days', 'end_time'), ('bb_cycle_days', 'second_end'),
      ('bb_cycle_days', 'place_code'), ('bb_cycle_days', 'place_other'), ('forms', 'id'),
      ('forms', 'name'), ('form_submissions', 'id'), ('form_submissions', 'form_id'),
      ('form_submissions', 'location_code'), ('form_submissions', 'created_at'), ('form_submissions', 'parent_name'),
      ('prospects', 'id'), ('prospects', 'submission_id'), ('prospects', 'child_first_name'),
      ('prospects', 'child_last_name')
       ) as w(t, c)
        where exists (select 1 from pg_attribute a
                       where a.attrelid = to_regclass('public.' || w.t) and a.attname = w.c and a.attnum > 0))::integer as needs_found;
