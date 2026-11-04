-- =====================================================================
-- 0035_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0035_color_belt_cleanup.sql (the
--   old one-click Mark paid functions removed). It checks, in this order:
--     G1  both old functions are gone (in every schema, every argument
--         list), and calling one as a signed-in user fails as "no such
--         function"
--     B1  0030's event Mark paid (testing_mark_paid_by) still works for
--         the desk: price_changed, ok with the family's way, double click
--         -> stale, already_paid, the desk's own Undo, then paid again a
--         different way ("Paying by" follows); anon may not run it
--     B2  0030's private Mark paid (testing_private_mark_paid_by) still
--         works: ok, already_paid, Undo, a part payment topped up
--     K1  nothing else changed: every other Color Belt app function from
--         0005, 0010, 0014 and 0030 is still there with the same rights
--         (security definer, search_path = '', only authenticated may run
--         it, nothing for anon / service_role / the family form), and
--         the two *_by functions are each there once
--   It makes its own class "zz cb35 ..." and event, so it works whatever
--   is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change. NEVER change the final
--   "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   0005, 0010, 0014, 0030 and 0035 are applied. You need two ACTIVE
--   staff rows: an admin and the shared front desk (role staff). Replace
--   <paste-admin-UID-here> and <paste-desk-UID-here> below with their
--   UIDs (Authentication -> Users), paste the whole file into the SQL
--   Editor and click Run. Everything is rolled back.
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0035 TESTS PASSED". Failed: an error starting
--   with "TEST FAILED:" (or "TEST SETUP:") saying which check broke and
--   what came back. Nothing was saved either way. If it failed, run
--   rollback;   on its own once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Test helpers (temporary: they vanish with the session, and the
-- rollback undoes them anyway) - the same as 0030_tests.sql
-- ---------------------------------------------------------------------

-- t_call(role, login token, call): run ONE function call as that role and
-- login, then switch back to the SQL Editor's role. Returns the answer.
create function pg_temp.t_call(p_role text, p_claims text, p_call text)
returns jsonb
language plpgsql
as $$
declare
  v_r jsonb;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  if p_role = 'anon' then
    set local role anon;
  else
    set local role authenticated;
  end if;
  begin
    execute 'select ' || p_call into v_r;
  exception
    when others then
      reset role;
      raise;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_r;
end;
$$;

-- t_eq(label, got, want): fail when they differ (as text)
create function pg_temp.t_eq(p_label text, p_got text, p_want text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'TEST FAILED: % - got %, expected %', p_label, coalesce(p_got, 'NULL'), coalesce(p_want, 'NULL');
  end if;
end;
$$;

-- t_reg(event, event rank, first, last, paying by): one staff-added
-- registration written straight into the table (as the SQL Editor)
create function pg_temp.t_reg(p_event uuid, p_rank uuid, p_first text, p_last text, p_paying_by text)
returns uuid
language sql
as $$
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (p_event, p_rank, p_first, p_last, p_paying_by, true, 'staff')
  returning id;
$$;

-- t_ver(registration) / t_pver(private testing): the current version
create function pg_temp.t_ver(p_id uuid)
returns integer
language sql
as $$ select r.version from public.testing_registrations r where r.id = p_id; $$;

create function pg_temp.t_pver(p_id uuid)
returns integer
language sql
as $$ select p.version from public.testing_private p where p.id = p_id; $$;


do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();
  v_amr jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60));
  v_c_a1 text;
  v_c_d1 text;

  v_tag   text := 'zz cb35 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_role  text;
  v_cls   uuid;  v_rk1 uuid;
  v_ev    uuid;  v_evk1 uuid;
  v_x     uuid;
  v_p     uuid;
  v_r     jsonb;
  v_pay   uuid;
  v_txt   text;
  v_ok    boolean;
  v_fn    record;
begin
  -- ===================================================================
  -- Setup (as the SQL Editor's role)
  -- ===================================================================
  select s.role into v_role from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role into v_role from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer)') is null then
    raise exception 'TEST SETUP: 0030 is not applied';
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_d1, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr)::text;

  -- a Worcester test class with one rank: Yellow (early 65.00, day 75.00,
  -- private 85.00); one event in 5 days (the early price)
  v_cls := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_class(%L, %L, null, true)', 'worcester', v_tag)) ->> 'id')::uuid;
  v_rk1 := (pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_add_rank(%L, %L, 6500, 7500, 8500, false, %L, %L, null, 0, %L)', v_cls, 'Yellow', 'solid', 'yellow', 'yellow')) ->> 'id')::uuid;
  v_ev := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' later', v_today + 5,
    jsonb_build_array(jsonb_build_object('class_id', v_cls, 'start_time', '17:00', 'end_time', '18:00'))::text)) ->> 'id')::uuid;
  if v_rk1 is null or v_ev is null then
    raise exception 'TEST SETUP: could not create the test class / rank / event';
  end if;
  select k.id into v_evk1 from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ev and k.rank_id = v_rk1;


  -- ===================================================================
  -- G1. The old functions are gone
  -- ===================================================================
  perform pg_temp.t_eq('G1 testing_mark_paid(uuid, integer) is gone',
    (to_regprocedure('public.testing_mark_paid(uuid, integer)') is null)::text, 'true');
  perform pg_temp.t_eq('G1 testing_private_mark_paid(uuid, integer) is gone',
    (to_regprocedure('public.testing_private_mark_paid(uuid, integer)') is null)::text, 'true');
  perform pg_temp.t_eq('G1 no function of either name in any schema, any arguments',
    (select count(*)::text from pg_proc p where p.proname in ('testing_mark_paid', 'testing_private_mark_paid')), '0');
  v_x := pg_temp.t_reg(v_ev, v_evk1, 'Cb35', 'Gone', 'cash');
  v_ok := false;
  begin
    perform pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid(%L, 1)', v_x));
  exception when undefined_function then v_ok := true;
  end;
  perform pg_temp.t_eq('G1 calling testing_mark_paid fails as "no such function"', v_ok::text, 'true');
  v_ok := false;
  begin
    perform pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid(%L, 1)', v_x));
  exception when undefined_function then v_ok := true;
  end;
  perform pg_temp.t_eq('G1 calling testing_private_mark_paid fails as "no such function"', v_ok::text, 'true');
  perform pg_temp.t_eq('G1 nothing was written by those calls',
    (select count(*)::text from public.testing_payments p where p.registration_id = v_x), '0');


  -- ===================================================================
  -- B1. Event Mark paid (0030) still works
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 7500)', v_x, 'cash'));
  perform pg_temp.t_eq('B1 price_changed (it is still early)', v_r::text, '{"status": "price_changed", "amount_cents": 6500}');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_x, 'cash'));
  perform pg_temp.t_eq('B1 ok by the family''s way', (v_r ->> 'status') || ':' || (v_r ->> 'amount_cents') || ':' || (v_r ->> 'method')
    || ':' || (v_r ->> 'paying_by') || ':' || (v_r ->> 'version'), 'ok:6500:cash:cash:2');
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('B1 one payment row, the early price, cash, today',
    (select string_agg(p.kind || ':' || p.amount_cents || ':' || p.method || ':' || (p.paid_on = v_today), ',')
       from public.testing_payments p where p.registration_id = v_x), 'payment:6500:cash:true');
  perform pg_temp.t_eq('B1 double click (old version) -> stale', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_x, 'cash')) ->> 'status', 'stale');
  perform pg_temp.t_eq('B1 again with the new version -> already_paid', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 2, %L, 6500)', v_x, 'cash')) ->> 'status', 'already_paid');
  perform pg_temp.t_eq('B1 the desk''s own Undo', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_undo_payment(%L)', v_pay)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, %s, %L, 6500)', v_x, pg_temp.t_ver(v_x), 'card'));
  perform pg_temp.t_eq('B1 paid again by card: "Paying by" follows', (v_r ->> 'status') || ':' || (v_r ->> 'method') || ':' || (v_r ->> 'paying_by'),
    'ok:card:card');
  perform pg_temp.t_eq('B1 the card payment remembers the family''s cash',
    (select p.paying_by_before from public.testing_payments p where p.id = (v_r ->> 'payment_id')::uuid), 'cash');
  v_ok := false;
  begin
    perform pg_temp.t_call('anon', null, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_x, 'cash'));
  exception when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.t_eq('B1 anon may not run testing_mark_paid_by', v_ok::text, 'true');


  -- ===================================================================
  -- B2. Private Mark paid (0030) still works
  -- ===================================================================
  v_p := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'worcester', 'Cb35', 'Private', v_rk1, 'check', v_today + 3, '17:00')) ->> 'id')::uuid;
  if v_p is null then raise exception 'TEST SETUP: could not add the private testing'; end if;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, %s, %L, 8500)', v_p, pg_temp.t_pver(v_p), 'check'));
  perform pg_temp.t_eq('B2 ok, the private price by check', (v_r ->> 'status') || ':' || (v_r ->> 'amount_cents') || ':' || (v_r ->> 'method'),
    'ok:8500:check');
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('B2 nothing owed -> already_paid', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_mark_paid_by(%L, %s, %L, 8500)', v_p, pg_temp.t_pver(v_p), 'check')) ->> 'status', 'already_paid');
  perform pg_temp.t_eq('B2 the desk''s own Undo', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_undo_payment(%L)', v_pay)) ->> 'status', 'ok');
  -- a part payment written by an admin's Edit: pay, edit down to 50.00, then the top-up is the rest
  v_pay := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, %s, %L, 8500)', v_p, pg_temp.t_pver(v_p), 'check'))
            ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('B2 admin edits the payment to 50.00', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_private_edit_payment(%L, %L, 5000, %L)', v_pay, 'check', v_today)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, %s, %L, 3500)', v_p, pg_temp.t_pver(v_p), 'check'));
  perform pg_temp.t_eq('B2 the top-up is only the rest (35.00)', (v_r ->> 'status') || ':' || (v_r ->> 'amount_cents'), 'ok:3500');


  -- ===================================================================
  -- K1. Nothing else changed
  -- ===================================================================
  select string_agg(x.sig, ', ') into v_txt
    from unnest(array[
      -- 0005's app functions (minus the removed testing_mark_paid)
      'public.testing_add_event(text, text, date, jsonb, boolean, date, text)',
      'public.testing_update_event(uuid, integer, text, date, jsonb, date, text)',
      'public.testing_set_registration(uuid, integer, boolean)',
      'public.testing_add_student(uuid, text, text, uuid, boolean, text)',
      'public.testing_update_student(uuid, integer, text, text, uuid)',
      'public.testing_change_paying_by(uuid, integer, text)',
      'public.testing_undo_payment(uuid)',
      'public.testing_edit_payment(uuid, text, integer, date)',
      'public.testing_resolve_duplicate(uuid, integer, uuid, integer, boolean)',
      'public.testing_withdraw_student(uuid, integer)',
      'public.testing_restore_student(uuid, integer)',
      'public.settings_update_school_address(text, integer, text, text, text, text)',
      -- 0010
      'public.testing_set_result(uuid, text)',
      'public.testing_set_result_note(uuid, text)',
      -- 0014's app functions (minus the removed testing_private_mark_paid)
      'public.testing_private_add(text, text, text, uuid, boolean, text, date, time)',
      'public.testing_private_update(uuid, integer, text, text, uuid)',
      'public.testing_private_change_day(uuid, integer, date, time)',
      'public.testing_private_change_paying_by(uuid, integer, text)',
      'public.testing_private_undo_payment(uuid)',
      'public.testing_private_edit_payment(uuid, text, integer, date)',
      'public.testing_private_cancel(uuid, integer)',
      'public.testing_private_restore(uuid, integer)',
      'public.testing_private_set_result(uuid, text)',
      'public.testing_private_set_result_note(uuid, text)',
      'public.testing_move_to_private(uuid, integer, date, time)',
      'public.testing_private_undo_move(uuid, integer)',
      -- 0030
      'public.testing_mark_paid_by(uuid, integer, text, integer)',
      'public.testing_private_mark_paid_by(uuid, integer, text, integer)',
      'public.testing_registration_history(uuid)',
      'public.testing_private_history(uuid)',
      'public.testing_results_csv(uuid)']) as x(sig)
   where to_regprocedure(x.sig) is null
      or not has_function_privilege('authenticated', to_regprocedure(x.sig), 'execute')
      or has_function_privilege('anon', to_regprocedure(x.sig), 'execute')
      or has_function_privilege('service_role', to_regprocedure(x.sig), 'execute')
      or has_function_privilege('testing_registrar', to_regprocedure(x.sig), 'execute')
      or not (select p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
                from pg_proc p where p.oid = to_regprocedure(x.sig));
  if v_txt is not null then raise exception 'TEST FAILED: K1 missing or changed rights: %', v_txt; end if;
  perform pg_temp.t_eq('K1 each *_by Mark paid function is there once (one version)',
    (select string_agg(p.proname || ':' || p.pronargs, ',' order by p.proname collate "C") from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('testing_mark_paid_by', 'testing_private_mark_paid_by')),
    'testing_mark_paid_by:4,testing_private_mark_paid_by:4');
end;
$$;

select 'ALL 0035 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
