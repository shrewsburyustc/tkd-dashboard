-- =====================================================================
-- 0011_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0011_finance.sql (Finance: the
--   Daily report, Close the day, History, Export, reminder settings). It
--   checks, in this order (contract 0011 section 2):
--     F1  role gates: anon gets nothing; locked / PIN-locked / signed-out
--         / 8-day / magic-link sessions get no_access from all 13
--         functions; staff are refused other days and the admin-only
--         functions; future days and unknown schools
--     F2  the chain rules on BOTH sources (Color Belt and Star): plain,
--         hidden mis-click, undone, edited once / twice, method-only edit,
--         moved, moved across three dates, moved then undone, undo after
--         edit, Star refund and undo of a refund, a Star item's school,
--         private Star line, and an undo dated weeks later
--     F3  totals and expected values by method, refunds, withdrawn students
--     F4  Close the day: matches / short / over, note_required, the checks
--         count, nothing_to_close, stale (new payment, method-only edit),
--         already_closed, negative cash, the snapshot, the guard trigger,
--         append-only, and staff closing today
--     F5  Undo close (10 seconds, only the closer) and Reopen
--     F6  Changed after closing (later payment, later undo, edit, deleted
--         student / event on both sources, Star school changed, late
--         mis-click undo, a payment moved in) + Added after closing
--     F7  the Home reminder (weekday times, Off, switch off, minute
--         boundary 7:29:59 / 7:30:00 PM New York, closed, no payments,
--         admins' earlier days) and the settings functions
--     F8  History tags, priority, month boundaries, Both
--     F9  Export: range rules, one log row per call, rows = the report
--     F10 privacy: no date of birth / email in any answer; no finance_
--         function body mentions those columns or login ids (except the
--         two listed helpers); every key of every answer on a fixed list
--     F11 catalog: RLS, no table rights, search_path, security definer
--         only on the 14, execute rights, owners, seeds
--     F12 impossible dates: NULL, 'infinity', '-infinity' and days before
--         2020-01-01 -> invalid, in every function that takes a date
--     F13 the REAL payment writers of 0005 / 0006 (testing_edit_payment,
--         testing_undo_payment, testing_mark_paid, star_record_payment,
--         star_edit_payment, star_undo_payment, star_record_refund), so a
--         change in how they write breaks this test
--     F14 finance_export_preview (count + total, no log row)
--   It makes its own test classes, events, students and payments with
--   unusual names ("zz fin ..."), on days in 2020-2023 (no real data; Finance refuses days before 2020)
--   there), so it works before AND after real payments exist.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change. NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0005_tests.sql / 0010_tests.sql: test sessions + a pretend login
--   token. The helper pg_temp.t_call(role, token, call) switches to that
--   role, runs one function call and switches back, so every check below
--   runs as the SQL Editor's role. Its answers are kept (pg_temp.t_answers)
--   for the privacy checks in F10.
--     A1 admin unlocked · A2 locked · A3 5 wrong PINs · A4 signed out ·
--     A5 password sign-in 8 days ago · A6 magic link ·
--     D1 desk unlocked · D2 desk locked · D3 desk magic link · anon
--   Payments are written straight into the payment tables (as the SQL
--   Editor's role) with chosen dates, times and logins, because the tests
--   need "11 seconds later" and "on a day in 2020".
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0010 and 0011 are applied. You need TWO existing, ACTIVE
--      staff rows: an admin and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test removes
--      its own test students and events and checks that some removals are
--      REFUSED. Everything is rolled back. Confirm.
--   (If today's Worcester drawer is already closed for real, the test
--   reopens it inside the transaction to try Close the day as the desk;
--   the rollback puts it back.)
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0011 TESTS PASSED".
--   * Failed: an error starting with "TEST FAILED:" (or "TEST SETUP:")
--     saying which check broke and what came back instead. Nothing was
--     saved either way. If it failed, run   rollback;   on its own once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Test helpers (temporary: they vanish with the session, and the
-- rollback undoes them anyway)
-- ---------------------------------------------------------------------

-- every answer a function gave during the test (for F10)
create temp table t_answers (fn text, r jsonb);

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
  insert into t_answers values (p_call, v_r);
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

-- t_at(day, time): that school-time moment as a timestamptz
create function pg_temp.t_at(p_day date, p_time time)
returns timestamptz
language sql
immutable
as $$
  select (p_day + p_time) at time zone 'America/New_York';
$$;

-- t_pay(...): write one payment / refund row straight into the table
create function pg_temp.t_pay(p_src text, p_owner uuid, p_kind text, p_amount integer, p_method text,
                              p_paid_on date, p_at timestamptz, p_by uuid, p_name text)
returns uuid
language plpgsql
as $$
declare
  v uuid;
begin
  if p_src = 'color_belt' then
    insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values (p_owner, p_kind, p_amount, p_method, p_paid_on, p_at, p_by, p_name) returning id into v;
  else
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values (p_owner, p_kind, p_amount, p_method, p_paid_on, p_at, p_by, p_name) returning id into v;
  end if;
  return v;
end;
$$;

-- t_rev(...): a reversal of one row (an Undo; dated p_paid_on = the day
-- it was made)
create function pg_temp.t_rev(p_src text, p_target uuid, p_paid_on date, p_at timestamptz, p_by uuid, p_name text)
returns uuid
language plpgsql
as $$
declare
  v uuid;
begin
  if p_src = 'color_belt' then
    insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by,
                                         recorded_by_name, reverses_payment_id)
    select p.registration_id, 'reversal', -p.amount_cents, p.method, p_paid_on, p_at, p_by, p_name, p.id
      from public.testing_payments p where p.id = p_target
    returning id into v;
  else
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by,
                                      recorded_by_name, reverses_payment_id)
    select p.candidate_id, 'reversal', -p.amount_cents, p.method, p_paid_on, p_at, p_by, p_name, p.id
      from public.star_payments p where p.id = p_target
    returning id into v;
  end if;
  return v;
end;
$$;

-- t_edit(...): an Edit payment exactly as testing_edit_payment /
-- star_edit_payment write it: a reversal dated the edit day + a new
-- payment, same moment, same login. Returns the new payment's id.
create function pg_temp.t_edit(p_src text, p_target uuid, p_amount integer, p_method text, p_paid_on date,
                               p_edit_day date, p_at timestamptz, p_by uuid, p_name text)
returns uuid
language plpgsql
as $$
declare
  v_owner uuid;
begin
  perform pg_temp.t_rev(p_src, p_target, p_edit_day, p_at, p_by, p_name);
  if p_src = 'color_belt' then
    select p.registration_id into v_owner from public.testing_payments p where p.id = p_target;
  else
    select p.candidate_id into v_owner from public.star_payments p where p.id = p_target;
  end if;
  return pg_temp.t_pay(p_src, v_owner, 'payment', p_amount, p_method, p_paid_on, p_at, p_by, p_name);
end;
$$;

-- t_sig(school, day): the day's items in one line, sorted:
-- "state:amount:method,..." ('' = no item)
create function pg_temp.t_sig(p_school text, p_day date)
returns text
language sql
as $$
  select coalesce(string_agg(m.state || ':' || m.amount_cents || ':' || m.method, ','
                             order by m.state, m.amount_cents, m.method), '')
    from public.finance_money_rows(p_school, p_day, p_day) m;
$$;

-- t_close(token, school, day, cash difference, note): load the day, then
-- close it with what the report expects (+ a cash difference) as that login
create function pg_temp.t_close(p_claims text, p_school text, p_day date, p_cash_delta integer, p_note text)
returns jsonb
language plpgsql
as $$
declare
  v_d jsonb;
begin
  v_d := pg_temp.t_call('authenticated', p_claims, format('public.finance_day(%L, %L)', p_school, p_day));
  if v_d ->> 'status' <> 'ok' then
    return v_d;
  end if;
  return pg_temp.t_call('authenticated', p_claims, format('public.finance_close_day(%L, %L, %L, %s, %s, %s, %s, %L)',
    p_school, p_day, v_d ->> 'fingerprint',
    (v_d #>> '{totals,cash,cents}')::integer + (v_d #>> '{refunds,cash_cents}')::integer + p_cash_delta,
    (v_d #>> '{totals,check,count}')::integer, (v_d #>> '{totals,check,cents}')::integer,
    (v_d #>> '{totals,card,cents}')::integer, p_note));
end;
$$;

-- t_keys(json): every object key anywhere inside a JSON value
create function pg_temp.t_keys(p jsonb)
returns setof text
language sql
as $$
  with recursive w(v) as (
    select p
    union all
    select e.value
      from w,
           lateral (select x.value from jsonb_each(case when jsonb_typeof(w.v) = 'object' then w.v else '{}'::jsonb end) as x
                    union all
                    select y.value from jsonb_array_elements(case when jsonb_typeof(w.v) = 'array' then w.v else '[]'::jsonb end) as y) as e
  )
  select distinct k
    from w, lateral jsonb_object_keys(case when jsonb_typeof(w.v) = 'object' then w.v else '{}'::jsonb end) as k;
$$;


do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();  v_a2 uuid := gen_random_uuid();  v_a3 uuid := gen_random_uuid();
  v_a4 uuid := gen_random_uuid();  v_a5 uuid := gen_random_uuid();  v_a6 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();  v_d2 uuid := gen_random_uuid();  v_d3 uuid := gen_random_uuid();

  v_now_s   bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_8d  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600));
  v_amr_otp jsonb := jsonb_build_array(jsonb_build_object('method', 'otp',      'timestamp', v_now_s - 60));

  v_c_a1 text; v_c_a2 text; v_c_a3 text; v_c_a4 text; v_c_a5 text; v_c_a6 text;
  v_c_d1 text; v_c_d2 text; v_c_d3 text;
  v_c_anon text := '{"role": "anon"}';

  v_tag   text := 'zz fin ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_b     date := date '2020-01-06';   -- the test's own days start here (Finance accepts 2020-01-01 on)
  v_an    text;   -- the admin's name
  v_dn    text;   -- the desk's name
  v_role  text;

  v_r    jsonb;
  v_r2   jsonb;
  v_i    integer;
  v_k    integer;
  v_n    integer;
  v_n2   integer;
  v_v    integer;
  v_txt  text;
  v_list text[];
  v_call text;
  v_calls text[];
  v_d    date;
  v_t    timestamptz;
  v_p    uuid;
  v_p1   uuid;
  v_p2   uuid;
  v_x    uuid;
  v_id   uuid;
  v_fp   text;
  v_src  text;
  v_sch  text;
  v_o    uuid;
  v_si   integer;
  v_w    integer;
  v_hm   date;
  v_last date;
  v_owner_name text;

  -- Color Belt test class, two events, their rank copies
  v_cls uuid; v_rank uuid; v_ev uuid; v_ev2 uuid; v_er uuid; v_er2 uuid;
  -- Star test events
  v_sev uuid; v_sev2 uuid;
  -- owners: 80 Color Belt registrations, 80 Star candidates
  v_cb uuid[] := '{}';
  v_st uuid[] := '{}';
  v_cb_wd uuid; v_cb_today uuid; v_cb_del uuid; v_cb_e2a uuid; v_cb_e2b uuid;
  v_st_w uuid; v_st_w2 uuid; v_st_w3 uuid; v_st_priv uuid; v_st_wd uuid; v_st_del uuid; v_st_e2 uuid; v_st_move uuid;
  v_case1_cb uuid; v_case2_cb uuid; v_case9 uuid; v_case9_p1 uuid; v_case10 uuid; v_case15_ref uuid; v_today_pay uuid;
  v_close uuid; v_close2 uuid;

  v_fn record;
  v_allowed_keys text[] := array[
    'status', 'day', 'school', 'fingerprint', 'totals', 'count', 'total_cents', 'in_cents', 'net_cents',
    'cash', 'check', 'card', 'cents', 'refunds', 'cash_cents', 'check_cents', 'card_cents', 'items', 'source', 'payment_id',
    'time', 'first_name', 'last_name', 'what', 'event_date', 'is_private', 'kind', 'method', 'amount_cents',
    'state', 'was_amount_cents', 'was_method', 'moved_to', 'moved_from', 'changed_by_name', 'changed_on',
    'recorded_by_name', 'added_after_closing', 'closing', 'id', 'by_name', 'at', 'cash_counted_cents',
    'checks_counted', 'checks_counted_cents', 'card_counted_cents', 'expected_count', 'expected_cash_cents',
    'expected_checks', 'expected_checks_cents', 'expected_card_cents', 'note', 'results', 'result', 'diff_cents',
    'count_result', 'count_diff', 'checks', 'changed_after', 'changed_count', 'can_close', 'can_undo_until',
    'schools', 'code', 'name', 'closed', 'month', 'unclosed_count', 'days', 'tag', 'diff_part',
    'closed_by_name', 'closed_at', 'item', 'event_name', 'event_id', 'history', 'paid_on', 'today', 'earlier', 'first_day',
    'closing_id', 'from', 'to', 'rows', 'counted_cents', 'reminder_on', 'version', 'times', 'weekday', 'remind_at',
    'by_school', 'worcester', 'shrewsbury'];
  v_app_fns text[] := array['finance_day', 'finance_day_both', 'finance_history', 'finance_payment_detail',
    'finance_home', 'finance_close_day', 'finance_undo_close', 'finance_reopen_day', 'finance_export',
    'finance_settings_get', 'finance_set_reminder_on', 'finance_set_reminder_time', 'finance_copy_monday',
    'finance_export_preview'];
  v_helper_fns text[] := array['finance_reminder_time_is_valid', 'finance_date_ok', 'finance_figures_from',
    'finance_items_json', 'finance_closing_changes_from', 'finance_append_only', 'finance_keep_rows',
    'finance_day_closings_guard', 'finance_chain_steps_core', 'finance_chain_items', 'finance_money_rows_core',
    'finance_money_rows', 'finance_figures',
    'finance_active_close', 'finance_closing_is_mine', 'finance_compare', 'finance_results',
    'finance_closing_changes', 'finance_home_at'];
  -- the only two helpers allowed to READ login ids (they never return one)
  v_login_readers text[] := array['finance_chain_steps_core', 'finance_closing_is_mine'];
  v_tables text[] := array['finance_day_closings', 'finance_day_closing_items', 'finance_settings',
                           'finance_reminder_times', 'finance_exports'];
begin
  -- ===================================================================
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- ===================================================================
  select s.role, s.full_name into v_role, v_an from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role, s.full_name into v_role, v_dn from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regclass('public.finance_day_closings') is null then
    raise exception 'TEST SETUP: public.finance_day_closings is missing (is 0011 applied?)';
  end if;
  if exists (select 1 from public.testing_payments p where p.paid_on between v_b - 60 and v_b + 1300)
     or exists (select 1 from public.star_payments p where p.paid_on between v_b - 60 and v_b + 1300) then
    raise exception 'TEST SETUP: there are payments dated around % already; this test needs those days empty', v_b;
  end if;

  perform set_config('request.jwt.claims', '', true);
  begin
    insert into auth.sessions (id, user_id)
    select x, v_admin from unnest(array[v_a1, v_a2, v_a3, v_a5, v_a6]) as x
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
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;
  v_c_d2 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text;
  v_c_d3 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d3, 'amr', v_amr_otp)::text;

  -- Color Belt: a test class + rank and two Worcester events (made by the
  -- admin through the app's own functions)
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_class(%L, %L, null, true)', 'worcester', v_tag || ' class'));
  v_cls := (v_r ->> 'id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_add_rank(%L, %L, 6500, 7500, 8500, false, %L, %L, null, 0, %L)', v_cls, 'Yellow', 'solid', 'yellow', 'yellow'));
  v_rank := (v_r ->> 'id')::uuid;
  v_ev := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' one', v_today + 5,
    jsonb_build_array(jsonb_build_object('class_id', v_cls, 'start_time', '17:00', 'end_time', '18:00'))::text)) ->> 'id')::uuid;
  v_ev2 := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' two', v_today + 5,
    jsonb_build_array(jsonb_build_object('class_id', v_cls, 'start_time', '17:00', 'end_time', '18:00'))::text)) ->> 'id')::uuid;
  if v_cls is null or v_rank is null or v_ev is null or v_ev2 is null then
    raise exception 'TEST SETUP: could not create the Color Belt test class / events';
  end if;
  select k.id into v_er from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ev and k.rank_id = v_rank;
  select k.id into v_er2 from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ev2 and k.rank_id = v_rank;

  -- 80 Color Belt students in event one (owners of the test payments)
  for v_i in 1 .. 80 loop
    insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
    values (v_ev, v_er, 'Fin', 'Cb ' || v_i, 'cash', true, 'staff') returning id into v_x;
    v_cb := v_cb || v_x;
  end loop;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_ev, v_er, 'Fin', 'Withdrawn', 'cash', true, 'staff') returning id into v_cb_wd;
  update public.testing_registrations
     set status = 'withdrawn', withdrawn_reason = 'withdrawn', withdrawn_at = now(), withdrawn_by_name = 'zz test'
   where id = v_cb_wd;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_ev, v_er, 'Fin', 'Today', 'cash', true, 'staff') returning id into v_cb_today;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_ev, v_er, 'Fin', 'Removed', 'cash', true, 'staff') returning id into v_cb_del;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_ev2, v_er2, 'Fin', 'Second A', 'cash', true, 'staff') returning id into v_cb_e2a;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_ev2, v_er2, 'Fin', 'Second B', 'cash', true, 'staff') returning id into v_cb_e2b;

  -- Star: two test events (copied from Rubrics and prices like the app
  -- does) and candidates with a date of birth and an email (F10 checks
  -- neither ever comes out)
  insert into public.star_events (name, testing_date, start_time, where_code, registration_open,
                                  public_code_worcester, public_code_shrewsbury, created_by_name, updated_by_name)
  values (v_tag || ' star one', v_today + 30, '10:00', 'worcester', false,
          public.testing_new_public_code(), public.testing_new_public_code(), '', '')
  returning id into v_sev;
  perform public.star_copy_template_into_event(v_sev);
  insert into public.star_events (name, testing_date, start_time, where_code, registration_open,
                                  public_code_worcester, public_code_shrewsbury, created_by_name, updated_by_name)
  values (v_tag || ' star two', v_today + 31, '10:00', 'shrewsbury', false,
          public.testing_new_public_code(), public.testing_new_public_code(), '', '')
  returning id into v_sev2;
  perform public.star_copy_template_into_event(v_sev2);

  for v_i in 1 .. 80 loop
    insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                        dan, stars_from, paying_by, source, created_by_name, updated_by_name)
    values (v_sev, 'Fin', 'St ' || v_i, date '1999-12-31', 'zz-finance-privacy@example.com', 'shrewsbury',
            1, 0, 'cash', 'desk', '', '')
    returning id into v_x;
    v_st := v_st || v_x;
  end loop;
  -- Worcester candidates, a private one, a withdrawn one, one to remove,
  -- one in event two, one that changes school
  insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                      dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin', 'St Worcester', date '1999-12-31', 'zz-finance-privacy@example.com', 'worcester', 1, 0, 'card', 'desk', '', '')
  returning id into v_st_w;
  insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                      dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin', 'St Worcester Two', date '1999-12-31', 'zz-finance-privacy@example.com', 'worcester', 1, 0, 'cash', 'desk', '', '')
  returning id into v_st_w2;
  insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                      dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin', 'St Worcester Three', date '1999-12-31', 'zz-finance-privacy@example.com', 'worcester', 1, 0, 'cash', 'desk', '', '')
  returning id into v_st_w3;
  insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                      dan, stars_from, paying_by, source, private_on, private_time, created_by_name, updated_by_name)
  values (v_sev, 'Fin', 'St Private', date '1999-12-31', 'zz-finance-privacy@example.com', 'shrewsbury', 1, 0, 'cash', 'desk',
          v_b + 175, '10:00', '', '')
  returning id into v_st_priv;
  insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                      dan, stars_from, paying_by, source, status, withdrawn_reason, withdrawn_at,
                                      withdrawn_by_name, created_by_name, updated_by_name)
  values (v_sev, 'Fin', 'St Withdrawn', date '1999-12-31', 'zz-finance-privacy@example.com', 'shrewsbury', 1, 0, 'cash', 'desk',
          'withdrawn', 'withdrawn', now(), 'zz test', '', '')
  returning id into v_st_wd;
  insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                      dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin', 'St Removed', date '1999-12-31', 'zz-finance-privacy@example.com', 'shrewsbury', 1, 0, 'cash', 'desk', '', '')
  returning id into v_st_del;
  insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                      dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev2, 'Fin', 'St Second', date '1999-12-31', 'zz-finance-privacy@example.com', 'shrewsbury', 1, 0, 'cash', 'desk', '', '')
  returning id into v_st_e2;
  insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                      dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin', 'St Mover', date '1999-12-31', 'zz-finance-privacy@example.com', 'shrewsbury', 1, 0, 'cash', 'desk', '', '')
  returning id into v_st_move;


  -- ===================================================================
  -- F2. The chain rules, on BOTH sources. Case k uses the days v_b + 10k
  -- (+1, +2 ...). Color Belt items are in Worcester (the event's school),
  -- Star items in Shrewsbury (the candidates' school). Owner of case k:
  -- v_cb[k] / v_st[k].
  -- ===================================================================
  for v_si in 1 .. 2 loop
    v_src := case v_si when 1 then 'color_belt' else 'star' end;
    v_sch := case v_si when 1 then 'worcester' else 'shrewsbury' end;

    -- case 1: a plain payment -> counted
    v_d := v_b + 10; v_o := case v_si when 1 then v_cb[1] else v_st[1] end;
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
    if v_si = 1 then v_case1_cb := v_p; end if;
    perform pg_temp.t_eq('F2 ' || v_src || ' case 1 plain', pg_temp.t_sig(v_sch, v_d), 'counted:7000:cash');
    select count(*) into v_n from public.finance_money_rows(v_sch, v_d, v_d) m
     where m.payment_id = v_p and m.time = '15:00' and m.recorded_by_name = v_dn and m.what = v_src
       and m.first_name = 'Fin' and m.kind = 'payment' and m.school = v_sch and m.is_private = false
       and m.changed_by_name is null and m.was_amount_cents is null;
    perform pg_temp.t_eq('F2 ' || v_src || ' case 1 fields', v_n::text, '1');

    -- case 2: undone by the SAME login within 10 seconds -> hidden (5 s
    -- and exactly 10 s); undone by the SQL Editor (no login) within 5 s ->
    -- NOT hidden (a missing login never counts as "the same person")
    v_d := v_b + 20; v_o := case v_si when 1 then v_cb[2] else v_st[2] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
    perform pg_temp.t_rev(v_src, v_p, v_d, v_t + interval '5 seconds', v_desk, v_dn);
    if v_si = 1 then v_case2_cb := v_p; end if;
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 6500, 'cash', v_d, v_t + interval '60 seconds', v_desk, v_dn);
    perform pg_temp.t_rev(v_src, v_p, v_d, v_t + interval '70 seconds', v_desk, v_dn);
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 5000, 'cash', v_d, v_t + interval '120 seconds', null, 'Database admin');
    perform pg_temp.t_rev(v_src, v_p, v_d, v_t + interval '125 seconds', null, 'Database admin');
    perform pg_temp.t_eq('F2 ' || v_src || ' case 2 hidden', pg_temp.t_sig(v_sch, v_d), 'undone:5000:cash');

    -- case 3: undone by ANOTHER login within 10 s -> undone
    v_d := v_b + 30; v_o := case v_si when 1 then v_cb[3] else v_st[3] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
    perform pg_temp.t_rev(v_src, v_p, v_d, v_t + interval '5 seconds', v_admin, v_an);
    perform pg_temp.t_eq('F2 ' || v_src || ' case 3 other login', pg_temp.t_sig(v_sch, v_d), 'undone:7000:cash');
    select m.changed_by_name || '|' || m.changed_on into v_txt from public.finance_money_rows(v_sch, v_d, v_d) m;
    perform pg_temp.t_eq('F2 ' || v_src || ' case 3 undone by', v_txt, v_an || '|' || v_d);

    -- case 4: undone by the same login after 11 s -> undone
    v_d := v_b + 40; v_o := case v_si when 1 then v_cb[4] else v_st[4] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
    perform pg_temp.t_rev(v_src, v_p, v_d, v_t + interval '11 seconds', v_desk, v_dn);
    perform pg_temp.t_eq('F2 ' || v_src || ' case 4 after 11 s', pg_temp.t_sig(v_sch, v_d), 'undone:7000:cash');

    -- case 5: edited once (same day; the reversal is dated 3 days later,
    -- the day the edit was made) -> edited, was 70.00 cash
    v_d := v_b + 50; v_o := case v_si when 1 then v_cb[5] else v_st[5] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
    v_p1 := pg_temp.t_edit(v_src, v_p, 6500, 'check', v_d, v_d + 3, v_t + interval '3 days', v_admin, v_an);
    perform pg_temp.t_eq('F2 ' || v_src || ' case 5 edited', pg_temp.t_sig(v_sch, v_d), 'edited:6500:check');
    perform pg_temp.t_eq('F2 ' || v_src || ' case 5 nothing on the edit day', pg_temp.t_sig(v_sch, v_d + 3), '');
    select m.was_amount_cents || '|' || m.was_method || '|' || m.changed_by_name || '|' || m.changed_on || '|'
           || (m.payment_id = v_p) || '|' || coalesce(m.moved_from::text, '-')
      into v_txt from public.finance_money_rows(v_sch, v_d, v_d) m;
    perform pg_temp.t_eq('F2 ' || v_src || ' case 5 fields', v_txt, '7000|cash|' || v_an || '|' || (v_d + 3) || '|true|-');

    -- case 6: edited twice -> one edited item, the last amount, was the first
    v_d := v_b + 60; v_o := case v_si when 1 then v_cb[6] else v_st[6] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
    v_p1 := pg_temp.t_edit(v_src, v_p, 6500, 'cash', v_d, v_d, v_t + interval '1 hour', v_admin, v_an);
    v_p2 := pg_temp.t_edit(v_src, v_p1, 6000, 'card', v_d, v_d, v_t + interval '2 hours', v_admin, v_an);
    perform pg_temp.t_eq('F2 ' || v_src || ' case 6 edited twice', pg_temp.t_sig(v_sch, v_d), 'edited:6000:card');
    select m.was_amount_cents || '|' || m.was_method || '|' || (m.payment_id = v_p) into v_txt
      from public.finance_money_rows(v_sch, v_d, v_d) m;
    perform pg_temp.t_eq('F2 ' || v_src || ' case 6 was', v_txt, '7000|cash|true');

    -- case 7: method-only edit
    v_d := v_b + 70; v_o := case v_si when 1 then v_cb[7] else v_st[7] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
    v_p1 := pg_temp.t_edit(v_src, v_p, 7000, 'check', v_d, v_d, v_t + interval '1 hour', v_admin, v_an);
    perform pg_temp.t_eq('F2 ' || v_src || ' case 7 method-only edit', pg_temp.t_sig(v_sch, v_d), 'edited:7000:check');

    -- case 8: edited to another date -> moved_out + moved_in
    v_d := v_b + 80; v_o := case v_si when 1 then v_cb[8] else v_st[8] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
    v_p1 := pg_temp.t_edit(v_src, v_p, 7000, 'cash', v_d + 2, v_d + 2, v_t + interval '2 days', v_admin, v_an);
    perform pg_temp.t_eq('F2 ' || v_src || ' case 8 old day', pg_temp.t_sig(v_sch, v_d), 'moved_out:7000:cash');
    perform pg_temp.t_eq('F2 ' || v_src || ' case 8 new day', pg_temp.t_sig(v_sch, v_d + 2), 'moved_in:7000:cash');
    select m.moved_to::text into v_txt from public.finance_money_rows(v_sch, v_d, v_d) m;
    perform pg_temp.t_eq('F2 ' || v_src || ' case 8 moved_to', v_txt, (v_d + 2)::text);
    select m.moved_from || '|' || m.was_amount_cents into v_txt from public.finance_money_rows(v_sch, v_d + 2, v_d + 2) m;
    perform pg_temp.t_eq('F2 ' || v_src || ' case 8 moved_from', v_txt, v_d || '|7000');

    -- case 9: edited across THREE dates -> both earlier days moved_out
    v_d := v_b + 90; v_o := case v_si when 1 then v_cb[9] else v_st[9] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
    v_p1 := pg_temp.t_edit(v_src, v_p, 6500, 'cash', v_d + 1, v_d + 1, v_t + interval '1 day', v_admin, v_an);
    v_p2 := pg_temp.t_edit(v_src, v_p1, 6000, 'cash', v_d + 2, v_d + 2, v_t + interval '2 days', v_admin, v_an);
    if v_si = 1 then v_case9 := v_p; v_case9_p1 := v_p1; end if;
    perform pg_temp.t_eq('F2 ' || v_src || ' case 9 first day', pg_temp.t_sig(v_sch, v_d), 'moved_out:7000:cash');
    perform pg_temp.t_eq('F2 ' || v_src || ' case 9 middle day', pg_temp.t_sig(v_sch, v_d + 1), 'moved_out:6500:cash');
    perform pg_temp.t_eq('F2 ' || v_src || ' case 9 last day', pg_temp.t_sig(v_sch, v_d + 2), 'moved_in:6000:cash');
    select string_agg(m.day || '>' || coalesce(m.moved_to::text, '-'), ',' order by m.day) into v_txt
      from public.finance_money_rows(v_sch, v_d, v_d + 2) m;
    perform pg_temp.t_eq('F2 ' || v_src || ' case 9 moved_to', v_txt,
      v_d || '>' || (v_d + 2) || ',' || (v_d + 1) || '>' || (v_d + 2) || ',' || (v_d + 2) || '>-');

    -- case 10: moved, then undone -> BOTH days show undone, nothing counts
    v_d := v_b + 100; v_o := case v_si when 1 then v_cb[10] else v_st[10] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
    v_p1 := pg_temp.t_edit(v_src, v_p, 7000, 'cash', v_d + 2, v_d + 2, v_t + interval '2 days', v_admin, v_an);
    perform pg_temp.t_rev(v_src, v_p1, v_d + 5, v_t + interval '5 days', v_admin, v_an);
    if v_si = 1 then v_case10 := v_p; end if;
    perform pg_temp.t_eq('F2 ' || v_src || ' case 10 first day', pg_temp.t_sig(v_sch, v_d), 'undone:7000:cash');
    perform pg_temp.t_eq('F2 ' || v_src || ' case 10 moved-to day', pg_temp.t_sig(v_sch, v_d + 2), 'undone:7000:cash');
    perform pg_temp.t_eq('F2 ' || v_src || ' case 10 undo day', pg_temp.t_sig(v_sch, v_d + 5), '');

    -- case 11: undo after an edit, same login within seconds -> undone (an
    -- edited chain is never a mis-click)
    v_d := v_b + 110; v_o := case v_si when 1 then v_cb[11] else v_st[11] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_admin, v_an);
    v_p1 := pg_temp.t_edit(v_src, v_p, 6500, 'cash', v_d, v_d, v_t + interval '2 seconds', v_admin, v_an);
    perform pg_temp.t_rev(v_src, v_p1, v_d, v_t + interval '4 seconds', v_admin, v_an);
    perform pg_temp.t_eq('F2 ' || v_src || ' case 11 undo after edit', pg_temp.t_sig(v_sch, v_d), 'undone:7000:cash');

    -- case 12: range building - paid on day d, undone 19 days later (the
    -- reversal is dated that later day) -> undone on day d even when only
    -- day d is asked for (F9 checks the d .. d+14 export too)
    v_d := v_b + 120; v_o := case v_si when 1 then v_cb[12] else v_st[12] end;
    v_t := pg_temp.t_at(v_d, '15:00');
    v_p := pg_temp.t_pay(v_src, v_o, 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
    perform pg_temp.t_rev(v_src, v_p, v_d + 19, v_t + interval '19 days', v_admin, v_an);
    perform pg_temp.t_eq('F2 ' || v_src || ' case 12 undone weeks later', pg_temp.t_sig(v_sch, v_d), 'undone:7000:cash');
    perform pg_temp.t_eq('F2 ' || v_src || ' case 12 nothing on the undo day', pg_temp.t_sig(v_sch, v_d + 19), '');
  end loop;

  -- case 14 (Star): a refund shows on its own date, negative, kind refund
  v_d := v_b + 140;
  v_t := pg_temp.t_at(v_d, '15:00');
  perform pg_temp.t_pay('star', v_st[14], 'payment', 14000, 'cash', v_d, v_t, v_desk, v_dn);
  perform pg_temp.t_pay('star', v_st[14], 'refund', -2000, 'cash', v_d + 1, v_t + interval '1 day', v_admin, v_an);
  perform pg_temp.t_eq('F2 star case 14 payment day', pg_temp.t_sig('shrewsbury', v_d), 'counted:14000:cash');
  perform pg_temp.t_eq('F2 star case 14 refund day', pg_temp.t_sig('shrewsbury', v_d + 1), 'counted:-2000:cash');
  select m.kind into v_txt from public.finance_money_rows('shrewsbury', v_d + 1, v_d + 1) m;
  perform pg_temp.t_eq('F2 star case 14 kind', v_txt, 'refund');

  -- case 15 (Star): undo of a refund -> the refund is undone
  v_d := v_b + 150;
  v_t := pg_temp.t_at(v_d, '15:00');
  perform pg_temp.t_pay('star', v_st[15], 'payment', 14000, 'cash', v_d, v_t, v_desk, v_dn);
  v_case15_ref := pg_temp.t_pay('star', v_st[15], 'refund', -2000, 'check', v_d + 1, v_t + interval '1 day', v_admin, v_an);
  perform pg_temp.t_rev('star', v_case15_ref, v_d + 3, v_t + interval '3 days', v_admin, v_an);
  perform pg_temp.t_eq('F2 star case 15 refund undone', pg_temp.t_sig('shrewsbury', v_d + 1), 'undone:-2000:check');

  -- case 16 (Star): the item's school is the CANDIDATE's school
  v_d := v_b + 160;
  perform pg_temp.t_pay('star', v_st_w, 'payment', 9000, 'card', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F2 star case 16 Worcester candidate', pg_temp.t_sig('worcester', v_d), 'counted:9000:card');
  perform pg_temp.t_eq('F2 star case 16 not in Shrewsbury', pg_temp.t_sig('shrewsbury', v_d), '');

  -- case 17 (Star): a private candidate's line (event_date = their private day)
  v_d := v_b + 170;
  perform pg_temp.t_pay('star', v_st_priv, 'payment', 20000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  select m.is_private || '|' || m.event_date || '|' || m.what into v_txt from public.finance_money_rows('shrewsbury', v_d, v_d) m;
  perform pg_temp.t_eq('F2 star case 17 private line', v_txt, 'true|' || (v_b + 175) || '|star');
  select m.is_private || '|' || m.event_date into v_txt from public.finance_money_rows('worcester', v_b + 10, v_b + 10) m;
  perform pg_temp.t_eq('F2 color belt line is never private', v_txt, 'false|' || (v_today + 5));


  -- ===================================================================
  -- F3. Totals and expected values by method (day T = v_b + 200,
  -- Worcester): cash 70 + 65 + 40 (withdrawn student - still counts),
  -- checks 80 + 75, card 90, an undone cash 50 (not counted), and two Star
  -- Worcester refunds: 10 cash, 5 check.
  -- ===================================================================
  v_d := v_b + 200;
  v_t := pg_temp.t_at(v_d, '14:00');
  perform pg_temp.t_pay('color_belt', v_cb[20], 'payment', 7000, 'cash', v_d, v_t, v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb[21], 'payment', 6500, 'cash', v_d, v_t + interval '1 minute', v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb_wd, 'payment', 4000, 'cash', v_d, v_t + interval '2 minutes', v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb[22], 'payment', 8000, 'check', v_d, v_t + interval '3 minutes', v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb[23], 'payment', 7500, 'check', v_d, v_t + interval '4 minutes', v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb[24], 'payment', 9000, 'card', v_d, v_t + interval '5 minutes', v_desk, v_dn);
  v_p := pg_temp.t_pay('color_belt', v_cb[25], 'payment', 5000, 'cash', v_d, v_t + interval '6 minutes', v_desk, v_dn);
  perform pg_temp.t_rev('color_belt', v_p, v_d, v_t + interval '30 minutes', v_admin, v_an);
  perform pg_temp.t_pay('star', v_st_w2, 'payment', 14000, 'cash', v_d - 1, v_t - interval '1 day', v_desk, v_dn);
  perform pg_temp.t_pay('star', v_st_w2, 'refund', -1000, 'cash', v_d, v_t + interval '7 minutes', v_admin, v_an);
  perform pg_temp.t_pay('star', v_st_w3, 'payment', 14000, 'check', v_d - 1, v_t - interval '1 day', v_desk, v_dn);
  perform pg_temp.t_pay('star', v_st_w3, 'refund', -500, 'check', v_d, v_t + interval '8 minutes', v_admin, v_an);

  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F3 totals', (v_r -> 'totals')::text,
    jsonb_build_object('count', 6, 'total_cents', 40500, 'in_cents', 42000, 'net_cents', 40500,
                       'cash', jsonb_build_object('count', 3, 'cents', 17500),
                       'check', jsonb_build_object('count', 2, 'cents', 15500),
                       'card', jsonb_build_object('count', 1, 'cents', 9000))::text);
  perform pg_temp.t_eq('F3 refunds', (v_r -> 'refunds')::text,
    jsonb_build_object('count', 2, 'cents', -1500, 'cash_cents', -1000, 'check_cents', -500)::text);
  perform pg_temp.t_eq('F3 items (9: 8 counted + 1 undone)', jsonb_array_length(v_r -> 'items')::text, '9');
  perform pg_temp.t_eq('F3 can_close', (v_r ->> 'can_close'), 'true');
  perform pg_temp.t_eq('F3 not closed', (v_r -> 'closing')::text, 'null');
  select f.exp_cash_cents || '|' || f.check_count || '|' || f.check_cents || '|' || f.card_cents || '|' || f.item_count
    into v_txt from public.finance_figures('worcester', v_d, v_d) f;
  perform pg_temp.t_eq('F3 expected cash 165 (175 in - 10 refunded), checks 2 / 155 (refund not in the drawer), card 90',
    v_txt, '16500|2|15500|9000|8');
  -- items come in time order; the school isn't repeated per item
  perform pg_temp.t_eq('F3 first item', v_r #>> '{items,0,amount_cents}', '7000');
  perform pg_temp.t_eq('F3 no school key in items', (v_r #> '{items,0}' ? 'school')::text, 'false');
  perform pg_temp.t_eq('F3 no row id in items', (v_r #> '{items,0}' ? 'row_id')::text, 'false');


  -- ===================================================================
  -- F4. Close the day
  -- ===================================================================
  -- F4a. matches on day T (admin), the snapshot, double click
  v_fp := v_r ->> 'fingerprint';
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_close_day(%L, %L, %L, 16500, 2, 15500, 9000, null)',
    'worcester', v_d, v_fp));
  perform pg_temp.t_eq('F4a close matches', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('F4a results', (v_r -> 'results')::text,
    jsonb_build_object('cash', jsonb_build_object('result', 'matches', 'diff_cents', 0),
                       'checks', jsonb_build_object('result', 'matches', 'diff_cents', 0, 'count_result', 'matches', 'count_diff', 0),
                       'card', jsonb_build_object('result', 'matches', 'diff_cents', 0))::text);
  v_close := (v_r ->> 'closing_id')::uuid;
  select c.kind || '|' || c.expected_count || '|' || c.expected_cash_cents || '|' || c.expected_checks || '|'
         || c.expected_checks_cents || '|' || c.expected_card_cents || '|' || c.recorded_by_name || '|' || (c.recorded_by = v_admin)
    into v_txt from public.finance_day_closings c where c.id = v_close;
  perform pg_temp.t_eq('F4a expected snapshot stored', v_txt, 'close|8|16500|2|15500|9000|' || v_an || '|true');
  select count(*), coalesce(sum(i.amount_cents), 0) into v_n, v_n2 from public.finance_day_closing_items i where i.closing_id = v_close;
  perform pg_temp.t_eq('F4a closing items stored (8 items, 405.00)', v_n || '|' || v_n2, '8|40500');
  perform pg_temp.t_eq('F4a closing logged', (select count(*)::text from public.change_log l
    where l.table_name = 'finance_day_closings' and l.record_id = v_close and l.action = 'finance_close_day'), '1');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_close_day(%L, %L, %L, 16500, 2, 15500, 9000, null)',
    'worcester', v_d, v_fp));
  perform pg_temp.t_eq('F4a double click', v_r ->> 'status', 'already_closed');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F4a closed day', (v_r #>> '{closing,id}') || '|' || (v_r #>> '{closing,changed_after}') || '|'
    || (v_r #>> '{closing,changed_count}') || '|' || (v_r ->> 'can_close') || '|' || (v_r #>> '{closing,by_name}'),
    v_close || '|false|0|false|' || v_an);
  perform pg_temp.t_eq('F4a the closer can undo for 10 s', ((v_r ->> 'can_undo_until')::timestamptz > now())::text, 'true');
  perform pg_temp.t_eq('F4a nothing added after closing', (select count(*)::text from jsonb_array_elements(v_r -> 'items') e
    where (e ->> 'added_after_closing')::boolean), '0');

  -- F4b. the guard trigger and append-only (as the SQL Editor's role)
  begin
    insert into public.finance_day_closings (location_code, day, kind, reverses_closing_id, recorded_by_name)
    values ('worcester', v_d + 1, 'undo', v_close, 'zz');
    raise exception 'TEST FAILED: F4b an undo for another DAY was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.finance_day_closings (location_code, day, kind, reverses_closing_id, recorded_by_name)
    values ('shrewsbury', v_d, 'reopen', v_close, 'zz');
    raise exception 'TEST FAILED: F4b a reopen for another SCHOOL was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.finance_day_closings (location_code, day, kind, cash_counted_cents, checks_counted, checks_counted_cents,
      card_counted_cents, expected_count, expected_cash_cents, expected_checks, expected_checks_cents, expected_card_cents, recorded_by_name)
    values ('worcester', v_d, 'close', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'zz');
    raise exception 'TEST FAILED: F4b a second open close was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.finance_day_closings (location_code, day, kind, reverses_closing_id, cash_counted_cents, recorded_by_name)
    values ('worcester', v_d, 'undo', v_close, 5, 'zz');
    raise exception 'TEST FAILED: F4b an undo with a count was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.finance_day_closings (location_code, day, kind, cash_counted_cents, checks_counted, checks_counted_cents,
      card_counted_cents, expected_count, expected_cash_cents, expected_checks, expected_checks_cents, expected_card_cents, recorded_by_name)
    values ('shrewsbury', v_today + 1, 'close', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'zz');
    raise exception 'TEST FAILED: F4b a close for tomorrow was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.finance_day_closings set note = 'x' where id = v_close;
    raise exception 'TEST FAILED: F4b a closing row could be changed';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    delete from public.finance_day_closings where id = v_close;
    raise exception 'TEST FAILED: F4b a closing row could be removed';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    delete from public.finance_day_closing_items where closing_id = v_close;
    raise exception 'TEST FAILED: F4b a closing item could be removed';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    update public.finance_day_closing_items set amount_cents = 1 where closing_id = v_close;
    raise exception 'TEST FAILED: F4b a closing item could be changed';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    truncate public.finance_day_closings cascade;
    raise exception 'TEST FAILED: F4b finance_day_closings could be truncated';
  exception when raise_exception then
    if sqlerrm not like '%truncated%' then raise; end if;
  end;
  begin
    delete from public.finance_settings;
    raise exception 'TEST FAILED: F4b the settings row could be removed';
  exception when raise_exception then
    if sqlerrm not like '%can''t be removed%' then raise; end if;
  end;

  -- F4c. short: 69.90 counted for 70.00 -> note_required, then ok with a note
  v_d := v_b + 210;
  perform pg_temp.t_pay('color_belt', v_cb[26], 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  v_r := pg_temp.t_close(v_c_a1, 'worcester', v_d, -10, null);
  perform pg_temp.t_eq('F4c short without a note', v_r ->> 'status', 'note_required');
  perform pg_temp.t_eq('F4c short result', (v_r #> '{results,cash}')::text,
    jsonb_build_object('result', 'short', 'diff_cents', 10)::text);
  v_r := pg_temp.t_close(v_c_a1, 'worcester', v_d, -10, '  Ten cents missing  ');
  perform pg_temp.t_eq('F4c short with a note', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('F4c note tidied', (select c.note from public.finance_day_closings c where c.id = (v_r ->> 'closing_id')::uuid),
    'Ten cents missing');

  -- F4d. over: card 90.01 counted for 90.00
  v_d := v_b + 211;
  perform pg_temp.t_pay('color_belt', v_cb[27], 'payment', 9000, 'card', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_close_day(%L, %L, %L, 0, 0, 0, 9001, %L)',
    'worcester', v_d, v_r ->> 'fingerprint', 'One cent over'));
  perform pg_temp.t_eq('F4d over', (v_r ->> 'status') || '|' || (v_r #>> '{results,card,result}') || '|' || (v_r #>> '{results,card,diff_cents}'),
    'ok|over|1');

  -- F4e. the number of checks: right total, one check too many -> over
  v_d := v_b + 212;
  perform pg_temp.t_pay('color_belt', v_cb[28], 'payment', 8000, 'check', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_close_day(%L, %L, %L, 0, 2, 8000, 0, null)',
    'worcester', v_d, v_r ->> 'fingerprint'));
  perform pg_temp.t_eq('F4e checks count', (v_r ->> 'status') || '|' || (v_r #> '{results,checks}')::text,
    'note_required|' || jsonb_build_object('result', 'over', 'diff_cents', 0, 'count_result', 'over', 'count_diff', 1)::text);

  -- F4f. nothing_to_close: a day with only an undone payment (case 3), an
  -- empty day
  v_r := pg_temp.t_close(v_c_a1, 'worcester', v_b + 30, 0, null);
  perform pg_temp.t_eq('F4f only undone payments', v_r ->> 'status', 'nothing_to_close');
  v_r := pg_temp.t_close(v_c_a1, 'worcester', v_b + 213, 0, null);
  perform pg_temp.t_eq('F4f empty day', v_r ->> 'status', 'nothing_to_close');

  -- F4g. stale: a payment added between loading and closing ...
  v_d := v_b + 214;
  perform pg_temp.t_pay('color_belt', v_cb[29], 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_pay('color_belt', v_cb[30], 'payment', 6500, 'cash', v_d, pg_temp.t_at(v_d, '16:00'), v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_close_day(%L, %L, %L, 7000, 0, 0, 0, null)',
    'worcester', v_d, v_r ->> 'fingerprint'));
  perform pg_temp.t_eq('F4g stale after a new payment', v_r ->> 'status', 'stale');
  -- ... and a METHOD-ONLY edit (same total!)
  v_d := v_b + 215;
  v_p := pg_temp.t_pay('color_belt', v_cb[31], 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_edit('color_belt', v_p, 7000, 'check', v_d, v_d, pg_temp.t_at(v_d, '16:00'), v_admin, v_an);
  v_r2 := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_close_day(%L, %L, %L, 0, 1, 7000, 0, null)',
    'worcester', v_d, v_r ->> 'fingerprint'));
  perform pg_temp.t_eq('F4g stale after a method-only edit', v_r2 ->> 'status', 'stale');
  v_r := pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null);
  perform pg_temp.t_eq('F4g closes with the new figures', v_r ->> 'status', 'ok');

  -- F4h. a refund-only day: expected cash -20.00 -> "taken out" sent as a
  -- negative count; a negative count on a normal day -> invalid
  v_d := v_b + 216;
  perform pg_temp.t_pay('star', v_st[30], 'payment', 14000, 'cash', v_b + 219, pg_temp.t_at(v_b + 219, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('star', v_st[30], 'refund', -2000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_admin, v_an);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('F4h refund-only day can be closed', (v_r ->> 'can_close') || '|' || (v_r #>> '{totals,count}')
    || '|' || (v_r #>> '{totals,total_cents}'), 'true|0|-2000');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_close_day(%L, %L, %L, -2000, 0, 0, 0, null)',
    'shrewsbury', v_d, v_r ->> 'fingerprint'));
  perform pg_temp.t_eq('F4h negative cash on a refund-only day', (v_r ->> 'status') || '|' || (v_r #>> '{results,cash,result}'), 'ok|matches');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_b + 219));
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_close_day(%L, %L, %L, -1, 0, 0, 0, %L)',
    'shrewsbury', v_b + 219, v_r ->> 'fingerprint', 'x'));
  perform pg_temp.t_eq('F4h negative cash on a normal day', v_r ->> 'status', 'invalid');

  -- F4i. input rules
  v_d := v_b + 219;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  v_fp := v_r ->> 'fingerprint';
  v_list := array[
    format('public.finance_close_day(%L, %L, %L, 14000, 501, 0, 0, null)', 'shrewsbury', v_d, v_fp),
    format('public.finance_close_day(%L, %L, %L, 14000, 0, -1, 0, null)', 'shrewsbury', v_d, v_fp),
    format('public.finance_close_day(%L, %L, %L, 14000, 0, 0, 10000001, null)', 'shrewsbury', v_d, v_fp),
    format('public.finance_close_day(%L, %L, %L, 14000, 0, 0, 0, %L)', 'shrewsbury', v_d, v_fp, repeat('x', 501)),
    format('public.finance_close_day(%L, %L, null, 14000, 0, 0, 0, null)', 'shrewsbury', v_d),
    format('public.finance_close_day(%L, %L, %L, null, 0, 0, 0, null)', 'shrewsbury', v_d, v_fp),
    format('public.finance_close_day(%L, %L, %L, 14000, 0, 0, 0, null)', 'shrewsbury', v_today + 1, v_fp),
    format('public.finance_day(%L, %L)', 'worcester', v_today + 1),
    format('public.finance_day(null, %L)', v_d),
    format('public.finance_day_both(%L)', v_today + 1)];
  foreach v_call in array v_list loop
    perform pg_temp.t_eq('F4i invalid: ' || left(v_call, 60), pg_temp.t_call('authenticated', v_c_a1, v_call) ->> 'status', 'invalid');
  end loop;
  perform pg_temp.t_eq('F4i unknown school (day)', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_day(%L, %L)', 'boston', v_d)) ->> 'status', 'not_found');
  perform pg_temp.t_eq('F4i unknown school (close)', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_close_day(%L, %L, %L, 0, 0, 0, 0, null)', 'boston', v_d, v_fp)) ->> 'status', 'not_found');
  perform pg_temp.t_eq('F4i a note of exactly 500 is fine', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_close_day(%L, %L, %L, 14000, 0, 0, 0, %L)', 'shrewsbury', v_d, v_fp, repeat('x', 500))) ->> 'status', 'ok');

  -- F4j. the desk closes TODAY (Worcester): staff may only use today.
  -- A test payment today first; if the real day is already closed, the
  -- admin reopens it (rolled back at the end).
  v_today_pay := pg_temp.t_pay('color_belt', v_cb_today, 'payment', 7500, 'cash', v_today, now() - interval '1 hour', v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  if v_r -> 'closing' <> 'null'::jsonb then
    v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_reopen_day(%L, %L, %L)', 'worcester', v_today,
      v_r #>> '{closing,id}'));
    perform pg_temp.t_eq('F4j reopen the real today first', v_r ->> 'status', 'ok');
  end if;
  v_r := pg_temp.t_close(v_c_d1, 'worcester', v_today, 0, 'zz test');
  perform pg_temp.t_eq('F4j the desk closes today', v_r ->> 'status', 'ok');
  v_close := (v_r ->> 'closing_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('F4j the desk sees its own Undo', (v_r ->> 'can_undo_until' is not null)::text, 'true');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('F4j the admin gets no Undo for the desk''s close', coalesce(v_r ->> 'can_undo_until', 'null'), 'null');
  perform pg_temp.t_eq('F4j the desk can''t close another day', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_close_day(%L, %L, %L, 0, 0, 0, 0, null)', 'worcester', v_today - 1, 'x')) ->> 'status', 'not_allowed');


  -- ===================================================================
  -- F5. Undo close and Reopen
  -- ===================================================================
  -- the admin can't use the desk's 10 seconds; the desk can
  perform pg_temp.t_eq('F5 another login -> too_late', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_undo_close(%L)', v_close)) ->> 'status', 'too_late');
  perform pg_temp.t_eq('F5 the closer within 10 s', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_undo_close(%L)', v_close)) ->> 'status', 'ok');
  perform pg_temp.t_eq('F5 undo twice -> stale', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_undo_close(%L)', v_close)) ->> 'status', 'stale');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('F5 open again after the undo', (v_r -> 'closing')::text || '|' || (v_r ->> 'can_close'), 'null|true');
  perform pg_temp.t_eq('F5 undo row written', (select c.kind from public.finance_day_closings c where c.reverses_closing_id = v_close), 'undo');
  v_r := pg_temp.t_close(v_c_d1, 'worcester', v_today, 0, null);
  perform pg_temp.t_eq('F5 the desk closes again', v_r ->> 'status', 'ok');
  v_close := (v_r ->> 'closing_id')::uuid;
  -- reopen: admins only, the close the screen saw
  perform pg_temp.t_eq('F5 the desk can''t reopen', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_reopen_day(%L, %L, %L)', 'worcester', v_today, v_close)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('F5 reopen with an old close id', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_reopen_day(%L, %L, %L)', 'worcester', v_today, gen_random_uuid())) ->> 'status', 'stale');
  perform pg_temp.t_eq('F5 reopen', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_reopen_day(%L, %L, %L)', 'worcester', v_today, v_close)) ->> 'status', 'ok');
  perform pg_temp.t_eq('F5 reopen again -> not_closed', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_reopen_day(%L, %L, %L)', 'worcester', v_today, v_close)) ->> 'status', 'not_closed');
  perform pg_temp.t_eq('F5 the desk closes after the reopen', (pg_temp.t_close(v_c_d1, 'worcester', v_today, 0, null)) ->> 'status', 'ok');
  -- 11 seconds after the close -> too_late even for the closer
  v_d := v_b + 230;
  perform pg_temp.t_pay('color_belt', v_cb[32], 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  insert into public.finance_day_closings (location_code, day, kind, cash_counted_cents, checks_counted, checks_counted_cents,
    card_counted_cents, expected_count, expected_cash_cents, expected_checks, expected_checks_cents, expected_card_cents,
    recorded_at, recorded_by, recorded_by_name)
  values ('worcester', v_d, 'close', 7000, 0, 0, 0, 1, 7000, 0, 0, 0, now() - interval '11 seconds', v_admin, v_an)
  returning id into v_close2;
  perform pg_temp.t_eq('F5 the closer after 11 s', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_undo_close(%L)', v_close2)) ->> 'status', 'too_late');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F5 no Undo offered after 10 s', coalesce(v_r ->> 'can_undo_until', 'null'), 'null');
  perform pg_temp.t_eq('F5 reopen it', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_reopen_day(%L, %L, %L)', 'worcester', v_d, v_close2)) ->> 'status', 'ok');
  select c.id into v_id from public.finance_day_closings c where c.reverses_closing_id = v_close2;
  perform pg_temp.t_eq('F5 undo of a reopen row', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_undo_close(%L)', v_id)) ->> 'status', 'invalid');
  perform pg_temp.t_eq('F5 undo of an unknown id', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_undo_close(%L)', gen_random_uuid())) ->> 'status', 'not_found');
  perform pg_temp.t_eq('F5 close again after the reopen', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');


  -- ===================================================================
  -- F6. Changed after closing (each cause on its own day)
  -- ===================================================================
  -- a. a later payment (Worcester, v_b + 240): changed 1, Added after closing
  v_d := v_b + 240;
  perform pg_temp.t_pay('color_belt', v_cb[40], 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F6a close', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');
  perform pg_temp.t_pay('color_belt', v_cb[41], 'payment', 6500, 'cash', v_d, now() + interval '1 minute', v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F6a later payment', (v_r #>> '{closing,changed_after}') || '|' || (v_r #>> '{closing,changed_count}'), 'true|1');
  select string_agg((e ->> 'amount_cents') || ':' || (e ->> 'added_after_closing'), ',' order by e ->> 'amount_cents') into v_txt
    from jsonb_array_elements(v_r -> 'items') e;
  perform pg_temp.t_eq('F6a Added after closing only on the new one', v_txt, '6500:true,7000:false');

  -- b. an undo made on a later day
  v_d := v_b + 241;
  v_p := pg_temp.t_pay('color_belt', v_cb[42], 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F6b close', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');
  perform pg_temp.t_rev('color_belt', v_p, v_d + 5, now() + interval '1 minute', v_admin, v_an);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F6b later undo', (v_r #>> '{closing,changed_after}') || '|' || (v_r #>> '{closing,changed_count}'), 'true|1');

  -- c. an edit (amount)
  v_d := v_b + 242;
  v_p := pg_temp.t_pay('color_belt', v_cb[43], 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F6c close', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');
  perform pg_temp.t_edit('color_belt', v_p, 6000, 'cash', v_d, v_d + 4, now() + interval '1 minute', v_admin, v_an);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F6c edit', (v_r #>> '{closing,changed_after}') || '|' || (v_r #>> '{closing,changed_count}'), 'true|1');

  -- d1. a deleted Color Belt student
  v_d := v_b + 243;
  perform pg_temp.t_pay('color_belt', v_cb_del, 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb[44], 'payment', 6500, 'cash', v_d, pg_temp.t_at(v_d, '15:05'), v_desk, v_dn);
  perform pg_temp.t_eq('F6d1 close', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');
  perform set_config('tkd.action', 'delete_student', true);
  delete from public.testing_registrations where id = v_cb_del;
  perform set_config('tkd.action', '', true);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F6d1 deleted student', (v_r #>> '{closing,changed_after}') || '|' || (v_r #>> '{closing,changed_count}'), 'true|1');

  -- d2. a deleted Color Belt event (two of its students paid)
  v_d := v_b + 244;
  perform pg_temp.t_pay('color_belt', v_cb_e2a, 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb_e2b, 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:01'), v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb[45], 'payment', 6500, 'cash', v_d, pg_temp.t_at(v_d, '15:02'), v_desk, v_dn);
  perform pg_temp.t_eq('F6d2 close', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');
  perform set_config('tkd.action', 'delete_event', true);
  delete from public.testing_events where id = v_ev2;
  perform set_config('tkd.action', '', true);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F6d2 deleted event', (v_r #>> '{closing,changed_after}') || '|' || (v_r #>> '{closing,changed_count}'), 'true|2');

  -- e1. a deleted Star candidate
  v_d := v_b + 245;
  perform pg_temp.t_pay('star', v_st_del, 'payment', 14000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('star', v_st[45], 'payment', 14000, 'card', v_d, pg_temp.t_at(v_d, '15:05'), v_desk, v_dn);
  perform pg_temp.t_eq('F6e1 close', (pg_temp.t_close(v_c_a1, 'shrewsbury', v_d, 0, null)) ->> 'status', 'ok');
  perform set_config('tkd.action', 'star_delete_candidate', true);
  delete from public.star_candidates where id = v_st_del;
  perform set_config('tkd.action', '', true);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('F6e1 deleted Star candidate', (v_r #>> '{closing,changed_after}') || '|' || (v_r #>> '{closing,changed_count}'), 'true|1');

  -- e2. a deleted Star event
  v_d := v_b + 246;
  perform pg_temp.t_pay('star', v_st_e2, 'payment', 14000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('star', v_st[46], 'payment', 14000, 'card', v_d, pg_temp.t_at(v_d, '15:05'), v_desk, v_dn);
  perform pg_temp.t_eq('F6e2 close', (pg_temp.t_close(v_c_a1, 'shrewsbury', v_d, 0, null)) ->> 'status', 'ok');
  perform set_config('tkd.action', 'star_delete_event', true);
  delete from public.star_events where id = v_sev2;
  perform set_config('tkd.action', '', true);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('F6e2 deleted Star event', (v_r #>> '{closing,changed_after}') || '|' || (v_r #>> '{closing,changed_count}'), 'true|1');

  -- f. a Star candidate's school changed (their payment moves schools)
  v_d := v_b + 247;
  perform pg_temp.t_pay('star', v_st_move, 'payment', 14000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('star', v_st[47], 'payment', 14000, 'card', v_d, pg_temp.t_at(v_d, '15:05'), v_desk, v_dn);
  perform pg_temp.t_eq('F6f close', (pg_temp.t_close(v_c_a1, 'shrewsbury', v_d, 0, null)) ->> 'status', 'ok');
  update public.star_candidates set location_code = 'worcester' where id = v_st_move;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('F6f school changed', (v_r #>> '{closing,changed_after}') || '|' || (v_r #>> '{closing,changed_count}'), 'true|1');
  perform pg_temp.t_eq('F6f the payment is now in Worcester', pg_temp.t_sig('worcester', v_d), 'counted:14000:cash');

  -- g. a late mis-click undo: the desk's payment 5 s before the close,
  -- undone by the desk 3 s after it (8 s after recording) -> hidden ->
  -- gone from the closed day
  v_d := v_b + 248;
  v_p := pg_temp.t_pay('color_belt', v_cb[48], 'payment', 7000, 'cash', v_d, now() - interval '5 seconds', v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb[49], 'payment', 6500, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F6g close', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');
  perform pg_temp.t_rev('color_belt', v_p, v_d, now() + interval '3 seconds', v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F6g late mis-click undo', (v_r #>> '{closing,changed_after}') || '|' || (v_r #>> '{closing,changed_count}')
    || '|' || jsonb_array_length(v_r -> 'items'), 'true|1|1');

  -- h. a payment moved IN after closing: changed, but not "added after
  -- closing" (its chain began before the close)
  v_d := v_b + 249;
  v_p := pg_temp.t_pay('color_belt', v_cb[50], 'payment', 7000, 'cash', v_d + 1, pg_temp.t_at(v_d + 1, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb[51], 'payment', 6500, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F6h close', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');
  perform pg_temp.t_edit('color_belt', v_p, 7000, 'cash', v_d, v_d + 3, now() + interval '1 minute', v_admin, v_an);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F6h moved in', (v_r #>> '{closing,changed_count}') || '|' || (select string_agg((e ->> 'state') || ':'
    || (e ->> 'added_after_closing'), ',' order by e ->> 'state') from jsonb_array_elements(v_r -> 'items') e),
    '1|counted:false,moved_in:false');


  -- ===================================================================
  -- F7. Settings and the Home reminder (day R = v_b + 1000)
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_a1, 'public.finance_settings_get()');
  perform pg_temp.t_eq('F7 settings: 14 times', jsonb_array_length(v_r -> 'times')::text, '14');
  perform pg_temp.t_eq('F7 settings: first time is Worcester Monday', (v_r #>> '{times,0,school}') || '|' || (v_r #>> '{times,0,weekday}'),
    'worcester|1');
  v_v := (v_r ->> 'version')::integer;
  -- reminder On
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_set_reminder_on(true, %s)', v_v));
  if (v_r ->> 'reminder_on') is not null then raise exception 'TEST FAILED: F7 unexpected key'; end if;
  if (select st.reminder_on from public.finance_settings st) then
    perform pg_temp.t_eq('F7 switch on (it was already on)', v_r ->> 'status', 'ok');
  else
    perform pg_temp.t_eq('F7 switch on', (v_r ->> 'status') || '|' || (v_r ->> 'version'), 'ok|' || (v_v + 1));
  end if;
  v_v := (v_r ->> 'version')::integer;
  perform pg_temp.t_eq('F7 old version -> stale', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_set_reminder_on(false, %s)', v_v - 1)) ->> 'status', 'stale');
  -- Copy Monday: Worcester Monday 18:00, Shrewsbury Monday Off
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_set_reminder_time(%L, 1::smallint, %L, %s)', 'worcester', '18:00', v_v));
  perform pg_temp.t_eq('F7 set Monday', v_r ->> 'status', 'ok');
  v_v := (v_r ->> 'version')::integer;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_set_reminder_time(%L, 1::smallint, null, %s)', 'shrewsbury', v_v));
  v_v := (v_r ->> 'version')::integer;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_copy_monday(%s)', v_v));
  perform pg_temp.t_eq('F7 copy Monday', v_r ->> 'status', 'ok');
  v_v := (v_r ->> 'version')::integer;
  v_r := pg_temp.t_call('authenticated', v_c_a1, 'public.finance_settings_get()');
  select string_agg(coalesce(e ->> 'remind_at', 'off'), ',' order by (e ->> 'weekday')::integer) into v_txt
    from jsonb_array_elements(v_r -> 'times') e where e ->> 'school' = 'worcester' and (e ->> 'weekday')::integer between 1 and 5;
  perform pg_temp.t_eq('F7 Worcester Mon-Fri after the copy', v_txt, '18:00,18:00,18:00,18:00,18:00');
  select string_agg(coalesce(e ->> 'remind_at', 'off'), ',' order by (e ->> 'weekday')::integer) into v_txt
    from jsonb_array_elements(v_r -> 'times') e where e ->> 'school' = 'shrewsbury' and (e ->> 'weekday')::integer between 1 and 5;
  perform pg_temp.t_eq('F7 Shrewsbury Mon-Fri after the copy', v_txt, 'off,off,off,off,off');
  perform pg_temp.t_eq('F7 copy again changes nothing', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_copy_monday(%s)', v_v)) ->> 'version', v_v::text);
  -- time rules
  foreach v_txt in array array['19:31', '10:45', '23:15', '19:30:30'] loop
    perform pg_temp.t_eq('F7 invalid time ' || v_txt, pg_temp.t_call('authenticated', v_c_a1,
      format('public.finance_set_reminder_time(%L, 2::smallint, %L, %s)', 'worcester', v_txt, v_v)) ->> 'status', 'invalid');
  end loop;
  perform pg_temp.t_eq('F7 weekday 8', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_set_reminder_time(%L, 8::smallint, null, %s)', 'worcester', v_v)) ->> 'status', 'invalid');
  perform pg_temp.t_eq('F7 unknown school', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_set_reminder_time(%L, 2::smallint, null, %s)', 'boston', v_v)) ->> 'status', 'not_found');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_set_reminder_time(%L, 2::smallint, %L, %s)', 'worcester', '23:00', v_v));
  perform pg_temp.t_eq('F7 23:00 is allowed', v_r ->> 'status', 'ok');
  v_v := (v_r ->> 'version')::integer;
  perform pg_temp.t_eq('F7 settings changes logged', (select (count(*) > 0)::text from public.change_log l
    where l.table_name = 'finance_reminder_times' and l.action = 'finance_set_reminder_time'), 'true');

  -- R's weekday: Worcester 7:30 PM, Shrewsbury Off
  v_d := v_b + 1000;
  v_w := extract(isodow from v_d)::integer;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_set_reminder_time(%L, %s::smallint, %L, %s)', 'worcester', v_w, '19:30', v_v));
  v_v := (v_r ->> 'version')::integer;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_set_reminder_time(%L, %s::smallint, null, %s)', 'shrewsbury', v_w, v_v));
  v_v := (v_r ->> 'version')::integer;
  perform pg_temp.t_pay('color_belt', v_cb[60], 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('star', v_st[60], 'payment', 14000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F7 7:29:59 PM', (public.finance_home_at(pg_temp.t_at(v_d, '19:29:59'), false) -> 'today')::text, '[]');
  perform pg_temp.t_eq('F7 7:30:00 PM', (public.finance_home_at(pg_temp.t_at(v_d, '19:30:00'), false) -> 'today')::text, '["worcester"]');
  perform pg_temp.t_eq('F7 staff get no earlier days', (public.finance_home_at(pg_temp.t_at(v_d, '19:30:00'), false) -> 'earlier')::text, 'null');
  perform pg_temp.t_eq('F7 a week later, no payments', (public.finance_home_at(pg_temp.t_at(v_d + 7, '20:00'), false) -> 'today')::text, '[]');
  perform pg_temp.t_eq('F7 next day (another weekday time)', (public.finance_home_at(pg_temp.t_at(v_d + 1, '20:00'), false) -> 'today')::text, '[]');
  -- admins: earlier unclosed days in the 30 days before (both schools)
  perform pg_temp.t_eq('F7 earlier: 2 unclosed school days', (public.finance_home_at(pg_temp.t_at(v_d + 5, '20:00'), true) -> 'earlier')::text,
    jsonb_build_object('count', 2, 'first_day', v_d, 'by_school', jsonb_build_object(
      'worcester', jsonb_build_object('count', 1, 'first_day', v_d),
      'shrewsbury', jsonb_build_object('count', 1, 'first_day', v_d)))::text);
  perform pg_temp.t_eq('F7 earlier: nothing 40 days later', (public.finance_home_at(pg_temp.t_at(v_d + 40, '20:00'), true) -> 'earlier')::text,
    jsonb_build_object('count', 0, 'first_day', null, 'by_school', '{}'::jsonb)::text);
  -- switch off -> no reminder
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_set_reminder_on(false, %s)', v_v));
  v_v := (v_r ->> 'version')::integer;
  perform pg_temp.t_eq('F7 switched off', (public.finance_home_at(pg_temp.t_at(v_d, '21:00'), false) -> 'today')::text, '[]');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_set_reminder_on(true, %s)', v_v));
  v_v := (v_r ->> 'version')::integer;
  -- closed -> no reminder; the earlier count drops to 1
  perform pg_temp.t_eq('F7 close Worcester R', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');
  perform pg_temp.t_eq('F7 closed', (public.finance_home_at(pg_temp.t_at(v_d, '21:00'), false) -> 'today')::text, '[]');
  perform pg_temp.t_eq('F7 earlier after the close', (public.finance_home_at(pg_temp.t_at(v_d + 5, '20:00'), true) -> 'earlier')::text,
    jsonb_build_object('count', 1, 'first_day', v_d, 'by_school', jsonb_build_object(
      'shrewsbury', jsonb_build_object('count', 1, 'first_day', v_d)))::text);
  -- the real function
  v_r := pg_temp.t_call('authenticated', v_c_d1, 'public.finance_home()');
  perform pg_temp.t_eq('F7 finance_home as the desk', (v_r ->> 'status') || '|' || (v_r -> 'earlier')::text
    || '|' || jsonb_typeof(v_r -> 'today'), 'ok|null|array');
  v_r := pg_temp.t_call('authenticated', v_c_a1, 'public.finance_home()');
  perform pg_temp.t_eq('F7 finance_home as an admin', (v_r ->> 'status') || '|' || jsonb_typeof(v_r -> 'earlier'), 'ok|object');


  -- ===================================================================
  -- F8. History (the month of v_b + 1200)
  -- ===================================================================
  v_hm := date_trunc('month', v_b + 1200)::date;
  v_last := (v_hm + interval '1 month')::date - 1;
  -- day 1: closed, matches
  perform pg_temp.t_pay('color_belt', v_cb[61], 'payment', 7000, 'cash', v_hm, pg_temp.t_at(v_hm, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F8 close day 1', (pg_temp.t_close(v_c_a1, 'worcester', v_hm, 0, null)) ->> 'status', 'ok');
  -- day 2: closed short by 1.00 (cash)
  perform pg_temp.t_pay('color_belt', v_cb[62], 'payment', 7000, 'cash', v_hm + 1, pg_temp.t_at(v_hm + 1, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F8 close day 2', (pg_temp.t_close(v_c_a1, 'worcester', v_hm + 1, -100, 'short')) ->> 'status', 'ok');
  -- day 3: closed over by 0.50 (card)
  perform pg_temp.t_pay('color_belt', v_cb[63], 'payment', 9000, 'card', v_hm + 2, pg_temp.t_at(v_hm + 2, '15:00'), v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_hm + 2));
  perform pg_temp.t_eq('F8 close day 3', pg_temp.t_call('authenticated', v_c_a1, format('public.finance_close_day(%L, %L, %L, 0, 0, 0, 9050, %L)',
    'worcester', v_hm + 2, v_r ->> 'fingerprint', 'over')) ->> 'status', 'ok');
  -- day 4: payments, not closed (Worcester and Shrewsbury)
  perform pg_temp.t_pay('color_belt', v_cb[64], 'payment', 7000, 'cash', v_hm + 3, pg_temp.t_at(v_hm + 3, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('star', v_st[64], 'payment', 14000, 'cash', v_hm + 3, pg_temp.t_at(v_hm + 3, '15:00'), v_desk, v_dn);
  -- day 5: closed, then a later payment
  perform pg_temp.t_pay('color_belt', v_cb[65], 'payment', 7000, 'cash', v_hm + 4, pg_temp.t_at(v_hm + 4, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F8 close day 5', (pg_temp.t_close(v_c_a1, 'worcester', v_hm + 4, 0, null)) ->> 'status', 'ok');
  perform pg_temp.t_pay('color_belt', v_cb[66], 'payment', 6500, 'cash', v_hm + 4, now() + interval '1 minute', v_desk, v_dn);
  -- day 6: closed SHORT, then a later payment -> changed wins
  perform pg_temp.t_pay('color_belt', v_cb[67], 'payment', 7000, 'cash', v_hm + 5, pg_temp.t_at(v_hm + 5, '15:00'), v_desk, v_dn);
  perform pg_temp.t_eq('F8 close day 6', (pg_temp.t_close(v_c_a1, 'worcester', v_hm + 5, -100, 'short')) ->> 'status', 'ok');
  perform pg_temp.t_pay('color_belt', v_cb[68], 'payment', 6500, 'cash', v_hm + 5, now() + interval '1 minute', v_desk, v_dn);
  -- the last day: a payment, not closed; the days just outside the month
  perform pg_temp.t_pay('color_belt', v_cb[69], 'payment', 7000, 'cash', v_last, pg_temp.t_at(v_last, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb[70], 'payment', 7000, 'cash', v_hm - 1, pg_temp.t_at(v_hm - 1, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_cb[71], 'payment', 7000, 'cash', v_last + 1, pg_temp.t_at(v_last + 1, '15:00'), v_desk, v_dn);

  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_history(%L, %L)', 'worcester', v_hm + 10));
  perform pg_temp.t_eq('F8 month', (v_r ->> 'status') || '|' || (v_r ->> 'month'), 'ok|' || v_hm);
  perform pg_temp.t_eq('F8 one row per day', jsonb_array_length(v_r -> 'days')::text, ((v_last - v_hm) + 1)::text);
  perform pg_temp.t_eq('F8 newest first', (v_r #>> '{days,0,day}'), v_last::text);
  perform pg_temp.t_eq('F8 unclosed_count', v_r ->> 'unclosed_count', '2');
  select string_agg((e ->> 'day') || '=' || (e ->> 'tag') || coalesce(':' || (e ->> 'diff_part') || ':' || (e ->> 'diff_cents'), ''),
                    ',' order by e ->> 'day')
    into v_txt from jsonb_array_elements(v_r -> 'days') e where (e ->> 'day')::date between v_hm and v_hm + 6 or (e ->> 'day')::date = v_last;
  perform pg_temp.t_eq('F8 tags', v_txt,
    v_hm || '=closed,' || (v_hm + 1) || '=short:cash:100,' || (v_hm + 2) || '=over:card:50,' || (v_hm + 3) || '=not_closed,'
    || (v_hm + 4) || '=changed_after_closing,' || (v_hm + 5) || '=changed_after_closing,' || (v_hm + 6) || '=no_payments,'
    || v_last || '=not_closed');
  select (e ->> 'total_cents') || '|' || (e ->> 'count') || '|' || (e ->> 'closed_by_name') into v_txt
    from jsonb_array_elements(v_r -> 'days') e where (e ->> 'day')::date = v_hm + 4;
  perform pg_temp.t_eq('F8 day 5 totals now + closed by', v_txt, '13500|2|' || v_an);
  -- Both: two rows per day (Worcester first), Shrewsbury's unclosed day too
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_history(null, %L)', v_hm));
  perform pg_temp.t_eq('F8 Both rows', jsonb_array_length(v_r -> 'days')::text, (2 * ((v_last - v_hm) + 1))::text);
  perform pg_temp.t_eq('F8 Both order', (v_r #>> '{days,0,school}') || '|' || (v_r #>> '{days,1,school}'), 'worcester|shrewsbury');
  perform pg_temp.t_eq('F8 Both unclosed', v_r ->> 'unclosed_count', '3');
  -- this month: up to today only; today's row first
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_history(null, %L)', v_today));
  perform pg_temp.t_eq('F8 this month', jsonb_array_length(v_r -> 'days') || '|' || (v_r #>> '{days,0,day}'),
    (2 * extract(day from v_today)::integer) || '|' || v_today);
  perform pg_temp.t_eq('F8 next month', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_history(null, %L)', (date_trunc('month', v_today) + interval '1 month')::date)) ->> 'status', 'invalid');
  perform pg_temp.t_eq('F8 unknown school', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_history(%L, %L)', 'boston', v_hm)) ->> 'status', 'not_found');
  -- Both summary of one day
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day_both(%L)', v_hm + 3));
  perform pg_temp.t_eq('F8 day_both', (v_r -> 'schools')::text || '|' || (v_r ->> 'total_cents') || '|' || (v_r ->> 'count'),
    jsonb_build_array(
      jsonb_build_object('code', 'worcester', 'name', 'Worcester', 'count', 1, 'total_cents', 7000, 'cash_cents', 7000,
                         'check_cents', 0, 'card_cents', 0, 'closed', false),
      jsonb_build_object('code', 'shrewsbury', 'name', 'Shrewsbury', 'count', 1, 'total_cents', 14000, 'cash_cents', 14000,
                         'check_cents', 0, 'card_cents', 0, 'closed', false))::text || '|21000|2');


  -- ===================================================================
  -- F9. Export
  -- ===================================================================
  select count(*) into v_n from public.finance_exports;
  -- the rows of an export = the reports of those days (Color Belt cases)
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_export(%L, %L, %L)', 'worcester', v_b + 10, v_b + 139));
  perform pg_temp.t_eq('F9 export ok', (v_r ->> 'status') || '|' || (v_r ->> 'school') || '|' || (v_r ->> 'from') || '|' || (v_r ->> 'to'),
    'ok|worcester|' || (v_b + 10) || '|' || (v_b + 139));
  v_txt := '';
  for v_d in select generate_series(v_b + 10, v_b + 139, interval '1 day')::date loop
    v_r2 := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
    select v_txt || coalesce(string_agg(v_d || ':' || (e ->> 'state') || ':' || (e ->> 'amount_cents') || ':' || (e ->> 'method')
                                        || ':' || (e ->> 'time'), ',' order by e::text), '')
      into v_txt from jsonb_array_elements(v_r2 -> 'items') e;
  end loop;
  select coalesce(string_agg((e ->> 'day') || ':' || (e ->> 'state') || ':' || (e ->> 'amount_cents') || ':' || (e ->> 'method')
                             || ':' || (e ->> 'time'), ',' order by e ->> 'day'), '')
    into v_owner_name from jsonb_array_elements(v_r -> 'rows') e;
  -- compare as sorted lists
  perform pg_temp.t_eq('F9 export rows = the Daily reports',
    (select string_agg(x, ',' order by x) from unnest(string_to_array(v_owner_name, ',')) as x),
    (select string_agg(x, ',' order by x) from unnest(string_to_array(regexp_replace(v_txt, '([0-9])([0-9]{4}-)', '\1,\2', 'g'), ',')) as x
      where x <> ''));
  select sum((e ->> 'counted_cents')::integer) into v_n2 from jsonb_array_elements(v_r -> 'rows') e;
  select sum(f.total_cents) into v_i from public.finance_figures('worcester', v_b + 10, v_b + 139) f;
  perform pg_temp.t_eq('F9 counted_cents adds up to the day totals', v_n2::text, v_i::text);
  select e ->> 'note' into v_txt from jsonb_array_elements(v_r -> 'rows') e where (e ->> 'day')::date = v_b + 50;
  perform pg_temp.t_eq('F9 note for an edit', v_txt, 'was $70.00 cash');
  select e ->> 'note' into v_txt from jsonb_array_elements(v_r -> 'rows') e where (e ->> 'day')::date = v_b + 80;
  perform pg_temp.t_eq('F9 note for moved out', v_txt, 'moved to ' || (v_b + 82));
  -- case 12: the Oct 1 payment undone on Oct 20, exported Oct 1 - 15
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_export(%L, %L, %L)', 'worcester', v_b + 120, v_b + 134));
  perform pg_temp.t_eq('F9 undone weeks later, in a shorter export', (v_r -> 'rows')::text, jsonb_build_array(jsonb_build_object(
    'day', v_b + 120, 'school', 'worcester', 'time', '15:00', 'first_name', 'Fin', 'last_name', 'Cb 12', 'what', 'color_belt',
    'event_date', v_today + 5, 'kind', 'payment', 'method', 'cash', 'amount_cents', 7000, 'counted_cents', 0,
    'recorded_by_name', v_dn, 'state', 'undone', 'note', 'undone by ' || v_an || ' on ' || (v_b + 139)))::text);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_export(%L, %L, %L)', 'shrewsbury', v_b + 120, v_b + 134));
  perform pg_temp.t_eq('F9 the same for Star', (v_r #>> '{rows,0,state}') || '|' || jsonb_array_length(v_r -> 'rows'), 'undone|1');
  perform pg_temp.t_eq('F9 three log rows so far', (select (count(*) - v_n)::text from public.finance_exports), '3');
  -- range rules (no log row for a refused call)
  v_list := array[
    format('public.finance_export(%L, %L, %L)', 'worcester', v_b + 20, v_b + 10),
    format('public.finance_export(%L, %L, %L)', 'worcester', v_today, v_today + 1),
    format('public.finance_export(%L, %L, %L)', 'worcester', v_today - 366, v_today),
    format('public.finance_export(null, %L, %L)', v_today, v_today),
    format('public.finance_export(%L, null, %L)', 'worcester', v_today)];
  foreach v_call in array v_list loop
    perform pg_temp.t_eq('F9 invalid: ' || left(v_call, 70), pg_temp.t_call('authenticated', v_c_a1, v_call) ->> 'status', 'invalid');
  end loop;
  perform pg_temp.t_eq('F9 366 days is the most', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_export(%L, %L, %L)', 'worcester', v_today - 365, v_today)) ->> 'status', 'ok');
  perform pg_temp.t_eq('F9 unknown school', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_export(%L, %L, %L)', 'boston', v_today, v_today)) ->> 'status', 'not_found');
  perform pg_temp.t_eq('F9 staff refused', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_export(%L, %L, %L)', 'worcester', v_today, v_today)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('F9 one log row per allowed call', (select (count(*) - v_n)::text from public.finance_exports), '4');
  select e.row_count || '|' || e.downloaded_by_name || '|' || (e.downloaded_by = v_admin) into v_txt
    from public.finance_exports e where e.from_day = v_b + 120 and e.location_code = 'worcester';
  perform pg_temp.t_eq('F9 the log row', v_txt, '1|' || v_an || '|true');
  perform pg_temp.t_eq('F9 logged in the history', (select count(*)::text from public.change_log l
    where l.table_name = 'finance_exports' and l.action = 'finance_export' and l.op = 'insert'), '4');


  -- ===================================================================
  -- Payment detail (D12)
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'color_belt', v_case9));
  perform pg_temp.t_eq('detail: three-date chain', (v_r ->> 'status') || '|' || (v_r #>> '{item,state}') || '|' || (v_r #>> '{item,day}')
    || '|' || (v_r #>> '{item,school}') || '|' || (v_r ->> 'event_name') || '|' || (v_r ->> 'event_id'),
    'ok|moved_in|' || (v_b + 92) || '|worcester|' || v_tag || ' one|' || v_ev);
  select string_agg((e ->> 'what') || ':' || (e ->> 'amount_cents'), ',') into v_txt from jsonb_array_elements(v_r -> 'history') e;
  perform pg_temp.t_eq('detail: history newest first', v_txt, 'edited:6000,edited:6500,recorded:7000');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'color_belt', v_case10));
  select string_agg((e ->> 'what') || ':' || (e ->> 'amount_cents') || ':' || (e ->> 'paid_on'), ',') into v_txt
    from jsonb_array_elements(v_r -> 'history') e;
  perform pg_temp.t_eq('detail: moved then undone', (v_r #>> '{item,state}') || '|' || (v_r #>> '{item,day}') || '|' || v_txt,
    'undone|' || (v_b + 100) || '|undone:7000:' || (v_b + 105) || ',edited:7000:' || (v_b + 102) || ',recorded:7000:' || (v_b + 100));
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'star', v_case15_ref));
  select string_agg(e ->> 'what', ',') into v_txt from jsonb_array_elements(v_r -> 'history') e;
  perform pg_temp.t_eq('detail: an undone refund', (v_r #>> '{item,kind}') || '|' || v_txt, 'refund|undone,refunded');
  perform pg_temp.t_eq('detail: not a first row', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_payment_detail(%L, %L)', 'color_belt', v_case9_p1)) ->> 'status', 'not_found');
  perform pg_temp.t_eq('detail: a hidden mis-click', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_payment_detail(%L, %L)', 'color_belt', v_case2_cb)) ->> 'status', 'not_found');
  perform pg_temp.t_eq('detail: wrong source', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_payment_detail(%L, %L)', 'star', v_case9)) ->> 'status', 'not_found');
  perform pg_temp.t_eq('detail: bad source', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_payment_detail(%L, %L)', 'cash', v_case9)) ->> 'status', 'invalid');
  perform pg_temp.t_eq('detail: staff, an old payment', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_payment_detail(%L, %L)', 'color_belt', v_case9)) ->> 'status', 'not_allowed');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_payment_detail(%L, %L)', 'color_belt', v_today_pay));
  perform pg_temp.t_eq('detail: staff, today''s payment', (v_r ->> 'status') || '|' || (v_r #>> '{item,day}'), 'ok|' || v_today);


  -- ===================================================================
  -- F1. Role gates
  -- ===================================================================
  v_calls := array[
    format('public.finance_day(%L, %L)', 'worcester', v_today),
    format('public.finance_day_both(%L)', v_today),
    format('public.finance_history(null, %L)', v_today),
    format('public.finance_payment_detail(%L, %L)', 'color_belt', v_today_pay),
    'public.finance_home()',
    format('public.finance_close_day(%L, %L, %L, 0, 0, 0, 0, null)', 'worcester', v_today, 'x'),
    format('public.finance_undo_close(%L)', v_close),
    format('public.finance_reopen_day(%L, %L, %L)', 'worcester', v_today, v_close),
    format('public.finance_export(%L, %L, %L)', 'worcester', v_today, v_today),
    'public.finance_settings_get()',
    'public.finance_set_reminder_on(true, 1)',
    format('public.finance_set_reminder_time(%L, 1::smallint, null, 1)', 'worcester'),
    'public.finance_copy_monday(1)',
    format('public.finance_export_preview(%L, %L, %L)', 'worcester', v_today, v_today)];
  -- every session without data access gets no_access, from all 14
  v_list := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d2, v_c_d3,
                  jsonb_build_object('role', 'authenticated')::text, ''];
  for v_i in 1 .. cardinality(v_list) loop
    foreach v_call in array v_calls loop
      v_r := pg_temp.t_call('authenticated', v_list[v_i], v_call);
      if v_r ->> 'status' is distinct from 'no_access' then
        raise exception 'TEST FAILED: F1 session % (of A2..A6, D2, D3, no login, signed out) got % from %', v_i, v_r, v_call;
      end if;
    end loop;
  end loop;
  -- anon can't even call them
  foreach v_call in array v_calls loop
    begin
      perform pg_temp.t_call('anon', v_c_anon, v_call);
      raise exception 'TEST FAILED: F1 anon could call %', v_call;
    exception when insufficient_privilege then null;
    end;
  end loop;
  -- staff: other days and the admin-only functions are refused
  v_list := array[
    format('public.finance_day(%L, %L)', 'worcester', v_today - 1),
    format('public.finance_day_both(%L)', v_today - 1),
    format('public.finance_history(null, %L)', v_today),
    format('public.finance_reopen_day(%L, %L, %L)', 'worcester', v_today, v_close),
    format('public.finance_close_day(%L, %L, %L, 0, 0, 0, 0, null)', 'worcester', v_today - 1, 'x'),
    format('public.finance_export(%L, %L, %L)', 'worcester', v_today, v_today),
    format('public.finance_export_preview(%L, %L, %L)', 'worcester', v_today, v_today),
    format('public.finance_payment_detail(%L, %L)', 'color_belt', v_case9),
    'public.finance_settings_get()',
    'public.finance_set_reminder_on(true, 1)',
    format('public.finance_set_reminder_time(%L, 1::smallint, null, 1)', 'worcester'),
    'public.finance_copy_monday(1)'];
  foreach v_call in array v_list loop
    perform pg_temp.t_eq('F1 staff refused: ' || v_call, pg_temp.t_call('authenticated', v_c_d1, v_call) ->> 'status', 'not_allowed');
  end loop;
  perform pg_temp.t_eq('F1 staff, today', pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today)) ->> 'status', 'ok');
  perform pg_temp.t_eq('F1 staff, Both today', pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day_both(%L)', v_today)) ->> 'status', 'ok');
  perform pg_temp.t_eq('F1 admin, an old day', pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_b)) ->> 'status', 'ok');


  -- ===================================================================
  -- F12. Impossible dates -> invalid (admin; NULL, infinity, -infinity,
  -- a day before 2020-01-01), in every function that takes a date
  -- ===================================================================
  foreach v_txt in array array['infinity', '-infinity', '2019-12-31'] loop
    v_list := array[
      format('public.finance_day(%L, %L)', 'worcester', v_txt),
      format('public.finance_day_both(%L)', v_txt),
      format('public.finance_history(null, %L)', v_txt),
      format('public.finance_close_day(%L, %L, %L, 0, 0, 0, 0, null)', 'worcester', v_txt, 'x'),
      format('public.finance_reopen_day(%L, %L, %L)', 'worcester', v_txt, gen_random_uuid()),
      format('public.finance_export(%L, %L, %L)', 'worcester', v_txt, v_today),
      format('public.finance_export(%L, %L, %L)', 'worcester', v_b, v_txt),
      format('public.finance_export_preview(%L, %L, %L)', 'worcester', v_txt, v_today),
      format('public.finance_export_preview(%L, %L, %L)', 'worcester', v_b, v_txt)];
    foreach v_call in array v_list loop
      perform pg_temp.t_eq('F12 ' || v_call, pg_temp.t_call('authenticated', v_c_a1, v_call) ->> 'status', 'invalid');
    end loop;
  end loop;
  v_list := array[
    format('public.finance_day(%L, null)', 'worcester'),
    'public.finance_day_both(null)',
    'public.finance_history(null, null)',
    format('public.finance_close_day(%L, null, %L, 0, 0, 0, 0, null)', 'worcester', 'x'),
    format('public.finance_reopen_day(%L, null, %L)', 'worcester', gen_random_uuid()),
    format('public.finance_export(%L, null, null)', 'worcester'),
    format('public.finance_export_preview(%L, %L, null)', 'worcester', v_b)];
  foreach v_call in array v_list loop
    perform pg_temp.t_eq('F12 ' || v_call, pg_temp.t_call('authenticated', v_c_a1, v_call) ->> 'status', 'invalid');
  end loop;
  perform pg_temp.t_eq('F12 2020-01-01 is accepted', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_day(%L, %L)', 'worcester', date '2020-01-01')) ->> 'status', 'ok');
  perform pg_temp.t_eq('F12 export from 2020-01-01 (within 366 days)', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_export_preview(%L, %L, %L)', 'worcester', date '2020-01-01', date '2020-12-31')) ->> 'status', 'ok');


  -- ===================================================================
  -- F13. The REAL payment writers (0005 / 0006) as the admin, then the
  -- Daily report of TODAY (only this test's students are looked at)
  -- ===================================================================
  -- Color Belt: testing_edit_payment on the desk's payment of an hour ago
  v_p := pg_temp.t_pay('color_belt', v_cb[75], 'payment', 7000, 'cash', v_today, now() - interval '1 hour', v_desk, v_dn);
  v_fp := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_today)) ->> 'fingerprint';
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6500, %L)', v_p, 'check', v_today));
  perform pg_temp.t_eq('F13 testing_edit_payment', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('F13 the edit changes the fingerprint', (v_r ->> 'fingerprint' <> v_fp)::text, 'true');
  select string_agg((e ->> 'state') || ':' || (e ->> 'amount_cents') || ':' || (e ->> 'method') || ':' || (e ->> 'was_amount_cents')
                    || ':' || (e ->> 'was_method') || ':' || (e ->> 'payment_id') || ':' || (e ->> 'changed_by_name'), ',')
    into v_txt from jsonb_array_elements(v_r -> 'items') e where e ->> 'last_name' = 'Cb 75';
  perform pg_temp.t_eq('F13 edited by testing_edit_payment', v_txt, 'edited:6500:check:7000:cash:' || v_p || ':' || v_an);
  -- Color Belt: testing_undo_payment (admin) on the desk's older payment
  v_p := pg_temp.t_pay('color_belt', v_cb[76], 'payment', 7000, 'cash', v_today, now() - interval '1 hour', v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_p));
  perform pg_temp.t_eq('F13 testing_undo_payment', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  select string_agg((e ->> 'state') || ':' || (e ->> 'amount_cents') || ':' || (e ->> 'changed_by_name'), ',')
    into v_txt from jsonb_array_elements(v_r -> 'items') e where e ->> 'last_name' = 'Cb 76';
  perform pg_temp.t_eq('F13 undone by testing_undo_payment', v_txt, 'undone:7000:' || v_an);
  -- Color Belt: testing_mark_paid then the same admin's Undo straight
  -- away = a mis-click -> not shown at all
  select r.version into v_v from public.testing_registrations r where r.id = v_cb[77];
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_mark_paid(%L, %s)', v_cb[77], v_v));
  perform pg_temp.t_eq('F13 testing_mark_paid', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_r ->> 'payment_id'));
  perform pg_temp.t_eq('F13 testing_undo_payment (own, at once)', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('F13 mark paid + own undo at once is hidden', (select count(*)::text from jsonb_array_elements(v_r -> 'items') e
    where e ->> 'last_name' = 'Cb 77'), '0');

  -- Star (Shrewsbury): star_record_payment, then star_edit_payment
  select c.version into v_v from public.star_candidates c where c.id = v_st[75];
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.star_record_payment(%L, %s, %L, 14000, %L)', v_st[75], v_v, 'cash', v_today));
  perform pg_temp.t_eq('F13 star_record_payment', v_r ->> 'status', 'ok');
  v_p := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  v_fp := v_r ->> 'fingerprint';
  select string_agg((e ->> 'state') || ':' || (e ->> 'amount_cents') || ':' || (e ->> 'method'), ',')
    into v_txt from jsonb_array_elements(v_r -> 'items') e where e ->> 'last_name' = 'St 75';
  perform pg_temp.t_eq('F13 recorded by star_record_payment', v_txt, 'counted:14000:cash');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.star_edit_payment(%L, %L, 13000, %L)', v_p, 'card', v_today));
  perform pg_temp.t_eq('F13 star_edit_payment', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  perform pg_temp.t_eq('F13 the Star edit changes the fingerprint', (v_r ->> 'fingerprint' <> v_fp)::text, 'true');
  select string_agg((e ->> 'state') || ':' || (e ->> 'amount_cents') || ':' || (e ->> 'method') || ':' || (e ->> 'was_amount_cents')
                    || ':' || (e ->> 'payment_id'), ',')
    into v_txt from jsonb_array_elements(v_r -> 'items') e where e ->> 'last_name' = 'St 75';
  perform pg_temp.t_eq('F13 edited by star_edit_payment', v_txt, 'edited:13000:card:14000:' || v_p);
  -- Star: star_undo_payment (admin) on the desk's older payment
  v_p := pg_temp.t_pay('star', v_st[76], 'payment', 14000, 'cash', v_today, now() - interval '1 hour', v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.star_undo_payment(%L)', v_p));
  perform pg_temp.t_eq('F13 star_undo_payment', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  select string_agg((e ->> 'state') || ':' || (e ->> 'amount_cents'), ',')
    into v_txt from jsonb_array_elements(v_r -> 'items') e where e ->> 'last_name' = 'St 76';
  perform pg_temp.t_eq('F13 undone by star_undo_payment', v_txt, 'undone:14000');
  -- Star: pay $20 more than the fee, star_record_refund the $20, then the
  -- same admin's Undo of the refund at once (a mis-click -> hidden)
  select c.version into v_v from public.star_candidates c where c.id = v_st[77];
  v_n := public.star_expected_fee_cents(v_st[77]);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.star_record_payment(%L, %s, %L, %s, %L)', v_st[77], v_v, 'cash',
    v_n + 2000, v_today));
  perform pg_temp.t_eq('F13 star_record_payment (overpaid)', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.star_record_refund(%L, %s, %L, 2000, %L)', v_st[77],
    (v_r ->> 'version')::integer, 'cash', v_today));
  perform pg_temp.t_eq('F13 star_record_refund', v_r ->> 'status', 'ok');
  v_p := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  select string_agg((e ->> 'kind') || ':' || (e ->> 'state') || ':' || (e ->> 'amount_cents') || ':' || (e ->> 'method'), ','
                    order by e ->> 'kind')
    into v_txt from jsonb_array_elements(v_r -> 'items') e where e ->> 'last_name' = 'St 77';
  perform pg_temp.t_eq('F13 refund by star_record_refund', v_txt, 'payment:counted:' || (v_n + 2000) || ':cash,refund:counted:-2000:cash');
  v_fp := v_r ->> 'fingerprint';
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.star_undo_payment(%L)', v_p));
  perform pg_temp.t_eq('F13 star_undo_payment of the refund', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  select string_agg((e ->> 'kind') || ':' || (e ->> 'state'), ',') into v_txt
    from jsonb_array_elements(v_r -> 'items') e where e ->> 'last_name' = 'St 77';
  perform pg_temp.t_eq('F13 the refund undone at once is hidden', v_txt || '|' || (v_r ->> 'fingerprint' <> v_fp)::text, 'payment:counted|true');


  -- ===================================================================
  -- F14. finance_export_preview: the same count and total as the export,
  -- and no log row
  -- ===================================================================
  select count(*) into v_n from public.finance_exports;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_export_preview(%L, %L, %L)', 'worcester', v_b + 10, v_b + 139));
  v_r2 := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_export(%L, %L, %L)', 'worcester', v_b + 10, v_b + 139));
  perform pg_temp.t_eq('F14 preview = export', v_r::text, jsonb_build_object('status', 'ok',
    'count', (select count(*) from jsonb_array_elements(v_r2 -> 'rows') e
               where e ->> 'kind' = 'payment' and (e ->> 'counted_cents')::integer <> 0),
    'total_cents', (select coalesce(sum((e ->> 'counted_cents')::integer), 0) from jsonb_array_elements(v_r2 -> 'rows') e))::text);
  perform pg_temp.t_eq('F14 only the export wrote a log row', (select (count(*) - v_n)::text from public.finance_exports), '1');
  v_list := array[
    format('public.finance_export_preview(%L, %L, %L)', 'worcester', v_b + 20, v_b + 10),
    format('public.finance_export_preview(%L, %L, %L)', 'worcester', v_today, v_today + 1),
    format('public.finance_export_preview(%L, %L, %L)', 'worcester', v_today - 366, v_today),
    format('public.finance_export_preview(null, %L, %L)', v_today, v_today)];
  foreach v_call in array v_list loop
    perform pg_temp.t_eq('F14 invalid: ' || v_call, pg_temp.t_call('authenticated', v_c_a1, v_call) ->> 'status', 'invalid');
  end loop;
  perform pg_temp.t_eq('F14 unknown school', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_export_preview(%L, %L, %L)', 'boston', v_today, v_today)) ->> 'status', 'not_found');


  -- ===================================================================
  -- F10. Privacy
  -- ===================================================================
  -- a. the seeded date of birth and email of paid Star candidates (active
  --    and withdrawn) never appear in any answer
  perform pg_temp.t_pay('star', v_st_wd, 'payment', 14000, 'cash', v_b + 300, pg_temp.t_at(v_b + 300, '15:00'), v_desk, v_dn);
  perform pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_b + 300));
  perform pg_temp.t_call('authenticated', v_c_a1, format('public.finance_export(%L, %L, %L)', 'shrewsbury', v_b, v_b + 365));
  perform pg_temp.t_call('authenticated', v_c_a1, format('public.finance_history(null, %L)', v_b + 300));
  select count(*) into v_n from t_answers;
  if v_n < 150 then
    raise exception 'TEST FAILED: F10 expected many collected answers, got %', v_n;
  end if;
  if exists (select 1 from t_answers a where a.r::text like '%1999-12-31%' or a.r::text like '%zz-finance-privacy%') then
    raise exception 'TEST FAILED: F10a a date of birth or an email appeared in an answer';
  end if;
  if not exists (select 1 from t_answers a where a.r::text like '%St Withdrawn%') then
    raise exception 'TEST FAILED: F10a the withdrawn candidate''s payment should be in an answer (to prove the check looks there)';
  end if;
  -- b. no finance_ function body mentions those columns; login ids only
  --    in the two listed helpers, which nobody can call and which return
  --    no login id
  for v_fn in
    select p.oid, p.proname, p.prosrc, p.proacl, p.prosecdef, coalesce(p.proargnames, '{}') as argnames, p.proowner
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'finance\_%'
  loop
    if v_fn.prosrc ~* '(date_of_birth|email_for_results|signature)' then
      raise exception 'TEST FAILED: F10b % mentions a date of birth / email / signature column', v_fn.proname;
    end if;
    if v_fn.prosrc ~* '\m(recorded_by|downloaded_by|withdrawn_by|created_by|updated_by)\M'
       and not (v_fn.proname = any (v_login_readers)) then
      raise exception 'TEST FAILED: F10b % mentions a login-id column', v_fn.proname;
    end if;
    if v_fn.proname = any (v_login_readers) then
      if v_fn.prosecdef
         or has_function_privilege('authenticated', v_fn.oid, 'execute')
         or exists (select 1 from unnest(v_fn.argnames) as a where a ~ '\m(recorded_by|downloaded_by)\M') then
        raise exception 'TEST FAILED: F10b % must be internal and return no login id', v_fn.proname;
      end if;
    end if;
  end loop;
  -- c. every key of every answer is on the allowed list
  select string_agg(distinct k, ', ') into v_txt
    from t_answers a, lateral pg_temp.t_keys(a.r) as k
   where a.fn like 'public.finance\_%' and not (k = any (v_allowed_keys));
  if v_txt is not null then
    raise exception 'TEST FAILED: F10c keys not on the allowed list: %', v_txt;
  end if;


  -- ===================================================================
  -- F11. Catalog
  -- ===================================================================
  for v_txt in select unnest(v_tables) loop
    if not exists (select 1 from pg_class c where c.oid = format('public.%I', v_txt)::regclass
                    and c.relrowsecurity
                    and c.relowner = (select t.relowner from pg_class t where t.oid = 'public.testing_payments'::regclass)) then
      raise exception 'TEST FAILED: F11 % must have RLS on and the same owner as testing_payments', v_txt;
    end if;
    if exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                where c.oid = format('public.%I', v_txt)::regclass and a.grantee <> c.relowner) then
      raise exception 'TEST FAILED: F11 % must have no rights for anyone but its owner', v_txt;
    end if;
    if exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = v_txt) then
      raise exception 'TEST FAILED: F11 % must have no read rules (nobody reads it directly)', v_txt;
    end if;
    if not exists (select 1 from pg_trigger t where t.tgrelid = format('public.%I', v_txt)::regclass and t.tgname = v_txt || '_log')
       or not exists (select 1 from pg_trigger t where t.tgrelid = format('public.%I', v_txt)::regclass and t.tgname = v_txt || '_no_truncate') then
      raise exception 'TEST FAILED: F11 % must have its history and no-truncate triggers', v_txt;
    end if;
  end loop;
  for v_txt in select unnest(array['finance_day_closings', 'finance_day_closing_items', 'finance_exports']) loop
    if not exists (select 1 from pg_trigger t where t.tgrelid = format('public.%I', v_txt)::regclass and t.tgname = v_txt || '_append_only') then
      raise exception 'TEST FAILED: F11 % must be append-only', v_txt;
    end if;
  end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'finance\_%';
  perform pg_temp.t_eq('F11 number of finance_ functions', v_n::text, (cardinality(v_app_fns) + cardinality(v_helper_fns))::text);
  for v_fn in
    select p.oid, p.proname, p.prosecdef, p.proconfig, p.proowner,
           coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' order by 1)
                       from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee <> p.proowner), '') as rights
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'finance\_%'
  loop
    if not (v_fn.proname = any (v_app_fns || v_helper_fns)) then
      raise exception 'TEST FAILED: F11 unexpected function %', v_fn.proname;
    end if;
    if not coalesce('search_path=""' = any (v_fn.proconfig), false) then
      raise exception 'TEST FAILED: F11 % must have search_path=""', v_fn.proname;
    end if;
    if v_fn.prosecdef <> (v_fn.proname = any (v_app_fns)) then
      raise exception 'TEST FAILED: F11 % security definer is %, expected only for the 14 app functions', v_fn.proname, v_fn.prosecdef;
    end if;
    if v_fn.rights <> (case when v_fn.proname = any (v_app_fns) then 'authenticated:EXECUTE' else '' end) then
      raise exception 'TEST FAILED: F11 % rights are "%"', v_fn.proname, v_fn.rights;
    end if;
    if v_fn.proowner <> (select t.relowner from pg_class t where t.oid = 'public.finance_day_closings'::regclass) then
      raise exception 'TEST FAILED: F11 % must be owned by the tables'' owner', v_fn.proname;
    end if;
  end loop;
  -- the two date indexes on the payment tables (speed, 0011 section 3)
  perform pg_temp.t_eq('F11 the paid_on indexes', (select string_agg(i.indexname || ' on ' || i.tablename || ': '
      || regexp_replace(i.indexdef, '^.* USING ', ''), ', ' order by i.indexname collate "C")
      from pg_indexes i where i.schemaname = 'public'
        and i.indexname in ('finance_star_payments_paid_on_idx', 'finance_testing_payments_paid_on_idx')),   -- (later migrations may add more)
    'finance_star_payments_paid_on_idx on star_payments: btree (paid_on), '
    || 'finance_testing_payments_paid_on_idx on testing_payments: btree (paid_on)');
  -- the seed
  perform pg_temp.t_eq('F11 one settings row', (select count(*)::text from public.finance_settings), '1');
  perform pg_temp.t_eq('F11 14 reminder times', (select count(*)::text from public.finance_reminder_times), '14');
end;
$$;

select 'ALL 0011 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
