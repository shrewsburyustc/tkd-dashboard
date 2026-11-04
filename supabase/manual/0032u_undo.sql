-- =====================================================================
-- 0032u_undo.sql   (UNDO of migration 0032)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0032 (Black Belt: testing times every 5 minutes, the
--   candidate History reader, Edit cycle's Undo in one call) back out:
--     1. puts back 0016's exact version of the one function 0032
--        replaced, public.bb_time_is_valid (0016 section 1c: 6:00 AM -
--        10:00 PM on a 15-minute step, no seconds), copied word for word
--        from 0016_black_belt.sql with its exact revoke;
--     2. removes the three functions 0032 added: bb_undo_cycle_edit,
--        bb_candidate_history and bb_history_strip, and its index on
--        change_log (change_log_bb_candidate_child_idx). They hold no
--        data (the history rows stay in change_log), so nothing is lost.
--
-- WHY A SEPARATE FILE
--   Re-running the whole 0016 file would also put the old time rule
--   back, but it re-runs everything else in 0016 too (and 0025 warns
--   against that). This touches only what 0032 made or replaced. Paste
--   it ONLY with Jeffrey's OK (SETUP.md, Migration 0032, 0032e), and only
--   after the app is back to a version that calls neither
--   bb_candidate_history nor bb_undo_cycle_edit and offers only times on
--   the 15-minute step.
--
-- IT REFUSES WHEN A SAVED TIME IS OFF THE 15-MINUTE STEP
--   Postgres does NOT re-check saved rows when the function inside a
--   table rule is replaced. So without the check in section 1 a testing
--   day saved at, say, 12:05 would stay - and then EVERY later save of
--   that cycle that touches the day would fail the table rule
--   bb_cycle_days_times_check and answer "invalid". Section 1 therefore
--   stops - changing nothing - while any testing day's start, end or
--   second part's start / end breaks 0016's rule. Check first with
--   supabase/tests/0032_preapply_check.sql (times_bad_old must be 0);
--   change those times in the app, then paste this file.
--
-- AFTERWARDS
--   0016_fingerprints.sql must equal the one written down BEFORE 0032
--   was applied (SETUP 0032a), and 0032_preapply_check.sql must answer
--   body_is_0016 = true, new_functions = 0, history_index = false.
--   Tested in PGlite (run.mjs
--   step0032). To redo: paste 0032 again. One transaction: on any error
--   nothing is kept. Supabase will warn about destructive operations:
--   this file really removes the three functions and the index (no
--   data). Confirm only
--   if you mean it.
-- =====================================================================

begin;

-- Stop testing-day saves for the moment this undo runs, so no 5-minute
-- time can be saved between the check below and the swap back (as
-- 0028u does for Star).
lock table public.bb_cycle_days in share mode;

-- ---------------------------------------------------------------------
-- 1. Refuse while a saved time is off the 15-minute step (see above)
-- ---------------------------------------------------------------------
do $$
declare
  v_times integer;
begin
  select count(*) into v_times
    from (select d.start_time as t from public.bb_cycle_days d
          union all select d.end_time from public.bb_cycle_days d
          union all select d.second_start from public.bb_cycle_days d where d.second_start is not null
          union all select d.second_end from public.bb_cycle_days d where d.second_end is not null) as x
   where not coalesce(x.t between time '06:00' and time '22:00'
                      and extract(minute from x.t)::integer % 15 = 0
                      and extract(second from x.t) = 0, false);
  if v_times > 0 then
    raise exception '0032 undo refused: % testing-day time(s) are not on the 15-minute step (6:00 AM - 10:00 PM). Change them first (0032_preapply_check.sql counts them).',
      v_times;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. 0016's function, word for word
-- ---------------------------------------------------------------------

-- 1c. bb_time_is_valid(time) - a testing day's start or end time (the
-- screen's dropdown): 6:00 AM to 10:00 PM on a 15-minute step (6:00, 6:15
-- ...), no seconds. NULL -> false.
create or replace function public.bb_time_is_valid(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_time between time '06:00' and time '22:00'
                  and extract(minute from p_time)::integer % 15 = 0
                  and extract(second from p_time) = 0,
                  false);
$$;

revoke execute on function public.bb_time_is_valid(time) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. The three functions and the index 0032 added
-- ---------------------------------------------------------------------
drop function if exists public.bb_undo_cycle_edit(uuid, integer, jsonb, boolean, uuid[]);
drop function if exists public.bb_candidate_history(uuid);
drop function if exists public.bb_history_strip(jsonb);
drop index if exists public.change_log_bb_candidate_child_idx;

commit;

-- End of 0032u_undo.sql
