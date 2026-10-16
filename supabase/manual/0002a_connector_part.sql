-- =====================================================================
-- 0002a_connector_part.sql  (project: tkd-dashboard)
-- ---------------------------------------------------------------------
-- WHAT IT IS
--   Part A of migrations/0002_server_lock_and_accounts.sql: every section
--   of 0002 that Claude's Supabase connection is allowed to run. The
--   connection refuses SQL containing one particular keyword (the one that
--   removes rows), so the few sections of 0002 that use it are in part B:
--   the file in this folder whose name starts with 0002b_ (run in the
--   Supabase SQL Editor).
--   The sections below are copied word for word from 0002, in the same
--   order, keeping their section numbers (the gaps are the part B
--   sections: 3, 7, 8 and 12).
--
-- ORDER
--   1. Run THIS file first (Claude applies it through the connection).
--   2. Then Jeffrey runs part B in the Supabase SQL Editor.
--   Until part B has run, the new functions that call part B's helpers
--   (touch_session, admin_set_staff_pin) will stop with "function ...
--   does not exist". The app doesn't call them yet, and the existing lock
--   screen keeps working, because verify_pin is only replaced by part B.
--   Also between A and B: the new staff read rule (section 17) shows an
--   admin only their OWN staff row, because no session can be unlocked on
--   the server until touch_session works. Nothing in the app lists staff
--   yet, so nothing visible changes.
--   Running A then B gives the same database as running 0002 in one go.
--   Safe to run more than once.
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

-- End of 0002a_connector_part.sql (next: 0002b in the SQL Editor)
