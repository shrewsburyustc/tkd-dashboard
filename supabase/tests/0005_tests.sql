-- =====================================================================
-- 0005_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0005_testing_events.sql (Color
--   Belt phase 2: events, the family form, the roster with payments,
--   school addresses). It checks, in this order (contract 0005 §2):
--     T1  who may call what: anon nothing; signed-in staff only the staff
--         functions; locked / signed-out / magic-link / 8-day-old sessions
--         get no_access; staff vs admin for every admin-only function
--     T2  the restricted login testing_registrar: exactly the two public
--         functions, no table rights anywhere, can't create anything, not
--         part of any role, Supabase's API login can't become it
--     T3  the event copy (later Classes and ranks changes don't touch an
--         event; a class added later copies the values of THAT moment;
--         final award Not set is refused), Add / Edit event rules
--     T4  the event state at the minute boundaries (America/New_York) and
--         the Open / Closed switch rules for staff and admins
--     T5  the family form: same submission twice = one registration,
--         every refusal, signature rules, the rate limit, duplicates,
--         "Family form" in the history
--     T6  payments: Mark paid amount by date, double click, already paid,
--         withdrawn, Finished, Undo window, Edit, append-only, removals
--     T7  signatures: never readable, removed after 90 days without a
--         version bump, NEVER in change_log
--     T8  duplicates, withdraw / restore, the staff Undo after "keep
--         one" (their own, less than 10 seconds ago only)
--     T9  Settings -> Schools addresses
--     T10 catalog: RLS, column rights, search_path, security definer,
--         triggers, rules, owners
--   It makes its own test classes and events with unusual names ("zz test
--   1a2b3c4d ..."), so it works whatever is already in the database (run
--   it before AND after the first real event exists).
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test classes, events, students,
--   payments, history rows, test sessions). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0003_tests.sql (read its header): "set local role
--   authenticated" + a pretend login token per session. The pretend
--   sessions (A = admin, D = the front desk, role staff):
--     A1 admin unlocked · A2 locked ("Lock now") · A3 5 wrong PINs ·
--     A4 signed out · A5 password sign-in 8 days ago · A6 magic link ·
--     D1 desk unlocked · D2 desk locked · D3 desk magic link · anon
--   The family form's login (testing_registrar) is checked from the
--   catalog only (T2): the public functions are called here as the SQL
--   Editor's own role, which gives the same answers (they always run as
--   their owner).
--
-- BEFORE YOU RUN IT
--   1. 0001-0005 are applied. You need TWO existing, ACTIVE staff rows: an
--      admin (Main Admin) and the shared front desk (Staff, role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test removes its
--      own test rows and checks that some removals are REFUSED. Everything
--      is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0005 TESTS PASSED".
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
  v_rand  uuid := gen_random_uuid();
  v_rand2 uuid := gen_random_uuid();
  v_role  text;

  -- a small valid PNG signature, and one that is 1 character too long
  v_sig      text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  v_sig_long text := 'data:image/png;base64,' || repeat('A', 70000 - 22 + 1);
  v_ack      text := 'cb-2026-10-17';

  v_r      jsonb;
  v_r2     jsonb;
  v_i      integer;
  v_n      integer;
  v_n2     integer;
  v_v      integer;
  v_txt    text;
  v_bool   boolean;
  v_mark   bigint;
  v_list   text[];
  v_calls  text[];
  v_admin_only integer[] := array[1, 2, 4, 10, 12, 14, 15];   -- not 13 (restore: staff may Undo their own keep-one, T8b)
  v_ts     timestamptz;
  v_ev_row public.testing_events;

  -- test classes (Worcester: ta, tb, tc; Shrewsbury: ts) and their ranks
  v_ta uuid; v_tb uuid; v_tc uuid; v_ts_cls uuid;
  v_ta_yellow uuid; v_ta_orange uuid; v_ta_green uuid;
  v_tb_blue uuid; v_tb_red uuid; v_tc_purple uuid; v_ts_rank uuid;

  -- events, event ranks, registrations, payments
  v_e1 uuid; v_e1_code text; v_e2 uuid; v_e3 uuid; v_ep uuid; v_ep_code text; v_ep2 uuid; v_ep2_code text;
  v_epay uuid; v_eday uuid; v_etom uuid; v_efin uuid; v_eold uuid; v_eold_code text; v_ekeep uuid; v_ekeep_code text;
  v_k_yellow uuid; v_k_orange uuid; v_k_green uuid; v_k_blue uuid; v_k_red uuid; v_k_other uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_sday uuid; v_stom uuid; v_sfin uuid;
  v_f1 uuid; v_f2 uuid; v_fold uuid; v_fkeep uuid;
  v_p1 uuid; v_p2 uuid; v_pa uuid; v_pb uuid; v_prev uuid; v_pnew uuid;
  v_sub1 uuid := gen_random_uuid();
  v_key1 text; v_key2 text; v_key3 text;

  -- catalog
  v_fn      record;
  v_tbl     text;
  v_col     text;
  v_priv    text;
  v_reg_oid oid;
  v_owner   oid;
  v_staff_fns  text[] := array['testing_add_event', 'testing_update_event', 'testing_set_registration',
                               'testing_delete_event', 'testing_add_student', 'testing_update_student',
                               'testing_change_paying_by', 'testing_mark_paid', 'testing_undo_payment',
                               'testing_edit_payment', 'testing_resolve_duplicate', 'testing_withdraw_student',
                               'testing_restore_student', 'testing_delete_student', 'settings_update_school_address'];
  v_public_fns text[] := array['testing_public_event', 'testing_public_register'];
  v_helper_fns text[] := array['testing_line_is_valid', 'testing_normalize_note', 'testing_note_is_valid',
                               'testing_signature_is_valid', 'testing_school_date', 'testing_today',
                               'testing_fee_cents', 'testing_new_public_code', 'testing_classes_arg_is_valid',
                               'testing_locations_before_write', 'testing_event_state', 'testing_rank_testing_for',
                               'testing_location_address', 'testing_events_before_write',
                               'testing_event_copies_before_write', 'testing_registrations_before_write',
                               'testing_registrations_log', 'testing_payments_guard', 'testing_purge_old_signatures',
                               'testing_find_duplicate', 'testing_recheck_duplicate', 'testing_recheck_pointing_at',
                               'testing_check_classes_for_event', 'testing_copy_class_into_event',
                               'testing_public_answer', 'testing_lock_registration', 'testing_lock_payment',
                               'testing_public_register_core'];
  v_new_tables text[] := array['testing_events', 'testing_event_classes', 'testing_event_ranks',
                               'testing_registrations', 'testing_payments', 'testing_public_attempts'];
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
  if to_regclass('public.testing_events') is null then
    raise exception 'TEST SETUP: public.testing_events is missing (is 0005 applied?)';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'testing_registrar') then
    raise exception 'TEST SETUP: role testing_registrar is missing (is 0005 applied?)';
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

  -- Test classes, made by the admin through 0003's functions:
  --   tb  "B" (Worcester): Blue $70/$80, Red $70/$80 - final award None
  --   ta  "A" (Worcester): Yellow $65/$75, Orange, Green - final award = tb's Blue
  --   tc  "C" (Worcester): Purple - final award Not set
  --   ts  "S" (Shrewsbury): one rank - final award None
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_tb := (public.testing_add_class('worcester', v_tag || ' B', null, true) ->> 'id')::uuid;
  v_tb_blue := (public.testing_add_rank(v_tb, 'Blue', 7000, 8000, 9500, true, 'solid', 'blue', null, 0, 'yellow') ->> 'id')::uuid;
  v_tb_red  := (public.testing_add_rank(v_tb, 'Red', 7000, 8000, 9500, true, 'solid', 'red', null, 0, 'yellow') ->> 'id')::uuid;
  v_ta := (public.testing_add_class('worcester', v_tag || ' A', v_tb_blue, false) ->> 'id')::uuid;
  v_ta_yellow := (public.testing_add_rank(v_ta, 'Yellow', 6500, 7500, 8500, false, 'solid', 'yellow', null, 0, 'yellow') ->> 'id')::uuid;
  v_ta_orange := (public.testing_add_rank(v_ta, 'Orange', 6500, 7500, 8500, false, 'solid', 'orange', null, 0, 'yellow') ->> 'id')::uuid;
  v_ta_green  := (public.testing_add_rank(v_ta, 'Green', 6500, 7500, 8500, false, 'stripe', 'green', 'black', 1, 'yellow') ->> 'id')::uuid;
  v_tc := (public.testing_add_class('worcester', v_tag || ' C', null, false) ->> 'id')::uuid;
  v_tc_purple := (public.testing_add_rank(v_tc, 'Purple', 7000, 8000, 9500, true, 'solid', 'purple', null, 0, 'yellow') ->> 'id')::uuid;
  v_ts_cls := (public.testing_add_class('shrewsbury', v_tag || ' S', null, true) ->> 'id')::uuid;
  v_ts_rank := (public.testing_add_rank(v_ts_cls, 'White', 6500, 7500, 8500, false, 'solid', 'white', null, 0, 'yellow') ->> 'id')::uuid;
  if v_tb_red is null or v_ta_green is null or v_tc_purple is null or v_ts_rank is null then
    raise exception 'TEST SETUP: could not create the test classes and ranks';
  end if;
  reset role;

  -- ===================================================================
  -- T1. Who may call what
  -- ===================================================================

  -- The 15 staff functions, with harmless arguments (index matters:
  -- v_admin_only lists the admin-only ones).
  v_calls := array[
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, null)', 'worcester', v_tag || ' gate', v_today, '[]'),
    format('public.testing_update_event(%L::uuid, 1, %L, %L::date, %L::jsonb, null, null)', v_rand, 'x', v_today, '[]'),
    format('public.testing_set_registration(%L::uuid, 1, true)', v_rand),
    format('public.testing_delete_event(%L::uuid, 1, 0, 0)', v_rand),
    format('public.testing_add_student(%L::uuid, %L, %L, %L::uuid, true, %L)', v_rand, 'Ann', 'Lee', v_rand2, 'cash'),
    format('public.testing_update_student(%L::uuid, 1, %L, %L, %L::uuid)', v_rand, 'Ann', 'Lee', v_rand2),
    format('public.testing_change_paying_by(%L::uuid, 1, %L)', v_rand, 'cash'),
    format('public.testing_mark_paid(%L::uuid, 1)', v_rand),
    format('public.testing_undo_payment(%L::uuid)', v_rand),
    format('public.testing_edit_payment(%L::uuid, %L, 100, %L::date)', v_rand, 'cash', v_today),
    format('public.testing_resolve_duplicate(%L::uuid, 1, %L::uuid, 1, true)', v_rand, v_rand2),
    format('public.testing_withdraw_student(%L::uuid, 1)', v_rand),
    format('public.testing_restore_student(%L::uuid, 1)', v_rand),
    format('public.testing_delete_student(%L::uuid, 1, %L::uuid[])', v_rand, '{}'),
    format('public.settings_update_school_address(%L, 1, null, null, null, null)', 'worcester')];

  -- T1a. anon: no staff function, no public function, no table, no view
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  for v_i in 1 .. cardinality(v_calls) loop
    begin
      execute 'select ' || v_calls[v_i];
      raise exception 'TEST FAILED: T1a anon could call %', v_calls[v_i];
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin perform public.testing_public_event('abcdefgh');
        raise exception 'TEST FAILED: T1a anon could call testing_public_event'; exception when insufficient_privilege then null; end;
  begin perform public.testing_public_register('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', gen_random_uuid(), 'cash', true, v_sig, v_ack);
        raise exception 'TEST FAILED: T1a anon could call testing_public_register'; exception when insufficient_privilege then null; end;
  foreach v_tbl in array v_new_tables || array['testing_roster'] loop
    begin
      execute format('select 1 from public.%I limit 1', v_tbl);
      raise exception 'TEST FAILED: T1a anon could read %', v_tbl;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;

  -- T1b. a signed-in, unlocked admin (A1) can't call the two public
  --      functions, can't write any table directly, can't read the
  --      signature, the submission id, recorded_by or the attempts
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin perform public.testing_public_event('abcdefgh');
        raise exception 'TEST FAILED: T1b authenticated could call testing_public_event'; exception when insufficient_privilege then null; end;
  begin perform public.testing_public_register('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', gen_random_uuid(), 'cash', true, v_sig, v_ack);
        raise exception 'TEST FAILED: T1b authenticated could call testing_public_register'; exception when insufficient_privilege then null; end;
  begin perform r.signature from public.testing_registrations r;
        raise exception 'TEST FAILED: T1b/T7 authenticated could read testing_registrations.signature'; exception when insufficient_privilege then null; end;
  begin perform r.submission_id from public.testing_registrations r;
        raise exception 'TEST FAILED: T1b authenticated could read testing_registrations.submission_id'; exception when insufficient_privilege then null; end;
  begin perform * from public.testing_registrations;
        raise exception 'TEST FAILED: T1b authenticated could select * from testing_registrations'; exception when insufficient_privilege then null; end;
  begin perform r.withdrawn_by from public.testing_registrations r;
        raise exception 'TEST FAILED: T1b authenticated could read testing_registrations.withdrawn_by'; exception when insufficient_privilege then null; end;
  begin perform p.recorded_by from public.testing_payments p;
        raise exception 'TEST FAILED: T1b authenticated could read testing_payments.recorded_by'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.testing_public_attempts;
        raise exception 'TEST FAILED: T1b authenticated could read testing_public_attempts'; exception when insufficient_privilege then null; end;
  begin insert into public.testing_events (location_code, name, testing_date, public_code, created_by_name, updated_by_name)
        values ('worcester', v_tag || ' direct', v_today, 'abcdefgh', 'x', 'x');
        raise exception 'TEST FAILED: T1b A1 could insert into testing_events'; exception when insufficient_privilege then null; end;
  begin update public.testing_registrations set first_name = first_name;
        raise exception 'TEST FAILED: T1b A1 could update testing_registrations'; exception when insufficient_privilege then null; end;
  begin delete from public.testing_payments where id = v_rand;
        raise exception 'TEST FAILED: T1b A1 could delete from testing_payments'; exception when insufficient_privilege then null; end;
  begin update public.locations set address_city = 'x';
        raise exception 'TEST FAILED: T1b A1 could update locations'; exception when insufficient_privilege then null; end;
  begin perform public.testing_purge_old_signatures();
        raise exception 'TEST FAILED: T1b A1 could call testing_purge_old_signatures'; exception when insufficient_privilege then null; end;
  begin perform public.testing_today();
        raise exception 'TEST FAILED: T1b A1 could call the helper testing_today'; exception when insufficient_privilege then null; end;

  -- T1c. sessions without data access get no_access from EVERY staff
  --      function (A2 locked, A3 5 wrong PINs, A4 signed out, A5 8 days,
  --      A6 magic link, D2 locked, D3 magic link)
  v_list := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d2, v_c_d3];
  for v_n in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_n], true);
    for v_i in 1 .. cardinality(v_calls) loop
      execute 'select ' || v_calls[v_i] into v_r;
      if v_r ->> 'status' is distinct from 'no_access' then
        raise exception 'TEST FAILED: T1c session % of (A2,A3,A4,A5,A6,D2,D3) got % from %', v_n, v_r, v_calls[v_i];
      end if;
    end loop;
  end loop;

  -- T1d. the front desk (role staff) gets not_allowed from every
  --      admin-only function (the role is checked before anything else)
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_i in array v_admin_only loop
    execute 'select ' || v_calls[v_i] into v_r;
    if v_r ->> 'status' is distinct from 'not_allowed' then
      raise exception 'TEST FAILED: T1d desk got % from admin-only %', v_r, v_calls[v_i];
    end if;
  end loop;
  -- restore is the exception: staff get past the role check (their own
  -- keep-one Undo, T8b), so an unknown id answers not_found
  execute 'select ' || v_calls[13] into v_r;
  if v_r ->> 'status' is distinct from 'not_found' then
    raise exception 'TEST FAILED: T1d desk restore of an unknown id expected not_found, got %', v_r;
  end if;
  reset role;

  -- ===================================================================
  -- T2. The restricted login testing_registrar (catalog proofs - they
  --     hold on Supabase, where PUBLIC keeps Supabase's default rights in
  --     Supabase's own schemas)
  -- ===================================================================
  select r.oid into v_reg_oid from pg_roles r where r.rolname = 'testing_registrar';

  -- T2a. in schema public it may run exactly the two public functions
  for v_fn in
    select p.oid, p.proname::text as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    if has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_public_fns)) then
      raise exception 'TEST FAILED: T2a testing_registrar execute on % is %, expected %',
        v_fn.oid::regprocedure, has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE'), (v_fn.name = any (v_public_fns));
    end if;
  end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_public_fns);
  if v_n <> 2 then raise exception 'TEST FAILED: T2a expected exactly 2 public functions (no extra versions), found %', v_n; end if;

  -- T2b. no function of ours in public (0001-0005; extension members
  --      excluded) is executable by PUBLIC (= every role)
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE');
  if v_txt is not null then raise exception 'TEST FAILED: T2b function(s) executable by PUBLIC: %', v_txt; end if;

  -- T2c. no right on any table, view or sequence: (1) nothing granted to
  --      the registrar by name anywhere (tables or columns); (2) in every
  --      schema it can reach (USAGE), no table / column / sequence right
  --      at all, PUBLIC's included. pg_catalog and information_schema are
  --      the system's own and left out.
  select string_agg(c.oid::regclass::text, ', ') into v_txt
    from pg_class c
   where exists (select 1 from aclexplode(c.relacl) as a where a.grantee = v_reg_oid)
      or exists (select 1 from pg_attribute t, aclexplode(t.attacl) as a
                  where t.attrelid = c.oid and a.grantee = v_reg_oid);
  if v_txt is not null then raise exception 'TEST FAILED: T2c rights granted to testing_registrar on: %', v_txt; end if;
  select string_agg(c.oid::regclass::text, ', ') into v_txt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
     and has_schema_privilege('testing_registrar', n.oid, 'USAGE')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('testing_registrar', c.oid, 'USAGE, SELECT, UPDATE')
               else has_table_privilege('testing_registrar', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                    or has_any_column_privilege('testing_registrar', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
          end);
  if v_txt is not null then raise exception 'TEST FAILED: T2c testing_registrar has rights on: %', v_txt; end if;

  -- T2d. it can't create anything in any schema, nor in the database
  select string_agg(n.nspname, ', ') into v_txt
    from pg_namespace n where has_schema_privilege('testing_registrar', n.oid, 'CREATE');
  if v_txt is not null then raise exception 'TEST FAILED: T2d testing_registrar can CREATE in schema(s): %', v_txt; end if;
  if has_database_privilege('testing_registrar', current_database(), 'CREATE') then
    raise exception 'TEST FAILED: T2d testing_registrar can CREATE in the database';
  end if;

  -- T2e. memberships: Supabase's API login (authenticator) and the API
  --      roles can never become it; it is a member of no role; the only
  --      member it may have is the role that created it (the owner of the
  --      0005 tables - PostgreSQL 16+ adds that link automatically)
  if exists (select 1 from pg_roles where rolname = 'authenticator')
     and pg_has_role('authenticator', 'testing_registrar', 'MEMBER') then
    raise exception 'TEST FAILED: T2e authenticator can become testing_registrar';
  end if;
  foreach v_txt in array array['anon', 'authenticated', 'service_role'] loop
    if pg_has_role(v_txt, 'testing_registrar', 'MEMBER') then
      raise exception 'TEST FAILED: T2e % can become testing_registrar', v_txt;
    end if;
  end loop;
  if exists (select 1 from pg_auth_members m where m.member = v_reg_oid) then
    raise exception 'TEST FAILED: T2e testing_registrar is a member of another role';
  end if;
  select c.relowner into v_owner from pg_class c where c.oid = 'public.testing_events'::regclass;
  if exists (select 1 from pg_auth_members m where m.roleid = v_reg_oid and m.member <> v_owner) then
    raise exception 'TEST FAILED: T2e a role other than the tables'' owner is a member of testing_registrar';
  end if;

  -- T2f. its attributes and settings (contract §1.10)
  if not exists (select 1 from pg_roles r
                  where r.rolname = 'testing_registrar'
                    and r.rolcanlogin and not r.rolinherit and not r.rolcreatedb and not r.rolcreaterole
                    and not r.rolbypassrls and not r.rolreplication and not r.rolsuper
                    and r.rolconnlimit = 5) then
    raise exception 'TEST FAILED: T2f testing_registrar attributes are not login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5';
  end if;
  select array_to_string(s.setconfig, ',') into v_txt
    from pg_db_role_setting s where s.setrole = v_reg_oid and s.setdatabase = 0;
  if v_txt is null
     or position('statement_timeout=5s' in v_txt) = 0
     or position('idle_in_transaction_session_timeout=10s' in v_txt) = 0
     or position('search_path=""' in v_txt) = 0 then
    raise exception 'TEST FAILED: T2f testing_registrar settings are %', v_txt;
  end if;

  -- T2g. one owner for every 0005 function and table (0003 C3h lesson:
  --      table rules run helpers as the writer, i.e. the functions' owner)
  select count(distinct o) into v_n from (
    select p.proowner as o from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
    union all
    select c.relowner from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any (v_new_tables || array['testing_roster', 'locations'])) x;
  if v_n <> 1 then raise exception 'TEST FAILED: T2g 0005 functions and tables have % different owners, expected 1', v_n; end if;

  -- ===================================================================
  -- T3. Add / Edit event and the copy rule
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- T3a. add an event with classes A (5-6 PM) and B (6-7 PM), closed
  v_r := public.testing_add_event('worcester', v_tag || '   Event  One ', v_today + 10,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'),
                             jsonb_build_object('class_id', v_tb, 'start_time', '18:00', 'end_time', '19:00')),
           false, v_today + 3, E'  Bring water.\r\nArrive early.  ');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int is distinct from 1
     or (v_r ->> 'public_code') !~ '^[a-hjkmnp-z2-9]{8}$'
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['id', 'public_code', 'status', 'version'] then
    raise exception 'TEST FAILED: T3a add_event expected {status ok, id, public_code, version 1}, got %', v_r;
  end if;
  v_e1 := (v_r ->> 'id')::uuid;
  v_e1_code := v_r ->> 'public_code';
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: T3a tags not cleared after add_event';
  end if;
  reset role;

  select * into v_ev_row from public.testing_events e where e.id = v_e1;
  if v_ev_row.name <> v_tag || ' Event One' or v_ev_row.registration_open or v_ev_row.first_opened_at is not null
     or v_ev_row.note <> E'Bring water.\nArrive early.' or v_ev_row.created_by is distinct from v_admin then
    raise exception 'TEST FAILED: T3a stored event wrong: %', to_jsonb(v_ev_row);
  end if;
  select k.id into v_k_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_e1 and c.class_id = v_ta and k.rank_id = v_ta_yellow;
  select k.id into v_k_green from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_e1 and c.class_id = v_ta and k.rank_id = v_ta_green;
  select k.id into v_k_blue from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_e1 and c.class_id = v_tb and k.rank_id = v_tb_blue;
  select k.id into v_k_red from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_e1 and c.class_id = v_tb and k.rank_id = v_tb_red;
  if v_k_yellow is null or v_k_green is null or v_k_blue is null or v_k_red is null then
    raise exception 'TEST FAILED: T3a the event copy is missing ranks';
  end if;
  -- the copy equals Classes and ranks at this moment
  if exists (select 1 from public.testing_event_ranks k join public.testing_ranks r on r.id = k.rank_id
              join public.testing_event_classes c on c.id = k.event_class_id
              where c.event_id = v_e1
                and (k.name, k.position, k.early_cents, k.day_cents, k.private_cents, k.sparring_gear, k.belt_pattern,
                     k.belt_color, k.belt_color_2, k.belt_end_stripes, k.belt_end_stripe_color)
                    is distinct from
                    (r.name, r.position, r.early_cents, r.day_cents, r.private_cents, r.sparring_gear, r.belt_pattern,
                     r.belt_color, r.belt_color_2, r.belt_end_stripes, r.belt_end_stripe_color))
     or (select count(*) from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
          where c.event_id = v_e1) <> 5 then
    raise exception 'TEST FAILED: T3a event ranks are not an exact copy';
  end if;
  if not exists (select 1 from public.testing_event_classes c
                  where c.event_id = v_e1 and c.class_id = v_ta and c.class_name = v_tag || ' A'
                    and c.start_time = '17:00' and c.end_time = '18:00'
                    and c.final_award_kind = 'rank' and c.final_award_name = 'Blue' and c.fa_belt_color = 'blue')
     or not exists (select 1 from public.testing_event_classes c
                     where c.event_id = v_e1 and c.class_id = v_tb and c.final_award_kind = 'none'
                       and c.final_award_name is null and c.fa_belt_pattern is null) then
    raise exception 'TEST FAILED: T3a class copy (name, times, final award) wrong';
  end if;

  -- T3b. later changes in Classes and ranks leave the event alone
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_rank(v_ta_yellow, 1, 'Yellow belt', 9900, 9900, 9900, true, 'solid', 'yellow', null, 2, 'black');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: T3b update_rank setup %', v_r; end if;
  v_r := public.testing_update_class(v_ta, 1, v_tag || ' A renamed', v_tb_blue, false);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: T3b update_class setup %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_event_ranks k
                  where k.id = v_k_yellow and k.name = 'Yellow' and k.early_cents = 6500 and k.day_cents = 7500
                    and not k.sparring_gear and k.belt_end_stripes = 0)
     or not exists (select 1 from public.testing_event_classes c where c.event_id = v_e1 and c.class_id = v_ta
                     and c.class_name = v_tag || ' A') then
    raise exception 'TEST FAILED: T3b the event copy changed after Classes and ranks changed';
  end if;

  -- T3c. a class whose final award is Not set can't be added (Add / Edit)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_event('worcester', v_tag || ' Event Not set', v_today + 10,
           jsonb_build_array(jsonb_build_object('class_id', v_tc, 'start_time', '17:00', 'end_time', '18:00')),
           false, null, null);
  if v_r is distinct from jsonb_build_object('status', 'final_award_not_set', 'class_name', v_tag || ' C') then
    raise exception 'TEST FAILED: T3c add_event with a Not set class expected final_award_not_set + class name, got %', v_r;
  end if;
  if exists (select 1 from public.testing_events e where e.name = v_tag || ' Event Not set') then
    raise exception 'TEST FAILED: T3c a refused add_event still created the event';
  end if;
  v_r := public.testing_update_event(v_e1, 1, v_tag || ' Event One', v_today + 10,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'),
                             jsonb_build_object('class_id', v_tb, 'start_time', '18:00', 'end_time', '19:00'),
                             jsonb_build_object('class_id', v_tc, 'start_time', '19:00', 'end_time', '20:00')),
           v_today + 3, E'Bring water.\nArrive early.');
  if v_r ->> 'status' is distinct from 'final_award_not_set' or v_r ->> 'class_name' is distinct from v_tag || ' C' then
    raise exception 'TEST FAILED: T3c update_event adding a Not set class expected final_award_not_set, got %', v_r;
  end if;

  -- T3d. set C's award to None and change its price; adding it NOW copies
  --      the values of this moment
  v_r := public.testing_update_class(v_tc, 1, v_tag || ' C', null, true);
  v_r2 := public.testing_update_rank(v_tc_purple, 1, 'Purple', 7100, 8100, 9500, true, 'solid', 'purple', null, 0, 'yellow');
  if v_r ->> 'status' <> 'ok' or v_r2 ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T3d setup % %', v_r, v_r2; end if;
  v_r := public.testing_update_event(v_e1, 1, v_tag || ' Event One', v_today + 10,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'),
                             jsonb_build_object('class_id', v_tb, 'start_time', '18:00', 'end_time', '19:00'),
                             jsonb_build_object('class_id', v_tc, 'start_time', '19:00', 'end_time', '20:00')),
           v_today + 3, E'Bring water.\nArrive early.');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2) then
    raise exception 'TEST FAILED: T3d update_event adding class C expected {ok, version 2}, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
                  where c.event_id = v_e1 and c.class_id = v_tc and c.final_award_kind = 'none'
                    and k.rank_id = v_tc_purple and k.early_cents = 7100 and k.day_cents = 8100) then
    raise exception 'TEST FAILED: T3d class C was not copied with its current values';
  end if;

  -- T3e. Add / Edit event input rules
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_list := array[
    -- date in the past
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, null)', 'worcester', v_tag || ' bad', v_today - 1,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'))),
    -- closing date after the testing date
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, %L::date, null)', 'worcester', v_tag || ' bad', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), v_today + 6),
    -- closing date before today
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, %L::date, null)', 'worcester', v_tag || ' bad', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), v_today - 1),
    -- no classes
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, null)', 'worcester', v_tag || ' bad', v_today + 5, '[]'),
    -- end not after start
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, null)', 'worcester', v_tag || ' bad', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '18:00', 'end_time', '18:00'))),
    -- bad time text
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, null)', 'worcester', v_tag || ' bad', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '5pm', 'end_time', '18:00'))),
    -- not a uuid
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, null)', 'worcester', v_tag || ' bad', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', 'nope', 'start_time', '17:00', 'end_time', '18:00'))),
    -- the same class twice
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, null)', 'worcester', v_tag || ' bad', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'),
                             jsonb_build_object('class_id', v_ta, 'start_time', '18:00', 'end_time', '19:00'))),
    -- a class of the OTHER school
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, null)', 'worcester', v_tag || ' bad', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ts_cls, 'start_time', '17:00', 'end_time', '18:00'))),
    -- note too long
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, %L)', 'worcester', v_tag || ' bad', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), repeat('n', 601)),
    -- empty name, "Both", NULL switch
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, null)', 'worcester', '   ', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'))),
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, false, null, null)', 'both', v_tag || ' bad', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'))),
    format('public.testing_add_event(%L, %L, %L::date, %L::jsonb, null, null, null)', 'worcester', v_tag || ' bad', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')))];
  for v_i in 1 .. cardinality(v_list) loop
    execute 'select ' || v_list[v_i] into v_r;
    if v_r ->> 'status' is distinct from 'invalid' then
      raise exception 'TEST FAILED: T3e case % expected invalid, got % (%)', v_i, v_r, v_list[v_i];
    end if;
  end loop;
  -- a class that no longer exists -> stale (the dialog is out of date)
  v_r := public.testing_add_event('worcester', v_tag || ' gone class', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_rand, 'start_time', '17:00', 'end_time', '18:00')), false, null, null);
  if v_r ->> 'status' is distinct from 'stale' then raise exception 'TEST FAILED: T3e unknown class expected stale, got %', v_r; end if;
  -- the same name (capitals and spaces ignored) -> duplicate_name
  v_r := public.testing_add_event('worcester', upper(v_tag) || '  EVENT one', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), false, null, null);
  if v_r ->> 'status' is distinct from 'duplicate_name' then raise exception 'TEST FAILED: T3e same name expected duplicate_name, got %', v_r; end if;
  -- ... but the same name in the other school is fine
  v_r := public.testing_add_event('shrewsbury', v_tag || ' Event One', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ts_cls, 'start_time', '17:00', 'end_time', '18:00')), true, null, null);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: T3e same name in Shrewsbury expected ok, got %', v_r; end if;
  v_e3 := (v_r ->> 'id')::uuid;
  -- registration_open true at creation also sets first_opened_at
  if not exists (select 1 from public.testing_events e where e.id = v_e3 and e.registration_open and e.first_opened_at is not null) then
    raise exception 'TEST FAILED: T3e opened at creation must set first_opened_at';
  end if;
  -- Edit: stale version; past date refused; times change always OK;
  -- unchanged values write nothing
  v_r := public.testing_update_event(v_e1, 1, v_tag || ' Event One', v_today + 10,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), null, null);
  if v_r ->> 'status' is distinct from 'stale' then raise exception 'TEST FAILED: T3e update_event old version expected stale, got %', v_r; end if;
  v_r := public.testing_update_event(v_e1, 2, v_tag || ' Event One', v_today - 1,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), null, null);
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: T3e update_event to a past date expected invalid, got %', v_r; end if;
  reset role;
  select count(*) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_event(v_e1, 2, v_tag || ' Event One', v_today + 10,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'),
                             jsonb_build_object('class_id', v_tb, 'start_time', '18:00', 'end_time', '19:00'),
                             jsonb_build_object('class_id', v_tc, 'start_time', '19:00', 'end_time', '20:00')),
           v_today + 3, E'Bring water.\nArrive early.');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2) then
    raise exception 'TEST FAILED: T3e unchanged update_event expected {ok, version 2}, got %', v_r;
  end if;
  reset role;
  if (select count(*) from public.change_log) <> v_mark then
    raise exception 'TEST FAILED: T3e unchanged update_event wrote history rows';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_event(v_e1, 2, v_tag || ' Event One', v_today + 10,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '16:30', 'end_time', '17:30'),
                             jsonb_build_object('class_id', v_tb, 'start_time', '18:00', 'end_time', '19:00'),
                             jsonb_build_object('class_id', v_tc, 'start_time', '19:00', 'end_time', '20:00')),
           v_today + 3, E'Bring water.\nArrive early.');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 3) then
    raise exception 'TEST FAILED: T3e times-only update_event expected {ok, version 3}, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_event_classes c where c.event_id = v_e1 and c.class_id = v_ta
                  and c.start_time = '16:30' and c.end_time = '17:30') then
    raise exception 'TEST FAILED: T3e class times not updated';
  end if;
  -- the copy tables refuse changes other than the times, even directly
  begin
    update public.testing_event_ranks set early_cents = 100 where id = v_k_yellow;
    raise exception 'TEST FAILED: T3e an event rank copy could be changed';
  exception when check_violation then null;
  end;
  begin
    update public.testing_event_classes set class_name = 'x' where event_id = v_e1 and class_id = v_ta;
    raise exception 'TEST FAILED: T3e an event class copy name could be changed';
  exception when check_violation then null;
  end;
  begin
    update public.testing_events set public_code = 'zzzzzzzz' where id = v_e1;
    raise exception 'TEST FAILED: T3e public_code could be changed';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- T4. The event state
  -- ===================================================================

  -- T4a. the pure rule, with the same table of cases as checks.mjs
  --      (testing date Fri 2026-11-20, closing date 2026-11-13)
  v_ev_row.testing_date := '2026-11-20'; v_ev_row.auto_close_on := '2026-11-13';
  v_ev_row.registration_open := true; v_ev_row.first_opened_at := '2026-10-20 10:00-04';
  if public.testing_event_state(v_ev_row, '2026-11-13') <> 'open'
     or public.testing_event_state(v_ev_row, '2026-11-14') <> 'closed_by_date'
     or public.testing_event_state(v_ev_row, '2026-11-20') <> 'closed_by_date'
     or public.testing_event_state(v_ev_row, '2026-11-21') <> 'finished' then
    raise exception 'TEST FAILED: T4a open with closing date cases';
  end if;
  v_ev_row.auto_close_on := null;
  if public.testing_event_state(v_ev_row, '2026-11-20') <> 'open'
     or public.testing_event_state(v_ev_row, '2026-11-21') <> 'finished' then
    raise exception 'TEST FAILED: T4a open without closing date (incl. the testing day) cases';
  end if;
  v_ev_row.registration_open := false;
  if public.testing_event_state(v_ev_row, '2026-11-10') <> 'closed' then
    raise exception 'TEST FAILED: T4a closed by hand case';
  end if;
  v_ev_row.first_opened_at := null; v_ev_row.auto_close_on := '2026-11-13';
  if public.testing_event_state(v_ev_row, '2026-11-10') <> 'not_open_yet'
     or public.testing_event_state(v_ev_row, '2026-11-15') <> 'not_open_yet'
     or public.testing_event_state(v_ev_row, '2026-11-21') <> 'finished' then
    raise exception 'TEST FAILED: T4a never-opened cases';
  end if;

  -- T4b. minute boundaries in America/New_York (EST in November, EDT in
  --      October): 11:59:59 PM is still that day, 12:00:00 AM the next
  if public.testing_school_date('2026-11-13 23:59:59-05') <> '2026-11-13'
     or public.testing_school_date('2026-11-14 00:00:00-05') <> '2026-11-14'
     or public.testing_school_date('2026-11-14 04:59:59+00') <> '2026-11-13'
     or public.testing_school_date('2026-11-14 05:00:00+00') <> '2026-11-14'
     or public.testing_school_date('2026-10-21 03:59:59+00') <> '2026-10-20'
     or public.testing_school_date('2026-10-21 04:00:00+00') <> '2026-10-21' then
    raise exception 'TEST FAILED: T4b school date at the minute boundaries';
  end if;
  v_ev_row.registration_open := true; v_ev_row.first_opened_at := '2026-10-20 10:00-04';
  if public.testing_event_state(v_ev_row, public.testing_school_date('2026-11-14 04:59:59+00')) <> 'open'
     or public.testing_event_state(v_ev_row, public.testing_school_date('2026-11-14 05:00:00+00')) <> 'closed_by_date' then
    raise exception 'TEST FAILED: T4b the closing date ends at 11:59:59 PM Massachusetts time';
  end if;
  v_ev_row.auto_close_on := null;
  if public.testing_event_state(v_ev_row, public.testing_school_date('2026-11-21 04:59:59+00')) <> 'open'
     or public.testing_event_state(v_ev_row, public.testing_school_date('2026-11-21 05:00:00+00')) <> 'finished' then
    raise exception 'TEST FAILED: T4b the testing day ends at 11:59:59 PM Massachusetts time';
  end if;
  -- the fee: early before the testing day, testing-day price on it
  if public.testing_fee_cents(6500, 7500, public.testing_school_date('2026-11-20 04:59:59+00'), '2026-11-20') <> 6500
     or public.testing_fee_cents(6500, 7500, public.testing_school_date('2026-11-20 05:00:00+00'), '2026-11-20') <> 7500
     or public.testing_fee_cents(6500, 7500, '2026-11-21', '2026-11-20') <> 7500 then
    raise exception 'TEST FAILED: T4b fee by date';
  end if;
  if public.testing_today() <> (now() at time zone 'America/New_York')::date then
    raise exception 'TEST FAILED: T4b testing_today is not the Massachusetts date';
  end if;

  -- T4c. the switch, live. E1: testing in 10 days, closing in 3, never opened
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_registration(v_e1, 2, true);
  if v_r ->> 'status' is distinct from 'stale' then raise exception 'TEST FAILED: T4c old version expected stale, got %', v_r; end if;
  v_r := public.testing_set_registration(v_e1, 3, true);           -- staff opens before the closing date
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 4, 'state', 'open') then
    raise exception 'TEST FAILED: T4c staff open expected {ok, 4, open}, got %', v_r;
  end if;
  v_r := public.testing_set_registration(v_e1, 4, false);          -- staff closes
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 5, 'state', 'closed') then
    raise exception 'TEST FAILED: T4c staff close expected {ok, 5, closed}, got %', v_r;
  end if;
  v_r := public.testing_set_registration(v_e1, 5, false);          -- already closed: nothing written
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 5, 'state', 'closed') then
    raise exception 'TEST FAILED: T4c closing a closed event expected {ok, 5, closed}, got %', v_r;
  end if;
  reset role;
  select e.first_opened_at into v_ts from public.testing_events e where e.id = v_e1;
  if v_ts is null then raise exception 'TEST FAILED: T4c first_opened_at not set by the first opening'; end if;
  -- the closing date passes (moved by hand here): staff can't reopen,
  -- an admin can and the closing date goes
  update public.testing_events set auto_close_on = v_today - 1 where id = v_e1;
  select e.version into v_v from public.testing_events e where e.id = v_e1;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_registration(v_e1, v_v, true);
  if v_r ->> 'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: T4c staff reopen after the closing date expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_set_registration(v_e1, v_v, true);
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'state' is distinct from 'open' then
    raise exception 'TEST FAILED: T4c admin reopen after the closing date expected ok/open, got %', v_r;
  end if;
  reset role;
  if (select e.auto_close_on from public.testing_events e where e.id = v_e1) is not null
     or (select e.first_opened_at from public.testing_events e where e.id = v_e1) <> v_ts then
    raise exception 'TEST FAILED: T4c admin reopen must clear the closing date and keep first_opened_at';
  end if;
  -- switched on but past its closing date = closed_by_date: staff may
  -- still CLOSE it
  update public.testing_events set auto_close_on = v_today - 1 where id = v_e1;
  select e.version into v_v from public.testing_events e where e.id = v_e1;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_registration(v_e1, v_v, false);
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'state' is distinct from 'closed' then
    raise exception 'TEST FAILED: T4c staff close from closed_by_date expected ok/closed, got %', v_r;
  end if;
  -- an event never opened whose closing date passed: admins only
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_event('worcester', v_tag || ' Event Two', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), false, v_today, null);
  v_e2 := (v_r ->> 'id')::uuid;
  reset role;
  update public.testing_events set auto_close_on = v_today - 1 where id = v_e2;
  select * into v_ev_row from public.testing_events e where e.id = v_e2;
  if public.testing_event_state(v_ev_row, v_today) <> 'not_open_yet' then
    raise exception 'TEST FAILED: T4c never-opened event past its closing date should be not_open_yet';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_set_registration(v_e2, v_ev_row.version, true);
  if v_r ->> 'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: T4c staff open of a never-opened past-date event expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_set_registration(v_e2, v_ev_row.version, true);
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'state' is distinct from 'open' then
    raise exception 'TEST FAILED: T4c admin open of a never-opened past-date event expected ok/open, got %', v_r;
  end if;
  reset role;
  -- the testing day itself: still open (families can register that day)
  update public.testing_events set auto_close_on = null, testing_date = v_today where id = v_e2;
  select * into v_ev_row from public.testing_events e where e.id = v_e2;
  if public.testing_event_state(v_ev_row, v_today) <> 'open' then
    raise exception 'TEST FAILED: T4c an open event on its testing day should be open';
  end if;
  -- finished: nothing changes the switch, for staff or admins
  update public.testing_events set testing_date = v_today - 1 where id = v_e2;
  select e.version into v_v from public.testing_events e where e.id = v_e2;
  set local role authenticated;
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_r := public.testing_set_registration(v_e2, v_v, false);
    if v_r ->> 'status' is distinct from 'finished' then raise exception 'TEST FAILED: T4c switch on a finished event expected finished, got %', v_r; end if;
  end loop;
  reset role;

  -- ===================================================================
  -- T5. The family form (called as the SQL Editor's role; the functions
  --     run as their owner either way)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_event('worcester', v_tag || ' Public', v_today + 10,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'),
                             jsonb_build_object('class_id', v_tb, 'start_time', '18:00', 'end_time', '19:00')),
           true, v_today + 3, 'Bring water.');
  v_ep := (v_r ->> 'id')::uuid; v_ep_code := v_r ->> 'public_code';
  v_r := public.testing_add_event('worcester', v_tag || ' Public 2', v_today + 10,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), true, null, null);
  v_ep2 := (v_r ->> 'id')::uuid; v_ep2_code := v_r ->> 'public_code';
  reset role;
  select k.id into v_k_orange from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ep and c.class_id = v_ta and k.rank_id = v_ta_orange;
  select k.id into v_k_green from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ep and c.class_id = v_ta and k.rank_id = v_ta_green;
  select k.id into v_k_red from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ep and c.class_id = v_tb and k.rank_id = v_tb_red;
  select k.id into v_k_other from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ep2 and k.rank_id = v_ta_orange;

  -- T5a. what the family page sees first
  v_r := public.testing_public_event(v_ep_code);
  if v_r ->> 'status' <> 'ok' or v_r ->> 'state' <> 'open' or v_r -> 'closed_on' <> 'null'::jsonb
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['classes', 'closed_on', 'event', 'state', 'status']
     or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'event') as k)
        <> array['address', 'auto_close_on', 'name', 'note', 'school_name', 'testing_date']
     or v_r -> 'event' ->> 'school_name' <> 'Worcester'
     or jsonb_array_length(v_r -> 'classes') <> 2
     or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'classes' -> 0) as k) <> array['class_name', 'end_time', 'ranks', 'start_time']
     or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'classes' -> 0 -> 'ranks' -> 0) as k)
        <> array['belt_color', 'belt_color_2', 'belt_end_stripe_color', 'belt_end_stripes', 'belt_pattern', 'day_cents',
                 'early_cents', 'event_rank_id', 'name', 'sparring_gear', 'testing_for'] then
    raise exception 'TEST FAILED: T5a testing_public_event shape: %', v_r;
  end if;
  -- testing for: Green (last of A) -> A's final award Blue; Red (last of B, None) -> null
  if (select x.value -> 'testing_for' ->> 'name'
        from jsonb_array_elements(v_r -> 'classes') as c(value), jsonb_array_elements(c.value -> 'ranks') as x(value)
       where (x.value ->> 'event_rank_id')::uuid = v_k_green) is distinct from 'Blue'
     or (select x.value -> 'testing_for'
           from jsonb_array_elements(v_r -> 'classes') as c(value), jsonb_array_elements(c.value -> 'ranks') as x(value)
          where (x.value ->> 'event_rank_id')::uuid = v_k_red) is distinct from 'null'::jsonb
     or (select x.value -> 'testing_for' ->> 'name'
           from jsonb_array_elements(v_r -> 'classes') as c(value), jsonb_array_elements(c.value -> 'ranks') as x(value)
          where (x.value ->> 'event_rank_id')::uuid = v_k_orange) is distinct from 'Green' then
    raise exception 'TEST FAILED: T5a testing_for wrong: %', v_r -> 'classes';
  end if;
  if public.testing_public_event('nonexist') is distinct from jsonb_build_object('status', 'not_found')
     or public.testing_public_event('ABCDEFGH') is distinct from jsonb_build_object('status', 'not_found')
     or public.testing_public_event(null) is distinct from jsonb_build_object('status', 'not_found') then
    raise exception 'TEST FAILED: T5a unknown / bad code expected not_found';
  end if;

  -- T5b. a registration: ok answer, the stored row, the history row
  v_key1 := v_tag || ' key1';
  select count(*) into v_n from public.testing_public_attempts;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  -- a pretend admin login token must NOT make it look like a staff entry
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_public_register(v_ep_code, v_key1, v_sub1, '  Mia ', 'Park', v_k_orange, 'cash', true, v_sig, v_ack);
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' <> 'ok' or v_r ->> 'reference' !~ '^CB-[0-9]{4,}$'
     or v_r ->> 'first_name' <> 'Mia' or v_r ->> 'class_name' <> v_tag || ' A renamed'
     or v_r -> 'testing_for' ->> 'name' <> 'Green' or v_r ->> 'start_time' <> '17:00' or v_r ->> 'end_time' <> '18:00'
     or (v_r ->> 'early_cents')::int <> 6500 or (v_r ->> 'day_cents')::int <> 7500 or v_r ->> 'paying_by' <> 'cash'
     or v_r ->> 'testing_date' <> (v_today + 10)::text or v_r ->> 'school_name' <> 'Worcester'
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k)
        <> array['address', 'class_name', 'day_cents', 'early_cents', 'end_time', 'first_name', 'last_name', 'paying_by',
                 'reference', 'school_name', 'start_time', 'status', 'testing_date', 'testing_for'] then
    raise exception 'TEST FAILED: T5b public_register ok answer: %', v_r;
  end if;
  select r.id into v_f1 from public.testing_registrations r where r.submission_id = v_sub1;
  if not exists (select 1 from public.testing_registrations r
                  where r.id = v_f1 and r.source = 'form' and r.signature = v_sig and r.signed_at is not null
                    and r.ack_version = v_ack and r.created_by is null and r.created_by_name = 'Family form'
                    and r.stripes_confirmed and r.status = 'active' and r.duplicate_state = 'none' and r.version = 1) then
    raise exception 'TEST FAILED: T5b stored registration wrong';
  end if;
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.table_name = 'testing_registrations' and l.record_id = v_f1
                    and l.op = 'insert' and l.actor_name = 'Family form' and l.actor_id is null
                    and l.action = 'public_register' and l.after ->> 'signature' = 'on file'
                    and not (l.after ? 'submission_id')) then
    raise exception 'TEST FAILED: T5b history row for the form registration ("Family form", signature on file, no submission_id)';
  end if;
  if (select count(*) from public.testing_public_attempts) <> v_n + 1
     or not exists (select 1 from public.testing_public_attempts a where a.client_key = v_key1 and a.outcome = 'ok' and a.event_id = v_ep) then
    raise exception 'TEST FAILED: T5b an ok call must write one attempts row (outcome ok)';
  end if;

  -- T5c. the same submission again = the same registration (no second row);
  --      the same submission id on ANOTHER event's code = invalid
  v_r2 := public.testing_public_register(v_ep_code, v_key1, v_sub1, 'Other', 'Name', v_k_red, 'check', true, v_sig, v_ack);
  if v_r2 is distinct from v_r then raise exception 'TEST FAILED: T5c repeat submission expected the same answer, got %', v_r2; end if;
  if (select count(*) from public.testing_registrations r where r.submission_id = v_sub1) <> 1 then
    raise exception 'TEST FAILED: T5c repeat submission made a second registration';
  end if;
  v_r2 := public.testing_public_register(v_ep2_code, v_key1, v_sub1, 'Mia', 'Park', v_k_other, 'cash', true, v_sig, v_ack);
  if v_r2 is distinct from jsonb_build_object('status', 'invalid') then
    raise exception 'TEST FAILED: T5c submission id of another event expected invalid only, got %', v_r2;
  end if;

  -- T5d. every input rule -> invalid (and nothing written)
  select count(*) into v_n2 from public.testing_registrations;
  v_list := array[
    format('public.testing_public_register(%L, %L, null, %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, v_key1, 'A', 'B', v_k_orange, 'cash', v_sig, v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, v_key1, ' ', 'B', v_k_orange, 'cash', v_sig, v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, v_key1, 'A', repeat('b', 61), v_k_orange, 'cash', v_sig, v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, v_key1, 'A', 'B', v_k_orange, 'card', v_sig, v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, false, %L, %L)', v_ep_code, v_key1, 'A', 'B', v_k_orange, 'cash', v_sig, v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, null, %L, %L)', v_ep_code, v_key1, 'A', 'B', v_k_orange, 'cash', v_sig, v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, v_key1, 'A', 'B', v_k_orange, 'cash', replace(v_sig, 'image/png', 'image/jpeg'), v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, v_key1, 'A', 'B', v_k_orange, 'cash', v_sig || '<script>', v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, v_key1, 'A', 'B', v_k_orange, 'cash', v_sig_long, v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, true, null, %L)', v_ep_code, v_key1, 'A', 'B', v_k_orange, 'cash', v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, v_key1, 'A', 'B', v_k_orange, 'cash', v_sig, 'cb-old'),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, v_key1, 'A', 'B', v_k_other, 'cash', v_sig, v_ack),
    format('public.testing_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, v_key1, 'A', 'B', v_rand, 'cash', v_sig, v_ack),
    format('public.testing_public_register(%L, null, gen_random_uuid(), %L, %L, %L::uuid, %L, true, %L, %L)', v_ep_code, 'A', 'B', v_k_orange, 'cash', v_sig, v_ack)];
  for v_i in 1 .. cardinality(v_list) loop
    execute 'select ' || v_list[v_i] into v_r2;
    if v_r2 is distinct from jsonb_build_object('status', 'invalid') then
      raise exception 'TEST FAILED: T5d case % expected invalid, got %', v_i, v_r2;
    end if;
  end loop;
  if (select count(*) from public.testing_registrations) <> v_n2 then
    raise exception 'TEST FAILED: T5d a refused call wrote a registration';
  end if;
  -- exactly 70 000 characters is still fine (checked on the pure rule)
  if not public.testing_signature_is_valid('data:image/png;base64,' || repeat('A', 70000 - 22))
     or public.testing_signature_is_valid('data:image/png;base64,') then
    raise exception 'TEST FAILED: T5d signature length boundary';
  end if;

  -- T5e. the refusals by event state (F10-F15)
  v_r2 := public.testing_public_register('nonexist', v_key1, gen_random_uuid(), 'A', 'B', v_k_orange, 'cash', true, v_sig, v_ack);
  if v_r2 is distinct from jsonb_build_object('status', 'not_found') then raise exception 'TEST FAILED: T5e unknown code expected not_found, got %', v_r2; end if;
  -- closed by the date: closed + the date
  update public.testing_events set auto_close_on = v_today - 1, testing_date = v_today + 10 where id = v_ep2;
  v_r2 := public.testing_public_register(v_ep2_code, v_key1, gen_random_uuid(), 'A', 'B', v_k_other, 'cash', true, v_sig, v_ack);
  if v_r2 is distinct from jsonb_build_object('status', 'closed', 'closed_on', v_today - 1) then
    raise exception 'TEST FAILED: T5e closed by date expected {closed, closed_on}, got %', v_r2;
  end if;
  if public.testing_public_event(v_ep2_code) ->> 'state' <> 'closed'
     or (public.testing_public_event(v_ep2_code) ->> 'closed_on')::date <> v_today - 1 then
    raise exception 'TEST FAILED: T5e public_event of a closed-by-date event';
  end if;
  -- closed by hand: closed, no date
  update public.testing_events set auto_close_on = null, registration_open = false where id = v_ep2;
  v_r2 := public.testing_public_register(v_ep2_code, v_key1, gen_random_uuid(), 'A', 'B', v_k_other, 'cash', true, v_sig, v_ack);
  if v_r2 is distinct from jsonb_build_object('status', 'closed', 'closed_on', null) then
    raise exception 'TEST FAILED: T5e closed by hand expected {closed, closed_on null}, got %', v_r2;
  end if;
  -- never opened: not_open
  update public.testing_events set first_opened_at = null where id = v_ep2;
  v_r2 := public.testing_public_register(v_ep2_code, v_key1, gen_random_uuid(), 'A', 'B', v_k_other, 'cash', true, v_sig, v_ack);
  if v_r2 is distinct from jsonb_build_object('status', 'not_open') then raise exception 'TEST FAILED: T5e never opened expected not_open, got %', v_r2; end if;
  if public.testing_public_event(v_ep2_code) ->> 'state' <> 'not_open' then raise exception 'TEST FAILED: T5e public_event not_open'; end if;
  -- finished (whatever the switch says)
  update public.testing_events set registration_open = true, first_opened_at = now(), testing_date = v_today - 1 where id = v_ep2;
  v_r2 := public.testing_public_register(v_ep2_code, v_key1, gen_random_uuid(), 'A', 'B', v_k_other, 'cash', true, v_sig, v_ack);
  if v_r2 is distinct from jsonb_build_object('status', 'finished') then raise exception 'TEST FAILED: T5e finished expected finished, got %', v_r2; end if;
  if public.testing_public_event(v_ep2_code) ->> 'state' <> 'finished' then raise exception 'TEST FAILED: T5e public_event finished'; end if;

  -- T5f. rate limit: more than 20 tries per client key per hour
  v_key2 := v_tag || ' key2';
  insert into public.testing_public_attempts (client_key, event_id, at, outcome)
  select v_key2, v_ep, now() - interval '30 minutes', 'invalid' from generate_series(1, 19);
  insert into public.testing_public_attempts (client_key, event_id, at, outcome)
  select v_key2, v_ep, now() - interval '61 minutes', 'invalid' from generate_series(1, 30);   -- older than an hour: not counted
  v_r2 := public.testing_public_register(v_ep_code, v_key2, gen_random_uuid(), 'Rate', 'One', v_k_orange, 'cash', true, v_sig, v_ack);
  if v_r2 ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: T5f the 20th try in an hour expected ok, got %', v_r2; end if;
  v_r2 := public.testing_public_register(v_ep_code, v_key2, gen_random_uuid(), 'Rate', 'Two', v_k_orange, 'cash', true, v_sig, v_ack);
  if v_r2 is distinct from jsonb_build_object('status', 'rate_limited') then raise exception 'TEST FAILED: T5f the 21st try expected rate_limited, got %', v_r2; end if;
  if not exists (select 1 from public.testing_public_attempts a where a.client_key = v_key2 and a.outcome = 'rate_limited') then
    raise exception 'TEST FAILED: T5f a rate_limited call must be recorded';
  end if;
  if exists (select 1 from public.testing_registrations r where r.event_id = v_ep and r.first_name = 'Rate' and r.last_name = 'Two') then
    raise exception 'TEST FAILED: T5f a rate_limited call wrote a registration';
  end if;
  -- a different key is not affected; many tries for the EVENT are only logged
  insert into public.testing_public_attempts (client_key, event_id, at, outcome)
  select v_tag || ' crowd ' || g, v_ep, now() - interval '10 minutes', 'ok' from generate_series(1, 201) as g;
  v_r2 := public.testing_public_register(v_ep_code, v_tag || ' busy key', gen_random_uuid(), 'Busy', 'Event', v_k_orange, 'cash', true, v_sig, v_ack);
  if v_r2 ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: T5f over 200 tries per event must not refuse, got %', v_r2; end if;
  -- rows older than 2 days are removed by the next call
  v_key3 := v_tag || ' key3';
  insert into public.testing_public_attempts (client_key, event_id, at, outcome) values (v_key3, v_ep, now() - interval '3 days', 'ok');
  perform public.testing_public_register('nonexist', v_key3, gen_random_uuid(), 'A', 'B', v_k_orange, 'cash', true, v_sig, v_ack);
  if exists (select 1 from public.testing_public_attempts a where a.client_key = v_key3 and a.at < now() - interval '2 days') then
    raise exception 'TEST FAILED: T5f attempts older than 2 days were not removed';
  end if;
  if not exists (select 1 from public.testing_public_attempts a where a.client_key = v_key3 and a.outcome = 'not_found' and a.event_id is null) then
    raise exception 'TEST FAILED: T5f a not_found call must be recorded with no event';
  end if;

  -- T5g. a possible duplicate is flagged silently (same name, any capitals/spaces)
  v_r2 := public.testing_public_register(v_ep_code, v_tag || ' dup key', gen_random_uuid(), 'MIA', '  park ', v_k_red, 'check', true, v_sig, v_ack);
  if v_r2 ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: T5g duplicate name must still be accepted, got %', v_r2; end if;
  select r.id into v_f2 from public.testing_registrations r where r.reference = v_r2 ->> 'reference';
  if not exists (select 1 from public.testing_registrations r where r.id = v_f2 and r.duplicate_state = 'possible' and r.duplicate_of = v_f1) then
    raise exception 'TEST FAILED: T5g the second Mia Park should be a possible duplicate of the first';
  end if;

  -- ===================================================================
  -- T6. Payments
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_event('worcester', v_tag || ' Pay', v_today + 10,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), false, null, null);
  v_epay := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_event('worcester', v_tag || ' Day', v_today,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), false, null, null);
  v_eday := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_event('worcester', v_tag || ' Tomorrow', v_today + 1,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), false, null, null);
  v_etom := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_event('worcester', v_tag || ' Fin', v_today,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), false, null, null);
  v_efin := (v_r ->> 'id')::uuid;
  reset role;
  -- the Orange rank of each (A's prices were copied as $65 / $75... except
  -- these events were made after T3b changed Yellow; Orange is unchanged)
  select k.id into v_k_orange from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_epay and k.rank_id = v_ta_orange;

  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- T6a. Add student (staff): ok, version 1, a CB- reference, source staff
  v_r := public.testing_add_student(v_epay, 'Sam', 'Ortiz', v_k_orange, true, 'cash');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> 1 or v_r ->> 'reference' !~ '^CB-[0-9]{4,}$'
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['id', 'reference', 'status', 'version'] then
    raise exception 'TEST FAILED: T6a add_student expected {ok, id, reference, version 1}, got %', v_r;
  end if;
  v_s1 := (v_r ->> 'id')::uuid;
  v_s2 := (public.testing_add_student(v_epay, 'Ava', 'Ng', v_k_orange, true, 'check') ->> 'id')::uuid;
  v_s3 := (public.testing_add_student(v_epay, 'Leo', 'Kim', v_k_orange, true, 'cash') ->> 'id')::uuid;
  v_s4 := (public.testing_add_student(v_epay, 'Zoe', 'Hall', v_k_orange, true, 'cash') ->> 'id')::uuid;
  v_s5 := (public.testing_add_student(v_epay, 'Ian', 'Moss', v_k_orange, true, 'card') ->> 'id')::uuid;
  v_r := public.testing_add_student(v_epay, 'No', 'Stripes', v_k_orange, false, 'cash');
  if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: T6a add_student without the stripes tick expected invalid, got %', v_r; end if;
  v_r := public.testing_add_student(v_epay, 'Bad', 'Pay', v_k_orange, true, 'venmo');
  if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: T6a add_student paying_by venmo expected invalid, got %', v_r; end if;
  v_r := public.testing_add_student(v_epay, 'Wrong', 'Event', v_k_red, true, 'cash');
  if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: T6a add_student with another event''s rank expected invalid, got %', v_r; end if;
  v_r := public.testing_add_student(v_rand, 'No', 'Event', v_k_orange, true, 'cash');
  if v_r ->> 'status' <> 'not_found' then raise exception 'TEST FAILED: T6a add_student unknown event expected not_found, got %', v_r; end if;

  -- T6b. Mark paid before the testing day: the early price, paying_by,
  --      today; the version goes up; a double click (old version) = stale;
  --      again with the new version = already_paid
  v_r := public.testing_mark_paid(v_s1, 1);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'amount_cents')::int <> 6500 or v_r ->> 'method' <> 'cash'
     or (v_r ->> 'version')::int <> 2
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['amount_cents', 'method', 'payment_id', 'status', 'version'] then
    raise exception 'TEST FAILED: T6b mark_paid expected {ok, 6500, cash, version 2}, got %', v_r;
  end if;
  v_p1 := (v_r ->> 'payment_id')::uuid;
  v_r := public.testing_mark_paid(v_s1, 1);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: T6b double click expected stale, got %', v_r; end if;
  v_r := public.testing_mark_paid(v_s1, 2);
  if v_r ->> 'status' <> 'already_paid' then raise exception 'TEST FAILED: T6b paid again expected already_paid, got %', v_r; end if;
  v_r := public.testing_change_paying_by(v_s1, 2, 'card');
  if v_r ->> 'status' <> 'already_paid' then raise exception 'TEST FAILED: T6b change_paying_by on a paid student expected already_paid, got %', v_r; end if;
  v_r := public.testing_change_paying_by(v_s2, 1, 'card');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2) then raise exception 'TEST FAILED: T6b change_paying_by expected {ok, 2}, got %', v_r; end if;
  -- the roster view shows it
  select count(*) into v_n from public.testing_roster v
   where v.id = v_s1 and v.paid and v.paid_cents = 6500 and v.paid_on = v_today and v.paid_method = 'cash'
     and v.last_payment_id = v_p1 and v.signed = false and v.rank_name = 'Orange' and v.version = 2;
  if v_n <> 1 then raise exception 'TEST FAILED: T6b roster row for the paid student is wrong'; end if;
  if exists (select 1 from public.testing_roster v where v.id = v_s2 and (v.paid or v.paid_cents <> 0 or v.last_payment_id is not null)) then
    raise exception 'TEST FAILED: T6b roster row for an unpaid student is wrong';
  end if;

  -- T6c. Undo window: the desk undoes its own payment just now -> ok
  v_r := public.testing_undo_payment(v_p1);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 3) then raise exception 'TEST FAILED: T6c own undo expected {ok, 3}, got %', v_r; end if;
  v_r := public.testing_undo_payment(v_p1);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: T6c undo twice expected stale, got %', v_r; end if;
  select p.id into v_prev from public.testing_payments p where p.reverses_payment_id = v_p1;
  v_r := public.testing_undo_payment(v_prev);
  if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: T6c undo of a reversal expected invalid, got %', v_r; end if;
  if exists (select 1 from public.testing_roster v where v.id = v_s1 and (v.paid or v.paid_cents <> 0 or v.last_payment_id is not null)) then
    raise exception 'TEST FAILED: T6c after undo the student must be Not paid';
  end if;
  v_r := public.testing_mark_paid(v_s1, 3);   -- paid again after the undo
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T6c mark_paid after undo expected ok, got %', v_r; end if;
  v_p2 := (v_r ->> 'payment_id')::uuid;
  -- someone else's payment (the admin's) -> the desk may not undo it
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_mark_paid(v_s2, 2);
  v_pa := (v_r ->> 'payment_id')::uuid;
  if (v_r ->> 'method') <> 'card' then raise exception 'TEST FAILED: T6c mark_paid must use paying_by (card), got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_undo_payment(v_pa);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T6c desk undo of the admin''s payment expected not_allowed, got %', v_r; end if;
  reset role;
  -- the desk's own payment, but 11 seconds ago -> not_allowed; admin -> ok
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
  values (v_s3, 'payment', 6500, 'cash', v_today, now() - interval '11 seconds', v_desk, 'Staff')
  returning id into v_pb;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_undo_payment(v_pb);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T6c desk undo after 10 seconds expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_undo_payment(v_pb);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T6c admin undo any time expected ok, got %', v_r; end if;
  v_r := public.testing_undo_payment(v_pa);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T6c admin undo of own payment expected ok, got %', v_r; end if;

  -- T6d. Edit payment (admin) = reversal + new payment
  v_r := public.testing_edit_payment(v_p2, 'check', 5000, v_today - 2);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'payment_id')::uuid = v_p2
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['payment_id', 'status', 'version'] then
    raise exception 'TEST FAILED: T6d edit_payment expected {ok, new payment_id, version}, got %', v_r;
  end if;
  v_pnew := (v_r ->> 'payment_id')::uuid;
  if not exists (select 1 from public.testing_roster v where v.id = v_s1 and v.paid_cents = 5000 and v.paid_method = 'check'
                  and v.paid_on = v_today - 2 and v.last_payment_id = v_pnew) then
    raise exception 'TEST FAILED: T6d roster after edit must show $50 check';
  end if;
  v_r := public.testing_edit_payment(v_p2, 'cash', 6500, v_today);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: T6d editing a reversed payment expected stale, got %', v_r; end if;
  select p.id into v_prev from public.testing_payments p where p.reverses_payment_id = v_p2;
  v_r := public.testing_edit_payment(v_prev, 'cash', 6500, v_today);
  if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: T6d editing a reversal expected invalid, got %', v_r; end if;
  if public.testing_edit_payment(v_pnew, 'cash', 0, v_today) ->> 'status' <> 'invalid'
     or public.testing_edit_payment(v_pnew, 'cash', 100001, v_today) ->> 'status' <> 'invalid'
     or public.testing_edit_payment(v_pnew, 'gold', 100, v_today) ->> 'status' <> 'invalid'
     or public.testing_edit_payment(v_pnew, 'cash', 100, v_today + 1) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T6d edit_payment input rules';
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_edit_payment(v_pnew, 'cash', 6500, v_today);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T6d desk edit_payment expected not_allowed, got %', v_r; end if;

  -- T6e. the price by date: on the testing day the testing-day price, the
  --      day before the early price
  v_sday := (public.testing_add_student(v_eday, 'Day', 'One',
               (select k.id from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
                 where c.event_id = v_eday and k.rank_id = v_ta_orange), true, 'cash') ->> 'id')::uuid;
  v_stom := (public.testing_add_student(v_etom, 'Tom', 'One',
               (select k.id from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
                 where c.event_id = v_etom and k.rank_id = v_ta_orange), true, 'cash') ->> 'id')::uuid;
  v_r := public.testing_mark_paid(v_sday, 1);
  v_r2 := public.testing_mark_paid(v_stom, 1);
  if (v_r ->> 'amount_cents')::int is distinct from 7500 or (v_r2 ->> 'amount_cents')::int is distinct from 6500 then
    raise exception 'TEST FAILED: T6e on the testing day expected 7500 (got %), the day before 6500 (got %)', v_r, v_r2;
  end if;

  -- T6f. withdrawn: Mark paid and Change how they'll pay -> withdrawn;
  --      the desk can't withdraw (admin only)
  v_r := public.testing_withdraw_student(v_s4, 1);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T6f desk withdraw expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_withdraw_student(v_s4, 1);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2) then raise exception 'TEST FAILED: T6f admin withdraw expected {ok, 2}, got %', v_r; end if;
  v_r := public.testing_withdraw_student(v_s4, 2);
  if v_r ->> 'status' <> 'withdrawn' then raise exception 'TEST FAILED: T6f withdraw twice expected withdrawn, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_mark_paid(v_s4, 2);
  if v_r ->> 'status' <> 'withdrawn' then raise exception 'TEST FAILED: T6f mark_paid withdrawn expected withdrawn, got %', v_r; end if;
  v_r := public.testing_change_paying_by(v_s4, 2, 'card');
  if v_r ->> 'status' <> 'withdrawn' then raise exception 'TEST FAILED: T6f change_paying_by withdrawn expected withdrawn, got %', v_r; end if;

  -- T6g. a Finished event: Mark paid still works (testing-day price);
  --      Add student and the switch -> finished
  v_sfin := (public.testing_add_student(v_efin, 'Fin', 'One',
               (select k.id from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
                 where c.event_id = v_efin and k.rank_id = v_ta_orange), true, 'cash') ->> 'id')::uuid;
  reset role;
  update public.testing_events set testing_date = v_today - 1 where id = v_efin;
  select e.version into v_v from public.testing_events e where e.id = v_efin;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_mark_paid(v_sfin, 1);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'amount_cents')::int <> 7500 then
    raise exception 'TEST FAILED: T6g mark_paid on a finished event expected ok 7500, got %', v_r;
  end if;
  v_r := public.testing_add_student(v_efin, 'Late', 'One',
           (select k.id from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
             where c.event_id = v_efin and k.rank_id = v_ta_orange), true, 'cash');
  if v_r ->> 'status' <> 'finished' then raise exception 'TEST FAILED: T6g add_student on a finished event expected finished, got %', v_r; end if;
  v_r := public.testing_set_registration(v_efin, v_v, true);
  if v_r ->> 'status' <> 'finished' then raise exception 'TEST FAILED: T6g switch on a finished event expected finished, got %', v_r; end if;
  reset role;

  -- T6h. payments are append-only, even for the SQL Editor's role
  begin
    update public.testing_payments set amount_cents = 1 where id = v_pnew;
    raise exception 'TEST FAILED: T6h a payment row could be changed';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise exception 'TEST FAILED: T6h unexpected error: %', sqlerrm; end if;
  end;
  begin
    delete from public.testing_payments where id = v_pnew;
    raise exception 'TEST FAILED: T6h a payment row could be removed';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise exception 'TEST FAILED: T6h unexpected error: %', sqlerrm; end if;
  end;
  begin
    insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name, reverses_payment_id)
    values (v_s1, 'reversal', -100, 'cash', v_today, 'x', v_pnew);
    raise exception 'TEST FAILED: T6h a reversal for the wrong amount was accepted';
  exception when check_violation then null;
  end;
  begin
    truncate public.testing_payments;
    raise exception 'TEST FAILED: T6h testing_payments was truncated';
  exception when raise_exception then
    if sqlerrm not like 'testing_% can''t be truncated%' then raise exception 'TEST FAILED: T6h unexpected error: %', sqlerrm; end if;
  end;

  -- T6i. Delete permanently (admin): the payment rows must be exactly
  --      what the warning named, else stale; then all of them go too
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_delete_student(v_s1, 5, array(select p.id from public.testing_payments p where p.registration_id = v_s1));
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T6i desk delete_student expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_s1;
  v_r := public.testing_delete_student(v_s1, v_v, array[v_p2]);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: T6i delete_student with the wrong payment list expected stale, got %', v_r; end if;
  v_r := public.testing_delete_student(v_s1, v_v, array(select p.id from public.testing_payments p where p.registration_id = v_s1));
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: T6i delete_student expected ok, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.testing_registrations r where r.id = v_s1)
     or exists (select 1 from public.testing_payments p where p.registration_id = v_s1) then
    raise exception 'TEST FAILED: T6i the student or their payments are still there';
  end if;
  if (select count(*) from public.change_log l where l.id > v_mark and l.table_name = 'testing_payments'
        and l.op = 'delete' and l.action = 'delete_student') <> 5 then
    raise exception 'TEST FAILED: T6i expected 5 payment removals in the history (3 payments + 2 reversals)';
  end if;

  -- T6j. Delete event (admin): ALL registrations (withdrawn too) and the
  --      NET payment total must match the dialog, else stale
  select count(*) into v_n from public.testing_registrations r where r.event_id = v_epay;
  select coalesce(sum(p.amount_cents), 0) into v_n2 from public.testing_payments p
    join public.testing_registrations r on r.id = p.registration_id where r.event_id = v_epay;
  select e.version into v_v from public.testing_events e where e.id = v_epay;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_delete_event(v_epay, v_v, v_n - 1, v_n2);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: T6j wrong registration count expected stale, got %', v_r; end if;
  v_r := public.testing_delete_event(v_epay, v_v, v_n, v_n2 + 100);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: T6j wrong payment total expected stale, got %', v_r; end if;
  v_r := public.testing_delete_event(v_epay, v_v, v_n, v_n2);
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: T6j delete_event expected ok, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.testing_events e where e.id = v_epay)
     or exists (select 1 from public.testing_registrations r where r.event_id = v_epay)
     or exists (select 1 from public.testing_event_classes c where c.event_id = v_epay)
     or exists (select 1 from public.testing_payments p where p.registration_id in (v_s2, v_s3, v_s4, v_s5)) then
    raise exception 'TEST FAILED: T6j the event and everything in it should be gone';
  end if;

  -- ===================================================================
  -- T7. Signatures: removed after 90 days, never in change_log
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_add_event('worcester', v_tag || ' Old', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), true, null, null);
  v_eold := (v_r ->> 'id')::uuid; v_eold_code := v_r ->> 'public_code';
  v_r := public.testing_add_event('worcester', v_tag || ' Keep', v_today + 5,
           jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), true, null, null);
  v_ekeep := (v_r ->> 'id')::uuid; v_ekeep_code := v_r ->> 'public_code';
  reset role;
  v_r := public.testing_public_register(v_eold_code, v_tag || ' old key', gen_random_uuid(), 'Old', 'Sig',
           (select k.id from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
             where c.event_id = v_eold and k.rank_id = v_ta_orange), 'cash', true, v_sig, v_ack);
  select r.id into v_fold from public.testing_registrations r where r.reference = v_r ->> 'reference';
  v_r := public.testing_public_register(v_ekeep_code, v_tag || ' keep key', gen_random_uuid(), 'Keep', 'Sig',
           (select k.id from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
             where c.event_id = v_ekeep and k.rank_id = v_ta_orange), 'cash', true, v_sig, v_ack);
  select r.id into v_fkeep from public.testing_registrations r where r.reference = v_r ->> 'reference';
  if v_fold is null or v_fkeep is null then raise exception 'TEST FAILED: T7 setup registrations'; end if;
  -- an edit of a form registration (logged without the picture)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_update_student(v_fold, 1, 'Olde', 'Sig',
           (select k.id from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
             where c.event_id = v_eold and k.rank_id = v_ta_green));
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2) then raise exception 'TEST FAILED: T7 update_student expected {ok, 2}, got %', v_r; end if;
  reset role;
  -- testing dates: 91 days ago (removed) and exactly 90 days ago (kept)
  update public.testing_events set testing_date = v_today - 91 where id = v_eold;
  update public.testing_events set testing_date = v_today - 90 where id = v_ekeep;
  select r.version, r.updated_at into v_v, v_ts from public.testing_registrations r where r.id = v_fold;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  -- the clean-up runs as the last step of Mark paid (any registration)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_mark_paid(v_fkeep, 1);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T7 mark_paid expected ok, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r
                  where r.id = v_fold and r.signature is null and r.signature_deleted_at is not null
                    and r.version = v_v and r.updated_at = v_ts and r.signed_at is not null) then
    raise exception 'TEST FAILED: T7 the 91-day-old signature must be removed without a version bump';
  end if;
  if not exists (select 1 from public.testing_registrations r where r.id = v_fkeep and r.signature = v_sig) then
    raise exception 'TEST FAILED: T7 the 90-day-old signature must be kept';
  end if;
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.record_id = v_fold and l.op = 'update' and l.action = 'purge_old_signatures'
                    and l.before ->> 'signature' = 'on file' and l.after -> 'signature' = 'null'::jsonb
                    and (select array_agg(k order by k) from jsonb_object_keys(l.after) as k) = array['signature', 'signature_deleted_at']) then
    raise exception 'TEST FAILED: T7 history row of the clean-up must show only "signature": "on file" -> null (and when)';
  end if;
  if exists (select 1 from public.testing_roster v where v.id = v_fold and (not v.signed or v.signature_deleted_at is null)) then
    raise exception 'TEST FAILED: T7 roster must still say signed, with the removal date';
  end if;
  -- the same clean-up also runs inside Add event and the public form
  update public.testing_events set testing_date = v_today - 91 where id = v_ekeep;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform public.testing_add_event('worcester', v_tag || ' Trigger purge', v_today + 5,
            jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00')), false, null, null);
  reset role;
  if exists (select 1 from public.testing_registrations r where r.id = v_fkeep and r.signature is not null) then
    raise exception 'TEST FAILED: T7 add_event did not run the signature clean-up';
  end if;
  -- the view never has the signature or the submission id
  if exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'testing_roster'
              and c.column_name in ('signature', 'submission_id', 'created_by', 'updated_by', 'withdrawn_by', 'recorded_by')) then
    raise exception 'TEST FAILED: T7 testing_roster has a column it must not have';
  end if;
  -- a removal of a form registration with its signature (delete_student)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_delete_student(v_f2, 1, '{}');
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: T7 delete_student of a form row expected ok, got %', v_r; end if;
  reset role;
  -- NO history row anywhere contains a picture, or a submission id
  if exists (select 1 from public.change_log l
              where coalesce(l.before::text, '') like '%data:image%' or coalesce(l.after::text, '') like '%data:image%') then
    raise exception 'TEST FAILED: T7 change_log contains a signature picture';
  end if;
  if exists (select 1 from public.change_log l
              where l.table_name = 'testing_registrations' and (coalesce(l.before, '{}') ? 'submission_id' or coalesce(l.after, '{}') ? 'submission_id')) then
    raise exception 'TEST FAILED: T7 change_log contains a submission id';
  end if;

  -- ===================================================================
  -- T8. Duplicates, withdraw / restore, resolve
  -- ===================================================================
  -- v_f1 (Mia Park) is active; v_f2 was removed in T7, so v_f1 is alone.
  v_r := public.testing_public_register(v_ep_code, v_tag || ' t8 key', gen_random_uuid(), 'Mia', 'Park', v_k_red, 'cash', true, v_sig, v_ack);
  select r.id into v_f2 from public.testing_registrations r where r.reference = v_r ->> 'reference';
  if not exists (select 1 from public.testing_registrations r where r.id = v_f2 and r.duplicate_state = 'possible' and r.duplicate_of = v_f1) then
    raise exception 'TEST FAILED: T8 new Mia Park should be a possible duplicate';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- keep both -> both kept_both
  v_r := public.testing_resolve_duplicate(v_f1, 1, v_f2, 1, true);
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: T8 keep both expected ok, got %', v_r; end if;
  reset role;
  if (select count(*) from public.testing_registrations r where r.id in (v_f1, v_f2) and r.duplicate_state = 'kept_both') <> 2 then
    raise exception 'TEST FAILED: T8 keep both must mark both kept_both';
  end if;
  -- a name edit breaks the pair -> both back to none
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f2;
  v_r := public.testing_update_student(v_f2, v_v, 'Mina', 'Park', v_k_red);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T8 rename expected ok, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.testing_registrations r where r.id in (v_f1, v_f2) and r.duplicate_state <> 'none') then
    raise exception 'TEST FAILED: T8 after the rename neither should be marked';
  end if;
  -- rename back -> possible again; keep one -> the other withdrawn as duplicate_copy
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f2;
  v_r := public.testing_update_student(v_f2, v_v, 'Mia', 'Park', v_k_red);
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_f2 and r.duplicate_state = 'possible' and r.duplicate_of = v_f1) then
    raise exception 'TEST FAILED: T8 renamed back should be a possible duplicate again';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f2;
  select r.version into v_n from public.testing_registrations r where r.id = v_f1;
  v_r := public.testing_resolve_duplicate(v_f1, v_n, v_f2, v_v - 1, false);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: T8 resolve with an old version expected stale, got %', v_r; end if;
  v_r := public.testing_resolve_duplicate(v_f1, v_n, v_f2, v_v, false);
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: T8 keep one expected ok, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_f2 and r.status = 'withdrawn'
                  and r.withdrawn_reason = 'duplicate_copy' and r.withdrawn_by_name is not null and r.duplicate_state = 'none'
                  and r.withdrawn_by = v_desk) then
    raise exception 'TEST FAILED: T8 keep one must withdraw the other as duplicate_copy, withdrawn_by = the desk';
  end if;
  -- T8b. the toast's Undo (restore by staff): only their own keep-one,
  --      less than 10 seconds ago. Each "no" case changes ONE thing
  --      directly (as postgres) and puts it back afterwards.
  --      reason 'withdrawn' (an admin's Withdraw) -> not_allowed
  update public.testing_registrations set withdrawn_reason = 'withdrawn' where id = v_f2;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f2;
  v_r := public.testing_restore_student(v_f2, v_v);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T8b desk restore of reason withdrawn expected not_allowed, got %', v_r; end if;
  reset role;
  update public.testing_registrations set withdrawn_reason = 'duplicate_copy' where id = v_f2;
  --      withdrawn by someone else (the admin) -> not_allowed
  update public.testing_registrations set withdrawn_by = v_admin where id = v_f2;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f2;
  v_r := public.testing_restore_student(v_f2, v_v);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T8b desk restore of another user''s keep-one expected not_allowed, got %', v_r; end if;
  reset role;
  update public.testing_registrations set withdrawn_by = v_desk where id = v_f2;
  --      11 seconds ago -> not_allowed
  update public.testing_registrations set withdrawn_at = now() - interval '11 seconds' where id = v_f2;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f2;
  v_r := public.testing_restore_student(v_f2, v_v);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T8b desk restore after 10 seconds expected not_allowed, got %', v_r; end if;
  reset role;
  update public.testing_registrations set withdrawn_at = now() - interval '9 seconds' where id = v_f2;
  --      its own keep-one, 9 seconds ago -> ok (an old version first: stale)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f2;
  v_r := public.testing_restore_student(v_f2, v_v - 1);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: T8b desk Undo with an old version expected stale, got %', v_r; end if;
  v_r := public.testing_restore_student(v_f2, v_v);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <= v_v
     or (v_r ->> 'version')::int <> (select r.version from public.testing_registrations r where r.id = v_f2) then
    raise exception 'TEST FAILED: T8b desk Undo of its own keep-one expected {ok, the new version}, got %', v_r;
  end if;
  --      active again: staff can't "restore" it -> not_allowed
  v_r := public.testing_restore_student(v_f2, (v_r ->> 'version')::int);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T8b desk restore of an active student expected not_allowed, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_f2 and r.status = 'active'
                  and r.withdrawn_reason is null and r.withdrawn_by is null and r.withdrawn_at is null
                  and r.duplicate_state = 'possible' and r.duplicate_of = v_f1) then
    raise exception 'TEST FAILED: T8b the desk Undo must clear the withdrawal and re-check the duplicate';
  end if;
  --      ... and the partner too: the one it kept is "possible" again
  if not exists (select 1 from public.testing_registrations r where r.id = v_f1
                  and r.duplicate_state = 'possible' and r.duplicate_of = v_f2) then
    raise exception 'TEST FAILED: T8b the desk Undo must re-check the partner (both sides possible again)';
  end if;
  -- the admin keeps one this time -> withdrawn_by = the admin; the desk
  -- may not Undo it (someone else's, even within 10 s)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f2;
  select r.version into v_n from public.testing_registrations r where r.id = v_f1;
  v_r := public.testing_resolve_duplicate(v_f1, v_n, v_f2, v_v, false);
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: T8b admin keep one expected ok, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f2;
  v_r := public.testing_restore_student(v_f2, v_v);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T8b desk Undo of the admin''s keep-one expected not_allowed, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_f2 and r.withdrawn_reason = 'duplicate_copy' and r.withdrawn_by = v_admin) then
    raise exception 'TEST FAILED: T8b the admin''s keep one must record withdrawn_by = the admin';
  end if;
  -- restore (admin, at any time: an hour later) -> marked possible again
  update public.testing_registrations set withdrawn_at = now() - interval '1 hour' where id = v_f2;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f2;
  v_r := public.testing_restore_student(v_f2, v_v);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T8 desk restore expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_restore_student(v_f2, v_v);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T8 admin restore expected ok, got %', v_r; end if;
  v_r := public.testing_restore_student(v_f2, (v_r ->> 'version')::int);
  if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: T8 restoring an active student expected invalid, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_f2 and r.status = 'active'
                  and r.withdrawn_reason is null and r.duplicate_state = 'possible' and r.duplicate_of = v_f1) then
    raise exception 'TEST FAILED: T8 restore must re-check the duplicate';
  end if;
  if not exists (select 1 from public.testing_registrations r where r.id = v_f1
                  and r.duplicate_state = 'possible' and r.duplicate_of = v_f2) then
    raise exception 'TEST FAILED: T8 restore must re-check the partner it matches (both sides possible again)';
  end if;
  -- withdrawing the one it points at -> back to none
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f1;
  v_r := public.testing_withdraw_student(v_f1, v_v);
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_f2 and r.duplicate_state = 'none' and r.duplicate_of is null) then
    raise exception 'TEST FAILED: T8 when its match is withdrawn the duplicate mark must go';
  end if;
  -- T8c. restoring the ORIGINAL (its partner went back to none at the
  --      Withdraw) -> both sides possible again, each pointing at the other
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f1;
  select r.version into v_n from public.testing_registrations r where r.id = v_f2;
  v_r := public.testing_restore_student(v_f1, v_v);
  reset role;
  if v_r ->> 'status' <> 'ok'
     or (v_r ->> 'version')::int <> (select r.version from public.testing_registrations r where r.id = v_f1) then
    raise exception 'TEST FAILED: T8c admin restore of the original expected {ok, its new version}, got %', v_r;
  end if;
  if not exists (select 1 from public.testing_registrations r where r.id = v_f1 and r.status = 'active'
                  and r.duplicate_state = 'possible' and r.duplicate_of = v_f2) then
    raise exception 'TEST FAILED: T8c the restored original must be possible, pointing at its partner';
  end if;
  if not exists (select 1 from public.testing_registrations r where r.id = v_f2
                  and r.duplicate_state = 'possible' and r.duplicate_of = v_f1
                  and r.version = v_n + 1) then
    raise exception 'TEST FAILED: T8c the partner must be re-checked to possible again (one new version)';
  end if;
  -- withdraw it again, so the rest of the file starts as before
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.version into v_v from public.testing_registrations r where r.id = v_f1;
  v_r := public.testing_withdraw_student(v_f1, v_v);
  reset role;
  if v_r ->> 'status' <> 'ok'
     or not exists (select 1 from public.testing_registrations r where r.id = v_f2 and r.duplicate_state = 'none') then
    raise exception 'TEST FAILED: T8c withdrawing the original again expected ok and its partner back to none, got %', v_r;
  end if;

  -- ===================================================================
  -- T9. Settings -> Schools
  -- ===================================================================
  select l.version into v_v from public.locations l where l.code = 'shrewsbury';
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.settings_update_school_address('shrewsbury', v_v, '1 Main St', 'Shrewsbury', 'MA', '01545');
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T9 desk address expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_list := array[
    format('public.settings_update_school_address(%L, %s, %L, %L, %L, null)', 'shrewsbury', v_v, '1 Main St', 'Shrewsbury', 'MA'),
    format('public.settings_update_school_address(%L, %s, %L, %L, %L, %L)', 'shrewsbury', v_v, '1 Main St', 'Shrewsbury', 'ma', '01545'),
    format('public.settings_update_school_address(%L, %s, %L, %L, %L, %L)', 'shrewsbury', v_v, '1 Main St', 'Shrewsbury', 'MA', '1545'),
    format('public.settings_update_school_address(%L, %s, %L, %L, %L, %L)', 'shrewsbury', v_v, repeat('s', 101), 'Shrewsbury', 'MA', '01545'),
    format('public.settings_update_school_address(%L, %s, %L, %L, %L, %L)', 'shrewsbury', v_v, '1 Main St', repeat('c', 61), 'MA', '01545')];
  for v_i in 1 .. cardinality(v_list) loop
    execute 'select ' || v_list[v_i] into v_r;
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: T9 case % expected invalid, got %', v_i, v_r; end if;
  end loop;
  v_r := public.settings_update_school_address('nowhere', 1, null, null, null, null);
  if v_r ->> 'status' <> 'not_found' then raise exception 'TEST FAILED: T9 unknown school expected not_found, got %', v_r; end if;
  v_r := public.settings_update_school_address('shrewsbury', v_v + 7, null, null, null, null);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: T9 old version expected stale, got %', v_r; end if;
  v_r := public.settings_update_school_address('shrewsbury', v_v, '  1   Main St ', ' Shrewsbury', 'MA', '01545-1234');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: T9 set address expected {ok, version %}, got %', v_v + 1, v_r;
  end if;
  v_r := public.settings_update_school_address('shrewsbury', v_v + 1, '1 Main St', 'Shrewsbury', 'MA', '01545-1234');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: T9 same address again must not bump the version, got %', v_r;
  end if;
  -- the staff app can read it
  if not exists (select 1 from public.locations l where l.code = 'shrewsbury' and l.address_street = '1 Main St'
                  and l.address_zip = '01545-1234' and l.version = v_v + 1 and l.id is not null) then
    raise exception 'TEST FAILED: T9 the address is not readable / stored tidied';
  end if;
  reset role;
  -- (Checks that the change is logged, not which columns changed: the history keeps only changed
  -- columns, and on the live database the real address may already share the city or ZIP.)
  if not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'locations'
                  and l.action = 'update_school_address' and l.after ? 'version') then
    raise exception 'TEST FAILED: T9 the address change must be in the history';
  end if;
  if public.testing_location_address('shrewsbury') is distinct from
     jsonb_build_object('street', '1 Main St', 'city', 'Shrewsbury', 'state', 'MA', 'zip', '01545-1234') then
    raise exception 'TEST FAILED: T9 the family pages'' address';
  end if;
  -- the address appears on the family page of a Shrewsbury event (v_e3)
  if public.testing_public_event((select e.public_code from public.testing_events e where e.id = v_e3)) -> 'event' -> 'address' ->> 'street' <> '1 Main St' then
    raise exception 'TEST FAILED: T9 the address is missing on the family page';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.settings_update_school_address('shrewsbury', v_v + 1, ' ', '', null, null);   -- clear
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 2) then raise exception 'TEST FAILED: T9 clear expected ok, got %', v_r; end if;
  reset role;
  if public.testing_location_address('shrewsbury') is not null then raise exception 'TEST FAILED: T9 cleared address must be NULL'; end if;

  -- ===================================================================
  -- T10. Catalog: the rights and rules on EVERY object 0005 made
  -- ===================================================================

  -- C1. RLS on every new table; attempts has no rule at all
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = any (v_new_tables) and c.relrowsecurity;
  if v_n <> 6 then raise exception 'TEST FAILED: C1 RLS is on for only % of the 6 new tables', v_n; end if;
  select count(*) into v_n from pg_policies p
   where p.schemaname = 'public' and p.tablename = any (v_new_tables) and p.cmd = 'SELECT'
     and p.roles = array['authenticated']::name[] and p.permissive = 'PERMISSIVE' and p.qual like '%has_data_access()%';
  if v_n <> 5 then raise exception 'TEST FAILED: C1 expected 5 has_data_access read rules, found %', v_n; end if;
  select count(*) into v_n from pg_policies p where p.schemaname = 'public' and p.tablename = any (v_new_tables);
  if v_n <> 5 then raise exception 'TEST FAILED: C1 expected no other rules on the new tables, found % in total', v_n; end if;

  -- C2. table-wide rights: none for anon, authenticated, service_role,
  --     PUBLIC or the registrar; the view: SELECT for authenticated only
  foreach v_tbl in array v_new_tables || array['locations', 'testing_roster'] loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('anon', 'public.' || v_tbl, v_priv)
         or has_table_privilege('service_role', 'public.' || v_tbl, v_priv)
         or has_table_privilege('public', 'public.' || v_tbl, v_priv)
         or has_table_privilege('testing_registrar', 'public.' || v_tbl, v_priv)
         or (has_table_privilege('authenticated', 'public.' || v_tbl, v_priv)
             and not (v_tbl = 'testing_roster' and v_priv = 'SELECT')) then
        raise exception 'TEST FAILED: C2 % has table-wide % for a role that must not have it', v_tbl, v_priv;
      end if;
    end loop;
    foreach v_priv in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege('authenticated', 'public.' || v_tbl, v_priv) then
        raise exception 'TEST FAILED: C2 authenticated has a column % right on %', v_priv, v_tbl;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('authenticated', 'public.testing_roster', 'SELECT') then
    raise exception 'TEST FAILED: C2 authenticated must be able to read testing_roster';
  end if;

  -- C3. column SELECT for authenticated: exactly these
  v_list := array[
    'locations.code', 'locations.name', 'locations.id', 'locations.address_street', 'locations.address_city',
    'locations.address_state', 'locations.address_zip', 'locations.version',
    'testing_events.id', 'testing_events.location_code', 'testing_events.name', 'testing_events.testing_date',
    'testing_events.registration_open', 'testing_events.auto_close_on', 'testing_events.first_opened_at',
    'testing_events.public_code', 'testing_events.note', 'testing_events.version', 'testing_events.created_at',
    'testing_events.updated_at', 'testing_events.created_by_name', 'testing_events.updated_by_name',
    'testing_event_classes.id', 'testing_event_classes.event_id', 'testing_event_classes.class_id',
    'testing_event_classes.class_name', 'testing_event_classes.position', 'testing_event_classes.start_time',
    'testing_event_classes.end_time', 'testing_event_classes.final_award_kind', 'testing_event_classes.final_award_name',
    'testing_event_classes.fa_belt_pattern', 'testing_event_classes.fa_belt_color', 'testing_event_classes.fa_belt_color_2',
    'testing_event_classes.fa_belt_end_stripes', 'testing_event_classes.fa_belt_end_stripe_color',
    'testing_event_ranks.id', 'testing_event_ranks.event_class_id', 'testing_event_ranks.rank_id', 'testing_event_ranks.name',
    'testing_event_ranks.position', 'testing_event_ranks.belt_pattern', 'testing_event_ranks.belt_color',
    'testing_event_ranks.belt_color_2', 'testing_event_ranks.belt_end_stripes', 'testing_event_ranks.belt_end_stripe_color',
    'testing_event_ranks.early_cents', 'testing_event_ranks.day_cents', 'testing_event_ranks.private_cents',
    'testing_event_ranks.sparring_gear',
    'testing_registrations.id', 'testing_registrations.event_id', 'testing_registrations.event_rank_id',
    'testing_registrations.first_name', 'testing_registrations.last_name', 'testing_registrations.paying_by',
    'testing_registrations.stripes_confirmed', 'testing_registrations.source', 'testing_registrations.reference',
    'testing_registrations.signed_at', 'testing_registrations.signature_deleted_at', 'testing_registrations.ack_version',
    'testing_registrations.registered_at', 'testing_registrations.status', 'testing_registrations.withdrawn_reason',
    'testing_registrations.withdrawn_at', 'testing_registrations.withdrawn_by_name', 'testing_registrations.duplicate_state',
    'testing_registrations.duplicate_of', 'testing_registrations.version', 'testing_registrations.created_at',
    'testing_registrations.updated_at', 'testing_registrations.created_by_name', 'testing_registrations.updated_by_name',
    'testing_payments.id', 'testing_payments.registration_id', 'testing_payments.kind', 'testing_payments.amount_cents',
    'testing_payments.method', 'testing_payments.paid_on', 'testing_payments.recorded_at', 'testing_payments.recorded_by_name',
    'testing_payments.reverses_payment_id'];
  for v_tbl, v_col in
    select c.relname::text, a.attname::text
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any (v_new_tables || array['locations'])
       and a.attnum > 0 and not a.attisdropped
  loop
    if has_column_privilege('authenticated', 'public.' || v_tbl, v_col, 'SELECT') is distinct from (v_tbl || '.' || v_col = any (v_list)) then
      raise exception 'TEST FAILED: C3 authenticated SELECT on %.% is %, expected %',
        v_tbl, v_col, has_column_privilege('authenticated', 'public.' || v_tbl, v_col, 'SELECT'), (v_tbl || '.' || v_col = any (v_list));
    end if;
    if has_column_privilege('anon', 'public.' || v_tbl, v_col, 'SELECT')
       or has_column_privilege('service_role', 'public.' || v_tbl, v_col, 'SELECT')
       or has_column_privilege('testing_registrar', 'public.' || v_tbl, v_col, 'SELECT') then
      raise exception 'TEST FAILED: C3 %.% readable by anon, service_role or testing_registrar', v_tbl, v_col;
    end if;
  end loop;

  -- C4. the counters: no rights for anyone in the app
  foreach v_tbl in array array['testing_registration_ref_seq', 'testing_public_attempts_id_seq'] loop
    foreach v_priv in array array['USAGE', 'SELECT', 'UPDATE'] loop
      if has_sequence_privilege('anon', 'public.' || v_tbl, v_priv)
         or has_sequence_privilege('authenticated', 'public.' || v_tbl, v_priv)
         or has_sequence_privilege('service_role', 'public.' || v_tbl, v_priv)
         or has_sequence_privilege('public', 'public.' || v_tbl, v_priv)
         or has_sequence_privilege('testing_registrar', 'public.' || v_tbl, v_priv) then
        raise exception 'TEST FAILED: C4 % has % for a client role', v_tbl, v_priv;
      end if;
    end loop;
  end loop;

  -- C5. every 0005 function: one version only, search_path pinned, who may
  --     run it, and which ones run as their owner (security definer)
  v_n := 0;
  for v_fn in
    select p.oid, p.proname::text as name, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
  loop
    v_n := v_n + 1;
    if not coalesce('search_path=""' = any (v_fn.proconfig), false) then
      raise exception 'TEST FAILED: C5 % has no search_path = ''''', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE') or has_function_privilege('service_role', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: C5 anon or service_role can execute %', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_staff_fns)) then
      raise exception 'TEST FAILED: C5 authenticated execute on % is wrong', v_fn.oid::regprocedure;
    end if;
    if v_fn.prosecdef is distinct from (v_fn.name = any (v_staff_fns || v_public_fns || array['testing_registrations_log'])) then
      raise exception 'TEST FAILED: C5 % security definer is %, not as designed', v_fn.oid::regprocedure, v_fn.prosecdef;
    end if;
  end loop;
  if v_n <> cardinality(v_staff_fns || v_public_fns || v_helper_fns) then
    raise exception 'TEST FAILED: C5 expected exactly % functions from 0005 (one version each), found %',
      cardinality(v_staff_fns || v_public_fns || v_helper_fns), v_n;
  end if;
  -- the exact signatures the app and the Cloudflare Function call
  select string_agg(x.sig, ', ') into v_txt
    from unnest(array[
      'public.testing_add_event(text, text, date, jsonb, boolean, date, text)',
      'public.testing_update_event(uuid, integer, text, date, jsonb, date, text)',
      'public.testing_set_registration(uuid, integer, boolean)',
      'public.testing_delete_event(uuid, integer, integer, integer)',
      'public.testing_add_student(uuid, text, text, uuid, boolean, text)',
      'public.testing_update_student(uuid, integer, text, text, uuid)',
      'public.testing_change_paying_by(uuid, integer, text)',
      'public.testing_mark_paid(uuid, integer)',
      'public.testing_undo_payment(uuid)',
      'public.testing_edit_payment(uuid, text, integer, date)',
      'public.testing_resolve_duplicate(uuid, integer, uuid, integer, boolean)',
      'public.testing_withdraw_student(uuid, integer)',
      'public.testing_restore_student(uuid, integer)',
      'public.testing_delete_student(uuid, integer, uuid[])',
      'public.settings_update_school_address(text, integer, text, text, text, text)',
      'public.testing_public_event(text)',
      'public.testing_public_register(text, text, uuid, text, text, uuid, text, boolean, text, text)']) as x(sig)
   where to_regprocedure(x.sig) is null;
  if v_txt is not null then raise exception 'TEST FAILED: C5 missing function signature(s): %', v_txt; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns) and p.pronargdefaults > 0) then
    raise exception 'TEST FAILED: C5 app functions must have no argument defaults';
  end if;

  -- C6. the view runs with the caller's rights
  if not exists (select 1 from pg_class c where c.oid = 'public.testing_roster'::regclass
                  and 'security_invoker=true' = any (c.reloptions)) then
    raise exception 'TEST FAILED: C6 testing_roster must be security_invoker = true';
  end if;

  -- C7. what happens on removal (foreign keys)
  select string_agg(x.con, ', ') into v_txt
    from (values ('testing_event_classes_event_fk', 'c'), ('testing_event_ranks_class_fk', 'c'),
                 ('testing_registrations_event_fk', 'c'), ('testing_registrations_rank_fk', 'a'),
                 ('testing_registrations_duplicate_fk', 'n'), ('testing_payments_registration_fk', 'c'),
                 ('testing_payments_reverses_fk', 'a'), ('testing_events_location_fk', 'a')) as x(con, act)
   where not exists (select 1 from pg_constraint c where c.conname = x.con and c.contype = 'f' and c.confdeltype = x.act);
  if v_txt is not null then raise exception 'TEST FAILED: C7 wrong delete action on: %', v_txt; end if;

  -- C8. the triggers exist, run the right function and are enabled
  select string_agg(x.trg, ', ') into v_txt
    from (values
      ('locations_before_write', 'locations', 'testing_locations_before_write'),
      ('locations_log', 'locations', 'change_log_write'),
      ('testing_events_before_write', 'testing_events', 'testing_events_before_write'),
      ('testing_events_log', 'testing_events', 'change_log_write'),
      ('testing_events_no_truncate', 'testing_events', 'testing_refuse_truncate'),
      ('testing_event_classes_before_write', 'testing_event_classes', 'testing_event_copies_before_write'),
      ('testing_event_classes_log', 'testing_event_classes', 'change_log_write'),
      ('testing_event_classes_no_truncate', 'testing_event_classes', 'testing_refuse_truncate'),
      ('testing_event_ranks_before_write', 'testing_event_ranks', 'testing_event_copies_before_write'),
      ('testing_event_ranks_log', 'testing_event_ranks', 'change_log_write'),
      ('testing_event_ranks_no_truncate', 'testing_event_ranks', 'testing_refuse_truncate'),
      ('testing_registrations_before_write', 'testing_registrations', 'testing_registrations_before_write'),
      ('testing_registrations_log', 'testing_registrations', 'testing_registrations_log'),
      ('testing_registrations_no_truncate', 'testing_registrations', 'testing_refuse_truncate'),
      ('testing_payments_guard', 'testing_payments', 'testing_payments_guard'),
      ('testing_payments_log', 'testing_payments', 'change_log_write'),
      ('testing_payments_no_truncate', 'testing_payments', 'testing_refuse_truncate')) as x(trg, tbl, fn)
   where not exists (
     select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
       join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public' and t.tgname = x.trg and c.relname = x.tbl
        and p.proname = x.fn and t.tgenabled = 'O' and not t.tgisinternal);
  if v_txt is not null then raise exception 'TEST FAILED: C8 missing / wrong / disabled trigger(s): %', v_txt; end if;
  -- change_log_write must never be attached to the registrations (it would copy the signature)
  if exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
              where t.tgrelid = 'public.testing_registrations'::regclass and p.proname = 'change_log_write') then
    raise exception 'TEST FAILED: C8 change_log_write is attached to testing_registrations';
  end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'public.testing_public_attempts'::regclass and not t.tgisinternal) then
    raise exception 'TEST FAILED: C8 testing_public_attempts must have no triggers (not logged)';
  end if;

  -- C9. every security definer function in public pins search_path
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and not coalesce('search_path=""' = any (p.proconfig), false);
  if v_txt is not null then raise exception 'TEST FAILED: C9 security definer function(s) without search_path: %', v_txt; end if;

  -- the reference counter starts at 3101
  if not exists (select 1 from pg_sequences s where s.schemaname = 'public' and s.sequencename = 'testing_registration_ref_seq'
                  and s.start_value = 3101) then
    raise exception 'TEST FAILED: C9 testing_registration_ref_seq must start at 3101';
  end if;

  reset role;
end;
$$;

select 'ALL 0005 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
