-- =====================================================================
-- 0005_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0005_schedule.sql (Schedule):
--   who can read schedules (only unlocked staff sessions), who can change
--   them (only admins, only through the 7 schedule_* functions), every rule
--   those functions enforce (times, days, schools, current / planned /
--   past schedules, "someone else changed it" = stale), what happens when
--   a class is deleted in Testing, the history (change_log), and a
--   catalog section that checks the permissions on EVERY object 0005
--   creates.
--   Run it in the Supabase SQL Editor AFTER 0005 is applied. It works on
--   an empty schedule and on a filled one (it makes its own test classes
--   named "zz test ...").
--
-- IS IT SAFE?
--   Yes. One transaction that ends with ROLLBACK: every change is undone.
--   NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same as 0003_tests.sql (read its header). Sessions used here:
--     A1 admin, fresh password, unlocked     (the one that may write)
--     A2 admin, locked on the server ("Lock now")
--     A3 admin, hit 5 wrong PINs
--     A4 admin, signed out (not in auth.sessions)
--     A5 admin, password sign-in 8 days ago
--     A6 admin, magic-link sign-in (no password)
--     A7 admin, idle time ran out
--     D1 front desk (role staff), unlocked
--   (A3-A7 added after security review: Handoff section 6 wants every
--   kind of shut-out session tested on every new table)
--     anon = a visitor who is not signed in
--
-- BEFORE YOU RUN IT
--   Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--   the UIDs of an ACTIVE admin and the ACTIVE front-desk account.
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0005 TESTS PASSED".
--   Failed: an error starting with "TEST FAILED:" or "TEST SETUP:".
--   Nothing is saved either way. If it failed, run   rollback;   once.
-- =====================================================================

begin;

do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();
  v_a2 uuid := gen_random_uuid();
  v_a3 uuid := gen_random_uuid();
  v_a4 uuid := gen_random_uuid();
  v_a5 uuid := gen_random_uuid();
  v_a6 uuid := gen_random_uuid();
  v_a7 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();
  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_2h  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 2 * 3600));
  v_amr_8d  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600));
  v_amr_otp jsonb := jsonb_build_array(jsonb_build_object('method', 'otp',      'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_a2 text; v_c_a3 text; v_c_a4 text; v_c_a5 text; v_c_a6 text; v_c_a7 text; v_c_d1 text;
  v_shut  text[];       -- the shut-out sessions A2..A7
  v_i     integer;
  v_batch text;
  v_c_anon text := '{"role": "anon"}';

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date;
  v_role  text;

  v_r     jsonb;
  v_n     integer;
  v_n2    integer;
  v_txt   text;
  v_bool  boolean;
  v_mark  bigint;
  v_rand  uuid := gen_random_uuid();

  -- test classes: w = Worcester, s = Shrewsbury
  v_cw1 uuid; v_cw2 uuid; v_cs1 uuid;
  -- schedules
  v_cur uuid;        -- Worcester's current schedule (for these tests)
  v_cur_v integer;
  v_past uuid;       -- a past one
  v_plan uuid;       -- a planned one (copy)
  v_plan_v integer;
  v_blank uuid;      -- a planned one (blank)
  -- slots
  v_sl1 uuid; v_sl1_v integer; v_sl2 uuid; v_sl3 uuid;
  v_past_slot uuid;

  v_tbl  text;
  v_fn   record;
begin
  -- -------------------------------------------------------------------
  -- Setup (as postgres)
  -- -------------------------------------------------------------------
  select s.role into v_role from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role into v_role from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regclass('public.schedule_slots') is null then
    raise exception 'TEST SETUP: public.schedule_slots is missing (is 0005 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  -- all except A4 (signed out) exist for Supabase Auth
  insert into auth.sessions (id, user_id)
  select x, v_admin from unnest(array[v_a1, v_a2, v_a3, v_a5, v_a6, v_a7]) as x
  union all select v_d1, v_desk;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),                                -- Lock now
    (v_a3, v_admin, now() + interval '30 minutes'),                              -- (PIN-locked below)
    (v_a4, v_admin, now() + interval '30 minutes'),                              -- (signed out)
    (v_a5, v_admin, now() + interval '30 minutes'),                              -- (8-day-old password)
    (v_a6, v_admin, now() + interval '30 minutes'),                              -- (magic link)
    (v_a7, v_admin, to_timestamp(v_now_s - 2 * 3600) + interval '45 minutes'),   -- idle time ran out
    (v_d1, v_desk,  now() + interval '30 minutes');
  insert into public.pin_attempts (session_id, staff_id, failed, locked_at) values (v_a3, v_admin, 5, now());
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_a3 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a3, 'amr', v_amr_1m)::text;
  v_c_a4 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a4, 'amr', v_amr_1m)::text;
  v_c_a5 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a5, 'amr', v_amr_8d)::text;
  v_c_a6 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a6, 'amr', v_amr_otp)::text;
  v_c_a7 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a7, 'amr', v_amr_2h)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;
  v_shut := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7];

  v_today := (now() at time zone 'America/New_York')::date;

  -- Test classes, made the normal way (Testing's function, as A1).
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true or public.is_admin() is not true then
    raise exception 'TEST SETUP: A1 should be an unlocked admin';
  end if;
  v_cw1 := (public.testing_add_class('worcester',  v_tag || ' w1', null, false) ->> 'id')::uuid;
  v_cw2 := (public.testing_add_class('worcester',  v_tag || ' w2', null, false) ->> 'id')::uuid;
  v_cs1 := (public.testing_add_class('shrewsbury', v_tag || ' s1', null, false) ->> 'id')::uuid;
  if v_cw1 is null or v_cw2 is null or v_cs1 is null then
    raise exception 'TEST SETUP: could not add test classes';
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 1: schedule_today() is Massachusetts time
  -- -------------------------------------------------------------------
  -- Massachusetts is 4-5 hours behind UTC, so its date is the UTC date or
  -- the day before - never later.
  if public.schedule_today() is null
     or public.schedule_today() not between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date then
    raise exception 'TEST FAILED: 1 schedule_today() is %, not the Massachusetts date', public.schedule_today();
  end if;
  if public.schedule_today() is distinct from v_today then
    raise exception 'TEST FAILED: 1b schedule_today() is %, expected % (America/New_York)', public.schedule_today(), v_today;
  end if;

  -- -------------------------------------------------------------------
  -- Test 2: a visitor who is NOT signed in can read nothing and call
  --         nothing (permission denied)
  -- -------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform 1 from public.schedule_versions;     raise exception 'TEST FAILED: 2a anon read schedule_versions';     exception when insufficient_privilege then null; end;
  begin perform 1 from public.schedule_slots;        raise exception 'TEST FAILED: 2b anon read schedule_slots';        exception when insufficient_privilege then null; end;
  begin perform 1 from public.schedule_class_colors; raise exception 'TEST FAILED: 2c anon read schedule_class_colors'; exception when insufficient_privilege then null; end;
  begin perform public.schedule_today();             raise exception 'TEST FAILED: 2d anon called schedule_today';      exception when insufficient_privilege then null; end;
  begin perform public.schedule_add_slots('worcester', null, array[v_cw1], '{1}', '16:00', '16:45');
        raise exception 'TEST FAILED: 2e anon called schedule_add_slots'; exception when insufficient_privilege then null; end;
  begin perform public.schedule_update_slot(v_rand, 1, array[v_cw1], 1::smallint, '16:00', '16:45');
        raise exception 'TEST FAILED: 2f anon called schedule_update_slot'; exception when insufficient_privilege then null; end;
  begin perform public.schedule_remove_slot(v_rand, 1);
        raise exception 'TEST FAILED: 2g anon called schedule_remove_slot'; exception when insufficient_privilege then null; end;
  begin perform public.schedule_plan_version('worcester', null, v_today + 30, true);
        raise exception 'TEST FAILED: 2h anon called schedule_plan_version'; exception when insufficient_privilege then null; end;
  begin perform public.schedule_update_version(v_rand, 1, null, v_today + 30);
        raise exception 'TEST FAILED: 2i anon called schedule_update_version'; exception when insufficient_privilege then null; end;
  begin perform public.schedule_delete_version(v_rand, 1, 0);
        raise exception 'TEST FAILED: 2j anon called schedule_delete_version'; exception when insufficient_privilege then null; end;
  begin perform public.schedule_set_class_color(v_cw1, 'teal');
        raise exception 'TEST FAILED: 2k anon called schedule_set_class_color'; exception when insufficient_privilege then null; end;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 3: signed-in browser can't write the tables directly, or read
  --         the login-id columns
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin insert into public.schedule_versions (location_code, starts_on) values ('worcester', v_today + 99);
        raise exception 'TEST FAILED: 3a admin inserted a schedule directly'; exception when insufficient_privilege then null; end;
  begin insert into public.schedule_slots (version_id, location_code, weekday, starts_at, ends_at)
        values (v_rand, 'worcester', 1, '16:00', '16:45');
        raise exception 'TEST FAILED: 3b admin inserted a slot directly'; exception when insufficient_privilege then null; end;
  begin update public.schedule_slots set weekday = 2;
        raise exception 'TEST FAILED: 3c admin updated slots directly'; exception when insufficient_privilege then null; end;
  begin delete from public.schedule_versions;
        raise exception 'TEST FAILED: 3d admin removed schedules directly'; exception when insufficient_privilege then null; end;
  begin insert into public.schedule_class_colors (class_id, location_code, color) values (v_cw1, 'worcester', 'teal');
        raise exception 'TEST FAILED: 3e admin inserted a color directly'; exception when insufficient_privilege then null; end;
  begin perform v.created_by from public.schedule_versions v;
        raise exception 'TEST FAILED: 3f created_by is readable'; exception when insufficient_privilege then null; end;
  begin perform s.updated_by from public.schedule_slots s;
        raise exception 'TEST FAILED: 3g updated_by is readable'; exception when insufficient_privilege then null; end;
  begin perform public.schedule_overlaps(v_rand, '{1}', '16:00', '16:45', null);
        raise exception 'TEST FAILED: 3h the app can call schedule_overlaps'; exception when insufficient_privilege then null; end;
  begin perform public.schedule_version_state(v_rand);
        raise exception 'TEST FAILED: 3i the app can call schedule_version_state'; exception when insufficient_privilege then null; end;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 4: Worcester's first / current schedule
  --   On an empty Worcester: the first add (version NULL) makes a
  --   schedule starting today. Either way, a NULL version once one exists
  --   is stale.
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select count(*) into v_n from public.schedule_versions where location_code = 'worcester';
  if v_n = 0 then
    v_r := public.schedule_add_slots('worcester', null, array[v_cw1], '{1,3}', '16:00', '16:45');
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 4a first add: %', v_r; end if;
    v_cur := (v_r ->> 'version_id')::uuid;
    if jsonb_array_length(v_r -> 'slots') <> 2 then raise exception 'TEST FAILED: 4b expected 2 slots (Mon, Wed): %', v_r; end if;
    if (select starts_on from public.schedule_versions where id = v_cur) <> v_today then
      raise exception 'TEST FAILED: 4c first schedule should start today';
    end if;
    if (select name from public.schedule_versions where id = v_cur) is not null then
      raise exception 'TEST FAILED: 4d first schedule should have no name';
    end if;
  else
    -- a filled database: use its current schedule
    select v.id into v_cur from public.schedule_versions v
     where v.location_code = 'worcester' and v.starts_on <= v_today
     order by v.starts_on desc limit 1;
    if v_cur is null then raise exception 'TEST SETUP: Worcester has schedules but none is current'; end if;
    v_r := public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{1,3}', '16:00', '16:45');
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 4a add to current: %', v_r; end if;
  end if;
  v_sl1 := (v_r -> 'slots' -> 0 ->> 'id')::uuid;   -- Monday 16:00
  v_sl1_v := (v_r -> 'slots' -> 0 ->> 'version')::integer;
  v_r := public.schedule_add_slots('worcester', null, array[v_cw1], '{2}', '16:00', '16:45');
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: 4e NULL version with a schedule present: %', v_r; end if;

  -- -------------------------------------------------------------------
  -- Test 5: input rules for adding
  -- -------------------------------------------------------------------
  v_txt := '';
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{1}', '16:00', '16:00') ->> 'status') || ',';  -- ends = starts
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{1}', '17:00', '16:00') ->> 'status') || ',';  -- ends before
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{1}', '16:03', '16:45') ->> 'status') || ',';  -- not 5-min
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{1}', '16:00', '16:10') ->> 'status') || ',';  -- < 15 min
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{1}', '10:00', '14:05') ->> 'status') || ',';  -- > 4 h
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{1}', '16:00:30', '16:45') ->> 'status') || ','; -- seconds
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{}', '16:00', '16:45') ->> 'status') || ',';   -- no day
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{0}', '16:00', '16:45') ->> 'status') || ',';  -- day 0
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{8}', '16:00', '16:45') ->> 'status') || ',';  -- day 8
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{2,2}', '16:00', '16:45') ->> 'status') || ','; -- twice
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cw1], null, '16:00', '16:45') ->> 'status') || ',';
  v_txt := v_txt || (public.schedule_add_slots('nowhere', v_cur, array[v_cw1], '{1}', '16:00', '16:45') ->> 'status') || ',';
  v_txt := v_txt || (public.schedule_add_slots('worcester', v_cur, array[v_cs1], '{1}', '16:00', '16:45') ->> 'status');         -- other school's class
  if v_txt <> 'invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid' then
    raise exception 'TEST FAILED: 5a input rules gave %', v_txt;
  end if;
  v_r := public.schedule_add_slots('worcester', v_cur, array[v_rand], '{1}', '16:00', '16:45');
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: 5b class that doesn''t exist: %', v_r; end if;
  v_r := public.schedule_add_slots('shrewsbury', v_cur, array[v_cs1], '{1}', '16:00', '16:45');
  if v_r ->> 'status' <> 'not_found' then raise exception 'TEST FAILED: 5c Worcester schedule used for Shrewsbury: %', v_r; end if;
  v_r := public.schedule_add_slots('worcester', v_rand, array[v_cw1], '{1}', '16:00', '16:45');
  if v_r ->> 'status' <> 'not_found' then raise exception 'TEST FAILED: 5d schedule that doesn''t exist: %', v_r; end if;

  -- -------------------------------------------------------------------
  -- Test 6: overlaps are reported (and still saved)
  -- -------------------------------------------------------------------
  v_r := public.schedule_add_slots('worcester', v_cur, array[v_cw2], '{1,5}', '16:30', '17:15');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 6a overlapping add: %', v_r; end if;
  if jsonb_array_length(v_r -> 'overlaps') < 1
     or not exists (select 1 from jsonb_array_elements(v_r -> 'overlaps') o
                     where (o ->> 'slot_id')::uuid = v_sl1 and o ->> 'class_name' = v_tag || ' w1') then
    raise exception 'TEST FAILED: 6b overlap with Monday 16:00 % not reported: %', v_tag, v_r;
  end if;
  v_sl2 := (select (x ->> 'id')::uuid from jsonb_array_elements(v_r -> 'slots') x where (x ->> 'weekday')::int = 5);
  v_r := public.schedule_add_slots('worcester', v_cur, array[v_cw2], '{2}', '16:45', '17:30');   -- touching, not overlapping
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 6c add Tue: %', v_r; end if;
  v_sl3 := (v_r -> 'slots' -> 0 ->> 'id')::uuid;
  v_r := public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{2}', '16:00', '16:45');
  if v_r ->> 'status' <> 'ok' or exists (select 1 from jsonb_array_elements(v_r -> 'overlaps') o where (o ->> 'slot_id')::uuid = v_sl3) then
    raise exception 'TEST FAILED: 6d back-to-back classes are not an overlap: %', v_r;
  end if;

  -- -------------------------------------------------------------------
  -- Test 7: staff and locked sessions
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  select count(*) into v_n from public.schedule_slots where id = v_sl1;
  if v_n <> 1 then raise exception 'TEST FAILED: 7a front desk can''t read slots'; end if;
  if not exists (select 1 from public.schedule_versions where id = v_cur) then
    raise exception 'TEST FAILED: 7a2 front desk can''t read schedules';
  end if;
  v_txt := concat_ws(',',
    public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{6}', '10:00', '10:45') ->> 'status',
    public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1], 1::smallint, '16:00', '16:50') ->> 'status',
    public.schedule_remove_slot(v_sl1, v_sl1_v) ->> 'status',
    public.schedule_plan_version('worcester', null, v_today + 30, true) ->> 'status',
    public.schedule_update_version(v_cur, 1, null, v_today + 30) ->> 'status',
    public.schedule_delete_version(v_cur, 1, 0) ->> 'status',
    public.schedule_set_class_color(v_cw1, 'teal') ->> 'status');
  if v_txt <> 'not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed' then
    raise exception 'TEST FAILED: 7b front desk got %', v_txt;
  end if;

  -- every shut-out session (locked, PIN-locked, signed out, old
  -- password, magic link, idle) reads nothing from any of the three
  -- tables and gets no_access from every function
  for v_i in 1 .. cardinality(v_shut) loop
    perform set_config('request.jwt.claims', v_shut[v_i], true);
    if exists (select 1 from public.schedule_slots) or exists (select 1 from public.schedule_versions)
       or exists (select 1 from public.schedule_class_colors) then
      raise exception 'TEST FAILED: 7c shut-out session % (A2..A7) can read schedule data', v_i;
    end if;
    v_txt := concat_ws(',',
      public.schedule_add_slots('worcester', v_cur, array[v_cw1], '{6}', '10:00', '10:45') ->> 'status',
      public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1], 1::smallint, '16:00', '16:50') ->> 'status',
      public.schedule_remove_slot(v_sl1, v_sl1_v) ->> 'status',
      public.schedule_plan_version('worcester', null, v_today + 30, true) ->> 'status',
      public.schedule_update_version(v_cur, 1, null, v_today + 30) ->> 'status',
      public.schedule_delete_version(v_cur, 1, 0) ->> 'status',
      public.schedule_set_class_color(v_cw1, 'teal') ->> 'status');
    if v_txt <> 'no_access,no_access,no_access,no_access,no_access,no_access,no_access' then
      raise exception 'TEST FAILED: 7d shut-out session % (A2..A7) got %', v_i, v_txt;
    end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- -------------------------------------------------------------------
  -- Test 8: editing a slot
  -- -------------------------------------------------------------------
  v_r := public.schedule_update_slot(v_sl1, v_sl1_v + 5, array[v_cw1], 1::smallint, '16:00', '16:50');
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: 8a old version should be stale: %', v_r; end if;
  v_r := public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cs1], 1::smallint, '16:00', '16:50');
  if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: 8b other school''s class: %', v_r; end if;
  v_r := public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1], 9::smallint, '16:00', '16:50');
  if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: 8c day 9: %', v_r; end if;
  v_r := public.schedule_update_slot(v_rand, 1, array[v_cw1], 1::smallint, '16:00', '16:50');
  if v_r ->> 'status' <> 'not_found' then raise exception 'TEST FAILED: 8d no such slot: %', v_r; end if;
  v_r := public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1], 1::smallint, '16:00', '16:45');   -- unchanged
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> v_sl1_v then
    raise exception 'TEST FAILED: 8e unchanged save should keep the version: %', v_r;
  end if;
  reset role;
  select max(id) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw2], 1::smallint, '16:00', '16:50');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> v_sl1_v + 1 then
    raise exception 'TEST FAILED: 8f real change should bump the version: %', v_r;
  end if;
  v_sl1_v := v_sl1_v + 1;
  reset role;
  if not exists (select 1 from public.change_log
                  where id > v_mark and table_name = 'schedule_slots' and record_id = v_sl1
                    and action = 'schedule_update_slot' and op = 'update' and actor_id = v_admin) then
    raise exception 'TEST FAILED: 8g the edit is not in change_log';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- -------------------------------------------------------------------
  -- Test 9: planning future schedules
  -- -------------------------------------------------------------------
  v_txt := concat_ws(',',
    public.schedule_plan_version('worcester', null, v_today, true) ->> 'status',          -- today is not the future
    public.schedule_plan_version('worcester', null, v_today - 1, true) ->> 'status',
    public.schedule_plan_version('worcester', repeat('x', 41), v_today + 30, true) ->> 'status',
    public.schedule_plan_version('worcester', null, v_today + 30, null) ->> 'status',
    public.schedule_plan_version('nowhere', null, v_today + 30, true) ->> 'status');
  if v_txt <> 'invalid,invalid,invalid,invalid,invalid' then raise exception 'TEST FAILED: 9a plan input rules gave %', v_txt; end if;

  select count(*) into v_n from public.schedule_slots where version_id = v_cur;
  v_r := public.schedule_plan_version('worcester', '  Winter   2027 ', v_today + 40, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 9b plan with copy: %', v_r; end if;
  v_plan := (v_r ->> 'id')::uuid;
  v_plan_v := (v_r ->> 'version')::int;
  if (v_r ->> 'copied_from')::uuid is distinct from v_cur or (v_r ->> 'slot_count')::int <> v_n then
    raise exception 'TEST FAILED: 9c should copy the % slots of the current schedule: %', v_n, v_r;
  end if;
  if (select name from public.schedule_versions where id = v_plan) <> 'Winter 2027' then
    raise exception 'TEST FAILED: 9d name should be cleaned up to "Winter 2027"';
  end if;
  if (select count(*) from public.schedule_slots where version_id = v_plan) <> v_n then
    raise exception 'TEST FAILED: 9e copied slot count wrong';
  end if;
  v_r := public.schedule_plan_version('worcester', 'Again', v_today + 40, false);
  if v_r ->> 'status' <> 'duplicate_date' then raise exception 'TEST FAILED: 9f same start date: %', v_r; end if;

  -- a planned schedule BEFORE Winter copies the current one too; one AFTER copies Winter
  v_r := public.schedule_plan_version('worcester', null, v_today + 60, false);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'slot_count')::int <> 0 or v_r -> 'copied_from' <> 'null'::jsonb then
    raise exception 'TEST FAILED: 9g blank plan: %', v_r;
  end if;
  v_blank := (v_r ->> 'id')::uuid;
  -- add one slot only to Winter, then plan after Winter: copies Winter (n+1)
  v_r := public.schedule_add_slots('worcester', v_plan, array[v_cw1], '{7}', '09:00', '09:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 9h add to planned: %', v_r; end if;
  v_r := public.schedule_plan_version('worcester', null, v_today + 50, true);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'copied_from')::uuid is distinct from v_plan or (v_r ->> 'slot_count')::int <> v_n + 1 then
    raise exception 'TEST FAILED: 9i should copy Winter (the schedule just before): %', v_r;
  end if;

  -- -------------------------------------------------------------------
  -- Test 10: changing a planned schedule; the current one can't move
  -- -------------------------------------------------------------------
  v_r := public.schedule_update_version(v_plan, v_plan_v, 'Winter', v_today + 50);   -- taken by 9i
  if v_r ->> 'status' <> 'duplicate_date' then raise exception 'TEST FAILED: 10a date already used: %', v_r; end if;
  v_r := public.schedule_update_version(v_plan, v_plan_v, 'Winter', v_today);
  if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: 10b move to today: %', v_r; end if;
  v_r := public.schedule_update_version(v_plan, v_plan_v + 1, 'Winter', v_today + 45);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: 10c stale version: %', v_r; end if;
  v_r := public.schedule_update_version(v_plan, v_plan_v, 'Winter', v_today + 45);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> v_plan_v + 1 then raise exception 'TEST FAILED: 10d rename + move: %', v_r; end if;
  v_plan_v := v_plan_v + 1;
  v_r := public.schedule_update_version(v_plan, v_plan_v, '', v_today + 45);   -- clear the name
  if v_r ->> 'status' <> 'ok' or (select name from public.schedule_versions where id = v_plan) is not null then
    raise exception 'TEST FAILED: 10e empty name should clear it: %', v_r;
  end if;
  v_plan_v := (v_r ->> 'version')::int;
  select version into v_cur_v from public.schedule_versions where id = v_cur;
  v_r := public.schedule_update_version(v_cur, v_cur_v, 'Moved', v_today + 70);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: 10f the current schedule moved: %', v_r; end if;

  -- -------------------------------------------------------------------
  -- Test 11: past schedules are read-only
  --   (made as postgres: a schedule that started 100 days ago, older than
  --   the current one)
  -- -------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', '', true);   -- as the SQL Editor: no login
  if (select starts_on from public.schedule_versions where id = v_cur) > v_today - 100 then
    insert into public.schedule_versions (location_code, name, starts_on) values ('worcester', null, v_today - 100)
      on conflict do nothing
      returning id into v_past;
  end if;
  if v_past is null then
    select v.id into v_past from public.schedule_versions v
     where v.location_code = 'worcester' and v.starts_on < (select starts_on from public.schedule_versions where id = v_cur)
     order by v.starts_on desc limit 1;
  end if;
  insert into public.schedule_slots (version_id, location_code, weekday, starts_at, ends_at)
  values (v_past, 'worcester', 4, '18:00', '18:45') returning id into v_past_slot;
  insert into public.schedule_slot_classes (slot_id, location_code, class_id, position)
  values (v_past_slot, 'worcester', v_cw1, 0);
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_txt := concat_ws(',',
    public.schedule_add_slots('worcester', v_past, array[v_cw1], '{4}', '19:00', '19:45') ->> 'status',
    public.schedule_update_slot(v_past_slot, 1, array[v_cw1], 4::smallint, '18:00', '18:50') ->> 'status',
    public.schedule_remove_slot(v_past_slot, 1) ->> 'status',
    public.schedule_update_version(v_past, (select version from public.schedule_versions where id = v_past), 'x', v_today + 80) ->> 'status',
    public.schedule_delete_version(v_past, (select version from public.schedule_versions where id = v_past), 1) ->> 'status');
  if v_txt <> 'not_allowed,not_allowed,not_allowed,not_allowed,not_allowed' then
    raise exception 'TEST FAILED: 11 past schedule changes gave %', v_txt;
  end if;

  -- -------------------------------------------------------------------
  -- Test 12: removing a slot (and Undo data); removing schedules
  -- -------------------------------------------------------------------
  v_r := public.schedule_remove_slot(v_sl1, v_sl1_v - 1);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: 12a stale remove: %', v_r; end if;
  v_r := public.schedule_remove_slot(v_sl1, v_sl1_v);
  if v_r ->> 'status' <> 'ok'
     or v_r -> 'removed' -> 'class_ids' <> jsonb_build_array(v_cw2)
     or (v_r -> 'removed' ->> 'weekday')::int <> 1
     or v_r -> 'removed' ->> 'starts_at' <> '16:00'
     or v_r -> 'removed' ->> 'ends_at' <> '16:50' then
    raise exception 'TEST FAILED: 12b remove should return what it was: %', v_r;
  end if;
  if exists (select 1 from public.schedule_slots where id = v_sl1) then raise exception 'TEST FAILED: 12c slot still there'; end if;
  v_r := public.schedule_remove_slot(v_sl1, v_sl1_v);
  if v_r ->> 'status' <> 'not_found' then raise exception 'TEST FAILED: 12d remove twice: %', v_r; end if;

  select count(*) into v_n2 from public.schedule_slots where version_id = v_plan;   -- slots that will go
  v_r := public.schedule_delete_version(v_plan, v_plan_v, v_n2 + 1);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: 12e wrong slot count should be stale: %', v_r; end if;
  reset role;
  select max(id) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.schedule_delete_version(v_plan, v_plan_v, v_n2);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'removed_slot_count')::int <> v_n2 then
    raise exception 'TEST FAILED: 12f delete planned: %', v_r;
  end if;
  if exists (select 1 from public.schedule_slots where version_id = v_plan) then raise exception 'TEST FAILED: 12g its slots remain'; end if;
  select version into v_cur_v from public.schedule_versions where id = v_cur;
  select count(*) into v_n from public.schedule_slots where version_id = v_cur;
  v_r := public.schedule_delete_version(v_cur, v_cur_v, v_n);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: 12h the current schedule was deleted: %', v_r; end if;
  reset role;
  -- every slot that went with it is in the history, tagged with this action
  if (select count(*) from public.change_log
       where id > v_mark and action = 'schedule_delete_version' and table_name = 'schedule_slots' and op = 'delete') <> v_n2 then
    raise exception 'TEST FAILED: 12i the % removed slots are not all in change_log', v_n2;
  end if;
  if not exists (select 1 from public.change_log where id > v_mark and action = 'schedule_delete_version'
                    and table_name = 'schedule_versions' and record_id = v_plan) then
    raise exception 'TEST FAILED: 12j the removed schedule row is not in change_log';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- -------------------------------------------------------------------
  -- Test 13: class colors
  -- -------------------------------------------------------------------
  v_txt := concat_ws(',',
    public.schedule_set_class_color(v_cw1, 'red') ->> 'status',
    public.schedule_set_class_color(v_cw1, 'Teal') ->> 'status',
    public.schedule_set_class_color(v_cw1, null) ->> 'status',
    public.schedule_set_class_color(v_rand, 'teal') ->> 'status');
  if v_txt <> 'invalid,invalid,invalid,not_found' then raise exception 'TEST FAILED: 13a color rules gave %', v_txt; end if;
  v_r := public.schedule_set_class_color(v_cw1, 'teal');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> 1 then raise exception 'TEST FAILED: 13b first color: %', v_r; end if;
  v_r := public.schedule_set_class_color(v_cw1, 'teal');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> 1 then raise exception 'TEST FAILED: 13c same color again should change nothing: %', v_r; end if;
  v_r := public.schedule_set_class_color(v_cw1, 'purple');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> 2 then raise exception 'TEST FAILED: 13d new color: %', v_r; end if;
  if (select location_code from public.schedule_class_colors where class_id = v_cw1) <> 'worcester' then
    raise exception 'TEST FAILED: 13e color row should be in the class''s school';
  end if;
  v_r := public.schedule_set_class_color(v_cs1, 'pink');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 13f Shrewsbury class color: %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if (select color from public.schedule_class_colors where class_id = v_cw1) is distinct from 'purple' then
    raise exception 'TEST FAILED: 13g front desk can''t read class colors';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- -------------------------------------------------------------------
  -- Test 14: deleting a class in Testing removes its slots and color,
  --          and the history says so (decision Q1)
  -- -------------------------------------------------------------------
  select count(*) into v_n from public.schedule_slot_classes where class_id = v_cw1;
  if v_n < 2 then raise exception 'TEST SETUP: expected w1 to have slots, has %', v_n; end if;
  reset role;
  select max(id) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_delete_class(v_cw1, 1, '{}', '{}', false);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 14a Testing delete class: %', v_r; end if;
  reset role;
  if exists (select 1 from public.schedule_slot_classes where class_id = v_cw1) then raise exception 'TEST FAILED: 14b the deleted class is still on slots'; end if;
  if exists (select 1 from public.schedule_slots s where not exists (select 1 from public.schedule_slot_classes c where c.slot_id = s.id)) then
    raise exception 'TEST FAILED: 14b2 a slot was left with no class';
  end if;
  if exists (select 1 from public.schedule_class_colors where class_id = v_cw1) then raise exception 'TEST FAILED: 14c color of a deleted class remains'; end if;
  select count(*) into v_n2 from public.change_log
   where id > v_mark and table_name = 'schedule_slot_classes' and op = 'delete' and action = 'delete_class';
  if v_n2 <> v_n then raise exception 'TEST FAILED: 14d % slot-class removals should be in change_log as delete_class, found %', v_n, v_n2; end if;
  if not exists (select 1 from public.change_log where id > v_mark and table_name = 'schedule_class_colors'
                    and op = 'delete' and action = 'delete_class') then
    raise exception 'TEST FAILED: 14e color removal not in change_log';
  end if;

  -- -------------------------------------------------------------------
  -- Test 15: every write is tagged in change_log with who did it
  -- -------------------------------------------------------------------
  if exists (select 1 from public.change_log c
              where c.table_name in ('schedule_versions', 'schedule_slots', 'schedule_class_colors', 'schedule_slot_classes')
                and c.actor_id = v_admin
                and c.occurred_at >= now()
                and c.action = 'manual') then
    raise exception 'TEST FAILED: 15a an app write was logged as manual';
  end if;
  if (select count(distinct c.action) from public.change_log c
       where c.actor_id = v_admin and c.occurred_at >= now()
         and c.action in ('schedule_add_slots', 'schedule_update_slot', 'schedule_remove_slot', 'schedule_plan_version',
                          'schedule_update_version', 'schedule_delete_version', 'schedule_set_class_color')) <> 7 then
    raise exception 'TEST FAILED: 15b not all 7 functions show up in change_log';
  end if;
  -- every function clears its tags (testing_delete_class ran last and
  -- clears its own too)
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: 15c tags left set: action %, batch %',
      current_setting('tkd.action', true), current_setting('tkd.batch_id', true);
  end if;
  -- one schedule_add_slots call = one batch id for all its rows (Mon + Fri)
  select c.batch_id::text into v_batch from public.change_log c
   where c.table_name = 'schedule_slots' and c.record_id = v_sl2 and c.op = 'insert';
  if v_batch is null
     or (select count(*) from public.change_log c where c.batch_id::text = v_batch and c.table_name = 'schedule_slots') <> 2 then
    raise exception 'TEST FAILED: 15d the two slots of one add (Mon + Fri) should share one batch id';
  end if;

  -- -------------------------------------------------------------------
  -- Test 16: bookkeeping can't be faked; no truncate
  -- -------------------------------------------------------------------
  update public.schedule_slots set version = 99, created_by_name = 'Someone else' where id = v_sl3;
  if (select version from public.schedule_slots where id = v_sl3) <> 1
     or (select created_by_name from public.schedule_slots where id = v_sl3) = 'Someone else' then
    raise exception 'TEST FAILED: 16a bookkeeping columns were overwritten';
  end if;
  begin
    update public.schedule_slots set location_code = 'shrewsbury' where id = v_sl3;
    raise exception 'TEST FAILED: 16b a slot moved school';
  exception when check_violation or foreign_key_violation then null;
  end;
  begin
    update public.schedule_slots set version_id = v_blank where id = v_sl3;
    raise exception 'TEST FAILED: 16c a slot moved to another schedule';
  exception when check_violation then null;
  end;
  begin truncate public.schedule_slots cascade; raise exception 'TEST FAILED: 16d truncate allowed'; exception when raise_exception then null; end;
  begin truncate public.schedule_slot_classes;  raise exception 'TEST FAILED: 16f truncate allowed'; exception when raise_exception then null; end;
  begin truncate public.schedule_versions cascade; raise exception 'TEST FAILED: 16e truncate allowed'; exception when raise_exception then null; end;

  -- -------------------------------------------------------------------
  -- Test 17: combined classes (several classes in ONE time slot, v0.88)
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_txt := concat_ws(',',
    public.schedule_add_slots('worcester', v_cur, '{}'::uuid[], '{2}', '07:00', '07:45') ->> 'status',              -- no class
    public.schedule_add_slots('worcester', v_cur, array[v_cw2, v_cw2], '{2}', '07:00', '07:45') ->> 'status',       -- twice
    public.schedule_add_slots('worcester', v_cur, array[v_cw2, null], '{2}', '07:00', '07:45') ->> 'status',        -- empty id
    public.schedule_add_slots('worcester', v_cur, array[v_cw2, v_cs1], '{2}', '07:00', '07:45') ->> 'status',       -- other school
    public.schedule_add_slots('worcester', v_cur, array[v_cw2, v_rand], '{2}', '07:00', '07:45') ->> 'status');     -- gone
  if v_txt <> 'invalid,invalid,invalid,invalid,stale' then raise exception 'TEST FAILED: 17a class list rules gave %', v_txt; end if;
  -- a third Worcester class, then "w2 + w3" together on Tue and Thu
  v_cw1 := (public.testing_add_class('worcester', v_tag || ' w3', null, false) ->> 'id')::uuid;   -- (w1 was deleted in 14)
  v_r := public.schedule_add_slots('worcester', v_cur, array[v_cw2, v_cw1], '{2,4}', '07:00', '07:45');
  if v_r ->> 'status' <> 'ok' or jsonb_array_length(v_r -> 'slots') <> 2 then raise exception 'TEST FAILED: 17b combined add: %', v_r; end if;
  v_sl1 := (v_r -> 'slots' -> 0 ->> 'id')::uuid;
  v_sl1_v := (v_r -> 'slots' -> 0 ->> 'version')::int;
  if (select array_agg(class_id order by position) from public.schedule_slot_classes where slot_id = v_sl1) <> array[v_cw2, v_cw1] then
    raise exception 'TEST FAILED: 17c both classes should be on the slot, in the order ticked';
  end if;
  -- an overlap with it names both classes
  v_r := public.schedule_add_slots('worcester', v_cur, array[v_cw2], '{2}', '07:30', '08:00');
  if not exists (select 1 from jsonb_array_elements(v_r -> 'overlaps') o
                  where o ->> 'class_name' = v_tag || ' w2 + ' || v_tag || ' w3' and jsonb_array_length(o -> 'class_ids') = 2) then
    raise exception 'TEST FAILED: 17d overlap should name "w2 + w3": %', v_r;
  end if;
  -- changing ONLY the classes is a change: new version, and the old version is stale
  v_r := public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1], 2::smallint, '07:00', '07:45');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> v_sl1_v + 1 then raise exception 'TEST FAILED: 17e class-only change: %', v_r; end if;
  if (select array_agg(class_id) from public.schedule_slot_classes where slot_id = v_sl1) <> array[v_cw1] then
    raise exception 'TEST FAILED: 17f the slot should now have only w3';
  end if;
  v_r := public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw2, v_cw1], 2::smallint, '07:00', '07:45');
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: 17g old version after a class change: %', v_r; end if;
  v_r := public.schedule_update_slot(v_sl1, v_sl1_v + 1, array[v_cw1, v_cw2], 2::smallint, '07:00', '07:45');
  if v_r ->> 'status' <> 'ok' or (select array_agg(class_id order by position) from public.schedule_slot_classes where slot_id = v_sl1) <> array[v_cw1, v_cw2] then
    raise exception 'TEST FAILED: 17h back to two classes, in the new order: %', v_r;
  end if;
  v_sl1_v := (v_r ->> 'version')::int;
  -- changing ONLY the order is a change too (security re-check)
  v_r := public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw2, v_cw1], 2::smallint, '07:00', '07:45');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> v_sl1_v + 1 then raise exception 'TEST FAILED: 17h2 order-only change: %', v_r; end if;
  if (public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1, v_cw2], 2::smallint, '07:00', '07:45') ->> 'status') <> 'stale' then
    raise exception 'TEST FAILED: 17h3 the old version should be stale after an order-only change';
  end if;
  v_sl1_v := v_sl1_v + 1;
  -- editing with a bad class list is refused like adding
  v_txt := concat_ws(',',
    public.schedule_update_slot(v_sl1, v_sl1_v, '{}'::uuid[], 2::smallint, '07:00', '07:45') ->> 'status',
    public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1, v_cw1], 2::smallint, '07:00', '07:45') ->> 'status',
    public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1, v_cs1], 2::smallint, '07:00', '07:45') ->> 'status',
    public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1, v_rand], 2::smallint, '07:00', '07:45') ->> 'status',
    public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                                                 gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()],
                                2::smallint, '07:00', '07:45') ->> 'status');
  if v_txt <> 'invalid,invalid,invalid,stale,invalid' then raise exception 'TEST FAILED: 17h4 update class list rules gave %', v_txt; end if;
  -- put the order back for the steps below
  if (public.schedule_update_slot(v_sl1, v_sl1_v, array[v_cw1, v_cw2], 2::smallint, '07:00', '07:45') ->> 'status') <> 'ok' then
    raise exception 'TEST FAILED: 17h5 restoring the order';
  end if;
  v_sl1_v := v_sl1_v + 1;
  -- removing returns every class (for Undo)
  v_r := public.schedule_remove_slot(v_sl1, v_sl1_v);
  if v_r ->> 'status' <> 'ok' or v_r -> 'removed' -> 'class_ids' <> jsonb_build_array(v_cw1, v_cw2) then
    raise exception 'TEST FAILED: 17i remove should return both classes: %', v_r;
  end if;
  if exists (select 1 from public.schedule_slot_classes where slot_id = v_sl1) then raise exception 'TEST FAILED: 17j its class rows remain'; end if;
  -- planning a change copies combined slots WITH their classes
  select s.id into v_sl2 from public.schedule_slots s
   where s.version_id = v_cur and s.weekday = 4 and s.starts_at = '07:00';
  v_r := public.schedule_plan_version('worcester', 'Combined copy', v_today + 2, true);   -- the schedule just before it is the current one
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 17k plan: %', v_r; end if;
  if not exists (select 1 from public.schedule_slots s
                  where s.version_id = (v_r ->> 'id')::uuid and s.weekday = 4 and s.starts_at = '07:00'
                    and (select array_agg(c.class_id order by c.position) from public.schedule_slot_classes c where c.slot_id = s.id) = array[v_cw2, v_cw1]) then
    raise exception 'TEST FAILED: 17l the copied Thursday slot should keep "w2 + w3"';
  end if;
  -- deleting ONE class of a combined slot keeps the slot with the other class;
  -- deleting its LAST class removes the slot
  v_r := public.testing_delete_class(v_cw1, 1, '{}', '{}', false);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 17m delete w3: %', v_r; end if;
  if (select array_agg(class_id) from public.schedule_slot_classes where slot_id = v_sl2) <> array[v_cw2] then
    raise exception 'TEST FAILED: 17n the combined slot should keep w2';
  end if;
  reset role;
  if (select class_set from public.schedule_slots where id = v_sl2) <> v_cw2::text then
    raise exception 'TEST FAILED: 17n2 the slot''s class_set should now be only w2';
  end if;
  select max(id) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_delete_class(v_cw2, (select version from public.testing_classes where id = v_cw2), '{}', '{}', false);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 17o delete w2: %', v_r; end if;
  if exists (select 1 from public.schedule_slots where id = v_sl2) then raise exception 'TEST FAILED: 17p a slot with no class left should be gone'; end if;
  reset role;
  if not exists (select 1 from public.change_log
                  where id > v_mark and table_name = 'schedule_slots' and record_id = v_sl2 and op = 'delete' and action = 'delete_class') then
    raise exception 'TEST FAILED: 17p2 the emptied slot''s removal should be in change_log as delete_class';
  end if;
  if to_regprocedure('public.schedule_add_slots(text,uuid,uuid,smallint[],time,time)') is not null
     or to_regprocedure('public.schedule_update_slot(uuid,integer,uuid,smallint,time,time)') is not null then
    raise exception 'TEST FAILED: 17s an old one-class function is still there';
  end if;
  if exists (select 1 from public.schedule_slots s where not exists (select 1 from public.schedule_slot_classes c where c.slot_id = s.id)) then
    raise exception 'TEST FAILED: 17q some slot has no class';
  end if;
  if has_column_privilege('authenticated', 'public.schedule_slots', 'class_set', 'select') then
    raise exception 'TEST FAILED: 17r class_set should not be readable by the app';
  end if;

  -- -------------------------------------------------------------------
  -- Catalog: permissions on everything 0005 created
  -- -------------------------------------------------------------------
  foreach v_tbl in array array['schedule_versions', 'schedule_slots', 'schedule_class_colors', 'schedule_slot_classes'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || v_tbl)::regclass) then
      raise exception 'TEST FAILED: C1 RLS is off on %', v_tbl;
    end if;
    if has_table_privilege('anon', 'public.' || v_tbl, 'select')
       or has_table_privilege('anon', 'public.' || v_tbl, 'insert')
       or has_table_privilege('service_role', 'public.' || v_tbl, 'select')
       or has_table_privilege('service_role', 'public.' || v_tbl, 'insert')
       or has_table_privilege('authenticated', 'public.' || v_tbl, 'insert')
       or has_table_privilege('authenticated', 'public.' || v_tbl, 'update')
       or has_table_privilege('authenticated', 'public.' || v_tbl, 'delete')
       or has_table_privilege('authenticated', 'public.' || v_tbl, 'truncate')
       or has_any_column_privilege('anon', 'public.' || v_tbl, 'select')
       or has_any_column_privilege('service_role', 'public.' || v_tbl, 'select')
       or has_column_privilege('authenticated', 'public.' || v_tbl, 'created_by', 'select')
       or has_column_privilege('authenticated', 'public.' || v_tbl, 'updated_by', 'select') then
      raise exception 'TEST FAILED: C2 wrong grants on %', v_tbl;
    end if;
    if (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl) <> 1
       or (select p.cmd from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl) <> 'SELECT'
       or (select p.roles::text from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl) <> '{authenticated}'
       or (select p.qual from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl) not like '%has_data_access()%' then
      raise exception 'TEST FAILED: C3 policy on % should be one SELECT for authenticated using has_data_access()', v_tbl;
    end if;
  end loop;

  for v_fn in
    select p.proname, p.oid, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'schedule\_%'
  loop
    if v_fn.proconfig is null or not ('search_path=""' = any (v_fn.proconfig)) then
      raise exception 'TEST FAILED: C4 % has no search_path = ''''', v_fn.proname;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'execute') or has_function_privilege('service_role', v_fn.oid, 'execute')
       or has_function_privilege('public', v_fn.oid, 'execute') then
      raise exception 'TEST FAILED: C5 % can be called by anon / public / service_role', v_fn.proname;
    end if;
    v_bool := has_function_privilege('authenticated', v_fn.oid, 'execute');
    if v_fn.proname in ('schedule_add_slots', 'schedule_update_slot', 'schedule_remove_slot', 'schedule_plan_version',
                        'schedule_update_version', 'schedule_delete_version', 'schedule_set_class_color', 'schedule_today') then
      if not v_bool then raise exception 'TEST FAILED: C6 the app can''t call %', v_fn.proname; end if;
      if v_fn.proname <> 'schedule_today' and not v_fn.prosecdef then
        raise exception 'TEST FAILED: C7 % should be security definer', v_fn.proname;
      end if;
    elsif v_bool then
      raise exception 'TEST FAILED: C8 the app can call internal helper %', v_fn.proname;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'schedule\_%') <> 19 then
    raise exception 'TEST FAILED: C9 expected 19 schedule_* functions, found %',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'schedule\_%');
  end if;
end;
$$;

select 'ALL 0005 TESTS PASSED' as result;

rollback;
