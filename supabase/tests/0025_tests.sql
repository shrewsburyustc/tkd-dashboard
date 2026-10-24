-- =====================================================================
-- 0025_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0025_black_belt_grading.sql
--   (Black Belt grading and results). It checks, in this order (contract
--   0025 section 12.1):
--     G1  who may call what: anon and bb_registrar nothing; sessions
--         without data access get no_access from every function; the
--         desk gets not_allowed from the admin-only ones
--     G2  table and column rights: no direct read of grades, sends,
--         downloads or the "grading started" mark; the texts only by their
--         granted columns; no role reads the new bb_candidates columns;
--         no direct write anywhere
--     G3  the exact keys of every answer; no DOB, email, money, reference,
--         age, earlier-row id or kept age where they don't belong
--     G4  the refusals of every write, in their order
--     G5  the guard triggers (direct writes that skip the functions)
--     G6  the result: every case of 0025_grading_cases.json inline, the
--         cast through the functions, the result key
--     G7  make-ups (Add, kept / retest, every refusal, no money, Undo)
--     G8  the rubric lock "for good" once grading started (Q-G1)
--     G9  Edit cycle with grades (S2)
--     G10 Delete permanently / Delete cycle with grades (Q-G3)
--     G11 the Dan change that clears grades (Q-G4)
--     G12 Mark as sent and its Undo (Q-G6 B)
--     G13 the result email texts
--     G14 the CSV and its download log
--     G15 the purge keeps the result (Q-G2, S19, S20)
--     G16 logging, and no DOB / email / kept age in the history
--     G17 the catalog: RLS, rights, functions, triggers, rules, no
--         dynamic SQL
--     G18 the family form is still fast
--   It makes its own test cycles and candidates with unusual names ("zz
--   test 1a2b3c4d ..."), so it works whatever is already in the database.
--   Its cycles get the ORIGINAL default rubric (written out below), so an
--   admin's later change of the default rubric can't break it.
--   There is no fake clock: date rules are tested by moving test cycles
--   into the past directly (as the SQL Editor's role). The 10-second undo
--   window is tested by moving a test send's time back (the trigger that
--   guards it is switched off for that one statement, inside this
--   transaction; the final rollback undoes that too).
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change. NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0016_tests.sql (read its header): sessions A1-A8 (admin) and D1-D3
--   (the front desk), and anon. Most checks call the functions as the SQL
--   Editor's own role with A1's or D1's token set (the functions run as
--   their owner either way, and the test can then read every column).
--   G1, G2 and G16 call them as "authenticated", like the app.
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0010, 0011, 0016, 0024 and 0025 are applied. You need TWO
--      existing, ACTIVE staff rows: an admin (Main Admin) and the shared
--      front desk (Staff, role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test removes
--      its own test rows and checks that some removals are REFUSED.
--      Everything is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0025 TESTS PASSED".
--   * Failed: an error starting with "TEST FAILED:" (or "TEST SETUP:")
--     saying which check broke and what came back instead. Nothing was
--     saved either way. If it failed, run   rollback;   on its own once.
-- =====================================================================

begin;

-- the default rubric as 0024 seeded it (filled in below), for this run only
create temporary table bbg_rubric (doc jsonb) on commit drop;

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
  v_mail  text := 'zzbg' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_role  text;

  v_r      jsonb;
  v_r2     jsonb;
  v_x      jsonb;
  v_i      integer;
  v_n      integer;
  v_n2     integer;
  v_v      integer;
  v_txt    text;
  v_txt2   text;
  v_key    text;
  v_mark   bigint;
  v_mark0  bigint;
  v_list   text[];
  v_labels text[];
  v_ok     text[];
  v_bad    text[];
  v_none   text[];
  v_shift  integer;
  v_snap_sql text;
  v_snap   text;
  v_snap2  text;
  v_d      date;
  v_ts     timestamptz;
  v_fn     record;

  -- the cast's sheets (filled in below, generated from the shared cases)
  v_sheet_alex jsonb; v_sheet_zoe jsonb; v_sheet_mia jsonb; v_sheet_lucas jsonb; v_sheet_rina jsonb;
  v_sheet_ava jsonb; v_sheet_sam jsonb; v_sheet_noah jsonb; v_sheet_bao jsonb; v_sheet_leo jsonb;

  -- cycles: Spring (past), Fall and Winter (future), Old (4 years ago),
  -- ND (no testing days: no age), CD (one past day, one today, one future)
  v_sp uuid; v_fa uuid; v_wi uuid; v_old uuid; v_nd uuid; v_cd uuid; v_del uuid; v_reg uuid; v_aut uuid; v_lat uuid;
  v_sp_first date; v_fa_first date; v_old_first date;
  -- candidates
  v_alex uuid; v_zoe uuid; v_mia uuid; v_rina uuid; v_lucas uuid; v_sam uuid; v_teen uuid; v_wd uuid; v_dup uuid;
  v_olga uuid; v_nage uuid; v_cdk uuid; v_dk uuid; v_pay uuid;
  v_mu uuid; v_mu2 uuid; v_mu3 uuid; v_mur uuid; v_mut uuid;
  v_send uuid; v_send2 uuid;
  v_hand_sends uuid[] := '{}';   -- sends this test writes or changes by hand (G16)
  v_dee uuid; v_deemu uuid; v_bea uuid; v_fay uuid;
  v_alex_k text; v_zoe_ids text[];
  -- subject ids of 1st Dan (default rubric)
  v_s_fs text; v_s_ref text; v_s_kor text; v_s_tkd text; v_s_one text; v_s_basic text; v_s_power text;
  v_s_stretch text; v_s_pull text; v_s_mile text; v_s_sprint text; v_s_egg text; v_s_med text; v_s_proj text;
  v_s2_fs text;

  v_new_fns text[] := array[
    'bb_set_grade', 'bb_set_measured', 'bb_set_extra_count', 'bb_set_makeup_subjects', 'bb_add_makeup',
    'bb_mark_result_sent', 'bb_undo_result_sent', 'bb_set_result_text', 'bb_update_candidate_clear',
    'bb_grading_grid', 'bb_cycle_results', 'bb_makeup_list', 'bb_result_email', 'bb_results_csv', 'bb_cycle_grading_state'];
  v_helpers text[] := array[
    'bb_grade_result', 'bb_age_groups', 'bb_measured_letter', 'bb_extra_points', 'bb_kept_match', 'bb_result_text_problem',
    'bb_candidate_age', 'bb_candidate_grading_input', 'bb_candidate_result', 'bb_candidate_result_with',
    'bb_cycle_has_grading', 'bb_cycle_grading_started_at', 'bb_candidate_has_grades', 'bb_sent_state',
    'bb_lock_candidate_shared', 'bb_update_candidate_core',
    'bb_note_grading_started', 'bb_cycle_grading_started_guard', 'bb_candidates_keep_age', 'bb_grades_rules',
    'bb_extra_counts_rules', 'bb_makeup_subjects_rules', 'bb_result_sends_guard', 'bb_downloads_guard',
    'bb_payments_makeup_guard', 'bb_cycle_days_grading', 'bb_cycle_day_parts_grading'];
  v_replaced text[] := array[
    'bb_purge_due_on', 'bb_purge_due', 'bb_update_cycle', 'bb_delete_cycle', 'bb_update_candidate', 'bb_change_plan',
    'bb_restore_candidate', 'bb_delete_candidate', 'bb_cycle_roster', 'bb_candidate_detail', 'bb_candidates_rules',
    'bb_candidates_log', 'bb_save_cycle_dan', 'bb_undo_cycle_dan', 'bb_cycles_rules'];
  v_tables text[] := array['bb_grades', 'bb_extra_counts', 'bb_makeup_subjects', 'bb_result_texts', 'bb_result_sends',
                           'bb_downloads', 'bb_cycle_grading_started'];
  v_result_keys text[] := array['age_group', 'choice_needed', 'complete', 'counts', 'd_subjects', 'extra', 'late', 'maximum',
                                'missing', 'needs', 'parts', 'pass_bracket', 'pass_mark', 'reasons', 'result_key', 'status',
                                'subjects', 'total'];
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
  if to_regclass('public.bb_grades') is null then
    raise exception 'TEST SETUP: public.bb_grades is missing (is 0025 applied?)';
  end if;
  if (select full_name from public.staff where id = v_desk) is distinct from 'Staff' then
    raise exception 'TEST SETUP: the front-desk staff row must be named "Staff" (G16 checks the history names)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  select coalesce(max(id), 0) into v_mark0 from public.change_log;

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

  -- the purge stays off unless a check turns it on (and back off)
  update public.bb_settings set keep_years_after_last_day = null, keep_years_after_18 = null;

  -- One md5 of every 0025 table + the candidates + the history count ("did
  -- anything change?").
  v_snap_sql := 'select md5(coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_grades x), '''')
    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_extra_counts x), '''')
    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_makeup_subjects x), '''')
    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_result_texts x), '''')
    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_result_sends x), '''')
    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_downloads x), '''')
    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_cycle_grading_started x), '''')
    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_candidates x), '''')
    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_cycles x), '''')
    || (select count(*) from public.change_log)::text)';

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   bbg_payload(name, first day, application due): a valid Add cycle
  --     payload (as 0016_tests' bbt_payload): Physical on d1, Technical
  --     on d1 + 7, Curriculum on d1 + 14, submissions due d1 + 10
  --   bbg_shift(cycle, days): moves every date of a cycle (as the SQL
  --     Editor's role - a hand fix)
  --   bbg_dob(first day, age): a date of birth that is "age" on that day
  --   bbg_sid(cycle, dan, name): a subject's id in a cycle's copy
  --   bbg_sheet(candidate, sheet): enters a whole sheet (grades by name,
  --     counts) through bb_set_grade / bb_set_measured / bb_set_extra_count
  --     with the caller's token; every answer must be ok
  --   bbg_dan(dan, ops): Dan n of the default rubric with the shared
  --     cases' changes applied
  --   bbg_case / bbg_kept_case: one shared case through bb_grade_result /
  --     bb_kept_match, compared with its expected answer
  --   bbg_keys(json): the object's keys, sorted
  --   bbg_fail(label, detail): raises "TEST FAILED: label: detail"
  execute $f$
    create function pg_temp.bbg_fail(p_label text, p_detail text) returns void
    language plpgsql as $b$
    begin
      raise exception 'TEST FAILED: %: %', p_label, left(coalesce(p_detail, '(null)'), 600);
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbg_keys(p jsonb) returns text[]
    language sql as $b$ select array(select k from jsonb_object_keys(p) as k order by k collate "C"); $b$;
  $f$;
  execute $f$
    create function pg_temp.bbg_payload(p_name text, p_d1 date, p_app date) returns jsonb
    language sql as $b$
      select jsonb_build_object(
        'name', p_name, 'application_due', p_app, 'submissions_due', p_d1 + 10, 'auto_close', true,
        'days', jsonb_build_array(
          jsonb_build_object('name', 'Physical', 'day_date', p_d1, 'start_time', '12:30', 'end_time', '14:30',
                             'place', jsonb_build_object('code', 'worcester'), 'second', null, 'parts', jsonb_build_array('physical')),
          jsonb_build_object('name', 'Technical', 'day_date', p_d1 + 7, 'start_time', '12:30', 'end_time', '15:30',
                             'place', jsonb_build_object('code', 'shrewsbury'), 'second', null, 'parts', jsonb_build_array('technical')),
          jsonb_build_object('name', 'Curriculum', 'day_date', p_d1 + 14, 'start_time', '14:00', 'end_time', '17:00',
                             'place', jsonb_build_object('code', 'shrewsbury'), 'second', null, 'parts', jsonb_build_array('curriculum'))),
        'plans', jsonb_build_array(
          jsonb_build_object('name', 'In full',
                             'payments', jsonb_build_array(jsonb_build_object('due_on', p_app, 'follows_application_due', true)),
                             'amounts', jsonb_build_object('1', jsonb_build_array(87000), '2', jsonb_build_array(99000),
                                                           '3', jsonb_build_array(150000), '4', jsonb_build_array(270000)))),
        'kukkiwon', jsonb_build_object('1', 10000, '2', 11000, '3', 14000, '4', 17000),
        'prices_from', null);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbg_shift(p_cycle uuid, p_days integer) returns void
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
    create function pg_temp.bbg_dob(p_first date, p_age integer) returns date
    language sql as $b$ select (p_first - make_interval(years => p_age) - interval '10 days')::date; $b$;
  $f$;
  execute $f$
    create function pg_temp.bbg_sid(p_cycle uuid, p_dan integer, p_name text) returns text
    language sql as $b$
      select s.e ->> 'id'
        from public.bb_cycles y
        cross join lateral jsonb_array_elements(y.requirements -> 'dans' -> (p_dan - 1) -> 'parts') as p(e)
        cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)
       where y.id = p_cycle and s.e ->> 'name' = p_name
       limit 1;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbg_sheet(p_candidate uuid, p_sheet jsonb) returns jsonb
    language plpgsql as $b$
    declare
      v_c  public.bb_candidates;
      v_g  jsonb;
      v_r  jsonb;
      v_id text;
    begin
      select * into v_c from public.bb_candidates where id = p_candidate;
      for v_g in select e from jsonb_array_elements(p_sheet -> 'grades') as x(e) loop
        v_id := pg_temp.bbg_sid(v_c.cycle_id, v_c.dan, v_g ->> 'subject');
        if v_g ? 'letter' then
          v_r := public.bb_set_grade(p_candidate, v_c.dan, v_id, v_g ->> 'letter');
        else
          v_r := public.bb_set_measured(p_candidate, v_c.dan, v_id, (v_g ->> 'measured')::numeric, (v_g ->> 'way')::integer);
        end if;
        if v_r ->> 'status' <> 'ok' then
          raise exception 'TEST SETUP: entering % for % answered %', v_g, v_c.first_name, v_r;
        end if;
      end loop;
      for v_g in select e from jsonb_array_elements(coalesce(p_sheet -> 'counts', '[]')) as x(e) loop
        v_r := public.bb_set_extra_count(p_candidate, v_c.dan, v_g ->> 'item', (v_g ->> 'count')::integer);
        if v_r ->> 'status' <> 'ok' then
          raise exception 'TEST SETUP: entering count % for % answered %', v_g, v_c.first_name, v_r;
        end if;
      end loop;
      return v_r -> 'result';
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbg_dan(p_dan integer, p_ops jsonb) returns jsonb
    language sql as $b$
      with recursive o as (select e, n from jsonb_array_elements(p_ops) with ordinality as t(e, n)),
      w(i, d) as (select 0::bigint, r.doc -> 'dans' -> (p_dan - 1) from pg_temp.bbg_rubric r
        union all
        select w.i + 1,
               case when o.e ->> 'op' = 'set'
                    then jsonb_set(w.d, array(select jsonb_array_elements_text(o.e -> 'path')),
                                   case when o.e ? 'value_json' then (o.e ->> 'value_json')::jsonb else o.e -> 'value' end, true)
                    else w.d #- array(select jsonb_array_elements_text(o.e -> 'path')) end
          from w join o on o.n = w.i + 1)
      select d from w order by i desc limit 1;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbg_case(p_name text, p_dan integer, p_ops jsonb, p_age integer, p_grades jsonb, p_counts jsonb,
                                     p_retest text[], p_chosen text[], p_today date, p_due date, p_expect jsonb) returns void
    language plpgsql as $b$
    declare
      v_r   jsonb;
      v_bad text := '';
      v_k   text;
    begin
      v_r := public.bb_grade_result(pg_temp.bbg_dan(p_dan, p_ops), p_age, p_grades, p_counts, p_retest, p_chosen, p_today, p_due);
      if pg_temp.bbg_keys(v_r) <> array['age_group', 'choice_needed', 'complete', 'counts', 'd_subjects', 'extra', 'late', 'maximum',
                                        'missing', 'needs', 'parts', 'pass_bracket', 'pass_mark', 'reasons', 'result_key', 'status',
                                        'subjects', 'total'] then
        v_bad := v_bad || ' keys';
      end if;
      foreach v_k in array array['status', 'reasons', 'complete', 'pass_bracket', 'age_group', 'd_subjects', 'needs', 'late',
                                 'missing', 'choice_needed', 'counts'] loop
        if v_r -> v_k is distinct from p_expect -> v_k then
          v_bad := v_bad || ' ' || v_k || '=' || coalesce((v_r -> v_k)::text, 'null');
        end if;
      end loop;
      foreach v_k in array array['total', 'maximum', 'pass_mark'] loop
        if (v_r ->> v_k)::numeric is distinct from (p_expect ->> v_k)::numeric then
          v_bad := v_bad || ' ' || v_k || '=' || coalesce(v_r ->> v_k, 'null');
        end if;
      end loop;
      if (v_r -> 'extra' ->> 'total')::numeric is distinct from (p_expect ->> 'extra_total')::numeric then
        v_bad := v_bad || ' extra_total=' || coalesce(v_r -> 'extra' ->> 'total', 'null');
      end if;
      if exists (select 1 from jsonb_each(p_expect -> 'parts') as e(code, pts)
                  where (select (p.e ->> 'points')::numeric from jsonb_array_elements(v_r -> 'parts') as p(e)
                          where p.e ->> 'code' = e.code) is distinct from (e.pts #>> '{}')::numeric)
         or jsonb_array_length(v_r -> 'parts') <> (select count(*) from jsonb_object_keys(p_expect -> 'parts')) then
        v_bad := v_bad || ' parts=' || (v_r -> 'parts')::text;
      end if;
      if md5(p_expect ->> 'result_key_input') <> v_r ->> 'result_key' then
        v_bad := v_bad || ' result_key';
      end if;
      if v_bad <> '' then
        raise exception 'TEST FAILED: G6 shared case "%":%', p_name, v_bad;
      end if;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbg_kept_case(p_name text, p_dan integer, p_ops jsonb, p_age integer, p_grades jsonb, p_counts jsonb,
                                          p_retest text[], p_chosen text[], p_today date, p_due date,
                                          p_ldan integer, p_lops jsonb, p_lage integer, p_expect jsonb) returns void
    language plpgsql as $b$
    declare
      v_er jsonb;
      v_m  jsonb;
    begin
      v_er := public.bb_grade_result(pg_temp.bbg_dan(p_dan, p_ops), p_age, p_grades, p_counts, p_retest, p_chosen, p_today, p_due);
      v_m := public.bb_kept_match(v_er, pg_temp.bbg_dan(p_dan, p_ops), p_counts, pg_temp.bbg_dan(p_ldan, p_lops), p_lage);
      if v_m is distinct from p_expect then
        raise exception 'TEST FAILED: G7 shared kept case "%": % (expected %)', p_name, left(v_m::text, 400), left(p_expect::text, 400);
      end if;
    end;
    $b$;
  $f$;

  execute $f$
    create function pg_temp.bbg_current(p_cycle uuid) returns jsonb
    language sql as $b$
      select jsonb_build_object(
        'name', y.name, 'application_due', y.application_due, 'submissions_due', y.submissions_due,
        'auto_close', y.auto_close,
        'days', (select jsonb_agg(jsonb_build_object(
                          'id', d.id, 'name', d.name, 'day_date', d.day_date,
                          'start_time', left(d.start_time::text, 5), 'end_time', left(d.end_time::text, 5),
                          'place', case when d.place_code is not null then jsonb_build_object('code', d.place_code)
                                        else jsonb_build_object('other', d.place_other) end,
                          'second', null,
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
  -- bbg_row(answer, candidate): that candidate's row of a list answer
  execute $f$
    create function pg_temp.bbg_row(p_answer jsonb, p_id uuid) returns jsonb
    language sql as $b$
      select x.e from jsonb_array_elements(p_answer -> 'rows') as x(e) where x.e ->> 'id' = p_id::text limit 1;
    $b$;
  $f$;
  -- bbg_add(cycle, first, last, dob, school, dan): a desk candidate (the caller's token)
  execute $f$
    create function pg_temp.bbg_add(p_cycle uuid, p_first text, p_last text, p_dob date, p_school text, p_dan integer, p_mail text)
    returns uuid language plpgsql as $b$
    declare
      v_r jsonb;
    begin
      v_r := public.bb_add_candidate(p_cycle, p_first, p_last, p_dob, p_mail, p_school, p_dan,
                                     (select pl.id from public.bb_cycle_plans pl where pl.cycle_id = p_cycle order by pl.position limit 1),
                                     false, true);
      if v_r ->> 'status' <> 'ok' then
        raise exception 'TEST SETUP: adding % % answered %', p_first, p_last, v_r;
      end if;
      return (v_r ->> 'id')::uuid;
    end;
    $b$;
  $f$;

  -- the generated data: the default rubric, the cast's sheets
  -- (generated) the default rubric of migration 0024 (src/lib/blackBelt/rubricDefault.js), written out
  -- here so these tests don't depend on what an admin later saved as the default
  insert into pg_temp.bbg_rubric (doc) values ('{"schema_version":2,"source":"Fall 2026 (old Sheet)","dans":[{"dan":1,"rev":1,"saved_at":null,"saved_by_name":null,"pass":{"brackets":[{"from":null,"to":17,"pass_mark":275},{"from":18,"to":null,"pass_mark":293}],"no_d":true,"makeup":"A subject graded D is made up at the next testing, even if the total passes."},"parts":[{"code":"physical","name":"Physical","grade_points":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2,"D":0},"subjects":[{"id":"ec806b43","name":"Stretching","credits":3,"scoring":"measured","ways":[{"name":null,"unit":"inches","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2}},{"from":9,"to":12,"cutoffs":{"A+":6,"A":5,"B+":4,"B":3,"C":2}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":6,"B+":5,"B":4,"C":2}}]}],"points_mode":"worked","points":{"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"38b5cd9f","name":"Sit-up (20 sec)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"count","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":18,"A":16,"B+":11,"B":6,"C":4}},{"from":9,"to":12,"cutoffs":{"A+":20,"A":18,"B+":15,"B":10,"C":4}},{"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":6}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"b7e19759","name":"Push-up (1 min)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"count","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":20,"A":18,"B+":16,"B":14,"C":12}},{"from":9,"to":12,"cutoffs":{"A+":36,"A":30,"B+":25,"B":20,"C":15}},{"from":13,"to":null,"cutoffs":{"A+":50,"A":40,"B+":30,"B":25,"C":20}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"435f76cf","name":"Static jump","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"inches","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":12,"A":10,"B+":9,"B":7,"C":3}},{"from":9,"to":12,"cutoffs":{"A+":18,"A":15,"B+":13,"B":10,"C":5}},{"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":10}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"5e91e6a9","name":"Long jump","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"inches (feet x 12 + inches)","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":72,"A":60,"B+":54,"B":48,"C":36}},{"from":9,"to":12,"cutoffs":{"A+":84,"A":72,"B+":66,"B":60,"C":48}},{"from":13,"to":null,"cutoffs":{"A+":96,"A":84,"B+":78,"B":72,"C":60}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"b53843bc","name":"Sprint 4x10 m","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"seconds","direction":"at_most","brackets":[{"from":null,"to":8,"cutoffs":{"A+":10,"A":12,"B+":13,"B":14,"C":16}},{"from":9,"to":12,"cutoffs":{"A+":9,"A":11,"B+":12,"B":13,"C":15}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":10,"B+":11,"B":12,"C":14}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"ef1254f8","name":"Pull-up or hold","credits":2,"scoring":"measured","ways":[{"name":"Pull-up","unit":"reps","direction":"at_least","brackets":[{"from":null,"to":12,"cutoffs":{"A+":6,"A":5,"B+":3,"B":2,"C":1}},{"from":13,"to":null,"cutoffs":{"A+":10,"A":8,"B+":6,"B":4,"C":2}}]},{"name":"Hold","unit":"seconds","direction":"at_least","brackets":[{"from":null,"to":null,"cutoffs":{"A+":31,"A":26,"B+":21,"B":11,"C":9}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":null},{"id":"3dd99b9f","name":"Sprint 100 m","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"seconds","direction":"under","brackets":[{"from":null,"to":8,"cutoffs":{"A+":18,"A":20,"B+":22,"B":24,"C":28}},{"from":9,"to":12,"cutoffs":{"A+":15,"A":17,"B+":19,"B":21,"C":24}},{"from":13,"to":null,"cutoffs":{"A+":14,"A":15,"B+":16,"B":17,"C":23}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":null},{"id":"5accced1","name":"1/2 or 1 mile","credits":3,"scoring":"measured","ways":[{"name":null,"unit":"minutes","direction":"at_most","brackets":[{"from":null,"to":8,"cutoffs":{"A+":5,"A":6,"B+":6.5,"B":7,"C":8}},{"from":9,"to":12,"cutoffs":{"A+":4,"A":5,"B+":5.5,"B":6,"C":7}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":8.5,"B+":9,"B":11,"C":12}}]}],"points_mode":"worked","points":{"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":"1/2 mile for 12 and under, 1 mile for 13 and over"}]},{"code":"technical","name":"Technical","grade_points":{"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},"subjects":[{"id":"88de8004","name":"Referee seminar","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"f2630888","name":"Free sparring","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":12,"A":10.5,"A-":9.75,"B+":9,"B":7.5,"B-":6.75,"C":6,"C-":3,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"ab9209e1","name":"Target kick (30 sec)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"kicks in 30 seconds","direction":"at_least","brackets":[{"from":null,"to":9,"cutoffs":{"A+":35,"A":31,"B+":26,"B":22,"C":21}},{"from":10,"to":null,"cutoffs":{"A+":39,"A":34,"B+":29,"B":24,"C":23}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"24280b75","name":"Korean terminology","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"8620a413","name":"TKD knowledge","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null}]},{"code":"curriculum","name":"Curriculum","grade_points":{"A+":4.5,"A":4,"A-":3.8,"B+":3.5,"B":3.3,"B-":3,"C":2.5,"C-":2,"D":0},"subjects":[{"id":"d5bf66fd","name":"Basic 10 Motions (1-7)","credits":5,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"522a5a06","name":"Tae-Geuk Poomsae (1-8)","credits":5,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"d16684a5","name":"Sa Bang Chuck (1-13)","credits":5,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"fe78294a","name":"One Step Sparring (1-24)","credits":5,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},"limited_to":[{"from":18,"to":null}],"outdoor":false,"handed_in":false,"note":null},{"id":"7dd13946","name":"Technical Break","credits":5,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"dc32f7c3","name":"Power Break","credits":5,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"31683485","name":"Self-Defense","credits":5,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null}]},{"code":"other","name":"Other requirements","grade_points":{"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},"subjects":[{"id":"574ce43c","name":"Egg test","credits":5,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"5896c437","name":"Meditation","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"7b07c0cc","name":"Assistant instructor course","credits":5,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"6f5c13b7","name":"Appreciation letter","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"2ab87e21","name":"TKD project","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null}]}],"extra_points":{"counts_toward_total":true,"limit":null,"to_confirm":true,"note":null,"items":[{"name":"Extra stripes","rule":{"kind":"per_count","points_each":1}},{"name":"Outstanding performance","rule":{"kind":"steps","steps":[{"at_least":5,"points":5}]}},{"name":"Competitions","rule":{"kind":"steps","steps":[{"at_least":1,"points":3},{"at_least":2,"points":5},{"at_least":3,"points":7},{"at_least":4,"points":10},{"at_least":5,"points":15}]}},{"name":"Attendance (classes)","rule":{"kind":"steps","steps":[{"at_least":320,"points":3},{"at_least":375,"points":5},{"at_least":400,"points":10}]}},{"name":"Special events","rule":{"kind":"steps","steps":[{"at_least":3,"points":3},{"at_least":6,"points":5},{"at_least":10,"points":10}]}},{"name":"Breaking class","rule":{"kind":"steps","steps":[{"at_least":16,"points":3},{"at_least":20,"points":5},{"at_least":25,"points":10}]}}]}},{"dan":2,"rev":1,"saved_at":null,"saved_by_name":null,"pass":{"brackets":[{"from":null,"to":null,"pass_mark":261}],"no_d":true,"makeup":"A subject graded D is made up at the next testing, even if the total passes."},"parts":[{"code":"physical","name":"Physical","grade_points":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2,"D":0},"subjects":[{"id":"88782efd","name":"Stretching","credits":3,"scoring":"measured","ways":[{"name":null,"unit":"inches","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2}},{"from":9,"to":12,"cutoffs":{"A+":6,"A":5,"B+":4,"B":3,"C":2}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":6,"B+":5,"B":4,"C":2}}]}],"points_mode":"worked","points":{"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"3458194b","name":"Sit-up (20 sec)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"count","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":18,"A":16,"B+":11,"B":6,"C":4}},{"from":9,"to":12,"cutoffs":{"A+":20,"A":18,"B+":15,"B":10,"C":4}},{"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":6}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"bda05912","name":"Push-up (1 min)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"count","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":20,"A":18,"B+":16,"B":14,"C":12}},{"from":9,"to":12,"cutoffs":{"A+":36,"A":30,"B+":25,"B":20,"C":15}},{"from":13,"to":null,"cutoffs":{"A+":50,"A":40,"B+":30,"B":25,"C":20}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"f2939df4","name":"Static jump","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"inches","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":12,"A":10,"B+":9,"B":7,"C":3}},{"from":9,"to":12,"cutoffs":{"A+":18,"A":15,"B+":13,"B":10,"C":5}},{"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":10}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"9f0f771f","name":"Long jump","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"inches (feet x 12 + inches)","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":72,"A":60,"B+":54,"B":48,"C":36}},{"from":9,"to":12,"cutoffs":{"A+":84,"A":72,"B+":66,"B":60,"C":48}},{"from":13,"to":null,"cutoffs":{"A+":96,"A":84,"B+":78,"B":72,"C":60}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"56ce109b","name":"Sprint 4x10 m","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"seconds","direction":"at_most","brackets":[{"from":null,"to":8,"cutoffs":{"A+":10,"A":12,"B+":13,"B":14,"C":16}},{"from":9,"to":12,"cutoffs":{"A+":9,"A":11,"B+":12,"B":13,"C":15}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":10,"B+":11,"B":12,"C":14}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"30a73415","name":"Pull-up or hold","credits":2,"scoring":"measured","ways":[{"name":"Pull-up","unit":"reps","direction":"at_least","brackets":[{"from":null,"to":12,"cutoffs":{"A+":6,"A":5,"B+":3,"B":2,"C":1}},{"from":13,"to":null,"cutoffs":{"A+":10,"A":8,"B+":6,"B":4,"C":2}}]},{"name":"Hold","unit":"seconds","direction":"at_least","brackets":[{"from":null,"to":null,"cutoffs":{"A+":31,"A":26,"B+":21,"B":11,"C":9}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":null},{"id":"bc785353","name":"Sprint 100 m","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"seconds","direction":"under","brackets":[{"from":null,"to":8,"cutoffs":{"A+":18,"A":20,"B+":22,"B":24,"C":28}},{"from":9,"to":12,"cutoffs":{"A+":15,"A":17,"B+":19,"B":21,"C":24}},{"from":13,"to":null,"cutoffs":{"A+":14,"A":15,"B+":16,"B":17,"C":23}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":null},{"id":"c10c07d9","name":"1/2 or 1 mile","credits":3,"scoring":"measured","ways":[{"name":null,"unit":"minutes","direction":"at_most","brackets":[{"from":null,"to":8,"cutoffs":{"A+":5,"A":6,"B+":6.5,"B":7,"C":8}},{"from":9,"to":12,"cutoffs":{"A+":4,"A":5,"B+":5.5,"B":6,"C":7}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":8.5,"B+":9,"B":11,"C":12}}]}],"points_mode":"worked","points":{"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":"1/2 mile for 12 and under, 1 mile for 13 and over"}]},{"code":"technical","name":"Technical","grade_points":{"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},"subjects":[{"id":"46d29c95","name":"Referee seminar","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"6006bb0f","name":"Free sparring","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":12,"A":10.5,"A-":9.75,"B+":9,"B":7.5,"B-":6.75,"C":6,"C-":3,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"7cd90c2d","name":"Target kick (30 sec)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"kicks in 30 seconds","direction":"at_least","brackets":[{"from":null,"to":9,"cutoffs":{"A+":35,"A":31,"B+":26,"B":22,"C":21}},{"from":10,"to":null,"cutoffs":{"A+":39,"A":34,"B+":29,"B":24,"C":23}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"bb9316b8","name":"Korean terminology","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"098df542","name":"TKD knowledge","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null}]},{"code":"curriculum","name":"Curriculum","grade_points":{"A+":4.5,"A":4,"A-":3.8,"B+":3.5,"B":3.3,"B-":3,"C":2.5,"C-":2,"D":0},"subjects":[{"id":"4300c41c","name":"White-Bodan Curriculum","credits":10,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"bd9c37a4","name":"Go-Ryo Poomsae","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"7401f449","name":"Advance 10 Motion (1-5)","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"8ca94570","name":"Advance Sa Bang Chuck (1-5)","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"b5092201","name":"Step Sa Bang Chuck (1-5)","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"4691d5eb","name":"Power Break","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"de91a496","name":"Technical Break","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"1ad78dc6","name":"Two Step Sparring (1-10)","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null}]},{"code":"other","name":"Other requirements","grade_points":{"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},"subjects":[{"id":"65e21d80","name":"Egg test","credits":5,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"9bbecfd5","name":"Meditation","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"982839cc","name":"Assistant instructor course","credits":5,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"592d0502","name":"Appreciation letter","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"ca36bfac","name":"TKD project","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null}]}],"extra_points":{"counts_toward_total":true,"limit":null,"to_confirm":true,"note":null,"items":[{"name":"Extra stripes","rule":{"kind":"per_count","points_each":1}},{"name":"Outstanding performance","rule":{"kind":"steps","steps":[{"at_least":4,"points":5}]}},{"name":"Competitions","rule":{"kind":"steps","steps":[{"at_least":1,"points":3},{"at_least":2,"points":5},{"at_least":3,"points":7},{"at_least":4,"points":10},{"at_least":5,"points":15}]}},{"name":"Attendance (classes)","rule":{"kind":"steps","steps":[{"at_least":250,"points":3},{"at_least":271,"points":5},{"at_least":300,"points":10}]}},{"name":"Special events","rule":{"kind":"steps","steps":[{"at_least":3,"points":3},{"at_least":6,"points":5},{"at_least":10,"points":10}]}},{"name":"Breaking class","rule":{"kind":"steps","steps":[{"at_least":11,"points":3},{"at_least":17,"points":5},{"at_least":21,"points":10}]}}]}},{"dan":3,"rev":1,"saved_at":null,"saved_by_name":null,"pass":{"brackets":[{"from":null,"to":null,"pass_mark":293}],"no_d":true,"makeup":"A subject graded D is made up at the next testing, even if the total passes."},"parts":[{"code":"physical","name":"Physical","grade_points":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2,"D":0},"subjects":[{"id":"ecf8b62f","name":"Stretching","credits":3,"scoring":"measured","ways":[{"name":null,"unit":"inches","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2}},{"from":9,"to":12,"cutoffs":{"A+":6,"A":5,"B+":4,"B":3,"C":2}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":6,"B+":5,"B":4,"C":2}}]}],"points_mode":"worked","points":{"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"4de30043","name":"Sit-up (20 sec)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"count","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":18,"A":16,"B+":11,"B":6,"C":4}},{"from":9,"to":12,"cutoffs":{"A+":20,"A":18,"B+":15,"B":10,"C":4}},{"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":6}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"be9e7846","name":"Push-up (1 min)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"count","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":20,"A":18,"B+":16,"B":14,"C":12}},{"from":9,"to":12,"cutoffs":{"A+":36,"A":30,"B+":25,"B":20,"C":15}},{"from":13,"to":null,"cutoffs":{"A+":50,"A":40,"B+":30,"B":25,"C":20}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"772e00b6","name":"Static jump","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"inches","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":12,"A":10,"B+":9,"B":7,"C":3}},{"from":9,"to":12,"cutoffs":{"A+":18,"A":15,"B+":13,"B":10,"C":5}},{"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":10}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"eab1bc07","name":"Long jump","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"inches (feet x 12 + inches)","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":72,"A":60,"B+":54,"B":48,"C":36}},{"from":9,"to":12,"cutoffs":{"A+":84,"A":72,"B+":66,"B":60,"C":48}},{"from":13,"to":null,"cutoffs":{"A+":96,"A":84,"B+":78,"B":72,"C":60}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"1b3993c3","name":"Sprint 4x10 m","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"seconds","direction":"at_most","brackets":[{"from":null,"to":8,"cutoffs":{"A+":10,"A":12,"B+":13,"B":14,"C":16}},{"from":9,"to":12,"cutoffs":{"A+":9,"A":11,"B+":12,"B":13,"C":15}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":10,"B+":11,"B":12,"C":14}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"15dc15b2","name":"Pull-up or hold","credits":2,"scoring":"measured","ways":[{"name":"Pull-up","unit":"reps","direction":"at_least","brackets":[{"from":null,"to":12,"cutoffs":{"A+":6,"A":5,"B+":3,"B":2,"C":1}},{"from":13,"to":null,"cutoffs":{"A+":10,"A":8,"B+":6,"B":4,"C":2}}]},{"name":"Hold","unit":"seconds","direction":"at_least","brackets":[{"from":null,"to":null,"cutoffs":{"A+":31,"A":26,"B+":21,"B":11,"C":9}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":null},{"id":"9b173050","name":"Sprint 100 m","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"seconds","direction":"under","brackets":[{"from":null,"to":8,"cutoffs":{"A+":18,"A":20,"B+":22,"B":24,"C":28}},{"from":9,"to":12,"cutoffs":{"A+":15,"A":17,"B+":19,"B":21,"C":24}},{"from":13,"to":null,"cutoffs":{"A+":14,"A":15,"B+":16,"B":17,"C":23}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":null},{"id":"b56dd03e","name":"1/2 or 1 mile","credits":3,"scoring":"measured","ways":[{"name":null,"unit":"minutes","direction":"at_most","brackets":[{"from":null,"to":8,"cutoffs":{"A+":5,"A":6,"B+":6.5,"B":7,"C":8}},{"from":9,"to":12,"cutoffs":{"A+":4,"A":5,"B+":5.5,"B":6,"C":7}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":8.5,"B+":9,"B":11,"C":12}}]}],"points_mode":"worked","points":{"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":"1/2 mile for 12 and under, 1 mile for 13 and over"}]},{"code":"technical","name":"Technical","grade_points":{"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},"subjects":[{"id":"46d080a6","name":"Referee seminar","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"20711eb2","name":"Free sparring","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":12,"A":10.5,"A-":9.75,"B+":9,"B":7.5,"B-":6.75,"C":6,"C-":3,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"d94bb071","name":"Target kick (30 sec)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"kicks in 30 seconds","direction":"at_least","brackets":[{"from":null,"to":9,"cutoffs":{"A+":35,"A":31,"B+":26,"B":22,"C":21}},{"from":10,"to":null,"cutoffs":{"A+":39,"A":34,"B+":29,"B":24,"C":23}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"d2b4bb0d","name":"Korean terminology","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"04eadac1","name":"TKD knowledge","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null}]},{"code":"curriculum","name":"Curriculum","grade_points":{"A+":4.5,"A":4,"A-":3.8,"B+":3.5,"B":3.3,"B-":3,"C":2.5,"C-":2,"D":0},"subjects":[{"id":"2f50f893","name":"White-Bodan Curriculum","credits":10,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"c238815a","name":"Geum Gang Poomsae","credits":5,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"e9c6dfbf","name":"1st Dan Curriculum","credits":10,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"9079236f","name":"2nd Dan Sa Bang Chuck (1-4)","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"866afbdb","name":"Creative Poomsae","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"c3aa25e1","name":"Creative Sa Bang Chuck","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"3b5f6219","name":"Technical Break","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"d34904e4","name":"Power Break","credits":3,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null}]},{"code":"other","name":"Other requirements","grade_points":{"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},"subjects":[{"id":"fd8d3b51","name":"Egg test","credits":5,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"af8ce847","name":"Meditation","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"c6301785","name":"Assistant instructor course","credits":5,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"de448912","name":"Appreciation letter","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"8550fa6d","name":"TKD project","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null}]}],"extra_points":{"counts_toward_total":true,"limit":null,"to_confirm":true,"note":null,"items":[{"name":"Extra stripes","rule":{"kind":"per_count","points_each":1}},{"name":"Outstanding performance","rule":{"kind":"steps","steps":[{"at_least":3,"points":5}]}},{"name":"Competitions","rule":{"kind":"steps","steps":[{"at_least":1,"points":3},{"at_least":2,"points":5},{"at_least":3,"points":7},{"at_least":4,"points":10},{"at_least":5,"points":15}]}},{"name":"Attendance (classes)","rule":{"kind":"steps","steps":[{"at_least":210,"points":3},{"at_least":231,"points":5},{"at_least":250,"points":10}]}},{"name":"Special events","rule":{"kind":"steps","steps":[{"at_least":3,"points":3},{"at_least":6,"points":5},{"at_least":10,"points":10}]}},{"name":"Breaking class","rule":{"kind":"steps","steps":[{"at_least":11,"points":3},{"at_least":17,"points":5},{"at_least":21,"points":10}]}}]}},{"dan":4,"rev":1,"saved_at":null,"saved_by_name":null,"pass":{"brackets":[{"from":null,"to":null,"pass_mark":453}],"no_d":true,"makeup":"A subject graded D is made up at the next testing, even if the total passes."},"parts":[{"code":"physical","name":"Physical","grade_points":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2,"D":0},"subjects":[{"id":"dad0838d","name":"Stretching","credits":3,"scoring":"measured","ways":[{"name":null,"unit":"inches","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2}},{"from":9,"to":12,"cutoffs":{"A+":6,"A":5,"B+":4,"B":3,"C":2}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":6,"B+":5,"B":4,"C":2}}]}],"points_mode":"worked","points":{"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"385b03f8","name":"Sit-up (20 sec)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"count","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":18,"A":16,"B+":11,"B":6,"C":4}},{"from":9,"to":12,"cutoffs":{"A+":20,"A":18,"B+":15,"B":10,"C":4}},{"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":6}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"02d4e8c2","name":"Push-up (1 min)","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"count","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":20,"A":18,"B+":16,"B":14,"C":12}},{"from":9,"to":12,"cutoffs":{"A+":36,"A":30,"B+":25,"B":20,"C":15}},{"from":13,"to":null,"cutoffs":{"A+":50,"A":40,"B+":30,"B":25,"C":20}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"b0574466","name":"Static jump","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"inches","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":12,"A":10,"B+":9,"B":7,"C":3}},{"from":9,"to":12,"cutoffs":{"A+":18,"A":15,"B+":13,"B":10,"C":5}},{"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":10}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"091d987a","name":"Long jump","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"inches (feet x 12 + inches)","direction":"at_least","brackets":[{"from":null,"to":8,"cutoffs":{"A+":72,"A":60,"B+":54,"B":48,"C":36}},{"from":9,"to":12,"cutoffs":{"A+":84,"A":72,"B+":66,"B":60,"C":48}},{"from":13,"to":null,"cutoffs":{"A+":96,"A":84,"B+":78,"B":72,"C":60}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"429987ca","name":"Sprint 4x10 m","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"seconds","direction":"at_most","brackets":[{"from":null,"to":8,"cutoffs":{"A+":10,"A":12,"B+":13,"B":14,"C":16}},{"from":9,"to":12,"cutoffs":{"A+":9,"A":11,"B+":12,"B":13,"C":15}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":10,"B+":11,"B":12,"C":14}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"c456d1fc","name":"Pull-up or hold","credits":2,"scoring":"measured","ways":[{"name":"Pull-up","unit":"reps","direction":"at_least","brackets":[{"from":null,"to":12,"cutoffs":{"A+":6,"A":5,"B+":3,"B":2,"C":1}},{"from":13,"to":null,"cutoffs":{"A+":10,"A":8,"B+":6,"B":4,"C":2}}]},{"name":"Hold","unit":"seconds","direction":"at_least","brackets":[{"from":null,"to":null,"cutoffs":{"A+":31,"A":26,"B+":21,"B":11,"C":9}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":null},{"id":"fac2fc81","name":"Sprint 100 m","credits":2,"scoring":"measured","ways":[{"name":null,"unit":"seconds","direction":"under","brackets":[{"from":null,"to":8,"cutoffs":{"A+":18,"A":20,"B+":22,"B":24,"C":28}},{"from":9,"to":12,"cutoffs":{"A+":15,"A":17,"B+":19,"B":21,"C":24}},{"from":13,"to":null,"cutoffs":{"A+":14,"A":15,"B+":16,"B":17,"C":23}}]}],"points_mode":"worked","points":{"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":null},{"id":"5f186262","name":"1/2 or 1 mile","credits":3,"scoring":"measured","ways":[{"name":null,"unit":"minutes","direction":"at_most","brackets":[{"from":null,"to":8,"cutoffs":{"A+":5,"A":6,"B+":6.5,"B":7,"C":8}},{"from":9,"to":12,"cutoffs":{"A+":4,"A":5,"B+":5.5,"B":6,"C":7}},{"from":13,"to":null,"cutoffs":{"A+":8,"A":8.5,"B+":9,"B":11,"C":12}}]}],"points_mode":"worked","points":{"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},"limited_to":null,"outdoor":true,"handed_in":false,"note":"1/2 mile for 12 and under, 1 mile for 13 and over"}]},{"code":"technical","name":"Technical","grade_points":{"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},"subjects":[{"id":"ff410974","name":"Referee seminar","credits":10,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":40,"A":35,"A-":32.5,"B+":30,"B":25,"B-":22.5,"C":20,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"ed7137f5","name":"Free sparring","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"08bf6910","name":"Target kick (30 sec)","credits":4,"scoring":"measured","ways":[{"name":null,"unit":"kicks in 30 seconds","direction":"at_least","brackets":[{"from":null,"to":9,"cutoffs":{"A+":35,"A":31,"B+":26,"B":22,"C":21}},{"from":10,"to":null,"cutoffs":{"A+":39,"A":34,"B+":29,"B":24,"C":23}}]}],"points_mode":"own","points":{"A+":16,"A":14,"B+":12,"B":9,"C":8,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"f7656496","name":"Korean terminology","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"fc23ec3c","name":"TKD knowledge","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"2e77f7d2","name":"Written test","credits":10,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":40,"A":35,"A-":32.5,"B+":30,"B":25,"B-":22.5,"C":20,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null}]},{"code":"curriculum","name":"Curriculum","grade_points":{"A+":4.5,"A":4,"A-":3.8,"B+":3.5,"B":3.3,"B-":3,"C":2.5,"C-":2,"D":0},"subjects":[{"id":"969ddf81","name":"White-Bodan Curriculum","credits":10,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"e78a74df","name":"Tae Baek Poomsae","credits":4,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"58165970","name":"1st Dan Curriculum","credits":10,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"bb52202a","name":"2nd Dan Curriculum","credits":10,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"cf2085ae","name":"3rd Dan Sa Bang Chuck (1-6)","credits":4,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"b5428a7b","name":"Creative Poomsae","credits":4,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"7f13b763","name":"Creative Sa Bang Chuck","credits":4,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"2fc03cd2","name":"Technical Break","credits":4,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"48868ae5","name":"Power Break","credits":4,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null}]},{"code":"other","name":"Other requirements","grade_points":{"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},"subjects":[{"id":"dd6acc66","name":"Egg test","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"e74fd0a5","name":"Meditation","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"7b1022de","name":"Assistant instructor course","credits":10,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":40,"A":35,"A-":32.5,"B+":30,"B":25,"B-":22.5,"C":20,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null},{"id":"5f554fb5","name":"Appreciation letter","credits":4,"scoring":"graded","ways":[],"points_mode":"own","points":{"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null},{"id":"2d1208c8","name":"TKD project","credits":10,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":40,"A":35,"A-":32.5,"B+":30,"B":25,"B-":22.5,"C":20,"C-":10,"D":0},"limited_to":null,"outdoor":false,"handed_in":true,"note":null}]}],"extra_points":{"counts_toward_total":true,"limit":null,"to_confirm":true,"note":"4th Dan uses the 3rd Dan numbers for now","items":[{"name":"Extra stripes","rule":{"kind":"per_count","points_each":1}},{"name":"Outstanding performance","rule":{"kind":"steps","steps":[{"at_least":3,"points":5}]}},{"name":"Competitions","rule":{"kind":"steps","steps":[{"at_least":1,"points":3},{"at_least":2,"points":5},{"at_least":3,"points":7},{"at_least":4,"points":10},{"at_least":5,"points":15}]}},{"name":"Attendance (classes)","rule":{"kind":"steps","steps":[{"at_least":210,"points":3},{"at_least":231,"points":5},{"at_least":250,"points":10}]}},{"name":"Special events","rule":{"kind":"steps","steps":[{"at_least":3,"points":3},{"at_least":6,"points":5},{"at_least":10,"points":10}]}},{"name":"Breaking class","rule":{"kind":"steps","steps":[{"at_least":11,"points":3},{"at_least":17,"points":5},{"at_least":21,"points":10}]}}]}}]}'::jsonb);
  -- (generated) the cast sheets of 0025_grading_cases.json
  v_sheet_alex := '{"grades":[{"subject":"Stretching","part":"physical","measured":7,"way":0},{"subject":"Sit-up (20 sec)","part":"physical","measured":21,"way":0},{"subject":"Push-up (1 min)","part":"physical","measured":41,"way":0},{"subject":"Static jump","part":"physical","measured":19,"way":0},{"subject":"Long jump","part":"physical","measured":85,"way":0},{"subject":"Sprint 4x10 m","part":"physical","measured":10.6,"way":0},{"subject":"Pull-up or hold","part":"physical","measured":8,"way":0},{"subject":"Sprint 100 m","part":"physical","measured":15.4,"way":0},{"subject":"1/2 or 1 mile","part":"physical","measured":8.6667,"way":0},{"subject":"Referee seminar","part":"technical","letter":"A"},{"subject":"Free sparring","part":"technical","letter":"A-"},{"subject":"Target kick (30 sec)","part":"technical","measured":35,"way":0},{"subject":"Korean terminology","part":"technical","letter":"A"},{"subject":"TKD knowledge","part":"technical","letter":"A-"},{"subject":"Basic 10 Motions (1-7)","part":"curriculum","letter":"A"},{"subject":"Tae-Geuk Poomsae (1-8)","part":"curriculum","letter":"A"},{"subject":"Sa Bang Chuck (1-13)","part":"curriculum","letter":"A-"},{"subject":"Technical Break","part":"curriculum","letter":"A"},{"subject":"Power Break","part":"curriculum","letter":"A-"},{"subject":"Self-Defense","part":"curriculum","letter":"A"},{"subject":"Egg test","part":"other","letter":"A"},{"subject":"Meditation","part":"other","letter":"A-"},{"subject":"Assistant instructor course","part":"other","letter":"A"},{"subject":"Appreciation letter","part":"other","letter":"A"},{"subject":"TKD project","part":"other","letter":"A"}],"counts":[{"item":"Extra stripes","count":2},{"item":"Competitions","count":1},{"item":"Attendance (classes)","count":380},{"item":"Special events","count":3},{"item":"Breaking class","count":16}]}'::jsonb;
  v_sheet_zoe := '{"grades":[{"subject":"Stretching","part":"physical","measured":6,"way":0},{"subject":"Sit-up (20 sec)","part":"physical","measured":20,"way":0},{"subject":"Push-up (1 min)","part":"physical","measured":32,"way":0},{"subject":"Static jump","part":"physical","measured":18,"way":0},{"subject":"Long jump","part":"physical","measured":80,"way":0},{"subject":"Sprint 4x10 m","part":"physical","measured":11.4,"way":0},{"subject":"Pull-up or hold","part":"physical","measured":6,"way":0},{"subject":"Sprint 100 m","part":"physical","measured":15.6,"way":0},{"subject":"1/2 or 1 mile","part":"physical","measured":11.5,"way":0},{"subject":"Referee seminar","part":"technical","letter":"A"},{"subject":"Free sparring","part":"technical","letter":"B+"},{"subject":"Target kick (30 sec)","part":"technical","measured":31,"way":0},{"subject":"Korean terminology","part":"technical","letter":"C"},{"subject":"TKD knowledge","part":"technical","letter":"B-"},{"subject":"Basic 10 Motions (1-7)","part":"curriculum","letter":"A"},{"subject":"Tae-Geuk Poomsae (1-8)","part":"curriculum","letter":"A-"},{"subject":"Sa Bang Chuck (1-13)","part":"curriculum","letter":"B+"},{"subject":"Technical Break","part":"curriculum","letter":"A"},{"subject":"Power Break","part":"curriculum","letter":"C-"},{"subject":"Self-Defense","part":"curriculum","letter":"A-"},{"subject":"Egg test","part":"other","letter":"A"},{"subject":"Meditation","part":"other","letter":"A-"},{"subject":"Assistant instructor course","part":"other","letter":"B+"},{"subject":"Appreciation letter","part":"other","letter":"A"},{"subject":"TKD project","part":"other","letter":"A-"}],"counts":[{"item":"Extra stripes","count":0},{"item":"Competitions","count":0},{"item":"Attendance (classes)","count":322},{"item":"Special events","count":1},{"item":"Breaking class","count":8}]}'::jsonb;
  v_sheet_mia := '{"grades":[{"subject":"Stretching","part":"physical","measured":7,"way":0},{"subject":"Sit-up (20 sec)","part":"physical","measured":22,"way":0},{"subject":"Push-up (1 min)","part":"physical","measured":45,"way":0},{"subject":"Static jump","part":"physical","measured":20,"way":0},{"subject":"Long jump","part":"physical","measured":88,"way":0},{"subject":"Sprint 4x10 m","part":"physical","measured":9.8,"way":0},{"subject":"Pull-up or hold","part":"physical","measured":35,"way":1},{"subject":"Sprint 100 m","part":"physical","measured":14.6,"way":0},{"subject":"1/2 or 1 mile","part":"physical","measured":8.25,"way":0},{"subject":"Referee seminar","part":"technical","letter":"A"},{"subject":"Free sparring","part":"technical","letter":"D"},{"subject":"Target kick (30 sec)","part":"technical","measured":37,"way":0},{"subject":"Korean terminology","part":"technical","letter":"B+"},{"subject":"TKD knowledge","part":"technical","letter":"A"},{"subject":"Basic 10 Motions (1-7)","part":"curriculum","letter":"A"},{"subject":"Tae-Geuk Poomsae (1-8)","part":"curriculum","letter":"A"},{"subject":"Sa Bang Chuck (1-13)","part":"curriculum","letter":"A-"},{"subject":"One Step Sparring (1-24)","part":"curriculum","letter":"A"},{"subject":"Technical Break","part":"curriculum","letter":"A"},{"subject":"Power Break","part":"curriculum","letter":"A+"},{"subject":"Self-Defense","part":"curriculum","letter":"A"},{"subject":"Egg test","part":"other","letter":"A"},{"subject":"Meditation","part":"other","letter":"A"},{"subject":"Assistant instructor course","part":"other","letter":"A"},{"subject":"Appreciation letter","part":"other","letter":"A"},{"subject":"TKD project","part":"other","letter":"A"}],"counts":[{"item":"Extra stripes","count":2},{"item":"Outstanding performance","count":5},{"item":"Competitions","count":0},{"item":"Attendance (classes)","count":290},{"item":"Special events","count":6},{"item":"Breaking class","count":16}]}'::jsonb;
  v_sheet_lucas := '{"grades":[{"subject":"Stretching","part":"physical","measured":5,"way":0},{"subject":"Sit-up (20 sec)","part":"physical","measured":17,"way":0},{"subject":"Push-up (1 min)","part":"physical","measured":27,"way":0},{"subject":"Static jump","part":"physical","measured":14,"way":0},{"subject":"Long jump","part":"physical","measured":70,"way":0},{"subject":"Sprint 4x10 m","part":"physical","measured":11.8,"way":0},{"subject":"Pull-up or hold","part":"physical","measured":4,"way":0},{"subject":"Sprint 100 m","part":"physical","measured":18.6,"way":0},{"subject":"1/2 or 1 mile","part":"physical","measured":5.7,"way":0},{"subject":"Referee seminar","part":"technical","letter":"A"},{"subject":"Free sparring","part":"technical","letter":"B+"},{"subject":"Target kick (30 sec)","part":"technical","measured":30,"way":0},{"subject":"Korean terminology","part":"technical","letter":"A"},{"subject":"TKD knowledge","part":"technical","letter":"A-"},{"subject":"Basic 10 Motions (1-7)","part":"curriculum","letter":"A"},{"subject":"Tae-Geuk Poomsae (1-8)","part":"curriculum","letter":"A-"},{"subject":"Sa Bang Chuck (1-13)","part":"curriculum","letter":"B+"},{"subject":"Technical Break","part":"curriculum","letter":"A"},{"subject":"Power Break","part":"curriculum","letter":"A"},{"subject":"Self-Defense","part":"curriculum","letter":"A-"},{"subject":"Egg test","part":"other","letter":"A"},{"subject":"Meditation","part":"other","letter":"A-"},{"subject":"Assistant instructor course","part":"other","letter":"B+"},{"subject":"Appreciation letter","part":"other","letter":"A"}],"counts":[{"item":"Extra stripes","count":1},{"item":"Competitions","count":1},{"item":"Attendance (classes)","count":380},{"item":"Special events","count":3},{"item":"Breaking class","count":10}]}'::jsonb;
  v_sheet_rina := '{"grades":[{"subject":"Stretching","part":"physical","measured":5,"way":0},{"subject":"Sit-up (20 sec)","part":"physical","measured":18,"way":0},{"subject":"Push-up (1 min)","part":"physical","measured":31,"way":0},{"subject":"Static jump","part":"physical","measured":16,"way":0},{"subject":"Long jump","part":"physical","measured":79,"way":0},{"subject":"Sprint 4x10 m","part":"physical","measured":11.6,"way":0},{"subject":"Pull-up or hold","part":"physical","measured":6,"way":0},{"subject":"Sprint 100 m","part":"physical","measured":15.7,"way":0},{"subject":"1/2 or 1 mile","part":"physical","measured":12.6667,"way":0},{"subject":"Referee seminar","part":"technical","letter":"B+"},{"subject":"Free sparring","part":"technical","letter":"B"},{"subject":"Target kick (30 sec)","part":"technical","measured":28,"way":0},{"subject":"Korean terminology","part":"technical","letter":"B+"},{"subject":"TKD knowledge","part":"technical","letter":"B"},{"subject":"Basic 10 Motions (1-7)","part":"curriculum","letter":"B+"},{"subject":"Tae-Geuk Poomsae (1-8)","part":"curriculum","letter":"B"},{"subject":"Sa Bang Chuck (1-13)","part":"curriculum","letter":"B+"},{"subject":"One Step Sparring (1-24)","part":"curriculum","letter":"B"},{"subject":"Technical Break","part":"curriculum","letter":"B"},{"subject":"Power Break","part":"curriculum","letter":"A-"},{"subject":"Self-Defense","part":"curriculum","letter":"B+"},{"subject":"Egg test","part":"other","letter":"B+"},{"subject":"Meditation","part":"other","letter":"B"},{"subject":"Assistant instructor course","part":"other","letter":"B"},{"subject":"Appreciation letter","part":"other","letter":"B+"},{"subject":"TKD project","part":"other","letter":"B"}],"counts":[{"item":"Attendance (classes)","count":344}]}'::jsonb;
  v_sheet_ava := '{"grades":[{"subject":"Stretching","part":"physical","measured":6,"way":0},{"subject":"Sit-up (20 sec)","part":"physical","measured":20,"way":0},{"subject":"Push-up (1 min)","part":"physical","measured":35,"way":0},{"subject":"Static jump","part":"physical","measured":18,"way":0},{"subject":"Long jump","part":"physical","measured":80,"way":0},{"subject":"Sprint 4x10 m","part":"physical","measured":10.5,"way":0},{"subject":"Pull-up or hold","part":"physical","measured":27,"way":1},{"subject":"Sprint 100 m","part":"physical","measured":15.5,"way":0},{"subject":"1/2 or 1 mile","part":"physical","measured":8.8333,"way":0},{"subject":"Referee seminar","part":"technical","letter":"A"},{"subject":"Free sparring","part":"technical","letter":"A-"},{"subject":"Target kick (30 sec)","part":"technical","measured":30,"way":0},{"subject":"Korean terminology","part":"technical","letter":"A"},{"subject":"TKD knowledge","part":"technical","letter":"A"},{"subject":"White-Bodan Curriculum","part":"curriculum","letter":"A"},{"subject":"Go-Ryo Poomsae","part":"curriculum","letter":"A-"},{"subject":"Advance 10 Motion (1-5)","part":"curriculum","letter":"A"},{"subject":"Advance Sa Bang Chuck (1-5)","part":"curriculum","letter":"B+"},{"subject":"Step Sa Bang Chuck (1-5)","part":"curriculum","letter":"A-"},{"subject":"Power Break","part":"curriculum","letter":"A"},{"subject":"Technical Break","part":"curriculum","letter":"A"},{"subject":"Two Step Sparring (1-10)","part":"curriculum","letter":"A-"},{"subject":"Egg test","part":"other","letter":"A"},{"subject":"Meditation","part":"other","letter":"A"},{"subject":"Assistant instructor course","part":"other","letter":"A"},{"subject":"Appreciation letter","part":"other","letter":"A"},{"subject":"TKD project","part":"other","letter":"A"}],"counts":[{"item":"Extra stripes","count":1},{"item":"Competitions","count":0},{"item":"Attendance (classes)","count":260},{"item":"Special events","count":3},{"item":"Breaking class","count":12}]}'::jsonb;
  v_sheet_sam := '{"grades":[{"subject":"Stretching","part":"physical","measured":5,"way":0},{"subject":"Sit-up (20 sec)","part":"physical","measured":18,"way":0},{"subject":"Push-up (1 min)","part":"physical","measured":30,"way":0},{"subject":"Static jump","part":"physical","measured":16,"way":0},{"subject":"Long jump","part":"physical","measured":75,"way":0},{"subject":"Sprint 4x10 m","part":"physical","measured":11.8,"way":0},{"subject":"Pull-up or hold","part":"physical","measured":5,"way":0},{"subject":"Sprint 100 m","part":"physical","measured":16.4,"way":0},{"subject":"1/2 or 1 mile","part":"physical","measured":10.5,"way":0},{"subject":"Referee seminar","part":"technical","letter":"B+"},{"subject":"Free sparring","part":"technical","letter":"B"},{"subject":"Target kick (30 sec)","part":"technical","measured":27,"way":0},{"subject":"Korean terminology","part":"technical","letter":"B+"},{"subject":"TKD knowledge","part":"technical","letter":"B"},{"subject":"White-Bodan Curriculum","part":"curriculum","letter":"B+"},{"subject":"Go-Ryo Poomsae","part":"curriculum","letter":"B"},{"subject":"Advance 10 Motion (1-5)","part":"curriculum","letter":"B+"},{"subject":"Advance Sa Bang Chuck (1-5)","part":"curriculum","letter":"B"},{"subject":"Step Sa Bang Chuck (1-5)","part":"curriculum","letter":"B"},{"subject":"Power Break","part":"curriculum","letter":"B+"},{"subject":"Technical Break","part":"curriculum","letter":"B"},{"subject":"Two Step Sparring (1-10)","part":"curriculum","letter":"B+"},{"subject":"Egg test","part":"other","letter":"B+"},{"subject":"Assistant instructor course","part":"other","letter":"B+"},{"subject":"Appreciation letter","part":"other","letter":"A-"},{"subject":"TKD project","part":"other","letter":"B+"}],"counts":[{"item":"Extra stripes","count":0},{"item":"Competitions","count":0},{"item":"Attendance (classes)","count":255},{"item":"Special events","count":2},{"item":"Breaking class","count":11}]}'::jsonb;
  v_sheet_noah := '{"grades":[{"subject":"Stretching","part":"physical","measured":7,"way":0},{"subject":"Sit-up (20 sec)","part":"physical","measured":22,"way":0},{"subject":"Push-up (1 min)","part":"physical","measured":44,"way":0},{"subject":"Static jump","part":"physical","measured":21,"way":0},{"subject":"Long jump","part":"physical","measured":90,"way":0},{"subject":"Sprint 4x10 m","part":"physical","measured":9.6,"way":0},{"subject":"Pull-up or hold","part":"physical","measured":9,"way":0},{"subject":"Sprint 100 m","part":"physical","measured":14.4,"way":0},{"subject":"1/2 or 1 mile","part":"physical","measured":8.0833,"way":0},{"subject":"Referee seminar","part":"technical","letter":"A"},{"subject":"Free sparring","part":"technical","letter":"A"},{"subject":"Target kick (30 sec)","part":"technical","measured":36,"way":0},{"subject":"Korean terminology","part":"technical","letter":"A-"},{"subject":"TKD knowledge","part":"technical","letter":"A"},{"subject":"White-Bodan Curriculum","part":"curriculum","letter":"A"},{"subject":"Go-Ryo Poomsae","part":"curriculum","letter":"A"},{"subject":"Advance 10 Motion (1-5)","part":"curriculum","letter":"A-"},{"subject":"Advance Sa Bang Chuck (1-5)","part":"curriculum","letter":"A"},{"subject":"Step Sa Bang Chuck (1-5)","part":"curriculum","letter":"A"},{"subject":"Power Break","part":"curriculum","letter":"A+"},{"subject":"Technical Break","part":"curriculum","letter":"A"},{"subject":"Two Step Sparring (1-10)","part":"curriculum","letter":"A"},{"subject":"Egg test","part":"other","letter":"A"},{"subject":"Meditation","part":"other","letter":"A-"},{"subject":"Assistant instructor course","part":"other","letter":"A"},{"subject":"Appreciation letter","part":"other","letter":"A"},{"subject":"TKD project","part":"other","letter":"A-"}],"counts":[{"item":"Extra stripes","count":3},{"item":"Competitions","count":2},{"item":"Attendance (classes)","count":280},{"item":"Special events","count":6},{"item":"Breaking class","count":18}]}'::jsonb;
  v_sheet_bao := '{"grades":[{"subject":"Stretching","part":"physical","measured":6,"way":0},{"subject":"Sit-up (20 sec)","part":"physical","measured":21,"way":0},{"subject":"Push-up (1 min)","part":"physical","measured":40,"way":0},{"subject":"Static jump","part":"physical","measured":19,"way":0},{"subject":"Long jump","part":"physical","measured":84,"way":0},{"subject":"Sprint 4x10 m","part":"physical","measured":10.4,"way":0},{"subject":"Pull-up or hold","part":"physical","measured":8,"way":0},{"subject":"Sprint 100 m","part":"physical","measured":15.2,"way":0},{"subject":"1/2 or 1 mile","part":"physical","measured":8.75,"way":0},{"subject":"Referee seminar","part":"technical","letter":"A"},{"subject":"Free sparring","part":"technical","letter":"A"},{"subject":"Target kick (30 sec)","part":"technical","measured":35,"way":0},{"subject":"Korean terminology","part":"technical","letter":"A"},{"subject":"TKD knowledge","part":"technical","letter":"A"},{"subject":"White-Bodan Curriculum","part":"curriculum","letter":"A"},{"subject":"Geum Gang Poomsae","part":"curriculum","letter":"A"},{"subject":"1st Dan Curriculum","part":"curriculum","letter":"A"},{"subject":"2nd Dan Sa Bang Chuck (1-4)","part":"curriculum","letter":"A-"},{"subject":"Creative Poomsae","part":"curriculum","letter":"A"},{"subject":"Creative Sa Bang Chuck","part":"curriculum","letter":"A-"},{"subject":"Technical Break","part":"curriculum","letter":"A"},{"subject":"Power Break","part":"curriculum","letter":"A"},{"subject":"Egg test","part":"other","letter":"A"},{"subject":"Meditation","part":"other","letter":"A"},{"subject":"Assistant instructor course","part":"other","letter":"A"},{"subject":"Appreciation letter","part":"other","letter":"A"},{"subject":"TKD project","part":"other","letter":"A"}],"counts":[{"item":"Extra stripes","count":2},{"item":"Outstanding performance","count":3},{"item":"Competitions","count":1},{"item":"Attendance (classes)","count":240},{"item":"Special events","count":4},{"item":"Breaking class","count":15}]}'::jsonb;
  v_sheet_leo := '{"grades":[{"subject":"Stretching","part":"physical","measured":6,"way":0},{"subject":"Sit-up (20 sec)","part":"physical","measured":20,"way":0},{"subject":"Push-up (1 min)","part":"physical","measured":40,"way":0},{"subject":"Static jump","part":"physical","measured":18,"way":0},{"subject":"Long jump","part":"physical","measured":80,"way":0},{"subject":"Sprint 4x10 m","part":"physical","measured":10.8,"way":0},{"subject":"Pull-up or hold","part":"physical","measured":32,"way":1},{"subject":"Sprint 100 m","part":"physical","measured":15.6,"way":0},{"subject":"1/2 or 1 mile","part":"physical","measured":8.9167,"way":0},{"subject":"Referee seminar","part":"technical","letter":"A"},{"subject":"Free sparring","part":"technical","letter":"A"},{"subject":"Target kick (30 sec)","part":"technical","measured":36,"way":0},{"subject":"Korean terminology","part":"technical","letter":"A"},{"subject":"TKD knowledge","part":"technical","letter":"A+"},{"subject":"Written test","part":"technical","letter":"A"},{"subject":"White-Bodan Curriculum","part":"curriculum","letter":"A"},{"subject":"Tae Baek Poomsae","part":"curriculum","letter":"A"},{"subject":"1st Dan Curriculum","part":"curriculum","letter":"A"},{"subject":"2nd Dan Curriculum","part":"curriculum","letter":"A"},{"subject":"3rd Dan Sa Bang Chuck (1-6)","part":"curriculum","letter":"A"},{"subject":"Creative Poomsae","part":"curriculum","letter":"A+"},{"subject":"Creative Sa Bang Chuck","part":"curriculum","letter":"A"},{"subject":"Technical Break","part":"curriculum","letter":"A"},{"subject":"Power Break","part":"curriculum","letter":"A"},{"subject":"Egg test","part":"other","letter":"A"},{"subject":"Meditation","part":"other","letter":"A"},{"subject":"Assistant instructor course","part":"other","letter":"A"},{"subject":"Appreciation letter","part":"other","letter":"A"},{"subject":"TKD project","part":"other","letter":"A"}],"counts":[{"item":"Extra stripes","count":4},{"item":"Outstanding performance","count":3},{"item":"Competitions","count":2},{"item":"Attendance (classes)","count":260},{"item":"Special events","count":6},{"item":"Breaking class","count":20}]}'::jsonb;

  -- -------------------------------------------------------------------
  -- Setup 2: the test cycles and candidates
  --   Spring  first day today - 30 (after the shift), Past
  --   Fall    first day today + 100;  Winter today + 170;  Summer today + 240
  --   Old     first day today - 1560 (more than 4 years ago)
  --   ND      no testing days at all (its candidate has no age)
  --   CD      days today - 7 (Physical), today (Technical), today + 7
  --           (Curriculum)
  --   Del     for Delete cycle; G8a / G8b / G8c fresh cycles for Q-G1
  --   Reg     the family form's speed (G18)
  --   Autumn  today + 300, its 1st Dan rubric WITHOUT "1/2 or 1 mile"; Later today + 400 (S1)
  -- Every cycle gets the original default rubric (as a hand fix).
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_list := array['Spring', 'Fall', 'Winter', 'Summer', 'Old', 'ND', 'CD', 'Del', 'G8a', 'G8b', 'G8c', 'Reg', 'Autumn', 'Later'];
  v_ok := '{}';
  foreach v_txt in array v_list loop
    v_r := public.bb_add_cycle(pg_temp.bbg_payload(v_tag || ' ' || v_txt,
                                                   v_today + case v_txt when 'Fall' then 100 when 'Winter' then 170
                                                                        when 'Summer' then 240 when 'Autumn' then 300
                                                                        when 'Later' then 400 else 30 end,
                                                   v_today + 20), null);
    if v_r ->> 'status' <> 'ok' then
      raise exception 'TEST SETUP: adding cycle % answered %', v_txt, v_r;
    end if;
    v_ok := v_ok || (v_r ->> 'id');
  end loop;
  v_sp := v_ok[1]::uuid; v_fa := v_ok[2]::uuid; v_wi := v_ok[3]::uuid; v_bad := array[v_ok[4]];
  v_old := v_ok[5]::uuid; v_nd := v_ok[6]::uuid; v_cd := v_ok[7]::uuid; v_del := v_ok[8]::uuid;
  v_none := array[v_ok[9], v_ok[10], v_ok[11], v_ok[12], v_ok[4]];   -- G8a, G8b, G8c, Reg, Summer
  v_reg := v_ok[12]::uuid;
  v_aut := v_ok[13]::uuid;
  v_lat := v_ok[14]::uuid;
  perform set_config('request.jwt.claims', '', true);
  update public.bb_cycles y set requirements = (select r.doc from pg_temp.bbg_rubric r)
   where y.id = any (array(select x::uuid from unnest(v_ok) as x));
  -- Autumn's 1st Dan has no "1/2 or 1 mile" (a hand fix before any grading)
  update public.bb_cycles y set requirements = y.requirements #- '{dans,0,parts,0,subjects,8}' where y.id = v_aut;

  v_sp_first := v_today - 30;
  v_fa_first := v_today + 100;
  v_old_first := v_today - 1560;

  -- the candidates (as the desk), every one before its cycle moves into
  -- the past
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_alex  := pg_temp.bbg_add(v_sp, 'Alex', 'Kimtest', pg_temp.bbg_dob(v_sp_first, 15), 'shrewsbury', 1, v_mail || '.alex@example.com');
  v_zoe   := pg_temp.bbg_add(v_sp, 'Zoe', 'Martintest', pg_temp.bbg_dob(v_sp_first, 16), 'shrewsbury', 1, v_mail || '.zoe@example.com');
  v_mia   := pg_temp.bbg_add(v_sp, 'Mia', 'Chentest', pg_temp.bbg_dob(v_sp_first, 32), 'worcester', 1, v_mail || '.mia@example.com');
  v_rina  := pg_temp.bbg_add(v_sp, 'Rina', 'Pateltest', pg_temp.bbg_dob(v_sp_first, 29), 'worcester', 1, v_mail || '.rina@example.com');
  v_lucas := pg_temp.bbg_add(v_sp, 'Lucas', 'Ferreiratest', pg_temp.bbg_dob(v_sp_first, 11), 'worcester', 1, v_mail || '.lucas@example.com');
  v_sam   := pg_temp.bbg_add(v_sp, 'Sam', 'Leetest', pg_temp.bbg_dob(v_sp_first, 43), 'worcester', 2, v_mail || '.sam@example.com');
  -- Teen: 17 on Fall's first day (16 on Spring's): a Make-up with a D, not complete yet
  v_teen  := pg_temp.bbg_add(v_sp, 'Teen', 'Testteen', pg_temp.bbg_dob(v_fa_first, 17), 'worcester', 1, v_mail || '.teen@example.com');
  v_wd    := pg_temp.bbg_add(v_sp, 'Wendy', 'Withdrawntest', pg_temp.bbg_dob(v_sp_first, 30), 'worcester', 1, v_mail || '.wd@example.com');
  -- Zed: Zoe's sheet, for the Dan change (G11)
  v_dup   := pg_temp.bbg_add(v_sp, 'Zed', 'Dantest', pg_temp.bbg_dob(v_sp_first, 16), 'worcester', 1, v_mail || '.zed@example.com');
  v_pay   := pg_temp.bbg_add(v_sp, 'Pat', 'Paytest', pg_temp.bbg_dob(v_sp_first, 30), 'worcester', 1, v_mail || '.pay@example.com');
  v_olga  := pg_temp.bbg_add(v_old, 'Olga', 'Oldtest', pg_temp.bbg_dob(v_old_first, 40), 'worcester', 1, v_mail || '.olga@example.com');
  v_mut   := pg_temp.bbg_add(v_old, 'Pia', 'Purgetest', pg_temp.bbg_dob(v_old_first, 40), 'worcester', 1, v_mail || '.pia@example.com');
  -- odd dates of birth for the purge (M1): born 1900-01-01, and born AFTER the first testing day
  v_bea   := pg_temp.bbg_add(v_old, 'Bea', 'Oldesttest', date '1900-01-01', 'worcester', 1, v_mail || '.bea@example.com');
  v_fay   := pg_temp.bbg_add(v_old, 'Fay', 'Laterdobtest', v_old_first + 400, 'worcester', 1, v_mail || '.fay@example.com');
  -- Dee: Rina's sheet (a D in the mile + below the mark), for the S1 chain
  v_dee   := pg_temp.bbg_add(v_sp, 'Dee', 'Droppedtest', pg_temp.bbg_dob(v_sp_first, 29), 'worcester', 1, v_mail || '.dee@example.com');
  v_nage  := pg_temp.bbg_add(v_nd, 'Nora', 'Noagetest', pg_temp.bbg_dob(v_today, 20), 'worcester', 1, v_mail || '.nora@example.com');
  v_cdk   := pg_temp.bbg_add(v_cd, 'Cody', 'Daytest', pg_temp.bbg_dob(v_today, 20), 'worcester', 1, v_mail || '.cody@example.com');
  v_dk    := pg_temp.bbg_add(v_del, 'Dora', 'Deltest', pg_temp.bbg_dob(v_today, 20), 'worcester', 1, v_mail || '.dora@example.com');
  v_mu3   := pg_temp.bbg_add(v_del, 'Chad', 'Chosentest', pg_temp.bbg_dob(v_today, 20), 'worcester', 1, v_mail || '.chad@example.com');
  -- a payment for Pat (G1: a staff Dan change then needs an admin)
  v_r := public.bb_record_payment(v_pay, (select version from public.bb_candidates where id = v_pay), 1000, 'cash', array['p1'], null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: payment for Pat answered %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_withdraw_candidate(v_wd, (select version from public.bb_candidates where id = v_wd));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: withdraw answered %', v_r; end if;

  -- into the past (as the SQL Editor's role); ND loses its days
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.bbg_shift(v_sp, -60);
  perform pg_temp.bbg_shift(v_old, -1590);
  perform pg_temp.bbg_shift(v_cd, -37);
  delete from public.bb_cycle_days where cycle_id = v_nd;
  if (select min(day_date) from public.bb_cycle_days where cycle_id = v_sp) <> v_sp_first
     or (select min(day_date) from public.bb_cycle_days where cycle_id = v_old) <> v_old_first then
    raise exception 'TEST SETUP: the moved first days are not as planned';
  end if;

  -- the subject ids (the copies are the default rubric: the same ids)
  v_s_fs      := pg_temp.bbg_sid(v_sp, 1, 'Free sparring');
  v_s_ref     := pg_temp.bbg_sid(v_sp, 1, 'Referee seminar');
  v_s_kor     := pg_temp.bbg_sid(v_sp, 1, 'Korean terminology');
  v_s_tkd     := pg_temp.bbg_sid(v_sp, 1, 'TKD knowledge');
  v_s_one     := pg_temp.bbg_sid(v_sp, 1, 'One Step Sparring (1-24)');
  v_s_basic   := pg_temp.bbg_sid(v_sp, 1, 'Basic 10 Motions (1-7)');
  v_s_power   := pg_temp.bbg_sid(v_sp, 1, 'Power Break');
  v_s_stretch := pg_temp.bbg_sid(v_sp, 1, 'Stretching');
  v_s_pull    := pg_temp.bbg_sid(v_sp, 1, 'Pull-up or hold');
  v_s_mile    := pg_temp.bbg_sid(v_sp, 1, '1/2 or 1 mile');
  v_s_sprint  := pg_temp.bbg_sid(v_sp, 1, 'Sprint 100 m');
  v_s_egg     := pg_temp.bbg_sid(v_sp, 1, 'Egg test');
  v_s_med     := pg_temp.bbg_sid(v_sp, 1, 'Meditation');
  v_s_proj    := pg_temp.bbg_sid(v_sp, 1, 'TKD project');
  v_s2_fs     := pg_temp.bbg_sid(v_sp, 2, 'Free sparring');
  if v_s_fs is null or v_s_one is null or v_s2_fs is null then
    raise exception 'TEST SETUP: subject ids not found in the copy';
  end if;

  -- the cast's sheets, entered through the grading functions (as the desk)
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.bbg_sheet(v_alex, v_sheet_alex);
  perform pg_temp.bbg_sheet(v_zoe, v_sheet_zoe);
  perform pg_temp.bbg_sheet(v_mia, v_sheet_mia);
  perform pg_temp.bbg_sheet(v_rina, v_sheet_rina);
  perform pg_temp.bbg_sheet(v_dee, v_sheet_rina);
  perform pg_temp.bbg_sheet(v_lucas, v_sheet_lucas);
  perform pg_temp.bbg_sheet(v_sam, v_sheet_sam);
  perform pg_temp.bbg_sheet(v_dup, v_sheet_zoe);
  perform pg_temp.bbg_sheet(v_olga, v_sheet_mia);
  -- Teen: Alex's sheet, Free sparring D, TKD project not handed in yet
  perform pg_temp.bbg_sheet(v_teen, jsonb_build_object(
    'grades', (select jsonb_agg(case when g.e ->> 'subject' = 'Free sparring' then g.e || '{"letter": "D"}' else g.e end)
                 from jsonb_array_elements(v_sheet_alex -> 'grades') as g(e) where g.e ->> 'subject' <> 'TKD project'),
    'counts', v_sheet_alex -> 'counts'));
  -- Cody (CD): one Physical number, one Technical and one Curriculum grade
  perform pg_temp.bbg_sheet(v_cdk, '{"grades": [{"subject": "Stretching", "measured": 6, "way": 0},
                                                {"subject": "Referee seminar", "letter": "A"},
                                                {"subject": "Basic 10 Motions (1-7)", "letter": "A"}]}'::jsonb);
  -- Dora (Del): one count only
  perform pg_temp.bbg_sheet(v_dk, '{"grades": [], "counts": [{"item": "Extra stripes", "count": 2}]}'::jsonb);
  -- Chad (Del): only a chosen subject, written by hand (it can't be made
  -- through the app without grades) - for G10
  perform set_config('request.jwt.claims', '', true);
  insert into public.bb_makeup_subjects (candidate_id, dan, subject_id, kind, created_by_name, updated_by_name)
  values (v_mu3, 1, v_s_kor, 'chosen', '', '');


  -- ===================================================================
  -- G6. The result
  -- ===================================================================
  -- G6a. every case of 0025_grading_cases.json, inline (generated)
  -- (generated) every result case of supabase/tests/0025_grading_cases.json, names resolved to ids
  perform pg_temp.bbg_case('cast: Alex Kim (1st Dan, 13–17) 305.75 Passed', 1, '[]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":305.75,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":65.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||305.75|"}'::jsonb);
  perform pg_temp.bbg_case('cast: Zoe Martin (1st Dan, 13–17) 263 Make-up · below 275', 1, '[]'::jsonb, 16, '[{"subject_id":"ec806b43","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":32,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":18,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":80,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":11.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":11.5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":31,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"C","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"B-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"C-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":0,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":322,"kept":false},{"item_name":"Special events","count":1,"kept":false},{"item_name":"Breaking class","count":8,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"makeup","reasons":["below"],"complete":true,"total":263,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":58.5,"technical":30.5,"curriculum":105.5,"other":65.5},"extra_total":3,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":true,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"makeup|below|263|"}'::jsonb);
  perform pg_temp.bbg_case('cast: Mia Chen (1st Dan, 18 and over) 324.5 Make-up · D in Free sparring', 1, '[]'::jsonb, 32, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":22,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":45,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":88,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":9.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":35,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":14.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.25,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":37,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Outstanding performance","count":5,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":290,"kept":false},{"item_name":"Special events","count":6,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"makeup","reasons":["d"],"complete":true,"total":324.5,"maximum":361.5,"pass_mark":293,"pass_bracket":{"from":18,"to":null},"age_group":{"from":18,"to":null},"parts":{"physical":71,"technical":27,"curriculum":141.5,"other":70},"extra_total":15,"d_subjects":["f2630888"],"needs":["f2630888"],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":26,"graded":26,"left":0},"result_key_input":"makeup|d|324.5|f2630888"}'::jsonb);
  perform pg_temp.bbg_case('cast: Lucas Ferreira (1st Dan, 10–12) 275.5 Not finished · TKD project late (due May 29)', 1, '[]'::jsonb, 11, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":17,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":27,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":14,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":70,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":11.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":18.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":5.7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":30,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":1,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":10,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":275.5,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":10,"to":12},"parts":{"physical":60,"technical":35.5,"curriculum":115.5,"other":52.5},"extra_total":12,"d_subjects":[],"needs":[],"late":["2ab87e21"],"missing":["2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":24,"left":1},"result_key_input":"not_finished||275.5|"}'::jsonb);
  perform pg_temp.bbg_case('cast: Rina Patel (1st Dan, 18 and over) 252.5 Make-up · D in 1/2 or 1 mile', 1, '[]'::jsonb, 29, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":18,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":31,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":16,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":79,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":11.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":12.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":28,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Attendance (classes)","count":344,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"makeup","reasons":["d","below"],"complete":true,"total":252.5,"maximum":361.5,"pass_mark":293,"pass_bracket":{"from":18,"to":null},"age_group":{"from":18,"to":null},"parts":{"physical":49,"technical":29.5,"curriculum":121,"other":50},"extra_total":3,"d_subjects":["5accced1"],"needs":["5accced1"],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":26,"graded":26,"left":0},"result_key_input":"makeup|d,below|252.5|5accced1"}'::jsonb);
  perform pg_temp.bbg_case('cast: Ava Brooks (2nd Dan, 13 and over) 300.95 Passed', 2, '[]'::jsonb, 35, '[{"subject_id":"88782efd","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3458194b","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bda05912","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2939df4","letter":null,"measured":18,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"9f0f771f","letter":null,"measured":80,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"56ce109b","letter":null,"measured":10.5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"30a73415","letter":null,"measured":27,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bc785353","letter":null,"measured":15.5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"c10c07d9","letter":null,"measured":8.8333,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"46d29c95","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6006bb0f","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7cd90c2d","letter":null,"measured":30,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bb9316b8","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"098df542","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"4300c41c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bd9c37a4","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7401f449","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8ca94570","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b5092201","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"4691d5eb","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"de91a496","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"1ad78dc6","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"65e21d80","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"9bbecfd5","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"982839cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"592d0502","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ca36bfac","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":1,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":260,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":12,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":300.95,"maximum":343.5,"pass_mark":261,"pass_bracket":{"from":null,"to":null},"age_group":{"from":13,"to":null},"parts":{"physical":63.5,"technical":36.75,"curriculum":120.7,"other":70},"extra_total":10,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":27,"graded":27,"left":0},"result_key_input":"passed||300.95|"}'::jsonb);
  perform pg_temp.bbg_case('cast: Sam Lee (2nd Dan, 13 and over) 243.6 Not finished · Meditation late (due May 29)', 2, '[]'::jsonb, 43, '[{"subject_id":"88782efd","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3458194b","letter":null,"measured":18,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bda05912","letter":null,"measured":30,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2939df4","letter":null,"measured":16,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"9f0f771f","letter":null,"measured":75,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"56ce109b","letter":null,"measured":11.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"30a73415","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bc785353","letter":null,"measured":16.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"c10c07d9","letter":null,"measured":10.5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"46d29c95","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6006bb0f","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7cd90c2d","letter":null,"measured":27,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bb9316b8","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"098df542","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"4300c41c","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bd9c37a4","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7401f449","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8ca94570","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b5092201","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"4691d5eb","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"de91a496","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"1ad78dc6","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"65e21d80","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"982839cc","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"592d0502","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ca36bfac","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":0,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":255,"kept":false},{"item_name":"Special events","count":2,"kept":false},{"item_name":"Breaking class","count":11,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":243.6,"maximum":343.5,"pass_mark":261,"pass_bracket":{"from":null,"to":null},"age_group":{"from":13,"to":null},"parts":{"physical":53.5,"technical":29.5,"curriculum":106.1,"other":48.5},"extra_total":6,"d_subjects":[],"needs":[],"late":["9bbecfd5"],"missing":["9bbecfd5"],"choice_needed":false,"counts":{"applying":27,"graded":26,"left":1},"result_key_input":"not_finished||243.6|"}'::jsonb);
  perform pg_temp.bbg_case('cast: Noah Silva (2nd Dan, 13 and over) 323.9 Passed', 2, '[]'::jsonb, 27, '[{"subject_id":"88782efd","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3458194b","letter":null,"measured":22,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bda05912","letter":null,"measured":44,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2939df4","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"9f0f771f","letter":null,"measured":90,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"56ce109b","letter":null,"measured":9.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"30a73415","letter":null,"measured":9,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bc785353","letter":null,"measured":14.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"c10c07d9","letter":null,"measured":8.0833,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"46d29c95","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6006bb0f","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7cd90c2d","letter":null,"measured":36,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bb9316b8","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"098df542","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"4300c41c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bd9c37a4","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7401f449","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8ca94570","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b5092201","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"4691d5eb","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"de91a496","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"1ad78dc6","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"65e21d80","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"9bbecfd5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"982839cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"592d0502","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ca36bfac","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":3,"kept":false},{"item_name":"Competitions","count":2,"kept":false},{"item_name":"Attendance (classes)","count":280,"kept":false},{"item_name":"Special events","count":6,"kept":false},{"item_name":"Breaking class","count":18,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":323.9,"maximum":343.5,"pass_mark":261,"pass_bracket":{"from":null,"to":null},"age_group":{"from":13,"to":null},"parts":{"physical":70,"technical":38,"curriculum":124.9,"other":68},"extra_total":23,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":27,"graded":27,"left":0},"result_key_input":"passed||323.9|"}'::jsonb);
  perform pg_temp.bbg_case('cast: Bao Nguyen (3rd Dan, 13 and over) 353.8 Passed', 3, '[]'::jsonb, 38, '[{"subject_id":"ecf8b62f","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"4de30043","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"be9e7846","letter":null,"measured":40,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"772e00b6","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"eab1bc07","letter":null,"measured":84,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"1b3993c3","letter":null,"measured":10.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"15dc15b2","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"9b173050","letter":null,"measured":15.2,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b56dd03e","letter":null,"measured":8.75,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"46d080a6","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"20711eb2","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d94bb071","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d2b4bb0d","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"04eadac1","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2f50f893","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"c238815a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"e9c6dfbf","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"9079236f","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"866afbdb","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"c3aa25e1","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3b5f6219","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d34904e4","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fd8d3b51","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"af8ce847","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"c6301785","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"de448912","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8550fa6d","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Outstanding performance","count":3,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":240,"kept":false},{"item_name":"Special events","count":4,"kept":false},{"item_name":"Breaking class","count":15,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":353.8,"maximum":384,"pass_mark":293,"pass_bracket":{"from":null,"to":null},"age_group":{"from":13,"to":null},"parts":{"physical":65.5,"technical":38.5,"curriculum":158.8,"other":70},"extra_total":21,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":27,"graded":27,"left":0},"result_key_input":"passed||353.8|"}'::jsonb);
  perform pg_temp.bbg_case('cast: Leo Garcia (4th Dan, 13 and over) 557.5 Passed', 4, '[]'::jsonb, 50, '[{"subject_id":"dad0838d","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"385b03f8","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"02d4e8c2","letter":null,"measured":40,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b0574466","letter":null,"measured":18,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"091d987a","letter":null,"measured":80,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"429987ca","letter":null,"measured":10.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"c456d1fc","letter":null,"measured":32,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fac2fc81","letter":null,"measured":15.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5f186262","letter":null,"measured":8.9167,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ff410974","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ed7137f5","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"08bf6910","letter":null,"measured":36,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f7656496","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fc23ec3c","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2e77f7d2","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"969ddf81","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"e78a74df","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"58165970","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"bb52202a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"cf2085ae","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b5428a7b","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7f13b763","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2fc03cd2","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"48868ae5","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dd6acc66","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"e74fd0a5","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b1022de","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5f554fb5","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2d1208c8","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":4,"kept":false},{"item_name":"Outstanding performance","count":3,"kept":false},{"item_name":"Competitions","count":2,"kept":false},{"item_name":"Attendance (classes)","count":260,"kept":false},{"item_name":"Special events","count":6,"kept":false},{"item_name":"Breaking class","count":20,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":557.5,"maximum":595,"pass_mark":453,"pass_bracket":{"from":null,"to":null},"age_group":{"from":13,"to":null},"parts":{"physical":65.5,"technical":128,"curriculum":218,"other":112},"extra_total":34,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":29,"graded":29,"left":0},"result_key_input":"passed||557.5|"}'::jsonb);
  perform pg_temp.bbg_case('cast: Zoe Martin after an admin chose her subjects (order scrambled, One Step Sparring not for her age) - needs in rubric order', 1, '[]'::jsonb, 16, '[{"subject_id":"ec806b43","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":32,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":18,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":80,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":11.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":11.5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":31,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"C","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"B-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"C-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":0,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":322,"kept":false},{"item_name":"Special events","count":1,"kept":false},{"item_name":"Breaking class","count":8,"kept":false}]'::jsonb,
    '{}'::text[], array['dc32f7c3', '5accced1', 'fe78294a', '24280b75', '8620a413']::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"makeup","reasons":["below"],"complete":true,"total":263,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":58.5,"technical":30.5,"curriculum":105.5,"other":65.5},"extra_total":3,"d_subjects":[],"needs":["5accced1","24280b75","8620a413","dc32f7c3"],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"makeup|below|263|5accced1,24280b75,8620a413,dc32f7c3"}'::jsonb);
  perform pg_temp.bbg_case('Mia Chen on Fall 2027 as a make-up: kept grades and counts, retest Free sparring not graded yet - 324.5 so far', 1, '[]'::jsonb, 32, '[{"subject_id":"ec806b43","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"38b5cd9f","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"b7e19759","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"435f76cf","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5e91e6a9","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"b53843bc","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"ef1254f8","letter":"A+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"3dd99b9f","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5accced1","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"ab9209e1","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"dc32f7c3","letter":"A+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5896c437","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":true},{"item_name":"Outstanding performance","count":5,"kept":true},{"item_name":"Competitions","count":0,"kept":true},{"item_name":"Attendance (classes)","count":290,"kept":true},{"item_name":"Special events","count":6,"kept":true},{"item_name":"Breaking class","count":16,"kept":true}]'::jsonb,
    array['f2630888']::text[], '{}'::text[], '2027-10-28'::date, '2027-11-13'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":324.5,"maximum":361.5,"pass_mark":293,"pass_bracket":{"from":18,"to":null},"age_group":{"from":18,"to":null},"parts":{"physical":71,"technical":27,"curriculum":141.5,"other":70},"extra_total":15,"d_subjects":[],"needs":[],"late":[],"missing":["f2630888"],"choice_needed":false,"counts":{"applying":26,"graded":25,"left":1},"result_key_input":"not_finished||324.5|"}'::jsonb);
  perform pg_temp.bbg_case('Mia Chen on Fall 2027 as a make-up: Free sparring B+ - 333.5 Passed', 1, '[]'::jsonb, 32, '[{"subject_id":"ec806b43","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"38b5cd9f","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"b7e19759","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"435f76cf","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5e91e6a9","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"b53843bc","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"ef1254f8","letter":"A+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"3dd99b9f","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5accced1","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"ab9209e1","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"dc32f7c3","letter":"A+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5896c437","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"f2630888","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":true},{"item_name":"Outstanding performance","count":5,"kept":true},{"item_name":"Competitions","count":0,"kept":true},{"item_name":"Attendance (classes)","count":290,"kept":true},{"item_name":"Special events","count":6,"kept":true},{"item_name":"Breaking class","count":16,"kept":true}]'::jsonb,
    array['f2630888']::text[], '{}'::text[], '2027-11-20'::date, '2027-11-13'::date, '{"status":"passed","reasons":[],"complete":true,"total":333.5,"maximum":361.5,"pass_mark":293,"pass_bracket":{"from":18,"to":null},"age_group":{"from":18,"to":null},"parts":{"physical":71,"technical":36,"curriculum":141.5,"other":70},"extra_total":15,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":26,"graded":26,"left":0},"result_key_input":"passed||333.5|"}'::jsonb);
  perform pg_temp.bbg_case('boundary: Hold exactly 31 sec (at_least) is A+', 1, '[]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":31,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":306.75,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":66.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||306.75|"}'::jsonb);
  perform pg_temp.bbg_case('boundary: 1 mile exactly 8:30 = 8.5 min (at_most, 13 and over) is A', 1, '[]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":307.25,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":67,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||307.25|"}'::jsonb);
  perform pg_temp.bbg_case('boundary: Sprint 100 m exactly 19 sec for 9-12 (under 19 for B+) is B, not B+', 1, '[]'::jsonb, 11, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":17,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":27,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":14,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":70,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":11.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":5.7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":30,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":1,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":10,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":274.5,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":10,"to":12},"parts":{"physical":59,"technical":35.5,"curriculum":115.5,"other":52.5},"extra_total":12,"d_subjects":[],"needs":[],"late":["2ab87e21"],"missing":["2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":24,"left":1},"result_key_input":"not_finished||274.5|"}'::jsonb);
  perform pg_temp.bbg_case('boundary: 8:13 = 8.2167 min against a made-up A cut-off of 8.22 (at_most) is met: A', 1, '[{"op":"set","path":["parts",0,"subjects",8,"ways",0,"brackets",2,"cutoffs","A"],"value":8.22}]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.2167,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":307.25,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":67,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||307.25|"}'::jsonb);
  perform pg_temp.bbg_case('boundary: 8:13 = 8.2167 min against a made-up A cut-off of 8.21 is not met: B+', 1, '[{"op":"set","path":["parts",0,"subjects",8,"ways",0,"brackets",2,"cutoffs","A"],"value":8.21}]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.2167,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":305.75,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":65.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||305.75|"}'::jsonb);
  perform pg_temp.bbg_case('both ways: Pull-up or hold, 8 as Pull-up reps (way 0) is A', 1, '[]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":305.75,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":65.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||305.75|"}'::jsonb);
  perform pg_temp.bbg_case('both ways: Pull-up or hold, 8 as Hold seconds (way 1) is D - a make-up with the total still above the mark', 1, '[]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"makeup","reasons":["d"],"complete":true,"total":298.75,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":58.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":["ef1254f8"],"needs":["ef1254f8"],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"makeup|d|298.75|ef1254f8"}'::jsonb);
  perform pg_temp.bbg_case('One Step Sparring for 13-17 does not apply: a stored letter keeps no points', 1, '[]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":305.75,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":65.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||305.75|"}'::jsonb);
  perform pg_temp.bbg_case('One Step Sparring for 18 and over applies: same sheet at 18 with One Step A', 1, '[]'::jsonb, 18, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":325.75,"maximum":361.5,"pass_mark":293,"pass_bracket":{"from":18,"to":null},"age_group":{"from":18,"to":null},"parts":{"physical":65.5,"technical":37.25,"curriculum":138,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":26,"graded":26,"left":0},"result_key_input":"passed||325.75|"}'::jsonb);
  perform pg_temp.bbg_case('One Step Sparring for 18 and over applies: same sheet at 18 without it is not finished', 1, '[]'::jsonb, 18, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":305.75,"maximum":361.5,"pass_mark":293,"pass_bracket":{"from":18,"to":null},"age_group":{"from":18,"to":null},"parts":{"physical":65.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":["fe78294a"],"choice_needed":false,"counts":{"applying":26,"graded":25,"left":1},"result_key_input":"not_finished||305.75|"}'::jsonb);
  perform pg_temp.bbg_case('age group edge: 1st Dan at 8 (Stretching 5 in, Target kick 33)', 1, '[]'::jsonb, 8, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":33,"way":0,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-04-03'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":19,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":null,"to":8},"parts":{"physical":12,"technical":7,"curriculum":0,"other":0},"extra_total":0,"d_subjects":[],"needs":[],"late":[],"missing":["38b5cd9f","b7e19759","435f76cf","5e91e6a9","b53843bc","ef1254f8","3dd99b9f","5accced1","88de8004","f2630888","24280b75","8620a413","d5bf66fd","522a5a06","d16684a5","7dd13946","dc32f7c3","31683485","574ce43c","5896c437","7b07c0cc","6f5c13b7","2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":2,"left":23},"result_key_input":"not_finished||19|"}'::jsonb);
  perform pg_temp.bbg_case('age group edge: 1st Dan at 9 (Stretching 5 in, Target kick 33)', 1, '[]'::jsonb, 9, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":33,"way":0,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-04-03'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":17.5,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":9,"to":9},"parts":{"physical":10.5,"technical":7,"curriculum":0,"other":0},"extra_total":0,"d_subjects":[],"needs":[],"late":[],"missing":["38b5cd9f","b7e19759","435f76cf","5e91e6a9","b53843bc","ef1254f8","3dd99b9f","5accced1","88de8004","f2630888","24280b75","8620a413","d5bf66fd","522a5a06","d16684a5","7dd13946","dc32f7c3","31683485","574ce43c","5896c437","7b07c0cc","6f5c13b7","2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":2,"left":23},"result_key_input":"not_finished||17.5|"}'::jsonb);
  perform pg_temp.bbg_case('age group edge: 1st Dan at 10 (Stretching 5 in, Target kick 33)', 1, '[]'::jsonb, 10, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":33,"way":0,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-04-03'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":16.5,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":10,"to":12},"parts":{"physical":10.5,"technical":6,"curriculum":0,"other":0},"extra_total":0,"d_subjects":[],"needs":[],"late":[],"missing":["38b5cd9f","b7e19759","435f76cf","5e91e6a9","b53843bc","ef1254f8","3dd99b9f","5accced1","88de8004","f2630888","24280b75","8620a413","d5bf66fd","522a5a06","d16684a5","7dd13946","dc32f7c3","31683485","574ce43c","5896c437","7b07c0cc","6f5c13b7","2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":2,"left":23},"result_key_input":"not_finished||16.5|"}'::jsonb);
  perform pg_temp.bbg_case('age group edge: 1st Dan at 12 (Stretching 5 in, Target kick 33)', 1, '[]'::jsonb, 12, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":33,"way":0,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-04-03'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":16.5,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":10,"to":12},"parts":{"physical":10.5,"technical":6,"curriculum":0,"other":0},"extra_total":0,"d_subjects":[],"needs":[],"late":[],"missing":["38b5cd9f","b7e19759","435f76cf","5e91e6a9","b53843bc","ef1254f8","3dd99b9f","5accced1","88de8004","f2630888","24280b75","8620a413","d5bf66fd","522a5a06","d16684a5","7dd13946","dc32f7c3","31683485","574ce43c","5896c437","7b07c0cc","6f5c13b7","2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":2,"left":23},"result_key_input":"not_finished||16.5|"}'::jsonb);
  perform pg_temp.bbg_case('age group edge: 1st Dan at 13 (Stretching 5 in, Target kick 33)', 1, '[]'::jsonb, 13, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":33,"way":0,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-04-03'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":15,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":9,"technical":6,"curriculum":0,"other":0},"extra_total":0,"d_subjects":[],"needs":[],"late":[],"missing":["38b5cd9f","b7e19759","435f76cf","5e91e6a9","b53843bc","ef1254f8","3dd99b9f","5accced1","88de8004","f2630888","24280b75","8620a413","d5bf66fd","522a5a06","d16684a5","7dd13946","dc32f7c3","31683485","574ce43c","5896c437","7b07c0cc","6f5c13b7","2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":2,"left":23},"result_key_input":"not_finished||15|"}'::jsonb);
  perform pg_temp.bbg_case('age group edge: 1st Dan at 17 (Stretching 5 in, Target kick 33)', 1, '[]'::jsonb, 17, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":33,"way":0,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-04-03'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":15,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":9,"technical":6,"curriculum":0,"other":0},"extra_total":0,"d_subjects":[],"needs":[],"late":[],"missing":["38b5cd9f","b7e19759","435f76cf","5e91e6a9","b53843bc","ef1254f8","3dd99b9f","5accced1","88de8004","f2630888","24280b75","8620a413","d5bf66fd","522a5a06","d16684a5","7dd13946","dc32f7c3","31683485","574ce43c","5896c437","7b07c0cc","6f5c13b7","2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":2,"left":23},"result_key_input":"not_finished||15|"}'::jsonb);
  perform pg_temp.bbg_case('age group edge: 1st Dan at 18 (Stretching 5 in, Target kick 33)', 1, '[]'::jsonb, 18, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":33,"way":0,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-04-03'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":15,"maximum":361.5,"pass_mark":293,"pass_bracket":{"from":18,"to":null},"age_group":{"from":18,"to":null},"parts":{"physical":9,"technical":6,"curriculum":0,"other":0},"extra_total":0,"d_subjects":[],"needs":[],"late":[],"missing":["38b5cd9f","b7e19759","435f76cf","5e91e6a9","b53843bc","ef1254f8","3dd99b9f","5accced1","88de8004","f2630888","24280b75","8620a413","d5bf66fd","522a5a06","d16684a5","fe78294a","7dd13946","dc32f7c3","31683485","574ce43c","5896c437","7b07c0cc","6f5c13b7","2ab87e21"],"choice_needed":false,"counts":{"applying":26,"graded":2,"left":24},"result_key_input":"not_finished||15|"}'::jsonb);
  perform pg_temp.bbg_case('2nd Dan age groups: one pass bracket for every age, a 9-year-old (Target kick 9 and under)', 2, '[]'::jsonb, 9, '[{"subject_id":"7cd90c2d","letter":null,"measured":33,"way":0,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-04-03'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":7,"maximum":343.5,"pass_mark":261,"pass_bracket":{"from":null,"to":null},"age_group":{"from":9,"to":9},"parts":{"physical":0,"technical":7,"curriculum":0,"other":0},"extra_total":0,"d_subjects":[],"needs":[],"late":[],"missing":["88782efd","3458194b","bda05912","f2939df4","9f0f771f","56ce109b","30a73415","bc785353","c10c07d9","46d29c95","6006bb0f","bb9316b8","098df542","4300c41c","bd9c37a4","7401f449","8ca94570","b5092201","4691d5eb","de91a496","1ad78dc6","65e21d80","9bbecfd5","982839cc","592d0502","ca36bfac"],"choice_needed":false,"counts":{"applying":27,"graded":1,"left":26},"result_key_input":"not_finished||7|"}'::jsonb);
  perform pg_temp.bbg_case('no age on file: no_age, nothing worked out', 1, '[]'::jsonb, null, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"no_age","reasons":[],"complete":false,"total":null,"maximum":null,"pass_mark":null,"pass_bracket":null,"age_group":null,"parts":{},"extra_total":null,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":null,"result_key_input":"no_age|||"}'::jsonb);
  perform pg_temp.bbg_case('no_d false: a D just gives its 0 points and the candidate can pass', 1, '[{"op":"set","path":["pass","no_d"],"value":false}]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":298.75,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":58.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":["ef1254f8"],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||298.75|"}'::jsonb);
  perform pg_temp.bbg_case('extra points limit 10: 16 extra points count as 10', 1, '[{"op":"set","path":["extra_points","limit"],"value":10}]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":299.75,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":65.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":10,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||299.75|"}'::jsonb);
  perform pg_temp.bbg_case('extra points not counted toward the total (counts_toward_total false)', 1, '[{"op":"set","path":["extra_points","counts_toward_total"],"value":false}]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":289.75,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":65.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||289.75|"}'::jsonb);
  perform pg_temp.bbg_case('extra points: a count below the first step gives 0, a count exactly on a step gives that step, unknown item ignored', 1, '[]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":375,"kept":false},{"item_name":"Breaking class","count":15,"kept":false},{"item_name":"Special events","count":10,"kept":false},{"item_name":"Extra stripes","count":7,"kept":false},{"item_name":"Old item no longer in the rubric","count":5,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"passed","reasons":[],"complete":true,"total":311.75,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":65.5,"technical":37.25,"curriculum":118,"other":69},"extra_total":22,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":false,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"passed||311.75|"}'::jsonb);
  perform pg_temp.bbg_case('D while incomplete: make-up for the D only (no "below" while subjects are left, even below the mark so far)', 1, '[]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-05-01'::date, '2027-05-29'::date, '{"status":"makeup","reasons":["d"],"complete":false,"total":257.5,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":65.5,"technical":27.5,"curriculum":118,"other":30.5},"extra_total":16,"d_subjects":["f2630888"],"needs":["f2630888"],"late":[],"missing":["574ce43c","6f5c13b7","2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":22,"left":3},"result_key_input":"makeup|d|257.5|f2630888"}'::jsonb);
  perform pg_temp.bbg_case('the same sheet without the D is just not finished', 1, '[]'::jsonb, 15, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-05-01'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":267.25,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":65.5,"technical":37.25,"curriculum":118,"other":30.5},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":["574ce43c","6f5c13b7","2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":22,"left":3},"result_key_input":"not_finished||267.25|"}'::jsonb);
  perform pg_temp.bbg_case('Late vs D vs left: the D wins; TKD project is late, Referee seminar is just left', 1, '[]'::jsonb, 11, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":17,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":27,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":14,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":70,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":11.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":18.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":5.7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":30,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":1,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":10,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"makeup","reasons":["d"],"complete":false,"total":259.5,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":10,"to":12},"parts":{"physical":60,"technical":19.5,"curriculum":115.5,"other":52.5},"extra_total":12,"d_subjects":["f2630888"],"needs":["f2630888"],"late":["2ab87e21"],"missing":["88de8004","2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":23,"left":2},"result_key_input":"makeup|d|259.5|f2630888"}'::jsonb);
  perform pg_temp.bbg_case('Late only after the due day: Lucas on the due day itself is not late yet', 1, '[]'::jsonb, 11, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":17,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":27,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":14,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":70,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":11.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":18.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":5.7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":30,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":1,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":10,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-05-29'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":275.5,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":10,"to":12},"parts":{"physical":60,"technical":35.5,"curriculum":115.5,"other":52.5},"extra_total":12,"d_subjects":[],"needs":[],"late":[],"missing":["2ab87e21"],"choice_needed":false,"counts":{"applying":25,"graded":24,"left":1},"result_key_input":"not_finished||275.5|"}'::jsonb);
  perform pg_temp.bbg_case('a make-up at 17: One Step Sparring does not apply, only the retest is gradable', 1, '[]'::jsonb, 17, '[{"subject_id":"ec806b43","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"38b5cd9f","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"b7e19759","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"435f76cf","letter":"B+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5e91e6a9","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"b53843bc","letter":"B+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"ef1254f8","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"3dd99b9f","letter":"B+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5accced1","letter":"B+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"ab9209e1","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":true},{"item_name":"Competitions","count":1,"kept":true},{"item_name":"Attendance (classes)","count":380,"kept":true},{"item_name":"Special events","count":3,"kept":true},{"item_name":"Breaking class","count":16,"kept":true}]'::jsonb,
    array['f2630888']::text[], '{}'::text[], '2027-10-28'::date, '2027-11-13'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":296,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":65.5,"technical":27.5,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":["f2630888"],"choice_needed":false,"counts":{"applying":25,"graded":24,"left":1},"result_key_input":"not_finished||296|"}'::jsonb);
  perform pg_temp.bbg_case('the same make-up after a DOB fix into 18 and over: One Step Sparring applies and is gradable', 1, '[]'::jsonb, 18, '[{"subject_id":"ec806b43","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"38b5cd9f","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"b7e19759","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"435f76cf","letter":"B+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5e91e6a9","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"b53843bc","letter":"B+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"ef1254f8","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"3dd99b9f","letter":"B+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5accced1","letter":"B+","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"ab9209e1","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":true},{"item_name":"Competitions","count":1,"kept":true},{"item_name":"Attendance (classes)","count":380,"kept":true},{"item_name":"Special events","count":3,"kept":true},{"item_name":"Breaking class","count":16,"kept":true}]'::jsonb,
    array['f2630888']::text[], '{}'::text[], '2027-10-28'::date, '2027-11-13'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":296,"maximum":361.5,"pass_mark":293,"pass_bracket":{"from":18,"to":null},"age_group":{"from":18,"to":null},"parts":{"physical":65.5,"technical":27.5,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":["f2630888","fe78294a"],"choice_needed":false,"counts":{"applying":26,"graded":24,"left":2},"result_key_input":"not_finished||296|"}'::jsonb);
  perform pg_temp.bbg_case('result key: a total of 263.00 (a point written as 20.00) gives the same key as 263', 1, '[{"op":"set","path":["parts",2,"subjects",0,"points","A"],"value_json":"20.00"}]'::jsonb, 16, '[{"subject_id":"ec806b43","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":32,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":18,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":80,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":11.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":11.5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":31,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"C","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"B-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"C-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":0,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":322,"kept":false},{"item_name":"Special events","count":1,"kept":false},{"item_name":"Breaking class","count":8,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"makeup","reasons":["below"],"complete":true,"total":263,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":58.5,"technical":30.5,"curriculum":105.5,"other":65.5},"extra_total":3,"d_subjects":[],"needs":[],"late":[],"missing":[],"choice_needed":true,"counts":{"applying":25,"graded":25,"left":0},"result_key_input":"makeup|below|263|"}'::jsonb);
  perform pg_temp.bbg_case('exact decimals: 7 x 2.15 = 15.05, 3 x 3.35 = 10.05, 0.1 + 0.2 = 0.3 (sums floats get wrong)', 1, '[{"op":"set","path":["parts",2,"subjects",0,"points","A"],"value":2.15},{"op":"set","path":["parts",2,"subjects",1,"points","A"],"value":2.15},{"op":"set","path":["parts",2,"subjects",2,"points","A"],"value":2.15},{"op":"set","path":["parts",2,"subjects",3,"points","A"],"value":2.15},{"op":"set","path":["parts",2,"subjects",4,"points","A"],"value":2.15},{"op":"set","path":["parts",2,"subjects",5,"points","A"],"value":2.15},{"op":"set","path":["parts",2,"subjects",6,"points","A"],"value":2.15},{"op":"set","path":["parts",1,"subjects",0,"points","A"],"value":3.35},{"op":"set","path":["parts",1,"subjects",3,"points","A"],"value":3.35},{"op":"set","path":["parts",1,"subjects",4,"points","A"],"value":3.35},{"op":"set","path":["parts",3,"subjects",0,"points","A"],"value":0.1},{"op":"set","path":["parts",3,"subjects",1,"points","A"],"value":0.2}]'::jsonb, 18, '[{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-04-03'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":25.4,"maximum":361.5,"pass_mark":293,"pass_bracket":{"from":18,"to":null},"age_group":{"from":18,"to":null},"parts":{"physical":0,"technical":10.05,"curriculum":15.05,"other":0.3},"extra_total":0,"d_subjects":[],"needs":[],"late":[],"missing":["ec806b43","38b5cd9f","b7e19759","435f76cf","5e91e6a9","b53843bc","ef1254f8","3dd99b9f","5accced1","f2630888","ab9209e1","7b07c0cc","6f5c13b7","2ab87e21"],"choice_needed":false,"counts":{"applying":26,"graded":12,"left":14},"result_key_input":"not_finished||25.4|"}'::jsonb);
  perform pg_temp.bbg_case('a hand-fixed row that does not fit is ignored: a letter on a measured subject, a way that does not exist, a kept letter not of the subject', 1, '[]'::jsonb, 15, '[{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ec806b43","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":"A-","measured":null,"way":null,"kept":true,"kept_from_cycle_name":"Spring 2027"}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date, '{"status":"not_finished","reasons":[],"complete":false,"total":281.25,"maximum":339,"pass_mark":275,"pass_bracket":{"from":null,"to":17},"age_group":{"from":13,"to":17},"parts":{"physical":41,"technical":37.25,"curriculum":118,"other":69},"extra_total":16,"d_subjects":[],"needs":[],"late":[],"missing":["ec806b43","38b5cd9f","5e91e6a9"],"choice_needed":false,"counts":{"applying":25,"graded":22,"left":3},"result_key_input":"not_finished||281.25|"}'::jsonb);

  -- (generated) every kept case of the same file
  perform pg_temp.bbg_kept_case('Mia Chen, Spring 2027 -> Fall 2027: every grade kept (measured ones as their worked-out letters) except the D, every count kept', 1, '[]'::jsonb, 32, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":22,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":45,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":88,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":9.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":35,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":14.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.25,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":37,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Outstanding performance","count":5,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":290,"kept":false},{"item_name":"Special events","count":6,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date,
    1, '[]'::jsonb, 32, '{"kept":[{"subject_id":"ec806b43","part":"physical","letter":"A"},{"subject_id":"38b5cd9f","part":"physical","letter":"A"},{"subject_id":"b7e19759","part":"physical","letter":"A"},{"subject_id":"435f76cf","part":"physical","letter":"A"},{"subject_id":"5e91e6a9","part":"physical","letter":"A"},{"subject_id":"b53843bc","part":"physical","letter":"A"},{"subject_id":"ef1254f8","part":"physical","letter":"A+"},{"subject_id":"3dd99b9f","part":"physical","letter":"A"},{"subject_id":"5accced1","part":"physical","letter":"A"},{"subject_id":"88de8004","part":"technical","letter":"A"},{"subject_id":"ab9209e1","part":"technical","letter":"A"},{"subject_id":"24280b75","part":"technical","letter":"B+"},{"subject_id":"8620a413","part":"technical","letter":"A"},{"subject_id":"d5bf66fd","part":"curriculum","letter":"A"},{"subject_id":"522a5a06","part":"curriculum","letter":"A"},{"subject_id":"d16684a5","part":"curriculum","letter":"A-"},{"subject_id":"fe78294a","part":"curriculum","letter":"A"},{"subject_id":"7dd13946","part":"curriculum","letter":"A"},{"subject_id":"dc32f7c3","part":"curriculum","letter":"A+"},{"subject_id":"31683485","part":"curriculum","letter":"A"},{"subject_id":"574ce43c","part":"other","letter":"A"},{"subject_id":"5896c437","part":"other","letter":"A"},{"subject_id":"7b07c0cc","part":"other","letter":"A"},{"subject_id":"6f5c13b7","part":"other","letter":"A"},{"subject_id":"2ab87e21","part":"other","letter":"A"}],"retest":["f2630888"],"new":[],"dropped":[],"kept_counts":[{"item_name":"Extra stripes","count":2},{"item_name":"Outstanding performance","count":5},{"item_name":"Competitions","count":0},{"item_name":"Attendance (classes)","count":290},{"item_name":"Special events","count":6},{"item_name":"Breaking class","count":16}],"dropped_extra":[]}'::jsonb);
  perform pg_temp.bbg_kept_case('a D is never kept, also when the total is below the mark too (Rina Patel)', 1, '[]'::jsonb, 29, '[{"subject_id":"ec806b43","letter":null,"measured":5,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":18,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":31,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":16,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":79,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":11.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":12.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":28,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"B","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Attendance (classes)","count":344,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date,
    1, '[]'::jsonb, 29, '{"kept":[{"subject_id":"ec806b43","part":"physical","letter":"B+"},{"subject_id":"38b5cd9f","part":"physical","letter":"B+"},{"subject_id":"b7e19759","part":"physical","letter":"B+"},{"subject_id":"435f76cf","part":"physical","letter":"B"},{"subject_id":"5e91e6a9","part":"physical","letter":"B+"},{"subject_id":"b53843bc","part":"physical","letter":"B"},{"subject_id":"ef1254f8","part":"physical","letter":"B+"},{"subject_id":"3dd99b9f","part":"physical","letter":"B+"},{"subject_id":"88de8004","part":"technical","letter":"B+"},{"subject_id":"f2630888","part":"technical","letter":"B"},{"subject_id":"ab9209e1","part":"technical","letter":"B"},{"subject_id":"24280b75","part":"technical","letter":"B+"},{"subject_id":"8620a413","part":"technical","letter":"B"},{"subject_id":"d5bf66fd","part":"curriculum","letter":"B+"},{"subject_id":"522a5a06","part":"curriculum","letter":"B"},{"subject_id":"d16684a5","part":"curriculum","letter":"B+"},{"subject_id":"fe78294a","part":"curriculum","letter":"B"},{"subject_id":"7dd13946","part":"curriculum","letter":"B"},{"subject_id":"dc32f7c3","part":"curriculum","letter":"A-"},{"subject_id":"31683485","part":"curriculum","letter":"B+"},{"subject_id":"574ce43c","part":"other","letter":"B+"},{"subject_id":"5896c437","part":"other","letter":"B"},{"subject_id":"7b07c0cc","part":"other","letter":"B"},{"subject_id":"6f5c13b7","part":"other","letter":"B+"},{"subject_id":"2ab87e21","part":"other","letter":"B"}],"retest":["5accced1"],"new":[],"dropped":[],"kept_counts":[{"item_name":"Attendance (classes)","count":344}],"dropped_extra":[]}'::jsonb);
  perform pg_temp.bbg_kept_case('renamed subject -> retest, new and dropped; another subject only re-capitalised still matches', 1, '[]'::jsonb, 32, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":22,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":45,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":88,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":9.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":35,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":14.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.25,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":37,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Outstanding performance","count":5,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":290,"kept":false},{"item_name":"Special events","count":6,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date,
    1, '[{"op":"set","path":["parts",1,"subjects",3,"name"],"value":"Korean words"},{"op":"set","path":["parts",1,"subjects",4,"name"],"value":"Tkd Knowledge"}]'::jsonb, 32, '{"kept":[{"subject_id":"ec806b43","part":"physical","letter":"A"},{"subject_id":"38b5cd9f","part":"physical","letter":"A"},{"subject_id":"b7e19759","part":"physical","letter":"A"},{"subject_id":"435f76cf","part":"physical","letter":"A"},{"subject_id":"5e91e6a9","part":"physical","letter":"A"},{"subject_id":"b53843bc","part":"physical","letter":"A"},{"subject_id":"ef1254f8","part":"physical","letter":"A+"},{"subject_id":"3dd99b9f","part":"physical","letter":"A"},{"subject_id":"5accced1","part":"physical","letter":"A"},{"subject_id":"88de8004","part":"technical","letter":"A"},{"subject_id":"ab9209e1","part":"technical","letter":"A"},{"subject_id":"8620a413","part":"technical","letter":"A"},{"subject_id":"d5bf66fd","part":"curriculum","letter":"A"},{"subject_id":"522a5a06","part":"curriculum","letter":"A"},{"subject_id":"d16684a5","part":"curriculum","letter":"A-"},{"subject_id":"fe78294a","part":"curriculum","letter":"A"},{"subject_id":"7dd13946","part":"curriculum","letter":"A"},{"subject_id":"dc32f7c3","part":"curriculum","letter":"A+"},{"subject_id":"31683485","part":"curriculum","letter":"A"},{"subject_id":"574ce43c","part":"other","letter":"A"},{"subject_id":"5896c437","part":"other","letter":"A"},{"subject_id":"7b07c0cc","part":"other","letter":"A"},{"subject_id":"6f5c13b7","part":"other","letter":"A"},{"subject_id":"2ab87e21","part":"other","letter":"A"}],"retest":["f2630888","24280b75"],"new":["24280b75"],"dropped":["Korean terminology"],"kept_counts":[{"item_name":"Extra stripes","count":2},{"item_name":"Outstanding performance","count":5},{"item_name":"Competitions","count":0},{"item_name":"Attendance (classes)","count":290},{"item_name":"Special events","count":6},{"item_name":"Breaking class","count":16}],"dropped_extra":[]}'::jsonb);
  perform pg_temp.bbg_kept_case('the same name in another part never matches', 1, '[]'::jsonb, 32, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":22,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":45,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":88,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":9.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":35,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":14.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.25,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":37,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Outstanding performance","count":5,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":290,"kept":false},{"item_name":"Special events","count":6,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date,
    1, '[{"op":"set","path":["parts",2,"subjects",6,"name"],"value":"Referee seminar"}]'::jsonb, 32, '{"kept":[{"subject_id":"ec806b43","part":"physical","letter":"A"},{"subject_id":"38b5cd9f","part":"physical","letter":"A"},{"subject_id":"b7e19759","part":"physical","letter":"A"},{"subject_id":"435f76cf","part":"physical","letter":"A"},{"subject_id":"5e91e6a9","part":"physical","letter":"A"},{"subject_id":"b53843bc","part":"physical","letter":"A"},{"subject_id":"ef1254f8","part":"physical","letter":"A+"},{"subject_id":"3dd99b9f","part":"physical","letter":"A"},{"subject_id":"5accced1","part":"physical","letter":"A"},{"subject_id":"88de8004","part":"technical","letter":"A"},{"subject_id":"ab9209e1","part":"technical","letter":"A"},{"subject_id":"24280b75","part":"technical","letter":"B+"},{"subject_id":"8620a413","part":"technical","letter":"A"},{"subject_id":"d5bf66fd","part":"curriculum","letter":"A"},{"subject_id":"522a5a06","part":"curriculum","letter":"A"},{"subject_id":"d16684a5","part":"curriculum","letter":"A-"},{"subject_id":"fe78294a","part":"curriculum","letter":"A"},{"subject_id":"7dd13946","part":"curriculum","letter":"A"},{"subject_id":"dc32f7c3","part":"curriculum","letter":"A+"},{"subject_id":"574ce43c","part":"other","letter":"A"},{"subject_id":"5896c437","part":"other","letter":"A"},{"subject_id":"7b07c0cc","part":"other","letter":"A"},{"subject_id":"6f5c13b7","part":"other","letter":"A"},{"subject_id":"2ab87e21","part":"other","letter":"A"}],"retest":["f2630888","31683485"],"new":["31683485"],"dropped":["Self-Defense"],"kept_counts":[{"item_name":"Extra stripes","count":2},{"item_name":"Outstanding performance","count":5},{"item_name":"Competitions","count":0},{"item_name":"Attendance (classes)","count":290},{"item_name":"Special events","count":6},{"item_name":"Breaking class","count":16}],"dropped_extra":[]}'::jsonb);
  perform pg_temp.bbg_kept_case('a new subject in the later rubric is a retest and "new"', 1, '[]'::jsonb, 32, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":22,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":45,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":88,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":9.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":35,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":14.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.25,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":37,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Outstanding performance","count":5,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":290,"kept":false},{"item_name":"Special events","count":6,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date,
    1, '[{"op":"set","path":["parts",3,"subjects",5],"value":{"id":"newsub01","name":"Community service","credits":2,"scoring":"graded","ways":[],"points_mode":"worked","points":{"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},"limited_to":null,"outdoor":false,"handed_in":false,"note":null}}]'::jsonb, 32, '{"kept":[{"subject_id":"ec806b43","part":"physical","letter":"A"},{"subject_id":"38b5cd9f","part":"physical","letter":"A"},{"subject_id":"b7e19759","part":"physical","letter":"A"},{"subject_id":"435f76cf","part":"physical","letter":"A"},{"subject_id":"5e91e6a9","part":"physical","letter":"A"},{"subject_id":"b53843bc","part":"physical","letter":"A"},{"subject_id":"ef1254f8","part":"physical","letter":"A+"},{"subject_id":"3dd99b9f","part":"physical","letter":"A"},{"subject_id":"5accced1","part":"physical","letter":"A"},{"subject_id":"88de8004","part":"technical","letter":"A"},{"subject_id":"ab9209e1","part":"technical","letter":"A"},{"subject_id":"24280b75","part":"technical","letter":"B+"},{"subject_id":"8620a413","part":"technical","letter":"A"},{"subject_id":"d5bf66fd","part":"curriculum","letter":"A"},{"subject_id":"522a5a06","part":"curriculum","letter":"A"},{"subject_id":"d16684a5","part":"curriculum","letter":"A-"},{"subject_id":"fe78294a","part":"curriculum","letter":"A"},{"subject_id":"7dd13946","part":"curriculum","letter":"A"},{"subject_id":"dc32f7c3","part":"curriculum","letter":"A+"},{"subject_id":"31683485","part":"curriculum","letter":"A"},{"subject_id":"574ce43c","part":"other","letter":"A"},{"subject_id":"5896c437","part":"other","letter":"A"},{"subject_id":"7b07c0cc","part":"other","letter":"A"},{"subject_id":"6f5c13b7","part":"other","letter":"A"},{"subject_id":"2ab87e21","part":"other","letter":"A"}],"retest":["f2630888","newsub01"],"new":["newsub01"],"dropped":[],"kept_counts":[{"item_name":"Extra stripes","count":2},{"item_name":"Outstanding performance","count":5},{"item_name":"Competitions","count":0},{"item_name":"Attendance (classes)","count":290},{"item_name":"Special events","count":6},{"item_name":"Breaking class","count":16}],"dropped_extra":[]}'::jsonb);
  perform pg_temp.bbg_kept_case('an extra item missing from the later rubric is dropped; a re-capitalised item matches and takes the later name', 1, '[]'::jsonb, 32, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":22,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":45,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":88,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":9.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":35,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":14.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.25,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":37,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Outstanding performance","count":5,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":290,"kept":false},{"item_name":"Special events","count":6,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date,
    1, '[{"op":"remove","path":["extra_points","items",4]},{"op":"set","path":["extra_points","items",4,"name"],"value":"breaking class"}]'::jsonb, 32, '{"kept":[{"subject_id":"ec806b43","part":"physical","letter":"A"},{"subject_id":"38b5cd9f","part":"physical","letter":"A"},{"subject_id":"b7e19759","part":"physical","letter":"A"},{"subject_id":"435f76cf","part":"physical","letter":"A"},{"subject_id":"5e91e6a9","part":"physical","letter":"A"},{"subject_id":"b53843bc","part":"physical","letter":"A"},{"subject_id":"ef1254f8","part":"physical","letter":"A+"},{"subject_id":"3dd99b9f","part":"physical","letter":"A"},{"subject_id":"5accced1","part":"physical","letter":"A"},{"subject_id":"88de8004","part":"technical","letter":"A"},{"subject_id":"ab9209e1","part":"technical","letter":"A"},{"subject_id":"24280b75","part":"technical","letter":"B+"},{"subject_id":"8620a413","part":"technical","letter":"A"},{"subject_id":"d5bf66fd","part":"curriculum","letter":"A"},{"subject_id":"522a5a06","part":"curriculum","letter":"A"},{"subject_id":"d16684a5","part":"curriculum","letter":"A-"},{"subject_id":"fe78294a","part":"curriculum","letter":"A"},{"subject_id":"7dd13946","part":"curriculum","letter":"A"},{"subject_id":"dc32f7c3","part":"curriculum","letter":"A+"},{"subject_id":"31683485","part":"curriculum","letter":"A"},{"subject_id":"574ce43c","part":"other","letter":"A"},{"subject_id":"5896c437","part":"other","letter":"A"},{"subject_id":"7b07c0cc","part":"other","letter":"A"},{"subject_id":"6f5c13b7","part":"other","letter":"A"},{"subject_id":"2ab87e21","part":"other","letter":"A"}],"retest":["f2630888"],"new":[],"dropped":[],"kept_counts":[{"item_name":"Extra stripes","count":2},{"item_name":"Outstanding performance","count":5},{"item_name":"Competitions","count":0},{"item_name":"Attendance (classes)","count":290},{"item_name":"breaking class","count":16}],"dropped_extra":["Special events"]}'::jsonb);
  perform pg_temp.bbg_kept_case('a letter valid earlier but not for the later subject (A- on a subject that became measured) -> retest', 1, '[]'::jsonb, 32, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":22,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":45,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":88,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":9.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":35,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":14.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.25,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":37,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Outstanding performance","count":5,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":290,"kept":false},{"item_name":"Special events","count":6,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date,
    1, '[{"op":"set","path":["parts",2,"subjects",2,"scoring"],"value":"measured"},{"op":"set","path":["parts",2,"subjects",2,"ways"],"value":[{"name":null,"unit":"count","direction":"at_least","brackets":[{"from":null,"to":null,"cutoffs":{"A+":10,"A":8,"B+":6,"B":4,"C":2}}]}]},{"op":"set","path":["parts",2,"subjects",2,"points"],"value":{"A+":22.5,"A":20,"B+":17.5,"B":16.5,"C":12.5,"D":0}}]'::jsonb, 32, '{"kept":[{"subject_id":"ec806b43","part":"physical","letter":"A"},{"subject_id":"38b5cd9f","part":"physical","letter":"A"},{"subject_id":"b7e19759","part":"physical","letter":"A"},{"subject_id":"435f76cf","part":"physical","letter":"A"},{"subject_id":"5e91e6a9","part":"physical","letter":"A"},{"subject_id":"b53843bc","part":"physical","letter":"A"},{"subject_id":"ef1254f8","part":"physical","letter":"A+"},{"subject_id":"3dd99b9f","part":"physical","letter":"A"},{"subject_id":"5accced1","part":"physical","letter":"A"},{"subject_id":"88de8004","part":"technical","letter":"A"},{"subject_id":"ab9209e1","part":"technical","letter":"A"},{"subject_id":"24280b75","part":"technical","letter":"B+"},{"subject_id":"8620a413","part":"technical","letter":"A"},{"subject_id":"d5bf66fd","part":"curriculum","letter":"A"},{"subject_id":"522a5a06","part":"curriculum","letter":"A"},{"subject_id":"fe78294a","part":"curriculum","letter":"A"},{"subject_id":"7dd13946","part":"curriculum","letter":"A"},{"subject_id":"dc32f7c3","part":"curriculum","letter":"A+"},{"subject_id":"31683485","part":"curriculum","letter":"A"},{"subject_id":"574ce43c","part":"other","letter":"A"},{"subject_id":"5896c437","part":"other","letter":"A"},{"subject_id":"7b07c0cc","part":"other","letter":"A"},{"subject_id":"6f5c13b7","part":"other","letter":"A"},{"subject_id":"2ab87e21","part":"other","letter":"A"}],"retest":["f2630888","d16684a5"],"new":[],"dropped":[],"kept_counts":[{"item_name":"Extra stripes","count":2},{"item_name":"Outstanding performance","count":5},{"item_name":"Competitions","count":0},{"item_name":"Attendance (classes)","count":290},{"item_name":"Special events","count":6},{"item_name":"Breaking class","count":16}],"dropped_extra":[]}'::jsonb);
  perform pg_temp.bbg_kept_case('a subject not graded yet on the earlier cycle (Make-up D not complete, Q-G6 B) -> retest', 1, '[]'::jsonb, 32, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":22,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":45,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":20,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":88,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":9.8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":35,"way":1,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":14.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.25,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":37,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"B+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"fe78294a","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A+","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Outstanding performance","count":5,"kept":false},{"item_name":"Competitions","count":0,"kept":false},{"item_name":"Attendance (classes)","count":290,"kept":false},{"item_name":"Special events","count":6,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-05-01'::date, '2027-05-29'::date,
    1, '[]'::jsonb, 32, '{"kept":[{"subject_id":"ec806b43","part":"physical","letter":"A"},{"subject_id":"38b5cd9f","part":"physical","letter":"A"},{"subject_id":"b7e19759","part":"physical","letter":"A"},{"subject_id":"435f76cf","part":"physical","letter":"A"},{"subject_id":"5e91e6a9","part":"physical","letter":"A"},{"subject_id":"b53843bc","part":"physical","letter":"A"},{"subject_id":"ef1254f8","part":"physical","letter":"A+"},{"subject_id":"3dd99b9f","part":"physical","letter":"A"},{"subject_id":"5accced1","part":"physical","letter":"A"},{"subject_id":"88de8004","part":"technical","letter":"A"},{"subject_id":"ab9209e1","part":"technical","letter":"A"},{"subject_id":"24280b75","part":"technical","letter":"B+"},{"subject_id":"8620a413","part":"technical","letter":"A"},{"subject_id":"d5bf66fd","part":"curriculum","letter":"A"},{"subject_id":"522a5a06","part":"curriculum","letter":"A"},{"subject_id":"d16684a5","part":"curriculum","letter":"A-"},{"subject_id":"fe78294a","part":"curriculum","letter":"A"},{"subject_id":"7dd13946","part":"curriculum","letter":"A"},{"subject_id":"dc32f7c3","part":"curriculum","letter":"A+"},{"subject_id":"31683485","part":"curriculum","letter":"A"},{"subject_id":"574ce43c","part":"other","letter":"A"},{"subject_id":"7b07c0cc","part":"other","letter":"A"},{"subject_id":"6f5c13b7","part":"other","letter":"A"},{"subject_id":"2ab87e21","part":"other","letter":"A"}],"retest":["f2630888","5896c437"],"new":[],"dropped":[],"kept_counts":[{"item_name":"Extra stripes","count":2},{"item_name":"Outstanding performance","count":5},{"item_name":"Competitions","count":0},{"item_name":"Attendance (classes)","count":290},{"item_name":"Special events","count":6},{"item_name":"Breaking class","count":16}],"dropped_extra":[]}'::jsonb);
  perform pg_temp.bbg_kept_case('an earlier 17-year-old who is 18 on the later cycle: One Step Sparring (not for 17) is a retest, not new', 1, '[]'::jsonb, 17, '[{"subject_id":"ec806b43","letter":null,"measured":7,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"38b5cd9f","letter":null,"measured":21,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b7e19759","letter":null,"measured":41,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"435f76cf","letter":null,"measured":19,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5e91e6a9","letter":null,"measured":85,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"b53843bc","letter":null,"measured":10.6,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ef1254f8","letter":null,"measured":8,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"3dd99b9f","letter":null,"measured":15.4,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5accced1","letter":null,"measured":8.6667,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"88de8004","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"f2630888","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"ab9209e1","letter":null,"measured":35,"way":0,"kept":false,"kept_from_cycle_name":null},{"subject_id":"24280b75","letter":"D","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"8620a413","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d5bf66fd","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"522a5a06","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"d16684a5","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7dd13946","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"dc32f7c3","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"31683485","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"574ce43c","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"5896c437","letter":"A-","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"7b07c0cc","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"6f5c13b7","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null},{"subject_id":"2ab87e21","letter":"A","measured":null,"way":null,"kept":false,"kept_from_cycle_name":null}]'::jsonb, '[{"item_name":"Extra stripes","count":2,"kept":false},{"item_name":"Competitions","count":1,"kept":false},{"item_name":"Attendance (classes)","count":380,"kept":false},{"item_name":"Special events","count":3,"kept":false},{"item_name":"Breaking class","count":16,"kept":false}]'::jsonb,
    '{}'::text[], '{}'::text[], '2027-06-09'::date, '2027-05-29'::date,
    1, '[]'::jsonb, 18, '{"kept":[{"subject_id":"ec806b43","part":"physical","letter":"A"},{"subject_id":"38b5cd9f","part":"physical","letter":"A"},{"subject_id":"b7e19759","part":"physical","letter":"A"},{"subject_id":"435f76cf","part":"physical","letter":"B+"},{"subject_id":"5e91e6a9","part":"physical","letter":"A"},{"subject_id":"b53843bc","part":"physical","letter":"B+"},{"subject_id":"ef1254f8","part":"physical","letter":"A"},{"subject_id":"3dd99b9f","part":"physical","letter":"B+"},{"subject_id":"5accced1","part":"physical","letter":"B+"},{"subject_id":"88de8004","part":"technical","letter":"A"},{"subject_id":"f2630888","part":"technical","letter":"A-"},{"subject_id":"ab9209e1","part":"technical","letter":"A"},{"subject_id":"8620a413","part":"technical","letter":"A-"},{"subject_id":"d5bf66fd","part":"curriculum","letter":"A"},{"subject_id":"522a5a06","part":"curriculum","letter":"A"},{"subject_id":"d16684a5","part":"curriculum","letter":"A-"},{"subject_id":"7dd13946","part":"curriculum","letter":"A"},{"subject_id":"dc32f7c3","part":"curriculum","letter":"A-"},{"subject_id":"31683485","part":"curriculum","letter":"A"},{"subject_id":"574ce43c","part":"other","letter":"A"},{"subject_id":"5896c437","part":"other","letter":"A-"},{"subject_id":"7b07c0cc","part":"other","letter":"A"},{"subject_id":"6f5c13b7","part":"other","letter":"A"},{"subject_id":"2ab87e21","part":"other","letter":"A"}],"retest":["24280b75","fe78294a"],"new":[],"dropped":[],"kept_counts":[{"item_name":"Extra stripes","count":2},{"item_name":"Competitions","count":1},{"item_name":"Attendance (classes)","count":380},{"item_name":"Special events","count":3},{"item_name":"Breaking class","count":16}],"dropped_extra":[]}'::jsonb);

  -- G6b. the cast entered through the functions gives the drawn results
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_cycle_results(v_sp, 1);
  v_x := pg_temp.bbg_row(v_r, v_alex) -> 'result';
  if v_x ->> 'status' <> 'passed' or (v_x ->> 'total')::numeric <> 305.75 or (v_x ->> 'pass_mark')::numeric <> 275
     or v_x -> 'age_group' <> '{"from": 13, "to": 17}' or (v_x ->> 'maximum')::numeric <> 339
     or v_x ->> 'result_key' <> md5('passed||305.75|') then
    perform pg_temp.bbg_fail('G6b Alex Kim 305.75 Passed', v_x::text);
  end if;
  v_alex_k := v_x ->> 'result_key';
  v_x := pg_temp.bbg_row(v_r, v_zoe) -> 'result';
  if v_x ->> 'status' <> 'makeup' or v_x -> 'reasons' <> '["below"]' or (v_x ->> 'total')::numeric <> 263
     or not (v_x ->> 'choice_needed')::boolean or v_x -> 'needs' <> '[]'
     or v_x ->> 'result_key' <> md5('makeup|below|263|') then
    perform pg_temp.bbg_fail('G6b Zoe Martin 263 Make-up below, choice needed', v_x::text);
  end if;
  -- G12: no subjects chosen yet -> Mark as sent and Email result answer not_finished
  if public.bb_mark_result_sent(v_zoe, v_x ->> 'result_key') is distinct from '{"status": "not_finished"}'::jsonb
     or public.bb_result_email(v_zoe) is distinct from '{"status": "not_finished"}'::jsonb then
    perform pg_temp.bbg_fail('G12 choice_needed -> not_finished', null);
  end if;
  -- 263 = 263.0 = 263.00 in the key (trailing zeros removed)
  if md5('makeup|below|' || trim_scale(263.00::numeric)::text || '|') <> v_x ->> 'result_key'
     or md5('makeup|below|' || trim_scale(263.0::numeric)::text || '|') <> v_x ->> 'result_key' then
    perform pg_temp.bbg_fail('G6b 263 / 263.0 / 263.00 must give the same key', v_x ->> 'result_key');
  end if;
  v_x := pg_temp.bbg_row(v_r, v_mia) -> 'result';
  if v_x ->> 'status' <> 'makeup' or v_x -> 'reasons' <> '["d"]' or (v_x ->> 'total')::numeric <> 324.5
     or v_x -> 'needs' <> to_jsonb(array[v_s_fs]) or (v_x ->> 'pass_mark')::numeric <> 293
     or v_x ->> 'result_key' <> md5('makeup|d|324.5|' || v_s_fs) then
    perform pg_temp.bbg_fail('G6b Mia Chen 324.5 Make-up D in Free sparring', v_x::text);
  end if;
  v_x := pg_temp.bbg_row(v_r, v_rina) -> 'result';
  if v_x ->> 'status' <> 'makeup' or v_x -> 'reasons' <> '["d", "below"]' or (v_x ->> 'total')::numeric <> 252.5
     or v_x -> 'needs' <> to_jsonb(array[v_s_mile]) then
    perform pg_temp.bbg_fail('G6b Rina Patel 252.5 Make-up D + below', v_x::text);
  end if;
  v_x := pg_temp.bbg_row(v_r, v_lucas) -> 'result';
  if v_x ->> 'status' <> 'not_finished' or (v_x ->> 'total')::numeric <> 275.5 or v_x -> 'late' <> to_jsonb(array[v_s_proj])
     or v_x -> 'age_group' <> '{"from": 10, "to": 12}' or v_x -> 'counts' <> '{"applying": 25, "graded": 24, "left": 1}' then
    perform pg_temp.bbg_fail('G6b Lucas Ferreira 275.5 Not finished, TKD project late', v_x::text);
  end if;
  v_x := pg_temp.bbg_row(v_r, v_teen) -> 'result';
  if v_x ->> 'status' <> 'makeup' or v_x -> 'reasons' <> '["d"]' or (v_x ->> 'complete')::boolean then
    perform pg_temp.bbg_fail('G6b Teen: a D while not complete is a Make-up for the D', v_x::text);
  end if;
  v_x := pg_temp.bbg_row(public.bb_cycle_results(v_sp, 2), v_sam) -> 'result';
  if v_x ->> 'status' <> 'not_finished' or (v_x ->> 'total')::numeric <> 243.6 or v_x -> 'age_group' <> '{"from": 13, "to": null}' then
    perform pg_temp.bbg_fail('G6b Sam Lee 243.6 Not finished (2nd Dan)', v_x::text);
  end if;
  -- the ND candidate has no age
  v_x := pg_temp.bbg_row(public.bb_cycle_results(v_nd, 1), v_nage) -> 'result';
  if v_x ->> 'status' <> 'no_age' or v_x ->> 'result_key' <> md5('no_age|||') or v_x -> 'subjects' <> '[]' then
    perform pg_temp.bbg_fail('G6b no age on file -> no_age', v_x::text);
  end if;


  -- ===================================================================
  -- G8 (part 1). Before any make-up, Fall has no "grading started" mark;
  --     a fresh cycle gets one from its FIRST grading row of each kind
  --     (a grade, a number, a count), once, and its rubric is locked
  -- ===================================================================
  if public.bb_cycle_grading_started_at(v_fa) is not null then
    perform pg_temp.bbg_fail('G8 Fall has a grading mark before any grading row', null);
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_ok := array[pg_temp.bbg_add(v_none[1]::uuid, 'Gia', 'Gradetest', pg_temp.bbg_dob(v_today + 30, 20), 'worcester', 1, v_mail || '.g8a@example.com')::text,
                pg_temp.bbg_add(v_none[2]::uuid, 'Mo', 'Numbertest', pg_temp.bbg_dob(v_today + 30, 20), 'worcester', 1, v_mail || '.g8b@example.com')::text,
                pg_temp.bbg_add(v_none[3]::uuid, 'Cy', 'Counttest', pg_temp.bbg_dob(v_today + 30, 20), 'worcester', 1, v_mail || '.g8c@example.com')::text];
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_set_grade(v_ok[1]::uuid, 1, v_s_fs, 'A');
  v_r2 := public.bb_set_grade(v_ok[1]::uuid, 1, v_s_ref, 'A');
  if v_r ->> 'status' <> 'ok' or v_r2 ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G8 grades on G8a', v_r::text || v_r2::text); end if;
  v_r := public.bb_set_measured(v_ok[2]::uuid, 1, v_s_stretch, 6, 0);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G8 a number on G8b', v_r::text); end if;
  v_r := public.bb_set_extra_count(v_ok[3]::uuid, 1, 'Extra stripes', 3);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G8 a count on G8c', v_r::text); end if;
  for v_i in 1 .. 3 loop
    if (select count(*) from public.bb_cycle_grading_started where cycle_id = v_none[v_i]::uuid) <> 1
       or (select count(*) from public.change_log where id > v_mark and table_name = 'bb_cycle_grading_started'
             and record_id = (select id from public.bb_cycle_grading_started where cycle_id = v_none[v_i]::uuid)) <> 1
       or (select started_by_name from public.bb_cycle_grading_started where cycle_id = v_none[v_i]::uuid) <> 'Staff' then
      perform pg_temp.bbg_fail('G8 the grading-started row is written once (and logged once) for G8' || chr(96 + v_i), null);
    end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_a1, true);
  for v_i in 1 .. 3 loop
    v_x := (select requirements -> 'dans' -> 0 from public.bb_cycles where id = v_none[v_i]::uuid);
    v_r := public.bb_save_cycle_dan(v_none[v_i]::uuid, 1, (v_x ->> 'rev')::integer, jsonb_set(v_x, '{pass,makeup}', '"zz changed"'));
    if v_r ->> 'status' <> 'has_grades' or pg_temp.bbg_keys(v_r) <> array['grading_started_at', 'status']
       or (v_r ->> 'grading_started_at')::timestamptz <> public.bb_cycle_grading_started_at(v_none[v_i]::uuid) then
      perform pg_temp.bbg_fail('G8 save of a cycle Dan after grading started -> has_grades + grading_started_at', v_r::text);
    end if;
    v_r := public.bb_undo_cycle_dan(v_none[v_i]::uuid, 1, (v_x ->> 'rev')::integer);
    if v_r ->> 'status' <> 'has_grades' or v_r -> 'grading_started_at' is null then
      perform pg_temp.bbg_fail('G8 undo of a cycle Dan after grading started -> has_grades', v_r::text);
    end if;
  end loop;
  -- clearing every grading row keeps the copy locked
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_set_grade(v_ok[1]::uuid, 1, v_s_fs, null);
  v_r := public.bb_set_grade(v_ok[1]::uuid, 1, v_s_ref, null);
  if public.bb_cycle_has_grading(v_none[1]::uuid) or public.bb_cycle_grading_started_at(v_none[1]::uuid) is null then
    perform pg_temp.bbg_fail('G8 after clearing every grade the mark stays (and no grading row is left)', null);
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_x := (select requirements -> 'dans' -> 0 from public.bb_cycles where id = v_none[1]::uuid);
  v_r := public.bb_save_cycle_dan(v_none[1]::uuid, 1, (v_x ->> 'rev')::integer, jsonb_set(v_x, '{pass,makeup}', '"zz changed"'));
  if v_r ->> 'status' <> 'has_grades' then perform pg_temp.bbg_fail('G8 cleared grades must not unlock the rubric', v_r::text); end if;
  v_r := public.bb_cycle_grading_state(v_none[1]::uuid);
  if pg_temp.bbg_keys(v_r) <> array['first_day', 'first_day_frozen', 'grading_started_at', 'has_grading', 'parts_with_grades',
                                    'protected_days', 'status']
     or (v_r ->> 'has_grading')::boolean or v_r -> 'grading_started_at' is null or v_r -> 'parts_with_grades' <> '[]' then
    perform pg_temp.bbg_fail('G8 bb_cycle_grading_state (keys, grading_started_at after clearing)', v_r::text);
  end if;
  -- the table rule behind it: the save tag can't change a locked copy; a hand fix can
  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.action', 'bb_save_cycle_dan', true);
  begin
    update public.bb_cycles set requirements = jsonb_set(requirements, '{source}', '"zz"') where id = v_none[2]::uuid;
    perform pg_temp.bbg_fail('G8 a locked copy changed under the save tag', null);
  exception when check_violation then
    get stacked diagnostics v_txt = constraint_name;
    if v_txt <> 'bb_cycles_requirements_immutable' then perform pg_temp.bbg_fail('G8 the copy rule', v_txt); end if;
  end;
  perform set_config('tkd.action', '', true);
  update public.bb_cycles set requirements = jsonb_set(requirements, '{source}', '"zz hand fix"') where id = v_none[2]::uuid;
  -- the mark itself: written only by grading, never changed, removed only with its cycle
  foreach v_txt in array array['bb_update_cycle', ''] loop
    perform set_config('tkd.action', v_txt, true);
    begin
      if v_txt = '' then
        update public.bb_cycle_grading_started set started_by_name = 'zz' where cycle_id = v_none[1]::uuid;
      else
        insert into public.bb_cycle_grading_started (cycle_id) values (v_del);
      end if;
      perform pg_temp.bbg_fail('G8 the grading mark was written outside grading (' || v_txt || ')', null);
    exception when check_violation then
      get stacked diagnostics v_txt2 = constraint_name;
      if v_txt2 <> 'bb_cycle_grading_started_immutable' then perform pg_temp.bbg_fail('G8 mark rule', v_txt2); end if;
    end;
  end loop;
  perform set_config('tkd.action', '', true);
  begin
    delete from public.bb_cycle_grading_started where cycle_id = v_none[1]::uuid;
    perform pg_temp.bbg_fail('G8 the grading mark was removed by hand', null);
  exception when check_violation then null;
  end;
  begin
    truncate public.bb_cycle_grading_started;
    perform pg_temp.bbg_fail('G8 the grading mark table was truncated', null);
  exception when others then
    if sqlerrm not like '%can''t be truncated%' then raise; end if;
  end;


  -- ===================================================================
  -- G7. Make-ups
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- G7a. the refusals before any make-up exists
  if public.bb_add_makeup(v_fa, null) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_add_makeup(v_rand, v_mia) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_add_makeup(v_fa, v_rand) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_add_makeup(v_sp, v_olga) is distinct from '{"status": "finished"}'::jsonb      -- Spring is Past
     or public.bb_add_makeup(v_sp, v_mia) is distinct from '{"status": "finished"}'::jsonb
     or public.bb_add_makeup(v_fa, v_wd) is distinct from '{"status": "invalid"}'::jsonb        -- withdrawn
     or public.bb_add_makeup(v_fa, v_alex) is distinct from '{"status": "stale"}'::jsonb        -- Passed: no make-up
     or public.bb_add_makeup(v_fa, v_lucas) is distinct from '{"status": "stale"}'::jsonb       -- not finished
     or public.bb_add_makeup(v_fa, v_zoe) is distinct from '{"status": "choice_needed"}'::jsonb then
    perform pg_temp.bbg_fail('G7a Add make-up refusals', null);
  end if;
  -- the same cycle, and an earlier cycle that isn't earlier: a Winter row into Fall
  v_r := public.bb_add_makeup(v_wi, v_mia);   -- (Winter gets Mia for the "first day not before" check; undone below)
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G7a Mia into Winter', v_r::text); end if;
  v_mu2 := (v_r ->> 'id')::uuid;
  if public.bb_add_makeup(v_fa, v_mu2) is distinct from '{"status": "invalid"}'::jsonb      -- Winter's first day is after Fall's
     or public.bb_add_makeup(v_wi, v_mu2) is distinct from '{"status": "invalid"}'::jsonb then -- the same cycle
    perform pg_temp.bbg_fail('G7a same cycle / earlier first day not before -> invalid', null);
  end if;
  -- an active make-up anywhere -> already_added (Fall and Winter)
  if public.bb_add_makeup(v_fa, v_mia) is distinct from '{"status": "already_added"}'::jsonb
     or public.bb_add_makeup(v_wi, v_mia) is distinct from '{"status": "already_added"}'::jsonb then
    perform pg_temp.bbg_fail('G7a a second active make-up -> already_added', null);
  end if;
  -- the Undo (admin Delete permanently) works on a row with only kept and
  -- retest rows - and Winter's rubric stays locked for good (G8)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_delete_candidate(v_mu2, (select version from public.bb_candidates where id = v_mu2));
  if v_r is distinct from '{"status": "ok"}'::jsonb or exists (select 1 from public.bb_grades where candidate_id = v_mu2) then
    perform pg_temp.bbg_fail('G7a Undo of Add make-up (Delete permanently)', v_r::text);
  end if;
  if public.bb_cycle_grading_started_at(v_wi) is null or public.bb_cycle_has_grading(v_wi) then
    perform pg_temp.bbg_fail('G8 a make-up''s Undo must keep Winter''s rubric locked', null);
  end if;
  v_x := (select requirements -> 'dans' -> 0 from public.bb_cycles where id = v_wi);
  if public.bb_save_cycle_dan(v_wi, 1, (v_x ->> 'rev')::integer, jsonb_set(v_x, '{pass,makeup}', '"zz"')) ->> 'status' <> 'has_grades' then
    perform pg_temp.bbg_fail('G8 Winter''s save after the Undo -> has_grades', null);
  end if;

  -- G7b. Mia into Fall: kept grades (measured ones as their worked-out
  --      letters), kept counts, the D retested; no plan, no fee
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_makeup(v_fa, v_mia);
  if v_r ->> 'status' <> 'ok' or pg_temp.bbg_keys(v_r) <> array['id', 'kept_count', 'reference', 'retest_count', 'status', 'version']
     or (v_r ->> 'kept_count')::integer <> 25 or (v_r ->> 'retest_count')::integer <> 1
     or v_r ->> 'reference' <> (select reference from public.bb_candidates where id = v_mia) then
    perform pg_temp.bbg_fail('G7b Add make-up Mia -> Fall', v_r::text);
  end if;
  v_mu := (v_r ->> 'id')::uuid;
  if (select count(*) from public.bb_candidates c
       where c.id = v_mu and c.source = 'makeup' and c.cycle_plan_id is null and not c.kukkiwon and c.dan = 1
         and c.makeup_of_candidate_id = v_mia and c.makeup_of_cycle_name = v_tag || ' Spring' and c.cycle_id = v_fa
         and c.first_name = 'Mia' and c.date_of_birth = pg_temp.bbg_dob(v_sp_first, 32) and c.status = 'active'
         and c.age_kept is null) <> 1
     or (select count(*) from public.bb_grades g where g.candidate_id = v_mu and g.kept and g.kept_from_cycle_id = v_sp
          and g.kept_from_cycle_name = v_tag || ' Spring' and g.measured is null) <> 25
     or (select letter from public.bb_grades where candidate_id = v_mu and subject_id = v_s_stretch) <> 'A'
     or (select letter from public.bb_grades where candidate_id = v_mu and subject_id = v_s_pull) <> 'A+'
     or exists (select 1 from public.bb_grades where candidate_id = v_mu and subject_id = v_s_fs)
     or (select count(*) from public.bb_extra_counts where candidate_id = v_mu and kept) <> 6
     or (select array_agg(subject_id) from public.bb_makeup_subjects where candidate_id = v_mu and kind = 'retest') <> array[v_s_fs]
     or exists (select 1 from public.bb_candidate_waivers where candidate_id = v_mu) then
    perform pg_temp.bbg_fail('G7b the make-up row and its kept / retest rows', null);
  end if;
  if public.bb_cycle_grading_started_at(v_fa) is null then
    perform pg_temp.bbg_fail('G8 the kept rows of Add make-up must write Fall''s grading mark', null);
  end if;
  v_x := public.bb_candidate_result(v_mu);
  if v_x ->> 'status' <> 'not_finished' or (v_x ->> 'total')::numeric <> 324.5
     or v_x -> 'missing' <> to_jsonb(array[v_s_fs])
     or (select count(*) from jsonb_array_elements(v_x -> 'subjects') as s(e) where (s.e ->> 'gradable')::boolean) <> 1
     or not ((select s.e from jsonb_array_elements(v_x -> 'subjects') as s(e) where s.e ->> 'id' = v_s_fs) @> '{"retest": true, "gradable": true}') then
    perform pg_temp.bbg_fail('G7b Mia on Fall: 324.5 so far, only Free sparring gradable', v_x::text);
  end if;
  -- a kept grade can't be written
  if public.bb_set_grade(v_mu, 1, v_s_kor, 'A') is distinct from '{"status": "kept"}'::jsonb
     or public.bb_set_measured(v_mu, 1, v_s_stretch, 8, 0) is distinct from '{"status": "kept"}'::jsonb
     or public.bb_set_extra_count(v_mu, 1, 'Extra stripes', 5) is distinct from '{"status": "kept"}'::jsonb then
    perform pg_temp.bbg_fail('G4 a kept grade, number or count -> kept', null);
  end if;
  -- Free sparring B+: 333.5 Passed
  v_r := public.bb_set_grade(v_mu, 1, v_s_fs, 'B+');
  if v_r ->> 'status' <> 'ok' or v_r -> 'result' ->> 'status' <> 'passed' or (v_r -> 'result' ->> 'total')::numeric <> 333.5 then
    perform pg_temp.bbg_fail('G7b Mia''s make-up: Free sparring B+ -> 333.5 Passed', v_r::text);
  end if;
  -- no money, no plan change, no Kukkiwon, no Dan change
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- (right after the lock, before the version check: a wrong version still answers invalid)
  if public.bb_change_plan(v_mu, 9999, (select id from public.bb_cycle_plans where cycle_id = v_fa limit 1), false)
     is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_change_plan(v_mu, (select version from public.bb_candidates where id = v_mu),
                           (select id from public.bb_cycle_plans where cycle_id = v_fa limit 1), false)
     is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_update_candidate(v_mu, (select version from public.bb_candidates where id = v_mu), 'Mia', 'Chentest',
                                   pg_temp.bbg_dob(v_sp_first, 32), v_mail || '.mia@example.com', 'worcester', 2)
        is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_record_payment(v_mu, (select version from public.bb_candidates where id = v_mu), 1000, 'cash', array['p1'], null)
        ->> 'status' <> 'invalid' then
    perform pg_temp.bbg_fail('G7b a make-up row: Change plan, a Dan change and a payment -> invalid', null);
  end if;
  perform set_config('request.jwt.claims', '', true);
  begin
    update public.bb_candidates set kukkiwon = true, kukkiwon_added_on = v_today where id = v_mu;
    perform pg_temp.bbg_fail('G7b a make-up row got Kukkiwon', null);
  exception when check_violation then null;
  end;
  -- G5: every kind of money row for a make-up row is refused by the
  -- database itself (a payment by bb_payments_makeup; a refund, reversal or
  -- returned check may be stopped first by 0016's own guard - refused either way)
  foreach v_txt in array array['payment', 'refund', 'reversal', 'returned'] loop
    begin
      insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, location_code,
                                      cycle_name, recorded_by_name, reverses_payment_id)
      values (v_mu, v_fa, v_txt, case when v_txt = 'payment' then 1000 else -1000 end,
              case when v_txt = 'returned' then 'check' else 'cash' end, v_today,
              case when v_txt = 'payment' then array['p1'] end, 'worcester', v_tag || ' Fall', 'zz',
              case when v_txt in ('reversal', 'returned') then (select id from public.bb_payments where candidate_id = v_pay limit 1) end);
      perform pg_temp.bbg_fail('G5 a ' || v_txt || ' for a make-up row was stored', null);
    exception when check_violation then
      get stacked diagnostics v_txt2 = constraint_name;
      if v_txt = 'payment' and v_txt2 <> 'bb_payments_makeup' then
        perform pg_temp.bbg_fail('G5 a make-up payment must be refused by bb_payments_makeup', v_txt2);
      end if;
    end;
  end loop;
  -- ... and bb_payments_makeup ALONE refuses every kind (0016's own guard
  -- switched off for these four statements; the rollback undoes it too)
  alter table public.bb_payments disable trigger bb_payments_guard;
  foreach v_txt in array array['payment', 'refund', 'reversal', 'returned'] loop
    begin
      insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, location_code,
                                      cycle_name, recorded_by_name, reverses_payment_id)
      values (v_mu, v_fa, v_txt, case when v_txt = 'payment' then 1000 else -1000 end,
              case when v_txt = 'returned' then 'check' else 'cash' end, v_today,
              case when v_txt = 'payment' then array['p1'] end, 'worcester', v_tag || ' Fall', 'zz',
              case when v_txt in ('reversal', 'returned') then (select id from public.bb_payments where candidate_id = v_pay limit 1) end);
      alter table public.bb_payments enable trigger bb_payments_guard;
      perform pg_temp.bbg_fail('G5 bb_payments_makeup alone let a ' || v_txt || ' through', null);
    exception when check_violation then
      get stacked diagnostics v_txt2 = constraint_name;
      if v_txt2 <> 'bb_payments_makeup' then
        alter table public.bb_payments enable trigger bb_payments_guard;
        perform pg_temp.bbg_fail('G5 a make-up ' || v_txt || ' must be refused by bb_payments_makeup', v_txt2);
      end if;
    end;
  end loop;
  alter table public.bb_payments enable trigger bb_payments_guard;
  if (select tgenabled from pg_trigger where tgrelid = 'public.bb_payments'::regclass and tgname = 'bb_payments_guard') <> 'O' then
    perform pg_temp.bbg_fail('G5 bb_payments_guard must be enabled again', null);
  end if;
  -- the reference unique index ignores make-ups, the one-active index doesn't (the race)
  perform set_config('tkd.action', 'bb_add_makeup', true);
  begin
    insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                      cycle_plan_id, kukkiwon, source, reference, makeup_of_candidate_id, makeup_of_cycle_name,
                                      created_by_name, updated_by_name)
    select v_wi, c.first_name, c.last_name, c.date_of_birth, c.email_for_results, c.location_code, c.dan, null, false, 'makeup',
           c.reference, c.id, v_tag || ' Spring', '', ''
      from public.bb_candidates c where c.id = v_mia;
    perform pg_temp.bbg_fail('G7 a second active make-up row was stored (the race)', null);
  exception when unique_violation then
    get stacked diagnostics v_txt2 = constraint_name;
    if v_txt2 <> 'bb_candidates_one_active_makeup_idx' then perform pg_temp.bbg_fail('G7 the race index', v_txt2); end if;
  end;
  perform set_config('tkd.action', '', true);
  -- roster and detail list the make-up (plan null, the four new keys)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_cycle_roster(v_fa);
  v_x := pg_temp.bbg_row(v_r, v_mu);
  if v_x is null or v_x -> 'plan_id' <> 'null' or v_x -> 'plan_name' <> 'null' or not (v_x ->> 'is_makeup')::boolean
     or v_x ->> 'makeup_of_cycle_name' <> v_tag || ' Spring' or v_x -> 'retest_names' <> '["Free sparring"]'
     or not (v_x ->> 'has_grades')::boolean then
    perform pg_temp.bbg_fail('G7b the roster lists the make-up', v_x::text);
  end if;
  v_r := public.bb_candidate_detail(v_mu);
  if v_r -> 'candidate' -> 'plan' <> 'null' or not (v_r -> 'candidate' ->> 'is_makeup')::boolean
     or v_r -> 'candidate' ? 'makeup_of_candidate_id' or v_r -> 'candidate' ? 'age_kept'
     or v_r -> 'candidate' -> 'retest_names' <> '["Free sparring"]' or (v_r ->> 'needs_parent_signature')::boolean
     or position(v_mia::text in v_r::text) > 0 then
    perform pg_temp.bbg_fail('G7b the detail of a make-up row', left(v_r::text, 300));
  end if;
  v_r := public.bb_candidate_detail(v_alex);
  if pg_temp.bbg_keys(v_r -> 'candidate') @> array['age_kept'] or not (pg_temp.bbg_keys(v_r -> 'candidate')
       @> array['has_grades', 'is_makeup', 'makeup_of_cycle_name', 'retest_names'])
     or v_r -> 'candidate' -> 'plan' ->> 'name' <> 'In full' then
    perform pg_temp.bbg_fail('G3 the detail''s candidate keys', left(v_r::text, 300));
  end if;

  -- G7c. Zoe: an admin chooses her subjects (G 21-23), then she can be added
  if public.bb_set_makeup_subjects(v_zoe, '{}', array[v_s_kor]) is distinct from '{"status": "not_allowed"}'::jsonb then
    perform pg_temp.bbg_fail('G1 the desk chooses subjects -> not_allowed', null);
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_zoe_ids := array[v_s_power, v_s_mile, v_s_kor, v_s_tkd];
  if public.bb_set_makeup_subjects(null, '{}', v_zoe_ids) ->> 'status' <> 'invalid'
     or public.bb_set_makeup_subjects(v_zoe, '{}', '{}') ->> 'status' <> 'invalid'
     or public.bb_set_makeup_subjects(v_zoe, '{}', array[array[v_s_kor]]) ->> 'status' <> 'invalid'
     or public.bb_set_makeup_subjects(v_zoe, '{}', array[v_s_kor, null]) ->> 'status' <> 'invalid'
     or public.bb_set_makeup_subjects(v_zoe, '{}', array[v_s_kor, v_s_kor]) ->> 'status' <> 'invalid'
     or public.bb_set_makeup_subjects(v_zoe, '{}', array['BADID!!!']) ->> 'status' <> 'invalid'
     or public.bb_set_makeup_subjects(v_zoe, '{}', array(select lpad(x::text, 8, 'a') from generate_series(1, 121) as x)) ->> 'status' <> 'invalid'
     or public.bb_set_makeup_subjects(v_rand, '{}', array[v_s_kor]) ->> 'status' <> 'not_found'
     or public.bb_set_makeup_subjects(v_zoe, array[v_s_kor], array[v_s_kor]) ->> 'status' <> 'stale'
     or public.bb_set_makeup_subjects(v_alex, '{}', array[v_s_kor]) ->> 'status' <> 'invalid'    -- Passed
     or public.bb_set_makeup_subjects(v_mia, '{}', array[v_s_kor]) ->> 'status' <> 'already_added' -- her make-up is on Fall
     or public.bb_set_makeup_subjects(v_rina, '{}', array[v_s_kor]) ->> 'status' <> 'invalid'   -- a D
     or public.bb_set_makeup_subjects(v_wd, '{}', array[v_s_kor]) ->> 'status' <> 'withdrawn'
     or public.bb_set_makeup_subjects(v_zoe, '{}', array[v_s_one]) ->> 'status' <> 'invalid' then  -- not for 16
    perform pg_temp.bbg_fail('G4 Choose subjects refusals', null);
  end if;
  v_r := public.bb_set_makeup_subjects(v_zoe, '{}', v_zoe_ids);
  if v_r ->> 'status' <> 'ok' or v_r -> 'ids' <> to_jsonb(array[v_s_mile, v_s_kor, v_s_tkd, v_s_power])
     or (v_r -> 'result' ->> 'choice_needed')::boolean or v_r -> 'result' -> 'needs' <> to_jsonb(array[v_s_mile, v_s_kor, v_s_tkd, v_s_power])
     or v_r -> 'result' ->> 'result_key' <> md5('makeup|below|263|' || array_to_string(array[v_s_mile, v_s_kor, v_s_tkd, v_s_power], ',')) then
    perform pg_temp.bbg_fail('G7c Choose subjects (ids in rubric order)', v_r::text);
  end if;
  -- the same set again (as a set) is fine; a smaller set removes the others
  v_r := public.bb_set_makeup_subjects(v_zoe, array[v_s_tkd, v_s_kor, v_s_power, v_s_mile], v_zoe_ids);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G7c the same set again', v_r::text); end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_makeup(v_fa, v_zoe);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'retest_count')::integer <> 4 or (v_r ->> 'kept_count')::integer <> 21 then
    perform pg_temp.bbg_fail('G7c Zoe added after the choice: 4 retests, 21 kept', v_r::text);
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.bb_set_makeup_subjects(v_zoe, array[v_s_tkd, v_s_kor, v_s_power, v_s_mile], array[v_s_kor]) ->> 'status' <> 'already_added' then
    perform pg_temp.bbg_fail('G7c Choose subjects on an earlier row whose make-up exists -> already_added', null);
  end if;

  -- G7d. Teen (Q-G6 B): a Make-up with a D that isn't complete may be
  --      added; the subject not graded yet is a retest; a DOB fix into 18
  --      and over makes One Step Sparring gradable (S11)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_makeup(v_fa, v_teen);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G7d Teen added (incomplete D)', v_r::text); end if;
  v_mu3 := (v_r ->> 'id')::uuid;
  if (select array_agg(subject_id order by subject_id) from public.bb_makeup_subjects where candidate_id = v_mu3 and kind = 'retest')
     <> (select array_agg(x order by x) from unnest(array[v_s_fs, v_s_proj]) as x) then
    perform pg_temp.bbg_fail('G7d the D and the subject not graded yet are retests', null);
  end if;
  v_x := (select s.e from jsonb_array_elements(public.bb_candidate_result(v_mu3) -> 'subjects') as s(e) where s.e ->> 'id' = v_s_one);
  if (v_x ->> 'applies')::boolean or (v_x ->> 'gradable')::boolean then
    perform pg_temp.bbg_fail('G7d One Step Sparring is not for 17', v_x::text);
  end if;
  v_r := public.bb_update_candidate(v_mu3, (select version from public.bb_candidates where id = v_mu3), 'Teen', 'Testteen',
                                    pg_temp.bbg_dob(v_fa_first, 18), v_mail || '.teen@example.com', 'worcester', 1);
  v_x := (select s.e from jsonb_array_elements(public.bb_candidate_result(v_mu3) -> 'subjects') as s(e) where s.e ->> 'id' = v_s_one);
  if v_r ->> 'status' <> 'ok' or not (v_x ->> 'applies')::boolean or not (v_x ->> 'gradable')::boolean or (v_x ->> 'retest')::boolean
     or public.bb_set_grade(v_mu3, 1, v_s_one, 'A') ->> 'status' <> 'ok' then
    perform pg_temp.bbg_fail('G6/G7d a DOB fix into 18 and over makes One Step Sparring gradable', v_x::text);
  end if;
  v_r := public.bb_set_grade(v_mu3, 1, v_s_one, null);
  -- its Undo works with only kept rows, retest rows and a send (written
  -- directly: a make-up with retests left can't be marked through the app)
  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.action', 'bb_mark_result_sent', true);
  insert into public.bb_result_sends (candidate_id, marked_by_name, result_status, result_total, result_needs, result_key)
  values (v_mu3, '', 'makeup', 1, '[]', md5('x'))
  returning id into v_send;
  v_hand_sends := v_hand_sends || v_send;
  perform set_config('tkd.action', '', true);
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_delete_candidate(v_mu3, (select version from public.bb_candidates where id = v_mu3));
  if v_r is distinct from '{"status": "ok"}'::jsonb or exists (select 1 from public.bb_result_sends where candidate_id = v_mu3) then
    perform pg_temp.bbg_fail('G7d Undo of the make-up with kept rows and a send', v_r::text);
  end if;

  -- G7e. Restore of a withdrawn make-up while another is active -> already_added
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_makeup(v_fa, v_teen);
  v_mu3 := (v_r ->> 'id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_withdraw_candidate(v_mu3, (select version from public.bb_candidates where id = v_mu3));
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_makeup(v_wi, v_teen);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G7e Teen into Winter while the Fall make-up is withdrawn', v_r::text); end if;
  v_mu2 := (v_r ->> 'id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_restore_candidate(v_mu3, (select version from public.bb_candidates where id = v_mu3));
  if v_r is distinct from '{"status": "already_added"}'::jsonb then
    perform pg_temp.bbg_fail('G7e Restore of a withdrawn make-up while another is active', v_r::text);
  end if;
  -- the picker: Teen is no longer listed for Fall (an active make-up in
  -- another cycle); Rina is, with her preview
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_makeup_list(v_fa);
  if pg_temp.bbg_keys(v_r) <> array['rows', 'status'] or pg_temp.bbg_row(v_r, v_teen) is not null
     or pg_temp.bbg_row(v_r, v_alex) is not null or pg_temp.bbg_row(v_r, v_lucas) is not null then
    perform pg_temp.bbg_fail('G7e the picker lists only make-ups without an active make-up elsewhere', left(v_r::text, 300));
  end if;
  v_x := pg_temp.bbg_row(v_r, v_rina);
  if v_x is null
     or pg_temp.bbg_keys(v_x) <> array['age_group', 'already_added', 'choice_needed', 'complete', 'cycle_first_day', 'cycle_id',
                                        'cycle_name', 'd_subjects', 'dan', 'first_name', 'id', 'last_name', 'location_code', 'needs',
                                        'preview', 'reasons']
     or pg_temp.bbg_keys(v_x -> 'preview') <> array['dropped', 'dropped_extra', 'kept', 'kept_extra', 'new', 'retest']
     or v_x -> 'needs' <> '["1/2 or 1 mile"]' or v_x -> 'd_subjects' <> '["1/2 or 1 mile"]'
     or v_x -> 'preview' -> 'retest' <> '["1/2 or 1 mile"]' or jsonb_array_length(v_x -> 'preview' -> 'kept') <> 25
     or v_x -> 'preview' -> 'kept_extra' <> '["Attendance (classes)"]' or (v_x ->> 'already_added')::boolean
     or v_x -> 'age_group' <> '{"from": 18, "to": null}' then
    perform pg_temp.bbg_fail('G7e the picker row for Rina', v_x::text);
  end if;
  -- Mia's own row: already added on THIS cycle
  if not (pg_temp.bbg_row(v_r, v_mia) ->> 'already_added')::boolean then
    perform pg_temp.bbg_fail('G7e the picker marks Mia "already added" on Fall', null);
  end if;

  -- G7f (S1). A make-up whose D subject isn't in the later rubric: Dee (D in
  -- the mile, below the mark) into Autumn, whose 1st Dan has no mile. No
  -- retest is left and the kept grades alone (252.5) are below 293: her
  -- make-up row is itself a Make-up (choice needed), and the picker of an
  -- even later cycle must list it.
  v_r := public.bb_add_makeup(v_aut, v_dee);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'retest_count')::integer <> 0 or (v_r ->> 'kept_count')::integer <> 25 then
    perform pg_temp.bbg_fail('G7f Dee into Autumn (no mile): 25 kept, nothing to retest', v_r::text);
  end if;
  v_deemu := (v_r ->> 'id')::uuid;
  v_x := public.bb_candidate_result(v_deemu);
  if v_x ->> 'status' <> 'makeup' or v_x -> 'reasons' <> '["below"]' or not (v_x ->> 'complete')::boolean
     or not (v_x ->> 'choice_needed')::boolean or (v_x ->> 'total')::numeric <> 252.5 then
    perform pg_temp.bbg_fail('G7f Dee''s make-up row: complete, below the mark, choice needed', v_x::text);
  end if;
  v_x := pg_temp.bbg_row(public.bb_makeup_list(v_lat), v_deemu);
  if v_x is null or not (v_x ->> 'choice_needed')::boolean or v_x ->> 'cycle_name' <> v_tag || ' Autumn'
     or pg_temp.bbg_row(public.bb_makeup_list(v_lat), v_dee) is not null then
    perform pg_temp.bbg_fail('G7f the later picker lists the make-up row with nothing typed on it (and not Dee''s first row)', v_x::text);
  end if;


  -- ===================================================================
  -- G4. The refusals of the three grade writes, in their order
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_list := array[
    -- 3. the input
    format('public.bb_set_grade(null, 1, %L, %L)', v_s_fs, 'A'),
    format('public.bb_set_grade(%L, 5, %L, %L)', v_alex, v_s_fs, 'A'),
    format('public.bb_set_grade(%L, 1, %L, %L)', v_alex, 'NOT-AN-ID', 'A'),
    format('public.bb_set_measured(%L, 1, %L, 8.21667, 0)', v_alex, v_s_mile),        -- 5 decimals
    format('public.bb_set_measured(%L, 1, %L, ''NaN''::numeric, 0)', v_alex, v_s_mile),
    format('public.bb_set_measured(%L, 1, %L, 1000, 0)', v_alex, v_s_mile),
    format('public.bb_set_measured(%L, 1, %L, -1, 0)', v_alex, v_s_mile),
    format('public.bb_set_measured(%L, 1, %L, 8, 2)', v_alex, v_s_pull),              -- way 2
    format('public.bb_set_measured(%L, 1, %L, 8, null)', v_alex, v_s_pull),
    format('public.bb_set_extra_count(%L, 1, %L, 10000)', v_alex, 'Extra stripes'),
    format('public.bb_set_extra_count(%L, 1, %L, -1)', v_alex, 'Extra stripes'),
    -- 6. the data
    format('public.bb_set_grade(%L, 1, %L, %L)', v_alex, v_s_fs, 'E'),                -- not a letter
    format('public.bb_set_grade(%L, 1, %L, %L)', v_alex, v_s_stretch, 'A'),           -- a measured subject
    format('public.bb_set_grade(%L, 1, %L, %L)', v_alex, 'zzzzzzzz', 'A'),            -- not in the copy
    format('public.bb_set_grade(%L, 1, %L, %L)', v_alex, v_s_one, 'A'),               -- not for 13-17
    format('public.bb_set_grade(%L, 1, %L, %L)', v_nage, v_s_fs, 'A'),                -- no age
    format('public.bb_set_measured(%L, 1, %L, 8, 1)', v_alex, v_s_stretch),           -- way 1 on a one-way subject
    format('public.bb_set_measured(%L, 1, %L, 8, 0)', v_alex, v_s_fs),                -- a graded subject
    format('public.bb_set_measured(%L, 1, %L, 8, 0)', v_alex, v_s_one),
    format('public.bb_set_extra_count(%L, 1, %L, 3)', v_alex, 'No such item'),
    format('public.bb_set_extra_count(%L, 1, %L, 3)', v_alex, 'extra stripes')];      -- the exact name only
  foreach v_txt in array v_list loop
    execute 'select ' || v_txt into v_r;
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      perform pg_temp.bbg_fail('G4 expected invalid from ' || v_txt, v_r::text);
    end if;
  end loop;
  if public.bb_set_grade(v_rand, 1, v_s_fs, 'A') is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_set_measured(v_rand, 1, v_s_mile, 8, 0) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_set_extra_count(v_rand, 1, 'Extra stripes', 1) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_set_grade(v_wd, 1, v_s_fs, 'A') is distinct from '{"status": "withdrawn"}'::jsonb
     or public.bb_set_measured(v_wd, 1, v_s_mile, 8, 0) is distinct from '{"status": "withdrawn"}'::jsonb
     or public.bb_set_extra_count(v_wd, 1, 'Extra stripes', 1) is distinct from '{"status": "withdrawn"}'::jsonb
     or public.bb_set_grade(v_alex, 2, v_s2_fs, 'A') is distinct from '{"status": "stale"}'::jsonb
     or public.bb_set_measured(v_alex, 2, v_s_mile, 8, 0) is distinct from '{"status": "stale"}'::jsonb
     or public.bb_set_extra_count(v_alex, 2, 'Extra stripes', 1) is distinct from '{"status": "stale"}'::jsonb then
    perform pg_temp.bbg_fail('G4 not_found / withdrawn / stale Dan', null);
  end if;
  -- the counts need no age; the same value writes nothing; Clear removes the row
  v_r := public.bb_set_extra_count(v_nage, 1, 'Extra stripes', 2);
  if v_r ->> 'status' <> 'ok' or pg_temp.bbg_keys(v_r) <> array['count', 'result', 'status'] then
    perform pg_temp.bbg_fail('G4 a count without an age', v_r::text);
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_set_grade(v_alex, 1, v_s_fs, 'A-');
  v_r2 := public.bb_set_measured(v_alex, 1, v_s_mile, 8.6667, 0);
  if v_r ->> 'status' <> 'ok' or pg_temp.bbg_keys(v_r) <> array['letter', 'result', 'status']
     or v_r2 ->> 'status' <> 'ok' or pg_temp.bbg_keys(v_r2) <> array['result', 'status', 'value', 'way']
     or exists (select 1 from public.change_log where id > v_mark) then
    perform pg_temp.bbg_fail('G4 the same value again writes nothing', v_r::text || v_r2::text);
  end if;
  -- switching the way keeps the number and works the grade out again (G 5): 8 as Hold = D
  v_r := public.bb_set_measured(v_alex, 1, v_s_pull, 8, 1);
  if v_r ->> 'status' <> 'ok' or v_r -> 'result' ->> 'status' <> 'makeup' or v_r -> 'result' -> 'd_subjects' <> to_jsonb(array[v_s_pull]) then
    perform pg_temp.bbg_fail('G4 the way switch works the grade out again', v_r::text);
  end if;
  v_r := public.bb_set_measured(v_alex, 1, v_s_pull, 8, 0);
  v_r := public.bb_set_grade(v_alex, 1, v_s_fs, null);
  if v_r ->> 'status' <> 'ok' or v_r -> 'letter' <> 'null'
     or exists (select 1 from public.bb_grades where candidate_id = v_alex and subject_id = v_s_fs)
     or v_r -> 'result' ->> 'status' <> 'not_finished' then
    perform pg_temp.bbg_fail('G4 Clear removes the grade row', v_r::text);
  end if;
  v_r := public.bb_set_grade(v_alex, 1, v_s_fs, 'A-');
  if v_r -> 'result' ->> 'result_key' <> v_alex_k then
    perform pg_temp.bbg_fail('G4 Alex back to 305.75', v_r::text);
  end if;
  -- the 4-decimal number is kept exactly: 8:13 = 8.2167
  v_r := public.bb_set_measured(v_lucas, 1, v_s_mile, 8.2167, 0);
  if (select measured from public.bb_grades where candidate_id = v_lucas and subject_id = v_s_mile) <> 8.2167 then
    perform pg_temp.bbg_fail('G4 the number is stored with its 4 decimals', null);
  end if;
  v_r := public.bb_set_measured(v_lucas, 1, v_s_mile, 5.7, 0);


  -- ===================================================================
  -- G5. The guards (direct writes as the SQL Editor's role, with a tag
  --     set, that skip the functions)
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.action', 'bb_set_grade', true);
  v_list := array[
    format('insert into public.bb_grades (candidate_id, dan, part_code, subject_id, letter, created_by_name, updated_by_name) values (%L, 2, %L, %L, %L, %L, %L)',
           v_lucas, 'technical', v_s2_fs, 'A', '', ''),                                        -- wrong Dan
    format('insert into public.bb_grades (candidate_id, dan, part_code, subject_id, letter, created_by_name, updated_by_name) values (%L, 1, %L, %L, %L, %L, %L)',
           v_lucas, 'technical', 'zzzzzzzz', 'A', '', ''),                                     -- unknown subject
    format('insert into public.bb_grades (candidate_id, dan, part_code, subject_id, letter, created_by_name, updated_by_name) values (%L, 1, %L, %L, %L, %L, %L)',
           v_lucas, 'curriculum', v_s_ref, 'A', '', ''),                                       -- the subject's part is technical
    format('update public.bb_grades set letter = null, measured = 7, way = 0 where candidate_id = %L and subject_id = %L', v_lucas, v_s_ref),  -- a number on a graded subject
    format('update public.bb_grades set letter = %L where candidate_id = %L and subject_id = %L', 'A', v_mu, v_s_kor),                      -- a kept row changed
    format('delete from public.bb_grades where candidate_id = %L and subject_id = %L', v_mu, v_s_kor)];                                     -- a kept row removed by "Clear"
  foreach v_txt in array v_list loop
    begin
      execute v_txt;
      perform pg_temp.bbg_fail('G5 the grade guard let this through: ' || v_txt, null);
    exception when check_violation then
      get stacked diagnostics v_txt2 = constraint_name;
      if v_txt2 <> 'bb_grades_rules' then perform pg_temp.bbg_fail('G5 grade guard constraint for ' || v_txt, v_txt2); end if;
    end;
  end loop;
  -- an unrelated tag can't remove a grade; a kept D is never stored
  perform set_config('tkd.action', 'bb_update_cycle', true);
  begin
    delete from public.bb_grades where candidate_id = v_lucas and subject_id = v_s_ref;
    perform pg_temp.bbg_fail('G5 a grade removed under another tag', null);
  exception when check_violation then null;
  end;
  perform set_config('tkd.action', 'bb_add_makeup', true);
  begin
    insert into public.bb_grades (candidate_id, dan, part_code, subject_id, letter, kept, kept_from_cycle_name, created_by_name, updated_by_name)
    values (v_mu, 1, 'technical', v_s_tkd, 'D', true, 'zz', '', '');
    perform pg_temp.bbg_fail('G5 a kept D was stored', null);
  exception when check_violation then null;
  end;
  -- counts and make-up subjects
  perform set_config('tkd.action', 'bb_set_extra_count', true);
  foreach v_txt in array array[
    format('insert into public.bb_extra_counts (candidate_id, dan, item_name, count, created_by_name, updated_by_name) values (%L, 1, %L, 1, %L, %L)', v_lucas, 'No such item', '', ''),
    format('insert into public.bb_extra_counts (candidate_id, dan, item_name, count, created_by_name, updated_by_name) values (%L, 2, %L, 1, %L, %L)', v_lucas, 'Extra stripes', '', ''),
    format('update public.bb_extra_counts set count = 9 where candidate_id = %L and item_name = %L', v_mu, 'Extra stripes')] loop
    begin
      execute v_txt;
      perform pg_temp.bbg_fail('G5 the count guard let this through: ' || v_txt, null);
    exception when check_violation then
      get stacked diagnostics v_txt2 = constraint_name;
      if v_txt2 <> 'bb_extra_counts_rules' then perform pg_temp.bbg_fail('G5 count guard constraint', v_txt2); end if;
    end;
  end loop;
  perform set_config('tkd.action', 'bb_set_makeup_subjects', true);
  foreach v_txt in array array[
    format('insert into public.bb_makeup_subjects (candidate_id, dan, subject_id, kind, created_by_name, updated_by_name) values (%L, 1, %L, %L, %L, %L)', v_lucas, v_s_kor, 'retest', '', ''),
    format('insert into public.bb_makeup_subjects (candidate_id, dan, subject_id, kind, created_by_name, updated_by_name) values (%L, 1, %L, %L, %L, %L)', v_lucas, 'zzzzzzzz', 'chosen', '', ''),
    format('update public.bb_makeup_subjects set dan = 1 where candidate_id = %L', v_zoe),
    format('delete from public.bb_makeup_subjects where candidate_id = %L and kind = %L', v_mu, 'retest')] loop
    begin
      execute v_txt;
      perform pg_temp.bbg_fail('G5 the make-up subjects guard let this through: ' || v_txt, null);
    exception when check_violation then
      get stacked diagnostics v_txt2 = constraint_name;
      if v_txt2 <> 'bb_makeup_subjects_rules' then perform pg_temp.bbg_fail('G5 make-up subjects guard constraint', v_txt2); end if;
    end;
  end loop;
  -- a cascade of a REAL grade is refused (Delete permanently with the check skipped)
  perform set_config('tkd.action', 'bb_delete_candidate', true);
  begin
    delete from public.bb_candidates where id = v_lucas;
    perform pg_temp.bbg_fail('G5/G10 a cascade removed real grades', null);
  exception when check_violation then
    get stacked diagnostics v_txt2 = constraint_name;
    if v_txt2 not in ('bb_grades_rules', 'bb_extra_counts_rules') then perform pg_temp.bbg_fail('G10 cascade guard', v_txt2); end if;
  end;
  -- a send: the name is stamped (never what the writer sent); a download
  -- row is never changed or removed
  perform set_config('tkd.action', 'bb_mark_result_sent', true);
  insert into public.bb_result_sends (candidate_id, marked_by_name, result_status, result_total, result_needs, result_key,
                                      undone_at, undone_by_name)
  values (v_lucas, 'Faked Name', 'passed', 1, '[]', md5('zz'), now(), 'Faked Too')
  returning id into v_send;
  v_hand_sends := v_hand_sends || v_send;
  if (select marked_by_name from public.bb_result_sends where id = v_send) = 'Faked Name'
     or (select undone_at from public.bb_result_sends where id = v_send) is not null then
    perform pg_temp.bbg_fail('G5 a send keeps the writer''s name or undone time', null);
  end if;
  perform set_config('tkd.action', 'bb_undo_result_sent', true);
  update public.bb_result_sends set undone_at = now(), undone_by_name = 'x' where id = v_send;
  foreach v_txt in array array[
    format('update public.bb_result_sends set undone_at = now(), undone_by_name = %L where id = %L', 'again', v_send),   -- twice
    format('update public.bb_result_sends set result_key = %L where id = %L', md5('other'), v_send)] loop
    begin
      execute v_txt;
      perform pg_temp.bbg_fail('G5 a send changed: ' || v_txt, null);
    exception when check_violation then
      get stacked diagnostics v_txt2 = constraint_name;
      if v_txt2 <> 'bb_result_sends_immutable' then perform pg_temp.bbg_fail('G5 send guard constraint', v_txt2); end if;
    end;
  end loop;
  perform set_config('tkd.action', '', true);
  delete from public.bb_result_sends where id = v_send;   -- a hand fix may
  perform set_config('tkd.action', 'bb_results_csv', true);
  insert into public.bb_downloads (cycle_id, cycle_name, row_count, downloaded_by_name) values (v_sp, 'zz', 1, 'Faked')
  returning id into v_send;
  if (select downloaded_by_name from public.bb_downloads where id = v_send) = 'Faked' then
    perform pg_temp.bbg_fail('G5 a download row keeps the writer''s name', null);
  end if;
  foreach v_txt in array array['', 'bb_results_csv'] loop
    perform set_config('tkd.action', v_txt, true);
    begin
      update public.bb_downloads set row_count = 2 where id = v_send;
      perform pg_temp.bbg_fail('G5 a download row was changed', null);
    exception when check_violation then null;
    end;
    begin
      delete from public.bb_downloads where id = v_send;
      perform pg_temp.bbg_fail('G5 a download row was removed', null);
    exception when check_violation then null;
    end;
  end loop;
  perform set_config('tkd.action', '', true);
  begin
    insert into public.bb_downloads (cycle_id, cycle_name, row_count, downloaded_by_name) values (v_sp, 'zz', 1, '');
    perform pg_temp.bbg_fail('G5 a download row written without the CSV', null);
  exception when check_violation then null;
  end;
  -- a make-up row is added only by Add make-up, for the same person
  perform set_config('tkd.action', 'bb_add_candidate', true);
  begin
    insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                      cycle_plan_id, kukkiwon, source, reference, makeup_of_candidate_id, makeup_of_cycle_name,
                                      created_by_name, updated_by_name)
    select v_wi, c.first_name, c.last_name, c.date_of_birth, c.email_for_results, c.location_code, c.dan, null, false, 'makeup',
           c.reference, c.id, 'zz', '', ''
      from public.bb_candidates c where c.id = v_rina;
    perform pg_temp.bbg_fail('G5 a make-up row written outside Add make-up', null);
  exception when check_violation then
    get stacked diagnostics v_txt2 = constraint_name;
    if v_txt2 <> 'bb_candidates_makeup_reference' then perform pg_temp.bbg_fail('G5 make-up insert rule', v_txt2); end if;
  end;
  perform set_config('tkd.action', 'bb_update_candidate', true);
  foreach v_txt in array array[
    format('update public.bb_candidates set makeup_of_candidate_id = %L where id = %L', v_rina, v_mu),
    format('update public.bb_candidates set dan = 2 where id = %L', v_mu)] loop
    begin
      execute v_txt;
      perform pg_temp.bbg_fail('G5 a make-up row changed: ' || v_txt, null);
    exception when check_violation then null;
    end;
  end loop;
  perform set_config('tkd.action', '', true);


  -- ===================================================================
  -- G9. Edit cycle with grades (S2). CD: Physical today - 7 (graded),
  --     Technical today (graded), Curriculum today + 7 (graded)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_snap := (select string_agg(to_jsonb(d)::text || coalesce((select string_agg(p.part, ',' order by p.part) from public.bb_cycle_day_parts p
                                                              where p.day_id = d.id), ''), ';' order by d.id)
               from public.bb_cycle_days d where d.cycle_id = v_cd);
  v_x := pg_temp.bbg_current(v_cd);
  v_v := (select version from public.bb_cycles where id = v_cd);
  v_list := array[
    -- the past Technical day removed (Technical moved to the Curriculum day)
    (jsonb_set(v_x, '{days}', jsonb_build_array(v_x -> 'days' -> 0, jsonb_set(v_x -> 'days' -> 2, '{parts}', '["curriculum", "technical"]'))))::text,
    -- the past Technical day moved
    (jsonb_set(v_x, '{days,1,day_date}', to_jsonb(v_today + 1)))::text,
    -- Technical unticked from the past day (and put on the Curriculum day)
    (jsonb_set(jsonb_set(v_x, '{days,1,parts}', '["technical"]'), '{days,2,parts}', '["curriculum", "technical"]'))::text,
    -- the first (past, graded) day moved
    (jsonb_set(v_x, '{days,0,day_date}', to_jsonb(v_today + 2)))::text];
  -- (the third payload needs another part left on the Technical day: give it Physical too, then untick Technical)
  v_list[3] := (jsonb_set(jsonb_set(v_x, '{days,1,parts}', '["physical"]'), '{days,2,parts}', '["curriculum", "technical"]'))::text;
  foreach v_txt in array v_list loop
    v_r := public.bb_update_cycle(v_cd, v_v, v_txt::jsonb);
    if v_r is distinct from '{"status": "has_grades"}'::jsonb then
      perform pg_temp.bbg_fail('G9 Edit cycle with a protected day -> has_grades', v_r::text || ' for ' || left(v_txt, 300));
    end if;
  end loop;
  if v_snap is distinct from (select string_agg(to_jsonb(d)::text || coalesce((select string_agg(p.part, ',' order by p.part)
                                                                                from public.bb_cycle_day_parts p where p.day_id = d.id), ''), ';' order by d.id)
                                from public.bb_cycle_days d where d.cycle_id = v_cd)
     or (select version from public.bb_cycles where id = v_cd) <> v_v then
    perform pg_temp.bbg_fail('G9 a refused Edit cycle changed something', null);
  end if;
  -- a future, not-first day with grades can move
  v_r := public.bb_update_cycle(v_cd, v_v, jsonb_set(v_x, '{days,2,day_date}', to_jsonb(v_today + 8)));
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G9 a future graded day can move', v_r::text); end if;
  v_r := public.bb_cycle_grading_state(v_cd);
  if v_r -> 'parts_with_grades' <> '["physical", "technical", "curriculum"]' or not (v_r ->> 'first_day_frozen')::boolean
     or (v_r ->> 'first_day')::date <> v_today - 7
     or (select array_agg((d.e ->> 'day_date')::date order by d.e ->> 'day_date') from jsonb_array_elements(v_r -> 'protected_days') as d(e))
        <> array[v_today - 7, v_today]
     or (select count(*) from jsonb_array_elements(v_r -> 'protected_days') as d(e) where pg_temp.bbg_keys(d.e) <> array['day_date', 'id', 'parts']) > 0 then
    perform pg_temp.bbg_fail('G9 bb_cycle_grading_state of CD', v_r::text);
  end if;
  -- the first-day freeze on a future cycle with grading rows (Fall: its make-ups)
  v_x := pg_temp.bbg_current(v_fa);
  v_v := (select version from public.bb_cycles where id = v_fa);
  v_list := array[
    -- a new day before the first day
    (jsonb_set(v_x, '{days}', (v_x -> 'days') || jsonb_build_array(jsonb_build_object(
       'name', 'Extra', 'day_date', v_fa_first - 3, 'start_time', '12:30', 'end_time', '14:00',
       'place', jsonb_build_object('code', 'worcester'), 'second', null, 'parts', '["physical"]'::jsonb))))::text,
    -- the first day moved
    (jsonb_set(v_x, '{days,0,day_date}', to_jsonb(v_fa_first + 1)))::text,
    -- the first day removed (Physical moved to the Technical day)
    (jsonb_set(v_x, '{days}', jsonb_build_array(jsonb_set(v_x -> 'days' -> 1, '{parts}', '["physical", "technical"]'), v_x -> 'days' -> 2)))::text];
  foreach v_txt in array v_list loop
    v_r := public.bb_update_cycle(v_fa, v_v, v_txt::jsonb);
    if v_r is distinct from '{"status": "has_grades"}'::jsonb then
      perform pg_temp.bbg_fail('G9 the first-day freeze -> has_grades', v_r::text || ' for ' || left(v_txt, 400));
    end if;
  end loop;
  -- (a later day may still move)
  v_r := public.bb_update_cycle(v_fa, v_v, jsonb_set(v_x, '{days,2,day_date}', to_jsonb(v_fa_first + 15)));
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G9 a later Fall day can move', v_r::text); end if;


  -- ===================================================================
  -- G10. Delete permanently / Delete cycle with grades (Q-G3)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.bb_delete_candidate(v_alex, (select version from public.bb_candidates where id = v_alex)) is distinct from '{"status": "has_grades"}'::jsonb
     or public.bb_delete_candidate(v_dk, (select version from public.bb_candidates where id = v_dk)) is distinct from '{"status": "has_grades"}'::jsonb
     or public.bb_delete_candidate((select id from public.bb_candidates where cycle_id = v_del and first_name = 'Chad'),
                                   (select version from public.bb_candidates where cycle_id = v_del and first_name = 'Chad'))
        is distinct from '{"status": "has_grades"}'::jsonb
     or public.bb_delete_cycle(v_del, (select version from public.bb_cycles where id = v_del), 2) is distinct from '{"status": "has_grades"}'::jsonb
     or public.bb_delete_cycle(v_sp, (select version from public.bb_cycles where id = v_sp),
                               (select count(*)::integer from public.bb_candidates where cycle_id = v_sp)) ->> 'status' <> 'has_payments' then
    perform pg_temp.bbg_fail('G10 Delete permanently / Delete cycle with a grade, a count or a chosen subject -> has_grades', null);
  end if;
  -- the roster grays Delete permanently from has_grades
  if not (pg_temp.bbg_row(public.bb_cycle_roster(v_del), v_dk) ->> 'has_grades')::boolean
     or (pg_temp.bbg_row(public.bb_cycle_roster(v_fa), v_mu2) is not null) then
    perform pg_temp.bbg_fail('G10 the roster''s has_grades', null);
  end if;
  -- Delete cycle with only make-up rows (kept + retest): allowed, and its
  -- grading mark goes with it. Summer gets Olga's make-up first.
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_makeup(v_bad[1]::uuid, v_olga);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G10 Olga into Summer', v_r::text); end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_delete_cycle(v_bad[1]::uuid, (select version from public.bb_cycles where id = v_bad[1]::uuid), 1);
  if v_r is distinct from '{"status": "ok"}'::jsonb or exists (select 1 from public.bb_cycle_grading_started where cycle_id = v_bad[1]::uuid) then
    perform pg_temp.bbg_fail('G10/G8 Delete cycle with only make-up rows; its grading mark goes with it', v_r::text);
  end if;


  -- ===================================================================
  -- G11. The Dan change that clears grades (Q-G4). Zed: Zoe's sheet,
  --      two chosen subjects, a send
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_set_makeup_subjects(v_dup, '{}', array[v_s_kor, v_s_tkd]);
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_key := public.bb_candidate_result(v_dup) ->> 'result_key';
  v_r := public.bb_mark_result_sent(v_dup, v_key);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G12 a complete below result with chosen subjects can be marked', v_r::text); end if;
  v_v := (select version from public.bb_candidates where id = v_dup);
  v_n := (select count(*) from public.bb_extra_counts where candidate_id = v_dup);
  execute v_snap_sql into v_snap;
  v_r := public.bb_update_candidate(v_dup, v_v, 'Zed', 'Dantest', pg_temp.bbg_dob(v_sp_first, 16), v_mail || '.zed@example.com', 'worcester', 2);
  if v_r is distinct from jsonb_build_object('status', 'has_grades', 'grade_count', 25, 'count_count', v_n, 'chosen_count', 2) then
    perform pg_temp.bbg_fail('G11 a Dan change with grades -> has_grades with the counts', v_r::text);
  end if;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then perform pg_temp.bbg_fail('G11 the refused Dan change wrote something', null); end if;
  v_r := public.bb_update_candidate_clear(v_dup, v_v, 'Zed', 'Dantest', pg_temp.bbg_dob(v_sp_first, 16), v_mail || '.zed@example.com',
                                          'worcester', 2, 24, v_n, 2);
  if v_r is distinct from jsonb_build_object('status', 'has_grades', 'grade_count', 25, 'count_count', v_n, 'chosen_count', 2) then
    perform pg_temp.bbg_fail('G11 wrong counts -> has_grades with the new counts', v_r::text);
  end if;
  if public.bb_update_candidate_clear(v_dup, v_v, 'Zed', 'Dantest', pg_temp.bbg_dob(v_sp_first, 16), v_mail || '.zed@example.com',
                                      'worcester', 2, null, v_n, 2) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_update_candidate_clear(v_dup, v_v, 'Zed', 'Dantest', pg_temp.bbg_dob(v_sp_first, 16), v_mail || '.zed@example.com',
                                         'worcester', 2, -1, v_n, 2) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_update_candidate_clear(v_dup, v_v, 'Zed', 'Dantest', pg_temp.bbg_dob(v_sp_first, 16), v_mail || '.zed@example.com',
                                         'worcester', 1, 25, v_n, 2) is distinct from '{"status": "invalid"}'::jsonb      -- the same Dan
     or public.bb_update_candidate_clear(v_mu, (select version from public.bb_candidates where id = v_mu), 'Mia', 'Chentest',
                                         pg_temp.bbg_dob(v_sp_first, 32), v_mail || '.mia@example.com', 'worcester', 2, 0, 0, 0)
        is distinct from '{"status": "invalid"}'::jsonb                                                                  -- a make-up row
     or public.bb_update_candidate_clear(v_mia, (select version from public.bb_candidates where id = v_mia), 'Mia', 'Chentest',
                                         pg_temp.bbg_dob(v_sp_first, 32), v_mail || '.mia@example.com', 'worcester', 2, 25, 6, 0)
        is distinct from '{"status": "already_added"}'::jsonb                                                            -- her make-up is active
     or public.bb_update_candidate(v_mia, (select version from public.bb_candidates where id = v_mia), 'Mia', 'Chentest',
                                   pg_temp.bbg_dob(v_sp_first, 32), v_mail || '.mia@example.com', 'worcester', 2)
        is distinct from '{"status": "already_added"}'::jsonb
     -- G1: the desk's Dan change of a candidate with a payment needs an admin
     or public.bb_update_candidate_clear(v_pay, (select version from public.bb_candidates where id = v_pay), 'Pat', 'Paytest',
                                         pg_temp.bbg_dob(v_sp_first, 30), v_mail || '.pay@example.com', 'worcester', 2, 0, 0, 0)
        is distinct from '{"status": "not_allowed"}'::jsonb then
    perform pg_temp.bbg_fail('G11 the Dan change refusals', null);
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_update_candidate_clear(v_dup, v_v, 'Zed', 'Dantest', pg_temp.bbg_dob(v_sp_first, 16), v_mail || '.zed@example.com',
                                          'worcester', 2, 25, v_n, 2);
  if v_r ->> 'status' <> 'ok' or v_r -> 'cleared' <> jsonb_build_object('grades', 25, 'counts', v_n, 'chosen', 2)
     or pg_temp.bbg_keys(v_r) <> array['cleared', 'needs_parent_signature', 'status', 'version']
     or (select dan from public.bb_candidates where id = v_dup) <> 2
     or exists (select 1 from public.bb_grades where candidate_id = v_dup) or exists (select 1 from public.bb_extra_counts where candidate_id = v_dup)
     or exists (select 1 from public.bb_makeup_subjects where candidate_id = v_dup)
     or not exists (select 1 from public.bb_result_sends where candidate_id = v_dup and undone_at is null) then
    perform pg_temp.bbg_fail('G11 the confirmed Dan change clears the old Dan''s grades (the send is kept)', v_r::text);
  end if;
  if (select count(distinct batch_id) from public.change_log where id > v_mark) <> 1
     or (select count(*) from public.change_log where id > v_mark and action = 'bb_clear_dan_grading'
           and table_name in ('bb_grades', 'bb_extra_counts', 'bb_makeup_subjects') and op = 'delete') <> 25 + v_n + 2
     or (select count(*) from public.change_log where id > v_mark and action = 'bb_update_candidate' and table_name = 'bb_candidates') <> 1 then
    perform pg_temp.bbg_fail('G11 the clear and the Dan change are logged in one batch, under their own tags', null);
  end if;
  -- the stale tablet can't bring a 1st Dan grade back
  if public.bb_set_grade(v_dup, 1, v_s_fs, 'A') is distinct from '{"status": "stale"}'::jsonb then
    perform pg_temp.bbg_fail('G11 a stale tablet''s grade for the old Dan -> stale', null);
  end if;
  -- Spring's rubric stays locked after the clear
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_x := (select requirements -> 'dans' -> 0 from public.bb_cycles where id = v_sp);
  if public.bb_save_cycle_dan(v_sp, 1, (v_x ->> 'rev')::integer, jsonb_set(v_x, '{pass,makeup}', '"zz"')) ->> 'status' <> 'has_grades' then
    perform pg_temp.bbg_fail('G8 a Dan clear keeps the rubric locked', null);
  end if;
  -- a DOB fix clears nothing
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_n2 := (select count(*) from public.bb_grades where candidate_id = v_alex);
  v_r := public.bb_update_candidate(v_alex, (select version from public.bb_candidates where id = v_alex), 'Alex', 'Kimtest',
                                    pg_temp.bbg_dob(v_sp_first, 15) - 1, v_mail || '.alex@example.com', 'shrewsbury', 1);
  if v_r ->> 'status' <> 'ok' or (select count(*) from public.bb_grades where candidate_id = v_alex) <> v_n2
     or public.bb_candidate_result(v_alex) ->> 'result_key' <> v_alex_k then
    perform pg_temp.bbg_fail('G11 a DOB fix clears nothing', v_r::text);
  end if;


  -- ===================================================================
  -- G12. Mark as sent and its Undo (R 15-20, Q-G6 B)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.bb_mark_result_sent(null, v_alex_k) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_mark_result_sent(v_rand, v_alex_k) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_mark_result_sent(v_wd, v_alex_k) is distinct from '{"status": "withdrawn"}'::jsonb
     or public.bb_mark_result_sent(v_lucas, v_alex_k) is distinct from '{"status": "not_finished"}'::jsonb   -- not finished
     or public.bb_mark_result_sent(v_nage, md5('no_age|||')) is distinct from '{"status": "not_finished"}'::jsonb
     or public.bb_mark_result_sent(v_mu, md5('x')) is distinct from '{"status": "stale"}'::jsonb then
    perform pg_temp.bbg_fail('G12 Mark as sent refusals', null);
  end if;
  -- (choice_needed -> not_finished is checked on Zoe in G6b, before her subjects were chosen)
  -- Passed: mark, the own undo inside 10 seconds
  v_r := public.bb_mark_result_sent(v_alex, v_alex_k);
  if v_r ->> 'status' <> 'ok' or pg_temp.bbg_keys(v_r) <> array['marked_at', 'sent_id', 'status'] then
    perform pg_temp.bbg_fail('G12 Mark as sent on Passed', v_r::text);
  end if;
  v_send := (v_r ->> 'sent_id')::uuid;
  v_x := pg_temp.bbg_row(public.bb_cycle_results(v_sp, 1), v_alex);
  if not (v_x -> 'sent' ->> 'matches')::boolean or v_x -> 'sent' -> 'sent' ->> 'marked_by_name' <> 'Staff'
     or v_x -> 'sent' -> 'sent' ->> 'result_status' <> 'passed' or (v_x ->> 'has_email')::boolean is not true
     or pg_temp.bbg_keys(v_x -> 'sent' -> 'sent') <> array['id', 'marked_at', 'marked_by_name', 'result_status'] then
    perform pg_temp.bbg_fail('G12 the sent state', v_x::text);
  end if;
  if public.bb_undo_result_sent(v_send) is distinct from '{"status": "ok"}'::jsonb
     or public.bb_undo_result_sent(v_send) is distinct from '{"status": "stale"}'::jsonb
     or public.bb_undo_result_sent(null) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_undo_result_sent(v_rand) is distinct from '{"status": "not_found"}'::jsonb then
    perform pg_temp.bbg_fail('G12 own undo inside 10 seconds; twice -> stale', null);
  end if;
  -- 9 seconds old: still the toast's own undo; 11 seconds: not for staff; an admin any time
  foreach v_i in array array[9, 11] loop
    v_r := public.bb_mark_result_sent(v_alex, v_alex_k);
    v_send := (v_r ->> 'sent_id')::uuid;
    alter table public.bb_result_sends disable trigger bb_result_sends_guard;
    update public.bb_result_sends set marked_at = now() - make_interval(secs => v_i) where id = v_send;
    v_hand_sends := v_hand_sends || v_send;
    alter table public.bb_result_sends enable trigger bb_result_sends_guard;
    v_r := public.bb_undo_result_sent(v_send);
    if v_r is distinct from (case when v_i = 9 then '{"status": "ok"}' else '{"status": "not_allowed"}' end)::jsonb then
      perform pg_temp.bbg_fail('G12 the desk''s undo after ' || v_i || ' seconds', v_r::text);
    end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.bb_undo_result_sent(v_send) is distinct from '{"status": "ok"}'::jsonb then
    perform pg_temp.bbg_fail('G12 an admin''s later undo', null);
  end if;
  -- someone else's mark: not for the desk
  v_r := public.bb_mark_result_sent(v_alex, v_alex_k);
  v_send := (v_r ->> 'sent_id')::uuid;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.bb_undo_result_sent(v_send) is distinct from '{"status": "not_allowed"}'::jsonb then
    perform pg_temp.bbg_fail('G1/G12 the desk undoing an admin''s mark -> not_allowed', null);
  end if;
  -- Make-up with a D that isn't complete (Teen) may be marked (Q-G6 B)
  v_r := public.bb_mark_result_sent(v_teen, public.bb_candidate_result(v_teen) ->> 'result_key');
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G12 Mark as sent on an incomplete Make-up D', v_r::text); end if;
  -- "changed since sent": Mia marked, then one of her grades changes
  v_r := public.bb_mark_result_sent(v_mia, public.bb_candidate_result(v_mia) ->> 'result_key');
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G12 Mark Mia', v_r::text); end if;
  v_r := public.bb_set_grade(v_mia, 1, v_s_kor, 'A');
  v_x := pg_temp.bbg_row(public.bb_cycle_results(v_sp, 1), v_mia);
  if (v_x -> 'sent' ->> 'matches')::boolean or v_x -> 'sent' -> 'sent' is null then
    perform pg_temp.bbg_fail('G12 a later grade shows "changed since sent"', v_x::text);
  end if;
  -- a text change never resets "Sent"
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_set_result_text('passed', (select version from public.bb_result_texts where kind = 'passed'),
                                   E'Hello {first name},\n\nTotal {total}, pass mark {pass mark}.');
  if v_r ->> 'status' <> 'ok' or not (pg_temp.bbg_row(public.bb_cycle_results(v_sp, 1), v_alex) -> 'sent' ->> 'matches')::boolean then
    perform pg_temp.bbg_fail('G12 a text change leaves "sent" matching', v_r::text);
  end if;

  -- the result email (R 12): one candidate at the click
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_result_email(v_rina);
  if pg_temp.bbg_keys(v_r) <> array['cycle_name', 'd_subjects', 'dan', 'email', 'first_name', 'kind', 'last_name', 'needs', 'pass_mark',
                                    'reasons', 'result_key', 'status', 'total']
     or v_r ->> 'kind' <> 'makeup_d' or v_r -> 'needs' <> '["1/2 or 1 mile"]' or v_r ->> 'email' <> v_mail || '.rina@example.com'
     or (v_r ->> 'total')::numeric <> 252.5 or v_r -> 'reasons' <> '["d", "below"]' or v_r ->> 'cycle_name' <> v_tag || ' Spring' then
    perform pg_temp.bbg_fail('G3 bb_result_email for Rina', v_r::text);
  end if;
  if public.bb_result_email(v_alex) ->> 'kind' <> 'passed' or public.bb_result_email(v_zoe) ->> 'kind' <> 'makeup_below'
     or public.bb_result_email(v_lucas) is distinct from '{"status": "not_finished"}'::jsonb
     or public.bb_result_email(v_wd) is distinct from '{"status": "withdrawn"}'::jsonb
     or public.bb_result_email(v_rand) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_result_email(null) is distinct from '{"status": "invalid"}'::jsonb then
    perform pg_temp.bbg_fail('G12 bb_result_email kinds and refusals', null);
  end if;


  -- ===================================================================
  -- G13. The result email texts
  -- ===================================================================
  if (select count(*) from public.bb_result_texts) <> 3
     or (select md5(body) from public.bb_result_texts where kind = 'makeup_d')
        <> md5(E'Hello,\n\n{full name} took the {cycle} Black Belt testing ({Dan}), with a total of {total} points. {first name} has a make-up to do before earning {Dan}.\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject. {first name} received a D in {D subjects}. {below-pass-mark note}\n\nWhat to work on: {subjects to work on}. Every other grade is kept; only this is tested again.\n\nThe make-up is graded at a later testing cycle, with no extra fee. We’ll let you know when. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury')
     or (select md5(body) from public.bb_result_texts where kind = 'makeup_below')
        <> md5(E'Hello,\n\n{full name} took the {cycle} Black Belt testing ({Dan}), with a total of {total} points. {first name} has a make-up to do before earning {Dan}.\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject. {first name}’s total is below the pass mark.\n\nWhat to work on: {subjects to work on}. Every other grade is kept; only these subjects are tested again.\n\nThe make-up is graded at a later testing cycle, with no extra fee. We’ll let you know when. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury')
     -- (3 seed rows; 6 after an Undo 0025 + a redo: the history is append-only)
     or (select count(*) from public.change_log where action = 'bb_seed' and table_name = 'bb_result_texts' and op = 'insert'
           and actor_name = 'Database admin') not in (3, 6) then
    perform pg_temp.bbg_fail('G13 the seed (3 rows, the starting texts word for word)', null);
  end if;
  -- the seed's own passed text (changed above in this run): checked from its seed history row
  if (select l.after ->> 'body' from public.change_log l where l.action = 'bb_seed' and l.table_name = 'bb_result_texts'
        and l.after ->> 'kind' = 'passed' order by l.id limit 1)
     <> E'Hello,\n\n{full name} passed the {cycle} Black Belt testing ({Dan}), with a total of {total} points. Congratulations, {first name}!\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject.\n\nThank you for all the hard work. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury' then
    perform pg_temp.bbg_fail('G13 the seeded Passed text', null);
  end if;
  if public.bb_result_text_problem('x', 'a') <> 'kind'
     or public.bb_result_text_problem('passed', '') <> 'empty'
     or public.bb_result_text_problem('passed', repeat('a', 2001)) <> 'too_long'
     or public.bb_result_text_problem('passed', 'Hi ' || chr(7) || '{total} {pass mark}') <> 'bad_character'
     or public.bb_result_text_problem('passed', E'  \n{total} {pass mark}') <> 'first_line'
     or public.bb_result_text_problem('passed', 'Hi {total} {pass mark} {dan}') <> 'unknown_blank'
     or public.bb_result_text_problem('passed', 'Hi {total} {pass mark} {D subjects}') <> 'blank_not_for_kind'
     or public.bb_result_text_problem('passed', 'Hi {total} {pass mark} {first name') <> 'stray_brace'
     or public.bb_result_text_problem('passed', 'Hi {total}') <> 'missing_required'
     or public.bb_result_text_problem('makeup_below', 'Hi {total} {pass mark}') <> 'missing_required'
     or public.bb_result_text_problem('makeup_d', 'Hi {total} {pass mark} {subjects to work on} {D subjects} {below-pass-mark note}') is not null
     or public.bb_result_text_problem('makeup_below', 'Hi {total} {pass mark} {subjects to work on} {D subjects}') <> 'blank_not_for_kind'
     or public.bb_result_text_problem('passed', 'Hi {first name} {full name} {cycle} {Dan} {total} {pass mark}') is not null then
    perform pg_temp.bbg_fail('G13 the text rules', null);
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.bb_set_result_text('passed', 1, 'Hi {total} {pass mark}') is distinct from '{"status": "not_allowed"}'::jsonb then
    perform pg_temp.bbg_fail('G1 the desk saves a text -> not_allowed', null);
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_v := (select version from public.bb_result_texts where kind = 'passed');
  select coalesce(max(id), 0) into v_mark from public.change_log;
  if public.bb_set_result_text('passed', v_v + 5, 'Hi {total} {pass mark}') is distinct from '{"status": "stale"}'::jsonb
     or public.bb_set_result_text('passed', v_v, 'Hi {total}') is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_set_result_text('nope', v_v, 'Hi {total} {pass mark}') is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_set_result_text(null, v_v, 'x') is distinct from '{"status": "invalid"}'::jsonb then
    perform pg_temp.bbg_fail('G13 Save text refusals', null);
  end if;
  v_r := public.bb_set_result_text('passed', v_v, (select body from public.bb_result_texts where kind = 'passed'));
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> v_v or exists (select 1 from public.change_log where id > v_mark) then
    perform pg_temp.bbg_fail('G13 the same text writes nothing', v_r::text);
  end if;
  -- re-running the seed overwrites nothing
  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.action', 'bb_seed', true);
  insert into public.bb_result_texts (kind, body, created_by_name, updated_by_name)
  values ('passed', 'zz {total} {pass mark}', '', ''), ('makeup_d', 'zz {total} {pass mark} {subjects to work on}', '', '')
  on conflict (kind) do nothing;
  perform set_config('tkd.action', '', true);
  if exists (select 1 from public.bb_result_texts where body like 'zz %') then
    perform pg_temp.bbg_fail('G13 the seed overwrote a text', null);
  end if;


  -- ===================================================================
  -- G14. The CSV and its download log (admins only, logged first)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_n := (select count(*) from public.bb_downloads);
  if public.bb_results_csv(v_sp) is distinct from '{"status": "not_allowed"}'::jsonb then
    perform pg_temp.bbg_fail('G1 the desk downloads the CSV -> not_allowed', null);
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.bb_results_csv(v_rand) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_results_csv(null) is distinct from '{"status": "invalid"}'::jsonb
     or (select count(*) from public.bb_downloads) <> v_n then
    perform pg_temp.bbg_fail('G14 a refused CSV writes no log row', null);
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_results_csv(v_sp);
  v_x := (select x.e from jsonb_array_elements(v_r -> 'rows') as x(e) where x.e ->> 'candidate_id' = v_alex::text);
  if v_r ->> 'status' <> 'ok' or pg_temp.bbg_keys(v_r) <> array['cycle_name', 'rows', 'status']
     or jsonb_array_length(v_r -> 'rows') <> (select count(*) from public.bb_candidates where cycle_id = v_sp and status = 'active')
     or exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(e) where x.e ->> 'candidate_id' = v_wd::text)
     or pg_temp.bbg_keys(v_x) <> array['candidate_id', 'dan', 'date_of_birth', 'email_for_results', 'extra_total', 'first_name', 'kukkiwon',
                                       'last_name', 'location_code', 'makeup_of_cycle_name', 'money', 'parts', 'pass_bracket', 'pass_mark',
                                       'plan_name', 'result', 'result_status', 'sent', 'total']
     or pg_temp.bbg_keys(v_x -> 'result') <> array['choice_needed', 'complete', 'late', 'missing', 'needs', 'reasons', 'status']
     or v_x ->> 'result_status' <> 'passed' or v_x ->> 'email_for_results' <> v_mail || '.alex@example.com'
     or v_x -> 'money' ? 'items' or v_x ->> 'plan_name' <> 'In full'
     or (select x.e -> 'result' -> 'late' from jsonb_array_elements(v_r -> 'rows') as x(e) where x.e ->> 'candidate_id' = v_lucas::text)
        <> '["TKD project"]'
     or (select count(*) from public.bb_downloads) <> v_n + 1
     or (select row_count from public.bb_downloads where cycle_id = v_sp and cycle_name = v_tag || ' Spring')
        <> (select count(*) from public.bb_candidates where cycle_id = v_sp and status = 'active')
     or (select downloaded_by_name from public.bb_downloads where cycle_id = v_sp and cycle_name = v_tag || ' Spring') <> 'Main Admin'
     or exists (select 1 from public.change_log where id > v_mark)
     or v_r::text like '%"reference"%' or v_r::text like '%makeup_of_candidate_id%' or v_r::text like '%age_kept%' then
    perform pg_temp.bbg_fail('G14 the CSV answer and its log row', left(v_x::text, 400));
  end if;


  -- ===================================================================
  -- G15. The purge keeps the result (Q-G2, S19, S20)
  -- ===================================================================
  -- S20's chain first (while nothing is due): Rina (Spring) -> Fall (her
  -- mile D again: a Make-up) -> Winter; then the Fall link is withdrawn
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_add_makeup(v_fa, v_rina);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G15 Rina into Fall', v_r::text); end if;
  v_mur := (v_r ->> 'id')::uuid;
  v_r := public.bb_set_measured(v_mur, 1, v_s_mile, 12.6667, 0);
  if v_r -> 'result' ->> 'status' <> 'makeup' then perform pg_temp.bbg_fail('G15 Rina''s Fall make-up is a Make-up again', v_r::text); end if;
  v_r := public.bb_add_makeup(v_wi, v_mur);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G15 Rina''s Fall make-up into Winter', v_r::text); end if;
  v_mut := (v_r ->> 'id')::uuid;
  if (select kept_from_cycle_name from public.bb_grades where candidate_id = v_mut and kept limit 1) <> v_tag || ' Fall'
     or (select makeup_of_cycle_name from public.bb_candidates where id = v_mut) <> v_tag || ' Fall' then
    perform pg_temp.bbg_fail('G7 a chain: the kept rows name the IMMEDIATE earlier cycle', null);
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_withdraw_candidate(v_mur, (select version from public.bb_candidates where id = v_mur));

  -- the purge numbers on (3 and 3 years): Olga (4 years ago) is due today
  perform set_config('request.jwt.claims', '', true);
  update public.bb_settings set keep_years_after_last_day = 3, keep_years_after_18 = 3;
  v_d := (select max(day_date) from public.bb_cycle_days where cycle_id = v_wi);
  if public.bb_purge_due_on(v_rina) <> (v_d + interval '3 years')::date
     or public.bb_purge_due_on(v_mur) <> (v_d + interval '3 years')::date then
    perform pg_temp.bbg_fail('G15 S20 the earlier row''s purge day is the latest of its make-up chain (a withdrawn link included)',
                             public.bb_purge_due_on(v_rina)::text);
  end if;
  if not public.bb_purge_is_due(v_olga, v_today) or (select personal_removed_at from public.bb_candidates where id = v_olga) is not null then
    perform pg_temp.bbg_fail('G15 setup: Olga is due and not purged yet', null);
  end if;
  -- on the purge day, before the purge ran: no email, no make-up, no DOB in the CSV
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_x := public.bb_candidate_result(v_olga);
  if public.bb_mark_result_sent(v_olga, v_x ->> 'result_key') is distinct from '{"status": "no_email"}'::jsonb
     or public.bb_result_email(v_olga) is distinct from '{"status": "no_email"}'::jsonb
     or (pg_temp.bbg_row(public.bb_cycle_results(v_old, 1), v_olga) ->> 'has_email')::boolean
     or public.bb_add_makeup(v_fa, v_olga) is distinct from '{"status": "invalid"}'::jsonb
     or pg_temp.bbg_row(public.bb_makeup_list(v_fa), v_olga) is not null then
    perform pg_temp.bbg_fail('G12/G7 on the purge day (before the purge ran): no_email, has_email false, Add make-up invalid', null);
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_results_csv(v_old);
  v_r2 := (select x.e from jsonb_array_elements(v_r -> 'rows') as x(e) where x.e ->> 'candidate_id' = v_olga::text);
  if v_r2 -> 'date_of_birth' <> 'null' or v_r2 -> 'email_for_results' <> 'null' then
    perform pg_temp.bbg_fail('G14 the CSV hides the DOB and email from the purge day on', v_r2::text);
  end if;
  -- the purge
  perform set_config('request.jwt.claims', '', true);
  v_v := (select version from public.bb_candidates where id = v_olga);
  v_n := (select count(*) from public.bb_grades where candidate_id = v_olga) + (select count(*) from public.bb_extra_counts where candidate_id = v_olga);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_i := public.bb_purge_due();
  if v_i < 2
     or (select count(*) from public.bb_candidates c where c.id = v_olga and c.date_of_birth is null and c.email_for_results is null
           and c.personal_removed_at is not null and c.age_kept = 40 and c.version = v_v) <> 1
     or (select count(*) from public.bb_grades where candidate_id = v_olga) + (select count(*) from public.bb_extra_counts where candidate_id = v_olga) <> v_n
     or public.bb_candidate_age(v_olga) <> 40
     or public.bb_candidate_result(v_olga) ->> 'result_key' <> v_x ->> 'result_key'
     or public.bb_candidate_result(v_olga) -> 'age_group' <> '{"from": 18, "to": null}' then
    perform pg_temp.bbg_fail('G15 the purge removes the DOB, keeps the age (no version bump), the grades and the result', null);
  end if;
  -- M1: odd dates of birth never stop the purge; the kept age is the exact
  -- worked-out one. Bea (1900) was due and purged above; Fay (born more than
  -- a year AFTER the first day: age -1) isn't due yet, so her DOB is removed
  -- the way the purge does it (its tag, its age rule), which must not fail.
  perform set_config('tkd.action', 'bb_purge_due', true);
  update public.bb_candidates c
     set date_of_birth = null, email_for_results = null, personal_removed_at = now(),
         age_kept = public.bb_age_on(c.date_of_birth, (select min(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id))
   where c.id = v_fay;
  perform set_config('tkd.action', '', true);
  if (select count(*) from public.bb_candidates c
       where c.id in (v_bea, v_fay) and c.personal_removed_at is not null and c.date_of_birth is null) <> 2
     or (select age_kept from public.bb_candidates where id = v_bea) <> public.bb_age_on(date '1900-01-01', v_old_first)
     or (select age_kept from public.bb_candidates where id = v_bea) <= 120
     or (select age_kept from public.bb_candidates where id = v_fay) <> public.bb_age_on(v_old_first + 400, v_old_first)
     or (select age_kept from public.bb_candidates where id = v_fay) >= 0 then
    perform pg_temp.bbg_fail('G15 the purge with a DOB of 1900-01-01 and one after the first day',
      (select string_agg(first_name || '=' || coalesce(age_kept::text, 'null'), ', ') from public.bb_candidates where id in (v_bea, v_fay)));
  end if;
  -- the history: age_kept only masked ("changed"), never the number
  if not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'bb_candidates' and l.record_id = v_olga
                  and l.action = 'bb_purge_due' and l.after -> 'age_kept' = '"changed"' and l.before -> 'age_kept' = 'null')
     or exists (select 1 from public.change_log l where l.id > v_mark and (l.after::text ~ '"age_kept": [0-9]' or l.before::text ~ '"age_kept": [0-9]')) then
    perform pg_temp.bbg_fail('G15 the purge''s history masks age_kept', null);
  end if;
  -- the detail answers no age from age_kept; a purged candidate's make-up is refused
  if (public.bb_candidate_detail(v_olga) -> 'candidate' -> 'age_on_first_day') <> 'null'
     or public.bb_candidate_detail(v_olga)::text like '%age_kept%' then
    perform pg_temp.bbg_fail('G15 the detail never shows the kept age', null);
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.bb_add_makeup(v_fa, v_olga) is distinct from '{"status": "invalid"}'::jsonb then
    perform pg_temp.bbg_fail('G7 a purged earlier candidate -> invalid', null);
  end if;
  -- a kept age never changes, even as the SQL Editor's role; removing a DOB
  -- needs the right kept age (as 0016's purge body would do it)
  perform set_config('request.jwt.claims', '', true);
  foreach v_txt in array array[
    format('update public.bb_candidates set age_kept = 41 where id = %L', v_olga),
    format('update public.bb_candidates set age_kept = null where id = %L', v_olga)] loop
    begin
      execute v_txt;
      perform pg_temp.bbg_fail('G15 a kept age changed: ' || v_txt, null);
    exception when check_violation then
      get stacked diagnostics v_txt2 = constraint_name;
      if v_txt2 <> 'bb_candidates_age_kept_immutable' then perform pg_temp.bbg_fail('G15 kept age rule', v_txt2); end if;
    end;
  end loop;
  perform set_config('tkd.action', 'bb_purge_due', true);
  foreach v_txt in array array[
    format('update public.bb_candidates set date_of_birth = null, email_for_results = null, personal_removed_at = now() where id = %L', v_sam),
    format('update public.bb_candidates set date_of_birth = null, email_for_results = null, personal_removed_at = now(), age_kept = 44 where id = %L', v_sam)] loop
    begin
      execute v_txt;
      perform pg_temp.bbg_fail('G15 a DOB removed without the right kept age: ' || v_txt, null);
    exception when check_violation then
      get stacked diagnostics v_txt2 = constraint_name;
      if v_txt2 <> 'bb_candidates_age_kept_required' then perform pg_temp.bbg_fail('G15 keep-age rule', v_txt2); end if;
    end;
  end loop;
  perform set_config('tkd.action', 'bb_update_candidate', true);
  begin
    update public.bb_candidates set date_of_birth = null, email_for_results = null, personal_removed_at = now(), age_kept = 43 where id = v_sam;
    perform pg_temp.bbg_fail('G15 an age kept outside the purge', null);
  exception when check_violation then null;
  end;
  perform set_config('tkd.action', '', true);
  begin
    insert into public.bb_candidates (cycle_id, first_name, last_name, location_code, dan, cycle_plan_id, kukkiwon, source, reference,
                                      personal_removed_at, age_kept, created_by_name, updated_by_name)
    select v_old, 'Kept', 'Agetest', 'worcester', 1, pl.id, false, 'desk', 'BB-9' || (floor(random() * 100000))::int, now(), 30, '', ''
      from public.bb_cycle_plans pl where pl.cycle_id = v_old limit 1;
    perform pg_temp.bbg_fail('G15 a new row with a kept age', null);
  exception when check_violation then
    get stacked diagnostics v_txt2 = constraint_name;
    if v_txt2 <> 'bb_candidates_age_kept_immutable' then perform pg_temp.bbg_fail('G15 kept age on insert', v_txt2); end if;
  end;
  -- the delete branch of the history: Pia (purged, no grades) removed
  perform set_config('request.jwt.claims', v_c_a1, true);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_delete_candidate((select id from public.bb_candidates where first_name = 'Pia' and cycle_id = v_old),
                                    (select version from public.bb_candidates where first_name = 'Pia' and cycle_id = v_old));
  if v_r is distinct from '{"status": "ok"}'::jsonb
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'bb_candidates' and l.op = 'delete'
                     and l.before -> 'age_kept' = '"on file"' and l.before -> 'date_of_birth' = 'null') then
    perform pg_temp.bbg_fail('G15 the delete branch masks age_kept ("on file")', v_r::text);
  end if;
  -- the insert branch: every new candidate row of this run logs age_kept as null
  if exists (select 1 from public.change_log l where l.id > v_mark0 and l.table_name = 'bb_candidates' and l.op = 'insert'
              and l.after -> 'age_kept' is distinct from 'null'::jsonb) then
    perform pg_temp.bbg_fail('G15 the insert branch logs age_kept as null', null);
  end if;
  perform set_config('request.jwt.claims', '', true);
  update public.bb_settings set keep_years_after_last_day = null, keep_years_after_18 = null;


  -- ===================================================================
  -- G1. Who may call what
  -- ===================================================================
  v_ok := array[
    format('public.bb_set_grade(%L::uuid, 1, %L, %L)', v_lucas, v_s_ref, 'A'),
    format('public.bb_set_measured(%L::uuid, 1, %L, 8, 0)', v_lucas, v_s_pull),
    format('public.bb_set_extra_count(%L::uuid, 1, %L, 1)', v_lucas, 'Extra stripes'),
    format('public.bb_set_makeup_subjects(%L::uuid, %L::text[], %L::text[])', v_zoe, '{}', array[v_s_kor]),
    format('public.bb_add_makeup(%L::uuid, %L::uuid)', v_wi, v_zoe),
    format('public.bb_mark_result_sent(%L::uuid, %L)', v_alex, v_alex_k),
    format('public.bb_undo_result_sent(%L::uuid)', v_send),
    format('public.bb_set_result_text(%L, 1, %L)', 'passed', 'Hi {total} {pass mark}'),
    format('public.bb_update_candidate_clear(%L::uuid, 1, %L, %L, %L::date, %L, %L, 2, 0, 0, 0)', v_lucas, 'Lucas', 'Ferreiratest',
           pg_temp.bbg_dob(v_sp_first, 11), v_mail || '.lucas@example.com', 'worcester'),
    format('public.bb_grading_grid(%L::uuid, 1)', v_sp),
    format('public.bb_cycle_results(%L::uuid, null)', v_sp),
    format('public.bb_makeup_list(%L::uuid)', v_fa),
    format('public.bb_result_email(%L::uuid)', v_alex),
    format('public.bb_results_csv(%L::uuid)', v_sp),
    format('public.bb_cycle_grading_state(%L::uuid)', v_sp)];
  v_bad := array[
    'public.bb_set_grade(null::uuid, 9, ''x'', ''x'')', 'public.bb_set_measured(null::uuid, 9, ''x'', -1, 9)',
    'public.bb_set_extra_count(null::uuid, 9, null, -5)', 'public.bb_set_makeup_subjects(null::uuid, null::text[], null::text[])',
    'public.bb_add_makeup(null::uuid, null::uuid)', 'public.bb_mark_result_sent(null::uuid, null)',
    'public.bb_undo_result_sent(null::uuid)', 'public.bb_set_result_text(null, null, null)',
    'public.bb_update_candidate_clear(null::uuid, null, null, null, null::date, null, null, null, null, null, null)',
    'public.bb_grading_grid(null::uuid, 9)', 'public.bb_cycle_results(null::uuid, 9)', 'public.bb_makeup_list(null::uuid)',
    'public.bb_result_email(null::uuid)', 'public.bb_results_csv(null::uuid)', 'public.bb_cycle_grading_state(null::uuid)'];
  v_none := array(select replace(replace(replace(replace(replace(x, v_lucas::text, v_rand::text), v_zoe::text, v_rand::text),
                                                 v_alex::text, v_rand::text), v_sp::text, v_rand::text), v_fa::text, v_rand::text)
                    from unnest(v_ok) as x);
  -- G1a. anon and bb_registrar: nothing at all
  foreach v_role in array array['anon', 'bb_registrar'] loop
    -- First from the catalog (as 0016_tests.sql T2 does), then by really calling as that login where
    -- the SQL Editor may switch to it. On production it isn't a member of bb_registrar, so that one
    -- is proved from the catalog only.
      foreach v_txt in array v_ok loop
        if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = substring(v_txt from '^public\.([a-z_0-9]+)\(')
                      and has_function_privilege(v_role, p.oid, 'EXECUTE')) then
          raise exception 'TEST FAILED: G1a % may run %', v_role, v_txt;
        end if;
      end loop;
      foreach v_txt in array v_tables loop
        if has_table_privilege(v_role, 'public.' || v_txt, 'SELECT, INSERT, UPDATE, DELETE')
           or has_any_column_privilege(v_role, 'public.' || v_txt, 'SELECT, INSERT, UPDATE') then
          raise exception 'TEST FAILED: G1a % has a right on %', v_role, v_txt;
        end if;
      end loop;
    if not pg_has_role(current_user, v_role, 'MEMBER') then
      continue;
    end if;
    execute 'set local role ' || v_role;
    perform set_config('request.jwt.claims', v_c_anon, true);
    foreach v_txt in array v_ok loop
      begin
        execute 'select ' || v_txt;
        raise exception 'TEST FAILED: G1a % could call %', v_role, v_txt;
      exception when insufficient_privilege then null;
      end;
    end loop;
    foreach v_txt in array v_tables loop
      begin
        execute format('select 1 from public.%I limit 1', v_txt);
        raise exception 'TEST FAILED: G1a % could read %', v_role, v_txt;
      exception when insufficient_privilege then null;
      end;
    end loop;
    reset role;
  end loop;
  -- G1b. no data access: no_access from every function, every way of calling it; nothing written
  execute v_snap_sql into v_snap;
  v_list   := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_d2, v_c_d3, v_c_a8];
  v_labels := array['A2',   'A3',   'A4',   'A5',   'A6',   'A7',   'D2',   'D3',   'A8'];
  for v_n in 1 .. cardinality(v_list) loop
    if v_labels[v_n] = 'A8' then update public.staff set active = false where id = v_admin; end if;
    set local role authenticated;
    perform set_config('request.jwt.claims', v_list[v_n], true);
    for v_i in 1 .. 15 loop
      foreach v_txt in array array[v_ok[v_i], v_bad[v_i], v_none[v_i]] loop
        execute 'select ' || v_txt into v_r;
        if v_r is distinct from '{"status": "no_access"}'::jsonb then
          raise exception 'TEST FAILED: G1b session % got % from %', v_labels[v_n], v_r, left(v_txt, 200);
        end if;
      end loop;
    end loop;
    reset role;
    if v_labels[v_n] = 'A8' then update public.staff set active = true where id = v_admin; end if;
  end loop;
  -- G1c. the desk: not_allowed from the three admin-only functions, every way
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_i in array array[4, 8, 14] loop
    foreach v_txt in array array[v_ok[v_i], v_bad[v_i], v_none[v_i]] loop
      execute 'select ' || v_txt into v_r;
      if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
        raise exception 'TEST FAILED: G1c desk got % from admin-only %', v_r, left(v_txt, 200);
      end if;
    end loop;
  end loop;
  reset role;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then perform pg_temp.bbg_fail('G1 a refused call changed something', null); end if;
  -- the helpers: nobody in the app may call them
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_helpers)
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE') or has_function_privilege('bb_registrar', p.oid, 'EXECUTE'));
  if v_txt is not null then perform pg_temp.bbg_fail('G1 a helper is executable by an app role', v_txt); end if;


  -- ===================================================================
  -- G2. Table and column rights
  -- ===================================================================
  v_list   := array[v_c_a1, v_c_d1, v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_d2, v_c_d3];
  v_labels := array['A1', 'D1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'D2', 'D3'];
  for v_n in 1 .. cardinality(v_list) loop
    set local role authenticated;
    perform set_config('request.jwt.claims', v_list[v_n], true);
    foreach v_txt in array array['bb_grades', 'bb_extra_counts', 'bb_makeup_subjects', 'bb_result_sends', 'bb_downloads',
                                 'bb_cycle_grading_started'] loop
      begin
        execute format('select count(*) from public.%I', v_txt) into v_i;
        if v_i <> 0 then raise exception 'TEST FAILED: G2 % read % rows of %', v_labels[v_n], v_i, v_txt; end if;
      exception when insufficient_privilege then null;
      end;
    end loop;
    execute 'select count(*) from public.bb_result_texts' into v_i;
    if v_i <> (case when v_labels[v_n] in ('A1', 'D1') then 3 else 0 end) then
      raise exception 'TEST FAILED: G2 % read % result texts', v_labels[v_n], v_i;
    end if;
    foreach v_txt in array array['makeup_of_candidate_id', 'makeup_of_cycle_name', 'age_kept'] loop
      begin
        execute format('select %I from public.bb_candidates limit 1', v_txt);
        raise exception 'TEST FAILED: G2 % could read bb_candidates.%', v_labels[v_n], v_txt;
      exception when insufficient_privilege then null;
      end;
    end loop;
    foreach v_txt in array array['created_by', 'updated_by'] loop
      begin
        execute format('select %I from public.bb_result_texts limit 1', v_txt);
        raise exception 'TEST FAILED: G2 % could read bb_result_texts.%', v_labels[v_n], v_txt;
      exception when insufficient_privilege then null;
      end;
    end loop;
    reset role;
  end loop;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  foreach v_txt in array array[
    format('insert into public.bb_grades (candidate_id, dan, part_code, subject_id, letter, created_by_name, updated_by_name) values (%L, 1, %L, %L, %L, %L, %L)', v_lucas, 'technical', v_s_ref, 'A', '', ''),
    'update public.bb_grades set letter = ''A''', 'delete from public.bb_grades', 'truncate public.bb_grades',
    'update public.bb_result_texts set body = ''x''', 'delete from public.bb_result_texts', 'truncate public.bb_result_sends',
    'insert into public.bb_downloads (cycle_id, cycle_name, row_count, downloaded_by_name) values (gen_random_uuid(), ''x'', 1, ''x'')',
    'delete from public.bb_cycle_grading_started', 'update public.bb_extra_counts set count = 1',
    'delete from public.bb_makeup_subjects'] loop
    begin
      execute v_txt;
      raise exception 'TEST FAILED: G2 the app could run: %', v_txt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);


  -- ===================================================================
  -- G3. The exact keys of every answer; no personal data where it doesn't belong
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_grading_grid(v_sp, 1);
  v_x := pg_temp.bbg_row(v_r, v_alex);
  if pg_temp.bbg_keys(v_r) <> array['cycle', 'dan_counts', 'rows', 'rubric', 'status', 'today']
     or pg_temp.bbg_keys(v_r -> 'cycle') <> array['days', 'first_day', 'id', 'name', 'submissions_due']
     or pg_temp.bbg_keys(v_r -> 'cycle' -> 'days' -> 0) <> array['day_date', 'end_time', 'id', 'name', 'parts', 'place_code', 'place_other',
                                                                 'second_end', 'second_place_code', 'second_place_other', 'second_start', 'start_time']
     or pg_temp.bbg_keys(v_r -> 'dan_counts' -> 0) <> array['count', 'dan', 'location_code']
     or pg_temp.bbg_keys(v_x) <> array['first_name', 'id', 'is_makeup', 'last_name', 'location_code', 'makeup_of_cycle_name', 'result']
     or pg_temp.bbg_keys(v_x -> 'result') <> v_result_keys
     or pg_temp.bbg_keys(v_x -> 'result' -> 'subjects' -> 0) <> array['applies', 'chosen', 'gradable', 'id', 'kept', 'kept_from_cycle_name',
                                                                       'late', 'letter', 'measured', 'part', 'points', 'retest', 'way']
     or pg_temp.bbg_keys(v_x -> 'result' -> 'parts' -> 0) <> array['applying', 'code', 'graded', 'points']
     or pg_temp.bbg_keys(v_x -> 'result' -> 'extra') <> array['counted', 'items', 'total']
     or pg_temp.bbg_keys(v_x -> 'result' -> 'extra' -> 'items' -> 0) <> array['count', 'kept', 'name', 'points']
     or pg_temp.bbg_keys(v_x -> 'result' -> 'counts') <> array['applying', 'graded', 'left']
     or pg_temp.bbg_keys(v_x -> 'result' -> 'pass_bracket') <> array['from', 'to']
     or pg_temp.bbg_keys(v_x -> 'result' -> 'age_group') <> array['from', 'to']
     or v_r -> 'rubric' ? 'rev' or v_r -> 'rubric' ->> 'dan' <> '1'
     or v_r ->> 'today' <> v_today::text then
    perform pg_temp.bbg_fail('G3 bb_grading_grid keys', left(v_r::text, 300));
  end if;
  -- own candidates first, then make-ups (Fall)
  v_r := public.bb_grading_grid(v_fa, 1);
  if (select bool_and(x.e ->> 'is_makeup' = 'true') from jsonb_array_elements(v_r -> 'rows') as x(e)) is not true
     and exists (select 1 from jsonb_array_elements(v_r -> 'rows') with ordinality as a(e, n)
                   join jsonb_array_elements(v_r -> 'rows') with ordinality as b(e, n) on b.n = a.n + 1
                  where (a.e ->> 'is_makeup')::boolean and not (b.e ->> 'is_makeup')::boolean) then
    perform pg_temp.bbg_fail('G3 the grid lists own candidates first, then make-ups', null);
  end if;
  v_r := public.bb_cycle_results(v_sp, null);
  v_x := pg_temp.bbg_row(v_r, v_alex);
  if pg_temp.bbg_keys(v_r) <> array['cycle', 'dan_counts', 'rows', 'rubrics', 'status', 'today']
     or pg_temp.bbg_keys(v_r -> 'cycle') <> array['days', 'first_day', 'id', 'last_day', 'name', 'submissions_due']
     or pg_temp.bbg_keys(v_x) <> array['dan', 'first_name', 'has_email', 'id', 'is_makeup', 'last_name', 'location_code',
                                       'makeup_of_cycle_name', 'result', 'sent']
     or pg_temp.bbg_keys(v_x -> 'sent') <> array['matches', 'sent']
     or jsonb_array_length(v_r -> 'rubrics') <> 4 or jsonb_array_length(public.bb_cycle_results(v_sp, 2) -> 'rubrics') <> 1
     or exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(e) where x.e ->> 'id' = v_wd::text) then
    perform pg_temp.bbg_fail('G3 bb_cycle_results keys', left(v_r::text, 300));
  end if;
  -- invalid / not_found of the reads
  if public.bb_grading_grid(v_sp, 0) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_grading_grid(v_rand, 1) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_cycle_results(v_sp, 5) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_cycle_results(v_rand, null) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_makeup_list(v_rand) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_cycle_grading_state(v_rand) is distinct from '{"status": "not_found"}'::jsonb then
    perform pg_temp.bbg_fail('G3 the reads'' invalid / not_found', null);
  end if;
  -- no DOB, email, money, reference, age, earlier-row id or kept age where they don't belong
  foreach v_txt in array array[public.bb_grading_grid(v_sp, 1)::text, public.bb_grading_grid(v_fa, 1)::text,
                               public.bb_cycle_results(v_sp, null)::text, public.bb_cycle_results(v_fa, null)::text,
                               public.bb_makeup_list(v_fa)::text, public.bb_makeup_list(v_wi)::text,
                               public.bb_cycle_grading_state(v_sp)::text] loop
    if v_txt ~ '"(date_of_birth|email_for_results|email|money|reference|age|age_kept|makeup_of_candidate_id|personal_removed_at)":'
       or position(v_mail in v_txt) > 0
       or position(pg_temp.bbg_dob(v_sp_first, 32)::text in v_txt) > 0 then
      perform pg_temp.bbg_fail('G3 an answer holds personal data or an internal id', left(v_txt, 300));
    end if;
  end loop;
  foreach v_txt in array array[public.bb_cycle_roster(v_fa)::text, public.bb_candidate_detail(v_mu)::text,
                               public.bb_result_email(v_alex)::text] loop
    if v_txt ~ '"(age_kept|makeup_of_candidate_id|age)":' then
      perform pg_temp.bbg_fail('G3 an answer holds a kept age or the earlier row''s id', left(v_txt, 300));
    end if;
  end loop;
  if position(v_mia::text in public.bb_cycle_roster(v_fa)::text) > 0 then
    perform pg_temp.bbg_fail('G3 the roster names the earlier row''s id', null);
  end if;


  -- ===================================================================
  -- G16. Logging: as the app calls it; no DOB, email or kept age in the history
  -- ===================================================================
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_set_grade(v_alex, 1, v_s_ref, 'A+');
  v_r := public.bb_set_grade(v_alex, 1, v_s_ref, 'A');
  reset role;
  if (select count(*) from public.change_log where id > v_mark) <> 2
     or exists (select 1 from public.change_log l where l.id > v_mark
                 and (l.action <> 'bb_set_grade' or l.actor_id is distinct from v_desk or l.session_id is distinct from v_d1
                      or l.actor_name <> 'Staff' or l.batch_id is null or l.table_name <> 'bb_grades' or l.op <> 'update'))
     or (select count(distinct batch_id) from public.change_log where id > v_mark) <> 2 then
    perform pg_temp.bbg_fail('G16 a grade write''s history rows', null);
  end if;
  -- every write of this run: no DOB, email or kept age in any history row
  if exists (select 1 from public.change_log l where l.id > v_mark0
              and (coalesce(l.before::text, '') || coalesce(l.after::text, '')) ~ (v_mail || '|"age_kept": [0-9]')) then
    perform pg_temp.bbg_fail('G16 a history row holds an email or a kept age', null);
  end if;
  foreach v_d in array array(select distinct c.date_of_birth from public.bb_candidates c where c.date_of_birth is not null
                                and c.email_for_results like v_mail || '%') loop
    if exists (select 1 from public.change_log l where l.id > v_mark0
                and position(v_d::text in coalesce(l.before::text, '') || coalesce(l.after::text, '')) > 0) then
      perform pg_temp.bbg_fail('G16 a history row holds a date of birth', v_d::text);
    end if;
  end loop;
  -- every grading write is tagged, never 'manual'
  if exists (select 1 from public.change_log l where l.id > v_mark0
              and l.table_name in ('bb_grades', 'bb_extra_counts', 'bb_makeup_subjects', 'bb_result_sends', 'bb_result_texts',
                                   'bb_cycle_grading_started')
              and (l.action = 'manual' or l.batch_id is null)
              and not (l.table_name = 'bb_makeup_subjects' and l.op = 'insert' and l.record_id in
                        (select m.id from public.bb_makeup_subjects m join public.bb_candidates c on c.id = m.candidate_id where c.cycle_id = v_del))
              and not (l.table_name = 'bb_result_sends' and l.record_id = any (v_hand_sends))) then
    perform pg_temp.bbg_fail('G16 a grading write without its tag', null);
  end if;
  if exists (select 1 from public.change_log where table_name = 'bb_downloads') then
    perform pg_temp.bbg_fail('G14 a download is never in the history', null);
  end if;


  -- ===================================================================
  -- G17. The catalog
  -- ===================================================================
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = any (v_tables) and not c.relrowsecurity)
     or (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = any (v_tables)) <> 7 then
    perform pg_temp.bbg_fail('G17 RLS on all seven tables', null);
  end if;
  if (select string_agg(p.tablename || ':' || p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, '+') || ':' || p.qual, ','
                        order by p.tablename collate "C")
        from pg_policies p where p.schemaname = 'public' and p.tablename = any (v_tables))
     <> 'bb_extra_counts:bb_extra_counts_select_with_access:SELECT:authenticated:( SELECT has_data_access() AS has_data_access),'
     || 'bb_grades:bb_grades_select_with_access:SELECT:authenticated:( SELECT has_data_access() AS has_data_access),'
     || 'bb_makeup_subjects:bb_makeup_subjects_select_with_access:SELECT:authenticated:( SELECT has_data_access() AS has_data_access),'
     || 'bb_result_sends:bb_result_sends_select_with_access:SELECT:authenticated:( SELECT has_data_access() AS has_data_access),'
     || 'bb_result_texts:bb_result_texts_select_with_access:SELECT:authenticated:( SELECT has_data_access() AS has_data_access)' then
    perform pg_temp.bbg_fail('G17 the read rules are exactly contract 8', null);
  end if;
  -- rights: no table-wide right for any role; only the 8 text columns to authenticated
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) as a
              where n.nspname = 'public' and c.relname = any (v_tables) and a.grantee <> c.relowner)
     or (select string_agg(t.attname || '>' || a.grantee::regrole::text || ':' || a.privilege_type, ',' order by t.attname collate "C")
           from pg_attribute t, aclexplode(t.attacl) as a
          where t.attrelid = 'public.bb_result_texts'::regclass and t.attnum > 0)
        <> 'body>authenticated:SELECT,created_at>authenticated:SELECT,created_by_name>authenticated:SELECT,id>authenticated:SELECT,'
           'kind>authenticated:SELECT,updated_at>authenticated:SELECT,updated_by_name>authenticated:SELECT,version>authenticated:SELECT'
     or exists (select 1 from pg_attribute t, aclexplode(t.attacl) as a
                 where t.attrelid = any (array(select ('public.' || x)::regclass from unnest(v_tables) as x where x <> 'bb_result_texts'))
                   and t.attnum > 0)
     or exists (select 1 from pg_attribute t, aclexplode(t.attacl) as a
                 where t.attrelid = 'public.bb_candidates'::regclass
                   and t.attname in ('makeup_of_candidate_id', 'makeup_of_cycle_name', 'age_kept')) then
    perform pg_temp.bbg_fail('G17 the rights are exactly contract 8', null);
  end if;
  -- every 0025 function: one version, search_path "", no argument defaults,
  -- definer only where designed, execute only where designed
  for v_fn in
    select p.oid, p.proname as name, p.prosecdef, p.proconfig, p.pronargdefaults, p.proacl, p.proowner, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_new_fns || v_helpers || v_replaced)
  loop
    if v_fn.proconfig is distinct from array['search_path=""'] or v_fn.pronargdefaults <> 0
       or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = v_fn.name) <> 1 then
      perform pg_temp.bbg_fail('G17 versions, search_path or defaults of', v_fn.oid::regprocedure::text);
    end if;
    if v_fn.prosecdef is distinct from (v_fn.name = any (v_new_fns) or v_fn.name = 'bb_candidates_log'
                                        or (v_fn.name = any (v_replaced) and v_fn.name not in ('bb_purge_due_on', 'bb_purge_due',
                                                                                                'bb_candidates_rules', 'bb_cycles_rules'))) then
      perform pg_temp.bbg_fail('G17 security definer is not as designed for', v_fn.oid::regprocedure::text);
    end if;
    if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
       is distinct from (v_fn.name = any (v_new_fns) or v_fn.name = any (array['bb_update_cycle', 'bb_delete_cycle', 'bb_update_candidate',
                         'bb_change_plan', 'bb_restore_candidate', 'bb_delete_candidate', 'bb_cycle_roster', 'bb_candidate_detail',
                         'bb_save_cycle_dan', 'bb_undo_cycle_dan']))
       or has_function_privilege('anon', v_fn.oid, 'EXECUTE') or has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
       or has_function_privilege('bb_registrar', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) as a where a.grantee = 0) then
      perform pg_temp.bbg_fail('G17 execute rights of', v_fn.oid::regprocedure::text);
    end if;
    -- no dynamic SQL, no clock_timestamp, no "::date" on a timestamp with time zone
    if v_fn.prosrc ~* '\mexecute\M' or v_fn.prosrc ~* 'format\s*\(' or v_fn.prosrc ~* 'clock_timestamp'
       or v_fn.prosrc ~* '(now\(\)|current_timestamp|_at|p_now)\s*\)*\s*::\s*date\M' then
      perform pg_temp.bbg_fail('G17 dynamic SQL, clock_timestamp or ::date in', v_fn.name);
    end if;
    if v_fn.name = any (v_replaced) and v_fn.prosrc not like '%-- 0025: replaced%' then
      perform pg_temp.bbg_fail('G17 a replaced function lacks its marker', v_fn.name);
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any (v_new_fns || v_helpers || v_replaced)) <> 15 + 27 + 15 then
    perform pg_temp.bbg_fail('G17 the 0025 function list (15 + 27 + 15)', null);
  end if;
  select string_agg(x.sig, ', ') into v_txt
    from unnest(array[
      'public.bb_set_grade(uuid, integer, text, text)', 'public.bb_set_measured(uuid, integer, text, numeric, integer)',
      'public.bb_set_extra_count(uuid, integer, text, integer)', 'public.bb_set_makeup_subjects(uuid, text[], text[])',
      'public.bb_add_makeup(uuid, uuid)', 'public.bb_mark_result_sent(uuid, text)', 'public.bb_undo_result_sent(uuid)',
      'public.bb_set_result_text(text, integer, text)',
      'public.bb_update_candidate_clear(uuid, integer, text, text, date, text, text, integer, integer, integer, integer)',
      'public.bb_grading_grid(uuid, integer)', 'public.bb_cycle_results(uuid, integer)', 'public.bb_makeup_list(uuid)',
      'public.bb_result_email(uuid)', 'public.bb_results_csv(uuid)', 'public.bb_cycle_grading_state(uuid)',
      'public.bb_grade_result(jsonb, integer, jsonb, jsonb, text[], text[], date, date)', 'public.bb_age_groups(jsonb)',
      'public.bb_measured_letter(jsonb, integer, numeric)', 'public.bb_extra_points(jsonb, jsonb)',
      'public.bb_kept_match(jsonb, jsonb, jsonb, jsonb, integer)', 'public.bb_result_text_problem(text, text)',
      'public.bb_candidate_age(uuid)', 'public.bb_candidate_grading_input(uuid, integer)', 'public.bb_candidate_result(uuid)',
      'public.bb_candidate_result_with(public.bb_candidates, jsonb, date, date, date)', 'public.bb_cycle_has_grading(uuid)',
      'public.bb_cycle_grading_started_at(uuid)', 'public.bb_candidate_has_grades(uuid)', 'public.bb_sent_state(uuid, jsonb)',
      'public.bb_lock_candidate_shared(uuid)',
      'public.bb_update_candidate_core(uuid, integer, text, text, date, text, text, integer, integer, integer, integer)',
      'public.bb_note_grading_started()', 'public.bb_cycle_grading_started_guard()', 'public.bb_candidates_keep_age()',
      'public.bb_grades_rules()', 'public.bb_extra_counts_rules()', 'public.bb_makeup_subjects_rules()',
      'public.bb_result_sends_guard()', 'public.bb_downloads_guard()', 'public.bb_payments_makeup_guard()',
      'public.bb_cycle_days_grading()', 'public.bb_cycle_day_parts_grading()']) as x(sig)
   where to_regprocedure(x.sig) is null;
  if v_txt is not null then perform pg_temp.bbg_fail('G17 missing function signature(s)', v_txt); end if;
  if (select string_agg(p.proname || '=' || p.provolatile::text, ',' order by p.proname collate "C")
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any (v_new_fns) and p.proname in ('bb_grading_grid', 'bb_cycle_results', 'bb_makeup_list',
                                                                                    'bb_result_email', 'bb_results_csv', 'bb_cycle_grading_state'))
     <> 'bb_cycle_grading_state=s,bb_cycle_results=s,bb_grading_grid=s,bb_makeup_list=s,bb_result_email=s,bb_results_csv=v' then
    perform pg_temp.bbg_fail('G17 the volatility of the reads', null);
  end if;
  -- bb_registrar still runs exactly its two functions
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('bb_registrar', p.oid, 'EXECUTE')
         and p.proname like 'bb\_%') <> 2 then
    perform pg_temp.bbg_fail('G17 bb_registrar must run exactly bb_public_cycle and bb_public_register', null);
  end if;
  -- the triggers exist, run the right function and are enabled
  select string_agg(x.tbl || '.' || x.trg, ', ') into v_txt
    from (values ('bb_grades', 'bb_grades_before_write', 'bb_before_write'), ('bb_grades', 'bb_grades_rules', 'bb_grades_rules'),
                 ('bb_grades', 'bb_grades_grading_started', 'bb_note_grading_started'), ('bb_grades', 'bb_grades_log', 'change_log_write'),
                 ('bb_grades', 'bb_grades_no_truncate', 'testing_refuse_truncate'),
                 ('bb_extra_counts', 'bb_extra_counts_before_write', 'bb_before_write'),
                 ('bb_extra_counts', 'bb_extra_counts_rules', 'bb_extra_counts_rules'),
                 ('bb_extra_counts', 'bb_extra_counts_grading_started', 'bb_note_grading_started'),
                 ('bb_extra_counts', 'bb_extra_counts_log', 'change_log_write'),
                 ('bb_extra_counts', 'bb_extra_counts_no_truncate', 'testing_refuse_truncate'),
                 ('bb_makeup_subjects', 'bb_makeup_subjects_before_write', 'bb_before_write'),
                 ('bb_makeup_subjects', 'bb_makeup_subjects_rules', 'bb_makeup_subjects_rules'),
                 ('bb_makeup_subjects', 'bb_makeup_subjects_grading_started', 'bb_note_grading_started'),
                 ('bb_makeup_subjects', 'bb_makeup_subjects_log', 'change_log_write'),
                 ('bb_makeup_subjects', 'bb_makeup_subjects_no_truncate', 'testing_refuse_truncate'),
                 ('bb_result_texts', 'bb_result_texts_before_write', 'bb_before_write'),
                 ('bb_result_texts', 'bb_result_texts_log', 'change_log_write'),
                 ('bb_result_texts', 'bb_result_texts_no_truncate', 'testing_refuse_truncate'),
                 ('bb_result_sends', 'bb_result_sends_guard', 'bb_result_sends_guard'),
                 ('bb_result_sends', 'bb_result_sends_log', 'change_log_write'),
                 ('bb_result_sends', 'bb_result_sends_no_truncate', 'testing_refuse_truncate'),
                 ('bb_downloads', 'bb_downloads_guard', 'bb_downloads_guard'),
                 ('bb_downloads', 'bb_downloads_no_truncate', 'testing_refuse_truncate'),
                 ('bb_cycle_grading_started', 'bb_cycle_grading_started_guard', 'bb_cycle_grading_started_guard'),
                 ('bb_cycle_grading_started', 'bb_cycle_grading_started_log', 'change_log_write'),
                 ('bb_cycle_grading_started', 'bb_cycle_grading_started_no_truncate', 'testing_refuse_truncate'),
                 ('bb_candidates', 'bb_candidates_before_write', 'bb_before_write'),
                 ('bb_candidates', 'bb_candidates_keep_age', 'bb_candidates_keep_age'),
                 ('bb_candidates', 'bb_candidates_rules', 'bb_candidates_rules'),
                 ('bb_candidates', 'bb_candidates_log', 'bb_candidates_log'),
                 ('bb_payments', 'bb_payments_makeup_guard', 'bb_payments_makeup_guard'),
                 ('bb_cycle_days', 'bb_cycle_days_grading', 'bb_cycle_days_grading'),
                 ('bb_cycle_day_parts', 'bb_cycle_day_parts_grading', 'bb_cycle_day_parts_grading'),
                 ('bb_cycles', 'bb_cycles_rules', 'bb_cycles_rules')) as x(tbl, trg, fn)
   where not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                      where t.tgrelid = ('public.' || x.tbl)::regclass and t.tgname = x.trg and p.proname = x.fn
                        and t.tgenabled = 'O' and not t.tgisinternal);
  if v_txt is not null then perform pg_temp.bbg_fail('G17 missing / wrong / disabled trigger(s)', v_txt); end if;
  if (select count(*) from pg_trigger t where not t.tgisinternal
        and t.tgrelid = any (array(select ('public.' || x)::regclass from unnest(v_tables) as x))) <> 26 then
    perform pg_temp.bbg_fail('G17 exactly 26 triggers on the seven tables', null);
  end if;
  if pg_get_triggerdef((select t.oid from pg_trigger t where t.tgrelid = 'public.bb_candidates'::regclass and t.tgname = 'bb_candidates_before_write'))
     not like '%bb_before_write(''id,cycle_id,source,reference,registered_at,makeup_of_cycle_name'', ''date_of_birth,email_for_results,personal_removed_at,makeup_of_candidate_id,age_kept'')%' then
    perform pg_temp.bbg_fail('G17 bb_candidates_before_write''s arguments', null);
  end if;
  -- the rules and indexes of sections 2-3
  select string_agg(x.name, ', ') into v_txt
    from unnest(array[
      'bb_grades_candidate_fk', 'bb_grades_value_check', 'bb_grades_kept_check', 'bb_grades_kept_letter_check',
      'bb_grades_candidate_subject_key', 'bb_extra_counts_candidate_fk', 'bb_extra_counts_kept_check', 'bb_extra_counts_count_check',
      'bb_makeup_subjects_candidate_fk', 'bb_makeup_subjects_key', 'bb_makeup_subjects_kind_check', 'bb_result_texts_kind_key',
      'bb_result_texts_body_check', 'bb_result_sends_candidate_fk', 'bb_result_sends_undone_check', 'bb_result_sends_key_check',
      'bb_downloads_row_count_check', 'bb_cycle_grading_started_cycle_key', 'bb_cycle_grading_started_cycle_fk',
      'bb_candidates_makeup_of_fk', 'bb_candidates_makeup_of_self_check', 'bb_candidates_makeup_of_check',
      'bb_candidates_makeup_name_check', 'bb_candidates_makeup_plan_check', 'bb_candidates_makeup_kukkiwon_check',
      'bb_candidates_age_kept_check', 'bb_candidates_source_check']) as x(name)
   where not exists (select 1 from pg_constraint c join pg_namespace n on n.oid = c.connamespace
                      where n.nspname = 'public' and c.conname = x.name);
  if v_txt is not null then perform pg_temp.bbg_fail('G17 missing rule(s)', v_txt); end if;
  select string_agg(x.name, ', ') into v_txt
    from unnest(array['bb_grades_part_idx', 'bb_extra_counts_item_key', 'bb_result_sends_candidate_idx', 'bb_downloads_cycle_idx',
                      'bb_candidates_reference_idx', 'bb_candidates_one_active_makeup_idx', 'bb_candidates_makeup_of_idx']) as x(name)
   where to_regclass('public.' || x.name) is null;
  if v_txt is not null then perform pg_temp.bbg_fail('G17 missing index(es)', v_txt); end if;
  if pg_get_indexdef('public.bb_candidates_one_active_makeup_idx'::regclass)
     <> 'CREATE UNIQUE INDEX bb_candidates_one_active_makeup_idx ON public.bb_candidates USING btree (makeup_of_candidate_id) WHERE ((status = ''active''::text) AND (makeup_of_candidate_id IS NOT NULL))'
     or exists (select 1 from pg_constraint where conname = 'bb_candidates_reference_key')
     or (select confdeltype from pg_constraint where conname = 'bb_candidates_makeup_of_fk') <> 'n'
     or (select a.attnotnull from pg_attribute a where a.attrelid = 'public.bb_candidates'::regclass and a.attname = 'cycle_plan_id') then
    perform pg_temp.bbg_fail('G17 the make-up indexes and rules of bb_candidates', null);
  end if;


  -- ===================================================================
  -- G18. The family form is still fast (well inside its 5 seconds)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_save_waiver((select id from public.bb_waiver_versions where superseded_at is null), 'zz test waiver ' || v_tag);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G18 setup: save a waiver', v_r::text); end if;
  v_txt2 := v_r ->> 'version_name';
  v_r := public.bb_set_registration(v_reg, (select version from public.bb_cycles where id = v_reg), true);
  if v_r ->> 'status' <> 'ok' then perform pg_temp.bbg_fail('G18 setup: open registration', v_r::text); end if;
  perform set_config('request.jwt.claims', '', true);
  v_txt := (select public_code_worcester from public.bb_cycles where id = v_reg);
  v_mu := (select id from public.bb_cycle_plans where cycle_id = v_reg limit 1);
  v_d := pg_temp.bbg_dob(v_today, 30);
  v_ts := clock_timestamp();
  -- As the family form's login where the SQL Editor may switch to it (PGlite); on production the
  -- function is called directly (it checks nothing about its caller; G17 proves who may run it).
  if pg_has_role(current_user, 'bb_registrar', 'MEMBER') then
    set local role bb_registrar;
  end if;
  v_r := public.bb_public_register(v_txt, v_tag || ' fast',
                                   gen_random_uuid(), 'Fast', 'Formtest', v_d, v_mail || '.fast@example.com', 1,
                                   v_mu, false, true, v_txt2,
                                   'Jordan Testparent',
                                   'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
  reset role;
  if v_r ->> 'status' <> 'ok' or clock_timestamp() - v_ts > interval '2 seconds' then
    perform pg_temp.bbg_fail('G18 bb_public_register (ok, well under 5 seconds)', v_r::text || ' in ' || (clock_timestamp() - v_ts)::text);
  end if;

  -- the guard switched off for the 10-second test is on again
  if (select tgenabled from pg_trigger where tgrelid = 'public.bb_result_sends'::regclass and tgname = 'bb_result_sends_guard') <> 'O' then
    perform pg_temp.bbg_fail('G17 bb_result_sends_guard must be enabled', null);
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select 'ALL 0025 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
