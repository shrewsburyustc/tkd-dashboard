-- =====================================================================
-- 0010_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0010_testing_results.sql (Color
--   Belt phase 3: grading results). It checks, in this order (contract
--   0010 §2.1):
--     R1  catalog: the table, RLS, the one read rule, column rights (never
--         updated_by), the functions' rights / owner / search_path, the
--         five replaced functions keep 0005's rights, triggers and rules
--     R2  locked / signed-out / old / magic-link sessions see no result
--         and get no_access; anon is refused; the family form's login has
--         no rights
--     R3  the date rule: before / on / after the testing day, staff and
--         admin, both functions
--     R4  the result values, saving the same again, clearing
--     R5  the note: 200 / 201 characters, blank, line breaks, invisible
--         characters, "é" counts as 1
--     R6  the last change wins; results never change a registration's or
--         an event's version
--     R7  the history (change_log) and the "who / when" stamps
--     R8  table rules hold even for the SQL Editor's own role
--     R9  Edit details: a belt change clears the result; after the day
--         only an admin may change a graded student's belt
--     R10 possible duplicate "keep one" can't remove a graded student
--         after the day (staff)
--     R11 the staff Undo (restore) after "keep one": the same rule
--     R12 Withdraw keeps the result; a withdrawn student can't be graded
--     R13 admins may add a student after the testing day; staff can't
--     R14 Edit event: the date can't change once the event has results
--     R15 removing a student / an event removes their results (logged)
--     R16 the history never holds a signature picture
--   It makes its own test classes and events with unusual names ("zz test
--   1a2b3c4d ..."), so it works whatever is already in the database (run
--   it before AND after real events exist).
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test classes, events, students,
--   results, history rows, test sessions). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0005_tests.sql (read its header): "set local role
--   authenticated" + a pretend login token per session:
--     A1 admin unlocked · A2 locked ("Lock now") · A3 5 wrong PINs ·
--     A4 signed out · A5 password sign-in 8 days ago · A6 magic link ·
--     D1 desk unlocked · D2 desk locked · D3 desk magic link · anon
--   The test events are made with testing_add_event and then MOVED to
--   tomorrow / today / yesterday as the SQL Editor's role (as 0005_tests
--   T6g does), because an event can't be created in the past.
--
-- BEFORE YOU RUN IT
--   1. 0001-0005 and 0010 are applied. You need TWO existing, ACTIVE staff
--      rows: an admin (Main Admin) and the shared front desk (Staff, role
--      staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test removes its
--      own test rows and checks that some removals are REFUSED. Everything
--      is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0010 TESTS PASSED".
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

  v_r      jsonb;
  v_i      integer;
  v_n      integer;
  v_n2     integer;
  v_v      integer;
  v_v2     integer;
  v_ev_v   integer;
  v_txt    text;
  v_mark   bigint;
  v_batch  uuid;
  v_list   text[];
  v_constraint text;
  v_row    public.testing_results;

  -- test classes (Worcester): ta "A" (Yellow, Orange, Green -> final
  -- award tb's Blue) and tb "B" (Blue, Red -> final award None)
  v_ta uuid; v_tb uuid;
  v_ta_yellow uuid; v_ta_orange uuid; v_ta_green uuid; v_tb_blue uuid; v_tb_red uuid;
  v_classes jsonb;

  -- events: before (tomorrow), day (today), after (yesterday), upd (today,
  -- for Edit event), del (today, for Delete event)
  v_ebefore uuid; v_eday uuid; v_eafter uuid; v_eupd uuid; v_edel uuid;
  v_before_yellow uuid;
  v_day_yellow uuid; v_day_orange uuid;
  v_after_yellow uuid; v_after_orange uuid;
  v_upd_yellow uuid; v_del_yellow uuid;

  -- students (s = on the testing day, a = after it, b = before it)
  v_sb1 uuid;
  v_s0 uuid; v_sd1 uuid; v_sv uuid; v_sn uuid; v_sl uuid; v_sh uuid; v_sh2 uuid;
  v_s9a uuid; v_s9b uuid; v_sdw uuid; v_s12 uuid; v_sdel uuid;
  v_g4 uuid; v_u4 uuid; v_p5 uuid; v_q5 uuid;
  v_sa1 uuid; v_sa2 uuid; v_sa3 uuid;
  v_g1 uuid; v_u1 uuid; v_g2 uuid; v_u2 uuid; v_g3 uuid; v_u3 uuid;
  v_walk uuid;
  v_su1 uuid; v_sx1 uuid; v_sx2 uuid;

  -- catalog
  v_fn      record;
  v_col     text;
  v_priv    text;
  v_owner   oid;
  v_new_fns      text[] := array['testing_set_result', 'testing_set_result_note'];
  v_trigger_fns  text[] := array['testing_results_before_write', 'testing_results_log'];
  v_replaced_fns text[] := array['testing_update_student', 'testing_resolve_duplicate', 'testing_restore_student',
                                 'testing_add_student', 'testing_update_event'];
  v_cols_read    text[] := array['registration_id', 'result', 'note', 'updated_at', 'updated_by_name'];
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
  if to_regclass('public.testing_results') is null then
    raise exception 'TEST SETUP: public.testing_results is missing (is 0010 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);

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

  -- Test classes and five events, made by the admin through the app's
  -- functions (all dated in 5 days for now; moved below)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_tb := (public.testing_add_class('worcester', v_tag || ' B', null, true) ->> 'id')::uuid;
  v_tb_blue := (public.testing_add_rank(v_tb, 'Blue', 7000, 8000, 9500, true, 'solid', 'blue', null, 0, 'yellow') ->> 'id')::uuid;
  v_tb_red  := (public.testing_add_rank(v_tb, 'Red', 7000, 8000, 9500, true, 'solid', 'red', null, 0, 'yellow') ->> 'id')::uuid;
  v_ta := (public.testing_add_class('worcester', v_tag || ' A', v_tb_blue, false) ->> 'id')::uuid;
  v_ta_yellow := (public.testing_add_rank(v_ta, 'Yellow', 6500, 7500, 8500, false, 'solid', 'yellow', null, 0, 'yellow') ->> 'id')::uuid;
  v_ta_orange := (public.testing_add_rank(v_ta, 'Orange', 6500, 7500, 8500, false, 'solid', 'orange', null, 0, 'yellow') ->> 'id')::uuid;
  v_ta_green  := (public.testing_add_rank(v_ta, 'Green', 6500, 7500, 8500, false, 'stripe', 'green', 'black', 1, 'yellow') ->> 'id')::uuid;
  if v_tb_red is null or v_ta_green is null then
    raise exception 'TEST SETUP: could not create the test classes and ranks';
  end if;
  v_classes := jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'),
                                 jsonb_build_object('class_id', v_tb, 'start_time', '18:00', 'end_time', '19:00'));
  v_ebefore := (public.testing_add_event('worcester', v_tag || ' before', v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  v_eday    := (public.testing_add_event('worcester', v_tag || ' day',    v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  v_eafter  := (public.testing_add_event('worcester', v_tag || ' after',  v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  v_eupd    := (public.testing_add_event('worcester', v_tag || ' upd',    v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  v_edel    := (public.testing_add_event('worcester', v_tag || ' del',    v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  if v_ebefore is null or v_eday is null or v_eafter is null or v_eupd is null or v_edel is null then
    raise exception 'TEST SETUP: could not create the test events';
  end if;
  reset role;

  -- each event's copy of Yellow / Orange
  select k.id into v_before_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ebefore and k.rank_id = v_ta_yellow;
  select k.id into v_day_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_eday and k.rank_id = v_ta_yellow;
  select k.id into v_day_orange from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_eday and k.rank_id = v_ta_orange;
  select k.id into v_after_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_eafter and k.rank_id = v_ta_yellow;
  select k.id into v_after_orange from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_eafter and k.rank_id = v_ta_orange;
  select k.id into v_upd_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_eupd and k.rank_id = v_ta_yellow;
  select k.id into v_del_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_edel and k.rank_id = v_ta_yellow;

  -- the students (added at the desk by the admin, all Yellow)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_sb1  := (public.testing_add_student(v_ebefore, 'Bea', 'Before', v_before_yellow, true, 'cash') ->> 'id')::uuid;
  v_s0   := (public.testing_add_student(v_eday, 'Zed', 'Zero', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_sd1  := (public.testing_add_student(v_eday, 'Dan', 'Day', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_sv   := (public.testing_add_student(v_eday, 'Val', 'Values', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_sn   := (public.testing_add_student(v_eday, 'Nora', 'Note', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_sl   := (public.testing_add_student(v_eday, 'Lars', 'Last', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_sh   := (public.testing_add_student(v_eday, 'Hal', 'Hygiene', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_sh2  := (public.testing_add_student(v_eday, 'Hana', 'Hygiene', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_s9a  := (public.testing_add_student(v_eday, 'Nina', 'Belt', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_s9b  := (public.testing_add_student(v_eday, 'Omar', 'Name', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_sdw  := (public.testing_add_student(v_eday, 'Wes', 'Withdrawn', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_s12  := (public.testing_add_student(v_eday, 'Tess', 'Twelve', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_sdel := (public.testing_add_student(v_eday, 'Del', 'Student', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_g4   := (public.testing_add_student(v_eday, 'Pia', 'Four', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_u4   := (public.testing_add_student(v_eday, 'Una', 'Four', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_p5   := (public.testing_add_student(v_eday, 'Pam', 'Five', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_q5   := (public.testing_add_student(v_eday, 'Quin', 'Five', v_day_yellow, true, 'cash') ->> 'id')::uuid;
  v_sa1  := (public.testing_add_student(v_eafter, 'Abe', 'After', v_after_yellow, true, 'cash') ->> 'id')::uuid;
  v_sa2  := (public.testing_add_student(v_eafter, 'Ada', 'Graded', v_after_yellow, true, 'cash') ->> 'id')::uuid;
  v_sa3  := (public.testing_add_student(v_eafter, 'Ari', 'Ungraded', v_after_yellow, true, 'cash') ->> 'id')::uuid;
  v_g1   := (public.testing_add_student(v_eafter, 'Gus', 'One', v_after_yellow, true, 'cash') ->> 'id')::uuid;
  v_u1   := (public.testing_add_student(v_eafter, 'Uma', 'One', v_after_yellow, true, 'cash') ->> 'id')::uuid;
  v_g2   := (public.testing_add_student(v_eafter, 'Gil', 'Two', v_after_yellow, true, 'cash') ->> 'id')::uuid;
  v_u2   := (public.testing_add_student(v_eafter, 'Ugo', 'Two', v_after_yellow, true, 'cash') ->> 'id')::uuid;
  v_g3   := (public.testing_add_student(v_eafter, 'Gwen', 'Three', v_after_yellow, true, 'cash') ->> 'id')::uuid;
  v_u3   := (public.testing_add_student(v_eafter, 'Ursa', 'Three', v_after_yellow, true, 'cash') ->> 'id')::uuid;
  v_su1  := (public.testing_add_student(v_eupd, 'Uli', 'Update', v_upd_yellow, true, 'cash') ->> 'id')::uuid;
  v_sx1  := (public.testing_add_student(v_edel, 'Xia', 'Gone', v_del_yellow, true, 'cash') ->> 'id')::uuid;
  v_sx2  := (public.testing_add_student(v_edel, 'Xen', 'Gone', v_del_yellow, true, 'cash') ->> 'id')::uuid;
  reset role;
  if v_sb1 is null or v_s0 is null or v_sd1 is null or v_sv is null or v_sn is null or v_sl is null or v_sh is null
     or v_sh2 is null or v_s9a is null or v_s9b is null or v_sdw is null or v_s12 is null or v_sdel is null
     or v_g4 is null or v_u4 is null or v_p5 is null or v_q5 is null or v_sa1 is null or v_sa2 is null or v_sa3 is null or v_g1 is null
     or v_u1 is null or v_g2 is null or v_u2 is null or v_g3 is null or v_u3 is null or v_su1 is null
     or v_sx1 is null or v_sx2 is null then
    raise exception 'TEST SETUP: could not add the test students';
  end if;

  -- move the events: before = tomorrow, after = yesterday, the rest today
  update public.testing_events set testing_date = v_today + 1 where id = v_ebefore;
  update public.testing_events set testing_date = v_today     where id in (v_eday, v_eupd, v_edel);
  update public.testing_events set testing_date = v_today - 1 where id = v_eafter;

  -- ===================================================================
  -- R1. Catalog
  -- ===================================================================
  select c.relowner into v_owner from pg_class c where c.oid = 'public.testing_events'::regclass;

  -- the table: RLS on, same owner as the 0005 tables
  if not exists (select 1 from pg_class c where c.oid = 'public.testing_results'::regclass
                  and c.relrowsecurity and c.relowner = v_owner) then
    raise exception 'TEST FAILED: R1 testing_results must have RLS on and the owner of testing_events';
  end if;
  -- exactly one rule: read, for authenticated, with has_data_access()
  select count(*) into v_n from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'testing_results' and p.cmd = 'SELECT'
     and p.policyname = 'testing_results_select_with_access'
     and p.roles = array['authenticated']::name[] and p.permissive = 'PERMISSIVE' and p.qual like '%has_data_access()%';
  select count(*) into v_n2 from pg_policies p where p.schemaname = 'public' and p.tablename = 'testing_results';
  if v_n <> 1 or v_n2 <> 1 then
    raise exception 'TEST FAILED: R1 expected exactly one has_data_access read rule on testing_results, found % (of %)', v_n, v_n2;
  end if;
  -- no table-wide right for anyone in the app
  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if has_table_privilege('anon', 'public.testing_results', v_priv)
       or has_table_privilege('authenticated', 'public.testing_results', v_priv)
       or has_table_privilege('service_role', 'public.testing_results', v_priv)
       or has_table_privilege('public', 'public.testing_results', v_priv)
       or has_table_privilege('testing_registrar', 'public.testing_results', v_priv) then
      raise exception 'TEST FAILED: R1 testing_results has table-wide % for a client role', v_priv;
    end if;
  end loop;
  foreach v_priv in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
    if has_any_column_privilege('authenticated', 'public.testing_results', v_priv)
       or has_any_column_privilege('anon', 'public.testing_results', v_priv)
       or has_any_column_privilege('service_role', 'public.testing_results', v_priv)
       or has_any_column_privilege('testing_registrar', 'public.testing_results', v_priv) then
      raise exception 'TEST FAILED: R1 a client role has a column % right on testing_results', v_priv;
    end if;
  end loop;
  -- column reads: exactly the five, to authenticated only (never updated_by)
  for v_col in
    select a.attname::text from pg_attribute a
     where a.attrelid = 'public.testing_results'::regclass and a.attnum > 0 and not a.attisdropped
  loop
    if has_column_privilege('authenticated', 'public.testing_results', v_col, 'SELECT') is distinct from (v_col = any (v_cols_read)) then
      raise exception 'TEST FAILED: R1 authenticated SELECT on testing_results.% is %, expected %',
        v_col, has_column_privilege('authenticated', 'public.testing_results', v_col, 'SELECT'), (v_col = any (v_cols_read));
    end if;
    if has_column_privilege('anon', 'public.testing_results', v_col, 'SELECT')
       or has_column_privilege('service_role', 'public.testing_results', v_col, 'SELECT')
       or has_column_privilege('testing_registrar', 'public.testing_results', v_col, 'SELECT') then
      raise exception 'TEST FAILED: R1 testing_results.% readable by anon, service_role or testing_registrar', v_col;
    end if;
  end loop;
  select count(*) into v_n from pg_attribute a
   where a.attrelid = 'public.testing_results'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_n <> 6 then raise exception 'TEST FAILED: R1 testing_results should have 6 columns, has %', v_n; end if;

  -- the functions: one version each, pinned search_path, no defaults,
  -- same owner, who may run them, security definer as designed
  v_n := 0;
  for v_fn in
    select p.oid, p.proname::text as name, p.prosecdef, p.proconfig, p.proowner, p.pronargdefaults
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_new_fns || v_trigger_fns || v_replaced_fns)
  loop
    v_n := v_n + 1;
    if not coalesce('search_path=""' = any (v_fn.proconfig), false) then
      raise exception 'TEST FAILED: R1 % has no search_path = ''''', v_fn.oid::regprocedure;
    end if;
    if v_fn.pronargdefaults > 0 then
      raise exception 'TEST FAILED: R1 % has argument defaults', v_fn.oid::regprocedure;
    end if;
    if v_fn.proowner <> v_owner then
      raise exception 'TEST FAILED: R1 % is not owned by the owner of testing_events', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE')
       or has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
       or has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce((select p.proacl from pg_proc p where p.oid = v_fn.oid),
                                                    acldefault('f', v_fn.proowner))) as a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'TEST FAILED: R1 % is executable by anon, service_role, testing_registrar or PUBLIC', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_new_fns || v_replaced_fns)) then
      raise exception 'TEST FAILED: R1 authenticated execute on % is wrong', v_fn.oid::regprocedure;
    end if;
    if v_fn.prosecdef is distinct from (v_fn.name <> 'testing_results_before_write') then
      raise exception 'TEST FAILED: R1 % security definer is %, not as designed', v_fn.oid::regprocedure, v_fn.prosecdef;
    end if;
  end loop;
  if v_n <> cardinality(v_new_fns || v_trigger_fns || v_replaced_fns) then
    raise exception 'TEST FAILED: R1 expected exactly % functions (one version each), found %',
      cardinality(v_new_fns || v_trigger_fns || v_replaced_fns), v_n;
  end if;
  select string_agg(x.sig, ', ') into v_txt
    from unnest(array[
      'public.testing_set_result(uuid, text)',
      'public.testing_set_result_note(uuid, text)',
      'public.testing_results_before_write()',
      'public.testing_results_log()',
      'public.testing_update_student(uuid, integer, text, text, uuid)',
      'public.testing_resolve_duplicate(uuid, integer, uuid, integer, boolean)',
      'public.testing_restore_student(uuid, integer)',
      'public.testing_add_student(uuid, text, text, uuid, boolean, text)',
      'public.testing_update_event(uuid, integer, text, date, jsonb, date, text)']) as x(sig)
   where to_regprocedure(x.sig) is null;
  if v_txt is not null then raise exception 'TEST FAILED: R1 missing function signature(s): %', v_txt; end if;

  -- the triggers exist, run the right function and are enabled
  select string_agg(x.trg, ', ') into v_txt
    from (values ('testing_results_before_write', 'testing_results_before_write'),
                 ('testing_results_log', 'testing_results_log'),
                 ('testing_results_no_truncate', 'testing_refuse_truncate')) as x(trg, fn)
   where not exists (
     select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'public.testing_results'::regclass and t.tgname = x.trg
        and p.proname = x.fn and t.tgenabled = 'O' and not t.tgisinternal);
  if v_txt is not null then raise exception 'TEST FAILED: R1 missing / wrong / disabled trigger(s): %', v_txt; end if;
  select count(*) into v_n from pg_trigger t where t.tgrelid = 'public.testing_results'::regclass and not t.tgisinternal;
  if v_n <> 3 then raise exception 'TEST FAILED: R1 expected exactly 3 triggers on testing_results, found %', v_n; end if;

  -- the rules: three checks and the foreign key with "on delete cascade"
  select string_agg(x.con, ', ') into v_txt
    from (values ('testing_results_pkey', 'p'), ('testing_results_registration_fk', 'f'),
                 ('testing_results_result_check', 'c'), ('testing_results_note_check', 'c'),
                 ('testing_results_not_empty_check', 'c')) as x(con, typ)
   where not exists (select 1 from pg_constraint c
                      where c.conrelid = 'public.testing_results'::regclass and c.conname = x.con and c.contype = x.typ);
  if v_txt is not null then raise exception 'TEST FAILED: R1 missing rule(s): %', v_txt; end if;
  if not exists (select 1 from pg_constraint c
                  where c.conname = 'testing_results_registration_fk' and c.contype = 'f' and c.confdeltype = 'c'
                    and c.confrelid = 'public.testing_registrations'::regclass) then
    raise exception 'TEST FAILED: R1 testing_results_registration_fk must point at testing_registrations, on delete cascade';
  end if;

  -- ===================================================================
  -- R2. Locked sessions, anon, the family form's login
  -- ===================================================================
  -- one result exists (D1 on the testing day)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_s0, 'pass');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: R2 setup set_result expected ok, got %', v_r; end if;
  select count(*) into v_n from public.testing_results x where x.registration_id = v_s0;
  if v_n <> 1 then raise exception 'TEST FAILED: R2 D1 must see the result it saved'; end if;
  -- A2, A3, A4, A5, A6, D2, D3: no rows, no_access from both functions
  v_list := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d2, v_c_d3];
  for v_i in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_i], true);
    select count(*) into v_n from public.testing_results;
    if v_n <> 0 then raise exception 'TEST FAILED: R2 session % of (A2,A3,A4,A5,A6,D2,D3) sees % result rows', v_i, v_n; end if;
    v_r := public.testing_set_result(v_s0, 'no_show');
    if v_r ->> 'status' is distinct from 'no_access' then
      raise exception 'TEST FAILED: R2 session % of (A2,A3,A4,A5,A6,D2,D3) set_result got %', v_i, v_r;
    end if;
    v_r := public.testing_set_result_note(v_s0, 'x');
    if v_r ->> 'status' is distinct from 'no_access' then
      raise exception 'TEST FAILED: R2 session % of (A2,A3,A4,A5,A6,D2,D3) set_result_note got %', v_i, v_r;
    end if;
  end loop;
  reset role;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_s0 and x.result = 'pass' and x.note is null) then
    raise exception 'TEST FAILED: R2 the refused calls must not change the result';
  end if;
  -- anon: refused on the table and both functions
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform 1 from public.testing_results;
        raise exception 'TEST FAILED: R2 anon could read testing_results'; exception when insufficient_privilege then null; end;
  begin perform public.testing_set_result(v_s0, null);
        raise exception 'TEST FAILED: R2 anon could call testing_set_result'; exception when insufficient_privilege then null; end;
  begin perform public.testing_set_result_note(v_s0, null);
        raise exception 'TEST FAILED: R2 anon could call testing_set_result_note'; exception when insufficient_privilege then null; end;
  reset role;
  -- an unlocked admin can't read updated_by, nor write the table directly
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin perform x.updated_by from public.testing_results x;
        raise exception 'TEST FAILED: R2 authenticated could read testing_results.updated_by'; exception when insufficient_privilege then null; end;
  begin perform * from public.testing_results;
        raise exception 'TEST FAILED: R2 authenticated could select * from testing_results'; exception when insufficient_privilege then null; end;
  begin insert into public.testing_results (registration_id, result) values (v_sd1, 'pass');
        raise exception 'TEST FAILED: R2 A1 could insert into testing_results'; exception when insufficient_privilege then null; end;
  begin update public.testing_results set result = 'no_show';
        raise exception 'TEST FAILED: R2 A1 could update testing_results'; exception when insufficient_privilege then null; end;
  begin delete from public.testing_results;
        raise exception 'TEST FAILED: R2 A1 could delete from testing_results'; exception when insufficient_privilege then null; end;
  begin perform public.testing_results_log();
        raise exception 'TEST FAILED: R2 A1 could call testing_results_log'; exception when insufficient_privilege or feature_not_supported then null; end;
  reset role;
  -- the family form's login (catalog proofs, as 0005_tests T2)
  if has_table_privilege('testing_registrar', 'public.testing_results', 'SELECT')
     or has_any_column_privilege('testing_registrar', 'public.testing_results', 'SELECT')
     or has_function_privilege('testing_registrar', 'public.testing_set_result(uuid, text)', 'EXECUTE')
     or has_function_privilege('testing_registrar', 'public.testing_set_result_note(uuid, text)', 'EXECUTE') then
    raise exception 'TEST FAILED: R2 testing_registrar can reach testing_results or the grading functions';
  end if;

  -- ===================================================================
  -- R3. The date rule (staff D1, admin A1; both functions)
  -- ===================================================================
  set local role authenticated;
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    -- before the testing day: nobody
    v_r := public.testing_set_result(v_sb1, 'pass');
    if v_r ->> 'status' is distinct from 'not_open' then raise exception 'TEST FAILED: R3 before the day set_result (%) expected not_open, got %', case when v_txt = v_c_d1 then 'D1' else 'A1' end, v_r; end if;
    v_r := public.testing_set_result_note(v_sb1, 'Early');
    if v_r ->> 'status' is distinct from 'not_open' then raise exception 'TEST FAILED: R3 before the day set_result_note (%) expected not_open, got %', case when v_txt = v_c_d1 then 'D1' else 'A1' end, v_r; end if;
    -- on the testing day: everyone
    v_r := public.testing_set_result(v_sd1, case when v_txt = v_c_d1 then 'pass' else 'not_passed' end);
    if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: R3 on the day set_result (%) expected ok, got %', case when v_txt = v_c_d1 then 'D1' else 'A1' end, v_r; end if;
    v_r := public.testing_set_result_note(v_sd1, case when v_txt = v_c_d1 then 'Good kicks' else 'Retest forms' end);
    if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: R3 on the day set_result_note (%) expected ok, got %', case when v_txt = v_c_d1 then 'D1' else 'A1' end, v_r; end if;
  end loop;
  -- after the testing day: staff no, admins yes
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_sa1, 'pass');
  if v_r ->> 'status' is distinct from 'finished' then raise exception 'TEST FAILED: R3 after the day D1 set_result expected finished, got %', v_r; end if;
  v_r := public.testing_set_result_note(v_sa1, 'Late');
  if v_r ->> 'status' is distinct from 'finished' then raise exception 'TEST FAILED: R3 after the day D1 set_result_note expected finished, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_set_result(v_sa1, 'pass');
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'result' is distinct from 'pass' then
    raise exception 'TEST FAILED: R3 after the day A1 set_result expected ok pass, got %', v_r;
  end if;
  v_r := public.testing_set_result_note(v_sa1, 'Typed in from paper');
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'note' is distinct from 'Typed in from paper' or v_r ->> 'result' is distinct from 'pass' then
    raise exception 'TEST FAILED: R3 after the day A1 set_result_note expected ok with result and note, got %', v_r;
  end if;
  reset role;
  if exists (select 1 from public.testing_results x where x.registration_id = v_sb1) then
    raise exception 'TEST FAILED: R3 nothing may be stored before the testing day';
  end if;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_sd1
                  and x.result = 'not_passed' and x.note = 'Retest forms') then
    raise exception 'TEST FAILED: R3 on the day the admin''s later values must be stored';
  end if;

  -- ===================================================================
  -- R4. Values (D1, on the testing day)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_txt in array array['pass', 'not_passed', 'no_show'] loop
    v_r := public.testing_set_result(v_sv, v_txt);
    if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'result' is distinct from v_txt or v_r ? 'note' is not true
       or v_r -> 'note' <> 'null'::jsonb or v_r ->> 'updated_at' is null or v_r ->> 'updated_by_name' is distinct from v_desk_name then
      raise exception 'TEST FAILED: R4 set_result % expected {ok, result %, note null, updated_at, updated_by_name %}, got %', v_txt, v_txt, v_desk_name, v_r;
    end if;
    if not exists (select 1 from public.testing_results x where x.registration_id = v_sv and x.result = v_txt) then
      raise exception 'TEST FAILED: R4 % must be stored', v_txt;
    end if;
  end loop;
  -- the same value again: ok, no new history row
  reset role;
  select count(*) into v_n from public.change_log l where l.table_name = 'testing_results' and l.record_id = v_sv;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_sv, 'no_show');
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'result' is distinct from 'no_show' then
    raise exception 'TEST FAILED: R4 the same value again expected ok no_show, got %', v_r;
  end if;
  reset role;
  select count(*) into v_n2 from public.change_log l where l.table_name = 'testing_results' and l.record_id = v_sv;
  if v_n2 <> v_n then raise exception 'TEST FAILED: R4 the same value again must write no history row (% -> %)', v_n, v_n2; end if;
  -- null clears it: no note -> the row goes; the answer is all null
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_sv, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'result', null, 'note', null, 'updated_at', null, 'updated_by_name', null) then
    raise exception 'TEST FAILED: R4 clearing expected {ok, all null}, got %', v_r;
  end if;
  if exists (select 1 from public.testing_results x where x.registration_id = v_sv) then
    raise exception 'TEST FAILED: R4 clearing the only value must remove the row';
  end if;
  -- clearing again (no row): ok, nothing written
  v_r := public.testing_set_result(v_sv, null);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: R4 clearing with no row expected ok, got %', v_r; end if;
  -- result + note, then clear the result -> the row stays with the note;
  -- then clear the note -> the row goes
  v_r := public.testing_set_result(v_sv, 'pass');
  v_r := public.testing_set_result_note(v_sv, 'Great spirit');
  v_r := public.testing_set_result(v_sv, null);
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'result' <> 'null'::jsonb or v_r ->> 'note' is distinct from 'Great spirit' then
    raise exception 'TEST FAILED: R4 clearing the result of a row with a note expected {ok, result null, the note}, got %', v_r;
  end if;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_sv and x.result is null and x.note = 'Great spirit') then
    raise exception 'TEST FAILED: R4 the row must stay with its note';
  end if;
  v_r := public.testing_set_result_note(v_sv, null);
  if v_r ->> 'status' is distinct from 'ok' or exists (select 1 from public.testing_results x where x.registration_id = v_sv) then
    raise exception 'TEST FAILED: R4 clearing the note too must remove the row, got %', v_r;
  end if;
  -- bad input, unknown student
  v_r := public.testing_set_result(v_sv, 'passed');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: R4 ''passed'' expected invalid, got %', v_r; end if;
  v_r := public.testing_set_result(null, 'pass');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: R4 null id expected invalid, got %', v_r; end if;
  v_r := public.testing_set_result_note(null, 'x');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: R4 note with null id expected invalid, got %', v_r; end if;
  v_r := public.testing_set_result(gen_random_uuid(), 'pass');
  if v_r ->> 'status' is distinct from 'not_found' then raise exception 'TEST FAILED: R4 unknown id expected not_found, got %', v_r; end if;
  v_r := public.testing_set_result_note(gen_random_uuid(), 'x');
  if v_r ->> 'status' is distinct from 'not_found' then raise exception 'TEST FAILED: R4 note for an unknown id expected not_found, got %', v_r; end if;
  -- a withdrawn student (Withdraw is admin-only)
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_sdw;
  v_r := public.testing_withdraw_student(v_sdw, v_v);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: R4 setup withdraw expected ok, got %', v_r; end if;
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_r := public.testing_set_result(v_sdw, 'pass');
    if v_r ->> 'status' is distinct from 'withdrawn' then raise exception 'TEST FAILED: R4 withdrawn student set_result expected withdrawn, got %', v_r; end if;
    v_r := public.testing_set_result_note(v_sdw, 'x');
    if v_r ->> 'status' is distinct from 'withdrawn' then raise exception 'TEST FAILED: R4 withdrawn student set_result_note expected withdrawn, got %', v_r; end if;
  end loop;
  reset role;

  -- ===================================================================
  -- R5. The note (D1, on the testing day)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result_note(v_sn, repeat('a', 200));
  if v_r ->> 'status' is distinct from 'ok' or char_length(v_r ->> 'note') <> 200 or v_r -> 'result' <> 'null'::jsonb then
    raise exception 'TEST FAILED: R5 a 200-character note expected ok, got %', v_r;
  end if;
  -- more than 2000 characters as sent -> invalid even if it would tidy
  -- down to a short note (refused before tidying)
  v_r := public.testing_set_result_note(v_sn, 'x' || repeat(' ', 2000));
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: R5 a 2001-character text expected invalid, got %', v_r; end if;
  v_r := public.testing_set_result_note(v_sn, 'y' || repeat(' ', 1999));
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'note' is distinct from 'y' then
    raise exception 'TEST FAILED: R5 a 2000-character text tidied to ''y'' expected ok, got %', v_r;
  end if;
  v_r := public.testing_set_result_note(v_sn, repeat('a', 200));
  v_r := public.testing_set_result_note(v_sn, repeat('b', 201));
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: R5 a 201-character note expected invalid, got %', v_r; end if;
  -- 201 characters that tidy down to 200 are fine (spaces at the ends go)
  v_r := public.testing_set_result_note(v_sn, ' ' || repeat('c', 200));
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'note' is distinct from repeat('c', 200) then
    raise exception 'TEST FAILED: R5 a note tidied to 200 characters expected ok, got %', v_r;
  end if;
  -- blank = clear (and the row goes: there is no result)
  v_r := public.testing_set_result_note(v_sn, '   ');
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'note' <> 'null'::jsonb
     or exists (select 1 from public.testing_results x where x.registration_id = v_sn) then
    raise exception 'TEST FAILED: R5 a blank note expected ok and the note cleared, got %', v_r;
  end if;
  -- line breaks and runs of spaces become one space
  v_r := public.testing_set_result_note(v_sn, E'a\n\n b');
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'note' is distinct from 'a b' then
    raise exception 'TEST FAILED: R5 E''a\n\n b'' expected stored as ''a b'', got %', v_r;
  end if;
  v_r := public.testing_set_result_note(v_sn, E'\tKeep  hands\r\nup ');
  if v_r ->> 'note' is distinct from 'Keep hands up' then
    raise exception 'TEST FAILED: R5 tabs / Windows line breaks expected ''Keep hands up'', got %', v_r;
  end if;
  -- an invisible character -> invalid (the stored note is unchanged)
  v_r := public.testing_set_result_note(v_sn, 'a' || chr(8203) || 'b');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: R5 a zero-width character expected invalid, got %', v_r; end if;
  v_r := public.testing_set_result_note(v_sn, 'a' || chr(7) || 'b');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: R5 a control character expected invalid, got %', v_r; end if;
  -- "é" counts as one character
  v_r := public.testing_set_result_note(v_sn, repeat('é', 200));
  if v_r ->> 'status' is distinct from 'ok' or char_length(v_r ->> 'note') <> 200 then
    raise exception 'TEST FAILED: R5 200 x é expected ok, got %', v_r;
  end if;
  v_r := public.testing_set_result_note(v_sn, repeat('é', 201));
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: R5 201 x é expected invalid, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_sn and x.note = repeat('é', 200)) then
    raise exception 'TEST FAILED: R5 refused notes must not change the stored note';
  end if;

  -- ===================================================================
  -- R6 + R7. Last change wins; versions untouched; the history
  -- ===================================================================
  select r.version into v_v from public.testing_registrations r where r.id = v_sl;
  select e.version into v_ev_v from public.testing_events e where e.id = v_eday;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_sl, 'pass');                 -- insert (desk)
  if v_r ->> 'updated_by_name' is distinct from v_desk_name then
    raise exception 'TEST FAILED: R7 updated_by_name expected %, got %', v_desk_name, v_r;
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: R7 tkd.action / tkd.batch_id must be cleared after the call';
  end if;
  reset role;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_sl
                  and x.updated_by = v_desk and x.updated_by_name = v_desk_name) then
    raise exception 'TEST FAILED: R7 the row must be stamped with the desk''s login and name';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_set_result(v_sl, 'no_show');              -- update (admin): the last change wins
  if v_r ->> 'result' is distinct from 'no_show' or v_r ->> 'updated_by_name' is distinct from v_admin_name then
    raise exception 'TEST FAILED: R6 the admin''s later no_show must win, got %', v_r;
  end if;
  v_r := public.testing_set_result_note(v_sl, 'Came late');      -- update
  v_r := public.testing_set_result(v_sl, null);                   -- update (the note stays)
  v_r := public.testing_set_result_note(v_sl, null);              -- removal
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_sl and r.version = v_v)
     or not exists (select 1 from public.testing_events e where e.id = v_eday and e.version = v_ev_v) then
    raise exception 'TEST FAILED: R6 result writes must not change the registration''s or the event''s version';
  end if;
  -- R7: five history rows for this student, in order
  select string_agg(l.action || '/' || l.op || '/' || l.actor_name, ', ' order by l.id) into v_txt
    from public.change_log l
   where l.id > v_mark and l.table_name = 'testing_results' and l.record_id = v_sl;
  if v_txt is distinct from format('set_result/insert/%s, set_result/update/%s, set_result_note/update/%s, set_result/update/%s, set_result_note/delete/%s',
                                   v_desk_name, v_admin_name, v_admin_name, v_admin_name, v_admin_name) then
    raise exception 'TEST FAILED: R7 history rows for the student: %', v_txt;
  end if;
  if exists (select 1 from public.change_log l
              where l.id > v_mark and l.table_name = 'testing_results' and l.record_id = v_sl
                and (l.batch_id is null or l.location_code is not null or l.session_id is null)) then
    raise exception 'TEST FAILED: R7 every history row needs a batch id and the session, and no school';
  end if;
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.table_name = 'testing_results' and l.record_id = v_sl and l.op = 'insert'
                    and l.actor_id = v_desk and l.session_id = v_d1
                    and l.after ->> 'result' = 'pass' and l.after ->> 'registration_id' = v_sl::text) then
    raise exception 'TEST FAILED: R7 the insert row must name the desk, its session and the new values';
  end if;
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.table_name = 'testing_results' and l.record_id = v_sl and l.op = 'update'
                    and l.before ->> 'result' = 'pass' and l.after ->> 'result' = 'no_show' and not (l.after ? 'note')) then
    raise exception 'TEST FAILED: R7 an update row must hold only the changed keys';
  end if;
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.table_name = 'testing_results' and l.record_id = v_sl and l.op = 'delete'
                    and l.before ->> 'note' = 'Came late' and l.after is null) then
    raise exception 'TEST FAILED: R7 the removal row must hold the old values';
  end if;
  if has_column_privilege('authenticated', 'public.testing_results', 'updated_by', 'SELECT') then
    raise exception 'TEST FAILED: R7 updated_by must not be readable by authenticated';
  end if;

  -- ===================================================================
  -- R8. Table rules, even for the SQL Editor's role (as postgres)
  -- ===================================================================
  begin
    insert into public.testing_results (registration_id, result, note) values (v_sh, null, null);
    raise exception 'TEST FAILED: R8 a row with neither result nor note was allowed';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'testing_results_not_empty_check' then raise exception 'TEST FAILED: R8 empty row refused by % instead', v_constraint; end if;
  end;
  begin
    insert into public.testing_results (registration_id, result) values (v_sh, 'passed');
    raise exception 'TEST FAILED: R8 result ''passed'' was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.testing_results (registration_id, note) values (v_sh, repeat('a', 201));
    raise exception 'TEST FAILED: R8 a 201-character note was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.testing_results (registration_id, note) values (v_sh, 'two  spaces');
    raise exception 'TEST FAILED: R8 an untidied note was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.testing_results (registration_id, result) values (gen_random_uuid(), 'pass');
    raise exception 'TEST FAILED: R8 a result for an unknown registration was allowed';
  exception when foreign_key_violation then null;
  end;
  insert into public.testing_results (registration_id, result) values (v_sh, 'pass');
  begin
    update public.testing_results set registration_id = v_sh2 where registration_id = v_sh;
    raise exception 'TEST FAILED: R8 a result was moved to another registration';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'testing_results_immutable' then raise exception 'TEST FAILED: R8 the move was refused by % instead', v_constraint; end if;
  end;
  -- an update that changes nothing keeps the stamps (and writes no history)
  select * into v_row from public.testing_results x where x.registration_id = v_sh;
  select count(*) into v_n from public.change_log l where l.table_name = 'testing_results' and l.record_id = v_sh;
  update public.testing_results set result = 'pass', updated_by_name = 'someone else', updated_at = now() - interval '1 day'
   where registration_id = v_sh;
  select count(*) into v_n2 from public.change_log l where l.table_name = 'testing_results' and l.record_id = v_sh;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_sh
                  and x.updated_by_name = v_row.updated_by_name and x.updated_at = v_row.updated_at)
     or v_n2 <> v_n then
    raise exception 'TEST FAILED: R8 an update that changes nothing must keep the stamps and write no history';
  end if;
  begin
    truncate public.testing_results;
    raise exception 'TEST FAILED: R8 truncate was allowed';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_sh) then
    raise exception 'TEST FAILED: R8 the row must still be there after the refused truncate';
  end if;
  -- a direct write in the SQL Editor is logged as "manual"
  if not exists (select 1 from public.change_log l where l.table_name = 'testing_results' and l.record_id = v_sh
                  and l.op = 'insert' and l.action = 'manual') then
    raise exception 'TEST FAILED: R8 a direct insert must be logged with action manual';
  end if;

  -- ===================================================================
  -- R9. Edit details (testing_update_student)
  -- ===================================================================
  -- on the testing day: a belt change clears the result (staff too)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_s9a, 'pass');
  v_r := public.testing_set_result_note(v_s9a, 'Strong');
  v_r := public.testing_set_result(v_s9b, 'not_passed');
  select r.version into v_v from public.testing_registrations r where r.id = v_s9a;
  reset role;
  select coalesce(max(id), 0) into v_mark from public.change_log;   -- (the history is readable only here)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r :=public.testing_update_student(v_s9a, v_v, 'Nina', 'Belt', v_day_orange);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1, 'result_cleared', true) then
    raise exception 'TEST FAILED: R9 belt change of a graded student expected {ok, version %, result_cleared true}, got %', v_v + 1, v_r;
  end if;
  reset role;
  if exists (select 1 from public.testing_results x where x.registration_id = v_s9a) then
    raise exception 'TEST FAILED: R9 the belt change must remove the result row';
  end if;
  select l.batch_id into v_batch from public.change_log l
   where l.id > v_mark and l.table_name = 'testing_registrations' and l.record_id = v_s9a and l.action = 'update_student';
  if v_batch is null
     or not exists (select 1 from public.change_log l
                     where l.id > v_mark and l.table_name = 'testing_results' and l.record_id = v_s9a
                       and l.action = 'clear_result' and l.op = 'delete' and l.batch_id = v_batch
                       and l.before ->> 'result' = 'pass' and l.before ->> 'note' = 'Strong') then
    raise exception 'TEST FAILED: R9 history must have update_student + clear_result rows with the same batch id';
  end if;
  -- name-only change of a graded student: exactly 0005's answer, result kept
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_s9b;
  v_r := public.testing_update_student(v_s9b, v_v, 'Omari', 'Name', v_day_yellow);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: R9 name-only edit expected exactly {ok, version %} (no result_cleared), got %', v_v + 1, v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_s9b and x.result = 'not_passed') then
    raise exception 'TEST FAILED: R9 a name-only edit must keep the result';
  end if;
  -- after the testing day
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_set_result(v_sa2, 'pass');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: R9 setup admin result after the day expected ok, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_sa2;
  v_r := public.testing_update_student(v_sa2, v_v, 'Ada', 'Graded', v_after_orange);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: R9 staff belt change of a graded student after the day expected not_allowed, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_sa2 and r.version = v_v and r.event_rank_id = v_after_yellow)
     or not exists (select 1 from public.testing_results x where x.registration_id = v_sa2 and x.result = 'pass') then
    raise exception 'TEST FAILED: R9 the refused belt change must change nothing';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_update_student(v_sa2, v_v, 'Adah', 'Graded', v_after_yellow);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: R9 staff name-only edit after the day expected {ok, version %}, got %', v_v + 1, v_r;
  end if;
  select r.version into v_v2 from public.testing_registrations r where r.id = v_sa3;
  v_r := public.testing_update_student(v_sa3, v_v2, 'Ari', 'Ungraded', v_after_orange);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v2 + 1) then
    raise exception 'TEST FAILED: R9 staff belt change of an UNgraded student after the day expected {ok, version %}, got %', v_v2 + 1, v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_student(v_sa2, v_v + 1, 'Adah', 'Graded', v_after_orange);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 2, 'result_cleared', true) then
    raise exception 'TEST FAILED: R9 admin belt change of a graded student after the day expected {ok, version %, result_cleared true}, got %', v_v + 2, v_r;
  end if;
  reset role;
  if exists (select 1 from public.testing_results x where x.registration_id = v_sa2) then
    raise exception 'TEST FAILED: R9 the admin''s belt change must clear the result';
  end if;

  -- ===================================================================
  -- R10. Possible duplicate "keep one" (the rename path)
  -- ===================================================================
  -- after the testing day: grade g1, g2, g3 (admin), then the desk renames
  -- each to match u1, u2, u3 -> each g is a possible duplicate of its u
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_set_result(v_g1, 'pass');
  v_r := public.testing_set_result(v_g2, 'pass');
  v_r := public.testing_set_result(v_g3, 'no_show');
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_g1;
  v_r := public.testing_update_student(v_g1, v_v, 'Uma', 'One', v_after_yellow);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: R10 rename g1 expected ok, got %', v_r; end if;
  select r.version into v_v from public.testing_registrations r where r.id = v_g2;
  v_r := public.testing_update_student(v_g2, v_v, 'Ugo', 'Two', v_after_yellow);
  select r.version into v_v from public.testing_registrations r where r.id = v_g3;
  v_r := public.testing_update_student(v_g3, v_v, 'Ursa', 'Three', v_after_yellow);
  reset role;
  if (select count(*) from public.testing_registrations r
       where (r.id, r.duplicate_of) in ((v_g1, v_u1), (v_g2, v_u2), (v_g3, v_u3)) and r.duplicate_state = 'possible') <> 3 then
    raise exception 'TEST FAILED: R10 setup: each renamed graded student must be a possible duplicate of its match';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- staff keep-one that withdraws the GRADED copy -> not_allowed
  select r.version into v_v from public.testing_registrations r where r.id = v_u1;
  select r.version into v_v2 from public.testing_registrations r where r.id = v_g1;
  v_r := public.testing_resolve_duplicate(v_u1, v_v, v_g1, v_v2, false);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: R10 staff keep-one withdrawing a graded student after the day expected not_allowed, got %', v_r;
  end if;
  -- staff keep-one that withdraws the UNgraded copy -> also not_allowed
  -- (v0.194: after the testing day keep one is admin-only for everyone)
  v_r := public.testing_resolve_duplicate(v_g1, v_v2, v_u1, v_v, false);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: R10 staff keep-one withdrawing an UNgraded student after the day expected not_allowed, got %', v_r;
  end if;
  -- the same keep-one by an admin -> ok
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_resolve_duplicate(v_g1, v_v2, v_u1, v_v, false);
  if v_r is distinct from jsonb_build_object('status', 'ok') then
    raise exception 'TEST FAILED: R10 admin keep-one withdrawing the ungraded student after the day expected ok, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- staff keep both after the day -> ok (it withdraws nobody)
  select r.version into v_v from public.testing_registrations r where r.id = v_u2;
  select r.version into v_v2 from public.testing_registrations r where r.id = v_g2;
  v_r := public.testing_resolve_duplicate(v_u2, v_v, v_g2, v_v2, true);
  if v_r is distinct from jsonb_build_object('status', 'ok') then
    raise exception 'TEST FAILED: R10 staff keep both expected ok, got %', v_r;
  end if;
  -- admin keep-one withdrawing a graded copy -> ok; the result stays
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_u3;
  select r.version into v_v2 from public.testing_registrations r where r.id = v_g3;
  v_r := public.testing_resolve_duplicate(v_u3, v_v, v_g3, v_v2, false);
  if v_r is distinct from jsonb_build_object('status', 'ok') then
    raise exception 'TEST FAILED: R10 admin keep-one withdrawing a graded student expected ok, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_u1 and r.status = 'withdrawn')
     or not exists (select 1 from public.testing_registrations r where r.id = v_g1 and r.status = 'active')
     or (select count(*) from public.testing_registrations r where r.id in (v_g2, v_u2) and r.duplicate_state = 'kept_both') <> 2
     or not exists (select 1 from public.testing_registrations r where r.id = v_g3 and r.status = 'withdrawn' and r.withdrawn_by = v_admin)
     or not exists (select 1 from public.testing_results x where x.registration_id = v_g3 and x.result = 'no_show') then
    raise exception 'TEST FAILED: R10 the keep-one / keep-both results are wrong';
  end if;
  -- on the testing day: staff keep-one of a graded copy -> ok
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_g4, 'pass');
  select r.version into v_v from public.testing_registrations r where r.id = v_g4;
  v_r := public.testing_update_student(v_g4, v_v, 'Una', 'Four', v_day_yellow);
  select r.version into v_v from public.testing_registrations r where r.id = v_u4;
  select r.version into v_v2 from public.testing_registrations r where r.id = v_g4;
  v_r := public.testing_resolve_duplicate(v_u4, v_v, v_g4, v_v2, false);
  if v_r is distinct from jsonb_build_object('status', 'ok') then
    raise exception 'TEST FAILED: R10 staff keep-one of a graded copy ON the testing day expected ok, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_g4 and r.status = 'withdrawn'
                  and r.withdrawn_reason = 'duplicate_copy' and r.withdrawn_by = v_desk) then
    raise exception 'TEST FAILED: R10 the graded copy must be withdrawn as duplicate_copy by the desk';
  end if;
  -- on the testing day: staff keep-one of an UNgraded copy -> ok (p5)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_p5;
  v_r := public.testing_update_student(v_p5, v_v, 'Quin', 'Five', v_day_yellow);
  select r.version into v_v from public.testing_registrations r where r.id = v_q5;
  select r.version into v_v2 from public.testing_registrations r where r.id = v_p5;
  v_r := public.testing_resolve_duplicate(v_q5, v_v, v_p5, v_v2, false);
  if v_r is distinct from jsonb_build_object('status', 'ok') then
    raise exception 'TEST FAILED: R10 staff keep-one of an ungraded copy ON the testing day expected ok, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_p5 and r.status = 'withdrawn' and r.withdrawn_by = v_desk) then
    raise exception 'TEST FAILED: R10 the ungraded copy must be withdrawn by the desk';
  end if;

  -- ===================================================================
  -- R11. Restore (the staff 10-second Undo; admins)
  -- ===================================================================
  -- the desk's own keep-ones were done on the testing day (p5 ungraded,
  -- g4 graded); the event is moved to yesterday for the "after" checks
  update public.testing_events set testing_date = v_today - 1 where id = v_eday;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- ungraded, after the day -> ok
  select r.version into v_v from public.testing_registrations r where r.id = v_p5;
  v_r := public.testing_restore_student(v_p5, v_v);
  if v_r ->> 'status' is distinct from 'ok' then
    raise exception 'TEST FAILED: R11 staff Undo of an ungraded keep-one after the day expected ok, got %', v_r;
  end if;
  -- graded, after the day -> not_allowed
  select r.version into v_v from public.testing_registrations r where r.id = v_g4;
  v_r := public.testing_restore_student(v_g4, v_v);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: R11 staff Undo of a graded keep-one after the day expected not_allowed, got %', v_r;
  end if;
  reset role;
  update public.testing_events set testing_date = v_today where id = v_eday;
  -- the same Undo on the testing day -> ok
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_restore_student(v_g4, v_v);
  if v_r ->> 'status' is distinct from 'ok' then
    raise exception 'TEST FAILED: R11 staff Undo of a graded keep-one ON the testing day expected ok, got %', v_r;
  end if;
  -- admin restore of a graded withdrawn student after the day -> ok, and
  -- the result can be read again
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_g3;
  v_r := public.testing_restore_student(v_g3, v_v);
  if v_r ->> 'status' is distinct from 'ok' then
    raise exception 'TEST FAILED: R11 admin restore of a graded student expected ok, got %', v_r;
  end if;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_g3 and x.result = 'no_show') then
    raise exception 'TEST FAILED: R11 the restored student''s result must read again';
  end if;
  reset role;

  -- ===================================================================
  -- R12. Withdraw keeps the result
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_s12, 'pass');
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_s12;
  v_r := public.testing_withdraw_student(v_s12, v_v);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: R12 withdraw expected ok, got %', v_r; end if;
  if not exists (select 1 from public.testing_results x where x.registration_id = v_s12 and x.result = 'pass') then
    raise exception 'TEST FAILED: R12 Withdraw must keep the result';
  end if;
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_r := public.testing_set_result(v_s12, 'no_show');
    if v_r ->> 'status' is distinct from 'withdrawn' then raise exception 'TEST FAILED: R12 set_result on a withdrawn student expected withdrawn, got %', v_r; end if;
  end loop;
  reset role;

  -- ===================================================================
  -- R13. Add student after the testing day
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_add_student(v_eafter, 'Walt', 'Late', v_after_yellow, true, 'cash');
  if v_r ->> 'status' is distinct from 'finished' then
    raise exception 'TEST FAILED: R13 staff add after the day expected finished, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_student(v_eafter, 'Walt', 'Late', v_after_yellow, true, 'cash');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 1 or v_r ->> 'reference' is null then
    raise exception 'TEST FAILED: R13 admin add after the day expected ok, got %', v_r;
  end if;
  v_walk := (v_r ->> 'id')::uuid;
  if not exists (select 1 from public.testing_registrations r where r.id = v_walk and r.source = 'staff'
                  and r.created_by_name = v_admin_name and r.status = 'active') then
    raise exception 'TEST FAILED: R13 the added student must be source staff, created by the admin';
  end if;
  v_r := public.testing_set_result(v_walk, 'pass');
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'result' is distinct from 'pass' then
    raise exception 'TEST FAILED: R13 admin result for the added student expected ok, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.change_log l where l.table_name = 'testing_registrations' and l.record_id = v_walk
                  and l.action = 'add_student' and l.op = 'insert') then
    raise exception 'TEST FAILED: R13 the add must be logged as add_student';
  end if;

  -- ===================================================================
  -- R14. Edit event: no date change once there are results
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_su1, 'pass');
  perform set_config('request.jwt.claims', v_c_a1, true);
  select e.version into v_v from public.testing_events e where e.id = v_eupd;
  v_r := public.testing_update_event(v_eupd, v_v, v_tag || ' upd', v_today + 3, v_classes, null, null);
  if v_r is distinct from jsonb_build_object('status', 'has_results') then
    raise exception 'TEST FAILED: R14 a date change with a result expected has_results, got %', v_r;
  end if;
  if not exists (select 1 from public.testing_events e where e.id = v_eupd and e.version = v_v and e.testing_date = v_today) then
    raise exception 'TEST FAILED: R14 has_results must change nothing';
  end if;
  -- the same date with a new name -> ok
  v_r := public.testing_update_event(v_eupd, v_v, v_tag || ' upd renamed', v_today, v_classes, null, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: R14 a name change with results expected {ok, version %}, got %', v_v + 1, v_r;
  end if;
  -- a WITHDRAWN student's result counts too
  select r.version into v_v2 from public.testing_registrations r where r.id = v_su1;
  v_r := public.testing_withdraw_student(v_su1, v_v2);
  v_r := public.testing_update_event(v_eupd, v_v + 1, v_tag || ' upd renamed', v_today + 3, v_classes, null, null);
  if v_r is distinct from jsonb_build_object('status', 'has_results') then
    raise exception 'TEST FAILED: R14 a date change with a withdrawn student''s result expected has_results, got %', v_r;
  end if;
  -- once the result is gone (restore, clear) -> the date can change
  select r.version into v_v2 from public.testing_registrations r where r.id = v_su1;
  v_r := public.testing_restore_student(v_su1, v_v2);
  v_r := public.testing_set_result(v_su1, null);
  if v_r ->> 'status' <> 'ok' or exists (select 1 from public.testing_results x where x.registration_id = v_su1) then
    raise exception 'TEST FAILED: R14 clearing the result expected ok and no row, got %', v_r;
  end if;
  v_r := public.testing_update_event(v_eupd, v_v + 1, v_tag || ' upd renamed', v_today + 3, v_classes, null, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 2) then
    raise exception 'TEST FAILED: R14 a date change without results expected {ok, version %}, got %', v_v + 2, v_r;
  end if;
  reset role;

  -- ===================================================================
  -- R15. Removals take the results with them (logged)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_result(v_sdel, 'not_passed');
  v_r := public.testing_set_result(v_sx1, 'pass');
  v_r := public.testing_set_result_note(v_sx2, 'Only a note');
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_sdel;
  v_r := public.testing_delete_student(v_sdel, v_v, '{}'::uuid[]);
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: R15 delete_student expected ok, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.testing_results x where x.registration_id = v_sdel) then
    raise exception 'TEST FAILED: R15 removing a student must remove their result';
  end if;
  if not exists (select 1 from public.change_log l where l.table_name = 'testing_results' and l.record_id = v_sdel
                  and l.op = 'delete' and l.action = 'delete_student' and l.before ->> 'result' = 'not_passed') then
    raise exception 'TEST FAILED: R15 the removed result must be logged under delete_student';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select e.version into v_v from public.testing_events e where e.id = v_edel;
  v_r := public.testing_delete_event(v_edel, v_v, 2, 0);
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: R15 delete_event expected ok, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.testing_results x where x.registration_id in (v_sx1, v_sx2)) then
    raise exception 'TEST FAILED: R15 removing an event must remove its results';
  end if;
  if (select count(*) from public.change_log l where l.table_name = 'testing_results' and l.record_id in (v_sx1, v_sx2)
       and l.op = 'delete' and l.action = 'delete_event') <> 2 then
    raise exception 'TEST FAILED: R15 both removed results must be logged under delete_event';
  end if;

  -- ===================================================================
  -- R16. The history never holds a signature picture
  -- ===================================================================
  select count(*) into v_n from public.change_log l
   where coalesce(l.before::text, '') || coalesce(l.after::text, '') like '%data:image%';
  if v_n <> 0 then raise exception 'TEST FAILED: R16 % history row(s) contain data:image', v_n; end if;

  reset role;
end;
$$;

select 'ALL 0010 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
