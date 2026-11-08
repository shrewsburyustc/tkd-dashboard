-- =====================================================================
-- 0045_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0045_calendar_items.sql (the
--   Calendar reader calendar_items(from, to), rulebook v0.645; contract
--   docs/Prospects/CONTRACT-0045.md). It checks, in this order:
--     W  who may call it: nobody signed in (anon) can't (permission
--        denied); the front desk may (staff and admins both); an admin who
--        pressed Lock, and no session at all -> no_access (answered
--        before the input is looked at)
--     R  the range rules: a missing or infinite date, an end before the start, 63 days
--        or more -> invalid; one day and exactly 63 days (62 apart) -> ok;
--        a window with nothing in it -> ok with an empty list
--     K  the whole answer for one window of seeded things (26 items): every
--        kind in its exact shape (all 13 keys, null where nothing applies),
--        in the contract's order (date, start with all-day first, kind,
--        id) - Color Belt events (with and without classes) and a private
--        testing, Star events (with and without an end time) and a private
--        test, camp days of a one-school and a both-schools camp, Black
--        Belt days (a second part's end; a school place and a free-text
--        place), sign-ups (own last name, the parent's initial, first name
--        alone, a lower-case last name), and every deadline kind
--     O  what is left out: a cancelled Color Belt private testing, a
--        withdrawn Star private test, a Star candidate without a private
--        day; deadlines that are empty or out of range; and a sign-up on
--        the edge of a Massachusetts day (11:30 pm local = the next day in
--        UTC, in winter and summer time, both sides)
--     P  privacy: the text of the answer holds no last name, date of birth,
--        email, phone or parent name of the seeded rows
--     N  no writes: the function changes no row of any table it reads, no
--        status row, and writes no change_log row (called as an admin and
--        as the front desk, twice)
--     C  the catalog: one version; plpgsql, STABLE, security definer,
--        returns jsonb, search_path = '', owner = the forms table's owner;
--        only authenticated may run it (not PUBLIC, anon, service_role or
--        the public forms' logins); no SQL built from text; no write
--        statement in its code; every table named with its schema;
--        has_data_access() before anything is read; is_admin() unused
--   Every seeded thing is dated in March 2037 and named "zz test ...", so
--   it works whatever is already in the database (the window must be empty
--   first).
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the seeded events, camps, cycle,
--   forms, sign-ups, history rows, test sessions). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0031_tests.sql / 0042_tests.sql: a pretend login token per session
--   in request.jwt.claims. A1 = admin unlocked, A2 = admin who pressed
--   Lock (shut out), D1 = front desk unlocked.
--   One line sets the time a seeded sign-up was sent: a sign-up's time is
--   always "now" (and never changes), so for that line only the database's
--   own triggers are switched off with session_replication_role (inside
--   the rolled-back test).
--
-- BEFORE YOU RUN IT
--   1. 0009, 0036 and 0045 are applied (and the earlier sections' tables).
--      You need TWO existing, ACTIVE staff rows: an admin and the shared
--      front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations (the cancelled and
--      withdrawn seeds are changed inside the rolled-back transaction).
--      Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0045 TESTS PASSED".
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

  v_a1 uuid := gen_random_uuid();
  v_a2 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();
  v_amr jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60));
  v_c_a1 text;
  v_c_a2 text;
  v_c_d1 text;
  v_c_anon text := '{"role": "anon"}';
  v_claims text;

  v_tag  text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_slug_w text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_slug_s text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);

  v_r      jsonb;
  v_r2     jsonb;
  v_txt    text;
  v_n      integer;
  v_role   text;
  v_snap   text;
  v_snap2  text;
  v_exp    jsonb;
  v_sorted jsonb;
  v_fn     record;

  -- seeded things (all in March 2037)
  v_e1 uuid; v_e2 uuid;                 -- Color Belt events: with two classes / without
  v_p1 uuid; v_p2 uuid;                 -- Color Belt private testings: active / cancelled
  v_se1 uuid; v_se2 uuid;               -- Star events: with an end time / without
  v_sc1 uuid; v_sc2 uuid; v_sc3 uuid;   -- Star candidates: private / private but withdrawn / not private
  v_cp1 uuid; v_cp2 uuid;               -- camps: one school (Worcester) / both schools
  v_bc uuid; v_bd1 uuid; v_bd2 uuid;    -- Black Belt cycle and its two days
  v_fw uuid; v_fs uuid;                 -- forms: Worcester / Shrewsbury
  v_s1 uuid; v_s2 uuid; v_s3 uuid;      -- sign-ups
  v_pa uuid; v_pb uuid; v_pc uuid; v_pd uuid;   -- their children (prospects): Ava, Leo, Mia, Zed
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  if not exists (select 1 from public.staff s where s.id = v_admin and s.active and s.role = 'admin') then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  if not exists (select 1 from public.staff s where s.id = v_desk and s.active and s.role = 'staff') then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regprocedure('public.calendar_items(date, date)') is null then
    raise exception 'TEST SETUP: public.calendar_items is missing (is 0045 applied?)';
  end if;
  if not exists (select 1 from pg_attribute a where a.attrelid = 'public.prospects'::regclass and a.attname = 'child_last_name') then
    raise exception 'TEST SETUP: prospects.child_last_name is missing (is 0036 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  begin
    insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_a2, v_admin), (v_d1, v_desk);
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),          -- pressed Lock: shut out
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr)::text;

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   zzx(...)   one expected item, all 13 keys (null text = JSON null)
  --   zzsnap()   one md5 of every row of every table calendar_items reads (and of the
  --              status / activity tables and the history), to compare before and after
  execute $f$
    create function pg_temp.zzx(k text, i text, d text, st text, en text, loc text, title text, child text,
                                what text, place text, opens text, ref text, ev text) returns jsonb
    language sql as $b$
      select jsonb_build_object('kind', k, 'id', i, 'date', d, 'start', st, 'end', en, 'location_code', loc,
                                'title', title, 'child', child, 'what', what, 'place', place,
                                'opens', opens, 'ref_id', ref, 'event_id', ev);
    $b$;
  $f$;
  -- On Supabase, a function made by postgres gives nobody else the right to run it, and these are
  -- called inside `set local role …` blocks too: so each helper is opened to everyone, like a
  -- helper made in PGlite's "hostile defaults" (Color Belt's 0044 run found this on production).
  execute 'grant execute on function pg_temp.zzx(text, text, text, text, text, text, text, text, text, text, text, text, text) to public';
  execute $f$
    create function pg_temp.zzsnap() returns text
    language sql as $b$
      select md5(concat_ws('|',
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.testing_events t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.testing_event_classes t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.testing_private t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.star_events t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.star_candidates t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.camps t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.camp_days t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.bb_cycles t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.bb_cycle_days t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.forms t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.form_submissions t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.prospects t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.prospect_statuses t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.prospect_activity t),
        (select count(*) || ':' || coalesce(max(l.id), 0) from public.change_log l)));
    $b$;
  $f$;
  execute 'grant execute on function pg_temp.zzsnap() to public'; -- (as above)

  -- The window must be empty (the seeds below are the only things dated March 2037)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true or public.is_admin() is not true then
    raise exception 'TEST SETUP: A1 should be an unlocked admin';
  end if;
  v_r := public.calendar_items(date '2037-03-01', date '2037-04-15');
  reset role;
  if v_r ->> 'status' <> 'ok' or jsonb_array_length(v_r -> 'items') <> 0 then
    raise exception 'TEST SETUP: March - mid April 2037 should hold nothing yet: %', v_r;
  end if;

  -- The two forms for the sign-ups, made the normal way (as A1)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.forms_create('worcester', 'blank', v_tag || ' Visitor W', v_slug_w);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: form W: %', v_r; end if;
  v_fw := (v_r ->> 'id')::uuid;
  v_r := public.forms_create('shrewsbury', 'blank', v_tag || ' Visitor S', v_slug_s);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: form S: %', v_r; end if;
  v_fs := (v_r ->> 'id')::uuid;
  reset role;

  -- -------------------------------------------------------------------
  -- Seeds (as postgres; direct inserts, as the Finance and Star tests do)
  -- -------------------------------------------------------------------
  -- Color Belt: E1 at Worcester with two classes (16:00-17:00, 17:30-18:30) and a registration
  -- deadline; E2 at Shrewsbury without classes
  insert into public.testing_events (location_code, name, testing_date, auto_close_on, public_code, created_by_name, updated_by_name)
  values ('worcester', v_tag || ' CB one', date '2037-03-10', date '2037-03-05', public.testing_new_public_code(), '', '')
  returning id into v_e1;
  insert into public.testing_event_classes (event_id, class_id, class_name, position, start_time, end_time, final_award_kind)
  values (v_e1, gen_random_uuid(), 'Zz class b', 1, '17:30', '18:30', 'none'),
         (v_e1, gen_random_uuid(), 'Zz class a', 0, '16:00', '17:00', 'none');
  insert into public.testing_events (location_code, name, testing_date, public_code, created_by_name, updated_by_name)
  values ('shrewsbury', v_tag || ' CB two', date '2037-03-11', public.testing_new_public_code(), '', '')
  returning id into v_e2;
  -- Color Belt private testings: P1 active, P2 cancelled
  insert into public.testing_private (location_code, first_name, last_name, class_name, rank_name, belt_pattern, belt_color,
                                      belt_end_stripes, belt_end_stripe_color, to_kind, private_cents, paying_by,
                                      stripes_confirmed, private_date, private_time, created_by_name, updated_by_name)
  values ('worcester', 'Cal', 'Zzbelt', 'Zz class', 'Zz rank', 'solid', 'white', 0, 'yellow', 'none', 8500, 'cash',
          true, date '2037-03-12', time '16:30', '', '')
  returning id into v_p1;
  insert into public.testing_private (location_code, first_name, last_name, class_name, rank_name, belt_pattern, belt_color,
                                      belt_end_stripes, belt_end_stripe_color, to_kind, private_cents, paying_by,
                                      stripes_confirmed, private_date, private_time, created_by_name, updated_by_name)
  values ('worcester', 'Cam', 'Zzgone', 'Zz class', 'Zz rank', 'solid', 'white', 0, 'yellow', 'none', 8500, 'cash',
          true, date '2037-03-12', time '17:00', '', '')
  returning id into v_p2;
  update public.testing_private set status = 'cancelled', cancelled_at = now(), cancelled_by_name = 'zz test' where id = v_p2;

  -- Star: SE1 with an end time and a registration deadline, SE2 without an end time
  insert into public.star_events (name, testing_date, start_time, end_time, where_code, auto_close_on,
                                  public_code_worcester, public_code_shrewsbury, created_by_name, updated_by_name)
  values (v_tag || ' star one', date '2037-03-13', '10:00', '12:00', 'worcester', date '2037-03-06',
          public.testing_new_public_code(), public.testing_new_public_code(), '', '')
  returning id into v_se1;
  perform public.star_copy_template_into_event(v_se1);
  insert into public.star_events (name, testing_date, start_time, where_code, public_code_worcester, public_code_shrewsbury,
                                  created_by_name, updated_by_name)
  values (v_tag || ' star two', date '2037-03-14', '10:00', 'shrewsbury',
          public.testing_new_public_code(), public.testing_new_public_code(), '', '')
  returning id into v_se2;
  -- Star candidates of SE1: SC1 private test (with a date of birth and an email that must never come out),
  -- SC2 private but withdrawn, SC3 no private test
  insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                      stars_from, paying_by, source, private_on, private_time, created_by_name, updated_by_name)
  values (v_se1, 'Kai', 'Zzstar', date '1999-12-31', 'zz-cal-priv@example.com', 'shrewsbury', 1, 0, 'cash', 'desk',
          date '2037-03-15', time '15:00', '', '')
  returning id into v_sc1;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      private_on, private_time, created_by_name, updated_by_name)
  values (v_se1, 'Nia', 'Zzwith', 'worcester', 1, 0, 'cash', 'desk', date '2037-03-15', time '15:30', '', '')
  returning id into v_sc2;
  update public.star_candidates set status = 'withdrawn', withdrawn_reason = 'withdrawn', withdrawn_at = now(),
         withdrawn_by_name = 'zz test' where id = v_sc2;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      created_by_name, updated_by_name)
  values (v_se1, 'Ola', 'Zzplain', 'worcester', 1, 0, 'cash', 'desk', '', '')
  returning id into v_sc3;

  -- Camps: CP1 at Worcester (3 days), CP2 for both schools (1 day, the same day as CP1's second)
  insert into public.camps (location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on,
                            early_until, waiver_text, public_code, created_by_name, updated_by_name)
  values ('worcester', false, v_tag || ' Camp A', '09:00', '15:00', date '2037-03-02', date '2037-03-12', date '2037-03-09',
          'zz waiver', public.testing_new_public_code(), '', '')
  returning id into v_cp1;
  insert into public.camp_days (camp_id, day) values (v_cp1, date '2037-03-16'), (v_cp1, date '2037-03-17'), (v_cp1, date '2037-03-18');
  insert into public.camps (location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on,
                            early_until, waiver_text, public_code, created_by_name, updated_by_name)
  values ('worcester', true, v_tag || ' Camp B', '09:00', '15:00', date '2037-03-04', date '2037-03-13', date '2037-03-10',
          'zz waiver', public.testing_new_public_code(), '', '')
  returning id into v_cp2;
  insert into public.camp_days (camp_id, day) values (v_cp2, date '2037-03-17');

  -- Black Belt: one cycle (applications due 03-03, submissions due 03-20), a day with a second part
  -- at a school and a day at a free-text place
  insert into public.bb_cycles (name, application_due, submissions_due, public_code_worcester, public_code_shrewsbury,
                                requirements, created_by_name, updated_by_name)
  select v_tag || ' BB cycle', date '2037-03-03', date '2037-03-20', public.testing_new_public_code(), public.testing_new_public_code(),
         public.bb_rubric_fresh_copy(s.sheet), '', ''
    from public.bb_default_rubric s
  returning id into v_bc;
  if v_bc is null then raise exception 'TEST SETUP: bb_default_rubric has no row to copy the requirements from (is 0024 applied?)'; end if;
  insert into public.bb_cycle_days (cycle_id, name, day_date, start_time, end_time, place_code, second_start, second_end,
                                    second_place_code, created_by_name, updated_by_name)
  values (v_bc, 'Day one', date '2037-03-21', '09:00', '12:00', 'worcester', '13:00', '15:30', 'worcester', '', '')
  returning id into v_bd1;
  insert into public.bb_cycle_days (cycle_id, name, day_date, start_time, end_time, place_other, created_by_name, updated_by_name)
  values (v_bc, 'Outdoor day', date '2037-03-22', '10:00', '12:00', 'Horgan Arena, 403 Oxford St N, Auburn MA', '', '')
  returning id into v_bd2;

  -- Sign-ups (the normal insert makes the children's prospects; the time is set afterwards):
  --  S1 Worcester, parent "Pat Yyrivera": Ava (own last name Zznguyen) and Leo (sent the old way: no last name),
  --     sent 2037-03-09 03:30 UTC = 11:30 pm on March 8 in Massachusetts (summer time began that day)
  --  S2 Shrewsbury, parent "Cher" (one word): Mia (no last name), sent 2037-03-02 04:30 UTC = 11:30 pm on March 1 (winter)
  --  S3 Worcester, parent "Dee Wwpark": Zed (own last name in lower case, "qquinn"), sent 2037-03-09 04:30 UTC =
  --     00:30 on March 9 in Massachusetts
  insert into public.form_submissions (form_id, location_code, published_version, fields, answers, parent_name, parent_phone,
                                       parent_email, children, source, submission_key)
  values (v_fw, 'worcester', 1, '[]', '{}', 'Pat Yyrivera', '5085550199', 'zz-cal-parent@example.com',
          '[{"first_name":"Ava","last_name":"Zznguyen","dob":"2030-01-02","age":7},{"first_name":"Leo","age":9}]', 'staff', gen_random_uuid())
  returning id into v_s1;
  insert into public.form_submissions (form_id, location_code, published_version, fields, answers, parent_name, parent_phone,
                                       parent_email, children, source, submission_key)
  values (v_fs, 'shrewsbury', 1, '[]', '{}', 'Cher', '5085550198', 'zz-cal-cher@example.com',
          '[{"first_name":"Mia","age":5}]', 'staff', gen_random_uuid())
  returning id into v_s2;
  insert into public.form_submissions (form_id, location_code, published_version, fields, answers, parent_name, parent_phone,
                                       parent_email, children, source, submission_key)
  values (v_fw, 'worcester', 1, '[]', '{}', 'Dee Wwpark', '5085550197', 'zz-cal-dee@example.com',
          '[{"first_name":"Zed","last_name":"qquinn","dob":"2031-05-06","age":6}]', 'staff', gen_random_uuid())
  returning id into v_s3;
  begin
    set local session_replication_role = replica;      -- no triggers for these three lines only
    update public.form_submissions set created_at = timestamptz '2037-03-09 03:30:00+00' where id = v_s1;
    update public.form_submissions set created_at = timestamptz '2037-03-02 04:30:00+00' where id = v_s2;
    update public.form_submissions set created_at = timestamptz '2037-03-09 04:30:00+00' where id = v_s3;
    set local session_replication_role = origin;
  exception
    when insufficient_privilege then
      raise exception 'TEST SETUP: could not set a sign-up''s time (session_replication_role not allowed). Tell Claude.';
  end;
  select p.id into v_pa from public.prospects p where p.submission_id = v_s1 and p.child_index = 0;
  select p.id into v_pb from public.prospects p where p.submission_id = v_s1 and p.child_index = 1;
  select p.id into v_pc from public.prospects p where p.submission_id = v_s2 and p.child_index = 0;
  select p.id into v_pd from public.prospects p where p.submission_id = v_s3 and p.child_index = 0;
  if v_pa is null or v_pb is null or v_pc is null or v_pd is null then
    raise exception 'TEST SETUP: the sign-ups should have made 4 prospects';
  end if;

  -- The 26 items calendar_items must answer for 2037-03-01 .. 2037-04-15 (listed here in date order;
  -- the check sorts them the contract's way before comparing)
  v_exp := jsonb_build_array(
    pg_temp.zzx('signup', v_pc::text, '2037-03-01', null, null, 'shrewsbury', v_tag || ' Visitor S', 'Mia', null, null, 'prospect', v_pc::text, null),
    pg_temp.zzx('deadline', v_cp1 || ':signup_opens', '2037-03-02', null, null, 'worcester', v_tag || ' Camp A', null, 'signup_opens', null, 'camp', v_cp1::text, null),
    pg_temp.zzx('deadline', v_bc || ':applications_due', '2037-03-03', null, null, null, v_tag || ' BB cycle', null, 'applications_due', null, 'bb_cycle', v_bc::text, null),
    pg_temp.zzx('deadline', v_cp2 || ':signup_opens', '2037-03-04', null, null, null, v_tag || ' Camp B', null, 'signup_opens', null, 'camp', v_cp2::text, null),
    pg_temp.zzx('deadline', v_e1 || ':registration_closes', '2037-03-05', null, null, 'worcester', v_tag || ' CB one', null, 'registration_closes', null, 'colorbelt_event', v_e1::text, null),
    pg_temp.zzx('deadline', v_se1 || ':registration_closes', '2037-03-06', null, null, null, v_tag || ' star one', null, 'registration_closes', null, 'star_event', v_se1::text, null),
    pg_temp.zzx('signup', v_pa::text, '2037-03-08', null, null, 'worcester', v_tag || ' Visitor W', 'Ava Z.', null, null, 'prospect', v_pa::text, null),
    pg_temp.zzx('signup', v_pb::text, '2037-03-08', null, null, 'worcester', v_tag || ' Visitor W', 'Leo Y.', null, null, 'prospect', v_pb::text, null),
    pg_temp.zzx('deadline', v_cp1 || ':early_price_ends', '2037-03-09', null, null, 'worcester', v_tag || ' Camp A', null, 'early_price_ends', null, 'camp', v_cp1::text, null),
    pg_temp.zzx('signup', v_pd::text, '2037-03-09', null, null, 'worcester', v_tag || ' Visitor W', 'Zed Q.', null, null, 'prospect', v_pd::text, null),
    pg_temp.zzx('deadline', v_cp2 || ':early_price_ends', '2037-03-10', null, null, null, v_tag || ' Camp B', null, 'early_price_ends', null, 'camp', v_cp2::text, null),
    pg_temp.zzx('colorbelt_event', v_e1::text, '2037-03-10', '16:00', '18:30', 'worcester', v_tag || ' CB one', null, null, null, 'colorbelt_event', v_e1::text, null),
    pg_temp.zzx('colorbelt_event', v_e2::text, '2037-03-11', null, null, 'shrewsbury', v_tag || ' CB two', null, null, null, 'colorbelt_event', v_e2::text, null),
    pg_temp.zzx('deadline', v_cp1 || ':signup_closes', '2037-03-12', null, null, 'worcester', v_tag || ' Camp A', null, 'signup_closes', null, 'camp', v_cp1::text, null),
    pg_temp.zzx('colorbelt_private', v_p1::text, '2037-03-12', '16:30', null, 'worcester', 'Private', 'Cal Z.', null, null, 'colorbelt_private', v_p1::text, null),
    pg_temp.zzx('deadline', v_cp2 || ':signup_closes', '2037-03-13', null, null, null, v_tag || ' Camp B', null, 'signup_closes', null, 'camp', v_cp2::text, null),
    pg_temp.zzx('star_event', v_se1::text, '2037-03-13', '10:00', '12:00', null, v_tag || ' star one', null, null, null, 'star_event', v_se1::text, null),
    pg_temp.zzx('star_event', v_se2::text, '2037-03-14', '10:00', null, null, v_tag || ' star two', null, null, null, 'star_event', v_se2::text, null),
    pg_temp.zzx('star_private', v_sc1::text, '2037-03-15', '15:00', null, 'shrewsbury', 'Private', 'Kai Z.', null, null, 'star_private', v_sc1::text, v_se1::text),
    pg_temp.zzx('camp_day', v_cp1 || ':2037-03-16', '2037-03-16', '09:00', '15:00', 'worcester', v_tag || ' Camp A', null, null, null, 'camp', v_cp1::text, null),
    pg_temp.zzx('camp_day', v_cp1 || ':2037-03-17', '2037-03-17', '09:00', '15:00', 'worcester', v_tag || ' Camp A', null, null, null, 'camp', v_cp1::text, null),
    pg_temp.zzx('camp_day', v_cp2 || ':2037-03-17', '2037-03-17', '09:00', '15:00', null, v_tag || ' Camp B', null, null, null, 'camp', v_cp2::text, null),
    pg_temp.zzx('camp_day', v_cp1 || ':2037-03-18', '2037-03-18', '09:00', '15:00', 'worcester', v_tag || ' Camp A', null, null, null, 'camp', v_cp1::text, null),
    pg_temp.zzx('deadline', v_bc || ':submissions_due', '2037-03-20', null, null, null, v_tag || ' BB cycle', null, 'submissions_due', null, 'bb_cycle', v_bc::text, null),
    pg_temp.zzx('bb_day', v_bd1::text, '2037-03-21', '09:00', '15:30', 'worcester', v_tag || ' BB cycle', null, 'Day one', null, 'bb_cycle', v_bc::text, null),
    pg_temp.zzx('bb_day', v_bd2::text, '2037-03-22', '10:00', '12:00', null, v_tag || ' BB cycle', null, 'Outdoor day', 'Horgan Arena, 403 Oxford St N, Auburn MA', 'bb_cycle', v_bc::text, null));
  -- (S1's second child Leo was sent the old way: the parent's last initial - Pat "Yyrivera" - gives "Leo Y.")
  select jsonb_agg(e order by (e ->> 'date') collate "C", (e ->> 'start') collate "C" nulls first,
                              (e ->> 'kind') collate "C", (e ->> 'id') collate "C")
    into v_sorted from jsonb_array_elements(v_exp) e;
  if jsonb_array_length(v_sorted) <> 26 then raise exception 'TEST SETUP: expected 26 items, built %', jsonb_array_length(v_sorted); end if;

  -- ===================================================================
  -- W. Who may call it
  -- ===================================================================
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform public.calendar_items(date '2037-03-01', date '2037-03-31');
        raise exception 'TEST FAILED: W1 anon called calendar_items'; exception when insufficient_privilege then null; end;
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.calendar_items(date '2037-03-01', date '2037-04-15');
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'items' is distinct from v_sorted then
    raise exception 'TEST FAILED: W2 the front desk should get the same answer as an admin (status %)', v_r ->> 'status';
  end if;
  foreach v_claims in array array[v_c_a2, ''] loop
    perform set_config('request.jwt.claims', v_claims, true);
    v_txt := concat_ws(',',
      public.calendar_items(date '2037-03-01', date '2037-03-31') ->> 'status',
      public.calendar_items(null, null) ->> 'status',
      public.calendar_items(date '2037-03-31', date '2037-03-01') ->> 'status',
      public.calendar_items(date 'infinity', date '-infinity') ->> 'status');
    if v_txt <> 'no_access,no_access,no_access,no_access' then
      raise exception 'TEST FAILED: W3 % gave % (expected no_access, before the input check)',
        case when v_claims = '' then 'no session' else 'an admin who pressed Lock' end, v_txt;
    end if;
    if (public.calendar_items(date '2037-03-01', date '2037-03-31') ? 'items') then
      raise exception 'TEST FAILED: W4 a refused call must not carry items';
    end if;
  end loop;

  -- ===================================================================
  -- R. The range rules (as A1)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_txt := concat_ws(',',
    public.calendar_items(null, null) ->> 'status',
    public.calendar_items(date '2037-03-01', null) ->> 'status',
    public.calendar_items(null, date '2037-03-01') ->> 'status',
    public.calendar_items(date '2037-03-02', date '2037-03-01') ->> 'status',                 -- end before start
    public.calendar_items(date '2037-03-01', date '2037-05-03') ->> 'status',                 -- 63 days apart (64 days)
    public.calendar_items(date '2037-03-01', date '2037-05-02') ->> 'status',                 -- 62 days apart (63 days): ok
    public.calendar_items(date '2037-03-08', date '2037-03-08') ->> 'status',                 -- one day: ok
    public.calendar_items(date '2037-06-01', date '2037-06-30') ->> 'status');                -- nothing in it: ok
  if v_txt <> 'invalid,invalid,invalid,invalid,invalid,ok,ok,ok' then
    raise exception 'TEST FAILED: R1 range answers were % (expected invalid x5, then ok x3)', v_txt;
  end if;
  v_r := public.calendar_items(date '2037-06-01', date '2037-06-30');
  if v_r <> '{"status": "ok", "items": []}'::jsonb then
    raise exception 'TEST FAILED: R2 an empty window should answer {status ok, items []}: %', v_r;
  end if;
  -- R4: infinity as either date answers invalid (not an error); a locked session still gets no_access first (W3)
  v_txt := concat_ws(',',
    public.calendar_items(date 'infinity', date '2037-03-01') ->> 'status',
    public.calendar_items(date '2037-03-01', date 'infinity') ->> 'status',
    public.calendar_items(date '-infinity', date '2037-03-01') ->> 'status',
    public.calendar_items(date '2037-03-01', date '-infinity') ->> 'status',
    public.calendar_items(date '-infinity', date 'infinity') ->> 'status',
    public.calendar_items(date 'infinity', date 'infinity') ->> 'status');
  if v_txt <> 'invalid,invalid,invalid,invalid,invalid,invalid' then
    raise exception 'TEST FAILED: R4 an infinite date should answer invalid: %', v_txt;
  end if;
  v_r := public.calendar_items(date '2037-03-01', date '2037-05-03');
  if v_r <> '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: R3 invalid should carry nothing else: %', v_r;
  end if;

  -- ===================================================================
  -- K. The whole answer (as A1): all 26 items, every key, in the contract's order
  -- ===================================================================
  v_r := public.calendar_items(date '2037-03-01', date '2037-04-15');
  reset role;
  if v_r ->> 'status' is distinct from 'ok' or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['items', 'status'] then
    raise exception 'TEST FAILED: K1 the answer should be exactly {status ok, items}: %', left(v_r::text, 300);
  end if;
  if exists (select 1 from jsonb_array_elements(v_r -> 'items') e
              where (select count(*) from jsonb_object_keys(e)) <> 13
                 or not (e ?& array['kind', 'id', 'date', 'start', 'end', 'location_code', 'title', 'child', 'what', 'place',
                                    'opens', 'ref_id', 'event_id'])) then
    raise exception 'TEST FAILED: K2 every item must have exactly the 13 keys';
  end if;
  if jsonb_array_length(v_r -> 'items') <> 26 then
    raise exception 'TEST FAILED: K3 expected 26 items, got %: %', jsonb_array_length(v_r -> 'items'),
      (select string_agg(e ->> 'date' || ' ' || (e ->> 'kind'), ', ') from jsonb_array_elements(v_r -> 'items') e);
  end if;
  -- every item by itself (a clearer message than comparing the whole list)
  for v_txt in select e ->> 'kind' || ' ' || (e ->> 'id') from jsonb_array_elements(v_sorted) e loop
    if not exists (select 1 from jsonb_array_elements(v_r -> 'items') a
                    where a = (select e from jsonb_array_elements(v_sorted) e where e ->> 'kind' || ' ' || (e ->> 'id') = v_txt)) then
      raise exception 'TEST FAILED: K4 item "%" is missing or wrong. Expected %. Got %', v_txt,
        (select e from jsonb_array_elements(v_sorted) e where e ->> 'kind' || ' ' || (e ->> 'id') = v_txt),
        (select a from jsonb_array_elements(v_r -> 'items') a where a ->> 'kind' || ' ' || (a ->> 'id') = v_txt);
    end if;
  end loop;
  -- the order: date, start (all-day first), kind, id
  if v_r -> 'items' is distinct from v_sorted then
    raise exception 'TEST FAILED: K5 the items are not in the contract''s order (date, start with all-day first, kind, id)';
  end if;
  -- spot checks of the rules the list shows: all-day before timed on one day (03-10, 03-12, 03-13);
  -- two of a kind on one day by id (03-08, 03-17); a deadline before a sign-up on one day (03-09)
  if (select (e ->> 'kind') from jsonb_array_elements(v_r -> 'items') with ordinality t(e, n) where e ->> 'date' = '2037-03-10' order by n limit 1) <> 'deadline'
     or (select (e ->> 'kind') from jsonb_array_elements(v_r -> 'items') with ordinality t(e, n) where e ->> 'date' = '2037-03-09' order by n limit 1) <> 'deadline' then
    raise exception 'TEST FAILED: K6 on one day an all-day deadline should come before a timed item or a sign-up';
  end if;
  -- K7: a Star event answers no school; a both-schools camp answers no school; a camp for one school its own
  if exists (select 1 from jsonb_array_elements(v_r -> 'items') e where e ->> 'kind' = 'star_event' and e -> 'location_code' <> 'null'::jsonb)
     or (select count(*) from jsonb_array_elements(v_r -> 'items') e
          where e ->> 'kind' = 'camp_day' and e -> 'location_code' = 'null'::jsonb) <> 1 then
    raise exception 'TEST FAILED: K7 Star events and a both-schools camp answer school null (one camp day only, not the Worcester camp)';
  end if;
  -- K8: all six deadline words and the other kinds appear
  if (select array_agg(distinct e ->> 'what' order by e ->> 'what') from jsonb_array_elements(v_r -> 'items') e where e ->> 'kind' = 'deadline')
       is distinct from array['applications_due', 'early_price_ends', 'registration_closes', 'signup_closes', 'signup_opens', 'submissions_due']
     or (select array_agg(distinct e ->> 'kind' order by e ->> 'kind') from jsonb_array_elements(v_r -> 'items') e)
       is distinct from array['bb_day', 'camp_day', 'colorbelt_event', 'colorbelt_private', 'deadline', 'signup', 'star_event', 'star_private'] then
    raise exception 'TEST FAILED: K8 every deadline word and every kind should appear';
  end if;

  -- ===================================================================
  -- O. Left out, narrow windows, the edge of a Massachusetts day (as A1)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- O1: the cancelled private testing, the withdrawn private test and a candidate without a private day are not there
  v_r := public.calendar_items(date '2037-03-12', date '2037-03-15');
  v_txt := (select string_agg(e ->> 'kind' || ':' || coalesce(e ->> 'child', e ->> 'what', '-'), ', ' order by n)
              from jsonb_array_elements(v_r -> 'items') with ordinality t(e, n));
  if v_txt <> 'deadline:signup_closes, colorbelt_private:Cal Z., deadline:signup_closes, star_event:-, star_event:-, star_private:Kai Z.' then
    raise exception 'TEST FAILED: O1 a cancelled / withdrawn private test, or a candidate without one, showed up (or something is missing): %', v_txt;
  end if;
  -- O2: a deadline appears only on its own day; a day with none gives an empty list
  v_r := public.calendar_items(date '2037-03-07', date '2037-03-07');
  if v_r <> '{"status": "ok", "items": []}'::jsonb then raise exception 'TEST FAILED: O2 2037-03-07 should be empty: %', v_r; end if;
  v_r := public.calendar_items(date '2037-03-06', date '2037-03-06');
  if jsonb_array_length(v_r -> 'items') <> 1 or v_r -> 'items' -> 0 ->> 'what' <> 'registration_closes' or v_r -> 'items' -> 0 ->> 'kind' <> 'deadline' then
    raise exception 'TEST FAILED: O3 2037-03-06 should hold just the Star registration deadline: %', v_r;
  end if;
  -- O4: a deadline column left empty (CB two has no auto_close_on) gives nothing
  if exists (select 1 from jsonb_array_elements(public.calendar_items(date '2037-03-01', date '2037-04-15') -> 'items') e
              where e ->> 'kind' = 'deadline' and e ->> 'ref_id' = v_e2::text) then
    raise exception 'TEST FAILED: O4 an empty deadline column should give no deadline item';
  end if;
  -- O5: the sign-up sent at 11:30 pm on March 8 (03:30 UTC March 9) counts on March 8, not March 9; the one sent at
  -- 00:30 on March 9 (04:30 UTC) counts on March 9
  v_txt := concat_ws(' / ',
    (select string_agg(e ->> 'child', ',' order by e ->> 'child') from jsonb_array_elements(public.calendar_items(date '2037-03-08', date '2037-03-08') -> 'items') e where e ->> 'kind' = 'signup'),
    (select string_agg(e ->> 'child', ',' order by e ->> 'child') from jsonb_array_elements(public.calendar_items(date '2037-03-09', date '2037-03-09') -> 'items') e where e ->> 'kind' = 'signup'));
  if v_txt <> 'Ava Z.,Leo Y. / Zed Q.' then
    raise exception 'TEST FAILED: O5 summer-time edge: sign-ups on 03-08 / 03-09 were "%" (expected "Ava Z.,Leo Y. / Zed Q.")', v_txt;
  end if;
  -- O6: winter edge: sent 04:30 UTC on March 2 = 11:30 pm on March 1: it is on March 1, not on March 2
  v_txt := concat_ws(' / ',
    (select string_agg(e ->> 'child', ',') from jsonb_array_elements(public.calendar_items(date '2037-03-01', date '2037-03-01') -> 'items') e where e ->> 'kind' = 'signup'),
    (select count(*)::text from jsonb_array_elements(public.calendar_items(date '2037-03-02', date '2037-03-02') -> 'items') e where e ->> 'kind' = 'signup'));
  if v_txt <> 'Mia / 0' then
    raise exception 'TEST FAILED: O6 winter-time edge: sign-ups on 03-01 / 03-02 were "%" (expected "Mia / 0")', v_txt;
  end if;
  -- O7: the window's own first and last day are both included
  v_r := public.calendar_items(date '2037-03-21', date '2037-03-22');
  if (select string_agg(e ->> 'what', ',' order by n) from jsonb_array_elements(v_r -> 'items') with ordinality t(e, n)) <> 'Day one,Outdoor day' then
    raise exception 'TEST FAILED: O7 a window should include its first and last day: %', v_r;
  end if;
  reset role;

  -- ===================================================================
  -- P. Privacy: nothing private in the text of the answer
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_txt := lower(public.calendar_items(date '2037-03-01', date '2037-04-15')::text);
  reset role;
  foreach v_role in array array['zznguyen', 'qquinn', 'zzstar', 'zzbelt', 'zzgone', 'zzwith', 'zzplain', 'yyrivera', 'wwpark',
                                'pat ', 'dee ', 'cher', 'zz-cal-priv', 'zz-cal-parent', 'zz-cal-dee', 'zz-cal-cher', '@example.com',
                                '5085550199', '5085550198', '5085550197', '1999-12-31', '2030-01-02', '2031-05-06',
                                'date_of_birth', 'dob', 'email', 'phone', 'address', 'signature', 'answers', 'cents', 'paying'] loop
    if position(v_role in v_txt) > 0 then
      raise exception 'TEST FAILED: P1 the answer holds "%" (a last name, date of birth, email, phone, parent name or private column)', v_role;
    end if;
  end loop;
  -- every child is "First X." (or the first name alone): no second word longer than an initial and a dot
  if exists (select 1 from jsonb_array_elements((v_sorted)) e
              where e ->> 'child' is not null and e ->> 'child' !~ '^[^ ]+( [A-Z]\.)?$') then
    raise exception 'TEST FAILED: P2 a child is not shown as an initial';
  end if;

  -- ===================================================================
  -- N. It writes nothing (as A1 and as the front desk, twice)
  -- ===================================================================
  v_snap := pg_temp.zzsnap();
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r  := public.calendar_items(date '2037-03-01', date '2037-04-15');
  v_r2 := public.calendar_items(date '2037-03-01', date '2037-04-15');
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform public.calendar_items(date '2037-03-01', date '2037-04-15');
  perform public.calendar_items(date '2037-03-12', date '2037-03-12');
  perform set_config('request.jwt.claims', v_c_a2, true);
  perform public.calendar_items(date '2037-03-01', date '2037-04-15');
  reset role;
  v_snap2 := pg_temp.zzsnap();
  if v_snap is distinct from v_snap2 then
    raise exception 'TEST FAILED: N1 calling calendar_items changed a row (or wrote history) in a table it reads';
  end if;
  if v_r is distinct from v_r2 then raise exception 'TEST FAILED: N2 the same call twice gave different answers'; end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: N3 history tags set after the calls: action %, batch %',
      current_setting('tkd.action', true), current_setting('tkd.batch_id', true);
  end if;

  -- ===================================================================
  -- C. The catalog
  -- ===================================================================
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'calendar_items';
  if v_n <> 1 then raise exception 'TEST FAILED: C1 expected exactly one calendar_items, found %', v_n; end if;
  select p.oid, p.prosecdef, p.proconfig, p.provolatile::text as vol, p.proowner, p.prorettype, l.lanname, p.proacl, p.prosrc into v_fn
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.calendar_items(date, date)'::regprocedure;
  if v_fn.lanname <> 'plpgsql' or v_fn.vol <> 's' or v_fn.prosecdef is not true or v_fn.prorettype <> 'jsonb'::regtype then
    raise exception 'TEST FAILED: C2 calendar_items should be plpgsql, STABLE, security definer, returning jsonb';
  end if;
  if v_fn.proconfig is distinct from array['search_path=""'] then
    raise exception 'TEST FAILED: C3 calendar_items settings are % (expected only search_path="")', v_fn.proconfig;
  end if;
  if v_fn.proowner <> (select c.relowner from pg_class c where c.oid = 'public.forms'::regclass) then
    raise exception 'TEST FAILED: C4 calendar_items''s owner differs from the forms table''s owner';
  end if;
  if exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) a where a.grantee = 0) then
    raise exception 'TEST FAILED: C5 PUBLIC can run calendar_items';
  end if;
  foreach v_role in array array['anon', 'service_role', 'forms_registrar', 'testing_registrar', 'star_registrar', 'bb_registrar', 'camps_registrar'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role)
       and has_function_privilege(v_role, v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: C6 % may run calendar_items', v_role;
    end if;
  end loop;
  if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') is not true then
    raise exception 'TEST FAILED: C7 authenticated may not run calendar_items';
  end if;
  -- the code, without its comments: no SQL built from text, no write, no is_admin(), tables named with
  -- their schema, and the access check before anything is read
  v_txt := regexp_replace(v_fn.prosrc, '--[^\n]*', '', 'g');
  if v_txt ~* '\mexecute\M' then
    raise exception 'TEST FAILED: C8 calendar_items builds and runs SQL text';
  end if;
  if v_txt ~* '\m(insert|update|delete|truncate|merge|perform|set_config|nextval|pg_advisory)\M' then
    raise exception 'TEST FAILED: C9 calendar_items has a write (or a call that could write) in its code';
  end if;
  if v_txt ~* 'is_admin' then
    raise exception 'TEST FAILED: C10 calendar_items must not use is_admin()';
  end if;
  if v_txt ~* '\m(from|join)\s+(?!public\.|lateral\M|\()' then
    raise exception 'TEST FAILED: C11 calendar_items names a table without its schema';
  end if;
  if position('has_data_access' in v_txt) = 0 or position('has_data_access' in v_txt) > position('select' in v_txt) then
    raise exception 'TEST FAILED: C12 calendar_items should check has_data_access() before it reads anything';
  end if;
  if v_txt !~ 'isfinite\(p_from\)' or v_txt !~ 'isfinite\(p_to\)' or position('isfinite' in v_txt) > position('p_to - p_from' in v_txt) then
    raise exception 'TEST FAILED: C14 calendar_items should test isfinite() before it subtracts dates';
  end if;
  if v_txt !~ 'p_to - p_from > 62' then
    raise exception 'TEST FAILED: C13 calendar_items should cap the range (p_to - p_from > 62)';
  end if;

  raise notice 'ALL 0045 TESTS PASSED';
end
$$;

select 'ALL 0045 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
