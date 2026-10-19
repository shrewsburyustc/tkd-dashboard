-- =====================================================================
-- 0014_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0014_testing_private.sql (Color
--   Belt phase 4: private testing). It checks, in this order (contract
--   0014 §3.1):
--     V1  catalog: the two columns, their two rules, column rights (the
--         app only), the view unchanged, the three new functions, the two
--         helpers (nobody may call them), the nine replaced functions keep
--         their rights
--     V2  locked / signed-out / old / magic-link sessions get no_access
--         and see no registration; anon is refused; the family form's
--         login has no rights
--     V3  the day and time rules (staff and admin)
--     V4  stale / withdrawn / not_found; the same day and time writes
--         nothing
--     V5  Add student with "Tests privately" (one row, one history row)
--     V6  the price: private price; regular prices unchanged
--     V7  the top-up: just the difference, Undo, Edit payment
--     V8  a $0 private price: nothing is ever inserted
--     V9  back to the testing day after paying: nothing owed
--     V10 change how they'll pay while a top-up is owed
--     V11 setting private clears a testing-day No show (one batch)
--     V12 a private No show can get a new day; Back refused
--     V13 a graded private testing: Change / Back refused; a note alone
--         doesn't count
--     V14 Back after the testing day: admins only (review H1)
--     V15 grading counts from the student's own day
--     V16 Edit details re-prices a private student (Q2); the belt lock
--         counts from the private day
--     V17 keep one / restore locks from the private day (review H3)
--     V18 Edit event: a private student's result doesn't block the date
--     V19 the signature clean-up uses the later of the two days
--     V20 the history: action names, batch ids, who, version bumps
--     V21 the history never holds a signature picture
--   It makes its own test classes and events with unusual names ("zz test
--   1a2b3c4d ..."), so it works whatever is already in the database (run
--   it before AND after real events exist). All names are made up.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test classes, events, students,
--   payments, results, history rows, test sessions). NEVER change the
--   final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0005_tests.sql and 0010_tests.sql (read their headers):
--   "set local role authenticated" + a pretend login token per session:
--     A1 admin unlocked · A2 locked ("Lock now") · A3 5 wrong PINs ·
--     A4 signed out · A5 password sign-in 8 days ago · A6 magic link ·
--     D1 desk unlocked · D2 desk locked · D3 desk magic link · anon
--   The test events are made with testing_add_event and then MOVED (as
--   the SQL Editor's role, like 0010_tests.sql) to: E_before = in 2 days,
--   E_day = today, E_after = yesterday, E_old = 100 days ago. A private
--   day in the past is also set as the SQL Editor's role, never through
--   the functions (they refuse it).
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0010 and 0014 are applied. You need TWO existing, ACTIVE
--      staff rows: an admin (Main Admin) and the shared front desk (Staff,
--      role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test removes its
--      own test rows and checks that some removals are REFUSED. Everything
--      is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0014 TESTS PASSED".
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

  v_a1 uuid := gen_random_uuid();  v_a2 uuid := gen_random_uuid();  v_a3 uuid := gen_random_uuid();
  v_a4 uuid := gen_random_uuid();  v_a5 uuid := gen_random_uuid();  v_a6 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();  v_d2 uuid := gen_random_uuid();  v_d3 uuid := gen_random_uuid();

  v_now_s   bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_8d  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600));
  v_amr_otp jsonb := jsonb_build_array(jsonb_build_object('method', 'otp',      'timestamp', v_now_s - 60));

  v_c_a1 text; v_c_a2 text; v_c_a3 text; v_c_a4 text; v_c_a5 text; v_c_a6 text;
  v_c_d1 text; v_c_d2 text; v_c_d3 text;
  v_c_anon text := '{"role": "anon"}';

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_role  text;
  v_admin_name text;
  v_desk_name  text;
  v_start_mark bigint;

  v_r      jsonb;
  v_i      integer;
  v_n      integer;
  v_n2     integer;
  v_v      integer;
  v_v2     integer;
  v_txt    text;
  v_who    text;
  v_mark   bigint;
  v_batch  uuid;
  v_batch2 uuid;
  v_pay    uuid;
  v_list   text[];
  v_day    date;
  v_limit  date;
  v_new    uuid;

  -- test classes (Worcester): tb "B" (Blue $70/$80/private $95, Free
  -- $65/$75/private $0; final award None) and ta "A" (Yellow
  -- $65/$75/private $85, Lime $65/$75/private $80; final award tb's Blue)
  v_ta uuid; v_tb uuid;
  v_ta_yellow uuid; v_ta_lime uuid; v_tb_blue uuid; v_tb_free uuid;
  v_classes jsonb;

  -- events and their copies of the ranks
  v_ebefore uuid; v_eday uuid; v_eafter uuid; v_eold uuid;
  v_before_date date;
  v_b_yellow uuid; v_b_lime uuid; v_b_blue uuid; v_b_free uuid;
  v_d_yellow uuid; v_a_yellow uuid; v_o_yellow uuid;

  -- students on E_before
  v_s3d uuid; v_s3a uuid; v_s4 uuid; v_s4w uuid; v_t6p uuid; v_t6r uuid; v_t7 uuid; v_t8 uuid;
  v_t9a uuid; v_t9b uuid; v_t10a uuid; v_t10b uuid; v_t10c uuid; v_h14b uuid;
  v_c16 uuid; v_r16 uuid; v_g16 uuid;
  v_k17 uuid; v_u17 uuid; v_k17b uuid; v_u17b uuid; v_r17 uuid; v_u17c uuid; v_t20 uuid;
  -- students on E_day
  v_t6d uuid; v_p12 uuid; v_g13 uuid; v_n13 uuid; v_h14d uuid; v_q15a uuid; v_q15r uuid;
  -- students on E_after
  v_t6a uuid; v_n11 uuid; v_p11 uuid; v_np11 uuid; v_o11 uuid; v_h14 uuid;
  -- form registrations on E_old (V19)
  v_f1 uuid; v_f2 uuid;

  -- catalog
  v_fn      record;
  v_col     text;
  v_priv    text;
  v_owner   oid;
  v_new_fns      text[] := array['testing_set_private', 'testing_clear_private', 'testing_add_private_student'];
  v_helper_fns   text[] := array['testing_private_time_is_valid', 'testing_amount_due'];
  v_replaced_fns text[] := array['testing_mark_paid', 'testing_change_paying_by', 'testing_purge_old_signatures',
                                 'testing_set_result', 'testing_set_result_note', 'testing_update_student',
                                 'testing_resolve_duplicate', 'testing_restore_student', 'testing_update_event'];
  v_signature constant text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  select s.role, s.full_name into v_role, v_admin_name from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role, s.full_name into v_role, v_desk_name from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if not exists (select 1 from pg_attribute a where a.attrelid = 'public.testing_registrations'::regclass
                  and a.attname = 'private_date' and not a.attisdropped)
     or to_regprocedure('public.testing_set_private(uuid, integer, date, time)') is null then
    raise exception 'TEST SETUP: the private testing columns / functions are missing (is 0014 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  select coalesce(max(id), 0) into v_start_mark from public.change_log;

  begin
    insert into auth.sessions (id, user_id)
    select x, v_admin from unnest(array[v_a1, v_a2, v_a3, v_a5, v_a6]) as x
    union all
    select x, v_desk  from unnest(array[v_d1, v_d2, v_d3]) as x;
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),
    (v_a3, v_admin, now() + interval '30 minutes'),
    (v_a4, v_admin, now() + interval '30 minutes'),
    (v_a5, v_admin, now() + interval '30 minutes'),
    (v_a6, v_admin, now() + interval '30 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes'),
    (v_d2, v_desk,  now() - interval '1 minute'),
    (v_d3, v_desk,  now() + interval '30 minutes');
  insert into public.pin_attempts (session_id, staff_id, failed, locked_at) values (v_a3, v_admin, 5, now());

  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_a3 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a3, 'amr', v_amr_1m)::text;
  v_c_a4 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a4, 'amr', v_amr_1m)::text;
  v_c_a5 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a5, 'amr', v_amr_8d)::text;
  v_c_a6 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a6, 'amr', v_amr_otp)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;
  v_c_d2 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text;
  v_c_d3 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d3, 'amr', v_amr_otp)::text;

  set local role authenticated;
  v_list := array[v_c_a1, v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d1, v_c_d2, v_c_d3];
  for v_i in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_i], true);
    if public.has_data_access() is distinct from (v_i in (1, 7)) then
      raise exception 'TEST SETUP: session % of A1..A6,D1..D3 has data access %, expected %',
        v_i, public.has_data_access(), (v_i in (1, 7));
    end if;
  end loop;

  -- Test classes and four events, made by the admin through the app's
  -- functions (all dated in 5 days for now; moved below)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_tb := (public.testing_add_class('worcester', v_tag || ' B', null, true) ->> 'id')::uuid;
  v_tb_blue := (public.testing_add_rank(v_tb, 'Blue', 7000, 8000, 9500, true, 'solid', 'blue', null, 0, 'yellow') ->> 'id')::uuid;
  v_tb_free := (public.testing_add_rank(v_tb, 'Free', 6500, 7500, 0, true, 'solid', 'red', null, 0, 'yellow') ->> 'id')::uuid;
  v_ta := (public.testing_add_class('worcester', v_tag || ' A', v_tb_blue, false) ->> 'id')::uuid;
  v_ta_yellow := (public.testing_add_rank(v_ta, 'Yellow', 6500, 7500, 8500, false, 'solid', 'yellow', null, 0, 'yellow') ->> 'id')::uuid;
  v_ta_lime   := (public.testing_add_rank(v_ta, 'Lime', 6500, 7500, 8000, false, 'solid', 'green', null, 0, 'yellow') ->> 'id')::uuid;
  if v_tb_free is null or v_ta_lime is null then
    raise exception 'TEST SETUP: could not create the test classes and ranks';
  end if;
  v_classes := jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'),
                                 jsonb_build_object('class_id', v_tb, 'start_time', '18:00', 'end_time', '19:00'));
  v_ebefore := (public.testing_add_event('worcester', v_tag || ' before', v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  v_eday    := (public.testing_add_event('worcester', v_tag || ' day',    v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  v_eafter  := (public.testing_add_event('worcester', v_tag || ' after',  v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  v_eold    := (public.testing_add_event('worcester', v_tag || ' old',    v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  if v_ebefore is null or v_eday is null or v_eafter is null or v_eold is null then
    raise exception 'TEST SETUP: could not create the test events';
  end if;
  reset role;

  -- each event's copy of the ranks
  select k.id into v_b_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ebefore and k.rank_id = v_ta_yellow;
  select k.id into v_b_lime from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ebefore and k.rank_id = v_ta_lime;
  select k.id into v_b_blue from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ebefore and k.rank_id = v_tb_blue;
  select k.id into v_b_free from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ebefore and k.rank_id = v_tb_free;
  select k.id into v_d_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_eday and k.rank_id = v_ta_yellow;
  select k.id into v_a_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_eafter and k.rank_id = v_ta_yellow;
  select k.id into v_o_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_eold and k.rank_id = v_ta_yellow;
  if v_b_yellow is null or v_b_lime is null or v_b_blue is null or v_b_free is null
     or v_d_yellow is null or v_a_yellow is null or v_o_yellow is null then
    raise exception 'TEST SETUP: the events have no copy of the test ranks';
  end if;

  -- the students (added at the desk by the admin)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_s3d  := (public.testing_add_student(v_ebefore, 'Dora', 'Daytime', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_s3a  := (public.testing_add_student(v_ebefore, 'Abel', 'Daytime', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_s4   := (public.testing_add_student(v_ebefore, 'Sven', 'Stale', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_s4w  := (public.testing_add_student(v_ebefore, 'Willa', 'Gone', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_t6p  := (public.testing_add_student(v_ebefore, 'Pria', 'Price', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_t6r  := (public.testing_add_student(v_ebefore, 'Remy', 'Price', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_t7   := (public.testing_add_student(v_ebefore, 'Tia', 'Topup', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_t8   := (public.testing_add_student(v_ebefore, 'Zane', 'Zero', v_b_free, true, 'cash') ->> 'id')::uuid;
  v_t9a  := (public.testing_add_student(v_ebefore, 'Bo', 'Back', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_t9b  := (public.testing_add_student(v_ebefore, 'Bea', 'Back', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_t10a := (public.testing_add_student(v_ebefore, 'Cy', 'Change', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_t10b := (public.testing_add_student(v_ebefore, 'Cal', 'Change', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_t10c := (public.testing_add_student(v_ebefore, 'Cleo', 'Change', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_h14b := (public.testing_add_student(v_ebefore, 'Hugo', 'Before', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_c16  := (public.testing_add_student(v_ebefore, 'Rae', 'Reprice', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_r16  := (public.testing_add_student(v_ebefore, 'Rex', 'Regular', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_g16  := (public.testing_add_student(v_ebefore, 'Gia', 'Graded', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_k17  := (public.testing_add_student(v_ebefore, 'Kai', 'Keep', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_u17  := (public.testing_add_student(v_ebefore, 'Uri', 'Match', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_k17b := (public.testing_add_student(v_ebefore, 'Kim', 'Keep', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_u17b := (public.testing_add_student(v_ebefore, 'Ula', 'Match', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_r17  := (public.testing_add_student(v_ebefore, 'Ros', 'Restore', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_u17c := (public.testing_add_student(v_ebefore, 'Uma', 'Match', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_t20  := (public.testing_add_student(v_ebefore, 'Hal', 'History', v_b_yellow, true, 'cash') ->> 'id')::uuid;
  v_t6d  := (public.testing_add_student(v_eday, 'Dee', 'Price', v_d_yellow, true, 'cash') ->> 'id')::uuid;
  v_p12  := (public.testing_add_student(v_eday, 'Nell', 'Noshow', v_d_yellow, true, 'cash') ->> 'id')::uuid;
  v_g13  := (public.testing_add_student(v_eday, 'Gus', 'Graded', v_d_yellow, true, 'cash') ->> 'id')::uuid;
  v_n13  := (public.testing_add_student(v_eday, 'Nia', 'Noted', v_d_yellow, true, 'cash') ->> 'id')::uuid;
  v_h14d := (public.testing_add_student(v_eday, 'Hana', 'Day', v_d_yellow, true, 'cash') ->> 'id')::uuid;
  v_q15a := (public.testing_add_student(v_eday, 'Quinn', 'Ownday', v_d_yellow, true, 'cash') ->> 'id')::uuid;
  v_q15r := (public.testing_add_student(v_eday, 'Quil', 'Regular', v_d_yellow, true, 'cash') ->> 'id')::uuid;
  v_t6a  := (public.testing_add_student(v_eafter, 'Ari', 'Price', v_a_yellow, true, 'cash') ->> 'id')::uuid;
  v_n11  := (public.testing_add_student(v_eafter, 'Ned', 'Noshow', v_a_yellow, true, 'cash') ->> 'id')::uuid;
  v_p11  := (public.testing_add_student(v_eafter, 'Pat', 'Passed', v_a_yellow, true, 'cash') ->> 'id')::uuid;
  v_np11 := (public.testing_add_student(v_eafter, 'Nat', 'Notpassed', v_a_yellow, true, 'cash') ->> 'id')::uuid;
  v_o11  := (public.testing_add_student(v_eafter, 'Ona', 'Onlynote', v_a_yellow, true, 'cash') ->> 'id')::uuid;
  v_h14  := (public.testing_add_student(v_eafter, 'Hal', 'After', v_a_yellow, true, 'cash') ->> 'id')::uuid;
  reset role;
  if v_s3d is null or v_s3a is null or v_s4 is null or v_s4w is null or v_t6p is null or v_t6r is null or v_t7 is null
     or v_t8 is null or v_t9a is null or v_t9b is null or v_t10a is null or v_t10b is null or v_t10c is null
     or v_h14b is null or v_c16 is null or v_r16 is null or v_g16 is null or v_k17 is null or v_u17 is null
     or v_k17b is null or v_u17b is null or v_r17 is null or v_u17c is null or v_t20 is null
     or v_t6d is null or v_p12 is null or v_g13 is null or v_n13 is null or v_h14d is null or v_q15a is null or v_q15r is null
     or v_t6a is null or v_n11 is null or v_p11 is null or v_np11 is null or v_o11 is null or v_h14 is null then
    raise exception 'TEST SETUP: could not add the test students';
  end if;

  -- move the events: before = in 2 days, day = today, after = yesterday,
  -- old = 100 days ago
  v_before_date := v_today + 2;
  update public.testing_events set testing_date = v_before_date where id = v_ebefore;
  update public.testing_events set testing_date = v_today       where id = v_eday;
  update public.testing_events set testing_date = v_today - 1   where id = v_eafter;
  update public.testing_events set testing_date = v_today - 100 where id = v_eold;

  -- ===================================================================
  -- V1. Catalog
  -- ===================================================================
  select c.relowner into v_owner from pg_class c where c.oid = 'public.testing_events'::regclass;

  -- the two columns: date / time, nullable
  if not exists (select 1 from pg_attribute a where a.attrelid = 'public.testing_registrations'::regclass
                  and a.attname = 'private_date' and not a.attisdropped and not a.attnotnull
                  and format_type(a.atttypid, a.atttypmod) = 'date')
     or not exists (select 1 from pg_attribute a where a.attrelid = 'public.testing_registrations'::regclass
                     and a.attname = 'private_time' and not a.attisdropped and not a.attnotnull
                     and format_type(a.atttypid, a.atttypmod) = 'time without time zone') then
    raise exception 'TEST FAILED: V1 private_date must be a nullable date and private_time a nullable time';
  end if;
  -- the two rules
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.testing_registrations'::regclass
                    and c.conname = 'testing_registrations_private_pair_check' and c.contype = 'c' and c.convalidated
                    and pg_get_constraintdef(c.oid) like '%(private_date IS NULL) = (private_time IS NULL)%') then
    raise exception 'TEST FAILED: V1 testing_registrations_private_pair_check missing or wrong';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.testing_registrations'::regclass
                    and c.conname = 'testing_registrations_private_time_check' and c.contype = 'c' and c.convalidated
                    and pg_get_constraintdef(c.oid) like '%private_time IS NULL%'
                    and pg_get_constraintdef(c.oid) like '%testing_private_time_is_valid(private_time)%') then
    raise exception 'TEST FAILED: V1 testing_registrations_private_time_check missing or wrong';
  end if;
  -- column rights: SELECT for authenticated only; no write or reference
  -- right for any client role; nothing for PUBLIC
  foreach v_col in array array['private_date', 'private_time'] loop
    if has_column_privilege('authenticated', 'public.testing_registrations', v_col, 'SELECT') is not true then
      raise exception 'TEST FAILED: V1 authenticated must be able to read testing_registrations.%', v_col;
    end if;
    if has_column_privilege('anon', 'public.testing_registrations', v_col, 'SELECT')
       or has_column_privilege('service_role', 'public.testing_registrations', v_col, 'SELECT')
       or has_column_privilege('testing_registrar', 'public.testing_registrations', v_col, 'SELECT') then
      raise exception 'TEST FAILED: V1 testing_registrations.% readable by anon, service_role or testing_registrar', v_col;
    end if;
    foreach v_priv in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_column_privilege('authenticated', 'public.testing_registrations', v_col, v_priv)
         or has_column_privilege('anon', 'public.testing_registrations', v_col, v_priv)
         or has_column_privilege('service_role', 'public.testing_registrations', v_col, v_priv)
         or has_column_privilege('testing_registrar', 'public.testing_registrations', v_col, v_priv) then
        raise exception 'TEST FAILED: V1 a client role has % on testing_registrations.%', v_priv, v_col;
      end if;
    end loop;
    if exists (select 1 from pg_attribute a, aclexplode(a.attacl) as x
                where a.attrelid = 'public.testing_registrations'::regclass and a.attname = v_col
                  and (x.grantee = 0 or x.grantee::regrole::text not in ('authenticated'))) then
      raise exception 'TEST FAILED: V1 testing_registrations.% has a column right for a role other than authenticated', v_col;
    end if;
  end loop;
  -- the view is unchanged: no private_* column
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.testing_roster'::regclass
              and a.attname like 'private%' and not a.attisdropped) then
    raise exception 'TEST FAILED: V1 testing_roster must not have a private_* column (the view is unchanged)';
  end if;
  -- the functions: one version each, pinned search_path, no defaults,
  -- the owner of testing_events, who may run them, security definer
  v_n := 0;
  for v_fn in
    select p.oid, p.proname::text as name, p.prosecdef, p.proconfig, p.proowner, p.pronargdefaults
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_new_fns || v_helper_fns || v_replaced_fns)
  loop
    v_n := v_n + 1;
    if not coalesce('search_path=""' = any (v_fn.proconfig), false) then
      raise exception 'TEST FAILED: V1 % has no search_path = ''''', v_fn.oid::regprocedure;
    end if;
    if v_fn.pronargdefaults > 0 then
      raise exception 'TEST FAILED: V1 % has argument defaults', v_fn.oid::regprocedure;
    end if;
    if v_fn.proowner <> v_owner then
      raise exception 'TEST FAILED: V1 % is not owned by the owner of testing_events', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE')
       or has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
       or has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce((select p.proacl from pg_proc p where p.oid = v_fn.oid),
                                                    acldefault('f', v_fn.proowner))) as a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'TEST FAILED: V1 % is executable by anon, service_role, testing_registrar or PUBLIC', v_fn.oid::regprocedure;
    end if;
    -- authenticated: the 3 new + 8 replaced staff functions; never the 2
    -- helpers or the signature clean-up
    if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
       is distinct from (v_fn.name = any (v_new_fns || v_replaced_fns) and v_fn.name <> 'testing_purge_old_signatures') then
      raise exception 'TEST FAILED: V1 authenticated execute on % is wrong', v_fn.oid::regprocedure;
    end if;
    if v_fn.prosecdef is distinct from (v_fn.name = any (v_new_fns || v_replaced_fns) and v_fn.name <> 'testing_purge_old_signatures') then
      raise exception 'TEST FAILED: V1 % security definer is %, not as designed', v_fn.oid::regprocedure, v_fn.prosecdef;
    end if;
  end loop;
  if v_n <> cardinality(v_new_fns || v_helper_fns || v_replaced_fns) then
    raise exception 'TEST FAILED: V1 expected exactly % functions (one version each), found %',
      cardinality(v_new_fns || v_helper_fns || v_replaced_fns), v_n;
  end if;
  select string_agg(x.sig, ', ') into v_txt
    from unnest(array[
      'public.testing_private_time_is_valid(time)',
      'public.testing_amount_due(uuid)',
      'public.testing_set_private(uuid, integer, date, time)',
      'public.testing_clear_private(uuid, integer)',
      'public.testing_add_private_student(uuid, text, text, uuid, boolean, text, date, time)',
      'public.testing_mark_paid(uuid, integer)',
      'public.testing_change_paying_by(uuid, integer, text)',
      'public.testing_purge_old_signatures()',
      'public.testing_set_result(uuid, text)',
      'public.testing_set_result_note(uuid, text)',
      'public.testing_update_student(uuid, integer, text, text, uuid)',
      'public.testing_resolve_duplicate(uuid, integer, uuid, integer, boolean)',
      'public.testing_restore_student(uuid, integer)',
      'public.testing_update_event(uuid, integer, text, date, jsonb, date, text)']) as x(sig)
   where to_regprocedure(x.sig) is null;
  if v_txt is not null then raise exception 'TEST FAILED: V1 missing function signature(s): %', v_txt; end if;

  -- ===================================================================
  -- V2. Locked sessions, anon, the family form's login
  -- ===================================================================
  set local role authenticated;
  v_list := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d2, v_c_d3];
  for v_i in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_i], true);
    select count(r.id) into v_n from public.testing_registrations r;
    if v_n <> 0 then raise exception 'TEST FAILED: V2 session % of (A2,A3,A4,A5,A6,D2,D3) sees % registrations', v_i, v_n; end if;
    v_r := public.testing_set_private(v_s4, 1, v_today, time '16:00');
    if v_r ->> 'status' is distinct from 'no_access' then
      raise exception 'TEST FAILED: V2 session % of (A2,A3,A4,A5,A6,D2,D3) set_private got %', v_i, v_r;
    end if;
    v_r := public.testing_clear_private(v_s4, 1);
    if v_r ->> 'status' is distinct from 'no_access' then
      raise exception 'TEST FAILED: V2 session % of (A2,A3,A4,A5,A6,D2,D3) clear_private got %', v_i, v_r;
    end if;
    v_r := public.testing_add_private_student(v_ebefore, 'Lock', 'Out', v_b_yellow, true, 'cash', v_today, time '16:00');
    if v_r ->> 'status' is distinct from 'no_access' then
      raise exception 'TEST FAILED: V2 session % of (A2,A3,A4,A5,A6,D2,D3) add_private_student got %', v_i, v_r;
    end if;
  end loop;
  reset role;
  if exists (select 1 from public.testing_registrations r where r.id = v_s4 and (r.private_date is not null or r.version <> 1))
     or exists (select 1 from public.testing_registrations r where r.event_id = v_ebefore and r.first_name = 'Lock') then
    raise exception 'TEST FAILED: V2 the refused calls must change nothing';
  end if;
  -- anon: refused on the three functions and the two columns
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform public.testing_set_private(v_s4, 1, v_today, time '16:00');
        raise exception 'TEST FAILED: V2 anon could call testing_set_private'; exception when insufficient_privilege then null; end;
  begin perform public.testing_clear_private(v_s4, 1);
        raise exception 'TEST FAILED: V2 anon could call testing_clear_private'; exception when insufficient_privilege then null; end;
  begin perform public.testing_add_private_student(v_ebefore, 'An', 'On', v_b_yellow, true, 'cash', v_today, time '16:00');
        raise exception 'TEST FAILED: V2 anon could call testing_add_private_student'; exception when insufficient_privilege then null; end;
  begin perform r.private_date from public.testing_registrations r;
        raise exception 'TEST FAILED: V2 anon could read testing_registrations.private_date'; exception when insufficient_privilege then null; end;
  begin perform r.private_time from public.testing_registrations r;
        raise exception 'TEST FAILED: V2 anon could read testing_registrations.private_time'; exception when insufficient_privilege then null; end;
  reset role;
  -- an unlocked admin can't call the helpers nor write the columns directly
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin perform public.testing_amount_due(v_s4);
        raise exception 'TEST FAILED: V2 A1 could call testing_amount_due'; exception when insufficient_privilege then null; end;
  begin perform public.testing_private_time_is_valid(time '16:00');
        raise exception 'TEST FAILED: V2 A1 could call testing_private_time_is_valid'; exception when insufficient_privilege then null; end;
  begin update public.testing_registrations set private_date = v_today, private_time = time '16:00' where id = v_s4;
        raise exception 'TEST FAILED: V2 A1 could update the private columns directly'; exception when insufficient_privilege then null; end;
  reset role;
  -- the family form's login (catalog proofs, as 0005_tests T2)
  if has_column_privilege('testing_registrar', 'public.testing_registrations', 'private_date', 'SELECT')
     or has_column_privilege('testing_registrar', 'public.testing_registrations', 'private_time', 'SELECT')
     or has_function_privilege('testing_registrar', 'public.testing_set_private(uuid, integer, date, time)', 'EXECUTE')
     or has_function_privilege('testing_registrar', 'public.testing_clear_private(uuid, integer)', 'EXECUTE')
     or has_function_privilege('testing_registrar', 'public.testing_add_private_student(uuid, text, text, uuid, boolean, text, date, time)', 'EXECUTE')
     or has_function_privilege('testing_registrar', 'public.testing_amount_due(uuid)', 'EXECUTE')
     or has_function_privilege('testing_registrar', 'public.testing_private_time_is_valid(time)', 'EXECUTE') then
    raise exception 'TEST FAILED: V2 testing_registrar can reach the private columns or functions';
  end if;

  -- ===================================================================
  -- V3. Day / time input (D1 on s3d, A1 on s3a; E_before is in 2 days)
  -- ===================================================================
  v_limit := (v_before_date + interval '1 year')::date;
  set local role authenticated;
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_new := case when v_txt = v_c_d1 then v_s3d else v_s3a end;
    v_who := case when v_txt = v_c_d1 then 'D1' else 'A1' end;
    select r.version into v_v from public.testing_registrations r where r.id = v_new;
    -- nulls
    v_r := public.testing_set_private(null, v_v, v_today, time '16:00');
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V3 % null id expected invalid, got %', v_who, v_r; end if;
    v_r := public.testing_set_private(v_new, null, v_today, time '16:00');
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V3 % null version expected invalid, got %', v_who, v_r; end if;
    v_r := public.testing_set_private(v_new, v_v, null, time '16:00');
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V3 % null day expected invalid, got %', v_who, v_r; end if;
    v_r := public.testing_set_private(v_new, v_v, v_today, null);
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V3 % null time expected invalid, got %', v_who, v_r; end if;
    v_r := public.testing_clear_private(null, v_v);
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V3 % clear null id expected invalid, got %', v_who, v_r; end if;
    v_r := public.testing_clear_private(v_new, null);
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V3 % clear null version expected invalid, got %', v_who, v_r; end if;
    -- times off the list
    foreach v_col in array array['05:55', '22:05', '16:03', '16:00:30'] loop
      v_r := public.testing_set_private(v_new, v_v, v_today, v_col::time);
      if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V3 % time % expected invalid, got %', v_who, v_col, v_r; end if;
    end loop;
    -- yesterday -> past_day
    v_r := public.testing_set_private(v_new, v_v, v_today - 1, time '16:00');
    if v_r ->> 'status' is distinct from 'past_day' then raise exception 'TEST FAILED: V3 % yesterday expected past_day, got %', v_who, v_r; end if;
    -- after the testing day + 1 year -> invalid
    v_r := public.testing_set_private(v_new, v_v, v_limit + 1, time '16:00');
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V3 % testing day + 1 year + 1 day expected invalid, got %', v_who, v_r; end if;
    if exists (select 1 from public.testing_registrations r where r.id = v_new and (r.version <> v_v or r.private_date is not null)) then
      raise exception 'TEST FAILED: V3 % the refused calls must change nothing', v_who;
    end if;
    -- allowed: 06:00 today (before the testing day), 22:00 on the testing
    -- day itself (Q4), after it, and testing day + 1 year
    v_r := public.testing_set_private(v_new, v_v, v_today, time '06:00');
    if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1, 'private_date', to_char(v_today, 'YYYY-MM-DD'),
                                               'private_time', '06:00', 'amount_due_cents', 8500, 'result_cleared', false) then
      raise exception 'TEST FAILED: V3 % today 06:00 expected {ok, version %, %, 06:00, 8500, false}, got %', v_who, v_v + 1, v_today, v_r;
    end if;
    v_r := public.testing_set_private(v_new, v_v + 1, v_before_date, time '22:00');
    if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'private_time' is distinct from '22:00'
       or v_r ->> 'private_date' is distinct from to_char(v_before_date, 'YYYY-MM-DD') then
      raise exception 'TEST FAILED: V3 % the testing day 22:00 expected ok, got %', v_who, v_r;
    end if;
    v_r := public.testing_set_private(v_new, v_v + 2, v_before_date + 1, time '16:00');
    if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V3 % after the testing day expected ok, got %', v_who, v_r; end if;
    v_r := public.testing_set_private(v_new, v_v + 3, v_limit, time '16:00');
    if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> v_v + 4 then
      raise exception 'TEST FAILED: V3 % testing day + 1 year expected ok, got %', v_who, v_r;
    end if;
    -- a past day and a too-far day are still refused for a private student
    v_r := public.testing_set_private(v_new, v_v + 4, v_today - 1, time '16:00');
    if v_r ->> 'status' is distinct from 'past_day' then raise exception 'TEST FAILED: V3 % change to yesterday expected past_day, got %', v_who, v_r; end if;
    v_r := public.testing_set_private(v_new, v_v + 4, v_limit + 1, time '16:00');
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V3 % change to too far expected invalid, got %', v_who, v_r; end if;
  end loop;
  reset role;
  if (select count(*) from public.testing_registrations r
       where r.id in (v_s3d, v_s3a) and r.private_date = v_limit and r.private_time = time '16:00') <> 2 then
    raise exception 'TEST FAILED: V3 both students must end on testing day + 1 year at 16:00';
  end if;
  -- the table rules hold even for the SQL Editor's role
  begin
    update public.testing_registrations set private_date = v_today, private_time = null where id = v_s4;
    raise exception 'TEST FAILED: V3 a private day without a time was allowed';
  exception when check_violation then null;
  end;
  begin
    update public.testing_registrations set private_date = v_today, private_time = time '16:03' where id = v_s4;
    raise exception 'TEST FAILED: V3 a private time off the 5-minute list was allowed';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- V4. stale, withdrawn, not_found; the same day and time writes nothing
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_s4, 2, v_today + 1, time '16:00');
  if v_r ->> 'status' is distinct from 'stale' then raise exception 'TEST FAILED: V4 set_private old version expected stale, got %', v_r; end if;
  v_r := public.testing_set_private(v_s4, 1, v_today + 1, time '16:00');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V4 set_private expected ok, got %', v_r; end if;
  v_r := public.testing_clear_private(v_s4, 1);
  if v_r ->> 'status' is distinct from 'stale' then raise exception 'TEST FAILED: V4 clear_private old version expected stale, got %', v_r; end if;
  v_r := public.testing_set_private(v_s4, 1, v_today + 1, time '17:00');
  if v_r ->> 'status' is distinct from 'stale' then raise exception 'TEST FAILED: V4 change with an old version expected stale, got %', v_r; end if;
  v_r := public.testing_set_private(gen_random_uuid(), 1, v_today + 1, time '16:00');
  if v_r ->> 'status' is distinct from 'not_found' then raise exception 'TEST FAILED: V4 unknown id set expected not_found, got %', v_r; end if;
  v_r := public.testing_clear_private(gen_random_uuid(), 1);
  if v_r ->> 'status' is distinct from 'not_found' then raise exception 'TEST FAILED: V4 unknown id clear expected not_found, got %', v_r; end if;
  -- withdrawn (Withdraw is admin-only)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_withdraw_student(v_s4w, 1);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V4 setup withdraw expected ok, got %', v_r; end if;
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_r := public.testing_set_private(v_s4w, 2, v_today + 1, time '16:00');
    if v_r ->> 'status' is distinct from 'withdrawn' then raise exception 'TEST FAILED: V4 withdrawn set_private expected withdrawn, got %', v_r; end if;
    v_r := public.testing_clear_private(v_s4w, 2);
    if v_r ->> 'status' is distinct from 'withdrawn' then raise exception 'TEST FAILED: V4 withdrawn clear_private expected withdrawn, got %', v_r; end if;
  end loop;
  reset role;
  -- the same day and time again: ok, nothing written
  select count(*) into v_n from public.change_log l where l.record_id = v_s4;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_s4, 2, v_today + 1, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2, 'private_date', to_char(v_today + 1, 'YYYY-MM-DD'),
                                             'private_time', '16:00', 'amount_due_cents', 8500, 'result_cleared', false) then
    raise exception 'TEST FAILED: V4 the same day and time expected {ok, version 2 (unchanged), ..., result_cleared false}, got %', v_r;
  end if;
  -- clear_private on a student who isn't private: ok, nothing written
  v_r := public.testing_clear_private(v_t20, 1);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 1, 'amount_due_cents', 6500) then
    raise exception 'TEST FAILED: V4 clear_private on a regular student expected {ok, version 1, 6500}, got %', v_r;
  end if;
  reset role;
  select count(*) into v_n2 from public.change_log l where l.record_id = v_s4;
  if v_n2 <> v_n or not exists (select 1 from public.testing_registrations r where r.id = v_s4 and r.version = 2)
     or not exists (select 1 from public.testing_registrations r where r.id = v_t20 and r.version = 1) then
    raise exception 'TEST FAILED: V4 the same day and time must write nothing (history % -> %)', v_n, v_n2;
  end if;

  -- ===================================================================
  -- V5. Add student with "Tests privately"
  -- ===================================================================
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- refused: nothing inserted
  v_r := public.testing_add_private_student(v_ebefore, 'Ivy', 'Bad', v_b_yellow, true, 'cash', v_today + 1, time '16:03');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V5 bad time expected invalid, got %', v_r; end if;
  v_r := public.testing_add_private_student(v_ebefore, 'Ivy', 'Bad', v_b_yellow, true, 'cash', null, time '16:00');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V5 no day expected invalid, got %', v_r; end if;
  v_r := public.testing_add_private_student(v_ebefore, 'Ivy', 'Bad', v_b_yellow, true, 'cash', v_today + 1, null);
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V5 no time expected invalid, got %', v_r; end if;
  v_r := public.testing_add_private_student(v_ebefore, 'Ivy', 'Bad', v_b_yellow, true, 'cash', v_today - 1, time '16:00');
  if v_r ->> 'status' is distinct from 'past_day' then raise exception 'TEST FAILED: V5 yesterday expected past_day, got %', v_r; end if;
  v_r := public.testing_add_private_student(v_ebefore, 'Ivy', 'Bad', v_b_yellow, true, 'cash', v_limit + 1, time '16:00');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V5 too far expected invalid, got %', v_r; end if;
  v_r := public.testing_add_private_student(gen_random_uuid(), 'Ivy', 'Bad', v_b_yellow, true, 'cash', v_today + 1, time '16:00');
  if v_r ->> 'status' is distinct from 'not_found' then raise exception 'TEST FAILED: V5 unknown event expected not_found, got %', v_r; end if;
  v_r := public.testing_add_private_student(v_ebefore, 'Ivy', 'Bad', v_d_yellow, true, 'cash', v_today + 1, time '16:00');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V5 another event''s rank expected invalid, got %', v_r; end if;
  -- staff after the testing day -> finished (checked before the day)
  v_r := public.testing_add_private_student(v_eafter, 'Ivy', 'Late', v_a_yellow, true, 'cash', v_today, time '16:00');
  if v_r ->> 'status' is distinct from 'finished' then raise exception 'TEST FAILED: V5 D1 on E_after expected finished, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.testing_registrations r where r.first_name = 'Ivy' and r.event_id in (v_ebefore, v_eafter))
     or exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: V5 a refused add must insert nothing and log nothing';
  end if;
  -- ok: one row with both columns, version 1, one history row
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_add_private_student(v_ebefore, 'Ivy', 'Private', v_b_yellow, true, 'card', v_today + 1, time '15:30');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 1 or v_r ->> 'reference' is null
     or v_r ->> 'private_date' is distinct from to_char(v_today + 1, 'YYYY-MM-DD') or v_r ->> 'private_time' is distinct from '15:30'
     or (v_r ->> 'amount_due_cents')::int is distinct from 8500 then
    raise exception 'TEST FAILED: V5 D1 add_private_student expected {ok, version 1, the day, 15:30, 8500}, got %', v_r;
  end if;
  v_new := (v_r ->> 'id')::uuid;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_new and r.private_date = v_today + 1
                  and r.private_time = time '15:30' and r.version = 1 and r.source = 'staff' and r.paying_by = 'card'
                  and r.created_by_name = v_desk_name) then
    raise exception 'TEST FAILED: V5 the added student must have both columns, version 1, source staff, created by the desk';
  end if;
  select count(*), min(l.action), min(l.op) into v_n, v_txt, v_col from public.change_log l where l.record_id = v_new;
  if v_n <> 1 or v_txt <> 'add_student' or v_col <> 'insert' then
    raise exception 'TEST FAILED: V5 expected exactly one add_student insert history row, got % (% %)', v_n, v_txt, v_col;
  end if;
  if not exists (select 1 from public.change_log l where l.record_id = v_new and l.after ->> 'private_date' = (v_today + 1)::text
                  and l.after ->> 'private_time' = '15:30:00' and l.batch_id is not null and l.actor_name = v_desk_name) then
    raise exception 'TEST FAILED: V5 the history row must hold the private day and time, a batch id and the desk''s name';
  end if;
  -- an admin may add after the testing day
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_private_student(v_eafter, 'Ivo', 'Late', v_a_yellow, true, 'cash', v_today, time '16:00');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'amount_due_cents')::int is distinct from 8500 then
    raise exception 'TEST FAILED: V5 A1 on E_after expected ok with 8500 due, got %', v_r;
  end if;
  reset role;

  -- ===================================================================
  -- V6. The price
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- private, not paid: the private price, then already_paid
  v_r := public.testing_set_private(v_t6p, 1, v_today + 1, time '16:00');
  if (v_r ->> 'amount_due_cents')::int is distinct from 8500 then raise exception 'TEST FAILED: V6 set private expected 8500 due, got %', v_r; end if;
  v_r := public.testing_mark_paid(v_t6p, 2);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'amount_cents')::int <> 8500 or (v_r ->> 'version')::int <> 3 then
    raise exception 'TEST FAILED: V6 private mark_paid expected ok 8500 version 3, got %', v_r;
  end if;
  v_r := public.testing_mark_paid(v_t6p, 3);
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then raise exception 'TEST FAILED: V6 second mark_paid expected already_paid, got %', v_r; end if;
  -- regular: early before the testing day, testing-day price on and after it
  v_r := public.testing_mark_paid(v_t6r, 1);
  if (v_r ->> 'amount_cents')::int is distinct from 6500 then raise exception 'TEST FAILED: V6 regular before the day expected 6500, got %', v_r; end if;
  v_r := public.testing_mark_paid(v_t6d, 1);
  if (v_r ->> 'amount_cents')::int is distinct from 7500 then raise exception 'TEST FAILED: V6 regular on the day expected 7500, got %', v_r; end if;
  v_r := public.testing_mark_paid(v_t6a, 1);
  if (v_r ->> 'amount_cents')::int is distinct from 7500 then raise exception 'TEST FAILED: V6 regular after the day expected 7500, got %', v_r; end if;
  v_r := public.testing_mark_paid(v_t6r, 2);
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then raise exception 'TEST FAILED: V6 regular paid again expected already_paid, got %', v_r; end if;
  reset role;
  if (select count(*) from public.testing_payments p where p.registration_id = v_t6p) <> 1 then
    raise exception 'TEST FAILED: V6 the private student must have exactly one payment';
  end if;

  -- ===================================================================
  -- V7. The top-up (M3, M4, M12)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_mark_paid(v_t7, 1);
  if (v_r ->> 'amount_cents')::int is distinct from 6500 or v_r ->> 'method' is distinct from 'cash' then
    raise exception 'TEST FAILED: V7 regular mark_paid expected 6500 cash, got %', v_r;
  end if;
  v_r := public.testing_set_private(v_t7, 2, v_today + 1, time '16:00');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'amount_due_cents')::int is distinct from 2000 then
    raise exception 'TEST FAILED: V7 set private after paying $65 expected 2000 due, got %', v_r;
  end if;
  v_r := public.testing_mark_paid(v_t7, 3);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'amount_cents')::int <> 2000 or v_r ->> 'method' is distinct from 'cash' then
    raise exception 'TEST FAILED: V7 top-up mark_paid expected exactly 2000 cash, got %', v_r;
  end if;
  v_pay := (v_r ->> 'payment_id')::uuid;
  v_r := public.testing_mark_paid(v_t7, 4);
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then raise exception 'TEST FAILED: V7 after the top-up expected already_paid, got %', v_r; end if;
  -- the desk's own Undo of the $20 (within 10 seconds) -> owed again
  v_r := public.testing_undo_payment(v_pay);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V7 the desk''s own undo of the $20 expected ok, got %', v_r; end if;
  reset role;
  if public.testing_amount_due(v_t7) is distinct from 2000 then
    raise exception 'TEST FAILED: V7 after the undo 2000 must be due again, got %', public.testing_amount_due(v_t7);
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_t7;
  v_r := public.testing_mark_paid(v_t7, v_v);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'amount_cents')::int <> 2000 then
    raise exception 'TEST FAILED: V7 mark_paid after the undo expected 2000, got %', v_r;
  end if;
  v_pay := (v_r ->> 'payment_id')::uuid;
  v_r := public.testing_mark_paid(v_t7, v_v + 1);
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then raise exception 'TEST FAILED: V7 then expected already_paid, got %', v_r; end if;
  -- an admin edits the most recent payment ($20) to $10 -> $10 due
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_edit_payment(v_pay, 'cash', 1000, v_today);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V7 A1 edit payment expected ok, got %', v_r; end if;
  reset role;
  if public.testing_amount_due(v_t7) is distinct from 1000 then
    raise exception 'TEST FAILED: V7 after editing the $20 to $10, 1000 must be due, got %', public.testing_amount_due(v_t7);
  end if;
  if (select sum(p.amount_cents) from public.testing_payments p where p.registration_id = v_t7) <> 7500 then
    raise exception 'TEST FAILED: V7 the payments must add up to 7500';
  end if;

  -- ===================================================================
  -- V8. A $0 private price: nothing is inserted
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_t8, 1, v_today + 1, time '16:00');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'amount_due_cents')::int is distinct from 0 then
    raise exception 'TEST FAILED: V8 set private on a $0 private price expected 0 due, got %', v_r;
  end if;
  v_r := public.testing_mark_paid(v_t8, 2);
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then
    raise exception 'TEST FAILED: V8 mark_paid with nothing due expected already_paid, got %', v_r;
  end if;
  reset role;
  if exists (select 1 from public.testing_payments p where p.registration_id = v_t8)
     or not exists (select 1 from public.testing_registrations r where r.id = v_t8 and r.version = 2) then
    raise exception 'TEST FAILED: V8 no payment may be inserted and the version must stay';
  end if;

  -- ===================================================================
  -- V9. Back to the testing day after paying (M5, M6)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_t9a, 1, v_today + 1, time '16:00');
  v_r := public.testing_mark_paid(v_t9a, 2);
  if (v_r ->> 'amount_cents')::int is distinct from 8500 then raise exception 'TEST FAILED: V9 setup paid $85 expected, got %', v_r; end if;
  v_r := public.testing_clear_private(v_t9a, 3);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 4, 'amount_due_cents', 0) then
    raise exception 'TEST FAILED: V9 back after paying $85 expected {ok, version 4, 0 due}, got %', v_r;
  end if;
  v_r := public.testing_mark_paid(v_t9a, 4);
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then raise exception 'TEST FAILED: V9 mark_paid after back expected already_paid, got %', v_r; end if;
  -- paid $65, private (owes $20), then back -> nothing due (accepted, L2)
  v_r := public.testing_mark_paid(v_t9b, 1);
  v_r := public.testing_set_private(v_t9b, 2, v_today + 1, time '16:00');
  if (v_r ->> 'amount_due_cents')::int is distinct from 2000 then raise exception 'TEST FAILED: V9 setup owes 2000 expected, got %', v_r; end if;
  v_r := public.testing_clear_private(v_t9b, 3);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 4, 'amount_due_cents', 0) then
    raise exception 'TEST FAILED: V9 back while owing $20 expected {ok, version 4, 0 due}, got %', v_r;
  end if;
  reset role;
  if exists (select 1 from public.testing_registrations r where r.id in (v_t9a, v_t9b) and (r.private_date is not null or r.private_time is not null)) then
    raise exception 'TEST FAILED: V9 back must empty both columns';
  end if;

  -- ===================================================================
  -- V10. Change how they'll pay while a top-up is owed (Q3)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_mark_paid(v_t10a, 1);                                  -- $65 cash
  v_r := public.testing_set_private(v_t10a, 2, v_today + 1, time '16:00');     -- owes $20
  v_r := public.testing_change_paying_by(v_t10a, 3, 'card');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 4) then
    raise exception 'TEST FAILED: V10 change paying by while owing expected {ok, 4}, got %', v_r;
  end if;
  v_r := public.testing_mark_paid(v_t10a, 4);
  if (v_r ->> 'amount_cents')::int is distinct from 2000 or v_r ->> 'method' is distinct from 'card' then
    raise exception 'TEST FAILED: V10 the top-up must use the new method (2000 card), got %', v_r;
  end if;
  -- now fully paid -> already_paid
  v_r := public.testing_change_paying_by(v_t10a, 5, 'check');
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then
    raise exception 'TEST FAILED: V10 change paying by when fully paid expected already_paid, got %', v_r;
  end if;
  -- a private student paid in full in one go -> already_paid
  v_r := public.testing_set_private(v_t10b, 1, v_today + 1, time '16:00');
  v_r := public.testing_mark_paid(v_t10b, 2);
  v_r := public.testing_change_paying_by(v_t10b, 3, 'card');
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then
    raise exception 'TEST FAILED: V10 change paying by on a paid private student expected already_paid, got %', v_r;
  end if;
  -- a regular paid student -> already_paid (unchanged)
  v_r := public.testing_mark_paid(v_t10c, 1);
  v_r := public.testing_change_paying_by(v_t10c, 2, 'card');
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then
    raise exception 'TEST FAILED: V10 change paying by on a paid regular student expected already_paid, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_payments p where p.registration_id = v_t10a and p.amount_cents = 6500 and p.method = 'cash')
     or not exists (select 1 from public.testing_payments p where p.registration_id = v_t10a and p.amount_cents = 2000 and p.method = 'card') then
    raise exception 'TEST FAILED: V10 the $65 must stay cash and the $20 be card';
  end if;

  -- ===================================================================
  -- V11. Set private clears a testing-day No show (E_after)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_set_result(v_n11, 'no_show');
  v_r := public.testing_set_result_note(v_n11, 'Called in sick');
  v_r := public.testing_set_result(v_p11, 'pass');
  v_r := public.testing_set_result(v_np11, 'not_passed');
  v_r := public.testing_set_result_note(v_o11, 'Only a note');
  reset role;
  if (select count(*) from public.testing_results x where x.registration_id in (v_n11, v_p11, v_np11, v_o11)) <> 4 then
    raise exception 'TEST FAILED: V11 setup: four results expected';
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_n11, 1, v_today, time '10:00');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2, 'private_date', to_char(v_today, 'YYYY-MM-DD'),
                                             'private_time', '10:00', 'amount_due_cents', 8500, 'result_cleared', true) then
    raise exception 'TEST FAILED: V11 D1 set private on a testing-day No show expected {ok, 2, today, 10:00, 8500, true}, got %', v_r;
  end if;
  v_r := public.testing_set_private(v_p11, 1, v_today, time '10:00');
  if v_r is distinct from jsonb_build_object('status', 'has_result') then raise exception 'TEST FAILED: V11 Pass expected has_result, got %', v_r; end if;
  v_r := public.testing_set_private(v_np11, 1, v_today, time '10:00');
  if v_r is distinct from jsonb_build_object('status', 'has_result') then raise exception 'TEST FAILED: V11 Not passed expected has_result, got %', v_r; end if;
  v_r := public.testing_set_private(v_o11, 1, v_today, time '10:00');
  if v_r is distinct from jsonb_build_object('status', 'has_result') then raise exception 'TEST FAILED: V11 a note only expected has_result, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.testing_results x where x.registration_id = v_n11) then
    raise exception 'TEST FAILED: V11 the No show and its note must be removed';
  end if;
  if (select count(*) from public.testing_results x where x.registration_id in (v_p11, v_np11, v_o11)) <> 3
     or exists (select 1 from public.testing_registrations r where r.id in (v_p11, v_np11, v_o11) and (r.private_date is not null or r.version <> 1)) then
    raise exception 'TEST FAILED: V11 has_result must change nothing';
  end if;
  select l.batch_id into v_batch from public.change_log l
   where l.id > v_mark and l.table_name = 'testing_registrations' and l.record_id = v_n11
     and l.action = 'set_private' and l.op = 'update' and l.actor_name = v_desk_name;
  select l.batch_id into v_batch2 from public.change_log l
   where l.id > v_mark and l.table_name = 'testing_results' and l.record_id = v_n11
     and l.action = 'clear_result' and l.op = 'delete'
     and l.before ->> 'result' = 'no_show' and l.before ->> 'note' = 'Called in sick';
  if v_batch is null or v_batch2 is distinct from v_batch then
    raise exception 'TEST FAILED: V11 history must have set_private (registration) + clear_result (result) with the same batch id';
  end if;

  -- ===================================================================
  -- V12. A private No show (H2) - E_day, private day today
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_p12, 1, v_today, time '11:00');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V12 setup set private expected ok, got %', v_r; end if;
  v_r := public.testing_set_result(v_p12, 'no_show');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V12 setup private No show expected ok, got %', v_r; end if;
  v_r := public.testing_set_result_note(v_p12, 'Did not come');
  v_r := public.testing_clear_private(v_p12, 2);
  if v_r is distinct from jsonb_build_object('status', 'graded') then raise exception 'TEST FAILED: V12 back on a private No show expected graded, got %', v_r; end if;
  reset role;
  select count(*) into v_n from public.change_log l where l.record_id = v_p12;
  -- the same day and time: ok, nothing removed, nothing written
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_p12, 2, v_today, time '11:00');
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'result_cleared' <> 'false'::jsonb or (v_r ->> 'version')::int <> 2 then
    raise exception 'TEST FAILED: V12 the same day and time on a private No show expected ok, version 2, result_cleared false, got %', v_r;
  end if;
  reset role;
  select count(*) into v_n2 from public.change_log l where l.record_id = v_p12;
  if v_n2 <> v_n or not exists (select 1 from public.testing_results x where x.registration_id = v_p12 and x.result = 'no_show')
     or not exists (select 1 from public.testing_registrations r where r.id = v_p12 and r.version = 2) then
    raise exception 'TEST FAILED: V12 the same day and time must remove nothing and write nothing';
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  -- a new day: ok, the No show (and its note) removed, one batch
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_p12, 2, v_today + 1, time '11:00');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 3, 'private_date', to_char(v_today + 1, 'YYYY-MM-DD'),
                                             'private_time', '11:00', 'amount_due_cents', 8500, 'result_cleared', true) then
    raise exception 'TEST FAILED: V12 a new day on a private No show expected {ok, 3, tomorrow, 11:00, 8500, true}, got %', v_r;
  end if;
  reset role;
  if exists (select 1 from public.testing_results x where x.registration_id = v_p12) then
    raise exception 'TEST FAILED: V12 the private No show must be removed';
  end if;
  select l.batch_id into v_batch from public.change_log l
   where l.id > v_mark and l.table_name = 'testing_registrations' and l.record_id = v_p12 and l.action = 'change_private';
  select l.batch_id into v_batch2 from public.change_log l
   where l.id > v_mark and l.table_name = 'testing_results' and l.record_id = v_p12 and l.action = 'clear_result' and l.op = 'delete';
  if v_batch is null or v_batch2 is distinct from v_batch then
    raise exception 'TEST FAILED: V12 history must have change_private + clear_result with the same batch id';
  end if;

  -- ===================================================================
  -- V13. A graded private testing; a note alone doesn't count (Q5)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_g13, 1, v_today, time '12:00');
  v_r := public.testing_set_result(v_g13, 'pass');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V13 setup Pass on the private day expected ok, got %', v_r; end if;
  v_r := public.testing_set_private(v_g13, 2, v_today + 1, time '12:00');
  if v_r is distinct from jsonb_build_object('status', 'graded') then raise exception 'TEST FAILED: V13 change on a Pass expected graded, got %', v_r; end if;
  v_r := public.testing_clear_private(v_g13, 2);
  if v_r is distinct from jsonb_build_object('status', 'graded') then raise exception 'TEST FAILED: V13 back on a Pass expected graded, got %', v_r; end if;
  -- note only: Change ok (note kept), Back ok (note kept)
  v_r := public.testing_set_private(v_n13, 1, v_today, time '12:00');
  v_r := public.testing_set_result_note(v_n13, 'Bring a belt');
  v_r := public.testing_set_private(v_n13, 2, v_today + 1, time '12:00');
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'result_cleared' <> 'false'::jsonb then
    raise exception 'TEST FAILED: V13 change on a note-only private testing expected ok, result_cleared false, got %', v_r;
  end if;
  v_r := public.testing_clear_private(v_n13, 3);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V13 back on a note-only private testing expected ok, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_n13 and x.result is null and x.note = 'Bring a belt')
     or not exists (select 1 from public.testing_registrations r where r.id = v_n13 and r.private_date is null)
     or not exists (select 1 from public.testing_results x where x.registration_id = v_g13 and x.result = 'pass')
     or not exists (select 1 from public.testing_registrations r where r.id = v_g13 and r.private_date = v_today and r.version = 2) then
    raise exception 'TEST FAILED: V13 the note must stay; the graded student must be unchanged';
  end if;

  -- ===================================================================
  -- V14. Back after the testing day: admins only (H1)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- after the testing day staff may still set an ungraded student private (Q3)
  v_r := public.testing_set_private(v_h14, 1, v_today, time '13:00');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V14 D1 set private after the testing day expected ok, got %', v_r; end if;
  v_r := public.testing_clear_private(v_h14, 2);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: V14 D1 back after the testing day expected not_allowed, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_h14 and r.version = 2 and r.private_date = v_today) then
    raise exception 'TEST FAILED: V14 the refused back must change nothing';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_clear_private(v_h14, 2);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 3, 'amount_due_cents', 7500) then
    raise exception 'TEST FAILED: V14 A1 back after the testing day expected {ok, 3, 7500}, got %', v_r;
  end if;
  -- on the testing day and before it: staff may
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_h14d, 1, v_today + 1, time '13:00');
  v_r := public.testing_clear_private(v_h14d, 2);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V14 D1 back on the testing day expected ok, got %', v_r; end if;
  v_r := public.testing_set_private(v_h14b, 1, v_today + 1, time '13:00');
  v_r := public.testing_clear_private(v_h14b, 2);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V14 D1 back before the testing day expected ok, got %', v_r; end if;
  reset role;

  -- ===================================================================
  -- V15. Grading counts from the student's own day (E_day = today)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_q15a, 1, v_today + 1, time '14:00');
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_who := case when v_txt = v_c_d1 then 'D1' else 'A1' end;
    v_r := public.testing_set_result(v_q15a, 'pass');
    if v_r ->> 'status' is distinct from 'not_open' then raise exception 'TEST FAILED: V15 % before the private day set_result expected not_open, got %', v_who, v_r; end if;
    v_r := public.testing_set_result_note(v_q15a, 'Early');
    if v_r ->> 'status' is distinct from 'not_open' then raise exception 'TEST FAILED: V15 % before the private day set_result_note expected not_open, got %', v_who, v_r; end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_q15a, 2, v_today, time '14:00');
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_who := case when v_txt = v_c_d1 then 'D1' else 'A1' end;
    v_r := public.testing_set_result(v_q15a, case when v_txt = v_c_d1 then 'pass' else 'not_passed' end);
    if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V15 % on the private day set_result expected ok, got %', v_who, v_r; end if;
    v_r := public.testing_set_result_note(v_q15a, 'On the day');
    if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V15 % on the private day set_result_note expected ok, got %', v_who, v_r; end if;
  end loop;
  -- a regular student of the same event: unchanged (the testing day = today)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_q15r, 'pass');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V15 regular student on the testing day expected ok, got %', v_r; end if;
  reset role;
  -- the private day was yesterday (moved as the SQL Editor's role)
  update public.testing_registrations set private_date = v_today - 1 where id = v_q15a;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_q15a, 'pass');
  if v_r ->> 'status' is distinct from 'finished' then raise exception 'TEST FAILED: V15 D1 after the private day set_result expected finished, got %', v_r; end if;
  v_r := public.testing_set_result_note(v_q15a, 'Late');
  if v_r ->> 'status' is distinct from 'finished' then raise exception 'TEST FAILED: V15 D1 after the private day set_result_note expected finished, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_set_result(v_q15a, 'pass');
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'result' is distinct from 'pass' then
    raise exception 'TEST FAILED: V15 A1 after the private day set_result expected ok pass, got %', v_r;
  end if;
  v_r := public.testing_set_result_note(v_q15a, 'Typed in later');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V15 A1 after the private day set_result_note expected ok, got %', v_r; end if;
  reset role;

  -- ===================================================================
  -- V16. Edit details re-prices a private student (Q2); the belt lock
  -- counts from the private day (E_before)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_c16, 1, v_today + 1, time '16:00');
  v_r := public.testing_mark_paid(v_c16, 2);
  if (v_r ->> 'amount_cents')::int is distinct from 8500 then raise exception 'TEST FAILED: V16 setup paid $85 expected, got %', v_r; end if;
  -- to a pricier private price ($95): $10 due
  v_r := public.testing_update_student(v_c16, 3, 'Rae', 'Reprice', v_b_blue);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 4, 'amount_due_cents', 1000) then
    raise exception 'TEST FAILED: V16 belt to a $95 private price expected {ok, 4, amount_due_cents 1000}, got %', v_r;
  end if;
  v_r := public.testing_mark_paid(v_c16, 4);
  if (v_r ->> 'amount_cents')::int is distinct from 1000 then raise exception 'TEST FAILED: V16 the re-price top-up expected 1000, got %', v_r; end if;
  -- to a cheaper one ($80): nothing due, no refund
  v_r := public.testing_update_student(v_c16, 5, 'Rae', 'Reprice', v_b_lime);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 6, 'amount_due_cents', 0) then
    raise exception 'TEST FAILED: V16 belt to an $80 private price expected {ok, 6, amount_due_cents 0}, got %', v_r;
  end if;
  v_r := public.testing_mark_paid(v_c16, 6);
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then raise exception 'TEST FAILED: V16 nothing due expected already_paid, got %', v_r; end if;
  -- a regular paid student's belt change: exactly the old answer
  v_r := public.testing_mark_paid(v_r16, 1);
  v_r := public.testing_update_student(v_r16, 2, 'Rex', 'Regular', v_b_blue);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 3) then
    raise exception 'TEST FAILED: V16 regular belt change expected exactly {ok, 3}, got %', v_r;
  end if;
  reset role;
  if (select count(*) from public.testing_payments p where p.registration_id = v_c16) <> 2
     or (select count(*) from public.testing_payments p where p.registration_id = v_r16) <> 1 then
    raise exception 'TEST FAILED: V16 payments: two for the re-priced student, one for the regular one';
  end if;
  -- a graded private student after the PRIVATE day, before the testing day
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_g16, 1, v_today, time '16:00');
  v_r := public.testing_set_result(v_g16, 'pass');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V16 setup Pass on the private day expected ok, got %', v_r; end if;
  reset role;
  update public.testing_registrations set private_date = v_today - 1 where id = v_g16;
  select r.version into v_v from public.testing_registrations r where r.id = v_g16;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_update_student(v_g16, v_v, 'Gia', 'Graded', v_b_lime);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: V16 D1 belt change of a graded private student after the private day expected not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_student(v_g16, v_v, 'Gia', 'Graded', v_b_lime);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1, 'result_cleared', true, 'amount_due_cents', 8000) then
    raise exception 'TEST FAILED: V16 A1 belt change expected {ok, %, result_cleared true, amount_due_cents 8000}, got %', v_v + 1, v_r;
  end if;
  reset role;

  -- ===================================================================
  -- V17. Keep one / Restore lock from the private day (H3, E_before)
  -- ===================================================================
  -- keep one: a graded private student whose private day was yesterday
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_k17, 1, v_today, time '16:00');
  v_r := public.testing_set_result(v_k17, 'pass');
  reset role;
  update public.testing_registrations set private_date = v_today - 1 where id = v_k17;
  select r.version into v_v from public.testing_registrations r where r.id = v_k17;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_update_student(v_k17, v_v, 'Uri', 'Match', v_b_yellow);   -- renamed into a possible duplicate
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V17 rename expected ok, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_k17 and r.duplicate_state = 'possible' and r.duplicate_of = v_u17) then
    raise exception 'TEST FAILED: V17 setup: the renamed student must be a possible duplicate';
  end if;
  select r.version into v_v from public.testing_registrations r where r.id = v_u17;
  select r.version into v_v2 from public.testing_registrations r where r.id = v_k17;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_resolve_duplicate(v_u17, v_v, v_k17, v_v2, false);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: V17 D1 keep-one withdrawing a private student after her private day expected not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_resolve_duplicate(v_u17, v_v, v_k17, v_v2, false);
  if v_r is distinct from jsonb_build_object('status', 'ok') then
    raise exception 'TEST FAILED: V17 A1 keep-one expected ok, got %', v_r;
  end if;
  -- control: private day tomorrow -> staff keep-one ok
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_k17b, 1, v_today + 1, time '16:00');
  v_r := public.testing_update_student(v_k17b, 2, 'Ula', 'Match', v_b_yellow);
  select r.version into v_v from public.testing_registrations r where r.id = v_u17b;
  select r.version into v_v2 from public.testing_registrations r where r.id = v_k17b;
  v_r := public.testing_resolve_duplicate(v_u17b, v_v, v_k17b, v_v2, false);
  if v_r is distinct from jsonb_build_object('status', 'ok') then
    raise exception 'TEST FAILED: V17 D1 keep-one of a private student before her private day expected ok, got %', v_r;
  end if;
  -- restore: the desk's keep-one of a private student (private day
  -- tomorrow), then she gets a result and her private day moves to
  -- yesterday; the desk's 10-second Undo is refused, an admin's allowed
  v_r := public.testing_set_private(v_r17, 1, v_today + 1, time '16:00');
  v_r := public.testing_update_student(v_r17, 2, 'Uma', 'Match', v_b_yellow);
  select r.version into v_v from public.testing_registrations r where r.id = v_u17c;
  select r.version into v_v2 from public.testing_registrations r where r.id = v_r17;
  v_r := public.testing_resolve_duplicate(v_u17c, v_v, v_r17, v_v2, false);
  if v_r is distinct from jsonb_build_object('status', 'ok') then
    raise exception 'TEST FAILED: V17 setup D1 keep-one withdrawing r17 expected ok, got %', v_r;
  end if;
  reset role;
  insert into public.testing_results (registration_id, result) values (v_r17, 'pass');
  update public.testing_registrations set private_date = v_today - 1 where id = v_r17;
  select r.version into v_v from public.testing_registrations r where r.id = v_r17;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_restore_student(v_r17, v_v);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: V17 D1 restore of a graded private student after her private day expected not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_restore_student(v_r17, v_v);
  if v_r ->> 'status' is distinct from 'ok' then
    raise exception 'TEST FAILED: V17 A1 restore expected ok, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_k17 and r.status = 'withdrawn' and r.withdrawn_by = v_admin)
     or not exists (select 1 from public.testing_registrations r where r.id = v_k17b and r.status = 'withdrawn' and r.withdrawn_by = v_desk)
     or not exists (select 1 from public.testing_registrations r where r.id = v_r17 and r.status = 'active') then
    raise exception 'TEST FAILED: V17 the keep-one / restore results are wrong';
  end if;

  -- ===================================================================
  -- V18. Edit event: only a private student's result -> the date may move
  -- (M3, E_before)
  -- ===================================================================
  if exists (select 1 from public.testing_results x join public.testing_registrations r on r.id = x.registration_id
              where r.event_id = v_ebefore and (r.private_date is null or x.result is null)) then
    raise exception 'TEST SETUP: V18 E_before must have only private students'' results here';
  end if;
  if not exists (select 1 from public.testing_results x join public.testing_registrations r on r.id = x.registration_id
                  where r.event_id = v_ebefore and r.private_date is not null and x.result is not null) then
    raise exception 'TEST SETUP: V18 E_before must have a private student''s result here';
  end if;
  select e.version into v_v from public.testing_events e where e.id = v_ebefore;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_event(v_ebefore, v_v, v_tag || ' before', v_before_date + 1, v_classes, null, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: V18 a date change with only private results expected {ok, %}, got %', v_v + 1, v_r;
  end if;
  reset role;
  -- ...but a private student's NOTE-only row still counts (that student can
  -- still go back to the testing day): written as the SQL Editor's role
  -- for c16 (private, no result), then removed again
  insert into public.testing_results (registration_id, result, note) values (v_c16, null, 'Note only');
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_event(v_ebefore, v_v + 1, v_tag || ' before', v_before_date, v_classes, null, null);
  if v_r is distinct from jsonb_build_object('status', 'has_results') then
    raise exception 'TEST FAILED: V18 a date change with a private student''s note-only row expected has_results, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_events e where e.id = v_ebefore and e.version = v_v + 1 and e.testing_date = v_before_date + 1) then
    raise exception 'TEST FAILED: V18 has_results must change nothing';
  end if;
  delete from public.testing_results x where x.registration_id = v_c16;
  -- a regular student's result (written as the SQL Editor's role: grading
  -- is not open before the testing day) -> has_results
  insert into public.testing_results (registration_id, result) values (v_r16, 'pass');
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_event(v_ebefore, v_v + 1, v_tag || ' before', v_before_date, v_classes, null, null);
  if v_r is distinct from jsonb_build_object('status', 'has_results') then
    raise exception 'TEST FAILED: V18 a date change after a regular result expected has_results, got %', v_r;
  end if;
  reset role;

  -- ===================================================================
  -- V19. The signature clean-up uses the later of the two days (E_old =
  -- 100 days ago)
  -- ===================================================================
  insert into public.testing_registrations
    (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
     submission_id, signature, signed_at, ack_version, private_date, private_time)
  values (v_eold, v_o_yellow, 'Faye', 'Form', 'cash', true, 'form',
          gen_random_uuid(), v_signature, now() - interval '110 days', 'cb-test', v_today - 10, time '10:00')
  returning id into v_f1;
  insert into public.testing_registrations
    (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
     submission_id, signature, signed_at, ack_version)
  values (v_eold, v_o_yellow, 'Finn', 'Form', 'cash', true, 'form',
          gen_random_uuid(), v_signature, now() - interval '110 days', 'cb-test')
  returning id into v_f2;
  perform public.testing_purge_old_signatures();
  if not exists (select 1 from public.testing_registrations r where r.id = v_f1 and r.signature is not null and r.signature_deleted_at is null) then
    raise exception 'TEST FAILED: V19 a private day 10 days ago must keep the signature';
  end if;
  if not exists (select 1 from public.testing_registrations r where r.id = v_f2 and r.signature is null and r.signature_deleted_at is not null) then
    raise exception 'TEST FAILED: V19 no private day, event 100 days ago: the signature must be removed';
  end if;

  -- ===================================================================
  -- V20. The history: action names, batch ids, who, version bumps
  -- ===================================================================
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_private(v_t20, 1, v_today + 1, time '09:00');
  if (v_r ->> 'version')::int is distinct from 2 then raise exception 'TEST FAILED: V20 set must bump the version by 1, got %', v_r; end if;
  v_r := public.testing_set_private(v_t20, 2, v_today + 1, time '09:30');
  if (v_r ->> 'version')::int is distinct from 3 then raise exception 'TEST FAILED: V20 change must bump the version by 1, got %', v_r; end if;
  v_r := public.testing_clear_private(v_t20, 3);
  if (v_r ->> 'version')::int is distinct from 4 then raise exception 'TEST FAILED: V20 clear must bump the version by 1, got %', v_r; end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: V20 tkd.action / tkd.batch_id must be cleared after the call';
  end if;
  reset role;
  select string_agg(l.action || '/' || l.op || '/' || l.actor_name, ', ' order by l.id) into v_txt
    from public.change_log l where l.id > v_mark and l.record_id = v_t20;
  if v_txt is distinct from format('set_private/update/%s, change_private/update/%s, clear_private/update/%s',
                                   v_desk_name, v_desk_name, v_desk_name) then
    raise exception 'TEST FAILED: V20 history rows for set / change / clear: %', v_txt;
  end if;
  if (select count(distinct l.batch_id) from public.change_log l where l.id > v_mark and l.record_id = v_t20 and l.batch_id is not null) <> 3
     or exists (select 1 from public.change_log l where l.id > v_mark and l.record_id = v_t20
                 and (l.session_id is distinct from v_d1 or l.actor_id is distinct from v_desk)) then
    raise exception 'TEST FAILED: V20 each of the three writes needs its own batch id, the desk''s session and login';
  end if;
  if not exists (select 1 from public.change_log l where l.id > v_mark and l.record_id = v_t20 and l.action = 'set_private'
                  and l.before ->> 'private_date' is null and l.after ->> 'private_date' = (v_today + 1)::text
                  and l.after ->> 'private_time' = '09:00:00' and (l.after ->> 'version')::int = 2) then
    raise exception 'TEST FAILED: V20 the set_private row must hold the new day, time and version';
  end if;
  if not exists (select 1 from public.change_log l where l.id > v_mark and l.record_id = v_t20 and l.action = 'clear_private'
                  and l.before ->> 'private_date' = (v_today + 1)::text and l.after -> 'private_date' = 'null'::jsonb) then
    raise exception 'TEST FAILED: V20 the clear_private row must show the day emptied';
  end if;
  -- every action of this phase was logged with a batch id and the actor's name
  select string_agg(x.act, ', ') into v_txt
    from unnest(array['set_private', 'change_private', 'clear_private', 'add_student', 'clear_result', 'mark_paid']) as x(act)
   where not exists (select 1 from public.change_log l
                      where l.id > v_start_mark and l.action = x.act and l.batch_id is not null
                        and l.actor_name in (v_desk_name, v_admin_name));
  if v_txt is not null then raise exception 'TEST FAILED: V20 no logged row (with batch id and name) for: %', v_txt; end if;
  if not exists (select 1 from public.change_log l where l.id > v_start_mark and l.action = 'mark_paid'
                  and l.table_name = 'testing_payments' and l.record_id is not null
                  and l.after ->> 'registration_id' = v_t7::text and (l.after ->> 'amount_cents')::int = 2000
                  and l.actor_name = v_desk_name) then
    raise exception 'TEST FAILED: V20 the $20 top-up must be logged as mark_paid by the desk';
  end if;

  -- ===================================================================
  -- V21. The history never holds a signature picture
  -- ===================================================================
  select count(*) into v_n from public.change_log l
   where coalesce(l.before::text, '') || coalesce(l.after::text, '') like '%data:image%';
  if v_n <> 0 then raise exception 'TEST FAILED: V21 % history row(s) contain data:image', v_n; end if;

  reset role;
end;
$$;

select 'ALL 0014 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
