-- =====================================================================
-- 0049_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0049_people_search.sql (the top-bar
--   "Search people", people_search(text, school), Dashboard core M16,
--   rulebook v1.144). It checks, in this order:
--     W  who may call it: nobody signed in (anon) can't (permission denied);
--        the front desk may (staff and admins both); an admin who pressed
--        Lock, a desk whose PIN time ran out, a login with no staff row and
--        no session at all -> no_access (answered before the input is looked at)
--     R  the input rules: a missing text, 1 character (after trimming), 81
--        characters and an unknown school -> invalid; 2 and 80 characters ok;
--        a blank or missing school = both schools; 'Both' and 'WORCESTER' are
--        accepted in any case
--     K  the whole answer for one typed text that finds 15 seeded people (one
--        or more of every kind): every result with exactly the 6 keys, the
--        kinds in their order (colorbelt, colorbelt_private, star, black_belt,
--        camp, prospect), names sorted inside a kind, the exact name / event /
--        school values, a camp for both schools answering school null, and
--        the New students label "Ava Z." from the child's own last name, from
--        the LAST word of a parent name of more than one word when the child
--        has no last name, and the first name alone when neither is there
--     O  what is left out: a withdrawn Color Belt student, Star candidate,
--        Black Belt candidate and camper, a cancelled Color Belt private
--        testing; the other school when one school is asked (a camp for both
--        schools stays); and text that matches only a PARENT's name, a
--        parent's last word or a phone number never finds a New students child
--     P  privacy: the result keys are exactly the 6, and no date of birth,
--        email, phone, parent name or last name of a New students child
--        appears anywhere in the answer's text
--     M  matching: capitals don't matter, the text may be a part of a name,
--        spaces around it are ignored, and % _ and \ typed are taken
--        literally ("a%" does not mean "a followed by anything")
--     L  the limit: 30 people of one kind give exactly 25 (the first 25 by
--        name), and the limit is per kind (another kind still shows)
--     N  no writes: no row of any table it reads, no status row and no
--        change_log row changes (called as an admin and as the front desk,
--        also with refused and invalid input)
--     C  the catalog: one version; plpgsql, STABLE, security definer, returns
--        jsonb, search_path = '', owner = the forms table's owner; only
--        authenticated may run it (not PUBLIC, anon, service_role or the
--        public forms' logins); no SQL built from text; no write statement in
--        its code; every table named with its schema; has_data_access()
--        before anything is read; is_admin() unused; six limits of 25
--   Every person is named "<First> zq..." / "zl..." / "zm..." with a random
--   code, and every event, camp, cycle and form is named "zz test ...", so it
--   works whatever is already in the database (a text with a random code
--   finds only the seeds).
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the seeded events, camps, cycle,
--   forms, sign-ups, people, test sessions). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0045_tests.sql: a pretend login token per session in
--   request.jwt.claims. A1 = admin unlocked, A2 = admin who pressed Lock
--   (shut out), D1 = front desk unlocked, D2 = front desk whose PIN time
--   ran out.
--
-- BEFORE YOU RUN IT
--   1. 0009, 0036 and 0049 are applied (and the earlier sections' tables).
--      You need TWO existing, ACTIVE staff rows: an admin and the shared
--      front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations (the withdrawn and
--      cancelled seeds are changed inside the rolled-back transaction).
--      Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0049 TESTS PASSED".
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
  v_d2 uuid := gen_random_uuid();
  v_amr jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60));
  v_c_a1 text;
  v_c_a2 text;
  v_c_d1 text;
  v_c_d2 text;
  v_c_nostaff text;
  v_c_anon text := '{"role": "anon"}';
  v_claims text;

  v_tag  text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_k    text := 'zq' || left(replace(gen_random_uuid()::text, '-', ''), 8);   -- the code in every person of section K
  v_l    text := 'zl' || left(replace(gen_random_uuid()::text, '-', ''), 8);   -- the code of section L (the limit)
  v_m    text := 'zm' || left(replace(gen_random_uuid()::text, '-', ''), 8);   -- the code of section M (matching)
  v_pl   text := 'zp' || left(replace(gen_random_uuid()::text, '-', ''), 8);   -- a New students child's own last name (Ava)
  v_pq   text := 'qq' || left(replace(gen_random_uuid()::text, '-', ''), 8);   -- a New students child's own last name (Zed)
  v_pt   text := 'yy' || left(replace(gen_random_uuid()::text, '-', ''), 8);   -- the last word of a parent's name (two words)
  v_p2   text := 'xx' || left(replace(gen_random_uuid()::text, '-', ''), 8);   -- a parent's name of ONE word
  v_p3   text := 'ww' || left(replace(gen_random_uuid()::text, '-', ''), 8);   -- the last word of another parent's name
  v_slug_w text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_slug_s text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);

  v_r      jsonb;
  v_r2     jsonb;
  v_txt    text;
  v_txt2   text;
  v_n      integer;
  v_i      integer;
  v_role   text;
  v_snap   text;
  v_snap2  text;
  v_exp    jsonb;
  v_exp_w  jsonb;
  v_exp_s  jsonb;
  v_fn     record;

  -- seeded things
  v_cls_w uuid; v_cls_s uuid; v_rank_w uuid; v_rank_s uuid;   -- Color Belt classes and ranks (one per school)
  v_ea uuid; v_eb uuid;                  -- Color Belt events: Worcester / Shrewsbury
  v_er_a uuid; v_er_b uuid;              -- their event ranks
  v_cb1 uuid; v_cb2 uuid; v_cb3 uuid;    -- Color Belt students: Cora (active, Worcester), Wade (withdrawn), Cobb (active, Shrewsbury)
  v_pr1 uuid; v_pr2 uuid; v_pr3 uuid;    -- private testings: Pia (active, Worcester), Pam (cancelled), Pip (active, Shrewsbury)
  v_se1 uuid;                            -- Star event
  v_sc1 uuid; v_sc2 uuid; v_sc3 uuid;    -- Star: Stan (active, Worcester), Wilma (withdrawn), Sue (active, Shrewsbury)
  v_bc uuid; v_bp uuid;                  -- Black Belt cycle and its plan
  v_bb1 uuid; v_bb2 uuid; v_bb3 uuid;    -- Black Belt: Bea (active, Worcester), Walt (withdrawn), Bo (active, Shrewsbury)
  v_cpa uuid; v_cpb uuid; v_cpc uuid;    -- camps: Worcester only / both schools / Shrewsbury only
  v_sga uuid; v_sgb uuid; v_sgc uuid;    -- their sign-ups
  v_cm1 uuid; v_cm2 uuid; v_cm3 uuid; v_cm4 uuid;   -- campers: Cam (A, active), Cass (A, withdrawn), Cleo (B), Coy (C)
  v_fw uuid; v_fs uuid;                  -- forms: Worcester / Shrewsbury
  v_s1 uuid; v_s2 uuid; v_s3 uuid;       -- sign-ups
  v_pa uuid; v_pb uuid; v_pc uuid; v_pd uuid;       -- their children (prospects): Ava, Leo, Mia, Zed
  v_mm1 uuid; v_mm2 uuid; v_mm3 uuid; v_mm4 uuid;   -- section M's four Star candidates
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
  if to_regprocedure('public.people_search(text, text)') is null then
    raise exception 'TEST SETUP: public.people_search is missing (is 0049 applied?)';
  end if;
  if not exists (select 1 from pg_attribute a where a.attrelid = 'public.prospects'::regclass and a.attname = 'child_last_name') then
    raise exception 'TEST SETUP: prospects.child_last_name is missing (is 0036 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  begin
    insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_a2, v_admin), (v_d1, v_desk), (v_d2, v_desk);
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),          -- pressed Lock: shut out
    (v_d1, v_desk,  now() + interval '30 minutes'),
    (v_d2, v_desk,  now() - interval '1 minute');          -- the desk's PIN time ran out
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr)::text;
  v_c_d2 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr)::text;
  -- a signed-in login that has no staff row at all
  v_c_nostaff := jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'session_id', gen_random_uuid(), 'amr', v_amr)::text;

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   zzx(...)   one expected result, all 6 keys (null text = JSON null)
  --   zzsnap()   one md5 of every row of every table people_search reads (and of the
  --              status / activity tables and the history), to compare before and after
  execute $f$
    create function pg_temp.zzx(k text, i text, ev text, n text, e text, s text) returns jsonb
    language sql as $b$
      select jsonb_build_object('kind', k, 'id', i, 'event_id', ev, 'name', n, 'event', e, 'school', s);
    $b$;
  $f$;
  -- On Supabase, a function made by postgres gives nobody else the right to run it, and these are
  -- called inside `set local role ...` blocks too: so each helper is opened to everyone (as 0045_tests.sql).
  execute 'grant execute on function pg_temp.zzx(text, text, text, text, text, text) to public';
  execute $f$
    create function pg_temp.zzsnap() returns text
    language sql as $b$
      select md5(concat_ws('|',
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.testing_events t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.testing_registrations t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.testing_private t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.star_events t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.star_candidates t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.bb_cycles t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.bb_candidates t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.camps t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.camp_campers t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.forms t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.form_submissions t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.prospects t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.prospect_statuses t),
        (select count(*) || ':' || coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text), '') from public.prospect_activity t),
        (select count(*) || ':' || coalesce(max(l.id), 0) from public.change_log l)));
    $b$;
  $f$;
  execute 'grant execute on function pg_temp.zzsnap() to public'; -- (as above)

  -- -------------------------------------------------------------------
  -- Seeds. The Color Belt classes / events and the two forms are made the normal way (as A1);
  -- everything else is inserted directly (as postgres, as the Finance, Star and Calendar tests do).
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true or public.is_admin() is not true then
    raise exception 'TEST SETUP: A1 should be an unlocked admin';
  end if;
  -- Color Belt: one class + rank + event at each school
  v_r := public.testing_add_class('worcester', v_tag || ' class W', null, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: class W: %', v_r; end if;
  v_cls_w := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_class('shrewsbury', v_tag || ' class S', null, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: class S: %', v_r; end if;
  v_cls_s := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_rank(v_cls_w, 'Yellow', 6500, 7500, 8500, false, 'solid', 'yellow', null, 0, 'yellow');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: rank W: %', v_r; end if;
  v_rank_w := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_rank(v_cls_s, 'Yellow', 6500, 7500, 8500, false, 'solid', 'yellow', null, 0, 'yellow');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: rank S: %', v_r; end if;
  v_rank_s := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_event('worcester', v_tag || ' CB A', date '2037-03-10',
           jsonb_build_array(jsonb_build_object('class_id', v_cls_w, 'start_time', '17:00', 'end_time', '18:00')), false, null, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: event A: %', v_r; end if;
  v_ea := (v_r ->> 'id')::uuid;
  v_r := public.testing_add_event('shrewsbury', v_tag || ' CB B', date '2037-03-11',
           jsonb_build_array(jsonb_build_object('class_id', v_cls_s, 'start_time', '17:00', 'end_time', '18:00')), false, null, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: event B: %', v_r; end if;
  v_eb := (v_r ->> 'id')::uuid;
  -- Black Belt: one cycle with one payment plan (as 0024_tests.sql makes one)
  v_r := public.bb_add_cycle(jsonb_build_object(
           'name', v_tag || ' BB cycle', 'application_due', date '2037-03-10', 'submissions_due', date '2037-03-27', 'auto_close', true,
           'days', jsonb_build_array(
             jsonb_build_object('name', 'Physical', 'day_date', date '2037-03-20', 'start_time', '12:30', 'end_time', '14:30',
                                'place', jsonb_build_object('code', 'worcester'), 'second', null,
                                'parts', jsonb_build_array('physical')),
             jsonb_build_object('name', 'Technical and Curriculum', 'day_date', date '2037-03-27', 'start_time', '12:30', 'end_time', '15:30',
                                'place', jsonb_build_object('code', 'shrewsbury'), 'second', null,
                                'parts', jsonb_build_array('technical', 'curriculum'))),
           'plans', jsonb_build_array(
             jsonb_build_object('name', 'In full',
                                'payments', jsonb_build_array(jsonb_build_object('due_on', date '2037-03-10', 'follows_application_due', true)),
                                'amounts', jsonb_build_object('1', jsonb_build_array(87000), '2', jsonb_build_array(99000),
                                                              '3', jsonb_build_array(150000), '4', jsonb_build_array(270000)))),
           'kukkiwon', jsonb_build_object('1', 10000, '2', 11000, '3', 14000, '4', 17000),
           'prices_from', null), null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: Black Belt cycle: %', v_r; end if;
  v_bc := (v_r ->> 'id')::uuid;
  -- the two forms for the sign-ups
  v_r := public.forms_create('worcester', 'blank', v_tag || ' Visitor W', v_slug_w);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: form W: %', v_r; end if;
  v_fw := (v_r ->> 'id')::uuid;
  v_r := public.forms_create('shrewsbury', 'blank', v_tag || ' Visitor S', v_slug_s);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: form S: %', v_r; end if;
  v_fs := (v_r ->> 'id')::uuid;
  reset role;

  select k.id into v_er_a from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ea and k.rank_id = v_rank_w;
  select k.id into v_er_b from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_eb and k.rank_id = v_rank_s;
  if v_er_a is null or v_er_b is null then raise exception 'TEST SETUP: the Color Belt events have no rank copy'; end if;

  -- Color Belt students: Cora (A, active), Wade (A, withdrawn), Cobb (B, active)
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
                                            created_by_name, updated_by_name)
  values (v_ea, v_er_a, 'Cora', v_k, 'cash', true, 'staff', '', '') returning id into v_cb1;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
                                            created_by_name, updated_by_name)
  values (v_ea, v_er_a, 'Wade', v_k, 'cash', true, 'staff', '', '') returning id into v_cb2;
  update public.testing_registrations
     set status = 'withdrawn', withdrawn_reason = 'withdrawn', withdrawn_at = now(), withdrawn_by_name = 'zz test'
   where id = v_cb2;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
                                            created_by_name, updated_by_name)
  values (v_eb, v_er_b, 'Cobb', v_k, 'cash', true, 'staff', '', '') returning id into v_cb3;

  -- Color Belt private testings: Pia (Worcester, active), Pam (Worcester, cancelled), Pip (Shrewsbury, active)
  insert into public.testing_private (location_code, first_name, last_name, class_name, rank_name, belt_pattern, belt_color,
                                      belt_end_stripes, belt_end_stripe_color, to_kind, private_cents, paying_by,
                                      stripes_confirmed, private_date, private_time, created_by_name, updated_by_name)
  values ('worcester', 'Pia', v_k, 'Zz class', 'Zz rank', 'solid', 'white', 0, 'yellow', 'none', 8500, 'cash',
          true, date '2037-03-12', time '16:30', '', '')
  returning id into v_pr1;
  insert into public.testing_private (location_code, first_name, last_name, class_name, rank_name, belt_pattern, belt_color,
                                      belt_end_stripes, belt_end_stripe_color, to_kind, private_cents, paying_by,
                                      stripes_confirmed, private_date, private_time, created_by_name, updated_by_name)
  values ('worcester', 'Pam', v_k, 'Zz class', 'Zz rank', 'solid', 'white', 0, 'yellow', 'none', 8500, 'cash',
          true, date '2037-03-12', time '17:00', '', '')
  returning id into v_pr2;
  update public.testing_private set status = 'cancelled', cancelled_at = now(), cancelled_by_name = 'zz test' where id = v_pr2;
  insert into public.testing_private (location_code, first_name, last_name, class_name, rank_name, belt_pattern, belt_color,
                                      belt_end_stripes, belt_end_stripe_color, to_kind, private_cents, paying_by,
                                      stripes_confirmed, private_date, private_time, created_by_name, updated_by_name)
  values ('shrewsbury', 'Pip', v_k, 'Zz class', 'Zz rank', 'solid', 'white', 0, 'yellow', 'none', 8500, 'cash',
          true, date '2037-03-12', time '17:30', '', '')
  returning id into v_pr3;

  -- Star: one event, and its candidates: Stan (Worcester, active; with a date of birth and an email that must
  -- never come out), Wilma (withdrawn), Sue (Shrewsbury, active)
  insert into public.star_events (name, testing_date, start_time, where_code, public_code_worcester, public_code_shrewsbury,
                                  created_by_name, updated_by_name)
  values (v_tag || ' star A', date '2037-03-14', '10:00', 'worcester',
          public.testing_new_public_code(), public.testing_new_public_code(), '', '')
  returning id into v_se1;
  perform public.star_copy_template_into_event(v_se1);
  insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                      stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_se1, 'Stan', v_k, date '1999-12-31', 'zz-ps-star@example.com', 'worcester', 1, 0, 'cash', 'desk', '', '')
  returning id into v_sc1;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      created_by_name, updated_by_name)
  values (v_se1, 'Wilma', v_k, 'worcester', 1, 0, 'cash', 'desk', '', '')
  returning id into v_sc2;
  update public.star_candidates set status = 'withdrawn', withdrawn_reason = 'withdrawn', withdrawn_at = now(),
         withdrawn_by_name = 'zz test' where id = v_sc2;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      created_by_name, updated_by_name)
  values (v_se1, 'Sue', v_k, 'shrewsbury', 1, 0, 'cash', 'desk', '', '')
  returning id into v_sc3;

  -- Black Belt: one cycle with one plan, and its candidates: Bea (Worcester, active), Walt (withdrawn),
  -- Bo (Shrewsbury, active); every one with a date of birth and an email that must never come out
  -- (the cycle itself was made through bb_add_cycle above: a cycle's plans are written only when it is added)
  select pl.id into v_bp from public.bb_cycle_plans pl where pl.cycle_id = v_bc order by pl.position limit 1;
  if v_bp is null then raise exception 'TEST SETUP: the Black Belt cycle has no plan'; end if;
  insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                    cycle_plan_id, kukkiwon, source, reference, created_by_name, updated_by_name)
  values (v_bc, 'Bea', v_k, date '2001-02-03', 'zz-ps-bea@example.com', 'worcester', 1, v_bp, false, 'desk',
          'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text, '', '')
  returning id into v_bb1;
  insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                    cycle_plan_id, kukkiwon, source, reference, created_by_name, updated_by_name)
  values (v_bc, 'Walt', v_k, date '2001-02-04', 'zz-ps-walt@example.com', 'worcester', 1, v_bp, false, 'desk',
          'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text, '', '')
  returning id into v_bb2;
  update public.bb_candidates set status = 'withdrawn', withdrawn_reason = 'withdrawn', withdrawn_at = now(),
         withdrawn_by_name = 'zz test' where id = v_bb2;
  insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                    cycle_plan_id, kukkiwon, source, reference, created_by_name, updated_by_name)
  values (v_bc, 'Bo', v_k, date '2001-02-05', 'zz-ps-bo@example.com', 'shrewsbury', 1, v_bp, false, 'desk',
          'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text, '', '')
  returning id into v_bb3;

  -- Camps: A (Worcester only), B (for both schools; its own school column says Worcester), C (Shrewsbury only)
  insert into public.camps (location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on,
                            early_until, waiver_text, public_code, created_by_name, updated_by_name)
  values ('worcester', false, v_tag || ' Camp A', '09:00', '15:00', date '2037-03-02', date '2037-03-12', date '2037-03-09',
          'zz waiver', public.testing_new_public_code(), '', '')
  returning id into v_cpa;
  insert into public.camp_days (camp_id, day) values (v_cpa, date '2037-03-16');
  insert into public.camps (location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on,
                            early_until, waiver_text, public_code, created_by_name, updated_by_name)
  values ('worcester', true, v_tag || ' Camp B', '09:00', '15:00', date '2037-03-04', date '2037-03-13', date '2037-03-10',
          'zz waiver', public.testing_new_public_code(), '', '')
  returning id into v_cpb;
  insert into public.camp_days (camp_id, day) values (v_cpb, date '2037-03-17');
  insert into public.camps (location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on,
                            early_until, waiver_text, public_code, created_by_name, updated_by_name)
  values ('shrewsbury', false, v_tag || ' Camp C', '09:00', '15:00', date '2037-03-04', date '2037-03-13', date '2037-03-10',
          'zz waiver', public.testing_new_public_code(), '', '')
  returning id into v_cpc;
  insert into public.camp_days (camp_id, day) values (v_cpc, date '2037-03-18');
  -- a family sign-up for each camp (as 0018_tests.sql makes one), and the campers: Cam (A, active),
  -- Cass (A, withdrawn), Cleo (B, active), Coy (C, active)
  insert into public.camp_signups (camp_id, submission_id, parent_name, parent_relation, parent_phone, emergency_name,
                                   emergency_relation, emergency_phone, price_kind, signed_up_on, signature, signed_at,
                                   signature_deleted_at, waiver_text_signed, ack_version, created_by_name, updated_by_name)
  values (v_cpa, gen_random_uuid(), 'Zz Parent', 'Parent', '5085550177', 'Zz Contact', 'Friend', '5085550178',
          'early', date '2037-03-01', null, now(), now(), 'zz waiver', 'camp-2026-10-18', '', '')
  returning id into v_sga;
  insert into public.camp_signups (camp_id, submission_id, parent_name, parent_relation, parent_phone, emergency_name,
                                   emergency_relation, emergency_phone, price_kind, signed_up_on, signature, signed_at,
                                   signature_deleted_at, waiver_text_signed, ack_version, created_by_name, updated_by_name)
  values (v_cpb, gen_random_uuid(), 'Zz Parent', 'Parent', '5085550177', 'Zz Contact', 'Friend', '5085550178',
          'early', date '2037-03-01', null, now(), now(), 'zz waiver', 'camp-2026-10-18', '', '')
  returning id into v_sgb;
  insert into public.camp_signups (camp_id, submission_id, parent_name, parent_relation, parent_phone, emergency_name,
                                   emergency_relation, emergency_phone, price_kind, signed_up_on, signature, signed_at,
                                   signature_deleted_at, waiver_text_signed, ack_version, created_by_name, updated_by_name)
  values (v_cpc, gen_random_uuid(), 'Zz Parent', 'Parent', '5085550177', 'Zz Contact', 'Friend', '5085550178',
          'early', date '2037-03-01', null, now(), now(), 'zz waiver', 'camp-2026-10-18', '', '')
  returning id into v_sgc;
  insert into public.camp_campers (signup_id, camp_id, position, first_name, last_name, age, member, paying_by, base_cents,
                                   created_by_name, updated_by_name)
  values (v_sga, v_cpa, 1, 'Cam', v_k, 8, true, 'cash', 7500, '', '') returning id into v_cm1;
  insert into public.camp_campers (signup_id, camp_id, position, first_name, last_name, age, member, paying_by, base_cents,
                                   created_by_name, updated_by_name)
  values (v_sga, v_cpa, 2, 'Cass', v_k, 9, true, 'cash', 7500, '', '') returning id into v_cm2;
  update public.camp_campers set status = 'withdrawn', withdrawn_reason = 'withdrawn', withdrawn_at = now(),
         withdrawn_by_name = 'zz test' where id = v_cm2;
  insert into public.camp_campers (signup_id, camp_id, position, first_name, last_name, age, member, paying_by, base_cents,
                                   created_by_name, updated_by_name)
  values (v_sgb, v_cpb, 1, 'Cleo', v_k, 8, true, 'cash', 7500, '', '') returning id into v_cm3;
  insert into public.camp_campers (signup_id, camp_id, position, first_name, last_name, age, member, paying_by, base_cents,
                                   created_by_name, updated_by_name)
  values (v_sgc, v_cpc, 1, 'Coy', v_k, 8, true, 'cash', 7500, '', '') returning id into v_cm4;

  -- New students: three sign-ups (the normal insert makes the children's prospects)
  --  S1 Worcester, parent "Pat <yy code>": Ava (own last name <zp code>) and Leo (sent the old way: no last name)
  --  S2 Shrewsbury, parent of ONE word <xx code>: Mia (no last name)
  --  S3 Worcester, parent "Dee <ww code>": Zed (own last name <qq code>, in lower case)
  -- every child's FIRST name carries the code of section K, so one typed text finds them all
  insert into public.form_submissions (form_id, location_code, published_version, fields, answers, parent_name, parent_phone,
                                       parent_email, children, source, submission_key)
  values (v_fw, 'worcester', 1, '[]', '{}', 'Pat ' || v_pt, '5085550199', 'zz-ps-parent@example.com',
          jsonb_build_array(jsonb_build_object('first_name', 'Ava' || v_k, 'last_name', v_pl, 'dob', '2030-01-02', 'age', 7),
                            jsonb_build_object('first_name', 'Leo' || v_k, 'age', 9)),
          'staff', gen_random_uuid())
  returning id into v_s1;
  insert into public.form_submissions (form_id, location_code, published_version, fields, answers, parent_name, parent_phone,
                                       parent_email, children, source, submission_key)
  values (v_fs, 'shrewsbury', 1, '[]', '{}', v_p2, '5085550198', 'zz-ps-one@example.com',
          jsonb_build_array(jsonb_build_object('first_name', 'Mia' || v_k, 'age', 5)),
          'staff', gen_random_uuid())
  returning id into v_s2;
  insert into public.form_submissions (form_id, location_code, published_version, fields, answers, parent_name, parent_phone,
                                       parent_email, children, source, submission_key)
  values (v_fw, 'worcester', 1, '[]', '{}', 'Dee ' || v_p3, '5085550197', 'zz-ps-dee@example.com',
          jsonb_build_array(jsonb_build_object('first_name', 'Zed' || v_k, 'last_name', v_pq, 'dob', '2031-05-06', 'age', 6)),
          'staff', gen_random_uuid())
  returning id into v_s3;
  select p.id into v_pa from public.prospects p where p.submission_id = v_s1 and p.child_index = 0;
  select p.id into v_pb from public.prospects p where p.submission_id = v_s1 and p.child_index = 1;
  select p.id into v_pc from public.prospects p where p.submission_id = v_s2 and p.child_index = 0;
  select p.id into v_pd from public.prospects p where p.submission_id = v_s3 and p.child_index = 0;
  if v_pa is null or v_pb is null or v_pc is null or v_pd is null then
    raise exception 'TEST SETUP: the sign-ups should have made 4 prospects';
  end if;

  -- The 15 results people_search must answer for the text v_k, at both schools, in their order
  -- (the kinds in order; inside a kind by name, compared byte by byte)
  v_exp := jsonb_build_array(
    pg_temp.zzx('colorbelt', v_cb3::text, v_eb::text, 'Cobb ' || v_k, v_tag || ' CB B', 'shrewsbury'),
    pg_temp.zzx('colorbelt', v_cb1::text, v_ea::text, 'Cora ' || v_k, v_tag || ' CB A', 'worcester'),
    pg_temp.zzx('colorbelt_private', v_pr1::text, null, 'Pia ' || v_k, null, 'worcester'),
    pg_temp.zzx('colorbelt_private', v_pr3::text, null, 'Pip ' || v_k, null, 'shrewsbury'),
    pg_temp.zzx('star', v_sc1::text, v_se1::text, 'Stan ' || v_k, v_tag || ' star A', 'worcester'),
    pg_temp.zzx('star', v_sc3::text, v_se1::text, 'Sue ' || v_k, v_tag || ' star A', 'shrewsbury'),
    pg_temp.zzx('black_belt', v_bb1::text, v_bc::text, 'Bea ' || v_k, v_tag || ' BB cycle', 'worcester'),
    pg_temp.zzx('black_belt', v_bb3::text, v_bc::text, 'Bo ' || v_k, v_tag || ' BB cycle', 'shrewsbury'),
    pg_temp.zzx('camp', v_cm1::text, v_cpa::text, 'Cam ' || v_k, v_tag || ' Camp A', 'worcester'),
    pg_temp.zzx('camp', v_cm3::text, v_cpb::text, 'Cleo ' || v_k, v_tag || ' Camp B', null),
    pg_temp.zzx('camp', v_cm4::text, v_cpc::text, 'Coy ' || v_k, v_tag || ' Camp C', 'shrewsbury'),
    pg_temp.zzx('prospect', v_pa::text, null, 'Ava' || v_k || ' Z.', v_tag || ' Visitor W', 'worcester'),
    pg_temp.zzx('prospect', v_pb::text, null, 'Leo' || v_k || ' Y.', v_tag || ' Visitor W', 'worcester'),
    pg_temp.zzx('prospect', v_pc::text, null, 'Mia' || v_k, v_tag || ' Visitor S', 'shrewsbury'),
    pg_temp.zzx('prospect', v_pd::text, null, 'Zed' || v_k || ' Q.', v_tag || ' Visitor W', 'worcester'));
  -- what a single school asks for: that school's people, and a camp for both schools (school null)
  select jsonb_agg(e order by n) into v_exp_w from jsonb_array_elements(v_exp) with ordinality t(e, n)
   where e ->> 'school' = 'worcester' or (e ->> 'kind' = 'camp' and e -> 'school' = 'null'::jsonb);
  select jsonb_agg(e order by n) into v_exp_s from jsonb_array_elements(v_exp) with ordinality t(e, n)
   where e ->> 'school' = 'shrewsbury' or (e ->> 'kind' = 'camp' and e -> 'school' = 'null'::jsonb);
  if jsonb_array_length(v_exp) <> 15 or jsonb_array_length(v_exp_w) <> 9 or jsonb_array_length(v_exp_s) <> 7 then
    raise exception 'TEST SETUP: expected 15 / 9 / 7 results, built % / % / %', jsonb_array_length(v_exp),
      jsonb_array_length(v_exp_w), jsonb_array_length(v_exp_s);
  end if;

  -- ===================================================================
  -- W. Who may call it
  -- ===================================================================
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform public.people_search(v_k, null);
        raise exception 'TEST FAILED: W1 anon called people_search'; exception when insufficient_privilege then null; end;
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.people_search(v_k, null);
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'results' is distinct from v_exp then
    raise exception 'TEST FAILED: W2 the front desk should get the same answer as an admin (status %)', v_r ->> 'status';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.people_search(v_k, null);
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'results' is distinct from v_exp then
    raise exception 'TEST FAILED: W2b an unlocked admin should get the answer (status %)', v_r ->> 'status';
  end if;
  foreach v_claims in array array[v_c_a2, v_c_d2, v_c_nostaff, ''] loop
    perform set_config('request.jwt.claims', v_claims, true);
    v_txt := concat_ws(',',
      public.people_search(v_k, null) ->> 'status',
      public.people_search(null, null) ->> 'status',
      public.people_search('a', null) ->> 'status',
      public.people_search(v_k, 'nowhere') ->> 'status');
    if v_txt <> 'no_access,no_access,no_access,no_access' then
      raise exception 'TEST FAILED: W3 % gave % (expected no_access, before the input check)',
        case when v_claims = '' then 'no session'
             when v_claims = v_c_a2 then 'an admin who pressed Lock'
             when v_claims = v_c_d2 then 'a desk whose PIN time ran out'
             else 'a login with no staff row' end, v_txt;
    end if;
    if public.people_search(v_k, null) <> '{"status": "no_access"}'::jsonb then
      raise exception 'TEST FAILED: W4 a refused call must carry nothing but the status';
    end if;
  end loop;

  -- ===================================================================
  -- R. The input rules (as A1)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_txt := concat_ws(',',
    public.people_search(null, null) ->> 'status',                          -- missing text
    public.people_search('', null) ->> 'status',
    public.people_search('   ', null) ->> 'status',
    public.people_search('a', null) ->> 'status',                           -- 1 character
    public.people_search('  a  ', null) ->> 'status',                       -- 1 character after trimming
    public.people_search(repeat('a', 81), null) ->> 'status',               -- 81 characters
    public.people_search(v_k, 'springfield') ->> 'status',                  -- unknown school
    public.people_search(v_k, 'both worcester') ->> 'status',
    public.people_search('ab', null) ->> 'status',                          -- 2 characters: ok
    public.people_search(repeat('a', 80), null) ->> 'status',               -- 80 characters: ok
    public.people_search('  ' || repeat('a', 80) || '  ', null) ->> 'status');   -- 80 after trimming: ok
  if v_txt <> 'invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,ok,ok,ok' then
    raise exception 'TEST FAILED: R1 input answers were % (expected invalid x8, then ok x3)', v_txt;
  end if;
  if public.people_search('a', null) <> '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: R2 invalid should carry nothing else: %', public.people_search('a', null);
  end if;
  -- a blank or missing school = both; 'Both' and 'WORCESTER' are accepted in any case
  v_r := public.people_search(v_k, null);
  if public.people_search(v_k, '') -> 'results' is distinct from v_r -> 'results'
     or public.people_search(v_k, '   ') -> 'results' is distinct from v_r -> 'results'
     or public.people_search(v_k, 'both') -> 'results' is distinct from v_r -> 'results'
     or public.people_search(v_k, 'Both') -> 'results' is distinct from v_r -> 'results'
     or public.people_search(v_k, ' BOTH ') -> 'results' is distinct from v_r -> 'results' then
    raise exception 'TEST FAILED: R3 a blank, missing or "both" school should give every result';
  end if;
  if public.people_search(v_k, 'WORCESTER') -> 'results' is distinct from v_exp_w
     or public.people_search(v_k, 'Worcester') -> 'results' is distinct from v_exp_w
     or public.people_search(v_k, '  worcester ') -> 'results' is distinct from v_exp_w
     or public.people_search(v_k, 'SHREWSBURY') -> 'results' is distinct from v_exp_s
     or public.people_search(v_k, 'Shrewsbury') -> 'results' is distinct from v_exp_s then
    raise exception 'TEST FAILED: R4 a school in any case should give that school''s results';
  end if;
  -- a text that finds nobody is ok with an empty list
  v_r := public.people_search('qqqq' || v_k || 'nobody', null);
  if v_r <> '{"status": "ok", "results": []}'::jsonb then
    raise exception 'TEST FAILED: R5 nobody found should answer {status ok, results []}: %', v_r;
  end if;

  -- ===================================================================
  -- K. The whole answer (as A1): 15 results, every key, the exact values, the order
  -- ===================================================================
  v_r := public.people_search(v_k, null);
  reset role;
  if v_r ->> 'status' is distinct from 'ok' or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['results', 'status'] then
    raise exception 'TEST FAILED: K1 the answer should be exactly {status ok, results}: %', left(v_r::text, 300);
  end if;
  if exists (select 1 from jsonb_array_elements(v_r -> 'results') e
              where (select count(*) from jsonb_object_keys(e)) <> 6
                 or not (e ?& array['kind', 'id', 'event_id', 'name', 'event', 'school'])) then
    raise exception 'TEST FAILED: K2 every result must have exactly the 6 keys';
  end if;
  if jsonb_array_length(v_r -> 'results') <> 15 then
    raise exception 'TEST FAILED: K3 expected 15 results, got %: %', jsonb_array_length(v_r -> 'results'),
      (select string_agg(e ->> 'kind' || ' ' || (e ->> 'name'), ', ') from jsonb_array_elements(v_r -> 'results') e);
  end if;
  -- every result by itself (a clearer message than comparing the whole list)
  for v_txt in select e ->> 'kind' || ' ' || (e ->> 'id') from jsonb_array_elements(v_exp) e loop
    if not exists (select 1 from jsonb_array_elements(v_r -> 'results') a
                    where a = (select e from jsonb_array_elements(v_exp) e where e ->> 'kind' || ' ' || (e ->> 'id') = v_txt)) then
      raise exception 'TEST FAILED: K4 result "%" is missing or wrong. Expected %. Got %', v_txt,
        (select e from jsonb_array_elements(v_exp) e where e ->> 'kind' || ' ' || (e ->> 'id') = v_txt),
        (select a from jsonb_array_elements(v_r -> 'results') a where a ->> 'kind' || ' ' || (a ->> 'id') = v_txt);
    end if;
  end loop;
  -- the order: kind (colorbelt, colorbelt_private, star, black_belt, camp, prospect), then name
  if v_r -> 'results' is distinct from v_exp then
    raise exception 'TEST FAILED: K5 the results are not in the expected order (kinds in their order, then by name)';
  end if;
  if (select string_agg(distinct e ->> 'kind', ',' order by e ->> 'kind') from jsonb_array_elements(v_r -> 'results') e)
       <> 'black_belt,camp,colorbelt,colorbelt_private,prospect,star' then
    raise exception 'TEST FAILED: K6 every kind should appear';
  end if;
  -- K7: a camp for both schools answers school null (and no other kind does); a private testing has no event
  if (select count(*) from jsonb_array_elements(v_r -> 'results') e where e -> 'school' = 'null'::jsonb) <> 1
     or not exists (select 1 from jsonb_array_elements(v_r -> 'results') e
                     where e ->> 'kind' = 'camp' and e ->> 'name' = 'Cleo ' || v_k and e -> 'school' = 'null'::jsonb)
     or exists (select 1 from jsonb_array_elements(v_r -> 'results') e
                 where e ->> 'kind' = 'colorbelt_private' and (e -> 'event_id' <> 'null'::jsonb or e -> 'event' <> 'null'::jsonb))
     or exists (select 1 from jsonb_array_elements(v_r -> 'results') e
                 where e ->> 'kind' = 'prospect' and e -> 'event_id' <> 'null'::jsonb) then
    raise exception 'TEST FAILED: K7 school null belongs to the both-schools camp only; a private testing and a New students child have no event_id';
  end if;
  -- K8: the three New students labels: own last name, the parent's LAST word (two words), first name alone
  -- (a parent name of one word gives no initial, like the Calendar); nothing but an initial and a dot after the first name
  if (select string_agg(e ->> 'name', ' / ' order by e ->> 'name') from jsonb_array_elements(v_r -> 'results') e where e ->> 'kind' = 'prospect')
       <> 'Ava' || v_k || ' Z. / Leo' || v_k || ' Y. / Mia' || v_k || ' / Zed' || v_k || ' Q.' then
    raise exception 'TEST FAILED: K8 the New students labels are wrong: %',
      (select string_agg(e ->> 'name', ' / ' order by e ->> 'name') from jsonb_array_elements(v_r -> 'results') e where e ->> 'kind' = 'prospect');
  end if;

  -- ===================================================================
  -- O. What is left out, the other school, parent names and phones (as A1)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- O1: withdrawn and cancelled people are never found, even when typed in full
  foreach v_txt in array array['Wade ' || v_k, 'Pam ' || v_k, 'Wilma ' || v_k, 'Walt ' || v_k, 'Cass ' || v_k] loop
    if public.people_search(v_txt, null) <> '{"status": "ok", "results": []}'::jsonb then
      raise exception 'TEST FAILED: O1 a withdrawn or cancelled person was found by "%": %', v_txt, public.people_search(v_txt, null);
    end if;
  end loop;
  -- O2: one school keeps that school's people and the camp for both schools
  if public.people_search(v_k, 'worcester') -> 'results' is distinct from v_exp_w then
    raise exception 'TEST FAILED: O2 worcester should give 9 results (its people and the both-schools camp): %',
      (select string_agg(e ->> 'kind' || ' ' || (e ->> 'name'), ', ') from jsonb_array_elements(public.people_search(v_k, 'worcester') -> 'results') e);
  end if;
  if public.people_search(v_k, 'shrewsbury') -> 'results' is distinct from v_exp_s then
    raise exception 'TEST FAILED: O3 shrewsbury should give 7 results (its people and the both-schools camp): %',
      (select string_agg(e ->> 'kind' || ' ' || (e ->> 'name'), ', ') from jsonb_array_elements(public.people_search(v_k, 'shrewsbury') -> 'results') e);
  end if;
  -- O4: a camp for ONE school does not show at the other school
  if exists (select 1 from jsonb_array_elements(public.people_search(v_k, 'shrewsbury') -> 'results') e where e ->> 'name' = 'Cam ' || v_k)
     or exists (select 1 from jsonb_array_elements(public.people_search(v_k, 'worcester') -> 'results') e where e ->> 'name' = 'Coy ' || v_k) then
    raise exception 'TEST FAILED: O4 a camp for one school showed at the other school';
  end if;
  -- O5: text that matches only a parent's name (full, or the last word, of a one-word or a two-word name), a
  -- parent's phone number or a parent's email finds nobody; the child's own first name or last name does
  foreach v_txt in array array['Pat ' || v_pt, v_pt, v_p2, v_p3, 'Dee ' || v_p3, '5085550199', '5085550198', '5085550197', 'zz-ps-parent', 'zz-ps-one@example.com'] loop
    if public.people_search(v_txt, null) <> '{"status": "ok", "results": []}'::jsonb then
      raise exception 'TEST FAILED: O5 "%" (a parent name, phone or email) found someone: %', v_txt, public.people_search(v_txt, null);
    end if;
  end loop;
  v_r := public.people_search(v_pl, null);   -- Ava's own last name: finds Ava (and shows only the initial)
  if jsonb_array_length(v_r -> 'results') <> 1 or v_r -> 'results' -> 0 ->> 'id' <> v_pa::text
     or v_r -> 'results' -> 0 ->> 'name' <> 'Ava' || v_k || ' Z.' then
    raise exception 'TEST FAILED: O6 a New students child should be found by their own last name (and shown as an initial): %', v_r;
  end if;
  v_r := public.people_search(v_pq, null);   -- Zed's own last name, typed in lower case
  if jsonb_array_length(v_r -> 'results') <> 1 or v_r -> 'results' -> 0 ->> 'id' <> v_pd::text then
    raise exception 'TEST FAILED: O7 Zed should be found by their own (lower-case) last name: %', v_r;
  end if;
  v_r := public.people_search('leo' || v_k, null);   -- a child with no last name: found by the first name
  if jsonb_array_length(v_r -> 'results') <> 1 or v_r -> 'results' -> 0 ->> 'id' <> v_pb::text then
    raise exception 'TEST FAILED: O8 a child with no last name should be found by the first name: %', v_r;
  end if;
  -- O9: the other school's New students child is not found when one school is asked
  if exists (select 1 from jsonb_array_elements(public.people_search('mia' || v_k, 'worcester') -> 'results') e)
     or jsonb_array_length(public.people_search('mia' || v_k, 'shrewsbury') -> 'results') <> 1 then
    raise exception 'TEST FAILED: O9 Mia (Shrewsbury) should show for shrewsbury only';
  end if;
  reset role;

  -- ===================================================================
  -- P. Privacy: nothing private in the keys or in the text of the answer
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r2 := public.people_search(v_k, null);
  v_txt := lower(v_r2::text);
  v_txt2 := lower(public.people_search(v_pl, null)::text || public.people_search(v_pq, null)::text
                  || public.people_search('leo' || v_k, null)::text);
  reset role;
  if (select array_agg(distinct k order by k) from jsonb_array_elements(v_r2 -> 'results') e,
                                                   lateral jsonb_object_keys(e) as k) is distinct from array['event', 'event_id', 'id', 'kind', 'name', 'school'] then
    raise exception 'TEST FAILED: P1 the result keys must be exactly kind, id, event_id, name, event, school';
  end if;
  foreach v_role in array array[lower(v_pl), lower(v_pq), lower(v_pt), lower(v_p2), lower(v_p3), 'zz-ps-', '@example.com',
                                '5085550199', '5085550198', '5085550197', '5085550177', '5085550178',
                                '1999-12-31', '2001-02-03', '2001-02-04', '2001-02-05', '2030-01-02', '2031-05-06',
                                'date_of_birth', 'dob', 'email', 'phone', 'address', 'signature', 'answers', 'cents', 'paying',
                                'parent', 'emergency'] loop
    if position(v_role in v_txt) > 0 or position(v_role in v_txt2) > 0 then
      raise exception 'TEST FAILED: P2 the answer holds "%" (a last name, date of birth, email, phone, parent name or private column)', v_role;
    end if;
  end loop;
  -- every New students child is "First" or "First X." (an initial and a dot at most after the first name)
  if exists (select 1 from jsonb_array_elements(v_exp) e
              where e ->> 'kind' = 'prospect' and e ->> 'name' !~ '^[^ ]+( [A-Z]\.)?$') then
    raise exception 'TEST FAILED: P3 a New students child is not shown as an initial';
  end if;

  -- ===================================================================
  -- M. Matching (as A1): capitals, parts of a name, spaces, and % _ \ typed are literal
  -- ===================================================================
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      created_by_name, updated_by_name)
  values (v_se1, 'Mm1', v_m || ' ab', 'worcester', 1, 0, 'cash', 'desk', '', '') returning id into v_mm1;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      created_by_name, updated_by_name)
  values (v_se1, 'Mm2', v_m || ' a%b', 'worcester', 1, 0, 'cash', 'desk', '', '') returning id into v_mm2;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      created_by_name, updated_by_name)
  values (v_se1, 'Mm3', v_m || ' a_b', 'worcester', 1, 0, 'cash', 'desk', '', '') returning id into v_mm3;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      created_by_name, updated_by_name)
  values (v_se1, 'Mm4', v_m || ' a\b', 'worcester', 1, 0, 'cash', 'desk', '', '') returning id into v_mm4;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- M1: capitals don't matter (the text, and the name)
  if public.people_search(upper(v_k), null) -> 'results' is distinct from v_exp
     or public.people_search('CORA ' || upper(v_k), null) -> 'results' is distinct from
        jsonb_build_array(pg_temp.zzx('colorbelt', v_cb1::text, v_ea::text, 'Cora ' || v_k, v_tag || ' CB A', 'worcester')) then
    raise exception 'TEST FAILED: M1 capitals should not matter';
  end if;
  -- M2: a part of a name, from the middle of a first name; spaces around the text are ignored
  if public.people_search('ora ' || v_k, null) -> 'results' is distinct from
       jsonb_build_array(pg_temp.zzx('colorbelt', v_cb1::text, v_ea::text, 'Cora ' || v_k, v_tag || ' CB A', 'worcester'))
     or public.people_search('   ' || v_k || '   ', null) -> 'results' is distinct from v_exp
     or public.people_search(right(v_k, 6), null) -> 'results' is distinct from v_exp then
    raise exception 'TEST FAILED: M2 a part of a name should match, and spaces around the text are ignored';
  end if;
  -- M3: % is a plain character: "a%b" finds only the name that holds the three characters a % b (a wildcard would
  -- also find "ab", "a_b" and "a\b"); "a%" alone does not find "ab"
  v_r := public.people_search(v_m || ' a%b', null);
  if jsonb_array_length(v_r -> 'results') <> 1 or v_r -> 'results' -> 0 ->> 'id' <> v_mm2::text then
    raise exception 'TEST FAILED: M3 "a%%b" should find only the name with a real %% in it: %', v_r;
  end if;
  v_r := public.people_search(v_m || ' a%', null);
  if jsonb_array_length(v_r -> 'results') <> 1 or v_r -> 'results' -> 0 ->> 'id' <> v_mm2::text then
    raise exception 'TEST FAILED: M4 "a%%" should not mean "a followed by anything": %', v_r;
  end if;
  -- M5: _ is a plain character: "a_b" finds only the name with a real underscore (a wildcard would find all but "ab")
  v_r := public.people_search(v_m || ' a_b', null);
  if jsonb_array_length(v_r -> 'results') <> 1 or v_r -> 'results' -> 0 ->> 'id' <> v_mm3::text then
    raise exception 'TEST FAILED: M5 "a_b" should find only the name with a real underscore: %', v_r;
  end if;
  -- M6: \ is a plain character: "a\b" finds only the name with a real backslash
  v_r := public.people_search(v_m || ' a\b', null);
  if jsonb_array_length(v_r -> 'results') <> 1 or v_r -> 'results' -> 0 ->> 'id' <> v_mm4::text then
    raise exception 'TEST FAILED: M6 "a\b" should find only the name with a real backslash: %', v_r;
  end if;
  -- M7: the plain text finds the four of them in name order; a lone % or _ typed after the code finds only its own
  v_r := public.people_search(v_m, null);
  if (select string_agg(e ->> 'name', ' / ' order by n) from jsonb_array_elements(v_r -> 'results') with ordinality t(e, n))
       <> 'Mm1 ' || v_m || ' ab / Mm2 ' || v_m || ' a%b / Mm3 ' || v_m || ' a_b / Mm4 ' || v_m || ' a\b' then
    raise exception 'TEST FAILED: M7 the four Star candidates should come back in name order: %', v_r;
  end if;
  if public.people_search(v_m || '%', null) -> 'results' is distinct from '[]'::jsonb
     or public.people_search(v_m || '_', null) -> 'results' is distinct from '[]'::jsonb
     or public.people_search('%' || v_m, null) -> 'results' is distinct from '[]'::jsonb
     or public.people_search('__', null) ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: M8 a %% or _ typed next to the code is a real character, so it finds nobody';
  end if;
  -- M9: "%%" and "__" typed alone are real characters: nobody seeded holds them, so none of the seeded people come back
  if exists (select 1 from jsonb_array_elements(public.people_search('%%', null) -> 'results') e
              where e ->> 'name' like '%' || v_k || '%' or e ->> 'name' like '%' || v_m || '%')
     or exists (select 1 from jsonb_array_elements(public.people_search('__', null) -> 'results') e
                 where e ->> 'name' like '%' || v_k || '%' or e ->> 'name' like '%' || v_m || '%') then
    raise exception 'TEST FAILED: M9 "%%" or "__" typed alone matched a seeded person (they must be taken literally)';
  end if;
  reset role;

  -- ===================================================================
  -- L. The limit: 25 of a kind, per kind (as A1)
  -- ===================================================================
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      created_by_name, updated_by_name)
  select v_se1, 'Lim' || lpad(g::text, 2, '0'), v_l, case when g % 2 = 0 then 'worcester' else 'shrewsbury' end, 1, 0, 'cash', 'desk', '', ''
    from generate_series(1, 30) as g;
  insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                    cycle_plan_id, kukkiwon, source, reference, created_by_name, updated_by_name)
  values (v_bc, 'Limbb', v_l, date '2001-02-06', 'zz-ps-limbb@example.com', 'worcester', 1, v_bp, false, 'desk',
          'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text, '', '');
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.people_search(v_l, null);
  if (select count(*) from jsonb_array_elements(v_r -> 'results') e where e ->> 'kind' = 'star') <> 25 then
    raise exception 'TEST FAILED: L1 30 Star candidates should give exactly 25, got %',
      (select count(*) from jsonb_array_elements(v_r -> 'results') e where e ->> 'kind' = 'star');
  end if;
  if jsonb_array_length(v_r -> 'results') <> 26 or (select count(*) from jsonb_array_elements(v_r -> 'results') e where e ->> 'kind' = 'black_belt') <> 1 then
    raise exception 'TEST FAILED: L2 the limit is per kind: 25 Star + the 1 Black Belt person = 26, got %', jsonb_array_length(v_r -> 'results');
  end if;
  -- the 25 are the first 25 by name (Lim01 ... Lim25), in order, then the Black Belt person
  if (select string_agg(e ->> 'name', ',' order by n) from jsonb_array_elements(v_r -> 'results') with ordinality t(e, n) where n <= 25)
       is distinct from (select string_agg('Lim' || lpad(g::text, 2, '0') || ' ' || v_l, ',' order by g) from generate_series(1, 25) as g)
     or v_r -> 'results' -> 25 ->> 'name' <> 'Limbb ' || v_l then
    raise exception 'TEST FAILED: L3 the 25 should be the first 25 by name, then the next kind';
  end if;
  -- one school: 15 Worcester (even numbers) -> 15; 15 Shrewsbury -> 15 (both under the limit)
  if (select count(*) from jsonb_array_elements(public.people_search(v_l, 'worcester') -> 'results') e where e ->> 'kind' = 'star') <> 15
     or (select count(*) from jsonb_array_elements(public.people_search(v_l, 'shrewsbury') -> 'results') e where e ->> 'kind' = 'star') <> 15 then
    raise exception 'TEST FAILED: L4 each school has 15 of the 30 Star candidates';
  end if;
  reset role;

  -- ===================================================================
  -- N. It writes nothing (as A1 and as the front desk, twice; refused and invalid calls too)
  -- ===================================================================
  v_snap := pg_temp.zzsnap();
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r  := public.people_search(v_k, null);
  v_r2 := public.people_search(v_k, null);
  perform public.people_search(v_l, 'worcester');
  perform public.people_search('a', null);
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform public.people_search(v_k, null);
  perform public.people_search(v_k, 'shrewsbury');
  perform set_config('request.jwt.claims', v_c_a2, true);
  perform public.people_search(v_k, null);
  perform set_config('request.jwt.claims', v_c_d2, true);
  perform public.people_search(v_k, null);
  reset role;
  v_snap2 := pg_temp.zzsnap();
  if v_snap is distinct from v_snap2 then
    raise exception 'TEST FAILED: N1 calling people_search changed a row (or wrote history) in a table it reads';
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
   where n.nspname = 'public' and p.proname = 'people_search';
  if v_n <> 1 then raise exception 'TEST FAILED: C1 expected exactly one people_search, found %', v_n; end if;
  select p.oid, p.prosecdef, p.proconfig, p.provolatile::text as vol, p.proowner, p.prorettype, l.lanname, p.proacl, p.prosrc into v_fn
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.people_search(text, text)'::regprocedure;
  if v_fn.lanname <> 'plpgsql' or v_fn.vol <> 's' or v_fn.prosecdef is not true or v_fn.prorettype <> 'jsonb'::regtype then
    raise exception 'TEST FAILED: C2 people_search should be plpgsql, STABLE, security definer, returning jsonb';
  end if;
  if v_fn.proconfig is distinct from array['search_path=""'] then
    raise exception 'TEST FAILED: C3 people_search settings are % (expected only search_path="")', v_fn.proconfig;
  end if;
  if v_fn.proowner <> (select c.relowner from pg_class c where c.oid = 'public.forms'::regclass) then
    raise exception 'TEST FAILED: C4 people_search''s owner differs from the forms table''s owner';
  end if;
  if exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) a where a.grantee = 0) then
    raise exception 'TEST FAILED: C5 PUBLIC can run people_search';
  end if;
  foreach v_role in array array['anon', 'service_role', 'forms_registrar', 'testing_registrar', 'star_registrar', 'bb_registrar', 'camps_registrar'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role)
       and has_function_privilege(v_role, v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: C6 % may run people_search', v_role;
    end if;
  end loop;
  if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') is not true then
    raise exception 'TEST FAILED: C7 authenticated may not run people_search';
  end if;
  -- the code, without its comments: no SQL built from text, no write, no is_admin(), tables named with
  -- their schema, the access check before anything is read, and the limit of 25 on each of the six kinds
  v_txt := regexp_replace(v_fn.prosrc, '--[^\n]*', '', 'g');
  if v_txt ~* '\mexecute\M' then
    raise exception 'TEST FAILED: C8 people_search builds and runs SQL text';
  end if;
  if v_txt ~* ('\m(insert|update|dele' || 'te|truncate|merge|perform|set_config|nextval|pg_advisory)\M') then
    raise exception 'TEST FAILED: C9 people_search has a write (or a call that could write) in its code';
  end if;
  if v_txt ~* 'is_admin' then
    raise exception 'TEST FAILED: C10 people_search must not use is_admin()';
  end if;
  if v_txt ~* '\m(from|join)\s+(?!public\.|lateral\M|\()' then
    raise exception 'TEST FAILED: C11 people_search names a table without its schema';
  end if;
  if position('has_data_access' in v_txt) = 0 or position('has_data_access' in v_txt) > position('select' in v_txt) then
    raise exception 'TEST FAILED: C12 people_search should check has_data_access() before it reads anything';
  end if;
  if (select count(*) from regexp_matches(v_txt, 'limit 25', 'g')) <> 6 then
    raise exception 'TEST FAILED: C13 people_search should limit each of its six kinds to 25';
  end if;
  if position('has_data_access' in v_txt) > position('char_length' in v_txt) then
    raise exception 'TEST FAILED: C14 people_search should check has_data_access() before it looks at the text';
  end if;

  raise notice 'ALL 0049 TESTS PASSED';
end
$$;

select 'ALL 0049 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
