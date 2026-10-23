-- =====================================================================
-- 0016_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0016_black_belt.sql (Black Belt
--   testing). It checks, in this order (contract 0016 section 11.1):
--     T1  who may call what: anon nothing; signed-in staff only the staff
--         functions; locked / signed-out / magic-link / old / idle /
--         inactive sessions get no_access from EVERY function (before any
--         input check); staff vs admin for every admin-only function;
--         nobody in the app can write a table or read a never-granted column
--     T2  the restricted login bb_registrar (catalog proofs)
--     T3  Rubric and prices: the seed, the waiver versions, keep-years
--     T4  cycles: defaults, add, input rules, prices that never change,
--         edit, the state and the switch, delete
--     T5  the family form
--     T6  candidates: desk add, edit, change plan, duplicates, withdraw /
--         restore, purged candidates, delete permanently
--     T7  payments: record, allocation and tags, undo, edit, refund,
--         returned checks, append-only, big sums
--     T8  the purge
--     T9  privacy: DOB / email / signature / signer's name never readable
--         and never in the history in plain text
--     T10 logging: one history row per changed row, the right tags
--     T11 school dates
--     T12 races (what one session can prove)
--     T13 catalog (C1-C10): RLS, rights, functions, triggers, rules
--   It makes its own test cycles and candidates with unusual names ("zz
--   test 1a2b3c4d ..."), so it works whatever is already in the database
--   (run it before AND after the first real Black Belt cycle exists).
--   It passes both BEFORE and AFTER migration 0024 (the rubric editor):
--   where 0024 changes how something behaves, the check looks at
--   v_has_0024 and tests the behaviour of whichever version is installed
--   (CONTRACT-0024 section 11.2). Nothing that 0024 doesn't change is
--   checked any less.
--   There is no fake clock: date rules are tested by calling the internal
--   helpers with made-up dates, and by moving test rows into the past
--   directly (as the SQL Editor's role).
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test waiver version, cycles,
--   candidates, payments, history rows, rate-limit rows, test sessions).
--   NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0003_tests.sql (read its header): "set local role
--   authenticated" + a pretend login token per session. Sessions (A =
--   admin, D = the front desk, role staff):
--     A1 admin unlocked · A2 locked · A3 5 wrong PINs · A4 signed out ·
--     A5 password 8 days old · A6 magic link · A7 idle time ran out ·
--     A8 admin made inactive · D1 desk unlocked · D2 desk locked ·
--     D3 desk magic link · anon
--   Many checks call the functions as the SQL Editor's own role with A1's
--   or D1's token set (the functions run as their owner either way, and
--   the test can then read every column to check what was stored). T1 and
--   T10 call them as "authenticated", like the app.
--   The family form's login (bb_registrar) is checked from the catalog
--   (T2); the public functions are called here as the SQL Editor's role,
--   which gives the same answers (they always run as their owner).
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0010, 0011 and 0016 are applied. You need TWO existing,
--      ACTIVE staff rows: an admin (Main Admin) and the shared front desk
--      (Staff, role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test removes
--      its own test rows and checks that some removals are REFUSED.
--      Everything is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0016 TESTS PASSED".
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
  v_a7 uuid := gen_random_uuid();  v_a8 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();  v_d2 uuid := gen_random_uuid();  v_d3 uuid := gen_random_uuid();

  v_now_s   bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_2h  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 2 * 3600));
  v_amr_8d  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600));
  v_amr_otp jsonb := jsonb_build_array(jsonb_build_object('method', 'otp',      'timestamp', v_now_s - 60));

  v_c_a1 text; v_c_a2 text; v_c_a3 text; v_c_a4 text; v_c_a5 text; v_c_a6 text; v_c_a7 text; v_c_a8 text;
  v_c_d1 text; v_c_d2 text; v_c_d3 text;
  v_c_anon text := '{"role": "anon"}';

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_rand  uuid := gen_random_uuid();
  v_rand2 uuid := gen_random_uuid();
  v_role  text;

  -- a small valid PNG signature, one 1 character too long, and a GIF
  v_sig      text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  v_sig_long text := 'data:image/png;base64,' || repeat('A', 70000 - 22 + 1);
  v_sig_gif  text := 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  -- the parent who signs: a name that is NOT the candidate's (T9b)
  v_signer   text := 'Jordan Testparent';
  v_email    text;   -- every test email contains v_mail_tag (T9b)
  v_mail_tag text := 'zzbb' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  -- dates of birth (made unusual on purpose, so T9b can look for them)
  v_adult    date := (public.testing_today() - interval '35 years' - interval '17 days')::date;
  v_child10  date := (public.testing_today() - interval '10 years' - interval '23 days')::date;
  v_dob17    date;   -- 17 on Main's first testing day
  v_dob18    date;   -- 18 on Main's first testing day
  v_dobs     date[] := '{}';

  v_r      jsonb;
  v_r2     jsonb;
  v_p      jsonb;
  v_i      integer;
  v_j      integer;
  v_n      integer;
  v_n2     integer;
  v_v      integer;
  v_v2     integer;
  v_txt    text;
  v_txt2   text;
  v_bool   boolean;
  v_mark   bigint;
  v_mark0  bigint;   -- the last history row before this test run
  v_list   text[];
  v_labels text[];
  v_ok     text[];
  v_bad    text[];
  v_none   text[];
  v_ids    uuid[];
  v_ts     timestamptz;
  v_d      date;
  v_shift  integer;
  v_snap_sql text;
  v_snap   text;
  v_snap2  text;
  v_admin_only integer[] := array[1, 2, 3, 4, 5, 7, 12, 14, 18, 19, 20, 24];
  v_cnt_cycles0 integer;

  -- waiver versions
  v_ph uuid; v_ph_name text; v_wv uuid; v_wv_name text; v_w23 uuid; v_w24 uuid;
  -- cycles, their versions, codes, plans
  v_cm uuid; v_cm_w text; v_cm_s text; v_cmv integer; v_cm_full uuid; v_cm_three uuid;
  v_c2 uuid; v_c2_w text; v_c2v integer; v_c2_full uuid; v_c2_three uuid;
  v_co uuid; v_co_w text; v_co_three uuid; v_co_full uuid;
  v_cn uuid; v_cn_full uuid;
  v_c30 uuid; v_c30_full uuid;
  v_cdel uuid; v_cdel_full uuid;
  v_cx uuid; v_cx_w text; v_cx_s text;
  v_cy uuid;
  -- candidates and payments
  v_k1 uuid; v_k1v integer; v_kw uuid; v_kwv integer; v_f1 uuid; v_f2 uuid;
  v_o1 uuid; v_o2 uuid; v_o3 uuid; v_n1 uuid; v_t30 uuid;
  v_k uuid; v_k2 uuid; v_kv integer;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_pr uuid;
  v_sub1 uuid := gen_random_uuid();
  v_sub2 uuid := gen_random_uuid();
  v_key text;

  -- catalog
  v_fn      record;
  v_tbl     text;
  v_col     text;
  v_priv    text;
  v_reg_oid oid;
  v_owner   oid;
  v_staff_fns text[] := array[
    'bb_save_waiver', 'bb_set_keep_years', 'bb_cycle_defaults', 'bb_add_cycle', 'bb_update_cycle',
    'bb_set_registration', 'bb_delete_cycle', 'bb_add_candidate', 'bb_update_candidate', 'bb_change_plan',
    'bb_resolve_duplicate', 'bb_withdraw_candidate', 'bb_restore_candidate', 'bb_delete_candidate',
    'bb_record_paper_waiver', 'bb_record_payment', 'bb_undo_payment', 'bb_edit_payment', 'bb_record_refund',
    'bb_mark_check_returned', 'bb_cycles_list', 'bb_cycle_roster', 'bb_candidate_detail', 'bb_view_signature',
    'bb_receipt'];
  v_public_fns text[] := array['bb_public_cycle', 'bb_public_register'];
  v_helper_fns text[] := array[
    'bb_price_is_valid', 'bb_email_is_valid', 'bb_time_is_valid', 'bb_requirements_is_valid', 'bb_age_on',
    'bb_cycle_state', 'bb_candidate_items', 'bb_candidate_money', 'bb_purge_due_on', 'bb_purge_is_due',
    'bb_waiver_version_ok', 'bb_before_write', 'bb_waiver_versions_guard', 'bb_starting_point_guard',
    'bb_cycles_rules', 'bb_cycle_day_parts_guard', 'bb_cycle_prices_guard', 'bb_cycle_plan_payments_guard',
    'bb_candidates_rules', 'bb_candidates_log', 'bb_candidate_waivers_rules', 'bb_candidate_waivers_log',
    'bb_payments_guard', 'bb_lock_candidate', 'bb_lock_payment', 'bb_find_duplicate', 'bb_recheck_duplicate',
    'bb_recheck_pointing_at', 'bb_purge_due', 'bb_public_answer', 'bb_public_register_core'];
  v_tables text[] := array[
    'bb_settings', 'bb_waiver_versions', 'bb_starting_point', 'bb_cycles', 'bb_cycle_days', 'bb_cycle_day_parts',
    'bb_cycle_plans', 'bb_cycle_plan_amounts', 'bb_cycle_kukkiwon_fees', 'bb_cycle_plan_payments',
    'bb_candidates', 'bb_candidate_waivers', 'bb_payments'];
  v_read_tables text[];
  -- 0024 (the rubric editor) installed? (CONTRACT-0024 11.2)
  v_has_0024 boolean := to_regclass('public.bb_default_rubric') is not null;
  v_rubric_fns text[] := array[
    'bb_save_default_dan', 'bb_undo_default_dan', 'bb_save_cycle_dan', 'bb_undo_cycle_dan', 'bb_undo_first_open',
    'bb_rubric_num_ok', 'bb_rubric_int_ok', 'bb_rubric_letters', 'bb_rubric_brackets_problems', 'bb_rubric_dan_problems',
    'bb_rubric_is_valid', 'bb_rubric_part_max', 'bb_rubric_most_points', 'bb_rubric_from_v1', 'bb_rubric_fresh_copy',
    'bb_rubric_public', 'bb_rubric_put_dan', 'bb_default_rubric_guard', 'bb_rubric_undo_guard'];
begin
  v_read_tables := array(select t from unnest(v_tables) as t where t not in ('bb_candidate_waivers', 'bb_starting_point'));

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
  if to_regclass('public.bb_cycles') is null then
    raise exception 'TEST SETUP: public.bb_cycles is missing (is 0016 applied?)';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'bb_registrar') then
    raise exception 'TEST SETUP: role bb_registrar is missing (is 0016 applied?)';
  end if;
  if (select full_name from public.staff where id = v_desk) is distinct from 'Staff' then
    raise exception 'TEST SETUP: the front-desk staff row must be named "Staff" (T10 checks the history names)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  select coalesce(max(id), 0) into v_mark0 from public.change_log;
  select count(*) into v_cnt_cycles0 from public.bb_cycles;

  begin
    insert into auth.sessions (id, user_id)
    select x, v_admin from unnest(array[v_a1, v_a2, v_a3, v_a5, v_a6, v_a7, v_a8]) as x
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
    (v_a7, v_admin, to_timestamp(v_now_s - 2 * 3600) + interval '45 minutes'),
    (v_a8, v_admin, now() + interval '30 minutes'),
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
  v_c_a7 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a7, 'amr', v_amr_2h)::text;
  v_c_a8 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a8, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;
  v_c_d2 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text;
  v_c_d3 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d3, 'amr', v_amr_otp)::text;

  set local role authenticated;
  v_list := array[v_c_a1, v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_a8, v_c_d1, v_c_d2, v_c_d3];
  for v_i in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_i], true);
    if public.has_data_access() is distinct from (v_i in (1, 8, 9)) then
      raise exception 'TEST SETUP: session % of A1..A8,D1..D3 has data access %, expected %',
        v_i, public.has_data_access(), (v_i in (1, 8, 9));
    end if;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- One md5 of every 0016 table + the history count ("did anything
  -- change?"). The rate-limit table is counted separately where it matters.
  select 'select md5(' || string_agg(format('coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.%I x), '''')', t), ' || ')
         || ' || (select count(*) from public.change_log)::text)'
    into v_snap_sql
    from unnest(v_tables) as t;

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   bbt_payload(name, first day, application due): a valid Add cycle
  --     payload: days on d1 (Physical, Worcester + an outdoor second
  --     part), d1 + 7 (Technical, Shrewsbury), d1 + 14 (Curriculum,
  --     Shrewsbury); submissions due d1 + 10; plans "In full" (1 payment
  --     on Application due) and "3 payments" (Application due, d1 + 7,
  --     d1 + 14); the Fall 2026 amounts and Kukkiwon fees
  --   bbt_current(cycle): the cycle's saved values as an Edit cycle
  --     payload (days with ids, due dates)
  --   bbt_shift(cycle, days): moves every date of a cycle by that many
  --     days, as the SQL Editor's role (for "a cycle in the past")
  --   bbt_due_candidate(cycle, dob, email, how): a candidate written
  --     directly as the SQL Editor's role, with a waiver (drawn or paper)
  --   bbt_log(mark, action, actor, session, name, label): T10's checks of
  --     the history rows one call wrote
  execute $f$
    create function pg_temp.bbt_payload(p_name text, p_d1 date, p_app date) returns jsonb
    language sql as $b$
      select jsonb_build_object(
        'name', p_name, 'application_due', p_app, 'submissions_due', p_d1 + 10, 'auto_close', true,
        'days', jsonb_build_array(
          jsonb_build_object('name', 'Physical', 'day_date', p_d1, 'start_time', '12:30', 'end_time', '14:30',
                             'place', jsonb_build_object('code', 'worcester'),
                             'second', jsonb_build_object('start', '14:30', 'end', '15:30',
                                                          'place', jsonb_build_object('other', 'Horgan Arena, 403 Oxford St N, Auburn MA 01501')),
                             'parts', jsonb_build_array('physical')),
          jsonb_build_object('name', 'Technical', 'day_date', p_d1 + 7, 'start_time', '12:30', 'end_time', '15:30',
                             'place', jsonb_build_object('code', 'shrewsbury'), 'second', null,
                             'parts', jsonb_build_array('technical')),
          jsonb_build_object('name', 'Curriculum', 'day_date', p_d1 + 14, 'start_time', '14:00', 'end_time', '17:00',
                             'place', jsonb_build_object('code', 'shrewsbury'), 'second', null,
                             'parts', jsonb_build_array('curriculum'))),
        'plans', jsonb_build_array(
          jsonb_build_object('name', 'In full',
                             'payments', jsonb_build_array(jsonb_build_object('due_on', p_app, 'follows_application_due', true)),
                             'amounts', jsonb_build_object('1', jsonb_build_array(87000), '2', jsonb_build_array(99000),
                                                           '3', jsonb_build_array(150000), '4', jsonb_build_array(270000))),
          jsonb_build_object('name', '3 payments',
                             'payments', jsonb_build_array(jsonb_build_object('due_on', p_app, 'follows_application_due', true),
                                                           jsonb_build_object('due_on', p_d1 + 7, 'follows_application_due', false),
                                                           jsonb_build_object('due_on', p_d1 + 14, 'follows_application_due', false)),
                             'amounts', jsonb_build_object('1', jsonb_build_array(29000, 29000, 29000),
                                                           '2', jsonb_build_array(33000, 33000, 33000),
                                                           '3', jsonb_build_array(50000, 50000, 50000),
                                                           '4', jsonb_build_array(90000, 90000, 90000)))),
        'kukkiwon', jsonb_build_object('1', 10000, '2', 11000, '3', 14000, '4', 17000),
        'prices_from', null);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbt_current(p_cycle uuid) returns jsonb
    language sql as $b$
      select jsonb_build_object(
        'name', y.name, 'application_due', y.application_due, 'submissions_due', y.submissions_due,
        'auto_close', y.auto_close,
        'days', (select jsonb_agg(jsonb_build_object(
                          'id', d.id, 'name', d.name, 'day_date', d.day_date,
                          'start_time', left(d.start_time::text, 5), 'end_time', left(d.end_time::text, 5),
                          'place', case when d.place_code is not null then jsonb_build_object('code', d.place_code)
                                        else jsonb_build_object('other', d.place_other) end,
                          'second', case when d.second_start is null then null
                                         else jsonb_build_object('start', left(d.second_start::text, 5),
                                                                 'end', left(d.second_end::text, 5),
                                                                 'place', case when d.second_place_code is not null
                                                                               then jsonb_build_object('code', d.second_place_code)
                                                                               else jsonb_build_object('other', d.second_place_other) end) end,
                          'parts', (select jsonb_agg(p.part order by p.part) from public.bb_cycle_day_parts p where p.day_id = d.id))
                        order by d.day_date, d.id)
                   from public.bb_cycle_days d where d.cycle_id = y.id),
        'due_dates', (select jsonb_agg(jsonb_build_object('cycle_plan_id', pp.cycle_plan_id, 'payment_no', pp.payment_no,
                                                          'due_on', pp.due_on, 'follows_application_due', pp.follows_application_due)
                                       order by pp.id)
                        from public.bb_cycle_plan_payments pp join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id
                       where pl.cycle_id = y.id))
        from public.bb_cycles y where y.id = p_cycle;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbt_shift(p_cycle uuid, p_days integer) returns void
    language plpgsql as $b$
    begin
      update public.bb_cycle_days set day_date = day_date + p_days where cycle_id = p_cycle;
      update public.bb_cycles set application_due = application_due + p_days, submissions_due = submissions_due + p_days
       where id = p_cycle;
      update public.bb_cycle_plan_payments pp set due_on = pp.due_on + p_days
        from public.bb_cycle_plans pl where pl.id = pp.cycle_plan_id and pl.cycle_id = p_cycle;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbt_due_candidate(p_cycle uuid, p_first text, p_dob date, p_email text, p_how text) returns uuid
    language plpgsql as $b$
    declare
      v_id uuid;
    begin
      insert into public.bb_candidates
        (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan, cycle_plan_id,
         kukkiwon, source, reference, created_by_name, updated_by_name)
      select p_cycle, p_first, 'Duecase', p_dob, p_email, 'worcester', 1, pl.id, false,
             case when p_how = 'drawn' then 'form' else 'desk' end,
             'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text, '', ''
        from public.bb_cycle_plans pl where pl.cycle_id = p_cycle order by pl.position limit 1
      returning id into v_id;
      insert into public.bb_candidate_waivers
        (candidate_id, waiver_version_id, how, submission_id, acknowledged, signed_as_minor, signer_name, signature,
         ticked_by_name, signed_at, created_by_name, updated_by_name)
      select v_id, v.id, p_how, case when p_how = 'drawn' then gen_random_uuid() end, true, false,
             case when p_how = 'drawn' then 'Jordan Testparent' end,
             case when p_how = 'drawn' then 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' end,
             case when p_how = 'paper' then 'zz tester' end, now() - interval '1 hour', '', ''
        from public.bb_waiver_versions v where v.superseded_at is null;
      return v_id;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbt_log(p_mark bigint, p_action text, p_actor uuid, p_session uuid, p_name text, p_label text)
    returns void language plpgsql as $b$
    declare
      v_n integer;
    begin
      select count(*) into v_n from public.change_log l where l.id > p_mark and l.action <> 'bb_purge_due';
      if v_n = 0 then
        raise exception 'TEST FAILED: T10 % wrote no history row', p_label;
      end if;
      if exists (select 1 from public.change_log l
                  where l.id > p_mark and l.action <> 'bb_purge_due'
                    and (l.action <> p_action or l.actor_id is distinct from p_actor
                         or l.session_id is distinct from p_session or l.actor_name <> p_name
                         or l.batch_id is null or l.table_name not like 'bb\_%'
                         or l.op not in ('insert', 'update', 'delete'))) then
        raise exception 'TEST FAILED: T10 % history rows have a wrong action / actor / session / batch / op: %', p_label,
          (select jsonb_agg(jsonb_build_object('action', l.action, 'table', l.table_name, 'actor', l.actor_name,
                                               'session', l.session_id, 'batch', l.batch_id, 'op', l.op))
             from public.change_log l where l.id > p_mark);
      end if;
      if (select count(distinct l.batch_id) from public.change_log l
           where l.id > p_mark and l.action <> 'bb_purge_due') <> 1 then
        raise exception 'TEST FAILED: T10 % used more than one batch id', p_label;
      end if;
      -- candidates and payments are filed under a school (payments: the
      -- STORED school); cycles, days, parts, prices and settings never
      if exists (select 1 from public.change_log l
                  where l.id > p_mark and l.table_name in ('bb_candidates', 'bb_payments')
                    and l.location_code is distinct from coalesce(l.after ->> 'location_code', l.before ->> 'location_code',
                                                                  (select c.location_code from public.bb_candidates c where c.id = l.record_id)))
         or exists (select 1 from public.change_log l
                     where l.id > p_mark and l.table_name in ('bb_payments') and l.location_code is null)
         or exists (select 1 from public.change_log l
                     where l.id > p_mark and l.table_name not in ('bb_candidates', 'bb_payments')
                       and l.location_code is not null) then
        raise exception 'TEST FAILED: T10 % location_code wrong (candidates and payments carry it, others never)', p_label;
      end if;
      if exists (select 1 from public.change_log l
                  where l.id > p_mark and l.record_id is null) then
        raise exception 'TEST FAILED: T10 % a history row has no record id', p_label;
      end if;
      if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
        raise exception 'TEST FAILED: T10 % left tkd.action / tkd.batch_id set', p_label;
      end if;
    end;
    $b$;
  $f$;

  -- ===================================================================
  -- Fixtures part 1: the waiver, the Main cycle (T3, T4a, T4e, T5f also
  -- check things on the way)
  -- ===================================================================

  -- T3a. the seed, as the history recorded it (append-only, so this holds
  --      whatever admins changed since): exactly one settings row (both
  --      keep-years empty), one PLACEHOLDER waiver "2026-1" and one
  --      starting point, written ONCE (a re-run of 0016 adds none), tagged
  --      bb_seed by "Database admin"
  select count(*) filter (where l.table_name = 'bb_settings' and l.op = 'insert'
                                and l.after -> 'keep_years_after_last_day' = 'null'::jsonb
                                and l.after -> 'keep_years_after_18' = 'null'::jsonb),
         count(*) filter (where l.table_name = 'bb_waiver_versions' and l.op = 'insert'
                                and l.after ->> 'version_name' = '2026-1' and (l.after ->> 'is_placeholder')::boolean
                                and l.after ->> 'body' like 'PLACEHOLDER%'),
         count(*) filter (where l.table_name = 'bb_starting_point' and l.op = 'insert'),
         count(*)
    into v_i, v_j, v_n, v_n2
    from public.change_log l where l.action = 'bb_seed';
  -- (0024 seeds the default rubric with the same tag: a 4th bb_seed row,
  -- on bb_default_rubric. The history is append-only, so that row stays
  -- even after "Undo 0024" (SETUP 0024f). 0016's own three are counted
  -- exactly either way.)
  if v_i <> 1 or v_j <> 1 or v_n <> 1
     or (select count(*) from public.change_log l where l.action = 'bb_seed' and l.table_name <> 'bb_default_rubric') <> 3
     or (v_has_0024 and (v_n2 <> 4 or (select count(*) from public.change_log l where l.action = 'bb_seed'
                                         and l.table_name = 'bb_default_rubric' and l.op = 'insert') <> 1))
     or (not v_has_0024 and v_n2 not in (3, 4))
     or (not v_has_0024 and v_n2 = 4 and (select count(*) from public.change_log l where l.action = 'bb_seed'
                                           and l.table_name = 'bb_default_rubric' and l.op = 'insert') <> 1)
     or exists (select 1 from public.change_log l where l.action = 'bb_seed' and l.actor_name <> 'Database admin') then
    raise exception 'TEST FAILED: T3a the seed history should be 1 settings + 1 placeholder waiver + 1 starting point by Database admin (got %, %, %, % rows)',
      v_i, v_j, v_n, v_n2;
  end if;
  if (select count(*) from public.bb_settings) <> 1 or (select count(*) from public.bb_starting_point) <> 1
     or (select count(*) from public.bb_waiver_versions where version_name = '2026-1') <> 1
     or (select count(*) from public.bb_waiver_versions where superseded_at is null) <> 1 then
    raise exception 'TEST FAILED: T3a one settings row, one starting point, one 2026-1 and exactly one current waiver';
  end if;
  -- the starting point holds the Fall 2026 values (contract section 3)
  select sp.schedule into v_r from public.bb_starting_point sp;
  if v_r ->> 'application_due' <> '2026-09-19' or v_r ->> 'submissions_due' <> '2026-11-14'
     or (v_r ->> 'auto_close')::boolean is not true
     or jsonb_array_length(v_r -> 'days') <> 3
     or v_r -> 'days' -> 0 ->> 'day_date' <> '2026-09-26' or v_r -> 'days' -> 0 ->> 'start_time' <> '12:30'
     or v_r -> 'days' -> 0 ->> 'end_time' <> '14:30' or v_r -> 'days' -> 0 -> 'place' ->> 'code' <> 'worcester'
     or v_r -> 'days' -> 0 -> 'second' -> 'place' ->> 'other' <> 'Horgan Arena, 403 Oxford St N, Auburn MA 01501'
     or v_r -> 'days' -> 0 -> 'second' ->> 'start' <> '14:30' or v_r -> 'days' -> 0 -> 'second' ->> 'end' <> '15:30'
     or v_r -> 'days' -> 1 ->> 'day_date' <> '2026-10-24' or v_r -> 'days' -> 1 -> 'place' ->> 'code' <> 'shrewsbury'
     or v_r -> 'days' -> 1 ->> 'start_time' <> '12:30' or v_r -> 'days' -> 1 ->> 'end_time' <> '15:30'
     or v_r -> 'days' -> 2 ->> 'day_date' <> '2026-11-21' or v_r -> 'days' -> 2 ->> 'start_time' <> '14:00'
     or v_r -> 'days' -> 2 ->> 'end_time' <> '17:00'
     or v_r -> 'days' -> 0 -> 'parts' <> '["physical"]' or v_r -> 'days' -> 1 -> 'parts' <> '["technical"]'
     or v_r -> 'days' -> 2 -> 'parts' <> '["curriculum"]'
     or v_r -> 'plans' -> 0 ->> 'name' <> 'In full' or v_r -> 'plans' -> 1 ->> 'name' <> '3 payments'
     or v_r -> 'plans' -> 0 -> 'amounts' <> '{"1": [87000], "2": [99000], "3": [150000], "4": [270000]}'
     or v_r -> 'plans' -> 1 -> 'amounts' <> '{"1": [29000, 29000, 29000], "2": [33000, 33000, 33000], "3": [50000, 50000, 50000], "4": [90000, 90000, 90000]}'
     or v_r -> 'plans' -> 0 -> 'payments' <> '[{"due_on": "2026-09-19", "follows_application_due": true}]'
     or v_r -> 'plans' -> 1 -> 'payments' <> '[{"due_on": "2026-09-19", "follows_application_due": true}, {"due_on": "2026-10-17", "follows_application_due": false}, {"due_on": "2026-11-14", "follows_application_due": false}]'
     or v_r -> 'kukkiwon' <> '{"1": 10000, "2": 11000, "3": 14000, "4": 17000}' then
    raise exception 'TEST FAILED: T3a the starting point schedule is not the Fall 2026 values: %', v_r;
  end if;
  select sp.requirements into v_r from public.bb_starting_point sp;
  if not public.bb_requirements_is_valid(v_r)
     or v_r -> 'dans' -> 0 -> 'pass_rule' ->> 'points' <> '275' or v_r -> 'dans' -> 0 -> 'pass_rule' ->> 'points_adult' <> '293'
     or v_r -> 'dans' -> 1 -> 'pass_rule' ->> 'points' <> '261' or v_r -> 'dans' -> 2 -> 'pass_rule' ->> 'points' <> '293'
     or v_r -> 'dans' -> 3 -> 'pass_rule' ->> 'points' <> '453'
     or (select sum((p.part ->> 'max_points')::numeric) from jsonb_array_elements(v_r -> 'dans' -> 0 -> 'parts') as p(part)) <> 339
     or (select sum((p.part ->> 'max_points')::numeric) from jsonb_array_elements(v_r -> 'dans' -> 3 -> 'parts') as p(part)) <> 595
     or (v_r -> 'dans' -> 0 -> 'extra_points' ->> 'to_confirm')::boolean is not true then
    raise exception 'TEST FAILED: T3a the starting point requirements sheet is not the Fall 2026 values';
  end if;

  -- T4a (first half). Add cycle's defaults: with no cycle at all, the
  --      starting point (Fall 2026 values exactly, contract S9). (When
  --      real cycles exist, the newest one is the source - checked below
  --      after the first test cycle.)
  perform set_config('request.jwt.claims', v_c_a1, true);
  if v_cnt_cycles0 = 0 then
    v_r := public.bb_cycle_defaults();
    if v_r ->> 'status' <> 'ok' or v_r -> 'source_cycle_id' <> 'null'::jsonb
       or v_r -> 'payload' <> ((select sp.schedule from public.bb_starting_point sp)
                               || '{"prices_from": "Fall 2026 starting point"}'::jsonb) then
      raise exception 'TEST FAILED: T4a defaults with no cycle should be the starting point, got %', v_r;
    end if;
  end if;

  -- The current waiver must be the PLACEHOLDER for the first checks (on a
  -- database where an admin already saved the school's text, a test
  -- placeholder is made current - rolled back like everything else).
  if not exists (select 1 from public.bb_waiver_versions v where v.superseded_at is null and v.is_placeholder) then
    update public.bb_waiver_versions set superseded_at = now() where superseded_at is null;
    insert into public.bb_waiver_versions (version_name, body, is_placeholder, created_by_name)
    values ('1999-1', 'PLACEHOLDER zz test', true, '');
  end if;
  select v.id, v.version_name into v_ph, v_ph_name from public.bb_waiver_versions v where v.superseded_at is null;

  -- The Main cycle: Physical in 30 days, Technical in 37, Curriculum in 44;
  -- Application due in 20 days (payment 1 too)
  v_dob17 := ((v_today + 30) - interval '18 years' + interval '1 day')::date;   -- turns 18 the day after
  v_dob18 := ((v_today + 30) - interval '18 years')::date;                      -- turns 18 on the first day
  v_dobs  := array[v_adult, v_child10, v_dob17, v_dob18];
  v_r := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' Main', v_today + 30, v_today + 20), null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add Main answered %', v_r; end if;
  v_cm := (v_r ->> 'id')::uuid; v_cm_w := v_r ->> 'public_code_worcester'; v_cm_s := v_r ->> 'public_code_shrewsbury';
  select id into v_cm_full  from public.bb_cycle_plans where cycle_id = v_cm and name = 'In full';
  select id into v_cm_three from public.bb_cycle_plans where cycle_id = v_cm and name = '3 payments';

  -- T4a (second half). After a cycle exists, the defaults are that cycle's
  --      schedule and prices (it is the most recently created one)
  v_r := public.bb_cycle_defaults();
  v_p := pg_temp.bbt_payload(v_tag || ' Main', v_today + 30, v_today + 20);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'source_cycle_id')::uuid is distinct from v_cm
     or v_r -> 'payload' ->> 'prices_from' <> v_tag || ' Main'
     or v_r -> 'payload' -> 'plans' <> v_p -> 'plans' or v_r -> 'payload' -> 'kukkiwon' <> v_p -> 'kukkiwon'
     or v_r -> 'payload' -> 'days' <> v_p -> 'days'
     or v_r -> 'payload' ->> 'application_due' <> (v_p ->> 'application_due')
     or v_r -> 'payload' ? 'name' then
    raise exception 'TEST FAILED: T4a defaults after a cycle should be its schedule, got %', v_r;
  end if;
  -- ... and Add cycle wrote: two different codes, Closed, the starting
  -- point's requirements (no source) - after 0024: a fresh copy of the
  -- default rubric -, payments x 4 amounts per plan, 4 fees
  if v_cm_w = v_cm_s or v_cm_w !~ '^[a-hjkmnp-z2-9]{8}$'
     or (select registration_open or first_opened_at is not null or version <> 1 from public.bb_cycles where id = v_cm)
     or (not v_has_0024
         and (select requirements from public.bb_cycles where id = v_cm) <> (select requirements from public.bb_starting_point))
     or (select count(*) from public.bb_cycle_plan_amounts where cycle_plan_id = v_cm_full) <> 4
     or (select count(*) from public.bb_cycle_plan_amounts where cycle_plan_id = v_cm_three) <> 12
     or (select count(*) from public.bb_cycle_plan_payments where cycle_plan_id = v_cm_three) <> 3
     or (select count(*) from public.bb_cycle_kukkiwon_fees where cycle_id = v_cm) <> 4
     or (select count(*) from public.bb_cycle_days where cycle_id = v_cm) <> 3
     or (select position from public.bb_cycle_plans where id = v_cm_three) <> 1
     or (select amount_cents from public.bb_cycle_plan_amounts where cycle_plan_id = v_cm_three and dan = 4 and payment_no = 3) <> 90000
     or (select due_on from public.bb_cycle_plan_payments where cycle_plan_id = v_cm_three and payment_no = 1) <> v_today + 20
     or not (select follows_application_due from public.bb_cycle_plan_payments where cycle_plan_id = v_cm_three and payment_no = 1)
     or (select second_place_other from public.bb_cycle_days where cycle_id = v_cm and name = 'Physical')
        <> 'Horgan Arena, 403 Oxford St N, Auburn MA 01501' then
    raise exception 'TEST FAILED: T4a Add cycle did not write the cycle as designed';
  end if;
  -- (Checks that name a 0024 object sit in their own "if v_has_0024 then"
  -- block: PL/pgSQL prepares a statement's whole condition at once, so a
  -- query on a table that doesn't exist yet must never be reached before
  -- 0024.)
  if v_has_0024 then
    if (select requirements from public.bb_cycles where id = v_cm)
       is distinct from (select public.bb_rubric_fresh_copy(r.sheet) from public.bb_default_rubric r) then
      raise exception 'TEST FAILED: T4a (0024) Add cycle must store a fresh copy of the default rubric';
    end if;
  end if;

  -- T4e (placeholder). Opening while the placeholder waiver is current ->
  --      waiver_needed (contract 14 OI-1); nothing changes
  select version into v_cmv from public.bb_cycles where id = v_cm;
  v_r := public.bb_set_registration(v_cm, v_cmv, true);
  if v_r is distinct from '{"status": "waiver_needed"}'::jsonb
     or (select registration_open from public.bb_cycles where id = v_cm) then
    raise exception 'TEST FAILED: T4e opening with the placeholder waiver should be waiver_needed, got %', v_r;
  end if;
  -- T5f (placeholder). The family form never accepts the placeholder,
  --      even on a cycle that is open (opened here by hand)
  if public.bb_waiver_version_ok(v_ph, now()) then
    raise exception 'TEST FAILED: T5f the current placeholder must not be accepted';
  end if;
  update public.bb_cycles set registration_open = true, first_opened_at = now() where id = v_cm;
  perform set_config('request.jwt.claims', '', true);
  execute v_snap_sql into v_snap;
  v_r := public.bb_public_register(v_cm_w, v_tag || ' kp', gen_random_uuid(), 'Pla', 'Ceholder', v_adult,
                                   v_mail_tag || '.ph@example.com', 1, v_cm_full, false, true, v_ph_name, v_signer, v_sig);
  execute v_snap_sql into v_snap2;
  if v_r is distinct from '{"status": "waiver_changed"}'::jsonb or v_snap2 <> v_snap then
    raise exception 'TEST FAILED: T5f signing the current placeholder should be waiver_changed with nothing written, got %', v_r;
  end if;
  update public.bb_cycles set registration_open = false where id = v_cm;

  -- T3b. Save waiver: always a new version "YYYY-n" (the year of today +
  --      the count that year); the old one is marked superseded; the same
  --      text writes nothing; a stale current id -> stale
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_n := (select count(*) from public.bb_waiver_versions where version_name like extract(year from v_today)::integer::text || '-%');
  v_r := public.bb_save_waiver(v_ph, '  zz test waiver text ' || v_tag || '  ');
  if v_r ->> 'status' <> 'ok' or v_r ->> 'version_name' <> extract(year from v_today)::integer::text || '-' || (v_n + 1)::text then
    raise exception 'TEST FAILED: T3b save waiver answered %', v_r;
  end if;
  v_wv := (v_r ->> 'id')::uuid; v_wv_name := v_r ->> 'version_name';
  if (select superseded_at from public.bb_waiver_versions where id = v_ph) is distinct from now()
     or (select superseded_at from public.bb_waiver_versions where id = v_wv) is not null
     or (select is_placeholder from public.bb_waiver_versions where id = v_wv)
     or (select body from public.bb_waiver_versions where id = v_wv) <> 'zz test waiver text ' || v_tag then
    raise exception 'TEST FAILED: T3b the old version must be superseded and the new one current (trimmed, not a placeholder)';
  end if;
  execute v_snap_sql into v_snap;
  v_r := public.bb_save_waiver(v_wv, 'zz test waiver text ' || v_tag);
  execute v_snap_sql into v_snap2;
  if v_r is distinct from jsonb_build_object('status', 'ok', 'id', v_wv, 'version_name', v_wv_name) or v_snap2 <> v_snap then
    raise exception 'TEST FAILED: T3b the same text must write nothing and answer the current version, got %', v_r;
  end if;
  v_r := public.bb_save_waiver(v_ph, 'zz other text');
  if v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: T3b a stale current id should be stale, got %', v_r;
  end if;
  foreach v_txt in array array['', '   ', repeat('x', 20001)] loop
    v_r := public.bb_save_waiver(v_wv, v_txt);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T3b an empty or too long text should be invalid, got %', v_r;
    end if;
  end loop;
  v_r := public.bb_save_waiver(null, 'x');
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T3b a null id should be invalid'; end if;
  -- a version can't be changed (except superseded_at, once) or removed,
  -- even by the SQL Editor's role
  perform set_config('request.jwt.claims', '', true);
  foreach v_txt in array array[
      format('update public.bb_waiver_versions set body = %L where id = %L', 'changed', v_wv),
      format('update public.bb_waiver_versions set is_placeholder = true where id = %L', v_wv),
      format('update public.bb_waiver_versions set superseded_at = now() + interval ''1 hour'' where id = %L', v_ph),
      format('delete from public.bb_waiver_versions where id = %L', v_ph)] loop
    begin
      execute v_txt;
      raise exception 'TEST FAILED: T3b a waiver version was changed or removed: %', v_txt;
    exception when check_violation then null;
    end;
  end loop;

  -- ===================================================================
  -- Fixtures part 2 (the school's waiver is current now)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- Main2: never opened (T4e, T5e)
  v_r := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' Second', v_today + 60, v_today + 50), v_cm);
  v_c2 := (v_r ->> 'id')::uuid; v_c2_w := v_r ->> 'public_code_worcester';
  select id into v_c2_full  from public.bb_cycle_plans where cycle_id = v_c2 and name = 'In full';
  select id into v_c2_three from public.bb_cycle_plans where cycle_id = v_c2 and name = '3 payments';
  -- Old: moved 3 years + 1 day into the past below (the purge, T8b)
  v_r := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' Old', v_today + 90, v_today + 80), null);
  v_co := (v_r ->> 'id')::uuid; v_co_w := v_r ->> 'public_code_worcester';
  select id into v_co_full  from public.bb_cycle_plans where cycle_id = v_co and name = 'In full';
  select id into v_co_three from public.bb_cycle_plans where cycle_id = v_co and name = '3 payments';
  -- Near: its last day 3 years - 1 day ago (kept, T8b)
  v_r := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' Near', v_today + 150, v_today + 140), null);
  v_cn := (v_r ->> 'id')::uuid;
  select id into v_cn_full from public.bb_cycle_plans where cycle_id = v_cn and name = 'In full';
  -- Thirty: 30 years ago (T8a)
  v_r := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' Thirty', v_today + 180, v_today + 170), null);
  v_c30 := (v_r ->> 'id')::uuid;
  select id into v_c30_full from public.bb_cycle_plans where cycle_id = v_c30 and name = 'In full';
  -- Del: desk candidates only (T4f)
  v_r := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' Del', v_today + 200, v_today + 190), null);
  v_cdel := (v_r ->> 'id')::uuid;
  select id into v_cdel_full from public.bb_cycle_plans where cycle_id = v_cdel and name = 'In full';
  if v_c2 is null or v_co is null or v_cn is null or v_c30 is null or v_cdel is null then
    raise exception 'TEST SETUP: could not create the test cycles (last answer %)', v_r;
  end if;

  -- Main's candidates: Ann Lee (desk, paid payment 1 at the desk), Wes
  -- Gone (desk, withdrawn by the admin), Bo Kim (family form, Shrewsbury
  -- link, 17 on the first day, a parent signs), Cy Dee (form, 18)
  select version into v_cmv from public.bb_cycles where id = v_cm;
  v_r := public.bb_set_registration(v_cm, v_cmv, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: open Main answered %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_candidate(v_cm, 'Ann', 'Lee', v_adult, v_mail_tag || '.ann@example.com', 'worcester', 1,
                                 v_cm_three, false, true);
  v_k1 := (v_r ->> 'id')::uuid;
  v_r := public.bb_record_payment(v_k1, 1, 29000, 'cash', array['p1'], null);
  v_p1 := (v_r ->> 'payment_id')::uuid;
  v_r := public.bb_add_candidate(v_cm, 'Wes', 'Gone', v_adult, v_mail_tag || '.wes@example.com', 'worcester', 2,
                                 v_cm_full, false, true);
  v_kw := (v_r ->> 'id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_withdraw_candidate(v_kw, 1);
  perform set_config('request.jwt.claims', '', true);
  v_r := public.bb_public_register(v_cm_s, v_tag || ' k1', v_sub1, 'Bo', 'Kim', v_dob17, v_mail_tag || '.bo@example.com',
                                   1, v_cm_three, true, true, v_wv_name, v_signer, v_sig);
  select c.id into v_f1 from public.bb_candidates c where c.reference = v_r ->> 'reference';
  v_r := public.bb_public_register(v_cm_w, v_tag || ' k1', v_sub2, 'Cy', 'Dee', v_dob18, v_mail_tag || '.cy@example.com',
                                   2, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  select c.id into v_f2 from public.bb_candidates c where c.reference = v_r ->> 'reference';

  -- Old's candidates (before it moves into the past): Olda (form, adult,
  -- signed online), Oldie (form, 10 years old), Oldwin (desk, adult,
  -- withdrawn)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_set_registration(v_co, 1, true);
  perform set_config('request.jwt.claims', '', true);
  v_r := public.bb_public_register(v_co_w, v_tag || ' k2', gen_random_uuid(), 'Olda', 'Sig', v_adult,
                                   v_mail_tag || '.olda@example.com', 1, v_co_three, false, true, v_wv_name, v_signer, v_sig);
  select c.id into v_o1 from public.bb_candidates c where c.reference = v_r ->> 'reference';
  v_r := public.bb_public_register(v_co_w, v_tag || ' k2', gen_random_uuid(), 'Oldie', 'Kid', v_child10,
                                   v_mail_tag || '.oldie@example.com', 1, v_co_full, false, true, v_wv_name, v_signer, v_sig);
  select c.id into v_o2 from public.bb_candidates c where c.reference = v_r ->> 'reference';
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_candidate(v_co, 'Oldwin', 'Drawn', v_adult, v_mail_tag || '.oldwin@example.com', 'shrewsbury', 3,
                                 v_co_full, false, true);
  v_o3 := (v_r ->> 'id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_withdraw_candidate(v_o3, 1);
  -- Near and Thirty: one adult desk candidate each
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_candidate(v_cn, 'Nora', 'Near', v_adult, v_mail_tag || '.nora@example.com', 'worcester', 1,
                                 v_cn_full, false, true);
  v_n1 := (v_r ->> 'id')::uuid;
  v_r := public.bb_add_candidate(v_c30, 'Thea', 'Thirty', v_adult, v_mail_tag || '.thea@example.com', 'worcester', 1,
                                 v_c30_full, false, true);
  v_t30 := (v_r ->> 'id')::uuid;
  perform set_config('request.jwt.claims', '', true);
  if v_k1 is null or v_p1 is null or v_kw is null or v_f1 is null or v_f2 is null or v_o1 is null or v_o2 is null
     or v_o3 is null or v_n1 is null or v_t30 is null then
    raise exception 'TEST SETUP: could not create the test candidates (last answer %)', v_r;
  end if;

  -- Move Old so its LAST testing day is 3 years + 1 day ago, Near so its
  -- last day is 3 years - 1 day ago, Thirty 30 years back
  v_shift := (((v_today - interval '3 years')::date - 1) - (v_today + 104));
  perform pg_temp.bbt_shift(v_co, v_shift);
  v_shift := (((v_today - interval '3 years')::date + 1) - (v_today + 164));
  perform pg_temp.bbt_shift(v_cn, v_shift);
  v_shift := (((v_today - interval '30 years')::date) - (v_today + 194));
  perform pg_temp.bbt_shift(v_c30, v_shift);
  if (select max(day_date) from public.bb_cycle_days where cycle_id = v_co) <> (v_today - interval '3 years')::date - 1 then
    raise exception 'TEST SETUP: Old was not moved into the past';
  end if;

  select version into v_k1v from public.bb_candidates where id = v_k1;
  select version into v_kwv from public.bb_candidates where id = v_kw;
  select version into v_cmv from public.bb_cycles where id = v_cm;
  -- a candidate due for the purge must stay untouched by every refused
  -- call below (T1c): the keep-years numbers are set here by hand for
  -- T1 only (Olda is due under 3 / 3), and put back afterwards
  update public.bb_settings set keep_years_after_last_day = 3, keep_years_after_18 = 3;
  if not public.bb_purge_is_due(v_o1, v_today) then
    raise exception 'TEST SETUP: Olda should be due for the purge under 3 / 3';
  end if;

  -- ===================================================================
  -- T1. Who may call what
  -- ===================================================================

  -- The 25 staff functions, three ways each (index matters: v_admin_only
  -- lists the admin-only ones; 13 = restore and 17 = undo payment let
  -- staff past the role check for their own Undo)
  v_ok := array[
    format('public.bb_save_waiver(%L::uuid, %L)', v_wv, 'zz nope'),
    format('public.bb_set_keep_years(%s, 3, 3, null)', (select version from public.bb_settings)),
    'public.bb_cycle_defaults()',
    format('public.bb_add_cycle(%L::jsonb, null)', pg_temp.bbt_payload(v_tag || ' gate', v_today + 40, v_today + 30)),
    format('public.bb_update_cycle(%L::uuid, %s, %L::jsonb)', v_cm, v_cmv, pg_temp.bbt_current(v_cm)),
    format('public.bb_set_registration(%L::uuid, %s, false)', v_cm, v_cmv),
    format('public.bb_delete_cycle(%L::uuid, %s, 0)', v_cdel, 1),
    format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, true)', v_cm, 'Nope', 'Person', v_adult, 'nope@example.com', 'worcester', v_cm_full),
    format('public.bb_update_candidate(%L::uuid, %s, %L, %L, %L::date, %L, %L, 1)', v_k1, v_k1v, 'Nope', 'Person', v_adult, 'nope@example.com', 'worcester'),
    format('public.bb_change_plan(%L::uuid, %s, %L::uuid, false)', v_k1, v_k1v, v_cm_full),
    format('public.bb_resolve_duplicate(%L::uuid, %s, %L::uuid, 1, true)', v_k1, v_k1v, v_f1),
    format('public.bb_withdraw_candidate(%L::uuid, %s)', v_k1, v_k1v),
    format('public.bb_restore_candidate(%L::uuid, %s)', v_kw, v_kwv),
    format('public.bb_delete_candidate(%L::uuid, %s)', v_k1, v_k1v),
    format('public.bb_record_paper_waiver(%L::uuid, %s)', v_k1, v_k1v),
    format('public.bb_record_payment(%L::uuid, %s, 100, %L, %L::text[], null)', v_k1, v_k1v, 'cash', '{p2}'),
    format('public.bb_undo_payment(%L::uuid)', v_p1),
    format('public.bb_edit_payment(%L::uuid, 100, %L, %L::text[], null, %L)', v_p1, 'cash', '{p1}', 'typo'),
    format('public.bb_record_refund(%L::uuid, %s, 100, %L, null)', v_k1, v_k1v, 'cash'),
    format('public.bb_mark_check_returned(%L::uuid, null)', v_p1),
    'public.bb_cycles_list()',
    format('public.bb_cycle_roster(%L::uuid)', v_cm),
    format('public.bb_candidate_detail(%L::uuid)', v_k1),
    format('public.bb_view_signature(%L::uuid)', v_f1),
    format('public.bb_receipt(%L::uuid)', v_k1)];
  v_bad := array[
    'public.bb_save_waiver(null, '''')',
    'public.bb_set_keep_years(null, 2, null, -1)',
    'public.bb_cycle_defaults()',
    'public.bb_add_cycle(''[]''::jsonb, null)',
    'public.bb_update_cycle(null, null, ''{}''::jsonb)',
    'public.bb_set_registration(null, null, null)',
    'public.bb_delete_cycle(null, null, null)',
    'public.bb_add_candidate(null, '''', '''', null, '''', '''', 9, null, null, false)',
    'public.bb_update_candidate(null, null, '''', '''', null, '''', '''', 9)',
    'public.bb_change_plan(null, null, null, null)',
    'public.bb_resolve_duplicate(null, null, null, null, null)',
    'public.bb_withdraw_candidate(null, null)',
    'public.bb_restore_candidate(null, null)',
    'public.bb_delete_candidate(null, null)',
    'public.bb_record_paper_waiver(null, null)',
    'public.bb_record_payment(null, null, -1, '''', null, null)',
    'public.bb_undo_payment(null)',
    'public.bb_edit_payment(null, -1, '''', null, null, null)',
    'public.bb_record_refund(null, null, -1, '''', null)',
    'public.bb_mark_check_returned(null, null)',
    'public.bb_cycles_list()',
    'public.bb_cycle_roster(null)',
    'public.bb_candidate_detail(null)',
    'public.bb_view_signature(null)',
    'public.bb_receipt(null)'];
  v_none := array[
    format('public.bb_save_waiver(%L::uuid, %L)', v_rand, 'zz nope'),
    'public.bb_set_keep_years(99999, 3, 3, 0)',
    'public.bb_cycle_defaults()',
    format('public.bb_add_cycle(%L::jsonb, %L::uuid)', pg_temp.bbt_payload(v_tag || ' gate 2', v_today + 40, v_today + 30), v_rand),
    format('public.bb_update_cycle(%L::uuid, 1, %L::jsonb)', v_rand, pg_temp.bbt_current(v_cm)),
    format('public.bb_set_registration(%L::uuid, 1, false)', v_rand),
    format('public.bb_delete_cycle(%L::uuid, 1, 0)', v_rand),
    format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, true)', v_rand, 'Nope', 'Person', v_adult, 'nope@example.com', 'worcester', v_rand2),
    format('public.bb_update_candidate(%L::uuid, 1, %L, %L, %L::date, %L, %L, 1)', v_rand, 'Nope', 'Person', v_adult, 'nope@example.com', 'worcester'),
    format('public.bb_change_plan(%L::uuid, 1, %L::uuid, false)', v_rand, v_rand2),
    format('public.bb_resolve_duplicate(%L::uuid, 1, %L::uuid, 1, true)', v_rand, v_rand2),
    format('public.bb_withdraw_candidate(%L::uuid, 1)', v_rand),
    format('public.bb_restore_candidate(%L::uuid, 1)', v_rand),
    format('public.bb_delete_candidate(%L::uuid, 1)', v_rand),
    format('public.bb_record_paper_waiver(%L::uuid, 1)', v_rand),
    format('public.bb_record_payment(%L::uuid, 1, 100, %L, %L::text[], null)', v_rand, 'cash', '{p1}'),
    format('public.bb_undo_payment(%L::uuid)', v_rand),
    format('public.bb_edit_payment(%L::uuid, 100, %L, %L::text[], null, %L)', v_rand, 'cash', '{p1}', 'typo'),
    format('public.bb_record_refund(%L::uuid, 1, 100, %L, null)', v_rand, 'cash'),
    format('public.bb_mark_check_returned(%L::uuid, null)', v_rand),
    'public.bb_cycles_list()',
    format('public.bb_cycle_roster(%L::uuid)', v_rand),
    format('public.bb_candidate_detail(%L::uuid)', v_rand),
    format('public.bb_view_signature(%L::uuid)', v_rand),
    format('public.bb_receipt(%L::uuid)', v_rand)];
  if cardinality(v_ok) <> 25 or cardinality(v_bad) <> 25 or cardinality(v_none) <> 25 then
    raise exception 'TEST SETUP: the T1 call lists must have 25 entries each';
  end if;

  -- T1a. anon: no staff function, no public function, no table
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  for v_i in 1 .. 25 loop
    begin
      execute 'select ' || v_ok[v_i];
      raise exception 'TEST FAILED: T1a anon could call %', v_ok[v_i];
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin perform public.bb_public_cycle('abcdefgh');
        raise exception 'TEST FAILED: T1a anon could call bb_public_cycle'; exception when insufficient_privilege then null; end;
  begin perform public.bb_public_register('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', v_adult, 'a@b.co', 1, v_rand, false, true, '2026-1', 'x', v_sig);
        raise exception 'TEST FAILED: T1a anon could call bb_public_register'; exception when insufficient_privilege then null; end;
  foreach v_tbl in array v_tables loop
    begin
      execute format('select 1 from public.%I limit 1', v_tbl);
      raise exception 'TEST FAILED: T1a anon could read %', v_tbl;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;

  -- T1b. a signed-in, unlocked admin (A1) and the desk (D1) can't call the
  --      two public functions or any helper
  set local role authenticated;
  foreach v_txt in array array[v_c_a1, v_c_d1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    begin perform public.bb_public_cycle('abcdefgh');
          raise exception 'TEST FAILED: T1b authenticated could call bb_public_cycle'; exception when insufficient_privilege then null; end;
    begin perform public.bb_public_register('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', v_adult, 'a@b.co', 1, v_rand, false, true, '2026-1', 'x', v_sig);
          raise exception 'TEST FAILED: T1b authenticated could call bb_public_register'; exception when insufficient_privilege then null; end;
    begin perform public.bb_public_register_core('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', v_adult, 'a@b.co', 1, v_rand, false, true, '2026-1', 'x', v_sig);
          raise exception 'TEST FAILED: T1b authenticated could call bb_public_register_core'; exception when insufficient_privilege then null; end;
    begin perform public.bb_purge_due();
          raise exception 'TEST FAILED: T1b authenticated could call bb_purge_due'; exception when insufficient_privilege then null; end;
    begin perform public.bb_candidate_money(v_k1, v_today);
          raise exception 'TEST FAILED: T1b authenticated could call bb_candidate_money'; exception when insufficient_privilege then null; end;
    begin perform public.bb_lock_candidate(v_k1);
          raise exception 'TEST FAILED: T1b authenticated could call bb_lock_candidate'; exception when insufficient_privilege then null; end;
  end loop;
  reset role;
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_helper_fns || v_public_fns)
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_txt is not null then raise exception 'TEST FAILED: T1b authenticated can execute helper / public function(s): %', v_txt; end if;

  -- T1c. sessions without data access get no_access from EVERY staff
  --      function, called three times each (sensible arguments, broken
  --      input, ids that exist nowhere): access is checked before the
  --      input and any lookup. Nothing is written - not even the purge
  --      (Olda is due for it).
  execute v_snap_sql into v_snap;
  v_list   := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_d2, v_c_d3, v_c_a8];
  v_labels := array['A2',   'A3',   'A4',   'A5',   'A6',   'A7',   'D2',   'D3',   'A8'];
  for v_n in 1 .. cardinality(v_list) loop
    if v_labels[v_n] = 'A8' then
      update public.staff set active = false where id = v_admin;
    end if;
    set local role authenticated;
    perform set_config('request.jwt.claims', v_list[v_n], true);
    for v_i in 1 .. 25 loop
      foreach v_txt in array array[v_ok[v_i], v_bad[v_i], v_none[v_i]] loop
        execute 'select ' || v_txt into v_r;
        if v_r is distinct from '{"status": "no_access"}'::jsonb then
          raise exception 'TEST FAILED: T1c session % got % from %', v_labels[v_n], v_r, left(v_txt, 200);
        end if;
      end loop;
    end loop;
    reset role;
    if v_labels[v_n] = 'A8' then
      update public.staff set active = true where id = v_admin;
    end if;
  end loop;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: T1c a refused call changed something'; end if;
  if (select personal_removed_at from public.bb_candidates where id = v_o1) is not null then
    raise exception 'TEST FAILED: T1c the purge ran without data access';
  end if;

  -- T1d. the desk (D1) gets not_allowed from every admin-only function,
  --      three calls each (the role is checked before the input); restore
  --      of a normal withdrawal is refused after its lookup (staff may only
  --      undo their own "keep one" within 10 seconds, T6d; their own
  --      payment within 10 seconds, T7c)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_i in array v_admin_only loop
    foreach v_txt in array array[v_ok[v_i], v_bad[v_i], v_none[v_i]] loop
      execute 'select ' || v_txt into v_r;
      if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
        raise exception 'TEST FAILED: T1d desk got % from admin-only %', v_r, left(v_txt, 200);
      end if;
    end loop;
  end loop;
  execute 'select ' || v_ok[13] into v_r;
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: T1d desk restore of a normal withdrawal expected not_allowed, got %', v_r;
  end if;
  reset role;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: T1d a refused desk call changed something'; end if;
  -- back to "nothing is purged" (T3c sets the numbers through the app)
  update public.bb_settings set keep_years_after_last_day = null, keep_years_after_18 = null;

  -- T1e. no data access -> no rows; A1 and D1 see what postgres sees
  v_list   := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_d2, v_c_d3, v_c_a1, v_c_d1, v_c_a8];
  v_labels := array['A2',   'A3',   'A4',   'A5',   'A6',   'A7',   'D2',   'D3',   'A1',   'D1',   'A8'];
  foreach v_tbl in array v_read_tables loop
    execute format('select count(x.id) from public.%I x', v_tbl) into v_n2;
    for v_i in 1 .. cardinality(v_list) loop
      if v_labels[v_i] = 'A8' then update public.staff set active = false where id = v_admin; end if;
      set local role authenticated;
      perform set_config('request.jwt.claims', v_list[v_i], true);
      execute format('select count(x.id) from public.%I x', v_tbl) into v_n;
      reset role;
      if v_labels[v_i] = 'A8' then update public.staff set active = true where id = v_admin; end if;
      if v_n <> (case when v_labels[v_i] in ('A1', 'D1') then v_n2 else 0 end) then
        raise exception 'TEST FAILED: T1e session % read % rows of % (postgres sees %)', v_labels[v_i], v_n, v_tbl, v_n2;
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);

  -- T1f. A1: no direct insert / update / delete / truncate on any 0016
  --      table; "select *" refused where a column is never granted; every
  --      never-granted column refused; the counter refused
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  foreach v_tbl in array v_tables loop
    begin execute format('insert into public.%I default values', v_tbl);
          raise exception 'TEST FAILED: T1f A1 could insert into %', v_tbl; exception when insufficient_privilege then null; end;
    begin execute format('update public.%I set id = id', v_tbl);
          raise exception 'TEST FAILED: T1f A1 could update %', v_tbl; exception when insufficient_privilege then null; end;
    begin execute format('delete from public.%I where id = %L', v_tbl, v_rand);
          raise exception 'TEST FAILED: T1f A1 could delete from %', v_tbl; exception when insufficient_privilege then null; end;
    begin execute format('truncate public.%I', v_tbl);
          raise exception 'TEST FAILED: T1f A1 could truncate %', v_tbl; exception when insufficient_privilege then null; end;
    -- (the plans, amounts and Kukkiwon fees have every column granted)
    if v_tbl not in ('bb_cycle_plans', 'bb_cycle_plan_amounts', 'bb_cycle_kukkiwon_fees') then
      begin execute format('select * from public.%I limit 1', v_tbl);
            raise exception 'TEST FAILED: T1f A1 could select * from %', v_tbl; exception when insufficient_privilege then null; end;
    end if;
  end loop;
  foreach v_txt in array array[
      'bb_candidates.date_of_birth', 'bb_candidates.email_for_results', 'bb_candidates.withdrawn_by',
      'bb_candidates.created_by', 'bb_candidates.updated_by', 'bb_payments.recorded_by',
      'bb_settings.singleton', 'bb_settings.created_by', 'bb_settings.updated_by', 'bb_waiver_versions.created_by',
      'bb_cycles.created_by', 'bb_cycles.updated_by', 'bb_cycle_days.created_by', 'bb_cycle_days.updated_by',
      'bb_cycle_day_parts.created_by', 'bb_cycle_day_parts.created_at', 'bb_cycle_plan_payments.created_by',
      'bb_cycle_plan_payments.updated_by', 'bb_starting_point.schedule', 'bb_starting_point.requirements',
      'bb_starting_point.singleton', 'bb_candidate_waivers.signature', 'bb_candidate_waivers.signer_name',
      'bb_candidate_waivers.submission_id', 'bb_candidate_waivers.how', 'bb_candidate_waivers.id'] loop
    begin
      execute format('select x.%I from public.%I x limit 1', split_part(v_txt, '.', 2), split_part(v_txt, '.', 1));
      raise exception 'TEST FAILED: T1f A1 could read %', v_txt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin perform nextval('public.bb_candidate_ref_seq');
        raise exception 'TEST FAILED: T1f A1 could use the reference counter'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- T2. The restricted login bb_registrar (catalog proofs)
  -- ===================================================================
  select r.oid into v_reg_oid from pg_roles r where r.rolname = 'bb_registrar';

  -- T2a. in schema public it may run exactly the two Black Belt public
  --      functions; testing_registrar and star_registrar exactly their
  --      own two; none can run another form's
  for v_fn in
    select p.oid, p.proname::text as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    if has_function_privilege('bb_registrar', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_public_fns)) then
      raise exception 'TEST FAILED: T2a bb_registrar execute on % is %, expected %',
        v_fn.oid::regprocedure, has_function_privilege('bb_registrar', v_fn.oid, 'EXECUTE'), (v_fn.name = any (v_public_fns));
    end if;
    if has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE')
       is distinct from (v_fn.name in ('testing_public_event', 'testing_public_register')) then
      raise exception 'TEST FAILED: T2a testing_registrar execute on % is wrong', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('star_registrar', v_fn.oid, 'EXECUTE')
       is distinct from (v_fn.name in ('star_public_event', 'star_public_register')) then
      raise exception 'TEST FAILED: T2a star_registrar execute on % is wrong', v_fn.oid::regprocedure;
    end if;
  end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_public_fns);
  if v_n <> 2 then raise exception 'TEST FAILED: T2a expected exactly 2 Black Belt public functions (one version each), found %', v_n; end if;

  -- T2b. no 0016 function is executable by PUBLIC (= every role)
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
     and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE');
  if v_txt is not null then raise exception 'TEST FAILED: T2b 0016 function(s) executable by PUBLIC: %', v_txt; end if;

  -- T2c. no right on any table, column or sequence: nothing granted to it
  --      by name anywhere, and in every schema it can reach no right at
  --      all (PUBLIC's included) - explicitly none on
  --      testing_public_attempts, change_log and the bb_ tables
  select string_agg(c.oid::regclass::text, ', ') into v_txt
    from pg_class c
   where exists (select 1 from aclexplode(c.relacl) as a where a.grantee = v_reg_oid)
      or exists (select 1 from pg_attribute t, aclexplode(t.attacl) as a
                  where t.attrelid = c.oid and a.grantee = v_reg_oid);
  if v_txt is not null then raise exception 'TEST FAILED: T2c rights granted to bb_registrar on: %', v_txt; end if;
  select string_agg(c.oid::regclass::text, ', ') into v_txt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
     and has_schema_privilege('bb_registrar', n.oid, 'USAGE')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('bb_registrar', c.oid, 'USAGE, SELECT, UPDATE')
               else has_table_privilege('bb_registrar', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                    or has_any_column_privilege('bb_registrar', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
          end);
  if v_txt is not null then raise exception 'TEST FAILED: T2c bb_registrar has rights on: %', v_txt; end if;
  foreach v_tbl in array v_tables || array['testing_public_attempts', 'change_log'] loop
    if has_table_privilege('bb_registrar', 'public.' || v_tbl, 'SELECT, INSERT, UPDATE, DELETE')
       or has_any_column_privilege('bb_registrar', 'public.' || v_tbl, 'SELECT, INSERT, UPDATE') then
      raise exception 'TEST FAILED: T2c bb_registrar has a right on %', v_tbl;
    end if;
  end loop;

  -- T2d. it can't create anything in any schema, nor in the database
  --      (this test's own temporary schema - made for its pg_temp helpers,
  --      private to this session - is left out, as in 0006_tests.sql)
  select string_agg(n.nspname, ', ') into v_txt
    from pg_namespace n
   where has_schema_privilege('bb_registrar', n.oid, 'CREATE')
     and n.oid <> pg_my_temp_schema();
  if v_txt is not null then raise exception 'TEST FAILED: T2d bb_registrar can CREATE in schema(s): %', v_txt; end if;
  if has_database_privilege('bb_registrar', current_database(), 'CREATE') then
    raise exception 'TEST FAILED: T2d bb_registrar can CREATE in the database';
  end if;

  -- T2e. memberships: the API login and roles can't become it; it is a
  --      member of no role; its only possible member is the tables' owner
  if exists (select 1 from pg_roles where rolname = 'authenticator')
     and pg_has_role('authenticator', 'bb_registrar', 'MEMBER') then
    raise exception 'TEST FAILED: T2e authenticator can become bb_registrar';
  end if;
  foreach v_txt in array array['anon', 'authenticated', 'service_role', 'testing_registrar', 'star_registrar'] loop
    if pg_has_role(v_txt, 'bb_registrar', 'MEMBER') then
      raise exception 'TEST FAILED: T2e % can become bb_registrar', v_txt;
    end if;
  end loop;
  if exists (select 1 from pg_auth_members m where m.member = v_reg_oid) then
    raise exception 'TEST FAILED: T2e bb_registrar is a member of another role';
  end if;
  select c.relowner into v_owner from pg_class c where c.oid = 'public.bb_cycles'::regclass;
  if exists (select 1 from pg_auth_members m where m.roleid = v_reg_oid and m.member <> v_owner) then
    raise exception 'TEST FAILED: T2e a role other than the tables'' owner is a member of bb_registrar';
  end if;

  -- T2f. its attributes and settings (contract 8.1)
  if not exists (select 1 from pg_roles r
                  where r.rolname = 'bb_registrar'
                    and r.rolcanlogin and not r.rolinherit and not r.rolcreatedb and not r.rolcreaterole
                    and not r.rolbypassrls and not r.rolreplication and not r.rolsuper
                    and r.rolconnlimit = 5) then
    raise exception 'TEST FAILED: T2f bb_registrar attributes are not login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5';
  end if;
  select array_to_string(s.setconfig, ',') into v_txt
    from pg_db_role_setting s where s.setrole = v_reg_oid and s.setdatabase = 0;
  if v_txt is null
     or position('statement_timeout=5s' in v_txt) = 0
     or position('idle_in_transaction_session_timeout=10s' in v_txt) = 0
     or position('search_path=""' in v_txt) = 0 then
    raise exception 'TEST FAILED: T2f bb_registrar settings are %', v_txt;
  end if;

  -- T2g. one owner for every 0016 function, table and the sequence
  select count(distinct o) into v_n from (
    select p.proowner as o from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
    union all
    select c.relowner from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any (v_tables || array['bb_candidate_ref_seq'])) x;
  if v_n <> 1 then raise exception 'TEST FAILED: T2g 0016 objects have % different owners, expected 1', v_n; end if;

  -- ===================================================================
  -- T4. Cycles
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- T4a (source). Add cycle copies the SOURCE cycle's requirements sheet:
  --      Main's sheet is changed by hand first (Jeffrey's SQL Editor fix -
  --      allowed only without an action tag), then a cycle filled in from
  --      Main gets Main's sheet
  perform set_config('request.jwt.claims', '', true);
  update public.bb_cycles
     set requirements = jsonb_set(requirements, '{source}', '"zz test changed sheet"')
   where id = v_cm;
  perform set_config('tkd.action', 'bb_update_cycle', true);
  begin
    update public.bb_cycles set requirements = jsonb_set(requirements, '{source}', '"zz nope"') where id = v_cm;
    raise exception 'TEST FAILED: T4a the requirements sheet changed although an action tag was set';
  exception when check_violation then null;
  end;
  perform set_config('tkd.action', '', true);
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' From Main', v_today + 40, v_today + 30), v_cm);
  if not v_has_0024 and (v_r ->> 'status' <> 'ok'
     or (select requirements ->> 'source' from public.bb_cycles where id = (v_r ->> 'id')::uuid) <> 'zz test changed sheet') then
    raise exception 'TEST FAILED: T4a Add cycle must copy the source cycle''s requirements, got %', v_r;
  end if;
  -- (after 0024: the DEFAULT rubric is copied, never the source cycle's sheet)
  if v_has_0024 then
    if v_r ->> 'status' <> 'ok'
       or (select requirements from public.bb_cycles where id = (v_r ->> 'id')::uuid)
          is distinct from (select public.bb_rubric_fresh_copy(r.sheet) from public.bb_default_rubric r)
       or (select requirements ->> 'source' from public.bb_cycles where id = (v_r ->> 'id')::uuid) <> 'Default rubric' then
      raise exception 'TEST FAILED: T4a (0024) Add cycle must copy the default rubric, not the source cycle''s sheet, got %', v_r;
    end if;
  end if;
  v_cx := (v_r ->> 'id')::uuid; v_cx_w := v_r ->> 'public_code_worcester'; v_cx_s := v_r ->> 'public_code_shrewsbury';
  if v_cx_w in (v_cm_w, v_cm_s) or v_cx_s in (v_cm_w, v_cm_s) then
    raise exception 'TEST FAILED: T4a two cycles share a link code';
  end if;

  -- T4b. Add cycle's input rules -> invalid, nothing written
  v_p := pg_temp.bbt_payload(v_tag || ' Bad', v_today + 40, v_today + 30);
  v_list := array[
    jsonb_set(v_p, '{days,0,day_date}', to_jsonb(v_today - 1))::text,                 -- a day in the past
    jsonb_set(v_p, '{days,0,end_time}', '"12:00"')::text,                              -- end before start
    jsonb_set(v_p, '{days,1,start_time}', '"05:45"')::text,                            -- before 6:00 AM
    jsonb_set(v_p, '{days,1,end_time}', '"22:15"')::text,                              -- after 10:00 PM
    jsonb_set(v_p, '{days,2,start_time}', '"10:10"')::text,                            -- not on 15 minutes
    jsonb_set(v_p, '{days,2,start_time}', '"25:00"')::text,                            -- not a time
    jsonb_set(v_p, '{days,1,place}', '{"code": "worcester", "other": "x"}')::text,     -- two places
    jsonb_set(v_p, '{days,1,place}', '{"code": "boston"}')::text,                      -- not a school
    jsonb_set(v_p, '{days,1,place}', to_jsonb(jsonb_build_object('other', repeat('x', 101))))::text,  -- other text too long
    jsonb_set(v_p, '{days,0,second}', '{"start": "14:30", "end": "15:30"}')::text,     -- half a second part
    jsonb_set(v_p, '{days,0,second,start}', '"14:00"')::text,                          -- second part before the first ends
    jsonb_set(v_p, '{days,0,parts}', '["breaking"]')::text,                            -- an unknown part
    jsonb_set(v_p, '{days,0,parts}', '[]')::text,                                      -- no part
    jsonb_set(v_p, '{days,0,parts}', '["physical", "physical"]')::text,                -- a part twice
    jsonb_set(v_p, '{days,0,id}', to_jsonb(gen_random_uuid()))::text,                  -- a day id in Add
    jsonb_set(v_p, '{days}', '[]')::text,                                              -- no day
    jsonb_set(v_p, '{plans}', '[]')::text,                                             -- 0 plans
    jsonb_set(v_p, '{plans}', (select jsonb_agg(jsonb_set(v_p -> 'plans' -> 0, '{name}', to_jsonb('Plan ' || g)))
                                 from generate_series(1, 11) as g))::text,             -- 11 plans
    jsonb_set(v_p, '{plans,1}', jsonb_build_object(
      'name', 'Thirteen',
      'payments', (select jsonb_agg(jsonb_build_object('due_on', v_today + 30, 'follows_application_due', false)) from generate_series(1, 13)),
      'amounts', (select jsonb_object_agg(d::text, (select jsonb_agg(1000) from generate_series(1, 13))) from generate_series(1, 4) as d)))::text,
    jsonb_set(v_p, '{plans,0,amounts,1}', '[0]')::text,                                -- a $0 price
    jsonb_set(v_p, '{plans,0,amounts,1}', '[500100]')::text,                           -- $5,001
    jsonb_set(v_p, '{plans,1,amounts,1,0}', '29050')::text,                            -- $290.50
    jsonb_set(v_p, '{plans,1,amounts,1,0}', '"29000"')::text,                          -- a price as text
    jsonb_set(v_p, '{plans,1,amounts,2}', '[33000, 33000]')::text,                     -- an amount missing
    jsonb_set(v_p, '{plans,1,payments,1,follows_application_due}', 'true')::text,      -- follows on payment 2
    jsonb_set(v_p, '{plans,0,payments,0,due_on}', to_jsonb(v_today + 31))::text,      -- follows, but not that date
    jsonb_set(v_p, '{plans,1,payments,2,due_on}', to_jsonb(v_today - 1))::text,       -- a due date in the past
    jsonb_set(v_p, '{plans,1,name}', '"  in   FULL "')::text,                          -- the same plan name twice
    jsonb_set(v_p, '{kukkiwon}', '{"1": 10000, "2": 11000, "3": 14000}')::text,        -- a Kukkiwon fee missing
    jsonb_set(v_p, '{kukkiwon,4}', '0')::text,                                         -- a $0 Kukkiwon fee
    jsonb_set(v_p, '{submissions_due}', to_jsonb(v_today + 55))::text,                 -- a deadline after the last day
    jsonb_set(v_p, '{application_due}', '"2026-02-30"')::text,                         -- not a date
    jsonb_set(v_p, '{auto_close}', 'null')::text,
    jsonb_set(v_p, '{name}', '""')::text,
    (v_p || '{"unknown": 1}')::text];                                                  -- an unknown key
  execute v_snap_sql into v_snap;
  for v_i in 1 .. cardinality(v_list) loop
    v_r := public.bb_add_cycle(v_list[v_i]::jsonb, null);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T4b bad payload % should be invalid, got %', v_i, v_r;
    end if;
  end loop;
  v_r := public.bb_add_cycle(v_p, v_rand);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: T4b an unknown source cycle should be invalid, got %', v_r;
  end if;
  v_r := public.bb_add_cycle(null, null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T4b a null payload should be invalid'; end if;
  -- a part graded on no day -> part_without_day, naming it
  v_r := public.bb_add_cycle(jsonb_set(v_p, '{days,2,parts}', '["technical"]'), null);
  if v_r is distinct from '{"status": "part_without_day", "parts": ["curriculum"]}'::jsonb then
    raise exception 'TEST FAILED: T4b a part on no day should be part_without_day, got %', v_r;
  end if;
  -- the same name (ignoring capitals and spaces) -> duplicate_name
  v_r := public.bb_add_cycle(jsonb_set(v_p, '{name}', to_jsonb('  ' || upper(v_tag) || '    MAIN ')), null);
  if v_r is distinct from '{"status": "duplicate_name"}'::jsonb then
    raise exception 'TEST FAILED: T4b the same name should be duplicate_name, got %', v_r;
  end if;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: T4b a refused Add cycle changed something'; end if;
  -- a part on two days, and other text as the place, are fine
  v_r := public.bb_add_cycle(jsonb_set(jsonb_set(v_p, '{days,1,parts}', '["technical", "physical"]'),
                                       '{days,2,place}', '{"other": "  Horgan Arena  "}'), null);
  if v_r ->> 'status' <> 'ok'
     or (select place_other from public.bb_cycle_days where cycle_id = (v_r ->> 'id')::uuid and name = 'Curriculum') <> 'Horgan Arena' then
    raise exception 'TEST FAILED: T4b a part on two days and other text as the place should be ok, got %', v_r;
  end if;
  v_cy := (v_r ->> 'id')::uuid;   -- never opened (T5e, T6a)

  -- T4c. a cycle's prices never change: no update of a plan, amount or fee
  --      (even as the SQL Editor's role), no insert outside Add cycle, no
  --      removal except with the whole cycle; Edit cycle refuses prices
  perform set_config('request.jwt.claims', '', true);
  foreach v_txt in array array[
      format('update public.bb_cycle_plans set name = %L where id = %L', 'Changed', v_cm_full),
      format('update public.bb_cycle_plans set position = 9 where id = %L', v_cm_full),
      format('update public.bb_cycle_plan_amounts set amount_cents = 100 where cycle_plan_id = %L', v_cm_full),
      format('update public.bb_cycle_kukkiwon_fees set amount_cents = 100 where cycle_id = %L', v_cm),
      format('insert into public.bb_cycle_plans (cycle_id, name, payments_count, position, created_by_name) values (%L, %L, 1, 7, %L)', v_cm, 'Extra', ''),
      format('insert into public.bb_cycle_plan_amounts (cycle_plan_id, dan, payment_no, amount_cents) values (%L, 1, 2, 100)', v_cm_full),
      format('insert into public.bb_cycle_kukkiwon_fees (cycle_id, dan, amount_cents) values (%L, 1, 100)', v_cm),
      format('insert into public.bb_cycle_plan_payments (cycle_plan_id, payment_no, due_on, created_by_name, updated_by_name) values (%L, 2, %L, %L, %L)', v_cm_full, v_today + 25, '', ''),
      format('delete from public.bb_cycle_plan_amounts where cycle_plan_id = %L', v_cm_full),
      format('delete from public.bb_cycle_kukkiwon_fees where cycle_id = %L', v_cm),
      format('delete from public.bb_cycle_plan_payments where cycle_plan_id = %L', v_cm_full),
      format('delete from public.bb_cycle_plans where id = %L', v_cm_full)] loop
    begin
      execute v_txt;
      raise exception 'TEST FAILED: T4c a cycle''s prices changed: %', v_txt;
    exception when check_violation then null;
    end;
  end loop;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select version into v_c2v from public.bb_cycles where id = v_c2;
  foreach v_txt in array array['plans', 'kukkiwon', 'prices_from'] loop
    v_r := public.bb_update_cycle(v_c2, v_c2v, pg_temp.bbt_current(v_c2) || jsonb_build_object(v_txt, v_p -> v_txt));
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T4c Edit cycle with % should be invalid, got %', v_txt, v_r;
    end if;
  end loop;

  -- T4d. Edit cycle
  -- unchanged -> ok, nothing written, the version stays
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_update_cycle(v_c2, v_c2v, pg_temp.bbt_current(v_c2));
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_c2v)
     or exists (select 1 from public.change_log where id > v_mark) then
    raise exception 'TEST FAILED: T4d an unchanged Edit cycle must write nothing, got %', v_r;
  end if;
  -- days matched by id: day 1 gets a second part, day 2 a new end time,
  -- day 3 removed, a new day added (curriculum + technical); payment 2 of
  -- "3 payments" moved; Application due moved (payment 1 follows it)
  v_p := pg_temp.bbt_current(v_c2);
  v_ids := array(select (d.value ->> 'id')::uuid from jsonb_array_elements(v_p -> 'days') as d(value));
  v_p := jsonb_set(v_p, '{days,0,parts}', '["physical", "technical"]');
  v_p := jsonb_set(v_p, '{days,1,end_time}', '"16:00"');
  v_p := jsonb_set(v_p, '{days}', (v_p -> 'days') - 2
                                  || jsonb_build_array(jsonb_build_object(
                                       'name', 'Curriculum B', 'day_date', v_today + 75, 'start_time', '09:00',
                                       'end_time', '11:00', 'place', jsonb_build_object('code', 'worcester'),
                                       'second', null, 'parts', jsonb_build_array('curriculum', 'technical'))));
  v_p := jsonb_set(v_p, '{application_due}', to_jsonb(v_today + 49));
  v_p := jsonb_set(v_p, '{due_dates}',
                   (select jsonb_agg(case when (x.value ->> 'cycle_plan_id')::uuid = v_c2_three and (x.value ->> 'payment_no') = '2'
                                          then jsonb_set(x.value, '{due_on}', to_jsonb(v_today + 70))
                                          else x.value end)
                      from jsonb_array_elements(v_p -> 'due_dates') as x(value)));
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_update_cycle(v_c2, v_c2v, v_p);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_c2v + 1) then
    raise exception 'TEST FAILED: T4d Edit cycle should answer ok with the version up once, got %', v_r;
  end if;
  if not exists (select 1 from public.bb_cycle_days where id = v_ids[1] and cycle_id = v_c2)
     or (select end_time from public.bb_cycle_days where id = v_ids[2]) <> '16:00'
     or exists (select 1 from public.bb_cycle_days where id = v_ids[3])
     or not exists (select 1 from public.bb_cycle_days where cycle_id = v_c2 and name = 'Curriculum B' and day_date = v_today + 75)
     or array(select part from public.bb_cycle_day_parts where day_id = v_ids[1] order by part) <> array['physical', 'technical']
     or (select array_agg(p.part order by p.part) from public.bb_cycle_day_parts p join public.bb_cycle_days d on d.id = p.day_id
          where d.cycle_id = v_c2 and d.name = 'Curriculum B') <> array['curriculum', 'technical']
     or (select due_on from public.bb_cycle_plan_payments where cycle_plan_id = v_c2_three and payment_no = 2) <> v_today + 70
     or (select due_on from public.bb_cycle_plan_payments where cycle_plan_id = v_c2_three and payment_no = 1) <> v_today + 49
     or (select due_on from public.bb_cycle_plan_payments where cycle_plan_id = v_c2_full and payment_no = 1) <> v_today + 49
     or (select application_due from public.bb_cycles where id = v_c2) <> v_today + 49 then
    raise exception 'TEST FAILED: T4d Edit cycle did not save days / parts / due dates as designed';
  end if;
  -- the removed day's parts went with it, every write is in one batch
  if exists (select 1 from public.bb_cycle_day_parts where day_id = v_ids[3])
     or (select count(distinct batch_id) from public.change_log where id > v_mark) <> 1
     or not exists (select 1 from public.change_log where id > v_mark and table_name = 'bb_cycle_days' and op = 'delete')
     or not exists (select 1 from public.change_log where id > v_mark and table_name = 'bb_cycle_day_parts' and op = 'delete') then
    raise exception 'TEST FAILED: T4d the removed day and its parts must be logged in one batch';
  end if;
  v_c2v := v_c2v + 1;
  -- a typed date clears "follows": payment 1 keeps the typed date
  v_p := pg_temp.bbt_current(v_c2);
  v_p := jsonb_set(v_p, '{due_dates}',
                   (select jsonb_agg(case when (x.value ->> 'cycle_plan_id')::uuid = v_c2_full
                                          then jsonb_set(jsonb_set(x.value, '{due_on}', to_jsonb(v_today + 45)), '{follows_application_due}', 'false')
                                          else x.value end)
                      from jsonb_array_elements(v_p -> 'due_dates') as x(value)));
  v_r := public.bb_update_cycle(v_c2, v_c2v, v_p);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_c2v + 1)
     or (select due_on from public.bb_cycle_plan_payments where cycle_plan_id = v_c2_full) <> v_today + 45
     or (select follows_application_due from public.bb_cycle_plan_payments where cycle_plan_id = v_c2_full) then
    raise exception 'TEST FAILED: T4d a typed date on payment 1 must clear "follows", got %', v_r;
  end if;
  v_c2v := v_c2v + 1;
  -- refused edits: a changed date in the past, a day of another cycle, the
  -- same day twice, a due date missing or unknown, "follows" on payment 2,
  -- a part on no day, another cycle's name, an old version
  v_p := pg_temp.bbt_current(v_c2);
  v_list := array[
    jsonb_set(v_p, '{days,0,day_date}', to_jsonb(v_today - 1))::text,
    jsonb_set(v_p, '{days,0,id}', to_jsonb((select id from public.bb_cycle_days where cycle_id = v_cm limit 1)))::text,
    jsonb_set(v_p, '{days,1,id}', v_p -> 'days' -> 0 -> 'id')::text,
    jsonb_set(v_p, '{days,0,id}', '"not-a-uuid"')::text,
    jsonb_set(v_p, '{due_dates}', (v_p -> 'due_dates') - 0)::text,
    jsonb_set(v_p, '{due_dates}', (v_p -> 'due_dates') || jsonb_build_array((v_p -> 'due_dates') -> 0))::text,
    jsonb_set(v_p, '{due_dates,0,payment_no}', '9')::text,
    jsonb_set(v_p, '{due_dates}',
              (select jsonb_agg(case when (x.value ->> 'payment_no') = '2'
                                     then jsonb_set(x.value, '{follows_application_due}', 'true') else x.value end)
                 from jsonb_array_elements(v_p -> 'due_dates') as x(value)))::text,
    jsonb_set(v_p, '{due_dates}',
              (select jsonb_agg(case when (x.value ->> 'payment_no') = '3'
                                     then jsonb_set(x.value, '{due_on}', to_jsonb(v_today - 2)) else x.value end)
                 from jsonb_array_elements(v_p -> 'due_dates') as x(value)))::text,
    (v_p - 'due_dates')::text];
  for v_i in 1 .. cardinality(v_list) loop
    v_r := public.bb_update_cycle(v_c2, v_c2v, v_list[v_i]::jsonb);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T4d bad Edit cycle % should be invalid, got %', v_i, v_r;
    end if;
  end loop;
  v_r := public.bb_update_cycle(v_c2, v_c2v,
           jsonb_set(v_p, '{days}', (select jsonb_agg(jsonb_set(d.value, '{parts}',
                                                                case when d.value -> 'parts' ? 'physical' then '["physical"]'::jsonb
                                                                     else '["technical"]'::jsonb end))
                                       from jsonb_array_elements(v_p -> 'days') as d(value))));
  if v_r is distinct from '{"status": "part_without_day", "parts": ["curriculum"]}'::jsonb then
    raise exception 'TEST FAILED: T4d a part on no day should be part_without_day, got %', v_r;
  end if;
  v_r := public.bb_update_cycle(v_c2, v_c2v, jsonb_set(v_p, '{name}', to_jsonb(lower(v_tag) || ' main')));
  if v_r is distinct from '{"status": "duplicate_name"}'::jsonb then
    raise exception 'TEST FAILED: T4d another cycle''s name should be duplicate_name, got %', v_r;
  end if;
  v_r := public.bb_update_cycle(v_c2, v_c2v - 1, v_p);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T4d an old version should be stale, got %', v_r; end if;
  v_r := public.bb_update_cycle(v_rand, 1, v_p);
  if v_r is distinct from '{"status": "not_found"}'::jsonb then raise exception 'TEST FAILED: T4d an unknown cycle should be not_found, got %', v_r; end if;
  -- a cycle in the past keeps its (unchanged) past dates; a name change is
  -- fine; moving one of its days to another past date is not
  select version into v_v from public.bb_cycles where id = v_co;
  v_r := public.bb_update_cycle(v_co, v_v, pg_temp.bbt_current(v_co));
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v) then
    raise exception 'TEST FAILED: T4d an unchanged past cycle should be ok, got %', v_r;
  end if;
  v_r := public.bb_update_cycle(v_co, v_v, jsonb_set(pg_temp.bbt_current(v_co), '{days,0,name}', '"Physical day"'));
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: T4d a past cycle''s day name change should be ok, got %', v_r;
  end if;
  v_r := public.bb_update_cycle(v_co, v_v + 1,
           jsonb_set(pg_temp.bbt_current(v_co), '{days,0,day_date}',
                     to_jsonb((pg_temp.bbt_current(v_co) -> 'days' -> 0 ->> 'day_date')::date - 1)));
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: T4d moving a past day to another past date should be invalid, got %', v_r;
  end if;

  -- T4e. The registration switch
  select version into v_cmv from public.bb_cycles where id = v_cm;
  -- staff close and open again before Application due
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_set_registration(v_cm, v_cmv, false);
  if v_r ->> 'status' <> 'ok' or v_r -> 'state' ->> 'registration' <> 'closed'
     or (select registration_open from public.bb_cycles where id = v_cm) then
    raise exception 'TEST FAILED: T4e staff close should be ok, got %', v_r;
  end if;
  v_r := public.bb_set_registration(v_cm, (v_r ->> 'version')::integer, true);
  if v_r ->> 'status' <> 'ok' or v_r -> 'state' ->> 'state' <> 'open' then
    raise exception 'TEST FAILED: T4e staff open before Application due should be ok, got %', v_r;
  end if;
  -- the same value writes nothing
  v_v := (v_r ->> 'version')::integer;
  v_r := public.bb_set_registration(v_cm, v_v, true);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> v_v then
    raise exception 'TEST FAILED: T4e switching to the same value must write nothing, got %', v_r;
  end if;
  v_r := public.bb_set_registration(v_cm, v_v - 1, false);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T4e an old version should be stale'; end if;
  v_cmv := v_v;
  -- a cycle never opened: not open yet; the first opening sets first_opened_at
  v_r := public.bb_cycle_state(v_c2, v_today);
  if v_r ->> 'registration' <> 'not_open_yet' or v_r ->> 'public_status' <> 'not_open' then
    raise exception 'TEST FAILED: T4e a never-opened cycle should be not_open_yet, got %', v_r;
  end if;
  if not v_has_0024 then
    v_r := public.bb_set_registration(v_c2, v_c2v, true);
    if v_r ->> 'status' <> 'ok' or (select first_opened_at from public.bb_cycles where id = v_c2) is distinct from now() then
      raise exception 'TEST FAILED: T4e the first opening must set first_opened_at, got %', v_r;
    end if;
    v_c2v := (v_r ->> 'version')::integer;
  else
    -- (0024, v0.930) the desk's first opening -> not_allowed, nothing written
    v_r := public.bb_set_registration(v_c2, v_c2v, true);
    if v_r is distinct from '{"status": "not_allowed"}'::jsonb
       or (select registration_open or first_opened_at is not null or version <> v_c2v from public.bb_cycles where id = v_c2) then
      raise exception 'TEST FAILED: T4e (0024) the desk''s first opening must be not_allowed with nothing written, got %', v_r;
    end if;
    -- the admin's first opening sets first_opened_at
    perform set_config('request.jwt.claims', v_c_a1, true);
    v_r := public.bb_set_registration(v_c2, v_c2v, true);
    if v_r ->> 'status' <> 'ok' or (select first_opened_at from public.bb_cycles where id = v_c2) is distinct from now() then
      raise exception 'TEST FAILED: T4e (0024) the admin''s first opening must set first_opened_at, got %', v_r;
    end if;
    -- then the desk may close and reopen (staff may, once an admin opened it)
    perform set_config('request.jwt.claims', v_c_d1, true);
    v_r := public.bb_set_registration(v_c2, (v_r ->> 'version')::integer, false);
    if v_r ->> 'status' <> 'ok' or v_r -> 'state' ->> 'registration' <> 'closed' then
      raise exception 'TEST FAILED: T4e (0024) the desk''s close after an admin opened should be ok, got %', v_r;
    end if;
    v_r := public.bb_set_registration(v_c2, (v_r ->> 'version')::integer, true);
    if v_r ->> 'status' <> 'ok' or v_r -> 'state' ->> 'state' <> 'open'
       or (select first_opened_at from public.bb_cycles where id = v_c2) is distinct from now() then
      raise exception 'TEST FAILED: T4e (0024) the desk''s reopen should be ok, got %', v_r;
    end if;
    v_c2v := (v_r ->> 'version')::integer;
  end if;
  -- after Application due (with auto close on): staff can't open, an admin
  -- can and auto close is turned off
  perform set_config('request.jwt.claims', '', true);
  update public.bb_cycles set application_due = v_today - 1 where id = v_cdel;
  select version into v_v from public.bb_cycles where id = v_cdel;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_set_registration(v_cdel, v_v, true);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: T4e staff opening after Application due should be not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_set_registration(v_cdel, v_v, true);
  if v_r ->> 'status' <> 'ok' or v_r -> 'state' ->> 'registration' <> 'open'
     or (select auto_close from public.bb_cycles where id = v_cdel) then
    raise exception 'TEST FAILED: T4e an admin reopening after Application due turns auto close off, got %', v_r;
  end if;
  v_r := public.bb_set_registration(v_cdel, (v_r ->> 'version')::integer, false);
  -- a cycle in the past: nothing changes the switch
  select version into v_v from public.bb_cycles where id = v_co;
  v_r := public.bb_set_registration(v_co, v_v, false);
  if v_r is distinct from '{"status": "finished"}'::jsonb then
    raise exception 'TEST FAILED: T4e a past cycle should be finished, got %', v_r;
  end if;
  -- bb_cycle_state with made-up days (Main: open, auto close on,
  -- Application due today + 20, days today + 30 / + 37 / + 44)
  v_r := public.bb_cycle_state(v_cm, v_today + 20);
  if v_r ->> 'state' <> 'open' or v_r ->> 'public_status' <> 'open' or v_r -> 'closed_on' <> 'null'::jsonb
     or (v_r ->> 'next_day')::date <> v_today + 30 or (v_r ->> 'first_day')::date <> v_today + 30
     or (v_r ->> 'last_day')::date <> v_today + 44 then
    raise exception 'TEST FAILED: T4e state on Application due: %', v_r;
  end if;
  v_r := public.bb_cycle_state(v_cm, v_today + 21);
  if v_r ->> 'state' <> 'closed_by_date' or v_r ->> 'public_status' <> 'closed' or (v_r ->> 'closed_on')::date <> v_today + 20 then
    raise exception 'TEST FAILED: T4e state the day after Application due: %', v_r;
  end if;
  -- a testing day after Application due with auto close on and the switch
  -- on: the day tag says "testing today", but the form stays CLOSED
  v_r := public.bb_cycle_state(v_cm, v_today + 30);
  if v_r ->> 'state' <> 'testing_today' or not (v_r ->> 'testing_today')::boolean
     or v_r ->> 'public_status' <> 'closed' or (v_r ->> 'closed_on')::date <> v_today + 20 then
    raise exception 'TEST FAILED: T4e a testing day after Application due must keep the form closed: %', v_r;
  end if;
  v_r := public.bb_cycle_state(v_cm, v_today + 31);
  if v_r ->> 'state' <> 'closed_by_date' or (v_r ->> 'next_day')::date <> v_today + 37 then
    raise exception 'TEST FAILED: T4e state between testing days: %', v_r;
  end if;
  v_r := public.bb_cycle_state(v_cm, v_today + 45);
  if v_r ->> 'state' <> 'past' or v_r ->> 'public_status' <> 'finished' or v_r -> 'next_day' <> 'null'::jsonb then
    raise exception 'TEST FAILED: T4e state the day after the last day: %', v_r;
  end if;

  -- T4f. Delete cycle
  -- Del: two desk candidates only
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_candidate(v_cdel, 'Del', 'One', v_adult, v_mail_tag || '.d1@example.com', 'worcester', 1, v_cdel_full, false, true);
  v_r := public.bb_add_candidate(v_cdel, 'Del', 'Two', v_adult, v_mail_tag || '.d2@example.com', 'shrewsbury', 2, v_cdel_full, true, true);
  perform set_config('request.jwt.claims', v_c_a1, true);
  select version into v_v from public.bb_cycles where id = v_cdel;
  v_r := public.bb_delete_cycle(v_cdel, v_v - 1, 2);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T4f an old version should be stale, got %', v_r; end if;
  v_r := public.bb_delete_cycle(v_cdel, v_v, 1);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T4f a wrong candidate count should be stale, got %', v_r; end if;
  -- with a payment row, even an undone one -> has_payments
  v_r := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' DelPay', v_today + 210, v_today + 200), null);
  v_k2 := (v_r ->> 'id')::uuid;
  v_r := public.bb_add_candidate(v_k2, 'Pay', 'Ing', v_adult, v_mail_tag || '.pi@example.com', 'worcester', 1,
                                 (select id from public.bb_cycle_plans where cycle_id = v_k2 and name = 'In full'), false, true);
  v_k := (v_r ->> 'id')::uuid;
  v_r := public.bb_record_payment(v_k, 1, 1000, 'cash', array['p1'], null);
  v_r := public.bb_undo_payment((v_r ->> 'payment_id')::uuid);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T4f undo answered %', v_r; end if;
  select version into v_v2 from public.bb_cycles where id = v_k2;
  v_r := public.bb_delete_cycle(v_k2, v_v2, 1);
  if v_r is distinct from '{"status": "has_payments"}'::jsonb or not exists (select 1 from public.bb_cycles where id = v_k2) then
    raise exception 'TEST FAILED: T4f a cycle with (undone) payment rows should be has_payments, got %', v_r;
  end if;
  -- with a waiver signed on the form -> has_waivers (Near has none, Old
  -- has payments? no: Old has form waivers and no payment)
  select version into v_v2 from public.bb_cycles where id = v_co;
  v_r := public.bb_delete_cycle(v_co, v_v2, (select count(*)::integer from public.bb_candidates where cycle_id = v_co));
  if v_r is distinct from '{"status": "has_waivers"}'::jsonb then
    raise exception 'TEST FAILED: T4f a cycle with an online-signed waiver should be has_waivers, got %', v_r;
  end if;
  -- desk candidates only -> ok: everything cascaded, logged in one batch
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_delete_cycle(v_cdel, v_v, 2);
  if v_r is distinct from '{"status": "ok"}'::jsonb then raise exception 'TEST FAILED: T4f delete Del should be ok, got %', v_r; end if;
  if exists (select 1 from public.bb_cycles where id = v_cdel)
     or exists (select 1 from public.bb_cycle_days where cycle_id = v_cdel)
     or exists (select 1 from public.bb_cycle_plans where cycle_id = v_cdel)
     or exists (select 1 from public.bb_candidates where cycle_id = v_cdel) then
    raise exception 'TEST FAILED: T4f Delete cycle left rows behind';
  end if;
  select string_agg(x.t || '=' || x.n, ',' order by x.t) into v_txt
    from (select l.table_name as t, count(*) as n from public.change_log l
           where l.id > v_mark and l.op = 'delete' and l.action = 'bb_delete_cycle' group by l.table_name) as x;
  if v_txt is distinct from 'bb_candidate_waivers=2,bb_candidates=2,bb_cycle_day_parts=3,bb_cycle_days=3,bb_cycle_kukkiwon_fees=4,'
                            'bb_cycle_plan_amounts=16,bb_cycle_plan_payments=4,bb_cycle_plans=2,bb_cycles=1'
     or (select count(distinct batch_id) from public.change_log where id > v_mark) <> 1
     or exists (select 1 from public.change_log where id > v_mark and (action <> 'bb_delete_cycle' or op <> 'delete')) then
    raise exception 'TEST FAILED: T4f Delete cycle must log every removed row in one batch, got %', v_txt;
  end if;

  -- ===================================================================
  -- T5. The family form (called as the SQL Editor's role: the public
  --     functions run as their owner either way)
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);

  -- T5a. bb_public_cycle: the right school for each link; unknown or badly
  --      formed codes -> not_found; nothing but the cycle's facts and the
  --      plan ids
  foreach v_txt in array array[v_cm_w, v_cm_s] loop
    v_r := public.bb_public_cycle(v_txt);
    if v_r ->> 'status' <> 'ok' or v_r ->> 'state' <> 'open'
       or v_r -> 'school' ->> 'code' <> (case when v_txt = v_cm_w then 'worcester' else 'shrewsbury' end)
       or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['closed_on', 'cycle', 'school', 'state', 'status', 'waiver']
       or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'cycle') as k)
          <> array['application_due', 'days', 'kukkiwon', 'name', 'plans', 'requirements', 'submissions_due']
       or jsonb_array_length(v_r -> 'cycle' -> 'days') <> 3
       or v_r -> 'cycle' -> 'days' -> 0 -> 'place' ->> 'name' <> (select name from public.locations where code = 'worcester')
       or v_r -> 'cycle' -> 'days' -> 0 -> 'second' -> 'place' ->> 'name' <> 'Horgan Arena, 403 Oxford St N, Auburn MA 01501'
       or v_r -> 'cycle' -> 'days' -> 0 -> 'second' ->> 'start_time' <> '14:30'
       or v_r -> 'cycle' -> 'days' -> 1 ->> 'start_time' <> '12:30'
       or v_r -> 'cycle' -> 'days' -> 2 -> 'parts' <> '["curriculum"]'
       or (select array_agg((p.value ->> 'id')::uuid order by p.value ->> 'position') from jsonb_array_elements(v_r -> 'cycle' -> 'plans') as p(value))
          <> array[v_cm_full, v_cm_three]
       or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'cycle' -> 'plans' -> 0) as k)
          <> array['amounts', 'id', 'name', 'payments', 'position']
       or v_r -> 'cycle' -> 'plans' -> 1 -> 'amounts' -> '4' <> '[90000, 90000, 90000]'
       or v_r -> 'cycle' -> 'kukkiwon' <> '{"1": 10000, "2": 11000, "3": 14000, "4": 17000}'
       or (not v_has_0024 and v_r -> 'cycle' -> 'requirements' <> (select requirements from public.bb_cycles where id = v_cm))
       or v_r -> 'waiver' <> jsonb_build_object('version_name', v_wv_name, 'body', 'zz test waiver text ' || v_tag) then
      raise exception 'TEST FAILED: T5a public cycle answer for % is not as designed: %', v_txt, left(v_r::text, 600);
    end if;
    -- (0024) the requirements are the rubric's public view (in its own
    -- block: the function doesn't exist before 0024)
    if v_has_0024 then
      if v_r -> 'cycle' -> 'requirements'
         is distinct from (select public.bb_rubric_public(requirements) from public.bb_cycles where id = v_cm) then
        raise exception 'TEST FAILED: T5a (0024) the public requirements must be bb_rubric_public of the cycle''s rubric';
      end if;
    end if;
    -- no ids (except the plans'), no counts, nobody's data
    if position(v_cm::text in v_r::text) > 0
       or exists (select 1 from public.bb_cycle_days d where d.cycle_id = v_cm and position(d.id::text in v_r::text) > 0)
       or exists (select 1 from public.bb_candidates c where c.cycle_id = v_cm
                   and position(c.id::text in v_r::text) > 0) then
      raise exception 'TEST FAILED: T5a the public cycle answer holds an id, a count or a candidate';
    end if;
  end loop;
  foreach v_txt in array array['zzzzzzzz', 'ABCDEFGH', 'abc', 'abcdefghi', ''] loop
    v_r := public.bb_public_cycle(v_txt);
    if v_r is distinct from '{"status": "not_found"}'::jsonb then
      raise exception 'TEST FAILED: T5a code % should be not_found, got %', v_txt, v_r;
    end if;
  end loop;
  if public.bb_public_cycle(null) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: T5a a null code should be not_found';
  end if;

  -- T5b. registered from the form: source 'form', a BB- reference, the
  --      link's school, a drawn waiver with "signed as a minor" right for a
  --      17- and an 18-year-old on the first testing day, written by
  --      "Family form"
  if (select source from public.bb_candidates where id = v_f1) <> 'form'
     or (select reference from public.bb_candidates where id = v_f1) !~ '^BB-[0-9]{4,}$'
     or (select location_code from public.bb_candidates where id = v_f1) <> 'shrewsbury'
     or (select location_code from public.bb_candidates where id = v_f2) <> 'worcester'
     or (select kukkiwon_added_on from public.bb_candidates where id = v_f1) <> v_today
     or (select created_by_name from public.bb_candidates where id = v_f1) <> 'Family form'
     or not (select signed_as_minor from public.bb_candidate_waivers where candidate_id = v_f1)
     or (select signed_as_minor from public.bb_candidate_waivers where candidate_id = v_f2)
     or (select how || '|' || signer_name || '|' || (signature = v_sig)::text || '|' || (submission_id = v_sub1)::text
                || '|' || waiver_version_id::text
           from public.bb_candidate_waivers where candidate_id = v_f1) <> 'drawn|' || v_signer || '|true|true|' || v_wv::text then
    raise exception 'TEST FAILED: T5b the form registration was not stored as designed';
  end if;
  if exists (select 1 from public.change_log l
              where l.id > v_mark0 and l.action = 'bb_public_register'
                and (l.actor_name <> 'Family form' or l.actor_id is not null or l.session_id is not null)) then
    raise exception 'TEST FAILED: T5b form history rows must be by "Family form" with no login id or session';
  end if;
  -- even with an ADMIN's login token in the session, it is still "Family
  -- form" and the token is empty inside
  perform set_config('request.jwt.claims', v_c_a1, true);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_public_register(v_cm_w, v_tag || ' k3', gen_random_uuid(), 'Ima', 'Admin', v_adult,
                                   v_mail_tag || '.ima@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r ->> 'status' <> 'ok'
     or not exists (select 1 from public.change_log where id > v_mark)
     or exists (select 1 from public.change_log l
                 where l.id > v_mark and (l.actor_name <> 'Family form' or l.actor_id is not null or l.session_id is not null))
     or current_setting('request.jwt.claims', true) <> '' then
    raise exception 'TEST FAILED: T5b a form call with an admin token must still be "Family form" (and clear the token), got %', v_r;
  end if;
  perform set_config('request.jwt.claims', '', true);
  -- the older single-claim setting (auth.jwt() reads it first) is cleared
  -- too: a supplied session id must not reach the history (review S1)
  perform set_config('request.jwt.claim', v_c_a1, true);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_public_register(v_cm_w, v_tag || ' k3b', gen_random_uuid(), 'Ima', 'Claim', v_adult,
                                   v_mail_tag || '.imaclaim@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r ->> 'status' <> 'ok'
     or not exists (select 1 from public.change_log where id > v_mark)
     or exists (select 1 from public.change_log l
                 where l.id > v_mark and (l.actor_name <> 'Family form' or l.actor_id is not null or l.session_id is not null))
     or current_setting('request.jwt.claim', true) <> '' then
    raise exception 'TEST FAILED: T5b a form call with the single-claim setting must still be "Family form" with no session, got %', v_r;
  end if;
  perform set_config('request.jwt.claim', '', true);

  -- T5c. idempotency: the same submission id again -> the same answer and
  --      no second row; on another cycle -> invalid; a retry after the
  --      cycle was closed, or from a client key over the hourly limit,
  --      still gets the ok answer (the lookup comes first)
  v_r2 := public.bb_public_answer(v_f1);
  select count(*) into v_n from public.bb_candidates where cycle_id = v_cm;
  v_r := public.bb_public_register(v_cm_s, v_tag || ' k1', v_sub1, 'Bo', 'Kim', v_dob17, v_mail_tag || '.bo@example.com',
                                   1, v_cm_three, true, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from v_r2 or (select count(*) from public.bb_candidates where cycle_id = v_cm) <> v_n then
    raise exception 'TEST FAILED: T5c the same submission id must give the same answer and no new row, got %', v_r;
  end if;
  v_r := public.bb_public_register(v_cx_w, v_tag || ' k1', v_sub1, 'Bo', 'Kim', v_dob17, v_mail_tag || '.bo@example.com',
                                   1, (select id from public.bb_cycle_plans where cycle_id = v_cx limit 1), true, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: T5c the same submission id on another cycle should be invalid, got %', v_r;
  end if;
  update public.bb_cycles set registration_open = false where id = v_cm;
  v_r := public.bb_public_register(v_cm_s, v_tag || ' k1', v_sub1, 'Bo', 'Kim', v_dob17, v_mail_tag || '.bo@example.com',
                                   1, v_cm_three, true, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from v_r2 then
    raise exception 'TEST FAILED: T5c a retry after the cycle closed must still get the ok answer, got %', v_r;
  end if;
  update public.bb_cycles set registration_open = true where id = v_cm;
  v_key := v_tag || ' over';
  insert into public.testing_public_attempts (client_key, event_id, outcome)
  select v_key, null::uuid, 'bb:ok' from generate_series(1, 25);
  v_r := public.bb_public_register(v_cm_s, v_key, v_sub1, 'Bo', 'Kim', v_dob17, v_mail_tag || '.bo@example.com',
                                   1, v_cm_three, true, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from v_r2 then
    raise exception 'TEST FAILED: T5c a retry from a key over the limit must still get the ok answer, got %', v_r;
  end if;

  -- T5d. every input rule -> invalid, nothing written
  execute v_snap_sql into v_snap;
  v_list := array[
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Fut', 'Ure', v_today + 1, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Old', 'Er', date '1899-12-31', v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Bad', 'Mail', v_adult, 'not an email', v_cm_full, v_wv_name, v_signer, v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Other', 'Plan', v_adult, v_mail_tag || '.f@example.com', v_c2_full, v_wv_name, v_signer, v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 5, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Dan', 'Five', v_adult, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, false, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Un', 'Ticked', v_adult, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, null, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'No', 'Kuk', v_adult, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Gif', 'Sig', v_adult, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, v_sig_gif),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Long', 'Sig', v_adult, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, v_sig_long),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Not', 'Png', v_adult, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, '<script>x</script>'),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Blank', 'Signer', v_adult, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, '   ', v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, '', 'No', 'Key', v_adult, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, v_sig),
    format('public.bb_public_register(%L, %L, null, %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'No', 'Sub', v_adult, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', '', 'Blank', v_adult, v_mail_tag || '.f@example.com', v_cm_full, v_wv_name, v_signer, v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'Bad', 'Version', v_adult, v_mail_tag || '.f@example.com', v_cm_full, 'v1', v_signer, v_sig),
    format('public.bb_public_register(%L, %L, gen_random_uuid(), %L, %L, %L::date, %L, 1, %L::uuid, false, true, %L, %L, %L)',
           v_cm_w, v_tag || ' k4', 'No', 'Version', v_adult, v_mail_tag || '.f@example.com', v_cm_full, '2099-9', v_signer, v_sig)];
  for v_i in 1 .. cardinality(v_list) loop
    execute 'select ' || v_list[v_i] into v_r;
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T5d bad form input % should be invalid, got %', v_i, v_r;
    end if;
  end loop;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: T5d a refused form call changed something'; end if;

  -- T5e. the states the form can be in
  --      not_open (never opened), closed + closed_on (closed by the date),
  --      closed + null (closed by hand), finished (past); on a testing day
  --      after Application due with auto close on: closed + closed_on (the
  --      day tag never opens the form)
  select public_code_worcester into v_txt from public.bb_cycles where id = v_cy;
  v_r := public.bb_public_register(v_txt, v_tag || ' k5', gen_random_uuid(), 'Not', 'Open', v_adult,
                                   v_mail_tag || '.no@example.com', 1, (select id from public.bb_cycle_plans where cycle_id = v_cy limit 1),
                                   false, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from '{"status": "not_open"}'::jsonb or public.bb_public_cycle(v_txt) ->> 'state' <> 'not_open' then
    raise exception 'TEST FAILED: T5e a never-opened cycle should be not_open, got %', v_r;
  end if;
  update public.bb_cycles set registration_open = false where id = v_cm;
  v_r := public.bb_public_register(v_cm_w, v_tag || ' k5', gen_random_uuid(), 'Closed', 'Hand', v_adult,
                                   v_mail_tag || '.ch@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from '{"status": "closed", "closed_on": null}'::jsonb then
    raise exception 'TEST FAILED: T5e closed by hand should be closed + null, got %', v_r;
  end if;
  update public.bb_cycles set registration_open = true where id = v_cm;
  -- Main2 (open, auto close on): Application due moved to yesterday
  update public.bb_cycles set application_due = v_today - 1 where id = v_c2;
  v_r := public.bb_public_register(v_c2_w, v_tag || ' k5', gen_random_uuid(), 'Closed', 'Date', v_adult,
                                   v_mail_tag || '.cd@example.com', 1, v_c2_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from jsonb_build_object('status', 'closed', 'closed_on', v_today - 1)
     or public.bb_public_cycle(v_c2_w) ->> 'state' <> 'closed'
     or (public.bb_public_cycle(v_c2_w) ->> 'closed_on')::date <> v_today - 1 then
    raise exception 'TEST FAILED: T5e closed by the date should be closed + the date, got %', v_r;
  end if;
  -- ... and its first testing day moved to TODAY: still closed
  update public.bb_cycle_days set day_date = v_today
   where id = (select id from public.bb_cycle_days where cycle_id = v_c2 order by day_date, id limit 1);
  if public.bb_cycle_state(v_c2, v_today) ->> 'state' <> 'testing_today' then
    raise exception 'TEST SETUP: T5e Main2 should be testing today';
  end if;
  v_r := public.bb_public_register(v_c2_w, v_tag || ' k5', gen_random_uuid(), 'Testing', 'Today', v_adult,
                                   v_mail_tag || '.tt@example.com', 1, v_c2_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from jsonb_build_object('status', 'closed', 'closed_on', v_today - 1) then
    raise exception 'TEST FAILED: T5e a testing day after Application due must stay closed, got %', v_r;
  end if;
  v_r := public.bb_public_register(v_co_w, v_tag || ' k5', gen_random_uuid(), 'Fin', 'Ished', v_adult,
                                   v_mail_tag || '.fi@example.com', 1, v_co_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from '{"status": "finished"}'::jsonb or public.bb_public_cycle(v_co_w) ->> 'state' <> 'finished' then
    raise exception 'TEST FAILED: T5e a past cycle should be finished, got %', v_r;
  end if;

  -- T5f. the 24-hour waiver rule (v0.905): a version superseded 23 h 59
  --      min ago is accepted and stored exactly; 24 h 1 min ago ->
  --      waiver_changed, nothing written; the placeholder (superseded just
  --      now) -> waiver_changed; bb_waiver_version_ok on both sides of 24 h
  insert into public.bb_waiver_versions (version_name, body, is_placeholder, superseded_at, created_by_name)
  values ('1998-1', 'zz test version 23h59', false, now() - interval '23 hours 59 minutes', ''),
         ('1998-2', 'zz test version 24h01', false, now() - interval '24 hours 1 minute', '');
  select id into v_w23 from public.bb_waiver_versions where version_name = '1998-1';
  select id into v_w24 from public.bb_waiver_versions where version_name = '1998-2';
  v_r := public.bb_public_register(v_cm_w, v_tag || ' k6', gen_random_uuid(), 'Ver', 'Twentythree', v_adult,
                                   v_mail_tag || '.v23@example.com', 1, v_cm_full, false, true, '1998-1', v_signer, v_sig);
  if v_r ->> 'status' <> 'ok'
     or (select w.waiver_version_id from public.bb_candidate_waivers w join public.bb_candidates c on c.id = w.candidate_id
          where c.reference = v_r ->> 'reference') is distinct from v_w23 then
    raise exception 'TEST FAILED: T5f a version superseded 23 h 59 min ago must be accepted and stored, got %', v_r;
  end if;
  execute v_snap_sql into v_snap;
  foreach v_txt in array array['1998-2', v_ph_name] loop
    v_r := public.bb_public_register(v_cm_w, v_tag || ' k6', gen_random_uuid(), 'Ver', 'Old', v_adult,
                                     v_mail_tag || '.v24@example.com', 1, v_cm_full, false, true, v_txt, v_signer, v_sig);
    if v_r is distinct from '{"status": "waiver_changed"}'::jsonb then
      raise exception 'TEST FAILED: T5f version % should be waiver_changed, got %', v_txt, v_r;
    end if;
  end loop;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: T5f a waiver_changed call changed something'; end if;
  select superseded_at into v_ts from public.bb_waiver_versions where id = v_w23;
  if not public.bb_waiver_version_ok(v_w23, v_ts + interval '23 hours 59 minutes')
     or public.bb_waiver_version_ok(v_w23, v_ts + interval '24 hours 1 minute')
     or not public.bb_waiver_version_ok(v_wv, now() + interval '30 days')
     or public.bb_waiver_version_ok(v_ph, now() - interval '1 hour')
     or public.bb_waiver_version_ok(v_rand, now()) then
    raise exception 'TEST FAILED: T5f bb_waiver_version_ok on both sides of 24 hours';
  end if;

  -- T5g. the rate limit: 20 tries in an hour from one client key, counting
  --      Color Belt's and Star's tries too; 200+ tries for the cycle from
  --      many keys are NOT refused; every call writes one "bb:" row; rows
  --      older than 2 days are removed
  v_key := v_tag || ' rl';
  insert into public.testing_public_attempts (client_key, event_id, outcome)
  select v_key, null::uuid, 'ok' from generate_series(1, 12)
  union all
  select v_key, null::uuid, 'star:ok' from generate_series(1, 7);
  insert into public.testing_public_attempts (client_key, event_id, outcome, at)
  values (v_tag || ' ancient', null::uuid, 'bb:ok', now() - interval '3 days');
  select count(*) into v_n from public.testing_public_attempts where outcome like 'bb:%' and at > now() - interval '2 days';
  v_r := public.bb_public_register(v_cm_w, v_key, gen_random_uuid(), 'Rate', 'One', v_adult,
                                   v_mail_tag || '.r1@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T5g the 20th try should be ok, got %', v_r; end if;
  if (select count(*) from public.testing_public_attempts where outcome like 'bb:%' and at > now() - interval '2 days') <> v_n + 1
     or exists (select 1 from public.testing_public_attempts where client_key = v_tag || ' ancient')
     or (select count(*) from public.testing_public_attempts where client_key = v_key and outcome = 'bb:ok' and event_id = v_cm) <> 1 then
    raise exception 'TEST FAILED: T5g one bb: row per call, and rows older than 2 days removed';
  end if;
  v_r := public.bb_public_register(v_cm_w, v_key, gen_random_uuid(), 'Rate', 'Two', v_adult,
                                   v_mail_tag || '.r2@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from '{"status": "rate_limited"}'::jsonb
     or not exists (select 1 from public.testing_public_attempts where client_key = v_key and outcome = 'bb:rate_limited') then
    raise exception 'TEST FAILED: T5g the 21st try within an hour should be rate_limited (and counted), got %', v_r;
  end if;
  insert into public.testing_public_attempts (client_key, event_id, outcome)
  select v_tag || ' many ' || g, v_cm, 'bb:ok' from generate_series(1, 210) as g;
  v_r := public.bb_public_register(v_cm_w, v_tag || ' fresh', gen_random_uuid(), 'Busy', 'Cycle', v_adult,
                                   v_mail_tag || '.bc@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: T5g 200+ tries for a cycle must not refuse a new family, got %', v_r;
  end if;

  -- T5h. a same-name + same-DOB registration is marked "possible
  --      duplicate" on both rows, and its answer has the same shape as any
  --      other; no answer holds a DOB, email, signer's name or signature
  v_r := public.bb_public_register(v_cm_w, v_tag || ' k7', gen_random_uuid(), 'Dup', 'Twin', v_adult,
                                   v_mail_tag || '.t1@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  v_r2 := public.bb_public_register(v_cm_s, v_tag || ' k7', gen_random_uuid(), ' dup ', ' TWIN ', v_adult,
                                    v_mail_tag || '.t2@example.com', 3, v_cm_three, true, true, v_wv_name, v_signer, v_sig);
  select id into v_k from public.bb_candidates where reference = v_r ->> 'reference';
  select id into v_k2 from public.bb_candidates where reference = v_r2 ->> 'reference';
  if (select duplicate_state || '|' || duplicate_of::text from public.bb_candidates where id = v_k) <> 'possible|' || v_k2::text
     or (select duplicate_state || '|' || duplicate_of::text from public.bb_candidates where id = v_k2) <> 'possible|' || v_k::text
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k)
        <> (select array_agg(k order by k) from jsonb_object_keys(v_r2) as k)
     or (select array_agg(k order by k) from jsonb_object_keys(v_r2) as k)
        <> array['cycle_name', 'dan', 'first_name', 'items', 'kukkiwon', 'last_name', 'plan_name', 'reference', 'school', 'status', 'total_cents']
     or v_r2 -> 'school' <> jsonb_build_object('code', 'shrewsbury', 'name', (select name from public.locations where code = 'shrewsbury'))
     or (v_r2 ->> 'total_cents')::bigint <> 150000 + 14000
     or jsonb_array_length(v_r2 -> 'items') <> 4 then
    raise exception 'TEST FAILED: T5h duplicates are marked on both rows and answered like any other: % / %', v_r, v_r2;
  end if;
  foreach v_txt in array array[v_r::text, v_r2::text, public.bb_public_answer(v_f1)::text] loop
    if position(v_adult::text in v_txt) > 0 or position(v_dob17::text in v_txt) > 0 or position(v_mail_tag in v_txt) > 0
       or position(v_signer in v_txt) > 0 or position('data:image' in v_txt) > 0 then
      raise exception 'TEST FAILED: T5h a public answer holds a DOB, an email, the signer''s name or a signature: %', v_txt;
    end if;
  end loop;

  -- ===================================================================
  -- T6. Candidates
  -- ===================================================================

  -- T6a. desk add: the paper tick, DOB and email are required (S5); works
  --      while registration is closed; refused once the cycle is past; the
  --      reference comes from the same counter as the form; a paper waiver
  --      row ticked by the caller
  perform set_config('request.jwt.claims', v_c_d1, true);
  execute v_snap_sql into v_snap;
  foreach v_txt in array array[
      format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, false)', v_cm, 'No', 'Tick', v_adult, v_mail_tag || '.x@example.com', 'worcester', v_cm_full),
      format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, null)', v_cm, 'No', 'Tick', v_adult, v_mail_tag || '.x@example.com', 'worcester', v_cm_full),
      format('public.bb_add_candidate(%L::uuid, %L, %L, null, %L, %L, 1, %L::uuid, false, true)', v_cm, 'No', 'Dob', v_mail_tag || '.x@example.com', 'worcester', v_cm_full),
      format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, null, %L, 1, %L::uuid, false, true)', v_cm, 'No', 'Mail', v_adult, 'worcester', v_cm_full),
      format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, true)', v_cm, 'Bad', 'Mail', v_adult, 'x@', 'worcester', v_cm_full),
      format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, true)', v_cm, 'Fut', 'Ure', v_today + 1, v_mail_tag || '.x@example.com', 'worcester', v_cm_full),
      format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, true)', v_cm, 'No', 'School', v_adult, v_mail_tag || '.x@example.com', 'boston', v_cm_full),
      format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 0, %L::uuid, false, true)', v_cm, 'Dan', 'Zero', v_adult, v_mail_tag || '.x@example.com', 'worcester', v_cm_full),
      format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, null, true)', v_cm, 'No', 'Kuk', v_adult, v_mail_tag || '.x@example.com', 'worcester', v_cm_full),
      format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, true)', v_cm, 'Other', 'Plan', v_adult, v_mail_tag || '.x@example.com', 'worcester', v_c2_full)] loop
    execute 'select ' || v_txt into v_r;
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T6a bad desk add should be invalid, got % from %', v_r, v_txt;
    end if;
  end loop;
  v_r := public.bb_add_candidate(v_co, 'Past', 'Cycle', v_adult, v_mail_tag || '.pc@example.com', 'worcester', 1, v_co_full, false, true);
  if v_r is distinct from '{"status": "finished"}'::jsonb then
    raise exception 'TEST FAILED: T6a a desk add on a past cycle should be finished, got %', v_r;
  end if;
  v_r := public.bb_add_candidate(v_rand, 'No', 'Cycle', v_adult, v_mail_tag || '.nc@example.com', 'worcester', 1, v_cm_full, false, true);
  if v_r is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: T6a an unknown cycle should be not_found, got %', v_r;
  end if;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: T6a a refused desk add changed something'; end if;
  -- works on a cycle whose registration was never opened
  select max(substr(reference, 4)::bigint) into v_mark from public.bb_candidates;
  v_r := public.bb_add_candidate(v_cy, '  Walk ', ' In ', v_adult, ' ' || v_mail_tag || '.wi@Example.com ', 'shrewsbury', 4,
                                 (select id from public.bb_cycle_plans where cycle_id = v_cy and name = '3 payments'), true, true);
  v_k := (v_r ->> 'id')::uuid;
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> 1
     or substr(v_r ->> 'reference', 4)::bigint <= v_mark
     or (select first_name || '|' || last_name || '|' || email_for_results || '|' || source || '|' || kukkiwon_added_on::text
           from public.bb_candidates where id = v_k) <> 'Walk|In|' || v_mail_tag || '.wi@Example.com|desk|' || v_today::text
     or (select count(*) from public.bb_candidate_waivers where candidate_id = v_k) <> 1
     or (select how || '|' || ticked_by_name || '|' || signed_as_minor::text || '|' || waiver_version_id::text
                || '|' || coalesce(signer_name, '-') || '|' || coalesce(signature, '-') || '|' || coalesce(submission_id::text, '-')
           from public.bb_candidate_waivers where candidate_id = v_k) <> 'paper|Staff|false|' || v_wv::text || '|-|-|-' then
    raise exception 'TEST FAILED: T6a a desk add while registration is closed: %', v_r;
  end if;

  -- T6b. Edit details
  select version into v_k1v from public.bb_candidates where id = v_k1;
  v_r := public.bb_update_candidate(v_k1, v_k1v - 1, 'Ann', 'Lee', v_adult, v_mail_tag || '.ann@example.com', 'worcester', 1);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T6b an old version should be stale, got %', v_r; end if;
  -- DOB and email required (both empty only after the purge)
  v_r := public.bb_update_candidate(v_k1, v_k1v, 'Ann', 'Lee', null, null, 'worcester', 1);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T6b DOB and email are required, got %', v_r; end if;
  v_r := public.bb_update_candidate(v_k1, v_k1v, 'Ann', 'Lee', v_adult, null, 'worcester', 1);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T6b DOB without email is invalid, got %', v_r; end if;
  -- unchanged -> no write
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_update_candidate(v_k1, v_k1v, 'Ann', 'Lee', v_adult, v_mail_tag || '.ann@example.com', 'worcester', 1);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_k1v, 'needs_parent_signature', false)
     or exists (select 1 from public.change_log where id > v_mark) then
    raise exception 'TEST FAILED: T6b an unchanged Edit details must write nothing, got %', v_r;
  end if;
  -- a school change moves the candidate, NOT the recorded payment (v0.903)
  v_r := public.bb_update_candidate(v_k1, v_k1v, 'Ann', 'Lee', v_adult, v_mail_tag || '.ann@example.com', 'shrewsbury', 1);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> v_k1v + 1
     or (select location_code from public.bb_candidates where id = v_k1) <> 'shrewsbury'
     or (select location_code from public.bb_payments where id = v_p1) <> 'worcester' then
    raise exception 'TEST FAILED: T6b a school change must move the candidate and keep the payment''s school, got %', v_r;
  end if;
  v_k1v := v_k1v + 1;
  -- a DOB or email fix alone also bumps the version (on purpose)
  v_r := public.bb_update_candidate(v_k1, v_k1v, 'Ann', 'Lee', v_adult, v_mail_tag || '.ann2@example.com', 'shrewsbury', 1);
  if (v_r ->> 'version')::integer <> v_k1v + 1 then
    raise exception 'TEST FAILED: T6b an email fix must bump the version, got %', v_r;
  end if;
  v_k1v := v_k1v + 1;
  -- a Dan change once paid: staff not_allowed, admin ok
  v_r := public.bb_update_candidate(v_k1, v_k1v, 'Ann', 'Lee', v_adult, v_mail_tag || '.ann2@example.com', 'shrewsbury', 2);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: T6b a staff Dan change after a payment should be not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_update_candidate(v_k1, v_k1v, 'Ann', 'Lee', v_adult, v_mail_tag || '.ann2@example.com', 'shrewsbury', 2);
  if v_r ->> 'status' <> 'ok' or (select dan from public.bb_candidates where id = v_k1) <> 2 then
    raise exception 'TEST FAILED: T6b an admin Dan change after a payment should be ok, got %', v_r;
  end if;
  v_r := public.bb_update_candidate(v_k1, (v_r ->> 'version')::integer, 'Ann', 'Lee', v_adult, v_mail_tag || '.ann2@example.com', 'shrewsbury', 1);
  select version into v_k1v from public.bb_candidates where id = v_k1;
  -- a DOB fix that makes an adult-signed candidate a minor on the first
  -- day -> needs_parent_signature; a paper re-sign clears it. (The
  -- candidate is written by hand with its waiver signed an hour ago, so
  -- "newest" is clear inside this one test transaction.)
  perform set_config('request.jwt.claims', '', true);
  v_k2 := pg_temp.bbt_due_candidate(v_cm, 'Fix', v_adult, v_mail_tag || '.fix@example.com', 'paper');
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_update_candidate(v_k2, 1, 'Fix', 'Duecase', v_dob17, v_mail_tag || '.fix@example.com', 'worcester', 1);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'needs_parent_signature')::boolean is not true
     or (public.bb_candidate_detail(v_k2) ->> 'needs_parent_signature')::boolean is not true then
    raise exception 'TEST FAILED: T6b a DOB fix making a minor should need a parent''s signature, got %', v_r;
  end if;
  v_r := public.bb_record_paper_waiver(v_k2, (v_r ->> 'version')::integer);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'needs_parent_signature')::boolean
     or (select count(*) from public.bb_candidate_waivers where candidate_id = v_k2) <> 2
     or not (select signed_as_minor from public.bb_candidate_waivers where candidate_id = v_k2 order by signed_at desc limit 1)
     or (public.bb_candidate_detail(v_k2) ->> 'needs_parent_signature')::boolean then
    raise exception 'TEST FAILED: T6b a paper re-sign must clear the warning, got %', v_r;
  end if;
  v_r := public.bb_record_paper_waiver(v_k2, 1);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T6b paper re-sign with an old version should be stale'; end if;
  v_r := public.bb_record_paper_waiver(v_o1, (select version from public.bb_candidates where id = v_o1));
  if v_r is distinct from '{"status": "finished"}'::jsonb then
    raise exception 'TEST FAILED: T6b a paper re-sign on a past cycle should be finished, got %', v_r;
  end if;

  -- T6c. Change plan or Kukkiwon: staff before any payment, admins after
  v_r := public.bb_add_candidate(v_cm, 'Plan', 'Changer', v_adult, v_mail_tag || '.pl@example.com', 'worcester', 1, v_cm_three, false, true);
  v_k := (v_r ->> 'id')::uuid;
  v_r := public.bb_change_plan(v_k, 1, v_cm_full, true);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> 2
     or (select cycle_plan_id from public.bb_candidates where id = v_k) <> v_cm_full
     or (select kukkiwon_added_on from public.bb_candidates where id = v_k) <> v_today
     or (v_r -> 'money' ->> 'total_due_cents')::bigint <> 87000 + 10000 then
    raise exception 'TEST FAILED: T6c a staff plan change before a payment should be ok, got %', v_r;
  end if;
  v_r := public.bb_change_plan(v_k, 2, v_cm_full, true);
  if (v_r ->> 'version')::integer <> 2 then raise exception 'TEST FAILED: T6c the same plan must write nothing, got %', v_r; end if;
  v_r := public.bb_change_plan(v_k, 2, v_cm_full, false);
  if (select kukkiwon_added_on from public.bb_candidates where id = v_k) is not null
     or (v_r -> 'money' ->> 'total_due_cents')::bigint <> 87000 then
    raise exception 'TEST FAILED: T6c taking Kukkiwon off must clear its date, got %', v_r;
  end if;
  v_r := public.bb_change_plan(v_k, 3, v_c2_full, false);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T6c another cycle''s plan should be invalid, got %', v_r; end if;
  v_r := public.bb_record_payment(v_k, 3, 1000, 'card', array['p1'], null);
  v_r := public.bb_change_plan(v_k, 4, v_cm_three, false);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: T6c a staff plan change after a payment should be not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_change_plan(v_k, 4, v_cm_three, false);
  if v_r ->> 'status' <> 'ok' or (v_r -> 'money' ->> 'total_due_cents')::bigint <> 87000
     or (v_r -> 'money' ->> 'paid_cents')::bigint <> 1000 then
    raise exception 'TEST FAILED: T6c an admin plan change after a payment should be ok (money worked out again), got %', v_r;
  end if;
  v_r := public.bb_withdraw_candidate(v_k, (v_r ->> 'version')::integer);
  v_r := public.bb_change_plan(v_k, (v_r ->> 'version')::integer, v_cm_full, false);
  if v_r is distinct from '{"status": "withdrawn"}'::jsonb then
    raise exception 'TEST FAILED: T6c a withdrawn candidate''s plan change should be withdrawn, got %', v_r;
  end if;

  -- T6d. Possible duplicates (keep both / keep one), the staff restore
  --      window (their own "keep one", less than 10 seconds), withdraw and
  --      restore
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- the T5h twins: keep both
  select id into v_k from public.bb_candidates where cycle_id = v_cm and first_name = 'Dup' and last_name = 'Twin';
  select id into v_k2 from public.bb_candidates where cycle_id = v_cm and first_name = 'dup' and last_name = 'TWIN';
  v_r := public.bb_resolve_duplicate(v_k, (select version from public.bb_candidates where id = v_k),
                                     v_k2, (select version from public.bb_candidates where id = v_k2), true);
  if v_r ->> 'status' <> 'ok'
     or (select duplicate_state || '|' || duplicate_of::text from public.bb_candidates where id = v_k) <> 'kept_both|' || v_k2::text
     or (select duplicate_state || '|' || duplicate_of::text from public.bb_candidates where id = v_k2) <> 'kept_both|' || v_k::text then
    raise exception 'TEST FAILED: T6d keep both: %', v_r;
  end if;
  v_r := public.bb_resolve_duplicate(v_k, (select version from public.bb_candidates where id = v_k),
                                     v_k2, (select version from public.bb_candidates where id = v_k2), true);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T6d a pair no longer marked should be stale, got %', v_r; end if;
  v_r := public.bb_resolve_duplicate(v_k, 1, v_k, 1, true);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T6d the same id twice should be invalid'; end if;
  v_r := public.bb_resolve_duplicate(v_k, 1, v_o1, 1, true);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T6d two cycles should be invalid, got %', v_r; end if;
  -- a desk pair: keep one, the desk's own Undo within 10 seconds
  v_r := public.bb_add_candidate(v_cm, 'Pair', 'Copy', v_child10, v_mail_tag || '.pa@example.com', 'worcester', 1, v_cm_full, false, true);
  v_k := (v_r ->> 'id')::uuid;
  v_r := public.bb_add_candidate(v_cm, 'PAIR', 'copy', v_child10, v_mail_tag || '.pb@example.com', 'shrewsbury', 2, v_cm_three, true, true);
  v_k2 := (v_r ->> 'id')::uuid;
  if (select duplicate_state from public.bb_candidates where id = v_k) <> 'possible'
     or (select duplicate_of from public.bb_candidates where id = v_k2) <> v_k then
    raise exception 'TEST FAILED: T6d a desk add with the same name and DOB (any Dan) should mark both possible';
  end if;
  v_r := public.bb_resolve_duplicate(v_k, (select version from public.bb_candidates where id = v_k),
                                     v_k2, (select version from public.bb_candidates where id = v_k2), false);
  if v_r ->> 'status' <> 'ok'
     or (select status || '|' || withdrawn_reason || '|' || withdrawn_by::text from public.bb_candidates where id = v_k2)
        <> 'withdrawn|duplicate_copy|' || v_desk::text
     or (select duplicate_state from public.bb_candidates where id = v_k) <> 'none' then
    raise exception 'TEST FAILED: T6d keep one: %', v_r;
  end if;
  v_r := public.bb_restore_candidate(v_k2, (v_r ->> 'other_version')::integer);
  if v_r ->> 'status' <> 'ok' or (select status from public.bb_candidates where id = v_k2) <> 'active'
     or (select duplicate_state from public.bb_candidates where id = v_k2) <> 'possible' then
    raise exception 'TEST FAILED: T6d the desk''s own Undo within 10 seconds should restore (and re-mark), got %', v_r;
  end if;
  v_r := public.bb_resolve_duplicate(v_k, (select version from public.bb_candidates where id = v_k),
                                     v_k2, (select version from public.bb_candidates where id = v_k2), false);
  perform set_config('request.jwt.claims', '', true);
  update public.bb_candidates set withdrawn_at = now() - interval '11 seconds' where id = v_k2;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_restore_candidate(v_k2, (select version from public.bb_candidates where id = v_k2));
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: T6d the desk restoring after 10 seconds should be not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_restore_candidate(v_k2, (select version from public.bb_candidates where id = v_k2));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T6d an admin restore at any time should be ok, got %', v_r; end if;
  v_r := public.bb_restore_candidate(v_k2, (v_r ->> 'version')::integer);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T6d restoring an active candidate should be stale, got %', v_r; end if;
  -- withdraw (admin): payments stay; twice -> withdrawn; pointers rechecked
  v_r := public.bb_withdraw_candidate(v_k, (select version from public.bb_candidates where id = v_k));
  if v_r ->> 'status' <> 'ok' or (select withdrawn_reason from public.bb_candidates where id = v_k) <> 'withdrawn'
     or (select duplicate_state from public.bb_candidates where id = v_k2) <> 'none' then
    raise exception 'TEST FAILED: T6d withdraw (and the partner''s mark worked out again): %', v_r;
  end if;
  v_r := public.bb_withdraw_candidate(v_k, (v_r ->> 'version')::integer);
  if v_r is distinct from '{"status": "withdrawn"}'::jsonb then raise exception 'TEST FAILED: T6d withdrawing twice should be withdrawn, got %', v_r; end if;

  -- T6f. A purged candidate (made by hand): everything that needs the DOB
  --      or email is invalid; withdraw and payments still work. And the
  --      detail / signature reads answer null personal values AS SOON AS
  --      the purge day has passed, before the purge has run.
  perform set_config('request.jwt.claims', '', true);
  v_k := pg_temp.bbt_due_candidate(v_cm, 'Gone', v_adult, v_mail_tag || '.gone@example.com', 'drawn');
  v_k2 := pg_temp.bbt_due_candidate(v_cm, 'Gone', v_adult, v_mail_tag || '.gone2@example.com', 'paper');
  update public.bb_candidates set date_of_birth = null, email_for_results = null, personal_removed_at = now() where id = v_k;
  update public.bb_candidate_waivers set signature = null, signer_name = null, removed_at = now() where candidate_id = v_k;
  update public.bb_candidates set duplicate_state = 'possible', duplicate_of = v_k where id = v_k2;
  -- the DOB can't come back, even as the SQL Editor's role
  begin
    update public.bb_candidates set date_of_birth = v_adult, email_for_results = 'x@y.co' where id = v_k;
    raise exception 'TEST FAILED: T6f a removed DOB came back';
  exception when check_violation then null;
  end;
  select version into v_kv from public.bb_candidates where id = v_k;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.bb_record_paper_waiver(v_k, v_kv) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_change_plan(v_k, v_kv, v_cm_three, false) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_update_candidate(v_k, v_kv, 'Gone', 'Duecase', v_adult, v_mail_tag || '.gone@example.com', 'worcester', 1)
        is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_resolve_duplicate(v_k2, (select version from public.bb_candidates where id = v_k2), v_k, v_kv, true)
        is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: T6f a purged candidate: paper re-sign, change plan, DOB edit and resolve must be invalid';
  end if;
  v_r := public.bb_update_candidate(v_k, v_kv, 'Gonna', 'Duecase', null, null, 'worcester', 1);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T6f a purged candidate''s name change should be ok, got %', v_r; end if;
  v_r := public.bb_record_payment(v_k, (v_r ->> 'version')::integer, 5000, 'cash', array['p1'], null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T6f a purged candidate''s payment should be ok, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_withdraw_candidate(v_k, (v_r ->> 'version')::integer);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T6f withdrawing a purged candidate should be ok, got %', v_r; end if;
  -- Olda's purge day has passed under 3 / 3 (set by hand here; the purge
  -- has NOT run): the reads already answer null
  perform set_config('request.jwt.claims', '', true);
  update public.bb_settings set keep_years_after_last_day = 3, keep_years_after_18 = 3;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_candidate_detail(v_o1);
  if v_r ->> 'status' <> 'ok' or v_r -> 'candidate' -> 'date_of_birth' <> 'null'::jsonb
     or v_r -> 'candidate' -> 'email_for_results' <> 'null'::jsonb or v_r -> 'candidate' -> 'age_on_first_day' <> 'null'::jsonb
     or v_r -> 'candidate' -> 'personal_removed_at' <> 'null'::jsonb
     or v_r -> 'waiver' -> 'signer_name' <> 'null'::jsonb
     or (select date_of_birth from public.bb_candidates where id = v_o1) is null then
    raise exception 'TEST FAILED: T6f the detail must hide personal values once the purge day passed: %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_view_signature(v_o1);
  if v_r ->> 'status' <> 'ok' or v_r -> 'signature' <> 'null'::jsonb or v_r -> 'signer_name' <> 'null'::jsonb
     or (select signature from public.bb_candidate_waivers where candidate_id = v_o1) is null then
    raise exception 'TEST FAILED: T6f view signature must hide the signature once the purge day passed: %', v_r;
  end if;
  -- (before the day: the signature and name are there - Bo Kim)
  v_r := public.bb_view_signature(v_f1);
  if v_r ->> 'signature' <> v_sig or v_r ->> 'signer_name' <> v_signer then
    raise exception 'TEST FAILED: T6f view signature of a current candidate: %', left(v_r::text, 300);
  end if;
  v_r := public.bb_view_signature(v_k1);
  if v_r is distinct from '{"status": "ok", "signature": null, "signer_name": null, "signed_at": null, "removed_at": null}'::jsonb then
    raise exception 'TEST FAILED: T6f a paper-only candidate has no signature to view, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', '', true);
  update public.bb_settings set keep_years_after_last_day = null, keep_years_after_18 = null;

  -- T6e. Delete permanently: refused with any payment row (also an undone
  --      one), nothing removed; otherwise the candidate and its waivers go
  --      (also an online-signed one, OI-8); a direct delete of a candidate
  --      with payments is refused by the foreign key (restrict)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_delete_candidate(v_k1, (select version from public.bb_candidates where id = v_k1));
  if v_r is distinct from '{"status": "has_payments"}'::jsonb or not exists (select 1 from public.bb_candidates where id = v_k1) then
    raise exception 'TEST FAILED: T6e a candidate with payments must be has_payments, got %', v_r;
  end if;
  v_r := public.bb_add_candidate(v_cm, 'Und', 'One', v_adult, v_mail_tag || '.un@example.com', 'worcester', 1, v_cm_full, false, true);
  v_k := (v_r ->> 'id')::uuid;
  v_r := public.bb_record_payment(v_k, 1, 500, 'cash', array['p1'], null);
  v_r := public.bb_undo_payment((v_r ->> 'payment_id')::uuid);
  v_r := public.bb_delete_candidate(v_k, (v_r ->> 'version')::integer);
  if v_r is distinct from '{"status": "has_payments"}'::jsonb then
    raise exception 'TEST FAILED: T6e a candidate with an undone payment must be has_payments, got %', v_r;
  end if;
  v_r := public.bb_delete_candidate(v_f2, (select version from public.bb_candidates where id = v_f2) + 1);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T6e an old version should be stale'; end if;
  v_r := public.bb_delete_candidate(v_f2, (select version from public.bb_candidates where id = v_f2));
  if v_r is distinct from '{"status": "ok"}'::jsonb
     or exists (select 1 from public.bb_candidates where id = v_f2)
     or exists (select 1 from public.bb_candidate_waivers where candidate_id = v_f2) then
    raise exception 'TEST FAILED: T6e Delete permanently should remove the candidate and its waiver, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', '', true);
  begin
    delete from public.bb_candidates where id = v_k1;
    raise exception 'TEST FAILED: T6e a candidate with payments was removed directly';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.bb_candidate_waivers where candidate_id = v_k1;
    raise exception 'TEST FAILED: T6e a waiver was removed without its candidate';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- T7. Payments (Main: payment 1 due today + 20, payment 2 today + 37,
  --     payment 3 today + 44; 1st Dan 3 x $290 or $870 in full; Kukkiwon
  --     $100)
  -- ===================================================================
  -- pg_temp.bbt_add(first, plan, kukkiwon): a 1st Dan desk candidate on Main
  execute $f$
    create function pg_temp.bbt_add(p_cycle uuid, p_first text, p_plan uuid, p_kuk boolean) returns uuid
    language plpgsql as $b$
    declare
      v_r jsonb;
    begin
      v_r := public.bb_add_candidate(p_cycle, p_first, 'Payer', (current_date - 9000), p_first || '@example.com',
                                     'worcester', 1, p_plan, p_kuk, true);
      if v_r ->> 'status' <> 'ok' then
        raise exception 'TEST SETUP: bbt_add % answered %', p_first, v_r;
      end if;
      return (v_r ->> 'id')::uuid;
    end;
    $b$;
  $f$;
  perform set_config('request.jwt.claims', v_c_d1, true);

  -- T7a. Record payment: 1 cent to $5,000; the items checked against the
  --      current plan; withdrawn -> withdrawn; a double click with the old
  --      version -> stale; counted today; the school and the cycle name of
  --      that moment are stored and never move
  v_k := pg_temp.bbt_add(v_cm, 'Ava', v_cm_three, false);
  v_r := public.bb_record_payment(v_k, 1, 1, 'cash', array['p1'], '  first  ');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> 2 then
    raise exception 'TEST FAILED: T7a a 1-cent payment should be ok, got %', v_r;
  end if;
  v_p2 := (v_r ->> 'payment_id')::uuid;
  if (select kind || '|' || amount_cents || '|' || method || '|' || paid_on::text || '|' || location_code || '|' || cycle_name
             || '|' || note || '|' || recorded_by::text || '|' || recorded_by_name || '|' || array_to_string(for_items, ',')
             || '|' || cycle_id::text
        from public.bb_payments where id = v_p2)
     <> 'payment|1|cash|' || v_today::text || '|worcester|' || v_tag || ' Main|first|' || v_desk::text || '|Staff|p1|' || v_cm::text then
    raise exception 'TEST FAILED: T7a the payment row was not stored as designed';
  end if;
  v_r := public.bb_record_payment(v_k, 2, 500000, 'check', array['p2', 'p3'], 'post-dated');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T7a a $5,000 payment should be ok, got %', v_r; end if;
  v_r := public.bb_record_payment(v_k, 2, 100, 'cash', array['p1'], null);
  if v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: T7a a double click with the old version should be stale, got %', v_r;
  end if;
  execute v_snap_sql into v_snap;
  foreach v_txt in array array[
      format('public.bb_record_payment(%L::uuid, 3, 0, %L, %L::text[], null)', v_k, 'cash', '{p1}'),
      format('public.bb_record_payment(%L::uuid, 3, 500001, %L, %L::text[], null)', v_k, 'cash', '{p1}'),
      format('public.bb_record_payment(%L::uuid, 3, 100, %L, %L::text[], null)', v_k, 'bitcoin', '{p1}'),
      format('public.bb_record_payment(%L::uuid, 3, 100, %L, %L::text[], null)', v_k, 'cash', '{p4}'),
      format('public.bb_record_payment(%L::uuid, 3, 100, %L, %L::text[], null)', v_k, 'cash', '{kukkiwon}'),
      format('public.bb_record_payment(%L::uuid, 3, 100, %L, %L::text[], null)', v_k, 'cash', '{p13}'),
      format('public.bb_record_payment(%L::uuid, 3, 100, %L, %L::text[], null)', v_k, 'cash', '{p1,p1}'),
      format('public.bb_record_payment(%L::uuid, 3, 100, %L, %L::text[], null)', v_k, 'cash', '{}'),
      format('public.bb_record_payment(%L::uuid, 3, 100, %L, null, null)', v_k, 'cash'),
      format('public.bb_record_payment(%L::uuid, 3, 100, %L, %L::text[], null)', v_k, 'cash', '{p1,NULL}'),
      format('public.bb_record_payment(%L::uuid, 3, 100, %L, %L::text[], %L)', v_k, 'cash', '{p1}', repeat('x', 601))] loop
    execute 'select ' || v_txt into v_r;
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T7a bad payment should be invalid, got % from %', v_r, v_txt;
    end if;
  end loop;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: T7a a refused payment changed something'; end if;
  -- a later school fix and a cycle rename don't move the stored values
  v_r := public.bb_update_candidate(v_k, 3, 'Ava', 'Payer', current_date - 9000, 'Ava@example.com', 'shrewsbury', 1);
  perform set_config('request.jwt.claims', v_c_a1, true);
  select version into v_cmv from public.bb_cycles where id = v_cm;
  v_r := public.bb_update_cycle(v_cm, v_cmv, jsonb_set(pg_temp.bbt_current(v_cm), '{name}', to_jsonb(v_tag || ' Main Renamed')));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T7a rename answered %', v_r; end if;
  if (select location_code || '|' || cycle_name from public.bb_payments where id = v_p2) <> 'worcester|' || v_tag || ' Main' then
    raise exception 'TEST FAILED: T7a a stored payment must keep its school and cycle name';
  end if;
  v_r := public.bb_record_payment(v_k, 4, 100, 'card', array['p1'], null);
  if (select location_code || '|' || cycle_name from public.bb_payments where id = (v_r ->> 'payment_id')::uuid)
     <> 'shrewsbury|' || v_tag || ' Main Renamed' then
    raise exception 'TEST FAILED: T7a a new payment must store the school and cycle name of now';
  end if;
  v_r := public.bb_withdraw_candidate(v_k, 5);
  v_r := public.bb_record_payment(v_k, 6, 100, 'cash', array['p1'], null);
  if v_r is distinct from '{"status": "withdrawn"}'::jsonb then
    raise exception 'TEST FAILED: T7a a payment on a withdrawn candidate should be withdrawn, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);

  -- T7b. Allocation (S1) and the tags (v0.219, v0.224, v0.900), with
  --      made-up "today"s
  -- nothing paid: gray Next before and ON the first due date, red Not paid after
  v_k := pg_temp.bbt_add(v_cm, 'Bea', v_cm_three, false);
  v_r := public.bb_candidate_money(v_k, v_today + 19);
  if v_r ->> 'tag' <> 'next' or (v_r ->> 'next_on')::date <> v_today + 20 or (v_r ->> 'next_cents')::bigint <> 29000
     or (v_r ->> 'total_due_cents')::bigint <> 87000 or (v_r ->> 'balance_cents')::bigint <> 87000 then
    raise exception 'TEST FAILED: T7b nothing paid before the first due date: %', v_r;
  end if;
  if public.bb_candidate_money(v_k, v_today + 20) ->> 'tag' <> 'next'
     or public.bb_candidate_money(v_k, v_today + 21) ->> 'tag' <> 'not_paid' then
    raise exception 'TEST FAILED: T7b nothing paid: on the due date gray Next, the day after Not paid';
  end if;
  -- three post-dated checks -> Paid in full
  v_k := pg_temp.bbt_add(v_cm, 'Cal', v_cm_three, false);
  v_r := public.bb_record_payment(v_k, 1, 29000, 'check', array['p1'], 'Mar 27');
  v_r := public.bb_record_payment(v_k, 2, 29000, 'check', array['p2'], 'post-dated Apr 24');
  v_r := public.bb_record_payment(v_k, 3, 29000, 'check', array['p3'], 'post-dated May 29');
  v_r := public.bb_candidate_money(v_k, v_today + 50);
  if v_r ->> 'tag' <> 'paid_in_full' or (v_r ->> 'overpaid_cents')::bigint <> 0 or (v_r ->> 'balance_cents')::bigint <> 0 then
    raise exception 'TEST FAILED: T7b three checks should be Paid in full: %', v_r;
  end if;
  -- Omar: payments 1-3 paid, the Kukkiwon fee not -> Late, Kukkiwon only,
  -- since payment 1's date
  v_k := pg_temp.bbt_add(v_cm, 'Omar', v_cm_three, true);
  v_r := public.bb_record_payment(v_k, 1, 29000, 'check', array['p1'], null);
  v_r := public.bb_record_payment(v_k, 2, 29000, 'check', array['p2'], null);
  v_r := public.bb_record_payment(v_k, 3, 29000, 'check', array['p3'], null);
  v_r := public.bb_candidate_money(v_k, v_today + 21);
  if v_r ->> 'tag' <> 'late' or not (v_r ->> 'late_kukkiwon_only')::boolean or (v_r ->> 'late_since')::date <> v_today + 20
     or (v_r ->> 'late_cents')::bigint <> 10000 then
    raise exception 'TEST FAILED: T7b Omar should be Late, Kukkiwon only, since payment 1''s date: %', v_r;
  end if;
  if (select string_agg(x.value ->> 'item', ',' order by x.n) from jsonb_array_elements(v_r -> 'items') with ordinality as x(value, n))
     <> 'p1,kukkiwon,p2,p3' then
    raise exception 'TEST FAILED: T7b the item order must be p1, kukkiwon, p2, p3: %', v_r -> 'items';
  end if;
  -- an amount smaller than its ticked items: payment 1 first, Kukkiwon unpaid
  v_k := pg_temp.bbt_add(v_cm, 'Dee', v_cm_three, true);
  v_r := public.bb_record_payment(v_k, 1, 20000, 'cash', array['kukkiwon', 'p1'], null);
  v_r := public.bb_candidate_money(v_k, v_today);
  if (select (x.value ->> 'paid_cents') || '/' || (x.value ->> 'remaining_cents')
        from jsonb_array_elements(v_r -> 'items') as x(value) where x.value ->> 'item' = 'p1') <> '20000/9000'
     or (select (x.value ->> 'paid_cents') from jsonb_array_elements(v_r -> 'items') as x(value) where x.value ->> 'item' = 'kukkiwon') <> '0'
     or v_r ->> 'tag' <> 'next' or (v_r ->> 'next_cents')::bigint <> 9000 + 10000 then
    raise exception 'TEST FAILED: T7b a payment smaller than its ticked items: %', v_r;
  end if;
  -- an extra payment -> Paid in full + overpaid
  v_k := pg_temp.bbt_add(v_cm, 'Eve', v_cm_full, false);
  v_r := public.bb_record_payment(v_k, 1, 87000, 'card', array['p1'], null);
  v_r := public.bb_record_payment(v_k, 2, 5000, 'cash', array['p1'], null);
  if v_r -> 'money' ->> 'tag' <> 'paid_in_full' or (v_r -> 'money' ->> 'overpaid_cents')::bigint <> 5000
     or (v_r -> 'money' ->> 'balance_cents')::bigint <> -5000 then
    raise exception 'TEST FAILED: T7b an extra payment should be Paid in full with $50 overpaid: %', v_r -> 'money';
  end if;
  -- a late desk family: a due date that has passed counts from the day
  -- they registered (Main2's payment 1 moved 10 days back by hand)
  perform set_config('request.jwt.claims', '', true);
  update public.bb_cycle_plan_payments set due_on = v_today - 10 where cycle_plan_id = v_c2_three and payment_no = 1;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_k := pg_temp.bbt_add(v_c2, 'Fay', v_c2_three, false);
  v_r := public.bb_candidate_money(v_k, v_today);
  if v_r ->> 'tag' <> 'next' or (v_r ->> 'next_on')::date <> v_today
     or (v_r -> 'items' -> 0 ->> 'due_on')::date <> v_today then
    raise exception 'TEST FAILED: T7b a late family''s passed date counts from the day they registered: %', v_r;
  end if;
  -- Kukkiwon added after payment 1's date: due at once (gray Next that day,
  -- Late the next day)
  v_r := public.bb_record_payment(v_k, 1, 29000, 'cash', array['p1'], null);
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_change_plan(v_k, 2, v_c2_three, true);
  if v_r ->> 'status' <> 'ok' or v_r -> 'money' ->> 'tag' <> 'next' or (v_r -> 'money' ->> 'next_on')::date <> v_today
     or (v_r -> 'money' ->> 'next_cents')::bigint <> 10000 then
    raise exception 'TEST FAILED: T7b a Kukkiwon fee added late is due at once (gray Next today): %', v_r;
  end if;
  v_r := public.bb_candidate_money(v_k, v_today + 1);
  if v_r ->> 'tag' <> 'late' or not (v_r ->> 'late_kukkiwon_only')::boolean or (v_r ->> 'late_since')::date <> v_today then
    raise exception 'TEST FAILED: T7b a late-added Kukkiwon fee is Late the next day: %', v_r;
  end if;
  -- a plan change leaving an item that no longer exists: its money goes to
  -- the earliest unpaid item
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_k := pg_temp.bbt_add(v_cm, 'Gus', v_cm_three, false);
  v_r := public.bb_record_payment(v_k, 1, 29000, 'cash', array['p3'], null);
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_change_plan(v_k, 2, v_cm_full, false);
  if jsonb_array_length(v_r -> 'money' -> 'items') <> 1
     or (v_r -> 'money' -> 'items' -> 0 ->> 'paid_cents')::bigint <> 29000
     or (v_r -> 'money' -> 'items' -> 0 ->> 'remaining_cents')::bigint <> 58000 then
    raise exception 'TEST FAILED: T7b money for an item the plan no longer has must go to the earliest unpaid: %', v_r -> 'money';
  end if;

  -- T7c. The Undo window: the desk's own payment within 10 seconds; not
  --      someone else's, not after 10 seconds; admins any time; a reversal
  --      can't be undone; twice -> stale
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_k := pg_temp.bbt_add(v_cm, 'Hal', v_cm_three, false);
  v_r := public.bb_record_payment(v_k, 1, 29000, 'cash', array['p1'], null);
  v_p3 := (v_r ->> 'payment_id')::uuid;
  v_r := public.bb_undo_payment(v_p3);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> 3 or (v_r -> 'money' ->> 'paid_cents')::bigint <> 0 then
    raise exception 'TEST FAILED: T7c the desk undoing its own payment within 10 seconds should be ok, got %', v_r;
  end if;
  v_r := public.bb_undo_payment(v_p3);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T7c undoing twice should be stale, got %', v_r; end if;
  v_r := public.bb_undo_payment((select id from public.bb_payments where reverses_payment_id = v_p3));
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T7c undoing a reversal should be invalid, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_record_payment(v_k, 3, 29000, 'cash', array['p1'], null);
  v_p3 := (v_r ->> 'payment_id')::uuid;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_undo_payment(v_p3);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: T7c the desk undoing someone else''s payment should be not_allowed, got %', v_r;
  end if;
  -- the desk's own payment 11 seconds old (written by hand)
  perform set_config('request.jwt.claims', '', true);
  insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                  location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
  values (v_k, v_cm, 'payment', 100, 'cash', v_today, array['p2'], 'worcester', v_tag || ' Main', now() - interval '11 seconds',
          v_desk, 'Staff')
  returning id into v_p3;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_undo_payment(v_p3);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: T7c the desk undoing its own payment after 10 seconds should be not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_undo_payment(v_p3);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T7c an admin undo at any time should be ok, got %', v_r; end if;
  if public.bb_undo_payment(v_rand) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: T7c an unknown payment should be not_found';
  end if;

  -- T7d. Edit payment (admins): exactly two new rows with the same
  --      recorded_at and recorded_by (the admin) and the reason; the new
  --      row keeps the old date, school and cycle name
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_k := pg_temp.bbt_add(v_cm, 'Ida', v_cm_three, false);
  perform set_config('request.jwt.claims', '', true);
  insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                  location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
  values (v_k, v_cm, 'payment', 29000, 'cash', v_today - 5, array['p1'], 'shrewsbury', 'zz Old Name', now() - interval '1 day',
          v_desk, 'Staff')
  returning id into v_p3;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_edit_payment(v_p3, 30000, 'card', array['p1', 'p2'], 'new note', null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T7d an edit without a reason should be invalid'; end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_n := (select count(*) from public.bb_payments where candidate_id = v_k);
  v_r := public.bb_edit_payment(v_p3, 30000, 'card', array['p1', 'p2'], 'new note', '  typed the wrong amount ');
  if v_r ->> 'status' <> 'ok' or (select count(*) from public.bb_payments where candidate_id = v_k) <> v_n + 2 then
    raise exception 'TEST FAILED: T7d an edit should write exactly two rows, got %', v_r;
  end if;
  v_pr := (v_r ->> 'payment_id')::uuid;
  if (select kind || '|' || amount_cents || '|' || method || '|' || reason || '|' || location_code || '|' || cycle_name
             || '|' || recorded_by::text || '|' || (recorded_at = now())::text
        from public.bb_payments where reverses_payment_id = v_p3)
     <> 'reversal|-29000|cash|typed the wrong amount|shrewsbury|zz Old Name|' || v_admin::text || '|true'
     or (select kind || '|' || amount_cents || '|' || method || '|' || reason || '|' || location_code || '|' || cycle_name
                || '|' || recorded_by::text || '|' || (recorded_at = now())::text || '|' || paid_on::text || '|' || note
                || '|' || array_to_string(for_items, ',')
           from public.bb_payments where id = v_pr)
        <> 'payment|30000|card|typed the wrong amount|shrewsbury|zz Old Name|' || v_admin::text || '|true|'
           || (v_today - 5)::text || '|new note|p1,p2' then
    raise exception 'TEST FAILED: T7d the edit pair is not as Finance expects';
  end if;
  v_r := public.bb_edit_payment(v_p3, 30000, 'card', array['p1'], null, 'again');
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T7d editing an edited-away row should be stale'; end if;
  -- under an active refund -> invalid; a refund row -> invalid
  v_r := public.bb_record_refund(v_k, (select version from public.bb_candidates where id = v_k), 1000, 'cash', null);
  v_r2 := public.bb_edit_payment(v_pr, 30000, 'card', array['p1'], null, 'again');
  if v_r2 is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T7d an edit under an active refund should be invalid, got %', v_r2; end if;
  v_r2 := public.bb_edit_payment((v_r ->> 'payment_id')::uuid, 30000, 'card', array['p1'], null, 'again');
  if v_r2 is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T7d editing a refund should be invalid'; end if;
  -- a returned check -> stale
  v_k := pg_temp.bbt_add(v_cm, 'Jo', v_cm_three, false);
  v_r := public.bb_record_payment(v_k, 1, 29000, 'check', array['p1'], null);
  v_p3 := (v_r ->> 'payment_id')::uuid;
  v_r := public.bb_mark_check_returned(v_p3, 'bounced');
  v_r := public.bb_edit_payment(v_p3, 29000, 'check', array['p1'], null, 'fix');
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T7d editing a returned check should be stale, got %', v_r; end if;

  -- T7e. Refund (admins): up to the net paid (also on a withdrawn
  --      candidate); one cent more -> refund_too_large with what was paid;
  --      the school and cycle name of the latest live payment; its Undo
  --      gives the balance back
  v_k := pg_temp.bbt_add(v_cm, 'Kit', v_cm_three, false);
  v_r := public.bb_record_payment(v_k, 1, 29000, 'cash', array['p1'], null);
  v_r := public.bb_update_candidate(v_k, 2, 'Kit', 'Payer', current_date - 9000, 'Kit@example.com', 'shrewsbury', 1);
  v_r := public.bb_withdraw_candidate(v_k, 3);
  v_r := public.bb_record_refund(v_k, 4, 29001, 'check', null);
  if v_r is distinct from '{"status": "refund_too_large", "paid_cents": 29000}'::jsonb then
    raise exception 'TEST FAILED: T7e a refund over the net paid should be refund_too_large, got %', v_r;
  end if;
  v_r := public.bb_record_refund(v_k, 4, 29000, 'check', 'gave it back');
  if v_r ->> 'status' <> 'ok' or (v_r -> 'money' ->> 'paid_cents')::bigint <> 0
     or (select kind || '|' || amount_cents || '|' || location_code || '|' || cycle_name || '|' || paid_on::text
           from public.bb_payments where id = (v_r ->> 'payment_id')::uuid)
        <> 'refund|-29000|worcester|' || v_tag || ' Main Renamed|' || v_today::text then
    raise exception 'TEST FAILED: T7e a refund on a withdrawn candidate, from the latest live payment''s school: %', v_r;
  end if;
  v_r := public.bb_undo_payment((v_r ->> 'payment_id')::uuid);
  if v_r ->> 'status' <> 'ok' or (v_r -> 'money' ->> 'paid_cents')::bigint <> 29000 then
    raise exception 'TEST FAILED: T7e undoing a refund gives the balance back, got %', v_r;
  end if;
  -- undoing the payment now would go below zero under a refund -> invalid
  v_r := public.bb_record_refund(v_k, (v_r ->> 'version')::integer, 1000, 'cash', null);
  v_r := public.bb_undo_payment((select id from public.bb_payments where candidate_id = v_k and kind = 'payment'));
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: T7e undoing a payment under an active refund should be invalid, got %', v_r;
  end if;

  -- T7f. Returned checks (admins)
  v_k := pg_temp.bbt_add(v_cm, 'Lu', v_cm_three, false);
  v_r := public.bb_record_payment(v_k, 1, 29000, 'cash', array['p1'], null);
  v_r := public.bb_mark_check_returned((v_r ->> 'payment_id')::uuid, null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T7f a cash payment can''t be returned, got %', v_r; end if;
  -- a check, a refund, then the check bounces: the net goes below zero
  v_k := pg_temp.bbt_add(v_cm, 'Max', v_cm_three, false);
  v_r := public.bb_record_payment(v_k, 1, 29000, 'check', array['p1'], null);
  v_p3 := (v_r ->> 'payment_id')::uuid;
  v_r := public.bb_record_refund(v_k, 2, 10000, 'cash', null);
  v_r := public.bb_mark_check_returned(v_p3, 'NSF');
  if v_r ->> 'status' <> 'ok' or (v_r -> 'money' ->> 'paid_cents')::bigint <> -10000
     or (select kind || '|' || amount_cents || '|' || method || '|' || note from public.bb_payments where id = (v_r ->> 'payment_id')::uuid)
        <> 'returned|-29000|check|NSF' then
    raise exception 'TEST FAILED: T7f a check bouncing after a refund may take the net below zero, got %', v_r;
  end if;
  v_pr := (v_r ->> 'payment_id')::uuid;
  v_r2 := public.bb_candidate_money(v_k, v_today + 21);
  if v_r2 ->> 'tag' <> 'late' or (v_r2 ->> 'balance_cents')::bigint <> 87000 + 10000
     or not exists (select 1 from jsonb_array_elements(public.bb_candidate_detail(v_k) -> 'payments') as x(value)
                     where (x.value ->> 'id')::uuid = v_p3 and (x.value ->> 'returned')::boolean)
     or not exists (select 1 from jsonb_array_elements(public.bb_candidate_detail(v_k) -> 'payments') as x(value)
                     where x.value ->> 'kind' = 'returned' and (x.value ->> 'reverses_payment_id')::uuid = v_p3) then
    raise exception 'TEST FAILED: T7f after a returned check the balance and the Late tag come back: %', v_r2;
  end if;
  -- while the net is below zero, a part payment is accepted
  v_r := public.bb_record_payment(v_k, (v_r ->> 'version')::integer, 5000, 'cash', array['p1'], null);
  if v_r ->> 'status' <> 'ok' or (v_r -> 'money' ->> 'paid_cents')::bigint <> -5000 then
    raise exception 'TEST FAILED: T7f a payment while the net is below zero should be ok, got %', v_r;
  end if;
  -- the same check can't be marked twice; its payment can't be undone
  -- while the mark is live; undoing the mark makes the check count again
  v_r := public.bb_mark_check_returned(v_p3, null);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T7f marking a check twice should be stale, got %', v_r; end if;
  v_r := public.bb_undo_payment(v_p3);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: T7f undoing a payment whose check is marked returned should be invalid, got %', v_r;
  end if;
  v_r := public.bb_undo_payment(v_pr);
  if v_r ->> 'status' <> 'ok' or (v_r -> 'money' ->> 'paid_cents')::bigint <> 24000
     or (v_r -> 'money' -> 'items' -> 0 ->> 'paid_cents')::bigint <> 29000 - 10000 + 5000 then
    raise exception 'TEST FAILED: T7f undoing the returned mark makes the check count again, got %', v_r;
  end if;
  v_r := public.bb_mark_check_returned(v_p3, null);
  if v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: T7f a check whose returned mark was undone can''t be marked again, got %', v_r;
  end if;
  -- a reversed payment can't be marked returned
  v_k := pg_temp.bbt_add(v_cm, 'Ned', v_cm_three, false);
  v_r := public.bb_record_payment(v_k, 1, 29000, 'check', array['p1'], null);
  v_p3 := (v_r ->> 'payment_id')::uuid;
  v_r := public.bb_undo_payment(v_p3);
  v_r := public.bb_mark_check_returned(v_p3, null);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T7f marking an undone check returned should be stale, got %', v_r; end if;
  -- the full sequence: mark returned -> Undo the mark -> undo the payment ->
  -- record it again -> mark the NEW row returned -> ok
  v_k := pg_temp.bbt_add(v_cm, 'Oz', v_cm_three, false);
  v_r := public.bb_record_payment(v_k, 1, 29000, 'check', array['p1'], null);
  v_p3 := (v_r ->> 'payment_id')::uuid;
  v_r := public.bb_mark_check_returned(v_p3, null);
  v_r := public.bb_undo_payment((v_r ->> 'payment_id')::uuid);
  v_r := public.bb_undo_payment(v_p3);
  v_r := public.bb_record_payment(v_k, (v_r ->> 'version')::integer, 29000, 'check', array['p1'], null);
  v_r := public.bb_mark_check_returned((v_r ->> 'payment_id')::uuid, null);
  if v_r ->> 'status' <> 'ok' or (v_r -> 'money' ->> 'paid_cents')::bigint <> 0 then
    raise exception 'TEST FAILED: T7f the full returned / undo / record again / returned sequence should end ok, got %', v_r;
  end if;
  if public.bb_mark_check_returned(v_rand, null) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: T7f an unknown payment should be not_found';
  end if;

  -- T7g. Append-only, never removed, even by the SQL Editor's role, inside
  --      a cascade-like trigger or with any action tag
  perform set_config('request.jwt.claims', '', true);
  foreach v_txt in array array[
      format('update public.bb_payments set note = %L where id = %L', 'x', v_p1),
      format('update public.bb_payments set amount_cents = amount_cents where id = %L', v_p1),
      format('delete from public.bb_payments where id = %L', v_p1)] loop
    begin
      execute v_txt;
      raise exception 'TEST FAILED: T7g a payment row was changed or removed: %', v_txt;
    exception when check_violation then null;
    end;
  end loop;
  -- a delete run from inside another trigger (pg_trigger_depth() > 1), as
  -- a cascade would, with every removal tag
  create temp table bbt_poke (id uuid) on commit drop;
  execute $f$
    create function pg_temp.bbt_poke_fn() returns trigger language plpgsql as $b$
    begin
      delete from public.bb_payments where id = new.id;
      return new;
    end;
    $b$;
  $f$;
  execute 'create trigger bbt_poke_trg after insert on pg_temp.bbt_poke for each row execute function pg_temp.bbt_poke_fn()';
  foreach v_txt in array array['', 'bb_delete_candidate', 'bb_delete_cycle', 'star_delete_event', 'delete_student'] loop
    perform set_config('tkd.action', v_txt, true);
    begin
      insert into pg_temp.bbt_poke (id) values (v_p1);
      raise exception 'TEST FAILED: T7g a payment row was removed from inside a trigger with tag %', v_txt;
    exception when check_violation then null;
    end;
  end loop;
  perform set_config('tkd.action', '', true);
  begin
    truncate public.bb_payments;
    v_bool := true;
  exception when others then
    v_bool := false;
    v_txt := sqlerrm;
  end;
  if v_bool or v_txt not like '%truncated%' then
    raise exception 'TEST FAILED: T7g bb_payments could be truncated (%)', v_txt;
  end if;
  -- bad corrections written by hand -> check_violation
  select id into v_k from public.bb_candidates where cycle_id = v_cm and first_name = 'Cal';
  foreach v_txt in array array[
      -- a reversal of ANOTHER candidate's row
      format('insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name, recorded_by_name, reverses_payment_id) values (%L, %L, %L, -29000, %L, %L, %L, %L, %L, %L)',
             v_k, v_cm, 'reversal', 'cash', v_today, 'worcester', v_tag || ' Main', 'x', v_p1),
      -- a wrong amount
      format('insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name, recorded_by_name, reverses_payment_id) values (%L, %L, %L, -100, %L, %L, %L, %L, %L, %L)',
             v_k1, v_cm, 'reversal', 'cash', v_today, 'worcester', v_tag || ' Main', 'x', v_p1),
      -- another method than the row it corrects (review N1)
      format('insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name, recorded_by_name, reverses_payment_id) values (%L, %L, %L, -29000, %L, %L, %L, %L, %L, %L)',
             v_k1, v_cm, 'reversal', 'card', v_today, 'worcester', v_tag || ' Main', 'x', v_p1),
      -- another school than the row it corrects
      format('insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name, recorded_by_name, reverses_payment_id) values (%L, %L, %L, -29000, %L, %L, %L, %L, %L, %L)',
             v_k1, v_cm, 'reversal', 'cash', v_today, 'shrewsbury', v_tag || ' Main', 'x', v_p1),
      -- a reversal of a reversal
      format('insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name, recorded_by_name, reverses_payment_id) select candidate_id, cycle_id, %L, -amount_cents, method, paid_on, location_code, cycle_name, %L, id from public.bb_payments where kind = %L and candidate_id = %L limit 1',
             'reversal', 'x', 'reversal', (select candidate_id from public.bb_payments where kind = 'reversal' and amount_cents < 0 limit 1)),
      -- a payment in another cycle than its candidate's
      format('insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, location_code, cycle_name, recorded_by_name) values (%L, %L, %L, 100, %L, %L, %L::text[], %L, %L, %L)',
             v_k1, v_c2, 'payment', 'cash', v_today, '{p1}', 'worcester', v_tag || ' Main', 'x'),
      -- a returned row for a cash payment
      format('insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name, recorded_by_name, reverses_payment_id) values (%L, %L, %L, -29000, %L, %L, %L, %L, %L, %L)',
             v_k1, v_cm, 'returned', 'check', v_today, 'worcester', v_tag || ' Main', 'x', v_p1)] loop
    begin
      execute v_txt;
      raise exception 'TEST FAILED: T7g a bad correction was accepted: %', left(v_txt, 200);
    exception when check_violation then null;
    end;
  end loop;

  -- T7h. Money is added up as bigint: 4,400 rows of $5,000 on one
  --      candidate ($22,000,000 - more than a 32-bit number can hold)
  --      give the right totals (written by hand, test only)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_k := pg_temp.bbt_add(v_cm, 'Rich', v_cm_full, false);
  perform set_config('request.jwt.claims', '', true);
  insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                  location_code, cycle_name, recorded_by_name)
  select v_k, v_cm, 'payment', 500000, 'check', v_today, array['p1'], 'worcester', v_tag || ' Main', 'zz test'
    from generate_series(1, 4400);
  v_r := public.bb_candidate_money(v_k, v_today);
  if (v_r ->> 'paid_cents')::bigint <> 2200000000 or (v_r ->> 'overpaid_cents')::bigint <> 2200000000 - 87000
     or (v_r ->> 'balance_cents')::bigint <> 87000 - 2200000000 or v_r ->> 'tag' <> 'paid_in_full' then
    raise exception 'TEST FAILED: T7h big sums must not overflow: %', v_r - 'items';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_record_refund(v_k, 1, 500000, 'check', null);
  if v_r ->> 'status' <> 'ok' or (v_r -> 'money' ->> 'paid_cents')::bigint <> 2200000000 - 500000 then
    raise exception 'TEST FAILED: T7h a refund on a big net: %', v_r - 'money';
  end if;

  -- ===================================================================
  -- T8 (part 1) + T3c. The purge and the keep-years setting
  --   Old's last day was 3 years + 1 day ago: Olda (adult, signed online)
  --   and Oldwin (adult, desk, withdrawn) are due under 3 / 3, Oldie (10
  --   years old) is not; Near's last day was 3 years - 1 day ago (Nora
  --   kept); Thirty was 30 years ago (Thea due).
  -- ===================================================================

  -- T8a. both settings empty -> nothing is ever purged, even for a cycle
  --      30 years ago (the reads that run the purge are called here)
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- (a payment for Olda, to see it kept by the purge)
  v_r := public.bb_record_payment(v_o1, (select version from public.bb_candidates where id = v_o1), 2900, 'cash', array['p1'], null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: a payment on a past cycle answered %', v_r; end if;
  v_r := public.bb_cycles_list();
  v_r := public.bb_cycle_roster(v_c30);
  if (select date_of_birth from public.bb_candidates where id = v_t30) is null
     or (select personal_removed_at from public.bb_candidates where id = v_t30) is not null
     or public.bb_purge_due_on(v_t30) is not null or public.bb_purge_is_due(v_t30, v_today + 100000) then
    raise exception 'TEST FAILED: T8a with both settings empty nothing may be purged';
  end if;

  -- T3c. the keep-years setting (admins): one empty -> invalid; 2 or 21 ->
  --      invalid; the first call answers how many would be removed now
  --      and saves / purges NOTHING; a wrong count -> stale; the right one
  --      saves, purges in the same call and logs old -> new
  perform set_config('request.jwt.claims', v_c_a1, true);
  select version into v_v from public.bb_settings;
  foreach v_txt in array array['3, null, null', 'null, 3, null', '2, 3, null', '3, 21, null', '3, 3, -1'] loop
    execute format('select public.bb_set_keep_years(%s, %s)', v_v, v_txt) into v_r;
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T3c keep years (%) should be invalid, got %', v_txt, v_r;
    end if;
  end loop;
  -- the expected count, worked out here independently (the same formula)
  select count(*) into v_n
    from public.bb_candidates c
   where c.personal_removed_at is null
     and greatest((select max(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id) + interval '3 years',
                  c.date_of_birth + interval '21 years') <= v_today;
  if v_n < 3 then raise exception 'TEST SETUP: T3c expected at least Olda, Oldwin and Thea to be due, found %', v_n; end if;
  execute v_snap_sql into v_snap;
  v_r := public.bb_set_keep_years(v_v, 3, 3, null);
  execute v_snap_sql into v_snap2;
  if v_r is distinct from jsonb_build_object('status', 'confirm_needed', 'remove_count', v_n) or v_snap2 <> v_snap then
    raise exception 'TEST FAILED: T3c the first call should be confirm_needed (%), saving nothing, got %', v_n, v_r;
  end if;
  v_r := public.bb_set_keep_years(v_v, 3, 3, v_n + 1);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T3c a wrong count should be stale, got %', v_r; end if;
  v_r := public.bb_set_keep_years(v_v - 1, 3, 3, v_n);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: T3c an old version should be stale, got %', v_r; end if;
  select version into v_v2 from public.bb_candidates where id = v_o1;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_set_keep_years(v_v, 3, 3, v_n);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1, 'removed_count', v_n)
     or (select keep_years_after_last_day::text || '/' || keep_years_after_18::text from public.bb_settings) <> '3/3' then
    raise exception 'TEST FAILED: T3c the confirmed call should save and purge %, got %', v_n, v_r;
  end if;
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.table_name = 'bb_settings' and l.action = 'bb_set_keep_years' and l.op = 'update'
                    and l.before -> 'keep_years_after_last_day' = 'null'::jsonb and l.after -> 'keep_years_after_last_day' = '3'::jsonb
                    and l.before -> 'keep_years_after_18' = 'null'::jsonb and l.after -> 'keep_years_after_18' = '3'::jsonb) then
    raise exception 'TEST FAILED: T3c the history must show the numbers old -> new';
  end if;

  -- T8b. what the purge removed and kept
  if (select num_nonnulls(date_of_birth, email_for_results) from public.bb_candidates where id = v_o1) <> 0
     or (select personal_removed_at from public.bb_candidates where id = v_o1) is distinct from now()
     or (select first_name || '|' || last_name || '|' || dan || '|' || location_code || '|' || reference || '|' || version
           from public.bb_candidates where id = v_o1)
        <> 'Olda|Sig|1|worcester|' || (select reference from public.bb_candidates where id = v_o1) || '|' || v_v2
     or (select num_nonnulls(signature, signer_name) from public.bb_candidate_waivers where candidate_id = v_o1) <> 0
     or (select removed_at from public.bb_candidate_waivers where candidate_id = v_o1) is distinct from now()
     or (select waiver_version_id from public.bb_candidate_waivers where candidate_id = v_o1) <> v_wv
     or (select version from public.bb_candidate_waivers where candidate_id = v_o1) <> 1
     or (select count(*) from public.bb_payments where candidate_id = v_o1) <> 1 then
    raise exception 'TEST FAILED: T8b Olda: DOB, email, signature and signer removed; names, Dan, school, reference, payments, waiver version kept; no version bump';
  end if;
  if (select personal_removed_at from public.bb_candidates where id = v_o3) is null              -- withdrawn: purged too
     or (select ticked_by_name || '|' || coalesce(removed_at::text, '-') from public.bb_candidate_waivers where candidate_id = v_o3)
        <> 'Staff|-'                                                                             -- its paper waiver untouched
     or (select personal_removed_at from public.bb_candidates where id = v_t30) is null
     or (select personal_removed_at from public.bb_candidates where id = v_o2) is not null       -- 10 years old: kept
     or (select date_of_birth from public.bb_candidates where id = v_o2) is null
     or (select signature from public.bb_candidate_waivers where candidate_id = v_o2) is null
     or (select personal_removed_at from public.bb_candidates where id = v_n1) is not null then  -- 3 years - 1 day: kept
    raise exception 'TEST FAILED: T8b withdrawn and 30-year-old candidates purged, paper waiver untouched, the 10-year-old and Near kept';
  end if;
  -- the 10-year-old: due on the later of the two dates (18th birthday + 3)
  if public.bb_purge_due_on(v_o2) <> (v_child10 + interval '21 years')::date
     or public.bb_purge_due_on(v_o1) <> ((select max(day_date) from public.bb_cycle_days where cycle_id = v_co) + interval '3 years')::date
     or not public.bb_purge_is_due(v_o2, (v_child10 + interval '21 years')::date)
     or public.bb_purge_is_due(v_o2, (v_child10 + interval '21 years')::date - 1) then
    raise exception 'TEST FAILED: T8b the purge day is the later of last day + N1 and 18th birthday + N2';
  end if;
  -- the purge's history: only the masked values going to empty, tagged
  -- bb_purge_due, and nothing in plain text
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.action = 'bb_purge_due' and l.table_name = 'bb_candidates' and l.record_id = v_o1
                    and l.before ->> 'date_of_birth' = 'on file' and l.after -> 'date_of_birth' = 'null'::jsonb
                    and l.before ->> 'email_for_results' = 'on file' and l.after -> 'email_for_results' = 'null'::jsonb
                    and not (l.after ? 'version'))
     or not exists (select 1 from public.change_log l
                     where l.id > v_mark and l.action = 'bb_purge_due' and l.table_name = 'bb_candidate_waivers'
                       and l.before ->> 'signature' = 'on file' and l.after -> 'signature' = 'null'::jsonb
                       and l.before ->> 'signer_name' = 'on file' and l.after -> 'signer_name' = 'null'::jsonb) then
    raise exception 'TEST FAILED: T8b the purge must log the masked values going to empty, without a version bump';
  end if;

  -- T8d. after the purge: Edit details can't put the DOB or email back;
  --      the detail shows "removed"
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_update_candidate(v_o1, v_v2, 'Olda', 'Sig', v_adult, v_mail_tag || '.olda@example.com', 'worcester', 1);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: T8d putting a purged DOB back should be invalid, got %', v_r;
  end if;
  v_r := public.bb_candidate_detail(v_o1);
  if v_r -> 'candidate' -> 'personal_removed_at' = 'null'::jsonb or v_r -> 'candidate' -> 'date_of_birth' <> 'null'::jsonb
     or (v_r -> 'waiver' ->> 'signature_on_file')::boolean or v_r -> 'waiver' -> 'removed_at' = 'null'::jsonb
     or v_r -> 'waiver' ->> 'version_name' <> v_wv_name or (v_r ->> 'needs_parent_signature')::boolean then
    raise exception 'TEST FAILED: T8d the detail of a purged candidate: %', v_r;
  end if;

  -- T8c. the purge runs at the end of each listed call - and NOT from the
  --      family form; a second purge right after changes and logs nothing
  --      (each check: a new due candidate in Old, written by hand, then the
  --      call)
  v_list := array['add_cycle', 'add_candidate', 'record_payment', 'set_keep_years', 'cycles_list', 'cycle_roster'];
  foreach v_txt in array v_list loop
    perform set_config('request.jwt.claims', '', true);
    v_k := pg_temp.bbt_due_candidate(v_co, 'Due', v_adult, v_mail_tag || '.due@example.com', 'drawn');
    if v_txt = 'add_cycle' then
      perform set_config('request.jwt.claims', v_c_a1, true);
      v_r := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' Purge', v_today + 230, v_today + 220), null);
    elsif v_txt = 'add_candidate' then
      perform set_config('request.jwt.claims', v_c_d1, true);
      v_r := public.bb_add_candidate(v_cm, 'Purge', 'Trigger', v_adult, v_mail_tag || '.pt@example.com', 'worcester', 1, v_cm_full, false, true);
    elsif v_txt = 'record_payment' then
      perform set_config('request.jwt.claims', v_c_d1, true);
      v_r := public.bb_record_payment(v_k1, (select version from public.bb_candidates where id = v_k1), 100, 'cash', array['p2'], null);
    elsif v_txt = 'set_keep_years' then
      perform set_config('request.jwt.claims', v_c_a1, true);
      v_v := (select version from public.bb_settings);
      v_r := public.bb_set_keep_years(v_v, 3, 3, null);
      v_r := public.bb_set_keep_years(v_v, 3, 3, (v_r ->> 'remove_count')::integer);
    elsif v_txt = 'cycles_list' then
      perform set_config('request.jwt.claims', v_c_d1, true);
      v_r := public.bb_cycles_list();
    else
      perform set_config('request.jwt.claims', v_c_d1, true);
      v_r := public.bb_cycle_roster(v_cm);
    end if;
    if v_r ->> 'status' <> 'ok' or (select personal_removed_at from public.bb_candidates where id = v_k) is null then
      raise exception 'TEST FAILED: T8c the purge must run at the end of %, got %', v_txt, left(v_r::text, 200);
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  v_k := pg_temp.bbt_due_candidate(v_co, 'Due', v_adult, v_mail_tag || '.due@example.com', 'drawn');
  v_r := public.bb_public_register(v_cm_w, v_tag || ' k8', gen_random_uuid(), 'No', 'Purge', v_adult,
                                   v_mail_tag || '.np@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r ->> 'status' <> 'ok' or (select personal_removed_at from public.bb_candidates where id = v_k) is not null then
    raise exception 'TEST FAILED: T8c the family form must NOT run the purge, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_cycles_list();
  select coalesce(max(id), 0) into v_mark from public.change_log;
  execute v_snap_sql into v_snap;
  v_r := public.bb_cycles_list();
  execute v_snap_sql into v_snap2;
  if (select personal_removed_at from public.bb_candidates where id = v_k) is null
     or v_snap2 <> v_snap or exists (select 1 from public.change_log where id > v_mark) then
    raise exception 'TEST FAILED: T8c a second purge right after the first must change and log nothing';
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' then
    raise exception 'TEST FAILED: T8c the purge must put the caller''s tags back';
  end if;

  -- ===================================================================
  -- T9. Privacy proofs
  -- ===================================================================

  -- T9a. no role can read the DOB or the email; no column of the signed
  --      waivers or the starting point is readable by anyone
  foreach v_role in array array['authenticated', 'anon', 'service_role', 'public', 'testing_registrar', 'star_registrar', 'bb_registrar'] loop
    if has_column_privilege(v_role, 'public.bb_candidates', 'date_of_birth', 'SELECT')
       or has_column_privilege(v_role, 'public.bb_candidates', 'email_for_results', 'SELECT')
       or has_any_column_privilege(v_role, 'public.bb_candidate_waivers', 'SELECT, INSERT, UPDATE, REFERENCES')
       or has_any_column_privilege(v_role, 'public.bb_starting_point', 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception 'TEST FAILED: T9a % can read the DOB / email / a waiver or starting-point column', v_role;
    end if;
  end loop;

  -- T9b. candidates and waivers have their own masking log triggers (for
  --      insert, update and delete) and never change_log_write; this run's
  --      history (form registrations, desk adds, edits, paper re-signs,
  --      the purge, Delete permanently, Delete cycle) holds no picture, no
  --      test DOB, no test email and not the signer's name
  if exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
              where t.tgrelid in ('public.bb_candidates'::regclass, 'public.bb_candidate_waivers'::regclass)
                and p.proname = 'change_log_write')
     or not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                     where t.tgrelid = 'public.bb_candidates'::regclass and p.proname = 'bb_candidates_log'
                       and (t.tgtype & 4) <> 0 and (t.tgtype & 8) <> 0 and (t.tgtype & 16) <> 0 and (t.tgtype & 2) = 0)
     or not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                     where t.tgrelid = 'public.bb_candidate_waivers'::regclass and p.proname = 'bb_candidate_waivers_log'
                       and (t.tgtype & 4) <> 0 and (t.tgtype & 8) <> 0 and (t.tgtype & 16) <> 0 and (t.tgtype & 2) = 0) then
    raise exception 'TEST FAILED: T9b the candidates / waivers log triggers are wrong';
  end if;
  v_dobs := v_dobs || (current_date - 9000);
  select string_agg(distinct l.table_name || ':' || l.op, ', ') into v_txt
    from public.change_log l
   where l.id > v_mark0
     and (coalesce(l.before::text, '') || coalesce(l.after::text, '')) ~ ('data:image|' || v_mail_tag || '|@example\.com|' || v_signer
                                                                          || '|' || (select string_agg(d::text, '|') from unnest(v_dobs) as d));
  if v_txt is not null then
    raise exception 'TEST FAILED: T9b the history holds a picture, a test DOB, a test email or the signer''s name in: %', v_txt;
  end if;
  -- the removed rows of Delete permanently / Delete cycle are there, masked
  if not exists (select 1 from public.change_log l where l.id > v_mark0 and l.table_name = 'bb_candidates' and l.op = 'delete'
                  and l.action = 'bb_delete_candidate' and l.record_id = v_f2 and l.before ->> 'date_of_birth' = 'on file'
                  and l.before ->> 'email_for_results' = 'on file' and l.before ->> 'first_name' = 'Cy')
     or not exists (select 1 from public.change_log l where l.id > v_mark0 and l.table_name = 'bb_candidate_waivers' and l.op = 'delete'
                     and l.action = 'bb_delete_candidate' and l.before ->> 'signature' = 'on file'
                     and l.before ->> 'signer_name' = 'on file' and not (l.before ? 'submission_id'))
     or not exists (select 1 from public.change_log l where l.id > v_mark0 and l.table_name = 'bb_candidates' and l.op = 'delete'
                     and l.action = 'bb_delete_cycle' and l.before ->> 'date_of_birth' = 'on file')
     or exists (select 1 from public.change_log l where l.id > v_mark0 and l.table_name = 'bb_candidate_waivers'
                 and (l.before ? 'submission_id' or l.after ? 'submission_id'))
     or not exists (select 1 from public.change_log l where l.id > v_mark0 and l.table_name = 'bb_candidates' and l.op = 'update'
                     and l.action = 'bb_update_candidate' and l.before ->> 'date_of_birth' = 'on file'
                     and l.after ->> 'date_of_birth' = 'changed') then
    raise exception 'TEST FAILED: T9b removed / changed rows must be logged masked ("on file" / "changed"), never with the submission id';
  end if;

  -- T9c. the roster, the receipt, the cycles list (and the public answers,
  --      T5h) never hold a DOB, an email, the signer's name, a signature, a
  --      login id or (receipt) a payment note
  perform set_config('request.jwt.claims', v_c_d1, true);
  select id into v_k from public.bb_candidates where cycle_id = v_cm and first_name = 'Cal';
  foreach v_txt in array array[public.bb_cycle_roster(v_cm)::text, public.bb_cycles_list()::text,
                               public.bb_receipt(v_k)::text, public.bb_receipt(v_f1)::text, public.bb_receipt(v_k1)::text] loop
    if v_txt ~ ('data:image|' || v_mail_tag || '|@example\.com|' || v_signer || '|' || v_admin::text || '|' || v_desk::text
                || '|' || (select string_agg(d::text, '|') from unnest(v_dobs) as d) || '|post-dated|date_of_birth|email') then
      raise exception 'TEST FAILED: T9c a list or receipt holds personal data, a login id or a note: %', left(v_txt, 400);
    end if;
  end loop;
  v_r := public.bb_receipt(v_k);
  if v_r ->> 'status' <> 'ok' or jsonb_array_length(v_r -> 'lines') <> 3 or (v_r -> 'money' ->> 'balance_cents')::bigint <> 0
     or jsonb_array_length(v_r -> 'schools') <> 2 or v_r ->> 'printed_by_name' <> 'Staff'
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k)
        <> array['candidate', 'cycle', 'kukkiwon', 'lines', 'money', 'plan', 'printed_by_name', 'printed_on', 'schools', 'status'] then
    raise exception 'TEST FAILED: T9c the receipt: %', v_r;
  end if;
  v_r := public.bb_cycle_roster(v_cm);
  if v_r ->> 'status' <> 'ok'
     or (select count(*) from jsonb_array_elements(v_r -> 'rows')) <> (select count(*) from public.bb_candidates where cycle_id = v_cm)
     or exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(value) where x.value -> 'money' ? 'items')
     or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'rows' -> 0) as k)
        <> array['dan', 'duplicate_of', 'duplicate_state', 'first_name', 'has_payment_rows', 'id', 'kukkiwon', 'last_name',
                 'location_code', 'money', 'plan_id', 'plan_name', 'reference', 'registered_at', 'source', 'status',
                 'version', 'withdrawn_reason']
     -- Dan first, then Shrewsbury before Worcester (names are not compared:
     -- text sorting differs between databases)
     or exists (select 1 from jsonb_array_elements(v_r -> 'rows') with ordinality as a(value, n)
                  join jsonb_array_elements(v_r -> 'rows') with ordinality as b(value, n) on b.n = a.n + 1
                 where (a.value ->> 'dan')::integer > (b.value ->> 'dan')::integer
                    or ((a.value ->> 'dan') = (b.value ->> 'dan')
                        and a.value ->> 'location_code' = 'worcester' and b.value ->> 'location_code' = 'shrewsbury')) then
    raise exception 'TEST FAILED: T9c the roster rows are not as designed';
  end if;
  if public.bb_cycle_roster(v_rand) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_receipt(v_rand) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_candidate_detail(v_rand) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: T9c unknown ids should be not_found';
  end if;
  v_r := public.bb_cycles_list();
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'today')::date <> v_today
     or not exists (select 1 from jsonb_array_elements(v_r -> 'cycles') as x(value)
                     where (x.value ->> 'id')::uuid = v_cm and (x.value ->> 'has_payments')::boolean
                       and (x.value ->> 'has_form_waivers')::boolean and (x.value ->> 'day_count')::integer = 3
                       and (x.value ->> 'candidate_count')::integer
                           = (select count(*) from public.bb_candidates where cycle_id = v_cm and status = 'active')
                       and x.value -> 'state' ->> 'state' = 'open')
     or not exists (select 1 from jsonb_array_elements(v_r -> 'cycles') as x(value)
                     where (x.value ->> 'id')::uuid = v_cy and not (x.value ->> 'has_form_waivers')::boolean
                       and x.value -> 'state' ->> 'registration' = 'not_open_yet') then
    raise exception 'TEST FAILED: T9c the cycles list is not as designed';
  end if;
  -- the detail of a candidate DOES hold the DOB, email and signer (one by id)
  v_r := public.bb_candidate_detail(v_f1);
  if (v_r -> 'candidate' ->> 'date_of_birth')::date <> v_dob17 or v_r -> 'candidate' ->> 'email_for_results' <> v_mail_tag || '.bo@example.com'
     or (v_r -> 'candidate' ->> 'age_on_first_day')::integer <> 17 or not (v_r -> 'candidate' ->> 'under_18_on_first_day')::boolean
     or v_r -> 'waiver' ->> 'signer_name' <> v_signer or not (v_r -> 'waiver' ->> 'signature_on_file')::boolean
     or v_r -> 'waiver' ->> 'how' <> 'drawn' or v_r::text like '%data:image%'
     or v_r -> 'candidate' ? 'withdrawn_by' or v_r -> 'candidate' ? 'created_by' or v_r -> 'candidate' ? 'updated_by'
     or v_r -> 'candidate' -> 'plan' ->> 'name' <> '3 payments' or (v_r ->> 'needs_parent_signature')::boolean then
    raise exception 'TEST FAILED: T9c the candidate detail: %', v_r;
  end if;

  -- ===================================================================
  -- T10. Logging: every write function, called as the app does
  --      ("authenticated"), writes history rows with the right action tag,
  --      actor, session and one batch; candidates and payments carry their
  --      school (payments: the stored one); cycles, days, prices never
  -- ===================================================================
  select full_name into v_txt2 from public.staff where id = v_admin;
  -- 1 save waiver (A)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_save_waiver(v_wv, 'zz test waiver text two ' || v_tag);
  reset role;
  perform pg_temp.bbt_log(v_mark, 'bb_save_waiver', v_admin, v_a1, v_txt2, 'save_waiver');
  v_wv := (v_r ->> 'id')::uuid; v_wv_name := v_r ->> 'version_name';
  -- 2 keep years (A): 3 / 3 -> 4 / 4
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_v := (select version from public.bb_settings);
  v_r := public.bb_set_keep_years(v_v, 4, 4, null);
  v_r := public.bb_set_keep_years(v_v, 4, 4, (v_r ->> 'remove_count')::integer);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T10 keep years answered %', v_r; end if;
  perform pg_temp.bbt_log(v_mark, 'bb_set_keep_years', v_admin, v_a1, v_txt2, 'set_keep_years');
  -- 3 add cycle (A)
  v_p := pg_temp.bbt_payload(v_tag || ' Log', v_today + 240, v_today + 230);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(v_p, null);
  reset role;
  v_k2 := (v_r ->> 'id')::uuid;
  perform pg_temp.bbt_log(v_mark, 'bb_add_cycle', v_admin, v_a1, v_txt2, 'add_cycle');
  if (select count(*) from public.change_log where id > v_mark and action = 'bb_add_cycle') <> 1 + 3 + 3 + 2 + 16 + 4 + 4 then
    raise exception 'TEST FAILED: T10 add_cycle must log one row per written row';
  end if;
  -- 4 update cycle (A)
  v_p := jsonb_set(pg_temp.bbt_current(v_k2), '{days,1,end_time}', '"16:00"');
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_update_cycle(v_k2, 1, v_p);
  reset role;
  perform pg_temp.bbt_log(v_mark, 'bb_update_cycle', v_admin, v_a1, v_txt2, 'update_cycle');
  if (select count(*) from public.change_log where id > v_mark) <> 2 then   -- the day + the cycle's version
    raise exception 'TEST FAILED: T10 update_cycle must log exactly the changed day and the cycle';
  end if;
  -- 5 set registration: an admin opens (S / A; since 0024 the first
  --   opening is admins only), the desk closes (S) - valid with and
  --   without 0024
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_set_registration(v_k2, 2, true);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T10 the admin''s opening answered %', v_r; end if;
  perform pg_temp.bbt_log(v_mark, 'bb_set_registration', v_admin, v_a1, v_txt2, 'set_registration (open)');
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_set_registration(v_k2, (v_r ->> 'version')::integer, false);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T10 the desk''s close answered %', v_r; end if;
  perform pg_temp.bbt_log(v_mark, 'bb_set_registration', v_desk, v_d1, 'Staff', 'set_registration (close)');
  -- 6 add candidate (S)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_candidate(v_k2, 'Log', 'One', v_adult, v_mail_tag || '.l1@example.com', 'shrewsbury', 1,
                                 (select id from public.bb_cycle_plans where cycle_id = v_k2 and name = '3 payments'), true, true);
  reset role;
  v_k := (v_r ->> 'id')::uuid;
  perform pg_temp.bbt_log(v_mark, 'bb_add_candidate', v_desk, v_d1, 'Staff', 'add_candidate');
  if (select count(*) from public.change_log where id > v_mark) <> 2
     or (select location_code from public.change_log where id > v_mark and table_name = 'bb_candidates') <> 'shrewsbury' then
    raise exception 'TEST FAILED: T10 add_candidate must log the candidate (under its school) and its waiver';
  end if;
  -- 7 update candidate (S)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_update_candidate(v_k, 1, 'Log', 'One', v_adult, v_mail_tag || '.l1@example.com', 'worcester', 1);
  reset role;
  perform pg_temp.bbt_log(v_mark, 'bb_update_candidate', v_desk, v_d1, 'Staff', 'update_candidate');
  -- 8 change plan (S)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_change_plan(v_k, 2, (select id from public.bb_cycle_plans where cycle_id = v_k2 and name = 'In full'), true);
  reset role;
  perform pg_temp.bbt_log(v_mark, 'bb_change_plan', v_desk, v_d1, 'Staff', 'change_plan');
  -- 9 paper re-sign (S)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_record_paper_waiver(v_k, 3);
  reset role;
  perform pg_temp.bbt_log(v_mark, 'bb_record_paper_waiver', v_desk, v_d1, 'Staff', 'record_paper_waiver');
  -- 10 record payment (S)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_record_payment(v_k, 4, 50000, 'check', array['p1'], null);
  reset role;
  v_p3 := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.bbt_log(v_mark, 'bb_record_payment', v_desk, v_d1, 'Staff', 'record_payment');
  if (select location_code from public.change_log where id > v_mark and table_name = 'bb_payments') <> 'worcester' then
    raise exception 'TEST FAILED: T10 a payment row must be filed under its stored school';
  end if;
  -- 11 undo payment (S, own, within 10 s)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_undo_payment(v_p3);
  reset role;
  perform pg_temp.bbt_log(v_mark, 'bb_undo_payment', v_desk, v_d1, 'Staff', 'undo_payment');
  -- 12 edit payment (A)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_record_payment(v_k, (v_r ->> 'version')::integer, 50000, 'check', array['p1'], null);
  v_p3 := (v_r ->> 'payment_id')::uuid;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_edit_payment(v_p3, 60000, 'check', array['p1'], null, 'wrong amount');
  reset role;
  v_p3 := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.bbt_log(v_mark, 'bb_edit_payment', v_admin, v_a1, v_txt2, 'edit_payment');
  -- 13 mark check returned (A)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_mark_check_returned(v_p3, 'bounced');
  reset role;
  perform pg_temp.bbt_log(v_mark, 'bb_mark_check_returned', v_admin, v_a1, v_txt2, 'mark_check_returned');
  -- 14 record refund (A) (after undoing the returned mark)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_undo_payment((v_r ->> 'payment_id')::uuid);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_record_refund(v_k, (v_r ->> 'version')::integer, 1000, 'cash', null);
  reset role;
  perform pg_temp.bbt_log(v_mark, 'bb_record_refund', v_admin, v_a1, v_txt2, 'record_refund');
  -- 15 resolve duplicate (S): a second "Log One" with the same DOB
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_candidate(v_k2, 'Log', 'One', v_adult, v_mail_tag || '.l2@example.com', 'worcester', 2,
                                 (select id from public.bb_cycle_plans where cycle_id = v_k2 and name = 'In full'), false, true);
  v_kv := (select version from public.bb_candidates where id = (v_r ->> 'id')::uuid);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r2 := public.bb_resolve_duplicate(v_k, (select version from public.bb_candidates where id = v_k),
                                      (v_r ->> 'id')::uuid, v_kv, true);
  reset role;
  if v_r2 ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T10 resolve answered %', v_r2; end if;
  perform pg_temp.bbt_log(v_mark, 'bb_resolve_duplicate', v_desk, v_d1, 'Staff', 'resolve_duplicate');
  -- 16 withdraw, 17 restore, 18 delete permanently (A) on the second one
  v_k := (v_r ->> 'id')::uuid;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_withdraw_candidate(v_k, (v_r2 ->> 'other_version')::integer);
  reset role;
  perform pg_temp.bbt_log(v_mark, 'bb_withdraw_candidate', v_admin, v_a1, v_txt2, 'withdraw_candidate');
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_restore_candidate(v_k, (v_r ->> 'version')::integer);
  reset role;
  perform pg_temp.bbt_log(v_mark, 'bb_restore_candidate', v_admin, v_a1, v_txt2, 'restore_candidate');
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_delete_candidate(v_k, (v_r ->> 'version')::integer);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T10 delete candidate answered %', v_r; end if;
  perform pg_temp.bbt_log(v_mark, 'bb_delete_candidate', v_admin, v_a1, v_txt2, 'delete_candidate');
  -- 19 delete cycle (A): a fresh cycle with one desk candidate
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' Log Del', v_today + 250, v_today + 245), null);
  v_k2 := (v_r ->> 'id')::uuid;
  v_r := public.bb_add_candidate(v_k2, 'Log', 'Del', v_adult, v_mail_tag || '.ld@example.com', 'worcester', 1,
                                 (select id from public.bb_cycle_plans where cycle_id = v_k2 and name = 'In full'), false, true);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_delete_cycle(v_k2, 1, 1);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T10 delete cycle answered %', v_r; end if;
  perform pg_temp.bbt_log(v_mark, 'bb_delete_cycle', v_admin, v_a1, v_txt2, 'delete_cycle');
  -- the family form: "Family form", no login id, no session
  perform set_config('request.jwt.claims', '', true);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_public_register(v_cm_w, v_tag || ' k9', gen_random_uuid(), 'Log', 'Form', v_adult,
                                   v_mail_tag || '.lf@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  perform pg_temp.bbt_log(v_mark, 'bb_public_register', null, null, 'Family form', 'public_register');
  -- only known action tags in this run's Black Belt history rows
  select string_agg(distinct l.action, ', ') into v_txt
    from public.change_log l
   where l.id > v_mark0 and l.table_name like 'bb\_%'
     and l.action not in ('bb_save_waiver', 'bb_set_keep_years', 'bb_add_cycle', 'bb_update_cycle', 'bb_set_registration',
                          'bb_delete_cycle', 'bb_add_candidate', 'bb_update_candidate', 'bb_change_plan', 'bb_resolve_duplicate',
                          'bb_withdraw_candidate', 'bb_restore_candidate', 'bb_delete_candidate', 'bb_record_paper_waiver',
                          'bb_record_payment', 'bb_undo_payment', 'bb_edit_payment', 'bb_record_refund',
                          'bb_mark_check_returned', 'bb_public_register', 'bb_purge_due', 'manual');
  if v_txt is not null then raise exception 'TEST FAILED: T10 unknown action tag(s) in Black Belt history rows: %', v_txt; end if;

  -- ===================================================================
  -- T11. School dates
  -- ===================================================================
  -- (contract T11 writes 04:30 UTC; Massachusetts is on daylight time
  -- (UTC-4) on Mar 28, 2027, so 11:30 PM there is 03:30 UTC)
  if public.testing_school_date('2027-03-28 03:30:00+00') <> date '2027-03-27'
     or public.testing_school_date('2027-03-28 04:30:00+00') <> date '2027-03-28'
     or public.testing_school_date('2027-01-28 04:30:00+00') <> date '2027-01-27' then
    raise exception 'TEST FAILED: T11 11:30 PM in Massachusetts (03:30 UTC in March, 04:30 UTC in January) is still the day before';
  end if;
  -- a candidate who registered at that instant: its due-date floor is
  -- 2027-03-27 (Old's plan dates are years earlier)
  perform set_config('request.jwt.claims', '', true);
  insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                    cycle_plan_id, kukkiwon, source, reference, registered_at, created_by_name, updated_by_name)
  values (v_co, 'Late', 'Evening', v_adult, v_mail_tag || '.le@example.com', 'worcester', 1, v_co_three, false, 'desk',
          'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text, '2027-03-28 03:30:00+00', '', '')
  returning id into v_k;
  if (select min(i.due_on) from public.bb_candidate_items(v_k) as i) <> date '2027-03-27'
     or (select count(*) from public.bb_candidate_items(v_k) as i where i.due_on = date '2027-03-27') <> 3 then
    raise exception 'TEST FAILED: T11 the due-date floor must be the school date of registered_at';
  end if;

  -- ===================================================================
  -- T12. Races (what one session can prove; contract 11.5)
  -- ===================================================================
  -- (a) the same submission id twice in one transaction -> one candidate,
  --     the same answer (T5c covers the retry under the lock)
  v_txt := gen_random_uuid()::text;
  v_r  := public.bb_public_register(v_cm_w, v_tag || ' ka', v_txt::uuid, 'Race', 'Once', v_adult,
                                    v_mail_tag || '.ro@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  v_r2 := public.bb_public_register(v_cm_w, v_tag || ' ka', v_txt::uuid, 'Race', 'Once', v_adult,
                                    v_mail_tag || '.ro@example.com', 1, v_cm_full, false, true, v_wv_name, v_signer, v_sig);
  if v_r is distinct from v_r2 or (select count(*) from public.bb_candidate_waivers where submission_id = v_txt::uuid) <> 1 then
    raise exception 'TEST FAILED: T12a the same submission id twice must make one candidate';
  end if;
  -- (b) two Add cycle calls -> four different codes
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r  := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' Race A', v_today + 260, v_today + 255), null);
  v_r2 := public.bb_add_cycle(pg_temp.bbt_payload(v_tag || ' Race B', v_today + 260, v_today + 255), null);
  if (select count(distinct c) from unnest(array[v_r ->> 'public_code_worcester', v_r ->> 'public_code_shrewsbury',
                                                 v_r2 ->> 'public_code_worcester', v_r2 ->> 'public_code_shrewsbury']) as c) <> 4 then
    raise exception 'TEST FAILED: T12b two Add cycle calls must draw four different codes';
  end if;
  -- (c) a second reversal or a second returned row of the same row ->
  --     unique_violation (written by hand)
  perform set_config('request.jwt.claims', '', true);
  select p.id into v_p3 from public.bb_payments p
   where p.kind = 'payment' and p.candidate_id in (select id from public.bb_candidates where cycle_id = v_cm and first_name = 'Hal')
     and exists (select 1 from public.bb_payments r where r.reverses_payment_id = p.id and r.kind = 'reversal')
     and p.amount_cents = 29000
   limit 1;
  begin
    insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name,
                                    recorded_by_name, reverses_payment_id)
    select p.candidate_id, p.cycle_id, 'reversal', -p.amount_cents, p.method, v_today, p.location_code, p.cycle_name, 'x', p.id
      from public.bb_payments p where p.id = v_p3;
    raise exception 'TEST FAILED: T12c a second reversal of the same row was accepted';
  exception when unique_violation then null;
  end;
  select p.reverses_payment_id into v_p3 from public.bb_payments p
   where p.kind = 'returned' and exists (select 1 from public.bb_payments u where u.reverses_payment_id = p.id and u.kind = 'reversal')
     and not exists (select 1 from public.bb_payments r where r.reverses_payment_id = p.reverses_payment_id and r.kind = 'reversal')
   limit 1;
  if v_p3 is null then raise exception 'TEST SETUP: T12c no check with an undone returned mark found'; end if;
  begin
    insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name,
                                    recorded_by_name, reverses_payment_id)
    select p.candidate_id, p.cycle_id, 'returned', -p.amount_cents, 'check', v_today, p.location_code, p.cycle_name, 'x', p.id
      from public.bb_payments p where p.id = v_p3;
    raise exception 'TEST FAILED: T12c a second returned row for the same check was accepted';
  exception when unique_violation then null;
  end;
  -- (d) a refund that would take the net below zero (written by hand, as
  --     if an undo had just happened in another session) -> the net floor
  select id into v_k from public.bb_candidates where cycle_id = v_cm and first_name = 'Ned';
  if (select coalesce(sum(amount_cents), 0) from public.bb_payments where candidate_id = v_k) <> 0 then
    raise exception 'TEST SETUP: T12d Ned''s net should be 0';
  end if;
  begin
    insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name, recorded_by_name)
    values (v_k, v_cm, 'refund', -100, 'cash', v_today, 'worcester', v_tag || ' Main', 'x');
    raise exception 'TEST FAILED: T12d a refund below a zero net was accepted';
  exception when check_violation then null;
  end;
  -- (e) the reference counter never repeats
  if (select count(*) from public.bb_candidates) <> (select count(distinct reference) from public.bb_candidates)
     or exists (select 1 from public.bb_candidates c where c.reference !~ '^BB-[0-9]{4,}$')
     or (select min(substr(reference, 4)::bigint) from public.bb_candidates c where c.created_at = now()) < 5001 then
    raise exception 'TEST FAILED: T12e every reference is unique, BB-5001 or higher';
  end if;

  -- ===================================================================
  -- T13. Catalog: the rights and rules on EVERY object 0016 made
  -- ===================================================================

  -- C1. RLS on all 13 tables; the signed waivers and the starting point
  --     have no rule; every other table exactly one read rule
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = any (v_tables) and c.relrowsecurity;
  if v_n <> 13 then raise exception 'TEST FAILED: C1 RLS is on for only % of the 13 tables', v_n; end if;
  select count(*) into v_n from pg_policies p
   where p.schemaname = 'public' and p.tablename = any (v_read_tables) and p.cmd = 'SELECT'
     and p.roles = array['authenticated']::name[] and p.permissive = 'PERMISSIVE' and p.qual like '%has_data_access()%'
     and p.policyname = p.tablename || '_select_with_access';
  if v_n <> 11 then raise exception 'TEST FAILED: C1 expected 11 has_data_access read rules, found %', v_n; end if;
  select count(*) into v_n from pg_policies p where p.schemaname = 'public' and p.tablename = any (v_tables);
  if v_n <> 11 then raise exception 'TEST FAILED: C1 expected no other rules on the 0016 tables, found % in total', v_n; end if;

  -- C2. table-wide rights: none for anon, authenticated, service_role,
  --     PUBLIC or the registrars; column SELECT for authenticated exactly
  --     contract 4.1, and every listed column exists
  foreach v_tbl in array v_tables loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] loop
      if has_table_privilege('anon', 'public.' || v_tbl, v_priv)
         or has_table_privilege('service_role', 'public.' || v_tbl, v_priv)
         or has_table_privilege('public', 'public.' || v_tbl, v_priv)
         or has_table_privilege('authenticated', 'public.' || v_tbl, v_priv)
         or has_table_privilege('bb_registrar', 'public.' || v_tbl, v_priv)
         or has_table_privilege('star_registrar', 'public.' || v_tbl, v_priv)
         or has_table_privilege('testing_registrar', 'public.' || v_tbl, v_priv) then
        raise exception 'TEST FAILED: C2 % has table-wide % for a role that must not have it', v_tbl, v_priv;
      end if;
    end loop;
    foreach v_priv in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege('authenticated', 'public.' || v_tbl, v_priv) then
        raise exception 'TEST FAILED: C2 authenticated has a column % right on %', v_priv, v_tbl;
      end if;
    end loop;
  end loop;
  v_list := array(
    select t || '.' || c
      from (values
        ('bb_settings', 'id,keep_years_after_last_day,keep_years_after_18,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('bb_waiver_versions', 'id,version_name,body,is_placeholder,superseded_at,created_at,created_by_name'),
        ('bb_cycles', 'id,name,application_due,submissions_due,auto_close,registration_open,first_opened_at,public_code_worcester,public_code_shrewsbury,requirements,prices_from,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('bb_cycle_days', 'id,cycle_id,name,day_date,start_time,end_time,place_code,place_other,second_start,second_end,second_place_code,second_place_other,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('bb_cycle_day_parts', 'id,day_id,part'),
        ('bb_cycle_plans', 'id,cycle_id,name,payments_count,position,created_at,created_by_name'),
        ('bb_cycle_plan_amounts', 'id,cycle_plan_id,dan,payment_no,amount_cents'),
        ('bb_cycle_kukkiwon_fees', 'id,cycle_id,dan,amount_cents'),
        ('bb_cycle_plan_payments', 'id,cycle_plan_id,payment_no,due_on,follows_application_due,version,updated_at,updated_by_name'),
        ('bb_candidates', 'id,cycle_id,first_name,last_name,personal_removed_at,location_code,dan,cycle_plan_id,kukkiwon,kukkiwon_added_on,source,reference,registered_at,status,withdrawn_reason,withdrawn_at,withdrawn_by_name,duplicate_state,duplicate_of,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('bb_payments', 'id,candidate_id,cycle_id,kind,amount_cents,method,paid_on,for_items,note,reason,location_code,cycle_name,recorded_at,recorded_by_name,reverses_payment_id')
      ) as g(t, cols), unnest(string_to_array(g.cols, ',')) as c);
  for v_tbl, v_col in
    select c.relname::text, a.attname::text
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any (v_tables) and a.attnum > 0 and not a.attisdropped
  loop
    if has_column_privilege('authenticated', 'public.' || v_tbl, v_col, 'SELECT') is distinct from (v_tbl || '.' || v_col = any (v_list)) then
      raise exception 'TEST FAILED: C2 authenticated SELECT on %.% is %, expected %',
        v_tbl, v_col, has_column_privilege('authenticated', 'public.' || v_tbl, v_col, 'SELECT'), (v_tbl || '.' || v_col = any (v_list));
    end if;
    if has_column_privilege('anon', 'public.' || v_tbl, v_col, 'SELECT')
       or has_column_privilege('service_role', 'public.' || v_tbl, v_col, 'SELECT')
       or has_column_privilege('bb_registrar', 'public.' || v_tbl, v_col, 'SELECT')
       or has_column_privilege('star_registrar', 'public.' || v_tbl, v_col, 'SELECT')
       or has_column_privilege('testing_registrar', 'public.' || v_tbl, v_col, 'SELECT') then
      raise exception 'TEST FAILED: C2 %.% readable by anon, service_role or a registrar', v_tbl, v_col;
    end if;
  end loop;
  select string_agg(x.col, ', ') into v_txt
    from unnest(v_list) as x(col)
   where not exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relname || '.' || a.attname = x.col and a.attnum > 0 and not a.attisdropped);
  if v_txt is not null then raise exception 'TEST FAILED: C2 listed column(s) missing: %', v_txt; end if;

  -- C3. the reference counter: no rights for anyone; starts at 5001
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'public', 'bb_registrar', 'star_registrar', 'testing_registrar'] loop
    foreach v_priv in array array['USAGE', 'SELECT', 'UPDATE'] loop
      if has_sequence_privilege(v_role, 'public.bb_candidate_ref_seq', v_priv) then
        raise exception 'TEST FAILED: C3 % has % on bb_candidate_ref_seq', v_role, v_priv;
      end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_sequences s where s.schemaname = 'public' and s.sequencename = 'bb_candidate_ref_seq'
                  and s.start_value = 5001 and s.data_type = 'bigint'::regtype) then
    raise exception 'TEST FAILED: C3 bb_candidate_ref_seq must be a bigint counter starting at 5001';
  end if;

  -- C4. every 0016 function: exactly one version, search_path pinned,
  --     security definer exactly as designed, no argument defaults, who may
  --     run it, the exact signatures, the volatility of the reads
  v_n := 0;
  for v_fn in
    select p.oid, p.proname::text as name, p.prosecdef, p.proconfig, p.pronargdefaults, p.proacl, p.proowner
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
  loop
    v_n := v_n + 1;
    if not coalesce('search_path=""' = any (v_fn.proconfig), false) then
      raise exception 'TEST FAILED: C4 % has no search_path = ''''', v_fn.oid::regprocedure;
    end if;
    if v_fn.pronargdefaults <> 0 then raise exception 'TEST FAILED: C4 % has argument defaults', v_fn.oid::regprocedure; end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE') or has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
       or has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE') or has_function_privilege('star_registrar', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: C4 anon, service_role or another form''s login can execute %', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_staff_fns)) then
      raise exception 'TEST FAILED: C4 authenticated execute on % is wrong', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('bb_registrar', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_public_fns)) then
      raise exception 'TEST FAILED: C4 bb_registrar execute on % is wrong', v_fn.oid::regprocedure;
    end if;
    if exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) as a where a.grantee = 0) then
      raise exception 'TEST FAILED: C4 PUBLIC has a right on %', v_fn.oid::regprocedure;
    end if;
    if v_fn.prosecdef is distinct from (v_fn.name = any (v_staff_fns || v_public_fns
                                                         || array['bb_candidates_log', 'bb_candidate_waivers_log'])) then
      raise exception 'TEST FAILED: C4 % security definer is %, not as designed', v_fn.oid::regprocedure, v_fn.prosecdef;
    end if;
  end loop;
  if v_n <> cardinality(v_staff_fns || v_public_fns || v_helper_fns) or cardinality(v_staff_fns) <> 25 then
    raise exception 'TEST FAILED: C4 expected exactly % functions from 0016 (one version each, 25 staff), found %',
      cardinality(v_staff_fns || v_public_fns || v_helper_fns), v_n;
  end if;
  -- no other bb_ function exists (nothing left over from an old version);
  -- after 0024 exactly its 19 new functions are there too (CONTRACT-0024 15)
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'bb\_%' and not (p.proname = any (v_staff_fns || v_public_fns || v_helper_fns))
     and not (v_has_0024 and p.proname = any (v_rubric_fns));
  if v_txt is not null then raise exception 'TEST FAILED: C4 unexpected bb_ function(s): %', v_txt; end if;
  if v_has_0024 and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = any (v_rubric_fns)) <> 19 then
    raise exception 'TEST FAILED: C4 (0024) expected exactly the 19 functions 0024 adds, one version each';
  end if;
  if not v_has_0024 and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = 'public' and p.proname = any (v_rubric_fns)) then
    raise exception 'TEST FAILED: C4 a 0024 function exists without 0024''s tables';
  end if;
  select string_agg(x.sig, ', ') into v_txt
    from unnest(array[
      'public.bb_save_waiver(uuid, text)',
      'public.bb_set_keep_years(integer, integer, integer, integer)',
      'public.bb_cycle_defaults()',
      'public.bb_add_cycle(jsonb, uuid)',
      'public.bb_update_cycle(uuid, integer, jsonb)',
      'public.bb_set_registration(uuid, integer, boolean)',
      'public.bb_delete_cycle(uuid, integer, integer)',
      'public.bb_add_candidate(uuid, text, text, date, text, text, integer, uuid, boolean, boolean)',
      'public.bb_update_candidate(uuid, integer, text, text, date, text, text, integer)',
      'public.bb_change_plan(uuid, integer, uuid, boolean)',
      'public.bb_resolve_duplicate(uuid, integer, uuid, integer, boolean)',
      'public.bb_withdraw_candidate(uuid, integer)',
      'public.bb_restore_candidate(uuid, integer)',
      'public.bb_delete_candidate(uuid, integer)',
      'public.bb_record_paper_waiver(uuid, integer)',
      'public.bb_record_payment(uuid, integer, integer, text, text[], text)',
      'public.bb_undo_payment(uuid)',
      'public.bb_edit_payment(uuid, integer, text, text[], text, text)',
      'public.bb_record_refund(uuid, integer, integer, text, text)',
      'public.bb_mark_check_returned(uuid, text)',
      'public.bb_cycles_list()',
      'public.bb_cycle_roster(uuid)',
      'public.bb_candidate_detail(uuid)',
      'public.bb_view_signature(uuid)',
      'public.bb_receipt(uuid)',
      'public.bb_public_cycle(text)',
      'public.bb_public_register(text, text, uuid, text, text, date, text, integer, uuid, boolean, boolean, text, text, text)',
      'public.bb_public_register_core(text, text, uuid, text, text, date, text, integer, uuid, boolean, boolean, text, text, text)',
      'public.bb_price_is_valid(integer)', 'public.bb_email_is_valid(text)', 'public.bb_time_is_valid(time)',
      'public.bb_requirements_is_valid(jsonb)', 'public.bb_age_on(date, date)', 'public.bb_cycle_state(uuid, date)',
      'public.bb_candidate_items(uuid)', 'public.bb_candidate_money(uuid, date)', 'public.bb_purge_due_on(uuid)',
      'public.bb_purge_is_due(uuid, date)', 'public.bb_waiver_version_ok(uuid, timestamptz)', 'public.bb_lock_candidate(uuid)',
      'public.bb_lock_payment(uuid)', 'public.bb_find_duplicate(uuid, uuid, text, text, date)', 'public.bb_recheck_duplicate(uuid)',
      'public.bb_recheck_pointing_at(uuid)', 'public.bb_purge_due()', 'public.bb_public_answer(uuid)']) as x(sig)
   where to_regprocedure(x.sig) is null;
  if v_txt is not null then raise exception 'TEST FAILED: C4 missing function signature(s): %', v_txt; end if;
  select string_agg(p.proname || '=' || p.provolatile::text, ',' order by p.proname collate "C") into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('bb_cycles_list', 'bb_cycle_roster', 'bb_cycle_defaults', 'bb_candidate_detail',
                                                'bb_view_signature', 'bb_receipt', 'bb_public_cycle', 'bb_public_register');
  if v_txt is distinct from 'bb_candidate_detail=s,bb_cycle_defaults=s,bb_cycle_roster=v,bb_cycles_list=v,'
                            'bb_public_cycle=s,bb_public_register=v,bb_receipt=s,bb_view_signature=s' then
    raise exception 'TEST FAILED: C4 volatility of the read functions: %', v_txt;
  end if;

  -- C5. what happens on removal (foreign keys: c = cascade, n = set null,
  --     a = no action, r = restrict). Every key from bb_payments: restrict.
  select string_agg(x.con, ', ') into v_txt
    from (values ('bb_cycle_days_cycle_fk', 'c'), ('bb_cycle_days_place_fk', 'a'), ('bb_cycle_days_second_place_fk', 'a'),
                 ('bb_cycle_day_parts_day_fk', 'c'), ('bb_cycle_plans_cycle_fk', 'c'), ('bb_cycle_plan_amounts_plan_fk', 'c'),
                 ('bb_cycle_kukkiwon_fees_cycle_fk', 'c'), ('bb_cycle_plan_payments_plan_fk', 'c'),
                 ('bb_candidates_cycle_fk', 'c'), ('bb_candidates_location_fk', 'a'), ('bb_candidates_plan_fk', 'a'),
                 ('bb_candidates_duplicate_fk', 'n'), ('bb_candidate_waivers_candidate_fk', 'c'),
                 ('bb_candidate_waivers_version_fk', 'a'), ('bb_payments_candidate_fk', 'r'), ('bb_payments_cycle_fk', 'r'),
                 ('bb_payments_location_fk', 'r'), ('bb_payments_reverses_fk', 'r'))
           as x(con, act)
   where not exists (select 1 from pg_constraint c join pg_namespace n on n.oid = c.connamespace
                      where n.nspname = 'public' and c.conname = x.con and c.contype = 'f' and c.confdeltype = x.act);
  if v_txt is not null then raise exception 'TEST FAILED: C5 missing foreign key or wrong removal rule on: %', v_txt; end if;
  if (select count(*) from pg_constraint c where c.contype = 'f' and c.conrelid = any (array(
        select ('public.' || t)::regclass from unnest(v_tables) as t))) <> 18
     or exists (select 1 from pg_constraint c where c.contype = 'f' and c.conrelid = 'public.bb_payments'::regclass
                 and c.confdeltype <> 'r') then
    raise exception 'TEST FAILED: C5 the 0016 tables must have exactly the 18 listed foreign keys (bb_payments: all restrict)';
  end if;

  -- C6. every trigger exists, runs the right function and is enabled; the
  --     generic trigger's two arguments per table (contract 2.11)
  select string_agg(x.trg, ', ') into v_txt
    from (select t || '_before_write' as trg, t as tbl, 'bb_before_write' as fn
            from unnest(array['bb_settings', 'bb_cycles', 'bb_cycle_days', 'bb_cycle_plan_payments', 'bb_candidates',
                              'bb_candidate_waivers']) as t
          union all
          select t || '_log', t, 'change_log_write'
            from unnest(v_tables) as t where t not in ('bb_candidates', 'bb_candidate_waivers')
          union all
          select t || '_no_truncate', t, 'testing_refuse_truncate' from unnest(v_tables) as t
          union all
          select t || '_guard', t, 'bb_cycle_prices_guard'
            from unnest(array['bb_cycle_plans', 'bb_cycle_plan_amounts', 'bb_cycle_kukkiwon_fees']) as t
          union all
          values ('bb_waiver_versions_guard', 'bb_waiver_versions', 'bb_waiver_versions_guard'),
                 ('bb_starting_point_guard', 'bb_starting_point', 'bb_starting_point_guard'),
                 ('bb_cycles_rules', 'bb_cycles', 'bb_cycles_rules'),
                 ('bb_cycle_day_parts_guard', 'bb_cycle_day_parts', 'bb_cycle_day_parts_guard'),
                 ('bb_cycle_plan_payments_guard', 'bb_cycle_plan_payments', 'bb_cycle_plan_payments_guard'),
                 ('bb_candidates_rules', 'bb_candidates', 'bb_candidates_rules'),
                 ('bb_candidates_log', 'bb_candidates', 'bb_candidates_log'),
                 ('bb_candidate_waivers_rules', 'bb_candidate_waivers', 'bb_candidate_waivers_rules'),
                 ('bb_candidate_waivers_log', 'bb_candidate_waivers', 'bb_candidate_waivers_log'),
                 ('bb_payments_guard', 'bb_payments', 'bb_payments_guard')) as x(trg, tbl, fn)
   where not exists (
     select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
       join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public' and t.tgname = x.trg and c.relname = x.tbl
        and p.proname = x.fn and t.tgenabled = 'O' and not t.tgisinternal);
  if v_txt is not null then raise exception 'TEST FAILED: C6 missing / wrong / disabled trigger(s): %', v_txt; end if;
  select count(*) into v_n from pg_trigger t
   where t.tgrelid = any (array(select ('public.' || t)::regclass from unnest(v_tables) as t)) and not t.tgisinternal;
  if v_n <> 6 + 11 + 13 + 13 then raise exception 'TEST FAILED: C6 expected % triggers on the 0016 tables, found %', 6 + 11 + 13 + 13, v_n; end if;
  select string_agg(x.tbl, ', ') into v_txt
    from (values ('bb_settings', 'id,singleton', ''),
                 ('bb_cycles', 'id,public_code_worcester,public_code_shrewsbury,prices_from',
                  case when v_has_0024 then 'requirements' else '' end),
                 ('bb_cycle_days', 'id,cycle_id', ''),
                 ('bb_cycle_plan_payments', 'id,cycle_plan_id,payment_no', ''),
                 ('bb_candidates', 'id,cycle_id,source,reference,registered_at', 'date_of_birth,email_for_results,personal_removed_at'),
                 ('bb_candidate_waivers', 'id,candidate_id,waiver_version_id,how,submission_id,acknowledged,signed_as_minor,ticked_by_name,signed_at',
                  'signature,signer_name,removed_at')) as x(tbl, a0, a1)
   where not exists (select 1 from pg_trigger t
                      where t.tgrelid = ('public.' || x.tbl)::regclass and t.tgname = x.tbl || '_before_write' and t.tgnargs = 2
                        and pg_get_triggerdef(t.oid) like '%bb_before_write(''' || x.a0 || ''', ''' || x.a1 || ''')%');
  if v_txt is not null then raise exception 'TEST FAILED: C6 bb_before_write arguments wrong on: %', v_txt; end if;
  -- the payment guard runs on insert, update AND delete
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.bb_payments'::regclass and t.tgname = 'bb_payments_guard'
                  and (t.tgtype & 4) <> 0 and (t.tgtype & 8) <> 0 and (t.tgtype & 16) <> 0 and (t.tgtype & 2) <> 0) then
    raise exception 'TEST FAILED: C6 bb_payments_guard must be BEFORE INSERT OR UPDATE OR DELETE';
  end if;

  -- C7. every named rule and index exists; the three partial unique
  --     indexes have their exact WHERE
  select string_agg(x.name, ', ') into v_txt
    from unnest(array[
      'bb_settings_pkey', 'bb_settings_singleton_key', 'bb_settings_singleton_check', 'bb_settings_keep_years_check',
      'bb_waiver_versions_pkey', 'bb_waiver_versions_version_name_key', 'bb_waiver_versions_version_name_check',
      'bb_waiver_versions_body_check', 'bb_starting_point_pkey', 'bb_starting_point_singleton_key',
      'bb_starting_point_singleton_check', 'bb_starting_point_requirements_check',
      'bb_cycles_pkey', 'bb_cycles_name_check', 'bb_cycles_opened_check', 'bb_cycles_code_worcester_key',
      'bb_cycles_code_shrewsbury_key', 'bb_cycles_codes_check', 'bb_cycles_requirements_check',
      'bb_cycle_days_pkey', 'bb_cycle_days_name_check', 'bb_cycle_days_times_check', 'bb_cycle_days_place_check',
      'bb_cycle_days_second_check', 'bb_cycle_days_place_other_check', 'bb_cycle_day_parts_part_check',
      'bb_cycle_day_parts_day_part_key', 'bb_cycle_plans_payments_count_check', 'bb_cycle_plans_position_check',
      'bb_cycle_plans_cycle_position_key', 'bb_cycle_plans_cycle_id_id_key', 'bb_cycle_plan_amounts_dan_check',
      'bb_cycle_plan_amounts_amount_check', 'bb_cycle_plan_amounts_plan_dan_payment_key', 'bb_cycle_kukkiwon_fees_dan_check',
      'bb_cycle_kukkiwon_fees_amount_check', 'bb_cycle_kukkiwon_fees_cycle_dan_key', 'bb_cycle_plan_payments_follows_check',
      'bb_cycle_plan_payments_plan_payment_key', 'bb_candidates_pkey', 'bb_candidates_dob_check', 'bb_candidates_email_check',
      'bb_candidates_personal_check', 'bb_candidates_dan_check', 'bb_candidates_kukkiwon_check', 'bb_candidates_source_check',
      'bb_candidates_reference_key', 'bb_candidates_reference_check', 'bb_candidates_status_check',
      'bb_candidates_duplicate_state_check', 'bb_candidates_duplicate_self_check', 'bb_candidate_waivers_how_check',
      'bb_candidate_waivers_submission_id_key', 'bb_candidate_waivers_submission_check', 'bb_candidate_waivers_acknowledged_check',
      'bb_candidate_waivers_signature_check', 'bb_candidate_waivers_ticked_check', 'bb_candidate_waivers_drawn_check',
      'bb_candidate_waivers_paper_check', 'bb_payments_pkey', 'bb_payments_kind_check', 'bb_payments_method_check',
      'bb_payments_for_items_check', 'bb_payments_note_check', 'bb_payments_reason_check']) as x(name)
   where not exists (select 1 from pg_constraint c join pg_namespace n on n.oid = c.connamespace
                      where n.nspname = 'public' and c.conname = x.name);
  if v_txt is not null then raise exception 'TEST FAILED: C7 missing rule(s): %', v_txt; end if;
  select string_agg(x.name, ', ') into v_txt
    from unnest(array['bb_cycles_lower_name_idx', 'bb_waiver_versions_one_current_idx', 'bb_cycle_days_cycle_date_idx',
                      'bb_cycle_plans_cycle_lower_name_idx', 'bb_candidates_cycle_idx', 'bb_candidates_names_idx',
                      'bb_candidates_duplicate_idx', 'bb_candidates_plan_idx', 'bb_candidate_waivers_candidate_idx',
                      'bb_payments_candidate_idx', 'bb_payments_cycle_idx', 'bb_payments_paid_on_idx',
                      'bb_payments_one_reversal_idx', 'bb_payments_one_returned_idx']) as x(name)
   where not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relkind = 'i' and c.relname = x.name);
  if v_txt is not null then raise exception 'TEST FAILED: C7 missing index(es): %', v_txt; end if;
  if pg_get_indexdef('public.bb_payments_one_reversal_idx'::regclass) not like
       'CREATE UNIQUE INDEX bb_payments_one_reversal_idx ON public.bb_payments USING btree (reverses_payment_id) WHERE (kind = ''reversal''::text)'
     or pg_get_indexdef('public.bb_payments_one_returned_idx'::regclass) not like
       'CREATE UNIQUE INDEX bb_payments_one_returned_idx ON public.bb_payments USING btree (reverses_payment_id) WHERE (kind = ''returned''::text)'
     or pg_get_indexdef('public.bb_waiver_versions_one_current_idx'::regclass) not like
       'CREATE UNIQUE INDEX bb_waiver_versions_one_current_idx ON public.bb_waiver_versions USING btree ((true)) WHERE (superseded_at IS NULL)'
     or not (select i.indisunique from pg_index i where i.indexrelid = 'public.bb_cycles_lower_name_idx'::regclass)
     or not (select i.indisunique from pg_index i where i.indexrelid = 'public.bb_cycle_plans_cycle_lower_name_idx'::regclass) then
    raise exception 'TEST FAILED: C7 the unique / partial unique indexes are not as designed';
  end if;

  -- C8. the 0001-0005 helpers 0016 calls still have the fingerprints they
  --     had when 0016 was written (0016 replaced none of them; if a later
  --     migration changes one, Black Belt's behaviour may change - re-run
  --     this file)
  select string_agg(x.f, ', ') into v_txt
    from (values ('change_log_actor_name', 'dfaaf9fd240a31fad052fa49e9909c96'), ('change_log_write', '0dbd01d2fb6cb41108f126bfe1a44f2d'),
                 ('current_session_id', '32c5f96f3adc387fd022a040fcbc2a4e|1429eed0526fc8ba7ef6cc98c54d9cba'), ('has_data_access', '950515a63adf44c7f70449441cad0a8a'),
                 ('is_admin', '497cd39cbd84bfb2233bde0198713c12'),
                 ('testing_location_address', '4cae0f1d89755becac314c91b7272ab8'), ('testing_name_is_valid', 'ab59348605c54a7fc76c4f69e4c8a6b4'),
                 ('testing_new_public_code', 'b85a828150a0dbad98e10c9bc77d184f'), ('testing_normalize_name', 'd91c6d79a9d50cf9752ecf6ec6a278fe'),
                 ('testing_normalize_note', 'a77231142f20147974040f07fb270dc7'), ('testing_note_is_valid', '590e3e2675e8ee3baf7f9ec1619b1c68'),
                 ('testing_refuse_truncate', '4522d11dc0517ac24c23b50b1bd394cc'), ('testing_school_date', '339e368e7cf3b65fc101646373a2dba8'),
                 ('testing_signature_is_valid', '9e6edc36c547a52462895557449bc33a'), ('testing_today', '015ce0e17fd701bedf8b11ed20b86816'))
           as x(f, m)
   where (select string_agg(md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), ',')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = x.f) <> all (string_to_array(x.m, '|'))
      -- "a|b" = either body is fine: current_session_id has two approved
      -- bodies (before / after Color Belt's central fix, rulebook v0.408)
      or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = x.f);
  if v_txt is not null then raise exception 'TEST FAILED: C8 shared helper(s) changed since 0016: %', v_txt; end if;

  -- C9. no 0016 function uses clock_timestamp (an Edit's two rows must
  --     carry the transaction's own time)
  select string_agg(p.proname, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
     and p.prosrc ilike '%clock_timestamp%';
  if v_txt is not null then raise exception 'TEST FAILED: C9 clock_timestamp used in: %', v_txt; end if;

  -- C10. no 0016 function turns a timestamp WITH time zone into a date
  --      with "::date" (a school date is always testing_school_date):
  --      no "::date" right after now(), current_timestamp, a *_at column
  --      or p_now
  select string_agg(p.proname, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
     and p.prosrc ~* '(now\(\)|current_timestamp|_at|p_now|clock_timestamp\(\))\s*\)*\s*::\s*date\M';
  if v_txt is not null then raise exception 'TEST FAILED: C10 a timestamptz is cast with ::date in: %', v_txt; end if;

  reset role;
end;
$$;

select 'ALL 0016 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
