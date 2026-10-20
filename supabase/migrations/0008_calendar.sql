-- =====================================================================
-- 0008_calendar.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A database migration for the TKD staff dashboard. It runs after 0007
--   (Schedule) because it reads the schedule's time slots. It does not
--   change anything 0001-0007 made.
--
-- WHY IT EXISTS
--   The Calendar section (rulebook v0.234, approved mockup
--   docs/Prospects/TKD-Calendar-Mockups.html rev 1; build plan answers
--   v0.239, docs/Prospects/TKD-Calendar-Build-Plan.md). Next to the
--   regular classes (worked out from the Schedule - nothing is copied
--   here) the Calendar shows:
--     * closures: a whole day (or up to 31 days), or only SOME classes on
--       one day ("Thanksgiving - only Group A 4:30 is cancelled");
--     * school events (tournaments, camps ...), each with an event TYPE
--       that gives it its color.
--   Color Belt and Star testing events are NOT stored here: the app reads
--   them from Testing (v0.239 answer 1). Free-class bookings come with
--   Forms (step 3).
--   Staff can read; only admins change anything. Every change is
--   recorded in change_log.
--
-- WHAT IT ADDS
--   1. public.calendar_event_types    - the event types (shared by both
--                                        schools), 5 ready-made ones
--   2. public.calendar_events         - one row per event
--   3. public.calendar_closures       - one row per closure
--   4. public.calendar_closure_classes - for a "some classes" closure: a
--                                        RECORD of each cancelled class
--                                        (day, time, class ids + names)
--                                        as the schedule had it that day
--   5. triggers: bookkeeping (version, who/when), history (0003's
--      change_log_write), no truncate
--   6. security rules: read-only for signed-in, UNLOCKED staff
--      (has_data_access()); no direct writes for anyone in the app
--   7. ten functions the app calls (the ONLY way to write):
--      calendar_add_event, calendar_update_event, calendar_remove_event,
--      calendar_add_closure, calendar_update_closure,
--      calendar_remove_closure, calendar_add_type, calendar_update_type,
--      calendar_reorder_types, calendar_delete_type
--      + internal helpers the app cannot call
--
-- WHY A RECORD OF EACH CANCELLED CLASS (and not a link to the time slot)
--   Schedules can change after a closure is saved: a planned schedule
--   can start earlier, a slot can move to another day, Undo re-adds a
--   slot with a new id. A plain link would then point at the wrong class
--   and the cancelled class would silently look like it is running. With
--   a record, the app matches each cancelled class against the classes
--   really in effect that day; one that no longer matches shows as an
--   amber line "Cancelled class no longer on the schedule: Group A 4:30"
--   (Jeffrey, v0.239 answer 2). The slot id is kept only as a hint.
--
-- "BOTH SCHOOLS"
--   An event or closure for both schools has location_code NULL.
--   change_log accepts a NULL school (0003), so it is logged the same way.
--   Every calendar write locks BOTH school rows, always in the same order
--   (school code a-z), so two admins can't deadlock and calendar writes
--   take turns with schedule writes.
--
-- HOW TO RUN IT
--   Only AFTER 0005, 0006 and 0007 are live. Supabase dashboard -> SQL
--   Editor -> New query -> paste this WHOLE file -> Run. It starts with
--   "begin;" and ends with "commit;": if any statement fails, nothing is
--   kept. Supabase will warn about DESTRUCTIVE OPERATIONS: the words
--   appear inside rules ("on delete cascade"), inside the functions that
--   run later when an admin removes something, and in "drop ... if
--   exists" lines that make re-running safe. Nothing is removed now.
--   Safe to run again UNTIL a later migration changes these objects. (The
--   5 ready-made event types are only added the first time.)
--
-- WORDS USED BELOW
--   * "school" = a location (worcester / shrewsbury), from 0003.
--   * "version" COLUMN = the "someone else changed it" counter (as 0003).
--   * dates are Massachusetts dates; "today" = schedule_today() (0007).
--   * weekday = 1 Monday ... 7 Sunday (ISO).
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.schedule_slots') is null or to_regprocedure('public.schedule_today()') is null then
    raise exception '0008 needs 0007 (Schedule) first. Apply 0007_schedule.sql, then run this again.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 1. Small rules (internal; the app uses the same rules)
-- ---------------------------------------------------------------------

-- 1a. calendar_text_is_valid(text, max) - a title, reason or type name:
-- after the usual clean-up (0003's testing_normalize_name: spaces
-- squeezed, ends trimmed) 1..max characters, no control characters and
-- no invisible "format" characters (the same list as 0003's names).
create or replace function public.calendar_text_is_valid(p_text text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text is not null
     and p_max is not null
     and char_length(public.testing_normalize_name(p_text)) between 1 and p_max
     and public.testing_normalize_name(p_text)
         !~ '[\x01-\x08\x0e-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]';
$$;

revoke execute on function public.calendar_text_is_valid(text, integer) from public, anon, authenticated, service_role;

-- 1b. calendar_clean_notes(notes) - an event's "More details" notes:
-- Windows / old Mac line ends become plain line ends, the start and end
-- are trimmed, empty -> NULL.
create or replace function public.calendar_clean_notes(p_notes text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(replace(replace(p_notes, E'\r\n', E'\n'), E'\r', E'\n'), E' \t\n'), '');
$$;

revoke execute on function public.calendar_clean_notes(text) from public, anon, authenticated, service_role;

-- 1c. calendar_notes_is_valid(notes) - NULL (no notes), or up to 1,000
-- characters; line breaks are fine, other control / format characters
-- (incl. tab) are not.
create or replace function public.calendar_notes_is_valid(p_notes text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_notes is null
      or (char_length(p_notes) between 1 and 1000
          and p_notes !~ '[\x01-\x09\x0b-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]');
$$;

revoke execute on function public.calendar_notes_is_valid(text) from public, anon, authenticated, service_role;

-- 1d. calendar_color_is_valid(color) - one of the 8 class colors; red
-- is never offered (rulebook section 7, v0.234).
create or replace function public.calendar_color_is_valid(p_color text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_color in ('gray', 'yellow', 'orange', 'green', 'teal', 'sky', 'purple', 'pink'), false);
$$;

revoke execute on function public.calendar_color_is_valid(text) from public, anon, authenticated, service_role;

-- 1e. calendar_dates_are_valid(starts, ends) - both set, end on or after
-- start, at most 31 days counting both ends (v0.239 answer 4), and
-- between 2020 and 2100 (catches a typo like 2206).
create or replace function public.calendar_dates_are_valid(p_starts date, p_ends date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_starts is not null
     and p_ends is not null
     and p_ends >= p_starts
     and p_ends - p_starts <= 30
     and p_starts >= date '2020-01-01'
     and p_ends <= date '2100-12-31';
$$;

revoke execute on function public.calendar_dates_are_valid(date, date) from public, anon, authenticated, service_role;

-- 1f. calendar_event_times_are_valid(starts_on, ends_on, all_day,
-- starts_at, ends_at)
--   all day: no times;
--   not all day: both times, whole minutes on 5-minute steps; on a
--   one-day event the end is after the start. A several-day event with
--   times (Fri 7:30 pm -> Sun 12:00 pm) may end at any time on its last
--   day.
create or replace function public.calendar_event_times_are_valid(
  p_starts_on date, p_ends_on date, p_all_day boolean, p_starts_at time, p_ends_at time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select public.calendar_dates_are_valid(p_starts_on, p_ends_on)
     and p_all_day is not null
     and case
           when p_all_day then p_starts_at is null and p_ends_at is null
           else p_starts_at is not null
            and p_ends_at is not null
            and p_starts_at = date_trunc('minute', p_starts_at::interval)::time
            and p_ends_at   = date_trunc('minute', p_ends_at::interval)::time
            and extract(minute from p_starts_at)::integer % 5 = 0
            and extract(minute from p_ends_at)::integer % 5 = 0
            and (p_ends_on > p_starts_on or p_ends_at > p_starts_at)
         end;
$$;

revoke execute on function public.calendar_event_times_are_valid(date, date, boolean, time, time) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. public.calendar_event_types
-- Shared by both schools (v0.234). Color = one of the 8 class colors.
-- position = list order (0, 1, 2 ...); changing only the order is not a
-- content change (same as Testing's classes).
-- ---------------------------------------------------------------------
create table if not exists public.calendar_event_types (
  id              uuid        not null default gen_random_uuid(),
  name            text        not null,
  color           text        not null,
  position        smallint    not null default 0,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,          -- no foreign key on purpose (as 0003)
  updated_by      uuid        null,
  created_by_name text        not null,      -- set by the trigger
  updated_by_name text        not null,

  constraint calendar_event_types_pkey primary key (id),
  constraint calendar_event_types_name_check
    check (coalesce(public.calendar_text_is_valid(name, 40) and name = public.testing_normalize_name(name), false)),
  constraint calendar_event_types_color_check check (public.calendar_color_is_valid(color)),
  constraint calendar_event_types_position_check check (position between 0 and 999),
  constraint calendar_event_types_version_check check (version >= 1)
);

create unique index if not exists calendar_event_types_lower_name_idx on public.calendar_event_types (lower(name));

comment on table public.calendar_event_types is
  'Calendar event types (shared by both schools); an event''s color comes from its type. Written only through the calendar_* functions.';


-- ---------------------------------------------------------------------
-- 3. public.calendar_events
--   location_code NULL = both schools.
--   type_id -> calendar_event_types ON DELETE RESTRICT: a type in use is
--   only removed by calendar_delete_type, which moves its events first.
-- ---------------------------------------------------------------------
create table if not exists public.calendar_events (
  id              uuid        not null default gen_random_uuid(),
  location_code   text        null,
  type_id         uuid        not null,
  title           text        not null,
  starts_on       date        not null,
  ends_on         date        not null,
  all_day         boolean     not null,
  starts_at       time        null,
  ends_at         time        null,
  notes           text        null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint calendar_events_pkey primary key (id),
  constraint calendar_events_location_fk
    foreign key (location_code) references public.locations (code),
  constraint calendar_events_type_fk
    foreign key (type_id) references public.calendar_event_types (id) on delete restrict,
  constraint calendar_events_title_check
    check (coalesce(public.calendar_text_is_valid(title, 80) and title = public.testing_normalize_name(title), false)),
  constraint calendar_events_times_check
    check (coalesce(public.calendar_event_times_are_valid(starts_on, ends_on, all_day, starts_at, ends_at), false)),
  constraint calendar_events_notes_check
    check (notes is null or coalesce(public.calendar_notes_is_valid(notes) and notes = public.calendar_clean_notes(notes), false)),
  constraint calendar_events_version_check check (version >= 1)
);

create index if not exists calendar_events_dates_idx on public.calendar_events (starts_on, ends_on);
create index if not exists calendar_events_type_idx on public.calendar_events (type_id);

comment on table public.calendar_events is
  'School events on the Calendar (location_code NULL = both schools). Written only through the calendar_* functions.';


-- ---------------------------------------------------------------------
-- 4. public.calendar_closures
--   location_code NULL = both schools.
--   whole_day = true: every class on those days is cancelled.
--   whole_day = false ("some classes"): only on ONE day (v0.234); which
--   classes is in calendar_closure_classes.
--   class_key: the hint slot ids of the cancelled classes, joined. Not
--   readable by the app; it makes a change of only the ticked classes
--   count as a change (version goes up, open dialogs become stale).
-- ---------------------------------------------------------------------
create table if not exists public.calendar_closures (
  id              uuid        not null default gen_random_uuid(),
  location_code   text        null,
  starts_on       date        not null,
  ends_on         date        not null,
  reason          text        not null,
  whole_day       boolean     not null,
  class_key       text        not null default '',
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint calendar_closures_pkey primary key (id),
  constraint calendar_closures_location_fk
    foreign key (location_code) references public.locations (code),
  constraint calendar_closures_reason_check
    check (coalesce(public.calendar_text_is_valid(reason, 80) and reason = public.testing_normalize_name(reason), false)),
  constraint calendar_closures_dates_check
    check (coalesce(public.calendar_dates_are_valid(starts_on, ends_on), false)),
  constraint calendar_closures_some_classes_one_day_check
    check (whole_day or starts_on = ends_on),
  constraint calendar_closures_version_check check (version >= 1)
);

create index if not exists calendar_closures_dates_idx on public.calendar_closures (starts_on, ends_on);

comment on table public.calendar_closures is
  'Closures on the Calendar: whole days, or some classes on one day (location_code NULL = both schools). Written only through the calendar_* functions.';


-- ---------------------------------------------------------------------
-- 5. public.calendar_closure_classes
-- One row per cancelled time slot of a "some classes" closure: a RECORD
-- of it as the schedule had it on that day (see "WHY A RECORD" at the
-- top). location_code = the class's own school (never NULL), also for a
-- closure of both schools. slot_id is a hint only (no foreign key: the
-- slot may change or go later, the record stays).
-- ---------------------------------------------------------------------
create table if not exists public.calendar_closure_classes (
  id              uuid        not null default gen_random_uuid(),
  closure_id      uuid        not null,
  location_code   text        not null,
  weekday         smallint    not null,
  starts_at       time        not null,
  ends_at         time        not null,
  class_ids       uuid[]      not null,
  class_names     text        not null,
  slot_id         uuid        null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint calendar_closure_classes_pkey primary key (id),
  constraint calendar_closure_classes_closure_fk
    foreign key (closure_id) references public.calendar_closures (id) on delete cascade,
  constraint calendar_closure_classes_location_fk
    foreign key (location_code) references public.locations (code),
  constraint calendar_closure_classes_weekday_check check (weekday between 1 and 7),
  constraint calendar_closure_classes_time_check check (ends_at > starts_at),
  constraint calendar_closure_classes_classes_check
    check (cardinality(class_ids) between 1 and 10 and array_position(class_ids, null) is null),
  constraint calendar_closure_classes_names_check check (char_length(class_names) between 1 and 700),
  constraint calendar_closure_classes_slot_key unique (closure_id, slot_id),
  constraint calendar_closure_classes_version_check check (version >= 1)
);

create index if not exists calendar_closure_classes_closure_idx on public.calendar_closure_classes (closure_id);

comment on table public.calendar_closure_classes is
  'Cancelled classes of a "some classes" closure, recorded as the schedule had them that day (slot_id = hint only). Written only through the calendar_* functions.';


-- ---------------------------------------------------------------------
-- 6. Triggers
-- ---------------------------------------------------------------------

-- 6a. calendar_before_write() - BEFORE INSERT OR UPDATE on all four
-- tables. Same bookkeeping as 0007's schedule_before_write:
--   insert: version 1; created/updated stamps = now + who
--   update: id (and a cancelled class's closure_id) can never change;
--           created_* are kept; a real content change bumps version and
--           sets updated_* = now + who; no change keeps everything.
-- An event or closure MAY move to another school (or Both) when edited.
-- For event types, position (list order) is not content.
create or replace function public.calendar_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_bookkeeping text[] := array['version', 'created_at', 'updated_at', 'created_by',
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
     or (tg_table_name = 'calendar_closure_classes'
         and ((to_jsonb(new) ->> 'closure_id') is distinct from (to_jsonb(old) ->> 'closure_id')
              or (to_jsonb(new) ->> 'location_code') is distinct from (to_jsonb(old) ->> 'location_code'))) then
    raise exception using
      errcode    = '23514',
      constraint = tg_table_name || '_immutable',
      message    = tg_table_name || ': id and parent can''t change';
  end if;

  if tg_table_name = 'calendar_event_types' then
    v_bookkeeping := v_bookkeeping || 'position'::text;
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

revoke execute on function public.calendar_before_write() from public, anon, authenticated, service_role;

-- 6b. calendar_refuse_truncate() - TRUNCATE would skip the history.
create or replace function public.calendar_refuse_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% can''t be truncated (it would skip the history); remove rows one by one', tg_table_name;
end;
$$;

revoke execute on function public.calendar_refuse_truncate() from public, anon, authenticated, service_role;

-- 6c. Attach: bookkeeping, history (0003's change_log_write), no truncate.
drop trigger if exists calendar_event_types_before_write on public.calendar_event_types;
create trigger calendar_event_types_before_write
  before insert or update on public.calendar_event_types
  for each row execute function public.calendar_before_write();

drop trigger if exists calendar_events_before_write on public.calendar_events;
create trigger calendar_events_before_write
  before insert or update on public.calendar_events
  for each row execute function public.calendar_before_write();

drop trigger if exists calendar_closures_before_write on public.calendar_closures;
create trigger calendar_closures_before_write
  before insert or update on public.calendar_closures
  for each row execute function public.calendar_before_write();

drop trigger if exists calendar_closure_classes_before_write on public.calendar_closure_classes;
create trigger calendar_closure_classes_before_write
  before insert or update on public.calendar_closure_classes
  for each row execute function public.calendar_before_write();

drop trigger if exists calendar_event_types_log on public.calendar_event_types;
create trigger calendar_event_types_log
  after insert or update or delete on public.calendar_event_types
  for each row execute function public.change_log_write();

drop trigger if exists calendar_events_log on public.calendar_events;
create trigger calendar_events_log
  after insert or update or delete on public.calendar_events
  for each row execute function public.change_log_write();

drop trigger if exists calendar_closures_log on public.calendar_closures;
create trigger calendar_closures_log
  after insert or update or delete on public.calendar_closures
  for each row execute function public.change_log_write();

drop trigger if exists calendar_closure_classes_log on public.calendar_closure_classes;
create trigger calendar_closure_classes_log
  after insert or update or delete on public.calendar_closure_classes
  for each row execute function public.change_log_write();

drop trigger if exists calendar_event_types_no_truncate on public.calendar_event_types;
create trigger calendar_event_types_no_truncate
  before truncate on public.calendar_event_types
  for each statement execute function public.calendar_refuse_truncate();

drop trigger if exists calendar_events_no_truncate on public.calendar_events;
create trigger calendar_events_no_truncate
  before truncate on public.calendar_events
  for each statement execute function public.calendar_refuse_truncate();

drop trigger if exists calendar_closures_no_truncate on public.calendar_closures;
create trigger calendar_closures_no_truncate
  before truncate on public.calendar_closures
  for each statement execute function public.calendar_refuse_truncate();

drop trigger if exists calendar_closure_classes_no_truncate on public.calendar_closure_classes;
create trigger calendar_closure_classes_no_truncate
  before truncate on public.calendar_closure_classes
  for each statement execute function public.calendar_refuse_truncate();


-- ---------------------------------------------------------------------
-- 7. Security rules: RLS + grants (same two layers as 0003 and 0007)
-- Read: the listed columns, every row, only while has_data_access().
-- Write: nobody directly - only the functions in section 9.
-- service_role gets nothing (a leaked secret key can't write the calendar).
-- ---------------------------------------------------------------------
alter table public.calendar_event_types     enable row level security;
alter table public.calendar_events          enable row level security;
alter table public.calendar_closures        enable row level security;
alter table public.calendar_closure_classes enable row level security;

revoke all on table public.calendar_event_types, public.calendar_events, public.calendar_closures,
                    public.calendar_closure_classes
  from public, anon, authenticated, service_role;

grant select (id, name, color, position, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.calendar_event_types to authenticated;
grant select (id, location_code, type_id, title, starts_on, ends_on, all_day, starts_at, ends_at, notes, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.calendar_events to authenticated;
grant select (id, location_code, starts_on, ends_on, reason, whole_day, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.calendar_closures to authenticated;
grant select (id, closure_id, location_code, weekday, starts_at, ends_at, class_ids, class_names, slot_id, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.calendar_closure_classes to authenticated;
-- created_by / updated_by (login ids) and calendar_closures.class_key are NOT granted.

drop policy if exists calendar_event_types_select_with_access on public.calendar_event_types;
create policy calendar_event_types_select_with_access
  on public.calendar_event_types for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists calendar_events_select_with_access on public.calendar_events;
create policy calendar_events_select_with_access
  on public.calendar_events for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists calendar_closures_select_with_access on public.calendar_closures;
create policy calendar_closures_select_with_access
  on public.calendar_closures for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists calendar_closure_classes_select_with_access on public.calendar_closure_classes;
create policy calendar_closure_classes_select_with_access
  on public.calendar_closure_classes for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 8. Internal helpers for the functions (security invoker: they run with
-- the rights of the calendar_* function that calls them, never the app's)
-- ---------------------------------------------------------------------

-- 8a. calendar_lock_schools() - locks BOTH school rows, always in code
-- order (a-z), so calendar writes take turns with each other and with
-- schedule writes, and two of them never wait on each other in a circle.
create or replace function public.calendar_lock_schools()
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.locations l order by l.code for no key update;
end;
$$;

revoke execute on function public.calendar_lock_schools() from public, anon, authenticated, service_role;

-- 8b. calendar_save_closure_classes(closure, school, date, slot_ids)
--     -> 'ok' | 'stale' | 'invalid'
-- For a "some classes" closure: checks each ticked time slot and writes
-- the record of it. Each slot must
--   * exist (else stale: it changed since the dialog opened),
--   * be of the closure's school, or of either school for Both (else
--     invalid),
--   * be in the schedule IN EFFECT on that date for its own school, on
--     that date's weekday (else stale).
-- Called after calendar_lock_schools(), so no schedule can change
-- meanwhile. The caller has removed the closure's old records first.
create or replace function public.calendar_save_closure_classes(
  p_closure_id uuid, p_location_code text, p_on date, p_slot_ids uuid[])
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_found  integer;
  v_wrong  integer;
  v_off    integer;
begin
  select count(*),
         count(*) filter (where p_location_code is not null and s.location_code <> p_location_code),
         count(*) filter (where s.weekday <> extract(isodow from p_on)::smallint
                             or s.version_id is distinct from (
                                  select v.id from public.schedule_versions v
                                   where v.location_code = s.location_code and v.starts_on <= p_on
                                   order by v.starts_on desc limit 1))
    into v_found, v_wrong, v_off
    from public.schedule_slots s
   where s.id = any (p_slot_ids);
  if v_wrong > 0 then
    return 'invalid';
  end if;
  if v_found < cardinality(p_slot_ids) or v_off > 0 then
    return 'stale';
  end if;

  insert into public.calendar_closure_classes
         (closure_id, location_code, weekday, starts_at, ends_at, class_ids, class_names, slot_id)
  select p_closure_id, s.location_code, s.weekday, s.starts_at, s.ends_at,
         (select array_agg(sc.class_id order by sc.position)
            from public.schedule_slot_classes sc where sc.slot_id = s.id),
         (select string_agg(c.name, ' + ' order by sc.position)
            from public.schedule_slot_classes sc
            join public.testing_classes c on c.id = sc.class_id
           where sc.slot_id = s.id),
         s.id
    from public.schedule_slots s
   where s.id = any (p_slot_ids)
   order by s.location_code, s.starts_at;
  return 'ok';
end;
$$;

revoke execute on function public.calendar_save_closure_classes(uuid, text, date, uuid[]) from public, anon, authenticated, service_role;

-- 8c. calendar_slot_key(slot_ids) - the joined, sorted form kept in
-- calendar_closures.class_key ("same ticked classes" = same text).
create or replace function public.calendar_slot_key(p_slot_ids uuid[])
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce((select string_agg(x::text, ',' order by x) from unnest(p_slot_ids) as t(x)), '');
$$;

revoke execute on function public.calendar_slot_key(uuid[]) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 9. The ten app functions (the only way to change the calendar)
--
-- Same pattern as 0003 / 0007:
--   * returns JSON {"status": ...}: ok, no_access, not_allowed, invalid,
--     not_found, stale, duplicate_name
--   * checks in this order: has_data_access() FIRST, then is_admin(),
--     then the input, then locks (both school rows), then re-checks,
--     then writes
--   * tags its writes (tkd.action, tkd.batch_id) for change_log
--   * the whole body is in begin ... exception: a table rule that still
--     says no undoes everything and returns a status instead of an error
--       unique (type name) -> duplicate_name; any other unique -> stale
--       foreign key / check / not-null -> invalid
--       deadlock / serialization / lock not available -> stale
-- ---------------------------------------------------------------------

-- 9a. calendar_add_event(p_location_code (NULL = both), p_type_id,
--     p_title, p_starts_on, p_ends_on, p_all_day, p_starts_at, p_ends_at,
--     p_notes)
-- Ok: {"status":"ok","id":...,"version":1}
create or replace function public.calendar_add_event(
  p_location_code text,
  p_type_id       uuid,
  p_title         text,
  p_starts_on     date,
  p_ends_on       date,
  p_all_day       boolean,
  p_starts_at     time,
  p_ends_at       time,
  p_notes         text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_title   text := public.testing_normalize_name(p_title);
  v_notes   text := public.calendar_clean_notes(p_notes);
  v_id      uuid;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if (p_location_code is not null and not exists (select 1 from public.locations l where l.code = p_location_code))
       or p_type_id is null
       or not public.calendar_text_is_valid(v_title, 80)
       or not public.calendar_notes_is_valid(v_notes)
       or not public.calendar_event_times_are_valid(p_starts_on, p_ends_on, p_all_day, p_starts_at, p_ends_at) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform public.calendar_lock_schools();

    perform 1 from public.calendar_event_types t where t.id = p_type_id for key share;
    if not found then
      return jsonb_build_object('status', 'stale');     -- the type was deleted meanwhile
    end if;

    perform set_config('tkd.action', 'calendar_add_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.calendar_events
           (location_code, type_id, title, starts_on, ends_on, all_day, starts_at, ends_at, notes)
    values (p_location_code, p_type_id, v_title, p_starts_on, p_ends_on, p_all_day, p_starts_at, p_ends_at, v_notes)
    returning id, version into v_id, v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version);
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

revoke execute on function public.calendar_add_event(text, uuid, text, date, date, boolean, time, time, text) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_add_event(text, uuid, text, date, date, boolean, time, time, text) to authenticated;

-- 9b. calendar_update_event(p_event_id, p_expected_version, ...same as
-- add) - saving unchanged values writes nothing.
-- Ok: {"status":"ok","id":...,"version":n}
create or replace function public.calendar_update_event(
  p_event_id         uuid,
  p_expected_version integer,
  p_location_code    text,
  p_type_id          uuid,
  p_title            text,
  p_starts_on        date,
  p_ends_on          date,
  p_all_day          boolean,
  p_starts_at        time,
  p_ends_at          time,
  p_notes            text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_title   text := public.testing_normalize_name(p_title);
  v_notes   text := public.calendar_clean_notes(p_notes);
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_event_id is null
       or p_expected_version is null
       or (p_location_code is not null and not exists (select 1 from public.locations l where l.code = p_location_code))
       or p_type_id is null
       or not public.calendar_text_is_valid(v_title, 80)
       or not public.calendar_notes_is_valid(v_notes)
       or not public.calendar_event_times_are_valid(p_starts_on, p_ends_on, p_all_day, p_starts_at, p_ends_at) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform public.calendar_lock_schools();

    select e.version into v_version from public.calendar_events e where e.id = p_event_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform 1 from public.calendar_event_types t where t.id = p_type_id for key share;
    if not found then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'calendar_update_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.calendar_events e
       set location_code = p_location_code,
           type_id       = p_type_id,
           title         = v_title,
           starts_on     = p_starts_on,
           ends_on       = p_ends_on,
           all_day       = p_all_day,
           starts_at     = p_starts_at,
           ends_at       = p_ends_at,
           notes         = v_notes
     where e.id = p_event_id
    returning e.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', p_event_id, 'version', v_version);
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

revoke execute on function public.calendar_update_event(uuid, integer, text, uuid, text, date, date, boolean, time, time, text) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_update_event(uuid, integer, text, uuid, text, date, date, boolean, time, time, text) to authenticated;

-- 9c. calendar_remove_event(p_event_id, p_expected_version)
-- Returns what it was, so the app's Undo can add it back.
-- Ok: {"status":"ok","removed":{location_code,type_id,title,starts_on,ends_on,all_day,starts_at,ends_at,notes}}
create or replace function public.calendar_remove_event(
  p_event_id         uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ev record;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_event_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform public.calendar_lock_schools();

    select e.* into v_ev from public.calendar_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_ev.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'calendar_remove_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.calendar_events e where e.id = p_event_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'removed', jsonb_build_object(
      'location_code', v_ev.location_code, 'type_id', v_ev.type_id, 'title', v_ev.title,
      'starts_on', v_ev.starts_on, 'ends_on', v_ev.ends_on, 'all_day', v_ev.all_day,
      'starts_at', to_char(v_ev.starts_at, 'HH24:MI'), 'ends_at', to_char(v_ev.ends_at, 'HH24:MI'),
      'notes', v_ev.notes));
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

revoke execute on function public.calendar_remove_event(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_remove_event(uuid, integer) to authenticated;

-- 9d. calendar_add_closure(p_location_code (NULL = both), p_starts_on,
--     p_ends_on, p_reason, p_whole_day, p_slot_ids)
--   whole day: p_slot_ids empty (or NULL); up to 31 days.
--   some classes: one day; p_slot_ids = the ticked time slots (1-50) of
--   the schedule in effect that day (8b checks them).
-- Ok: {"status":"ok","id":...,"version":1}
create or replace function public.calendar_add_closure(
  p_location_code text,
  p_starts_on     date,
  p_ends_on       date,
  p_reason        text,
  p_whole_day     boolean,
  p_slot_ids      uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason  text := public.testing_normalize_name(p_reason);
  v_slots   uuid[] := coalesce(p_slot_ids, '{}'::uuid[]);
  v_id      uuid;
  v_version integer;
  v_check   text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if (p_location_code is not null and not exists (select 1 from public.locations l where l.code = p_location_code))
       or not public.calendar_text_is_valid(v_reason, 80)
       or not public.calendar_dates_are_valid(p_starts_on, p_ends_on)
       or p_whole_day is null
       or not public.testing_ids_are_valid(v_slots)
       or (p_whole_day and cardinality(v_slots) <> 0)
       or (not p_whole_day and (p_starts_on <> p_ends_on or cardinality(v_slots) not between 1 and 50)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform public.calendar_lock_schools();

    perform set_config('tkd.action', 'calendar_add_closure', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.calendar_closures (location_code, starts_on, ends_on, reason, whole_day, class_key)
    values (p_location_code, p_starts_on, p_ends_on, v_reason, p_whole_day, public.calendar_slot_key(v_slots))
    returning id, version into v_id, v_version;

    if not p_whole_day then
      v_check := public.calendar_save_closure_classes(v_id, p_location_code, p_starts_on, v_slots);
      if v_check <> 'ok' then
        raise exception using errcode = 'TKD01', message = v_check;   -- undo the insert above
      end if;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version);
  exception
    when sqlstate 'TKD01' then   -- only our own "undo" signal; any other error is a real fault and is not hidden
      return jsonb_build_object('status', case when sqlerrm in ('stale', 'invalid') then sqlerrm else 'invalid' end);
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

revoke execute on function public.calendar_add_closure(text, date, date, text, boolean, uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_add_closure(text, date, date, text, boolean, uuid[]) to authenticated;

-- 9e. calendar_update_closure(p_closure_id, p_expected_version, ...same
-- as add). A new date, a new school, a switch between "whole day" and
-- "some classes" or other ticked classes REPLACE the records of the
-- cancelled classes (a record that no longer matched the schedule - the
-- amber line - is dropped then; the app says so in the dialog). Saving
-- unchanged values writes nothing.
-- Ok: {"status":"ok","id":...,"version":n}
create or replace function public.calendar_update_closure(
  p_closure_id       uuid,
  p_expected_version integer,
  p_location_code    text,
  p_starts_on        date,
  p_ends_on          date,
  p_reason           text,
  p_whole_day        boolean,
  p_slot_ids         uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason  text := public.testing_normalize_name(p_reason);
  v_slots   uuid[] := coalesce(p_slot_ids, '{}'::uuid[]);
  v_old     record;
  v_version integer;
  v_check   text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_closure_id is null
       or p_expected_version is null
       or (p_location_code is not null and not exists (select 1 from public.locations l where l.code = p_location_code))
       or not public.calendar_text_is_valid(v_reason, 80)
       or not public.calendar_dates_are_valid(p_starts_on, p_ends_on)
       or p_whole_day is null
       or not public.testing_ids_are_valid(v_slots)
       or (p_whole_day and cardinality(v_slots) <> 0)
       or (not p_whole_day and (p_starts_on <> p_ends_on or cardinality(v_slots) not between 1 and 50)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform public.calendar_lock_schools();

    select c.* into v_old from public.calendar_closures c where c.id = p_closure_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_old.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'calendar_update_closure', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.calendar_closures c
       set location_code = p_location_code,
           starts_on     = p_starts_on,
           ends_on       = p_ends_on,
           reason        = v_reason,
           whole_day     = p_whole_day,
           class_key     = public.calendar_slot_key(v_slots)
     where c.id = p_closure_id
    returning c.version into v_version;

    if v_old.whole_day is distinct from p_whole_day
       or v_old.starts_on is distinct from p_starts_on
       or v_old.location_code is distinct from p_location_code
       or v_old.class_key is distinct from public.calendar_slot_key(v_slots) then
      delete from public.calendar_closure_classes x where x.closure_id = p_closure_id;
      if not p_whole_day then
        v_check := public.calendar_save_closure_classes(p_closure_id, p_location_code, p_starts_on, v_slots);
        if v_check <> 'ok' then
          raise exception using errcode = 'TKD01', message = v_check;   -- undo everything above
        end if;
      end if;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', p_closure_id, 'version', v_version);
  exception
    when sqlstate 'TKD01' then   -- only our own "undo" signal; any other error is a real fault and is not hidden
      return jsonb_build_object('status', case when sqlerrm in ('stale', 'invalid') then sqlerrm else 'invalid' end);
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

revoke execute on function public.calendar_update_closure(uuid, integer, text, date, date, text, boolean, uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_update_closure(uuid, integer, text, date, date, text, boolean, uuid[]) to authenticated;

-- 9f. calendar_remove_closure(p_closure_id, p_expected_version)
-- Removes the closure and its cancelled-class records (cascade). Returns
-- what it was, so the app's Undo can add it back (slot_ids = the hint
-- ids; if the schedule changed meanwhile, Undo gets "stale").
-- Ok: {"status":"ok","removed":{location_code,starts_on,ends_on,reason,whole_day,slot_ids:[...]}}
create or replace function public.calendar_remove_closure(
  p_closure_id       uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c     record;
  v_slots jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_closure_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform public.calendar_lock_schools();

    select c.* into v_c from public.calendar_closures c where c.id = p_closure_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    select coalesce(jsonb_agg(x.slot_id order by x.location_code, x.starts_at) filter (where x.slot_id is not null), '[]'::jsonb)
      into v_slots
      from public.calendar_closure_classes x
     where x.closure_id = p_closure_id;

    perform set_config('tkd.action', 'calendar_remove_closure', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.calendar_closures c where c.id = p_closure_id;   -- its class records follow (cascade)

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'removed', jsonb_build_object(
      'location_code', v_c.location_code, 'starts_on', v_c.starts_on, 'ends_on', v_c.ends_on,
      'reason', v_c.reason, 'whole_day', v_c.whole_day, 'slot_ids', v_slots));
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

revoke execute on function public.calendar_remove_closure(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_remove_closure(uuid, integer) to authenticated;

-- 9g. calendar_add_type(p_name, p_color) - a new event type at the end
-- of the list. Names are unique ignoring upper/lower case. At most 50.
-- Ok: {"status":"ok","id":...,"version":1}
create or replace function public.calendar_add_type(
  p_name  text,
  p_color text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name       text := public.testing_normalize_name(p_name);
  v_id         uuid;
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

    if not public.calendar_text_is_valid(v_name, 40) or not public.calendar_color_is_valid(p_color) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform public.calendar_lock_schools();

    if exists (select 1 from public.calendar_event_types t where lower(t.name) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;
    if (select count(*) from public.calendar_event_types) >= 50 then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'calendar_add_type', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.calendar_event_types (name, color, position)
    values (v_name, p_color, coalesce((select max(t.position) + 1 from public.calendar_event_types t), 0))
    returning id, version into v_id, v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'calendar_event_types_lower_name_idx' then
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

revoke execute on function public.calendar_add_type(text, text) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_add_type(text, text) to authenticated;

-- 9h. calendar_update_type(p_type_id, p_expected_version, p_name, p_color)
-- Rename / recolor. Recoloring a type recolors all its events (the app
-- reads the color from the type).
-- Ok: {"status":"ok","id":...,"version":n}
create or replace function public.calendar_update_type(
  p_type_id          uuid,
  p_expected_version integer,
  p_name             text,
  p_color            text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name       text := public.testing_normalize_name(p_name);
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

    if p_type_id is null
       or p_expected_version is null
       or not public.calendar_text_is_valid(v_name, 40)
       or not public.calendar_color_is_valid(p_color) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform public.calendar_lock_schools();

    select t.version into v_version from public.calendar_event_types t where t.id = p_type_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if exists (select 1 from public.calendar_event_types t where lower(t.name) = lower(v_name) and t.id <> p_type_id) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    perform set_config('tkd.action', 'calendar_update_type', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.calendar_event_types t
       set name = v_name, color = p_color
     where t.id = p_type_id
    returning t.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', p_type_id, 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'calendar_event_types_lower_name_idx' then
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

revoke execute on function public.calendar_update_type(uuid, integer, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_update_type(uuid, integer, text, text) to authenticated;

-- 9i. calendar_reorder_types(p_expected_ids, p_new_ids)
-- p_expected_ids = the order the screen showed (else stale); p_new_ids =
-- the same ids in the new order. Order only: versions don't change.
-- Ok: {"status":"ok"}
create or replace function public.calendar_reorder_types(
  p_expected_ids uuid[],
  p_new_ids      uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if not public.testing_ids_are_valid(p_expected_ids)
       or not public.testing_ids_are_valid(p_new_ids)
       or cardinality(p_expected_ids) <> cardinality(p_new_ids)
       or array(select x.id from unnest(p_expected_ids) as x(id) order by x.id)
          <> array(select x.id from unnest(p_new_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform public.calendar_lock_schools();

    if array(select t.id from public.calendar_event_types t order by t.position, t.id)
       <> p_expected_ids then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'calendar_reorder_types', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.calendar_event_types t
       set position = (n.ord - 1)::smallint
      from unnest(p_new_ids) with ordinality as n(id, ord)
     where t.id = n.id
       and t.position <> n.ord - 1;

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

revoke execute on function public.calendar_reorder_types(uuid[], uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_reorder_types(uuid[], uuid[]) to authenticated;

-- 9j. calendar_delete_type(p_type_id, p_expected_version,
--     p_expected_event_count, p_move_to_type_id)
-- Deletes an event type. If events use it, the confirmation showed how
-- many (p_expected_event_count; a different number now -> stale) and
-- they first move to the type the admin picked (p_move_to_type_id).
--   in use, no other type exists      -> not_allowed
--   in use, no / the same move-to type -> invalid
--   move-to type deleted meanwhile    -> stale
-- The last type may be deleted when no event uses it (v0.239).
-- Ok: {"status":"ok","moved":n}
create or replace function public.calendar_delete_type(
  p_type_id              uuid,
  p_expected_version     integer,
  p_expected_event_count integer,
  p_move_to_type_id      uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_count   integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_type_id is null
       or p_expected_version is null
       or p_expected_event_count is null
       or p_expected_event_count < 0 then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform public.calendar_lock_schools();

    select t.version into v_version from public.calendar_event_types t where t.id = p_type_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    select count(*) into v_count from public.calendar_events e where e.type_id = p_type_id;
    if v_count <> p_expected_event_count then
      return jsonb_build_object('status', 'stale');
    end if;

    if v_count > 0 then
      if not exists (select 1 from public.calendar_event_types t where t.id <> p_type_id) then
        return jsonb_build_object('status', 'not_allowed');
      end if;
      if p_move_to_type_id is null or p_move_to_type_id = p_type_id then
        return jsonb_build_object('status', 'invalid');
      end if;
      perform 1 from public.calendar_event_types t where t.id = p_move_to_type_id for key share;
      if not found then
        return jsonb_build_object('status', 'stale');
      end if;
    end if;

    perform set_config('tkd.action', 'calendar_delete_type', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if v_count > 0 then
      update public.calendar_events e set type_id = p_move_to_type_id where e.type_id = p_type_id;
    end if;
    delete from public.calendar_event_types t where t.id = p_type_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'moved', v_count);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'stale');   -- an event got this type meanwhile
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.calendar_delete_type(uuid, integer, integer, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_delete_type(uuid, integer, integer, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 10. The five ready-made event types (v0.239 answer 3; the mockup's
-- names and colors). Only the FIRST time this file runs (the history
-- has no "calendar_setup_types" entry yet), so re-running it never adds
-- them again - not even after admins deleted them on purpose. Logged
-- like any other change, with the name "Calendar setup".
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.change_log l where l.action = 'calendar_setup_types') then
    perform set_config('tkd.actor_label', 'Calendar setup', true);
    perform set_config('tkd.action', 'calendar_setup_types', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.calendar_event_types (name, color, position) values
      ('Testing',    'purple', 0),
      ('Tournament', 'sky',    1),
      ('Camp',       'teal',   2),
      ('Meeting',    'orange', 3),
      ('Party',      'pink',   4);
    perform set_config('tkd.actor_label', '', true);
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
  end if;
end;
$$;

commit;
