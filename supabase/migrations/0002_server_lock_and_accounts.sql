-- =====================================================================
-- 0002_server_lock_and_accounts.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The second database migration for the TKD staff dashboard. It runs
--   after 0001_staff_and_pin.sql (already applied) and changes nothing
--   that 0001 made except where noted ("replaces").
--
-- WHY IT EXISTS (guidelines 10b, "hard gate before the first data section")
--   Until now the lock screen was only a browser screen. Someone with the
--   browser's developer tools could skip it and still talk to the database
--   with the signed-in person's login. This migration makes the database
--   itself keep track of whether each sign-in session is locked or unlocked,
--   so future data rules can refuse a locked session. It also adds the
--   database side of the new account screens (Set PIN / Change PIN) and the
--   per-account idle time.
--
-- WHAT IT ADDS OR CHANGES
--   1. public.staff gets two new columns:
--        idle_lock_minutes  - minutes of no use before this account locks (default 45)
--        is_shared          - true for the shared front-desk account
--      and the front-desk row is set to 120 minutes + shared.
--   2. public.session_unlock - "is this sign-in session unlocked, and until when?"
--   3. functions the app calls:
--        public.touch_session()        on load / sign-in / every few minutes while in use
--        public.lock_session()         idle lock and "Lock now"
--        public.has_data_access()      the shared check every FUTURE data rule will use
--        public.set_my_pin(p_pin)      Set your PIN / Change PIN screens
--      replaced from 0001 (same names, extra rules):
--        public.verify_pin(p_pin)      a correct PIN now also unlocks the session on the server
--        public.admin_set_staff_pin()  refuses your own PIN, needs an unlocked session, refuses weak PINs
--        public.is_admin()             now also needs a password sign-in within 7 days
--        public.get_my_profile()       also returns idle_lock_minutes and is_shared
--      internal helpers the app cannot call:
--        public.pin_is_too_easy(), public.session_is_pin_locked(),
--        public.session_exists(), public.mark_session_unlocked(),
--        public.cleanup_session_unlock(), public.clear_pin_attempts_for()
--   4. replaced from 0001: the staff read rule (policy
--      staff_select_own_or_admin). Admins see every staff row only while
--      their session is unlocked (has_data_access); otherwise just their own.
--
-- WHY IT IS ALSO SPLIT INTO TWO FILES (supabase/manual/)
--   Claude's Supabase connection refuses any SQL that contains the word
--   DELETE anywhere (even in a comment) - a safety feature. So:
--     * manual/0002a_connector_part.sql  - every section below WITHOUT that
--       word; applied through the connection. Run it FIRST.
--     * manual/0002b_functions_with_delete_RUN_IN_SQL_EDITOR.sql - the few
--       sections that contain it (copied word for word); Jeffrey pastes it
--       into the Supabase SQL Editor SECOND.
--   Running 0002a then 0002b gives exactly the same database as running
--   this whole file. This file stays the complete, official version.
--   To keep 0002b small, every DELETE lives in a tiny helper function
--   (sections 7 and 8) that the bigger functions call - except verify_pin,
--   which already contained DELETEs in 0001 and is kept in one piece so the
--   existing lock screen keeps working until 0002b is run.
--
-- HOW TO RUN IT (whole file, e.g. on a fresh project)
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. It runs as one transaction: if any statement fails, nothing is
--   kept. Safe to run again ("add column if not exists", "create or
--   replace", "drop ... if exists").
--
-- WORDS USED BELOW
--   * "session" = one sign-in on one device. Its id is the "session_id"
--     claim in the login token (see 0001, section 2). Signing in again with
--     the password creates a NEW session id.
--   * "locked" here means the SERVER's record says this session is locked.
--     The browser shows its lock screen for the same reason, but the
--     browser alone can no longer decide that a session is unlocked.
--   * Every security definer function follows the 0001 rules: search_path
--     = '', fully qualified names, execute revoked from everyone and granted
--     back only where the app calls it. (See 0001's header for why.)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. New columns on public.staff
-- WHY:
--   idle_lock_minutes - idle time is per account (guidelines 5, v0.27). The
--     front desk is always staffed, so it gets 2 hours; everyone else 45
--     minutes. The check keeps it between 5 minutes and 8 hours.
--   is_shared - the shared front-desk login. Its menu hides Change PIN and
--     Change password, and the database refuses to let it change its own
--     PIN once one is set (only an admin changes it).
-- "add column if not exists" makes re-running this file harmless: if the
-- column is already there, the whole line (including its check) is skipped.
-- "not null default ..." fills the new column in for rows that already exist.
-- ---------------------------------------------------------------------
alter table public.staff
  add column if not exists idle_lock_minutes integer not null default 45
    constraint staff_idle_lock_minutes_check check (idle_lock_minutes between 5 and 480);

alter table public.staff
  add column if not exists is_shared boolean not null default false;

comment on column public.staff.idle_lock_minutes is
  'Minutes without use before this account''s sessions lock. 5 to 480. Default 45; the front desk uses 120.';
comment on column public.staff.is_shared is
  'true = shared login (the front desk). Cannot change its own PIN once set, or its own password, from the app.';


-- ---------------------------------------------------------------------
-- 1. Data step: mark the front-desk account
-- WHY: the shared desk login (guidelines 5, v0.27) gets a 2-hour idle time
-- and the "shared" flag. Matched by email because that is what we know for
-- sure; lower() ignores capital letters. If the row doesn't exist yet this
-- changes nothing (and re-running it changes nothing new).
-- Note: re-running this file sets the desk back to 120 minutes.
-- ---------------------------------------------------------------------
update public.staff
   set idle_lock_minutes = 120,
       is_shared         = true
 where lower(email) = 'shrewsburyustc@gmail.com';


-- ---------------------------------------------------------------------
-- 2. The session_unlock table (server-side lock, one row per SESSION)
-- WHY: the server's own record of "this sign-in session is unlocked until
-- <time>". unlocked_until in the past = locked.
--   * touch_session() pushes the time forward while the person is using
--     the dashboard, but only if it hasn't already passed - once a session
--     is locked, only a correct PIN (verify_pin) or a new PIN (set_my_pin)
--     opens it again.
--   * lock_session() sets it to "now" (idle lock / Lock now).
--   * has_data_access() refuses any session whose time has passed.
-- Per session, not per person, for the same reason as pin_attempts (0001,
-- section 2): unlocking the office PC must not unlock a tablet.
--
-- No browser access at all: RLS on, no policies, no grants. Only the
-- security definer functions below touch it.
-- The link to public.staff (so a removed staff row takes its rows with it)
-- is added in section 3, which is in the SQL Editor part of the split.
-- ---------------------------------------------------------------------
create table if not exists public.session_unlock (
  session_id     uuid        primary key,            -- from the token's "session_id" claim
  staff_id       uuid        not null,               -- whose session (link added in section 3)
  unlocked_until timestamptz not null,               -- in the past = locked
  updated_at     timestamptz not null default now()  -- last change; used for cleanup
);

-- Speeds up the link to staff (section 3) and "this person's sessions".
create index if not exists session_unlock_staff_id_idx on public.session_unlock (staff_id);

alter table public.session_unlock enable row level security;
revoke all on table public.session_unlock from anon, authenticated;   -- and no grants at all

comment on table public.session_unlock is
  'Server-side lock per sign-in session (JWT session_id). unlocked_until in the past = locked. No client access. Rows untouched for 8+ days are cleaned up by touch_session.';


-- ---------------------------------------------------------------------
-- 3. Link session_unlock.staff_id to public.staff
-- WHY: a foreign key ("references") means a session_unlock row can only
-- point at a real staff row, and "on delete cascade" means that if a staff
-- row is ever removed, its session rows are removed with it.
-- It lives in its own section because the connector refuses the word in
-- "on delete cascade"; dropping and re-adding it keeps re-runs harmless.
-- ---------------------------------------------------------------------
alter table public.session_unlock
  drop constraint if exists session_unlock_staff_id_fkey;
alter table public.session_unlock
  add constraint session_unlock_staff_id_fkey
  foreign key (staff_id) references public.staff (id) on delete cascade;


-- ---------------------------------------------------------------------
-- 4. pin_is_too_easy(p_pin) - internal helper
-- WHY: guidelines 10b (v0.28) refuse PINs that are all the same digit
-- (1111) or a straight run up or down (0123 ... 6789, 9876 ... 3210).
-- The app checks the same rule before sending, but the database is the
-- one that can't be skipped.
-- How it works:
--   * '^([0-9])\1{3}$' = one digit, then that same digit 3 more times.
--     (\1 means "the same thing the first brackets matched".)
--   * strpos(long, short) > 0 = "short appears inside long". Every straight
--     run of 4 appears inside '0123456789' or '9876543210', and nothing
--     else does.
-- Expects exactly 4 digits (callers check that first).
-- immutable = same input always gives the same answer.
-- ---------------------------------------------------------------------
create or replace function public.pin_is_too_easy(p_pin text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_pin ~ '^([0-9])\1{3}$'
      or strpos('0123456789', p_pin) > 0
      or strpos('9876543210', p_pin) > 0;
$$;

revoke execute on function public.pin_is_too_easy(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. session_is_pin_locked(p_session_id) - internal helper
-- true if this session hit 5 wrong PINs (pin_attempts.locked_at is set).
-- Such a session needs a fresh password sign-in; nothing else reopens it.
-- ---------------------------------------------------------------------
create or replace function public.session_is_pin_locked(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pin_attempts a
    where a.session_id = p_session_id
      and a.locked_at is not null
  );
$$;

revoke execute on function public.session_is_pin_locked(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5b. session_exists() - internal helper
-- true only if THIS sign-in session (the token's session_id) still exists
-- in Supabase Auth (auth.sessions) for the signed-in user.
-- WHY: when someone signs out, or an admin signs a device out, Supabase
-- removes the session from auth.sessions - but the login token the browser
-- already holds keeps working until it expires (up to an hour). Checking
-- auth.sessions means a signed-out device is refused straight away instead
-- of at that expiry. Used by has_data_access, touch_session, verify_pin and
-- set_my_pin, so the check lives in one place.
-- WHY the begin/exception around auth.sessions: auth.sessions belongs to
-- Supabase Auth, not to us. If Supabase ever stops letting our functions
-- read it (or renames it), this answers false (the session counts as signed
-- out) instead of breaking every page with an error. Failing "closed" is
-- the safe way.
-- ---------------------------------------------------------------------
create or replace function public.session_exists()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();                  -- signed-in user's id, from the token
  v_session_id uuid := public.current_session_id(); -- this sign-in session, from the token
  v_exists     boolean;
begin
  if v_uid is null or v_session_id is null then
    return false;
  end if;

  begin
    select exists (
      select 1
      from auth.sessions s
      where s.id = v_session_id
        and s.user_id = v_uid
    ) into v_exists;
  exception
    when others then
      v_exists := false;   -- can't read it -> treat as "signed out"
  end;

  return coalesce(v_exists, false);
end;
$$;

revoke execute on function public.session_exists() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. mark_session_unlocked(p_session_id, p_staff_id) - internal helper
-- WHY: after a correct PIN (verify_pin) or a new PIN (set_my_pin), this
-- session is unlocked on the server for that person's idle time:
-- unlocked_until = now + idle_lock_minutes.
-- "insert ... on conflict ... do update" = create the row, or update it if
-- this session already has one (an "upsert"). The "where" on the update
-- makes sure a row can never be switched to a different person.
-- make_interval(mins => 45) turns a number of minutes into a time span.
-- ---------------------------------------------------------------------
create or replace function public.mark_session_unlocked(p_session_id uuid, p_staff_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.session_unlock (session_id, staff_id, unlocked_until, updated_at)
  select p_session_id, s.id, now() + make_interval(mins => s.idle_lock_minutes), now()
    from public.staff s
   where s.id = p_staff_id
  on conflict (session_id) do update
     set unlocked_until = excluded.unlocked_until,
         updated_at     = now()
   where public.session_unlock.staff_id = excluded.staff_id;
end;
$$;

revoke execute on function public.mark_session_unlocked(uuid, uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. cleanup_session_unlock() - internal helper (housekeeping)
-- WHY: rows nobody can use any more pile up otherwise. A row is written when
-- a session is used, and a session only counts for 7 days after its
-- password sign-in, so a row not touched for 8+ days belongs to a session
-- that is refused anyway. touch_session() calls this, so no scheduled job
-- is needed. Kept in its own small function so the DELETE lives in as few
-- places as possible (see the header: it goes in the SQL Editor part).
-- ---------------------------------------------------------------------
create or replace function public.cleanup_session_unlock()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.session_unlock u
   where u.updated_at < now() - interval '8 days';
$$;

revoke execute on function public.cleanup_session_unlock() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. clear_pin_attempts_for(p_staff_id, p_keep_locked) - internal helper
-- WHY: when an admin gives someone a new PIN, that person's old wrong-PIN
-- counts are meaningless, so they are removed.
--   p_keep_locked = true  -> remove the counts but leave any session that
--     hit 5 wrong PINs LOCKED. That is what admin_set_staff_pin uses: a
--     locked device (maybe lost or stolen) must need the password again; a
--     new PIN shouldn't hand it 5 more guesses.
--   p_keep_locked = false -> also lift PIN locks. Nothing in 0002 uses it;
--     it is kept for a future "unlock this device" admin tool.
-- (set_my_pin does NOT use this: changing your own PIN leaves the counts on
-- your other devices alone - see section 13.)
-- ---------------------------------------------------------------------
create or replace function public.clear_pin_attempts_for(p_staff_id uuid, p_keep_locked boolean)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.pin_attempts a
   where a.staff_id = p_staff_id
     and (not p_keep_locked or a.locked_at is null);
$$;

revoke execute on function public.clear_pin_attempts_for(uuid, boolean) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 9. touch_session() - called by the app on load / after sign-in, and at
--    most every few minutes while the person is actively using it
-- Returns exactly one of:
--   'unlocked'           this session is unlocked; its time was pushed
--                        forward to now + idle_lock_minutes
--   'locked'             this session is locked -> show the Lock screen.
--                        touch_session NEVER reopens a locked session.
--   'password_required'  not signed in; no valid session id; no active
--                        staff row; no password sign-in within 7 days; this
--                        session was signed out (gone from auth.sessions);
--                        or this session hit 5 wrong PINs -> sign out
--
-- The first call for a brand-new session creates its row with
--   unlocked_until = (time of the password sign-in) + idle_lock_minutes
-- so a fresh password sign-in starts unlocked, but a session that sat
-- unused for longer than its idle time (e.g. a tab reopened the next
-- morning) starts LOCKED and needs the PIN.
-- ---------------------------------------------------------------------
create or replace function public.touch_session()
returns text
language plpgsql
volatile              -- it changes data (the unlock time)
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();                  -- signed-in user's id, from the token
  v_session_id   uuid := public.current_session_id(); -- this sign-in session, from the token
  v_idle         interval;                            -- this person's idle time
  v_row_staff_id uuid;
  v_until        timestamptz;
begin
  -- 1. Must be signed in, with a valid session id.
  if v_uid is null or v_session_id is null then
    return 'password_required';
  end if;

  -- 2. Active staff + password sign-in within 7 days (magic-link /
  --    recovery sessions fail this too).
  if not public.is_active_staff_with_fresh_password() then
    return 'password_required';
  end if;

  -- ...and the session still exists in Supabase Auth (not signed out on
  --    this device or from somewhere else) - section 5b.
  if not public.session_exists() then
    return 'password_required';
  end if;

  -- 3. This session hit 5 wrong PINs -> only the password helps now.
  if public.session_is_pin_locked(v_session_id) then
    return 'password_required';
  end if;

  -- 4. Housekeeping: clear out rows untouched for 8+ days (section 7).
  perform public.cleanup_session_unlock();

  -- 5. This person's idle time as a time span (e.g. 45 minutes).
  select make_interval(mins => s.idle_lock_minutes)
    into v_idle
    from public.staff s
   where s.id = v_uid;

  -- 6. First call for this session: create its row, counting the idle
  --    time from the password sign-in. "on conflict do nothing" = only if
  --    it doesn't exist yet. FOUND is true only if a row was created.
  insert into public.session_unlock (session_id, staff_id, unlocked_until)
  values (v_session_id, v_uid, public.last_password_sign_in_at() + v_idle)
  on conflict (session_id) do nothing
  returning unlocked_until into v_until;

  if found then
    if v_until > now() then
      return 'unlocked';
    end if;
    return 'locked';
  end if;

  -- 7. The row already exists: read it and LOCK it ("for update") so two
  --    calls at the same moment take turns.
  select u.staff_id, u.unlocked_until
    into v_row_staff_id, v_until
    from public.session_unlock u
   where u.session_id = v_session_id
     for update;

  -- Should never happen (session ids belong to one user), but refuse if
  -- the row belongs to someone else.
  if v_row_staff_id is distinct from v_uid then
    return 'password_required';
  end if;

  -- 8. Still unlocked -> the person is active, so push the time forward.
  if v_until > now() then
    update public.session_unlock
       set unlocked_until = now() + v_idle,
           updated_at     = now()
     where session_id = v_session_id;
    return 'unlocked';
  end if;

  -- 9. The time has passed: locked. Deliberately NOT pushed forward - a
  --    locked session only reopens with the PIN.
  return 'locked';
end;
$$;

revoke execute on function public.touch_session() from public, anon;
grant  execute on function public.touch_session() to authenticated;


-- ---------------------------------------------------------------------
-- 10. lock_session() - called by the app on idle lock and "Lock now"
-- WHY: the browser shows the Lock screen right away; this makes the server
-- agree, so the session gets no data until the PIN is entered. Sets
-- unlocked_until = now (creates the row if this session has none yet).
-- Does nothing if there is no user, no valid session id, or no staff row
-- (there is nothing to lock). Never unlocks anything.
-- ---------------------------------------------------------------------
create or replace function public.lock_session()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_session_id uuid := public.current_session_id();
begin
  if v_uid is null or v_session_id is null then
    return;
  end if;

  -- Selecting from public.staff means no row is written for someone
  -- without a staff row. The "where" on the update stops a row ever being
  -- switched to a different person.
  insert into public.session_unlock (session_id, staff_id, unlocked_until, updated_at)
  select v_session_id, s.id, now(), now()
    from public.staff s
   where s.id = v_uid
  on conflict (session_id) do update
     set unlocked_until = now(),
         updated_at     = now()
   where public.session_unlock.staff_id = excluded.staff_id;
end;
$$;

revoke execute on function public.lock_session() from public, anon;
grant  execute on function public.lock_session() to authenticated;


-- ---------------------------------------------------------------------
-- 11. has_data_access() - THE check for every future data table
-- true only when ALL of these are true:
--   a. active staff with a password sign-in within 7 days (0001's check -
--      this also shuts out magic-link / recovery sessions)
--   b. this session still exists in Supabase Auth (auth.sessions) for this
--      user - a session that was signed out or ended elsewhere is refused
--      (section 5b; if auth.sessions can't be read, the answer is false)
--   c. this session did not hit 5 wrong PINs
--   d. the server says this session is unlocked right now
--      (session_unlock.unlocked_until is still in the future)
--
-- !!! RULE FOR EVERY FUTURE DATA TABLE (students, attendance, billing...) !!!
--   Its RLS policies MUST include:   (select public.has_data_access())
--   (This includes 0001's is_active_staff_with_fresh_password() check, so
--   one call covers both.)
--   is_admin() is NEVER a data gate on its own: wherever a rule gives
--   admins more, write  ((select public.is_admin()) and (select public.has_data_access()))
--   (see section 17).
--
-- stable = same answer within one query, so Postgres can run it once per
-- query instead of once per row.
-- ---------------------------------------------------------------------
create or replace function public.has_data_access()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_session_id uuid := public.current_session_id();
begin
  -- a. active staff + fresh password sign-in
  if v_uid is null or v_session_id is null
     or not public.is_active_staff_with_fresh_password() then
    return false;
  end if;

  -- b. the session is still alive in Supabase Auth (section 5b)
  if not public.session_exists() then
    return false;
  end if;

  -- c. not PIN-locked
  if public.session_is_pin_locked(v_session_id) then
    return false;
  end if;

  -- d. unlocked on the server right now
  return exists (
    select 1
    from public.session_unlock u
    where u.session_id = v_session_id
      and u.staff_id = v_uid
      and u.unlocked_until > now()
  );
end;
$$;

revoke execute on function public.has_data_access() from public, anon;
grant  execute on function public.has_data_access() to authenticated;


-- ---------------------------------------------------------------------
-- 12. verify_pin(p_pin) - REPLACES 0001's version
-- Everything from 0001 is kept exactly (same checks, same return values:
-- 'ok', 'wrong:N', 'password_required', 'invalid'; same dry-run guard; same
-- cleanup; same 5-try lock). Two additions:
--   * step 5: a session that was signed out (gone from auth.sessions,
--     section 5b) gets 'password_required' BEFORE anything is counted.
--   * step 10: a correct PIN now also marks THIS session unlocked on the
--     server for the person's idle time, which is what lets the Lock
--     screen really unlock.
--
-- Returns exactly one of these text values:
--   'ok'                 PIN correct; this session's wrong count reset to 0
--                        and the session is unlocked on the server
--   'wrong:N'            PIN wrong; N = tries left in this session
--   'password_required'  no PIN set; this session is locked (5 wrong); the
--                        session has no valid session_id; no password
--                        sign-in within 7 days; no active staff row; or the
--                        session was signed out
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
--
-- This section contains DELETE lines (old counters, and ending the session
-- after 5 wrong PINs), so it is in the SQL Editor part of the split. It is
-- kept in one piece so the lock screen keeps working with 0001's version
-- until that part is run.
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

  --    NEW in 0002: the session must still exist in Supabase Auth (section
  --    5b). A signed-out device gets no PIN tries at all (nothing is counted).
  if not public.session_exists() then
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

    -- NEW in 0002: unlock this session on the server too (section 6), for
    -- this person's idle time.
    perform public.mark_session_unlocked(v_session_id, v_uid);

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
-- 13. set_my_pin(p_pin) - Set your PIN / Change PIN screens
-- Returns exactly one of:
--   'ok'                 PIN saved; this session unlocked on the server
--   'invalid'            not exactly 4 digits
--   'too_easy'           all the same digit or a straight run (section 4)
--   'password_required'  not signed in; no valid session id; not active
--                        staff; the session was signed out (gone from
--                        auth.sessions); the password sign-in was NOT within
--                        the last 10 minutes; this session hit 5 wrong PINs;
--                        or this session is locked on the server
--   'not_allowed'        shared account (front desk) that already has a PIN
--
-- WHY "password within the last 10 minutes": Set your PIN appears right
--   after a password sign-in, and Change PIN asks for the password again
--   first (which counts as a new sign-in). So a real user always has a
--   very recent password sign-in here; someone who sits down at an
--   unattended, already-signed-in screen later does not.
-- WHY "not locked on the server": otherwise someone at a device that was
--   locked (e.g. "Lock now") within those 10 minutes could pick a new PIN
--   through the browser's developer tools and walk straight past the Lock
--   screen. A session with no server row yet counts as locked when its
--   idle time since the password sign-in has passed (same rule as
--   touch_session, step 6).
-- WHY the front desk can't change its PIN: it's a shared login, so anyone
--   at the desk could. It sets its PIN once, at its first sign-in; after
--   that only an admin changes it (guidelines 10b, v0.28).
-- WHY it leaves your OTHER devices' wrong-PIN counts alone: otherwise
--   someone guessing at one of your devices (say 4 wrong tries on a tablet)
--   could get a fresh 5 tries every time you change your PIN somewhere
--   else. Only THIS session's count is reset (it is unlocked anyway), and
--   a device that hit 5 wrong PINs stays locked until a password sign-in.
--
-- KNOWN LIMITATIONS (accepted on purpose - see SETUP.md, "Known limitations"):
--   L4. For 10 minutes after a password sign-in, anyone using that UNLOCKED
--       session (e.g. a borrowed, signed-in device) can set a new PIN for
--       its owner. The 10-minute window is what lets Set PIN / Change PIN
--       work without asking for the password twice; the session also has
--       to be unlocked, so a locked screen can't be used for this.
--   L7. The app hides Change password for the shared front-desk account,
--       but that is only the menu. Anyone who knows the desk password can
--       still change it by calling Supabase Auth's API directly (the
--       database can't block that). Mitigation: only trusted staff know it,
--       and an admin changes it (and signs the desk out everywhere) when
--       someone leaves.
-- ---------------------------------------------------------------------
create or replace function public.set_my_pin(p_pin text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_session_id   uuid := public.current_session_id();
  v_last_pw      timestamptz;   -- when this session last signed in with the password
  v_is_shared    boolean;
  v_has_pin      boolean;
  v_idle         interval;
  v_until        timestamptz;
begin
  -- 1. Input: exactly 4 digits ("is null" checked separately, see verify_pin).
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return 'invalid';
  end if;

  -- 2. Weak PINs.
  if public.pin_is_too_easy(p_pin) then
    return 'too_easy';
  end if;

  -- 3. Signed in, valid session, active staff with a password sign-in
  --    within 7 days...
  if v_uid is null or v_session_id is null
     or not public.is_active_staff_with_fresh_password() then
    return 'password_required';
  end if;

  -- ...the session still exists in Supabase Auth (not signed out; 5b)...
  if not public.session_exists() then
    return 'password_required';
  end if;

  -- ...and that password sign-in was within the last 10 minutes.
  v_last_pw := public.last_password_sign_in_at();
  if v_last_pw < now() - interval '10 minutes' then
    return 'password_required';
  end if;

  -- 4. This session hit 5 wrong PINs -> password only.
  if public.session_is_pin_locked(v_session_id) then
    return 'password_required';
  end if;

  -- 5. Read this person's row and LOCK it ("for update") so two calls at
  --    the same moment can't both pass the shared-account check below.
  select s.is_shared, s.pin_hash is not null, make_interval(mins => s.idle_lock_minutes)
    into v_is_shared, v_has_pin, v_idle
    from public.staff s
   where s.id = v_uid
     for update;

  -- 6. Is this session locked on the server? Use its row if it has one;
  --    otherwise count the idle time from the password sign-in.
  select u.unlocked_until
    into v_until
    from public.session_unlock u
   where u.session_id = v_session_id
     and u.staff_id = v_uid;
  if not found then
    v_until := v_last_pw + v_idle;
  end if;
  if v_until <= now() then
    return 'password_required';
  end if;

  -- 7. The shared desk account sets its PIN once; after that, admin only.
  if v_is_shared and v_has_pin then
    return 'not_allowed';
  end if;

  -- 8. Save only the bcrypt hash (see admin_set_staff_pin in 0001 for
  --    what gen_salt('bf', 10) means).
  update public.staff
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10))
   where id = v_uid;

  -- 9. Reset THIS session's wrong-PIN count only (if it has one; step 4
  --    made sure it isn't PIN-locked), and unlock this session on the
  --    server. Other devices' counts are left exactly as they were.
  update public.pin_attempts
     set failed     = 0,
         updated_at = now()
   where session_id = v_session_id
     and staff_id   = v_uid
     and locked_at is null;

  perform public.mark_session_unlocked(v_session_id, v_uid);

  return 'ok';
end;
$$;

revoke execute on function public.set_my_pin(text) from public, anon;
grant  execute on function public.set_my_pin(text) to authenticated;


-- ---------------------------------------------------------------------
-- 14. admin_set_staff_pin(p_staff_id, p_pin) - REPLACES 0001's version
-- Same job as before (an admin gives someone a new PIN and clears that
-- person's wrong-PIN counts), with four new rules:
--   * You can't use it on YOURSELF (use set_my_pin). Otherwise an admin
--     whose device hit 5 wrong PINs could clear their own PIN lock
--     (guidelines 10b).
--   * The admin's own session must pass has_data_access() (unlocked,
--     not PIN-locked, still signed in) - like any other admin action.
--   * Weak PINs are refused (same rule as set_my_pin).
--   * Devices that hit 5 wrong PINs STAY locked (0001 lifted those locks).
--     A locked device may be lost or stolen; a new PIN must not hand it 5
--     more guesses. Its owner signs in with the password again instead.
-- Raises an error (instead of returning a value) when refused, like 0001.
-- In the SQL Editor you are not a signed-in staff member, so this refuses
-- you; SETUP.md has a plain SQL snippet for the editor instead.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_staff_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- is_admin() now includes the 7-day password check (section 15).
  if not public.is_admin() then
    raise exception 'Only an active admin with a recent password sign-in can set a staff PIN.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_staff_id = auth.uid() then
    raise exception 'Use Change PIN (set_my_pin) to change your own PIN.'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.has_data_access() then
    raise exception 'Unlock the dashboard (and sign in again if asked) before setting a staff PIN.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits.'
      using errcode = 'invalid_parameter_value';
  end if;

  if public.pin_is_too_easy(p_pin) then
    raise exception 'PIN is too easy to guess.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.staff
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10))
   where id = p_staff_id;

  if not found then
    raise exception 'No staff row with id %.', p_staff_id
      using errcode = 'no_data_found';
  end if;

  -- New PIN from an admin = wrong-PIN counts start again on every device,
  -- but PIN-locked devices stay locked (p_keep_locked => true, section 8).
  perform public.clear_pin_attempts_for(p_staff_id, p_keep_locked => true);
end;
$$;

revoke execute on function public.admin_set_staff_pin(uuid, text) from public, anon;
grant  execute on function public.admin_set_staff_pin(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 15. is_admin() - REPLACES 0001's version (same name, same use)
-- NEW: also requires is_active_staff_with_fresh_password(), so an admin's
-- magic-link / recovery / 8-day-old session is not treated as an admin
-- anywhere (guidelines 10b). Everything else unchanged: true only for an
-- ACTIVE staff row with role 'admin' for the signed-in user.
-- !!! is_admin() is NEVER a data gate on its own !!!
--   It says WHO you are, not whether this session is unlocked. Anywhere it
--   gives admins more (a security rule, a function), always pair it with
--   has_data_access():  ((select public.is_admin()) and (select public.has_data_access()))
--   Section 17 does this for the staff table.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_staff_with_fresh_password()
     and exists (
       select 1
       from public.staff s
       where s.id = auth.uid()
         and s.role = 'admin'
         and s.active
     );
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;


-- ---------------------------------------------------------------------
-- 16. get_my_profile() - REPLACES 0001's version
-- WHY drop first: it now returns two more columns, and Postgres can't
-- change what a function returns with "create or replace". So it is
-- dropped and created again (in the same transaction, so the app never
-- sees it missing). New columns are added at the END so nothing that
-- reads the old ones changes:
--   idle_lock_minutes - this account's idle time (the app's lock timer)
--   is_shared         - true for the front desk (hide Change PIN / password)
-- Everything else is exactly as in 0001.
-- ---------------------------------------------------------------------
drop function if exists public.get_my_profile();

create function public.get_my_profile()
returns table (
  id                uuid,
  full_name         text,
  email             text,
  role              text,
  active            boolean,
  has_pin           boolean,
  pin_locked        boolean,
  password_fresh    boolean,
  idle_lock_minutes integer,
  is_shared         boolean
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
    public.password_signed_in_recently() as password_fresh,
    s.idle_lock_minutes,
    s.is_shared
  from public.staff s
  where s.id = auth.uid();
$$;

-- A new function starts with no grants (0001 section 11), so grant again.
revoke execute on function public.get_my_profile() from public, anon;
grant  execute on function public.get_my_profile() to authenticated;


-- ---------------------------------------------------------------------
-- 17. Staff read rule (policy staff_select_own_or_admin) - REPLACES 0001's
-- WHAT CHANGES: in 0001 an admin could read EVERY staff row whenever they
-- had a fresh password sign-in - even from a LOCKED session (the lock was
-- only in the browser then). Now:
--   * everyone (active staff, password sign-in within 7 days) can still
--     read their OWN row, locked or not - the app needs its own name on the
--     Lock screen;
--   * an admin sees everyone else's rows only while their session passes
--     has_data_access() (unlocked, not PIN-locked, still signed in).
-- RULE: is_admin() is never a data gate on its own; always pair it with
-- has_data_access() (see sections 11 and 15).
-- "drop policy if exists" + "create policy" = replace it (Postgres has no
-- "create or replace policy"); both run in the same transaction, so there
-- is never a moment with no rule. "(select ...)" around each function call
-- is the same Supabase performance tip as in 0001: run once per query, not
-- once per row.
-- ---------------------------------------------------------------------
drop policy if exists staff_select_own_or_admin on public.staff;
create policy staff_select_own_or_admin
  on public.staff
  for select
  to authenticated
  using (
    (select public.is_active_staff_with_fresh_password())
    and (
      id = (select auth.uid())
      or (
        (select public.is_admin())
        and (select public.has_data_access())
      )
    )
  );

-- End of 0002_server_lock_and_accounts.sql
