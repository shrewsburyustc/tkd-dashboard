-- =====================================================================
-- verify_pin_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for the PIN-unlock and access-check database code
--   in migrations/0001_staff_and_pin.sql. You run it yourself in the
--   Supabase SQL Editor to prove the security rules work BEFORE trusting them.
--   Updated for migration 0002: Test 14 now expects admin_set_staff_pin to
--   refuse your OWN account (0002's new rule), and the setup adds the
--   pretend sessions to Supabase Auth's list of sign-ins (auth.sessions),
--   because since 0002 verify_pin refuses a session that isn't in that list
--   (a signed-out device). Everything else is unchanged and still passes
--   after 0002. (Before 0002, use a NON-admin UID: with an admin's UID,
--   test 14 expects the 0002 rule and fails.) The new 0002 rules have
--   their own file: tests/0002_tests.sql.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with ROLLBACK,
--   which undoes every change (the test PIN, the counters, the locks).
--   Your real data is exactly as it was afterwards.
--   NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE A SIGNED-IN USER ON DIFFERENT DEVICES
--   When the app calls the database, Supabase puts two things on the
--   connection:
--     * the role "authenticated"           -> we copy with: set local role authenticated
--     * the login token's contents (JWT)   -> we copy with: request.jwt.claims
--   The token includes the user id ("sub"), the sign-in session id
--   ("session_id" - one per device sign-in) and how/when they signed in
--   ("amr"). By setting request.jwt.claims ourselves we can pretend to be the
--   same person signed in on several devices, with any sign-in time.
--   set_config('request.jwt.claims', <json>, true) is the same as
--   "set local request.jwt.claims = '<json>'"; set_config is used because the
--   values must be calculated (e.g. "8 days ago"), and SET only accepts fixed
--   text. The "true" means LOCAL: it only lasts until the transaction ends.
--   The session ids are made-up random uuids, not real sign-ins. The
--   setup adds them to auth.sessions (undone by the ROLLBACK like
--   everything else) so the database treats them as still signed in.
--
-- BEFORE YOU RUN IT
--   1. You need ONE existing, ACTIVE staff row (from SETUP.md step 4).
--   2. Replace <paste-staff-UID-here> below (one place, in Part A) with that
--      person's UID from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      The test uses its own throwaway PIN (1234) and rolls it back; your real
--      PIN is not needed and not changed.
--
-- HOW TO READ THE RESULT
--   * Passed: you see one row "ALL PIN TESTS PASSED".
--   * Failed: you see an error starting with "TEST FAILED:" saying which check
--     broke and what came back instead. Nothing was saved either way.
--     If it failed, run   rollback;   on its own once, to be extra sure the
--     editor's connection is not left mid-transaction.
--   (The SQL Editor only shows the last result, which is why the checks are
--   bundled in one block that stops with a clear message on the first failure.)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- PART A: automated checks (one DO block = one little program that runs once)
-- ---------------------------------------------------------------------
do $$
declare
  -- >>> EDIT THIS ONE LINE <<<
  v_uid uuid := '<paste-staff-UID-here>';

  -- Pretend devices: each is a separate sign-in session.
  v_sess_a uuid := gen_random_uuid();   -- e.g. the front-desk tablet
  v_sess_b uuid := gen_random_uuid();   -- e.g. the office PC
  v_sess_c uuid := gen_random_uuid();   -- a fresh password sign-in later

  -- "amr" = how/when this session signed in (unix seconds).
  v_now_s      bigint := extract(epoch from now())::bigint;
  v_amr_recent jsonb  := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 3600));         -- 1 hour ago
  v_amr_old    jsonb  := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600)); -- 8 days ago
  v_amr_otp    jsonb  := jsonb_build_array(jsonb_build_object('method', 'otp',      'timestamp', v_now_s - 60));           -- magic link

  v_result   text;
  v_failed   integer;
  v_locked   boolean;
  v_fresh    boolean;
  v_has_pin  boolean;
  v_count    integer;
  v_name     text;
  v_is_admin boolean;
begin
  -- -------------------------------------------------------------------
  -- Setup (as the admin "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  if not exists (select 1 from public.staff where id = v_uid and active) then
    raise exception 'TEST SETUP: no ACTIVE staff row with id %. Paste a real staff UID into v_uid.', v_uid;
  end if;

  -- Throwaway test PIN 1234 and no old counters. Rolled back at the end.
  update public.staff
     set pin_hash = extensions.crypt('1234', extensions.gen_salt('bf', 10))
   where id = v_uid;
  delete from public.pin_attempts where staff_id = v_uid;

  -- Make the pretend sessions "real" for Supabase Auth (see the header).
  begin
    insert into auth.sessions (id, user_id)
    select x, v_uid from unnest(array[v_sess_a, v_sess_b, v_sess_c]) as x;
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;

  -- Become "device A, signed in with password 1 hour ago".
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'session_id', v_sess_a, 'amr', v_amr_recent)::text, true);
  set local role authenticated;   -- from here on we are "the browser"

  -- -------------------------------------------------------------------
  -- Test 1: invalid input -> 'invalid', and NOT counted as a wrong try
  -- -------------------------------------------------------------------
  v_result := public.verify_pin('12a4');
  if v_result is distinct from 'invalid' then raise exception 'TEST FAILED: 1a "12a4" expected invalid, got %', v_result; end if;
  v_result := public.verify_pin('123');
  if v_result is distinct from 'invalid' then raise exception 'TEST FAILED: 1b "123" expected invalid, got %', v_result; end if;
  v_result := public.verify_pin('12345');
  if v_result is distinct from 'invalid' then raise exception 'TEST FAILED: 1c "12345" expected invalid, got %', v_result; end if;
  v_result := public.verify_pin(null);
  if v_result is distinct from 'invalid' then raise exception 'TEST FAILED: 1d null expected invalid, got %', v_result; end if;

  reset role;   -- back to admin briefly, to peek at the hidden counter table
  select count(*) into v_count from public.pin_attempts where session_id = v_sess_a and failed > 0;
  if v_count <> 0 then raise exception 'TEST FAILED: 1e invalid input was counted as a wrong try'; end if;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 2: correct PIN -> 'ok'
  -- -------------------------------------------------------------------
  v_result := public.verify_pin('1234');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 2 correct PIN expected ok, got %', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 3: wrong-PIN countdown on device A
  -- -------------------------------------------------------------------
  v_result := public.verify_pin('0000');
  if v_result is distinct from 'wrong:4' then raise exception 'TEST FAILED: 3a A 1st wrong expected wrong:4, got %', v_result; end if;
  v_result := public.verify_pin('9999');
  if v_result is distinct from 'wrong:3' then raise exception 'TEST FAILED: 3b A 2nd wrong expected wrong:3, got %', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 4: the attack that motivated per-session counters.
  --   A correct PIN on device B must NOT reset device A's count.
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'session_id', v_sess_b, 'amr', v_amr_recent)::text, true);
  v_result := public.verify_pin('1234');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 4a B correct PIN expected ok, got %', v_result; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'session_id', v_sess_a, 'amr', v_amr_recent)::text, true);
  v_result := public.verify_pin('4321');
  if v_result is distinct from 'wrong:2' then
    raise exception 'TEST FAILED: 4b A 3rd wrong expected wrong:2 (B must not reset A), got %', v_result;
  end if;

  -- -------------------------------------------------------------------
  -- Test 5: 5th wrong on A -> 'password_required', and A STAYS locked
  -- -------------------------------------------------------------------
  v_result := public.verify_pin('1111');
  if v_result is distinct from 'wrong:1' then raise exception 'TEST FAILED: 5a A 4th wrong expected wrong:1, got %', v_result; end if;
  v_result := public.verify_pin('2222');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 5b A 5th wrong expected password_required, got %', v_result; end if;

  v_result := public.verify_pin('1234');   -- even the CORRECT PIN is refused now
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 5c A correct PIN while locked expected password_required, got %', v_result; end if;
  v_result := public.verify_pin('1234');   -- ...and keeps being refused
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 5d A still locked expected password_required, got %', v_result; end if;

  select p.pin_locked into v_locked from public.get_my_profile() p;
  if v_locked is distinct from true then raise exception 'TEST FAILED: 5e get_my_profile pin_locked on A expected true, got %', v_locked; end if;

  -- Device B is a different session: not locked, still works.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'session_id', v_sess_b, 'amr', v_amr_recent)::text, true);
  select p.pin_locked into v_locked from public.get_my_profile() p;
  if v_locked is distinct from false then raise exception 'TEST FAILED: 5f get_my_profile pin_locked on B expected false, got %', v_locked; end if;
  v_result := public.verify_pin('1234');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 5g B correct PIN expected ok, got %', v_result; end if;

  -- Going back to A after B's correct PIN: A is still locked.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'session_id', v_sess_a, 'amr', v_amr_recent)::text, true);
  v_result := public.verify_pin('1234');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 5h A after B ok expected password_required, got %', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 6: a NEW session (password sign-in again) gets a fresh counter
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'session_id', v_sess_c,
      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s + 60)))::text, true);
  select p.pin_locked into v_locked from public.get_my_profile() p;
  if v_locked is distinct from false then raise exception 'TEST FAILED: 6a new session pin_locked expected false, got %', v_locked; end if;
  v_result := public.verify_pin('0000');
  if v_result is distinct from 'wrong:4' then raise exception 'TEST FAILED: 6b new session 1st wrong expected wrong:4, got %', v_result; end if;
  v_result := public.verify_pin('1234');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 6c new session correct expected ok, got %', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 7: missing or broken session_id -> 'password_required'
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'amr', v_amr_recent)::text, true);
  v_result := public.verify_pin('1234');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 7a no session_id expected password_required, got %', v_result; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'session_id', 'not-a-uuid', 'amr', v_amr_recent)::text, true);
  v_result := public.verify_pin('1234');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 7b bad session_id expected password_required, got %', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 8: password sign-in older than 7 days, or a magic-link session
  --   -> verify_pin refuses, is_active_staff_with_fresh_password() is false,
  --      get_my_profile().password_fresh is false, staff table rows hidden
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'session_id', gen_random_uuid(), 'amr', v_amr_old)::text, true);
  v_result := public.verify_pin('1234');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 8a 8-day-old sign-in expected password_required, got %', v_result; end if;
  if public.is_active_staff_with_fresh_password() then raise exception 'TEST FAILED: 8b fresh-password check true for 8-day-old sign-in'; end if;
  select p.password_fresh into v_fresh from public.get_my_profile() p;
  if v_fresh is distinct from false then raise exception 'TEST FAILED: 8c password_fresh expected false for 8-day-old sign-in, got %', v_fresh; end if;
  select count(*) into v_count from public.staff s where s.id = v_uid;
  if v_count <> 0 then raise exception 'TEST FAILED: 8d stale session could read the staff table'; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'session_id', gen_random_uuid(), 'amr', v_amr_otp)::text, true);
  v_result := public.verify_pin('1234');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 8e magic-link session expected password_required, got %', v_result; end if;
  if public.is_active_staff_with_fresh_password() then raise exception 'TEST FAILED: 8f fresh-password check true for magic-link session'; end if;
  select count(*) into v_count from public.staff s where s.id = v_uid;
  if v_count <> 0 then raise exception 'TEST FAILED: 8g magic-link session could read the staff table'; end if;

  -- -------------------------------------------------------------------
  -- Test 9: fresh password sign-in -> check is true, password_fresh true;
  --         deactivated staff -> check is false
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'session_id', v_sess_b, 'amr', v_amr_recent)::text, true);
  if not public.is_active_staff_with_fresh_password() then raise exception 'TEST FAILED: 9a fresh-password check false for a 1-hour-old password sign-in'; end if;
  select p.password_fresh into v_fresh from public.get_my_profile() p;
  if v_fresh is distinct from true then raise exception 'TEST FAILED: 9b password_fresh expected true, got %', v_fresh; end if;

  reset role;
  update public.staff set active = false where id = v_uid;
  set local role authenticated;
  if public.is_active_staff_with_fresh_password() then raise exception 'TEST FAILED: 9c fresh-password check true for an INACTIVE staff member'; end if;
  v_result := public.verify_pin('1234');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 9d inactive staff expected password_required, got %', v_result; end if;
  reset role;
  update public.staff set active = true where id = v_uid;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 10: dry-run guards -> error (insufficient_privilege, SQLSTATE 42501)
  --   The inner begin/exception block expects that specific error. Any
  --   setting changed inside it is undone when the error is caught.
  -- -------------------------------------------------------------------
  begin
    perform set_config('request.headers', '{"prefer": "tx=rollback"}', true);
    v_result := public.verify_pin('0000');
    raise exception 'TEST FAILED: 10a Prefer: tx=rollback was allowed (returned %)', v_result;
  exception
    when insufficient_privilege then null;  -- good: the guard refused it
    when others then raise exception 'TEST FAILED: 10a expected the dry-run guard error, got: %', sqlerrm;
  end;

  begin
    set local transaction_read_only = on;
    v_result := public.verify_pin('0000');
    raise exception 'TEST FAILED: 10b read-only transaction was allowed (returned %)', v_result;
  exception
    when insufficient_privilege then null;  -- good: the guard refused it
    when others then raise exception 'TEST FAILED: 10b expected the read-only guard error, got: %', sqlerrm;
  end;

  -- The refused calls must not have counted: B's next wrong is still wrong:4.
  v_result := public.verify_pin('0000');
  if v_result is distinct from 'wrong:4' then raise exception 'TEST FAILED: 10c after guards B expected wrong:4, got %', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 11: the browser can NOT read pin_hash or the pin_attempts table
  -- -------------------------------------------------------------------
  begin
    perform s.pin_hash from public.staff s where s.id = v_uid;
    raise exception 'TEST FAILED: 11a reading pin_hash was allowed (it must be denied)';
  exception
    when insufficient_privilege then null;  -- good: permission denied
  end;

  begin
    perform a.failed from public.pin_attempts a;
    raise exception 'TEST FAILED: 11b reading pin_attempts was allowed (it must be denied)';
  exception
    when insufficient_privilege then null;
  end;

  -- ...but CAN read its own safe columns (fresh password sign-in).
  select s.full_name into v_name from public.staff s where s.id = v_uid;
  if v_name is null then raise exception 'TEST FAILED: 11c could not read own full_name with a fresh sign-in'; end if;

  -- -------------------------------------------------------------------
  -- Test 12: a visitor who is NOT signed in (anon) can't call verify_pin
  -- -------------------------------------------------------------------
  set local role anon;
  begin
    v_result := public.verify_pin('1234');
    raise exception 'TEST FAILED: 12 anon was allowed to call verify_pin';
  exception
    when insufficient_privilege then null;
  end;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 13: old counter rows (8+ days untouched) are cleaned up
  -- -------------------------------------------------------------------
  reset role;
  insert into public.pin_attempts (session_id, staff_id, failed, updated_at)
  values (gen_random_uuid(), v_uid, 2, now() - interval '9 days');
  set local role authenticated;
  v_result := public.verify_pin('1234');   -- any real check triggers cleanup
  reset role;
  select count(*) into v_count from public.pin_attempts where staff_id = v_uid and updated_at < now() - interval '8 days';
  if v_count <> 0 then raise exception 'TEST FAILED: 13 old pin_attempts rows were not cleaned up'; end if;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 14: admin_set_staff_pin on YOUR OWN account is refused
  --   non-admin -> refused (not an admin)
  --   admin     -> refused too: since migration 0002 an admin can't use it
  --                on themselves (that would let them clear their own PIN
  --                lock). Admins change their own PIN with set_my_pin.
  --   (Setting ANOTHER person's PIN is tested in tests/0002_tests.sql.)
  --   After migration 0004 the app may not call admin_set_staff_pin at all,
  --   which is refused with the same error code, so this test still passes.
  -- -------------------------------------------------------------------
  v_is_admin := public.is_admin();
  begin
    perform public.admin_set_staff_pin(v_uid, '5802');
    if v_is_admin then
      raise exception 'TEST FAILED: 14b admin was allowed to set their OWN PIN (0002 refuses this)';
    else
      raise exception 'TEST FAILED: 14a non-admin was allowed to set a PIN';
    end if;
  exception
    when insufficient_privilege then null;   -- good: refused
  end;

  -- -------------------------------------------------------------------
  -- Test 15: no PIN set -> 'password_required', has_pin = false
  -- -------------------------------------------------------------------
  reset role;
  update public.staff set pin_hash = null where id = v_uid;
  set local role authenticated;

  v_result := public.verify_pin('1234');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 15a no PIN expected password_required, got %', v_result; end if;
  select p.has_pin into v_has_pin from public.get_my_profile() p;
  if v_has_pin is distinct from false then raise exception 'TEST FAILED: 15b has_pin expected false, got %', v_has_pin; end if;

  reset role;
end;
$$;

select 'ALL PIN TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;


-- =====================================================================
-- PART B (optional): see the "permission denied" error with your own eyes
-- ---------------------------------------------------------------------
-- Part A catches that error automatically. If you want to SEE it, run the
-- block below on its own (select just these lines, then Run). Replace the UID
-- first. Expected result: an error like
--     permission denied for table staff
-- which proves the browser can never read PIN hashes.
-- =====================================================================
-- begin;
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<paste-staff-UID-here>","role":"authenticated"}';
-- select pin_hash from public.staff;
-- rollback;
--
-- (If the editor shows the error, also run   rollback;   on its own once.)
