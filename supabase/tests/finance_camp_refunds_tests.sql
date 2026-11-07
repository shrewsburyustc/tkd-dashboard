-- =====================================================================
-- finance_camp_refunds_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Finance's R1-05 (design review, rolling check pass 1): proof that the
--   LIVE Finance functions (0026's versions) already handle a camp refund
--   - Camps' migration 0039 adds kind 'refund' to camp_payments (money
--   handed back, a negative amount, at the desk that hands it back,
--   rulebook v1.039 / v1.040). Finance needs no migration of its own when
--   every check here passes. It checks:
--     F1  the Daily report of the school that HANDED THE MONEY BACK (not
--         the school that took the payment): the refund's line (source
--         camp, kind refund, the camper's name, the camp's name, counted)
--         and the Refunds figures (count, cents, cash / check / card
--         parts); the total is after refunds
--     F2  a refund undone a day later (more than 10 seconds after it, so
--         not a mis-click): shown "undone" on its own day, not counted;
--         the day of the Undo has nothing. F2b: a CHECK refund that counts
--         (the Refunds check part)
--     F3  Close the day expects cash in minus cash refunded; the close
--         matches; History shows the closed day with the total after
--         refunds; the Both-schools summary puts each school's total after
--         its own refunds
--     F4  Export: the refund's row (kind refund, counted, the camp name)
--     F5  the payment detail: kind refund, history "refunded"
--     F6  a refund undone AFTER the day was closed: the day shows
--         "changed after closing" (the close's snapshot held the refund),
--         the line is undone, the detail's history "undone, refunded",
--         History tags the day changed after closing with the new total
--     F7  the REAL writer (camp_record_refund, 0039) today: the refund
--         lands on today's report of the school given, not the payment's
--         school; the admin's own camp_undo_refund right away is a
--         mis-click and hides it again
--     F8  privacy: every key in every answer is on Finance's fixed list
--   The past-day rows (July 2021, no real data there) are written straight
--   into camp_payments, as 0017_tests.sql does; F7 uses the real 0039
--   functions.
--
-- IS IT SAFE?
--   Yes. One transaction ending with ROLLBACK. NEVER change the final
--   "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   0013, 0017, 0018, 0026, 0033, 0043 and 0039 are applied. Replace
--   <paste-admin-UID-here> (Authentication -> Users) and run the whole
--   file in the SQL Editor. Passed: one row "ALL FINANCE CAMP REFUND TESTS
--   PASSED". Failed: "TEST FAILED: ..." / "TEST SETUP: ..."; nothing was
--   saved. If it failed, run   rollback;   on its own once.
-- =====================================================================

begin;

-- every answer a Finance function gave (for F8)
create temp table t_answers (fn text, r jsonb);

-- t_call(login token, call): ONE call as role authenticated with that
-- login, then back to the SQL Editor's role. Returns the answer.
create function pg_temp.t_call(p_claims text, p_call text)
returns jsonb
language plpgsql
as $$
declare
  v_r jsonb;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  set local role authenticated;
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

-- t_item(day answer, payment id): that chain's line on the day (or NULL)
create function pg_temp.t_item(p_day jsonb, p_payment uuid)
returns jsonb
language sql
as $$
  select e from jsonb_array_elements(p_day -> 'items') e where e ->> 'payment_id' = p_payment::text limit 1;
$$;

-- t_ref(day answer): the Refunds figures as one line
create function pg_temp.t_ref(p_day jsonb)
returns text
language sql
as $$
  select concat_ws('|', p_day #>> '{refunds,count}', p_day #>> '{refunds,cents}', p_day #>> '{refunds,cash_cents}',
                   p_day #>> '{refunds,check_cents}', p_day #>> '{refunds,card_cents}');
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
  -- >>> EDIT THIS LINE <<<
  v_admin uuid := '<paste-admin-UID-here>';

  v_a1 uuid := gen_random_uuid();
  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text;

  v_tag   text := 'zz fin r105 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_d     date := date '2021-07-12';   -- this test's own past days
  v_d2    date := date '2021-07-13';
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  v_an    text;
  v_role  text;
  v_t     timestamptz;

  v_r      jsonb;
  v_r2     jsonb;
  v_before jsonb;
  v_beforw jsonb;
  v_it     jsonb;
  v_camp   uuid;
  v_code   text;
  v_day    uuid;
  v_ann uuid; v_bo uuid; v_cy uuid; v_dee uuid;
  v_p_ann uuid; v_ref_ann uuid; v_p_bo uuid; v_ref_bo uuid; v_ref_bo2 uuid; v_p_cy uuid; v_p_dee uuid; v_ref_dee uuid;
  v_bad text;

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
    'returned', 'for_items', 'one_payment_plan', 'handed_in_on', 'camp_days'];
begin
  -- ===================================================================
  -- Setup (as the SQL Editor's role)
  -- ===================================================================
  select s.role, s.full_name into v_role, v_an from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  if to_regprocedure('public.camp_record_refund(uuid, integer, text, integer, date, text)') is null
     or to_regprocedure('public.camp_undo_refund(uuid)') is null then
    raise exception 'TEST SETUP: Camps'' 0039 (Record refund) must be applied first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'finance_chain_steps_core'
                    and position('source: black belt (0026)' in p.prosrc) > 0) then
    raise exception 'TEST SETUP: Finance up to 0026 must be applied first';
  end if;
  if exists (select 1 from public.testing_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.star_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.camp_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.testing_private_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.bb_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.finance_day_closings c where c.day between v_d - 5 and v_d + 5) then
    raise exception 'TEST SETUP: there are payments or closes dated around % already; this test needs those days empty', v_d;
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values (v_a1, v_admin, now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;

  -- a both-schools camp HELD AT Worcester (one day, 10 days from now), $75 a camper
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.camp_add_camp('worcester', true, v_tag, array[v_today + 10], '09:00', '15:00', v_today - 1, v_today + 5,
           v_today + 5, 5, 12,
           '[{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000, "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000}]',
           '[]', null, 'I agree to the camp rules.');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: camp_add_camp answered %', v_r; end if;
  v_camp := (v_r ->> 'id')::uuid;
  v_code := v_r ->> 'public_code';
  select d.id into v_day from public.camp_days d where d.camp_id = v_camp;
  -- four campers in two family sign-ups (as the family form; it runs as its owner)
  perform set_config('request.jwt.claims', '', true);
  foreach v_bad in array array['Ann,Bo', 'Cy,Dee'] loop
    v_r := public.camp_public_signup(v_code, v_tag || ' key', gen_random_uuid(),
             (select jsonb_agg(jsonb_build_object('first_name', x, 'last_name', 'Refund', 'age', 8, 'member', true,
                                                  'day_ids', jsonb_build_array(v_day), 'extras', '[]'::jsonb) order by n)
                from unnest(string_to_array(v_bad, ',')) with ordinality as u(x, n)),
             'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig,
             'camp-2026-10-18', md5('I agree to the camp rules.'), 15000);
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: camp_public_signup (%) answered %', v_bad, v_r; end if;
  end loop;
  v_bad := null;
  select c.id into v_ann from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Ann';
  select c.id into v_bo  from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Bo';
  select c.id into v_cy  from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Cy';
  select c.id into v_dee from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Dee';

  -- Rows on July 12 / 13 / 14 2021, written as the camp functions write
  -- them. (They are dated before the family signed up, which the real
  -- camp_record_refund would refuse; Finance never reads the sign-up date,
  -- so it changes nothing here. F7 uses the real functions on today.)
  --   Ann  $100 cash at Worcester (overpaid $25); $25 cash handed back at
  --        SHREWSBURY the same afternoon (the desk that hands it back)
  --   Bo   $90 check at Worcester; $15 check refunded at Worcester, undone
  --        by the admin the next day
  --   Cy   $60 cash at Shrewsbury (so Shrewsbury's drawer holds money)
  --   Bo   (F2b) $10 check refunded at Worcester on July 14, which counts
  perform set_config('tkd.actor_label', 'PGlite finance camp refund test', true);
  v_t := (v_d + time '10:00') at time zone 'America/New_York';
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_ann, 'payment', 10000, 'cash', v_d, 'worcester', v_t, v_admin, v_an) returning id into v_p_ann;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_ann, 'refund', -2500, 'cash', v_d, 'shrewsbury', v_t + interval '5 hours', v_admin, v_an) returning id into v_ref_ann;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_bo, 'payment', 9000, 'check', v_d, 'worcester', v_t + interval '1 hour', v_admin, v_an) returning id into v_p_bo;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_bo, 'refund', -1500, 'check', v_d, 'worcester', v_t + interval '2 hours', v_admin, v_an) returning id into v_ref_bo;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_bo, 'reversal', 1500, 'check', v_d2, 'worcester', v_t + interval '1 day', v_admin, v_an, v_ref_bo);
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_cy, 'payment', 6000, 'cash', v_d, 'shrewsbury', v_t + interval '3 hours', v_admin, v_an) returning id into v_p_cy;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_bo, 'refund', -1000, 'check', v_d + 2, 'worcester', v_t + interval '2 days', v_admin, v_an) returning id into v_ref_bo2;
  perform set_config('tkd.actor_label', '', true);


  -- ===================================================================
  -- F1. Shrewsbury, July 12: the refund counts at the desk that handed
  -- the money back
  -- ===================================================================
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('F1 finance_day', v_r ->> 'status', 'ok');
  v_it := pg_temp.t_item(v_r, v_ref_ann);
  perform pg_temp.t_eq('F1 the refund line (source, kind, way, amount, state, name, what, camp, by)',
    concat_ws('|', v_it ->> 'source', v_it ->> 'kind', v_it ->> 'method', v_it ->> 'amount_cents', v_it ->> 'state',
              v_it ->> 'first_name', v_it ->> 'last_name', v_it ->> 'what', v_it ->> 'event_name', v_it ->> 'recorded_by_name'),
    concat_ws('|', 'camp', 'refund', 'cash', '-2500', 'counted', 'Ann', 'Refund', 'camp', v_tag, v_an));
  perform pg_temp.t_eq('F1 Refunds: count | cents | cash | check | card', pg_temp.t_ref(v_r), '1|-2500|-2500|0|0');
  perform pg_temp.t_eq('F1 money in: count | cash | check | card (the refund is not money in)',
    concat_ws('|', v_r #>> '{totals,count}', v_r #>> '{totals,cash,cents}', v_r #>> '{totals,check,cents}', v_r #>> '{totals,card,cents}'),
    '1|6000|0|0');
  perform pg_temp.t_eq('F1 the total is after refunds', v_r #>> '{totals,total_cents}', '3500');
  perform pg_temp.t_eq('F1 two lines, can close', concat_ws('|', jsonb_array_length(v_r -> 'items'), v_r ->> 'can_close'), '2|true');

  -- ===================================================================
  -- F2. Worcester: Ann's payment counts there, NOT her refund; Bo's
  -- refund undone the next day is shown undone and not counted
  -- ===================================================================
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('F2 Ann''s refund is not on Worcester''s day', (pg_temp.t_item(v_r, v_ref_ann) is null)::text, 'true');
  v_it := pg_temp.t_item(v_r, v_ref_bo);
  perform pg_temp.t_eq('F2 Bo''s undone refund: kind, state, who undid it',
    concat_ws('|', v_it ->> 'kind', v_it ->> 'method', v_it ->> 'amount_cents', v_it ->> 'state', v_it ->> 'changed_by_name'),
    concat_ws('|', 'refund', 'check', '-1500', 'undone', v_an));
  perform pg_temp.t_eq('F2 Worcester Refunds: nothing counted', pg_temp.t_ref(v_r), '0|0|0|0|0');
  perform pg_temp.t_eq('F2 Worcester money in: count | cash | check | total',
    concat_ws('|', v_r #>> '{totals,count}', v_r #>> '{totals,cash,cents}', v_r #>> '{totals,check,cents}', v_r #>> '{totals,total_cents}'),
    '2|10000|9000|19000');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d2));
  perform pg_temp.t_eq('F2 Worcester July 13 (the day of the Undo): nothing counts',
    concat_ws('|', pg_temp.t_ref(v_r), v_r #>> '{totals,count}', v_r #>> '{totals,total_cents}', v_r ->> 'can_close'), '0|0|0|0|0|0|0|false');

  -- F2b. Worcester, July 14: a check refund that counts
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d + 2));
  perform pg_temp.t_eq('F2b the check refund line', concat_ws('|', pg_temp.t_item(v_r, v_ref_bo2) ->> 'kind',
    pg_temp.t_item(v_r, v_ref_bo2) ->> 'method', pg_temp.t_item(v_r, v_ref_bo2) ->> 'state'), 'refund|check|counted');
  perform pg_temp.t_eq('F2b Refunds: count | cents | cash | check | card', pg_temp.t_ref(v_r), '1|-1000|0|-1000|0');
  perform pg_temp.t_eq('F2b the total is after refunds', v_r #>> '{totals,total_cents}', '-1000');

  -- ===================================================================
  -- F3. Close Shrewsbury, July 12: expected cash = $60 in - $25 refunded
  -- ===================================================================
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  v_r2 := pg_temp.t_call(v_c_a1, format('public.finance_close_day(%L, %L, %L, %s, %s, %s, %s, %L)',
    'shrewsbury', v_d, v_r ->> 'fingerprint', 3500, 0, 0, 0, null));
  perform pg_temp.t_eq('F3 close with $35.00 cash counted', v_r2 ->> 'status', 'ok');
  perform pg_temp.t_eq('F3 the cash matches', v_r2 #>> '{results,cash,result}', 'matches');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('F3 the close expected 2 lines and $35.00 cash; not changed after',
    concat_ws('|', v_r #>> '{closing,expected_count}', v_r #>> '{closing,expected_cash_cents}', v_r #>> '{closing,changed_after}'),
    '2|3500|false');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_history(%L, %L)', 'shrewsbury', date '2021-07-01'));
  perform pg_temp.t_eq('F3 History', v_r ->> 'status', 'ok');
  select e into v_it from jsonb_array_elements(v_r -> 'days') e where (e ->> 'day')::date = v_d;
  -- (History's count is payments only - a refund is never counted there,
  -- for any section; its total is after refunds)
  perform pg_temp.t_eq('F3 History: the closed day, total after refunds, 1 payment, closed (no short / over)',
    concat_ws('|', v_it ->> 'total_cents', v_it ->> 'count', v_it ->> 'tag', v_it ->> 'closed_by_name'),
    concat_ws('|', '3500', '1', 'closed', v_an));

  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day_both(%L)', v_d));
  perform pg_temp.t_eq('F3 Both schools: status | Worcester total | Shrewsbury total | both',
    concat_ws('|', v_r ->> 'status',
      (select e ->> 'total_cents' from jsonb_array_elements(v_r -> 'schools') e where e ->> 'code' = 'worcester'),
      (select e ->> 'total_cents' from jsonb_array_elements(v_r -> 'schools') e where e ->> 'code' = 'shrewsbury'),
      v_r ->> 'total_cents'),
    'ok|19000|3500|22500');

  -- ===================================================================
  -- F4. Export: the refund's row
  -- ===================================================================
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'shrewsbury', v_d, v_d));
  perform pg_temp.t_eq('F4 finance_export', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('F4 two rows', jsonb_array_length(v_r -> 'rows')::text, '2');
  select e into v_it from jsonb_array_elements(v_r -> 'rows') e where e ->> 'kind' = 'refund';
  perform pg_temp.t_eq('F4 the refund row (kind, way, amount, counted, name, what, camp, school, day)',
    concat_ws('|', v_it ->> 'kind', v_it ->> 'method', v_it ->> 'amount_cents', v_it ->> 'counted_cents', v_it ->> 'first_name',
              v_it ->> 'what', v_it ->> 'event_name', v_it ->> 'school', v_it ->> 'day'),
    concat_ws('|', 'refund', 'cash', '-2500', '-2500', 'Ann', 'camp', v_tag, 'shrewsbury', v_d));

  -- ===================================================================
  -- F5. The payment detail
  -- ===================================================================
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L::uuid)', 'camp', v_ref_ann));
  perform pg_temp.t_eq('F5 detail: status, kind, amount, state',
    concat_ws('|', v_r ->> 'status', v_r #>> '{item,kind}', v_r #>> '{item,amount_cents}', v_r #>> '{item,state}'),
    'ok|refund|-2500|counted');
  perform pg_temp.t_eq('F5 detail history',
    (select string_agg(e ->> 'what', ',' order by n) from jsonb_array_elements(v_r -> 'history') with ordinality as x(e, n)), 'refunded');

  -- ===================================================================
  -- F6. Ann's refund undone AFTER the close (by the admin, a day later)
  -- ===================================================================
  perform set_config('tkd.actor_label', 'PGlite finance camp refund test', true);
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_ann, 'reversal', 2500, 'cash', v_d2, 'shrewsbury', v_t + interval '1 day', v_admin, v_an, v_ref_ann);
  perform set_config('tkd.actor_label', '', true);
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('F6 the line is undone; Refunds back to 0; the day changed after closing (1 line)',
    concat_ws('|', pg_temp.t_item(v_r, v_ref_ann) ->> 'state', pg_temp.t_ref(v_r), v_r #>> '{closing,changed_after}', v_r #>> '{closing,changed_count}'),
    'undone|0|0|0|0|0|true|1');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L::uuid)', 'camp', v_ref_ann));
  perform pg_temp.t_eq('F6 detail history (newest first)',
    (select string_agg(e ->> 'what', ',' order by n) from jsonb_array_elements(v_r -> 'history') with ordinality as x(e, n)), 'undone,refunded');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_history(%L, %L)', 'shrewsbury', date '2021-07-01'));
  select e into v_it from jsonb_array_elements(v_r -> 'days') e where (e ->> 'day')::date = v_d;
  perform pg_temp.t_eq('F6 History: changed after closing, total now $60.00',
    concat_ws('|', v_it ->> 'tag', v_it ->> 'total_cents'), 'changed_after_closing|6000');

  -- ===================================================================
  -- F7. The real writer today: Dee paid $100 at Worcester two hours ago
  -- (overpaid $25); the admin hands $25 back at Shrewsbury
  -- ===================================================================
  perform set_config('tkd.actor_label', 'PGlite finance camp refund test', true);
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_dee, 'payment', 10000, 'cash', v_today, 'worcester', now() - interval '2 hours', v_admin, v_an) returning id into v_p_dee;
  perform set_config('tkd.actor_label', '', true);
  v_before := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  v_beforw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  v_r := pg_temp.t_call(v_c_a1, format('public.camp_record_refund(%L::uuid, %s, %L, %s, %L::date, %L)',
    v_dee, (select c.version from public.camp_campers c where c.id = v_dee), 'cash', 2500, v_today, 'shrewsbury'));
  perform pg_temp.t_eq('F7 camp_record_refund', v_r ->> 'status', 'ok');
  v_ref_dee := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  perform pg_temp.t_eq('F7 today at Shrewsbury: one more refund of $25.00 cash',
    concat_ws('|', (v_r #>> '{refunds,count}')::integer - (v_before #>> '{refunds,count}')::integer,
                   (v_r #>> '{refunds,cents}')::integer - (v_before #>> '{refunds,cents}')::integer,
                   (v_r #>> '{refunds,cash_cents}')::integer - (v_before #>> '{refunds,cash_cents}')::integer,
                   (v_r #>> '{totals,total_cents}')::integer - (v_before #>> '{totals,total_cents}')::integer),
    '1|-2500|-2500|-2500');
  v_it := pg_temp.t_item(v_r, v_ref_dee);
  perform pg_temp.t_eq('F7 the line', concat_ws('|', v_it ->> 'source', v_it ->> 'kind', v_it ->> 'amount_cents', v_it ->> 'state', v_it ->> 'first_name'),
    'camp|refund|-2500|counted|Dee');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('F7 today at Worcester: Refunds unchanged', pg_temp.t_ref(v_r), pg_temp.t_ref(v_beforw));
  v_r := pg_temp.t_call(v_c_a1, format('public.camp_undo_refund(%L::uuid)', v_ref_dee));
  perform pg_temp.t_eq('F7 camp_undo_refund at once', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  perform pg_temp.t_eq('F7 the admin''s own Undo at once is a mis-click: hidden, Refunds as before',
    concat_ws('|', (pg_temp.t_item(v_r, v_ref_dee) is null)::text, pg_temp.t_ref(v_r), v_r #>> '{totals,total_cents}'),
    concat_ws('|', 'true', pg_temp.t_ref(v_before), v_before #>> '{totals,total_cents}'));

  -- ===================================================================
  -- F8. Privacy: every key in every Finance answer is on the fixed list
  -- ===================================================================
  select string_agg(distinct k, ', ') into v_bad
    from t_answers a, lateral pg_temp.t_keys(a.r) as k
   where a.fn like 'public.finance%' and k <> all (v_allowed_keys);
  perform pg_temp.t_eq('F8 keys not on Finance''s list', coalesce(v_bad, ''), '');
end
$$;

select 'ALL FINANCE CAMP REFUND TESTS PASSED' as result;

rollback;
