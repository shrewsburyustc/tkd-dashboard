-- =====================================================================
-- 0004_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0004_staff_accounts.sql (Staff
--   accounts: admin_list_staff, admin_reset_password, admin_reset_pin, and
--   admin_set_staff_pin no longer callable by the app). It checks who is
--   refused, that every refusal changes nothing, what a successful reset
--   really does (new password works, emailed links gone, signed out
--   everywhere, nobody else touched, history written WITHOUT the
--   password), and the call rights on every 0004 function.
--   Run it yourself in the Supabase SQL Editor AFTER 0004 is applied.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change. It makes its OWN throwaway
--   logins ("zz-test-...@example.com") and never touches the real
--   accounts, their passwords, PINs or sign-ins.
--   NEVER change the final "rollback;" to "commit;".
--   If anything fails, the transaction stops and nothing is kept.
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0002_tests.sql (read its header for the details):
--     set local role authenticated            -> "I am the browser"
--     set_config('request.jwt.claims', ...)   -> "this is my login token"
--   The pretend logins, sign-ins (auth.sessions), refresh tokens, emailed
--   links (auth.one_time_tokens) and sign-in codes (auth.flow_state) are
--   added as "postgres" at the start, like the earlier test files do with
--   auth.sessions. If that step fails you get a "TEST SETUP" error - tell
--   Claude (it means Supabase changed one of its tables).
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0004 TESTS PASSED".
--   * Failed: an error starting with "TEST FAILED:" (or "TEST SETUP:")
--     saying which check broke. Nothing was saved either way. Then run
--     rollback;   on its own once.
-- =====================================================================

begin;

do $$
declare
  v_tag  text := substr(md5(random()::text), 1, 8);   -- makes the test emails unique

  -- Pretend logins (all thrown away by the rollback)
  v_a    uuid := gen_random_uuid();   -- admin doing the resets ("the caller")
  v_a2   uuid := gen_random_uuid();   -- a second admin (target: admin resets admin)
  v_t    uuid := gen_random_uuid();   -- shared desk-like staff account (main target)
  v_s    uuid := gen_random_uuid();   -- plain staff (refused caller; PIN target)
  v_x    uuid := gen_random_uuid();   -- a login with NO staff row
  v_i    uuid := gen_random_uuid();   -- inactive staff
  v_b    uuid := gen_random_uuid();   -- banned login
  v_del  uuid := gen_random_uuid();   -- deleted login

  -- Pretend sign-ins (sessions)
  sa1    uuid := gen_random_uuid();   -- caller: password 1 min ago, unlocked
  sa_old uuid := gen_random_uuid();   -- caller: password 11 min ago, unlocked
  sa_lck uuid := gen_random_uuid();   -- caller: locked on the server
  sa_pin uuid := gen_random_uuid();   -- caller: hit 5 wrong PINs
  sa_out uuid := gen_random_uuid();   -- caller: signed out (NOT in auth.sessions)
  sa_8d  uuid := gen_random_uuid();   -- caller: password 8 days ago
  sa2_1  uuid := gen_random_uuid();   -- second admin, unlocked (signed out by the reset)
  st1    uuid := gen_random_uuid();   -- desk device 1
  st2    uuid := gen_random_uuid();   -- desk device 2
  st3    uuid := gen_random_uuid();   -- desk device 3
  ss1    uuid := gen_random_uuid();   -- plain staff, unlocked, 2 wrong PINs
  ss2    uuid := gen_random_uuid();   -- plain staff, hit 5 wrong PINs

  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_11m jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 11 * 60));
  v_amr_8d  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600));
  v_amr_otp jsonb := jsonb_build_array(jsonb_build_object('method', 'otp',      'timestamp', v_now_s - 60));

  v_pw_new  text := 'plum-ladder-quiet-river';   -- the new desk password used below
  v_r       jsonb;
  v_text    text;
  v_snap    text;
  v_snap2   text;
  v_count   integer;
  v_log     integer;
  v_hash    text;
  v_bool    boolean;
  v_ids     uuid[];
  v_fn      text;
begin
  -- -------------------------------------------------------------------
  -- Setup (as "postgres", the SQL Editor's role)
  -- -------------------------------------------------------------------
  begin
    insert into auth.users (id, email, encrypted_password, confirmation_token, recovery_token,
                            email_change_token_new, email_change, email_change_token_current,
                            email_change_confirm_status, reauthentication_token, phone_change_token,
                            banned_until, deleted_at)
    values
      (v_a,   'zz-test-' || v_tag || '-a@example.com',   extensions.crypt('caller-old-password', extensions.gen_salt('bf', 10)), '', 'caller-recovery', '', '', '', 0, '', '', null, null),
      (v_a2,  'zz-test-' || v_tag || '-a2@example.com',  extensions.crypt('admin2-old-password', extensions.gen_salt('bf', 10)), '', '', '', '', '', 0, '', '', null, null),
      (v_t,   'zz-test-' || v_tag || '-t@example.com',   extensions.crypt('desk-old-password-1', extensions.gen_salt('bf', 10)),
               'conf-tok', 'recov-tok', 'chg-new-tok', 'attacker@example.com', 'chg-cur-tok', 1, 'reauth-tok', 'phone-tok', null, null),
      (v_s,   'zz-test-' || v_tag || '-s@example.com',   extensions.crypt('staff-old-password', extensions.gen_salt('bf', 10)), '', '', '', '', '', 0, '', '', null, null),
      (v_x,   'zz-test-' || v_tag || '-x@example.com',   null, '', '', '', '', '', 0, '', '', null, null),
      (v_i,   'zz-test-' || v_tag || '-i@example.com',   null, '', '', '', '', '', 0, '', '', null, null),
      (v_b,   'zz-test-' || v_tag || '-b@example.com',   null, '', '', '', '', '', 0, '', '', now() + interval '1 day', null),
      (v_del, 'zz-test-' || v_tag || '-del@example.com', null, '', '', '', '', '', 0, '', '', null, now());

    insert into public.staff (id, full_name, email, role, active, is_shared) values
      (v_a,   'zz test ' || v_tag || ' 1 caller', 'zz-test-' || v_tag || '-a@example.com',   'admin', true,  false),
      (v_a2,  'zz test ' || v_tag || ' 2 admin',  'zz-test-' || v_tag || '-a2@example.com',  'admin', true,  false),
      (v_t,   'zz test ' || v_tag || ' desk',     'zz-test-' || v_tag || '-t@example.com',   'staff', true,  true),
      (v_s,   'zz test ' || v_tag || ' staff',    'zz-test-' || v_tag || '-s@example.com',   'staff', true,  false),
      (v_i,   'zz test ' || v_tag || ' inactive', 'zz-test-' || v_tag || '-i@example.com',   'staff', false, false),
      (v_b,   'zz test ' || v_tag || ' banned',   'zz-test-' || v_tag || '-b@example.com',   'staff', true,  false),
      (v_del, 'zz test ' || v_tag || ' deleted',  'zz-test-' || v_tag || '-del@example.com', 'staff', true,  false);
    update public.staff set pin_hash = extensions.crypt('1379', extensions.gen_salt('bf', 10)) where id in (v_t, v_s);

    insert into auth.sessions (id, user_id) values
      (sa1, v_a), (sa_old, v_a), (sa_lck, v_a), (sa_pin, v_a), (sa_8d, v_a),
      (sa2_1, v_a2), (st1, v_t), (st2, v_t), (st3, v_t), (ss1, v_s), (ss2, v_s);

    -- refresh tokens: two desk devices + one desk token without a session,
    -- and one for the caller (must survive)
    insert into auth.refresh_tokens (token, user_id, revoked, session_id) values
      ('zz-' || v_tag || '-rt1', v_t::text, false, st1),
      ('zz-' || v_tag || '-rt2', v_t::text, false, st2),
      ('zz-' || v_tag || '-rt0', v_t::text, false, null),
      ('zz-' || v_tag || '-rta', v_a::text, false, sa1);

    -- emailed links: two for the desk, one for the caller (must survive)
    insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to) values
      (gen_random_uuid(), v_t, 'recovery_token',         'zz-' || v_tag || '-h1', 'zz-test-' || v_tag || '-t@example.com'),
      (gen_random_uuid(), v_t, 'email_change_token_new', 'zz-' || v_tag || '-h2', 'attacker@example.com'),
      (gen_random_uuid(), v_a, 'recovery_token',         'zz-' || v_tag || '-h3', 'zz-test-' || v_tag || '-a@example.com');

    -- a half-finished sign-in code for the desk, and one for the caller
    insert into auth.flow_state (id, user_id, auth_code, provider_type, authentication_method) values
      (gen_random_uuid(), v_t, 'zz-' || v_tag || '-code1', 'email', 'magiclink'),
      (gen_random_uuid(), v_a, 'zz-' || v_tag || '-code2', 'email', 'magiclink');
  exception
    when others then
      raise exception 'TEST SETUP: could not create the throwaway logins / sign-ins (%). Tell Claude.', sqlerrm;
  end;

  -- server lock records: unlocked for 45 minutes, except sa_lck (locked)
  insert into public.session_unlock (session_id, staff_id, unlocked_until)
  select x, y, now() + interval '45 minutes'
    from (values (sa1, v_a), (sa_old, v_a), (sa_pin, v_a), (sa_out, v_a), (sa_8d, v_a),
                 (sa2_1, v_a2), (st1, v_t), (st2, v_t), (st3, v_t), (ss1, v_s), (ss2, v_s)) as v(x, y);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values (sa_lck, v_a, now() - interval '1 minute');

  -- wrong-PIN counters: sa_pin and ss2 hit 5; ss1 has 2
  insert into public.pin_attempts (session_id, staff_id, failed, locked_at) values
    (sa_pin, v_a, 5, now()), (ss2, v_s, 5, now());
  insert into public.pin_attempts (session_id, staff_id, failed) values (ss1, v_s, 2);

  -- "snapshot" of everything a reset could change, to prove refusals change nothing
  v_snap := md5(concat_ws('|',
    (select string_agg(to_jsonb(u)::text, ',' order by u.id) from auth.users u where u.id in (v_a, v_a2, v_t, v_s, v_x, v_i, v_b, v_del)),
    (select string_agg(s.id::text, ',' order by s.id) from auth.sessions s where s.user_id in (v_a, v_a2, v_t, v_s, v_x, v_i, v_b, v_del)),
    (select count(*) from auth.one_time_tokens where user_id in (v_a, v_t)),
    (select count(*) from auth.flow_state      where user_id in (v_a, v_t)),
    (select count(*) from auth.refresh_tokens  where user_id in (v_a::text, v_t::text)),
    (select string_agg(coalesce(s.pin_hash, '-'), ',' order by s.id) from public.staff s where s.id in (v_a, v_a2, v_t, v_s, v_i, v_b, v_del)),
    (select count(*) from public.pin_attempts  where staff_id in (v_a, v_s)),
    (select count(*) from public.change_log)));
  select count(*) into v_log from public.change_log;

  -- -------------------------------------------------------------------
  -- Test 1: visitors (anon) can't call any 0004 function at all
  -- -------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '', true);
  foreach v_fn in array array['list', 'password', 'pin'] loop
    begin
      if v_fn = 'list' then perform public.admin_list_staff();
      elsif v_fn = 'password' then perform public.admin_reset_password(v_t, v_pw_new);
      else perform public.admin_reset_pin(v_t, '4719');
      end if;
      raise exception 'TEST FAILED: 1 anon was allowed to call the % function', v_fn;
    exception
      when insufficient_privilege then null;   -- good: no execute right
    end;
  end loop;
  reset role;

  set local role authenticated;   -- from here on we are "the browser"

  -- -------------------------------------------------------------------
  -- Test 2: refused callers -> not_allowed / password_required, for all three
  -- -------------------------------------------------------------------
  -- 2a plain staff
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_s, 'role', 'authenticated', 'session_id', ss1, 'amr', v_amr_1m)::text, true);
  if public.admin_list_staff()->>'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: 2a staff list expected not_allowed'; end if;
  v_r := public.admin_reset_password(v_t, v_pw_new);
  if v_r->>'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: 2a staff reset password expected not_allowed, got %', v_r; end if;
  v_r := public.admin_reset_pin(v_t, '4719');
  if v_r->>'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: 2a staff reset PIN expected not_allowed, got %', v_r; end if;

  -- 2b-2f the admin, but with a bad session
  foreach v_fn in array array['locked', 'pinlocked', 'signedout', 'stale', 'otp', 'nosession'] loop
    perform set_config('request.jwt.claims',
      case v_fn
        when 'locked'    then jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa_lck, 'amr', v_amr_1m)
        when 'pinlocked' then jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa_pin, 'amr', v_amr_1m)
        when 'signedout' then jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa_out, 'amr', v_amr_1m)
        when 'stale'     then jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa_8d,  'amr', v_amr_8d)
        when 'otp'       then jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa1,    'amr', v_amr_otp)
        else                  jsonb_build_object('sub', v_a, 'role', 'authenticated', 'amr', v_amr_1m)
      end::text, true);
    if public.admin_list_staff()->>'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: 2 % admin session: list expected not_allowed', v_fn; end if;
    v_r := public.admin_reset_password(v_t, v_pw_new);
    if v_r->>'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: 2 % admin session: reset password expected not_allowed, got %', v_fn, v_r; end if;
    v_r := public.admin_reset_pin(v_t, '4719');
    if v_r->>'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: 2 % admin session: reset PIN expected not_allowed, got %', v_fn, v_r; end if;
  end loop;

  -- 2g password sign-in 11 minutes ago: the list works, resets ask for the password again
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa_old, 'amr', v_amr_11m)::text, true);
  if public.admin_list_staff()->>'status' is distinct from 'ok' then raise exception 'TEST FAILED: 2g list with an 11-minute-old password expected ok'; end if;
  v_r := public.admin_reset_password(v_t, v_pw_new);
  if v_r->>'status' is distinct from 'password_required' then raise exception 'TEST FAILED: 2g reset password, 11-minute-old password expected password_required, got %', v_r; end if;
  v_r := public.admin_reset_pin(v_t, '4719');
  if v_r->>'status' is distinct from 'password_required' then raise exception 'TEST FAILED: 2g reset PIN, 11-minute-old password expected password_required, got %', v_r; end if;

  -- -------------------------------------------------------------------
  -- Test 3: the admin with a good session, but bad requests
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa1, 'amr', v_amr_1m)::text, true);
  if not public.has_data_access() then raise exception 'TEST SETUP: the caller session sa1 should have data access'; end if;

  -- 3a missing arguments
  if public.admin_reset_password(null, v_pw_new)->>'status' is distinct from 'invalid' then raise exception 'TEST FAILED: 3a NULL staff id expected invalid'; end if;
  if public.admin_reset_password(v_t, null)->>'status' is distinct from 'invalid' then raise exception 'TEST FAILED: 3a NULL password expected invalid'; end if;
  if public.admin_reset_pin(null, '4719')->>'status' is distinct from 'invalid' then raise exception 'TEST FAILED: 3a NULL staff id (PIN) expected invalid'; end if;
  if public.admin_reset_pin(v_t, null)->>'status' is distinct from 'invalid' then raise exception 'TEST FAILED: 3a NULL PIN expected invalid'; end if;

  -- 3b yourself
  if public.admin_reset_password(v_a, v_pw_new)->>'status' is distinct from 'own_account' then raise exception 'TEST FAILED: 3b own password expected own_account'; end if;
  if public.admin_reset_pin(v_a, '4719')->>'status' is distinct from 'own_account' then raise exception 'TEST FAILED: 3b own PIN expected own_account'; end if;

  -- 3c no such / not a working dashboard account
  foreach v_text in array array[gen_random_uuid()::text, v_x::text, v_i::text, v_b::text, v_del::text] loop
    if public.admin_reset_password(v_text::uuid, v_pw_new)->>'status' is distinct from 'not_found' then
      raise exception 'TEST FAILED: 3c reset password for % expected not_found', v_text; end if;
    if public.admin_reset_pin(v_text::uuid, '4719')->>'status' is distinct from 'not_found' then
      raise exception 'TEST FAILED: 3c reset PIN for % expected not_found', v_text; end if;
  end loop;

  -- 3d password length: 11 characters too short; 73 bytes too long;
  --    37 x "é" = 37 characters but 74 bytes -> too long
  if public.admin_reset_password(v_t, 'abcdefghijk')->>'status' is distinct from 'too_short' then raise exception 'TEST FAILED: 3d 11 characters expected too_short'; end if;
  if public.admin_reset_password(v_t, repeat('a', 73))->>'status' is distinct from 'too_long' then raise exception 'TEST FAILED: 3d 73 bytes expected too_long'; end if;
  if public.admin_reset_password(v_t, repeat('é', 37))->>'status' is distinct from 'too_long' then raise exception 'TEST FAILED: 3d 74 bytes (37 x é) expected too_long'; end if;

  -- 3e PINs
  foreach v_text in array array['123', '12345', '12a4', ' 123', ''] loop
    if public.admin_reset_pin(v_t, v_text)->>'status' is distinct from 'invalid' then raise exception 'TEST FAILED: 3e PIN "%" expected invalid', v_text; end if;
  end loop;
  foreach v_text in array array['1111', '1234', '4321', '0123', '9876'] loop
    if public.admin_reset_pin(v_t, v_text)->>'status' is distinct from 'too_easy' then raise exception 'TEST FAILED: 3e PIN % expected too_easy', v_text; end if;
  end loop;

  -- -------------------------------------------------------------------
  -- Test 4: none of the refusals above changed anything
  -- -------------------------------------------------------------------
  reset role;
  v_snap2 := md5(concat_ws('|',
    (select string_agg(to_jsonb(u)::text, ',' order by u.id) from auth.users u where u.id in (v_a, v_a2, v_t, v_s, v_x, v_i, v_b, v_del)),
    (select string_agg(s.id::text, ',' order by s.id) from auth.sessions s where s.user_id in (v_a, v_a2, v_t, v_s, v_x, v_i, v_b, v_del)),
    (select count(*) from auth.one_time_tokens where user_id in (v_a, v_t)),
    (select count(*) from auth.flow_state      where user_id in (v_a, v_t)),
    (select count(*) from auth.refresh_tokens  where user_id in (v_a::text, v_t::text)),
    (select string_agg(coalesce(s.pin_hash, '-'), ',' order by s.id) from public.staff s where s.id in (v_a, v_a2, v_t, v_s, v_i, v_b, v_del)),
    (select count(*) from public.pin_attempts  where staff_id in (v_a, v_s)),
    (select count(*) from public.change_log)));
  if v_snap2 is distinct from v_snap then raise exception 'TEST FAILED: 4 a refused call changed something (passwords, tokens, sessions, PINs, counters or history)'; end if;
  set local role authenticated;

  -- -------------------------------------------------------------------
  -- Test 5: admin_list_staff
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa1, 'amr', v_amr_1m)::text, true);
  v_r := public.admin_list_staff();
  if v_r->>'status' is distinct from 'ok' then raise exception 'TEST FAILED: 5a list expected ok, got %', v_r->>'status'; end if;
  -- only these six facts, for every account
  if exists (select 1 from jsonb_array_elements(v_r->'accounts') e
              where (select array_agg(k order by k) from jsonb_object_keys(e) k)
                    is distinct from array['email', 'full_name', 'id', 'is_me', 'is_shared', 'role']) then
    raise exception 'TEST FAILED: 5b every account must have exactly id, full_name, email, role, is_shared, is_me';
  end if;
  -- inactive accounts are left out; the test accounts are in
  select array_agg((e->>'id')::uuid order by o) into v_ids
    from jsonb_array_elements(v_r->'accounts') with ordinality as x(e, o)
   where (e->>'id')::uuid in (v_a, v_a2, v_t, v_s, v_i);
  if v_i = any (v_ids) then raise exception 'TEST FAILED: 5c inactive account listed'; end if;
  -- order: admins (A-Z) -> staff -> shared:  caller, admin 2, staff, desk
  if v_ids is distinct from array[v_a, v_a2, v_s, v_t] then raise exception 'TEST FAILED: 5d order expected caller, admin 2, staff, desk; got %', v_ids; end if;
  -- is_me / is_shared
  if not exists (select 1 from jsonb_array_elements(v_r->'accounts') e where (e->>'id')::uuid = v_a and (e->>'is_me')::boolean) then raise exception 'TEST FAILED: 5e caller not marked is_me'; end if;
  if exists (select 1 from jsonb_array_elements(v_r->'accounts') e where (e->>'id')::uuid <> v_a and (e->>'is_me')::boolean) then raise exception 'TEST FAILED: 5e someone else marked is_me'; end if;
  if not exists (select 1 from jsonb_array_elements(v_r->'accounts') e where (e->>'id')::uuid = v_t and (e->>'is_shared')::boolean) then raise exception 'TEST FAILED: 5f desk not marked is_shared'; end if;

  -- -------------------------------------------------------------------
  -- Test 6: reset the desk's password
  -- -------------------------------------------------------------------
  v_r := public.admin_reset_password(v_t, v_pw_new);
  if v_r->>'status' is distinct from 'ok' then raise exception 'TEST FAILED: 6a reset desk password expected ok, got %', v_r; end if;
  if (v_r->>'devices_signed_out')::int is distinct from 3 then raise exception 'TEST FAILED: 6b expected 3 desk devices signed out, got %', v_r->>'devices_signed_out'; end if;
  if v_r ? 'password' or v_r::text like '%' || v_pw_new || '%' then raise exception 'TEST FAILED: 6c the reply contains the password'; end if;

  reset role;
  select u.encrypted_password into v_hash from auth.users u where u.id = v_t;
  if v_hash not like '$2a$10$%' then raise exception 'TEST FAILED: 6d hash is not bcrypt cost 10 ($2a$10$...)'; end if;
  if extensions.crypt(v_pw_new, v_hash) is distinct from v_hash then raise exception 'TEST FAILED: 6e the new password does not match the saved hash'; end if;
  if extensions.crypt('desk-old-password-1', v_hash) = v_hash then raise exception 'TEST FAILED: 6f the OLD password still matches'; end if;
  select count(*) into v_count from auth.users u
   where u.id = v_t
     and u.recovery_token = '' and u.reauthentication_token = '' and u.confirmation_token = ''
     and u.email_change_token_new = '' and u.email_change_token_current = '' and u.email_change = ''
     and u.email_change_confirm_status = 0 and u.phone_change_token = '';
  if v_count <> 1 then raise exception 'TEST FAILED: 6g not every emailed/texted token column was emptied'; end if;
  select count(*) into v_count from auth.one_time_tokens where user_id = v_t;
  if v_count <> 0 then raise exception 'TEST FAILED: 6h % emailed link(s) left for the desk', v_count; end if;
  select count(*) into v_count from auth.flow_state where user_id = v_t;
  if v_count <> 0 then raise exception 'TEST FAILED: 6i % sign-in code(s) left for the desk', v_count; end if;
  select count(*) into v_count from auth.sessions where user_id = v_t;
  if v_count <> 0 then raise exception 'TEST FAILED: 6j % desk sign-in(s) left', v_count; end if;
  select count(*) into v_count from auth.refresh_tokens where user_id = v_t::text;
  if v_count <> 0 then raise exception 'TEST FAILED: 6k % desk refresh token(s) left (incl. the one without a session)', v_count; end if;
  -- nobody else touched: the caller keeps sessions, tokens, links, codes and password
  select count(*) into v_count from auth.sessions where user_id = v_a;
  if v_count <> 5 then raise exception 'TEST FAILED: 6l the caller lost sign-ins (expected 5, got %)', v_count; end if;
  if (select count(*) from auth.refresh_tokens where user_id = v_a::text) <> 1
     or (select count(*) from auth.one_time_tokens where user_id = v_a) <> 1
     or (select count(*) from auth.flow_state where user_id = v_a) <> 1
     or (select recovery_token from auth.users where id = v_a) is distinct from 'caller-recovery'
     or (select extensions.crypt('caller-old-password', encrypted_password) = encrypted_password from auth.users where id = v_a) is not true then
    raise exception 'TEST FAILED: 6m the reset changed the CALLER''s own login data';
  end if;
  if (select count(*) from auth.sessions where user_id in (v_a2, v_s)) <> 3 then raise exception 'TEST FAILED: 6n other people were signed out'; end if;
  -- history: exactly one row, without the password
  select count(*) into v_count from public.change_log
   where action = 'admin_reset_password' and record_id = v_t and actor_id = v_a and op = 'update'
     and table_name = 'staff' and session_id = sa1
     and after = jsonb_build_object('password', 'reset', 'devices_signed_out', 3);
  if v_count <> 1 then raise exception 'TEST FAILED: 6o expected one change_log row for the reset, found %', v_count; end if;
  if (select count(*) from public.change_log) <> v_log + 1 then raise exception 'TEST FAILED: 6p expected exactly one new change_log row'; end if;
  -- (only the rows THIS test wrote - by the throwaway caller - are searched: older history,
  -- e.g. the seed, is full of random ids that could match a short text by chance)
  select count(*) into v_count from public.change_log
   where actor_id = v_a
     and coalesce(before::text, '') || coalesce(after::text, '') like '%' || v_pw_new || '%';
  if v_count <> 0 then raise exception 'TEST FAILED: 6q the password appears in change_log'; end if;
  set local role authenticated;

  -- 6r the desk's OLD sign-in (st1) is refused straight away
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_t, 'role', 'authenticated', 'session_id', st1, 'amr', v_amr_1m)::text, true);
  if public.has_data_access() then raise exception 'TEST FAILED: 6r the desk''s signed-out device still has data access'; end if;
  v_text := public.touch_session();
  if v_text is distinct from 'password_required' then raise exception 'TEST FAILED: 6s the desk''s signed-out device: touch_session expected password_required, got %', v_text; end if;

  -- -------------------------------------------------------------------
  -- Test 7: an admin resets the OTHER admin (allowed, v0.23 / v0.74),
  --         with a 50-byte password (25 x "é" = 25 characters)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa1, 'amr', v_amr_1m)::text, true);
  v_r := public.admin_reset_password(v_a2, repeat('é', 25));
  if v_r->>'status' is distinct from 'ok' or (v_r->>'devices_signed_out')::int is distinct from 1 then
    raise exception 'TEST FAILED: 7a admin resetting the other admin expected ok + 1 device, got %', v_r; end if;
  reset role;
  if (select extensions.crypt(repeat('é', 25), encrypted_password) = encrypted_password from auth.users where id = v_a2) is not true then
    raise exception 'TEST FAILED: 7b the other admin''s new password does not match'; end if;
  if (select count(*) from public.change_log where action = 'admin_reset_password' and record_id = v_a2 and actor_id = v_a) <> 1 then
    raise exception 'TEST FAILED: 7c the admin-to-admin reset was not logged'; end if;
  set local role authenticated;
  -- the other admin's old sign-in can't do anything any more
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a2, 'role', 'authenticated', 'session_id', sa2_1, 'amr', v_amr_1m)::text, true);
  if public.admin_list_staff()->>'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: 7d signed-out admin can still list staff'; end if;
  if public.admin_reset_password(v_s, v_pw_new)->>'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: 7e signed-out admin can still reset a password'; end if;
  if public.admin_reset_pin(v_s, '4719')->>'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: 7f signed-out admin can still reset a PIN'; end if;

  -- -------------------------------------------------------------------
  -- Test 8: reset a PIN (plain staff: ss1 had 2 wrong PINs, ss2 hit 5)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa1, 'amr', v_amr_1m)::text, true);
  v_r := public.admin_reset_pin(v_s, '4719');
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: 8a reset PIN expected exactly {"status":"ok"}, got %', v_r; end if;
  reset role;
  if (select count(*) from public.pin_attempts where session_id = ss1) <> 0 then raise exception 'TEST FAILED: 8b wrong-PIN count on ss1 not cleared'; end if;
  if (select count(*) from public.pin_attempts where session_id = ss2 and locked_at is not null) <> 1 then raise exception 'TEST FAILED: 8c the PIN-locked device must stay locked'; end if;
  if (select count(*) from auth.sessions where user_id = v_s) <> 2 then raise exception 'TEST FAILED: 8d a PIN reset must not sign anyone out'; end if;
  if (select count(*) from public.change_log where action = 'admin_reset_pin' and record_id = v_s and actor_id = v_a
                                               and after = jsonb_build_object('pin', 'reset')) <> 1 then
    raise exception 'TEST FAILED: 8e the PIN reset was not logged as {"pin":"reset"}'; end if;
  -- (only this test's own rows - see 6q)
  if (select count(*) from public.change_log
       where actor_id = v_a
         and coalesce(before::text, '') || coalesce(after::text, '') like '%4719%') <> 0 then
    raise exception 'TEST FAILED: 8f the PIN digits appear in change_log'; end if;
  set local role authenticated;
  -- the new PIN works on the unlocked device, not on the PIN-locked one
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_s, 'role', 'authenticated', 'session_id', ss1, 'amr', v_amr_1m)::text, true);
  v_text := public.verify_pin('4719');
  if v_text is distinct from 'ok' then raise exception 'TEST FAILED: 8g new PIN on ss1 expected ok, got %', v_text; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_s, 'role', 'authenticated', 'session_id', ss2, 'amr', v_amr_1m)::text, true);
  v_text := public.verify_pin('4719');
  if v_text is distinct from 'password_required' then raise exception 'TEST FAILED: 8h new PIN on the PIN-locked device expected password_required, got %', v_text; end if;

  -- -------------------------------------------------------------------
  -- Test 9: the app can no longer call admin_set_staff_pin (0004 section 5)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated', 'session_id', sa1, 'amr', v_amr_1m)::text, true);
  begin
    perform public.admin_set_staff_pin(v_s, '8642');
    raise exception 'TEST FAILED: 9 the app (authenticated) may still call admin_set_staff_pin';
  exception
    when insufficient_privilege then null;   -- good
  end;

  reset role;

  -- -------------------------------------------------------------------
  -- Test 10: catalog - settings and call rights of every 0004 function
  -- -------------------------------------------------------------------
  foreach v_fn in array array['public.admin_list_staff()', 'public.admin_reset_password(uuid, text)',
                               'public.admin_reset_pin(uuid, text)', 'public.staff_admin_gate()'] loop
    select p.prosecdef and p.proconfig = array['search_path=""'] and p.proowner = 'postgres'::regrole
      into v_bool
      from pg_proc p where p.oid = v_fn::regprocedure;
    if v_bool is not true then raise exception 'TEST FAILED: 10a % must be security definer, search_path="", owned by postgres', v_fn; end if;
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_fn::regprocedure and a.grantee = 0) then
      raise exception 'TEST FAILED: 10b % is executable by PUBLIC (everyone)', v_fn; end if;
    if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'TEST FAILED: 10c % is executable by anon or service_role', v_fn; end if;
    if has_function_privilege('authenticated', v_fn, 'execute') is distinct from (v_fn <> 'public.staff_admin_gate()') then
      raise exception 'TEST FAILED: 10d % has the wrong execute right for authenticated', v_fn; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.admin_set_staff_pin(uuid, text)', 'execute')
     or has_function_privilege('service_role', 'public.admin_set_staff_pin(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.admin_set_staff_pin(uuid, text)', 'execute') then
    raise exception 'TEST FAILED: 10e admin_set_staff_pin must not be executable by anon, authenticated or service_role'; end if;
  -- no history trigger on public.staff (it would copy PIN hashes into change_log)
  if exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
              where t.tgrelid = 'public.staff'::regclass and p.proname = 'change_log_write') then
    raise exception 'TEST FAILED: 10f public.staff must not have a change_log_write trigger'; end if;
end;
$$;

select 'ALL 0004 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
