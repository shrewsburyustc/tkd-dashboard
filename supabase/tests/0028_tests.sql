-- =====================================================================
-- 0028_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0028_star_start_times.sql
--   (contract 0028). It checks, in this order:
--     S1  the rule itself: 6:00 AM, 6:05 AM, 9:55 PM and 10:00 PM are
--         fine; 5:55 AM, 10:05 PM, 6:03 AM, 6:00:30 and NULL are not;
--         exactly 193 times of the day pass (6:00 ... 22:00 every 5
--         minutes); every OLD time (8:00 AM - 8:00 PM every 15 minutes,
--         49 of them) still passes - the rule only widens
--     S2  catalog: one version of the function, language sql, immutable,
--         returns boolean, NOT security definer, search_path = '', the
--         same owner as the Star tables; nobody but its owner may run it
--         (not PUBLIC, anon, authenticated, service_role or the family
--         form's login star_registrar), and calling it as a signed-in
--         user is refused
--     S3  the places that use it: star_add_event (6:00 AM and 10:00 PM
--         ok; 5:55 AM, 10:05 PM, 6:03 AM, 6:00:30 invalid),
--         star_update_event (0023's version: 9:55 PM ok, 10:05 PM
--         invalid), star_set_private (6:05 AM and 10:00 PM ok, 5:55 AM
--         and 10:02 invalid), and the table rule
--         star_events_start_time_check (a direct write of 10:05 PM is
--         refused, 6:05 AM is kept)
--   It makes its own test events ("zz test 1a2b3c4d ..."), so it works
--   whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test events, the candidate,
--   history rows, test sessions). NEVER change the final "rollback;" to
--   "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0006_tests.sql (read its header): "set local role
--   authenticated" + a pretend login token per session. Sessions:
--     A1 admin unlocked · D1 desk unlocked
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0023 and 0028 are applied. You need TWO existing,
--      ACTIVE staff rows: an admin and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0028 TESTS PASSED".
--   * Failed: an error starting with "TEST FAILED:" (or "TEST SETUP:")
--     saying which check broke and what came back instead. Nothing was
--     saved either way. If it failed, run   rollback;   on its own once.
-- =====================================================================

begin;

do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();  v_d1 uuid := gen_random_uuid();

  v_now_s   bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_d1 text;

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();

  v_r     jsonb;
  v_n     integer;
  v_txt   text;
  v_role  text;
  v_t     time;
  v_case  record;
  v_e     uuid;
  v_v     integer;
  v_c     uuid;
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  select s.role into v_role from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role into v_role from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regprocedure('public.star_start_time_is_valid(time)') is null then
    raise exception 'TEST SETUP: public.star_start_time_is_valid(time) is missing (is 0006 applied?)';
  end if;
  if public.star_start_time_is_valid('06:05') is not true then
    raise exception 'TEST SETUP: star_start_time_is_valid is still 0006''s rule (is 0028 applied, after any 0006 re-run?)';
  end if;

  perform set_config('request.jwt.claims', '', true);

  begin
    insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_d1, v_desk);
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes');

  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;

  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true then raise exception 'TEST SETUP: A1 has no data access'; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.has_data_access() is not true then raise exception 'TEST SETUP: D1 has no data access'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- S1. The rule itself
  -- ===================================================================
  foreach v_txt in array array['06:00', '06:05', '08:00', '12:35', '20:00', '21:55', '22:00', '06:00:00'] loop
    if public.star_start_time_is_valid(v_txt::time) is not true then
      raise exception 'TEST FAILED: S1 % should be a valid start time', v_txt;
    end if;
  end loop;
  foreach v_txt in array array['05:55', '05:59', '00:00', '22:01', '22:05', '23:55', '06:03', '10:02', '06:00:30', '12:00:00.5'] loop
    if public.star_start_time_is_valid(v_txt::time) is not false then
      raise exception 'TEST FAILED: S1 % should NOT be a valid start time', v_txt;
    end if;
  end loop;
  if public.star_start_time_is_valid(null) is not false then
    raise exception 'TEST FAILED: S1 NULL should answer false (not NULL)';
  end if;
  -- every whole minute of the day: exactly 6:00 ... 22:00 every 5 minutes
  select count(*) into v_n
    from generate_series(0, 24 * 60 - 1) as m
   where public.star_start_time_is_valid(time '00:00' + make_interval(mins => m));
  if v_n <> 193 then raise exception 'TEST FAILED: S1 expected 193 valid minutes of the day, found %', v_n; end if;
  select count(*) into v_n
    from generate_series(0, 24 * 60 - 1) as m
   where public.star_start_time_is_valid(time '00:00' + make_interval(mins => m))
     and not (m between 6 * 60 and 22 * 60 and m % 5 = 0);
  if v_n <> 0 then raise exception 'TEST FAILED: S1 % valid minute(s) outside 6:00-22:00 every 5 minutes', v_n; end if;
  -- the rule only widens: every old time still passes
  select count(*) into v_n
    from generate_series(8 * 60, 20 * 60, 15) as m
   where public.star_start_time_is_valid(time '00:00' + make_interval(mins => m));
  if v_n <> 49 then raise exception 'TEST FAILED: S1 expected all 49 old times (8:00-20:00 every 15 minutes) to pass, % did', v_n; end if;

  -- ===================================================================
  -- S2. Catalog: settings, owner and rights
  -- ===================================================================
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'star_start_time_is_valid';
  if v_n <> 1 then raise exception 'TEST FAILED: S2 expected exactly one star_start_time_is_valid, found %', v_n; end if;
  select p.prosecdef, p.proconfig, p.provolatile, p.proowner, p.prorettype::regtype::text as rettype, l.lanname, p.proacl
    into v_case
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.star_start_time_is_valid(time)'::regprocedure;
  if v_case.lanname <> 'sql' or v_case.provolatile <> 'i' or v_case.rettype <> 'boolean' or v_case.prosecdef then
    raise exception 'TEST FAILED: S2 expected language sql, immutable, boolean, not security definer';
  end if;
  if not coalesce('search_path=""' = any (v_case.proconfig), false) then
    raise exception 'TEST FAILED: S2 search_path is not set to ''''';
  end if;
  if v_case.proowner <> (select c.relowner from pg_class c where c.oid = 'public.star_events'::regclass) then
    raise exception 'TEST FAILED: S2 owner differs from the Star tables'' owner';
  end if;
  if exists (select 1 from aclexplode(v_case.proacl) a where a.grantee = 0) then
    raise exception 'TEST FAILED: S2 PUBLIC can run star_start_time_is_valid';
  end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'star_registrar'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role)
       and has_function_privilege(v_role, 'public.star_start_time_is_valid(time)', 'EXECUTE') then
      raise exception 'TEST FAILED: S2 % may run star_start_time_is_valid', v_role;
    end if;
  end loop;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin
    perform public.star_start_time_is_valid('10:00');
    raise exception 'TEST FAILED: S2 a signed-in admin could call star_start_time_is_valid directly';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role anon;
  begin
    perform public.star_start_time_is_valid('10:00');
    raise exception 'TEST FAILED: S2 anon could call star_start_time_is_valid';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- S3. The places that use it
  -- ===================================================================
  -- a. star_add_event (admin): both new ends ok, outside / off-step refused
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' Six AM', v_today + 9, '06:00', 'worcester', false, null, null);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: S3a add_event at 6:00 AM expected ok, got %', v_r; end if;
  v_e := (v_r ->> 'id')::uuid;
  v_r := public.star_add_event(v_tag || ' Ten PM', v_today + 9, '22:00', 'shrewsbury', false, null, null);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: S3a add_event at 10:00 PM expected ok, got %', v_r; end if;
  foreach v_txt in array array['05:55', '22:05', '06:03', '06:00:30'] loop
    v_r := public.star_add_event(v_tag || ' bad ' || v_txt, v_today + 9, v_txt::time, 'worcester', false, null, null);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: S3a add_event at % expected invalid, got %', v_txt, v_r;
    end if;
  end loop;

  -- b. star_update_event (0023's version): 9:55 PM ok, 10:05 PM refused
  select e.version into v_v from public.star_events e where e.id = v_e;
  v_r := public.star_update_event(v_e, v_v, v_tag || ' Six AM', v_today + 9, '22:05', 'worcester', null, null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: S3b update_event to 10:05 PM expected invalid, got %', v_r;
  end if;
  v_r := public.star_update_event(v_e, v_v, v_tag || ' Six AM', v_today + 9, '21:55', 'worcester', null, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1)
     or (select e.start_time from public.star_events e where e.id = v_e) <> time '21:55' then
    raise exception 'TEST FAILED: S3b update_event to 9:55 PM expected {ok, %} and the time saved, got %', v_v + 1, v_r;
  end if;
  reset role;

  -- c. star_set_private (desk): 6:05 AM and 10:00 PM ok, 5:55 AM / 10:02 refused
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_add_candidate(v_e, 'Pia', 'Vate', (v_today - interval '30 years')::date, 'pv@example.com', 'worcester', 1, 0, 'cash');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: S3c add_candidate answered %', v_r; end if;
  v_c := (v_r ->> 'id')::uuid;
  if public.star_set_private(v_c, 1, v_today + 2, '05:55') is distinct from '{"status": "invalid"}'::jsonb
     or public.star_set_private(v_c, 1, v_today + 2, '10:02') is distinct from '{"status": "invalid"}'::jsonb
     or public.star_set_private(v_c, 1, v_today + 2, '22:05') is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: S3c set_private outside / off the 5-minute step expected invalid';
  end if;
  v_r := public.star_set_private(v_c, 1, v_today + 2, '06:05');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 2 then
    raise exception 'TEST FAILED: S3c set_private at 6:05 AM expected ok (version 2), got %', v_r;
  end if;
  v_r := public.star_set_private(v_c, 2, v_today + 2, '22:00');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 3 then
    raise exception 'TEST FAILED: S3c set_private at 10:00 PM expected ok (version 3), got %', v_r;
  end if;
  reset role;
  if (select c.private_time from public.star_candidates c where c.id = v_c) <> time '22:00' then
    raise exception 'TEST FAILED: S3c the private time 10:00 PM was not saved';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- d. the table rule star_events_start_time_check uses the new rule
  --    (a direct write as "postgres", past every function's checks)
  begin
    update public.star_events set start_time = '22:05' where id = v_e;
    raise exception 'TEST FAILED: S3d the table rule accepted 10:05 PM';
  exception when check_violation then null;
  end;
  update public.star_events set start_time = '06:05' where id = v_e;
  if (select e.start_time from public.star_events e where e.id = v_e) <> time '06:05' then
    raise exception 'TEST FAILED: S3d the table rule refused 6:05 AM';
  end if;

  raise notice 'ALL 0028 TESTS PASSED';
end
$$;

select 'ALL 0028 TESTS PASSED' as result;

rollback;
