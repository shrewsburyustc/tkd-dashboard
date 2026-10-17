-- =====================================================================
-- 0003_testing_classes_ranks.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The third database migration for the TKD staff dashboard. It runs
--   after 0001_staff_and_pin.sql and 0002_server_lock_and_accounts.sql
--   (both already live) and does not change anything they made.
--
-- WHY IT EXISTS
--   The first real data section: Testing -> Classes and ranks. Each school
--   (Worcester, Shrewsbury) has its own list of testing classes (Little
--   Tiger, White, Group A ...), and each class has an ordered list of ranks
--   (belts) with three testing prices and a "sparring gear" flag. Admins
--   change the lists; every staff member can read them while their session
--   is unlocked. Every change is recorded in a history table (who, when,
--   what), as the guidelines require (section 5).
--
-- WHAT IT ADDS
--   1. public.locations        - the two schools (a small lookup list)
--   2. public.testing_classes  - testing classes, per school, in order
--   3. public.testing_ranks    - ranks inside each class, in order, with prices
--   4. public.change_log       - append-only history of every change, for the
--                                whole dashboard (this section is the first
--                                user of it)
--   5. triggers that keep "version", "last changed by" and the history
--      correct automatically, and refuse impossible changes
--   6. security rules: read-only access for signed-in, UNLOCKED staff
--      (has_data_access() from 0002); no direct writes for anyone in the app
--   7. eight functions the app calls to change the lists (the ONLY way to
--      write; each checks access, admin role, the input, and that the
--      person saw the latest data):
--        testing_add_class, testing_update_class, testing_reorder_classes,
--        testing_delete_class, testing_add_rank, testing_update_rank,
--        testing_reorder_ranks, testing_delete_rank
--      + internal helpers the app cannot call (testing_normalize_name,
--        testing_name_is_valid, testing_cents_is_valid,
--        testing_ids_are_valid, change_log_actor_name, and the trigger
--        functions, including testing_refuse_truncate).
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words "delete" and "drop" appear inside rules ("on delete cascade"),
--   inside functions (the two delete functions run later, only when an
--   admin deletes something in the app) and in "drop ... if exists" lines
--   that make re-running safe. Nothing is deleted now. Confirm.
--   (Claude's Supabase connection refuses any SQL containing those words,
--   which is why this file is pasted by hand instead.)
--   Safe to run again: "create table if not exists", "create or replace
--   function", "drop trigger/policy/constraint if exists" + create again,
--   "insert ... on conflict do nothing". NOTE: "create table if not exists"
--   will NOT change an existing table's columns; future changes go in a new
--   file (0004_...). Re-running is only safe UNTIL a later migration changes
--   any of these objects: after that, running this old file again would
--   put the old versions of functions, triggers and rules back.
--   (amended after security review)
--
-- WORDS USED BELOW
--   * "school" = a location (worcester / shrewsbury). Location is a FILTER,
--     not a permission: both admins and staff see both schools.
--   * "position" = order in a list, always 0, 1, 2 ... with no gaps
--     ("dense"). The server renumbers; the app never picks a number.
--   * "version" = a counter on each class and rank that goes up by 1 on
--     every real content change (name, prices, final award ...). The app
--     sends the version it last saw; if it differs, someone else changed
--     the record in between and the change is refused as "stale" instead
--     of silently overwriting their work. Re-ordering does NOT change it.
--   * "final award" = the rank a student receives after passing the LAST
--     rank of a class (usually the first rank of the next class). Stored on
--     the class. "Testing for" (the next rank) is never stored; the app
--     works it out from the order.
--   * "security definer" / search_path = '' / qualified names: the same
--     rules as 0001 and 0002 (see 0001's header for why).
--   * "lock" (in the functions) = a row lock: "for no key update" / "for
--     update" make other changes to the same rows wait their turn until
--     this change is finished, so two admins can't interleave half-changes.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. public.locations - the two schools
-- WHY: a tiny lookup table so every class/rank row must name a real school
-- (a foreign key to it), and so the delete/reorder functions have one row
-- per school to lock while they renumber that school's classes.
-- Changes only through migrations (no triggers, no history).
-- ---------------------------------------------------------------------
create table if not exists public.locations (
  code text not null,
  name text not null,

  constraint locations_pkey       primary key (code),
  constraint locations_code_check check (code in ('worcester', 'shrewsbury')),
  constraint locations_name_key   unique (name)
);

comment on table public.locations is
  'The schools. A filter, not a permission: all staff see both. Changed only by migrations.';

-- "on conflict do nothing" = add the row only if it isn't there yet, so
-- re-running this file never duplicates or changes them.
insert into public.locations (code, name)
values ('worcester', 'Worcester'),
       ('shrewsbury', 'Shrewsbury')
on conflict (code) do nothing;


-- ---------------------------------------------------------------------
-- 2. Name rules (shared by classes and ranks; the app uses the same rules)
-- ---------------------------------------------------------------------

-- 2a. testing_normalize_name(p_name)
-- Turns what someone typed into the form we store:
--   * every run of spaces, tabs, line breaks or no-break spaces becomes ONE
--     space ("Group    E" -> "Group E")
--   * spaces at the start and end are removed
-- NULL stays NULL.
-- In the pattern: \t tab, \n line feed, \r carriage return, \f form feed,
-- \v vertical tab, \u00a0 no-break space (what Word/web pages often paste).
-- immutable = same input always gives the same answer (required because
-- the table rules below use it).
create or replace function public.testing_normalize_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_name is null then null
           else btrim(regexp_replace(p_name, '[ \t\n\r\f\v\u00a0]+', ' ', 'g'), ' ')
         end;
$$;

revoke execute on function public.testing_normalize_name(text) from public, anon, authenticated, service_role;

-- 2b. testing_name_is_valid(p_name)
-- true only if, after normalizing:
--   * it is 1 to 60 CHARACTERS long (char_length counts characters, so
--     "é" counts as 1 even though it takes 2 bytes), and
--   * it has no other invisible control characters (codes 1-8, 14-31,
--     127-159 - e.g. a "bell" or a stray escape code pasted from somewhere),
--   * and no invisible "format" characters: zero-width spaces/joiners and
--     direction marks (\u200b-\u200f), text-direction overrides
--     (\u202a-\u202e, \u2066-\u2069), invisible operators (\u2060-\u2064)
--     and the byte-order mark (\ufeff). They can make two names that look
--     identical count as different, or make a name display backwards.
-- NULL -> false. (amended after security review: format characters)
create or replace function public.testing_name_is_valid(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name is not null
     and char_length(public.testing_normalize_name(p_name)) between 1 and 60
     and public.testing_normalize_name(p_name)
         !~ '[\x01-\x08\x0e-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]';
$$;

revoke execute on function public.testing_name_is_valid(text) from public, anon, authenticated, service_role;

-- 2c. testing_cents_is_valid(p_cents)
-- Prices are whole dollars from $0 to $1,000, stored as cents (6500 = $65).
-- true only for 0 <= cents <= 100000 and a multiple of 100. NULL -> false.
-- (The table rules below say the same thing; this lets the functions answer
-- "invalid" before touching any row.)
create or replace function public.testing_cents_is_valid(p_cents integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_cents between 0 and 100000 and p_cents % 100 = 0, false);
$$;

revoke execute on function public.testing_cents_is_valid(integer) from public, anon, authenticated, service_role;

-- 2d. testing_ids_are_valid(p_ids)
-- For the id lists the app sends (orders, "what the dialog showed"):
-- true only if the list is not NULL, is a plain one-dimensional list, has
-- no NULL entries and no id twice. An empty list is valid.
-- (array_ndims of an empty list is NULL, hence the coalesce.)
create or replace function public.testing_ids_are_valid(p_ids uuid[])
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

revoke execute on function public.testing_ids_are_valid(uuid[]) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. public.testing_classes
-- One row per testing class per school, in belt order (position).
-- Notes on the less obvious parts:
--   * name: the check says "valid AND already normalized", so only the
--     cleaned-up form can ever be stored. coalesce(..., false) because a
--     check that comes out NULL would otherwise count as passing.
--   * created_by / updated_by: the staff member's login id. Deliberately
--     NO foreign key (it would stop a login from ever being removed), and
--     the app can't read them (section 7). The *_by_name columns keep a
--     copy of the name at the time, for "Last changed by ...".
--   * (location_code, position) unique "deferrable initially immediate":
--     normally checked like any rule, but at the END of each statement
--     rather than row by row - so one UPDATE can shift 5, 6, 7 down to
--     4, 5, 6 without tripping over itself half-way.
--   * (id, location_code) unique: lets ranks and final awards point at
--     "this class IN THIS SCHOOL", so a rank can never sit in a class of
--     the other school, and a final award can't come from the other school.
-- ---------------------------------------------------------------------
create table if not exists public.testing_classes (
  id                  uuid        not null default gen_random_uuid(),
  location_code       text        not null,
  name                text        not null,
  position            integer     not null,
  final_award_rank_id uuid        null,          -- the rank after the last rank; NULL = "Not set"
  version             integer     not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid        null,          -- no foreign key on purpose (see above)
  updated_by          uuid        null,
  created_by_name     text        not null,      -- set by the trigger (section 5)
  updated_by_name     text        not null,

  constraint testing_classes_pkey primary key (id),
  constraint testing_classes_location_fk
    foreign key (location_code) references public.locations (code),
  constraint testing_classes_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint testing_classes_position_check check (position >= 0),
  constraint testing_classes_version_check  check (version >= 1),
  constraint testing_classes_location_position_key
    unique (location_code, position) deferrable initially immediate,
  constraint testing_classes_id_location_key unique (id, location_code)
);

-- Class names are unique per school, ignoring capital letters
-- ("Group A" and "group a" can't both exist in Worcester).
create unique index if not exists testing_classes_location_lower_name_idx
  on public.testing_classes (location_code, lower(name));

comment on table public.testing_classes is
  'Testing classes per school, in belt order (position 0..n-1). Written only through the testing_* functions.';
comment on column public.testing_classes.final_award_rank_id is
  'Rank a student receives after passing this class''s last rank. Same school, never one of this class''s own ranks. NULL = Not set.';
comment on column public.testing_classes.version is
  'Goes up by 1 on every content change (name, final award). Used to refuse stale saves. Re-ordering does not change it.';


-- ---------------------------------------------------------------------
-- 4. public.testing_ranks
-- One row per rank, inside one class, in order (position), with prices.
--   * (class_id, location_code) -> testing_classes (id, location_code):
--     the rank's school always equals its class's school. "on delete
--     cascade" = deleting a class deletes its ranks with it.
--   * prices in cents, whole dollars $0 - $1,000 (see section 2c).
-- ---------------------------------------------------------------------
create table if not exists public.testing_ranks (
  id              uuid        not null default gen_random_uuid(),
  class_id        uuid        not null,
  location_code   text        not null,
  name            text        not null,
  position        integer     not null,
  early_cents     integer     not null,          -- paid in full before testing day
  day_cents       integer     not null,          -- paid on testing day
  private_cents   integer     not null,          -- private testing
  sparring_gear   boolean     not null default false,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint testing_ranks_pkey primary key (id),
  constraint testing_ranks_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint testing_ranks_position_check check (position >= 0),
  constraint testing_ranks_early_cents_check
    check (early_cents between 0 and 100000 and early_cents % 100 = 0),
  constraint testing_ranks_day_cents_check
    check (day_cents between 0 and 100000 and day_cents % 100 = 0),
  constraint testing_ranks_private_cents_check
    check (private_cents between 0 and 100000 and private_cents % 100 = 0),
  constraint testing_ranks_version_check check (version >= 1),
  constraint testing_ranks_class_fk
    foreign key (class_id, location_code)
    references public.testing_classes (id, location_code)
    on delete cascade,
  constraint testing_ranks_class_position_key
    unique (class_id, position) deferrable initially immediate,
  constraint testing_ranks_id_location_key unique (id, location_code)
);

-- Rank names are unique within a class, ignoring capital letters. The same
-- name in another class (or the other school) is fine.
create unique index if not exists testing_ranks_class_lower_name_idx
  on public.testing_ranks (class_id, lower(name));

-- The app reads ranks one school at a time.
create index if not exists testing_ranks_location_idx
  on public.testing_ranks (location_code);

comment on table public.testing_ranks is
  'Ranks inside each testing class, in order (position 0..n-1), with prices in cents. Written only through the testing_* functions.';


-- ---------------------------------------------------------------------
-- 4b. The final award link (class -> rank), added after both tables exist
-- WHY separate: classes point at ranks and ranks point at classes (a
-- circle), so this link can only be added once testing_ranks exists.
--   * (final_award_rank_id, location_code) -> testing_ranks (id,
--     location_code): the award must be a rank of the SAME school.
--   * "on delete set null (final_award_rank_id)": if that rank is deleted,
--     only final_award_rank_id becomes NULL ("Not set"); location_code is
--     left alone (it is part of the link but must never change).
--     (This column-list form needs PostgreSQL 15+; production runs 17.)
-- "drop constraint if exists" + "add constraint" keeps re-runs harmless.
-- ---------------------------------------------------------------------
alter table public.testing_classes
  drop constraint if exists testing_classes_final_award_fk;
alter table public.testing_classes
  add constraint testing_classes_final_award_fk
  foreign key (final_award_rank_id, location_code)
  references public.testing_ranks (id, location_code)
  on delete set null (final_award_rank_id);

-- Makes "which classes use this rank as their final award?" fast (asked by
-- every rank delete). Only rows with an award are indexed.
create index if not exists testing_classes_final_award_idx
  on public.testing_classes (final_award_rank_id)
  where final_award_rank_id is not null;


-- ---------------------------------------------------------------------
-- 5. public.change_log - append-only history (whole dashboard)
-- One row per changed row: who (actor_id/actor_name/session_id), when,
-- why (action - which app function, or 'seed' / 'manual'), which table and
-- record, and what changed:
--   insert: before NULL,              after = the full new row
--   update: before/after = ONLY the columns that changed (old / new values)
--   delete: before = the full old row, after NULL
-- batch_id groups all rows written by ONE app call (e.g. a class delete
-- writes the class, all its ranks and any cleared final awards).
-- Nobody in the app can read or change it (RLS on, no policies, no grants).
-- ---------------------------------------------------------------------
create table if not exists public.change_log (
  id            bigint      generated always as identity,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid        null,       -- auth.uid(); NULL in the SQL Editor. No foreign key on purpose.
  actor_name    text        not null,   -- name at the time (change_log_actor_name)
  session_id    uuid        null,       -- which sign-in session (device)
  batch_id      uuid        null,       -- same for every row one app call wrote
  action        text        not null,   -- add_class, update_rank, ..., seed, manual
  table_name    text        not null,
  record_id     uuid        not null,
  location_code text        null,
  op            text        not null,
  before        jsonb       null,
  after         jsonb       null,

  constraint change_log_pkey     primary key (id),
  constraint change_log_op_check check (op in ('insert', 'update', 'delete'))
);

create index if not exists change_log_table_record_idx on public.change_log (table_name, record_id);
create index if not exists change_log_occurred_at_idx  on public.change_log (occurred_at);
create index if not exists change_log_batch_idx        on public.change_log (batch_id);

comment on table public.change_log is
  'Append-only history of every change. Later sections must exclude sensitive columns (e.g. PIN hashes, medical notes) from before/after.';


-- ---------------------------------------------------------------------
-- 6. Trigger functions (run automatically on every write)
-- ---------------------------------------------------------------------

-- 6a. change_log_actor_name() - "who is making this change?"
-- The staff member's full name for the signed-in user. In the SQL Editor
-- there is no signed-in user, so it uses the label a script set with
--   select set_config('tkd.actor_label', 'Initial copy from the old system', true);
-- or else 'Database admin'.
-- security definer because a staff member can read only their OWN staff
-- row - and a trigger may run for someone else's change (e.g. a cascade).
create or replace function public.change_log_actor_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.full_name from public.staff s where s.id = auth.uid()),
    nullif(current_setting('tkd.actor_label', true), ''),
    'Database admin'
  );
$$;

revoke execute on function public.change_log_actor_name() from public, anon, authenticated, service_role;

-- 6b. testing_classes_before_write() - BEFORE INSERT OR UPDATE on classes
-- Keeps the bookkeeping columns honest, whatever the writer supplied:
--   insert: version 1; created/updated stamps = now + who
--   update: id and location_code can never change (error); created_* are
--           kept; a CONTENT change (name, final award) bumps version and
--           sets updated_* = now + who; a position-only change (re-order)
--           keeps version and updated_* exactly as they were.
--   both:   the final award can't be one of this class's own ranks.
-- "new" = the row as it will be saved, "old" = the row before the update.
-- Errors use errcode 23514 (check_violation) so they look like any other
-- broken table rule, with a constraint name saying which rule.
create or replace function public.testing_classes_before_write()
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
  else
    if new.id is distinct from old.id
       or new.location_code is distinct from old.location_code then
      raise exception using
        errcode    = '23514',
        constraint = 'testing_classes_immutable',
        message    = 'a testing class''s id and location_code can''t change';
    end if;

    -- created_* never change after insert
    new.created_at      := old.created_at;
    new.created_by      := old.created_by;
    new.created_by_name := old.created_by_name;

    if new.name is distinct from old.name
       or new.final_award_rank_id is distinct from old.final_award_rank_id then
      -- content change: new version, stamped now
      new.version         := old.version + 1;
      new.updated_at      := now();
      new.updated_by      := auth.uid();
      new.updated_by_name := public.change_log_actor_name();
    else
      -- position only (or nothing): leave the version and stamps alone
      new.version         := old.version;
      new.updated_at      := old.updated_at;
      new.updated_by      := old.updated_by;
      new.updated_by_name := old.updated_by_name;
    end if;
  end if;

  -- The final award is what students get AFTER this class, so it can't be
  -- one of this class's own ranks.
  if new.final_award_rank_id is not null
     and exists (select 1
                   from public.testing_ranks r
                  where r.id = new.final_award_rank_id
                    and r.class_id = new.id) then
    raise exception using
      errcode    = '23514',
      constraint = 'testing_classes_final_award_not_own',
      message    = 'final award can''t be one of the class''s own ranks';
  end if;

  return new;
end;
$$;

revoke execute on function public.testing_classes_before_write() from public, anon, authenticated, service_role;

-- 6c. testing_ranks_before_write() - BEFORE INSERT OR UPDATE on ranks
-- Same bookkeeping as 6b. Content columns: name, the three prices,
-- sparring_gear. id, class_id and location_code can never change (a rank
-- never moves to another class or school).
create or replace function public.testing_ranks_before_write()
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
     or new.class_id is distinct from old.class_id
     or new.location_code is distinct from old.location_code then
    raise exception using
      errcode    = '23514',
      constraint = 'testing_ranks_immutable',
      message    = 'a testing rank''s id, class_id and location_code can''t change';
  end if;

  new.created_at      := old.created_at;
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;

  if new.name is distinct from old.name
     or new.early_cents is distinct from old.early_cents
     or new.day_cents is distinct from old.day_cents
     or new.private_cents is distinct from old.private_cents
     or new.sparring_gear is distinct from old.sparring_gear then
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

revoke execute on function public.testing_ranks_before_write() from public, anon, authenticated, service_role;

-- 6d. change_log_write() - AFTER INSERT OR UPDATE OR DELETE on classes and
-- ranks: writes one history row per changed row (see section 5).
-- to_jsonb(row) turns a whole row into {"column": value, ...}.
-- For an update, only the columns whose value changed are kept; if
-- nothing changed at all, no history row is written.
-- The action and batch id come from settings the app functions set just
-- before writing (section 8); anything untagged is logged as 'manual'.
-- security definer so it can write to change_log, which nobody else can.
-- (The return value of an AFTER trigger is ignored, hence "return null".)
-- RULE for attaching it to another table later: that table must have a
-- uuid column named "id" (record_id is a uuid), and sensitive columns
-- (PIN hashes, medical notes) must be kept out of before/after.
create or replace function public.change_log_write()
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
  v_row    jsonb;   -- whichever of old/new exists, for id + location_code
begin
  if tg_op = 'INSERT' then
    v_new   := to_jsonb(new);
    v_after := v_new;
    v_row   := v_new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    -- keep only the columns whose value changed
    select jsonb_object_agg(o.key, o.value)
      into v_before
      from jsonb_each(v_old) as o(key, value)
     where o.value is distinct from v_new -> o.key;
    select jsonb_object_agg(n.key, n.value)
      into v_after
      from jsonb_each(v_new) as n(key, value)
     where n.value is distinct from v_old -> n.key;
    if v_before is null and v_after is null then
      return null;   -- identical rows: nothing to record
    end if;
    v_row := v_new;
  else   -- DELETE: keep the whole old row
    v_old    := to_jsonb(old);
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
     v_row ->> 'location_code',
     lower(tg_op),
     v_before,
     v_after);

  return null;
end;
$$;

revoke execute on function public.change_log_write() from public, anon, authenticated, service_role;

-- 6e. change_log_refuse_change() - keeps the history append-only
-- Runs BEFORE any UPDATE, DELETE or TRUNCATE on change_log and refuses it,
-- even for the SQL Editor (history that can be edited isn't history).
-- Limit: the database owner could still switch this trigger off on
-- purpose; it stops mistakes and the app, not a deliberate owner.
create or replace function public.change_log_refuse_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'change_log is append-only';
end;
$$;

revoke execute on function public.change_log_refuse_change() from public, anon, authenticated, service_role;

-- 6e2. testing_refuse_truncate() - no "empty the whole table" shortcut
-- TRUNCATE removes every row at once WITHOUT running the row triggers, so
-- nothing would reach the history. Classes and ranks are removed through
-- the app (or, in an emergency, with a normal DELETE, which is logged).
-- Runs BEFORE TRUNCATE on testing_classes and testing_ranks and refuses it.
-- (amended after security review)
create or replace function public.testing_refuse_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% can''t be truncated (it would skip the history); remove rows one by one', tg_table_name;
end;
$$;

revoke execute on function public.testing_refuse_truncate() from public, anon, authenticated, service_role;

-- 6f. Attach the triggers. "drop trigger if exists" + "create trigger" =
-- replace (there is no "create or replace trigger" that works everywhere).
drop trigger if exists testing_classes_before_write on public.testing_classes;
create trigger testing_classes_before_write
  before insert or update on public.testing_classes
  for each row
  execute function public.testing_classes_before_write();

drop trigger if exists testing_ranks_before_write on public.testing_ranks;
create trigger testing_ranks_before_write
  before insert or update on public.testing_ranks
  for each row
  execute function public.testing_ranks_before_write();

drop trigger if exists testing_classes_log on public.testing_classes;
create trigger testing_classes_log
  after insert or update or delete on public.testing_classes
  for each row
  execute function public.change_log_write();

drop trigger if exists testing_ranks_log on public.testing_ranks;
create trigger testing_ranks_log
  after insert or update or delete on public.testing_ranks
  for each row
  execute function public.change_log_write();

drop trigger if exists testing_classes_no_truncate on public.testing_classes;
create trigger testing_classes_no_truncate
  before truncate on public.testing_classes
  for each statement
  execute function public.testing_refuse_truncate();

drop trigger if exists testing_ranks_no_truncate on public.testing_ranks;
create trigger testing_ranks_no_truncate
  before truncate on public.testing_ranks
  for each statement
  execute function public.testing_refuse_truncate();

drop trigger if exists change_log_append_only on public.change_log;
create trigger change_log_append_only
  before update or delete on public.change_log
  for each row
  execute function public.change_log_refuse_change();

drop trigger if exists change_log_no_truncate on public.change_log;
create trigger change_log_no_truncate
  before truncate on public.change_log
  for each statement
  execute function public.change_log_refuse_change();


-- ---------------------------------------------------------------------
-- 7. Security rules: RLS + grants
-- Same two layers as 0001 (see its section 7):
--   * grants decide WHICH COLUMNS the app may read at all - here only
--     SELECT on the listed columns; created_by / updated_by (login ids) are
--     not granted, so "select *" is refused and the app lists its columns.
--     No INSERT / UPDATE / DELETE for anyone in the app: all writes go
--     through the functions in section 8.
--   * RLS policies decide WHICH ROWS: every row, but only while
--     has_data_access() (0002) is true - active staff, password sign-in
--     within 7 days, still signed in, not PIN-locked, unlocked right now.
--     Any other session simply sees no rows.
-- change_log: RLS on, no policy, no grants at all = nobody in the app.
-- service_role (the role behind Supabase's SECRET key) gets nothing either:
-- Supabase gives it everything on new tables by default, but the app never
-- uses that key, so taking it away means a leaked secret key can't quietly
-- write classes, ranks or fake history through the API.
-- (amended after security review: service_role revoked everywhere)
-- ---------------------------------------------------------------------
alter table public.locations       enable row level security;
alter table public.testing_classes enable row level security;
alter table public.testing_ranks   enable row level security;
alter table public.change_log      enable row level security;

-- Start from zero (also removes any column grants, so re-runs stay clean)...
revoke all on table public.locations, public.testing_classes, public.testing_ranks, public.change_log
  from public, anon, authenticated, service_role;
revoke all on sequence public.change_log_id_seq from public, anon, authenticated, service_role;

-- ...then add back exactly the readable columns.
grant select (code, name) on public.locations to authenticated;
grant select (id, location_code, name, position, final_award_rank_id, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.testing_classes to authenticated;
grant select (id, class_id, location_code, name, position, early_cents, day_cents, private_cents,
              sparring_gear, version, created_at, updated_at, created_by_name, updated_by_name)
  on public.testing_ranks to authenticated;
-- created_by / updated_by (login ids) are NOT granted. change_log: nothing at all.

-- Read rules. "(select ...)" = run the check once per query, not per row.
drop policy if exists locations_select_with_access on public.locations;
create policy locations_select_with_access
  on public.locations
  for select
  to authenticated
  using ((select public.has_data_access()));

drop policy if exists testing_classes_select_with_access on public.testing_classes;
create policy testing_classes_select_with_access
  on public.testing_classes
  for select
  to authenticated
  using ((select public.has_data_access()));

drop policy if exists testing_ranks_select_with_access on public.testing_ranks;
create policy testing_ranks_select_with_access
  on public.testing_ranks
  for select
  to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 8. The eight app functions (the only way to change the lists)
--
-- Every one follows the same pattern:
--   * returns JSON: {"status": "ok", ...} or just {"status": "<problem>"}
--       ok             - saved
--       no_access      - this session has no data access (locked, PIN-locked,
--                        signed out, old/magic-link sign-in, inactive)
--       not_allowed    - signed in and unlocked, but not an admin
--       invalid        - the input breaks a rule (empty name, $65.50, ...)
--       not_found      - the class/rank no longer exists
--       stale          - someone changed it since this screen loaded
--       duplicate_name - that name is already used (class per school, rank
--                        per class; capital letters ignored)
--       not_empty      - (delete class "only if empty") the class has ranks
--   * checks in this order: has_data_access() FIRST, then is_admin() (the
--     0002 rule: is_admin() is never a gate on its own), then the input,
--     then it locks the rows it will touch and checks they still exist and
--     still match what the person saw, then writes.
--   * "tags" its writes: tkd.action = which function, tkd.batch_id = one new
--     id for everything this call writes, so the history (change_log) can
--     say why each row changed. Both are cleared again right after.
--     set_config(..., true) = only until the end of this transaction.
--   * the whole body is inside begin ... exception ... end: if a table rule
--     still says no (e.g. two admins saved the same name at the same
--     moment), everything this call did is undone - tags included - and a
--     status is returned instead of an error:
--       duplicate name index      -> duplicate_name
--       any other unique rule     -> stale   (e.g. a position race)
--       foreign key rule          -> invalid
--       check / not-null rule     -> invalid
--       deadlock / serialization / lock not available -> stale
--     Anything else is a real error and reaches the app as one.
--   * locks: EVERY write function first finds which school it is about
--     (without locking), then locks that school's row in public.locations
--     "for no key update", then the class, then the rank(s), then any other
--     classes (by id). Because every write in a school starts by taking the
--     same school lock, writes to one school simply happen one after the
--     other - two admins' calls can never each hold something the other
--     needs (a "deadlock"). "for no key update" still allows the quick
--     checks the table rules make when a row points at the school. A row
--     about to be deleted is locked "for update".
--     (amended after security review: one lock order for all writes)
-- ---------------------------------------------------------------------

-- 8a. testing_add_class(p_location_code, p_name, p_final_award_rank_id)
-- Adds an empty class at the END of a school's list. The final award is
-- optional (NULL = Not set). Ok: {"status":"ok","id":...,"version":1,"position":n}
create or replace function public.testing_add_class(
  p_location_code       text,
  p_name                text,
  p_final_award_rank_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name       text;   -- the cleaned-up name (set after the access checks)
  v_award_loc  text;
  v_id         uuid;
  v_version    integer;
  v_position   integer;
  v_constraint text;
begin
  begin
    -- 1-2. who is asking
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 3. input
    v_name := public.testing_normalize_name(p_name);
    if p_location_code is null
       or not exists (select 1 from public.locations l where l.code = p_location_code)
       or not public.testing_name_is_valid(p_name) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. lock the school, so two adds can't both take the same position
    perform 1 from public.locations l where l.code = p_location_code for no key update;

    -- 6. the chosen final award: still there (else stale) and in this
    --    school (else invalid). "for key share" stops it being deleted
    --    until this call has finished.
    if p_final_award_rank_id is not null then
      select r.location_code
        into v_award_loc
        from public.testing_ranks r
       where r.id = p_final_award_rank_id
         for key share;
      if not found then
        return jsonb_build_object('status', 'stale');
      end if;
      if v_award_loc <> p_location_code then
        return jsonb_build_object('status', 'invalid');
      end if;
    end if;

    -- 7. name already used in this school?
    if exists (select 1
                 from public.testing_classes c
                where c.location_code = p_location_code
                  and lower(c.name) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write at the end of the list (0 if the school has no classes)
    perform set_config('tkd.action', 'add_class', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    select coalesce(max(c.position) + 1, 0)
      into v_position
      from public.testing_classes c
     where c.location_code = p_location_code;

    insert into public.testing_classes (location_code, name, position, final_award_rank_id)
    values (p_location_code, v_name, v_position, p_final_award_rank_id)
    returning id, version into v_id, v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version, 'position', v_position);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('testing_classes_location_lower_name_idx', 'testing_ranks_class_lower_name_idx') then
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

revoke execute on function public.testing_add_class(text, text, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_add_class(text, text, uuid) to authenticated;

-- 8b. testing_update_class(p_class_id, p_expected_version, p_name, p_final_award_rank_id)
-- Renames a class and/or sets its final award (NULL = Not set; there is no
-- default, so the app always says what it wants). Saving unchanged values
-- writes nothing (no new version, no history row).
-- Ok: {"status":"ok","id":...,"version":<current version>}
create or replace function public.testing_update_class(
  p_class_id            uuid,
  p_expected_version    integer,
  p_name                text,
  p_final_award_rank_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name        text;   -- the cleaned-up name (set after the access checks)
  v_loc         text;
  v_version     integer;
  v_award_loc   text;
  v_award_class uuid;
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

    -- 3. input
    v_name := public.testing_normalize_name(p_name);
    if p_class_id is null
       or p_expected_version is null
       or not public.testing_name_is_valid(p_name) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. find the class's school, lock the school, then lock the class
    --    (looked up again after the school lock in case it went meanwhile)
    select c.location_code into v_loc
      from public.testing_classes c
     where c.id = p_class_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    select c.version into v_version
      from public.testing_classes c
     where c.id = p_class_id
       for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 5. someone else saved it since this screen loaded?
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 6. the chosen final award: gone -> stale; other school or one of
    --    this class's own ranks -> invalid
    if p_final_award_rank_id is not null then
      select r.location_code, r.class_id
        into v_award_loc, v_award_class
        from public.testing_ranks r
       where r.id = p_final_award_rank_id
         for key share;
      if not found then
        return jsonb_build_object('status', 'stale');
      end if;
      if v_award_loc <> v_loc or v_award_class = p_class_id then
        return jsonb_build_object('status', 'invalid');
      end if;
    end if;

    -- 7. another class in this school already has that name?
    if exists (select 1
                 from public.testing_classes c
                where c.location_code = v_loc
                  and c.id <> p_class_id
                  and lower(c.name) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write only if something really changes
    perform set_config('tkd.action', 'update_class', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_classes c
       set name                = v_name,
           final_award_rank_id = p_final_award_rank_id
     where c.id = p_class_id
       and (c.name is distinct from v_name
            or c.final_award_rank_id is distinct from p_final_award_rank_id)
    returning c.version into v_new_version;   -- no row updated -> NULL

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    -- nothing changed -> the version stays what it was
    return jsonb_build_object('status', 'ok', 'id', p_class_id,
                              'version', coalesce(v_new_version, v_version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('testing_classes_location_lower_name_idx', 'testing_ranks_class_lower_name_idx') then
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

revoke execute on function public.testing_update_class(uuid, integer, text, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_update_class(uuid, integer, text, uuid) to authenticated;

-- 8c. testing_reorder_classes(p_location_code, p_expected_ids, p_new_ids)
-- Puts a school's classes in a new order.
--   p_expected_ids = the order the screen showed (must match the database
--                    exactly, else stale)
--   p_new_ids      = the same ids in the new order
-- Only rows that really move are written; versions never change.
-- Ok: {"status":"ok"}
create or replace function public.testing_reorder_classes(
  p_location_code text,
  p_expected_ids  uuid[],
  p_new_ids       uuid[]
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

    -- 3. input: real school; two clean lists of the same ids
    --    (sorting both and comparing = "same ids, any order")
    if p_location_code is null
       or not exists (select 1 from public.locations l where l.code = p_location_code)
       or not public.testing_ids_are_valid(p_expected_ids)
       or not public.testing_ids_are_valid(p_new_ids)
       or cardinality(p_expected_ids) <> cardinality(p_new_ids)
       or array(select x.id from unnest(p_expected_ids) as x(id) order by x.id)
          <> array(select x.id from unnest(p_new_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. lock the school
    perform 1 from public.locations l where l.code = p_location_code for no key update;

    -- 5. the current order must be exactly what the screen showed
    if array(select c.id
               from public.testing_classes c
              where c.location_code = p_location_code
              order by c.position)
       <> p_expected_ids then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 8. renumber: "with ordinality" numbers the list 1, 2, 3 ...; position
    --    = number - 1. One statement, so the position rule is checked once
    --    at the end (section 3).
    perform set_config('tkd.action', 'reorder_classes', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_classes c
       set position = n.ord - 1
      from unnest(p_new_ids) with ordinality as n(id, ord)
     where c.id = n.id
       and c.location_code = p_location_code
       and c.position <> n.ord - 1;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('testing_classes_location_lower_name_idx', 'testing_ranks_class_lower_name_idx') then
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

revoke execute on function public.testing_reorder_classes(text, uuid[], uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.testing_reorder_classes(text, uuid[], uuid[]) to authenticated;

-- 8d. testing_delete_class(p_class_id, p_expected_version, p_expected_rank_ids,
--                          p_expected_lost_award_class_ids, p_only_if_empty)
-- Deletes a class and (automatically, "on delete cascade") all its ranks.
-- Other classes whose final award was one of those ranks become "Not set"
-- (automatically, "on delete set null"). Later classes move up by one.
-- The two lists are what the confirmation dialog said ("... and its 18
-- ranks? Group D's final award will become Not set."). If either is no
-- longer true (compared as sets), nothing is deleted: stale.
-- p_only_if_empty = true (used by Undo of "add class") refuses with
-- not_empty if the class has any ranks.
-- Ok: {"status":"ok","removed_rank_count":n,"classes_lost_award":[{"id","name"}...]}
create or replace function public.testing_delete_class(
  p_class_id                      uuid,
  p_expected_version              integer,
  p_expected_rank_ids             uuid[],
  p_expected_lost_award_class_ids uuid[],
  p_only_if_empty                 boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc        text;
  v_position   integer;
  v_version    integer;
  v_rank_ids   uuid[];
  v_lost_ids   uuid[];
  v_lost       jsonb;
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
    if p_class_id is null
       or p_expected_version is null
       or p_only_if_empty is null
       or not public.testing_ids_are_valid(p_expected_rank_ids)
       or not public.testing_ids_are_valid(p_expected_lost_award_class_ids) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. find the class, lock its school, then lock the class itself
    --    ("for update" because it is about to be deleted). Looked up again
    --    after the school lock in case it vanished meanwhile.
    select c.location_code into v_loc
      from public.testing_classes c
     where c.id = p_class_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    select c.position, c.version
      into v_position, v_version
      from public.testing_classes c
     where c.id = p_class_id
       for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 5a. changed since the dialog opened?
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 5b. "only if empty" (Undo of add class)
    if p_only_if_empty
       and exists (select 1 from public.testing_ranks r where r.class_id = p_class_id) then
      return jsonb_build_object('status', 'not_empty');
    end if;

    -- 5c. lock this class's ranks (they are about to go; locking them also
    --     stops another class choosing one as its final award meanwhile)
    --     and compare with what the dialog said, as sets.
    perform 1
       from public.testing_ranks r
      where r.class_id = p_class_id
      order by r.id
        for update;
    v_rank_ids := array(select r.id from public.testing_ranks r
                         where r.class_id = p_class_id order by r.id);
    if v_rank_ids
       <> array(select x.id from unnest(p_expected_rank_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 5d. which OTHER classes will lose their final award? Lock them (by
    --     id) and compare with the dialog's list, as sets.
    perform 1
       from public.testing_classes c
      where c.final_award_rank_id = any (v_rank_ids)
      order by c.id
        for no key update;
    v_lost_ids := array(select c.id from public.testing_classes c
                         where c.final_award_rank_id = any (v_rank_ids) order by c.id);
    if v_lost_ids
       <> array(select x.id from unnest(p_expected_lost_award_class_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'stale');
    end if;

    -- Report them in list order (names don't change below).
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.position), '[]'::jsonb)
      into v_lost
      from public.testing_classes c
     where c.id = any (v_lost_ids);

    -- 8. delete (ranks and lost awards follow automatically), then close
    --    the gap: every later class in the school moves up by one.
    perform set_config('tkd.action', 'delete_class', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.testing_classes c where c.id = p_class_id;

    update public.testing_classes c
       set position = c.position - 1
     where c.location_code = v_loc
       and c.position > v_position;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok',
                              'removed_rank_count', cardinality(v_rank_ids),
                              'classes_lost_award', v_lost);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('testing_classes_location_lower_name_idx', 'testing_ranks_class_lower_name_idx') then
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

revoke execute on function public.testing_delete_class(uuid, integer, uuid[], uuid[], boolean) from public, anon, authenticated, service_role;
grant  execute on function public.testing_delete_class(uuid, integer, uuid[], uuid[], boolean) to authenticated;

-- 8e. testing_add_rank(p_class_id, p_name, p_early_cents, p_day_cents,
--                      p_private_cents, p_sparring_gear)
-- Adds a rank at the END of a class. All three prices and the sparring
-- flag are required (copying them from the last rank is something the
-- app's dialog does as a starting value, not the database).
-- Ok: {"status":"ok","id":...,"version":1,"position":n}
create or replace function public.testing_add_rank(
  p_class_id      uuid,
  p_name          text,
  p_early_cents   integer,
  p_day_cents     integer,
  p_private_cents integer,
  p_sparring_gear boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name       text;   -- the cleaned-up name (set after the access checks)
  v_loc        text;
  v_id         uuid;
  v_version    integer;
  v_position   integer;
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
    v_name := public.testing_normalize_name(p_name);
    if p_class_id is null
       or not public.testing_name_is_valid(p_name)
       or not public.testing_cents_is_valid(p_early_cents)
       or not public.testing_cents_is_valid(p_day_cents)
       or not public.testing_cents_is_valid(p_private_cents)
       or p_sparring_gear is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. find the class's school, lock the school, then lock the class
    --    (so two adds can't take the same position); gone -> not_found
    select c.location_code into v_loc
      from public.testing_classes c
     where c.id = p_class_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    perform 1 from public.testing_classes c where c.id = p_class_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 7. name already used in this class?
    if exists (select 1
                 from public.testing_ranks r
                where r.class_id = p_class_id
                  and lower(r.name) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write at the end of the class (0 if it has no ranks)
    perform set_config('tkd.action', 'add_rank', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    select coalesce(max(r.position) + 1, 0)
      into v_position
      from public.testing_ranks r
     where r.class_id = p_class_id;

    insert into public.testing_ranks
      (class_id, location_code, name, position, early_cents, day_cents, private_cents, sparring_gear)
    values
      (p_class_id, v_loc, v_name, v_position, p_early_cents, p_day_cents, p_private_cents, p_sparring_gear)
    returning id, version into v_id, v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version, 'position', v_position);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('testing_classes_location_lower_name_idx', 'testing_ranks_class_lower_name_idx') then
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

revoke execute on function public.testing_add_rank(uuid, text, integer, integer, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.testing_add_rank(uuid, text, integer, integer, integer, boolean) to authenticated;

-- 8f. testing_update_rank(p_rank_id, p_expected_version, p_name, p_early_cents,
--                         p_day_cents, p_private_cents, p_sparring_gear)
-- Changes a rank's name, prices and sparring flag. Saving unchanged values
-- writes nothing. Ok: {"status":"ok","id":...,"version":<current version>}
create or replace function public.testing_update_rank(
  p_rank_id          uuid,
  p_expected_version integer,
  p_name             text,
  p_early_cents      integer,
  p_day_cents        integer,
  p_private_cents    integer,
  p_sparring_gear    boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name       text;   -- the cleaned-up name (set after the access checks)
  v_class_id    uuid;
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

    -- 3. input
    v_name := public.testing_normalize_name(p_name);
    if p_rank_id is null
       or p_expected_version is null
       or not public.testing_name_is_valid(p_name)
       or not public.testing_cents_is_valid(p_early_cents)
       or not public.testing_cents_is_valid(p_day_cents)
       or not public.testing_cents_is_valid(p_private_cents)
       or p_sparring_gear is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. which class and school is it in? Lock the school, then the class,
    --    then the rank.
    select r.class_id, r.location_code into v_class_id, v_loc
      from public.testing_ranks r
     where r.id = p_rank_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    perform 1 from public.testing_classes c where c.id = v_class_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    select r.version into v_version
      from public.testing_ranks r
     where r.id = p_rank_id
       for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 5. someone else saved it since this screen loaded?
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 7. another rank in this class already has that name?
    if exists (select 1
                 from public.testing_ranks r
                where r.class_id = v_class_id
                  and r.id <> p_rank_id
                  and lower(r.name) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write only if something really changes
    perform set_config('tkd.action', 'update_rank', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_ranks r
       set name          = v_name,
           early_cents   = p_early_cents,
           day_cents     = p_day_cents,
           private_cents = p_private_cents,
           sparring_gear = p_sparring_gear
     where r.id = p_rank_id
       and (r.name is distinct from v_name
            or r.early_cents is distinct from p_early_cents
            or r.day_cents is distinct from p_day_cents
            or r.private_cents is distinct from p_private_cents
            or r.sparring_gear is distinct from p_sparring_gear)
    returning r.version into v_new_version;   -- no row updated -> NULL

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    -- nothing changed -> the version stays what it was
    return jsonb_build_object('status', 'ok', 'id', p_rank_id,
                              'version', coalesce(v_new_version, v_version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('testing_classes_location_lower_name_idx', 'testing_ranks_class_lower_name_idx') then
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

revoke execute on function public.testing_update_rank(uuid, integer, text, integer, integer, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.testing_update_rank(uuid, integer, text, integer, integer, integer, boolean) to authenticated;

-- 8g. testing_reorder_ranks(p_class_id, p_expected_ids, p_new_ids)
-- Same as 8c, for the ranks of one class. A rank can never move to another
-- class this way (another class's ids are never "the same ids").
-- Ok: {"status":"ok"}
create or replace function public.testing_reorder_ranks(
  p_class_id     uuid,
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
  v_loc        text;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 3. input (see 8c)
    if p_class_id is null
       or not public.testing_ids_are_valid(p_expected_ids)
       or not public.testing_ids_are_valid(p_new_ids)
       or cardinality(p_expected_ids) <> cardinality(p_new_ids)
       or array(select x.id from unnest(p_expected_ids) as x(id) order by x.id)
          <> array(select x.id from unnest(p_new_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. find the class's school, lock the school, then lock the class;
    --    gone -> not_found
    select c.location_code into v_loc
      from public.testing_classes c
     where c.id = p_class_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    perform 1 from public.testing_classes c where c.id = p_class_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 5. the current order must be exactly what the screen showed
    if array(select r.id
               from public.testing_ranks r
              where r.class_id = p_class_id
              order by r.position)
       <> p_expected_ids then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 8. renumber (see 8c)
    perform set_config('tkd.action', 'reorder_ranks', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.testing_ranks r
       set position = n.ord - 1
      from unnest(p_new_ids) with ordinality as n(id, ord)
     where r.id = n.id
       and r.class_id = p_class_id
       and r.position <> n.ord - 1;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('testing_classes_location_lower_name_idx', 'testing_ranks_class_lower_name_idx') then
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

revoke execute on function public.testing_reorder_ranks(uuid, uuid[], uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.testing_reorder_ranks(uuid, uuid[], uuid[]) to authenticated;

-- 8h. testing_delete_rank(p_rank_id, p_expected_version, p_expected_class_version,
--                         p_expected_rank_ids, p_expected_lost_award_class_ids)
-- Deletes one rank; later ranks in the class move up by one. Classes whose
-- final award was this rank become "Not set" (automatically).
-- What the confirmation dialog said must still be true, else stale:
--   p_expected_version             - the rank's version
--   p_expected_class_version       - the class's version (the sentence may
--                                    name the class's final award)
--   p_expected_rank_ids            - the class's ranks IN THE ORDER SHOWN
--                                    ("Green will test for Blue" depends on
--                                    the neighbours), compared in order
--   p_expected_lost_award_class_ids - classes losing their award, as a set
-- Ok: {"status":"ok","classes_lost_award":[{"id","name"}...],
--      "class_final_award_now_on":<id of the rank that is now last> | null}
create or replace function public.testing_delete_rank(
  p_rank_id                       uuid,
  p_expected_version              integer,
  p_expected_class_version        integer,
  p_expected_rank_ids             uuid[],
  p_expected_lost_award_class_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_class_id      uuid;
  v_loc           text;
  v_class_version integer;
  v_version       integer;
  v_position      integer;
  v_lost_ids      uuid[];
  v_lost          jsonb;
  v_now_last      uuid;
  v_constraint    text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 3. input (array_position finds the rank in the list; NULL = not there)
    if p_rank_id is null
       or p_expected_version is null
       or p_expected_class_version is null
       or not public.testing_ids_are_valid(p_expected_rank_ids)
       or not public.testing_ids_are_valid(p_expected_lost_award_class_ids)
       or array_position(p_expected_rank_ids, p_rank_id) is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. which class and school is it in? Lock the school, then the class,
    --    then the rank ("for update": it is about to be deleted).
    select r.class_id, r.location_code into v_class_id, v_loc
      from public.testing_ranks r
     where r.id = p_rank_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    select c.version into v_class_version
      from public.testing_classes c
     where c.id = v_class_id
       for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    select r.version, r.position
      into v_version, v_position
      from public.testing_ranks r
     where r.id = p_rank_id
       for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 5a-5c. still what the dialog showed?
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_class_version <> p_expected_class_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if array(select r.id
               from public.testing_ranks r
              where r.class_id = v_class_id
              order by r.position)
       <> p_expected_rank_ids then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 5d. classes that will lose their final award: lock them (by id) and
    --     compare with the dialog's list, as sets.
    perform 1
       from public.testing_classes c
      where c.final_award_rank_id = p_rank_id
      order by c.id
        for no key update;
    v_lost_ids := array(select c.id from public.testing_classes c
                         where c.final_award_rank_id = p_rank_id order by c.id);
    if v_lost_ids
       <> array(select x.id from unnest(p_expected_lost_award_class_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'stale');
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.position), '[]'::jsonb)
      into v_lost
      from public.testing_classes c
     where c.id = any (v_lost_ids);

    -- 8. delete, then close the gap in the class
    perform set_config('tkd.action', 'delete_rank', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.testing_ranks r where r.id = p_rank_id;

    update public.testing_ranks r
       set position = r.position - 1
     where r.class_id = v_class_id
       and r.position > v_position;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    -- The rank that is now last in the class: its "testing for" is now the
    -- class's final award. NULL when the class is now empty.
    select r.id into v_now_last
      from public.testing_ranks r
     where r.class_id = v_class_id
     order by r.position desc
     limit 1;

    return jsonb_build_object('status', 'ok',
                              'classes_lost_award', v_lost,
                              'class_final_award_now_on', v_now_last);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('testing_classes_location_lower_name_idx', 'testing_ranks_class_lower_name_idx') then
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

revoke execute on function public.testing_delete_rank(uuid, integer, integer, uuid[], uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.testing_delete_rank(uuid, integer, integer, uuid[], uuid[]) to authenticated;


commit;

-- End of 0003_testing_classes_ranks.sql
