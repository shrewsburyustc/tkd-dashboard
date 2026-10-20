-- =====================================================================
-- 0016_black_belt.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database migration for Black Belt testing (1st to 4th Dan). Build
--   contract: docs/Dashboard Docs/Build contracts/CONTRACT-0016.md (approved
--   2026-10-19, rulebook v0.909). It runs after 0001-0006, 0010 and 0011
--   and changes NONE of their objects, grants, rules or tests: it only adds
--   new bb_* objects and calls a few 0001-0005 helpers from its own
--   functions (contract section 1.2).
--
-- WHY IT EXISTS
--   Black Belt testing runs in CYCLES: one season (e.g. "Spring 2027") with
--   several testing days (Physical, Technical, Curriculum ...), deadlines
--   and payment plans. Families register on a public form (one link per
--   school) and sign a waiver; the desk adds walk-ins with a paper waiver;
--   staff record payments (in full or in several payments, plus the
--   optional Kukkiwon certificate). Grading is NOT in this migration (it
--   waits for Master Jeong's answers); section 12 of the contract says
--   what is left ready for it.
--   Candidates are mostly minors: the date of birth, the results email,
--   the drawn signature and the signer's name are never readable by the
--   app's normal rights, and never written to the history (change_log) in
--   plain text. They are removed automatically once the keeping time the
--   insurer gives has passed ("the purge", section 13).
--
-- WHAT IT ADDS
--   * 13 tables (all bb_*): settings, waiver versions, the starting point
--     for the first cycle, cycles, their days and parts, each cycle's own
--     plans / amounts / Kukkiwon fees / due dates, candidates, signed
--     waivers and an append-only payment ledger
--   * 1 counter (the BB-5001 references), no views
--   * 19 staff write functions and 6 staff read functions (the ONLY way
--     the app reads personal data or writes anything), 2 public functions
--     for the family form, and internal helpers nobody can call
--   * a restricted login role, bb_registrar, that can run exactly the 2
--     public functions and nothing else (its password is NOT in this file
--     - see supabase/SETUP.md section 18)
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words delete and drop appear inside rules ("on delete cascade"),
--   inside functions that run later (an admin removing a cycle or a fake
--   registration; old rate-limit rows being cleaned up) and in "... if
--   exists" lines that make re-running safe. Nothing is removed now.
--   Confirm.
--   (Claude's Supabase connection refuses SQL containing those words, which
--   is why this file is pasted by hand.)
--   Safe to run again: "create table if not exists", "create or replace
--   function", rules and triggers replaced with "... if exists" + create,
--   seeds that never overwrite, the role created only if missing.
--
-- WORDS USED BELOW
--   * "today" = the date in Massachusetts: public.testing_today() (0005).
--     A school date from a timestamp is always public.testing_school_date();
--     "::date" on a timestamp WITH time zone is never used (it would take
--     the UTC date and be a day off in the evening).
--   * "cycle" = one Black Belt testing season; "day" = one of its testing
--     days; "part" = physical / technical / curriculum (what is graded on
--     a day); "plan" = a way to pay (In full, 3 payments ...); "item" = one
--     thing a candidate owes (payment 1, 2 ... of the plan, or Kukkiwon).
--   * "version", "stale", "lock", "security definer", search_path = '':
--     the same meaning as in 0003, 0005 and 0006 (read their headers).
--   * "lock order": every Black Belt write takes its locks in the order
--     bb_settings -> cycle -> candidate(s) -> payment. Writes that always
--     lock in the same order can never wait on each other in a circle (a
--     "deadlock"). Every function's comment says its own order ("locks:").
--   * "purge": removing a candidate's date of birth, email, signature and
--     signer's name once the keeping time has passed (section 13).
--   * statuses the functions answer: the 0003 set (ok, no_access,
--     not_allowed, not_found, stale, duplicate_name, invalid, not_empty),
--     from 0005 rate_limited, not_open, closed, finished, withdrawn, and new
--     here: part_without_day, has_payments, has_waivers, confirm_needed,
--     waiver_changed, waiver_needed, refund_too_large.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. Small rule helpers (the table rules below use them, so they come
--    first). Nobody in the app can call them.
-- ---------------------------------------------------------------------

-- 1a. bb_price_is_valid(cents) - a price (a plan payment's amount or a
-- Kukkiwon fee): whole dollars from $1 to $5,000, stored as cents
-- (29000 = $290). NULL -> false. (0005's testing_cents_is_valid stops at
-- $1,000, too low for 4th Dan, so Black Belt has its own rule.)
create or replace function public.bb_price_is_valid(p_cents integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_cents between 100 and 500000 and p_cents % 100 = 0, false);
$$;

revoke execute on function public.bb_price_is_valid(integer) from public, anon, authenticated, service_role;

-- 1b. bb_email_is_valid(email) - the "email for results": a copy of Star's
-- rule (0006 1b): at most 254 characters, something@something.something
-- with no spaces and one "@", and no invisible control or format
-- characters. The functions trim spaces first; the address is stored as
-- typed. NULL -> false.
create or replace function public.bb_email_is_valid(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(char_length(p_email) <= 254
                  and p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                  and p_email !~ '[\x01-\x1f\x7f-\x9f​-‏‪-‮⁠-⁤⁦-⁩﻿]',
                  false);
$$;

revoke execute on function public.bb_email_is_valid(text) from public, anon, authenticated, service_role;

-- 1c. bb_time_is_valid(time) - a testing day's start or end time (the
-- screen's dropdown): 6:00 AM to 10:00 PM on a 15-minute step (6:00, 6:15
-- ...), no seconds. NULL -> false.
create or replace function public.bb_time_is_valid(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_time between time '06:00' and time '22:00'
                  and extract(minute from p_time)::integer % 15 = 0
                  and extract(second from p_time) = 0,
                  false);
$$;

revoke execute on function public.bb_time_is_valid(time) from public, anon, authenticated, service_role;

-- 1d. bb_requirements_is_valid(sheet) - the OUTER shape of a requirements
-- sheet (what the family form's "What [Dan] is tested on" panel draws,
-- v0.901). The database checks only this much, so the grading migration
-- can drop the sheet cleanly later:
--   an object with schema_version 1 and "dans": exactly 4 objects with
--   dan 1, 2, 3, 4 in that order, each with pass_rule (object), parts (1-6
--   objects, each with a code physical / technical / curriculum / other,
--   a name, max_points and a subjects array), extra_points (object) and an
--   optional hand_in array; at most 200 000 bytes in all.
-- The inside of each subject (credits, scoring tables) is fixed by the
-- seed and the page, not here. NULL or any other shape -> false.
create or replace function public.bb_requirements_is_valid(p_sheet jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           jsonb_typeof(p_sheet) = 'object'
           and pg_column_size(p_sheet) <= 200000
           and p_sheet -> 'schema_version' = '1'::jsonb
           and jsonb_typeof(p_sheet -> 'dans') = 'array'
           and jsonb_array_length(p_sheet -> 'dans') = 4
           and not exists (
             select 1
               from jsonb_array_elements(p_sheet -> 'dans') with ordinality as d(dan, n)
              where jsonb_typeof(d.dan) <> 'object'
                 or d.dan -> 'dan' is distinct from to_jsonb(d.n)
                 or jsonb_typeof(d.dan -> 'pass_rule') is distinct from 'object'
                 or jsonb_typeof(d.dan -> 'extra_points') is distinct from 'object'
                 or (d.dan ? 'hand_in' and jsonb_typeof(d.dan -> 'hand_in') <> 'array')
                 or jsonb_typeof(d.dan -> 'parts') is distinct from 'array'
                 or jsonb_array_length(d.dan -> 'parts') not between 1 and 6
                 or exists (
                      select 1
                        from jsonb_array_elements(d.dan -> 'parts') as p(part)
                       where jsonb_typeof(p.part) <> 'object'
                          or coalesce(p.part ->> 'code', '') not in ('physical', 'technical', 'curriculum', 'other')
                          or jsonb_typeof(p.part -> 'name') is distinct from 'string'
                          or jsonb_typeof(p.part -> 'max_points') is distinct from 'number'
                          or jsonb_typeof(p.part -> 'subjects') is distinct from 'array')),
         false);
$$;

revoke execute on function public.bb_requirements_is_valid(jsonb) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. Rubric and prices: the settings row and the waiver versions
--    (v0.213, v0.900, v0.902, v0.905, v0.906). Since v0.902 prices are not
--    kept here: each cycle has its own (section 6). The seed rows for this
--    section and section 3 are written at the END of section 11, after the
--    triggers exist, so the history records them (as 0006 13m does).
-- ---------------------------------------------------------------------

-- 2a. public.bb_settings - ONE row (singleton): the two keep-years
-- settings, and the "template lock" row every Rubric and prices write and
-- Add cycle lock first (contract 1.5).
--   keep_years_after_last_day (N1): keep signed waivers N1 years after the
--     cycle's last testing day ...
--   keep_years_after_18 (N2): ... and for under-18s until N2 years after
--     they turn 18, if that is later.
--   Both empty = nothing is ever purged (until the insurer answers, S12);
--   otherwise both are whole years from 3 to 20.
create table if not exists public.bb_settings (
  id                        uuid        not null default gen_random_uuid(),
  singleton                 boolean     not null default true,
  keep_years_after_last_day smallint    null,
  keep_years_after_18       smallint    null,
  version                   integer     not null default 1,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid        null,      -- login id; never readable by the app
  updated_by                uuid        null,      -- login id; never readable by the app
  created_by_name           text        not null,
  updated_by_name           text        not null,

  constraint bb_settings_pkey primary key (id),
  constraint bb_settings_singleton_key unique (singleton),
  constraint bb_settings_singleton_check check (singleton),
  constraint bb_settings_keep_years_check
    check ((keep_years_after_last_day is null and keep_years_after_18 is null)
           or (keep_years_after_last_day between 3 and 20 and keep_years_after_18 between 3 and 20)),
  constraint bb_settings_version_check check (version >= 1)
);

comment on table public.bb_settings is
  'Black Belt settings: one row. The two keep-years numbers of the signed-waiver purge (both empty = nothing is purged). Also the lock row of Rubric and prices.';

-- 2b. public.bb_waiver_versions - every waiver text ever saved. Written
-- once: an update may only set superseded_at (once, when the next version
-- is saved), and a version is never removed (signed waivers point at it
-- for good). Exactly one version is current (superseded_at empty).
--   version_name: "2027-1" = the year it was saved + the count that year
--   is_placeholder: true only on the seeded text, which must be replaced
--     before registration can open (contract 14 OI-1)
create table if not exists public.bb_waiver_versions (
  id              uuid        not null default gen_random_uuid(),
  version_name    text        not null,
  body            text        not null,
  is_placeholder  boolean     not null default false,
  superseded_at   timestamptz null,
  created_at      timestamptz not null default now(),
  created_by      uuid        null,      -- login id; never readable by the app
  created_by_name text        not null,

  constraint bb_waiver_versions_pkey primary key (id),
  constraint bb_waiver_versions_version_name_key unique (version_name),
  constraint bb_waiver_versions_version_name_check check (version_name ~ '^[0-9]{4}-[1-9][0-9]*$'),
  constraint bb_waiver_versions_body_check check (char_length(btrim(body)) between 1 and 20000)
);

-- "(true)" is the same value for every row, so with "where superseded_at
-- is null" this allows at most ONE current version.
create unique index if not exists bb_waiver_versions_one_current_idx
  on public.bb_waiver_versions ((true)) where superseded_at is null;

comment on table public.bb_waiver_versions is
  'Every Black Belt waiver text ever saved; written once, never removed. Exactly one is current (superseded_at is null).';


-- ---------------------------------------------------------------------
-- 3. public.bb_starting_point - ONE row: what the very first Add cycle is
--    filled in from (S9, v0.901, v0.902): the Fall 2026 schedule, plans,
--    amounts, due dates and Kukkiwon fees (schedule, in Add cycle's
--    payload shape without the name) and the Fall 2026 requirements sheet.
--    After the first cycle exists, Add cycle starts from the newest cycle
--    instead. NOT readable by anyone in the app (RLS on, no rule, no
--    rights); read only by bb_cycle_defaults (section 16).
--    It can't be changed or removed, except in Jeffrey's own SQL Editor
--    session to fix a seeded number (guard, section 11).
-- ---------------------------------------------------------------------
create table if not exists public.bb_starting_point (
  id              uuid        not null default gen_random_uuid(),
  singleton       boolean     not null default true,
  schedule        jsonb       not null,
  requirements    jsonb       not null,
  created_at      timestamptz not null default now(),
  created_by_name text        not null,

  constraint bb_starting_point_pkey primary key (id),
  constraint bb_starting_point_singleton_key unique (singleton),
  constraint bb_starting_point_singleton_check check (singleton),
  constraint bb_starting_point_schedule_check check (jsonb_typeof(schedule) = 'object'),
  constraint bb_starting_point_requirements_check check (public.bb_requirements_is_valid(requirements))
);

comment on table public.bb_starting_point is
  'Black Belt: the Fall 2026 values the first Add cycle is filled in from. Never granted to any role.';


-- ---------------------------------------------------------------------
-- 4. public.bb_cycles - one Black Belt testing season (both schools;
--    v0.209, v0.212, v0.900-v0.902)
--   * application_due: the last day to apply; with auto_close on, the form
--     closes at the end of that day (11:59 PM Massachusetts time). An
--     admin reopening after it turns auto_close off (v0.85).
--   * submissions_due: the hand-in date (project, letters ...)
--   * registration_open / first_opened_at: the Open / Closed switch (new
--     cycles start Closed)
--   * public_code_worcester / _shrewsbury: the two family links (random,
--     8 characters; the link sets the candidate's school). Never change.
--   * requirements: the requirements sheet, copied at Add cycle; no
--     function changes it (only Jeffrey's SQL Editor fix, section 11)
--   * prices_from: the name of what Add cycle was filled in from ("Filled
--     in from Fall 2026 starting point"); never changes
--   * created_at doubles as "prices set on" (prices never change, v0.902)
-- ---------------------------------------------------------------------
create table if not exists public.bb_cycles (
  id                     uuid        not null default gen_random_uuid(),
  name                   text        not null,
  application_due        date        not null,
  submissions_due        date        not null,
  auto_close             boolean     not null default true,
  registration_open      boolean     not null default false,
  first_opened_at        timestamptz null,
  public_code_worcester  text        not null,
  public_code_shrewsbury text        not null,
  requirements           jsonb       not null,
  prices_from            text        null,
  version                integer     not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid        null,      -- login id; never readable by the app
  updated_by             uuid        null,      -- login id; never readable by the app
  created_by_name        text        not null,
  updated_by_name        text        not null,

  constraint bb_cycles_pkey primary key (id),
  constraint bb_cycles_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint bb_cycles_opened_check check (not registration_open or first_opened_at is not null),
  constraint bb_cycles_code_worcester_key unique (public_code_worcester),
  constraint bb_cycles_code_shrewsbury_key unique (public_code_shrewsbury),
  constraint bb_cycles_codes_check
    check (public_code_worcester ~ '^[a-hjkmnp-z2-9]{8}$'
           and public_code_shrewsbury ~ '^[a-hjkmnp-z2-9]{8}$'
           and public_code_worcester <> public_code_shrewsbury),
  constraint bb_cycles_requirements_check check (public.bb_requirements_is_valid(requirements)),
  constraint bb_cycles_prices_from_check
    check (prices_from is null
           or coalesce(public.testing_name_is_valid(prices_from) and prices_from = public.testing_normalize_name(prices_from), false)),
  constraint bb_cycles_version_check check (version >= 1)
);

-- A cycle name is unique ignoring capitals and extra spaces.
create unique index if not exists bb_cycles_lower_name_idx
  on public.bb_cycles (lower(public.testing_normalize_name(name)));

comment on table public.bb_cycles is
  'Black Belt testing cycles (one season, both schools), with the two family-link codes and the requirements sheet.';


-- ---------------------------------------------------------------------
-- 5. A cycle's testing days and the parts graded on each
--    (v0.209, v0.900 details 1-4)
-- ---------------------------------------------------------------------

-- 5a. public.bb_cycle_days - one testing day. Its id stays the same when
-- the cycle is edited (days are matched by id), so grading can point at
-- it later.
--   place: a school (place_code) OR other text (place_other, e.g. "Horgan
--     Arena, 403 Oxford St N, Auburn MA 01501") - exactly one of the two.
--     Deliberately not called location_code: a day belongs to both schools
--     and the history must not file it under one.
--   second_*: an optional second part of the same day (e.g. the outdoor
--     part), all four set or none, starting at or after the first part's
--     end.
create table if not exists public.bb_cycle_days (
  id                 uuid        not null default gen_random_uuid(),
  cycle_id           uuid        not null,
  name               text        not null,
  day_date           date        not null,
  start_time         time        not null,
  end_time           time        not null,
  place_code         text        null,
  place_other        text        null,
  second_start       time        null,
  second_end         time        null,
  second_place_code  text        null,
  second_place_other text        null,
  version            integer     not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid        null,      -- login id; never readable by the app
  updated_by         uuid        null,      -- login id; never readable by the app
  created_by_name    text        not null,
  updated_by_name    text        not null,

  constraint bb_cycle_days_pkey primary key (id),
  constraint bb_cycle_days_cycle_fk foreign key (cycle_id) references public.bb_cycles (id) on delete cascade,
  constraint bb_cycle_days_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint bb_cycle_days_times_check
    check (public.bb_time_is_valid(start_time) and public.bb_time_is_valid(end_time) and end_time > start_time),
  constraint bb_cycle_days_place_fk foreign key (place_code) references public.locations (code),
  constraint bb_cycle_days_second_place_fk foreign key (second_place_code) references public.locations (code),
  constraint bb_cycle_days_place_other_check
    check (place_other is null
           or coalesce(public.testing_note_is_valid(place_other) and char_length(place_other) <= 100
                       and place_other = public.testing_normalize_note(place_other), false)),
  constraint bb_cycle_days_second_place_other_check
    check (second_place_other is null
           or coalesce(public.testing_note_is_valid(second_place_other) and char_length(second_place_other) <= 100
                       and second_place_other = public.testing_normalize_note(second_place_other), false)),
  constraint bb_cycle_days_place_check check (num_nonnulls(place_code, place_other) = 1),
  constraint bb_cycle_days_second_check
    check ((second_start is null and second_end is null and second_place_code is null and second_place_other is null)
           or (second_start is not null and second_end is not null and second_end > second_start
               and second_start >= end_time and num_nonnulls(second_place_code, second_place_other) = 1)),
  constraint bb_cycle_days_second_times_check
    check (second_start is null or (public.bb_time_is_valid(second_start) and public.bb_time_is_valid(second_end))),
  constraint bb_cycle_days_version_check check (version >= 1)
);

create index if not exists bb_cycle_days_cycle_date_idx on public.bb_cycle_days (cycle_id, day_date);

comment on table public.bb_cycle_days is
  'Black Belt testing days of a cycle (date, times, place, optional second part).';

-- 5b. public.bb_cycle_day_parts - which parts (physical / technical /
-- curriculum) are graded on a day. A part may be on two days (detail 2);
-- every part must be on at least one day (checked by Add / Update cycle,
-- part_without_day). Rows are only added and removed, never changed.
create table if not exists public.bb_cycle_day_parts (
  id              uuid        not null default gen_random_uuid(),
  day_id          uuid        not null,
  part            text        not null,
  created_at      timestamptz not null default now(),
  created_by      uuid        null,      -- login id; never readable by the app
  created_by_name text        not null,

  constraint bb_cycle_day_parts_pkey primary key (id),
  constraint bb_cycle_day_parts_day_fk foreign key (day_id) references public.bb_cycle_days (id) on delete cascade,
  constraint bb_cycle_day_parts_part_check check (part in ('physical', 'technical', 'curriculum')),
  constraint bb_cycle_day_parts_day_part_key unique (day_id, part)
);

comment on table public.bb_cycle_day_parts is
  'Black Belt: the parts graded on each testing day.';


-- ---------------------------------------------------------------------
-- 6. A cycle's own prices (v0.902: set when the cycle is saved, never
--    changed afterwards). Written only by bb_add_cycle; removed only
--    together with their cycle (guards, section 11). The due dates (6d)
--    stay editable in Edit cycle.
-- ---------------------------------------------------------------------

-- 6a. public.bb_cycle_plans - a way to pay (e.g. "In full", "3 payments"):
-- its name, how many payments (1-12) and its place on the form.
create table if not exists public.bb_cycle_plans (
  id              uuid        not null default gen_random_uuid(),
  cycle_id        uuid        not null,
  name            text        not null,
  payments_count  smallint    not null,
  position        smallint    not null,
  created_at      timestamptz not null default now(),
  created_by_name text        not null,

  constraint bb_cycle_plans_pkey primary key (id),
  constraint bb_cycle_plans_cycle_fk foreign key (cycle_id) references public.bb_cycles (id) on delete cascade,
  constraint bb_cycle_plans_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint bb_cycle_plans_payments_count_check check (payments_count between 1 and 12),
  constraint bb_cycle_plans_position_check check (position >= 0),
  constraint bb_cycle_plans_cycle_position_key unique (cycle_id, position),
  -- the target of the candidates' (cycle_id, cycle_plan_id) key: a
  -- candidate can never point at another cycle's plan
  constraint bb_cycle_plans_cycle_id_id_key unique (cycle_id, id)
);

create unique index if not exists bb_cycle_plans_cycle_lower_name_idx on public.bb_cycle_plans (cycle_id, lower(name));

comment on table public.bb_cycle_plans is
  'Black Belt: a cycle''s payment plans (set when the cycle is added, never changed).';

-- 6b. public.bb_cycle_plan_amounts - what each payment of a plan costs,
-- per Dan: exactly payments_count x 4 rows per plan (written by
-- bb_add_cycle).
create table if not exists public.bb_cycle_plan_amounts (
  id            uuid     not null default gen_random_uuid(),
  cycle_plan_id uuid     not null,
  dan           smallint not null,
  payment_no    smallint not null,
  amount_cents  integer  not null,

  constraint bb_cycle_plan_amounts_pkey primary key (id),
  constraint bb_cycle_plan_amounts_plan_fk foreign key (cycle_plan_id) references public.bb_cycle_plans (id) on delete cascade,
  constraint bb_cycle_plan_amounts_dan_check check (dan between 1 and 4),
  constraint bb_cycle_plan_amounts_payment_no_check check (payment_no >= 1),
  constraint bb_cycle_plan_amounts_amount_check check (public.bb_price_is_valid(amount_cents)),
  constraint bb_cycle_plan_amounts_plan_dan_payment_key unique (cycle_plan_id, dan, payment_no)
);

comment on table public.bb_cycle_plan_amounts is
  'Black Belt: the amount of each plan payment per Dan (set when the cycle is added, never changed).';

-- 6c. public.bb_cycle_kukkiwon_fees - the Kukkiwon certificate fee per
-- Dan (exactly 4 rows per cycle).
create table if not exists public.bb_cycle_kukkiwon_fees (
  id           uuid     not null default gen_random_uuid(),
  cycle_id     uuid     not null,
  dan          smallint not null,
  amount_cents integer  not null,

  constraint bb_cycle_kukkiwon_fees_pkey primary key (id),
  constraint bb_cycle_kukkiwon_fees_cycle_fk foreign key (cycle_id) references public.bb_cycles (id) on delete cascade,
  constraint bb_cycle_kukkiwon_fees_dan_check check (dan between 1 and 4),
  constraint bb_cycle_kukkiwon_fees_amount_check check (public.bb_price_is_valid(amount_cents)),
  constraint bb_cycle_kukkiwon_fees_cycle_dan_key unique (cycle_id, dan)
);

comment on table public.bb_cycle_kukkiwon_fees is
  'Black Belt: a cycle''s Kukkiwon certificate fee per Dan (set when the cycle is added, never changed).';

-- 6d. public.bb_cycle_plan_payments - each plan payment's due date. Stays
-- editable in Edit cycle (v0.902). follows_application_due (payment 1
-- only): the date moves with Application due until someone types another
-- date.
create table if not exists public.bb_cycle_plan_payments (
  id                      uuid        not null default gen_random_uuid(),
  cycle_plan_id           uuid        not null,
  payment_no              smallint    not null,
  due_on                  date        not null,
  follows_application_due boolean     not null default false,
  version                 integer     not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid        null,      -- login id; never readable by the app
  updated_by              uuid        null,      -- login id; never readable by the app
  created_by_name         text        not null,
  updated_by_name         text        not null,

  constraint bb_cycle_plan_payments_pkey primary key (id),
  constraint bb_cycle_plan_payments_plan_fk foreign key (cycle_plan_id) references public.bb_cycle_plans (id) on delete cascade,
  constraint bb_cycle_plan_payments_payment_no_check check (payment_no >= 1),
  constraint bb_cycle_plan_payments_follows_check check (not follows_application_due or payment_no = 1),
  constraint bb_cycle_plan_payments_plan_payment_key unique (cycle_plan_id, payment_no),
  constraint bb_cycle_plan_payments_version_check check (version >= 1)
);

comment on table public.bb_cycle_plan_payments is
  'Black Belt: the due date of each plan payment (editable in Edit cycle).';


-- ---------------------------------------------------------------------
-- 7. public.bb_candidates - one person in one cycle (v0.211, v0.212,
--    v0.900, v0.907)
--   * names: same rule as 0003's names, stored tidied (belt spelling)
--   * date_of_birth, email_for_results: NEVER readable by the app's normal
--     rights (only through bb_candidate_detail). Required on every write;
--     empty only after the purge, which also sets personal_removed_at.
--   * location_code: the candidate's school (from the link, or chosen at
--     the desk); called location_code so the history files the row under
--     that school
--   * dan 1-4, the cycle's plan, Kukkiwon yes / no (+ the school day it was
--     chosen: a late Kukkiwon is due that day, v0.900)
--   * source 'form' or 'desk'; reference BB-5001 ... (one counter for both)
--   * status / withdrawn_* / duplicate_*: exactly as 0006's candidates
--     (withdrawn_by is a login id: never readable by the app)
--   Every candidate has at least one waiver row (section 8), written in
--   the same call.
-- ---------------------------------------------------------------------
create sequence if not exists public.bb_candidate_ref_seq
  as bigint
  start with 5001;

create table if not exists public.bb_candidates (
  id                  uuid        not null default gen_random_uuid(),
  cycle_id            uuid        not null,
  first_name          text        not null,
  last_name           text        not null,
  date_of_birth       date        null,
  email_for_results   text        null,
  personal_removed_at timestamptz null,
  location_code       text        not null,
  dan                 smallint    not null,
  cycle_plan_id       uuid        not null,
  kukkiwon            boolean     not null,
  kukkiwon_added_on   date        null,
  source              text        not null,
  reference           text        not null,
  registered_at       timestamptz not null default now(),
  status              text        not null default 'active',
  withdrawn_reason    text        null,
  withdrawn_at        timestamptz null,
  withdrawn_by_name   text        null,
  withdrawn_by        uuid        null,      -- login id; no foreign key on purpose
  duplicate_state     text        not null default 'none',
  duplicate_of        uuid        null,
  version             integer     not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid        null,      -- login id; never readable by the app
  updated_by          uuid        null,      -- login id; never readable by the app
  created_by_name     text        not null,
  updated_by_name     text        not null,

  constraint bb_candidates_pkey primary key (id),
  -- removing a cycle removes its candidates (Delete cycle refuses first
  -- when payments or online-signed waivers exist)
  constraint bb_candidates_cycle_fk foreign key (cycle_id) references public.bb_cycles (id) on delete cascade,
  constraint bb_candidates_first_name_check
    check (coalesce(public.testing_name_is_valid(first_name) and first_name = public.testing_normalize_name(first_name), false)),
  constraint bb_candidates_last_name_check
    check (coalesce(public.testing_name_is_valid(last_name) and last_name = public.testing_normalize_name(last_name), false)),
  constraint bb_candidates_dob_check check (date_of_birth is null or date_of_birth >= date '1900-01-01'),
  constraint bb_candidates_email_check
    check (email_for_results is null or public.bb_email_is_valid(email_for_results)),
  -- DOB and email are both there, OR both were removed by the purge (and when)
  constraint bb_candidates_personal_check
    check ((personal_removed_at is null) = (date_of_birth is not null and email_for_results is not null)),
  constraint bb_candidates_location_fk foreign key (location_code) references public.locations (code),
  constraint bb_candidates_dan_check check (dan between 1 and 4),
  -- "no action": a plan is only ever removed together with its cycle, and
  -- then its candidates go in the same step
  constraint bb_candidates_plan_fk
    foreign key (cycle_id, cycle_plan_id) references public.bb_cycle_plans (cycle_id, id),
  constraint bb_candidates_kukkiwon_check check (kukkiwon = (kukkiwon_added_on is not null)),
  constraint bb_candidates_source_check check (source in ('form', 'desk')),
  constraint bb_candidates_reference_key unique (reference),
  constraint bb_candidates_reference_check check (reference ~ '^BB-[0-9]{4,}$'),
  constraint bb_candidates_status_check
    check ((status = 'active' and num_nonnulls(withdrawn_reason, withdrawn_at, withdrawn_by_name, withdrawn_by) = 0)
           or (status = 'withdrawn' and withdrawn_reason in ('withdrawn', 'duplicate_copy')
               and withdrawn_at is not null and withdrawn_by_name is not null)),
  constraint bb_candidates_duplicate_fk
    foreign key (duplicate_of) references public.bb_candidates (id) on delete set null,
  constraint bb_candidates_duplicate_state_check check (duplicate_state in ('none', 'possible', 'kept_both')),
  constraint bb_candidates_duplicate_self_check check (duplicate_of is distinct from id),
  constraint bb_candidates_version_check check (version >= 1)
);

create index if not exists bb_candidates_cycle_idx     on public.bb_candidates (cycle_id);
create index if not exists bb_candidates_names_idx     on public.bb_candidates (cycle_id, lower(last_name), lower(first_name));
create index if not exists bb_candidates_duplicate_idx on public.bb_candidates (duplicate_of) where duplicate_of is not null;
create index if not exists bb_candidates_plan_idx      on public.bb_candidates (cycle_plan_id);

comment on table public.bb_candidates is
  'Black Belt candidates, one row per person per cycle. date_of_birth and email_for_results are never granted to any client role (read only through bb_candidate_detail) and never logged in plain text.';
comment on column public.bb_candidates.date_of_birth is
  'Never granted to any client role; masked in change_log. Empty only after the purge (personal_removed_at).';


-- ---------------------------------------------------------------------
-- 8. public.bb_candidate_waivers - the signed waiver (v0.213, v0.900,
--    v0.905, v0.906)
--   how 'drawn': signed on the family form - the signer's name, the drawn
--     signature and the browser's submission id (so a retry never makes a
--     second candidate)
--   how 'paper': ticked at the desk ("Waiver signed on paper"; the paper is
--     kept in the testing folder) - who ticked it
--   signed_as_minor: the candidate was under 18 on the cycle's first
--     testing day WHEN this waiver was signed (worked out by the database,
--     never sent by a client)
--   A candidate may have several rows (a later paper re-sign, contract 14
--   OI-2); the newest signed_at is the one shown.
--   NOBODY in the app can read this table (RLS on, no rule, no rights).
--   The purge removes the signature and the signer's name (removed_at says
--   when); the version and the date stay. Its history rows never hold the
--   picture, the signer's name or the submission id (its own log trigger).
-- ---------------------------------------------------------------------
create table if not exists public.bb_candidate_waivers (
  id                uuid        not null default gen_random_uuid(),
  candidate_id      uuid        not null,
  waiver_version_id uuid        not null,
  how               text        not null,
  submission_id     uuid        null,
  acknowledged      boolean     not null,
  signed_as_minor   boolean     not null,
  signer_name       text        null,
  signature         text        null,
  ticked_by_name    text        null,
  signed_at         timestamptz not null,
  removed_at        timestamptz null,
  version           integer     not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid        null,      -- login id; never readable by the app
  updated_by        uuid        null,      -- login id; never readable by the app
  created_by_name   text        not null,
  updated_by_name   text        not null,

  constraint bb_candidate_waivers_pkey primary key (id),
  constraint bb_candidate_waivers_candidate_fk
    foreign key (candidate_id) references public.bb_candidates (id) on delete cascade,
  -- "no action": versions are never removed
  constraint bb_candidate_waivers_version_fk
    foreign key (waiver_version_id) references public.bb_waiver_versions (id),
  constraint bb_candidate_waivers_how_check check (how in ('drawn', 'paper')),
  constraint bb_candidate_waivers_submission_id_key unique (submission_id),
  constraint bb_candidate_waivers_submission_check check ((how = 'drawn') = (submission_id is not null)),
  constraint bb_candidate_waivers_acknowledged_check check (acknowledged),
  constraint bb_candidate_waivers_signer_name_check
    check (signer_name is null
           or coalesce(public.testing_name_is_valid(signer_name) and signer_name = public.testing_normalize_name(signer_name), false)),
  constraint bb_candidate_waivers_signature_check
    check (signature is null or public.testing_signature_is_valid(signature)),
  constraint bb_candidate_waivers_ticked_check check ((how = 'paper') = (ticked_by_name is not null)),
  -- a drawn waiver has its signature and signer, OR both were removed by
  -- the purge (and when)
  constraint bb_candidate_waivers_drawn_check
    check (how <> 'drawn'
           or ((signature is not null and signer_name is not null and removed_at is null)
               or (signature is null and signer_name is null and removed_at is not null))),
  constraint bb_candidate_waivers_paper_check
    check (how <> 'paper' or (signature is null and signer_name is null)),
  constraint bb_candidate_waivers_version_check check (version >= 1)
);

create index if not exists bb_candidate_waivers_candidate_idx on public.bb_candidate_waivers (candidate_id, signed_at);
create index if not exists bb_candidate_waivers_version_idx   on public.bb_candidate_waivers (waiver_version_id);

comment on table public.bb_candidate_waivers is
  'Black Belt signed waivers (drawn on the form or ticked as signed on paper). Never granted to any role; the signature and signer''s name are never copied into change_log and are removed by the purge.';


-- ---------------------------------------------------------------------
-- 9. public.bb_payments - append-only, NEVER removed (v0.210, v0.218-
--    v0.220, v0.900, v0.903, v0.904, S1-S3)
--   kind 'payment':  1 cent to $5,000, cash / check / card, for the items
--                    it pays (for_items, e.g. {p1,kukkiwon})
--   kind 'refund':   its own NEGATIVE row (entered positive, stored
--                    negative), never more than the net paid
--   kind 'reversal': undoes exactly one payment, refund or returned row
--                    (Undo, or the first half of Edit): exactly minus its
--                    amount; a row is undone at most once
--   kind 'returned': a bounced check: minus one live check payment, at
--                    most once per payment. Finance shows it on the day it
--                    was recorded (Finance v0.809), so it is NEVER written
--                    as a reversal.
--   location_code / cycle_name: the school and the cycle's name AT
--     RECORDING TIME (v0.903), so a later school fix or cycle rename never
--     moves old money between schools' daily reports. A correction copies
--     them from the row it corrects.
--   recorded_at = now() = the transaction's start time, so an Edit's two
--     rows carry exactly the same time (Finance's pairing rule).
--   Rows are never changed or removed by anyone (the guard, section 11,
--   with no exception), and every key that points from here is "restrict":
--   a candidate or cycle with a payment row can't be removed.
-- ---------------------------------------------------------------------
create table if not exists public.bb_payments (
  id                  uuid        not null default gen_random_uuid(),
  candidate_id        uuid        not null,
  cycle_id            uuid        not null,
  kind                text        not null,
  amount_cents        integer     not null,
  method              text        not null,
  paid_on             date        not null,
  for_items           text[]      null,
  note                text        null,
  reason              text        null,
  location_code       text        not null,
  cycle_name          text        not null,
  recorded_at         timestamptz not null default now(),
  recorded_by         uuid        null,       -- login id; never readable by the app
  recorded_by_name    text        not null,
  reverses_payment_id uuid        null,

  constraint bb_payments_pkey primary key (id),
  constraint bb_payments_candidate_fk
    foreign key (candidate_id) references public.bb_candidates (id) on delete restrict,
  constraint bb_payments_cycle_fk
    foreign key (cycle_id) references public.bb_cycles (id) on delete restrict,
  constraint bb_payments_location_fk
    foreign key (location_code) references public.locations (code) on delete restrict,
  constraint bb_payments_reverses_fk
    foreign key (reverses_payment_id) references public.bb_payments (id) on delete restrict,
  constraint bb_payments_kind_check
    check ((kind = 'payment' and amount_cents between 1 and 500000 and reverses_payment_id is null
            and for_items is not null and cardinality(for_items) >= 1)
           or (kind = 'refund' and amount_cents between -500000 and -1 and reverses_payment_id is null
               and for_items is null)
           or (kind = 'reversal' and amount_cents between -500000 and 500000 and amount_cents <> 0
               and reverses_payment_id is not null and for_items is null)
           or (kind = 'returned' and amount_cents between -500000 and -1 and method = 'check'
               and reverses_payment_id is not null and for_items is null)),
  constraint bb_payments_method_check check (method in ('cash', 'check', 'card')),
  -- the items a payment is for: p1 ... p12 and kukkiwon, 1 to 13 of them,
  -- a flat list without empty entries (repeats are refused by the guard)
  constraint bb_payments_for_items_check
    check (for_items is null
           or (coalesce(array_ndims(for_items), 0) = 1
               and cardinality(for_items) between 1 and 13
               and array_position(for_items, null) is null
               and for_items <@ array['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12',
                                      'kukkiwon']::text[])),
  constraint bb_payments_note_check
    check (note is null or coalesce(public.testing_note_is_valid(note) and note = public.testing_normalize_note(note), false)),
  constraint bb_payments_reason_check
    check (reason is null or coalesce(public.testing_note_is_valid(reason) and reason = public.testing_normalize_note(reason), false)),
  constraint bb_payments_cycle_name_check
    check (coalesce(public.testing_name_is_valid(cycle_name) and cycle_name = public.testing_normalize_name(cycle_name), false))
);

create index if not exists bb_payments_candidate_idx on public.bb_payments (candidate_id);
create index if not exists bb_payments_cycle_idx     on public.bb_payments (cycle_id);
create index if not exists bb_payments_paid_on_idx   on public.bb_payments (paid_on);
-- a row is undone at most once ...
create unique index if not exists bb_payments_one_reversal_idx
  on public.bb_payments (reverses_payment_id) where kind = 'reversal';
-- ... and a check is marked returned at most once (even if that mark was
-- undone later)
create unique index if not exists bb_payments_one_returned_idx
  on public.bb_payments (reverses_payment_id) where kind = 'returned';

comment on table public.bb_payments is
  'Black Belt payments, refunds, reversals and returned checks: append-only, never removed. Each row keeps the school and cycle name of the moment it was recorded.';


-- ---------------------------------------------------------------------
-- 10. Derived rules: worked out every time, never stored (v0.158). They
--     are the ONLY place these rules live, so every screen, the receipt
--     and the functions always agree. Each date rule takes the date as an
--     argument (p_today / p_now): the functions pass testing_today() /
--     now(), the tests pass made-up dates. Nobody in the app can call them.
-- ---------------------------------------------------------------------

-- 10a. bb_age_on(dob, date) - whole years old on that date. NULL in ->
-- NULL out.
create or replace function public.bb_age_on(p_dob date, p_on date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select extract(year from age(p_on, p_dob))::integer;
$$;

revoke execute on function public.bb_age_on(date, date) from public, anon, authenticated, service_role;

-- 10b. bb_cycle_state(cycle, today) - where a cycle stands (contract 5.1).
-- Answers one object:
--   first_day / last_day / next_day: the first and last testing day, and
--     the first day on or after today (null when none is left)
--   past: today is after the last testing day
--   testing_today: one of its days is today
--   registration: from the switch alone -
--     'open'           switched on, and (auto close off, or today is on or
--                      before Application due)
--     'closed_by_date' switched on, auto close on, today after the date
--     'not_open_yet'   never opened
--     'closed'         closed by hand
--   state: the first that applies of past -> 'past', testing_today ->
--     'testing_today', otherwise the registration value (the screen's tag)
--   public_status / closed_on: what the family form says, from the
--     registration value alone (past first): 'finished', 'open', 'closed'
--     (closed_on = Application due when it closed by the date), 'not_open'.
--     The day tags (testing today, next day) NEVER open the form.
-- An unknown cycle -> NULL.
create or replace function public.bb_cycle_state(p_cycle_id uuid, p_today date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'state',         case when x.past then 'past'
                                 when x.testing_today then 'testing_today'
                                 else x.registration end,
           'registration',  x.registration,
           'past',          x.past,
           'testing_today', x.testing_today,
           'first_day',     x.first_day,
           'last_day',      x.last_day,
           'next_day',      x.next_day,
           'public_status', case when x.past then 'finished'
                                 when x.registration = 'open' then 'open'
                                 when x.registration = 'not_open_yet' then 'not_open'
                                 else 'closed' end,
           'closed_on',     case when not x.past and x.registration = 'closed_by_date' then x.application_due end)
    from (select c.application_due,
                 d.first_day, d.last_day, d.next_day,
                 coalesce(p_today > d.last_day, false) as past,
                 coalesce(d.testing_today, false) as testing_today,
                 case when c.registration_open and (not c.auto_close or p_today <= c.application_due) then 'open'
                      when c.registration_open then 'closed_by_date'
                      when c.first_opened_at is null then 'not_open_yet'
                      else 'closed' end as registration
            from public.bb_cycles c
            cross join lateral (
              select min(y.day_date) as first_day,
                     max(y.day_date) as last_day,
                     min(y.day_date) filter (where y.day_date >= p_today) as next_day,
                     bool_or(y.day_date = p_today) as testing_today
                from public.bb_cycle_days y
               where y.cycle_id = c.id) as d
           where c.id = p_cycle_id) as x;
$$;

revoke execute on function public.bb_cycle_state(uuid, date) from public, anon, authenticated, service_role;

-- 10c. bb_candidate_items(candidate) - what a candidate owes, one row per
-- item (contract 5.2; the ONLY place the schedule rule lives):
--   p1 ... pN   one per payment of the candidate's plan, at the plan's
--               amount for the candidate's Dan
--   kukkiwon    if they chose the certificate, the cycle's fee for the Dan
-- Due dates (S4): pN = the later of the plan's due date and the school day
-- the candidate registered (a late family's passed dates count from the
-- day they registered); kukkiwon = the later of p1's due date and the day
-- it was chosen (added late = due that day, v0.900).
-- Order (sort_no 1, 2, ...): by due date, then p1, kukkiwon, p2, p3 ...
create or replace function public.bb_candidate_items(p_candidate_id uuid)
returns table (item text, label text, due_on date, amount_cents integer, sort_no integer)
language sql
stable
set search_path = ''
as $$
  with c as (
    select x.id, x.cycle_id, x.cycle_plan_id, x.dan, x.kukkiwon, x.kukkiwon_added_on,
           public.testing_school_date(x.registered_at) as registered_on
      from public.bb_candidates x
     where x.id = p_candidate_id
  ),
  pays as (
    select 'p' || pp.payment_no::text as item,
           'Payment ' || pp.payment_no::text as label,
           greatest(pp.due_on, c.registered_on) as due_on,
           a.amount_cents,
           pp.payment_no * 10 as tie
      from c
      join public.bb_cycle_plan_payments pp on pp.cycle_plan_id = c.cycle_plan_id
      join public.bb_cycle_plan_amounts a
        on a.cycle_plan_id = c.cycle_plan_id and a.dan = c.dan and a.payment_no = pp.payment_no
  ),
  kuk as (
    select 'kukkiwon' as item,
           'Kukkiwon certificate' as label,
           greatest((select p.due_on from pays p where p.item = 'p1'), c.kukkiwon_added_on) as due_on,
           f.amount_cents,
           15 as tie   -- between p1 (10) and p2 (20)
      from c
      join public.bb_cycle_kukkiwon_fees f on f.cycle_id = c.cycle_id and f.dan = c.dan
     where c.kukkiwon
  ),
  allx as (
    select * from pays
    union all
    select * from kuk
  )
  select a.item, a.label, a.due_on, a.amount_cents,
         (row_number() over (order by a.due_on, a.tie))::integer as sort_no
    from allx a
   order by a.due_on, a.tie;
$$;

revoke execute on function public.bb_candidate_items(uuid) from public, anon, authenticated, service_role;

-- 10d. bb_candidate_money(candidate, today) - the money picture of one
-- candidate (contract 5.3), used by the roster, the detail, the receipt
-- and every payment answer.
--   Live rows: a payment, refund or returned row that no reversal points
--   at. A live payment with a live "returned" row is a bounced check: it
--   is shown crossed out and NOT counted.
--   Allocation (S1): the live, not-returned payments, oldest first (ties
--   by id). Each one's money goes FIRST to the items it was ticked for (in
--   item order, each up to what that item still owes; an item the current
--   plan no longer has is skipped), THEN to the earliest unpaid items;
--   anything left over is "overpaid". Then the live refunds come off the
--   overpaid amount first, then off the items from the LATEST backwards.
--   total_due = all items; paid = every row added up (bigint); balance =
--   total_due - paid (negative = overpaid, or money owed back after a
--   bounced check); overpaid = paid - total_due when that is above 0.
--   Tag (v0.219, v0.224, v0.900), on p_today:
--     'paid_in_full' - nothing left on any item (+ overpaid_cents)
--     'not_paid'     - an item with money left was due BEFORE today, and
--                      there is no live payment row at all (red)
--     'late'         - the same with some payment: late_cents = what is
--                      left on the overdue items, late_since = the earliest
--                      such date, late_kukkiwon_only = only Kukkiwon is late
--     'next'         - otherwise: next_on = the earliest date with money
--                      left, next_cents = what is left on that date's items
--                      (on the due date itself still 'next', gray)
create or replace function public.bb_candidate_money(p_candidate_id uuid, p_today date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_item   text[];
  v_label  text[];
  v_due    date[];
  v_amount bigint[];
  v_paid   bigint[];
  v_n      integer;
  v_p      record;
  v_left   bigint;
  v_take   bigint;
  v_over   bigint := 0;
  v_refund bigint;
  v_i      integer;
  v_total  bigint := 0;
  v_net    bigint;
  v_any    boolean;
  v_items  jsonb := '[]'::jsonb;
  v_tag    text;
  v_late_c bigint := 0;
  v_late_s date;
  v_kuk_only boolean := true;
  v_next_on  date;
  v_next_c   bigint := 0;
begin
  select coalesce(array_agg(i.item order by i.sort_no), '{}'),
         coalesce(array_agg(i.label order by i.sort_no), '{}'),
         coalesce(array_agg(i.due_on order by i.sort_no), '{}'),
         coalesce(array_agg(i.amount_cents::bigint order by i.sort_no), '{}')
    into v_item, v_label, v_due, v_amount
    from public.bb_candidate_items(p_candidate_id) as i;
  v_n := coalesce(cardinality(v_item), 0);
  v_paid := array_fill(0::bigint, array[greatest(v_n, 1)]);

  -- 1. the live payments that aren't bounced checks, oldest first
  for v_p in
    select p.amount_cents, p.for_items
      from public.bb_payments p
     where p.candidate_id = p_candidate_id
       and p.kind = 'payment'
       and not exists (select 1 from public.bb_payments r where r.reverses_payment_id = p.id and r.kind = 'reversal')
       and not exists (select 1 from public.bb_payments t
                        where t.reverses_payment_id = p.id and t.kind = 'returned'
                          and not exists (select 1 from public.bb_payments u
                                           where u.reverses_payment_id = t.id and u.kind = 'reversal'))
     order by p.recorded_at, p.id
  loop
    v_left := v_p.amount_cents;
    -- first to the ticked items, in item order
    for v_i in 1 .. v_n loop
      exit when v_left <= 0;
      if v_item[v_i] = any (v_p.for_items) then
        v_take := least(v_left, v_amount[v_i] - v_paid[v_i]);
        if v_take > 0 then
          v_paid[v_i] := v_paid[v_i] + v_take;
          v_left := v_left - v_take;
        end if;
      end if;
    end loop;
    -- then to the earliest unpaid items
    for v_i in 1 .. v_n loop
      exit when v_left <= 0;
      v_take := least(v_left, v_amount[v_i] - v_paid[v_i]);
      if v_take > 0 then
        v_paid[v_i] := v_paid[v_i] + v_take;
        v_left := v_left - v_take;
      end if;
    end loop;
    v_over := v_over + greatest(v_left, 0);
  end loop;

  -- 2. the live refunds: off the overpaid amount first, then off the items
  --    from the latest backwards
  select coalesce(sum(-p.amount_cents), 0)::bigint into v_refund
    from public.bb_payments p
   where p.candidate_id = p_candidate_id
     and p.kind = 'refund'
     and not exists (select 1 from public.bb_payments r where r.reverses_payment_id = p.id and r.kind = 'reversal');
  v_take := least(v_refund, v_over);
  v_over := v_over - v_take;
  v_refund := v_refund - v_take;
  for v_i in reverse v_n .. 1 loop
    exit when v_refund <= 0;
    v_take := least(v_refund, v_paid[v_i]);
    v_paid[v_i] := v_paid[v_i] - v_take;
    v_refund := v_refund - v_take;
  end loop;

  -- 3. totals (every row added up, as bigint)
  select coalesce(sum(p.amount_cents), 0)::bigint into v_net
    from public.bb_payments p where p.candidate_id = p_candidate_id;
  select exists (select 1 from public.bb_payments p
                  where p.candidate_id = p_candidate_id and p.kind = 'payment'
                    and not exists (select 1 from public.bb_payments r
                                     where r.reverses_payment_id = p.id and r.kind = 'reversal'))
    into v_any;

  for v_i in 1 .. v_n loop
    v_total := v_total + v_amount[v_i];
    v_items := v_items || jsonb_build_object(
                 'item', v_item[v_i], 'label', v_label[v_i], 'due_on', v_due[v_i],
                 'amount_cents', v_amount[v_i], 'paid_cents', v_paid[v_i],
                 'remaining_cents', v_amount[v_i] - v_paid[v_i]);
    if v_amount[v_i] - v_paid[v_i] > 0 then
      if v_due[v_i] < p_today then
        v_late_c := v_late_c + (v_amount[v_i] - v_paid[v_i]);
        v_late_s := least(coalesce(v_late_s, v_due[v_i]), v_due[v_i]);
        if v_item[v_i] <> 'kukkiwon' then
          v_kuk_only := false;
        end if;
      end if;
      if v_next_on is null or v_due[v_i] < v_next_on then
        v_next_on := v_due[v_i];
      end if;
    end if;
  end loop;

  if v_next_on is null then
    v_tag := 'paid_in_full';
  elsif v_late_s is not null then
    v_tag := case when v_any then 'late' else 'not_paid' end;
  else
    v_tag := 'next';
    for v_i in 1 .. v_n loop
      if v_due[v_i] = v_next_on then
        v_next_c := v_next_c + (v_amount[v_i] - v_paid[v_i]);
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'items',              v_items,
    'total_due_cents',    v_total,
    'paid_cents',         v_net,
    'balance_cents',      v_total - v_net,
    'overpaid_cents',     greatest(v_net - v_total, 0),
    'tag',                v_tag,
    'next_on',            case when v_tag = 'next' then v_next_on end,
    'next_cents',         case when v_tag = 'next' then v_next_c end,
    'late_since',         case when v_tag = 'late' then v_late_s end,
    'late_cents',         case when v_tag = 'late' then v_late_c end,
    'late_kukkiwon_only', case when v_tag = 'late' then v_kuk_only end);
end;
$$;

revoke execute on function public.bb_candidate_money(uuid, date) from public, anon, authenticated, service_role;

-- 10e. bb_purge_due_on(candidate) - the day a candidate's personal data
-- may be removed (v0.906, v0.907): the later of the cycle's (current) last
-- testing day + N1 years and the 18th birthday + N2 years. NULL when
-- either keep-years setting is empty (= never).
create or replace function public.bb_purge_due_on(p_candidate_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select greatest((select max(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id)
                    + make_interval(years => s.keep_years_after_last_day::integer),
                  c.date_of_birth + make_interval(years => 18 + s.keep_years_after_18::integer))::date
    from public.bb_candidates c
    cross join public.bb_settings s
   where c.id = p_candidate_id
     and s.keep_years_after_last_day is not null
     and s.keep_years_after_18 is not null;
$$;

revoke execute on function public.bb_purge_due_on(uuid) from public, anon, authenticated, service_role;

-- 10f. bb_purge_is_due(candidate, today) - true on and after the purge
-- day (10e); false when there is none.
create or replace function public.bb_purge_is_due(p_candidate_id uuid, p_today date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.bb_purge_due_on(p_candidate_id) <= p_today, false);
$$;

revoke execute on function public.bb_purge_is_due(uuid, date) from public, anon, authenticated, service_role;

-- 10g. bb_waiver_version_ok(version, now) - may the family form still
-- sign this waiver version (v0.905)? Yes when it is NOT the placeholder
-- and it is current, or stopped being current less than 24 hours ago (a
-- family who opened the page just before an admin saved a new text).
create or replace function public.bb_waiver_version_ok(p_version_id uuid, p_now timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.bb_waiver_versions v
                  where v.id = p_version_id
                    and not v.is_placeholder
                    and (v.superseded_at is null or v.superseded_at > p_now - interval '24 hours'));
$$;

revoke execute on function public.bb_waiver_version_ok(uuid, timestamptz) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 11. Trigger functions (run automatically on every write), the
--     triggers, and the seed
--     Errors use errcode 23514 (check_violation) with a constraint name
--     saying which rule, so the functions answer "invalid" (or a more
--     precise status) instead of an error.
-- ---------------------------------------------------------------------

-- 11a. bb_before_write(fixed columns, no-bump columns) - BEFORE INSERT OR
-- UPDATE, shared by every Black Belt table with a version (a copy of 0006's
-- star_before_write). The two arguments are comma-separated column lists
-- given in each "create trigger" below.
--   insert: version 1; created/updated stamps = now + who (whatever the
--           writer supplied)
--   update: a change to a FIXED column (argument 1) is refused
--           (constraint <table>_immutable); created_* keep their old
--           values; if anything changed other than the NO-BUMP columns
--           (argument 2) and the bookkeeping columns - or a function wrote
--           version + 1 on purpose - the version goes up by one and "last
--           changed by" is stamped now; otherwise the version and
--           updated_* stay exactly as before.
--   So the purge (DOB, email, signature, signer's name) never bumps a
--   version, and an open dialog doesn't go stale because of it.
create or replace function public.bb_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fixed  text[] := coalesce(string_to_array(nullif(tg_argv[0], ''), ','), '{}');
  v_nobump text[] := coalesce(string_to_array(nullif(tg_argv[1], ''), ','), '{}');
  v_book   text[] := array['version', 'created_at', 'updated_at', 'created_by', 'updated_by',
                           'created_by_name', 'updated_by_name'];
  v_new    jsonb;
  v_old    jsonb;
  v_col    text;
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

  if (v_new - v_nobump - v_book) is distinct from (v_old - v_nobump - v_book)
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

revoke execute on function public.bb_before_write() from public, anon, authenticated, service_role;

-- 11b. bb_waiver_versions_guard() - BEFORE INSERT OR UPDATE OR DELETE on
-- waiver versions:
--   insert: stamps created_at / created_by / created_by_name
--   update: only superseded_at may be set, once (from empty)
--   delete: ALWAYS refused - signed waivers point at their version for good
create or replace function public.bb_waiver_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at      := now();
    new.created_by      := auth.uid();
    new.created_by_name := public.change_log_actor_name();
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'superseded_at') = (to_jsonb(old) - 'superseded_at')
     and old.superseded_at is null and new.superseded_at is not null then
    return new;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = 'bb_waiver_versions_immutable',
    message    = 'a waiver version is never changed or removed (only marked superseded, once)';
end;
$$;

revoke execute on function public.bb_waiver_versions_guard() from public, anon, authenticated, service_role;

-- 11c. bb_starting_point_guard() - BEFORE INSERT OR UPDATE OR DELETE on
-- the starting point:
--   insert: stamps created_at / created_by_name
--   update / delete: refused, EXCEPT in Jeffrey's own SQL Editor session
--     fixing a seeded number: session_user = 'postgres' (the login that
--     connected - the app connects as "authenticator", the form as
--     "bb_registrar") and no action tag (every 0016 function sets one
--     before writing, so none passes). current_user would not do: inside
--     every security-definer function it is "postgres" too.
--   This is a convenience, not a security wall: whoever connects as
--   postgres can also switch triggers off (contract 2.3).
create or replace function public.bb_starting_point_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at      := now();
    new.created_by_name := public.change_log_actor_name();
    return new;
  end if;
  if session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '' then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = 'bb_starting_point_immutable',
    message    = 'the Black Belt starting point is changed only by hand in the SQL Editor';
end;
$$;

revoke execute on function public.bb_starting_point_guard() from public, anon, authenticated, service_role;

-- 11d. bb_cycles_rules() - BEFORE INSERT OR UPDATE on cycles:
--   * a link code may never be used by ANOTHER cycle, in either column
--     (each "unique" rule sees one column only); raised as a unique
--     violation, constraint bb_cycles_public_code_cross_key
--   * the requirements sheet never changes, except in Jeffrey's SQL Editor
--     session (the same rule and caveat as 11c);
--     constraint bb_cycles_requirements_immutable
create or replace function public.bb_cycles_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.bb_cycles c
              where c.id <> new.id
                and (c.public_code_worcester in (new.public_code_worcester, new.public_code_shrewsbury)
                     or c.public_code_shrewsbury in (new.public_code_worcester, new.public_code_shrewsbury))) then
    raise exception using
      errcode    = '23505',
      constraint = 'bb_cycles_public_code_cross_key',
      message    = 'that link code is already used by another Black Belt cycle';
  end if;
  if tg_op = 'UPDATE' and new.requirements is distinct from old.requirements
     and not (session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '') then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_cycles_requirements_immutable',
      message    = 'a cycle''s requirements sheet is changed only by hand in the SQL Editor';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_cycles_rules() from public, anon, authenticated, service_role;

-- 11e. bb_cycle_day_parts_guard() - BEFORE INSERT OR UPDATE on day parts:
-- insert stamps who and when; a row is never changed (only added and
-- removed).
create or replace function public.bb_cycle_day_parts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at      := now();
    new.created_by      := auth.uid();
    new.created_by_name := public.change_log_actor_name();
    return new;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = 'bb_cycle_day_parts_immutable',
    message    = 'a day''s part is only added or removed, never changed';
end;
$$;

revoke execute on function public.bb_cycle_day_parts_guard() from public, anon, authenticated, service_role;

-- 11f. bb_cycle_prices_guard() - BEFORE INSERT OR UPDATE OR DELETE on a
-- cycle's plans, amounts and Kukkiwon fees (v0.902: set when the cycle is
-- saved, never changed afterwards):
--   insert: only inside bb_add_cycle (its action tag); a plan row gets
--           its created_at / created_by_name stamped
--   update: always refused
--   delete: only together with the whole cycle ("on delete cascade" runs
--           it from inside another trigger, so pg_trigger_depth() > 1)
create or replace function public.bb_cycle_prices_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('tkd.action', true), '') <> 'bb_add_cycle' then
      raise exception using
        errcode    = '23514',
        constraint = tg_table_name || '_add_cycle_only',
        message    = 'a cycle''s prices are written only when the cycle is added';
    end if;
    if tg_table_name = 'bb_cycle_plans' then
      -- (jsonb_populate_record fills in just these two columns)
      new := jsonb_populate_record(new, jsonb_build_object('created_at', now(),
                                                           'created_by_name', public.change_log_actor_name()));
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = tg_table_name || '_immutable',
    message    = 'a cycle''s prices never change (they go only with the whole cycle)';
end;
$$;

revoke execute on function public.bb_cycle_prices_guard() from public, anon, authenticated, service_role;

-- 11g. bb_cycle_plan_payments_guard() - BEFORE INSERT OR DELETE on the due
-- dates: a row is added only inside bb_add_cycle and removed only together
-- with the whole cycle (cascade). Changing a date is allowed (Edit cycle;
-- 11a keeps the version).
create or replace function public.bb_cycle_plan_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('tkd.action', true), '') <> 'bb_add_cycle' then
      raise exception using
        errcode    = '23514',
        constraint = 'bb_cycle_plan_payments_add_cycle_only',
        message    = 'a plan''s due dates are added only when the cycle is added';
    end if;
    return new;
  end if;
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = 'bb_cycle_plan_payments_immutable',
    message    = 'a plan''s due dates go only with the whole cycle';
end;
$$;

revoke execute on function public.bb_cycle_plan_payments_guard() from public, anon, authenticated, service_role;

-- 11h. bb_candidates_rules() - BEFORE INSERT OR UPDATE on candidates
-- (defence in depth: the functions check the same things first)
--   * duplicate_of must be a candidate of the SAME cycle
--     (bb_candidates_duplicate_cycle)
--   * once the purge removed the DOB and email, they can never come back
--     and the removal time can't change (bb_candidates_personal_removed)
create or replace function public.bb_candidates_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.duplicate_of is not null
     and not exists (select 1 from public.bb_candidates m
                      where m.id = new.duplicate_of and m.cycle_id = new.cycle_id) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_duplicate_cycle',
      message    = 'a possible duplicate must be in the same cycle';
  end if;
  if tg_op = 'UPDATE' and old.personal_removed_at is not null
     and (new.personal_removed_at is distinct from old.personal_removed_at
          or new.date_of_birth is not null or new.email_for_results is not null) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_personal_removed',
      message    = 'a removed date of birth or email can''t come back';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_candidates_rules() from public, anon, authenticated, service_role;

-- 11i. bb_candidates_log() - AFTER INSERT OR UPDATE OR DELETE on
-- candidates: the same history row as 0003's change_log_write, EXCEPT the
-- date of birth and the email are MASKED (v0.907), because the history is
-- kept forever and the purge must really remove them:
--   insert -> after "on file" (or null)
--   delete -> before "on file" (or null if already purged)
--   update -> when the real value changed: before "on file" (or null),
--             after "changed" (or null when the purge removed it);
--             unchanged -> the two keys are left out
-- Every other column is logged in full; the row is filed under the
-- candidate's school. An update that changed nothing writes no row.
-- security definer so it can write to change_log (as 0005's
-- testing_registrations_log).
create or replace function public.bb_candidates_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text[] := array['date_of_birth', 'email_for_results'];
  v_old    jsonb;
  v_new    jsonb;
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
  v_col    text;
begin
  if tg_op = 'INSERT' then
    v_new   := to_jsonb(new);
    v_after := (v_new - v_secret)
               || jsonb_build_object('date_of_birth', case when new.date_of_birth is null then null else 'on file' end,
                                     'email_for_results', case when new.email_for_results is null then null else 'on file' end);
    v_row   := v_new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    -- every other column: only the ones whose value changed, in full
    select jsonb_object_agg(o.key, o.value) into v_before
      from jsonb_each(v_old - v_secret) as o(key, value)
     where o.value is distinct from v_new -> o.key;
    select jsonb_object_agg(n.key, n.value) into v_after
      from jsonb_each(v_new - v_secret) as n(key, value)
     where n.value is distinct from v_old -> n.key;
    -- the two secrets: masked, and only when they changed
    foreach v_col in array v_secret loop
      if v_old -> v_col is distinct from v_new -> v_col then
        v_before := coalesce(v_before, '{}'::jsonb)
                    || jsonb_build_object(v_col, case when jsonb_typeof(v_old -> v_col) = 'null' then null else 'on file' end);
        v_after  := coalesce(v_after, '{}'::jsonb)
                    || jsonb_build_object(v_col, case when jsonb_typeof(v_new -> v_col) = 'null' then null else 'changed' end);
      end if;
    end loop;
    if v_before is null and v_after is null then
      return null;
    end if;
    v_row := v_new;
  else
    v_old    := to_jsonb(old);
    v_before := (v_old - v_secret)
                || jsonb_build_object('date_of_birth', case when old.date_of_birth is null then null else 'on file' end,
                                      'email_for_results', case when old.email_for_results is null then null else 'on file' end);
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
     v_row ->> 'location_code',
     lower(tg_op),
     v_before,
     v_after);
  return null;
end;
$$;

revoke execute on function public.bb_candidates_log() from public, anon, authenticated, service_role;

-- 11j. bb_candidate_waivers_rules() - BEFORE UPDATE OR DELETE on signed
-- waivers:
--   update: only the signature, the signer's name and removed_at may
--           change, and only to empty / once (the purge). (Every other
--           column is fixed by 11a.)
--   delete: only together with the candidate (Delete permanently or Delete
--           cycle: "on delete cascade" runs it from inside another
--           trigger, so pg_trigger_depth() > 1)
create or replace function public.bb_candidate_waivers_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidate_waivers_immutable',
      message    = 'a signed waiver goes only together with its candidate';
  end if;
  if (new.signature is distinct from old.signature and new.signature is not null)
     or (new.signer_name is distinct from old.signer_name and new.signer_name is not null)
     or (new.removed_at is distinct from old.removed_at and old.removed_at is not null) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidate_waivers_immutable',
      message    = 'a signature and the signer''s name can only be removed, once';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_candidate_waivers_rules() from public, anon, authenticated, service_role;

-- 11k. bb_candidate_waivers_log() - AFTER INSERT OR UPDATE OR DELETE on
-- signed waivers: the same history row as 0003's change_log_write, EXCEPT
--   * the signature and the signer's name are never copied: they show as
--     "on file" or null in every before and after (so Delete permanently
--     and a cycle removal log the removed row masked too);
--   * submission_id is left out.
-- An update that changed nothing visible after that writes no row (so the
-- purge shows only "on file" -> null and the removal time).
-- security definer so it can write to change_log (as 0006's
-- star_candidate_signatures_log).
create or replace function public.bb_candidate_waivers_log()
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
             || jsonb_build_object('signature', case when old.signature is null then null else 'on file' end,
                                   'signer_name', case when old.signer_name is null then null else 'on file' end);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := (to_jsonb(new) - 'submission_id')
             || jsonb_build_object('signature', case when new.signature is null then null else 'on file' end,
                                   'signer_name', case when new.signer_name is null then null else 'on file' end);
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

revoke execute on function public.bb_candidate_waivers_log() from public, anon, authenticated, service_role;

-- 11l. bb_payments_guard() - keeps payments append-only, with NO exception
-- (v0.904)
--   BEFORE INSERT:
--     * the row's cycle is its candidate's cycle (bb_payments_cycle_check)
--     * no item twice in for_items (bb_payments_for_items_check)
--     * a reversal undoes one payment, refund or returned row of the SAME
--       candidate, for exactly minus its amount, with the same school and
--       cycle name (bb_payments_reversal_check); a reversal can't be
--       undone; a payment that has a live returned row can't be undone
--       (undo the returned mark first: bb_payments_reversal_returned_check)
--     * a returned row marks one LIVE check payment of the same candidate,
--       for exactly minus its amount, with the same school and cycle name
--       (bb_payments_returned_check)
--     * net floor (bb_payments_net_check): a row that LOWERS the
--       candidate's net total below zero is refused - except a returned
--       row (a check bouncing after a refund, S2). A row that raises the
--       net is always allowed, even while the net is below zero.
--       The calling function already holds the candidate lock, so nothing
--       extra is locked here.
--   BEFORE UPDATE and BEFORE DELETE: always refused - no cascade, no
--     action tag, nothing. (Every key pointing from bb_payments is
--     "restrict", so a candidate or cycle with payments can't be removed.)
-- Limit (as 0005 / 0006): the database owner could switch this trigger off
-- on purpose; it stops mistakes and the app, not a deliberate owner.
create or replace function public.bb_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_target public.bb_payments;
  v_net    bigint;
begin
  if tg_op <> 'INSERT' then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_payments_append_only',
      message    = 'bb_payments is append-only: rows are never changed or removed (use a reversal)';
  end if;

  if not exists (select 1 from public.bb_candidates c where c.id = new.candidate_id and c.cycle_id = new.cycle_id) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_payments_cycle_check',
      message    = 'a payment''s cycle must be its candidate''s cycle';
  end if;

  if new.for_items is not null
     and (select count(distinct x) from unnest(new.for_items) as x) <> cardinality(new.for_items) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_payments_for_items_check',
      message    = 'an item can be ticked only once';
  end if;

  if new.kind = 'reversal' then
    select * into v_target from public.bb_payments p where p.id = new.reverses_payment_id;
    if not found
       or v_target.kind not in ('payment', 'refund', 'returned')
       or v_target.candidate_id <> new.candidate_id
       or new.amount_cents <> -v_target.amount_cents
       or new.method <> v_target.method          -- an undo keeps the same cash / check / card (Finance's totals)
       or new.location_code <> v_target.location_code
       or new.cycle_name <> v_target.cycle_name then
      raise exception using
        errcode    = '23514',
        constraint = 'bb_payments_reversal_check',
        message    = 'a reversal must undo one payment, refund or returned row of the same candidate, for exactly minus its amount';
    end if;
    if v_target.kind = 'payment'
       and exists (select 1 from public.bb_payments t
                    where t.reverses_payment_id = v_target.id and t.kind = 'returned'
                      and not exists (select 1 from public.bb_payments u
                                       where u.reverses_payment_id = t.id and u.kind = 'reversal')) then
      raise exception using
        errcode    = '23514',
        constraint = 'bb_payments_reversal_returned_check',
        message    = 'undo the returned-check mark before undoing the payment';
    end if;
  elsif new.kind = 'returned' then
    select * into v_target from public.bb_payments p where p.id = new.reverses_payment_id;
    if not found
       or v_target.kind <> 'payment'
       or v_target.method <> 'check'
       or new.method <> 'check'
       or new.paid_on <> public.testing_today()  -- dated the day it is marked (Finance v0.809)
       or v_target.candidate_id <> new.candidate_id
       or new.amount_cents <> -v_target.amount_cents
       or new.location_code <> v_target.location_code
       or new.cycle_name <> v_target.cycle_name
       or exists (select 1 from public.bb_payments r where r.reverses_payment_id = v_target.id and r.kind = 'reversal') then
      raise exception using
        errcode    = '23514',
        constraint = 'bb_payments_returned_check',
        message    = 'a returned row marks one live check payment of the same candidate, for exactly minus its amount';
    end if;
  end if;

  select coalesce(sum(p.amount_cents), 0)::bigint into v_net
    from public.bb_payments p where p.candidate_id = new.candidate_id;
  if new.amount_cents < 0 and v_net + new.amount_cents < 0 and new.kind <> 'returned' then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_payments_net_check',
      message    = 'this row would take the candidate''s payments below zero';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_payments_guard() from public, anon, authenticated, service_role;

-- 11m. Attach the triggers ("drop trigger if exists" + create = replace).
-- PostgreSQL runs BEFORE triggers of one table in name order, so
-- <table>_before_write always runs before <table>_guard / <table>_rules.

drop trigger if exists bb_settings_before_write on public.bb_settings;
create trigger bb_settings_before_write
  before insert or update on public.bb_settings
  for each row execute function public.bb_before_write('id,singleton', '');

drop trigger if exists bb_waiver_versions_guard on public.bb_waiver_versions;
create trigger bb_waiver_versions_guard
  before insert or update or delete on public.bb_waiver_versions
  for each row execute function public.bb_waiver_versions_guard();

drop trigger if exists bb_starting_point_guard on public.bb_starting_point;
create trigger bb_starting_point_guard
  before insert or update or delete on public.bb_starting_point
  for each row execute function public.bb_starting_point_guard();

drop trigger if exists bb_cycles_before_write on public.bb_cycles;
create trigger bb_cycles_before_write
  before insert or update on public.bb_cycles
  for each row execute function public.bb_before_write('id,public_code_worcester,public_code_shrewsbury,prices_from', '');

drop trigger if exists bb_cycles_rules on public.bb_cycles;
create trigger bb_cycles_rules
  before insert or update on public.bb_cycles
  for each row execute function public.bb_cycles_rules();

drop trigger if exists bb_cycle_days_before_write on public.bb_cycle_days;
create trigger bb_cycle_days_before_write
  before insert or update on public.bb_cycle_days
  for each row execute function public.bb_before_write('id,cycle_id', '');

drop trigger if exists bb_cycle_day_parts_guard on public.bb_cycle_day_parts;
create trigger bb_cycle_day_parts_guard
  before insert or update on public.bb_cycle_day_parts
  for each row execute function public.bb_cycle_day_parts_guard();

drop trigger if exists bb_cycle_plans_guard on public.bb_cycle_plans;
create trigger bb_cycle_plans_guard
  before insert or update or delete on public.bb_cycle_plans
  for each row execute function public.bb_cycle_prices_guard();

drop trigger if exists bb_cycle_plan_amounts_guard on public.bb_cycle_plan_amounts;
create trigger bb_cycle_plan_amounts_guard
  before insert or update or delete on public.bb_cycle_plan_amounts
  for each row execute function public.bb_cycle_prices_guard();

drop trigger if exists bb_cycle_kukkiwon_fees_guard on public.bb_cycle_kukkiwon_fees;
create trigger bb_cycle_kukkiwon_fees_guard
  before insert or update or delete on public.bb_cycle_kukkiwon_fees
  for each row execute function public.bb_cycle_prices_guard();

drop trigger if exists bb_cycle_plan_payments_before_write on public.bb_cycle_plan_payments;
create trigger bb_cycle_plan_payments_before_write
  before insert or update on public.bb_cycle_plan_payments
  for each row execute function public.bb_before_write('id,cycle_plan_id,payment_no', '');

drop trigger if exists bb_cycle_plan_payments_guard on public.bb_cycle_plan_payments;
create trigger bb_cycle_plan_payments_guard
  before insert or delete on public.bb_cycle_plan_payments
  for each row execute function public.bb_cycle_plan_payments_guard();

drop trigger if exists bb_candidates_before_write on public.bb_candidates;
create trigger bb_candidates_before_write
  before insert or update on public.bb_candidates
  for each row execute function public.bb_before_write(
    'id,cycle_id,source,reference,registered_at',
    'date_of_birth,email_for_results,personal_removed_at');

drop trigger if exists bb_candidates_rules on public.bb_candidates;
create trigger bb_candidates_rules
  before insert or update on public.bb_candidates
  for each row execute function public.bb_candidates_rules();

drop trigger if exists bb_candidate_waivers_before_write on public.bb_candidate_waivers;
create trigger bb_candidate_waivers_before_write
  before insert or update on public.bb_candidate_waivers
  for each row execute function public.bb_before_write(
    'id,candidate_id,waiver_version_id,how,submission_id,acknowledged,signed_as_minor,ticked_by_name,signed_at',
    'signature,signer_name,removed_at');

drop trigger if exists bb_candidate_waivers_rules on public.bb_candidate_waivers;
create trigger bb_candidate_waivers_rules
  before update or delete on public.bb_candidate_waivers
  for each row execute function public.bb_candidate_waivers_rules();

drop trigger if exists bb_payments_guard on public.bb_payments;
create trigger bb_payments_guard
  before insert or update or delete on public.bb_payments
  for each row execute function public.bb_payments_guard();

-- History: 0003's change_log_write on every table, EXCEPT candidates and
-- signed waivers, which have their own masking versions (11i, 11k), so no
-- operation ever writes a DOB, an email, a signature or a signer's name to
-- change_log in plain text.
drop trigger if exists bb_settings_log on public.bb_settings;
create trigger bb_settings_log
  after insert or update or delete on public.bb_settings
  for each row execute function public.change_log_write();

drop trigger if exists bb_waiver_versions_log on public.bb_waiver_versions;
create trigger bb_waiver_versions_log
  after insert or update or delete on public.bb_waiver_versions
  for each row execute function public.change_log_write();

drop trigger if exists bb_starting_point_log on public.bb_starting_point;
create trigger bb_starting_point_log
  after insert or update or delete on public.bb_starting_point
  for each row execute function public.change_log_write();

drop trigger if exists bb_cycles_log on public.bb_cycles;
create trigger bb_cycles_log
  after insert or update or delete on public.bb_cycles
  for each row execute function public.change_log_write();

drop trigger if exists bb_cycle_days_log on public.bb_cycle_days;
create trigger bb_cycle_days_log
  after insert or update or delete on public.bb_cycle_days
  for each row execute function public.change_log_write();

drop trigger if exists bb_cycle_day_parts_log on public.bb_cycle_day_parts;
create trigger bb_cycle_day_parts_log
  after insert or update or delete on public.bb_cycle_day_parts
  for each row execute function public.change_log_write();

drop trigger if exists bb_cycle_plans_log on public.bb_cycle_plans;
create trigger bb_cycle_plans_log
  after insert or update or delete on public.bb_cycle_plans
  for each row execute function public.change_log_write();

drop trigger if exists bb_cycle_plan_amounts_log on public.bb_cycle_plan_amounts;
create trigger bb_cycle_plan_amounts_log
  after insert or update or delete on public.bb_cycle_plan_amounts
  for each row execute function public.change_log_write();

drop trigger if exists bb_cycle_kukkiwon_fees_log on public.bb_cycle_kukkiwon_fees;
create trigger bb_cycle_kukkiwon_fees_log
  after insert or update or delete on public.bb_cycle_kukkiwon_fees
  for each row execute function public.change_log_write();

drop trigger if exists bb_cycle_plan_payments_log on public.bb_cycle_plan_payments;
create trigger bb_cycle_plan_payments_log
  after insert or update or delete on public.bb_cycle_plan_payments
  for each row execute function public.change_log_write();

drop trigger if exists bb_candidates_log on public.bb_candidates;
create trigger bb_candidates_log
  after insert or update or delete on public.bb_candidates
  for each row execute function public.bb_candidates_log();

drop trigger if exists bb_candidate_waivers_log on public.bb_candidate_waivers;
create trigger bb_candidate_waivers_log
  after insert or update or delete on public.bb_candidate_waivers
  for each row execute function public.bb_candidate_waivers_log();

drop trigger if exists bb_payments_log on public.bb_payments;
create trigger bb_payments_log
  after insert or update or delete on public.bb_payments
  for each row execute function public.change_log_write();

-- No "empty the whole table" shortcut on any Black Belt table (it would
-- skip the history and the guards), as 0003 / 0005 / 0006.
drop trigger if exists bb_settings_no_truncate on public.bb_settings;
create trigger bb_settings_no_truncate
  before truncate on public.bb_settings
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_waiver_versions_no_truncate on public.bb_waiver_versions;
create trigger bb_waiver_versions_no_truncate
  before truncate on public.bb_waiver_versions
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_starting_point_no_truncate on public.bb_starting_point;
create trigger bb_starting_point_no_truncate
  before truncate on public.bb_starting_point
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_cycles_no_truncate on public.bb_cycles;
create trigger bb_cycles_no_truncate
  before truncate on public.bb_cycles
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_cycle_days_no_truncate on public.bb_cycle_days;
create trigger bb_cycle_days_no_truncate
  before truncate on public.bb_cycle_days
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_cycle_day_parts_no_truncate on public.bb_cycle_day_parts;
create trigger bb_cycle_day_parts_no_truncate
  before truncate on public.bb_cycle_day_parts
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_cycle_plans_no_truncate on public.bb_cycle_plans;
create trigger bb_cycle_plans_no_truncate
  before truncate on public.bb_cycle_plans
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_cycle_plan_amounts_no_truncate on public.bb_cycle_plan_amounts;
create trigger bb_cycle_plan_amounts_no_truncate
  before truncate on public.bb_cycle_plan_amounts
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_cycle_kukkiwon_fees_no_truncate on public.bb_cycle_kukkiwon_fees;
create trigger bb_cycle_kukkiwon_fees_no_truncate
  before truncate on public.bb_cycle_kukkiwon_fees
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_cycle_plan_payments_no_truncate on public.bb_cycle_plan_payments;
create trigger bb_cycle_plan_payments_no_truncate
  before truncate on public.bb_cycle_plan_payments
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_candidates_no_truncate on public.bb_candidates;
create trigger bb_candidates_no_truncate
  before truncate on public.bb_candidates
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_candidate_waivers_no_truncate on public.bb_candidate_waivers;
create trigger bb_candidate_waivers_no_truncate
  before truncate on public.bb_candidate_waivers
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_payments_no_truncate on public.bb_payments;
create trigger bb_payments_no_truncate
  before truncate on public.bb_payments
  for each statement execute function public.testing_refuse_truncate();

-- 11n. The seed (contract section 3): the settings row (both keep-years
-- empty = nothing is purged until the insurer's numbers are entered), the
-- PLACEHOLDER waiver (registration can't open while it is current) and
-- the Fall 2026 starting point. Written as the SQL Editor's role, tagged
-- 'bb_seed', by "Database admin". It NEVER overwrites: "on conflict do
-- nothing" for the one-row tables, and the waiver only while the table is
-- empty. No cycles, candidates or payments: Fall 2026 is NOT a cycle (Past
-- starts empty, v0.900). The plain-English list of every seeded number is
-- supabase/tests/0016_seed_review.txt (for Jeffrey's CP1 check).
-- The starting point's dates are in the past on purpose: Add cycle shows
-- them and refuses Save until this season's dates are typed.
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'Database admin', true);
select set_config('tkd.action', 'bb_seed', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);

insert into public.bb_settings (keep_years_after_last_day, keep_years_after_18, created_by_name, updated_by_name)
values (null, null, '', '')
on conflict (singleton) do nothing;

insert into public.bb_waiver_versions (version_name, body, is_placeholder, created_by_name)
select '2026-1', $bbwaiver$PLACEHOLDER — replace with the school's waiver before opening registration.

Black Belt testing agreement (the points of the old registration page, kept here only until the school's own waiver text is saved on Rubric and prices):

1. Every subject must be passed. A subject that is not passed is made up at a later testing.
2. Testing fees are non-refundable. If the candidate does not pass, the fees are applied to the next test.
3. I understand that Taekwondo training and testing are physical activities that carry a risk of injury, and I accept that risk.
4. I release Jae H. Jeong's U.S. Taekwondo Center, its owners, instructors and staff from claims for injuries that happen during training or testing.

By signing below I agree to the above.$bbwaiver$, true, ''
 where not exists (select 1 from public.bb_waiver_versions);

-- schedule = an Add cycle payload without the name (contract 6.2):
-- days, deadlines, plans with their payments' due dates and amounts in
-- cents per Dan ("1" ... "4"), Kukkiwon fees in cents per Dan.
-- requirements = the Fall 2026 requirements sheet (old Sheet sections
-- 1.5-1.10 and 3.2-3.5): parts, subjects, credits, cut-offs per age group,
-- points per grade, pass marks, extra points ("to_confirm": still to
-- confirm with Master Jeong) and what is handed in.
insert into public.bb_starting_point (schedule, requirements, created_by_name)
values ($bbjson$
{"application_due": "2026-09-19", "submissions_due": "2026-11-14", "auto_close": true,
 "days": [
   {"name": "Physical", "day_date": "2026-09-26", "start_time": "12:30", "end_time": "14:30", "place": {"code": "worcester"}, "second": {"start": "14:30", "end": "15:30", "place": {"other": "Horgan Arena, 403 Oxford St N, Auburn MA 01501"}}, "parts": ["physical"]},
   {"name": "Technical", "day_date": "2026-10-24", "start_time": "12:30", "end_time": "15:30", "place": {"code": "shrewsbury"}, "second": null, "parts": ["technical"]},
   {"name": "Curriculum", "day_date": "2026-11-21", "start_time": "14:00", "end_time": "17:00", "place": {"code": "shrewsbury"}, "second": null, "parts": ["curriculum"]}
 ],
 "plans": [
   {"name": "In full", "payments": [{"due_on": "2026-09-19", "follows_application_due": true}], "amounts": {"1": [87000], "2": [99000], "3": [150000], "4": [270000]}},
   {"name": "3 payments", "payments": [{"due_on": "2026-09-19", "follows_application_due": true}, {"due_on": "2026-10-17", "follows_application_due": false}, {"due_on": "2026-11-14", "follows_application_due": false}], "amounts": {"1": [29000, 29000, 29000], "2": [33000, 33000, 33000], "3": [50000, 50000, 50000], "4": [90000, 90000, 90000]}}
 ],
 "kukkiwon": {"1": 10000, "2": 11000, "3": 14000, "4": 17000}}
$bbjson$::jsonb,
$bbjson$
{"schema_version": 1, "source": "Fall 2026 (old Sheet)",
 "grade_scales": {"physical": {"A+": 4, "A": 3.5, "B+": 3, "B": 2.5, "C": 2, "D": 0}, "technical": {"A+": 4, "A": 3.5, "A-": 3.25, "B+": 3, "B": 2.5, "B-": 2.25, "C": 2, "C-": 1, "D": 0}, "curriculum": {"A+": 4.5, "A": 4, "A-": 3.8, "B+": 3.5, "B": 3.3, "B-": 3, "C": 2.5, "C-": 2, "D": 0}},
 "dans": [
  {"dan": 1,
   "pass_rule": {"points": 275, "points_adult": 293, "no_d": true, "makeup": "A subject graded D is made up at the next testing, even if the total passes."},
   "parts": [
    {"code": "physical", "name": "Physical", "max_points": 80, "subjects": [
      {"name": "Stretching", "credits": 3, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 4}, {"grade": "A", "value": 3.5}, {"grade": "B+", "value": 3}, {"grade": "B", "value": 2.5}, {"grade": "C", "value": 2}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 6}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 4}, {"grade": "B", "value": 3}, {"grade": "C", "value": 2}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 6}, {"grade": "B+", "value": 5}, {"grade": "B", "value": 4}, {"grade": "C", "value": 2}]}], "points": {"A+": 12, "A": 10.5, "B+": 9, "B": 7.5, "C": 6, "D": 0}}},
      {"name": "Sit-up (20 sec)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "count", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 16}, {"grade": "B+", "value": 11}, {"grade": "B", "value": 6}, {"grade": "C", "value": 4}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 20}, {"grade": "A", "value": 18}, {"grade": "B+", "value": 15}, {"grade": "B", "value": 10}, {"grade": "C", "value": 4}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 23}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 18}, {"grade": "B", "value": 15}, {"grade": "C", "value": 6}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Push-up (1 min)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "count", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 20}, {"grade": "A", "value": 18}, {"grade": "B+", "value": 16}, {"grade": "B", "value": 14}, {"grade": "C", "value": 12}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 36}, {"grade": "A", "value": 30}, {"grade": "B+", "value": 25}, {"grade": "B", "value": 20}, {"grade": "C", "value": 15}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 50}, {"grade": "A", "value": 40}, {"grade": "B+", "value": 30}, {"grade": "B", "value": 25}, {"grade": "C", "value": 20}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Static jump", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 12}, {"grade": "A", "value": 10}, {"grade": "B+", "value": 9}, {"grade": "B", "value": 7}, {"grade": "C", "value": 3}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 15}, {"grade": "B+", "value": 13}, {"grade": "B", "value": 10}, {"grade": "C", "value": 5}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 23}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 18}, {"grade": "B", "value": 15}, {"grade": "C", "value": 10}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Long jump", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches (feet x 12 + inches)", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 72}, {"grade": "A", "value": 60}, {"grade": "B+", "value": 54}, {"grade": "B", "value": 48}, {"grade": "C", "value": 36}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 84}, {"grade": "A", "value": 72}, {"grade": "B+", "value": 66}, {"grade": "B", "value": 60}, {"grade": "C", "value": 48}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 96}, {"grade": "A", "value": 84}, {"grade": "B+", "value": 78}, {"grade": "B", "value": 72}, {"grade": "C", "value": 60}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Sprint 4x10 m", "credits": 2, "scoring": {"kind": "table", "direction": "at_most", "unit": "seconds", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 10}, {"grade": "A", "value": 12}, {"grade": "B+", "value": 13}, {"grade": "B", "value": 14}, {"grade": "C", "value": 16}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 9}, {"grade": "A", "value": 11}, {"grade": "B+", "value": 12}, {"grade": "B", "value": 13}, {"grade": "C", "value": 15}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 10}, {"grade": "B+", "value": 11}, {"grade": "B", "value": 12}, {"grade": "C", "value": 14}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Pull-up or hold", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "reps, or seconds for the hold", "groups": [{"ages": {"min": null, "max": null, "label": "Hold, all ages (seconds)"}, "method": "hold", "cutoffs": [{"grade": "A+", "value": 31}, {"grade": "A", "value": 26}, {"grade": "B+", "value": 21}, {"grade": "B", "value": 11}, {"grade": "C", "value": 9}]}, {"ages": {"min": null, "max": 12, "label": "Reps, 12 and under"}, "method": "reps", "cutoffs": [{"grade": "A+", "value": 6}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 3}, {"grade": "B", "value": 2}, {"grade": "C", "value": 1}]}, {"ages": {"min": 13, "max": null, "label": "Reps, 13 and over"}, "method": "reps", "cutoffs": [{"grade": "A+", "value": 10}, {"grade": "A", "value": 8}, {"grade": "B+", "value": 6}, {"grade": "B", "value": 4}, {"grade": "C", "value": 2}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}, "outdoor": true},
      {"name": "Sprint 100 m", "credits": 2, "scoring": {"kind": "table", "direction": "under", "unit": "seconds", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 22}, {"grade": "B", "value": 24}, {"grade": "C", "value": 28}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 15}, {"grade": "A", "value": 17}, {"grade": "B+", "value": 19}, {"grade": "B", "value": 21}, {"grade": "C", "value": 24}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 14}, {"grade": "A", "value": 15}, {"grade": "B+", "value": 16}, {"grade": "B", "value": 17}, {"grade": "C", "value": 23}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}, "outdoor": true},
      {"name": "1/2 or 1 mile", "credits": 3, "scoring": {"kind": "table", "direction": "at_most", "unit": "minutes", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 5}, {"grade": "A", "value": 6}, {"grade": "B+", "value": 6.5}, {"grade": "B", "value": 7}, {"grade": "C", "value": 8}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 4}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 5.5}, {"grade": "B", "value": 6}, {"grade": "C", "value": 7}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 8.5}, {"grade": "B+", "value": 9}, {"grade": "B", "value": 11}, {"grade": "C", "value": 12}]}], "points": {"A+": 12, "A": 10.5, "B+": 9, "B": 7.5, "C": 6, "D": 0}, "note": "1/2 mile for 12 and under, 1 mile for 13 and over"}, "outdoor": true}
    ]},
    {"code": "technical", "name": "Technical", "max_points": 44, "subjects": [
      {"name": "Referee seminar", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}},
      {"name": "Free sparring", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 12, "A": 10.5, "A-": 9.75, "B+": 9, "B": 7.5, "B-": 6.75, "C": 6, "C-": 3, "D": 0}}},
      {"name": "Target kick (30 sec)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "kicks in 30 seconds", "groups": [{"ages": {"min": null, "max": 9, "label": "9 and under"}, "cutoffs": [{"grade": "A+", "value": 35}, {"grade": "A", "value": 31}, {"grade": "B+", "value": 26}, {"grade": "B", "value": 22}, {"grade": "C", "value": 21}]}, {"ages": {"min": 10, "max": null, "label": "10 and over"}, "cutoffs": [{"grade": "A+", "value": 39}, {"grade": "A", "value": 34}, {"grade": "B+", "value": 29}, {"grade": "B", "value": 24}, {"grade": "C", "value": 23}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Korean terminology", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}},
      {"name": "TKD knowledge", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}}
    ]},
    {"code": "curriculum", "name": "Curriculum", "max_points": 135, "max_points_adult": 157.5, "subjects": [
      {"name": "Basic 10 Motions (1-7)", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 22.5, "A": 20, "A-": 19, "B+": 17.5, "B": 16.5, "B-": 15, "C": 12.5, "C-": 10, "D": 0}}},
      {"name": "Tae-Geuk Poomsae (1-8)", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 22.5, "A": 20, "A-": 19, "B+": 17.5, "B": 16.5, "B-": 15, "C": 12.5, "C-": 10, "D": 0}}},
      {"name": "Sa Bang Chuck (1-13)", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 22.5, "A": 20, "A-": 19, "B+": 17.5, "B": 16.5, "B-": 15, "C": 12.5, "C-": 10, "D": 0}}},
      {"name": "One Step Sparring (1-24)", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 22.5, "A": 20, "A-": 19, "B+": 17.5, "B": 16.5, "B-": 15, "C": 12.5, "C-": 10, "D": 0}}, "adults_only": true},
      {"name": "Technical Break", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 22.5, "A": 20, "A-": 19, "B+": 17.5, "B": 16.5, "B-": 15, "C": 12.5, "C-": 10, "D": 0}}},
      {"name": "Power Break", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 22.5, "A": 20, "A-": 19, "B+": 17.5, "B": 16.5, "B-": 15, "C": 12.5, "C-": 10, "D": 0}}},
      {"name": "Self-Defense", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 22.5, "A": 20, "A-": 19, "B+": 17.5, "B": 16.5, "B-": 15, "C": 12.5, "C-": 10, "D": 0}}}
    ]},
    {"code": "other", "name": "Other requirements", "max_points": 80, "subjects": [
      {"name": "Egg test", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 20, "A": 17.5, "A-": 16.25, "B+": 15, "B": 11, "B-": 10.5, "C": 10, "C-": 5, "D": 0}}, "hand_in": true},
      {"name": "Meditation", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}, "hand_in": true},
      {"name": "Assistant instructor course", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 20, "A": 17.5, "A-": 16.25, "B+": 15, "B": 11, "B-": 10.5, "C": 10, "C-": 5, "D": 0}}, "hand_in": false},
      {"name": "Appreciation letter", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}, "hand_in": true},
      {"name": "TKD project", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}, "hand_in": true}
    ]}
   ],
   "extra_points": {"to_confirm": true, "counts_toward_total": true, "limit": null, "items": [{"name": "Extra stripes", "rule": {"kind": "per_count", "points_each": 1}}, {"name": "Outstanding performance", "rule": {"kind": "steps", "steps": [{"at_least": 5, "points": 5}]}}, {"name": "Competitions", "rule": {"kind": "steps", "steps": [{"at_least": 1, "points": 3}, {"at_least": 2, "points": 5}, {"at_least": 3, "points": 7}, {"at_least": 4, "points": 10}, {"at_least": 5, "points": 15}]}}, {"name": "Attendance (classes)", "rule": {"kind": "steps", "steps": [{"at_least": 320, "points": 3}, {"at_least": 375, "points": 5}, {"at_least": 400, "points": 10}]}}, {"name": "Special events", "rule": {"kind": "steps", "steps": [{"at_least": 3, "points": 3}, {"at_least": 6, "points": 5}, {"at_least": 10, "points": 10}]}}, {"name": "Breaking class", "rule": {"kind": "steps", "steps": [{"at_least": 16, "points": 3}, {"at_least": 20, "points": 5}, {"at_least": 25, "points": 10}]}}]},
   "hand_in": [{"name": "Egg test"}, {"name": "Meditation"}, {"name": "Appreciation letter"}, {"name": "TKD project"}]},
  {"dan": 2,
   "pass_rule": {"points": 261, "no_d": true, "makeup": "A subject graded D is made up at the next testing, even if the total passes."},
   "parts": [
    {"code": "physical", "name": "Physical", "max_points": 80, "subjects": [
      {"name": "Stretching", "credits": 3, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 4}, {"grade": "A", "value": 3.5}, {"grade": "B+", "value": 3}, {"grade": "B", "value": 2.5}, {"grade": "C", "value": 2}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 6}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 4}, {"grade": "B", "value": 3}, {"grade": "C", "value": 2}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 6}, {"grade": "B+", "value": 5}, {"grade": "B", "value": 4}, {"grade": "C", "value": 2}]}], "points": {"A+": 12, "A": 10.5, "B+": 9, "B": 7.5, "C": 6, "D": 0}}},
      {"name": "Sit-up (20 sec)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "count", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 16}, {"grade": "B+", "value": 11}, {"grade": "B", "value": 6}, {"grade": "C", "value": 4}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 20}, {"grade": "A", "value": 18}, {"grade": "B+", "value": 15}, {"grade": "B", "value": 10}, {"grade": "C", "value": 4}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 23}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 18}, {"grade": "B", "value": 15}, {"grade": "C", "value": 6}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Push-up (1 min)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "count", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 20}, {"grade": "A", "value": 18}, {"grade": "B+", "value": 16}, {"grade": "B", "value": 14}, {"grade": "C", "value": 12}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 36}, {"grade": "A", "value": 30}, {"grade": "B+", "value": 25}, {"grade": "B", "value": 20}, {"grade": "C", "value": 15}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 50}, {"grade": "A", "value": 40}, {"grade": "B+", "value": 30}, {"grade": "B", "value": 25}, {"grade": "C", "value": 20}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Static jump", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 12}, {"grade": "A", "value": 10}, {"grade": "B+", "value": 9}, {"grade": "B", "value": 7}, {"grade": "C", "value": 3}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 15}, {"grade": "B+", "value": 13}, {"grade": "B", "value": 10}, {"grade": "C", "value": 5}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 23}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 18}, {"grade": "B", "value": 15}, {"grade": "C", "value": 10}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Long jump", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches (feet x 12 + inches)", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 72}, {"grade": "A", "value": 60}, {"grade": "B+", "value": 54}, {"grade": "B", "value": 48}, {"grade": "C", "value": 36}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 84}, {"grade": "A", "value": 72}, {"grade": "B+", "value": 66}, {"grade": "B", "value": 60}, {"grade": "C", "value": 48}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 96}, {"grade": "A", "value": 84}, {"grade": "B+", "value": 78}, {"grade": "B", "value": 72}, {"grade": "C", "value": 60}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Sprint 4x10 m", "credits": 2, "scoring": {"kind": "table", "direction": "at_most", "unit": "seconds", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 10}, {"grade": "A", "value": 12}, {"grade": "B+", "value": 13}, {"grade": "B", "value": 14}, {"grade": "C", "value": 16}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 9}, {"grade": "A", "value": 11}, {"grade": "B+", "value": 12}, {"grade": "B", "value": 13}, {"grade": "C", "value": 15}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 10}, {"grade": "B+", "value": 11}, {"grade": "B", "value": 12}, {"grade": "C", "value": 14}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Pull-up or hold", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "reps, or seconds for the hold", "groups": [{"ages": {"min": null, "max": null, "label": "Hold, all ages (seconds)"}, "method": "hold", "cutoffs": [{"grade": "A+", "value": 31}, {"grade": "A", "value": 26}, {"grade": "B+", "value": 21}, {"grade": "B", "value": 11}, {"grade": "C", "value": 9}]}, {"ages": {"min": null, "max": 12, "label": "Reps, 12 and under"}, "method": "reps", "cutoffs": [{"grade": "A+", "value": 6}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 3}, {"grade": "B", "value": 2}, {"grade": "C", "value": 1}]}, {"ages": {"min": 13, "max": null, "label": "Reps, 13 and over"}, "method": "reps", "cutoffs": [{"grade": "A+", "value": 10}, {"grade": "A", "value": 8}, {"grade": "B+", "value": 6}, {"grade": "B", "value": 4}, {"grade": "C", "value": 2}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}, "outdoor": true},
      {"name": "Sprint 100 m", "credits": 2, "scoring": {"kind": "table", "direction": "under", "unit": "seconds", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 22}, {"grade": "B", "value": 24}, {"grade": "C", "value": 28}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 15}, {"grade": "A", "value": 17}, {"grade": "B+", "value": 19}, {"grade": "B", "value": 21}, {"grade": "C", "value": 24}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 14}, {"grade": "A", "value": 15}, {"grade": "B+", "value": 16}, {"grade": "B", "value": 17}, {"grade": "C", "value": 23}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}, "outdoor": true},
      {"name": "1/2 or 1 mile", "credits": 3, "scoring": {"kind": "table", "direction": "at_most", "unit": "minutes", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 5}, {"grade": "A", "value": 6}, {"grade": "B+", "value": 6.5}, {"grade": "B", "value": 7}, {"grade": "C", "value": 8}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 4}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 5.5}, {"grade": "B", "value": 6}, {"grade": "C", "value": 7}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 8.5}, {"grade": "B+", "value": 9}, {"grade": "B", "value": 11}, {"grade": "C", "value": 12}]}], "points": {"A+": 12, "A": 10.5, "B+": 9, "B": 7.5, "C": 6, "D": 0}, "note": "1/2 mile for 12 and under, 1 mile for 13 and over"}, "outdoor": true}
    ]},
    {"code": "technical", "name": "Technical", "max_points": 44, "subjects": [
      {"name": "Referee seminar", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}},
      {"name": "Free sparring", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 12, "A": 10.5, "A-": 9.75, "B+": 9, "B": 7.5, "B-": 6.75, "C": 6, "C-": 3, "D": 0}}},
      {"name": "Target kick (30 sec)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "kicks in 30 seconds", "groups": [{"ages": {"min": null, "max": 9, "label": "9 and under"}, "cutoffs": [{"grade": "A+", "value": 35}, {"grade": "A", "value": 31}, {"grade": "B+", "value": 26}, {"grade": "B", "value": 22}, {"grade": "C", "value": 21}]}, {"ages": {"min": 10, "max": null, "label": "10 and over"}, "cutoffs": [{"grade": "A+", "value": 39}, {"grade": "A", "value": 34}, {"grade": "B+", "value": 29}, {"grade": "B", "value": 24}, {"grade": "C", "value": 23}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Korean terminology", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}},
      {"name": "TKD knowledge", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}}
    ]},
    {"code": "curriculum", "name": "Curriculum", "max_points": 139.5, "subjects": [
      {"name": "White-Bodan Curriculum", "credits": 10, "scoring": {"kind": "grades", "points": {"A+": 45, "A": 40, "A-": 38, "B+": 35, "B": 33, "B-": 30, "C": 25, "C-": 20, "D": 0}}},
      {"name": "Go-Ryo Poomsae", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}},
      {"name": "Advance 10 Motion (1-5)", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}},
      {"name": "Advance Sa Bang Chuck (1-5)", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}},
      {"name": "Step Sa Bang Chuck (1-5)", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}},
      {"name": "Power Break", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}},
      {"name": "Technical Break", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}},
      {"name": "Two Step Sparring (1-10)", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}}
    ]},
    {"code": "other", "name": "Other requirements", "max_points": 80, "subjects": [
      {"name": "Egg test", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 20, "A": 17.5, "A-": 16.25, "B+": 15, "B": 11, "B-": 10.5, "C": 10, "C-": 5, "D": 0}}, "hand_in": true},
      {"name": "Meditation", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}, "hand_in": true},
      {"name": "Assistant instructor course", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 20, "A": 17.5, "A-": 16.25, "B+": 15, "B": 11, "B-": 10.5, "C": 10, "C-": 5, "D": 0}}, "hand_in": false},
      {"name": "Appreciation letter", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}, "hand_in": true},
      {"name": "TKD project", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}, "hand_in": true}
    ]}
   ],
   "extra_points": {"to_confirm": true, "counts_toward_total": true, "limit": null, "items": [{"name": "Extra stripes", "rule": {"kind": "per_count", "points_each": 1}}, {"name": "Outstanding performance", "rule": {"kind": "steps", "steps": [{"at_least": 4, "points": 5}]}}, {"name": "Competitions", "rule": {"kind": "steps", "steps": [{"at_least": 1, "points": 3}, {"at_least": 2, "points": 5}, {"at_least": 3, "points": 7}, {"at_least": 4, "points": 10}, {"at_least": 5, "points": 15}]}}, {"name": "Attendance (classes)", "rule": {"kind": "steps", "steps": [{"at_least": 250, "points": 3}, {"at_least": 271, "points": 5}, {"at_least": 300, "points": 10}]}}, {"name": "Special events", "rule": {"kind": "steps", "steps": [{"at_least": 3, "points": 3}, {"at_least": 6, "points": 5}, {"at_least": 10, "points": 10}]}}, {"name": "Breaking class", "rule": {"kind": "steps", "steps": [{"at_least": 11, "points": 3}, {"at_least": 17, "points": 5}, {"at_least": 21, "points": 10}]}}]},
   "hand_in": [{"name": "Egg test"}, {"name": "Meditation"}, {"name": "Appreciation letter"}, {"name": "TKD project"}]},
  {"dan": 3,
   "pass_rule": {"points": 293, "no_d": true, "makeup": "A subject graded D is made up at the next testing, even if the total passes."},
   "parts": [
    {"code": "physical", "name": "Physical", "max_points": 80, "subjects": [
      {"name": "Stretching", "credits": 3, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 4}, {"grade": "A", "value": 3.5}, {"grade": "B+", "value": 3}, {"grade": "B", "value": 2.5}, {"grade": "C", "value": 2}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 6}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 4}, {"grade": "B", "value": 3}, {"grade": "C", "value": 2}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 6}, {"grade": "B+", "value": 5}, {"grade": "B", "value": 4}, {"grade": "C", "value": 2}]}], "points": {"A+": 12, "A": 10.5, "B+": 9, "B": 7.5, "C": 6, "D": 0}}},
      {"name": "Sit-up (20 sec)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "count", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 16}, {"grade": "B+", "value": 11}, {"grade": "B", "value": 6}, {"grade": "C", "value": 4}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 20}, {"grade": "A", "value": 18}, {"grade": "B+", "value": 15}, {"grade": "B", "value": 10}, {"grade": "C", "value": 4}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 23}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 18}, {"grade": "B", "value": 15}, {"grade": "C", "value": 6}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Push-up (1 min)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "count", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 20}, {"grade": "A", "value": 18}, {"grade": "B+", "value": 16}, {"grade": "B", "value": 14}, {"grade": "C", "value": 12}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 36}, {"grade": "A", "value": 30}, {"grade": "B+", "value": 25}, {"grade": "B", "value": 20}, {"grade": "C", "value": 15}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 50}, {"grade": "A", "value": 40}, {"grade": "B+", "value": 30}, {"grade": "B", "value": 25}, {"grade": "C", "value": 20}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Static jump", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 12}, {"grade": "A", "value": 10}, {"grade": "B+", "value": 9}, {"grade": "B", "value": 7}, {"grade": "C", "value": 3}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 15}, {"grade": "B+", "value": 13}, {"grade": "B", "value": 10}, {"grade": "C", "value": 5}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 23}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 18}, {"grade": "B", "value": 15}, {"grade": "C", "value": 10}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Long jump", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches (feet x 12 + inches)", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 72}, {"grade": "A", "value": 60}, {"grade": "B+", "value": 54}, {"grade": "B", "value": 48}, {"grade": "C", "value": 36}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 84}, {"grade": "A", "value": 72}, {"grade": "B+", "value": 66}, {"grade": "B", "value": 60}, {"grade": "C", "value": 48}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 96}, {"grade": "A", "value": 84}, {"grade": "B+", "value": 78}, {"grade": "B", "value": 72}, {"grade": "C", "value": 60}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Sprint 4x10 m", "credits": 2, "scoring": {"kind": "table", "direction": "at_most", "unit": "seconds", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 10}, {"grade": "A", "value": 12}, {"grade": "B+", "value": 13}, {"grade": "B", "value": 14}, {"grade": "C", "value": 16}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 9}, {"grade": "A", "value": 11}, {"grade": "B+", "value": 12}, {"grade": "B", "value": 13}, {"grade": "C", "value": 15}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 10}, {"grade": "B+", "value": 11}, {"grade": "B", "value": 12}, {"grade": "C", "value": 14}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Pull-up or hold", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "reps, or seconds for the hold", "groups": [{"ages": {"min": null, "max": null, "label": "Hold, all ages (seconds)"}, "method": "hold", "cutoffs": [{"grade": "A+", "value": 31}, {"grade": "A", "value": 26}, {"grade": "B+", "value": 21}, {"grade": "B", "value": 11}, {"grade": "C", "value": 9}]}, {"ages": {"min": null, "max": 12, "label": "Reps, 12 and under"}, "method": "reps", "cutoffs": [{"grade": "A+", "value": 6}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 3}, {"grade": "B", "value": 2}, {"grade": "C", "value": 1}]}, {"ages": {"min": 13, "max": null, "label": "Reps, 13 and over"}, "method": "reps", "cutoffs": [{"grade": "A+", "value": 10}, {"grade": "A", "value": 8}, {"grade": "B+", "value": 6}, {"grade": "B", "value": 4}, {"grade": "C", "value": 2}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}, "outdoor": true},
      {"name": "Sprint 100 m", "credits": 2, "scoring": {"kind": "table", "direction": "under", "unit": "seconds", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 22}, {"grade": "B", "value": 24}, {"grade": "C", "value": 28}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 15}, {"grade": "A", "value": 17}, {"grade": "B+", "value": 19}, {"grade": "B", "value": 21}, {"grade": "C", "value": 24}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 14}, {"grade": "A", "value": 15}, {"grade": "B+", "value": 16}, {"grade": "B", "value": 17}, {"grade": "C", "value": 23}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}, "outdoor": true},
      {"name": "1/2 or 1 mile", "credits": 3, "scoring": {"kind": "table", "direction": "at_most", "unit": "minutes", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 5}, {"grade": "A", "value": 6}, {"grade": "B+", "value": 6.5}, {"grade": "B", "value": 7}, {"grade": "C", "value": 8}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 4}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 5.5}, {"grade": "B", "value": 6}, {"grade": "C", "value": 7}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 8.5}, {"grade": "B+", "value": 9}, {"grade": "B", "value": 11}, {"grade": "C", "value": 12}]}], "points": {"A+": 12, "A": 10.5, "B+": 9, "B": 7.5, "C": 6, "D": 0}, "note": "1/2 mile for 12 and under, 1 mile for 13 and over"}, "outdoor": true}
    ]},
    {"code": "technical", "name": "Technical", "max_points": 44, "subjects": [
      {"name": "Referee seminar", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}},
      {"name": "Free sparring", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 12, "A": 10.5, "A-": 9.75, "B+": 9, "B": 7.5, "B-": 6.75, "C": 6, "C-": 3, "D": 0}}},
      {"name": "Target kick (30 sec)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "kicks in 30 seconds", "groups": [{"ages": {"min": null, "max": 9, "label": "9 and under"}, "cutoffs": [{"grade": "A+", "value": 35}, {"grade": "A", "value": 31}, {"grade": "B+", "value": 26}, {"grade": "B", "value": 22}, {"grade": "C", "value": 21}]}, {"ages": {"min": 10, "max": null, "label": "10 and over"}, "cutoffs": [{"grade": "A+", "value": 39}, {"grade": "A", "value": 34}, {"grade": "B+", "value": 29}, {"grade": "B", "value": 24}, {"grade": "C", "value": 23}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Korean terminology", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}},
      {"name": "TKD knowledge", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}}
    ]},
    {"code": "curriculum", "name": "Curriculum", "max_points": 180, "subjects": [
      {"name": "White-Bodan Curriculum", "credits": 10, "scoring": {"kind": "grades", "points": {"A+": 45, "A": 40, "A-": 38, "B+": 35, "B": 33, "B-": 30, "C": 25, "C-": 20, "D": 0}}},
      {"name": "Geum Gang Poomsae", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 22.5, "A": 20, "A-": 19, "B+": 17.5, "B": 16.5, "B-": 15, "C": 12.5, "C-": 10, "D": 0}}},
      {"name": "1st Dan Curriculum", "credits": 10, "scoring": {"kind": "grades", "points": {"A+": 45, "A": 40, "A-": 38, "B+": 35, "B": 33, "B-": 30, "C": 25, "C-": 20, "D": 0}}},
      {"name": "2nd Dan Sa Bang Chuck (1-4)", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}},
      {"name": "Creative Poomsae", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}},
      {"name": "Creative Sa Bang Chuck", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}},
      {"name": "Technical Break", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}},
      {"name": "Power Break", "credits": 3, "scoring": {"kind": "grades", "points": {"A+": 13.5, "A": 12, "A-": 11.4, "B+": 10.5, "B": 9.9, "B-": 9, "C": 7.5, "C-": 6, "D": 0}}}
    ]},
    {"code": "other", "name": "Other requirements", "max_points": 80, "subjects": [
      {"name": "Egg test", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 20, "A": 17.5, "A-": 16.25, "B+": 15, "B": 11, "B-": 10.5, "C": 10, "C-": 5, "D": 0}}, "hand_in": true},
      {"name": "Meditation", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}, "hand_in": true},
      {"name": "Assistant instructor course", "credits": 5, "scoring": {"kind": "grades", "points": {"A+": 20, "A": 17.5, "A-": 16.25, "B+": 15, "B": 11, "B-": 10.5, "C": 10, "C-": 5, "D": 0}}, "hand_in": false},
      {"name": "Appreciation letter", "credits": 2, "scoring": {"kind": "grades", "points": {"A+": 8, "A": 7, "A-": 6.5, "B+": 6, "B": 5, "B-": 4.5, "C": 4, "C-": 2, "D": 0}}, "hand_in": true},
      {"name": "TKD project", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}, "hand_in": true}
    ]}
   ],
   "extra_points": {"to_confirm": true, "counts_toward_total": true, "limit": null, "items": [{"name": "Extra stripes", "rule": {"kind": "per_count", "points_each": 1}}, {"name": "Outstanding performance", "rule": {"kind": "steps", "steps": [{"at_least": 3, "points": 5}]}}, {"name": "Competitions", "rule": {"kind": "steps", "steps": [{"at_least": 1, "points": 3}, {"at_least": 2, "points": 5}, {"at_least": 3, "points": 7}, {"at_least": 4, "points": 10}, {"at_least": 5, "points": 15}]}}, {"name": "Attendance (classes)", "rule": {"kind": "steps", "steps": [{"at_least": 210, "points": 3}, {"at_least": 231, "points": 5}, {"at_least": 250, "points": 10}]}}, {"name": "Special events", "rule": {"kind": "steps", "steps": [{"at_least": 3, "points": 3}, {"at_least": 6, "points": 5}, {"at_least": 10, "points": 10}]}}, {"name": "Breaking class", "rule": {"kind": "steps", "steps": [{"at_least": 11, "points": 3}, {"at_least": 17, "points": 5}, {"at_least": 21, "points": 10}]}}]},
   "hand_in": [{"name": "Egg test"}, {"name": "Meditation"}, {"name": "Appreciation letter"}, {"name": "TKD project"}]},
  {"dan": 4,
   "pass_rule": {"points": 453, "no_d": true, "makeup": "A subject graded D is made up at the next testing, even if the total passes."},
   "parts": [
    {"code": "physical", "name": "Physical", "max_points": 80, "subjects": [
      {"name": "Stretching", "credits": 3, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 4}, {"grade": "A", "value": 3.5}, {"grade": "B+", "value": 3}, {"grade": "B", "value": 2.5}, {"grade": "C", "value": 2}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 6}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 4}, {"grade": "B", "value": 3}, {"grade": "C", "value": 2}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 6}, {"grade": "B+", "value": 5}, {"grade": "B", "value": 4}, {"grade": "C", "value": 2}]}], "points": {"A+": 12, "A": 10.5, "B+": 9, "B": 7.5, "C": 6, "D": 0}}},
      {"name": "Sit-up (20 sec)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "count", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 16}, {"grade": "B+", "value": 11}, {"grade": "B", "value": 6}, {"grade": "C", "value": 4}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 20}, {"grade": "A", "value": 18}, {"grade": "B+", "value": 15}, {"grade": "B", "value": 10}, {"grade": "C", "value": 4}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 23}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 18}, {"grade": "B", "value": 15}, {"grade": "C", "value": 6}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Push-up (1 min)", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "count", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 20}, {"grade": "A", "value": 18}, {"grade": "B+", "value": 16}, {"grade": "B", "value": 14}, {"grade": "C", "value": 12}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 36}, {"grade": "A", "value": 30}, {"grade": "B+", "value": 25}, {"grade": "B", "value": 20}, {"grade": "C", "value": 15}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 50}, {"grade": "A", "value": 40}, {"grade": "B+", "value": 30}, {"grade": "B", "value": 25}, {"grade": "C", "value": 20}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Static jump", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 12}, {"grade": "A", "value": 10}, {"grade": "B+", "value": 9}, {"grade": "B", "value": 7}, {"grade": "C", "value": 3}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 15}, {"grade": "B+", "value": 13}, {"grade": "B", "value": 10}, {"grade": "C", "value": 5}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 23}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 18}, {"grade": "B", "value": 15}, {"grade": "C", "value": 10}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Long jump", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "inches (feet x 12 + inches)", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 72}, {"grade": "A", "value": 60}, {"grade": "B+", "value": 54}, {"grade": "B", "value": 48}, {"grade": "C", "value": 36}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 84}, {"grade": "A", "value": 72}, {"grade": "B+", "value": 66}, {"grade": "B", "value": 60}, {"grade": "C", "value": 48}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 96}, {"grade": "A", "value": 84}, {"grade": "B+", "value": 78}, {"grade": "B", "value": 72}, {"grade": "C", "value": 60}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Sprint 4x10 m", "credits": 2, "scoring": {"kind": "table", "direction": "at_most", "unit": "seconds", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 10}, {"grade": "A", "value": 12}, {"grade": "B+", "value": 13}, {"grade": "B", "value": 14}, {"grade": "C", "value": 16}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 9}, {"grade": "A", "value": 11}, {"grade": "B+", "value": 12}, {"grade": "B", "value": 13}, {"grade": "C", "value": 15}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 10}, {"grade": "B+", "value": 11}, {"grade": "B", "value": 12}, {"grade": "C", "value": 14}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}},
      {"name": "Pull-up or hold", "credits": 2, "scoring": {"kind": "table", "direction": "at_least", "unit": "reps, or seconds for the hold", "groups": [{"ages": {"min": null, "max": null, "label": "Hold, all ages (seconds)"}, "method": "hold", "cutoffs": [{"grade": "A+", "value": 31}, {"grade": "A", "value": 26}, {"grade": "B+", "value": 21}, {"grade": "B", "value": 11}, {"grade": "C", "value": 9}]}, {"ages": {"min": null, "max": 12, "label": "Reps, 12 and under"}, "method": "reps", "cutoffs": [{"grade": "A+", "value": 6}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 3}, {"grade": "B", "value": 2}, {"grade": "C", "value": 1}]}, {"ages": {"min": 13, "max": null, "label": "Reps, 13 and over"}, "method": "reps", "cutoffs": [{"grade": "A+", "value": 10}, {"grade": "A", "value": 8}, {"grade": "B+", "value": 6}, {"grade": "B", "value": 4}, {"grade": "C", "value": 2}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}, "outdoor": true},
      {"name": "Sprint 100 m", "credits": 2, "scoring": {"kind": "table", "direction": "under", "unit": "seconds", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 18}, {"grade": "A", "value": 20}, {"grade": "B+", "value": 22}, {"grade": "B", "value": 24}, {"grade": "C", "value": 28}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 15}, {"grade": "A", "value": 17}, {"grade": "B+", "value": 19}, {"grade": "B", "value": 21}, {"grade": "C", "value": 24}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 14}, {"grade": "A", "value": 15}, {"grade": "B+", "value": 16}, {"grade": "B", "value": 17}, {"grade": "C", "value": 23}]}], "points": {"A+": 8, "A": 7, "B+": 6, "B": 5, "C": 4, "D": 0}}, "outdoor": true},
      {"name": "1/2 or 1 mile", "credits": 3, "scoring": {"kind": "table", "direction": "at_most", "unit": "minutes", "groups": [{"ages": {"min": null, "max": 8, "label": "8 and under"}, "cutoffs": [{"grade": "A+", "value": 5}, {"grade": "A", "value": 6}, {"grade": "B+", "value": 6.5}, {"grade": "B", "value": 7}, {"grade": "C", "value": 8}]}, {"ages": {"min": 9, "max": 12, "label": "9-12"}, "cutoffs": [{"grade": "A+", "value": 4}, {"grade": "A", "value": 5}, {"grade": "B+", "value": 5.5}, {"grade": "B", "value": 6}, {"grade": "C", "value": 7}]}, {"ages": {"min": 13, "max": null, "label": "13 and over"}, "cutoffs": [{"grade": "A+", "value": 8}, {"grade": "A", "value": 8.5}, {"grade": "B+", "value": 9}, {"grade": "B", "value": 11}, {"grade": "C", "value": 12}]}], "points": {"A+": 12, "A": 10.5, "B+": 9, "B": 7.5, "C": 6, "D": 0}, "note": "1/2 mile for 12 and under, 1 mile for 13 and over"}, "outdoor": true}
    ]},
    {"code": "technical", "name": "Technical", "max_points": 144, "subjects": [
      {"name": "Referee seminar", "credits": 10, "scoring": {"kind": "grades", "points": {"A+": 40, "A": 35, "A-": 32.5, "B+": 30, "B": 25, "B-": 22.5, "C": 20, "C-": 10, "D": 0}}},
      {"name": "Free sparring", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}},
      {"name": "Target kick (30 sec)", "credits": 4, "scoring": {"kind": "table", "direction": "at_least", "unit": "kicks in 30 seconds", "groups": [{"ages": {"min": null, "max": 9, "label": "9 and under"}, "cutoffs": [{"grade": "A+", "value": 35}, {"grade": "A", "value": 31}, {"grade": "B+", "value": 26}, {"grade": "B", "value": 22}, {"grade": "C", "value": 21}]}, {"ages": {"min": 10, "max": null, "label": "10 and over"}, "cutoffs": [{"grade": "A+", "value": 39}, {"grade": "A", "value": 34}, {"grade": "B+", "value": 29}, {"grade": "B", "value": 24}, {"grade": "C", "value": 23}]}], "points": {"A+": 16, "A": 14, "B+": 12, "B": 9, "C": 8, "D": 0}}},
      {"name": "Korean terminology", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}},
      {"name": "TKD knowledge", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}},
      {"name": "Written test", "credits": 10, "scoring": {"kind": "grades", "points": {"A+": 40, "A": 35, "A-": 32.5, "B+": 30, "B": 25, "B-": 22.5, "C": 20, "C-": 10, "D": 0}}}
    ]},
    {"code": "curriculum", "name": "Curriculum", "max_points": 243, "subjects": [
      {"name": "White-Bodan Curriculum", "credits": 10, "scoring": {"kind": "grades", "points": {"A+": 45, "A": 40, "A-": 38, "B+": 35, "B": 33, "B-": 30, "C": 25, "C-": 20, "D": 0}}},
      {"name": "Tae Baek Poomsae", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 18, "A": 16, "A-": 15.2, "B+": 14, "B": 13.2, "B-": 12, "C": 10, "C-": 8, "D": 0}}},
      {"name": "1st Dan Curriculum", "credits": 10, "scoring": {"kind": "grades", "points": {"A+": 45, "A": 40, "A-": 38, "B+": 35, "B": 33, "B-": 30, "C": 25, "C-": 20, "D": 0}}},
      {"name": "2nd Dan Curriculum", "credits": 10, "scoring": {"kind": "grades", "points": {"A+": 45, "A": 40, "A-": 38, "B+": 35, "B": 33, "B-": 30, "C": 25, "C-": 20, "D": 0}}},
      {"name": "3rd Dan Sa Bang Chuck (1-6)", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 18, "A": 16, "A-": 15.2, "B+": 14, "B": 13.2, "B-": 12, "C": 10, "C-": 8, "D": 0}}},
      {"name": "Creative Poomsae", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 18, "A": 16, "A-": 15.2, "B+": 14, "B": 13.2, "B-": 12, "C": 10, "C-": 8, "D": 0}}},
      {"name": "Creative Sa Bang Chuck", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 18, "A": 16, "A-": 15.2, "B+": 14, "B": 13.2, "B-": 12, "C": 10, "C-": 8, "D": 0}}},
      {"name": "Technical Break", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 18, "A": 16, "A-": 15.2, "B+": 14, "B": 13.2, "B-": 12, "C": 10, "C-": 8, "D": 0}}},
      {"name": "Power Break", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 18, "A": 16, "A-": 15.2, "B+": 14, "B": 13.2, "B-": 12, "C": 10, "C-": 8, "D": 0}}}
    ]},
    {"code": "other", "name": "Other requirements", "max_points": 128, "subjects": [
      {"name": "Egg test", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}, "hand_in": true},
      {"name": "Meditation", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}, "hand_in": true},
      {"name": "Assistant instructor course", "credits": 10, "scoring": {"kind": "grades", "points": {"A+": 40, "A": 35, "A-": 32.5, "B+": 30, "B": 25, "B-": 22.5, "C": 20, "C-": 10, "D": 0}}, "hand_in": false},
      {"name": "Appreciation letter", "credits": 4, "scoring": {"kind": "grades", "points": {"A+": 16, "A": 14, "A-": 13, "B+": 12, "B": 9, "B-": 8.5, "C": 8, "C-": 4, "D": 0}}, "hand_in": true},
      {"name": "TKD project", "credits": 10, "scoring": {"kind": "grades", "points": {"A+": 40, "A": 35, "A-": 32.5, "B+": 30, "B": 25, "B-": 22.5, "C": 20, "C-": 10, "D": 0}}, "hand_in": true}
    ]}
   ],
   "extra_points": {"to_confirm": true, "counts_toward_total": true, "limit": null, "items": [{"name": "Extra stripes", "rule": {"kind": "per_count", "points_each": 1}}, {"name": "Outstanding performance", "rule": {"kind": "steps", "steps": [{"at_least": 3, "points": 5}]}}, {"name": "Competitions", "rule": {"kind": "steps", "steps": [{"at_least": 1, "points": 3}, {"at_least": 2, "points": 5}, {"at_least": 3, "points": 7}, {"at_least": 4, "points": 10}, {"at_least": 5, "points": 15}]}}, {"name": "Attendance (classes)", "rule": {"kind": "steps", "steps": [{"at_least": 210, "points": 3}, {"at_least": 231, "points": 5}, {"at_least": 250, "points": 10}]}}, {"name": "Special events", "rule": {"kind": "steps", "steps": [{"at_least": 3, "points": 3}, {"at_least": 6, "points": 5}, {"at_least": 10, "points": 10}]}}, {"name": "Breaking class", "rule": {"kind": "steps", "steps": [{"at_least": 11, "points": 3}, {"at_least": 17, "points": 5}, {"at_least": 21, "points": 10}]}}], "note": "4th Dan uses the 3rd Dan numbers for now"},
   "hand_in": [{"name": "Egg test"}, {"name": "Meditation"}, {"name": "Appreciation letter"}, {"name": "TKD project"}]}
 ]}
$bbjson$::jsonb,
'')
on conflict (singleton) do nothing;

select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);

-- ---------------------------------------------------------------------
-- 12. Security rules: RLS + grants (the same two layers as 0003 / 0005 /
--     0006)
--   * grants: which COLUMNS the app may read - SELECT only (contract
--     4.1). Never the date of birth, the email, anything of the signed
--     waivers or the starting point, or a login id (created_by,
--     updated_by, withdrawn_by, recorded_by), or the singleton flag. No
--     INSERT / UPDATE / DELETE for anyone in the app: every write goes
--     through the functions below.
--   * RLS: which ROWS - every row, but only while has_data_access() is
--     true. The signed waivers and the starting point: RLS on, no rule, no
--     grants = nobody.
--   * Nothing at all for anon, service_role or PUBLIC.
--   Only Black Belt's own objects are touched here (a "revoke all" on a
--   shared 0003 / 0005 table would undo what those migrations granted).
-- ---------------------------------------------------------------------
alter table public.bb_settings            enable row level security;
alter table public.bb_waiver_versions     enable row level security;
alter table public.bb_starting_point      enable row level security;
alter table public.bb_cycles              enable row level security;
alter table public.bb_cycle_days          enable row level security;
alter table public.bb_cycle_day_parts     enable row level security;
alter table public.bb_cycle_plans         enable row level security;
alter table public.bb_cycle_plan_amounts  enable row level security;
alter table public.bb_cycle_kukkiwon_fees enable row level security;
alter table public.bb_cycle_plan_payments enable row level security;
alter table public.bb_candidates          enable row level security;
alter table public.bb_candidate_waivers   enable row level security;
alter table public.bb_payments            enable row level security;

-- Start from zero (also removes column grants, so re-runs stay clean)...
revoke all on table public.bb_settings, public.bb_waiver_versions, public.bb_starting_point, public.bb_cycles,
                    public.bb_cycle_days, public.bb_cycle_day_parts, public.bb_cycle_plans,
                    public.bb_cycle_plan_amounts, public.bb_cycle_kukkiwon_fees, public.bb_cycle_plan_payments,
                    public.bb_candidates, public.bb_candidate_waivers, public.bb_payments
  from public, anon, authenticated, service_role;
revoke all on sequence public.bb_candidate_ref_seq from public, anon, authenticated, service_role;

-- ...then add back exactly what the app reads (contract 4.1).
grant select (id, keep_years_after_last_day, keep_years_after_18,
              version, created_at, updated_at, created_by_name, updated_by_name)
  on public.bb_settings to authenticated;              -- NOT singleton, created_by, updated_by
grant select (id, version_name, body, is_placeholder, superseded_at, created_at, created_by_name)
  on public.bb_waiver_versions to authenticated;       -- NOT created_by
grant select (id, name, application_due, submissions_due, auto_close, registration_open, first_opened_at,
              public_code_worcester, public_code_shrewsbury, requirements, prices_from,
              version, created_at, updated_at, created_by_name, updated_by_name)
  on public.bb_cycles to authenticated;
grant select (id, cycle_id, name, day_date, start_time, end_time, place_code, place_other,
              second_start, second_end, second_place_code, second_place_other,
              version, created_at, updated_at, created_by_name, updated_by_name)
  on public.bb_cycle_days to authenticated;
grant select (id, day_id, part)
  on public.bb_cycle_day_parts to authenticated;
grant select (id, cycle_id, name, payments_count, position, created_at, created_by_name)
  on public.bb_cycle_plans to authenticated;
grant select (id, cycle_plan_id, dan, payment_no, amount_cents)
  on public.bb_cycle_plan_amounts to authenticated;
grant select (id, cycle_id, dan, amount_cents)
  on public.bb_cycle_kukkiwon_fees to authenticated;
grant select (id, cycle_plan_id, payment_no, due_on, follows_application_due, version, updated_at, updated_by_name)
  on public.bb_cycle_plan_payments to authenticated;
grant select (id, cycle_id, first_name, last_name, personal_removed_at, location_code, dan, cycle_plan_id,
              kukkiwon, kukkiwon_added_on, source, reference, registered_at, status, withdrawn_reason,
              withdrawn_at, withdrawn_by_name, duplicate_state, duplicate_of,
              version, created_at, updated_at, created_by_name, updated_by_name)
  on public.bb_candidates to authenticated;            -- NOT date_of_birth, email_for_results, withdrawn_by, created_by, updated_by
grant select (id, candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason,
              location_code, cycle_name, recorded_at, recorded_by_name, reverses_payment_id)
  on public.bb_payments to authenticated;              -- NOT recorded_by

-- Read rules ("(select ...)" = run the check once per query, not per row).
drop policy if exists bb_settings_select_with_access on public.bb_settings;
create policy bb_settings_select_with_access
  on public.bb_settings for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists bb_waiver_versions_select_with_access on public.bb_waiver_versions;
create policy bb_waiver_versions_select_with_access
  on public.bb_waiver_versions for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists bb_cycles_select_with_access on public.bb_cycles;
create policy bb_cycles_select_with_access
  on public.bb_cycles for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists bb_cycle_days_select_with_access on public.bb_cycle_days;
create policy bb_cycle_days_select_with_access
  on public.bb_cycle_days for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists bb_cycle_day_parts_select_with_access on public.bb_cycle_day_parts;
create policy bb_cycle_day_parts_select_with_access
  on public.bb_cycle_day_parts for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists bb_cycle_plans_select_with_access on public.bb_cycle_plans;
create policy bb_cycle_plans_select_with_access
  on public.bb_cycle_plans for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists bb_cycle_plan_amounts_select_with_access on public.bb_cycle_plan_amounts;
create policy bb_cycle_plan_amounts_select_with_access
  on public.bb_cycle_plan_amounts for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists bb_cycle_kukkiwon_fees_select_with_access on public.bb_cycle_kukkiwon_fees;
create policy bb_cycle_kukkiwon_fees_select_with_access
  on public.bb_cycle_kukkiwon_fees for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists bb_cycle_plan_payments_select_with_access on public.bb_cycle_plan_payments;
create policy bb_cycle_plan_payments_select_with_access
  on public.bb_cycle_plan_payments for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists bb_candidates_select_with_access on public.bb_candidates;
create policy bb_candidates_select_with_access
  on public.bb_candidates for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists bb_payments_select_with_access on public.bb_payments;
create policy bb_payments_select_with_access
  on public.bb_payments for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 13. Internal helpers used by the functions (nobody can call them)
-- ---------------------------------------------------------------------

-- 13a. bb_lock_candidate(candidate) - shared start of the candidate and
-- payment functions: finds the candidate's cycle, locks cycle ("for no key
-- update") -> candidate ("for update"), and returns the locked candidate
-- (all fields NULL if it is gone).
-- locks: cycle (no key update) -> candidate (update)
create or replace function public.bb_lock_candidate(p_candidate_id uuid)
returns public.bb_candidates
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_cycle_id uuid;
  v_c        public.bb_candidates;
begin
  select c.cycle_id into v_cycle_id from public.bb_candidates c where c.id = p_candidate_id;
  if not found then
    return null;
  end if;
  perform 1 from public.bb_cycles y where y.id = v_cycle_id for no key update;
  select * into v_c from public.bb_candidates c where c.id = p_candidate_id for update;
  return v_c;
end;
$$;

revoke execute on function public.bb_lock_candidate(uuid) from public, anon, authenticated, service_role;

-- 13b. bb_lock_payment(payment) - shared start of the functions that act
-- on one payment row (undo, edit, mark returned): finds its candidate,
-- locks cycle -> candidate (13a) -> the payment row, and returns the
-- locked payment (all fields NULL if it is gone).
-- locks: cycle (no key update) -> candidate (update) -> payment (update)
create or replace function public.bb_lock_payment(p_payment_id uuid)
returns public.bb_payments
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_candidate_id uuid;
  v_c            public.bb_candidates;
  v_p            public.bb_payments;
begin
  select p.candidate_id into v_candidate_id from public.bb_payments p where p.id = p_payment_id;
  if not found then
    return null;
  end if;
  v_c := public.bb_lock_candidate(v_candidate_id);
  if v_c.id is null then
    return null;
  end if;
  select * into v_p from public.bb_payments p where p.id = p_payment_id for update;
  return v_p;
end;
$$;

revoke execute on function public.bb_lock_payment(uuid) from public, anon, authenticated, service_role;

-- 13c. bb_find_duplicate(cycle, exclude_id, first, last, dob) - another
-- ACTIVE candidate in the same cycle with the same first and last name
-- (ignoring capitals and extra spaces) AND the same date of birth, any Dan
-- (S7). The oldest one wins. A row "kept both" together with exclude_id
-- doesn't count. A missing DOB (after the purge) never matches.
create or replace function public.bb_find_duplicate(
  p_cycle_id   uuid,
  p_exclude_id uuid,
  p_first      text,
  p_last       text,
  p_dob        date
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select m.id
    from public.bb_candidates m
   where m.cycle_id = p_cycle_id
     and m.status = 'active'
     and (p_exclude_id is null or m.id <> p_exclude_id)
     and lower(m.first_name) = lower(public.testing_normalize_name(p_first))
     and lower(m.last_name) = lower(public.testing_normalize_name(p_last))
     and m.date_of_birth = p_dob
     and not (p_exclude_id is not null and m.duplicate_state = 'kept_both' and m.duplicate_of = p_exclude_id)
   order by m.registered_at, m.id
   limit 1;
$$;

revoke execute on function public.bb_find_duplicate(uuid, uuid, text, text, date) from public, anon, authenticated, service_role;

-- 13d. bb_recheck_duplicate(candidate) - works out one candidate's
-- "possible duplicate" mark again (after an insert, a name / DOB edit, a
-- withdraw, restore or removal nearby), as 0006's 16c:
--   withdrawn -> none; kept both with a partner that still matches ->
--   unchanged; another active match -> possible; no match -> none.
-- Writes only if something changes.
create or replace function public.bb_recheck_duplicate(p_candidate_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_c     public.bb_candidates;
  v_state text;
  v_of    uuid;
begin
  select * into v_c from public.bb_candidates c where c.id = p_candidate_id;
  if not found then
    return;
  end if;

  if v_c.status <> 'active' then
    v_state := 'none';
    v_of    := null;
  elsif v_c.duplicate_state = 'kept_both'
        and v_c.duplicate_of is not null
        and exists (select 1 from public.bb_candidates m
                     where m.id = v_c.duplicate_of
                       and m.status = 'active'
                       and m.cycle_id = v_c.cycle_id
                       and lower(m.first_name) = lower(v_c.first_name)
                       and lower(m.last_name) = lower(v_c.last_name)
                       and m.date_of_birth = v_c.date_of_birth) then
    return;   -- staff said these two are both real
  else
    v_of    := public.bb_find_duplicate(v_c.cycle_id, v_c.id, v_c.first_name, v_c.last_name, v_c.date_of_birth);
    v_state := case when v_of is null then 'none' else 'possible' end;
  end if;

  update public.bb_candidates c
     set duplicate_state = v_state,
         duplicate_of    = v_of
   where c.id = p_candidate_id
     and (c.duplicate_state is distinct from v_state or c.duplicate_of is distinct from v_of);
end;
$$;

revoke execute on function public.bb_recheck_duplicate(uuid) from public, anon, authenticated, service_role;

-- 13e. bb_recheck_pointing_at(candidate) - rechecks every candidate whose
-- duplicate_of points at this one (in id order).
create or replace function public.bb_recheck_pointing_at(p_candidate_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select c.id from public.bb_candidates c
               where c.duplicate_of = p_candidate_id
               order by c.id loop
    perform public.bb_recheck_duplicate(v_id);
  end loop;
end;
$$;

revoke execute on function public.bb_recheck_pointing_at(uuid) from public, anon, authenticated, service_role;

-- 13f. bb_purge_due() - the purge (v0.906, v0.907, S13). Does nothing
-- while either keep-years setting is empty. Otherwise, for every candidate
-- (active or withdrawn) not purged yet whose purge day (10e) is today or
-- earlier:
--   * the candidate row, locked "for update skip locked" (a row another
--     call is working on right now is simply done next time - the purge
--     never waits): date of birth and email removed, personal_removed_at
--     set
--   * then its drawn waivers not purged yet, locked with a plain "for
--     update" (they are only ever written under the candidate lock, so
--     this never waits long and never skips one): signature and signer's
--     name removed, removed_at set
-- Kept: names, Dan, school, plan, reference, payments, the waiver's
-- version and date. No version bump (no-bump columns, 11a); the history
-- shows only the masked values going to empty (11i, 11k). Tagged
-- bb_purge_due with its own batch id; the caller's tags are put back.
-- No scheduled job: it runs as the LAST step of bb_add_cycle,
-- bb_add_candidate, bb_record_payment, bb_set_keep_years and of the reads
-- bb_cycles_list and bb_cycle_roster. NEVER from the family form (its
-- login has a 5-second limit per statement, section 14).
-- Returns how many candidates were purged.
-- locks: candidates (update, skip locked) -> their drawn waivers (update)
create or replace function public.bb_purge_due()
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_action text := current_setting('tkd.action', true);
  v_batch  text := current_setting('tkd.batch_id', true);
  v_today  date := public.testing_today();
  v_id     uuid;
  v_n      integer := 0;
begin
  if not exists (select 1 from public.bb_settings s
                  where s.keep_years_after_last_day is not null and s.keep_years_after_18 is not null) then
    return 0;
  end if;

  perform set_config('tkd.action', 'bb_purge_due', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  for v_id in
    select c.id
      from public.bb_candidates c
     where c.personal_removed_at is null
       and public.bb_purge_is_due(c.id, v_today)
     order by c.id
       for update of c skip locked
  loop
    update public.bb_candidates c
       set date_of_birth       = null,
           email_for_results   = null,
           personal_removed_at = now()
     where c.id = v_id;
    perform 1 from public.bb_candidate_waivers w
      where w.candidate_id = v_id and w.how = 'drawn' and w.removed_at is null
      order by w.id
        for update;
    update public.bb_candidate_waivers w
       set signature   = null,
           signer_name = null,
           removed_at  = now()
     where w.candidate_id = v_id and w.how = 'drawn' and w.removed_at is null;
    v_n := v_n + 1;
  end loop;

  perform set_config('tkd.action', coalesce(v_action, ''), true);
  perform set_config('tkd.batch_id', coalesce(v_batch, ''), true);
  return v_n;
end;
$$;

revoke execute on function public.bb_purge_due() from public, anon, authenticated, service_role;

-- 13g. bb_public_answer(candidate) - the "You're registered" answer the
-- family page shows: only what that family just sent plus the cycle facts
-- and what they owe when (10c: a late registrant's passed dates show as
-- the day they registered). No DOB, no email, no signer's name, no
-- signature, nothing about anyone else - and the same shape whether or not
-- the person looks like a duplicate.
create or replace function public.bb_public_answer(p_candidate_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'status',      'ok',
           'reference',   c.reference,
           'first_name',  c.first_name,
           'last_name',   c.last_name,
           'dan',         c.dan,
           'kukkiwon',    c.kukkiwon,
           'plan_name',   p.name,
           'items',       coalesce((select jsonb_agg(jsonb_build_object('item', i.item, 'due_on', i.due_on,
                                                                        'amount_cents', i.amount_cents)
                                                     order by i.sort_no)
                                      from public.bb_candidate_items(c.id) as i), '[]'::jsonb),
           'total_cents', coalesce((select sum(i.amount_cents)::bigint from public.bb_candidate_items(c.id) as i), 0),
           'cycle_name',  y.name,
           'school',      jsonb_build_object('code', l.code, 'name', l.name))
    from public.bb_candidates c
    join public.bb_cycles y      on y.id = c.cycle_id
    join public.bb_cycle_plans p on p.id = c.cycle_plan_id
    join public.locations l      on l.code = c.location_code
   where c.id = p_candidate_id;
$$;

revoke execute on function public.bb_public_answer(uuid) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 14. The restricted login for the Black Belt family form: bb_registrar
-- The same settings as 0005's testing_registrar and 0006's star_registrar
-- (read 0005 section 13): it can sign in (password set separately as a
-- SCRAM verifier made on Jeffrey's PC - SETUP.md section 18. NO password
-- in this file), has no inherited rights, can't create databases or
-- roles, can't skip RLS, at most 5 connections, a stuck call is cut off
-- after 5 seconds, and nothing is found without its schema name. It can
-- run exactly the two functions of section 17 and has no right on any
-- table, view or counter. Created only if it doesn't exist yet, so
-- re-running this file never touches an existing role's attributes or
-- password. testing_registrar and star_registrar can't run Black Belt's
-- functions, and bb_registrar can't run theirs.
-- What a separate login protects: inside the database, each form's login
-- runs only its own two functions. (The Cloudflare bindings are shared by
-- the whole Pages project, so it is not a wall between the Functions.)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'bb_registrar') then
    create role bb_registrar login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5;
  end if;
end
$$;

alter role bb_registrar set statement_timeout = '5s';
alter role bb_registrar set idle_in_transaction_session_timeout = '10s';
alter role bb_registrar set search_path = '';

-- It needs to find the two functions in schema public, nothing more.
grant usage on schema public to bb_registrar;


-- ---------------------------------------------------------------------
-- 15. The staff WRITE functions (the only way to change Black Belt data).
--     Same pattern as 0003 section 8, 0005 section 14 and 0006 section 18:
--   * returns {"status": ...}; the statuses are listed in the header
--   * roles: A = admins only; S = staff (incl. the shared desk) and admins
--   * checks in this order (contract 1.1): 1 has_data_access() FIRST
--     (no_access), 2 the role (not_allowed), 3 the input (invalid) -
--     nothing is looked up before 1-2, 4 it locks and looks up the rows
--     (not_found), 5 "did the screen see the latest version?" (stale), 6
--     the rules that depend on the data, 7 a duplicate name, 8 it writes
--   * tags its writes with tkd.action (= the function's name) + one new
--     tkd.batch_id, and clears both after writing
--   * the whole body is inside begin ... exception ... end: if a table
--     rule still says no, everything this call did is undone and a status
--     is answered instead of an error (contract 1.4):
--       the cycle-name index                   -> duplicate_name
--       any other unique rule                  -> stale
--       foreign key / check / not-null rule    -> invalid
--       deadlock / serialization / lock not available -> stale
--   * LOCK ORDER (contract 1.5): bb_settings -> cycle -> candidate(s) ->
--     payment ("for no key update" on the parents, "for update" on the
--     row changed or removed). Each function's comment states its own
--     order ("locks: ...").
--   * no argument has a default; whole numbers are "integer" (the app's
--     database driver sends them as int4).
-- ---------------------------------------------------------------------

-- 15a. bb_save_waiver(p_expected_current_id, p_body)   A
-- Rubric and prices -> Save the waiver text: ALWAYS a new version (the old
-- one is kept for the waivers signed on it). Its name is the year of
-- today + the count of that year's versions ("2027-1", "2027-2" ...).
-- p_expected_current_id = the version the screen showed (another admin's
-- save in between -> stale). The same text as the current one (ignoring
-- spaces at the start and end) writes nothing and answers the current
-- version.
-- locks: settings (no key update) -> the current version (no key update)
-- Ok: {"status":"ok","id":...,"version_name":"2027-1"}
create or replace function public.bb_save_waiver(
  p_expected_current_id uuid,
  p_body                text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_body       text;
  v_cur        public.bb_waiver_versions;
  v_year       text;
  v_name       text;
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

    v_body := btrim(p_body);
    if p_expected_current_id is null or v_body is null or char_length(v_body) not between 1 and 20000 then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. the template lock, then the current version. "no key update":
    --    the version only gets superseded_at, and a family registering
    --    against it at this moment (which takes a key-share lock through
    --    its foreign key) doesn't have to wait.
    perform 1 from public.bb_settings s for no key update;
    select * into v_cur from public.bb_waiver_versions v where v.superseded_at is null for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_cur.id <> p_expected_current_id then
      return jsonb_build_object('status', 'stale');
    end if;
    if btrim(v_cur.body) = v_body then
      return jsonb_build_object('status', 'ok', 'id', v_cur.id, 'version_name', v_cur.version_name);
    end if;

    v_year := extract(year from public.testing_today())::integer::text;
    select v_year || '-' || (count(*) + 1)::text into v_name
      from public.bb_waiver_versions v where v.version_name like v_year || '-%';

    perform set_config('tkd.action', 'bb_save_waiver', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- the old one first (only one version may be current at a time)
    update public.bb_waiver_versions v set superseded_at = now() where v.id = v_cur.id;
    insert into public.bb_waiver_versions (version_name, body, is_placeholder, created_by_name)
    values (v_name, v_body, false, '')
    returning id into v_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version_name', v_name);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_save_waiver(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_save_waiver(uuid, text) to authenticated;

-- 15b. bb_set_keep_years(p_expected_version, p_after_last_day, p_after_18,
--        p_confirm_count)   A
-- Rubric and prices -> the two keep-years numbers (v0.906, S12): both
-- empty (nothing is ever purged) or both whole years from 3 to 20.
-- TWO steps, because saving may delete signed waivers at once:
--   1st call, p_confirm_count NULL: nothing is saved; the answer says how
--     many candidates' personal data the NEW numbers would remove right
--     now: {"status":"confirm_needed","remove_count":n}
--   2nd call, p_confirm_count = that n: saves (the same numbers -> nothing
--     written) and runs the purge in the same call. If the count changed
--     in between -> stale (the screen asks again).
-- locks: settings (no key update); then the purge (13f)
-- Ok: {"status":"ok","version":n,"removed_count":n}
create or replace function public.bb_set_keep_years(
  p_expected_version integer,
  p_after_last_day   integer,
  p_after_18         integer,
  p_confirm_count    integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s          public.bb_settings;
  v_today      date;
  v_n          integer;
  v_removed    integer;
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

    if p_expected_version is null
       or ((p_after_last_day is null) <> (p_after_18 is null))
       or (p_after_last_day is not null and p_after_last_day not between 3 and 20)
       or (p_after_18 is not null and p_after_18 not between 3 and 20)
       or (p_confirm_count is not null and p_confirm_count < 0) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_s from public.bb_settings s for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_s.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 6. how many not-yet-purged candidates the NEW numbers make due today
    --    (the same formula as 10e, with the new numbers)
    v_today := public.testing_today();
    if p_after_last_day is null then
      v_n := 0;
    else
      select count(*) into v_n
        from public.bb_candidates c
       where c.personal_removed_at is null
         and greatest((select max(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id)
                        + make_interval(years => p_after_last_day),
                      c.date_of_birth + make_interval(years => 18 + p_after_18)) <= v_today;
    end if;
    if p_confirm_count is null then
      return jsonb_build_object('status', 'confirm_needed', 'remove_count', v_n);
    end if;
    if p_confirm_count <> v_n then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'bb_set_keep_years', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_settings s
       set keep_years_after_last_day = p_after_last_day,
           keep_years_after_18       = p_after_18
     where s.id = v_s.id
       and (s.keep_years_after_last_day is distinct from p_after_last_day
            or s.keep_years_after_18 is distinct from p_after_18)
    returning s.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    v_removed := public.bb_purge_due();

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_s.version), 'removed_count', v_removed);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_set_keep_years(integer, integer, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_set_keep_years(integer, integer, integer, integer) to authenticated;

-- 15c. bb_add_cycle(p_payload, p_source_cycle_id)   A
-- Add cycle: one call with the whole form (contract 6.2). p_payload:
--   {"name", "application_due", "submissions_due", "auto_close",
--    "days": [{"name", "day_date", "start_time", "end_time",
--              "place": {"code": "worcester"} | {"other": "Horgan Arena ..."},
--              "second": {"start", "end", "place"} | null,
--              "parts": ["physical", ...]}],          (1-20 days)
--    "plans": [{"name", "payments": [{"due_on", "follows_application_due"}],
--               "amounts": {"1": [cents per payment], "2": [...], "3": [...], "4": [...]}}],
--                                                       (1-10 plans, 1-12 payments each)
--    "kukkiwon": {"1": cents, "2": cents, "3": cents, "4": cents},
--    "prices_from": "Spring 2027" | "Fall 2026 starting point" | null}
-- Every key is checked; an unknown key -> invalid. Dates "YYYY-MM-DD",
-- times "HH:MM". A day's "id" key may only be null here (days get their
-- ids when saved).
-- p_source_cycle_id = the cycle the form was filled in from (its
-- requirements sheet is copied), or NULL = the starting point's sheet.
-- Rules (invalid): name rule; no day before today; times 6:00 AM-10:00 PM
-- on 15 minutes, end after start; exactly one place (a school or other
-- text up to 100 characters); a second part complete or absent and
-- starting at or after the first part's end; parts a non-empty set of the
-- three codes; plan names different (ignoring capitals and spaces); no
-- due date before today; "follows Application due" only on payment 1 and
-- only when it is that date; every amount and fee whole dollars $1-$5,000;
-- both deadlines on or before the last testing day.
-- A part on no day -> {"status":"part_without_day","parts":[...]}. A
-- cycle with that name -> duplicate_name.
-- The new cycle starts Closed, with two new random link codes. Last step:
-- the purge (13f).
-- locks: settings (share) -> link-code advisory lock -> the source cycle (share)
-- Ok: {"status":"ok","id":...,"version":1,"public_code_worcester":...,"public_code_shrewsbury":...}
create or replace function public.bb_add_cycle(
  p_payload         jsonb,
  p_source_cycle_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today       date;
  v_name        text;
  v_app         date;
  v_sub         date;
  v_auto        boolean;
  v_prices_from text;
  v_day         jsonb;
  v_sec         jsonb;
  v_plan        jsonb;
  v_pay         jsonb;
  v_x           jsonb;
  v_date        date;
  v_st          time;
  v_en          time;
  v_last        date;
  v_parts       text[];
  v_all_parts   text[] := '{}';
  v_plan_names  text[] := '{}';
  v_missing     text[];
  v_n           integer;
  v_i           integer;
  v_j           integer;
  v_dan         integer;
  v_req         jsonb;
  v_code_w      text;
  v_code_s      text;
  v_id          uuid;
  v_day_id      uuid;
  v_plan_id     uuid;
  v_constraint  text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 3. the input, key by key
    v_today := public.testing_today();
    if jsonb_typeof(p_payload) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(p_payload) as k(key)
                   where k.key not in ('name', 'application_due', 'submissions_due', 'auto_close', 'days',
                                       'plans', 'kukkiwon', 'prices_from'))
       or jsonb_typeof(p_payload -> 'name') is distinct from 'string'
       or not public.testing_name_is_valid(p_payload ->> 'name')
       or jsonb_typeof(p_payload -> 'application_due') is distinct from 'string'
       or not pg_input_is_valid(p_payload ->> 'application_due', 'date')
       or jsonb_typeof(p_payload -> 'submissions_due') is distinct from 'string'
       or not pg_input_is_valid(p_payload ->> 'submissions_due', 'date')
       or jsonb_typeof(p_payload -> 'auto_close') is distinct from 'boolean'
       or (p_payload ? 'prices_from' and jsonb_typeof(p_payload -> 'prices_from') <> 'null'
           and (jsonb_typeof(p_payload -> 'prices_from') <> 'string'
                or not public.testing_name_is_valid(p_payload ->> 'prices_from')))
       or jsonb_typeof(p_payload -> 'days') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'days') not between 1 and 20
       or jsonb_typeof(p_payload -> 'plans') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'plans') not between 1 and 10
       or jsonb_typeof(p_payload -> 'kukkiwon') is distinct from 'object' then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_name := public.testing_normalize_name(p_payload ->> 'name');
    v_app  := (p_payload ->> 'application_due')::date;
    v_sub  := (p_payload ->> 'submissions_due')::date;
    v_auto := (p_payload ->> 'auto_close')::boolean;
    v_prices_from := public.testing_normalize_name(p_payload ->> 'prices_from');

    -- the days
    for v_day in select d.value from jsonb_array_elements(p_payload -> 'days') as d(value) loop
      if jsonb_typeof(v_day) <> 'object'
         or exists (select 1 from jsonb_object_keys(v_day) as k(key)
                     where k.key not in ('id', 'name', 'day_date', 'start_time', 'end_time', 'place', 'second', 'parts'))
         or (v_day ? 'id' and jsonb_typeof(v_day -> 'id') <> 'null')
         or jsonb_typeof(v_day -> 'name') is distinct from 'string'
         or not public.testing_name_is_valid(v_day ->> 'name')
         or jsonb_typeof(v_day -> 'day_date') is distinct from 'string'
         or not pg_input_is_valid(v_day ->> 'day_date', 'date')
         or jsonb_typeof(v_day -> 'start_time') is distinct from 'string'
         or not pg_input_is_valid(v_day ->> 'start_time', 'time')
         or jsonb_typeof(v_day -> 'end_time') is distinct from 'string'
         or not pg_input_is_valid(v_day ->> 'end_time', 'time') then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_date := (v_day ->> 'day_date')::date;
      v_st   := (v_day ->> 'start_time')::time;
      v_en   := (v_day ->> 'end_time')::time;
      if v_date < v_today
         or not public.bb_time_is_valid(v_st) or not public.bb_time_is_valid(v_en) or v_en <= v_st then
        return jsonb_build_object('status', 'invalid');
      end if;
      -- exactly one place: a school, or other text up to 100 characters
      v_x := v_day -> 'place';
      if not coalesce(jsonb_typeof(v_x) = 'object'
                      and (select count(*) from jsonb_object_keys(v_x)) = 1
                      and ((jsonb_typeof(v_x -> 'code') = 'string'
                            and exists (select 1 from public.locations l where l.code = v_x ->> 'code'))
                           or (jsonb_typeof(v_x -> 'other') = 'string'
                               and public.testing_note_is_valid(v_x ->> 'other')
                               and char_length(public.testing_normalize_note(v_x ->> 'other')) <= 100)), false) then
        return jsonb_build_object('status', 'invalid');
      end if;
      -- the optional second part
      v_sec := v_day -> 'second';
      if v_sec is not null and jsonb_typeof(v_sec) <> 'null' then
        if jsonb_typeof(v_sec) <> 'object'
           or exists (select 1 from jsonb_object_keys(v_sec) as k(key) where k.key not in ('start', 'end', 'place'))
           or jsonb_typeof(v_sec -> 'start') is distinct from 'string'
           or not pg_input_is_valid(v_sec ->> 'start', 'time')
           or jsonb_typeof(v_sec -> 'end') is distinct from 'string'
           or not pg_input_is_valid(v_sec ->> 'end', 'time') then
          return jsonb_build_object('status', 'invalid');
        end if;
        if not public.bb_time_is_valid((v_sec ->> 'start')::time) or not public.bb_time_is_valid((v_sec ->> 'end')::time)
           or (v_sec ->> 'end')::time <= (v_sec ->> 'start')::time or (v_sec ->> 'start')::time < v_en then
          return jsonb_build_object('status', 'invalid');
        end if;
        v_x := v_sec -> 'place';
        if not coalesce(jsonb_typeof(v_x) = 'object'
                        and (select count(*) from jsonb_object_keys(v_x)) = 1
                        and ((jsonb_typeof(v_x -> 'code') = 'string'
                              and exists (select 1 from public.locations l where l.code = v_x ->> 'code'))
                             or (jsonb_typeof(v_x -> 'other') = 'string'
                                 and public.testing_note_is_valid(v_x ->> 'other')
                                 and char_length(public.testing_normalize_note(v_x ->> 'other')) <= 100)), false) then
          return jsonb_build_object('status', 'invalid');
        end if;
      end if;
      -- the parts graded that day: 1-3 of the three codes, no repeats
      if jsonb_typeof(v_day -> 'parts') is distinct from 'array'
         or jsonb_array_length(v_day -> 'parts') not between 1 and 3
         or exists (select 1 from jsonb_array_elements(v_day -> 'parts') as p(value)
                     where jsonb_typeof(p.value) <> 'string'
                        or p.value #>> '{}' not in ('physical', 'technical', 'curriculum'))
         or (select count(distinct p.value) from jsonb_array_elements(v_day -> 'parts') as p(value))
            <> jsonb_array_length(v_day -> 'parts') then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_parts := array(select p.value from jsonb_array_elements_text(v_day -> 'parts') as p(value));
      v_all_parts := v_all_parts || v_parts;
      v_last := greatest(v_last, v_date);
    end loop;

    -- both deadlines on or before the last testing day
    if v_app > v_last or v_sub > v_last then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- the plans
    for v_plan in select p.value from jsonb_array_elements(p_payload -> 'plans') as p(value) loop
      if jsonb_typeof(v_plan) <> 'object'
         or exists (select 1 from jsonb_object_keys(v_plan) as k(key) where k.key not in ('name', 'payments', 'amounts'))
         or jsonb_typeof(v_plan -> 'name') is distinct from 'string'
         or not public.testing_name_is_valid(v_plan ->> 'name')
         or lower(public.testing_normalize_name(v_plan ->> 'name')) = any (v_plan_names)
         or jsonb_typeof(v_plan -> 'payments') is distinct from 'array'
         or jsonb_array_length(v_plan -> 'payments') not between 1 and 12
         or jsonb_typeof(v_plan -> 'amounts') is distinct from 'object'
         or (select count(*) from jsonb_object_keys(v_plan -> 'amounts')) <> 4
         or exists (select 1 from jsonb_object_keys(v_plan -> 'amounts') as k(key) where k.key not in ('1', '2', '3', '4')) then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_plan_names := v_plan_names || lower(public.testing_normalize_name(v_plan ->> 'name'));
      v_n := jsonb_array_length(v_plan -> 'payments');
      v_i := 0;
      for v_pay in select x.value from jsonb_array_elements(v_plan -> 'payments') as x(value) loop
        v_i := v_i + 1;
        if jsonb_typeof(v_pay) <> 'object'
           or exists (select 1 from jsonb_object_keys(v_pay) as k(key) where k.key not in ('due_on', 'follows_application_due'))
           or jsonb_typeof(v_pay -> 'due_on') is distinct from 'string'
           or not pg_input_is_valid(v_pay ->> 'due_on', 'date')
           or jsonb_typeof(v_pay -> 'follows_application_due') is distinct from 'boolean' then
          return jsonb_build_object('status', 'invalid');
        end if;
        if (v_pay ->> 'due_on')::date < v_today
           or ((v_pay ->> 'follows_application_due')::boolean
               and (v_i <> 1 or (v_pay ->> 'due_on')::date <> v_app)) then
          return jsonb_build_object('status', 'invalid');
        end if;
      end loop;
      -- one amount per payment for each Dan, whole dollars $1-$5,000
      for v_dan in 1 .. 4 loop
        v_x := v_plan -> 'amounts' -> v_dan::text;
        if jsonb_typeof(v_x) is distinct from 'array' or jsonb_array_length(v_x) <> v_n
           or exists (select 1 from jsonb_array_elements(v_x) as a(value)
                       where not (case when jsonb_typeof(a.value) = 'number'
                                       then (a.value)::numeric between 100 and 500000 and mod((a.value)::numeric, 100) = 0
                                       else false end)) then
          return jsonb_build_object('status', 'invalid');
        end if;
      end loop;
    end loop;

    -- the Kukkiwon fees: one per Dan, whole dollars $1-$5,000
    if (select count(*) from jsonb_object_keys(p_payload -> 'kukkiwon')) <> 4
       or exists (select 1 from jsonb_each(p_payload -> 'kukkiwon') as f(key, value)
                   where f.key not in ('1', '2', '3', '4')
                      or not (case when jsonb_typeof(f.value) = 'number'
                                   then (f.value)::numeric between 100 and 500000 and mod((f.value)::numeric, 100) = 0
                                   else false end)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. locks: the template lock (share), then the link-code lock (a
    --    transaction-long lock on a fixed number, so two Add cycle calls
    --    draw codes one after the other), then the source cycle (share)
    perform 1 from public.bb_settings s for share;
    perform pg_advisory_xact_lock(hashtext('bb_public_code'));
    if p_source_cycle_id is not null then
      select y.requirements into v_req from public.bb_cycles y where y.id = p_source_cycle_id for share;
      if not found then
        return jsonb_build_object('status', 'invalid');
      end if;
    else
      select sp.requirements into v_req from public.bb_starting_point sp;
      if not found then
        return jsonb_build_object('status', 'invalid');
      end if;
    end if;

    -- 6. every part on at least one day
    v_missing := array(select x.part from unnest(array['physical', 'technical', 'curriculum']) with ordinality as x(part, n)
                        where not (x.part = any (v_all_parts)) order by x.n);
    if cardinality(v_missing) > 0 then
      return jsonb_build_object('status', 'part_without_day', 'parts', to_jsonb(v_missing));
    end if;

    -- 7. the name
    if exists (select 1 from public.bb_cycles y where lower(public.testing_normalize_name(y.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write
    perform set_config('tkd.action', 'bb_add_cycle', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    loop
      v_code_w := public.testing_new_public_code();
      v_code_s := public.testing_new_public_code();
      exit when v_code_w <> v_code_s
            and not exists (select 1 from public.bb_cycles y
                             where y.public_code_worcester in (v_code_w, v_code_s)
                                or y.public_code_shrewsbury in (v_code_w, v_code_s));
    end loop;

    insert into public.bb_cycles
      (name, application_due, submissions_due, auto_close, registration_open, first_opened_at,
       public_code_worcester, public_code_shrewsbury, requirements, prices_from, created_by_name, updated_by_name)
    values
      (v_name, v_app, v_sub, v_auto, false, null, v_code_w, v_code_s, v_req, v_prices_from, '', '')
    returning id into v_id;

    -- the days, in the order given, each with its parts
    for v_day in select d.value from jsonb_array_elements(p_payload -> 'days') as d(value) loop
      v_sec := case when jsonb_typeof(v_day -> 'second') = 'object' then v_day -> 'second' end;
      insert into public.bb_cycle_days
        (cycle_id, name, day_date, start_time, end_time, place_code, place_other,
         second_start, second_end, second_place_code, second_place_other, created_by_name, updated_by_name)
      values
        (v_id, public.testing_normalize_name(v_day ->> 'name'), (v_day ->> 'day_date')::date,
         (v_day ->> 'start_time')::time, (v_day ->> 'end_time')::time,
         v_day -> 'place' ->> 'code', public.testing_normalize_note(v_day -> 'place' ->> 'other'),
         (v_sec ->> 'start')::time, (v_sec ->> 'end')::time,
         v_sec -> 'place' ->> 'code', public.testing_normalize_note(v_sec -> 'place' ->> 'other'), '', '')
      returning id into v_day_id;
      insert into public.bb_cycle_day_parts (day_id, part, created_by_name)
      select v_day_id, p.value, ''
        from jsonb_array_elements_text(v_day -> 'parts') with ordinality as p(value, n)
       order by p.n;
    end loop;

    -- the plans (position = the order given), their due dates and amounts
    for v_plan, v_i in select p.value, (p.n - 1)::integer
                         from jsonb_array_elements(p_payload -> 'plans') with ordinality as p(value, n) loop
      insert into public.bb_cycle_plans (cycle_id, name, payments_count, position, created_by_name)
      values (v_id, public.testing_normalize_name(v_plan ->> 'name'), jsonb_array_length(v_plan -> 'payments'), v_i, '')
      returning id into v_plan_id;
      insert into public.bb_cycle_plan_payments (cycle_plan_id, payment_no, due_on, follows_application_due,
                                                 created_by_name, updated_by_name)
      select v_plan_id, x.n, (x.value ->> 'due_on')::date, (x.value ->> 'follows_application_due')::boolean, '', ''
        from jsonb_array_elements(v_plan -> 'payments') with ordinality as x(value, n)
       order by x.n;
      for v_dan in 1 .. 4 loop
        insert into public.bb_cycle_plan_amounts (cycle_plan_id, dan, payment_no, amount_cents)
        select v_plan_id, v_dan, a.n, ((a.value)::numeric)::integer
          from jsonb_array_elements(v_plan -> 'amounts' -> v_dan::text) with ordinality as a(value, n)
         order by a.n;
      end loop;
    end loop;

    insert into public.bb_cycle_kukkiwon_fees (cycle_id, dan, amount_cents)
    select v_id, f.key::smallint, ((f.value)::numeric)::integer
      from jsonb_each(p_payload -> 'kukkiwon') as f(key, value)
     order by f.key;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.bb_purge_due();

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', 1,
                              'public_code_worcester', v_code_w, 'public_code_shrewsbury', v_code_s);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_add_cycle(jsonb, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_add_cycle(jsonb, uuid) to authenticated;

-- 15d. bb_update_cycle(p_cycle_id, p_expected_version, p_payload)   A
-- Edit cycle. p_payload as Add cycle WITHOUT plans, kukkiwon and
-- prices_from (present -> invalid; prices never change, v0.902), and with
--   "due_dates": [{"cycle_plan_id", "payment_no", "due_on", "follows_application_due"}]
-- naming every plan payment of this cycle exactly once.
-- Days are matched by id: a day with an id is that day (it must belong to
-- this cycle) and is changed only where something differs; a day without
-- an id is new; a day of the cycle missing from the list is removed with
-- its parts. Parts per day are replaced by difference.
-- A CHANGED day date or due date must be today or later; unchanged past
-- dates are kept (a cycle under way can still be edited).
-- "follows Application due" (payment 1 only): its due date is kept equal
-- to Application due (the sent due_on is then ignored); a typed date is
-- sent with the flag off.
-- A part on no day -> part_without_day; another cycle with the name ->
-- duplicate_name. The cycle's version goes up exactly once when anything
-- changed; the same values write nothing.
-- (The grading migration adds "a day or part with grades can't be
-- removed" here, v0.900 detail 4.)
-- locks: cycle (update) -> its days in id order (update) -> its due dates in id order (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.bb_update_cycle(
  p_cycle_id         uuid,
  p_expected_version integer,
  p_payload          jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today       date;
  v_name        text;
  v_app         date;
  v_sub         date;
  v_auto        boolean;
  v_c           public.bb_cycles;
  v_day         jsonb;
  v_sec         jsonb;
  v_x           jsonb;
  v_date        date;
  v_st          time;
  v_en          time;
  v_last        date;
  v_all_parts   text[] := '{}';
  v_ids         uuid[] := '{}';
  v_missing     text[];
  v_day_id      uuid;
  v_old_date    date;
  v_due         date;
  v_rows        integer;
  v_changed     boolean := false;
  v_cycle_done  boolean := false;
  v_version     integer;
  v_constraint  text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 3. the input, key by key (the same day rules as Add cycle, except
    --    the past-date rule, which needs the saved dates: step 6)
    v_today := public.testing_today();
    if p_cycle_id is null or p_expected_version is null
       or jsonb_typeof(p_payload) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(p_payload) as k(key)
                   where k.key not in ('name', 'application_due', 'submissions_due', 'auto_close', 'days', 'due_dates'))
       or jsonb_typeof(p_payload -> 'name') is distinct from 'string'
       or not public.testing_name_is_valid(p_payload ->> 'name')
       or jsonb_typeof(p_payload -> 'application_due') is distinct from 'string'
       or not pg_input_is_valid(p_payload ->> 'application_due', 'date')
       or jsonb_typeof(p_payload -> 'submissions_due') is distinct from 'string'
       or not pg_input_is_valid(p_payload ->> 'submissions_due', 'date')
       or jsonb_typeof(p_payload -> 'auto_close') is distinct from 'boolean'
       or jsonb_typeof(p_payload -> 'days') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'days') not between 1 and 20
       or jsonb_typeof(p_payload -> 'due_dates') is distinct from 'array' then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_name := public.testing_normalize_name(p_payload ->> 'name');
    v_app  := (p_payload ->> 'application_due')::date;
    v_sub  := (p_payload ->> 'submissions_due')::date;
    v_auto := (p_payload ->> 'auto_close')::boolean;

    for v_day in select d.value from jsonb_array_elements(p_payload -> 'days') as d(value) loop
      if jsonb_typeof(v_day) <> 'object'
         or exists (select 1 from jsonb_object_keys(v_day) as k(key)
                     where k.key not in ('id', 'name', 'day_date', 'start_time', 'end_time', 'place', 'second', 'parts'))
         or (v_day ? 'id' and jsonb_typeof(v_day -> 'id') <> 'null'
             and (jsonb_typeof(v_day -> 'id') <> 'string' or not pg_input_is_valid(v_day ->> 'id', 'uuid')))
         or jsonb_typeof(v_day -> 'name') is distinct from 'string'
         or not public.testing_name_is_valid(v_day ->> 'name')
         or jsonb_typeof(v_day -> 'day_date') is distinct from 'string'
         or not pg_input_is_valid(v_day ->> 'day_date', 'date')
         or jsonb_typeof(v_day -> 'start_time') is distinct from 'string'
         or not pg_input_is_valid(v_day ->> 'start_time', 'time')
         or jsonb_typeof(v_day -> 'end_time') is distinct from 'string'
         or not pg_input_is_valid(v_day ->> 'end_time', 'time') then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_date := (v_day ->> 'day_date')::date;
      v_st   := (v_day ->> 'start_time')::time;
      v_en   := (v_day ->> 'end_time')::time;
      if not public.bb_time_is_valid(v_st) or not public.bb_time_is_valid(v_en) or v_en <= v_st then
        return jsonb_build_object('status', 'invalid');
      end if;
      if jsonb_typeof(v_day -> 'id') = 'string' then
        if (v_day ->> 'id')::uuid = any (v_ids) then
          return jsonb_build_object('status', 'invalid');   -- the same day twice
        end if;
        v_ids := v_ids || (v_day ->> 'id')::uuid;
      end if;
      v_x := v_day -> 'place';
      if not coalesce(jsonb_typeof(v_x) = 'object'
                      and (select count(*) from jsonb_object_keys(v_x)) = 1
                      and ((jsonb_typeof(v_x -> 'code') = 'string'
                            and exists (select 1 from public.locations l where l.code = v_x ->> 'code'))
                           or (jsonb_typeof(v_x -> 'other') = 'string'
                               and public.testing_note_is_valid(v_x ->> 'other')
                               and char_length(public.testing_normalize_note(v_x ->> 'other')) <= 100)), false) then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_sec := v_day -> 'second';
      if v_sec is not null and jsonb_typeof(v_sec) <> 'null' then
        if jsonb_typeof(v_sec) <> 'object'
           or exists (select 1 from jsonb_object_keys(v_sec) as k(key) where k.key not in ('start', 'end', 'place'))
           or jsonb_typeof(v_sec -> 'start') is distinct from 'string'
           or not pg_input_is_valid(v_sec ->> 'start', 'time')
           or jsonb_typeof(v_sec -> 'end') is distinct from 'string'
           or not pg_input_is_valid(v_sec ->> 'end', 'time') then
          return jsonb_build_object('status', 'invalid');
        end if;
        if not public.bb_time_is_valid((v_sec ->> 'start')::time) or not public.bb_time_is_valid((v_sec ->> 'end')::time)
           or (v_sec ->> 'end')::time <= (v_sec ->> 'start')::time or (v_sec ->> 'start')::time < v_en then
          return jsonb_build_object('status', 'invalid');
        end if;
        v_x := v_sec -> 'place';
        if not coalesce(jsonb_typeof(v_x) = 'object'
                        and (select count(*) from jsonb_object_keys(v_x)) = 1
                        and ((jsonb_typeof(v_x -> 'code') = 'string'
                              and exists (select 1 from public.locations l where l.code = v_x ->> 'code'))
                             or (jsonb_typeof(v_x -> 'other') = 'string'
                                 and public.testing_note_is_valid(v_x ->> 'other')
                                 and char_length(public.testing_normalize_note(v_x ->> 'other')) <= 100)), false) then
          return jsonb_build_object('status', 'invalid');
        end if;
      end if;
      if jsonb_typeof(v_day -> 'parts') is distinct from 'array'
         or jsonb_array_length(v_day -> 'parts') not between 1 and 3
         or exists (select 1 from jsonb_array_elements(v_day -> 'parts') as p(value)
                     where jsonb_typeof(p.value) <> 'string'
                        or p.value #>> '{}' not in ('physical', 'technical', 'curriculum'))
         or (select count(distinct p.value) from jsonb_array_elements(v_day -> 'parts') as p(value))
            <> jsonb_array_length(v_day -> 'parts') then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_all_parts := v_all_parts || array(select p.value from jsonb_array_elements_text(v_day -> 'parts') as p(value));
      v_last := greatest(v_last, v_date);
    end loop;

    if v_app > v_last or v_sub > v_last then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- the due dates' shape
    if exists (select 1 from jsonb_array_elements(p_payload -> 'due_dates') as x(value)
                where jsonb_typeof(x.value) <> 'object'
                   or exists (select 1 from jsonb_object_keys(x.value) as k(key)
                               where k.key not in ('cycle_plan_id', 'payment_no', 'due_on', 'follows_application_due'))
                   or jsonb_typeof(x.value -> 'cycle_plan_id') is distinct from 'string'
                   or not pg_input_is_valid(x.value ->> 'cycle_plan_id', 'uuid')
                   or jsonb_typeof(x.value -> 'payment_no') is distinct from 'number'
                   or not pg_input_is_valid(x.value ->> 'payment_no', 'smallint')
                   or jsonb_typeof(x.value -> 'due_on') is distinct from 'string'
                   or not pg_input_is_valid(x.value ->> 'due_on', 'date')
                   or jsonb_typeof(x.value -> 'follows_application_due') is distinct from 'boolean') then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. locks: the cycle, then its days and its due dates in id order
    select * into v_c from public.bb_cycles y where y.id = p_cycle_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.bb_cycle_days d where d.cycle_id = p_cycle_id order by d.id for update;
    perform 1 from public.bb_cycle_plan_payments pp
      join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id
     where pl.cycle_id = p_cycle_id
     order by pp.id
       for update of pp;

    -- 5. the version
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 6. rules that need the saved rows
    -- every day id given is a day of THIS cycle
    if exists (select 1 from unnest(v_ids) as x(id)
                where not exists (select 1 from public.bb_cycle_days d where d.id = x.id and d.cycle_id = p_cycle_id)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- a changed (or new) day date can't be in the past
    for v_day in select d.value from jsonb_array_elements(p_payload -> 'days') as d(value) loop
      v_date := (v_day ->> 'day_date')::date;
      v_old_date := null;
      if jsonb_typeof(v_day -> 'id') = 'string' then
        select d.day_date into v_old_date from public.bb_cycle_days d where d.id = (v_day ->> 'id')::uuid;
      end if;
      if v_date is distinct from v_old_date and v_date < v_today then
        return jsonb_build_object('status', 'invalid');
      end if;
    end loop;
    -- due_dates names every (plan, payment) of this cycle exactly once
    if (select count(*) from jsonb_array_elements(p_payload -> 'due_dates'))
         <> (select count(*) from public.bb_cycle_plan_payments pp
               join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id where pl.cycle_id = p_cycle_id)
       or (select count(distinct ((x.value ->> 'cycle_plan_id')::uuid, (x.value ->> 'payment_no')::smallint))
             from jsonb_array_elements(p_payload -> 'due_dates') as x(value))
          <> jsonb_array_length(p_payload -> 'due_dates')
       or exists (select 1 from jsonb_array_elements(p_payload -> 'due_dates') as x(value)
                   where not exists (select 1 from public.bb_cycle_plan_payments pp
                                       join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id
                                      where pl.cycle_id = p_cycle_id
                                        and pp.cycle_plan_id = (x.value ->> 'cycle_plan_id')::uuid
                                        and pp.payment_no = (x.value ->> 'payment_no')::smallint)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- "follows" only on payment 1; a changed due date can't be in the past
    if exists (select 1 from jsonb_array_elements(p_payload -> 'due_dates') as x(value)
                join public.bb_cycle_plan_payments pp
                  on pp.cycle_plan_id = (x.value ->> 'cycle_plan_id')::uuid
                 and pp.payment_no = (x.value ->> 'payment_no')::smallint
               where ((x.value ->> 'follows_application_due')::boolean and pp.payment_no <> 1)
                  or (case when (x.value ->> 'follows_application_due')::boolean then v_app
                           else (x.value ->> 'due_on')::date end) is distinct from pp.due_on
                     and (case when (x.value ->> 'follows_application_due')::boolean then v_app
                               else (x.value ->> 'due_on')::date end) < v_today) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- every part on at least one day
    v_missing := array(select x.part from unnest(array['physical', 'technical', 'curriculum']) with ordinality as x(part, n)
                        where not (x.part = any (v_all_parts)) order by x.n);
    if cardinality(v_missing) > 0 then
      return jsonb_build_object('status', 'part_without_day', 'parts', to_jsonb(v_missing));
    end if;

    -- 7. the name
    if exists (select 1 from public.bb_cycles y
                where y.id <> p_cycle_id and lower(public.testing_normalize_name(y.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write
    perform set_config('tkd.action', 'bb_update_cycle', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_cycles y
       set name            = v_name,
           application_due = v_app,
           submissions_due = v_sub,
           auto_close      = v_auto
     where y.id = p_cycle_id
       and (y.name is distinct from v_name or y.application_due is distinct from v_app
            or y.submissions_due is distinct from v_sub or y.auto_close is distinct from v_auto);
    get diagnostics v_rows = row_count;
    v_cycle_done := v_rows > 0;

    -- days no longer in the list go, with their parts
    delete from public.bb_cycle_days d
     where d.cycle_id = p_cycle_id and not (d.id = any (v_ids));
    get diagnostics v_rows = row_count;
    v_changed := v_changed or v_rows > 0;

    for v_day in select d.value from jsonb_array_elements(p_payload -> 'days') as d(value) loop
      v_sec := case when jsonb_typeof(v_day -> 'second') = 'object' then v_day -> 'second' end;
      if jsonb_typeof(v_day -> 'id') = 'string' then
        v_day_id := (v_day ->> 'id')::uuid;
        update public.bb_cycle_days d
           set name               = public.testing_normalize_name(v_day ->> 'name'),
               day_date           = (v_day ->> 'day_date')::date,
               start_time         = (v_day ->> 'start_time')::time,
               end_time           = (v_day ->> 'end_time')::time,
               place_code         = v_day -> 'place' ->> 'code',
               place_other        = public.testing_normalize_note(v_day -> 'place' ->> 'other'),
               second_start       = (v_sec ->> 'start')::time,
               second_end         = (v_sec ->> 'end')::time,
               second_place_code  = v_sec -> 'place' ->> 'code',
               second_place_other = public.testing_normalize_note(v_sec -> 'place' ->> 'other')
         where d.id = v_day_id
           and (d.name is distinct from public.testing_normalize_name(v_day ->> 'name')
                or d.day_date is distinct from (v_day ->> 'day_date')::date
                or d.start_time is distinct from (v_day ->> 'start_time')::time
                or d.end_time is distinct from (v_day ->> 'end_time')::time
                or d.place_code is distinct from (v_day -> 'place' ->> 'code')
                or d.place_other is distinct from public.testing_normalize_note(v_day -> 'place' ->> 'other')
                or d.second_start is distinct from (v_sec ->> 'start')::time
                or d.second_end is distinct from (v_sec ->> 'end')::time
                or d.second_place_code is distinct from (v_sec -> 'place' ->> 'code')
                or d.second_place_other is distinct from public.testing_normalize_note(v_sec -> 'place' ->> 'other'));
        get diagnostics v_rows = row_count;
        v_changed := v_changed or v_rows > 0;
        -- the parts, by difference
        delete from public.bb_cycle_day_parts p
         where p.day_id = v_day_id
           and not (p.part = any (array(select x.value from jsonb_array_elements_text(v_day -> 'parts') as x(value))));
        get diagnostics v_rows = row_count;
        v_changed := v_changed or v_rows > 0;
      else
        insert into public.bb_cycle_days
          (cycle_id, name, day_date, start_time, end_time, place_code, place_other,
           second_start, second_end, second_place_code, second_place_other, created_by_name, updated_by_name)
        values
          (p_cycle_id, public.testing_normalize_name(v_day ->> 'name'), (v_day ->> 'day_date')::date,
           (v_day ->> 'start_time')::time, (v_day ->> 'end_time')::time,
           v_day -> 'place' ->> 'code', public.testing_normalize_note(v_day -> 'place' ->> 'other'),
           (v_sec ->> 'start')::time, (v_sec ->> 'end')::time,
           v_sec -> 'place' ->> 'code', public.testing_normalize_note(v_sec -> 'place' ->> 'other'), '', '')
        returning id into v_day_id;
        v_changed := true;
      end if;
      insert into public.bb_cycle_day_parts (day_id, part, created_by_name)
      select v_day_id, x.value, ''
        from jsonb_array_elements_text(v_day -> 'parts') with ordinality as x(value, n)
       where not exists (select 1 from public.bb_cycle_day_parts p where p.day_id = v_day_id and p.part = x.value)
       order by x.n;
      get diagnostics v_rows = row_count;
      v_changed := v_changed or v_rows > 0;
    end loop;

    -- the due dates ("follows" keeps payment 1 on Application due)
    update public.bb_cycle_plan_payments pp
       set due_on                  = case when (x.value ->> 'follows_application_due')::boolean then v_app
                                          else (x.value ->> 'due_on')::date end,
           follows_application_due = (x.value ->> 'follows_application_due')::boolean
      from jsonb_array_elements(p_payload -> 'due_dates') as x(value)
     where pp.cycle_plan_id = (x.value ->> 'cycle_plan_id')::uuid
       and pp.payment_no = (x.value ->> 'payment_no')::smallint
       and (pp.due_on is distinct from (case when (x.value ->> 'follows_application_due')::boolean then v_app
                                             else (x.value ->> 'due_on')::date end)
            or pp.follows_application_due is distinct from (x.value ->> 'follows_application_due')::boolean);
    get diagnostics v_rows = row_count;
    v_changed := v_changed or v_rows > 0;

    -- one version bump for the whole save: the cycle row's own change did
    -- it already; otherwise ask for it on purpose (11a)
    if v_changed and not v_cycle_done then
      update public.bb_cycles y set version = y.version + 1 where y.id = p_cycle_id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select y.version into v_version from public.bb_cycles y where y.id = p_cycle_id;
    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_update_cycle(uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.bb_update_cycle(uuid, integer, jsonb) to authenticated;

-- 15e. bb_set_registration(p_cycle_id, p_expected_version, p_open)   S / A
-- The Open / Closed switch, as 0006's star_set_registration (v0.85, v0.86,
-- v0.210):
--   close: staff and admins, any time before the cycle is Past
--   open, Application due not passed (or auto close off): staff and
--     admins; the first opening sets first_opened_at
--   open AFTER Application due with auto close on: admins only, and auto
--     close is turned off; staff -> not_allowed
--   once Past nothing changes the switch -> finished
--   opening while the current waiver is the seeded PLACEHOLDER ->
--     waiver_needed (contract 14 OI-1: "Save the school's waiver on Rubric
--     and prices first.")
-- Switching to what it already is writes nothing.
-- locks: cycle (update) -> its days in id order (update) -> its due dates in id order (update)
-- Ok: {"status":"ok","version":n,"state":{...10b...}}
create or replace function public.bb_set_registration(
  p_cycle_id         uuid,
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
  v_c          public.bb_cycles;
  v_state      jsonb;
  v_clear      boolean := false;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    -- 2. role: any staff member with data access (the admin-only case is below)

    if p_cycle_id is null or p_expected_version is null or p_open is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_c from public.bb_cycles y where y.id = p_cycle_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.bb_cycle_days d where d.cycle_id = p_cycle_id order by d.id for update;
    perform 1 from public.bb_cycle_plan_payments pp
      join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id
     where pl.cycle_id = p_cycle_id
     order by pp.id
       for update of pp;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    v_today := public.testing_today();
    v_state := public.bb_cycle_state(p_cycle_id, v_today);
    if (v_state ->> 'past')::boolean then
      return jsonb_build_object('status', 'finished');
    end if;
    if p_open and exists (select 1 from public.bb_waiver_versions v where v.superseded_at is null and v.is_placeholder) then
      return jsonb_build_object('status', 'waiver_needed');
    end if;
    if p_open and v_c.auto_close and v_today > v_c.application_due then
      if public.is_admin() is not true then
        return jsonb_build_object('status', 'not_allowed');
      end if;
      v_clear := true;
    end if;

    perform set_config('tkd.action', 'bb_set_registration', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_cycles y
       set registration_open = p_open,
           first_opened_at   = case when p_open then coalesce(y.first_opened_at, now()) else y.first_opened_at end,
           auto_close        = case when v_clear then false else y.auto_close end
     where y.id = p_cycle_id
       and (y.registration_open is distinct from p_open or v_clear);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select * into v_c from public.bb_cycles y where y.id = p_cycle_id;
    return jsonb_build_object('status', 'ok', 'version', v_c.version,
                              'state', public.bb_cycle_state(p_cycle_id, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_set_registration(uuid, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.bb_set_registration(uuid, integer, boolean) to authenticated;

-- 15f. bb_delete_cycle(p_cycle_id, p_expected_version,
--        p_expected_candidate_count)   A
-- Removes a cycle with its days, parts, prices, due dates and candidates
-- (and their paper waivers): "on delete cascade" takes them; every removed
-- row is in the history, tagged bb_delete_cycle, one batch.
-- p_expected_candidate_count = ALL candidates (withdrawn too) the
-- confirmation dialog counted; if it differs now, nothing is removed:
-- stale. Refused once the cycle has ANY payment row, even an undone one
-- (has_payments, v0.904), or any waiver signed on the form (has_waivers,
-- S15: a signed waiver is a legal record).
-- locks: cycle (update) -> its candidates in id order (update)
-- Ok: {"status":"ok"}
create or replace function public.bb_delete_cycle(
  p_cycle_id                 uuid,
  p_expected_version         integer,
  p_expected_candidate_count integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_version    integer;
  v_count      integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_cycle_id is null or p_expected_version is null or p_expected_candidate_count is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select y.version into v_version from public.bb_cycles y where y.id = p_cycle_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.bb_candidates c where c.cycle_id = p_cycle_id order by c.id for update;

    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    select count(*) into v_count from public.bb_candidates c where c.cycle_id = p_cycle_id;
    if v_count <> p_expected_candidate_count then
      return jsonb_build_object('status', 'stale');
    end if;

    if exists (select 1 from public.bb_payments p where p.cycle_id = p_cycle_id) then
      return jsonb_build_object('status', 'has_payments');
    end if;
    if exists (select 1 from public.bb_candidate_waivers w
                 join public.bb_candidates c on c.id = w.candidate_id
                where c.cycle_id = p_cycle_id and w.how = 'drawn') then
      return jsonb_build_object('status', 'has_waivers');
    end if;

    perform set_config('tkd.action', 'bb_delete_cycle', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.bb_cycles y where y.id = p_cycle_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      -- defence in depth behind the check above: a payment row points here
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint like 'bb\_payments\_%' then
        return jsonb_build_object('status', 'has_payments');
      end if;
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_delete_cycle(uuid, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_delete_cycle(uuid, integer, integer) to authenticated;

-- 15g. bb_add_candidate(p_cycle_id, p_first, p_last, p_date_of_birth,
--        p_email, p_location_code, p_dan, p_cycle_plan_id, p_kukkiwon,
--        p_paper_waiver)   S
-- New candidate at the desk (walk-ins and late families; v0.212: works
-- while registration is closed, in every state except Past). Source
-- 'desk', a BB- reference from the same counter as the form.
--   p_date_of_birth  required (S5), not in the future, not before 1900
--   p_email          required, trimmed, stored as typed
--   p_location_code  a school; p_dan 1-4; p_cycle_plan_id a plan of THIS
--                    cycle; p_kukkiwon yes / no (chosen today)
--   p_paper_waiver   must be true: "Waiver signed on paper" is ticked
--                    (v0.900: Add is refused until the tick). A paper
--                    waiver row is written (the current waiver version,
--                    under 18 on the first testing day or not, ticked by
--                    the caller).
-- A same-name + same-DOB candidate in the cycle marks both "possible
-- duplicate". Last step: the purge (13f).
-- locks: cycle (no key update)
-- Ok: {"status":"ok","id":...,"reference":"BB-5001","version":1}
create or replace function public.bb_add_candidate(
  p_cycle_id      uuid,
  p_first         text,
  p_last          text,
  p_date_of_birth date,
  p_email         text,
  p_location_code text,
  p_dan           integer,
  p_cycle_plan_id uuid,
  p_kukkiwon      boolean,
  p_paper_waiver  boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_email      text;
  v_state      jsonb;
  v_version_id uuid;
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

    v_today := public.testing_today();
    v_email := btrim(p_email);
    if p_cycle_id is null
       or not public.testing_name_is_valid(p_first)
       or not public.testing_name_is_valid(p_last)
       or p_date_of_birth is null or p_date_of_birth > v_today or p_date_of_birth < date '1900-01-01'
       or not public.bb_email_is_valid(v_email)
       or p_location_code is null
       or not exists (select 1 from public.locations l where l.code = p_location_code)
       or p_dan is null or p_dan not between 1 and 4
       or p_cycle_plan_id is null
       or p_kukkiwon is null
       or p_paper_waiver is not true then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform 1 from public.bb_cycles y where y.id = p_cycle_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    v_state := public.bb_cycle_state(p_cycle_id, v_today);
    if (v_state ->> 'past')::boolean then
      return jsonb_build_object('status', 'finished');
    end if;
    if not exists (select 1 from public.bb_cycle_plans pl where pl.id = p_cycle_plan_id and pl.cycle_id = p_cycle_id) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select v.id into v_version_id from public.bb_waiver_versions v where v.superseded_at is null;
    if not found then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'bb_add_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    v_dup := public.bb_find_duplicate(p_cycle_id, null, p_first, p_last, p_date_of_birth);
    insert into public.bb_candidates
      (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan, cycle_plan_id,
       kukkiwon, kukkiwon_added_on, source, reference, duplicate_state, duplicate_of, created_by_name, updated_by_name)
    values
      (p_cycle_id, public.testing_normalize_name(p_first), public.testing_normalize_name(p_last), p_date_of_birth,
       v_email, p_location_code, p_dan, p_cycle_plan_id, p_kukkiwon, case when p_kukkiwon then v_today end, 'desk',
       'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text,
       case when v_dup is null then 'none' else 'possible' end, v_dup, '', '')
    returning id, reference, version into v_id, v_reference, v_version;

    insert into public.bb_candidate_waivers
      (candidate_id, waiver_version_id, how, submission_id, acknowledged, signed_as_minor, signer_name, signature,
       ticked_by_name, signed_at, created_by_name, updated_by_name)
    values
      (v_id, v_version_id, 'paper', null, true,
       coalesce(public.bb_age_on(p_date_of_birth, (v_state ->> 'first_day')::date) < 18, false),
       null, null, public.change_log_actor_name(), now(), '', '');

    -- both rows show the pair: the matching row is worked out again too
    if v_dup is not null then
      perform public.bb_recheck_duplicate(v_dup);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.bb_purge_due();

    return jsonb_build_object('status', 'ok', 'id', v_id, 'reference', v_reference, 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_add_candidate(uuid, text, text, date, text, text, integer, uuid, boolean, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.bb_add_candidate(uuid, text, text, date, text, text, integer, uuid, boolean, boolean) to authenticated;

-- 15h. bb_update_candidate(p_candidate_id, p_expected_version, p_first,
--        p_last, p_date_of_birth, p_email, p_location_code, p_dan)
--        S; a Dan change when the candidate has a payment: A (S8)
-- Edit details. DOB and email are required - except after the purge,
-- when both must stay empty (they can't be put back: invalid). A school
-- change moves the candidate only: recorded payments keep the school they
-- were recorded under (v0.903). Allowed for withdrawn candidates (as
-- Star). The version goes up when anything changed (also a DOB or email
-- fix); the same values write nothing. A name or DOB change works the
-- possible-duplicate marks out again (both sides).
-- "Has a payment" = at least one payment row that wasn't undone.
-- needs_parent_signature: the candidate is under 18 on the cycle's first
-- testing day but the newest waiver was signed as an adult (e.g. after a
-- DOB fix) - the desk then gets a parent's paper waiver signed.
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n,"needs_parent_signature":true|false}
create or replace function public.bb_update_candidate(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_first            text,
  p_last             text,
  p_date_of_birth    date,
  p_email            text,
  p_location_code    text,
  p_dan              integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_first      text;
  v_last       text;
  v_email      text;
  v_c          public.bb_candidates;
  v_rows       integer;
  v_of         uuid;
  v_version    integer;
  v_needs      boolean;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    v_today := public.testing_today();
    v_first := public.testing_normalize_name(p_first);
    v_last  := public.testing_normalize_name(p_last);
    v_email := btrim(p_email);
    if p_candidate_id is null or p_expected_version is null
       or not public.testing_name_is_valid(p_first)
       or not public.testing_name_is_valid(p_last)
       or ((p_date_of_birth is null) <> (p_email is null))
       or (p_date_of_birth is not null
           and (p_date_of_birth > v_today or p_date_of_birth < date '1900-01-01' or not public.bb_email_is_valid(v_email)))
       or p_location_code is null
       or not exists (select 1 from public.locations l where l.code = p_location_code)
       or p_dan is null or p_dan not between 1 and 4 then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 6. rules that depend on the saved row
    if (v_c.personal_removed_at is not null) <> (p_date_of_birth is null) then
      return jsonb_build_object('status', 'invalid');   -- purged: must stay empty; not purged: required
    end if;
    if p_dan <> v_c.dan and public.is_admin() is not true
       and exists (select 1 from public.bb_payments p
                    where p.candidate_id = v_c.id and p.kind = 'payment'
                      and not exists (select 1 from public.bb_payments r
                                       where r.reverses_payment_id = p.id and r.kind = 'reversal')) then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    perform set_config('tkd.action', 'bb_update_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- version + 1 on purpose: a DOB or email fix alone would not bump it
    -- (they are no-bump columns for the purge, 11a)
    update public.bb_candidates c
       set first_name        = v_first,
           last_name         = v_last,
           date_of_birth     = p_date_of_birth,
           email_for_results = v_email,
           location_code     = p_location_code,
           dan               = p_dan,
           version           = c.version + 1
     where c.id = v_c.id
       and (c.first_name is distinct from v_first
            or c.last_name is distinct from v_last
            or c.date_of_birth is distinct from p_date_of_birth
            or c.email_for_results is distinct from v_email
            or c.location_code is distinct from p_location_code
            or c.dan is distinct from p_dan);
    get diagnostics v_rows = row_count;

    if v_rows > 0 and (v_first is distinct from v_c.first_name or v_last is distinct from v_c.last_name
                       or p_date_of_birth is distinct from v_c.date_of_birth) then
      perform public.bb_recheck_duplicate(v_c.id);
      select c.duplicate_of into v_of from public.bb_candidates c where c.id = v_c.id;
      if v_of is not null then
        perform public.bb_recheck_duplicate(v_of);
      end if;
      perform public.bb_recheck_pointing_at(v_c.id);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version,
           coalesce(public.bb_age_on(c.date_of_birth,
                                     (select min(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id)) < 18
                    and not (select w.signed_as_minor from public.bb_candidate_waivers w
                              where w.candidate_id = c.id order by w.signed_at desc, w.id desc limit 1), false)
      into v_version, v_needs
      from public.bb_candidates c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version, 'needs_parent_signature', v_needs);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_update_candidate(uuid, integer, text, text, date, text, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_update_candidate(uuid, integer, text, text, date, text, text, integer) to authenticated;

-- 15i. bb_change_plan(p_candidate_id, p_expected_version, p_cycle_plan_id,
--        p_kukkiwon)   S before a payment; A after (v0.210)
-- Change plan or Kukkiwon. The plan must be one of the candidate's cycle.
-- Kukkiwon newly chosen -> due today (kukkiwon_added_on = today); taken
-- off -> cleared. Recorded payments never change (v0.217): the money is
-- worked out again (10d). Refused: withdrawn (withdrawn), purged
-- (invalid), staff once the candidate has a payment (not_allowed). The
-- same values write nothing.
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n,"money":{...10d...}}
create or replace function public.bb_change_plan(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_cycle_plan_id    uuid,
  p_kukkiwon         boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_c          public.bb_candidates;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_version is null or p_cycle_plan_id is null or p_kukkiwon is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if v_c.personal_removed_at is not null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.bb_cycle_plans pl where pl.id = p_cycle_plan_id and pl.cycle_id = v_c.cycle_id) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if public.is_admin() is not true
       and exists (select 1 from public.bb_payments p
                    where p.candidate_id = v_c.id and p.kind = 'payment'
                      and not exists (select 1 from public.bb_payments r
                                       where r.reverses_payment_id = p.id and r.kind = 'reversal')) then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    v_today := public.testing_today();
    perform set_config('tkd.action', 'bb_change_plan', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_candidates c
       set cycle_plan_id     = p_cycle_plan_id,
           kukkiwon          = p_kukkiwon,
           kukkiwon_added_on = case when not p_kukkiwon then null
                                    when c.kukkiwon then c.kukkiwon_added_on
                                    else v_today end
     where c.id = v_c.id
       and (c.cycle_plan_id is distinct from p_cycle_plan_id or c.kukkiwon is distinct from p_kukkiwon);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_version from public.bb_candidates c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version,
                              'money', public.bb_candidate_money(v_c.id, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_change_plan(uuid, integer, uuid, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.bb_change_plan(uuid, integer, uuid, boolean) to authenticated;

-- 15j. bb_resolve_duplicate(p_keep_id, p_keep_version, p_other_id,
--        p_other_version, p_keep_both)   S
-- The "Possible duplicate" choice, exactly 0006's star_resolve_duplicate
-- with the cycle in place of the event:
--   p_keep_both true  -> both rows are marked "kept both" (pointing at each
--                        other) and stay
--   p_keep_both false -> "Keep this one": the other is withdrawn with the
--                        reason duplicate_copy (it can be restored), and
--                        the marks are worked out again
-- Refused: the same id twice or different cycles (invalid); either one
-- purged (invalid); either one withdrawn (withdrawn); the pair is no
-- longer marked (stale).
-- locks: cycle (no key update) -> both candidates in id order (update)
-- Ok: {"status":"ok","keep_version":n,"other_version":n}
create or replace function public.bb_resolve_duplicate(
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
  v_cycle_id   uuid;
  v_other_cy   uuid;
  v_keep       public.bb_candidates;
  v_other      public.bb_candidates;
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

    select c.cycle_id into v_cycle_id from public.bb_candidates c where c.id = p_keep_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    select c.cycle_id into v_other_cy from public.bb_candidates c where c.id = p_other_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_other_cy <> v_cycle_id then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform 1 from public.bb_cycles y where y.id = v_cycle_id for no key update;
    perform 1 from public.bb_candidates c where c.id in (p_keep_id, p_other_id) order by c.id for update;
    select * into v_keep  from public.bb_candidates c where c.id = p_keep_id;
    select * into v_other from public.bb_candidates c where c.id = p_other_id;
    if v_keep.id is null or v_other.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_keep.version <> p_keep_version or v_other.version <> p_other_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_keep.personal_removed_at is not null or v_other.personal_removed_at is not null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if v_keep.status <> 'active' or v_other.status <> 'active' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if not ((v_keep.duplicate_state = 'possible' and v_keep.duplicate_of = p_other_id)
            or (v_other.duplicate_state = 'possible' and v_other.duplicate_of = p_keep_id)) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'bb_resolve_duplicate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_keep_both then
      update public.bb_candidates c
         set duplicate_state = 'kept_both',
             duplicate_of    = case when c.id = p_keep_id then p_other_id else p_keep_id end
       where c.id in (p_keep_id, p_other_id);
    else
      update public.bb_candidates c
         set status            = 'withdrawn',
             withdrawn_reason  = 'duplicate_copy',
             withdrawn_at      = now(),
             withdrawn_by_name = public.change_log_actor_name(),
             withdrawn_by      = auth.uid(),
             duplicate_state   = 'none',
             duplicate_of      = null
       where c.id = p_other_id;
      perform public.bb_recheck_duplicate(p_keep_id);
      perform public.bb_recheck_pointing_at(p_other_id);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok',
                              'keep_version', (select c.version from public.bb_candidates c where c.id = p_keep_id),
                              'other_version', (select c.version from public.bb_candidates c where c.id = p_other_id));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_resolve_duplicate(uuid, integer, uuid, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.bb_resolve_duplicate(uuid, integer, uuid, integer, boolean) to authenticated;

-- 15k. bb_withdraw_candidate(p_candidate_id, p_expected_version)   A
-- Withdraw: the candidate moves to the Removed group; payments and the
-- waiver stay. Already withdrawn -> withdrawn. Candidates marked as its
-- possible duplicate are checked again.
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.bb_withdraw_candidate(
  p_candidate_id     uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.bb_candidates;
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

    if p_candidate_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    perform set_config('tkd.action', 'bb_withdraw_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_candidates c
       set status            = 'withdrawn',
           withdrawn_reason  = 'withdrawn',
           withdrawn_at      = now(),
           withdrawn_by_name = public.change_log_actor_name(),
           withdrawn_by      = auth.uid(),
           duplicate_state   = 'none',
           duplicate_of      = null
     where c.id = v_c.id;
    perform public.bb_recheck_pointing_at(v_c.id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_version from public.bb_candidates c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_withdraw_candidate(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_withdraw_candidate(uuid, integer) to authenticated;

-- 15l. bb_restore_candidate(p_candidate_id, p_expected_version)
--        A, or S for their own "keep one" less than 10 seconds ago
-- Back to active; the duplicate marks are worked out again for it, its
-- new partner and anyone pointing at it. Who may (as 0006's 18s): the
-- staff member who withdrew it with "keep one" (duplicate_copy,
-- withdrawn_by = the caller) less than 10 seconds ago - the toast's Undo;
-- otherwise admins only, at any time (not_allowed). Not withdrawn -> stale.
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.bb_restore_candidate(
  p_candidate_id     uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.bb_candidates;
  v_of         uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if public.is_admin() is not true
       and not coalesce(v_c.status = 'withdrawn'
                        and v_c.withdrawn_reason = 'duplicate_copy'
                        and v_c.withdrawn_by = auth.uid()
                        and v_c.withdrawn_at > now() - interval '10 seconds', false) then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_c.status <> 'withdrawn' then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'bb_restore_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_candidates c
       set status            = 'active',
           withdrawn_reason  = null,
           withdrawn_at      = null,
           withdrawn_by_name = null,
           withdrawn_by      = null
     where c.id = v_c.id;
    perform public.bb_recheck_duplicate(v_c.id);
    select c.duplicate_of into v_of from public.bb_candidates c where c.id = v_c.id;
    if v_of is not null then
      perform public.bb_recheck_duplicate(v_of);
    end if;
    perform public.bb_recheck_pointing_at(v_c.id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_version from public.bb_candidates c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_restore_candidate(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_restore_candidate(uuid, integer) to authenticated;

-- 15m. bb_delete_candidate(p_candidate_id, p_expected_version)   A
-- Delete permanently (e.g. a fake form registration, v0.212): the
-- candidate and its waivers (drawn or paper, contract 14 OI-8) go; every
-- removed row is in the history, masked (11i, 11k). Refused once the
-- candidate has ANY payment row, even an undone one (has_payments,
-- v0.904: "[Name] has payment records, so they can't be deleted.
-- Withdraw them instead."). Candidates marked as its possible duplicate
-- are checked again.
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok"}
create or replace function public.bb_delete_candidate(
  p_candidate_id     uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.bb_candidates;
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

    if p_candidate_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if exists (select 1 from public.bb_payments p where p.candidate_id = v_c.id) then
      return jsonb_build_object('status', 'has_payments');
    end if;

    v_pointing := array(select c.id from public.bb_candidates c where c.duplicate_of = v_c.id order by c.id);

    perform set_config('tkd.action', 'bb_delete_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.bb_candidates c where c.id = v_c.id;

    foreach v_id in array v_pointing loop
      perform public.bb_recheck_duplicate(v_id);
    end loop;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      -- defence in depth behind the check above: a payment row points here
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint like 'bb\_payments\_%' then
        return jsonb_build_object('status', 'has_payments');
      end if;
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_delete_candidate(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_delete_candidate(uuid, integer) to authenticated;

-- 15n. bb_record_paper_waiver(p_candidate_id, p_expected_version)   S
-- "Waiver signed on paper" ticked inside the "Needs a parent's or
-- guardian's signature" warning (contract 14 OI-2): a NEW paper waiver
-- row (the current waiver version, under 18 on the first testing day or
-- not as of now, ticked by the caller); the candidate's version goes up.
-- Refused: purged (no DOB to work out the age: invalid); the cycle is
-- Past (finished).
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n,"needs_parent_signature":true|false}
create or replace function public.bb_record_paper_waiver(
  p_candidate_id     uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.bb_candidates;
  v_state      jsonb;
  v_version_id uuid;
  v_version    integer;
  v_needs      boolean;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.personal_removed_at is not null then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_state := public.bb_cycle_state(v_c.cycle_id, public.testing_today());
    if (v_state ->> 'past')::boolean then
      return jsonb_build_object('status', 'finished');
    end if;
    select v.id into v_version_id from public.bb_waiver_versions v where v.superseded_at is null;
    if not found then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'bb_record_paper_waiver', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.bb_candidate_waivers
      (candidate_id, waiver_version_id, how, submission_id, acknowledged, signed_as_minor, signer_name, signature,
       ticked_by_name, signed_at, created_by_name, updated_by_name)
    values
      (v_c.id, v_version_id, 'paper', null, true,
       coalesce(public.bb_age_on(v_c.date_of_birth, (v_state ->> 'first_day')::date) < 18, false),
       null, null, public.change_log_actor_name(), now(), '', '');

    update public.bb_candidates c set version = c.version + 1 where c.id = v_c.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version,
           coalesce(public.bb_age_on(c.date_of_birth,
                                     (select min(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id)) < 18
                    and not (select w.signed_as_minor from public.bb_candidate_waivers w
                              where w.candidate_id = c.id order by w.signed_at desc, w.id desc limit 1), false)
      into v_version, v_needs
      from public.bb_candidates c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version, 'needs_parent_signature', v_needs);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_record_paper_waiver(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_record_paper_waiver(uuid, integer) to authenticated;

-- Payments (v0.210, v0.218, v0.900, v0.903, v0.904, S1-S3). Every payment
-- function: lock (contract 1.5); after writing, the candidate's version
-- goes up (a double click with the old version gets "stale"); the answer
-- carries the new money picture (10d). Every row stores the school and the
-- cycle name of the moment it is recorded (v0.903); a correction copies
-- them from the row it corrects. Amounts are entered positive; refunds and
-- returned checks are stored negative.

-- 15o. bb_record_payment(p_candidate_id, p_expected_version,
--        p_amount_cents, p_method, p_for_items, p_note)   S
-- Record payment (v0.218): any amount from 1 cent to $5,000 (staff may
-- type any amount, v0.900), cash / check / card, for the ticked items
-- (p1 ... p12, kukkiwon - each of the candidate's CURRENT plan, kukkiwon
-- only when chosen), an optional note (e.g. "post-dated Apr 24"). It
-- counts today (paid_on = today, even a post-dated check, v0.218).
-- Refused: a withdrawn candidate (withdrawn, S2). Last step: the purge.
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n,"money":{...}}
create or replace function public.bb_record_payment(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_amount_cents     integer,
  p_method           text,
  p_for_items        text[],
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
  v_note       text;
  v_c          public.bb_candidates;
  v_cycle_name text;
  v_payment_id uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    v_note := public.testing_normalize_note(p_note);
    if p_candidate_id is null or p_expected_version is null
       or p_amount_cents is null or p_amount_cents not between 1 and 500000
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_for_items is null or coalesce(array_ndims(p_for_items), 0) <> 1
       or cardinality(p_for_items) not between 1 and 13
       or array_position(p_for_items, null) is not null
       or exists (select 1 from unnest(p_for_items) as x(item) where x.item !~ '^(p([1-9]|1[0-2])|kukkiwon)$')
       or (select count(distinct x.item) from unnest(p_for_items) as x(item)) <> cardinality(p_for_items)
       or (v_note is not null and not public.testing_note_is_valid(v_note)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    -- every ticked item is one the candidate owes under the CURRENT plan
    if exists (select 1 from unnest(p_for_items) as x(item)
                where not exists (select 1 from public.bb_candidate_items(v_c.id) as i where i.item = x.item)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_today := public.testing_today();
    select y.name into v_cycle_name from public.bb_cycles y where y.id = v_c.cycle_id;

    perform set_config('tkd.action', 'bb_record_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.bb_payments
      (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason,
       location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, v_c.cycle_id, 'payment', p_amount_cents, p_method, v_today, p_for_items, v_note, null,
       v_c.location_code, v_cycle_name, now(), auth.uid(), public.change_log_actor_name())
    returning id into v_payment_id;

    update public.bb_candidates c set version = c.version + 1 where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.bb_purge_due();

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'version', v_version,
                              'money', public.bb_candidate_money(v_c.id, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_record_payment(uuid, integer, integer, text, text[], text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_record_payment(uuid, integer, integer, text, text[], text) to authenticated;

-- 15p. bb_undo_payment(p_payment_id)   S (own row, within 10 s) / A
-- Writes a reversal of a payment, a refund or a returned-check mark (the
-- toast's Undo of Record payment / Record refund / Mark check returned;
-- the row stays, the two add up to 0). Who may: the staff member who
-- recorded it less than 10 seconds ago (the server allows 10 s for the
-- 5-second toast); otherwise admins only (not_allowed).
-- Refused: a reversal (invalid); already undone (stale); a payment whose
-- check is marked returned (invalid: undo the returned mark first); an
-- undo that would take the net below zero, e.g. a payment under a refund
-- (invalid). Allowed on withdrawn candidates.
-- locks: cycle (no key update) -> candidate (update) -> payment (update)
-- Ok: {"status":"ok","version":n,"money":{...}}
create or replace function public.bb_undo_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_p          public.bb_payments;
  v_net        bigint;
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

    v_p := public.bb_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if not (v_p.recorded_by is not distinct from auth.uid() and v_p.recorded_at > now() - interval '10 seconds')
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_p.kind = 'reversal' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.bb_payments x where x.reverses_payment_id = v_p.id and x.kind = 'reversal') then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_p.kind = 'payment'
       and exists (select 1 from public.bb_payments t
                    where t.reverses_payment_id = v_p.id and t.kind = 'returned'
                      and not exists (select 1 from public.bb_payments u
                                       where u.reverses_payment_id = t.id and u.kind = 'reversal')) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select coalesce(sum(p.amount_cents), 0)::bigint into v_net
      from public.bb_payments p where p.candidate_id = v_p.candidate_id;
    if -v_p.amount_cents < 0 and v_net - v_p.amount_cents < 0 then
      return jsonb_build_object('status', 'invalid');   -- the net floor (11l) would refuse it
    end if;

    v_today := public.testing_today();
    perform set_config('tkd.action', 'bb_undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.bb_payments
      (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason,
       location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
    values
      (v_p.candidate_id, v_p.cycle_id, 'reversal', -v_p.amount_cents, v_p.method, v_today, null, null, null,
       v_p.location_code, v_p.cycle_name, now(), auth.uid(), public.change_log_actor_name(), v_p.id);

    update public.bb_candidates c set version = c.version + 1 where c.id = v_p.candidate_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version,
                              'money', public.bb_candidate_money(v_p.candidate_id, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_undo_payment(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_undo_payment(uuid) to authenticated;

-- 15q. bb_edit_payment(p_payment_id, p_amount_cents, p_method,
--        p_for_items, p_note, p_reason)   A
-- Edit payment = a REVERSAL of the old payment + a NEW payment, in this
-- one transaction, both with recorded_at = now() and recorded_by = the
-- editing admin, both carrying the required reason - exactly the pair
-- Finance recognises as an edit (0011 3a). The new row keeps the old row's
-- date, school and cycle name (v0.900: "the date stays"); the original
-- row keeps its first recorder in the history.
-- Refused: not a payment (invalid); already undone, edited away or its
-- check marked returned (stale); a withdrawn candidate (withdrawn); the
-- candidate has a refund that isn't undone (invalid, S2 as 0006); an item
-- not in the current plan (invalid).
-- locks: cycle (no key update) -> candidate (update) -> payment (update)
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n,"money":{...}}
create or replace function public.bb_edit_payment(
  p_payment_id   uuid,
  p_amount_cents integer,
  p_method       text,
  p_for_items    text[],
  p_note         text,
  p_reason       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_note       text;
  v_reason     text;
  v_p          public.bb_payments;
  v_status     text;
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

    v_note   := public.testing_normalize_note(p_note);
    v_reason := public.testing_normalize_note(p_reason);
    if p_payment_id is null
       or p_amount_cents is null or p_amount_cents not between 1 and 500000
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_for_items is null or coalesce(array_ndims(p_for_items), 0) <> 1
       or cardinality(p_for_items) not between 1 and 13
       or array_position(p_for_items, null) is not null
       or exists (select 1 from unnest(p_for_items) as x(item) where x.item !~ '^(p([1-9]|1[0-2])|kukkiwon)$')
       or (select count(distinct x.item) from unnest(p_for_items) as x(item)) <> cardinality(p_for_items)
       or (v_note is not null and not public.testing_note_is_valid(v_note))
       or v_reason is null or not public.testing_note_is_valid(v_reason) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.bb_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.bb_payments x where x.reverses_payment_id = v_p.id and x.kind = 'reversal')
       or exists (select 1 from public.bb_payments t
                   where t.reverses_payment_id = v_p.id and t.kind = 'returned'
                     and not exists (select 1 from public.bb_payments u
                                      where u.reverses_payment_id = t.id and u.kind = 'reversal')) then
      return jsonb_build_object('status', 'stale');
    end if;
    select c.status into v_status from public.bb_candidates c where c.id = v_p.candidate_id;
    if v_status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if exists (select 1 from public.bb_payments r
                where r.candidate_id = v_p.candidate_id and r.kind = 'refund'
                  and not exists (select 1 from public.bb_payments x where x.reverses_payment_id = r.id and x.kind = 'reversal')) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from unnest(p_for_items) as x(item)
                where not exists (select 1 from public.bb_candidate_items(v_p.candidate_id) as i where i.item = x.item)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_today := public.testing_today();
    perform set_config('tkd.action', 'bb_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.bb_payments
      (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason,
       location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
    values
      (v_p.candidate_id, v_p.cycle_id, 'reversal', -v_p.amount_cents, v_p.method, v_today, null, null, v_reason,
       v_p.location_code, v_p.cycle_name, now(), auth.uid(), public.change_log_actor_name(), v_p.id);

    insert into public.bb_payments
      (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason,
       location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
    values
      (v_p.candidate_id, v_p.cycle_id, 'payment', p_amount_cents, p_method, v_p.paid_on, p_for_items, v_note, v_reason,
       v_p.location_code, v_p.cycle_name, now(), auth.uid(), public.change_log_actor_name())
    returning id into v_new_id;

    update public.bb_candidates c set version = c.version + 1 where c.id = v_p.candidate_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_new_id, 'version', v_version,
                              'money', public.bb_candidate_money(v_p.candidate_id, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_edit_payment(uuid, integer, text, text[], text, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_edit_payment(uuid, integer, text, text[], text, text) to authenticated;

-- 15r. bb_record_refund(p_candidate_id, p_expected_version, p_amount_cents,
--        p_method, p_note)   A
-- Record refund: its own negative row, counted today, cash / check / card
-- (as drawn), never more than the net paid
-- ({"status":"refund_too_large","paid_cents":n}, v0.900). Allowed on
-- withdrawn candidates (S2). A refund corrects no single row, so it takes
-- the school and cycle name of the candidate's LATEST live payment (the
-- money it gives back; contract 14 OI-4).
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n,"money":{...}}
create or replace function public.bb_record_refund(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_amount_cents     integer,
  p_method           text,
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
  v_note       text;
  v_c          public.bb_candidates;
  v_net        bigint;
  v_loc        text;
  v_cycle_name text;
  v_payment_id uuid;
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

    v_note := public.testing_normalize_note(p_note);
    if p_candidate_id is null or p_expected_version is null
       or p_amount_cents is null or p_amount_cents not between 1 and 500000
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or (v_note is not null and not public.testing_note_is_valid(v_note)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    select coalesce(sum(p.amount_cents), 0)::bigint into v_net
      from public.bb_payments p where p.candidate_id = v_c.id;
    if p_amount_cents > v_net then
      return jsonb_build_object('status', 'refund_too_large', 'paid_cents', v_net);
    end if;

    -- the school and cycle name of the latest live payment (not undone,
    -- not a bounced check); the candidate's own as a fallback
    select p.location_code, p.cycle_name into v_loc, v_cycle_name
      from public.bb_payments p
     where p.candidate_id = v_c.id and p.kind = 'payment'
       and not exists (select 1 from public.bb_payments r where r.reverses_payment_id = p.id and r.kind = 'reversal')
       and not exists (select 1 from public.bb_payments t
                        where t.reverses_payment_id = p.id and t.kind = 'returned'
                          and not exists (select 1 from public.bb_payments u
                                           where u.reverses_payment_id = t.id and u.kind = 'reversal'))
     order by p.recorded_at desc, p.id desc
     limit 1;
    if not found then
      v_loc := v_c.location_code;
      select y.name into v_cycle_name from public.bb_cycles y where y.id = v_c.cycle_id;
    end if;

    v_today := public.testing_today();
    perform set_config('tkd.action', 'bb_record_refund', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.bb_payments
      (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason,
       location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, v_c.cycle_id, 'refund', -p_amount_cents, p_method, v_today, null, v_note, null,
       v_loc, v_cycle_name, now(), auth.uid(), public.change_log_actor_name())
    returning id into v_payment_id;

    update public.bb_candidates c set version = c.version + 1 where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'version', v_version,
                              'money', public.bb_candidate_money(v_c.id, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_record_refund(uuid, integer, integer, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_record_refund(uuid, integer, integer, text, text) to authenticated;

-- 15s. bb_mark_check_returned(p_payment_id, p_note)   A
-- Mark check returned (a bounced check): a "returned" row of minus the
-- check's amount, counted today (Finance shows it on that day, Finance
-- v0.809), copying the check's school and cycle name, with the note. The
-- net may go below zero (a check bouncing after a refund: the family owes
-- money back, S2). Refused: not a check payment (invalid); undone or
-- edited away (stale); already marked returned, even if that mark was
-- undone (stale) - after its Undo the same check can't be marked again
-- (bb_payments_one_returned_idx); to start over an admin undoes the
-- payment and records it again, and the new row can be marked (S2).
-- locks: cycle (no key update) -> candidate (update) -> payment (update)
-- Ok: {"status":"ok","payment_id":<the returned row>,"version":n,"money":{...}}
create or replace function public.bb_mark_check_returned(
  p_payment_id uuid,
  p_note       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_note       text;
  v_p          public.bb_payments;
  v_row_id     uuid;
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

    v_note := public.testing_normalize_note(p_note);
    if p_payment_id is null or (v_note is not null and not public.testing_note_is_valid(v_note)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.bb_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'payment' or v_p.method <> 'check' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.bb_payments x where x.reverses_payment_id = v_p.id and x.kind = 'reversal')
       or exists (select 1 from public.bb_payments t where t.reverses_payment_id = v_p.id and t.kind = 'returned') then
      return jsonb_build_object('status', 'stale');
    end if;

    v_today := public.testing_today();
    perform set_config('tkd.action', 'bb_mark_check_returned', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.bb_payments
      (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason,
       location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
    values
      (v_p.candidate_id, v_p.cycle_id, 'returned', -v_p.amount_cents, 'check', v_today, null, v_note, null,
       v_p.location_code, v_p.cycle_name, now(), auth.uid(), public.change_log_actor_name(), v_p.id)
    returning id into v_row_id;

    update public.bb_candidates c set version = c.version + 1 where c.id = v_p.candidate_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_row_id, 'version', v_version,
                              'money', public.bb_candidate_money(v_p.candidate_id, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_mark_check_returned(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_mark_check_returned(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 16. The staff READ functions (S: staff and admins, except where marked
--     A). has_data_access() first (no_access); a missing argument ->
--     invalid; a missing row -> not_found; a rare table-rule or lock error
--     -> a status, with the same mapping as section 15. Everything else
--     the screens show (Rubric and prices, the cycle page, days, prices,
--     due dates) is read with the column rights of section 12.
--     The database takes no "device" argument: the mat-side tablet
--     setting hides money and DOB in the app only (Star v0.161, v0.900).
--     bb_cycles_list and bb_cycle_roster WRITE (they run the purge), so
--     they are "volatile" and the app must call them as a normal POST,
--     never as a read-only GET request.
-- ---------------------------------------------------------------------

-- 16a. bb_cycle_defaults()   A
-- What Add cycle is filled in from (S9, v0.902): the most recently CREATED
-- cycle, or the starting point (Fall 2026) when there is none yet. Answers
-- its schedule as an Add cycle payload without the name (days without ids,
-- deadlines, plans in form order with their due dates and amounts, the
-- Kukkiwon fees) and prices_from (that cycle's name, or "Fall 2026
-- starting point"). The admin then changes what differs (usually only the
-- dates) and saves with bb_add_cycle.
-- locks: none (a read)
-- Ok: {"status":"ok","source_cycle_id":...|null,"payload":{...}}
create or replace function public.bb_cycle_defaults()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c       public.bb_cycles;
  v_payload jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    select * into v_c from public.bb_cycles y order by y.created_at desc, y.id desc limit 1;
    if not found then
      select sp.schedule || jsonb_build_object('prices_from', 'Fall 2026 starting point') into v_payload
        from public.bb_starting_point sp;
      if not found then
        return jsonb_build_object('status', 'not_found');
      end if;
      return jsonb_build_object('status', 'ok', 'source_cycle_id', null, 'payload', v_payload);
    end if;

    v_payload := jsonb_build_object(
      'application_due', v_c.application_due,
      'submissions_due', v_c.submissions_due,
      'auto_close',      v_c.auto_close,
      'days', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name',       d.name,
                 'day_date',   d.day_date,
                 'start_time', left(d.start_time::text, 5),
                 'end_time',   left(d.end_time::text, 5),
                 'place',      case when d.place_code is not null then jsonb_build_object('code', d.place_code)
                                    else jsonb_build_object('other', d.place_other) end,
                 'second',     case when d.second_start is null then null
                                    else jsonb_build_object(
                                           'start', left(d.second_start::text, 5),
                                           'end',   left(d.second_end::text, 5),
                                           'place', case when d.second_place_code is not null
                                                         then jsonb_build_object('code', d.second_place_code)
                                                         else jsonb_build_object('other', d.second_place_other) end) end,
                 'parts',      coalesce((select jsonb_agg(p.part order by array_position(array['physical', 'technical', 'curriculum'], p.part))
                                           from public.bb_cycle_day_parts p where p.day_id = d.id), '[]'::jsonb))
               order by d.day_date, d.start_time, d.id)
          from public.bb_cycle_days d where d.cycle_id = v_c.id), '[]'::jsonb),
      'plans', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name',     pl.name,
                 'payments', coalesce((select jsonb_agg(jsonb_build_object('due_on', pp.due_on,
                                                                           'follows_application_due', pp.follows_application_due)
                                                        order by pp.payment_no)
                                         from public.bb_cycle_plan_payments pp where pp.cycle_plan_id = pl.id), '[]'::jsonb),
                 'amounts',  (select jsonb_object_agg(g.dan::text,
                                                      coalesce((select jsonb_agg(a.amount_cents order by a.payment_no)
                                                                  from public.bb_cycle_plan_amounts a
                                                                 where a.cycle_plan_id = pl.id and a.dan = g.dan), '[]'::jsonb))
                                from generate_series(1, 4) as g(dan)))
               order by pl.position)
          from public.bb_cycle_plans pl where pl.cycle_id = v_c.id), '[]'::jsonb),
      'kukkiwon', coalesce((select jsonb_object_agg(f.dan::text, f.amount_cents)
                              from public.bb_cycle_kukkiwon_fees f where f.cycle_id = v_c.id), '{}'::jsonb),
      'prices_from', v_c.name);
    return jsonb_build_object('status', 'ok', 'source_cycle_id', v_c.id, 'payload', v_payload);
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

revoke execute on function public.bb_cycle_defaults() from public, anon, authenticated, service_role;
grant  execute on function public.bb_cycle_defaults() to authenticated;

-- 16b. bb_cycles_list()   S   (volatile: runs the purge, 13f)
-- The Cycles page: every cycle, newest first testing day first, with its
-- state (10b), days, deadlines, the switch, how many active candidates
-- (both schools), and whether it has payment rows or online-signed
-- waivers (Delete cycle is allowed only without both). The client splits
-- Upcoming / Past and draws the tags.
-- locks: none, except the purge's own (13f)
-- Ok: {"status":"ok","today":date,"cycles":[{id, name, state, first_day,
--      last_day, next_day, day_count, application_due, registration_open,
--      auto_close, candidate_count, has_payments, has_form_waivers, version}]}
create or replace function public.bb_cycles_list()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today  date;
  v_cycles jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    v_today := public.testing_today();
    select coalesce(jsonb_agg(jsonb_build_object(
             'id',                y.id,
             'name',              y.name,
             'state',             s.st,
             'first_day',         s.st -> 'first_day',
             'last_day',          s.st -> 'last_day',
             'next_day',          s.st -> 'next_day',
             'day_count',         (select count(*) from public.bb_cycle_days d where d.cycle_id = y.id),
             'application_due',   y.application_due,
             'registration_open', y.registration_open,
             'auto_close',        y.auto_close,
             'candidate_count',   (select count(*) from public.bb_candidates c where c.cycle_id = y.id and c.status = 'active'),
             'has_payments',      exists (select 1 from public.bb_payments p where p.cycle_id = y.id),
             'has_form_waivers',  exists (select 1 from public.bb_candidate_waivers w
                                            join public.bb_candidates c on c.id = w.candidate_id
                                           where c.cycle_id = y.id and w.how = 'drawn'),
             'version',           y.version)
           order by (s.st ->> 'first_day')::date desc nulls last, y.id), '[]'::jsonb)
      into v_cycles
      from public.bb_cycles y
      cross join lateral (select public.bb_cycle_state(y.id, v_today) as st) as s;

    perform public.bb_purge_due();

    return jsonb_build_object('status', 'ok', 'today', v_today, 'cycles', v_cycles);
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

revoke execute on function public.bb_cycles_list() from public, anon, authenticated, service_role;
grant  execute on function public.bb_cycles_list() to authenticated;

-- 16c. bb_cycle_roster(p_cycle_id)   S   (volatile: runs the purge, 13f)
-- The Candidates tab of one cycle: one row per candidate (withdrawn too),
-- in the v0.900 order (Dan, school Shrewsbury then Worcester, last name,
-- first name), each with its money picture (10d, without the item list).
-- NO date of birth, email, waiver data or login id. The cards and pills
-- are counted by the client from these rows.
-- locks: none, except the purge's own (13f)
-- Ok: {"status":"ok","state":{...10b...},"rows":[{id, first_name,
--      last_name, location_code, dan, plan_id, plan_name, kukkiwon, source,
--      reference, registered_at, status, withdrawn_reason, duplicate_state,
--      duplicate_of, version, has_payment_rows, money}]}
create or replace function public.bb_cycle_roster(p_cycle_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_rows  jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_cycle_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.bb_cycles y where y.id = p_cycle_id) then
      return jsonb_build_object('status', 'not_found');
    end if;

    v_today := public.testing_today();
    select coalesce(jsonb_agg(jsonb_build_object(
             'id',               c.id,
             'first_name',       c.first_name,
             'last_name',        c.last_name,
             'location_code',    c.location_code,
             'dan',              c.dan,
             'plan_id',          c.cycle_plan_id,
             'plan_name',        pl.name,
             'kukkiwon',         c.kukkiwon,
             'source',           c.source,
             'reference',        c.reference,
             'registered_at',    c.registered_at,
             'status',           c.status,
             'withdrawn_reason', c.withdrawn_reason,
             'duplicate_state',  c.duplicate_state,
             'duplicate_of',     c.duplicate_of,
             'version',          c.version,
             'has_payment_rows', exists (select 1 from public.bb_payments p where p.candidate_id = c.id),
             'money',            public.bb_candidate_money(c.id, v_today) - 'items')
           order by c.dan, case c.location_code when 'shrewsbury' then 0 else 1 end,
                    lower(c.last_name), lower(c.first_name), c.id), '[]'::jsonb)
      into v_rows
      from public.bb_candidates c
      join public.bb_cycle_plans pl on pl.id = c.cycle_plan_id
     where c.cycle_id = p_cycle_id;

    perform public.bb_purge_due();

    return jsonb_build_object('status', 'ok', 'state', public.bb_cycle_state(p_cycle_id, v_today), 'rows', v_rows);
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

revoke execute on function public.bb_cycle_roster(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_cycle_roster(uuid) to authenticated;

-- 16d. bb_candidate_detail(p_candidate_id)   S
-- One candidate by id (there is no list or bulk version; the duplicate
-- compare dialog calls it once per side): every column except the login
-- ids - INCLUDING the date of birth and the email - plus the age and
-- "under 18" on the cycle's first testing day and the plan; the newest
-- waiver's STATE (how, version, date, the signer's name, who ticked a
-- paper one, whether a signature is on file - never the picture); the
-- parent-signature warning; the payments as the screen shows them (live
-- payments with a "returned" flag, live refunds, live returned rows;
-- undone and edited-away rows and the reversals are left out; oldest
-- first); and the money picture with its items (10d).
-- Once the purge day has passed (10f), the DOB, email, age and signer's
-- name are answered as null even if the purge hasn't run yet.
-- Not logged (as Star's).
-- locks: none (a read)
create or replace function public.bb_candidate_detail(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_c     public.bb_candidates;
  v_pl    public.bb_cycle_plans;
  v_w     public.bb_candidate_waivers;
  v_vname text;
  v_first date;
  v_due   boolean;
  v_dob   date;
  v_age   integer;
  v_needs boolean;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_candidate_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_c from public.bb_candidates c where c.id = p_candidate_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    v_today := public.testing_today();
    select * into v_pl from public.bb_cycle_plans pl where pl.id = v_c.cycle_plan_id;
    select * into v_w from public.bb_candidate_waivers w
     where w.candidate_id = v_c.id order by w.signed_at desc, w.id desc limit 1;
    select v.version_name into v_vname from public.bb_waiver_versions v where v.id = v_w.waiver_version_id;
    select min(d.day_date) into v_first from public.bb_cycle_days d where d.cycle_id = v_c.cycle_id;

    -- the purge day has passed: personal values are not answered any more
    v_due := public.bb_purge_is_due(v_c.id, v_today);
    v_dob := case when v_due then null else v_c.date_of_birth end;
    v_age := public.bb_age_on(v_dob, v_first);
    v_needs := coalesce(v_age < 18 and not v_w.signed_as_minor, false);

    return jsonb_build_object(
      'status', 'ok',
      'candidate', (to_jsonb(v_c) - array['created_by', 'updated_by', 'withdrawn_by'])
                   || jsonb_build_object(
                        'date_of_birth',         v_dob,
                        'email_for_results',     case when v_due then null else v_c.email_for_results end,
                        'age_on_first_day',      v_age,
                        'under_18_on_first_day', case when v_age is null then null else v_age < 18 end,
                        'plan',                  jsonb_build_object('name', v_pl.name, 'payments_count', v_pl.payments_count)),
      'waiver', case when v_w.id is null then null
                     else jsonb_build_object(
                            'how',               v_w.how,
                            'version_name',      v_vname,
                            'signed_at',         v_w.signed_at,
                            'signer_name',       case when v_due then null else v_w.signer_name end,
                            'signed_as_minor',   v_w.signed_as_minor,
                            'ticked_by_name',    v_w.ticked_by_name,
                            'signature_on_file', v_w.signature is not null,
                            'removed_at',        v_w.removed_at) end,
      'needs_parent_signature', v_needs,
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id',                  p.id,
                 'kind',                p.kind,
                 'amount_cents',        p.amount_cents,
                 'method',              p.method,
                 'paid_on',             p.paid_on,
                 'for_items',           p.for_items,
                 'note',                p.note,
                 'reason',              p.reason,
                 'recorded_at',         p.recorded_at,
                 'recorded_by_name',    p.recorded_by_name,
                 'reverses_payment_id', p.reverses_payment_id,
                 'returned',            p.kind = 'payment'
                                        and exists (select 1 from public.bb_payments t
                                                     where t.reverses_payment_id = p.id and t.kind = 'returned'
                                                       and not exists (select 1 from public.bb_payments u
                                                                        where u.reverses_payment_id = t.id and u.kind = 'reversal')))
               order by p.recorded_at, p.id)
          from public.bb_payments p
         where p.candidate_id = v_c.id
           and p.kind in ('payment', 'refund', 'returned')
           and not exists (select 1 from public.bb_payments r where r.reverses_payment_id = p.id and r.kind = 'reversal')),
        '[]'::jsonb),
      'money', public.bb_candidate_money(v_c.id, v_today));
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

revoke execute on function public.bb_candidate_detail(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_candidate_detail(uuid) to authenticated;

-- 16e. bb_view_signature(p_candidate_id)   A   (v0.213, S18)
-- The drawn signature itself (the "View signature" button), of the
-- candidate's newest DRAWN waiver. A candidate with only paper waivers:
-- {"status":"ok","signature":null,...}. Once the purge day has passed
-- (10f), the signature and the signer's name are answered as null even if
-- the purge hasn't run yet. Not logged.
-- locks: none (a read)
-- Ok: {"status":"ok","signature":"data:image/png;base64,..."|null,
--      "signer_name":...,"signed_at":...,"removed_at":...}
create or replace function public.bb_view_signature(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_w   public.bb_candidate_waivers;
  v_due boolean;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_candidate_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.bb_candidates c where c.id = p_candidate_id) then
      return jsonb_build_object('status', 'not_found');
    end if;

    select * into v_w from public.bb_candidate_waivers w
     where w.candidate_id = p_candidate_id and w.how = 'drawn'
     order by w.signed_at desc, w.id desc limit 1;
    v_due := public.bb_purge_is_due(p_candidate_id, public.testing_today());
    return jsonb_build_object('status', 'ok',
                              'signature',   case when v_due then null else v_w.signature end,
                              'signer_name', case when v_due then null else v_w.signer_name end,
                              'signed_at',   v_w.signed_at,
                              'removed_at',  v_w.removed_at);
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

revoke execute on function public.bb_view_signature(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_view_signature(uuid) to authenticated;

-- 16f. bb_receipt(p_candidate_id)   S   (v0.220, v0.900)
-- What the printed receipt shows: the candidate (name, Dan, reference,
-- school), the cycle and plan, Kukkiwon, the lines (as the detail view:
-- undone rows don't appear, an edited payment shows its new amount,
-- refunds and returned checks are their own lines), the totals and the
-- next payment, both schools' names and addresses, today and who prints.
-- NO date of birth, email, notes, reasons or "recorded by" (v0.900). The
-- phone numbers are constants in the app (contract 14 OI-3).
-- locks: none (a read)
create or replace function public.bb_receipt(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_c     public.bb_candidates;
  v_money jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_candidate_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_c from public.bb_candidates c where c.id = p_candidate_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    v_today := public.testing_today();
    v_money := public.bb_candidate_money(v_c.id, v_today);
    return jsonb_build_object(
      'status', 'ok',
      'candidate', jsonb_build_object('first_name', v_c.first_name, 'last_name', v_c.last_name, 'dan', v_c.dan,
                                      'reference', v_c.reference, 'location_code', v_c.location_code),
      'cycle', jsonb_build_object('name', (select y.name from public.bb_cycles y where y.id = v_c.cycle_id)),
      'plan', jsonb_build_object('name', (select pl.name from public.bb_cycle_plans pl where pl.id = v_c.cycle_plan_id)),
      'kukkiwon', v_c.kukkiwon,
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'paid_on',      p.paid_on,
                 'for_items',    p.for_items,
                 'kind',         p.kind,
                 'method',       p.method,
                 'amount_cents', p.amount_cents,
                 'returned',     p.kind = 'payment'
                                 and exists (select 1 from public.bb_payments t
                                              where t.reverses_payment_id = p.id and t.kind = 'returned'
                                                and not exists (select 1 from public.bb_payments u
                                                                 where u.reverses_payment_id = t.id and u.kind = 'reversal')))
               order by p.recorded_at, p.id)
          from public.bb_payments p
         where p.candidate_id = v_c.id
           and p.kind in ('payment', 'refund', 'returned')
           and not exists (select 1 from public.bb_payments r where r.reverses_payment_id = p.id and r.kind = 'reversal')),
        '[]'::jsonb),
      'money', jsonb_build_object('total_due_cents', v_money -> 'total_due_cents', 'paid_cents', v_money -> 'paid_cents',
                                  'balance_cents', v_money -> 'balance_cents', 'next_on', v_money -> 'next_on',
                                  'next_cents', v_money -> 'next_cents'),
      'schools', coalesce((select jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name,
                                                               'address', public.testing_location_address(l.code))
                                            order by case l.code when 'worcester' then 0 else 1 end)
                             from public.locations l), '[]'::jsonb),
      'printed_on', v_today,
      'printed_by_name', public.change_log_actor_name());
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

revoke execute on function public.bb_receipt(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_receipt(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 17. The two public functions (role bb_registrar ONLY)
-- They never trust the Cloudflare Function: every rule is checked again
-- here. Neither returns anything about other candidates (no counts, no
-- names, no ids except the plan ids the form sends back).
-- ---------------------------------------------------------------------

-- 17a. bb_public_cycle(p_code) - what the family page shows first. The
-- code is one of the cycle's two links; the column it matched sets the
-- school. An unknown or badly formed code - or one that matches more than
-- one cycle (should never happen; refused rather than guessing a school)
-- -> {"status":"not_found"}.
-- Ok: {"status":"ok","state":"open"|"not_open"|"closed"|"finished",
--      "closed_on":date|null,"school":{code, name, address|null},
--      "cycle":{name, application_due, submissions_due,
--               days:[{name, day_date, start_time "HH:MM", end_time,
--                      place:{name, address|null},
--                      second:{start_time, end_time, place}|null, parts}],
--               plans:[{id, name, position, payments:[{payment_no, due_on}],
--                       amounts:{"1":[...], ...}}],
--               kukkiwon:{"1":c, ...}, requirements},
--      "waiver":{version_name, body}}   (the current version)
-- locks: none (a read)
create or replace function public.bb_public_cycle(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c      public.bb_cycles;
  v_n      integer;
  v_school text;
  v_state  jsonb;
begin
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select count(*) into v_n from public.bb_cycles y
   where y.public_code_worcester = p_code or y.public_code_shrewsbury = p_code;
  if v_n <> 1 then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_c from public.bb_cycles y
   where y.public_code_worcester = p_code or y.public_code_shrewsbury = p_code;
  v_school := case when v_c.public_code_worcester = p_code then 'worcester' else 'shrewsbury' end;
  v_state := public.bb_cycle_state(v_c.id, public.testing_today());

  return jsonb_build_object(
    'status',    'ok',
    'state',     v_state ->> 'public_status',
    'closed_on', v_state -> 'closed_on',
    'school',    (select jsonb_build_object('code', l.code, 'name', l.name,
                                            'address', public.testing_location_address(l.code))
                    from public.locations l where l.code = v_school),
    'cycle', jsonb_build_object(
      'name',            v_c.name,
      'application_due', v_c.application_due,
      'submissions_due', v_c.submissions_due,
      'days', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name',       d.name,
                 'day_date',   d.day_date,
                 'start_time', left(d.start_time::text, 5),
                 'end_time',   left(d.end_time::text, 5),
                 'place',      case when d.place_code is not null
                                    then jsonb_build_object('name', (select l.name from public.locations l where l.code = d.place_code),
                                                            'address', public.testing_location_address(d.place_code))
                                    else jsonb_build_object('name', d.place_other, 'address', null) end,
                 'second',     case when d.second_start is null then null
                                    else jsonb_build_object(
                                           'start_time', left(d.second_start::text, 5),
                                           'end_time',   left(d.second_end::text, 5),
                                           'place', case when d.second_place_code is not null
                                                         then jsonb_build_object('name', (select l.name from public.locations l
                                                                                           where l.code = d.second_place_code),
                                                                                 'address', public.testing_location_address(d.second_place_code))
                                                         else jsonb_build_object('name', d.second_place_other, 'address', null) end) end,
                 'parts',      coalesce((select jsonb_agg(p.part order by array_position(array['physical', 'technical', 'curriculum'], p.part))
                                           from public.bb_cycle_day_parts p where p.day_id = d.id), '[]'::jsonb))
               order by d.day_date, d.start_time, d.id)
          from public.bb_cycle_days d where d.cycle_id = v_c.id), '[]'::jsonb),
      'plans', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id',       pl.id,
                 'name',     pl.name,
                 'position', pl.position,
                 'payments', coalesce((select jsonb_agg(jsonb_build_object('payment_no', pp.payment_no, 'due_on', pp.due_on)
                                                        order by pp.payment_no)
                                         from public.bb_cycle_plan_payments pp where pp.cycle_plan_id = pl.id), '[]'::jsonb),
                 'amounts',  (select jsonb_object_agg(g.dan::text,
                                                      coalesce((select jsonb_agg(a.amount_cents order by a.payment_no)
                                                                  from public.bb_cycle_plan_amounts a
                                                                 where a.cycle_plan_id = pl.id and a.dan = g.dan), '[]'::jsonb))
                                from generate_series(1, 4) as g(dan)))
               order by pl.position)
          from public.bb_cycle_plans pl where pl.cycle_id = v_c.id), '[]'::jsonb),
      'kukkiwon', coalesce((select jsonb_object_agg(f.dan::text, f.amount_cents)
                              from public.bb_cycle_kukkiwon_fees f where f.cycle_id = v_c.id), '{}'::jsonb),
      'requirements', v_c.requirements),
    'waiver', (select jsonb_build_object('version_name', v.version_name, 'body', v.body)
                 from public.bb_waiver_versions v where v.superseded_at is null));
end;
$$;

revoke execute on function public.bb_public_cycle(text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_public_cycle(text) to bb_registrar;

-- 17b. bb_public_register_core(...) - the inside of 17c (internal; nobody
-- can call it). Steps, in Star's exact order (contract 8.3):
--   1. the cycle by its code (also not_found when the code matches more
--      than one row)                                      -> not_found
--   2. this submission_id already registered FOR THIS CYCLE -> the same ok
--      answer again (a double tap or a retry never makes two); for
--      ANOTHER cycle -> invalid (never its details)
--   3. lock the cycle, read it again, and
--   4. look for this submission id once more (a retry that waited for the
--      first call's lock gets the same ok answer, never closed or
--      rate_limited)
--   5. only then: open right now? not_open / closed (+ closed_on) /
--      finished (10b: the day tags never open the form)
--   6. the input -> invalid: client key 1-200 characters; submission id;
--      names; DOB set, not in the future, not before 1900-01-01; email;
--      Dan 1-4; a plan of this cycle; Kukkiwon yes / no; "I have read and
--      agree" ticked; the signer's name; the signature (a PNG, 0005's
--      rule); a waiver version name of the right shape that exists
--   7. the waiver version (v0.905): not the placeholder, and current or
--      superseded less than 24 hours ago -> accepted and stored exactly;
--      otherwise -> waiver_changed ("Please reload the page")
--   8. rate limit: 20 or more tries from this client key in the last hour
--      -> rate_limited (every form's tries count together when every
--      Function makes its keys with the same CLIENT_KEY_SECRET). 200 or
--      more tries for this cycle in the last hour is only written to the
--      database log, never refused (an attacker can't block real families)
--   9. write, by "Family form": the candidate (source 'form', reference
--      BB-...., the link's school, Kukkiwon chosen today), the drawn waiver
--      (under 18 on the first testing day or not), the possible-duplicate
--      mark (accepted silently). A concurrent call with the same submission
--      id that hits the unique rule is answered like step 2.
--   Then the ok answer (13g).
-- locks: cycle (no key update)
create or replace function public.bb_public_register_core(
  p_code           text,
  p_client_key     text,
  p_submission_id  uuid,
  p_first          text,
  p_last           text,
  p_date_of_birth  date,
  p_email          text,
  p_dan            integer,
  p_cycle_plan_id  uuid,
  p_kukkiwon       boolean,
  p_acknowledged   boolean,
  p_waiver_version text,
  p_signer_name    text,
  p_signature      text
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_c          public.bb_cycles;
  v_n          integer;
  v_school     text;
  v_state      jsonb;
  v_today      date;
  v_email      text;
  v_version_id uuid;
  v_found_id   uuid;
  v_found_cy   uuid;
  v_dup        uuid;
  v_id         uuid;
  v_constraint text;
begin
  -- 1. the cycle
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select count(*) into v_n from public.bb_cycles y
   where y.public_code_worcester = p_code or y.public_code_shrewsbury = p_code;
  if v_n <> 1 then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_c from public.bb_cycles y
   where y.public_code_worcester = p_code or y.public_code_shrewsbury = p_code;
  v_school := case when v_c.public_code_worcester = p_code then 'worcester' else 'shrewsbury' end;

  -- 2. already registered with this submission id?
  if p_submission_id is not null then
    select c.id, c.cycle_id into v_found_id, v_found_cy
      from public.bb_candidate_waivers w
      join public.bb_candidates c on c.id = w.candidate_id
     where w.submission_id = p_submission_id;
    if found then
      if v_found_cy <> v_c.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      return public.bb_public_answer(v_found_id);
    end if;
  end if;

  -- 3. lock the cycle (as every Black Belt write does), then read it again
  select * into v_c from public.bb_cycles y where y.id = v_c.id for no key update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 4. step 2 again, now that we hold the cycle lock
  if p_submission_id is not null then
    select c.id, c.cycle_id into v_found_id, v_found_cy
      from public.bb_candidate_waivers w
      join public.bb_candidates c on c.id = w.candidate_id
     where w.submission_id = p_submission_id;
    if found then
      if v_found_cy <> v_c.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      return public.bb_public_answer(v_found_id);
    end if;
  end if;

  -- 5. open right now?
  v_today := public.testing_today();
  v_state := public.bb_cycle_state(v_c.id, v_today);
  if v_state ->> 'public_status' = 'finished' then
    return jsonb_build_object('status', 'finished');
  elsif v_state ->> 'public_status' = 'not_open' then
    return jsonb_build_object('status', 'not_open');
  elsif v_state ->> 'public_status' = 'closed' then
    return jsonb_build_object('status', 'closed', 'closed_on', v_state -> 'closed_on');
  end if;

  -- 6. the input
  v_email := btrim(p_email);
  if p_client_key is null or char_length(p_client_key) not between 1 and 200
     or p_submission_id is null
     or not public.testing_name_is_valid(p_first)
     or not public.testing_name_is_valid(p_last)
     or p_date_of_birth is null or p_date_of_birth > v_today or p_date_of_birth < date '1900-01-01'
     or not public.bb_email_is_valid(v_email)
     or p_dan is null or p_dan not between 1 and 4
     or p_cycle_plan_id is null
     or not exists (select 1 from public.bb_cycle_plans pl where pl.id = p_cycle_plan_id and pl.cycle_id = v_c.id)
     or p_kukkiwon is null
     or p_acknowledged is not true
     or not public.testing_name_is_valid(p_signer_name)
     or not public.testing_signature_is_valid(p_signature)
     or p_waiver_version is null or p_waiver_version !~ '^[0-9]{4}-[1-9][0-9]*$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select v.id into v_version_id from public.bb_waiver_versions v where v.version_name = p_waiver_version;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 7. the waiver version they read
  if not public.bb_waiver_version_ok(v_version_id, now()) then
    return jsonb_build_object('status', 'waiver_changed');
  end if;

  -- 8. rate limit (this call's own row is written afterwards by 17c)
  select count(*) into v_n
    from public.testing_public_attempts a
   where a.client_key = p_client_key and a.at > now() - interval '1 hour';
  if v_n >= 20 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*) into v_n
    from public.testing_public_attempts a
   where a.event_id = v_c.id and a.at > now() - interval '1 hour';
  if v_n >= 200 then
    raise log 'bb_public_register: cycle % had % form attempts in the last hour', v_c.id, v_n;
  end if;

  -- 9. write
  perform set_config('tkd.actor_label', 'Family form', true);
  perform set_config('tkd.action', 'bb_public_register', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  v_dup := public.bb_find_duplicate(v_c.id, null, p_first, p_last, p_date_of_birth);
  begin
    insert into public.bb_candidates
      (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan, cycle_plan_id,
       kukkiwon, kukkiwon_added_on, source, reference, duplicate_state, duplicate_of, created_by_name, updated_by_name)
    values
      (v_c.id, public.testing_normalize_name(p_first), public.testing_normalize_name(p_last), p_date_of_birth,
       v_email, v_school, p_dan, p_cycle_plan_id, p_kukkiwon, case when p_kukkiwon then v_today end, 'form',
       'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text,
       case when v_dup is null then 'none' else 'possible' end, v_dup, '', '')
    returning id into v_id;

    insert into public.bb_candidate_waivers
      (candidate_id, waiver_version_id, how, submission_id, acknowledged, signed_as_minor, signer_name, signature,
       ticked_by_name, signed_at, created_by_name, updated_by_name)
    values
      (v_id, v_version_id, 'drawn', p_submission_id, true,
       coalesce(public.bb_age_on(p_date_of_birth, (v_state ->> 'first_day')::date) < 18, false),
       public.testing_normalize_name(p_signer_name), p_signature, null, now(), '', '');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'bb_candidate_waivers_submission_id_key' then
        raise;
      end if;
      -- another call with the same submission id got there first
      select c.id, c.cycle_id into v_found_id, v_found_cy
        from public.bb_candidate_waivers w
        join public.bb_candidates c on c.id = w.candidate_id
       where w.submission_id = p_submission_id;
      if not found or v_found_cy <> v_c.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_id := v_found_id;
      v_dup := null;
  end;
  -- both rows show the pair (accepted silently: the answer is the same)
  if v_dup is not null then
    perform public.bb_recheck_duplicate(v_dup);
  end if;

  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);

  return public.bb_public_answer(v_id);
end;
$$;

revoke execute on function public.bb_public_register_core(text, text, uuid, text, text, date, text, integer, uuid, boolean, boolean, text, text, text) from public, anon, authenticated, service_role;

-- 17c. bb_public_register(p_code, p_client_key, p_submission_id, p_first,
--        p_last, p_date_of_birth, p_email, p_dan, p_cycle_plan_id,
--        p_kukkiwon, p_acknowledged, p_waiver_version, p_signer_name,
--        p_signature)
-- The Black Belt family form's Send. Wraps 17b, exactly as 0006's 20c:
--   * first forgets any login token the caller might have set (so nobody
--     can make a form registration look like a staff member's, and
--     has_data_access() can never be true inside), and removes rate-limit
--     rows older than 2 days
--   * runs 17b; if a table rule still says no, everything 17b did is
--     undone and the answer is invalid
--   * THEN writes this call's testing_public_attempts row (outcome
--     'bb:<status>', so the forms can be told apart in the shared ledger)
--     - outside the part that can be undone, so every call counts
--   * it does NOT run the purge: this login has a 5-second limit per
--     statement, and a big purge must never make a family's registration
--     fail
-- locks: (inside 17b) cycle (no key update)
-- Ok: {"status":"ok", reference, first_name, last_name, dan, kukkiwon,
--      plan_name, items:[{item, due_on, amount_cents}], total_cents,
--      cycle_name, school:{code, name}}
create or replace function public.bb_public_register(
  p_code           text,
  p_client_key     text,
  p_submission_id  uuid,
  p_first          text,
  p_last           text,
  p_date_of_birth  date,
  p_email          text,
  p_dan            integer,
  p_cycle_plan_id  uuid,
  p_kukkiwon       boolean,
  p_acknowledged   boolean,
  p_waiver_version text,
  p_signer_name    text,
  p_signature      text
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
  -- Supabase's auth.jwt() reads this older single-claim setting FIRST, so it
  -- is cleared too (security review S1; 0005 and 0006 miss it - noted for them)
  perform set_config('request.jwt.claim', '', true);

  delete from public.testing_public_attempts a where a.at < now() - interval '2 days';

  begin
    v_result := public.bb_public_register_core(p_code, p_client_key, p_submission_id, p_first, p_last,
                                               p_date_of_birth, p_email, p_dan, p_cycle_plan_id, p_kukkiwon,
                                               p_acknowledged, p_waiver_version, p_signer_name, p_signature);
  exception
    when unique_violation or foreign_key_violation or check_violation or not_null_violation then
      v_result := jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      v_result := jsonb_build_object('status', 'invalid');
  end;

  insert into public.testing_public_attempts (client_key, event_id, outcome)
  values (coalesce(left(p_client_key, 200), ''),
          (select y.id from public.bb_cycles y
            where p_code is not null
              and (y.public_code_worcester = p_code or y.public_code_shrewsbury = p_code)
            limit 1),
          'bb:' || coalesce(v_result ->> 'status', 'invalid'));

  -- leave no tag behind, whichever way 17b ended
  perform set_config('tkd.actor_label', '', true);
  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);

  return v_result;
end;
$$;

revoke execute on function public.bb_public_register(text, text, uuid, text, text, date, text, integer, uuid, boolean, boolean, text, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_public_register(text, text, uuid, text, text, date, text, integer, uuid, boolean, boolean, text, text, text) to bb_registrar;


commit;

-- End of 0016_black_belt.sql
