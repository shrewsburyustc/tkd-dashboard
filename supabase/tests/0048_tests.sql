-- =====================================================================
-- 0048_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0048_black_belt_results_csv_order.sql
--   (the downloaded Black Belt results CSV lists Worcester before
--   Shrewsbury; rulebook v1.047 (19), Jeffrey 2026-11-04 and "C" on
--   2026-11-07). It checks, in this order:
--     O  the order: a cycle with candidates of BOTH schools in the same
--        Dan (and two of the same last name) - the CSV rows come out by
--        Dan, then Worcester before Shrewsbury, then last name, first
--        name; the same rule worked out here straight from the
--        candidates table gives the same list
--     B  nothing else changed: this file makes a copy of the function
--        with the OLD order (Shrewsbury first) and checks that the copy
--        puts the rows in the old order (so the test can tell the two
--        apart), and that the status, the cycle name and EVERY row
--        (every column of every row, compared one by one) are exactly
--        the same in both - only the order of the rows differs
--     S  a cycle with candidates of one school only: the rows and their
--        order are exactly what the old function gave
--     L  the download log: one row per successful download (cycle name,
--        number of rows), none for a refused one
--     R  who may call it: the front desk (role staff) -> not_allowed; an
--        admin whose PIN unlock ended and a call with no sign-in ->
--        no_access; anon, the family form's login and service_role may
--        not run it; an unlocked admin can, as role "authenticated"
--     C  the catalog: ONE version, plpgsql, volatile, security definer,
--        search_path = '', returns jsonb, owner, only authenticated may
--        run it, and the school order in its code is Worcester first
--   It makes its own test cycles and candidates ("zz test 1a2b3c4d ..."),
--   so it works whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test cycles, candidates,
--   download log rows, test sessions, a waiver saved for the test, the
--   temporary copy of the old function). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0046_tests.sql (read 0016_tests.sql's header): "set
--   local role authenticated" + a pretend login token per session.
--   Sessions: A1 admin unlocked - A2 admin, PIN unlock ran out - D1 desk
--   (role staff) unlocked.
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0010, 0011, 0016, 0024, 0025 and 0048 are applied. You
--      need TWO existing, ACTIVE staff rows: an admin and the shared front
--      desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0048 TESTS PASSED".
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

  v_a1 uuid := gen_random_uuid();  v_a2 uuid := gen_random_uuid();  v_d1 uuid := gen_random_uuid();
  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_a2 text; v_c_d1 text;

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_mail  text := 'zzcs' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_today date := public.testing_today();
  v_rand  uuid := gen_random_uuid();
  v_adult date := (public.testing_today() - interval '30 years')::date;
  v_role  text;

  v_r     jsonb;
  v_old   jsonb;
  v_n     integer;
  v_n2    integer;
  v_txt   text;
  v_exp   text;
  v_case  record;
  v_def   text;
  v_payload jsonb;

  v_cyc1 uuid; v_cyc2 uuid; v_full uuid; v_full2 uuid;
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
  if to_regprocedure('public.bb_results_csv(uuid)') is null
     or (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'bb_results_csv') not like '%when ''worcester'' then 0%' then
    raise exception 'TEST SETUP: 0048 is not applied (or 0025 was re-run after it - paste 0048 again)';
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
    (v_a2, v_admin, now() - interval '1 minute'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;

  -- the purge stays off (as 0046_tests.sql), so no row hides its date of birth
  update public.bb_settings set keep_years_after_last_day = null, keep_years_after_18 = null;

  -- Temporary helpers for this run only (pg_temp = gone at the end). On production a function
  -- made here gives nobody else the right to run it, and these helpers are called after
  -- `set local role ...`: so each one is security definer and is granted to public right after
  -- it is made.
  --   bbo_names(jsonb)   the first names of a CSV answer, in the order of its rows
  --   bbo_rows(jsonb)    the rows of a CSV answer, put in a fixed order (by candidate id),
  --                      so two answers can be compared row by row whatever order they came in
  execute $f$
    create function pg_temp.bbo_names(p jsonb) returns text
    language sql security definer set search_path = '' as $b$
      select string_agg(x.e ->> 'first_name', ',' order by x.n) from jsonb_array_elements(p -> 'rows') with ordinality as x(e, n); $b$;
  $f$;
  execute 'grant execute on function pg_temp.bbo_names(jsonb) to public';
  execute $f$
    create function pg_temp.bbo_schools(p jsonb) returns text
    language sql security definer set search_path = '' as $b$
      select string_agg((x.e ->> 'dan') || (case x.e ->> 'location_code' when 'worcester' then 'W' else 'S' end), ',' order by x.n)
        from jsonb_array_elements(p -> 'rows') with ordinality as x(e, n); $b$;
  $f$;
  execute 'grant execute on function pg_temp.bbo_schools(jsonb) to public';
  execute $f$
    create function pg_temp.bbo_rows(p jsonb) returns jsonb
    language sql security definer set search_path = '' as $b$
      select coalesce(jsonb_agg(x.e order by x.e ->> 'candidate_id'), '[]'::jsonb) from jsonb_array_elements(p -> 'rows') as x(e); $b$;
  $f$;
  execute 'grant execute on function pg_temp.bbo_rows(jsonb) to public';
  execute $f$
    create function pg_temp.bbo_expected(p uuid) returns text
    language sql security definer set search_path = '' as $b$
      select string_agg(c.first_name, ',' order by c.dan, case c.location_code when 'worcester' then 0 else 1 end,
                                                 lower(c.last_name), lower(c.first_name), c.id)
        from public.bb_candidates c where c.cycle_id = p and c.status = 'active'; $b$;
  $f$;
  execute 'grant execute on function pg_temp.bbo_expected(uuid) to public';

  -- A copy of the function as it was BEFORE 0048: the live function's own text with the one
  -- ordering line turned back (Shrewsbury first). It is named pg_temp.bbo_csv_old and is gone at the end.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'bb_results_csv';
  v_txt := replace(v_def, 'when ''worcester'' then 0 else 1 end', 'when ''shrewsbury'' then 0 else 1 end');
  if v_txt = v_def then
    raise exception 'TEST SETUP: the ordering line of bb_results_csv was not found, so the old copy cannot be made';
  end if;
  v_txt := regexp_replace(v_txt, 'public\.bb_results_csv\(', 'pg_temp.bbo_csv_old(');
  if v_txt = replace(v_def, 'when ''worcester'' then 0 else 1 end', 'when ''shrewsbury'' then 0 else 1 end') then
    raise exception 'TEST SETUP: the function name in the old copy was not changed';
  end if;
  execute v_txt;
  execute 'grant execute on function pg_temp.bbo_csv_old(uuid) to public';

  -- a school waiver (not the placeholder), saved for this run only when
  -- the current one is still the placeholder (as 0046_tests.sql)
  perform set_config('request.jwt.claims', v_c_a1, true);
  if (select v.is_placeholder from public.bb_waiver_versions v where v.superseded_at is null) then
    v_r := public.bb_save_waiver((select v.id from public.bb_waiver_versions v where v.superseded_at is null),
                                 'zz test waiver ' || v_tag || ': every subject must be passed.');
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_save_waiver answered %', v_r; end if;
  end if;

  -- the cycle payload (0046_tests.sql's), used for both cycles under two names
  v_payload := jsonb_build_object(
    'name', v_tag || ' Both schools', 'application_due', v_today + 20, 'submissions_due', v_today + 40, 'auto_close', true,
    'days', jsonb_build_array(
      jsonb_build_object('name', 'Physical', 'day_date', v_today + 30, 'start_time', '12:30', 'end_time', '14:30',
                         'place', jsonb_build_object('code', 'worcester'), 'second', null, 'parts', jsonb_build_array('physical')),
      jsonb_build_object('name', 'Technical', 'day_date', v_today + 37, 'start_time', '12:30', 'end_time', '15:30',
                         'place', jsonb_build_object('code', 'shrewsbury'), 'second', null, 'parts', jsonb_build_array('technical')),
      jsonb_build_object('name', 'Curriculum', 'day_date', v_today + 44, 'start_time', '14:00', 'end_time', '17:00',
                         'place', jsonb_build_object('code', 'shrewsbury'), 'second', null, 'parts', jsonb_build_array('curriculum'))),
    'plans', jsonb_build_array(
      jsonb_build_object('name', 'In full',
                         'payments', jsonb_build_array(jsonb_build_object('due_on', v_today + 20, 'follows_application_due', true)),
                         'amounts', jsonb_build_object('1', jsonb_build_array(87000), '2', jsonb_build_array(99000),
                                                       '3', jsonb_build_array(150000), '4', jsonb_build_array(270000)))),
    'kukkiwon', jsonb_build_object('1', 10000, '2', 11000, '3', 14000, '4', 17000),
    'prices_from', null);

  v_r := public.bb_add_cycle(v_payload, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add cycle 1 answered %', v_r; end if;
  v_cyc1 := (v_r ->> 'id')::uuid;
  select pl.id into v_full from public.bb_cycle_plans pl where pl.cycle_id = v_cyc1 and pl.name = 'In full';
  v_r := public.bb_set_registration(v_cyc1, 1, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: opening cycle 1 answered %', v_r; end if;

  v_r := public.bb_add_cycle(jsonb_set(v_payload, '{name}', to_jsonb(v_tag || ' One school')), null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add cycle 2 answered %', v_r; end if;
  v_cyc2 := (v_r ->> 'id')::uuid;
  select pl.id into v_full2 from public.bb_cycle_plans pl where pl.cycle_id = v_cyc2 and pl.name = 'In full';
  v_r := public.bb_set_registration(v_cyc2, 1, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: opening cycle 2 answered %', v_r; end if;

  -- Cycle 1, Dan 1: Abe Zzaaa (S), Bob Zzbbb (W), Cyd Zzccc (S), Dee Zzaaa (W), Cal Zzbbb (W: the same last name as Bob)
  -- Cycle 1, Dan 2: Eve Zzeee (S), Fay Zzfff (W)
  -- (added in an order that is neither the old order nor the new one)
  for v_case in
    select * from (values
      ('Cyd', 'Zzccc', 'shrewsbury', 1), ('Bob', 'Zzbbb', 'worcester', 1), ('Eve', 'Zzeee', 'shrewsbury', 2),
      ('Abe', 'Zzaaa', 'shrewsbury', 1), ('Fay', 'Zzfff', 'worcester', 2), ('Cal', 'Zzbbb', 'worcester', 1),
      ('Dee', 'Zzaaa', 'worcester', 1)) as t(fname, lname, school, dan)
  loop
    v_r := public.bb_add_candidate(v_cyc1, v_case.fname, v_case.lname, v_adult, v_mail || '.' || lower(v_case.fname) || '@example.com',
                                   v_case.school, v_case.dan, v_full, false, true);
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add % answered %', v_case.fname, v_r; end if;
  end loop;
  -- Cycle 2: Shrewsbury only (Dan 1): Gus Zzccc, Hal Zzaaa, Ivy Zzbbb
  for v_case in
    select * from (values ('Gus', 'Zzccc'), ('Hal', 'Zzaaa'), ('Ivy', 'Zzbbb')) as t(fname, lname)
  loop
    v_r := public.bb_add_candidate(v_cyc2, v_case.fname, v_case.lname, v_adult, v_mail || '.' || lower(v_case.fname) || '@example.com',
                                   'shrewsbury', 1, v_full2, false, true);
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add % answered %', v_case.fname, v_r; end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- O. The order: by Dan, then Worcester before Shrewsbury, then last name, first name
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_results_csv(v_cyc1);
  if v_r ->> 'status' is distinct from 'ok' or jsonb_array_length(v_r -> 'rows') <> 7 then
    raise exception 'TEST FAILED: O the admin''s download of cycle 1 should be ok with 7 rows, got %', left(v_r::text, 300);
  end if;
  if pg_temp.bbo_names(v_r) is distinct from 'Dee,Bob,Cal,Abe,Cyd,Fay,Eve' then
    raise exception 'TEST FAILED: O the rows should come out Dee,Bob,Cal (Dan 1, Worcester), Abe,Cyd (Dan 1, Shrewsbury), Fay (Dan 2, Worcester), Eve (Dan 2, Shrewsbury); got %',
      pg_temp.bbo_names(v_r);
  end if;
  if pg_temp.bbo_schools(v_r) is distinct from '1W,1W,1W,1S,1S,2W,2S' then
    raise exception 'TEST FAILED: O the Dan / school sequence should be 1W,1W,1W,1S,1S,2W,2S; got %', pg_temp.bbo_schools(v_r);
  end if;
  if pg_temp.bbo_names(v_r) is distinct from pg_temp.bbo_expected(v_cyc1) then
    raise exception 'TEST FAILED: O the rows differ from the same rule worked out from the candidates table (%)', pg_temp.bbo_expected(v_cyc1);
  end if;

  -- ===================================================================
  -- B. Nothing else changed: the copy with the old order tells the two apart,
  --    and every row is exactly the same in both
  -- ===================================================================
  v_old := pg_temp.bbo_csv_old(v_cyc1);
  if v_old ->> 'status' is distinct from 'ok' or pg_temp.bbo_names(v_old) is distinct from 'Abe,Cyd,Dee,Bob,Cal,Eve,Fay' then
    raise exception 'TEST FAILED: B the copy with the old order should give Abe,Cyd,Dee,Bob,Cal,Eve,Fay; got %', pg_temp.bbo_names(v_old);
  end if;
  if v_r -> 'cycle_name' is distinct from v_old -> 'cycle_name' or v_r ->> 'status' is distinct from v_old ->> 'status'
     or (select array_agg(k order by k collate "C") from jsonb_object_keys(v_r) as k)
        is distinct from (select array_agg(k order by k collate "C") from jsonb_object_keys(v_old) as k) then
    raise exception 'TEST FAILED: B the status, cycle name or the keys of the answer changed';
  end if;
  if pg_temp.bbo_rows(v_r) is distinct from pg_temp.bbo_rows(v_old) then
    raise exception 'TEST FAILED: B the rows (every column, row by row) are not the same as the old function gave';
  end if;
  if exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(e) where jsonb_typeof(x.e) <> 'object') then
    raise exception 'TEST FAILED: B a row is not an object';
  end if;
  -- and the new answer is exactly the old one with its rows put in the new order (nothing added, nothing lost)
  if jsonb_array_length(v_r -> 'rows') <> jsonb_array_length(v_old -> 'rows') then
    raise exception 'TEST FAILED: B the number of rows changed';
  end if;

  -- ===================================================================
  -- S. A cycle with one school only: rows and order exactly as the old function gave
  -- ===================================================================
  v_r := public.bb_results_csv(v_cyc2);
  v_old := pg_temp.bbo_csv_old(v_cyc2);
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbo_names(v_r) is distinct from 'Hal,Ivy,Gus' then
    raise exception 'TEST FAILED: S the one-school cycle should list Hal,Ivy,Gus (by last name); got %', pg_temp.bbo_names(v_r);
  end if;
  if v_r is distinct from v_old then
    raise exception 'TEST FAILED: S the one-school cycle''s answer is not exactly what the old function gave';
  end if;

  -- ===================================================================
  -- L. The download log
  -- ===================================================================
  select count(*) into v_n from public.bb_downloads;
  v_r := public.bb_results_csv(v_cyc1);
  select count(*) into v_n2 from public.bb_downloads;
  if v_n2 <> v_n + 1 or v_r ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: L a successful download should add exactly one download row (% -> %)', v_n, v_n2;
  end if;
  if (select count(*) from public.bb_downloads d where d.cycle_id = v_cyc1 and d.cycle_name = v_tag || ' Both schools' and d.row_count = 7) < 1 then
    raise exception 'TEST FAILED: L the download row should name the cycle and say 7 rows';
  end if;
  select count(*) into v_n from public.bb_downloads;
  if public.bb_results_csv(v_rand) is distinct from '{"status": "not_found"}'::jsonb
     or public.bb_results_csv(null) is distinct from '{"status": "invalid"}'::jsonb
     or (select count(*) from public.bb_downloads) <> v_n then
    raise exception 'TEST FAILED: L a refused download (unknown cycle, no cycle) should write no download row';
  end if;

  -- ===================================================================
  -- R. Who may call it
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  select count(*) into v_n from public.bb_downloads;
  set local role authenticated;
  v_r := public.bb_results_csv(v_cyc1);
  reset role;
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb or (select count(*) from public.bb_downloads) <> v_n then
    raise exception 'TEST FAILED: R the front desk (staff) should get not_allowed and write no row, got %', left(v_r::text, 200);
  end if;
  set local role authenticated;
  foreach v_txt in array array[v_c_a2, ''] loop
    perform set_config('request.jwt.claims', v_txt, true);
    if public.bb_results_csv(v_cyc1) is distinct from '{"status": "no_access"}'::jsonb
       or public.bb_results_csv(null) is distinct from '{"status": "no_access"}'::jsonb then
      raise exception 'TEST FAILED: R a session without data access should get no_access';
    end if;
  end loop;
  reset role;
  if (select count(*) from public.bb_downloads) <> v_n then
    raise exception 'TEST FAILED: R a refused call wrote a download row';
  end if;
  -- an unlocked admin, as role authenticated (the way the web API calls it)
  perform set_config('request.jwt.claims', v_c_a1, true);
  set local role authenticated;
  v_r := public.bb_results_csv(v_cyc1);
  reset role;
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbo_names(v_r) is distinct from 'Dee,Bob,Cal,Abe,Cyd,Fay,Eve' then
    raise exception 'TEST FAILED: R an unlocked admin as role authenticated should get the rows in the new order, got %', left(v_r::text, 200);
  end if;
  perform set_config('request.jwt.claims', '', true);
  foreach v_role in array array['anon', 'bb_registrar', 'star_registrar', 'forms_registrar', 'service_role'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role)
       and has_function_privilege(v_role, 'public.bb_results_csv(uuid)', 'EXECUTE') then
      raise exception 'TEST FAILED: R % may run the CSV download', v_role;
    end if;
  end loop;
  set local role anon;
  begin
    perform public.bb_results_csv(v_cyc1);
    raise exception 'TEST FAILED: R anon could call bb_results_csv';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- ===================================================================
  -- C. The catalog
  -- ===================================================================
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'bb_results_csv';
  if v_n <> 1 then raise exception 'TEST FAILED: C expected exactly one bb_results_csv, found %', v_n; end if;
  select p.oid, p.prosecdef, p.proconfig, p.provolatile::text as vol, p.proowner, l.lanname, p.proacl, p.prosrc,
         p.pronargs, p.pronargdefaults, p.prorettype into v_case
    from pg_proc p join pg_language l on l.oid = p.prolang
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'bb_results_csv';
  if v_case.lanname <> 'plpgsql' or v_case.vol <> 'v' or v_case.prosecdef is not true or v_case.prorettype <> 'jsonb'::regtype then
    raise exception 'TEST FAILED: C bb_results_csv should be plpgsql, volatile, security definer, returning jsonb';
  end if;
  if v_case.pronargs <> 1 or v_case.pronargdefaults <> 0 or pg_get_function_arguments(v_case.oid) <> 'p_cycle_id uuid' then
    raise exception 'TEST FAILED: C bb_results_csv should have the one input p_cycle_id uuid, got (%)', pg_get_function_arguments(v_case.oid);
  end if;
  if not coalesce('search_path=""' = any (v_case.proconfig), false) then
    raise exception 'TEST FAILED: C search_path is not set to ''''';
  end if;
  if v_case.proowner <> (select c.relowner from pg_class c where c.oid = 'public.bb_cycles'::regclass) then
    raise exception 'TEST FAILED: C owner differs from the Black Belt tables'' owner';
  end if;
  if exists (select 1 from aclexplode(coalesce(v_case.proacl, acldefault('f', v_case.proowner))) a where a.grantee = 0) then
    raise exception 'TEST FAILED: C PUBLIC can run bb_results_csv';
  end if;
  if has_function_privilege('authenticated', v_case.oid, 'EXECUTE') is not true then
    raise exception 'TEST FAILED: C authenticated may not run bb_results_csv';
  end if;
  if v_case.prosrc ~* '\mexecute\M' then
    raise exception 'TEST FAILED: C bb_results_csv builds and runs SQL text';
  end if;
  if v_case.prosrc not like '%case x.location_code when ''worcester'' then 0 else 1 end%'
     or v_case.prosrc like '%when ''shrewsbury'' then 0%' then
    raise exception 'TEST FAILED: C the ordering in bb_results_csv should say worcester first';
  end if;

  raise notice 'ALL 0048 TESTS PASSED';
end
$$;

select 'ALL 0048 TESTS PASSED' as result;

rollback;
