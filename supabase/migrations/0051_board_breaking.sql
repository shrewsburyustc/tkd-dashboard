-- =====================================================================
-- 0051_board_breaking.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database for the new "Board breaking" section of the staff
--   dashboard (contract docs/Board Breaking/CONTRACT-0051.md, exact names
--   and answers in docs/Board Breaking/SIGNATURES-0051.md, rulebook
--   v1.300-v1.303). It runs after 0003 and 0005 (their helpers), 0001 /
--   0002 (has_data_access, is_admin) and stops with a clear message if one
--   of them is missing. It changes NOTHING that another section made: it
--   only adds new tables, functions, two login roles and a few rows. It is
--   modelled on Camps (0013, 0033, 0039, 0043, 0050) - read those for the
--   long explanations of the patterns used here.
--
-- WHY IT EXISTS
--   Once a month a school holds a board-breaking night (one school per
--   event). Families register through a link / QR (name, age, rank, class
--   time, how many boards, how they will pay). Staff run the roster by
--   class time: Mark paid, Mark broken, Add student (walk-ins), Edit.
--   Families who choose Card get a Square payment link with the exact
--   amount; Square's "payment completed" message marks them paid. Admins
--   own the events, the prices, the age line, the board chart, price
--   overrides and refunds. Like Camps' family form this lets something
--   reach the database WITHOUT a staff sign-in, so the public part is
--   locked down hard: its own restricted login (brk_registrar) that can
--   run exactly four functions, and a second login (brk_square) that can
--   run exactly one (the Square webhook). Every rule is checked again here;
--   nothing the browser, the Cloudflare Function or Square says is trusted
--   for money: the DATABASE works out boards' prices.
--
-- WHAT IT ADDS
--   1.  small rule helpers (names, times, whole numbers, the chart and
--       class lists)
--   2.  nine tables:
--         brk_settings        ONE row: prices and the age line
--         brk_chart           the board chart (rank -> boards, technique)
--         brk_events          one night at one school (+ family link code)
--         brk_event_classes   the class times of an event ("Group D")
--         brk_registrations   one student at one event (no date of birth,
--                             address, contact or signature exist here)
--         brk_payments        payments, append-only (a mistake is fixed by
--                             a reversal row, never by changing a row)
--         brk_public_attempts rate-limit ledger of the family form
--         brk_square_events   every Square message ever received; its
--                             primary key is the replay guard
--         brk_cleared_links   Square order ids whose payment link was
--                             cleared, with the student they belonged to
--   3.  trigger functions: bookkeeping (version, created_*, updated_*),
--       the append-only payment guard, the family's Paying by kept as it
--       was on the form, the change history
--   4.  row security + column rights (the app may only READ, only these
--       columns, only while has_data_access() is true; nothing for anon)
--   5.  the login roles brk_registrar and brk_square (NO password here)
--   6.  internal helpers (price maths, locks, history clean-up)
--   7.  staff reads:   brk_settings_get, brk_events_list, brk_event_roster,
--                      brk_registration_history
--   8.  staff writes:  events, classes, students, edits, override, broke,
--                      Mark paid / Undo / Edit payment, refunds, delete,
--                      settings, chart, dismiss a Square message
--   9.  public (brk_registrar only): brk_public_event, brk_public_signup,
--                      brk_public_registration, brk_public_set_link
--  10.  Square (brk_square only): brk_square_payment
--  11.  the starting rows: prices 300 / 400 / 25 / 100 / age line 12 and
--       the board chart (docs/Board Breaking/Board-chart-seed.md, the live
--       page's numbers; technique words are only a starting text)
--
-- HOW THE PRICE IS WORKED OUT (contract section 4, never trusted from the
--   browser)
--   * rank starts with "Little Tiger" (or is a Little Tiger row of the
--     chart)  -> chart band 'tiger'
--   * rank is a Black Belt row of the chart  -> band 'black' (age ignored)
--   * any other rank -> 'child' when age <= child_max_age, else 'teen'
--   * the rank must exist in that band of brk_chart, else "invalid"
--   * amount = tech_boards * (tech_cents + card extra + same-day extra)
--            + adult_boards * (adult_cents + card extra + same-day extra)
--     card extra = card_extra_cents when Paying by is Card;
--     same-day extra = same_day_extra_cents from the event date on
--     (New York's today >= the event date at the moment of sign-up; the
--     flag is stored with the student and kept when staff edit them).
--     An admin's override (override_cents) replaces the amount when set.
--   The family's own board counts are kept (0-12 each, at least 1 in
--   total); the chart's counts are what the page recommends.
--
-- HOW TO RUN IT
--   RUN IT OUTSIDE SCHOOL HOURS: it adds an index to the shared history
--   table (change_log), which takes a short SHARE lock (a few seconds at
--   most) - saves anywhere in the dashboard wait that long.
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about destructive operations. That is expected: the
--   words appear inside rules ("on delete cascade"), in functions that run
--   later (an admin removing an event, a student, or a class; old
--   rate-limit rows being cleaned up) and in "... if exists" lines that make
--   a re-run safe. Nothing is removed now. Confirm.
--   Safe to run again: "create table if not exists", "create or replace
--   function / trigger", rules and policies replaced, roles created only
--   if missing, seed rows inserted only if missing.
--   The login roles get their passwords separately (supabase/SETUP.md,
--   "Migration 0051"); NO password is in this file.
--
-- WORDS USED BELOW
--   * "today" = the date in New York / Massachusetts: public.testing_today().
--   * "version", "stale", "security definer", search_path = '': as in 0003.
--   * statuses the functions answer: ok, no_access, not_allowed, not_found,
--     stale, invalid (+ field), closed, rate_limited, price_changed,
--     already_paid, has_payments, class_in_use, refund_stands,
--     refund_too_large, amount_below_paid, link_exists, paid.
--
-- NOTES FOR THE REVIEWER (deviations from the signature sheet, all in the
--   safe direction; each is also in the report that came with this file)
--   a. brk_settings has a uuid id plus a "singleton" flag (as bb_settings,
--      0016) instead of "id = 1": the shared history writer
--      (change_log_write) needs a uuid id.
--   b. brk_square_events has an extra uuid column "id" for the same reason;
--      square_event_id stays the primary key (the replay guard).
--   c. A new event starts with registration CLOSED (admin switches it on).
--   d. The roster's "needs a look" list also shows 'already_paid' and
--      'not_card' Square messages: they are money that was NOT recorded as
--      a payment, so an admin must see them.
--   e. A Square message for a registration that is already paid is
--      'already_paid' (checked before the amount), so that outcome can
--      actually happen.
--   f. A table rule says a Square link exists only while Paying by is Card;
--      every function that moves Paying by away from Card clears the link
--      in the same update (the family's old link can then never mark
--      anybody paid: its order id is unknown to the database).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 0. The guard: this file needs 0001-0005 (helpers, locks, history).
--    Stops - and changes nothing - if one of them is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.locations') is null
     or to_regclass('public.change_log') is null
     or to_regprocedure('public.has_data_access()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.change_log_actor_name()') is null
     or to_regprocedure('public.change_log_write()') is null
     or to_regprocedure('public.current_session_id()') is null
     or to_regprocedure('public.testing_refuse_truncate()') is null
     or to_regprocedure('public.testing_normalize_name(text)') is null
     or to_regprocedure('public.testing_name_is_valid(text)') is null
     or to_regprocedure('public.testing_line_is_valid(text, integer)') is null
     or to_regprocedure('public.testing_today()') is null
     or to_regprocedure('public.testing_school_date(timestamptz)') is null
     or to_regprocedure('public.testing_new_public_code()') is null then
    raise exception '0051 needs 0001-0005 first (locations, change_log, has_data_access, is_admin, the testing_* helpers). Nothing was changed.';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 1. Small rule helpers (used by the table rules below, so they come
--    first). Nobody in the app can call them. Every one answers true /
--    false and NEVER raises an error for bad input: jsonb is checked with
--    jsonb_typeof and patterns BEFORE anything is converted.
-- ---------------------------------------------------------------------

-- 1a. brk_int_ok(p_json, p_min, p_max) - one jsonb value that must be a
-- WHOLE number from p_min to p_max: a jsonb number whose text is digits
-- only (so 9.5, 1e9 and "9" are refused), at most 6 digits, then the range.
create or replace function public.brk_int_ok(p_json jsonb, p_min integer, p_max integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_txt text;
begin
  if jsonb_typeof(p_json) is distinct from 'number' then
    return false;
  end if;
  v_txt := p_json::text;
  if v_txt !~ '^-?[0-9]{1,6}$' then
    return false;
  end if;
  return coalesce(v_txt::integer between p_min and p_max, false);
end;
$$;

revoke execute on function public.brk_int_ok(jsonb, integer, integer) from public, anon, authenticated, service_role;

-- 1b. brk_time_ok(p_time) - class times are on a 5-minute step (5:00,
-- 5:05 ...) with no seconds.
create or replace function public.brk_time_ok(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(extract(second from p_time) = 0 and extract(minute from p_time)::integer % 5 = 0, false);
$$;

revoke execute on function public.brk_time_ok(time) from public, anon, authenticated, service_role;

-- 1c. brk_technique_ok(p_text) - the chart's technique words: may be empty,
-- already tidied (one space between words, none at the ends), at most 120
-- characters, no invisible control or format characters (0003's list).
create or replace function public.brk_technique_ok(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           p_text = public.testing_normalize_name(p_text)
           and char_length(p_text) <= 120
           and p_text !~ '[\x01-\x08\x0e-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]',
         false);
$$;

revoke execute on function public.brk_technique_ok(text) from public, anon, authenticated, service_role;

-- 1d. brk_chart_arg_is_valid(p_rows) - the whole chart brk_save_chart gets:
--   [{"band":"child","rank_name":"White","sort":0,"technique":"Hammer Fist",
--     "tech_boards":3,"adult_boards":0}, ...]
-- 4 to 300 objects with exactly these 6 keys; band tiger / child / teen /
-- black; rank_name 1-60 characters (name rule); technique as 1c; sort
-- 0-999; boards 0-12; no (band, rank) twice (ignoring capitals); at least
-- one row in every band.
create or replace function public.brk_chart_arg_is_valid(p_rows jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item  jsonb;
  v_seen  text[] := '{}';
  v_bands text[] := '{}';
  v_band  text;
  v_name  text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 4 and 300 then
    return false;
  end if;
  for v_item in select x.value from jsonb_array_elements(p_rows) as x(value) loop
    if jsonb_typeof(v_item) <> 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 6
       or not (v_item ?& array['band', 'rank_name', 'sort', 'technique', 'tech_boards', 'adult_boards']) then
      return false;
    end if;
    if jsonb_typeof(v_item -> 'band') is distinct from 'string'
       or jsonb_typeof(v_item -> 'rank_name') is distinct from 'string'
       or jsonb_typeof(v_item -> 'technique') is distinct from 'string' then
      return false;
    end if;
    v_band := v_item ->> 'band';
    v_name := v_item ->> 'rank_name';
    if v_band not in ('tiger', 'child', 'teen', 'black')
       or not public.testing_line_is_valid(v_name, 60)
       or v_name <> public.testing_normalize_name(v_name)
       or not public.brk_technique_ok(v_item ->> 'technique')
       or not public.brk_int_ok(v_item -> 'sort', 0, 999)
       or not public.brk_int_ok(v_item -> 'tech_boards', 0, 12)
       or not public.brk_int_ok(v_item -> 'adult_boards', 0, 12) then
      return false;
    end if;
    if (v_band || '|' || lower(v_name)) = any (v_seen) then
      return false;   -- the same rank twice in one band
    end if;
    v_seen  := v_seen || (v_band || '|' || lower(v_name));
    v_bands := v_bands || v_band;
  end loop;
  return v_bands @> array['tiger', 'child', 'teen', 'black'];
end;
$$;

revoke execute on function public.brk_chart_arg_is_valid(jsonb) from public, anon, authenticated, service_role;

-- 1e. brk_classes_arg_is_valid(p_classes) - the class list brk_save_classes
-- gets:
--   [{"id":"<uuid>" (optional / null for a new class), "name":"Group D",
--     "start_time":"17:00", "end_time":"18:00"}, ...]
-- 0 to 20 objects; only those 4 keys (name, start_time, end_time are
-- required); name 1-60 characters; times "HH:MM" or "HH:MM:00" on a
-- 5-minute step, the end after the start; an id is a uuid written out in
-- full, none twice; no two names the same ignoring capitals and spaces.
create or replace function public.brk_classes_arg_is_valid(p_classes jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item  jsonb;
  v_names text[] := '{}';
  v_ids   text[] := '{}';
  v_name  text;
  v_start time;
  v_end   time;
begin
  if p_classes is null or jsonb_typeof(p_classes) <> 'array' or jsonb_array_length(p_classes) > 20 then
    return false;
  end if;
  for v_item in select x.value from jsonb_array_elements(p_classes) as x(value) loop
    if jsonb_typeof(v_item) <> 'object'
       or not (v_item ?& array['name', 'start_time', 'end_time'])
       or exists (select 1 from jsonb_object_keys(v_item) as k where k <> all (array['id', 'name', 'start_time', 'end_time'])) then
      return false;
    end if;
    if jsonb_typeof(v_item -> 'name') is distinct from 'string'
       or jsonb_typeof(v_item -> 'start_time') is distinct from 'string'
       or jsonb_typeof(v_item -> 'end_time') is distinct from 'string' then
      return false;
    end if;
    if (v_item ->> 'start_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$'
       or (v_item ->> 'end_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$'
       or not public.testing_name_is_valid(v_item ->> 'name') then
      return false;
    end if;
    -- (converted only after the patterns passed)
    v_start := (v_item ->> 'start_time')::time;
    v_end   := (v_item ->> 'end_time')::time;
    if v_end <= v_start or not public.brk_time_ok(v_start) or not public.brk_time_ok(v_end) then
      return false;
    end if;
    if v_item ? 'id' and jsonb_typeof(v_item -> 'id') <> 'null' then
      if jsonb_typeof(v_item -> 'id') <> 'string'
         or (v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or lower(v_item ->> 'id') = any (v_ids) then
        return false;
      end if;
      v_ids := v_ids || lower(v_item ->> 'id');
    end if;
    v_name := lower(public.testing_normalize_name(v_item ->> 'name'));
    if v_name = any (v_names) then
      return false;   -- two classes with the same name
    end if;
    v_names := v_names || v_name;
  end loop;
  return true;
end;
$$;

revoke execute on function public.brk_classes_arg_is_valid(jsonb) from public, anon, authenticated, service_role;

-- 1f. brk_student_field_error(...) - the input rules a student shares
-- everywhere (family form, Add student, Edit). Answers the NAME of the
-- first bad field, or NULL when all is fine. (Whether the rank is in the
-- chart and the class belongs to the event are checked by the functions.)
--   names 1-60 characters (0003's rule); age 1-99; rank 1-60 characters;
--   a class; boards 0-12 each and at least 1 in total; Paying by.
create or replace function public.brk_student_field_error(
  p_first_name text,
  p_last_name  text,
  p_age        integer,
  p_rank_name  text,
  p_class_id   uuid,
  p_tech       integer,
  p_adult      integer,
  p_paying_by  text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when not public.testing_name_is_valid(p_first_name) then 'first_name'
           when not public.testing_name_is_valid(p_last_name) then 'last_name'
           when p_age is null or p_age not between 1 and 99 then 'age'
           when not public.testing_line_is_valid(p_rank_name, 60) then 'rank_name'
           when p_class_id is null then 'class_id'
           when p_tech is null or p_adult is null or p_tech not between 0 and 12 or p_adult not between 0 and 12
                or p_tech + p_adult < 1 then 'boards'
           when p_paying_by is null or p_paying_by not in ('cash', 'check', 'card') then 'paying_by'
           else null
         end;
$$;

revoke execute on function public.brk_student_field_error(text, text, integer, text, uuid, integer, integer, text)
  from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. The tables. All have row security ON (section 4); the app can only
--    READ some columns; every write goes through the functions below.
-- ---------------------------------------------------------------------

-- 2a. brk_settings - ONE row (singleton, as 0016's bb_settings): the
-- prices for every event (one setting for all events) and the age line.
--   tech_cents / adult_cents   cash or check price per Technical / Adult board
--   card_extra_cents           added per board when Paying by is Card
--   same_day_extra_cents       added per board from the event date on
--   child_max_age              age this old and under -> the Child chart,
--                              older -> the Teen / Adult chart
-- It is also the version that guards the whole chart (brk_save_chart bumps
-- it), so two admins saving the chart can't overwrite each other.
create table if not exists public.brk_settings (
  id                   uuid        not null default gen_random_uuid(),
  singleton            boolean     not null default true,
  tech_cents           integer     not null,
  adult_cents          integer     not null,
  card_extra_cents     integer     not null,
  same_day_extra_cents integer     not null,
  child_max_age        smallint    not null,
  version              integer     not null default 1,
  created_at           timestamptz not null default now(),
  created_by           uuid        null,
  created_by_name      text        not null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid        null,
  updated_by_name      text        not null,

  constraint brk_settings_pkey primary key (id),
  constraint brk_settings_singleton_key unique (singleton),
  constraint brk_settings_singleton_check check (singleton),
  constraint brk_settings_cents_check
    check (tech_cents between 0 and 100000 and adult_cents between 0 and 100000
           and card_extra_cents between 0 and 100000 and same_day_extra_cents between 0 and 100000),
  constraint brk_settings_age_check check (child_max_age between 1 and 99),
  constraint brk_settings_version_check check (version >= 1)
);

comment on table public.brk_settings is
  'Board breaking prices and the Child / Teen age line: ONE row. Its version also guards the chart. Written only through brk_save_settings / brk_save_chart.';

-- 2b. brk_chart - the board chart. One row per (band, rank): the boards the
-- page recommends and the technique words. Replaced as a whole by
-- brk_save_chart.
create table if not exists public.brk_chart (
  id           uuid     not null default gen_random_uuid(),
  band         text     not null,
  rank_name    text     not null,
  sort         smallint not null,
  technique    text     not null default '',
  tech_boards  smallint not null,
  adult_boards smallint not null,

  constraint brk_chart_pkey primary key (id),
  constraint brk_chart_band_rank_key unique (band, rank_name),
  constraint brk_chart_band_check check (band in ('tiger', 'child', 'teen', 'black')),
  constraint brk_chart_rank_check
    check (coalesce(public.testing_line_is_valid(rank_name, 60) and rank_name = public.testing_normalize_name(rank_name), false)),
  constraint brk_chart_technique_check check (public.brk_technique_ok(technique)),
  constraint brk_chart_sort_check check (sort between 0 and 999),
  constraint brk_chart_boards_check check (tech_boards between 0 and 12 and adult_boards between 0 and 12)
);

comment on table public.brk_chart is
  'Board chart: boards per band and rank (tiger / child / teen / black) with the technique words. Replaced as a whole by brk_save_chart.';

-- 2c. brk_events - one night at one school.
--   registration_open  the admin's switch; the family form also needs
--                      today <= event_date
--   public_code        8 characters a-z 2-9 without i, l, o (0005's
--                      generator, as Camps); random, unique, never changes
create table if not exists public.brk_events (
  id                uuid        not null default gen_random_uuid(),
  name              text        not null,
  location_code     text        not null,
  event_date        date        not null,
  registration_open boolean     not null default false,
  public_code       text        not null,
  version           integer     not null default 1,
  created_at        timestamptz not null default now(),
  created_by        uuid        null,
  created_by_name   text        not null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid        null,
  updated_by_name   text        not null,

  constraint brk_events_pkey primary key (id),
  constraint brk_events_location_fk foreign key (location_code) references public.locations (code),
  constraint brk_events_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint brk_events_date_check check (event_date between date '2020-01-01' and date '2100-01-01'),
  constraint brk_events_public_code_key unique (public_code),
  constraint brk_events_public_code_check check (public_code ~ '^[a-hjkmnp-z2-9]{8}$'),
  constraint brk_events_version_check check (version >= 1)
);

create index if not exists brk_events_location_idx on public.brk_events (location_code, event_date);

comment on table public.brk_events is
  'Board breaking events (one school each). Written only through the brk_* functions.';
comment on column public.brk_events.public_code is
  'Code in the family link: 8 characters a-z and 2-9 without i, l, o. Random, made by the database, never changes.';

-- 2d. brk_event_classes - the class times of an event. (event_id, id) is
-- unique so a student's class can be forced to be one of ITS event's classes
-- (composite foreign key on brk_registrations).
create table if not exists public.brk_event_classes (
  id         uuid     not null default gen_random_uuid(),
  event_id   uuid     not null,
  name       text     not null,
  start_time time     not null,
  end_time   time     not null,
  sort       smallint not null,

  constraint brk_event_classes_pkey primary key (id),
  constraint brk_event_classes_event_id_key unique (id, event_id),
  constraint brk_event_classes_event_fk foreign key (event_id) references public.brk_events (id) on delete cascade,
  constraint brk_event_classes_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint brk_event_classes_times_check
    check (end_time > start_time and public.brk_time_ok(start_time) and public.brk_time_ok(end_time)),
  constraint brk_event_classes_sort_check check (sort between 0 and 99)
);

create index if not exists brk_event_classes_event_idx on public.brk_event_classes (event_id, sort);

comment on table public.brk_event_classes is
  'Class times of a board-breaking event ("Group D", 5:00-6:00 PM). A new event starts with a copy of the school''s last event''s classes.';

-- 2e. brk_registrations - one student at one event.
--   age               whole years 1-99 (NOT a date of birth)
--   band_used         which chart band the price used
--   paying_by         cash / check / card (changes with Mark paid / Edit)
--   paying_by_on_form what the family chose on the form (set by a trigger,
--                     never changes: Camps 0033's pattern)
--   same_day          was the price the event-day price (kept for good)
--   amount_cents      the price worked out by the database
--   override_cents    an admin's price replacing it (NULL = none)
--   square_order_id / square_link_url   the Square payment link, only while
--                     Paying by is Card (table rule below); never granted
--   source            'form' (family) or 'desk' (staff walk-in)
--   submission_id     the family form's retry key (never granted)
--   entered_by        who entered it ("Family form" or a staff name)
create table if not exists public.brk_registrations (
  id              uuid        not null default gen_random_uuid(),
  event_id        uuid        not null,
  class_id        uuid        not null,
  first_name      text        not null,
  last_name       text        not null,
  age             smallint    not null,
  rank_name       text        not null,
  band_used       text        not null,
  tech_boards     smallint    not null,
  adult_boards    smallint    not null,
  paying_by       text        not null,
  paying_by_on_form text      not null,
  same_day        boolean     not null,
  amount_cents    integer     not null,
  override_cents  integer     null,
  square_order_id text        null,
  square_link_url text        null,
  source          text        not null,
  broke           boolean     not null default false,
  broke_on        date        null,
  submission_id   uuid        null,
  entered_by      text        not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid        null,
  created_by_name text        not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid        null,
  updated_by_name text        not null,

  constraint brk_registrations_pkey primary key (id),
  constraint brk_registrations_event_fk foreign key (event_id) references public.brk_events (id) on delete cascade,
  constraint brk_registrations_class_fk
    foreign key (class_id, event_id) references public.brk_event_classes (id, event_id),
  constraint brk_registrations_submission_id_key unique (submission_id),
  constraint brk_registrations_first_name_check
    check (coalesce(public.testing_name_is_valid(first_name) and first_name = public.testing_normalize_name(first_name), false)),
  constraint brk_registrations_last_name_check
    check (coalesce(public.testing_name_is_valid(last_name) and last_name = public.testing_normalize_name(last_name), false)),
  constraint brk_registrations_age_check check (age between 1 and 99),
  constraint brk_registrations_rank_check
    check (coalesce(public.testing_line_is_valid(rank_name, 60) and rank_name = public.testing_normalize_name(rank_name), false)),
  constraint brk_registrations_band_check check (band_used in ('tiger', 'child', 'teen', 'black')),
  constraint brk_registrations_boards_check
    check (tech_boards between 0 and 12 and adult_boards between 0 and 12 and tech_boards + adult_boards >= 1),
  constraint brk_registrations_paying_by_check check (paying_by in ('cash', 'check', 'card')),
  constraint brk_registrations_paying_by_on_form_check check (paying_by_on_form in ('cash', 'check', 'card')),
  constraint brk_registrations_amount_check check (amount_cents between 0 and 1000000),
  constraint brk_registrations_override_check check (override_cents is null or override_cents between 0 and 1000000),
  constraint brk_registrations_link_check
    check ((square_order_id is null) = (square_link_url is null)),
  constraint brk_registrations_link_card_check
    check (square_order_id is null or paying_by = 'card'),
  constraint brk_registrations_order_id_check
    check (square_order_id is null or square_order_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  constraint brk_registrations_link_url_check
    check (square_link_url is null
           or (char_length(square_link_url) <= 2000 and square_link_url ~ '^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~:/?#@!$&''()*+,;=%-]*)?$')),
  constraint brk_registrations_source_check check (source in ('form', 'desk')),
  constraint brk_registrations_broke_check check (broke = (broke_on is not null)),
  constraint brk_registrations_entered_by_check check (char_length(entered_by) between 1 and 120),
  constraint brk_registrations_version_check check (version >= 1)
);

-- one Square order belongs to at most one student
create unique index if not exists brk_registrations_order_idx
  on public.brk_registrations (square_order_id) where square_order_id is not null;
create index if not exists brk_registrations_event_idx on public.brk_registrations (event_id, class_id);
create index if not exists brk_registrations_class_idx on public.brk_registrations (class_id);

comment on table public.brk_registrations is
  'Board breaking students (one per event). No date of birth, address, contact or signature exist here. Written only through the brk_* functions.';

-- 2f. brk_payments - append-only (a copy of 0013's camp_payments, plus
-- Star / Camps refunds from 0039):
--   kind 'payment'   1 cent ... $10,000, reverses nothing
--   kind 'refund'    minus 1 cent ... $10,000, cash or check only, reverses
--                    nothing (its own negative row)
--   kind 'reversal'  undoes one payment or refund: exactly minus its
--                    amount, at its school, reverses_payment_id unique
--   school           the desk that took (or handed back) the money; for a
--                    Square payment the EVENT'S school (no desk took it)
--   recorded_by_name 'Square' for a webhook payment
--   paying_by_before see Camps 0033 (what Undo puts back); never granted
--   square_payment_id the Square payment (unique: a second message about the
--                    same payment can never make a second payment); never granted
create table if not exists public.brk_payments (
  id                  uuid        not null default gen_random_uuid(),
  registration_id     uuid        not null,
  kind                text        not null,
  amount_cents        integer     not null,
  method              text        not null,
  paid_on             date        not null,
  school              text        not null,
  recorded_at         timestamptz not null default now(),
  recorded_by         uuid        null,       -- login id; not readable by the app
  recorded_by_name    text        not null,
  reverses_payment_id uuid        null,
  paying_by_before    text        null,
  square_payment_id   text        null,

  constraint brk_payments_pkey primary key (id),
  constraint brk_payments_registration_fk foreign key (registration_id) references public.brk_registrations (id),
  constraint brk_payments_school_fk foreign key (school) references public.locations (code),
  constraint brk_payments_reverses_fk foreign key (reverses_payment_id) references public.brk_payments (id),
  constraint brk_payments_reverses_key unique (reverses_payment_id),
  constraint brk_payments_square_payment_id_key unique (square_payment_id),
  constraint brk_payments_kind_check
    check ((kind = 'payment' and amount_cents between 1 and 1000000 and reverses_payment_id is null)
           or (kind = 'refund' and amount_cents between -1000000 and -1 and reverses_payment_id is null
               and method in ('cash', 'check'))
           or (kind = 'reversal' and amount_cents between -1000000 and 1000000 and amount_cents <> 0
               and reverses_payment_id is not null)),
  constraint brk_payments_method_check check (method in ('cash', 'check', 'card')),
  constraint brk_payments_paying_by_before_check
    check (paying_by_before is null
           or (kind = 'payment' and paying_by_before in ('cash', 'check', 'card') and paying_by_before <> method)),
  constraint brk_payments_square_check
    check (square_payment_id is null
           or (kind = 'payment' and method = 'card' and square_payment_id ~ '^[A-Za-z0-9_.:-]{1,200}$')),
  constraint brk_payments_name_check check (char_length(recorded_by_name) between 1 and 120)
);

create index if not exists brk_payments_registration_idx on public.brk_payments (registration_id);

comment on table public.brk_payments is
  'Board breaking payments and refunds, append-only: corrections are reversal rows. Never removed.';

-- 2g. brk_public_attempts - one row per call of the family form (for the
-- rate limit). client_key: an HMAC the Cloudflare Function makes from the
-- visitor's address with a secret - never the raw address. Rows older than
-- 2 days are removed by brk_public_signup itself. Nobody in the app can
-- read it (RLS on, no rule, no grants); not part of the history.
create table if not exists public.brk_public_attempts (
  id         bigint      generated always as identity,
  client_key text        not null,
  event_id   uuid        null,       -- no foreign key: the attempt outlives a removed event
  at         timestamptz not null default now(),
  outcome    text        not null,   -- the status the call answered

  constraint brk_public_attempts_pkey primary key (id)
);

create index if not exists brk_public_attempts_client_idx on public.brk_public_attempts (client_key, at);
create index if not exists brk_public_attempts_event_idx  on public.brk_public_attempts (event_id, at);
create index if not exists brk_public_attempts_at_idx     on public.brk_public_attempts (at);

comment on table public.brk_public_attempts is
  'Rate-limit ledger for the board-breaking family form (hashed client key, never a raw address). Not readable by any client role; kept 2 days.';

-- 2h. brk_square_events - every Square message ever received, one row each.
-- square_event_id is the PRIMARY KEY: the replay guard (Square sends a
-- message again when we answer late; the same id never does anything twice).
--   school           the endpoint the message arrived on (from the address,
--                    never from the message body)
--   outcome          what the database did with it (see the check)
--   registration_id  the student it matched (NULL when none)
--   reviewed         an admin dismissed it from the "needs a look" list
--   id               a plain row id so the shared history writer can log it
create table if not exists public.brk_square_events (
  square_event_id text        not null,
  id              uuid        not null default gen_random_uuid(),
  school          text        not null,
  received_at     timestamptz not null default now(),
  type            text        not null,
  payment_id      text        null,
  order_id        text        null,
  amount_cents    integer     not null,
  outcome         text        not null,
  registration_id uuid        null,
  reviewed        boolean     not null default false,

  constraint brk_square_events_pkey primary key (square_event_id),
  constraint brk_square_events_id_key unique (id),
  constraint brk_square_events_school_fk foreign key (school) references public.locations (code),
  constraint brk_square_events_registration_fk
    foreign key (registration_id) references public.brk_registrations (id) on delete set null,
  constraint brk_square_events_event_id_check check (square_event_id ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  constraint brk_square_events_type_check check (char_length(type) between 1 and 60),
  constraint brk_square_events_ids_check
    check ((payment_id is null or payment_id ~ '^[A-Za-z0-9_.:-]{1,200}$')
           and (order_id is null or order_id ~ '^[A-Za-z0-9_-]{1,100}$')),
  constraint brk_square_events_outcome_check
    check (outcome in ('paid', 'duplicate', 'unknown_order', 'amount_mismatch', 'not_card', 'not_completed',
                       'already_paid', 'wrong_school', 'link_cleared'))
);

create index if not exists brk_square_events_review_idx
  on public.brk_square_events (school, received_at) where not reviewed;
create index if not exists brk_square_events_registration_idx
  on public.brk_square_events (registration_id) where registration_id is not null;

comment on table public.brk_square_events is
  'Every Square message ever received. The primary key is the replay guard. Not readable by any client role; admins see unmatched money through brk_event_roster.';

-- 2i. brk_cleared_links - the Square order ids whose payment link was
-- CLEARED (Paying by left Card, the amount changed, ...), with the student
-- they belonged to. A trigger on brk_registrations (3g) writes one row every
-- time a student's order id goes from set to empty, so every clearing place
-- is covered at once. We do not cancel the link at Square: an old link stops
-- counting, and if someone still pays it, brk_square_payment recognises the
-- order id here and answers link_cleared (no payment is written; the money
-- is in Square, so an admin sees it with the student's name). Nobody in the
-- app can read it (RLS on, no rule, no grants). Rows go with their student.
create table if not exists public.brk_cleared_links (
  order_id        text        not null,
  registration_id uuid        not null,
  cleared_at      timestamptz not null default now(),

  constraint brk_cleared_links_pkey primary key (order_id),
  constraint brk_cleared_links_registration_fk
    foreign key (registration_id) references public.brk_registrations (id) on delete cascade,
  constraint brk_cleared_links_order_id_check check (order_id ~ '^[A-Za-z0-9_-]{1,100}$')
);

create index if not exists brk_cleared_links_registration_idx on public.brk_cleared_links (registration_id);

comment on table public.brk_cleared_links is
  'Square order ids whose payment link was cleared, with their student. Written only by a trigger on brk_registrations. Not readable by any client role.';


-- ---------------------------------------------------------------------
-- 3. Trigger functions (run automatically on every write)
--    "Bookkeeping" columns = version, created_*, updated_*. On insert the
--    trigger sets them, whatever the writer supplied; on update created_*
--    never change, the columns named as FIXED can't change at all, and ANY
--    other change bumps the version and stamps "last changed by". A function
--    may also ask for a bump on purpose by writing version + 1 (e.g. Mark
--    paid), so a second screen with the old version gets "stale".
--    Errors use errcode 23514 (check_violation) with a constraint name
--    saying which rule, like 0003 / 0013.
-- ---------------------------------------------------------------------

-- 3a. brk_before_write() - BEFORE INSERT OR UPDATE on settings, events and
-- registrations. Two arguments (written where the trigger is attached): the
-- comma-separated columns that may never change.
create or replace function public.brk_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fixed text[] := coalesce(string_to_array(nullif(tg_argv[0], ''), ','), '{}');
  v_book  text[] := array['version', 'created_at', 'updated_at', 'created_by', 'updated_by',
                          'created_by_name', 'updated_by_name'];
  v_new   jsonb;
  v_old   jsonb;
  v_col   text;
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

  v_new := to_jsonb(new);
  v_old := to_jsonb(old);
  foreach v_col in array v_fixed loop
    if v_new -> v_col is distinct from v_old -> v_col then
      raise exception using
        errcode    = '23514',
        constraint = tg_table_name || '_immutable',
        message    = format('%s.%s can''t change', tg_table_name, v_col);
    end if;
  end loop;

  new.created_at      := old.created_at;
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;

  if (v_new - v_book) is distinct from (v_old - v_book)
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

revoke execute on function public.brk_before_write() from public, anon, authenticated, service_role;

-- 3b. brk_registrations_keep_form_choice() - BEFORE INSERT OR UPDATE on
-- students (Camps 0033's pattern):
--   insert: paying_by_on_form := paying_by (whatever the caller sent)
--   update: paying_by_on_form := the old value (whatever the caller sent)
-- Named ..._before_form_choice so it runs BEFORE brk_before_write (Postgres
-- runs a table's BEFORE triggers in name order), so an update that only
-- tried to change this column is already "no change" when the bookkeeping
-- trigger looks: no version bump, no history row.
create or replace function public.brk_registrations_keep_form_choice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.paying_by_on_form := new.paying_by;
  else
    new.paying_by_on_form := old.paying_by_on_form;
  end if;
  return new;
end;
$$;

revoke execute on function public.brk_registrations_keep_form_choice() from public, anon, authenticated, service_role;

-- 3c. brk_event_classes_guard() - BEFORE UPDATE on classes: a class never
-- moves to another event (and its id never changes).
create or replace function public.brk_event_classes_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.event_id is distinct from old.event_id then
    raise exception using
      errcode    = '23514',
      constraint = 'brk_event_classes_immutable',
      message    = 'a class''s id and event can''t change';
  end if;
  return new;
end;
$$;

revoke execute on function public.brk_event_classes_guard() from public, anon, authenticated, service_role;

-- 3d. brk_payments_guard() - keeps payments append-only (0013's 13h with
-- 0039's refund rules):
--   BEFORE INSERT: a reversal must undo a real PAYMENT or REFUND (never a
--                  reversal) of the same student, for exactly minus its
--                  amount, at the same school; and no new row may make the
--                  student's rows add up to less than 0
--   BEFORE UPDATE / DELETE: always refused (a payment is never changed or
--                  removed; a student or event with payments can't be
--                  removed at all)
-- Limit: the database owner could switch this trigger off on purpose; it
-- stops mistakes and the app, not a deliberate owner.
create or replace function public.brk_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reversed public.brk_payments;
  v_net      bigint;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'reversal' then
      select * into v_reversed from public.brk_payments p where p.id = new.reverses_payment_id;
      if not found
         or v_reversed.kind not in ('payment', 'refund')
         or v_reversed.registration_id <> new.registration_id
         or new.amount_cents <> -v_reversed.amount_cents
         or new.school <> v_reversed.school then
        raise exception using
          errcode    = '23514',
          constraint = 'brk_payments_reversal_check',
          message    = 'a reversal must undo one payment or refund of the same student, for exactly minus its amount, at its school';
      end if;
    end if;
    select coalesce(sum(p.amount_cents), 0) into v_net
      from public.brk_payments p where p.registration_id = new.registration_id;
    if v_net + new.amount_cents < 0 then
      raise exception using
        errcode    = '23514',
        constraint = 'brk_payments_net_check',
        message    = 'a student''s payments can''t add up to less than zero';
    end if;
    return new;
  end if;

  raise exception 'brk_payments is append-only (use a reversal)';
end;
$$;

revoke execute on function public.brk_payments_guard() from public, anon, authenticated, service_role;

-- 3e. brk_square_events_guard() - BEFORE UPDATE OR DELETE on Square messages:
--   update: only "reviewed" may change, and only false -> true (an admin
--           dismissed it); registration_id may become NULL (the student
--           was removed - the foreign key's own step)
--   delete: always refused (the replay guard must never forget an id)
create or replace function public.brk_square_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'brk_square_events is append-only';
  end if;
  if (to_jsonb(new) - array['reviewed', 'registration_id']) is distinct from (to_jsonb(old) - array['reviewed', 'registration_id'])
     or (new.reviewed is distinct from old.reviewed and not (new.reviewed and not old.reviewed))
     or (new.registration_id is distinct from old.registration_id and new.registration_id is not null) then
    raise exception using
      errcode    = '23514',
      constraint = 'brk_square_events_immutable',
      message    = 'a Square message can only be marked reviewed';
  end if;
  return new;
end;
$$;

revoke execute on function public.brk_square_events_guard() from public, anon, authenticated, service_role;

-- 3g. brk_registrations_remember_link() - BEFORE UPDATE on students: when a
-- student's Square order id goes from set to empty (whatever cleared it),
-- remember the old order id and the student in brk_cleared_links (an id
-- already remembered is left as it is). Runs inside the same update, so it
-- can't be skipped. Not security definer: the writers are the security
-- definer functions below (owned by the database owner).
create or replace function public.brk_registrations_remember_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.square_order_id is not null and new.square_order_id is null then
    insert into public.brk_cleared_links (order_id, registration_id)
    values (old.square_order_id, old.id)
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.brk_registrations_remember_link() from public, anon, authenticated, service_role;

-- 3f. Attach the triggers ("create or replace trigger" = replace).
create or replace trigger brk_settings_before_write
  before insert or update on public.brk_settings
  for each row execute function public.brk_before_write('id,singleton', '');

create or replace trigger brk_events_before_write
  before insert or update on public.brk_events
  for each row execute function public.brk_before_write('id,location_code,public_code', '');

create or replace trigger brk_registrations_before_form_choice
  before insert or update on public.brk_registrations
  for each row execute function public.brk_registrations_keep_form_choice();

create or replace trigger brk_registrations_before_write
  before insert or update on public.brk_registrations
  for each row execute function public.brk_before_write('id,event_id,submission_id,source,entered_by,same_day', '');

create or replace trigger brk_registrations_before_link_clear
  before update on public.brk_registrations
  for each row execute function public.brk_registrations_remember_link();

create or replace trigger brk_event_classes_guard
  before update on public.brk_event_classes
  for each row execute function public.brk_event_classes_guard();

create or replace trigger brk_payments_guard
  before insert or update or delete on public.brk_payments
  for each row execute function public.brk_payments_guard();

create or replace trigger brk_square_events_guard
  before update or delete on public.brk_square_events
  for each row execute function public.brk_square_events_guard();

-- History: 0003's change_log_write for every table that holds records
-- (brk_public_attempts is a rate-limit ledger and is not logged).
create or replace trigger brk_settings_log
  after insert or update or delete on public.brk_settings
  for each row execute function public.change_log_write();

create or replace trigger brk_chart_log
  after insert or update or delete on public.brk_chart
  for each row execute function public.change_log_write();

create or replace trigger brk_events_log
  after insert or update or delete on public.brk_events
  for each row execute function public.change_log_write();

create or replace trigger brk_event_classes_log
  after insert or update or delete on public.brk_event_classes
  for each row execute function public.change_log_write();

create or replace trigger brk_registrations_log
  after insert or update or delete on public.brk_registrations
  for each row execute function public.change_log_write();

create or replace trigger brk_payments_log
  after insert or update or delete on public.brk_payments
  for each row execute function public.change_log_write();

create or replace trigger brk_square_events_log
  after insert or update or delete on public.brk_square_events
  for each row execute function public.change_log_write();

-- No "empty the whole table" shortcut (it would skip the history), as 0003.
create or replace trigger brk_settings_no_truncate
  before truncate on public.brk_settings
  for each statement execute function public.testing_refuse_truncate();

create or replace trigger brk_chart_no_truncate
  before truncate on public.brk_chart
  for each statement execute function public.testing_refuse_truncate();

create or replace trigger brk_events_no_truncate
  before truncate on public.brk_events
  for each statement execute function public.testing_refuse_truncate();

create or replace trigger brk_event_classes_no_truncate
  before truncate on public.brk_event_classes
  for each statement execute function public.testing_refuse_truncate();

create or replace trigger brk_registrations_no_truncate
  before truncate on public.brk_registrations
  for each statement execute function public.testing_refuse_truncate();

create or replace trigger brk_payments_no_truncate
  before truncate on public.brk_payments
  for each statement execute function public.testing_refuse_truncate();

create or replace trigger brk_square_events_no_truncate
  before truncate on public.brk_square_events
  for each statement execute function public.testing_refuse_truncate();


-- ---------------------------------------------------------------------
-- 4. Security rules: RLS + grants (the same two layers as 0003 / 0013)
--   * grants: which COLUMNS the app may read - SELECT only, never the
--     Square link / order id, the family form's retry key, the Square
--     payment id, the way-to-pay Undo memory, or any login id (created_by,
--     updated_by, recorded_by). No INSERT / UPDATE / DELETE for anyone in
--     the app. Nothing at all for anon, service_role or the two new roles.
--   * RLS: which ROWS - every row, but only while has_data_access() is
--     true (unlocked, signed in, not PIN-locked, password within 7 days).
--     brk_public_attempts and brk_square_events: RLS on, no rule, no
--     grants = nobody (admins see unmatched Square money through
--     brk_event_roster).
-- ---------------------------------------------------------------------
alter table public.brk_settings        enable row level security;
alter table public.brk_chart           enable row level security;
alter table public.brk_events          enable row level security;
alter table public.brk_event_classes   enable row level security;
alter table public.brk_registrations   enable row level security;
alter table public.brk_payments        enable row level security;
alter table public.brk_public_attempts enable row level security;
alter table public.brk_square_events   enable row level security;
alter table public.brk_cleared_links   enable row level security;

-- Start from zero (also removes column grants, so re-runs stay clean)...
revoke all on table public.brk_settings, public.brk_chart, public.brk_events, public.brk_event_classes,
                    public.brk_registrations, public.brk_payments, public.brk_public_attempts,
                    public.brk_square_events, public.brk_cleared_links
  from public, anon, authenticated, service_role;
revoke all on sequence public.brk_public_attempts_id_seq from public, anon, authenticated, service_role;

-- ...then add back exactly what the app reads.
grant select (id, tech_cents, adult_cents, card_extra_cents, same_day_extra_cents, child_max_age, version,
              created_at, created_by_name, updated_at, updated_by_name)
  on public.brk_settings to authenticated;                -- NOT singleton, created_by, updated_by
grant select (id, band, rank_name, sort, technique, tech_boards, adult_boards)
  on public.brk_chart to authenticated;
grant select (id, name, location_code, event_date, registration_open, public_code, version,
              created_at, created_by_name, updated_at, updated_by_name)
  on public.brk_events to authenticated;                  -- NOT created_by, updated_by
grant select (id, event_id, name, start_time, end_time, sort)
  on public.brk_event_classes to authenticated;
grant select (id, event_id, class_id, first_name, last_name, age, rank_name, band_used, tech_boards, adult_boards,
              paying_by, paying_by_on_form, same_day, amount_cents, override_cents, source, broke, broke_on,
              entered_by, version, created_at, created_by_name, updated_at, updated_by_name)
  on public.brk_registrations to authenticated;           -- NOT square_order_id, square_link_url, submission_id, created_by, updated_by
grant select (id, registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by_name,
              reverses_payment_id)
  on public.brk_payments to authenticated;                -- NOT recorded_by, paying_by_before, square_payment_id

-- Read rules ("(select ...)" = run the check once per query, not per row).
drop policy if exists brk_settings_select_with_access on public.brk_settings;
create policy brk_settings_select_with_access
  on public.brk_settings for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists brk_chart_select_with_access on public.brk_chart;
create policy brk_chart_select_with_access
  on public.brk_chart for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists brk_events_select_with_access on public.brk_events;
create policy brk_events_select_with_access
  on public.brk_events for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists brk_event_classes_select_with_access on public.brk_event_classes;
create policy brk_event_classes_select_with_access
  on public.brk_event_classes for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists brk_registrations_select_with_access on public.brk_registrations;
create policy brk_registrations_select_with_access
  on public.brk_registrations for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists brk_payments_select_with_access on public.brk_payments;
create policy brk_payments_select_with_access
  on public.brk_payments for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 5. The two restricted logins: brk_registrar and brk_square
-- Same as 0013's camps_registrar: the Cloudflare Function (through its own
-- Hyperdrive config) signs in as one of these roles. brk_registrar can run
-- exactly the four public functions (section 9), brk_square exactly one
-- (section 10). They have no rights on any table, view or sequence, can't
-- create anything, aren't part of any other role, and Supabase's API (the
-- "authenticator" login) can never switch into them.
--   login              they can sign in (the password is set separately -
--                      supabase/SETUP.md "Migration 0051". NO password here.)
--   noinherit ...      no inherited rights, can't create databases or roles,
--                      can't skip RLS, can't replicate
--   connection limit   5 (registrar) / 3 (square) connections at once
--   statement_timeout 5s, idle_in_transaction_session_timeout 10s: a stuck
--                      call is cut off instead of holding locks
--   search_path ''     nothing is found without its schema name
-- Created only if missing, so re-running this file never touches an
-- existing role's attributes or password (e.g. after the emergency
-- "nologin" it stays switched off).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'brk_registrar') then
    create role brk_registrar login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'brk_square') then
    create role brk_square login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 3;
  end if;
end
$$;

alter role brk_registrar set statement_timeout = '5s';
alter role brk_registrar set idle_in_transaction_session_timeout = '10s';
alter role brk_registrar set search_path = '';
alter role brk_square set statement_timeout = '5s';
alter role brk_square set idle_in_transaction_session_timeout = '10s';
alter role brk_square set search_path = '';

-- They need to find their functions in schema public, nothing more.
grant usage on schema public to brk_registrar;
grant usage on schema public to brk_square;


-- ---------------------------------------------------------------------
-- 6. Internal helpers used by the functions (nobody can call them)
-- ---------------------------------------------------------------------

-- 6a. brk_price(age, rank, tech, adult, paying_by, same_day) - the price
-- maths (see the header). Answers ONE row (band_used, amount_cents) or NO
-- row when the rank isn't in that band of the chart. Reads the settings
-- row and the chart; knows nothing about events or students.
create or replace function public.brk_price(
  p_age       integer,
  p_rank_name text,
  p_tech      integer,
  p_adult     integer,
  p_paying_by text,
  p_same_day  boolean
)
returns table (band_used text, amount_cents integer)
language sql
stable
set search_path = ''
as $$
  select b.band,
         (p_tech  * (s.tech_cents  + case when p_paying_by = 'card' then s.card_extra_cents else 0 end
                                   + case when p_same_day then s.same_day_extra_cents else 0 end)
        + p_adult * (s.adult_cents + case when p_paying_by = 'card' then s.card_extra_cents else 0 end
                                   + case when p_same_day then s.same_day_extra_cents else 0 end))::integer
    from public.brk_settings s
    cross join lateral (
      select case
               when exists (select 1 from public.brk_chart c where c.band = 'black' and c.rank_name = p_rank_name)
                 then 'black'
               when p_rank_name ~* '^little tiger( |$)'
                    or exists (select 1 from public.brk_chart c where c.band = 'tiger' and c.rank_name = p_rank_name)
                 then 'tiger'
               when p_age <= s.child_max_age then 'child'
               else 'teen'
             end as band) as b
    join public.brk_chart ch on ch.band = b.band and ch.rank_name = p_rank_name;
$$;

revoke execute on function public.brk_price(integer, text, integer, integer, text, boolean)
  from public, anon, authenticated, service_role;

-- 6b. brk_paid_cents(registration) = all payment rows added up (reversals
-- and refunds are negative or cancel out); brk_owed_cents(registration) =
-- the override when set, else the price. Owes = owed - paid.
create or replace function public.brk_paid_cents(p_registration_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(p.amount_cents), 0)::integer from public.brk_payments p where p.registration_id = p_registration_id;
$$;

revoke execute on function public.brk_paid_cents(uuid) from public, anon, authenticated, service_role;

create or replace function public.brk_owed_cents(p_registration_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(r.override_cents, r.amount_cents) from public.brk_registrations r where r.id = p_registration_id;
$$;

revoke execute on function public.brk_owed_cents(uuid) from public, anon, authenticated, service_role;

-- 6c. The lock helpers. Every function locks in the SAME order, so two
-- calls can never wait for each other in a circle:
--   the event ("for no key update", or "for update" when the event itself
--   changes) -> the student ("for update") -> its payment ("for update").
-- Each starts by saying "wait at most 5 seconds for a lock" (this
-- transaction only): a stuck call ends with lock_not_available, which the
-- functions answer as stale, instead of waiting for the 5-second
-- statement_timeout of the public logins.
create or replace function public.brk_lock_event(p_event_id uuid, p_exclusive boolean)
returns public.brk_events
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_e public.brk_events;
begin
  perform set_config('lock_timeout', '5s', true);
  if p_exclusive then
    select * into v_e from public.brk_events e where e.id = p_event_id for update;
  else
    select * into v_e from public.brk_events e where e.id = p_event_id for no key update;
  end if;
  return v_e;   -- all fields NULL when there is no such event
end;
$$;

revoke execute on function public.brk_lock_event(uuid, boolean) from public, anon, authenticated, service_role;

create or replace function public.brk_lock_registration(p_registration_id uuid)
returns public.brk_registrations
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_r        public.brk_registrations;
begin
  select r.event_id into v_event_id from public.brk_registrations r where r.id = p_registration_id;
  if not found then
    return null;
  end if;
  perform public.brk_lock_event(v_event_id, false);
  select * into v_r from public.brk_registrations r where r.id = p_registration_id for update;
  return v_r;   -- all fields NULL when it vanished meanwhile
end;
$$;

revoke execute on function public.brk_lock_registration(uuid) from public, anon, authenticated, service_role;

create or replace function public.brk_lock_payment(p_payment_id uuid)
returns public.brk_payments
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_registration_id uuid;
  v_r               public.brk_registrations;
  v_p               public.brk_payments;
begin
  select p.registration_id into v_registration_id from public.brk_payments p where p.id = p_payment_id;
  if not found then
    return null;
  end if;
  v_r := public.brk_lock_registration(v_registration_id);
  if v_r.id is null then
    return null;
  end if;
  select * into v_p from public.brk_payments p where p.id = p_payment_id for update;
  return v_p;
end;
$$;

revoke execute on function public.brk_lock_payment(uuid) from public, anon, authenticated, service_role;

-- 6d. brk_history_strip(row) - takes every login id out of a history row's
-- before / after (History shows who by NAME only), and the things that must
-- never reach a screen: the family form's retry key and the Square link /
-- order / payment ids. NULL stays NULL. Nobody in the app may call it.
create or replace function public.brk_history_strip(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
           when p_row is null then null
           else p_row - array['created_by', 'updated_by', 'recorded_by', 'submission_id',
                              'square_order_id', 'square_link_url', 'square_payment_id']
         end;
$$;

revoke execute on function public.brk_history_strip(jsonb) from public, anon, authenticated, service_role;

-- 6e. One index so the History reader finds a student's payments fast:
-- their INSERT rows in change_log, by the registration_id inside "after"
-- (Camps 0033's pattern). Partial: only brk_payments' insert rows, so every
-- other history row costs nothing extra.
create index if not exists change_log_brk_registration_idx
  on public.change_log ((after ->> 'registration_id'))
  where op = 'insert' and table_name = 'brk_payments';


-- ---------------------------------------------------------------------
-- 7. Staff reads (staff and admins; has_data_access() first, so a locked,
--    PIN-locked, signed-out or stale session reads nothing). Read-only.
--    Never return the Square link / order id, the family form's retry key,
--    the Square payment id or any login id.
-- ---------------------------------------------------------------------

-- 7a. brk_settings_get() - prices, the age line and the chart.
-- Ok: {"status":"ok","settings":{tech_cents, adult_cents, card_extra_cents,
--      same_day_extra_cents, child_max_age, version},
--      "chart":[{id, band, rank_name, sort, technique, tech_boards, adult_boards}]}
create or replace function public.brk_settings_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'settings', (select jsonb_build_object('tech_cents', s.tech_cents, 'adult_cents', s.adult_cents,
                                           'card_extra_cents', s.card_extra_cents,
                                           'same_day_extra_cents', s.same_day_extra_cents,
                                           'child_max_age', s.child_max_age, 'version', s.version)
                   from public.brk_settings s limit 1),
    'chart', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'band', c.band, 'rank_name', c.rank_name,
                                                           'sort', c.sort, 'technique', c.technique,
                                                           'tech_boards', c.tech_boards, 'adult_boards', c.adult_boards)
                                        order by case c.band when 'tiger' then 1 when 'child' then 2
                                                             when 'teen' then 3 else 4 end,
                                                 c.sort, c.rank_name)
                         from public.brk_chart c), '[]'::jsonb));
end;
$$;

revoke execute on function public.brk_settings_get() from public, anon, authenticated, service_role;
grant  execute on function public.brk_settings_get() to authenticated;

-- 7b. brk_events_list(p_location_code) - the events of one school, or of
-- both ('both'), newest first. registered = students; paid = students whose
-- payments add up to what they owe.
-- Ok: {"status":"ok","events":[{id, name, location_code, event_date,
--      registration_open, public_code, registered, paid, version}]}
create or replace function public.brk_events_list(p_location_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if p_location_code is null
     or (p_location_code <> 'both' and not exists (select 1 from public.locations l where l.code = p_location_code)) then
    return jsonb_build_object('status', 'invalid', 'field', 'location_code');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'name', e.name, 'location_code', e.location_code, 'event_date', e.event_date,
               'registration_open', e.registration_open, 'public_code', e.public_code,
               'registered', (select count(*) from public.brk_registrations r where r.event_id = e.id),
               'paid', (select count(*)
                          from public.brk_registrations r
                         where r.event_id = e.id
                           and coalesce((select sum(p.amount_cents) from public.brk_payments p where p.registration_id = r.id), 0)
                               >= coalesce(r.override_cents, r.amount_cents)),
               'version', e.version)
             order by e.event_date desc, e.created_at desc, e.id)
        from public.brk_events e
       where p_location_code = 'both' or e.location_code = p_location_code), '[]'::jsonb));
end;
$$;

revoke execute on function public.brk_events_list(text) from public, anon, authenticated, service_role;
grant  execute on function public.brk_events_list(text) to authenticated;

-- 7c. brk_event_roster(p_event_id) - the roster page: the event with its
-- classes, every student with their payments, and (admins only) the Square
-- messages that need a look: unreviewed 'unknown_order', 'amount_mismatch',
-- 'wrong_school', 'already_paid', 'not_card' and 'link_cleared' messages that
-- arrived at the event's school (money that was NOT recorded as a payment).
-- A link_cleared row also names the student (registration_id, first_name,
-- last_name: someone paid an old, cleared link); every other row has those
-- three empty. A non-admin gets an empty list.
-- Ok: {"status":"ok","event":{id, name, location_code, event_date,
--      registration_open, public_code, version, classes:[{id, name,
--      start_time, end_time, sort}]},
--      "registrations":[{id, class_id, first_name, last_name, age,
--      rank_name, band_used, tech_boards, adult_boards, paying_by,
--      paying_by_on_form, same_day, amount_cents, override_cents,
--      owed_cents, paid_cents, broke, broke_on, has_link, source, version,
--      created_at, payments:[{id, kind, amount_cents, method, paid_on,
--      school, recorded_at, recorded_by_name, reverses_payment_id}]}],
--      "needs_look":[{square_event_id, received_at, outcome, amount_cents,
--      order_id, registration_id, first_name, last_name}]}
create or replace function public.brk_event_roster(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.brk_events;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if p_event_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_e from public.brk_events e where e.id = p_event_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'event', jsonb_build_object(
      'id', v_e.id, 'name', v_e.name, 'location_code', v_e.location_code, 'event_date', v_e.event_date,
      'registration_open', v_e.registration_open, 'public_code', v_e.public_code, 'version', v_e.version,
      'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
                                                               'start_time', left(c.start_time::text, 5),
                                                               'end_time', left(c.end_time::text, 5),
                                                               'sort', c.sort)
                                            order by c.sort, c.start_time, c.id)
                             from public.brk_event_classes c where c.event_id = v_e.id), '[]'::jsonb)),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'class_id', r.class_id, 'first_name', r.first_name, 'last_name', r.last_name,
               'age', r.age, 'rank_name', r.rank_name, 'band_used', r.band_used,
               'tech_boards', r.tech_boards, 'adult_boards', r.adult_boards,
               'paying_by', r.paying_by, 'paying_by_on_form', r.paying_by_on_form, 'same_day', r.same_day,
               'amount_cents', r.amount_cents, 'override_cents', r.override_cents,
               'owed_cents', coalesce(r.override_cents, r.amount_cents),
               'paid_cents', coalesce((select sum(p.amount_cents) from public.brk_payments p where p.registration_id = r.id), 0),
               'broke', r.broke, 'broke_on', r.broke_on,
               'has_link', (r.square_link_url is not null),
               'source', r.source, 'version', r.version, 'created_at', r.created_at,
               'payments', coalesce((select jsonb_agg(jsonb_build_object(
                                              'id', p.id, 'kind', p.kind, 'amount_cents', p.amount_cents,
                                              'method', p.method, 'paid_on', p.paid_on, 'school', p.school,
                                              'recorded_at', p.recorded_at, 'recorded_by_name', p.recorded_by_name,
                                              'reverses_payment_id', p.reverses_payment_id)
                                            order by p.recorded_at, p.id)
                                       from public.brk_payments p where p.registration_id = r.id), '[]'::jsonb))
             order by cl.sort, cl.start_time, lower(r.last_name), lower(r.first_name), r.created_at, r.id)
        from public.brk_registrations r
        join public.brk_event_classes cl on cl.id = r.class_id
       where r.event_id = v_e.id), '[]'::jsonb),
    'needs_look', case
                    when public.is_admin() is true then
                      coalesce((select jsonb_agg(jsonb_build_object(
                                         'square_event_id', x.square_event_id, 'received_at', x.received_at,
                                         'outcome', x.outcome, 'amount_cents', x.amount_cents, 'order_id', x.order_id,
                                         'registration_id', x.registration_id,
                                         'first_name', x.first_name, 'last_name', x.last_name)
                                       order by x.received_at desc, x.square_event_id)
                                  from (select s.square_event_id, s.received_at, s.outcome, s.amount_cents, s.order_id,
                                               case when s.outcome = 'link_cleared' then s.registration_id end as registration_id,
                                               case when s.outcome = 'link_cleared' then g.first_name end as first_name,
                                               case when s.outcome = 'link_cleared' then g.last_name end as last_name
                                          from public.brk_square_events s
                                          left join public.brk_registrations g on g.id = s.registration_id
                                         where s.school = v_e.location_code
                                           and not s.reviewed
                                           and s.outcome in ('unknown_order', 'amount_mismatch', 'wrong_school',
                                                             'already_paid', 'not_card', 'link_cleared')
                                         order by s.received_at desc, s.square_event_id
                                         limit 50) as x), '[]'::jsonb)
                    else '[]'::jsonb
                  end);
end;
$$;

revoke execute on function public.brk_event_roster(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.brk_event_roster(uuid) to authenticated;

-- 7d. brk_registration_history(p_registration_id) - the History line of a
-- student: newest first, at most 500 rows - the change_log rows of the
-- student and of their payments (found through the payment's INSERT row,
-- whose "after" names this registration_id). Each row: occurred_at,
-- actor_name, action, table_name, op, batch_id, before, after - with every
-- login id, the retry key and the Square ids removed (6d). Never actor_id or
-- session_id.
-- Ok: {"status":"ok","rows":[...]}
create or replace function public.brk_registration_history(p_registration_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_registration_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- (not found after Delete: the history of a removed student stays in
    -- change_log but isn't shown)
    if not exists (select 1 from public.brk_registrations r where r.id = p_registration_id) then
      return jsonb_build_object('status', 'not_found');
    end if;

    return jsonb_build_object(
      'status', 'ok',
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                           'occurred_at', h.occurred_at,
                           'actor_name',  h.actor_name,
                           'action',      h.action,
                           'table_name',  h.table_name,
                           'op',          h.op,
                           'batch_id',    h.batch_id,
                           'before',      public.brk_history_strip(h.before),
                           'after',       public.brk_history_strip(h.after))
                         order by h.occurred_at desc, h.id desc)
          from (select u.id, u.occurred_at, u.actor_name, u.action, u.table_name, u.op, u.batch_id, u.before, u.after
                  from (select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.batch_id, l.before, l.after
                          from public.change_log l
                         where l.table_name = 'brk_registrations' and l.record_id = p_registration_id
                        union all
                        select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.batch_id, l.before, l.after
                          from public.change_log l
                         where l.table_name = 'brk_payments'
                           and l.record_id in (select i.record_id
                                                 from public.change_log i
                                                where i.op = 'insert'
                                                  and i.table_name = 'brk_payments'
                                                  and i.after ->> 'registration_id' = p_registration_id::text)
                       ) as u
                 order by u.occurred_at desc, u.id desc
                 limit 500) as h), '[]'::jsonb));
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_registration_history(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.brk_registration_history(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 8. The staff functions that WRITE (the only way to change anything).
--   * returns {"status": ...}; the statuses are listed in the header
--   * checks in this order: has_data_access() FIRST, then the role (A =
--     admins only; S = staff and admins), then the input, then it locks the
--     rows and looks them up (not_found), then "did the screen see the
--     latest version?" (stale), then the rules that depend on the data,
--     then it writes
--   * tags its writes with tkd.action (= the function's name) + tkd.batch_id
--     and clears them
--   * the whole body is inside begin ... exception ... end: a table rule
--     that still says no undoes everything this call did and answers a
--     status instead of an error, as Camps:
--       any unique rule                                  -> stale
--       foreign key / check / not-null rule / bad data   -> invalid
--       deadlock / serialization / lock not available    -> stale
--   * locks, always in this order: the event -> the student -> the payment
--     (6c)
-- ---------------------------------------------------------------------

-- 8a. brk_add_event(p_name, p_location_code, p_event_date,
--       p_copy_classes_from default null)   A
-- Makes an event (registration CLOSED until an admin opens it) and its link
-- code. Its classes start as a copy of p_copy_classes_from's, else of the
-- same school's latest EARLIER event, else none.
-- invalid {field}: name, location_code, event_date (from a year ago to two
-- years ahead). not_found when p_copy_classes_from isn't an event.
-- Ok: {"status":"ok","event_id":...,"public_code":"...","version":1}
create or replace function public.brk_add_event(
  p_name                text,
  p_location_code       text,
  p_event_date          date,
  p_copy_classes_from   uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code  text;
  v_id    uuid;
  v_from  uuid;
  v_today date;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    v_today := public.testing_today();
    if not public.testing_name_is_valid(p_name) then
      return jsonb_build_object('status', 'invalid', 'field', 'name');
    end if;
    if p_location_code is null or not exists (select 1 from public.locations l where l.code = p_location_code) then
      return jsonb_build_object('status', 'invalid', 'field', 'location_code');
    end if;
    if p_event_date is null or p_event_date < v_today - 365 or p_event_date > v_today + 730 then
      return jsonb_build_object('status', 'invalid', 'field', 'event_date');
    end if;

    if p_copy_classes_from is not null then
      select e.id into v_from from public.brk_events e where e.id = p_copy_classes_from;
      if not found then
        return jsonb_build_object('status', 'not_found');
      end if;
    else
      select e.id into v_from
        from public.brk_events e
       where e.location_code = p_location_code and e.event_date < p_event_date
       order by e.event_date desc, e.created_at desc, e.id
       limit 1;
    end if;

    perform set_config('tkd.action', 'brk_add_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    loop
      v_code := public.testing_new_public_code();
      exit when not exists (select 1 from public.brk_events e where e.public_code = v_code);
    end loop;

    insert into public.brk_events (name, location_code, event_date, registration_open, public_code,
                                   created_by_name, updated_by_name)
    values (public.testing_normalize_name(p_name), p_location_code, p_event_date, false, v_code, '', '')
    returning id into v_id;

    if v_from is not null then
      insert into public.brk_event_classes (event_id, name, start_time, end_time, sort)
      select v_id, c.name, c.start_time, c.end_time, c.sort
        from public.brk_event_classes c
       where c.event_id = v_from
       order by c.sort, c.start_time, c.id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'event_id', v_id, 'public_code', v_code, 'version', 1);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_add_event(text, text, date, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.brk_add_event(text, text, date, uuid) to authenticated;

-- 8b. brk_update_event(p_event_id, p_expected_version, p_name, p_event_date,
--       p_registration_open)   A
-- Edit event / the Registration switch. The school and the link code never
-- change. A date outside the window (a year back to two years ahead) is
-- refused only when it is a NEW date. Students keep the price kind they signed up with, whatever the new
-- date is.
-- Ok: {"status":"ok","version":n}
create or replace function public.brk_update_event(
  p_event_id          uuid,
  p_expected_version  integer,
  p_name              text,
  p_event_date        date,
  p_registration_open boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e       public.brk_events;
  v_today   date;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_event_id is null or p_expected_version is null or p_registration_open is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_today := public.testing_today();
    if not public.testing_name_is_valid(p_name) then
      return jsonb_build_object('status', 'invalid', 'field', 'name');
    end if;
    if p_event_date is null then
      return jsonb_build_object('status', 'invalid', 'field', 'event_date');
    end if;

    v_e := public.brk_lock_event(p_event_id, true);
    if v_e.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    -- the date window (a year back to two years ahead) only applies when the
    -- date is being CHANGED, so an old event can still be renamed or closed
    if p_event_date <> v_e.event_date and (p_event_date < v_today - 365 or p_event_date > v_today + 730) then
      return jsonb_build_object('status', 'invalid', 'field', 'event_date');
    end if;

    perform set_config('tkd.action', 'brk_update_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.brk_events e
       set name              = public.testing_normalize_name(p_name),
           event_date        = p_event_date,
           registration_open = p_registration_open
     where e.id = v_e.id
    returning e.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_update_event(uuid, integer, text, date, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.brk_update_event(uuid, integer, text, date, boolean) to authenticated;

-- 8c. brk_delete_event(p_event_id, p_expected_version)   A
-- Removes an event with its students and classes. Refused (has_payments)
-- when any payment row exists on any of its students: money is never
-- removed.
-- Ok: {"status":"ok"}
create or replace function public.brk_delete_event(p_event_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e public.brk_events;
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

    v_e := public.brk_lock_event(p_event_id, true);
    if v_e.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    -- lock every student of the event (in id order) before looking at money
    perform 1 from public.brk_registrations r where r.event_id = v_e.id order by r.id for update;
    if exists (select 1 from public.brk_payments p
                 join public.brk_registrations r on r.id = p.registration_id
                where r.event_id = v_e.id) then
      return jsonb_build_object('status', 'has_payments');
    end if;

    perform set_config('tkd.action', 'brk_delete_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.brk_registrations r where r.event_id = v_e.id;
    delete from public.brk_events e where e.id = v_e.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_delete_event(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.brk_delete_event(uuid, integer) to authenticated;

-- 8d. brk_save_classes(p_event_id, p_expected_version, p_classes)   A
-- Saves the whole class list of an event, in order: a class that is sent
-- with its id is kept (renamed / re-timed), a class without an id is new,
-- every class not sent is removed. A removed class that still has students
-- -> {"status":"class_in_use","class_id":...} and nothing changes. The
-- event's version goes up (also when only the classes changed).
-- Ok: {"status":"ok","version":n}
create or replace function public.brk_save_classes(p_event_id uuid, p_expected_version integer, p_classes jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e       public.brk_events;
  v_item    record;
  v_ids     uuid[];
  v_gone    uuid;
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
    if p_event_id is null or p_expected_version is null or not public.brk_classes_arg_is_valid(p_classes) then
      return jsonb_build_object('status', 'invalid', 'field', 'classes');
    end if;

    v_e := public.brk_lock_event(p_event_id, true);
    if v_e.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- the ids that were sent must all be classes of THIS event
    v_ids := array(select (x.value ->> 'id')::uuid
                     from jsonb_array_elements(p_classes) as x(value)
                    where jsonb_typeof(x.value -> 'id') = 'string');
    if (select count(*) from public.brk_event_classes c where c.event_id = v_e.id and c.id = any (v_ids))
       <> cardinality(v_ids) then
      return jsonb_build_object('status', 'invalid', 'field', 'classes');
    end if;
    -- a class that is not sent any more must have no students
    select c.id into v_gone
      from public.brk_event_classes c
     where c.event_id = v_e.id and c.id <> all (v_ids)
       and exists (select 1 from public.brk_registrations r where r.class_id = c.id)
     order by c.id
     limit 1;
    if found then
      return jsonb_build_object('status', 'class_in_use', 'class_id', v_gone);
    end if;

    perform set_config('tkd.action', 'brk_save_classes', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.brk_event_classes c where c.event_id = v_e.id and c.id <> all (v_ids);

    for v_item in select x.value as c, x.n from jsonb_array_elements(p_classes) with ordinality as x(value, n) order by x.n loop
      if jsonb_typeof(v_item.c -> 'id') = 'string' then
        update public.brk_event_classes c
           set name       = public.testing_normalize_name(v_item.c ->> 'name'),
               start_time = (v_item.c ->> 'start_time')::time,
               end_time   = (v_item.c ->> 'end_time')::time,
               sort       = (v_item.n - 1)::smallint
         where c.id = (v_item.c ->> 'id')::uuid and c.event_id = v_e.id;
      else
        insert into public.brk_event_classes (event_id, name, start_time, end_time, sort)
        values (v_e.id, public.testing_normalize_name(v_item.c ->> 'name'),
                (v_item.c ->> 'start_time')::time, (v_item.c ->> 'end_time')::time, (v_item.n - 1)::smallint)
        returning id into v_id;
      end if;
    end loop;

    -- the event's version goes up, so a second screen with the old classes gets "stale"
    update public.brk_events e set version = e.version + 1 where e.id = v_e.id returning e.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_save_classes(uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.brk_save_classes(uuid, integer, jsonb) to authenticated;

-- 8e. brk_add_student(p_event_id, p_first_name, p_last_name, p_age,
--       p_rank_name, p_class_id, p_tech, p_adult, p_paying_by)   S
-- A walk-in at the desk (source 'desk'). The database prices it; the
-- same-day price applies from the event date on. Works while registration
-- is closed. invalid {field}: first_name, last_name, age, rank_name (also
-- when the rank isn't in the chart), class_id (also when it isn't one of
-- the event's classes), boards (also when the price is over $10,000),
-- paying_by.
-- Ok: {"status":"ok","registration_id":...,"amount_cents":n,"version":1}
create or replace function public.brk_add_student(
  p_event_id   uuid,
  p_first_name text,
  p_last_name  text,
  p_age        integer,
  p_rank_name  text,
  p_class_id   uuid,
  p_tech       integer,
  p_adult      integer,
  p_paying_by  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e       public.brk_events;
  v_field   text;
  v_rank    text;
  v_same    boolean;
  v_band    text;
  v_amount  integer;
  v_id      uuid;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_event_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_field := public.brk_student_field_error(p_first_name, p_last_name, p_age, p_rank_name, p_class_id,
                                              p_tech, p_adult, p_paying_by);
    if v_field is not null then
      return jsonb_build_object('status', 'invalid', 'field', v_field);
    end if;

    v_e := public.brk_lock_event(p_event_id, false);
    if v_e.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if not exists (select 1 from public.brk_event_classes c where c.id = p_class_id and c.event_id = v_e.id) then
      return jsonb_build_object('status', 'invalid', 'field', 'class_id');
    end if;
    v_rank := public.testing_normalize_name(p_rank_name);
    v_same := public.testing_today() >= v_e.event_date;
    select pr.band_used, pr.amount_cents into v_band, v_amount
      from public.brk_price(p_age, v_rank, p_tech, p_adult, p_paying_by, v_same) as pr;
    if v_band is null then
      return jsonb_build_object('status', 'invalid', 'field', 'rank_name');
    end if;
    if v_amount > 1000000 then
      return jsonb_build_object('status', 'invalid', 'field', 'boards');
    end if;

    perform set_config('tkd.action', 'brk_add_student', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.brk_registrations
      (event_id, class_id, first_name, last_name, age, rank_name, band_used, tech_boards, adult_boards,
       paying_by, paying_by_on_form, same_day, amount_cents, source, entered_by, created_by_name, updated_by_name)
    values
      (v_e.id, p_class_id, public.testing_normalize_name(p_first_name), public.testing_normalize_name(p_last_name),
       p_age, v_rank, v_band, p_tech, p_adult, p_paying_by, p_paying_by, v_same, v_amount, 'desk',
       public.change_log_actor_name(), '', '')
    returning id, version into v_id, v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'registration_id', v_id, 'amount_cents', v_amount, 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_add_student(uuid, text, text, integer, text, uuid, integer, integer, text)
  from public, anon, authenticated, service_role;
grant  execute on function public.brk_add_student(uuid, text, text, integer, text, uuid, integer, integer, text)
  to authenticated;

-- 8f. brk_edit_registration(p_registration_id, p_expected_version,
--       p_first_name, p_last_name, p_age, p_rank_name, p_class_id, p_tech,
--       p_adult, p_paying_by)   S
-- Edit student: name, age, rank, class, boards, Paying by. Allowed after
-- payment. The amount is worked out again with the SAME price function as
-- sign-up (card and same-day extras included); the student keeps the
-- same-day flag they signed up with, so editing a name never changes money.
-- A set override stays (it replaces the new amount too).
--   * the new amount owed would be below what is already paid
--     -> {"status":"amount_below_paid","paid_cents":n}, nothing changes
--   * a Square link is cleared (so it can never mark them paid later) when
--     Paying by leaves Card, or when the amount owed changes while the link
--     is still unpaid (v1.303: staff take the card on the Square terminal)
-- Ok: {"status":"ok","amount_cents":n,"version":n,"link_cleared":bool}
create or replace function public.brk_edit_registration(
  p_registration_id  uuid,
  p_expected_version integer,
  p_first_name       text,
  p_last_name        text,
  p_age              integer,
  p_rank_name        text,
  p_class_id         uuid,
  p_tech             integer,
  p_adult            integer,
  p_paying_by        text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r        public.brk_registrations;
  v_field    text;
  v_rank     text;
  v_band     text;
  v_amount   integer;
  v_old_owed integer;
  v_new_owed integer;
  v_paid     integer;
  v_clear    boolean := false;
  v_version  integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_registration_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_field := public.brk_student_field_error(p_first_name, p_last_name, p_age, p_rank_name, p_class_id,
                                              p_tech, p_adult, p_paying_by);
    if v_field is not null then
      return jsonb_build_object('status', 'invalid', 'field', v_field);
    end if;

    v_r := public.brk_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if not exists (select 1 from public.brk_event_classes c where c.id = p_class_id and c.event_id = v_r.event_id) then
      return jsonb_build_object('status', 'invalid', 'field', 'class_id');
    end if;
    v_rank := public.testing_normalize_name(p_rank_name);
    select pr.band_used, pr.amount_cents into v_band, v_amount
      from public.brk_price(p_age, v_rank, p_tech, p_adult, p_paying_by, v_r.same_day) as pr;
    if v_band is null then
      return jsonb_build_object('status', 'invalid', 'field', 'rank_name');
    end if;
    if v_amount > 1000000 then
      return jsonb_build_object('status', 'invalid', 'field', 'boards');
    end if;

    v_old_owed := coalesce(v_r.override_cents, v_r.amount_cents);
    v_new_owed := coalesce(v_r.override_cents, v_amount);
    v_paid     := public.brk_paid_cents(v_r.id);
    if v_new_owed < v_paid then
      return jsonb_build_object('status', 'amount_below_paid', 'paid_cents', v_paid);
    end if;
    if v_r.square_order_id is not null
       and (p_paying_by <> 'card' or (v_new_owed <> v_old_owed and v_paid < v_old_owed)) then
      v_clear := true;
    end if;

    perform set_config('tkd.action', 'brk_edit_registration', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.brk_registrations r
       set first_name      = public.testing_normalize_name(p_first_name),
           last_name       = public.testing_normalize_name(p_last_name),
           age             = p_age,
           rank_name       = v_rank,
           class_id        = p_class_id,
           band_used       = v_band,
           tech_boards     = p_tech,
           adult_boards    = p_adult,
           paying_by       = p_paying_by,
           amount_cents    = v_amount,
           square_order_id = case when v_clear then null else r.square_order_id end,
           square_link_url = case when v_clear then null else r.square_link_url end
     where r.id = v_r.id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'amount_cents', v_amount, 'version', v_version, 'link_cleared', v_clear);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_edit_registration(uuid, integer, text, text, integer, text, uuid, integer, integer, text)
  from public, anon, authenticated, service_role;
grant  execute on function public.brk_edit_registration(uuid, integer, text, text, integer, text, uuid, integer, integer, text)
  to authenticated;

-- 8g. brk_set_override(p_registration_id, p_expected_version,
--       p_override_cents)   A
-- An admin's price for one student (0-$10,000); NULL clears it. When the
-- amount owed changes while a Square link is still unpaid, the link is
-- cleared (as Edit). The new amount may be below what was paid (the
-- difference can then be refunded).
-- Ok: {"status":"ok","amount_cents":<what is owed now>,"version":n,"link_cleared":bool}
create or replace function public.brk_set_override(p_registration_id uuid, p_expected_version integer, p_override_cents integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r        public.brk_registrations;
  v_old_owed integer;
  v_new_owed integer;
  v_paid     integer;
  v_clear    boolean := false;
  v_version  integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_registration_id is null or p_expected_version is null
       or (p_override_cents is not null and p_override_cents not between 0 and 1000000) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_r := public.brk_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    v_old_owed := coalesce(v_r.override_cents, v_r.amount_cents);
    v_new_owed := coalesce(p_override_cents, v_r.amount_cents);
    v_paid     := public.brk_paid_cents(v_r.id);
    if v_r.square_order_id is not null and v_new_owed <> v_old_owed and v_paid < v_old_owed then
      v_clear := true;
    end if;

    perform set_config('tkd.action', 'brk_set_override', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.brk_registrations r
       set override_cents  = p_override_cents,
           square_order_id = case when v_clear then null else r.square_order_id end,
           square_link_url = case when v_clear then null else r.square_link_url end
     where r.id = v_r.id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'amount_cents', v_new_owed, 'version', v_version, 'link_cleared', v_clear);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_set_override(uuid, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.brk_set_override(uuid, integer, integer) to authenticated;

-- 8h. brk_set_broke(p_registration_id, p_expected_version, p_broke)   S
-- Mark broken / not broken (a toggle; the app's Undo calls it again).
-- broke_on = today when set (kept if already set), empty when cleared.
-- Ok: {"status":"ok","version":n,"broke_on":date or null}
create or replace function public.brk_set_broke(p_registration_id uuid, p_expected_version integer, p_broke boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r       public.brk_registrations;
  v_version integer;
  v_on      date;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_registration_id is null or p_expected_version is null or p_broke is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_r := public.brk_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'brk_set_broke', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.brk_registrations r
       set broke    = p_broke,
           broke_on = case when p_broke then coalesce(r.broke_on, public.testing_today()) else null end
     where r.id = v_r.id
    returning r.version, r.broke_on into v_version, v_on;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version, 'broke_on', v_on);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_set_broke(uuid, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.brk_set_broke(uuid, integer, boolean) to authenticated;

-- 8i. brk_mark_paid(p_registration_id, p_expected_version, p_school,
--       p_method default null)   S
-- (Camps 0033's camp_mark_paid.) "Mark paid": one click records exactly what
-- is OWED now (owed - paid), paid_on = today, school = p_school (the school
-- whose desk took the money: This device's school; any school in
-- public.locations, else {"status":"invalid","field":"school"}). method =
-- p_method (cash / check / card, else {"status":"invalid","field":"method"});
-- left out or null = the student's Paying by. A way other than Paying by
-- also makes Paying by that way (same update, logged as brk_mark_paid) and
-- the payment remembers the old one (paying_by_before) for Undo. When Paying
-- by moves away from Card, the Square link is cleared (the table rule: a
-- link needs Paying by = Card). Refused when nothing is owed
-- (already_paid). The student's version goes up, so a double click with the
-- old version gets "stale".
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"cash",
--      "school":"...","paying_by":"cash","version":n}
create or replace function public.brk_mark_paid(
  p_registration_id  uuid,
  p_expected_version integer,
  p_school           text,
  p_method           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r          public.brk_registrations;
  v_amount     integer;
  v_payment_id uuid;
  v_version    integer;
  v_method     text;
  v_before     text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_registration_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_school is null or not exists (select 1 from public.locations l where l.code = p_school) then
      return jsonb_build_object('status', 'invalid', 'field', 'school');
    end if;
    if p_method is not null and p_method not in ('cash', 'check', 'card') then
      return jsonb_build_object('status', 'invalid', 'field', 'method');
    end if;

    v_r := public.brk_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    v_amount := coalesce(v_r.override_cents, v_r.amount_cents) - public.brk_paid_cents(v_r.id);
    if v_amount <= 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    v_method := coalesce(p_method, v_r.paying_by);
    v_before := case when v_method <> v_r.paying_by then v_r.paying_by end;

    perform set_config('tkd.action', 'brk_mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.brk_payments
      (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)
    values
      (v_r.id, 'payment', v_amount, v_method, public.testing_today(), p_school, now(), auth.uid(),
       public.change_log_actor_name(), v_before)
    returning id into v_payment_id;

    update public.brk_registrations r
       set version         = r.version + 1,
           paying_by       = v_method,
           square_order_id = case when v_method <> 'card' then null else r.square_order_id end,
           square_link_url = case when v_method <> 'card' then null else r.square_link_url end
     where r.id = v_r.id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'amount_cents', v_amount,
                              'method', v_method, 'school', p_school, 'paying_by', v_method,
                              'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_mark_paid(uuid, integer, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.brk_mark_paid(uuid, integer, text, text) to authenticated;

-- 8j. brk_undo_payment(p_payment_id)   A (own, within 10 s: S)
-- (Camps 0033 + 0039.) Writes a reversal for a payment (the payment row
-- stays; the two add up to 0). Who may: admins, or the staff member who
-- recorded it less than 10 seconds ago (the Mark paid toast's Undo) - the
-- database decides from recorded_by and recorded_at; anyone else
-- -> not_allowed (a Square payment has no staff member: admins only).
-- Already reversed, or a reversal / refund itself -> stale. While the
-- student has a refund that stands -> refund_stands ("Undo the refund
-- first."). If the payment remembered an earlier Paying by and Paying by is
-- still the payment's method, it is put back (in the same update and
-- batch). The student's version goes up.
-- Ok: {"status":"ok","version":n}
create or replace function public.brk_undo_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p       public.brk_payments;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_payment_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.brk_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if not coalesce(v_p.recorded_by = auth.uid() and v_p.recorded_at > now() - interval '10 seconds', false)
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_p.kind <> 'payment'
       or exists (select 1 from public.brk_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;
    if exists (select 1 from public.brk_payments r
                where r.registration_id = v_p.registration_id and r.kind = 'refund'
                  and not exists (select 1 from public.brk_payments x where x.reverses_payment_id = r.id)) then
      return jsonb_build_object('status', 'refund_stands');
    end if;

    perform set_config('tkd.action', 'brk_undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.brk_payments
      (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.registration_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), v_p.school, now(),
       auth.uid(), public.change_log_actor_name(), v_p.id);

    update public.brk_registrations r
       set version   = r.version + 1,
           paying_by = case when v_p.paying_by_before is not null and r.paying_by = v_p.method
                            then v_p.paying_by_before else r.paying_by end
     where r.id = v_p.registration_id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_undo_payment(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.brk_undo_payment(uuid) to authenticated;

-- 8k. brk_edit_payment(p_payment_id, p_method, p_amount_cents, p_paid_on,
--       p_school)   A
-- (Camps 0033 + 0039.) Edit payment = a reversal of the old payment (at the
-- old school) + a new payment with the new method / amount (1 cent to
-- $10,000) / date (not in the future, not before the student was added:
-- {"status":"invalid","field":"date"}) / school (any school in
-- public.locations, else {"status":"invalid","field":"school"}). Already
-- reversed -> stale; a reversal or refund can't be edited (invalid). While
-- the student has a refund that stands -> refund_stands. Paying by follows
-- the edit exactly as Camps 0033 (an edit that changes the way = Undo of the
-- old payment + Mark paid by the new way; the new payment remembers the
-- family's choice for Undo). When Paying by moves away from Card the Square
-- link is cleared.
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}
create or replace function public.brk_edit_payment(
  p_payment_id   uuid,
  p_method       text,
  p_amount_cents integer,
  p_paid_on      date,
  p_school       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p         public.brk_payments;
  v_new_id    uuid;
  v_version   integer;
  v_paying_by text;
  v_choice    text;
  v_after     text;
  v_before    text;
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
       or p_amount_cents is null or p_amount_cents not between 1 and 1000000
       or p_paid_on is null or p_paid_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_school is null or not exists (select 1 from public.locations l where l.code = p_school) then
      return jsonb_build_object('status', 'invalid', 'field', 'school');
    end if;

    v_p := public.brk_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.brk_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;
    if exists (select 1 from public.brk_payments r
                where r.registration_id = v_p.registration_id and r.kind = 'refund'
                  and not exists (select 1 from public.brk_payments x where x.reverses_payment_id = r.id)) then
      return jsonb_build_object('status', 'refund_stands');
    end if;

    select r.paying_by into v_paying_by from public.brk_registrations r where r.id = v_p.registration_id;
    -- the new date is never before the day the student was added (as Record refund)
    if p_paid_on < (select public.testing_school_date(r.created_at) from public.brk_registrations r
                     where r.id = v_p.registration_id) then
      return jsonb_build_object('status', 'invalid', 'field', 'date');
    end if;
    v_choice := case when v_p.paying_by_before is not null and v_paying_by = v_p.method
                     then v_p.paying_by_before else v_paying_by end;
    v_after  := case when p_method <> v_p.method then p_method else v_paying_by end;
    v_before := case when v_after = p_method and v_choice <> p_method then v_choice end;

    perform set_config('tkd.action', 'brk_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.brk_payments
      (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.registration_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), v_p.school, now(),
       auth.uid(), public.change_log_actor_name(), v_p.id);

    insert into public.brk_payments
      (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)
    values
      (v_p.registration_id, 'payment', p_amount_cents, p_method, p_paid_on, p_school, now(), auth.uid(),
       public.change_log_actor_name(), v_before)
    returning id into v_new_id;

    update public.brk_registrations r
       set version         = r.version + 1,
           paying_by       = v_after,
           square_order_id = case when v_after <> 'card' then null else r.square_order_id end,
           square_link_url = case when v_after <> 'card' then null else r.square_link_url end
     where r.id = v_p.registration_id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_new_id, 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_edit_payment(uuid, text, integer, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.brk_edit_payment(uuid, text, integer, date, text) to authenticated;

-- 8l. brk_record_refund(p_registration_id, p_expected_version, p_method,
--       p_amount_cents, p_refunded_on, p_school)   A
-- (Camps 0039.) A refund of an OVERPAID amount: its own negative row, cash or
-- check, dated the day the money goes out, at the school of the desk that
-- hands it back (This device's school). invalid {field}: school, date (a
-- date before the student was added). Nothing overpaid, or more than that
-- -> {"status":"refund_too_large","overpaid_cents":n}.
-- Ok: {"status":"ok","payment_id":<the refund row>,"version":n}
create or replace function public.brk_record_refund(
  p_registration_id  uuid,
  p_expected_version integer,
  p_method           text,
  p_amount_cents     integer,
  p_refunded_on      date,
  p_school           text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r          public.brk_registrations;
  v_overpaid   integer;
  v_payment_id uuid;
  v_version    integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_registration_id is null or p_expected_version is null
       or p_method is null or p_method not in ('cash', 'check')
       or p_amount_cents is null or p_amount_cents not between 1 and 1000000
       or p_refunded_on is null or p_refunded_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_school is null or not exists (select 1 from public.locations l where l.code = p_school) then
      return jsonb_build_object('status', 'invalid', 'field', 'school');
    end if;

    v_r := public.brk_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if p_refunded_on < public.testing_school_date(v_r.created_at) then
      return jsonb_build_object('status', 'invalid', 'field', 'date');
    end if;
    v_overpaid := greatest(public.brk_paid_cents(v_r.id) - coalesce(v_r.override_cents, v_r.amount_cents), 0);
    if v_overpaid = 0 or p_amount_cents > v_overpaid then
      return jsonb_build_object('status', 'refund_too_large', 'overpaid_cents', v_overpaid);
    end if;

    perform set_config('tkd.action', 'brk_record_refund', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.brk_payments
      (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
    values
      (v_r.id, 'refund', -p_amount_cents, p_method, p_refunded_on, p_school, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_payment_id;

    update public.brk_registrations r set version = r.version + 1 where r.id = v_r.id returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_record_refund(uuid, integer, text, integer, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.brk_record_refund(uuid, integer, text, integer, date, text) to authenticated;

-- 8m. brk_undo_refund(p_payment_id)   A
-- (Camps 0039.) Writes a reversal of a refund (the refund row stays; the two
-- add up to 0): kind 'reversal', plus the refund's amount, the refund's way,
-- dated today, at the REFUND'S school. Refused: a row that isn't a refund
-- -> invalid; already undone -> stale. The student's version goes up.
-- Ok: {"status":"ok","version":n}
create or replace function public.brk_undo_refund(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p       public.brk_payments;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_payment_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.brk_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'refund' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.brk_payments x where x.reverses_payment_id = v_p.id) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'brk_undo_refund', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.brk_payments
      (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.registration_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), v_p.school, now(),
       auth.uid(), public.change_log_actor_name(), v_p.id);

    update public.brk_registrations r set version = r.version + 1
     where r.id = v_p.registration_id returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_undo_refund(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.brk_undo_refund(uuid) to authenticated;

-- 8n. brk_delete_registration(p_registration_id, p_expected_version)   A
-- Removes a student. Refused (has_payments) when any payment row exists:
-- money is never removed.
-- Ok: {"status":"ok"}
create or replace function public.brk_delete_registration(p_registration_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r public.brk_registrations;
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

    v_r := public.brk_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if exists (select 1 from public.brk_payments p where p.registration_id = v_r.id) then
      return jsonb_build_object('status', 'has_payments');
    end if;

    perform set_config('tkd.action', 'brk_delete_registration', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.brk_registrations r where r.id = v_r.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_delete_registration(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.brk_delete_registration(uuid, integer) to authenticated;

-- 8o. brk_save_settings(p_expected_version, p_tech_cents, p_adult_cents,
--       p_card_extra_cents, p_same_day_extra_cents, p_child_max_age)   A
-- Prices (0-$1,000 per board, in cents) and the age line (1-99). Existing
-- students keep the amount they were given; only new sign-ups and edits use
-- the new prices.
-- Ok: {"status":"ok","version":n}
create or replace function public.brk_save_settings(
  p_expected_version     integer,
  p_tech_cents           integer,
  p_adult_cents          integer,
  p_card_extra_cents     integer,
  p_same_day_extra_cents integer,
  p_child_max_age        integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s       public.brk_settings;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_tech_cents is null or p_tech_cents not between 0 and 100000 then
      return jsonb_build_object('status', 'invalid', 'field', 'tech_cents');
    end if;
    if p_adult_cents is null or p_adult_cents not between 0 and 100000 then
      return jsonb_build_object('status', 'invalid', 'field', 'adult_cents');
    end if;
    if p_card_extra_cents is null or p_card_extra_cents not between 0 and 100000 then
      return jsonb_build_object('status', 'invalid', 'field', 'card_extra_cents');
    end if;
    if p_same_day_extra_cents is null or p_same_day_extra_cents not between 0 and 100000 then
      return jsonb_build_object('status', 'invalid', 'field', 'same_day_extra_cents');
    end if;
    if p_child_max_age is null or p_child_max_age not between 1 and 99 then
      return jsonb_build_object('status', 'invalid', 'field', 'child_max_age');
    end if;

    perform set_config('lock_timeout', '5s', true);
    select * into v_s from public.brk_settings s for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_s.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'brk_save_settings', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.brk_settings s
       set tech_cents           = p_tech_cents,
           adult_cents          = p_adult_cents,
           card_extra_cents     = p_card_extra_cents,
           same_day_extra_cents = p_same_day_extra_cents,
           child_max_age        = p_child_max_age
     where s.id = v_s.id
    returning s.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_save_settings(integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant  execute on function public.brk_save_settings(integer, integer, integer, integer, integer, integer)
  to authenticated;

-- 8p. brk_save_chart(p_expected_version, p_rows)   A
-- Replaces the whole chart (rows as in 1d). The version is the settings
-- row's (the same version brk_save_settings uses), bumped on every save.
-- Students keep their stored rank and amount; only new sign-ups and edits
-- check the rank against the new chart.
-- Ok: {"status":"ok","version":n}
create or replace function public.brk_save_chart(p_expected_version integer, p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s       public.brk_settings;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_expected_version is null or not public.brk_chart_arg_is_valid(p_rows) then
      return jsonb_build_object('status', 'invalid', 'field', 'rows');
    end if;

    perform set_config('lock_timeout', '5s', true);
    select * into v_s from public.brk_settings s for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_s.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'brk_save_chart', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.brk_chart c where c.id is not null;
    insert into public.brk_chart (band, rank_name, sort, technique, tech_boards, adult_boards)
    select x.value ->> 'band', public.testing_normalize_name(x.value ->> 'rank_name'),
           (x.value ->> 'sort')::smallint, x.value ->> 'technique',
           (x.value ->> 'tech_boards')::smallint, (x.value ->> 'adult_boards')::smallint
      from jsonb_array_elements(p_rows) as x(value);

    update public.brk_settings s set version = s.version + 1 where s.id = v_s.id returning s.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_save_chart(integer, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.brk_save_chart(integer, jsonb) to authenticated;

-- 8q. brk_dismiss_square_event(p_square_event_id)   A
-- Takes a Square message off the "needs a look" list (reviewed = true). The
-- message itself stays for good.
-- Ok: {"status":"ok"}
create or replace function public.brk_dismiss_square_event(p_square_event_id text)
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
    if p_square_event_id is null or p_square_event_id !~ '^[A-Za-z0-9_.:-]{1,200}$' then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('lock_timeout', '5s', true);
    perform 1 from public.brk_square_events s where s.square_event_id = p_square_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform set_config('tkd.action', 'brk_dismiss_square_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.brk_square_events s set reviewed = true
     where s.square_event_id = p_square_event_id and not s.reviewed;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_dismiss_square_event(text) from public, anon, authenticated, service_role;
grant  execute on function public.brk_dismiss_square_event(text) to authenticated;


-- ---------------------------------------------------------------------
-- 9. The four public functions (role brk_registrar ONLY)
-- They never trust the Cloudflare Function: every rule is checked again
-- here. None returns anything about other students (no counts, no names).
-- ---------------------------------------------------------------------

-- 9a. brk_public_event(p_code) - what the family page shows first. A code
-- that doesn't match the 8-character pattern -> not_found without looking
-- anything up. registration_state is 'open' only while the admin's switch is
-- on AND today (New York) is on or before the event date.
-- Ok: {"status":"ok","event":{name, location_code, event_date,
--      registration_state, classes:[{id, name, start_time, end_time}],
--      prices:{tech_cents, adult_cents, card_extra_cents,
--      same_day_extra_cents, same_day}, child_max_age,
--      chart:[{band, rank_name, sort, technique, tech_boards, adult_boards}]}}
create or replace function public.brk_public_event(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e     public.brk_events;
  v_today date;
begin
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_e from public.brk_events e where e.public_code = p_code;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_today := public.testing_today();

  return jsonb_build_object(
    'status', 'ok',
    'event', jsonb_build_object(
      'name', v_e.name,
      'location_code', v_e.location_code,
      'event_date', v_e.event_date,
      'registration_state', case when v_e.registration_open and v_today <= v_e.event_date then 'open' else 'closed' end,
      'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
                                                               'start_time', left(c.start_time::text, 5),
                                                               'end_time', left(c.end_time::text, 5))
                                            order by c.sort, c.start_time, c.id)
                             from public.brk_event_classes c where c.event_id = v_e.id), '[]'::jsonb),
      'prices', (select jsonb_build_object('tech_cents', s.tech_cents, 'adult_cents', s.adult_cents,
                                           'card_extra_cents', s.card_extra_cents,
                                           'same_day_extra_cents', s.same_day_extra_cents,
                                           'same_day', v_today >= v_e.event_date)
                   from public.brk_settings s limit 1),
      'child_max_age', (select s.child_max_age from public.brk_settings s limit 1),
      'chart', coalesce((select jsonb_agg(jsonb_build_object('band', c.band, 'rank_name', c.rank_name, 'sort', c.sort,
                                                             'technique', c.technique,
                                                             'tech_boards', c.tech_boards,
                                                             'adult_boards', c.adult_boards)
                                          order by case c.band when 'tiger' then 1 when 'child' then 2
                                                               when 'teen' then 3 else 4 end,
                                                   c.sort, c.rank_name)
                           from public.brk_chart c), '[]'::jsonb)));
end;
$$;

revoke execute on function public.brk_public_event(text) from public, anon, authenticated, service_role;
grant  execute on function public.brk_public_event(text) to brk_registrar;

-- 9b. brk_signup_answer(registration_id) - the "You're registered" answer
-- built from the stored row, so a retry with the same submission id gets
-- exactly the same answer. Internal: nobody can call it.
create or replace function public.brk_signup_answer(p_registration_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('status', 'ok', 'registration_id', r.id,
                            'amount_cents', coalesce(r.override_cents, r.amount_cents),
                            'paying_by', r.paying_by, 'same_day', r.same_day)
    from public.brk_registrations r
   where r.id = p_registration_id;
$$;

revoke execute on function public.brk_signup_answer(uuid) from public, anon, authenticated, service_role;

-- 9c. brk_public_signup_core(...) - the inside of 9d (internal; nobody can
-- call it). Steps, in this order:
--   0. wait at most 3 seconds for a lock (so a stuck call is counted by 9d)
--   1. the event by its code                               -> not_found
--   2. this submission_id already registered FOR THIS EVENT -> the same ok
--      answer again (a double tap or a retry never makes two); for ANOTHER
--      event -> invalid (never its details)
--   3. the client key and submission id                     -> invalid
--   4. rate limits (counted in brk_public_attempts only, and NOT counting
--      attempts that were themselves rate_limited): 30 tries from this
--      client key in the last hour, and 300 tries for this event in the last
--      hour from all keys together                          -> rate_limited
--   5. lock the event, read it again
--   6. open right now? (the admin's switch on AND today <= the event date)
--                                                           -> closed
--      the event already has 500 students                   -> full
--   7. the other input (names, age, rank, class, boards, paying by, the
--      expected total)                                      -> invalid {field}
--   8. the class is one of this event's; the rank is in the chart's band
--      for this age                                         -> invalid {field}
--      the same child (first and last name ignoring capitals, age, class)
--      is already registered for this event under another submission id
--                                -> {"status":"duplicate"} (no details)
--   9. the price (same-day from the event date on); a total different from
--      what the page showed -> {"status":"price_changed","amount_cents":n}
--  10. the write, by "Family form". A concurrent call with the same
--      submission_id that hits the unique rule is answered like step 2.
--  11. the ok answer (9b)
create or replace function public.brk_public_signup_core(
  p_code                 text,
  p_client_key           text,
  p_submission_id        uuid,
  p_first_name           text,
  p_last_name            text,
  p_age                  integer,
  p_rank_name            text,
  p_class_id             uuid,
  p_tech                 integer,
  p_adult                integer,
  p_paying_by            text,
  p_expected_total_cents integer
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_e          public.brk_events;
  v_found      public.brk_registrations;
  v_today      date;
  v_n          integer;
  v_field      text;
  v_rank       text;
  v_same       boolean;
  v_band       text;
  v_amount     integer;
  v_id         uuid;
  v_constraint text;
begin
  -- 0. wait at most 3 seconds for a lock ("true" = for this transaction only)
  perform set_config('lock_timeout', '3s', true);

  -- 1. the event
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_e from public.brk_events e where e.public_code = p_code;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 2. already registered with this submission id?
  if p_submission_id is not null then
    select * into v_found from public.brk_registrations r where r.submission_id = p_submission_id;
    if found then
      if v_found.event_id <> v_e.id then
        return jsonb_build_object('status', 'invalid', 'field', 'submission_id');
      end if;
      return public.brk_signup_answer(v_found.id);
    end if;
  end if;

  -- 3. client key and submission id
  if p_client_key is null or char_length(p_client_key) not between 1 and 200 then
    return jsonb_build_object('status', 'invalid', 'field', 'client_key');
  end if;
  if p_submission_id is null then
    return jsonb_build_object('status', 'invalid', 'field', 'submission_id');
  end if;

  -- 4. rate limits (this call's own row is written afterwards by 9d). A try
  --    that was itself turned away as rate_limited is not counted, so a
  --    blocked client can't keep itself blocked (or lock others out) by
  --    trying again.
  select count(*) into v_n
    from public.brk_public_attempts a
   where a.client_key = p_client_key and a.at > now() - interval '1 hour' and a.outcome <> 'rate_limited';
  if v_n >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*) into v_n
    from public.brk_public_attempts a
   where a.event_id = v_e.id and a.at > now() - interval '1 hour' and a.outcome <> 'rate_limited';
  if v_n >= 300 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- 5. lock the event (as every student write does), then read it again
  select * into v_e from public.brk_events e where e.id = v_e.id for no key update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 6. open right now?
  v_today := public.testing_today();
  if not v_e.registration_open or v_today > v_e.event_date then
    return jsonb_build_object('status', 'closed');
  end if;
  -- the event lock above makes sign-ups one at a time, so this cap is exact
  if (select count(*) from public.brk_registrations r where r.event_id = v_e.id) >= 500 then
    return jsonb_build_object('status', 'full');
  end if;

  -- 7. the other input
  v_field := public.brk_student_field_error(p_first_name, p_last_name, p_age, p_rank_name, p_class_id,
                                            p_tech, p_adult, p_paying_by);
  if v_field is null and (p_expected_total_cents is null or p_expected_total_cents < 0) then
    v_field := 'expected_total_cents';
  end if;
  if v_field is not null then
    return jsonb_build_object('status', 'invalid', 'field', v_field);
  end if;

  -- 8. class and rank
  if not exists (select 1 from public.brk_event_classes c where c.id = p_class_id and c.event_id = v_e.id) then
    return jsonb_build_object('status', 'invalid', 'field', 'class_id');
  end if;
  v_rank := public.testing_normalize_name(p_rank_name);
  v_same := v_today >= v_e.event_date;
  -- the same child twice (a second tap with a NEW submission id, or a family
  -- that already registered): answer duplicate and say nothing about the
  -- other row
  if exists (select 1 from public.brk_registrations r
              where r.event_id = v_e.id
                and lower(r.first_name) = lower(public.testing_normalize_name(p_first_name))
                and lower(r.last_name)  = lower(public.testing_normalize_name(p_last_name))
                and r.age = p_age and r.class_id = p_class_id
                and r.submission_id is distinct from p_submission_id) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  -- 9. the price
  select pr.band_used, pr.amount_cents into v_band, v_amount
    from public.brk_price(p_age, v_rank, p_tech, p_adult, p_paying_by, v_same) as pr;
  if v_band is null then
    return jsonb_build_object('status', 'invalid', 'field', 'rank_name');
  end if;
  if v_amount > 1000000 then
    return jsonb_build_object('status', 'invalid', 'field', 'boards');
  end if;
  if v_amount <> p_expected_total_cents then
    return jsonb_build_object('status', 'price_changed', 'amount_cents', v_amount);
  end if;

  -- 10. write
  perform set_config('tkd.actor_label', 'Family form', true);
  perform set_config('tkd.action', 'brk_public_signup', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  begin
    insert into public.brk_registrations
      (event_id, class_id, first_name, last_name, age, rank_name, band_used, tech_boards, adult_boards,
       paying_by, paying_by_on_form, same_day, amount_cents, source, submission_id, entered_by,
       created_by_name, updated_by_name)
    values
      (v_e.id, p_class_id, public.testing_normalize_name(p_first_name), public.testing_normalize_name(p_last_name),
       p_age, v_rank, v_band, p_tech, p_adult, p_paying_by, p_paying_by, v_same, v_amount, 'form', p_submission_id,
       'Family form', '', '')
    returning id into v_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'brk_registrations_submission_id_key' then
        raise;
      end if;
      -- another call with the same submission id got there first
      select * into v_found from public.brk_registrations r where r.submission_id = p_submission_id;
      if not found or v_found.event_id <> v_e.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      return public.brk_signup_answer(v_found.id);
  end;

  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);

  -- 11. the answer
  return public.brk_signup_answer(v_id);
end;
$$;

revoke execute on function public.brk_public_signup_core(text, text, uuid, text, text, integer, text, uuid, integer, integer, text, integer)
  from public, anon, authenticated, service_role;

-- 9d. brk_public_signup(...) - the family form's Register. Wraps 9c:
--   * first forgets any login token the caller might have set (so nobody
--     can make a form sign-up look like a staff member's), and removes
--     brk_public_attempts rows older than 2 days
--   * runs 9c; if a table rule or a conversion still says no, a lock isn't
--     free within 3 seconds (9c step 0) or the call is cancelled, everything
--     9c did is undone and the answer is invalid
--   * THEN writes this call's brk_public_attempts row (outcome = the status
--     answered, ok included) - outside the part that can be undone, so EVERY
--     call counts toward the rate limit, bad input included
-- Ok: {"status":"ok","registration_id":...,"amount_cents":n,
--      "paying_by":"card","same_day":bool}; or not_found, invalid {field},
--      closed, full, rate_limited, duplicate, price_changed {amount_cents}.
create or replace function public.brk_public_signup(
  p_code                 text,
  p_client_key           text,
  p_submission_id        uuid,
  p_first_name           text,
  p_last_name            text,
  p_age                  integer,
  p_rank_name            text,
  p_class_id             uuid,
  p_tech                 integer,
  p_adult                integer,
  p_paying_by            text,
  p_expected_total_cents integer
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

  delete from public.brk_public_attempts a where a.at < now() - interval '2 days';

  begin
    v_result := public.brk_public_signup_core(p_code, p_client_key, p_submission_id, p_first_name, p_last_name,
                                              p_age, p_rank_name, p_class_id, p_tech, p_adult, p_paying_by,
                                              p_expected_total_cents);
  exception
    when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then
      v_result := jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available or query_canceled then
      -- query_canceled: the statement_timeout (5 s) ran out inside 9c; caught
      -- here so the attempt row below is still written
      v_result := jsonb_build_object('status', 'invalid');
  end;

  insert into public.brk_public_attempts (client_key, event_id, outcome)
  values (coalesce(left(p_client_key, 200), ''),
          (select e.id from public.brk_events e where e.public_code = p_code),
          coalesce(v_result ->> 'status', 'invalid'));

  perform set_config('tkd.actor_label', '', true);
  return v_result;
end;
$$;

revoke execute on function public.brk_public_signup(text, text, uuid, text, text, integer, text, uuid, integer, integer, text, integer)
  from public, anon, authenticated, service_role;
grant  execute on function public.brk_public_signup(text, text, uuid, text, text, integer, text, uuid, integer, integer, text, integer)
  to brk_registrar;

-- 9e. brk_public_registration(p_code, p_submission_id) - the "Try again"
-- and return page: the family's own registration, found by the event's code
-- AND the secret submission id (a random id only their browser knows).
-- Ok: {"status":"ok","registration_id":...,"amount_cents":<owed in total>,
--      "balance_cents":<owed minus paid, never below 0 - what the Function
--      must charge>,"paying_by":"card","paid":bool,"has_link":bool,
--      "link_url":text or null}
-- The link is only shown while the registration is unpaid.
create or replace function public.brk_public_registration(p_code text, p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r    public.brk_registrations;
  v_owed integer;
  v_paid boolean;
  v_bal  integer;
begin
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' or p_submission_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select r.* into v_r
    from public.brk_registrations r
    join public.brk_events e on e.id = r.event_id
   where e.public_code = p_code and r.submission_id = p_submission_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_owed := coalesce(v_r.override_cents, v_r.amount_cents);
  v_paid := public.brk_paid_cents(v_r.id) >= v_owed;
  v_bal  := greatest(v_owed - public.brk_paid_cents(v_r.id), 0);
  return jsonb_build_object('status', 'ok', 'registration_id', v_r.id, 'amount_cents', v_owed,
                            'balance_cents', v_bal,
                            'paying_by', v_r.paying_by, 'paid', v_paid,
                            'has_link', (v_r.square_link_url is not null),
                            'link_url', case when v_paid then null else v_r.square_link_url end);
end;
$$;

revoke execute on function public.brk_public_registration(text, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.brk_public_registration(text, uuid) to brk_registrar;

-- 9f. brk_public_set_link(p_registration_id, p_submission_id, p_order_id,
--       p_link_url, p_amount_cents) - the Cloudflare Function stores the
-- Square payment link it just made. The registration is found by its id AND
-- the secret submission id. Stored once: refused when a link exists
-- (link_exists) or the registration is already paid (paid); only for a Card
-- registration (invalid {field:"paying_by"}). The order id is letters,
-- digits, - and _. The link must be https, no user name, no port, and its
-- host must be EXACTLY one of the Square hosts in the list inside the
-- function (compared in small letters, whole host, never "ends with");
-- otherwise invalid {field:"link_url"}. p_amount_cents is the amount the
-- link was made for: it must equal the balance now (owed minus paid), else
-- {"status":"price_changed","amount_cents":<the balance>} and nothing is
-- stored. The registration's version goes up (an open staff screen goes
-- "stale").
-- Ok: {"status":"ok"}
create or replace function public.brk_public_set_link(
  p_registration_id uuid,
  p_submission_id   uuid,
  p_order_id        text,
  p_link_url        text,
  p_amount_cents    integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- THE ALLOWED SQUARE HOSTS for a payment link (one place, exact match on
  -- the whole host, small letters). The real sandbox / production hosts must
  -- be confirmed during the Square sandbox test; a host that is missing here
  -- is added by a later migration (this function replaced), never by loosening
  -- the match.
  v_hosts text[] := array['square.link', 'checkout.square.site', 'connect.squareup.com',
                          'sandbox.square.link', 'connect.squareupsandbox.com', 'checkout.squareupsandbox.com'];
  v_host  text;
  v_id    uuid;
  v_r     public.brk_registrations;
  v_bal   integer;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    if p_registration_id is null or p_submission_id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if p_order_id is null or p_order_id !~ '^[A-Za-z0-9_-]{1,100}$' then
      return jsonb_build_object('status', 'invalid', 'field', 'order_id');
    end if;
    if p_amount_cents is null or p_amount_cents < 0 then
      return jsonb_build_object('status', 'invalid', 'field', 'amount_cents');
    end if;
    if p_link_url is null or char_length(p_link_url) > 2000
       or p_link_url !~ '^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~:/?#@!$&''()*+,;=%-]*)?$' then
      return jsonb_build_object('status', 'invalid', 'field', 'link_url');
    end if;
    -- the host: after "https://" only letters, digits, dots and dashes up to
    -- the first "/" or the end (so no user name "x@", no port ":443", nothing
    -- hidden before the slash), and the WHOLE host must be in the list
    v_host := lower(substring(p_link_url from '^https://([A-Za-z0-9.-]+)(?:/|$)'));
    if v_host is null or v_host <> all (v_hosts) then
      return jsonb_build_object('status', 'invalid', 'field', 'link_url');
    end if;

    select r.id into v_id from public.brk_registrations r
     where r.id = p_registration_id and r.submission_id = p_submission_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    v_r := public.brk_lock_registration(v_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.square_link_url is not null then
      return jsonb_build_object('status', 'link_exists');
    end if;
    if public.brk_paid_cents(v_r.id) >= coalesce(v_r.override_cents, v_r.amount_cents) then
      return jsonb_build_object('status', 'paid');
    end if;
    if v_r.paying_by <> 'card' then
      return jsonb_build_object('status', 'invalid', 'field', 'paying_by');
    end if;
    -- the link must be for exactly what is still owed
    v_bal := coalesce(v_r.override_cents, v_r.amount_cents) - public.brk_paid_cents(v_r.id);
    if p_amount_cents <> v_bal then
      return jsonb_build_object('status', 'price_changed', 'amount_cents', v_bal);
    end if;

    perform set_config('tkd.actor_label', 'Family form', true);
    perform set_config('tkd.action', 'brk_public_set_link', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.brk_registrations r
       set square_order_id = p_order_id,
           square_link_url = p_link_url
     where r.id = v_r.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    perform set_config('tkd.actor_label', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available or query_canceled then
      return jsonb_build_object('status', 'invalid');
  end;
end;
$$;

revoke execute on function public.brk_public_set_link(uuid, uuid, text, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.brk_public_set_link(uuid, uuid, text, text, integer) to brk_registrar;


-- ---------------------------------------------------------------------
-- 10. The Square webhook function (role brk_square ONLY)
-- brk_square_payment(school, square_event_id, payment_id, order_id,
--   amount_cents, currency, status)
-- The Cloudflare Function has already checked Square's signature; this
-- function still trusts nothing. "school" comes from the endpoint's address,
-- never from the message body. ONE transaction:
--   1. a message id seen before                      -> duplicate, nothing else changes
--   2. status other than COMPLETED                   -> not_completed
--   3. a payment id already recorded                 -> duplicate (a second
--      message about the same Square payment never makes a second payment)
--   4. find the student by the Square order id; none -> look in
--      brk_cleared_links (an order id whose link was cleared): found
--                                                    -> link_cleared (no
--      payment; the money is in Square, an admin sees it with the student's
--      name), else                                   -> unknown_order
--   5. lock event, then student, read them again
--   6. the student's event is at another school      -> wrong_school (no
--      payment: a Worcester message can never mark a Shrewsbury student paid)
--   7. Paying by is not Card                         -> not_card
--   8. nothing is owed any more                      -> already_paid
--   9. currency not USD, or the amount is not exactly what is still owed
--                                                    -> amount_mismatch
--      (no payment is written; an admin sees it)
--  10. else a payment (kind payment, method card, school = the event's
--      school, recorded by "Square", the Square payment id unique)  -> paid
-- Every outcome except the first is first written to brk_square_events (its
-- primary key is the replay guard: the insert of an id that exists does
-- nothing, and the call answers duplicate). Only 'paid' writes a payment.
-- A database error is NOT caught: the Function answers 500 and Square sends
-- the message again; the unique keys make that safe.
-- Bad input (not a school, an id that isn't plain text ...) -> {"status":"invalid"}.
-- Ok: {"status":"ok","outcome":"paid"|"duplicate"|"unknown_order"|
--      "amount_mismatch"|"not_card"|"not_completed"|"already_paid"|
--      "wrong_school"|"link_cleared","registration_id":... (when a student
--      matched)}
-- ---------------------------------------------------------------------
create or replace function public.brk_square_payment(
  p_school          text,
  p_square_event_id text,
  p_payment_id      text,
  p_order_id        text,
  p_amount_cents    integer,
  p_currency        text,
  p_status          text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reg_id     uuid;
  v_r          public.brk_registrations;
  v_e          public.brk_events;
  v_outcome    text;
  v_match      uuid;
  v_school     text;
  v_owed       integer;
  v_paid       integer;
  v_n          integer;
  v_constraint text;
begin
  -- forget any login token; say who is writing
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('tkd.actor_label', 'Square', true);

  if p_school is null or not exists (select 1 from public.locations l where l.code = p_school)
     or p_square_event_id is null or p_square_event_id !~ '^[A-Za-z0-9_.:-]{1,200}$'
     or p_payment_id is null or p_payment_id !~ '^[A-Za-z0-9_.:-]{1,200}$'
     or (p_order_id is not null and p_order_id !~ '^[A-Za-z0-9_-]{1,100}$')
     or p_amount_cents is null
     or p_currency is null or char_length(p_currency) not between 1 and 10
     or p_status is null or char_length(p_status) not between 1 and 40 then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform set_config('lock_timeout', '3s', true);

  -- 1. a message we already have: nothing changes
  if exists (select 1 from public.brk_square_events s where s.square_event_id = p_square_event_id) then
    return jsonb_build_object('status', 'ok', 'outcome', 'duplicate');
  end if;

  begin
    v_match := null;
    -- 2. only a completed payment counts
    if p_status <> 'COMPLETED' then
      v_outcome := 'not_completed';
    -- 3. a payment id we already recorded
    elsif exists (select 1 from public.brk_payments p where p.square_payment_id = p_payment_id) then
      v_outcome := 'duplicate';
    else
      -- 4. the student by the Square order id
      select r.id into v_reg_id from public.brk_registrations r where r.square_order_id = p_order_id;
      if found then
        -- 5. lock event, then student, and read them again
        v_r := public.brk_lock_registration(v_reg_id);
        if v_r.id is null or v_r.square_order_id is distinct from p_order_id then
          v_reg_id := null;   -- cleared or removed while we waited: look in the cleared links below
        end if;
      end if;
      if v_reg_id is null then
        -- no student holds this order id now: was its link cleared?
        select c.registration_id into v_match from public.brk_cleared_links c where c.order_id = p_order_id;
        if found then
          select e.location_code into v_school
            from public.brk_registrations r join public.brk_events e on e.id = r.event_id
           where r.id = v_match;
          v_outcome := case when v_school <> p_school then 'wrong_school' else 'link_cleared' end;
        else
          v_match   := null;
          v_outcome := 'unknown_order';
        end if;
      else
        v_match := v_r.id;
        select * into v_e from public.brk_events e where e.id = v_r.event_id;
        v_owed := coalesce(v_r.override_cents, v_r.amount_cents);
        v_paid := public.brk_paid_cents(v_r.id);
        if v_e.location_code <> p_school then
          v_outcome := 'wrong_school';
        elsif v_r.paying_by <> 'card' then
          v_outcome := 'not_card';
        elsif v_owed - v_paid <= 0 then
          v_outcome := 'already_paid';
        elsif p_currency <> 'USD' or p_amount_cents <> v_owed - v_paid then
          v_outcome := 'amount_mismatch';
        else
          v_outcome := 'paid';
        end if;
      end if;
    end if;

    perform set_config('tkd.action', 'brk_square_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- the replay guard: the message's own row (an id that exists does nothing)
    insert into public.brk_square_events
      (square_event_id, school, type, payment_id, order_id, amount_cents, outcome, registration_id)
    values
      (p_square_event_id, p_school, 'payment.updated', p_payment_id, p_order_id, p_amount_cents, v_outcome, v_match)
    on conflict (square_event_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return jsonb_build_object('status', 'ok', 'outcome', 'duplicate');   -- a concurrent copy got there first
    end if;

    if v_outcome = 'paid' then
      insert into public.brk_payments
        (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
         square_payment_id)
      values
        (v_r.id, 'payment', p_amount_cents, 'card', public.testing_today(), v_e.location_code, now(), null, 'Square',
         p_payment_id);

      update public.brk_registrations r set version = r.version + 1 where r.id = v_r.id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    perform set_config('tkd.actor_label', '', true);

    return case when v_match is null
                then jsonb_build_object('status', 'ok', 'outcome', v_outcome)
                else jsonb_build_object('status', 'ok', 'outcome', v_outcome, 'registration_id', v_match)
           end;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'brk_payments_square_payment_id_key' then
        raise;
      end if;
      -- two messages (two event ids) about the same Square payment raced:
      -- the other one made the payment; this one is only noted
      perform set_config('tkd.action', 'brk_square_payment', true);
      perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
      insert into public.brk_square_events
        (square_event_id, school, type, payment_id, order_id, amount_cents, outcome, registration_id)
      values
        (p_square_event_id, p_school, 'payment.updated', p_payment_id, p_order_id, p_amount_cents, 'duplicate', null)
      on conflict (square_event_id) do nothing;
      return jsonb_build_object('status', 'ok', 'outcome', 'duplicate');
  end;
end;
$$;

revoke execute on function public.brk_square_payment(text, text, text, text, integer, text, text)
  from public, anon, authenticated, service_role;
grant  execute on function public.brk_square_payment(text, text, text, text, integer, text, text) to brk_square;


-- ---------------------------------------------------------------------
-- 11. The starting rows (inserted only if missing, so a re-run changes
--     nothing). Tagged as a seed in the history.
--   * brk_settings: tech 300, adult 400, card extra 25, same-day extra 100
--     (cents per board), Child up to age 12, version 1.
--   * brk_chart: the live registration page's numbers
--     (docs/Board Breaking/Board-chart-seed.md; the printed PDF chart is
--     incorrect). The technique words are only a STARTING TEXT from the old
--     PDF - Jeffrey confirms or fixes them in Chart and prices. "Power
--     Breaking" = the 3 Adult boards. sort = the order inside a band.
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'Seed (migration 0051)', true);
select set_config('tkd.action', 'brk_seed', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);

insert into public.brk_settings (tech_cents, adult_cents, card_extra_cents, same_day_extra_cents, child_max_age,
                                 created_by_name, updated_by_name)
values (300, 400, 25, 100, 12, '', '')
on conflict (singleton) do nothing;

insert into public.brk_chart (band, rank_name, sort, technique, tech_boards, adult_boards)
select v.band, v.rank_name, v.sort, v.technique, v.tech_boards, v.adult_boards
  from (values
    -- Little Tiger (any age): 3 Technical, 0 Adult
    ('tiger', 'Little Tiger White',  0, 'Hammer Fist',  3, 0),
    ('tiger', 'Little Tiger Yellow', 1, 'Hammer Fist',  3, 0),
    ('tiger', 'Little Tiger Green',  2, 'Elbow Strike', 3, 0),
    ('tiger', 'Little Tiger Blue',   3, 'Elbow Strike', 3, 0),
    ('tiger', 'Little Tiger Red',    4, 'Axe Kick',     3, 0),
    ('tiger', 'Little Tiger Black',  5, 'Axe Kick',     3, 0),
    -- Child (12 and under)
    ('child', 'White',            0, 'Hammer Fist',                                  3, 0),
    ('child', 'Yellow',           1, 'Elbow Strike',                                 3, 0),
    ('child', 'Orange',           2, 'Flying Side Kick',                             3, 0),
    ('child', 'Green',            3, 'Axe Kick',                                     3, 0),
    ('child', 'High Green',       4, 'Round House Kick',                             3, 0),
    ('child', 'Blue',             5, 'Punch',                                        4, 0),
    ('child', 'High Blue',        6, 'Jumping Front Snap Kick',                      4, 0),
    ('child', 'Purple',           7, 'Back Kick',                                    4, 0),
    ('child', 'Red',              8, 'Spinning Round House',                         4, 0),
    ('child', 'High Red',         9, 'Skipping Hook Kick',                           4, 0),
    ('child', 'Brown',           10, 'Back Hook Kick',                               4, 0),
    ('child', 'High Brown',      11, 'Back Kick (Adult Board)',                      3, 1),
    ('child', 'Red / Black',     12, 'Back Kick / Axe (Adult Board)',                2, 2),
    ('child', 'Bo-Dan / Deputy', 13, 'Back Hook + Spinning Round House + 3 Power Breaking', 2, 3),
    -- Teen / Adult (13 and up)
    ('teen', 'White',            0, 'Hammer Fist',                                   0, 3),
    ('teen', 'Yellow',           1, 'Elbow Strike',                                  0, 3),
    ('teen', 'Orange',           2, 'Front Snap Kick',                               0, 3),
    ('teen', 'Green',            3, 'Axe Kick',                                      0, 3),
    ('teen', 'High Green',       4, 'Round House Kick',                              0, 3),
    ('teen', 'Blue',             5, 'Punch',                                         1, 3),
    ('teen', 'High Blue',        6, 'Jumping Front Snap Kick',                       1, 3),
    ('teen', 'Purple',           7, 'Back Kick',                                     1, 3),
    ('teen', 'Red',              8, 'Spinning Round House',                          1, 3),
    ('teen', 'High Red',         9, 'Skipping Hook Kick',                            1, 3),
    ('teen', 'Brown',           10, 'Back Hook Kick',                                1, 3),
    ('teen', 'High Brown',      11, 'Back Kick (Adult Board)',                       1, 3),
    ('teen', 'Red / Black',     12, 'Back Kick / Axe (Adult Board)',                 1, 4),
    ('teen', 'Bo-Dan / Deputy', 13, 'Back Hook + Spinning Round House + 3 Power Breaking', 2, 3),
    -- Black Belt (any age)
    ('black', '1st Dan',        0, 'Back Hook + Spinning Round House + Power Breaking', 4, 3),
    ('black', '1st Dan 1 Star', 1, 'Side Kick Punch',                    4, 3),
    ('black', '1st Dan 2 Star', 2, 'Eagle',                              4, 3),
    ('black', '1st Dan 3 Star', 3, 'Side Kick / Back Kick',              4, 3),
    ('black', '1st Dan 4 Star', 4, '7 Station + Power Breaking',         7, 3),
    ('black', '2nd Dan',        5, '7 Station + Power Breaking',         7, 3),
    ('black', '2nd Dan 1 Star', 6, '3 Kicks in Air',                     6, 3),
    ('black', '2nd Dan 2 Star', 7, '3 Kicks in Air',                     6, 3),
    ('black', '2nd Dan 3 Star', 8, '3 Kicks in Air',                     6, 3),
    ('black', '3rd Dan',        9, '3 Kicks in Air',                     6, 3),
    ('black', '3rd Dan 1 Star', 10, '3 Kicks in Air',                    6, 3),
    ('black', '3rd Dan 2 Star', 11, '3 Kicks in Air',                    6, 3),
    ('black', '3rd Dan 3 Star', 12, '3 Kicks in Air',                    6, 3),
    ('black', '3rd Dan 4 Star', 13, '3 Kicks in Air',                    6, 3),
    ('black', '3rd Dan 5 Star', 14, '4 Adult Board Back Kick',           6, 3)
  ) as v (band, rank_name, sort, technique, tech_boards, adult_boards)
on conflict (band, rank_name) do nothing;

select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);


commit;

-- End of 0051_board_breaking.sql
