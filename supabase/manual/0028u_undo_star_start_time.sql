-- =====================================================================
-- 0028u_undo_star_start_time.sql   (UNDO of migration 0028)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Puts back 0006's exact version of the one function 0028 replaced,
--   public.star_start_time_is_valid (0006 section 1a: 8:00 AM - 8:00 PM
--   on a 15-minute step, no seconds), copied word for word from
--   0006_star_testing.sql with its exact revoke.
--
-- WHY A SEPARATE FILE
--   Re-running the whole 0006 file would do the same, but this touches
--   only the one function. Paste it ONLY with Jeffrey's OK (SETUP.md,
--   Migration 0028, 0028e), and only after the app is back to a version
--   that offers only the old times (8:00 AM - 8:00 PM, every 15 minutes).
--
-- IT REFUSES WHEN A SAVED TIME USES THE NEW RANGE
--   Postgres does NOT re-check saved rows when the function inside a
--   table rule is replaced. So without the check in section 1 an event
--   saved at, say, 6:05 AM would stay - and then EVERY later save of
--   that event (rename, Registration switch ...) would fail the table
--   rule star_events_start_time_check and answer "invalid". Section 1
--   therefore stops - changing nothing - while any event start time or
--   private testing time breaks 0006's rule. Check first with
--   supabase/tests/0028_preapply_check.sql (events_bad_old and
--   privates_bad_old must be 0); change those times in the app, then
--   paste this file.
--
-- AFTERWARDS
--   0006_fingerprints.sql's star_start_time_is_valid line must equal the
--   one written down BEFORE 0028 was applied (SETUP 0028b), and
--   0028_preapply_check.sql must answer body_is_0006 = true. Tested in
--   PGlite (run.mjs step0028). To redo: paste 0028 again. One
--   transaction: on any error nothing is kept.
-- =====================================================================

begin;

-- Stop Star saves for the moment this undo runs, so no new-range time can be saved
-- between the check below and the swap back (security review 2026-10-28).
lock table public.star_events, public.star_candidates in share mode;

-- ---------------------------------------------------------------------
-- 1. Refuse while a saved time uses the new range (see above)
-- ---------------------------------------------------------------------
do $$
declare
  v_events   integer;
  v_privates integer;
begin
  select count(*) into v_events
    from public.star_events e
   where not coalesce(e.start_time between time '08:00' and time '20:00'
                      and extract(minute from e.start_time)::integer % 15 = 0
                      and extract(second from e.start_time) = 0, false);
  select count(*) into v_privates
    from public.star_candidates c
   where c.private_time is not null
     and not coalesce(c.private_time between time '08:00' and time '20:00'
                      and extract(minute from c.private_time)::integer % 15 = 0
                      and extract(second from c.private_time) = 0, false);
  if v_events > 0 or v_privates > 0 then
    raise exception '0028 undo refused: % event start time(s) and % private testing time(s) are outside 8:00 AM - 8:00 PM every 15 minutes. Change them first (0028_preapply_check.sql lists the counts).',
      v_events, v_privates;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. 0006's function, word for word
-- ---------------------------------------------------------------------

-- 1a. star_start_time_is_valid(p_time) - a start time (event or private
-- testing): from 8:00 AM to 8:00 PM, on a 15-minute step (8:00, 8:15 ...),
-- with no seconds. NULL -> false.
create or replace function public.star_start_time_is_valid(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_time between time '08:00' and time '20:00'
                  and extract(minute from p_time)::integer % 15 = 0
                  and extract(second from p_time) = 0,
                  false);
$$;

revoke execute on function public.star_start_time_is_valid(time) from public, anon, authenticated, service_role;

commit;

-- End of 0028u_undo_star_start_time.sql
