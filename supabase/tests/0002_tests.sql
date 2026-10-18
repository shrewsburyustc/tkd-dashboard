-- =====================================================================
-- 0002_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0002_server_lock_and_accounts.sql:
--   the server-side lock (touch_session, lock_session, has_data_access,
--   verify_pin unlocking, signed-out sessions refused), Set/Change PIN
--   (set_my_pin), the tightened admin_set_staff_pin and is_admin, and the
--   new staff read rule (admins see other staff only while unlocked).
--   Run it yourself in the Supabase SQL Editor AFTER 0002 is fully applied
--   (both parts), before trusting it.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with ROLLBACK,
--   which undoes every change (test PINs, test sessions, idle times, locks).
--   Your real data is exactly as it was afterwards.
--   NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS ON DIFFERENT DEVICES
--   Same trick as verify_pin_tests.sql (read its header for the details):
--     set local role authenticated            -> "I am the browser"
--     set_config('request.jwt.claims', ...)   -> "this is my login token":
--        sub = who, session_id = which device sign-in, amr = how/when
--        they signed in with the password.
--   has_data_access() also checks that the session really exists in
--   Supabase Auth (auth.sessions). Made-up sessions don't, so the setup
--   step adds a test row there for each made-up session id it uses
--   (undone by the ROLLBACK like everything else). If that step fails you
--   get a "TEST SETUP" error - tell Claude.
--
-- BEFORE YOU RUN IT
--   1. You need TWO existing, ACTIVE staff rows:
--        * an admin (e.g. Main Admin, jberg412@gmail.com)
--        * the shared front-desk account (Staff, shrewsburyustc@gmail.com,
--          role staff)
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below (Part
--      A, top) with their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      The test uses its own throwaway PINs and rolls them back; your real
--      PINs are not needed and not changed.
--
-- HOW TO READ THE RESULT
--   * Passed: you see one row "ALL 0002 TESTS PASSED".
--   * Failed: you see an error starting with "TEST FAILED:" (or "TEST
--     SETUP:") saying which check broke and what came back instead.
--     Nothing was saved either way. If it failed, run   rollback;   on its
--     own once, to be extra sure the editor's connection is not left
--     mid-transaction.
-- =====================================================================

begin;

do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  -- Pretend device sign-ins (sessions). "a" = admin, "d" = desk.
  v_a1  uuid := gen_random_uuid();   -- admin, password 1 minute ago
  v_a2  uuid := gen_random_uuid();   -- admin, password 2 hours ago (older than 45 min idle)
  v_a3  uuid := gen_random_uuid();   -- admin, password 1 minute ago, hit 5 wrong PINs
  v_a4  uuid := gen_random_uuid();   -- admin, password 1 minute ago, NOT in auth.sessions (signed out)
  v_a5  uuid := gen_random_uuid();   -- admin, password 8 days ago (stale)
  v_a6  uuid := gen_random_uuid();   -- admin, password 11 minutes ago
  v_a7  uuid := gen_random_uuid();   -- admin, password 1 minute ago (for Lock now)
  v_a8  uuid := gen_random_uuid();   -- admin, password 1 minute ago (Lock now before any touch)
  v_a9  uuid := gen_random_uuid();   -- admin, password 1 minute ago (never touched)
  v_a10 uuid := gen_random_uuid();   -- admin, password 1 minute ago (Change PIN)
  v_a11 uuid := gen_random_uuid();   -- admin, password 1 minute ago (set_my_pin before any touch)
  v_a12 uuid := gen_random_uuid();   -- admin, password 60 minutes ago
  v_a13 uuid := gen_random_uuid();   -- admin, password 1 minute ago, signed out during test 18
  v_ax  uuid := gen_random_uuid();   -- admin, some other device with 4 wrong PINs
  v_d1  uuid := gen_random_uuid();   -- desk, password 60 minutes ago
  v_d2  uuid := gen_random_uuid();   -- desk, password 1 minute ago
  v_dx  uuid := gen_random_uuid();   -- desk, a PIN-locked device

  -- "amr" = how/when this session signed in (unix seconds).
  v_now_s     bigint := extract(epoch from now())::bigint;
  v_amr_1m    jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_11m   jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 11 * 60));
  v_amr_60m   jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60 * 60));
  v_amr_2h    jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 2 * 3600));
  v_amr_8d    jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600));
  v_amr_otp   jsonb := jsonb_build_array(jsonb_build_object('method', 'otp',      'timestamp', v_now_s - 60));

  v_result  text;
  v_until   timestamptz;
  v_bool    boolean;
  v_count   integer;
  v_failed  integer;
  v_idle    integer;
  v_shared  boolean;
  v_role    text;
  v_pin     text;
  v_owner_only boolean;   -- true once 0004 took admin_set_staff_pin away from the app (test 12)
begin
  -- -------------------------------------------------------------------
  -- Setup (as the admin "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  select s.role into v_role from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role into v_role from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;

  -- Test 0: 0002's data step marked the desk row (120 minutes, shared).
  select s.idle_lock_minutes, s.is_shared into v_idle, v_shared from public.staff s where s.id = v_desk;
  if v_idle is distinct from 120 or v_shared is distinct from true then
    raise exception 'TEST FAILED: 0 desk row expected idle 120 + shared, got % + %', v_idle, v_shared;
  end if;

  -- Known starting state (all rolled back): admin 45 min, not shared;
  -- throwaway PINs 2580 (admin) and 1379 (desk); no counters, no unlock rows.
  update public.staff set idle_lock_minutes = 45,  is_shared = false,
         pin_hash = extensions.crypt('2580', extensions.gen_salt('bf', 10)) where id = v_admin;
  update public.staff set idle_lock_minutes = 120, is_shared = true,
         pin_hash = extensions.crypt('1379', extensions.gen_salt('bf', 10)) where id = v_desk;
  delete from public.pin_attempts   where staff_id in (v_admin, v_desk);
  delete from public.session_unlock where staff_id in (v_admin, v_desk);

  -- Make the pretend sessions "real" for Supabase Auth (all except v_a4,
  -- which plays a session that was signed out).
  begin
    insert into auth.sessions (id, user_id)
    select x, v_admin from unnest(array[v_a1, v_a2, v_a3, v_a5, v_a6, v_a7, v_a8, v_a9, v_a10, v_a11, v_a12, v_a13, v_ax]) as x
    union all
    select x, v_desk  from unnest(array[v_d1, v_d2, v_dx]) as x;
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;

  -- Session a3 already hit 5 wrong PINs.
  insert into public.pin_attempts (session_id, staff_id, failed, locked_at)
  values (v_a3, v_admin, 5, now());

  set local role authenticated;   -- from here on we are "the browser"

  -- -------------------------------------------------------------------
  -- Test 1: touch_session -> 'password_required' when it should
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 1a no session_id expected password_required, got %', v_result; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a5, 'amr', v_amr_8d)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 1b 8-day-old sign-in expected password_required, got %', v_result; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_otp)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 1c magic-link session expected password_required, got %', v_result; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 1d no user id expected password_required, got %', v_result; end if;

  reset role;
  update public.staff set active = false where id = v_admin;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 1e inactive staff expected password_required, got %', v_result; end if;
  reset role;
  update public.staff set active = true where id = v_admin;
  -- none of the refused calls may have created an unlock row
  select count(*) into v_count from public.session_unlock where staff_id = v_admin;
  if v_count <> 0 then raise exception 'TEST FAILED: 1f refused touch_session calls created % unlock row(s)', v_count; end if;
  set local role authenticated;

  -- PIN-locked session (a3) -> password_required
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a3, 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 1g PIN-locked session expected password_required, got %', v_result; end if;

  -- signed-out session (a4: not in auth.sessions) -> password_required,
  -- and no unlock row is created for it
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a4, 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 1h signed-out session expected password_required, got %', v_result; end if;
  reset role;
  select count(*) into v_count from public.session_unlock where session_id = v_a4;
  if v_count <> 0 then raise exception 'TEST FAILED: 1i touch_session created an unlock row for a signed-out session'; end if;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 2: fresh password sign-in starts UNLOCKED, counted from the
  --         sign-in time (sign-in + 45 minutes)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'unlocked' then raise exception 'TEST FAILED: 2a fresh sign-in expected unlocked, got %', v_result; end if;
  reset role;
  select unlocked_until into v_until from public.session_unlock where session_id = v_a1;
  if v_until is distinct from to_timestamp(v_now_s - 60) + interval '45 minutes' then
    raise exception 'TEST FAILED: 2b new row expected unlocked_until = sign-in + 45 min, got %', v_until;
  end if;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 3: while unlocked, touch_session pushes the time forward
  -- -------------------------------------------------------------------
  v_result := public.touch_session();
  if v_result is distinct from 'unlocked' then raise exception 'TEST FAILED: 3a second touch expected unlocked, got %', v_result; end if;
  reset role;
  select unlocked_until into v_until from public.session_unlock where session_id = v_a1;
  if v_until is distinct from now() + interval '45 minutes' then
    raise exception 'TEST FAILED: 3b extend expected unlocked_until = now + 45 min, got %', v_until;
  end if;
  -- nearly expired (1 minute left) still extends
  update public.session_unlock set unlocked_until = now() + interval '1 minute' where session_id = v_a1;
  set local role authenticated;
  v_result := public.touch_session();
  if v_result is distinct from 'unlocked' then raise exception 'TEST FAILED: 3c 1 minute left expected unlocked, got %', v_result; end if;
  reset role;
  select unlocked_until into v_until from public.session_unlock where session_id = v_a1;
  if v_until is distinct from now() + interval '45 minutes' then
    raise exception 'TEST FAILED: 3d expected extension to now + 45 min, got %', v_until;
  end if;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 4: a session older than its idle time starts LOCKED, and
  --         touch_session never reopens it
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_2h)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'locked' then raise exception 'TEST FAILED: 4a 2-hour-old sign-in expected locked, got %', v_result; end if;
  v_result := public.touch_session();
  if v_result is distinct from 'locked' then raise exception 'TEST FAILED: 4b second touch on locked session expected locked, got %', v_result; end if;
  reset role;
  select unlocked_until into v_until from public.session_unlock where session_id = v_a2;
  if v_until is distinct from to_timestamp(v_now_s - 2 * 3600) + interval '45 minutes' then
    raise exception 'TEST FAILED: 4c locked row must not move, got %', v_until;
  end if;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 5: an unlocked session whose time has run out is locked
  --         (and stays locked)
  -- -------------------------------------------------------------------
  reset role;
  update public.session_unlock set unlocked_until = now() - interval '1 second' where session_id = v_a1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'locked' then raise exception 'TEST FAILED: 5a expired session expected locked, got %', v_result; end if;
  reset role;
  update public.session_unlock set unlocked_until = now() where session_id = v_a1;   -- exactly "now" = already over
  set local role authenticated;
  v_result := public.touch_session();
  if v_result is distinct from 'locked' then raise exception 'TEST FAILED: 5b time = now expected locked, got %', v_result; end if;
  reset role;
  select unlocked_until into v_until from public.session_unlock where session_id = v_a1;
  if v_until is distinct from now() then raise exception 'TEST FAILED: 5c locked row must not move, got %', v_until; end if;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 6: lock_session ("Lock now" / idle lock)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a7, 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'unlocked' then raise exception 'TEST FAILED: 6a a7 fresh expected unlocked, got %', v_result; end if;
  if not public.has_data_access() then raise exception 'TEST FAILED: 6b a7 unlocked should have data access'; end if;
  perform public.lock_session();
  if public.has_data_access() then raise exception 'TEST FAILED: 6c data access still true right after lock_session'; end if;
  v_result := public.touch_session();
  if v_result is distinct from 'locked' then raise exception 'TEST FAILED: 6d after lock_session expected locked, got %', v_result; end if;

  -- lock_session before the session was ever touched -> row created, locked
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a8, 'amr', v_amr_1m)::text, true);
  perform public.lock_session();
  v_result := public.touch_session();
  if v_result is distinct from 'locked' then raise exception 'TEST FAILED: 6e lock_session before any touch expected locked, got %', v_result; end if;

  -- no session id -> quietly does nothing (no error)
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'amr', v_amr_1m)::text, true);
  perform public.lock_session();

  -- -------------------------------------------------------------------
  -- Test 7: a correct PIN (verify_pin 'ok') unlocks the session on the
  --         server; a wrong PIN does not
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a7, 'amr', v_amr_1m)::text, true);
  v_result := public.verify_pin('0000');
  if v_result is distinct from 'wrong:4' then raise exception 'TEST FAILED: 7a wrong PIN expected wrong:4, got %', v_result; end if;
  v_result := public.touch_session();
  if v_result is distinct from 'locked' then raise exception 'TEST FAILED: 7b after wrong PIN expected locked, got %', v_result; end if;
  v_result := public.verify_pin('2580');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 7c correct PIN expected ok, got %', v_result; end if;
  reset role;
  select unlocked_until into v_until from public.session_unlock where session_id = v_a7;
  if v_until is distinct from now() + interval '45 minutes' then
    raise exception 'TEST FAILED: 7d verify_pin ok expected unlocked_until = now + 45 min, got %', v_until;
  end if;
  set local role authenticated;
  v_result := public.touch_session();
  if v_result is distinct from 'unlocked' then raise exception 'TEST FAILED: 7e after correct PIN expected unlocked, got %', v_result; end if;

  -- the 2-hour-old session (a2, locked from the start) also opens with the PIN
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_2h)::text, true);
  v_result := public.verify_pin('2580');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 7f a2 correct PIN expected ok, got %', v_result; end if;
  v_result := public.touch_session();
  if v_result is distinct from 'unlocked' then raise exception 'TEST FAILED: 7g a2 after correct PIN expected unlocked, got %', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 8: has_data_access - true only when everything is right
  -- -------------------------------------------------------------------
  -- a2 is unlocked, active, password within 7 days, in auth.sessions -> true
  if not public.has_data_access() then raise exception 'TEST FAILED: 8a unlocked a2 expected data access true'; end if;

  -- locked -> false; PIN opens it again -> true
  perform public.lock_session();
  if public.has_data_access() then raise exception 'TEST FAILED: 8b locked a2 expected data access false'; end if;
  v_result := public.verify_pin('2580');
  if not public.has_data_access() then raise exception 'TEST FAILED: 8c a2 after PIN expected data access true (verify_pin said %)', v_result; end if;

  -- inactive staff -> false
  reset role;
  update public.staff set active = false where id = v_admin;
  set local role authenticated;
  if public.has_data_access() then raise exception 'TEST FAILED: 8d INACTIVE staff expected data access false'; end if;
  reset role;
  update public.staff set active = true where id = v_admin;

  -- give the other test sessions an UNLOCKED row directly, so the only
  -- thing wrong with each is the thing being tested
  insert into public.session_unlock (session_id, staff_id, unlocked_until)
  values (v_a3, v_admin, now() + interval '30 minutes'),   -- PIN-locked
         (v_a5, v_admin, now() + interval '30 minutes'),   -- 8-day-old password
         (v_a4, v_admin, now() + interval '30 minutes');   -- not in auth.sessions
  set local role authenticated;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a3, 'amr', v_amr_1m)::text, true);
  if public.has_data_access() then raise exception 'TEST FAILED: 8e PIN-locked session expected data access false'; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a5, 'amr', v_amr_8d)::text, true);
  if public.has_data_access() then raise exception 'TEST FAILED: 8f 8-day-old password expected data access false'; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a4, 'amr', v_amr_1m)::text, true);
  if public.has_data_access() then raise exception 'TEST FAILED: 8g signed-out session (not in auth.sessions) expected data access false'; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_otp)::text, true);
  if public.has_data_access() then raise exception 'TEST FAILED: 8h magic-link session expected data access false'; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a9, 'amr', v_amr_1m)::text, true);
  if public.has_data_access() then raise exception 'TEST FAILED: 8i session never touched (no unlock row) expected data access false'; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'amr', v_amr_1m)::text, true);
  if public.has_data_access() then raise exception 'TEST FAILED: 8j no session_id expected data access false'; end if;

  -- -------------------------------------------------------------------
  -- Test 9: set_my_pin - refusals
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a7, 'amr', v_amr_1m)::text, true);

  foreach v_pin in array array['12a4', '123', '12345', ''] loop
    v_result := public.set_my_pin(v_pin);
    if v_result is distinct from 'invalid' then raise exception 'TEST FAILED: 9a "%" expected invalid, got %', v_pin, v_result; end if;
  end loop;
  v_result := public.set_my_pin(null);
  if v_result is distinct from 'invalid' then raise exception 'TEST FAILED: 9b null expected invalid, got %', v_result; end if;

  foreach v_pin in array array['1111', '0000', '1234', '4321', '0123', '9876', '6789', '3210'] loop
    v_result := public.set_my_pin(v_pin);
    if v_result is distinct from 'too_easy' then raise exception 'TEST FAILED: 9c "%" expected too_easy, got %', v_pin, v_result; end if;
  end loop;

  -- password sign-in 11 minutes ago (more than 10) -> password_required
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a6, 'amr', v_amr_11m)::text, true);
  v_result := public.set_my_pin('2468');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 9d password 11 min ago expected password_required, got %', v_result; end if;

  -- magic-link session -> password_required
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a6, 'amr', v_amr_otp)::text, true);
  v_result := public.set_my_pin('2468');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 9e magic-link expected password_required, got %', v_result; end if;

  -- no session id -> password_required
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'amr', v_amr_1m)::text, true);
  v_result := public.set_my_pin('2468');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 9f no session_id expected password_required, got %', v_result; end if;

  -- PIN-locked session -> password_required
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a3, 'amr', v_amr_1m)::text, true);
  v_result := public.set_my_pin('2468');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 9g PIN-locked session expected password_required, got %', v_result; end if;

  -- session locked on the server (a8, Lock now in test 6) -> password_required,
  -- even though the password was 1 minute ago (no walking past the Lock screen)
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a8, 'amr', v_amr_1m)::text, true);
  v_result := public.set_my_pin('2468');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 9h server-locked session expected password_required, got %', v_result; end if;

  -- none of the refusals changed the admin's PIN
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a7, 'amr', v_amr_1m)::text, true);
  v_result := public.verify_pin('2580');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 9i refused set_my_pin calls changed the PIN (old PIN gave %)', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 10: set_my_pin - the shared desk account
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_desk, 'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text, true);
  v_result := public.set_my_pin('2468');
  if v_result is distinct from 'not_allowed' then raise exception 'TEST FAILED: 10a shared account with a PIN expected not_allowed, got %', v_result; end if;
  v_result := public.verify_pin('1379');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 10b desk PIN must be unchanged after not_allowed, got %', v_result; end if;

  -- no PIN yet (first sign-in) -> the desk may set it once
  reset role;
  update public.staff set pin_hash = null where id = v_desk;
  set local role authenticated;
  v_result := public.set_my_pin('1470');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 10c shared account without a PIN expected ok, got %', v_result; end if;
  v_result := public.set_my_pin('2470');
  if v_result is distinct from 'not_allowed' then raise exception 'TEST FAILED: 10d shared account second set expected not_allowed, got %', v_result; end if;
  v_result := public.verify_pin('1470');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 10e desk new PIN expected ok, got %', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 11: set_my_pin - 'ok' for a normal account
  -- -------------------------------------------------------------------
  reset role;
  -- another admin device ("device B") already has 4 wrong PINs. Changing
  -- the PIN on this device must NOT give it a fresh 5 tries.
  insert into public.pin_attempts (session_id, staff_id, failed) values (v_ax, v_admin, 4);
  set local role authenticated;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a10, 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'unlocked' then raise exception 'TEST FAILED: 11a a10 fresh expected unlocked, got %', v_result; end if;
  v_result := public.verify_pin('0000');   -- one wrong try on THIS device first
  if v_result is distinct from 'wrong:4' then raise exception 'TEST FAILED: 11a2 a10 wrong PIN expected wrong:4, got %', v_result; end if;
  v_result := public.set_my_pin('2468');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 11b set_my_pin expected ok, got %', v_result; end if;

  reset role;
  select a.failed into v_failed from public.pin_attempts a where a.session_id = v_ax;
  if v_failed is distinct from 4 then raise exception 'TEST FAILED: 11c device B had 4 wrong PINs; after set_my_pin on another device expected 4, got %', v_failed; end if;
  select a.failed into v_failed from public.pin_attempts a where a.session_id = v_a10;
  if v_failed is distinct from 0 then raise exception 'TEST FAILED: 11c2 set_my_pin expected THIS session''s count reset to 0, got %', v_failed; end if;
  select count(*) into v_count from public.pin_attempts where session_id = v_a3 and locked_at is not null;
  if v_count <> 1 then raise exception 'TEST FAILED: 11d changing your own PIN must NOT clear a PIN-locked session'; end if;
  select unlocked_until into v_until from public.session_unlock where session_id = v_a10;
  if v_until is distinct from now() + interval '45 minutes' then
    raise exception 'TEST FAILED: 11e set_my_pin ok expected unlocked_until = now + 45 min, got %', v_until;
  end if;
  set local role authenticated;

  v_result := public.verify_pin('2468');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 11f new PIN expected ok, got %', v_result; end if;
  v_result := public.verify_pin('2580');
  if v_result is distinct from 'wrong:4' then raise exception 'TEST FAILED: 11g old PIN expected wrong:4, got %', v_result; end if;
  v_result := public.verify_pin('2468');   -- reset the count again

  -- set_my_pin before the app ever called touch_session -> ok, and the
  -- session is unlocked with data access
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a11, 'amr', v_amr_1m)::text, true);
  v_result := public.set_my_pin('8024');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 11h set_my_pin with no unlock row yet expected ok, got %', v_result; end if;
  if not public.has_data_access() then raise exception 'TEST FAILED: 11i after set_my_pin expected data access true'; end if;
  v_result := public.set_my_pin('2468');   -- back to 2468 for the tests below
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 11j set_my_pin back to 2468 expected ok, got %', v_result; end if;

  -- device B (4 wrong PINs) gets only ONE more try, even after two PIN changes
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_ax, 'amr', v_amr_1m)::text, true);
  v_result := public.verify_pin('0000');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 11k device B 5th wrong PIN expected password_required (locked), got %', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 12: admin_set_staff_pin
  --   Since migration 0004 the app (role authenticated) may no longer call
  --   it - admins reset PINs with admin_reset_pin instead (rulebook v0.74;
  --   tested in 0004_tests.sql). So: once 0004 is applied, first check the
  --   app is refused, then run the rest of this test as the function's
  --   owner with the same pretend login token. The function's own rules
  --   (admin only, not yourself, unlocked, weak PINs, locked devices stay
  --   locked) are still tested either way.
  -- -------------------------------------------------------------------
  v_owner_only := not has_function_privilege('authenticated', 'public.admin_set_staff_pin(uuid, text)', 'execute');
  if not v_owner_only and to_regprocedure('public.admin_reset_pin(uuid, text)') is not null then
    raise exception 'TEST FAILED: 12y 0004 is applied but the app may call admin_set_staff_pin again (0001 or 0002 was re-run?) - run 0004 again';
  end if;
  if v_owner_only then
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a10, 'amr', v_amr_1m)::text, true);
    begin
      perform public.admin_set_staff_pin(v_desk, '8642');
      raise exception 'TEST FAILED: 12z after 0004 the app (authenticated) was still allowed to call admin_set_staff_pin';
    exception
      when insufficient_privilege then null;   -- good: no execute right
    end;
    reset role;
  end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a10, 'amr', v_amr_1m)::text, true);
  if not public.has_data_access() then raise exception 'TEST SETUP: a10 should have data access before test 12'; end if;

  -- on yourself -> refused (use set_my_pin)
  begin
    perform public.admin_set_staff_pin(v_admin, '5802');
    raise exception 'TEST FAILED: 12a admin was allowed to set their OWN PIN';
  exception
    when insufficient_privilege then null;   -- good: refused
  end;

  -- weak PIN -> refused with the agreed message
  begin
    perform public.admin_set_staff_pin(v_desk, '4444');
    raise exception 'TEST FAILED: 12b admin was allowed to set a too-easy PIN';
  exception
    when invalid_parameter_value then
      if sqlerrm <> 'PIN is too easy to guess.' then
        raise exception 'TEST FAILED: 12b expected "PIN is too easy to guess.", got "%"', sqlerrm;
      end if;
  end;

  -- normal case: sets the desk PIN and clears the desk's wrong-PIN counts,
  -- but a desk device that hit 5 wrong PINs (dx) STAYS locked
  reset role;
  insert into public.pin_attempts (session_id, staff_id, failed, locked_at) values (v_dx, v_desk, 5, now());
  insert into public.pin_attempts (session_id, staff_id, failed) values (v_d1, v_desk, 2);
  if not v_owner_only then set local role authenticated; end if;
  perform public.admin_set_staff_pin(v_desk, '8642');
  reset role;
  select count(*) into v_count from public.pin_attempts where session_id = v_d1;
  if v_count <> 0 then raise exception 'TEST FAILED: 12c1 admin reset must clear the desk''s wrong-PIN counts'; end if;
  select count(*) into v_count from public.pin_attempts where session_id = v_dx and locked_at is not null;
  if v_count <> 1 then raise exception 'TEST FAILED: 12c2 admin reset must keep a PIN-locked desk device locked'; end if;
  if not v_owner_only then set local role authenticated; end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_desk, 'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text, true);
  v_result := public.verify_pin('8642');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 12d desk with admin-set PIN expected ok, got %', v_result; end if;
  -- the PIN-locked desk device is refused even with the NEW PIN
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_desk, 'role', 'authenticated', 'session_id', v_dx, 'amr', v_amr_1m)::text, true);
  v_result := public.verify_pin('8642');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 12c3 PIN-locked desk device with the new PIN expected password_required, got %', v_result; end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_desk, 'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text, true);

  -- the desk (not an admin) -> refused
  begin
    perform public.admin_set_staff_pin(v_admin, '5802');
    raise exception 'TEST FAILED: 12e non-admin was allowed to set a PIN';
  exception
    when insufficient_privilege then null;
  end;

  -- admin whose session is LOCKED -> refused
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a10, 'amr', v_amr_1m)::text, true);
  perform public.lock_session();
  begin
    perform public.admin_set_staff_pin(v_desk, '5802');
    raise exception 'TEST FAILED: 12f admin with a LOCKED session was allowed to set a PIN';
  exception
    when insufficient_privilege then null;
  end;

  -- admin with an 8-day-old password -> refused
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a5, 'amr', v_amr_8d)::text, true);
  begin
    perform public.admin_set_staff_pin(v_desk, '5802');
    raise exception 'TEST FAILED: 12g admin with a stale password was allowed to set a PIN';
  exception
    when insufficient_privilege then null;
  end;

  set local role authenticated;   -- (back to "the browser" for the next tests)

  -- -------------------------------------------------------------------
  -- Test 13: is_admin() needs a password sign-in within 7 days
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text, true);
  if not public.is_admin() then raise exception 'TEST FAILED: 13a admin with fresh password expected is_admin true'; end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a5, 'amr', v_amr_8d)::text, true);
  if public.is_admin() then raise exception 'TEST FAILED: 13b admin with 8-day-old password expected is_admin false'; end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_otp)::text, true);
  if public.is_admin() then raise exception 'TEST FAILED: 13c admin magic-link session expected is_admin false'; end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_desk, 'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text, true);
  if public.is_admin() then raise exception 'TEST FAILED: 13d desk expected is_admin false'; end if;

  -- -------------------------------------------------------------------
  -- Test 14: get_my_profile returns the new columns
  -- -------------------------------------------------------------------
  select p.idle_lock_minutes, p.is_shared into v_idle, v_shared from public.get_my_profile() p;
  if v_idle is distinct from 120 or v_shared is distinct from true then
    raise exception 'TEST FAILED: 14a desk profile expected 120 + shared, got % + %', v_idle, v_shared;
  end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text, true);
  select p.idle_lock_minutes, p.is_shared into v_idle, v_shared from public.get_my_profile() p;
  if v_idle is distinct from 45 or v_shared is distinct from false then
    raise exception 'TEST FAILED: 14b admin profile expected 45 + not shared, got % + %', v_idle, v_shared;
  end if;

  -- -------------------------------------------------------------------
  -- Test 15: idle time is per account (desk 120 min, admin 45 min)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_desk, 'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_60m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'unlocked' then raise exception 'TEST FAILED: 15a desk signed in 60 min ago (120 min idle) expected unlocked, got %', v_result; end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a12, 'amr', v_amr_60m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'locked' then raise exception 'TEST FAILED: 15b admin signed in 60 min ago (45 min idle) expected locked, got %', v_result; end if;

  reset role;
  begin
    update public.staff set idle_lock_minutes = 4 where id = v_admin;
    raise exception 'TEST FAILED: 15c idle_lock_minutes = 4 was allowed (minimum is 5)';
  exception
    when check_violation then null;
  end;
  begin
    update public.staff set idle_lock_minutes = 481 where id = v_admin;
    raise exception 'TEST FAILED: 15d idle_lock_minutes = 481 was allowed (maximum is 480)';
  exception
    when check_violation then null;
  end;

  -- -------------------------------------------------------------------
  -- Test 16: old unlock rows (8+ days untouched) are cleaned up
  -- -------------------------------------------------------------------
  insert into public.session_unlock (session_id, staff_id, unlocked_until, updated_at)
  values (gen_random_uuid(), v_admin, now() - interval '9 days', now() - interval '9 days');
  set local role authenticated;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();   -- any valid touch triggers cleanup
  reset role;
  select count(*) into v_count from public.session_unlock where updated_at < now() - interval '8 days';
  if v_count <> 0 then raise exception 'TEST FAILED: 16 old session_unlock rows were not cleaned up'; end if;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 17: what the browser must NOT be able to do
  -- -------------------------------------------------------------------
  begin
    perform u.unlocked_until from public.session_unlock u;
    raise exception 'TEST FAILED: 17a reading session_unlock was allowed';
  exception
    when insufficient_privilege then null;
  end;
  begin
    update public.session_unlock set unlocked_until = now() + interval '1 day';
    raise exception 'TEST FAILED: 17b changing session_unlock was allowed';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform s.idle_lock_minutes from public.staff s;   -- not granted; read it through get_my_profile
    raise exception 'TEST FAILED: 17c reading staff.idle_lock_minutes directly was allowed';
  exception
    when insufficient_privilege then null;
  end;
  begin
    update public.staff set idle_lock_minutes = 480 where id = v_admin;
    raise exception 'TEST FAILED: 17d changing own idle time was allowed';
  exception
    when insufficient_privilege then null;
  end;
  -- internal helpers: calling mark_session_unlocked directly would skip the PIN
  begin
    perform public.mark_session_unlocked(v_a1, v_admin);
    raise exception 'TEST FAILED: 17e browser could call mark_session_unlocked';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.clear_pin_attempts_for(v_admin, false);
    raise exception 'TEST FAILED: 17f browser could call clear_pin_attempts_for';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.cleanup_session_unlock();
    raise exception 'TEST FAILED: 17g browser could call cleanup_session_unlock';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.session_is_pin_locked(v_a1);
    raise exception 'TEST FAILED: 17h browser could call session_is_pin_locked';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.pin_is_too_easy('1234');
    raise exception 'TEST FAILED: 17i browser could call pin_is_too_easy';
  exception
    when insufficient_privilege then null;
  end;

  -- visitors who are NOT signed in (anon) can call none of the new functions
  set local role anon;
  begin
    perform public.touch_session();
    raise exception 'TEST FAILED: 17j anon could call touch_session';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.lock_session();
    raise exception 'TEST FAILED: 17k anon could call lock_session';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.has_data_access();
    raise exception 'TEST FAILED: 17l anon could call has_data_access';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.set_my_pin('2468');
    raise exception 'TEST FAILED: 17m anon could call set_my_pin';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform * from public.get_my_profile();
    raise exception 'TEST FAILED: 17n anon could call get_my_profile';
  exception
    when insufficient_privilege then null;
  end;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 18: a session that is signed out (removed from auth.sessions)
  --          while its login token still works is refused everywhere,
  --          and a PIN typed there is NOT counted
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a13, 'amr', v_amr_1m)::text, true);
  v_result := public.touch_session();
  if v_result is distinct from 'unlocked' then raise exception 'TEST FAILED: 18a a13 fresh expected unlocked, got %', v_result; end if;

  reset role;
  delete from auth.sessions where id = v_a13;   -- "Sign out" on Supabase's side
  select unlocked_until into v_until from public.session_unlock where session_id = v_a13;
  set local role authenticated;

  v_result := public.touch_session();
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 18b signed-out session touch expected password_required, got %', v_result; end if;
  if public.has_data_access() then raise exception 'TEST FAILED: 18c signed-out session expected data access false'; end if;
  v_result := public.verify_pin('0000');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 18d signed-out session wrong PIN expected password_required, got %', v_result; end if;
  v_result := public.verify_pin('2468');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 18e signed-out session correct PIN expected password_required, got %', v_result; end if;
  v_result := public.set_my_pin('1357');
  if v_result is distinct from 'password_required' then raise exception 'TEST FAILED: 18f signed-out session set_my_pin expected password_required, got %', v_result; end if;

  reset role;
  select count(*) into v_count from public.pin_attempts where session_id = v_a13;
  if v_count <> 0 then raise exception 'TEST FAILED: 18g PIN tries on a signed-out session were counted (% row(s))', v_count; end if;
  if (select u.unlocked_until from public.session_unlock u where u.session_id = v_a13) is distinct from v_until then
    raise exception 'TEST FAILED: 18h touch_session on a signed-out session moved its unlock time';
  end if;
  set local role authenticated;
  -- the admin's PIN is still 2468 (set_my_pin above changed nothing)
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a7, 'amr', v_amr_1m)::text, true);
  v_result := public.verify_pin('2468');
  if v_result is distinct from 'ok' then raise exception 'TEST FAILED: 18i admin PIN changed by a signed-out session (2468 gave %)', v_result; end if;

  -- -------------------------------------------------------------------
  -- Test 19: staff read rule - an admin sees the other staff rows only
  --          while unlocked; locked (or PIN-locked) = own row only
  --          (only the two test rows are counted, so other real staff
  --          rows don't matter)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a11, 'amr', v_amr_1m)::text, true);
  if not public.has_data_access() then raise exception 'TEST SETUP: a11 should have data access before test 19'; end if;
  select count(s.id) into v_count from public.staff s where s.id in (v_admin, v_desk);
  if v_count <> 2 then raise exception 'TEST FAILED: 19a unlocked admin expected to see 2 staff rows, saw %', v_count; end if;

  perform public.lock_session();
  select count(s.id) into v_count from public.staff s where s.id in (v_admin, v_desk);
  if v_count <> 1 then raise exception 'TEST FAILED: 19b LOCKED admin expected to see only 1 staff row (own), saw %', v_count; end if;
  select count(s.id) into v_count from public.staff s where s.id = v_admin;
  if v_count <> 1 then raise exception 'TEST FAILED: 19c LOCKED admin must still see their OWN row'; end if;

  v_result := public.verify_pin('2468');
  select count(s.id) into v_count from public.staff s where s.id in (v_admin, v_desk);
  if v_count <> 2 then raise exception 'TEST FAILED: 19d admin unlocked again with the PIN (%) expected to see 2 rows, saw %', v_result, v_count; end if;

  -- PIN-locked admin session (a3) -> own row only
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a3, 'amr', v_amr_1m)::text, true);
  select count(s.id) into v_count from public.staff s where s.id in (v_admin, v_desk);
  if v_count <> 1 then raise exception 'TEST FAILED: 19e PIN-locked admin session expected to see 1 staff row, saw %', v_count; end if;

  -- the desk (not an admin), unlocked -> own row only
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_desk, 'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text, true);
  if not public.has_data_access() then raise exception 'TEST SETUP: d2 should have data access in test 19'; end if;
  select count(s.id) into v_count from public.staff s where s.id in (v_admin, v_desk);
  if v_count <> 1 then raise exception 'TEST FAILED: 19f desk (not admin) expected to see 1 staff row, saw %', v_count; end if;

  reset role;
end;
$$;

select 'ALL 0002 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
