-- =====================================================================
-- 0001_staff_and_pin.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The first database "migration" for the TKD staff dashboard.
--   A migration is a SQL script that changes the database structure
--   (tables, functions, permissions). They are numbered so they can be
--   run in order as the project grows (0001, 0002, ...).
--
-- WHAT IT CREATES
--   1. public.staff         - one row per person who may use the dashboard
--   2. public.pin_attempts  - wrong-PIN counter, one row per SIGN-IN SESSION
--   3. an updated_at trigger on staff
--   4. security rules       - Row Level Security (RLS) + column grants so the
--                             browser can never read PIN data
--   5. functions:
--        public.is_admin()                              (used by security rules)
--        public.is_active_staff_with_fresh_password()   (used by EVERY data rule)
--        public.get_my_profile()                        (app calls this on load)
--        public.verify_pin(p_pin text)                  (lock screen calls this)
--        public.admin_set_staff_pin(uuid, text)         (admin-only, future screens)
--        + internal helpers the app cannot call:
--        public.last_password_sign_in_at(), public.password_signed_in_recently(),
--        public.current_session_id(), public.staff_set_updated_at()
--   6. a lock-down of Supabase's "default privileges" so FUTURE tables and
--      functions are private until a migration grants access on purpose.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   The editor sends the whole paste as one request, which Postgres runs as a
--   single transaction: if any statement fails, nothing is kept.
--   Safe to run again ("if not exists", "create or replace", "drop ... if
--   exists"). NOTE: "create table if not exists" will NOT change an existing
--   table's columns. Future changes go in a new file (0002_...).
--
-- KEY SECURITY IDEAS USED BELOW (read once, they repeat)
--   * "authenticated" = the database role for any signed-in browser user.
--     "anon" = the role for visitors who are NOT signed in.
--   * "security definer" = the function runs with the permissions of its
--     OWNER (the "postgres" role that runs this script), not the caller. That
--     lets a function read pin_hash even though the caller can't. Because
--     that is powerful, every such function:
--       - sets "search_path = ''" so it can't be tricked into using a
--         look-alike table/function someone created in another schema, and
--       - uses fully qualified names (public.staff, extensions.crypt, auth.uid()).
--   * Supabase lets anon/authenticated EXECUTE new functions by default. We
--     explicitly REVOKE that and only GRANT where the app really needs it.
--   * The login token (JWT) is signed by Supabase, so values read from it
--     (user id, session id, how/when you signed in) can't be faked by the
--     browser. auth.uid() and auth.jwt() read that token.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. pgcrypto extension
-- WHY: pgcrypto gives us crypt() + gen_salt(), which create bcrypt hashes.
-- A hash is a one-way scramble: we store the hash, never the PIN itself, and
-- check a typed PIN by hashing it again and comparing. On Supabase,
-- extensions live in the "extensions" schema (usually already installed;
-- this line then does nothing).
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- 1. The staff table
-- WHY: Supabase Auth (auth.users) only knows email + password. This table adds
-- what the dashboard needs: name, role (admin/staff), active flag, PIN hash.
-- id is the SAME id as the person's login in auth.users, so "the signed-in
-- user" and "their staff row" are linked. "on delete cascade" = if the login
-- is deleted in Supabase Auth, the staff row is deleted with it.
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  id         uuid        primary key
                         references auth.users (id) on delete cascade,
  full_name  text        not null,
  email      text        not null,              -- display copy of the login email
  role       text        not null default 'staff',
  active     boolean     not null default true, -- false = no dashboard access
  pin_hash   text        null,                  -- bcrypt hash of the 4-digit PIN; NEVER readable by the app
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Only these two roles exist (decided in the design guidelines v0.15).
  constraint staff_role_check check (role in ('admin', 'staff'))
);

-- Comments show up in the Supabase Table Editor as descriptions.
comment on table  public.staff          is 'Dashboard staff accounts. One row per login (id = auth.users.id).';
comment on column public.staff.email    is 'Display copy of the login email. The real login email lives in auth.users.';
comment on column public.staff.active   is 'false = this person cannot use the dashboard.';
comment on column public.staff.pin_hash is 'bcrypt hash of the 4-digit unlock PIN. Never selectable by app users.';


-- ---------------------------------------------------------------------
-- 2. The pin_attempts table (wrong-PIN counter PER SESSION)
-- WHY PER SESSION, NOT PER PERSON:
--   The rule is "5 wrong PINs -> PIN disabled for THAT SESSION, password
--   required". If the counter lived on the person's staff row, a correct PIN
--   on ANOTHER device (e.g. the office PC) would reset it, and someone at a
--   different, unattended tablet could keep guessing forever. So each sign-in
--   session gets its own counter.
--   A "session" = one sign-in on one device. Supabase puts its id in the
--   login token as the "session_id" claim. Signing in again with the
--   password creates a NEW session id, which naturally starts at 0 - that is
--   how a locked device gets unlocked (sign in with the password again).
--
-- No browser access at all: RLS on, no policies, no grants. Only the
-- security definer functions below (running as the owner) touch it.
-- Old rows are deleted automatically inside verify_pin (see below).
-- ---------------------------------------------------------------------
create table if not exists public.pin_attempts (
  session_id uuid        primary key,                 -- from the token's "session_id" claim
  staff_id   uuid        not null
                         references public.staff (id) on delete cascade,
  failed     integer     not null default 0,          -- wrong PINs in a row, this session
  locked_at  timestamptz null,                        -- set on the 5th wrong PIN; never cleared
  updated_at timestamptz not null default now(),      -- last attempt; used for cleanup

  constraint pin_attempts_failed_check check (failed >= 0)
);

-- Speeds up "delete this person's counters" (admin_set_staff_pin, cascade).
create index if not exists pin_attempts_staff_id_idx on public.pin_attempts (staff_id);

comment on table public.pin_attempts is
  'Wrong-PIN counter per sign-in session (JWT session_id). No client access. Rows older than 8 days are cleaned up by verify_pin.';


-- ---------------------------------------------------------------------
-- 3. updated_at trigger for staff
-- WHY: a trigger is code Postgres runs automatically on a table event. This
-- one stamps updated_at = now() on every UPDATE, so nobody has to remember.
-- (Trigger functions are never called by the app, so no EXECUTE grant.)
-- ---------------------------------------------------------------------
create or replace function public.staff_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();   -- "new" is the row as it will be saved
  return new;
end;
$$;

revoke execute on function public.staff_set_updated_at() from public, anon, authenticated;

drop trigger if exists staff_set_updated_at on public.staff;
create trigger staff_set_updated_at
  before update on public.staff
  for each row
  execute function public.staff_set_updated_at();


-- ---------------------------------------------------------------------
-- 4. Internal helpers that read the login token
-- None of these are callable by the app (execute revoked); the functions
-- further down run as the owner, so they can use them.
-- ---------------------------------------------------------------------

-- 4a. last_password_sign_in_at()
-- The token's "amr" claim (authentication methods reference) lists how this
-- session was signed in, e.g.:
--   [{"method": "password", "timestamp": 1760550000}]
-- timestamp = unix seconds (seconds since 1970-01-01 UTC). We take the newest
-- 'password' entry. A magic-link or password-recovery session has a different
-- method ("otp", "recovery", ...) and so returns NULL here - those sessions
-- never count as a password sign-in. NULL also in the SQL Editor (no token).
create or replace function public.last_password_sign_in_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(to_timestamp((e.value ->> 'timestamp')::double precision))
  from jsonb_array_elements(
         -- Only walk "amr" if it really is a list (jsonb_array_elements would
         -- error on anything else); otherwise use an empty list.
         case
           when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr'
           else '[]'::jsonb
         end
       ) as e(value)
  where e.value ->> 'method' = 'password'
    -- ignore malformed entries instead of crashing on the number conversion
    and jsonb_typeof(e.value -> 'timestamp') = 'number';
$$;

revoke execute on function public.last_password_sign_in_at() from public, anon, authenticated;

-- 4b. password_signed_in_recently()
-- THE one place the "password at least every 7 days" rule lives. true only if
-- this session came from a password sign-in within the last 7 days.
create or replace function public.password_signed_in_recently()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.last_password_sign_in_at() >= now() - interval '7 days', false);
$$;

revoke execute on function public.password_signed_in_recently() from public, anon, authenticated;

-- 4c. current_session_id()
-- This sign-in session's id from the token's "session_id" claim, or NULL if
-- it is missing or not a valid uuid (checked with a pattern first, so a bad
-- value returns NULL instead of crashing the cast).
create or replace function public.current_session_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when (auth.jwt() ->> 'session_id')
                ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (auth.jwt() ->> 'session_id')::uuid
         end;   -- no "else" = NULL
$$;

revoke execute on function public.current_session_id() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. is_admin()
-- WHY: the staff read rule says "admins can read every staff row". To know if
-- the caller is an admin we must read public.staff... but reading public.staff
-- from inside its own rule would trigger the rule again (infinite loop /
-- "recursion"). A security definer function reads the table as its owner,
-- which skips RLS, so no loop.
-- true only for an ACTIVE staff row with role 'admin' for the signed-in user.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable                -- same answer within one query; lets Postgres cache it
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff s
    where s.id = auth.uid()
      and s.role = 'admin'
      and s.active
  );
$$;

-- RLS rules run as the signed-in user, so "authenticated" must be able to
-- execute it. Visitors who are not signed in (anon) get nothing.
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;


-- ---------------------------------------------------------------------
-- 6. is_active_staff_with_fresh_password()
-- true only when BOTH:
--   * the signed-in user has an ACTIVE staff row, and
--   * this session came from a PASSWORD sign-in within the last 7 days.
--
-- !!! RULE FOR EVERY FUTURE TABLE !!!
--   Every RLS policy on every data table (students, attendance, billing, ...)
--   MUST include:   (select public.is_active_staff_with_fresh_password())
-- WHY: Supabase's email provider still accepts magic-link and password-
--   recovery requests through its API even though the app has no button for
--   them. Those create a valid "authenticated" session WITHOUT the password.
--   This check makes such sessions (and sessions older than 7 days, and
--   deactivated staff) unable to read or change any data.
-- ---------------------------------------------------------------------
create or replace function public.is_active_staff_with_fresh_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.password_signed_in_recently()
     and exists (
       select 1
       from public.staff s
       where s.id = auth.uid()
         and s.active
     );
$$;

revoke execute on function public.is_active_staff_with_fresh_password() from public, anon;
grant  execute on function public.is_active_staff_with_fresh_password() to authenticated;


-- ---------------------------------------------------------------------
-- 7. Row Level Security + column-level permissions
-- WHY (two layers):
--   * Column grants decide WHICH COLUMNS the app may read at all. pin_hash is
--     not granted, so "select pin_hash from staff" fails with
--     "permission denied" for app users.
--   * RLS decides WHICH ROWS the app may read.
--   No INSERT/UPDATE/DELETE for app users in this build: staff rows are
--   created by an admin in the Supabase dashboard / SQL Editor for now.
-- ---------------------------------------------------------------------
alter table public.staff        enable row level security;
alter table public.pin_attempts enable row level security;

-- Start from zero for browser roles (Supabase grants everything by default),
-- then add back only the safe staff columns. Revoking table-level privileges
-- also removes any old column-level ones, so re-running this stays clean.
revoke all on table public.staff        from anon, authenticated;
revoke all on table public.pin_attempts from anon, authenticated;   -- and no grants at all
grant select (id, full_name, email, role, active, created_at)
  on table public.staff to authenticated;

-- Staff read rule: must be active staff with a fresh password sign-in (see
-- section 6), AND then either your own row or, for admins, every row.
-- "(select ...)" around the function calls is a Supabase performance tip:
-- Postgres evaluates it once per query instead of once per row.
-- (The app itself reads its profile through get_my_profile(), which works
-- even when this rule says no, so it can show the right message.)
drop policy if exists staff_select_own_or_admin on public.staff;
create policy staff_select_own_or_admin
  on public.staff
  for select
  to authenticated
  using (
    (select public.is_active_staff_with_fresh_password())
    and (
      id = (select auth.uid())
      or (select public.is_admin())
    )
  );
-- pin_attempts: RLS on with NO policy = nobody (except the owner) sees a row.


-- ---------------------------------------------------------------------
-- 8. get_my_profile() - called by the app after sign-in / on load
-- WHY: the app needs name, role, active, PIN status and whether the password
-- sign-in is still fresh, but must never see pin_hash. This reads the row as
-- the owner and returns only safe facts.
--
-- Returns ONE row for the signed-in user, or ZERO rows if they have no staff
-- row. (supabase.rpc returns an array: use data[0] or .maybeSingle().)
--   has_pin        - a PIN has been set
--   pin_locked     - THIS session hit 5 wrong PINs (password sign-in required)
--   password_fresh - this session came from a password sign-in within 7 days
--                    (false for magic-link / recovery / stale sessions)
-- ---------------------------------------------------------------------
create or replace function public.get_my_profile()
returns table (
  id             uuid,
  full_name      text,
  email          text,
  role           text,
  active         boolean,
  has_pin        boolean,
  pin_locked     boolean,
  password_fresh boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.full_name,
    s.email,
    s.role,
    s.active,
    s.pin_hash is not null as has_pin,
    exists (
      select 1
      from public.pin_attempts a
      where a.session_id = public.current_session_id()
        and a.staff_id = s.id
        and a.locked_at is not null
    ) as pin_locked,
    public.password_signed_in_recently() as password_fresh
  from public.staff s
  where s.id = auth.uid();
$$;

revoke execute on function public.get_my_profile() from public, anon;
grant  execute on function public.get_my_profile() to authenticated;


-- ---------------------------------------------------------------------
-- 9. verify_pin(p_pin) - called by the Lock screen
-- Returns exactly one of these text values:
--   'ok'                 PIN correct; this session's wrong count reset to 0
--   'wrong:N'            PIN wrong; N = tries left in this session
--   'password_required'  no PIN set; this session is locked (5 wrong); the
--                        session has no valid session_id; no password
--                        sign-in within 7 days; or no active staff row
--   'invalid'            p_pin is not exactly 4 digits (NOT counted as a try)
-- Raises an error (not a return value) only for a dry-run / read-only
-- request - see step 2 inside.
--
-- WHY it returns values instead of raising errors on a wrong PIN:
--   an error would roll back (undo) the transaction, including the
--   "+1 wrong try" we just saved. Returning normally lets that save stick.
--
-- WHY "for update": it locks this session's counter row until the call
--   finishes. If 20 guesses arrive at the same moment, each waits its turn
--   and sees the updated count, so the 5-try limit can't be skipped.
-- ---------------------------------------------------------------------
create or replace function public.verify_pin(p_pin text)
returns text
language plpgsql
volatile              -- it changes data (the attempt counter)
security definer
set search_path = ''
as $$
declare
  c_max_attempts      constant integer  := 5;                 -- wrong tries per session
  c_cleanup_after     constant interval := interval '8 days'; -- older counter rows are deleted
  v_uid          uuid := auth.uid();   -- signed-in user's id, from the token
  v_session_id   uuid;                 -- this sign-in session, from the token
  v_hash         text;
  v_row_staff_id uuid;
  v_failed       integer;
  v_locked_at    timestamptz;
begin
  -- 1. Not signed in (no token / no user id): nothing to unlock.
  if v_uid is null then
    return 'password_required';
  end if;

  -- 2. Dry-run guard.
  --    WHY: the wrong-try counter only works if each guess is SAVED. Two ways
  --    a caller could make the database undo (roll back) the save afterwards
  --    while still seeing our answer:
  --      a) the API header "Prefer: tx=rollback" asks PostgREST (Supabase's
  --         API layer) to roll the whole request back at the end;
  --      b) a read-only transaction (e.g. calling the function with GET)
  --         can't save anything at all.
  --    Either way the counter would never go up -> unlimited guesses. So we
  --    refuse loudly. The real app never sends either. (Any "tx=" value is
  --    refused; the app has no reason to send one.)
  if coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'prefer', '')
       ~* 'tx\s*=' then
    raise exception 'verify_pin refuses requests with a Prefer: tx= header.'
      using errcode = 'insufficient_privilege';
  end if;
  if current_setting('transaction_read_only') = 'on' then
    raise exception 'verify_pin cannot run in a read-only transaction.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 3. Input check: exactly 4 digits, nothing else. "is null" is checked
  --    separately because "null !~ ..." gives null, not true.
  --    Not counted as a wrong try.
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return 'invalid';
  end if;

  -- 4. Which session is this? No valid session id = can't keep a counter.
  v_session_id := public.current_session_id();
  if v_session_id is null then
    return 'password_required';
  end if;

  -- 5. Active staff + password sign-in within 7 days (magic-link / recovery
  --    sessions fail this too).
  if not public.is_active_staff_with_fresh_password() then
    return 'password_required';
  end if;

  -- 6. No PIN set yet -> the lock screen falls back to the password.
  select s.pin_hash into v_hash
    from public.staff s
   where s.id = v_uid;
  if v_hash is null then
    return 'password_required';
  end if;

  -- 7. Housekeeping: delete counter rows nobody can use any more. A session
  --    whose password sign-in is over 7 days old is already refused in step
  --    5, so rows not touched for 8+ days are safe to remove. Doing it here
  --    means no scheduled job is needed.
  delete from public.pin_attempts a
   where a.updated_at < now() - c_cleanup_after;

  -- 8. Get (or create) THIS session's counter row and LOCK it.
  --    "on conflict do nothing" = create it only if it doesn't exist yet.
  insert into public.pin_attempts (session_id, staff_id)
  values (v_session_id, v_uid)
  on conflict (session_id) do nothing;

  select a.staff_id, a.failed, a.locked_at
    into v_row_staff_id, v_failed, v_locked_at
    from public.pin_attempts a
   where a.session_id = v_session_id
     for update;

  -- Should never happen (session ids are unique per user), but refuse if the
  -- row is missing or belongs to someone else.
  if not found or v_row_staff_id <> v_uid then
    return 'password_required';
  end if;

  -- 9. This session already hit the limit -> password required. The lock is
  --    never cleared; signing in with the password creates a new session.
  if v_locked_at is not null then
    return 'password_required';
  end if;

  -- 10. Check the PIN. crypt(typed PIN, stored hash) re-hashes the typed PIN
  --     with the salt saved inside the stored hash; equal = correct PIN.
  if extensions.crypt(p_pin, v_hash) = v_hash then
    update public.pin_attempts
       set failed = 0,
           updated_at = now()
     where session_id = v_session_id;
    return 'ok';
  end if;

  -- 11. Wrong PIN: count it (for this session only).
  v_failed := v_failed + 1;

  if v_failed >= c_max_attempts then
    -- 5th wrong try in a row: lock this session's PIN for good.
    update public.pin_attempts
       set failed = v_failed,
           locked_at = now(),
           updated_at = now()
     where session_id = v_session_id;

    -- Best effort: also end this session on the Supabase Auth side, so its
    -- refresh token stops working and the device is really signed out.
    -- WHY the begin/exception wrapper: Supabase may not allow this database
    -- role to delete from auth.sessions (or may rename that table one day).
    -- If that fails we must NOT error, because an error would roll back the
    -- lock we just saved. The lock above is the real protection; this is a
    -- bonus. "when others" catches any error from this one statement only.
    begin
      delete from auth.sessions where id = v_session_id;
    exception
      when others then
        null;   -- ignore: the PIN lock is already saved
    end;

    return 'password_required';
  end if;

  update public.pin_attempts
     set failed = v_failed,
         updated_at = now()
   where session_id = v_session_id;

  -- e.g. 2nd wrong try -> 'wrong:3'
  return 'wrong:' || (c_max_attempts - v_failed)::text;
end;
$$;

-- Postgres identifies a function by its name AND argument types, so grants
-- must say verify_pin(text).
revoke execute on function public.verify_pin(text) from public, anon;
grant  execute on function public.verify_pin(text) to authenticated;


-- ---------------------------------------------------------------------
-- 10. admin_set_staff_pin(p_staff_id, p_pin) - admin-only
-- WHY: until the "Set PIN" screen exists, admins need a way to give someone a
-- PIN; that future screen (and Staff accounts) will call this function.
--   * Caller must be an active admin with a fresh password sign-in.
--   * PIN must be exactly 4 digits.
--   * Stores only the bcrypt hash and deletes that person's per-session
--     counters (clears any PIN lock).
-- In the Supabase SQL Editor you are NOT signed in as a staff member, so
-- auth.uid() is empty and this function refuses you. That is on purpose;
-- SETUP.md gives a separate plain SQL snippet for the editor instead.
-- Granted to "authenticated" because only signed-in callers can ever be
-- admins; everyone else is rejected inside the function.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_staff_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() or not public.is_active_staff_with_fresh_password() then
    raise exception 'Only an active admin with a recent password sign-in can set a staff PIN.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- gen_salt('bf', 10) = new random salt for bcrypt ("bf" = Blowfish, the
  -- cipher bcrypt is based on). 10 = work factor: higher = slower to guess.
  update public.staff
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10))
   where id = p_staff_id;

  if not found then
    raise exception 'No staff row with id %.', p_staff_id
      using errcode = 'no_data_found';
  end if;

  -- New PIN = clean slate on every device.
  delete from public.pin_attempts where staff_id = p_staff_id;
end;
$$;

revoke execute on function public.admin_set_staff_pin(uuid, text) from public, anon;
grant  execute on function public.admin_set_staff_pin(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 11. Lock down default privileges for FUTURE objects
-- WHY: out of the box Supabase automatically grants the browser roles (anon,
-- authenticated) full access to every NEW table, sequence and function
-- created in the public schema. One forgotten REVOKE in a future migration
-- would expose data. After this block, new objects start PRIVATE, and every
-- future migration must GRANT exactly what the app needs (and add RLS
-- policies that use is_active_staff_with_fresh_password()).
-- Objects created above already have their explicit grants, so this does not
-- change them, and re-running this file is harmless.
-- ---------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all     on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all     on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Postgres quirk: the line above can only undo grants that were made "per
-- schema". The built-in rule that EVERY new function is executable by
-- PUBLIC (= every role, including anon) is global, so it must be revoked
-- globally too, or new functions would still be callable by anyone.
-- Side effect: functions that "postgres" creates in ANY schema start private
-- (including ones from extensions installed later). If something later says
-- "permission denied for function ...", grant execute on that function to
-- the role that needs it.
alter default privileges for role postgres revoke execute on functions from public;

-- End of 0001_staff_and_pin.sql
