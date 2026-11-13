-- =====================================================================
-- 0037_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The tests for migration 0037 (Finance: Export keeps "private"):
--   finance_export's rows carry is_private, like finance_day's items.
--     E1  Worcester: a Color Belt EVENT payment and a Star payment of a
--         candidate with no private day -> is_private false on both
--     E2  Shrewsbury: a Color Belt PRIVATE TESTING payment and a Star
--         payment of a candidate WITH a private day -> is_private true
--     E3  for each school, the export's (name, is_private) pairs are
--         exactly the Daily report's (finance_day) for the same day
--     E4  every row's is_private is a real true / false (never missing,
--         never null)
--     E5  a row's keys are 0026's keys plus is_private, nothing else
--     E6  each export still writes one finance_exports log row
--     E7  the function itself: security definer, search_path = '', run by
--         authenticated only (not anon, service_role or PUBLIC), its code
--         is 0037's
--     E8  privacy: every key in every Finance answer is on the fixed list
--   The money rows (August 2021, no real data there) are written straight
--   into the payment tables, as 0018_tests.sql does; the class, rank,
--   event and private testing are made with the real functions.
--
-- IS IT SAFE?
--   Yes. One transaction ending with ROLLBACK. NEVER change the final
--   "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   0011 ... 0026 and 0037 are applied. Replace <paste-admin-UID-here>
--   (Authentication -> Users) and run the whole file in the SQL Editor.
--   Passed: one row "ALL 0037 TESTS PASSED". Failed: "TEST FAILED: ..." /
--   "TEST SETUP: ..."; nothing was saved. If it failed, run   rollback;
--   on its own once.
-- =====================================================================

begin;

-- every answer a Finance function gave (for E8)
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

-- t_pairs(array of rows / items): "last name:is_private" sorted byte by byte
create function pg_temp.t_pairs(p jsonb)
returns text
language sql
as $$
  select coalesce(string_agg((e ->> 'last_name') || ':' || coalesce(e ->> 'is_private', 'MISSING'), ','
                             order by ((e ->> 'last_name') || ':' || coalesce(e ->> 'is_private', 'MISSING')) collate "C"), '')
    from jsonb_array_elements(p) e;
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

  v_tag   text := 'zz fin37 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_d     date := date '2021-08-09';   -- this test's own past day
  v_an    text;
  v_role  text;
  v_t     timestamptz;

  v_r      jsonb;
  v_rw     jsonb;
  v_rs     jsonb;
  v_n      integer;
  v_txt    text;
  v_bad    text;
  v_cls_w uuid; v_rank_w uuid; v_cls_s uuid; v_rank_s uuid; v_ev uuid; v_er uuid; v_sev uuid;
  v_reg    uuid;
  v_priv   uuid;
  v_st_ev  uuid;
  v_st_pv  uuid;

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
  if to_regclass('public.testing_private_payments') is null or to_regclass('public.bb_payments') is null
     or to_regprocedure('public.finance_export(text, date, date)') is null then
    raise exception 'TEST SETUP: Finance up to 0026 (and Color Belt''s 0014) must be applied first';
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
  values (v_ev, v_er, 'Fin37', 'Ev Cb', 'cash', true, 'staff') returning id into v_reg;
  -- Color Belt: a private testing at Shrewsbury (the real Add)
  v_r := pg_temp.t_call(v_c_a1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'shrewsbury', 'Fin37', 'Pv Cb', v_rank_s, 'cash', v_today + 3, '17:00'));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: testing_private_add answered %', v_r; end if;
  v_priv := (v_r ->> 'id')::uuid;

  -- Star: one event at Worcester; a Worcester candidate on the event day and
  -- a Shrewsbury candidate with a private day
  insert into public.star_events (name, testing_date, start_time, where_code, registration_open,
                                  public_code_worcester, public_code_shrewsbury, created_by_name, updated_by_name)
  values (v_tag || ' star', v_today + 30, '10:00', 'worcester', false,
          public.testing_new_public_code(), public.testing_new_public_code(), '', '')
  returning id into v_sev;
  perform public.star_copy_template_into_event(v_sev);
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      created_by_name, updated_by_name)
  values (v_sev, 'Fin37', 'Ev Star', 'worcester', 1, 0, 'cash', 'desk', '', '')
  returning id into v_st_ev;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      private_on, private_time, created_by_name, updated_by_name)
  values (v_sev, 'Fin37', 'Pv Star', 'shrewsbury', 1, 0, 'check', 'desk', v_today + 40, '10:00', '', '')
  returning id into v_st_pv;

  -- The money, all on August 9 2021
  perform set_config('tkd.actor_label', 'PGlite 0037 test', true);
  v_t := (v_d + time '10:00') at time zone 'America/New_York';
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
  values (v_reg, 'payment', 6500, 'cash', v_d, v_t, v_admin, v_an);
  insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
  values (v_priv, 'payment', 9000, 'cash', v_d, v_t + interval '1 hour', v_admin, v_an);
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
  values (v_st_ev, 'payment', 14000, 'cash', v_d, v_t + interval '2 hours', v_admin, v_an);
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
  values (v_st_pv, 'payment', 14000, 'check', v_d, v_t + interval '3 hours', v_admin, v_an);
  perform set_config('tkd.actor_label', '', true);

  select count(*)::integer into v_n from public.finance_exports;

  -- ===================================================================
  -- E1 / E2. The two exports
  -- ===================================================================
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'worcester', v_d, v_d));
  perform pg_temp.t_eq('E1 Worcester export', v_rw ->> 'status', 'ok');
  perform pg_temp.t_eq('E1 Worcester: event payments are not private', pg_temp.t_pairs(v_rw -> 'rows'), 'Ev Cb:false,Ev Star:false');
  v_rs := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'shrewsbury', v_d, v_d));
  perform pg_temp.t_eq('E2 Shrewsbury export', v_rs ->> 'status', 'ok');
  perform pg_temp.t_eq('E2 Shrewsbury: private testings are private', pg_temp.t_pairs(v_rs -> 'rows'), 'Pv Cb:true,Pv Star:true');
  perform pg_temp.t_eq('E2 the sections', (select string_agg((e ->> 'last_name') || ':' || (e ->> 'what'), ',' order by e ->> 'last_name' collate "C")
                                             from jsonb_array_elements(v_rs -> 'rows') e), 'Pv Cb:color_belt,Pv Star:star');

  -- ===================================================================
  -- E3. The same as the Daily report
  -- ===================================================================
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('E3 Worcester: export = Daily report', pg_temp.t_pairs(v_rw -> 'rows'), pg_temp.t_pairs(v_r -> 'items'));
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('E3 Shrewsbury: export = Daily report', pg_temp.t_pairs(v_rs -> 'rows'), pg_temp.t_pairs(v_r -> 'items'));

  -- ===================================================================
  -- E4. Always a real true / false
  -- ===================================================================
  select string_agg(coalesce(jsonb_typeof(e -> 'is_private'), 'missing'), ',') into v_bad
    from (select jsonb_array_elements(v_rw -> 'rows') e union all select jsonb_array_elements(v_rs -> 'rows')) x
   where jsonb_typeof(e -> 'is_private') is distinct from 'boolean';
  perform pg_temp.t_eq('E4 every row''s is_private is true or false', coalesce(v_bad, ''), '');

  -- ===================================================================
  -- E5. A row's keys: 0026's plus is_private
  -- ===================================================================
  select string_agg(distinct k, ',' order by k) into v_txt
    from (select jsonb_array_elements(v_rw -> 'rows') e union all select jsonb_array_elements(v_rs -> 'rows')) x,
         lateral jsonb_object_keys(e) k;
  -- (0047, later, adds was_school to every row: this check passes before and after it)
  perform pg_temp.t_eq('E5 row keys', replace(replace(v_txt, ',was_school', ''), 'was_school,', ''),
    'amount_cents,counted_cents,day,event_date,first_name,is_private,kind,last_name,method,note,recorded_by_name,school,state,time,what');

  -- ===================================================================
  -- E6. One log row per export
  -- ===================================================================
  perform pg_temp.t_eq('E6 two exports, two log rows', ((select count(*)::integer from public.finance_exports) - v_n)::text, '2');

  -- ===================================================================
  -- E7. The function: who may run it, how it runs, its code
  -- ===================================================================
  select concat_ws('|', p.prosecdef::text, array_to_string(p.proconfig, ','),
                   has_function_privilege('anon', p.oid, 'execute')::text,
                   has_function_privilege('authenticated', p.oid, 'execute')::text,
                   has_function_privilege('service_role', p.oid, 'execute')::text,
                   exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                            where a.grantee = 0)::text,
                   md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')))
    into v_txt
    from pg_proc p
   where p.oid = to_regprocedure('public.finance_export(text, date, date)');
  -- the code is 0037's, or (once 0047 is applied) 0047's: it adds only was_school; or (once 0052 is applied)
  -- 0052's: it adds only Board breaking's event_name
  perform pg_temp.t_eq('E7 definer | settings | anon | authenticated | service_role | PUBLIC | code',
    case when right(v_txt, 32) in ('f812a5b147fda8d8603afe907abd2137', '0f4b678f757bca72fec14bb78aacd37d', '637d23b573269daa3e8f4f23f2d1e68a')
         then left(v_txt, length(v_txt) - 32) || 'f812a5b147fda8d8603afe907abd2137' else v_txt end,
    'true|search_path=""|false|true|false|false|f812a5b147fda8d8603afe907abd2137');

  -- ===================================================================
  -- E8. Privacy: every key in every Finance answer is on the fixed list
  -- ===================================================================
  select string_agg(distinct k, ', ') into v_bad
    from t_answers a, lateral pg_temp.t_keys(a.r) as k
   where a.fn like 'public.finance%' and k <> all (v_allowed_keys);
  perform pg_temp.t_eq('E8 keys not on Finance''s list', coalesce(v_bad, ''), '');
end
$$;

select 'ALL 0037 TESTS PASSED' as result;

rollback;
