-- =====================================================================
-- 0031_class_ages.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A database migration for the New students part of the dashboard
--   (Schedule 0007, Forms 0009, Prospects 0012, all live; rulebook
--   v0.619 and v0.620). It runs AFTER 0007, 0009 and 0012 - it stops
--   with a clear message if one is missing. No later migration replaced
--   any function this file touches (checked 2026-10-28: 0015, 0019 and
--   later only CALL them).
--
-- WHY IT EXISTS
--   Part 1 (v0.619): the booking forms' "Pick a class time" list shows
--   each class's age range, e.g. "Thu, Oct 29 - 6:00 pm - White - Ages
--   7-12 - 10 spots left". DISPLAY ONLY: a form never hides or blocks a
--   class because of a child's age. Admins set a class's ages in the
--   Schedule's time slot dialog, under the class's Color, per school, the
--   same way as the color. Two whole numbers, From and To (0-99, From not
--   above To); To may be empty ("Ages 7+"); both empty = no ages shown.
--   Part 2 (v0.620): classes TAUGHT TOGETHER (one Schedule time slot
--   with several classes) show as ONE line when a form offers 2 or more
--   of them - "White + Little Tiger - Ages 3-12 - 10 spots left" - with
--   ONE spot number of its own, set in the form's booking settings.
--
-- WHAT IT ADDS
--   1. public.schedule_class_ages - one row per class that HAS an age
--      range (no row = none). Built exactly like 0007's
--      schedule_class_colors: its own id (change_log needs one), the
--      class + its school (deleting the class in Testing removes its
--      ages row too, "on delete cascade", logged like any other change),
--      version + who/when, history (change_log), no truncate, read-only
--      for unlocked staff (has_data_access()), no direct writes.
--   2. schedule_set_class_ages(class, from, to) - the ONLY way to write
--      (admins only; both empty = remove the row).
--   3. public.form_booking_group_limits - a combined time's own spot
--      number on one form (section 8), built exactly like 0009's
--      form_booking_limits; written only by forms_set_booking.
--   4. Two internal helpers nobody may call directly (section 7):
--      forms_group_class_ids_ok (the table's check) and
--      forms_booking_lock_class (which row a booking locks).
--
-- WHAT IT CHANGES (each changed line is marked "0031")
--   5. schedule_before_write() (0007's bookkeeping trigger) - one line:
--      an ages row's class can never change, like a color row's. Every
--      other line is 0007's, word for word.
--   6. forms_times (0009's internal list of a form's times) is DROPPED
--      and made again (section 9): it groups classes taught together and
--      returns three more columns (class_ids, age_from, age_to).
--   7. forms_set_booking (0009) gains a 5th argument, p_groups (default
--      none). Its 4-argument version is DROPPED and the new one made, with
--      the same rights (section 10). Calls without p_groups still work.
--   8. forms_duplicate (0009) copies the group rows too (section 11).
--   9. forms_submit_core (0009) and prospects_book_time (0012) lock the
--      row forms_booking_lock_class names (section 12).
--  10. The class times families and staff see gain three keys per time:
--      "class_ids" (the classes of the time: one, or a group's) and
--      "age_from" / "age_to" (whole numbers, or null when there are no
--      ages; age_to null with age_from set = "7+"). Replaced, word for
--      word except that, from 0009:
--        forms_open_times    (builder preview and "Fill in", staff)
--        forms_public_get    (the public page and the kiosk)
--        forms_public_submit (the fresh times sent back on "time_taken")
--      and from 0012:
--        prospects_open_times (Prospects -> "Book a free class", staff)
--   Every replaced function keeps its owner, "security definer" (or
--   invoker), search_path = '' and rights (re-stated below). Nothing new
--   is granted to anon, and forms_registrar keeps exactly its three
--   public functions (they run as their owner, so it needs no right on
--   the new tables).
--
-- HOW TO RUN IT
--   After 0007, 0009 and 0012. Supabase dashboard -> SQL Editor -> New query ->
--   paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept. Supabase will
--   warn about destructive operations: two "drop function" lines are
--   real on the first run - the OLD forms_times and the OLD 4-argument
--   forms_set_booking, each made again right after it in the same
--   transaction. The other "drop ... if exists" lines only make
--   re-running safe, and the removals inside the functions run only
--   later (an admin clearing a class's ages or saving booking settings;
--   a family sending a form). No data is removed. Confirm.
--   Safe to run again (tested: the second run changes no fingerprint).
--   NEVER re-run 0009 after this file without running 0031 right after
--   it: 0009 can't replace the new forms_times (different columns) and
--   would add a second forms_set_booking.
--   Undo: SETUP.md, "Migration 0031", 0031e - paste
--   supabase/manual/0031u_undo_class_ages.sql.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0007 (Schedule), 0009 (Forms) and 0012
--    (Prospects). Stops
--    - and changes nothing - if one is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.schedule_class_colors') is null
     or to_regprocedure('public.schedule_before_write()') is null then
    raise exception '0031 needs migration 0007 (Schedule) first.';
  end if;
  if to_regprocedure('public.forms_open_times(uuid, date, date)') is null
     or to_regprocedure('public.forms_public_get(text)') is null
     or to_regprocedure('public.forms_public_submit(text, text, uuid, integer, jsonb, jsonb, jsonb, text, text)') is null
     or to_regprocedure('public.forms_times(uuid, date, date)') is null
     or to_regprocedure('public.forms_duplicate(uuid)') is null
     or to_regprocedure('public.forms_spot_limit(uuid, text, uuid, date, time)') is null
     or to_regprocedure('public.forms_submit_core(uuid, uuid, integer, jsonb, jsonb, jsonb, text, text, text)') is null
     -- the 4-argument forms_set_booking (0009), or the 5-argument one when 0031 runs again
     or (to_regprocedure('public.forms_set_booking(uuid, integer, jsonb, jsonb)') is null
         and to_regprocedure('public.forms_set_booking(uuid, integer, jsonb, jsonb, jsonb)') is null) then
    raise exception '0031 needs migration 0009 (Forms) first.';
  end if;
  if to_regprocedure('public.prospects_open_times(uuid, date, date)') is null
     or to_regprocedure('public.prospects_book_time(uuid, integer, uuid, uuid, date, time)') is null
     or to_regprocedure('public.prospects_lock_slot(text, uuid, date, time)') is null then
    raise exception '0031 needs migration 0012 (Prospects) first.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. public.schedule_class_ages
-- A class's age range on the booking forms. A class without a row shows
-- no ages. Has its own id because change_log_write (0003) needs an "id"
-- column. The class and its school together point at testing_classes,
-- so a row can only ever belong to the class's own school.
-- ---------------------------------------------------------------------
create table if not exists public.schedule_class_ages (
  id              uuid        not null default gen_random_uuid(),
  class_id        uuid        not null,
  location_code   text        not null,
  age_from        smallint    not null,
  age_to          smallint    null,       -- empty = "and up" ("Ages 7+")
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint schedule_class_ages_pkey primary key (id),
  constraint schedule_class_ages_class_key unique (class_id),
  constraint schedule_class_ages_class_fk
    foreign key (class_id, location_code)
    references public.testing_classes (id, location_code) on delete cascade,
  constraint schedule_class_ages_from_check check (age_from between 0 and 99),
  constraint schedule_class_ages_to_check check (age_to is null or age_to between age_from and 99),
  constraint schedule_class_ages_version_check check (version >= 1)
);

comment on table public.schedule_class_ages is
  'Each class''s age range on the booking forms (display only, rulebook v0.619). No row = no ages. Written only through schedule_set_class_ages.';


-- ---------------------------------------------------------------------
-- 3. schedule_before_write() - 0007's bookkeeping trigger, now also on
-- schedule_class_ages. ONE line differs from 0007 (marked "0031"): an
-- ages row's class_id can never change, like a color row's.
-- ---------------------------------------------------------------------
-- 6a. schedule_before_write() - BEFORE INSERT OR UPDATE on all four
-- tables. Same bookkeeping as 0003's triggers:
--   insert: version 1; created/updated stamps = now + who
--   update: id, location_code (and a slot's version_id, a color's
--           class_id) can never change; created_* are kept; any real
--           content change bumps version and sets updated_* = now + who;
--           no change keeps everything as it was.
-- "Content" = every column except the bookkeeping ones, compared as JSON.
create or replace function public.schedule_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_bookkeeping constant text[] := array['version', 'created_at', 'updated_at', 'created_by',
                                         'updated_by', 'created_by_name', 'updated_by_name'];
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

  if (to_jsonb(new) ->> 'id') is distinct from (to_jsonb(old) ->> 'id')
     or (to_jsonb(new) ->> 'location_code') is distinct from (to_jsonb(old) ->> 'location_code')
     or (tg_table_name = 'schedule_slots'
         and (to_jsonb(new) ->> 'version_id') is distinct from (to_jsonb(old) ->> 'version_id'))
     or (tg_table_name in ('schedule_class_colors', 'schedule_class_ages')   -- 0031: an ages row's class too
         and (to_jsonb(new) ->> 'class_id') is distinct from (to_jsonb(old) ->> 'class_id'))
     or (tg_table_name = 'schedule_slot_classes'
         and ((to_jsonb(new) ->> 'slot_id') is distinct from (to_jsonb(old) ->> 'slot_id')
              or (to_jsonb(new) ->> 'class_id') is distinct from (to_jsonb(old) ->> 'class_id'))) then
    raise exception using
      errcode    = '23514',
      constraint = tg_table_name || '_immutable',
      message    = tg_table_name || ': id, school and parent can''t change';
  end if;

  new.created_at      := old.created_at;
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;

  if (to_jsonb(new) - v_bookkeeping) is distinct from (to_jsonb(old) - v_bookkeeping) then
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

revoke execute on function public.schedule_before_write() from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 4. Triggers on schedule_class_ages (the same three as a color row):
-- bookkeeping, history (0003's change_log_write), no truncate.
-- ---------------------------------------------------------------------
drop trigger if exists schedule_class_ages_before_write on public.schedule_class_ages;
create trigger schedule_class_ages_before_write
  before insert or update on public.schedule_class_ages
  for each row execute function public.schedule_before_write();

drop trigger if exists schedule_class_ages_log on public.schedule_class_ages;
create trigger schedule_class_ages_log
  after insert or update or delete on public.schedule_class_ages
  for each row execute function public.change_log_write();

drop trigger if exists schedule_class_ages_no_truncate on public.schedule_class_ages;
create trigger schedule_class_ages_no_truncate
  before truncate on public.schedule_class_ages
  for each statement execute function public.schedule_refuse_truncate();


-- ---------------------------------------------------------------------
-- 5. Security rules: RLS + grants (the same two layers as 0007 section 7)
-- Read: the listed columns, every row, only while has_data_access().
-- Write: nobody directly - only schedule_set_class_ages (section 6).
-- anon and service_role get nothing.
-- ---------------------------------------------------------------------
alter table public.schedule_class_ages enable row level security;

revoke all on table public.schedule_class_ages from public, anon, authenticated, service_role;

grant select (id, class_id, location_code, age_from, age_to, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.schedule_class_ages to authenticated;
-- created_by / updated_by (login ids) are NOT granted.

drop policy if exists schedule_class_ages_select_with_access on public.schedule_class_ages;
create policy schedule_class_ages_select_with_access
  on public.schedule_class_ages for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 6. schedule_set_class_ages(p_class_id, p_age_from, p_age_to)
-- Sets a class's age range (adds the row the first time). Admins only,
-- like the class color (0007's schedule_set_class_color, whose shape this
-- copies). The same values again write nothing. Both empty (null) =
-- remove the row (nothing to do when there is none).
--   invalid   no class; To without From; From outside 0-99; To outside
--             From-99
--   not_found the class doesn't exist (or was just deleted)
-- Ok: {"status":"ok","class_id":...,"age_from":n|null,"age_to":n|null,
--      "version":n|null}   (version null = the class has no ages now)
-- ---------------------------------------------------------------------
create or replace function public.schedule_set_class_ages(
  p_class_id uuid,
  p_age_from integer,
  p_age_to   integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc     text;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_class_id is null
       or (p_age_from is null and p_age_to is not null)
       or (p_age_from is not null and p_age_from not between 0 and 99)
       or (p_age_to is not null and p_age_to not between p_age_from and 99) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select c.location_code into v_loc from public.testing_classes c where c.id = p_class_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    perform 1 from public.testing_classes c where c.id = p_class_id for key share;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform set_config('tkd.action', 'schedule_set_class_ages', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_age_from is null then
      -- both empty: the class has no ages any more
      delete from public.schedule_class_ages k where k.class_id = p_class_id;
    else
      insert into public.schedule_class_ages (class_id, location_code, age_from, age_to)
      values (p_class_id, v_loc, p_age_from, p_age_to)
      on conflict (class_id) do update
        set age_from = excluded.age_from,
            age_to   = excluded.age_to
        where (public.schedule_class_ages.age_from, public.schedule_class_ages.age_to)
              is distinct from (excluded.age_from, excluded.age_to);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select k.version into v_version from public.schedule_class_ages k where k.class_id = p_class_id;

    return jsonb_build_object('status', 'ok', 'class_id', p_class_id, 'age_from', p_age_from, 'age_to', p_age_to,
                              'version', v_version);
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

revoke execute on function public.schedule_set_class_ages(uuid, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.schedule_set_class_ages(uuid, integer, integer) to authenticated;


-- =====================================================================
-- PART 2 (rulebook v0.620): classes TAUGHT TOGETHER show as ONE time
-- ---------------------------------------------------------------------
-- A Schedule time slot can hold several classes (0007, v0.237: "taught
-- together"). When a form offers 2 or more of the classes of one slot,
-- that slot is ONE bookable time on the form, e.g. "White + Little
-- Tiger", with ONE spot number of its own:
--   * its spots: this form's group row (section 8, set in the form's
--     booking settings) for that weekday + start + set of classes; with
--     no row, the LARGEST default_limit of the group's classes on this
--     form. 0 = this form doesn't offer the combined time. NOT shared
--     with other forms' limits (single classes still share theirs, 0009's
--     forms_spot_limit).
--   * booked = every booked class_bookings row at that school, date and
--     start for ANY of the group's classes, from any form.
--   * its booking window (days ahead, hours ahead): the offer of its
--     FIRST class (the slot's own class order) - "the representative".
--   * it is booked with the representative's class_id; the booking's
--     class_name is the joined name ("White + Little Tiger"). A member
--     class's own single time no longer exists on that form, so booking
--     it is "time_taken".
--   * its ages: the youngest From and the oldest To of its classes (To
--     empty when one of them has an age range without a To).
-- A form that offers only ONE class of the slot shows that class as
-- before (0009's rules, unchanged).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 7. Two small internal helpers (security invoker, nobody may call them
-- directly: only the functions below use them)
-- ---------------------------------------------------------------------

-- 7a. forms_group_class_ids_ok(ids) - true when a list of class ids is a
-- valid group key: one-dimensional, 2 to 10 ids, none empty, no repeats,
-- and SORTED (smallest first). Sorted, so "White + Little Tiger" and
-- "Little Tiger + White" are the same group row. The table's check
-- (section 8) uses it - a check can't run a query itself, a function can.
create or replace function public.forms_group_class_ids_ok(p_ids uuid[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_ids is not null
     and array_ndims(p_ids) = 1
     and cardinality(p_ids) between 2 and 10
     and array_position(p_ids, null) is null
     and p_ids = (select array_agg(distinct x order by x) from unnest(p_ids) as x);
$$;

revoke execute on function public.forms_group_class_ids_ok(uuid[]) from public, anon, authenticated, service_role;

-- 7b. forms_booking_lock_class(school, class, date, start) - WHICH class
-- time row (0009's class_booking_slots) a booking locks, so two bookings
-- for the last spot take turns. Before 0031 each class locked its own
-- row. Now a group's spots are counted over several classes, so every
-- booking of a class that runs in a time slot locks the row of the
-- slot's FIRST class (the slot's own order): a grouped time on one form
-- and a single class of the same slot on another form wait for each
-- other too. For a slot with one class (most of them) that is the class
-- itself - exactly as before. A class not running then: its own row.
create or replace function public.forms_booking_lock_class(p_location text, p_class uuid, p_date date, p_start time)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select s.class_ids[1]
                     from public.forms_slots_on(p_location, p_date) s
                    where s.starts_at = p_start and p_class = any (s.class_ids)
                    order by s.class_ids[1]::text
                    limit 1), p_class);
$$;

revoke execute on function public.forms_booking_lock_class(text, uuid, date, time) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 8. public.form_booking_group_limits - a combined time's own spot number
-- on ONE form. Built exactly like 0009's form_booking_limits (one time of
-- one class with its own limit): the form + its school (deleting the form
-- removes its rows, "on delete cascade", logged), version + who/when,
-- history (change_log), no truncate, read-only for unlocked staff, no
-- direct writes - only forms_set_booking (section 10) writes it.
--   class_ids   the classes taught together, 2-10, SORTED (7a). Each
--               must be a class of the form's school offered by the form
--               (checked by forms_set_booking: a foreign key can't point
--               from a list).
--   weekday     1 = Monday ... 7 = Sunday;  starts_at  the slot's start
--   spot_limit  0-20; 0 = don't offer this combined time on this form
-- ---------------------------------------------------------------------
create table if not exists public.form_booking_group_limits (
  id              uuid        not null default gen_random_uuid(),
  form_id         uuid        not null,
  location_code   text        not null,
  class_ids       uuid[]      not null,
  weekday         smallint    not null,
  starts_at       time        not null,
  spot_limit      smallint    not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint form_booking_group_limits_pkey primary key (id),
  constraint form_booking_group_limits_form_fk foreign key (form_id, location_code) references public.forms (id, location_code) on delete cascade,
  constraint form_booking_group_limits_key unique (form_id, weekday, starts_at, class_ids),
  constraint form_booking_group_limits_classes_check check (public.forms_group_class_ids_ok(class_ids)),
  constraint form_booking_group_limits_weekday_check check (weekday between 1 and 7),
  constraint form_booking_group_limits_limit_check check (spot_limit between 0 and 20),
  constraint form_booking_group_limits_version_check check (version >= 1)
);

comment on table public.form_booking_group_limits is
  'A combined time (classes taught together in one Schedule slot) on one form, with its own spot number (rulebook v0.620). Written only through forms_set_booking.';

-- The same three triggers 0009 puts on form_booking_limits: bookkeeping
-- (0009's forms_before_write: id, school and form can never change),
-- history (0003's change_log_write), no truncate.
drop trigger if exists form_booking_group_limits_before_write on public.form_booking_group_limits;
create trigger form_booking_group_limits_before_write
  before insert or update on public.form_booking_group_limits
  for each row execute function public.forms_before_write();

drop trigger if exists form_booking_group_limits_no_truncate on public.form_booking_group_limits;
create trigger form_booking_group_limits_no_truncate
  before truncate on public.form_booking_group_limits
  for each statement execute function public.forms_refuse_truncate();

drop trigger if exists form_booking_group_limits_log on public.form_booking_group_limits;
create trigger form_booking_group_limits_log
  after insert or update or delete on public.form_booking_group_limits
  for each row execute function public.change_log_write();

-- Security rules (0009 section 4's two layers): read the listed columns,
-- every row, only while has_data_access(); write: nobody directly.
-- anon, service_role and forms_registrar get nothing.
alter table public.form_booking_group_limits enable row level security;

revoke all on table public.form_booking_group_limits from public, anon, authenticated, service_role;

grant select (id, form_id, location_code, class_ids, weekday, starts_at, spot_limit, version)
  on public.form_booking_group_limits to authenticated;

drop policy if exists form_booking_group_limits_select_with_access on public.form_booking_group_limits;
create policy form_booking_group_limits_select_with_access
  on public.form_booking_group_limits for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 9. forms_times(form, from, to) - 0009's internal list of a form's
-- class times (section 5d), REBUILT for groups and ages. Its answer gains
-- three columns, so it is dropped and made again (Postgres can't change
-- a function's columns in place). Nothing depends on it in the catalog:
-- the functions that read it look it up when they run.
--   class_ids  the classes of this time: [the class] for a single class,
--              all of the group's classes (slot order) for a group
--   age_from / age_to   the ages to show (null = none)
-- Everything else is 0009's: the schedule in effect and closures
-- (forms_slots_on), the booking window, not sooner than min_hours_ahead,
-- spots left > 0, Massachusetts dates and times, the same order (date,
-- start, class name). Single classes keep 0009's shared limit
-- (forms_spot_limit).
-- ---------------------------------------------------------------------
drop function if exists public.forms_times(uuid, date, date);
create function public.forms_times(p_form_id uuid, p_from date, p_to date)
returns table (class_id uuid, class_name text, on_date date, starts_at time, ends_at time, spots_left integer,
               class_ids uuid[], age_from integer, age_to integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with f as (
    select fo.id, fo.location_code from public.forms fo where fo.id = p_form_id
  ), o as (
    -- the classes this form offers
    select bo.class_id, bo.default_limit, bo.days_ahead, bo.min_hours_ahead, c.name as class_name
      from public.form_booking_offers bo
      join public.testing_classes c on c.id = bo.class_id
     where bo.form_id = p_form_id
  ), d as (
    -- every day any offered class could show (each time is checked
    -- against its own class's window in "t")
    select gs::date as on_date
      from generate_series(greatest(p_from, public.schedule_today()),
                           least(p_to, public.schedule_today() + (select max(o.days_ahead) from o) - 1), interval '1 day') as gs
     where exists (select 1 from o)
  ), s as (
    -- each running time slot of each day, with the offered classes in it
    -- (in the slot's own order)
    select d.on_date, sl.starts_at, sl.ends_at,
           array(select u.cid from unnest(sl.class_ids) with ordinality as u(cid, n)
                  where u.cid in (select o.class_id from o)
                  order by u.n) as ids
      from d, f, public.forms_slots_on(f.location_code, d.on_date) sl
  ), t as (
    -- one time per slot that has offered classes: a single class, or a
    -- group; its window is its first class's offer
    select s.ids[1] as class_id, s.ids, s.on_date, s.starts_at, s.ends_at, o.min_hours_ahead
      from s
      join o on o.class_id = s.ids[1]
     where cardinality(s.ids) >= 1
       and s.on_date <= public.schedule_today() + o.days_ahead - 1
  ), c as (
    select t.*,
           case when cardinality(t.ids) = 1
                then public.forms_spot_limit(p_form_id, (select location_code from f), t.class_id, t.on_date, t.starts_at)
                -- a group: this form's group row, else the largest default
                else coalesce((select g.spot_limit::integer from public.form_booking_group_limits g
                                where g.form_id = p_form_id
                                  and g.weekday = extract(isodow from t.on_date)::smallint
                                  and g.starts_at = t.starts_at
                                  and g.class_ids = (select array_agg(x order by x) from unnest(t.ids) as x)),
                              (select max(o.default_limit)::integer from o where o.class_id = any (t.ids)))
           end as lim,
           (select count(*) from public.class_bookings b
             where b.location_code = (select location_code from f) and b.class_id = any (t.ids)
               and b.on_date = t.on_date and b.starts_at = t.starts_at and b.status = 'booked')::integer as used,
           (select string_agg(o.class_name, ' + ' order by u.n)
              from unnest(t.ids) with ordinality as u(cid, n)
              join o on o.class_id = u.cid) as class_name
      from t
     where ((t.on_date + t.starts_at) at time zone 'America/New_York')
           >= clock_timestamp() + make_interval(hours => t.min_hours_ahead)
  )
  select c.class_id, c.class_name, c.on_date, c.starts_at, c.ends_at, (c.lim - c.used)::integer, c.ids,
         (select min(ca.age_from)::integer from public.schedule_class_ages ca where ca.class_id = any (c.ids)),
         (select case when bool_or(ca.age_to is null) then null else max(ca.age_to)::integer end
            from public.schedule_class_ages ca where ca.class_id = any (c.ids))
    from c
   where c.lim is not null and c.lim - c.used > 0
   order by c.on_date, c.starts_at, c.class_name;
$$;

revoke execute on function public.forms_times(uuid, date, date) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 10. forms_set_booking(form, expected version, offers, limits, groups) -
-- 0009's section 7g with ONE new argument, p_groups (default: none):
--   groups: [{ "class_ids": [2-10 offered classes], "weekday" 1-7,
--              "starts_at" "HH:MM", "spot_limit" 0-20 }]   (0-100)
-- It replaces the form's group rows exactly the way p_limits replaces
-- its limit rows. 'invalid' for a bad item: not an object, unknown keys,
-- fewer than 2 or more than 10 classes, a class twice, a class the form
-- doesn't offer (so never another school's class), a bad weekday / time
-- / limit, or the same group + weekday + start twice. The class list is
-- stored sorted. A call WITHOUT p_groups (the app before 0031) removes
-- the form's group rows, like an empty p_limits removes its limits.
-- Because the arguments change, 0009's 4-argument version is dropped and
-- this one made; same owner, security definer, search_path = '' and
-- rights (authenticated only). Lines new in 0031 are marked "0031".
-- ---------------------------------------------------------------------
drop function if exists public.forms_set_booking(uuid, integer, jsonb, jsonb);
create or replace function public.forms_set_booking(p_form_id uuid, p_expected_version integer, p_offers jsonb, p_limits jsonb,
                                                    p_groups jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f record;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_form_id is null or p_expected_version is null
       or p_offers is null or jsonb_typeof(p_offers) <> 'array' or jsonb_array_length(p_offers) > 30
       or p_limits is null or jsonb_typeof(p_limits) <> 'array' or jsonb_array_length(p_limits) > 200
       or exists (select 1 from jsonb_array_elements(p_offers) o
                   where jsonb_typeof(o) <> 'object'
                      or exists (select 1 from jsonb_object_keys(o) k where k not in ('class_id', 'default_limit', 'days_ahead', 'min_hours_ahead'))
                      or coalesce(o ->> 'class_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      or coalesce(o ->> 'default_limit', '') !~ '^\d{1,2}$' or (o ->> 'default_limit')::integer not between 1 and 20
                      or coalesce(o ->> 'days_ahead', '') !~ '^\d{1,2}$' or (o ->> 'days_ahead')::integer not between 1 and 60
                      or coalesce(o ->> 'min_hours_ahead', '') !~ '^\d{1,2}$' or (o ->> 'min_hours_ahead')::integer not between 0 and 72)
       or (select count(distinct o ->> 'class_id') from jsonb_array_elements(p_offers) o) <> jsonb_array_length(p_offers)
       or exists (select 1 from jsonb_array_elements(p_limits) l
                   where jsonb_typeof(l) <> 'object'
                      or exists (select 1 from jsonb_object_keys(l) k where k not in ('class_id', 'weekday', 'starts_at', 'spot_limit'))
                      or not exists (select 1 from jsonb_array_elements(p_offers) o where o ->> 'class_id' = l ->> 'class_id')
                      or coalesce(l ->> 'weekday', '') !~ '^[1-7]$'
                      or coalesce(l ->> 'starts_at', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
                      or coalesce(l ->> 'spot_limit', '') !~ '^\d{1,2}$' or (l ->> 'spot_limit')::integer not between 0 and 20)
       or (select count(distinct (l ->> 'class_id') || (l ->> 'weekday') || (l ->> 'starts_at')) from jsonb_array_elements(p_limits) l)
          <> jsonb_array_length(p_limits) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- 0031: the groups, checked the same way (each step guarded with
    -- "case", so a wrong type answers 'invalid' instead of an error)
    if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) > 100
       or exists (select 1 from jsonb_array_elements(p_groups) g
                   where case
                           when jsonb_typeof(g) <> 'object' then true
                           when exists (select 1 from jsonb_object_keys(g) k where k not in ('class_ids', 'weekday', 'starts_at', 'spot_limit')) then true
                           when jsonb_typeof(g -> 'class_ids') is distinct from 'array' then true
                           when jsonb_array_length(g -> 'class_ids') not between 2 and 10 then true
                           when exists (select 1 from jsonb_array_elements(g -> 'class_ids') c
                                         where jsonb_typeof(c) <> 'string'
                                            or (c #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                            or not exists (select 1 from jsonb_array_elements(p_offers) o where o ->> 'class_id' = c #>> '{}')) then true
                           when (select count(distinct c #>> '{}') from jsonb_array_elements(g -> 'class_ids') c)
                                <> jsonb_array_length(g -> 'class_ids') then true
                           when coalesce(g ->> 'weekday', '') !~ '^[1-7]$' then true
                           when coalesce(g ->> 'starts_at', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then true
                           when coalesce(g ->> 'spot_limit', '') !~ '^\d{1,2}$' then true
                           else (g ->> 'spot_limit')::integer not between 0 and 20
                         end) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- 0031: the same group (in any order) + weekday + start only once
    if (select count(distinct (select string_agg(x::text, ',' order by x)
                                 from (select (c #>> '{}')::uuid as x from jsonb_array_elements(g -> 'class_ids') c) as y)
                              || '|' || (g ->> 'weekday') || '|' || (g ->> 'starts_at'))
          from jsonb_array_elements(p_groups) g) <> jsonb_array_length(p_groups) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select f.* into v_f from public.forms f where f.id = p_form_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    perform 1 from public.locations l where l.code = v_f.location_code for no key update;
    select f.* into v_f from public.forms f where f.id = p_form_id for update;
    if v_f.version <> p_expected_version then return jsonb_build_object('status', 'stale'); end if;
    if exists (select 1 from jsonb_array_elements(p_offers) o
                where not exists (select 1 from public.testing_classes c
                                   where c.id = (o ->> 'class_id')::uuid and c.location_code = v_f.location_code)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- 0031: every class of a group is a class of the form's school (they
    -- are offered, so this already holds - checked again on purpose)
    if exists (select 1 from jsonb_array_elements(p_groups) g, jsonb_array_elements(g -> 'class_ids') c
                where not exists (select 1 from public.testing_classes tc
                                   where tc.id = (c #>> '{}')::uuid and tc.location_code = v_f.location_code)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    perform set_config('tkd.action', 'forms_set_booking', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    delete from public.form_booking_group_limits g where g.form_id = p_form_id;   -- 0031
    delete from public.form_booking_limits l where l.form_id = p_form_id;
    delete from public.form_booking_offers o where o.form_id = p_form_id;
    insert into public.form_booking_offers (form_id, location_code, class_id, default_limit, days_ahead, min_hours_ahead)
    select p_form_id, v_f.location_code, (o ->> 'class_id')::uuid, (o ->> 'default_limit')::smallint,
           (o ->> 'days_ahead')::smallint, (o ->> 'min_hours_ahead')::smallint
      from jsonb_array_elements(p_offers) o;
    insert into public.form_booking_limits (form_id, location_code, class_id, weekday, starts_at, spot_limit)
    select p_form_id, v_f.location_code, (l ->> 'class_id')::uuid, (l ->> 'weekday')::smallint,
           (l ->> 'starts_at')::time, (l ->> 'spot_limit')::smallint
      from jsonb_array_elements(p_limits) l;
    -- 0031: the group rows, each class list sorted
    insert into public.form_booking_group_limits (form_id, location_code, class_ids, weekday, starts_at, spot_limit)
    select p_form_id, v_f.location_code,
           array(select (c #>> '{}')::uuid from jsonb_array_elements(g -> 'class_ids') c order by 1),
           (g ->> 'weekday')::smallint, (g ->> 'starts_at')::time, (g ->> 'spot_limit')::smallint
      from jsonb_array_elements(p_groups) g;
    -- 0031: the groups count as booking settings too (no groups = 0009's key)
    update public.forms f set booking_key = md5(p_offers::text || '|' || p_limits::text
                                                || case when jsonb_array_length(p_groups) = 0 then '' else '|' || p_groups::text end)
     where f.id = p_form_id
    returning f.version into v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_form_id, 'version', v_version);
  exception
    when unique_violation then return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.forms_set_booking(uuid, integer, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.forms_set_booking(uuid, integer, jsonb, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 11. forms_duplicate(form) - 0009's section 7e, word for word except
-- the lines marked "0031": the copy gets the form's group rows too.
-- (forms_delete needs no change: the group rows go with the form, "on
-- delete cascade", each one logged.)
-- ---------------------------------------------------------------------
-- 7e. forms_duplicate(form) - a Draft copy with "Copy of" and a free slug,
-- including its booking settings. No sign-ups are copied.
create or replace function public.forms_duplicate(p_form_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f record;
  v_id uuid;
  v_version integer;
  v_slug text;
  v_i integer := 1;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_form_id is null then return jsonb_build_object('status', 'invalid'); end if;
    select f.* into v_f from public.forms f where f.id = p_form_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    perform 1 from public.locations l where l.code = v_f.location_code for no key update;
    loop
      v_slug := left(v_f.slug, 33) || '-copy' || case when v_i = 1 then '' else v_i::text end;
      exit when not exists (select 1 from public.forms f where f.slug = v_slug);
      v_i := v_i + 1;
      if v_i > 50 then return jsonb_build_object('status', 'duplicate_slug'); end if;
    end loop;
    perform set_config('tkd.action', 'forms_duplicate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.forms (location_code, name, slug, kind, draft, settings, booking_key)
    values (v_f.location_code, public.testing_normalize_name(left('Copy of ' || v_f.name, 80)), v_slug, v_f.kind, v_f.draft, v_f.settings, v_f.booking_key)
    returning id, version into v_id, v_version;
    insert into public.form_booking_offers (form_id, location_code, class_id, default_limit, days_ahead, min_hours_ahead)
    select v_id, o.location_code, o.class_id, o.default_limit, o.days_ahead, o.min_hours_ahead
      from public.form_booking_offers o where o.form_id = p_form_id;
    insert into public.form_booking_limits (form_id, location_code, class_id, weekday, starts_at, spot_limit)
    select v_id, l.location_code, l.class_id, l.weekday, l.starts_at, l.spot_limit
      from public.form_booking_limits l where l.form_id = p_form_id;
    -- 0031: the combined times' own spot numbers
    insert into public.form_booking_group_limits (form_id, location_code, class_ids, weekday, starts_at, spot_limit)
    select v_id, g.location_code, g.class_ids, g.weekday, g.starts_at, g.spot_limit
      from public.form_booking_group_limits g where g.form_id = p_form_id;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version, 'slug', v_slug);
  exception
    when unique_violation then return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.forms_duplicate(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.forms_duplicate(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 12. Booking a grouped time
-- forms_submit_core (0009 section 6b: the public page, the kiosk and
-- staff "Fill in") and prospects_book_time (0012 section 8b) already look
-- the time up in forms_times by class_id + start, so a grouped time is
-- booked with its representative class_id, saved with the joined name,
-- counted over the whole group - and a member class's own single time
-- isn't there any more ("time_taken"). The ONE change in each (marked
-- "0031"): the row each booking locks is forms_booking_lock_class's
-- (7b), and the locks are taken in that row's order (no deadlock).
-- ---------------------------------------------------------------------

-- 6b. forms_submit_core(...) - saves one sign-up (shared by the public
-- page, the kiosk and staff "Fill in"). The caller has checked who is
-- asking. Order: form (locked) -> published version -> answers ->
-- bookings (each class time locked in a fixed order and re-counted) ->
-- save. A time no longer open raises TKD01 'time_taken', which undoes
-- everything; the caller answers {"status":"time_taken"}.
-- p_bookings: [{ "child": 0.., "class_id", "date": "YYYY-MM-DD", "starts_at": "HH:MM" }]
create or replace function public.forms_submit_core(
  p_form_id           uuid,
  p_submission_key    uuid,
  p_published_version integer,
  p_answers           jsonb,
  p_children          jsonb,
  p_bookings          jsonb,
  p_signature         text,
  p_source            text,
  p_entered_by        text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_form    record;
  v_id      uuid;
  v_b       record;
  v_slot    uuid;
  v_time    record;
  v_has_booking boolean;
begin
  select f.* into v_form from public.forms f where f.id = p_form_id for key share;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_form.status <> 'live' or v_form.published is null then
    return jsonb_build_object('status', case when v_form.status = 'closed' then 'closed' else 'not_found' end);
  end if;

  -- a key already used by ANOTHER form is refused (review L1)
  if exists (select 1 from public.form_submissions s where s.submission_key = p_submission_key and s.form_id <> p_form_id) then
    return jsonb_build_object('status', 'invalid');
  end if;
  -- sent twice (same key): the same answer as the first time (review L2)
  select s.id into v_id from public.form_submissions s where s.form_id = p_form_id and s.submission_key = p_submission_key;
  if found then
    return public.forms_submission_answer(v_id, true);
  end if;

  if p_published_version is distinct from v_form.published_version then
    return jsonb_build_object('status', 'form_changed', 'published_version', v_form.published_version);
  end if;
  if public.forms_check_answers(v_form.published, p_answers, p_children, p_signature) <> 'ok' then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- bookings: an array, at most one per child, only if the form has a booking field
  v_has_booking := exists (select 1 from jsonb_array_elements(v_form.published) e
                            where e ->> 'type' = 'booking'
                              and (e -> 'show_if' is null or jsonb_typeof(e -> 'show_if') = 'null'
                                   or (p_answers -> (e -> 'show_if' ->> 'field')) = (e -> 'show_if' -> 'value')));
  if p_bookings is null or jsonb_typeof(p_bookings) <> 'array'
     or jsonb_array_length(p_bookings) > jsonb_array_length(p_children)
     or (jsonb_array_length(p_bookings) > 0 and not v_has_booking) then
    return jsonb_build_object('status', 'invalid');
  end if;
  if exists (select 1 from jsonb_array_elements(p_bookings) b
              where jsonb_typeof(b) <> 'object'
                 or exists (select 1 from jsonb_object_keys(b) k where k not in ('child', 'class_id', 'date', 'starts_at'))
                 or coalesce(b ->> 'child', '') !~ '^[0-5]$'
                 or (b ->> 'child')::integer >= jsonb_array_length(p_children)
                 or coalesce(b ->> 'class_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 or not public.forms_date_ok(b ->> 'date')
                 or coalesce(b ->> 'starts_at', '') !~ '^([01]\d|2[0-3]):[0-5]\d$')
     or (select count(distinct b ->> 'child') from jsonb_array_elements(p_bookings) b) <> jsonb_array_length(p_bookings) then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
  begin
  insert into public.form_submissions
    (form_id, location_code, published_version, fields, answers, parent_name, parent_phone, parent_email,
     children, signature, signed_at, entered_by, source, submission_key)
  values
    (v_form.id, v_form.location_code, v_form.published_version, v_form.published, p_answers,
     public.testing_normalize_name(p_answers ->> 'parent_name'), btrim(p_answers ->> 'parent_phone'), btrim(p_answers ->> 'parent_email'),
     (select jsonb_agg(jsonb_build_object('first_name', public.testing_normalize_name(c ->> 'first_name'), 'age', (c ->> 'age')::integer)
                       order by ord)
        from jsonb_array_elements(p_children) with ordinality as t(c, ord)),
     p_signature, case when p_signature is null then null else now() end, p_entered_by, p_source, p_submission_key)
  returning id into v_id;
  exception when unique_violation then
    -- the same Send arrived twice at the same moment: the first one wins
    select s.id into v_id from public.form_submissions s where s.form_id = p_form_id and s.submission_key = p_submission_key;
    if found then
      return public.forms_submission_answer(v_id, true);
    end if;
    raise;
  end;

  -- each booking: lock its class time (fixed order: no deadlock), re-count, book
  -- 0031: the row locked is forms_booking_lock_class's (the slot's first
  -- class), and the order is that row's
  for v_b in
    select y.* from (
      select x.*, public.forms_booking_lock_class(v_form.location_code, x.class_id, x.on_date, x.starts_at) as lock_class
        from (select (b ->> 'child')::smallint as child, (b ->> 'class_id')::uuid as class_id,
                     (b ->> 'date')::date as on_date, (b ->> 'starts_at')::time as starts_at
                from jsonb_array_elements(p_bookings) b) as x) as y
     order by y.lock_class::text, y.on_date, y.starts_at, y.class_id::text
  loop
    insert into public.class_booking_slots (location_code, class_id, on_date, starts_at)
    values (v_form.location_code, v_b.lock_class, v_b.on_date, v_b.starts_at)
    on conflict (location_code, class_id, on_date, starts_at) do nothing;
    select s.id into v_slot from public.class_booking_slots s
     where s.location_code = v_form.location_code and s.class_id = v_b.lock_class
       and s.on_date = v_b.on_date and s.starts_at = v_b.starts_at
       for update;
    select t.* into v_time from public.forms_times(v_form.id, v_b.on_date, v_b.on_date) t
     where t.class_id = v_b.class_id and t.starts_at = v_b.starts_at;
    if not found then
      raise exception using errcode = 'TKD01', message = 'time_taken';
    end if;
    insert into public.class_bookings
      (submission_id, form_id, location_code, class_id, class_name, on_date, starts_at, ends_at, child_index)
    values (v_id, v_form.id, v_form.location_code, v_b.class_id, v_time.class_name, v_b.on_date, v_b.starts_at, v_time.ends_at, v_b.child);
  end loop;

  return public.forms_submission_answer(v_id, false);
end;
$$;

revoke execute on function public.forms_submit_core(uuid, uuid, integer, jsonb, jsonb, jsonb, text, text, text) from public, anon, authenticated, service_role;

-- From 0012 (section 8b), word for word except the lines marked "0031".
-- 0012 grants it in a loop (its section 11); the same rights are re-stated
-- here: authenticated only.
-- 8b. prospects_book_time(prospect, version, form, class, date, start) -
-- book (or change to) a time. The old and the new class time are locked
-- in a fixed order and the spot is re-counted. A checked-in child can't
-- be moved.
create or replace function public.prospects_book_time(p_prospect_id uuid, p_expected_version integer, p_form_id uuid,
                                                      p_class_id uuid, p_date date, p_starts_at time)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_old record;
  v_t record;
  v_check text;
  v_version integer;
  v_had boolean;
  v_lock_new uuid;   -- 0031: the lock row's class of the new time
  v_lock_old uuid;   -- 0031: ... and of the old one
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_prospect_id is null or p_expected_version is null or p_form_id is null or p_class_id is null
       or p_date is null or p_starts_at is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_check := public.prospects_lock(p_prospect_id, p_expected_version);
    if v_check <> 'ok' then return jsonb_build_object('status', v_check); end if;
    select p.* into v_p from public.prospects p where p.id = p_prospect_id;
    if v_p.checked_in_at is not null then return jsonb_build_object('status', 'not_allowed'); end if;
    if not exists (select 1 from public.forms f where f.id = p_form_id and f.location_code = v_p.location_code and f.status = 'live'
                      and exists (select 1 from jsonb_array_elements(f.published) e where e ->> 'type' = 'booking')) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select b.* into v_old from public.class_bookings b
     where b.submission_id = v_p.submission_id and b.child_index = v_p.child_index for update;
    v_had := found and v_old.status = 'booked';
    -- lock the old and the new class time, in a fixed order
    -- 0031: each time's lock row is forms_booking_lock_class's
    v_lock_new := public.forms_booking_lock_class(v_p.location_code, p_class_id, p_date, p_starts_at);
    if v_had and v_old.class_id is not null then
      v_lock_old := public.forms_booking_lock_class(v_p.location_code, v_old.class_id, v_old.on_date, v_old.starts_at);
    end if;
    if v_had and v_old.class_id is not null
       and (v_lock_old::text, v_old.on_date, v_old.starts_at) < (v_lock_new::text, p_date, p_starts_at) then
      perform public.prospects_lock_slot(v_p.location_code, v_lock_old, v_old.on_date, v_old.starts_at);
      perform public.prospects_lock_slot(v_p.location_code, v_lock_new, p_date, p_starts_at);
    elsif v_had and v_old.class_id is not null then
      perform public.prospects_lock_slot(v_p.location_code, v_lock_new, p_date, p_starts_at);
      perform public.prospects_lock_slot(v_p.location_code, v_lock_old, v_old.on_date, v_old.starts_at);
    else
      perform public.prospects_lock_slot(v_p.location_code, v_lock_new, p_date, p_starts_at);
    end if;
    perform set_config('tkd.action', 'prospects_book_time', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    if v_old.id is not null then
      delete from public.class_bookings b where b.id = v_old.id;   -- its spot is free again before re-counting
    end if;
    select t.* into v_t from public.forms_times(p_form_id, p_date, p_date) t
     where t.class_id = p_class_id and t.starts_at = p_starts_at;
    if not found then
      raise exception using errcode = 'TKD01', message = 'time_taken';
    end if;
    insert into public.class_bookings (submission_id, form_id, location_code, class_id, class_name, on_date, starts_at, ends_at, child_index)
    values (v_p.submission_id, p_form_id, v_p.location_code, p_class_id, v_t.class_name, p_date, p_starts_at, v_t.ends_at, v_p.child_index);
    -- a staff-chosen status other than New / Booked stays; the trigger moved New -> Booked
    perform public.prospects_log(p_prospect_id, v_p.location_code, case when v_had then 'changed_time' else 'booked' end,
                                 jsonb_build_object('class_name', v_t.class_name, 'date', p_date, 'starts_at', to_char(p_starts_at, 'HH24:MI'),
                                                    'from', case when v_had then jsonb_build_object('class_name', v_old.class_name, 'date', v_old.on_date,
                                                                                                      'starts_at', to_char(v_old.starts_at, 'HH24:MI')) end));
    update public.prospects p set last_activity_at = now() where p.id = p_prospect_id returning p.version into v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_prospect_id, 'version', v_version);
  exception
    when sqlstate 'TKD01' then return jsonb_build_object('status', 'time_taken');
    when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.prospects_book_time(uuid, integer, uuid, uuid, date, time) from public, anon, authenticated, service_role;
grant  execute on function public.prospects_book_time(uuid, integer, uuid, uuid, date, time) to authenticated;


-- ---------------------------------------------------------------------
-- 13. The class times carry the classes and the ages (from 0009 / 0012,
-- word for word except the lines marked "0031"). Each time gets
-- "class_ids" (one class, or a group's classes in slot order),
-- "age_from" and "age_to" - all three straight from forms_times
-- (section 9), whose order (date, start, class name) is kept.
-- ---------------------------------------------------------------------

-- 7i. forms_open_times(form, from, to) - the times families would see now
-- (builder preview and "Fill in"). Staff and admins.
-- Ok: {"status":"ok","times":[{class_id,class_name,date,starts_at,ends_at,spots_left,
--      class_ids,age_from,age_to}]}   (class_ids, age_from, age_to: 0031)
create or replace function public.forms_open_times(p_form_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_form_id is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not exists (select 1 from public.forms f where f.id = p_form_id) then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'ok', 'times', coalesce((
    select jsonb_agg(jsonb_build_object('class_id', t.class_id, 'class_name', t.class_name, 'date', t.on_date,
                                        'starts_at', to_char(t.starts_at, 'HH24:MI'), 'ends_at', to_char(t.ends_at, 'HH24:MI'),
                                        'spots_left', t.spots_left,
                                        -- 0031: the classes of this time (one, or a group) and its ages (display only; null = none set)
                                        'class_ids', to_jsonb(t.class_ids), 'age_from', t.age_from,
                                        'age_to', t.age_to))
      from public.forms_times(p_form_id, p_from, p_to) t), '[]'::jsonb));
end;
$$;

revoke execute on function public.forms_open_times(uuid, date, date) from public, anon, authenticated, service_role;
grant  execute on function public.forms_open_times(uuid, date, date) to authenticated;

-- 9a. forms_public_get(slug) - what the public page needs, a FIXED short
-- list (review Low 13): the published fields + version, the school's name
-- (and phone, when Settings -> Schools has one), the thank-you text and
-- Add-to-calendar switch, and the open times with spots left. Never the
-- school's alert email or anything staff-only.
create or replace function public.forms_public_get(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_f record;
  v_school jsonb;
begin
  if p_slug is null or not public.forms_slug_ok(p_slug) then return jsonb_build_object('status', 'not_found'); end if;
  select f.* into v_f from public.forms f where f.slug = p_slug;
  if not found or v_f.status = 'draft' or v_f.published is null then return jsonb_build_object('status', 'not_found'); end if;
  select to_jsonb(l) into v_school from public.locations l where l.code = v_f.location_code;
  if v_f.status = 'closed' then
    return jsonb_build_object('status', 'closed', 'school_name', v_school ->> 'name', 'school_phone', v_school ->> 'phone');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'form_name', v_f.name,
    'fields', v_f.published,
    'published_version', v_f.published_version,
    'school_name', v_school ->> 'name',
    'school_phone', v_school ->> 'phone',
    'thank_you', v_f.settings ->> 'thank_you',
    'add_to_calendar', (v_f.settings -> 'add_to_calendar'),
    'times', coalesce((
      select jsonb_agg(jsonb_build_object('class_id', t.class_id, 'class_name', t.class_name, 'date', t.on_date,
                                          'starts_at', to_char(t.starts_at, 'HH24:MI'), 'ends_at', to_char(t.ends_at, 'HH24:MI'),
                                          'spots_left', t.spots_left,
                                          -- 0031: the classes of this time (one, or a group) and its ages (display only; null = none set)
                                          'class_ids', to_jsonb(t.class_ids), 'age_from', t.age_from,
                                          'age_to', t.age_to))
        from public.forms_times(v_f.id, public.schedule_today(), public.schedule_today() + 60) t), '[]'::jsonb));
end;
$$;

revoke execute on function public.forms_public_get(text) from public, anon, authenticated, service_role;
grant  execute on function public.forms_public_get(text) to forms_registrar;

-- 9b. forms_public_submit(slug, client_key, submission_key,
--      published_version, answers, children, bookings, signature, kiosk_token)
--   * forgets any login token the caller might have set (a public sign-up
--     can never look like a staff member's), clears attempts older than 2
--     days
--   * rate limit: 20 sends per hour per client key; 120 with a valid kiosk
--     token for this form; more than 300 per hour for one form is only
--     logged (a flood)
--   * runs forms_submit_core (source 'kiosk' with a valid token, else
--     'public'); a table rule that still says no undoes it -> invalid
--   * THEN writes this call's attempt row - outside the part that can be
--     undone, so every call counts
-- Ok: {"status":"ok","id","bookings":[...]}
create or replace function public.forms_public_submit(
  p_slug              text,
  p_client_key        text,
  p_submission_key    uuid,
  p_published_version integer,
  p_answers           jsonb,
  p_children          jsonb,
  p_bookings          jsonb,
  p_signature         text,
  p_kiosk_token       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_form_id uuid;
  v_kiosk   boolean := false;
  v_limit   integer;
  v_n       integer;
  v_result  jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.forms_public_attempts a where a.at < now() - interval '2 days';

  if p_client_key is null or char_length(p_client_key) not between 1 and 200 or p_submission_key is null
     or p_slug is null or not public.forms_slug_ok(p_slug) then
    v_result := jsonb_build_object('status', 'invalid');
  else
    select f.id into v_form_id from public.forms f where f.slug = p_slug;
    -- one client key at a time, so the count below can't be overtaken (review L5)
    perform pg_advisory_xact_lock(hashtext('forms_public:' || p_client_key));
    if p_kiosk_token is not null and char_length(p_kiosk_token) <> 64 then
      v_result := jsonb_build_object('status', 'invalid');
    elsif p_kiosk_token is not null and v_form_id is not null then
      v_kiosk := exists (select 1 from public.form_kiosk_tokens t
                          where t.form_id = v_form_id and t.expires_at > now()
                            and t.token_hash = encode(extensions.digest(p_kiosk_token, 'sha256'), 'hex'));
      if not v_kiosk then
        v_result := jsonb_build_object('status', 'invalid');   -- a wrong or old kiosk token
      end if;
    end if;
    if v_result is null then
      select count(*) into v_n from public.forms_public_attempts a
       where a.client_key = p_client_key and a.at > now() - interval '1 hour';
      v_limit := case when v_kiosk then 120 else 20 end;
      if v_n >= v_limit then
        v_result := jsonb_build_object('status', 'rate_limited');
      end if;
    end if;
    if v_result is null and v_form_id is not null then
      select count(*) into v_n from public.forms_public_attempts a
       where a.form_id = v_form_id and a.at > now() - interval '1 hour';
      if v_n >= 300 then
        raise log 'forms_public_submit: form % had % sends in the last hour', v_form_id, v_n;
      end if;
    end if;
    if v_result is null and v_form_id is null then
      v_result := jsonb_build_object('status', 'not_found');
    end if;
    if v_result is null then
      begin
        perform set_config('tkd.actor_label', case when v_kiosk then 'Kiosk' else 'Family form' end, true);
        perform set_config('tkd.action', 'forms_public_submit', true);
        v_result := public.forms_submit_core(v_form_id, p_submission_key, p_published_version, p_answers, p_children,
                                             p_bookings, p_signature, case when v_kiosk then 'kiosk' else 'public' end, null);
      exception
        when sqlstate 'TKD01' then v_result := jsonb_build_object('status', 'time_taken');
        when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then v_result := jsonb_build_object('status', 'invalid');
        when deadlock_detected or serialization_failure or lock_not_available then v_result := jsonb_build_object('status', 'invalid');
      end;
      perform set_config('tkd.actor_label', '', true);
      perform set_config('tkd.action', '', true);
      perform set_config('tkd.batch_id', '', true);
    end if;
  end if;

  insert into public.forms_public_attempts (client_key, form_id, kiosk, outcome)
  values (coalesce(left(p_client_key, 200), ''), v_form_id, v_kiosk, coalesce(v_result ->> 'status', 'invalid'));

  perform public.forms_purge_old_signatures();

  if v_result ->> 'status' = 'time_taken' and v_form_id is not null then
    v_result := v_result || jsonb_build_object('times', coalesce((
      select jsonb_agg(jsonb_build_object('class_id', t.class_id, 'class_name', t.class_name, 'date', t.on_date,
                                          'starts_at', to_char(t.starts_at, 'HH24:MI'), 'ends_at', to_char(t.ends_at, 'HH24:MI'),
                                          'spots_left', t.spots_left,
                                          -- 0031: the classes of this time (one, or a group) and its ages (display only; null = none set)
                                          'class_ids', to_jsonb(t.class_ids), 'age_from', t.age_from,
                                          'age_to', t.age_to))
        from public.forms_times(v_form_id, public.schedule_today(), public.schedule_today() + 60) t), '[]'::jsonb));
  end if;
  return v_result;
end;
$$;

revoke execute on function public.forms_public_submit(text, text, uuid, integer, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.forms_public_submit(text, text, uuid, integer, jsonb, jsonb, jsonb, text, text) to forms_registrar;


-- From 0012 (section 8a), word for word except the lines marked "0031".
-- 0012 grants it in a loop (its section 11); the same rights are re-stated
-- here: authenticated only.
-- 8a. prospects_open_times(prospect, from, to) - the times this child can
-- be booked into: one row per class time, with the form whose limit
-- applies (the one with the most spots left) and spots left.
create or replace function public.prospects_open_times(p_prospect_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_loc text;
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_prospect_id is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select p.location_code into v_loc from public.prospects p where p.id = p_prospect_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'ok', 'times', coalesce((
    select jsonb_agg(jsonb_build_object('form_id', t.form_id, 'class_id', t.class_id, 'class_name', t.class_name, 'date', t.on_date,
                                        'starts_at', to_char(t.starts_at, 'HH24:MI'), 'ends_at', to_char(t.ends_at, 'HH24:MI'),
                                        'spots_left', t.spots_left,
                                        -- 0031: the classes of this time (one, or a group) and its ages (display only; null = none set)
                                        'class_ids', to_jsonb(t.class_ids), 'age_from', t.age_from,
                                        'age_to', t.age_to)
                                        order by t.on_date, t.starts_at, t.class_name)
      -- 0031: one per time AND set of classes (a group and a single class may share a first class)
      from (select distinct on (x.class_ids, x.on_date, x.starts_at) f.id as form_id, x.*
              from public.forms f, public.forms_times(f.id, p_from, p_to) x
             where f.location_code = v_loc and f.status = 'live'
               and exists (select 1 from public.form_booking_offers o where o.form_id = f.id)
               and exists (select 1 from jsonb_array_elements(f.published) e where e ->> 'type' = 'booking')
             order by x.class_ids, x.on_date, x.starts_at, x.spots_left desc, f.id) t), '[]'::jsonb));
end;
$$;

revoke execute on function public.prospects_open_times(uuid, date, date) from public, anon, authenticated, service_role;
grant  execute on function public.prospects_open_times(uuid, date, date) to authenticated;


commit;

-- End of 0031_class_ages.sql
