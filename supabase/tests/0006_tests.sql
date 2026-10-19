-- =====================================================================
-- 0006_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0006_star_testing.sql (Star
--   testing). It checks, in this order (contract 0006 section 9.1):
--     T1  who may call what: anon nothing; signed-in staff only the staff
--         functions; locked / signed-out / magic-link / old / idle /
--         inactive sessions get no_access from EVERY function (before any
--         input check); staff vs admin for every admin-only function;
--         nobody in the app can write a table or read a never-granted column
--     T2  the restricted login star_registrar (catalog proofs)
--     T3  Rubrics and prices (the template) and its seed
--     T4  events: the copy rule, input rules, the state, the switch, delete
--     T5  the family form
--     T6  candidates: add, edit, duplicates, withdraw / restore / delete,
--         private testing, make-up candidates
--     T7  payments and refunds (append-only, never below zero)
--     T8  grading and class counts
--     T9  results (the handoff's worked examples), Mark as sent
--     T10 the results CSV and its download log
--     T11 privacy: DOB / email / signature never readable, never a picture
--         in the history, the 90-day signature clean-up, History
--     T12 logging: one history row per changed row, the right tags
--     T13 catalog: RLS, rights, functions, triggers, rules
--   It makes its own test events and candidates with unusual names ("zz
--   test 1a2b3c4d ..."), so it works whatever is already in the database
--   (run it before AND after the first real Star event exists).
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test rubric changes, events,
--   candidates, payments, history rows, test sessions). NEVER change the
--   final "rollback;" to "commit;".
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
--   T12 call them as "authenticated", like the app.
--   The family form's login (star_registrar) is checked from the catalog
--   (T2); the public functions are called here as the SQL Editor's role,
--   which gives the same answers (they always run as their owner).
--
-- BEFORE YOU RUN IT
--   1. 0001-0006 are applied. You need TWO existing, ACTIVE staff rows: an
--      admin (Main Admin) and the shared front desk (Staff, role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test sets the
--      rubrics to known values, removes its own test rows and checks that
--      some removals are REFUSED. Everything is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0006 TESTS PASSED".
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
  v_ack      text := 'st-2026-10-18';
  v_adult    date := (public.testing_today() - interval '30 years')::date;
  v_child    date := (public.testing_today() - interval '10 years')::date;

  v_r      jsonb;
  v_r2     jsonb;
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
  v_mark2  bigint;
  v_mark0  bigint;   -- the last history row before this test run
  v_list   text[];
  v_labels text[];
  v_ok     text[];
  v_bad    text[];
  v_none   text[];
  v_ids    uuid[];
  v_ids2   uuid[];
  v_ids3   uuid[];
  v_vers   integer[];
  v_ts     timestamptz;
  v_num    numeric;
  v_snap_sql text;
  v_snap   text;
  v_snap2  text;
  v_admin_only integer[] := array[1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 18, 20, 23, 24, 27, 30];
  v_ev_row public.star_events;

  -- template ids
  v_cat uuid; v_catv integer; v_cat_ai1 uuid; v_cat_x uuid; v_dv1 integer; v_av integer; v_gv integer[];
  -- events and their codes
  v_ea uuid; v_e1 uuid; v_ez uuid; v_eold uuid; v_et uuid; v_et2 uuid; v_ep uuid; v_edel uuid; v_e9 uuid; v_ex uuid;
  v_ea_w text; v_ea_s text; v_e1_w text; v_e1_s text; v_ez_w text; v_eold_w text; v_ep_w text; v_ep_s text; v_edel_w text;
  v_e1v integer;
  -- candidates, copy subjects, payments, sends
  v_c1 uuid; v_c1v integer; v_cw uuid; v_cwv integer; v_f1 uuid; v_fold uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid;
  v_m1 uuid; v_m2 uuid; v_x1 uuid; v_x2 uuid; v_y1 uuid; v_y2 uuid; v_g1 uuid; v_g2 uuid; v_pr uuid;
  v_k1 uuid; v_k2 uuid; v_k_ai uuid; v_k_brk uuid; v_k_other uuid; v_k_dan2 uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_pref uuid; v_sent uuid;
  v_sub1 uuid := gen_random_uuid();
  v_key text;

  -- catalog
  v_fn      record;
  v_tbl     text;
  v_col     text;
  v_priv    text;
  v_reg_oid oid;
  v_owner   oid;
  v_staff_fns text[] := array[
    'star_update_dan_settings', 'star_add_category', 'star_update_category', 'star_reorder_categories',
    'star_delete_category', 'star_update_grade_values', 'star_update_assistant_table', 'star_add_event',
    'star_update_event', 'star_set_registration', 'star_delete_event', 'star_add_candidate', 'star_add_makeup',
    'star_update_candidate', 'star_change_paying_by', 'star_resolve_duplicate', 'star_set_private',
    'star_withdraw_candidate', 'star_restore_candidate', 'star_delete_candidate', 'star_record_payment',
    'star_undo_payment', 'star_edit_payment', 'star_record_refund', 'star_set_grade', 'star_set_count',
    'star_set_makeup_subjects', 'star_mark_result_sent', 'star_undo_result_sent', 'star_results_csv',
    'star_candidate_detail', 'star_candidate_history', 'star_view_signature', 'star_age_groups',
    'star_event_results', 'star_makeup_list', 'star_home_today'];
  v_public_fns text[] := array['star_public_event', 'star_public_register'];
  v_helper_fns text[] := array[
    'star_start_time_is_valid', 'star_email_is_valid', 'star_ids_are_valid', 'star_event_state',
    'star_net_paid_cents', 'star_fee_kind', 'star_expected_fee_cents', 'star_age_group_of', 'star_assistant_grade',
    'star_candidate_result', 'star_sent_state', 'star_before_write', 'star_events_rules',
    'star_event_copies_before_write', 'star_candidates_rules', 'star_candidate_signatures_rules',
    'star_candidate_signatures_log', 'star_makeup_subjects_rules', 'star_payments_guard', 'star_grades_rules',
    'star_result_emails_guard', 'star_downloads_guard', 'star_purge_old_signatures', 'star_find_duplicate',
    'star_recheck_duplicate', 'star_recheck_pointing_at', 'star_lock_candidate', 'star_lock_payment',
    'star_copy_template_into_event', 'star_public_answer', 'star_history_strip', 'star_public_register_core'];
  v_tables text[] := array[
    'star_dan_settings', 'star_categories', 'star_grade_values', 'star_assistant_table', 'star_events',
    'star_event_dans', 'star_event_categories', 'star_event_grades', 'star_event_assistant', 'star_candidates',
    'star_candidate_signatures', 'star_makeup_subjects', 'star_payments', 'star_grades', 'star_result_emails',
    'star_downloads'];
  v_read_tables text[];
begin
  v_read_tables := array(select t from unnest(v_tables) as t where t not in ('star_candidate_signatures', 'star_downloads'));

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
  if to_regclass('public.star_events') is null then
    raise exception 'TEST SETUP: public.star_events is missing (is 0006 applied?)';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'star_registrar') then
    raise exception 'TEST SETUP: role star_registrar is missing (is 0006 applied?)';
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

  -- One md5 of every 0006 table + the history and attempt counts ("did
  -- anything change?").
  select 'select md5(' || string_agg(format('coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.%I x), '''')', t), ' || ')
         || ' || (select count(*) from public.change_log)::text || (select count(*) from public.testing_public_attempts)::text)'
    into v_snap_sql
    from unnest(v_tables) as t;

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   st_grade_all(candidate, letter): grades every judged subject
  --   st_t12(mark, action, actor, session, name, label): T12a's checks of
  --     the history rows one call wrote
  execute $f$
    create function pg_temp.st_grade_all(p_candidate uuid, p_letter text) returns void
    language plpgsql as $b$
    declare
      v_k uuid;
      v_r jsonb;
    begin
      for v_k in select k.id from public.star_event_categories k join public.star_candidates c
                     on c.event_id = k.event_id and c.dan = k.dan
                  where c.id = p_candidate and not k.from_class_count order by k.position loop
        v_r := public.star_set_grade(p_candidate, v_k, p_letter);
        if v_r ->> 'status' is distinct from 'ok' then
          raise exception 'TEST FAILED: st_grade_all set_grade answered %', v_r;
        end if;
      end loop;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.st_t12(p_mark bigint, p_action text, p_actor uuid, p_session uuid, p_name text, p_label text)
    returns void language plpgsql as $b$
    declare
      v_n integer;
    begin
      select count(*) into v_n from public.change_log l
       where l.id > p_mark and l.action <> 'star_purge_old_signatures';
      if v_n = 0 then
        raise exception 'TEST FAILED: T12a % wrote no history row', p_label;
      end if;
      if exists (select 1 from public.change_log l
                  where l.id > p_mark and l.action <> 'star_purge_old_signatures'
                    and (l.action <> p_action or l.actor_id is distinct from p_actor
                         or l.session_id is distinct from p_session or l.actor_name <> p_name
                         or l.batch_id is null or l.table_name not like 'star\_%')) then
        raise exception 'TEST FAILED: T12a % history rows have a wrong action / actor / session / batch: %', p_label,
          (select jsonb_agg(jsonb_build_object('action', l.action, 'table', l.table_name, 'actor', l.actor_name,
                                               'session', l.session_id, 'batch', l.batch_id))
             from public.change_log l where l.id > p_mark);
      end if;
      if (select count(distinct l.batch_id) from public.change_log l
           where l.id > p_mark and l.action <> 'star_purge_old_signatures') <> 1 then
        raise exception 'TEST FAILED: T12a % used more than one batch id', p_label;
      end if;
      if exists (select 1 from public.change_log l
                  where l.id > p_mark and l.table_name = 'star_candidates'
                    and l.location_code is distinct from coalesce(l.after ->> 'location_code', l.before ->> 'location_code',
                                                                  (select c.location_code from public.star_candidates c where c.id = l.record_id)))
         or exists (select 1 from public.change_log l
                     where l.id > p_mark and l.table_name = 'star_events' and l.location_code is not null) then
        raise exception 'TEST FAILED: T12a % location_code wrong (candidates carry it, events never)', p_label;
      end if;
      if exists (select 1 from public.change_log l where l.id > p_mark and l.op not in ('insert', 'update', 'delete')) then
        raise exception 'TEST FAILED: T12a % bad op', p_label;
      end if;
      if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
        raise exception 'TEST FAILED: T12a % left tkd.action / tkd.batch_id set', p_label;
      end if;
    end;
    $b$;
  $f$;

  -- A known template (the seed values), whatever an admin changed in
  -- Rubrics and prices before - so every expected number below holds.
  -- Rolled back at the end like everything else.
  update public.star_dan_settings d
     set label = s.label, pass_mark = s.pm, star_limit = s.sl,
         standard_cents = s.a, same_day_cents = s.b, private_cents = s.c
    from (values (1, '1st Dan', 245, 4, 14000, 15000, 16000),
                 (2, '2nd Dan', 245, 3, 15000, 16000, 17000),
                 (3, '3rd Dan', 245, 5, 16000, 17000, 18000)) as s (dan, label, pm, sl, a, b, c)
   where d.dan = s.dan;
  if (select count(*) from public.star_dan_settings) <> 3 then
    raise exception 'TEST SETUP: star_dan_settings should have 3 rows';
  end if;
  delete from public.star_categories;
  insert into public.star_categories (dan, name, credits, position, from_class_count, created_by_name, updated_by_name)
  select s.dan, s.name, s.credits, s.position, s.fcc, '', ''
    from (values
      (1, 'White–Deputy Curriculum', 15, 0, false), (1, 'Go-Ryo Poomse', 10, 1, false),
      (1, 'Advanced Motion', 5, 2, false), (1, 'Advance Sa-Bang Chuck', 5, 3, false),
      (1, 'Step Sa-Bang Chuck', 5, 4, false), (1, 'Two Step Sparring', 5, 5, false),
      (1, 'Breaking', 5, 6, false), (1, 'Appreciation Letters', 5, 7, false),
      (1, 'Assistant Instructor', 5, 8, true), (1, 'Knowledge', 5, 9, false),
      (1, 'Korean Terminology', 5, 10, false),
      (2, 'White–Deputy Curriculum', 10, 0, false), (2, 'Geum-Kang Poomse', 5, 1, false),
      (2, 'Instructor Sa-Bang-Chuk', 5, 2, false), (2, 'Go-Ryo Poomse', 5, 3, false),
      (2, 'Advanced Motion', 5, 4, false), (2, 'Advance Sa-Bang Chuck', 5, 5, false),
      (2, 'Step Sa-Bang Chuck', 5, 6, false), (2, 'Two Step Sparring', 5, 7, false),
      (2, 'Breaking', 5, 8, false), (2, 'Appreciation Letters', 5, 9, false),
      (2, 'Assistant Instructor', 5, 10, true), (2, 'Knowledge', 5, 11, false),
      (2, 'Korean Terminology', 5, 12, false),
      (3, 'White–Deputy Curriculum', 20, 0, false), (3, '1st & 2nd Dan Curriculum', 10, 1, false),
      (3, 'Tae Baek Poomsae', 5, 2, false), (3, '3rd Dan Sa-Bang Chuck', 5, 3, false),
      (3, 'Creative Poomsae', 5, 4, false), (3, 'Breaking', 5, 5, false),
      (3, 'Appreciation Letters', 5, 6, false), (3, 'Assistant Instructor', 5, 7, true),
      (3, 'Knowledge', 5, 8, false), (3, 'Korean Terminology', 5, 9, false)
    ) as s (dan, name, credits, position, fcc);
  update public.star_grade_values v set value = s.value
    from (values ('A+', 4.5), ('A', 4.0), ('B+', 3.5), ('B', 3.0), ('C+', 2.5), ('C', 2.0), ('D', 0.0)) as s (grade, value)
   where v.grade = s.grade;
  update public.star_assistant_table
     set child_max_age = 12, child_a_plus = 15, child_a = 14, child_b_plus = 13, child_b = 12, child_c_plus = 11, child_c = 10,
         adult_a_plus = 20, adult_a = 18, adult_b_plus = 16, adult_b = 14, adult_c_plus = 12, adult_c = 10;

  -- Test events (as A1): Early (in 3 days), Main (in 10, both schools'
  -- links), Later (in 20), Old (moved 91 days back below, for the
  -- signature clean-up)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' Early', v_today + 3, '09:00', 'worcester', true, null, null);
  v_ea := (v_r ->> 'id')::uuid; v_ea_w := v_r ->> 'public_code_worcester'; v_ea_s := v_r ->> 'public_code_shrewsbury';
  v_r := public.star_add_event(v_tag || ' Main', v_today + 10, '10:00', 'shrewsbury', true, null, 'Bring water.');
  v_e1 := (v_r ->> 'id')::uuid; v_e1_w := v_r ->> 'public_code_worcester'; v_e1_s := v_r ->> 'public_code_shrewsbury';
  v_r := public.star_add_event(v_tag || ' Later', v_today + 20, '11:00', 'worcester', true, null, null);
  v_ez := (v_r ->> 'id')::uuid; v_ez_w := v_r ->> 'public_code_worcester';
  v_r := public.star_add_event(v_tag || ' Old', v_today + 5, '12:00', 'worcester', true, null, null);
  v_eold := (v_r ->> 'id')::uuid; v_eold_w := v_r ->> 'public_code_worcester';
  if v_ea is null or v_e1 is null or v_ez is null or v_eold is null then
    raise exception 'TEST SETUP: could not create the test events (last answer %)', v_r;
  end if;

  select k.id into v_k1 from public.star_event_categories k where k.event_id = v_e1 and k.dan = 1 and k.position = 0;
  select k.id into v_k_ai from public.star_event_categories k where k.event_id = v_e1 and k.dan = 1 and k.from_class_count;
  select k.id into v_k_brk from public.star_event_categories k where k.event_id = v_e1 and k.dan = 1 and k.name = 'Breaking';
  select k.id into v_k_dan2 from public.star_event_categories k where k.event_id = v_e1 and k.dan = 2 and k.position = 0;
  select k.id into v_k_other from public.star_event_categories k where k.event_id = v_ea and k.dan = 1 and k.position = 0;

  -- candidates in Main: Ann Lee (desk, paid by the desk), Bo Kim (family
  -- form, Shrewsbury link), Wes Gone (desk, withdrawn by the admin)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_add_candidate(v_e1, 'Ann', 'Lee', v_adult, 'ann@example.com', 'worcester', 1, 0, 'cash');
  v_c1 := (v_r ->> 'id')::uuid;
  v_r := public.star_record_payment(v_c1, 1, 'cash', 14000, v_today);
  v_p1 := (v_r ->> 'payment_id')::uuid;
  v_r := public.star_add_candidate(v_e1, 'Wes', 'Gone', null, 'wes@example.com', 'worcester', 1, 0, 'cash');
  v_cw := (v_r ->> 'id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_withdraw_candidate(v_cw, 1);
  perform set_config('request.jwt.claims', '', true);
  v_r := public.star_public_register(v_e1_s, v_tag || ' k1', v_sub1, 'Bo', 'Kim', v_child, 'bo@example.com', 1, 1,
                                     'check', true, v_sig, v_ack);
  select c.id into v_f1 from public.star_candidates c where c.reference = v_r ->> 'reference';
  v_r := public.star_public_register(v_eold_w, v_tag || ' k1', gen_random_uuid(), 'Old', 'Sig', v_adult, 'old@example.com',
                                     1, 0, 'cash', true, v_sig, v_ack);
  select c.id into v_fold from public.star_candidates c where c.reference = v_r ->> 'reference';
  if v_c1 is null or v_p1 is null or v_cw is null or v_f1 is null or v_fold is null then
    raise exception 'TEST SETUP: could not create the test candidates (last answer %)', v_r;
  end if;
  -- the Old event's testing day moves 91 days back: its signature is due
  -- for the clean-up (T1c proves that no refused call ran it)
  update public.star_events set testing_date = v_today - 91, auto_close_on = null where id = v_eold;

  select c.version into v_c1v from public.star_candidates c where c.id = v_c1;
  select c.version into v_cwv from public.star_candidates c where c.id = v_cw;
  select e.version into v_e1v from public.star_events e where e.id = v_e1;
  select k.id, k.version into v_cat, v_catv from public.star_categories k where k.dan = 1 and k.position = 0;
  select d.version into v_dv1 from public.star_dan_settings d where d.dan = 1;
  select a.version into v_av from public.star_assistant_table a;
  v_gv := array(select v.version from public.star_grade_values v order by v.position);
  v_ids := array(select k.id from public.star_categories k where k.dan = 1 order by k.position);

  -- ===================================================================
  -- T1. Who may call what
  -- ===================================================================

  -- The 37 staff functions, three ways each (index matters: v_admin_only
  -- lists the admin-only ones; 19 = restore, 22 = undo payment and 29 =
  -- undo sent let staff past the role check for their own Undo)
  v_ok := array[
    format('public.star_update_dan_settings(1, %s, 245, 4, 14000, 15000, 16000)', v_dv1),
    format('public.star_add_category(1, %L, 5)', v_tag || ' nope'),
    format('public.star_update_category(%L::uuid, %s, %L, 5)', v_cat, v_catv, v_tag || ' nope'),
    format('public.star_reorder_categories(1, %L::uuid[], %L::uuid[])', v_ids, v_ids),
    format('public.star_delete_category(%L::uuid, %s)', v_cat, v_catv),
    format('public.star_update_grade_values(%L::integer[], %L::numeric[])', v_gv, '{4.5,4,3.5,3,2.5,2,0}'),
    format('public.star_update_assistant_table(%s, 12, %L::integer[], %L::integer[])', v_av, '{15,14,13,12,11,10}', '{20,18,16,14,12,10}'),
    format('public.star_add_event(%L, %L::date, %L::time, %L, false, null, null)', v_tag || ' gate', v_today + 30, '10:00', 'worcester'),
    format('public.star_update_event(%L::uuid, %s, %L, %L::date, %L::time, %L, null, null)', v_e1, v_e1v, v_tag || ' nope', v_today + 10, '10:00', 'worcester'),
    format('public.star_set_registration(%L::uuid, %s, false)', v_e1, v_e1v),
    format('public.star_delete_event(%L::uuid, %s, 0, 0)', v_e1, v_e1v),
    format('public.star_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, 0, %L)', v_e1, 'Nope', 'Person', v_adult, 'nope@example.com', 'worcester', 'cash'),
    format('public.star_add_makeup(%L::uuid, %L::uuid)', v_ez, v_c1),
    format('public.star_update_candidate(%L::uuid, %s, %L, %L, null, %L, %L, 1, 0, null)', v_c1, v_c1v, 'Nope', 'Person', 'nope@example.com', 'worcester'),
    format('public.star_change_paying_by(%L::uuid, %s, %L)', v_c1, v_c1v, 'card'),
    format('public.star_resolve_duplicate(%L::uuid, %s, %L::uuid, 1, true)', v_c1, v_c1v, v_f1),
    format('public.star_set_private(%L::uuid, %s, %L::date, %L::time)', v_c1, v_c1v, v_today + 2, '10:00'),
    format('public.star_withdraw_candidate(%L::uuid, %s)', v_c1, v_c1v),
    format('public.star_restore_candidate(%L::uuid, %s)', v_cw, v_cwv),
    format('public.star_delete_candidate(%L::uuid, %s, %L::uuid[])', v_c1, v_c1v, array[v_p1]),
    format('public.star_record_payment(%L::uuid, %s, %L, 14000, %L::date)', v_c1, v_c1v, 'cash', v_today),
    format('public.star_undo_payment(%L::uuid)', v_p1),
    format('public.star_edit_payment(%L::uuid, %L, 100, %L::date)', v_p1, 'cash', v_today),
    format('public.star_record_refund(%L::uuid, %s, %L, 100, %L::date)', v_c1, v_c1v, 'cash', v_today),
    format('public.star_set_grade(%L::uuid, %L::uuid, %L)', v_c1, v_k1, 'A'),
    format('public.star_set_count(%L::uuid, %L, 5)', v_c1, 'classes_attended'),
    format('public.star_set_makeup_subjects(%L::uuid, %L::uuid[], %L::uuid[])', v_c1, '{}', array[v_k1]),
    format('public.star_mark_result_sent(%L::uuid, %L)', v_c1, 'x'),
    format('public.star_undo_result_sent(%L::uuid)', v_rand),
    format('public.star_results_csv(%L::uuid, null)', v_e1),
    format('public.star_candidate_detail(%L::uuid)', v_c1),
    format('public.star_candidate_history(%L::uuid)', v_c1),
    format('public.star_view_signature(%L::uuid)', v_f1),
    format('public.star_age_groups(%L::uuid)', v_e1),
    format('public.star_event_results(%L::uuid, 1)', v_e1),
    format('public.star_makeup_list(%L::uuid)', v_e1),
    'public.star_home_today()'];
  v_bad := array[
    'public.star_update_dan_settings(null, null, -1, -1, -1, -1, -1)',
    'public.star_add_category(null, '''', -1)',
    'public.star_update_category(null, null, '''', -1)',
    'public.star_reorder_categories(null, null, null)',
    'public.star_delete_category(null, null)',
    'public.star_update_grade_values(null, null)',
    'public.star_update_assistant_table(null, -1, null, null)',
    'public.star_add_event('''', null, null, null, null, null, null)',
    'public.star_update_event(null, null, '''', null, null, null, null, null)',
    'public.star_set_registration(null, null, null)',
    'public.star_delete_event(null, null, -1, -1)',
    'public.star_add_candidate(null, '''', '''', null, '''', '''', null, -1, '''')',
    'public.star_add_makeup(null, null)',
    'public.star_update_candidate(null, null, '''', '''', null, '''', '''', null, -1, -1)',
    'public.star_change_paying_by(null, null, '''')',
    'public.star_resolve_duplicate(null, null, null, null, null)',
    'public.star_set_private(null, null, null, ''07:00''::time)',
    'public.star_withdraw_candidate(null, null)',
    'public.star_restore_candidate(null, null)',
    'public.star_delete_candidate(null, null, null)',
    'public.star_record_payment(null, null, '''', -1, null)',
    'public.star_undo_payment(null)',
    'public.star_edit_payment(null, '''', -1, null)',
    'public.star_record_refund(null, null, '''', -1, null)',
    'public.star_set_grade(null, null, ''Z'')',
    'public.star_set_count(null, '''', -1)',
    'public.star_set_makeup_subjects(null, null, null)',
    'public.star_mark_result_sent(null, null)',
    'public.star_undo_result_sent(null)',
    'public.star_results_csv(null, -1)',
    'public.star_candidate_detail(null)',
    'public.star_candidate_history(null)',
    'public.star_view_signature(null)',
    'public.star_age_groups(null)',
    'public.star_event_results(null, -1)',
    'public.star_makeup_list(null)',
    'public.star_home_today()'];
  v_none := array[
    'public.star_update_dan_settings(9, 1, 245, 4, 14000, 15000, 16000)',
    format('public.star_add_category(9, %L, 5)', v_tag || ' nope'),
    format('public.star_update_category(%L::uuid, 1, %L, 5)', v_rand, v_tag || ' nope'),
    format('public.star_reorder_categories(9, %L::uuid[], %L::uuid[])', array[v_rand], array[v_rand]),
    format('public.star_delete_category(%L::uuid, 1)', v_rand),
    format('public.star_update_grade_values(%L::integer[], %L::numeric[])', '{99,99,99,99,99,99,99}', '{4.5,4,3.5,3,2.5,2,0}'),
    'public.star_update_assistant_table(9999, 12, ''{15,14,13,12,11,10}''::integer[], ''{20,18,16,14,12,10}''::integer[])',
    format('public.star_add_event(%L, %L::date, %L::time, %L, false, null, null)', v_tag || ' gate 2', v_today + 30, '10:00', 'worcester'),
    format('public.star_update_event(%L::uuid, 1, %L, %L::date, %L::time, %L, null, null)', v_rand, v_tag || ' nope', v_today + 10, '10:00', 'worcester'),
    format('public.star_set_registration(%L::uuid, 1, false)', v_rand),
    format('public.star_delete_event(%L::uuid, 1, 0, 0)', v_rand),
    format('public.star_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, 0, %L)', v_rand, 'Nope', 'Person', v_adult, 'nope@example.com', 'worcester', 'cash'),
    format('public.star_add_makeup(%L::uuid, %L::uuid)', v_rand, v_rand2),
    format('public.star_update_candidate(%L::uuid, 1, %L, %L, null, %L, %L, 1, 0, null)', v_rand, 'Nope', 'Person', 'nope@example.com', 'worcester'),
    format('public.star_change_paying_by(%L::uuid, 1, %L)', v_rand, 'card'),
    format('public.star_resolve_duplicate(%L::uuid, 1, %L::uuid, 1, true)', v_rand, v_rand2),
    format('public.star_set_private(%L::uuid, 1, %L::date, %L::time)', v_rand, v_today + 2, '10:00'),
    format('public.star_withdraw_candidate(%L::uuid, 1)', v_rand),
    format('public.star_restore_candidate(%L::uuid, 1)', v_rand),
    format('public.star_delete_candidate(%L::uuid, 1, %L::uuid[])', v_rand, '{}'),
    format('public.star_record_payment(%L::uuid, 1, %L, 14000, %L::date)', v_rand, 'cash', v_today),
    format('public.star_undo_payment(%L::uuid)', v_rand),
    format('public.star_edit_payment(%L::uuid, %L, 100, %L::date)', v_rand, 'cash', v_today),
    format('public.star_record_refund(%L::uuid, 1, %L, 100, %L::date)', v_rand, 'cash', v_today),
    format('public.star_set_grade(%L::uuid, %L::uuid, %L)', v_rand, v_rand2, 'A'),
    format('public.star_set_count(%L::uuid, %L, 5)', v_rand, 'classes_attended'),
    format('public.star_set_makeup_subjects(%L::uuid, %L::uuid[], %L::uuid[])', v_rand, '{}', array[v_rand2]),
    format('public.star_mark_result_sent(%L::uuid, %L)', v_rand, 'x'),
    format('public.star_undo_result_sent(%L::uuid)', v_rand),
    format('public.star_results_csv(%L::uuid, null)', v_rand),
    format('public.star_candidate_detail(%L::uuid)', v_rand),
    format('public.star_candidate_history(%L::uuid)', v_rand),
    format('public.star_view_signature(%L::uuid)', v_rand),
    format('public.star_age_groups(%L::uuid)', v_rand),
    format('public.star_event_results(%L::uuid, 1)', v_rand),
    format('public.star_makeup_list(%L::uuid)', v_rand),
    'public.star_home_today()'];
  if cardinality(v_ok) <> 37 or cardinality(v_bad) <> 37 or cardinality(v_none) <> 37 then
    raise exception 'TEST SETUP: the T1 call lists must have 37 entries each';
  end if;

  -- T1a. anon: no staff function, no public function, no table, no view
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  for v_i in 1 .. 37 loop
    begin
      execute 'select ' || v_ok[v_i];
      raise exception 'TEST FAILED: T1a anon could call %', v_ok[v_i];
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin perform public.star_public_event('abcdefgh');
        raise exception 'TEST FAILED: T1a anon could call star_public_event'; exception when insufficient_privilege then null; end;
  begin perform public.star_public_register('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', v_adult, 'a@b.co', 1, 0, 'cash', true, v_sig, v_ack);
        raise exception 'TEST FAILED: T1a anon could call star_public_register'; exception when insufficient_privilege then null; end;
  foreach v_tbl in array v_tables || array['star_roster'] loop
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
    begin perform public.star_public_event('abcdefgh');
          raise exception 'TEST FAILED: T1b authenticated could call star_public_event'; exception when insufficient_privilege then null; end;
    begin perform public.star_public_register('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', v_adult, 'a@b.co', 1, 0, 'cash', true, v_sig, v_ack);
          raise exception 'TEST FAILED: T1b authenticated could call star_public_register'; exception when insufficient_privilege then null; end;
    begin perform public.star_purge_old_signatures();
          raise exception 'TEST FAILED: T1b authenticated could call star_purge_old_signatures'; exception when insufficient_privilege then null; end;
    begin perform public.star_candidate_result(v_c1);
          raise exception 'TEST FAILED: T1b authenticated could call star_candidate_result'; exception when insufficient_privilege then null; end;
    begin perform public.star_expected_fee_cents(v_c1);
          raise exception 'TEST FAILED: T1b authenticated could call star_expected_fee_cents'; exception when insufficient_privilege then null; end;
    begin perform public.star_public_register_core('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', v_adult, 'a@b.co', 1, 0, 'cash', true, v_sig, v_ack);
          raise exception 'TEST FAILED: T1b authenticated could call star_public_register_core'; exception when insufficient_privilege then null; end;
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
  --      input and any lookup. Nothing is written - not even the
  --      signature clean-up (the Old event's signature is due for it).
  execute v_snap_sql into v_snap;
  v_list   := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_d2, v_c_d3, v_c_a8];
  v_labels := array['A2',   'A3',   'A4',   'A5',   'A6',   'A7',   'D2',   'D3',   'A8'];
  for v_n in 1 .. cardinality(v_list) loop
    if v_labels[v_n] = 'A8' then
      update public.staff set active = false where id = v_admin;
    end if;
    set local role authenticated;
    perform set_config('request.jwt.claims', v_list[v_n], true);
    for v_i in 1 .. 37 loop
      foreach v_txt in array array[v_ok[v_i], v_bad[v_i], v_none[v_i]] loop
        execute 'select ' || v_txt into v_r;
        if v_r is distinct from '{"status": "no_access"}'::jsonb then
          raise exception 'TEST FAILED: T1c session % got % from %', v_labels[v_n], v_r, v_txt;
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
  if not exists (select 1 from public.star_candidate_signatures s where s.candidate_id = v_fold and s.signature is not null) then
    raise exception 'TEST FAILED: T1c the signature clean-up ran without data access';
  end if;

  -- T1d. the desk (D1) gets not_allowed from every admin-only function,
  --      three calls each (the role is checked before the input); restore
  --      of a normal withdrawal is refused after its lookup (staff may only
  --      undo their own keep-one, T6c)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_i in array v_admin_only loop
    foreach v_txt in array array[v_ok[v_i], v_bad[v_i], v_none[v_i]] loop
      execute 'select ' || v_txt into v_r;
      if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
        raise exception 'TEST FAILED: T1d desk got % from admin-only %', v_r, v_txt;
      end if;
    end loop;
  end loop;
  for v_i in 1 .. 3 loop
    execute 'select ' || v_ok[19] into v_r;
    if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
      raise exception 'TEST FAILED: T1d desk restore of a normal withdrawal expected not_allowed, got %', v_r;
    end if;
  end loop;
  reset role;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: T1d a refused desk call changed something'; end if;

  -- T1e. no data access -> no rows; A1 and D1 see what postgres sees
  v_list   := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_d2, v_c_d3, v_c_a1, v_c_d1, v_c_a8];
  v_labels := array['A2',   'A3',   'A4',   'A5',   'A6',   'A7',   'D2',   'D3',   'A1',   'D1',   'A8'];
  foreach v_tbl in array v_read_tables || array['star_roster'] loop
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

  -- T1f. A1: no direct insert / update / delete / truncate on any 0006
  --      table; "select *" refused where a column is never granted; every
  --      never-granted column refused
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
    if v_tbl not in ('star_event_dans', 'star_event_categories', 'star_event_grades', 'star_event_assistant') then
      begin execute format('select * from public.%I limit 1', v_tbl);
            raise exception 'TEST FAILED: T1f A1 could select * from %', v_tbl; exception when insufficient_privilege then null; end;
    end if;
  end loop;
  foreach v_txt in array array[
      'star_candidates.date_of_birth', 'star_candidates.email_for_results', 'star_candidates.withdrawn_by',
      'star_candidates.created_by', 'star_candidates.updated_by', 'star_payments.recorded_by',
      'star_result_emails.marked_by', 'star_result_emails.undone_by', 'star_assistant_table.singleton',
      'star_dan_settings.created_by', 'star_categories.updated_by', 'star_grade_values.created_by',
      'star_assistant_table.created_by', 'star_events.created_by', 'star_events.updated_by',
      'star_makeup_subjects.created_by', 'star_grades.created_by', 'star_grades.updated_by',
      'star_candidate_signatures.signature', 'star_candidate_signatures.submission_id',
      'star_candidate_signatures.ack_version', 'star_downloads.downloaded_by', 'star_downloads.event_name'] loop
    begin
      execute format('select x.%I from public.%I x limit 1', split_part(v_txt, '.', 2), split_part(v_txt, '.', 1));
      raise exception 'TEST FAILED: T1f A1 could read %', v_txt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin perform nextval('public.star_candidate_ref_seq');
        raise exception 'TEST FAILED: T1f A1 could use the reference counter'; exception when insufficient_privilege then null; end;
  reset role;

  -- ===================================================================
  -- T2. The restricted login star_registrar (catalog proofs)
  -- ===================================================================
  select r.oid into v_reg_oid from pg_roles r where r.rolname = 'star_registrar';

  -- T2a. in schema public it may run exactly the two Star public
  --      functions; testing_registrar exactly its two Color Belt ones;
  --      neither can run the other's
  for v_fn in
    select p.oid, p.proname::text as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    if has_function_privilege('star_registrar', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_public_fns)) then
      raise exception 'TEST FAILED: T2a star_registrar execute on % is %, expected %',
        v_fn.oid::regprocedure, has_function_privilege('star_registrar', v_fn.oid, 'EXECUTE'), (v_fn.name = any (v_public_fns));
    end if;
    if has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE')
       is distinct from (v_fn.name in ('testing_public_event', 'testing_public_register')) then
      raise exception 'TEST FAILED: T2a testing_registrar execute on % is wrong', v_fn.oid::regprocedure;
    end if;
  end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_public_fns);
  if v_n <> 2 then raise exception 'TEST FAILED: T2a expected exactly 2 Star public functions (one version each), found %', v_n; end if;

  -- T2b. no 0006 function is executable by PUBLIC (= every role)
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
     and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE');
  if v_txt is not null then raise exception 'TEST FAILED: T2b 0006 function(s) executable by PUBLIC: %', v_txt; end if;

  -- T2c. no right on any table, column or sequence: nothing granted to it
  --      by name anywhere, and in every schema it can reach no right at
  --      all (PUBLIC's included) - explicitly none on testing_public_attempts
  select string_agg(c.oid::regclass::text, ', ') into v_txt
    from pg_class c
   where exists (select 1 from aclexplode(c.relacl) as a where a.grantee = v_reg_oid)
      or exists (select 1 from pg_attribute t, aclexplode(t.attacl) as a
                  where t.attrelid = c.oid and a.grantee = v_reg_oid);
  if v_txt is not null then raise exception 'TEST FAILED: T2c rights granted to star_registrar on: %', v_txt; end if;
  select string_agg(c.oid::regclass::text, ', ') into v_txt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
     and has_schema_privilege('star_registrar', n.oid, 'USAGE')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('star_registrar', c.oid, 'USAGE, SELECT, UPDATE')
               else has_table_privilege('star_registrar', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                    or has_any_column_privilege('star_registrar', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
          end);
  if v_txt is not null then raise exception 'TEST FAILED: T2c star_registrar has rights on: %', v_txt; end if;
  if has_table_privilege('star_registrar', 'public.testing_public_attempts', 'SELECT, INSERT, UPDATE, DELETE')
     or has_any_column_privilege('star_registrar', 'public.testing_public_attempts', 'SELECT, INSERT, UPDATE') then
    raise exception 'TEST FAILED: T2c star_registrar has a right on testing_public_attempts';
  end if;

  -- T2d. it can't create anything in any schema, nor in the database.
  --      (This test's own temporary schema - made for its pg_temp helpers
  --      above, private to this session and gone with it - is left out:
  --      PostgreSQL reports CREATE on "the current session's temp schema"
  --      for every role that may make temporary tables.)
  select string_agg(n.nspname, ', ') into v_txt
    from pg_namespace n
   where has_schema_privilege('star_registrar', n.oid, 'CREATE')
     and n.oid <> pg_my_temp_schema();
  if v_txt is not null then raise exception 'TEST FAILED: T2d star_registrar can CREATE in schema(s): %', v_txt; end if;
  if has_database_privilege('star_registrar', current_database(), 'CREATE') then
    raise exception 'TEST FAILED: T2d star_registrar can CREATE in the database';
  end if;

  -- T2e. memberships: the API login and roles can't become it; it is a
  --      member of no role; its only possible member is the tables' owner
  if exists (select 1 from pg_roles where rolname = 'authenticator')
     and pg_has_role('authenticator', 'star_registrar', 'MEMBER') then
    raise exception 'TEST FAILED: T2e authenticator can become star_registrar';
  end if;
  foreach v_txt in array array['anon', 'authenticated', 'service_role', 'testing_registrar'] loop
    if pg_has_role(v_txt, 'star_registrar', 'MEMBER') then
      raise exception 'TEST FAILED: T2e % can become star_registrar', v_txt;
    end if;
  end loop;
  if exists (select 1 from pg_auth_members m where m.member = v_reg_oid) then
    raise exception 'TEST FAILED: T2e star_registrar is a member of another role';
  end if;
  select c.relowner into v_owner from pg_class c where c.oid = 'public.star_events'::regclass;
  if exists (select 1 from pg_auth_members m where m.roleid = v_reg_oid and m.member <> v_owner) then
    raise exception 'TEST FAILED: T2e a role other than the tables'' owner is a member of star_registrar';
  end if;

  -- T2f. its attributes and settings (contract 8.1)
  if not exists (select 1 from pg_roles r
                  where r.rolname = 'star_registrar'
                    and r.rolcanlogin and not r.rolinherit and not r.rolcreatedb and not r.rolcreaterole
                    and not r.rolbypassrls and not r.rolreplication and not r.rolsuper
                    and r.rolconnlimit = 5) then
    raise exception 'TEST FAILED: T2f star_registrar attributes are not login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5';
  end if;
  select array_to_string(s.setconfig, ',') into v_txt
    from pg_db_role_setting s where s.setrole = v_reg_oid and s.setdatabase = 0;
  if v_txt is null
     or position('statement_timeout=5s' in v_txt) = 0
     or position('idle_in_transaction_session_timeout=10s' in v_txt) = 0
     or position('search_path=""' in v_txt) = 0 then
    raise exception 'TEST FAILED: T2f star_registrar settings are %', v_txt;
  end if;

  -- T2g. one owner for every 0006 function, table, view and sequence
  select count(distinct o) into v_n from (
    select p.proowner as o from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
    union all
    select c.relowner from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any (v_tables || array['star_roster', 'star_candidate_ref_seq'])) x;
  if v_n <> 1 then raise exception 'TEST FAILED: T2g 0006 objects have % different owners, expected 1', v_n; end if;

  -- ===================================================================
  -- T3. Rubrics and prices (the template)
  -- ===================================================================

  -- T3a. the seed, as the history recorded it (append-only, so this holds
  --      whatever admins changed since): exactly 3 Dans, 34 subjects, 7
  --      grade values and 1 assistant row, written ONCE (a re-run of 0006
  --      adds none), tagged star_seed by "Database admin"
  select count(*) filter (where l.table_name = 'star_dan_settings'),
         count(*) filter (where l.table_name = 'star_categories'),
         count(*) filter (where l.table_name = 'star_grade_values'),
         count(*) filter (where l.table_name = 'star_assistant_table'),
         count(*) filter (where l.actor_name <> 'Database admin' or l.actor_id is not null or l.op <> 'insert')
    into v_n, v_n2, v_i, v_j, v_v
    from public.change_log l where l.action = 'star_seed';
  if (v_n, v_n2, v_i, v_j, v_v) is distinct from (3, 34, 7, 1, 0) then
    raise exception 'TEST FAILED: T3a seed rows in the history: % Dans, % subjects, % grades, % assistant, % odd (expected 3, 34, 7, 1, 0)',
      v_n, v_n2, v_i, v_j, v_v;
  end if;
  select string_agg(format('%s/%s/%s/%s/%s/%s/%s', l.after ->> 'dan', l.after ->> 'label', l.after ->> 'pass_mark',
                           l.after ->> 'star_limit', l.after ->> 'standard_cents', l.after ->> 'same_day_cents',
                           l.after ->> 'private_cents'), ' ' order by l.after ->> 'dan')
    into v_txt from public.change_log l where l.action = 'star_seed' and l.table_name = 'star_dan_settings';
  if v_txt is distinct from '1/1st Dan/245.0/4/14000/15000/16000 2/2nd Dan/245.0/3/15000/16000/17000 3/3rd Dan/245.0/5/16000/17000/18000' then
    raise exception 'TEST FAILED: T3a seeded Dans are %', v_txt;
  end if;
  select string_agg(format('%s:%s:%s:%s', x.dan, x.n, x.credits, x.fcc), ' ' order by x.dan) into v_txt
    from (select l.after ->> 'dan' as dan, count(*) as n, sum((l.after ->> 'credits')::int) as credits,
                 count(*) filter (where (l.after ->> 'from_class_count')::boolean
                                        and l.after ->> 'name' = 'Assistant Instructor') as fcc
            from public.change_log l where l.action = 'star_seed' and l.table_name = 'star_categories'
           group by 1) as x;
  if v_txt is distinct from '1:11:70:1 2:13:70:1 3:10:70:1' then
    raise exception 'TEST FAILED: T3a seeded subjects per Dan (Dan:count:credits:AI) are %', v_txt;
  end if;
  if not exists (select 1 from public.change_log l where l.action = 'star_seed' and l.table_name = 'star_categories'
                  and l.after ->> 'name' = 'White–Deputy Curriculum' and l.after ->> 'credits' = '15' and l.after ->> 'dan' = '1')
     or not exists (select 1 from public.change_log l where l.action = 'star_seed' and l.table_name = 'star_categories'
                     and l.after ->> 'name' = '1st & 2nd Dan Curriculum' and l.after ->> 'dan' = '3') then
    raise exception 'TEST FAILED: T3a seeded subject names (en dash, ampersand)';
  end if;
  select string_agg(format('%s=%s', l.after ->> 'grade', l.after ->> 'value'), ' ' order by (l.after ->> 'position')::int)
    into v_txt from public.change_log l where l.action = 'star_seed' and l.table_name = 'star_grade_values';
  if v_txt is distinct from 'A+=4.5 A=4.0 B+=3.5 B=3.0 C+=2.5 C=2.0 D=0.0' then
    raise exception 'TEST FAILED: T3a seeded grade values are %', v_txt;
  end if;
  select format('%s|%s,%s,%s,%s,%s,%s|%s,%s,%s,%s,%s,%s', l.after ->> 'child_max_age',
                l.after ->> 'child_a_plus', l.after ->> 'child_a', l.after ->> 'child_b_plus', l.after ->> 'child_b',
                l.after ->> 'child_c_plus', l.after ->> 'child_c', l.after ->> 'adult_a_plus', l.after ->> 'adult_a',
                l.after ->> 'adult_b_plus', l.after ->> 'adult_b', l.after ->> 'adult_c_plus', l.after ->> 'adult_c')
    into v_txt from public.change_log l where l.action = 'star_seed' and l.table_name = 'star_assistant_table';
  if v_txt is distinct from '12|15,14,13,12,11,10|20,18,16,14,12,10' then
    raise exception 'TEST FAILED: T3a seeded assistant table is %', v_txt;
  end if;
  -- and the live template has one row per Dan, one assistant row, 7 values
  if (select count(*) from public.star_dan_settings) <> 3 or (select count(*) from public.star_assistant_table) <> 1
     or (select count(*) from public.star_grade_values) <> 7 then
    raise exception 'TEST FAILED: T3a the template must have 3 Dans, 1 assistant row and 7 grade values';
  end if;

  -- T3b. every rubric function: ok, version, unchanged = no write, stale,
  --      invalid, duplicate names, dense positions
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_update_dan_settings(1, v_dv1, 250, 4, 14000, 15000, 16000);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_dv1 + 1) then
    raise exception 'TEST FAILED: T3b update_dan_settings expected {ok, %}, got %', v_dv1 + 1, v_r;
  end if;
  reset role;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_update_dan_settings(1, v_dv1 + 1, 250, 4, 14000, 15000, 16000);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_dv1 + 1) then
    raise exception 'TEST FAILED: T3b unchanged update_dan_settings expected {ok, %}, got %', v_dv1 + 1, v_r;
  end if;
  if public.star_update_dan_settings(1, v_dv1, 251, 4, 14000, 15000, 16000) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T3b update_dan_settings with an old version expected stale';
  end if;
  foreach v_txt in array array[
      'public.star_update_dan_settings(1, %s, 245.55, 4, 14000, 15000, 16000)',
      'public.star_update_dan_settings(1, %s, 0, 4, 14000, 15000, 16000)',
      'public.star_update_dan_settings(1, %s, 10000, 4, 14000, 15000, 16000)',
      'public.star_update_dan_settings(1, %s, 245, 0, 14000, 15000, 16000)',
      'public.star_update_dan_settings(1, %s, 245, 21, 14000, 15000, 16000)',
      'public.star_update_dan_settings(1, %s, 245, 4, 14050, 15000, 16000)',
      'public.star_update_dan_settings(1, %s, 245, 4, 14000, 100100, 16000)'] loop
    execute 'select ' || format(v_txt, v_dv1 + 1) into v_r;
    if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: T3b % expected invalid, got %', v_txt, v_r; end if;
  end loop;
  if public.star_update_dan_settings(9, 1, 245, 4, 14000, 15000, 16000) ->> 'status' <> 'not_found' then
    raise exception 'TEST FAILED: T3b update_dan_settings of Dan 9 expected not_found';
  end if;
  reset role;
  if exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: T3b an unchanged / refused rubric save wrote history';
  end if;
  set local role authenticated;
  -- add / update / duplicate names
  v_r := public.star_add_category(1, '  ' || v_tag || '   Extra  ', 5);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> 1 or (v_r ->> 'position')::int <> 11 then
    raise exception 'TEST FAILED: T3b add_category expected {ok, version 1, position 11}, got %', v_r;
  end if;
  v_cat_x := (v_r ->> 'id')::uuid;
  if (select k.name from public.star_categories k where k.id = v_cat_x) <> v_tag || ' Extra' then
    raise exception 'TEST FAILED: T3b add_category must store the tidied name';
  end if;
  if public.star_add_category(1, upper(v_tag) || '  EXTRA ', 5) ->> 'status' <> 'duplicate_name'
     or public.star_add_category(1, 'breaking', 5) ->> 'status' <> 'duplicate_name'
     or public.star_add_category(2, v_tag || ' Extra', 5) ->> 'status' <> 'ok'   -- another Dan may use the name
     or public.star_add_category(1, v_tag || ' Zero', 0) ->> 'status' <> 'invalid'
     or public.star_add_category(1, v_tag || ' Big', 101) ->> 'status' <> 'invalid'
     or public.star_add_category(1, '   ', 5) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T3b add_category duplicate / input rules';
  end if;
  v_r := public.star_update_category(v_cat_x, 1, v_tag || ' Extra Two', 7);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'id', v_cat_x, 'version', 2) then
    raise exception 'TEST FAILED: T3b update_category expected {ok, id, 2}, got %', v_r;
  end if;
  v_r := public.star_update_category(v_cat_x, 2, v_tag || ' Extra Two', 7);
  if v_r ->> 'version' <> '2' then raise exception 'TEST FAILED: T3b unchanged update_category bumped the version: %', v_r; end if;
  if public.star_update_category(v_cat_x, 2, 'BREAKING', 7) ->> 'status' <> 'duplicate_name'
     or public.star_update_category(v_cat_x, 1, v_tag || ' Extra Three', 7) ->> 'status' <> 'stale'
     or public.star_update_category(v_cat_x, 2, v_tag || ' Extra Three', 0) ->> 'status' <> 'invalid'
     or public.star_update_category(v_rand, 1, v_tag || ' Extra Three', 5) ->> 'status' <> 'not_found' then
    raise exception 'TEST FAILED: T3b update_category duplicate / stale / input rules';
  end if;
  -- reorder: reversed, no version changes, dense positions
  reset role;
  v_ids := array(select k.id from public.star_categories k where k.dan = 1 order by k.position);
  v_vers := array(select k.version from public.star_categories k where k.dan = 1 order by k.id);
  v_ids2 := array(select x.id from unnest(v_ids) with ordinality as x(id, o) order by x.o desc);
  set local role authenticated;
  v_r := public.star_reorder_categories(1, v_ids, v_ids2);
  if v_r is distinct from '{"status": "ok"}'::jsonb then raise exception 'TEST FAILED: T3b reorder expected ok, got %', v_r; end if;
  if public.star_reorder_categories(1, v_ids, v_ids2) ->> 'status' <> 'stale'
     or public.star_reorder_categories(1, v_ids2, v_ids2[2:]) ->> 'status' <> 'invalid'
     or public.star_reorder_categories(1, v_ids2, v_ids2 || v_rand) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T3b reorder stale / invalid rules';
  end if;
  reset role;
  if array(select k.id from public.star_categories k where k.dan = 1 order by k.position) <> v_ids2
     or array(select k.version from public.star_categories k where k.dan = 1 order by k.id) <> v_vers
     or array(select k.position from public.star_categories k where k.dan = 1 order by k.position)
        <> array(select generate_series(0, cardinality(v_ids) - 1)) then
    raise exception 'TEST FAILED: T3b reorder must renumber densely without bumping a version';
  end if;
  -- delete: later subjects move up, positions stay dense
  set local role authenticated;
  v_r := public.star_delete_category(v_cat_x, 1);
  if v_r ->> 'status' <> 'stale' then raise exception 'TEST FAILED: T3b delete_category with an old version expected stale, got %', v_r; end if;
  v_r := public.star_delete_category(v_cat_x, 2);
  if v_r is distinct from '{"status": "ok"}'::jsonb then raise exception 'TEST FAILED: T3b delete_category expected ok, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.star_categories k where k.id = v_cat_x)
     or array(select k.position from public.star_categories k where k.dan = 1 order by k.position)
        <> array(select generate_series(0, 10)) then
    raise exception 'TEST FAILED: T3b after delete_category the Dan must have positions 0..10';
  end if;

  -- T3c. Assistant Instructor: rename and re-credit ok; can't be deleted;
  --      can't stop being "from the class count"; no second one
  select k.id, k.version into v_cat_ai1, v_v from public.star_categories k where k.dan = 1 and k.from_class_count;
  set local role authenticated;
  v_r := public.star_update_category(v_cat_ai1, v_v, 'Assistant Instructor (classes)', 6);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T3c rename / re-credit Assistant Instructor expected ok, got %', v_r; end if;
  v_r := public.star_delete_category(v_cat_ai1, v_v + 1);
  if v_r ->> 'status' <> 'invalid' then raise exception 'TEST FAILED: T3c deleting Assistant Instructor expected invalid, got %', v_r; end if;
  reset role;
  begin
    update public.star_categories set from_class_count = false where id = v_cat_ai1;
    raise exception 'TEST FAILED: T3c from_class_count could be changed';
  exception when check_violation then null;
  end;
  begin
    insert into public.star_categories (dan, name, credits, position, from_class_count, created_by_name, updated_by_name)
    values (1, v_tag || ' second AI', 5, 50, true, '', '');
    raise exception 'TEST FAILED: T3c a second Assistant Instructor could be added';
  exception when unique_violation then null;
  end;

  -- T3d. a Dan at 75 credits saves (70 is shown, not required)
  select k.id, k.version into v_cat, v_v from public.star_categories k where k.dan = 1 and k.name = 'Breaking';
  set local role authenticated;
  v_r := public.star_update_category(v_cat, v_v, 'Breaking', 9);
  reset role;
  if v_r ->> 'status' <> 'ok' or (select sum(k.credits) from public.star_categories k where k.dan = 1) <> 75 then
    raise exception 'TEST FAILED: T3d a Dan with 75 credits must save (got %, total %)', v_r,
      (select sum(k.credits) from public.star_categories k where k.dan = 1);
  end if;

  -- T3e. grade values and the assistant table: strictly going down, in
  --      range, the right length; D may be more than 0
  v_gv := array(select v.version from public.star_grade_values v order by v.position);
  set local role authenticated;
  if public.star_update_grade_values(v_gv, '{4.5,4.5,3.5,3,2.5,2,0}') ->> 'status' <> 'invalid'
     or public.star_update_grade_values(v_gv, '{10,4,3.5,3,2.5,2,0}') ->> 'status' <> 'invalid'
     or public.star_update_grade_values(v_gv, '{4.5,4,3.5,3,2.5,-1,-2}') ->> 'status' <> 'invalid'
     or public.star_update_grade_values(v_gv, '{4.5,4,3.5,3,2.5,2}') ->> 'status' <> 'invalid'
     or public.star_update_grade_values(v_gv[1:6], '{4.5,4,3.5,3,2.5,2,0}') ->> 'status' <> 'invalid'
     or public.star_update_grade_values(v_gv, '{4.55,4,3.5,3,2.5,2,0}') ->> 'status' <> 'invalid'
     or public.star_update_grade_values(v_gv, array[4.5, 4, 3.5, 3, 2.5, null, 0]::numeric[]) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T3e grade value input rules';
  end if;
  v_r := public.star_update_grade_values(v_gv, '{4.5,4,3.5,3,2.5,2,0.5}');
  if v_r ->> 'status' <> 'ok'
     or v_r -> 'versions' is distinct from to_jsonb(array[v_gv[1], v_gv[2], v_gv[3], v_gv[4], v_gv[5], v_gv[6], v_gv[7] + 1]) then
    raise exception 'TEST FAILED: T3e D = 0.5 must save, bumping only D''s version, got %', v_r;
  end if;
  if public.star_update_grade_values(v_gv, '{4.5,4,3.5,3,2.5,2,0.4}') ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T3e grade values with old versions expected stale';
  end if;
  reset role;
  select a.version into v_av from public.star_assistant_table a;
  set local role authenticated;
  if public.star_update_assistant_table(v_av, 12, '{15,15,13,12,11,10}', '{20,18,16,14,12,10}') ->> 'status' <> 'invalid'
     or public.star_update_assistant_table(v_av, 12, '{15,14,13,12,11,10}', '{20,18,16,14,12,12}') ->> 'status' <> 'invalid'
     or public.star_update_assistant_table(v_av, 12, '{15,14,13,12,11,0}', '{20,18,16,14,12,10}') ->> 'status' <> 'invalid'
     or public.star_update_assistant_table(v_av, 12, '{15,14,13,12,11}', '{20,18,16,14,12,10}') ->> 'status' <> 'invalid'
     or public.star_update_assistant_table(v_av, 31, '{15,14,13,12,11,10}', '{20,18,16,14,12,10}') ->> 'status' <> 'invalid'
     or public.star_update_assistant_table(v_av, 12, '{1000,14,13,12,11,10}', '{20,18,16,14,12,10}') ->> 'status' <> 'invalid'
     or public.star_update_assistant_table(v_av + 1, 12, '{15,14,13,12,11,10}', '{20,18,16,14,12,10}') ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T3e assistant table input / stale rules';
  end if;
  v_r := public.star_update_assistant_table(v_av, 12, '{15,14,13,12,11,10}', '{20,18,16,14,12,10}');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_av) then
    raise exception 'TEST FAILED: T3e unchanged assistant table expected {ok, %}, got %', v_av, v_r;
  end if;
  reset role;
  begin
    update public.star_assistant_table set child_a = child_a_plus;
    raise exception 'TEST FAILED: T3e a non-decreasing assistant column was stored';
  exception when check_violation then null;
  end;
  begin
    update public.star_grade_values set value = 10 where grade = 'A+';
    raise exception 'TEST FAILED: T3e a grade value of 10 was stored';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- T4. Events
  -- ===================================================================

  -- T4a. Add event: two different valid codes, Closed, and a copy equal
  --      to the template AT THAT MOMENT (the template was changed in T3)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || '  Copy   One ', v_today + 40, '18:45', 'worcester', false, null, E'  Bring water.\r\nArrive early.  ');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> 1
     or (v_r ->> 'public_code_worcester') !~ '^[a-hjkmnp-z2-9]{8}$'
     or (v_r ->> 'public_code_shrewsbury') !~ '^[a-hjkmnp-z2-9]{8}$'
     or v_r ->> 'public_code_worcester' = v_r ->> 'public_code_shrewsbury'
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k)
        <> array['id', 'public_code_shrewsbury', 'public_code_worcester', 'status', 'version'] then
    raise exception 'TEST FAILED: T4a add_event answer %', v_r;
  end if;
  v_et := (v_r ->> 'id')::uuid;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: T4a tags not cleared after add_event';
  end if;
  reset role;
  select * into v_ev_row from public.star_events e where e.id = v_et;
  if v_ev_row.name <> v_tag || ' Copy One' or v_ev_row.registration_open or v_ev_row.first_opened_at is not null
     or v_ev_row.note <> E'Bring water.\nArrive early.' or v_ev_row.created_by is distinct from v_admin
     or v_ev_row.start_time <> '18:45' then
    raise exception 'TEST FAILED: T4a stored event wrong: %', to_jsonb(v_ev_row);
  end if;
  -- the copy = the template now (compared as text, row by row)
  v_txt := (select string_agg(format('%s|%s|%s|%s|%s|%s|%s', d.dan, d.label, d.pass_mark, d.star_limit, d.standard_cents,
                                     d.same_day_cents, d.private_cents), ';' order by d.dan) from public.star_dan_settings d)
        || (select string_agg(format('%s|%s|%s|%s|%s|%s', k.dan, k.id, k.name, k.credits, k.position, k.from_class_count), ';'
                              order by k.dan, k.position) from public.star_categories k)
        || (select string_agg(format('%s|%s|%s', v.grade, v.position, v.value), ';' order by v.position) from public.star_grade_values v)
        || (select format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', a.child_max_age, a.child_a_plus, a.child_a, a.child_b_plus,
                          a.child_b, a.child_c_plus, a.child_c, a.adult_a_plus, a.adult_a, a.adult_b_plus, a.adult_b,
                          a.adult_c_plus, a.adult_c) from public.star_assistant_table a);
  v_txt2 := (select string_agg(format('%s|%s|%s|%s|%s|%s|%s', d.dan, d.label, d.pass_mark, d.star_limit, d.standard_cents,
                                      d.same_day_cents, d.private_cents), ';' order by d.dan) from public.star_event_dans d where d.event_id = v_et)
         || (select string_agg(format('%s|%s|%s|%s|%s|%s', k.dan, k.template_category_id, k.name, k.credits, k.position, k.from_class_count), ';'
                               order by k.dan, k.position) from public.star_event_categories k where k.event_id = v_et)
         || (select string_agg(format('%s|%s|%s', v.grade, v.position, v.value), ';' order by v.position) from public.star_event_grades v where v.event_id = v_et)
         || (select format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', a.child_max_age, a.child_a_plus, a.child_a, a.child_b_plus,
                           a.child_b, a.child_c_plus, a.child_c, a.adult_a_plus, a.adult_a, a.adult_b_plus, a.adult_b,
                           a.adult_c_plus, a.adult_c) from public.star_event_assistant a where a.event_id = v_et);
  if v_txt is null or v_txt is distinct from v_txt2 then
    raise exception 'TEST FAILED: T4a the event copy differs from the template';
  end if;
  -- later template changes (a fee, credits, a rename, a removed subject, a
  -- grade value, an assistant minimum) leave the copy alone...
  select d.version into v_v from public.star_dan_settings d where d.dan = 2;
  select k.id, k.version into v_cat, v_v2 from public.star_categories k where k.dan = 1 and k.name = 'Knowledge';
  v_gv := array(select v.version from public.star_grade_values v order by v.position);
  select a.version into v_av from public.star_assistant_table a;
  set local role authenticated;
  if public.star_update_dan_settings(2, v_v, 245, 3, 15500, 16000, 17000) ->> 'status' <> 'ok'
     or public.star_update_category(v_cat, v_v2, 'Knowledge Test', 8) ->> 'status' <> 'ok'
     or public.star_delete_category((select k.id from public.star_categories k where k.dan = 3 and k.name = 'Creative Poomsae'),
                                    (select k.version from public.star_categories k where k.dan = 3 and k.name = 'Creative Poomsae')) ->> 'status' <> 'ok'
     or public.star_update_grade_values(v_gv, '{4.6,4,3.5,3,2.5,2,0.5}') ->> 'status' <> 'ok'
     or public.star_update_assistant_table(v_av, 12, '{16,14,13,12,11,10}', '{20,18,16,14,12,10}') ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: T4a setup of the later template changes';
  end if;
  reset role;
  v_snap := (select string_agg(format('%s|%s|%s|%s|%s|%s|%s', d.dan, d.label, d.pass_mark, d.star_limit, d.standard_cents,
                                      d.same_day_cents, d.private_cents), ';' order by d.dan) from public.star_event_dans d where d.event_id = v_et)
         || (select string_agg(format('%s|%s|%s|%s|%s|%s', k.dan, k.template_category_id, k.name, k.credits, k.position, k.from_class_count), ';'
                               order by k.dan, k.position) from public.star_event_categories k where k.event_id = v_et)
         || (select string_agg(format('%s|%s|%s', v.grade, v.position, v.value), ';' order by v.position) from public.star_event_grades v where v.event_id = v_et)
         || (select format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', a.child_max_age, a.child_a_plus, a.child_a, a.child_b_plus,
                           a.child_b, a.child_c_plus, a.child_c, a.adult_a_plus, a.adult_a, a.adult_b_plus, a.adult_b,
                           a.adult_c_plus, a.adult_c) from public.star_event_assistant a where a.event_id = v_et);
  if v_snap is distinct from v_txt2 then
    raise exception 'TEST FAILED: T4a later template changes changed an existing event''s copy';
  end if;
  -- ...and a NEW event copies the new values
  set local role authenticated;
  v_r := public.star_add_event(v_tag || ' Copy Two', v_today + 41, '10:00', 'shrewsbury', true, v_today + 30, null);
  v_et2 := (v_r ->> 'id')::uuid;
  reset role;
  if not exists (select 1 from public.star_event_dans d where d.event_id = v_et2 and d.dan = 2 and d.standard_cents = 15500)
     or not exists (select 1 from public.star_event_categories k where k.event_id = v_et2 and k.name = 'Knowledge Test' and k.credits = 8)
     or exists (select 1 from public.star_event_categories k where k.event_id = v_et2 and k.name = 'Creative Poomsae')
     or not exists (select 1 from public.star_event_grades v where v.event_id = v_et2 and v.grade = 'A+' and v.value = 4.6)
     or not exists (select 1 from public.star_event_assistant a where a.event_id = v_et2 and a.child_a_plus = 16)
     or not exists (select 1 from public.star_events e where e.id = v_et2 and e.registration_open and e.first_opened_at is not null) then
    raise exception 'TEST FAILED: T4a a new event must copy the template as it is now (and open sets first_opened_at)';
  end if;

  -- T4b. Add event input rules and the name rule (across ALL Star events)
  set local role authenticated;
  foreach v_txt in array array[
      format('public.star_add_event(%L, %L::date, %L::time, %L, false, null, null)', v_tag || ' b1', v_today - 1, '10:00', 'worcester'),
      format('public.star_add_event(%L, %L::date, %L::time, %L, false, null, null)', v_tag || ' b2', v_today + 9, '07:45', 'worcester'),
      format('public.star_add_event(%L, %L::date, %L::time, %L, false, null, null)', v_tag || ' b3', v_today + 9, '20:15', 'worcester'),
      format('public.star_add_event(%L, %L::date, %L::time, %L, false, null, null)', v_tag || ' b4', v_today + 9, '10:10', 'worcester'),
      format('public.star_add_event(%L, %L::date, %L::time, %L, false, null, null)', v_tag || ' b5', v_today + 9, '10:00:30', 'worcester'),
      format('public.star_add_event(%L, %L::date, %L::time, %L, false, null, null)', v_tag || ' b6', v_today + 9, '10:00', 'boston'),
      format('public.star_add_event(%L, %L::date, %L::time, %L, false, %L::date, null)', v_tag || ' b7', v_today + 9, '10:00', 'worcester', v_today + 10),
      format('public.star_add_event(%L, %L::date, %L::time, %L, false, %L::date, null)', v_tag || ' b8', v_today + 9, '10:00', 'worcester', v_today - 1),
      format('public.star_add_event(%L, %L::date, %L::time, %L, false, null, %L)', v_tag || ' b9', v_today + 9, '10:00', 'worcester', repeat('x', 601)),
      format('public.star_add_event(%L, %L::date, %L::time, %L, null, null, null)', v_tag || ' b10', v_today + 9, '10:00', 'worcester'),
      format('public.star_add_event(%L, %L::date, %L::time, %L, false, null, null)', repeat('x', 61), v_today + 9, '10:00', 'worcester')] loop
    execute 'select ' || v_txt into v_r;
    if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: T4b % expected invalid, got %', v_txt, v_r; end if;
  end loop;
  if public.star_add_event(upper(v_tag) || '  copy one', v_today + 9, '08:00', 'worcester', false, null, null) ->> 'status' <> 'duplicate_name'
     or public.star_add_event(v_tag || ' Edge Times A', v_today, '08:00', 'worcester', false, v_today, null) ->> 'status' <> 'ok'
     or public.star_add_event(v_tag || ' Edge Times B', v_today, '20:00', 'shrewsbury', false, null, null) ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: T4b duplicate name / 8:00 and 20:00 on today';
  end if;

  -- T4c. Edit event: a past event may keep its date, may move into the
  --      future, may not move to another past date; the copy is never
  --      touched; the codes and the copy can't change even for postgres
  v_r := public.star_add_event(v_tag || ' Past', v_today + 2, '10:00', 'worcester', false, null, null);
  v_ep := (v_r ->> 'id')::uuid; v_ep_w := v_r ->> 'public_code_worcester'; v_ep_s := v_r ->> 'public_code_shrewsbury';
  reset role;
  update public.star_events set testing_date = v_today - 5 where id = v_ep;
  select e.version into v_v from public.star_events e where e.id = v_ep;
  v_snap := (select string_agg(to_jsonb(d)::text, ';' order by d.id) from public.star_event_dans d where d.event_id = v_ep)
         || (select string_agg(to_jsonb(k)::text, ';' order by k.id) from public.star_event_categories k where k.event_id = v_ep);
  set local role authenticated;
  v_r := public.star_update_event(v_ep, v_v, v_tag || ' Past Renamed', v_today - 5, '10:30', 'shrewsbury', null, 'Note');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: T4c a past event keeping its date expected {ok, %}, got %', v_v + 1, v_r;
  end if;
  v_r := public.star_update_event(v_ep, v_v + 1, v_tag || ' Past Renamed', v_today - 5, '10:30', 'shrewsbury', null, 'Note');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: T4c an unchanged save expected {ok, %} (no write), got %', v_v + 1, v_r;
  end if;
  if public.star_update_event(v_ep, v_v + 1, v_tag || ' Past Renamed', v_today - 6, '10:30', 'shrewsbury', null, null) ->> 'status' <> 'invalid'
     or public.star_update_event(v_ep, v_v, v_tag || ' Past Renamed', v_today + 6, '10:30', 'shrewsbury', null, null) ->> 'status' <> 'stale'
     or public.star_update_event(v_ep, v_v + 1, v_tag || ' Main', v_today + 6, '10:30', 'shrewsbury', null, null) ->> 'status' <> 'duplicate_name'
     or public.star_update_event(v_ep, v_v + 1, v_tag || ' Past Renamed', v_today + 6, '10:30', 'shrewsbury', v_today + 7, null) ->> 'status' <> 'invalid'
     or public.star_update_event(v_ep, v_v + 1, v_tag || ' Past Renamed', v_today + 6, '10:30', 'shrewsbury', v_today - 1, null) ->> 'status' <> 'invalid'
     or public.star_update_event(v_ep, v_v + 1, v_tag || ' Past Renamed', v_today + 6, '10:35', 'shrewsbury', null, null) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T4c update_event date / stale / name / closing date / time rules';
  end if;
  v_r := public.star_update_event(v_ep, v_v + 1, v_tag || ' Past Renamed', v_today + 6, '10:30', 'shrewsbury', v_today + 4, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T4c moving a past event into the future expected ok, got %', v_r; end if;
  reset role;
  if v_snap is distinct from (select string_agg(to_jsonb(d)::text, ';' order by d.id) from public.star_event_dans d where d.event_id = v_ep)
                           || (select string_agg(to_jsonb(k)::text, ';' order by k.id) from public.star_event_categories k where k.event_id = v_ep) then
    raise exception 'TEST FAILED: T4c update_event touched the event copy';
  end if;
  begin
    update public.star_events set public_code_worcester = 'zzzzzzz2' where id = v_ep;
    raise exception 'TEST FAILED: T4c a link code could be changed';
  exception when check_violation then null;
  end;
  begin
    update public.star_event_dans set pass_mark = 1 where event_id = v_ep;
    raise exception 'TEST FAILED: T4c the event copy could be changed';
  exception when check_violation then null;
  end;
  begin
    update public.star_event_categories set credits = credits where event_id = v_ep;
    raise exception 'TEST FAILED: T4c the event copy (categories) could be updated';
  exception when check_violation then null;
  end;
  begin   -- a code already used by another event, in the OTHER column
    insert into public.star_events (name, testing_date, start_time, where_code, public_code_worcester, public_code_shrewsbury,
                                    created_by_name, updated_by_name)
    values (v_tag || ' code clash', v_today + 9, '10:00', 'worcester', v_ep_s, 'zzzzzzz3', '', '');
    raise exception 'TEST FAILED: T4c a code used by another event (other column) was accepted';
  exception when unique_violation then
    get stacked diagnostics v_txt = constraint_name;
    if v_txt <> 'star_events_public_code_cross_key' then raise exception 'TEST FAILED: T4c code clash raised %', v_txt; end if;
  end;

  -- T4d. the state: the pure rule at the minute boundaries in
  --      America/New_York (the same cases as 0005 and the app's checks),
  --      then the switch per role
  v_ev_row.testing_date := '2026-11-20'; v_ev_row.auto_close_on := '2026-11-13';
  v_ev_row.registration_open := true; v_ev_row.first_opened_at := '2026-10-20 10:00-04';
  if public.star_event_state(v_ev_row, '2026-11-13') <> 'open'
     or public.star_event_state(v_ev_row, '2026-11-14') <> 'closed_by_date'
     or public.star_event_state(v_ev_row, '2026-11-20') <> 'closed_by_date'
     or public.star_event_state(v_ev_row, '2026-11-21') <> 'finished' then
    raise exception 'TEST FAILED: T4d open with closing date cases';
  end if;
  v_ev_row.auto_close_on := null;
  if public.star_event_state(v_ev_row, '2026-11-20') <> 'open' or public.star_event_state(v_ev_row, '2026-11-21') <> 'finished' then
    raise exception 'TEST FAILED: T4d open without closing date (incl. the testing day) cases';
  end if;
  v_ev_row.registration_open := false;
  if public.star_event_state(v_ev_row, '2026-11-10') <> 'closed' then raise exception 'TEST FAILED: T4d closed by hand case'; end if;
  v_ev_row.first_opened_at := null; v_ev_row.auto_close_on := '2026-11-13';
  if public.star_event_state(v_ev_row, '2026-11-10') <> 'not_open_yet' or public.star_event_state(v_ev_row, '2026-11-15') <> 'not_open_yet'
     or public.star_event_state(v_ev_row, '2026-11-21') <> 'finished' then
    raise exception 'TEST FAILED: T4d never-opened cases';
  end if;
  v_ev_row.registration_open := true; v_ev_row.first_opened_at := '2026-10-20 10:00-04';
  if public.star_event_state(v_ev_row, public.testing_school_date('2026-11-14 04:59:59+00')) <> 'open'          -- 11:59:59 PM Nov 13
     or public.star_event_state(v_ev_row, public.testing_school_date('2026-11-14 05:00:00+00')) <> 'closed_by_date' then   -- 12:00 AM Nov 14
    raise exception 'TEST FAILED: T4d the closing date ends at 11:59:59 PM Massachusetts time';
  end if;
  v_ev_row.auto_close_on := null;
  if public.star_event_state(v_ev_row, public.testing_school_date('2026-11-21 04:59:59+00')) <> 'open'
     or public.star_event_state(v_ev_row, public.testing_school_date('2026-11-21 05:00:00+00')) <> 'finished' then
    raise exception 'TEST FAILED: T4d the testing day ends at 11:59:59 PM Massachusetts time';
  end if;
  -- the switch, live (Past: in 6 days, closing in 4, never opened)
  select e.version into v_v from public.star_events e where e.id = v_ep;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.star_set_registration(v_ep, v_v - 1, true) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T4d switch with an old version expected stale';
  end if;
  v_r := public.star_set_registration(v_ep, v_v, true);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1, 'state', 'open') then
    raise exception 'TEST FAILED: T4d staff open expected {ok, %, open}, got %', v_v + 1, v_r;
  end if;
  v_r := public.star_set_registration(v_ep, v_v + 1, false);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 2, 'state', 'closed') then
    raise exception 'TEST FAILED: T4d staff close expected {ok, %, closed}, got %', v_v + 2, v_r;
  end if;
  v_r := public.star_set_registration(v_ep, v_v + 2, false);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 2, 'state', 'closed') then
    raise exception 'TEST FAILED: T4d closing a closed event must write nothing, got %', v_r;
  end if;
  reset role;
  update public.star_events set auto_close_on = v_today - 1 where id = v_ep;
  select e.version, e.first_opened_at into v_v, v_ts from public.star_events e where e.id = v_ep;
  set local role authenticated;
  v_r := public.star_set_registration(v_ep, v_v, true);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: T4d staff reopen after the closing date expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_set_registration(v_ep, v_v, true);
  if v_r ->> 'status' <> 'ok' or v_r ->> 'state' <> 'open' then
    raise exception 'TEST FAILED: T4d admin reopen after the closing date expected ok/open, got %', v_r;
  end if;
  reset role;
  if (select e.auto_close_on from public.star_events e where e.id = v_ep) is not null
     or (select e.first_opened_at from public.star_events e where e.id = v_ep) <> v_ts then
    raise exception 'TEST FAILED: T4d admin reopen must clear the closing date and keep first_opened_at';
  end if;
  update public.star_events set testing_date = v_today - 1 where id = v_ep;
  select e.version into v_v from public.star_events e where e.id = v_ep;
  set local role authenticated;
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    if public.star_set_registration(v_ep, v_v, false) ->> 'status' <> 'finished' then
      raise exception 'TEST FAILED: T4d the switch on a finished event expected finished';
    end if;
  end loop;
  reset role;

  -- T4e. Delete event: the dialog's numbers must match; then everything in
  --      it goes, every row logged with star_delete_event in one batch
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' Delete Me', v_today + 12, '10:00', 'worcester', true, null, null);
  v_edel := (v_r ->> 'id')::uuid; v_edel_w := v_r ->> 'public_code_worcester';
  perform set_config('request.jwt.claims', '', true);
  v_r := public.star_public_register(v_edel_w, v_tag || ' kdel', gen_random_uuid(), 'Del', 'Form', v_adult, 'del@example.com',
                                     1, 0, 'cash', true, v_sig, v_ack);
  select c.id into v_x1 from public.star_candidates c where c.reference = v_r ->> 'reference';
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_x2 := (public.star_add_candidate(v_edel, 'Del', 'Desk', null, 'deld@example.com', 'shrewsbury', 1, 0, 'card') ->> 'id')::uuid;
  v_r := public.star_record_payment(v_x2, 1, 'card', 14000, v_today);
  perform pg_temp.st_grade_all(v_x2, 'A+');
  v_r := public.star_set_count(v_x2, 'assistant_classes', 20);
  v_r := public.star_mark_result_sent(v_x2, (v_r -> 'result') ->> 'result_key');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T4e mark_result_sent answered %', v_r; end if;
  insert into public.star_makeup_subjects (candidate_id, event_category_id, kind, created_by_name, updated_by_name)
  select v_x2, k.id, 'chosen', '', '' from public.star_event_categories k where k.event_id = v_edel and k.dan = 1 and k.position = 0;
  select e.version into v_v from public.star_events e where e.id = v_edel;
  if (select count(*) from public.star_candidates c where c.event_id = v_edel) <> 2 then raise exception 'TEST SETUP: T4e candidates'; end if;
  execute v_snap_sql into v_snap;
  set local role authenticated;
  if public.star_delete_event(v_edel, v_v, 1, 14000) ->> 'status' <> 'stale'
     or public.star_delete_event(v_edel, v_v, 2, 14100) ->> 'status' <> 'stale'
     or public.star_delete_event(v_edel, v_v + 1, 2, 14000) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T4e wrong count / total / version must be stale';
  end if;
  reset role;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: T4e a refused delete_event removed something'; end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_delete_event(v_edel, v_v, 2, 14000);
  if v_r is distinct from '{"status": "ok"}'::jsonb then raise exception 'TEST FAILED: T4e delete_event expected ok, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.star_events e where e.id = v_edel)
     or exists (select 1 from public.star_candidates c where c.event_id = v_edel)
     or exists (select 1 from public.star_event_dans d where d.event_id = v_edel)
     or exists (select 1 from public.star_event_categories k where k.event_id = v_edel)
     or exists (select 1 from public.star_event_grades v where v.event_id = v_edel)
     or exists (select 1 from public.star_event_assistant a where a.event_id = v_edel)
     or exists (select 1 from public.star_candidate_signatures s where s.candidate_id in (v_x1, v_x2))
     or exists (select 1 from public.star_grades g where g.candidate_id in (v_x1, v_x2))
     or exists (select 1 from public.star_payments p where p.candidate_id in (v_x1, v_x2))
     or exists (select 1 from public.star_makeup_subjects m where m.candidate_id in (v_x1, v_x2))
     or exists (select 1 from public.star_result_emails r where r.candidate_id in (v_x1, v_x2)) then
    raise exception 'TEST FAILED: T4e the event and everything in it should be gone';
  end if;
  select string_agg(distinct l.table_name, ',' order by l.table_name) into v_txt
    from public.change_log l where l.id > v_mark and l.op = 'delete';
  if v_txt is distinct from 'star_candidate_signatures,star_candidates,star_event_assistant,star_event_categories,star_event_dans,'
                            'star_event_grades,star_events,star_grades,star_makeup_subjects,star_payments,star_result_emails' then
    raise exception 'TEST FAILED: T4e removals in the history: %', v_txt;
  end if;
  if exists (select 1 from public.change_log l where l.id > v_mark and (l.action <> 'star_delete_event' or l.op <> 'delete'))
     or (select count(distinct l.batch_id) from public.change_log l where l.id > v_mark) <> 1
     or exists (select 1 from public.change_log l where l.id > v_mark and l.batch_id is null) then
    raise exception 'TEST FAILED: T4e every removal must be logged as star_delete_event in one batch';
  end if;

  -- ===================================================================
  -- T5. The family form (called as the SQL Editor's role; the functions
  --     run as their owner either way)
  -- ===================================================================

  -- T5a. what the family page sees first: the link's school, the event,
  --      each Dan's subjects - no counts, no ids, no private fee
  perform set_config('request.jwt.claims', '', true);
  v_r := public.star_public_event(v_e1_w);
  if v_r ->> 'status' <> 'ok' or v_r ->> 'state' <> 'open' or v_r -> 'closed_on' <> 'null'::jsonb
     or v_r -> 'school' <> '{"code": "worcester", "name": "Worcester"}'::jsonb
     or v_r -> 'event' ->> 'name' <> v_tag || ' Main' or v_r -> 'event' ->> 'start_time' <> '10:00'
     or v_r -> 'event' ->> 'note' <> 'Bring water.' or (v_r -> 'event' ->> 'testing_date')::date <> v_today + 10
     or v_r -> 'event' -> 'where' ->> 'name' <> 'Shrewsbury'
     or v_r -> 'event' -> 'where' -> 'address' is distinct from coalesce(public.testing_location_address('shrewsbury'), 'null'::jsonb)
     or jsonb_array_length(v_r -> 'dans') <> 3
     or (v_r -> 'dans' -> 0 ->> 'max_score')::numeric <> 315.0
     or jsonb_array_length(v_r -> 'dans' -> 0 -> 'categories') <> 11 then
    raise exception 'TEST FAILED: T5a public_event (Worcester link) answer %', v_r;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['closed_on', 'dans', 'event', 'school', 'state', 'status']
     or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'event') as k)
        <> array['auto_close_on', 'name', 'note', 'start_time', 'testing_date', 'where']
     or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'dans' -> 0) as k)
        <> array['categories', 'dan', 'label', 'max_score', 'pass_mark', 'same_day_cents', 'standard_cents', 'star_limit']
     or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'dans' -> 0 -> 'categories' -> 0) as k) <> array['credits', 'name']
     or v_r::text like '%private%' or v_r::text like '%' || v_e1::text || '%' or v_r::text like '%' || v_f1::text || '%' then
    raise exception 'TEST FAILED: T5a public_event must hold exactly the listed keys (no ids, counts or private fee): %', v_r;
  end if;
  v_r := public.star_public_event(v_e1_s);
  if v_r -> 'school' <> '{"code": "shrewsbury", "name": "Shrewsbury"}'::jsonb then
    raise exception 'TEST FAILED: T5a the Shrewsbury link must set the school: %', v_r;
  end if;
  foreach v_txt in array array['zzzzzzzz', 'abc', 'ABCDEFGH', 'iiiiiiii', 'abcdefgh1', ''] loop
    if public.star_public_event(v_txt) is distinct from '{"status": "not_found"}'::jsonb then
      raise exception 'TEST FAILED: T5a code % expected not_found', v_txt;
    end if;
  end loop;
  if public.star_public_event(null) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: T5a a null code expected not_found';
  end if;

  -- T5b. a registration: the answer, the stored rows, the history by
  --      "Family form" - even with an admin's login token set (the wrapper
  --      forgets it first)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_public_register(v_e1_w, v_tag || ' k5', v_rand, '  Cy ', ' Doe  ', v_adult, ' cy@Example.com ', 2, 0,
                                     'cash', true, v_sig, v_ack);
  if v_r ->> 'status' <> 'ok' or v_r ->> 'reference' !~ '^ST-[0-9]{4,}$' or v_r ->> 'first_name' <> 'Cy'
     or v_r ->> 'school_name' <> 'Worcester' or (v_r ->> 'dan')::int <> 2 or v_r ->> 'dan_label' <> '2nd Dan'
     or (v_r ->> 'stars_to')::int <> 1 or (v_r ->> 'standard_cents')::int <> 15000 or (v_r ->> 'same_day_cents')::int <> 16000
     or v_r ->> 'paying_by' <> 'cash' or v_r ->> 'start_time' <> '10:00' or v_r -> 'where' ->> 'name' <> 'Shrewsbury'
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k)
        <> array['dan', 'dan_label', 'event_name', 'first_name', 'last_name', 'paying_by', 'reference', 'same_day_cents',
                 'school_name', 'standard_cents', 'stars_from', 'stars_to', 'start_time', 'status', 'testing_date', 'where'] then
    raise exception 'TEST FAILED: T5b public_register answer %', v_r;
  end if;
  if coalesce(current_setting('request.jwt.claims', true), '') <> ''
     or coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.actor_label', true), '') <> '' then
    raise exception 'TEST FAILED: T5b the wrapper must clear the login token and leave no tag';
  end if;
  select c.id into v_g1 from public.star_candidates c where c.reference = v_r ->> 'reference';
  if not exists (select 1 from public.star_candidates c
                  where c.id = v_g1 and c.source = 'form' and c.location_code = 'worcester' and c.paying_by = 'cash'
                    and c.first_name = 'Cy' and c.last_name = 'Doe' and c.email_for_results = 'cy@Example.com'
                    and c.date_of_birth = v_adult and c.dan = 2 and c.stars_from = 0 and c.created_by is null
                    and c.created_by_name = 'Family form' and not c.is_makeup and c.event_id = v_e1)
     or not exists (select 1 from public.star_candidate_signatures s
                     where s.candidate_id = v_g1 and s.submission_id = v_rand and s.acknowledged and s.ack_version = v_ack
                       and s.signature = v_sig and s.signed_at is not null and s.signature_deleted_at is null) then
    raise exception 'TEST FAILED: T5b the stored candidate / signature row is wrong';
  end if;
  if (select count(*) from public.change_log l where l.id > v_mark and l.action = 'star_public_register'
        and l.actor_name = 'Family form' and l.actor_id is null and l.op = 'insert'
        and l.table_name in ('star_candidates', 'star_candidate_signatures')) <> 2
     or exists (select 1 from public.change_log l where l.id > v_mark and l.action <> 'star_public_register') then
    raise exception 'TEST FAILED: T5b history must be 2 insert rows by "Family form" (no actor id), action star_public_register';
  end if;

  -- T5c. the same submission again = the same answer, no second row; the
  --      same submission id on another event = invalid
  select count(*) into v_n from public.star_candidates;
  v_r2 := public.star_public_register(v_e1_w, v_tag || ' k5', v_rand, 'Cy', 'Doe', v_adult, 'cy@Example.com', 2, 0,
                                      'cash', true, v_sig, v_ack);
  if v_r2 is distinct from v_r or (select count(*) from public.star_candidates) <> v_n then
    raise exception 'TEST FAILED: T5c the same submission must give the same answer and no new row (got %)', v_r2;
  end if;
  v_r2 := public.star_public_register(v_ea_w, v_tag || ' k5', v_rand, 'Cy', 'Doe', v_adult, 'cy@Example.com', 2, 0,
                                      'cash', true, v_sig, v_ack);
  if v_r2 is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: T5c a submission id of another event expected invalid, got %', v_r2;
  end if;
  -- a retry of a stored submission gets the same ok answer even when the
  -- event has closed meanwhile and the visitor key is over the limit (it
  -- never sees rate_limited or closed; the lookup is repeated after the
  -- event lock for retries that arrive at the same moment)
  update public.star_events set registration_open = false where id = v_e1;
  insert into public.testing_public_attempts (client_key, event_id, at, outcome)
  select v_tag || ' k5', null, now(), 'star:invalid' from generate_series(1, 25);
  v_r2 := public.star_public_register(v_e1_w, v_tag || ' k5', v_rand, 'Cy', 'Doe', v_adult, 'cy@Example.com', 2, 0,
                                      'cash', true, v_sig, v_ack);
  update public.star_events set registration_open = true where id = v_e1;
  if v_r2 is distinct from v_r then
    raise exception 'TEST FAILED: T5c a retry while closed and over the limit must get the same answer, got %', v_r2;
  end if;

  -- T5d. every input rule -> invalid, nothing written
  select count(*) into v_n from public.star_candidates;
  select count(*) into v_n2 from public.star_candidate_signatures;
  foreach v_txt in array array[
      format('%L::date, %L, 1, 0, %L, true, %L, %L', v_today + 1, 'x@example.com', 'cash', v_sig, v_ack),
      format('null, %L, 1, 0, %L, true, %L, %L', 'x@example.com', 'cash', v_sig, v_ack),
      format('%L::date, %L, 1, 0, %L, true, %L, %L', '1899-12-31', 'x@example.com', 'cash', v_sig, v_ack),
      format('%L::date, %L, 1, 0, %L, true, %L, %L', v_adult, 'x@example', 'cash', v_sig, v_ack),
      format('%L::date, %L, 1, 0, %L, true, %L, %L', v_adult, 'x y@example.com', 'cash', v_sig, v_ack),
      format('%L::date, null, 1, 0, %L, true, %L, %L', v_adult, 'cash', v_sig, v_ack),
      format('%L::date, %L, 1, 0, %L, true, %L, %L', v_adult, 'x@example.com', 'card', v_sig, v_ack),
      format('%L::date, %L, 1, 0, %L, false, %L, %L', v_adult, 'x@example.com', 'cash', v_sig, v_ack),
      format('%L::date, %L, 1, 0, %L, null, %L, %L', v_adult, 'x@example.com', 'cash', v_sig, v_ack),
      format('%L::date, %L, 1, 0, %L, true, %L, %L', v_adult, 'x@example.com', 'cash', v_sig_gif, v_ack),
      format('%L::date, %L, 1, 0, %L, true, %L, %L', v_adult, 'x@example.com', 'cash', v_sig_long, v_ack),
      format('%L::date, %L, 1, 0, %L, true, %L, %L', v_adult, 'x@example.com', 'cash', '<script>', v_ack),
      format('%L::date, %L, 1, 0, %L, true, null, %L', v_adult, 'x@example.com', 'cash', v_ack),
      format('%L::date, %L, 1, 0, %L, true, %L, %L', v_adult, 'x@example.com', 'cash', v_sig, 'cb-2026-10-17'),
      format('%L::date, %L, 9, 0, %L, true, %L, %L', v_adult, 'x@example.com', 'cash', v_sig, v_ack),
      format('%L::date, %L, 1, 4, %L, true, %L, %L', v_adult, 'x@example.com', 'cash', v_sig, v_ack),
      format('%L::date, %L, 1, -1, %L, true, %L, %L', v_adult, 'x@example.com', 'cash', v_sig, v_ack),
      format('%L::date, %L, null, 0, %L, true, %L, %L', v_adult, 'x@example.com', 'cash', v_sig, v_ack)] loop
    execute format('select public.star_public_register(%L, %L, gen_random_uuid(), %L, %L, %s)',
                   v_e1_w, v_tag || ' k5d', 'Ivy', 'Bad', v_txt) into v_r;
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T5d (%) expected invalid, got %', v_txt, v_r;
    end if;
  end loop;
  if public.star_public_register(v_e1_w, '', gen_random_uuid(), 'Ivy', 'Bad', v_adult, 'x@example.com', 1, 0, 'cash', true, v_sig, v_ack) ->> 'status' <> 'invalid'
     or public.star_public_register(v_e1_w, repeat('k', 201), gen_random_uuid(), 'Ivy', 'Bad', v_adult, 'x@example.com', 1, 0, 'cash', true, v_sig, v_ack) ->> 'status' <> 'invalid'
     or public.star_public_register(v_e1_w, v_tag || ' k5d', null, 'Ivy', 'Bad', v_adult, 'x@example.com', 1, 0, 'cash', true, v_sig, v_ack) ->> 'status' <> 'invalid'
     or public.star_public_register(v_e1_w, v_tag || ' k5d', gen_random_uuid(), '', 'Bad', v_adult, 'x@example.com', 1, 0, 'cash', true, v_sig, v_ack) ->> 'status' <> 'invalid'
     or public.star_public_register('zzzzzzzz', v_tag || ' k5d', gen_random_uuid(), 'Ivy', 'Bad', v_adult, 'x@example.com', 1, 0, 'cash', true, v_sig, v_ack) ->> 'status' <> 'not_found' then
    raise exception 'TEST FAILED: T5d client key / submission id / name / code rules';
  end if;
  if (select count(*) from public.star_candidates) <> v_n or (select count(*) from public.star_candidate_signatures) <> v_n2 then
    raise exception 'TEST FAILED: T5d a refused registration wrote a row';
  end if;

  -- T5e. refusals by the event's state
  v_r := public.star_public_register((select e.public_code_worcester from public.star_events e where e.id = v_et), v_tag || ' k5e',
           gen_random_uuid(), 'Ivy', 'State', v_adult, 'x@example.com', 1, 0, 'cash', true, v_sig, v_ack);
  if v_r is distinct from '{"status": "not_open"}'::jsonb then raise exception 'TEST FAILED: T5e never opened expected not_open, got %', v_r; end if;
  update public.star_events set registration_open = false where id = v_et2;
  v_r := public.star_public_register((select e.public_code_worcester from public.star_events e where e.id = v_et2), v_tag || ' k5e',
           gen_random_uuid(), 'Ivy', 'State', v_adult, 'x@example.com', 1, 0, 'cash', true, v_sig, v_ack);
  if v_r is distinct from '{"status": "closed", "closed_on": null}'::jsonb then
    raise exception 'TEST FAILED: T5e closed by hand expected {closed, null}, got %', v_r;
  end if;
  update public.star_events set registration_open = true, auto_close_on = v_today - 1 where id = v_et2;
  v_r := public.star_public_register((select e.public_code_shrewsbury from public.star_events e where e.id = v_et2), v_tag || ' k5e',
           gen_random_uuid(), 'Ivy', 'State', v_adult, 'x@example.com', 1, 0, 'cash', true, v_sig, v_ack);
  if v_r is distinct from jsonb_build_object('status', 'closed', 'closed_on', v_today - 1) then
    raise exception 'TEST FAILED: T5e closed by date expected {closed, %}, got %', v_today - 1, v_r;
  end if;
  if public.star_public_event((select e.public_code_shrewsbury from public.star_events e where e.id = v_et2)) ->> 'closed_on'
     <> (v_today - 1)::text then
    raise exception 'TEST FAILED: T5e public_event must say closed_on for a closed-by-date event';
  end if;
  v_r := public.star_public_register(v_ep_w, v_tag || ' k5e', gen_random_uuid(), 'Ivy', 'State', v_adult, 'x@example.com', 1, 0,
                                     'cash', true, v_sig, v_ack);
  if v_r is distinct from '{"status": "finished"}'::jsonb then raise exception 'TEST FAILED: T5e finished expected finished, got %', v_r; end if;
  if public.star_public_event(v_ep_w) ->> 'state' <> 'finished' then raise exception 'TEST FAILED: T5e public_event of a finished event'; end if;

  -- T5f. rate limit: the 21st try within an hour for one client key ->
  --      rate_limited, Color Belt's tries for that key counting too; every
  --      call writes one attempts row with a star: outcome; rows older than
  --      2 days are cleaned up
  insert into public.testing_public_attempts (client_key, event_id, at, outcome)
  select v_tag || ' rl', null, now() - interval '5 minutes', 'ok' from generate_series(1, 10);
  insert into public.testing_public_attempts (client_key, event_id, at, outcome)
  values (v_tag || ' old', null, now() - interval '3 days', 'ok');
  for v_i in 1 .. 10 loop
    v_r := public.star_public_register(v_e1_w, v_tag || ' rl', gen_random_uuid(), 'Rae', 'Limit', v_adult, 'bad email', 1, 0,
                                       'cash', true, v_sig, v_ack);
  end loop;
  v_r := public.star_public_register(v_e1_w, v_tag || ' rl', gen_random_uuid(), 'Rae', 'Limit', v_adult, 'rae@example.com', 1, 0,
                                     'cash', true, v_sig, v_ack);
  if v_r is distinct from '{"status": "rate_limited"}'::jsonb then
    raise exception 'TEST FAILED: T5f the 21st try expected rate_limited, got %', v_r;
  end if;
  if (select count(*) from public.testing_public_attempts a where a.client_key = v_tag || ' rl' and a.outcome = 'star:invalid' and a.event_id = v_e1) <> 10
     or (select count(*) from public.testing_public_attempts a where a.client_key = v_tag || ' rl' and a.outcome = 'star:rate_limited') <> 1
     or exists (select 1 from public.testing_public_attempts a where a.client_key = v_tag || ' old') then
    raise exception 'TEST FAILED: T5f attempts rows (star: outcomes, event id, 2-day clean-up)';
  end if;
  if exists (select 1 from public.star_candidates c where c.event_id = v_e1 and c.first_name = 'Rae') then
    raise exception 'TEST FAILED: T5f a rate-limited registration was stored';
  end if;

  -- T5g. a same-name + same-DOB registration is flagged "possible" on BOTH
  --      rows, and its answer is identical (except reference and names) to
  --      a non-duplicate's
  v_r := public.star_public_register(v_e1_s, v_tag || ' k5g', gen_random_uuid(), 'Uma', 'Unique', v_child, 'u@example.com', 1, 1,
                                     'check', true, v_sig, v_ack);
  v_r2 := public.star_public_register(v_e1_s, v_tag || ' k5g', gen_random_uuid(), ' bo ', 'KIM', v_child, 'u@example.com', 1, 1,
                                      'check', true, v_sig, v_ack);
  if v_r ->> 'status' <> 'ok' or (v_r - array['reference', 'first_name', 'last_name']) is distinct from (v_r2 - array['reference', 'first_name', 'last_name']) then
    raise exception 'TEST FAILED: T5g a duplicate''s answer must look like any other (% vs %)', v_r, v_r2;
  end if;
  select c.id into v_g2 from public.star_candidates c where c.reference = v_r2 ->> 'reference';
  if not exists (select 1 from public.star_candidates c where c.id = v_g2 and c.duplicate_state = 'possible' and c.duplicate_of = v_f1)
     or not exists (select 1 from public.star_candidates c where c.id = v_f1 and c.duplicate_state = 'possible' and c.duplicate_of = v_g2) then
    raise exception 'TEST FAILED: T5g both rows must be flagged possible duplicates of each other';
  end if;
  if exists (select 1 from public.star_candidates c where c.reference = v_r ->> 'reference' and c.duplicate_state <> 'none') then
    raise exception 'TEST FAILED: T5g a different person must not be flagged';
  end if;

  -- ===================================================================
  -- T6. Candidates
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);

  -- T6a. New candidate at the desk: no DOB allowed; a duplicate by the
  --      names alone when a DOB is missing; Finished refused; input rules
  v_c2 := (public.star_add_candidate(v_e1, 'Dee', 'Fox', v_adult, 'dee@example.com', 'shrewsbury', 1, 0, 'card') ->> 'id')::uuid;
  v_r := public.star_add_candidate(v_e1, ' dee ', 'FOX', null, 'dee2@example.com', 'worcester', 2, 2, 'cash');
  if v_r ->> 'status' <> 'ok' or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['id', 'status', 'version'] then
    raise exception 'TEST FAILED: T6a add_candidate without DOB expected {ok, id, version}, got %', v_r;
  end if;
  v_c3 := (v_r ->> 'id')::uuid;
  if not exists (select 1 from public.star_candidates c where c.id = v_c3 and c.duplicate_state = 'possible' and c.duplicate_of = v_c2
                   and c.source = 'desk' and c.reference is null and c.created_by = v_desk and c.created_by_name = 'Staff')
     or not exists (select 1 from public.star_candidates c where c.id = v_c2 and c.duplicate_state = 'possible' and c.duplicate_of = v_c3)
     or exists (select 1 from public.star_candidate_signatures s where s.candidate_id = v_c3) then
    raise exception 'TEST FAILED: T6a a same-name candidate without DOB must be flagged on both rows (desk row, no signature)';
  end if;
  if public.star_add_candidate(v_ep, 'Late', 'One', null, 'late@example.com', 'worcester', 1, 0, 'cash') ->> 'status' <> 'finished'
     or public.star_add_candidate(v_e1, 'Bad', 'Star', null, 'b@example.com', 'worcester', 2, 3, 'cash') ->> 'status' <> 'invalid'
     or public.star_add_candidate(v_e1, 'Bad', 'Dan', null, 'b@example.com', 'worcester', 9, 0, 'cash') ->> 'status' <> 'invalid'
     or public.star_add_candidate(v_e1, 'Bad', 'Mail', null, null, 'worcester', 1, 0, 'cash') ->> 'status' <> 'invalid'
     or public.star_add_candidate(v_e1, 'Bad', 'Dob', v_today + 1, 'b@example.com', 'worcester', 1, 0, 'cash') ->> 'status' <> 'invalid'
     or public.star_add_candidate(v_e1, 'Bad', 'Old', '1899-12-31', 'b@example.com', 'worcester', 1, 0, 'cash') ->> 'status' <> 'invalid'
     or public.star_add_candidate(v_e1, 'Bad', 'School', null, 'b@example.com', 'boston', 1, 0, 'cash') ->> 'status' <> 'invalid'
     or public.star_add_candidate(v_e1, 'Bad', 'Pay', null, 'b@example.com', 'worcester', 1, 0, 'gold') ->> 'status' <> 'invalid'
     or public.star_add_candidate(v_e1, 'Bad', 'Neg', null, 'b@example.com', 'worcester', 1, -1, 'cash') ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T6a add_candidate refusals';
  end if;
  -- the desk may still add when registration is closed and on the testing day
  update public.star_events set registration_open = false where id = v_e1;
  if public.star_add_candidate(v_e1, 'Closed', 'Reg', null, 'cr@example.com', 'worcester', 1, 0, 'cash') ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: T6a add_candidate must work when registration is closed';
  end if;
  update public.star_events set registration_open = true where id = v_e1;

  -- T6b. Edit details
  v_c4 := (public.star_add_candidate(v_e1, 'Gus', 'Hill', v_adult, 'gus@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  if public.star_update_candidate(v_c4, 2, 'Gus', 'Hill', v_adult, 'gus@example.com', 'worcester', 1, 0, null) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T6b update with a wrong version expected stale';
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.star_update_candidate(v_c4, 1, 'Gus', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 1, 0, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2, 'cleared_grade_count', 0) then
    raise exception 'TEST FAILED: T6b school change expected {ok, 2, 0}, got %', v_r;
  end if;
  if not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'star_candidates' and l.record_id = v_c4
                   and l.op = 'update' and l.location_code = 'shrewsbury' and l.before ->> 'location_code' = 'worcester'
                   and l.after ->> 'location_code' = 'shrewsbury' and l.action = 'star_update_candidate') then
    raise exception 'TEST FAILED: T6b the school change must be logged under the new school';
  end if;
  v_r := public.star_update_candidate(v_c4, 2, 'Gus', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 1, 0, null);
  if v_r ->> 'version' <> '2' then raise exception 'TEST FAILED: T6b an unchanged save must write nothing, got %', v_r; end if;
  -- a stars change in the same Dan keeps the grades
  perform public.star_set_grade(v_c4, v_k1, 'A');
  perform public.star_set_grade(v_c4, v_k_brk, 'B');
  v_r := public.star_update_candidate(v_c4, 2, 'Gus', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 1, 2, null);
  if v_r ->> 'status' <> 'ok' or (select count(*) from public.star_grades g where g.candidate_id = v_c4) <> 2 then
    raise exception 'TEST FAILED: T6b a stars change in the same Dan must keep the grades (got %)', v_r;
  end if;
  -- a Dan change with grades: grades_exist + the count, a wrong count ->
  -- stale, the right count clears them (and the history keeps them)
  v_r := public.star_update_candidate(v_c4, 3, 'Gus', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 2, 0, null);
  if v_r is distinct from '{"status": "grades_exist", "grade_count": 2}'::jsonb then
    raise exception 'TEST FAILED: T6b Dan change with grades expected {grades_exist, 2}, got %', v_r;
  end if;
  if public.star_update_candidate(v_c4, 3, 'Gus', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 2, 0, 1) ->> 'status' <> 'stale'
     or public.star_update_candidate(v_c4, 3, 'Gus', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 2, 3, 2) ->> 'status' <> 'invalid'
     or public.star_update_candidate(v_c4, 3, 'Gus', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 2, 0, -1) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T6b Dan change wrong count / stars at the limit / negative count';
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.star_update_candidate(v_c4, 3, 'Gus', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 2, 0, 2);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 4, 'cleared_grade_count', 2) then
    raise exception 'TEST FAILED: T6b Dan change clearing 2 grades expected {ok, 4, 2}, got %', v_r;
  end if;
  if exists (select 1 from public.star_grades g where g.candidate_id = v_c4)
     or (select count(*) from public.change_log l where l.id > v_mark and l.table_name = 'star_grades' and l.op = 'delete'
           and l.before ->> 'candidate_id' = v_c4::text and l.before ->> 'grade' in ('A', 'B')) <> 2 then
    raise exception 'TEST FAILED: T6b the cleared grades must be gone and in the history';
  end if;
  -- a Dan change on a PAID candidate: the desk -> not_allowed, an admin ok
  if public.star_record_payment(v_c4, 4, 'cash', 15000, v_today) ->> 'status' <> 'ok' then
    raise exception 'TEST SETUP: T6b payment';
  end if;
  v_r := public.star_update_candidate(v_c4, 5, 'Gus', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 1, 0, null);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: T6b desk Dan change on a paid candidate expected not_allowed, got %', v_r;
  end if;
  if public.star_update_candidate(v_c4, 5, 'Gustav', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 2, 1, null) ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: T6b the desk may edit other details of a paid candidate (OPEN-4)';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_update_candidate(v_c4, 6, 'Gustav', 'Hill', v_adult, 'gus@example.com', 'shrewsbury', 1, 0, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T6b admin Dan change on a paid candidate expected ok, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- form rows keep their DOB and email
  select c.version into v_v from public.star_candidates c where c.id = v_f1;
  if public.star_update_candidate(v_f1, v_v, 'Bo', 'Kim', null, 'bo@example.com', 'shrewsbury', 1, 1, null) ->> 'status' <> 'invalid'
     or public.star_update_candidate(v_f1, v_v, 'Bo', 'Kim', v_child, null, 'shrewsbury', 1, 1, null) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T6b a form row can''t lose its DOB or email';
  end if;
  -- a DOB / email edit works the duplicate marks out again
  v_x1 := (public.star_add_candidate(v_e1, 'Ida', 'Jay', v_adult, 'ida@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  v_x2 := (public.star_add_candidate(v_e1, 'Ida', 'Jay', v_child, 'ida2@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  if exists (select 1 from public.star_candidates c where c.id in (v_x1, v_x2) and c.duplicate_state <> 'none') then
    raise exception 'TEST FAILED: T6b same names with different DOBs must not be flagged';
  end if;
  v_r := public.star_update_candidate(v_x2, 1, 'Ida', 'Jay', v_adult, 'ida2@example.com', 'worcester', 1, 0, null);
  if v_r ->> 'status' <> 'ok'
     or (select count(*) from public.star_candidates c where c.id in (v_x1, v_x2) and c.duplicate_state = 'possible') <> 2 then
    raise exception 'TEST FAILED: T6b a DOB edit making a pair must flag both rows (got %)', v_r;
  end if;

  -- T6c. Possible duplicates: keep both; keep one (the other withdrawn as
  --      duplicate_copy, restorable); the desk's own keep-one Undo within
  --      10 seconds only; an admin any time
  select c.version into v_v from public.star_candidates c where c.id = v_x1;
  select c.version into v_v2 from public.star_candidates c where c.id = v_x2;
  if public.star_resolve_duplicate(v_x1, v_v, v_x1, v_v, true) ->> 'status' <> 'invalid'
     or public.star_resolve_duplicate(v_x1, v_v, v_c1, v_c1v, true) ->> 'status' <> 'stale'
     or public.star_resolve_duplicate(v_x1, v_v, v_fold, 1, true) ->> 'status' <> 'invalid'
     or public.star_resolve_duplicate(v_x1, v_v, v_ea, 1, true) ->> 'status' <> 'not_found'
     or public.star_resolve_duplicate(v_x1, v_v, v_x2, v_v2 - 1, true) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T6c resolve_duplicate refusals (same id / not a pair / not found / stale)';
  end if;
  v_r := public.star_resolve_duplicate(v_x1, v_v, v_x2, v_v2, true);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'keep_version', v_v + 1, 'other_version', v_v2 + 1) then
    raise exception 'TEST FAILED: T6c keep both expected {ok, %, %}, got %', v_v + 1, v_v2 + 1, v_r;
  end if;
  if not exists (select 1 from public.star_candidates c where c.id = v_x1 and c.duplicate_state = 'kept_both' and c.duplicate_of = v_x2)
     or not exists (select 1 from public.star_candidates c where c.id = v_x2 and c.duplicate_state = 'kept_both' and c.duplicate_of = v_x1) then
    raise exception 'TEST FAILED: T6c keep both must mark both kept_both, pointing at each other';
  end if;
  -- keep one (the desk), then the desk's Undo within 10 seconds
  v_y1 := (public.star_add_candidate(v_e1, 'Kai', 'Lin', null, 'kai@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  v_y2 := (public.star_add_candidate(v_e1, 'Kai', 'Lin', null, 'kai2@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  select c.version into v_v from public.star_candidates c where c.id = v_y1;
  select c.version into v_v2 from public.star_candidates c where c.id = v_y2;
  v_r := public.star_resolve_duplicate(v_y1, v_v, v_y2, v_v2, false);
  if v_r ->> 'status' <> 'ok'
     or not exists (select 1 from public.star_candidates c where c.id = v_y2 and c.status = 'withdrawn'
                      and c.withdrawn_reason = 'duplicate_copy' and c.withdrawn_by = v_desk and c.withdrawn_by_name = 'Staff')
     or not exists (select 1 from public.star_candidates c where c.id = v_y1 and c.duplicate_state = 'none') then
    raise exception 'TEST FAILED: T6c keep one: the other withdrawn as duplicate_copy by the desk, the kept one back to none (got %)', v_r;
  end if;
  if public.star_resolve_duplicate(v_y1, (v_r ->> 'keep_version')::int, v_y2, (v_r ->> 'other_version')::int, false) ->> 'status' <> 'withdrawn' then
    raise exception 'TEST FAILED: T6c resolving with a withdrawn candidate expected withdrawn';
  end if;
  v_r := public.star_restore_candidate(v_y2, (v_r ->> 'other_version')::int);
  if v_r ->> 'status' <> 'ok'
     or (select count(*) from public.star_candidates c where c.id in (v_y1, v_y2) and c.status = 'active' and c.duplicate_state = 'possible') <> 2 then
    raise exception 'TEST FAILED: T6c the desk''s own Undo within 10 s must restore the pair (got %)', v_r;
  end if;
  -- again; this time the withdrawal is 11 seconds old -> the desk can't, an admin can
  select c.version into v_v from public.star_candidates c where c.id = v_y1;
  select c.version into v_v2 from public.star_candidates c where c.id = v_y2;
  v_r := public.star_resolve_duplicate(v_y1, v_v, v_y2, v_v2, false);
  update public.star_candidates set withdrawn_at = now() - interval '11 seconds' where id = v_y2;
  select c.version into v_v2 from public.star_candidates c where c.id = v_y2;
  if public.star_restore_candidate(v_y2, v_v2) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: T6c the desk''s restore after 10 s expected not_allowed';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.star_restore_candidate(v_y2, v_v2) ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: T6c an admin may restore any time';
  end if;
  -- someone else's keep-one: the desk can't undo the admin's
  select c.version into v_v from public.star_candidates c where c.id = v_y1;
  select c.version into v_v2 from public.star_candidates c where c.id = v_y2;
  v_r := public.star_resolve_duplicate(v_y1, v_v, v_y2, v_v2, false);
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.star_restore_candidate(v_y2, (v_r ->> 'other_version')::int) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: T6c the desk must not undo the admin''s keep-one';
  end if;

  -- T6d. withdraw / restore / delete permanently
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_x1 := (public.star_add_candidate(v_e1, 'Wil', 'Draw', null, 'wd@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  v_r := public.star_withdraw_candidate(v_x1, 1);
  if v_r is distinct from '{"status": "ok", "version": 2}'::jsonb then raise exception 'TEST FAILED: T6d withdraw expected {ok, 2}, got %', v_r; end if;
  if public.star_withdraw_candidate(v_x1, 2) ->> 'status' <> 'withdrawn'
     or public.star_restore_candidate(v_x1, 1) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T6d withdraw twice / restore with an old version';
  end if;
  if not exists (select 1 from public.star_candidates c where c.id = v_x1 and c.withdrawn_reason = 'withdrawn' and c.withdrawn_by = v_admin) then
    raise exception 'TEST FAILED: T6d withdraw stored wrong';
  end if;
  v_r := public.star_restore_candidate(v_x1, 2);
  if v_r is distinct from '{"status": "ok", "version": 3}'::jsonb
     or public.star_restore_candidate(v_x1, 3) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T6d restore expected {ok, 3} and then stale (not withdrawn), got %', v_r;
  end if;
  v_r := public.star_record_payment(v_x1, 3, 'cash', 5000, v_today);
  v_p2 := (v_r ->> 'payment_id')::uuid;
  if public.star_delete_candidate(v_x1, 4, '{}') ->> 'status' <> 'stale'
     or public.star_delete_candidate(v_x1, 3, array[v_p2]) ->> 'status' <> 'stale'
     or public.star_delete_candidate(v_x1, 4, array[v_p2, v_p2]) ->> 'status' <> 'invalid'
     or public.star_delete_candidate(v_x1, 4, array[null]::uuid[]) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T6d delete_candidate payment list / version / input rules';
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.star_delete_candidate(v_x1, 4, array[v_p2]);
  if v_r is distinct from '{"status": "ok"}'::jsonb
     or exists (select 1 from public.star_candidates c where c.id = v_x1)
     or exists (select 1 from public.star_payments p where p.candidate_id = v_x1)
     or exists (select 1 from public.change_log l where l.id > v_mark and l.action <> 'star_delete_candidate') then
    raise exception 'TEST FAILED: T6d delete_candidate expected ok, everything gone, logged star_delete_candidate (got %)', v_r;
  end if;

  -- T6e. Private testing: set, change, clear; the fee follows
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_x2 := (public.star_add_candidate(v_e1, 'Pia', 'Vate', v_adult, 'pv@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  if public.star_set_private(v_x2, 1, v_today + 2, null) ->> 'status' <> 'invalid'
     or public.star_set_private(v_x2, 1, null, '10:00') ->> 'status' <> 'invalid'
     or public.star_set_private(v_x2, 1, v_today + 2, '07:45') ->> 'status' <> 'invalid'
     or public.star_set_private(v_x2, 1, v_today + 2, '10:10') ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T6e set_private input rules';
  end if;
  v_r := public.star_set_private(v_x2, 1, v_today + 2, '10:00');   -- before the testing day
  if v_r is distinct from '{"status": "ok", "version": 2, "expected_fee_cents": 16000}'::jsonb
     or (select v.fee_kind from public.star_roster v where v.id = v_x2) <> 'private'
     or (select v.expected_fee_cents from public.star_roster v where v.id = v_x2) <> 16000 then
    raise exception 'TEST FAILED: T6e set_private expected {ok, 2, 16000} and the private fee, got %', v_r;
  end if;
  v_r := public.star_set_private(v_x2, 2, v_today + 15, '19:45');  -- after the testing day
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> 3 then raise exception 'TEST FAILED: T6e change private day expected ok, got %', v_r; end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.star_set_private(v_x2, 3, null, null);
  if v_r is distinct from '{"status": "ok", "version": 4, "expected_fee_cents": 14000}'::jsonb
     or (select v.fee_kind from public.star_roster v where v.id = v_x2) <> 'standard'
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.action = 'star_clear_private') then
    raise exception 'TEST FAILED: T6e Back to the testing day expected {ok, 4, 14000}, logged star_clear_private, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform public.star_withdraw_candidate(v_x2, 4);
  if public.star_set_private(v_x2, 5, v_today + 2, '10:00') ->> 'status' <> 'withdrawn' then
    raise exception 'TEST FAILED: T6e set_private on a withdrawn candidate expected withdrawn';
  end if;

  -- T6f. Make-up from an earlier testing
  --   Mia (Early): all A+ but a D in Breaking, 20 assistant classes ->
  --   make-up, re-test Breaking
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_m1 := (public.star_add_candidate(v_ea, 'Mia', 'Make', v_adult, 'mia@example.com', 'worcester', 1, 1, 'cash') ->> 'id')::uuid;
  perform pg_temp.st_grade_all(v_m1, 'A+');
  perform public.star_set_grade(v_m1, v_k_other, 'A+');
  perform public.star_set_grade(v_m1, (select k.id from public.star_event_categories k where k.event_id = v_ea and k.dan = 1 and k.name = 'Breaking'), 'D');
  perform public.star_set_count(v_m1, 'assistant_classes', 20);
  perform public.star_set_count(v_m1, 'classes_attended', 33);
  if public.star_candidate_result(v_m1) ->> 'status' <> 'makeup' then raise exception 'TEST SETUP: T6f Mia should be a make-up'; end if;
  -- an earlier event that isn't earlier -> invalid
  if public.star_add_makeup(v_ea, v_c1) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T6f a make-up from a later event expected invalid';
  end if;
  v_r := public.star_add_makeup(v_e1, v_m1);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'kept_count')::int <> 9 or (v_r ->> 'retest_count')::int <> 1
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['id', 'kept_count', 'retest_count', 'status', 'version'] then
    raise exception 'TEST FAILED: T6f add_makeup expected {ok, id, version, kept 9, retest 1}, got %', v_r;
  end if;
  v_m2 := (v_r ->> 'id')::uuid;
  if not exists (select 1 from public.star_candidates c
                  where c.id = v_m2 and c.is_makeup and c.paying_by is null and c.source = 'desk' and c.makeup_of_candidate_id = v_m1
                    and c.makeup_of_event_name = v_tag || ' Early' and c.date_of_birth = v_adult and c.email_for_results = 'mia@example.com'
                    and c.dan = 1 and c.stars_from = 1 and c.classes_attended = 33 and c.assistant_classes = 20)
     or (select count(*) from public.star_grades g where g.candidate_id = v_m2 and g.kept and g.grade = 'A+'
           and g.kept_from_event_id = v_ea and g.kept_from_event_name = v_tag || ' Early') <> 9
     or not exists (select 1 from public.star_makeup_subjects m where m.candidate_id = v_m2 and m.kind = 'retest'
                      and m.event_category_id = v_k_brk) then
    raise exception 'TEST FAILED: T6f the make-up row, its 9 kept grades, the Breaking retest or the copied counts are wrong';
  end if;
  if public.star_candidate_result(v_m2) ->> 'status' <> 'not_finished'
     or (select count(*) from jsonb_array_elements(public.star_candidate_result(v_m2) -> 'subjects') as s(v) where (s.v ->> 'retest')::boolean) <> 1 then
    raise exception 'TEST FAILED: T6f the make-up candidate must be not finished with one subject to re-test';
  end if;
  -- already added here, and in another event; a second active make-up row
  -- can't exist even for postgres; a withdrawn one doesn't block
  if public.star_add_makeup(v_e1, v_m1) ->> 'status' <> 'already_added'
     or public.star_add_makeup(v_ez, v_m1) ->> 'status' <> 'already_added' then
    raise exception 'TEST FAILED: T6f a second make-up of the same earlier candidate expected already_added';
  end if;
  begin
    insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, source, is_makeup,
                                        makeup_of_candidate_id, makeup_of_event_name, created_by_name, updated_by_name)
    values (v_ez, 'Mia', 'Make', 'worcester', 1, 1, 'desk', true, v_m1, 'x', '', '');
    raise exception 'TEST FAILED: T6f a second active make-up row was stored';
  exception when unique_violation then
    get stacked diagnostics v_txt = constraint_name;
    if v_txt <> 'star_candidates_one_active_makeup_idx' then raise exception 'TEST FAILED: T6f unexpected unique rule %', v_txt; end if;
  end;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform public.star_withdraw_candidate(v_m2, (select c.version from public.star_candidates c where c.id = v_m2));
  v_r := public.star_add_makeup(v_ez, v_m1);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T6f a withdrawn make-up row must not block a new one, got %', v_r; end if;
  v_x1 := (v_r ->> 'id')::uuid;
  -- restoring the withdrawn make-up row now -> stale, nothing changed
  execute v_snap_sql into v_snap;
  if public.star_restore_candidate(v_m2, (select c.version from public.star_candidates c where c.id = v_m2)) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T6f restoring a second active make-up expected stale';
  end if;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: T6f the refused restore changed something'; end if;
  -- a later correction on the earlier event doesn't change the kept copy
  perform public.star_set_grade(v_m1, v_k_other, 'B');
  if exists (select 1 from public.star_grades g
              where g.candidate_id = v_x1 and g.kept and g.grade <> 'A+') then
    raise exception 'TEST FAILED: T6f a correction on the earlier event changed the kept grades';
  end if;
  perform public.star_set_grade(v_m1, v_k_other, 'A+');
  -- the earlier result no longer "make-up" -> stale
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_x2 := (public.star_add_candidate(v_ea, 'Pat', 'Pass', v_adult, 'pp@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform pg_temp.st_grade_all(v_x2, 'A+');
  perform public.star_set_count(v_x2, 'assistant_classes', 20);
  if public.star_add_makeup(v_e1, v_x2) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T6f a make-up of a passed candidate expected stale';
  end if;
  -- below the pass mark, no D, nothing chosen -> choice_needed; once an
  -- admin chose, it can be added (the chosen subject re-tested)
  v_y1 := (public.star_add_candidate(v_ea, 'Cal', 'Cee', v_adult, 'cc@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform pg_temp.st_grade_all(v_y1, 'C');
  perform public.star_set_count(v_y1, 'assistant_classes', 10);
  if public.star_add_makeup(v_e1, v_y1) ->> 'status' <> 'choice_needed' then
    raise exception 'TEST FAILED: T6f a below-the-mark result with nothing chosen expected choice_needed';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_set_makeup_subjects(v_y1, '{}', array[v_k_other]);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T6f set_makeup_subjects expected ok, got %', v_r; end if;
  v_r := public.star_add_makeup(v_e1, v_y1);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'retest_count')::int <> 1 or (v_r ->> 'kept_count')::int <> 9 then
    raise exception 'TEST FAILED: T6f add_makeup after the admin''s choice expected ok, 1 retest, 9 kept, got %', v_r;
  end if;
  -- Assistant Instructor to re-test (a D from too few classes): the counts
  -- are NOT copied and Assistant Instructor gets a retest row (OPEN-10)
  v_y2 := (public.star_add_candidate(v_ea, 'Ava', 'Assist', v_adult, 'aa@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform pg_temp.st_grade_all(v_y2, 'A+');
  perform public.star_set_count(v_y2, 'assistant_classes', 3);
  perform public.star_set_count(v_y2, 'classes_attended', 12);
  v_r := public.star_add_makeup(v_e1, v_y2);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'retest_count')::int <> 1 or (v_r ->> 'kept_count')::int <> 10
     or not exists (select 1 from public.star_candidates c where c.id = (v_r ->> 'id')::uuid
                     and c.assistant_classes is null and c.classes_attended is null)
     or not exists (select 1 from public.star_makeup_subjects m where m.candidate_id = (v_r ->> 'id')::uuid and m.event_category_id = v_k_ai) then
    raise exception 'TEST FAILED: T6f Assistant Instructor re-tested: counts empty, a retest row (got %)', v_r;
  end if;
  -- removing the earlier candidate sets the later make-up rows' link to NULL
  v_r := public.star_delete_candidate(v_m1, (select c.version from public.star_candidates c where c.id = v_m1), '{}');
  if v_r ->> 'status' <> 'ok'
     or exists (select 1 from public.star_candidates c where c.id in (v_m2, v_x1) and (c.makeup_of_candidate_id is not null or not c.is_makeup))
     or (select count(*) from public.star_candidates c where c.id in (v_m2, v_x1)) <> 2 then
    raise exception 'TEST FAILED: T6f deleting the earlier candidate must keep the make-up rows with a NULL link (got %)', v_r;
  end if;

  -- ===================================================================
  -- T7. Payments and refunds
  -- ===================================================================

  -- T7a. the expected fee by date: before the testing day standard, on it
  --      and after same day, private -> private, make-up -> 0; the view and
  --      the function agree for every candidate
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' Today', v_today, '10:00', 'worcester', true, null, null);
  v_e9 := (v_r ->> 'id')::uuid;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_x1 := (public.star_add_candidate(v_e9, 'Tod', 'Day', v_adult, 'td@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  v_x2 := (public.star_add_candidate(v_e1, 'Ted', 'Before', v_adult, 'tb@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  if public.star_expected_fee_cents(v_x1) <> 15000 or public.star_fee_kind(v_x1) <> 'same_day'
     or public.star_expected_fee_cents(v_x2) <> 14000 or public.star_fee_kind(v_x2) <> 'standard'
     or public.star_expected_fee_cents(v_m2) <> 0 or public.star_fee_kind(v_m2) <> 'none' then
    raise exception 'TEST FAILED: T7a expected fee on the testing day / before / make-up';
  end if;
  update public.star_events set testing_date = v_today - 1 where id = v_e9;
  if public.star_expected_fee_cents(v_x1) <> 15000 then raise exception 'TEST FAILED: T7a after the testing day the same-day fee'; end if;
  update public.star_events set testing_date = v_today where id = v_e9;
  if exists (select 1 from public.star_roster v
              where v.expected_fee_cents is distinct from public.star_expected_fee_cents(v.id)
                 or v.fee_kind is distinct from public.star_fee_kind(v.id)
                 or v.paid_cents is distinct from public.star_net_paid_cents(v.id)) then
    raise exception 'TEST FAILED: T7a star_roster and star_expected_fee_cents disagree';
  end if;

  -- T7b. Record payment: any amount counts as Paid; already_paid; no_fee;
  --      withdrawn; a double click with the old version -> stale; allowed
  --      on a Finished event
  v_r := public.star_record_payment(v_x2, 1, 'check', 100, v_today);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> 2
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['payment_id', 'status', 'version'] then
    raise exception 'TEST FAILED: T7b record_payment expected {ok, payment_id, version 2}, got %', v_r;
  end if;
  v_p3 := (v_r ->> 'payment_id')::uuid;
  if not exists (select 1 from public.star_roster v where v.id = v_x2 and v.paid and v.paid_cents = 100 and v.paid_method = 'check'
                   and v.last_payment_id = v_p3 and v.last_payment_recorded_by_name = 'Staff' and v.fee_kind = 'standard')
     or not exists (select 1 from public.star_payments p where p.id = v_p3 and p.recorded_by = v_desk) then
    raise exception 'TEST FAILED: T7b $1 must count as Paid on the roster';
  end if;
  if public.star_record_payment(v_x2, 1, 'cash', 14000, v_today) ->> 'status' <> 'stale'
     or public.star_record_payment(v_x2, 2, 'cash', 14000, v_today) ->> 'status' <> 'already_paid'
     or public.star_record_payment(v_m2, (select c.version from public.star_candidates c where c.id = v_m2), 'cash', 100, v_today) ->> 'status' <> 'withdrawn'
     or public.star_record_payment(v_x2, 2, 'gold', 100, v_today) ->> 'status' <> 'invalid'
     or public.star_record_payment(v_x2, 2, 'cash', 0, v_today) ->> 'status' <> 'invalid'
     or public.star_record_payment(v_x2, 2, 'cash', 100001, v_today) ->> 'status' <> 'invalid'
     or public.star_record_payment(v_x2, 2, 'cash', 100, v_today + 1) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T7b record_payment refusals';
  end if;
  select c.id into v_x1 from public.star_candidates c where c.makeup_of_event_name = v_tag || ' Early' and c.status = 'active' and c.event_id = v_e1 limit 1;
  if public.star_record_payment(v_x1, (select c.version from public.star_candidates c where c.id = v_x1), 'cash', 100, v_today) ->> 'status' <> 'no_fee'
     or public.star_change_paying_by(v_x1, (select c.version from public.star_candidates c where c.id = v_x1), 'card') ->> 'status' <> 'no_fee' then
    raise exception 'TEST FAILED: T7b payment / paying-by on a make-up candidate expected no_fee';
  end if;
  if public.star_change_paying_by(v_x2, 2, 'card') ->> 'status' <> 'already_paid' then
    raise exception 'TEST FAILED: T7b change_paying_by once paid expected already_paid';
  end if;
  select c.id into v_x1 from public.star_candidates c where c.event_id = v_e9 limit 1;
  update public.star_events set testing_date = v_today - 1 where id = v_e9;
  v_r := public.star_record_payment(v_x1, 1, 'card', 15000, v_today);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T7b record_payment on a finished event expected ok, got %', v_r; end if;

  -- T7c. the Undo window: the desk's own payment just now -> ok; another
  --      staff member's, or after 10 seconds -> not_allowed; an admin any
  --      time; a reversal can't be undone; twice -> stale
  v_r := public.star_undo_payment(v_p3);
  if v_r is distinct from '{"status": "ok", "version": 3}'::jsonb then raise exception 'TEST FAILED: T7c own undo expected {ok, 3}, got %', v_r; end if;
  if public.star_undo_payment(v_p3) ->> 'status' <> 'stale'
     or public.star_undo_payment((select p.id from public.star_payments p where p.reverses_payment_id = v_p3)) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T7c undo twice / undo of a reversal';
  end if;
  if exists (select 1 from public.star_roster v where v.id = v_x2 and (v.paid or v.paid_cents <> 0 or v.last_payment_id is not null)) then
    raise exception 'TEST FAILED: T7c after the undo the candidate must be Not paid';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_record_payment(v_x2, 3, 'cash', 14000, v_today);
  v_p3 := (v_r ->> 'payment_id')::uuid;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.star_undo_payment(v_p3) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: T7c the desk undoing the admin''s payment expected not_allowed';
  end if;
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
  values (v_c2, 'payment', 14000, 'cash', v_today, now() - interval '11 seconds', v_desk, 'Staff')
  returning id into v_p1;
  if public.star_undo_payment(v_p1) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: T7c the desk''s undo after 10 seconds expected not_allowed';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.star_undo_payment(v_p1) ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T7c an admin may undo any time'; end if;

  -- T7d. Edit payment (admin) = a reversal + a new payment
  v_r := public.star_edit_payment(v_p3, 'check', 13000, v_today - 2);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'payment_id')::uuid = v_p3
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['payment_id', 'status', 'version']
     or not exists (select 1 from public.star_roster v where v.id = v_x2 and v.paid_cents = 13000 and v.paid_method = 'check'
                      and v.paid_on = v_today - 2 and v.last_payment_id = (v_r ->> 'payment_id')::uuid)
     or not exists (select 1 from public.star_payments p where p.reverses_payment_id = v_p3 and p.amount_cents = -14000) then
    raise exception 'TEST FAILED: T7d edit_payment expected a reversal + a new $130 check payment, got %', v_r;
  end if;
  if public.star_edit_payment(v_p3, 'cash', 100, v_today) ->> 'status' <> 'stale'
     or public.star_edit_payment((select p.id from public.star_payments p where p.reverses_payment_id = v_p3), 'cash', 100, v_today) ->> 'status' <> 'invalid'
     or public.star_edit_payment(v_rand, 'cash', 100, v_today) ->> 'status' <> 'not_found' then
    raise exception 'TEST FAILED: T7d edit of a reversed payment / of a reversal / unknown';
  end if;

  -- T7e. Refunds (admin): paid the private fee, then Back to the testing
  --      day -> $20 overpaid; refund $21 -> refund_too_large, $20 ok;
  --      afterwards nothing is overpaid; an undo of the refund brings it back
  v_pr := (public.star_add_candidate(v_e1, 'Ray', 'Fund', v_adult, 'rf@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform public.star_set_private(v_pr, 1, v_today + 2, '10:00');
  perform public.star_record_payment(v_pr, 2, 'cash', 16000, v_today);
  perform public.star_set_private(v_pr, 3, null, null);
  if (select v.overpaid_cents from public.star_roster v where v.id = v_pr) <> 2000 then
    raise exception 'TEST FAILED: T7e after Back to the testing day $20 must be overpaid, got %',
      (select v.overpaid_cents from public.star_roster v where v.id = v_pr);
  end if;
  v_r := public.star_record_refund(v_pr, 4, 'cash', 2100, v_today);
  if v_r is distinct from '{"status": "refund_too_large", "overpaid_cents": 2000}'::jsonb then
    raise exception 'TEST FAILED: T7e a $21 refund expected {refund_too_large, 2000}, got %', v_r;
  end if;
  if public.star_record_refund(v_pr, 4, 'card', 2000, v_today) ->> 'status' <> 'invalid'
     or public.star_record_refund(v_pr, 4, 'cash', 2000, v_today + 1) ->> 'status' <> 'invalid'
     or public.star_record_refund(v_pr, 3, 'cash', 2000, v_today) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T7e refund input / stale rules';
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.star_record_refund(v_pr, 4, 'cash', 2000, v_today) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: T7e the desk can''t record a refund';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_record_refund(v_pr, 4, 'check', 2000, v_today - 1);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> 5 then raise exception 'TEST FAILED: T7e refund $20 expected ok, got %', v_r; end if;
  v_pref := (v_r ->> 'payment_id')::uuid;
  if not exists (select 1 from public.star_payments p where p.id = v_pref and p.kind = 'refund' and p.amount_cents = -2000
                   and p.method = 'check' and p.paid_on = v_today - 1)
     or not exists (select 1 from public.star_roster v where v.id = v_pr and v.overpaid_cents = 0 and v.refunded_cents = 2000
                      and v.paid_cents = 14000 and v.paid) then
    raise exception 'TEST FAILED: T7e the refund row / roster after the refund';
  end if;
  if public.star_record_refund(v_pr, 5, 'cash', 1, v_today) is distinct from '{"status": "refund_too_large", "overpaid_cents": 0}'::jsonb then
    raise exception 'TEST FAILED: T7e a refund when nothing is overpaid expected {refund_too_large, 0}';
  end if;

  -- T7g. the net total never goes below zero
  v_p2 := (select v.last_payment_id from public.star_roster v where v.id = v_pr);
  if public.star_undo_payment(v_p2) ->> 'status' <> 'invalid'
     or public.star_edit_payment(v_p2, 'cash', 100, v_today) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T7g undo / edit of a payment while a refund stands expected invalid';
  end if;
  begin
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name)
    values (v_pr, 'refund', -15000, 'cash', v_today, 'x');
    raise exception 'TEST FAILED: T7g a refund making the total negative was stored';
  exception when check_violation then
    get stacked diagnostics v_txt = constraint_name;
    if v_txt <> 'star_payments_net_check' then raise exception 'TEST FAILED: T7g unexpected rule %', v_txt; end if;
  end;
  begin
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name, reverses_payment_id)
    values (v_pr, 'reversal', -16000, 'cash', v_today, 'x', v_p2);
    raise exception 'TEST FAILED: T7g a reversal making the total negative was stored';
  exception when check_violation then
    get stacked diagnostics v_txt = constraint_name;
    if v_txt <> 'star_payments_net_check' then raise exception 'TEST FAILED: T7g unexpected rule %', v_txt; end if;
  end;
  begin
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name, reverses_payment_id)
    values (v_pr, 'reversal', -100, 'cash', v_today, 'x', v_p2);
    raise exception 'TEST FAILED: T7g a reversal for the wrong amount was stored';
  exception when check_violation then
    get stacked diagnostics v_txt = constraint_name;
    if v_txt <> 'star_payments_reversal_check' then raise exception 'TEST FAILED: T7g unexpected rule %', v_txt; end if;
  end;
  -- undo the refund (admin): overpaid again, and then both work
  v_r := public.star_undo_payment(v_pref);
  if v_r ->> 'status' <> 'ok' or (select v.overpaid_cents from public.star_roster v where v.id = v_pr) <> 2000 then
    raise exception 'TEST FAILED: T7e/T7g the undo of a refund must bring the overpaid amount back (got %)', v_r;
  end if;
  v_r := public.star_edit_payment(v_p2, 'cash', 14000, v_today);
  if v_r ->> 'status' <> 'ok' or public.star_undo_payment((v_r ->> 'payment_id')::uuid) ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: T7g after the refund was undone, edit and undo must work';
  end if;

  -- T7f. append-only: no update, no removal (Color Belt's tags don't
  --      unlock a Star removal and Star's don't unlock a Color Belt one)
  begin
    update public.star_payments set amount_cents = 1 where id = v_p2;
    raise exception 'TEST FAILED: T7f a payment row could be changed';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise exception 'TEST FAILED: T7f unexpected error: %', sqlerrm; end if;
  end;
  foreach v_txt in array array['', 'delete_student', 'delete_event', 'star_delete_category'] loop
    perform set_config('tkd.action', v_txt, true);
    begin
      delete from public.star_payments where id = v_p2;
      raise exception 'TEST FAILED: T7f a payment row could be removed with tag "%"', v_txt;
    exception when raise_exception then
      if sqlerrm not like '%append-only%' then raise exception 'TEST FAILED: T7f unexpected error: %', sqlerrm; end if;
    end;
  end loop;
  foreach v_txt in array array['star_delete_candidate', 'star_delete_event'] loop
    perform set_config('tkd.action', v_txt, true);
    begin
      delete from public.star_payments where candidate_id = v_c2;   -- (undone at once below)
      get diagnostics v_n = row_count;
      raise exception using errcode = 'P0001', message = 'zz rollback ' || v_n;
    exception when raise_exception then
      if sqlerrm not like 'zz rollback %' or sqlerrm = 'zz rollback 0' then
        raise exception 'TEST FAILED: T7f with tag % the removal must be allowed (%)', v_txt, sqlerrm;
      end if;
    end;
  end loop;
  perform set_config('tkd.action', '', true);
  begin
    truncate public.star_payments;
    raise exception 'TEST FAILED: T7f star_payments was truncated';
  exception when raise_exception then
    if sqlerrm not like 'star_payments can''t be truncated%' then raise exception 'TEST FAILED: T7f unexpected error: %', sqlerrm; end if;
  end;
  -- a Color Belt payment can't be removed with Star's tags
  insert into public.testing_events (location_code, name, testing_date, public_code, created_by_name, updated_by_name)
  values ('worcester', v_tag || ' cb', v_today + 9, 'zzzzzzzz', '', '') returning id into v_ex;
  insert into public.testing_event_classes (event_id, class_id, class_name, position, start_time, end_time, final_award_kind)
  values (v_ex, gen_random_uuid(), 'CB Class', 0, '17:00', '18:00', 'none') returning id into v_x1;
  insert into public.testing_event_ranks (event_class_id, rank_id, name, position, belt_pattern, belt_color, belt_color_2,
                                          belt_end_stripes, belt_end_stripe_color, early_cents, day_cents, private_cents, sparring_gear)
  values (v_x1, gen_random_uuid(), 'White', 0, 'solid', 'white', null, 0, 'yellow', 6500, 7500, 8500, false) returning id into v_x2;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
                                            created_by_name, updated_by_name)
  values (v_ex, v_x2, 'Cee', 'Bee', 'cash', true, 'staff', '', '') returning id into v_x1;
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name)
  values (v_x1, 'payment', 6500, 'cash', v_today, 'x');
  foreach v_txt in array array['star_delete_candidate', 'star_delete_event'] loop
    perform set_config('tkd.action', v_txt, true);
    begin
      delete from public.testing_payments where registration_id = v_x1;
      raise exception 'TEST FAILED: T7f Star''s tag % removed a Color Belt payment', v_txt;
    exception when raise_exception then
      if sqlerrm not like '%append-only%' then raise exception 'TEST FAILED: T7f unexpected error: %', sqlerrm; end if;
    end;
  end loop;
  perform set_config('tkd.action', '', true);

  -- ===================================================================
  -- T8. Grading
  -- ===================================================================

  -- T8a. set / change / clear; the same letter again writes nothing; two
  --      sessions: the later save stays and both are in the history
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_x1 := (public.star_add_candidate(v_e1, 'Gia', 'Grade', v_adult, 'gg@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  v_r := public.star_set_grade(v_x1, v_k1, 'B');
  if v_r ->> 'status' <> 'ok' or v_r ->> 'grade' <> 'B' or v_r -> 'result' ->> 'status' <> 'not_finished'
     or (v_r -> 'result' ->> 'total')::numeric <> 45.0 or (v_r -> 'result' ->> 'graded_count')::int <> 1 then
    raise exception 'TEST FAILED: T8a set_grade B on 15 credits expected total 45.0, got %', v_r;
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  select g.version, g.updated_at into v_v, v_ts from public.star_grades g where g.candidate_id = v_x1 and g.event_category_id = v_k1;
  v_r := public.star_set_grade(v_x1, v_k1, 'B');
  if v_r ->> 'status' <> 'ok' or exists (select 1 from public.change_log l where l.id > v_mark)
     or (select g.version from public.star_grades g where g.candidate_id = v_x1 and g.event_category_id = v_k1) <> v_v then
    raise exception 'TEST FAILED: T8a the same letter again must write nothing';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform public.star_set_grade(v_x1, v_k1, 'A');
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform public.star_set_grade(v_x1, v_k1, 'C+');
  if (select g.grade from public.star_grades g where g.candidate_id = v_x1 and g.event_category_id = v_k1) <> 'C+'
     or (select count(*) from public.change_log l where l.id > v_mark and l.table_name = 'star_grades' and l.op = 'update'
           and l.action = 'star_set_grade') <> 2
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.actor_name = 'Main Admin' and l.after ->> 'grade' = 'A')
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.actor_name = 'Staff' and l.before ->> 'grade' = 'A'
                      and l.after ->> 'grade' = 'C+') then
    raise exception 'TEST FAILED: T8a the later save must win and both saves must be in the history';
  end if;
  v_r := public.star_set_grade(v_x1, v_k1, null);
  if v_r ->> 'status' <> 'ok' or v_r -> 'grade' <> 'null'::jsonb
     or exists (select 1 from public.star_grades g where g.candidate_id = v_x1 and g.event_category_id = v_k1) then
    raise exception 'TEST FAILED: T8a clearing a grade must remove its row (got %)', v_r;
  end if;

  -- T8b. refusals, in order
  if public.star_set_grade(v_x1, v_k1, 'E') ->> 'status' <> 'invalid'
     or public.star_set_grade(v_x1, v_k_other, 'A') ->> 'status' <> 'invalid'         -- a subject of another event
     or public.star_set_grade(v_x1, v_k_dan2, 'A') ->> 'status' <> 'stale'            -- another Dan of this event
     or public.star_set_grade(v_x1, v_k_ai, 'A') ->> 'status' <> 'invalid'            -- Assistant Instructor
     or public.star_set_grade(v_rand, v_k1, 'A') ->> 'status' <> 'not_found'
     or public.star_set_grade(v_x1, v_rand, 'A') ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T8b set_grade refusals (bad letter / other event / other Dan / AI / unknown)';
  end if;
  -- a letter missing from the event's own grade copy -> invalid (the copy
  -- row is removed here only to prove the rule; rolled back at the end)
  v_x2 := (public.star_add_candidate(v_ez, 'Lex', 'Letter', v_adult, 'll@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  delete from public.star_event_grades v where v.event_id = v_ez and v.grade = 'C+';
  if public.star_set_grade(v_x2, (select k.id from public.star_event_categories k where k.event_id = v_ez and k.dan = 1 and k.position = 0), 'C+')
     ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T8b a letter not in the event''s grade copy expected invalid';
  end if;
  -- a kept make-up grade -> kept; a withdrawn candidate -> withdrawn
  select c.id into v_x2 from public.star_candidates c where c.event_id = v_ez and c.is_makeup and c.status = 'active' limit 1;
  select g.event_category_id into v_k2 from public.star_grades g where g.candidate_id = v_x2 and g.kept limit 1;
  if public.star_set_grade(v_x2, v_k2, 'B') ->> 'status' <> 'kept'
     or public.star_set_grade(v_x2, v_k2, null) ->> 'status' <> 'kept'
     or public.star_set_grade(v_m2, v_k1, 'B') ->> 'status' <> 'withdrawn' then
    raise exception 'TEST FAILED: T8b a kept cell expected kept, a withdrawn candidate withdrawn';
  end if;
  begin
    update public.star_grades set grade = 'C' where candidate_id = v_x2 and event_category_id = v_k2;
    raise exception 'TEST FAILED: T8b a kept grade could be changed directly';
  exception when check_violation then null;
  end;
  begin
    insert into public.star_grades (candidate_id, event_category_id, grade, created_by_name, updated_by_name)
    values (v_x1, v_k_ai, 'A', '', '');
    raise exception 'TEST FAILED: T8b an Assistant Instructor grade could be stored directly';
  exception when check_violation then null;
  end;

  -- T8c. class counts: NULL (not entered) and 0 kept apart; out of range
  --      refused; a count save bumps no version and is logged
  select c.version, c.updated_at into v_v, v_ts from public.star_candidates c where c.id = v_x1;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.star_set_count(v_x1, 'assistant_classes', 0);
  if v_r ->> 'status' <> 'ok' or v_r -> 'result' -> 'ai' ->> 'grade' <> 'D' or (v_r -> 'result' -> 'ai' ->> 'count')::int <> 0 then
    raise exception 'TEST FAILED: T8c 0 assistant classes is a real value (letter D), got %', v_r;
  end if;
  v_r := public.star_set_count(v_x1, 'assistant_classes', null);
  if v_r -> 'result' -> 'ai' -> 'grade' <> 'null'::jsonb or v_r -> 'result' -> 'ai' -> 'count' <> 'null'::jsonb then
    raise exception 'TEST FAILED: T8c NULL = not entered (no letter), got %', v_r;
  end if;
  perform public.star_set_count(v_x1, 'classes_attended', 0);
  if public.star_set_count(v_x1, 'classes_attended', 1000) ->> 'status' <> 'invalid'
     or public.star_set_count(v_x1, 'classes_attended', -1) ->> 'status' <> 'invalid'
     or public.star_set_count(v_x1, 'version', 1) ->> 'status' <> 'invalid'
     or public.star_set_count(v_m2, 'classes_attended', 1) ->> 'status' <> 'withdrawn' then
    raise exception 'TEST FAILED: T8c set_count refusals';
  end if;
  if (select c.version from public.star_candidates c where c.id = v_x1) <> v_v
     or (select c.updated_at from public.star_candidates c where c.id = v_x1) <> v_ts
     or (select c.classes_attended from public.star_candidates c where c.id = v_x1) is distinct from 0
     or (select count(*) from public.change_log l where l.id > v_mark and l.record_id = v_x1 and l.action = 'star_set_count') <> 3 then
    raise exception 'TEST FAILED: T8c a count save must bump no version and be logged (3 rows)';
  end if;

  -- T8d. make-up subjects (admin): only for a complete result below the
  --      pass mark without a D; the expected set must match
  perform pg_temp.st_grade_all(v_x1, 'C');
  if public.star_set_makeup_subjects(v_x1, '{}', array[v_k1]) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: T8d the desk can''t choose make-up subjects';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.star_set_makeup_subjects(v_x1, '{}', array[v_k1]) ->> 'status' <> 'invalid' then   -- AI not graded yet: not complete
    raise exception 'TEST FAILED: T8d an incomplete result expected invalid';
  end if;
  perform public.star_set_count(v_x1, 'assistant_classes', 10);
  if public.star_set_makeup_subjects(v_x1, array[v_k_brk], array[v_k1]) ->> 'status' <> 'stale'
     or public.star_set_makeup_subjects(v_x1, '{}', '{}') ->> 'status' <> 'invalid'
     or public.star_set_makeup_subjects(v_x1, '{}', array[v_k1, v_k1]) ->> 'status' <> 'invalid'
     or public.star_set_makeup_subjects(v_x1, '{}', array[v_k_dan2]) ->> 'status' <> 'invalid'
     or public.star_set_makeup_subjects(v_x1, '{}', array[v_k_other]) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T8d stale / empty / repeated / other Dan / other event';
  end if;
  v_r := public.star_set_makeup_subjects(v_x1, '{}', array[v_k1, v_k_brk]);
  if v_r ->> 'status' <> 'ok' or v_r -> 'result' -> 'needs_ids' <> to_jsonb(array[v_k1, v_k_brk]) then
    raise exception 'TEST FAILED: T8d choose two subjects expected ok with needs = them in order, got %', v_r;
  end if;
  v_r := public.star_set_makeup_subjects(v_x1, array[v_k_brk, v_k1], array[v_k_brk]);
  if v_r ->> 'status' <> 'ok' or v_r -> 'result' -> 'needs_ids' <> to_jsonb(array[v_k_brk])
     or (select count(*) from public.star_makeup_subjects m where m.candidate_id = v_x1 and m.kind = 'chosen') <> 1 then
    raise exception 'TEST FAILED: T8d replacing the chosen set (expected set given in any order), got %', v_r;
  end if;
  perform public.star_set_grade(v_x1, v_k1, 'D');
  if public.star_set_makeup_subjects(v_x1, array[v_k_brk], array[v_k1]) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: T8d with a D the admin choice is refused';
  end if;

  -- ===================================================================
  -- T9. Results (the event Main has the SEED rubric copy: 70 credits per
  --     Dan, A+ = 4.5, pass mark 245, 12 and under = child)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);

  -- T9a. the handoff's worked examples (Appendix B), through star_event_results
  v_ids := array[]::uuid[];
  -- 1 all A+ (Assistant Instructor A+ from 20 classes) -> 315.0 passed
  v_ids := v_ids || (public.star_add_candidate(v_e1, 'Res', 'Aplus', v_adult, 'r1@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform pg_temp.st_grade_all(v_ids[1], 'A+');  perform public.star_set_count(v_ids[1], 'assistant_classes', 20);
  -- 2 all B+ (16 classes = B+) -> exactly 245.0 passed
  v_ids := v_ids || (public.star_add_candidate(v_e1, 'Res', 'Bplus', v_adult, 'r2@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform pg_temp.st_grade_all(v_ids[2], 'B+');  perform public.star_set_count(v_ids[2], 'assistant_classes', 16);
  -- 3 all A+ but a D in Breaking (5 credits) -> 292.5 make-up, re-test Breaking
  v_ids := v_ids || (public.star_add_candidate(v_e1, 'Res', 'Dee', v_adult, 'r3@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform pg_temp.st_grade_all(v_ids[3], 'A+');  perform public.star_set_count(v_ids[3], 'assistant_classes', 20);
  perform public.star_set_grade(v_ids[3], v_k_brk, 'D');
  -- 4 nothing graded, 20 classes -> not finished (22.5 so far)
  v_ids := v_ids || (public.star_add_candidate(v_e1, 'Res', 'None', v_adult, 'r4@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform public.star_set_count(v_ids[4], 'assistant_classes', 20);
  -- 5-10 the Assistant Instructor letters: (age on the testing day, classes)
  v_ids := v_ids || (public.star_add_candidate(v_e1, 'Ai', 'One', ((v_today + 10) - interval '12 years')::date, 'a1@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform public.star_set_count(v_ids[5], 'assistant_classes', 14);    -- 12, 14 -> A
  v_ids := v_ids || (public.star_add_candidate(v_e1, 'Ai', 'Two', ((v_today + 10) - interval '13 years')::date, 'a2@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform public.star_set_count(v_ids[6], 'assistant_classes', 19);    -- 13, 19 -> A
  v_ids := v_ids || (public.star_add_candidate(v_e1, 'Ai', 'Three', ((v_today + 10) - interval '13 years')::date, 'a3@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform public.star_set_count(v_ids[7], 'assistant_classes', 18);    -- 13, 18 -> A
  v_ids := v_ids || (public.star_add_candidate(v_e1, 'Ai', 'Four', ((v_today + 10) - interval '13 years')::date, 'a4@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform public.star_set_count(v_ids[8], 'assistant_classes', 17);    -- 13, 17 -> B+
  v_ids := v_ids || (public.star_add_candidate(v_e1, 'Ai', 'Five', ((v_today + 10) - interval '12 years')::date, 'a5@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform public.star_set_count(v_ids[9], 'assistant_classes', 9);     -- 12, 9 -> D
  v_ids := v_ids || (public.star_add_candidate(v_e1, 'Ai', 'Six', null, 'a6@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform public.star_set_count(v_ids[10], 'assistant_classes', 14);   -- no DOB, 14 -> B
  v_r := public.star_event_results(v_e1, 1);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'dan')::int <> 1 or (v_r ->> 'pass_mark')::numeric <> 245 or (v_r ->> 'max_score')::numeric <> 315.0
     or (v_r -> 'counts' ->> 'candidates')::int <> jsonb_array_length(v_r -> 'rows')
     or (v_r -> 'counts' ->> 'passed')::int <> (select count(*) from jsonb_array_elements(v_r -> 'rows') as t(x) where t.x ->> 'status' = 'passed') then
    raise exception 'TEST FAILED: T9a event_results header / counts: %', v_r - 'rows';
  end if;
  select string_agg(format('%s:%s:%s:%s:%s', t.x ->> 'last_name', t.x ->> 'status', t.x ->> 'total', t.x -> 'needs', t.x -> 'makeup_reasons'),
                    ' ' order by t.x ->> 'last_name')
    into v_txt
    from jsonb_array_elements(v_r -> 'rows') as t(x)
   where (t.x ->> 'candidate_id')::uuid = any (v_ids[1:4]);
  if v_txt is distinct from 'Aplus:passed:315.0:[]:[] Bplus:passed:245.0:[]:[] Dee:makeup:292.5:["Breaking"]:["d"] None:not_finished:22.5:[]:[]' then
    raise exception 'TEST FAILED: T9a the worked examples came out as %', v_txt;
  end if;
  select string_agg(format('%s=%s/%s', t.x ->> 'last_name', t.x -> 'ai' ->> 'grade', t.x -> 'ai' ->> 'age_group'), ' ' order by (t.x ->> 'candidate_id'))
    into v_txt from jsonb_array_elements(v_r -> 'rows') as t(x) where false;
  for v_i in 5 .. 10 loop
    select t.x -> 'ai' ->> 'grade' into v_txt from jsonb_array_elements(v_r -> 'rows') as t(x) where (t.x ->> 'candidate_id')::uuid = v_ids[v_i];
    if v_txt is distinct from (array['A', 'A', 'A', 'B+', 'D', 'B'])[v_i - 4] then
      raise exception 'TEST FAILED: T9a Assistant Instructor case % expected %, got %', v_i - 4, (array['A', 'A', 'A', 'B+', 'D', 'B'])[v_i - 4], v_txt;
    end if;
  end loop;
  -- the shape of one result (no DOB, email, age or payment in it)
  v_r2 := (select t.x from jsonb_array_elements(v_r -> 'rows') as t(x) where (t.x ->> 'candidate_id')::uuid = v_ids[3]);
  if (select array_agg(k order by k) from jsonb_object_keys(v_r2) as k)
       <> array['ai', 'candidate_id', 'choice_needed', 'complete', 'd_subjects', 'dan', 'event_id', 'first_name', 'graded_count',
                'last_name', 'location_code', 'makeup_reasons', 'max_score', 'missing', 'needs', 'needs_ids', 'pass_mark', 'private',
                'result_key', 'sent', 'stars_from', 'stars_to', 'status', 'subject_count', 'subjects', 'total']
     or v_r2::text like '%' || v_adult::text || '%' or v_r2::text like '%@example.com%'
     or (v_r2 ->> 'subject_count')::int <> 11 or (v_r2 ->> 'graded_count')::int <> 11 or v_r2 -> 'd_subjects' <> '["Breaking"]'::jsonb
     or v_r2 -> 'needs_ids' <> to_jsonb(array[v_k_brk]) or v_r2 -> 'missing' <> '[]'::jsonb then
    raise exception 'TEST FAILED: T9a result shape: %', v_r2;
  end if;
  -- the rows come in belt order (star, school Shrewsbury first, last name, first name)
  if array(select t.x ->> 'candidate_id' from jsonb_array_elements(v_r -> 'rows') with ordinality as t(x, o) order by t.o)
     <> array(select t.x ->> 'candidate_id' from jsonb_array_elements(v_r -> 'rows') as t(x)
               order by (t.x ->> 'stars_from')::int, case t.x ->> 'location_code' when 'shrewsbury' then 0 else 1 end,
                        lower(t.x ->> 'last_name'), lower(t.x ->> 'first_name'), t.x ->> 'candidate_id') then
    raise exception 'TEST FAILED: T9a event_results rows not in belt order';
  end if;
  if public.star_event_results(v_e1, 9) ->> 'status' <> 'invalid' or public.star_event_results(v_rand, 1) ->> 'status' <> 'not_found' then
    raise exception 'TEST FAILED: T9a event_results of a Dan not in the copy / an unknown event';
  end if;

  -- T9b. worked out every time: a late grade changes the result on the next
  --      read; the template's changed A+ value (4.6, T4a) does NOT change
  --      this event; a testing-date change moves the age group
  perform public.star_set_grade(v_ids[4], v_k1, 'A+');
  if (public.star_candidate_result(v_ids[4]) ->> 'total')::numeric <> 90.0 then
    raise exception 'TEST FAILED: T9b a late grade must change the next result (expected 90.0)';
  end if;
  if (select v.value from public.star_grade_values v where v.grade = 'A+') = 4.5
     or (public.star_candidate_result(v_ids[1]) ->> 'total')::numeric <> 315.0 then
    raise exception 'TEST FAILED: T9b the template''s grade value must not change an existing event''s result';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' Ages', v_today + 30, '10:00', 'worcester', true, null, null);
  v_ex := (v_r ->> 'id')::uuid;
  v_x1 := (public.star_add_candidate(v_ex, 'Age', 'Turns', ((v_today + 30) - interval '13 years' + interval '5 days')::date,
                                     'at@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  if public.star_age_groups(v_ex) -> 'rows' <> jsonb_build_array(jsonb_build_object('candidate_id', v_x1, 'age_group', 'child')) then
    raise exception 'TEST FAILED: T9b 12 on the testing day must be child: %', public.star_age_groups(v_ex);
  end if;
  v_r := public.star_update_event(v_ex, 1, v_tag || ' Ages', v_today + 40, '10:00', 'worcester', null, null);
  if public.star_age_groups(v_ex) -> 'rows' -> 0 ->> 'age_group' <> 'adult'
     or public.star_candidate_result(v_x1) -> 'ai' ->> 'age_group' <> 'adult' then
    raise exception 'TEST FAILED: T9b moving the testing date past the 13th birthday must make it adult';
  end if;
  if public.star_age_groups(v_ex)::text like '%' || ((v_today + 30) - interval '13 years' + interval '5 days')::date::text || '%' then
    raise exception 'TEST FAILED: T9b star_age_groups must never show a DOB';
  end if;

  -- T9c. private: before grading -> testing_privately; complete -> its result
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_x2 := (public.star_add_candidate(v_e1, 'Pri', 'Vate', v_adult, 'pri@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform public.star_set_private(v_x2, 1, v_today + 1, '09:00');
  if public.star_candidate_result(v_x2) ->> 'status' <> 'testing_privately'
     or public.star_candidate_result(v_x2) -> 'private' <> jsonb_build_object('on', v_today + 1, 'time', '09:00') then
    raise exception 'TEST FAILED: T9c an ungraded private candidate must be testing_privately';
  end if;
  perform public.star_set_grade(v_x2, v_k1, 'A');
  if public.star_candidate_result(v_x2) ->> 'status' <> 'testing_privately' then
    raise exception 'TEST FAILED: T9c a partly graded private candidate stays testing_privately (OPEN-13)';
  end if;
  perform pg_temp.st_grade_all(v_x2, 'A');
  perform public.star_set_count(v_x2, 'assistant_classes', 18);
  if public.star_candidate_result(v_x2) ->> 'status' <> 'passed' then
    raise exception 'TEST FAILED: T9c a completely graded private candidate gets the normal result';
  end if;

  -- T9d. below the pass mark: no D -> make-up, choice_needed until an admin
  --      chose; D AND below -> the D subjects only, both reasons
  v_y1 := (public.star_add_candidate(v_e1, 'Low', 'Cee', v_adult, 'lc@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform pg_temp.st_grade_all(v_y1, 'C');
  perform public.star_set_count(v_y1, 'assistant_classes', 10);
  v_r := public.star_candidate_result(v_y1);
  if v_r ->> 'status' <> 'makeup' or (v_r ->> 'total')::numeric <> 140.0 or not (v_r ->> 'choice_needed')::boolean
     or v_r -> 'needs' <> '[]'::jsonb or v_r -> 'makeup_reasons' <> '["below"]'::jsonb then
    raise exception 'TEST FAILED: T9d below the mark without D expected make-up, 140.0, choice_needed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_set_makeup_subjects(v_y1, '{}', array[v_k_brk, v_k1]);
  if v_r -> 'result' -> 'needs' <> '["White–Deputy Curriculum", "Breaking"]'::jsonb or (v_r -> 'result' ->> 'choice_needed')::boolean then
    raise exception 'TEST FAILED: T9d after the choice needs = the chosen subjects in order, got %', v_r -> 'result';
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_y2 := (public.star_add_candidate(v_e1, 'Low', 'Dee', v_adult, 'ld@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform pg_temp.st_grade_all(v_y2, 'C');
  perform public.star_set_count(v_y2, 'assistant_classes', 10);
  perform public.star_set_grade(v_y2, v_k_brk, 'D');
  v_r := public.star_candidate_result(v_y2);
  if v_r ->> 'status' <> 'makeup' or v_r -> 'needs' <> '["Breaking"]'::jsonb or v_r -> 'makeup_reasons' <> '["d", "below"]'::jsonb
     or (v_r ->> 'choice_needed')::boolean then
    raise exception 'TEST FAILED: T9d D and below expected needs [Breaking] with both reasons, got %', v_r;
  end if;

  -- T9e. Mark as sent
  v_key := public.star_candidate_result(v_ids[1]) ->> 'result_key';
  if public.star_mark_result_sent(v_ids[4], public.star_candidate_result(v_ids[4]) ->> 'result_key') ->> 'status' <> 'not_finished'
     or public.star_mark_result_sent(v_x2, 'x') ->> 'status' <> 'stale'
     or public.star_mark_result_sent(v_ids[1], 'not the key') ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: T9e mark_result_sent refusals (not finished / stale key)';
  end if;
  v_n := (select (public.star_set_private(v_ids[4], (select c.version from public.star_candidates c where c.id = v_ids[4]), v_today + 1, '09:00') ->> 'version'))::int;
  if public.star_mark_result_sent(v_ids[4], public.star_candidate_result(v_ids[4]) ->> 'result_key') ->> 'status' <> 'not_finished' then
    raise exception 'TEST FAILED: T9e a candidate testing privately expected not_finished';
  end if;
  v_r := public.star_mark_result_sent(v_ids[1], v_key);
  if v_r ->> 'status' <> 'ok' or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['marked_at', 'sent_id', 'status'] then
    raise exception 'TEST FAILED: T9e mark_result_sent expected {ok, sent_id, marked_at}, got %', v_r;
  end if;
  v_sent := (v_r ->> 'sent_id')::uuid;
  if not exists (select 1 from public.star_result_emails r where r.id = v_sent and r.result_status = 'passed' and r.result_total = 315.0
                   and r.result_needs = '[]'::jsonb and r.result_key = v_key and r.marked_by = v_desk and r.marked_by_name = 'Staff'
                   and r.sent_via = 'manual' and r.undone_at is null) then
    raise exception 'TEST FAILED: T9e the sent row must hold the result snapshot';
  end if;
  if public.star_sent_state(v_ids[1], public.star_candidate_result(v_ids[1])) -> 'matches' <> 'true'::jsonb then
    raise exception 'TEST FAILED: T9e right after sending, matches must be true';
  end if;
  -- a later grade changes the result -> "Not sent yet" again, the earlier send noted
  perform public.star_set_grade(v_ids[1], v_k1, 'A');
  v_r := (select t.x -> 'sent' from jsonb_array_elements(public.star_event_results(v_e1, 1) -> 'rows') as t(x)
           where (t.x ->> 'candidate_id')::uuid = v_ids[1]);
  if v_r -> 'matches' <> 'false'::jsonb or (v_r -> 'sent' ->> 'id')::uuid is distinct from v_sent
     or v_r -> 'sent' ->> 'result_status' <> 'passed' then
    raise exception 'TEST FAILED: T9e a changed result must show matches false with the earlier send, got %', v_r;
  end if;
  -- the Undo window (as payments): own within 10 s ok, twice stale
  v_r := public.star_undo_result_sent(v_sent);
  if v_r is distinct from '{"status": "ok"}'::jsonb or public.star_undo_result_sent(v_sent) ->> 'status' <> 'stale'
     or not exists (select 1 from public.star_result_emails r where r.id = v_sent and r.undone_at is not null and r.undone_by_name = 'Staff') then
    raise exception 'TEST FAILED: T9e own undo within 10 s expected ok, then stale (got %)', v_r;
  end if;
  insert into public.star_result_emails (candidate_id, marked_at, marked_by, marked_by_name, result_status, result_total, result_needs, result_key)
  values (v_ids[2], now() - interval '11 seconds', v_desk, 'Staff', 'passed', 245.0, '[]', 'x') returning id into v_sent;
  if public.star_undo_result_sent(v_sent) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: T9e the desk''s undo after 10 s expected not_allowed';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.star_undo_result_sent(v_sent) ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T9e an admin may undo any time'; end if;
  v_r := public.star_mark_result_sent(v_ids[2], public.star_candidate_result(v_ids[2]) ->> 'result_key');
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.star_undo_result_sent((v_r ->> 'sent_id')::uuid) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: T9e the desk must not undo the admin''s Mark as sent';
  end if;
  begin
    update public.star_result_emails set result_total = 1 where id = v_sent;
    raise exception 'TEST FAILED: T9e a sent row could be changed';
  exception when check_violation then null;
  end;
  begin
    delete from public.star_result_emails where id = v_sent;
    raise exception 'TEST FAILED: T9e a sent row could be removed';
  exception when raise_exception then null;
  end;

  -- ===================================================================
  -- T10. The results CSV and its download log
  -- ===================================================================
  select count(*) into v_n from public.star_downloads;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.star_results_csv(v_e1, null) is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: T10a the desk must get not_allowed from the CSV';
  end if;
  perform set_config('request.jwt.claims', v_c_a2, true);
  if public.star_results_csv(v_e1, null) is distinct from '{"status": "no_access"}'::jsonb then
    raise exception 'TEST FAILED: T10a a locked session must get no_access from the CSV';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.star_results_csv(v_e1, 9) ->> 'status' <> 'invalid' or public.star_results_csv(v_e1, 0) ->> 'status' <> 'invalid'
     or public.star_results_csv(v_rand, null) ->> 'status' <> 'not_found' then
    raise exception 'TEST FAILED: T10a CSV of a Dan not in the copy / Dan 0 / an unknown event';
  end if;
  reset role;
  if (select count(*) from public.star_downloads) <> v_n then raise exception 'TEST FAILED: T10a a refused CSV wrote a download row'; end if;
  set local role authenticated;
  v_r := public.star_results_csv(v_e1, null);
  reset role;
  select count(*) into v_n2 from public.star_candidates c where c.event_id = v_e1 and c.status = 'active';
  if v_r ->> 'status' <> 'ok' or jsonb_array_length(v_r -> 'rows') <> v_n2 or (select count(*) from public.star_downloads) <> v_n + 1
     or not exists (select 1 from public.star_downloads d where d.event_id = v_e1 and d.event_name = v_tag || ' Main' and d.dan is null
                      and d.row_count = v_n2 and d.downloaded_by = v_admin and d.downloaded_by_name = 'Main Admin'
                      and d.downloaded_at > now() - interval '1 minute') then
    raise exception 'TEST FAILED: T10a the whole-event CSV must return every active candidate and log one download';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'rows' -> 0) as k)
       <> array['assistant_classes', 'classes_attended', 'dan', 'date_of_birth', 'email_for_results', 'first_name', 'is_makeup',
                'last_name', 'location_code', 'needs', 'paid', 'paid_cents', 'paying_by', 'result_status', 'sent', 'stars_from',
                'stars_to', 'total'] then
    raise exception 'TEST FAILED: T10a CSV row keys are %', (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'rows' -> 0) as k);
  end if;
  if not exists (select 1 from jsonb_array_elements(v_r -> 'rows') as t(x)
                  where t.x ->> 'last_name' = 'Lee' and t.x ->> 'date_of_birth' = v_adult::text and t.x ->> 'email_for_results' = 'ann@example.com'
                    and (t.x ->> 'paid')::boolean and (t.x ->> 'paid_cents')::int = 14000)
     or exists (select 1 from jsonb_array_elements(v_r -> 'rows') as t(x) where t.x ->> 'last_name' = 'Gone')
     or not exists (select 1 from jsonb_array_elements(v_r -> 'rows') as t(x)
                     where t.x ->> 'last_name' = 'Bplus' and t.x -> 'sent' ->> 'marked_by_name' = 'Main Admin' and (t.x -> 'sent' ->> 'matches')::boolean) then
    raise exception 'TEST FAILED: T10a CSV rows must include DOB, email and payment, the sent state, and no withdrawn candidate';
  end if;
  if array(select t.o from jsonb_array_elements(v_r -> 'rows') with ordinality as t(x, o)
            order by (t.x ->> 'dan')::int, (t.x ->> 'stars_from')::int, case t.x ->> 'location_code' when 'shrewsbury' then 0 else 1 end,
                     lower(t.x ->> 'last_name'), lower(t.x ->> 'first_name'), t.o)
     <> array(select generate_series(1, jsonb_array_length(v_r -> 'rows')))::bigint[] then
    raise exception 'TEST FAILED: T10a CSV rows not in belt order';
  end if;
  set local role authenticated;
  v_r := public.star_results_csv(v_e1, 2);
  reset role;
  if v_r ->> 'status' <> 'ok' or exists (select 1 from jsonb_array_elements(v_r -> 'rows') as t(x) where (t.x ->> 'dan')::int <> 2)
     or jsonb_array_length(v_r -> 'rows') <> (select count(*) from public.star_candidates c where c.event_id = v_e1 and c.status = 'active' and c.dan = 2)
     or not exists (select 1 from public.star_downloads d where d.event_id = v_e1 and d.dan = 2) then
    raise exception 'TEST FAILED: T10a the one-Dan CSV';
  end if;
  -- T10b. the download log can't be changed or removed, even by postgres,
  --       and a download writes no history
  if exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: T10b a download wrote a change_log row';
  end if;
  begin update public.star_downloads set row_count = 0; raise exception 'TEST FAILED: T10b a download row could be changed';
  exception when raise_exception then if sqlerrm not like '%append-only%' then raise exception 'TEST FAILED: T10b %', sqlerrm; end if; end;
  begin delete from public.star_downloads where event_id = v_e1; raise exception 'TEST FAILED: T10b a download row could be removed';
  exception when raise_exception then if sqlerrm not like '%append-only%' then raise exception 'TEST FAILED: T10b %', sqlerrm; end if; end;
  begin truncate public.star_downloads; raise exception 'TEST FAILED: T10b star_downloads was truncated';
  exception when raise_exception then if sqlerrm not like '%can''t be truncated%' then raise exception 'TEST FAILED: T10b %', sqlerrm; end if; end;

  -- ===================================================================
  -- T11. Privacy
  -- ===================================================================

  -- T11a. DOB and email: no column right for any role; nothing of the
  --       signatures table or the download log; the roster's exact columns
  foreach v_role in array array['authenticated', 'anon', 'service_role', 'public', 'star_registrar', 'testing_registrar'] loop
    if has_column_privilege(v_role, 'public.star_candidates', 'date_of_birth', 'SELECT')
       or has_column_privilege(v_role, 'public.star_candidates', 'email_for_results', 'SELECT')
       or has_any_column_privilege(v_role, 'public.star_candidate_signatures', 'SELECT, INSERT, UPDATE, REFERENCES')
       or has_any_column_privilege(v_role, 'public.star_downloads', 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception 'TEST FAILED: T11a % can read the DOB / email / a signatures or downloads column', v_role;
    end if;
  end loop;
  select array_agg(a.attname::text order by a.attname) into v_list
    from pg_attribute a where a.attrelid = 'public.star_roster'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_list <> array['assistant_classes', 'classes_attended', 'created_at', 'created_by_name', 'dan', 'dan_label', 'duplicate_of',
                     'duplicate_state', 'event_id', 'expected_fee_cents', 'fee_kind', 'first_name', 'id', 'is_makeup',
                     'last_name', 'last_payment_id', 'last_payment_recorded_at', 'last_payment_recorded_by_name', 'location_code',
                     'makeup_of_candidate_id', 'makeup_of_event_name', 'overpaid_cents', 'paid', 'paid_cents', 'paid_method',
                     'paid_on', 'paying_by', 'private_cents', 'private_on', 'private_time', 'reference', 'refunded_cents',
                     'registered_at', 'same_day_cents', 'source', 'standard_cents', 'star_limit', 'stars_from', 'status',
                     'testing_date', 'updated_at', 'updated_by_name', 'version', 'withdrawn_at', 'withdrawn_by_name',
                     'withdrawn_reason'] then
    raise exception 'TEST FAILED: T11a star_roster columns are %', v_list;
  end if;

  -- T11c. the 90-day signature clean-up (made here: three family-form
  --       candidates, their events moved back 91 / 90 / 91 days; the last
  --       one tests privately today - the EVENT's date counts, S9)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_x1 := (public.star_add_event(v_tag || ' P91', v_today + 5, '10:00', 'worcester', true, null, null) ->> 'id')::uuid;
  v_x2 := (public.star_add_event(v_tag || ' P90', v_today + 5, '10:00', 'worcester', true, null, null) ->> 'id')::uuid;
  v_y1 := (public.star_add_event(v_tag || ' PPriv', v_today + 5, '10:00', 'worcester', true, null, null) ->> 'id')::uuid;
  perform set_config('request.jwt.claims', '', true);
  v_r := public.star_public_register((select e.public_code_worcester from public.star_events e where e.id = v_x1), v_tag || ' k11',
           gen_random_uuid(), 'Sig', 'NinetyOne', v_adult, 's1@example.com', 1, 0, 'cash', true, v_sig, v_ack);
  select c.id into v_g1 from public.star_candidates c where c.reference = v_r ->> 'reference';
  v_r := public.star_public_register((select e.public_code_worcester from public.star_events e where e.id = v_x2), v_tag || ' k11',
           gen_random_uuid(), 'Sig', 'Ninety', v_adult, 's2@example.com', 1, 0, 'cash', true, v_sig, v_ack);
  select c.id into v_g2 from public.star_candidates c where c.reference = v_r ->> 'reference';
  v_r := public.star_public_register((select e.public_code_worcester from public.star_events e where e.id = v_y1), v_tag || ' k11',
           gen_random_uuid(), 'Sig', 'Private', v_adult, 's3@example.com', 1, 0, 'cash', true, v_sig, v_ack);
  select c.id into v_y2 from public.star_candidates c where c.reference = v_r ->> 'reference';
  update public.star_candidates set private_on = v_today, private_time = '10:00' where id = v_y2;
  update public.star_events set testing_date = v_today - 91, auto_close_on = null where id in (v_x1, v_y1);
  update public.star_events set testing_date = v_today - 90, auto_close_on = null where id = v_x2;
  select s.version, s.updated_at into v_v, v_ts from public.star_candidate_signatures s where s.candidate_id = v_g1;
  -- the family form never runs the clean-up
  v_r := public.star_public_register(v_e1_w, v_tag || ' k11', gen_random_uuid(), 'Sig', 'Trigger', v_adult, 's4@example.com', 1, 0,
                                     'cash', true, v_sig, v_ack);
  if v_r ->> 'status' <> 'ok' or exists (select 1 from public.star_candidate_signatures s where s.candidate_id in (v_g1, v_y2) and s.signature is null) then
    raise exception 'TEST FAILED: T11c star_public_register must not run the signature clean-up';
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_home_today();
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T11c home_today expected ok, got %', v_r; end if;
  if not exists (select 1 from public.star_candidate_signatures s
                  where s.candidate_id = v_g1 and s.signature is null and s.signature_deleted_at is not null
                    and s.version = v_v and s.updated_at = v_ts and s.signed_at is not null)
     or not exists (select 1 from public.star_candidate_signatures s where s.candidate_id = v_y2 and s.signature is null)
     or not exists (select 1 from public.star_candidate_signatures s where s.candidate_id = v_g2 and s.signature = v_sig) then
    raise exception 'TEST FAILED: T11c 91 days: removed without a version bump (also for a private tester); 90 days: kept';
  end if;
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.table_name = 'star_candidate_signatures' and l.op = 'update'
                    and l.action = 'star_purge_old_signatures' and l.before ->> 'signature' = 'on file'
                    and l.after -> 'signature' = 'null'::jsonb
                    and (select array_agg(k order by k) from jsonb_object_keys(l.after) as k) = array['signature', 'signature_deleted_at']) then
    raise exception 'TEST FAILED: T11c the clean-up''s history must show only "signature": "on file" -> null (and when)';
  end if;
  -- Home's own answer: today's events and private testings, no DOB, email or payment
  if v_r::text like '%@example.com%' or v_r::text like '%' || v_adult::text || '%' or v_r::text like '%cents%'
     or not exists (select 1 from jsonb_array_elements(v_r -> 'private') as t(x) where (t.x ->> 'candidate_id')::uuid = v_y2
                      and t.x ->> 'private_time' = '10:00' and t.x ->> 'event_name' = v_tag || ' PPriv') then
    raise exception 'TEST FAILED: T11c home_today answer: %', v_r;
  end if;
  -- the view signature function: the picture, or nothing for a desk row
  set local role authenticated;
  v_r := public.star_view_signature(v_g2);
  if v_r ->> 'status' <> 'ok' or v_r ->> 'signature' <> v_sig or v_r -> 'signed_at' = 'null'::jsonb then
    raise exception 'TEST FAILED: T11c view_signature of a form row: %', v_r;
  end if;
  if public.star_view_signature(v_c1) is distinct from '{"status": "ok", "signature": null, "signed_at": null, "signature_deleted_at": null}'::jsonb then
    raise exception 'TEST FAILED: T11c view_signature of a desk row: %', public.star_view_signature(v_c1);
  end if;
  reset role;

  -- T11d. DOB and email ARE in the history in full (v0.169), on insert and
  --       on change, and stay after Delete permanently (S10)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_x1 := (public.star_add_candidate(v_e1, 'Dob', 'Hist', v_adult, 'dh1@example.com', 'worcester', 1, 0, 'cash') ->> 'id')::uuid;
  perform public.star_update_candidate(v_x1, 1, 'Dob', 'Hist', v_child, 'dh2@example.com', 'worcester', 1, 0, null);
  perform public.star_delete_candidate(v_x1, 2, '{}');
  if not exists (select 1 from public.change_log l where l.table_name = 'star_candidates' and l.record_id = v_x1 and l.op = 'insert'
                   and l.after ->> 'date_of_birth' = v_adult::text and l.after ->> 'email_for_results' = 'dh1@example.com')
     or not exists (select 1 from public.change_log l where l.table_name = 'star_candidates' and l.record_id = v_x1 and l.op = 'update'
                      and l.before ->> 'date_of_birth' = v_adult::text and l.after ->> 'date_of_birth' = v_child::text
                      and l.before ->> 'email_for_results' = 'dh1@example.com' and l.after ->> 'email_for_results' = 'dh2@example.com')
     or not exists (select 1 from public.change_log l where l.table_name = 'star_candidates' and l.record_id = v_x1 and l.op = 'delete'
                      and l.before ->> 'date_of_birth' = v_child::text and l.before ->> 'email_for_results' = 'dh2@example.com') then
    raise exception 'TEST FAILED: T11d DOB and email must be in the history on insert, change and removal';
  end if;

  -- T11e. History: only this candidate's rows. Two form candidates in one
  --       event, each with payments (incl. an undo), grades, a signature;
  --       the second is a possible duplicate pointing at the first
  perform set_config('request.jwt.claims', '', true);
  v_r := public.star_public_register(v_e1_w, v_tag || ' k11e', gen_random_uuid(), 'His', 'Tory', v_adult, 'h@example.com', 1, 0,
                                     'cash', true, v_sig, v_ack);
  select c.id into v_x1 from public.star_candidates c where c.reference = v_r ->> 'reference';
  v_r := public.star_public_register(v_e1_w, v_tag || ' k11e', gen_random_uuid(), 'His', 'Tory', v_adult, 'h2@example.com', 1, 0,
                                     'cash', true, v_sig, v_ack);
  select c.id into v_x2 from public.star_candidates c where c.reference = v_r ->> 'reference';
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_g1 in array array[v_x1, v_x2] loop
    v_r := public.star_record_payment(v_g1, (select c.version from public.star_candidates c where c.id = v_g1), 'cash', 14000, v_today);
    perform public.star_undo_payment((v_r ->> 'payment_id')::uuid);
    perform public.star_record_payment(v_g1, (select c.version from public.star_candidates c where c.id = v_g1), 'cash', 14000, v_today);
    perform public.star_set_grade(v_g1, v_k1, 'A');
    perform public.star_set_grade(v_g1, v_k1, 'B');
    perform public.star_set_count(v_g1, 'classes_attended', 7);
  end loop;
  if not exists (select 1 from public.star_candidates c where c.id = v_x2 and c.duplicate_of = v_x1) then
    raise exception 'TEST SETUP: T11e the second candidate should point at the first';
  end if;
  foreach v_g1 in array array[v_x1, v_x2] loop
    v_g2 := case when v_g1 = v_x1 then v_x2 else v_x1 end;
    v_r := public.star_candidate_history(v_g1);
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T11e history expected ok, got %', v_r - 'rows'; end if;
    -- exactly the change_log rows of this candidate and of ITS child rows
    -- (found here from the live tables, independently of the function)
    select count(*) into v_n from public.change_log l
     where (l.table_name = 'star_candidates' and l.record_id = v_g1)
        or (l.table_name = 'star_payments' and l.record_id in (select p.id from public.star_payments p where p.candidate_id = v_g1))
        or (l.table_name = 'star_grades' and l.record_id in (select g.id from public.star_grades g where g.candidate_id = v_g1))
        or (l.table_name = 'star_candidate_signatures' and l.record_id in (select s.id from public.star_candidate_signatures s where s.candidate_id = v_g1));
    if jsonb_array_length(v_r -> 'rows') <> v_n or v_n < 10 then
      raise exception 'TEST FAILED: T11e history of % has % rows, expected %', v_g1, jsonb_array_length(v_r -> 'rows'), v_n;
    end if;
    if exists (select 1 from jsonb_array_elements(v_r -> 'rows') as t(x)
                where coalesce(t.x -> 'after', '{}') ->> 'candidate_id' = v_g2::text
                   or coalesce(t.x -> 'before', '{}') ->> 'candidate_id' = v_g2::text
                   or coalesce(t.x -> 'after', '{}') ->> 'id' = v_g2::text
                   or (select array_agg(k order by k) from jsonb_object_keys(t.x) as k)
                      <> array['action', 'actor_name', 'after', 'before', 'occurred_at', 'op', 'table_name']
                   or coalesce(t.x -> 'after', '{}') ?| array['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'marked_by', 'undone_by']
                   or coalesce(t.x -> 'before', '{}') ?| array['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'marked_by', 'undone_by']
                   or (t.x::text like '%data:image%') or coalesce(t.x -> 'after', '{}') ? 'submission_id') then
      raise exception 'TEST FAILED: T11e history of % holds another candidate''s row, a login id or a picture', v_g1;
    end if;
    if not exists (select 1 from jsonb_array_elements(v_r -> 'rows') as t(x)
                    where t.x ->> 'table_name' = 'star_candidates' and t.x ->> 'op' = 'insert'
                      and t.x -> 'after' ->> 'date_of_birth' = v_adult::text) then
      raise exception 'TEST FAILED: T11e history must show the DOB in full';
    end if;
    if array(select t.x ->> 'occurred_at' from jsonb_array_elements(v_r -> 'rows') with ordinality as t(x, o) order by t.o)
       <> array(select t.x ->> 'occurred_at' from jsonb_array_elements(v_r -> 'rows') as t(x) order by (t.x ->> 'occurred_at')::timestamptz desc) then
      raise exception 'TEST FAILED: T11e history must be newest first';
    end if;
  end loop;
  -- the detail: DOB, email and age, the signature's state only
  v_r := public.star_candidate_detail(v_x1);
  if v_r ->> 'status' <> 'ok' or v_r -> 'candidate' ->> 'date_of_birth' <> v_adult::text
     or v_r -> 'candidate' ->> 'email_for_results' <> 'h@example.com' or (v_r -> 'candidate' ->> 'age_on_testing_day')::int <> 30
     or v_r -> 'candidate' ? 'created_by' or v_r -> 'candidate' ? 'updated_by' or v_r -> 'candidate' ? 'withdrawn_by'
     or v_r -> 'signature' ->> 'state' <> 'on_file' or v_r -> 'signature' ->> 'ack_version' <> v_ack
     or v_r::text like '%data:image%' or jsonb_array_length(v_r -> 'payments') <> 3 or (v_r ->> 'paid_cents')::int <> 14000
     or v_r ->> 'fee_kind' <> 'standard' or (v_r ->> 'expected_fee_cents')::int <> 14000 or (v_r ->> 'overpaid_cents')::int <> 0
     or v_r -> 'result' ->> 'candidate_id' <> v_x1::text or v_r -> 'sent' -> 'sent' <> 'null'::jsonb
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k)
        <> array['candidate', 'expected_fee_cents', 'fee_kind', 'makeup_subjects', 'overpaid_cents', 'paid_cents', 'payments',
                 'result', 'sent', 'signature', 'status'] then
    raise exception 'TEST FAILED: T11e candidate_detail answer %', v_r;
  end if;
  if public.star_candidate_detail(v_c1) -> 'signature' ->> 'state' <> 'none'
     or public.star_candidate_detail(v_g1) is null
     or public.star_candidate_detail((select s.candidate_id from public.star_candidate_signatures s
                                       where s.signature is null limit 1)) -> 'signature' ->> 'state' <> 'removed' then
    raise exception 'TEST FAILED: T11e candidate_detail signature states (none / removed)';
  end if;
  -- (A2-A8 get no_access from the detail, history and signature functions: T1c)

  -- T11b. no picture and no submission id anywhere in the history (after
  --       registrations, the clean-up, edits and both kinds of removal)
  if exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
              where t.tgrelid = 'public.star_candidate_signatures'::regclass and p.proname = 'change_log_write')
     or not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                     where t.tgrelid = 'public.star_candidate_signatures'::regclass and p.proname = 'star_candidate_signatures_log'
                       and t.tgenabled = 'O') then
    raise exception 'TEST FAILED: T11b the signatures table must have its own log trigger and never change_log_write';
  end if;
  if exists (select 1 from public.change_log l
              where coalesce(l.before::text, '') like '%data:image%' or coalesce(l.after::text, '') like '%data:image%') then
    raise exception 'TEST FAILED: T11b change_log contains a signature picture';
  end if;
  if exists (select 1 from public.change_log l
              where l.table_name like 'star\_%' and (coalesce(l.before, '{}') ? 'submission_id' or coalesce(l.after, '{}') ? 'submission_id')) then
    raise exception 'TEST FAILED: T11b change_log contains a Star submission id';
  end if;

  -- T11f. the public answers never hold anyone else's data, a count, a DOB
  --       or an email
  v_r := public.star_public_register(v_e1_w, v_tag || ' k5', v_rand, 'Cy', 'Doe', v_adult, 'cy@Example.com', 2, 0, 'cash', true, v_sig, v_ack);
  v_r2 := public.star_public_event(v_e1_w);
  if v_r::text like '%' || v_adult::text || '%' or v_r::text ilike '%@example.com%' or v_r::text like '%data:image%'
     or v_r2::text like '%count%' or v_r2::text ilike '%@example.com%' or v_r2::text like '%Lee%' then
    raise exception 'TEST FAILED: T11f a public answer holds a DOB, an email, a picture, a count or another candidate';
  end if;

  -- ===================================================================
  -- T12. Logging: every write function, called as the app does
  --      (authenticated), writes one history row per changed row with its
  --      own action tag, op, table, record, actor id + name, session and
  --      ONE batch id; candidates' rows carry location_code, events' rows
  --      never; tkd.action / tkd.batch_id are empty afterwards
  -- ===================================================================
  -- (each step: mark the history, call as A1 or D1, check with st_t12)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' Log', v_today + 50, '10:00', 'worcester', true, null, null);
  v_ex := (v_r ->> 'id')::uuid;
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_add_event', v_admin, v_a1, 'Main Admin', 'add_event');
  if (select count(*) from public.change_log l where l.id > v_mark and l.table_name = 'star_event_categories') <> 34 then
    raise exception 'TEST FAILED: T12a add_event must log every copied subject';
  end if;

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_update_event(v_ex, 1, v_tag || ' Log Renamed', v_today + 50, '10:00', 'worcester', null, null);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_update_event', v_admin, v_a1, 'Main Admin', 'update_event');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_set_registration(v_ex, 2, false);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_set_registration', v_admin, v_a1, 'Main Admin', 'set_registration');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  select d.version into v_v from public.star_dan_settings d where d.dan = 3;
  set local role authenticated;
  v_r := public.star_update_dan_settings(3, v_v, 246, 5, 16000, 17000, 18000);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_update_dan_settings', v_admin, v_a1, 'Main Admin', 'update_dan_settings');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_add_category(3, v_tag || ' Log Subject', 5);
  v_cat := (v_r ->> 'id')::uuid;
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_add_category', v_admin, v_a1, 'Main Admin', 'add_category');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_update_category(v_cat, 1, v_tag || ' Log Subject 2', 6);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_update_category', v_admin, v_a1, 'Main Admin', 'update_category');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_ids3 := array(select k.id from public.star_categories k where k.dan = 3 order by k.position);
  v_ids2 := array[v_ids3[2], v_ids3[1]] || v_ids3[3:];
  set local role authenticated;
  v_r := public.star_reorder_categories(3, v_ids3, v_ids2);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_reorder_categories', v_admin, v_a1, 'Main Admin', 'reorder_categories');
  if (select count(*) from public.change_log l where l.id > v_mark) <> 2 then
    raise exception 'TEST FAILED: T12a swapping two subjects must log exactly 2 rows';
  end if;

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_delete_category(v_cat, 2);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_delete_category', v_admin, v_a1, 'Main Admin', 'delete_category');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_gv := array(select v.version from public.star_grade_values v order by v.position);
  set local role authenticated;
  v_r := public.star_update_grade_values(v_gv, '{4.6,4,3.5,3,2.5,2,0.3}');
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_update_grade_values', v_admin, v_a1, 'Main Admin', 'update_grade_values');
  if (select count(*) from public.change_log l where l.id > v_mark) <> 1 then
    raise exception 'TEST FAILED: T12a changing one grade value must log exactly one row';
  end if;

  select coalesce(max(id), 0) into v_mark from public.change_log;
  select a.version into v_v from public.star_assistant_table a;
  set local role authenticated;
  v_r := public.star_update_assistant_table(v_v, 11, '{16,14,13,12,11,10}', '{20,18,16,14,12,10}');
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_update_assistant_table', v_admin, v_a1, 'Main Admin', 'update_assistant_table');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_add_candidate(v_ex, 'Lou', 'Log', v_adult, 'lou@example.com', 'shrewsbury', 1, 0, 'cash');
  v_x1 := (v_r ->> 'id')::uuid;
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_add_candidate', v_desk, v_d1, 'Staff', 'add_candidate');
  if not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'star_candidates'
                   and l.location_code = 'shrewsbury' and l.record_id = v_x1 and l.op = 'insert') then
    raise exception 'TEST FAILED: T12a a candidate''s history row must carry its school';
  end if;

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_update_candidate(v_x1, 1, 'Louis', 'Log', v_adult, 'lou@example.com', 'shrewsbury', 1, 0, null);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_update_candidate', v_desk, v_d1, 'Staff', 'update_candidate');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_change_paying_by(v_x1, 2, 'check');
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_change_paying_by', v_desk, v_d1, 'Staff', 'change_paying_by');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_set_private(v_x1, 3, v_today + 51, '11:00');
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_set_private', v_desk, v_d1, 'Staff', 'set_private');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_set_private(v_x1, 4, null, null);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_clear_private', v_desk, v_d1, 'Staff', 'clear_private');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_record_payment(v_x1, 5, 'check', 14000, v_today);
  v_p1 := (v_r ->> 'payment_id')::uuid;
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_record_payment', v_desk, v_d1, 'Staff', 'record_payment');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_undo_payment(v_p1);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_undo_payment', v_desk, v_d1, 'Staff', 'undo_payment');

  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_record_payment(v_x1, 7, 'check', 16000, v_today);
  v_p1 := (v_r ->> 'payment_id')::uuid;
  reset role;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_edit_payment(v_p1, 'cash', 15000, v_today);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_edit_payment', v_admin, v_a1, 'Main Admin', 'edit_payment');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_record_refund(v_x1, 9, 'cash', 1000, v_today);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T12a refund answered %', v_r; end if;
  perform pg_temp.st_t12(v_mark, 'star_record_refund', v_admin, v_a1, 'Main Admin', 'record_refund');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_set_grade(v_x1, (select k.id from public.star_event_categories k where k.event_id = v_ex and k.dan = 1 and k.position = 0), 'A');
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_set_grade', v_desk, v_d1, 'Staff', 'set_grade');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_set_count(v_x1, 'classes_attended', 4);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_set_count', v_desk, v_d1, 'Staff', 'set_count');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_withdraw_candidate(v_x1, 10);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_withdraw_candidate', v_admin, v_a1, 'Main Admin', 'withdraw_candidate');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_restore_candidate(v_x1, 11);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_restore_candidate', v_admin, v_a1, 'Main Admin', 'restore_candidate');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_add_candidate(v_ex, 'LOUIS', 'log', v_adult, 'lou2@example.com', 'worcester', 1, 0, 'cash');
  v_x2 := (v_r ->> 'id')::uuid;
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_add_candidate', v_desk, v_d1, 'Staff', 'add_candidate (duplicate: both rows)');
  if (select count(*) from public.change_log l where l.id > v_mark and l.table_name = 'star_candidates') <> 2 then
    raise exception 'TEST FAILED: T12a a duplicate add must log the new row and the partner''s mark';
  end if;

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_resolve_duplicate(v_x1, (select v.version from public.star_roster v where v.id = v_x1),
                                       v_x2, (select v.version from public.star_roster v where v.id = v_x2), true);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T12a resolve answered %', v_r; end if;
  perform pg_temp.st_t12(v_mark, 'star_resolve_duplicate', v_desk, v_d1, 'Staff', 'resolve_duplicate');

  -- Mark as sent / Undo, set make-up subjects, add make-up (on Main's results)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_mark_result_sent(v_ids[3], (select t.x ->> 'result_key' from jsonb_array_elements(public.star_event_results(v_e1, 1) -> 'rows') as t(x)
                                                   where (t.x ->> 'candidate_id')::uuid = v_ids[3]));
  v_sent := (v_r ->> 'sent_id')::uuid;
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_mark_result_sent', v_desk, v_d1, 'Staff', 'mark_result_sent');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_undo_result_sent(v_sent);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_undo_result_sent', v_desk, v_d1, 'Staff', 'undo_result_sent');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select c.id into v_g1 from public.star_candidates c where c.event_id = v_e1 and c.first_name = 'Low' and c.last_name = 'Cee';
  v_r := public.star_set_makeup_subjects(v_g1, array[v_k_brk, v_k1], array[v_k1]);
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_set_makeup_subjects', v_admin, v_a1, 'Main Admin', 'set_makeup_subjects');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_add_makeup(v_ex, v_ids[3]);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T12a add_makeup answered %', v_r; end if;
  perform pg_temp.st_t12(v_mark, 'star_add_makeup', v_admin, v_a1, 'Main Admin', 'add_makeup');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_delete_candidate(v_x2, (select v.version from public.star_roster v where v.id = v_x2), '{}');
  reset role;
  perform pg_temp.st_t12(v_mark, 'star_delete_candidate', v_admin, v_a1, 'Main Admin', 'delete_candidate');

  select coalesce(max(id), 0) into v_mark from public.change_log;
  select count(*), coalesce(sum(p.amount_cents), 0) into v_n, v_n2
    from public.star_candidates c left join public.star_payments p on p.candidate_id = c.id where c.event_id = v_ex;
  select count(*) into v_n from public.star_candidates c where c.event_id = v_ex;
  set local role authenticated;
  v_r := public.star_delete_event(v_ex, (select e.version from public.star_events e where e.id = v_ex), v_n, v_n2);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: T12a delete_event answered %', v_r; end if;
  perform pg_temp.st_t12(v_mark, 'star_delete_event', v_admin, v_a1, 'Main Admin', 'delete_event');

  -- and over this WHOLE run: every Star history row this test made carries
  -- one of the contract's action tags (or 'manual' for this file's own
  -- direct writes as postgres)
  select string_agg(distinct l.action, ', ') into v_txt
    from public.change_log l
   where l.id > v_mark0
     and l.table_name like 'star\_%'
     and l.action not in ('star_seed', 'star_update_dan_settings', 'star_add_category', 'star_update_category',
                          'star_reorder_categories', 'star_delete_category', 'star_update_grade_values',
                          'star_update_assistant_table', 'star_add_event', 'star_update_event', 'star_set_registration',
                          'star_delete_event', 'star_add_candidate', 'star_add_makeup', 'star_update_candidate',
                          'star_change_paying_by', 'star_resolve_duplicate', 'star_set_private', 'star_clear_private',
                          'star_withdraw_candidate', 'star_restore_candidate', 'star_delete_candidate', 'star_record_payment',
                          'star_undo_payment', 'star_edit_payment', 'star_record_refund', 'star_set_grade', 'star_set_count',
                          'star_set_makeup_subjects', 'star_mark_result_sent', 'star_undo_result_sent', 'star_public_register',
                          'star_purge_old_signatures', 'manual');
  if v_txt is not null then raise exception 'TEST FAILED: T12a unknown action tag(s) in Star history rows: %', v_txt; end if;

  -- ===================================================================
  -- T13. Catalog: the rights and rules on EVERY object 0006 made
  -- ===================================================================

  -- C1. RLS on all 16 tables; the signatures table and the download log
  --     have no rule; every other table exactly one read rule
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = any (v_tables) and c.relrowsecurity;
  if v_n <> 16 then raise exception 'TEST FAILED: C1 RLS is on for only % of the 16 tables', v_n; end if;
  select count(*) into v_n from pg_policies p
   where p.schemaname = 'public' and p.tablename = any (v_read_tables) and p.cmd = 'SELECT'
     and p.roles = array['authenticated']::name[] and p.permissive = 'PERMISSIVE' and p.qual like '%has_data_access()%'
     and p.policyname = p.tablename || '_select_with_access';
  if v_n <> 14 then raise exception 'TEST FAILED: C1 expected 14 has_data_access read rules, found %', v_n; end if;
  select count(*) into v_n from pg_policies p where p.schemaname = 'public' and p.tablename = any (v_tables);
  if v_n <> 14 then raise exception 'TEST FAILED: C1 expected no other rules on the 0006 tables, found % in total', v_n; end if;

  -- C2. table-wide rights: none for anon, authenticated, service_role or
  --     PUBLIC (the view: SELECT for authenticated only); column SELECT for
  --     authenticated exactly contract 4.1, and every listed column exists
  foreach v_tbl in array v_tables || array['star_roster'] loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] loop
      if has_table_privilege('anon', 'public.' || v_tbl, v_priv)
         or has_table_privilege('service_role', 'public.' || v_tbl, v_priv)
         or has_table_privilege('public', 'public.' || v_tbl, v_priv)
         or has_table_privilege('star_registrar', 'public.' || v_tbl, v_priv)
         or has_table_privilege('testing_registrar', 'public.' || v_tbl, v_priv)
         or (has_table_privilege('authenticated', 'public.' || v_tbl, v_priv)
             and not (v_tbl = 'star_roster' and v_priv = 'SELECT')) then
        raise exception 'TEST FAILED: C2 % has table-wide % for a role that must not have it', v_tbl, v_priv;
      end if;
    end loop;
    foreach v_priv in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege('authenticated', 'public.' || v_tbl, v_priv) then
        raise exception 'TEST FAILED: C2 authenticated has a column % right on %', v_priv, v_tbl;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('authenticated', 'public.star_roster', 'SELECT') then
    raise exception 'TEST FAILED: C2 authenticated must be able to read star_roster';
  end if;
  v_list := array(
    select t || '.' || c
      from (values
        ('star_dan_settings', 'id,dan,label,pass_mark,star_limit,standard_cents,same_day_cents,private_cents,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('star_categories', 'id,dan,name,credits,position,from_class_count,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('star_grade_values', 'id,grade,position,value,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('star_assistant_table', 'id,child_max_age,child_a_plus,child_a,child_b_plus,child_b,child_c_plus,child_c,adult_a_plus,adult_a,adult_b_plus,adult_b,adult_c_plus,adult_c,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('star_events', 'id,name,testing_date,start_time,where_code,registration_open,auto_close_on,first_opened_at,public_code_worcester,public_code_shrewsbury,note,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('star_event_dans', 'id,event_id,dan,label,pass_mark,star_limit,standard_cents,same_day_cents,private_cents'),
        ('star_event_categories', 'id,event_id,dan,template_category_id,name,credits,position,from_class_count'),
        ('star_event_grades', 'id,event_id,grade,position,value'),
        ('star_event_assistant', 'id,event_id,child_max_age,child_a_plus,child_a,child_b_plus,child_b,child_c_plus,child_c,adult_a_plus,adult_a,adult_b_plus,adult_b,adult_c_plus,adult_c'),
        ('star_candidates', 'id,event_id,first_name,last_name,location_code,dan,stars_from,paying_by,source,reference,registered_at,status,withdrawn_reason,withdrawn_at,withdrawn_by_name,duplicate_state,duplicate_of,is_makeup,makeup_of_candidate_id,makeup_of_event_name,private_on,private_time,classes_attended,assistant_classes,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('star_makeup_subjects', 'id,candidate_id,event_category_id,kind,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('star_payments', 'id,candidate_id,kind,amount_cents,method,paid_on,recorded_at,recorded_by_name,reverses_payment_id'),
        ('star_grades', 'id,candidate_id,event_category_id,grade,kept,kept_from_event_id,kept_from_event_name,version,created_at,updated_at,created_by_name,updated_by_name'),
        ('star_result_emails', 'id,candidate_id,marked_at,marked_by_name,result_status,result_total,result_needs,result_key,sent_via,undone_at,undone_by_name')
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

  -- C3. the reference counter: no rights for anyone; starts at 4001
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'public', 'star_registrar', 'testing_registrar'] loop
    foreach v_priv in array array['USAGE', 'SELECT', 'UPDATE'] loop
      if has_sequence_privilege(v_role, 'public.star_candidate_ref_seq', v_priv) then
        raise exception 'TEST FAILED: C3 % has % on star_candidate_ref_seq', v_role, v_priv;
      end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_sequences s where s.schemaname = 'public' and s.sequencename = 'star_candidate_ref_seq'
                  and s.start_value = 4001) then
    raise exception 'TEST FAILED: C3 star_candidate_ref_seq must start at 4001';
  end if;

  -- C4. every 0006 function: exactly one version, search_path pinned,
  --     security definer exactly as designed, no argument defaults, who may
  --     run it, the exact signatures
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
       or has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: C4 anon, service_role or testing_registrar can execute %', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_staff_fns)) then
      raise exception 'TEST FAILED: C4 authenticated execute on % is wrong', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('star_registrar', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_public_fns)) then
      raise exception 'TEST FAILED: C4 star_registrar execute on % is wrong', v_fn.oid::regprocedure;
    end if;
    if exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) as a
                where a.grantee = 0) then
      raise exception 'TEST FAILED: C4 PUBLIC has a right on %', v_fn.oid::regprocedure;
    end if;
    if v_fn.prosecdef is distinct from (v_fn.name = any (v_staff_fns || v_public_fns || array['star_candidate_signatures_log'])) then
      raise exception 'TEST FAILED: C4 % security definer is %, not as designed', v_fn.oid::regprocedure, v_fn.prosecdef;
    end if;
  end loop;
  if v_n <> cardinality(v_staff_fns || v_public_fns || v_helper_fns) or cardinality(v_staff_fns) <> 37 then
    raise exception 'TEST FAILED: C4 expected exactly % functions from 0006 (one version each, 37 staff), found %',
      cardinality(v_staff_fns || v_public_fns || v_helper_fns), v_n;
  end if;
  select string_agg(x.sig, ', ') into v_txt
    from unnest(array[
      'public.star_update_dan_settings(integer, integer, numeric, integer, integer, integer, integer)',
      'public.star_add_category(integer, text, integer)',
      'public.star_update_category(uuid, integer, text, integer)',
      'public.star_reorder_categories(integer, uuid[], uuid[])',
      'public.star_delete_category(uuid, integer)',
      'public.star_update_grade_values(integer[], numeric[])',
      'public.star_update_assistant_table(integer, integer, integer[], integer[])',
      'public.star_add_event(text, date, time, text, boolean, date, text)',
      'public.star_update_event(uuid, integer, text, date, time, text, date, text)',
      'public.star_set_registration(uuid, integer, boolean)',
      'public.star_delete_event(uuid, integer, integer, integer)',
      'public.star_add_candidate(uuid, text, text, date, text, text, integer, integer, text)',
      'public.star_add_makeup(uuid, uuid)',
      'public.star_update_candidate(uuid, integer, text, text, date, text, text, integer, integer, integer)',
      'public.star_change_paying_by(uuid, integer, text)',
      'public.star_resolve_duplicate(uuid, integer, uuid, integer, boolean)',
      'public.star_set_private(uuid, integer, date, time)',
      'public.star_withdraw_candidate(uuid, integer)',
      'public.star_restore_candidate(uuid, integer)',
      'public.star_delete_candidate(uuid, integer, uuid[])',
      'public.star_record_payment(uuid, integer, text, integer, date)',
      'public.star_undo_payment(uuid)',
      'public.star_edit_payment(uuid, text, integer, date)',
      'public.star_record_refund(uuid, integer, text, integer, date)',
      'public.star_set_grade(uuid, uuid, text)',
      'public.star_set_count(uuid, text, integer)',
      'public.star_set_makeup_subjects(uuid, uuid[], uuid[])',
      'public.star_mark_result_sent(uuid, text)',
      'public.star_undo_result_sent(uuid)',
      'public.star_results_csv(uuid, integer)',
      'public.star_candidate_detail(uuid)',
      'public.star_candidate_history(uuid)',
      'public.star_view_signature(uuid)',
      'public.star_age_groups(uuid)',
      'public.star_event_results(uuid, integer)',
      'public.star_makeup_list(uuid)',
      'public.star_home_today()',
      'public.star_public_event(text)',
      'public.star_public_register(text, text, uuid, text, text, date, text, integer, integer, text, boolean, text, text)']) as x(sig)
   where to_regprocedure(x.sig) is null;
  if v_txt is not null then raise exception 'TEST FAILED: C4 missing function signature(s): %', v_txt; end if;
  -- the reads that run the clean-up (and the CSV) must be volatile; the others stable
  select string_agg(p.proname || '=' || p.provolatile::text, ',' order by p.proname) into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('star_home_today', 'star_makeup_list', 'star_results_csv', 'star_candidate_detail',
                                                'star_candidate_history', 'star_view_signature', 'star_age_groups', 'star_event_results',
                                                'star_public_event');
  if v_txt is distinct from 'star_age_groups=s,star_candidate_detail=s,star_candidate_history=s,star_event_results=s,'
                            'star_home_today=v,star_makeup_list=v,star_public_event=s,star_results_csv=v,star_view_signature=s' then
    raise exception 'TEST FAILED: C4 volatility of the read functions: %', v_txt;
  end if;

  -- C5. the view runs with the caller's rights
  if not exists (select 1 from pg_class c where c.oid = 'public.star_roster'::regclass
                  and 'security_invoker=true' = any (c.reloptions)) then
    raise exception 'TEST FAILED: C5 star_roster must be security_invoker = true';
  end if;

  -- C6. what happens on removal (foreign keys: c = cascade, n = set null,
  --     a = no action)
  select string_agg(x.con, ', ') into v_txt
    from (values ('star_categories_dan_fk', 'a'), ('star_events_where_fk', 'a'), ('star_event_dans_event_fk', 'c'),
                 ('star_event_categories_event_fk', 'c'), ('star_event_categories_dan_fk', 'c'), ('star_event_grades_event_fk', 'c'),
                 ('star_event_assistant_event_fk', 'c'), ('star_candidates_event_fk', 'c'), ('star_candidates_location_fk', 'a'),
                 ('star_candidates_dan_fk', 'a'), ('star_candidates_duplicate_fk', 'n'), ('star_candidates_makeup_fk', 'n'),
                 ('star_candidate_signatures_candidate_fk', 'c'), ('star_makeup_subjects_candidate_fk', 'c'),
                 ('star_makeup_subjects_category_fk', 'a'), ('star_payments_candidate_fk', 'c'), ('star_payments_reverses_fk', 'a'),
                 ('star_grades_candidate_fk', 'c'), ('star_grades_category_fk', 'a'), ('star_result_emails_candidate_fk', 'c'))
           as x(con, act)
   where not exists (select 1 from pg_constraint c join pg_namespace n on n.oid = c.connamespace
                      where n.nspname = 'public' and c.conname = x.con and c.contype = 'f' and c.confdeltype = x.act);
  if v_txt is not null then raise exception 'TEST FAILED: C6 missing foreign key or wrong removal rule on: %', v_txt; end if;
  if (select count(*) from pg_constraint c where c.contype = 'f' and c.conrelid = any (array(
        select ('public.' || t)::regclass from unnest(v_tables) as t))) <> 20 then
    raise exception 'TEST FAILED: C6 the 0006 tables must have exactly the 20 listed foreign keys';
  end if;

  -- C7. every trigger exists, runs the right function and is enabled
  select string_agg(x.trg, ', ') into v_txt
    from (select t || '_before_write' as trg, t as tbl, 'star_before_write' as fn
            from unnest(array['star_dan_settings', 'star_categories', 'star_grade_values', 'star_assistant_table', 'star_events',
                              'star_candidates', 'star_candidate_signatures', 'star_makeup_subjects', 'star_grades']) as t
          union all
          select t || '_before_write', t, 'star_event_copies_before_write'
            from unnest(array['star_event_dans', 'star_event_categories', 'star_event_grades', 'star_event_assistant']) as t
          union all
          select t || '_log', t, 'change_log_write'
            from unnest(v_tables) as t where t not in ('star_candidate_signatures', 'star_downloads')
          union all
          select t || '_no_truncate', t, 'testing_refuse_truncate' from unnest(v_tables) as t
          union all
          values ('star_events_rules', 'star_events', 'star_events_rules'),
                 ('star_candidates_rules', 'star_candidates', 'star_candidates_rules'),
                 ('star_candidate_signatures_rules', 'star_candidate_signatures', 'star_candidate_signatures_rules'),
                 ('star_candidate_signatures_log', 'star_candidate_signatures', 'star_candidate_signatures_log'),
                 ('star_makeup_subjects_rules', 'star_makeup_subjects', 'star_makeup_subjects_rules'),
                 ('star_payments_guard', 'star_payments', 'star_payments_guard'),
                 ('star_grades_rules', 'star_grades', 'star_grades_rules'),
                 ('star_result_emails_guard', 'star_result_emails', 'star_result_emails_guard'),
                 ('star_downloads_guard', 'star_downloads', 'star_downloads_guard')) as x(trg, tbl, fn)
   where not exists (
     select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
       join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public' and t.tgname = x.trg and c.relname = x.tbl
        and p.proname = x.fn and t.tgenabled = 'O' and not t.tgisinternal);
  if v_txt is not null then raise exception 'TEST FAILED: C7 missing / wrong / disabled trigger(s): %', v_txt; end if;
  select count(*) into v_n from pg_trigger t
   where t.tgrelid = any (array(select ('public.' || t)::regclass from unnest(v_tables) as t)) and not t.tgisinternal;
  if v_n <> 9 + 4 + 14 + 16 + 9 then raise exception 'TEST FAILED: C7 expected % triggers on the 0006 tables, found %', 9 + 4 + 14 + 16 + 9, v_n; end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'public.star_downloads'::regclass and t.tgname = 'star_downloads_log') then
    raise exception 'TEST FAILED: C7 star_downloads must not be logged';
  end if;
  -- the generic trigger's two arguments, per table (contract 2.11)
  select string_agg(x.tbl, ', ') into v_txt
    from (values ('star_dan_settings', 'id,dan', ''), ('star_categories', 'id,dan,from_class_count', 'position'),
                 ('star_grade_values', 'id,grade,position', ''), ('star_assistant_table', 'id,singleton', ''),
                 ('star_events', 'id,public_code_worcester,public_code_shrewsbury', ''),
                 ('star_candidates', 'id,event_id,source,reference,registered_at,is_makeup,makeup_of_event_name', 'classes_attended,assistant_classes'),
                 ('star_candidate_signatures', 'id,candidate_id,submission_id,acknowledged,ack_version,signed_at', 'signature,signature_deleted_at'),
                 ('star_makeup_subjects', 'id,candidate_id,event_category_id,kind', ''),
                 ('star_grades', 'id,candidate_id,event_category_id,kept,kept_from_event_id,kept_from_event_name', '')) as x(tbl, a0, a1)
   where not exists (select 1 from pg_trigger t
                      where t.tgrelid = ('public.' || x.tbl)::regclass and t.tgname = x.tbl || '_before_write' and t.tgnargs = 2
                        and pg_get_triggerdef(t.oid) like '%star_before_write(''' || x.a0 || ''', ''' || x.a1 || ''')%');
  if v_txt is not null then raise exception 'TEST FAILED: C7 star_before_write arguments wrong on: %', v_txt; end if;

  -- C8. every named rule and index exists; the partial "one active make-up"
  --     index has its exact WHERE; the subject position rule is deferrable,
  --     checked immediately
  select string_agg(x.name, ', ') into v_txt
    from unnest(array[
      'star_dan_settings_pkey', 'star_dan_settings_dan_key', 'star_dan_settings_dan_check', 'star_dan_settings_label_check',
      'star_dan_settings_pass_mark_check', 'star_dan_settings_star_limit_check', 'star_dan_settings_cents_check',
      'star_categories_pkey', 'star_categories_name_check', 'star_categories_credits_check', 'star_categories_position_check',
      'star_categories_dan_position_key', 'star_grade_values_grade_key', 'star_grade_values_grade_check',
      'star_grade_values_position_key', 'star_grade_values_position_check', 'star_grade_values_value_check',
      'star_assistant_table_singleton_key', 'star_assistant_table_singleton_check', 'star_assistant_table_child_check',
      'star_assistant_table_adult_check', 'star_assistant_table_child_max_age_check',
      'star_events_pkey', 'star_events_name_check', 'star_events_start_time_check', 'star_events_auto_close_check',
      'star_events_opened_check', 'star_events_code_worcester_key', 'star_events_code_shrewsbury_key', 'star_events_codes_check',
      'star_events_note_check', 'star_event_dans_event_dan_key', 'star_event_categories_event_dan_position_key',
      'star_event_grades_event_grade_key', 'star_event_grades_event_position_key', 'star_event_assistant_event_key',
      'star_candidates_pkey', 'star_candidates_dob_check', 'star_candidates_email_check', 'star_candidates_stars_from_check',
      'star_candidates_paying_by_check', 'star_candidates_source_check', 'star_candidates_reference_key',
      'star_candidates_reference_source_check', 'star_candidates_reference_check', 'star_candidates_status_check',
      'star_candidates_duplicate_state_check', 'star_candidates_duplicate_self_check', 'star_candidates_makeup_check',
      'star_candidates_private_check', 'star_candidates_classes_attended_check', 'star_candidates_assistant_classes_check',
      'star_candidate_signatures_candidate_key', 'star_candidate_signatures_submission_id_key',
      'star_candidate_signatures_acknowledged_check', 'star_candidate_signatures_signature_check',
      'star_candidate_signatures_deleted_check', 'star_makeup_subjects_kind_check',
      'star_makeup_subjects_candidate_category_kind_key', 'star_payments_reverses_key', 'star_payments_kind_check',
      'star_grades_grade_check', 'star_grades_kept_check', 'star_grades_candidate_category_key',
      'star_result_emails_status_check', 'star_result_emails_sent_via_check', 'star_result_emails_undone_check',
      'star_downloads_pkey']) as x(name)
   where not exists (select 1 from pg_constraint c join pg_namespace n on n.oid = c.connamespace
                      where n.nspname = 'public' and c.conname = x.name);
  if v_txt is not null then raise exception 'TEST FAILED: C8 missing rule(s): %', v_txt; end if;
  select string_agg(x.name, ', ') into v_txt
    from unnest(array['star_categories_dan_lower_name_idx', 'star_categories_one_from_class_count_idx', 'star_events_lower_name_idx',
                      'star_events_testing_date_idx', 'star_event_categories_lower_name_idx',
                      'star_event_categories_one_from_class_count_idx', 'star_candidates_event_idx', 'star_candidates_names_idx',
                      'star_candidates_duplicate_idx', 'star_candidates_makeup_idx', 'star_candidates_private_idx',
                      'star_candidates_one_active_makeup_idx', 'star_payments_candidate_idx', 'star_grades_category_idx',
                      'star_result_emails_candidate_idx']) as x(name)
   where not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relkind = 'i' and c.relname = x.name);
  if v_txt is not null then raise exception 'TEST FAILED: C8 missing index(es): %', v_txt; end if;
  if (select pg_get_indexdef('public.star_candidates_one_active_makeup_idx'::regclass))
     not like 'CREATE UNIQUE INDEX star_candidates_one_active_makeup_idx ON public.star_candidates USING btree (makeup_of_candidate_id) WHERE (is_makeup AND (status = ''active''::text))' then
    raise exception 'TEST FAILED: C8 one-active-make-up index is %', pg_get_indexdef('public.star_candidates_one_active_makeup_idx'::regclass);
  end if;
  if not exists (select 1 from pg_constraint c where c.conname = 'star_categories_dan_position_key' and c.condeferrable and not c.condeferred)
     or exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
                 where t.relname = any (v_tables) and c.condeferrable and c.conname <> 'star_categories_dan_position_key') then
    raise exception 'TEST FAILED: C8 only the subject position rule is deferrable (initially immediate)';
  end if;
  if (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
       where c.relname in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx', 'star_candidates_one_active_makeup_idx',
                           'star_categories_one_from_class_count_idx', 'star_event_categories_lower_name_idx',
                           'star_event_categories_one_from_class_count_idx') and i.indisunique) <> 6 then
    raise exception 'TEST FAILED: C8 the name / one-AI / one-active-make-up indexes must be unique';
  end if;

  -- C9. the 0001-0005 helpers Star calls still have the fingerprints they
  --     had when 0006 was written (0006 replaced none of them; if a later
  --     migration changes one, Star's behaviour may change - re-run this file)
  select string_agg(x.f, ', ') into v_txt
    from (values ('change_log_actor_name', 'dfaaf9fd240a31fad052fa49e9909c96'), ('change_log_write', '0dbd01d2fb6cb41108f126bfe1a44f2d'),
                 ('current_session_id', '32c5f96f3adc387fd022a040fcbc2a4e'), ('has_data_access', '950515a63adf44c7f70449441cad0a8a'),
                 ('is_admin', '497cd39cbd84bfb2233bde0198713c12'), ('testing_cents_is_valid', '66ae9dc59cf5401c01bbe66b0abacfdb'),
                 ('testing_location_address', '4cae0f1d89755becac314c91b7272ab8'), ('testing_name_is_valid', 'ab59348605c54a7fc76c4f69e4c8a6b4'),
                 ('testing_new_public_code', 'b85a828150a0dbad98e10c9bc77d184f'), ('testing_normalize_name', 'd91c6d79a9d50cf9752ecf6ec6a278fe'),
                 ('testing_normalize_note', 'a77231142f20147974040f07fb270dc7'), ('testing_note_is_valid', '590e3e2675e8ee3baf7f9ec1619b1c68'),
                 ('testing_refuse_truncate', '4522d11dc0517ac24c23b50b1bd394cc'), ('testing_school_date', '339e368e7cf3b65fc101646373a2dba8'),
                 ('testing_signature_is_valid', '9e6edc36c547a52462895557449bc33a'), ('testing_today', '015ce0e17fd701bedf8b11ed20b86816'))
           as x(f, m)
   where (select string_agg(md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), ',')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = x.f) is distinct from x.m;
  if v_txt is not null then raise exception 'TEST FAILED: C9 shared helper(s) changed since 0006: %', v_txt; end if;

  reset role;
end;
$$;

select 'ALL 0006 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
