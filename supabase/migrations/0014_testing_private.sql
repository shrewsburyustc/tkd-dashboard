-- =====================================================================
-- 0014_testing_private.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database migration for Color Belt testing phase 4: the Private
--   testing tab (build contract docs/Dashboard Docs/Build contracts/
--   CONTRACT-0014.md, section 2 - rewritten 2026-10-19 for rulebook
--   v0.401: private testing is its own tab, NOT part of any event). It
--   runs after 0001-0006, 0010 and 0011 (Finance) - all live. (0007-0009,
--   0012 and 0013 are numbers claimed by other branches - Schedule,
--   Calendar, Forms, Prospects, Camps - and neither they nor 0011 touch
--   what this file touches.)
--
-- WHY IT EXISTS
--   A student who can't make a testing day tests PRIVATELY, on their own
--   day and time, at their rank's private price. A private testing is its
--   own record (school, student, a COPY of their class and belt, price,
--   paying by, day, time), with its own payments and its own result - the
--   same shape as an event's registrations, payments and results, but in
--   three new tables, so no live table, view or check had to change. Staff
--   can also MOVE a student from an event's roster into a private testing:
--   the student leaves the event and their money moves with them.
--   The database enforces every rule itself, so they hold whatever the
--   screen shows.
--
-- WHAT IT ADDS
--   1. 3 tables: public.testing_private (one row per private testing),
--      public.testing_private_payments (append-only, like
--      testing_payments) and public.testing_private_results (one row per
--      graded private testing, like testing_results)
--   2. 1 read view: public.testing_private_list (the row + its payment
--      summary + what is still owed)
--   3. 4 trigger functions: testing_private_before_write,
--      testing_private_results_before_write, testing_private_payments_guard
--      and testing_private_log (the history, on all three tables)
--   4. 5 internal helpers (nobody in the app may call them):
--      testing_private_time_is_valid, testing_private_amount_due,
--      testing_private_lock, testing_private_lock_payment,
--      testing_private_rank_copy
--   5. 14 staff functions (the ONLY way to write): add, update,
--      change_day, change_paying_by, mark_paid, undo_payment,
--      edit_payment, cancel, restore, delete, set_result,
--      set_result_note (all named testing_private_...), plus
--      testing_move_to_private and testing_private_undo_move
--   6. 1 REPLACED live function: testing_restore_student (0010's body +
--      one check: a registration that was moved to a private testing
--      can't be restored onto the event - new status "moved"). Nothing
--      else that is live changes.
--   Private testings are logged in change_log like all testing data -
--   v0.400's family_history is for Prospects only.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words appear inside rules ("on delete cascade": removing a private
--   testing removes its payments and result), inside functions that run
--   later (Delete permanently; clearing a No show; Undo move) and in
--   "drop ... if exists" lines that make re-running safe. Nothing is
--   removed now. Confirm.
--   (Claude's Supabase connection refuses SQL containing those words, which
--   is why this file is pasted by hand.)
--   Safe to run again: "create table if not exists", "create or replace",
--   triggers and read rules replaced with "drop ... if exists" + create,
--   rights reset with "revoke all" and granted again. A second run changes
--   no row and no fingerprint (tested in PGlite, run.mjs step 15).
--   RE-RUN ORDER: re-running 0005 -> re-run 0010, then 0014, straight
--   after; re-running 0010 -> re-run 0014 straight after (0005 and 0010
--   put back a testing_restore_student that ignores moves).
--   Undo: the down-script is in supabase/SETUP.md section 16e (not here).
--
-- WORDS USED BELOW
--   * "today" = public.testing_today() (school time, America/New_York -
--     0005 section 1e). The private day must be from today up to today +
--     1 year; the time 6:00 AM - 10:00 PM in 5-minute steps.
--   * "net paid" = the sum of a private testing's payments (reversals are
--     negative); "owed" = the private price minus the net paid, never
--     below 0 (contract §1.3).
--   * "has a result" = a results row with result set (Pass, Not passed,
--     No show). Only Pass / Not passed block Change day and Cancel
--     (graded); a No show is cleared by Change day; a note alone never
--     blocks.
--   * "lock", "security definer", search_path = '', "stale": the same
--     meaning as in 0003 and 0005 (read their headers).
--   * statuses: ok, no_access, not_allowed, not_found, stale, invalid,
--     withdrawn, past_day, has_result, graded, cancelled, already_paid,
--     not_open, finished, final_award_not_set, moved.
--   * tkd.action names: private_add, private_update, private_change_day,
--     private_change_paying_by, private_mark_paid, private_undo_payment,
--     private_edit_payment, private_cancel, private_restore,
--     private_delete, private_set_result, private_set_result_note,
--     move_to_private, undo_move_to_private, clear_result.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. Small rule helper (used by a table rule below, so it comes first)
-- ---------------------------------------------------------------------

-- 1a. testing_private_time_is_valid(p_time) - a private testing's start
-- time: 6:00 AM to 10:00 PM (both included), minutes a multiple of 5,
-- seconds 0 (rulebook v0.157, the same list as Add event: 193 choices).
-- NULL -> false. Mirrored by privateRules.privateTimeIsValid.
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
-- 2. public.testing_private - one row per private testing
--   * location_code: the school (never changes).
--   * names: the same rule as registrations (tidied, up to 60 characters).
--   * the COPY of the class and rank taken when it was added (or moved, or
--     its belt corrected): class_id / rank_id point at Classes and ranks
--     (no foreign key: the class may be removed there later - a history
--     pointer), the names, the belt, what they test for (to_kind 'rank'
--     with its name + belt, or 'none' = No new rank) and the private
--     price. A later change in Classes and ranks never changes a booked
--     private testing (rulebook v0.136).
--   * paying_by, stripes_confirmed (always true), private_date / _time.
--   * status 'active' / 'cancelled' (+ when / who; cancelled_by is a login
--     id, never readable by the app).
--   * moved_from_*: set when it was moved from an event registration (the
--     event, the registration, the event's name, the registration's
--     version right after the move); no foreign keys (the event may be
--     removed later). A registration is moved at most once (unique).
--     moved_cleared_no_show = the move removed a testing-day No show, so
--     Undo move is refused. None of these ever change.
--   * version / created / updated: as registrations (section 4a).
-- Holds only a student's name + belt + payment method: no date of birth,
-- contact details, address or medical details.
-- ---------------------------------------------------------------------
create table if not exists public.testing_private (
  id                         uuid        not null default gen_random_uuid(),
  location_code              text        not null,
  first_name                 text        not null,
  last_name                  text        not null,
  class_id                   uuid        null,          -- Classes and ranks class at copy time; no foreign key on purpose
  class_name                 text        not null,
  rank_id                    uuid        null,          -- Classes and ranks rank at copy time; no foreign key on purpose
  rank_name                  text        not null,
  belt_pattern               text        not null,
  belt_color                 text        not null,
  belt_color_2               text        null,
  belt_end_stripes           integer     not null,
  belt_end_stripe_color      text        not null,
  to_kind                    text        not null,      -- 'rank' or 'none' (No new rank)
  to_name                    text        null,
  to_belt_pattern            text        null,
  to_belt_color              text        null,
  to_belt_color_2            text        null,
  to_belt_end_stripes        integer     null,
  to_belt_end_stripe_color   text        null,
  private_cents              integer     not null,
  paying_by                  text        not null,
  stripes_confirmed          boolean     not null,
  private_date               date        not null,
  private_time               time        not null,
  status                     text        not null default 'active',
  cancelled_at               timestamptz null,
  cancelled_by_name          text        null,
  cancelled_by               uuid        null,          -- login id; never readable by the app
  moved_from_event_id        uuid        null,          -- no foreign key on purpose (history pointer)
  moved_from_registration_id uuid        null,          -- no foreign key on purpose (history pointer)
  moved_from_event_name      text        null,
  moved_cleared_no_show      boolean     not null default false,
  moved_registration_version integer     null,
  version                    integer     not null default 1,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid        null,          -- login id; never readable by the app
  updated_by                 uuid        null,          -- login id; never readable by the app
  created_by_name            text        not null,
  updated_by_name            text        not null,

  constraint testing_private_pkey primary key (id),
  constraint testing_private_location_fk
    foreign key (location_code) references public.locations (code),
  constraint testing_private_first_name_check
    check (coalesce(public.testing_name_is_valid(first_name) and first_name = public.testing_normalize_name(first_name), false)),
  constraint testing_private_last_name_check
    check (coalesce(public.testing_name_is_valid(last_name) and last_name = public.testing_normalize_name(last_name), false)),
  constraint testing_private_class_name_check
    check (coalesce(public.testing_name_is_valid(class_name) and class_name = public.testing_normalize_name(class_name), false)),
  constraint testing_private_rank_name_check
    check (coalesce(public.testing_name_is_valid(rank_name) and rank_name = public.testing_normalize_name(rank_name), false)),
  constraint testing_private_belt_check
    check (public.testing_belt_is_valid(belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color)),
  constraint testing_private_to_check
    check (case to_kind
             when 'none' then num_nonnulls(to_name, to_belt_pattern, to_belt_color, to_belt_color_2,
                                           to_belt_end_stripes, to_belt_end_stripe_color) = 0
             when 'rank' then coalesce(public.testing_name_is_valid(to_name)
                                       and to_name = public.testing_normalize_name(to_name)
                                       and public.testing_belt_is_valid(to_belt_pattern, to_belt_color, to_belt_color_2,
                                                                        to_belt_end_stripes, to_belt_end_stripe_color), false)
             else false
           end),
  constraint testing_private_cents_check check (public.testing_cents_is_valid(private_cents)),
  constraint testing_private_paying_by_check check (paying_by in ('cash', 'check', 'card')),
  constraint testing_private_stripes_check check (stripes_confirmed),
  constraint testing_private_time_check check (public.testing_private_time_is_valid(private_time)),
  constraint testing_private_status_check
    check ((status = 'active' and num_nonnulls(cancelled_at, cancelled_by_name, cancelled_by) = 0)
           or (status = 'cancelled' and cancelled_at is not null and cancelled_by_name is not null)),
  -- the move pointers: all set (a moved one) or all empty
  constraint testing_private_moved_check
    check (num_nonnulls(moved_from_event_id, moved_from_registration_id, moved_from_event_name,
                        moved_registration_version) in (0, 4)
           and (moved_registration_version is null or moved_registration_version >= 1)),
  -- "the move cleared a No show" only on a moved one
  constraint testing_private_cleared_check
    check (not moved_cleared_no_show or moved_from_registration_id is not null),
  constraint testing_private_moved_from_key unique (moved_from_registration_id),
  constraint testing_private_version_check check (version >= 1)
);

create index if not exists testing_private_location_day_idx on public.testing_private (location_code, private_date);
create index if not exists testing_private_moved_event_idx  on public.testing_private (moved_from_event_id) where moved_from_event_id is not null;

comment on table public.testing_private is
  'Private testings (Color Belt phase 4): a student, a copy of their class / rank / private price, day and time. Not part of any event. Written only by the testing_private_* functions and testing_move_to_private. created_by / updated_by / cancelled_by are never readable by any client role.';


-- ---------------------------------------------------------------------
-- 3. public.testing_private_payments (append-only) and
--    public.testing_private_results - exactly the shape and rules of
--    0005's testing_payments and 0010's testing_results, for private
--    testings (private_id instead of registration_id)
--   * a payment that came with a move keeps the id of the event payment
--     it came from (moved_from_payment_id; an event payment moves at most
--     once). It can't be undone by staff with the 10-second Undo (admins
--     can), so the mover can't take money off by mistake.
--   * recorded_by / updated_by: login ids, never readable by the app.
-- ---------------------------------------------------------------------
create table if not exists public.testing_private_payments (
  id                    uuid        not null default gen_random_uuid(),
  private_id            uuid        not null,
  kind                  text        not null,
  amount_cents          integer     not null,
  method                text        not null,
  paid_on               date        not null,
  recorded_at           timestamptz not null default now(),
  recorded_by           uuid        null,       -- login id; not readable by the app
  recorded_by_name      text        not null,
  reverses_payment_id   uuid        null,
  moved_from_payment_id uuid        null,       -- the event payment it was moved from; no foreign key on purpose

  constraint testing_private_payments_pkey primary key (id),
  constraint testing_private_payments_private_fk
    foreign key (private_id) references public.testing_private (id) on delete cascade,
  constraint testing_private_payments_reverses_fk
    foreign key (reverses_payment_id) references public.testing_private_payments (id),
  constraint testing_private_payments_reverses_key unique (reverses_payment_id),
  constraint testing_private_payments_moved_from_key unique (moved_from_payment_id),
  constraint testing_private_payments_kind_check
    check ((kind = 'payment' and amount_cents between 1 and 100000 and reverses_payment_id is null)
           or (kind = 'reversal' and amount_cents between -100000 and -1 and reverses_payment_id is not null)),
  constraint testing_private_payments_method_check check (method in ('cash', 'check', 'card')),
  -- only a payment can have come with a move
  constraint testing_private_payments_moved_from_check check (moved_from_payment_id is null or kind = 'payment')
);

create index if not exists testing_private_payments_private_idx on public.testing_private_payments (private_id);

comment on table public.testing_private_payments is
  'Private testing payments, append-only: corrections are reversal rows. Removed only together with their private testing.';

create table if not exists public.testing_private_results (
  private_id      uuid        not null,
  result          text        null,
  note            text        null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid        null,          -- login id; no foreign key on purpose (as 0003)
  updated_by_name text        not null,

  constraint testing_private_results_pkey primary key (private_id),
  constraint testing_private_results_private_fk
    foreign key (private_id) references public.testing_private (id) on delete cascade,
  constraint testing_private_results_result_check
    check (result is null or result in ('pass', 'not_passed', 'no_show')),
  constraint testing_private_results_note_check
    check (note is null or (public.testing_line_is_valid(note, 200) and note = public.testing_normalize_name(note))),
  constraint testing_private_results_not_empty_check
    check (num_nonnulls(result, note) > 0)
);

comment on table public.testing_private_results is
  'Private testing grading: one row per graded private testing (result and/or a one-line note). Written only by testing_private_set_result / _note. updated_by is never readable by any client role.';


-- ---------------------------------------------------------------------
-- 4. Trigger functions (run automatically on every write)
-- ---------------------------------------------------------------------

-- 4a. testing_private_before_write() - BEFORE INSERT OR UPDATE on
-- testing_private (0005 §9c's pattern)
--   insert: version 1, stamps who / when
--   update: id, school, the move pointers and the created stamps never
--           change (error); any other change - or a function writing
--           version + 1 on purpose (Mark paid / Undo payment, so a double
--           click gets "stale") - bumps the version and stamps who / when
-- Not security definer: it only fills in the row being written.
create or replace function public.testing_private_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version         := 1;
    new.created_at      := now();
    new.updated_at      := now();
    new.created_by      := auth.uid();
    new.updated_by      := auth.uid();
    new.created_by_name := public.change_log_actor_name();
    new.updated_by_name := new.created_by_name;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.location_code is distinct from old.location_code
     or new.moved_from_event_id is distinct from old.moved_from_event_id
     or new.moved_from_registration_id is distinct from old.moved_from_registration_id
     or new.moved_from_event_name is distinct from old.moved_from_event_name
     or new.moved_cleared_no_show is distinct from old.moved_cleared_no_show
     or new.moved_registration_version is distinct from old.moved_registration_version
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.created_by_name is distinct from old.created_by_name then
    raise exception using
      errcode    = '23514',
      constraint = 'testing_private_immutable',
      message    = 'this part of a private testing can''t change';
  end if;

  -- "anything except the bookkeeping" changed?
  if (to_jsonb(new) - array['version', 'updated_at', 'updated_by', 'updated_by_name'])
       is distinct from
     (to_jsonb(old) - array['version', 'updated_at', 'updated_by', 'updated_by_name'])
     or new.version is distinct from old.version then
    new.version         := old.version + 1;
    new.updated_at      := now();
    new.updated_by      := auth.uid();
    new.updated_by_name := public.change_log_actor_name();
  else
    new.version         := old.version;
    new.updated_at      := old.updated_at;
    new.updated_by      := old.updated_by;
    new.updated_by_name := old.updated_by_name;
  end if;
  return new;
end;
$$;

revoke execute on function public.testing_private_before_write() from public, anon, authenticated, service_role;

-- 4b. testing_private_results_before_write() - BEFORE INSERT OR UPDATE on
-- testing_private_results: 0010's testing_results_before_write for this
-- table (the private testing of a result can never change; a change to
-- the result or note stamps when + who; an update that changes nothing
-- keeps the old stamps).
create or replace function public.testing_private_results_before_write()
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

  if new.private_id is distinct from old.private_id then
    raise exception using
      errcode    = '23514',
      constraint = 'testing_private_results_immutable',
      message    = 'the private testing of a result can''t change';
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

revoke execute on function public.testing_private_results_before_write() from public, anon, authenticated, service_role;

-- 4c. testing_private_payments_guard() - keeps private payments
-- append-only (0005's testing_payments_guard for this table)
--   BEFORE INSERT: a reversal must undo a real PAYMENT (not a reversal) of
--                  the same private testing, for exactly minus its amount
--   BEFORE UPDATE: always refused
--   BEFORE DELETE: refused, EXCEPT when it is part of removing the whole
--                  private testing ("on delete cascade" runs it from inside
--                  another trigger, so pg_trigger_depth() > 1), or inside
--                  Delete permanently, Undo move or the 0014 down-script
create or replace function public.testing_private_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reversed public.testing_private_payments;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'reversal' then
      select * into v_reversed from public.testing_private_payments p where p.id = new.reverses_payment_id;
      if not found
         or v_reversed.kind <> 'payment'
         or v_reversed.private_id <> new.private_id
         or new.amount_cents <> -v_reversed.amount_cents then
        raise exception using
          errcode    = '23514',
          constraint = 'testing_private_payments_reversal_check',
          message    = 'a reversal must undo one payment of the same private testing, for exactly minus its amount';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE'
     and (pg_trigger_depth() > 1
          or coalesce(current_setting('tkd.action', true), '') in ('private_delete', 'undo_move_to_private', 'undo_0014')) then
    return old;
  end if;

  raise exception 'testing_private_payments is append-only (use a reversal)';
end;
$$;

revoke execute on function public.testing_private_payments_guard() from public, anon, authenticated, service_role;

-- 4d. testing_private_log() - AFTER INSERT OR UPDATE OR DELETE on all
-- three tables: the same history row as 0005's testing_registrations_log
-- (only the keys that changed go into before / after; an update that
-- changed nothing visible writes no row), with
--   * record_id = the row's id (private_id for results, which have no id),
--     so a private testing's history joins straight to its payments and
--     result;
--   * location_code = the school for testing_private rows (null for the
--     other two);
--   * the action from tkd.action (set by the functions; 'manual' for a
--     direct write in the SQL Editor) and the batch from tkd.batch_id.
-- security definer so it can write to change_log, which nobody else can.
create or replace function public.testing_private_log()
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
     coalesce(v_row ->> 'id', v_row ->> 'private_id')::uuid,
     case when tg_table_name = 'testing_private' then v_row ->> 'location_code' end,
     lower(tg_op),
     v_before,
     v_after);
  return null;
end;
$$;

revoke execute on function public.testing_private_log() from public, anon, authenticated, service_role;

-- 4e. Attach the triggers ("drop trigger if exists" + create = replace).
drop trigger if exists testing_private_before_write on public.testing_private;
create trigger testing_private_before_write
  before insert or update on public.testing_private
  for each row execute function public.testing_private_before_write();

drop trigger if exists testing_private_results_before_write on public.testing_private_results;
create trigger testing_private_results_before_write
  before insert or update on public.testing_private_results
  for each row execute function public.testing_private_results_before_write();

drop trigger if exists testing_private_payments_guard on public.testing_private_payments;
create trigger testing_private_payments_guard
  before insert or update or delete on public.testing_private_payments
  for each row execute function public.testing_private_payments_guard();

drop trigger if exists testing_private_log on public.testing_private;
create trigger testing_private_log
  after insert or update or delete on public.testing_private
  for each row execute function public.testing_private_log();

drop trigger if exists testing_private_payments_log on public.testing_private_payments;
create trigger testing_private_payments_log
  after insert or update or delete on public.testing_private_payments
  for each row execute function public.testing_private_log();

drop trigger if exists testing_private_results_log on public.testing_private_results;
create trigger testing_private_results_log
  after insert or update or delete on public.testing_private_results
  for each row execute function public.testing_private_log();

-- No "empty the whole table" shortcut (it would skip the history), as 0003.
drop trigger if exists testing_private_no_truncate on public.testing_private;
create trigger testing_private_no_truncate
  before truncate on public.testing_private
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists testing_private_payments_no_truncate on public.testing_private_payments;
create trigger testing_private_payments_no_truncate
  before truncate on public.testing_private_payments
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists testing_private_results_no_truncate on public.testing_private_results;
create trigger testing_private_results_no_truncate
  before truncate on public.testing_private_results
  for each statement execute function public.testing_refuse_truncate();


-- ---------------------------------------------------------------------
-- 5. The read view: public.testing_private_list
-- One row per private testing with its payment state (like 0005's
-- testing_roster):
--   paid_cents = all its payments added up (reversals are negative)
--   paid       = paid_cents > 0
--   paid_on / paid_method / last_payment_id / last_payment_recorded_at =
--     its latest payment that has NOT been reversed
--   amount_due_cents = what is still owed (contract §1.3), worked out HERE
--     from the same sum - the view never calls testing_private_amount_due
--     (it runs with the caller's rights, and that helper is granted to
--     nobody)
-- Never the login ids. security_invoker = true: the table rules (RLS
-- has_data_access, column rights) still apply - a locked session sees no
-- rows.
-- ---------------------------------------------------------------------
create or replace view public.testing_private_list
with (security_invoker = true)
as
select p.id,
       p.location_code,
       p.first_name,
       p.last_name,
       p.class_id,
       p.class_name,
       p.rank_id,
       p.rank_name,
       p.belt_pattern,
       p.belt_color,
       p.belt_color_2,
       p.belt_end_stripes,
       p.belt_end_stripe_color,
       p.to_kind,
       p.to_name,
       p.to_belt_pattern,
       p.to_belt_color,
       p.to_belt_color_2,
       p.to_belt_end_stripes,
       p.to_belt_end_stripe_color,
       p.private_cents,
       p.paying_by,
       p.stripes_confirmed,
       p.private_date,
       p.private_time,
       p.status,
       p.cancelled_at,
       p.cancelled_by_name,
       p.moved_from_event_id,
       p.moved_from_registration_id,
       p.moved_from_event_name,
       p.moved_cleared_no_show,
       p.moved_registration_version,
       p.version,
       p.created_at,
       p.updated_at,
       p.created_by_name,
       p.updated_by_name,
       coalesce(t.net, 0)     as paid_cents,
       coalesce(t.net, 0) > 0 as paid,
       lp.paid_on,
       lp.method      as paid_method,
       lp.id          as last_payment_id,
       lp.recorded_at as last_payment_recorded_at,
       greatest(p.private_cents - greatest(coalesce(t.net, 0), 0), 0) as amount_due_cents
  from public.testing_private p
  left join lateral (select sum(x.amount_cents)::integer as net
                       from public.testing_private_payments x
                      where x.private_id = p.id) as t on true
  left join lateral (select x.id, x.paid_on, x.method, x.recorded_at
                       from public.testing_private_payments x
                      where x.private_id = p.id
                        and x.kind = 'payment'
                        and not exists (select 1 from public.testing_private_payments y
                                         where y.reverses_payment_id = x.id)
                      order by x.recorded_at desc, x.id desc
                      limit 1) as lp on true;

comment on view public.testing_private_list is
  'Private testing rows + payment state + what is still owed (computed inline). No login ids. Runs with the caller''s rights.';


-- ---------------------------------------------------------------------
-- 6. Security rules: RLS + grants (same two layers as 0005 section 11)
--   * grants: the app may READ every column except the login ids
--     (created_by, updated_by, cancelled_by, recorded_by). No INSERT /
--     UPDATE / DELETE / TRUNCATE for anyone in the app: writes go through
--     the functions in sections 8-9.
--   * RLS: which ROWS - every row, but only while has_data_access() is
--     true (unlocked, still signed in, not PIN-locked, password within 7
--     days). A locked screen sees nothing.
--   * Nothing for anon, service_role (the secret key) or the family
--     form's login testing_registrar.
-- ---------------------------------------------------------------------
alter table public.testing_private          enable row level security;
alter table public.testing_private_payments enable row level security;
alter table public.testing_private_results  enable row level security;

-- Start from zero (also removes column grants, so re-runs stay clean)...
revoke all on table public.testing_private, public.testing_private_payments, public.testing_private_results,
                    public.testing_private_list
  from public, anon, authenticated, service_role;

-- ...then add back exactly what the app reads.
grant select (id, location_code, first_name, last_name, class_id, class_name, rank_id, rank_name,
              belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color,
              to_kind, to_name, to_belt_pattern, to_belt_color, to_belt_color_2, to_belt_end_stripes,
              to_belt_end_stripe_color, private_cents, paying_by, stripes_confirmed, private_date, private_time,
              status, cancelled_at, cancelled_by_name, moved_from_event_id, moved_from_registration_id,
              moved_from_event_name, moved_cleared_no_show, moved_registration_version, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.testing_private to authenticated;            -- NOT created_by, updated_by, cancelled_by
grant select (id, private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name,
              reverses_payment_id, moved_from_payment_id)
  on public.testing_private_payments to authenticated;   -- NOT recorded_by
grant select (private_id, result, note, updated_at, updated_by_name)
  on public.testing_private_results to authenticated;    -- NOT updated_by
grant select on public.testing_private_list to authenticated;

-- Read rules ("(select ...)" = run the check once per query, not per row).
drop policy if exists testing_private_select_with_access on public.testing_private;
create policy testing_private_select_with_access
  on public.testing_private for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists testing_private_payments_select_with_access on public.testing_private_payments;
create policy testing_private_payments_select_with_access
  on public.testing_private_payments for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists testing_private_results_select_with_access on public.testing_private_results;
create policy testing_private_results_select_with_access
  on public.testing_private_results for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 7. Internal helpers used by the functions (nobody can call them)
-- ---------------------------------------------------------------------

-- 7a. testing_private_amount_due(p_private_id) - what Mark paid records
-- NOW (contract §1.3; privateRules.amountDue is the same rule in
-- JavaScript): the private price minus the net paid (never below 0).
-- NULL when the private testing doesn't exist.
create or replace function public.testing_private_amount_due(p_private_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(p.private_cents
                  - greatest(coalesce((select sum(x.amount_cents)::integer
                                         from public.testing_private_payments x
                                        where x.private_id = p.id), 0), 0), 0)
    from public.testing_private p
   where p.id = p_private_id;
$$;

revoke execute on function public.testing_private_amount_due(uuid) from public, anon, authenticated, service_role;

-- 7b. testing_private_lock(p_private_id) - looks up the private testing's
-- school, locks school ("for no key update") -> the private testing ("for
-- update"), and returns the locked row (NULL fields if it is gone).
create or replace function public.testing_private_lock(p_private_id uuid)
returns public.testing_private
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_loc text;
  v_p   public.testing_private;
begin
  select p.location_code into v_loc from public.testing_private p where p.id = p_private_id;
  if not found then
    return null;
  end if;
  perform 1 from public.locations l where l.code = v_loc for no key update;
  select * into v_p from public.testing_private p where p.id = p_private_id for update;
  return v_p;   -- all fields NULL when it vanished meanwhile
end;
$$;

revoke execute on function public.testing_private_lock(uuid) from public, anon, authenticated, service_role;

-- 7c. testing_private_lock_payment(p_payment_id) - finds the payment's
-- private testing, locks school -> private testing -> the payment, and
-- returns the locked payment (NULL fields if it is gone). As 0005's
-- testing_lock_payment.
create or replace function public.testing_private_lock_payment(p_payment_id uuid)
returns public.testing_private_payments
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_private_id uuid;
  v_p          public.testing_private;
  v_pay        public.testing_private_payments;
begin
  select x.private_id into v_private_id from public.testing_private_payments x where x.id = p_payment_id;
  if not found then
    return null;
  end if;
  v_p := public.testing_private_lock(v_private_id);
  if v_p.id is null then
    return null;
  end if;
  select * into v_pay from public.testing_private_payments x where x.id = p_payment_id for update;
  return v_pay;
end;
$$;

revoke execute on function public.testing_private_lock_payment(uuid) from public, anon, authenticated, service_role;

-- 7d. testing_private_rank_copy(p_location_code, p_rank_id) - the copy
-- taken from the LIVE Classes and ranks (the school is already locked):
--   {"status":"ok", class_id, class_name, rank_id, rank_name, belt_pattern,
--    belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color,
--    to_kind, to_name, to_belt_pattern, to_belt_color, to_belt_color_2,
--    to_belt_end_stripes, to_belt_end_stripe_color, private_cents}
-- What they test for: the next rank of the class (by position); for the
-- class's last rank its final award rank; "none" (No new rank) when the
-- final award is None.
--   the rank doesn't exist         -> {"status":"stale"} (the dialog is out of date)
--   a rank of another school       -> {"status":"invalid"}
--   last rank, final award Not set -> {"status":"final_award_not_set","class_name":...}
create or replace function public.testing_private_rank_copy(p_location_code text, p_rank_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_r public.testing_ranks;
  v_c public.testing_classes;
  v_n public.testing_ranks;
  v_to_kind text;
begin
  select * into v_r from public.testing_ranks r where r.id = p_rank_id;
  if not found then
    return jsonb_build_object('status', 'stale');
  end if;
  if v_r.location_code is distinct from p_location_code then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_c from public.testing_classes c where c.id = v_r.class_id;

  -- the next rank of the same class...
  select * into v_n from public.testing_ranks r
   where r.class_id = v_r.class_id and r.position > v_r.position
   order by r.position
   limit 1;
  if found then
    v_to_kind := 'rank';
  elsif v_c.final_award_rank_id is not null then
    -- ...else the class's final award rank...
    select * into v_n from public.testing_ranks r where r.id = v_c.final_award_rank_id;
    v_to_kind := 'rank';
  elsif v_c.final_award_none then
    -- ...else No new rank
    v_to_kind := 'none';
  else
    return jsonb_build_object('status', 'final_award_not_set', 'class_name', v_c.name);
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'class_id', v_c.id, 'class_name', v_c.name,
    'rank_id', v_r.id, 'rank_name', v_r.name,
    'belt_pattern', v_r.belt_pattern, 'belt_color', v_r.belt_color, 'belt_color_2', v_r.belt_color_2,
    'belt_end_stripes', v_r.belt_end_stripes, 'belt_end_stripe_color', v_r.belt_end_stripe_color,
    'to_kind', v_to_kind,
    'to_name', case when v_to_kind = 'rank' then v_n.name end,
    'to_belt_pattern', case when v_to_kind = 'rank' then v_n.belt_pattern end,
    'to_belt_color', case when v_to_kind = 'rank' then v_n.belt_color end,
    'to_belt_color_2', case when v_to_kind = 'rank' then v_n.belt_color_2 end,
    'to_belt_end_stripes', case when v_to_kind = 'rank' then v_n.belt_end_stripes end,
    'to_belt_end_stripe_color', case when v_to_kind = 'rank' then v_n.belt_end_stripe_color end,
    'private_cents', v_r.private_cents);
end;
$$;

revoke execute on function public.testing_private_rank_copy(text, uuid) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 8. The staff functions on the Private testing tab (S = staff and
--    admins; A = admins only). Same pattern as 0005 section 14:
--   * returns {"status": ...}
--   * checks in this order: has_data_access() FIRST (no_access), then the
--     role (A: not_allowed), then the input (invalid), then it locks
--     school -> private testing (testing_private_lock) and looks it up
--     (not_found), then "did the screen see the latest version?" (stale),
--     then a cancelled one refuses (cancelled), then the rules below
--   * tags its writes with tkd.action + ONE tkd.batch_id and clears them
--   * the whole body is inside begin ... exception ... end, with 0005's
--     mapping (unique rule -> stale; foreign key / check / not-null ->
--     invalid; deadlock / serialization / lock not available -> stale)
--   * dates and times in answers are text: "2026-12-01", "16:00"
-- ---------------------------------------------------------------------

-- 8a. testing_private_add(p_location_code, p_first, p_last, p_rank_id,
--       p_stripes, p_paying_by, p_private_date, p_private_time)   S
-- "Add private testing": the class / rank / testing-for / private price
-- are copied from Classes and ranks now (7d). The day from today up to
-- today + 1 year (past_day / invalid), the time 6 AM - 10 PM in 5-minute
-- steps (invalid).
-- Ok: {"status":"ok","id":...,"version":1,"amount_due_cents":n}
create or replace function public.testing_private_add(
  p_location_code text,
  p_first         text,
  p_last          text,
  p_rank_id       uuid,
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
  v_copy       jsonb;
  v_today      date;
  v_id         uuid;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_location_code is null or p_location_code not in ('worcester', 'shrewsbury')
       or not public.testing_name_is_valid(p_first)
       or not public.testing_name_is_valid(p_last)
       or p_rank_id is null
       or p_stripes is not true
       or p_paying_by is null or p_paying_by not in ('cash', 'check', 'card')
       or p_private_date is null or p_private_time is null
       or not public.testing_private_time_is_valid(p_private_time) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- lock the school, so Classes and ranks can't change half-way
    perform 1 from public.locations l where l.code = p_location_code for no key update;
    if not found then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_copy := public.testing_private_rank_copy(p_location_code, p_rank_id);
    if v_copy ->> 'status' <> 'ok' then
      return v_copy;
    end if;

    -- the day rule
    v_today := public.testing_today();
    if p_private_date < v_today then
      return jsonb_build_object('status', 'past_day');
    end if;
    if p_private_date > v_today + interval '1 year' then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'private_add', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_private
      (location_code, first_name, last_name, class_id, class_name, rank_id, rank_name,
       belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color,
       to_kind, to_name, to_belt_pattern, to_belt_color, to_belt_color_2, to_belt_end_stripes,
       to_belt_end_stripe_color, private_cents, paying_by, stripes_confirmed, private_date, private_time)
    values
      (p_location_code, public.testing_normalize_name(p_first), public.testing_normalize_name(p_last),
       (v_copy ->> 'class_id')::uuid, v_copy ->> 'class_name', (v_copy ->> 'rank_id')::uuid, v_copy ->> 'rank_name',
       v_copy ->> 'belt_pattern', v_copy ->> 'belt_color', v_copy ->> 'belt_color_2',
       (v_copy ->> 'belt_end_stripes')::integer, v_copy ->> 'belt_end_stripe_color',
       v_copy ->> 'to_kind', v_copy ->> 'to_name', v_copy ->> 'to_belt_pattern', v_copy ->> 'to_belt_color',
       v_copy ->> 'to_belt_color_2', (v_copy ->> 'to_belt_end_stripes')::integer, v_copy ->> 'to_belt_end_stripe_color',
       (v_copy ->> 'private_cents')::integer, p_paying_by, true, p_private_date, p_private_time)
    returning id into v_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', 1,
                              'amount_due_cents', public.testing_private_amount_due(v_id));
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

revoke execute on function public.testing_private_add(text, text, text, uuid, boolean, text, date, time) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_add(text, text, text, uuid, boolean, text, date, time) to authenticated;

-- 8b. testing_private_update(p_private_id, p_expected_version, p_first,
--       p_last, p_rank_id)   S
-- "Edit details": names and belt. The belt counts as CHANGED only when
-- p_rank_id differs from the stored rank_id - the stored id sent back
-- means "not changed" and is never looked up (that rank may no longer
-- exist in Classes and ranks; the copy stays as it is). A changed belt is
-- copied again from the live Classes and ranks (7d: same school, else
-- invalid; gone -> stale), with its CURRENT private price, so a pricier
-- belt leaves money owed and a cheaper one nothing (no refund). A belt
-- change of a graded private testing (a result or note) removes the
-- result row in the same step (clear_result, same batch); after the
-- private day only an admin may (not_allowed). Nothing changed -> writes
-- nothing.
-- Ok: {"status":"ok","version":n,"amount_due_cents":n,"result_cleared":bool}
create or replace function public.testing_private_update(
  p_private_id       uuid,
  p_expected_version integer,
  p_first            text,
  p_last             text,
  p_rank_id          uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p            public.testing_private;
  v_first        text;
  v_last         text;
  v_copy         jsonb;
  v_rank_changed boolean;
  v_graded       boolean;
  v_version      integer;
  v_constraint   text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    v_first := public.testing_normalize_name(p_first);
    v_last  := public.testing_normalize_name(p_last);
    if p_private_id is null or p_expected_version is null
       or not public.testing_name_is_valid(p_first)
       or not public.testing_name_is_valid(p_last)
       or p_rank_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_p.status = 'cancelled' then
      return jsonb_build_object('status', 'cancelled');
    end if;

    -- a changed belt: copy it from the live Classes and ranks
    v_rank_changed := p_rank_id is distinct from v_p.rank_id;
    if v_rank_changed then
      v_copy := public.testing_private_rank_copy(v_p.location_code, p_rank_id);
      if v_copy ->> 'status' <> 'ok' then
        return v_copy;
      end if;
    end if;

    -- graded (lock the result row)? and the private day over?
    perform 1 from public.testing_private_results x where x.private_id = p_private_id for update;
    v_graded := found;
    if v_rank_changed and v_graded and public.testing_today() > v_p.private_date and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    perform set_config('tkd.action', 'private_update', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if v_rank_changed then
      update public.testing_private p
         set first_name               = v_first,
             last_name                = v_last,
             class_id                 = (v_copy ->> 'class_id')::uuid,
             class_name               = v_copy ->> 'class_name',
             rank_id                  = (v_copy ->> 'rank_id')::uuid,
             rank_name                = v_copy ->> 'rank_name',
             belt_pattern             = v_copy ->> 'belt_pattern',
             belt_color               = v_copy ->> 'belt_color',
             belt_color_2             = v_copy ->> 'belt_color_2',
             belt_end_stripes         = (v_copy ->> 'belt_end_stripes')::integer,
             belt_end_stripe_color    = v_copy ->> 'belt_end_stripe_color',
             to_kind                  = v_copy ->> 'to_kind',
             to_name                  = v_copy ->> 'to_name',
             to_belt_pattern          = v_copy ->> 'to_belt_pattern',
             to_belt_color            = v_copy ->> 'to_belt_color',
             to_belt_color_2          = v_copy ->> 'to_belt_color_2',
             to_belt_end_stripes      = (v_copy ->> 'to_belt_end_stripes')::integer,
             to_belt_end_stripe_color = v_copy ->> 'to_belt_end_stripe_color',
             private_cents            = (v_copy ->> 'private_cents')::integer
       where p.id = p_private_id;
      -- a new belt clears the result (and note), as its own action in the
      -- same batch
      if v_graded then
        perform set_config('tkd.action', 'clear_result', true);
        delete from public.testing_private_results x where x.private_id = p_private_id;
      end if;
    else
      update public.testing_private p
         set first_name = v_first,
             last_name  = v_last
       where p.id = p_private_id
         and (p.first_name is distinct from v_first or p.last_name is distinct from v_last);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select p.version into v_version from public.testing_private p where p.id = p_private_id;
    return jsonb_build_object('status', 'ok', 'version', v_version,
                              'amount_due_cents', public.testing_private_amount_due(p_private_id),
                              'result_cleared', v_rank_changed and v_graded);
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

revoke execute on function public.testing_private_update(uuid, integer, text, text, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_update(uuid, integer, text, text, uuid) to authenticated;

-- 8c. testing_private_change_day(p_private_id, p_expected_version,
--       p_private_date, p_private_time)   S
-- "Change day or time": the day and time rules as Add. Pass / Not passed
-- -> graded. A No show is cleared (the row with its note is removed,
-- clear_result, same batch); a note alone stays. The same day and time as
-- now -> writes nothing and removes nothing.
-- Ok: {"status":"ok","version":n,"private_date":"...","private_time":"HH:MM","result_cleared":bool}
create or replace function public.testing_private_change_day(
  p_private_id       uuid,
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
  v_p          public.testing_private;
  v_res        public.testing_private_results;
  v_today      date;
  v_clear      boolean := false;
  v_n          integer := 0;
  v_now        public.testing_private;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_private_id is null or p_expected_version is null
       or p_private_date is null or p_private_time is null
       or not public.testing_private_time_is_valid(p_private_time) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_p.status = 'cancelled' then
      return jsonb_build_object('status', 'cancelled');
    end if;

    -- the day rule
    v_today := public.testing_today();
    if p_private_date < v_today then
      return jsonb_build_object('status', 'past_day');
    end if;
    if p_private_date > v_today + interval '1 year' then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- lock the result row: Pass / Not passed -> graded; No show -> removed
    select * into v_res from public.testing_private_results x where x.private_id = p_private_id for update;
    if v_res.result in ('pass', 'not_passed') then
      return jsonb_build_object('status', 'graded');
    end if;
    v_clear := v_res.result is not distinct from 'no_show';

    perform set_config('tkd.action', 'private_change_day', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_private p
       set private_date = p_private_date,
           private_time = p_private_time
     where p.id = p_private_id
       and (p.private_date, p.private_time) is distinct from (p_private_date, p_private_time);
    get diagnostics v_n = row_count;

    -- the same day and time: nothing was written, so nothing is removed
    if v_n > 0 and v_clear then
      perform set_config('tkd.action', 'clear_result', true);
      delete from public.testing_private_results x where x.private_id = p_private_id;
    else
      v_clear := false;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select * into v_now from public.testing_private p where p.id = p_private_id;
    return jsonb_build_object('status', 'ok', 'version', v_now.version,
                              'private_date', to_char(v_now.private_date, 'YYYY-MM-DD'),
                              'private_time', to_char(v_now.private_time, 'HH24:MI'),
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

revoke execute on function public.testing_private_change_day(uuid, integer, date, time) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_change_day(uuid, integer, date, time) to authenticated;

-- 8d. testing_private_change_paying_by(p_private_id, p_expected_version,
--       p_paying_by)   S
-- "Change how they'll pay": cash / check / card, while nothing is paid
-- or money is still owed (else already_paid). Earlier payments keep their
-- method. Refused after a Pass / Not passed (graded) - the screen hides it
-- then too (privateMenu, review L5).
-- Ok: {"status":"ok","version":n}
create or replace function public.testing_private_change_paying_by(
  p_private_id       uuid,
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
  v_p          public.testing_private;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_private_id is null or p_expected_version is null
       or p_paying_by is null or p_paying_by not in ('cash', 'check', 'card') then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_p.status = 'cancelled' then
      return jsonb_build_object('status', 'cancelled');
    end if;
    -- a graded private testing (Pass / Not passed) can't change
    if exists (select 1 from public.testing_private_results x
                where x.private_id = p_private_id and x.result in ('pass', 'not_passed')) then
      return jsonb_build_object('status', 'graded');
    end if;
    -- allowed while net <= 0 or something is still owed
    if (select coalesce(sum(x.amount_cents), 0) from public.testing_private_payments x
         where x.private_id = p_private_id) > 0
       and coalesce(public.testing_private_amount_due(p_private_id), 0) = 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    perform set_config('tkd.action', 'private_change_paying_by', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_private p
       set paying_by = p_paying_by
     where p.id = p_private_id
       and p.paying_by is distinct from p_paying_by
    returning p.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_p.version));
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

revoke execute on function public.testing_private_change_paying_by(uuid, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_change_paying_by(uuid, integer, text) to authenticated;

-- 8e. testing_private_mark_paid(p_private_id, p_expected_version)   S
-- "Mark paid": one click records what is OWED (7a) - the full private
-- price when nothing is paid, or just the difference - by the current
-- paying by, dated today. Nothing owed (also a $0 price) -> already_paid
-- and nothing is inserted. The version goes up, so a double click with
-- the old version gets "stale".
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"cash","version":n}
create or replace function public.testing_private_mark_paid(
  p_private_id       uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.testing_private;
  v_amount     integer;
  v_payment_id uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_private_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_p.status = 'cancelled' then
      return jsonb_build_object('status', 'cancelled');
    end if;
    v_amount := public.testing_private_amount_due(p_private_id);
    if coalesce(v_amount, 0) <= 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    perform set_config('tkd.action', 'private_mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (p_private_id, 'payment', v_amount, v_p.paying_by, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_payment_id;

    update public.testing_private p
       set version = p.version + 1
     where p.id = p_private_id
    returning p.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'amount_cents', v_amount,
                              'method', v_p.paying_by, 'version', v_version);
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

revoke execute on function public.testing_private_mark_paid(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_mark_paid(uuid, integer) to authenticated;

-- 8f. testing_private_undo_payment(p_payment_id)   S (own, within 10 s) / A
-- Writes a reversal for a payment (0005's testing_undo_payment rules). Who
-- may: the staff member who recorded it, less than 10 seconds ago - and
-- only a payment recorded HERE, not one that arrived with a move
-- (moved_from_payment_id set); otherwise admins only (not_allowed).
-- Undoing a reversal -> invalid. Already reversed -> stale. Then a
-- cancelled private testing -> cancelled. The reversal is dated today; the
-- version goes up.
-- Ok: {"status":"ok","version":n}
create or replace function public.testing_private_undo_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pay        public.testing_private_payments;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_payment_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_pay := public.testing_private_lock_payment(p_payment_id);
    if v_pay.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if not (v_pay.recorded_by is not distinct from auth.uid()
            and v_pay.recorded_at > now() - interval '10 seconds'
            and v_pay.moved_from_payment_id is null)
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_pay.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.testing_private_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;
    -- a cancelled private testing: no payment changes (after the 0005-style checks, as the data layer)
    if exists (select 1 from public.testing_private p where p.id = v_pay.private_id and p.status = 'cancelled') then
      return jsonb_build_object('status', 'cancelled');
    end if;

    perform set_config('tkd.action', 'private_undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_pay.private_id, 'reversal', -v_pay.amount_cents, v_pay.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_pay.id);

    update public.testing_private p
       set version = p.version + 1
     where p.id = v_pay.private_id
    returning p.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

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

revoke execute on function public.testing_private_undo_payment(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_undo_payment(uuid) to authenticated;

-- 8g. testing_private_edit_payment(p_payment_id, p_method,
--       p_amount_cents, p_paid_on)   A
-- Edit payment = a reversal of the old payment + a new payment with the
-- new method / amount (1 cent to $1,000) / date (not in the future), as
-- 0005's testing_edit_payment. A cancelled private testing -> cancelled.
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}
create or replace function public.testing_private_edit_payment(
  p_payment_id   uuid,
  p_method       text,
  p_amount_cents integer,
  p_paid_on      date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pay        public.testing_private_payments;
  v_new_id     uuid;
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

    if p_payment_id is null
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_amount_cents is null or p_amount_cents not between 1 and 100000
       or p_paid_on is null or p_paid_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_pay := public.testing_private_lock_payment(p_payment_id);
    if v_pay.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_pay.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.testing_private_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;
    -- a cancelled private testing: no payment changes (after the 0005-style checks, as the data layer)
    if exists (select 1 from public.testing_private p where p.id = v_pay.private_id and p.status = 'cancelled') then
      return jsonb_build_object('status', 'cancelled');
    end if;

    perform set_config('tkd.action', 'private_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_pay.private_id, 'reversal', -v_pay.amount_cents, v_pay.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_pay.id);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_pay.private_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_new_id;

    update public.testing_private p
       set version = p.version + 1
     where p.id = v_pay.private_id
    returning p.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_new_id, 'version', v_version);
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

revoke execute on function public.testing_private_edit_payment(uuid, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_edit_payment(uuid, text, integer, date) to authenticated;

-- 8h. testing_private_cancel(p_private_id, p_expected_version)   S
-- "Cancel private testing": it stays listed (under Past, grayed) with its
-- payments (fees aren't refundable). Pass / Not passed -> graded; a No
-- show or a note alone doesn't block. Already cancelled -> cancelled.
-- Ok: {"status":"ok","version":n}
create or replace function public.testing_private_cancel(
  p_private_id       uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.testing_private;
  v_res        public.testing_private_results;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_private_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_p.status = 'cancelled' then
      return jsonb_build_object('status', 'cancelled');
    end if;
    select * into v_res from public.testing_private_results x where x.private_id = p_private_id for update;
    if v_res.result in ('pass', 'not_passed') then
      return jsonb_build_object('status', 'graded');
    end if;

    perform set_config('tkd.action', 'private_cancel', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_private p
       set status            = 'cancelled',
           cancelled_at      = now(),
           cancelled_by_name = public.change_log_actor_name(),
           cancelled_by      = auth.uid()
     where p.id = p_private_id
    returning p.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

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

revoke execute on function public.testing_private_cancel(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_cancel(uuid, integer) to authenticated;

-- 8i. testing_private_restore(p_private_id, p_expected_version)   A
-- Un-cancel: only while its day is still ahead (the day itself counts:
-- private_date >= today, else past_day). An active one -> invalid.
-- Ok: {"status":"ok","version":n}
create or replace function public.testing_private_restore(
  p_private_id       uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.testing_private;
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

    if p_private_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_p.status = 'active' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if v_p.private_date < public.testing_today() then
      return jsonb_build_object('status', 'past_day');
    end if;

    perform set_config('tkd.action', 'private_restore', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_private p
       set status            = 'active',
           cancelled_at      = null,
           cancelled_by_name = null,
           cancelled_by      = null
     where p.id = p_private_id
    returning p.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

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

revoke execute on function public.testing_private_restore(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_restore(uuid, integer) to authenticated;

-- 8j. testing_private_delete(p_private_id, p_expected_version,
--       p_expected_payment_ids)   A
-- Delete permanently: the private testing with ALL its payment rows
-- (payments and reversals) and its result; every removed row is in the
-- history. p_expected_payment_ids = the payment rows the warning named
-- (compared as a set; 0005's delete rule); if they differ now, nothing is
-- removed: stale. Works on active and cancelled ones.
-- Ok: {"status":"ok"}
create or replace function public.testing_private_delete(
  p_private_id           uuid,
  p_expected_version     integer,
  p_expected_payment_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.testing_private;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_private_id is null or p_expected_version is null
       or not public.testing_ids_are_valid(p_expected_payment_ids) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.testing_private_payments x where x.private_id = p_private_id order by x.id for update;

    if v_p.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if array(select x.id from public.testing_private_payments x where x.private_id = p_private_id order by x.id)
       <> array(select y.id from unnest(p_expected_payment_ids) as y(id) order by y.id) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'private_delete', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.testing_private p where p.id = p_private_id;

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

revoke execute on function public.testing_private_delete(uuid, integer, uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_delete(uuid, integer, uuid[]) to authenticated;

-- 8k. testing_private_set_result(p_private_id, p_result)   S
-- 0010's testing_set_result for private testings: p_result 'pass',
-- 'not_passed', 'no_show', or NULL = clear the result; the note is kept.
-- The date rule counts from the PRIVATE DAY: before it nobody
-- (not_open, admins too); on it staff and admins; after it admins only
-- (finished). No version - the last change wins (v0.187). A cancelled one
-- -> cancelled. Saving what is already stored writes nothing.
-- Ok: {"status":"ok","result":...,"note":...,"updated_at":...,"updated_by_name":...}
create or replace function public.testing_private_set_result(
  p_private_id uuid,
  p_result     text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.testing_private;
  v_today      date;
  v_old        public.testing_private_results;
  v_now        public.testing_private_results;
  v_new_result text;
  v_new_note   text;
  v_constraint text;
begin
  begin
    -- 1. access
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    -- 2. input
    if p_private_id is null
       or (p_result is not null and p_result not in ('pass', 'not_passed', 'no_show')) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 3. lock school -> private testing, and look it up
    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 4. a cancelled private testing can't be graded
    if v_p.status = 'cancelled' then
      return jsonb_build_object('status', 'cancelled');
    end if;

    -- 5. the date rule, from the private day
    v_today := public.testing_today();
    if v_today < v_p.private_date then
      return jsonb_build_object('status', 'not_open');      -- before the private day: nobody, admins too
    end if;
    if v_today > v_p.private_date and public.is_admin() is not true then
      return jsonb_build_object('status', 'finished');      -- after it: admins only
    end if;

    -- 6. lock the result row (no row -> every field of v_old is NULL)
    select * into v_old from public.testing_private_results x where x.private_id = p_private_id for update;

    -- 7. write: the wanted pair = (the new result, the current note)
    v_new_result := p_result;
    v_new_note   := v_old.note;
    if v_new_result is not distinct from v_old.result
       and v_new_note is not distinct from v_old.note then
      null;   -- nothing to change (also: clearing when there is no row)
    else
      perform set_config('tkd.action', 'private_set_result', true);
      perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
      if v_new_result is null and v_new_note is null then
        delete from public.testing_private_results x where x.private_id = p_private_id;
      elsif v_old.private_id is not null then
        update public.testing_private_results x
           set result = v_new_result
         where x.private_id = p_private_id;
      else
        -- no "on conflict": the private testing lock already makes writers take turns
        insert into public.testing_private_results (private_id, result, note)
        values (p_private_id, v_new_result, v_new_note);
      end if;
    end if;

    -- 8. clear the tags; answer with what is stored now
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select * into v_now from public.testing_private_results x where x.private_id = p_private_id;
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

revoke execute on function public.testing_private_set_result(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_set_result(uuid, text) to authenticated;

-- 8l. testing_private_set_result_note(p_private_id, p_note)   S
-- 0010's testing_set_result_note for private testings: the note is tidied
-- (runs of spaces, tabs and line breaks become one space, ends trimmed);
-- NULL or nothing left = clear it; then 1 to 200 characters with no
-- invisible characters, else invalid (more than 2000 characters as sent
-- -> invalid straight away). The result is kept. Same date rule and
-- cancelled rule as 8k.
-- Ok: {"status":"ok","result":...,"note":...,"updated_at":...,"updated_by_name":...}
create or replace function public.testing_private_set_result_note(
  p_private_id uuid,
  p_note       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.testing_private;
  v_today      date;
  v_note       text;
  v_old        public.testing_private_results;
  v_now        public.testing_private_results;
  v_new_result text;
  v_new_note   text;
  v_constraint text;
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
    if p_private_id is null
       or (v_note is not null and not public.testing_line_is_valid(v_note, 200)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 3. lock school -> private testing, and look it up
    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 4. a cancelled private testing can't be graded
    if v_p.status = 'cancelled' then
      return jsonb_build_object('status', 'cancelled');
    end if;

    -- 5. the date rule, from the private day
    v_today := public.testing_today();
    if v_today < v_p.private_date then
      return jsonb_build_object('status', 'not_open');      -- before the private day: nobody, admins too
    end if;
    if v_today > v_p.private_date and public.is_admin() is not true then
      return jsonb_build_object('status', 'finished');      -- after it: admins only
    end if;

    -- 6. lock the result row (no row -> every field of v_old is NULL)
    select * into v_old from public.testing_private_results x where x.private_id = p_private_id for update;

    -- 7. write: the wanted pair = (the current result, the new note)
    v_new_result := v_old.result;
    v_new_note   := v_note;
    if v_new_result is not distinct from v_old.result
       and v_new_note is not distinct from v_old.note then
      null;   -- nothing to change (also: clearing when there is no row)
    else
      perform set_config('tkd.action', 'private_set_result_note', true);
      perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
      if v_new_result is null and v_new_note is null then
        delete from public.testing_private_results x where x.private_id = p_private_id;
      elsif v_old.private_id is not null then
        update public.testing_private_results x
           set note = v_new_note
         where x.private_id = p_private_id;
      else
        -- no "on conflict": the private testing lock already makes writers take turns
        insert into public.testing_private_results (private_id, result, note)
        values (p_private_id, v_new_result, v_new_note);
      end if;
    end if;

    -- 8. clear the tags; answer with what is stored now
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select * into v_now from public.testing_private_results x where x.private_id = p_private_id;
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

revoke execute on function public.testing_private_set_result_note(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_set_result_note(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 9. Move to private testing (from an event roster's ⋯) and its Undo
-- ---------------------------------------------------------------------

-- 9a. testing_move_to_private(p_registration_id, p_expected_version,
--       p_private_date, p_private_time)   S (all staff, any time - v0.404)
-- The student leaves the event and becomes a private testing; their money
-- moves with them. One transaction, one batch (contract §2.5.1):
--   refused: withdrawn; a testing-day Pass / Not passed (has_result);
--   a testing-day No show is removed with its note (clear_result); a note
--   alone stays with the event registration.
--   copied from the EVENT copy: class, rank, belt, what they test for;
--   the private price = TODAY's private price of that rank in Classes and
--   ranks (the event copy's private price only if the rank is gone there).
--   the money, append-only, net preserved: for every LIVE event payment
--   (not reversed), oldest first, an event reversal dated on the ORIGINAL
--   day, and a matching private payment (same amount, method and day,
--   moved_from_payment_id = the event payment's id). A transfer, not a
--   refund: a pair that was already reversed stays where it is.
--   the registration becomes withdrawn (as Withdraw does); it is known as
--   "moved" because a private testing points at it.
-- Ok: {"status":"ok","private_id":...,"version":1,"registration_version":n,
--      "amount_due_cents":n,"result_cleared":bool}
create or replace function public.testing_move_to_private(
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
  v_r           public.testing_registrations;
  v_e           public.testing_events;
  v_k           public.testing_event_ranks;
  v_c           public.testing_event_classes;
  v_to          jsonb;
  v_cents       integer;
  v_today       date;
  v_res         public.testing_results;
  v_clear       boolean := false;
  v_pay         record;
  v_moved       uuid[] := '{}';
  v_reg_version integer;
  v_private_id  uuid;
  v_constraint  text;
begin
  begin
    -- 1. access
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    -- 2. input
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
    -- 5. withdrawn (also: already moved)
    if v_r.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    -- 6. the day rule
    v_today := public.testing_today();
    if p_private_date < v_today then
      return jsonb_build_object('status', 'past_day');
    end if;
    if p_private_date > v_today + interval '1 year' then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 7. lock the registration's testing-day result row
    select * into v_res from public.testing_results x where x.registration_id = p_registration_id for update;
    if v_res.result in ('pass', 'not_passed') then
      return jsonb_build_object('status', 'has_result');
    end if;
    v_clear := v_res.result is not distinct from 'no_show';

    -- 8. the copy: from the event copy; the price from today's Classes and ranks
    select * into v_e from public.testing_events e where e.id = v_r.event_id;
    select * into v_k from public.testing_event_ranks k where k.id = v_r.event_rank_id;
    select * into v_c from public.testing_event_classes c where c.id = v_k.event_class_id;
    v_to := public.testing_rank_testing_for(v_r.event_rank_id);
    select r.private_cents into v_cents from public.testing_ranks r where r.id = v_k.rank_id;
    if not found then
      v_cents := v_k.private_cents;   -- the rank is gone from Classes and ranks: the event's copy
    end if;

    -- 9. write, one batch
    perform set_config('tkd.action', 'move_to_private', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- (a) an event reversal for every live event payment, oldest first,
    --     dated on the original day
    for v_pay in select p.id, p.amount_cents, p.method, p.paid_on, p.recorded_at
                   from public.testing_payments p
                  where p.registration_id = p_registration_id
                    and p.kind = 'payment'
                    and not exists (select 1 from public.testing_payments x where x.reverses_payment_id = p.id)
                  order by p.recorded_at, p.id loop
      insert into public.testing_payments
        (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
         reverses_payment_id)
      values
        (p_registration_id, 'reversal', -v_pay.amount_cents, v_pay.method, v_pay.paid_on, now(), auth.uid(),
         public.change_log_actor_name(), v_pay.id);
      v_moved := v_moved || v_pay.id;
    end loop;

    -- (b) the registration leaves the event (as Withdraw does)
    update public.testing_registrations r
       set status            = 'withdrawn',
           withdrawn_reason  = 'withdrawn',
           withdrawn_at      = now(),
           withdrawn_by_name = public.change_log_actor_name(),
           withdrawn_by      = auth.uid(),
           duplicate_state   = 'none',
           duplicate_of      = null
     where r.id = p_registration_id;
    perform public.testing_recheck_pointing_at(p_registration_id);
    select r.version into v_reg_version from public.testing_registrations r where r.id = p_registration_id;

    -- (c) the private testing (version 1)
    insert into public.testing_private
      (location_code, first_name, last_name, class_id, class_name, rank_id, rank_name,
       belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color,
       to_kind, to_name, to_belt_pattern, to_belt_color, to_belt_color_2, to_belt_end_stripes,
       to_belt_end_stripe_color, private_cents, paying_by, stripes_confirmed, private_date, private_time,
       moved_from_event_id, moved_from_registration_id, moved_from_event_name, moved_cleared_no_show,
       moved_registration_version)
    values
      (v_e.location_code, v_r.first_name, v_r.last_name, v_c.class_id, v_c.class_name, v_k.rank_id, v_k.name,
       v_k.belt_pattern, v_k.belt_color, v_k.belt_color_2, v_k.belt_end_stripes, v_k.belt_end_stripe_color,
       case when v_to is null then 'none' else 'rank' end,
       v_to ->> 'name', v_to ->> 'belt_pattern', v_to ->> 'belt_color', v_to ->> 'belt_color_2',
       (v_to ->> 'belt_end_stripes')::integer, v_to ->> 'belt_end_stripe_color',
       v_cents, v_r.paying_by, true, p_private_date, p_private_time,
       v_e.id, v_r.id, v_e.name, v_clear, v_reg_version)
    returning id into v_private_id;

    -- (d) one private payment per moved event payment (same amount, method,
    --     day and recording time - the order of the payments is kept)
    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       moved_from_payment_id)
    select v_private_id, 'payment', p.amount_cents, p.method, p.paid_on,
           p.recorded_at,   -- the ORIGINAL recording time, so "the most recent payment" stays the same one
           auth.uid(), public.change_log_actor_name(), p.id
      from public.testing_payments p
      join unnest(v_moved) with ordinality as m(id, n) on m.id = p.id
     order by m.n;

    -- (e) a testing-day No show is removed (with its note)
    if v_clear then
      perform set_config('tkd.action', 'clear_result', true);
      delete from public.testing_results x where x.registration_id = p_registration_id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    -- 10. answer
    return jsonb_build_object('status', 'ok', 'private_id', v_private_id, 'version', 1,
                              'registration_version', v_reg_version,
                              'amount_due_cents', public.testing_private_amount_due(v_private_id),
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

revoke execute on function public.testing_move_to_private(uuid, integer, date, time) from public, anon, authenticated, service_role;
grant  execute on function public.testing_move_to_private(uuid, integer, date, time) to authenticated;

-- 9b. testing_private_undo_move(p_private_id, p_expected_version)
--       S (only the person who moved it, within 10 seconds)
-- The toast's Undo (contract §2.5.2). Who and when are read from the
-- event registration (withdrawn_by / withdrawn_at):
--   not the mover, or 10 seconds or more ago -> not_allowed (admins too)
--   the move cleared a No show -> not_allowed (it can't come back)
--   anything changed since (the registration isn't withdrawn or was
--   edited, the private testing has a result, a payment recorded here or
--   a reversal) -> stale
--   not moved / the registration is gone -> not_found
-- Then, one batch: the event payments are recorded again (same amount,
-- method and day, with NO "recorded by" login, so the live 10-second
-- own-Undo can never reverse them), the registration is active again with
-- its duplicate check re-run (as testing_restore_student), and the private
-- testing is removed (with its payments).
-- Ok: {"status":"ok","registration_id":...,"registration_version":n}
create or replace function public.testing_private_undo_move(
  p_private_id       uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reg_id     uuid;
  v_r          public.testing_registrations;
  v_p          public.testing_private;
  v_of         uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_private_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- lock school -> event -> the registration -> the private testing
    select p.moved_from_registration_id into v_reg_id from public.testing_private p where p.id = p_private_id;
    if v_reg_id is null then
      return jsonb_build_object('status', 'not_found');   -- missing, or not moved
    end if;
    v_r := public.testing_lock_registration(v_reg_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');   -- the registration (or its event) is gone
    end if;
    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_p.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    -- only the mover, within 10 seconds (admins too)
    if v_r.withdrawn_by is distinct from auth.uid()
       or coalesce(v_r.withdrawn_at <= now() - interval '10 seconds', true) then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    -- a cleared No show can't come back
    if v_p.moved_cleared_no_show then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    -- anything changed since the move?
    if v_r.status <> 'withdrawn'
       or v_r.version <> v_p.moved_registration_version
       or exists (select 1 from public.testing_private_results x where x.private_id = p_private_id)
       or exists (select 1 from public.testing_private_payments x
                   where x.private_id = p_private_id
                     and (x.moved_from_payment_id is null or x.kind <> 'payment')) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'undo_move_to_private', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- the event payments again (no "recorded by" login; the original
    -- day and recording time)
    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    select v_r.id, 'payment', x.amount_cents, x.method, x.paid_on,
           x.recorded_at,   -- the original recording time again (the order is kept)
           null, public.change_log_actor_name()
      from public.testing_private_payments x
     where x.private_id = p_private_id
     order by x.recorded_at, x.id;

    -- the registration back to active, with testing_restore_student's
    -- three duplicate re-check lines
    update public.testing_registrations r
       set status            = 'active',
           withdrawn_reason  = null,
           withdrawn_at      = null,
           withdrawn_by_name = null,
           withdrawn_by      = null
     where r.id = v_r.id;
    perform public.testing_recheck_duplicate(v_r.id);
    select r.duplicate_of into v_of from public.testing_registrations r where r.id = v_r.id;
    if v_of is not null then
      perform public.testing_recheck_duplicate(v_of);
    end if;
    perform public.testing_recheck_pointing_at(v_r.id);

    -- the private testing goes (its payments with it)
    delete from public.testing_private p where p.id = p_private_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select r.version into v_version from public.testing_registrations r where r.id = v_r.id;
    return jsonb_build_object('status', 'ok', 'registration_id', v_r.id, 'registration_version', v_version);
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

revoke execute on function public.testing_private_undo_move(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_undo_move(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 10. The ONE replaced live function: 0010's testing_restore_student
--     copied exactly, plus only the lines marked "-- 0014:". Same
--     arguments; its revoke / grant lines repeated unchanged.
--     REMEMBER: re-running 0005 or 0010 puts the old version back (header).
-- ---------------------------------------------------------------------

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
-- 0014 (private testing): a registration that was MOVED to a private
-- testing can't be restored onto the event - {"status":"moved"} for
-- everyone, staff and admins (the student would be in both places).
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
    if exists (select 1 from public.testing_private p where p.moved_from_registration_id = p_registration_id) then   -- 0014: moved to a private testing
      return jsonb_build_object('status', 'moved');                                                                 -- 0014
    end if;                                                                                                         -- 0014
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


commit;
