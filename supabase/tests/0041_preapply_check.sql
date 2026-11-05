-- =====================================================================
-- 0041_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0041 (Star event end
--   time, rulebook v0.520; SETUP.md 0041a), and again before its undo
--   (0041f). One row:
--     end_time_column        is star_events.end_time there? (0 before
--                            0041, 1 after)
--     old_signatures         how many of the OLD inputs exist:
--                            star_add_event with 7 inputs and
--                            star_update_event with 8 (2 before, 0 after)
--     new_signatures         how many of the NEW inputs exist (one more,
--                            p_end_time): 0 before, 2 after
--     replaced_found         how many of the five functions 0041 replaces
--                            exist, one version each (star_add_event,
--                            star_update_event, star_public_answer,
--                            star_home_today, star_public_event): 5
--     replaced_as_tested     how many of those five still have EXACTLY the
--                            code 0041 was built on (0006's, and 0023's
--                            star_update_event - body md5 without comments
--                            and spaces, as in the fingerprint files)
--     applied_as_tested      how many of them have EXACTLY 0041's code
--     events_with_end_time   Star events with an end time saved (what
--                            0041's undo refuses on)
--   The events are read through to_jsonb(), so this query works before
--   0041 too (the column isn't there yet).
--
-- WHY
--   0041 replaces five live functions with copies of their 0006 / 0023
--   code plus the end time. If another change had replaced one of them
--   since, pasting 0041 would silently undo that change.
--     0 / 2 / 0 / 5 / 5 / 0 / 0  -> go on (nothing of 0041 yet, all as
--                                   tested)
--     1 / 0 / 2 / 5 / 0 / 5 / n  -> 0041 is already applied
--   Anything else: stop and tell Claude (a function changed since it was
--   tested - 0041 must be rebuilt on the newer code first).
--   Before the UNDO (SETUP 0041f): events_with_end_time must be 0, or
--   the undo file stops and changes nothing.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0041) checks this, and that
-- it answers 0 / 2 / 0 / 5 / 5 / 0 / 0 before 0041,
-- 1 / 0 / 2 / 5 / 0 / 5 / 0 after it, and the "before" answer again
-- after the undo.
-- =====================================================================

with f as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('star_add_event', 'star_update_event', 'star_public_answer', 'star_home_today', 'star_public_event')
), built_on (proname, body_md5) as (
  values ('star_add_event',     '3af5ca9c7672fbbbf6cb2933293d5cec'),   -- 0006
         ('star_update_event',  '466072eac5d599daf5b76846698ec1f0'),   -- 0023
         ('star_public_answer', '034af335404d06ce63a2a311cb244946'),   -- 0006
         ('star_home_today',    'dc043e909502e72850a5485a462e0e90'),   -- 0006
         ('star_public_event',  '6aaaae1193b93b6168b1e8798d8b2041')    -- 0006
), applied (proname, body_md5) as (
  values ('star_add_event',     '68a83e642a88b040600a8705b1e6fe17'),   -- 0041
         ('star_update_event',  '9da337592eacfa3b2593777050ad7604'),   -- 0041
         ('star_public_answer', '51443a4da8b201138db3ea265c49c386'),   -- 0041
         ('star_home_today',    '35e629267ebda3feb495e107917b0b1c'),   -- 0041
         ('star_public_event',  '8467dd3d6816e80be496c9dc79edd4c2')    -- 0041
)
select (select count(*)::integer from pg_attribute a
         where a.attrelid = to_regclass('public.star_events') and a.attname = 'end_time')     as end_time_column,
       ((to_regprocedure('public.star_add_event(text, date, time, text, boolean, date, text)') is not null)::integer
        + (to_regprocedure('public.star_update_event(uuid, integer, text, date, time, text, date, text)') is not null)::integer)
                                                                                              as old_signatures,
       ((to_regprocedure('public.star_add_event(text, date, time, text, boolean, date, text, time)') is not null)::integer
        + (to_regprocedure('public.star_update_event(uuid, integer, text, date, time, text, date, text, time)') is not null)::integer)
                                                                                              as new_signatures,
       (select count(distinct f.proname)::integer from f
         where (select count(*) from f as g where g.proname = f.proname) = 1)                as replaced_found,
       (select count(*)::integer from f join built_on t on t.proname = f.proname and t.body_md5 = f.body_md5) as replaced_as_tested,
       (select count(*)::integer from f join applied t on t.proname = f.proname and t.body_md5 = f.body_md5)  as applied_as_tested,
       (select count(*)::integer from public.star_events e
         where to_jsonb(e) ->> 'end_time' is not null)                                        as events_with_end_time;
