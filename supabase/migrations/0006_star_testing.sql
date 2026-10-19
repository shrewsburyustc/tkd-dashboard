-- =====================================================================
-- 0006_star_testing.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The sixth database migration for the TKD staff dashboard: Star testing
--   (the black-belt "star" tests for 1st, 2nd and 3rd Dan). Build contract:
--   docs/Dashboard Docs/Build contracts/CONTRACT-0006.md. It runs after
--   0001-0005 (all live) and changes NONE of their objects, grants, rules
--   or tests: it only adds new star_* objects and calls a few 0003 / 0005
--   helpers from its own functions.
--
-- WHY IT EXISTS
--   Admins keep the Star "Rubrics and prices" (each Dan's subjects and
--   credits, the pass mark, the highest star, the fees, the grade values
--   and the Assistant Instructor table). Staff create Star EVENTS (one
--   testing day for both schools; each event takes its own copy of the
--   rubrics when it is created), families register on a public form with
--   one link per school, staff add walk-ins and make-up candidates, record
--   payments, grade at the mat, and mark result emails as sent. The result
--   (passed / make-up ...) is always WORKED OUT from the grades, never
--   stored, so every screen agrees.
--   Candidates are mostly minors: the date of birth, the results email
--   and the drawn signature are never readable by the app's normal rights
--   (section 15); they are read only through two staff functions.
--
-- WHAT IT ADDS
--   * 16 tables (all star_*): the rubric template (4), events (1), the
--     event's copy of the rubrics (4), candidates, their form signatures,
--     make-up subjects, payments (append-only), grades, result emails and
--     the CSV download log
--   * 1 counter (the ST-4001 form references), 1 read-only view
--     (star_roster, the Candidates tab)
--   * 37 staff functions (the ONLY way to write), 2 public functions for
--     the family form, and internal helpers nobody can call
--   * a restricted login role, star_registrar, that can run exactly the 2
--     public functions and nothing else (its password is NOT in this file
--     - see supabase/SETUP.md section 13)
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words delete and drop appear inside rules ("on delete cascade"),
--   inside functions that run later (an admin removing an event, a
--   candidate or a subject; old rate-limit rows being cleaned up) and in
--   "... if exists" lines that make re-running safe. Nothing is removed
--   now. Confirm.
--   (Claude's Supabase connection refuses SQL containing those words, which
--   is why this file is pasted by hand.)
--   Safe to run again: "create table if not exists", "create or replace
--   function/view", rules and triggers replaced with "... if exists" +
--   create, seeds that never overwrite, the role created only if missing.
--
-- WORDS USED BELOW
--   * "today" = the date in Massachusetts: public.testing_today() (0005),
--     i.e. (now() at time zone 'America/New_York')::date.
--   * "template" = Rubrics and prices (star_dan_settings, star_categories,
--     star_grade_values, star_assistant_table). "event copy" = the copy an
--     event takes of the template when it is created (star_event_dans,
--     star_event_categories, star_event_grades, star_event_assistant).
--     Later template changes never change an event.
--   * "version", "stale", "lock", "security definer", search_path = '':
--     the same meaning as in 0003 and 0005 (read their headers).
--   * "lock order": every Star write locks the EVENT first, then the
--     candidate, then the payment / grade / result-email row. Writes that
--     always take locks in the same order can never wait on each other in
--     a circle (a "deadlock").
--   * statuses the functions answer: the 0003 set (ok, no_access,
--     not_allowed, not_found, stale, duplicate_name, invalid, not_empty),
--     from 0005 rate_limited, not_open, closed, finished, already_paid,
--     withdrawn, and new here: already_added, choice_needed, grades_exist,
--     kept, no_fee, refund_too_large, not_finished.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. Small rule helpers (used by the table rules below, so they come
--    first). Nobody in the app can call them.
-- ---------------------------------------------------------------------

-- 1a. star_start_time_is_valid(p_time) - a start time (event or private
-- testing): from 8:00 AM to 8:00 PM, on a 15-minute step (8:00, 8:15 ...),
-- with no seconds. NULL -> false.
create or replace function public.star_start_time_is_valid(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_time between time '08:00' and time '20:00'
                  and extract(minute from p_time)::integer % 15 = 0
                  and extract(second from p_time) = 0,
                  false);
$$;

revoke execute on function public.star_start_time_is_valid(time) from public, anon, authenticated, service_role;

-- 1b. star_email_is_valid(p_email) - the "email for results": at most 254
-- characters, something@something.something with no spaces and only one
-- "@", and no invisible control or format characters (the same list as
-- 0003's name rule). The functions trim spaces at the start and end before
-- checking; the address is stored as typed (capitals kept). NULL -> false.
create or replace function public.star_email_is_valid(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(char_length(p_email) <= 254
                  and p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                  and p_email !~ '[\x01-\x1f\x7f-\x9f ​-‏‪-‮⁠-⁤⁦-⁩﻿]',
                  false);
$$;

revoke execute on function public.star_email_is_valid(text) from public, anon, authenticated, service_role;

-- 1c. star_ids_are_valid(p_ids) - for the id lists the app sends ("the
-- order the screen showed", "the payments the warning named"): not NULL,
-- one-dimensional, no NULL entry and no id twice. An empty list is valid.
-- (The same rule as 0003's testing_ids_are_valid, kept separate so Star
-- doesn't depend on more 0003 code than it must.)
create or replace function public.star_ids_are_valid(p_ids uuid[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_ids is not null
     and coalesce(array_ndims(p_ids), 1) = 1
     and not exists (select 1 from unnest(p_ids) as x(id) where x.id is null)
     and (select count(distinct x.id) from unnest(p_ids) as x(id)) = cardinality(p_ids);
$$;

revoke execute on function public.star_ids_are_valid(uuid[]) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. Rubrics and prices: the TEMPLATE every new event copies
--    (rulebook v0.58, v0.61, v0.66, v0.171). The seed rows are written in
--    section 13h, after the triggers exist, so they are in the history.
-- ---------------------------------------------------------------------

-- 2a. star_dan_settings - one row per Dan (1st, 2nd, 3rd; seeded, no
-- add/remove function): the pass mark, the highest star a candidate can
-- test for ("star limit") and the three fees in cents.
create table if not exists public.star_dan_settings (
  id              uuid          not null default gen_random_uuid(),
  dan             smallint      not null,
  label           text          not null,
  pass_mark       numeric(6, 1) not null,
  star_limit      smallint      not null,
  standard_cents  integer       not null,
  same_day_cents  integer       not null,
  private_cents   integer       not null,
  version         integer       not null default 1,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  created_by      uuid          null,       -- login id; no foreign key on purpose (as 0003)
  updated_by      uuid          null,
  created_by_name text          not null,   -- set by the trigger (section 13)
  updated_by_name text          not null,

  constraint star_dan_settings_pkey primary key (id),
  constraint star_dan_settings_dan_key unique (dan),
  constraint star_dan_settings_dan_check check (dan between 1 and 9),
  constraint star_dan_settings_label_check
    check (coalesce(public.testing_name_is_valid(label) and label = public.testing_normalize_name(label), false)),
  constraint star_dan_settings_pass_mark_check check (pass_mark > 0 and pass_mark <= 9999.9),
  constraint star_dan_settings_star_limit_check check (star_limit between 1 and 20),
  constraint star_dan_settings_cents_check
    check (public.testing_cents_is_valid(standard_cents)
           and public.testing_cents_is_valid(same_day_cents)
           and public.testing_cents_is_valid(private_cents)),
  constraint star_dan_settings_version_check check (version >= 1)
);

comment on table public.star_dan_settings is
  'Star rubric template: one row per Dan (pass mark, highest star, fees). Copied into each new event. Written only through star_* functions.';

-- 2b. star_categories - the subjects of each Dan, in order (position).
--   * credits: how much the subject counts (1-100). The total of a Dan is
--     shown (70 on paper) but not required (v0.61).
--   * from_class_count: true only for "Assistant Instructor", whose letter
--     is worked out from the number of assistant classes instead of being
--     judged. Exactly one per Dan; it can't be added, changed or deleted.
--   * position unique per Dan, "deferrable initially immediate" so a
--     reorder can renumber all rows in one statement (as 0003).
create table if not exists public.star_categories (
  id               uuid        not null default gen_random_uuid(),
  dan              smallint    not null,
  name             text        not null,
  credits          integer     not null,
  position         integer     not null,
  from_class_count boolean     not null default false,
  version          integer     not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid        null,
  updated_by       uuid        null,
  created_by_name  text        not null,
  updated_by_name  text        not null,

  constraint star_categories_pkey primary key (id),
  constraint star_categories_dan_fk foreign key (dan) references public.star_dan_settings (dan),
  constraint star_categories_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint star_categories_credits_check check (credits between 1 and 100),
  constraint star_categories_position_check check (position >= 0),
  constraint star_categories_dan_position_key unique (dan, position) deferrable initially immediate,
  constraint star_categories_version_check check (version >= 1)
);

-- Names different inside one Dan, ignoring capital letters (v0.66).
create unique index if not exists star_categories_dan_lower_name_idx
  on public.star_categories (dan, lower(name));
-- At most one Assistant Instructor per Dan.
create unique index if not exists star_categories_one_from_class_count_idx
  on public.star_categories (dan) where from_class_count;

comment on table public.star_categories is
  'Star rubric template: the subjects (categories) of each Dan with their credits. Copied into each new event.';

-- 2c. star_grade_values - the 7 letters (fixed) and the value each is
-- worth (editable). Points = credits x value. "Values go down in order"
-- is checked by star_update_grade_values (it spans rows). What makes a
-- make-up is the LETTER D, never its value.
create table if not exists public.star_grade_values (
  id              uuid          not null default gen_random_uuid(),
  grade           text          not null,
  position        smallint      not null,
  value           numeric(3, 1) not null,
  version         integer       not null default 1,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  created_by      uuid          null,
  updated_by      uuid          null,
  created_by_name text          not null,
  updated_by_name text          not null,

  constraint star_grade_values_pkey primary key (id),
  constraint star_grade_values_grade_key unique (grade),
  constraint star_grade_values_grade_check check (grade in ('A+', 'A', 'B+', 'B', 'C+', 'C', 'D')),
  constraint star_grade_values_position_key unique (position),
  constraint star_grade_values_position_check check (position between 1 and 7),
  constraint star_grade_values_value_check check (value between 0 and 9.9),
  constraint star_grade_values_version_check check (version >= 1)
);

comment on table public.star_grade_values is
  'Star rubric template: the 7 grade letters (A+ ... D, fixed) and their values (editable). Copied into each new event.';

-- 2d. star_assistant_table - ONE row ("singleton"): the age split (12 and
-- under = child) and the minimum number of assistant classes for each
-- letter, per age group. Below the C minimum = D (not stored).
create table if not exists public.star_assistant_table (
  id              uuid        not null default gen_random_uuid(),
  singleton       boolean     not null default true,
  child_max_age   smallint    not null,
  child_a_plus    integer     not null,
  child_a         integer     not null,
  child_b_plus    integer     not null,
  child_b         integer     not null,
  child_c_plus    integer     not null,
  child_c         integer     not null,
  adult_a_plus    integer     not null,
  adult_a         integer     not null,
  adult_b_plus    integer     not null,
  adult_b         integer     not null,
  adult_c_plus    integer     not null,
  adult_c         integer     not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint star_assistant_table_pkey primary key (id),
  constraint star_assistant_table_singleton_key unique (singleton),
  constraint star_assistant_table_singleton_check check (singleton),
  constraint star_assistant_table_child_max_age_check check (child_max_age between 1 and 30),
  -- each column strictly decreasing from A+ down to C, C at least 1
  constraint star_assistant_table_child_check
    check (child_a_plus > child_a and child_a > child_b_plus and child_b_plus > child_b
           and child_b > child_c_plus and child_c_plus > child_c and child_c >= 1 and child_a_plus <= 999),
  constraint star_assistant_table_adult_check
    check (adult_a_plus > adult_a and adult_a > adult_b_plus and adult_b_plus > adult_b
           and adult_b > adult_c_plus and adult_c_plus > adult_c and adult_c >= 1 and adult_a_plus <= 999),
  constraint star_assistant_table_version_check check (version >= 1)
);

comment on table public.star_assistant_table is
  'Star rubric template: one row - the child/adult age split and the minimum assistant classes per letter. Copied into each new event.';


-- ---------------------------------------------------------------------
-- 3. public.star_events - one Star testing day (both schools; v0.85-v0.99)
--   * name: unique across ALL Star events, ignoring capitals and extra
--     spaces (the index below, v0.92)
--   * start_time: 8:00 AM - 8:00 PM on a 15-minute step (1a)
--   * where_code: the school where it happens - INFORMATION ONLY (v0.87).
--     Deliberately not called location_code, so the history never files a
--     joint event under one school.
--   * registration_open / auto_close_on / first_opened_at: the Open /
--     Closed switch, the automatic closing date (registration closes at
--     the END of that day) and when it was first opened - as 0005.
--   * public_code_worcester / public_code_shrewsbury: the two family
--     links, one per school (the link sets the candidate's school, v0.98).
--     Random 8-character codes, never change, never used twice in EITHER
--     column (the rule trigger star_events_rules, section 13).
--   * note: "Note for families" (optional, up to 600 characters)
--   * created_at doubles as "Rubrics and prices were copied when this
--     event was created" (v0.92).
-- ---------------------------------------------------------------------
create table if not exists public.star_events (
  id                     uuid        not null default gen_random_uuid(),
  name                   text        not null,
  testing_date           date        not null,
  start_time             time        not null,
  where_code             text        not null,
  registration_open      boolean     not null default false,
  auto_close_on          date        null,
  first_opened_at        timestamptz null,
  public_code_worcester  text        not null,
  public_code_shrewsbury text        not null,
  note                   text        null,
  version                integer     not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid        null,
  updated_by             uuid        null,
  created_by_name        text        not null,
  updated_by_name        text        not null,

  constraint star_events_pkey primary key (id),
  constraint star_events_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint star_events_start_time_check check (public.star_start_time_is_valid(start_time)),
  constraint star_events_where_fk foreign key (where_code) references public.locations (code),
  constraint star_events_auto_close_check check (auto_close_on is null or auto_close_on <= testing_date),
  constraint star_events_opened_check check (not registration_open or first_opened_at is not null),
  constraint star_events_code_worcester_key unique (public_code_worcester),
  constraint star_events_code_shrewsbury_key unique (public_code_shrewsbury),
  constraint star_events_codes_check
    check (public_code_worcester ~ '^[a-hjkmnp-z2-9]{8}$'
           and public_code_shrewsbury ~ '^[a-hjkmnp-z2-9]{8}$'
           and public_code_worcester <> public_code_shrewsbury),
  constraint star_events_note_check
    check (note is null
           or coalesce(public.testing_note_is_valid(note) and note = public.testing_normalize_note(note), false)),
  constraint star_events_version_check check (version >= 1)
);

-- One name across all Star events, ignoring capitals and extra spaces.
create unique index if not exists star_events_lower_name_idx
  on public.star_events (lower(public.testing_normalize_name(name)));
create index if not exists star_events_testing_date_idx on public.star_events (testing_date);

comment on table public.star_events is
  'Star testing events (both schools, one link code per school). State is derived by star_event_state, never stored. Written only through star_* functions.';


-- ---------------------------------------------------------------------
-- 4. The event's own COPY of the template (v0.61: taken when the event
--    is created, never changed afterwards - the trigger in section 13
--    refuses every update). Removed only together with the event
--    ("on delete cascade"). No version / "last changed by" columns:
--    the rows are written once.
-- ---------------------------------------------------------------------
create table if not exists public.star_event_dans (
  id             uuid          not null default gen_random_uuid(),
  event_id       uuid          not null,
  dan            smallint      not null,
  label          text          not null,
  pass_mark      numeric(6, 1) not null,
  star_limit     smallint      not null,
  standard_cents integer       not null,
  same_day_cents integer       not null,
  private_cents  integer       not null,

  constraint star_event_dans_pkey primary key (id),
  constraint star_event_dans_event_fk foreign key (event_id) references public.star_events (id) on delete cascade,
  constraint star_event_dans_event_dan_key unique (event_id, dan),
  constraint star_event_dans_dan_check check (dan between 1 and 9),
  constraint star_event_dans_label_check
    check (coalesce(public.testing_name_is_valid(label) and label = public.testing_normalize_name(label), false)),
  constraint star_event_dans_pass_mark_check check (pass_mark > 0 and pass_mark <= 9999.9),
  constraint star_event_dans_star_limit_check check (star_limit between 1 and 20),
  constraint star_event_dans_cents_check
    check (public.testing_cents_is_valid(standard_cents)
           and public.testing_cents_is_valid(same_day_cents)
           and public.testing_cents_is_valid(private_cents))
);

-- template_category_id: which template subject it was copied from. No
-- foreign key on purpose (as 0005's class_id): the template subject may
-- later be renamed or deleted without touching the event.
create table if not exists public.star_event_categories (
  id                   uuid     not null default gen_random_uuid(),
  event_id             uuid     not null,
  dan                  smallint not null,
  template_category_id uuid     not null,
  name                 text     not null,
  credits              integer  not null,
  position             integer  not null,
  from_class_count     boolean  not null,

  constraint star_event_categories_pkey primary key (id),
  constraint star_event_categories_event_fk foreign key (event_id) references public.star_events (id) on delete cascade,
  constraint star_event_categories_dan_fk
    foreign key (event_id, dan) references public.star_event_dans (event_id, dan) on delete cascade,
  constraint star_event_categories_event_dan_position_key unique (event_id, dan, position),
  constraint star_event_categories_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint star_event_categories_credits_check check (credits between 1 and 100),
  constraint star_event_categories_position_check check (position >= 0)
);

create unique index if not exists star_event_categories_lower_name_idx
  on public.star_event_categories (event_id, dan, lower(name));
create unique index if not exists star_event_categories_one_from_class_count_idx
  on public.star_event_categories (event_id, dan) where from_class_count;

create table if not exists public.star_event_grades (
  id       uuid          not null default gen_random_uuid(),
  event_id uuid          not null,
  grade    text          not null,
  position smallint      not null,
  value    numeric(3, 1) not null,

  constraint star_event_grades_pkey primary key (id),
  constraint star_event_grades_event_fk foreign key (event_id) references public.star_events (id) on delete cascade,
  constraint star_event_grades_event_grade_key unique (event_id, grade),
  constraint star_event_grades_event_position_key unique (event_id, position),
  constraint star_event_grades_grade_check check (grade in ('A+', 'A', 'B+', 'B', 'C+', 'C', 'D')),
  constraint star_event_grades_position_check check (position between 1 and 7),
  constraint star_event_grades_value_check check (value between 0 and 9.9)
);

create table if not exists public.star_event_assistant (
  id            uuid     not null default gen_random_uuid(),
  event_id      uuid     not null,
  child_max_age smallint not null,
  child_a_plus  integer  not null,
  child_a       integer  not null,
  child_b_plus  integer  not null,
  child_b       integer  not null,
  child_c_plus  integer  not null,
  child_c       integer  not null,
  adult_a_plus  integer  not null,
  adult_a       integer  not null,
  adult_b_plus  integer  not null,
  adult_b       integer  not null,
  adult_c_plus  integer  not null,
  adult_c       integer  not null,

  constraint star_event_assistant_pkey primary key (id),
  constraint star_event_assistant_event_fk foreign key (event_id) references public.star_events (id) on delete cascade,
  constraint star_event_assistant_event_key unique (event_id),
  constraint star_event_assistant_child_max_age_check check (child_max_age between 1 and 30),
  constraint star_event_assistant_child_check
    check (child_a_plus > child_a and child_a > child_b_plus and child_b_plus > child_b
           and child_b > child_c_plus and child_c_plus > child_c and child_c >= 1 and child_a_plus <= 999),
  constraint star_event_assistant_adult_check
    check (adult_a_plus > adult_a and adult_a > adult_b_plus and adult_b_plus > adult_b
           and adult_b > adult_c_plus and adult_c_plus > adult_c and adult_c >= 1 and adult_a_plus <= 999)
);

comment on table public.star_event_dans is
  'An event''s copy of star_dan_settings, taken when the event was created. Never changed.';
comment on table public.star_event_categories is
  'An event''s copy of star_categories, taken when the event was created. Never changed.';
comment on table public.star_event_grades is
  'An event''s copy of star_grade_values, taken when the event was created. Never changed.';
comment on table public.star_event_assistant is
  'An event''s copy of star_assistant_table, taken when the event was created. Never changed.';

-- ---------------------------------------------------------------------
-- 5. public.star_candidates - one person in one event (v0.98-v0.117,
--    v0.148-v0.152)
--   * names: same rule as 0003's names, stored tidied
--   * date_of_birth: NEVER readable by the app's normal rights (only
--     through star_candidate_detail and the admin CSV). Null only on desk
--     rows (a walk-in may not know it, v0.172 S3). Used for the age group
--     (12 and under / 13 and up) on the event's testing date.
--   * email_for_results: where the result goes. NEVER readable by the
--     app's normal rights either.
--   * location_code: the candidate's school (set by the link the family
--     used; staff may change it in Edit details). Called location_code so
--     the history files the candidate's rows under that school.
--   * dan + stars_from: which Dan's subjects they test, and the star they
--     have now (they test for stars_from + 1, never stored). stars_from
--     must be below the event copy's star limit (rule trigger, section 13).
--   * paying_by: cash / check / card; NULL for a make-up candidate (no fee)
--   * source: 'form' (the family form, has a reference ST-4001 ... and a
--     signature row) or 'desk' (New candidate / Make-up)
--   * status / withdrawn_* / duplicate_*: exactly as 0005's registrations
--     (withdrawn_by is a login id: never readable by the app)
--   * is_makeup / makeup_of_*: a make-up candidate re-tests subjects from
--     an earlier event; makeup_of_candidate_id points at the earlier
--     candidate (set to NULL if that one is ever deleted),
--     makeup_of_event_name keeps the earlier event's name.
--   * private_on / private_time: a private testing day and time (both or
--     neither). The day may be before or after the testing day (v0.168).
--   * classes_attended / assistant_classes: NULL = not entered yet; 0 is
--     a real value. Saving them never bumps the version (section 13).
-- ---------------------------------------------------------------------
create sequence if not exists public.star_candidate_ref_seq
  as bigint
  start with 4001;

create table if not exists public.star_candidates (
  id                     uuid        not null default gen_random_uuid(),
  event_id               uuid        not null,
  first_name             text        not null,
  last_name              text        not null,
  date_of_birth          date        null,
  email_for_results      text        null,
  location_code          text        not null,
  dan                    smallint    not null,
  stars_from             smallint    not null,
  paying_by              text        null,
  source                 text        not null,
  reference              text        null,
  registered_at          timestamptz not null default now(),
  status                 text        not null default 'active',
  withdrawn_reason       text        null,
  withdrawn_at           timestamptz null,
  withdrawn_by_name      text        null,
  withdrawn_by           uuid        null,      -- login id; no foreign key on purpose
  duplicate_state        text        not null default 'none',
  duplicate_of           uuid        null,
  is_makeup              boolean     not null default false,
  makeup_of_candidate_id uuid        null,
  makeup_of_event_name   text        null,
  private_on             date        null,
  private_time           time        null,
  classes_attended       integer     null,
  assistant_classes      integer     null,
  version                integer     not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid        null,
  updated_by             uuid        null,
  created_by_name        text        not null,
  updated_by_name        text        not null,

  constraint star_candidates_pkey primary key (id),
  constraint star_candidates_event_fk foreign key (event_id) references public.star_events (id) on delete cascade,
  constraint star_candidates_first_name_check
    check (coalesce(public.testing_name_is_valid(first_name) and first_name = public.testing_normalize_name(first_name), false)),
  constraint star_candidates_last_name_check
    check (coalesce(public.testing_name_is_valid(last_name) and last_name = public.testing_normalize_name(last_name), false)),
  constraint star_candidates_dob_check check (date_of_birth is null or date_of_birth >= date '1900-01-01'),
  constraint star_candidates_email_check
    check (email_for_results is null or public.star_email_is_valid(email_for_results)),
  constraint star_candidates_location_fk foreign key (location_code) references public.locations (code),
  -- "no action": a Dan copy is only ever removed together with its event,
  -- and then its candidates go in the same step
  constraint star_candidates_dan_fk
    foreign key (event_id, dan) references public.star_event_dans (event_id, dan),
  constraint star_candidates_stars_from_check check (stars_from >= 0),
  constraint star_candidates_paying_by_check
    check ((is_makeup and paying_by is null)
           or (not is_makeup and paying_by in ('cash', 'check', 'card'))),
  constraint star_candidates_source_check check (source in ('form', 'desk')),
  constraint star_candidates_reference_key unique (reference),
  constraint star_candidates_reference_source_check check ((source = 'form') = (reference is not null)),
  constraint star_candidates_reference_check check (reference is null or reference ~ '^ST-[0-9]{4,}$'),
  constraint star_candidates_status_check
    check ((status = 'active' and num_nonnulls(withdrawn_reason, withdrawn_at, withdrawn_by_name, withdrawn_by) = 0)
           or (status = 'withdrawn' and withdrawn_reason in ('withdrawn', 'duplicate_copy')
               and withdrawn_at is not null and withdrawn_by_name is not null)),
  constraint star_candidates_duplicate_fk
    foreign key (duplicate_of) references public.star_candidates (id) on delete set null,
  constraint star_candidates_duplicate_state_check check (duplicate_state in ('none', 'possible', 'kept_both')),
  constraint star_candidates_duplicate_self_check check (duplicate_of is distinct from id),
  constraint star_candidates_makeup_fk
    foreign key (makeup_of_candidate_id) references public.star_candidates (id) on delete set null,
  constraint star_candidates_makeup_check
    check (is_makeup or (makeup_of_candidate_id is null and makeup_of_event_name is null)),
  constraint star_candidates_private_check check ((private_on is null) = (private_time is null)),
  constraint star_candidates_classes_attended_check
    check (classes_attended is null or classes_attended between 0 and 999),
  constraint star_candidates_assistant_classes_check
    check (assistant_classes is null or assistant_classes between 0 and 999),
  constraint star_candidates_version_check check (version >= 1)
);

create index if not exists star_candidates_event_idx     on public.star_candidates (event_id);
create index if not exists star_candidates_names_idx     on public.star_candidates (event_id, lower(last_name), lower(first_name));
create index if not exists star_candidates_duplicate_idx on public.star_candidates (duplicate_of) where duplicate_of is not null;
create index if not exists star_candidates_makeup_idx    on public.star_candidates (makeup_of_candidate_id) where makeup_of_candidate_id is not null;
create index if not exists star_candidates_private_idx   on public.star_candidates (private_on) where private_on is not null;
-- An earlier candidate can have at most ONE active make-up row, in any
-- event. This closes the race between two events adding the same make-up
-- at the same moment (each event's lock alone can't stop that).
create unique index if not exists star_candidates_one_active_makeup_idx
  on public.star_candidates (makeup_of_candidate_id) where is_makeup and status = 'active';

comment on table public.star_candidates is
  'Star candidates, one row per person per event. date_of_birth and email_for_results are never granted to any client role (read only through star_candidate_detail and the admin CSV).';
comment on column public.star_candidates.date_of_birth is
  'Never granted to any client role. Null only on desk rows. Used for the age group on the testing date.';


-- ---------------------------------------------------------------------
-- 6. public.star_candidate_signatures - what only the family form sends
--    (v0.102, v0.107, v0.162): the acknowledgement, which wording was
--    ticked, the drawn signature, and the browser's submission id (so a
--    retry never makes a second candidate).
--   NOBODY in the app can read this table (RLS on, no rule, no rights).
--   The signature is removed 90 days after the event's testing date
--   (section 16); signature_deleted_at says when. Its history rows never
--   hold the picture or the submission id (its own log trigger, 13d).
-- ---------------------------------------------------------------------
create table if not exists public.star_candidate_signatures (
  id                   uuid        not null default gen_random_uuid(),
  candidate_id         uuid        not null,
  submission_id        uuid        not null,
  acknowledged         boolean     not null,
  ack_version          text        not null,
  signature            text        null,
  signed_at            timestamptz not null,
  signature_deleted_at timestamptz null,
  version              integer     not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid        null,
  updated_by           uuid        null,
  created_by_name      text        not null,
  updated_by_name      text        not null,

  constraint star_candidate_signatures_pkey primary key (id),
  constraint star_candidate_signatures_candidate_fk
    foreign key (candidate_id) references public.star_candidates (id) on delete cascade,
  constraint star_candidate_signatures_candidate_key unique (candidate_id),
  constraint star_candidate_signatures_submission_id_key unique (submission_id),
  constraint star_candidate_signatures_acknowledged_check check (acknowledged),
  constraint star_candidate_signatures_signature_check
    check (signature is null or public.testing_signature_is_valid(signature)),
  -- the signature is there, OR it was removed (and when)
  constraint star_candidate_signatures_deleted_check check ((signature is null) = (signature_deleted_at is not null)),
  constraint star_candidate_signatures_version_check check (version >= 1)
);

comment on table public.star_candidate_signatures is
  'Family-form data per candidate (acknowledgement, signature, submission id). Never granted to any role; the signature is removed 90 days after the testing date and never copied into change_log.';


-- ---------------------------------------------------------------------
-- 7. public.star_makeup_subjects (v0.96, v0.111, v0.129, v0.130, v0.163)
--   kind 'retest': on a make-up candidate, a subject re-tested at this
--                  event (written by star_add_makeup)
--   kind 'chosen': an admin's choice of subjects to re-test, for a result
--                  below the pass mark with no D (v0.130)
--   The subject must belong to the candidate's event and current Dan
--   (rule trigger). Rows are only inserted and deleted.
-- ---------------------------------------------------------------------
create table if not exists public.star_makeup_subjects (
  id                uuid        not null default gen_random_uuid(),
  candidate_id      uuid        not null,
  event_category_id uuid        not null,
  kind              text        not null,
  version           integer     not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid        null,
  updated_by        uuid        null,
  created_by_name   text        not null,
  updated_by_name   text        not null,

  constraint star_makeup_subjects_pkey primary key (id),
  constraint star_makeup_subjects_candidate_fk
    foreign key (candidate_id) references public.star_candidates (id) on delete cascade,
  constraint star_makeup_subjects_category_fk
    foreign key (event_category_id) references public.star_event_categories (id),
  constraint star_makeup_subjects_kind_check check (kind in ('retest', 'chosen')),
  constraint star_makeup_subjects_candidate_category_kind_key unique (candidate_id, event_category_id, kind),
  constraint star_makeup_subjects_version_check check (version >= 1)
);

create index if not exists star_makeup_subjects_category_idx on public.star_makeup_subjects (event_category_id);

comment on table public.star_makeup_subjects is
  'Subjects a candidate re-tests (retest, on make-up candidates) or that an admin chose for a below-the-pass-mark result (chosen).';


-- ---------------------------------------------------------------------
-- 8. public.star_payments - append-only (v0.109, v0.110, v0.152, v0.166,
--    v0.167)
--   kind 'payment':  1 cent to $1,000, cash / check / card (staff may type
--                    a discount, so any cents are allowed)
--   kind 'refund':   its own NEGATIVE row (entered positive, stored
--                    negative), cash or check, with its own date (v0.166)
--   kind 'reversal': undoes exactly one payment or refund (Undo / Edit):
--                    exactly minus its amount; reverses_payment_id points
--                    at it (unique, so it is reversed at most once)
--   Rows are never changed or removed (the guard trigger, section 13),
--   except together with their candidate or event. The candidate's net
--   total (all rows added up) can never go below zero.
--   "Paid" = the net total is more than 0 (any amount counts, v0.167).
-- ---------------------------------------------------------------------
create table if not exists public.star_payments (
  id                  uuid        not null default gen_random_uuid(),
  candidate_id        uuid        not null,
  kind                text        not null,
  amount_cents        integer     not null,
  method              text        not null,
  paid_on             date        not null,
  recorded_at         timestamptz not null default now(),
  recorded_by         uuid        null,       -- login id; never readable by the app
  recorded_by_name    text        not null,
  reverses_payment_id uuid        null,

  constraint star_payments_pkey primary key (id),
  constraint star_payments_candidate_fk
    foreign key (candidate_id) references public.star_candidates (id) on delete cascade,
  constraint star_payments_reverses_fk
    foreign key (reverses_payment_id) references public.star_payments (id),
  constraint star_payments_reverses_key unique (reverses_payment_id),
  constraint star_payments_kind_check
    check ((kind = 'payment' and amount_cents between 1 and 100000 and reverses_payment_id is null
            and method in ('cash', 'check', 'card'))
           or (kind = 'refund' and amount_cents between -100000 and -1 and reverses_payment_id is null
               and method in ('cash', 'check'))
           or (kind = 'reversal' and amount_cents between -100000 and 100000 and amount_cents <> 0
               and reverses_payment_id is not null))
);

create index if not exists star_payments_candidate_idx on public.star_payments (candidate_id);

comment on table public.star_payments is
  'Star payments and refunds, append-only: corrections are reversal rows. The net total per candidate never goes below 0.';


-- ---------------------------------------------------------------------
-- 9. public.star_grades (v0.124-v0.129, v0.139, v0.163-v0.165)
--   One row = one judged grade; NO row = not graded (clearing removes the
--   row). Assistant Instructor is never stored here (it is worked out
--   from assistant_classes). The subject must be of the candidate's event
--   AND current Dan, and the letter one of the event's grade copy (rule
--   trigger). The version goes up on a change but is never checked: the
--   last save wins and the history keeps both (v0.165).
--   kept / kept_from_*: a make-up candidate's grade carried over from the
--   earlier event (v0.163); it can't be changed on this event (v0.129).
-- ---------------------------------------------------------------------
create table if not exists public.star_grades (
  id                   uuid        not null default gen_random_uuid(),
  candidate_id         uuid        not null,
  event_category_id    uuid        not null,
  grade                text        not null,
  kept                 boolean     not null default false,
  kept_from_event_id   uuid        null,       -- no foreign key: the earlier event may be removed later
  kept_from_event_name text        null,
  version              integer     not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid        null,
  updated_by           uuid        null,
  created_by_name      text        not null,
  updated_by_name      text        not null,

  constraint star_grades_pkey primary key (id),
  constraint star_grades_candidate_fk
    foreign key (candidate_id) references public.star_candidates (id) on delete cascade,
  constraint star_grades_category_fk
    foreign key (event_category_id) references public.star_event_categories (id),
  constraint star_grades_grade_check check (grade in ('A+', 'A', 'B+', 'B', 'C+', 'C', 'D')),
  constraint star_grades_kept_check check (kept = (kept_from_event_name is not null)),
  constraint star_grades_candidate_category_key unique (candidate_id, event_category_id),
  constraint star_grades_version_check check (version >= 1)
);

create index if not exists star_grades_category_idx on public.star_grades (event_category_id);

comment on table public.star_grades is
  'Star grades: one row per judged subject per candidate (no row = not graded). Assistant Instructor is never stored. The last save wins; change_log keeps every save.';


-- ---------------------------------------------------------------------
-- 10. public.star_result_emails - "Mark as sent" (v0.141, v0.170)
--   One row each time staff mark a result email as sent, with a snapshot
--   of the result at that moment (status, total, subjects to re-test and
--   its result_key). If the result changes later the screen shows "Not
--   sent yet" again with this earlier send noted. undone_*: the toast's
--   Undo (or an admin's correction), set once.
--   sent_via: 'manual' today; a sending service adds 'service' later.
-- ---------------------------------------------------------------------
create table if not exists public.star_result_emails (
  id             uuid          not null default gen_random_uuid(),
  candidate_id   uuid          not null,
  marked_at      timestamptz   not null default now(),
  marked_by      uuid          null,        -- login id; never readable by the app
  marked_by_name text          not null,
  result_status  text          not null,
  result_total   numeric(6, 1) not null,
  result_needs   jsonb         not null,
  result_key     text          not null,
  sent_via       text          not null default 'manual',
  undone_at      timestamptz   null,
  undone_by      uuid          null,        -- login id; never readable by the app
  undone_by_name text          null,

  constraint star_result_emails_pkey primary key (id),
  constraint star_result_emails_candidate_fk
    foreign key (candidate_id) references public.star_candidates (id) on delete cascade,
  constraint star_result_emails_status_check check (result_status in ('passed', 'makeup')),
  constraint star_result_emails_needs_check check (jsonb_typeof(result_needs) = 'array'),
  constraint star_result_emails_sent_via_check check (sent_via in ('manual')),
  constraint star_result_emails_undone_check check ((undone_at is null) = (undone_by_name is null))
);

create index if not exists star_result_emails_candidate_idx on public.star_result_emails (candidate_id);

comment on table public.star_result_emails is
  'Mark as sent: one row per marked result email with a snapshot of the result. Only undone_* can be set, once.';


-- ---------------------------------------------------------------------
-- 11. public.star_downloads - the results CSV download log (v0.144,
--     v0.172 S1). Who downloaded which event (or one Dan of it), when, and
--     how many rows. NOBODY in the app can read it (SQL Editor only); it
--     is written only by star_results_csv and never changed or removed.
--     Not part of change_log (a download isn't a data change).
--     event_id has no foreign key: the log outlives a removed event.
-- ---------------------------------------------------------------------
create table if not exists public.star_downloads (
  id                 uuid        not null default gen_random_uuid(),
  event_id           uuid        not null,
  event_name         text        not null,
  dan                smallint    null,       -- NULL = the whole event
  row_count          integer     not null,
  downloaded_at      timestamptz not null default now(),
  downloaded_by      uuid        null,
  downloaded_by_name text        not null,

  constraint star_downloads_pkey primary key (id)
);

create index if not exists star_downloads_event_idx on public.star_downloads (event_id, downloaded_at);

comment on table public.star_downloads is
  'Star results CSV download log. Never granted to any role; never changed or removed; not in change_log.';

-- ---------------------------------------------------------------------
-- 12. Derived rules: worked out every time, never stored (v0.158).
--     They are the ONLY place these rules live, so every screen, the
--     CSV and the functions always agree. Nobody in the app can call them.
-- ---------------------------------------------------------------------

-- 12a. star_event_state(event, today) - where registration stands,
-- checked in this exact order (exactly 0005's testing_event_state):
--   'finished'       today is after the testing date
--   'open'           switched on and the closing date (if any) not passed -
--                    includes the testing day itself (v0.88)
--   'closed_by_date' switched on, but today is after the closing date
--   'not_open_yet'   never opened
--   'closed'         closed by hand
create or replace function public.star_event_state(p_event public.star_events, p_today date)
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

revoke execute on function public.star_event_state(public.star_events, date) from public, anon, authenticated, service_role;

-- 12b. star_net_paid_cents(candidate) - all the candidate's payment rows
-- added up (payments, refunds and reversals). "Paid" = more than 0.
create or replace function public.star_net_paid_cents(p_candidate_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(p.amount_cents), 0)::integer
    from public.star_payments p
   where p.candidate_id = p_candidate_id;
$$;

revoke execute on function public.star_net_paid_cents(uuid) from public, anon, authenticated, service_role;

-- 12c. star_fee_kind(candidate) - which fee the candidate owes, in this
-- order (contract 5.2):
--   'none'      a make-up candidate (no fee, v0.96)
--   'private'   a private testing day is set (always the private fee,
--               even when paid after the private day, v0.167)
--   paid:       'standard' if the latest payment that was NOT reversed was
--               paid before the testing day, else 'same_day'
--   not paid:   'standard' if today is before the testing day, else
--               'same_day' (on AND after the testing day, v0.167)
-- The view star_roster (section 14) writes the same rule inline.
create or replace function public.star_fee_kind(p_candidate_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when c.is_makeup then 'none'
           when c.private_on is not null then 'private'
           when public.star_net_paid_cents(c.id) > 0 then
             case when (select p.paid_on
                          from public.star_payments p
                         where p.candidate_id = c.id
                           and p.kind = 'payment'
                           and not exists (select 1 from public.star_payments x where x.reverses_payment_id = p.id)
                         order by p.recorded_at desc, p.id desc
                         limit 1) < e.testing_date
                  then 'standard' else 'same_day' end
           when public.testing_today() < e.testing_date then 'standard'
           else 'same_day'
         end
    from public.star_candidates c
    join public.star_events e on e.id = c.event_id
   where c.id = p_candidate_id;
$$;

revoke execute on function public.star_fee_kind(uuid) from public, anon, authenticated, service_role;

-- 12d. star_expected_fee_cents(candidate) - the amount of that fee, from
-- the event copy of the candidate's Dan (0 for a make-up). The Record
-- payment dialog fills this in; staff may change the amount (v0.110).
create or replace function public.star_expected_fee_cents(p_candidate_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case public.star_fee_kind(c.id)
           when 'none' then 0
           when 'private' then d.private_cents
           when 'standard' then d.standard_cents
           else d.same_day_cents
         end
    from public.star_candidates c
    join public.star_event_dans d on d.event_id = c.event_id and d.dan = c.dan
   where c.id = p_candidate_id;
$$;

revoke execute on function public.star_expected_fee_cents(uuid) from public, anon, authenticated, service_role;

-- 12e. star_age_group_of(dob, testing_date, child_max_age) - 'child' when
-- the date of birth is known and the age ON THE EVENT'S TESTING DATE is
-- child_max_age (12) or less; otherwise 'adult' (13 and up) - also when
-- there is no date of birth (v0.66, v0.168, S3). The private day never
-- changes it.
create or replace function public.star_age_group_of(p_dob date, p_testing_date date, p_child_max_age integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_dob is not null
                and extract(year from age(p_testing_date, p_dob)) <= p_child_max_age then 'child'
           else 'adult'
         end;
$$;

revoke execute on function public.star_age_group_of(date, date, integer) from public, anon, authenticated, service_role;

-- 12f. star_assistant_grade(event, age_group, count) - the Assistant
-- Instructor letter: NULL when the count isn't entered; otherwise the
-- first of A+, A, B+, B, C+, C whose minimum (the event copy, that age
-- group's column) is at most the count; else D.
create or replace function public.star_assistant_grade(p_event_id uuid, p_age_group text, p_count integer)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when p_count is null then null
           when p_count >= case when p_age_group = 'child' then a.child_a_plus else a.adult_a_plus end then 'A+'
           when p_count >= case when p_age_group = 'child' then a.child_a      else a.adult_a      end then 'A'
           when p_count >= case when p_age_group = 'child' then a.child_b_plus else a.adult_b_plus end then 'B+'
           when p_count >= case when p_age_group = 'child' then a.child_b      else a.adult_b      end then 'B'
           when p_count >= case when p_age_group = 'child' then a.child_c_plus else a.adult_c_plus end then 'C+'
           when p_count >= case when p_age_group = 'child' then a.child_c      else a.adult_c      end then 'C'
           else 'D'
         end
    from public.star_event_assistant a
   where a.event_id = p_event_id;
$$;

revoke execute on function public.star_assistant_grade(uuid, text, integer) from public, anon, authenticated, service_role;

-- 12g. star_candidate_result(candidate) - THE result (contract 5.5). The
-- only place the pass rules live. Inputs: the event copy of the
-- candidate's CURRENT Dan, the grade rows, the class counts, the make-up
-- subjects and the age group.
--   subjects   the Dan's subjects in order; a judged subject's letter is
--              its grade row (kept or not), Assistant Instructor's letter
--              comes from assistant_classes (12f); points = credits x the
--              event copy's value of the letter
--   total      the points of the graded subjects ("so far" while
--              incomplete); max_score = all credits x the A+ value
--   status     in this order: 'withdrawn' / 'testing_privately' (not
--              complete and a private day is set) / 'not_finished' (not
--              complete) / 'passed' (complete, no D, total >= pass mark) /
--              'makeup' (everything else)
--   makeup_reasons  'd' (a D somewhere) and/or 'below' (under the pass mark)
--   needs      what a make-up re-tests: the D subjects if there is any D;
--              else (below the pass mark) the subjects an admin chose;
--              choice_needed = below, no D, nothing chosen yet
--   result_key md5(status | total | needs ids) - "has the result changed
--              since the screen / the sent email showed it?"
-- Never contains a DOB, email, age or payment (age_group only).
-- Returns NULL when the candidate doesn't exist.
create or replace function public.star_candidate_result(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_c         public.star_candidates;
  v_e         public.star_events;
  v_d         public.star_event_dans;
  v_age       text;
  v_ai        text;
  v_subjects  jsonb;
  v_total     numeric;
  v_credits   integer;
  v_count     integer;
  v_graded    integer;
  v_d_names   jsonb;
  v_d_ids     uuid[];
  v_missing   jsonb;
  v_aplus     numeric;
  v_max       numeric;
  v_complete  boolean;
  v_status    text;
  v_reasons   jsonb := '[]'::jsonb;
  v_needs     jsonb := '[]'::jsonb;
  v_needs_ids uuid[] := '{}';
  v_chosen    uuid[];
  v_choice    boolean := false;
  v_has_d     boolean;
  v_below     boolean;
begin
  select * into v_c from public.star_candidates c where c.id = p_candidate_id;
  if not found then
    return null;
  end if;
  select * into v_e from public.star_events e where e.id = v_c.event_id;
  select * into v_d from public.star_event_dans d where d.event_id = v_c.event_id and d.dan = v_c.dan;

  select public.star_age_group_of(v_c.date_of_birth, v_e.testing_date, a.child_max_age) into v_age
    from public.star_event_assistant a where a.event_id = v_c.event_id;
  v_age := coalesce(v_age, 'adult');
  v_ai  := public.star_assistant_grade(v_c.event_id, v_age, v_c.assistant_classes);

  -- every subject of the Dan with its letter and points
  with s as (
    select k.id, k.name, k.credits, k.position, k.from_class_count,
           case when k.from_class_count then v_ai else g.grade end as grade,
           coalesce(g.kept, false) as kept,
           g.kept_from_event_name,
           exists (select 1 from public.star_makeup_subjects m
                    where m.candidate_id = v_c.id and m.event_category_id = k.id and m.kind = 'retest') as retest
      from public.star_event_categories k
      left join public.star_grades g
             on g.candidate_id = v_c.id and g.event_category_id = k.id and not k.from_class_count
     where k.event_id = v_c.event_id and k.dan = v_c.dan
  ), sp as (
    select s.*, s.credits * v.value as points
      from s
      left join public.star_event_grades v on v.event_id = v_c.event_id and v.grade = s.grade
  )
  select coalesce(jsonb_agg(jsonb_build_object(
                    'event_category_id',    sp.id,
                    'name',                 sp.name,
                    'credits',              sp.credits,
                    'position',             sp.position,
                    'from_class_count',     sp.from_class_count,
                    'grade',                sp.grade,
                    'points',               sp.points,
                    'kept',                 sp.kept,
                    'kept_from_event_name', sp.kept_from_event_name,
                    'retest',               sp.retest) order by sp.position), '[]'::jsonb),
         round(coalesce(sum(sp.points), 0), 1),
         coalesce(sum(sp.credits), 0)::integer,
         count(*)::integer,
         count(sp.grade)::integer,
         coalesce(jsonb_agg(sp.name order by sp.position) filter (where sp.grade = 'D'), '[]'::jsonb),
         coalesce(array_agg(sp.id order by sp.position) filter (where sp.grade = 'D'), '{}'),
         coalesce(jsonb_agg(sp.name order by sp.position) filter (where sp.grade is null), '[]'::jsonb)
    into v_subjects, v_total, v_credits, v_count, v_graded, v_d_names, v_d_ids, v_missing
    from sp;

  select v.value into v_aplus from public.star_event_grades v where v.event_id = v_c.event_id and v.grade = 'A+';
  v_max      := round(v_credits * coalesce(v_aplus, 0), 1);
  v_complete := v_count > 0 and v_graded = v_count;
  v_has_d    := cardinality(v_d_ids) > 0;
  v_below    := v_total < v_d.pass_mark;

  if v_c.status = 'withdrawn' then
    v_status := 'withdrawn';
  elsif not v_complete and v_c.private_on is not null then
    v_status := 'testing_privately';
  elsif not v_complete then
    v_status := 'not_finished';
  elsif not v_has_d and not v_below then
    v_status := 'passed';
  else
    v_status := 'makeup';
  end if;

  if v_status = 'makeup' then
    if v_has_d then
      v_reasons := v_reasons || '["d"]'::jsonb;
    end if;
    if v_below then
      v_reasons := v_reasons || '["below"]'::jsonb;
    end if;
    if v_has_d then
      -- any D: re-test the D subjects only (OPEN-12)
      v_needs     := v_d_names;
      v_needs_ids := v_d_ids;
    else
      -- below the pass mark, no D: the subjects an admin chose (v0.130)
      v_chosen := array(select k.id
                          from public.star_makeup_subjects m
                          join public.star_event_categories k on k.id = m.event_category_id
                         where m.candidate_id = v_c.id and m.kind = 'chosen'
                           and k.event_id = v_c.event_id and k.dan = v_c.dan
                         order by k.position);
      v_needs_ids := v_chosen;
      v_needs := coalesce((select jsonb_agg(k.name order by k.position)
                             from public.star_event_categories k where k.id = any (v_chosen)), '[]'::jsonb);
      v_choice := cardinality(v_chosen) = 0;
    end if;
  end if;

  return jsonb_build_object(
    'candidate_id',   v_c.id,
    'event_id',       v_c.event_id,
    'dan',            v_c.dan,
    'stars_from',     v_c.stars_from,
    'stars_to',       v_c.stars_from + 1,
    'status',         v_status,
    'total',          v_total,
    'max_score',      v_max,
    'pass_mark',      v_d.pass_mark,
    'complete',       v_complete,
    'graded_count',   v_graded,
    'subject_count',  v_count,
    'subjects',       v_subjects,
    'ai',             jsonb_build_object('age_group', v_age, 'count', v_c.assistant_classes, 'grade', v_ai),
    'd_subjects',     v_d_names,
    'makeup_reasons', v_reasons,
    'needs',          v_needs,
    'needs_ids',      to_jsonb(v_needs_ids),
    'choice_needed',  v_choice,
    'missing',        v_missing,
    'private',        case when v_c.private_on is null then null
                           else jsonb_build_object('on', v_c.private_on, 'time', left(v_c.private_time::text, 5)) end,
    'result_key',     md5(v_status || '|' || v_total::text || '|' || array_to_string(v_needs_ids, ',')));
end;
$$;

revoke execute on function public.star_candidate_result(uuid) from public, anon, authenticated, service_role;

-- 12h. star_sent_state(candidate, result) - the latest "Mark as sent" that
-- was not undone: {sent: {id, marked_at, marked_by_name, result_status} or
-- null, matches: does its result_key equal the current one?}. When the
-- result changed, the screen shows "Not sent yet" again and notes the
-- earlier send (v0.170).
create or replace function public.star_sent_state(p_candidate_id uuid, p_result jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'sent', case when s.id is null then null
                        else jsonb_build_object('id', s.id, 'marked_at', s.marked_at,
                                                'marked_by_name', s.marked_by_name,
                                                'result_status', s.result_status) end,
           'matches', coalesce(s.result_key = (p_result ->> 'result_key'), false))
    from (select 1) as one
    left join lateral (select r.id, r.marked_at, r.marked_by_name, r.result_status, r.result_key
                         from public.star_result_emails r
                        where r.candidate_id = p_candidate_id and r.undone_at is null
                        order by r.marked_at desc, r.id desc
                        limit 1) as s on true;
$$;

revoke execute on function public.star_sent_state(uuid, jsonb) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 13. Trigger functions (run automatically on every write), the
--     triggers, and the seed
-- ---------------------------------------------------------------------

-- 13a. star_before_write(fixed columns, no-bump columns) - BEFORE INSERT
-- OR UPDATE, shared by every Star table with a version (as 0005's 9a/9c,
-- written once). The two arguments are comma-separated column lists
-- given in each "create trigger" below.
--   insert: version 1; created/updated stamps = now + who (whatever the
--           writer supplied)
--   update: a change to a FIXED column (argument 1) is refused
--           (errcode 23514 = check_violation, constraint <table>_immutable);
--           created_* keep their old values; if anything changed other
--           than the NO-BUMP columns (argument 2) and the bookkeeping
--           columns - or a function wrote version + 1 on purpose - the
--           version goes up by one and "last changed by" is stamped now;
--           otherwise the version and updated_* stay exactly as before.
--   So reordering subjects, saving class counts and the signature
--   clean-up never bump a version (an open Edit details dialog doesn't go
--   stale because a count was typed in at the mat).
create or replace function public.star_before_write()
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

revoke execute on function public.star_before_write() from public, anon, authenticated, service_role;

-- 13b. star_events_rules() - BEFORE INSERT OR UPDATE on star_events:
-- a link code may never be used by ANOTHER event, in either column (the
-- two "unique" rules each see one column only). Raised as a unique
-- violation (errcode 23505), constraint star_events_public_code_cross_key.
create or replace function public.star_events_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.star_events e
              where e.id <> new.id
                and (e.public_code_worcester in (new.public_code_worcester, new.public_code_shrewsbury)
                     or e.public_code_shrewsbury in (new.public_code_worcester, new.public_code_shrewsbury))) then
    raise exception using
      errcode    = '23505',
      constraint = 'star_events_public_code_cross_key',
      message    = 'that link code is already used by another Star event';
  end if;
  return new;
end;
$$;

revoke execute on function public.star_events_rules() from public, anon, authenticated, service_role;

-- 13c. star_event_copies_before_write() - BEFORE UPDATE on the four copy
-- tables: the event's copy never changes after it was taken (v0.61).
create or replace function public.star_event_copies_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode    = '23514',
    constraint = tg_table_name || '_immutable',
    message    = 'the event''s copy of Rubrics and prices can''t change';
end;
$$;

revoke execute on function public.star_event_copies_before_write() from public, anon, authenticated, service_role;

-- 13d. star_candidates_rules() - BEFORE INSERT OR UPDATE on candidates
-- (defence in depth: the functions check the same things first)
--   * stars_from must be below the event copy's star limit for the Dan
--     (constraint star_candidates_stars_event)
--   * duplicate_of must be a candidate of the SAME event
--     (star_candidates_duplicate_event)
--   * the Dan can't change while grade rows of the old Dan exist (the
--     function removes them first; star_candidates_dan_grades)
create or replace function public.star_candidates_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_limit integer;
begin
  select d.star_limit into v_limit
    from public.star_event_dans d
   where d.event_id = new.event_id and d.dan = new.dan;
  if found and new.stars_from >= v_limit then
    raise exception using
      errcode    = '23514',
      constraint = 'star_candidates_stars_event',
      message    = 'stars_from must be below the event''s highest star for this Dan';
  end if;

  if new.duplicate_of is not null
     and not exists (select 1 from public.star_candidates m
                      where m.id = new.duplicate_of and m.event_id = new.event_id) then
    raise exception using
      errcode    = '23514',
      constraint = 'star_candidates_duplicate_event',
      message    = 'a possible duplicate must be in the same event';
  end if;

  if tg_op = 'UPDATE' and new.dan is distinct from old.dan
     and exists (select 1 from public.star_grades g
                   join public.star_event_categories k on k.id = g.event_category_id
                  where g.candidate_id = new.id and k.dan = old.dan) then
    raise exception using
      errcode    = '23514',
      constraint = 'star_candidates_dan_grades',
      message    = 'the Dan can''t change while grades of the old Dan exist';
  end if;
  return new;
end;
$$;

revoke execute on function public.star_candidates_rules() from public, anon, authenticated, service_role;

-- 13e. star_candidate_signatures_rules() - BEFORE UPDATE on signatures:
-- the signature can only be REMOVED (never replaced), and its removal
-- time is set once. (Every other column is fixed by 13a.)
create or replace function public.star_candidate_signatures_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.signature is distinct from old.signature and new.signature is not null)
     or (new.signature_deleted_at is distinct from old.signature_deleted_at and old.signature_deleted_at is not null) then
    raise exception using
      errcode    = '23514',
      constraint = 'star_candidate_signatures_immutable',
      message    = 'a signature can only be removed, once';
  end if;
  return new;
end;
$$;

revoke execute on function public.star_candidate_signatures_rules() from public, anon, authenticated, service_role;

-- 13f. star_candidate_signatures_log() - AFTER INSERT OR UPDATE OR DELETE
-- on signatures: the same history row as 0003's change_log_write, EXCEPT
--   * the signature is never copied: it shows as "on file" or null, so
--     the history holds no picture at all;
--   * submission_id is left out.
-- An update that changed nothing visible after that writes no row.
-- security definer so it can write to change_log (as 0005's
-- testing_registrations_log).
create or replace function public.star_candidate_signatures_log()
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

revoke execute on function public.star_candidate_signatures_log() from public, anon, authenticated, service_role;

-- 13g. star_makeup_subjects_rules() - BEFORE INSERT: the subject belongs
-- to the candidate's event and current Dan.
create or replace function public.star_makeup_subjects_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1
                   from public.star_candidates c
                   join public.star_event_categories k on k.event_id = c.event_id and k.dan = c.dan
                  where c.id = new.candidate_id and k.id = new.event_category_id) then
    raise exception using
      errcode    = '23514',
      constraint = 'star_makeup_subjects_subject',
      message    = 'the subject must belong to the candidate''s event and Dan';
  end if;
  return new;
end;
$$;

revoke execute on function public.star_makeup_subjects_rules() from public, anon, authenticated, service_role;

-- 13h. star_payments_guard() - keeps payments append-only
--   BEFORE INSERT: a reversal must undo one PAYMENT or REFUND (not a
--                  reversal) of the same candidate, for exactly minus its
--                  amount (star_payments_reversal_check); and no insert
--                  may leave the candidate's net total below zero
--                  (star_payments_net_check - the calling function already
--                  holds the candidate lock, so nothing extra is locked)
--   BEFORE UPDATE: always refused
--   BEFORE DELETE: refused, EXCEPT as part of removing a whole candidate
--                  or event ("on delete cascade" runs it from inside
--                  another trigger, so pg_trigger_depth() > 1), or inside
--                  star_delete_candidate / star_delete_event (their action
--                  tags). Color Belt's tags don't count here.
-- Limit (as 0005): the database owner could switch this trigger off on
-- purpose; it stops mistakes and the app, not a deliberate owner.
create or replace function public.star_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reversed public.star_payments;
  v_net      bigint;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'reversal' then
      select * into v_reversed from public.star_payments p where p.id = new.reverses_payment_id;
      if not found
         or v_reversed.kind not in ('payment', 'refund')
         or v_reversed.candidate_id <> new.candidate_id
         or new.amount_cents <> -v_reversed.amount_cents then
        raise exception using
          errcode    = '23514',
          constraint = 'star_payments_reversal_check',
          message    = 'a reversal must undo one payment or refund of the same candidate, for exactly minus its amount';
      end if;
    end if;
    select coalesce(sum(p.amount_cents), 0) into v_net
      from public.star_payments p where p.candidate_id = new.candidate_id;
    if v_net + new.amount_cents < 0 then
      raise exception using
        errcode    = '23514',
        constraint = 'star_payments_net_check',
        message    = 'a candidate''s payments can''t add up to less than zero';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE'
     and (pg_trigger_depth() > 1
          or coalesce(current_setting('tkd.action', true), '') in ('star_delete_candidate', 'star_delete_event')) then
    return old;
  end if;

  raise exception 'star_payments is append-only (use a reversal)';
end;
$$;

revoke execute on function public.star_payments_guard() from public, anon, authenticated, service_role;

-- 13i. star_grades_rules() - BEFORE INSERT OR UPDATE on grades
--   * the subject belongs to the candidate's event AND current Dan
--     (star_grades_subject)
--   * it is not Assistant Instructor (never stored; star_grades_from_class_count)
--   * the letter is one of the event's grade copy (star_grades_letter)
--   * a kept grade can't be changed (star_grades_kept, v0.129)
create or replace function public.star_grades_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_fcc      boolean;
begin
  select c.event_id, k.from_class_count into v_event_id, v_fcc
    from public.star_candidates c
    join public.star_event_categories k on k.event_id = c.event_id and k.dan = c.dan
   where c.id = new.candidate_id and k.id = new.event_category_id;
  if not found then
    raise exception using
      errcode    = '23514',
      constraint = 'star_grades_subject',
      message    = 'the subject must belong to the candidate''s event and current Dan';
  end if;
  if v_fcc then
    raise exception using
      errcode    = '23514',
      constraint = 'star_grades_from_class_count',
      message    = 'Assistant Instructor is worked out from the class count, never stored as a grade';
  end if;
  if not exists (select 1 from public.star_event_grades v where v.event_id = v_event_id and v.grade = new.grade) then
    raise exception using
      errcode    = '23514',
      constraint = 'star_grades_letter',
      message    = 'the letter must be one of the event''s grades';
  end if;
  if tg_op = 'UPDATE' and old.kept then
    raise exception using
      errcode    = '23514',
      constraint = 'star_grades_kept',
      message    = 'a kept make-up grade can''t be changed on this event';
  end if;
  return new;
end;
$$;

revoke execute on function public.star_grades_rules() from public, anon, authenticated, service_role;

-- 13j. star_result_emails_guard() - BEFORE UPDATE OR DELETE on result
-- emails: an update may only set undone_at / undone_by / undone_by_name,
-- once (from empty); removal only together with the candidate or event
-- (cascade) or inside star_delete_candidate / star_delete_event.
create or replace function public.star_result_emails_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['undone_at', 'undone_by', 'undone_by_name'])
         = (to_jsonb(old) - array['undone_at', 'undone_by', 'undone_by_name'])
       and old.undone_at is null and old.undone_by is null and old.undone_by_name is null
       and new.undone_at is not null then
      return new;
    end if;
    raise exception using
      errcode    = '23514',
      constraint = 'star_result_emails_immutable',
      message    = 'a Mark as sent row can only be undone, once';
  end if;

  if pg_trigger_depth() > 1
     or coalesce(current_setting('tkd.action', true), '') in ('star_delete_candidate', 'star_delete_event') then
    return old;
  end if;
  raise exception 'star_result_emails is append-only';
end;
$$;

revoke execute on function public.star_result_emails_guard() from public, anon, authenticated, service_role;

-- 13k. star_downloads_guard() - BEFORE UPDATE OR DELETE on the download
-- log: always refused, even for the SQL Editor's role.
create or replace function public.star_downloads_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'star_downloads is append-only';
end;
$$;

revoke execute on function public.star_downloads_guard() from public, anon, authenticated, service_role;

-- 13l. Attach the triggers ("drop trigger if exists" + create = replace).
-- PostgreSQL runs BEFORE triggers of one table in name order, so
-- <table>_before_write always runs before <table>_rules.

-- Rubrics and prices
drop trigger if exists star_dan_settings_before_write on public.star_dan_settings;
create trigger star_dan_settings_before_write
  before insert or update on public.star_dan_settings
  for each row execute function public.star_before_write('id,dan', '');

drop trigger if exists star_categories_before_write on public.star_categories;
create trigger star_categories_before_write
  before insert or update on public.star_categories
  for each row execute function public.star_before_write('id,dan,from_class_count', 'position');

drop trigger if exists star_grade_values_before_write on public.star_grade_values;
create trigger star_grade_values_before_write
  before insert or update on public.star_grade_values
  for each row execute function public.star_before_write('id,grade,position', '');

drop trigger if exists star_assistant_table_before_write on public.star_assistant_table;
create trigger star_assistant_table_before_write
  before insert or update on public.star_assistant_table
  for each row execute function public.star_before_write('id,singleton', '');

-- Events
drop trigger if exists star_events_before_write on public.star_events;
create trigger star_events_before_write
  before insert or update on public.star_events
  for each row execute function public.star_before_write('id,public_code_worcester,public_code_shrewsbury', '');

drop trigger if exists star_events_rules on public.star_events;
create trigger star_events_rules
  before insert or update on public.star_events
  for each row execute function public.star_events_rules();

-- The event copies: never updated
drop trigger if exists star_event_dans_before_write on public.star_event_dans;
create trigger star_event_dans_before_write
  before update on public.star_event_dans
  for each row execute function public.star_event_copies_before_write();

drop trigger if exists star_event_categories_before_write on public.star_event_categories;
create trigger star_event_categories_before_write
  before update on public.star_event_categories
  for each row execute function public.star_event_copies_before_write();

drop trigger if exists star_event_grades_before_write on public.star_event_grades;
create trigger star_event_grades_before_write
  before update on public.star_event_grades
  for each row execute function public.star_event_copies_before_write();

drop trigger if exists star_event_assistant_before_write on public.star_event_assistant;
create trigger star_event_assistant_before_write
  before update on public.star_event_assistant
  for each row execute function public.star_event_copies_before_write();

-- Candidates and what belongs to them
drop trigger if exists star_candidates_before_write on public.star_candidates;
create trigger star_candidates_before_write
  before insert or update on public.star_candidates
  for each row execute function public.star_before_write(
    'id,event_id,source,reference,registered_at,is_makeup,makeup_of_event_name',
    'classes_attended,assistant_classes');

drop trigger if exists star_candidates_rules on public.star_candidates;
create trigger star_candidates_rules
  before insert or update on public.star_candidates
  for each row execute function public.star_candidates_rules();

drop trigger if exists star_candidate_signatures_before_write on public.star_candidate_signatures;
create trigger star_candidate_signatures_before_write
  before insert or update on public.star_candidate_signatures
  for each row execute function public.star_before_write(
    'id,candidate_id,submission_id,acknowledged,ack_version,signed_at',
    'signature,signature_deleted_at');

drop trigger if exists star_candidate_signatures_rules on public.star_candidate_signatures;
create trigger star_candidate_signatures_rules
  before update on public.star_candidate_signatures
  for each row execute function public.star_candidate_signatures_rules();

drop trigger if exists star_makeup_subjects_before_write on public.star_makeup_subjects;
create trigger star_makeup_subjects_before_write
  before insert or update on public.star_makeup_subjects
  for each row execute function public.star_before_write('id,candidate_id,event_category_id,kind', '');

drop trigger if exists star_makeup_subjects_rules on public.star_makeup_subjects;
create trigger star_makeup_subjects_rules
  before insert on public.star_makeup_subjects
  for each row execute function public.star_makeup_subjects_rules();

drop trigger if exists star_payments_guard on public.star_payments;
create trigger star_payments_guard
  before insert or update or delete on public.star_payments
  for each row execute function public.star_payments_guard();

drop trigger if exists star_grades_before_write on public.star_grades;
create trigger star_grades_before_write
  before insert or update on public.star_grades
  for each row execute function public.star_before_write(
    'id,candidate_id,event_category_id,kept,kept_from_event_id,kept_from_event_name', '');

drop trigger if exists star_grades_rules on public.star_grades;
create trigger star_grades_rules
  before insert or update on public.star_grades
  for each row execute function public.star_grades_rules();

drop trigger if exists star_result_emails_guard on public.star_result_emails;
create trigger star_result_emails_guard
  before update or delete on public.star_result_emails
  for each row execute function public.star_result_emails_guard();

drop trigger if exists star_downloads_guard on public.star_downloads;
create trigger star_downloads_guard
  before update or delete on public.star_downloads
  for each row execute function public.star_downloads_guard();

-- History: 0003's change_log_write on every table except the signatures
-- (their own version, 13f) and the download log (not a data change).
drop trigger if exists star_dan_settings_log on public.star_dan_settings;
create trigger star_dan_settings_log
  after insert or update or delete on public.star_dan_settings
  for each row execute function public.change_log_write();

drop trigger if exists star_categories_log on public.star_categories;
create trigger star_categories_log
  after insert or update or delete on public.star_categories
  for each row execute function public.change_log_write();

drop trigger if exists star_grade_values_log on public.star_grade_values;
create trigger star_grade_values_log
  after insert or update or delete on public.star_grade_values
  for each row execute function public.change_log_write();

drop trigger if exists star_assistant_table_log on public.star_assistant_table;
create trigger star_assistant_table_log
  after insert or update or delete on public.star_assistant_table
  for each row execute function public.change_log_write();

drop trigger if exists star_events_log on public.star_events;
create trigger star_events_log
  after insert or update or delete on public.star_events
  for each row execute function public.change_log_write();

drop trigger if exists star_event_dans_log on public.star_event_dans;
create trigger star_event_dans_log
  after insert or update or delete on public.star_event_dans
  for each row execute function public.change_log_write();

drop trigger if exists star_event_categories_log on public.star_event_categories;
create trigger star_event_categories_log
  after insert or update or delete on public.star_event_categories
  for each row execute function public.change_log_write();

drop trigger if exists star_event_grades_log on public.star_event_grades;
create trigger star_event_grades_log
  after insert or update or delete on public.star_event_grades
  for each row execute function public.change_log_write();

drop trigger if exists star_event_assistant_log on public.star_event_assistant;
create trigger star_event_assistant_log
  after insert or update or delete on public.star_event_assistant
  for each row execute function public.change_log_write();

drop trigger if exists star_candidates_log on public.star_candidates;
create trigger star_candidates_log
  after insert or update or delete on public.star_candidates
  for each row execute function public.change_log_write();

drop trigger if exists star_candidate_signatures_log on public.star_candidate_signatures;
create trigger star_candidate_signatures_log
  after insert or update or delete on public.star_candidate_signatures
  for each row execute function public.star_candidate_signatures_log();

drop trigger if exists star_makeup_subjects_log on public.star_makeup_subjects;
create trigger star_makeup_subjects_log
  after insert or update or delete on public.star_makeup_subjects
  for each row execute function public.change_log_write();

drop trigger if exists star_payments_log on public.star_payments;
create trigger star_payments_log
  after insert or update or delete on public.star_payments
  for each row execute function public.change_log_write();

drop trigger if exists star_grades_log on public.star_grades;
create trigger star_grades_log
  after insert or update or delete on public.star_grades
  for each row execute function public.change_log_write();

drop trigger if exists star_result_emails_log on public.star_result_emails;
create trigger star_result_emails_log
  after insert or update or delete on public.star_result_emails
  for each row execute function public.change_log_write();

-- No "empty the whole table" shortcut on any Star table (it would skip
-- the history and the guards), as 0003 / 0005.
drop trigger if exists star_dan_settings_no_truncate on public.star_dan_settings;
create trigger star_dan_settings_no_truncate
  before truncate on public.star_dan_settings
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_categories_no_truncate on public.star_categories;
create trigger star_categories_no_truncate
  before truncate on public.star_categories
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_grade_values_no_truncate on public.star_grade_values;
create trigger star_grade_values_no_truncate
  before truncate on public.star_grade_values
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_assistant_table_no_truncate on public.star_assistant_table;
create trigger star_assistant_table_no_truncate
  before truncate on public.star_assistant_table
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_events_no_truncate on public.star_events;
create trigger star_events_no_truncate
  before truncate on public.star_events
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_event_dans_no_truncate on public.star_event_dans;
create trigger star_event_dans_no_truncate
  before truncate on public.star_event_dans
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_event_categories_no_truncate on public.star_event_categories;
create trigger star_event_categories_no_truncate
  before truncate on public.star_event_categories
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_event_grades_no_truncate on public.star_event_grades;
create trigger star_event_grades_no_truncate
  before truncate on public.star_event_grades
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_event_assistant_no_truncate on public.star_event_assistant;
create trigger star_event_assistant_no_truncate
  before truncate on public.star_event_assistant
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_candidates_no_truncate on public.star_candidates;
create trigger star_candidates_no_truncate
  before truncate on public.star_candidates
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_candidate_signatures_no_truncate on public.star_candidate_signatures;
create trigger star_candidate_signatures_no_truncate
  before truncate on public.star_candidate_signatures
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_makeup_subjects_no_truncate on public.star_makeup_subjects;
create trigger star_makeup_subjects_no_truncate
  before truncate on public.star_makeup_subjects
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_payments_no_truncate on public.star_payments;
create trigger star_payments_no_truncate
  before truncate on public.star_payments
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_grades_no_truncate on public.star_grades;
create trigger star_grades_no_truncate
  before truncate on public.star_grades
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_result_emails_no_truncate on public.star_result_emails;
create trigger star_result_emails_no_truncate
  before truncate on public.star_result_emails
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists star_downloads_no_truncate on public.star_downloads;
create trigger star_downloads_no_truncate
  before truncate on public.star_downloads
  for each statement execute function public.testing_refuse_truncate();

-- 13m. The seed: Rubrics and prices as the school uses them today
-- (contract section 3). Written as the SQL Editor's role, tagged
-- 'star_seed', by "Database admin". It NEVER overwrites: a Dan, grade or
-- assistant row that exists is left alone ("on conflict do nothing"), and
-- a Dan's subjects are added only while that Dan has none at all (so a
-- re-run never brings back a subject an admin renamed or deleted).
--   Dans: pass mark 245 for all; highest star 4 / 3 / 5 (v0.171); fees
--   standard / same day / private (handoff 5, v0.61)
--   Subjects: handoff Appendix A, 70 credits per Dan; Assistant Instructor
--   is the one worked out from the class count
--   Grade values: A+ 4.5 ... D 0.0
--   Assistant table: 12 and under 15/14/13/12/11/10; 13 and up 20/18/16/14/12/10
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'Database admin', true);
select set_config('tkd.action', 'star_seed', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);

insert into public.star_dan_settings (dan, label, pass_mark, star_limit, standard_cents, same_day_cents, private_cents,
                                      created_by_name, updated_by_name)
values (1, '1st Dan', 245, 4, 14000, 15000, 16000, '', ''),
       (2, '2nd Dan', 245, 3, 15000, 16000, 17000, '', ''),
       (3, '3rd Dan', 245, 5, 16000, 17000, 18000, '', '')
on conflict (dan) do nothing;

-- (dan, name, credits, position, from_class_count); the en dash in
-- "White–Deputy" is U+2013
insert into public.star_categories (dan, name, credits, position, from_class_count, created_by_name, updated_by_name)
select s.dan, s.name, s.credits, s.position, s.fcc, '', ''
  from (values
    (1, 'White–Deputy Curriculum', 15, 0, false), (1, 'Go-Ryo Poomse', 10, 1, false),
    (1, 'Advanced Motion', 5, 2, false), (1, 'Advance Sa-Bang Chuck', 5, 3, false),
    (1, 'Step Sa-Bang Chuck', 5, 4, false), (1, 'Two Step Sparring', 5, 5, false),
    (1, 'Breaking', 5, 6, false), (1, 'Appreciation Letters', 5, 7, false),
    (1, 'Assistant Instructor', 5, 8, true), (1, 'Knowledge', 5, 9, false),
    (1, 'Korean Terminology', 5, 10, false),
    (2, 'White–Deputy Curriculum', 10, 0, false), (2, 'Geum-Kang Poomse', 5, 1, false),
    (2, 'Instructor Sa-Bang-Chuk', 5, 2, false), (2, 'Go-Ryo Poomse', 5, 3, false),
    (2, 'Advanced Motion', 5, 4, false), (2, 'Advance Sa-Bang Chuck', 5, 5, false),
    (2, 'Step Sa-Bang Chuck', 5, 6, false), (2, 'Two Step Sparring', 5, 7, false),
    (2, 'Breaking', 5, 8, false), (2, 'Appreciation Letters', 5, 9, false),
    (2, 'Assistant Instructor', 5, 10, true), (2, 'Knowledge', 5, 11, false),
    (2, 'Korean Terminology', 5, 12, false),
    (3, 'White–Deputy Curriculum', 20, 0, false), (3, '1st & 2nd Dan Curriculum', 10, 1, false),
    (3, 'Tae Baek Poomsae', 5, 2, false), (3, '3rd Dan Sa-Bang Chuck', 5, 3, false),
    (3, 'Creative Poomsae', 5, 4, false), (3, 'Breaking', 5, 5, false),
    (3, 'Appreciation Letters', 5, 6, false), (3, 'Assistant Instructor', 5, 7, true),
    (3, 'Knowledge', 5, 8, false), (3, 'Korean Terminology', 5, 9, false)
  ) as s (dan, name, credits, position, fcc)
 where not exists (select 1 from public.star_categories c where c.dan = s.dan);

insert into public.star_grade_values (grade, position, value, created_by_name, updated_by_name)
values ('A+', 1, 4.5, '', ''), ('A', 2, 4.0, '', ''), ('B+', 3, 3.5, '', ''), ('B', 4, 3.0, '', ''),
       ('C+', 5, 2.5, '', ''), ('C', 6, 2.0, '', ''), ('D', 7, 0.0, '', '')
on conflict (grade) do nothing;

insert into public.star_assistant_table (child_max_age,
                                         child_a_plus, child_a, child_b_plus, child_b, child_c_plus, child_c,
                                         adult_a_plus, adult_a, adult_b_plus, adult_b, adult_c_plus, adult_c,
                                         created_by_name, updated_by_name)
values (12, 15, 14, 13, 12, 11, 10, 20, 18, 16, 14, 12, 10, '', '')
on conflict (singleton) do nothing;

select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);

-- ---------------------------------------------------------------------
-- 14. The Candidates tab view: public.star_roster
-- One row per candidate: every star_candidates column the app may read
-- (NEVER the date of birth, the email, the signature, the submission id
-- or a login id), plus the event's testing date, the Dan copy's label,
-- star limit and fees, and the payment state:
--   paid_cents       all payment rows added up (refunds and reversals too)
--   paid             paid_cents > 0 (any amount counts, v0.167)
--   last_payment_*   the latest payment that was NOT reversed (Paid on,
--   / paid_on /      the toast's Undo, the admin's Edit / Undo)
--   paid_method
--   refunded_cents   refunds not reversed, as a positive number
--   expected_fee_cents / fee_kind  the fee owed (rule 12c/12d, written
--                    out here because a security-invoker view runs with
--                    the CALLER's rights and can't call the helpers; "today"
--                    is written the same way as testing_today())
--   overpaid_cents   paid_cents - expected fee when paid and more, else 0
-- security_invoker = true: the table rules (RLS has_data_access, column
-- rights) still apply - a locked session sees no rows.
-- ---------------------------------------------------------------------
create or replace view public.star_roster
with (security_invoker = true)
as
select x.*,
       case x.fee_kind
         when 'none' then 0
         when 'private' then x.private_cents
         when 'standard' then x.standard_cents
         else x.same_day_cents
       end as expected_fee_cents,
       case when x.paid
            then greatest(x.paid_cents - case x.fee_kind
                                           when 'none' then 0
                                           when 'private' then x.private_cents
                                           when 'standard' then x.standard_cents
                                           else x.same_day_cents
                                         end, 0)
            else 0
       end as overpaid_cents
  from (
    select c.id,
           c.event_id,
           c.first_name,
           c.last_name,
           c.location_code,
           c.dan,
           c.stars_from,
           c.paying_by,
           c.source,
           c.reference,
           c.registered_at,
           c.status,
           c.withdrawn_reason,
           c.withdrawn_at,
           c.withdrawn_by_name,
           c.duplicate_state,
           c.duplicate_of,
           c.is_makeup,
           c.makeup_of_candidate_id,
           c.makeup_of_event_name,
           c.private_on,
           c.private_time,
           c.classes_attended,
           c.assistant_classes,
           c.version,
           c.created_at,
           c.updated_at,
           c.created_by_name,
           c.updated_by_name,
           e.testing_date,
           d.label          as dan_label,
           d.star_limit,
           d.standard_cents,
           d.same_day_cents,
           d.private_cents,
           coalesce(t.paid_cents, 0)     as paid_cents,
           coalesce(t.paid_cents, 0) > 0 as paid,
           lp.id            as last_payment_id,
           lp.paid_on,
           lp.method        as paid_method,
           lp.recorded_at   as last_payment_recorded_at,
           lp.recorded_by_name as last_payment_recorded_by_name,
           coalesce(rf.refunded_cents, 0) as refunded_cents,
           case
             when c.is_makeup then 'none'
             when c.private_on is not null then 'private'
             when coalesce(t.paid_cents, 0) > 0 then
               case when lp.paid_on < e.testing_date then 'standard' else 'same_day' end
             when (now() at time zone 'America/New_York')::date < e.testing_date then 'standard'
             else 'same_day'
           end as fee_kind
      from public.star_candidates c
      join public.star_events e     on e.id = c.event_id
      join public.star_event_dans d on d.event_id = c.event_id and d.dan = c.dan
      left join lateral (select sum(p.amount_cents)::integer as paid_cents
                           from public.star_payments p
                          where p.candidate_id = c.id) as t on true
      left join lateral (select p.id, p.paid_on, p.method, p.recorded_at, p.recorded_by_name
                           from public.star_payments p
                          where p.candidate_id = c.id
                            and p.kind = 'payment'
                            and not exists (select 1 from public.star_payments r
                                             where r.reverses_payment_id = p.id)
                          order by p.recorded_at desc, p.id desc
                          limit 1) as lp on true
      left join lateral (select (-sum(p.amount_cents))::integer as refunded_cents
                           from public.star_payments p
                          where p.candidate_id = c.id
                            and p.kind = 'refund'
                            and not exists (select 1 from public.star_payments r
                                             where r.reverses_payment_id = p.id)) as rf on true
  ) as x;

comment on view public.star_roster is
  'Star Candidates tab: candidate (no DOB, email, signature or login ids) + Dan copy + payment state and expected fee. Runs with the caller''s rights.';


-- ---------------------------------------------------------------------
-- 15. Security rules: RLS + grants (the same two layers as 0003 / 0005)
--   * grants: which COLUMNS the app may read - SELECT only. Never the date
--     of birth, the email, anything of the signatures table or the
--     download log, or a login id (created_by, updated_by, withdrawn_by,
--     recorded_by, marked_by, undone_by). No INSERT / UPDATE / DELETE for
--     anyone in the app: every write goes through the functions below.
--   * RLS: which ROWS - every row, but only while has_data_access() is
--     true. The signatures table and the download log: RLS on, no rule,
--     no grants = nobody.
--   * Nothing at all for anon, service_role or PUBLIC.
--   Only Star's own objects are touched here (a "revoke all" on a shared
--   0003 / 0005 table would undo what those migrations granted).
-- ---------------------------------------------------------------------
alter table public.star_dan_settings         enable row level security;
alter table public.star_categories           enable row level security;
alter table public.star_grade_values         enable row level security;
alter table public.star_assistant_table      enable row level security;
alter table public.star_events               enable row level security;
alter table public.star_event_dans           enable row level security;
alter table public.star_event_categories     enable row level security;
alter table public.star_event_grades         enable row level security;
alter table public.star_event_assistant      enable row level security;
alter table public.star_candidates           enable row level security;
alter table public.star_candidate_signatures enable row level security;
alter table public.star_makeup_subjects      enable row level security;
alter table public.star_payments             enable row level security;
alter table public.star_grades               enable row level security;
alter table public.star_result_emails        enable row level security;
alter table public.star_downloads            enable row level security;

-- Start from zero (also removes column grants, so re-runs stay clean)...
revoke all on table public.star_dan_settings, public.star_categories, public.star_grade_values,
                    public.star_assistant_table, public.star_events, public.star_event_dans,
                    public.star_event_categories, public.star_event_grades, public.star_event_assistant,
                    public.star_candidates, public.star_candidate_signatures, public.star_makeup_subjects,
                    public.star_payments, public.star_grades, public.star_result_emails, public.star_downloads,
                    public.star_roster
  from public, anon, authenticated, service_role;
revoke all on sequence public.star_candidate_ref_seq from public, anon, authenticated, service_role;

-- ...then add back exactly what the app reads.
grant select (id, dan, label, pass_mark, star_limit, standard_cents, same_day_cents, private_cents,
              version, created_at, updated_at, created_by_name, updated_by_name)
  on public.star_dan_settings to authenticated;
grant select (id, dan, name, credits, position, from_class_count,
              version, created_at, updated_at, created_by_name, updated_by_name)
  on public.star_categories to authenticated;
grant select (id, grade, position, value, version, created_at, updated_at, created_by_name, updated_by_name)
  on public.star_grade_values to authenticated;
grant select (id, child_max_age, child_a_plus, child_a, child_b_plus, child_b, child_c_plus, child_c,
              adult_a_plus, adult_a, adult_b_plus, adult_b, adult_c_plus, adult_c,
              version, created_at, updated_at, created_by_name, updated_by_name)
  on public.star_assistant_table to authenticated;   -- NOT singleton
grant select (id, name, testing_date, start_time, where_code, registration_open, auto_close_on, first_opened_at,
              public_code_worcester, public_code_shrewsbury, note,
              version, created_at, updated_at, created_by_name, updated_by_name)
  on public.star_events to authenticated;
grant select (id, event_id, dan, label, pass_mark, star_limit, standard_cents, same_day_cents, private_cents)
  on public.star_event_dans to authenticated;
grant select (id, event_id, dan, template_category_id, name, credits, position, from_class_count)
  on public.star_event_categories to authenticated;
grant select (id, event_id, grade, position, value)
  on public.star_event_grades to authenticated;
grant select (id, event_id, child_max_age, child_a_plus, child_a, child_b_plus, child_b, child_c_plus, child_c,
              adult_a_plus, adult_a, adult_b_plus, adult_b, adult_c_plus, adult_c)
  on public.star_event_assistant to authenticated;
grant select (id, event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, reference,
              registered_at, status, withdrawn_reason, withdrawn_at, withdrawn_by_name, duplicate_state,
              duplicate_of, is_makeup, makeup_of_candidate_id, makeup_of_event_name, private_on, private_time,
              classes_attended, assistant_classes, version, created_at, updated_at, created_by_name, updated_by_name)
  on public.star_candidates to authenticated;   -- NOT date_of_birth, email_for_results, withdrawn_by, created_by, updated_by
grant select (id, candidate_id, event_category_id, kind, version, created_at, updated_at, created_by_name, updated_by_name)
  on public.star_makeup_subjects to authenticated;
grant select (id, candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name, reverses_payment_id)
  on public.star_payments to authenticated;     -- NOT recorded_by
grant select (id, candidate_id, event_category_id, grade, kept, kept_from_event_id, kept_from_event_name,
              version, created_at, updated_at, created_by_name, updated_by_name)
  on public.star_grades to authenticated;
grant select (id, candidate_id, marked_at, marked_by_name, result_status, result_total, result_needs, result_key,
              sent_via, undone_at, undone_by_name)
  on public.star_result_emails to authenticated; -- NOT marked_by, undone_by
grant select on public.star_roster to authenticated;

-- Read rules ("(select ...)" = run the check once per query, not per row).
drop policy if exists star_dan_settings_select_with_access on public.star_dan_settings;
create policy star_dan_settings_select_with_access
  on public.star_dan_settings for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_categories_select_with_access on public.star_categories;
create policy star_categories_select_with_access
  on public.star_categories for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_grade_values_select_with_access on public.star_grade_values;
create policy star_grade_values_select_with_access
  on public.star_grade_values for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_assistant_table_select_with_access on public.star_assistant_table;
create policy star_assistant_table_select_with_access
  on public.star_assistant_table for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_events_select_with_access on public.star_events;
create policy star_events_select_with_access
  on public.star_events for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_event_dans_select_with_access on public.star_event_dans;
create policy star_event_dans_select_with_access
  on public.star_event_dans for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_event_categories_select_with_access on public.star_event_categories;
create policy star_event_categories_select_with_access
  on public.star_event_categories for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_event_grades_select_with_access on public.star_event_grades;
create policy star_event_grades_select_with_access
  on public.star_event_grades for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_event_assistant_select_with_access on public.star_event_assistant;
create policy star_event_assistant_select_with_access
  on public.star_event_assistant for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_candidates_select_with_access on public.star_candidates;
create policy star_candidates_select_with_access
  on public.star_candidates for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_makeup_subjects_select_with_access on public.star_makeup_subjects;
create policy star_makeup_subjects_select_with_access
  on public.star_makeup_subjects for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_payments_select_with_access on public.star_payments;
create policy star_payments_select_with_access
  on public.star_payments for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_grades_select_with_access on public.star_grades;
create policy star_grades_select_with_access
  on public.star_grades for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists star_result_emails_select_with_access on public.star_result_emails;
create policy star_result_emails_select_with_access
  on public.star_result_emails for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 16. Internal helpers used by the functions (nobody can call them)
-- ---------------------------------------------------------------------

-- 16a. star_purge_old_signatures() - the 90-day clean-up (v0.162, S9):
-- removes the drawn signature of every candidate whose EVENT's testing
-- date is more than 90 days ago (testing_date < today - 90; also for
-- private testers), and records when. No scheduled job: it runs as the
-- LAST step of star_add_event, star_add_candidate, star_record_payment
-- and of the reads star_home_today and star_makeup_list. NOT from the
-- family form (its login has a 5-second limit per statement, section 17).
-- "skip locked" = rows someone else is working on right now are left for
-- next time, so it never waits. The version and "last changed by" stay as
-- they were (13a), and the history shows only "signature": "on file" ->
-- null plus the removal time (13f). The caller's tags are put back.
-- Returns how many signatures were removed.
create or replace function public.star_purge_old_signatures()
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
  perform set_config('tkd.action', 'star_purge_old_signatures', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  update public.star_candidate_signatures s
     set signature = null,
         signature_deleted_at = now()
   where s.id in (select x.id
                    from public.star_candidate_signatures x
                    join public.star_candidates c on c.id = x.candidate_id
                    join public.star_events e on e.id = c.event_id
                   where x.signature is not null
                     and e.testing_date < public.testing_today() - 90
                     for update of x skip locked);
  get diagnostics v_n = row_count;

  perform set_config('tkd.action', coalesce(v_action, ''), true);
  perform set_config('tkd.batch_id', coalesce(v_batch, ''), true);
  return v_n;
end;
$$;

revoke execute on function public.star_purge_old_signatures() from public, anon, authenticated, service_role;

-- 16b. star_find_duplicate(event, exclude_id, first, last, dob) - another
-- ACTIVE candidate in the same event with the same first and last name
-- (ignoring capitals and extra spaces) AND the same date of birth - or the
-- names alone when either side has no date of birth (S3). The oldest one
-- wins. A row "kept both" together with exclude_id doesn't count.
create or replace function public.star_find_duplicate(
  p_event_id   uuid,
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
    from public.star_candidates m
   where m.event_id = p_event_id
     and m.status = 'active'
     and (p_exclude_id is null or m.id <> p_exclude_id)
     and lower(m.first_name) = lower(public.testing_normalize_name(p_first))
     and lower(m.last_name) = lower(public.testing_normalize_name(p_last))
     and (m.date_of_birth is null or p_dob is null or m.date_of_birth = p_dob)
     and not (p_exclude_id is not null and m.duplicate_state = 'kept_both' and m.duplicate_of = p_exclude_id)
   order by m.registered_at, m.id
   limit 1;
$$;

revoke execute on function public.star_find_duplicate(uuid, uuid, text, text, date) from public, anon, authenticated, service_role;

-- 16c. star_recheck_duplicate(candidate) - works out one candidate's
-- "possible duplicate" mark again (after an insert, a name / DOB edit, a
-- withdraw, restore or removal nearby), as 0005's 12c:
--   withdrawn -> none; kept both with a partner that still matches ->
--   unchanged; another active match -> possible; no match -> none.
-- Writes only if something changes.
create or replace function public.star_recheck_duplicate(p_candidate_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_c     public.star_candidates;
  v_state text;
  v_of    uuid;
begin
  select * into v_c from public.star_candidates c where c.id = p_candidate_id;
  if not found then
    return;
  end if;

  if v_c.status <> 'active' then
    v_state := 'none';
    v_of    := null;
  elsif v_c.duplicate_state = 'kept_both'
        and v_c.duplicate_of is not null
        and exists (select 1 from public.star_candidates m
                     where m.id = v_c.duplicate_of
                       and m.status = 'active'
                       and m.event_id = v_c.event_id
                       and lower(m.first_name) = lower(v_c.first_name)
                       and lower(m.last_name) = lower(v_c.last_name)
                       and (m.date_of_birth is null or v_c.date_of_birth is null
                            or m.date_of_birth = v_c.date_of_birth)) then
    return;   -- staff said these two are both real
  else
    v_of    := public.star_find_duplicate(v_c.event_id, v_c.id, v_c.first_name, v_c.last_name, v_c.date_of_birth);
    v_state := case when v_of is null then 'none' else 'possible' end;
  end if;

  update public.star_candidates c
     set duplicate_state = v_state,
         duplicate_of    = v_of
   where c.id = p_candidate_id
     and (c.duplicate_state is distinct from v_state or c.duplicate_of is distinct from v_of);
end;
$$;

revoke execute on function public.star_recheck_duplicate(uuid) from public, anon, authenticated, service_role;

-- 16d. star_recheck_pointing_at(candidate) - rechecks every candidate
-- whose duplicate_of points at this one (in id order).
create or replace function public.star_recheck_pointing_at(p_candidate_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select c.id from public.star_candidates c
               where c.duplicate_of = p_candidate_id
               order by c.id loop
    perform public.star_recheck_duplicate(v_id);
  end loop;
end;
$$;

revoke execute on function public.star_recheck_pointing_at(uuid) from public, anon, authenticated, service_role;

-- 16e. star_lock_candidate(candidate) - shared start of the candidate
-- functions: finds the candidate's event, locks event ("for no key
-- update") -> candidate ("for update"), and returns the locked candidate
-- (all fields NULL if it is gone).
-- locks: event (no key update) -> candidate (update)
create or replace function public.star_lock_candidate(p_candidate_id uuid)
returns public.star_candidates
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_c        public.star_candidates;
begin
  select c.event_id into v_event_id from public.star_candidates c where c.id = p_candidate_id;
  if not found then
    return null;
  end if;
  perform 1 from public.star_events e where e.id = v_event_id for no key update;
  select * into v_c from public.star_candidates c where c.id = p_candidate_id for update;
  return v_c;
end;
$$;

revoke execute on function public.star_lock_candidate(uuid) from public, anon, authenticated, service_role;

-- 16f. star_lock_payment(payment) - shared start of Undo / Edit payment:
-- finds the payment's candidate, locks event -> candidate -> the payment,
-- and returns the locked payment (all fields NULL if it is gone).
-- locks: event (no key update) -> candidate (update) -> payment (update)
create or replace function public.star_lock_payment(p_payment_id uuid)
returns public.star_payments
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_candidate_id uuid;
  v_c            public.star_candidates;
  v_p            public.star_payments;
begin
  select p.candidate_id into v_candidate_id from public.star_payments p where p.id = p_payment_id;
  if not found then
    return null;
  end if;
  v_c := public.star_lock_candidate(v_candidate_id);
  if v_c.id is null then
    return null;
  end if;
  select * into v_p from public.star_payments p where p.id = p_payment_id for update;
  return v_p;
end;
$$;

revoke execute on function public.star_lock_payment(uuid) from public, anon, authenticated, service_role;

-- 16g. star_copy_template_into_event(event) - the copy rule (v0.61):
-- every Dan, subject, grade value and the assistant row as they are AT
-- THIS MOMENT go into the event's copy tables. Run only by
-- star_add_event, after it share-locked the whole template (so nothing
-- can change half-way through).
create or replace function public.star_copy_template_into_event(p_event_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  insert into public.star_event_dans
    (event_id, dan, label, pass_mark, star_limit, standard_cents, same_day_cents, private_cents)
  select p_event_id, d.dan, d.label, d.pass_mark, d.star_limit, d.standard_cents, d.same_day_cents, d.private_cents
    from public.star_dan_settings d
   order by d.dan;

  insert into public.star_event_categories
    (event_id, dan, template_category_id, name, credits, position, from_class_count)
  select p_event_id, k.dan, k.id, k.name, k.credits, k.position, k.from_class_count
    from public.star_categories k
   order by k.dan, k.position;

  insert into public.star_event_grades (event_id, grade, position, value)
  select p_event_id, v.grade, v.position, v.value
    from public.star_grade_values v
   order by v.position;

  insert into public.star_event_assistant
    (event_id, child_max_age, child_a_plus, child_a, child_b_plus, child_b, child_c_plus, child_c,
     adult_a_plus, adult_a, adult_b_plus, adult_b, adult_c_plus, adult_c)
  select p_event_id, a.child_max_age, a.child_a_plus, a.child_a, a.child_b_plus, a.child_b, a.child_c_plus, a.child_c,
         a.adult_a_plus, a.adult_a, a.adult_b_plus, a.adult_b, a.adult_c_plus, a.adult_c
    from public.star_assistant_table a;
end;
$$;

revoke execute on function public.star_copy_template_into_event(uuid) from public, anon, authenticated, service_role;

-- 16h. star_public_answer(candidate) - the "You're registered" answer
-- the family page shows: only what that family just sent plus the event
-- facts. No DOB, no email, no signature, nothing about anyone else -
-- and the same shape whether or not the person looks like a duplicate.
create or replace function public.star_public_answer(p_candidate_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'status',         'ok',
           'reference',      c.reference,
           'first_name',     c.first_name,
           'last_name',      c.last_name,
           'dan',            c.dan,
           'dan_label',      d.label,
           'stars_from',     c.stars_from,
           'stars_to',       c.stars_from + 1,
           'standard_cents', d.standard_cents,
           'same_day_cents', d.same_day_cents,
           'paying_by',      c.paying_by,
           'event_name',     e.name,
           'testing_date',   e.testing_date,
           'start_time',     left(e.start_time::text, 5),
           'school_name',    l.name,
           'where',          jsonb_build_object('name', w.name,
                                                'address', public.testing_location_address(e.where_code)))
    from public.star_candidates c
    join public.star_events e     on e.id = c.event_id
    join public.star_event_dans d on d.event_id = c.event_id and d.dan = c.dan
    join public.locations l       on l.code = c.location_code
    join public.locations w       on w.code = e.where_code
   where c.id = p_candidate_id;
$$;

revoke execute on function public.star_public_answer(uuid) from public, anon, authenticated, service_role;

-- 16i. star_history_strip(row) - takes every login-id key out of a
-- history row's before / after (History never shows who by login id,
-- only by name). NULL stays NULL.
create or replace function public.star_history_strip(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select p_row - array['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'marked_by', 'undone_by'];
$$;

revoke execute on function public.star_history_strip(jsonb) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 17. The restricted login for the Star family form: star_registrar
-- The same settings as 0005's testing_registrar (read its section 13):
-- it can sign in (password set separately as a SCRAM verifier made on
-- Jeffrey's PC - SETUP.md section 13. NO password in this file), has no
-- inherited rights, can't create databases or roles, can't skip RLS,
-- at most 5 connections, a stuck call is cut off after 5 seconds, and
-- nothing is found without its schema name. It can run exactly the two
-- functions of section 20 and has no right on any table, view or counter.
-- Created only if it doesn't exist yet, so re-running this file never
-- touches an existing role's attributes or password.
-- testing_registrar can't run Star's functions and star_registrar can't
-- run Color Belt's.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'star_registrar') then
    create role star_registrar login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5;
  end if;
end
$$;

alter role star_registrar set statement_timeout = '5s';
alter role star_registrar set idle_in_transaction_session_timeout = '10s';
alter role star_registrar set search_path = '';

-- It needs to find the two functions in schema public, nothing more.
grant usage on schema public to star_registrar;

-- ---------------------------------------------------------------------
-- 18. The staff WRITE functions (the only way to change Star data).
--     Same pattern as 0003 section 8 and 0005 section 14:
--   * returns {"status": ...}; the statuses are listed in the header
--   * checks in this order: 1 has_data_access() FIRST (no_access), 2 the
--     role (A = admins only -> not_allowed; S = staff and admins), 3 the
--     input (invalid) - nothing is looked up before 1-2, 4 it locks and
--     looks up the rows (not_found), 5 "did the screen see the latest
--     version?" (stale), 6 the rules that depend on the data, 7 a
--     duplicate name, 8 it writes
--   * tags its writes with tkd.action (= the function's name) + one new
--     tkd.batch_id, and clears both after writing
--   * the whole body is inside begin ... exception ... end: if a table
--     rule still says no, everything this call did is undone and a status
--     is answered instead of an error:
--       the event-name / subject-name indexes -> duplicate_name
--       any other unique rule                 -> stale
--       foreign key / check / not-null rule   -> invalid
--       deadlock / serialization / lock not available -> stale
--   * LOCK ORDER (contract 1.5): the EVENT first, then the candidate, then
--     the payment / grade / result-email row ("for no key update" on the
--     parents, "for update" on the row changed or removed). Rubric edits
--     lock the Dan rows in Dan order first. Each function's comment
--     states its own order ("locks: ...").
--   * no argument has a default; whole numbers are "integer" (the app's
--     database driver sends them as int4).
-- ---------------------------------------------------------------------

-- 18a. star_update_dan_settings(p_dan, p_expected_version, p_pass_mark,
--        p_star_limit, p_standard_cents, p_same_day_cents, p_private_cents)   A
-- A Dan's pass mark (more than 0, up to 9999.9, one decimal at most),
-- highest star (1-20) and three fees (whole dollars $0-$1,000).
-- Saving the same values writes nothing.
-- locks: the Dan row (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.star_update_dan_settings(
  p_dan              integer,
  p_expected_version integer,
  p_pass_mark        numeric,
  p_star_limit       integer,
  p_standard_cents   integer,
  p_same_day_cents   integer,
  p_private_cents    integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d          public.star_dan_settings;
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

    if p_dan is null or p_expected_version is null or p_pass_mark is null or p_star_limit is null
       or p_pass_mark <= 0 or p_pass_mark > 9999.9 or p_pass_mark <> round(p_pass_mark, 1)
       or p_star_limit not between 1 and 20
       or not public.testing_cents_is_valid(p_standard_cents)
       or not public.testing_cents_is_valid(p_same_day_cents)
       or not public.testing_cents_is_valid(p_private_cents) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_d from public.star_dan_settings d where d.dan = p_dan for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_d.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'star_update_dan_settings', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_dan_settings d
       set pass_mark      = p_pass_mark,
           star_limit     = p_star_limit,
           standard_cents = p_standard_cents,
           same_day_cents = p_same_day_cents,
           private_cents  = p_private_cents
     where d.dan = p_dan
       and (d.pass_mark is distinct from p_pass_mark
            or d.star_limit is distinct from p_star_limit
            or d.standard_cents is distinct from p_standard_cents
            or d.same_day_cents is distinct from p_same_day_cents
            or d.private_cents is distinct from p_private_cents)
    returning d.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_d.version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_update_dan_settings(integer, integer, numeric, integer, integer, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_update_dan_settings(integer, integer, numeric, integer, integer, integer, integer) to authenticated;

-- 18b. star_add_category(p_dan, p_name, p_credits)   A
-- A new judged subject at the end of the Dan's list (credits 1-100).
-- New subjects are always judged (from_class_count false).
-- locks: the Dan row (no key update)
-- Ok: {"status":"ok","id":...,"version":1,"position":n}
create or replace function public.star_add_category(
  p_dan     integer,
  p_name    text,
  p_credits integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name       text;
  v_position   integer;
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

    if p_dan is null or not public.testing_name_is_valid(p_name)
       or p_credits is null or p_credits not between 1 and 100 then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_name := public.testing_normalize_name(p_name);

    perform 1 from public.star_dan_settings d where d.dan = p_dan for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if exists (select 1 from public.star_categories k where k.dan = p_dan and lower(k.name) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    perform set_config('tkd.action', 'star_add_category', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    select coalesce(max(k.position) + 1, 0) into v_position from public.star_categories k where k.dan = p_dan;
    insert into public.star_categories (dan, name, credits, position, from_class_count, created_by_name, updated_by_name)
    values (p_dan, v_name, p_credits, v_position, false, '', '')
    returning id, version into v_id, v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version, 'position', v_position);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_add_category(integer, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_add_category(integer, text, integer) to authenticated;

-- 18c. star_update_category(p_category_id, p_expected_version, p_name,
--        p_credits)   A
-- Rename / re-credit a subject (Assistant Instructor too). Its Dan and
-- whether it comes from the class count never change. Same values ->
-- nothing written.
-- locks: the Dan row (no key update) -> the subject (update)
-- Ok: {"status":"ok","id":...,"version":n}
create or replace function public.star_update_category(
  p_category_id      uuid,
  p_expected_version integer,
  p_name             text,
  p_credits          integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name       text;
  v_dan        smallint;
  v_k          public.star_categories;
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

    if p_category_id is null or p_expected_version is null or not public.testing_name_is_valid(p_name)
       or p_credits is null or p_credits not between 1 and 100 then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_name := public.testing_normalize_name(p_name);

    select k.dan into v_dan from public.star_categories k where k.id = p_category_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.star_dan_settings d where d.dan = v_dan for no key update;
    select * into v_k from public.star_categories k where k.id = p_category_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_k.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    if exists (select 1 from public.star_categories k
                where k.dan = v_dan and k.id <> p_category_id and lower(k.name) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    perform set_config('tkd.action', 'star_update_category', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_categories k
       set name    = v_name,
           credits = p_credits
     where k.id = p_category_id
       and (k.name is distinct from v_name or k.credits is distinct from p_credits)
    returning k.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', p_category_id, 'version', coalesce(v_version, v_k.version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_update_category(uuid, integer, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_update_category(uuid, integer, text, integer) to authenticated;

-- 18d. star_reorder_categories(p_dan, p_expected_ids, p_new_ids)   A
-- Exactly 0003's reorder with the Dan instead of the school:
--   p_expected_ids = the order the screen showed (else stale)
--   p_new_ids      = the same ids in the new order (else invalid)
-- Only rows that really move are written; no version changes.
-- locks: the Dan row (no key update)
-- Ok: {"status":"ok"}
create or replace function public.star_reorder_categories(
  p_dan          integer,
  p_expected_ids uuid[],
  p_new_ids      uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_dan is null
       or not exists (select 1 from public.star_dan_settings d where d.dan = p_dan)
       or not public.star_ids_are_valid(p_expected_ids)
       or not public.star_ids_are_valid(p_new_ids)
       or cardinality(p_expected_ids) <> cardinality(p_new_ids)
       or array(select x.id from unnest(p_expected_ids) as x(id) order by x.id)
          <> array(select x.id from unnest(p_new_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform 1 from public.star_dan_settings d where d.dan = p_dan for no key update;

    if array(select k.id from public.star_categories k where k.dan = p_dan order by k.position)
       <> p_expected_ids then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'star_reorder_categories', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- one statement, so the position rule is checked once at its end
    update public.star_categories k
       set position = n.ord - 1
      from unnest(p_new_ids) with ordinality as n(id, ord)
     where k.id = n.id
       and k.dan = p_dan
       and k.position <> n.ord - 1;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_reorder_categories(integer, uuid[], uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.star_reorder_categories(integer, uuid[], uuid[]) to authenticated;

-- 18e. star_delete_category(p_category_id, p_expected_version)   A
-- Removes a judged subject from the template; later subjects move up by
-- one. Assistant Instructor can't be removed (invalid, v0.61). Events keep
-- their own copy.
-- locks: the Dan row (no key update) -> the subject (update)
-- Ok: {"status":"ok"}
create or replace function public.star_delete_category(
  p_category_id      uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dan        smallint;
  v_k          public.star_categories;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_category_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select k.dan into v_dan from public.star_categories k where k.id = p_category_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.star_dan_settings d where d.dan = v_dan for no key update;
    select * into v_k from public.star_categories k where k.id = p_category_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_k.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_k.from_class_count then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'star_delete_category', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.star_categories k where k.id = p_category_id;
    update public.star_categories k
       set position = k.position - 1
     where k.dan = v_dan
       and k.position > v_k.position;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_delete_category(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_delete_category(uuid, integer) to authenticated;

-- 18f. star_update_grade_values(p_expected_versions, p_values)   A
-- The 7 values, in the order A+, A, B+, B, C+, C, D: each 0-9.9 with at
-- most one decimal, STRICTLY going down (D may be more than 0). The
-- versions are the 7 rows' versions as the screen showed them.
-- locks: every Dan row in Dan order (no key update) -> the 7 rows by
--        position (update)
-- Ok: {"status":"ok","versions":[7 numbers]}
create or replace function public.star_update_grade_values(
  p_expected_versions integer[],
  p_values            numeric[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_i          integer;
  v_versions   integer[];
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_expected_versions is null or p_values is null
       or coalesce(array_ndims(p_expected_versions), 0) <> 1 or coalesce(array_ndims(p_values), 0) <> 1
       or cardinality(p_expected_versions) <> 7 or cardinality(p_values) <> 7
       or array_lower(p_values, 1) <> 1 or array_lower(p_expected_versions, 1) <> 1
       or exists (select 1 from unnest(p_expected_versions) as x(v) where x.v is null)
       or exists (select 1 from unnest(p_values) as x(v)
                   where x.v is null or x.v < 0 or x.v > 9.9 or x.v <> round(x.v, 1)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    for v_i in 1 .. 6 loop
      if p_values[v_i] <= p_values[v_i + 1] then
        return jsonb_build_object('status', 'invalid');
      end if;
    end loop;

    perform 1 from public.star_dan_settings d order by d.dan for no key update;
    perform 1 from public.star_grade_values v order by v.position for update;
    v_versions := array(select v.version from public.star_grade_values v order by v.position);
    if cardinality(v_versions) <> 7 then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_versions <> p_expected_versions then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'star_update_grade_values', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_grade_values v
       set value = p_values[v.position]
     where v.value is distinct from p_values[v.position];

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok',
                              'versions', to_jsonb(array(select v.version from public.star_grade_values v order by v.position)));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_update_grade_values(integer[], numeric[]) from public, anon, authenticated, service_role;
grant  execute on function public.star_update_grade_values(integer[], numeric[]) to authenticated;

-- 18g. star_update_assistant_table(p_expected_version, p_child_max_age,
--        p_child_mins, p_adult_mins)   A
-- The age split (1-30, "12 and under") and the minimum assistant
-- classes for A+, A, B+, B, C+, C per age group (6 numbers each, 1-999,
-- STRICTLY going down). D = below the C minimum.
-- locks: every Dan row in Dan order (no key update) -> the row (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.star_update_assistant_table(
  p_expected_version integer,
  p_child_max_age    integer,
  p_child_mins       integer[],
  p_adult_mins       integer[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a          public.star_assistant_table;
  v_i          integer;
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

    if p_expected_version is null or p_child_max_age is null or p_child_max_age not between 1 and 30
       or p_child_mins is null or p_adult_mins is null
       or coalesce(array_ndims(p_child_mins), 0) <> 1 or coalesce(array_ndims(p_adult_mins), 0) <> 1
       or cardinality(p_child_mins) <> 6 or cardinality(p_adult_mins) <> 6
       or array_lower(p_child_mins, 1) <> 1 or array_lower(p_adult_mins, 1) <> 1
       or exists (select 1 from unnest(p_child_mins || p_adult_mins) as x(v)
                   where x.v is null or x.v not between 1 and 999) then
      return jsonb_build_object('status', 'invalid');
    end if;
    for v_i in 1 .. 5 loop
      if p_child_mins[v_i] <= p_child_mins[v_i + 1] or p_adult_mins[v_i] <= p_adult_mins[v_i + 1] then
        return jsonb_build_object('status', 'invalid');
      end if;
    end loop;

    perform 1 from public.star_dan_settings d order by d.dan for no key update;
    select * into v_a from public.star_assistant_table a for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_a.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'star_update_assistant_table', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_assistant_table a
       set child_max_age = p_child_max_age,
           child_a_plus = p_child_mins[1], child_a = p_child_mins[2], child_b_plus = p_child_mins[3],
           child_b = p_child_mins[4], child_c_plus = p_child_mins[5], child_c = p_child_mins[6],
           adult_a_plus = p_adult_mins[1], adult_a = p_adult_mins[2], adult_b_plus = p_adult_mins[3],
           adult_b = p_adult_mins[4], adult_c_plus = p_adult_mins[5], adult_c = p_adult_mins[6]
     where a.id = v_a.id
       and (a.child_max_age, a.child_a_plus, a.child_a, a.child_b_plus, a.child_b, a.child_c_plus, a.child_c,
            a.adult_a_plus, a.adult_a, a.adult_b_plus, a.adult_b, a.adult_c_plus, a.adult_c)
           is distinct from
           (p_child_max_age::smallint, p_child_mins[1], p_child_mins[2], p_child_mins[3], p_child_mins[4],
            p_child_mins[5], p_child_mins[6], p_adult_mins[1], p_adult_mins[2], p_adult_mins[3],
            p_adult_mins[4], p_adult_mins[5], p_adult_mins[6])
    returning a.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_a.version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_update_assistant_table(integer, integer, integer[], integer[]) from public, anon, authenticated, service_role;
grant  execute on function public.star_update_assistant_table(integer, integer, integer[], integer[]) to authenticated;

-- 18h. star_add_event(p_name, p_testing_date, p_start_time, p_where_code,
--        p_registration_open, p_auto_close_on, p_note)   A
-- Creates an event and copies the WHOLE template into it (16g):
--   p_testing_date    today or later
--   p_start_time      8:00 AM - 8:00 PM on a 15-minute step
--   p_where_code      'worcester' or 'shrewsbury' (information only)
--   p_registration_open  true = open straight away; false = "Not open yet"
--   p_auto_close_on   NULL or from today up to the testing date
--   p_note            NULL or up to 600 characters
-- The template must be complete (every Dan has subjects and exactly one
-- Assistant Instructor) - else invalid. Two link codes are drawn (one per
-- school), never used by any other event in either column; a transaction
-- lock on a fixed number makes two Add event calls draw one after the
-- other. Last step: the signature clean-up (16a).
-- locks: the template, share (every Dan row in Dan order, the grade values
--        by position, the assistant row, the subjects by Dan and
--        position) -> the code lock
-- Ok: {"status":"ok","id":...,"public_code_worcester":"...","public_code_shrewsbury":"...","version":1}
create or replace function public.star_add_event(
  p_name              text,
  p_testing_date      date,
  p_start_time        time,
  p_where_code        text,
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
  v_code_w     text;
  v_code_s     text;
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

    v_today := public.testing_today();
    v_name  := public.testing_normalize_name(p_name);
    v_note  := public.testing_normalize_note(p_note);
    if not public.testing_name_is_valid(p_name)
       or p_testing_date is null or p_testing_date < v_today
       or not public.star_start_time_is_valid(p_start_time)
       or p_where_code is null
       or not exists (select 1 from public.locations l where l.code = p_where_code)
       or p_registration_open is null
       or (p_auto_close_on is not null and (p_auto_close_on < v_today or p_auto_close_on > p_testing_date))
       or (v_note is not null and not public.testing_note_is_valid(v_note)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. share-lock the template so it can't change half-way through the copy
    perform 1 from public.star_dan_settings d order by d.dan for share;
    perform 1 from public.star_grade_values v order by v.position for share;
    perform 1 from public.star_assistant_table a for share;
    perform 1 from public.star_categories k order by k.dan, k.position for share;

    -- 6. the template must be complete
    if not exists (select 1 from public.star_dan_settings)
       or (select count(*) from public.star_grade_values) <> 7
       or not exists (select 1 from public.star_assistant_table)
       or exists (select 1 from public.star_dan_settings d
                   where not exists (select 1 from public.star_categories k where k.dan = d.dan)
                      or (select count(*) from public.star_categories k where k.dan = d.dan and k.from_class_count) <> 1) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 7. the name
    if exists (select 1 from public.star_events e
                where lower(public.testing_normalize_name(e.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write
    perform set_config('tkd.action', 'star_add_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    perform pg_advisory_xact_lock(hashtext('star_public_code'));
    loop
      v_code_w := public.testing_new_public_code();
      v_code_s := public.testing_new_public_code();
      exit when v_code_w <> v_code_s
            and not exists (select 1 from public.star_events e
                             where e.public_code_worcester in (v_code_w, v_code_s)
                                or e.public_code_shrewsbury in (v_code_w, v_code_s));
    end loop;

    insert into public.star_events
      (name, testing_date, start_time, where_code, registration_open, auto_close_on, first_opened_at,
       public_code_worcester, public_code_shrewsbury, note, created_by_name, updated_by_name)
    values
      (v_name, p_testing_date, p_start_time, p_where_code, p_registration_open, p_auto_close_on,
       case when p_registration_open then now() end, v_code_w, v_code_s, v_note, '', '')
    returning id, version into v_id, v_version;

    perform public.star_copy_template_into_event(v_id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.star_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'id', v_id,
                              'public_code_worcester', v_code_w, 'public_code_shrewsbury', v_code_s,
                              'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_add_event(text, date, time, text, boolean, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_add_event(text, date, time, text, boolean, date, text) to authenticated;

-- 18i. star_update_event(p_event_id, p_expected_version, p_name,
--        p_testing_date, p_start_time, p_where_code, p_auto_close_on,
--        p_note)   A
-- Edit event: name, date, start time, where, closing date and note.
--   testing date: a CHANGED date must be today or later (a past event may
--     keep its date; moving it into the future makes it Upcoming again)
--   closing date: a CHANGED one must not be in the past; any closing date
--     must be on or before the (new) testing date
-- The Registration switch is NOT here: the dialog calls
-- star_set_registration afterwards when the switch changed. The event's
-- copy of the rubrics is never touched. Same values -> nothing written.
-- locks: the event (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.star_update_event(
  p_event_id         uuid,
  p_expected_version integer,
  p_name             text,
  p_testing_date     date,
  p_start_time       time,
  p_where_code       text,
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
  v_e          public.star_events;
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

    v_today := public.testing_today();
    v_name  := public.testing_normalize_name(p_name);
    v_note  := public.testing_normalize_note(p_note);
    if p_event_id is null or p_expected_version is null
       or not public.testing_name_is_valid(p_name)
       or p_testing_date is null
       or not public.star_start_time_is_valid(p_start_time)
       or p_where_code is null
       or not exists (select 1 from public.locations l where l.code = p_where_code)
       or (v_note is not null and not public.testing_note_is_valid(v_note)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_e from public.star_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    if p_testing_date is distinct from v_e.testing_date and p_testing_date < v_today then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_auto_close_on is distinct from v_e.auto_close_on and p_auto_close_on is not null
       and p_auto_close_on < v_today then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_auto_close_on is not null and p_auto_close_on > p_testing_date then
      return jsonb_build_object('status', 'invalid');
    end if;

    if exists (select 1 from public.star_events e
                where e.id <> p_event_id
                  and lower(public.testing_normalize_name(e.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    perform set_config('tkd.action', 'star_update_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_events e
       set name          = v_name,
           testing_date  = p_testing_date,
           start_time    = p_start_time,
           where_code    = p_where_code,
           auto_close_on = p_auto_close_on,
           note          = v_note
     where e.id = p_event_id
       and (e.name is distinct from v_name
            or e.testing_date is distinct from p_testing_date
            or e.start_time is distinct from p_start_time
            or e.where_code is distinct from p_where_code
            or e.auto_close_on is distinct from p_auto_close_on
            or e.note is distinct from v_note)
    returning e.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_e.version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_update_event(uuid, integer, text, date, time, text, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_update_event(uuid, integer, text, date, time, text, date, text) to authenticated;

-- 18j. star_set_registration(p_event_id, p_expected_version, p_open)   S / A
-- The Open / Closed switch, exactly 0005's testing_set_registration
-- (v0.85, v0.86):
--   close: staff and admins, any time before Finished
--   open, closing date not passed (or none): staff and admins; the first
--     opening sets first_opened_at
--   open AFTER the closing date passed: admins only, and the closing date
--     is removed; staff -> not_allowed
--   once Finished nothing changes the switch -> finished
-- Switching to what it already is writes nothing.
-- locks: the event (update)
-- Ok: {"status":"ok","version":n,"state":"open"|...}
create or replace function public.star_set_registration(
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
  v_e          public.star_events;
  v_clear      boolean := false;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    -- 2. role: any staff member with data access (the admin-only case is below)

    if p_event_id is null or p_expected_version is null or p_open is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_e from public.star_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    v_today := public.testing_today();
    if public.star_event_state(v_e, v_today) = 'finished' then
      return jsonb_build_object('status', 'finished');
    end if;
    if p_open and v_e.auto_close_on is not null and v_today > v_e.auto_close_on then
      if public.is_admin() is not true then
        return jsonb_build_object('status', 'not_allowed');
      end if;
      v_clear := true;
    end if;

    perform set_config('tkd.action', 'star_set_registration', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_events e
       set registration_open = p_open,
           first_opened_at   = case when p_open then coalesce(e.first_opened_at, now()) else e.first_opened_at end,
           auto_close_on     = case when v_clear then null else e.auto_close_on end
     where e.id = p_event_id
       and (e.registration_open is distinct from p_open or v_clear)
    returning * into v_e;
    if not found then
      select * into v_e from public.star_events e where e.id = p_event_id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_e.version,
                              'state', public.star_event_state(v_e, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_set_registration(uuid, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.star_set_registration(uuid, integer, boolean) to authenticated;

-- 18k. star_delete_event(p_event_id, p_expected_version,
--        p_expected_candidate_count, p_expected_payment_total_cents)   A
-- Removes an event with its copy, candidates, signatures, grades, make-up
-- subjects, payments and result emails (its candidates are removed first,
-- then the event; "on delete cascade" takes the rest; every removed row
-- is in the history, tagged star_delete_event, one batch).
-- The two numbers are what the confirmation dialog said: ALL candidates
-- (withdrawn too) and the payments' NET total. If either differs now,
-- nothing is removed: stale.
-- Side effect (known): a make-up row in a LATER event that points at one
-- of these candidates keeps its row, with the link set to NULL.
-- locks: the event (update) -> its candidates in id order (update) ->
--        their payments in id order (update)
-- Ok: {"status":"ok"}
create or replace function public.star_delete_event(
  p_event_id                     uuid,
  p_expected_version             integer,
  p_expected_candidate_count     integer,
  p_expected_payment_total_cents integer
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
       or p_expected_candidate_count is null or p_expected_payment_total_cents is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select e.version into v_version from public.star_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.star_candidates c where c.event_id = p_event_id order by c.id for update;
    perform 1 from public.star_payments p
      join public.star_candidates c on c.id = p.candidate_id
     where c.event_id = p_event_id
     order by p.id
       for update of p;

    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    select count(*) into v_count from public.star_candidates c where c.event_id = p_event_id;
    select coalesce(sum(p.amount_cents), 0) into v_total
      from public.star_payments p
      join public.star_candidates c on c.id = p.candidate_id
     where c.event_id = p_event_id;
    if v_count <> p_expected_candidate_count or v_total <> p_expected_payment_total_cents then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'star_delete_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- the candidates first (their signatures, grades, make-up subjects,
    -- payments and result emails go with them), then the event with its
    -- copy. In this order the "no action" links from grades and make-up
    -- subjects to the event's subjects (and from candidates to the Dan
    -- copy) never point at a removed row.
    delete from public.star_candidates c where c.event_id = p_event_id;
    delete from public.star_events e where e.id = p_event_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_delete_event(uuid, integer, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_delete_event(uuid, integer, integer, integer) to authenticated;

-- 18l. star_add_candidate(p_event_id, p_first, p_last, p_date_of_birth,
--        p_email, p_location_code, p_dan, p_stars_from, p_paying_by)   S
-- New candidate at the desk (source 'desk', no reference, no signature),
-- in any event state except Finished (also when registration is closed
-- and on the testing day, v0.111).
--   p_date_of_birth  may be NULL (a walk-in may not know it, S3); if set,
--                    not in the future and not before 1900-01-01
--   p_email          required (OPEN-20), trimmed, stored as typed
--   p_location_code  'worcester' or 'shrewsbury'
--   p_dan / p_stars_from  a Dan of the event's copy, 0 <= stars < its
--                    highest star
--   p_paying_by      cash / check / card
-- A same-name (and same-DOB, when both are known) candidate in the event
-- marks the new one "possible duplicate". Last step: the signature
-- clean-up (16a).
-- locks: the event (no key update)
-- Ok: {"status":"ok","id":...,"version":1}
create or replace function public.star_add_candidate(
  p_event_id      uuid,
  p_first         text,
  p_last          text,
  p_date_of_birth date,
  p_email         text,
  p_location_code text,
  p_dan           integer,
  p_stars_from    integer,
  p_paying_by     text
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
  v_e          public.star_events;
  v_d          public.star_event_dans;
  v_dup        uuid;
  v_id         uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    v_today := public.testing_today();
    v_email := btrim(p_email);
    if p_event_id is null
       or not public.testing_name_is_valid(p_first)
       or not public.testing_name_is_valid(p_last)
       or (p_date_of_birth is not null and (p_date_of_birth > v_today or p_date_of_birth < date '1900-01-01'))
       or not public.star_email_is_valid(v_email)
       or p_location_code is null or p_location_code not in ('worcester', 'shrewsbury')
       or p_dan is null or p_stars_from is null or p_stars_from < 0
       or p_paying_by is null or p_paying_by not in ('cash', 'check', 'card') then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_e from public.star_events e where e.id = p_event_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if public.star_event_state(v_e, v_today) = 'finished' then
      return jsonb_build_object('status', 'finished');
    end if;
    select * into v_d from public.star_event_dans d where d.event_id = p_event_id and d.dan = p_dan;
    if not found or p_stars_from >= v_d.star_limit then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'star_add_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    v_dup := public.star_find_duplicate(p_event_id, null, p_first, p_last, p_date_of_birth);
    insert into public.star_candidates
      (event_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan, stars_from,
       paying_by, source, duplicate_state, duplicate_of, created_by_name, updated_by_name)
    values
      (p_event_id, public.testing_normalize_name(p_first), public.testing_normalize_name(p_last), p_date_of_birth,
       v_email, p_location_code, p_dan, p_stars_from, p_paying_by, 'desk',
       case when v_dup is null then 'none' else 'possible' end, v_dup, '', '')
    returning id, version into v_id, v_version;
    -- both rows show the pair: the matching row is worked out again too
    if v_dup is not null then
      perform public.star_recheck_duplicate(v_dup);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.star_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_add_candidate(uuid, text, text, date, text, text, integer, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_add_candidate(uuid, text, text, date, text, text, integer, integer, text) to authenticated;

-- 18m. star_add_makeup(p_event_id, p_earlier_candidate_id)   S
-- "Make-up from an earlier testing" (v0.111, v0.129, v0.163): adds the
-- earlier candidate to THIS event as a make-up candidate (no fee).
-- Refused when:
--   this event is Finished                          -> finished
--   the earlier event is not BEFORE this one, or the earlier candidate
--   was withdrawn                                   -> invalid
--   an active make-up row already points at the earlier candidate (here
--   or in another event)                            -> already_added
--   the earlier result is no longer "make-up"       -> stale
--   below the pass mark and no admin chose the subjects yet -> choice_needed
--   its Dan isn't in this event's copy, or its star is at the limit -> invalid
-- What it writes (the earlier rows are only READ, never locked or changed):
--   * the make-up candidate: is_makeup, no paying_by, source 'desk', the
--     earlier names / DOB / email / school / Dan / stars, makeup_of_* set
--   * KEPT grades (v0.163): for each judged subject of this event's copy
--     whose name (ignoring capitals and spaces) matches an earlier subject
--     that has a grade and is NOT one of the subjects to re-test: a kept
--     grade with that letter, noting the earlier event (OPEN-8)
--   * a 'retest' row for every other subject of the Dan (the ones to
--     re-test, and any that don't match by name)
--   * the class counts copied, unless Assistant Instructor is re-tested
--     (then left empty, OPEN-10)
-- A concurrent add of the same earlier candidate in another event hits the
-- "one active make-up" rule and is answered already_added too.
-- locks: this event (no key update); the earlier candidate, its event and
--        grades are read without locks
-- Ok: {"status":"ok","id":...,"version":1,"kept_count":n,"retest_count":n}
create or replace function public.star_add_makeup(
  p_event_id             uuid,
  p_earlier_candidate_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e          public.star_events;
  v_ec         public.star_candidates;
  v_ee         public.star_events;
  v_d          public.star_event_dans;
  v_res        jsonb;
  v_needs      uuid[];
  v_k          record;
  v_es         jsonb;
  v_ai_retest  boolean := true;
  v_dup        uuid;
  v_id         uuid;
  v_version    integer;
  v_kept       integer := 0;
  v_retest     integer := 0;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_event_id is null or p_earlier_candidate_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_e from public.star_events e where e.id = p_event_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_ec from public.star_candidates c where c.id = p_earlier_candidate_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_ee from public.star_events e where e.id = v_ec.event_id;

    if public.star_event_state(v_e, public.testing_today()) = 'finished' then
      return jsonb_build_object('status', 'finished');
    end if;
    if v_ee.testing_date >= v_e.testing_date or v_ec.status <> 'active' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.star_candidates m
                where m.makeup_of_candidate_id = p_earlier_candidate_id and m.is_makeup and m.status = 'active') then
      return jsonb_build_object('status', 'already_added');
    end if;
    v_res := public.star_candidate_result(p_earlier_candidate_id);
    if v_res ->> 'status' is distinct from 'makeup' then
      return jsonb_build_object('status', 'stale');
    end if;
    if (v_res ->> 'choice_needed')::boolean then
      return jsonb_build_object('status', 'choice_needed');
    end if;
    select * into v_d from public.star_event_dans d where d.event_id = p_event_id and d.dan = v_ec.dan;
    if not found or v_ec.stars_from >= v_d.star_limit then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_needs := array(select x.value::uuid from jsonb_array_elements_text(v_res -> 'needs_ids') as x(value));

    -- Is Assistant Instructor re-tested here? Only when this event's AI
    -- subject matches an earlier subject by name that is NOT to be re-tested
    -- are the class counts carried over.
    select s.value into v_es
      from public.star_event_categories k
      join jsonb_array_elements(v_res -> 'subjects') as s(value)
        on lower(s.value ->> 'name') = lower(k.name)
     where k.event_id = p_event_id and k.dan = v_ec.dan and k.from_class_count
     limit 1;
    if v_es is not null and not ((v_es ->> 'event_category_id')::uuid = any (v_needs)) then
      v_ai_retest := false;
    end if;

    perform set_config('tkd.action', 'star_add_makeup', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    v_dup := public.star_find_duplicate(p_event_id, null, v_ec.first_name, v_ec.last_name, v_ec.date_of_birth);
    insert into public.star_candidates
      (event_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan, stars_from,
       paying_by, source, is_makeup, makeup_of_candidate_id, makeup_of_event_name,
       classes_attended, assistant_classes, duplicate_state, duplicate_of, created_by_name, updated_by_name)
    values
      (p_event_id, v_ec.first_name, v_ec.last_name, v_ec.date_of_birth, v_ec.email_for_results, v_ec.location_code,
       v_ec.dan, v_ec.stars_from, null, 'desk', true, v_ec.id, v_ee.name,
       case when v_ai_retest then null else v_ec.classes_attended end,
       case when v_ai_retest then null else v_ec.assistant_classes end,
       case when v_dup is null then 'none' else 'possible' end, v_dup, '', '')
    returning id, version into v_id, v_version;
    if v_dup is not null then
      perform public.star_recheck_duplicate(v_dup);
    end if;

    for v_k in select k.id, k.name, k.from_class_count
                 from public.star_event_categories k
                where k.event_id = p_event_id and k.dan = v_ec.dan
                order by k.position loop
      v_es := null;
      select s.value into v_es
        from jsonb_array_elements(v_res -> 'subjects') as s(value)
       where lower(s.value ->> 'name') = lower(v_k.name)
       limit 1;
      if v_k.from_class_count then
        if v_ai_retest then
          insert into public.star_makeup_subjects (candidate_id, event_category_id, kind, created_by_name, updated_by_name)
          values (v_id, v_k.id, 'retest', '', '');
          v_retest := v_retest + 1;
        end if;
      elsif v_es is not null
            and not (v_es ->> 'from_class_count')::boolean
            and v_es ->> 'grade' is not null
            and not ((v_es ->> 'event_category_id')::uuid = any (v_needs)) then
        insert into public.star_grades
          (candidate_id, event_category_id, grade, kept, kept_from_event_id, kept_from_event_name,
           created_by_name, updated_by_name)
        values (v_id, v_k.id, v_es ->> 'grade', true, v_ee.id, v_ee.name, '', '');
        v_kept := v_kept + 1;
      else
        insert into public.star_makeup_subjects (candidate_id, event_category_id, kind, created_by_name, updated_by_name)
        values (v_id, v_k.id, 'retest', '', '');
        v_retest := v_retest + 1;
      end if;
    end loop;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version,
                              'kept_count', v_kept, 'retest_count', v_retest);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'star_candidates_one_active_makeup_idx' then
        return jsonb_build_object('status', 'already_added');
      end if;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_add_makeup(uuid, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.star_add_makeup(uuid, uuid) to authenticated;

-- 18n. star_update_candidate(p_candidate_id, p_expected_version, p_first,
--        p_last, p_date_of_birth, p_email, p_location_code, p_dan,
--        p_stars_from, p_clear_grade_count)   S (a Dan change on a PAID
--        candidate: A, S8)
-- Edit details: names, DOB, email, school, Dan and stars (v0.112, v0.164),
-- also for withdrawn candidates. Payments are never touched (the fee is
-- worked out from the new Dan, OPEN-5).
--   DOB / email may be empty only on a desk row (a form row -> invalid)
--   a stars change in the same Dan keeps the grades (v0.164)
--   a Dan change CLEARS every grade (kept ones too, OPEN-7) and make-up
--     subject of the old Dan. If there are any and p_clear_grade_count is
--     NULL -> {"status":"grades_exist","grade_count":n} (the dialog asks
--     "clear n grades?"); the call again with that n clears them; a
--     different number -> stale. Class counts are kept (OPEN-6).
-- A name or DOB change works out the duplicate marks again (both sides).
-- Same values -> nothing written.
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n,"cleared_grade_count":n}
create or replace function public.star_update_candidate(
  p_candidate_id      uuid,
  p_expected_version  integer,
  p_first             text,
  p_last              text,
  p_date_of_birth     date,
  p_email             text,
  p_location_code     text,
  p_dan               integer,
  p_stars_from        integer,
  p_clear_grade_count integer
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
  v_c          public.star_candidates;
  v_d          public.star_event_dans;
  v_n          integer := 0;
  v_cleared    integer := 0;
  v_rows       integer;
  v_of         uuid;
  v_version    integer;
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
       or (p_date_of_birth is not null and (p_date_of_birth > v_today or p_date_of_birth < date '1900-01-01'))
       or (v_email is not null and not public.star_email_is_valid(v_email))
       or p_location_code is null or p_location_code not in ('worcester', 'shrewsbury')
       or p_dan is null or p_stars_from is null or p_stars_from < 0
       or (p_clear_grade_count is not null and p_clear_grade_count < 0) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 6. rules that depend on the saved row
    if v_c.source = 'form' and (p_date_of_birth is null or v_email is null) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_dan <> v_c.dan and public.star_net_paid_cents(v_c.id) > 0 and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    select * into v_d from public.star_event_dans d where d.event_id = v_c.event_id and d.dan = p_dan;
    if not found or p_stars_from >= v_d.star_limit then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_dan <> v_c.dan then
      select count(*) into v_n from public.star_grades g where g.candidate_id = v_c.id;
      if v_n > 0 and p_clear_grade_count is null then
        return jsonb_build_object('status', 'grades_exist', 'grade_count', v_n);
      end if;
      if p_clear_grade_count is not null and p_clear_grade_count <> v_n then
        return jsonb_build_object('status', 'stale');
      end if;
    end if;

    perform set_config('tkd.action', 'star_update_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_dan <> v_c.dan then
      delete from public.star_grades g where g.candidate_id = v_c.id;
      get diagnostics v_cleared = row_count;
      delete from public.star_makeup_subjects m where m.candidate_id = v_c.id;
    end if;

    update public.star_candidates c
       set first_name        = v_first,
           last_name         = v_last,
           date_of_birth     = p_date_of_birth,
           email_for_results = v_email,
           location_code     = p_location_code,
           dan               = p_dan,
           stars_from        = p_stars_from
     where c.id = v_c.id
       and (c.first_name is distinct from v_first
            or c.last_name is distinct from v_last
            or c.date_of_birth is distinct from p_date_of_birth
            or c.email_for_results is distinct from v_email
            or c.location_code is distinct from p_location_code
            or c.dan is distinct from p_dan
            or c.stars_from is distinct from p_stars_from);
    get diagnostics v_rows = row_count;

    if v_rows > 0 and (v_first is distinct from v_c.first_name or v_last is distinct from v_c.last_name
                       or p_date_of_birth is distinct from v_c.date_of_birth) then
      perform public.star_recheck_duplicate(v_c.id);
      select c.duplicate_of into v_of from public.star_candidates c where c.id = v_c.id;
      if v_of is not null then
        perform public.star_recheck_duplicate(v_of);
      end if;
      perform public.star_recheck_pointing_at(v_c.id);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_version from public.star_candidates c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version, 'cleared_grade_count', v_cleared);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_update_candidate(uuid, integer, text, text, date, text, text, integer, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_update_candidate(uuid, integer, text, text, date, text, text, integer, integer, integer) to authenticated;

-- 18o. star_change_paying_by(p_candidate_id, p_expected_version,
--        p_paying_by)   S
-- "Change how they'll pay": cash / check / card. Refused for a withdrawn
-- candidate (withdrawn), a make-up (no fee: no_fee) and once paid
-- (already_paid).
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.star_change_paying_by(
  p_candidate_id     uuid,
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
  v_c          public.star_candidates;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_version is null
       or p_paying_by is null or p_paying_by not in ('cash', 'check', 'card') then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if v_c.is_makeup then
      return jsonb_build_object('status', 'no_fee');
    end if;
    if public.star_net_paid_cents(v_c.id) > 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    perform set_config('tkd.action', 'star_change_paying_by', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_candidates c
       set paying_by = p_paying_by
     where c.id = v_c.id
       and c.paying_by is distinct from p_paying_by
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_c.version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_change_paying_by(uuid, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_change_paying_by(uuid, integer, text) to authenticated;

-- 18p. star_resolve_duplicate(p_keep_id, p_keep_version, p_other_id,
--        p_other_version, p_keep_both)   S
-- The "Possible duplicate" box (v0.114), as 0005's 14m:
--   keep one (p_keep_both false): the other is withdrawn as
--     'duplicate_copy' (the one withdrawal staff may do, v0.110, S2);
--     withdrawn_by = the caller, so the same person may Undo it from the
--     toast for 10 seconds (18u)
--   keep both (true): both are marked kept_both, pointing at each other
-- Both must be active candidates of the same event, one marked "possible
-- duplicate" of the other (else stale: the box changed meanwhile).
-- locks: the event (no key update) -> both candidates in id order (update)
-- Ok: {"status":"ok","keep_version":n,"other_version":n}
create or replace function public.star_resolve_duplicate(
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
  v_event_id   uuid;
  v_other_ev   uuid;
  v_keep       public.star_candidates;
  v_other      public.star_candidates;
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

    select c.event_id into v_event_id from public.star_candidates c where c.id = p_keep_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    select c.event_id into v_other_ev from public.star_candidates c where c.id = p_other_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_other_ev <> v_event_id then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform 1 from public.star_events e where e.id = v_event_id for no key update;
    perform 1 from public.star_candidates c where c.id in (p_keep_id, p_other_id) order by c.id for update;
    select * into v_keep  from public.star_candidates c where c.id = p_keep_id;
    select * into v_other from public.star_candidates c where c.id = p_other_id;
    if v_keep.id is null or v_other.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_keep.version <> p_keep_version or v_other.version <> p_other_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_keep.status <> 'active' or v_other.status <> 'active' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if not ((v_keep.duplicate_state = 'possible' and v_keep.duplicate_of = p_other_id)
            or (v_other.duplicate_state = 'possible' and v_other.duplicate_of = p_keep_id)) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'star_resolve_duplicate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_keep_both then
      update public.star_candidates c
         set duplicate_state = 'kept_both',
             duplicate_of    = case when c.id = p_keep_id then p_other_id else p_keep_id end
       where c.id in (p_keep_id, p_other_id);
    else
      update public.star_candidates c
         set status            = 'withdrawn',
             withdrawn_reason  = 'duplicate_copy',
             withdrawn_at      = now(),
             withdrawn_by_name = public.change_log_actor_name(),
             withdrawn_by      = auth.uid(),
             duplicate_state   = 'none',
             duplicate_of      = null
       where c.id = p_other_id;
      perform public.star_recheck_duplicate(p_keep_id);
      perform public.star_recheck_pointing_at(p_other_id);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok',
                              'keep_version', (select c.version from public.star_candidates c where c.id = p_keep_id),
                              'other_version', (select c.version from public.star_candidates c where c.id = p_other_id));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_resolve_duplicate(uuid, integer, uuid, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.star_resolve_duplicate(uuid, integer, uuid, integer, boolean) to authenticated;

-- 18q. star_set_private(p_candidate_id, p_expected_version, p_private_on,
--        p_private_time)   S
-- Set / change a private testing day and time (any day, before or after
-- the testing day; the time 8:00 AM - 8:00 PM on a 15-minute step,
-- OPEN-14), or BOTH NULL = "Back to the testing day" (logged as
-- star_clear_private). Payments are never touched (even after paying,
-- v0.152): the expected fee becomes the private fee or back.
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n,"expected_fee_cents":n}
create or replace function public.star_set_private(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_private_on       date,
  p_private_time     time
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.star_candidates;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_version is null
       or (p_private_on is null) <> (p_private_time is null)
       or (p_private_time is not null and not public.star_start_time_is_valid(p_private_time)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    perform set_config('tkd.action', case when p_private_on is null then 'star_clear_private' else 'star_set_private' end, true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_candidates c
       set private_on   = p_private_on,
           private_time = p_private_time
     where c.id = v_c.id
       and (c.private_on is distinct from p_private_on or c.private_time is distinct from p_private_time)
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_c.version),
                              'expected_fee_cents', public.star_expected_fee_cents(v_c.id));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_set_private(uuid, integer, date, time) from public, anon, authenticated, service_role;
grant  execute on function public.star_set_private(uuid, integer, date, time) to authenticated;

-- 18r. star_withdraw_candidate(p_candidate_id, p_expected_version)   A
-- Withdraw: the candidate moves to the Removed group; payments and grades
-- stay. Already withdrawn -> withdrawn. Candidates marked as its possible
-- duplicate are checked again.
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.star_withdraw_candidate(
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
  v_c          public.star_candidates;
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

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    perform set_config('tkd.action', 'star_withdraw_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_candidates c
       set status            = 'withdrawn',
           withdrawn_reason  = 'withdrawn',
           withdrawn_at      = now(),
           withdrawn_by_name = public.change_log_actor_name(),
           withdrawn_by      = auth.uid(),
           duplicate_state   = 'none',
           duplicate_of      = null
     where c.id = v_c.id;
    perform public.star_recheck_pointing_at(v_c.id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_version from public.star_candidates c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_withdraw_candidate(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_withdraw_candidate(uuid, integer) to authenticated;

-- 18s. star_restore_candidate(p_candidate_id, p_expected_version)
--        A, or S for their own "keep one" less than 10 seconds ago
-- Back to active; the duplicate marks are worked out again for it, its
-- new partner and anyone pointing at it. Who may (as 0005's 14o):
--   the staff member who withdrew it with "keep one" (duplicate_copy,
--   withdrawn_by = the caller) less than 10 seconds ago - the toast's Undo;
--   otherwise admins only, at any time (not_allowed).
-- Not withdrawn -> stale. Restoring a make-up row while another active
-- make-up of the same earlier candidate exists hits the "one active
-- make-up" rule -> stale.
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.star_restore_candidate(
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
  v_c          public.star_candidates;
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

    v_c := public.star_lock_candidate(p_candidate_id);
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

    perform set_config('tkd.action', 'star_restore_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_candidates c
       set status            = 'active',
           withdrawn_reason  = null,
           withdrawn_at      = null,
           withdrawn_by_name = null,
           withdrawn_by      = null
     where c.id = v_c.id;
    perform public.star_recheck_duplicate(v_c.id);
    select c.duplicate_of into v_of from public.star_candidates c where c.id = v_c.id;
    if v_of is not null then
      perform public.star_recheck_duplicate(v_of);
    end if;
    perform public.star_recheck_pointing_at(v_c.id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_version from public.star_candidates c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_restore_candidate(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_restore_candidate(uuid, integer) to authenticated;

-- 18t. star_delete_candidate(p_candidate_id, p_expected_version,
--        p_expected_payment_ids)   A
-- Delete permanently: the candidate and ALL its rows (signature, grades,
-- make-up subjects, payments, result emails) go; every removed row is in
-- the history (the DOB and email stay there, S10).
-- p_expected_payment_ids = the payment rows the warning named (compared
-- as a set); if they differ now, nothing is removed: stale. A later
-- make-up row pointing at it keeps its row with the link set to NULL;
-- candidates marked as its possible duplicate are checked again.
-- locks: event (no key update) -> candidate (update) -> its payments in id
--        order (update)
-- Ok: {"status":"ok"}
create or replace function public.star_delete_candidate(
  p_candidate_id         uuid,
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
  v_c          public.star_candidates;
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

    if p_candidate_id is null or p_expected_version is null
       or not public.star_ids_are_valid(p_expected_payment_ids) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.star_payments p where p.candidate_id = v_c.id order by p.id for update;

    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if array(select p.id from public.star_payments p where p.candidate_id = v_c.id order by p.id)
       <> array(select x.id from unnest(p_expected_payment_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'stale');
    end if;

    v_pointing := array(select c.id from public.star_candidates c where c.duplicate_of = v_c.id order by c.id);

    perform set_config('tkd.action', 'star_delete_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.star_candidates c where c.id = v_c.id;

    foreach v_id in array v_pointing loop
      perform public.star_recheck_duplicate(v_id);
    end loop;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_delete_candidate(uuid, integer, uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.star_delete_candidate(uuid, integer, uuid[]) to authenticated;

-- 18u. star_record_payment(p_candidate_id, p_expected_version, p_method,
--        p_amount_cents, p_paid_on)   S
-- Record payment (v0.109, v0.110): the dialog fills in the expected fee
-- (12d); staff may type another amount (1 cent to $1,000, e.g. a
-- discount). Any recorded amount counts as Paid (v0.167). Method cash /
-- check / card; date not in the future. Allowed in every event state.
-- Refused: withdrawn (withdrawn), a make-up (no_fee), already paid
-- (already_paid). The candidate's version goes up, so a double click with
-- the old version gets "stale". Last step: the signature clean-up (16a).
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n}
create or replace function public.star_record_payment(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_method           text,
  p_amount_cents     integer,
  p_paid_on          date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.star_candidates;
  v_payment_id uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_version is null
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_amount_cents is null or p_amount_cents not between 1 and 100000
       or p_paid_on is null or p_paid_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if v_c.is_makeup then
      return jsonb_build_object('status', 'no_fee');
    end if;
    if public.star_net_paid_cents(v_c.id) > 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    perform set_config('tkd.action', 'star_record_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(), public.change_log_actor_name())
    returning id into v_payment_id;

    update public.star_candidates c set version = c.version + 1 where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.star_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_record_payment(uuid, integer, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.star_record_payment(uuid, integer, text, integer, date) to authenticated;

-- 18v. star_undo_payment(p_payment_id)   S (own, within 10 s) / A
-- Writes a reversal of a payment OR a refund (the row stays; the two add
-- up to 0). Who may: the staff member who recorded it less than 10
-- seconds ago (the toast's Undo); otherwise admins only (not_allowed).
-- A reversal can't be undone (invalid); already reversed -> stale; a
-- PAYMENT while the candidate has a refund that isn't reversed -> invalid
-- (undo the refund first, so the total can't go below zero).
-- The candidate's version goes up.
-- locks: event (no key update) -> candidate (update) -> payment (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.star_undo_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.star_payments;
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

    v_p := public.star_lock_payment(p_payment_id);
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
    if exists (select 1 from public.star_payments x where x.reverses_payment_id = v_p.id) then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_p.kind = 'payment'
       and exists (select 1 from public.star_payments r
                    where r.candidate_id = v_p.candidate_id and r.kind = 'refund'
                      and not exists (select 1 from public.star_payments x where x.reverses_payment_id = r.id)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'star_undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.candidate_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    update public.star_candidates c set version = c.version + 1 where c.id = v_p.candidate_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_undo_payment(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.star_undo_payment(uuid) to authenticated;

-- 18w. star_edit_payment(p_payment_id, p_method, p_amount_cents,
--        p_paid_on)   A
-- Edit payment = a reversal of the old payment + a new payment with the
-- new method / amount / date. Only a payment (not a refund or reversal:
-- invalid); already reversed -> stale; the candidate has a refund that
-- isn't reversed -> invalid (undo the refund first).
-- locks: event (no key update) -> candidate (update) -> payment (update)
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}
create or replace function public.star_edit_payment(
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
  v_p          public.star_payments;
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

    v_p := public.star_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.star_payments x where x.reverses_payment_id = v_p.id) then
      return jsonb_build_object('status', 'stale');
    end if;
    if exists (select 1 from public.star_payments r
                where r.candidate_id = v_p.candidate_id and r.kind = 'refund'
                  and not exists (select 1 from public.star_payments x where x.reverses_payment_id = r.id)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'star_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.candidate_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_p.candidate_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_new_id;

    update public.star_candidates c set version = c.version + 1 where c.id = v_p.candidate_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_new_id, 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_edit_payment(uuid, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.star_edit_payment(uuid, text, integer, date) to authenticated;

-- 18x. star_record_refund(p_candidate_id, p_expected_version, p_method,
--        p_amount_cents, p_refunded_on)   A (S7)
-- A refund of an OVERPAID amount (e.g. paid the private fee, then "Back
-- to the testing day"): its own negative row, cash or check, with its own
-- date (v0.166). Not overpaid, or more than the overpaid amount ->
-- {"status":"refund_too_large","overpaid_cents":n}. The candidate's
-- version goes up.
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n}
create or replace function public.star_record_refund(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_method           text,
  p_amount_cents     integer,
  p_refunded_on      date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.star_candidates;
  v_paid       integer;
  v_overpaid   integer;
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

    if p_candidate_id is null or p_expected_version is null
       or p_method is null or p_method not in ('cash', 'check')
       or p_amount_cents is null or p_amount_cents not between 1 and 100000
       or p_refunded_on is null or p_refunded_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    v_paid := public.star_net_paid_cents(v_c.id);
    v_overpaid := case when v_paid > 0 then greatest(v_paid - public.star_expected_fee_cents(v_c.id), 0) else 0 end;
    if v_overpaid = 0 or p_amount_cents > v_overpaid then
      return jsonb_build_object('status', 'refund_too_large', 'overpaid_cents', v_overpaid);
    end if;

    perform set_config('tkd.action', 'star_record_refund', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, 'refund', -p_amount_cents, p_method, p_refunded_on, now(), auth.uid(), public.change_log_actor_name())
    returning id into v_payment_id;

    update public.star_candidates c set version = c.version + 1 where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_record_refund(uuid, integer, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.star_record_refund(uuid, integer, text, integer, date) to authenticated;

-- 18y. star_set_grade(p_candidate_id, p_event_category_id, p_grade)   S
-- One grade cell at the mat (or on a private student's page, v0.151).
-- p_grade NULL = clear the cell. NO version check: the last save wins,
-- silently, and the history keeps every save (v0.165). Refused, in this
-- order: withdrawn (withdrawn); a subject of another event (invalid); a
-- subject of another Dan than the candidate's CURRENT Dan (stale - a stale
-- tablet can't bring back grades a Dan change cleared, v0.164); a letter
-- not in the event's grade copy (invalid); Assistant Instructor (worked
-- out from the count: invalid); a kept make-up grade (kept). The same
-- letter again writes nothing.
-- locks: event (no key update) -> candidate (update) -> the grade row (update)
-- Ok: {"status":"ok","grade":"A"|null,"result":{...12g...}}
create or replace function public.star_set_grade(
  p_candidate_id      uuid,
  p_event_category_id uuid,
  p_grade             text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.star_candidates;
  v_k          public.star_event_categories;
  v_g          public.star_grades;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_event_category_id is null
       or (p_grade is not null and p_grade not in ('A+', 'A', 'B+', 'B', 'C+', 'C', 'D')) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_g from public.star_grades g
     where g.candidate_id = v_c.id and g.event_category_id = p_event_category_id
       for update;

    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    select * into v_k from public.star_event_categories k where k.id = p_event_category_id;
    if not found or v_k.event_id <> v_c.event_id then
      return jsonb_build_object('status', 'invalid');
    end if;
    if v_k.dan <> v_c.dan then
      return jsonb_build_object('status', 'stale');
    end if;
    if p_grade is not null
       and not exists (select 1 from public.star_event_grades v where v.event_id = v_c.event_id and v.grade = p_grade) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if v_k.from_class_count then
      return jsonb_build_object('status', 'invalid');
    end if;
    if v_g.id is not null and v_g.kept then
      return jsonb_build_object('status', 'kept');
    end if;

    perform set_config('tkd.action', 'star_set_grade', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_grade is null then
      delete from public.star_grades g where g.id = v_g.id;
    elsif v_g.id is null then
      insert into public.star_grades (candidate_id, event_category_id, grade, created_by_name, updated_by_name)
      values (v_c.id, p_event_category_id, p_grade, '', '');
    elsif v_g.grade is distinct from p_grade then
      update public.star_grades g set grade = p_grade where g.id = v_g.id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'grade', p_grade, 'result', public.star_candidate_result(v_c.id));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_set_grade(uuid, uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_set_grade(uuid, uuid, text) to authenticated;

-- 18z. star_set_count(p_candidate_id, p_field, p_value)   S
-- A class count at the mat: p_field 'classes_attended' or
-- 'assistant_classes', p_value 0-999 or NULL (= not entered). No version
-- check and no version bump (S6, 13a), but logged. Withdrawn -> withdrawn.
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","result":{...12g...}}
create or replace function public.star_set_count(
  p_candidate_id uuid,
  p_field        text,
  p_value        integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.star_candidates;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_field is null
       or p_field not in ('classes_attended', 'assistant_classes')
       or (p_value is not null and p_value not between 0 and 999) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    perform set_config('tkd.action', 'star_set_count', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_field = 'classes_attended' then
      update public.star_candidates c set classes_attended = p_value
       where c.id = v_c.id and c.classes_attended is distinct from p_value;
    else
      update public.star_candidates c set assistant_classes = p_value
       where c.id = v_c.id and c.assistant_classes is distinct from p_value;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'result', public.star_candidate_result(v_c.id));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_set_count(uuid, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_set_count(uuid, text, integer) to authenticated;

-- 18za. star_set_makeup_subjects(p_candidate_id, p_expected_category_ids,
--         p_category_ids)   A
-- For a result BELOW the pass mark with no D (v0.130): the admin chooses
-- which subjects the make-up re-tests. p_expected_category_ids = the
-- chosen set the screen showed (any order; else stale); p_category_ids =
-- the new set (at least one; subjects of the candidate's event and Dan).
-- Refused when the result isn't complete, has a D or isn't below the
-- pass mark (invalid), or the candidate is withdrawn (withdrawn).
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","result":{...12g...}}
create or replace function public.star_set_makeup_subjects(
  p_candidate_id          uuid,
  p_expected_category_ids uuid[],
  p_category_ids          uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.star_candidates;
  v_res        jsonb;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_candidate_id is null
       or not public.star_ids_are_valid(p_expected_category_ids)
       or not public.star_ids_are_valid(p_category_ids)
       or cardinality(p_category_ids) = 0 then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if array(select m.event_category_id from public.star_makeup_subjects m
              where m.candidate_id = v_c.id and m.kind = 'chosen' order by m.event_category_id)
       <> array(select x.id from unnest(p_expected_category_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'stale');
    end if;

    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    v_res := public.star_candidate_result(v_c.id);
    if not (v_res ->> 'complete')::boolean
       or jsonb_array_length(v_res -> 'd_subjects') > 0
       or (v_res ->> 'total')::numeric >= (v_res ->> 'pass_mark')::numeric then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from unnest(p_category_ids) as x(id)
                where not exists (select 1 from public.star_event_categories k
                                   where k.id = x.id and k.event_id = v_c.event_id and k.dan = v_c.dan)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'star_set_makeup_subjects', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.star_makeup_subjects m
     where m.candidate_id = v_c.id and m.kind = 'chosen' and not (m.event_category_id = any (p_category_ids));
    insert into public.star_makeup_subjects (candidate_id, event_category_id, kind, created_by_name, updated_by_name)
    select v_c.id, x.id, 'chosen', '', ''
      from unnest(p_category_ids) as x(id)
     where not exists (select 1 from public.star_makeup_subjects m
                        where m.candidate_id = v_c.id and m.kind = 'chosen' and m.event_category_id = x.id)
     order by x.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'result', public.star_candidate_result(v_c.id));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_set_makeup_subjects(uuid, uuid[], uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.star_set_makeup_subjects(uuid, uuid[], uuid[]) to authenticated;

-- 18zb. star_mark_result_sent(p_candidate_id, p_expected_result_key)   S
-- "Mark as sent" (v0.141): records that the result email went out, with a
-- snapshot of the result (status, total, subjects to re-test, key).
-- Refused: withdrawn; a result that isn't Passed or Make-up
-- (not_finished); the result changed since the screen showed it (its
-- result_key differs: stale).
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","sent_id":...,"marked_at":...}
create or replace function public.star_mark_result_sent(
  p_candidate_id        uuid,
  p_expected_result_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.star_candidates;
  v_res        jsonb;
  v_id         uuid;
  v_at         timestamptz;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_result_key is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    v_res := public.star_candidate_result(v_c.id);
    if v_res ->> 'status' not in ('passed', 'makeup') then
      return jsonb_build_object('status', 'not_finished');
    end if;
    if v_res ->> 'result_key' is distinct from p_expected_result_key then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'star_mark_result_sent', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_result_emails
      (candidate_id, marked_at, marked_by, marked_by_name, result_status, result_total, result_needs, result_key)
    values
      (v_c.id, now(), auth.uid(), public.change_log_actor_name(), v_res ->> 'status',
       (v_res ->> 'total')::numeric, v_res -> 'needs', v_res ->> 'result_key')
    returning id, marked_at into v_id, v_at;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'sent_id', v_id, 'marked_at', v_at);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_mark_result_sent(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_mark_result_sent(uuid, text) to authenticated;

-- 18zc. star_undo_result_sent(p_sent_id)   S (own, within 10 s) / A
-- Undo a "Mark as sent": the staff member who marked it, less than 10
-- seconds ago (the toast's Undo); otherwise admins only, any time
-- (OPEN-16). Already undone -> stale.
-- locks: event (no key update) -> candidate (update) -> the row (update)
-- Ok: {"status":"ok"}
create or replace function public.star_undo_result_sent(p_sent_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate_id uuid;
  v_c            public.star_candidates;
  v_s            public.star_result_emails;
  v_constraint   text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_sent_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select r.candidate_id into v_candidate_id from public.star_result_emails r where r.id = p_sent_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    v_c := public.star_lock_candidate(v_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_s from public.star_result_emails r where r.id = p_sent_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if not (v_s.marked_by is not distinct from auth.uid() and v_s.marked_at > now() - interval '10 seconds')
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_s.undone_at is not null then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'star_undo_result_sent', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_result_emails r
       set undone_at      = now(),
           undone_by      = auth.uid(),
           undone_by_name = public.change_log_actor_name()
     where r.id = p_sent_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
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

revoke execute on function public.star_undo_result_sent(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.star_undo_result_sent(uuid) to authenticated;

-- 18zd. star_results_csv(p_event_id, p_dan)   A   (volatile: it writes the
-- download log)
-- The results CSV (v0.144): every ACTIVE candidate of the event (p_dan
-- NULL) or of one Dan, in belt order (Dan, star, school Shrewsbury then
-- Worcester, last name, first name), with raw values incl. DOB and email.
-- The download row (who, when, event, Dan, how many rows) is written
-- FIRST, in the same call: a refused call writes nothing, and if anything
-- fails afterwards the whole call - log row included - is undone and only
-- a status comes back (the section 18 error mapping), never rows. No action tag: it writes star_downloads, not
-- change_log. The words and the file name are the app's.
-- locks: none (the event is only read)
-- Ok: {"status":"ok","rows":[{dan, first_name, last_name, location_code,
--      stars_from, stars_to, date_of_birth, email_for_results, paying_by,
--      is_makeup, paid, paid_cents, classes_attended, assistant_classes,
--      total, result_status, needs, sent}]}
create or replace function public.star_results_csv(
  p_event_id uuid,
  p_dan      integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e    public.star_events;
  v_n    integer;
  v_rows jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_event_id is null or (p_dan is not null and p_dan < 1) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_e from public.star_events e where e.id = p_event_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if p_dan is not null
       and not exists (select 1 from public.star_event_dans d where d.event_id = p_event_id and d.dan = p_dan) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select count(*) into v_n from public.star_candidates c
     where c.event_id = p_event_id and c.status = 'active' and (p_dan is null or c.dan = p_dan);

    insert into public.star_downloads (event_id, event_name, dan, row_count, downloaded_at, downloaded_by, downloaded_by_name)
    values (p_event_id, v_e.name, p_dan, v_n, now(), auth.uid(), public.change_log_actor_name());

    select coalesce(jsonb_agg(x.row order by x.dan, x.stars_from, x.loc_order, x.last_key, x.first_key, x.id), '[]'::jsonb)
      into v_rows
      from (select c.id, c.dan, c.stars_from,
                   case c.location_code when 'shrewsbury' then 0 else 1 end as loc_order,
                   lower(c.last_name) as last_key, lower(c.first_name) as first_key,
                   jsonb_build_object(
                     'dan',               c.dan,
                     'first_name',        c.first_name,
                     'last_name',         c.last_name,
                     'location_code',     c.location_code,
                     'stars_from',        c.stars_from,
                     'stars_to',          c.stars_from + 1,
                     'date_of_birth',     c.date_of_birth,
                     'email_for_results', c.email_for_results,
                     'paying_by',         c.paying_by,
                     'is_makeup',         c.is_makeup,
                     'paid',              public.star_net_paid_cents(c.id) > 0,
                     'paid_cents',        public.star_net_paid_cents(c.id),
                     'classes_attended',  c.classes_attended,
                     'assistant_classes', c.assistant_classes,
                     'total',             r.res -> 'total',
                     'result_status',     r.res -> 'status',
                     'needs',             r.res -> 'needs',
                     'sent',              case when s.st -> 'sent' = 'null'::jsonb then null
                                               else jsonb_build_object('marked_at', s.st -> 'sent' -> 'marked_at',
                                                                       'marked_by_name', s.st -> 'sent' -> 'marked_by_name',
                                                                       'matches', s.st -> 'matches') end) as row
              from public.star_candidates c
              cross join lateral (select public.star_candidate_result(c.id) as res) as r
              cross join lateral (select public.star_sent_state(c.id, r.res) as st) as s
             where c.event_id = p_event_id and c.status = 'active' and (p_dan is null or c.dan = p_dan)) as x;

    return jsonb_build_object('status', 'ok', 'rows', v_rows);
  exception
    -- the same mapping as the write functions (section 18): a rare table
    -- rule or lock problem answers a status instead of an error, and
    -- everything this call did (for the CSV: its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_results_csv(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_results_csv(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 19. The staff READ functions (S: staff and admins). has_data_access()
--     first (no_access); a missing argument -> invalid; a missing row ->
--     not_found; a rare table-rule or lock error -> a status, with the
--     same mapping as section 18. Everything else the screens show is read with the column
--     rights of section 15 (events, the copy, star_roster, grades ...).
--     The database takes no "device" argument: the mat-side tablet
--     setting is not a security boundary (v0.161) - the app hides DOB,
--     email, payments and History values there.
--     star_home_today and star_makeup_list WRITE (they run the signature
--     clean-up), so they are "volatile" and the app must call them as a
--     normal POST, never as a read-only GET request.
-- ---------------------------------------------------------------------

-- 19a. star_candidate_detail(p_candidate_id)   S   (v0.112, v0.160)
-- One candidate by id (there is no list or bulk version): every column
-- except the login ids - INCLUDING the date of birth and the email - plus
-- the age on the testing day, the Dan label, the star they test for and
-- the testing date; the signature's STATE only (never the picture); the
-- payments (oldest first); the fee; the make-up subjects; the result
-- (12g) and the sent state (12h). Not logged (accepted, contract 11b).
-- Ok: {"status":"ok","candidate":{...},"signature":{state, signed_at,
--      signature_deleted_at, ack_version},"payments":[...],"paid_cents":n,
--      "expected_fee_cents":n,"fee_kind":"...","overpaid_cents":n,
--      "makeup_subjects":[{event_category_id, name, kind}],"result":{...},
--      "sent":{...}}
-- locks: none (a read)
create or replace function public.star_candidate_detail(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c    public.star_candidates;
  v_e    public.star_events;
  v_d    public.star_event_dans;
  v_s    public.star_candidate_signatures;
  v_res  jsonb;
  v_paid integer;
  v_fee  integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_candidate_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_c from public.star_candidates c where c.id = p_candidate_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_e from public.star_events e where e.id = v_c.event_id;
    select * into v_d from public.star_event_dans d where d.event_id = v_c.event_id and d.dan = v_c.dan;
    select * into v_s from public.star_candidate_signatures s where s.candidate_id = v_c.id;

    v_res  := public.star_candidate_result(v_c.id);
    v_paid := public.star_net_paid_cents(v_c.id);
    v_fee  := public.star_expected_fee_cents(v_c.id);

    return jsonb_build_object(
      'status', 'ok',
      'candidate', (to_jsonb(v_c) - array['created_by', 'updated_by', 'withdrawn_by'])
                   || jsonb_build_object(
                        'age_on_testing_day', case when v_c.date_of_birth is null then null
                                                   else extract(year from age(v_e.testing_date, v_c.date_of_birth))::integer end,
                        'dan_label',    v_d.label,
                        'stars_to',     v_c.stars_from + 1,
                        'testing_date', v_e.testing_date),
      'signature', jsonb_build_object(
                     'state', case when v_s.id is null then 'none'
                                   when v_s.signature is not null then 'on_file'
                                   else 'removed' end,
                     'signed_at', v_s.signed_at,
                     'signature_deleted_at', v_s.signature_deleted_at,
                     'ack_version', v_s.ack_version),
      'payments', coalesce((select jsonb_agg(jsonb_build_object(
                                     'id', p.id, 'candidate_id', p.candidate_id, 'kind', p.kind,
                                     'amount_cents', p.amount_cents, 'method', p.method, 'paid_on', p.paid_on,
                                     'recorded_at', p.recorded_at, 'recorded_by_name', p.recorded_by_name,
                                     'reverses_payment_id', p.reverses_payment_id)
                                   order by p.recorded_at, p.id)
                              from public.star_payments p where p.candidate_id = v_c.id), '[]'::jsonb),
      'paid_cents', v_paid,
      'expected_fee_cents', v_fee,
      'fee_kind', public.star_fee_kind(v_c.id),
      'overpaid_cents', case when v_paid > 0 then greatest(v_paid - v_fee, 0) else 0 end,
      'makeup_subjects', coalesce((select jsonb_agg(jsonb_build_object('event_category_id', k.id, 'name', k.name,
                                                                       'kind', m.kind)
                                                    order by k.position, m.kind)
                                     from public.star_makeup_subjects m
                                     join public.star_event_categories k on k.id = m.event_category_id
                                    where m.candidate_id = v_c.id), '[]'::jsonb),
      'result', v_res,
      'sent', public.star_sent_state(v_c.id, v_res));
  exception
    -- the same mapping as the write functions (section 18): a rare table
    -- rule or lock problem answers a status instead of an error, and
    -- everything this call did (for the CSV: its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_candidate_detail(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.star_candidate_detail(uuid) to authenticated;

-- 19b. star_candidate_history(p_candidate_id)   S   (v0.112, v0.169)
-- The History panel: newest first, at most 500 rows - the change_log rows
-- of THIS candidate and of its own child rows. A child row (payment,
-- grade, make-up subject, result email, signature) is found through its
-- INSERT row (update rows hold only the changed columns), whose "after"
-- names this candidate_id; then every row is matched by the PAIR
-- (table_name, record_id), so another table's row with the same id, or
-- another candidate's duplicate / make-up link pointing here, never
-- appears. DOB and email before -> after in full (v0.169); the signature
-- only as "on file"; every login-id key removed (16i); no actor_id,
-- session_id or batch_id.
-- Ok: {"status":"ok","rows":[{occurred_at, actor_name, action, table_name, op, before, after}]}
-- locks: none (a read)
create or replace function public.star_candidate_history(p_candidate_id uuid)
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
    if p_candidate_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.star_candidates c where c.id = p_candidate_id) then
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
                           'before',      public.star_history_strip(h.before),
                           'after',       public.star_history_strip(h.after))
                         order by h.occurred_at desc, h.id desc)
          from (select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.before, l.after
                  from public.change_log l
                 where (l.table_name = 'star_candidates' and l.record_id = p_candidate_id)
                    or (l.table_name, l.record_id) in
                       (select i.table_name, i.record_id
                          from public.change_log i
                         where i.op = 'insert'
                           and i.table_name in ('star_payments', 'star_grades', 'star_makeup_subjects',
                                                'star_result_emails', 'star_candidate_signatures')
                           and i.after ->> 'candidate_id' = p_candidate_id::text)
                 order by l.occurred_at desc, l.id desc
                 limit 500) as h), '[]'::jsonb));
  exception
    -- the same mapping as the write functions (section 18): a rare table
    -- rule or lock problem answers a status instead of an error, and
    -- everything this call did (for the CSV: its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_candidate_history(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.star_candidate_history(uuid) to authenticated;

-- 19c. star_view_signature(p_candidate_id)   S
-- The drawn signature itself (the "View signature" button). Desk rows have
-- none: {"status":"ok","signature":null,"signed_at":null,...}. Not logged.
-- Ok: {"status":"ok","signature":"data:image/png;base64,..."|null,
--      "signed_at":...,"signature_deleted_at":...}
-- locks: none (a read)
create or replace function public.star_view_signature(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.star_candidate_signatures;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_candidate_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.star_candidates c where c.id = p_candidate_id) then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_s from public.star_candidate_signatures s where s.candidate_id = p_candidate_id;
    return jsonb_build_object('status', 'ok', 'signature', v_s.signature, 'signed_at', v_s.signed_at,
                              'signature_deleted_at', v_s.signature_deleted_at);
  exception
    -- the same mapping as the write functions (section 18): a rare table
    -- rule or lock problem answers a status instead of an error, and
    -- everything this call did (for the CSV: its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_view_signature(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.star_view_signature(uuid) to authenticated;

-- 19d. star_age_groups(p_event_id)   S   (v0.66, v0.168)
-- 'child' / 'adult' for each ACTIVE candidate of the event (for the
-- Assistant Instructor column) - the group only, never a DOB or an age.
-- Ok: {"status":"ok","rows":[{candidate_id, age_group}]}
-- locks: none (a read)
create or replace function public.star_age_groups(p_event_id uuid)
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
    if p_event_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.star_events e where e.id = p_event_id) then
      return jsonb_build_object('status', 'not_found');
    end if;
    return jsonb_build_object(
      'status', 'ok',
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
                                   'candidate_id', c.id,
                                   'age_group', public.star_age_group_of(c.date_of_birth, e.testing_date, a.child_max_age))
                                 order by c.id)
                          from public.star_candidates c
                          join public.star_events e on e.id = c.event_id
                          join public.star_event_assistant a on a.event_id = c.event_id
                         where c.event_id = p_event_id and c.status = 'active'), '[]'::jsonb));
  exception
    -- the same mapping as the write functions (section 18): a rare table
    -- rule or lock problem answers a status instead of an error, and
    -- everything this call did (for the CSV: its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_age_groups(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.star_age_groups(uuid) to authenticated;

-- 19e. star_event_results(p_event_id, p_dan)   S   (v0.138-v0.150, v0.158)
-- The Results tab (and the Grading grid's Total / Result, the printed
-- sheets) for one Dan: the counts and one row per ACTIVE candidate of
-- that Dan in belt order - the result (12g) plus names, school and the
-- sent state. A Dan not in the event's copy -> invalid.
-- Ok: {"status":"ok","dan":n,"pass_mark":n,"max_score":n,
--      "counts":{candidates, passed, makeup, not_finished, testing_privately},
--      "rows":[result + {first_name, last_name, location_code, sent}]}
-- locks: none (a read)
create or replace function public.star_event_results(p_event_id uuid, p_dan integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_d     public.star_event_dans;
  v_aplus numeric;
  v_rows  jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_event_id is null or p_dan is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.star_events e where e.id = p_event_id) then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_d from public.star_event_dans d where d.event_id = p_event_id and d.dan = p_dan;
    if not found then
      return jsonb_build_object('status', 'invalid');
    end if;
    select v.value into v_aplus from public.star_event_grades v where v.event_id = p_event_id and v.grade = 'A+';

    select coalesce(jsonb_agg(x.row order by x.stars_from, x.loc_order, x.last_key, x.first_key, x.id), '[]'::jsonb)
      into v_rows
      from (select c.id, c.stars_from,
                   case c.location_code when 'shrewsbury' then 0 else 1 end as loc_order,
                   lower(c.last_name) as last_key, lower(c.first_name) as first_key,
                   r.res || jsonb_build_object('first_name', c.first_name, 'last_name', c.last_name,
                                               'location_code', c.location_code,
                                               'sent', public.star_sent_state(c.id, r.res)) as row
              from public.star_candidates c
              cross join lateral (select public.star_candidate_result(c.id) as res) as r
             where c.event_id = p_event_id and c.dan = p_dan and c.status = 'active') as x;

    return jsonb_build_object(
      'status', 'ok',
      'dan', p_dan,
      'pass_mark', v_d.pass_mark,
      'max_score', round(coalesce((select sum(k.credits) from public.star_event_categories k
                                    where k.event_id = p_event_id and k.dan = p_dan), 0) * coalesce(v_aplus, 0), 1),
      'counts', jsonb_build_object(
                  'candidates',        jsonb_array_length(v_rows),
                  'passed',            (select count(*) from jsonb_array_elements(v_rows) as t(v) where t.v ->> 'status' = 'passed'),
                  'makeup',            (select count(*) from jsonb_array_elements(v_rows) as t(v) where t.v ->> 'status' = 'makeup'),
                  'not_finished',      (select count(*) from jsonb_array_elements(v_rows) as t(v) where t.v ->> 'status' = 'not_finished'),
                  'testing_privately', (select count(*) from jsonb_array_elements(v_rows) as t(v) where t.v ->> 'status' = 'testing_privately')),
      'rows', v_rows);
  exception
    -- the same mapping as the write functions (section 18): a rare table
    -- rule or lock problem answers a status instead of an error, and
    -- everything this call did (for the CSV: its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_event_results(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_event_results(uuid, integer) to authenticated;

-- 19f. star_makeup_list(p_event_id)   S   (v0.111)   volatile: it runs
-- the signature clean-up as its last step
-- "Make-up from an earlier testing": the ACTIVE candidates of OTHER
-- events with an EARLIER testing date whose result is "make-up", newest
-- earlier event first. Left out when an active make-up row in ANOTHER
-- event already points at them; already_added = one in THIS event does.
-- (A make-up done on the same event drops out by itself once it passes.)
-- The name search is the app's.
-- Ok: {"status":"ok","rows":[{candidate_id, first_name, last_name,
--      location_code, dan, stars_from, stars_to, earlier_event_id,
--      earlier_event_name, earlier_testing_date, needs, choice_needed,
--      already_added}]}
-- locks: none, except the clean-up: signature rows (update, skip locked)
create or replace function public.star_makeup_list(p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e    public.star_events;
  v_rows jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_event_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_e from public.star_events e where e.id = p_event_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
                      'candidate_id',         x.id,
                      'first_name',           x.first_name,
                      'last_name',            x.last_name,
                      'location_code',        x.location_code,
                      'dan',                  x.dan,
                      'stars_from',           x.stars_from,
                      'stars_to',             x.stars_from + 1,
                      'earlier_event_id',     x.event_id,
                      'earlier_event_name',   x.event_name,
                      'earlier_testing_date', x.testing_date,
                      'needs',                x.res -> 'needs',
                      'choice_needed',        x.res -> 'choice_needed',
                      'already_added',        x.already_added)
                    order by x.testing_date desc, x.event_id, x.dan, x.stars_from, lower(x.last_name),
                             lower(x.first_name), x.id), '[]'::jsonb)
      into v_rows
      from (select c.id, c.first_name, c.last_name, c.location_code, c.dan, c.stars_from, c.event_id,
                   e.name as event_name, e.testing_date,
                   public.star_candidate_result(c.id) as res,
                   exists (select 1 from public.star_candidates m
                            where m.makeup_of_candidate_id = c.id and m.is_makeup and m.status = 'active'
                              and m.event_id = p_event_id) as already_added
              from public.star_candidates c
              join public.star_events e on e.id = c.event_id
             where c.event_id <> p_event_id
               and e.testing_date < v_e.testing_date
               and c.status = 'active'
               and not exists (select 1 from public.star_candidates m
                                where m.makeup_of_candidate_id = c.id and m.is_makeup and m.status = 'active'
                                  and m.event_id <> p_event_id)) as x
     where x.res ->> 'status' = 'makeup';

    perform public.star_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'rows', v_rows);
  exception
    -- the same mapping as the write functions (section 18): a rare table
    -- rule or lock problem answers a status instead of an error, and
    -- everything this call did (for the CSV: its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_makeup_list(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.star_makeup_list(uuid) to authenticated;

-- 19g. star_home_today()   S   (v0.154, v0.155)   volatile: it runs the
-- signature clean-up as its last step
-- Home's Star cards for today: the events whose testing date is today
-- (counts = ACTIVE candidates WITHOUT a private day, per school) and the
-- private testings whose day is today (active), by time. No payment,
-- DOB or email. The location switcher filters in the app.
-- Ok: {"status":"ok","today":"YYYY-MM-DD",
--      "events":[{id, name, start_time, where_code, where_name, counts:{worcester, shrewsbury}}],
--      "private":[{candidate_id, event_id, event_name, private_time, first_name, last_name,
--                  location_code, dan, stars_from, stars_to}]}
-- locks: none, except the clean-up: signature rows (update, skip locked)
create or replace function public.star_home_today()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today   date;
  v_events  jsonb;
  v_private jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    v_today := public.testing_today();

    select coalesce(jsonb_agg(jsonb_build_object(
                      'id',         e.id,
                      'name',       e.name,
                      'start_time', left(e.start_time::text, 5),
                      'where_code', e.where_code,
                      'where_name', l.name,
                      'counts', jsonb_build_object(
                                  'worcester',  (select count(*) from public.star_candidates c
                                                  where c.event_id = e.id and c.status = 'active'
                                                    and c.private_on is null and c.location_code = 'worcester'),
                                  'shrewsbury', (select count(*) from public.star_candidates c
                                                  where c.event_id = e.id and c.status = 'active'
                                                    and c.private_on is null and c.location_code = 'shrewsbury')))
                    order by e.start_time, e.name, e.id), '[]'::jsonb)
      into v_events
      from public.star_events e
      join public.locations l on l.code = e.where_code
     where e.testing_date = v_today;

    select coalesce(jsonb_agg(jsonb_build_object(
                      'candidate_id',  c.id,
                      'event_id',      c.event_id,
                      'event_name',    e.name,
                      'private_time',  left(c.private_time::text, 5),
                      'first_name',    c.first_name,
                      'last_name',     c.last_name,
                      'location_code', c.location_code,
                      'dan',           c.dan,
                      'stars_from',    c.stars_from,
                      'stars_to',      c.stars_from + 1)
                    order by c.private_time, lower(c.last_name), lower(c.first_name), c.id), '[]'::jsonb)
      into v_private
      from public.star_candidates c
      join public.star_events e on e.id = c.event_id
     where c.private_on = v_today and c.status = 'active';

    perform public.star_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'today', v_today, 'events', v_events, 'private', v_private);
  exception
    -- the same mapping as the write functions (section 18): a rare table
    -- rule or lock problem answers a status instead of an error, and
    -- everything this call did (for the CSV: its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_home_today() from public, anon, authenticated, service_role;
grant  execute on function public.star_home_today() to authenticated;


-- ---------------------------------------------------------------------
-- 20. The two public functions (role star_registrar ONLY)
-- They never trust the Cloudflare Function: every rule is checked again
-- here. Neither returns anything about other candidates (no counts, no
-- names, no ids).
-- ---------------------------------------------------------------------

-- 20a. star_public_event(p_code) - what the family page shows first. The
-- code is one of the event's two links; the column it matched sets the
-- school. An unknown or badly formed code - or one that matches more than
-- one event (should never happen; refused rather than guessing a school)
-- -> {"status":"not_found"}.
-- Ok: {"status":"ok","state":"open"|"not_open"|"closed"|"finished",
--      "closed_on":date|null,"school":{code, name},
--      "event":{name, testing_date, start_time "HH:MM", note, auto_close_on,
--               where:{name, address|null}},
--      "dans":[{dan, label, star_limit, standard_cents, same_day_cents,
--               pass_mark, max_score, categories:[{name, credits}]}]}
-- No private fee, no counts, no ids.
-- locks: none (a read)
create or replace function public.star_public_event(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e      public.star_events;
  v_school text;
  v_n      integer;
  v_state  text;
  v_aplus  numeric;
begin
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select count(*) into v_n from public.star_events e
   where e.public_code_worcester = p_code or e.public_code_shrewsbury = p_code;
  if v_n <> 1 then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_e from public.star_events e
   where e.public_code_worcester = p_code or e.public_code_shrewsbury = p_code;
  v_school := case when v_e.public_code_worcester = p_code then 'worcester' else 'shrewsbury' end;

  v_state := public.star_event_state(v_e, public.testing_today());
  select v.value into v_aplus from public.star_event_grades v where v.event_id = v_e.id and v.grade = 'A+';

  return jsonb_build_object(
    'status', 'ok',
    'state', case v_state
               when 'open' then 'open'
               when 'not_open_yet' then 'not_open'
               when 'finished' then 'finished'
               else 'closed'
             end,
    'closed_on', case when v_state = 'closed_by_date' then v_e.auto_close_on end,
    'school', jsonb_build_object('code', v_school,
                                 'name', (select l.name from public.locations l where l.code = v_school)),
    'event', jsonb_build_object(
               'name',          v_e.name,
               'testing_date',  v_e.testing_date,
               'start_time',    left(v_e.start_time::text, 5),
               'note',          v_e.note,
               'auto_close_on', v_e.auto_close_on,
               'where',         jsonb_build_object(
                                  'name', (select l.name from public.locations l where l.code = v_e.where_code),
                                  'address', public.testing_location_address(v_e.where_code))),
    'dans', coalesce((
      select jsonb_agg(jsonb_build_object(
                         'dan',            d.dan,
                         'label',          d.label,
                         'star_limit',     d.star_limit,
                         'standard_cents', d.standard_cents,
                         'same_day_cents', d.same_day_cents,
                         'pass_mark',      d.pass_mark,
                         'max_score',      round(coalesce((select sum(k.credits) from public.star_event_categories k
                                                            where k.event_id = v_e.id and k.dan = d.dan), 0)
                                                 * coalesce(v_aplus, 0), 1),
                         'categories',     coalesce((select jsonb_agg(jsonb_build_object('name', k.name, 'credits', k.credits)
                                                                      order by k.position)
                                                       from public.star_event_categories k
                                                      where k.event_id = v_e.id and k.dan = d.dan), '[]'::jsonb))
                       order by d.dan)
        from public.star_event_dans d
       where d.event_id = v_e.id), '[]'::jsonb));
end;
$$;

revoke execute on function public.star_public_event(text) from public, anon, authenticated, service_role;
grant  execute on function public.star_public_event(text) to star_registrar;

-- 20b. star_public_register_core(...) - the inside of 20c (internal;
-- nobody can call it). Steps, in this order (contract 8.3):
--   1. the event by its code (also not_found when the code matches more
--      than one row)                                       -> not_found
--   2. this submission_id already registered FOR THIS EVENT -> the same ok
--      answer again (a double tap or a retry never makes two); for
--      ANOTHER event -> invalid (never its details)
--   3. lock the event, read it again, and look for this submission id
--      once more (a retry that waited for the first call's lock gets the
--      same ok answer, never rate_limited or closed)
--   4. the state right now: not_open / closed (+ closed_on) / finished
--   5. the input -> invalid: client key 1-200 characters; submission id;
--      names; DOB set, not in the future, not before 1900-01-01; email;
--      Dan and stars set; paying by cash or check; the acknowledgement
--      ticked; the signature (a PNG, 0005's rule); the acknowledgement
--      wording version 'st-2026-10-18' (OPEN-3: it changes with the wording)
--   6. the Dan is in the event's copy and 0 <= stars < its highest star
--   7. rate limit: 20 or more tries from this client key in the last hour
--      -> rate_limited (Color Belt's and Star's tries count together: one
--      limit per visitor key). 200 or more tries for this event in the
--      last hour is only written to the database log (never refused, so
--      an attacker can't block real families)
--   8. the candidate (source 'form', reference ST-...., the link's school,
--      the possible-duplicate mark by name + DOB, accepted silently) and
--      its signatures row, by "Family form". A concurrent call with the
--      same submission id that hits the unique rule is answered like step 2.
--   9. the ok answer (16h)
-- locks: the event (no key update)
create or replace function public.star_public_register_core(
  p_code          text,
  p_client_key    text,
  p_submission_id uuid,
  p_first         text,
  p_last          text,
  p_date_of_birth date,
  p_email         text,
  p_dan           integer,
  p_stars_from    integer,
  p_paying_by     text,
  p_acknowledged  boolean,
  p_signature     text,
  p_ack_version   text
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_e          public.star_events;
  v_n          integer;
  v_school     text;
  v_state      text;
  v_today      date;
  v_email      text;
  v_d          public.star_event_dans;
  v_found_id   uuid;
  v_found_ev   uuid;
  v_dup        uuid;
  v_id         uuid;
  v_constraint text;
begin
  -- 1. the event
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select count(*) into v_n from public.star_events e
   where e.public_code_worcester = p_code or e.public_code_shrewsbury = p_code;
  if v_n <> 1 then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_e from public.star_events e
   where e.public_code_worcester = p_code or e.public_code_shrewsbury = p_code;
  v_school := case when v_e.public_code_worcester = p_code then 'worcester' else 'shrewsbury' end;

  -- 2. already registered with this submission id?
  if p_submission_id is not null then
    select c.id, c.event_id into v_found_id, v_found_ev
      from public.star_candidate_signatures s
      join public.star_candidates c on c.id = s.candidate_id
     where s.submission_id = p_submission_id;
    if found then
      if v_found_ev <> v_e.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      return public.star_public_answer(v_found_id);
    end if;
  end if;

  -- 3. lock the event (as every Star write does), then read it again
  select * into v_e from public.star_events e where e.id = v_e.id for no key update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 3b. step 2 again, now that we hold the event lock: a retry of the same
  --     submission that waited for the first call's lock finds its row here
  --     and gets the same ok answer (not rate_limited or closed)
  if p_submission_id is not null then
    select c.id, c.event_id into v_found_id, v_found_ev
      from public.star_candidate_signatures s
      join public.star_candidates c on c.id = s.candidate_id
     where s.submission_id = p_submission_id;
    if found then
      if v_found_ev <> v_e.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      return public.star_public_answer(v_found_id);
    end if;
  end if;

  -- 4. open right now?
  v_today := public.testing_today();
  v_state := public.star_event_state(v_e, v_today);
  if v_state = 'finished' then
    return jsonb_build_object('status', 'finished');
  elsif v_state = 'not_open_yet' then
    return jsonb_build_object('status', 'not_open');
  elsif v_state = 'closed_by_date' then
    return jsonb_build_object('status', 'closed', 'closed_on', v_e.auto_close_on);
  elsif v_state = 'closed' then
    return jsonb_build_object('status', 'closed', 'closed_on', null);
  end if;

  -- 5. the input
  v_email := btrim(p_email);
  if p_client_key is null or char_length(p_client_key) not between 1 and 200
     or p_submission_id is null
     or not public.testing_name_is_valid(p_first)
     or not public.testing_name_is_valid(p_last)
     or p_date_of_birth is null or p_date_of_birth > v_today or p_date_of_birth < date '1900-01-01'
     or not public.star_email_is_valid(v_email)
     or p_dan is null or p_stars_from is null
     or p_paying_by is null or p_paying_by not in ('cash', 'check')
     or p_acknowledged is not true
     or not public.testing_signature_is_valid(p_signature)
     or p_ack_version is distinct from 'st-2026-10-18' then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 6. a Dan of this event, a star below its limit
  select * into v_d from public.star_event_dans d where d.event_id = v_e.id and d.dan = p_dan;
  if not found or p_stars_from < 0 or p_stars_from >= v_d.star_limit then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 7. rate limit (this call's own row is written afterwards by 20c)
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
    raise log 'star_public_register: event % had % form attempts in the last hour', v_e.id, v_n;
  end if;

  -- 8. write
  perform set_config('tkd.actor_label', 'Family form', true);
  perform set_config('tkd.action', 'star_public_register', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  v_dup := public.star_find_duplicate(v_e.id, null, p_first, p_last, p_date_of_birth);
  begin
    insert into public.star_candidates
      (event_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan, stars_from,
       paying_by, source, reference, duplicate_state, duplicate_of, created_by_name, updated_by_name)
    values
      (v_e.id, public.testing_normalize_name(p_first), public.testing_normalize_name(p_last), p_date_of_birth,
       v_email, v_school, p_dan, p_stars_from, p_paying_by, 'form',
       'ST-' || nextval('public.star_candidate_ref_seq'::regclass)::text,
       case when v_dup is null then 'none' else 'possible' end, v_dup, '', '')
    returning id into v_id;

    insert into public.star_candidate_signatures
      (candidate_id, submission_id, acknowledged, ack_version, signature, signed_at, created_by_name, updated_by_name)
    values
      (v_id, p_submission_id, true, p_ack_version, p_signature, now(), '', '');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'star_candidate_signatures_submission_id_key' then
        raise;
      end if;
      -- another call with the same submission id got there first
      select c.id, c.event_id into v_found_id, v_found_ev
        from public.star_candidate_signatures s
        join public.star_candidates c on c.id = s.candidate_id
       where s.submission_id = p_submission_id;
      if not found or v_found_ev <> v_e.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_id := v_found_id;
  end;
  -- both rows show the pair (accepted silently: the answer is the same)
  if v_dup is not null then
    perform public.star_recheck_duplicate(v_dup);
  end if;

  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);

  return public.star_public_answer(v_id);
end;
$$;

revoke execute on function public.star_public_register_core(text, text, uuid, text, text, date, text, integer, integer, text, boolean, text, text) from public, anon, authenticated, service_role;

-- 20c. star_public_register(p_code, p_client_key, p_submission_id,
--        p_first, p_last, p_date_of_birth, p_email, p_dan, p_stars_from,
--        p_paying_by, p_acknowledged, p_signature, p_ack_version)
-- The Star family form's Send. Wraps 20b, as 0005's 15c:
--   * first forgets any login token the caller might have set (so nobody
--     can make a form registration look like a staff member's), and
--     removes rate-limit rows older than 2 days
--   * runs 20b; if a table rule still says no, everything 20b did is
--     undone and the answer is invalid
--   * THEN writes this call's testing_public_attempts row (outcome
--     'star:<status>', so the two forms can be told apart in the shared
--     ledger) - outside the part that can be undone, so every call counts
--   * it does NOT run the signature clean-up (unlike 0005): this login
--     has a 5-second limit per statement, and a big clean-up must never
--     make a family's registration fail (contract 11b)
-- locks: (inside 20b) the event (no key update)
-- Ok: {"status":"ok", reference, first_name, last_name, dan, dan_label,
--      stars_from, stars_to, standard_cents, same_day_cents, paying_by,
--      event_name, testing_date, start_time, school_name, where:{name, address}}
create or replace function public.star_public_register(
  p_code          text,
  p_client_key    text,
  p_submission_id uuid,
  p_first         text,
  p_last          text,
  p_date_of_birth date,
  p_email         text,
  p_dan           integer,
  p_stars_from    integer,
  p_paying_by     text,
  p_acknowledged  boolean,
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
    v_result := public.star_public_register_core(p_code, p_client_key, p_submission_id, p_first, p_last,
                                                 p_date_of_birth, p_email, p_dan, p_stars_from, p_paying_by,
                                                 p_acknowledged, p_signature, p_ack_version);
  exception
    when unique_violation or foreign_key_violation or check_violation or not_null_violation then
      v_result := jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      v_result := jsonb_build_object('status', 'invalid');
  end;

  insert into public.testing_public_attempts (client_key, event_id, outcome)
  values (coalesce(left(p_client_key, 200), ''),
          (select e.id from public.star_events e
            where p_code is not null
              and (e.public_code_worcester = p_code or e.public_code_shrewsbury = p_code)
            limit 1),
          'star:' || coalesce(v_result ->> 'status', 'invalid'));

  -- leave no tag behind, whichever way 20b ended
  perform set_config('tkd.actor_label', '', true);
  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);

  return v_result;
end;
$$;

revoke execute on function public.star_public_register(text, text, uuid, text, text, date, text, integer, integer, text, boolean, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_public_register(text, text, uuid, text, text, date, text, integer, integer, text, boolean, text, text) to star_registrar;


commit;

-- End of 0006_star_testing.sql
