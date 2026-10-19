-- =====================================================================
-- 0010_testing_results.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database migration for Color Belt testing phase 3: the Grading
--   tab (build contract docs/Dashboard Docs/Build contracts/
--   CONTRACT-0010.md, section 1). It runs after 0001-0005 (all live).
--   (0006-0009 are numbers claimed by other branches - Star testing,
--   Schedule, Calendar, Forms - and none of them touches what this file
--   touches.)
--
-- WHY IT EXISTS
--   On the testing day staff record each registered student's result
--   (Pass / Not passed / No show) and, if needed, a short note, on the
--   event page's Grading tab. Before the testing day nobody can; after it
--   only an admin can (rulebook v0.186). The database enforces that rule
--   itself, so it holds whatever the screen shows.
--   Results live in their OWN table, not in testing_registrations, so a
--   grader's tap never changes a registration's version: the desk's Mark
--   paid / Edit details never become "stale" because someone graded
--   (rulebook v0.187: the last change wins, no version on results).
--
-- WHAT IT ADDS
--   1. public.testing_results - one row per graded student (a result, a
--      note or both); clearing both removes the row
--   2. 2 staff functions (the ONLY way to write it):
--        testing_set_result(p_registration_id, p_result)
--        testing_set_result_note(p_registration_id, p_note)
--   3. 2 trigger functions: testing_results_before_write (stamps "when /
--      who") and testing_results_log (the history, like
--      testing_registrations_log), and 3 triggers: those two plus
--      testing_results_no_truncate
--   4. 5 REPLACED 0005 functions - same arguments, same body, plus only
--      the grading lines (contract §1.6):
--        testing_update_student     a belt / class change clears the
--                                   result (logged as clear_result); after
--                                   the testing day only an admin may
--                                   change a graded student's belt; the
--                                   answer gets "result_cleared": true
--                                   ONLY when a result was cleared
--        testing_resolve_duplicate  staff can't "keep one" by withdrawing a
--                                   graded student after the testing day
--        testing_restore_student    staff's 10-second Undo: the same rule
--        testing_add_student        admins may add a student after the
--                                   testing day (rulebook v0.191)
--        testing_update_event       the date can't change once the event
--                                   has any result (new status has_results)
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words appear inside a rule ("on delete cascade": removing a student
--   removes their result), inside functions that run later (clearing a
--   result removes its row) and in "drop ... if exists" lines that make
--   re-running safe. Nothing is removed now. Confirm.
--   (Claude's Supabase connection refuses SQL containing those words, which
--   is why this file is pasted by hand.)
--   Safe to run again: "create table if not exists", "create or replace
--   function", rules and triggers replaced with "... if exists" + create,
--   rights reset with "revoke all" and granted again. A second run changes
--   no row and no fingerprint (tested in PGlite, run.mjs step 12).
--   NOTE: re-running 0005 AFTER this file puts back the phase 2 versions
--   of the five replaced functions (without the grading locks). After 0010
--   exists, re-run 0005 only together with 0010 straight after it
--   (supabase/SETUP.md section 13).
--   Undo: the down-script is in supabase/SETUP.md section 13e (not here).
--
-- WORDS USED BELOW
--   * "graded" = a testing_results row exists for the registration (a
--     result OR a note).
--   * "before / on / after the testing day" = testing_today() (school
--     time, America/New_York - 0005 section 1e) is earlier than / equal
--     to / later than the event's testing_date. "Today" is only ever
--     public.testing_today().
--   * "lock", "security definer", search_path = '', "stale": the same
--     meaning as in 0003 and 0005 (read their headers).
--   * statuses the functions answer: 0005's set (ok, no_access,
--     not_allowed, not_found, stale, duplicate_name, invalid, not_empty,
--     final_award_not_set, rate_limited, not_open, closed, finished,
--     already_paid, withdrawn) plus has_results (testing_update_event).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. public.testing_results - one row per graded student
--   * registration_id: the student's registration (also the row's key, so
--     a student has at most one result). Removing the registration (or its
--     event) removes the result too ("on delete cascade"). Never changes.
--   * result: 'pass', 'not_passed', 'no_show', or NULL (not recorded yet -
--     the row may exist for the note alone).
--   * note: one line, up to 200 characters, tidied like a name (runs of
--     spaces, tabs and line breaks become one space, ends trimmed) and
--     with no invisible characters. It reuses 0003's
--     testing_normalize_name and 0005's testing_line_is_valid (0005's
--     multi-line note rule is fixed at 600 characters, so it doesn't fit).
--   * updated_at / updated_by / updated_by_name: when and who, stamped by
--     the trigger in section 2 (for the "Nov 20, 5:41 PM by Staff" line).
--     updated_by is a login id: NOT readable by the app (as 0005's
--     created_by / updated_by); no foreign key on purpose (as 0003).
--   * a row exists only while a result or a note is set (not_empty rule);
--     clearing both removes the row (the functions do that).
-- Holds nothing about the student except the result and the note.
-- ---------------------------------------------------------------------
create table if not exists public.testing_results (
  registration_id uuid        not null,
  result          text        null,
  note            text        null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid        null,          -- login id; no foreign key on purpose (as 0003)
  updated_by_name text        not null,

  constraint testing_results_pkey primary key (registration_id),
  constraint testing_results_registration_fk
    foreign key (registration_id) references public.testing_registrations (id) on delete cascade,
  constraint testing_results_result_check
    check (result is null or result in ('pass', 'not_passed', 'no_show')),
  constraint testing_results_note_check
    check (note is null or (public.testing_line_is_valid(note, 200) and note = public.testing_normalize_name(note))),
  -- a row with neither a result nor a note means nothing: it is removed instead
  constraint testing_results_not_empty_check
    check (num_nonnulls(result, note) > 0)
);

comment on table public.testing_results is
  'Grading: one row per graded registration (result pass / not_passed / no_show and/or a one-line note of up to 200 characters). Written only by testing_set_result / testing_set_result_note. updated_by is never readable by any client role.';
comment on column public.testing_results.updated_by is
  'Login id of whoever last changed the result or note. Never granted to a client role (the app shows updated_by_name).';


-- ---------------------------------------------------------------------
-- 2. Trigger functions (run automatically on every write)
-- ---------------------------------------------------------------------

-- 2a. testing_results_before_write() - BEFORE INSERT OR UPDATE
--   insert: stamps when + who
--   update: the registration can never change (error); a change to the
--           result or the note stamps when + who again; an update that
--           changes nothing keeps the old stamps (the row stays as it was)
-- Not security definer: it only fills in the row being written.
create or replace function public.testing_results_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at      := now();
    new.updated_by      := auth.uid();
    new.updated_by_name := public.change_log_actor_name();
    return new;
  end if;

  if new.registration_id is distinct from old.registration_id then
    raise exception using
      errcode    = '23514',
      constraint = 'testing_results_immutable',
      message    = 'the registration of a result can''t change';
  end if;

  if new.result is distinct from old.result
     or new.note is distinct from old.note then
    new.updated_at      := now();
    new.updated_by      := auth.uid();
    new.updated_by_name := public.change_log_actor_name();
  else
    new.updated_at      := old.updated_at;
    new.updated_by      := old.updated_by;
    new.updated_by_name := old.updated_by_name;
  end if;
  return new;
end;
$$;

revoke execute on function public.testing_results_before_write() from public, anon, authenticated, service_role;

-- 2b. testing_results_log() - AFTER INSERT OR UPDATE OR DELETE: the same
-- history row as 0005's testing_registrations_log (only the keys that
-- changed go into before / after; an update that changed nothing visible
-- writes no row), except:
--   * record_id = registration_id (this table has no "id" column, which is
--     why 0003's shared change_log_write can't be used), so a student's
--     history joins straight to their result;
--   * nothing is left out: the table holds nothing sensitive (updated_by
--     is kept in the JSON, as testing_registrations_log keeps updated_by).
-- The action name comes from tkd.action, set by the functions
-- (set_result, set_result_note, clear_result, delete_student,
-- delete_event); a direct write in the SQL Editor shows 'manual'.
-- security definer so it can write to change_log, which nobody else can.
create or replace function public.testing_results_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    jsonb;
  v_new    jsonb;
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  if tg_op = 'INSERT' then
    v_after := v_new;
    v_row   := v_new;
  elsif tg_op = 'UPDATE' then
    select jsonb_object_agg(o.key, o.value) into v_before
      from jsonb_each(v_old) as o(key, value)
     where o.value is distinct from v_new -> o.key;
    select jsonb_object_agg(n.key, n.value) into v_after
      from jsonb_each(v_new) as n(key, value)
     where n.value is distinct from v_old -> n.key;
    if v_before is null and v_after is null then
      return null;
    end if;
    v_row := v_new;
  else
    v_before := v_old;
    v_row    := v_old;
  end if;

  insert into public.change_log
    (actor_id, actor_name, session_id, batch_id, action,
     table_name, record_id, location_code, op, before, after)
  values
    (auth.uid(),
     public.change_log_actor_name(),
     public.current_session_id(),
     nullif(current_setting('tkd.batch_id', true), '')::uuid,
     coalesce(nullif(current_setting('tkd.action', true), ''), 'manual'),
     tg_table_name,
     (v_row ->> 'registration_id')::uuid,
     null,
     lower(tg_op),
     v_before,
     v_after);
  return null;
end;
$$;

revoke execute on function public.testing_results_log() from public, anon, authenticated, service_role;

-- 2c. Attach the triggers ("drop trigger if exists" + create = replace).
drop trigger if exists testing_results_before_write on public.testing_results;
create trigger testing_results_before_write
  before insert or update on public.testing_results
  for each row execute function public.testing_results_before_write();

drop trigger if exists testing_results_log on public.testing_results;
create trigger testing_results_log
  after insert or update or delete on public.testing_results
  for each row execute function public.testing_results_log();

-- No "empty the whole table" shortcut (it would skip the history), as 0003.
drop trigger if exists testing_results_no_truncate on public.testing_results;
create trigger testing_results_no_truncate
  before truncate on public.testing_results
  for each statement execute function public.testing_refuse_truncate();


-- ---------------------------------------------------------------------
-- 3. Security rules: RLS + grants (same two layers as 0005 section 11)
--   * grants: the app may READ five columns - never updated_by (a login
--     id). No INSERT / UPDATE / DELETE / TRUNCATE for anyone in the app:
--     writes go through the two functions in section 4.
--   * RLS: which ROWS - every row, but only while has_data_access() is
--     true (unlocked, still signed in, not PIN-locked, password within 7
--     days). A locked screen sees no results at all.
--   * Nothing for anon, service_role (the secret key) or the family
--     form's login testing_registrar.
-- ---------------------------------------------------------------------
alter table public.testing_results enable row level security;

-- Start from zero (also removes column grants, so re-runs stay clean)...
revoke all on table public.testing_results from public, anon, authenticated, service_role;

-- ...then add back exactly what the app reads.
grant select (registration_id, result, note, updated_at, updated_by_name)
  on public.testing_results to authenticated;          -- NOT updated_by

-- Read rule ("(select ...)" = run the check once per query, not per row).
drop policy if exists testing_results_select_with_access on public.testing_results;
create policy testing_results_select_with_access
  on public.testing_results for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 4. The two staff functions (S = staff and admins). Same pattern as
--    0005 section 14:
--   * returns {"status": ...}
--   * checks in this order: has_data_access() FIRST, then the input, then
--     it locks school -> event -> registration (0005's
--     testing_lock_registration) and looks the student up (not_found),
--     then withdrawn, then the date rule, then it locks the result row
--     and writes
--   * the date rule reads the event's testing_date AFTER the event row is
--     locked, so it lines up with testing_update_event (which locks the
--     same row "for update" before it can move the date)
--   * no expected-version argument: the last change wins (v0.187). The
--     registration lock makes two calls for the same student take turns.
--   * tags its writes with tkd.action + tkd.batch_id and clears them
--   * the whole body is inside begin ... exception ... end, with 0005's
--     mapping (unique rule -> stale; foreign key / check / not-null ->
--     invalid; deadlock / serialization / lock not available -> stale)
--   * ok answer: {"status":"ok","result":...,"note":...,"updated_at":...,
--     "updated_by_name":...} = what is stored NOW (all four null when no
--     row is left). Other answers: no_access, invalid, not_found,
--     withdrawn, not_open, finished, stale.
-- ---------------------------------------------------------------------

-- 4a. testing_set_result(p_registration_id, p_result)   S
--   p_result: 'pass', 'not_passed', 'no_show', or NULL = clear the result
--   (the screen sends NULL when the chosen button is tapped again). The
--   note is kept as it is. Saving what is already stored writes nothing.
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
    if v_today < v_testing_date then
      return jsonb_build_object('status', 'not_open');      -- before the testing day: nobody, admins too
    end if;
    if v_today > v_testing_date and public.is_admin() is not true then
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
    if v_today < v_testing_date then
      return jsonb_build_object('status', 'not_open');      -- before the testing day: nobody, admins too
    end if;
    if v_today > v_testing_date and public.is_admin() is not true then
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


-- ---------------------------------------------------------------------
-- 5. The five REPLACED 0005 functions (contract §1.6). Each is 0005's
--    function copied exactly, with only the lines marked "-- 0010:"
--    added (and, in testing_add_student, one condition added to an
--    existing line). Same arguments and names, so the live phase 2 site
--    keeps working between "0010 applied" and "phase 3 deployed". Their
--    revoke / grant lines are 0005's, repeated unchanged.
--    REMEMBER: re-running 0005 puts the old versions back (header).
-- ---------------------------------------------------------------------

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
    if v_rank_changed and v_graded and public.testing_today() > v_testing_date and public.is_admin() is not true then
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
    -- 0010: "result_cleared" only when true (otherwise exactly 0005's answer)
    if v_rank_changed and v_graded then
      return jsonb_build_object('status', 'ok', 'version', v_version, 'result_cleared', true);
    end if;
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
-- 0010 (grading): after the testing day, staff can't "keep one" when the
-- copy being withdrawn is GRADED (not_allowed) - otherwise renaming a
-- graded student to match someone, then keeping the other, would take a
-- graded student off the Grading tab. Admins can; keep both is unchanged.
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
    -- 0010: staff can't withdraw a graded copy after the testing day
    -- (its registration is already locked above)
    if p_keep_both is false
       and exists (select 1 from public.testing_results x where x.registration_id = p_other_id)
       and public.testing_today() > v_testing_date
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
       and public.testing_today() > v_testing_date
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

-- 14e. testing_add_student(p_event_id, p_first, p_last, p_event_rank_id,
--        p_stripes, p_paying_by)   S
-- Add student at the desk (walk-ins): source 'staff', in any state except
-- Finished (also after registration closed, and on the testing day).
-- p_stripes must be true (the 3-stripes tick); paying by cash/check/card;
-- the rank must be one of THIS event's. A same-name registration in the
-- event marks the new one "possible duplicate".
-- Ok: {"status":"ok","id":...,"reference":"CB-....","version":1}
-- 0010 (rulebook v0.191): ADMINS may also add a student to a Finished
-- event (a walk-in written on the printed sheet, or a paper-graded event);
-- staff still get finished. Everything else is unchanged.
create or replace function public.testing_add_student(
  p_event_id      uuid,
  p_first         text,
  p_last          text,
  p_event_rank_id uuid,
  p_stripes       boolean,
  p_paying_by     text
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
       or p_paying_by is null or p_paying_by not in ('cash', 'check', 'card') then
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

    perform set_config('tkd.action', 'add_student', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    v_dup := public.testing_find_duplicate(p_event_id, null, p_first, p_last);
    insert into public.testing_registrations
      (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
       duplicate_state, duplicate_of)
    values
      (p_event_id, p_event_rank_id, public.testing_normalize_name(p_first), public.testing_normalize_name(p_last),
       p_paying_by, true, 'staff',
       case when v_dup is null then 'none' else 'possible' end, v_dup)
    returning id, reference, version into v_id, v_reference, v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'reference', v_reference, 'version', v_version);
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

revoke execute on function public.testing_add_student(uuid, text, text, uuid, boolean, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_add_student(uuid, text, text, uuid, boolean, text) to authenticated;

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
                    where r.event_id = p_event_id) then
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
