-- =====================================================================
-- 0024_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0024_black_belt_rubric.sql (the
--   Black Belt rubric editor). It checks, in this order (contract 0024
--   section 11.1):
--     U1  who may call what: anon nothing; locked / signed-out / old /
--         magic-link / idle / inactive sessions get no_access from all five
--         new functions; the front desk gets not_allowed (and can't do a
--         first opening); the tables' read rights (U1b) and the form's
--         login (U1c)
--     U2  the validator: bad characters in every text, a missing key and a
--         wrong type at every level, one failing case per problem code,
--         the edge cases (the same cases as 0024_rubric_cases.json, written
--         in here because the SQL Editor can't read files)
--     U3  no number changed from the version 1 sheet to version 2
--     U4  Save / Undo of a Dan of the default rubric
--     U5  Save / Undo of a cycle's copy, and the lock after opening
--     U6  the first opening (admins only) and its Undo
--     U7  Add cycle copies the default
--     U8  the family form's public view of the rubric
--     U9  the tables' guards
--     U10 the history (action tags, one batch, the actor) - checked along
--         the way in U4-U6
--     U11 catalog: RLS, rules, rights, functions, triggers
--     U12 races (what one session can prove)
--   It makes its own test cycles with unusual names ("zz test 1a2b3c4d
--   ..."), so it works whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test cycles, the saves of the
--   default rubric, the undo slots, history rows, test sessions, the
--   admin's name changed for two checks, and the rule taken off and put
--   back in U8). NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0016_tests.sql (read its header): sessions A1-A8 (admin) and D1-D3
--   (the front desk) with pretend login tokens. U1 and the history checks
--   call the functions as "authenticated", like the app; the other checks
--   call them as the SQL Editor's role with A1's or D1's token set (the
--   functions run as their owner either way, and the test can then read
--   every column to check what was stored).
--
-- BEFORE YOU RUN IT
--   1. 0016 and 0024 are applied. You need TWO existing, ACTIVE staff rows:
--      an admin (Main Admin) and the shared front desk (Staff, role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test removes
--      its own test rows, checks that some removals are REFUSED, and takes
--      one rule off for a moment (U8). Everything is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0024 TESTS PASSED".
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
  v_role  text;
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  v_r      jsonb;
  v_r2     jsonb;
  v_d      jsonb;
  v_dx     jsonb;
  v_doc    jsonb;
  v_doc2   jsonb;
  v_case   record;
  v_i      integer;
  v_n      integer;
  v_rev    integer;
  v_v      integer;
  v_txt    text;
  v_txt2   text;
  v_name0  text;
  v_mark   bigint;
  v_list   text[];
  v_labels text[];
  v_calls  text[];
  v_codes  text[];
  v_snap_sql text;
  v_snap   text;
  v_snap2  text;
  v_fn     record;
  v_wv_name text;
  v_ph     boolean;

  -- the test cycles
  v_cu uuid;   -- U1: never opened
  v_c5 uuid;   -- U5: a cycle's copy, opened in the middle
  v_c6 uuid;   -- U6: opened by an admin, closed / reopened by the desk
  v_c6b uuid;  -- U6: opened and undone
  v_c6c uuid;  -- U6: opened after Application due, undone
  v_c6d uuid;  -- U6: a form registration earlier than the opening
  v_c6e uuid;  -- U6: a form registration removed again
  v_c7 uuid;   -- U7: copies the default
  v_c8 uuid;   -- U8: past, never opened
  v_c9 uuid;   -- U9: removed with its undo slot
  v_plan uuid;
  v_code_w text;

  v_new_fns text[] := array['bb_save_default_dan', 'bb_undo_default_dan', 'bb_save_cycle_dan', 'bb_undo_cycle_dan',
                            'bb_undo_first_open'];
  v_replaced_fns text[] := array['bb_set_registration', 'bb_add_cycle', 'bb_public_cycle', 'bb_cycles_rules'];
  v_helper_fns text[] := array['bb_rubric_num_ok', 'bb_rubric_int_ok', 'bb_rubric_letters', 'bb_rubric_brackets_problems',
                               'bb_rubric_dan_problems', 'bb_rubric_is_valid', 'bb_rubric_part_max', 'bb_rubric_most_points',
                               'bb_rubric_from_v1', 'bb_rubric_fresh_copy', 'bb_rubric_public', 'bb_rubric_put_dan',
                               'bb_default_rubric_guard', 'bb_rubric_undo_guard'];
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
  if to_regclass('public.bb_default_rubric') is null or to_regclass('public.bb_rubric_undo') is null then
    raise exception 'TEST SETUP: the 0024 tables are missing (is 0024 applied?)';
  end if;
  if (select count(*) from public.bb_default_rubric) <> 1 then
    raise exception 'TEST SETUP: bb_default_rubric must have exactly one row';
  end if;
  select full_name into v_name0 from public.staff where id = v_admin;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);

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

  -- "did anything change?": the two 0024 tables, every cycle and the
  -- history count, as one md5
  v_snap_sql := 'select md5(coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_default_rubric x), '''')'
             || ' || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_rubric_undo x), '''')'
             || ' || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.bb_cycles x), '''')'
             || ' || (select count(*) from public.change_log)::text)';

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   bbr_payload(name, first day, application due): a valid Add cycle
  --     payload (as 0016_tests' bbt_payload)
  --   bbr_apply(dan, ops): applies a test case's changes ("set" = jsonb_set,
  --     "remove" = the #- operator), in order
  --   bbr_codes(problems): the sorted, de-duplicated problem codes
  --   bbr_flat_v1(v1 sheet) / bbr_flat_v2(v2 rubric): every number and
  --     text of a sheet as comparable rows (U3, contract 4.3)
  --   bbr_log(mark, action, actor, session, name, label): the history rows
  --     one call wrote (U10)
  execute $f$
    create function pg_temp.bbr_payload(p_name text, p_d1 date, p_app date) returns jsonb
    language sql as $b$
      select jsonb_build_object(
        'name', p_name, 'application_due', p_app, 'submissions_due', p_d1 + 7, 'auto_close', true,
        'days', jsonb_build_array(
          jsonb_build_object('name', 'Physical', 'day_date', p_d1, 'start_time', '12:30', 'end_time', '14:30',
                             'place', jsonb_build_object('code', 'worcester'), 'second', null,
                             'parts', jsonb_build_array('physical')),
          jsonb_build_object('name', 'Technical and Curriculum', 'day_date', p_d1 + 7, 'start_time', '12:30', 'end_time', '15:30',
                             'place', jsonb_build_object('code', 'shrewsbury'), 'second', null,
                             'parts', jsonb_build_array('technical', 'curriculum'))),
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
    create function pg_temp.bbr_apply(p_d jsonb, p_ops jsonb) returns jsonb
    language plpgsql as $b$
    declare
      v_op   jsonb;
      v_path text[];
    begin
      for v_op in select e from jsonb_array_elements(p_ops) with ordinality as t(e, o) order by t.o loop
        v_path := array(select jsonb_array_elements_text(v_op -> 'path'));
        if v_op ->> 'op' = 'set' then
          p_d := jsonb_set(p_d, v_path, v_op -> 'value', true);
        else
          p_d := p_d #- v_path;
        end if;
      end loop;
      return p_d;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbr_codes(p_problems jsonb) returns text[]
    language sql as $b$
      select coalesce(array(select distinct e ->> 'code' from jsonb_array_elements(p_problems) as t(e) order by 1), '{}');
    $b$;
  $f$;
  -- U3's rows. Numbers are written with trim_scale (80.0 = 80), names exactly.
  --   P  dan|part|subject|grade|points             every subject, every grade
  --   K  dan|part|subject|way|from|to|grade|cut-off every cut-off (Pull-up's
  --        reps / hold groups -> the ways "Pull-up" / "Hold")
  --   S  dan|part|subject|credits|outdoor|handed_in|note|graded or measured
  --   U  dan|part|subject|way|unit|direction
  --   M  dan|part|from|to|most points of the part for that pass bracket
  --   R  dan|from|to|pass mark      N  dan|no_d|makeup
  --   E  dan|extra points (JSON, with the note)    H  dan|handed-in subject
  execute $f$
    create function pg_temp.bbr_flat_v1(p jsonb) returns setof text
    language sql as $b$
      with d as (select (x.e ->> 'dan')::int as dan, x.e,
                        (x.e -> 'pass_rule' ? 'points_adult'
                         or exists (select 1 from jsonb_array_elements(x.e -> 'parts') pp(e), jsonb_array_elements(pp.e -> 'subjects') ss(e)
                                     where ss.e -> 'adults_only' = 'true')) as split
                   from jsonb_array_elements(p -> 'dans') as x(e)),
           pa as (select d.dan, d.split, d.e as de, pt.e from d, jsonb_array_elements(d.e -> 'parts') as pt(e)),
           s as (select pa.dan, pa.e ->> 'code' as part, su.e from pa, jsonb_array_elements(pa.e -> 'subjects') as su(e))
      select 'P|' || s.dan || '|' || s.part || '|' || (s.e ->> 'name') || '|' || g.key || '|' || trim_scale((g.value #>> '{}')::numeric)
        from s, jsonb_each(s.e -> 'scoring' -> 'points') as g
      union all
      select 'K|' || s.dan || '|' || s.part || '|' || (s.e ->> 'name') || '|'
             || coalesce(case gr.e ->> 'method' when 'reps' then 'Pull-up' when 'hold' then 'Hold' end, '') || '|'
             || coalesce(gr.e -> 'ages' ->> 'min', '') || '|' || coalesce(gr.e -> 'ages' ->> 'max', '') || '|'
             || (c.e ->> 'grade') || '|' || trim_scale((c.e ->> 'value')::numeric)
        from s, jsonb_array_elements(s.e -> 'scoring' -> 'groups') as gr(e), jsonb_array_elements(gr.e -> 'cutoffs') as c(e)
       where s.e -> 'scoring' ->> 'kind' = 'table'
      union all
      select 'S|' || s.dan || '|' || s.part || '|' || (s.e ->> 'name') || '|' || (s.e ->> 'credits') || '|'
             || coalesce(s.e ->> 'outdoor', 'false') || '|' || coalesce(s.e ->> 'hand_in', 'false') || '|'
             || coalesce(s.e -> 'scoring' ->> 'note', '') || '|'
             || case s.e -> 'scoring' ->> 'kind' when 'grades' then 'graded' when 'table' then 'measured' end
        from s
      union all
      select 'U|' || s.dan || '|' || s.part || '|' || (s.e ->> 'name') || '|' || w.way || '|' || w.unit || '|' || (s.e -> 'scoring' ->> 'direction')
        from s, lateral (select '' as way, s.e -> 'scoring' ->> 'unit' as unit
                          where not exists (select 1 from jsonb_array_elements(s.e -> 'scoring' -> 'groups') gg(e) where gg.e ? 'method')
                         union all select 'Pull-up', 'reps'
                          where exists (select 1 from jsonb_array_elements(s.e -> 'scoring' -> 'groups') gg(e) where gg.e ->> 'method' = 'reps')
                         union all select 'Hold', 'seconds'
                          where exists (select 1 from jsonb_array_elements(s.e -> 'scoring' -> 'groups') gg(e) where gg.e ->> 'method' = 'hold')) as w
       where s.e -> 'scoring' ->> 'kind' = 'table'
      union all
      select 'M|' || pa.dan || '|' || (pa.e ->> 'code') || '|' || b.f || '|' || b.t || '|' || trim_scale(b.m)
        from pa, lateral (select '' as f, '' as t, (pa.e ->> 'max_points')::numeric as m where not pa.split
                          union all select '', '17', (pa.e ->> 'max_points')::numeric where pa.split
                          union all select '18', '', coalesce(pa.e ->> 'max_points_adult', pa.e ->> 'max_points')::numeric where pa.split) as b
      union all
      select 'R|' || d.dan || '|' || b.f || '|' || b.t || '|' || trim_scale(b.m)
        from d, lateral (select '' as f, '' as t, (d.e -> 'pass_rule' ->> 'points')::numeric as m where not d.split
                         union all select '', '17', (d.e -> 'pass_rule' ->> 'points')::numeric where d.split
                         union all select '18', '', coalesce(d.e -> 'pass_rule' ->> 'points_adult', d.e -> 'pass_rule' ->> 'points')::numeric where d.split) as b
      union all
      select 'N|' || d.dan || '|' || (d.e -> 'pass_rule' ->> 'no_d') || '|' || coalesce(d.e -> 'pass_rule' ->> 'makeup', '') from d
      union all
      select 'E|' || d.dan || '|' || (d.e -> 'extra_points' || jsonb_build_object('note', coalesce(d.e -> 'extra_points' -> 'note', 'null'::jsonb)))::text from d
      union all
      select 'H|' || d.dan || '|' || (h.e ->> 'name') from d, jsonb_array_elements(coalesce(d.e -> 'hand_in', '[]')) as h(e);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbr_flat_v2(p jsonb) returns setof text
    language sql as $b$
      with d as (select (x.e ->> 'dan')::int as dan, x.e from jsonb_array_elements(p -> 'dans') as x(e)),
           pa as (select d.dan, d.e as de, pt.e from d, jsonb_array_elements(d.e -> 'parts') as pt(e)),
           s as (select pa.dan, pa.e ->> 'code' as part, su.e from pa, jsonb_array_elements(pa.e -> 'subjects') as su(e))
      select 'P|' || s.dan || '|' || s.part || '|' || (s.e ->> 'name') || '|' || g.key || '|' || trim_scale((g.value #>> '{}')::numeric)
        from s, jsonb_each(s.e -> 'points') as g
      union all
      select 'K|' || s.dan || '|' || s.part || '|' || (s.e ->> 'name') || '|' || coalesce(w.e ->> 'name', '') || '|'
             || coalesce(b.e ->> 'from', '') || '|' || coalesce(b.e ->> 'to', '') || '|' || c.key || '|' || trim_scale((c.value #>> '{}')::numeric)
        from s, jsonb_array_elements(s.e -> 'ways') as w(e), jsonb_array_elements(w.e -> 'brackets') as b(e), jsonb_each(b.e -> 'cutoffs') as c
      union all
      select 'S|' || s.dan || '|' || s.part || '|' || (s.e ->> 'name') || '|' || (s.e ->> 'credits') || '|'
             || (s.e ->> 'outdoor') || '|' || (s.e ->> 'handed_in') || '|' || coalesce(s.e ->> 'note', '') || '|' || (s.e ->> 'scoring')
        from s
      union all
      select 'U|' || s.dan || '|' || s.part || '|' || (s.e ->> 'name') || '|' || coalesce(w.e ->> 'name', '') || '|' || (w.e ->> 'unit') || '|' || (w.e ->> 'direction')
        from s, jsonb_array_elements(s.e -> 'ways') as w(e)
      union all
      select 'M|' || pa.dan || '|' || (pa.e ->> 'code') || '|' || coalesce(b.e ->> 'from', '') || '|' || coalesce(b.e ->> 'to', '') || '|'
             || trim_scale(public.bb_rubric_part_max(pa.e, (b.e ->> 'from')::int, (b.e ->> 'to')::int))
        from pa, jsonb_array_elements(pa.de -> 'pass' -> 'brackets') as b(e)
      union all
      select 'R|' || d.dan || '|' || coalesce(b.e ->> 'from', '') || '|' || coalesce(b.e ->> 'to', '') || '|' || trim_scale((b.e ->> 'pass_mark')::numeric)
        from d, jsonb_array_elements(d.e -> 'pass' -> 'brackets') as b(e)
      union all
      select 'N|' || d.dan || '|' || (d.e -> 'pass' ->> 'no_d') || '|' || coalesce(d.e -> 'pass' ->> 'makeup', '') from d
      union all
      select 'E|' || d.dan || '|' || (d.e -> 'extra_points')::text from d
      union all
      select 'H|' || s.dan || '|' || (s.e ->> 'name') from s where s.e -> 'handed_in' = 'true';
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bbr_log(p_mark bigint, p_action text, p_actor uuid, p_session uuid, p_name text, p_label text)
    returns void language plpgsql as $b$
    begin
      if not exists (select 1 from public.change_log l where l.id > p_mark) then
        raise exception 'TEST FAILED: U10 % wrote no history row', p_label;
      end if;
      if exists (select 1 from public.change_log l
                  where l.id > p_mark
                    and (l.action <> p_action or l.actor_id is distinct from p_actor
                         or l.session_id is distinct from p_session or l.actor_name <> p_name
                         or l.batch_id is null or l.table_name not like 'bb\_%' or l.record_id is null
                         or l.location_code is not null)) then
        raise exception 'TEST FAILED: U10 % history rows have a wrong action / actor / session / batch: %', p_label,
          (select jsonb_agg(jsonb_build_object('action', l.action, 'table', l.table_name, 'actor', l.actor_name,
                                               'session', l.session_id, 'batch', l.batch_id, 'op', l.op))
             from public.change_log l where l.id > p_mark);
      end if;
      if (select count(distinct l.batch_id) from public.change_log l where l.id > p_mark) <> 1 then
        raise exception 'TEST FAILED: U10 % used more than one batch id', p_label;
      end if;
      if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
        raise exception 'TEST FAILED: U10 % left tkd.action / tkd.batch_id set', p_label;
      end if;
    end;
    $b$;
  $f$;

  -- The current waiver must not be the placeholder (opening needs the
  -- school's waiver); on a database that has only the placeholder, a test
  -- waiver is saved through the app's function (rolled back like the rest).
  perform set_config('request.jwt.claims', v_c_a1, true);
  select v.is_placeholder into v_ph from public.bb_waiver_versions v where v.superseded_at is null;
  if v_ph then
    v_r := public.bb_save_waiver((select v.id from public.bb_waiver_versions v where v.superseded_at is null),
                                 'zz test waiver ' || v_tag);
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: save a test waiver answered %', v_r; end if;
  end if;
  select v.version_name into v_wv_name from public.bb_waiver_versions v where v.superseded_at is null;

  -- the U1 cycle: never opened
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U1', v_today + 30, v_today + 20), null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add the U1 cycle answered %', v_r; end if;
  v_cu := (v_r ->> 'id')::uuid;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- U1. Who may call what
  -- ===================================================================
  select r.sheet -> 'dans' -> 0 into v_d from public.bb_default_rubric r;
  v_rev := (v_d ->> 'rev')::integer;
  -- the five functions, three ways each: sensible / broken / unknown
  v_calls := array[
    format('public.bb_save_default_dan(1, %s, %L::jsonb)', v_rev, v_d),
    format('public.bb_undo_default_dan(1, %s)', v_rev),
    format('public.bb_save_cycle_dan(%L::uuid, 1, 1, %L::jsonb)', v_cu, (select y.requirements -> 'dans' -> 0 from public.bb_cycles y where y.id = v_cu)),
    format('public.bb_undo_cycle_dan(%L::uuid, 1, 1)', v_cu),
    format('public.bb_undo_first_open(%L::uuid, 1)', v_cu),
    'public.bb_save_default_dan(null, null, ''[]''::jsonb)',
    'public.bb_undo_default_dan(9, 0)',
    'public.bb_save_cycle_dan(null, null, null, null)',
    'public.bb_undo_cycle_dan(null, 0, null)',
    'public.bb_undo_first_open(null, null)',
    format('public.bb_save_default_dan(4, 999999, %L::jsonb)', v_d),
    'public.bb_undo_default_dan(3, 999999)',
    format('public.bb_save_cycle_dan(%L::uuid, 1, 1, %L::jsonb)', v_rand, v_d),
    format('public.bb_undo_cycle_dan(%L::uuid, 1, 1)', v_rand),
    format('public.bb_undo_first_open(%L::uuid, 1)', v_rand)];

  -- U1 (anon): no function, no table
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  foreach v_txt in array v_calls loop
    begin
      execute 'select ' || v_txt;
      raise exception 'TEST FAILED: U1 anon could call %', left(v_txt, 120);
    exception when insufficient_privilege then null;
    end;
  end loop;
  foreach v_txt in array array['bb_default_rubric', 'bb_rubric_undo'] loop
    begin
      execute format('select 1 from public.%I limit 1', v_txt);
      raise exception 'TEST FAILED: U1 anon could read %', v_txt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;

  -- U1: sessions without data access -> no_access from all five, every
  -- way of calling (before any input check and any lookup); nothing written
  execute v_snap_sql into v_snap;
  v_list   := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_d2, v_c_d3, v_c_a8];
  v_labels := array['A2',   'A3',   'A4',   'A5',   'A6',   'A7',   'D2',   'D3',   'A8'];
  for v_n in 1 .. cardinality(v_list) loop
    if v_labels[v_n] = 'A8' then
      update public.staff set active = false where id = v_admin;
    end if;
    set local role authenticated;
    perform set_config('request.jwt.claims', v_list[v_n], true);
    foreach v_txt in array v_calls loop
      execute 'select ' || v_txt into v_r;
      if v_r is distinct from '{"status": "no_access"}'::jsonb then
        raise exception 'TEST FAILED: U1 session % got % from %', v_labels[v_n], v_r, left(v_txt, 120);
      end if;
    end loop;
    reset role;
    if v_labels[v_n] = 'A8' then
      update public.staff set active = true where id = v_admin;
    end if;
  end loop;
  -- U1: the desk (D1) -> not_allowed from all five, every way; and a first
  -- opening by the desk -> not_allowed (v0.930)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_txt in array v_calls loop
    execute 'select ' || v_txt into v_r;
    if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
      raise exception 'TEST FAILED: U1 the desk got % from %', v_r, left(v_txt, 120);
    end if;
  end loop;
  v_r := public.bb_set_registration(v_cu, 1, true);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: U1 a first opening by the desk should be not_allowed, got %', v_r;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: U1 a refused call changed something'; end if;

  -- U1b. A1 and D1 read the granted columns of the default (= what
  -- postgres sees); every session without data access reads 0 rows; the
  -- never-granted columns and the whole undo table are refused; no direct
  -- write by anyone in the app
  select to_jsonb(x)::text into v_txt
    from (select r.id, r.sheet, r.version, r.updated_at, r.updated_by_name from public.bb_default_rubric r) as x;
  v_list   := array[v_c_a1, v_c_d1, v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7, v_c_d2, v_c_d3, v_c_a8];
  v_labels := array['A1',   'D1',   'A2',   'A3',   'A4',   'A5',   'A6',   'A7',   'D2',   'D3',   'A8'];
  for v_n in 1 .. cardinality(v_list) loop
    if v_labels[v_n] = 'A8' then update public.staff set active = false where id = v_admin; end if;
    set local role authenticated;
    perform set_config('request.jwt.claims', v_list[v_n], true);
    select count(*), max(to_jsonb(x)::text) into v_i, v_txt2
      from (select r.id, r.sheet, r.version, r.updated_at, r.updated_by_name from public.bb_default_rubric r) as x;
    reset role;
    if v_labels[v_n] = 'A8' then update public.staff set active = true where id = v_admin; end if;
    if v_labels[v_n] in ('A1', 'D1') and (v_i <> 1 or v_txt2 is distinct from v_txt) then
      raise exception 'TEST FAILED: U1b % must read the default as postgres sees it', v_labels[v_n];
    elsif v_labels[v_n] not in ('A1', 'D1') and v_i <> 0 then
      raise exception 'TEST FAILED: U1b session % read % rows of bb_default_rubric', v_labels[v_n], v_i;
    end if;
  end loop;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  foreach v_txt in array array['select singleton from public.bb_default_rubric', 'select created_by from public.bb_default_rubric',
                               'select updated_by from public.bb_default_rubric', 'select created_by_name from public.bb_default_rubric',
                               'select * from public.bb_default_rubric', 'select id from public.bb_rubric_undo',
                               'select previous from public.bb_rubric_undo',
                               'insert into public.bb_default_rubric (sheet, created_by_name, updated_by_name) values (''{}'', '''', '''')',
                               'update public.bb_default_rubric set version = version',
                               'delete from public.bb_default_rubric',
                               'truncate public.bb_default_rubric',
                               'insert into public.bb_rubric_undo (kind, previous, after_version) values (''default_dan'', ''{}'', 1)',
                               'update public.bb_rubric_undo set after_version = 1',
                               'delete from public.bb_rubric_undo',
                               'truncate public.bb_rubric_undo'] loop
    begin
      execute v_txt;
      raise exception 'TEST FAILED: U1b A1 could run: %', v_txt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- U1c. the family form's login: still exactly its two functions; no right
  -- at all on either new table; its rubric answer holds no rev, stamp or
  -- source (checked on a real answer in U8)
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('bb_registrar', p.oid, 'EXECUTE') is distinct from (p.proname in ('bb_public_cycle', 'bb_public_register'));
  if v_txt is not null then raise exception 'TEST FAILED: U1c bb_registrar execute rights wrong on: %', v_txt; end if;
  foreach v_txt in array array['bb_default_rubric', 'bb_rubric_undo'] loop
    foreach v_role in array array['bb_registrar', 'testing_registrar', 'star_registrar', 'anon', 'service_role', 'public'] loop
      if has_table_privilege(v_role, 'public.' || v_txt, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         or has_any_column_privilege(v_role, 'public.' || v_txt, 'SELECT, INSERT, UPDATE, REFERENCES') then
        raise exception 'TEST FAILED: U1c % has a right on %', v_role, v_txt;
      end if;
    end loop;
  end loop;

  -- ===================================================================
  -- U2. The validator (the same cases as supabase/tests/0024_rubric_cases.json)
  -- ===================================================================
  -- the default's four Dans are valid, and the whole document
  if exists (select 1 from public.bb_default_rubric r, jsonb_array_elements(r.sheet -> 'dans') with ordinality as d(e, o)
              where public.bb_rubric_dan_problems(d.e, d.o::integer) <> '[]'::jsonb)
     or not (select public.bb_rubric_is_valid(r.sheet) from public.bb_default_rubric r) then
    raise exception 'TEST FAILED: U2 the default rubric must be valid';
  end if;
  -- each case: start from Dan <dan> of the default, apply the changes, the
  -- problem codes must be exactly <expect>
  for v_case in
    select * from (values
      ('the default''s Dan 1 is valid', 1, '[]'::jsonb, '{}'::text[]),
      ('the default''s Dan 2 is valid', 2, '[]'::jsonb, '{}'::text[]),
      ('the default''s Dan 3 is valid', 3, '[]'::jsonb, '{}'::text[]),
      ('the default''s Dan 4 is valid', 4, '[]'::jsonb, '{}'::text[]),
      ('part name with U+202E bidi override', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"name"]'::jsonb, 'value', '"Phys\u202eical"'::jsonb)), array['part_name']::text[]),
      ('subject name with U+202E bidi override', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"name"]'::jsonb, 'value', '"Stret\u202eching"'::jsonb)), array['subject_name']::text[]),
      ('way name with U+202E bidi override', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",0,"name"]'::jsonb, 'value', '"Pull\u202e-up"'::jsonb)), array['way_name']::text[]),
      ('extra-points item name with U+202E bidi override', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"name"]'::jsonb, 'value', '"Extra \u202estripes"'::jsonb)), array['extra_item_name']::text[]),
      ('unit with U+202E bidi override', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '"inc\u202ehes"'::jsonb)), array['unit']::text[]),
      ('subject note with U+202E bidi override', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"1/2 mile \u202efor 12 and under"'::jsonb)), array['note']::text[]),
      ('make-up with U+202E bidi override', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', '"Made up at the \u202enext testing."'::jsonb)), array['makeup']::text[]),
      ('extra-points note with U+202E bidi override', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","note"]'::jsonb, 'value', '"To be \u202econfirmed"'::jsonb)), array['extra_note']::text[]),
      ('part name with U+200B zero-width space', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"name"]'::jsonb, 'value', '"Phys\u200bical"'::jsonb)), array['part_name']::text[]),
      ('subject name with U+200B zero-width space', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"name"]'::jsonb, 'value', '"Stret\u200bching"'::jsonb)), array['subject_name']::text[]),
      ('way name with U+200B zero-width space', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",0,"name"]'::jsonb, 'value', '"Pull\u200b-up"'::jsonb)), array['way_name']::text[]),
      ('extra-points item name with U+200B zero-width space', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"name"]'::jsonb, 'value', '"Extra \u200bstripes"'::jsonb)), array['extra_item_name']::text[]),
      ('unit with U+200B zero-width space', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '"inc\u200bhes"'::jsonb)), array['unit']::text[]),
      ('subject note with U+200B zero-width space', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"1/2 mile \u200bfor 12 and under"'::jsonb)), array['note']::text[]),
      ('make-up with U+200B zero-width space', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', '"Made up at the \u200bnext testing."'::jsonb)), array['makeup']::text[]),
      ('extra-points note with U+200B zero-width space', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","note"]'::jsonb, 'value', '"To be \u200bconfirmed"'::jsonb)), array['extra_note']::text[]),
      ('part name with \x07 bell', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"name"]'::jsonb, 'value', '"Phys\u0007ical"'::jsonb)), array['part_name']::text[]),
      ('subject name with \x07 bell', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"name"]'::jsonb, 'value', '"Stret\u0007ching"'::jsonb)), array['subject_name']::text[]),
      ('way name with \x07 bell', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",0,"name"]'::jsonb, 'value', '"Pull\u0007-up"'::jsonb)), array['way_name']::text[]),
      ('extra-points item name with \x07 bell', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"name"]'::jsonb, 'value', '"Extra \u0007stripes"'::jsonb)), array['extra_item_name']::text[]),
      ('unit with \x07 bell', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '"inc\u0007hes"'::jsonb)), array['unit']::text[]),
      ('subject note with \x07 bell', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"1/2 mile \u0007for 12 and under"'::jsonb)), array['note']::text[]),
      ('make-up with \x07 bell', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', '"Made up at the \u0007next testing."'::jsonb)), array['makeup']::text[]),
      ('extra-points note with \x07 bell', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","note"]'::jsonb, 'value', '"To be \u0007confirmed"'::jsonb)), array['extra_note']::text[]),
      ('part name with U+061C Arabic letter mark', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"name"]'::jsonb, 'value', '"Phys\u061cical"'::jsonb)), array['part_name']::text[]),
      ('subject name with U+061C Arabic letter mark', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"name"]'::jsonb, 'value', '"Stret\u061cching"'::jsonb)), array['subject_name']::text[]),
      ('way name with U+061C Arabic letter mark', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",0,"name"]'::jsonb, 'value', '"Pull\u061c-up"'::jsonb)), array['way_name']::text[]),
      ('extra-points item name with U+061C Arabic letter mark', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"name"]'::jsonb, 'value', '"Extra \u061cstripes"'::jsonb)), array['extra_item_name']::text[]),
      ('unit with U+061C Arabic letter mark', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '"inc\u061ches"'::jsonb)), array['unit']::text[]),
      ('subject note with U+061C Arabic letter mark', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"1/2 mile \u061cfor 12 and under"'::jsonb)), array['note']::text[]),
      ('make-up with U+061C Arabic letter mark', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', '"Made up at the \u061cnext testing."'::jsonb)), array['makeup']::text[]),
      ('extra-points note with U+061C Arabic letter mark', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","note"]'::jsonb, 'value', '"To be \u061cconfirmed"'::jsonb)), array['extra_note']::text[]),
      ('part name with U+2028 line separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"name"]'::jsonb, 'value', '"Phys\u2028ical"'::jsonb)), array['part_name']::text[]),
      ('subject name with U+2028 line separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"name"]'::jsonb, 'value', '"Stret\u2028ching"'::jsonb)), array['subject_name']::text[]),
      ('way name with U+2028 line separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",0,"name"]'::jsonb, 'value', '"Pull\u2028-up"'::jsonb)), array['way_name']::text[]),
      ('extra-points item name with U+2028 line separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"name"]'::jsonb, 'value', '"Extra \u2028stripes"'::jsonb)), array['extra_item_name']::text[]),
      ('unit with U+2028 line separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '"inc\u2028hes"'::jsonb)), array['unit']::text[]),
      ('subject note with U+2028 line separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"1/2 mile \u2028for 12 and under"'::jsonb)), array['note']::text[]),
      ('make-up with U+2028 line separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', '"Made up at the \u2028next testing."'::jsonb)), array['makeup']::text[]),
      ('extra-points note with U+2028 line separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","note"]'::jsonb, 'value', '"To be \u2028confirmed"'::jsonb)), array['extra_note']::text[]),
      ('part name with U+2029 paragraph separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"name"]'::jsonb, 'value', '"Phys\u2029ical"'::jsonb)), array['part_name']::text[]),
      ('subject name with U+2029 paragraph separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"name"]'::jsonb, 'value', '"Stret\u2029ching"'::jsonb)), array['subject_name']::text[]),
      ('way name with U+2029 paragraph separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",0,"name"]'::jsonb, 'value', '"Pull\u2029-up"'::jsonb)), array['way_name']::text[]),
      ('extra-points item name with U+2029 paragraph separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"name"]'::jsonb, 'value', '"Extra \u2029stripes"'::jsonb)), array['extra_item_name']::text[]),
      ('unit with U+2029 paragraph separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '"inc\u2029hes"'::jsonb)), array['unit']::text[]),
      ('subject note with U+2029 paragraph separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"1/2 mile \u2029for 12 and under"'::jsonb)), array['note']::text[]),
      ('make-up with U+2029 paragraph separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', '"Made up at the \u2029next testing."'::jsonb)), array['makeup']::text[]),
      ('extra-points note with U+2029 paragraph separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","note"]'::jsonb, 'value', '"To be \u2029confirmed"'::jsonb)), array['extra_note']::text[]),
      ('part name with U+00AD soft hyphen', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"name"]'::jsonb, 'value', '"Phys\u00adical"'::jsonb)), array['part_name']::text[]),
      ('subject name with U+00AD soft hyphen', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"name"]'::jsonb, 'value', '"Stret\u00adching"'::jsonb)), array['subject_name']::text[]),
      ('way name with U+00AD soft hyphen', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",0,"name"]'::jsonb, 'value', '"Pull\u00ad-up"'::jsonb)), array['way_name']::text[]),
      ('extra-points item name with U+00AD soft hyphen', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"name"]'::jsonb, 'value', '"Extra \u00adstripes"'::jsonb)), array['extra_item_name']::text[]),
      ('unit with U+00AD soft hyphen', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '"inc\u00adhes"'::jsonb)), array['unit']::text[]),
      ('subject note with U+00AD soft hyphen', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"1/2 mile \u00adfor 12 and under"'::jsonb)), array['note']::text[]),
      ('make-up with U+00AD soft hyphen', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', '"Made up at the \u00adnext testing."'::jsonb)), array['makeup']::text[]),
      ('extra-points note with U+00AD soft hyphen', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","note"]'::jsonb, 'value', '"To be \u00adconfirmed"'::jsonb)), array['extra_note']::text[]),
      ('part name with U+180E Mongolian vowel separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"name"]'::jsonb, 'value', '"Phys\u180eical"'::jsonb)), array['part_name']::text[]),
      ('subject name with U+180E Mongolian vowel separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"name"]'::jsonb, 'value', '"Stret\u180eching"'::jsonb)), array['subject_name']::text[]),
      ('way name with U+180E Mongolian vowel separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",0,"name"]'::jsonb, 'value', '"Pull\u180e-up"'::jsonb)), array['way_name']::text[]),
      ('extra-points item name with U+180E Mongolian vowel separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"name"]'::jsonb, 'value', '"Extra \u180estripes"'::jsonb)), array['extra_item_name']::text[]),
      ('unit with U+180E Mongolian vowel separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '"inc\u180ehes"'::jsonb)), array['unit']::text[]),
      ('subject note with U+180E Mongolian vowel separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"1/2 mile \u180efor 12 and under"'::jsonb)), array['note']::text[]),
      ('make-up with U+180E Mongolian vowel separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', '"Made up at the \u180enext testing."'::jsonb)), array['makeup']::text[]),
      ('extra-points note with U+180E Mongolian vowel separator', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","note"]'::jsonb, 'value', '"To be \u180econfirmed"'::jsonb)), array['extra_note']::text[]),
      ('part name with U+E0001 tag character', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"name"]'::jsonb, 'value', '"Phys\udb40\udc01ical"'::jsonb)), array['part_name']::text[]),
      ('subject name with U+E0001 tag character', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"name"]'::jsonb, 'value', '"Stret\udb40\udc01ching"'::jsonb)), array['subject_name']::text[]),
      ('way name with U+E0001 tag character', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",0,"name"]'::jsonb, 'value', '"Pull\udb40\udc01-up"'::jsonb)), array['way_name']::text[]),
      ('extra-points item name with U+E0001 tag character', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"name"]'::jsonb, 'value', '"Extra \udb40\udc01stripes"'::jsonb)), array['extra_item_name']::text[]),
      ('unit with U+E0001 tag character', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '"inc\udb40\udc01hes"'::jsonb)), array['unit']::text[]),
      ('subject note with U+E0001 tag character', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"1/2 mile \udb40\udc01for 12 and under"'::jsonb)), array['note']::text[]),
      ('make-up with U+E0001 tag character', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', '"Made up at the \udb40\udc01next testing."'::jsonb)), array['makeup']::text[]),
      ('extra-points note with U+E0001 tag character', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","note"]'::jsonb, 'value', '"To be \udb40\udc01confirmed"'::jsonb)), array['extra_note']::text[]),
      ('Dan: missing key "extra_points"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["extra_points"]'::jsonb)), array['shape']::text[]),
      ('Dan: wrong type (rev is text)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["rev"]'::jsonb, 'value', '"1"'::jsonb)), array['shape']::text[]),
      ('Dan: an unknown key', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["colour"]'::jsonb, 'value', '"blue"'::jsonb)), array['shape']::text[]),
      ('Pass: missing key "no_d"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["pass","no_d"]'::jsonb)), array['shape']::text[]),
      ('Pass: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass"]'::jsonb, 'value', '[]'::jsonb)), array['shape']::text[]),
      ('Pass bracket: missing key "pass_mark"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["pass","brackets",0,"pass_mark"]'::jsonb)), array['shape']::text[]),
      ('Pass bracket: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","brackets",0]'::jsonb, 'value', '5'::jsonb)), array['shape']::text[]),
      ('Part: missing key "grade_points"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["parts",1,"grade_points"]'::jsonb)), array['shape']::text[]),
      ('Part: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",1]'::jsonb, 'value', '"technical"'::jsonb)), array['shape']::text[]),
      ('Part: parts in the wrong order', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",1,"code"]'::jsonb, 'value', '"other"'::jsonb)), array['shape']::text[]),
      ('Subject: missing key "note"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["parts",0,"subjects",0,"note"]'::jsonb)), array['shape']::text[]),
      ('Subject: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0]'::jsonb, 'value', '3'::jsonb)), array['shape']::text[]),
      ('Subject: an unknown key', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"colour"]'::jsonb, 'value', '"red"'::jsonb)), array['shape']::text[]),
      ('Way: missing key "unit"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb)), array['shape']::text[]),
      ('Way: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0]'::jsonb, 'value', '"x"'::jsonb)), array['shape']::text[]),
      ('Way bracket: missing key "cutoffs"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",0,"cutoffs"]'::jsonb)), array['shape']::text[]),
      ('Way bracket: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",0]'::jsonb, 'value', 'null'::jsonb)), array['shape']::text[]),
      ('Cut-offs: missing key "C"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",0,"cutoffs","C"]'::jsonb)), array['cutoffs_range']::text[]),
      ('Cut-offs: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",0,"cutoffs"]'::jsonb, 'value', '[]'::jsonb)), array['shape']::text[]),
      ('Extra: missing key "limit"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["extra_points","limit"]'::jsonb)), array['shape']::text[]),
      ('Extra: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points"]'::jsonb, 'value', '1'::jsonb)), array['shape']::text[]),
      ('Item: missing key "rule"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["extra_points","items",0,"rule"]'::jsonb)), array['shape']::text[]),
      ('Item: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0]'::jsonb, 'value', '"x"'::jsonb)), array['shape']::text[]),
      ('Rule: missing key "points_each"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["extra_points","items",0,"rule","points_each"]'::jsonb)), array['extra_rule']::text[]),
      ('Rule: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"rule"]'::jsonb, 'value', '1'::jsonb)), array['extra_rule']::text[]),
      ('Step: missing key "points"', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["extra_points","items",1,"rule","steps",0,"points"]'::jsonb)), array['shape']::text[]),
      ('Step: wrong type', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",1,"rule","steps",0]'::jsonb, 'value', '7'::jsonb)), array['shape']::text[]),
      ('a middle bracket with "to" empty', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",1,"to"]'::jsonb, 'value', 'null'::jsonb)), array['brackets_overlap']::text[]),
      ('JSON null where a number belongs (credits)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"credits"]'::jsonb, 'value', 'null'::jsonb)), array['credits']::text[]),
      ('JSON null where a number belongs (a cut-off)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",0,"cutoffs","A"]'::jsonb, 'value', 'null'::jsonb)), array['cutoffs_range']::text[]),
      ('rev 1 000 001', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["rev"]'::jsonb, 'value', '1000001'::jsonb)), array['shape']::text[]),
      ('rev 0', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["rev"]'::jsonb, 'value', '0'::jsonb)), array['shape']::text[]),
      ('credits 1e30', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"credits"]'::jsonb, 'value', '1e+30'::jsonb)), array['credits']::text[]),
      ('a cut-off of 1e30', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",0,"cutoffs","A+"]'::jsonb, 'value', '1e+30'::jsonb)), array['cutoffs_range']::text[]),
      ('decimals: 3 credits x grade point 3.35 = 10.05 (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",1,"grade_points","A"]'::jsonb, 'value', '3.35'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",0,"points","A"]'::jsonb, 'value', '6.7'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",1,"points","A"]'::jsonb, 'value', '10.05'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",2,"points","A"]'::jsonb, 'value', '6.7'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",3,"points","A"]'::jsonb, 'value', '6.7'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",4,"points","A"]'::jsonb, 'value', '6.7'::jsonb)), '{}'::text[]),
      ('decimals: 3 credits x 3.35 written as 10.04', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",1,"grade_points","A"]'::jsonb, 'value', '3.35'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",0,"points","A"]'::jsonb, 'value', '6.7'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",1,"points","A"]'::jsonb, 'value', '10.04'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",2,"points","A"]'::jsonb, 'value', '6.7'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",3,"points","A"]'::jsonb, 'value', '6.7'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",4,"points","A"]'::jsonb, 'value', '6.7'::jsonb)), array['points_not_worked_out']::text[]),
      ('decimals: 7 credits x grade point 2.15 = 15.05 (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",3,"grade_points","B"]'::jsonb, 'value', '2.15'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",3,"grade_points","B-"]'::jsonb, 'value', '2.1'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",3,"subjects",3,"credits"]'::jsonb, 'value', '7'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",3,"subjects",3,"points"]'::jsonb, 'value', '{"A+":28,"A":24.5,"A-":22.75,"B+":21,"B":15.05,"B-":14.7,"C":14,"C-":7,"D":0}'::jsonb)), '{}'::text[]),
      ('decimals: steps of 0.05 (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",1,"rule","steps"]'::jsonb, 'value', '[{"at_least":1,"points":0.05},{"at_least":2,"points":0.1},{"at_least":3,"points":0.15}]'::jsonb)), '{}'::text[]),
      ('decimals: a cut-off of 2.555', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",1,"cutoffs","B"]'::jsonb, 'value', '2.555'::jsonb)), array['cutoffs_range']::text[]),
      ('decimals: a pass mark of 274.99 (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","brackets",0,"pass_mark"]'::jsonb, 'value', '274.99'::jsonb)), '{}'::text[]),
      ('too big: a Dan far over 50 000 bytes', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', to_jsonb(repeat('x', 130000)))), array['too_big']::text[]),
      ('dan_number: Dan 2 sent as Dan 1', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["dan"]'::jsonb, 'value', '2'::jsonb)), array['dan_number']::text[]),
      ('part_name: empty', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"name"]'::jsonb, 'value', '""'::jsonb)), array['part_name']::text[]),
      ('part_name_duplicate', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",1,"name"]'::jsonb, 'value', '"physical"'::jsonb)), array['part_name_duplicate']::text[]),
      ('grade_points_range: 1000', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"grade_points","A"]'::jsonb, 'value', '1000'::jsonb)), array['grade_points_range']::text[]),
      ('grade_points_range: a missing letter', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["parts",0,"grade_points","D"]'::jsonb)), array['grade_points_range']::text[]),
      ('grade_points_order: a grade point going up', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"grade_points","B"]'::jsonb, 'value', '3.6'::jsonb)), array['grade_points_order', 'points_not_worked_out']::text[]),
      ('grade_points_order: A+ is 0', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",3,"grade_points"]'::jsonb, 'value', '{"A+":0,"A":0,"A-":0,"B+":0,"B":0,"B-":0,"C":0,"C-":0,"D":0}'::jsonb)), array['grade_points_order', 'points_not_worked_out']::text[]),
      ('subject_count: no subjects', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects"]'::jsonb, 'value', '[]'::jsonb)), array['subject_count']::text[]),
      ('subject_count: 31 subjects', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects"]'::jsonb, 'value', '[{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}]'::jsonb)), array['subject_count']::text[]),
      ('subject_id: capitals', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"id"]'::jsonb, 'value', '"ABCDEFGH"'::jsonb)), array['subject_id']::text[]),
      ('subject_id: used twice in the Dan', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",0,"id"]'::jsonb, 'value', '"samesame"'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",0,"id"]'::jsonb, 'value', '"samesame"'::jsonb)), array['subject_id']::text[]),
      ('subject_name: 61 characters', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"name"]'::jsonb, 'value', '"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"'::jsonb)), array['subject_name']::text[]),
      ('subject_name: not tidied (two spaces)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",4,"name"]'::jsonb, 'value', '"Long  jump"'::jsonb)), array['subject_name']::text[]),
      ('subject_name_duplicate', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",1,"name"]'::jsonb, 'value', '"stretching"'::jsonb)), array['subject_name_duplicate']::text[]),
      ('credits: 2.5', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"credits"]'::jsonb, 'value', '2.5'::jsonb)), array['credits']::text[]),
      ('credits: 21', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"credits"]'::jsonb, 'value', '21'::jsonb)), array['credits']::text[]),
      ('points_range: below 0', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",3,"subjects",0,"points","D"]'::jsonb, 'value', '-1'::jsonb)), array['points_range']::text[]),
      ('points_range: a missing letter', 1, jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["parts",3,"subjects",0,"points","C-"]'::jsonb)), array['points_range']::text[]),
      ('points_order: own points going up', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",3,"subjects",0,"points","B"]'::jsonb, 'value', '18'::jsonb)), array['points_order']::text[]),
      ('points_not_worked_out: credits x grade points differ', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",4,"points","A"]'::jsonb, 'value', '6'::jsonb)), array['points_not_worked_out']::text[]),
      ('ways_count: a graded subject with a way', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",0,"ways"]'::jsonb, 'value', '[{"name":null,"unit":"count","direction":"at_least","brackets":[]}]'::jsonb)), array['ways_count']::text[]),
      ('ways_count: three ways', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",2]'::jsonb, 'value', '{"name":"Third","unit":"reps","direction":"at_least","brackets":[{"from":null,"to":null,"cutoffs":{"A+":5,"A":4,"B+":3,"B":2,"C":1}}]}'::jsonb)), array['ways_count']::text[]),
      ('ways_count: a measured subject with no way', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways"]'::jsonb, 'value', '[]'::jsonb)), array['ways_count']::text[]),
      ('way_name: two unnamed ways', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",0,"name"]'::jsonb, 'value', 'null'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",1,"name"]'::jsonb, 'value', 'null'::jsonb)), array['way_name']::text[]),
      ('way_name: the same name twice', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"ways",1,"name"]'::jsonb, 'value', '"pull-up"'::jsonb)), array['way_name']::text[]),
      ('way_name: one way with a name (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"name"]'::jsonb, 'value', '"Sit and reach"'::jsonb)), '{}'::text[]),
      ('unit: empty', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '""'::jsonb)), array['unit']::text[]),
      ('unit: 41 characters', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"unit"]'::jsonb, 'value', '"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"'::jsonb)), array['unit']::text[]),
      ('direction: unknown', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"direction"]'::jsonb, 'value', '"over"'::jsonb)), array['direction']::text[]),
      ('brackets_count: none', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets"]'::jsonb, 'value', '[]'::jsonb)), array['brackets_count']::text[]),
      ('brackets_count: 7', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets"]'::jsonb, 'value', '[{"from":null,"to":9,"cutoffs":{"A+":5,"A":4,"B+":3,"B":2,"C":1}},{"from":10,"to":19,"cutoffs":{"A+":5,"A":4,"B+":3,"B":2,"C":1}},{"from":20,"to":29,"cutoffs":{"A+":5,"A":4,"B+":3,"B":2,"C":1}},{"from":30,"to":39,"cutoffs":{"A+":5,"A":4,"B+":3,"B":2,"C":1}},{"from":40,"to":49,"cutoffs":{"A+":5,"A":4,"B+":3,"B":2,"C":1}},{"from":50,"to":59,"cutoffs":{"A+":5,"A":4,"B+":3,"B":2,"C":1}},{"from":60,"to":null,"cutoffs":{"A+":5,"A":4,"B+":3,"B":2,"C":1}}]'::jsonb)), array['brackets_count']::text[]),
      ('bracket_ages: 100', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",1,"to"]'::jsonb, 'value', '100'::jsonb)), array['bracket_ages']::text[]),
      ('bracket_ages: from after to', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",1,"from"]'::jsonb, 'value', '13'::jsonb)), array['bracket_ages']::text[]),
      ('brackets_order: a second "youngest" bracket', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",1,"from"]'::jsonb, 'value', 'null'::jsonb)), array['brackets_order']::text[]),
      ('brackets_gap', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",1,"from"]'::jsonb, 'value', '10'::jsonb)), array['brackets_gap']::text[]),
      ('brackets_overlap', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",1,"from"]'::jsonb, 'value', '8'::jsonb)), array['brackets_overlap']::text[]),
      ('brackets_ends: a closed last bracket', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",2,"to"]'::jsonb, 'value', '99'::jsonb)), array['brackets_ends']::text[]),
      ('brackets_ends: the first does not start at the youngest (pass)', 2, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","brackets",0,"from"]'::jsonb, 'value', '5'::jsonb)), array['brackets_ends']::text[]),
      ('cutoffs_range: 1000', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",0,"cutoffs","A+"]'::jsonb, 'value', '1000'::jsonb)), array['cutoffs_range']::text[]),
      ('cutoffs_order: an at-least cut-off going up', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",0,"cutoffs","B"]'::jsonb, 'value', '3.5'::jsonb)), array['cutoffs_order']::text[]),
      ('cutoffs_order: an equal at-least cut-off', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"ways",0,"brackets",0,"cutoffs","B"]'::jsonb, 'value', '3'::jsonb)), array['cutoffs_order']::text[]),
      ('cutoffs_order: an at-most cut-off going down', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",5,"ways",0,"brackets",0,"cutoffs","B"]'::jsonb, 'value', '12.5'::jsonb)), array['cutoffs_order']::text[]),
      ('limited_to: a bracket that does not exist', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",3,"limited_to"]'::jsonb, 'value', '[{"from":21,"to":null}]'::jsonb)), array['limited_to']::text[]),
      ('limited_to: the same bracket twice', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",3,"limited_to"]'::jsonb, 'value', '[{"from":18,"to":null},{"from":18,"to":null}]'::jsonb)), array['limited_to']::text[]),
      ('limited_to: empty list', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",3,"limited_to"]'::jsonb, 'value', '[]'::jsonb)), array['limited_to']::text[]),
      ('limited_to: everyone (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",3,"limited_to"]'::jsonb, 'value', 'null'::jsonb), jsonb_build_object('op', 'set', 'path', '["pass","brackets",0,"pass_mark"]'::jsonb, 'value', '275'::jsonb)), '{}'::text[]),
      ('note: 201 characters', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"'::jsonb)), array['note']::text[]),
      ('note: a line break', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '"one\ntwo"'::jsonb)), array['note']::text[]),
      ('note: empty text (must be null)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"note"]'::jsonb, 'value', '""'::jsonb)), array['note']::text[]),
      ('pass_mark_range: 0', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","brackets",0,"pass_mark"]'::jsonb, 'value', '0'::jsonb)), array['pass_mark_range']::text[]),
      ('pass_mark_range: 10000', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","brackets",0,"pass_mark"]'::jsonb, 'value', '10000'::jsonb)), array['pass_mark_range']::text[]),
      ('pass_mark_too_high: above the most points (339)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","brackets",0,"pass_mark"]'::jsonb, 'value', '339.01'::jsonb)), array['pass_mark_too_high']::text[]),
      ('pass_mark: equal to the most points (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","brackets",0,"pass_mark"]'::jsonb, 'value', '339'::jsonb)), '{}'::text[]),
      ('makeup: empty text (must be null)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', '""'::jsonb)), array['makeup']::text[]),
      ('makeup: 301 characters', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', to_jsonb(repeat('x', 301)))), array['makeup']::text[]),
      ('makeup: null (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","makeup"]'::jsonb, 'value', 'null'::jsonb)), '{}'::text[]),
      ('pass no_d: not yes/no', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["pass","no_d"]'::jsonb, 'value', '"yes"'::jsonb)), array['shape']::text[]),
      ('bracket_empty: a pass bracket that does no subject', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",1,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",2,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",3,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",4,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",5,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",6,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",7,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",8,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",0,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",1,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",2,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",3,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",4,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",0,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",1,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",2,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",3,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",4,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",5,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",2,"subjects",6,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",3,"subjects",0,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",3,"subjects",1,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",3,"subjects",2,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",3,"subjects",3,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb), jsonb_build_object('op', 'set', 'path', '["parts",3,"subjects",4,"limited_to"]'::jsonb, 'value', '[{"from":null,"to":17}]'::jsonb)), array['bracket_empty']::text[]),
      ('extra_limit: 0', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","limit"]'::jsonb, 'value', '0'::jsonb)), array['extra_limit']::text[]),
      ('extra_limit: 25 (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","limit"]'::jsonb, 'value', '25'::jsonb)), '{}'::text[]),
      ('extra_note: empty text (must be null)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","note"]'::jsonb, 'value', '""'::jsonb)), array['extra_note']::text[]),
      ('extra_item_count: 13 items', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items"]'::jsonb, 'value', '[{},{},{},{},{},{},{},{},{},{},{},{},{}]'::jsonb)), array['extra_item_count']::text[]),
      ('extra_items: none (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items"]'::jsonb, 'value', '[]'::jsonb)), '{}'::text[]),
      ('extra_item_name: empty', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"name"]'::jsonb, 'value', '""'::jsonb)), array['extra_item_name']::text[]),
      ('extra_item_name_duplicate', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",1,"name"]'::jsonb, 'value', '"extra stripes"'::jsonb)), array['extra_item_name_duplicate']::text[]),
      ('extra_rule: an unknown kind', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"rule","kind"]'::jsonb, 'value', '"bonus"'::jsonb)), array['extra_rule']::text[]),
      ('extra_points_each: 0', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",0,"rule","points_each"]'::jsonb, 'value', '0'::jsonb)), array['extra_points_each']::text[]),
      ('extra_steps_count: none', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",1,"rule","steps"]'::jsonb, 'value', '[]'::jsonb)), array['extra_steps_count']::text[]),
      ('extra_steps_count: 11', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",1,"rule","steps"]'::jsonb, 'value', '[{"at_least":1,"points":1},{"at_least":2,"points":2},{"at_least":3,"points":3},{"at_least":4,"points":4},{"at_least":5,"points":5},{"at_least":6,"points":6},{"at_least":7,"points":7},{"at_least":8,"points":8},{"at_least":9,"points":9},{"at_least":10,"points":10},{"at_least":11,"points":11}]'::jsonb)), array['extra_steps_count']::text[]),
      ('extra_steps_order: points going down', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",2,"rule","steps",1,"points"]'::jsonb, 'value', '2'::jsonb)), array['extra_steps_order']::text[]),
      ('extra_steps_order: the same count twice', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",2,"rule","steps",1,"at_least"]'::jsonb, 'value', '1'::jsonb)), array['extra_steps_order']::text[]),
      ('extra_step_range: at least 0', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",2,"rule","steps",0,"at_least"]'::jsonb, 'value', '0'::jsonb)), array['extra_step_range']::text[]),
      ('extra_step_range: points 0', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra_points","items",2,"rule","steps",0,"points"]'::jsonb, 'value', '0'::jsonb)), array['extra_step_range']::text[]),
      ('stamps: saved_at not in the right format', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["saved_at"]'::jsonb, 'value', '"2026-10-21 18:04"'::jsonb)), array['shape']::text[]),
      ('stamps: saved_at in the right format (valid)', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["saved_at"]'::jsonb, 'value', '"2026-10-21T18:04:05Z"'::jsonb), jsonb_build_object('op', 'set', 'path', '["saved_by_name"]'::jsonb, 'value', '"Main Admin"'::jsonb)), '{}'::text[]),
      ('stamps: saved_by_name of 61 characters', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["saved_by_name"]'::jsonb, 'value', '"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"'::jsonb)), array['shape']::text[]),
      ('scoring: unknown kind', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",0,"scoring"]'::jsonb, 'value', '"scored"'::jsonb)), array['shape']::text[]),
      ('points_mode: unknown', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",1,"subjects",0,"points_mode"]'::jsonb, 'value', '"auto"'::jsonb)), array['shape']::text[]),
      ('outdoor: not yes/no', 1, jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["parts",0,"subjects",0,"outdoor"]'::jsonb, 'value', '1'::jsonb)), array['shape']::text[])
    ) as t(name, dan, ops, expect)
  loop
    select pg_temp.bbr_apply(r.sheet -> 'dans' -> (v_case.dan - 1), v_case.ops) into v_d from public.bb_default_rubric r;
    v_codes := pg_temp.bbr_codes(public.bb_rubric_dan_problems(v_d, v_case.dan));
    if v_codes is distinct from v_case.expect then
      raise exception 'TEST FAILED: U2 case "%": problems % (expected %)', v_case.name, v_codes, v_case.expect;
    end if;
  end loop;
  -- whole-document cases: the changes apply to the whole default rubric
  for v_case in
    select * from (values
      ('source with U+202E bidi override', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '"Fall 2026 \u202e(old Sheet)"'::jsonb)), false),
      ('source with U+200B zero-width space', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '"Fall 2026 \u200b(old Sheet)"'::jsonb)), false),
      ('source with \x07 bell', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '"Fall 2026 \u0007(old Sheet)"'::jsonb)), false),
      ('source with U+061C Arabic letter mark', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '"Fall 2026 \u061c(old Sheet)"'::jsonb)), false),
      ('source with U+2028 line separator', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '"Fall 2026 \u2028(old Sheet)"'::jsonb)), false),
      ('source with U+2029 paragraph separator', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '"Fall 2026 \u2029(old Sheet)"'::jsonb)), false),
      ('source with U+00AD soft hyphen', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '"Fall 2026 \u00ad(old Sheet)"'::jsonb)), false),
      ('source with U+180E Mongolian vowel separator', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '"Fall 2026 \u180e(old Sheet)"'::jsonb)), false),
      ('source with U+E0001 tag character', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '"Fall 2026 \udb40\udc01(old Sheet)"'::jsonb)), false),
      ('Rubric: missing key "dans"', jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["dans"]'::jsonb)), false),
      ('Rubric: wrong type (source is a number)', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '5'::jsonb)), false),
      ('Rubric: a Dan of the wrong type', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["dans",0]'::jsonb, 'value', '"x"'::jsonb)), false),
      ('Rubric: schema_version 1', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["schema_version"]'::jsonb, 'value', '1'::jsonb)), false),
      ('Rubric: only 3 Dans', jsonb_build_array(jsonb_build_object('op', 'remove', 'path', '["dans",3]'::jsonb)), false),
      ('Rubric: an unknown key', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["extra"]'::jsonb, 'value', 'true'::jsonb)), false),
      ('Rubric: source of 101 characters', jsonb_build_array(jsonb_build_object('op', 'set', 'path', '["source"]'::jsonb, 'value', '"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"'::jsonb)), false),
      ('Rubric: the default is valid', '[]'::jsonb, true)
    ) as t(name, ops, valid)
  loop
    select pg_temp.bbr_apply(r.sheet, v_case.ops) into v_doc from public.bb_default_rubric r;
    if public.bb_rubric_is_valid(v_doc) is distinct from v_case.valid then
      raise exception 'TEST FAILED: U2 document case "%": valid = % (expected %)', v_case.name, not v_case.valid, v_case.valid;
    end if;
  end loop;
  -- never NULL, never an error on odd input
  if public.bb_rubric_is_valid(null) is distinct from false or public.bb_rubric_is_valid('[]') is distinct from false
     or public.bb_rubric_is_valid('"x"') is distinct from false
     or public.bb_rubric_dan_problems(null, 1) is null or public.bb_rubric_dan_problems('5', 1) = '[]'::jsonb then
    raise exception 'TEST FAILED: U2 odd input must give false / a problem';
  end if;

  -- ===================================================================
  -- U3. No number changed from version 1 to version 2 (contract 4.3)
  -- ===================================================================
  -- (a) the default AS SEEDED (from the history, so later saves by admins
  --     don't matter) and (b) the converter's answer for the starting point,
  --     each against the starting point's version 1 sheet: both "except"
  --     directions empty
  select l.after -> 'sheet' into v_doc
    from public.change_log l
   where l.table_name = 'bb_default_rubric' and l.op = 'insert' and l.action = 'bb_seed'
   order by l.id limit 1;
  if v_doc is null then raise exception 'TEST FAILED: U3 the seed of bb_default_rubric is not in the history'; end if;
  select sp.requirements into v_r from public.bb_starting_point sp;
  if v_doc is distinct from public.bb_rubric_from_v1(v_r) then
    raise exception 'TEST FAILED: U3 the seeded default is not the conversion of the starting point';
  end if;
  foreach v_txt in array array['seeded default', 'converted starting point'] loop
    v_d := case when v_txt = 'seeded default' then v_doc else public.bb_rubric_from_v1(v_r) end;
    select string_agg(x, ' ; ') into v_txt2
      from ((select pg_temp.bbr_flat_v1(v_r) except select pg_temp.bbr_flat_v2(v_d))
            union all
            (select pg_temp.bbr_flat_v2(v_d) except select pg_temp.bbr_flat_v1(v_r))) as q(x);
    if v_txt2 is not null then
      raise exception 'TEST FAILED: U3 % differs from the version 1 sheet: %', v_txt, left(v_txt2, 800);
    end if;
  end loop;
  -- spot checks, typed in from supabase/tests/0016_seed_review.txt (the
  -- CP1-approved list; never read back from the converter or the seed):
  v_d := v_doc;
  -- the 19 own-points subjects (v0.924): Dans 1-3 Egg test, Meditation,
  -- Assistant instructor course, TKD project; Dan 4 Free sparring, Target
  -- kick (30 sec), Korean terminology, TKD knowledge, Egg test, Meditation,
  -- Appreciation letter
  select string_agg(dn || ':' || nm, ',' order by dn, nm collate "C") into v_txt
    from (select (d.e ->> 'dan')::int as dn, s.e ->> 'name' as nm
            from jsonb_array_elements(v_d -> 'dans') d(e), jsonb_array_elements(d.e -> 'parts') p(e), jsonb_array_elements(p.e -> 'subjects') s(e)
           where s.e ->> 'points_mode' = 'own') as x;
  if v_txt is distinct from '1:Assistant instructor course,1:Egg test,1:Meditation,1:TKD project,'
                            '2:Assistant instructor course,2:Egg test,2:Meditation,2:TKD project,'
                            '3:Assistant instructor course,3:Egg test,3:Meditation,3:TKD project,'
                            '4:Appreciation letter,4:Egg test,4:Free sparring,4:Korean terminology,4:Meditation,4:TKD knowledge,4:Target kick (30 sec)' then
    raise exception 'TEST FAILED: U3 the own-points subjects are not the 19 of v0.924: %', v_txt;
  end if;
  -- seed review line 439: Dan 4 Target kick (30 sec) points A+ 16 / A 14 / B+ 12 / B 9 / C 8 / D 0
  if (select s.e -> 'points' from jsonb_array_elements(v_d -> 'dans' -> 3 -> 'parts') p(e), jsonb_array_elements(p.e -> 'subjects') s(e)
       where s.e ->> 'name' = 'Target kick (30 sec)') is distinct from '{"A+": 16, "A": 14, "B+": 12, "B": 9, "C": 8, "D": 0}'::jsonb then
    raise exception 'TEST FAILED: U3 Dan 4 Target kick must keep B = 9 (seed review line 439)';
  end if;
  -- seed review line 139: Dan 1 Egg test points ... B 11 ...
  if (select s.e -> 'points' ->> 'B' from jsonb_array_elements(v_d -> 'dans' -> 0 -> 'parts') p(e), jsonb_array_elements(p.e -> 'subjects') s(e)
       where s.e ->> 'name' = 'Egg test') is distinct from '11' then
    raise exception 'TEST FAILED: U3 Dan 1 Egg test must keep B = 11 (seed review line 139)';
  end if;
  -- seed review lines 51, 157, 265, 373: to pass 275 / 293 (adults), 261, 293, 453
  if v_d -> 'dans' -> 0 -> 'pass' -> 'brackets' is distinct from
       '[{"from": null, "to": 17, "pass_mark": 275}, {"from": 18, "to": null, "pass_mark": 293}]'::jsonb
     or v_d -> 'dans' -> 1 -> 'pass' -> 'brackets' is distinct from '[{"from": null, "to": null, "pass_mark": 261}]'::jsonb
     or v_d -> 'dans' -> 2 -> 'pass' -> 'brackets' is distinct from '[{"from": null, "to": null, "pass_mark": 293}]'::jsonb
     or v_d -> 'dans' -> 3 -> 'pass' -> 'brackets' is distinct from '[{"from": null, "to": null, "pass_mark": 453}]'::jsonb then
    raise exception 'TEST FAILED: U3 the pass marks are not the CP1 ones (seed review lines 51, 157, 265, 373)';
  end if;
  -- seed review line 129: One Step Sparring (1-24) adults only -> 18 and over
  if (select s.e -> 'limited_to' from jsonb_array_elements(v_d -> 'dans' -> 0 -> 'parts') p(e), jsonb_array_elements(p.e -> 'subjects') s(e)
       where s.e ->> 'name' = 'One Step Sparring (1-24)') is distinct from '[{"from": 18, "to": null}]'::jsonb then
    raise exception 'TEST FAILED: U3 One Step Sparring must be limited to 18 and over (seed review line 129)';
  end if;
  -- seed review lines 89-94: Pull-up or hold = Pull-up (reps; 12 and under
  -- A+ 6 A 5 B+ 3 B 2 C 1; 13 and over A+ 10 A 8 B+ 6 B 4 C 2) and Hold
  -- (seconds; all ages A+ 31 A 26 B+ 21 B 11 C 9), at least
  if (select s.e -> 'ways' from jsonb_array_elements(v_d -> 'dans' -> 0 -> 'parts') p(e), jsonb_array_elements(p.e -> 'subjects') s(e)
       where s.e ->> 'name' = 'Pull-up or hold') is distinct from
     '[{"name": "Pull-up", "unit": "reps", "direction": "at_least", "brackets": [
        {"from": null, "to": 12, "cutoffs": {"A+": 6, "A": 5, "B+": 3, "B": 2, "C": 1}},
        {"from": 13, "to": null, "cutoffs": {"A+": 10, "A": 8, "B+": 6, "B": 4, "C": 2}}]},
       {"name": "Hold", "unit": "seconds", "direction": "at_least", "brackets": [
        {"from": null, "to": null, "cutoffs": {"A+": 31, "A": 26, "B+": 21, "B": 11, "C": 9}}]}]'::jsonb then
    raise exception 'TEST FAILED: U3 Pull-up or hold must be the two ways with the CP1 numbers (seed review lines 89-94)';
  end if;
  -- seed review lines 47-49: the grade scales (Other = a copy of Technical, as drawn in R1)
  if exists (select 1 from jsonb_array_elements(v_d -> 'dans') d(e)
              where d.e -> 'parts' -> 0 -> 'grade_points' is distinct from '{"A+": 4, "A": 3.5, "B+": 3, "B": 2.5, "C": 2, "D": 0}'::jsonb
                 or d.e -> 'parts' -> 1 -> 'grade_points' is distinct from '{"A+": 4, "A": 3.5, "A-": 3.25, "B+": 3, "B": 2.5, "B-": 2.25, "C": 2, "C-": 1, "D": 0}'::jsonb
                 or d.e -> 'parts' -> 2 -> 'grade_points' is distinct from '{"A+": 4.5, "A": 4, "A-": 3.8, "B+": 3.5, "B": 3.3, "B-": 3, "C": 2.5, "C-": 2, "D": 0}'::jsonb
                 or d.e -> 'parts' -> 3 -> 'grade_points' is distinct from '{"A+": 4, "A": 3.5, "A-": 3.25, "B+": 3, "B": 2.5, "B-": 2.25, "C": 2, "C-": 1, "D": 0}'::jsonb) then
    raise exception 'TEST FAILED: U3 every Dan''s grade points must be the CP1 grade scales (seed review lines 47-49)';
  end if;
  -- most points: the "up to" lines added up - Dan 1 80 + 44 + 135 + 80 = 339
  -- (157.5 for adults: 361.5; lines 52, 108, 122, 137), Dan 2 343.5 (158,
  -- 214, 228, 245), Dan 3 384 (266, 322, 336, 353), Dan 4 595 (374, 430,
  -- 446, 465); Curriculum 1st Dan 135 / 157.5
  if public.bb_rubric_most_points(v_d -> 'dans' -> 0, null, 17) <> 339
     or public.bb_rubric_most_points(v_d -> 'dans' -> 0, 18, null) <> 361.5
     or public.bb_rubric_most_points(v_d -> 'dans' -> 1, null, null) <> 343.5
     or public.bb_rubric_most_points(v_d -> 'dans' -> 2, null, null) <> 384
     or public.bb_rubric_most_points(v_d -> 'dans' -> 3, null, null) <> 595
     or public.bb_rubric_part_max(v_d -> 'dans' -> 0 -> 'parts' -> 2, null, 17) <> 135
     or public.bb_rubric_part_max(v_d -> 'dans' -> 0 -> 'parts' -> 2, 18, null) <> 157.5 then
    raise exception 'TEST FAILED: U3 most points must be 339 / 361.5 / 343.5 / 384 / 595 and Curriculum 135 / 157.5';
  end if;
  -- the starting point itself stays version 1, untouched
  if v_r -> 'schema_version' <> '1'::jsonb or not public.bb_requirements_is_valid(v_r) then
    raise exception 'TEST FAILED: U3 the starting point must stay version 1';
  end if;

  -- ===================================================================
  -- U4. Save / Undo of a Dan of the default rubric
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.sheet into v_doc from public.bb_default_rubric r;
  v_d := v_doc -> 'dans' -> 0;
  v_rev := (v_d ->> 'rev')::integer;
  -- (U10) a save as the app does it: one row on the default + one undo
  -- slot, one batch, by the admin
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_dx := jsonb_set(v_d, '{parts,0,subjects,4,name}', to_jsonb('Long jump ' || right(v_tag, 8)));
  set local role authenticated;
  v_r := public.bb_save_default_dan(1, v_rev, v_dx);
  reset role;
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'rev')::integer <> v_rev + 1 or not (v_r ->> 'changed')::boolean
     or not (v_r ->> 'undo_available')::boolean or (v_r ->> 'previous_rev')::integer <> v_rev
     or v_r ->> 'saved_by_name' is distinct from left(public.testing_normalize_name(v_name0), 60)
     or v_r ->> 'saved_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' then
    raise exception 'TEST FAILED: U4 a save of Dan 1 answered %', v_r;
  end if;
  perform pg_temp.bbr_log(v_mark, 'bb_save_default_dan', v_admin, v_a1, v_name0, 'save_default_dan');
  if (select count(*) from public.change_log where id > v_mark and table_name = 'bb_default_rubric') <> 1
     or (select count(*) from public.change_log where id > v_mark and table_name = 'bb_rubric_undo') <> 1 then
    raise exception 'TEST FAILED: U4 a save must log one default row and one undo slot';
  end if;
  -- the other three Dans untouched; the saved Dan = what was sent + the stamps
  select r.sheet into v_doc2 from public.bb_default_rubric r;
  if v_doc2 -> 'dans' -> 1 is distinct from v_doc -> 'dans' -> 1 or v_doc2 -> 'dans' -> 2 is distinct from v_doc -> 'dans' -> 2
     or v_doc2 -> 'dans' -> 3 is distinct from v_doc -> 'dans' -> 3
     or (v_doc2 -> 'dans' -> 0) - 'rev' - 'saved_at' - 'saved_by_name' is distinct from v_dx - 'rev' - 'saved_at' - 'saved_by_name' then
    raise exception 'TEST FAILED: U4 the save must replace Dan 1 only, exactly as sent';
  end if;
  if not exists (select 1 from public.bb_rubric_undo u where u.kind = 'default_dan' and u.cycle_id is null and u.dan = 1
                    and u.after_version = v_rev + 1 and u.saved_by = v_admin and u.previous = v_d) then
    raise exception 'TEST FAILED: U4 the save must keep an undo slot with the replaced Dan';
  end if;
  v_rev := v_rev + 1;
  -- the same content again (any stamps sent are ignored): changed false,
  -- no Undo, nothing logged on the default, and the earlier save's Undo is
  -- now stale (the caller's slot is gone)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_save_default_dan(1, v_rev, v_dx || '{"rev": 77, "saved_at": "2020-01-01T00:00:00Z", "saved_by_name": "Someone"}'::jsonb);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'changed')::boolean or (v_r ->> 'undo_available')::boolean
     or (v_r ->> 'rev')::integer <> v_rev
     or exists (select 1 from public.change_log where id > v_mark and table_name = 'bb_default_rubric')
     or exists (select 1 from public.bb_rubric_undo u where u.kind = 'default_dan' and u.dan = 1) then
    raise exception 'TEST FAILED: U4 the same content again should be ok, changed false, nothing written, got %', v_r;
  end if;
  v_r := public.bb_undo_default_dan(1, v_rev);
  if v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U4 after an unchanged save the earlier Undo should be stale, got %', v_r;
  end if;
  -- the input rules -> invalid (a rev outside 1-1 000 000 before anything
  -- works out rev + 1; a huge number is never an error)
  execute v_snap_sql into v_snap;
  foreach v_txt in array array[
      format('public.bb_save_default_dan(1, 0, %L::jsonb)', v_dx),
      format('public.bb_save_default_dan(1, 1000001, %L::jsonb)', v_dx),
      format('public.bb_save_default_dan(1, 2147483647, %L::jsonb)', v_dx),
      format('public.bb_save_default_dan(1, null, %L::jsonb)', v_dx),
      format('public.bb_save_default_dan(5, %s, %L::jsonb)', v_rev, v_dx),
      format('public.bb_save_default_dan(null, %s, %L::jsonb)', v_rev, v_dx),
      format('public.bb_save_default_dan(1, %s, ''[]''::jsonb)', v_rev),
      format('public.bb_save_default_dan(1, %s, null)', v_rev),
      format('public.bb_save_default_dan(2, %s, %L::jsonb)', v_rev, v_dx),
      format('public.bb_save_default_dan(1, %s, %L::jsonb)', v_rev, jsonb_set(v_dx, '{parts,0,subjects,0,credits}', '1e30')),
      format('public.bb_save_default_dan(1, %s, %L::jsonb)', v_rev, jsonb_set(v_dx, '{parts,0,subjects,0,credits}', '2.5')),
      'public.bb_undo_default_dan(1, 0)', 'public.bb_undo_default_dan(1, 1000001)', 'public.bb_undo_default_dan(null, 1)',
      'public.bb_undo_default_dan(0, 1)'] loop
    execute 'select ' || v_txt into v_r;
    if v_r ->> 'status' is distinct from 'invalid' then
      raise exception 'TEST FAILED: U4 % should be invalid, got %', left(v_txt, 100), left(v_r::text, 200);
    end if;
  end loop;
  v_r := public.bb_save_default_dan(1, v_rev, jsonb_set(v_dx, '{parts,0,subjects,0,credits}', '2.5'));
  if v_r ->> 'status' <> 'invalid' or not (pg_temp.bbr_codes(v_r -> 'problems') = array['credits']) then
    raise exception 'TEST FAILED: U4 a 2.5 credit should be invalid with the problem "credits", got %', v_r;
  end if;
  v_r := public.bb_save_default_dan(1, v_rev - 1, v_dx);
  if v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U4 an old rev should be stale, got %', v_r;
  end if;
  execute v_snap_sql into v_snap2;
  if v_snap2 <> v_snap then raise exception 'TEST FAILED: U4 a refused save changed something'; end if;
  -- a real change, then its Undo (as the app): the previous Dan back, as
  -- one more save with a new rev; a second Undo -> stale
  v_r := public.bb_save_default_dan(1, v_rev, jsonb_set(v_dx, '{pass,makeup}', '"zz makeup one"'));
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'rev')::integer <> v_rev + 1 then
    raise exception 'TEST FAILED: U4 a second save answered %', v_r;
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.bb_undo_default_dan(1, v_rev + 1);
  reset role;
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'rev')::integer <> v_rev + 2
     or (select (r.sheet -> 'dans' -> 0) - 'rev' - 'saved_at' - 'saved_by_name' from public.bb_default_rubric r)
        is distinct from v_dx - 'rev' - 'saved_at' - 'saved_by_name'
     or exists (select 1 from public.bb_rubric_undo u where u.kind = 'default_dan' and u.dan = 1) then
    raise exception 'TEST FAILED: U4 Undo should put the previous Dan back with a new rev, got %', v_r;
  end if;
  perform pg_temp.bbr_log(v_mark, 'bb_undo_default_dan', v_admin, v_a1, v_name0, 'undo_default_dan');
  v_r := public.bb_undo_default_dan(1, v_rev + 2);
  if v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U4 a second Undo should be stale, got %', v_r;
  end if;
  v_rev := v_rev + 2;
  -- Undo after another save -> stale
  v_r := public.bb_save_default_dan(1, v_rev, jsonb_set(v_dx, '{pass,makeup}', '"zz makeup two"'));
  v_r := public.bb_save_default_dan(1, v_rev + 1, jsonb_set(v_dx, '{pass,makeup}', '"zz makeup three"'));
  v_r2 := public.bb_undo_default_dan(1, v_rev + 1);
  if v_r ->> 'status' <> 'ok' or v_r2 is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U4 Undo after another save should be stale, got %', v_r2;
  end if;
  v_rev := v_rev + 2;
  -- Undo by another admin -> stale (the slot's saver changed by hand)
  update public.bb_rubric_undo set saved_by = gen_random_uuid() where kind = 'default_dan' and dan = 1;
  v_r := public.bb_undo_default_dan(1, v_rev);
  if v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U4 Undo by another admin should be stale, got %', v_r;
  end if;
  -- Undo after 16 seconds -> stale; after 14 seconds -> ok
  update public.bb_rubric_undo set saved_by = v_admin, saved_at = now() - interval '16 seconds' where kind = 'default_dan' and dan = 1;
  v_r := public.bb_undo_default_dan(1, v_rev);
  if v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U4 Undo after 16 seconds should be stale, got %', v_r;
  end if;
  update public.bb_rubric_undo set saved_at = now() - interval '14 seconds' where kind = 'default_dan' and dan = 1;
  v_r := public.bb_undo_default_dan(1, v_rev);
  if v_r ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: U4 Undo after 14 seconds should be ok, got %', v_r;
  end if;
  v_rev := v_rev + 1;
  -- (U2) an admin whose display name is 70 characters saves (the stamp cut
  -- to 60); one whose name fails the name rule saves with no stamp
  update public.staff set full_name = repeat('Z', 70) where id = v_admin;
  v_r := public.bb_save_default_dan(1, v_rev, jsonb_set(v_dx, '{pass,makeup}', '"zz makeup four"'));
  if v_r ->> 'status' <> 'ok' or v_r ->> 'saved_by_name' is distinct from repeat('Z', 60) then
    raise exception 'TEST FAILED: U2 a 70-character name should save with the stamp cut to 60, got %', v_r;
  end if;
  update public.staff set full_name = 'Zed ' || chr(7) || ' Bell' where id = v_admin;
  v_r := public.bb_save_default_dan(1, v_rev + 1, jsonb_set(v_dx, '{pass,makeup}', '"zz makeup five"'));
  if v_r ->> 'status' <> 'ok' or v_r -> 'saved_by_name' <> 'null'::jsonb
     or (select r.sheet -> 'dans' -> 0 -> 'saved_by_name' from public.bb_default_rubric r) <> 'null'::jsonb then
    raise exception 'TEST FAILED: U2 a name that fails the name rule should save with no stamp, got %', v_r;
  end if;
  update public.staff set full_name = v_name0 where id = v_admin;
  v_rev := v_rev + 2;

  -- ===================================================================
  -- U5. A cycle's copy: Save / Undo while never opened; locked after
  -- ===================================================================
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U5', v_today + 30, v_today + 20), null);
  v_c5 := (v_r ->> 'id')::uuid;
  if v_c5 is null then raise exception 'TEST SETUP: add the U5 cycle answered %', v_r; end if;
  select y.requirements -> 'dans' -> 1, y.version into v_d, v_v from public.bb_cycles y where y.id = v_c5;
  v_dx := jsonb_set(v_d, '{parts,1,subjects,0,credits}', '3');
  v_dx := jsonb_set(v_dx, '{parts,1,subjects,0,points}', '{"A+": 12, "A": 10.5, "A-": 9.75, "B+": 9, "B": 7.5, "B-": 6.75, "C": 6, "C-": 3, "D": 0}');
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.bb_save_cycle_dan(v_c5, 2, 1, v_dx);
  reset role;
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'rev')::integer <> 2 or not (v_r ->> 'undo_available')::boolean
     or (select version from public.bb_cycles where id = v_c5) <> v_v
     or (select (y.requirements -> 'dans' -> 1) - 'rev' - 'saved_at' - 'saved_by_name' from public.bb_cycles y where y.id = v_c5)
        is distinct from v_dx - 'rev' - 'saved_at' - 'saved_by_name' then
    raise exception 'TEST FAILED: U5 a save of the cycle''s Dan 2 (version unchanged) answered %', v_r;
  end if;
  perform pg_temp.bbr_log(v_mark, 'bb_save_cycle_dan', v_admin, v_a1, v_name0, 'save_cycle_dan');
  v_r := public.bb_save_cycle_dan(v_c5, 2, 2, v_dx);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'changed')::boolean or (v_r ->> 'undo_available')::boolean then
    raise exception 'TEST FAILED: U5 the same content again should be changed false, got %', v_r;
  end if;
  v_r := public.bb_save_cycle_dan(v_c5, 2, 1, v_dx);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: U5 an old rev should be stale, got %', v_r; end if;
  v_r := public.bb_save_cycle_dan(v_rand, 2, 2, v_dx);
  if v_r is distinct from '{"status": "not_found"}'::jsonb then raise exception 'TEST FAILED: U5 an unknown cycle should be not_found, got %', v_r; end if;
  v_r := public.bb_save_cycle_dan(null, 2, 2, v_dx);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: U5 a null cycle should be invalid, got %', v_r; end if;
  v_r := public.bb_save_cycle_dan(v_c5, 2, 2, jsonb_set(v_dx, '{pass,makeup}', '"zz cycle makeup"'));
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r2 := public.bb_undo_cycle_dan(v_c5, 2, 3);
  reset role;
  if v_r ->> 'status' <> 'ok' or v_r2 ->> 'status' <> 'ok' or (v_r2 ->> 'rev')::integer <> 4
     or (select (y.requirements -> 'dans' -> 1) - 'rev' - 'saved_at' - 'saved_by_name' from public.bb_cycles y where y.id = v_c5)
        is distinct from v_dx - 'rev' - 'saved_at' - 'saved_by_name'
     or (select version from public.bb_cycles where id = v_c5) <> v_v then
    raise exception 'TEST FAILED: U5 Undo of a cycle save should put the Dan back, got % / %', v_r, v_r2;
  end if;
  perform pg_temp.bbr_log(v_mark, 'bb_undo_cycle_dan', v_admin, v_a1, v_name0, 'undo_cycle_dan');
  v_r := public.bb_undo_cycle_dan(v_c5, 2, 4);
  if v_r is distinct from '{"status": "stale"}'::jsonb then raise exception 'TEST FAILED: U5 a second Undo should be stale, got %', v_r; end if;
  -- a save then the first opening: the copy is locked (save and Undo)
  v_r := public.bb_save_cycle_dan(v_c5, 2, 4, jsonb_set(v_dx, '{pass,makeup}', '"zz before opening"'));
  v_r2 := public.bb_set_registration(v_c5, v_v, true);
  if v_r ->> 'status' <> 'ok' or v_r2 ->> 'status' <> 'ok' or not (v_r2 ->> 'first_open')::boolean then
    raise exception 'TEST SETUP: U5 save + first opening answered % / %', v_r, v_r2;
  end if;
  execute v_snap_sql into v_snap;
  v_r := public.bb_save_cycle_dan(v_c5, 2, 5, v_dx);
  v_r2 := public.bb_undo_cycle_dan(v_c5, 2, 5);
  execute v_snap_sql into v_snap2;
  if v_r ->> 'status' <> 'locked' or v_r2 ->> 'status' <> 'locked'
     or (v_r ->> 'first_opened_at')::timestamptz is distinct from (select first_opened_at from public.bb_cycles where id = v_c5)
     or v_snap2 <> v_snap then
    raise exception 'TEST FAILED: U5 after opening, save and Undo should be locked + first_opened_at, got % / %', v_r, v_r2;
  end if;
  v_r := public.bb_save_cycle_dan(v_c5, 2, 1, v_dx);   -- locked wins over stale
  if v_r ->> 'status' <> 'locked' then raise exception 'TEST FAILED: U5 locked must win over stale, got %', v_r; end if;
  -- the table itself: with a function's tag set, an opened cycle's rubric
  -- can't change (bb_cycles_requirements_immutable); a hand fix still can
  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.action', 'bb_save_cycle_dan', true);
  begin
    update public.bb_cycles set requirements = jsonb_set(requirements, '{source}', '"zz nope"') where id = v_c5;
    raise exception 'TEST FAILED: U5 an opened cycle''s rubric changed with a tag set';
  exception when check_violation then
    get stacked diagnostics v_txt = constraint_name;
    if v_txt is distinct from 'bb_cycles_requirements_immutable' then
      raise exception 'TEST FAILED: U5 the refusal should name bb_cycles_requirements_immutable, got %', v_txt;
    end if;
  end;
  perform set_config('tkd.action', 'bb_update_cycle', true);
  begin
    update public.bb_cycles set requirements = jsonb_set(requirements, '{source}', '"zz nope"') where id = v_cu;
    raise exception 'TEST FAILED: U5 a rubric changed with another function''s tag';
  exception when check_violation then null;
  end;
  perform set_config('tkd.action', '', true);
  update public.bb_cycles set requirements = jsonb_set(requirements, '{source}', '"zz hand fix"') where id = v_c5;
  if (select requirements ->> 'source' from public.bb_cycles where id = v_c5) <> 'zz hand fix' then
    raise exception 'TEST FAILED: U5 a hand fix of an opened cycle''s rubric should work';
  end if;

  -- ===================================================================
  -- U6. The first opening (admins only) and its Undo
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U6', v_today + 30, v_today + 20), null);
  v_c6 := (v_r ->> 'id')::uuid;
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U6b', v_today + 30, v_today + 20), null);
  v_c6b := (v_r ->> 'id')::uuid;
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U6c', v_today + 30, v_today + 20), null);
  v_c6c := (v_r ->> 'id')::uuid;
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U6d', v_today + 30, v_today + 20), null);
  v_c6d := (v_r ->> 'id')::uuid;
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U6e', v_today + 30, v_today + 20), null);
  v_c6e := (v_r ->> 'id')::uuid;
  if v_c6 is null or v_c6b is null or v_c6c is null or v_c6d is null or v_c6e is null then
    raise exception 'TEST SETUP: could not add the U6 cycles (last answer %)', v_r;
  end if;
  -- the desk: a first opening -> not_allowed, nothing written
  execute v_snap_sql into v_snap;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_set_registration(v_c6, 1, true);
  execute v_snap_sql into v_snap2;
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb or v_snap2 <> v_snap then
    raise exception 'TEST FAILED: U6 the desk''s first opening should be not_allowed with nothing written, got %', v_r;
  end if;
  -- an admin: ok, first_open true, an undo slot (logged in one batch)
  select coalesce(max(id), 0) into v_mark from public.change_log;
  perform set_config('request.jwt.claims', v_c_a1, true);
  set local role authenticated;
  v_r := public.bb_set_registration(v_c6, 1, true);
  reset role;
  if v_r ->> 'status' <> 'ok' or not (v_r ->> 'first_open')::boolean or v_r -> 'state' ->> 'registration' <> 'open'
     or not exists (select 1 from public.bb_rubric_undo u where u.kind = 'first_open' and u.cycle_id = v_c6
                     and u.after_version = (v_r ->> 'version')::integer and u.saved_by = v_admin
                     and u.previous = '{"registration_open": false, "first_opened_at": null, "auto_close": true}'::jsonb) then
    raise exception 'TEST FAILED: U6 an admin''s first opening answered % (or no undo slot)', v_r;
  end if;
  perform pg_temp.bbr_log(v_mark, 'bb_set_registration', v_admin, v_a1, v_name0, 'first opening');
  -- the desk may close and reopen once an admin opened it; the close
  -- removes the first opening's slot; the reopen is not a first opening
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_set_registration(v_c6, (v_r ->> 'version')::integer, false);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'first_open')::boolean
     or exists (select 1 from public.bb_rubric_undo u where u.cycle_id = v_c6) then
    raise exception 'TEST FAILED: U6 the desk''s close should be ok and clear the slot, got %', v_r;
  end if;
  v_r := public.bb_set_registration(v_c6, (v_r ->> 'version')::integer, true);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'first_open')::boolean then
    raise exception 'TEST FAILED: U6 the desk''s reopen should be ok, first_open false, got %', v_r;
  end if;
  -- ... so the Undo of that first opening is no longer possible
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_undo_first_open(v_c6, (v_r ->> 'version')::integer);
  if v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U6 Undo after a close and reopen should be stale, got %', v_r;
  end if;
  -- Undo within 15 seconds: never opened again, the rubric editable again
  v_r := public.bb_set_registration(v_c6b, 1, true);
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r2 := public.bb_undo_first_open(v_c6b, (v_r ->> 'version')::integer);
  reset role;
  if v_r2 ->> 'status' <> 'ok' or v_r2 -> 'state' ->> 'registration' <> 'not_open_yet'
     or (select first_opened_at is not null or registration_open or not auto_close from public.bb_cycles where id = v_c6b)
     or exists (select 1 from public.bb_rubric_undo u where u.cycle_id = v_c6b) then
    raise exception 'TEST FAILED: U6 Undo of a first opening answered %', v_r2;
  end if;
  perform pg_temp.bbr_log(v_mark, 'bb_undo_first_open', v_admin, v_a1, v_name0, 'undo_first_open');
  v_r := public.bb_save_cycle_dan(v_c6b, 1, 1,
                                  (select jsonb_set(y.requirements -> 'dans' -> 0, '{pass,makeup}', '"zz editable again"')
                                     from public.bb_cycles y where y.id = v_c6b));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: U6 after the Undo the rubric should be editable, got %', v_r; end if;
  -- stale: another admin; another change since; 16 seconds old
  v_r := public.bb_set_registration(v_c6b, (v_r2 ->> 'version')::integer, true);
  update public.bb_rubric_undo set saved_by = gen_random_uuid() where kind = 'first_open' and cycle_id = v_c6b;
  v_r2 := public.bb_undo_first_open(v_c6b, (v_r ->> 'version')::integer);
  if v_r2 is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U6 Undo by another admin should be stale, got %', v_r2;
  end if;
  update public.bb_rubric_undo set saved_by = v_admin, saved_at = now() - interval '16 seconds' where kind = 'first_open' and cycle_id = v_c6b;
  v_r2 := public.bb_undo_first_open(v_c6b, (v_r ->> 'version')::integer);
  if v_r2 is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U6 Undo after 16 seconds should be stale, got %', v_r2;
  end if;
  update public.bb_rubric_undo set saved_at = now() where kind = 'first_open' and cycle_id = v_c6b;
  perform set_config('request.jwt.claims', '', true);
  update public.bb_cycles set name = name || ' x' where id = v_c6b;   -- another change (the version goes up)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r2 := public.bb_undo_first_open(v_c6b, (v_r ->> 'version')::integer);
  v_r := public.bb_undo_first_open(v_c6b, (v_r ->> 'version')::integer + 1);
  if v_r2 is distinct from '{"status": "stale"}'::jsonb or v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U6 Undo after another change should be stale, got % / %', v_r2, v_r;
  end if;
  v_r := public.bb_undo_first_open(v_c6b, null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then raise exception 'TEST FAILED: U6 a null version should be invalid, got %', v_r; end if;
  v_r := public.bb_undo_first_open(v_rand, 1);
  if v_r is distinct from '{"status": "not_found"}'::jsonb then raise exception 'TEST FAILED: U6 an unknown cycle should be not_found, got %', v_r; end if;
  -- a first opening after Application due turns auto close off; its Undo
  -- puts auto close back
  perform set_config('request.jwt.claims', '', true);
  update public.bb_cycles set application_due = v_today - 1 where id = v_c6c;
  select version into v_v from public.bb_cycles where id = v_c6c;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_set_registration(v_c6c, v_v, true);
  if v_r ->> 'status' <> 'ok' or (select auto_close from public.bb_cycles where id = v_c6c) then
    raise exception 'TEST SETUP: U6 opening after Application due answered %', v_r;
  end if;
  v_r := public.bb_undo_first_open(v_c6c, (v_r ->> 'version')::integer);
  if v_r ->> 'status' <> 'ok' or not (select auto_close from public.bb_cycles where id = v_c6c) then
    raise exception 'TEST FAILED: U6 Undo must put auto close back, got %', v_r;
  end if;
  -- a family registered (registered_at EARLIER than the opening, written
  -- by hand) -> has_registrations; the lock stays
  v_r := public.bb_set_registration(v_c6d, 1, true);
  perform set_config('request.jwt.claims', '', true);
  insert into public.bb_candidates
    (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan, cycle_plan_id,
     kukkiwon, source, reference, registered_at, created_by_name, updated_by_name)
  select v_c6d, 'Early', 'Family', date '2000-01-01', 'zz.early@example.com', 'worcester', 1, pl.id, false, 'form',
         'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text, now() - interval '1 hour', '', ''
    from public.bb_cycle_plans pl where pl.cycle_id = v_c6d limit 1;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_undo_first_open(v_c6d, (v_r ->> 'version')::integer);
  if v_r is distinct from '{"status": "has_registrations"}'::jsonb
     or (select first_opened_at is null or not registration_open from public.bb_cycles where id = v_c6d) then
    raise exception 'TEST FAILED: U6 Undo with a form registration should be has_registrations, got %', v_r;
  end if;
  -- only the history row of a form registration that was removed again ->
  -- has_registrations too
  v_r := public.bb_set_registration(v_c6e, 1, true);
  perform set_config('request.jwt.claims', '', true);
  select public_code_worcester into v_code_w from public.bb_cycles where id = v_c6e;
  select id into v_plan from public.bb_cycle_plans where cycle_id = v_c6e limit 1;
  v_r2 := public.bb_public_register(v_code_w, v_tag || ' k6', gen_random_uuid(), 'Gone', 'Again', date '2000-01-01',
                                    'zz.gone@example.com', 1, v_plan, false, true, v_wv_name, 'Jordan Testparent', v_sig);
  if v_r2 ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U6 the form registration answered %', v_r2; end if;
  delete from public.bb_candidates where cycle_id = v_c6e;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_undo_first_open(v_c6e, (v_r ->> 'version')::integer);
  if v_r is distinct from '{"status": "has_registrations"}'::jsonb then
    raise exception 'TEST FAILED: U6 Undo after a removed form registration should be has_registrations, got %', v_r;
  end if;
  -- the table itself: first_opened_at can't change under another tag
  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.action', 'bb_update_cycle', true);
  begin
    update public.bb_cycles set first_opened_at = now() where id = v_cu;
    raise exception 'TEST FAILED: U6 first_opened_at changed under another tag';
  exception when check_violation then
    get stacked diagnostics v_txt = constraint_name;
    if v_txt is distinct from 'bb_cycles_first_opened_immutable' then
      raise exception 'TEST FAILED: U6 the refusal should name bb_cycles_first_opened_immutable, got %', v_txt;
    end if;
  end;
  perform set_config('tkd.action', 'bb_set_registration', true);
  begin
    update public.bb_cycles set first_opened_at = null, registration_open = false where id = v_c6;   -- a value -> empty
    raise exception 'TEST FAILED: U6 the opening''s tag could clear first_opened_at';
  exception when check_violation then null;
  end;
  perform set_config('tkd.action', '', true);

  -- ===================================================================
  -- U7. Add cycle copies the default (with the saves of U4), closed
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U7', v_today + 30, v_today + 20), v_c5);
  v_c7 := (v_r ->> 'id')::uuid;
  select y.requirements into v_doc from public.bb_cycles y where y.id = v_c7;
  select r.sheet into v_doc2 from public.bb_default_rubric r;
  if v_r ->> 'status' <> 'ok' or v_doc ->> 'source' <> 'Default rubric'
     or exists (select 1 from jsonb_array_elements(v_doc -> 'dans') d(e)
                 where d.e -> 'rev' <> '1'::jsonb or d.e -> 'saved_at' <> 'null'::jsonb or d.e -> 'saved_by_name' <> 'null'::jsonb)
     or (select jsonb_agg(d.e - 'rev' - 'saved_at' - 'saved_by_name' order by d.o) from jsonb_array_elements(v_doc -> 'dans') with ordinality d(e, o))
        is distinct from
        (select jsonb_agg(d.e - 'rev' - 'saved_at' - 'saved_by_name' order by d.o) from jsonb_array_elements(v_doc2 -> 'dans') with ordinality d(e, o))
     or v_doc -> 'dans' -> 0 -> 'pass' ->> 'makeup' <> 'zz makeup five'
     or (select registration_open or first_opened_at is not null from public.bb_cycles where id = v_c7) then
    raise exception 'TEST FAILED: U7 Add cycle must copy the default (source "Default rubric", revs 1, no stamps) and stay closed, got %', v_r;
  end if;
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U7 bad', v_today + 30, v_today + 20), v_rand);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: U7 an unknown source cycle should be invalid, got %', v_r;
  end if;
  -- a later save of the default doesn't touch an existing cycle (v0.921)
  select r.sheet -> 'dans' -> 0 into v_d from public.bb_default_rubric r;
  v_r := public.bb_save_default_dan(1, (v_d ->> 'rev')::integer, jsonb_set(v_d, '{pass,makeup}', '"zz after U7"'));
  if v_r ->> 'status' <> 'ok' or (select requirements from public.bb_cycles where id = v_c7) is distinct from v_doc then
    raise exception 'TEST FAILED: U7 a later save of the default must not touch an existing cycle, got %', v_r;
  end if;

  -- ===================================================================
  -- U8. The family form's view of the rubric
  -- ===================================================================
  v_r := public.bb_set_registration(v_c7, 1, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U8 open the U7 cycle answered %', v_r; end if;
  perform set_config('request.jwt.claims', '', true);
  select public_code_shrewsbury into v_code_w from public.bb_cycles where id = v_c7;
  v_r := public.bb_public_cycle(v_code_w);
  if v_r ->> 'status' <> 'ok' or v_r -> 'cycle' -> 'requirements' is distinct from public.bb_rubric_public(v_doc)
     or (v_r -> 'cycle' -> 'requirements')::text ~ '"(rev|saved_at|saved_by_name|source)": '
     or v_r -> 'cycle' -> 'requirements' -> 'dans' -> 0 ? 'rev' then
    raise exception 'TEST FAILED: U8 / U1c the public answer must be the public view (no rev, stamps or source): %', left(v_r::text, 300);
  end if;
  if (select s.e -> 'points' ->> 'B' from jsonb_array_elements(v_r -> 'cycle' -> 'requirements' -> 'dans' -> 3 -> 'parts') p(e),
                                         jsonb_array_elements(p.e -> 'subjects') s(e)
       where s.e ->> 'name' = 'Target kick (30 sec)') is distinct from '9' then
    raise exception 'TEST FAILED: U8 the public view must show Dan 4 Target kick B = 9';
  end if;
  -- the public view keeps everything a family needs (it is the stored
  -- rubric minus revs, stamps and source)
  if (select jsonb_agg(d.e - 'rev' - 'saved_at' - 'saved_by_name' order by d.o) from jsonb_array_elements(v_doc -> 'dans') with ordinality d(e, o))
     is distinct from v_r -> 'cycle' -> 'requirements' -> 'dans' then
    raise exception 'TEST FAILED: U8 the public view must keep every value a family needs';
  end if;
  -- an unknown key planted by hand (the rule taken off for a moment) never
  -- reaches the public: an allow-list, not "everything minus some keys"
  alter table public.bb_cycles drop constraint bb_cycles_requirements_check;
  update public.bb_cycles
     set requirements = jsonb_set(jsonb_set(jsonb_set(requirements, '{zz_planted_top}', '"zz leak 1"'),
                                            '{dans,0,zz_planted_dan}', '"zz leak 2"'),
                                  '{dans,0,parts,0,subjects,0,zz_planted_subject}', '"zz leak 3"')
   where id = v_c7;
  v_r := public.bb_public_cycle(v_code_w);
  if v_r ->> 'status' <> 'ok' or v_r::text ~ 'zz_planted|zz leak' then
    raise exception 'TEST FAILED: U8 a planted key reached the public answer';
  end if;
  update public.bb_cycles set requirements = v_doc where id = v_c7;
  alter table public.bb_cycles add constraint bb_cycles_requirements_check check (public.bb_rubric_is_valid(requirements));
  -- never opened -> no rubric at all; a Past, never-opened cycle -> none;
  -- after a first opening and its Undo -> none again
  select public_code_worcester into v_code_w from public.bb_cycles where id = v_cu;
  v_r := public.bb_public_cycle(v_code_w);
  if v_r ->> 'state' <> 'not_open' or v_r -> 'cycle' -> 'requirements' <> 'null'::jsonb then
    raise exception 'TEST FAILED: U8 a never-opened cycle must give requirements null, got %', left(v_r::text, 200);
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U8 past', v_today + 30, v_today + 20), null);
  v_c8 := (v_r ->> 'id')::uuid;
  perform set_config('request.jwt.claims', '', true);
  update public.bb_cycle_days set day_date = day_date - 400 where cycle_id = v_c8;
  update public.bb_cycles set application_due = application_due - 400, submissions_due = submissions_due - 400 where id = v_c8;
  update public.bb_cycle_plan_payments pp set due_on = pp.due_on - 400
    from public.bb_cycle_plans pl where pl.id = pp.cycle_plan_id and pl.cycle_id = v_c8;
  select public_code_worcester into v_code_w from public.bb_cycles where id = v_c8;
  v_r := public.bb_public_cycle(v_code_w);
  if v_r ->> 'state' <> 'finished' or v_r -> 'cycle' -> 'requirements' <> 'null'::jsonb then
    raise exception 'TEST FAILED: U8 a Past, never-opened cycle must give requirements null, got %', left(v_r::text, 200);
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select version into v_v from public.bb_cycles where id = v_cu;
  v_r := public.bb_set_registration(v_cu, v_v, true);
  select public_code_worcester into v_code_w from public.bb_cycles where id = v_cu;
  v_r2 := public.bb_public_cycle(v_code_w);
  if v_r ->> 'status' <> 'ok' or v_r2 -> 'cycle' -> 'requirements' = 'null'::jsonb then
    raise exception 'TEST FAILED: U8 an opened cycle must show its rubric, got %', v_r;
  end if;
  v_r := public.bb_undo_first_open(v_cu, (v_r ->> 'version')::integer);
  v_r2 := public.bb_public_cycle(v_code_w);
  if v_r ->> 'status' <> 'ok' or v_r2 -> 'cycle' -> 'requirements' <> 'null'::jsonb then
    raise exception 'TEST FAILED: U8 after the Undo of the first opening requirements must be null again, got %', v_r;
  end if;

  -- ===================================================================
  -- U9. The tables' guards (as the SQL Editor's role)
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  -- a slot to write against (a save as A1)
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.sheet -> 'dans' -> 3 into v_d from public.bb_default_rubric r;
  v_r := public.bb_save_default_dan(4, (v_d ->> 'rev')::integer, jsonb_set(v_d, '{pass,makeup}', '"zz U9"'));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: U9 save Dan 4 answered %', v_r; end if;
  perform set_config('request.jwt.claims', '', true);
  foreach v_txt in array array[
      'insert into public.bb_default_rubric (sheet, created_by_name, updated_by_name) select sheet, '''', '''' from public.bb_default_rubric',
      'update public.bb_default_rubric set sheet = sheet',
      'delete from public.bb_default_rubric',
      'insert into public.bb_rubric_undo (kind, cycle_id, dan, previous, after_version) values (''cycle_dan'', ''' || v_cu || ''', 3, ''{}'', 1)',
      'update public.bb_rubric_undo set after_version = after_version',
      'delete from public.bb_rubric_undo'] loop
    foreach v_role in array array['', 'bb_update_cycle', 'bb_seed', 'bb_save_default_dan'] loop
      -- (no tag = a hand fix: allowed for the update of the default and for
      -- the slots; the insert of the default needs bb_seed; delete never)
      continue when v_role = '' and (v_txt like 'update public.bb_default_rubric%' or v_txt like '%bb_rubric_undo%');
      continue when v_role = 'bb_seed' and v_txt like 'insert into public.bb_default_rubric%';
      continue when v_role = 'bb_save_default_dan' and (v_txt like 'update public.bb_default_rubric%' or v_txt like '%bb_rubric_undo%');
      perform set_config('tkd.action', v_role, true);
      begin
        execute v_txt;
        raise exception 'TEST FAILED: U9 allowed with tag "%": %', v_role, left(v_txt, 100);
      exception when check_violation then null;
      end;
    end loop;
  end loop;
  perform set_config('tkd.action', '', true);
  -- Delete cycle takes the cycle's undo slots with it (logged)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_add_cycle(pg_temp.bbr_payload(v_tag || ' U9', v_today + 30, v_today + 20), null);
  v_c9 := (v_r ->> 'id')::uuid;
  v_r := public.bb_save_cycle_dan(v_c9, 3, 1, (select jsonb_set(y.requirements -> 'dans' -> 2, '{pass,makeup}', '"zz U9 cycle"')
                                                 from public.bb_cycles y where y.id = v_c9));
  if v_r ->> 'status' <> 'ok' or not exists (select 1 from public.bb_rubric_undo where cycle_id = v_c9) then
    raise exception 'TEST SETUP: U9 save on the U9 cycle answered %', v_r;
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.bb_delete_cycle(v_c9, 1, 0);
  if v_r is distinct from '{"status": "ok"}'::jsonb or exists (select 1 from public.bb_rubric_undo where cycle_id = v_c9)
     or not exists (select 1 from public.change_log where id > v_mark and table_name = 'bb_rubric_undo' and op = 'delete'
                     and action = 'bb_delete_cycle') then
    raise exception 'TEST FAILED: U9 Delete cycle must take (and log) its undo slots, got %', v_r;
  end if;

  -- ===================================================================
  -- U11. Catalog: rules and rights on everything 0024 made
  -- ===================================================================
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in ('bb_default_rubric', 'bb_rubric_undo') and c.relrowsecurity) <> 2 then
    raise exception 'TEST FAILED: U11 RLS must be on for both tables';
  end if;
  if (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'bb_rubric_undo') <> 0
     or (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'bb_default_rubric') <> 1
     or not exists (select 1 from pg_policies p
                     where p.schemaname = 'public' and p.tablename = 'bb_default_rubric'
                       and p.policyname = 'bb_default_rubric_select_with_access' and p.cmd = 'SELECT'
                       and p.roles = array['authenticated']::name[] and p.permissive = 'PERMISSIVE'
                       and p.qual like '%has_data_access()%' and p.with_check is null) then
    raise exception 'TEST FAILED: U11 the read rules are not exactly contract 8';
  end if;
  for v_txt, v_txt2 in
    select c.relname::text, a.attname::text
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('bb_default_rubric', 'bb_rubric_undo') and a.attnum > 0 and not a.attisdropped
  loop
    if has_column_privilege('authenticated', 'public.' || v_txt, v_txt2, 'SELECT')
       is distinct from (v_txt = 'bb_default_rubric' and v_txt2 in ('id', 'sheet', 'version', 'updated_at', 'updated_by_name')) then
      raise exception 'TEST FAILED: U11 authenticated SELECT on %.% is wrong', v_txt, v_txt2;
    end if;
  end loop;
  foreach v_txt in array array['bb_default_rubric', 'bb_rubric_undo'] loop
    foreach v_role in array array['authenticated', 'anon', 'service_role', 'public'] loop
      if has_table_privilege(v_role, 'public.' || v_txt, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         or has_any_column_privilege(v_role, 'public.' || v_txt, 'INSERT, UPDATE, REFERENCES') then
        raise exception 'TEST FAILED: U11 % has a table-wide or write right on %', v_role, v_txt;
      end if;
    end loop;
  end loop;
  -- every 0024 function: one version, search_path pinned, definer as
  -- designed, no argument defaults, the exact signatures and rights
  for v_fn in
    select p.oid, p.proname::text as name, p.prosecdef, p.proconfig, p.pronargdefaults, p.proacl, p.proowner,
           (select count(*) from pg_proc q where q.pronamespace = p.pronamespace and q.proname = p.proname) as versions
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_new_fns || v_replaced_fns || v_helper_fns)
  loop
    if v_fn.versions <> 1 or not coalesce('search_path=""' = any (v_fn.proconfig), false) or v_fn.pronargdefaults <> 0 then
      raise exception 'TEST FAILED: U11 % (versions, search_path or defaults)', v_fn.oid::regprocedure;
    end if;
    if v_fn.prosecdef is distinct from (v_fn.name = any (v_new_fns || array['bb_set_registration', 'bb_add_cycle', 'bb_public_cycle'])) then
      raise exception 'TEST FAILED: U11 % security definer is %, not as designed', v_fn.oid::regprocedure, v_fn.prosecdef;
    end if;
    if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
         is distinct from (v_fn.name = any (v_new_fns || array['bb_set_registration', 'bb_add_cycle']))
       or has_function_privilege('bb_registrar', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = 'bb_public_cycle')
       or has_function_privilege('anon', v_fn.oid, 'EXECUTE') or has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) as a where a.grantee = 0) then
      raise exception 'TEST FAILED: U11 execute rights on % are wrong', v_fn.oid::regprocedure;
    end if;
    if (select p.prosrc from pg_proc p where p.oid = v_fn.oid) ilike '%clock_timestamp%'
       or (select p.prosrc from pg_proc p where p.oid = v_fn.oid) ~* '(now\(\)|current_timestamp|_at|p_now)\s*\)*\s*::\s*date\M' then
      raise exception 'TEST FAILED: U11 % uses clock_timestamp or ::date on a timestamp', v_fn.oid::regprocedure;
    end if;
  end loop;
  select string_agg(x.sig, ', ') into v_txt
    from unnest(array[
      'public.bb_save_default_dan(integer, integer, jsonb)', 'public.bb_undo_default_dan(integer, integer)',
      'public.bb_save_cycle_dan(uuid, integer, integer, jsonb)', 'public.bb_undo_cycle_dan(uuid, integer, integer)',
      'public.bb_undo_first_open(uuid, integer)', 'public.bb_set_registration(uuid, integer, boolean)',
      'public.bb_add_cycle(jsonb, uuid)', 'public.bb_public_cycle(text)', 'public.bb_cycles_rules()',
      'public.bb_rubric_num_ok(jsonb, numeric, numeric)', 'public.bb_rubric_int_ok(jsonb, integer, integer)',
      'public.bb_rubric_letters(text, text)', 'public.bb_rubric_brackets_problems(jsonb, jsonb)',
      'public.bb_rubric_dan_problems(jsonb, integer)', 'public.bb_rubric_is_valid(jsonb)',
      'public.bb_rubric_part_max(jsonb, integer, integer)', 'public.bb_rubric_most_points(jsonb, integer, integer)',
      'public.bb_rubric_from_v1(jsonb)', 'public.bb_rubric_fresh_copy(jsonb)', 'public.bb_rubric_public(jsonb)',
      'public.bb_rubric_put_dan(jsonb, integer, jsonb, integer)', 'public.bb_default_rubric_guard()',
      'public.bb_rubric_undo_guard()']) as x(sig)
   where to_regprocedure(x.sig) is null;
  if v_txt is not null then raise exception 'TEST FAILED: U11 missing function signature(s): %', v_txt; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any (v_new_fns || v_replaced_fns || v_helper_fns)) <> 23 then
    raise exception 'TEST FAILED: U11 expected exactly 23 functions (5 new, 4 replaced, 14 internal)';
  end if;
  -- the triggers: on the two tables, and bb_cycles' replaced ones
  select string_agg(x.trg, ', ') into v_txt
    from (values ('bb_default_rubric_before_write', 'bb_default_rubric', 'bb_before_write'),
                 ('bb_default_rubric_guard', 'bb_default_rubric', 'bb_default_rubric_guard'),
                 ('bb_default_rubric_log', 'bb_default_rubric', 'change_log_write'),
                 ('bb_default_rubric_no_truncate', 'bb_default_rubric', 'testing_refuse_truncate'),
                 ('bb_rubric_undo_guard', 'bb_rubric_undo', 'bb_rubric_undo_guard'),
                 ('bb_rubric_undo_log', 'bb_rubric_undo', 'change_log_write'),
                 ('bb_rubric_undo_no_truncate', 'bb_rubric_undo', 'testing_refuse_truncate'),
                 ('bb_cycles_before_write', 'bb_cycles', 'bb_before_write'),
                 ('bb_cycles_rules', 'bb_cycles', 'bb_cycles_rules')) as x(trg, tbl, fn)
   where not exists (
     select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
       join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public' and t.tgname = x.trg and c.relname = x.tbl
        and p.proname = x.fn and t.tgenabled = 'O' and not t.tgisinternal);
  if v_txt is not null then raise exception 'TEST FAILED: U11 missing / wrong / disabled trigger(s): %', v_txt; end if;
  if (select count(*) from pg_trigger t where t.tgrelid in ('public.bb_default_rubric'::regclass, 'public.bb_rubric_undo'::regclass)
                                         and not t.tgisinternal) <> 7 then
    raise exception 'TEST FAILED: U11 expected exactly 7 triggers on the two tables';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.bb_cycles'::regclass and t.tgname = 'bb_cycles_before_write'
                  and pg_get_triggerdef(t.oid) like '%bb_before_write(''id,public_code_worcester,public_code_shrewsbury,prices_from'', ''requirements'')%')
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.bb_default_rubric'::regclass and t.tgname = 'bb_default_rubric_before_write'
                     and pg_get_triggerdef(t.oid) like '%bb_before_write(''id,singleton'', '''')%') then
    raise exception 'TEST FAILED: U11 bb_before_write arguments wrong (bb_cycles must have requirements as no-bump)';
  end if;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
       where c.conrelid = 'public.bb_cycles'::regclass and c.conname = 'bb_cycles_requirements_check') not like '%bb_rubric_is_valid(requirements)%'
     or (select pg_get_constraintdef(c.oid) from pg_constraint c
          where c.conrelid = 'public.bb_default_rubric'::regclass and c.conname = 'bb_default_rubric_sheet_check') not like '%bb_rubric_is_valid(sheet)%'
     or not exists (select 1 from pg_constraint c where c.conname = 'bb_rubric_undo_cycle_fk' and c.contype = 'f' and c.confdeltype = 'c'
                     and c.conrelid = 'public.bb_rubric_undo'::regclass and c.confrelid = 'public.bb_cycles'::regclass)
     or not (select i.indisunique and i.indnullsnotdistinct from pg_index i where i.indexrelid = 'public.bb_rubric_undo_slot_key'::regclass) then
    raise exception 'TEST FAILED: U11 the rules are not as designed (requirements / sheet checks, the cycle key, the slot index)';
  end if;
  -- every stored rubric is version 2
  if exists (select 1 from public.bb_cycles y where not public.bb_rubric_is_valid(y.requirements)) then
    raise exception 'TEST FAILED: U11 a cycle holds a rubric that is not a valid version 2';
  end if;

  -- ===================================================================
  -- U12. Races (what one session can prove)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  select r.sheet -> 'dans' -> 1 into v_d from public.bb_default_rubric r;
  v_rev := (v_d ->> 'rev')::integer;
  v_r  := public.bb_save_default_dan(2, v_rev, jsonb_set(v_d, '{pass,makeup}', '"zz race A"'));
  v_r2 := public.bb_save_default_dan(2, v_rev, jsonb_set(v_d, '{pass,makeup}', '"zz race B"'));
  if v_r ->> 'status' <> 'ok' or v_r2 is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U12 two saves with the same rev: the second should be stale, got % / %', v_r, v_r2;
  end if;
  v_r := public.bb_undo_default_dan(2, v_rev + 1);
  v_r2 := public.bb_save_default_dan(2, v_rev + 1, jsonb_set(v_d, '{pass,makeup}', '"zz race C"'));
  if v_r ->> 'status' <> 'ok' or v_r2 is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: U12 a save after an Undo with the old rev should be stale, got % / %', v_r, v_r2;
  end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.bb_rubric_undo (kind, cycle_id, dan, previous, after_version) values ('default_dan', null, 3, '{}', 1);
  begin
    insert into public.bb_rubric_undo (kind, cycle_id, dan, previous, after_version) values ('default_dan', null, 3, '{}', 2);
    raise exception 'TEST FAILED: U12 a second slot for the same Dan was accepted';
  exception when unique_violation then null;
  end;

  -- ===================================================================
  -- U4 (last). The default row missing -> a save answers invalid (never
  -- not_found or an error). The guard never lets the row be removed, so
  -- it is switched off for this one statement - inside this transaction,
  -- which is rolled back.
  -- ===================================================================
  alter table public.bb_default_rubric disable trigger bb_default_rubric_guard;
  delete from public.bb_default_rubric;
  alter table public.bb_default_rubric enable trigger bb_default_rubric_guard;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_save_default_dan(1, 1, v_dx);
  v_r2 := public.bb_undo_default_dan(1, 1);
  if v_r ->> 'status' <> 'invalid' or v_r2 ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: U4 with the default row missing, save / undo should be invalid, got % / %', v_r, v_r2;
  end if;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select 'ALL 0024 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
