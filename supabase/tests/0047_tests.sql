-- =====================================================================
-- 0047_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The tests for migration 0047 (Finance: lines count at the school STORED
--   ON THE PAYMENT, and was_school). It checks:
--     S1  a Star payment taken at Worcester for a candidate registered at
--         Shrewsbury counts on WORCESTER's report (and in its export), not
--         Shrewsbury's
--     S2  a Star REFUND handed back at Shrewsbury for a Worcester candidate
--         counts on SHREWSBURY's report: its Refunds figures and its total
--     S3  a Color Belt EVENT payment taken at Shrewsbury for a Worcester
--         event counts on Shrewsbury's report
--     S4  a Color Belt PRIVATE testing payment taken at Worcester for a
--         Shrewsbury private testing counts on Worcester's report, still
--         marked private
--     S5  a payment with no stored school (as before 0038 / 0044) keeps the
--         candidate's school
--     S6  the day totals and counts add up per school
--     W1  was_school: a Star edit that moved the payment from Worcester to
--         Shrewsbury -> the edited line on Shrewsbury says was_school
--         'worcester' (Daily report, payment detail and export); nothing is
--         left on Worcester's report
--     W2  an edit at the same school -> was_school is null (the key is
--         there); plain lines carry the key as null
--     W3  an edit that moved the payment to ANOTHER DAY and another school
--         ('moved_in'): was_school on the moved-in line; the old day shows
--         the 'moved_out' line at the school the first payment was taken at
--     W4  the same for a Color Belt EVENT payment (the other table)
--     K   privacy: every key in every Finance answer is on the fixed list
--     C   the five replaced functions: security, search path, who may run
--         them, and the result table of the two internal ones
--   Camps and Black Belt already counted at the school stored on their
--   payments (0017 / 0026); their tests (0017, 0026, finance camp refunds)
--   run again after 0047 in run.mjs step0047.
--   The money rows (September 2021, no real data there) are written straight
--   into the payment tables, as 0018_tests.sql does; the class, rank,
--   event and private testing are made with the real functions.
--
-- IS IT SAFE?
--   Yes. One transaction ending with ROLLBACK. NEVER change the final
--   "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   Star's 0038, Color Belt's 0044 and 0047 are applied. Replace
--   <paste-admin-UID-here> (Authentication -> Users) and run the whole file
--   in the SQL Editor. Passed: one row "ALL 0047 TESTS PASSED". Failed:
--   "TEST FAILED: ..." / "TEST SETUP: ..."; nothing was saved. If it failed,
--   run   rollback;   on its own once.
-- =====================================================================

begin;

-- every answer a Finance function gave (for K)
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

-- t_mine(day answer, last name): that student's lines on the day as
-- "state:was_school:amount:is_private" (was_school '-' when null), sorted
create function pg_temp.t_mine(p_day jsonb, p_last text)
returns text
language sql
as $$
  select coalesce(string_agg((e ->> 'state') || ':' || coalesce(e ->> 'was_school', '-') || ':' || (e ->> 'amount_cents')
                             || ':' || (e ->> 'is_private'), ','
                             order by ((e ->> 'state') || ':' || coalesce(e ->> 'was_school', '-') || ':' || (e ->> 'amount_cents'))
                                       collate "C"), '')
    from jsonb_array_elements(p_day -> 'items') e
   where e ->> 'last_name' = p_last;
$$;

-- t_names(day answer): every last name on the day's list, sorted
create function pg_temp.t_names(p_day jsonb)
returns text
language sql
as $$
  select coalesce(string_agg(distinct e ->> 'last_name', ',' order by e ->> 'last_name'), '')
    from jsonb_array_elements(p_day -> 'items') e;
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

  v_tag   text := 'zz fin47 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_d     date := date '2021-09-13';   -- this test's own past days: v_d .. v_d + 2
  v_an    text;
  v_role  text;
  v_t     timestamptz;

  v_r      jsonb;
  v_rw     jsonb;
  v_rs     jsonb;
  v_rw1    jsonb;
  v_rs1    jsonb;
  v_it     jsonb;
  v_txt    text;
  v_bad    text;
  v_cls_w uuid; v_rank_w uuid; v_cls_s uuid; v_rank_s uuid; v_ev uuid; v_er uuid; v_sev uuid;
  v_reg    uuid;
  v_priv   uuid;
  v_c_shr  uuid; v_c_ref uuid; v_c_null uuid; v_c_edit uuid; v_c_same uuid; v_c_move uuid; v_reg2 uuid;
  v_p1     uuid; v_p2     uuid; v_p3 uuid; v_p4 uuid; v_n1 uuid;
  v_null_ok boolean := true;

  v_allowed_keys text[] := array[
    'status', 'day', 'school', 'fingerprint', 'totals', 'count', 'total_cents', 'in_cents', 'net_cents',
    'cash', 'check', 'card', 'cents', 'refunds', 'cash_cents', 'check_cents', 'card_cents', 'items', 'source',
    'payment_id', 'time', 'first_name', 'last_name', 'what', 'event_date', 'is_private', 'kind', 'method',
    'amount_cents', 'state', 'was_amount_cents', 'was_method', 'was_school', 'moved_to', 'moved_from', 'changed_by_name',
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
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'star_payments' and column_name = 'school')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'testing_payments' and column_name = 'school')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'testing_private_payments' and column_name = 'school') then
    raise exception 'TEST SETUP: Star''s 0038 and Color Belt''s 0044 must be applied first (the school column on each payment table)';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.finance_money_rows_core(text, date, date, text, uuid)')
                    and pg_get_function_result(p.oid) like '%was_school%') then
    raise exception 'TEST SETUP: 0047 must be applied first';
  end if;
  if exists (select 1 from public.testing_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.star_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.camp_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.testing_private_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.bb_payments p where p.paid_on between v_d - 5 and v_d + 5) then
    raise exception 'TEST SETUP: there are payments dated around % already; this test needs those days empty', v_d;
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values (v_a1, v_admin, now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;

  -- Color Belt: a test class + rank in each school, one Worcester event, one student on it
  v_cls_w := (pg_temp.t_call(v_c_a1, format('public.testing_add_class(%L, %L, null, true)', 'worcester', v_tag)) ->> 'id')::uuid;
  v_rank_w := (pg_temp.t_call(v_c_a1,
    format('public.testing_add_rank(%L, %L, 6500, 7500, 8500, false, %L, %L, null, 0, %L)', v_cls_w, 'Yellow', 'solid', 'yellow', 'yellow')) ->> 'id')::uuid;
  v_cls_s := (pg_temp.t_call(v_c_a1, format('public.testing_add_class(%L, %L, null, true)', 'shrewsbury', v_tag)) ->> 'id')::uuid;
  v_rank_s := (pg_temp.t_call(v_c_a1,
    format('public.testing_add_rank(%L, %L, 6500, 7500, 9000, false, %L, %L, null, 0, %L)', v_cls_s, 'Yellow', 'solid', 'yellow', 'yellow')) ->> 'id')::uuid;
  v_ev := (pg_temp.t_call(v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' event', v_today + 5,
    jsonb_build_array(jsonb_build_object('class_id', v_cls_w, 'start_time', '17:00', 'end_time', '18:00'))::text)) ->> 'id')::uuid;
  if v_rank_w is null or v_rank_s is null or v_ev is null then
    raise exception 'TEST SETUP: could not create the test classes / event';
  end if;
  select k.id into v_er from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ev and k.rank_id = v_rank_w;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_ev, v_er, 'Fin47', 'Ev Cb', 'cash', true, 'staff') returning id into v_reg;
  -- Color Belt: a private testing at Shrewsbury (the real Add)
  v_r := pg_temp.t_call(v_c_a1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'shrewsbury', 'Fin47', 'Pv Cb', v_rank_s, 'cash', v_today + 3, '17:00'));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: testing_private_add answered %', v_r; end if;
  v_priv := (v_r ->> 'id')::uuid;

  -- Star: one event; candidates registered at Shrewsbury / Worcester
  insert into public.star_events (name, testing_date, start_time, where_code, registration_open,
                                  public_code_worcester, public_code_shrewsbury, created_by_name, updated_by_name)
  values (v_tag || ' star', v_today + 30, '10:00', 'worcester', false,
          public.testing_new_public_code(), public.testing_new_public_code(), '', '')
  returning id into v_sev;
  perform public.star_copy_template_into_event(v_sev);
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin47', 'St Shr', 'shrewsbury', 1, 0, 'cash', 'desk', '', '') returning id into v_c_shr;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin47', 'St Ref', 'worcester', 1, 0, 'cash', 'desk', '', '') returning id into v_c_ref;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin47', 'St Null', 'shrewsbury', 1, 0, 'cash', 'desk', '', '') returning id into v_c_null;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin47', 'St Edit', 'worcester', 1, 0, 'cash', 'desk', '', '') returning id into v_c_edit;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin47', 'St Same', 'worcester', 1, 0, 'cash', 'desk', '', '') returning id into v_c_same;

  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sev, 'Fin47', 'St Move', 'worcester', 1, 0, 'cash', 'desk', '', '') returning id into v_c_move;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_ev, v_er, 'Fin47', 'Ev Cb Edit', 'cash', true, 'staff') returning id into v_reg2;

  -- The money. Day v_d: S1, S3, S4, S5 (and the first payment of S2); v_d + 1: S2's refund; v_d + 2: the two edits
  perform set_config('tkd.actor_label', 'PGlite 0047 test', true);
  v_t := (v_d + time '10:00') at time zone 'America/New_York';
  -- S1: taken at WORCESTER for a candidate registered at Shrewsbury
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_c_shr, 'payment', 14000, 'cash', v_d, 'worcester', v_t, v_admin, v_an);
  -- S2: a Worcester candidate pays $140 at Worcester; $40 is handed back at SHREWSBURY the next day
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_c_ref, 'payment', 14000, 'cash', v_d, 'worcester', v_t + interval '1 hour', v_admin, v_an);
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_c_ref, 'refund', -4000, 'cash', v_d + 1, 'shrewsbury', v_t + interval '1 day', v_admin, v_an);
  -- S3: a Color Belt event payment taken at SHREWSBURY (the event is at Worcester)
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_reg, 'payment', 6500, 'cash', v_d, 'shrewsbury', v_t + interval '2 hours', v_admin, v_an);
  -- S4: a private testing payment taken at WORCESTER (the private testing is at Shrewsbury)
  insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_priv, 'payment', 9000, 'cash', v_d, 'worcester', v_t + interval '3 hours', v_admin, v_an);
  -- S5: no stored school (a table that still allows it); with a NOT NULL rule this part is skipped
  begin
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
    values (v_c_null, 'payment', 5000, 'cash', v_d, null, v_t + interval '4 hours', v_admin, v_an);
  exception when not_null_violation or check_violation then
    v_null_ok := false;
    raise notice 'S5 skipped: star_payments.school does not allow NULL here';
  end;
  -- W1: an edit that moves the payment from Worcester to Shrewsbury: a payment at Worcester, then (same
  -- moment, same login) a reversal at Worcester + a new payment at Shrewsbury, on day v_d + 2
  v_t := (v_d + 2 + time '09:00') at time zone 'America/New_York';
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_c_edit, 'payment', 6000, 'cash', v_d + 2, 'worcester', v_t, v_admin, v_an) returning id into v_p1;
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_c_edit, 'reversal', -6000, 'cash', v_d + 2, 'worcester', v_t + interval '30 minutes', v_admin, v_an, v_p1);
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_c_edit, 'payment', 6000, 'cash', v_d + 2, 'shrewsbury', v_t + interval '30 minutes', v_admin, v_an);
  -- W2: an edit at the SAME school ($70 -> $80)
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_c_same, 'payment', 7000, 'cash', v_d + 2, 'worcester', v_t + interval '1 hour', v_admin, v_an) returning id into v_p2;
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_c_same, 'reversal', -7000, 'cash', v_d + 2, 'worcester', v_t + interval '90 minutes', v_admin, v_an, v_p2);
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_c_same, 'payment', 8000, 'cash', v_d + 2, 'worcester', v_t + interval '90 minutes', v_admin, v_an);
  -- W3: a payment taken at Worcester on day v_d + 1, then corrected on day v_d + 2 (the edit day): a
  -- reversal at Worcester + a new payment dated v_d + 2 at Shrewsbury (same moment, same login)
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_c_move, 'payment', 5500, 'cash', v_d + 1, 'worcester', (v_d + 1 + time '12:00') at time zone 'America/New_York', v_admin, v_an) returning id into v_p3;
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_c_move, 'reversal', -5500, 'cash', v_d + 2, 'worcester', v_t + interval '3 hours', v_admin, v_an, v_p3);
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_c_move, 'payment', 5500, 'cash', v_d + 2, 'shrewsbury', v_t + interval '3 hours', v_admin, v_an);
  -- W4: a Color Belt event payment taken at Worcester, edited the same day to Shrewsbury
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_reg2, 'payment', 6500, 'cash', v_d + 2, 'worcester', v_t + interval '4 hours', v_admin, v_an) returning id into v_p4;
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_reg2, 'reversal', -6500, 'cash', v_d + 2, 'worcester', v_t + interval '5 hours', v_admin, v_an, v_p4);
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_reg2, 'payment', 6500, 'cash', v_d + 2, 'shrewsbury', v_t + interval '5 hours', v_admin, v_an);
  perform set_config('tkd.actor_label', '', true);

  -- ===================================================================
  -- S1 .. S6. Where each line counts
  -- ===================================================================
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  v_rs := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('S1 the Worcester-taken payment of a Shrewsbury candidate is on WORCESTER''s list',
    pg_temp.t_mine(v_rw, 'St Shr'), 'counted:-:14000:false');
  perform pg_temp.t_eq('S1 ... and not on Shrewsbury''s', pg_temp.t_mine(v_rs, 'St Shr'), '');
  perform pg_temp.t_eq('S3 the Shrewsbury-taken payment of a Worcester event is on SHREWSBURY''s list',
    pg_temp.t_mine(v_rs, 'Ev Cb'), 'counted:-:6500:false');
  perform pg_temp.t_eq('S3 ... and not on Worcester''s', pg_temp.t_mine(v_rw, 'Ev Cb'), '');
  perform pg_temp.t_eq('S4 the Worcester-taken private testing payment is on WORCESTER''s list, still private',
    pg_temp.t_mine(v_rw, 'Pv Cb'), 'counted:-:9000:true');
  perform pg_temp.t_eq('S4 ... and not on Shrewsbury''s', pg_temp.t_mine(v_rs, 'Pv Cb'), '');
  if v_null_ok then
    perform pg_temp.t_eq('S5 no stored school -> the candidate''s school (Shrewsbury)', pg_temp.t_mine(v_rs, 'St Null'), 'counted:-:5000:false');
    perform pg_temp.t_eq('S5 ... not Worcester''s', pg_temp.t_mine(v_rw, 'St Null'), '');
  end if;
  -- Worcester: S1 $140 + S2's first payment $140 + S4 $90; Shrewsbury: S3 $65 (+ S5 $50)
  perform pg_temp.t_eq('S6 Worcester: count | total', (v_rw #>> '{totals,count}') || '|' || (v_rw #>> '{totals,total_cents}'), '3|37000');
  perform pg_temp.t_eq('S6 Shrewsbury: count | total', (v_rs #>> '{totals,count}') || '|' || (v_rs #>> '{totals,total_cents}'),
    case when v_null_ok then '2|11500' else '1|6500' end);
  -- the export of the same days says the same
  v_rw1 := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'worcester', v_d, v_d));
  v_rs1 := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'shrewsbury', v_d, v_d));
  perform pg_temp.t_eq('S6 export Worcester = its Daily report', (select string_agg(distinct e ->> 'last_name', ',' order by e ->> 'last_name')
    from jsonb_array_elements(v_rw1 -> 'rows') e), pg_temp.t_names(v_rw));
  perform pg_temp.t_eq('S6 export Shrewsbury = its Daily report', (select string_agg(distinct e ->> 'last_name', ',' order by e ->> 'last_name')
    from jsonb_array_elements(v_rs1 -> 'rows') e), pg_temp.t_names(v_rs));
  perform pg_temp.t_eq('S6 the export rows say the school the line counts at',
    (select string_agg(distinct e ->> 'school', ',') from jsonb_array_elements(v_rw1 -> 'rows') e) || '/'
      || (select string_agg(distinct e ->> 'school', ',') from jsonb_array_elements(v_rs1 -> 'rows') e), 'worcester/shrewsbury');

  -- S2: the refund, the next day
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d + 1));
  v_rs := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d + 1));
  v_it := (select e from jsonb_array_elements(v_rs -> 'items') e where e ->> 'last_name' = 'St Ref');
  perform pg_temp.t_eq('S2 the refund line is on SHREWSBURY''s list',
    concat_ws('|', v_it ->> 'kind', v_it ->> 'amount_cents', v_it ->> 'state', v_it ->> 'first_name'), 'refund|-4000|counted|Fin47');
  perform pg_temp.t_eq('S2 Shrewsbury: Refunds count | cents | cash | check | card', pg_temp.t_ref(v_rs), '1|-4000|-4000|0|0');
  perform pg_temp.t_eq('S2 Shrewsbury: the total is after the refund', v_rs #>> '{totals,total_cents}', '-4000');
  -- (W3 puts one moved-out line on Worcester's day v_d + 1: no refund, no counted payment)
  perform pg_temp.t_eq('S2 Worcester has no refund that day', pg_temp.t_names(v_rw) || '|' || pg_temp.t_ref(v_rw), 'St Move|0|0|0|0|0');

  -- ===================================================================
  -- W1 / W2. was_school
  -- ===================================================================
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d + 2));
  v_rs := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d + 2));
  perform pg_temp.t_eq('W1 Shrewsbury: the moved edit says it was Worcester', pg_temp.t_mine(v_rs, 'St Edit'), 'edited:worcester:6000:false');
  perform pg_temp.t_eq('W1 Worcester keeps nothing of it', pg_temp.t_mine(v_rw, 'St Edit'), '');
  perform pg_temp.t_eq('W2 the same-school edit has no was_school', pg_temp.t_mine(v_rw, 'St Same'), 'edited:-:8000:false');
  perform pg_temp.t_eq('W2 ... but the key is there (null)',
    (select count(*)::text from jsonb_array_elements(v_rw -> 'items') e where e ? 'was_school' and e -> 'was_school' = 'null'::jsonb), '1');
  -- the payment detail (the chain's first payment id is the line's payment_id)
  v_it := (select e from jsonb_array_elements(v_rs -> 'items') e where e ->> 'last_name' = 'St Edit');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L)', 'star', v_it ->> 'payment_id'));
  perform pg_temp.t_eq('W1 payment detail: status | school | was_school | state',
    concat_ws('|', v_r ->> 'status', v_r #>> '{item,school}', v_r #>> '{item,was_school}', v_r #>> '{item,state}'), 'ok|shrewsbury|worcester|edited');
  -- the export
  v_rs1 := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'shrewsbury', v_d + 2, v_d + 2));
  perform pg_temp.t_eq('W1 export row: school | state | was_school',
    (select concat_ws('|', e ->> 'school', e ->> 'state', e ->> 'was_school') from jsonb_array_elements(v_rs1 -> 'rows') e where e ->> 'last_name' = 'St Edit'),
    'shrewsbury|edited|worcester');
  v_rw1 := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'worcester', v_d + 2, v_d + 2));
  perform pg_temp.t_eq('W2 export row of the same-school edit: was_school is null',
    (select coalesce(e ->> 'was_school', 'null') from jsonb_array_elements(v_rw1 -> 'rows') e where e ->> 'last_name' = 'St Same' and e ->> 'state' = 'edited'), 'null');
  -- every row of every export carries the key
  perform pg_temp.t_eq('W2 every export row carries was_school',
    (select count(*)::text from (select e from jsonb_array_elements(v_rw1 -> 'rows') e union all select e from jsonb_array_elements(v_rs1 -> 'rows') e) x
      where not (e ? 'was_school')), '0');

  -- W3: the moved-in line (Shrewsbury, day v_d + 2) and the moved-out line (Worcester, day v_d + 1)
  perform pg_temp.t_eq('W3 Shrewsbury: the moved-in line says it was Worcester', pg_temp.t_mine(v_rs, 'St Move'), 'moved_in:worcester:5500:false');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d + 1));
  perform pg_temp.t_eq('W3 Worcester, the old day: the moved-out line, no was_school', pg_temp.t_mine(v_r, 'St Move'), 'moved_out:-:5500:false');
  -- W4: Color Belt event
  perform pg_temp.t_eq('W4 Color Belt: the edited line on Shrewsbury says it was Worcester', pg_temp.t_mine(v_rs, 'Ev Cb Edit'), 'edited:worcester:6500:false');
  perform pg_temp.t_eq('W4 ... and Worcester keeps nothing of it', pg_temp.t_mine(v_rw, 'Ev Cb Edit'), '');

  -- ===================================================================
  -- C. The five functions: security and rights
  -- ===================================================================
  select string_agg(p.proname || '=' || p.prosecdef::text || '/' || coalesce(array_to_string(p.proconfig, ','), '') || '/'
                    || has_function_privilege('anon', p.oid, 'execute')::text || '/'
                    || has_function_privilege('authenticated', p.oid, 'execute')::text || '/'
                    || has_function_privilege('service_role', p.oid, 'execute')::text || '/'
                    || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)::text,
                    ',' order by p.proname)
    into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('finance_money_rows_core', 'finance_money_rows', 'finance_day', 'finance_payment_detail', 'finance_export');
  perform pg_temp.t_eq('C definer / settings / anon / authenticated / service_role / PUBLIC, per function', v_txt,
    'finance_day=true/search_path=""/false/true/false/false,'
    || 'finance_export=true/search_path=""/false/true/false/false,'
    || 'finance_money_rows=false/search_path=""/false/false/false/false,'
    || 'finance_money_rows_core=false/search_path=""/false/false/false/false,'
    || 'finance_payment_detail=true/search_path=""/false/true/false/false');
  perform pg_temp.t_eq('C both internal helpers end with was_school',
    (select count(*)::text from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('finance_money_rows_core', 'finance_money_rows') and pg_get_function_result(p.oid) like '%was_school text)'), '2');

  -- ===================================================================
  -- K. Privacy: every key in every Finance answer is on the fixed list
  -- ===================================================================
  select string_agg(distinct k, ', ') into v_bad
    from t_answers a, lateral pg_temp.t_keys(a.r) as k
   where a.fn like 'public.finance%' and k <> all (v_allowed_keys);
  perform pg_temp.t_eq('K keys not on Finance''s list', coalesce(v_bad, ''), '');
end
$$;

select 'ALL 0047 TESTS PASSED' as result;

rollback;
