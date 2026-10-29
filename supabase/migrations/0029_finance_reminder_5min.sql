-- =====================================================================
-- 0029_finance_reminder_5min.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A one-function migration for Finance (design-review F2 / M8, item
--   14b). It runs AFTER 0011 (Finance, live) and REPLACES exactly ONE
--   function from 0011: public.finance_reminder_time_is_valid(time) - the
--   small rule "is this an allowed close-the-day reminder time?".
--   Nothing else changes: no table, no table rule, no other function, no
--   right, no data.
--
-- WHY IT EXISTS
--   Settings -> Finance lets an admin pick, per school and weekday, the
--   time the Home screen starts reminding staff to close the day. Until
--   now the only allowed times were 11:00 AM to 11:00 PM on a 15-minute
--   step (11:00, 11:15, 11:30 ...). The dashboard's time pickers are
--   moving to 5-minute steps everywhere (design review F2), so the
--   reminder must accept 11:05, 11:10 ... too. The database is the one
--   that really enforces the rule, so it has to change first - before
--   the Settings screen (Dashboard core's session) offers the new times.
--
-- WHAT IT CHANGES
--   finance_reminder_time_is_valid(p_time) now answers:
--     true   11:00 AM to 11:00 PM (both ends included) on a 5-minute step
--            (minute % 5 = 0) with no seconds: 11:00, 11:05 ... 22:55, 23:00
--     false  anything else - 10:55, 23:05, 11:07, 11:05:30 - and NULL.
--   NULL -> false is on purpose and unchanged: "Off" is stored as NULL,
--   and the table rule allows NULL separately ("remind_at is null or
--   finance_reminder_time_is_valid(remind_at)").
--   The ONLY difference from 0011's text is "% 15" -> "% 5". Same name,
--   same argument, same "language sql immutable", same search_path = ''
--   (empty: nothing can slip in a look-alike), same owner, and the same
--   revoke line as 0011 (nobody but the owner may call it - it is only
--   used inside the database). No grant: 0011 never granted it to anyone.
--
-- WHO USES IT (checked: every migration in supabase/migrations)
--   * the table rule finance_reminder_times_time_check (0011, section 2d)
--   * public.finance_set_reminder_time (0011, the Settings save)
--   No later migration (0017, 0018, 0026 ...) replaces or calls it.
--
-- EXISTING ROWS (why nothing has to be re-checked)
--   "create or replace" of a function that a table rule (CHECK) uses does
--   NOT make Postgres re-check the rows already in the table - it only
--   uses the new text for rows written from now on. That is fine here:
--   every stored time is on a 15-minute step, and every 15-minute step is
--   also a 5-minute step, so the new rule is a superset of the old one
--   and every existing row is still valid under it.
--
-- WHAT TO KNOW BEFORE APPLYING
--   * Until the app's Settings screen is updated, nothing visible changes:
--     the screen still offers only the 15-minute list.
--   * If 0011 is ever re-run after this file, it puts the 15-minute rule
--     back. Re-run this file straight after. (Re-running 0011 is refused
--     anyway since 0026 - see SETUP, Migration 0026, 0026b.)
--
-- HOW TO RUN IT
--   Only AFTER 0011 is live (it is). Supabase dashboard -> SQL Editor ->
--   New query -> paste this WHOLE file -> Run. It starts with "begin;"
--   and ends with "commit;", so it is one transaction: if anything fails,
--   nothing is kept. This file removes nothing, so Supabase should not
--   show a "destructive operations" warning.
--   Safe to run again: the guard accepts 0011's version OR this file's
--   version, "create or replace" puts the same text back and the revoke
--   repeats (tested in PGlite, run.mjs step0029: a second run changes no
--   fingerprint).
--   Forward-only: there is no undo file. Putting the 15-minute rule back
--   once a 5-minute time is saved would leave that row breaking its own
--   table rule without Postgres noticing (see EXISTING ROWS) - so going
--   back would need a new migration that first moves such times.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: stops here - and changes nothing - unless
--    * 0011 is applied (its reminder table and this function exist), and
--    * the function is EXACTLY 0011's version (or what this file made, on
--      a re-run). They are compared by the md5 of the function's code
--      without comments and white space, the same way the fingerprints
--      files do. If someone changed it since, pasting this file would
--      silently undo that change - so this file must be rebuilt first.
--      893a4a82cd923c9e81c0a35f48de403f = 0011's text (15-minute steps)
--      956cf7ae3a12ff432ead67bafd2631c0 = this file's text (5-minute steps)
-- ---------------------------------------------------------------------
do $$
declare
  v_md5 text;
begin
  if to_regclass('public.finance_reminder_times') is null
     or to_regprocedure('public.finance_reminder_time_is_valid(time)') is null then
    raise exception '0029 needs migration 0011 (Finance) first';
  end if;
  select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
    into v_md5
    from pg_proc p
   where p.oid = to_regprocedure('public.finance_reminder_time_is_valid(time)');
  if v_md5 not in ('893a4a82cd923c9e81c0a35f48de403f', '956cf7ae3a12ff432ead67bafd2631c0') then
    raise exception '0029 was built over 0011''s finance_reminder_time_is_valid, but the live one is different (md5 %) - rebuild 0029 first', v_md5;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. The replaced function (0011's section 1a; only "% 15" became "% 5")
-- ---------------------------------------------------------------------

-- 1a. finance_reminder_time_is_valid(p_time) - a reminder time: 11:00 AM
-- to 11:00 PM on a 5-minute step (11:00, 11:05 ...), no seconds.
-- NULL -> false (the table allows NULL = Off separately).
-- (0011's text; replaced by 0029: 15-minute steps -> 5-minute steps)
create or replace function public.finance_reminder_time_is_valid(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_time between time '11:00' and time '23:00'
                  and extract(minute from p_time)::integer % 5 = 0
                  and extract(second from p_time) = 0,
                  false);
$$;

revoke execute on function public.finance_reminder_time_is_valid(time) from public, anon, authenticated, service_role;


commit;

-- End of 0029_finance_reminder_5min.sql
