-- =====================================================================
-- 0008_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0008_calendar.sql (Calendar):
--   who can read the calendar (only unlocked staff sessions), who can
--   change it (only admins, only through the 10 calendar_* functions),
--   every rule those functions enforce (dates, 31 days, times, text,
--   colors, "some classes" closures and the record of each cancelled
--   class, event types and deleting them, "someone else changed it" =
--   stale), what happens when the Schedule changes after a closure, the
--   history (change_log), and a catalog section that checks the
--   permissions on EVERY object 0008 creates.
--   Run it in the Supabase SQL Editor AFTER 0008 is applied. It works on
--   an empty calendar and on a filled one (it makes its own test classes,
--   time slots and types named "zz test ...").
--
-- IS IT SAFE?
--   Yes. One transaction that ends with ROLLBACK: every change is undone.
--   NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same as 0003_tests.sql / 0007_tests.sql (read their headers):
--     A1 admin, fresh password, unlocked     (the one that may write)
--     A2 admin, locked on the server ("Lock now")
--     A3 admin, hit 5 wrong PINs
--     A4 admin, signed out (not in auth.sessions)
--     A5 admin, password sign-in 8 days ago
--     A6 admin, magic-link sign-in (no password)
--     A7 admin, idle time ran out
--     D1 front desk (role staff), unlocked
--     anon = a visitor who is not signed in
--
-- BEFORE YOU RUN IT
--   Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--   the UIDs of an ACTIVE admin and the ACTIVE front-desk account.
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0008 TESTS PASSED".
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
  v_shut  text[];
  v_c_anon text := '{"role": "anon"}';

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date;
  v_day   date;        -- the test day: a week from today
  v_dow   smallint;    -- its weekday (1 Mon .. 7 Sun)
  v_role  text;

  v_r     jsonb;
  v_n     integer;
  v_txt   text;
  v_bool  boolean;
  v_mark  bigint;
  v_rand  uuid := gen_random_uuid();
  v_ver   integer;
  v_batch text;

  -- test classes (w = Worcester, s = Shrewsbury) and time slots
  v_cw1 uuid; v_cw2 uuid; v_cs1 uuid;
  v_vw uuid; v_vs uuid;                 -- the schedules in effect on v_day
  v_slw1 uuid; v_slw2 uuid; v_sls1 uuid; v_sl_other uuid;
  -- calendar rows
  v_t1 uuid; v_t1_v integer; v_t2 uuid; v_t3 uuid;
  v_e1 uuid; v_e1_v integer; v_e2 uuid;
  v_cl1 uuid; v_cl2 uuid; v_cl2_v integer;
  v_ids uuid[];
  v_plan uuid; v_slp uuid; v_pd date;   -- a planned Worcester schedule (after v_day) and its slot

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
  if to_regclass('public.calendar_events') is null then
    raise exception 'TEST SETUP: public.calendar_events is missing (is 0008 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id)
  select x, v_admin from unnest(array[v_a1, v_a2, v_a3, v_a5, v_a6, v_a7]) as x
  union all select v_d1, v_desk;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),
    (v_a3, v_admin, now() + interval '30 minutes'),
    (v_a4, v_admin, now() + interval '30 minutes'),
    (v_a5, v_admin, now() + interval '30 minutes'),
    (v_a6, v_admin, now() + interval '30 minutes'),
    (v_a7, v_admin, to_timestamp(v_now_s - 2 * 3600) + interval '45 minutes'),
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
  v_day   := v_today + 7;
  v_dow   := extract(isodow from v_day)::smallint;

  -- Test classes and time slots, made the normal way (as A1). The slots
  -- go into the schedule IN EFFECT on v_day for each school (a school
  -- with no schedule at all gets its first one, starting today).
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

  select v.id into v_vw from public.schedule_versions v
   where v.location_code = 'worcester' and v.starts_on <= v_day order by v.starts_on desc limit 1;
  if v_vw is null and exists (select 1 from public.schedule_versions v where v.location_code = 'worcester') then
    raise exception 'TEST SETUP: Worcester has schedules, but none in effect on %', v_day;
  end if;
  v_r := public.schedule_add_slots('worcester', v_vw, array[v_cw1], array[v_dow], '06:00', '06:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: Worcester slot 1: %', v_r; end if;
  v_vw := (v_r ->> 'version_id')::uuid;
  v_slw1 := (v_r -> 'slots' -> 0 ->> 'id')::uuid;
  v_r := public.schedule_add_slots('worcester', v_vw, array[v_cw2, v_cw1], array[v_dow], '06:45', '07:30');   -- combined
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: Worcester slot 2: %', v_r; end if;
  v_slw2 := (v_r -> 'slots' -> 0 ->> 'id')::uuid;
  v_r := public.schedule_add_slots('worcester', v_vw, array[v_cw1], array[(v_dow % 7 + 1)::smallint], '06:00', '06:45');   -- the next weekday
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: Worcester other-day slot: %', v_r; end if;
  v_sl_other := (v_r -> 'slots' -> 0 ->> 'id')::uuid;

  select v.id into v_vs from public.schedule_versions v
   where v.location_code = 'shrewsbury' and v.starts_on <= v_day order by v.starts_on desc limit 1;
  if v_vs is null and exists (select 1 from public.schedule_versions v where v.location_code = 'shrewsbury') then
    raise exception 'TEST SETUP: Shrewsbury has schedules, but none in effect on %', v_day;
  end if;
  v_r := public.schedule_add_slots('shrewsbury', v_vs, array[v_cs1], array[v_dow], '06:00', '06:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: Shrewsbury slot: %', v_r; end if;
  v_vs := (v_r ->> 'version_id')::uuid;
  v_sls1 := (v_r -> 'slots' -> 0 ->> 'id')::uuid;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 1: the five ready-made event types were added once, by
  --         "Calendar setup" (history), with the mockup's colors
  -- -------------------------------------------------------------------
  if (select count(*) from public.change_log
       where table_name = 'calendar_event_types' and op = 'insert' and action = 'calendar_setup_types') <> 5 then
    raise exception 'TEST FAILED: 1a the 5 ready-made types should be in change_log exactly once';
  end if;
  if (select string_agg((l.after ->> 'name') || ':' || (l.after ->> 'color'), ',' order by (l.after ->> 'position')::int)
        from public.change_log l
       where l.table_name = 'calendar_event_types' and l.op = 'insert' and l.action = 'calendar_setup_types')
     <> 'Testing:purple,Tournament:sky,Camp:teal,Meeting:orange,Party:pink' then
    raise exception 'TEST FAILED: 1b ready-made types should be Testing purple, Tournament sky, Camp teal, Meeting orange, Party pink';
  end if;
  if exists (select 1 from public.change_log l
              where l.table_name = 'calendar_event_types' and l.action = 'calendar_setup_types'
                and l.actor_name <> 'Calendar setup') then
    raise exception 'TEST FAILED: 1c ready-made types should be logged as "Calendar setup"';
  end if;

  -- -------------------------------------------------------------------
  -- Test 2: a visitor who is NOT signed in can read nothing and call
  --         nothing
  -- -------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform 1 from public.calendar_event_types;     raise exception 'TEST FAILED: 2a anon read types';     exception when insufficient_privilege then null; end;
  begin perform 1 from public.calendar_events;          raise exception 'TEST FAILED: 2b anon read events';    exception when insufficient_privilege then null; end;
  begin perform 1 from public.calendar_closures;        raise exception 'TEST FAILED: 2c anon read closures';  exception when insufficient_privilege then null; end;
  begin perform 1 from public.calendar_closure_classes; raise exception 'TEST FAILED: 2d anon read closure classes'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_add_event('worcester', v_rand, 'x', v_day, v_day, true, null, null, null);
        raise exception 'TEST FAILED: 2e anon called calendar_add_event'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_update_event(v_rand, 1, 'worcester', v_rand, 'x', v_day, v_day, true, null, null, null);
        raise exception 'TEST FAILED: 2f anon called calendar_update_event'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_remove_event(v_rand, 1);
        raise exception 'TEST FAILED: 2g anon called calendar_remove_event'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_add_closure('worcester', v_day, v_day, 'x', true, '{}');
        raise exception 'TEST FAILED: 2h anon called calendar_add_closure'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_update_closure(v_rand, 1, 'worcester', v_day, v_day, 'x', true, '{}');
        raise exception 'TEST FAILED: 2i anon called calendar_update_closure'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_remove_closure(v_rand, 1);
        raise exception 'TEST FAILED: 2j anon called calendar_remove_closure'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_add_type('x', 'teal');
        raise exception 'TEST FAILED: 2k anon called calendar_add_type'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_update_type(v_rand, 1, 'x', 'teal');
        raise exception 'TEST FAILED: 2l anon called calendar_update_type'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_reorder_types('{}', '{}');
        raise exception 'TEST FAILED: 2m anon called calendar_reorder_types'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_delete_type(v_rand, 1, 0, null);
        raise exception 'TEST FAILED: 2n anon called calendar_delete_type'; exception when insufficient_privilege then null; end;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 3: a signed-in browser can't write the tables directly, read the
  --         login-id columns or class_key, or call the internal helpers
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin insert into public.calendar_event_types (name, color) values ('x', 'teal');
        raise exception 'TEST FAILED: 3a admin inserted a type directly'; exception when insufficient_privilege then null; end;
  begin insert into public.calendar_events (location_code, type_id, title, starts_on, ends_on, all_day)
        values ('worcester', v_rand, 'x', v_day, v_day, true);
        raise exception 'TEST FAILED: 3b admin inserted an event directly'; exception when insufficient_privilege then null; end;
  begin update public.calendar_closures set reason = 'x';
        raise exception 'TEST FAILED: 3c admin updated closures directly'; exception when insufficient_privilege then null; end;
  begin delete from public.calendar_closure_classes;
        raise exception 'TEST FAILED: 3d admin removed closure classes directly'; exception when insufficient_privilege then null; end;
  begin delete from public.calendar_event_types;
        raise exception 'TEST FAILED: 3e admin removed types directly'; exception when insufficient_privilege then null; end;
  begin perform t.created_by from public.calendar_event_types t;
        raise exception 'TEST FAILED: 3f created_by is readable'; exception when insufficient_privilege then null; end;
  begin perform c.class_key from public.calendar_closures c;
        raise exception 'TEST FAILED: 3g class_key is readable'; exception when insufficient_privilege then null; end;
  begin perform e.updated_by from public.calendar_events e;
        raise exception 'TEST FAILED: 3h updated_by is readable'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_lock_schools();
        raise exception 'TEST FAILED: 3i the app can call calendar_lock_schools'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_save_closure_classes(v_rand, null, v_day, array[v_slw1]);
        raise exception 'TEST FAILED: 3j the app can call calendar_save_closure_classes'; exception when insufficient_privilege then null; end;
  begin perform public.calendar_text_is_valid('x', 10);
        raise exception 'TEST FAILED: 3k the app can call calendar_text_is_valid'; exception when insufficient_privilege then null; end;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 4: shut-out sessions (A2-A7) see no rows and get no_access
  -- -------------------------------------------------------------------
  for v_n in 1 .. array_length(v_shut, 1) loop
    set local role authenticated;
    perform set_config('request.jwt.claims', v_shut[v_n], true);
    if (select count(*) from public.calendar_event_types) <> 0
       or (select count(*) from public.calendar_events) <> 0
       or (select count(*) from public.calendar_closures) <> 0
       or (select count(*) from public.calendar_closure_classes) <> 0 then
      raise exception 'TEST FAILED: 4a shut-out session A% can read calendar rows', v_n + 1;
    end if;
    v_txt := concat_ws(',',
      public.calendar_add_type(v_tag || ' t', 'teal') ->> 'status',
      public.calendar_add_event('worcester', v_rand, 'x', v_day, v_day, true, null, null, null) ->> 'status',
      public.calendar_add_closure('worcester', v_day, v_day, 'x', true, '{}') ->> 'status',
      public.calendar_remove_event(v_rand, 1) ->> 'status',
      public.calendar_delete_type(v_rand, 1, 0, null) ->> 'status');
    if v_txt <> 'no_access,no_access,no_access,no_access,no_access' then
      raise exception 'TEST FAILED: 4b shut-out session A% got %', v_n + 1, v_txt;
    end if;
    reset role;
  end loop;

  -- -------------------------------------------------------------------
  -- Test 5: the front desk (staff) can read but not change anything
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if (select count(*) from public.calendar_event_types) = 0 then
    raise exception 'TEST FAILED: 5a staff should read the event types';
  end if;
  v_txt := concat_ws(',',
    public.calendar_add_type(v_tag || ' t', 'teal') ->> 'status',
    public.calendar_update_type(v_rand, 1, 'x', 'teal') ->> 'status',
    public.calendar_reorder_types('{}', '{}') ->> 'status',
    public.calendar_delete_type(v_rand, 1, 0, null) ->> 'status',
    public.calendar_add_event('worcester', v_rand, 'x', v_day, v_day, true, null, null, null) ->> 'status',
    public.calendar_update_event(v_rand, 1, 'worcester', v_rand, 'x', v_day, v_day, true, null, null, null) ->> 'status',
    public.calendar_remove_event(v_rand, 1) ->> 'status',
    public.calendar_add_closure('worcester', v_day, v_day, 'x', true, '{}') ->> 'status',
    public.calendar_update_closure(v_rand, 1, 'worcester', v_day, v_day, 'x', true, '{}') ->> 'status',
    public.calendar_remove_closure(v_rand, 1) ->> 'status');
  if v_txt <> 'not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed' then
    raise exception 'TEST FAILED: 5b staff writes gave %', v_txt;
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 6: event types (admin)
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.calendar_add_type('  ' || v_tag || '   one ', 'teal');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 6a add type: %', v_r; end if;
  v_t1 := (v_r ->> 'id')::uuid;
  v_t1_v := (v_r ->> 'version')::integer;
  if (select name from public.calendar_event_types where id = v_t1) <> v_tag || ' one' then
    raise exception 'TEST FAILED: 6b type name should be cleaned up';
  end if;
  if (select position from public.calendar_event_types where id = v_t1)
     <> (select max(position) from public.calendar_event_types) then
    raise exception 'TEST FAILED: 6c a new type goes at the end';
  end if;
  v_txt := concat_ws(',',
    public.calendar_add_type(upper(v_tag) || ' ONE', 'sky') ->> 'status',          -- same name, other case
    public.calendar_add_type(v_tag || ' two', 'red') ->> 'status',                  -- red is never allowed
    public.calendar_add_type(v_tag || ' two', 'blue') ->> 'status',                 -- not one of the 8
    public.calendar_add_type('   ', 'teal') ->> 'status',                           -- empty
    public.calendar_add_type(repeat('x', 41), 'teal') ->> 'status',                 -- 41 characters
    public.calendar_add_type('Bad' || chr(8203) || 'name', 'teal') ->> 'status',    -- zero-width space
    public.calendar_add_type('Bad' || chr(7) || 'name', 'teal') ->> 'status',       -- control character
    public.calendar_add_type(null, 'teal') ->> 'status');
  if v_txt <> 'duplicate_name,invalid,invalid,invalid,invalid,invalid,invalid,invalid' then
    raise exception 'TEST FAILED: 6d type input rules gave %', v_txt;
  end if;
  v_t2 := (public.calendar_add_type(v_tag || ' two', 'pink') ->> 'id')::uuid;
  v_t3 := (public.calendar_add_type(v_tag || ' three', 'gray') ->> 'id')::uuid;
  if v_t2 is null or v_t3 is null then raise exception 'TEST FAILED: 6e could not add types two and three'; end if;
  -- update: stale, duplicate, ok (recolor bumps the version)
  v_txt := concat_ws(',',
    public.calendar_update_type(v_t1, v_t1_v + 1, v_tag || ' one', 'sky') ->> 'status',
    public.calendar_update_type(v_t1, v_t1_v, v_tag || ' TWO', 'sky') ->> 'status',
    public.calendar_update_type(v_rand, 1, v_tag || ' four', 'sky') ->> 'status',
    public.calendar_update_type(v_t1, v_t1_v, v_tag || ' one', 'red') ->> 'status');
  if v_txt <> 'stale,duplicate_name,not_found,invalid' then raise exception 'TEST FAILED: 6f update rules gave %', v_txt; end if;
  v_r := public.calendar_update_type(v_t1, v_t1_v, v_tag || ' one', 'sky');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> v_t1_v + 1 then raise exception 'TEST FAILED: 6g recolor: %', v_r; end if;
  v_t1_v := v_t1_v + 1;
  v_r := public.calendar_update_type(v_t1, v_t1_v, v_tag || ' one', 'sky');   -- nothing changed
  if (v_r ->> 'version')::integer <> v_t1_v then raise exception 'TEST FAILED: 6h saving unchanged values should keep the version: %', v_r; end if;
  -- reorder: last three swapped; versions unchanged
  v_ids := array(select id from public.calendar_event_types order by position, id);
  v_txt := concat_ws(',',
    public.calendar_reorder_types(v_ids[2:], v_ids[2:]) ->> 'status',                                   -- the screen missed one
    public.calendar_reorder_types(v_ids, v_ids[2:] || v_rand) ->> 'status',                             -- other ids
    public.calendar_reorder_types(v_ids, v_ids || v_rand) ->> 'status');                                -- one more
  if v_txt <> 'stale,invalid,invalid' then raise exception 'TEST FAILED: 6i reorder rules gave %', v_txt; end if;
  v_r := public.calendar_reorder_types(v_ids, v_ids[1:cardinality(v_ids) - 3] || array[v_t3, v_t2, v_t1]);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 6j reorder: %', v_r; end if;
  if (select array_agg(id order by position, id) from public.calendar_event_types) <> v_ids[1:cardinality(v_ids) - 3] || array[v_t3, v_t2, v_t1]
     or (select version from public.calendar_event_types where id = v_t1) <> v_t1_v then
    raise exception 'TEST FAILED: 6k reorder should change the order only (not the version)';
  end if;

  -- -------------------------------------------------------------------
  -- Test 7: events
  -- -------------------------------------------------------------------
  v_r := public.calendar_add_event('worcester', v_t1, '  ' || v_tag || '  tournament ', v_day, v_day, false, '09:00', '15:30',
                                   E'  Line one\r\nLine two  ');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 7a add event: %', v_r; end if;
  v_e1 := (v_r ->> 'id')::uuid;
  v_e1_v := (v_r ->> 'version')::integer;
  if (select title from public.calendar_events where id = v_e1) <> v_tag || ' tournament'
     or (select notes from public.calendar_events where id = v_e1) <> E'Line one\nLine two' then
    raise exception 'TEST FAILED: 7b title and notes should be cleaned up';
  end if;
  -- both schools; several days with times; 31 days
  v_r := public.calendar_add_event(null, v_t2, v_tag || ' camp', v_day, v_day + 2, false, '19:30', '12:00', null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 7c both schools, Fri 7:30 pm -> Sun 12:00: %', v_r; end if;
  v_e2 := (v_r ->> 'id')::uuid;
  if (select location_code from public.calendar_events where id = v_e2) is not null then
    raise exception 'TEST FAILED: 7d a Both event has no school';
  end if;
  v_r := public.calendar_add_event('shrewsbury', v_t2, v_tag || ' long', v_day, v_day + 30, true, null, null, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 7e 31 days should be allowed: %', v_r; end if;
  v_txt := concat_ws(',',
    public.calendar_add_event('boston', v_t1, 'x', v_day, v_day, true, null, null, null) ->> 'status',           -- no such school
    public.calendar_add_event('worcester', null, 'x', v_day, v_day, true, null, null, null) ->> 'status',        -- no type
    public.calendar_add_event('worcester', v_t1, '  ', v_day, v_day, true, null, null, null) ->> 'status',       -- no title
    public.calendar_add_event('worcester', v_t1, repeat('x', 81), v_day, v_day, true, null, null, null) ->> 'status',
    public.calendar_add_event('worcester', v_t1, 'a' || chr(8238) || 'b', v_day, v_day, true, null, null, null) ->> 'status',
    public.calendar_add_event('worcester', v_t1, 'x', v_day, v_day, true, '09:00', '10:00', null) ->> 'status',  -- all day with times
    public.calendar_add_event('worcester', v_t1, 'x', v_day, v_day, false, null, null, null) ->> 'status',       -- times missing
    public.calendar_add_event('worcester', v_t1, 'x', v_day, v_day, false, '10:00', '10:00', null) ->> 'status', -- same day, no length
    public.calendar_add_event('worcester', v_t1, 'x', v_day, v_day, false, '10:03', '11:00', null) ->> 'status', -- not 5-minute
    public.calendar_add_event('worcester', v_t1, 'x', v_day, v_day - 1, true, null, null, null) ->> 'status',    -- ends before
    public.calendar_add_event('worcester', v_t1, 'x', v_day, v_day + 31, true, null, null, null) ->> 'status',   -- 32 days
    public.calendar_add_event('worcester', v_t1, 'x', date '2206-01-01', date '2206-01-01', true, null, null, null) ->> 'status',
    public.calendar_add_event('worcester', v_t1, 'x', v_day, v_day, true, null, null, repeat('n', 1001)) ->> 'status',
    public.calendar_add_event('worcester', v_t1, 'x', v_day, v_day, true, null, null, E'a\tb') ->> 'status',      -- tab in notes
    public.calendar_add_event('worcester', v_rand, 'x', v_day, v_day, true, null, null, null) ->> 'status');      -- type gone
  if v_txt <> 'invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,stale' then
    raise exception 'TEST FAILED: 7f event input rules gave %', v_txt;
  end if;
  -- update
  v_txt := concat_ws(',',
    public.calendar_update_event(v_e1, v_e1_v + 1, 'worcester', v_t1, 'x', v_day, v_day, true, null, null, null) ->> 'status',
    public.calendar_update_event(v_rand, 1, 'worcester', v_t1, 'x', v_day, v_day, true, null, null, null) ->> 'status',
    public.calendar_update_event(v_e1, v_e1_v, 'worcester', v_t1, 'x', v_day, v_day + 31, true, null, null, null) ->> 'status');
  if v_txt <> 'stale,not_found,invalid' then raise exception 'TEST FAILED: 7g update rules gave %', v_txt; end if;
  v_r := public.calendar_update_event(v_e1, v_e1_v, null, v_t1, v_tag || ' tournament', v_day, v_day, true, null, null, E'Line one\nLine two');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> v_e1_v + 1 then raise exception 'TEST FAILED: 7h move to Both, all day: %', v_r; end if;
  v_e1_v := v_e1_v + 1;
  v_r := public.calendar_update_event(v_e1, v_e1_v, null, v_t1, v_tag || ' tournament', v_day, v_day, true, null, null, E'Line one\nLine two');
  if (v_r ->> 'version')::integer <> v_e1_v then raise exception 'TEST FAILED: 7i unchanged save should keep the version: %', v_r; end if;
  -- remove + Undo
  v_r := public.calendar_remove_event(v_e2, 1);
  if v_r ->> 'status' <> 'ok' or v_r -> 'removed' ->> 'title' <> v_tag || ' camp'
     or v_r -> 'removed' ->> 'starts_at' <> '19:30' or (v_r -> 'removed' -> 'location_code') <> 'null'::jsonb then
    raise exception 'TEST FAILED: 7j remove should return the event: %', v_r;
  end if;
  if exists (select 1 from public.calendar_events where id = v_e2) then raise exception 'TEST FAILED: 7k removed event still there'; end if;
  v_r := public.calendar_add_event(null, (v_r -> 'removed' ->> 'type_id')::uuid, v_r -> 'removed' ->> 'title',
                                   (v_r -> 'removed' ->> 'starts_on')::date, (v_r -> 'removed' ->> 'ends_on')::date,
                                   (v_r -> 'removed' ->> 'all_day')::boolean, (v_r -> 'removed' ->> 'starts_at')::time,
                                   (v_r -> 'removed' ->> 'ends_at')::time, v_r -> 'removed' ->> 'notes');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 7l Undo (add it back): %', v_r; end if;
  v_e2 := (v_r ->> 'id')::uuid;
  if public.calendar_remove_event(v_e2, 2) ->> 'status' <> 'stale' then raise exception 'TEST FAILED: 7m remove with an old version should be stale'; end if;

  -- -------------------------------------------------------------------
  -- Test 8: closures
  -- -------------------------------------------------------------------
  v_r := public.calendar_add_closure('worcester', v_day, v_day + 30, '  ' || v_tag || '  break ', true, '{}');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 8a whole-day closure: %', v_r; end if;
  v_cl1 := (v_r ->> 'id')::uuid;
  if (select reason from public.calendar_closures where id = v_cl1) <> v_tag || ' break' then
    raise exception 'TEST FAILED: 8b reason should be cleaned up';
  end if;
  v_txt := concat_ws(',',
    public.calendar_add_closure('worcester', v_day, v_day + 31, 'x', true, '{}') ->> 'status',              -- 32 days
    public.calendar_add_closure('worcester', v_day, v_day, 'x', true, array[v_slw1]) ->> 'status',          -- whole day + classes
    public.calendar_add_closure('worcester', v_day, v_day + 1, 'x', false, array[v_slw1]) ->> 'status',     -- some classes, 2 days
    public.calendar_add_closure('worcester', v_day, v_day, 'x', false, '{}') ->> 'status',                  -- some classes, none ticked
    public.calendar_add_closure('worcester', v_day, v_day, 'x', false, array[v_slw1, v_slw1]) ->> 'status', -- twice
    public.calendar_add_closure('worcester', v_day, v_day, '', true, '{}') ->> 'status',                    -- no reason
    public.calendar_add_closure('boston', v_day, v_day, 'x', true, '{}') ->> 'status',
    public.calendar_add_closure('worcester', v_day, v_day, 'x', false, array[v_sls1]) ->> 'status',         -- other school's class
    public.calendar_add_closure('worcester', v_day, v_day, 'x', false, array[v_sl_other]) ->> 'status',     -- not on that weekday
    public.calendar_add_closure('worcester', v_day, v_day, 'x', false, array[v_rand]) ->> 'status',         -- no such slot
    public.calendar_add_closure('worcester', v_day, v_day, 'x', null, '{}') ->> 'status');
  if v_txt <> 'invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,stale,stale,invalid' then
    raise exception 'TEST FAILED: 8c closure input rules gave %', v_txt;
  end if;
  if exists (select 1 from public.calendar_closures c where c.reason = 'x') then
    raise exception 'TEST FAILED: 8d a refused closure was kept';
  end if;
  -- some classes, both schools: one Worcester combined slot + one Shrewsbury slot
  v_r := public.calendar_add_closure(null, v_day, v_day, v_tag || ' storm', false, array[v_slw2, v_sls1]);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 8e Both, some classes: %', v_r; end if;
  v_cl2 := (v_r ->> 'id')::uuid;
  v_cl2_v := (v_r ->> 'version')::integer;
  if (select count(*) from public.calendar_closure_classes where closure_id = v_cl2) <> 2 then
    raise exception 'TEST FAILED: 8f expected 2 cancelled-class records';
  end if;
  if not exists (select 1 from public.calendar_closure_classes x
                  where x.closure_id = v_cl2 and x.location_code = 'worcester' and x.slot_id = v_slw2
                    and x.weekday = v_dow and x.starts_at = '06:45' and x.ends_at = '07:30'
                    and x.class_ids = array[v_cw2, v_cw1] and x.class_names = v_tag || ' w2 + ' || v_tag || ' w1')
     or not exists (select 1 from public.calendar_closure_classes x
                     where x.closure_id = v_cl2 and x.location_code = 'shrewsbury' and x.slot_id = v_sls1
                       and x.class_ids = array[v_cs1]) then
    raise exception 'TEST FAILED: 8g the records should keep day, time, classes in order and names';
  end if;
  -- changing only the reason keeps the records
  v_ids := array(select id from public.calendar_closure_classes where closure_id = v_cl2 order by id);
  v_r := public.calendar_update_closure(v_cl2, v_cl2_v, null, v_day, v_day, v_tag || ' snow', false, array[v_sls1, v_slw2]);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> v_cl2_v + 1 then raise exception 'TEST FAILED: 8h reason only: %', v_r; end if;
  v_cl2_v := v_cl2_v + 1;
  if array(select id from public.calendar_closure_classes where closure_id = v_cl2 order by id) <> v_ids then
    raise exception 'TEST FAILED: 8i the records should stay when only the reason changes';
  end if;
  -- other ticked classes: version up, records replaced; old version stale
  v_r := public.calendar_update_closure(v_cl2, v_cl2_v, null, v_day, v_day, v_tag || ' snow', false, array[v_slw1]);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> v_cl2_v + 1 then raise exception 'TEST FAILED: 8j other classes: %', v_r; end if;
  if (select array_agg(slot_id) from public.calendar_closure_classes where closure_id = v_cl2) <> array[v_slw1] then
    raise exception 'TEST FAILED: 8k the records should be replaced';
  end if;
  if public.calendar_update_closure(v_cl2, v_cl2_v, null, v_day, v_day, v_tag || ' snow', false, array[v_slw2]) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: 8l an old version should be stale';
  end if;
  v_cl2_v := v_cl2_v + 1;
  -- a refused update changes nothing
  if public.calendar_update_closure(v_cl2, v_cl2_v, 'worcester', v_day, v_day, v_tag || ' snow', false, array[v_sl_other]) ->> 'status' <> 'stale'
     or (select array_agg(slot_id) from public.calendar_closure_classes where closure_id = v_cl2) <> array[v_slw1]
     or (select version from public.calendar_closures where id = v_cl2) <> v_cl2_v then
    raise exception 'TEST FAILED: 8m a refused update should change nothing';
  end if;
  -- a slot of ANOTHER schedule of the same school (a planned one that
  -- starts after the closure date) is not in effect that day -> stale
  v_pd := v_day + 20;
  while exists (select 1 from public.schedule_versions where location_code = 'worcester' and starts_on = v_pd) loop
    v_pd := v_pd + 7;
  end loop;
  v_r := public.schedule_plan_version('worcester', v_tag, v_pd, false);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: plan a schedule: %', v_r; end if;
  v_plan := (v_r ->> 'id')::uuid;
  v_r := public.schedule_add_slots('worcester', v_plan, array[v_cw1], array[v_dow], '08:00', '08:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: planned slot: %', v_r; end if;
  v_slp := (v_r -> 'slots' -> 0 ->> 'id')::uuid;
  if public.calendar_add_closure('worcester', v_day, v_day, 'x', false, array[v_slp]) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: 8m2 a slot from a schedule not in effect that day should be stale';
  end if;
  -- back to two classes (for test 9)
  v_r := public.calendar_update_closure(v_cl2, v_cl2_v, null, v_day, v_day, v_tag || ' snow', false, array[v_slw1, v_slw2, v_sls1]);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 8n three classes: %', v_r; end if;
  v_cl2_v := (v_r ->> 'version')::integer;

  -- -------------------------------------------------------------------
  -- Test 9: the Schedule changes after the closure (v0.239 answer 2):
  --         the records stay exactly as they were
  -- -------------------------------------------------------------------
  v_ids := array(select id from public.calendar_closure_classes where closure_id = v_cl2 order by id);
  v_txt := (select string_agg(row(x.id, x.location_code, x.weekday, x.starts_at, x.ends_at, x.class_ids, x.class_names, x.slot_id, x.version, x.updated_at)::text, '|' order by x.id) from public.calendar_closure_classes x where x.closure_id = v_cl2);
  -- slot w1 moves to another weekday
  v_r := public.schedule_update_slot(v_slw1, 1, array[v_cw1], (v_dow % 7 + 1)::smallint, '06:00', '06:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: move slot: %', v_r; end if;
  -- the combined slot is removed
  v_r := public.schedule_remove_slot(v_slw2, (select version from public.schedule_slots where id = v_slw2));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: remove slot: %', v_r; end if;
  -- a class is deleted in Testing
  v_r := public.testing_delete_class(v_cs1, (select version from public.testing_classes where id = v_cs1), '{}', '{}', false);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: delete class s1: %', v_r; end if;
  -- a planned schedule now starts earlier: on the closure day itself
  v_r := public.schedule_update_version(v_plan, (select version from public.schedule_versions where id = v_plan), v_tag, v_day);
  if v_r ->> 'status' not in ('ok', 'duplicate_date') then raise exception 'TEST SETUP: move planned schedule: %', v_r; end if;
  if (select string_agg(row(x.id, x.location_code, x.weekday, x.starts_at, x.ends_at, x.class_ids, x.class_names, x.slot_id, x.version, x.updated_at)::text, '|' order by x.id) from public.calendar_closure_classes x where x.closure_id = v_cl2) <> v_txt
     or (select version from public.calendar_closures where id = v_cl2) <> v_cl2_v then
    raise exception 'TEST FAILED: 9a schedule changes must not change the closure or its records';
  end if;
  -- Undo of the removed slot gives a new slot id: the record keeps the old hint
  -- (the app matches by day, time and classes, not by id)
  v_r := public.calendar_update_closure(v_cl2, v_cl2_v, null, v_day, v_day, v_tag || ' snow', false, array[v_slw2]);
  if v_r ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: 9b a slot that is gone should make an update stale: %', v_r;
  end if;
  -- the closure itself can still be edited with what is on the schedule now
  v_r := public.calendar_update_closure(v_cl2, v_cl2_v, null, v_day, v_day, v_tag || ' snow', true, '{}');
  if v_r ->> 'status' <> 'ok' or exists (select 1 from public.calendar_closure_classes where closure_id = v_cl2) then
    raise exception 'TEST FAILED: 9c switching to a whole day should drop the records: %', v_r;
  end if;
  v_cl2_v := (v_r ->> 'version')::integer;

  -- -------------------------------------------------------------------
  -- Test 10: removing a closure (and Undo)
  -- -------------------------------------------------------------------
  v_r := public.calendar_add_closure('shrewsbury', v_day + 1, v_day + 1, v_tag || ' power', true, '{}');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 10a add: %', v_r; end if;
  v_r := public.calendar_remove_closure((v_r ->> 'id')::uuid, 1);
  if v_r ->> 'status' <> 'ok' or v_r -> 'removed' ->> 'reason' <> v_tag || ' power'
     or (v_r -> 'removed' ->> 'whole_day')::boolean is not true or v_r -> 'removed' -> 'slot_ids' <> '[]'::jsonb then
    raise exception 'TEST FAILED: 10b remove should return the closure: %', v_r;
  end if;
  if public.calendar_remove_closure(v_cl1, 99) ->> 'status' <> 'stale' or public.calendar_remove_closure(v_rand, 1) ->> 'status' <> 'not_found' then
    raise exception 'TEST FAILED: 10c remove stale / not found';
  end if;

  -- -------------------------------------------------------------------
  -- Test 11: deleting event types
  -- -------------------------------------------------------------------
  -- v_t1 is used by v_e1; v_t2 by v_e2 and "long"; v_t3 by nothing
  select version into v_ver from public.calendar_event_types where id = v_t1;
  v_txt := concat_ws(',',
    public.calendar_delete_type(v_t1, v_ver, 0, null) ->> 'status',          -- the screen said 0 events
    public.calendar_delete_type(v_t1, v_ver, 1, null) ->> 'status',          -- nowhere to move
    public.calendar_delete_type(v_t1, v_ver, 1, v_t1) ->> 'status',          -- move to itself
    public.calendar_delete_type(v_t1, v_ver, 1, v_rand) ->> 'status',        -- move-to type gone
    public.calendar_delete_type(v_t1, v_ver + 1, 1, v_t3) ->> 'status',      -- old version
    public.calendar_delete_type(v_rand, 1, 0, null) ->> 'status',
    public.calendar_delete_type(v_t1, v_ver, -1, null) ->> 'status');
  if v_txt <> 'stale,invalid,invalid,stale,stale,not_found,invalid' then raise exception 'TEST FAILED: 11a delete rules gave %', v_txt; end if;
  reset role;
  select max(id) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.calendar_delete_type(v_t1, v_ver, 1, v_t3);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'moved')::integer <> 1 then raise exception 'TEST FAILED: 11b delete + move: %', v_r; end if;
  if (select type_id from public.calendar_events where id = v_e1) <> v_t3
     or exists (select 1 from public.calendar_event_types where id = v_t1) then
    raise exception 'TEST FAILED: 11c the event should move to type three and type one be gone';
  end if;
  v_r := public.calendar_delete_type(v_t2, (select version from public.calendar_event_types where id = v_t2), 2, v_t3);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'moved')::integer <> 2 then raise exception 'TEST FAILED: 11d delete type two (2 events): %', v_r; end if;
  reset role;
  -- history: the move and the delete in one batch, tagged calendar_delete_type
  if (select count(distinct l.batch_id) from public.change_log l where l.id > v_mark and l.action = 'calendar_delete_type' and l.batch_id is not null) <> 2
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'calendar_events'
                     and l.record_id = v_e1 and l.op = 'update' and l.action = 'calendar_delete_type')
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'calendar_event_types'
                     and l.record_id = v_t1 and l.op = 'delete' and l.action = 'calendar_delete_type') then
    raise exception 'TEST FAILED: 11e the move and the delete should be in change_log (one batch per delete)';
  end if;

  -- -------------------------------------------------------------------
  -- Test 12: history (change_log) for the other writes
  -- -------------------------------------------------------------------
  if not exists (select 1 from public.change_log l where l.table_name = 'calendar_events' and l.record_id = v_e1
                  and l.op = 'insert' and l.action = 'calendar_add_event' and l.location_code = 'worcester' and l.batch_id is not null)
     or not exists (select 1 from public.change_log l where l.table_name = 'calendar_events' and l.record_id = v_e1
                     and l.op = 'update' and l.action = 'calendar_update_event' and l.location_code is null)
     or not exists (select 1 from public.change_log l where l.table_name = 'calendar_closures' and l.record_id = v_cl2
                     and l.op = 'insert' and l.action = 'calendar_add_closure' and l.location_code is null)
     or not exists (select 1 from public.change_log l where l.table_name = 'calendar_closure_classes'
                     and l.op = 'delete' and l.action = 'calendar_update_closure')
     or not exists (select 1 from public.change_log l where l.table_name = 'calendar_event_types' and l.record_id = v_t1
                     and l.op = 'update' and l.action = 'calendar_update_type') then
    raise exception 'TEST FAILED: 12a calendar writes should be in change_log with their action, school (NULL = Both) and batch';
  end if;
  if exists (select 1 from public.change_log l where l.table_name like 'calendar\_%' and l.action = '' ) then
    raise exception 'TEST FAILED: 12b a calendar change has no action tag';
  end if;
  if current_setting('tkd.action', true) <> '' or current_setting('tkd.batch_id', true) <> '' then
    raise exception 'TEST FAILED: 12c the action / batch tags should be cleared after each function';
  end if;

  -- -------------------------------------------------------------------
  -- Catalog: permissions on everything 0008 created
  -- -------------------------------------------------------------------
  foreach v_tbl in array array['calendar_event_types', 'calendar_events', 'calendar_closures', 'calendar_closure_classes'] loop
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
    if (select count(*) from pg_trigger t where t.tgrelid = ('public.' || v_tbl)::regclass and not t.tgisinternal) <> 3 then
      raise exception 'TEST FAILED: C3b % should have its 3 triggers (bookkeeping, history, no truncate)', v_tbl;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'public.calendar_closures', 'class_key', 'select') then
    raise exception 'TEST FAILED: C3c class_key should not be readable by the app';
  end if;

  for v_fn in
    select p.proname, p.oid, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'calendar\_%'
  loop
    if v_fn.proconfig is null or not ('search_path=""' = any (v_fn.proconfig)) then
      raise exception 'TEST FAILED: C4 % has no search_path = ''''', v_fn.proname;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'execute') or has_function_privilege('service_role', v_fn.oid, 'execute')
       or has_function_privilege('public', v_fn.oid, 'execute') then
      raise exception 'TEST FAILED: C5 % can be called by anon / public / service_role', v_fn.proname;
    end if;
    v_bool := has_function_privilege('authenticated', v_fn.oid, 'execute');
    if v_fn.proname in ('calendar_add_event', 'calendar_update_event', 'calendar_remove_event', 'calendar_add_closure',
                        'calendar_update_closure', 'calendar_remove_closure', 'calendar_add_type', 'calendar_update_type',
                        'calendar_reorder_types', 'calendar_delete_type') then
      if not v_bool then raise exception 'TEST FAILED: C6 the app can''t call %', v_fn.proname; end if;
      if not v_fn.prosecdef then raise exception 'TEST FAILED: C7 % should be security definer', v_fn.proname; end if;
    else
      if v_bool then raise exception 'TEST FAILED: C8 the app can call internal helper %', v_fn.proname; end if;
      if v_fn.prosecdef then raise exception 'TEST FAILED: C8b internal helper % should not be security definer', v_fn.proname; end if;
    end if;
  end loop;
  -- C9: every function 0008 makes is there (by name, so a later migration
  -- adding its own calendar_* function doesn't break this file)
  foreach v_tbl in array array[
      'calendar_text_is_valid', 'calendar_clean_notes', 'calendar_notes_is_valid', 'calendar_color_is_valid',
      'calendar_dates_are_valid', 'calendar_event_times_are_valid', 'calendar_before_write', 'calendar_refuse_truncate',
      'calendar_lock_schools', 'calendar_save_closure_classes', 'calendar_slot_key',
      'calendar_add_event', 'calendar_update_event', 'calendar_remove_event', 'calendar_add_closure',
      'calendar_update_closure', 'calendar_remove_closure', 'calendar_add_type', 'calendar_update_type',
      'calendar_reorder_types', 'calendar_delete_type'] loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = v_tbl) <> 1 then
      raise exception 'TEST FAILED: C9 expected exactly one function %', v_tbl;
    end if;
  end loop;
end;
$$;

select 'ALL 0008 TESTS PASSED' as result;

rollback;
