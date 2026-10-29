-- =====================================================================
-- 0028_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0028 (SETUP.md 0028a),
--   and again BEFORE an undo (0028e). One row:
--     body_is_0006       true = star_start_time_is_valid is still 0006's
--                        rule (8:00 AM - 8:00 PM, 15-minute step), i.e.
--                        nothing else changed it since; false after 0028
--     body_is_0028       true = it is already 0028's rule (0028 applied)
--     events_bad_new     events whose start time breaks the NEW rule
--     privates_bad_new   private testing times that break the NEW rule
--     events_bad_old     events whose start time breaks the OLD rule
--     privates_bad_old   private testing times that break the OLD rule
--   The two rules are written out below in plain SQL (not by calling the
--   function), so the answers don't depend on which version is live.
--
-- WHY
--   Before 0028: body_is_0006 must be true and every count 0. The *_new
--   counts being 0 proves 0028 keeps every saved time valid (it only
--   widens the rule, so they can only be 0 while the old rule held).
--   Before an UNDO: events_bad_old and privates_bad_old must be 0 - an
--   event or private testing saved with a new time (e.g. 6:05 AM, 9:30
--   PM, 10:10) would break 0006's rule again. The undo file refuses in
--   that case; change those times first (Claude can list them through
--   the connection).
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0028) checks this, and its
-- answers on a clean database, after 0028, and with a planted 6:05 AM
-- event.
-- =====================================================================

with fn as (
  select regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g') as body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'star_start_time_is_valid'
),
times as (
  select 'event' as what, e.start_time as t from public.star_events e
  union all
  select 'private', c.private_time from public.star_candidates c where c.private_time is not null
),
judged as (
  select x.what,
         not coalesce(x.t between time '06:00' and time '22:00'
                      and extract(minute from x.t)::integer % 5 = 0
                      and extract(second from x.t) = 0, false) as bad_new,
         not coalesce(x.t between time '08:00' and time '20:00'
                      and extract(minute from x.t)::integer % 15 = 0
                      and extract(second from x.t) = 0, false) as bad_old
    from times x
)
select coalesce((select f.body from fn f) = 'selectcoalesce(p_timebetweentime''08:00''andtime''20:00''andextract(minutefromp_time)::integer%15=0andextract(secondfromp_time)=0,false);', false) as body_is_0006,
       coalesce((select f.body from fn f) = 'selectcoalesce(p_timebetweentime''06:00''andtime''22:00''andextract(minutefromp_time)::integer%5=0andextract(secondfromp_time)=0,false);', false) as body_is_0028,
       (select count(*) from judged j where j.what = 'event' and j.bad_new)::integer   as events_bad_new,
       (select count(*) from judged j where j.what = 'private' and j.bad_new)::integer as privates_bad_new,
       (select count(*) from judged j where j.what = 'event' and j.bad_old)::integer   as events_bad_old,
       (select count(*) from judged j where j.what = 'private' and j.bad_old)::integer as privates_bad_old;
