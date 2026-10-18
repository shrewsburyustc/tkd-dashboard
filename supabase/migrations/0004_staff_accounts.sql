-- =====================================================================
-- 0004_staff_accounts.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE DOES
--   The database side of the first part of Staff accounts (rulebook
--   v0.70-v0.76; build plan docs/Dashboard Docs/TKD-Staff-Accounts-Build-
--   Plan.md): an admin can RESET another person's PASSWORD or PIN from the
--   dashboard instead of pasting SQL snippets from SETUP.md.
--
--   New functions (the app calls the first three):
--     public.admin_list_staff()                      the Staff accounts list
--     public.admin_reset_password(p_staff_id, p_new_password)
--     public.admin_reset_pin(p_staff_id, p_pin)
--     public.staff_admin_gate()                      internal: shared checks
--   Changed rights:
--     public.admin_set_staff_pin(uuid, text)  (from 0002) can no longer be
--     called by the app. The app uses admin_reset_pin, which has the
--     10-minute password rule (v0.74). Its body is unchanged.
--
-- WHY IN THE DATABASE (decided v0.71)
--   Setting someone else's password is an "admin" power in Supabase Auth.
--   The key that grants it through Supabase's API (the secret /
--   service_role key) must never be in the app. Instead, these functions
--   run as their owner ("postgres", which may change Supabase Auth's own
--   tables - checked read-only on production 2026-10-17) and check every
--   rule themselves before changing anything. No secret key is used.
--   Known risk, accepted: auth.* belongs to Supabase and may change one
--   day. If it does, these functions stop with an error and change
--   NOTHING (one transaction); 0004_fingerprints.sql checks the columns
--   they rely on.
--
-- WHAT A PASSWORD RESET DOES (all or nothing)
--   1. saves the new password as a bcrypt hash in auth.users (the same
--      kind of one-way scramble, and strength, Supabase Auth uses itself);
--   2. cancels every link already emailed or texted: password reset,
--      magic link, email change, confirmation (v0.72);
--   3. signs the person out on every device (v0.72);
--   4. writes one change_log row: who reset whose password, and when.
--      NEVER the password itself.
--
-- WHO MAY USE THEM
--   An active ADMIN whose session passes has_data_access() (unlocked, still
--   signed in, not PIN-locked, password within 7 days) AND who signed in
--   with their password within the last 10 MINUTES (the app's "Confirm
--   it's you" step does that; v0.74). Never on your own account (use
--   Change password / Change PIN). An admin may reset the OTHER admin
--   (v0.23: one admin who forgets is never locked out).
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so if any
--   statement fails nothing is kept. Needs 0001, 0002 and 0003 first
--   (0003 made public.change_log).
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   word "delete" appears inside the functions (they remove sessions and
--   emailed links later, only when an admin resets a password in the
--   app). Nothing is deleted now. Confirm.
--   Safe to run again ("create or replace function", revoke/grant).
--
-- WORDS USED BELOW
--   * "security definer" / search_path = '' / qualified names: the same
--     rules as 0001-0003 (see 0001's header for why).
--   * Status values: every function returns jsonb {"status": ...} instead
--     of raising errors for normal refusals, so the app can show the right
--     message. Unexpected problems (e.g. Supabase changed a table) raise
--     an error, which undoes the whole call.
--   * "lock" = a row lock ("for update" / "for no key update"): a second
--     call touching the same rows waits until this one is finished.
--   * Re-running 0001 or 0002 AFTER this file gives admin_set_staff_pin
--     back to the app (section 5). If that ever happens, run this file
--     again; 0002_tests.sql and 0004_tests.sql both fail until you do.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. staff_admin_gate() - internal helper: "may this caller reset others?"
-- Returns NULL when allowed, otherwise the status to send back:
--   'not_allowed'        not an active admin; or this session is locked,
--                        PIN-locked, signed out, or older than 7 days
--   'password_required'  the admin's password sign-in was more than 10
--                        minutes ago -> the app asks for it again
-- The 10-minute rule is written with coalesce(..., false) so a missing
-- sign-in time counts as "too old" (fails closed).
-- ---------------------------------------------------------------------
create or replace function public.staff_admin_gate()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not public.is_admin()
     or not public.has_data_access() then
    return 'not_allowed';
  end if;

  if not coalesce(public.last_password_sign_in_at() >= now() - interval '10 minutes', false) then
    return 'password_required';
  end if;

  return null;
end;
$$;

revoke execute on function public.staff_admin_gate() from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. admin_list_staff() - the Staff accounts page
-- Returns {"status":"ok","accounts":[{id, full_name, email, role,
-- is_shared, is_me}, ...]} for ACTIVE accounts, sorted admins -> staff ->
-- shared, then by name (A-Z, ignoring capitals). Only those six facts:
-- never PIN hashes, wrong-PIN counts, sessions or anything about passwords.
-- (is_shared is not readable by the app directly - 0001's column grants.)
-- No 10-minute rule here: looking at the list changes nothing.
-- ---------------------------------------------------------------------
create or replace function public.admin_list_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_admin() or not public.has_data_access() then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'accounts', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id',        s.id,
                 'full_name', s.full_name,
                 'email',     s.email,
                 'role',      s.role,
                 'is_shared', s.is_shared,
                 'is_me',     s.id = v_uid)
               order by case when s.is_shared then 2 when s.role = 'admin' then 0 else 1 end,
                        lower(s.full_name),
                        s.id)
        from public.staff s
       where s.active
    ), '[]'::jsonb));
end;
$$;

revoke execute on function public.admin_list_staff() from public, anon, authenticated, service_role;
grant  execute on function public.admin_list_staff() to authenticated;


-- ---------------------------------------------------------------------
-- 3. admin_reset_password(p_staff_id, p_new_password)
-- Returns {"status": ...}, one of:
--   'ok' (+ "devices_signed_out": n)  done
--   'invalid'            an argument is missing (NULL)
--   'not_allowed'        see staff_admin_gate (section 1)
--   'password_required'  see staff_admin_gate (section 1)
--   'own_account'        that's you: use Change password
--   'not_found'          no active staff row, or its login is missing,
--                        deleted or banned
--   'too_short'          under 12 characters (v0.28)
--   'too_long'           over 72 bytes: bcrypt ignores everything after
--                        72 bytes, and Supabase Auth refuses longer ones
-- Every refusal changes nothing.
-- The password is only ever used inside crypt(): it is never stored as
-- text, logged, returned or put in an error message.
-- ---------------------------------------------------------------------
create or replace function public.admin_reset_password(p_staff_id uuid, p_new_password text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_gate    text;
  v_rows    integer;
  v_signed  integer;
begin
  -- 0. Both arguments are needed (a NULL would slip past the length checks).
  if p_staff_id is null or p_new_password is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 1-2. Active admin, unlocked session, password within 10 minutes.
  v_gate := public.staff_admin_gate();
  if v_gate is not null then
    return jsonb_build_object('status', v_gate);
  end if;

  -- 3. Not on yourself.
  if p_staff_id = auth.uid() then
    return jsonb_build_object('status', 'own_account');
  end if;

  -- Lock BOTH people's staff rows, always in the same order (by id), until
  -- this call finishes. Two admins resetting each other at the same moment
  -- then take turns instead of deadlocking. "no key update" is the lighter
  -- lock: it still makes a second reset wait, but doesn't hold up the
  -- PIN / unlock bookkeeping that points at these rows. (amended after
  -- security review)
  perform 1
     from public.staff s
    where s.id in (auth.uid(), p_staff_id)
    order by s.id
      for no key update;

  -- ...and check the caller AGAIN now that it holds the locks: if the other
  -- admin has just reset this caller (and so signed them out), the caller
  -- is refused here instead of resetting them back.
  v_gate := public.staff_admin_gate();
  if v_gate is not null then
    return jsonb_build_object('status', v_gate);
  end if;

  -- 4. The person must be an active staff member (its row is locked above,
  --    so the check and the change can't be separated by another call)...
  perform 1
     from public.staff s
    where s.id = p_staff_id
      and s.active;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  --    ...with a working login (not deleted, not banned).
  perform 1
     from auth.users u
    where u.id = p_staff_id
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 5-6. Length rules. char_length counts characters (é = 1); octet_length
  --      counts bytes (é = 2), which is what bcrypt's 72 limit is about.
  if char_length(p_new_password) < 12 then
    return jsonb_build_object('status', 'too_short');
  end if;
  if octet_length(p_new_password) > 72 then
    return jsonb_build_object('status', 'too_long');
  end if;

  -- 7. The new password, as a bcrypt hash (cost 10, as Supabase Auth
  --    uses). Every emailed / texted token column is emptied in the same
  --    step - that cancels password-reset, magic-link, confirmation and
  --    email-change links (including a pending change to someone else's
  --    address). Empty strings, never NULL: Supabase Auth can't read NULL
  --    in these columns.
  update auth.users
     set encrypted_password          = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
         recovery_token              = '',
         reauthentication_token      = '',
         confirmation_token          = '',
         email_change_token_new      = '',
         email_change_token_current  = '',
         email_change                = '',
         email_change_confirm_status = 0,
         phone_change_token          = '',
         updated_at                  = now()
   where id = p_staff_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    -- Can't happen after the check above; if it does, undo everything.
    raise exception 'admin_reset_password: expected to update 1 login, updated %', v_rows;
  end if;

  -- 8. The newer place Supabase keeps emailed links, and half-finished
  --    sign-in codes: removed.
  delete from auth.one_time_tokens t where t.user_id = p_staff_id;
  delete from auth.flow_state f where f.user_id = p_staff_id;

  -- 9. Sign out everywhere. Each device's refresh tokens go with its
  --    session (foreign key "on delete cascade"); the extra delete catches
  --    any token not tied to a session. (Old session_unlock rows are left:
  --    harmless, refused anyway, cleaned up after 8 days.)
  delete from auth.sessions s where s.user_id = p_staff_id;
  get diagnostics v_signed = row_count;
  delete from auth.refresh_tokens r where r.user_id = p_staff_id::text;

  -- 10. History: who reset whose password, and how many devices were
  --     signed out. Never the password.
  insert into public.change_log
    (actor_id, actor_name, session_id, batch_id, action,
     table_name, record_id, location_code, op, before, after)
  values
    (auth.uid(), public.change_log_actor_name(), public.current_session_id(), gen_random_uuid(),
     'admin_reset_password', 'staff', p_staff_id, null, 'update', null,
     jsonb_build_object('password', 'reset', 'devices_signed_out', v_signed));

  return jsonb_build_object('status', 'ok', 'devices_signed_out', v_signed);
end;
$$;

revoke execute on function public.admin_reset_password(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.admin_reset_password(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. admin_reset_pin(p_staff_id, p_pin)  (v0.75: the admin types the PIN)
-- Returns {"status": ...}, one of:
--   'ok'                 done; works on every device straight away
--   'invalid'            an argument is missing, or the PIN isn't exactly
--                        4 digits
--   'too_easy'           1111, 1234, 4321 ... (same rule as set_my_pin)
--   'not_allowed' / 'password_required' / 'own_account' / 'not_found'
--                        same meaning as admin_reset_password
-- Same job as 0002's admin_set_staff_pin: new bcrypt PIN hash, that
-- person's wrong-PIN counts cleared, but devices that hit 5 wrong PINs
-- STAY locked (they may be lost or stolen; they need the password).
-- Nobody is signed out. The digits are never logged or returned.
-- ---------------------------------------------------------------------
create or replace function public.admin_reset_pin(p_staff_id uuid, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_gate text;
begin
  if p_staff_id is null or p_pin is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_gate := public.staff_admin_gate();
  if v_gate is not null then
    return jsonb_build_object('status', v_gate);
  end if;

  if p_staff_id = auth.uid() then
    return jsonb_build_object('status', 'own_account');
  end if;

  -- Same locking and second check as admin_reset_password.
  perform 1
     from public.staff s
    where s.id in (auth.uid(), p_staff_id)
    order by s.id
      for no key update;

  v_gate := public.staff_admin_gate();
  if v_gate is not null then
    return jsonb_build_object('status', v_gate);
  end if;

  perform 1
     from public.staff s
    where s.id = p_staff_id
      and s.active;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  perform 1
     from auth.users u
    where u.id = p_staff_id
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now());
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if public.pin_is_too_easy(p_pin) then
    return jsonb_build_object('status', 'too_easy');
  end if;

  update public.staff
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10))
   where id = p_staff_id;

  -- Counts start again on every device; PIN-locked devices stay locked
  -- (p_keep_locked => true, 0002 section 8).
  perform public.clear_pin_attempts_for(p_staff_id, p_keep_locked => true);

  -- History (written here, not by a trigger: a trigger on public.staff
  -- would copy pin_hash into change_log - never attach change_log_write
  -- to public.staff; 0004_fingerprints.sql checks that).
  insert into public.change_log
    (actor_id, actor_name, session_id, batch_id, action,
     table_name, record_id, location_code, op, before, after)
  values
    (auth.uid(), public.change_log_actor_name(), public.current_session_id(), gen_random_uuid(),
     'admin_reset_pin', 'staff', p_staff_id, null, 'update', null,
     jsonb_build_object('pin', 'reset'));

  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.admin_reset_pin(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.admin_reset_pin(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5. admin_set_staff_pin (0002): no longer callable by the app
-- The app never used it, and it has no 10-minute password rule. With
-- admin_reset_pin in place it must not stay as a weaker way in (v0.74).
-- Its body is unchanged. NOTE: running 0002 again would grant it back;
-- 0004_fingerprints.sql shows its rights so that would be noticed.
-- ---------------------------------------------------------------------
revoke execute on function public.admin_set_staff_pin(uuid, text) from public, anon, authenticated, service_role;


commit;

-- End of 0004_staff_accounts.sql
