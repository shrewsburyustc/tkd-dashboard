-- =====================================================================
-- 0052_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The tests for migration 0052 (Finance reads Board breaking payments:
--   Daily report, Close the day, History, Export, payment detail; rulebook
--   v1.300-v1.304; contract docs/Board Breaking/CONTRACT-0052.md). It checks:
--     B1  a Board breaking payment appears on the Daily report of the school
--         STORED ON THE PAYMENT (the desk that took the money) and NOT on the
--         other school's report - also in the export of the same days
--     B2  a Square payment (no login) appears as "Square", at the EVENT's school
--     B3  a refund counts at the school of the desk that handed the money
--         back: the Refunds figures and the total; an undone refund counts as
--         nothing
--     B4  an edit (a reversal + a new payment written in one go) shows ONCE,
--         as "edited"; an edit that moved the payment to the other school
--         says was_school; an edit that also changed the day shows the
--         "moved to" line on the old day and "moved in" on the new
--     B5  a reversed (undone) payment drops out of the totals; the staff's own
--         Undo within 10 seconds leaves no line at all
--     B6  the totals and counts add up per school and per way to pay
--     B7  History and Export show the same lines and totals; the payment
--         detail (name, event, way to pay, who recorded it, its trail:
--         recorded / edited / undone / refunded)
--     B8  Close the day takes Board breaking items (the table rule), keeps
--         them in the close's snapshot, and a Board breaking payment added
--         after the close shows as "added after closing"
--     B9  the app's REAL writers (brk_mark_paid, brk_undo_payment,
--         brk_edit_payment, brk_set_override + brk_record_refund and
--         brk_square_payment) write rows the Daily report reads correctly
--     R   the other sections are unchanged: a Star payment (taken at the
--         other school) and a Color Belt event payment on the same days still
--         count where they always did (the exact before-and-after record on
--         five years of every section's history is in run.mjs step0052)
--     A   access: signed out, PIN-locked and locked sessions read nothing;
--         the front desk (role staff) sees today only and no export
--     K   privacy: every key in every Finance answer is on the fixed list and
--         no login id appears anywhere
--     C   the five replaced functions and the table rule: security, search
--         path, who may run them
--   The Board breaking and Star / Color Belt money rows (September 2021 - no
--   real data there) are written straight into the payment tables, as
--   0047_tests.sql does; the events, registrations and the Square /
--   Mark paid / Edit / Undo / refund lines of B9 are made with the app's
--   real functions.
--
-- IS IT SAFE?
--   Yes. One transaction ending with ROLLBACK. NEVER change the final
--   "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   0051 and 0052 are applied. Replace <paste-admin-UID-here> and
--   <paste-desk-UID-here> (Authentication -> Users: an ACTIVE admin and the
--   ACTIVE front-desk login) and run the whole file in the SQL Editor.
--   Passed: one row "ALL 0052 TESTS PASSED". Failed: "TEST FAILED: ..." /
--   "TEST SETUP: ..."; nothing was saved. If it failed, run   rollback;
--   on its own once.
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
-- "source:state:was_school:amount:recorded_by_name:method" (was_school '-' when null), sorted
create function pg_temp.t_mine(p_day jsonb, p_last text)
returns text
language sql
as $$
  select coalesce(string_agg((e ->> 'source') || ':' || (e ->> 'state') || ':' || coalesce(e ->> 'was_school', '-')
                             || ':' || (e ->> 'amount_cents') || ':' || (e ->> 'recorded_by_name') || ':' || (e ->> 'method'), ','
                             order by ((e ->> 'source') || ':' || (e ->> 'state') || ':' || coalesce(e ->> 'was_school', '-')
                                       || ':' || (e ->> 'amount_cents')) collate "C"), '')
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

-- t_bb(day answer): the Board breaking lines that COUNT (counted / edited / moved_in) as "count|cents"
create function pg_temp.t_bb(p_day jsonb)
returns text
language sql
as $$
  select count(*)::text || '|' || coalesce(sum((e ->> 'amount_cents')::integer), 0)::text
    from jsonb_array_elements(p_day -> 'items') e
   where e ->> 'source' = 'board_breaking' and e ->> 'state' in ('counted', 'edited', 'moved_in');
$$;

-- t_tot(day answer): count | total | cash cents | check cents | card cents
create function pg_temp.t_tot(p_day jsonb)
returns text
language sql
as $$
  select concat_ws('|', p_day #>> '{totals,count}', p_day #>> '{totals,total_cents}', p_day #>> '{totals,cash,cents}',
                   p_day #>> '{totals,check,cents}', p_day #>> '{totals,card,cents}');
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

-- t_ver(registration): its current version (the "expected version" the app functions want)
create function pg_temp.t_ver(p_reg uuid)
returns integer
language sql
as $$
  select r.version from public.brk_registrations r where r.id = p_reg;
$$;

-- t_reg(event, class, last name, amount, paying by): a Board breaking student, written straight in
create function pg_temp.t_reg(p_event uuid, p_class uuid, p_last text, p_amount integer, p_paying text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.brk_registrations
    (event_id, class_id, first_name, last_name, age, rank_name, band_used, tech_boards, adult_boards, paying_by,
     paying_by_on_form, same_day, amount_cents, source, entered_by, created_by_name, updated_by_name)
  values (p_event, p_class, 'Fin52', p_last, 10, 'Yellow', 'child', 1, 0, p_paying, p_paying, false, p_amount, 'desk',
          'Fin52 test', '', '')
  returning id into v_id;
  return v_id;
end;
$$;

-- t_pay(registration, kind, cents, method, day, school, at, login, name, reverses): one payment row, written straight in
create function pg_temp.t_pay(p_reg uuid, p_kind text, p_cents integer, p_method text, p_day date, p_school text,
                              p_at timestamptz, p_by uuid, p_name text, p_reverses uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.brk_payments
    (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (p_reg, p_kind, p_cents, p_method, p_day, p_school, p_at, p_by, p_name, p_reverses)
  returning id into v_id;
  return v_id;
end;
$$;


do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();   -- admin, unlocked
  v_a2 uuid := gen_random_uuid();   -- admin, PIN-locked (the unlock ran out)
  v_d1 uuid := gen_random_uuid();   -- front desk, unlocked
  v_d2 uuid := gen_random_uuid();   -- front desk, locked (never unlocked)
  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_a2 text; v_c_d1 text; v_c_d2 text;

  v_tag   text := 'zz fin52 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_d     date := date '2021-08-16';   -- this test's own past days: v_d .. v_d + 3
  v_an    text;   -- the admin's and the desk's names, as the history shows them
  v_dn    text;
  v_role  text;
  v_t     timestamptz;
  v_t0    timestamptz;

  v_r      jsonb;
  v_rw     jsonb;
  v_rs     jsonb;
  v_rw1    jsonb;
  v_rs1    jsonb;
  v_it     jsonb;
  v_txt    text;
  v_bad    text;
  v_n      integer;
  v_base_w jsonb;
  v_base_s jsonb;
  v_bw     jsonb;
  v_bs     jsonb;

  v_ew uuid; v_es uuid; v_et uuid;             -- events: Worcester (past test days), Shrewsbury, Worcester TODAY
  v_cw uuid; v_cs uuid; v_ct uuid;             -- one class each
  v_ew_date date; v_et_date date;
  v_r1 uuid; v_r2 uuid; v_r3 uuid; v_r4 uuid; v_r5 uuid; v_r6 uuid; v_r7 uuid; v_r8 uuid; v_r9 uuid; v_r10 uuid; v_r11 uuid;
  v_p1 uuid; v_p5 uuid; v_p6 uuid; v_p6b uuid; v_p7 uuid; v_p7b uuid; v_p8 uuid; v_p9 uuid; v_p10 uuid; v_p10b uuid;
  v_p11 uuid; v_p11r uuid; v_p3 uuid; v_p4 uuid; v_p2 uuid; v_pl uuid;
  v_sc uuid; v_sevt uuid; v_cands uuid; v_cb_cls uuid; v_cb_rank uuid; v_cb_ev uuid; v_cb_er uuid; v_cb_reg uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid; v_tp uuid; v_tp3 uuid; v_tp4 uuid;
  v_ver   integer;
  v_closing uuid;

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
  select s.role, s.full_name into v_role, v_dn from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regclass('public.brk_payments') is null or to_regclass('public.brk_registrations') is null
     or to_regprocedure('public.brk_mark_paid(uuid, integer, text, text)') is null then
    raise exception 'TEST SETUP: 0051 (Board breaking) must be applied first';
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = to_regclass('public.finance_day_closing_items')
                    and c.conname = 'finance_day_closing_items_source_check' and pg_get_constraintdef(c.oid) like '%board_breaking%')
     or not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.finance_payment_detail(text, uuid)')
                       and p.prosrc like '%board_breaking%')
     or not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.finance_chain_steps_core(date, date, text, uuid)')
                       and p.prosrc like '%board_breaking%') then
    raise exception 'TEST SETUP: 0052 must be applied first';
  end if;
  if exists (select 1 from public.testing_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.star_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.camp_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.testing_private_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.bb_payments p where p.paid_on between v_d - 5 and v_d + 5)
     or exists (select 1 from public.brk_payments p where p.paid_on between v_d - 5 and v_d + 5) then
    raise exception 'TEST SETUP: there are payments dated around % already; this test needs those days empty', v_d;
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_a2, v_admin), (v_d1, v_desk), (v_d2, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;
  v_c_d2 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text;

  -- today's two reports as they are BEFORE this test writes anything (there may be real money on them)
  v_base_w := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  v_base_s := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));

  perform set_config('tkd.actor_label', 'PGlite 0052 test', true);

  -- Board breaking: a Worcester event on the test days' calendar, a Shrewsbury one, and one Worcester event TODAY
  v_ew_date := v_today + 20;
  insert into public.brk_events (name, location_code, event_date, public_code, created_by_name, updated_by_name)
  values (v_tag || ' Wor night', 'worcester', v_ew_date, public.testing_new_public_code(), '', '') returning id into v_ew;
  insert into public.brk_events (name, location_code, event_date, public_code, created_by_name, updated_by_name)
  values (v_tag || ' Shr night', 'shrewsbury', v_today + 21, public.testing_new_public_code(), '', '') returning id into v_es;
  v_et_date := v_today;
  insert into public.brk_events (name, location_code, event_date, public_code, created_by_name, updated_by_name)
  values (v_tag || ' Wor today', 'worcester', v_et_date, public.testing_new_public_code(), '', '') returning id into v_et;
  insert into public.brk_event_classes (event_id, name, start_time, end_time, sort) values (v_ew, 'Group A', '17:00', '18:00', 0) returning id into v_cw;
  insert into public.brk_event_classes (event_id, name, start_time, end_time, sort) values (v_es, 'Group A', '17:00', '18:00', 0) returning id into v_cs;
  insert into public.brk_event_classes (event_id, name, start_time, end_time, sort) values (v_et, 'Group A', '17:00', '18:00', 0) returning id into v_ct;

  -- the students of the test days
  v_r1  := pg_temp.t_reg(v_ew, v_cw, 'Cash W', 1200, 'cash');
  v_r2  := pg_temp.t_reg(v_ew, v_cw, 'Desk S', 1500, 'cash');
  v_r3  := pg_temp.t_reg(v_ew, v_cw, 'Sq W', 975, 'card');
  v_r4  := pg_temp.t_reg(v_es, v_cs, 'Sq S', 975, 'card');
  v_r5  := pg_temp.t_reg(v_ew, v_cw, 'Ref', 3000, 'check');
  v_r6  := pg_temp.t_reg(v_ew, v_cw, 'Edit Move', 2500, 'cash');
  v_r7  := pg_temp.t_reg(v_ew, v_cw, 'Edit Same', 1900, 'cash');
  v_r8  := pg_temp.t_reg(v_ew, v_cw, 'Undone', 2200, 'cash');
  v_r9  := pg_temp.t_reg(v_ew, v_cw, 'Hidden', 700, 'cash');
  v_r10 := pg_temp.t_reg(v_ew, v_cw, 'Moved', 5500, 'cash');
  v_r11 := pg_temp.t_reg(v_ew, v_cw, 'Ref Undo', 4000, 'cash');

  -- The money, straight into the tables with fixed times (the same shapes the real writers produce).
  -- Day v_d: the first five students; v_d + 1: the refund and the moved payment's first day; v_d + 2: the edits,
  -- the undone and the hidden payment; v_d + 3: the refund that was undone.
  v_t := (v_d + time '10:00') at time zone 'America/New_York';
  -- B1: a payment taken at the Worcester desk
  v_p1 := pg_temp.t_pay(v_r1, 'payment', 1200, 'cash', v_d, 'worcester', v_t, v_admin, v_an);
  -- B1: taken at the SHREWSBURY desk for a student of a Worcester event: counts at Shrewsbury
  v_p2 := pg_temp.t_pay(v_r2, 'payment', 1500, 'cash', v_d, 'shrewsbury', v_t + interval '1 hour', v_admin, v_an);
  -- B2: Square payments: no login, "Square", the event's school
  v_p3 := pg_temp.t_pay(v_r3, 'payment', 975, 'card', v_d, 'worcester', v_t + interval '2 hours', null, 'Square');
  v_p4 := pg_temp.t_pay(v_r4, 'payment', 975, 'card', v_d, 'shrewsbury', v_t + interval '2 hours 30 minutes', null, 'Square');
  -- B3: a payment at Worcester, then $10 handed back at SHREWSBURY the next day
  v_p5 := pg_temp.t_pay(v_r5, 'payment', 3000, 'check', v_d, 'worcester', v_t + interval '3 hours', v_admin, v_an);
  perform pg_temp.t_pay(v_r5, 'refund', -1000, 'cash', v_d + 1, 'shrewsbury', v_t + interval '1 day', v_admin, v_an);
  -- B4: an edit that moves the payment from Worcester to Shrewsbury (the same day): a reversal at Worcester + a new payment at
  -- Shrewsbury written at the same moment by the same login, as brk_edit_payment writes them
  v_t0 := (v_d + 2 + time '09:00') at time zone 'America/New_York';
  v_p6 := pg_temp.t_pay(v_r6, 'payment', 2000, 'cash', v_d + 2, 'worcester', v_t0, v_admin, v_an);
  perform pg_temp.t_pay(v_r6, 'reversal', -2000, 'cash', v_d + 2, 'worcester', v_t0 + interval '30 minutes', v_admin, v_an, v_p6);
  v_p6b := pg_temp.t_pay(v_r6, 'payment', 2500, 'check', v_d + 2, 'shrewsbury', v_t0 + interval '30 minutes', v_admin, v_an);
  -- B4: an edit at the SAME school ($18 -> $19)
  v_p7 := pg_temp.t_pay(v_r7, 'payment', 1800, 'cash', v_d + 2, 'worcester', v_t0 + interval '1 hour', v_admin, v_an);
  perform pg_temp.t_pay(v_r7, 'reversal', -1800, 'cash', v_d + 2, 'worcester', v_t0 + interval '90 minutes', v_admin, v_an, v_p7);
  v_p7b := pg_temp.t_pay(v_r7, 'payment', 1900, 'cash', v_d + 2, 'worcester', v_t0 + interval '90 minutes', v_admin, v_an);
  -- B5: an undone payment (an hour later: a real Undo by an admin), and a hidden one (the same login, 5 seconds later)
  v_p8 := pg_temp.t_pay(v_r8, 'payment', 2200, 'cash', v_d + 2, 'worcester', v_t0 + interval '2 hours', v_admin, v_an);
  perform pg_temp.t_pay(v_r8, 'reversal', -2200, 'cash', v_d + 2, 'worcester', v_t0 + interval '5 hours', v_admin, v_an, v_p8);
  v_p9 := pg_temp.t_pay(v_r9, 'payment', 700, 'cash', v_d + 2, 'worcester', v_t0 + interval '3 hours', v_desk, v_dn);
  perform pg_temp.t_pay(v_r9, 'reversal', -700, 'cash', v_d + 2, 'worcester', v_t0 + interval '3 hours 5 seconds', v_desk, v_dn, v_p9);
  -- B4: an edit that moves the payment to ANOTHER DAY and another school ('moved in'; the old day shows 'moved to')
  v_p10 := pg_temp.t_pay(v_r10, 'payment', 5500, 'cash', v_d + 1, 'worcester', (v_d + 1 + time '12:00') at time zone 'America/New_York', v_admin, v_an);
  perform pg_temp.t_pay(v_r10, 'reversal', -5500, 'cash', v_d + 2, 'worcester', v_t0 + interval '6 hours', v_admin, v_an, v_p10);
  v_p10b := pg_temp.t_pay(v_r10, 'payment', 5500, 'cash', v_d + 2, 'shrewsbury', v_t0 + interval '6 hours', v_admin, v_an);
  -- B3: a refund that was undone (the refund counts as nothing)
  v_t0 := (v_d + 3 + time '09:00') at time zone 'America/New_York';
  v_p11 := pg_temp.t_pay(v_r11, 'payment', 4000, 'cash', v_d + 3, 'worcester', v_t0, v_admin, v_an);
  v_p11r := pg_temp.t_pay(v_r11, 'refund', -500, 'cash', v_d + 3, 'worcester', v_t0 + interval '30 minutes', v_admin, v_an);
  perform pg_temp.t_pay(v_r11, 'reversal', 500, 'cash', v_d + 3, 'worcester', v_t0 + interval '1 hour', v_admin, v_an, v_p11r);

  -- R: other sections on the same day: a Star payment (candidate registered at Shrewsbury, taken at the Worcester desk) and
  -- a Color Belt event payment (Worcester event, taken at the Shrewsbury desk)
  insert into public.star_events (name, testing_date, start_time, where_code, registration_open,
                                  public_code_worcester, public_code_shrewsbury, created_by_name, updated_by_name)
  values (v_tag || ' star', v_today + 30, '10:00', 'worcester', false,
          public.testing_new_public_code(), public.testing_new_public_code(), '', '')
  returning id into v_sevt;
  perform public.star_copy_template_into_event(v_sevt);
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sevt, 'Fin52', 'St Shr', 'shrewsbury', 1, 0, 'cash', 'desk', '', '') returning id into v_sc;
  v_t := (v_d + time '10:00') at time zone 'America/New_York';
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_sc, 'payment', 14000, 'cash', v_d, 'worcester', v_t, v_admin, v_an);
  v_cb_cls := (pg_temp.t_call(v_c_a1, format('public.testing_add_class(%L, %L, null, true)', 'worcester', v_tag)) ->> 'id')::uuid;
  v_cb_rank := (pg_temp.t_call(v_c_a1,
    format('public.testing_add_rank(%L, %L, 6500, 7500, 8500, false, %L, %L, null, 0, %L)', v_cb_cls, 'Yellow', 'solid', 'yellow', 'yellow')) ->> 'id')::uuid;
  v_cb_ev := (pg_temp.t_call(v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' event', v_today + 5,
    jsonb_build_array(jsonb_build_object('class_id', v_cb_cls, 'start_time', '17:00', 'end_time', '18:00'))::text)) ->> 'id')::uuid;
  if v_cb_rank is null or v_cb_ev is null then
    raise exception 'TEST SETUP: could not create the test Color Belt class / event';
  end if;
  select k.id into v_cb_er from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_cb_ev and k.rank_id = v_cb_rank;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_cb_ev, v_cb_er, 'Fin52', 'Ev Cb', 'cash', true, 'staff') returning id into v_cb_reg;
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_cb_reg, 'payment', 6500, 'cash', v_d, 'shrewsbury', v_t + interval '4 hours', v_admin, v_an);
  perform set_config('tkd.actor_label', '', true);

  -- ===================================================================
  -- B1 / B2 / B6. Day v_d: where each Board breaking payment counts
  -- ===================================================================
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  v_rs := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('B1 the Worcester-desk payment is on WORCESTER''s list, as Board breaking, with the way to pay and who took it',
    pg_temp.t_mine(v_rw, 'Cash W'), 'board_breaking:counted:-:1200:' || v_an || ':cash');
  perform pg_temp.t_eq('B1 ... and not on Shrewsbury''s', pg_temp.t_mine(v_rs, 'Cash W'), '');
  perform pg_temp.t_eq('B1 the Shrewsbury-desk payment of a Worcester event is on SHREWSBURY''s list',
    pg_temp.t_mine(v_rs, 'Desk S'), 'board_breaking:counted:-:1500:' || v_an || ':cash');
  perform pg_temp.t_eq('B1 ... and not on Worcester''s', pg_temp.t_mine(v_rw, 'Desk S'), '');
  perform pg_temp.t_eq('B2 a Square payment is on the EVENT''s school (Worcester), recorded by "Square", card',
    pg_temp.t_mine(v_rw, 'Sq W'), 'board_breaking:counted:-:975:Square:card');
  perform pg_temp.t_eq('B2 ... and not on Shrewsbury''s', pg_temp.t_mine(v_rs, 'Sq W'), '');
  perform pg_temp.t_eq('B2 a Square payment of a Shrewsbury event is on Shrewsbury''s list only',
    pg_temp.t_mine(v_rs, 'Sq S') || '/' || pg_temp.t_mine(v_rw, 'Sq S'), 'board_breaking:counted:-:975:Square:card/');
  perform pg_temp.t_eq('B1 the Board breaking payment of a check', pg_temp.t_mine(v_rw, 'Ref'), 'board_breaking:counted:-:3000:' || v_an || ':check');
  -- the line carries its event and its names
  v_it := (select e from jsonb_array_elements(v_rw -> 'items') e where e ->> 'last_name' = 'Cash W');
  perform pg_temp.t_eq('B1 the line: first name | event name | event day | private | kind',
    concat_ws('|', v_it ->> 'first_name', v_it ->> 'event_name', v_it ->> 'event_date', v_it ->> 'is_private', v_it ->> 'kind'),
    'Fin52|' || v_tag || ' Wor night|' || v_ew_date::text || '|false|payment');
  perform pg_temp.t_eq('B1 every Board breaking line of the day says "board_breaking" in source and what',
    (select count(*)::text from jsonb_array_elements(v_rw -> 'items') e
      where e ->> 'last_name' in ('Cash W', 'Sq W', 'Ref') and e ->> 'source' = 'board_breaking' and e ->> 'what' = 'board_breaking'), '3');
  -- B6: Worcester: 1200 + 975 + 3000 Board breaking, + 14000 Star (taken at Worcester);  Shrewsbury: 1500 + 975, + 6500 Color Belt
  perform pg_temp.t_eq('B6 Worcester: the Board breaking lines that count', pg_temp.t_bb(v_rw), '3|5175');
  perform pg_temp.t_eq('B6 Shrewsbury: the Board breaking lines that count', pg_temp.t_bb(v_rs), '2|2475');
  perform pg_temp.t_eq('B6 Worcester: count | total | cash | check | card', pg_temp.t_tot(v_rw), '4|19175|15200|3000|975');
  perform pg_temp.t_eq('B6 Shrewsbury: count | total | cash | check | card', pg_temp.t_tot(v_rs), '3|8975|8000|0|975');
  perform pg_temp.t_eq('B6 no Board breaking line is private or without a name',
    (select count(*)::text from jsonb_array_elements(v_rw -> 'items') e where e ->> 'source' = 'board_breaking' and (e ->> 'is_private' <> 'false' or e ->> 'last_name' is null)), '0');
  -- R: the other sections on the same day count where they always did
  perform pg_temp.t_eq('R the Star payment (candidate at Shrewsbury, taken at Worcester) is still on WORCESTER''s list',
    pg_temp.t_mine(v_rw, 'St Shr'), 'star:counted:-:14000:' || v_an || ':cash');
  perform pg_temp.t_eq('R the Color Belt event payment (Worcester event, taken at Shrewsbury) is still on SHREWSBURY''s list',
    pg_temp.t_mine(v_rs, 'Ev Cb'), 'color_belt:counted:-:6500:' || v_an || ':cash');
  perform pg_temp.t_eq('R ... and neither is on the other list', pg_temp.t_mine(v_rs, 'St Shr') || '/' || pg_temp.t_mine(v_rw, 'Ev Cb'), '/');
  -- the export of the same day says the same
  v_rw1 := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'worcester', v_d, v_d));
  v_rs1 := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'shrewsbury', v_d, v_d));
  perform pg_temp.t_eq('B7 export Worcester = its Daily report (names)', (select string_agg(distinct e ->> 'last_name', ',' order by e ->> 'last_name')
    from jsonb_array_elements(v_rw1 -> 'rows') e), pg_temp.t_names(v_rw));
  perform pg_temp.t_eq('B7 export Shrewsbury = its Daily report (names)', (select string_agg(distinct e ->> 'last_name', ',' order by e ->> 'last_name')
    from jsonb_array_elements(v_rs1 -> 'rows') e), pg_temp.t_names(v_rs));
  perform pg_temp.t_eq('B7 the export rows say the school the line counts at',
    (select string_agg(distinct e ->> 'school', ',') from jsonb_array_elements(v_rw1 -> 'rows') e) || '/'
      || (select string_agg(distinct e ->> 'school', ',') from jsonb_array_elements(v_rs1 -> 'rows') e), 'worcester/shrewsbury');
  v_it := (select e from jsonb_array_elements(v_rw1 -> 'rows') e where e ->> 'last_name' = 'Sq W');
  perform pg_temp.t_eq('B7 export row of the Square payment: what | event_name | recorded_by_name | method | counted_cents | state',
    concat_ws('|', v_it ->> 'what', v_it ->> 'event_name', v_it ->> 'recorded_by_name', v_it ->> 'method', v_it ->> 'counted_cents', v_it ->> 'state'),
    'board_breaking|' || v_tag || ' Wor night|Square|card|975|counted');
  perform pg_temp.t_eq('B7 only Board breaking (and camp / Black Belt) rows carry event_name in the export',
    (select count(*)::text from jsonb_array_elements(v_rw1 -> 'rows') e where e ? 'event_name' and e ->> 'what' in ('star', 'color_belt')), '0');
  perform pg_temp.t_eq('B7 the export total of Board breaking money on Worcester = the report''s',
    (select sum((e ->> 'counted_cents')::integer)::text from jsonb_array_elements(v_rw1 -> 'rows') e where e ->> 'what' = 'board_breaking'), '5175');

  -- ===================================================================
  -- B3. Day v_d + 1: the refund (counts at the desk that handed the money back) and the moved payment's first day
  -- ===================================================================
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d + 1));
  v_rs := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d + 1));
  v_it := (select e from jsonb_array_elements(v_rs -> 'items') e where e ->> 'last_name' = 'Ref');
  perform pg_temp.t_eq('B3 the refund line is on SHREWSBURY''s list (where it was handed back)',
    concat_ws('|', v_it ->> 'source', v_it ->> 'kind', v_it ->> 'amount_cents', v_it ->> 'state', v_it ->> 'method'), 'board_breaking|refund|-1000|counted|cash');
  perform pg_temp.t_eq('B3 Shrewsbury: Refunds count | cents | cash | check | card', pg_temp.t_ref(v_rs), '1|-1000|-1000|0|0');
  perform pg_temp.t_eq('B3 Shrewsbury: the total is after the refund', v_rs #>> '{totals,total_cents}', '-1000');
  perform pg_temp.t_eq('B3 Worcester has no refund that day and no counted line (the moved payment shows its "moved to" line only)',
    pg_temp.t_names(v_rw) || '|' || pg_temp.t_ref(v_rw) || '|' || (v_rw #>> '{totals,total_cents}'), 'Moved|0|0|0|0|0|0');
  perform pg_temp.t_eq('B4 the moved payment, old day: a moved_out line at Worcester (where it was first taken)',
    pg_temp.t_mine(v_rw, 'Moved'), 'board_breaking:moved_out:-:5500:' || v_an || ':cash');
  v_rw1 := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'shrewsbury', v_d + 1, v_d + 1));
  perform pg_temp.t_eq('B3 export: the refund row is -1000 and counts -1000',
    (select concat_ws('|', e ->> 'kind', e ->> 'amount_cents', e ->> 'counted_cents') from jsonb_array_elements(v_rw1 -> 'rows') e where e ->> 'last_name' = 'Ref'),
    'refund|-1000|-1000');

  -- ===================================================================
  -- B4 / B5. Day v_d + 2: edits, an undone payment, a hidden one
  -- ===================================================================
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d + 2));
  v_rs := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d + 2));
  perform pg_temp.t_eq('B4 the moved edit shows ONCE, at Shrewsbury, as edited, and says it was Worcester',
    pg_temp.t_mine(v_rs, 'Edit Move'), 'board_breaking:edited:worcester:2500:' || v_an || ':check');
  perform pg_temp.t_eq('B4 Worcester keeps nothing of it', pg_temp.t_mine(v_rw, 'Edit Move'), '');
  perform pg_temp.t_eq('B4 the same-school edit shows once, edited, no was_school', pg_temp.t_mine(v_rw, 'Edit Same'),
    'board_breaking:edited:-:1900:' || v_an || ':cash');
  perform pg_temp.t_eq('B4 ... but the key is there (null)',
    (select count(*)::text from jsonb_array_elements(v_rw -> 'items') e where e ->> 'last_name' = 'Edit Same' and e ? 'was_school' and e -> 'was_school' = 'null'::jsonb), '1');
  perform pg_temp.t_eq('B4 the edit that changed day and school: moved_in at Shrewsbury, was Worcester',
    pg_temp.t_mine(v_rs, 'Moved'), 'board_breaking:moved_in:worcester:5500:' || v_an || ':cash');
  perform pg_temp.t_eq('B4 ... Worcester does not list it on the new day', pg_temp.t_mine(v_rw, 'Moved'), '');
  perform pg_temp.t_eq('B5 the undone payment: one line, undone', pg_temp.t_mine(v_rw, 'Undone'), 'board_breaking:undone:-:2200:' || v_an || ':cash');
  perform pg_temp.t_eq('B5 the staff''s own Undo within 10 seconds leaves no line at all', pg_temp.t_mine(v_rw, 'Hidden'), '');
  perform pg_temp.t_eq('B5 Worcester: only what counts is in the total (1900; not the undone 2200, not the hidden 700)',
    pg_temp.t_tot(v_rw), '1|1900|1900|0|0');
  perform pg_temp.t_eq('B6 Shrewsbury: 2500 check + 5500 cash', pg_temp.t_tot(v_rs), '2|8000|5500|2500|0');
  -- the export
  v_rs1 := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'shrewsbury', v_d + 2, v_d + 2));
  perform pg_temp.t_eq('B4 export row of the moved edit: school | state | was_school',
    (select concat_ws('|', e ->> 'school', e ->> 'state', e ->> 'was_school') from jsonb_array_elements(v_rs1 -> 'rows') e where e ->> 'last_name' = 'Edit Move'),
    'shrewsbury|edited|worcester');
  v_rw1 := pg_temp.t_call(v_c_a1, format('public.finance_export(%L, %L, %L)', 'worcester', v_d + 2, v_d + 2));
  perform pg_temp.t_eq('B4 export row of the same-school edit: note | counted_cents',
    (select concat_ws('|', e ->> 'note', e ->> 'counted_cents') from jsonb_array_elements(v_rw1 -> 'rows') e where e ->> 'last_name' = 'Edit Same' and e ->> 'state' = 'edited'),
    'was $18.00 cash|1900');
  perform pg_temp.t_eq('B5 export row of the undone payment counts 0 and says who undid it',
    (select concat_ws('|', e ->> 'counted_cents', e ->> 'note') from jsonb_array_elements(v_rw1 -> 'rows') e where e ->> 'last_name' = 'Undone'),
    '0|undone by ' || v_an || ' on ' || (v_d + 2)::text);
  perform pg_temp.t_eq('B5 export: the hidden payment is not in it', (select count(*)::text from jsonb_array_elements(v_rw1 -> 'rows') e where e ->> 'last_name' = 'Hidden'), '0');

  -- ===================================================================
  -- B3. Day v_d + 3: a refund that was undone
  -- ===================================================================
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d + 3));
  perform pg_temp.t_eq('B3 the payment counts, the undone refund is a line that counts as nothing',
    pg_temp.t_mine(v_rw, 'Ref Undo'), 'board_breaking:counted:-:4000:' || v_an || ':cash,board_breaking:undone:-:-500:' || v_an || ':cash');
  perform pg_temp.t_eq('B3 Refunds figures: none; total 4000', pg_temp.t_ref(v_rw) || '|' || (v_rw #>> '{totals,total_cents}'), '0|0|0|0|0|4000');

  -- ===================================================================
  -- B7. Payment detail
  -- ===================================================================
  -- the edit that moved school: the day item's payment_id is the chain's first payment
  v_rs := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d + 2));
  v_it := (select e from jsonb_array_elements(v_rs -> 'items') e where e ->> 'last_name' = 'Edit Move');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L)', 'board_breaking', v_it ->> 'payment_id'));
  perform pg_temp.t_eq('B7 detail of the edited payment: status | school | was_school | state | source',
    concat_ws('|', v_r ->> 'status', v_r #>> '{item,school}', v_r #>> '{item,was_school}', v_r #>> '{item,state}', v_r #>> '{item,source}'),
    'ok|shrewsbury|worcester|edited|board_breaking');
  perform pg_temp.t_eq('B7 ... the item and the answer carry the event name; the answer its id',
    concat_ws('|', v_r #>> '{item,event_name}', v_r ->> 'event_name', v_r ->> 'event_id', v_r #>> '{item,first_name}', v_r #>> '{item,last_name}'),
    v_tag || ' Wor night|' || v_tag || ' Wor night|' || v_ew::text || '|Fin52|Edit Move');
  perform pg_temp.t_eq('B7 ... its trail: edited (the new $25.00 check), then recorded (the first $20.00 cash)',
    (select string_agg(h ->> 'what' || ':' || (h ->> 'amount_cents') || ':' || (h ->> 'method') || ':' || (h ->> 'by_name'), ',' order by ord)
       from jsonb_array_elements(v_r -> 'history') with ordinality as t(h, ord)),
    'edited:2500:check:' || v_an || ',recorded:2000:cash:' || v_an);
  -- a Square payment
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  v_it := (select e from jsonb_array_elements(v_rw -> 'items') e where e ->> 'last_name' = 'Sq W');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L)', 'board_breaking', v_it ->> 'payment_id'));
  perform pg_temp.t_eq('B7 detail of the Square payment: status | school | recorded_by_name | method | amount',
    concat_ws('|', v_r ->> 'status', v_r #>> '{item,school}', v_r #>> '{item,recorded_by_name}', v_r #>> '{item,method}', v_r #>> '{item,amount_cents}'),
    'ok|worcester|Square|card|975');
  perform pg_temp.t_eq('B7 ... its trail is one line: recorded by Square',
    (select string_agg(h ->> 'what' || ':' || (h ->> 'by_name'), ',') from jsonb_array_elements(v_r -> 'history') h), 'recorded:Square');
  -- the undone payment
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d + 2));
  v_it := (select e from jsonb_array_elements(v_rw -> 'items') e where e ->> 'last_name' = 'Undone');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L)', 'board_breaking', v_it ->> 'payment_id'));
  perform pg_temp.t_eq('B7 detail of the undone payment: state | trail (undone, then recorded)',
    (v_r #>> '{item,state}') || '|' || (select string_agg(h ->> 'what', ',' order by ord) from jsonb_array_elements(v_r -> 'history') with ordinality as t(h, ord)),
    'undone|undone,recorded');
  -- a refund
  v_rs := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_d + 1));
  v_it := (select e from jsonb_array_elements(v_rs -> 'items') e where e ->> 'last_name' = 'Ref');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L)', 'board_breaking', v_it ->> 'payment_id'));
  perform pg_temp.t_eq('B7 detail of the refund: status | school | kind | trail',
    concat_ws('|', v_r ->> 'status', v_r #>> '{item,school}', v_r #>> '{item,kind}',
              (select string_agg(h ->> 'what' || ':' || (h ->> 'amount_cents'), ',') from jsonb_array_elements(v_r -> 'history') h)),
    'ok|shrewsbury|refund|refunded:-1000');
  -- a payment id of another source or none: not found, an unknown source: invalid
  perform pg_temp.t_eq('B7 an unknown payment id -> not_found',
    pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L)', 'board_breaking', gen_random_uuid())) ->> 'status', 'not_found');
  perform pg_temp.t_eq('B7 a Board breaking payment id asked as another source -> not_found',
    pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L)', 'camp', v_p1)) ->> 'status', 'not_found');
  perform pg_temp.t_eq('B7 an unknown source -> invalid',
    pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L)', 'board_breaker', v_p1)) ->> 'status', 'invalid');

  -- ===================================================================
  -- B7. History (the month)
  -- ===================================================================
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_history(null, %L)', v_d));
  perform pg_temp.t_eq('B7 History: Worcester, day v_d - total | count | tag',
    (select concat_ws('|', e ->> 'total_cents', e ->> 'count', e ->> 'tag') from jsonb_array_elements(v_r -> 'days') e
      where e ->> 'day' = v_d::text and e ->> 'school' = 'worcester'), '19175|4|not_closed');
  perform pg_temp.t_eq('B7 History: Shrewsbury, day v_d - total | count',
    (select concat_ws('|', e ->> 'total_cents', e ->> 'count') from jsonb_array_elements(v_r -> 'days') e
      where e ->> 'day' = v_d::text and e ->> 'school' = 'shrewsbury'), '8975|3');
  perform pg_temp.t_eq('B7 History: Shrewsbury, day v_d + 1 (only the refund) - total',
    (select e ->> 'total_cents' from jsonb_array_elements(v_r -> 'days') e where e ->> 'day' = (v_d + 1)::text and e ->> 'school' = 'shrewsbury'), '-1000');
  perform pg_temp.t_eq('B7 History: Worcester, day v_d + 2 - total',
    (select e ->> 'total_cents' from jsonb_array_elements(v_r -> 'days') e where e ->> 'day' = (v_d + 2)::text and e ->> 'school' = 'worcester'), '1900');
  perform pg_temp.t_eq('B7 History: Shrewsbury, day v_d + 2 - total',
    (select e ->> 'total_cents' from jsonb_array_elements(v_r -> 'days') e where e ->> 'day' = (v_d + 2)::text and e ->> 'school' = 'shrewsbury'), '8000');
  -- a school picked in History is the school's days only
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_history(%L, %L)', 'shrewsbury', v_d));
  perform pg_temp.t_eq('B7 History for Shrewsbury lists no Worcester day',
    (select count(*)::text from jsonb_array_elements(v_r -> 'days') e where e ->> 'school' <> 'shrewsbury'), '0');

  -- ===================================================================
  -- B8. Close the day takes Board breaking items
  -- ===================================================================
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('B8 the day can be closed', v_rw ->> 'can_close', 'true');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_close_day(%L, %L, %L, %s, %s, %s, %s, null)', 'worcester', v_d, v_rw ->> 'fingerprint',
    (v_rw #>> '{totals,cash,cents}')::integer + (v_rw #>> '{refunds,cash_cents}')::integer,
    v_rw #>> '{totals,check,count}', v_rw #>> '{totals,check,cents}', (v_rw #>> '{totals,card,cents}')::integer));
  perform pg_temp.t_eq('B8 Close the day answered ok', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('B8 ... cash, checks and card all match',
    concat_ws('|', v_r #>> '{results,cash,result}', v_r #>> '{results,checks,result}', v_r #>> '{results,card,result}'),
    'matches|matches|matches');
  select c.id into v_closing from public.finance_day_closings c where c.location_code = 'worcester' and c.day = v_d and c.kind = 'close';
  perform pg_temp.t_eq('B8 the close''s snapshot holds the Board breaking items (3) and the other sections'' (1 Star)',
    (select string_agg(i.source || '=' || n, ',' order by i.source collate "C")
       from (select i.source, count(*)::text as n from public.finance_day_closing_items i where i.closing_id = v_closing group by i.source) i),
    'board_breaking=3,star=1');
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('B8 the closed day shows no change after closing', v_rw #>> '{closing,changed_after}', 'false');
  -- a Board breaking payment written AFTER the close (one minute later)
  v_pl := pg_temp.t_pay(pg_temp.t_reg(v_ew, v_cw, 'Late', 800, 'cash'), 'payment', 800, 'cash', v_d, 'worcester', now() + interval '1 minute', v_admin, v_an);
  v_rw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_d));
  v_it := (select e from jsonb_array_elements(v_rw -> 'items') e where e ->> 'last_name' = 'Late');
  perform pg_temp.t_eq('B8 a Board breaking payment added after the close: the line says so, the close says "changed after closing"',
    concat_ws('|', v_it ->> 'added_after_closing', v_rw #>> '{closing,changed_after}', v_rw #>> '{closing,changed_count}'), 'true|true|1');
  perform pg_temp.t_eq('B8 ... the lines before it do not',
    (select count(*)::text from jsonb_array_elements(v_rw -> 'items') e where e ->> 'last_name' in ('Cash W', 'Sq W', 'Ref') and e ->> 'added_after_closing' = 'true'), '0');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_history(%L, %L)', 'worcester', v_d));
  perform pg_temp.t_eq('B8 History marks the day "changed after closing"',
    (select e ->> 'tag' from jsonb_array_elements(v_r -> 'days') e where e ->> 'day' = v_d::text), 'changed_after_closing');

  -- ===================================================================
  -- B9. The app's REAL writers, on today's report (names, not totals: real money may be on today's report)
  -- ===================================================================
  v_t1 := pg_temp.t_reg(v_et, v_ct, 'Real Desk', 1000, 'cash');
  v_t2 := pg_temp.t_reg(v_et, v_ct, 'Real Undo', 1000, 'cash');
  v_t3 := pg_temp.t_reg(v_et, v_ct, 'Real Edit', 1000, 'cash');
  v_t4 := pg_temp.t_reg(v_et, v_ct, 'Real Refund', 1000, 'cash');
  v_t5 := pg_temp.t_reg(v_et, v_ct, 'Real Square', 975, 'card');
  -- the front desk marks four students paid (at the Worcester desk)
  v_tp := (pg_temp.t_call(v_c_d1, format('public.brk_mark_paid(%L, %s, %L)', v_t1, pg_temp.t_ver(v_t1), 'worcester')) ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call(v_c_d1, format('public.brk_mark_paid(%L, %s, %L)', v_t2, pg_temp.t_ver(v_t2), 'worcester'));
  perform pg_temp.t_eq('B9 setup: Mark paid (Real Undo) ok', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call(v_c_d1, format('public.brk_undo_payment(%L)', v_r ->> 'payment_id'));
  perform pg_temp.t_eq('B9 setup: the desk''s own Undo within 10 seconds ok', v_r ->> 'status', 'ok');
  v_tp3 := (pg_temp.t_call(v_c_d1, format('public.brk_mark_paid(%L, %s, %L)', v_t3, pg_temp.t_ver(v_t3), 'worcester')) ->> 'payment_id')::uuid;
  v_tp4 := (pg_temp.t_call(v_c_d1, format('public.brk_mark_paid(%L, %s, %L)', v_t4, pg_temp.t_ver(v_t4), 'worcester')) ->> 'payment_id')::uuid;
  -- an admin edits Real Edit: $13.00 by check, taken at the Shrewsbury desk
  v_r := pg_temp.t_call(v_c_a1, format('public.brk_edit_payment(%L, %L, 1300, %L, %L)', v_tp3, 'check', v_today, 'shrewsbury'));
  perform pg_temp.t_eq('B9 setup: Edit payment ok', v_r ->> 'status', 'ok');
  -- an admin lowers Real Refund's price to $5.00 and hands $5.00 back in cash at the Worcester desk
  v_r := pg_temp.t_call(v_c_a1, format('public.brk_set_override(%L, %s, 500)', v_t4, pg_temp.t_ver(v_t4)));
  perform pg_temp.t_eq('B9 setup: price override ok', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call(v_c_a1, format('public.brk_record_refund(%L, %s, %L, 500, %L, %L)', v_t4, pg_temp.t_ver(v_t4), 'cash', v_today, 'worcester'));
  perform pg_temp.t_eq('B9 setup: Record refund ok', v_r ->> 'status', 'ok');
  -- Square tells us Real Square paid (the event is at Worcester)
  update public.brk_registrations set square_order_id = 'ord-fin52', square_link_url = 'https://square.link/u/fin52' where id = v_t5;
  perform set_config('request.jwt.claims', '', true);
  v_txt := left(gen_random_uuid()::text, 8);
  v_r := public.brk_square_payment('worcester', 'evt-fin52-' || v_txt, 'pay-fin52-' || v_txt, 'ord-fin52', 975, 'USD', 'COMPLETED');
  perform pg_temp.t_eq('B9 setup: Square''s payment is recorded', v_r ->> 'outcome', 'paid');

  v_bw := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  v_bs := pg_temp.t_call(v_c_a1, format('public.finance_day(%L, %L)', 'shrewsbury', v_today));
  perform pg_temp.t_eq('B9 the desk''s payment: counted, at Worcester, by the desk''s own name',
    pg_temp.t_mine(v_bw, 'Real Desk') || '/' || pg_temp.t_mine(v_bs, 'Real Desk'), 'board_breaking:counted:-:1000:' || v_dn || ':cash/');
  perform pg_temp.t_eq('B9 the desk''s own quick Undo leaves no line on either report',
    pg_temp.t_mine(v_bw, 'Real Undo') || '/' || pg_temp.t_mine(v_bs, 'Real Undo'), '/');
  perform pg_temp.t_eq('B9 the admin''s Edit payment (new school Shrewsbury): once, edited, was Worcester, on Shrewsbury only',
    pg_temp.t_mine(v_bs, 'Real Edit') || '/' || pg_temp.t_mine(v_bw, 'Real Edit'), 'board_breaking:edited:worcester:1300:' || v_an || ':check/');
  perform pg_temp.t_eq('B9 payment and refund of Real Refund, both at Worcester',
    pg_temp.t_mine(v_bw, 'Real Refund'), 'board_breaking:counted:-:-500:' || v_an || ':cash,board_breaking:counted:-:1000:' || v_dn || ':cash');
  perform pg_temp.t_eq('B9 Square''s payment: at the event''s school, "Square", card',
    pg_temp.t_mine(v_bw, 'Real Square'), 'board_breaking:counted:-:975:Square:card');
  -- today's Board breaking money adds up on top of what was there before the test
  perform pg_temp.t_eq('B9 Worcester today: the total = before + the Board breaking lines that count',
    (v_bw #>> '{totals,total_cents}'), ((v_base_w #>> '{totals,total_cents}')::integer + split_part(pg_temp.t_bb(v_bw), '|', 2)::integer
        - split_part(pg_temp.t_bb(v_base_w), '|', 2)::integer)::text);
  perform pg_temp.t_eq('B9 Worcester today: 4 Board breaking lines that count: 1000 (desk) + 1000 and -500 (Real Refund) + 975 (Square) = 2475',
    (select (split_part(pg_temp.t_bb(v_bw), '|', 1)::integer - split_part(pg_temp.t_bb(v_base_w), '|', 1)::integer)::text || '|'
         || (split_part(pg_temp.t_bb(v_bw), '|', 2)::integer - split_part(pg_temp.t_bb(v_base_w), '|', 2)::integer)::text), '4|2475');
  perform pg_temp.t_eq('B9 Shrewsbury today: 1300 (the edit) of Board breaking money, 1 line',
    (split_part(pg_temp.t_bb(v_bs), '|', 1)::integer - split_part(pg_temp.t_bb(v_base_s), '|', 1)::integer)::text || '|'
      || (split_part(pg_temp.t_bb(v_bs), '|', 2)::integer - split_part(pg_temp.t_bb(v_base_s), '|', 2)::integer)::text, '1|1300');
  -- the detail of the real Square payment and of the real edit
  v_it := (select e from jsonb_array_elements(v_bw -> 'items') e where e ->> 'last_name' = 'Real Square');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L)', 'board_breaking', v_it ->> 'payment_id'));
  perform pg_temp.t_eq('B9 detail of the real Square payment: recorded_by_name | school | event',
    concat_ws('|', v_r #>> '{item,recorded_by_name}', v_r #>> '{item,school}', v_r ->> 'event_name'), 'Square|worcester|' || v_tag || ' Wor today');
  v_it := (select e from jsonb_array_elements(v_bs -> 'items') e where e ->> 'last_name' = 'Real Edit');
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_payment_detail(%L, %L)', 'board_breaking', v_it ->> 'payment_id'));
  perform pg_temp.t_eq('B9 detail of the real edit: trail edited, recorded; the first payment was the desk''s',
    (select string_agg(h ->> 'what' || ':' || (h ->> 'by_name'), ',' order by ord) from jsonb_array_elements(v_r -> 'history') with ordinality as t(h, ord)),
    'edited:' || v_an || ',recorded:' || v_dn);
  -- the front desk sees today's Board breaking line and its detail, nothing older
  v_r := pg_temp.t_call(v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('A the front desk''s report of today shows the Board breaking line',
    pg_temp.t_mine(v_r, 'Real Desk'), 'board_breaking:counted:-:1000:' || v_dn || ':cash');
  v_r := pg_temp.t_call(v_c_d1, format('public.finance_payment_detail(%L, %L)', 'board_breaking', v_tp));
  perform pg_temp.t_eq('A the front desk may open today''s Board breaking payment', v_r ->> 'status', 'ok');

  -- ===================================================================
  -- A. Access
  -- ===================================================================
  perform pg_temp.t_eq('A the front desk: a past day -> not_allowed',
    pg_temp.t_call(v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_d)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('A the front desk: the export -> not_allowed',
    pg_temp.t_call(v_c_d1, format('public.finance_export(%L, %L, %L)', 'worcester', v_d, v_d)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('A the front desk: an older Board breaking payment -> not_allowed',
    pg_temp.t_call(v_c_d1, format('public.finance_payment_detail(%L, %L)', 'board_breaking', v_p1)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('A the front desk: History -> not_allowed',
    pg_temp.t_call(v_c_d1, format('public.finance_history(null, %L)', v_d)) ->> 'status', 'not_allowed');
  select string_agg(x.s, ',' order by x.n) into v_txt
    from (select 1 as n, 'signed out' as lbl, null::text as c union all select 2, 'PIN-locked admin', v_c_a2 union all select 3, 'locked desk', v_c_d2) k,
         lateral (select k.n, k.lbl || ':' || (pg_temp.t_call(k.c, format('public.finance_day(%L, %L)', 'worcester', v_d)) ->> 'status') || '/'
                                      || (pg_temp.t_call(k.c, format('public.finance_payment_detail(%L, %L)', 'board_breaking', v_p1)) ->> 'status') || '/'
                                      || (pg_temp.t_call(k.c, format('public.finance_export(%L, %L, %L)', 'worcester', v_d, v_d)) ->> 'status') as s) x;
  perform pg_temp.t_eq('A signed out / PIN-locked / locked: Daily report, detail and export all answer no_access, so no Board breaking line is read',
    v_txt, 'signed out:no_access/no_access/no_access,PIN-locked admin:no_access/no_access/no_access,locked desk:no_access/no_access/no_access');

  -- ===================================================================
  -- C. The five functions and the table rule: security and rights
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
     and p.proname in ('finance_chain_steps_core', 'finance_money_rows_core', 'finance_day', 'finance_payment_detail', 'finance_export');
  perform pg_temp.t_eq('C definer / settings / anon / authenticated / service_role / PUBLIC, per function', v_txt,
    'finance_chain_steps_core=false/search_path=""/false/false/false/false,'
    || 'finance_day=true/search_path=""/false/true/false/false,'
    || 'finance_export=true/search_path=""/false/true/false/false,'
    || 'finance_money_rows_core=false/search_path=""/false/false/false/false,'
    || 'finance_payment_detail=true/search_path=""/false/true/false/false');
  perform pg_temp.t_eq('C the table rule allows exactly the five sources',
    (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = to_regclass('public.finance_day_closing_items') and c.conname = 'finance_day_closing_items_source_check'),
    'CHECK ((source = ANY (ARRAY[''color_belt''::text, ''star''::text, ''camp''::text, ''black_belt''::text, ''board_breaking''::text])))');
  perform pg_temp.t_eq('C every function of schema public that Finance has is still for nobody but the owner or authenticated (no PUBLIC, no anon)',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'finance\_%'
        and (has_function_privilege('anon', p.oid, 'execute')
             or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0))), '0');

  -- ===================================================================
  -- K. Privacy: every key in every Finance answer is on the fixed list; no login id anywhere
  -- ===================================================================
  select string_agg(distinct k, ', ') into v_bad
    from t_answers a, lateral pg_temp.t_keys(a.r) as k
   where (a.fn like 'public.finance_day(%' or a.fn like 'public.finance_payment_detail(%' or a.fn like 'public.finance_export(%'
          or a.fn like 'public.finance_history(%')
     and k <> all (v_allowed_keys);
  perform pg_temp.t_eq('K keys not on Finance''s list', coalesce(v_bad, ''), '');
  select count(*)::integer into v_n
    from t_answers a
   where a.fn like 'public.finance%'
     and (position(v_admin::text in a.r::text) > 0 or position(v_desk::text in a.r::text) > 0);
  perform pg_temp.t_eq('K no Finance answer holds a login id', v_n::text, '0');
  select count(*)::integer into v_n
    from t_answers a
   where a.fn like 'public.finance%' and (a.r::text like '%square_link%' or a.r::text like '%square_order%' or a.r::text like '%square_payment_id%');
  perform pg_temp.t_eq('K no Finance answer holds a Square link, order id or payment id', v_n::text, '0');
end
$$;

select 'ALL 0052 TESTS PASSED' as result;

rollback;
