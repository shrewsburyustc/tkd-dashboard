-- =====================================================================
-- 0012_prospects.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A database migration for the TKD staff dashboard. It runs after 0009
--   (Forms): every sign-up from a form becomes one PROSPECT per child,
--   and staff work them here. It does not change anything 0001-0009 made
--   (it only ADDS triggers to two 0009 tables).
--
-- WHY IT EXISTS
--   The Prospects section (rulebook v0.236, approved mockup
--   docs/Prospects/TKD-Prospects-Mockups.html rev 3; build plan answers
--   v0.244, docs/Prospects/TKD-Prospects-Build-Plan.md). New students
--   only - current students stay on paper cards.
--
-- WHAT IT ADDS
--   1. public.prospect_statuses  - each school's own status list (v0.244
--                                  answer 7); 6 built-in + "Contacted"
--   2. public.prospects          - one per child of a sign-up
--   3. public.prospect_notes     - notes and calls (never changed)
--   4. public.prospect_activity  - the panel's timeline (never changed)
--   5. public.prospect_opens     - who opened which prospect (the rail
--                                  badge is counted per person, answer 3)
--   6. triggers that make prospects from sign-ups (New) and follow their
--      free-class bookings (Booked / back to New) - 0009 itself is not
--      changed, so re-running 0009 never undoes this file
--   7. staff functions (list, panel, status, notes, follow-up, check in,
--      book / change / cancel a free class, statuses) and admin-only ones
--      (delete a prospect, delete a custom status)
--   8. the 2-year clean-up (answer 1)
--
-- PRIVACY (rulebook section 5)
--   Prospects are about children. Nothing here is granted to anon. The
--   prospects, notes, activity and opens tables are granted to NOBODY:
--   the list comes from prospects_list() (list columns only - never phone,
--   email, age, answers or waiver) and the panel from prospects_get(),
--   both only for signed-in, UNLOCKED staff (has_data_access()). Search by
--   phone matches digits inside the database and never returns a number.
--   KNOWN GAP (written proposal, docs/Prospects/PROPOSAL-0003-history-
--   cleanup.md): 0003's change_log refuses every delete, so the 2-year
--   clean-up removes the records but NOT their copies in the history
--   until the Color Belt session agrees to a narrow exception in 0003.
--
-- HOW TO RUN IT
--   Only AFTER 0009 is live. Supabase dashboard -> SQL Editor -> New query
--   -> paste this WHOLE file -> Run. One transaction: if anything fails,
--   nothing is kept. Supabase warns about DESTRUCTIVE OPERATIONS: the words
--   appear in rules ("on delete cascade"), in functions that run later
--   (deleting a prospect, the clean-up) and in "drop ... if exists" lines
--   that make re-running safe. Nothing is removed now.
--   Safe to run again UNTIL a later migration changes these objects.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.form_submissions') is null or to_regclass('public.class_bookings') is null then
    raise exception '0012 needs 0009 (Forms) first.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- 1a. prospect_statuses - each school's list (v0.244 answer 7).
--   kind     stage (in the pipeline bar) | exit (a chip beside it)
--   builtin  the app's own: new, booked, came, joined, no_show,
--            not_interested (renamable, never deleted); null = custom
--   color    one of the 8 class colors - never red (rulebook section 7)
create table if not exists public.prospect_statuses (
  id              uuid        not null default gen_random_uuid(),
  location_code   text        not null,
  name            text        not null,
  kind            text        not null,
  position        smallint    not null,
  color           text        not null default 'gray',
  builtin         text        null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint prospect_statuses_pkey primary key (id),
  constraint prospect_statuses_id_location_key unique (id, location_code),
  constraint prospect_statuses_location_fk foreign key (location_code) references public.locations (code),
  constraint prospect_statuses_name_check check (coalesce(public.calendar_text_is_valid(name, 40) and name = public.testing_normalize_name(name), false)),
  constraint prospect_statuses_kind_check check (kind in ('stage', 'exit')),
  constraint prospect_statuses_position_check check (position between 0 and 99),
  constraint prospect_statuses_color_check check (color in ('gray', 'yellow', 'orange', 'green', 'teal', 'sky', 'purple', 'pink')),
  constraint prospect_statuses_builtin_check check (builtin is null or builtin in ('new', 'booked', 'came', 'joined', 'no_show', 'not_interested')),
  constraint prospect_statuses_version_check check (version >= 1)
);

create unique index if not exists prospect_statuses_builtin_key on public.prospect_statuses (location_code, builtin) where builtin is not null;
create unique index if not exists prospect_statuses_name_key on public.prospect_statuses (location_code, lower(name));

-- 1b. prospects - one per child of a sign-up. The child's first name and
-- age are copied from the sign-up (it never changes); the parent's
-- details stay in form_submissions.
create table if not exists public.prospects (
  id                 uuid        not null default gen_random_uuid(),
  location_code      text        not null,
  submission_id      uuid        not null,
  child_index        smallint    not null,
  child_first_name   text        not null,
  child_age          smallint    not null,
  status_id          uuid        not null,
  follow_up_on       date        null,
  joined_on          date        null,
  checked_in_at      timestamptz null,
  checked_in_by_name text        null,
  last_activity_at   timestamptz not null default now(),
  version            integer     not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid        null,
  updated_by         uuid        null,
  created_by_name    text        not null,
  updated_by_name    text        not null,

  constraint prospects_pkey primary key (id),
  constraint prospects_id_location_key unique (id, location_code),
  constraint prospects_child_key unique (submission_id, child_index),
  constraint prospects_submission_fk foreign key (submission_id, location_code) references public.form_submissions (id, location_code) on delete cascade,
  constraint prospects_status_fk foreign key (status_id, location_code) references public.prospect_statuses (id, location_code) on delete restrict,
  constraint prospects_child_check check (child_index between 0 and 5 and child_age between 2 and 99),
  constraint prospects_checkin_check check ((checked_in_at is null) = (checked_in_by_name is null)),
  constraint prospects_version_check check (version >= 1)
);

create index if not exists prospects_location_idx on public.prospects (location_code, status_id);
create index if not exists prospects_follow_up_idx on public.prospects (location_code, follow_up_on) where follow_up_on is not null;

-- 1c. prospect_notes - a note or call, with the follow-up chosen. Never changed.
create table if not exists public.prospect_notes (
  id              uuid        not null default gen_random_uuid(),
  prospect_id     uuid        not null,
  location_code   text        not null,
  body            text        not null,
  follow_up_on    date        null,
  created_at      timestamptz not null default now(),
  created_by      uuid        null,
  created_by_name text        not null,

  constraint prospect_notes_pkey primary key (id),
  constraint prospect_notes_prospect_fk foreign key (prospect_id, location_code) references public.prospects (id, location_code) on delete cascade,
  constraint prospect_notes_body_check check (coalesce(public.forms_long_text_ok(body, 1000), false))
);

create index if not exists prospect_notes_prospect_idx on public.prospect_notes (prospect_id, created_at);

-- 1d. prospect_activity - the panel's timeline: status changes, check-ins,
-- booking changes. Names of statuses / classes only; never contact details.
create table if not exists public.prospect_activity (
  id              bigint      generated always as identity,
  prospect_id     uuid        not null,
  location_code   text        not null,
  kind            text        not null,
  detail          jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  created_by_name text        not null,

  constraint prospect_activity_pkey primary key (id),
  constraint prospect_activity_prospect_fk foreign key (prospect_id, location_code) references public.prospects (id, location_code) on delete cascade,
  constraint prospect_activity_kind_check check (kind in ('created', 'status', 'follow_up', 'check_in', 'undo_check_in', 'came', 'no_show',
                                                          'booked', 'changed_time', 'cancelled_time'))
);

create index if not exists prospect_activity_prospect_idx on public.prospect_activity (prospect_id, created_at);

-- 1e. prospect_opens - who has opened which prospect (the badge counts,
-- per person, the New / Booked prospects you haven't opened - answer 3).
create table if not exists public.prospect_opens (
  prospect_id   uuid        not null,
  staff_id      uuid        not null,
  opened_at     timestamptz not null default now(),

  constraint prospect_opens_pkey primary key (prospect_id, staff_id),
  constraint prospect_opens_prospect_fk foreign key (prospect_id) references public.prospects (id) on delete cascade
);


-- ---------------------------------------------------------------------
-- 2. Small helpers (internal)
-- ---------------------------------------------------------------------

-- 2a. prospects_seed_statuses(school) - the 7 starting statuses, only when
-- the school has none of the built-in ones yet (so re-running, or a status
-- an admin deleted, never brings anything back).
create or replace function public.prospects_seed_statuses(p_location text)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.prospect_statuses s where s.location_code = p_location and s.builtin is not null) then
    return;
  end if;
  insert into public.prospect_statuses (location_code, name, kind, position, color, builtin)
  values (p_location, 'New',            'stage', 0, 'sky',    'new'),
         (p_location, 'Contacted',      'stage', 1, 'yellow', null),
         (p_location, 'Booked',         'stage', 2, 'purple', 'booked'),
         (p_location, 'Came',           'stage', 3, 'teal',   'came'),
         (p_location, 'Joined',         'stage', 4, 'green',  'joined'),
         (p_location, 'No-show',        'exit',  5, 'orange', 'no_show'),
         (p_location, 'Not interested', 'exit',  6, 'gray',   'not_interested')
  on conflict do nothing;   -- two first sign-ups at the same moment: the second adds nothing
end;
$$;

revoke execute on function public.prospects_seed_statuses(text) from public, anon, authenticated, service_role;

-- 2b. prospects_status_of(school, builtin) - the id of a built-in status.
create or replace function public.prospects_status_of(p_location text, p_builtin text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id from public.prospect_statuses s where s.location_code = p_location and s.builtin = p_builtin;
$$;

revoke execute on function public.prospects_status_of(text, text) from public, anon, authenticated, service_role;

-- 2c. prospects_log(prospect, school, kind, detail) - one timeline row.
create or replace function public.prospects_log(p_prospect uuid, p_location text, p_kind text, p_detail jsonb)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.prospect_activity (prospect_id, location_code, kind, detail, created_by_name)
  values (p_prospect, p_location, p_kind, coalesce(p_detail, '{}'::jsonb), public.change_log_actor_name());
$$;

revoke execute on function public.prospects_log(uuid, text, text, jsonb) from public, anon, authenticated, service_role;

-- 2d. prospects_class_ran(school, class, date, start) - does that class
-- still run then (0009's forms_slots_on: schedule in effect, closures)?
-- false = the amber "Class cancelled - call the family" (v0.241 answer 6).
create or replace function public.prospects_class_ran(p_location text, p_class uuid, p_date date, p_start time)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.forms_slots_on(p_location, p_date) x
                  where p_class = any (x.class_ids) and x.starts_at = p_start);
$$;

revoke execute on function public.prospects_class_ran(text, uuid, date, time) from public, anon, authenticated, service_role;

-- 2e. prospects_lock_slot(school, class, date, start) - the lock row of a
-- class time (0009's class_booking_slots), so two bookings for the last
-- spot take turns. Callers lock several in a fixed order (no deadlock).
create or replace function public.prospects_lock_slot(p_location text, p_class uuid, p_date date, p_start time)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  insert into public.class_booking_slots (location_code, class_id, on_date, starts_at)
  values (p_location, p_class, p_date, p_start)
  on conflict (location_code, class_id, on_date, starts_at) do nothing;
  perform 1 from public.class_booking_slots s
   where s.location_code = p_location and s.class_id = p_class and s.on_date = p_date and s.starts_at = p_start
     for update;
end;
$$;

revoke execute on function public.prospects_lock_slot(text, uuid, date, time) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

-- 3a. prospects_before_write() - bookkeeping like 0009's: version 1 on
-- insert; a real change bumps version and sets updated_*; id, school,
-- sign-up and child can never change.
create or replace function public.prospects_before_write()
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
     or (to_jsonb(new) ->> 'submission_id') is distinct from (to_jsonb(old) ->> 'submission_id')
     or (to_jsonb(new) ->> 'child_index') is distinct from (to_jsonb(old) ->> 'child_index')
     or (to_jsonb(new) ->> 'builtin') is distinct from (to_jsonb(old) ->> 'builtin') then
    raise exception using errcode = '23514', constraint = tg_table_name || '_immutable',
      message = tg_table_name || ': id, school, sign-up, child and built-in key can''t change';
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

revoke execute on function public.prospects_before_write() from public, anon, authenticated, service_role;

-- 3b. prospects_refuse_change() - notes and the timeline are never changed.
create or replace function public.prospects_refuse_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', constraint = tg_table_name || '_immutable',
    message = tg_table_name || ': rows are never changed';
end;
$$;

revoke execute on function public.prospects_refuse_change() from public, anon, authenticated, service_role;

-- 3c. prospects_from_submission() - AFTER INSERT on form_submissions: one
-- prospect per child, status New (the booking trigger below moves a child
-- with a free class to Booked). Public Send, kiosk and staff Fill in all
-- come through here.
create or replace function public.prospects_from_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c   jsonb;
  v_i   bigint;
  v_id  uuid;
begin
  perform public.prospects_seed_statuses(new.location_code);
  for v_c, v_i in select c, ord from jsonb_array_elements(new.children) with ordinality as t(c, ord) loop
    insert into public.prospects (location_code, submission_id, child_index, child_first_name, child_age, status_id)
    values (new.location_code, new.id, (v_i - 1)::smallint, v_c ->> 'first_name', (v_c ->> 'age')::smallint,
            public.prospects_status_of(new.location_code, 'new'))
    on conflict (submission_id, child_index) do nothing
    returning id into v_id;
    if v_id is not null then
      perform public.prospects_log(v_id, new.location_code, 'created',
                                   jsonb_build_object('source', new.source, 'entered_by', new.entered_by));
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.prospects_from_submission() from public, anon, authenticated, service_role;

-- 3d. prospects_follow_booking() - AFTER INSERT / UPDATE on class_bookings:
-- a booked free class moves the child from New to Booked; a cancelled one
-- from Booked back to New. A status staff chose (Contacted, Came, …) is
-- never overwritten.
create or replace function public.prospects_follow_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p    record;
  v_new  uuid;
  v_book uuid;
begin
  select p.id, p.status_id, p.location_code into v_p
    from public.prospects p where p.submission_id = new.submission_id and p.child_index = new.child_index
     for update;
  if not found then return null; end if;
  v_new  := public.prospects_status_of(v_p.location_code, 'new');
  v_book := public.prospects_status_of(v_p.location_code, 'booked');
  if new.status = 'booked' and v_p.status_id = v_new then
    update public.prospects p set status_id = v_book, last_activity_at = now() where p.id = v_p.id;
  elsif new.status = 'cancelled' and v_p.status_id = v_book then
    update public.prospects p set status_id = v_new, last_activity_at = now() where p.id = v_p.id;
  else
    update public.prospects p set last_activity_at = now() where p.id = v_p.id;
  end if;
  return null;
end;
$$;

revoke execute on function public.prospects_follow_booking() from public, anon, authenticated, service_role;

-- 3e. Attach.
do $$
declare
  t text;
begin
  foreach t in array array['prospect_statuses', 'prospects'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_before_write', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.prospects_before_write()',
                   t || '_before_write', t);
  end loop;
  foreach t in array array['prospect_statuses', 'prospects', 'prospect_notes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_log', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.change_log_write()',
                   t || '_log', t);
  end loop;
  foreach t in array array['prospect_statuses', 'prospects', 'prospect_notes', 'prospect_activity', 'prospect_opens'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.forms_refuse_truncate()',
                   t || '_no_truncate', t);
  end loop;
  foreach t in array array['prospect_notes', 'prospect_activity'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_no_update', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.prospects_refuse_change()',
                   t || '_no_update', t);
  end loop;
end;
$$;

drop trigger if exists form_submissions_make_prospects on public.form_submissions;
create trigger form_submissions_make_prospects after insert on public.form_submissions
  for each row execute function public.prospects_from_submission();

drop trigger if exists class_bookings_follow_prospect on public.class_bookings;
create trigger class_bookings_follow_prospect after insert or update of status on public.class_bookings
  for each row execute function public.prospects_follow_booking();


-- ---------------------------------------------------------------------
-- 4. Security rules: RLS + grants
-- Statuses: readable (they are not personal) while has_data_access().
-- Everything else: granted to NOBODY - read through prospects_list() /
-- prospects_get(), written through the functions below.
-- ---------------------------------------------------------------------
alter table public.prospect_statuses enable row level security;
alter table public.prospects         enable row level security;
alter table public.prospect_notes    enable row level security;
alter table public.prospect_activity enable row level security;
alter table public.prospect_opens    enable row level security;

revoke all on table public.prospect_statuses, public.prospects, public.prospect_notes, public.prospect_activity, public.prospect_opens
  from public, anon, authenticated, service_role;
revoke all on sequence public.prospect_activity_id_seq from public, anon, authenticated, service_role;

grant select (id, location_code, name, kind, position, color, builtin, version) on public.prospect_statuses to authenticated;

drop policy if exists prospect_statuses_select_with_access on public.prospect_statuses;
create policy prospect_statuses_select_with_access on public.prospect_statuses
  for select to authenticated using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 5. The 2-year clean-up (v0.244 answer 1)
-- ---------------------------------------------------------------------

-- 5a. prospects_purge_old() - every FAMILY (sign-up) none of whose
-- children is Joined, whose last activity (note, status change, booking,
-- check-in - not opening) is more than 2 years ago, is deleted: its
-- prospects (notes, timeline, opens cascade) and then the sign-up itself
-- (answers, bookings, signature views, email results cascade). No
-- scheduler: it runs inside prospects_list(). Only one clean-up runs at a
-- time (the others skip it), and families are removed in id order (no
-- deadlock with prospects_delete). The history rows say action
-- "prospects_purge_old". The copies in change_log stay - and the delete
-- itself writes new ones - until the 0003 exception is agreed (header).
create or replace function public.prospects_purge_old()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_n integer;
  v_label text := current_setting('tkd.actor_label', true);
  v_action text := current_setting('tkd.action', true);
begin
  if not pg_try_advisory_xact_lock(hashtext('public.prospects_purge_old')) then
    return 0;   -- another clean-up is running right now
  end if;
  perform set_config('tkd.actor_label', 'Prospect clean-up', true);
  perform set_config('tkd.action', 'prospects_purge_old', true);
  perform 1 from public.form_submissions f
   where f.id in (select p.submission_id
                    from public.prospects p
                    left join public.prospect_statuses s on s.id = p.status_id
                   group by p.submission_id
                  having bool_and(coalesce(s.builtin, '') <> 'joined')
                     and max(p.last_activity_at) < now() - interval '2 years')
   order by f.id
     for update;
  with old_families as (
    select p.submission_id
      from public.prospects p
      left join public.prospect_statuses s on s.id = p.status_id
     group by p.submission_id
    having bool_and(coalesce(s.builtin, '') <> 'joined')
       and max(p.last_activity_at) < now() - interval '2 years'
  )
  delete from public.form_submissions f using old_families o where f.id = o.submission_id;
  get diagnostics v_n = row_count;
  perform set_config('tkd.actor_label', coalesce(v_label, ''), true);
  perform set_config('tkd.action', coalesce(v_action, ''), true);
  return v_n;
end;
$$;

revoke execute on function public.prospects_purge_old() from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 6. Reading (security definer; staff and admins with data access)
-- ---------------------------------------------------------------------

-- 6a. prospects_list(school) - every prospect of one school, LIST COLUMNS
-- ONLY: child's first name, parent's name, status, follow-up, joined date,
-- the free class (date, time, class, booked/cancelled, whether it still
-- runs), checked in, "did they come?" due, opened by me, and the family
-- (sign-up) id for siblings. Never phone, email, age, answers or waiver.
create or replace function public.prospects_list(p_location_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamp := (now() at time zone 'America/New_York');
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_location_code is null or not exists (select 1 from public.locations l where l.code = p_location_code) then
    return jsonb_build_object('status', 'invalid');
  end if;
  begin
    perform public.prospects_purge_old();
  exception when deadlock_detected or lock_not_available or serialization_failure then
    null;   -- the clean-up tries again with the next list load
  end;
  perform public.prospects_seed_statuses(p_location_code);
  return jsonb_build_object('status', 'ok', 'today', public.schedule_today(), 'prospects', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'version', p.version, 'family_id', p.submission_id, 'child_first_name', p.child_first_name,
             'parent_name', s.parent_name, 'status_id', p.status_id, 'follow_up_on', p.follow_up_on, 'joined_on', p.joined_on,
             'created_at', p.created_at, 'signed_up_at', s.created_at, 'checked_in', p.checked_in_at is not null,
             'opened_by_me', exists (select 1 from public.prospect_opens o where o.prospect_id = p.id and o.staff_id = auth.uid()),
             'booking', case when b.id is null then null else jsonb_build_object(
               'id', b.id, 'status', b.status, 'class_name', b.class_name, 'date', b.on_date,
               'starts_at', to_char(b.starts_at, 'HH24:MI'), 'ends_at', to_char(b.ends_at, 'HH24:MI'),
               'class_running', b.class_id is not null and public.prospects_class_ran(b.location_code, b.class_id, b.on_date, b.starts_at)) end,
             'ask_came', b.status = 'booked' and p.checked_in_at is null
                         and coalesce(st.builtin, '') not in ('came', 'no_show', 'joined', 'not_interested')
                         and (b.on_date + b.ends_at) < v_now
                         and b.class_id is not null and public.prospects_class_ran(b.location_code, b.class_id, b.on_date, b.starts_at))
             order by s.created_at desc, p.child_index)
      from public.prospects p
      join public.form_submissions s on s.id = p.submission_id
      join public.prospect_statuses st on st.id = p.status_id
      left join public.class_bookings b on b.submission_id = p.submission_id and b.child_index = p.child_index
     where p.location_code = p_location_code), '[]'::jsonb));
end;
$$;

-- 6b. prospects_search(school, text) - ids of prospects whose child name or
-- parent name contains the text, or (4+ digits) whose phone digits
-- contain those digits. Returns ids only - never the number.
create or replace function public.prospects_search(p_location_code text, p_text text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text   text := lower(btrim(coalesce(p_text, '')));
  v_digits text := regexp_replace(coalesce(p_text, ''), '[^0-9]', '', 'g');
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_location_code is null or char_length(v_text) not between 2 and 80 then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'ids', coalesce((
    select jsonb_agg(p.id order by s.created_at desc)
      from public.prospects p
      join public.form_submissions s on s.id = p.submission_id
     where p.location_code = p_location_code
       and (strpos(lower(p.child_first_name), v_text) > 0
            or strpos(lower(s.parent_name), v_text) > 0
            or (char_length(v_digits) >= 4 and strpos(regexp_replace(s.parent_phone, '[^0-9]', '', 'g'), v_digits) > 0))), '[]'::jsonb));
end;
$$;

-- 6c. prospects_get(prospect) - the side panel: contact details, the
-- child's age, the form and every answer (as the form was), entered by,
-- signed on / signature kept, the free class, siblings, notes and the
-- timeline. Staff see all of it (v0.244 answer 6); the signature PICTURE
-- is read with 0009's forms_submission_signature() (every look recorded).
create or replace function public.prospects_get(p_prospect_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p record;
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_prospect_id is null then return jsonb_build_object('status', 'invalid'); end if;
  select p.*, s.parent_name, s.parent_phone, s.parent_email, s.fields, s.answers, s.source, s.entered_by, s.signed_at,
         s.signature is not null as has_signature, s.created_at as signed_up_at, f.name as form_name, f.id as form_id
    into v_p
    from public.prospects p
    join public.form_submissions s on s.id = p.submission_id
    join public.forms f on f.id = s.form_id
   where p.id = p_prospect_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'ok', 'prospect', jsonb_build_object(
    'id', v_p.id, 'version', v_p.version, 'location_code', v_p.location_code, 'family_id', v_p.submission_id,
    'child_first_name', v_p.child_first_name, 'child_age', v_p.child_age, 'status_id', v_p.status_id,
    'follow_up_on', v_p.follow_up_on, 'joined_on', v_p.joined_on,
    'checked_in_at', v_p.checked_in_at, 'checked_in_by_name', v_p.checked_in_by_name,
    'parent_name', v_p.parent_name, 'parent_phone', v_p.parent_phone, 'parent_email', v_p.parent_email,
    'form_id', v_p.form_id, 'form_name', v_p.form_name, 'source', v_p.source, 'entered_by', v_p.entered_by,
    'signed_up_at', v_p.signed_up_at, 'signed_at', v_p.signed_at, 'has_signature', v_p.has_signature,
    'fields', v_p.fields, 'answers', v_p.answers,
    'booking', (select jsonb_build_object('id', b.id, 'status', b.status, 'class_id', b.class_id, 'class_name', b.class_name,
                                          'date', b.on_date, 'starts_at', to_char(b.starts_at, 'HH24:MI'), 'ends_at', to_char(b.ends_at, 'HH24:MI'),
                                          'class_running', b.class_id is not null and public.prospects_class_ran(b.location_code, b.class_id, b.on_date, b.starts_at))
                  from public.class_bookings b where b.submission_id = v_p.submission_id and b.child_index = v_p.child_index),
    'siblings', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'child_first_name', x.child_first_name, 'child_age', x.child_age,
                                                              'status_id', x.status_id) order by x.child_index)
                            from public.prospects x where x.submission_id = v_p.submission_id and x.id <> v_p.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'follow_up_on', n.follow_up_on,
                                                           'created_at', n.created_at, 'created_by_name', n.created_by_name) order by n.created_at desc)
                         from public.prospect_notes n where n.prospect_id = v_p.id), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'detail', a.detail, 'created_at', a.created_at,
                                                              'created_by_name', a.created_by_name) order by a.id desc)
                            from public.prospect_activity a where a.prospect_id = v_p.id), '[]'::jsonb)));
end;
$$;

-- 6d. prospects_badge(school) - how many New / Booked prospects of this
-- school the signed-in person hasn't opened yet (per person, answer 3).
create or replace function public.prospects_badge(p_location_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  return jsonb_build_object('status', 'ok', 'count', (
    select count(*)::integer
      from public.prospects p
      join public.prospect_statuses s on s.id = p.status_id
     where (p_location_code is null or p.location_code = p_location_code)
       and s.builtin in ('new', 'booked')
       and not exists (select 1 from public.prospect_opens o where o.prospect_id = p.id and o.staff_id = auth.uid())));
end;
$$;

-- 6e. prospects_for_bookings(booking ids) - for the Calendar's day panel:
-- which prospect each free-class booking belongs to, its version, whether
-- it is checked in and its built-in status (for the Check in button).
create or replace function public.prospects_for_bookings(p_booking_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_booking_ids is null or cardinality(p_booking_ids) > 500 then return jsonb_build_object('status', 'invalid'); end if;
  return jsonb_build_object('status', 'ok', 'prospects', coalesce((
    select jsonb_agg(jsonb_build_object('booking_id', b.id, 'prospect_id', p.id, 'version', p.version,
                                        'checked_in', p.checked_in_at is not null, 'builtin', s.builtin))
      from public.class_bookings b
      join public.prospects p on p.submission_id = b.submission_id and p.child_index = b.child_index
      join public.prospect_statuses s on s.id = p.status_id
     where b.id = any (p_booking_ids)), '[]'::jsonb));
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Working a prospect (security definer; staff and admins)
-- Gate order: data access -> input -> found -> lock -> version -> write.
-- Every write sets tkd.action / tkd.batch_id for the history and answers
-- {"status": ...}: ok | no_access | not_allowed | invalid | not_found | stale.
-- ---------------------------------------------------------------------

-- 7a. prospects_lock(prospect, expected version or null) - finds and
-- locks the prospect; 'ok' or the status to answer. (internal)
create or replace function public.prospects_lock(p_prospect_id uuid, p_expected_version integer)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_version integer;
begin
  select p.version into v_version from public.prospects p where p.id = p_prospect_id for update;
  if not found then return 'not_found'; end if;
  if p_expected_version is not null and v_version <> p_expected_version then return 'stale'; end if;
  return 'ok';
end;
$$;

revoke execute on function public.prospects_lock(uuid, integer) from public, anon, authenticated, service_role;

-- 7b. prospects_set_status(prospect, version, status, joined on) - Joined
-- needs the date joined (today or earlier, not before the sign-up);
-- every other status clears it.
create or replace function public.prospects_set_status(p_prospect_id uuid, p_expected_version integer, p_status_id uuid, p_joined_on date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_s record;
  v_old text;
  v_check text;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_prospect_id is null or p_expected_version is null or p_status_id is null then return jsonb_build_object('status', 'invalid'); end if;
    v_check := public.prospects_lock(p_prospect_id, p_expected_version);
    if v_check <> 'ok' then return jsonb_build_object('status', v_check); end if;
    select p.* into v_p from public.prospects p where p.id = p_prospect_id;
    select s.* into v_s from public.prospect_statuses s where s.id = p_status_id and s.location_code = v_p.location_code for key share;
    if not found then return jsonb_build_object('status', 'stale'); end if;
    if (coalesce(v_s.builtin, '') = 'joined') <> (p_joined_on is not null)   -- (a custom status has no built-in key)
       or (p_joined_on is not null and (p_joined_on > public.schedule_today()
                                        or p_joined_on < ((select s.created_at from public.form_submissions s where s.id = v_p.submission_id)
                                                          at time zone 'America/New_York')::date - 1)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select s.name into v_old from public.prospect_statuses s where s.id = v_p.status_id;
    perform set_config('tkd.action', 'prospects_set_status', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.prospects p set status_id = p_status_id, joined_on = p_joined_on, last_activity_at = now()
     where p.id = p_prospect_id returning p.version into v_version;
    if v_p.status_id <> p_status_id or v_p.joined_on is distinct from p_joined_on then
      perform public.prospects_log(p_prospect_id, v_p.location_code, 'status',
                                   jsonb_build_object('from', v_old, 'to', v_s.name, 'joined_on', p_joined_on));
    end if;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_prospect_id, 'version', v_version);
  exception
    when foreign_key_violation or unique_violation then return jsonb_build_object('status', 'stale');
    when check_violation or not_null_violation or data_exception then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- 7c. prospects_add_note(prospect, text, set follow-up?, follow-up date) -
-- a note (never changed) and, when asked, the follow-up date with it
-- (Tomorrow / In 3 days / Next week / a date = the date; No follow-up = null).
create or replace function public.prospects_add_note(p_prospect_id uuid, p_body text, p_set_follow_up boolean, p_follow_up_on date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc text;
  v_body text := btrim(replace(replace(coalesce(p_body, ''), chr(13) || chr(10), chr(10)), chr(13), chr(10)));
  v_version integer;
  v_check text;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_prospect_id is null or p_set_follow_up is null or not coalesce(public.forms_long_text_ok(v_body, 1000), false)
       or (p_follow_up_on is not null and (not p_set_follow_up or p_follow_up_on < public.schedule_today()
                                           or p_follow_up_on > public.schedule_today() + 366)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_check := public.prospects_lock(p_prospect_id, null);
    if v_check <> 'ok' then return jsonb_build_object('status', v_check); end if;
    select p.location_code into v_loc from public.prospects p where p.id = p_prospect_id;
    perform set_config('tkd.action', 'prospects_add_note', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.prospect_notes (prospect_id, location_code, body, follow_up_on, created_by, created_by_name)
    values (p_prospect_id, v_loc, v_body, case when p_set_follow_up then p_follow_up_on end, auth.uid(), public.change_log_actor_name());
    if p_set_follow_up then
      update public.prospects p set follow_up_on = p_follow_up_on, last_activity_at = now() where p.id = p_prospect_id
      returning p.version into v_version;
    else
      update public.prospects p set last_activity_at = now() where p.id = p_prospect_id returning p.version into v_version;
    end if;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_prospect_id, 'version', v_version);
  exception
    when check_violation or not_null_violation or data_exception then return jsonb_build_object('status', 'invalid');
    when foreign_key_violation then return jsonb_build_object('status', 'not_found');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- 7d. prospects_set_follow_up(prospect, version, date or null).
create or replace function public.prospects_set_follow_up(p_prospect_id uuid, p_expected_version integer, p_follow_up_on date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc text;
  v_version integer;
  v_check text;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_prospect_id is null or p_expected_version is null
       or (p_follow_up_on is not null and (p_follow_up_on < public.schedule_today() or p_follow_up_on > public.schedule_today() + 366)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_check := public.prospects_lock(p_prospect_id, p_expected_version);
    if v_check <> 'ok' then return jsonb_build_object('status', v_check); end if;
    perform set_config('tkd.action', 'prospects_set_follow_up', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.prospects p set follow_up_on = p_follow_up_on, last_activity_at = now()
     where p.id = p_prospect_id returning p.version, p.location_code into v_version, v_loc;
    perform public.prospects_log(p_prospect_id, v_loc, 'follow_up', jsonb_build_object('on', p_follow_up_on));
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_prospect_id, 'version', v_version);
  exception
    when check_violation or not_null_violation or data_exception then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- 7e. prospects_mark_opened(prospect) - "I've seen this one" (the badge is
-- per person). Not part of the history (it changes nothing about the child).
create or replace function public.prospects_mark_opened(p_prospect_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_prospect_id is null or auth.uid() is null then return jsonb_build_object('status', 'invalid'); end if;
  if not exists (select 1 from public.prospects p where p.id = p_prospect_id) then return jsonb_build_object('status', 'not_found'); end if;
  begin
    insert into public.prospect_opens (prospect_id, staff_id) values (p_prospect_id, auth.uid())
    on conflict (prospect_id, staff_id) do nothing;
  exception when foreign_key_violation then
    return jsonb_build_object('status', 'not_found');   -- deleted at the same moment
  end;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- 7f. prospects_check_in(prospect, version, came) - on the class day, when
-- the family walks in (came = true); or, after the class has ended without
-- a check-in, the "Did … come?" answer (came true -> Came, false ->
-- No-show + follow-up tomorrow). Refused for a cancelled class, a class
-- that didn't run, a class not today (check in) or not over yet (answer).
-- Answers the status it had before, for Undo.
create or replace function public.prospects_check_in(p_prospect_id uuid, p_expected_version integer, p_came boolean, p_after_class boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_b record;
  v_check text;
  v_version integer;
  v_to uuid;
  v_now timestamp := (now() at time zone 'America/New_York');
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_prospect_id is null or p_expected_version is null or p_came is null or p_after_class is null
       or (not p_came and not p_after_class) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_check := public.prospects_lock(p_prospect_id, p_expected_version);
    if v_check <> 'ok' then return jsonb_build_object('status', v_check); end if;
    select p.* into v_p from public.prospects p where p.id = p_prospect_id;
    select b.* into v_b from public.class_bookings b where b.submission_id = v_p.submission_id and b.child_index = v_p.child_index;
    if not found or v_b.status <> 'booked' or v_p.checked_in_at is not null or v_b.class_id is null
       or (select s.builtin from public.prospect_statuses s where s.id = v_p.status_id) in ('joined', 'not_interested')
       or not public.prospects_class_ran(v_b.location_code, v_b.class_id, v_b.on_date, v_b.starts_at)
       or (not p_after_class and v_b.on_date <> public.schedule_today())
       or (p_after_class and (v_b.on_date + v_b.ends_at) >= v_now) then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    perform set_config('tkd.action', 'prospects_check_in', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    if p_came then
      v_to := public.prospects_status_of(v_p.location_code, 'came');
      update public.prospects p set status_id = v_to, checked_in_at = now(), checked_in_by_name = public.change_log_actor_name(),
                                    last_activity_at = now()
       where p.id = p_prospect_id returning p.version into v_version;
      perform public.prospects_log(p_prospect_id, v_p.location_code, case when p_after_class then 'came' else 'check_in' end,
                                   jsonb_build_object('class_name', v_b.class_name, 'date', v_b.on_date));
    else
      v_to := public.prospects_status_of(v_p.location_code, 'no_show');
      update public.prospects p set status_id = v_to, follow_up_on = public.schedule_today() + 1, last_activity_at = now()
       where p.id = p_prospect_id returning p.version into v_version;
      perform public.prospects_log(p_prospect_id, v_p.location_code, 'no_show',
                                   jsonb_build_object('class_name', v_b.class_name, 'date', v_b.on_date));
    end if;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_prospect_id, 'version', v_version, 'previous_status_id', v_p.status_id,
                              'previous_follow_up_on', v_p.follow_up_on);
  exception
    when check_violation or not_null_violation or data_exception then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- 7g. prospects_undo_check_in(prospect, version, previous status, previous
-- follow-up) - Undo of 7f: only when nothing changed since (version).
create or replace function public.prospects_undo_check_in(p_prospect_id uuid, p_expected_version integer, p_previous_status_id uuid,
                                                          p_previous_follow_up_on date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_check text;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_prospect_id is null or p_expected_version is null or p_previous_status_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_check := public.prospects_lock(p_prospect_id, p_expected_version);
    if v_check <> 'ok' then return jsonb_build_object('status', v_check); end if;
    select p.*, s.builtin into v_p from public.prospects p join public.prospect_statuses s on s.id = p.status_id where p.id = p_prospect_id;
    if v_p.builtin not in ('came', 'no_show')
       or not exists (select 1 from public.prospect_statuses s where s.id = p_previous_status_id and s.location_code = v_p.location_code
                         and coalesce(s.builtin, '') not in ('joined', 'came', 'no_show')) then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    perform set_config('tkd.action', 'prospects_undo_check_in', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.prospects p set status_id = p_previous_status_id, checked_in_at = null, checked_in_by_name = null,
                                  follow_up_on = case when v_p.builtin = 'no_show' then p_previous_follow_up_on else p.follow_up_on end
     where p.id = p_prospect_id returning p.version into v_version;
    perform public.prospects_log(p_prospect_id, v_p.location_code, 'undo_check_in', '{}'::jsonb);
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_prospect_id, 'version', v_version);
  exception
    when check_violation or not_null_violation or data_exception or foreign_key_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. Free classes from the panel (v0.244 answer 2)
-- Times come from every form of the school that offers classes (0009's
-- forms_times: the schedule in effect, closures, the booking window and
-- the SHARED spot limit). 0009 keeps one booking row per child: a change
-- removes the old row and adds the new one in the same transaction; a
-- cancel marks it cancelled (the spot is freed).
-- ---------------------------------------------------------------------

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
                                        'spots_left', t.spots_left) order by t.on_date, t.starts_at, t.class_name)
      from (select distinct on (x.class_id, x.on_date, x.starts_at) f.id as form_id, x.*
              from public.forms f, public.forms_times(f.id, p_from, p_to) x
             where f.location_code = v_loc and f.status = 'live'
               and exists (select 1 from public.form_booking_offers o where o.form_id = f.id)
               and exists (select 1 from jsonb_array_elements(f.published) e where e ->> 'type' = 'booking')
             order by x.class_id, x.on_date, x.starts_at, x.spots_left desc, f.id) t), '[]'::jsonb));
end;
$$;

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
    if v_had and v_old.class_id is not null
       and (v_old.class_id::text, v_old.on_date, v_old.starts_at) < (p_class_id::text, p_date, p_starts_at) then
      perform public.prospects_lock_slot(v_p.location_code, v_old.class_id, v_old.on_date, v_old.starts_at);
      perform public.prospects_lock_slot(v_p.location_code, p_class_id, p_date, p_starts_at);
    elsif v_had and v_old.class_id is not null then
      perform public.prospects_lock_slot(v_p.location_code, p_class_id, p_date, p_starts_at);
      perform public.prospects_lock_slot(v_p.location_code, v_old.class_id, v_old.on_date, v_old.starts_at);
    else
      perform public.prospects_lock_slot(v_p.location_code, p_class_id, p_date, p_starts_at);
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

-- 8c. prospects_cancel_time(prospect, version) - cancel the free class
-- (Booked goes back to New; the spot is freed). Not after a check-in.
create or replace function public.prospects_cancel_time(p_prospect_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_b record;
  v_check text;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_prospect_id is null or p_expected_version is null then return jsonb_build_object('status', 'invalid'); end if;
    v_check := public.prospects_lock(p_prospect_id, p_expected_version);
    if v_check <> 'ok' then return jsonb_build_object('status', v_check); end if;
    select p.* into v_p from public.prospects p where p.id = p_prospect_id;
    select b.* into v_b from public.class_bookings b
     where b.submission_id = v_p.submission_id and b.child_index = v_p.child_index for update;
    if not found or v_b.status <> 'booked' or v_p.checked_in_at is not null then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    perform set_config('tkd.action', 'prospects_cancel_time', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.class_bookings b set status = 'cancelled' where b.id = v_b.id;
    perform public.prospects_log(p_prospect_id, v_p.location_code, 'cancelled_time',
                                 jsonb_build_object('class_name', v_b.class_name, 'date', v_b.on_date, 'starts_at', to_char(v_b.starts_at, 'HH24:MI')));
    update public.prospects p set last_activity_at = now() where p.id = p_prospect_id returning p.version into v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_prospect_id, 'version', v_version,
                              'cancelled', jsonb_build_object('form_id', v_b.form_id, 'class_id', v_b.class_id, 'date', v_b.on_date,
                                                              'starts_at', to_char(v_b.starts_at, 'HH24:MI')));
  exception
    when check_violation or not_null_violation or data_exception then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;


-- ---------------------------------------------------------------------
-- 9. Statuses (each school's own list)
-- Admins and staff add, rename, recolor, reorder (v0.236); only admins
-- delete a custom one (v0.244 answer 5). Built-in ones keep their kind.
-- ---------------------------------------------------------------------

-- 9a. prospect_statuses_add(school, name, kind, color)
create or replace function public.prospect_statuses_add(p_location_code text, p_name text, p_kind text, p_color text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_version integer;
  v_name text := public.testing_normalize_name(p_name);
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_location_code is null or not exists (select 1 from public.locations l where l.code = p_location_code)
       or not coalesce(public.calendar_text_is_valid(v_name, 40), false) or p_kind is null or p_kind not in ('stage', 'exit')
       or p_color is null or p_color not in ('gray', 'yellow', 'orange', 'green', 'teal', 'sky', 'purple', 'pink') then
      return jsonb_build_object('status', 'invalid');
    end if;
    perform 1 from public.locations l where l.code = p_location_code for no key update;
    perform public.prospects_seed_statuses(p_location_code);
    if (select count(*) from public.prospect_statuses s where s.location_code = p_location_code) >= 30 then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.prospect_statuses s where s.location_code = p_location_code and lower(s.name) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;
    perform set_config('tkd.action', 'prospect_statuses_add', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.prospect_statuses (location_code, name, kind, position, color)
    values (p_location_code, v_name, p_kind,
            (select coalesce(max(s.position), -1) + 1 from public.prospect_statuses s where s.location_code = p_location_code), p_color)
    returning id, version into v_id, v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version);
  exception
    when unique_violation then return jsonb_build_object('status', 'duplicate_name');
    when check_violation or not_null_violation or foreign_key_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- 9b. prospect_statuses_update(status, version, name, kind, color) -
-- a built-in status keeps its kind.
create or replace function public.prospect_statuses_update(p_status_id uuid, p_expected_version integer, p_name text, p_kind text, p_color text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s record;
  v_version integer;
  v_name text := public.testing_normalize_name(p_name);
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_status_id is null or p_expected_version is null or not coalesce(public.calendar_text_is_valid(v_name, 40), false)
       or p_kind is null or p_kind not in ('stage', 'exit')
       or p_color is null or p_color not in ('gray', 'yellow', 'orange', 'green', 'teal', 'sky', 'purple', 'pink') then
      return jsonb_build_object('status', 'invalid');
    end if;
    select s.* into v_s from public.prospect_statuses s where s.id = p_status_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    perform 1 from public.locations l where l.code = v_s.location_code for no key update;
    select s.* into v_s from public.prospect_statuses s where s.id = p_status_id for update;
    if v_s.version <> p_expected_version then return jsonb_build_object('status', 'stale'); end if;
    if v_s.builtin is not null and p_kind <> v_s.kind then return jsonb_build_object('status', 'not_allowed'); end if;
    if exists (select 1 from public.prospect_statuses s where s.location_code = v_s.location_code and lower(s.name) = lower(v_name) and s.id <> p_status_id) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;
    perform set_config('tkd.action', 'prospect_statuses_update', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.prospect_statuses s set name = v_name, kind = p_kind, color = p_color where s.id = p_status_id
    returning s.version into v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_status_id, 'version', v_version);
  exception
    when unique_violation then return jsonb_build_object('status', 'duplicate_name');
    when check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- 9c. prospect_statuses_reorder(school, the order the screen showed, the
-- new order) - 'stale' when someone else changed the list meanwhile.
create or replace function public.prospect_statuses_reorder(p_location_code text, p_expected_ids uuid[], p_new_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current uuid[];
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_location_code is null or p_expected_ids is null or p_new_ids is null
       or cardinality(p_expected_ids) <> cardinality(p_new_ids) or cardinality(p_new_ids) > 30
       or array_position(p_new_ids, null) is not null
       or (select count(distinct x) from unnest(p_new_ids) x) <> cardinality(p_new_ids)
       or (select array_agg(x order by x) from unnest(p_expected_ids) x) is distinct from (select array_agg(x order by x) from unnest(p_new_ids) x) then
      return jsonb_build_object('status', 'invalid');
    end if;
    perform 1 from public.locations l where l.code = p_location_code for no key update;
    select array_agg(s.id order by s.position, s.id) into v_current
      from public.prospect_statuses s where s.location_code = p_location_code;
    if v_current is distinct from p_expected_ids then return jsonb_build_object('status', 'stale'); end if;
    perform set_config('tkd.action', 'prospect_statuses_reorder', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.prospect_statuses s set position = (array_position(p_new_ids, s.id) - 1)::smallint
     where s.location_code = p_location_code;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok');
  exception
    when check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- 9d. prospect_statuses_delete(status, version, how many people the screen
-- showed in it, where they move) - ADMINS ONLY, custom statuses only.
create or replace function public.prospect_statuses_delete(p_status_id uuid, p_expected_version integer, p_expected_count integer, p_move_to_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s record;
  v_n integer;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_status_id is null or p_expected_version is null or p_expected_count is null or p_expected_count < 0 then
      return jsonb_build_object('status', 'invalid');
    end if;
    select s.* into v_s from public.prospect_statuses s where s.id = p_status_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    perform 1 from public.locations l where l.code = v_s.location_code for no key update;
    -- both statuses locked, in a fixed order
    perform 1 from public.prospect_statuses s where s.id in (p_status_id, p_move_to_id) order by s.id for update;
    select s.* into v_s from public.prospect_statuses s where s.id = p_status_id;
    if v_s.version <> p_expected_version then return jsonb_build_object('status', 'stale'); end if;
    if v_s.builtin is not null then return jsonb_build_object('status', 'not_allowed'); end if;
    select count(*) into v_n from public.prospects p where p.status_id = p_status_id;
    if v_n <> p_expected_count then return jsonb_build_object('status', 'stale'); end if;
    if v_n > 0 and (p_move_to_id is null or p_move_to_id = p_status_id
                    or not exists (select 1 from public.prospect_statuses s where s.id = p_move_to_id and s.location_code = v_s.location_code)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    perform set_config('tkd.action', 'prospect_statuses_delete', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.prospects p
       set status_id = p_move_to_id,
           joined_on = case when (select s.builtin from public.prospect_statuses s where s.id = p_move_to_id) = 'joined'
                            then public.schedule_today() end,
           last_activity_at = now()
     where p.status_id = p_status_id;
    delete from public.prospect_statuses s where s.id = p_status_id;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'moved', v_n);
  exception
    when foreign_key_violation then return jsonb_build_object('status', 'stale');
    when check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;


-- ---------------------------------------------------------------------
-- 10. Deleting a prospect - ADMINS ONLY (v0.236)
-- The child's prospect, notes, timeline and free-class booking go; the
-- family's sign-up goes with its LAST child (siblings keep theirs).
-- ---------------------------------------------------------------------
create or replace function public.prospects_delete(p_prospect_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_check text;
  v_family_gone boolean := false;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_prospect_id is null or p_expected_version is null then return jsonb_build_object('status', 'invalid'); end if;
    v_check := public.prospects_lock(p_prospect_id, p_expected_version);
    if v_check <> 'ok' then return jsonb_build_object('status', v_check); end if;
    select p.* into v_p from public.prospects p where p.id = p_prospect_id;
    -- the whole family locked (siblings), so two deletes can't both think they are last
    perform 1 from public.form_submissions s where s.id = v_p.submission_id for update;
    perform set_config('tkd.action', 'prospects_delete', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    if exists (select 1 from public.prospects x where x.submission_id = v_p.submission_id and x.id <> p_prospect_id) then
      delete from public.class_bookings b where b.submission_id = v_p.submission_id and b.child_index = v_p.child_index;
      delete from public.prospects p where p.id = p_prospect_id;
    else
      delete from public.form_submissions s where s.id = v_p.submission_id;   -- prospects, bookings, views cascade
      v_family_gone := true;
    end if;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'family_removed', v_family_gone);
  exception
    when foreign_key_violation or check_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;


-- ---------------------------------------------------------------------
-- 11. Who may call what
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'prospects_list(text)', 'prospects_search(text, text)', 'prospects_get(uuid)', 'prospects_badge(text)',
    'prospects_for_bookings(uuid[])', 'prospects_set_status(uuid, integer, uuid, date)',
    'prospects_add_note(uuid, text, boolean, date)', 'prospects_set_follow_up(uuid, integer, date)',
    'prospects_mark_opened(uuid)', 'prospects_check_in(uuid, integer, boolean, boolean)',
    'prospects_undo_check_in(uuid, integer, uuid, date)', 'prospects_open_times(uuid, date, date)',
    'prospects_book_time(uuid, integer, uuid, uuid, date, time)', 'prospects_cancel_time(uuid, integer)',
    'prospect_statuses_add(text, text, text, text)', 'prospect_statuses_update(uuid, integer, text, text, text)',
    'prospect_statuses_reorder(text, uuid[], uuid[])', 'prospect_statuses_delete(uuid, integer, integer, uuid)',
    'prospects_delete(uuid, integer)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 12. Backfill: statuses for every school, and prospects for sign-ups
-- saved before this file ran (0009 may have been live first). Safe to run
-- again: nothing is added twice. A backfilled prospect's own created_at is
-- the day this file ran (the bookkeeping trigger sets it), so everything
-- that shows or checks the SIGN-UP date reads form_submissions.created_at;
-- the "Signed up" line in each child's timeline gets that time too.
-- ---------------------------------------------------------------------
do $$
declare
  v_loc text;
  v_s record;
  v_b record;
begin
  perform set_config('tkd.action', '0012_backfill', true);
  for v_loc in select l.code from public.locations l loop
    perform public.prospects_seed_statuses(v_loc);
  end loop;
  for v_s in select s.* from public.form_submissions s
              where not exists (select 1 from public.prospects p where p.submission_id = s.id) loop
    insert into public.prospects (location_code, submission_id, child_index, child_first_name, child_age, status_id, last_activity_at)
    select v_s.location_code, v_s.id, (t.ord - 1)::smallint, t.c ->> 'first_name', (t.c ->> 'age')::smallint,
           public.prospects_status_of(v_s.location_code,
             case when exists (select 1 from public.class_bookings b
                                where b.submission_id = v_s.id and b.child_index = t.ord - 1 and b.status = 'booked')
                  then 'booked' else 'new' end),
           v_s.created_at
      from jsonb_array_elements(v_s.children) with ordinality as t(c, ord)
    on conflict (submission_id, child_index) do nothing;
    insert into public.prospect_activity (prospect_id, location_code, kind, detail, created_at, created_by_name)
    select p.id, p.location_code, 'created', jsonb_build_object('source', v_s.source, 'entered_by', v_s.entered_by),
           v_s.created_at, public.change_log_actor_name()
      from public.prospects p
     where p.submission_id = v_s.id
       and not exists (select 1 from public.prospect_activity a where a.prospect_id = p.id and a.kind = 'created');
  end loop;
  perform set_config('tkd.action', '', true);
end;
$$;

commit;
