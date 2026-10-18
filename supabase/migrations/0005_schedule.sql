-- =====================================================================
-- 0005_schedule.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The fifth database migration for the TKD staff dashboard. It runs
--   after 0001-0004 (all live) and does not change anything they made.
--
-- WHY IT EXISTS
--   The Schedule section (rulebook v0.84, approved mockup
--   docs/Prospects/TKD-Class-Schedule-Mockups.html rev 2): each school's
--   weekly classes. A time slot is one class group from Testing -> Classes
--   and ranks (White belt, Group A ...) on one weekday, from a start time to
--   an end time. The week repeats until it is changed. Admins can plan any
--   number of FUTURE schedules, each with its own start date; on that date
--   it simply becomes the current one. Older schedules stay as read-only
--   history. Each class can have a color on the schedule. Staff can read;
--   only admins change anything. Every change is recorded in change_log.
--
-- WHAT IT ADDS
--   1. public.schedule_versions     - one row per schedule per school
--                                     ("Current", "Winter", ...), with the
--                                     date it starts
--   2. public.schedule_slots        - the time slots inside a schedule
--   3. public.schedule_class_colors - the color of each class on the
--                                     schedule (kept apart from Testing's
--                                     tables so Testing doesn't change)
--   4. triggers: bookkeeping (version, who/when), history (change_log, the
--      same function 0003 uses), no truncate
--   5. security rules: read-only for signed-in, UNLOCKED staff
--      (has_data_access()); no direct writes for anyone in the app
--   6. schedule_today() - "today" in Massachusetts, so the app and the
--      database agree which schedule is current
--   7. seven functions the app calls to change the schedule (the ONLY way
--      to write): schedule_add_slots, schedule_update_slot,
--      schedule_remove_slot, schedule_plan_version,
--      schedule_update_version, schedule_delete_version,
--      schedule_set_class_color
--      + internal helpers the app cannot call (schedule_before_write,
--        schedule_refuse_truncate, schedule_time_is_valid,
--        schedule_name_is_valid, schedule_weekdays_are_valid,
--        schedule_version_state, schedule_overlaps)
--
-- WHAT IT DOES NOT CHANGE
--   Testing's tables and functions (0003) are not touched. When an admin
--   deletes a class in Testing, its time slots and its color go with it
--   automatically ("on delete cascade" below) and each removed row is
--   still written to change_log, tagged with Testing's 'delete_class'
--   action. The Testing delete dialog counts the slots first (front end)
--   so it can say what will be removed (decision Q1, build plan section 6).
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words appear inside rules ("on delete cascade"), inside the functions
--   that run later when an admin removes something in the app, and in
--   "drop ... if exists" lines that make re-running safe. Nothing is
--   removed now. Confirm.
--   Safe to run again (same patterns as 0003). Re-running is only safe
--   UNTIL a later migration changes any of these objects.
--
-- WORDS USED BELOW
--   * "school" = a location (worcester / shrewsbury), from 0003.
--   * "schedule" / "version" = one row of schedule_versions: a whole week
--     of time slots that applies from its starts_on date until the next
--     schedule's starts_on.
--   * current / planned / past (worked out, never stored):
--       current = the schedule with the LATEST starts_on that is on or
--                 before today (Massachusetts time)
--       planned = starts_on after today
--       past    = starts_on on or before today, but not the current one
--     Past schedules can't be changed. The current one's time slots can
--     be changed (takes effect right away) but not its start date.
--   * "version" COLUMN (a number on every row) = the same "someone else
--     changed it" counter as 0003. Sorry for the two meanings: the table
--     is about schedule versions, the column is the edit counter.
--   * weekday = 1 Monday ... 7 Sunday (ISO).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. Small rules (internal; the app uses the same rules)
-- ---------------------------------------------------------------------

-- 1a. schedule_time_is_valid(starts, ends)
-- A time slot is on 5-minute steps (no seconds), ends after it starts,
-- and lasts 15 minutes to 4 hours.
create or replace function public.schedule_time_is_valid(p_starts time, p_ends time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_starts is not null
     and p_ends is not null
     and p_starts = date_trunc('minute', p_starts::interval)::time
     and p_ends   = date_trunc('minute', p_ends::interval)::time
     and extract(minute from p_starts)::integer % 5 = 0
     and extract(minute from p_ends)::integer % 5 = 0
     and p_ends > p_starts
     and p_ends - p_starts between interval '15 minutes' and interval '4 hours';
$$;

revoke execute on function public.schedule_time_is_valid(time, time) from public, anon, authenticated, service_role;

-- 1b. schedule_name_is_valid(name)
-- A schedule's name is optional ("Winter"). If given: 1-40 characters
-- after clean-up, no control characters (0003's name rules, shorter).
create or replace function public.schedule_name_is_valid(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name is null
      or (public.testing_name_is_valid(p_name)
          and char_length(public.testing_normalize_name(p_name)) <= 40);
$$;

revoke execute on function public.schedule_name_is_valid(text) from public, anon, authenticated, service_role;

-- 1c. schedule_weekdays_are_valid(days)
-- At least one day, each 1-7, no day twice.
create or replace function public.schedule_weekdays_are_valid(p_days smallint[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_days is not null
     and cardinality(p_days) between 1 and 7
     and array_position(p_days, null) is null
     and (select bool_and(d between 1 and 7) from unnest(p_days) as x(d))
     and (select count(distinct d) from unnest(p_days) as x(d)) = cardinality(p_days);
$$;

revoke execute on function public.schedule_weekdays_are_valid(smallint[]) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. schedule_today() - today's date in Massachusetts
-- WHY: the database runs on UTC; at 9 pm in Worcester it is already
-- "tomorrow" in UTC. Which schedule is current must switch at local
-- midnight. The app calls this too, so both agree.
-- clock_timestamp() = the time right NOW, not when the request started:
-- a change that waited for another admin's lock across midnight still
-- sees the right day. (amended after security review)
-- Callable by any signed-in session, even a locked one, ON PURPOSE: it
-- returns only today's date and reads no table. (security review note)
-- ---------------------------------------------------------------------
create or replace function public.schedule_today()
returns date
language sql
volatile
set search_path = ''
as $$
  select (clock_timestamp() at time zone 'America/New_York')::date;
$$;

revoke execute on function public.schedule_today() from public, anon, authenticated, service_role;
grant  execute on function public.schedule_today() to authenticated;


-- ---------------------------------------------------------------------
-- 3. public.schedule_versions
-- One row per schedule per school. Bookkeeping columns as 0003.
-- (id, location_code) unique: lets time slots point at "this schedule IN
-- THIS SCHOOL", so a slot can never mix a schedule of one school with a
-- class of the other.
-- ---------------------------------------------------------------------
create table if not exists public.schedule_versions (
  id              uuid        not null default gen_random_uuid(),
  location_code   text        not null,
  name            text        null,
  starts_on       date        not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,          -- no foreign key on purpose (as 0003)
  updated_by      uuid        null,
  created_by_name text        not null,      -- set by the trigger
  updated_by_name text        not null,

  constraint schedule_versions_pkey primary key (id),
  constraint schedule_versions_location_fk
    foreign key (location_code) references public.locations (code),
  constraint schedule_versions_name_check
    check (name is null
           or coalesce(public.schedule_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint schedule_versions_version_check check (version >= 1),
  constraint schedule_versions_location_starts_key unique (location_code, starts_on),
  constraint schedule_versions_id_location_key unique (id, location_code)
);

comment on table public.schedule_versions is
  'One schedule (a repeating week) per school per start date. Current = latest starts_on on or before schedule_today(). Written only through the schedule_* functions.';


-- ---------------------------------------------------------------------
-- 4. public.schedule_slots
-- One class group, one weekday, start and end time, inside one schedule.
--   * (version_id, location_code) -> schedule_versions: removing a
--     planned schedule removes its slots.
--   * (class_id, location_code) -> testing_classes (0003): the class must
--     be in the same school; deleting the class in Testing removes its
--     slots (decision Q1).
--   * overlaps are allowed (two mats); the app warns, the database
--     doesn't block.
-- ---------------------------------------------------------------------
create table if not exists public.schedule_slots (
  id              uuid        not null default gen_random_uuid(),
  version_id      uuid        not null,
  location_code   text        not null,
  class_id        uuid        not null,
  weekday         smallint    not null,
  starts_at       time        not null,
  ends_at         time        not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint schedule_slots_pkey primary key (id),
  constraint schedule_slots_version_fk
    foreign key (version_id, location_code)
    references public.schedule_versions (id, location_code) on delete cascade,
  constraint schedule_slots_class_fk
    foreign key (class_id, location_code)
    references public.testing_classes (id, location_code) on delete cascade,
  constraint schedule_slots_weekday_check check (weekday between 1 and 7),
  constraint schedule_slots_time_check check (coalesce(public.schedule_time_is_valid(starts_at, ends_at), false)),
  constraint schedule_slots_version_check check (version >= 1)
);

create index if not exists schedule_slots_version_idx on public.schedule_slots (version_id, weekday, starts_at);
create index if not exists schedule_slots_class_idx   on public.schedule_slots (class_id);

comment on table public.schedule_slots is
  'Time slots of a schedule: class group + weekday (1 Mon .. 7 Sun) + start/end. Written only through the schedule_* functions.';


-- ---------------------------------------------------------------------
-- 5. public.schedule_class_colors
-- The color of a class on the schedule (one of 8; red is never offered,
-- rulebook section 7). A class without a row shows gray. Has its own id
-- because change_log_write (0003) needs an "id" column.
-- ---------------------------------------------------------------------
create table if not exists public.schedule_class_colors (
  id              uuid        not null default gen_random_uuid(),
  class_id        uuid        not null,
  location_code   text        not null,
  color           text        not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint schedule_class_colors_pkey primary key (id),
  constraint schedule_class_colors_class_key unique (class_id),
  constraint schedule_class_colors_class_fk
    foreign key (class_id, location_code)
    references public.testing_classes (id, location_code) on delete cascade,
  constraint schedule_class_colors_color_check
    check (color in ('gray', 'yellow', 'orange', 'green', 'teal', 'sky', 'purple', 'pink')),
  constraint schedule_class_colors_version_check check (version >= 1)
);

comment on table public.schedule_class_colors is
  'Each class''s color on the Schedule (8 soft colors, never red). No row = gray. Written only through schedule_set_class_color.';


-- ---------------------------------------------------------------------
-- 6. Triggers
-- ---------------------------------------------------------------------

-- 6a. schedule_before_write() - BEFORE INSERT OR UPDATE on all three
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
     or (tg_table_name = 'schedule_class_colors'
         and (to_jsonb(new) ->> 'class_id') is distinct from (to_jsonb(old) ->> 'class_id')) then
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

-- 6b. schedule_refuse_truncate() - TRUNCATE would skip the history.
create or replace function public.schedule_refuse_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% can''t be truncated (it would skip the history); remove rows one by one', tg_table_name;
end;
$$;

revoke execute on function public.schedule_refuse_truncate() from public, anon, authenticated, service_role;

-- 6c. Attach: bookkeeping, history (0003's change_log_write), no truncate.
drop trigger if exists schedule_versions_before_write on public.schedule_versions;
create trigger schedule_versions_before_write
  before insert or update on public.schedule_versions
  for each row execute function public.schedule_before_write();

drop trigger if exists schedule_slots_before_write on public.schedule_slots;
create trigger schedule_slots_before_write
  before insert or update on public.schedule_slots
  for each row execute function public.schedule_before_write();

drop trigger if exists schedule_class_colors_before_write on public.schedule_class_colors;
create trigger schedule_class_colors_before_write
  before insert or update on public.schedule_class_colors
  for each row execute function public.schedule_before_write();

drop trigger if exists schedule_versions_log on public.schedule_versions;
create trigger schedule_versions_log
  after insert or update or delete on public.schedule_versions
  for each row execute function public.change_log_write();

drop trigger if exists schedule_slots_log on public.schedule_slots;
create trigger schedule_slots_log
  after insert or update or delete on public.schedule_slots
  for each row execute function public.change_log_write();

drop trigger if exists schedule_class_colors_log on public.schedule_class_colors;
create trigger schedule_class_colors_log
  after insert or update or delete on public.schedule_class_colors
  for each row execute function public.change_log_write();

drop trigger if exists schedule_versions_no_truncate on public.schedule_versions;
create trigger schedule_versions_no_truncate
  before truncate on public.schedule_versions
  for each statement execute function public.schedule_refuse_truncate();

drop trigger if exists schedule_slots_no_truncate on public.schedule_slots;
create trigger schedule_slots_no_truncate
  before truncate on public.schedule_slots
  for each statement execute function public.schedule_refuse_truncate();

drop trigger if exists schedule_class_colors_no_truncate on public.schedule_class_colors;
create trigger schedule_class_colors_no_truncate
  before truncate on public.schedule_class_colors
  for each statement execute function public.schedule_refuse_truncate();


-- ---------------------------------------------------------------------
-- 7. Security rules: RLS + grants (same two layers as 0003 section 7)
-- Read: the listed columns, every row, only while has_data_access().
-- Write: nobody directly - only the functions in section 8.
-- service_role gets nothing (a leaked secret key can't write schedules).
-- ---------------------------------------------------------------------
alter table public.schedule_versions     enable row level security;
alter table public.schedule_slots        enable row level security;
alter table public.schedule_class_colors enable row level security;

revoke all on table public.schedule_versions, public.schedule_slots, public.schedule_class_colors
  from public, anon, authenticated, service_role;

grant select (id, location_code, name, starts_on, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.schedule_versions to authenticated;
grant select (id, version_id, location_code, class_id, weekday, starts_at, ends_at, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.schedule_slots to authenticated;
grant select (id, class_id, location_code, color, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.schedule_class_colors to authenticated;
-- created_by / updated_by (login ids) are NOT granted.

drop policy if exists schedule_versions_select_with_access on public.schedule_versions;
create policy schedule_versions_select_with_access
  on public.schedule_versions for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists schedule_slots_select_with_access on public.schedule_slots;
create policy schedule_slots_select_with_access
  on public.schedule_slots for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists schedule_class_colors_select_with_access on public.schedule_class_colors;
create policy schedule_class_colors_select_with_access
  on public.schedule_class_colors for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 8. Internal helpers for the functions
-- Both are "security invoker": they run with the rights of whoever calls
-- them - here always one of the security definer functions of section 9
-- - so even if one were granted to the app by mistake, it could not read
-- past the RLS rules. (amended after security review)
-- ---------------------------------------------------------------------

-- 8-a. schedule_version_state(version_id) -> 'current' | 'planned' |
-- 'past' | NULL (no such schedule). Called only after the school is
-- locked, so no schedule of that school can appear or move meanwhile.
create or replace function public.schedule_version_state(p_version_id uuid)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select case
           when v.starts_on > public.schedule_today() then 'planned'
           when v.starts_on = (select max(o.starts_on)
                                 from public.schedule_versions o
                                where o.location_code = v.location_code
                                  and o.starts_on <= public.schedule_today()) then 'current'
           else 'past'
         end
    from public.schedule_versions v
   where v.id = p_version_id;
$$;

revoke execute on function public.schedule_version_state(uuid) from public, anon, authenticated, service_role;

-- 8-b. schedule_overlaps(version_id, weekdays, starts, ends, skip_slot)
-- The slots of that schedule on those days whose times overlap, so the
-- app can show the amber note ("Overlaps Group A (5:15-6:00) on Mon").
-- skip_slot = the slot being edited (it doesn't overlap itself).
create or replace function public.schedule_overlaps(
  p_version_id uuid,
  p_weekdays   smallint[],
  p_starts     time,
  p_ends       time,
  p_skip_slot  uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slot_id', s.id, 'weekday', s.weekday, 'class_id', s.class_id, 'class_name', c.name,
           'starts_at', to_char(s.starts_at, 'HH24:MI'), 'ends_at', to_char(s.ends_at, 'HH24:MI'))
           order by s.weekday, s.starts_at), '[]'::jsonb)
    from public.schedule_slots s
    join public.testing_classes c on c.id = s.class_id
   where s.version_id = p_version_id
     and s.weekday = any (p_weekdays)
     and s.id is distinct from p_skip_slot
     and s.starts_at < p_ends
     and s.ends_at > p_starts;
$$;

revoke execute on function public.schedule_overlaps(uuid, smallint[], time, time, uuid) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 9. The seven app functions (the only way to change the schedule)
--
-- Same pattern as 0003 section 8:
--   * returns JSON {"status": ...}:
--       ok, no_access, not_allowed (not an admin, OR the schedule is past
--       / the change isn't allowed for the current one), invalid,
--       not_found, stale, duplicate_date (another schedule of this school
--       already starts that day)
--   * checks in this order: has_data_access() FIRST, then is_admin(),
--     then the input, then locks (school row first, like every 0003
--     write, so all writes in one school take turns), then re-checks,
--     then writes
--   * tags its writes (tkd.action, tkd.batch_id) for change_log
--   * the whole body is in begin ... exception: a table rule that still
--     says no undoes everything and returns a status instead of an error
--       unique (start date)  -> duplicate_date; any other unique -> stale
--       foreign key / check / not-null -> invalid
--       deadlock / serialization / lock not available -> stale
-- ---------------------------------------------------------------------

-- 9a. schedule_add_slots(p_location_code, p_version_id, p_class_id,
--                        p_weekdays, p_starts_at, p_ends_at)
-- Adds one time slot per ticked day. p_version_id = which schedule; NULL
-- only for a school that has no schedule yet: then its first one is made
-- automatically, starting today (the app shows it as "Current schedule").
-- Past schedules can't be changed (not_allowed).
-- Ok: {"status":"ok","version_id":...,"slots":[{"id","weekday","version"}...],
--      "overlaps":[...]}
create or replace function public.schedule_add_slots(
  p_location_code text,
  p_version_id    uuid,
  p_class_id      uuid,
  p_weekdays      smallint[],
  p_starts_at     time,
  p_ends_at       time
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_version_id uuid := p_version_id;
  v_class_loc  text;
  v_overlaps   jsonb;
  v_slots      jsonb;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_location_code is null
       or not exists (select 1 from public.locations l where l.code = p_location_code)
       or p_class_id is null
       or not public.schedule_weekdays_are_valid(p_weekdays)
       or not public.schedule_time_is_valid(p_starts_at, p_ends_at) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform 1 from public.locations l where l.code = p_location_code for no key update;

    -- the class: gone -> stale; other school -> invalid. "for key share"
    -- stops it being deleted until this call has finished.
    select c.location_code into v_class_loc
      from public.testing_classes c
     where c.id = p_class_id
       for key share;
    if not found then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_class_loc <> p_location_code then
      return jsonb_build_object('status', 'invalid');
    end if;

    if v_version_id is null then
      -- "first schedule" only for a school with none at all (else the
      -- screen was out of date: stale)
      if exists (select 1 from public.schedule_versions v where v.location_code = p_location_code) then
        return jsonb_build_object('status', 'stale');
      end if;
    else
      perform 1 from public.schedule_versions v
       where v.id = v_version_id and v.location_code = p_location_code
         for no key update;
      if not found then
        return jsonb_build_object('status', 'not_found');
      end if;
      if public.schedule_version_state(v_version_id) = 'past' then
        return jsonb_build_object('status', 'not_allowed');
      end if;
    end if;

    perform set_config('tkd.action', 'schedule_add_slots', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if v_version_id is null then
      insert into public.schedule_versions (location_code, name, starts_on)
      values (p_location_code, null, public.schedule_today())
      returning id into v_version_id;
    end if;

    -- overlaps with what was already there (before adding)
    v_overlaps := public.schedule_overlaps(v_version_id, p_weekdays, p_starts_at, p_ends_at, null);

    with ins as (
      insert into public.schedule_slots (version_id, location_code, class_id, weekday, starts_at, ends_at)
      select v_version_id, p_location_code, p_class_id, d, p_starts_at, p_ends_at
        from unnest(p_weekdays) as x(d)
      returning id, weekday, version
    )
    select jsonb_agg(jsonb_build_object('id', id, 'weekday', weekday, 'version', version) order by weekday)
      into v_slots
      from ins;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version_id', v_version_id,
                              'slots', v_slots, 'overlaps', v_overlaps);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');   -- e.g. two "first schedules" at once
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.schedule_add_slots(text, uuid, uuid, smallint[], time, time) from public, anon, authenticated, service_role;
grant  execute on function public.schedule_add_slots(text, uuid, uuid, smallint[], time, time) to authenticated;

-- 9b. schedule_update_slot(p_slot_id, p_expected_version, p_class_id,
--                          p_weekday, p_starts_at, p_ends_at)
-- Changes one time slot (class, day, times). Not in a past schedule.
-- Saving unchanged values writes nothing.
-- Ok: {"status":"ok","id":...,"version":n,"overlaps":[...]}
create or replace function public.schedule_update_slot(
  p_slot_id          uuid,
  p_expected_version integer,
  p_class_id         uuid,
  p_weekday          smallint,
  p_starts_at        time,
  p_ends_at          time
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc         text;
  v_version_id  uuid;
  v_version     integer;
  v_class_loc   text;
  v_new_version integer;
  v_overlaps    jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_slot_id is null
       or p_expected_version is null
       or p_class_id is null
       or p_weekday is null
       or p_weekday not between 1 and 7
       or not public.schedule_time_is_valid(p_starts_at, p_ends_at) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select s.location_code into v_loc from public.schedule_slots s where s.id = p_slot_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    select s.version_id, s.version into v_version_id, v_version
      from public.schedule_slots s
     where s.id = p_slot_id
       for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if public.schedule_version_state(v_version_id) = 'past' then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    select c.location_code into v_class_loc
      from public.testing_classes c
     where c.id = p_class_id
       for key share;
    if not found then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_class_loc <> v_loc then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_overlaps := public.schedule_overlaps(v_version_id, array[p_weekday], p_starts_at, p_ends_at, p_slot_id);

    perform set_config('tkd.action', 'schedule_update_slot', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.schedule_slots s
       set class_id  = p_class_id,
           weekday   = p_weekday,
           starts_at = p_starts_at,
           ends_at   = p_ends_at
     where s.id = p_slot_id
       and (s.class_id is distinct from p_class_id
            or s.weekday is distinct from p_weekday
            or s.starts_at is distinct from p_starts_at
            or s.ends_at is distinct from p_ends_at)
    returning s.version into v_new_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', p_slot_id,
                              'version', coalesce(v_new_version, v_version),
                              'overlaps', v_overlaps);
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

revoke execute on function public.schedule_update_slot(uuid, integer, uuid, smallint, time, time) from public, anon, authenticated, service_role;
grant  execute on function public.schedule_update_slot(uuid, integer, uuid, smallint, time, time) to authenticated;

-- 9c. schedule_remove_slot(p_slot_id, p_expected_version)
-- Removes one time slot (not from a past schedule). Returns what it was,
-- so the app's Undo can add it back with schedule_add_slots.
-- Ok: {"status":"ok","removed":{"version_id","class_id","weekday","starts_at","ends_at"}}
create or replace function public.schedule_remove_slot(
  p_slot_id          uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc  text;
  v_slot record;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_slot_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select s.location_code into v_loc from public.schedule_slots s where s.id = p_slot_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    select s.version_id, s.class_id, s.weekday, s.starts_at, s.ends_at, s.version
      into v_slot
      from public.schedule_slots s
     where s.id = p_slot_id
       for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_slot.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if public.schedule_version_state(v_slot.version_id) = 'past' then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    perform set_config('tkd.action', 'schedule_remove_slot', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.schedule_slots s where s.id = p_slot_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'removed', jsonb_build_object(
      'version_id', v_slot.version_id, 'class_id', v_slot.class_id, 'weekday', v_slot.weekday,
      'starts_at', to_char(v_slot.starts_at, 'HH24:MI'), 'ends_at', to_char(v_slot.ends_at, 'HH24:MI')));
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

revoke execute on function public.schedule_remove_slot(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.schedule_remove_slot(uuid, integer) to authenticated;

-- 9d. schedule_plan_version(p_location_code, p_name, p_starts_on, p_copy)
-- Plans a future schedule. p_starts_on must be after today and not the
-- start date of another schedule of this school. p_copy = true copies
-- every time slot of the schedule that runs just before that date (if
-- any); false starts blank.
-- Ok: {"status":"ok","id":...,"version":1,"copied_from":<id or null>,"slot_count":n}
create or replace function public.schedule_plan_version(
  p_location_code text,
  p_name          text,
  p_starts_on     date,
  p_copy          boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name       text;
  v_id         uuid;
  v_version    integer;
  v_source     uuid;
  v_count      integer := 0;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    v_name := public.testing_normalize_name(p_name);
    if v_name = '' then v_name := null; end if;
    if p_location_code is null
       or not exists (select 1 from public.locations l where l.code = p_location_code)
       or p_starts_on is null
       or p_starts_on <= public.schedule_today()
       or p_copy is null
       or not public.schedule_name_is_valid(v_name) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform 1 from public.locations l where l.code = p_location_code for no key update;

    if exists (select 1 from public.schedule_versions v
                where v.location_code = p_location_code and v.starts_on = p_starts_on) then
      return jsonb_build_object('status', 'duplicate_date');
    end if;

    perform set_config('tkd.action', 'schedule_plan_version', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.schedule_versions (location_code, name, starts_on)
    values (p_location_code, v_name, p_starts_on)
    returning id, version into v_id, v_version;

    if p_copy then
      select v.id into v_source
        from public.schedule_versions v
       where v.location_code = p_location_code
         and v.starts_on < p_starts_on
       order by v.starts_on desc
       limit 1;
      if v_source is not null then
        insert into public.schedule_slots (version_id, location_code, class_id, weekday, starts_at, ends_at)
        select v_id, s.location_code, s.class_id, s.weekday, s.starts_at, s.ends_at
          from public.schedule_slots s
         where s.version_id = v_source;
        get diagnostics v_count = row_count;
      end if;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version,
                              'copied_from', v_source, 'slot_count', v_count);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'schedule_versions_location_starts_key' then
        return jsonb_build_object('status', 'duplicate_date');
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

revoke execute on function public.schedule_plan_version(text, text, date, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.schedule_plan_version(text, text, date, boolean) to authenticated;

-- 9e. schedule_update_version(p_version_id, p_expected_version, p_name,
--                             p_starts_on)
-- Renames a schedule and/or moves its start date. Only PLANNED schedules
-- (the current one keeps its date; past ones can't change): not_allowed.
-- The new date must still be after today and free.
-- Ok: {"status":"ok","id":...,"version":n}
create or replace function public.schedule_update_version(
  p_version_id       uuid,
  p_expected_version integer,
  p_name             text,
  p_starts_on        date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name        text;
  v_loc         text;
  v_version     integer;
  v_new_version integer;
  v_constraint  text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    v_name := public.testing_normalize_name(p_name);
    if v_name = '' then v_name := null; end if;
    if p_version_id is null
       or p_expected_version is null
       or p_starts_on is null
       or p_starts_on <= public.schedule_today()
       or not public.schedule_name_is_valid(v_name) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select v.location_code into v_loc from public.schedule_versions v where v.id = p_version_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    select v.version into v_version
      from public.schedule_versions v
     where v.id = p_version_id
       for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if public.schedule_version_state(p_version_id) <> 'planned' then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if exists (select 1 from public.schedule_versions v
                where v.location_code = v_loc and v.starts_on = p_starts_on and v.id <> p_version_id) then
      return jsonb_build_object('status', 'duplicate_date');
    end if;

    perform set_config('tkd.action', 'schedule_update_version', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.schedule_versions v
       set name      = v_name,
           starts_on = p_starts_on
     where v.id = p_version_id
       and (v.name is distinct from v_name or v.starts_on is distinct from p_starts_on)
    returning v.version into v_new_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', p_version_id,
                              'version', coalesce(v_new_version, v_version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'schedule_versions_location_starts_key' then
        return jsonb_build_object('status', 'duplicate_date');
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

revoke execute on function public.schedule_update_version(uuid, integer, text, date) from public, anon, authenticated, service_role;
grant  execute on function public.schedule_update_version(uuid, integer, text, date) to authenticated;

-- 9f. schedule_delete_version(p_version_id, p_expected_version,
--                             p_expected_slot_count)
-- Deletes a PLANNED schedule and its time slots (the confirmation says
-- how many; if that number changed meanwhile: stale). Current and past
-- schedules can't be deleted (not_allowed).
-- Ok: {"status":"ok","removed_slot_count":n}
create or replace function public.schedule_delete_version(
  p_version_id          uuid,
  p_expected_version    integer,
  p_expected_slot_count integer
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
  v_count   integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_version_id is null or p_expected_version is null
       or p_expected_slot_count is null or p_expected_slot_count < 0 then
      return jsonb_build_object('status', 'invalid');
    end if;

    select v.location_code into v_loc from public.schedule_versions v where v.id = p_version_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    select v.version into v_version
      from public.schedule_versions v
     where v.id = p_version_id
       for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if public.schedule_version_state(p_version_id) <> 'planned' then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    perform 1 from public.schedule_slots s where s.version_id = p_version_id order by s.id for update;
    select count(*)::integer into v_count from public.schedule_slots s where s.version_id = p_version_id;
    if v_count <> p_expected_slot_count then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'schedule_delete_version', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.schedule_versions v where v.id = p_version_id;   -- slots follow (cascade)

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'removed_slot_count', v_count);
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

revoke execute on function public.schedule_delete_version(uuid, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.schedule_delete_version(uuid, integer, integer) to authenticated;

-- 9g. schedule_set_class_color(p_class_id, p_color)
-- Sets a class's color on the schedule (adds the row the first time).
-- The same color again writes nothing.
-- Ok: {"status":"ok","class_id":...,"color":...,"version":n}
create or replace function public.schedule_set_class_color(
  p_class_id uuid,
  p_color    text
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
       or p_color is null
       or p_color not in ('gray', 'yellow', 'orange', 'green', 'teal', 'sky', 'purple', 'pink') then
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

    perform set_config('tkd.action', 'schedule_set_class_color', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.schedule_class_colors (class_id, location_code, color)
    values (p_class_id, v_loc, p_color)
    on conflict (class_id) do update
      set color = excluded.color
      where public.schedule_class_colors.color is distinct from excluded.color;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select k.version into v_version from public.schedule_class_colors k where k.class_id = p_class_id;

    return jsonb_build_object('status', 'ok', 'class_id', p_class_id, 'color', p_color, 'version', v_version);
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

revoke execute on function public.schedule_set_class_color(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.schedule_set_class_color(uuid, text) to authenticated;


commit;

-- End of 0005_schedule.sql
