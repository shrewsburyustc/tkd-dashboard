-- =====================================================================
-- 0028_star_start_times.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A small migration for the Star testing section (0006 + 0023, both
--   live; design-review item S12, rulebook v1.019). Build contract:
--   docs/Dashboard Docs/Build contracts/CONTRACT-0028.md. It REPLACES
--   exactly ONE function, public.star_start_time_is_valid (0006 section
--   1a), with the same name, the same argument, the same answer type and
--   the same rights. Nothing else changes: no table, no rule, no other
--   function, no data.
--
-- WHY IT EXISTS
--   Star start times - an event's start time and a candidate's private
--   testing time - were allowed from 8:00 AM to 8:00 PM on a 15-minute
--   step (8:00, 8:15, 8:30 ...). Rulebook v1.019 (S12) makes every time
--   list in the dashboard work the same way: 6:00 AM to 10:00 PM on a
--   5-minute step (6:00, 6:05, 6:10 ... 10:00 PM), still with no seconds.
--   The database must accept the new times BEFORE the app offers them,
--   or a save with, say, 6:05 PM would be refused as "invalid".
--
-- WHAT IT CHANGES
--   star_start_time_is_valid(p_time) answers true for 06:00 ... 22:00
--   when the minutes are a multiple of 5 and the seconds are 0 (NULL ->
--   false, as before). It is the ONE place the rule lives; these use it
--   and pick up the new rule by themselves (none of them is replaced):
--     * the table rule star_events_start_time_check (0006)
--     * star_add_event (0006) and star_update_event (0023's version)
--     * star_set_private (0006) - the private testing time
--   Kept exactly as in 0006: "language sql", "immutable" (same input ->
--   same answer, which a table rule needs), set search_path = '', and
--   nobody in the app may call it (it is revoked from public, anon,
--   authenticated and service_role; the functions above call it as their
--   owner).
--
-- WHY IT IS SAFE
--   The new rule only WIDENS the old one: every old time (8:00 AM -
--   8:00 PM, 15-minute step) is also 6:00 AM - 10:00 PM on a 5-minute
--   step (15 is a multiple of 5). So every event and private testing
--   time already saved stays valid. Postgres does not re-check saved rows
--   when a function in a table rule is replaced - here that doesn't
--   matter, because nothing that was allowed becomes refused.
--   Proof before pasting: supabase/tests/0028_preapply_check.sql
--   (SETUP.md, Migration 0028, 0028a).
--
-- WORDS USED BELOW
--   * "immutable": the function's answer depends only on its input; a
--     table rule (CHECK) may only use such functions.
--   * search_path = '': the function looks up nothing by a short name,
--     so nobody can slip in a look-alike object (same as 0003-0006).
--
-- HOW TO RUN IT
--   After 0006 and 0023. Supabase dashboard -> SQL Editor -> New query ->
--   paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept.
--   Safe to run again (tested in PGlite, run.mjs step0028: a second run
--   changes no fingerprint).
--   RE-RUN ORDER: re-running 0006 after this file puts 0006's OLD rule
--   back -> re-run this file straight after.
--   Undo: SETUP.md, "Migration 0028", 0028e - paste
--   supabase/manual/0028u_undo_star_start_time.sql, which puts back
--   0006's function word for word (it refuses while any saved time uses
--   the new range).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0006 (Star testing). Stops - and changes
--    nothing - if it is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.star_start_time_is_valid(time)') is null
     or to_regclass('public.star_events') is null then
    raise exception '0028 needs migration 0006 (Star testing) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. The replaced function (0006's section 1a; only the rule changes)
-- ---------------------------------------------------------------------

-- 1a. star_start_time_is_valid(p_time) - a start time (event or private
-- testing): from 6:00 AM to 10:00 PM, on a 5-minute step (6:00, 6:05 ...),
-- with no seconds. NULL -> false.
-- (0006's text was 8:00 AM - 8:00 PM on a 15-minute step; replaced by
-- 0028, rulebook v1.019 / S12.)
create or replace function public.star_start_time_is_valid(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_time between time '06:00' and time '22:00'
                  and extract(minute from p_time)::integer % 5 = 0
                  and extract(second from p_time) = 0,
                  false);
$$;

-- Nobody in the app may call it (as in 0006); the Star functions and the
-- table rule use it as its owner.
revoke execute on function public.star_start_time_is_valid(time) from public, anon, authenticated, service_role;


commit;

-- End of 0028_star_start_times.sql
