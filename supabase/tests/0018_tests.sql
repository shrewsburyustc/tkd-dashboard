-- =====================================================================
-- 0018_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0018_finance_private.sql: the
--   Daily report with Color Belt PRIVATE testing payments (0014). Build
--   contract: docs/Dashboard Docs/Build contracts/CONTRACT-0018.md. It
--   checks, in this order:
--     P1  a plain private payment (Add + Mark paid, today) counts on its
--         day for the PRIVATE TESTING's school, with is_private and the
--         private day; the Both summary agrees
--     P2  private Undo (another login: undone; the same login at once:
--         hidden), Edit payment (edited); a cancelled private testing
--         still counts
--     P3  MOVE to private testing with one live event payment on a closed
--         day: the day's totals, refunds and fingerprint are identical
--         before and after, the item shows the private row (is_private,
--         no event), the closed day is NOT "changed after closing"
--     P4  MOVE with two live payments on two days and an earlier undone
--         pair that stays on the event side: both days identical
--     P5  move then UNDO MOVE (within 10 s): totals and fingerprint
--         identical, no undone line, the event rows are back
--     P6  move then the private side: an admin Undo (undone), an Edit
--         (edited); the mover can't own-undo a moved-in row
--     P7  a DELETED private testing on a closed day: changed after closing
--     P8  the payment detail: a moved chain's history ('moved',
--         'move_undone'), no event for a private item, staff today only
--     P9  export, export preview, history, Home reminder include private
--         rows
--     P10 privacy (every key on a fixed list; no login id in any answer)
--         and catalog (the index; the six replaced functions' rights)
--   The payments are made with the REAL 0014 functions (Add, Mark paid,
--   Undo / Edit payment, Cancel, Delete, Move to private, Undo move); only
--   event payments on fixed past days (2021) are written straight into
--   testing_payments, because the real functions always use today.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK. NEVER change the final "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   0011, (camps' 0013 + 0017), 0014 and 0018 are applied. Replace
--   <paste-admin-UID-here> and <paste-desk-UID-here> (Authentication ->
--   Users) and run the whole file in the SQL Editor. Expected: one row
--   "ALL 0018 TESTS PASSED"; a failure says "TEST FAILED:" / "TEST SETUP:"
--   and nothing is saved (run   rollback;   once on its own).
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

-- t_ppay(...): one private testing payment written straight into the
-- table (for days other than today)
create function pg_temp.t_ppay(p_private uuid, p_amount integer, p_method text, p_paid_on date,
                               p_at timestamptz, p_by uuid, p_name text)
returns uuid
language plpgsql
as $$
declare
  v uuid;
begin
  insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
  values (p_private, 'payment', p_amount, p_method, p_paid_on, p_at, p_by, p_name) returning id into v;
  return v;
end;
$$;

-- t_mine(day answer, last name): that student's items on the day, as
-- "state:is_private:amount:method", sorted byte by byte
create function pg_temp.t_mine(p_day jsonb, p_last text)
returns text
language sql
as $$
  select coalesce(string_agg((e ->> 'state') || ':' || (e ->> 'is_private') || ':' || (e ->> 'amount_cents') || ':'
                             || (e ->> 'method'), ',' order by ((e ->> 'state') || (e ->> 'is_private')) collate "C"), '')
    from jsonb_array_elements(p_day -> 'items') e
   where e ->> 'last_name' = p_last;
$$;

-- t_money(day answer): what must NOT change when money is only moved
create function pg_temp.t_money(p_day jsonb)
returns text
language sql
as $$
  select (p_day -> 'totals')::text || ' ' || (p_day -> 'refunds')::text || ' ' || (p_day ->> 'fingerprint');
$$;


do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();
  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text;
  v_c_d1 text;

  v_tag   text := 'zz fin18 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_b     date := date '2021-03-01';   -- this test's own past days
  v_an    text;
  v_dn    text;
  v_role  text;

  v_r     jsonb;
  v_r2    jsonb;
  v_before jsonb;
  v_before2 jsonb;
  v_txt   text;
  v_n     integer;
  v_v     integer;
  v_d     date;
  v_p     uuid;
  v_p1    uuid;
  v_p2    uuid;
  v_c     uuid;
  v_id    uuid;
  v_priv  uuid;
  v_ids   uuid[];

  v_cls_w uuid; v_rank_w uuid; v_cls_s uuid; v_rank_s uuid; v_ev uuid; v_er uuid;
  v_reg   uuid[] := '{}';
  v_x     uuid;
  v_i     integer;
  v_w     integer;
  v_fn    record;

  v_allowed_keys text[] := array[
    'status', 'day', 'school', 'fingerprint', 'totals', 'count', 'total_cents', 'in_cents', 'net_cents',
    'cash', 'check', 'card', 'cents', 'refunds', 'cash_cents', 'check_cents', 'card_cents', 'items', 'source',
    'payment_id', 'time', 'first_name', 'last_name', 'what', 'event_date', 'is_private', 'kind', 'method',
    'amount_cents', 'state', 'was_amount_cents', 'was_method', 'moved_to', 'moved_from', 'changed_by_name',
    'changed_on', 'recorded_by_name', 'added_after_closing', 'closing', 'id', 'by_name', 'at',
    'cash_counted_cents', 'checks_counted', 'checks_counted_cents', 'card_counted_cents', 'expected_count',
    'expected_cash_cents', 'expected_checks', 'expected_checks_cents', 'expected_card_cents', 'note', 'results',
    'result', 'diff_cents', 'count_result', 'count_diff', 'checks', 'changed_after', 'changed_count', 'can_close',
    'can_undo_until', 'schools', 'code', 'name', 'closed', 'month', 'unclosed_count', 'days', 'tag', 'diff_part',
    'closed_by_name', 'closed_at', 'item', 'event_name', 'event_id', 'history', 'paid_on', 'today', 'earlier',
    'first_day', 'by_school', 'worcester', 'shrewsbury', 'closing_id', 'from', 'to', 'rows', 'counted_cents',
    'reminder_on', 'version', 'times', 'weekday', 'remind_at',
    -- 0014's own answers (its functions are called through t_call too)
    'private_id', 'registration_version', 'amount_due_cents', 'result_cleared', 'registration_id'];
  v_replaced text[] := array['finance_chain_steps_core', 'finance_chain_items', 'finance_money_rows_core',
                             'finance_figures_from', 'finance_closing_changes_from', 'finance_payment_detail'];
begin
  -- ===================================================================
  -- Setup (as the SQL Editor's role)
  -- ===================================================================
  select s.role, s.full_name into v_role, v_an from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role, s.full_name into v_role, v_dn from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regclass('public.testing_private_payments') is null
     or to_regprocedure('public.finance_chain_steps_core(date, date, text, uuid)') is null then
    raise exception 'TEST SETUP: 0014 and 0018 must be applied first';
  end if;
  if exists (select 1 from public.testing_payments p where p.paid_on between v_b - 5 and v_b + 60)
     or exists (select 1 from public.testing_private_payments p where p.paid_on between v_b - 5 and v_b + 60) then
    raise exception 'TEST SETUP: there are payments dated around % already; this test needs those days empty', v_b;
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_d1, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;

  -- a test class + rank in each school (final award None), one Worcester event
  v_cls_w := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_class(%L, %L, null, true)', 'worcester', v_tag)) ->> 'id')::uuid;
  v_rank_w := (pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_add_rank(%L, %L, 6500, 7500, 8500, false, %L, %L, null, 0, %L)', v_cls_w, 'Yellow', 'solid', 'yellow', 'yellow')) ->> 'id')::uuid;
  v_cls_s := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_class(%L, %L, null, true)', 'shrewsbury', v_tag)) ->> 'id')::uuid;
  v_rank_s := (pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_add_rank(%L, %L, 6500, 7500, 9000, false, %L, %L, null, 0, %L)', v_cls_s, 'Yellow', 'solid', 'yellow', 'yellow')) ->> 'id')::uuid;
  v_ev := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' event', v_today + 5,
    jsonb_build_array(jsonb_build_object('class_id', v_cls_w, 'start_time', '17:00', 'end_time', '18:00'))::text)) ->> 'id')::uuid;
  if v_rank_w is null or v_rank_s is null or v_ev is null then
    raise exception 'TEST SETUP: could not create the test classes / event';
  end if;
  select k.id into v_er from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ev and k.rank_id = v_rank_w;
  -- five event students to move ("Move 1" .. "Move 5")
  for v_i in 1 .. 5 loop
    insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
    values (v_ev, v_er, 'Fin18', 'Move ' || v_i, 'cash', true, 'staff') returning id into v_x;
    v_reg := v_reg || v_x;
  end loop;


  -- ===================================================================
  -- P1. A plain private payment (today) counts for the PRIVATE TESTING's
  -- school (Shrewsbury here), with is_private and the private day
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  v_before := v_r;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'shrewsbury', 'Fin18', 'Plain', v_rank_s, 'cash', v_today + 3, '17:00'));
  perform pg_temp.t_eq('P1 testing_private_add', v_r ->> 'status', 'ok');
  v_priv := (v_r ->> 'id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid(%L, 1)', v_priv));
  perform pg_temp.t_eq('P1 testing_private_mark_paid', (v_r ->> 'status') || ':' || (v_r ->> 'amount_cents'), 'ok:9000');
  v_p := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  perform pg_temp.t_eq('P1 the item', pg_temp.t_mine(v_r, 'Plain'), 'counted:true:9000:cash');
  select (e ->> 'event_date') || ' ' || (e ->> 'what') || ' ' || (e ->> 'source') || ' ' || (e ->> 'payment_id') into v_txt
    from jsonb_array_elements(v_r -> 'items') e where e ->> 'last_name' = 'Plain';
  perform pg_temp.t_eq('P1 private day, codes, payment id', v_txt, (v_today + 3) || ' color_belt color_belt ' || v_p);
  perform pg_temp.t_eq('P1 totals grew by 90.00',
    ((v_r #>> '{totals,total_cents}')::integer - (v_before #>> '{totals,total_cents}')::integer)::text, '9000');
  perform pg_temp.t_eq('P1 not in Worcester', pg_temp.t_mine(pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_day(%L, %L)', 'worcester', v_today)), 'Plain'), '');
  v_r2 := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day_both(%L)', v_today));
  select (s ->> 'count') || ':' || (s ->> 'total_cents') into v_txt from jsonb_array_elements(v_r2 -> 'schools') s where s ->> 'code' = 'shrewsbury';
  perform pg_temp.t_eq('P1 the Both summary agrees', v_txt, (v_r #>> '{totals,count}') || ':' || (v_r #>> '{totals,total_cents}'));


  -- ===================================================================
  -- P2. Private Undo / hide / Edit; a cancelled private testing counts
  -- ===================================================================
  -- the desk's own Undo at once -> a mis-click, hidden
  v_priv := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'shrewsbury', 'Fin18', 'Hide', v_rank_s, 'cash', v_today + 3, '17:00')) ->> 'id')::uuid;
  v_p := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid(%L, 1)', v_priv)) ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('P2 own undo', pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_undo_payment(%L)', v_p)) ->> 'status', 'ok');
  -- the admin's Undo of the desk's payment -> undone
  v_priv := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'shrewsbury', 'Fin18', 'Undone', v_rank_s, 'check', v_today + 3, '17:00')) ->> 'id')::uuid;
  v_p := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid(%L, 1)', v_priv)) ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('P2 admin undo', pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_undo_payment(%L)', v_p)) ->> 'status', 'ok');
  -- the admin's Edit (method only) -> edited
  v_priv := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'shrewsbury', 'Fin18', 'Edit', v_rank_s, 'cash', v_today + 3, '17:00')) ->> 'id')::uuid;
  v_p := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid(%L, 1)', v_priv)) ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('P2 admin edit', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_private_edit_payment(%L, %L, 9000, %L)', v_p, 'card', v_today)) ->> 'status', 'ok');
  -- paid, then cancelled -> still counts
  v_priv := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'shrewsbury', 'Fin18', 'Cancel', v_rank_s, 'cash', v_today + 3, '17:00')) ->> 'id')::uuid;
  perform pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid(%L, 1)', v_priv));
  select t.version into v_v from public.testing_private t where t.id = v_priv;
  perform pg_temp.t_eq('P2 cancel', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_cancel(%L, %s)', v_priv, v_v)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  perform pg_temp.t_eq('P2 hidden mis-click', pg_temp.t_mine(v_r, 'Hide'), '');
  perform pg_temp.t_eq('P2 undone', pg_temp.t_mine(v_r, 'Undone'), 'undone:true:9000:check');
  perform pg_temp.t_eq('P2 edited', pg_temp.t_mine(v_r, 'Edit'), 'edited:true:9000:card');
  perform pg_temp.t_eq('P2 cancelled still counts', pg_temp.t_mine(v_r, 'Cancel'), 'counted:true:9000:cash');


  -- ===================================================================
  -- P3. MOVE with one live event payment, on a CLOSED day
  -- ===================================================================
  v_d := v_b + 1;
  v_p := pg_temp.t_pay('color_belt', v_reg[1], 'payment', 7500, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_reg[5], 'payment', 7000, 'card', v_d, pg_temp.t_at(v_d, '15:30'), v_desk, v_dn);
  perform pg_temp.t_eq('P3 close the day', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');
  v_before := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  select r.version into v_v from public.testing_registrations r where r.id = v_reg[1];
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, %s, %L, %L)',
    v_reg[1], v_v, v_today + 7, '17:00'));
  perform pg_temp.t_eq('P3 the desk moves the student', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('P3 totals, refunds and fingerprint unchanged', pg_temp.t_money(v_r), pg_temp.t_money(v_before));
  perform pg_temp.t_eq('P3 the item is the private row', pg_temp.t_mine(v_r, 'Move 1'), 'counted:true:7500:cash');
  select (e ->> 'payment_id') || ' ' || (e ->> 'event_date') || ' ' || (e ->> 'added_after_closing') || ' ' || coalesce(e ->> 'changed_by_name', '-')
    into v_txt from jsonb_array_elements(v_r -> 'items') e where e ->> 'last_name' = 'Move 1';
  perform pg_temp.t_eq('P3 the same chain id, the private day', v_txt, v_p || ' ' || (v_today + 7) || ' false -');
  perform pg_temp.t_eq('P3 NOT changed after closing', (v_r #>> '{closing,changed_after}') || ':' || (v_r #>> '{closing,changed_count}'), 'false:0');
  perform pg_temp.t_eq('P3 the event side has P + its reversal, the private side the copy',
    (select count(*)::text from public.testing_payments x where x.registration_id = v_reg[1]) || ':'
    || (select count(*)::text from public.testing_private_payments x where x.moved_from_payment_id = v_p), '2:1');


  -- ===================================================================
  -- P4. MOVE with two live payments on two days + an earlier undone pair
  -- ===================================================================
  v_p := pg_temp.t_pay('color_belt', v_reg[2], 'payment', 6500, 'card', v_b + 2, pg_temp.t_at(v_b + 2, '14:00'), v_desk, v_dn);
  perform pg_temp.t_rev('color_belt', v_p, v_b + 2, pg_temp.t_at(v_b + 2, '15:00'), v_admin, v_an);
  v_p1 := pg_temp.t_pay('color_belt', v_reg[2], 'payment', 5000, 'cash', v_b + 2, pg_temp.t_at(v_b + 2, '16:00'), v_desk, v_dn);
  v_p2 := pg_temp.t_pay('color_belt', v_reg[2], 'payment', 2500, 'check', v_b + 3, pg_temp.t_at(v_b + 3, '16:00'), v_desk, v_dn);
  v_before := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_b + 2));
  v_before2 := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_b + 3));
  select r.version into v_v from public.testing_registrations r where r.id = v_reg[2];
  perform pg_temp.t_eq('P4 move', pg_temp.t_call('authenticated', v_c_a1, format('public.testing_move_to_private(%L, %s, %L, %L)',
    v_reg[2], v_v, v_today + 7, '17:00')) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_b + 2));
  perform pg_temp.t_eq('P4 first day unchanged', pg_temp.t_money(v_r), pg_temp.t_money(v_before));
  perform pg_temp.t_eq('P4 first day items (the undone pair stays on the event side)', pg_temp.t_mine(v_r, 'Move 2'),
    'counted:true:5000:cash,undone:false:6500:card');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_b + 3));
  perform pg_temp.t_eq('P4 second day unchanged', pg_temp.t_money(v_r), pg_temp.t_money(v_before2));
  perform pg_temp.t_eq('P4 second day item', pg_temp.t_mine(v_r, 'Move 2'), 'counted:true:2500:check');
  perform pg_temp.t_eq('P4 two copies', (select count(*)::text from public.testing_private_payments x where x.moved_from_payment_id in (v_p1, v_p2)), '2');


  -- ===================================================================
  -- P5. Move, then UNDO MOVE at once (the mover)
  -- ===================================================================
  v_d := v_b + 4;
  v_p := pg_temp.t_pay('color_belt', v_reg[3], 'payment', 7000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  v_before := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  select r.version into v_v from public.testing_registrations r where r.id = v_reg[3];
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, %s, %L, %L)', v_reg[3], v_v, v_today + 7, '17:00'));
  v_priv := (v_r ->> 'private_id')::uuid;
  perform pg_temp.t_eq('P5 undo move', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_undo_move(%L, 1)', v_priv)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('P5 totals and fingerprint unchanged', pg_temp.t_money(v_r), pg_temp.t_money(v_before));
  perform pg_temp.t_eq('P5 one counted event line, no undone line', pg_temp.t_mine(v_r, 'Move 3'), 'counted:false:7000:cash');
  perform pg_temp.t_eq('P5 the event rows: P, the reversal, the payment again; no private row',
    (select count(*)::text from public.testing_payments x where x.registration_id = v_reg[3]) || ':'
    || (select count(*)::text from public.testing_private t where t.id = v_priv), '3:0');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'color_belt', v_p));
  select string_agg(e ->> 'what', ',') into v_txt from jsonb_array_elements(v_r -> 'history') e;
  perform pg_temp.t_eq('P5 detail history', (v_r #>> '{item,state}') || ' ' || v_txt, 'counted move_undone,recorded');


  -- ===================================================================
  -- P6. Move, then the private side: Undo (admin), Edit (admin)
  -- ===================================================================
  v_d := v_b + 5;
  v_p := pg_temp.t_pay('color_belt', v_reg[4], 'payment', 6000, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  v_before := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  select r.version into v_v from public.testing_registrations r where r.id = v_reg[4];
  perform pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, %s, %L, %L)', v_reg[4], v_v, v_today + 7, '17:00'));
  select x.id into v_c from public.testing_private_payments x where x.moved_from_payment_id = v_p;
  perform pg_temp.t_eq('P6 the mover can''t own-undo a moved-in row', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_undo_payment(%L)', v_c)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('P6 admin undo of the copy', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_private_undo_payment(%L)', v_c)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  -- an undone chain shows its first row of the day: the original event payment
  perform pg_temp.t_eq('P6 undone on its day', pg_temp.t_mine(v_r, 'Move 4'), 'undone:false:6000:cash');
  perform pg_temp.t_eq('P6 the day lost 60.00',
    ((v_before #>> '{totals,total_cents}')::integer - (v_r #>> '{totals,total_cents}')::integer)::text, '6000');
  -- Move 5's payment (P3's day): moved, then edited on the private side
  select r.version into v_v from public.testing_registrations r where r.id = v_reg[5];
  perform pg_temp.t_call('authenticated', v_c_a1, format('public.testing_move_to_private(%L, %s, %L, %L)', v_reg[5], v_v, v_today + 7, '17:00'));
  select x.id into v_c from public.testing_private_payments x join public.testing_private t on t.id = x.private_id
   where t.moved_from_registration_id = v_reg[5];
  perform pg_temp.t_eq('P6 admin edit of the copy', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_private_edit_payment(%L, %L, 6800, %L)', v_c, 'check', v_b + 1)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_b + 1));
  perform pg_temp.t_eq('P6 edited on its day', pg_temp.t_mine(v_r, 'Move 5'), 'edited:true:6800:check');
  select (e ->> 'was_amount_cents') || ':' || (e ->> 'was_method') || ':' || (e ->> 'changed_by_name') into v_txt
    from jsonb_array_elements(v_r -> 'items') e where e ->> 'last_name' = 'Move 5';
  perform pg_temp.t_eq('P6 was the event payment, changed by the editor', v_txt, '7000:card:' || v_an);
  perform pg_temp.t_eq('P6 the closed day is now changed (an edit is a real change)',
    (v_r #>> '{closing,changed_after}') || ':' || (v_r #>> '{closing,changed_count}'), 'true:1');


  -- ===================================================================
  -- P7. A DELETED private testing on a closed day
  -- ===================================================================
  v_d := v_b + 6;
  v_priv := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'worcester', 'Fin18', 'Delete', v_rank_w, 'cash', v_today + 3, '17:00')) ->> 'id')::uuid;
  v_p := pg_temp.t_ppay(v_priv, 8500, 'cash', v_d, pg_temp.t_at(v_d, '15:00'), v_desk, v_dn);
  perform pg_temp.t_pay('color_belt', v_reg[1], 'payment', 100, 'cash', v_d, pg_temp.t_at(v_d, '16:00'), v_desk, v_dn);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('P7 the private payment is on its day', pg_temp.t_mine(v_r, 'Delete'), 'counted:true:8500:cash');
  perform pg_temp.t_eq('P7 close', (pg_temp.t_close(v_c_a1, 'worcester', v_d, 0, null)) ->> 'status', 'ok');
  select t.version into v_v from public.testing_private t where t.id = v_priv;
  perform pg_temp.t_eq('P7 delete', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_private_delete(%L, %s, %L::uuid[])', v_priv, v_v, array[v_p]::text)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('P7 changed after closing', (v_r #>> '{closing,changed_after}') || ':' || (v_r #>> '{closing,changed_count}')
    || ':' || pg_temp.t_mine(v_r, 'Delete'), 'true:1:');


  -- ===================================================================
  -- P8. The payment detail
  -- ===================================================================
  select x.id into v_p from public.testing_payments x where x.registration_id = v_reg[1] and x.kind = 'payment' and x.amount_cents = 7500;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'color_belt', v_p));
  select string_agg((e ->> 'what') || '/' || (e ->> 'by_name'), ',') into v_txt from jsonb_array_elements(v_r -> 'history') e;
  perform pg_temp.t_eq('P8 a moved chain', (v_r ->> 'status') || ' ' || (v_r #>> '{item,is_private}') || ' '
    || coalesce(v_r ->> 'event_name', 'null') || ' ' || coalesce(v_r ->> 'event_id', 'null') || ' ' || v_txt,
    'ok true null null moved/' || v_dn || ',recorded/' || v_dn);
  perform pg_temp.t_eq('P8 staff: an old moved chain', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_payment_detail(%L, %L)', 'color_belt', v_p)) ->> 'status', 'not_allowed');
  select x.id into v_p from public.testing_private_payments x join public.testing_private t on t.id = x.private_id
   where t.last_name = 'Plain' and t.first_name = 'Fin18';
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_payment_detail(%L, %L)', 'color_belt', v_p));
  perform pg_temp.t_eq('P8 staff: today''s private payment', (v_r ->> 'status') || ' ' || (v_r #>> '{item,school}') || ' '
    || (v_r #>> '{item,is_private}') || ' ' || coalesce(v_r ->> 'event_id', 'null'), 'ok shrewsbury true null');
  perform pg_temp.t_eq('P8 a private payment id as Star', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_payment_detail(%L, %L)', 'star', v_p)) ->> 'status', 'not_found');


  -- ===================================================================
  -- P9. Export, preview, history, Home
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_export(%L, %L, %L)', 'worcester', v_b, v_b + 10));
  select string_agg((e ->> 'last_name') || ':' || (e ->> 'state') || ':' || (e ->> 'counted_cents'), ',' order by (e ->> 'last_name') collate "C", (e ->> 'day'), (e ->> 'state') collate "C")
    into v_txt from jsonb_array_elements(v_r -> 'rows') e;
  perform pg_temp.t_eq('P9 export rows', v_txt,
    'Move 1:counted:7500,Move 1:counted:100,Move 2:counted:5000,Move 2:undone:0,Move 2:counted:2500,Move 3:counted:7000,'
    || 'Move 4:undone:0,Move 5:edited:6800');
  v_r2 := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_export_preview(%L, %L, %L)', 'worcester', v_b, v_b + 10));
  perform pg_temp.t_eq('P9 preview', v_r2::text, jsonb_build_object('status', 'ok', 'count', 6, 'total_cents', 28900)::text);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_history(%L, %L)', 'worcester', v_b));
  select (e ->> 'total_cents') || ':' || (e ->> 'tag') into v_txt from jsonb_array_elements(v_r -> 'days') e where (e ->> 'day')::date = v_b + 1;
  perform pg_temp.t_eq('P9 history (the closed day with the moved + edited payments)', v_txt, '14300:changed_after_closing');
  select (e ->> 'total_cents') || ':' || (e ->> 'tag') into v_txt from jsonb_array_elements(v_r -> 'days') e where (e ->> 'day')::date = v_b + 2;
  perform pg_temp.t_eq('P9 history (a day with a moved payment)', v_txt, '5000:not_closed');
  -- Home: a day whose only payment is a private one
  v_d := v_b + 20;
  v_w := extract(isodow from v_d)::integer;
  v_priv := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'worcester', 'Fin18', 'Home', v_rank_w, 'cash', v_today + 3, '17:00')) ->> 'id')::uuid;
  perform pg_temp.t_ppay(v_priv, 8500, 'cash', v_d, pg_temp.t_at(v_d, '12:00'), v_desk, v_dn);
  v_v := (pg_temp.t_call('authenticated', v_c_a1, 'public.finance_settings_get()') ->> 'version')::integer;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_set_reminder_on(true, %s)', v_v));
  v_v := (v_r ->> 'version')::integer;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_set_reminder_time(%L, %s::smallint, %L, %s)', 'worcester', v_w, '19:30', v_v));
  perform pg_temp.t_eq('P9 reminder time', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('P9 Home reminder for a private-only day', (public.finance_home_at(pg_temp.t_at(v_d, '19:30'), false) -> 'today')::text, '["worcester"]');


  -- ===================================================================
  -- P10. Privacy and catalog
  -- ===================================================================
  select string_agg(distinct k, ', ') into v_txt
    from t_answers a, lateral pg_temp.t_keys(a.r) as k
   where a.fn like 'public.finance\_%' and not (k = any (v_allowed_keys));
  if v_txt is not null then
    raise exception 'TEST FAILED: P10 keys not on the allowed list: %', v_txt;
  end if;
  if exists (select 1 from t_answers a where a.fn like 'public.finance\_%'
              and (a.r::text like '%' || v_admin::text || '%' or a.r::text like '%' || v_desk::text || '%')) then
    raise exception 'TEST FAILED: P10 a login id appeared in a Finance answer';
  end if;
  perform pg_temp.t_eq('P10 the private paid_on index', (select i.indexdef from pg_indexes i
    where i.schemaname = 'public' and i.indexname = 'finance_testing_private_payments_paid_on_idx'),
    'CREATE INDEX finance_testing_private_payments_paid_on_idx ON public.testing_private_payments USING btree (paid_on)');
  for v_fn in
    select p.proname, p.prosecdef, p.proconfig,
           coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' order by 1)
                       from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee <> p.proowner), '') as rights
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_replaced)
  loop
    if not coalesce('search_path=""' = any (v_fn.proconfig), false)
       or v_fn.prosecdef <> (v_fn.proname = 'finance_payment_detail')
       or v_fn.rights <> (case when v_fn.proname = 'finance_payment_detail' then 'authenticated:EXECUTE' else '' end) then
      raise exception 'TEST FAILED: P10 % (definer %, rights "%")', v_fn.proname, v_fn.prosecdef, v_fn.rights;
    end if;
  end loop;
  perform pg_temp.t_eq('P10 six replaced functions, once each', (select count(*)::text from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any (v_replaced)), '6');
  perform pg_temp.t_eq('P10 no function body names a login column for output (only the two 0011 readers read one)',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'finance\_%'
        and p.proname not in ('finance_chain_steps_core', 'finance_closing_is_mine')
        and p.prosrc ~* '\m(recorded_by|created_by|updated_by|cancelled_by|withdrawn_by)\M'), '0');
end;
$$;

select 'ALL 0018 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
