-- =====================================================================
-- 0032_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0032 (SETUP.md 0032a),
--   and again BEFORE an undo (0032e). One row:
--     body_is_0016     true = bb_time_is_valid is still 0016's rule
--                      (6:00 AM - 10:00 PM, 15-minute step), i.e.
--                      nothing else changed it since; false after 0032
--     body_is_0032     true = it is already 0032's rule (5-minute step)
--     new_functions    how many of 0032's three new functions exist
--                      (0 before, 3 after)
--     history_index    true = 0032's index on change_log is there
--                      (change_log_bb_candidate_child_idx)
--     times_bad_new    saved testing-day times (start, end, second part's
--                      start and end) that break the NEW rule
--     times_bad_old    saved testing-day times that break the OLD rule
--   The two rules are written out below in plain SQL (not by calling the
--   function), so the answers don't depend on which version is live.
--
-- WHY
--   Before 0032: body_is_0016 must be true, new_functions 0,
--   history_index false and both
--   counts 0. times_bad_new being 0 proves 0032 keeps every saved time
--   valid (it only widens the rule, so it can only be 0 while the old
--   rule held).
--   Before an UNDO: times_bad_old must be 0 - a testing day saved with a
--   new time (e.g. 12:05) would break 0016's rule again. The undo file
--   refuses in that case; change those times first (Claude can list
--   them through the connection).
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0032) checks this, and its
-- answers on a clean database, after 0032, and with a planted 12:05 day.
-- =====================================================================

with fn as (
  select regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g') as body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'bb_time_is_valid'
),
times as (
  select d.start_time as t from public.bb_cycle_days d
  union all
  select d.end_time from public.bb_cycle_days d
  union all
  select d.second_start from public.bb_cycle_days d where d.second_start is not null
  union all
  select d.second_end from public.bb_cycle_days d where d.second_end is not null
),
judged as (
  select not coalesce(x.t between time '06:00' and time '22:00'
                      and extract(minute from x.t)::integer % 5 = 0
                      and extract(second from x.t) = 0, false) as bad_new,
         not coalesce(x.t between time '06:00' and time '22:00'
                      and extract(minute from x.t)::integer % 15 = 0
                      and extract(second from x.t) = 0, false) as bad_old
    from times x
)
select coalesce((select f.body from fn f) = 'selectcoalesce(p_timebetweentime''06:00''andtime''22:00''andextract(minutefromp_time)::integer%15=0andextract(secondfromp_time)=0,false);', false) as body_is_0016,
       coalesce((select f.body from fn f) = 'selectcoalesce(p_timebetweentime''06:00''andtime''22:00''andextract(minutefromp_time)::integer%5=0andextract(secondfromp_time)=0,false);', false) as body_is_0032,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('bb_history_strip', 'bb_candidate_history', 'bb_undo_cycle_edit'))::integer as new_functions,
       (to_regclass('public.change_log_bb_candidate_child_idx') is not null) as history_index,
       (select count(*) from judged j where j.bad_new)::integer as times_bad_new,
       (select count(*) from judged j where j.bad_old)::integer as times_bad_old;
