-- =====================================================================
-- RUN THIS IN THE SUPABASE SQL EDITOR  (project: tkd-dashboard)
-- ---------------------------------------------------------------------
-- WHAT IT IS
--   Part B of migrations/0002_server_lock_and_accounts.sql: the four
--   sections that contain the word DELETE, copied word for word from 0002
--   (same section numbers):
--     3.  the link from session_unlock to staff ("on delete cascade")
--     7.  cleanup_session_unlock()  - clears out session rows untouched for 8+ days
--     8.  clear_pin_attempts_for()  - clears wrong-PIN counters after an admin sets a new PIN
--     12. verify_pin()              - the lock screen's PIN check, now also
--                                     unlocking the session on the server
--   Everything else in 0002 was applied through Claude's Supabase
--   connection (manual/0002a_connector_part.sql). These couldn't be: the
--   connection refuses any SQL that contains the word DELETE (a safety
--   feature).
--
-- BEFORE YOU RUN IT
--   Part A (0002a) must already be applied. Claude does that first and
--   tells you. If you run this first you'll get an error like
--   'relation "public.session_unlock" does not exist' and nothing changes.
--
-- HOW TO RUN IT
--   Supabase dashboard -> project tkd-dashboard -> SQL Editor -> New query
--   -> paste this whole file -> Run.  You should see "Success. No rows returned".
--   Supabase will probably warn that the query contains destructive
--   operations - that's the DELETE lines inside the functions and the "on
--   delete cascade" rule. They don't delete anything now; they only run later
--   (when a PIN is checked or changed, when the app checks a session, or if
--   a staff row is ever removed). It's safe to confirm.
--   Safe to run more than once ("create or replace", "drop ... if exists").
--   Then tell Claude it worked, so the tests can be run.
-- =====================================================================


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

-- End of 0002b_functions_with_delete_RUN_IN_SQL_EDITOR.sql
