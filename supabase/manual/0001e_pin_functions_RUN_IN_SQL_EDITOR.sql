-- =====================================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR  (project: tkd-dashboard)
-- ---------------------------------------------------------------------
-- WHAT IT IS
--   The last two functions from migrations/0001_staff_and_pin.sql:
--   verify_pin (the lock screen's PIN check) and admin_set_staff_pin.
--   Everything else in 0001 was already applied through Claude's Supabase
--   connection. These two couldn't be: the connection refuses any SQL that
--   contains the word DELETE (a safety feature), and both functions delete
--   old wrong-PIN counter rows as part of their normal job.
--
-- HOW TO RUN IT
--   Supabase dashboard -> project tkd-dashboard -> SQL Editor -> New query
--   -> paste this whole file -> Run.  You should see "Success. No rows returned".
--   Supabase may warn that the query contains destructive operations - that's
--   the DELETE lines inside the functions. They don't delete anything now; they
--   only run later when a PIN is checked. It's safe to confirm.
--   Safe to run more than once ("create or replace").
-- =====================================================================

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
