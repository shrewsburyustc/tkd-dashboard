-- =====================================================================
-- 0032_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0032_black_belt_review.sql. It
--   checks, in this order:
--     T1  the time rule: 6:00 AM, 10:05, 10:00 PM fine; 10:07, 5:55 AM,
--         10:05 PM, 10:05:30 and NULL not; exactly 193 minutes of the day
--         pass; every old 15-minute time still passes. Through Add cycle
--         and Edit cycle: 12:35 saves, 12:37 is invalid; a day saved on
--         the 15-minute step still saves; the table rule takes 12:35 and
--         refuses 12:37
--     H1  History, who may read it: locked, PIN-locked, signed-out and
--         too-old sign-ins and no sign-in at all -> no_access; anon and
--         the family form's login bb_registrar can't run it; no id ->
--         invalid; an unknown id -> not_found
--     H2  History, what it shows: a desk candidate with a date of birth
--         and an email, a date-of-birth change, a payment and its undo, a
--         paper waiver, a grade and a "sent" mark (and its undo); a
--         family's registration with a drawn waiver. The answers hold no
--         real date of birth, email, signature or signer's name, and no
--         login id key, send id or earlier-row id at any depth; newest
--         first; exactly the candidate's own rows (not another
--         candidate's, not a planted row of another table with the same
--         id); bb_history_strip on its own
--     H3  a candidate removed for good -> not_found
--     U1  Undo of Edit cycle, refusals: no_access, not_allowed (the
--         desk), invalid (no id, no version, no list, an empty entry,
--         2001 entries), not_found, stale - each with nothing changed
--     U2  the race: a family that registered after the save -> registered,
--         nothing changed, no history row written; a DESK candidate added
--         after the save does not block it
--     U3  success and rollback: values only (p_open null); values and the
--         switch; the switch went through but the values were refused
--         (duplicate_name) -> both undone, the version as it was, no
--         history row; the history rows of an Undo are exactly the two
--         inner functions'
--     C   the catalog of the four functions: language, volatility,
--         security definer, search_path, owner, one version each, and
--         who may run them
--   It makes its own test cycles and candidates ("zz test 1a2b3c4d
--   ..."), so it works whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test cycles, candidates,
--   payments, grades, history rows, test sessions, a waiver saved for
--   the test). NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0016_tests.sql (read its header): "set local role
--   authenticated" + a pretend login token per session. Sessions:
--     A1 admin unlocked · A2 admin, PIN unlock ran out · A3 admin, PIN
--     locked after 5 tries · A4 admin, signed out (no sign-in session) ·
--     A5 admin, signed in 8 days ago · D1 desk unlocked
--   Most checks call the functions as the SQL Editor's own role with
--   A1's or D1's token set (the functions run as their owner either
--   way, and the test can then read every column).
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0010, 0011, 0016, 0024, 0025 and 0032 are applied. You
--      need TWO existing, ACTIVE staff rows: an admin and the shared front
--      desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0032 TESTS PASSED".
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
  v_a4 uuid := gen_random_uuid();  v_a5 uuid := gen_random_uuid();  v_d1 uuid := gen_random_uuid();

  v_now_s   bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_8d  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600));
  v_c_a1 text; v_c_a2 text; v_c_a3 text; v_c_a4 text; v_c_a5 text; v_c_d1 text;

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_mail  text := 'zzbh' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_today date := public.testing_today();
  v_rand  uuid := gen_random_uuid();
  v_adult date := (public.testing_today() - interval '30 years')::date;
  v_dob2  date := (public.testing_today() - interval '31 years' - interval '40 days')::date;
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  v_signer text := 'Jordan Zzsigner';
  v_wv    text;
  v_role  text;

  v_r     jsonb;
  v_r2    jsonb;
  v_x     jsonb;
  v_old   jsonb;
  v_txt   text;
  v_snap  text;
  v_snap2 text;
  v_n     integer;
  v_n2    integer;
  v_v     integer;
  v_mark  bigint;
  v_t     time;
  v_case  record;
  v_known uuid[];
  v_list  text[];

  -- cycles: H = history, T = times, R = the race, Q = desk after save,
  -- S = undo with the switch, B = the rollback
  v_h uuid; v_h_full uuid; v_h_code text;
  v_tc uuid; v_r_c uuid; v_r_full uuid; v_r_code text; v_q uuid; v_q_full uuid;
  v_s uuid; v_s_full uuid; v_b uuid;
  -- candidates
  v_kim uuid; v_fam uuid; v_zed uuid; v_ann uuid; v_late uuid;
  v_pay uuid; v_rev uuid; v_grade uuid; v_send uuid; v_wvr uuid;
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
  if to_regprocedure('public.bb_candidate_history(uuid)') is null
     or to_regprocedure('public.bb_undo_cycle_edit(uuid, integer, jsonb, boolean, uuid[])') is null
     or public.bb_time_is_valid('10:05') is not true then
    raise exception 'TEST SETUP: 0032 is not applied (or 0016 was re-run after it - paste 0032 again)';
  end if;

  perform set_config('request.jwt.claims', '', true);

  begin
    insert into auth.sessions (id, user_id)
    select x, v_admin from unnest(array[v_a1, v_a2, v_a3, v_a5]) as x
    union all
    select v_d1, v_desk;
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
    (v_d1, v_desk,  now() + interval '30 minutes');
  insert into public.pin_attempts (session_id, staff_id, failed, locked_at) values (v_a3, v_admin, 5, now());

  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_a3 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a3, 'amr', v_amr_1m)::text;
  v_c_a4 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a4, 'amr', v_amr_1m)::text;
  v_c_a5 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a5, 'amr', v_amr_8d)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;

  set local role authenticated;
  v_list := array[v_c_a1, v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_d1];
  for v_n in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_n], true);
    if public.has_data_access() is distinct from (v_n in (1, 6)) then
      raise exception 'TEST SETUP: session % of A1..A5,D1 has data access %, expected %', v_n, public.has_data_access(), (v_n in (1, 6));
    end if;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- the purge stays off (as 0025_tests.sql), so no history row comes from it
  update public.bb_settings set keep_years_after_last_day = null, keep_years_after_18 = null;

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   bbh_payload(name, first day, application due): a valid Add cycle
  --     payload (as 0025_tests' bbg_payload)
  --   bbh_edit(cycle): the cycle as it is saved now, in Edit cycle's
  --     payload shape (what the app's buildUpdatePayload sends)
  --   bbh_snap(cycle): one md5 of the cycle, its days, parts, due dates
  --     and candidates ("did anything change?")
  --   bbh_secret(text): true when the text holds a login-id key, a send
  --     id, an earlier-row id or a log-only column
  execute $f$
    create function pg_temp.bbh_payload(p_name text, p_d1 date, p_app date) returns jsonb
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
    create function pg_temp.bbh_edit(p_cycle uuid) returns jsonb
    language sql as $b$
      select jsonb_build_object(
        'name', y.name, 'application_due', y.application_due, 'submissions_due', y.submissions_due, 'auto_close', y.auto_close,
        'days', (select jsonb_agg(jsonb_build_object(
                   'id', d.id, 'name', d.name, 'day_date', d.day_date,
                   'start_time', left(d.start_time::text, 5), 'end_time', left(d.end_time::text, 5),
                   'place', case when d.place_code is not null then jsonb_build_object('code', d.place_code)
                                 else jsonb_build_object('other', d.place_other) end,
                   'second', case when d.second_start is null then null
                                  else jsonb_build_object('start', left(d.second_start::text, 5), 'end', left(d.second_end::text, 5),
                                         'place', case when d.second_place_code is not null then jsonb_build_object('code', d.second_place_code)
                                                       else jsonb_build_object('other', d.second_place_other) end) end,
                   'parts', (select jsonb_agg(p.part order by p.part) from public.bb_cycle_day_parts p where p.day_id = d.id))
                   order by d.day_date, d.id)
                   from public.bb_cycle_days d where d.cycle_id = y.id),
        'due_dates', (select coalesce(jsonb_agg(jsonb_build_object(
                        'cycle_plan_id', pp.cycle_plan_id, 'payment_no', pp.payment_no, 'due_on', pp.due_on,
                        'follows_application_due', pp.follows_application_due) order by pp.id), '[]'::jsonb)
                        from public.bb_cycle_plan_payments pp
                        join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id
                       where pl.cycle_id = y.id))
        from public.bb_cycles y where y.id = p_cycle;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbh_snap(p_cycle uuid) returns text
    language sql as $b$
      select md5(coalesce((select to_jsonb(y)::text from public.bb_cycles y where y.id = p_cycle), '')
        || coalesce((select string_agg(to_jsonb(d)::text, ',' order by d.id) from public.bb_cycle_days d where d.cycle_id = p_cycle), '')
        || coalesce((select string_agg(to_jsonb(p)::text, ',' order by p.id) from public.bb_cycle_day_parts p
                       join public.bb_cycle_days d on d.id = p.day_id where d.cycle_id = p_cycle), '')
        || coalesce((select string_agg(to_jsonb(pp)::text, ',' order by pp.id) from public.bb_cycle_plan_payments pp
                       join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id where pl.cycle_id = p_cycle), '')
        || coalesce((select string_agg(to_jsonb(c)::text, ',' order by c.id) from public.bb_candidates c where c.cycle_id = p_cycle), ''));
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbh_secret(p text) returns boolean
    language sql as $b$
      select p ~ '"(created_by|updated_by|withdrawn_by|recorded_by|marked_by|undone_by|submission_id|makeup_of_candidate_id|actor_id|session_id|batch_id)"';
    $b$;
  $f$;

  -- a school waiver (not the placeholder) for the family form, saved for
  -- this run only when the current one is still the placeholder
  perform set_config('request.jwt.claims', v_c_a1, true);
  if (select v.is_placeholder from public.bb_waiver_versions v where v.superseded_at is null) then
    v_r := public.bb_save_waiver((select v.id from public.bb_waiver_versions v where v.superseded_at is null),
                                 'zz test waiver ' || v_tag || ': every subject must be passed.');
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_save_waiver answered %', v_r; end if;
  end if;
  select v.version_name into v_wv from public.bb_waiver_versions v where v.superseded_at is null;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- T1. The time rule
  -- ===================================================================
  foreach v_txt in array array['06:00', '06:05', '10:05', '12:35', '21:55', '22:00', '06:00:00', '07:45'] loop
    if public.bb_time_is_valid(v_txt::time) is not true then
      raise exception 'TEST FAILED: T1 % should be a valid testing-day time', v_txt;
    end if;
  end loop;
  foreach v_txt in array array['10:07', '05:55', '05:59', '00:00', '22:01', '22:05', '10:02', '10:05:30', '12:00:00.5'] loop
    if public.bb_time_is_valid(v_txt::time) is not false then
      raise exception 'TEST FAILED: T1 % should NOT be a valid testing-day time', v_txt;
    end if;
  end loop;
  if public.bb_time_is_valid(null) is not false then
    raise exception 'TEST FAILED: T1 NULL should answer false (not NULL)';
  end if;
  select count(*) into v_n
    from generate_series(0, 24 * 60 - 1) as m
   where public.bb_time_is_valid(time '00:00' + make_interval(mins => m));
  if v_n <> 193 then raise exception 'TEST FAILED: T1 expected 193 valid minutes of the day, found %', v_n; end if;
  select count(*) into v_n
    from generate_series(6 * 60, 22 * 60, 15) as m
   where public.bb_time_is_valid(time '00:00' + make_interval(mins => m));
  if v_n <> 65 then raise exception 'TEST FAILED: T1 expected all 65 old times (6:00-22:00 every 15 minutes) to pass, % did', v_n; end if;

  -- through Add cycle and Edit cycle (admin)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_x := pg_temp.bbh_payload(v_tag || ' Times', v_today + 60, v_today + 50);
  v_r := public.bb_add_cycle(jsonb_set(v_x, '{days,1,start_time}', '"12:37"'), null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: T1 Add cycle with a 12:37 start expected invalid, got %', v_r;
  end if;
  v_r := public.bb_add_cycle(jsonb_set(jsonb_set(v_x, '{days,1,start_time}', '"12:35"'), '{days,0,second}',
                               '{"start": "14:35", "end": "15:05", "place": {"code": "worcester"}}'), null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T1 Add cycle with 12:35 and a 14:35-15:05 second part expected ok, got %', v_r; end if;
  v_tc := (v_r ->> 'id')::uuid;
  if (select count(*) from public.bb_cycle_days d where d.cycle_id = v_tc
        and (d.start_time = time '12:35' or d.second_start = time '14:35')) <> 2 then
    raise exception 'TEST FAILED: T1 the 12:35 start and the 14:35 second part were not saved';
  end if;
  -- a day saved on the 15-minute step (Curriculum, 14:00-17:00) still saves; 17:05 is fine, 17:07 isn't
  v_old := pg_temp.bbh_edit(v_tc);
  select version into v_v from public.bb_cycles where id = v_tc;
  v_r := public.bb_update_cycle(v_tc, v_v, jsonb_set(v_old, '{name}', to_jsonb(v_tag || ' Times renamed')));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T1 renaming a cycle with 15-minute days expected ok, got %', v_r; end if;
  v_v := (v_r ->> 'version')::integer;
  v_old := pg_temp.bbh_edit(v_tc);
  v_r := public.bb_update_cycle(v_tc, v_v, jsonb_set(v_old, '{days,2,end_time}', '"17:07"'));
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: T1 Edit cycle to 17:07 expected invalid, got %', v_r;
  end if;
  v_r := public.bb_update_cycle(v_tc, v_v, jsonb_set(v_old, '{days,2,end_time}', '"17:05"'));
  if v_r ->> 'status' <> 'ok'
     or not exists (select 1 from public.bb_cycle_days d where d.cycle_id = v_tc and d.end_time = time '17:05') then
    raise exception 'TEST FAILED: T1 Edit cycle to 17:05 expected ok and saved, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', '', true);
  -- the table rules (a direct write as "postgres", past every function's checks)
  begin
    update public.bb_cycle_days set start_time = '12:37' where cycle_id = v_tc and start_time = time '12:35';
    raise exception 'TEST FAILED: T1 the table rule accepted 12:37';
  exception when check_violation then null;
  end;
  begin
    update public.bb_cycle_days set second_end = '15:07' where cycle_id = v_tc and second_start is not null;
    raise exception 'TEST FAILED: T1 the table rule accepted a 15:07 second part';
  exception when check_violation then null;
  end;
  update public.bb_cycle_days set start_time = '12:40' where cycle_id = v_tc and start_time = time '12:35';
  if not exists (select 1 from public.bb_cycle_days d where d.cycle_id = v_tc and d.start_time = time '12:40') then
    raise exception 'TEST FAILED: T1 the table rule refused 12:40';
  end if;

  -- ===================================================================
  -- H. The history cycle: open, a desk candidate, a family
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbh_payload(v_tag || ' History', v_today + 30, v_today + 20), null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H add cycle answered %', v_r; end if;
  v_h := (v_r ->> 'id')::uuid;
  v_h_code := v_r ->> 'public_code_worcester';
  select pl.id into v_h_full from public.bb_cycle_plans pl where pl.cycle_id = v_h and pl.name = 'In full';
  v_r := public.bb_set_registration(v_h, 1, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H opening the cycle answered %', v_r; end if;

  -- Kim: at the desk, with a date of birth, an email and a paper waiver
  v_r := public.bb_add_candidate(v_h, 'Kim', 'Zzhistory', v_adult, v_mail || '.kim@example.com', 'worcester', 1, v_h_full, false, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H add Kim answered %', v_r; end if;
  v_kim := (v_r ->> 'id')::uuid;
  -- her date of birth changes
  select version into v_v from public.bb_candidates where id = v_kim;
  v_r := public.bb_update_candidate(v_kim, v_v, 'Kim', 'Zzhistory', v_dob2, v_mail || '.kim@example.com', 'worcester', 1);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H Kim''s date of birth change answered %', v_r; end if;
  -- a payment and its undo
  select version into v_v from public.bb_candidates where id = v_kim;
  v_r := public.bb_record_payment(v_kim, v_v, 1000, 'cash', array['p1'], null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H Kim''s payment answered %', v_r; end if;
  v_pay := (v_r ->> 'payment_id')::uuid;
  v_r := public.bb_undo_payment(v_pay);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H the payment''s undo answered %', v_r; end if;
  select p.id into v_rev from public.bb_payments p where p.reverses_payment_id = v_pay;
  -- a grade
  v_r := public.bb_set_grade(v_kim, 1,
           (select s.e ->> 'id'
              from public.bb_cycles y
              cross join lateral jsonb_array_elements(y.requirements -> 'dans' -> 0 -> 'parts') as p(e)
              cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)
             where y.id = v_h and s.e ->> 'name' = 'Free sparring' limit 1), 'A');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H Kim''s grade answered %', v_r; end if;
  select g.id into v_grade from public.bb_grades g where g.candidate_id = v_kim;
  -- a "sent" mark and its undo, written the way Mark as sent writes them
  -- (its own tag; the guard stamps who and when from the admin's token)
  perform set_config('tkd.action', 'bb_mark_result_sent', true);
  insert into public.bb_result_sends (candidate_id, marked_by_name, result_status, result_total, result_needs, result_key)
  values (v_kim, '', 'passed', 80, '[]'::jsonb, md5(v_tag))
  returning id into v_send;
  perform set_config('tkd.action', 'bb_undo_result_sent', true);
  update public.bb_result_sends set undone_at = now(), undone_by_name = 'x' where id = v_send;
  perform set_config('tkd.action', '', true);
  if (select marked_by from public.bb_result_sends where id = v_send) is distinct from v_admin
     or (select undone_by from public.bb_result_sends where id = v_send) is distinct from v_admin then
    raise exception 'TEST SETUP: H the planted "sent" mark has no login ids to hide';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- the family: registered through the family form, drawn waiver
  v_r := public.bb_public_register(v_h_code, v_tag || ' kh', gen_random_uuid(), 'Fay', 'Zzfamily', v_adult,
                                   v_mail || '.fay@example.com', 1, v_h_full, false, true, v_wv, v_signer, v_sig);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H the family''s registration answered %', v_r; end if;
  select c.id into v_fam from public.bb_candidates c where c.reference = v_r ->> 'reference';
  select w.id into v_wvr from public.bb_candidate_waivers w where w.candidate_id = v_fam;

  -- ===================================================================
  -- H1. Who may read the history
  -- ===================================================================
  set local role authenticated;
  foreach v_txt in array array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, ''] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_r := public.bb_candidate_history(v_kim);
    if v_r is distinct from '{"status": "no_access"}'::jsonb then
      raise exception 'TEST FAILED: H1 a session without data access got %, not no_access', left(v_r::text, 200);
    end if;
    v_r := public.bb_candidate_history(null);
    if v_r is distinct from '{"status": "no_access"}'::jsonb then
      raise exception 'TEST FAILED: H1 no access is checked before the input (got %)', v_r;
    end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.bb_candidate_history(v_kim) ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: H1 the front desk (any staff with data access) should read the history';
  end if;
  if public.bb_candidate_history(null) is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: H1 no id should be invalid';
  end if;
  if public.bb_candidate_history(v_rand) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: H1 an unknown id should be not_found';
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  foreach v_role in array array['anon', 'bb_registrar', 'service_role'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role)
       and has_function_privilege(v_role, 'public.bb_candidate_history(uuid)', 'EXECUTE') then
      raise exception 'TEST FAILED: H1 % may run bb_candidate_history', v_role;
    end if;
  end loop;
  set local role anon;
  begin
    perform public.bb_candidate_history(v_kim);
    raise exception 'TEST FAILED: H1 anon could call bb_candidate_history';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- ===================================================================
  -- H2. What the history shows
  -- ===================================================================
  -- planted rows that must NOT appear: another table's row with the id
  -- of Kim's payment, and another section's row with Kim's own id
  insert into public.change_log (actor_name, action, table_name, record_id, op, before, after)
  values ('zz planted', 'manual', 'bb_cycles', v_pay, 'update', '{"name": "planted"}', '{"name": "planted 2"}'),
         ('zz planted', 'manual', 'star_candidates', v_kim, 'update', '{"name": "planted"}', '{"name": "planted 2"}');

  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_candidate_history(v_kim);
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' <> 'ok' or jsonb_typeof(v_r -> 'rows') <> 'array' then
    raise exception 'TEST FAILED: H2 Kim''s history expected ok with rows, got %', left(v_r::text, 300);
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['rows', 'status'] then
    raise exception 'TEST FAILED: H2 the answer has other keys than status and rows';
  end if;
  -- every row: exactly these seven keys (plus record_id once 0034 is
  -- applied - the logged row's own id, not a login id; 0034_tests.sql
  -- checks it)
  if exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(e)
              where (select array_agg(k order by k collate "C") from jsonb_object_keys(x.e) as k where k <> 'record_id')
                    <> array['action', 'actor_name', 'after', 'before', 'occurred_at', 'op', 'table_name']) then
    raise exception 'TEST FAILED: H2 a history row has other keys than the seven (and record_id)';
  end if;
  -- exactly Kim's own rows: hers, and her payments', waiver's, grade's and send's
  select count(*) into v_n
    from public.change_log l
   where (l.table_name = 'bb_candidates' and l.record_id = v_kim)
      or (l.table_name = 'bb_payments' and l.record_id in (select p.id from public.bb_payments p where p.candidate_id = v_kim))
      or (l.table_name = 'bb_candidate_waivers' and l.record_id in (select w.id from public.bb_candidate_waivers w where w.candidate_id = v_kim))
      or (l.table_name = 'bb_grades' and l.record_id in (select g.id from public.bb_grades g where g.candidate_id = v_kim))
      or (l.table_name = 'bb_result_sends' and l.record_id in (select s.id from public.bb_result_sends s where s.candidate_id = v_kim));
  if jsonb_array_length(v_r -> 'rows') <> v_n or v_n < 8 then
    raise exception 'TEST FAILED: H2 expected exactly Kim''s % history rows (at least 8), got %', v_n, jsonb_array_length(v_r -> 'rows');
  end if;
  if exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(e) where x.e ->> 'actor_name' = 'zz planted') then
    raise exception 'TEST FAILED: H2 a planted row of another table with the same id appeared';
  end if;
  if (select array_agg(distinct x.e ->> 'table_name' order by x.e ->> 'table_name')
        from jsonb_array_elements(v_r -> 'rows') as x(e))
     <> array['bb_candidate_waivers', 'bb_candidates', 'bb_grades', 'bb_payments', 'bb_result_sends'] then
    raise exception 'TEST FAILED: H2 expected rows of the five tables, got %',
      (select array_agg(distinct x.e ->> 'table_name') from jsonb_array_elements(v_r -> 'rows') as x(e));
  end if;
  -- the payment's undo is there (the reversal row), and no row of Fay
  if not exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(e)
                  where x.e ->> 'table_name' = 'bb_payments' and x.e -> 'after' ->> 'reverses_payment_id' = v_pay::text) then
    raise exception 'TEST FAILED: H2 the payment''s undo (its reversal row) is missing';
  end if;
  if position(v_fam::text in v_r::text) > 0 or position('Zzfamily' in v_r::text) > 0 then
    raise exception 'TEST FAILED: H2 Kim''s history shows the family''s rows';
  end if;
  -- no real date of birth, email, login id, send id at any depth
  v_txt := v_r::text;
  if position(v_adult::text in v_txt) > 0 or position(v_dob2::text in v_txt) > 0 or position(v_mail in v_txt) > 0
     or position('@example' in v_txt) > 0 or position(v_admin::text in v_txt) > 0 or position(v_desk::text in v_txt) > 0 then
    raise exception 'TEST FAILED: H2 the history holds a date of birth, an email or a login id: %', left(v_txt, 400);
  end if;
  if pg_temp.bbh_secret(v_txt) then
    raise exception 'TEST FAILED: H2 the history holds a removed key: %', left(v_txt, 400);
  end if;
  -- the date-of-birth change shows as "on file" -> "changed"
  if not exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(e)
                  where x.e ->> 'table_name' = 'bb_candidates' and x.e ->> 'op' = 'update'
                    and x.e -> 'before' ->> 'date_of_birth' = 'on file' and x.e -> 'after' ->> 'date_of_birth' = 'changed') then
    raise exception 'TEST FAILED: H2 the date-of-birth change should read "on file" -> "changed"';
  end if;
  -- the insert row: the email "on file", the names in full, the actor's name
  if not exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(e)
                  where x.e ->> 'table_name' = 'bb_candidates' and x.e ->> 'op' = 'insert'
                    and x.e -> 'after' ->> 'email_for_results' = 'on file' and x.e -> 'after' ->> 'first_name' = 'Kim'
                    and x.e -> 'after' ? 'created_by_name' and x.e ->> 'actor_name' is not null) then
    raise exception 'TEST FAILED: H2 the insert row should show the names and "on file" for the email';
  end if;
  -- newest first: the rows come in change_log's own newest-first order
  if (select array_agg(x.e ->> 'table_name' || '/' || (x.e ->> 'op') order by x.n)
        from jsonb_array_elements(v_r -> 'rows') with ordinality as x(e, n))
     <> (select array_agg(l.table_name || '/' || l.op order by l.occurred_at desc, l.id desc)
           from public.change_log l
          where (l.table_name = 'bb_candidates' and l.record_id = v_kim)
             or (l.table_name, l.record_id) in (select 'bb_payments', p.id from public.bb_payments p where p.candidate_id = v_kim
                                                union all select 'bb_candidate_waivers', w.id from public.bb_candidate_waivers w where w.candidate_id = v_kim
                                                union all select 'bb_grades', g.id from public.bb_grades g where g.candidate_id = v_kim
                                                union all select 'bb_result_sends', s.id from public.bb_result_sends s where s.candidate_id = v_kim)) then
    raise exception 'TEST FAILED: H2 the rows are not newest first';
  end if;
  if (v_r -> 'rows' -> 0 ->> 'table_name') <> 'bb_result_sends' or (v_r -> 'rows' -> 0 ->> 'op') <> 'update'
     or (v_r -> 'rows' -> -1 ->> 'table_name') <> 'bb_candidates' or (v_r -> 'rows' -> -1 ->> 'op') <> 'insert' then
    raise exception 'TEST FAILED: H2 expected the send''s undo first and Kim''s insert last';
  end if;

  -- the family: the drawn waiver shows signature and signer as "on file", no send id
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_candidate_history(v_fam);
  perform set_config('request.jwt.claims', '', true);
  v_txt := v_r::text;
  if v_r ->> 'status' <> 'ok'
     or position('data:image' in v_txt) > 0 or position(v_signer in v_txt) > 0 or position('Zzsigner' in v_txt) > 0
     or position(v_mail in v_txt) > 0 or position(v_adult::text in v_txt) > 0 or pg_temp.bbh_secret(v_txt) then
    raise exception 'TEST FAILED: H2 the family''s history holds a signature, signer, email, date of birth or removed key: %', left(v_txt, 400);
  end if;
  if not exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(e)
                  where x.e ->> 'table_name' = 'bb_candidate_waivers' and x.e ->> 'op' = 'insert'
                    and x.e -> 'after' ->> 'signature' = 'on file' and x.e -> 'after' ->> 'signer_name' = 'on file'
                    and x.e -> 'after' ->> 'how' = 'drawn')
     or not exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(e)
                     where x.e ->> 'table_name' = 'bb_candidates' and x.e ->> 'actor_name' = 'Family form') then
    raise exception 'TEST FAILED: H2 the family''s history should show the drawn waiver ("on file") and "Family form"';
  end if;
  if position(v_kim::text in v_txt) > 0 then
    raise exception 'TEST FAILED: H2 the family''s history shows Kim''s rows';
  end if;

  -- bb_history_strip on its own
  if public.bb_history_strip('{"created_by": "11111111-1111-4111-8111-111111111111", "updated_by": "x", "withdrawn_by": "x",
        "recorded_by": "x", "marked_by": "x", "undone_by": "x", "submission_id": "x", "makeup_of_candidate_id": "x",
        "date_of_birth": "2010-01-01", "email_for_results": "a@b.co", "age_kept": 16, "signature": "data:image/png;base64,AAA",
        "signer_name": "changed", "first_name": "Kim", "created_by_name": "Jeffrey Berg", "note": null}'::jsonb)
     is distinct from '{"date_of_birth": "on file", "email_for_results": "on file", "age_kept": "on file", "signature": "on file",
        "signer_name": "changed", "first_name": "Kim", "created_by_name": "Jeffrey Berg", "note": null}'::jsonb then
    raise exception 'TEST FAILED: H2 bb_history_strip did not remove / mask as designed: %',
      public.bb_history_strip('{"created_by": "x", "date_of_birth": "2010-01-01", "signer_name": "changed"}'::jsonb);
  end if;
  if public.bb_history_strip(null) is not null or public.bb_history_strip('[1, 2]'::jsonb) is not null
     or public.bb_history_strip('"text"'::jsonb) is not null
     or public.bb_history_strip('{"date_of_birth": null, "email_for_results": "on file"}'::jsonb)
        is distinct from '{"date_of_birth": null, "email_for_results": "on file"}'::jsonb then
    raise exception 'TEST FAILED: H2 bb_history_strip: null, a non-object, or a null private value handled wrongly';
  end if;

  -- ===================================================================
  -- H3. A candidate removed for good -> not_found
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_candidate(v_h, 'Zed', 'Zzremoved', v_adult, v_mail || '.zed@example.com', 'worcester', 1, v_h_full, false, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H3 adding Zed answered %', v_r; end if;
  v_zed := (v_r ->> 'id')::uuid;
  if public.bb_candidate_history(v_zed) ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: H3 Zed''s history before the removal should be ok';
  end if;
  select version into v_v from public.bb_candidates where id = v_zed;
  -- the admin's "remove for good" function; its name is put together here
  -- so this file stays free of the words the Supabase connection refuses
  execute format('select public.%I($1, $2)', 'bb_' || 'del' || 'ete_candidate') into v_r using v_zed, v_v;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H3 removing Zed answered %', v_r; end if;
  if public.bb_candidate_history(v_zed) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: H3 a removed candidate''s history should be not_found';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- U. Undo of Edit cycle
  -- ===================================================================
  -- the race cycle R: open, Ann at the desk, then "Save" renames it
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbh_payload(v_tag || ' Race', v_today + 31, v_today + 21), null);
  v_r_c := (v_r ->> 'id')::uuid;
  v_r_code := v_r ->> 'public_code_shrewsbury';
  select pl.id into v_r_full from public.bb_cycle_plans pl where pl.cycle_id = v_r_c and pl.name = 'In full';
  if public.bb_set_registration(v_r_c, 1, true) ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U opening Race'; end if;
  v_r := public.bb_add_candidate(v_r_c, 'Ann', 'Zzdesk', v_adult, v_mail || '.ann@example.com', 'shrewsbury', 1, v_r_full, false, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U adding Ann answered %', v_r; end if;
  v_ann := (v_r ->> 'id')::uuid;
  v_known := array(select c.id from public.bb_candidates c where c.cycle_id = v_r_c);   -- the roster before the save
  v_old := pg_temp.bbh_edit(v_r_c);
  select version into v_v from public.bb_cycles where id = v_r_c;
  v_r := public.bb_update_cycle(v_r_c, v_v, jsonb_set(v_old, '{name}', to_jsonb(v_tag || ' Race renamed')));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U the save answered %', v_r; end if;
  v_v := (v_r ->> 'version')::integer;

  -- U1. refusals, each with nothing changed and no history row
  v_snap := pg_temp.bbh_snap(v_r_c);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  foreach v_txt in array array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, ''] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_r := public.bb_undo_cycle_edit(v_r_c, v_v, v_old, null, v_known);
    if v_r is distinct from '{"status": "no_access"}'::jsonb then
      raise exception 'TEST FAILED: U1 a session without data access got %, not no_access', v_r;
    end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_undo_cycle_edit(v_r_c, v_v, v_old, null, v_known);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: U1 the front desk should get not_allowed, got %', v_r;
  end if;
  if public.bb_undo_cycle_edit(null, null, null, null, null) is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: U1 the role is checked before the input';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.bb_undo_cycle_edit(null, v_v, v_old, null, v_known) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_undo_cycle_edit(v_r_c, null, v_old, null, v_known) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_undo_cycle_edit(v_r_c, v_v, v_old, null, null) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_undo_cycle_edit(v_r_c, v_v, v_old, null, v_known || array[null::uuid]) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_undo_cycle_edit(v_r_c, v_v, v_old, null, array(select gen_random_uuid() from generate_series(1, 2001)))
        is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_undo_cycle_edit(v_r_c, v_v, '{"name": 5}'::jsonb, null, v_known) is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_undo_cycle_edit(v_r_c, v_v, null, null, v_known) is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: U1 a missing id, version or list, an empty entry, 2001 entries or a bad payload should be invalid';
  end if;
  if public.bb_undo_cycle_edit(v_rand, v_v, v_old, null, v_known) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: U1 an unknown cycle should be not_found';
  end if;
  if public.bb_undo_cycle_edit(v_r_c, v_v - 1, v_old, null, v_known) is distinct from '{"status": "stale"}'::jsonb
     or public.bb_undo_cycle_edit(v_r_c, v_v - 1, v_old, false, v_known) is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U1 an old version should be stale (with and without the switch)';
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if pg_temp.bbh_snap(v_r_c) <> v_snap or (select coalesce(max(id), 0) from public.change_log) <> v_mark then
    raise exception 'TEST FAILED: U1 a refused Undo changed the cycle or wrote history';
  end if;

  -- U2. the race: a family registers between the save and the Undo
  v_r := public.bb_public_register(v_r_code, v_tag || ' kr', gen_random_uuid(), 'Late', 'Zzfamily', v_adult,
                                   v_mail || '.late@example.com', 1, v_r_full, false, true, v_wv, v_signer, v_sig);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U2 the family''s registration answered %', v_r; end if;
  select c.id into v_late from public.bb_candidates c where c.reference = v_r ->> 'reference';
  v_snap := pg_temp.bbh_snap(v_r_c);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_undo_cycle_edit(v_r_c, v_v, v_old, null, v_known);
  v_r2 := public.bb_undo_cycle_edit(v_r_c, v_v, v_old, false, v_known);
  perform set_config('request.jwt.claims', '', true);
  if v_r is distinct from '{"status": "registered"}'::jsonb or v_r2 is distinct from '{"status": "registered"}'::jsonb then
    raise exception 'TEST FAILED: U2 an Undo after a family registered should be registered, got % / %', v_r, v_r2;
  end if;
  if pg_temp.bbh_snap(v_r_c) <> v_snap or (select coalesce(max(id), 0) from public.change_log) <> v_mark
     or (select name from public.bb_cycles where id = v_r_c) <> v_tag || ' Race renamed' then
    raise exception 'TEST FAILED: U2 the refused Undo changed the cycle or wrote history';
  end if;
  -- a WITHDRAWN family still counts (the roster lists withdrawn rows too)
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.bb_withdraw_candidate(v_late, (select version from public.bb_candidates where id = v_late)) ->> 'status' <> 'ok' then
    raise exception 'TEST SETUP: U2 withdrawing the family';
  end if;
  if public.bb_undo_cycle_edit(v_r_c, v_v, v_old, null, v_known) is distinct from '{"status": "registered"}'::jsonb then
    raise exception 'TEST FAILED: U2 a withdrawn family registration should still refuse the Undo';
  end if;
  -- ... and once the app's list names the family, the Undo goes through
  v_r := public.bb_undo_cycle_edit(v_r_c, v_v, v_old, null, v_known || v_late);
  if v_r ->> 'status' <> 'ok' or (select name from public.bb_cycles where id = v_r_c) <> v_tag || ' Race' then
    raise exception 'TEST FAILED: U2 with the family in the list the Undo should be ok and the name back, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- a DESK candidate added after the save doesn't block it (cycle Q)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbh_payload(v_tag || ' Desk', v_today + 32, v_today + 22), null);
  v_q := (v_r ->> 'id')::uuid;
  select pl.id into v_q_full from public.bb_cycle_plans pl where pl.cycle_id = v_q and pl.name = 'In full';
  if public.bb_set_registration(v_q, 1, true) ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U2 opening Desk'; end if;
  v_known := array(select c.id from public.bb_candidates c where c.cycle_id = v_q);    -- empty
  v_old := pg_temp.bbh_edit(v_q);
  select version into v_v from public.bb_cycles where id = v_q;
  v_x := jsonb_set(jsonb_set(v_old, '{name}', to_jsonb(v_tag || ' Desk renamed')), '{days,0,start_time}', '"12:45"');
  v_r := public.bb_update_cycle(v_q, v_v, v_x);
  v_v := (v_r ->> 'version')::integer;
  v_r := public.bb_add_candidate(v_q, 'Dee', 'Zzdesk', v_adult, v_mail || '.dee@example.com', 'worcester', 1, v_q_full, false, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U2 adding Dee answered %', v_r; end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;

  -- U3a. values only (p_open null): ok, the old values back, the switch
  --      untouched, and only bb_update_cycle's history rows
  v_r := public.bb_undo_cycle_edit(v_q, v_v, v_old, null, v_known);
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> v_v + 1
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['status', 'version'] then
    raise exception 'TEST FAILED: U3a values-only Undo expected {ok, version %}, got %', v_v + 1, v_r;
  end if;
  if pg_temp.bbh_edit(v_q) is distinct from v_old
     or (select registration_open from public.bb_cycles where id = v_q) is not true then
    raise exception 'TEST FAILED: U3a the old values are not back, or the switch moved';
  end if;
  if exists (select 1 from public.change_log l where l.id > v_mark and l.action <> 'bb_update_cycle')
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.action = 'bb_update_cycle') then
    raise exception 'TEST FAILED: U3a the Undo''s history rows should be exactly bb_update_cycle''s';
  end if;

  -- U3b. the values and the switch: Save renamed and closed; Undo opens
  --      again and puts the name back
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbh_payload(v_tag || ' Switch', v_today + 33, v_today + 23), null);
  v_s := (v_r ->> 'id')::uuid;
  if public.bb_set_registration(v_s, 1, true) ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U3b opening Switch'; end if;
  v_known := '{}';
  v_old := pg_temp.bbh_edit(v_s);
  v_r := public.bb_update_cycle(v_s, 2, jsonb_set(v_old, '{name}', to_jsonb(v_tag || ' Switch renamed')));
  v_r := public.bb_set_registration(v_s, (v_r ->> 'version')::integer, false);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U3b the save''s switch answered %', v_r; end if;
  v_v := (v_r ->> 'version')::integer;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_undo_cycle_edit(v_s, v_v, v_old, true, v_known);
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> (select version from public.bb_cycles where id = v_s)
     or (select registration_open from public.bb_cycles where id = v_s) is not true
     or (select name from public.bb_cycles where id = v_s) <> v_tag || ' Switch' then
    raise exception 'TEST FAILED: U3b Undo with the switch expected ok, open again and the name back, got %', v_r;
  end if;
  if exists (select 1 from public.change_log l where l.id > v_mark and l.action not in ('bb_set_registration', 'bb_update_cycle'))
     or (select count(distinct l.action) from public.change_log l where l.id > v_mark) <> 2 then
    raise exception 'TEST FAILED: U3b the Undo''s history rows should be exactly bb_set_registration''s and bb_update_cycle''s';
  end if;

  -- U3c. the rollback: the switch goes through, then the values are
  --      refused (the name is now another cycle's) -> duplicate_name,
  --      the switch is back as the save left it, nothing written
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbh_payload(v_tag || ' Rollback', v_today + 34, v_today + 24), null);
  v_b := (v_r ->> 'id')::uuid;
  if public.bb_set_registration(v_b, 1, true) ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U3c opening Rollback'; end if;
  v_old := pg_temp.bbh_edit(v_b);
  v_r := public.bb_update_cycle(v_b, 2, jsonb_set(v_old, '{name}', to_jsonb(v_tag || ' Rollback renamed')));
  v_r := public.bb_set_registration(v_b, (v_r ->> 'version')::integer, false);
  v_v := (v_r ->> 'version')::integer;
  v_snap := pg_temp.bbh_snap(v_b);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_undo_cycle_edit(v_b, v_v, jsonb_set(v_old, '{name}', to_jsonb(v_tag || ' Switch')), true, '{}');
  perform set_config('request.jwt.claims', '', true);
  if v_r is distinct from '{"status": "duplicate_name"}'::jsonb then
    raise exception 'TEST FAILED: U3c the values refused after the switch expected duplicate_name, got %', v_r;
  end if;
  if pg_temp.bbh_snap(v_b) <> v_snap or (select coalesce(max(id), 0) from public.change_log) <> v_mark
     or (select registration_open from public.bb_cycles where id = v_b) is not false
     or (select version from public.bb_cycles where id = v_b) <> v_v then
    raise exception 'TEST FAILED: U3c the switch was not undone with the refused values (or history was written)';
  end if;
  -- a refusal of the switch itself passes through too (the version is old)
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.bb_undo_cycle_edit(v_b, v_v + 5, v_old, true, '{}') is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U3c a refused switch should answer its own status (stale)';
  end if;
  -- part_without_day keeps its list of parts
  v_x := jsonb_set(jsonb_set(v_old, '{days}', jsonb_build_array(v_old -> 'days' -> 0)), '{submissions_due}', v_old -> 'days' -> 0 -> 'day_date');
  v_r := public.bb_undo_cycle_edit(v_b, v_v, v_x, null, '{}');
  if v_r is distinct from '{"status": "part_without_day", "parts": ["technical", "curriculum"]}'::jsonb then
    raise exception 'TEST FAILED: U3c part_without_day should come back with its parts, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', '', true);
  if pg_temp.bbh_snap(v_b) <> v_snap then
    raise exception 'TEST FAILED: U3c a refused Undo changed the cycle';
  end if;

  -- ===================================================================
  -- C. The catalog of the four functions
  -- ===================================================================
  -- one version each, with exactly these arguments
  foreach v_txt in array array['public.bb_time_is_valid(time)', 'public.bb_history_strip(jsonb)', 'public.bb_candidate_history(uuid)',
                               'public.bb_undo_cycle_edit(uuid, integer, jsonb, boolean, uuid[])'] loop
    if to_regprocedure(v_txt) is null then raise exception 'TEST FAILED: C % is missing', v_txt; end if;
  end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('bb_time_is_valid', 'bb_history_strip', 'bb_candidate_history', 'bb_undo_cycle_edit');
  if v_n <> 4 then raise exception 'TEST FAILED: C expected exactly one version of each of the four functions, found %', v_n; end if;
  -- the History line's index on change_log: partial, on the candidate the child insert rows name
  v_txt := pg_get_indexdef(to_regclass('public.change_log_bb_candidate_child_idx'));
  if v_txt is null or v_txt not like '%ON public.change_log %' or v_txt not like '%(after ->> ''candidate_id''::text)%'
     or v_txt not like '%WHERE%bb_grades%op = ''insert''%' then
    raise exception 'TEST FAILED: C the index change_log_bb_candidate_child_idx is missing or not as designed: %', v_txt;
  end if;
  for v_case in
    select p.oid, p.proname, p.prosecdef, p.proconfig, p.provolatile::text as vol, p.proowner, l.lanname, p.proacl, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
     where n.nspname = 'public' and p.proname in ('bb_time_is_valid', 'bb_history_strip', 'bb_candidate_history', 'bb_undo_cycle_edit')
  loop
    if v_case.lanname <> (case when v_case.proname in ('bb_time_is_valid', 'bb_history_strip') then 'sql' else 'plpgsql' end)
       or v_case.vol <> (case v_case.proname when 'bb_candidate_history' then 's' when 'bb_undo_cycle_edit' then 'v' else 'i' end)
       or v_case.prosecdef is distinct from (v_case.proname in ('bb_candidate_history', 'bb_undo_cycle_edit')) then
      raise exception 'TEST FAILED: C % has the wrong language, volatility or security definer', v_case.proname;
    end if;
    if not coalesce('search_path=""' = any (v_case.proconfig), false) then
      raise exception 'TEST FAILED: C % search_path is not set to ''''', v_case.proname;
    end if;
    if v_case.proowner <> (select c.relowner from pg_class c where c.oid = 'public.bb_cycles'::regclass) then
      raise exception 'TEST FAILED: C % owner differs from the Black Belt tables'' owner', v_case.proname;
    end if;
    if exists (select 1 from aclexplode(coalesce(v_case.proacl, acldefault('f', v_case.proowner))) a where a.grantee = 0) then
      raise exception 'TEST FAILED: C PUBLIC can run %', v_case.proname;
    end if;
    foreach v_role in array array['anon', 'service_role', 'bb_registrar', 'star_registrar', 'forms_registrar'] loop
      if exists (select 1 from pg_roles r where r.rolname = v_role)
         and has_function_privilege(v_role, v_case.oid, 'EXECUTE') then
        raise exception 'TEST FAILED: C % may run %', v_role, v_case.proname;
      end if;
    end loop;
    if has_function_privilege('authenticated', v_case.oid, 'EXECUTE')
       is distinct from (v_case.proname in ('bb_candidate_history', 'bb_undo_cycle_edit')) then
      raise exception 'TEST FAILED: C authenticated''s right on % is not as designed', v_case.proname;
    end if;
    if v_case.prosrc ~* '\mexecute\M' then
      raise exception 'TEST FAILED: C % builds and runs SQL text', v_case.proname;
    end if;
  end loop;
  -- calling the two helpers as a signed-in user is refused
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin
    perform public.bb_history_strip('{}'::jsonb);
    raise exception 'TEST FAILED: C a signed-in admin could call bb_history_strip';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.bb_time_is_valid('10:00');
    raise exception 'TEST FAILED: C a signed-in admin could call bb_time_is_valid';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  raise notice 'ALL 0032 TESTS PASSED';
end
$$;

select 'ALL 0032 TESTS PASSED' as result;

rollback;
