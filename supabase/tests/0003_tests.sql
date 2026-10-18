-- =====================================================================
-- 0003_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0003_testing_classes_ranks.sql:
--   who can read Classes and ranks (only unlocked staff sessions), who can
--   change them (only admins, only through the 8 testing_* functions),
--   every rule those functions enforce (names, prices, belts, order, final
--   awards, "someone else changed it" = stale), the history table
--   (change_log), and a catalog section that checks the permissions on
--   EVERY object 0003 creates, not just a few samples.
--   Run it yourself in the Supabase SQL Editor AFTER 0003 is applied.
--   It works before AND after the classes are copied in from the old
--   system (the "seed"): it makes its own test classes with unusual names
--   ("zz test 1a2b3c4d ...") and checks positions relative to what is
--   already there. Run it both times.
--   It also passes after 0005: its catalog checks look only at the
--   columns and functions 0003 itself makes (by name), so 0005's new
--   ones (school addresses on locations, testing_* event functions)
--   don't count against it - 0005_tests.sql checks those.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test classes, ranks, history
--   rows, test sessions). Your real data is exactly as it was afterwards.
--   NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0002_tests.sql (read its header for the details):
--     set local role authenticated            -> "I am the browser"
--     set_config('request.jwt.claims', ...)   -> "this is my login token"
--   The setup adds made-up sign-in sessions to auth.sessions and gives
--   each one an unlocked or locked row in session_unlock, so each pretend
--   session has exactly one thing wrong with it (or nothing):
--     A1 admin, fresh password, unlocked     (the one that may write)
--     A2 admin, locked on the server ("Lock now")
--     A3 admin, hit 5 wrong PINs
--     A4 admin, signed out (not in auth.sessions)
--     A5 admin, password sign-in 8 days ago
--     A6 admin, magic-link sign-in (no password)
--     A7 admin, idle time ran out
--     A8 admin whose staff row is made INACTIVE during the test
--     D1 front desk (role staff), unlocked
--     D2 front desk, locked on the server
--     D3 front desk, magic-link sign-in
--     anon = a visitor who is not signed in
--
-- BEFORE YOU RUN IT
--   1. You need TWO existing, ACTIVE staff rows: an admin (Main Admin) and
--      the shared front-desk account (Staff, role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below
--      (top of the block) with their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test tries
--      (and expects to be refused) things like deleting rows. Everything
--      is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0003 TESTS PASSED".
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

  -- Pretend sign-in sessions (see the header).
  v_a1 uuid := gen_random_uuid();
  v_a2 uuid := gen_random_uuid();
  v_a3 uuid := gen_random_uuid();
  v_a4 uuid := gen_random_uuid();
  v_a5 uuid := gen_random_uuid();
  v_a6 uuid := gen_random_uuid();
  v_a7 uuid := gen_random_uuid();
  v_a8 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();
  v_d2 uuid := gen_random_uuid();
  v_d3 uuid := gen_random_uuid();

  -- "amr" = how/when this session signed in (unix seconds).
  v_now_s   bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_2h  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 2 * 3600));
  v_amr_8d  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600));
  v_amr_otp jsonb := jsonb_build_array(jsonb_build_object('method', 'otp',      'timestamp', v_now_s - 60));

  -- Login tokens for each pretend session (filled in during setup).
  v_c_a1 text; v_c_a2 text; v_c_a3 text; v_c_a4 text; v_c_a5 text;
  v_c_a6 text; v_c_a7 text; v_c_a8 text; v_c_d1 text; v_c_d2 text; v_c_d3 text;
  v_c_anon text := '{"role": "anon"}';

  -- A unique prefix for every test name, so nothing clashes with real
  -- classes (before or after the seed) or with an earlier test run.
  v_tag text := 'zz test ' || left(gen_random_uuid()::text, 8);

  v_admin_name text;
  v_role       text;

  -- "Fingerprint" of all class + rank rows and the number of history
  -- rows. Equal before/after = nothing changed. Run as postgres.
  v_snap_sql constant text := $q$
    select md5(
      coalesce((select string_agg(to_jsonb(c)::text, ',' order by c.id) from public.testing_classes c), '')
      || '|' || coalesce((select string_agg(to_jsonb(r)::text, ',' order by r.id) from public.testing_ranks r), '')
      || '|' || (select count(*) from public.change_log)::text)
  $q$;
  -- true when every school's classes and every class's ranks are
  -- numbered 0, 1, 2 ... with no gaps. Run as postgres.
  v_dense_sql constant text := $q$
    select coalesce(bool_and(x.ok), true) from (
      select c.position = (row_number() over (partition by c.location_code order by c.position)) - 1 as ok
        from public.testing_classes c
      union all
      select r.position = (row_number() over (partition by r.class_id order by r.position)) - 1
        from public.testing_ranks r
    ) x
  $q$;

  v_snap   text;
  v_snap2  text;
  v_r      jsonb;      -- one function result
  v_s      text[];     -- statuses of the 8 functions called in a row
  v_bool   boolean;
  v_n      integer;
  v_n2     integer;
  v_n3     integer;
  v_v      integer;
  v_v2     integer;
  v_mark   bigint;     -- last change_log id before a call
  v_batch  uuid;
  v_txt    text;
  v_ids    uuid[];
  v_ids2   uuid[];
  v_i      integer;
  v_list   text[];
  v_names  text[];
  v_labels text[];
  v_rand   uuid := gen_random_uuid();   -- an id that exists nowhere

  v_w_count integer;   -- Worcester classes before the test added any
  v_s_count integer;   -- Shrewsbury classes before the test added any

  -- test classes (w = Worcester, s = Shrewsbury) and ranks
  v_n1 uuid; v_n1r1 uuid; v_n1r2 uuid; v_m uuid; v_m1 uuid; v_m2 uuid; v_m3 uuid;   -- test 10d
  v_w1 uuid; v_w2 uuid; v_w3 uuid; v_w4 uuid; v_w5 uuid; v_w6 uuid; v_w7 uuid; v_w8 uuid;
  v_s1 uuid;
  v_r_yellow uuid; v_r_orange uuid; v_r_green uuid;
  v_r_blue uuid; v_r_hblue uuid; v_r_pg uuid; v_r_s1blue uuid;
  v_r_w4a uuid; v_r_w4b uuid; v_r_w4c uuid; v_r_w5a uuid;
  v_r_w6a uuid; v_r_w6b uuid; v_r_w6c uuid; v_r_w6d uuid;
  v_b uuid; v_rb uuid; v_rb2 uuid;   -- test 25 (belts)
  v_belt record;

  -- catalog checks
  v_tbl  text;
  v_col  text;
  v_priv text;
  v_fn   record;
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  select s.role, s.full_name into v_role, v_admin_name from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role into v_role from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if (select count(*) from public.locations) <> 2 then
    raise exception 'TEST SETUP: public.locations should have 2 rows (is 0003 applied?)';
  end if;

  -- No login token while acting as postgres (the SQL Editor has none).
  perform set_config('request.jwt.claims', '', true);

  -- Make the pretend sessions "real" for Supabase Auth (all except A4,
  -- which plays a signed-out session).
  begin
    insert into auth.sessions (id, user_id)
    select x, v_admin from unnest(array[v_a1, v_a2, v_a3, v_a5, v_a6, v_a7, v_a8]) as x
    union all
    select x, v_desk  from unnest(array[v_d1, v_d2, v_d3]) as x;
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;

  -- Server-side lock state per session (0002's session_unlock):
  -- unlocked = time in the future, locked = time in the past.
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),                                   -- Lock now
    (v_a3, v_admin, now() + interval '30 minutes'),                                 -- (PIN-locked below)
    (v_a4, v_admin, now() + interval '30 minutes'),                                 -- (signed out)
    (v_a5, v_admin, now() + interval '30 minutes'),                                 -- (8-day-old password)
    (v_a6, v_admin, now() + interval '30 minutes'),                                 -- (magic link)
    (v_a7, v_admin, to_timestamp(v_now_s - 2 * 3600) + interval '45 minutes'),      -- idle time ran out
    (v_a8, v_admin, now() + interval '30 minutes'),                                 -- (made inactive later)
    (v_d1, v_desk,  now() + interval '30 minutes'),
    (v_d2, v_desk,  now() - interval '1 minute'),                                   -- Lock now
    (v_d3, v_desk,  now() + interval '30 minutes');                                 -- (magic link)

  -- A3 hit 5 wrong PINs.
  insert into public.pin_attempts (session_id, staff_id, failed, locked_at)
  values (v_a3, v_admin, 5, now());

  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_a3 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a3, 'amr', v_amr_1m)::text;
  v_c_a4 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a4, 'amr', v_amr_1m)::text;
  v_c_a5 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a5, 'amr', v_amr_8d)::text;
  v_c_a6 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a6, 'amr', v_amr_otp)::text;
  v_c_a7 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a7, 'amr', v_amr_2h)::text;
  v_c_a8 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a8, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;
  v_c_d2 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text;
  v_c_d3 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d3, 'amr', v_amr_otp)::text;

  select count(*) into v_w_count from public.testing_classes where location_code = 'worcester';
  select count(*) into v_s_count from public.testing_classes where location_code = 'shrewsbury';

  -- Check the pretend sessions are set up right: only A1, A8 (still
  -- active here) and D1 have data access.
  set local role authenticated;
  v_list := array[v_c_a1, v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_a8, v_c_d1, v_c_d2, v_c_d3];
  for v_i in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_i], true);
    if public.has_data_access() is distinct from (v_i in (1, 8, 9)) then
      raise exception 'TEST SETUP: session % of A1..A8,D1..D3 has data access %, expected %',
        v_i, public.has_data_access(), (v_i in (1, 8, 9));
    end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if not public.is_admin() then raise exception 'TEST SETUP: A1 should be an admin'; end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 3: a visitor who is NOT signed in (anon) can read nothing and
  --         call none of the 8 functions (permission denied, 42501)
  -- -------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform 1 from public.locations;       raise exception 'TEST FAILED: 3a anon could read locations';       exception when insufficient_privilege then null; end;
  begin perform 1 from public.testing_classes; raise exception 'TEST FAILED: 3b anon could read testing_classes'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.testing_ranks;   raise exception 'TEST FAILED: 3c anon could read testing_ranks';   exception when insufficient_privilege then null; end;
  begin perform 1 from public.change_log;      raise exception 'TEST FAILED: 3d anon could read change_log';      exception when insufficient_privilege then null; end;
  -- 25h. not even the belt columns on their own (added in step A)
  begin perform r.belt_pattern, r.belt_color, r.belt_color_2, r.belt_end_stripes, r.belt_end_stripe_color from public.testing_ranks r;
        raise exception 'TEST FAILED: 25h anon could read the belt columns'; exception when insufficient_privilege then null; end;
  begin perform public.testing_add_class('worcester', v_tag || ' anon', null, false);
        raise exception 'TEST FAILED: 3e anon could call testing_add_class';       exception when insufficient_privilege then null; end;
  begin perform public.testing_update_class(gen_random_uuid(), 1, 'x', null, false);
        raise exception 'TEST FAILED: 3f anon could call testing_update_class';    exception when insufficient_privilege then null; end;
  begin perform public.testing_reorder_classes('worcester', '{}', '{}');
        raise exception 'TEST FAILED: 3g anon could call testing_reorder_classes'; exception when insufficient_privilege then null; end;
  begin perform public.testing_delete_class(gen_random_uuid(), 1, '{}', '{}', false);
        raise exception 'TEST FAILED: 3h anon could call testing_delete_class';    exception when insufficient_privilege then null; end;
  begin perform public.testing_add_rank(gen_random_uuid(), 'x', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow');
        raise exception 'TEST FAILED: 3i anon could call testing_add_rank';        exception when insufficient_privilege then null; end;
  begin perform public.testing_update_rank(gen_random_uuid(), 1, 'x', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow');
        raise exception 'TEST FAILED: 3j anon could call testing_update_rank';     exception when insufficient_privilege then null; end;
  begin perform public.testing_reorder_ranks(gen_random_uuid(), '{}', '{}');
        raise exception 'TEST FAILED: 3k anon could call testing_reorder_ranks';   exception when insufficient_privilege then null; end;
  begin perform public.testing_delete_rank(gen_random_uuid(), 1, 1, '{}', '{}');
        raise exception 'TEST FAILED: 3l anon could call testing_delete_rank';     exception when insufficient_privilege then null; end;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 4: even an unlocked admin (A1) can't write to the tables
  --         directly, can't read the login-id columns, and "select *"
  --         is refused. Test 20b: and can't touch change_log at all.
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  begin insert into public.locations (code, name) values ('worcester', 'x');
        raise exception 'TEST FAILED: 4a A1 could insert into locations'; exception when insufficient_privilege then null; end;
  begin update public.locations set name = name;
        raise exception 'TEST FAILED: 4b A1 could update locations'; exception when insufficient_privilege then null; end;
  begin delete from public.locations where code = 'nowhere';
        raise exception 'TEST FAILED: 4c A1 could delete from locations'; exception when insufficient_privilege then null; end;

  begin insert into public.testing_classes (location_code, name, position, created_by_name, updated_by_name)
        values ('worcester', v_tag || ' direct', 999, 'x', 'x');
        raise exception 'TEST FAILED: 4d A1 could insert into testing_classes'; exception when insufficient_privilege then null; end;
  begin update public.testing_classes set name = name;
        raise exception 'TEST FAILED: 4e A1 could update testing_classes'; exception when insufficient_privilege then null; end;
  begin delete from public.testing_classes where id = gen_random_uuid();
        raise exception 'TEST FAILED: 4f A1 could delete from testing_classes'; exception when insufficient_privilege then null; end;

  begin insert into public.testing_ranks (class_id, location_code, name, position, early_cents, day_cents, private_cents, created_by_name, updated_by_name)
        values (gen_random_uuid(), 'worcester', 'x', 0, 0, 0, 0, 'x', 'x');
        raise exception 'TEST FAILED: 4g A1 could insert into testing_ranks'; exception when insufficient_privilege then null; end;
  begin update public.testing_ranks set name = name;
        raise exception 'TEST FAILED: 4h A1 could update testing_ranks'; exception when insufficient_privilege then null; end;
  begin delete from public.testing_ranks where id = gen_random_uuid();
        raise exception 'TEST FAILED: 4i A1 could delete from testing_ranks'; exception when insufficient_privilege then null; end;

  begin insert into public.change_log (actor_name, action, table_name, record_id, op)
        values ('x', 'manual', 'x', gen_random_uuid(), 'insert');
        raise exception 'TEST FAILED: 4j/20b A1 could insert into change_log'; exception when insufficient_privilege then null; end;
  begin update public.change_log set action = action;
        raise exception 'TEST FAILED: 4k A1 could update change_log'; exception when insufficient_privilege then null; end;
  begin delete from public.change_log where id = -1;
        raise exception 'TEST FAILED: 4l A1 could delete from change_log'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.change_log;
        raise exception 'TEST FAILED: 20b A1 could read change_log'; exception when insufficient_privilege then null; end;

  begin truncate public.locations;
        raise exception 'TEST FAILED: 4m A1 could truncate locations'; exception when insufficient_privilege then null; end;
  begin truncate public.testing_classes cascade;
        raise exception 'TEST FAILED: 4n A1 could truncate testing_classes'; exception when insufficient_privilege then null; end;
  begin truncate public.testing_ranks;
        raise exception 'TEST FAILED: 4o A1 could truncate testing_ranks'; exception when insufficient_privilege then null; end;
  begin truncate public.change_log;
        raise exception 'TEST FAILED: 4p A1 could truncate change_log'; exception when insufficient_privilege then null; end;

  begin perform c.created_by from public.testing_classes c;
        raise exception 'TEST FAILED: 4q A1 could read testing_classes.created_by'; exception when insufficient_privilege then null; end;
  begin perform c.updated_by from public.testing_classes c;
        raise exception 'TEST FAILED: 4r A1 could read testing_classes.updated_by'; exception when insufficient_privilege then null; end;
  begin perform * from public.testing_classes;
        raise exception 'TEST FAILED: 4s A1 could select * from testing_classes'; exception when insufficient_privilege then null; end;
  begin perform r.created_by from public.testing_ranks r;
        raise exception 'TEST FAILED: 4t A1 could read testing_ranks.created_by'; exception when insufficient_privilege then null; end;
  begin perform r.updated_by from public.testing_ranks r;
        raise exception 'TEST FAILED: 4u A1 could read testing_ranks.updated_by'; exception when insufficient_privilege then null; end;
  begin perform * from public.testing_ranks;
        raise exception 'TEST FAILED: 4v A1 could select * from testing_ranks'; exception when insufficient_privilege then null; end;

  -- internal helpers can't be called from the browser
  begin perform public.testing_normalize_name('x');
        raise exception 'TEST FAILED: 4w A1 could call testing_normalize_name'; exception when insufficient_privilege then null; end;
  begin perform public.change_log_actor_name();
        raise exception 'TEST FAILED: 4x A1 could call change_log_actor_name'; exception when insufficient_privilege then null; end;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 7: the full admin flow (A1), with positions relative to the
  --         classes that already exist. Tests 19, 21 and 23 check the
  --         history rows and "last changed by" along the way.
  -- -------------------------------------------------------------------
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- 7a. add class "Alpha" -> appended at the end of Worcester
  v_r := public.testing_add_class('worcester', v_tag || ' Alpha', null, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 1
     or (v_r ->> 'position')::int is distinct from v_w_count then
    raise exception 'TEST FAILED: 7a add_class expected ok, version 1, position %, got %', v_w_count, v_r;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['final_award_none', 'id', 'position', 'status', 'version']
     or v_r -> 'final_award_none' is distinct from 'false'::jsonb then
    raise exception 'TEST FAILED: 7a add_class ok result has unexpected keys/values: %', v_r;
  end if;
  v_w1 := (v_r ->> 'id')::uuid;
  -- 19. the tags are cleared after the call
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: 19a tkd.action/tkd.batch_id not cleared after add_class (% / %)',
      current_setting('tkd.action', true), current_setting('tkd.batch_id', true);
  end if;

  -- 7b / 23. three ranks -> positions 0, 1, 2, version 1
  v_r := public.testing_add_rank(v_w1, 'Yellow', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'position')::int <> 0 or (v_r ->> 'version')::int <> 1 then
    raise exception 'TEST FAILED: 23a first add_rank expected ok position 0 version 1, got %', v_r;
  end if;
  v_r_yellow := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_rank(v_w1, 'Orange', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'position')::int <> 1 then
    raise exception 'TEST FAILED: 23b second add_rank expected ok position 1, got %', v_r;
  end if;
  v_r_orange := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_rank(v_w1, 'Green', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'position')::int <> 2 then
    raise exception 'TEST FAILED: 23c third add_rank expected ok position 2, got %', v_r;
  end if;
  v_r_green := (v_r ->> 'id')::uuid;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['id', 'position', 'status', 'version'] then
    raise exception 'TEST FAILED: 7b add_rank ok result has unexpected keys: %', v_r;
  end if;

  -- 7c. update a rank -> version 2
  v_r := public.testing_update_rank(v_r_green, 1, 'Green belt', 7000, 8000, 9000, true, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 2
     or (v_r ->> 'id')::uuid is distinct from v_r_green then
    raise exception 'TEST FAILED: 7c update_rank expected ok version 2, got %', v_r;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['id', 'status', 'version'] then
    raise exception 'TEST FAILED: 7c update_rank ok result has unexpected keys: %', v_r;
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: 19s update_rank tags not cleared';
  end if;
  set constraints all immediate;
  reset role;

  -- 19. history rows so far: 1 class insert + 3 rank inserts + 1 update
  select count(*) into v_n from public.change_log where id > v_mark;
  if v_n <> 5 then raise exception 'TEST FAILED: 19b expected 5 change_log rows after 1 add_class + 3 add_rank + 1 update_rank, got %', v_n; end if;
  -- the class insert row, in full detail
  select count(*) into v_n
    from public.change_log l
   where l.id > v_mark
     and l.table_name = 'testing_classes' and l.record_id = v_w1 and l.op = 'insert'
     and l.action = 'add_class' and l.location_code = 'worcester'
     and l.actor_id = v_admin and l.actor_name = v_admin_name and l.session_id = v_a1
     and l.batch_id is not null and l.before is null
     and l.after ->> 'name' = v_tag || ' Alpha' and l.after ->> 'id' = v_w1::text
     and l.after ? 'created_by' and l.after ? 'position';
  if v_n <> 1 then raise exception 'TEST FAILED: 19c add_class history row missing or wrong'; end if;
  -- each add_rank call has its own batch id, different from add_class's
  select count(distinct l.batch_id) into v_n
    from public.change_log l where l.id > v_mark and l.op = 'insert' and l.batch_id is not null;
  if v_n <> 4 then raise exception 'TEST FAILED: 19d expected 4 different batch ids for 4 calls, got %', v_n; end if;
  select count(*) into v_n
    from public.change_log l
   where l.id > v_mark and l.table_name = 'testing_ranks' and l.op = 'insert' and l.action = 'add_rank'
     and l.location_code = 'worcester' and l.actor_id = v_admin and l.session_id = v_a1;
  if v_n <> 3 then raise exception 'TEST FAILED: 19e expected 3 add_rank history rows, got %', v_n; end if;
  -- the update row keeps ONLY the changed columns (old in before, new in after)
  select count(*) into v_n
    from public.change_log l
   where l.id > v_mark and l.record_id = v_r_green and l.op = 'update' and l.action = 'update_rank'
     and (select array_agg(k order by k) from jsonb_object_keys(l.before) as k)
       = (select array_agg(k order by k) from jsonb_object_keys(l.after) as k)
     and l.before ?& array['name', 'early_cents', 'day_cents', 'private_cents', 'sparring_gear', 'version']
     and not (l.before ?| array['id', 'class_id', 'location_code', 'position', 'created_at', 'created_by', 'created_by_name'])
     and l.before ->> 'name' = 'Green' and l.after ->> 'name' = 'Green belt'
     and (l.before ->> 'version')::int = 1 and (l.after ->> 'version')::int = 2;
  if v_n <> 1 then raise exception 'TEST FAILED: 19f update_rank history row should hold only the changed columns'; end if;

  -- 21. "last changed by" = the admin's name at the time; renaming the
  --     staff row later doesn't change the saved name.
  select count(*) into v_n from public.testing_classes c
   where c.id = v_w1 and c.created_by_name = v_admin_name and c.updated_by_name = v_admin_name
     and c.created_by = v_admin and c.updated_by = v_admin;
  if v_n <> 1 then raise exception 'TEST FAILED: 21a class created_by_name/updated_by_name should be "%"', v_admin_name; end if;
  select count(*) into v_n from public.testing_ranks r
   where r.id = v_r_green and r.created_by_name = v_admin_name and r.updated_by_name = v_admin_name;
  if v_n <> 1 then raise exception 'TEST FAILED: 21b rank created_by_name/updated_by_name should be "%"', v_admin_name; end if;
  update public.staff set full_name = v_tag || ' renamed' where id = v_admin;
  select count(*) into v_n from public.testing_classes c
   where c.id = v_w1 and c.created_by_name = v_admin_name and c.updated_by_name = v_admin_name;
  if v_n <> 1 then raise exception 'TEST FAILED: 21c renaming the staff row changed the saved name'; end if;
  update public.staff set full_name = v_admin_name where id = v_admin;

  -- 7d. a no-op update (same values; extra spaces normalize to the same
  --     name) -> ok, version stays 2, no history row
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_rank(v_r_green, 2, 'Green belt', 7000, 8000, 9000, true, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 2 then
    raise exception 'TEST FAILED: 7d no-op update_rank expected ok version 2, got %', v_r;
  end if;
  v_r := public.testing_update_rank(v_r_green, 2, '  Green' || chr(160) || '  belt ', 7000, 8000, 9000, true, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 2 then
    raise exception 'TEST FAILED: 7e no-op update_rank (spaces) expected ok version 2, got %', v_r;
  end if;

  -- 7f. second class "Beta" with two ranks; Alpha's final award = Beta's Blue
  v_r := public.testing_add_class('worcester', v_tag || ' Beta', null, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'position')::int is distinct from v_w_count + 1 then
    raise exception 'TEST FAILED: 23d second add_class expected position %, got %', v_w_count + 1, v_r;
  end if;
  v_w2 := (v_r ->> 'id')::uuid;
  v_r_blue  := (public.testing_add_rank(v_w2, 'Blue', 7000, 8000, 9500, true, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_r_hblue := (public.testing_add_rank(v_w2, 'High Blue', 7000, 8000, 9500, true, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  if v_r_blue is null or v_r_hblue is null then raise exception 'TEST FAILED: 7f adding Beta''s ranks failed'; end if;

  -- no-op class update (same name, still no award) -> version stays 1
  v_r := public.testing_update_class(v_w1, 1, v_tag || ' Alpha', null, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 1 then
    raise exception 'TEST FAILED: 7g no-op update_class expected ok version 1, got %', v_r;
  end if;
  reset role;
  select count(*) into v_n from public.change_log where id > v_mark and record_id in (v_r_green, v_w1);
  if v_n <> 0 then raise exception 'TEST FAILED: 7h no-op updates wrote % history row(s)', v_n; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  v_r := public.testing_update_class(v_w1, 1, v_tag || '   Alpha ', v_r_blue, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 2 then
    raise exception 'TEST FAILED: 7i update_class (final award) expected ok version 2, got %', v_r;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['final_award_none', 'id', 'status', 'version'] then
    raise exception 'TEST FAILED: 7i update_class ok result has unexpected keys: %', v_r;
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: 19t update_class tags not cleared';
  end if;
  v_r := public.testing_update_class(v_w1, 2, v_tag || ' Alpha renamed', v_r_blue, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 3 then
    raise exception 'TEST FAILED: 7j update_class (rename) expected ok version 3, got %', v_r;
  end if;
  v_r := public.testing_update_class(v_w1, 3, v_tag || ' Alpha', v_r_blue, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 4 then
    raise exception 'TEST FAILED: 7k update_class (rename back) expected ok version 4, got %', v_r;
  end if;

  -- 7l. reorder Alpha's ranks: Yellow, Orange, Green -> Green, Yellow, Orange
  v_r := public.testing_reorder_ranks(v_w1, array[v_r_yellow, v_r_orange, v_r_green], array[v_r_green, v_r_yellow, v_r_orange]);
  if v_r is distinct from '{"status": "ok"}'::jsonb then raise exception 'TEST FAILED: 7l reorder_ranks expected {"status":"ok"}, got %', v_r; end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: 19u reorder_ranks tags not cleared';
  end if;
  set constraints all immediate;
  reset role;
  if array(select r.id from public.testing_ranks r where r.class_id = v_w1 order by r.position)
     <> array[v_r_green, v_r_yellow, v_r_orange] then
    raise exception 'TEST FAILED: 7m ranks not in the new order';
  end if;
  execute v_dense_sql into v_bool;
  if not v_bool then raise exception 'TEST FAILED: 7n positions not dense after reorder_ranks'; end if;
  -- versions unchanged by the reorder (Green 2, the others 1)
  select count(*) into v_n from public.testing_ranks r
   where (r.id = v_r_green and r.version = 2) or (r.id in (v_r_yellow, v_r_orange) and r.version = 1);
  if v_n <> 3 then raise exception 'TEST FAILED: 13b-1 reorder_ranks changed a rank version'; end if;
  -- 19. the reorder's history rows: position only, one batch, right action
  select count(*), count(distinct l.batch_id), bool_and(l.action = 'reorder_ranks' and l.op = 'update'
           and (select array_agg(k) from jsonb_object_keys(l.before) as k) = array['position']
           and (select array_agg(k) from jsonb_object_keys(l.after) as k) = array['position'])
    into v_n, v_n2, v_bool
    from public.change_log l where l.id > v_mark and l.action = 'reorder_ranks';
  if v_n <> 3 or v_n2 <> 1 or not v_bool then
    raise exception 'TEST FAILED: 19g reorder_ranks history expected 3 position-only rows in 1 batch, got % rows, % batches, ok=%', v_n, v_n2, v_bool;
  end if;

  -- 7o. reorder Worcester's classes: swap Alpha and Beta (the real
  --     classes before them stay where they are)
  v_ids := array(select c.id from public.testing_classes c where c.location_code = 'worcester' order by c.position);
  v_ids2 := array_replace(array_replace(array_replace(v_ids, v_w1, '00000000-0000-0000-0000-000000000000'::uuid), v_w2, v_w1),
                          '00000000-0000-0000-0000-000000000000'::uuid, v_w2);
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_reorder_classes('worcester', v_ids, v_ids2);
  if v_r is distinct from '{"status": "ok"}'::jsonb then raise exception 'TEST FAILED: 7o reorder_classes expected {"status":"ok"}, got %', v_r; end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: 19v reorder_classes tags not cleared';
  end if;
  -- the same order again = nothing to do, still ok
  v_r := public.testing_reorder_classes('worcester', v_ids2, v_ids2);
  if v_r is distinct from '{"status": "ok"}'::jsonb then raise exception 'TEST FAILED: 7p reorder_classes (same order) expected ok, got %', v_r; end if;
  set constraints all immediate;
  reset role;
  if array(select c.id from public.testing_classes c where c.location_code = 'worcester' order by c.position) <> v_ids2 then
    raise exception 'TEST FAILED: 7q classes not in the new order';
  end if;
  if (select c.position from public.testing_classes c where c.id = v_w2) <> v_w_count
     or (select c.position from public.testing_classes c where c.id = v_w1) <> v_w_count + 1 then
    raise exception 'TEST FAILED: 7r Beta should be at position %, Alpha at %', v_w_count, v_w_count + 1;
  end if;
  execute v_dense_sql into v_bool;
  if not v_bool then raise exception 'TEST FAILED: 7s positions not dense after reorder_classes'; end if;
  -- 13b. versions and "last changed" unchanged by the class reorder
  select count(*) into v_n from public.testing_classes c
   where (c.id = v_w1 and c.version = 4) or (c.id = v_w2 and c.version = 1);
  if v_n <> 2 then raise exception 'TEST FAILED: 13b-2 reorder_classes changed a class version'; end if;
  select count(*) into v_n from public.change_log l where l.id > v_mark and l.action = 'reorder_classes';
  if v_n <> 2 then raise exception 'TEST FAILED: 19h reorder_classes expected 2 history rows (two classes moved), got %', v_n; end if;

  -- 7t / 8b. a Shrewsbury class with the SAME name as Worcester's Alpha
  --          (fine: different school) holding a rank called Blue (fine:
  --          different class)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_class('shrewsbury', v_tag || ' Alpha', null, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'position')::int is distinct from v_s_count then
    raise exception 'TEST FAILED: 8b-1 same class name in the other school expected ok at position %, got %', v_s_count, v_r;
  end if;
  v_s1 := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_rank(v_s1, 'Blue', 7000, 8000, 9500, true, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 8b-2 same rank name in another class expected ok, got %', v_r; end if;
  v_r_s1blue := (v_r ->> 'id')::uuid;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: 19i tags not cleared after add_rank';
  end if;

  -- -------------------------------------------------------------------
  -- Test 22: the front desk (D1) can read who last changed a record
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  select c.created_by_name || '|' || c.updated_by_name into v_txt from public.testing_classes c where c.id = v_w1;
  if v_txt is distinct from v_admin_name || '|' || v_admin_name then
    raise exception 'TEST FAILED: 22a D1 expected to read created_by_name/updated_by_name "%", got "%"', v_admin_name, v_txt;
  end if;
  select r.created_by_name || '|' || r.updated_by_name into v_txt from public.testing_ranks r where r.id = v_r_green;
  if v_txt is distinct from v_admin_name || '|' || v_admin_name then
    raise exception 'TEST FAILED: 22b D1 expected to read the rank''s names, got "%"', v_txt;
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 1: A1 and D1 see every row (the same counts as postgres sees);
  -- Test 2: every locked / signed-out / stale / magic-link / inactive
  --         session sees NO rows at all (there are rows: the test just
  --         added some, so 0 really means "hidden")
  -- -------------------------------------------------------------------
  select count(*) into v_n  from public.locations;
  select count(*) into v_n2 from public.testing_classes;
  select count(*) into v_n3 from public.testing_ranks;
  if v_n <> 2 or v_n2 < 3 or v_n3 < 6 then raise exception 'TEST SETUP: expected rows to exist before test 1/2 (% / % / %)', v_n, v_n2, v_n3; end if;

  set local role authenticated;
  v_list := array[v_c_a1, v_c_d1];
  for v_i in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_i], true);
    if (select count(*) from public.locations) <> v_n
       or (select count(c.id) from public.testing_classes c) <> v_n2
       or (select count(r.id) from public.testing_ranks r) <> v_n3 then
      raise exception 'TEST FAILED: 1 % should see % locations, % classes, % ranks; saw %, %, %',
        case v_i when 1 then 'A1' else 'D1' end, v_n, v_n2, v_n3,
        (select count(*) from public.locations), (select count(c.id) from public.testing_classes c),
        (select count(r.id) from public.testing_ranks r);
    end if;
  end loop;

  v_list := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_d2, v_c_d3];
  for v_i in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_i], true);
    if (select count(*) from public.locations) <> 0
       or (select count(c.id) from public.testing_classes c) <> 0
       or (select count(r.id) from public.testing_ranks r) <> 0 then
      raise exception 'TEST FAILED: 2 session % (of A2,A3,A4,A5,A6,A7,D2,D3) could read rows', v_i;
    end if;
  end loop;

  -- A8: an admin whose staff row is INACTIVE (deactivated meanwhile)
  reset role;
  update public.staff set active = false where id = v_admin;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a8, true);
  if (select count(*) from public.locations) <> 0
     or (select count(c.id) from public.testing_classes c) <> 0
     or (select count(r.id) from public.testing_ranks r) <> 0 then
    raise exception 'TEST FAILED: 2g inactive admin (A8) could read rows';
  end if;
  reset role;
  update public.staff set active = true where id = v_admin;

  -- -------------------------------------------------------------------
  -- Test 5: the front desk (D1, unlocked, role staff) calls all 8
  --         functions -> not_allowed, and nothing changes
  -- Test 6: locked / signed-out / stale / magic-link / inactive admin
  --         sessions -> no_access, and nothing changes
  -- Test 6b: the desk's LOCKED and magic-link sessions get no_access
  --         (not not_allowed) - proves has_data_access() runs before
  --         is_admin()
  -- Each session calls all 8 functions three times (24 calls):
  --   1. with sensible arguments,
  --   2. with broken input (NULL ids, '' names, -1 prices, NULL lists),
  --   3. with ids that exist nowhere.
  -- All 24 must give the session's status - proves the access checks run
  -- BEFORE any input check or lookup (amended after security review).
  -- (A8 is made inactive just for its turn.)
  -- -------------------------------------------------------------------
  execute v_snap_sql into v_snap;
  set local role authenticated;

  v_list   := array[v_c_d1, v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_d2, v_c_d3, v_c_a8];
  v_labels := array['D1',   'A2',   'A3',   'A4',   'A5',   'A6',   'A7',   'D2',   'D3',   'A8'];
  for v_i in 1 .. cardinality(v_list) loop
    if v_labels[v_i] = 'A8' then
      reset role;
      update public.staff set active = false where id = v_admin;
      set local role authenticated;
    end if;
    perform set_config('request.jwt.claims', v_list[v_i], true);
    v_txt := case when v_labels[v_i] = 'D1' then 'not_allowed' else 'no_access' end;
    v_s := array[
      -- 1. sensible arguments
      public.testing_add_class('worcester', v_tag || ' nope', null, false) ->> 'status',
      public.testing_update_class(v_w1, 4, v_tag || ' nope', null, false) ->> 'status',
      public.testing_reorder_classes('worcester', v_ids2, v_ids2) ->> 'status',
      public.testing_delete_class(v_w2, 1, array[v_r_blue, v_r_hblue], array[v_w1], false) ->> 'status',
      public.testing_add_rank(v_w1, 'nope', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'status',
      public.testing_update_rank(v_r_yellow, 1, 'nope', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'status',
      public.testing_reorder_ranks(v_w1, array[v_r_green, v_r_yellow, v_r_orange], array[v_r_yellow, v_r_green, v_r_orange]) ->> 'status',
      public.testing_delete_rank(v_r_yellow, 1, 4, array[v_r_green, v_r_yellow, v_r_orange], '{}') ->> 'status',
      -- 2. broken input
      public.testing_add_class(null, '', null, null) ->> 'status',
      public.testing_update_class(null, null, '', null, null) ->> 'status',
      public.testing_reorder_classes(null, null, null) ->> 'status',
      public.testing_delete_class(null, null, null, null, null) ->> 'status',
      public.testing_add_rank(null, '', -1, -1, -1, null, null, null, null, null, null) ->> 'status',
      public.testing_update_rank(null, null, '', -1, -1, -1, null, null, null, null, null, null) ->> 'status',
      public.testing_reorder_ranks(null, null, null) ->> 'status',
      public.testing_delete_rank(null, null, null, null, null) ->> 'status',
      -- 3. ids that exist nowhere
      public.testing_add_class('worcester', v_tag || ' nope 2', v_rand, false) ->> 'status',
      public.testing_update_class(v_rand, 1, v_tag || ' nope 2', null, false) ->> 'status',
      public.testing_reorder_classes('worcester', array[v_rand], array[v_rand]) ->> 'status',
      public.testing_delete_class(v_rand, 1, '{}', '{}', false) ->> 'status',
      public.testing_add_rank(v_rand, 'nope', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'status',
      public.testing_update_rank(v_rand, 1, 'nope', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'status',
      public.testing_reorder_ranks(v_rand, '{}', '{}') ->> 'status',
      public.testing_delete_rank(v_rand, 1, 1, array[v_rand], '{}') ->> 'status'
    ];
    if cardinality(v_s) <> 24 or exists (select 1 from unnest(v_s) as x where x is distinct from v_txt) then
      raise exception 'TEST FAILED: 5/6/6b session % expected % from all 24 calls, got %', v_labels[v_i], v_txt, v_s;
    end if;
  end loop;
  reset role;
  update public.staff set active = true where id = v_admin;

  execute v_snap_sql into v_snap2;
  if v_snap2 is distinct from v_snap then raise exception 'TEST FAILED: 5/6 refused calls changed data or wrote history'; end if;

  -- -------------------------------------------------------------------
  -- Test 8: duplicate names -> duplicate_name (capital letters and
  --         extra spaces don't make a name different)
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_class('worcester', v_tag || ' Gamma', null, false);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 8 setup add Gamma, got %', v_r; end if;
  v_w3 := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_rank(v_w3, 'Green', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 8 setup add Green, got %', v_r; end if;
  v_r := public.testing_add_rank(v_w3, 'High Green', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 8 setup add High Green, got %', v_r; end if;

  foreach v_txt in array array['green', ' GREEN ', 'Green' || chr(160), E'\tgreen\n',
                               'high  green', 'HIGH' || chr(160) || 'GREEN', E'High\tGreen', '  high green  '] loop
    v_r := public.testing_add_rank(v_w3, v_txt, 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
    if v_r is distinct from '{"status": "duplicate_name"}'::jsonb then
      raise exception 'TEST FAILED: 8a rank "%" expected {"status":"duplicate_name"}, got %', v_txt, v_r;
    end if;
  end loop;
  foreach v_txt in array array[upper(v_tag) || ' ALPHA', ' ' || v_tag || '   alpha ', v_tag || chr(160) || 'Alpha'] loop
    v_r := public.testing_add_class('worcester', v_txt, null, false);
    if v_r is distinct from '{"status": "duplicate_name"}'::jsonb then
      raise exception 'TEST FAILED: 8b class "%" expected duplicate_name, got %', v_txt, v_r;
    end if;
  end loop;
  -- renaming to an existing name
  v_r := public.testing_update_class(v_w2, 1, lower(v_tag) || ' ALPHA', null, false);
  if v_r is distinct from '{"status": "duplicate_name"}'::jsonb then raise exception 'TEST FAILED: 8c update_class to an existing name expected duplicate_name, got %', v_r; end if;
  v_r := public.testing_update_rank(v_r_orange, 1, 'YELLOW', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "duplicate_name"}'::jsonb then raise exception 'TEST FAILED: 8d update_rank to an existing name expected duplicate_name, got %', v_r; end if;
  -- changing only the capital letters of your OWN name is fine
  v_r := public.testing_update_rank(v_r_orange, 1, 'ORANGE', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 2 then raise exception 'TEST FAILED: 8e own name in capitals expected ok version 2, got %', v_r; end if;
  v_r := public.testing_update_rank(v_r_orange, 2, 'Orange', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 3 then raise exception 'TEST FAILED: 8f rename back expected ok version 3, got %', v_r; end if;

  -- -------------------------------------------------------------------
  -- Test 9: names and prices
  -- -------------------------------------------------------------------
  foreach v_txt in array array['', '   ', E'\t\n', chr(160), rpad(v_tag || ' L', 61, 'x'), repeat(chr(233), 61),
                               'Bell' || chr(7), 'Next' || chr(133) || 'line', 'Esc' || chr(27),
                               -- invisible format characters (amended after security review):
                               -- zero-width space, right-to-left mark, LTR embedding, RTL override,
                               -- word joiner, invisible plus, isolates, byte-order mark
                               'Zero' || chr(8203) || 'width', 'Mark' || chr(8207), chr(8234) || 'Embed',
                               'RTL' || chr(8238) || 'override', 'Word' || chr(8288) || 'joiner', 'Plus' || chr(8292),
                               chr(8294) || 'Isolate', 'Pop' || chr(8297), chr(65279) || 'BOM'] loop
    v_r := public.testing_add_rank(v_w3, v_txt, 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: 9a rank name "%" (% characters) expected {"status":"invalid"}, got %', v_txt, char_length(v_txt), v_r;
    end if;
    v_r := public.testing_add_class('worcester', v_txt, null, false);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: 9b class name "%" expected invalid, got %', v_txt, v_r;
    end if;
  end loop;
  v_r := public.testing_add_rank(v_w3, null, 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9c null rank name expected invalid, got %', v_r; end if;
  v_r := public.testing_add_class('worcester', null, null, false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9d null class name expected invalid, got %', v_r; end if;
  v_r := public.testing_update_rank(v_r_orange, 3, '', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9e update_rank empty name expected invalid, got %', v_r; end if;
  v_r := public.testing_update_class(v_w3, 1, '   ', null, false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9f update_class blank name expected invalid, got %', v_r; end if;

  -- exactly 60 characters is fine (also 60 two-byte characters)
  v_r := public.testing_add_rank(v_w3, rpad(v_tag || ' L', 60, 'x'), 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 9g 60-character name expected ok, got %', v_r; end if;
  v_r := public.testing_add_rank(v_w3, repeat(chr(233), 60), 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 9h 60 x chr(233) (e with an accent) expected ok (characters, not bytes), got %', v_r; end if;

  -- characters just outside those ranges are fine (a real hyphen, U+2010)
  v_r := public.testing_add_rank(v_w3, 'Hy' || chr(8208) || 'phen', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 9h2 a name with a hyphen (U+2010) expected ok, got %', v_r; end if;

  -- runs of spaces / tabs / line breaks / no-break spaces become one space
  v_r := public.testing_add_class('worcester', v_tag || ' Group   E', null, false);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 9i "Group   E" expected ok, got %', v_r; end if;
  v_w7 := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_rank(v_w3, '  Tab' || E'\t' || 'and' || chr(160) || chr(160) || 'nbsp' || E'\n' || 'end  ', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 9j tab/no-break-space name expected ok, got %', v_r; end if;
  select r.name into v_txt from public.testing_ranks r where r.id = (v_r ->> 'id')::uuid;
  if v_txt is distinct from 'Tab and nbsp end' then raise exception 'TEST FAILED: 9k expected stored name "Tab and nbsp end", got "%"', v_txt; end if;
  select c.name into v_txt from public.testing_classes c where c.id = v_w7;
  if v_txt is distinct from v_tag || ' Group E' then raise exception 'TEST FAILED: 9l expected stored class name "% Group E", got "%"', v_tag, v_txt; end if;

  -- prices: whole dollars $0 - $1,000, all three required; sparring required
  v_r := public.testing_add_rank(v_w3, 'Price low',   -100, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9m early -100 expected invalid, got %', v_r; end if;
  v_r := public.testing_add_rank(v_w3, 'Price high',  6500, 100100, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9n day 100100 expected invalid, got %', v_r; end if;
  v_r := public.testing_add_rank(v_w3, 'Price cents', 6500, 7500, 6550, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9o private 6550 expected invalid, got %', v_r; end if;
  v_r := public.testing_add_rank(v_w3, 'Price null',  null, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9p early null expected invalid, got %', v_r; end if;
  v_r := public.testing_add_rank(v_w3, 'Price null2', 6500, null, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9q day null expected invalid, got %', v_r; end if;
  v_r := public.testing_add_rank(v_w3, 'Price null3', 6500, 7500, null, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9r private null expected invalid, got %', v_r; end if;
  v_r := public.testing_add_rank(v_w3, 'Sparring null', 6500, 7500, 8500, null, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9s sparring null expected invalid, got %', v_r; end if;
  v_r := public.testing_update_rank(v_r_orange, 3, 'Orange', 6500, 7550, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9t update_rank 7550 expected invalid, got %', v_r; end if;
  v_r := public.testing_update_rank(v_r_orange, 3, 'Orange', 6500, 7500, 8500, null, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9u update_rank sparring null expected invalid, got %', v_r; end if;
  v_r := public.testing_add_rank(v_w3, 'Free', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 9v $0 prices expected ok, got %', v_r; end if;
  v_r := public.testing_add_rank(v_w3, 'Top', 100000, 100000, 100000, true, 'solid', 'white', null, 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 9w $1,000 prices expected ok, got %', v_r; end if;

  -- other bad input
  v_r := public.testing_add_class('boston', v_tag || ' Boston', null, false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9x unknown school expected invalid, got %', v_r; end if;
  v_r := public.testing_add_class(null, v_tag || ' Nowhere', null, false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9y null school expected invalid, got %', v_r; end if;
  v_r := public.testing_add_rank(null, 'No class', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9z null class expected invalid, got %', v_r; end if;
  v_r := public.testing_update_class(v_w3, null, v_tag || ' Gamma', null, false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9za null expected_version expected invalid, got %', v_r; end if;
  v_r := public.testing_update_rank(null, 1, 'x', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 9zb null rank id expected invalid, got %', v_r; end if;

  -- -------------------------------------------------------------------
  -- Test 25: belts (rulebook v0.64/v0.65; added in step A). The same
  --          rules as validateBelt in the app's belts.js:
  --   25a-c valid belts are accepted and stored exactly as sent
  --   25d   every kind of broken belt -> invalid (add and update), and
  --         nothing is written
  --   25e   a bad belt is invalid BEFORE the rank is looked up (gone
  --         rank, wrong version: still invalid, not not_found / stale)
  --   25f   a belt-only change is a content change (new version, history
  --         row with only the changed columns); the same belt again isn't
  --   25g   as postgres: a bad belt is refused by the table rule; a row
  --         written without belt values gets a plain white belt
  -- (Test 25h, anon can't read the belt columns, is with test 3 below;
  --  the exact column grants are in catalog check C1.)
  -- -------------------------------------------------------------------
  v_r := public.testing_add_class('worcester', v_tag || ' Belts', null, false);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 25 setup add class, got %', v_r; end if;
  v_b := (v_r ->> 'id')::uuid;

  -- 25a. black with a white middle stripe and 2 yellow end stripes
  v_r := public.testing_add_rank(v_b, 'Belt stripe', 0, 0, 0, true, 'stripe', 'black', 'white', 2, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 25a stripe belt with end stripes expected ok, got %', v_r; end if;
  v_rb := (v_r ->> 'id')::uuid;
  -- read back as A1 (authenticated): proves the five columns are readable
  select count(*) into v_n from public.testing_ranks r
   where r.id = v_rb and r.belt_pattern = 'stripe' and r.belt_color = 'black' and r.belt_color_2 = 'white'
     and r.belt_end_stripes = 2 and r.belt_end_stripe_color = 'yellow';
  if v_n <> 1 then raise exception 'TEST FAILED: 25a stored belt differs from what was sent'; end if;
  -- 25b. top half red, bottom half black
  v_r := public.testing_add_rank(v_b, 'Belt half', 0, 0, 0, true, 'half', 'red', 'black', 0, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 25b half belt expected ok, got %', v_r; end if;
  v_rb2 := (v_r ->> 'id')::uuid;
  select count(*) into v_n from public.testing_ranks r
   where r.id = v_rb2 and r.belt_pattern = 'half' and r.belt_color = 'red' and r.belt_color_2 = 'black'
     and r.belt_end_stripes = 0 and r.belt_end_stripe_color = 'yellow';
  if v_n <> 1 then raise exception 'TEST FAILED: 25b stored half belt differs from what was sent'; end if;
  -- 25c. the limits that are still fine: solid with 3 end stripes in another color
  v_r := public.testing_add_rank(v_b, 'Belt solid 3', 0, 0, 0, true, 'solid', 'brown', null, 3, 'red');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 25c solid belt with 3 red end stripes expected ok, got %', v_r; end if;

  -- 25d. broken belts -> invalid, for add_rank AND update_rank; nothing changes
  reset role;
  execute v_snap_sql into v_snap;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  for v_belt in
    select * from (values
      ('bad pattern',                  'stripes'::text, 'black'::text, 'white'::text, 0::integer, 'yellow'::text),
      ('null pattern',                 null,            'white',       null,          0,          'yellow'),
      ('bad color',                    'solid',         'pink',        null,          0,          'yellow'),
      ('color in capitals',            'solid',         'White',       null,          0,          'yellow'),
      ('null color',                   'solid',         null,          null,          0,          'yellow'),
      ('bad second color',             'stripe',        'black',       'pink',        0,          'yellow'),
      ('solid with a second color',    'solid',         'white',       'yellow',      0,          'yellow'),
      ('stripe without second color',  'stripe',        'white',       null,          0,          'yellow'),
      ('half without second color',    'half',          'red',         null,          0,          'yellow'),
      ('stripe, same colors',          'stripe',        'black',       'black',       0,          'yellow'),
      ('half, same colors',            'half',          'red',         'red',         0,          'yellow'),
      ('4 end stripes',                'solid',         'white',       null,          4,          'yellow'),
      ('-1 end stripes',               'solid',         'white',       null,          -1,         'yellow'),
      ('null end stripes',             'solid',         'white',       null,          null,       'yellow'),
      ('null end stripe color, 0',     'solid',         'white',       null,          0,          null),
      ('null end stripe color, 2',     'stripe',        'black',       'white',       2,          null),
      ('bad end stripe color',         'solid',         'white',       null,          1,          'gold'),
      ('empty end stripe color',       'solid',         'white',       null,          0,          '')
    ) as x(label, pattern, color, color_2, end_stripes, end_stripe_color)
  loop
    v_r := public.testing_add_rank(v_b, 'Bad belt', 0, 0, 0, true,
                                   v_belt.pattern, v_belt.color, v_belt.color_2, v_belt.end_stripes, v_belt.end_stripe_color);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: 25d add_rank with belt "%" expected {"status":"invalid"}, got %', v_belt.label, v_r;
    end if;
    v_r := public.testing_update_rank(v_rb, 1, 'Belt stripe', 0, 0, 0, true,
                                      v_belt.pattern, v_belt.color, v_belt.color_2, v_belt.end_stripes, v_belt.end_stripe_color);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: 25d update_rank with belt "%" expected {"status":"invalid"}, got %', v_belt.label, v_r;
    end if;
  end loop;

  -- 25e. a bad belt is caught with the other input, before any lookup
  v_r := public.testing_add_rank(v_rand, 'Bad belt', 0, 0, 0, true, 'solid', 'white', 'black', 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 25e add_rank, missing class + bad belt expected invalid, got %', v_r; end if;
  v_r := public.testing_update_rank(v_rand, 1, 'Bad belt', 0, 0, 0, true, 'solid', 'white', 'black', 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 25e update_rank, missing rank + bad belt expected invalid, got %', v_r; end if;
  v_r := public.testing_update_rank(v_rb, 99, 'Belt stripe', 0, 0, 0, true, 'solid', 'white', 'black', 0, 'yellow');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 25e update_rank, wrong version + bad belt expected invalid, got %', v_r; end if;
  reset role;
  execute v_snap_sql into v_snap2;
  if v_snap2 is distinct from v_snap then raise exception 'TEST FAILED: 25d/e refused belts changed data or wrote history'; end if;

  -- 25f. version rule: belt columns are content columns
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- only the end stripes change (2 -> 3) -> version 2
  v_r := public.testing_update_rank(v_rb, 1, 'Belt stripe', 0, 0, 0, true, 'stripe', 'black', 'white', 3, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 2 then
    raise exception 'TEST FAILED: 25f belt-only change (end stripes) expected ok version 2, got %', v_r;
  end if;
  -- the same belt again -> ok, still version 2, no history row
  v_r := public.testing_update_rank(v_rb, 2, 'Belt stripe', 0, 0, 0, true, 'stripe', 'black', 'white', 3, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 2 then
    raise exception 'TEST FAILED: 25f same belt again expected ok version 2, got %', v_r;
  end if;
  -- only the second color changes (white -> yellow) -> version 3
  v_r := public.testing_update_rank(v_rb, 2, 'Belt stripe', 0, 0, 0, true, 'stripe', 'black', 'yellow', 3, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 3 then
    raise exception 'TEST FAILED: 25f belt-only change (second color) expected ok version 3, got %', v_r;
  end if;
  -- stripe -> solid (second color becomes NULL) -> version 4
  v_r := public.testing_update_rank(v_rb, 3, 'Belt stripe', 0, 0, 0, true, 'solid', 'black', null, 3, 'yellow');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 4 then
    raise exception 'TEST FAILED: 25f stripe -> solid expected ok version 4, got %', v_r;
  end if;
  -- only the end stripe color, with 0 end stripes, still counts -> version 5 / 6
  v_r := public.testing_update_rank(v_rb, 4, 'Belt stripe', 0, 0, 0, true, 'solid', 'black', null, 0, 'yellow');
  v_r := public.testing_update_rank(v_rb, 5, 'Belt stripe', 0, 0, 0, true, 'solid', 'black', null, 0, 'red');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 6 then
    raise exception 'TEST FAILED: 25f end stripe color change with 0 end stripes expected ok version 6, got %', v_r;
  end if;
  -- a reorder never changes a belt or a version (only positions move)
  v_r := public.testing_reorder_ranks(v_b, array(select r.id from public.testing_ranks r where r.class_id = v_b order by r.position),
                                     array(select r.id from public.testing_ranks r where r.class_id = v_b order by r.position desc));
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 25f reorder belt ranks, got %', v_r; end if;
  set constraints all immediate;
  reset role;
  if (select r.version from public.testing_ranks r where r.id = v_rb) <> 6
     or (select r.version from public.testing_ranks r where r.id = v_rb2) <> 1 then
    raise exception 'TEST FAILED: 25f reorder changed a belt rank''s version';
  end if;
  -- history: 5 update rows for v_rb (no row for the repeat), each holding
  -- only what changed. The first one: only belt_end_stripes (+ version,
  -- updated_at), never the name or prices.
  select count(*) into v_n from public.change_log l
   where l.id > v_mark and l.record_id = v_rb and l.op = 'update' and l.action = 'update_rank';
  if v_n <> 5 then raise exception 'TEST FAILED: 25f expected 5 update_rank history rows for the belt rank, got %', v_n; end if;
  select count(*) into v_n from public.change_log l
   where l.id = (select min(id) from public.change_log where id > v_mark and record_id = v_rb)
     and l.before ->> 'belt_end_stripes' = '2' and l.after ->> 'belt_end_stripes' = '3'
     and (l.after ->> 'version')::int = 2
     and not (l.after ?| array['name', 'early_cents', 'day_cents', 'private_cents', 'sparring_gear',
                               'belt_pattern', 'belt_color', 'belt_color_2', 'belt_end_stripe_color']);
  if v_n <> 1 then raise exception 'TEST FAILED: 25f the end-stripes history row should hold only the changed columns'; end if;
  select count(*) into v_n from public.change_log l
   where l.id > v_mark and l.record_id = v_rb and l.op = 'update'
     and l.before ->> 'belt_pattern' = 'stripe' and l.after ->> 'belt_pattern' = 'solid'
     and l.before ->> 'belt_color_2' = 'yellow' and l.after -> 'belt_color_2' = 'null'::jsonb;
  if v_n <> 1 then raise exception 'TEST FAILED: 25f the stripe -> solid history row should show belt_color_2 becoming null'; end if;
  -- the add_rank history row holds the full belt
  if not exists (select 1 from public.change_log l
                  where l.record_id = v_rb2 and l.op = 'insert' and l.action = 'add_rank'
                    and l.after ->> 'belt_pattern' = 'half' and l.after ->> 'belt_color' = 'red'
                    and l.after ->> 'belt_color_2' = 'black' and l.after ->> 'belt_end_stripes' = '0'
                    and l.after ->> 'belt_end_stripe_color' = 'yellow') then
    raise exception 'TEST FAILED: 25f add_rank history row should hold the five belt values';
  end if;

  -- 25g. as postgres (the SQL Editor): the table rule refuses a bad belt...
  begin
    update public.testing_ranks set belt_color_2 = 'black' where id = v_rb;   -- solid with a second color
    raise exception 'TEST FAILED: 25g a solid belt with a second color was stored';
  exception when check_violation then
    get stacked diagnostics v_txt = constraint_name;
    if v_txt is distinct from 'testing_ranks_belt_check' then raise exception 'TEST FAILED: 25g expected testing_ranks_belt_check, got %', v_txt; end if;
  end;
  begin
    update public.testing_ranks set belt_end_stripe_color = null where id = v_rb;
    raise exception 'TEST FAILED: 25g a NULL end stripe color was stored';
  exception when not_null_violation then null;
  end;
  begin
    update public.testing_ranks set belt_end_stripes = 4 where id = v_rb;
    raise exception 'TEST FAILED: 25g 4 end stripes were stored';
  exception when check_violation then null;
  end;
  -- ...and a row written without belt values gets a plain white belt
  insert into public.testing_ranks (class_id, location_code, name, position, early_cents, day_cents, private_cents)
  values (v_b, 'worcester', 'Belt default', 3, 0, 0, 0)
  returning id into v_rb2;
  select count(*) into v_n from public.testing_ranks r
   where r.id = v_rb2 and r.belt_pattern = 'solid' and r.belt_color = 'white' and r.belt_color_2 is null
     and r.belt_end_stripes = 0 and r.belt_end_stripe_color = 'yellow';
  if v_n <> 1 then raise exception 'TEST FAILED: 25g a rank written without belt values should get a plain white belt'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- -------------------------------------------------------------------
  -- Test 10: the final award must be in the SAME school
  -- Test 10b: ...and never one of the class's OWN ranks
  -- Test 10c: ...and a rank that no longer exists -> stale
  -- -------------------------------------------------------------------
  v_r := public.testing_add_class('worcester', v_tag || ' Cross', v_r_s1blue, false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 10a add_class with an award from the other school expected invalid, got %', v_r; end if;
  v_r := public.testing_update_class(v_w2, 1, v_tag || ' Beta', v_r_s1blue, false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 10b update_class with an award from the other school expected invalid, got %', v_r; end if;
  v_r := public.testing_update_class(v_w1, 4, v_tag || ' Alpha', v_r_yellow, false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 10c update_class with its own rank as award expected invalid, got %', v_r; end if;
  v_r := public.testing_add_class('worcester', v_tag || ' Ghost', gen_random_uuid(), false);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 10d add_class with a missing award rank expected stale, got %', v_r; end if;
  v_r := public.testing_update_class(v_w2, 1, v_tag || ' Beta', gen_random_uuid(), false);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 10e update_class with a missing award rank expected stale, got %', v_r; end if;
  -- a valid award at add time is fine
  v_r := public.testing_add_class('worcester', v_tag || ' Awarded', v_r_hblue, false);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 10f add_class with a same-school award expected ok, got %', v_r; end if;
  v_w8 := (v_r ->> 'id')::uuid;
  reset role;
  if (select c.final_award_rank_id from public.testing_classes c where c.id = v_w8) is distinct from v_r_hblue then
    raise exception 'TEST FAILED: 10g add_class did not save the final award';
  end if;

  -- the table rules themselves, written directly as postgres
  begin
    update public.testing_classes set final_award_rank_id = v_r_s1blue where id = v_w2;
    raise exception 'TEST FAILED: 10h postgres could set a final award from the other school';
  exception
    when foreign_key_violation then null;
  end;
  begin
    update public.testing_classes set final_award_rank_id = v_r_yellow where id = v_w1;
    raise exception 'TEST FAILED: 10i postgres could set a class''s own rank as its final award';
  exception
    when check_violation then null;
  end;

  -- -------------------------------------------------------------------
  -- Test 10d: final award "None" (amended v0.62). Three states:
  --   a rank (rank id, none false) / None (NULL, true) / Not set (NULL, false)
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_class('worcester', v_tag || ' None A', null, true);
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'final_award_none' is distinct from 'true'::jsonb
     or (v_r ->> 'version')::int is distinct from 1 then
    raise exception 'TEST FAILED: 10d-a add_class with None expected ok, final_award_none true, version 1, got %', v_r;
  end if;
  v_n1 := (v_r ->> 'id')::uuid;
  -- a rank AND None together, or None left NULL -> invalid
  v_r := public.testing_add_class('worcester', v_tag || ' None B', v_r_hblue, true);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 10d-b add_class rank + None expected invalid, got %', v_r; end if;
  v_r := public.testing_add_class('worcester', v_tag || ' None C', null, null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 10d-c add_class None NULL expected invalid, got %', v_r; end if;
  v_r := public.testing_update_class(v_n1, 1, v_tag || ' None A', v_r_hblue, true);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 10d-d update_class rank + None expected invalid, got %', v_r; end if;
  v_r := public.testing_update_class(v_n1, 1, v_tag || ' None A', null, null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 10d-e update_class None NULL expected invalid, got %', v_r; end if;
  reset role;
  if (select coalesce(c.final_award_rank_id::text, 'null') || '|' || c.final_award_none || '|' || c.version
        from public.testing_classes c where c.id = v_n1) is distinct from 'null|true|1' then
    raise exception 'TEST FAILED: 10d-f stored None class should be null|true|1';
  end if;
  if exists (select 1 from public.testing_classes c where c.name in (v_tag || ' None B', v_tag || ' None C')) then
    raise exception 'TEST FAILED: 10d-g a refused add_class created a class';
  end if;

  -- transitions: each one is a content change (version +1, logged); saving
  -- the same state again changes nothing
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_class(v_n1, 1, v_tag || ' None A', null, true);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 1 or v_r -> 'final_award_none' is distinct from 'true'::jsonb then
    raise exception 'TEST FAILED: 10d-h no-op update with None expected ok version 1, got %', v_r;
  end if;
  v_r := public.testing_update_class(v_n1, 1, v_tag || ' None A', v_r_hblue, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 2 or v_r -> 'final_award_none' is distinct from 'false'::jsonb then
    raise exception 'TEST FAILED: 10d-i None -> rank expected ok version 2, got %', v_r;
  end if;
  v_r := public.testing_update_class(v_n1, 2, v_tag || ' None A', null, true);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 3 then
    raise exception 'TEST FAILED: 10d-j rank -> None expected ok version 3, got %', v_r;
  end if;
  v_r := public.testing_update_class(v_n1, 3, v_tag || ' None A', null, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 4 then
    raise exception 'TEST FAILED: 10d-k None -> Not set expected ok version 4, got %', v_r;
  end if;
  v_r := public.testing_update_class(v_n1, 4, v_tag || ' None A', null, true);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 5 then
    raise exception 'TEST FAILED: 10d-l Not set -> None expected ok version 5, got %', v_r;
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: 10d-m tags not cleared';
  end if;
  reset role;
  select count(*) into v_n from public.change_log l where l.id > v_mark;
  if v_n <> 4 then raise exception 'TEST FAILED: 10d-n expected 4 history rows (4 changes, no-op not logged), got %', v_n; end if;
  select count(*) into v_n from public.change_log l
   where l.id > v_mark and l.record_id = v_n1 and l.op = 'update' and l.action = 'update_class'
     and l.before -> 'final_award_none' = 'true'::jsonb and l.after -> 'final_award_none' = 'false'::jsonb
     and l.before -> 'final_award_rank_id' = 'null'::jsonb and l.after ->> 'final_award_rank_id' = v_r_hblue::text
     and (l.after ->> 'version')::int = 2;
  if v_n <> 1 then raise exception 'TEST FAILED: 10d-o the None -> rank change was not logged correctly'; end if;
  select count(*) into v_n from public.change_log l
   where l.id > v_mark and l.record_id = v_n1
     and l.before ->> 'final_award_rank_id' = v_r_hblue::text and l.after -> 'final_award_rank_id' = 'null'::jsonb
     and l.before -> 'final_award_none' = 'false'::jsonb and l.after -> 'final_award_none' = 'true'::jsonb;
  if v_n <> 1 then raise exception 'TEST FAILED: 10d-p the rank -> None change was not logged correctly'; end if;
  select count(*) into v_n from public.change_log l
   where l.id > v_mark and l.record_id = v_n1
     and (l.before ? 'final_award_none') and not (l.before ? 'final_award_rank_id')
     and (l.after ->> 'version')::int in (4, 5);
  if v_n <> 2 then raise exception 'TEST FAILED: 10d-q None <-> Not set changes were not logged as final_award_none only'; end if;

  -- the table rule itself: a rank AND None can't both be set (as postgres)
  begin
    update public.testing_classes set final_award_rank_id = v_r_hblue where id = v_n1;
    raise exception 'TEST FAILED: 10d-r postgres could set a rank while None is set';
  exception
    when check_violation then
      get stacked diagnostics v_txt = constraint_name;
      if v_txt is distinct from 'testing_classes_final_award_none_ck' then
        raise exception 'TEST FAILED: 10d-r expected testing_classes_final_award_none_ck, got %', v_txt;
      end if;
  end;

  -- deletes: a None class points at no rank, so it never loses an award.
  -- Class M (Mu) has ranks M1..M3; None A first chooses M3, then None.
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_m  := (public.testing_add_class('worcester', v_tag || ' Mu', null, false) ->> 'id')::uuid;
  v_m1 := (public.testing_add_rank(v_m, 'Mu 1', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_m2 := (public.testing_add_rank(v_m, 'Mu 2', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_m3 := (public.testing_add_rank(v_m, 'Mu 3', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_n1r1 := (public.testing_add_rank(v_n1, 'None 1', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_n1r2 := (public.testing_add_rank(v_n1, 'None 2', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_r := public.testing_update_class(v_n1, 5, v_tag || ' None A', v_m3, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 6 then raise exception 'TEST FAILED: 10d-s setup award M3, got %', v_r; end if;
  v_r := public.testing_update_class(v_n1, 6, v_tag || ' None A', null, true);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 7 then raise exception 'TEST FAILED: 10d-t setup None, got %', v_r; end if;
  -- deleting the rank it USED to point at: nobody loses an award
  v_r := public.testing_delete_rank(v_m3, 1, 1, array[v_m1, v_m2, v_m3], '{}');
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'classes_lost_award' is distinct from '[]'::jsonb then
    raise exception 'TEST FAILED: 10d-u deleting a rank a None class once used expected ok, no lost awards, got %', v_r;
  end if;
  -- deleting the whole class it used to point into: nobody loses an award
  v_r := public.testing_delete_class(v_m, 1, array[v_m2, v_m1], '{}', false);
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'classes_lost_award' is distinct from '[]'::jsonb then
    raise exception 'TEST FAILED: 10d-v deleting a class a None class once used expected ok, no lost awards, got %', v_r;
  end if;
  -- deleting the LAST rank of the None class itself: no lost award; the
  -- rank before it is now last (and also leads to None)
  v_r := public.testing_delete_rank(v_n1r2, 1, 7, array[v_n1r1, v_n1r2], '{}');
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'classes_lost_award' is distinct from '[]'::jsonb
     or (v_r ->> 'class_final_award_now_on')::uuid is distinct from v_n1r1 then
    raise exception 'TEST FAILED: 10d-w deleting the last rank of a None class expected ok, no lost awards, now on None 1, got %', v_r;
  end if;
  set constraints all immediate;
  reset role;
  if (select coalesce(c.final_award_rank_id::text, 'null') || '|' || c.final_award_none || '|' || c.version
        from public.testing_classes c where c.id = v_n1) is distinct from 'null|true|7' then
    raise exception 'TEST FAILED: 10d-x the None class changed after the deletes (expected null|true|7)';
  end if;

  -- -------------------------------------------------------------------
  -- Test 11: reorder with bad lists -> invalid; Test 12: with an old
  --          order -> stale. Nothing changes in either case.
  -- -------------------------------------------------------------------
  execute v_snap_sql into v_snap;
  v_ids := array(select c.id from public.testing_classes c where c.location_code = 'worcester' order by c.position);
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- classes
  v_r := public.testing_reorder_classes('worcester', v_ids, v_ids[1 : cardinality(v_ids) - 1] || v_s1);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11a reorder_classes with the other school''s class expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_classes('worcester', v_ids, v_ids[1 : cardinality(v_ids) - 1] || gen_random_uuid());
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11b reorder_classes not a permutation expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_classes('worcester', null, v_ids);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11c reorder_classes null expected list expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_classes('worcester', v_ids, null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11d reorder_classes null new list expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_classes('worcester', v_ids, v_ids[1 : cardinality(v_ids) - 1] || null::uuid);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11e reorder_classes null element expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_classes('worcester', v_ids, v_ids[1 : cardinality(v_ids) - 1] || v_ids[1]);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11f reorder_classes duplicate id expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_classes('worcester', v_ids || v_ids[1], v_ids || v_ids[1]);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11g reorder_classes duplicate in both lists expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_classes('worcester', v_ids, v_ids[1 : cardinality(v_ids) - 1]);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11h reorder_classes length mismatch expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_classes('boston', v_ids, v_ids);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11i reorder_classes unknown school expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_classes(null, v_ids, v_ids);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11j reorder_classes null school expected invalid, got %', v_r; end if;
  -- 12. an old order (as if another admin moved something meanwhile)
  v_ids2 := array(select x from unnest(v_ids) with ordinality as t(x, n) order by n desc);   -- reversed
  v_r := public.testing_reorder_classes('worcester', v_ids2, v_ids);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 12a reorder_classes with an old order expected stale, got %', v_r; end if;
  -- the other school's list sent for this school -> stale (not this school's order)
  v_r := public.testing_reorder_classes('shrewsbury', v_ids, v_ids);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 12b Worcester''s list sent for Shrewsbury expected stale, got %', v_r; end if;

  -- ranks (Alpha: Green, Yellow, Orange)
  v_ids := array[v_r_green, v_r_yellow, v_r_orange];
  v_r := public.testing_reorder_ranks(v_w1, v_ids, array[v_r_green, v_r_yellow, v_r_blue]);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11k reorder_ranks with another class''s rank expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_ranks(v_w1, v_ids, array[v_r_green, v_r_yellow, gen_random_uuid()]);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11l reorder_ranks not a permutation expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_ranks(v_w1, null, v_ids);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11m reorder_ranks null list expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_ranks(v_w1, v_ids, array[v_r_green, v_r_yellow, null]);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11n reorder_ranks null element expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_ranks(v_w1, v_ids, array[v_r_green, v_r_yellow, v_r_green]);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11o reorder_ranks duplicate expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_ranks(v_w1, v_ids, array[v_r_green, v_r_yellow]);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11p reorder_ranks length mismatch expected invalid, got %', v_r; end if;
  v_r := public.testing_reorder_ranks(null, v_ids, v_ids);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 11q reorder_ranks null class expected invalid, got %', v_r; end if;
  -- moving Beta's ranks "into" Alpha: Beta's ids sent for Alpha -> stale
  v_r := public.testing_reorder_ranks(v_w1, array[v_r_blue, v_r_hblue], array[v_r_hblue, v_r_blue]);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 12c another class''s ranks sent for Alpha expected stale, got %', v_r; end if;
  v_r := public.testing_reorder_ranks(v_w1, array[v_r_yellow, v_r_orange, v_r_green], v_ids);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 12d reorder_ranks with an old order expected stale, got %', v_r; end if;
  reset role;
  execute v_snap_sql into v_snap2;
  if v_snap2 is distinct from v_snap then raise exception 'TEST FAILED: 11/12 refused reorders changed data or wrote history'; end if;

  -- -------------------------------------------------------------------
  -- Test 13: a wrong expected version -> stale, nothing changes
  -- (Alpha is version 4, Yellow 1, Beta 1)
  -- For the two deletes, everything else sent is read from the database
  -- right now, so ONLY the version is wrong (amended after security review).
  -- -------------------------------------------------------------------
  v_v  := (select c.version from public.testing_classes c where c.id = v_w1);
  v_ids := array(select r.id from public.testing_ranks r where r.class_id = v_w1 order by r.position);
  v_ids2 := array(select c.id from public.testing_classes c where c.final_award_rank_id = v_r_yellow);
  v_n  := (select r.version from public.testing_ranks r where r.id = v_r_yellow);
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_rank(v_r_yellow, 2, 'Yellow 2', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 13a update_rank wrong version expected stale, got %', v_r; end if;
  v_r := public.testing_update_class(v_w1, 3, v_tag || ' Alpha 2', null, false);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 13c update_class wrong version expected stale, got %', v_r; end if;
  v_r := public.testing_delete_rank(v_r_yellow, v_n + 1, v_v, v_ids, v_ids2);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 13d delete_rank wrong version expected stale, got %', v_r; end if;
  reset role;
  v_v  := (select c.version from public.testing_classes c where c.id = v_w2);
  v_ids := array(select r.id from public.testing_ranks r where r.class_id = v_w2);
  v_ids2 := array(select c.id from public.testing_classes c where c.final_award_rank_id = any (v_ids));
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_delete_class(v_w2, v_v + 1, v_ids, v_ids2, false);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 13e delete_class wrong version expected stale, got %', v_r; end if;

  -- not_found: the record is gone (random ids)
  v_r := public.testing_update_class(gen_random_uuid(), 1, v_tag || ' Gone', null, false);
  if v_r is distinct from '{"status": "not_found"}'::jsonb then raise exception 'TEST FAILED: 13f update_class missing class expected not_found, got %', v_r; end if;
  v_r := public.testing_delete_class(gen_random_uuid(), 1, '{}', '{}', false);
  if v_r is distinct from '{"status": "not_found"}'::jsonb then raise exception 'TEST FAILED: 13g delete_class missing class expected not_found, got %', v_r; end if;
  v_r := public.testing_add_rank(gen_random_uuid(), 'Lost', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "not_found"}'::jsonb then raise exception 'TEST FAILED: 13h add_rank missing class expected not_found, got %', v_r; end if;
  v_r := public.testing_update_rank(gen_random_uuid(), 1, 'Lost', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow');
  if v_r is distinct from '{"status": "not_found"}'::jsonb then raise exception 'TEST FAILED: 13i update_rank missing rank expected not_found, got %', v_r; end if;
  v_r := public.testing_reorder_ranks(gen_random_uuid(), '{}', '{}');
  if v_r is distinct from '{"status": "not_found"}'::jsonb then raise exception 'TEST FAILED: 13j reorder_ranks missing class expected not_found, got %', v_r; end if;
  v_batch := gen_random_uuid();
  v_r := public.testing_delete_rank(v_batch, 1, 1, array[v_batch], '{}');
  if v_r is distinct from '{"status": "not_found"}'::jsonb then raise exception 'TEST FAILED: 13k delete_rank missing rank expected not_found, got %', v_r; end if;
  reset role;
  execute v_snap_sql into v_snap2;
  if v_snap2 is distinct from v_snap then raise exception 'TEST FAILED: 13 stale / not_found calls changed data or wrote history'; end if;

  -- -------------------------------------------------------------------
  -- Test 21b: written directly as postgres (no signed-in user), "last
  --           changed by" is the tkd.actor_label if set, else
  --           'Database admin'; history says 'manual'.
  -- Test 13b: a reorder by A1 leaves version, updated_at, updated_by and
  --           updated_by_name exactly as they were (A1's name never
  --           appears on them). (updated_at can't differ inside one
  --           transaction - now() is fixed - so the other three prove it.)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', '', true);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  insert into public.testing_ranks (class_id, location_code, name, position, early_cents, day_cents, private_cents)
  select v_w2, 'worcester', 'Made in the editor', coalesce(max(r.position) + 1, 0), 0, 0, 0
    from public.testing_ranks r where r.class_id = v_w2
  returning id into v_r_pg;
  if (select r.created_by_name || '|' || r.updated_by_name || '|' || r.version || '|' || coalesce(r.created_by::text, 'null')
        from public.testing_ranks r where r.id = v_r_pg) is distinct from 'Database admin|Database admin|1|null' then
    raise exception 'TEST FAILED: 21d direct insert without a label expected "Database admin", version 1, created_by null';
  end if;
  select count(*) into v_n from public.change_log l
   where l.id > v_mark and l.record_id = v_r_pg and l.action = 'manual' and l.actor_id is null
     and l.actor_name = 'Database admin' and l.session_id is null and l.batch_id is null and l.op = 'insert';
  if v_n <> 1 then raise exception 'TEST FAILED: 19j direct SQL insert expected a "manual" history row by "Database admin"'; end if;

  perform set_config('tkd.actor_label', v_tag || ' label', true);
  insert into public.testing_classes (location_code, name, position, version)
  select 'worcester', v_tag || ' Labelled', coalesce(max(c.position) + 1, 0), 42
    from public.testing_classes c where c.location_code = 'worcester'
  returning id, version into v_w6, v_v;
  perform set_config('tkd.actor_label', '', true);
  if v_v <> 1 then raise exception 'TEST FAILED: 21e an insert must always start at version 1, got %', v_v; end if;
  if (select c.created_by_name || '|' || c.updated_by_name from public.testing_classes c where c.id = v_w6)
     is distinct from v_tag || ' label|' || v_tag || ' label' then
    raise exception 'TEST FAILED: 21f direct insert with tkd.actor_label expected that label as the name';
  end if;

  -- A1 moves both to the top of their lists
  v_ids := array(select r.id from public.testing_ranks r where r.class_id = v_w2 order by r.position);
  v_ids2 := array[v_r_pg] || array_remove(v_ids, v_r_pg);
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_reorder_ranks(v_w2, v_ids, v_ids2);
  if v_r is distinct from '{"status": "ok"}'::jsonb then raise exception 'TEST FAILED: 13b-3 reorder_ranks expected ok, got %', v_r; end if;
  reset role;
  v_ids := array(select c.id from public.testing_classes c where c.location_code = 'worcester' order by c.position);
  v_ids2 := array[v_w6] || array_remove(v_ids, v_w6);
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_reorder_classes('worcester', v_ids, v_ids2);
  if v_r is distinct from '{"status": "ok"}'::jsonb then raise exception 'TEST FAILED: 13b-4 reorder_classes expected ok, got %', v_r; end if;
  -- put the classes back the way they were (so real classes keep their places)
  v_r := public.testing_reorder_classes('worcester', v_ids2, v_ids);
  if v_r is distinct from '{"status": "ok"}'::jsonb then raise exception 'TEST FAILED: 13b-5 reorder_classes back expected ok, got %', v_r; end if;
  set constraints all immediate;
  reset role;
  if (select r.position || '|' || r.version || '|' || r.updated_by_name || '|' || coalesce(r.updated_by::text, 'null')
        from public.testing_ranks r where r.id = v_r_pg) is distinct from '0|1|Database admin|null' then
    raise exception 'TEST FAILED: 13b-6 reorder changed the rank''s version / updated_by / updated_by_name';
  end if;
  if (select c.version || '|' || c.updated_by_name || '|' || coalesce(c.updated_by::text, 'null')
        from public.testing_classes c where c.id = v_w6) is distinct from '1|' || v_tag || ' label|null' then
    raise exception 'TEST FAILED: 13b-7 reorder changed the class''s version / updated_by / updated_by_name';
  end if;
  execute v_dense_sql into v_bool;
  if not v_bool then raise exception 'TEST FAILED: 13b-8 positions not dense after the reorders'; end if;

  -- -------------------------------------------------------------------
  -- Test 14: id, location_code and class_id can never change (as postgres)
  -- -------------------------------------------------------------------
  begin
    update public.testing_classes set location_code = 'shrewsbury' where id = v_w2;
    raise exception 'TEST FAILED: 14a class location_code changed';
  exception when check_violation then null;
  end;
  begin
    update public.testing_classes set id = gen_random_uuid() where id = v_w2;
    raise exception 'TEST FAILED: 14b class id changed';
  exception when check_violation then null;
  end;
  begin
    update public.testing_ranks set class_id = v_w3 where id = v_r_blue;
    raise exception 'TEST FAILED: 14c rank class_id changed';
  exception when check_violation then null;
  end;
  begin
    update public.testing_ranks set location_code = 'shrewsbury' where id = v_r_blue;
    raise exception 'TEST FAILED: 14d rank location_code changed';
  exception when check_violation then null;
  end;
  begin
    update public.testing_ranks set id = gen_random_uuid() where id = v_r_blue;
    raise exception 'TEST FAILED: 14e rank id changed';
  exception when check_violation then null;
  end;

  -- -------------------------------------------------------------------
  -- Test 15: delete a middle rank -> ok; the rest close the gap; other
  --          ranks' versions untouched
  -- (Alpha: Green v2, Yellow v1, Orange v3; Alpha version 4; its final
  --  award is Beta's Blue)
  -- -------------------------------------------------------------------
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- the rank must be in the list the dialog showed
  v_r := public.testing_delete_rank(v_r_yellow, 1, 4, array[v_r_green, v_r_orange], '{}');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 15a delete_rank not in its own list expected invalid, got %', v_r; end if;
  v_r := public.testing_delete_rank(v_r_yellow, 1, 4, array[v_r_green, v_r_yellow, v_r_orange], array[v_w1, null]);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 15b delete_rank null in lost list expected invalid, got %', v_r; end if;
  v_r := public.testing_delete_rank(v_r_yellow, 1, null, array[v_r_green, v_r_yellow, v_r_orange], '{}');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 15c delete_rank null class version expected invalid, got %', v_r; end if;

  v_r := public.testing_delete_rank(v_r_yellow, 1, 4, array[v_r_green, v_r_yellow, v_r_orange], '{}');
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'classes_lost_award' is distinct from '[]'::jsonb
     or (v_r ->> 'class_final_award_now_on')::uuid is distinct from v_r_orange then
    raise exception 'TEST FAILED: 15d delete middle rank expected ok, no lost awards, now on Orange, got %', v_r;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['class_final_award_now_on', 'classes_lost_award', 'status'] then
    raise exception 'TEST FAILED: 15e delete_rank ok result has unexpected keys: %', v_r;
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: 19k tags not cleared after delete_rank';
  end if;
  set constraints all immediate;
  reset role;
  if array(select r.id || ':' || r.position || ':' || r.version from public.testing_ranks r where r.class_id = v_w1 order by r.position)
     <> array[v_r_green || ':0:2', v_r_orange || ':1:3'] then
    raise exception 'TEST FAILED: 15f after the delete expected Green(0, v2), Orange(1, v3), got %',
      array(select r.name || ':' || r.position || ':' || r.version from public.testing_ranks r where r.class_id = v_w1 order by r.position);
  end if;
  if (select c.version from public.testing_classes c where c.id = v_w1) <> 4 then
    raise exception 'TEST FAILED: 15g deleting a rank changed its class''s version';
  end if;
  -- 19. history: the rank delete holds the full old row; the shift is a
  --     position-only update; both in one batch
  select count(*) into v_n from public.change_log l
   where l.id > v_mark and l.record_id = v_r_yellow and l.op = 'delete' and l.action = 'delete_rank'
     and l.after is null and l.before ->> 'id' = v_r_yellow::text and l.before ->> 'name' = 'Yellow'
     and l.before ? 'early_cents' and l.before ? 'sparring_gear' and l.before ? 'created_by_name'
     and l.location_code = 'worcester' and l.actor_id = v_admin;
  if v_n <> 1 then raise exception 'TEST FAILED: 19l delete_rank history row should hold the full old row'; end if;
  select count(*), count(distinct l.batch_id), count(l.batch_id) into v_n, v_n2, v_n3
    from public.change_log l where l.id > v_mark;
  if v_n <> 2 or v_n2 <> 1 or v_n3 <> 2 then
    raise exception 'TEST FAILED: 19m delete_rank expected 2 history rows in 1 non-null batch, got % rows, % batches', v_n, v_n2;
  end if;

  -- -------------------------------------------------------------------
  -- Test 16: delete a rank that is another class's final award -> that
  --          class's award becomes Not set (version +1) and is reported
  -- (Beta's Blue is Alpha's award. Beta: Made in the editor, Blue, High Blue.)
  -- -------------------------------------------------------------------
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_ids := array(select r.id from public.testing_ranks r where r.class_id = v_w2 order by r.position);
  v_v := (select c.version from public.testing_classes c where c.id = v_w2);
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- the dialog didn't know Alpha would lose its award -> stale
  v_r := public.testing_delete_rank(v_r_blue, 1, v_v, v_ids, '{}');
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 16a delete_rank with a missing lost-award class expected stale, got %', v_r; end if;
  v_r := public.testing_delete_rank(v_r_blue, 1, v_v, v_ids, array[v_w1]);
  if v_r ->> 'status' is distinct from 'ok'
     or v_r -> 'classes_lost_award' is distinct from jsonb_build_array(jsonb_build_object('id', v_w1, 'name', v_tag || ' Alpha'))
     or (v_r ->> 'class_final_award_now_on')::uuid is distinct from v_r_hblue then
    raise exception 'TEST FAILED: 16b delete a final-award rank expected ok, Alpha reported, now on High Blue, got %', v_r;
  end if;
  set constraints all immediate;
  reset role;
  if (select coalesce(c.final_award_rank_id::text, 'null') || '|' || c.version from public.testing_classes c where c.id = v_w1)
     is distinct from 'null|5' then
    raise exception 'TEST FAILED: 16c Alpha''s award should be Not set and its version 5';
  end if;
  -- 19. the automatic "set null" on Alpha is logged with delete_rank's
  --     action and batch
  select count(*), count(distinct l.batch_id) into v_n, v_n2
    from public.change_log l where l.id > v_mark and l.action = 'delete_rank' and l.actor_id = v_admin;
  if v_n <> 3 or v_n2 <> 1 then
    raise exception 'TEST FAILED: 19n delete_rank expected 3 rows (rank, Alpha''s award, High Blue''s shift) in 1 batch, got % rows, % batches', v_n, v_n2;
  end if;
  select count(*) into v_n from public.change_log l
   where l.id > v_mark and l.record_id = v_w1 and l.op = 'update' and l.action = 'delete_rank'
     and l.before ->> 'final_award_rank_id' = v_r_blue::text
     and l.after -> 'final_award_rank_id' = 'null'::jsonb
     and (l.after ->> 'version')::int = 5;
  if v_n <> 1 then raise exception 'TEST FAILED: 19o the automatic award clearing was not logged correctly'; end if;

  -- -------------------------------------------------------------------
  -- Test 17: delete a class -> its ranks go too, later classes move up,
  --          lost awards are cleared and reported (in list order)
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_w4 := (public.testing_add_class('worcester', v_tag || ' Delta', null, false) ->> 'id')::uuid;
  v_r_w4a := (public.testing_add_rank(v_w4, 'Delta 1', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_r_w4b := (public.testing_add_rank(v_w4, 'Delta 2', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_r_w4c := (public.testing_add_rank(v_w4, 'Delta 3', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_w5 := (public.testing_add_class('worcester', v_tag || ' Epsilon', v_r_w4b, false) ->> 'id')::uuid;
  v_r_w5a := (public.testing_add_rank(v_w5, 'Epsilon 1', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_r := public.testing_update_class(v_w1, 5, v_tag || ' Alpha', v_r_w4c, false);
  if v_r ->> 'status' is distinct from 'ok' or v_w4 is null or v_w5 is null or v_r_w4c is null or v_r_w5a is null then
    raise exception 'TEST FAILED: 17 setup failed (%)', v_r;
  end if;
  reset role;
  v_n := (select c.position from public.testing_classes c where c.id = v_w5);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- the lists are compared as sets: any order is fine
  v_r := public.testing_delete_class(v_w4, 1, array[v_r_w4c, v_r_w4a, v_r_w4b], array[v_w5, v_w1], false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'removed_rank_count')::int is distinct from 3
     or v_r -> 'classes_lost_award' is distinct from jsonb_build_array(
          jsonb_build_object('id', v_w1, 'name', v_tag || ' Alpha'),
          jsonb_build_object('id', v_w5, 'name', v_tag || ' Epsilon')) then
    raise exception 'TEST FAILED: 17a delete_class expected ok, 3 ranks removed, Alpha then Epsilon reported, got %', v_r;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['classes_lost_award', 'removed_rank_count', 'status'] then
    raise exception 'TEST FAILED: 17b delete_class ok result has unexpected keys: %', v_r;
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: 19p tags not cleared after delete_class';
  end if;
  set constraints all immediate;
  reset role;
  if exists (select 1 from public.testing_classes where id = v_w4)
     or exists (select 1 from public.testing_ranks where id in (v_r_w4a, v_r_w4b, v_r_w4c)) then
    raise exception 'TEST FAILED: 17c the class or its ranks still exist';
  end if;
  if (select c.position from public.testing_classes c where c.id = v_w5) <> v_n - 1 then
    raise exception 'TEST FAILED: 17d the class after the deleted one should have moved up to %', v_n - 1;
  end if;
  if (select count(*) from public.testing_classes c
       where c.id in (v_w1, v_w5) and c.final_award_rank_id is null) <> 2
     or (select c.version from public.testing_classes c where c.id = v_w1) <> 7
     or (select c.version from public.testing_classes c where c.id = v_w5) <> 2 then
    raise exception 'TEST FAILED: 17e Alpha and Epsilon should have no award now, versions 7 and 2';
  end if;
  execute v_dense_sql into v_bool;
  if not v_bool then raise exception 'TEST FAILED: 17f positions not dense after delete_class'; end if;
  -- 19. history: class delete + 3 cascaded rank deletes + 2 award
  --     clearings + Epsilon's move up, all delete_class, one batch
  select count(*), count(distinct l.batch_id), count(l.batch_id),
         count(*) filter (where l.op = 'delete' and l.table_name = 'testing_ranks' and l.after is null and l.before ? 'private_cents'),
         count(*) filter (where l.op = 'delete' and l.table_name = 'testing_classes' and l.record_id = v_w4 and l.before ->> 'name' = v_tag || ' Delta'),
         count(*) filter (where l.op = 'update' and l.after -> 'final_award_rank_id' = 'null'::jsonb)
    into v_n, v_n2, v_n3, v_i, v_v, v_v2
    from public.change_log l
   where l.id > v_mark and l.action = 'delete_class' and l.actor_id = v_admin and l.session_id = v_a1;
  if v_n2 <> 1 or v_n3 <> v_n or v_i <> 3 or v_v <> 1 or v_v2 <> 2 then
    raise exception 'TEST FAILED: 19q delete_class history: % rows, % batches, % rank deletes, % class deletes, % award clearings',
      v_n, v_n2, v_i, v_v, v_v2;
  end if;
  if (select count(*) from public.change_log l where l.id > v_mark) <> v_n then
    raise exception 'TEST FAILED: 19r delete_class wrote history rows with another action';
  end if;

  -- -------------------------------------------------------------------
  -- Test 18: delete class "only if empty" (Undo of add class)
  -- -------------------------------------------------------------------
  execute v_snap_sql into v_snap;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_delete_class(v_w5, 2, array[v_r_w5a], '{}', true);
  if v_r is distinct from '{"status": "not_empty"}'::jsonb then raise exception 'TEST FAILED: 18a only-if-empty on a class with ranks expected not_empty, got %', v_r; end if;
  -- not_empty is checked before the rank list (Undo sends an empty list)
  v_r := public.testing_delete_class(v_w5, 2, '{}', '{}', true);
  if v_r is distinct from '{"status": "not_empty"}'::jsonb then raise exception 'TEST FAILED: 18b only-if-empty with an empty list expected not_empty, got %', v_r; end if;
  v_r := public.testing_delete_class(v_w5, 2, array[v_r_w5a], '{}', null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 18c only_if_empty null expected invalid, got %', v_r; end if;
  v_r := public.testing_delete_class(v_w5, 2, null, '{}', false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 18d null rank list expected invalid, got %', v_r; end if;
  v_r := public.testing_delete_class(v_w5, 2, array[v_r_w5a, v_r_w5a], '{}', false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: 18e duplicate in rank list expected invalid, got %', v_r; end if;
  reset role;
  execute v_snap_sql into v_snap2;
  if v_snap2 is distinct from v_snap then raise exception 'TEST FAILED: 18f refused class deletes changed data'; end if;
  -- an EMPTY class: only-if-empty deletes it
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_class('worcester', v_tag || ' Undo me', null, false);
  v_r := public.testing_delete_class((v_r ->> 'id')::uuid, 1, '{}', '{}', true);
  if v_r is distinct from '{"status": "ok", "removed_rank_count": 0, "classes_lost_award": []}'::jsonb then
    raise exception 'TEST FAILED: 18g only-if-empty on an empty class expected ok with 0 ranks, got %', v_r;
  end if;

  -- -------------------------------------------------------------------
  -- Test 18b: a delete confirmation can't go stale - if anything it
  --           stated changed meanwhile, nothing is deleted (stale)
  -- Uses "Labelled" (v_w6, made in test 21b): give it 3 ranks.
  -- -------------------------------------------------------------------
  v_r_w6a := (public.testing_add_rank(v_w6, 'Six A', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_r_w6b := (public.testing_add_rank(v_w6, 'Six B', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_r_w6c := (public.testing_add_rank(v_w6, 'Six C', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  if v_r_w6c is null then raise exception 'TEST FAILED: 18b setup failed'; end if;
  reset role;
  execute v_snap_sql into v_snap;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- (a) the dialog showed A, B, C; meanwhile the order became B, A, C
  v_r := public.testing_reorder_ranks(v_w6, array[v_r_w6a, v_r_w6b, v_r_w6c], array[v_r_w6b, v_r_w6a, v_r_w6c]);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 18b-a setup reorder, got %', v_r; end if;
  v_r := public.testing_delete_rank(v_r_w6c, 1, 1, array[v_r_w6a, v_r_w6b, v_r_w6c], '{}');
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 18b-a delete_rank after a reorder expected stale, got %', v_r; end if;

  -- (b) the class's final award changed after the dialog opened (class
  --     version 1 -> 2): the sentence named the old award
  v_r := public.testing_update_class(v_w6, 1, v_tag || ' Labelled', v_r_hblue, false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 2 then raise exception 'TEST FAILED: 18b-b setup award, got %', v_r; end if;
  v_r := public.testing_delete_rank(v_r_w6c, 1, 1, array[v_r_w6b, v_r_w6a, v_r_w6c], '{}');
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 18b-b delete_rank with an old class version expected stale, got %', v_r; end if;

  -- (c) another class chose this rank as its award after the dialog opened
  v_r := public.testing_update_class(v_w5, 2, v_tag || ' Epsilon', v_r_w6c, false);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 18b-c setup award, got %', v_r; end if;
  v_r := public.testing_delete_rank(v_r_w6c, 1, 2, array[v_r_w6b, v_r_w6a, v_r_w6c], '{}');
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 18b-c delete_rank missing a lost-award class expected stale, got %', v_r; end if;
  -- ...and a lost-award list naming a class that does NOT lose it
  v_r := public.testing_delete_rank(v_r_w6c, 1, 2, array[v_r_w6b, v_r_w6a, v_r_w6c], array[v_w5, v_w1]);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 18b-c2 delete_rank with an extra lost-award class expected stale, got %', v_r; end if;

  -- (d) a rank was added to the class after the class-delete dialog opened
  v_ids := array[v_r_w6a, v_r_w6b, v_r_w6c];
  v_r_w6d := (public.testing_add_rank(v_w6, 'Six D', 0, 0, 0, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  v_r := public.testing_delete_class(v_w6, 2, v_ids, array[v_w5], false);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 18b-d delete_class after a rank was added expected stale, got %', v_r; end if;

  -- (e) the lost-award list is out of date (Epsilon now uses Six C)
  v_ids := array[v_r_w6a, v_r_w6b, v_r_w6c, v_r_w6d];
  v_r := public.testing_delete_class(v_w6, 2, v_ids, '{}', false);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: 18b-e delete_class with a stale lost-award list expected stale, got %', v_r; end if;
  reset role;
  if (select count(*) from public.testing_ranks r where r.class_id = v_w6) <> 4
     or not exists (select 1 from public.testing_classes where id = v_w6) then
    raise exception 'TEST FAILED: 18b-f a stale confirmation deleted something';
  end if;

  -- with what the database really says, both deletes work
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_delete_rank(v_r_w6c, 1, 2, array[v_r_w6b, v_r_w6a, v_r_w6c, v_r_w6d], array[v_w5]);
  if v_r ->> 'status' is distinct from 'ok'
     or v_r -> 'classes_lost_award' is distinct from jsonb_build_array(jsonb_build_object('id', v_w5, 'name', v_tag || ' Epsilon'))
     or (v_r ->> 'class_final_award_now_on')::uuid is distinct from v_r_w6d then
    raise exception 'TEST FAILED: 18b-g delete_rank with the right lists expected ok, got %', v_r;
  end if;
  v_r := public.testing_delete_class(v_w6, 2, array[v_r_w6d, v_r_w6b, v_r_w6a], '{}', false);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'removed_rank_count')::int <> 3 then
    raise exception 'TEST FAILED: 18b-h delete_class with the right lists expected ok, 3 ranks, got %', v_r;
  end if;
  -- the last rank of a class: "now on" is the new last rank; an only
  -- rank: NULL (the class is empty now)
  v_r := public.testing_delete_rank(v_r_w5a, 1, 4, array[v_r_w5a], '{}');
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'class_final_award_now_on' is distinct from 'null'::jsonb then
    raise exception 'TEST FAILED: 18b-i deleting the only rank expected ok and class_final_award_now_on null, got %', v_r;
  end if;
  set constraints all immediate;
  reset role;
  execute v_dense_sql into v_bool;
  if not v_bool then raise exception 'TEST FAILED: 18b-j positions not dense at the end'; end if;

  -- -------------------------------------------------------------------
  -- Test 20: change_log is append-only, even for postgres
  -- -------------------------------------------------------------------
  select max(id) into v_mark from public.change_log;
  begin
    update public.change_log set action = 'edited' where id = v_mark;
    raise exception 'TEST FAILED: 20a change_log row was updated';
  exception when raise_exception then
    if sqlerrm <> 'change_log is append-only' then raise exception 'TEST FAILED: 20a unexpected error: %', sqlerrm; end if;
  end;
  begin
    delete from public.change_log where id = v_mark;
    raise exception 'TEST FAILED: 20b change_log row was deleted';
  exception when raise_exception then
    if sqlerrm <> 'change_log is append-only' then raise exception 'TEST FAILED: 20b unexpected error: %', sqlerrm; end if;
  end;
  begin
    truncate public.change_log;
    raise exception 'TEST FAILED: 20c change_log was truncated';
  exception when raise_exception then
    if sqlerrm <> 'change_log is append-only' then raise exception 'TEST FAILED: 20c unexpected error: %', sqlerrm; end if;
  end;
  if not exists (select 1 from public.change_log where id = v_mark and action <> 'edited') then
    raise exception 'TEST FAILED: 20d the change_log row is gone or changed';
  end if;
  -- the class and rank tables can't be emptied with TRUNCATE either (it
  -- would skip the history) (amended after security review)
  begin
    truncate public.testing_ranks cascade;   -- (without cascade Postgres refuses anyway: classes point at ranks)
    raise exception 'TEST FAILED: 20e testing_ranks was truncated';
  exception when raise_exception then
    if sqlerrm not like 'testing_% can''t be truncated%' then raise exception 'TEST FAILED: 20e unexpected error: %', sqlerrm; end if;
  end;
  begin
    truncate public.testing_classes cascade;
    raise exception 'TEST FAILED: 20f testing_classes was truncated';
  exception when raise_exception then
    if sqlerrm not like 'testing_% can''t be truncated%' then raise exception 'TEST FAILED: 20f unexpected error: %', sqlerrm; end if;
  end;
  if not exists (select 1 from public.testing_ranks where id = v_r_green) then
    raise exception 'TEST FAILED: 20g a refused truncate removed rows';
  end if;

  -- ===================================================================
  -- CATALOG CHECKS: the permissions on EVERY object 0003 created
  -- (has_*_privilege answer "could this role do this?" from the rules
  -- themselves, so these prove the rules, not just a few samples)
  -- ===================================================================

  -- C1. tables: anon, service_role and PUBLIC nothing; authenticated no
  --     table-wide rights and SELECT on exactly the listed columns
  --     (service_role, MAINTAIN: amended after security review)
  v_list := array[
    'locations.code', 'locations.name',
    'testing_classes.id', 'testing_classes.location_code', 'testing_classes.name', 'testing_classes.position',
    'testing_classes.final_award_rank_id', 'testing_classes.final_award_none', 'testing_classes.version', 'testing_classes.created_at',
    'testing_classes.updated_at', 'testing_classes.created_by_name', 'testing_classes.updated_by_name',
    'testing_ranks.id', 'testing_ranks.class_id', 'testing_ranks.location_code', 'testing_ranks.name',
    'testing_ranks.position', 'testing_ranks.early_cents', 'testing_ranks.day_cents', 'testing_ranks.private_cents',
    'testing_ranks.sparring_gear',
    'testing_ranks.belt_pattern', 'testing_ranks.belt_color', 'testing_ranks.belt_color_2',   -- belts: added in step A
    'testing_ranks.belt_end_stripes', 'testing_ranks.belt_end_stripe_color',
    'testing_ranks.version', 'testing_ranks.created_at', 'testing_ranks.updated_at',
    'testing_ranks.created_by_name', 'testing_ranks.updated_by_name'];
  foreach v_tbl in array array['locations', 'testing_classes', 'testing_ranks', 'change_log'] loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] loop
      if has_table_privilege('anon', 'public.' || v_tbl, v_priv)
         or has_table_privilege('authenticated', 'public.' || v_tbl, v_priv)
         or has_table_privilege('service_role', 'public.' || v_tbl, v_priv)
         or has_table_privilege('public', 'public.' || v_tbl, v_priv) then
        raise exception 'TEST FAILED: C1a % has table-wide % for anon, authenticated, service_role or PUBLIC', v_tbl, v_priv;
      end if;
    end loop;
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege('anon', 'public.' || v_tbl, v_priv)
         or has_any_column_privilege('service_role', 'public.' || v_tbl, v_priv)
         or has_any_column_privilege('public', 'public.' || v_tbl, v_priv)
         or (v_priv <> 'SELECT' and has_any_column_privilege('authenticated', 'public.' || v_tbl, v_priv)) then
        raise exception 'TEST FAILED: C1b % has a column % right it should not have', v_tbl, v_priv;
      end if;
    end loop;
  end loop;
  -- Only the columns 0003 made: on locations that is code and name (0005
  -- later adds id, the address, version and updated_* there, with their
  -- own read rights - 0005_tests.sql checks those). The other three
  -- tables are 0003's alone, so every column of theirs is checked. This
  -- way C1c passes before AND after 0005.
  for v_tbl, v_col in
    select c.relname::text, a.attname::text
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('locations', 'testing_classes', 'testing_ranks', 'change_log')
       and (c.relname <> 'locations' or a.attname in ('code', 'name'))
       and a.attnum > 0 and not a.attisdropped
  loop
    if has_column_privilege('authenticated', 'public.' || v_tbl, v_col, 'SELECT')
       is distinct from (v_tbl || '.' || v_col = any (v_list)) then
      raise exception 'TEST FAILED: C1c authenticated SELECT on %.% is %, expected %',
        v_tbl, v_col, has_column_privilege('authenticated', 'public.' || v_tbl, v_col, 'SELECT'), (v_tbl || '.' || v_col = any (v_list));
    end if;
  end loop;
  -- every column in the list really exists (so C1c can't pass by
  -- skipping a column that is missing)
  select string_agg(x.col, ', ') into v_txt
    from unnest(v_list) as x(col)
   where not exists (select 1 from pg_attribute a
                       join pg_class c on c.oid = a.attrelid
                       join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relname || '.' || a.attname = x.col
                        and a.attnum > 0 and not a.attisdropped);
  if v_txt is not null then raise exception 'TEST FAILED: C1c listed column(s) missing: %', v_txt; end if;
  if has_any_column_privilege('authenticated', 'public.change_log', 'SELECT') then
    raise exception 'TEST FAILED: C1d authenticated can read some column of change_log';
  end if;
  if has_column_privilege('authenticated', 'public.testing_classes', 'created_by', 'SELECT')
     or has_column_privilege('authenticated', 'public.testing_classes', 'updated_by', 'SELECT')
     or has_column_privilege('authenticated', 'public.testing_ranks', 'created_by', 'SELECT')
     or has_column_privilege('authenticated', 'public.testing_ranks', 'updated_by', 'SELECT') then
    raise exception 'TEST FAILED: C1e authenticated can read created_by / updated_by';
  end if;

  -- C2. the history's id counter: no rights for anon / authenticated /
  --     service_role / PUBLIC
  foreach v_priv in array array['USAGE', 'SELECT', 'UPDATE'] loop
    if has_sequence_privilege('anon', 'public.change_log_id_seq', v_priv)
       or has_sequence_privilege('authenticated', 'public.change_log_id_seq', v_priv)
       or has_sequence_privilege('service_role', 'public.change_log_id_seq', v_priv)
       or has_sequence_privilege('public', 'public.change_log_id_seq', v_priv) then
      raise exception 'TEST FAILED: C2 change_log_id_seq has % for anon, authenticated, service_role or PUBLIC', v_priv;
    end if;
  end loop;

  -- C3. functions: anon and service_role none; authenticated EXACTLY the
  --     8 app functions;
  --     no function executable by PUBLIC (=X in its rights list; an
  --     empty list means the built-in default, which includes PUBLIC)
  --     Checked: exactly the 19 functions 0003 makes, by name (0005 later
  --     adds more testing_* functions - 0005_tests.sql checks those - so
  --     this passes before AND after 0005).
  v_list := array['testing_add_class', 'testing_update_class', 'testing_reorder_classes', 'testing_delete_class',
                  'testing_add_rank', 'testing_update_rank', 'testing_reorder_ranks', 'testing_delete_rank'];
  v_names := v_list || array['testing_normalize_name', 'testing_name_is_valid', 'testing_cents_is_valid',
                             'testing_ids_are_valid', 'testing_belt_is_valid', 'change_log_actor_name',
                             'testing_classes_before_write', 'testing_ranks_before_write', 'change_log_write',
                             'change_log_refuse_change', 'testing_refuse_truncate'];
  v_n := 0;
  for v_fn in
    select p.oid, p.proname::text as name, p.proacl, p.proowner, p.prosecdef, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (v_names)
  loop
    v_n := v_n + 1;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE') or has_function_privilege('service_role', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: C3a anon or service_role can execute %', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_list)) then
      raise exception 'TEST FAILED: C3b authenticated execute on % is %, expected %',
        v_fn.oid::regprocedure, has_function_privilege('authenticated', v_fn.oid, 'EXECUTE'), (v_fn.name = any (v_list));
    end if;
    if exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) as a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'TEST FAILED: C3c PUBLIC can execute %', v_fn.oid::regprocedure;
    end if;
    -- C5 (also for the non-definer ones): every 0003 function pins search_path
    if not coalesce('search_path=""' = any (v_fn.proconfig), false) then
      raise exception 'TEST FAILED: C5a % has no search_path = ''''', v_fn.oid::regprocedure;
    end if;
    -- which ones run as their owner (security definer) is part of the design
    if v_fn.prosecdef is distinct from (v_fn.name = any (v_list) or v_fn.name in ('change_log_write', 'change_log_actor_name')) then
      raise exception 'TEST FAILED: C5b % security definer is %, not as designed', v_fn.oid::regprocedure, v_fn.prosecdef;
    end if;
  end loop;
  if v_n <> 19 then raise exception 'TEST FAILED: C3d expected exactly the 19 functions of 0003 (one version each), found %', v_n; end if;
  -- and no OTHER change_log_* function (the history's functions are 0003's alone)
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'change\_log\_%' and not (p.proname = any (v_names));
  if v_txt is not null then raise exception 'TEST FAILED: C3d unexpected change_log function(s): %', v_txt; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_list);
  if v_n <> 8 then raise exception 'TEST FAILED: C3e expected exactly 8 app functions (no extra versions), found %', v_n; end if;
  -- C3f. no argument defaults on the two class functions and the two
  --      rank functions (the app always sends every argument, including
  --      the five belt values); delete_class has exactly one
  --      (p_only_if_empty default false) (amended v0.62, security re-check;
  --      rank functions: added in step A)
  select string_agg(p.proname || '=' || p.pronargdefaults, ', ' order by p.proname) into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('testing_add_class', 'testing_update_class', 'testing_delete_class',
                       'testing_add_rank', 'testing_update_rank');
  if v_txt is distinct from 'testing_add_class=0, testing_add_rank=0, testing_delete_class=1, testing_update_class=0, testing_update_rank=0' then
    raise exception 'TEST FAILED: C3f argument defaults expected add_class=0, add_rank=0, delete_class=1, update_class=0, update_rank=0, got %', v_txt;
  end if;
  -- C3g. the rank functions take exactly these arguments (the belt ones
  --      last), so the app's p_belt_* names find them (added in step A)
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', '; ' order by p.proname) into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('testing_add_rank', 'testing_update_rank');
  if v_txt is distinct from
       'testing_add_rank(p_class_id uuid, p_name text, p_early_cents integer, p_day_cents integer, p_private_cents integer, p_sparring_gear boolean, '
       || 'p_belt_pattern text, p_belt_color text, p_belt_color_2 text, p_belt_end_stripes integer, p_belt_end_stripe_color text); '
       || 'testing_update_rank(p_rank_id uuid, p_expected_version integer, p_name text, p_early_cents integer, p_day_cents integer, p_private_cents integer, p_sparring_gear boolean, '
       || 'p_belt_pattern text, p_belt_color text, p_belt_color_2 text, p_belt_end_stripes integer, p_belt_end_stripe_color text)' then
    raise exception 'TEST FAILED: C3g rank function arguments are %', v_txt;
  end if;
  -- C3h. the belt rule's helper is owned by the same role as the two rank
  --      functions, and that role can run it. Why: the table's belt rule
  --      calls the helper as whoever does the write - through the rank
  --      functions that is their owner (they run as their owner). Nobody
  --      else may run the helper, so a different owner would make every
  --      rank save fail. (A superuser passes privilege checks anyway, so the
  --      same-owner part is what really guards this.)
  select count(distinct p.proowner) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('testing_add_rank', 'testing_update_rank', 'testing_belt_is_valid');
  if v_n <> 1 then
    raise exception 'TEST FAILED: C3h the rank functions and testing_belt_is_valid have % different owners, expected 1', v_n;
  end if;
  select p.proowner::regrole::text into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'testing_add_rank';
  if not has_function_privilege(v_txt, 'public.testing_belt_is_valid(text, text, text, integer, text)', 'EXECUTE') then
    raise exception 'TEST FAILED: C3h % (owner of the rank functions) cannot run testing_belt_is_valid', v_txt;
  end if;

  -- C4. row level security is on for all four tables
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('locations', 'testing_classes', 'testing_ranks', 'change_log')
     and c.relrowsecurity;
  if v_n <> 4 then raise exception 'TEST FAILED: C4 RLS is on for only % of the 4 tables', v_n; end if;

  -- C5. EVERY security-definer function in public (0001, 0002, 0003)
  --     pins search_path = ''
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not coalesce('search_path=""' = any (p.proconfig), false);
  if v_txt is not null then raise exception 'TEST FAILED: C5c security definer function(s) without search_path = '''': %', v_txt; end if;

  -- C6. position rules: deferrable, checked immediately; the id+school
  --     keys NOT deferrable (they are link targets); every named rule
  --     and index exists
  select count(*) into v_n from pg_constraint
   where conname in ('testing_classes_location_position_key', 'testing_ranks_class_position_key')
     and contype = 'u' and condeferrable and not condeferred;
  if v_n <> 2 then raise exception 'TEST FAILED: C6a position rules must be deferrable initially immediate'; end if;
  select count(*) into v_n from pg_constraint
   where conname in ('testing_classes_id_location_key', 'testing_ranks_id_location_key')
     and contype = 'u' and not condeferrable;
  if v_n <> 2 then raise exception 'TEST FAILED: C6b the id+location keys must not be deferrable'; end if;
  select string_agg(x.name, ', ') into v_txt
    from unnest(array[
      'locations_pkey', 'locations_code_check', 'locations_name_key',
      'testing_classes_pkey', 'testing_classes_location_fk', 'testing_classes_name_check',
      'testing_classes_position_check', 'testing_classes_version_check', 'testing_classes_final_award_none_ck',
      'testing_classes_location_position_key', 'testing_classes_id_location_key', 'testing_classes_final_award_fk',
      'testing_ranks_pkey', 'testing_ranks_name_check', 'testing_ranks_position_check',
      'testing_ranks_early_cents_check', 'testing_ranks_day_cents_check', 'testing_ranks_private_cents_check',
      'testing_ranks_version_check', 'testing_ranks_class_fk', 'testing_ranks_class_position_key',
      'testing_ranks_id_location_key', 'testing_ranks_belt_check',
      'change_log_pkey', 'change_log_op_check']) as x(name)
   where not exists (select 1 from pg_constraint c
                       join pg_namespace n on n.oid = c.connamespace
                      where n.nspname = 'public' and c.conname = x.name);
  if v_txt is not null then raise exception 'TEST FAILED: C6c missing constraint(s): %', v_txt; end if;
  select string_agg(x.name, ', ') into v_txt
    from unnest(array[
      'testing_classes_location_lower_name_idx', 'testing_classes_final_award_idx',
      'testing_ranks_class_lower_name_idx', 'testing_ranks_location_idx',
      'change_log_table_record_idx', 'change_log_occurred_at_idx', 'change_log_batch_idx']) as x(name)
   where not exists (select 1 from pg_class c
                       join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relkind = 'i' and c.relname = x.name);
  if v_txt is not null then raise exception 'TEST FAILED: C6d missing index(es): %', v_txt; end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where c.relname in ('testing_classes_location_lower_name_idx') and i.indisunique)
     or not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                     where c.relname in ('testing_ranks_class_lower_name_idx') and i.indisunique) then
    raise exception 'TEST FAILED: C6e the name indexes must be unique';
  end if;

  -- C7. what happens on delete: final award -> set NULL (only
  --     final_award_rank_id); class -> its ranks are deleted too
  if not exists (
       select 1 from pg_constraint c
        where c.conname = 'testing_classes_final_award_fk' and c.contype = 'f'
          and c.conrelid = 'public.testing_classes'::regclass
          and c.confrelid = 'public.testing_ranks'::regclass
          and c.confdeltype = 'n'
          and c.confdelsetcols = array[(select a.attnum from pg_attribute a
                                         where a.attrelid = 'public.testing_classes'::regclass
                                           and a.attname = 'final_award_rank_id')]::int2[]) then
    raise exception 'TEST FAILED: C7a testing_classes_final_award_fk must be "on delete set null (final_award_rank_id)"';
  end if;
  if not exists (
       select 1 from pg_constraint c
        where c.conname = 'testing_ranks_class_fk' and c.contype = 'f'
          and c.conrelid = 'public.testing_ranks'::regclass
          and c.confrelid = 'public.testing_classes'::regclass
          and c.confdeltype = 'c') then
    raise exception 'TEST FAILED: C7b testing_ranks_class_fk must be "on delete cascade"';
  end if;
  if not exists (
       select 1 from pg_constraint c
        where c.conname = 'testing_classes_location_fk' and c.contype = 'f'
          and c.confrelid = 'public.locations'::regclass and c.confdeltype = 'a') then
    raise exception 'TEST FAILED: C7c testing_classes_location_fk must point at locations with no delete action';
  end if;

  -- C8. the eight triggers exist, run the right function, and are enabled
  select string_agg(x.trg, ', ') into v_txt
    from (values
      ('testing_classes_before_write', 'testing_classes', 'testing_classes_before_write'),
      ('testing_ranks_before_write',   'testing_ranks',   'testing_ranks_before_write'),
      ('testing_classes_log',          'testing_classes', 'change_log_write'),
      ('testing_ranks_log',            'testing_ranks',   'change_log_write'),
      ('change_log_append_only',       'change_log',      'change_log_refuse_change'),
      ('change_log_no_truncate',       'change_log',      'change_log_refuse_change'),
      ('testing_classes_no_truncate',  'testing_classes', 'testing_refuse_truncate'),
      ('testing_ranks_no_truncate',    'testing_ranks',   'testing_refuse_truncate')) as x(trg, tbl, fn)
   where not exists (
     select 1 from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public' and t.tgname = x.trg and c.relname = x.tbl
        and p.proname = x.fn and t.tgenabled = 'O' and not t.tgisinternal);
  if v_txt is not null then raise exception 'TEST FAILED: C8 missing / wrong / disabled trigger(s): %', v_txt; end if;

  -- C9. read rules: exactly one SELECT rule per data table, for
  --     authenticated, using has_data_access(); change_log has none;
  --     no rule allows writing
  select count(*) into v_n from pg_policies p
   where p.schemaname = 'public' and p.tablename in ('locations', 'testing_classes', 'testing_ranks')
     and p.cmd = 'SELECT' and p.roles = array['authenticated']::name[] and p.permissive = 'PERMISSIVE'
     and p.qual like '%has_data_access()%';
  if v_n <> 3 then raise exception 'TEST FAILED: C9a expected 3 has_data_access read rules, found %', v_n; end if;
  select count(*) into v_n from pg_policies p
   where p.schemaname = 'public' and p.tablename in ('locations', 'testing_classes', 'testing_ranks', 'change_log');
  if v_n <> 3 then raise exception 'TEST FAILED: C9b expected no other rules on the 4 tables, found % in total', v_n; end if;

  -- C10. the five belt columns: types, NOT NULL and defaults (a plain
  --      white belt; belt_color_2 the only one that may be NULL), and the
  --      belt rule is a real (validated) check (added in step A)
  select string_agg(c.column_name || ' ' || c.data_type || ' ' || c.is_nullable || ' ' || coalesce(c.column_default, '-'),
                    '; ' order by c.column_name) into v_txt
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'testing_ranks' and c.column_name like 'belt\_%';
  if v_txt is distinct from
       'belt_color text NO ''white''::text; belt_color_2 text YES -; belt_end_stripe_color text NO ''yellow''::text; '
       || 'belt_end_stripes integer NO 0; belt_pattern text NO ''solid''::text' then
    raise exception 'TEST FAILED: C10a belt columns are %', v_txt;
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conname = 'testing_ranks_belt_check' and c.contype = 'c' and c.convalidated
                    and c.conrelid = 'public.testing_ranks'::regclass
                    and pg_get_constraintdef(c.oid) like '%testing_belt_is_valid(belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color)%') then
    raise exception 'TEST FAILED: C10b testing_ranks_belt_check missing or not checking all five belt columns';
  end if;

  reset role;
end;
$$;

select 'ALL 0003 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
