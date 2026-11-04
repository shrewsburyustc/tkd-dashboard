-- =====================================================================
-- 0034_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0034_black_belt_history_ids.sql
--   (the History line names the logged row's id). It checks, in this
--   order:
--     R1  who may read the history - unchanged from 0032: an ended PIN
--         unlock and no sign-in at all -> no_access (checked before the
--         input); no id -> invalid; an unknown id -> not_found; anon and
--         the family form's login bb_registrar can't run it
--     R2  every row has exactly eight keys - 0032's seven plus record_id -
--         and record_id is always filled in; the rows are exactly the
--         candidate's own change_log rows, newest first, each with its
--         own change_log record_id
--     R3  record_id is the logged row's own id: the candidate's rows ->
--         the candidate; the payment -> the payment; the grade's INSERT
--         AND its later UPDATE (A -> B) -> the grade, so the update can be
--         joined to the insert that names the subject
--     R4  still nothing private: no real date of birth, email or login
--         id anywhere; no login-id key, send id, earlier-row id, actor_id,
--         session_id or batch_id; the date-of-birth change still reads
--         "on file" -> "changed"
--     C   the catalog: one version; plpgsql, stable, security definer,
--         search_path = '', owner, and only authenticated may run it
--   It makes its own test cycle and candidate ("zz test 1a2b3c4d ..."),
--   so it works whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test cycle, candidate,
--   payment, grade, history rows, test sessions, a waiver saved for the
--   test). NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0032_tests.sql (read 0016_tests.sql's header): "set
--   local role authenticated" + a pretend login token per session.
--   Sessions: A1 admin unlocked · A2 admin, PIN unlock ran out · D1 desk
--   unlocked.
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0010, 0011, 0016, 0024, 0025, 0032 and 0034 are
--      applied. You need TWO existing, ACTIVE staff rows: an admin and the
--      shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0034 TESTS PASSED".
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
  v_mail  text := 'zzbi' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_today date := public.testing_today();
  v_rand  uuid := gen_random_uuid();
  v_adult date := (public.testing_today() - interval '30 years')::date;
  v_dob2  date := (public.testing_today() - interval '31 years' - interval '40 days')::date;
  v_role  text;

  v_r     jsonb;
  v_rows  jsonb;
  v_txt   text;
  v_n     integer;
  v_v     integer;
  v_case  record;

  v_cycle uuid; v_full uuid; v_kim uuid; v_pay uuid; v_rev uuid; v_grade uuid; v_subject text;
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
  if to_regprocedure('public.bb_candidate_history(uuid)') is null
     or to_regprocedure('public.bb_history_strip(jsonb)') is null then
    raise exception 'TEST SETUP: 0032 is not applied';
  end if;
  if (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.bb_candidate_history(uuid)')) not like '%''record_id''%' then
    raise exception 'TEST SETUP: 0034 is not applied (or 0032 was re-run after it - paste 0034 again)';
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

  -- the purge stays off (as 0032_tests.sql), so no history row comes from it
  update public.bb_settings set keep_years_after_last_day = null, keep_years_after_18 = null;

  -- Temporary helper for this run only (pg_temp = gone at the end):
  --   bbi_secret(text): true when the text holds a login-id key, a send
  --     id, an earlier-row id or a log-only column
  execute $f$
    create function pg_temp.bbi_secret(p text) returns boolean
    language sql as $b$
      select p ~ '"(created_by|updated_by|withdrawn_by|recorded_by|marked_by|undone_by|submission_id|makeup_of_candidate_id|actor_id|session_id|batch_id)"';
    $b$;
  $f$;

  -- a school waiver (not the placeholder), saved for this run only when
  -- the current one is still the placeholder (as 0032_tests.sql)
  perform set_config('request.jwt.claims', v_c_a1, true);
  if (select v.is_placeholder from public.bb_waiver_versions v where v.superseded_at is null) then
    v_r := public.bb_save_waiver((select v.id from public.bb_waiver_versions v where v.superseded_at is null),
                                 'zz test waiver ' || v_tag || ': every subject must be passed.');
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_save_waiver answered %', v_r; end if;
  end if;

  -- the cycle (0032_tests.sql's payload), open
  v_r := public.bb_add_cycle(jsonb_build_object(
    'name', v_tag || ' History ids', 'application_due', v_today + 20, 'submissions_due', v_today + 40, 'auto_close', true,
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
    'prices_from', null), null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add cycle answered %', v_r; end if;
  v_cycle := (v_r ->> 'id')::uuid;
  select pl.id into v_full from public.bb_cycle_plans pl where pl.cycle_id = v_cycle and pl.name = 'In full';
  v_r := public.bb_set_registration(v_cycle, 1, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: opening the cycle answered %', v_r; end if;

  -- Kim: at the desk, with a date of birth, an email and a paper waiver
  v_r := public.bb_add_candidate(v_cycle, 'Kim', 'Zzhistory', v_adult, v_mail || '.kim@example.com', 'worcester', 1, v_full, false, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add Kim answered %', v_r; end if;
  v_kim := (v_r ->> 'id')::uuid;
  -- her date of birth changes
  select version into v_v from public.bb_candidates where id = v_kim;
  v_r := public.bb_update_candidate(v_kim, v_v, 'Kim', 'Zzhistory', v_dob2, v_mail || '.kim@example.com', 'worcester', 1);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: Kim''s date of birth change answered %', v_r; end if;
  -- a payment and its undo (the undo is a second payment row, its own id)
  select version into v_v from public.bb_candidates where id = v_kim;
  v_r := public.bb_record_payment(v_kim, v_v, 1000, 'cash', array['p1'], null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: Kim''s payment answered %', v_r; end if;
  v_pay := (v_r ->> 'payment_id')::uuid;
  v_r := public.bb_undo_payment(v_pay);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: the payment''s undo answered %', v_r; end if;
  select p.id into v_rev from public.bb_payments p where p.reverses_payment_id = v_pay;
  -- a grade (A), then a correction of the same grade (A -> B): an INSERT
  -- row naming the subject, then an UPDATE row holding the letter
  select s.e ->> 'id' into v_subject
    from public.bb_cycles y
    cross join lateral jsonb_array_elements(y.requirements -> 'dans' -> 0 -> 'parts') as p(e)
    cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)
   where y.id = v_cycle and s.e ->> 'name' = 'Free sparring' limit 1;
  v_r := public.bb_set_grade(v_kim, 1, v_subject, 'A');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: Kim''s grade answered %', v_r; end if;
  select g.id into v_grade from public.bb_grades g where g.candidate_id = v_kim;
  v_r := public.bb_set_grade(v_kim, 1, v_subject, 'B');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: Kim''s grade correction answered %', v_r; end if;
  if (select count(*) from public.bb_grades g where g.candidate_id = v_kim) <> 1
     or (select g.id from public.bb_grades g where g.candidate_id = v_kim) <> v_grade
     or not exists (select 1 from public.change_log l where l.table_name = 'bb_grades' and l.record_id = v_grade and l.op = 'update') then
    raise exception 'TEST SETUP: the grade correction should change the same grade row and log an update';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- a planted row that must NOT appear: another table's row with the id
  -- of Kim's grade
  insert into public.change_log (actor_name, action, table_name, record_id, op, before, after)
  values ('zz planted', 'manual', 'bb_cycles', v_grade, 'update', '{"name": "planted"}', '{"name": "planted 2"}');

  -- ===================================================================
  -- R1. Who may read the history (unchanged from 0032)
  -- ===================================================================
  set local role authenticated;
  foreach v_txt in array array[v_c_a2, ''] loop
    perform set_config('request.jwt.claims', v_txt, true);
    if public.bb_candidate_history(v_kim) is distinct from '{"status": "no_access"}'::jsonb
       or public.bb_candidate_history(null) is distinct from '{"status": "no_access"}'::jsonb then
      raise exception 'TEST FAILED: R1 a session without data access should get no_access (before the input check)';
    end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.bb_candidate_history(null) is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: R1 no id should be invalid';
  end if;
  if public.bb_candidate_history(v_rand) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: R1 an unknown id should be not_found';
  end if;
  -- the front desk (any staff with data access) reads it
  v_r := public.bb_candidate_history(v_kim);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  foreach v_role in array array['anon', 'bb_registrar', 'service_role'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role)
       and has_function_privilege(v_role, 'public.bb_candidate_history(uuid)', 'EXECUTE') then
      raise exception 'TEST FAILED: R1 % may run bb_candidate_history', v_role;
    end if;
  end loop;
  set local role anon;
  begin
    perform public.bb_candidate_history(v_kim);
    raise exception 'TEST FAILED: R1 anon could call bb_candidate_history';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- ===================================================================
  -- R2. Eight keys, record_id filled in, exactly the candidate's rows
  -- ===================================================================
  if v_r ->> 'status' is distinct from 'ok' or jsonb_typeof(v_r -> 'rows') <> 'array'
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['rows', 'status'] then
    raise exception 'TEST FAILED: R2 Kim''s history expected {status ok, rows}, got %', left(v_r::text, 300);
  end if;
  v_rows := v_r -> 'rows';
  if exists (select 1 from jsonb_array_elements(v_rows) as x(e)
              where (select array_agg(k order by k collate "C") from jsonb_object_keys(x.e) as k)
                    <> array['action', 'actor_name', 'after', 'before', 'occurred_at', 'op', 'record_id', 'table_name']) then
    raise exception 'TEST FAILED: R2 a history row does not have exactly the eight keys (0032''s seven + record_id)';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rows) as x(e)
              where jsonb_typeof(x.e -> 'record_id') is distinct from 'string'
                 or (x.e ->> 'record_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'TEST FAILED: R2 a history row has no record_id (or not a uuid)';
  end if;
  -- the same rows, in the same order, as change_log's own (newest first),
  -- each with its own record_id; the planted row is not among them
  if (select array_agg(x.e ->> 'table_name' || '/' || (x.e ->> 'op') || '/' || (x.e ->> 'record_id') order by x.n)
        from jsonb_array_elements(v_rows) with ordinality as x(e, n))
     is distinct from
     (select array_agg(l.table_name || '/' || l.op || '/' || l.record_id::text order by l.occurred_at desc, l.id desc)
        from public.change_log l
       where (l.table_name = 'bb_candidates' and l.record_id = v_kim)
          or (l.table_name, l.record_id) in (select 'bb_payments', p.id from public.bb_payments p where p.candidate_id = v_kim
                                             union all select 'bb_candidate_waivers', w.id from public.bb_candidate_waivers w where w.candidate_id = v_kim
                                             union all select 'bb_grades', g.id from public.bb_grades g where g.candidate_id = v_kim)) then
    raise exception 'TEST FAILED: R2 the rows (table / op / record_id, newest first) are not exactly Kim''s change_log rows';
  end if;
  if jsonb_array_length(v_rows) < 7
     or exists (select 1 from jsonb_array_elements(v_rows) as x(e) where x.e ->> 'actor_name' = 'zz planted') then
    raise exception 'TEST FAILED: R2 expected at least 7 rows and no planted row, got % rows', jsonb_array_length(v_rows);
  end if;

  -- ===================================================================
  -- R3. record_id is the logged row's own id
  -- ===================================================================
  if exists (select 1 from jsonb_array_elements(v_rows) as x(e)
              where x.e ->> 'table_name' = 'bb_candidates' and x.e ->> 'record_id' <> v_kim::text)
     or (select count(*) from jsonb_array_elements(v_rows) as x(e)
          where x.e ->> 'table_name' = 'bb_candidates' and x.e ->> 'record_id' = v_kim::text) < 2 then
    raise exception 'TEST FAILED: R3 the candidate''s own rows (insert and update) should carry the candidate''s id';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_rows) as x(e)
                  where x.e ->> 'table_name' = 'bb_payments' and x.e ->> 'op' = 'insert'
                    and x.e ->> 'record_id' = v_pay::text and x.e -> 'after' ->> 'amount_cents' = '1000')
     or not exists (select 1 from jsonb_array_elements(v_rows) as x(e)
                     where x.e ->> 'table_name' = 'bb_payments' and x.e ->> 'op' = 'insert'
                       and x.e ->> 'record_id' = v_rev::text and x.e -> 'after' ->> 'reverses_payment_id' = v_pay::text) then
    raise exception 'TEST FAILED: R3 the payment and its undo should each carry their own payment id';
  end if;
  -- the grade: its INSERT names the subject; its UPDATE (A -> B) has the
  -- SAME record_id, so the app can join the correction to the subject
  if not exists (select 1 from jsonb_array_elements(v_rows) as x(e)
                  where x.e ->> 'table_name' = 'bb_grades' and x.e ->> 'op' = 'insert'
                    and x.e ->> 'record_id' = v_grade::text and x.e -> 'after' ->> 'subject_id' = v_subject) then
    raise exception 'TEST FAILED: R3 the grade''s insert row should carry the grade''s id and name the subject';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_rows) as x(e)
                  where x.e ->> 'table_name' = 'bb_grades' and x.e ->> 'op' = 'update'
                    and x.e ->> 'record_id' = v_grade::text
                    and x.e -> 'before' ->> 'letter' = 'A' and x.e -> 'after' ->> 'letter' = 'B') then
    raise exception 'TEST FAILED: R3 the grade''s correction (A -> B) should carry the grade''s id';
  end if;
  -- the join the app makes: every grade update row finds exactly one
  -- insert row with its record_id, and that insert names the subject
  if exists (select 1 from jsonb_array_elements(v_rows) as u(e)
              where u.e ->> 'table_name' = 'bb_grades' and u.e ->> 'op' = 'update'
                and (select count(*) from jsonb_array_elements(v_rows) as i(e)
                      where i.e ->> 'table_name' = 'bb_grades' and i.e ->> 'op' = 'insert'
                        and i.e ->> 'record_id' = u.e ->> 'record_id' and i.e -> 'after' ? 'subject_id') <> 1) then
    raise exception 'TEST FAILED: R3 a grade update row can''t be joined to exactly one insert row by record_id';
  end if;

  -- ===================================================================
  -- R4. Still nothing private
  -- ===================================================================
  v_txt := v_r::text;
  if position(v_adult::text in v_txt) > 0 or position(v_dob2::text in v_txt) > 0 or position(v_mail in v_txt) > 0
     or position('@example' in v_txt) > 0 or position(v_admin::text in v_txt) > 0 or position(v_desk::text in v_txt) > 0
     or position(v_d1::text in v_txt) > 0 or position(v_a1::text in v_txt) > 0 then
    raise exception 'TEST FAILED: R4 the history holds a date of birth, an email, a login id or a session id: %', left(v_txt, 400);
  end if;
  if pg_temp.bbi_secret(v_txt) then
    raise exception 'TEST FAILED: R4 the history holds a removed key: %', left(v_txt, 400);
  end if;
  if not exists (select 1 from jsonb_array_elements(v_rows) as x(e)
                  where x.e ->> 'table_name' = 'bb_candidates' and x.e ->> 'op' = 'update'
                    and x.e -> 'before' ->> 'date_of_birth' = 'on file' and x.e -> 'after' ->> 'date_of_birth' = 'changed')
     or not exists (select 1 from jsonb_array_elements(v_rows) as x(e)
                     where x.e ->> 'table_name' = 'bb_candidates' and x.e ->> 'op' = 'insert'
                       and x.e -> 'after' ->> 'email_for_results' = 'on file' and x.e -> 'after' ->> 'first_name' = 'Kim') then
    raise exception 'TEST FAILED: R4 the date of birth and email should still read "on file" / "changed"';
  end if;

  -- ===================================================================
  -- C. The catalog
  -- ===================================================================
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'bb_candidate_history';
  if v_n <> 1 then raise exception 'TEST FAILED: C expected exactly one bb_candidate_history, found %', v_n; end if;
  select p.oid, p.prosecdef, p.proconfig, p.provolatile::text as vol, p.proowner, l.lanname, p.proacl, p.prosrc into v_case
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.bb_candidate_history(uuid)'::regprocedure;
  if v_case.lanname <> 'plpgsql' or v_case.vol <> 's' or v_case.prosecdef is not true
     or (select p.prorettype from pg_proc p where p.oid = v_case.oid) <> 'jsonb'::regtype then
    raise exception 'TEST FAILED: C bb_candidate_history should be plpgsql, stable, security definer, returning jsonb';
  end if;
  if not coalesce('search_path=""' = any (v_case.proconfig), false) then
    raise exception 'TEST FAILED: C bb_candidate_history search_path is not set to ''''';
  end if;
  if v_case.proowner <> (select c.relowner from pg_class c where c.oid = 'public.bb_cycles'::regclass) then
    raise exception 'TEST FAILED: C bb_candidate_history owner differs from the Black Belt tables'' owner';
  end if;
  if exists (select 1 from aclexplode(coalesce(v_case.proacl, acldefault('f', v_case.proowner))) a where a.grantee = 0) then
    raise exception 'TEST FAILED: C PUBLIC can run bb_candidate_history';
  end if;
  foreach v_role in array array['anon', 'service_role', 'bb_registrar', 'star_registrar', 'forms_registrar'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role)
       and has_function_privilege(v_role, v_case.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: C % may run bb_candidate_history', v_role;
    end if;
  end loop;
  if has_function_privilege('authenticated', v_case.oid, 'EXECUTE') is not true then
    raise exception 'TEST FAILED: C authenticated may not run bb_candidate_history';
  end if;
  if v_case.prosrc ~* '\mexecute\M' then
    raise exception 'TEST FAILED: C bb_candidate_history builds and runs SQL text';
  end if;

  raise notice 'ALL 0034 TESTS PASSED';
end
$$;

select 'ALL 0034 TESTS PASSED' as result;

rollback;
