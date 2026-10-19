-- =====================================================================
-- 0014_testing_private.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database migration for Color Belt testing phase 4: private
--   testing (build contract docs/Dashboard Docs/Build contracts/
--   CONTRACT-0014.md, section 2). It runs after 0001-0006 and 0010 (all
--   live). (0007-0009 and 0011-0013 are numbers claimed by other branches
--   - Schedule, Calendar, Forms, Finance, Prospects, Camps - and none of
--   them touches what this file touches.)
--
-- WHY IT EXISTS
--   A student who can't make the testing day can test PRIVATELY: on their
--   own day and time (any day from today on, before, on or after the
--   testing day, up to a year after it) at the rank's private price. They
--   stay in the event; on their own day they are graded on their own page
--   with the phase 3 rules counted from THEIR day. The database enforces
--   the day, the time, the price and the grading rules itself, so they
--   hold whatever the screen shows.
--
-- WHAT IT ADDS
--   1. 2 columns on public.testing_registrations: private_date (date) and
--      private_time (time) - both empty = tests on the testing day - with
--      2 rules (both set or both empty; the time 6:00 AM - 10:00 PM in
--      5-minute steps) and read rights for the app (authenticated only)
--   2. 2 internal helpers (nobody can call them):
--        testing_private_time_is_valid(time)  the time rule
--        testing_amount_due(registration)     what Mark paid records now
--   3. 3 staff functions (S = staff and admins):
--        testing_set_private          set a private day + time, or change it
--        testing_clear_private        back to the testing day
--        testing_add_private_student  Add student with "Tests privately"
--   4. 9 REPLACED functions - same arguments, the live body copied
--      exactly, plus only the lines marked "-- 0014:":
--        testing_mark_paid            records testing_amount_due(): the
--                                     private price, or just the top-up a
--                                     paid private student still owes;
--                                     nothing due -> already_paid (also
--                                     for a $0 price, which 0005 answered
--                                     invalid)
--        testing_change_paying_by     also allowed while a paid private
--                                     student still owes money
--        testing_purge_old_signatures 90 days after the LATER of the
--                                     testing day and the private day
--        testing_set_result           the date rule counts from the
--        testing_set_result_note      student's own day (private day or
--                                     testing day)
--        testing_update_student       the "graded + day over" belt lock
--                                     counts from the own day; a private
--                                     student's answer adds
--                                     amount_due_cents (a belt change
--                                     re-prices a private student)
--        testing_resolve_duplicate    "keep one" is admin-only also after
--                                     the withdrawn student's private day
--        testing_restore_student      the staff Undo: the same rule
--        testing_update_event         a private student's RESULT doesn't
--                                     block a date change (a note-only
--                                     row still does)
--   The testing_roster view is unchanged on purpose: "create or replace
--   view" can't take columns away again, so changing it would break
--   re-running 0005 and the 0010 removal. The app reads private_date /
--   private_time from testing_registrations itself.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words appear inside functions that run later (setting a private day
--   on a No show removes that result; a belt change clears a result) and
--   in "drop constraint if exists" lines that make re-running safe.
--   Nothing is removed now. Confirm.
--   (Claude's Supabase connection refuses SQL containing those words, which
--   is why this file is pasted by hand.)
--   Safe to run again: "add column if not exists", rules replaced with
--   "drop constraint if exists" + add, "create or replace function",
--   column rights revoked and granted again. A second run changes no row
--   and no fingerprint (tested in PGlite, run.mjs step 14).
--   RE-RUN / REMOVAL ORDER (contract §2.7):
--     * Re-running 0005 after 0014 -> re-run 0010, then 0014, straight
--       after, in that order (until then the Testing pages fail: 0005
--       removes the read rights on the private columns, and 0014 doesn't
--       replace 0005's testing_add_student, which only 0010 puts back).
--     * Re-running 0010 after 0014 -> re-run 0014 straight after.
--     * Removal: 0014 down first, then 0010 down (SETUP §14e).
--   Undo: the down-script is in supabase/SETUP.md section 15e (not here).
--
-- WORDS USED BELOW
--   * "private" = the registration's private_date is set (then
--     private_time is set too). "Own day" = coalesce(private_date,
--     testing_date): the day the student is graded.
--   * "has a result" = a testing_results row with result set (Pass, Not
--     passed or No show). For the private paths (Change, Back) only this
--     counts as graded: a note alone never blocks them and is never
--     cleared by them. Phase 3's own locks still count a note too.
--   * "net paid" = the sum of the student's payments (reversals are
--     negative). "Due" = what Mark paid records now (section 2b).
--   * "today" is only ever public.testing_today() (school time,
--     America/New_York - 0005 section 1e).
--   * "lock", "security definer", search_path = '', "stale": the same
--     meaning as in 0003 and 0005 (read their headers).
--   * new statuses: past_day (the private day is before today),
--     has_result (Set private on a student who already has a testing-day
--     Pass / Not passed or a note), graded (Change / Back on a private
--     student who has a result; Back also on a private No show). Reused:
--     ok, no_access, invalid, not_found, stale, withdrawn, finished,
--     not_open, not_allowed, already_paid, has_results.
--   * new tkd.action names: set_private, change_private, clear_private;
--     reused: add_student, clear_result, mark_paid.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. Internal helper: the time rule (the table rule in section 2 uses
--    it, so it comes first)
-- ---------------------------------------------------------------------

-- 1a. testing_private_time_is_valid(p_time) - a private testing's start
-- time: 6:00 AM to 10:00 PM (both included), minutes a multiple of 5,
-- seconds 0 (rulebook v0.157, the same list as Add event: 193 choices).
-- NULL -> false. Mirrored by eventRules.privateTimeIsValid.
create or replace function public.testing_private_time_is_valid(p_time time)
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

revoke execute on function public.testing_private_time_is_valid(time) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. The two new columns on public.testing_registrations
--   * private_date: the private testing day (NULL = tests on the event's
--     testing day). From today up to a year after the testing day - those
--     two rules depend on "today" and on the event, so the functions check
--     them, not a table rule.
--   * private_time: its start time (section 1a).
--   Setting them is an ordinary registration change: 0005's
--   testing_registrations_before_write bumps the version and stamps who /
--   when, and testing_registrations_log writes the history (no trigger
--   change here).
-- ---------------------------------------------------------------------
alter table public.testing_registrations add column if not exists private_date date null;
alter table public.testing_registrations add column if not exists private_time time null;

-- both set or both empty
alter table public.testing_registrations drop constraint if exists testing_registrations_private_pair_check;
alter table public.testing_registrations add constraint testing_registrations_private_pair_check
  check ((private_date is null) = (private_time is null));

-- the time rule (1a)
alter table public.testing_registrations drop constraint if exists testing_registrations_private_time_check;
alter table public.testing_registrations add constraint testing_registrations_private_time_check
  check (private_time is null or public.testing_private_time_is_valid(private_time));

comment on column public.testing_registrations.private_date is
  'Private testing day (phase 4). Null = tests on the event''s testing day. Set only by testing_set_private / testing_clear_private / testing_add_private_student.';
comment on column public.testing_registrations.private_time is
  'Private testing start time (phase 4). Null = tests on the event''s testing day. Set only by testing_set_private / testing_clear_private / testing_add_private_student.';

-- Read rights: the app (authenticated) may read both columns; nobody else
-- (not anon, not service_role, not the family form's login). The rows
-- themselves are already covered by 0005's read rule
-- testing_registrations_select_with_access (has_data_access()).
-- Start from zero for these two columns (so re-runs stay clean)...
revoke select (private_date, private_time) on public.testing_registrations from public, anon, authenticated, service_role;
-- ...then add back exactly what the app reads.
grant select (private_date, private_time) on public.testing_registrations to authenticated;


-- ---------------------------------------------------------------------
-- 2b. Internal helper: the money rule
-- testing_amount_due(p_registration_id) - what Mark paid records NOW for
-- this registration (contract §1.3; eventRules.amountDue is the same rule
-- in JavaScript, and the preview mock has a third copy):
--   price = private     -> the event rank copy's private price
--           not private -> early price before the testing day, testing-
--                          day price on or after it - by TODAY's date,
--                          the day they pay (0005's testing_fee_cents)
--   due   = private     -> the price minus what is already paid (net,
--                          never below 0) - so a paid private student
--                          who moved to a pricier rank, or who paid the
--                          regular price first, owes just the difference
--           not private -> 0 once anything is paid (rulebook v0.136: a
--                          regular student is never re-priced after
--                          paying), else the price
--   never below 0; NULL when the registration doesn't exist.
-- ---------------------------------------------------------------------
create or replace function public.testing_amount_due(p_registration_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(
           case when r.private_date is not null
                  then k.private_cents - greatest(coalesce(t.net, 0), 0)
                when coalesce(t.net, 0) > 0 then 0
                else public.testing_fee_cents(k.early_cents, k.day_cents, public.testing_today(), e.testing_date)
           end, 0)
    from public.testing_registrations r
    join public.testing_event_ranks k on k.id = r.event_rank_id
    join public.testing_events e on e.id = r.event_id
    left join lateral (select sum(p.amount_cents)::integer as net
                         from public.testing_payments p where p.registration_id = r.id) t on true
   where r.id = p_registration_id;
$$;

revoke execute on function public.testing_amount_due(uuid) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. The three new staff functions (S = staff and admins). Same pattern
--    as 0005 section 14 and 0010 section 4:
--   * returns {"status": ...}
--   * checks in this order: has_data_access() FIRST, then the input, then
--     it locks school -> event -> registration (0005's
--     testing_lock_registration) and looks the student up (not_found),
--     then "did the screen see the latest version?" (stale), then
--     withdrawn, then the rules below, then it locks the result row and
--     writes
--   * the event's testing_date is read AFTER the event lock, so it lines
--     up with testing_update_event (which locks the same row "for update"
--     before it can move the date)
--   * tags its writes with tkd.action + ONE tkd.batch_id and clears them
--   * the whole body is inside begin ... exception ... end, with 0005's
--     mapping (unique rule -> stale; foreign key / check / not-null ->
--     invalid; deadlock / serialization / lock not available -> stale)
--   * dates and times in answers are text: "2026-12-01", "16:00"
-- ---------------------------------------------------------------------

-- 3a. testing_set_private(p_registration_id, p_expected_version,
--       p_private_date, p_private_time)   S
-- Set a private day + time (first time: action set_private) or change it
-- (already private: action change_private).
--   day:  from today (any time of day) up to the testing day + 1 year
--         (past_day / invalid); before, on or after the testing day
--   time: 1a's rule (invalid)
--   result rule:
--     not private yet - no result row -> allowed; a testing-day No show ->
--       allowed, and that result row (the No show AND its note) is
--       removed in the same step, logged as clear_result under the same
--       batch id (rulebook v0.228); Pass / Not passed / a note only ->
--       has_result
--     already private - no row or a note only -> allowed (the note is
--       kept); a private No show -> allowed, the row (result and note) is
--       removed (a No show can get a new day, review H2); Pass / Not
--       passed -> graded
--   The same day and time as now -> writes nothing and removes nothing
--   (also on a private No show: a result is never removed without a
--   version bump).
-- Ok: {"status":"ok","version":n,"private_date":"2026-12-01",
--      "private_time":"16:00","amount_due_cents":n,"result_cleared":bool}
--   (amount_due_cents = testing_amount_due() after the write;
--   result_cleared true only when a result row was removed)
create or replace function public.testing_set_private(
  p_registration_id  uuid,
  p_expected_version integer,
  p_private_date     date,
  p_private_time     time
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r            public.testing_registrations;
  v_testing_date date;
  v_res          public.testing_results;
  v_was_private  boolean;
  v_clear        boolean := false;
  v_n            integer := 0;
  v_now          public.testing_registrations;
  v_constraint   text;
begin
  begin
    -- 1. access
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    -- 2. input (the day's limits need the event: step 6)
    if p_registration_id is null or p_expected_version is null
       or p_private_date is null or p_private_time is null
       or not public.testing_private_time_is_valid(p_private_time) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 3. lock school -> event -> registration, and look it up
    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 4. did the screen see the latest version?
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 5. a withdrawn student can't be set private
    if v_r.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    -- 6. the day (testing_date read after the event lock in step 3).
    --    "+ interval '1 year'" is Postgres date arithmetic: Feb 29 + 1 year
    --    = Feb 28.
    select e.testing_date into v_testing_date from public.testing_events e where e.id = v_r.event_id;
    if p_private_date < public.testing_today() then
      return jsonb_build_object('status', 'past_day');
    end if;
    if p_private_date > v_testing_date + interval '1 year' then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 7. lock the result row (no row -> every field of v_res is NULL)
    select * into v_res from public.testing_results x where x.registration_id = p_registration_id for update;

    -- 8. the result rule
    v_was_private := v_r.private_date is not null;
    if not v_was_private then
      if v_res.registration_id is not null then
        if v_res.result = 'no_show' then
          v_clear := true;                  -- a testing-day No show: removed below
        else
          return jsonb_build_object('status', 'has_result');   -- Pass, Not passed or a note only
        end if;
      end if;
    else
      if v_res.result = 'no_show' then
        v_clear := true;                    -- a private No show: removed below (H2)
      elsif v_res.result is not null then
        return jsonb_build_object('status', 'graded');        -- Pass or Not passed
      end if;
      -- no row, or a note only: allowed, the note stays
    end if;

    -- 9. write: the day and time (only when they change), then the result
    --    row when step 8 said so - one batch
    perform set_config('tkd.action', case when v_was_private then 'change_private' else 'set_private' end, true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_registrations r
       set private_date = p_private_date,
           private_time = p_private_time
     where r.id = p_registration_id
       and (r.private_date, r.private_time) is distinct from (p_private_date, p_private_time);
    get diagnostics v_n = row_count;

    -- the same day and time: nothing was written, so nothing is removed
    if v_n > 0 and v_clear then
      perform set_config('tkd.action', 'clear_result', true);
      delete from public.testing_results x where x.registration_id = p_registration_id;
    else
      v_clear := false;
    end if;

    -- 10. clear the tags; answer with what is stored now
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select * into v_now from public.testing_registrations r where r.id = p_registration_id;
    return jsonb_build_object('status', 'ok',
                              'version', v_now.version,
                              'private_date', to_char(v_now.private_date, 'YYYY-MM-DD'),
                              'private_time', to_char(v_now.private_time, 'HH24:MI'),
                              'amount_due_cents', public.testing_amount_due(p_registration_id),
                              'result_cleared', v_clear);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_set_private(uuid, integer, date, time) from public, anon, authenticated, service_role;
grant  execute on function public.testing_set_private(uuid, integer, date, time) to authenticated;

-- 3b. testing_clear_private(p_registration_id, p_expected_version)
--       S (admins only after the testing day)
-- "Back to the testing day": empties private_date and private_time
-- (action clear_private). A note row (if any) stays with the student.
--   not private        -> writes nothing, answers ok
--   has a result (Pass, Not passed OR No show) -> graded (a note alone
--                         doesn't count; a private No show uses Change)
--   after the testing day, staff -> not_allowed (review H1: otherwise the
--                         desk could erase a testing-day No show in two
--                         steps - Set private clears it, Back returns the
--                         student ungraded); admins allowed
-- Ok: {"status":"ok","version":n,"amount_due_cents":n}
create or replace function public.testing_clear_private(
  p_registration_id  uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r            public.testing_registrations;
  v_testing_date date;
  v_res          public.testing_results;
  v_version      integer;
  v_constraint   text;
begin
  begin
    -- 1. access
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    -- 2. input
    if p_registration_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 3. lock school -> event -> registration, and look it up
    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 4. did the screen see the latest version?
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 5. withdrawn
    if v_r.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    -- 6. not private: nothing to do
    if v_r.private_date is null then
      return jsonb_build_object('status', 'ok', 'version', v_r.version,
                                'amount_due_cents', public.testing_amount_due(p_registration_id));
    end if;

    -- 7. lock the result row; a result (not a note alone) = graded
    select * into v_res from public.testing_results x where x.registration_id = p_registration_id for update;
    if v_res.result is not null then
      return jsonb_build_object('status', 'graded');
    end if;

    -- 8. after the testing day only an admin (testing_date read after the
    --    event lock in step 3)
    select e.testing_date into v_testing_date from public.testing_events e where e.id = v_r.event_id;
    if public.testing_today() > v_testing_date and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 9. write
    perform set_config('tkd.action', 'clear_private', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_registrations r
       set private_date = null,
           private_time = null
     where r.id = p_registration_id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version,
                              'amount_due_cents', public.testing_amount_due(p_registration_id));
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_clear_private(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_clear_private(uuid, integer) to authenticated;

-- 3c. testing_add_private_student(p_event_id, p_first, p_last,
--       p_event_rank_id, p_stripes, p_paying_by, p_private_date,
--       p_private_time)   S
-- Add student with "Tests privately" ticked: 0010's testing_add_student
-- copied exactly, plus only the lines marked "-- 0014:" -
--   * the private day and time are required (invalid), with 3a's rules:
--     past_day before today, invalid after the testing day + 1 year
--     (checked after the existing finished / rank checks, before writing)
--   * the private columns go INTO the insert itself: one row, version 1,
--     ONE history row (action add_student). A refused call inserts
--     nothing.
--   * as live: staff get finished after the testing day, admins may
--     (rulebook v0.191)
-- Ok: {"status":"ok","id":...,"reference":"CB-....","version":1,
--      "private_date":"...","private_time":"...","amount_due_cents":n}
create or replace function public.testing_add_private_student(
  p_event_id      uuid,
  p_first         text,
  p_last          text,
  p_event_rank_id uuid,
  p_stripes       boolean,
  p_paying_by     text,
  p_private_date  date,
  p_private_time  time
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc        text;
  v_e          public.testing_events;
  v_dup        uuid;
  v_id         uuid;
  v_reference  text;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_event_id is null
       or not public.testing_name_is_valid(p_first)
       or not public.testing_name_is_valid(p_last)
       or p_event_rank_id is null
       or p_stripes is not true
       or p_paying_by is null or p_paying_by not in ('cash', 'check', 'card')
       or p_private_date is null or p_private_time is null                   -- 0014: the private day and time
       or not public.testing_private_time_is_valid(p_private_time) then      -- 0014: 6:00 AM-10:00 PM, 5-minute steps
      return jsonb_build_object('status', 'invalid');
    end if;

    select e.location_code into v_loc from public.testing_events e where e.id = p_event_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.locations l where l.code = v_loc for no key update;
    select * into v_e from public.testing_events e where e.id = p_event_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if public.testing_event_state(v_e, public.testing_today()) = 'finished' and public.is_admin() is not true then   -- 0010: admins may
      return jsonb_build_object('status', 'finished');
    end if;
    if not exists (select 1 from public.testing_event_ranks k
                     join public.testing_event_classes c on c.id = k.event_class_id
                    where k.id = p_event_rank_id and c.event_id = p_event_id) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_private_date < public.testing_today() then                          -- 0014: not in the past
      return jsonb_build_object('status', 'past_day');                       -- 0014
    end if;                                                                  -- 0014
    if p_private_date > v_e.testing_date + interval '1 year' then            -- 0014: at most a year after the testing day
      return jsonb_build_object('status', 'invalid');                        -- 0014
    end if;                                                                  -- 0014

    perform set_config('tkd.action', 'add_student', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    v_dup := public.testing_find_duplicate(p_event_id, null, p_first, p_last);
    insert into public.testing_registrations
      (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
       duplicate_state, duplicate_of,
       private_date, private_time)                                           -- 0014: in the same insert (one history row)
    values
      (p_event_id, p_event_rank_id, public.testing_normalize_name(p_first), public.testing_normalize_name(p_last),
       p_paying_by, true, 'staff',
       case when v_dup is null then 'none' else 'possible' end, v_dup,
       p_private_date, p_private_time)                                       -- 0014
    returning id, reference, version into v_id, v_reference, v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'reference', v_reference, 'version', v_version,
                              'private_date', to_char(p_private_date, 'YYYY-MM-DD'),                -- 0014
                              'private_time', to_char(p_private_time, 'HH24:MI'),                   -- 0014
                              'amount_due_cents', public.testing_amount_due(v_id));                 -- 0014
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_add_private_student(uuid, text, text, uuid, boolean, text, date, time) from public, anon, authenticated, service_role;
grant  execute on function public.testing_add_private_student(uuid, text, text, uuid, boolean, text, date, time) to authenticated;


-- ---------------------------------------------------------------------
-- 4. The nine REPLACED functions (contract §2.5). Each is its live
--    version copied exactly (0005's for the first three, 0010's for the
--    other six), with only the lines marked "-- 0014:" added or changed.
--    Same arguments and names, so the live phase 3 site keeps working
--    between "0014 applied" and "phase 4 deployed": until someone sets a
--    private day (only possible with the new screens) every one of them
--    behaves exactly as before - one exception: Mark paid on a rank
--    priced $0 now answers already_paid (nothing to collect) instead of
--    0005's invalid. Their revoke / grant lines are the live ones,
--    repeated unchanged.
--    REMEMBER: re-running 0005 or 0010 puts the old versions back
--    (header: re-run order).
-- ---------------------------------------------------------------------

-- 14i. testing_mark_paid(p_registration_id, p_expected_version)   S
-- "Mark paid" (plan answer 6): one click records the FULL fee -
--   amount  = the event copy's early price if today (Massachusetts) is
--             before the testing date, else the testing-day price (1f)
--   method  = the registration's paying_by
--   paid_on = today
-- Allowed in every event state, Finished included. Refused for a
-- withdrawn student (withdrawn) or one already paid (already_paid). The
-- registration's version goes up, so a double click with the old version
-- gets "stale". Last step: the signature clean-up (12a).
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"cash","version":n}
-- 0014 (private testing): the amount is testing_amount_due() (section
-- 2b): the private price for a private student, or JUST the difference a
-- paid private student still owes (a top-up); nothing due (paid, or a $0
-- price) -> already_paid and nothing is inserted.
create or replace function public.testing_mark_paid(
  p_registration_id  uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r          public.testing_registrations;
  v_today      date;
  v_amount     integer;
  v_payment_id uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_registration_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_r.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    v_amount := public.testing_amount_due(p_registration_id);   -- 0014: what is due now (the price, or a top-up)
    if coalesce(v_amount, 0) <= 0 then                           -- 0014: nothing to collect
      return jsonb_build_object('status', 'already_paid');
    end if;

    v_today := public.testing_today();
    -- 0014: the fee lookup (testing_fee_cents) is gone: v_amount above is the amount

    perform set_config('tkd.action', 'mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (p_registration_id, 'payment', v_amount, v_r.paying_by, v_today, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_payment_id;

    update public.testing_registrations r
       set version = r.version + 1
     where r.id = p_registration_id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.testing_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'amount_cents', v_amount,
                              'method', v_r.paying_by, 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_mark_paid(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_mark_paid(uuid, integer) to authenticated;

-- 14h. testing_change_paying_by(p_registration_id, p_expected_version,
--        p_paying_by)   S
-- "Change how they'll pay": cash / check / card. Only while not paid
-- (already_paid) and not withdrawn (withdrawn).
-- Ok: {"status":"ok","version":n}
-- 0014 (private testing, Q3): also allowed while a PAID private student
-- still owes money (a top-up), so the difference can be paid another
-- way; already_paid only when something is paid AND nothing is due.
-- Earlier payments keep their method.
create or replace function public.testing_change_paying_by(
  p_registration_id  uuid,
  p_expected_version integer,
  p_paying_by        text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r          public.testing_registrations;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_registration_id is null or p_expected_version is null
       or p_paying_by is null or p_paying_by not in ('cash', 'check', 'card') then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_r.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if (select coalesce(sum(p.amount_cents), 0) from public.testing_payments p
         where p.registration_id = p_registration_id) > 0
       and coalesce(public.testing_amount_due(p_registration_id), 0) = 0 then   -- 0014: ... and nothing more is due
      return jsonb_build_object('status', 'already_paid');
    end if;

    perform set_config('tkd.action', 'change_paying_by', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_registrations r
       set paying_by = p_paying_by
     where r.id = p_registration_id
       and r.paying_by is distinct from p_paying_by
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_r.version));
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_change_paying_by(uuid, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_change_paying_by(uuid, integer, text) to authenticated;

-- 12a. testing_purge_old_signatures() - the 90-day clean-up (plan answer
-- 3): removes the drawn signature of every registration whose event's
-- testing date is MORE than 90 days ago (testing_date < today - 90), and
-- records when. No scheduled job: it runs as the LAST step of
-- testing_add_event and testing_mark_paid, and at the end of every
-- testing_public_register call. "skip locked" = rows someone else is
-- working on right now are simply left for next time, so it never waits.
-- The version and "last changed by" stay as they were (9c), and the
-- history row shows only "signature": "on file" -> null (9d) plus the
-- removal time. Returns how many signatures were removed.
-- 0014 (private testing, rulebook v0.254): 90 days after the LATER of the
-- testing day and the private day ("greatest" ignores an empty private
-- day).
create or replace function public.testing_purge_old_signatures()
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_action text := current_setting('tkd.action', true);
  v_batch  text := current_setting('tkd.batch_id', true);
  v_n      integer;
begin
  perform set_config('tkd.action', 'purge_old_signatures', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  update public.testing_registrations r
     set signature = null,
         signature_deleted_at = now()
   where r.id in (select x.id
                    from public.testing_registrations x
                    join public.testing_events e on e.id = x.event_id
                   where x.signature is not null
                     and greatest(e.testing_date, x.private_date) < public.testing_today() - 90   -- 0014: the later day
                     for update of x skip locked);
  get diagnostics v_n = row_count;

  -- put back whatever tags were set before (normally empty)
  perform set_config('tkd.action', coalesce(v_action, ''), true);
  perform set_config('tkd.batch_id', coalesce(v_batch, ''), true);
  return v_n;
end;
$$;

revoke execute on function public.testing_purge_old_signatures() from public, anon, authenticated, service_role;

-- 4a. testing_set_result(p_registration_id, p_result)   S
--   p_result: 'pass', 'not_passed', 'no_show', or NULL = clear the result
--   (the screen sends NULL when the chosen button is tapped again). The
--   note is kept as it is. Saving what is already stored writes nothing.
-- 0014 (private testing): the date rule counts from the student's OWN day
-- - the private day when private, else the testing day.
create or replace function public.testing_set_result(
  p_registration_id uuid,
  p_result          text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r            public.testing_registrations;
  v_testing_date date;
  v_today        date;
  v_old          public.testing_results;
  v_now          public.testing_results;
  v_new_result   text;
  v_new_note     text;
  v_constraint   text;
begin
  begin
    -- 1. access
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    -- 2. input
    if p_registration_id is null
       or (p_result is not null and p_result not in ('pass', 'not_passed', 'no_show')) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 3. lock school -> event -> registration, and look it up
    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 4. a withdrawn student can't be graded (the row, if any, stays)
    if v_r.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    -- 5. the date rule (read after the event lock in step 3)
    select e.testing_date into v_testing_date from public.testing_events e where e.id = v_r.event_id;
    v_today := public.testing_today();
    if v_today < coalesce(v_r.private_date, v_testing_date) then   -- 0014: the student's own day
      return jsonb_build_object('status', 'not_open');      -- before the testing day: nobody, admins too
    end if;
    if v_today > coalesce(v_r.private_date, v_testing_date) and public.is_admin() is not true then   -- 0014: the own day
      return jsonb_build_object('status', 'finished');      -- after it: admins only
    end if;

    -- 6. lock the result row (no row -> every field of v_old is NULL)
    select * into v_old from public.testing_results x where x.registration_id = p_registration_id for update;

    -- 7. write: the wanted pair = (the new result, the current note)
    v_new_result := p_result;
    v_new_note   := v_old.note;
    if v_new_result is not distinct from v_old.result
       and v_new_note is not distinct from v_old.note then
      null;   -- nothing to change (also: clearing when there is no row)
    else
      perform set_config('tkd.action', 'set_result', true);
      perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
      if v_new_result is null and v_new_note is null then
        delete from public.testing_results x where x.registration_id = p_registration_id;
      elsif v_old.registration_id is not null then
        update public.testing_results x
           set result = v_new_result
         where x.registration_id = p_registration_id;
      else
        -- no "on conflict": the registration lock already makes writers take turns
        insert into public.testing_results (registration_id, result, note)
        values (p_registration_id, v_new_result, v_new_note);
      end if;
    end if;

    -- 8. clear the tags; answer with what is stored now
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select * into v_now from public.testing_results x where x.registration_id = p_registration_id;
    return jsonb_build_object('status', 'ok', 'result', v_now.result, 'note', v_now.note,
                              'updated_at', v_now.updated_at, 'updated_by_name', v_now.updated_by_name);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_set_result(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_set_result(uuid, text) to authenticated;

-- 4b. testing_set_result_note(p_registration_id, p_note)   S
--   p_note: the note as typed. It is tidied first (runs of spaces, tabs
--   and line breaks become one space, ends trimmed); NULL or nothing left
--   after tidying = clear the note. Then 1 to 200 characters ("é" counts
--   as 1) with no invisible characters, else invalid (more than 2000
--   characters as sent -> invalid straight away). The result is kept
--   as it is. Saving what is already stored writes nothing.
-- 0014 (private testing): the date rule counts from the student's OWN day
-- - the private day when private, else the testing day.
create or replace function public.testing_set_result_note(
  p_registration_id uuid,
  p_note            text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r            public.testing_registrations;
  v_testing_date date;
  v_today        date;
  v_note         text;
  v_old          public.testing_results;
  v_now          public.testing_results;
  v_new_result   text;
  v_new_note     text;
  v_constraint   text;
begin
  begin
    -- 1. access
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    -- 2. input (v_note is the value that will be stored). A huge text is
    --    refused BEFORE tidying, so the tidy-up never works on megabytes.
    if p_note is not null and char_length(p_note) > 2000 then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_note := nullif(public.testing_normalize_name(p_note), '');
    if p_registration_id is null
       or (v_note is not null and not public.testing_line_is_valid(v_note, 200)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 3. lock school -> event -> registration, and look it up
    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 4. a withdrawn student can't be graded (the row, if any, stays)
    if v_r.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    -- 5. the date rule (read after the event lock in step 3)
    select e.testing_date into v_testing_date from public.testing_events e where e.id = v_r.event_id;
    v_today := public.testing_today();
    if v_today < coalesce(v_r.private_date, v_testing_date) then   -- 0014: the student's own day
      return jsonb_build_object('status', 'not_open');      -- before the testing day: nobody, admins too
    end if;
    if v_today > coalesce(v_r.private_date, v_testing_date) and public.is_admin() is not true then   -- 0014: the own day
      return jsonb_build_object('status', 'finished');      -- after it: admins only
    end if;

    -- 6. lock the result row (no row -> every field of v_old is NULL)
    select * into v_old from public.testing_results x where x.registration_id = p_registration_id for update;

    -- 7. write: the wanted pair = (the current result, the new note)
    v_new_result := v_old.result;
    v_new_note   := v_note;
    if v_new_result is not distinct from v_old.result
       and v_new_note is not distinct from v_old.note then
      null;   -- nothing to change (also: clearing when there is no row)
    else
      perform set_config('tkd.action', 'set_result_note', true);
      perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
      if v_new_result is null and v_new_note is null then
        delete from public.testing_results x where x.registration_id = p_registration_id;
      elsif v_old.registration_id is not null then
        update public.testing_results x
           set note = v_new_note
         where x.registration_id = p_registration_id;
      else
        -- no "on conflict": the registration lock already makes writers take turns
        insert into public.testing_results (registration_id, result, note)
        values (p_registration_id, v_new_result, v_new_note);
      end if;
    end if;

    -- 8. clear the tags; answer with what is stored now
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select * into v_now from public.testing_results x where x.registration_id = p_registration_id;
    return jsonb_build_object('status', 'ok', 'result', v_now.result, 'note', v_now.note,
                              'updated_at', v_now.updated_at, 'updated_by_name', v_now.updated_by_name);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_set_result_note(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_set_result_note(uuid, text) to authenticated;

-- 14g. testing_update_student(p_registration_id, p_expected_version,
--        p_first, p_last, p_event_rank_id)   S
-- Edit details: names and belt (the class follows the belt), in any event
-- state. Payments are not touched (a belt corrected after paying leaves
-- the payment as it is). The duplicate mark is worked out again for this
-- registration and for any that pointed at it. Nothing changed -> writes
-- nothing.
-- Ok: {"status":"ok","version":n}
-- 0010 (grading): a belt change (the class follows the belt) of a GRADED
-- student removes their result row in the same step, logged as its own
-- action clear_result under the same batch id; the answer is then
-- {"status":"ok","version":n,"result_cleared":true} - the key is there
-- ONLY when a result was cleared. After the testing day only an admin may
-- change a graded student's belt (staff -> not_allowed, nothing written).
-- Name-only edits never touch the result.
-- 0014 (private testing): "after the testing day" in that lock is the
-- student's OWN day (the private day when private). A PRIVATE student's
-- ok answer also has "amount_due_cents" (testing_amount_due() after the
-- write: a belt change re-prices them, Q2); a regular student's answer
-- is exactly as before.
create or replace function public.testing_update_student(
  p_registration_id uuid,
  p_expected_version integer,
  p_first           text,
  p_last            text,
  p_event_rank_id   uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r          public.testing_registrations;
  v_first      text;
  v_last       text;
  v_version    integer;
  v_n          integer;
  v_constraint text;
  v_rank_changed boolean;   -- 0010
  v_graded       boolean;   -- 0010
  v_testing_date date;      -- 0010
  v_extra        jsonb := '{}'::jsonb;   -- 0014: amount_due_cents for a private student
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    v_first := public.testing_normalize_name(p_first);
    v_last  := public.testing_normalize_name(p_last);
    if p_registration_id is null or p_expected_version is null
       or not public.testing_name_is_valid(p_first)
       or not public.testing_name_is_valid(p_last)
       or p_event_rank_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if not exists (select 1 from public.testing_event_ranks k
                     join public.testing_event_classes c on c.id = k.event_class_id
                    where k.id = p_event_rank_id and c.event_id = v_r.event_id) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 0010: does the belt change, is the student graded (lock the result
    -- row), and is the testing day over? (testing_date read after the
    -- event lock taken by testing_lock_registration)
    v_rank_changed := p_event_rank_id is distinct from v_r.event_rank_id;
    perform 1 from public.testing_results x where x.registration_id = p_registration_id for update;
    v_graded := found;
    select e.testing_date into v_testing_date from public.testing_events e where e.id = v_r.event_id;
    if v_rank_changed and v_graded and public.testing_today() > coalesce(v_r.private_date, v_testing_date) and public.is_admin() is not true then   -- 0014: the own day
      return jsonb_build_object('status', 'not_allowed');
    end if;

    perform set_config('tkd.action', 'update_student', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_registrations r
       set first_name    = v_first,
           last_name     = v_last,
           event_rank_id = p_event_rank_id
     where r.id = p_registration_id
       and (r.first_name is distinct from v_first
            or r.last_name is distinct from v_last
            or r.event_rank_id is distinct from p_event_rank_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      perform public.testing_recheck_duplicate(p_registration_id);
      perform public.testing_recheck_pointing_at(p_registration_id);
    end if;

    -- 0010: a new belt clears the result (and note), as its own action
    -- in the same batch
    if v_rank_changed and v_graded then
      perform set_config('tkd.action', 'clear_result', true);
      delete from public.testing_results x where x.registration_id = p_registration_id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select r.version into v_version from public.testing_registrations r where r.id = p_registration_id;
    if v_r.private_date is not null then                                                                 -- 0014: a private student:
      v_extra := jsonb_build_object('amount_due_cents', public.testing_amount_due(p_registration_id));   -- 0014: what is due now
    end if;                                                                                              -- 0014
    -- 0010: "result_cleared" only when true (otherwise exactly 0005's answer)
    if v_rank_changed and v_graded then
      return jsonb_build_object('status', 'ok', 'version', v_version, 'result_cleared', true) || v_extra;   -- 0014: || v_extra
    end if;
    return jsonb_build_object('status', 'ok', 'version', v_version) || v_extra;   -- 0014: || v_extra
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_update_student(uuid, integer, text, text, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_update_student(uuid, integer, text, text, uuid) to authenticated;

-- 14m. testing_resolve_duplicate(p_keep_id, p_keep_version, p_other_id,
--        p_other_version, p_keep_both)   S
-- The "Possible duplicate" box (Star v0.114):
--   keep one (p_keep_both false): the other is withdrawn as
--     "duplicate_copy" (the one withdrawal staff may do, Star v0.110);
--     its payments stay; withdrawn_by = the caller, so the same person
--     may Undo it from the toast for 10 seconds (14o)
--   keep both (true): both are marked kept_both (pointing at each other),
--     so the box doesn't come back for this pair
-- Both must be active registrations of the same event, and one must be
-- marked "possible duplicate" of the other (else stale: the box changed).
-- Ok: {"status":"ok"}
-- 0010 (grading, rulebook v0.194): after the testing day, "keep one" is
-- ADMIN-ONLY for every student, graded or not (staff -> not_allowed).
-- Otherwise renaming a graded student to match someone, then keeping the
-- other, would take a graded student off the Grading tab. On the testing
-- day and before it nothing changes; keep both is unchanged (staff too).
-- 0014 (private testing, review H3): ... and also after the private day
-- of the student being withdrawn, when they are private (a private day
-- can be BEFORE the testing day).
create or replace function public.testing_resolve_duplicate(
  p_keep_id       uuid,
  p_keep_version  integer,
  p_other_id      uuid,
  p_other_version integer,
  p_keep_both     boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc        text;
  v_event_id   uuid;
  v_other_ev   uuid;
  v_keep       public.testing_registrations;
  v_other      public.testing_registrations;
  v_constraint text;
  v_testing_date date;      -- 0010
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_keep_id is null or p_keep_version is null or p_other_id is null or p_other_version is null
       or p_keep_both is null or p_keep_id = p_other_id then
      return jsonb_build_object('status', 'invalid');
    end if;

    select e.location_code, r.event_id into v_loc, v_event_id
      from public.testing_registrations r join public.testing_events e on e.id = r.event_id
     where r.id = p_keep_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    select r.event_id into v_other_ev from public.testing_registrations r where r.id = p_other_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_other_ev <> v_event_id then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;
    perform 1 from public.testing_events e where e.id = v_event_id for no key update;
    -- 0010: the testing date, read after the event lock
    select e.testing_date into v_testing_date from public.testing_events e where e.id = v_event_id;
    perform 1 from public.testing_registrations r where r.id in (p_keep_id, p_other_id) order by r.id for update;
    select * into v_keep  from public.testing_registrations r where r.id = p_keep_id;
    select * into v_other from public.testing_registrations r where r.id = p_other_id;
    if v_keep.id is null or v_other.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_keep.version <> p_keep_version or v_other.version <> p_other_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_keep.status <> 'active' or v_other.status <> 'active'
       or not ((v_keep.duplicate_state = 'possible' and v_keep.duplicate_of = p_other_id)
               or (v_other.duplicate_state = 'possible' and v_other.duplicate_of = p_keep_id)) then
      return jsonb_build_object('status', 'stale');
    end if;
    -- 0010 (rulebook v0.194): after the testing day, "keep one" is for
    -- admins only - for every student, graded or not (so a graded student
    -- can never be taken off the Grading tab this way). Keep both
    -- withdraws nobody and stays allowed for staff.
    if p_keep_both is false
       and (public.testing_today() > v_testing_date                                                      -- 0014: (
            or (v_other.private_date is not null and public.testing_today() > v_other.private_date))     -- 0014: or after the withdrawn one's private day)
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    perform set_config('tkd.action', 'resolve_duplicate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_keep_both then
      update public.testing_registrations r
         set duplicate_state = 'kept_both',
             duplicate_of    = case when r.id = p_keep_id then p_other_id else p_keep_id end
       where r.id in (p_keep_id, p_other_id);
    else
      update public.testing_registrations r
         set status            = 'withdrawn',
             withdrawn_reason  = 'duplicate_copy',
             withdrawn_at      = now(),
             withdrawn_by_name = public.change_log_actor_name(),
             withdrawn_by      = auth.uid(),
             duplicate_state   = 'none',
             duplicate_of      = null
       where r.id = p_other_id;
      perform public.testing_recheck_duplicate(p_keep_id);
      perform public.testing_recheck_pointing_at(p_other_id);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_resolve_duplicate(uuid, integer, uuid, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.testing_resolve_duplicate(uuid, integer, uuid, integer, boolean) to authenticated;

-- 14o. testing_restore_student(p_registration_id, p_expected_version)
--        S (own "keep one", within 10 s) / A
-- Restore a withdrawn student (back to active; the duplicate mark is
-- worked out again - for the student AND for its partner: the registration
-- it now matches and any registrations pointing at it are checked again
-- too, so both sides of the pair show "possible duplicate" again). Who may (same pattern as 14k's payment Undo):
--   the staff member who withdrew it with "keep one" (withdrawn_reason
--   'duplicate_copy', withdrawn_by = the caller), less than 10 seconds
--   ago - the toast's 5-second Undo; the database decides this from
--   withdrawn_by and withdrawn_at;
--   otherwise admins only, at any time (not_allowed).
-- An active student -> invalid (admins) / not_allowed (staff).
-- Ok: {"status":"ok","version":n}
-- 0010 (grading): the staff Undo is also refused (not_allowed) when the
-- student is GRADED and the testing day is over. Admins unchanged. A
-- restore brings the kept result back (its row was never removed).
-- 0014 (private testing, review H3): "the testing day is over" also means
-- "the student's private day is over" when they are private.
create or replace function public.testing_restore_student(
  p_registration_id  uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r          public.testing_registrations;
  v_version    integer;
  v_of         uuid;
  v_constraint text;
  v_testing_date date;      -- 0010
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_registration_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    -- staff: only their own "keep one", less than 10 seconds ago
    if public.is_admin() is not true
       and not coalesce(v_r.status = 'withdrawn'
                        and v_r.withdrawn_reason = 'duplicate_copy'
                        and v_r.withdrawn_by = auth.uid()
                        and v_r.withdrawn_at > now() - interval '10 seconds', false) then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    -- 0010: ... and not a graded student after the testing day
    -- (testing_date read after the event lock taken above)
    select e.testing_date into v_testing_date from public.testing_events e where e.id = v_r.event_id;
    if public.is_admin() is not true
       and (public.testing_today() > v_testing_date                                                -- 0014: (
            or (v_r.private_date is not null and public.testing_today() > v_r.private_date))       -- 0014: or after the private day)
       and exists (select 1 from public.testing_results x where x.registration_id = p_registration_id) then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_r.status <> 'withdrawn' then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'restore_student', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_registrations r
       set status            = 'active',
           withdrawn_reason  = null,
           withdrawn_at      = null,
           withdrawn_by_name = null,
           withdrawn_by      = null
     where r.id = p_registration_id;
    perform public.testing_recheck_duplicate(p_registration_id);
    -- the partner side: the registration it now matches (often back to
    -- "none" since the Withdraw) and any registrations pointing at it
    select r.duplicate_of into v_of from public.testing_registrations r where r.id = p_registration_id;
    if v_of is not null then
      perform public.testing_recheck_duplicate(v_of);
    end if;
    perform public.testing_recheck_pointing_at(p_registration_id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select r.version into v_version from public.testing_registrations r where r.id = p_registration_id;
    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_restore_student(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_restore_student(uuid, integer) to authenticated;

-- 14b. testing_update_event(p_event_id, p_expected_version, p_name,
--        p_testing_date, p_classes, p_auto_close_on, p_note)   A
-- Edit event: name, date, note, closing date and the class list.
--   testing date: today or later - unless it is unchanged (a past event
--     may keep its date)
--   closing date: when CHANGED, NULL or from today up to the testing date;
--     an unchanged one must still be on or before the testing date
--   class list, compared with the event's classes:
--     newly ticked  -> copied now, with today's Classes and ranks (12e, 12f)
--     unticked      -> removed, but not_empty if it has ANY registration
--                      (active or withdrawn)
--     still ticked  -> only the times are updated (always allowed)
-- The switch is not changed here (14c). Saving with nothing changed
-- writes nothing. A change to the classes only still bumps the version.
-- Ok: {"status":"ok","version":n}
-- 0010 (grading): once ANY student of the event (active or withdrawn) has
-- a result or note, the testing date can't change: {"status":
-- "has_results"} (otherwise moving a finished event to today would open
-- grading again). Name, note, closing date and classes still can.
-- 0014 (private testing, review M3): a PRIVATE student's result doesn't
-- count (it was graded on their own day, which the event's date doesn't
-- move); a private student's note-only row still counts, because that
-- student can still go back to the testing day.
create or replace function public.testing_update_event(
  p_event_id         uuid,
  p_expected_version integer,
  p_name             text,
  p_testing_date     date,
  p_classes          jsonb,
  p_auto_close_on    date,
  p_note             text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_name       text;
  v_note       text;
  v_loc        text;
  v_e          public.testing_events;
  v_class_ids  uuid[];
  v_added      uuid[];
  v_removed    uuid[];
  v_check      jsonb;
  v_item       record;
  v_changed    boolean := false;
  v_n          integer;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 3. input (the rules that compare with the saved event come below)
    v_today := public.testing_today();
    v_name  := public.testing_normalize_name(p_name);
    v_note  := public.testing_normalize_note(p_note);
    if p_event_id is null
       or p_expected_version is null
       or not public.testing_name_is_valid(p_name)
       or p_testing_date is null
       or (v_note is not null and not public.testing_note_is_valid(v_note))
       or not public.testing_classes_arg_is_valid(p_classes) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_class_ids := array(select (x.value ->> 'class_id')::uuid from jsonb_array_elements(p_classes) as x(value));

    -- 4. find the school, lock it, then lock the event ("for update": it
    --    is the row being changed)
    select e.location_code into v_loc from public.testing_events e where e.id = p_event_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.locations l where l.code = v_loc for no key update;
    select * into v_e from public.testing_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 5. someone else saved it since the dialog opened?
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 0010: no date change once the event has results
    if p_testing_date is distinct from v_e.testing_date
       and exists (select 1
                     from public.testing_results x
                     join public.testing_registrations r on r.id = x.registration_id
                    where r.event_id = p_event_id
                      and (r.private_date is null or x.result is null)) then   -- 0014: not a private student's result
      return jsonb_build_object('status', 'has_results');
    end if;

    -- 6. rules that depend on the saved event
    if p_testing_date is distinct from v_e.testing_date and p_testing_date < v_today then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_auto_close_on is distinct from v_e.auto_close_on
       and p_auto_close_on is not null
       and (p_auto_close_on < v_today or p_auto_close_on > p_testing_date) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_auto_close_on is not null and p_auto_close_on > p_testing_date then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.testing_events e
                where e.location_code = v_loc
                  and e.id <> p_event_id
                  and lower(public.testing_normalize_name(e.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    v_added := array(select x.id from unnest(v_class_ids) as x(id)
                      where not exists (select 1 from public.testing_event_classes c
                                         where c.event_id = p_event_id and c.class_id = x.id)
                      order by x.id);
    v_removed := array(select c.id from public.testing_event_classes c
                        where c.event_id = p_event_id
                          and not (c.class_id = any (v_class_ids))
                        order by c.id);
    if exists (select 1
                 from public.testing_registrations r
                 join public.testing_event_ranks k on k.id = r.event_rank_id
                where k.event_class_id = any (v_removed)) then
      return jsonb_build_object('status', 'not_empty');
    end if;
    if cardinality(v_added) > 0 then
      v_check := public.testing_check_classes_for_event(v_loc, v_added);
      if v_check ->> 'status' <> 'ok' then
        return v_check;
      end if;
    end if;

    -- 8. write
    perform set_config('tkd.action', 'update_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if cardinality(v_removed) > 0 then
      delete from public.testing_event_classes c where c.id = any (v_removed);
      v_changed := true;
    end if;

    for v_item in select (x.value ->> 'class_id')::uuid as class_id,
                         (x.value ->> 'start_time')::time as start_time,
                         (x.value ->> 'end_time')::time as end_time
                    from jsonb_array_elements(p_classes) as x(value) loop
      if v_item.class_id = any (v_added) then
        perform public.testing_copy_class_into_event(p_event_id, v_item.class_id, v_item.start_time, v_item.end_time);
        v_changed := true;
      else
        update public.testing_event_classes c
           set start_time = v_item.start_time,
               end_time   = v_item.end_time
         where c.event_id = p_event_id
           and c.class_id = v_item.class_id
           and (c.start_time <> v_item.start_time or c.end_time <> v_item.end_time);
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_changed := true;
        end if;
      end if;
    end loop;

    -- the event row: new values, plus a version bump if only classes changed
    update public.testing_events e
       set name          = v_name,
           testing_date  = p_testing_date,
           auto_close_on = p_auto_close_on,
           note          = v_note,
           version       = case when v_changed then e.version + 1 else e.version end
     where e.id = p_event_id
       and (v_changed
            or e.name is distinct from v_name
            or e.testing_date is distinct from p_testing_date
            or e.auto_close_on is distinct from p_auto_close_on
            or e.note is distinct from v_note)
    returning e.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_e.version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'testing_events_location_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_update_event(uuid, integer, text, date, jsonb, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_update_event(uuid, integer, text, date, jsonb, date, text) to authenticated;


commit;
