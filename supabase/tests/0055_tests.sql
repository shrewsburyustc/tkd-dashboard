-- =====================================================================
-- 0055_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The tests for migration 0055 (Black Belt: every roster row gains
--   "paid_on", the day of the candidate's last payment that still counts;
--   contract docs/Finance/Event reports/CONTRACT-0054-0055.md). It makes
--   one cycle with eight candidates and writes their payment rows straight
--   into bb_payments (September 2021 days, so no real data is involved),
--   then reads the roster through the app's own function and checks:
--     P1  one payment on a day               -> that day (and a candidate
--         who paid in full: money says paid_in_full, paid_on is the day)
--     P2  two payments on two days           -> the later day
--     P3  a later payment that was undone    -> the earlier day (the undone
--         one does not count)
--     P4  a bounced check (a live "returned" row on the payment)
--                                            -> null (it does not count)
--     P5  a candidate with no payment        -> null
--     P6  a bounced check whose return was undone -> the payment counts
--         again: its day
--     P7  an edited payment (the old one reversed, a new one on another
--         day)                               -> the new day
--     P8  a payment and a later refund       -> the payment's day (a refund
--         is not a payment)
--     K   every roster row has exactly 0025's keys plus paid_on, in the
--         order and with the make-up keys 0025 gave; paid_on is a date or
--         null, and no login id, note or private value appears
--     A   the front desk (staff) may read it; signed out and PIN-locked
--         sessions get no_access; an unknown cycle is not_found
--     C   security: definer, volatile, search_path "", authenticated yes,
--         anon / service_role / PUBLIC no
--
-- IS IT SAFE?
--   Yes. One transaction ending with ROLLBACK. NEVER change the final
--   "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   0055 is applied. Replace <paste-admin-UID-here> and
--   <paste-desk-UID-here> (Authentication -> Users: an ACTIVE admin and the
--   ACTIVE front-desk login) and run the whole file in the SQL Editor.
--   Passed: one row "ALL 0055 TESTS PASSED". Failed: "TEST FAILED: ..." /
--   "TEST SETUP: ..."; nothing was saved. If it failed, run   rollback;
--   on its own once.
-- =====================================================================

begin;

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
  return v_r;
end;
$$;

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

-- t_row(...): one bb_payments row written straight into the table (for a PAST day; the real functions always use
-- today), with the candidate's cycle and the given school; a reversal / returned row copies its target's school
-- and cycle name (the table's guard demands that)
create function pg_temp.t_row(p_cand uuid, p_kind text, p_amount integer, p_method text, p_paid_on date,
                              p_at timestamptz, p_by uuid, p_name text, p_items text[], p_target uuid, p_school text)
returns uuid
language plpgsql
as $$
declare
  v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.actor_label', 'zz fin55 test', true);
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

-- t_cycle(name, first day, application due): a Black Belt cycle payload for bb_add_cycle
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

-- t_paid(roster, last name): that candidate's "money tag | paid_on" ('-' when paid_on is null; the key must be there)
create function pg_temp.t_paid(p_roster jsonb, p_last text)
returns text
language sql
as $$
  select (e #>> '{money,tag}') || '|' || case when e ? 'paid_on' then coalesce(e ->> 'paid_on', '-') else 'NO KEY' end
    from jsonb_array_elements(p_roster -> 'rows') e
   where e ->> 'last_name' = p_last;
$$;


do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();   -- admin, unlocked
  v_a2 uuid := gen_random_uuid();   -- admin, PIN-locked
  v_d1 uuid := gen_random_uuid();   -- front desk, unlocked
  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_a2 text; v_c_d1 text;

  v_tag   text := 'zz fin55 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_d     date := date '2021-09-06';
  v_an    text;
  v_dn    text;
  v_role  text;
  v_t     timestamptz := (date '2021-09-06' + time '10:00') at time zone 'America/New_York';
  v_dob   date := (public.testing_today() - interval '30 years')::date;

  v_r jsonb; v_e jsonb; v_txt text; v_n integer;
  v_cy uuid; v_full uuid; v_three uuid;
  v_ca uuid; v_cb uuid; v_cc uuid; v_cd uuid; v_ce uuid; v_cf uuid; v_cg uuid; v_ch uuid;
  v_p uuid; v_ret uuid; v_p2 uuid;
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
  if to_regprocedure('public.bb_cycle_roster(uuid)') is null
     or (select position('paid_on' in p.prosrc) = 0 from pg_proc p where p.oid = to_regprocedure('public.bb_cycle_roster(uuid)')) then
    raise exception 'TEST SETUP: 0055 must be applied first';
  end if;
  if exists (select 1 from public.bb_payments p where p.paid_on between v_d - 5 and v_d + 20) then
    raise exception 'TEST SETUP: there are Black Belt payments dated around % already; this test needs those days empty', v_d;
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_a2, v_admin), (v_d1, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;

  if not exists (select 1 from public.bb_waiver_versions v where v.superseded_at is null) then
    insert into public.bb_waiver_versions (version_name, body, is_placeholder, created_by_name)
    values ('1999-55', 'PLACEHOLDER zz fin55 test', true, '');
  end if;
  v_r := pg_temp.t_call(v_c_a1, format('public.bb_add_cycle(%L::jsonb, null)', pg_temp.t_cycle(v_tag || ' Cycle', v_today + 30, v_today + 20)));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_add_cycle answered %', v_r; end if;
  v_cy := (v_r ->> 'id')::uuid;
  select id into v_full from public.bb_cycle_plans where cycle_id = v_cy and name = 'In full';
  select id into v_three from public.bb_cycle_plans where cycle_id = v_cy and name = '3 payments';

  -- eight candidates (added at the desk, paper waiver ticked): A pays in full, B..H on the three-payment plan
  for v_e in
    select * from jsonb_array_elements(jsonb_build_array('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'))
  loop
    v_r := pg_temp.t_call(v_c_d1, format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, true)',
      v_cy, 'Fin55', 'Paid ' || (v_e #>> '{}'), v_dob, 'zz55.' || lower(v_e #>> '{}') || '@example.com',
      case when (v_e #>> '{}') in ('B', 'D', 'F') then 'shrewsbury' else 'worcester' end,
      case when (v_e #>> '{}') = 'A' then v_full else v_three end));
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_add_candidate % answered %', v_e, v_r; end if;
    case v_e #>> '{}'
      when 'A' then v_ca := (v_r ->> 'id')::uuid;
      when 'B' then v_cb := (v_r ->> 'id')::uuid;
      when 'C' then v_cc := (v_r ->> 'id')::uuid;
      when 'D' then v_cd := (v_r ->> 'id')::uuid;
      when 'E' then v_ce := (v_r ->> 'id')::uuid;
      when 'F' then v_cf := (v_r ->> 'id')::uuid;
      when 'G' then v_cg := (v_r ->> 'id')::uuid;
      else v_ch := (v_r ->> 'id')::uuid;
    end case;
  end loop;

  -- P1: A pays $870 in full (a check) on day 0
  perform pg_temp.t_row(v_ca, 'payment', 87000, 'check', v_d, v_t, v_admin, v_an, array['p1'], null, 'worcester');
  -- P2: B pays $290 on day 0 and $290 on day 1
  perform pg_temp.t_row(v_cb, 'payment', 29000, 'check', v_d, v_t, v_admin, v_an, array['p1'], null, 'shrewsbury');
  perform pg_temp.t_row(v_cb, 'payment', 29000, 'cash', v_d + 1, v_t + interval '1 day', v_admin, v_an, array['p2'], null, 'shrewsbury');
  -- P3: C pays on day 0 and on day 3; the day-3 payment is undone the same day
  perform pg_temp.t_row(v_cc, 'payment', 29000, 'cash', v_d, v_t, v_admin, v_an, array['p1'], null, 'worcester');
  v_p := pg_temp.t_row(v_cc, 'payment', 29000, 'cash', v_d + 3, v_t + interval '3 days', v_admin, v_an, array['p2'], null, 'worcester');
  perform pg_temp.t_row(v_cc, 'reversal', -29000, 'cash', v_d + 3, v_t + interval '3 days 1 hour', v_admin, v_an, null, v_p, null);
  -- P4: D pays $290 by check on day 0; the bank returns it TODAY (the real writers date a returned check today)
  v_p := pg_temp.t_row(v_cd, 'payment', 29000, 'check', v_d, v_t, v_admin, v_an, array['p1'], null, 'shrewsbury');
  v_ret := pg_temp.t_row(v_cd, 'returned', -29000, 'check', v_today, now() - interval '3 hours', v_admin, v_an, null, v_p, null);
  -- P5: E has no payment at all
  -- P6: F pays $290 by check on day 2, the bank returns it TODAY, then the return is undone (a reversal of the returned row)
  v_p := pg_temp.t_row(v_cf, 'payment', 29000, 'check', v_d + 2, v_t + interval '2 days', v_admin, v_an, array['p1'], null, 'shrewsbury');
  v_ret := pg_temp.t_row(v_cf, 'returned', -29000, 'check', v_today, now() - interval '3 hours', v_admin, v_an, null, v_p, null);
  perform pg_temp.t_row(v_cf, 'reversal', 29000, 'check', v_today, now() - interval '2 hours', v_admin, v_an, null, v_ret, null);
  -- P7: G pays $280 cash on day 0, edited on day 1 to $290 card (a reversal + a new payment at one moment)
  v_p := pg_temp.t_row(v_cg, 'payment', 28000, 'cash', v_d, v_t, v_admin, v_an, array['p1'], null, 'worcester');
  perform pg_temp.t_row(v_cg, 'reversal', -28000, 'cash', v_d + 1, v_t + interval '1 day', v_admin, v_an, null, v_p, null);
  perform pg_temp.t_row(v_cg, 'payment', 29000, 'card', v_d + 1, v_t + interval '1 day', v_admin, v_an, array['p1'], null, 'worcester');
  -- P8: H pays $290 on day 0 and gets $50 back on day 2
  perform pg_temp.t_row(v_ch, 'payment', 29000, 'cash', v_d, v_t, v_admin, v_an, array['p1'], null, 'worcester');
  perform pg_temp.t_row(v_ch, 'refund', -5000, 'cash', v_d + 2, v_t + interval '2 days', v_admin, v_an, null, null, 'worcester');

  -- ===================================================================
  -- P. The roster, as the front desk reads it
  -- ===================================================================
  v_r := pg_temp.t_call(v_c_d1, format('public.bb_cycle_roster(%L)', v_cy));
  perform pg_temp.t_eq('P0 status, state and 8 rows', (v_r ->> 'status') || '|' || jsonb_array_length(v_r -> 'rows'), 'ok|8');
  perform pg_temp.t_eq('P1 one payment, paid in full: tag and the day', pg_temp.t_paid(v_r, 'Paid A'), 'paid_in_full|' || v_d);
  perform pg_temp.t_eq('P2 two payments: the later day', pg_temp.t_paid(v_r, 'Paid B'), 'next|' || (v_d + 1));
  perform pg_temp.t_eq('P3 a later payment that was undone does not count: the earlier day', pg_temp.t_paid(v_r, 'Paid C'), 'next|' || v_d);
  perform pg_temp.t_eq('P4 a bounced check does not count: no date', pg_temp.t_paid(v_r, 'Paid D'), 'next|-');
  perform pg_temp.t_eq('P5 no payment: no date', pg_temp.t_paid(v_r, 'Paid E'), 'next|-');
  perform pg_temp.t_eq('P6 a bounced check whose return was undone counts again: its day', pg_temp.t_paid(v_r, 'Paid F'), 'next|' || (v_d + 2));
  perform pg_temp.t_eq('P7 an edited payment: the new payment''s day', pg_temp.t_paid(v_r, 'Paid G'), 'next|' || (v_d + 1));
  perform pg_temp.t_eq('P8 a refund is not a payment: the payment''s day', pg_temp.t_paid(v_r, 'Paid H'), 'next|' || v_d);

  -- the same through an admin
  v_r := pg_temp.t_call(v_c_a1, format('public.bb_cycle_roster(%L)', v_cy));
  perform pg_temp.t_eq('P9 the admin reads the same dates',
    (select string_agg((e ->> 'last_name') || '=' || coalesce(e ->> 'paid_on', '-'), ',' order by e ->> 'last_name') from jsonb_array_elements(v_r -> 'rows') e),
    'Paid A=' || v_d || ',Paid B=' || (v_d + 1) || ',Paid C=' || v_d || ',Paid D=-,Paid E=-,Paid F=' || (v_d + 2)
    || ',Paid G=' || (v_d + 1) || ',Paid H=' || v_d);

  -- ===================================================================
  -- K. Keys and privacy
  -- ===================================================================
  perform pg_temp.t_eq('K every roster row: 0025''s keys plus paid_on',
    (select array_to_string(array_agg(k order by k collate "C"), ',') from jsonb_object_keys(v_r -> 'rows' -> 0) k),
    'dan,duplicate_of,duplicate_state,first_name,has_grades,has_payment_rows,id,is_makeup,kukkiwon,last_name,location_code,'
    || 'makeup_of_cycle_name,money,paid_on,plan_id,plan_name,reference,registered_at,retest_names,source,status,version,withdrawn_reason');
  select count(*)::integer into v_n
    from jsonb_array_elements(v_r -> 'rows') e
   where jsonb_typeof(e -> 'paid_on') not in ('string', 'null')
      or (select count(*) from jsonb_object_keys(e)) <> 23;
  perform pg_temp.t_eq('K paid_on is a date or null on every row, and each row has 23 keys', v_n::text, '0');
  v_txt := v_r::text;
  perform pg_temp.t_eq('K no login id and no email in the roster',
    (position(v_admin::text in v_txt) > 0 or position(v_desk::text in v_txt) > 0 or position('example.com' in v_txt) > 0)::text, 'false');
  perform pg_temp.t_eq('K the rest of the answer: status, state, rows',
    (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k), 'rows,state,status');

  -- ===================================================================
  -- A. Access (unchanged by 0055)
  -- ===================================================================
  perform pg_temp.t_eq('A signed out -> no_access', pg_temp.t_call(null, format('public.bb_cycle_roster(%L)', v_cy)) ->> 'status', 'no_access');
  perform pg_temp.t_eq('A PIN-locked admin -> no_access', pg_temp.t_call(v_c_a2, format('public.bb_cycle_roster(%L)', v_cy)) ->> 'status', 'no_access');
  perform pg_temp.t_eq('A an unknown cycle -> not_found',
    pg_temp.t_call(v_c_d1, format('public.bb_cycle_roster(%L)', gen_random_uuid())) ->> 'status', 'not_found');
  perform pg_temp.t_eq('A no cycle -> invalid', pg_temp.t_call(v_c_d1, 'public.bb_cycle_roster(null)') ->> 'status', 'invalid');

  -- ===================================================================
  -- C. Security
  -- ===================================================================
  select string_agg(p.proname || '=' || p.prosecdef::text || '/' || p.provolatile::text || '/' || coalesce(array_to_string(p.proconfig, ','), '') || '/'
                    || has_function_privilege('anon', p.oid, 'execute')::text || '/'
                    || has_function_privilege('authenticated', p.oid, 'execute')::text || '/'
                    || has_function_privilege('service_role', p.oid, 'execute')::text || '/'
                    || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)::text,
                    ',' order by p.proname)
    into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'bb_cycle_roster';
  perform pg_temp.t_eq('C definer / volatile / search path / anon / authenticated / service_role / PUBLIC', v_txt,
    'bb_cycle_roster=true/v/search_path=""/false/true/false/false');
end
$$;

select 'ALL 0055 TESTS PASSED' as result;

rollback;
