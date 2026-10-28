-- =====================================================================
-- 0026_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0026_finance_black_belt.sql:
--   Black Belt payments (0016) in Finance. Build contract: docs/Dashboard
--   Docs/Build contracts/CONTRACT-0026.md. It checks, in this order:
--     B1  a payment (Record payment, today): the item's For fields
--         (event_name = the cycle, for_items, one_payment_plan, no event
--         date, not private), a $2,700 payment on a one-payment plan
--         ("In full"), the payment detail (event_id = the cycle), and the
--         school AS RECORDED after the candidate moves to the other school
--     B2  Edit payment: 'edited' with the was-amount / was-method and the
--         history line 'edited'
--     B3  the desk's own Undo at once (a mis-click): hidden everywhere
--     B4  a refund to a CARD (today): refunds.card_cents, the refund line
--     B4b undos by ANOTHER login long after the row (rows written "earlier"):
--         a desk payment undone by an admin -> 'undone' on its own day, not
--         hidden; a card refund undone -> not counted, refunds and the card
--         total back to before
--     B5  a past day with only a card refund after a cash payment: Close
--         the day expects card money in + card refunds (v0.814), below 0
--         here, and accepts a counted card total below 0 only then
--     B6  a RETURNED check (v0.809): the check's own day (closed) stays
--         exactly as it was - not "changed after closing"; the returned
--         row shows on the day it was marked, in the Total only (not in
--         the cards, the count or the fingerprint); its detail (history
--         'returned' + the check's own 'recorded' line), the export row,
--         the Both summary; the marker's Undo at once hides it (mis-click)
--     B7  the Undo of a returned mark made earlier: 'undone' (struck
--         through, not counted), history 'returned_undone'; the check's
--         closed day still not changed; afterwards the check can be edited
--         (and THAT flags its closed day - real money)
--     B8  a day whose only items are returned checks: nothing to close
--         (can_close false, nothing_to_close); after a real payment and a
--         close, the close's snapshot has no returned check, and a check
--         returned after the close doesn't flag the day
--     B3b the cycle renamed after a payment: lines keep the recorded name
--     B4c one_payment_plan follows the CURRENT plan (null on "3 payments",
--         the plan's name after a change to "In full"); {p1, kukkiwon}
--     B9  staff see today only (a Black Belt payment's detail too; a check
--         returned today but handed in earlier: yes; one returned on an
--         earlier day, or an earlier Both summary: no)
--     B10 a closed day with a $2,700 Black Belt check: the snapshot holds
--         it (source black_belt; the amount rule allows up to $5,000)
--     B11 privacy (every key on a fixed list; no login id, note, reason,
--         date of birth or email in any Finance answer) and catalog (the
--         nine replaced functions' rights and settings, the two rules)
--   The payments are made with the REAL Black Belt functions (Record
--   payment, Edit payment, Undo, Record refund, Mark check returned)
--   wherever possible; rows on fixed PAST days (2021) are written straight
--   into bb_payments (the real functions always use today), and so is one
--   returned mark made "two hours ago" (B7: an Undo by the same admin
--   right away would be a hidden mis-click).
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK. NEVER change the final "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   0016 (Black Belt) and Finance up to 0026 are applied. Replace
--   <paste-admin-UID-here> and <paste-desk-UID-here> (Authentication ->
--   Users) and run the whole file in the SQL Editor. Expected: one row
--   "ALL 0026 TESTS PASSED"; a failure says "TEST FAILED:" / "TEST SETUP:"
--   and nothing is saved (run   rollback;   once on its own). B8 needs a
--   school with no payment at all today; when both schools already have
--   one, B8's "only returned checks" part is skipped (a NOTICE says so).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Test helpers (temporary: they vanish with the session, and the
-- rollback undoes them anyway)
-- ---------------------------------------------------------------------

-- every answer a function gave during the test (for B11)
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

-- t_row(...): one bb_payments row written straight into the table (for a
-- PAST day; the real functions always use today), with the candidate's
-- cycle and the given school; a reversal / returned row copies its
-- target's school and cycle name (the table's guard demands that)
create function pg_temp.t_row(p_cand uuid, p_kind text, p_amount integer, p_method text, p_paid_on date,
                              p_at timestamptz, p_by uuid, p_name text, p_items text[], p_target uuid, p_school text)
returns uuid
language plpgsql
as $$
declare
  v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.actor_label', 'zz fin26 test', true);
  insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                  location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  select c.id, c.cycle_id, p_kind, p_amount, p_method, p_paid_on, p_items,
         coalesce(t.location_code, p_school), coalesce(t.cycle_name, y.name), p_at, p_by, p_name, p_target
    from public.bb_candidates c
    join public.bb_cycles y on y.id = c.cycle_id
    left join public.bb_payments t on t.id = p_target
   where c.id = p_cand
  returning id into v;
  perform set_config('tkd.actor_label', '', true);
  return v;
end;
$$;

-- t_ver(candidate): its version now (the functions want it)
create function pg_temp.t_ver(p_cand uuid)
returns integer
language sql
as $$
  select c.version from public.bb_candidates c where c.id = p_cand;
$$;

-- t_item(day answer, payment id): that chain's item on the day (or NULL)
create function pg_temp.t_item(p_day jsonb, p_payment uuid)
returns jsonb
language sql
as $$
  select e from jsonb_array_elements(p_day -> 'items') e where e ->> 'payment_id' = p_payment::text limit 1;
$$;

-- t_money(day answer): what Close the day works with - must not move when
-- only a returned check comes or goes
create function pg_temp.t_money(p_day jsonb)
returns text
language sql
as $$
  select (p_day -> 'totals' -> 'cash')::text || ' ' || (p_day -> 'totals' -> 'check')::text || ' '
         || (p_day -> 'totals' -> 'card')::text || ' ' || (p_day -> 'totals' ->> 'count') || ' ' || (p_day -> 'refunds')::text
         || ' ' || (p_day ->> 'fingerprint') || ' ' || (p_day ->> 'can_close');
$$;

-- t_hist(detail answer): the history "what" codes, newest first
create function pg_temp.t_hist(p_detail jsonb)
returns text
language sql
as $$
  select string_agg(e ->> 'what', ',' order by n) from jsonb_array_elements(p_detail -> 'history') with ordinality as x(e, n);
$$;

-- t_close(token, school, day, card counted, note): load the day, then
-- close it with what the report expects (cash and checks) and the given
-- card total (NULL = what it expects: card in + card refunds, v0.814)
create function pg_temp.t_close(p_claims text, p_school text, p_day date, p_card integer, p_note text)
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
    (v_d #>> '{totals,cash,cents}')::integer + (v_d #>> '{refunds,cash_cents}')::integer,
    (v_d #>> '{totals,check,count}')::integer, (v_d #>> '{totals,check,cents}')::integer,
    coalesce(p_card, (v_d #>> '{totals,card,cents}')::integer + (v_d #>> '{refunds,card_cents}')::integer), p_note));
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

-- t_cycle(name, first day, application due): a valid Add cycle payload
-- (as 0016_tests.sql's): plans "In full" (1 payment) and "3 payments"
create function pg_temp.t_cycle(p_name text, p_d1 date, p_app date)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'name', p_name, 'application_due', p_app, 'submissions_due', p_d1 + 10, 'auto_close', true,
    'days', jsonb_build_array(
      jsonb_build_object('name', 'Physical', 'day_date', p_d1, 'start_time', '12:30', 'end_time', '14:30',
                         'place', jsonb_build_object('code', 'worcester'), 'second', null,
                         'parts', jsonb_build_array('physical')),
      jsonb_build_object('name', 'Technical', 'day_date', p_d1 + 7, 'start_time', '12:30', 'end_time', '15:30',
                         'place', jsonb_build_object('code', 'shrewsbury'), 'second', null,
                         'parts', jsonb_build_array('technical')),
      jsonb_build_object('name', 'Curriculum', 'day_date', p_d1 + 14, 'start_time', '14:00', 'end_time', '17:00',
                         'place', jsonb_build_object('code', 'shrewsbury'), 'second', null,
                         'parts', jsonb_build_array('curriculum'))),
    'plans', jsonb_build_array(
      jsonb_build_object('name', 'In full',
                         'payments', jsonb_build_array(jsonb_build_object('due_on', p_app, 'follows_application_due', true)),
                         'amounts', jsonb_build_object('1', jsonb_build_array(87000), '2', jsonb_build_array(99000),
                                                       '3', jsonb_build_array(150000), '4', jsonb_build_array(270000))),
      jsonb_build_object('name', '3 payments',
                         'payments', jsonb_build_array(jsonb_build_object('due_on', p_app, 'follows_application_due', true),
                                                       jsonb_build_object('due_on', p_d1 + 7, 'follows_application_due', false),
                                                       jsonb_build_object('due_on', p_d1 + 14, 'follows_application_due', false)),
                         'amounts', jsonb_build_object('1', jsonb_build_array(29000, 29000, 29000),
                                                       '2', jsonb_build_array(33000, 33000, 33000),
                                                       '3', jsonb_build_array(50000, 50000, 50000),
                                                       '4', jsonb_build_array(90000, 90000, 90000)))),
    'kukkiwon', jsonb_build_object('1', 10000, '2', 11000, '3', 14000, '4', 17000),
    'prices_from', null);
$$;

-- t_current(cycle): the cycle's saved values as an Edit cycle payload
-- (as 0016_tests.sql's bbt_current) - to rename it (B3b)
create function pg_temp.t_current(p_cycle uuid)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'name', y.name, 'application_due', y.application_due, 'submissions_due', y.submissions_due,
    'auto_close', y.auto_close,
    'days', (select jsonb_agg(jsonb_build_object(
                      'id', d.id, 'name', d.name, 'day_date', d.day_date,
                      'start_time', left(d.start_time::text, 5), 'end_time', left(d.end_time::text, 5),
                      'place', case when d.place_code is not null then jsonb_build_object('code', d.place_code)
                                    else jsonb_build_object('other', d.place_other) end,
                      'second', case when d.second_start is null then null
                                     else jsonb_build_object('start', left(d.second_start::text, 5),
                                                             'end', left(d.second_end::text, 5),
                                                             'place', case when d.second_place_code is not null
                                                                           then jsonb_build_object('code', d.second_place_code)
                                                                           else jsonb_build_object('other', d.second_place_other) end) end,
                      'parts', (select jsonb_agg(p.part order by p.part) from public.bb_cycle_day_parts p where p.day_id = d.id))
                    order by d.day_date, d.id)
               from public.bb_cycle_days d where d.cycle_id = y.id),
    'due_dates', (select jsonb_agg(jsonb_build_object('cycle_plan_id', pp.cycle_plan_id, 'payment_no', pp.payment_no,
                                                      'due_on', pp.due_on, 'follows_application_due', pp.follows_application_due)
                                   order by pp.id)
                    from public.bb_cycle_plan_payments pp join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id
                   where pl.cycle_id = y.id))
    from public.bb_cycles y where y.id = p_cycle;
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

  v_tag      text := 'zz fin26 ' || left(gen_random_uuid()::text, 8);
  v_mail_tag text := 'zzfin26' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_dob      date := date '1977-07-17';
  v_today    date := public.testing_today();
  v_b        date := date '2021-05-03';   -- this test's own past days
  v_an       text;
  v_dn       text;
  v_role     text;
  v_s1       text;      -- a school with nothing today (B8), or NULL
  v_s2       text;      -- the school of everything else
  v_other    text;      -- the school that isn't v_s2

  v_cy       uuid;      -- the test cycle
  v_cy_name  text;
  v_full     uuid;      -- its "In full" plan
  v_three    uuid;      -- its "3 payments" plan

  v_r        jsonb;
  v_r2       jsonb;
  v_before   jsonb;
  v_before2  jsonb;
  v_today0   jsonb;
  v_it       jsonb;
  v_txt      text;
  v_n        integer;
  v_i        integer;
  v_k        record;
  v_fn       record;

  v_ka uuid; v_kf uuid; v_ke uuid; v_km uuid; v_kg uuid; v_kr uuid; v_kq uuid; v_kh uuid; v_k4 uuid;
  v_pa uuid; v_pf uuid; v_pe uuid; v_pm uuid; v_pref uuid; v_pg uuid; v_pg2 uuid;
  v_p  uuid; v_ret uuid; v_p2 uuid; v_ret2 uuid; v_p3 uuid; v_ret3 uuid; v_p5 uuid; v_ret5 uuid; v_p4 uuid;
  v_close uuid;
  v_ku uuid; v_kw uuid; v_kp uuid; v_kt uuid;
  v_pu uuid; v_pw uuid; v_pp uuid; v_ref2 uuid; v_p6 uuid; v_ret6 uuid;
  v_old_name text;

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
    -- 0026 (CONTRACT-0026 section 6)
    'returned', 'for_items', 'one_payment_plan', 'handed_in_on'];
  v_replaced text[] := array['finance_chain_steps_core', 'finance_money_rows_core', 'finance_figures_from',
                             'finance_closing_changes_from', 'finance_payment_detail', 'finance_day', 'finance_export',
                             'finance_close_day', 'finance_day_both'];
  v_app_fns text[] := array['finance_payment_detail', 'finance_day', 'finance_export', 'finance_close_day', 'finance_day_both'];
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
  if to_regclass('public.bb_payments') is null
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'finance_chain_steps_core'
                       and position('source: black belt (0026)' in p.prosrc) > 0) then
    raise exception 'TEST SETUP: 0016 and 0026 must be applied first';
  end if;
  if exists (select 1 from public.testing_payments p where p.paid_on between v_b - 5 and v_b + 40)
     or exists (select 1 from public.star_payments p where p.paid_on between v_b - 5 and v_b + 40)
     or exists (select 1 from public.camp_payments p where p.paid_on between v_b - 5 and v_b + 40)
     or exists (select 1 from public.testing_private_payments p where p.paid_on between v_b - 5 and v_b + 40)
     or exists (select 1 from public.bb_payments p where p.paid_on between v_b - 5 and v_b + 40) then
    raise exception 'TEST SETUP: there are payments dated around % already; this test needs those days empty', v_b;
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_d1, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;

  -- the schools: v_s1 = one with no Finance item and no close today (for
  -- B8), v_s2 = the other one (everything else)
  select l.code into v_s1
    from public.locations l
   where (public.finance_active_close(l.code, v_today)).id is null
     and not exists (select 1 from public.finance_money_rows(l.code, v_today, v_today) m)
   order by case l.code when 'worcester' then 1 else 0 end
   limit 1;
  select l.code into v_s2 from public.locations l where l.code is distinct from v_s1
   order by case l.code when 'worcester' then 0 else 1 end limit 1;
  select l.code into v_other from public.locations l where l.code <> v_s2 order by l.code collate "C" limit 1;
  if v_s1 is null then
    raise notice 'B8 (a day with only returned checks) is skipped: both schools already have Finance items today';
  end if;

  -- a current waiver version is needed to add a candidate at the desk
  if not exists (select 1 from public.bb_waiver_versions v where v.superseded_at is null) then
    insert into public.bb_waiver_versions (version_name, body, is_placeholder, created_by_name)
    values ('1999-26', 'PLACEHOLDER zz fin26 test', true, '');
  end if;

  -- one test cycle (in a month) with its two plans
  v_r := pg_temp.t_call('authenticated', v_c_a1,
    format('public.bb_add_cycle(%L::jsonb, null)', pg_temp.t_cycle(v_tag || ' Cycle', v_today + 30, v_today + 20)));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_add_cycle answered %', v_r; end if;
  v_cy := (v_r ->> 'id')::uuid;
  select y.name into v_cy_name from public.bb_cycles y where y.id = v_cy;
  select id into v_full from public.bb_cycle_plans where cycle_id = v_cy and name = 'In full';
  select id into v_three from public.bb_cycle_plans where cycle_id = v_cy and name = '3 payments';

  -- the candidates (added at the desk, paper waiver ticked)
  for v_k in
    select * from (values ('A', 1, 'three', v_s2), ('F', 4, 'full', v_s2), ('E', 1, 'three', v_s2), ('M', 1, 'three', v_s2),
                          ('G', 1, 'three', v_s2), ('R', 1, 'three', v_s2), ('Q', 1, 'three', v_s2), ('H', 1, 'three', coalesce(v_s1, v_s2)),
                          ('K', 4, 'full', v_s2), ('U', 1, 'three', v_s2), ('W', 1, 'three', v_s2), ('P', 1, 'three', v_s2),
                          ('T', 1, 'three', v_s2)) as x(letter, dan, plan, school)
  loop
    v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, %s, %L::uuid, %s, true)',
      v_cy, 'Fin26', 'Bb ' || v_k.letter, v_dob, v_mail_tag || '.' || lower(v_k.letter) || '@example.com', v_k.school, v_k.dan,
      case v_k.plan when 'full' then v_full else v_three end,
      (v_k.letter = 'W')::text));   -- W chose Kukkiwon (a payment for {p1, kukkiwon})
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_add_candidate % answered %', v_k.letter, v_r; end if;
    case v_k.letter
      when 'A' then v_ka := (v_r ->> 'id')::uuid;
      when 'F' then v_kf := (v_r ->> 'id')::uuid;
      when 'E' then v_ke := (v_r ->> 'id')::uuid;
      when 'M' then v_km := (v_r ->> 'id')::uuid;
      when 'G' then v_kg := (v_r ->> 'id')::uuid;
      when 'R' then v_kr := (v_r ->> 'id')::uuid;
      when 'Q' then v_kq := (v_r ->> 'id')::uuid;
      when 'H' then v_kh := (v_r ->> 'id')::uuid;
      when 'U' then v_ku := (v_r ->> 'id')::uuid;
      when 'W' then v_kw := (v_r ->> 'id')::uuid;
      when 'P' then v_kp := (v_r ->> 'id')::uuid;
      when 'T' then v_kt := (v_r ->> 'id')::uuid;
      else v_k4 := (v_r ->> 'id')::uuid;
    end case;
  end loop;

  -- today at v_s2 before anything of this test (B6 compares with it)
  v_today0 := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B0 the answer has refunds.card_cents and returned', (v_today0 -> 'refunds' ? 'card_cents')::text
    || ' ' || (v_today0 -> 'returned' ? 'count')::text || ' ' || (v_today0 -> 'returned' ? 'cents')::text, 'true true true');


  -- ===================================================================
  -- B1. A payment today: the For fields; $2,700 on a one-payment plan;
  -- the detail; the school AS RECORDED after a school change
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.bb_record_payment(%L::uuid, %s, 29000, %L, %L::text[], %L)',
    v_ka, pg_temp.t_ver(v_ka), 'cash', '{p1}', 'zz secret pay note 26'));
  perform pg_temp.t_eq('B1 record payment', v_r ->> 'status', 'ok');
  v_pa := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.bb_record_payment(%L::uuid, %s, 270000, %L, %L::text[], null)',
    v_kf, pg_temp.t_ver(v_kf), 'check', '{p1}'));
  perform pg_temp.t_eq('B1 record a $2,700 payment', v_r ->> 'status', 'ok');
  v_pf := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', v_s2, v_today));
  v_it := pg_temp.t_item(v_r, v_pa);
  perform pg_temp.t_eq('B1 the item', concat_ws('|', v_it ->> 'source', v_it ->> 'what', v_it ->> 'kind', v_it ->> 'state',
      v_it ->> 'amount_cents', v_it ->> 'method', v_it ->> 'event_name', (v_it -> 'for_items')::text,
      coalesce(v_it ->> 'one_payment_plan', '-'), coalesce(v_it ->> 'handed_in_on', '-'), coalesce(v_it ->> 'event_date', '-'),
      v_it ->> 'is_private', v_it ->> 'first_name', v_it ->> 'last_name', v_it ->> 'recorded_by_name', v_it ->> 'added_after_closing'),
    concat_ws('|', 'black_belt', 'black_belt', 'payment', 'counted', '29000', 'cash', v_cy_name, '["p1"]', '-', '-', '-',
      'false', 'Fin26', 'Bb A', v_dn, 'false'));
  perform pg_temp.t_eq('B1 the four extra keys only on Black Belt items',
    (select count(*)::text from jsonb_array_elements(v_r -> 'items') e
      where (e ? 'for_items' or e ? 'one_payment_plan' or e ? 'handed_in_on') and e ->> 'source' <> 'black_belt'), '0');
  v_it := pg_temp.t_item(v_r, v_pf);
  perform pg_temp.t_eq('B1 the $2,700 payment, "In full"', concat_ws('|', v_it ->> 'amount_cents', v_it ->> 'method',
    v_it ->> 'one_payment_plan', (v_it -> 'for_items')::text), '270000|check|In full|["p1"]');
  perform pg_temp.t_eq('B1 the day counts both', concat_ws('|', (v_r #>> '{totals,count}')::integer - (v_today0 #>> '{totals,count}')::integer,
    (v_r #>> '{totals,total_cents}')::integer - (v_today0 #>> '{totals,total_cents}')::integer,
    (v_r #>> '{totals,check,cents}')::integer - (v_today0 #>> '{totals,check,cents}')::integer), '2|299000|270000');
  -- the detail (an admin and the desk: today's)
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'black_belt', v_pa));
  perform pg_temp.t_eq('B1 detail', concat_ws('|', v_r ->> 'status', v_r ->> 'event_name', v_r ->> 'event_id',
      v_r #>> '{item,event_name}', (v_r #> '{item,for_items}')::text, v_r #>> '{item,school}', pg_temp.t_hist(v_r),
      v_r #>> '{history,0,by_name}', v_r #>> '{history,0,amount_cents}'),
    concat_ws('|', 'ok', v_cy_name, v_cy::text, v_cy_name, '["p1"]', v_s2, 'recorded', v_dn, '29000'));
  perform pg_temp.t_eq('B1 the desk sees today''s detail', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_payment_detail(%L, %L)', 'black_belt', v_pa)) ->> 'status', 'ok');
  -- the candidate moves to the other school: the payment stays where it was recorded
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.bb_update_candidate(%L::uuid, %s, %L, %L, %L::date, %L, %L, 1)',
    v_ka, pg_temp.t_ver(v_ka), 'Fin26', 'Bb A', v_dob, v_mail_tag || '.a@example.com', v_other));
  perform pg_temp.t_eq('B1 change the candidate''s school', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  v_r2 := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_other, v_today));
  perform pg_temp.t_eq('B1 the school as recorded', (pg_temp.t_item(v_r, v_pa) is not null)::text || ' '
    || (pg_temp.t_item(v_r2, v_pa) is not null)::text, 'true false');


  -- ===================================================================
  -- B2. Edit payment (same day): edited, history 'edited'
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.bb_record_payment(%L::uuid, %s, 29000, %L, %L::text[], null)',
    v_ke, pg_temp.t_ver(v_ke), 'cash', '{p1}'));
  v_pe := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.bb_edit_payment(%L::uuid, 30000, %L, %L::text[], null, %L)',
    v_pe, 'card', '{p1}', 'zz secret reason 26'));
  perform pg_temp.t_eq('B2 edit payment', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  v_it := pg_temp.t_item(v_r, v_pe);
  perform pg_temp.t_eq('B2 the edited item', concat_ws('|', v_it ->> 'state', v_it ->> 'amount_cents', v_it ->> 'method',
      v_it ->> 'was_amount_cents', v_it ->> 'was_method', v_it ->> 'changed_by_name', v_it ->> 'changed_on', v_it ->> 'event_name'),
    concat_ws('|', 'edited', '30000', 'card', '29000', 'cash', v_an, v_today::text, v_cy_name));
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'black_belt', v_pe));
  perform pg_temp.t_eq('B2 history', pg_temp.t_hist(v_r), 'edited,recorded');


  -- ===================================================================
  -- B3. The desk's own Undo at once: a mis-click, hidden
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.bb_record_payment(%L::uuid, %s, 29000, %L, %L::text[], null)',
    v_km, pg_temp.t_ver(v_km), 'cash', '{p1}'));
  v_pm := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('B3 the desk undoes at once', pg_temp.t_call('authenticated', v_c_d1,
    format('public.bb_undo_payment(%L::uuid)', v_pm)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B3 hidden from the day', (pg_temp.t_item(v_r, v_pm) is null)::text, 'true');
  perform pg_temp.t_eq('B3 hidden from the detail', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_payment_detail(%L, %L)', 'black_belt', v_pm)) ->> 'status', 'not_found');


  -- ===================================================================
  -- B4. A refund to a CARD today
  -- ===================================================================
  v_before := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.bb_record_refund(%L::uuid, %s, 15000, %L, null)',
    v_ke, pg_temp.t_ver(v_ke), 'card'));
  perform pg_temp.t_eq('B4 record a card refund', v_r ->> 'status', 'ok');
  v_pref := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B4 refunds: count, cents, card part; the cards unchanged',
    concat_ws('|', (v_r #>> '{refunds,count}')::integer - (v_before #>> '{refunds,count}')::integer,
      (v_r #>> '{refunds,cents}')::integer - (v_before #>> '{refunds,cents}')::integer,
      (v_r #>> '{refunds,card_cents}')::integer - (v_before #>> '{refunds,card_cents}')::integer,
      (v_r #>> '{refunds,cash_cents}')::integer - (v_before #>> '{refunds,cash_cents}')::integer,
      ((v_r -> 'totals' -> 'card')::text = (v_before -> 'totals' -> 'card')::text)::text,
      (v_r #>> '{totals,total_cents}')::integer - (v_before #>> '{totals,total_cents}')::integer),
    '1|-15000|-15000|0|true|-15000');
  v_it := pg_temp.t_item(v_r, v_pref);
  perform pg_temp.t_eq('B4 the refund line', concat_ws('|', v_it ->> 'kind', v_it ->> 'method', v_it ->> 'amount_cents',
      v_it ->> 'state', v_it ->> 'event_name', coalesce((v_it -> 'for_items')::text, '-'), coalesce(v_it ->> 'handed_in_on', '-')),
    concat_ws('|', 'refund', 'card', '-15000', 'counted', v_cy_name, 'null', '-'));


  -- ===================================================================
  -- B4b. Undos by ANOTHER login (an admin), long after the row: 'undone'
  -- on the row's own day, never hidden (the 10-second rule only hides the
  -- recorder's own undo). Rows written "earlier" straight into the table,
  -- because every real write in this test shares one moment (now()).
  -- ===================================================================
  -- a desk payment on a past day, undone today by an admin
  v_pu := pg_temp.t_row(v_ku, 'payment', 29000, 'cash', v_b + 7, pg_temp.t_at(v_b + 7, '12:00'), v_desk, v_dn, '{p1}', null, v_s2);
  perform pg_temp.t_eq('B4b the admin undoes the desk''s payment', pg_temp.t_call('authenticated', v_c_a1,
    format('public.bb_undo_payment(%L::uuid)', v_pu)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_b + 7));
  v_it := pg_temp.t_item(v_r, v_pu);
  perform pg_temp.t_eq('B4b undone on the payment''s day, not hidden', concat_ws('|', v_it ->> 'state', v_it ->> 'amount_cents',
    v_it ->> 'changed_by_name', v_it ->> 'changed_on', v_r #>> '{totals,total_cents}', v_r ->> 'can_close'),
    concat_ws('|', 'undone', '29000', v_an, v_today::text, '0', 'false'));
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B4b ... and not on the day of the undo', (pg_temp.t_item(v_r, v_pu) is null)::text, 'true');
  -- a card refund made two hours ago, undone now by the admin
  v_before := v_r;
  v_ref2 := pg_temp.t_row(v_ke, 'refund', -5000, 'card', v_today, now() - interval '2 hours', v_admin, v_an, null, null, v_s2);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B4b the refund counts first', ((v_r #>> '{refunds,card_cents}')::integer - (v_before #>> '{refunds,card_cents}')::integer)::text,
    '-5000');
  perform pg_temp.t_eq('B4b undo the refund', pg_temp.t_call('authenticated', v_c_a1,
    format('public.bb_undo_payment(%L::uuid)', v_ref2)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  v_it := pg_temp.t_item(v_r, v_ref2);
  perform pg_temp.t_eq('B4b the undone refund: shown undone, not counted; refunds and the card total as before',
    concat_ws('|', v_it ->> 'state', v_it ->> 'kind', v_it ->> 'method', (v_r -> 'refunds')::text, (v_r -> 'totals')::text),
    concat_ws('|', 'undone', 'refund', 'card', (v_before -> 'refunds')::text, (v_before -> 'totals')::text));


  -- ===================================================================
  -- B5. A past day: a cash payment and a CARD refund -> Close the day
  -- expects card money in + card refunds = -$150.00 (v0.814)
  -- ===================================================================
  v_pg := pg_temp.t_row(v_kg, 'payment', 50000, 'cash', v_b + 3, pg_temp.t_at(v_b + 3, '13:00'), v_desk, v_dn, '{p1}', null, v_s2);
  v_pg2 := pg_temp.t_row(v_kg, 'refund', -15000, 'card', v_b + 3, pg_temp.t_at(v_b + 3, '14:00'), v_admin, v_an, null, null, v_s2);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_b + 3));
  perform pg_temp.t_eq('B5 the day', concat_ws('|', v_r #>> '{totals,card,cents}', v_r #>> '{refunds,card_cents}',
    v_r #>> '{refunds,cash_cents}', v_r #>> '{totals,total_cents}', v_r ->> 'can_close'), '0|-15000|0|35000|true');
  -- a card total below 0 is "short / over", not refused, when -$150 is expected
  v_r := pg_temp.t_close(v_c_a1, v_s2, v_b + 3, -1, null);
  perform pg_temp.t_eq('B5 -$0.01 counted while -$150.00 is expected', (v_r ->> 'status') || ' ' || (v_r #>> '{results,card,result}'),
    'note_required over');
  v_r := pg_temp.t_close(v_c_a1, v_s2, v_b + 3, null, null);
  perform pg_temp.t_eq('B5 close with the expected -$150.00', (v_r ->> 'status') || ' ' || (v_r #>> '{results,card,result}'), 'ok matches');
  v_close := (v_r ->> 'closing_id')::uuid;
  perform pg_temp.t_eq('B5 stored: expected and counted card', (select c.expected_card_cents || ' ' || c.card_counted_cents
    from public.finance_day_closings c where c.id = v_close), '-15000 -15000');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_b + 3));
  perform pg_temp.t_eq('B5 closed, matching, not changed', concat_ws('|', v_r #>> '{closing,results,card,result}',
    v_r #>> '{closing,changed_after}', v_r #>> '{closing,expected_card_cents}'), 'matches|false|-15000');


  -- ===================================================================
  -- B10. A closed day with a $2,700 Black Belt check (+ a card total
  -- below 0 refused while the expected card total is not below 0)
  -- ===================================================================
  v_p4 := pg_temp.t_row(v_k4, 'payment', 270000, 'check', v_b + 4, pg_temp.t_at(v_b + 4, '11:00'), v_desk, v_dn, '{p1}', null, v_s2);
  v_r := pg_temp.t_close(v_c_a1, v_s2, v_b + 4, -1, null);
  perform pg_temp.t_eq('B10 a card total below 0 when $0.00 is expected', v_r ->> 'status', 'invalid');
  v_r := pg_temp.t_close(v_c_a1, v_s2, v_b + 4, null, null);
  perform pg_temp.t_eq('B10 close the $2,700 day', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('B10 the snapshot', (select string_agg(ci.source || ':' || ci.kind || ':' || ci.amount_cents || ':' || ci.method
      || ':' || (ci.chain_id = v_p4)::text, ',') from public.finance_day_closing_items ci where ci.closing_id = (v_r ->> 'closing_id')::uuid),
    'black_belt:payment:270000:check:true');
  -- the amount rule allows a Black Belt row's largest amount, $5,000
  insert into public.finance_day_closing_items (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
  values ((v_r ->> 'closing_id')::uuid, v_s2, 'black_belt', gen_random_uuid(), gen_random_uuid(), 'payment', 'check', 500000),
         ((v_r ->> 'closing_id')::uuid, v_s2, 'black_belt', gen_random_uuid(), gen_random_uuid(), 'refund', 'card', -500000);


  -- ===================================================================
  -- B6. A RETURNED check (v0.809)
  -- ===================================================================
  -- the check, handed in on a past day, which is then closed
  v_p := pg_temp.t_row(v_kr, 'payment', 90000, 'check', v_b, pg_temp.t_at(v_b, '16:05'), v_desk, v_dn, '{p2}', null, v_s2);
  perform pg_temp.t_eq('B6 close the check''s day', (pg_temp.t_close(v_c_a1, v_s2, v_b, null, null)) ->> 'status', 'ok');
  v_before := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_b));
  v_before2 := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  -- the bank returns it: Mark check returned (today)
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.bb_mark_check_returned(%L::uuid, %L)', v_p, 'zz secret note 26'));
  perform pg_temp.t_eq('B6 mark the check returned', v_r ->> 'status', 'ok');
  v_ret := (v_r ->> 'payment_id')::uuid;
  -- the check's day: exactly as before, not changed after closing
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_b));
  perform pg_temp.t_eq('B6 the check''s day is exactly as it was', (v_r = v_before)::text, 'true');
  perform pg_temp.t_eq('B6 ... closed, not changed', concat_ws('|', v_r #>> '{closing,changed_after}', v_r #>> '{closing,changed_count}',
    pg_temp.t_item(v_r, v_p) ->> 'state'), 'false|0|counted');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_history(%L, %L)', v_s2, v_b));
  perform pg_temp.t_eq('B6 History: the check''s day stays "closed"', (select e ->> 'tag' from jsonb_array_elements(v_r -> 'days') e
    where e ->> 'day' = v_b::text), 'closed');
  -- the returned day (today)
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  v_it := pg_temp.t_item(v_r, v_ret);
  perform pg_temp.t_eq('B6 the returned line', concat_ws('|', v_it ->> 'source', v_it ->> 'kind', v_it ->> 'amount_cents',
      v_it ->> 'method', v_it ->> 'state', v_it ->> 'day', v_it ->> 'handed_in_on', (v_it -> 'for_items')::text, v_it ->> 'event_name',
      coalesce(v_it ->> 'event_date', '-'), v_it ->> 'recorded_by_name', v_it ->> 'added_after_closing', v_it ->> 'last_name'),
    concat_ws('|', 'black_belt', 'returned', '-90000', 'check', 'counted', v_today::text, v_b::text, '["p2"]', v_cy_name,
      '-', v_an, 'false', 'Bb R'));
  perform pg_temp.t_eq('B6 returned {count, cents}', ((v_r #>> '{returned,count}')::integer - (v_before2 #>> '{returned,count}')::integer)
    || ' ' || ((v_r #>> '{returned,cents}')::integer - (v_before2 #>> '{returned,cents}')::integer), '1 -90000');
  perform pg_temp.t_eq('B6 in the Total (and net) only', ((v_r #>> '{totals,total_cents}')::integer - (v_before2 #>> '{totals,total_cents}')::integer)
    || ' ' || ((v_r #>> '{totals,net_cents}')::integer - (v_before2 #>> '{totals,net_cents}')::integer)
    || ' ' || ((v_r #>> '{totals,in_cents}')::integer - (v_before2 #>> '{totals,in_cents}')::integer), '-90000 -90000 0');
  perform pg_temp.t_eq('B6 not in the cards, the count, the refunds, the fingerprint or can_close',
    pg_temp.t_money(v_r), pg_temp.t_money(v_before2));
  -- the detail of the returned check
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'black_belt', v_ret));
  perform pg_temp.t_eq('B6 detail', concat_ws('|', v_r ->> 'status', v_r #>> '{item,kind}', v_r #>> '{item,handed_in_on}',
      v_r ->> 'event_name', v_r ->> 'event_id', pg_temp.t_hist(v_r),
      v_r #>> '{history,0,by_name}', v_r #>> '{history,0,amount_cents}', v_r #>> '{history,0,paid_on}',
      v_r #>> '{history,1,by_name}', v_r #>> '{history,1,amount_cents}', v_r #>> '{history,1,method}', v_r #>> '{history,1,paid_on}'),
    concat_ws('|', 'ok', 'returned', v_b::text, v_cy_name, v_cy::text, 'returned,recorded',
      v_an, '-90000', v_today::text, v_dn, '90000', 'check', v_b::text));
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'black_belt', v_p));
  perform pg_temp.t_eq('B6 the check''s own detail is unchanged', concat_ws('|', v_r #>> '{item,state}', v_r #>> '{item,day}',
    pg_temp.t_hist(v_r)), 'counted|' || v_b || '|recorded');
  -- the Both summary
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day_both(%L)', v_today));
  v_r2 := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B6 Both: the school''s returned = the day''s', (select (e -> 'returned')::text from jsonb_array_elements(v_r -> 'schools') e
    where e ->> 'code' = v_s2), (v_r2 -> 'returned')::text);
  perform pg_temp.t_eq('B6 Both: together = the schools added up',
    (v_r -> 'returned')::text, (select jsonb_build_object('count', sum((e #>> '{returned,count}')::integer),
                                                          'cents', sum((e #>> '{returned,cents}')::integer))::text
                                  from jsonb_array_elements(v_r -> 'schools') e));
  perform pg_temp.t_eq('B6 Both: the total is the day''s', (select e ->> 'total_cents' from jsonb_array_elements(v_r -> 'schools') e
    where e ->> 'code' = v_s2), v_r2 #>> '{totals,total_cents}');
  -- the export (today, that school)
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_export(%L, %L, %L)', v_s2, v_today, v_today));
  select e into v_it from jsonb_array_elements(v_r -> 'rows') e where e ->> 'last_name' = 'Bb R' and e ->> 'kind' = 'returned';
  perform pg_temp.t_eq('B6 the export row', concat_ws('|', v_it ->> 'what', v_it ->> 'amount_cents', v_it ->> 'counted_cents',
      v_it ->> 'method', v_it ->> 'handed_in_on', (v_it -> 'for_items')::text, v_it ->> 'event_name', coalesce(v_it ->> 'event_date', '-'),
      coalesce(v_it ->> 'note', '-')),
    concat_ws('|', 'black_belt', '-90000', '-90000', 'check', v_b::text, '["p2"]', v_cy_name, '-', '-'));
  select e into v_it from jsonb_array_elements(v_r -> 'rows') e where e ->> 'last_name' = 'Bb F';
  perform pg_temp.t_eq('B6 a payment''s export row', concat_ws('|', v_it ->> 'kind', v_it ->> 'one_payment_plan',
    (v_it -> 'for_items')::text, coalesce(v_it ->> 'handed_in_on', '-')), 'payment|In full|["p1"]|-');
  perform pg_temp.t_eq('B6 only Black Belt export rows carry the extra keys', (select count(*)::text from jsonb_array_elements(v_r -> 'rows') e
    where (e ? 'for_items' or e ? 'one_payment_plan' or e ? 'handed_in_on') and e ->> 'what' <> 'black_belt'), '0');
  -- the desk (staff, today only) may open a check returned TODAY, even
  -- though the check was handed in on an earlier day
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_payment_detail(%L, %L)', 'black_belt', v_ret));
  perform pg_temp.t_eq('B6 the desk: today''s returned check', concat_ws('|', v_r ->> 'status', v_r #>> '{item,kind}',
    v_r #>> '{item,handed_in_on}', v_r #>> '{item,day}'), concat_ws('|', 'ok', 'returned', v_b::text, v_today::text));
  -- the admin's own Undo of the mark at once: a mis-click, hidden
  perform pg_temp.t_eq('B6 undo the mark at once', pg_temp.t_call('authenticated', v_c_a1,
    format('public.bb_undo_payment(%L::uuid)', v_ret)) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B6 a mis-click undo of the mark: gone, the day as before', (pg_temp.t_item(v_r, v_ret) is null)::text
    || ' ' || (v_r -> 'totals')::text || ' ' || (v_r -> 'returned')::text,
    'true ' || (v_before2 -> 'totals')::text || ' ' || (v_before2 -> 'returned')::text);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_b));
  perform pg_temp.t_eq('B6 the check''s day still exactly as it was', (v_r = v_before)::text, 'true');


  -- ===================================================================
  -- B7. The Undo of a returned mark made two hours ago: undone
  -- ===================================================================
  v_p2 := pg_temp.t_row(v_kq, 'payment', 90000, 'check', v_b + 1, pg_temp.t_at(v_b + 1, '10:00'), v_desk, v_dn, '{p2}', null, v_s2);
  perform pg_temp.t_eq('B7 close the check''s day', (pg_temp.t_close(v_c_a1, v_s2, v_b + 1, null, null)) ->> 'status', 'ok');
  v_before := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_b + 1));
  v_before2 := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  v_ret2 := pg_temp.t_row(v_kq, 'returned', -90000, 'check', v_today, now() - interval '2 hours', v_admin, v_an, null, v_p2, null);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.bb_undo_payment(%L::uuid)', v_ret2));
  perform pg_temp.t_eq('B7 undo the returned mark', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  v_it := pg_temp.t_item(v_r, v_ret2);
  perform pg_temp.t_eq('B7 the returned line is undone', concat_ws('|', v_it ->> 'kind', v_it ->> 'state', v_it ->> 'amount_cents',
    v_it ->> 'changed_by_name', v_it ->> 'changed_on', v_it ->> 'handed_in_on', v_it ->> 'added_after_closing'),
    concat_ws('|', 'returned', 'undone', '-90000', v_an, v_today::text, (v_b + 1)::text, 'false'));
  perform pg_temp.t_eq('B7 not counted', (v_r -> 'returned')::text || ' ' || (v_r -> 'totals')::text,
    (v_before2 -> 'returned')::text || ' ' || (v_before2 -> 'totals')::text);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'black_belt', v_ret2));
  perform pg_temp.t_eq('B7 history', pg_temp.t_hist(v_r) || ' ' || (v_r #>> '{history,0,by_name}'), 'returned_undone,returned,recorded ' || v_an);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_b + 1));
  perform pg_temp.t_eq('B7 the check''s closed day: exactly as it was', (v_r = v_before)::text, 'true');
  -- now the check can be corrected - a real money change, so THAT flags the closed day
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.bb_edit_payment(%L::uuid, 80000, %L, %L::text[], null, %L)',
    v_p2, 'cash', '{p2}', 'zz secret reason 26'));
  perform pg_temp.t_eq('B7 edit the check after the undone mark', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_b + 1));
  v_it := pg_temp.t_item(v_r, v_p2);
  perform pg_temp.t_eq('B7 the check is edited, and the closed day changed', concat_ws('|', v_it ->> 'state', v_it ->> 'amount_cents',
    v_it ->> 'method', v_it ->> 'was_amount_cents', v_it ->> 'was_method', v_r #>> '{closing,changed_after}'),
    'edited|80000|cash|90000|check|true');


  -- ===================================================================
  -- B8. A day whose only items are returned checks (needs a school with
  -- nothing today); then a payment, a close, and a check returned after
  -- the close
  -- ===================================================================
  if v_s1 is not null then
    v_p3 := pg_temp.t_row(v_kh, 'payment', 40000, 'check', v_b + 5, pg_temp.t_at(v_b + 5, '10:00'), v_desk, v_dn, '{p1}', null, v_s1);
    v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.bb_mark_check_returned(%L::uuid, null)', v_p3));
    perform pg_temp.t_eq('B8 mark returned', v_r ->> 'status', 'ok');
    v_ret3 := (v_r ->> 'payment_id')::uuid;
    v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s1, v_today));
    perform pg_temp.t_eq('B8 only a returned check: nothing to close', concat_ws('|', jsonb_array_length(v_r -> 'items'),
        v_r ->> 'can_close', v_r #>> '{totals,count}', v_r #>> '{totals,total_cents}', (v_r -> 'returned')::text,
        (v_r ->> 'fingerprint' = md5(''))::text),
      '1|false|0|-40000|{"cents": -40000, "count": 1}|true');
    perform pg_temp.t_eq('B8 Close the day refuses', (pg_temp.t_close(v_c_a1, v_s1, v_today, null, null)) ->> 'status', 'nothing_to_close');
    perform pg_temp.t_eq('B8 the figures count nothing to close (History / Home use them)',
      (select f.item_count || ' ' || f.total_cents from public.finance_figures(v_s1, v_today, v_today) f), '0 -40000');
    v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_history(%L, %L)', v_s1, v_today));
    perform pg_temp.t_eq('B8 History: today open, no unclosed day added', (select e ->> 'tag' from jsonb_array_elements(v_r -> 'days') e
      where e ->> 'day' = v_today::text), 'today_open');
    -- a real payment; the close's snapshot has no returned check
    v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.bb_record_payment(%L::uuid, %s, 10000, %L, %L::text[], null)',
      v_kh, pg_temp.t_ver(v_kh), 'cash', '{p2}'));
    perform pg_temp.t_eq('B8 a payment today', v_r ->> 'status', 'ok');
    v_r := pg_temp.t_close(v_c_d1, v_s1, v_today, null, null);
    perform pg_temp.t_eq('B8 the desk closes today', v_r ->> 'status', 'ok');
    perform pg_temp.t_eq('B8 the snapshot: the payment only', (select string_agg(ci.kind || ':' || ci.amount_cents, ',')
      from public.finance_day_closing_items ci where ci.closing_id = (v_r ->> 'closing_id')::uuid), 'payment:10000');
    perform pg_temp.t_eq('B8 expected count 1', (select c.expected_count::text from public.finance_day_closings c
      where c.id = (v_r ->> 'closing_id')::uuid), '1');
    -- another check returned AFTER the close: not "changed after closing"
    v_p5 := pg_temp.t_row(v_kh, 'payment', 30000, 'check', v_b + 6, pg_temp.t_at(v_b + 6, '10:00'), v_desk, v_dn, '{p3}', null, v_s1);
    v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.bb_mark_check_returned(%L::uuid, null)', v_p5));
    v_ret5 := (v_r ->> 'payment_id')::uuid;
    v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s1, v_today));
    perform pg_temp.t_eq('B8 a check returned after the close: not changed', concat_ws('|', v_r #>> '{closing,changed_after}',
      v_r #>> '{closing,changed_count}', v_r #>> '{returned,count}', pg_temp.t_item(v_r, v_ret5) ->> 'added_after_closing'),
      'false|0|2|false');
    perform pg_temp.t_eq('B8 its mis-click undo: still not changed', pg_temp.t_call('authenticated', v_c_a1,
      format('public.bb_undo_payment(%L::uuid)', v_ret5)) ->> 'status', 'ok');
    v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s1, v_today));
    perform pg_temp.t_eq('B8 ... changed_after', (v_r #>> '{closing,changed_after}') || ' ' || (v_r #>> '{returned,count}'), 'false 1');
  end if;


  -- ===================================================================
  -- B3b. The cycle is renamed after a payment: every line keeps the name
  -- it was recorded with (bb_payments.cycle_name)
  -- ===================================================================
  v_old_name := v_cy_name;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.bb_update_cycle(%L::uuid, %s, %L::jsonb)', v_cy,
    (select y.version from public.bb_cycles y where y.id = v_cy),
    jsonb_set(pg_temp.t_current(v_cy), '{name}', to_jsonb(v_tag || ' Renamed'))));
  perform pg_temp.t_eq('B3b rename the cycle', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B3b the line keeps the old cycle name', pg_temp.t_item(v_r, v_pa) ->> 'event_name', v_old_name);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'black_belt', v_pa));
  perform pg_temp.t_eq('B3b ... in the detail too (event_id still the cycle)', concat_ws('|', v_r ->> 'event_name',
    v_r #>> '{item,event_name}', v_r ->> 'event_id'), concat_ws('|', v_old_name, v_old_name, v_cy::text));
  select y.name into v_cy_name from public.bb_cycles y where y.id = v_cy;
  perform pg_temp.t_eq('B3b the cycle really has its new name', v_cy_name, v_tag || ' Renamed');


  -- ===================================================================
  -- B4c. one_payment_plan follows the candidate's CURRENT plan; a payment
  -- for two items lists both
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.bb_record_payment(%L::uuid, %s, 29000, %L, %L::text[], null)',
    v_kp, pg_temp.t_ver(v_kp), 'cash', '{p1}'));
  v_pp := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B4c {p1} on "3 payments": no one-payment plan', coalesce(pg_temp.t_item(v_r, v_pp) ->> 'one_payment_plan', 'null')
    || ' ' || (pg_temp.t_item(v_r, v_pp) -> 'for_items')::text, 'null ["p1"]');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.bb_change_plan(%L::uuid, %s, %L::uuid, false)',
    v_kp, pg_temp.t_ver(v_kp), v_full));
  perform pg_temp.t_eq('B4c change the plan to "In full" (admin)', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B4c ... now the line names the one-payment plan', pg_temp.t_item(v_r, v_pp) ->> 'one_payment_plan', 'In full');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.bb_record_payment(%L::uuid, %s, 39000, %L, %L::text[], null)',
    v_kw, pg_temp.t_ver(v_kw), 'check', '{p1,kukkiwon}'));
  perform pg_temp.t_eq('B4c record a payment for Payment 1 + Kukkiwon', v_r ->> 'status', 'ok');
  v_pw := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_day(%L, %L)', v_s2, v_today));
  perform pg_temp.t_eq('B4c both items come back', (pg_temp.t_item(v_r, v_pw) -> 'for_items')::text, '["p1", "kukkiwon"]');


  -- ===================================================================
  -- B9. Staff see today only
  -- ===================================================================
  perform pg_temp.t_eq('B9 the desk: a past Black Belt payment''s detail', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_payment_detail(%L, %L)', 'black_belt', v_p)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('B9 the desk: a past day', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_day(%L, %L)', v_s2, v_b)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('B9 the desk: today''s refund detail', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_payment_detail(%L, %L)', 'black_belt', v_pref)) ->> 'status', 'ok');
  perform pg_temp.t_eq('B9 the desk: an earlier day''s Both summary', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_day_both(%L)', v_b)) ->> 'status', 'not_allowed');
  -- a check returned on an EARLIER day (written with 0016's guard switched
  -- off for this one row - the guard dates returned rows today; the
  -- rollback undoes the switch too): the desk may not open it, an admin may
  v_p6 := pg_temp.t_row(v_kt, 'payment', 20000, 'check', v_b + 8, pg_temp.t_at(v_b + 8, '10:00'), v_desk, v_dn, '{p1}', null, v_s2);
  alter table public.bb_payments disable trigger bb_payments_guard;
  v_ret6 := pg_temp.t_row(v_kt, 'returned', -20000, 'check', v_b + 9, pg_temp.t_at(v_b + 9, '10:00'), v_admin, v_an, null, v_p6, null);
  alter table public.bb_payments enable trigger bb_payments_guard;
  perform pg_temp.t_eq('B9 the desk: a check returned on an earlier day', pg_temp.t_call('authenticated', v_c_d1,
    format('public.finance_payment_detail(%L, %L)', 'black_belt', v_ret6)) ->> 'status', 'not_allowed');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.finance_payment_detail(%L, %L)', 'black_belt', v_ret6));
  perform pg_temp.t_eq('B9 ... an admin may', concat_ws('|', v_r ->> 'status', v_r #>> '{item,day}', v_r #>> '{item,handed_in_on}'),
    concat_ws('|', 'ok', (v_b + 9)::text, (v_b + 8)::text));
  perform pg_temp.t_eq('B9 an unknown id',pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_payment_detail(%L, %L)', 'black_belt', gen_random_uuid())) ->> 'status', 'not_found');
  perform pg_temp.t_eq('B9 a Star id asked as Black Belt', pg_temp.t_call('authenticated', v_c_a1,
    format('public.finance_payment_detail(%L, %L)', 'star', v_pa)) ->> 'status', 'not_found');


  -- ===================================================================
  -- B11. Privacy and catalog
  -- ===================================================================
  select string_agg(distinct k, ', ') into v_txt
    from t_answers a, lateral pg_temp.t_keys(a.r) as k
   where a.fn like 'public.finance\_%' and not (k = any (v_allowed_keys));
  if v_txt is not null then
    raise exception 'TEST FAILED: B11 keys not on the allowed list: %', v_txt;
  end if;
  if exists (select 1 from t_answers a where a.fn like 'public.finance\_%'
              and (a.r::text like '%' || v_admin::text || '%' or a.r::text like '%' || v_desk::text || '%'
                   or a.r::text like '%zz secret%' or a.r::text like '%' || v_mail_tag || '%'
                   or a.r::text like '%' || v_dob::text || '%')) then
    raise exception 'TEST FAILED: B11 a login id, note, reason, email or date of birth appeared in a Finance answer';
  end if;
  select count(*) into v_n from t_answers a where a.fn like 'public.finance\_%';
  if v_n < 40 then
    raise exception 'TEST FAILED: B11 only % Finance answers were checked', v_n;
  end if;
  for v_fn in
    select p.proname, p.prosecdef, p.proconfig,
           coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' order by 1)
                       from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee <> p.proowner), '') as rights
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_replaced)
  loop
    if not coalesce('search_path=""' = any (v_fn.proconfig), false)
       or v_fn.prosecdef <> (v_fn.proname = any (v_app_fns))
       or v_fn.rights <> (case when v_fn.proname = any (v_app_fns) then 'authenticated:EXECUTE' else '' end) then
      raise exception 'TEST FAILED: B11 % (definer %, rights "%")', v_fn.proname, v_fn.prosecdef, v_fn.rights;
    end if;
  end loop;
  perform pg_temp.t_eq('B11 nine replaced functions, once each', (select count(*)::text from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any (v_replaced)), '9');
  -- the Black Belt reads (aliases bp / bk / bc / pl / r / k) never touch a
  -- login id, a note, a reason, a date of birth or an email
  perform pg_temp.t_eq('B11 no replaced function reads a Black Belt login id, note, reason, date of birth or email',
    (select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any (v_replaced)
        and p.prosrc ~* '\m(bp|bk|bc|pl|r|k)\.(recorded_by|note|reason|date_of_birth|email_for_results)\M'), '');
  -- ... and inside every Black Belt (0026) block, whatever the alias: no
  -- note, reason, date of birth or email is read at all (the chain helper's
  -- block reads p.recorded_by only to compare logins, as 0011 does)
  select count(*), coalesce(string_agg(p.proname, ',') filter (where m.b[1] ~* '\m[a-z]+\.(note|reason|date_of_birth|email_for_results)\M'), '')
    into v_n, v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
         lateral regexp_matches(p.prosrc, '-- ===== source: black belt \(0026\) =====(.*?)-- ===== end black belt =====', 'g') as m(b)
   where n.nspname = 'public' and p.proname = any (v_replaced);
  perform pg_temp.t_eq('B11 no Black Belt block reads a note, reason, date of birth or email', v_txt, '');
  if v_n < 20 then
    raise exception 'TEST FAILED: B11 only % Black Belt blocks were found in the replaced functions', v_n;
  end if;
  perform pg_temp.t_eq('B11 the closing items source rule', (select pg_get_constraintdef(c.oid) from pg_constraint c
    where c.conname = 'finance_day_closing_items_source_check'),
    'CHECK ((source = ANY (ARRAY[''color_belt''::text, ''star''::text, ''camp''::text, ''black_belt''::text])))');
end;
$$;

select 'ALL 0026 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
