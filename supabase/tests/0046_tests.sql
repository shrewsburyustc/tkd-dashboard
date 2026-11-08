-- =====================================================================
-- 0046_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0046_black_belt_payment_school.sql
--   (every Black Belt payment counts at the school of the desk that took
--   it; rulebook v1.035 / v1.040, design-review item R1-01). It checks,
--   in this order:
--     P1  the app that is live today (it does not send p_school): Record
--         payment as role "authenticated", called by position (6 values)
--         and by name (6 names) - still works and stores the CANDIDATE's
--         school
--     P2  p_school stores the desk's school: a Worcester candidate's
--         payment recorded with p_school = 'shrewsbury' is stored (and
--         logged) as shrewsbury; by name too; blank ('' or only spaces)
--         = the candidate's school
--     P3  an unknown school ('boston', 'Worcester' - codes are lower case,
--         'worcester;') -> {"status":"invalid"}, nothing stored, the
--         candidate's version unchanged; a stale version is still "stale"
--     U   the chain rule (v0.903) is unchanged: Undo payment (by the desk
--         within 10 seconds and by an admin), Edit payment, Mark check
--         returned and the Undo of a returned mark copy the school from
--         the row they correct - never from the candidate or the desk
--     R   Record refund: p_school is the desk that hands the money back;
--         blank = the school of the candidate's latest live payment (the
--         cycle name too); an unknown school -> invalid; staff may still
--         not refund (not_allowed, checked before the input); a refund
--         that is too large still says refund_too_large; Undo refund
--         copies the refund's school
--     A   who may call them: an ended PIN unlock and no sign-in ->
--         no_access (before the input check); anon, the family form's
--         login bb_registrar and service_role may not run either function
--     C   the catalog: ONE version of each function (the old 6-input and
--         5-input versions are gone), plpgsql, volatile, security
--         definer, search_path = '', one input with a default, owner, and
--         only authenticated may run them
--   It makes its own test cycle and candidates ("zz test 1a2b3c4d ..."),
--   so it works whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test cycle, candidates,
--   payments, history rows, test sessions, a waiver saved for the test).
--   NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0034_tests.sql (read 0016_tests.sql's header): "set
--   local role authenticated" + a pretend login token per session.
--   Sessions: A1 admin unlocked · A2 admin, PIN unlock ran out · D1 desk
--   (role staff) unlocked.
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0010, 0011, 0016, 0024, 0025 and 0046 are applied. You
--      need TWO existing, ACTIVE staff rows: an admin and the shared front
--      desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0046 TESTS PASSED".
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
  v_mail  text := 'zzps' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_today date := public.testing_today();
  v_rand  uuid := gen_random_uuid();
  v_adult date := (public.testing_today() - interval '30 years')::date;
  v_role  text;
  v_cname text;

  v_r     jsonb;
  v_txt   text;
  v_n     integer;
  v_v     integer;
  v_v2    integer;
  v_case  record;
  v_fn    text;

  v_cycle uuid; v_full uuid; v_kim uuid; v_lee uuid; v_max uuid;
  v_pa uuid; v_pb uuid; v_pb2 uuid; v_pc uuid; v_pc2 uuid; v_chk uuid; v_ret uuid; v_pn uuid;
  v_lp uuid; v_lr1 uuid; v_lr2 uuid; v_mp uuid; v_mr1 uuid; v_mr2 uuid;
  v_rev uuid;
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
  if to_regprocedure('public.bb_record_payment(uuid, integer, integer, text, text[], text, text)') is null
     or to_regprocedure('public.bb_record_refund(uuid, integer, integer, text, text, text)') is null then
    raise exception 'TEST SETUP: 0046 is not applied (or 0016 was re-run after it - paste 0046 again)';
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

  -- the purge stays off (as 0034_tests.sql)
  update public.bb_settings set keep_years_after_last_day = null, keep_years_after_18 = null;

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   bbs_ver(uuid)  the candidate's current version
  --   bbs_school(uuid)  the school stored on one payment row
  -- On production a function made here gives nobody else the right to run it, and these helpers
  -- are called after `set local role authenticated`: so each one is security definer (it reads as
  -- the test's own owner, not as the caller) and is granted to public right after it is made.
  execute $f$
    create function pg_temp.bbs_ver(p uuid) returns integer
    language sql security definer set search_path = '' as $b$ select c.version from public.bb_candidates c where c.id = p; $b$;
  $f$;
  execute 'grant execute on function pg_temp.bbs_ver(uuid) to public';
  execute $f$
    create function pg_temp.bbs_school(p uuid) returns text
    language sql security definer set search_path = '' as $b$ select x.location_code from public.bb_payments x where x.id = p; $b$;
  $f$;
  execute 'grant execute on function pg_temp.bbs_school(uuid) to public';

  -- a school waiver (not the placeholder), saved for this run only when
  -- the current one is still the placeholder (as 0034_tests.sql)
  perform set_config('request.jwt.claims', v_c_a1, true);
  if (select v.is_placeholder from public.bb_waiver_versions v where v.superseded_at is null) then
    v_r := public.bb_save_waiver((select v.id from public.bb_waiver_versions v where v.superseded_at is null),
                                 'zz test waiver ' || v_tag || ': every subject must be passed.');
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_save_waiver answered %', v_r; end if;
  end if;

  -- the cycle (0034_tests.sql's payload), open
  v_r := public.bb_add_cycle(jsonb_build_object(
    'name', v_tag || ' Payment school', 'application_due', v_today + 20, 'submissions_due', v_today + 40, 'auto_close', true,
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
  select y.name into v_cname from public.bb_cycles y where y.id = v_cycle;
  v_r := public.bb_set_registration(v_cycle, 1, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: opening the cycle answered %', v_r; end if;

  -- Kim and Lee: Worcester candidates; Max: a Shrewsbury candidate (all at the desk, paper waiver)
  v_r := public.bb_add_candidate(v_cycle, 'Kim', 'Zzschool', v_adult, v_mail || '.kim@example.com', 'worcester', 1, v_full, false, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add Kim answered %', v_r; end if;
  v_kim := (v_r ->> 'id')::uuid;
  v_r := public.bb_add_candidate(v_cycle, 'Lee', 'Zzschool', v_adult, v_mail || '.lee@example.com', 'worcester', 1, v_full, false, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add Lee answered %', v_r; end if;
  v_lee := (v_r ->> 'id')::uuid;
  v_r := public.bb_add_candidate(v_cycle, 'Max', 'Zzschool', v_adult, v_mail || '.max@example.com', 'shrewsbury', 1, v_full, false, true);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: add Max answered %', v_r; end if;
  v_max := (v_r ->> 'id')::uuid;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- P1. The app that is live today does not send p_school
  --     (as role authenticated, the way the web API calls it)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_v := pg_temp.bbs_ver(v_kim);
  set local role authenticated;
  v_r := public.bb_record_payment(v_kim, v_v, 1000, 'cash', array['p1'], null);              -- by position, 6 values
  reset role;
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'worcester' then
    raise exception 'TEST FAILED: P1 a 6-value positional call should work and store the candidate''s school (worcester), got %', left(v_r::text, 300);
  end if;
  v_pa := (v_r ->> 'payment_id')::uuid;
  v_v := pg_temp.bbs_ver(v_kim);
  set local role authenticated;
  v_r := public.bb_record_payment(p_candidate_id => v_kim, p_expected_version => v_v, p_amount_cents => 700,
                                  p_method => 'cash', p_for_items => array['p1'], p_note => null);   -- by name, 6 names
  reset role;
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'worcester' then
    raise exception 'TEST FAILED: P1 a 6-name call should work and store the candidate''s school (worcester), got %', left(v_r::text, 300);
  end if;
  v_pn := (v_r ->> 'payment_id')::uuid;
  -- the answer still carries the new version and the money picture
  if (v_r ->> 'version')::integer <> pg_temp.bbs_ver(v_kim) or jsonb_typeof(v_r -> 'money') <> 'object' then
    raise exception 'TEST FAILED: P1 the answer lost its version or money picture: %', left(v_r::text, 300);
  end if;
  -- an old-style call for the SHREWSBURY candidate stores shrewsbury (his own school)
  v_v := pg_temp.bbs_ver(v_max);
  set local role authenticated;
  v_r := public.bb_record_payment(v_max, v_v, 100, 'cash', array['p1'], null);
  reset role;
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: P1 without p_school Max''s payment should count at shrewsbury, got %', left(v_r::text, 300);
  end if;
  v_r := public.bb_undo_payment((v_r ->> 'payment_id')::uuid);     -- (keeps Max clean for R)
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: undo of Max''s first payment answered %', v_r; end if;

  -- ===================================================================
  -- P2. p_school stores the desk's school
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_record_payment(v_kim, pg_temp.bbs_ver(v_kim), 2000, 'cash', array['p1'], null, 'shrewsbury');
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: P2 a Worcester candidate''s payment with p_school = shrewsbury should be stored as shrewsbury, got %', left(v_r::text, 300);
  end if;
  v_pb := (v_r ->> 'payment_id')::uuid;
  -- the history row says it too (and still the same action tag)
  select count(*) into v_n from public.change_log l
   where l.table_name = 'bb_payments' and l.record_id = v_pb and l.op = 'insert'
     and l.location_code = 'shrewsbury' and l.action = 'bb_record_payment' and l.after ->> 'location_code' = 'shrewsbury';
  if v_n <> 1 then raise exception 'TEST FAILED: P2 the history row of the payment should show location shrewsbury and action bb_record_payment'; end if;
  -- the cycle name is still the cycle's, the candidate keeps his own school
  if (select p.cycle_name from public.bb_payments p where p.id = v_pb) is distinct from v_cname
     or (select c.location_code from public.bb_candidates c where c.id = v_kim) <> 'worcester' then
    raise exception 'TEST FAILED: P2 the payment keeps the cycle''s name and the candidate keeps worcester';
  end if;
  -- by name, with a check (kept for the returned-check test below)
  v_r := public.bb_record_payment(p_candidate_id => v_kim, p_expected_version => pg_temp.bbs_ver(v_kim), p_amount_cents => 500,
                                  p_method => 'check', p_for_items => array['p1'], p_note => 'zz check', p_school => 'shrewsbury');
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: P2 a named p_school = shrewsbury should be stored as shrewsbury, got %', left(v_r::text, 300);
  end if;
  v_chk := (v_r ->> 'payment_id')::uuid;
  -- the other way round: a desk in Worcester takes a Shrewsbury candidate's money
  v_r := public.bb_record_payment(v_max, pg_temp.bbs_ver(v_max), 3000, 'cash', array['p1'], null, 'worcester');
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'worcester' then
    raise exception 'TEST FAILED: P2 Max''s payment with p_school = worcester should be stored as worcester, got %', left(v_r::text, 300);
  end if;
  v_mp := (v_r ->> 'payment_id')::uuid;
  -- blank = the candidate's school: null, '' and only spaces
  v_r := public.bb_record_payment(v_kim, pg_temp.bbs_ver(v_kim), 300, 'cash', array['p1'], null, '');
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'worcester' then
    raise exception 'TEST FAILED: P2 an empty p_school should mean the candidate''s school (worcester), got %', left(v_r::text, 300);
  end if;
  v_pc := (v_r ->> 'payment_id')::uuid;
  v_r := public.bb_record_payment(v_kim, pg_temp.bbs_ver(v_kim), 100, 'cash', array['p1'], null, '   ');
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'worcester' then
    raise exception 'TEST FAILED: P2 a p_school of only spaces should mean the candidate''s school, got %', left(v_r::text, 300);
  end if;
  v_r := public.bb_record_payment(v_kim, pg_temp.bbs_ver(v_kim), 100, 'cash', array['p1'], null, null);
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'worcester' then
    raise exception 'TEST FAILED: P2 a null p_school should mean the candidate''s school, got %', left(v_r::text, 300);
  end if;
  -- the candidate's own school given explicitly is the same as blank
  v_r := public.bb_record_payment(v_kim, pg_temp.bbs_ver(v_kim), 100, 'cash', array['p1'], null, 'worcester');
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'worcester' then
    raise exception 'TEST FAILED: P2 p_school = worcester for a Worcester candidate should store worcester, got %', left(v_r::text, 300);
  end if;

  -- ===================================================================
  -- P3. An unknown school is refused, nothing is stored; stale is still stale
  -- ===================================================================
  foreach v_txt in array array['boston', 'Worcester', 'SHREWSBURY', 'worcester;', 'shrewsbury ; x', 'zz'] loop
    v_v := pg_temp.bbs_ver(v_kim);
    select count(*) into v_n from public.bb_payments p where p.candidate_id = v_kim;
    v_r := public.bb_record_payment(v_kim, v_v, 100, 'cash', array['p1'], null, v_txt);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: P3 p_school = % should be invalid, got %', v_txt, left(v_r::text, 300);
    end if;
    if (select count(*) from public.bb_payments p where p.candidate_id = v_kim) <> v_n or pg_temp.bbs_ver(v_kim) <> v_v then
      raise exception 'TEST FAILED: P3 an invalid p_school (%) stored a payment or moved the version', v_txt;
    end if;
  end loop;
  -- stale (a wrong version) is still stale, with or without a school
  v_v := pg_temp.bbs_ver(v_kim);
  if public.bb_record_payment(v_kim, v_v + 5, 100, 'cash', array['p1'], null, 'shrewsbury') is distinct from '{"status": "stale"}'::jsonb
     or public.bb_record_payment(v_rand, 1, 100, 'cash', array['p1'], null, 'shrewsbury') is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: P3 a wrong version should still be stale and an unknown candidate not_found';
  end if;
  -- the other bad inputs are still invalid with a good school
  if public.bb_record_payment(v_kim, v_v, 0, 'cash', array['p1'], null, 'shrewsbury') is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_record_payment(v_kim, v_v, 100, 'bitcoin', array['p1'], null, 'shrewsbury') is distinct from '{"status": "invalid"}'::jsonb
     or public.bb_record_payment(v_kim, v_v, 100, 'cash', array['p13'], null, 'shrewsbury') is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: P3 a bad amount, way or item is still invalid when p_school is good';
  end if;

  -- ===================================================================
  -- U. The chain rule: an undo, an edit and a returned check copy the
  --    school of the payment they correct
  -- ===================================================================
  -- the desk undoes its own payment (inside 10 seconds): the Worcester one
  v_r := public.bb_undo_payment(v_pa);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: U the desk''s undo of its own payment answered %', left(v_r::text, 300); end if;
  select p.id, p.location_code, p.cycle_name into v_case from public.bb_payments p where p.reverses_payment_id = v_pa and p.kind = 'reversal';
  if v_case.location_code is distinct from 'worcester' or v_case.cycle_name is distinct from v_cname then
    raise exception 'TEST FAILED: U the undo of a worcester payment should be worcester, got %', v_case.location_code;
  end if;
  -- an admin edits the SHREWSBURY payment of a Worcester candidate: the reversal and the new payment are shrewsbury
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.bb_edit_payment(v_pb, 2500, 'cash', array['p1'], null, 'zz fix amount');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: U edit payment answered %', left(v_r::text, 300); end if;
  v_pb2 := (v_r ->> 'payment_id')::uuid;
  select count(*) into v_n from public.bb_payments p
   where p.candidate_id = v_kim and p.location_code = 'shrewsbury'
     and ((p.kind = 'reversal' and p.reverses_payment_id = v_pb) or p.id = v_pb2);
  if v_n <> 2 then raise exception 'TEST FAILED: U the edit''s reversal and new payment should both be shrewsbury (found % of 2)', v_n; end if;
  -- an admin edits the Worcester payment: both worcester
  v_r := public.bb_edit_payment(v_pc, 400, 'cash', array['p1'], null, 'zz fix amount');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: U edit payment (worcester) answered %', left(v_r::text, 300); end if;
  v_pc2 := (v_r ->> 'payment_id')::uuid;
  select count(*) into v_n from public.bb_payments p
   where p.candidate_id = v_kim and p.location_code = 'worcester'
     and ((p.kind = 'reversal' and p.reverses_payment_id = v_pc) or p.id = v_pc2);
  if v_n <> 2 then raise exception 'TEST FAILED: U the worcester edit''s reversal and new payment should both be worcester (found % of 2)', v_n; end if;
  -- an admin undoes the edited (shrewsbury) payment
  v_r := public.bb_undo_payment(v_pb2);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: U admin undo answered %', left(v_r::text, 300); end if;
  if (select p.location_code from public.bb_payments p where p.reverses_payment_id = v_pb2 and p.kind = 'reversal') is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: U the undo of the edited payment should be shrewsbury';
  end if;
  -- a check taken at the Shrewsbury desk bounces: the returned row is shrewsbury, and so is the undo of that mark
  v_r := public.bb_mark_check_returned(v_chk, 'zz bounced');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: U mark check returned answered %', left(v_r::text, 300); end if;
  v_ret := (v_r ->> 'payment_id')::uuid;
  if pg_temp.bbs_school(v_ret) is distinct from 'shrewsbury'
     or (select p.cycle_name from public.bb_payments p where p.id = v_ret) is distinct from v_cname then
    raise exception 'TEST FAILED: U the returned row of a shrewsbury check should be shrewsbury, got %', pg_temp.bbs_school(v_ret);
  end if;
  v_r := public.bb_undo_payment(v_ret);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: U undo of a returned mark answered %', left(v_r::text, 300); end if;
  if (select p.location_code from public.bb_payments p where p.reverses_payment_id = v_ret and p.kind = 'reversal') is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: U the undo of the returned mark should be shrewsbury';
  end if;
  -- as a whole: every row that corrects another has exactly that row's school and cycle name
  if exists (select 1 from public.bb_payments r join public.bb_payments t on t.id = r.reverses_payment_id
              where r.candidate_id = v_kim and (r.location_code <> t.location_code or r.cycle_name <> t.cycle_name)) then
    raise exception 'TEST FAILED: U a correction row differs from the row it corrects in school or cycle name';
  end if;
  -- the database refuses a reversal / returned row with another school (v0.903's guard, unchanged)
  perform set_config('request.jwt.claims', '', true);
  begin
    insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason,
                                    location_code, cycle_name, recorded_at, recorded_by_name, reverses_payment_id)
    select p.candidate_id, p.cycle_id, 'reversal', -p.amount_cents, p.method, v_today, null, null, null,
           'worcester', p.cycle_name, now(), 'zz', p.id
      from public.bb_payments p where p.id = v_chk;
    raise exception 'TEST FAILED: U a reversal with another school than the row it undoes was accepted';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- R. Record refund: the desk that hands the money back
  -- ===================================================================
  -- Lee (a Worcester candidate) pays 5000 at the Shrewsbury desk
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.bb_record_payment(v_lee, pg_temp.bbs_ver(v_lee), 5000, 'cash', array['p1'], null, 'shrewsbury');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: Lee''s payment answered %', left(v_r::text, 300); end if;
  v_lp := (v_r ->> 'payment_id')::uuid;
  -- staff may not refund - checked before the input, with and without a school
  if public.bb_record_refund(v_lee, pg_temp.bbs_ver(v_lee), 100, 'cash', null) is distinct from '{"status": "not_allowed"}'::jsonb
     or public.bb_record_refund(v_lee, pg_temp.bbs_ver(v_lee), 100, 'cash', null, 'worcester') is distinct from '{"status": "not_allowed"}'::jsonb
     or public.bb_record_refund(null, null, -1, '', null, 'nowhere') is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: R the front desk may not record a refund (not_allowed, before the input check)';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- the admin, no school (the old call, 5 values, as the live app sends it): the school of Lee's only live payment
  v_v := pg_temp.bbs_ver(v_lee);
  set local role authenticated;
  v_r := public.bb_record_refund(v_lee, v_v, 100, 'cash', null);
  reset role;
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: R a refund without p_school should take the school of the latest live payment (shrewsbury), got %', left(v_r::text, 300);
  end if;
  v_lr1 := (v_r ->> 'payment_id')::uuid;
  if (select p.cycle_name from public.bb_payments p where p.id = v_lr1) is distinct from v_cname
     or (select p.amount_cents from public.bb_payments p where p.id = v_lr1) <> -100 then
    raise exception 'TEST FAILED: R the refund keeps the cycle name and is stored negative';
  end if;
  -- the admin at the Worcester desk hands money back: p_school wins over the payment's school
  v_r := public.bb_record_refund(v_lee, pg_temp.bbs_ver(v_lee), 200, 'check', 'zz gave back', 'worcester');
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'worcester' then
    raise exception 'TEST FAILED: R a refund with p_school = worcester should be stored as worcester, got %', left(v_r::text, 300);
  end if;
  v_lr2 := (v_r ->> 'payment_id')::uuid;
  select count(*) into v_n from public.change_log l
   where l.table_name = 'bb_payments' and l.record_id = v_lr2 and l.op = 'insert'
     and l.location_code = 'worcester' and l.action = 'bb_record_refund';
  if v_n <> 1 then raise exception 'TEST FAILED: R the refund''s history row should show location worcester and action bb_record_refund'; end if;
  if (select p.cycle_name from public.bb_payments p where p.id = v_lr2) is distinct from v_cname then
    raise exception 'TEST FAILED: R a refund with p_school still takes the cycle name of the payment';
  end if;
  -- blank (empty / spaces) = no school; a bad school is invalid and stores nothing
  v_r := public.bb_record_refund(v_lee, pg_temp.bbs_ver(v_lee), 10, 'cash', null, '  ');
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: R a blank p_school should mean the latest live payment''s school, got %', left(v_r::text, 300);
  end if;
  foreach v_txt in array array['boston', 'Worcester', 'worcester;'] loop
    v_v := pg_temp.bbs_ver(v_lee);
    select count(*) into v_n from public.bb_payments p where p.candidate_id = v_lee;
    v_r := public.bb_record_refund(v_lee, v_v, 10, 'cash', null, v_txt);
    if v_r is distinct from '{"status": "invalid"}'::jsonb
       or (select count(*) from public.bb_payments p where p.candidate_id = v_lee) <> v_n or pg_temp.bbs_ver(v_lee) <> v_v then
      raise exception 'TEST FAILED: R a refund with p_school = % should be invalid and store nothing, got %', v_txt, left(v_r::text, 300);
    end if;
  end loop;
  -- too large is still refund_too_large with a school; stale still stale
  v_r := public.bb_record_refund(v_lee, pg_temp.bbs_ver(v_lee), 500000, 'cash', null, 'worcester');
  if v_r ->> 'status' is distinct from 'refund_too_large' then
    raise exception 'TEST FAILED: R a too large refund should still be refund_too_large, got %', left(v_r::text, 300);
  end if;
  if public.bb_record_refund(v_lee, pg_temp.bbs_ver(v_lee) + 5, 10, 'cash', null, 'worcester') is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: R a wrong version should still be stale';
  end if;
  -- Max (a Shrewsbury candidate) was paid at the Worcester desk: a blank refund follows that payment, not Max
  v_r := public.bb_record_refund(v_max, pg_temp.bbs_ver(v_max), 100, 'cash', null);
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'worcester' then
    raise exception 'TEST FAILED: R a refund without p_school should follow the latest live payment (worcester), not the candidate, got %', left(v_r::text, 300);
  end if;
  v_mr1 := (v_r ->> 'payment_id')::uuid;
  v_r := public.bb_record_refund(v_max, pg_temp.bbs_ver(v_max), 100, 'cash', null, 'shrewsbury');
  if v_r ->> 'status' is distinct from 'ok' or pg_temp.bbs_school((v_r ->> 'payment_id')::uuid) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: R a refund with p_school = shrewsbury should be shrewsbury, got %', left(v_r::text, 300);
  end if;
  v_mr2 := (v_r ->> 'payment_id')::uuid;
  -- Undo refund copies the refund's school (not the payment's, not the candidate's)
  v_r := public.bb_undo_payment(v_lr2);
  if v_r ->> 'status' is distinct from 'ok'
     or (select p.location_code from public.bb_payments p where p.reverses_payment_id = v_lr2 and p.kind = 'reversal') is distinct from 'worcester' then
    raise exception 'TEST FAILED: R the undo of a worcester refund should be worcester, got %', left(v_r::text, 300);
  end if;
  v_r := public.bb_undo_payment(v_mr2);
  if v_r ->> 'status' is distinct from 'ok'
     or (select p.location_code from public.bb_payments p where p.reverses_payment_id = v_mr2 and p.kind = 'reversal') is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: R the undo of a shrewsbury refund should be shrewsbury, got %', left(v_r::text, 300);
  end if;
  -- existing money is untouched by all of this: Lee's net = 5000 - 100 - 10 (the 200 refund was undone)
  if (select coalesce(sum(p.amount_cents), 0) from public.bb_payments p where p.candidate_id = v_lee) <> 4890 then
    raise exception 'TEST FAILED: R Lee''s net should be 4890';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- A. Who may call them
  -- ===================================================================
  set local role authenticated;
  foreach v_txt in array array[v_c_a2, ''] loop
    perform set_config('request.jwt.claims', v_txt, true);
    if public.bb_record_payment(v_kim, 1, 100, 'cash', array['p1'], null, 'shrewsbury') is distinct from '{"status": "no_access"}'::jsonb
       or public.bb_record_payment(null, null, -1, '', null, null, 'nowhere') is distinct from '{"status": "no_access"}'::jsonb
       or public.bb_record_refund(v_kim, 1, 100, 'cash', null, 'shrewsbury') is distinct from '{"status": "no_access"}'::jsonb
       or public.bb_record_refund(null, null, -1, '', null, 'nowhere') is distinct from '{"status": "no_access"}'::jsonb then
      raise exception 'TEST FAILED: A a session without data access should get no_access (before the input check)';
    end if;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  foreach v_role in array array['anon', 'bb_registrar', 'service_role'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role)
       and (has_function_privilege(v_role, 'public.bb_record_payment(uuid, integer, integer, text, text[], text, text)', 'EXECUTE')
            or has_function_privilege(v_role, 'public.bb_record_refund(uuid, integer, integer, text, text, text)', 'EXECUTE')) then
      raise exception 'TEST FAILED: A % may run Record payment or Record refund', v_role;
    end if;
  end loop;
  set local role anon;
  begin
    perform public.bb_record_payment(v_kim, 1, 100, 'cash', array['p1'], null, 'shrewsbury');
    raise exception 'TEST FAILED: A anon could call bb_record_payment';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.bb_record_refund(v_kim, 1, 100, 'cash', null, 'shrewsbury');
    raise exception 'TEST FAILED: A anon could call bb_record_refund';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- ===================================================================
  -- C. The catalog
  -- ===================================================================
  foreach v_fn in array array['bb_record_payment', 'bb_record_refund'] loop
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_n <> 1 then raise exception 'TEST FAILED: C expected exactly one % (the old version must be gone), found %', v_fn, v_n; end if;
    select p.oid, p.prosecdef, p.proconfig, p.provolatile::text as vol, p.proowner, l.lanname, p.proacl, p.prosrc,
           p.pronargs, p.pronargdefaults, p.prorettype into v_case
      from pg_proc p join pg_language l on l.oid = p.prolang
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_case.lanname <> 'plpgsql' or v_case.vol <> 'v' or v_case.prosecdef is not true or v_case.prorettype <> 'jsonb'::regtype then
      raise exception 'TEST FAILED: C % should be plpgsql, volatile, security definer, returning jsonb', v_fn;
    end if;
    if v_case.pronargs <> (case v_fn when 'bb_record_payment' then 7 else 6 end) or v_case.pronargdefaults <> 1
       or pg_get_function_arguments(v_case.oid) not like '%p\_school text DEFAULT NULL::text' then
      raise exception 'TEST FAILED: C % should end with one defaulted input p_school text, got (%)', v_fn, pg_get_function_arguments(v_case.oid);
    end if;
    if not coalesce('search_path=""' = any (v_case.proconfig), false) then
      raise exception 'TEST FAILED: C % search_path is not set to ''''', v_fn;
    end if;
    if v_case.proowner <> (select c.relowner from pg_class c where c.oid = 'public.bb_cycles'::regclass) then
      raise exception 'TEST FAILED: C % owner differs from the Black Belt tables'' owner', v_fn;
    end if;
    if exists (select 1 from aclexplode(coalesce(v_case.proacl, acldefault('f', v_case.proowner))) a where a.grantee = 0) then
      raise exception 'TEST FAILED: C PUBLIC can run %', v_fn;
    end if;
    foreach v_role in array array['anon', 'service_role', 'bb_registrar', 'star_registrar', 'forms_registrar'] loop
      if exists (select 1 from pg_roles r where r.rolname = v_role) and has_function_privilege(v_role, v_case.oid, 'EXECUTE') then
        raise exception 'TEST FAILED: C % may run %', v_role, v_fn;
      end if;
    end loop;
    if has_function_privilege('authenticated', v_case.oid, 'EXECUTE') is not true then
      raise exception 'TEST FAILED: C authenticated may not run %', v_fn;
    end if;
    if v_case.prosrc ~* '\mexecute\M' then
      raise exception 'TEST FAILED: C % builds and runs SQL text', v_fn;
    end if;
  end loop;
  if to_regprocedure('public.bb_record_payment(uuid, integer, integer, text, text[], text)') is not null
     or to_regprocedure('public.bb_record_refund(uuid, integer, integer, text, text)') is not null then
    raise exception 'TEST FAILED: C an old 6-input Record payment or 5-input Record refund is still there';
  end if;
  -- the three functions that copy a payment's school are still single versions with their old inputs
  if to_regprocedure('public.bb_undo_payment(uuid)') is null
     or to_regprocedure('public.bb_edit_payment(uuid, integer, text, text[], text, text)') is null
     or to_regprocedure('public.bb_mark_check_returned(uuid, text)') is null then
    raise exception 'TEST FAILED: C Undo / Edit payment or Mark check returned changed their inputs';
  end if;

  raise notice 'ALL 0046 TESTS PASSED';
end
$$;

select 'ALL 0046 TESTS PASSED' as result;

rollback;
