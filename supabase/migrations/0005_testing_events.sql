-- =====================================================================
-- 0005_testing_events.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The fifth database migration for the TKD staff dashboard: Color Belt
--   testing phase 2 (build contract docs/Dashboard Docs/Build contracts/
--   CONTRACT-0005.md, section 1). It runs after 0001-0004 (all live) and
--   does not change anything they made, except that it ADDS columns, rules,
--   triggers and read rights to 0003's public.locations (school addresses).
--
-- WHY IT EXISTS
--   Staff create a testing EVENT for one school, pick which classes test at
--   what time, and get one registration link. Families register one student
--   at a time on a public page (no login). Staff see a roster per class and
--   mark students paid at the desk. Admins enter each school's address in
--   Settings -> Schools (it is shown on the family pages and the flyer).
--   This is the first time anything reaches the database WITHOUT a staff
--   sign-in, so the public part is locked down hard (section 13).
--
-- WHAT IT ADDS
--   1. public.locations: an id, the four address parts, version + "last
--      changed by", a history trigger
--   2. public.testing_events          one testing day for one school
--   3. public.testing_event_classes   the classes testing at an event, with
--                                     their times - a COPY of Classes and
--                                     ranks taken when the class was added
--   4. public.testing_event_ranks     the copied ranks (names, belts, prices)
--   5. public.testing_registrations   one row per registered student
--   6. public.testing_payments        payments, append-only (a mistake is
--                                     fixed by a "reversal" row, never by
--                                     changing or removing a row)
--   7. public.testing_public_attempts every call of the family form, for the
--                                     rate limit (no names, no raw IPs)
--   8. a read-only view public.testing_roster (registrations + their class,
--      belt and payment state, never the signature)
--   9. 14 staff functions + settings_update_school_address (the ONLY way to
--      write), and 2 public functions for the family form
--  10. a restricted login role, testing_registrar, that can run exactly the
--      2 public functions and nothing else (its password is NOT in this
--      file - see supabase/SETUP.md section 12)
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words appear inside rules ("on delete cascade"), inside functions that
--   run later (an admin removing an event or a student; old rate-limit rows
--   being cleaned up) and in "... if exists" lines that make re-running
--   safe. Nothing is removed now. Confirm.
--   (Claude's Supabase connection refuses SQL containing those words, which
--   is why this file is pasted by hand.)
--   Safe to run again: "create table if not exists", "add column if not
--   exists", "create or replace function/view", rules and triggers replaced
--   with "... if exists" + create, the role created only if it is missing.
--   Re-running is only safe UNTIL a later migration changes these objects.
--   NOTE: re-running 0003 AFTER this file would take away the new read
--   rights on public.locations (0003 resets that table's rights). If that
--   ever happens, run this file again.
--   NOTE: migration 0010 (Color Belt grading) REPLACES five functions of
--   this file (testing_update_student, testing_resolve_duplicate,
--   testing_restore_student, testing_add_student, testing_update_event).
--   Re-running THIS file after 0010 would put back the versions without
--   the grading locks: if you ever re-run it, run 0010 again straight
--   after it (supabase/SETUP.md section 14).
--
-- WORDS USED BELOW
--   * "today" = the date in Massachusetts: (now() at time zone
--     'America/New_York')::date. No other time zone is used anywhere.
--   * "event copy": when a class is added to an event, its name, ranks,
--     belts, prices, sparring gear and final award are COPIED into
--     testing_event_classes / testing_event_ranks. Later changes in Classes
--     and ranks never change an event (plan answer 5).
--   * "state" of an event (open, closed ...) is never stored; it is worked
--     out from the dates and the switch by testing_event_state (section 7).
--   * "version", "stale", "lock", "security definer", search_path = '':
--     the same meaning as in 0003 (read its header).
--   * statuses the functions answer: the 0003 set (ok, no_access,
--     not_allowed, not_found, stale, duplicate_name, invalid, not_empty)
--     plus final_award_not_set, rate_limited, not_open, closed, finished,
--     already_paid, withdrawn.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. Small rule helpers (used by the table rules below, so they come
--    first). Nobody in the app can call them.
-- ---------------------------------------------------------------------

-- 1a. testing_line_is_valid(p_text, p_max) - one line of text such as a
-- street or a city: after tidying the spaces (0003's testing_normalize_name)
-- 1 to p_max characters, with no invisible control or format characters
-- (same list as 0003's name rule). NULL -> false.
create or replace function public.testing_line_is_valid(p_text text, p_max integer)
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

revoke execute on function public.testing_line_is_valid(text, integer) from public, anon, authenticated, service_role;

-- 1b. testing_normalize_note(p_note) - the "Note for families" may have
-- several lines, so line breaks are kept. Windows line breaks (\r\n) and
-- lone \r become \n; spaces, tabs and line breaks at the very start and end
-- are removed; nothing left -> NULL (no note).
create or replace function public.testing_normalize_note(p_note text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(replace(replace(p_note, E'\r\n', E'\n'), E'\r', E'\n'), E' \t\n'), '');
$$;

revoke execute on function public.testing_normalize_note(text) from public, anon, authenticated, service_role;

-- 1c. testing_note_is_valid(p_note) - after tidying (1b): 1 to 600
-- characters, no invisible characters except tab and line break.
-- NULL -> false (the table rule allows "no note" separately).
create or replace function public.testing_note_is_valid(p_note text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_note is not null
     and public.testing_normalize_note(p_note) is not null
     and char_length(public.testing_normalize_note(p_note)) <= 600
     and public.testing_normalize_note(p_note)
         !~ '[\x01-\x08\x0b-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]';
$$;

revoke execute on function public.testing_note_is_valid(text) from public, anon, authenticated, service_role;

-- 1d. testing_signature_is_valid(p_signature) - the drawn signature from
-- the family form: a PNG picture written as a "data URL"
--   data:image/png;base64,<letters A-Z a-z 0-9 + /, then up to two "=">
-- at most 70 000 characters in all (plan §8: PNG only, size capped).
-- Anything else (another picture type, HTML, script text) -> false.
-- The length is checked FIRST so a huge value never reaches the pattern.
create or replace function public.testing_signature_is_valid(p_signature text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           char_length(p_signature) <= 70000
           and left(p_signature, 22) = 'data:image/png;base64,'
           and substr(p_signature, 23) ~ '^[A-Za-z0-9+/]+={0,2}$',
         false);
$$;

revoke execute on function public.testing_signature_is_valid(text) from public, anon, authenticated, service_role;

-- 1e. testing_school_date(p_at) / testing_today() - "which date is it at
-- the school?" (America/New_York, so 11:59:59 PM on Nov 13 is still Nov 13
-- even though it is already Nov 14 in UTC). testing_today() is the date
-- right now; every function uses it. Mirrored by eventRules.todayInSchoolTime.
create or replace function public.testing_school_date(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'America/New_York')::date;
$$;

revoke execute on function public.testing_school_date(timestamptz) from public, anon, authenticated, service_role;

create or replace function public.testing_today()
returns date
language sql
stable
set search_path = ''
as $$
  select public.testing_school_date(now());
$$;

revoke execute on function public.testing_today() from public, anon, authenticated, service_role;

-- 1f. testing_fee_cents(early, day, paid_on, testing_date) - what a rank
-- costs when paid on a given date: the early price BEFORE the testing day,
-- the testing-day price on it (and after). Mirrored by eventRules.feeFor.
create or replace function public.testing_fee_cents(
  p_early_cents  integer,
  p_day_cents    integer,
  p_paid_on      date,
  p_testing_date date
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_paid_on < p_testing_date then p_early_cents else p_day_cents end;
$$;

revoke execute on function public.testing_fee_cents(integer, integer, date, date) from public, anon, authenticated, service_role;

-- 1g. testing_new_public_code() - a new random link code for an event:
-- 8 characters from a-z and 2-9 without the look-alikes i, l and o
-- (31 characters, about 850 billion possible codes), so it can be typed
-- from a flyer and can't be guessed from the event's id.
-- Randomness: the bytes of a new random uuid (core gen_random_uuid(), not
-- pgcrypto). Bytes 6 and 8 of a uuid carry fixed "version" bits, so they
-- are skipped; bytes 248-255 are skipped too, so every character is
-- exactly equally likely (248 = 8 x 31).
create or replace function public.testing_new_public_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_code  text := '';
  v_bytes bytea;
  v_i     integer;
  v_b     integer;
begin
  while char_length(v_code) < 8 loop
    v_bytes := uuid_send(gen_random_uuid());
    for v_i in 0 .. 15 loop
      continue when v_i in (6, 8);
      v_b := get_byte(v_bytes, v_i);
      continue when v_b >= 248;
      v_code := v_code || substr(v_alphabet, (v_b % 31) + 1, 1);
      exit when char_length(v_code) = 8;
    end loop;
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.testing_new_public_code() from public, anon, authenticated, service_role;

-- 1h. testing_classes_arg_is_valid(p_classes) - the "Classes testing" list
-- the Add / Edit event dialog sends:
--   [{"class_id": "<uuid>", "start_time": "17:00", "end_time": "18:00"}, ...]
-- true only if it is a list of 1 to 50 such objects, every class_id is a
-- uuid written out in full, every time is "HH:MM" (or "HH:MM:SS") on a
-- 24-hour clock, the end is after the start, and no class is listed twice.
-- Everything is checked with patterns BEFORE converting, so bad input
-- gives false instead of an error.
create or replace function public.testing_classes_arg_is_valid(p_classes jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ids  uuid[] := '{}';
  v_id   uuid;
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_time constant text := '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$';
begin
  if p_classes is null
     or jsonb_typeof(p_classes) <> 'array'
     or jsonb_array_length(p_classes) not between 1 and 50 then
    return false;
  end if;
  for v_item in select x.value from jsonb_array_elements(p_classes) as x(value) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'class_id') is distinct from 'string'
       or jsonb_typeof(v_item -> 'start_time') is distinct from 'string'
       or jsonb_typeof(v_item -> 'end_time') is distinct from 'string'
       or (v_item ->> 'class_id') !~ v_uuid
       or (v_item ->> 'start_time') !~ v_time
       or (v_item ->> 'end_time') !~ v_time then
      return false;
    end if;
    v_id := (v_item ->> 'class_id')::uuid;
    if (v_item ->> 'end_time')::time <= (v_item ->> 'start_time')::time
       or v_id = any (v_ids) then
      return false;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return true;
end;
$$;

revoke execute on function public.testing_classes_arg_is_valid(jsonb) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. public.locations (from 0003) - school addresses (Settings -> Schools)
--   * id: a uuid for each school, because the history table records every
--     changed row by a uuid (change_log.record_id).
--   * the address: street (up to 100 characters), city (up to 60), state
--     (2 capital letters, e.g. MA) and ZIP (12345 or 12345-6789). All four
--     are set or all four are empty: an empty address means the family
--     pages and the flyer show just the school name.
--   * version / updated_*: "last changed by", kept by a trigger (2b). The
--     version goes up only when the address (or the name) changes.
--   Adding columns rewrites the 2 rows once but runs no triggers, so it
--   writes no history rows. Each existing school gets its own new id.
-- ---------------------------------------------------------------------
alter table public.locations
  add column if not exists id              uuid        not null default gen_random_uuid(),
  add column if not exists address_street  text        null,
  add column if not exists address_city    text        null,
  add column if not exists address_state   text        null,
  add column if not exists address_zip     text        null,
  add column if not exists version         integer     not null default 1,
  add column if not exists updated_at      timestamptz null,
  add column if not exists updated_by      uuid        null,   -- login id; no foreign key on purpose (as 0003)
  add column if not exists updated_by_name text        null;

alter table public.locations drop constraint if exists locations_id_key;
alter table public.locations add constraint locations_id_key unique (id);

alter table public.locations drop constraint if exists locations_address_street_check;
alter table public.locations add constraint locations_address_street_check
  check (address_street is null
         or coalesce(public.testing_line_is_valid(address_street, 100)
                     and address_street = public.testing_normalize_name(address_street), false));

alter table public.locations drop constraint if exists locations_address_city_check;
alter table public.locations add constraint locations_address_city_check
  check (address_city is null
         or coalesce(public.testing_line_is_valid(address_city, 60)
                     and address_city = public.testing_normalize_name(address_city), false));

alter table public.locations drop constraint if exists locations_address_state_check;
alter table public.locations add constraint locations_address_state_check
  check (address_state is null or address_state ~ '^[A-Z]{2}$');

alter table public.locations drop constraint if exists locations_address_zip_check;
alter table public.locations add constraint locations_address_zip_check
  check (address_zip is null or address_zip ~ '^[0-9]{5}(-[0-9]{4})?$');

-- num_nulls counts how many of the four are empty: 0 (all set) or 4 (none).
alter table public.locations drop constraint if exists locations_address_all_or_none_check;
alter table public.locations add constraint locations_address_all_or_none_check
  check (num_nulls(address_street, address_city, address_state, address_zip) in (0, 4));

alter table public.locations drop constraint if exists locations_version_check;
alter table public.locations add constraint locations_version_check check (version >= 1);

comment on column public.locations.address_street is
  'School street address for family pages and the flyer. All four address parts are set or all empty. Changed only by settings_update_school_address.';

-- 2b. testing_locations_before_write() - BEFORE INSERT OR UPDATE on locations
-- code and id never change; an address (or name) change bumps the version
-- and stamps "last changed by"; anything else keeps them as they were.
create or replace function public.testing_locations_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version         := 1;
    new.updated_at      := null;
    new.updated_by      := null;
    new.updated_by_name := null;
    return new;
  end if;

  if new.code is distinct from old.code or new.id is distinct from old.id then
    raise exception using
      errcode    = '23514',
      constraint = 'locations_immutable',
      message    = 'a school''s code and id can''t change';
  end if;

  if new.name is distinct from old.name
     or new.address_street is distinct from old.address_street
     or new.address_city is distinct from old.address_city
     or new.address_state is distinct from old.address_state
     or new.address_zip is distinct from old.address_zip then
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

revoke execute on function public.testing_locations_before_write() from public, anon, authenticated, service_role;

drop trigger if exists locations_before_write on public.locations;
create trigger locations_before_write
  before insert or update on public.locations
  for each row
  execute function public.testing_locations_before_write();

-- History: 0003's change_log_write (it reads "id" and "location_code"
-- from the row; this table's school column is called "code", so the
-- history's location_code stays empty for these rows - accepted).
drop trigger if exists locations_log on public.locations;
create trigger locations_log
  after insert or update or delete on public.locations
  for each row
  execute function public.change_log_write();


-- ---------------------------------------------------------------------
-- 3. public.testing_events - one testing day for one school
--   * name: same rule as class names; unique per school ignoring capitals
--     and extra spaces (the index below)
--   * registration_open: the Open / Closed switch. New events start Closed
--     unless the admin opened registration in the Add event dialog.
--   * auto_close_on: registration closes by itself at the END of this day
--     (11:59:59 PM Massachusetts time). Never after the testing date.
--   * first_opened_at: when registration was opened the first time (an
--     event never opened shows "Not open yet")
--   * public_code: the code in the family link /register/<code> (1g). Made
--     by the database, never changes.
--   * note: the "Note for families" (optional, up to 600 characters)
-- ---------------------------------------------------------------------
create table if not exists public.testing_events (
  id                uuid        not null default gen_random_uuid(),
  location_code     text        not null,
  name              text        not null,
  testing_date      date        not null,
  registration_open boolean     not null default false,
  auto_close_on     date        null,
  first_opened_at   timestamptz null,
  public_code       text        not null,
  note              text        null,
  version           integer     not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid        null,          -- no foreign key on purpose (as 0003)
  updated_by        uuid        null,
  created_by_name   text        not null,      -- set by the trigger (section 9)
  updated_by_name   text        not null,

  constraint testing_events_pkey primary key (id),
  constraint testing_events_location_fk
    foreign key (location_code) references public.locations (code),
  constraint testing_events_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint testing_events_auto_close_check
    check (auto_close_on is null or auto_close_on <= testing_date),
  constraint testing_events_opened_check
    check (not registration_open or first_opened_at is not null),
  constraint testing_events_public_code_key unique (public_code),
  constraint testing_events_public_code_check
    check (public_code ~ '^[a-hjkmnp-z2-9]{8}$'),
  constraint testing_events_note_check
    check (note is null
           or coalesce(public.testing_note_is_valid(note) and note = public.testing_normalize_note(note), false)),
  constraint testing_events_version_check check (version >= 1)
);

-- One name per school, ignoring capital letters and extra spaces.
create unique index if not exists testing_events_location_lower_name_idx
  on public.testing_events (location_code, lower(public.testing_normalize_name(name)));

-- The Events list reads one school at a time, by date.
create index if not exists testing_events_location_date_idx
  on public.testing_events (location_code, testing_date);

comment on table public.testing_events is
  'Color Belt testing events, one school each. State (open, closed ...) is derived by testing_event_state, never stored. Written only through the testing_* functions.';
comment on column public.testing_events.public_code is
  'Code in the family link /register/<code>: 8 characters a-z and 2-9 without i, l, o. Random, made by the database, never changes.';


-- ---------------------------------------------------------------------
-- 4. public.testing_event_classes and public.testing_event_ranks - the
--    event's own COPY of Classes and ranks (Q3, Q5, plan answer 5)
--   * class_id / rank_id: which class / rank it was copied from. No
--     foreign key on purpose: the class may later be renamed or removed in
--     Classes and ranks without touching the event.
--   * start_time / end_time: when that class tests (end after start). The
--     only thing that can change after the copy.
--   * final award copy: "rank" (its name + belt) or "none" (No new rank).
--     A class whose final award is Not set can't be added (the functions
--     answer final_award_not_set).
--   Removing an event removes its copies ("on delete cascade").
-- ---------------------------------------------------------------------
create table if not exists public.testing_event_classes (
  id                       uuid    not null default gen_random_uuid(),
  event_id                 uuid    not null,
  class_id                 uuid    not null,
  class_name               text    not null,
  position                 integer not null,
  start_time               time    not null,
  end_time                 time    not null,
  final_award_kind         text    not null,   -- 'rank' or 'none'
  final_award_name         text    null,
  fa_belt_pattern          text    null,       -- the final award's belt (NULL for none)
  fa_belt_color            text    null,
  fa_belt_color_2          text    null,
  fa_belt_end_stripes      integer null,
  fa_belt_end_stripe_color text    null,

  constraint testing_event_classes_pkey primary key (id),
  constraint testing_event_classes_event_fk
    foreign key (event_id) references public.testing_events (id) on delete cascade,
  constraint testing_event_classes_event_class_key unique (event_id, class_id),
  constraint testing_event_classes_name_check
    check (coalesce(public.testing_name_is_valid(class_name) and class_name = public.testing_normalize_name(class_name), false)),
  constraint testing_event_classes_position_check check (position >= 0),
  constraint testing_event_classes_times_check check (end_time > start_time),
  constraint testing_event_classes_award_check
    check (case final_award_kind
             when 'none' then final_award_name is null
                          and num_nonnulls(fa_belt_pattern, fa_belt_color, fa_belt_color_2,
                                           fa_belt_end_stripes, fa_belt_end_stripe_color) = 0
             when 'rank' then coalesce(public.testing_name_is_valid(final_award_name)
                                       and final_award_name = public.testing_normalize_name(final_award_name)
                                       and public.testing_belt_is_valid(fa_belt_pattern, fa_belt_color, fa_belt_color_2,
                                                                        fa_belt_end_stripes, fa_belt_end_stripe_color), false)
             else false
           end)
);

create table if not exists public.testing_event_ranks (
  id                    uuid    not null default gen_random_uuid(),
  event_class_id        uuid    not null,
  rank_id               uuid    not null,
  name                  text    not null,
  position              integer not null,
  belt_pattern          text    not null,
  belt_color            text    not null,
  belt_color_2          text    null,
  belt_end_stripes      integer not null,
  belt_end_stripe_color text    not null,
  early_cents           integer not null,
  day_cents             integer not null,
  private_cents         integer not null,   -- copied, not used in phase 2
  sparring_gear         boolean not null,

  constraint testing_event_ranks_pkey primary key (id),
  constraint testing_event_ranks_class_fk
    foreign key (event_class_id) references public.testing_event_classes (id) on delete cascade,
  constraint testing_event_ranks_class_position_key unique (event_class_id, position),
  constraint testing_event_ranks_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint testing_event_ranks_position_check check (position >= 0),
  constraint testing_event_ranks_cents_check
    check (public.testing_cents_is_valid(early_cents)
           and public.testing_cents_is_valid(day_cents)
           and public.testing_cents_is_valid(private_cents)),
  constraint testing_event_ranks_belt_check
    check (public.testing_belt_is_valid(belt_pattern, belt_color, belt_color_2,
                                        belt_end_stripes, belt_end_stripe_color))
);

comment on table public.testing_event_classes is
  'The classes testing at an event: a copy of Classes and ranks taken when the class was added (plus its times). Only the times ever change.';
comment on table public.testing_event_ranks is
  'The ranks of an event class: a copy (names, belts, prices, sparring gear). Never changed after the copy.';


-- ---------------------------------------------------------------------
-- 5. public.testing_registrations - one row per registered student
--   * event_rank_id: the student's CURRENT belt in the event copy (the
--     class follows from it). Must be a rank of the same event (checked by
--     the trigger in section 9 and by every function).
--   * names: same rule as class names, up to 60 characters each.
--   * paying_by: cash / check / card (the family form allows cash or check;
--     staff may change it to card).
--   * stripes_confirmed: the "3 stripes" tick (Q4) - always true.
--   * source: 'form' (the family form) or 'staff' (Add student).
--   * reference: "CB-3101", "CB-3102" ... from a counter, shown to the
--     family. Sequential, so there is never a public lookup by reference.
--   * submission_id: a random id the family's browser makes once per send;
--     a retry with the same id returns the same registration (no doubles).
--   * signature: the drawn signature (form only), a PNG data URL (1d).
--     NO client role can ever read this column. Removed automatically 90
--     days after the testing date (signature_deleted_at says when).
--   * ack_version: which confirmation wording the family ticked.
--   * status: 'active' or 'withdrawn' (withdrawn_reason: 'withdrawn' by an
--     admin, or 'duplicate_copy' when a possible duplicate was resolved).
--   * withdrawn_by: the login id of whoever withdrew it (null while
--     active). NOT readable by the app (a login id, like created_by); the
--     database uses it for the staff Undo after "keep one" (14o).
--   * duplicate_state: 'none', 'possible' (another active registration in
--     this event has the same name - duplicate_of points at it) or
--     'kept_both' (staff said both are real; duplicate_of = the other one).
-- Holds only students' names + belt + payment method: no date of birth,
-- email, phone, address or medical details (Q5).
-- ---------------------------------------------------------------------
create sequence if not exists public.testing_registration_ref_seq
  as bigint
  start with 3101;

create table if not exists public.testing_registrations (
  id                   uuid        not null default gen_random_uuid(),
  event_id             uuid        not null,
  event_rank_id        uuid        not null,
  first_name           text        not null,
  last_name            text        not null,
  paying_by            text        not null,
  stripes_confirmed    boolean     not null,
  source               text        not null,
  reference            text        not null default ('CB-' || nextval('public.testing_registration_ref_seq'::regclass)::text),
  submission_id        uuid        null,
  signature            text        null,
  signed_at            timestamptz null,
  signature_deleted_at timestamptz null,
  ack_version          text        null,
  registered_at        timestamptz not null default now(),
  status               text        not null default 'active',
  withdrawn_reason     text        null,
  withdrawn_at         timestamptz null,
  withdrawn_by_name    text        null,
  withdrawn_by         uuid        null,          -- login id; no foreign key on purpose (as 0003)
  duplicate_state      text        not null default 'none',
  duplicate_of         uuid        null,
  version              integer     not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid        null,
  updated_by           uuid        null,
  created_by_name      text        not null,
  updated_by_name      text        not null,

  constraint testing_registrations_pkey primary key (id),
  constraint testing_registrations_event_fk
    foreign key (event_id) references public.testing_events (id) on delete cascade,
  -- "no action": a rank copy is only ever removed together with its event,
  -- and then its registrations go in the same step
  constraint testing_registrations_rank_fk
    foreign key (event_rank_id) references public.testing_event_ranks (id),
  constraint testing_registrations_duplicate_fk
    foreign key (duplicate_of) references public.testing_registrations (id) on delete set null,
  constraint testing_registrations_first_name_check
    check (coalesce(public.testing_name_is_valid(first_name) and first_name = public.testing_normalize_name(first_name), false)),
  constraint testing_registrations_last_name_check
    check (coalesce(public.testing_name_is_valid(last_name) and last_name = public.testing_normalize_name(last_name), false)),
  constraint testing_registrations_paying_by_check check (paying_by in ('cash', 'check', 'card')),
  constraint testing_registrations_stripes_check check (stripes_confirmed),
  constraint testing_registrations_source_check check (source in ('form', 'staff')),
  constraint testing_registrations_reference_key unique (reference),
  constraint testing_registrations_reference_check check (reference ~ '^CB-[0-9]{4,}$'),
  constraint testing_registrations_submission_id_key unique (submission_id),
  constraint testing_registrations_signature_check
    check (signature is null or public.testing_signature_is_valid(signature)),
  -- staff-added rows have none of the form's fields
  constraint testing_registrations_staff_fields_check
    check (source = 'form'
           or num_nonnulls(submission_id, signature, signed_at, signature_deleted_at, ack_version) = 0),
  -- form rows always have them; the signature is there OR was removed later
  constraint testing_registrations_form_fields_check
    check (source = 'staff'
           or (submission_id is not null and signed_at is not null and ack_version is not null
               and (signature is null) = (signature_deleted_at is not null))),
  constraint testing_registrations_status_check
    check ((status = 'active' and num_nonnulls(withdrawn_reason, withdrawn_at, withdrawn_by_name, withdrawn_by) = 0)
           or (status = 'withdrawn' and withdrawn_reason in ('withdrawn', 'duplicate_copy')
               and withdrawn_at is not null and withdrawn_by_name is not null)),
  constraint testing_registrations_duplicate_state_check
    check (duplicate_state in ('none', 'possible', 'kept_both')),
  constraint testing_registrations_duplicate_self_check check (duplicate_of is distinct from id),
  constraint testing_registrations_version_check check (version >= 1)
);

-- withdrawn_by came after the first draft of this file: added here too (and
-- the status rule replaced) so a database that already has the table gets
-- it as well. On a fresh install both lines change nothing.
alter table public.testing_registrations add column if not exists withdrawn_by uuid null;
alter table public.testing_registrations drop constraint if exists testing_registrations_status_check;
alter table public.testing_registrations add constraint testing_registrations_status_check
  check ((status = 'active' and num_nonnulls(withdrawn_reason, withdrawn_at, withdrawn_by_name, withdrawn_by) = 0)
         or (status = 'withdrawn' and withdrawn_reason in ('withdrawn', 'duplicate_copy')
             and withdrawn_at is not null and withdrawn_by_name is not null));

create index if not exists testing_registrations_event_idx      on public.testing_registrations (event_id);
create index if not exists testing_registrations_rank_idx       on public.testing_registrations (event_rank_id);
create index if not exists testing_registrations_duplicate_idx  on public.testing_registrations (duplicate_of) where duplicate_of is not null;
create index if not exists testing_registrations_names_idx      on public.testing_registrations (event_id, lower(last_name), lower(first_name));

comment on table public.testing_registrations is
  'Registered students per event (names, belt, paying by). signature is never readable by any client role and is removed 90 days after the testing date.';
comment on column public.testing_registrations.signature is
  'Drawn signature (family form only): data:image/png;base64,..., at most 70000 characters. Never granted to a client role; never copied into change_log.';


-- ---------------------------------------------------------------------
-- 6. public.testing_payments - append-only
--   * kind 'payment': amount 1 cent to $1,000 (amount_cents > 0)
--   * kind 'reversal': undoes one payment: exactly minus its amount,
--     reverses_payment_id = that payment (unique, so a payment is reversed
--     at most once; a reversal can't itself be reversed - section 9)
--   * paid_on: the school date it was paid; recorded_at/by: when and who
--   Rows are never changed or removed (section 9), except that removing a
--   registration or an event removes its payments with it (plan answer 8).
--   "Paid" = the registration's amounts add up to more than 0.
-- ---------------------------------------------------------------------
create table if not exists public.testing_payments (
  id                  uuid        not null default gen_random_uuid(),
  registration_id     uuid        not null,
  kind                text        not null,
  amount_cents        integer     not null,
  method              text        not null,
  paid_on             date        not null,
  recorded_at         timestamptz not null default now(),
  recorded_by         uuid        null,       -- login id; not readable by the app
  recorded_by_name    text        not null,
  reverses_payment_id uuid        null,

  constraint testing_payments_pkey primary key (id),
  constraint testing_payments_registration_fk
    foreign key (registration_id) references public.testing_registrations (id) on delete cascade,
  constraint testing_payments_reverses_fk
    foreign key (reverses_payment_id) references public.testing_payments (id),
  constraint testing_payments_reverses_key unique (reverses_payment_id),
  constraint testing_payments_kind_check
    check ((kind = 'payment' and amount_cents between 1 and 100000 and reverses_payment_id is null)
           or (kind = 'reversal' and amount_cents between -100000 and -1 and reverses_payment_id is not null)),
  constraint testing_payments_method_check check (method in ('cash', 'check', 'card'))
);

create index if not exists testing_payments_registration_idx on public.testing_payments (registration_id);

comment on table public.testing_payments is
  'Testing payments, append-only: corrections are reversal rows. Removed only together with their registration or event.';


-- ---------------------------------------------------------------------
-- 7. public.testing_public_attempts - one row per call of the family form
--   client_key: an HMAC made by the Cloudflare Function from the date and
--   the visitor's IP address with a secret - never the raw IP. Used only to
--   count tries per hour (rate limit). Rows older than 2 days are removed
--   by testing_public_register itself. Nobody in the app can read it; it is
--   not part of the history (no value, and its id is a number).
-- ---------------------------------------------------------------------
create table if not exists public.testing_public_attempts (
  id         bigint      generated always as identity,
  client_key text        not null,
  event_id   uuid        null,       -- no foreign key: the attempt outlives a removed event
  at         timestamptz not null default now(),
  outcome    text        not null,   -- the status the call answered (ok, invalid, rate_limited ...)

  constraint testing_public_attempts_pkey primary key (id)
);

create index if not exists testing_public_attempts_client_idx on public.testing_public_attempts (client_key, at);
create index if not exists testing_public_attempts_event_idx  on public.testing_public_attempts (event_id, at);
create index if not exists testing_public_attempts_at_idx     on public.testing_public_attempts (at);

comment on table public.testing_public_attempts is
  'Rate-limit ledger for the family form (hashed client key, never a raw IP). Not readable by any client role; kept 2 days.';


-- ---------------------------------------------------------------------
-- 8. The event state and "testing for" (shared by every function)
-- ---------------------------------------------------------------------

-- 8a. testing_event_state(event, today) - where registration stands,
-- checked in this exact order (contract §1.3; eventRules.eventState is the
-- same code in JavaScript):
--   'finished'       today is after the testing date
--   'open'           switched on and the closing date (if any) not passed -
--                    includes the testing day itself (Star v0.88)
--   'closed_by_date' switched on, but today is after the closing date
--   'not_open_yet'   never opened (also when its closing date passed
--                    without ever opening)
--   'closed'         closed by hand
create or replace function public.testing_event_state(p_event public.testing_events, p_today date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_today > (p_event).testing_date then 'finished'
           when (p_event).registration_open
                and ((p_event).auto_close_on is null or p_today <= (p_event).auto_close_on) then 'open'
           when (p_event).registration_open then 'closed_by_date'
           when (p_event).first_opened_at is null then 'not_open_yet'
           else 'closed'
         end;
$$;

revoke execute on function public.testing_event_state(public.testing_events, date) from public, anon, authenticated, service_role;

-- 8b. testing_rank_testing_for(event_rank_id) - what a student on this
-- rank tests for: the next rank of the same event class; for the class's
-- last rank its final award copy; NULL for a final award of "none" (No new
-- rank). Returned as {name, belt_pattern, belt_color, belt_color_2,
-- belt_end_stripes, belt_end_stripe_color} (eventRules.testingFor).
create or replace function public.testing_rank_testing_for(p_event_rank_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
           when n.id is not null then
             jsonb_build_object('name', n.name,
                                'belt_pattern', n.belt_pattern, 'belt_color', n.belt_color,
                                'belt_color_2', n.belt_color_2, 'belt_end_stripes', n.belt_end_stripes,
                                'belt_end_stripe_color', n.belt_end_stripe_color)
           when c.final_award_kind = 'rank' then
             jsonb_build_object('name', c.final_award_name,
                                'belt_pattern', c.fa_belt_pattern, 'belt_color', c.fa_belt_color,
                                'belt_color_2', c.fa_belt_color_2, 'belt_end_stripes', c.fa_belt_end_stripes,
                                'belt_end_stripe_color', c.fa_belt_end_stripe_color)
         end
    from public.testing_event_ranks k
    join public.testing_event_classes c on c.id = k.event_class_id
    left join lateral (select x.id, x.name, x.belt_pattern, x.belt_color, x.belt_color_2,
                              x.belt_end_stripes, x.belt_end_stripe_color
                         from public.testing_event_ranks x
                        where x.event_class_id = k.event_class_id
                          and x.position > k.position
                        order by x.position
                        limit 1) as n on true
   where k.id = p_event_rank_id;
$$;

revoke execute on function public.testing_rank_testing_for(uuid) from public, anon, authenticated, service_role;

-- 8c. testing_location_address(code) - a school's address as
-- {street, city, state, zip}, or NULL when it hasn't been entered.
create or replace function public.testing_location_address(p_code text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when l.address_street is null then null
              else jsonb_build_object('street', l.address_street, 'city', l.address_city,
                                      'state', l.address_state, 'zip', l.address_zip)
         end
    from public.locations l
   where l.code = p_code;
$$;

revoke execute on function public.testing_location_address(text) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 9. Trigger functions (run automatically on every write)
-- ---------------------------------------------------------------------

-- 9a. testing_events_before_write() - BEFORE INSERT OR UPDATE on events
--   insert: version 1, created/updated stamps = now + who
--   update: id, location_code and public_code never change (error);
--           a content change (name, date, switch, closing date, first
--           opened, note) bumps the version and stamps "last changed by".
--           A function may also ask for a bump on purpose by writing
--           version + 1 (Edit event changing only class times does that, so
--           a second admin's dialog gets "stale"). Otherwise nothing moves.
create or replace function public.testing_events_before_write()
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
     or new.public_code is distinct from old.public_code then
    raise exception using
      errcode    = '23514',
      constraint = 'testing_events_immutable',
      message    = 'an event''s id, location_code and public_code can''t change';
  end if;

  new.created_at      := old.created_at;
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;

  if new.name is distinct from old.name
     or new.testing_date is distinct from old.testing_date
     or new.registration_open is distinct from old.registration_open
     or new.auto_close_on is distinct from old.auto_close_on
     or new.first_opened_at is distinct from old.first_opened_at
     or new.note is distinct from old.note
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

revoke execute on function public.testing_events_before_write() from public, anon, authenticated, service_role;

-- 9b. testing_event_copies_before_write() - BEFORE UPDATE on the two copy
-- tables: "nothing ever updates the copy afterwards" (contract §1.4).
-- On testing_event_classes only start_time and end_time may change; on
-- testing_event_ranks nothing may.
create or replace function public.testing_event_copies_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'testing_event_classes'
     and (to_jsonb(new) - array['start_time', 'end_time']) = (to_jsonb(old) - array['start_time', 'end_time']) then
    return new;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = tg_table_name || '_immutable',
    message    = 'the event copy can''t change (only a class''s times can)';
end;
$$;

revoke execute on function public.testing_event_copies_before_write() from public, anon, authenticated, service_role;

-- 9c. testing_registrations_before_write() - BEFORE INSERT OR UPDATE
--   both:   the rank must belong to THIS event (a rank of another event is
--           refused even if someone writes the table directly)
--   insert: version 1, stamps; registered_at = now
--   update: id, event, source, reference, submission_id, registered_at,
--           signed_at and ack_version never change; the signature can only
--           be REMOVED (never replaced) and its removal time set once.
--           A change to ONLY signature / signature_deleted_at (the 90-day
--           clean-up) keeps the version and "last changed by" as they were.
--           Any other change - or a function writing version + 1 on purpose
--           (Mark paid / Undo payment, so a double click gets "stale") -
--           bumps the version.
create or replace function public.testing_registrations_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1
                   from public.testing_event_ranks k
                   join public.testing_event_classes c on c.id = k.event_class_id
                  where k.id = new.event_rank_id
                    and c.event_id = new.event_id) then
    raise exception using
      errcode    = '23514',
      constraint = 'testing_registrations_rank_event',
      message    = 'the rank must belong to the registration''s event';
  end if;

  if tg_op = 'INSERT' then
    new.registered_at   := now();
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
     or new.event_id is distinct from old.event_id
     or new.source is distinct from old.source
     or new.reference is distinct from old.reference
     or new.submission_id is distinct from old.submission_id
     or new.registered_at is distinct from old.registered_at
     or new.signed_at is distinct from old.signed_at
     or new.ack_version is distinct from old.ack_version
     or (new.signature is distinct from old.signature and new.signature is not null)
     or (new.signature_deleted_at is distinct from old.signature_deleted_at and old.signature_deleted_at is not null) then
    raise exception using
      errcode    = '23514',
      constraint = 'testing_registrations_immutable',
      message    = 'this part of a registration can''t change';
  end if;

  new.created_at      := old.created_at;
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;

  -- "anything except the signature columns and the bookkeeping" changed?
  if (to_jsonb(new) - array['signature', 'signature_deleted_at', 'version', 'updated_at', 'updated_by', 'updated_by_name'])
       is distinct from
     (to_jsonb(old) - array['signature', 'signature_deleted_at', 'version', 'updated_at', 'updated_by', 'updated_by_name'])
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

revoke execute on function public.testing_registrations_before_write() from public, anon, authenticated, service_role;

-- 9d. testing_registrations_log() - AFTER INSERT OR UPDATE OR DELETE on
-- registrations: the same history row as 0003's change_log_write, EXCEPT
--   * the signature is never copied: it shows as "on file" (there is one)
--     or null (there is none), so the history holds no picture at all;
--   * submission_id is left out (handoff §6: nothing sensitive in the log).
-- An update that changed nothing visible after that writes no row.
-- security definer so it can write to change_log, which nobody else can.
create or replace function public.testing_registrations_log()
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
    v_old := (to_jsonb(old) - 'submission_id')
             || jsonb_build_object('signature', case when old.signature is null then null else 'on file' end);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := (to_jsonb(new) - 'submission_id')
             || jsonb_build_object('signature', case when new.signature is null then null else 'on file' end);
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
     (v_row ->> 'id')::uuid,
     null,
     lower(tg_op),
     v_before,
     v_after);
  return null;
end;
$$;

revoke execute on function public.testing_registrations_log() from public, anon, authenticated, service_role;

-- 9e. testing_payments_guard() - keeps payments append-only
--   BEFORE INSERT: a reversal must undo a real PAYMENT (not a reversal) of
--                  the same registration, for exactly minus its amount
--   BEFORE UPDATE: always refused
--   BEFORE DELETE: refused, EXCEPT when it is part of removing a whole
--                  registration or event ("on delete cascade" runs it from
--                  inside another trigger, so pg_trigger_depth() > 1), or
--                  inside testing_delete_student / testing_delete_event
-- Limit: the database owner could switch this trigger off on purpose; it
-- stops mistakes and the app, not a deliberate owner.
create or replace function public.testing_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reversed public.testing_payments;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'reversal' then
      select * into v_reversed from public.testing_payments p where p.id = new.reverses_payment_id;
      if not found
         or v_reversed.kind <> 'payment'
         or v_reversed.registration_id <> new.registration_id
         or new.amount_cents <> -v_reversed.amount_cents then
        raise exception using
          errcode    = '23514',
          constraint = 'testing_payments_reversal_check',
          message    = 'a reversal must undo one payment of the same registration, for exactly minus its amount';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE'
     and (pg_trigger_depth() > 1
          or coalesce(current_setting('tkd.action', true), '') in ('delete_student', 'delete_event')) then
    return old;
  end if;

  raise exception 'testing_payments is append-only (use a reversal)';
end;
$$;

revoke execute on function public.testing_payments_guard() from public, anon, authenticated, service_role;

-- 9f. Attach the triggers ("drop trigger if exists" + create = replace).
drop trigger if exists testing_events_before_write on public.testing_events;
create trigger testing_events_before_write
  before insert or update on public.testing_events
  for each row execute function public.testing_events_before_write();

drop trigger if exists testing_event_classes_before_write on public.testing_event_classes;
create trigger testing_event_classes_before_write
  before update on public.testing_event_classes
  for each row execute function public.testing_event_copies_before_write();

drop trigger if exists testing_event_ranks_before_write on public.testing_event_ranks;
create trigger testing_event_ranks_before_write
  before update on public.testing_event_ranks
  for each row execute function public.testing_event_copies_before_write();

drop trigger if exists testing_registrations_before_write on public.testing_registrations;
create trigger testing_registrations_before_write
  before insert or update on public.testing_registrations
  for each row execute function public.testing_registrations_before_write();

drop trigger if exists testing_payments_guard on public.testing_payments;
create trigger testing_payments_guard
  before insert or update or delete on public.testing_payments
  for each row execute function public.testing_payments_guard();

-- History: 0003's change_log_write for events, the copies and payments;
-- the registrations' own version (9d) for registrations.
drop trigger if exists testing_events_log on public.testing_events;
create trigger testing_events_log
  after insert or update or delete on public.testing_events
  for each row execute function public.change_log_write();

drop trigger if exists testing_event_classes_log on public.testing_event_classes;
create trigger testing_event_classes_log
  after insert or update or delete on public.testing_event_classes
  for each row execute function public.change_log_write();

drop trigger if exists testing_event_ranks_log on public.testing_event_ranks;
create trigger testing_event_ranks_log
  after insert or update or delete on public.testing_event_ranks
  for each row execute function public.change_log_write();

drop trigger if exists testing_registrations_log on public.testing_registrations;
create trigger testing_registrations_log
  after insert or update or delete on public.testing_registrations
  for each row execute function public.testing_registrations_log();

drop trigger if exists testing_payments_log on public.testing_payments;
create trigger testing_payments_log
  after insert or update or delete on public.testing_payments
  for each row execute function public.change_log_write();

-- No "empty the whole table" shortcut (it would skip the history), as 0003.
-- (testing_public_attempts is not logged, so it has no such guard.)
drop trigger if exists testing_events_no_truncate on public.testing_events;
create trigger testing_events_no_truncate
  before truncate on public.testing_events
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists testing_event_classes_no_truncate on public.testing_event_classes;
create trigger testing_event_classes_no_truncate
  before truncate on public.testing_event_classes
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists testing_event_ranks_no_truncate on public.testing_event_ranks;
create trigger testing_event_ranks_no_truncate
  before truncate on public.testing_event_ranks
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists testing_registrations_no_truncate on public.testing_registrations;
create trigger testing_registrations_no_truncate
  before truncate on public.testing_registrations
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists testing_payments_no_truncate on public.testing_payments;
create trigger testing_payments_no_truncate
  before truncate on public.testing_payments
  for each statement execute function public.testing_refuse_truncate();


-- ---------------------------------------------------------------------
-- 10. The roster view: public.testing_roster
-- One row per registration with its class and belt (from the event copy)
-- and its payment state. NEVER the signature or the submission id (only
-- "signed" true/false and when the signature was removed), never login ids.
--   paid_cents  = all its payments added up (reversals are negative)
--   paid        = paid_cents > 0
--   paid_on / paid_method / last_payment_id / last_payment_recorded_at =
--     its latest payment that has NOT been reversed (for "Paid on", the
--     toast's Undo and the admin's Edit / Undo payment)
-- security_invoker = true: the view reads the tables with the CALLER's
-- rights, so the table rules (RLS has_data_access, column rights) still
-- apply - a locked session sees no rows.
-- ---------------------------------------------------------------------
create or replace view public.testing_roster
with (security_invoker = true)
as
select r.id,
       r.event_id,
       r.event_rank_id,
       r.first_name,
       r.last_name,
       r.paying_by,
       r.stripes_confirmed,
       r.source,
       r.reference,
       (r.signed_at is not null) as signed,
       r.signed_at,
       r.signature_deleted_at,
       r.ack_version,
       r.registered_at,
       r.status,
       r.withdrawn_reason,
       r.withdrawn_at,
       r.withdrawn_by_name,
       r.duplicate_state,
       r.duplicate_of,
       r.version,
       r.created_at,
       r.updated_at,
       r.created_by_name,
       r.updated_by_name,
       c.id           as event_class_id,
       c.class_id,
       c.class_name,
       c.position     as class_position,
       c.start_time,
       c.end_time,
       k.rank_id,
       k.name         as rank_name,
       k.position     as rank_position,
       k.belt_pattern,
       k.belt_color,
       k.belt_color_2,
       k.belt_end_stripes,
       k.belt_end_stripe_color,
       k.early_cents,
       k.day_cents,
       k.sparring_gear,
       coalesce(t.paid_cents, 0)     as paid_cents,
       coalesce(t.paid_cents, 0) > 0 as paid,
       lp.paid_on,
       lp.method      as paid_method,
       lp.id          as last_payment_id,
       lp.recorded_at as last_payment_recorded_at
  from public.testing_registrations r
  join public.testing_event_ranks k   on k.id = r.event_rank_id
  join public.testing_event_classes c on c.id = k.event_class_id
  left join lateral (select sum(p.amount_cents)::integer as paid_cents
                       from public.testing_payments p
                      where p.registration_id = r.id) as t on true
  left join lateral (select p.id, p.paid_on, p.method, p.recorded_at
                       from public.testing_payments p
                      where p.registration_id = r.id
                        and p.kind = 'payment'
                        and not exists (select 1 from public.testing_payments x
                                         where x.reverses_payment_id = p.id)
                      order by p.recorded_at desc, p.id desc
                      limit 1) as lp on true;

comment on view public.testing_roster is
  'Roster rows: registration + class/belt from the event copy + payment state. No signature, no submission id, no login ids. Runs with the caller''s rights.';


-- ---------------------------------------------------------------------
-- 11. Security rules: RLS + grants (same two layers as 0003 section 7)
--   * grants: which COLUMNS the app may read - SELECT only, never the
--     signature, the submission id or login ids (created_by, updated_by,
--     withdrawn_by, recorded_by). No INSERT / UPDATE / DELETE for anyone in the app.
--   * RLS: which ROWS - every row, but only while has_data_access() is
--     true (unlocked, still signed in, not PIN-locked, password within 7
--     days). testing_public_attempts: RLS on, no rule, no grants = nobody.
--   * service_role (the secret key) gets nothing, as in 0003.
-- ---------------------------------------------------------------------
alter table public.testing_events          enable row level security;
alter table public.testing_event_classes   enable row level security;
alter table public.testing_event_ranks     enable row level security;
alter table public.testing_registrations   enable row level security;
alter table public.testing_payments        enable row level security;
alter table public.testing_public_attempts enable row level security;

-- Start from zero (also removes column grants, so re-runs stay clean)...
revoke all on table public.locations, public.testing_events, public.testing_event_classes,
                    public.testing_event_ranks, public.testing_registrations, public.testing_payments,
                    public.testing_public_attempts, public.testing_roster
  from public, anon, authenticated, service_role;
revoke all on sequence public.testing_registration_ref_seq, public.testing_public_attempts_id_seq
  from public, anon, authenticated, service_role;

-- ...then add back exactly what the app reads.
grant select (code, name, id, address_street, address_city, address_state, address_zip, version)
  on public.locations to authenticated;
grant select (id, location_code, name, testing_date, registration_open, auto_close_on, first_opened_at,
              public_code, note, version, created_at, updated_at, created_by_name, updated_by_name)
  on public.testing_events to authenticated;
grant select (id, event_id, class_id, class_name, position, start_time, end_time, final_award_kind,
              final_award_name, fa_belt_pattern, fa_belt_color, fa_belt_color_2, fa_belt_end_stripes,
              fa_belt_end_stripe_color)
  on public.testing_event_classes to authenticated;
grant select (id, event_class_id, rank_id, name, position, belt_pattern, belt_color, belt_color_2,
              belt_end_stripes, belt_end_stripe_color, early_cents, day_cents, private_cents, sparring_gear)
  on public.testing_event_ranks to authenticated;
grant select (id, event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
              reference, signed_at, signature_deleted_at, ack_version, registered_at, status,
              withdrawn_reason, withdrawn_at, withdrawn_by_name, duplicate_state, duplicate_of, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.testing_registrations to authenticated;   -- NOT signature, submission_id, created_by, updated_by, withdrawn_by
grant select (id, registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name,
              reverses_payment_id)
  on public.testing_payments to authenticated;        -- NOT recorded_by
grant select on public.testing_roster to authenticated;

-- Read rules ("(select ...)" = run the check once per query, not per row).
drop policy if exists testing_events_select_with_access on public.testing_events;
create policy testing_events_select_with_access
  on public.testing_events for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists testing_event_classes_select_with_access on public.testing_event_classes;
create policy testing_event_classes_select_with_access
  on public.testing_event_classes for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists testing_event_ranks_select_with_access on public.testing_event_ranks;
create policy testing_event_ranks_select_with_access
  on public.testing_event_ranks for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists testing_registrations_select_with_access on public.testing_registrations;
create policy testing_registrations_select_with_access
  on public.testing_registrations for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists testing_payments_select_with_access on public.testing_payments;
create policy testing_payments_select_with_access
  on public.testing_payments for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 12. Internal helpers used by the functions (nobody can call them)
-- ---------------------------------------------------------------------

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
                     and e.testing_date < public.testing_today() - 90
                     for update of x skip locked);
  get diagnostics v_n = row_count;

  -- put back whatever tags were set before (normally empty)
  perform set_config('tkd.action', coalesce(v_action, ''), true);
  perform set_config('tkd.batch_id', coalesce(v_batch, ''), true);
  return v_n;
end;
$$;

revoke execute on function public.testing_purge_old_signatures() from public, anon, authenticated, service_role;

-- 12b. testing_find_duplicate(event, exclude_id, first, last) - another
-- ACTIVE registration in the same event with the same first and last name
-- (ignoring capitals and extra spaces), or NULL. The oldest one wins. A row
-- that was "kept both" together with exclude_id doesn't count.
create or replace function public.testing_find_duplicate(
  p_event_id   uuid,
  p_exclude_id uuid,
  p_first      text,
  p_last       text
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select m.id
    from public.testing_registrations m
   where m.event_id = p_event_id
     and m.status = 'active'
     and (p_exclude_id is null or m.id <> p_exclude_id)
     and lower(m.first_name) = lower(public.testing_normalize_name(p_first))
     and lower(m.last_name) = lower(public.testing_normalize_name(p_last))
     and not (p_exclude_id is not null and m.duplicate_state = 'kept_both' and m.duplicate_of = p_exclude_id)
   order by m.registered_at, m.id
   limit 1;
$$;

revoke execute on function public.testing_find_duplicate(uuid, uuid, text, text) from public, anon, authenticated, service_role;

-- 12c. testing_recheck_duplicate(registration_id) - works out one
-- registration's "possible duplicate" mark again (after an insert, a name
-- or belt edit, a withdraw, restore or removal nearby):
--   withdrawn                       -> none
--   kept both with a partner that still matches -> unchanged
--   another active match            -> possible, duplicate_of = that one
--   no match                        -> none
-- Writes only if something changes.
create or replace function public.testing_recheck_duplicate(p_registration_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_r     public.testing_registrations;
  v_state text;
  v_of    uuid;
begin
  select * into v_r from public.testing_registrations r where r.id = p_registration_id;
  if not found then
    return;
  end if;

  if v_r.status <> 'active' then
    v_state := 'none';
    v_of    := null;
  elsif v_r.duplicate_state = 'kept_both'
        and v_r.duplicate_of is not null
        and exists (select 1 from public.testing_registrations m
                     where m.id = v_r.duplicate_of
                       and m.status = 'active'
                       and m.event_id = v_r.event_id
                       and lower(m.first_name) = lower(v_r.first_name)
                       and lower(m.last_name) = lower(v_r.last_name)) then
    return;   -- staff said these two are both real
  else
    v_of    := public.testing_find_duplicate(v_r.event_id, v_r.id, v_r.first_name, v_r.last_name);
    v_state := case when v_of is null then 'none' else 'possible' end;
  end if;

  update public.testing_registrations r
     set duplicate_state = v_state,
         duplicate_of    = v_of
   where r.id = p_registration_id
     and (r.duplicate_state is distinct from v_state or r.duplicate_of is distinct from v_of);
end;
$$;

revoke execute on function public.testing_recheck_duplicate(uuid) from public, anon, authenticated, service_role;

-- 12d. testing_recheck_pointing_at(registration_id) - rechecks every
-- registration whose duplicate_of points at this one (in id order), e.g.
-- after it was withdrawn, renamed or removed.
create or replace function public.testing_recheck_pointing_at(p_registration_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select r.id from public.testing_registrations r
               where r.duplicate_of = p_registration_id
               order by r.id loop
    perform public.testing_recheck_duplicate(v_id);
  end loop;
end;
$$;

revoke execute on function public.testing_recheck_pointing_at(uuid) from public, anon, authenticated, service_role;

-- 12e. testing_check_classes_for_event(location, class ids) - before any
-- class is copied into an event: every class must still exist (else
-- 'stale': the dialog is out of date), be in the event's school (else
-- 'invalid') and have its final award set - a rank or None (else
-- 'final_award_not_set', with the first such class's name). Returns
-- {"status": ...} - "ok" when all is well. Changes nothing.
create or replace function public.testing_check_classes_for_event(p_location_code text, p_class_ids uuid[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_name text;
begin
  if (select count(*) from public.testing_classes c where c.id = any (p_class_ids))
     <> cardinality(p_class_ids) then
    return jsonb_build_object('status', 'stale');
  end if;
  if exists (select 1 from public.testing_classes c
              where c.id = any (p_class_ids) and c.location_code <> p_location_code) then
    return jsonb_build_object('status', 'invalid');
  end if;
  select c.name into v_name
    from public.testing_classes c
   where c.id = any (p_class_ids)
     and not c.final_award_none
     and c.final_award_rank_id is null
   order by c.position
   limit 1;
  if found then
    return jsonb_build_object('status', 'final_award_not_set', 'class_name', v_name);
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.testing_check_classes_for_event(text, uuid[]) from public, anon, authenticated, service_role;

-- 12f. testing_copy_class_into_event(event, class, start, end) - the copy
-- rule (contract §1.4): the class's CURRENT name, position and final award
-- (name + belt, or none) and all its ranks (names, positions, belts,
-- prices, sparring gear) are copied into the event, with the times. Run
-- only after 12e said ok, with the school locked (so nothing in Classes
-- and ranks can change half-way).
create or replace function public.testing_copy_class_into_event(
  p_event_id   uuid,
  p_class_id   uuid,
  p_start_time time,
  p_end_time   time
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_event_class_id uuid;
begin
  insert into public.testing_event_classes
    (event_id, class_id, class_name, position, start_time, end_time,
     final_award_kind, final_award_name, fa_belt_pattern, fa_belt_color, fa_belt_color_2,
     fa_belt_end_stripes, fa_belt_end_stripe_color)
  select p_event_id, c.id, c.name, c.position, p_start_time, p_end_time,
         case when c.final_award_none then 'none' else 'rank' end,
         a.name, a.belt_pattern, a.belt_color, a.belt_color_2, a.belt_end_stripes, a.belt_end_stripe_color
    from public.testing_classes c
    left join public.testing_ranks a
           on a.id = c.final_award_rank_id and not c.final_award_none
   where c.id = p_class_id
  returning id into v_event_class_id;

  insert into public.testing_event_ranks
    (event_class_id, rank_id, name, position, belt_pattern, belt_color, belt_color_2,
     belt_end_stripes, belt_end_stripe_color, early_cents, day_cents, private_cents, sparring_gear)
  select v_event_class_id, r.id, r.name, r.position, r.belt_pattern, r.belt_color, r.belt_color_2,
         r.belt_end_stripes, r.belt_end_stripe_color, r.early_cents, r.day_cents, r.private_cents, r.sparring_gear
    from public.testing_ranks r
   where r.class_id = p_class_id
   order by r.position;
end;
$$;

revoke execute on function public.testing_copy_class_into_event(uuid, uuid, time, time) from public, anon, authenticated, service_role;

-- 12g. testing_public_answer(registration_id) - the "You're registered"
-- answer the family page shows (F7 / F8). Only what that family just typed
-- plus the event facts - nothing about anyone else.
create or replace function public.testing_public_answer(p_registration_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'status',       'ok',
           'reference',    r.reference,
           'first_name',   r.first_name,
           'last_name',    r.last_name,
           'testing_for',  public.testing_rank_testing_for(k.id),
           'class_name',   c.class_name,
           'start_time',   left(c.start_time::text, 5),
           'end_time',     left(c.end_time::text, 5),
           'early_cents',  k.early_cents,
           'day_cents',    k.day_cents,
           'paying_by',    r.paying_by,
           'testing_date', e.testing_date,
           'school_name',  l.name,
           'address',      public.testing_location_address(l.code))
    from public.testing_registrations r
    join public.testing_event_ranks k   on k.id = r.event_rank_id
    join public.testing_event_classes c on c.id = k.event_class_id
    join public.testing_events e        on e.id = r.event_id
    join public.locations l             on l.code = e.location_code
   where r.id = p_registration_id;
$$;

revoke execute on function public.testing_public_answer(uuid) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 13. The restricted login for the family form: testing_registrar
-- The Cloudflare Function (via Hyperdrive) signs in as this role and can
-- run exactly two functions (section 15). It has no rights on any table,
-- view or sequence, can't create anything, isn't part of any other role,
-- and Supabase's API (the "authenticator" login) can never switch into it.
--   login              it can sign in (its password is set separately, at
--                      checkpoint CP3, as a SCRAM verifier made on Jeffrey's
--                      PC - SETUP.md section 12. NO password in this file.)
--   noinherit ...      no inherited rights, can't create databases or
--                      roles, can't skip RLS, can't replicate
--   connection limit 5 at most 5 connections at once (Hyperdrive's origin
--                      connection limit for this config must be 5 or less)
--   statement_timeout 5s, idle_in_transaction_session_timeout 10s: a stuck
--                      call is cut off instead of holding locks
--   search_path ''     nothing is found without its schema name (security
--                      review L4 looked at this: every function also pins
--                      its own search_path = '', so nothing to change)
-- Created only if it doesn't exist yet, so re-running this file never
-- touches an existing role's attributes or password (e.g. after the
-- emergency "nologin" in SETUP §12 it stays switched off). The tests check
-- the attributes.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'testing_registrar') then
    create role testing_registrar login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5;
  end if;
end
$$;

alter role testing_registrar set statement_timeout = '5s';
alter role testing_registrar set idle_in_transaction_session_timeout = '10s';
alter role testing_registrar set search_path = '';

-- It needs to find the two functions in schema public, nothing more.
grant usage on schema public to testing_registrar;


-- ---------------------------------------------------------------------
-- 14. The staff functions (the only way to change events, registrations
--     and payments). Same pattern as 0003 section 8:
--   * returns {"status": ...}; the statuses are listed in the header
--   * checks in this order: has_data_access() FIRST, then the role (A =
--     admins only; S = staff and admins), then the input, then it locks
--     the rows and looks them up (not_found), then "did the screen see the
--     latest version?" (stale), then the rules that depend on the data,
--     then it writes
--   * tags its writes with tkd.action + tkd.batch_id and clears them
--   * the whole body is inside begin ... exception ... end: a table rule
--     that still says no undoes everything this call did and answers a
--     status instead of an error, with 0003's mapping:
--       the event name index        -> duplicate_name
--       any other unique rule       -> stale
--       foreign key / check / not-null rule -> invalid
--       deadlock / serialization / lock not available -> stale
--   * locks, always in this order: the school's row in public.locations
--     -> the event -> the registration -> its payments ("for no key update"
--     on the parents, "for update" on the row being changed or removed).
--     Every write in a school takes the school lock first and every write
--     in an event takes the event lock, so they simply take turns.
-- ---------------------------------------------------------------------

-- 14a. testing_add_event(p_location_code, p_name, p_testing_date,
--        p_classes, p_registration_open, p_auto_close_on, p_note)   A
-- Creates an event and copies the chosen classes into it (12e, 12f).
--   p_testing_date    today or later
--   p_classes         [{class_id, start_time "HH:MM", end_time}] (1h),
--                     classes of the same school, final award set
--   p_registration_open  true = open straight away (also sets
--                     first_opened_at); false = starts Closed ("Not open yet")
--   p_auto_close_on   NULL (no closing date) or from today up to the
--                     testing date (the dialog fills testing date - 7)
--   p_note            NULL or up to 600 characters (tidied, 1b)
-- Last step: the signature clean-up (12a).
-- Ok: {"status":"ok","id":...,"public_code":"...","version":1}
-- final_award_not_set: {"status":"final_award_not_set","class_name":"..."}
create or replace function public.testing_add_event(
  p_location_code     text,
  p_name              text,
  p_testing_date      date,
  p_classes           jsonb,
  p_registration_open boolean,
  p_auto_close_on     date,
  p_note              text
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
  v_class_ids  uuid[];
  v_check      jsonb;
  v_code       text;
  v_id         uuid;
  v_version    integer;
  v_item       record;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 3. input
    v_today := public.testing_today();
    v_name  := public.testing_normalize_name(p_name);
    v_note  := public.testing_normalize_note(p_note);
    if p_location_code is null
       or not exists (select 1 from public.locations l where l.code = p_location_code)
       or not public.testing_name_is_valid(p_name)
       or p_testing_date is null
       or p_testing_date < v_today
       or p_registration_open is null
       or (p_auto_close_on is not null and (p_auto_close_on < v_today or p_auto_close_on > p_testing_date))
       or (v_note is not null and not public.testing_note_is_valid(v_note))
       or not public.testing_classes_arg_is_valid(p_classes) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_class_ids := array(select (x.value ->> 'class_id')::uuid from jsonb_array_elements(p_classes) as x(value));

    -- 4. lock the school (this also keeps Classes and ranks still while
    --    they are copied: every 0003 change takes the same lock)
    perform 1 from public.locations l where l.code = p_location_code for no key update;

    -- 6. the classes, and the name
    v_check := public.testing_check_classes_for_event(p_location_code, v_class_ids);
    if v_check ->> 'status' <> 'ok' then
      return v_check;
    end if;
    if exists (select 1 from public.testing_events e
                where e.location_code = p_location_code
                  and lower(public.testing_normalize_name(e.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write
    perform set_config('tkd.action', 'add_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    loop
      v_code := public.testing_new_public_code();
      exit when not exists (select 1 from public.testing_events e where e.public_code = v_code);
    end loop;

    insert into public.testing_events
      (location_code, name, testing_date, registration_open, auto_close_on, first_opened_at, public_code, note)
    values
      (p_location_code, v_name, p_testing_date, p_registration_open, p_auto_close_on,
       case when p_registration_open then now() end, v_code, v_note)
    returning id, version into v_id, v_version;

    for v_item in select (x.value ->> 'class_id')::uuid as class_id,
                         (x.value ->> 'start_time')::time as start_time,
                         (x.value ->> 'end_time')::time as end_time
                    from jsonb_array_elements(p_classes) as x(value) loop
      perform public.testing_copy_class_into_event(v_id, v_item.class_id, v_item.start_time, v_item.end_time);
    end loop;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.testing_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'id', v_id, 'public_code', v_code, 'version', v_version);
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

revoke execute on function public.testing_add_event(text, text, date, jsonb, boolean, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_add_event(text, text, date, jsonb, boolean, date, text) to authenticated;

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

-- 14c. testing_set_registration(p_event_id, p_expected_version, p_open)   S / A
-- The Open / Closed switch (contract §1.3):
--   close (p_open false): staff and admins, any time before Finished
--   open, closing date not passed (or none): staff and admins; the first
--     opening sets first_opened_at
--   open AFTER the closing date passed: admins only - and opening removes
--     the closing date (so it stays open until closed by hand or the
--     testing day ends); staff -> not_allowed
--   once Finished nothing changes the switch -> finished
-- Switching to what it already is writes nothing.
-- Ok: {"status":"ok","version":n,"state":"open"|...}
create or replace function public.testing_set_registration(
  p_event_id         uuid,
  p_expected_version integer,
  p_open             boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_loc        text;
  v_e          public.testing_events;
  v_clear      boolean := false;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    -- 2. role: any staff member with data access (admin-only cases below)

    if p_event_id is null or p_expected_version is null or p_open is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select e.location_code into v_loc from public.testing_events e where e.id = p_event_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.locations l where l.code = v_loc for no key update;
    select * into v_e from public.testing_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    v_today := public.testing_today();
    if public.testing_event_state(v_e, v_today) = 'finished' then
      return jsonb_build_object('status', 'finished');
    end if;

    if p_open and v_e.auto_close_on is not null and v_today > v_e.auto_close_on then
      -- the closing date has passed: admins only, and the date goes
      if public.is_admin() is not true then
        return jsonb_build_object('status', 'not_allowed');
      end if;
      v_clear := true;
    end if;

    perform set_config('tkd.action', 'set_registration', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_events e
       set registration_open = p_open,
           first_opened_at   = case when p_open then coalesce(e.first_opened_at, now()) else e.first_opened_at end,
           auto_close_on     = case when v_clear then null else e.auto_close_on end
     where e.id = p_event_id
       and (e.registration_open is distinct from p_open or v_clear)
    returning * into v_e;
    if not found then
      select * into v_e from public.testing_events e where e.id = p_event_id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_e.version,
                              'state', public.testing_event_state(v_e, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
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

revoke execute on function public.testing_set_registration(uuid, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.testing_set_registration(uuid, integer, boolean) to authenticated;

-- 14d. testing_delete_event(p_event_id, p_expected_version,
--        p_expected_registration_count, p_expected_payment_total_cents)   A
-- Removes an event with its classes, ranks, registrations and payments
-- ("on delete cascade"; every removed row is in the history). The two
-- numbers are what the confirmation dialog said: ALL registrations
-- (withdrawn ones too) and the payments' NET total (reversals subtracted).
-- If either differs now, nothing is removed: stale.
-- Ok: {"status":"ok"}
create or replace function public.testing_delete_event(
  p_event_id                     uuid,
  p_expected_version             integer,
  p_expected_registration_count  integer,
  p_expected_payment_total_cents integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc        text;
  v_version    integer;
  v_count      integer;
  v_total      bigint;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_event_id is null or p_expected_version is null
       or p_expected_registration_count is null or p_expected_payment_total_cents is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select e.location_code into v_loc from public.testing_events e where e.id = p_event_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.locations l where l.code = v_loc for no key update;
    select e.version into v_version from public.testing_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    -- the registrations and payments that will go, in id order
    perform 1 from public.testing_registrations r where r.event_id = p_event_id order by r.id for update;
    perform 1 from public.testing_payments p
      join public.testing_registrations r on r.id = p.registration_id
     where r.event_id = p_event_id
     order by p.id
       for update of p;

    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    select count(*) into v_count from public.testing_registrations r where r.event_id = p_event_id;
    select coalesce(sum(p.amount_cents), 0) into v_total
      from public.testing_payments p
      join public.testing_registrations r on r.id = p.registration_id
     where r.event_id = p_event_id;
    if v_count <> p_expected_registration_count or v_total <> p_expected_payment_total_cents then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'delete_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.testing_events e where e.id = p_event_id;

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

revoke execute on function public.testing_delete_event(uuid, integer, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_delete_event(uuid, integer, integer, integer) to authenticated;

-- 14e. testing_add_student(p_event_id, p_first, p_last, p_event_rank_id,
--        p_stripes, p_paying_by)   S
-- Add student at the desk (walk-ins): source 'staff', in any state except
-- Finished (also after registration closed, and on the testing day).
-- p_stripes must be true (the 3-stripes tick); paying by cash/check/card;
-- the rank must be one of THIS event's. A same-name registration in the
-- event marks the new one "possible duplicate".
-- Ok: {"status":"ok","id":...,"reference":"CB-....","version":1}
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

    if public.testing_event_state(v_e, public.testing_today()) = 'finished' then
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

-- 14f. Shared start of the registration functions below: looks up the
-- registration's school and event, locks school -> event -> registration
-- ("for update"), and returns the locked registration (NULL fields if it
-- is gone). Internal.
create or replace function public.testing_lock_registration(p_registration_id uuid)
returns public.testing_registrations
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_loc      text;
  v_event_id uuid;
  v_r        public.testing_registrations;
begin
  select e.location_code, r.event_id into v_loc, v_event_id
    from public.testing_registrations r
    join public.testing_events e on e.id = r.event_id
   where r.id = p_registration_id;
  if not found then
    return null;
  end if;
  perform 1 from public.locations l where l.code = v_loc for no key update;
  perform 1 from public.testing_events e where e.id = v_event_id for no key update;
  select * into v_r from public.testing_registrations r where r.id = p_registration_id for update;
  return v_r;   -- all fields NULL when it vanished meanwhile
end;
$$;

revoke execute on function public.testing_lock_registration(uuid) from public, anon, authenticated, service_role;

-- 14g. testing_update_student(p_registration_id, p_expected_version,
--        p_first, p_last, p_event_rank_id)   S
-- Edit details: names and belt (the class follows the belt), in any event
-- state. Payments are not touched (a belt corrected after paying leaves
-- the payment as it is). The duplicate mark is worked out again for this
-- registration and for any that pointed at it. Nothing changed -> writes
-- nothing.
-- Ok: {"status":"ok","version":n}
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

revoke execute on function public.testing_update_student(uuid, integer, text, text, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_update_student(uuid, integer, text, text, uuid) to authenticated;

-- 14h. testing_change_paying_by(p_registration_id, p_expected_version,
--        p_paying_by)   S
-- "Change how they'll pay": cash / check / card. Only while not paid
-- (already_paid) and not withdrawn (withdrawn).
-- Ok: {"status":"ok","version":n}
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
         where p.registration_id = p_registration_id) > 0 then
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
    if (select coalesce(sum(p.amount_cents), 0) from public.testing_payments p
         where p.registration_id = p_registration_id) > 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    v_today := public.testing_today();
    select public.testing_fee_cents(k.early_cents, k.day_cents, v_today, e.testing_date)
      into v_amount
      from public.testing_event_ranks k, public.testing_events e
     where k.id = v_r.event_rank_id and e.id = v_r.event_id;

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

-- 14j. Shared start of Undo / Edit payment: finds the payment's
-- registration, locks school -> event -> registration -> the payment, and
-- returns the locked payment (NULL fields if it is gone). Internal.
create or replace function public.testing_lock_payment(p_payment_id uuid)
returns public.testing_payments
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_registration_id uuid;
  v_r               public.testing_registrations;
  v_p               public.testing_payments;
begin
  select p.registration_id into v_registration_id from public.testing_payments p where p.id = p_payment_id;
  if not found then
    return null;
  end if;
  v_r := public.testing_lock_registration(v_registration_id);
  if v_r.id is null then
    return null;
  end if;
  select * into v_p from public.testing_payments p where p.id = p_payment_id for update;
  return v_p;
end;
$$;

revoke execute on function public.testing_lock_payment(uuid) from public, anon, authenticated, service_role;

-- 14k. testing_undo_payment(p_payment_id)   S (own, within 10 s) / A
-- Writes a reversal for a payment (the payment row stays; the two add up
-- to 0, so the student shows Not paid again). Who may:
--   the staff member who recorded it, less than 10 seconds ago (the toast's
--   Undo) - the database decides this from recorded_by and recorded_at;
--   otherwise admins only (not_allowed).
-- Already reversed -> stale. Undoing a reversal -> invalid. The
-- registration's version goes up.
-- Ok: {"status":"ok","version":n}  (the registration's new version)
create or replace function public.testing_undo_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.testing_payments;
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

    v_p := public.testing_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if not (v_p.recorded_by is not distinct from auth.uid() and v_p.recorded_at > now() - interval '10 seconds')
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_p.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.testing_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.registration_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    update public.testing_registrations r
       set version = r.version + 1
     where r.id = v_p.registration_id
    returning r.version into v_version;

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

revoke execute on function public.testing_undo_payment(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_undo_payment(uuid) to authenticated;

-- 14l. testing_edit_payment(p_payment_id, p_method, p_amount_cents,
--        p_paid_on)   A
-- Edit payment = a reversal of the old payment + a new payment with the
-- new method / amount (1 cent to $1,000) / date (not in the future).
-- Already reversed -> stale; a reversal can't be edited (invalid).
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}
create or replace function public.testing_edit_payment(
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
  v_p          public.testing_payments;
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

    v_p := public.testing_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.testing_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.registration_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_p.registration_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_new_id;

    update public.testing_registrations r
       set version = r.version + 1
     where r.id = v_p.registration_id
    returning r.version into v_version;

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

revoke execute on function public.testing_edit_payment(uuid, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.testing_edit_payment(uuid, text, integer, date) to authenticated;

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

-- 14n. testing_withdraw_student(p_registration_id, p_expected_version)   A
-- Withdraw: the student moves to the Removed group; payments stay. An
-- already withdrawn student -> withdrawn. Registrations marked as its
-- possible duplicate are checked again (usually back to none).
-- Ok: {"status":"ok","version":n}
create or replace function public.testing_withdraw_student(
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
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
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

    perform set_config('tkd.action', 'withdraw_student', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

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

revoke execute on function public.testing_withdraw_student(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_withdraw_student(uuid, integer) to authenticated;

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

-- 14p. testing_delete_student(p_registration_id, p_expected_version,
--        p_expected_payment_ids)   A
-- Delete permanently (plan answer 8): the registration and ALL its payment
-- rows (payments and reversals) are removed; every removed row is in the
-- history. p_expected_payment_ids = the payment rows the warning named
-- (compared as a set); if they differ now, nothing is removed: stale.
-- Registrations marked as its possible duplicate are checked again.
-- Ok: {"status":"ok"}
create or replace function public.testing_delete_student(
  p_registration_id      uuid,
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
  v_r          public.testing_registrations;
  v_pointing   uuid[];
  v_id         uuid;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_registration_id is null or p_expected_version is null
       or not public.testing_ids_are_valid(p_expected_payment_ids) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.testing_payments p where p.registration_id = p_registration_id order by p.id for update;

    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if array(select p.id from public.testing_payments p where p.registration_id = p_registration_id order by p.id)
       <> array(select x.id from unnest(p_expected_payment_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'stale');
    end if;

    v_pointing := array(select r.id from public.testing_registrations r
                         where r.duplicate_of = p_registration_id order by r.id);

    perform set_config('tkd.action', 'delete_student', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.testing_registrations r where r.id = p_registration_id;

    foreach v_id in array v_pointing loop
      perform public.testing_recheck_duplicate(v_id);
    end loop;

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

revoke execute on function public.testing_delete_student(uuid, integer, uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.testing_delete_student(uuid, integer, uuid[]) to authenticated;

-- 14q. settings_update_school_address(p_code, p_expected_version,
--        p_street, p_city, p_state, p_zip)   A
-- Settings -> Schools -> Edit. Spaces at the start and end are removed
-- (and runs of spaces become one); an empty part counts as not given.
-- All four given = the new address; all four empty = no address (family
-- pages and the flyer show just the school name); some but not all ->
-- invalid. State = 2 capital letters (MA); ZIP = 12345 or 12345-6789.
-- Saving the same address writes nothing.
-- Ok: {"status":"ok","version":n}
create or replace function public.settings_update_school_address(
  p_code             text,
  p_expected_version integer,
  p_street           text,
  p_city             text,
  p_state            text,
  p_zip              text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_street     text := nullif(public.testing_normalize_name(p_street), '');
  v_city       text := nullif(public.testing_normalize_name(p_city), '');
  v_state      text := nullif(btrim(p_state), '');
  v_zip        text := nullif(btrim(p_zip), '');
  v_version    integer;
  v_new        integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_code is null or p_expected_version is null
       or num_nulls(v_street, v_city, v_state, v_zip) not in (0, 4)
       or (v_street is not null and not public.testing_line_is_valid(v_street, 100))
       or (v_city is not null and not public.testing_line_is_valid(v_city, 60))
       or (v_state is not null and v_state !~ '^[A-Z]{2}$')
       or (v_zip is not null and v_zip !~ '^[0-9]{5}(-[0-9]{4})?$') then
      return jsonb_build_object('status', 'invalid');
    end if;

    select l.version into v_version from public.locations l where l.code = p_code for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'update_school_address', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.locations l
       set address_street = v_street,
           address_city   = v_city,
           address_state  = v_state,
           address_zip    = v_zip
     where l.code = p_code
       and (l.address_street is distinct from v_street
            or l.address_city is distinct from v_city
            or l.address_state is distinct from v_state
            or l.address_zip is distinct from v_zip)
    returning l.version into v_new;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_new, v_version));
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

revoke execute on function public.settings_update_school_address(text, integer, text, text, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.settings_update_school_address(text, integer, text, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 15. The two public functions (role testing_registrar ONLY)
-- They never trust the Cloudflare Function: every rule is checked again
-- here. Neither returns anything about other registrations (no counts, no
-- names, no ids except a rank's event_rank_id).
-- ---------------------------------------------------------------------

-- 15a. testing_public_event(p_code) - what the family page shows first.
-- {"status":"ok",
--  "state": "open" | "not_open" | "closed" | "finished",
--  "closed_on": the closing date when it closed by date, else null,
--  "event": {name, testing_date, note, school_name, address|null, auto_close_on},
--  "classes": [{class_name, start_time "HH:MM", end_time,
--               ranks: [{event_rank_id, name, belt_pattern, belt_color,
--                        belt_color_2, belt_end_stripes, belt_end_stripe_color,
--                        early_cents, day_cents, sparring_gear,
--                        testing_for: {name, belt_*...} | null}]}]}
-- or {"status":"not_found"} for an unknown or badly formed code.
create or replace function public.testing_public_event(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e     public.testing_events;
  v_state text;
begin
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_e from public.testing_events e where e.public_code = p_code;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_state := public.testing_event_state(v_e, public.testing_today());

  return jsonb_build_object(
    'status', 'ok',
    'state', case v_state
               when 'open' then 'open'
               when 'not_open_yet' then 'not_open'
               when 'finished' then 'finished'
               else 'closed'
             end,
    'closed_on', case when v_state = 'closed_by_date' then v_e.auto_close_on end,
    'event', jsonb_build_object(
               'name',          v_e.name,
               'testing_date',  v_e.testing_date,
               'note',          v_e.note,
               'school_name',   (select l.name from public.locations l where l.code = v_e.location_code),
               'address',       public.testing_location_address(v_e.location_code),
               'auto_close_on', v_e.auto_close_on),
    'classes', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'class_name', c.class_name,
                 'start_time', left(c.start_time::text, 5),
                 'end_time',   left(c.end_time::text, 5),
                 'ranks', coalesce((
                   select jsonb_agg(
                            jsonb_build_object(
                              'event_rank_id',         k.id,
                              'name',                  k.name,
                              'belt_pattern',          k.belt_pattern,
                              'belt_color',            k.belt_color,
                              'belt_color_2',          k.belt_color_2,
                              'belt_end_stripes',      k.belt_end_stripes,
                              'belt_end_stripe_color', k.belt_end_stripe_color,
                              'early_cents',           k.early_cents,
                              'day_cents',             k.day_cents,
                              'sparring_gear',         k.sparring_gear,
                              'testing_for',           public.testing_rank_testing_for(k.id))
                            order by k.position)
                     from public.testing_event_ranks k
                    where k.event_class_id = c.id), '[]'::jsonb))
               order by c.position, c.start_time)
        from public.testing_event_classes c
       where c.event_id = v_e.id), '[]'::jsonb));
end;
$$;

revoke execute on function public.testing_public_event(text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_public_event(text) to testing_registrar;

-- 15b. testing_public_register_core(...) - the inside of 15c (internal;
-- nobody can call it). Steps, in this order (contract §1.8):
--   1. the event by its code                        -> not_found
--   2. this submission_id already registered FOR THIS EVENT -> the same
--      ok answer again (a double tap or a retry never makes two);
--      registered for ANOTHER event -> invalid (never its details)
--   3. the state right now: not_open / closed (+ closed_on) / finished
--   4. the input: names, paying by cash or check, the 3-stripes tick, the
--      signature (1d), the confirmation wording version   -> invalid
--   5. the rank is one of this event's                  -> invalid
--   6. rate limit: more than 20 tries from this client key in the last
--      hour -> rate_limited. More than 200 tries for this event in the last
--      hour is only written to the database log (never refused, so an
--      attacker can't block real families)
--   7. the registration, by "Family form"; a same-name registration marks
--      it "possible duplicate" (accepted silently)
-- A concurrent call with the same submission_id that hits the unique rule
-- is answered like step 2.
create or replace function public.testing_public_register_core(
  p_code          text,
  p_client_key    text,
  p_submission_id uuid,
  p_first         text,
  p_last          text,
  p_event_rank_id uuid,
  p_paying_by     text,
  p_stripes       boolean,
  p_signature     text,
  p_ack_version   text
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_e          public.testing_events;
  v_state      text;
  v_found_id   uuid;
  v_found_ev   uuid;
  v_dup        uuid;
  v_id         uuid;
  v_n          integer;
  v_constraint text;
begin
  -- 1. the event
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_e from public.testing_events e where e.public_code = p_code;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 2. already registered with this submission id?
  if p_submission_id is not null then
    select r.id, r.event_id into v_found_id, v_found_ev
      from public.testing_registrations r where r.submission_id = p_submission_id;
    if found then
      if v_found_ev <> v_e.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      return public.testing_public_answer(v_found_id);
    end if;
  end if;

  -- lock school -> event (as every write does), then read the event again
  perform 1 from public.locations l where l.code = v_e.location_code for no key update;
  select * into v_e from public.testing_events e where e.id = v_e.id for no key update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 3. open right now?
  v_state := public.testing_event_state(v_e, public.testing_today());
  if v_state = 'finished' then
    return jsonb_build_object('status', 'finished');
  elsif v_state = 'not_open_yet' then
    return jsonb_build_object('status', 'not_open');
  elsif v_state = 'closed_by_date' then
    return jsonb_build_object('status', 'closed', 'closed_on', v_e.auto_close_on);
  elsif v_state = 'closed' then
    return jsonb_build_object('status', 'closed', 'closed_on', null);
  end if;

  -- 4. the input
  if p_client_key is null or char_length(p_client_key) not between 1 and 200
     or p_submission_id is null
     or not public.testing_name_is_valid(p_first)
     or not public.testing_name_is_valid(p_last)
     or p_event_rank_id is null
     or p_paying_by is null or p_paying_by not in ('cash', 'check')
     or p_stripes is not true
     or not public.testing_signature_is_valid(p_signature)
     or p_ack_version is distinct from 'cb-2026-10-17' then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 5. a rank of this event?
  if not exists (select 1 from public.testing_event_ranks k
                   join public.testing_event_classes c on c.id = k.event_class_id
                  where k.id = p_event_rank_id and c.event_id = v_e.id) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 6. rate limit (this call's own row is written afterwards by 15c)
  select count(*) into v_n
    from public.testing_public_attempts a
   where a.client_key = p_client_key and a.at > now() - interval '1 hour';
  if v_n >= 20 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*) into v_n
    from public.testing_public_attempts a
   where a.event_id = v_e.id and a.at > now() - interval '1 hour';
  if v_n >= 200 then
    raise log 'testing_public_register: event % had % form attempts in the last hour', v_e.id, v_n;
  end if;

  -- 7. write
  perform set_config('tkd.actor_label', 'Family form', true);
  perform set_config('tkd.action', 'public_register', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  v_dup := public.testing_find_duplicate(v_e.id, null, p_first, p_last);
  begin
    insert into public.testing_registrations
      (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
       submission_id, signature, signed_at, ack_version, duplicate_state, duplicate_of)
    values
      (v_e.id, p_event_rank_id, public.testing_normalize_name(p_first), public.testing_normalize_name(p_last),
       p_paying_by, true, 'form', p_submission_id, p_signature, now(), p_ack_version,
       case when v_dup is null then 'none' else 'possible' end, v_dup)
    returning id into v_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'testing_registrations_submission_id_key' then
        raise;
      end if;
      -- another call with the same submission id got there first
      select r.id, r.event_id into v_found_id, v_found_ev
        from public.testing_registrations r where r.submission_id = p_submission_id;
      if not found or v_found_ev <> v_e.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_id := v_found_id;
  end;

  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);

  return public.testing_public_answer(v_id);
end;
$$;

revoke execute on function public.testing_public_register_core(text, text, uuid, text, text, uuid, text, boolean, text, text) from public, anon, authenticated, service_role;

-- 15c. testing_public_register(p_code, p_client_key, p_submission_id,
--        p_first, p_last, p_event_rank_id, p_paying_by, p_stripes,
--        p_signature, p_ack_version)
-- The family form's Send. Wraps 15b:
--   * first forgets any login token the caller might have set (so nobody
--     can make a form registration look like a staff member's), and
--     removes rate-limit rows older than 2 days
--   * runs 15b; if a table rule still says no, everything 15b did is
--     undone and the answer is invalid
--   * THEN writes this call's testing_public_attempts row (outcome = the
--     status answered, ok included) - outside the part that can be undone,
--     so every call counts toward the rate limit
--   * last: the signature clean-up (12a)
-- Ok: {"status":"ok", reference, first_name, last_name, testing_for,
--      class_name, start_time, end_time, early_cents, day_cents, paying_by,
--      testing_date, school_name, address}
create or replace function public.testing_public_register(
  p_code          text,
  p_client_key    text,
  p_submission_id uuid,
  p_first         text,
  p_last          text,
  p_event_rank_id uuid,
  p_paying_by     text,
  p_stripes       boolean,
  p_signature     text,
  p_ack_version   text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  delete from public.testing_public_attempts a where a.at < now() - interval '2 days';

  begin
    v_result := public.testing_public_register_core(p_code, p_client_key, p_submission_id, p_first, p_last,
                                                    p_event_rank_id, p_paying_by, p_stripes, p_signature,
                                                    p_ack_version);
  exception
    when unique_violation or foreign_key_violation or check_violation or not_null_violation then
      v_result := jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      v_result := jsonb_build_object('status', 'invalid');
  end;

  insert into public.testing_public_attempts (client_key, event_id, outcome)
  values (coalesce(left(p_client_key, 200), ''),
          (select e.id from public.testing_events e where e.public_code = p_code),
          coalesce(v_result ->> 'status', 'invalid'));

  perform set_config('tkd.actor_label', 'Family form', true);
  perform public.testing_purge_old_signatures();
  perform set_config('tkd.actor_label', '', true);

  return v_result;
end;
$$;

revoke execute on function public.testing_public_register(text, text, uuid, text, text, uuid, text, boolean, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_public_register(text, text, uuid, text, text, uuid, text, boolean, text, text) to testing_registrar;


commit;

-- End of 0005_testing_events.sql
