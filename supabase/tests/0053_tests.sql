-- =====================================================================
-- 0053_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The tests for migration 0053 (Board breaking: an admin may permanently
--   remove a student, or a whole event, once the money of every student
--   concerned nets to zero and no closed Finance day counted it; rulebook
--   v1.307; contract docs/Board Breaking/CONTRACT-0053.md). It checks:
--     D  removing ONE student: never paid (as before); paid then undone
--        (net 0: the payment rows go with the student); an edited payment
--        (still standing: refused; then undone: removed); a partly refunded
--        payment (refused), then the refund and the payment undone
--        (removed); a payment refunded in full (net 0: removed); money
--        standing (refused, nothing removed); stale / not found / invalid;
--        the other students of the same event are untouched
--     C  closed Finance days: a closing item that names one of the
--        student's payments (by its chain id, or by its row id) refuses with
--        closed_day and removes nothing; an item of another source does not;
--        money standing beats closed_day (has_payments is checked first); a close
--        that was undone or reopened counts nothing, a day closed again counts again
--     E  removing a whole EVENT: students never paid / undone / refunded in
--        full / edited-and-undone are all removed with their payment rows,
--        their classes and the event; another event is untouched; ONE
--        student whose money stands (or one payment a closed day counted)
--        refuses and removes NOTHING (all or nothing); an event with no
--        students; stale / not found / invalid
--     A  access: the front desk (role staff) gets not_allowed; signed-out,
--        PIN-locked and locked sessions get no_access; nothing is removed
--     G  the guard on the payments table: outside the two functions a
--        direct DELETE and every UPDATE still fail; a wrong note (another
--        student, another event, nonsense, the wrong kind of id) fails; the
--        note is cleared after every removal; the INSERT rules are the
--        same; the app's logins can not remove a row even with the right
--        note (no DELETE right on the table)
--     Q  Square: a Square payment (no login) that was undone can be
--        removed; a Square payment that still stands refuses; a message
--        that arrives afterwards (a replay of the same id, or a new id for
--        the same payment) makes no payment
--     L  history: every removed row (payments, student, classes, event) is
--        in change_log with the right action
--     K  privacy: every answer is exactly {"status": ...}, no login id
--     R  rights: the two functions are security definer with an empty
--        search path, for authenticated only (nothing for anon / PUBLIC /
--        service_role / the two Board breaking logins); the guard is for
--        nobody but the owner and still fires before insert, update and
--        delete; nobody in the app can write the payments table
--   The events, students, payments, undos, edits and refunds are made with
--   the app's REAL functions (Mark paid, Undo, Edit payment, price override
--   + Record refund, Undo refund, Square's payment function); two special
--   cases (a refund in full, a closed Finance day's items) are written
--   straight into the tables because no function makes them.
--
-- IS IT SAFE?
--   Yes. One transaction ending with ROLLBACK. NEVER change the final
--   "rollback;" to "commit;". It makes its own events called "zz t53 ...", so
--   it works whatever is already in the database.
--
-- BEFORE YOU RUN IT
--   0051, 0052 and 0053 are applied. Replace <paste-admin-UID-here> and
--   <paste-desk-UID-here> (Authentication -> Users: an ACTIVE admin and the
--   ACTIVE front-desk login) and run the whole file in the SQL Editor.
--   Passed: one row "ALL 0053 TESTS PASSED" (and how many checks ran).
--   Failed: "TEST FAILED: ..." / "TEST SETUP: ..."; nothing was saved. If it
--   failed, run   rollback;   on its own once.
-- =====================================================================

begin;

-- every answer a function gave (for K)
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

-- t_eq(label, got, want): fail when they differ (as text); counts the check
create function pg_temp.t_eq(p_label text, p_got text, p_want text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'TEST FAILED: % - got %, expected %', p_label, coalesce(p_got, 'NULL'), coalesce(p_want, 'NULL');
  end if;
  perform set_config('tkd.t53', (coalesce(nullif(current_setting('tkd.t53', true), ''), '0')::integer + 1)::text, true);
end;
$$;

-- t_ok(label, condition): fail unless true
create function pg_temp.t_ok(p_label text, p_ok boolean)
returns void
language plpgsql
as $$
begin
  perform pg_temp.t_eq(p_label, coalesce(p_ok, false)::text, 'true');
end;
$$;

-- t_ver(registration) / t_evv(event): the current version (the "expected version" the functions want)
create function pg_temp.t_ver(p_reg uuid) returns integer language sql as $$
  select r.version from public.brk_registrations r where r.id = p_reg;
$$;
create function pg_temp.t_evv(p_ev uuid) returns integer language sql as $$
  select e.version from public.brk_events e where e.id = p_ev;
$$;

-- t_net(registration): what its payment rows add up to; t_npay: how many rows
create function pg_temp.t_net(p_reg uuid) returns integer language sql as $$
  select coalesce(sum(p.amount_cents), 0)::integer from public.brk_payments p where p.registration_id = p_reg;
$$;
create function pg_temp.t_npay(p_reg uuid) returns integer language sql as $$
  select count(*)::integer from public.brk_payments p where p.registration_id = p_reg;
$$;

-- t_here(registration): does the student still exist?
create function pg_temp.t_here(p_reg uuid) returns boolean language sql as $$
  select exists (select 1 from public.brk_registrations r where r.id = p_reg);
$$;

-- t_snap(event): "students|payment rows|net cents|classes|event exists" - to prove a refusal removed nothing
create function pg_temp.t_snap(p_ev uuid) returns text language sql as $$
  select (select count(*) from public.brk_registrations r where r.event_id = p_ev)::text
         || '|' || (select count(*) from public.brk_payments p join public.brk_registrations r on r.id = p.registration_id where r.event_id = p_ev)::text
         || '|' || (select coalesce(sum(p.amount_cents), 0) from public.brk_payments p join public.brk_registrations r on r.id = p.registration_id where r.event_id = p_ev)::text
         || '|' || (select count(*) from public.brk_event_classes c where c.event_id = p_ev)::text
         || '|' || exists (select 1 from public.brk_events e where e.id = p_ev)::text;
$$;

-- t_event(name, school, days from today): an event with one class; returns the event id
create function pg_temp.t_event(p_name text, p_school text, p_days integer)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.brk_events (name, location_code, event_date, public_code, created_by_name, updated_by_name)
  values (p_name, p_school, public.testing_today() + p_days, public.testing_new_public_code(), '', '')
  returning id into v_id;
  insert into public.brk_event_classes (event_id, name, start_time, end_time, sort) values (v_id, 'Group A', '17:00', '18:00', 0);
  return v_id;
end;
$$;

-- t_reg(event, last name, amount, paying by): a student, written straight in
create function pg_temp.t_reg(p_event uuid, p_last text, p_amount integer, p_paying text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.brk_registrations
    (event_id, class_id, first_name, last_name, age, rank_name, band_used, tech_boards, adult_boards, paying_by,
     paying_by_on_form, same_day, amount_cents, source, entered_by, created_by_name, updated_by_name)
  values (p_event, (select c.id from public.brk_event_classes c where c.event_id = p_event order by c.sort, c.id limit 1),
          'Del53', p_last, 10, 'Yellow', 'child', 1, 0, p_paying, p_paying, false, p_amount, 'desk', 'Test 0053', '', '')
  returning id into v_id;
  return v_id;
end;
$$;

-- t_pay(registration, kind, cents, method, school, reverses): one payment row, written straight in
create function pg_temp.t_pay(p_reg uuid, p_kind text, p_cents integer, p_method text, p_school text, p_reverses uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.brk_payments
    (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (p_reg, p_kind, p_cents, p_method, public.testing_today(), p_school, now(), null, 'Test 0053', p_reverses)
  returning id into v_id;
  return v_id;
end;
$$;

-- t_mark(login, registration): the app's Mark paid; returns the payment id
create function pg_temp.t_mark(p_claims text, p_reg uuid) returns uuid
language plpgsql
as $$
declare
  v_r jsonb;
begin
  v_r := pg_temp.t_call(p_claims, format('public.brk_mark_paid(%L, %s, %L)', p_reg, pg_temp.t_ver(p_reg), 'worcester'));
  if v_r ->> 'status' <> 'ok' then
    raise exception 'TEST SETUP: Mark paid answered %', v_r;
  end if;
  return (v_r ->> 'payment_id')::uuid;
end;
$$;

-- t_undo(login, payment): the app's Undo (works for payments and, as an admin, any payment)
create function pg_temp.t_undo(p_claims text, p_pay uuid) returns void
language plpgsql
as $$
declare
  v_r jsonb;
begin
  v_r := pg_temp.t_call(p_claims, format('public.brk_undo_payment(%L)', p_pay));
  if v_r ->> 'status' <> 'ok' then
    raise exception 'TEST SETUP: Undo answered %', v_r;
  end if;
end;
$$;

-- t_delreg / t_delev: the app's two functions, with the CURRENT version unless one is given
create function pg_temp.t_delreg(p_claims text, p_reg uuid, p_ver integer default null) returns jsonb
language plpgsql
as $$
begin
  return pg_temp.t_call(p_claims, format('public.brk_delete_registration(%L, %s)', p_reg, coalesce(p_ver, pg_temp.t_ver(p_reg))));
end;
$$;
create function pg_temp.t_delev(p_claims text, p_ev uuid, p_ver integer default null) returns jsonb
language plpgsql
as $$
begin
  return pg_temp.t_call(p_claims, format('public.brk_delete_event(%L, %s)', p_ev, coalesce(p_ver, pg_temp.t_evv(p_ev))));
end;
$$;

-- t_fails(sql): true when the statement raises (as the SQL Editor's own role, no note)
create function pg_temp.t_fails(p_sql text) returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception
  when others then
    return true;
end;
$$;

-- t_fails_note(note, sql): true when the statement raises while the transaction-local note
-- tkd.brk_purge says p_note; the note is cleared afterwards either way
create function pg_temp.t_fails_note(p_note text, p_sql text) returns boolean
language plpgsql
as $$
begin
  perform set_config('tkd.brk_purge', p_note, true);
  begin
    execute p_sql;
    perform set_config('tkd.brk_purge', '', true);
    return false;
  exception
    when others then
      perform set_config('tkd.brk_purge', '', true);
      return true;
  end;
end;
$$;

-- t_try_as(role, note, sql): the SQLSTATE the statement raises when run as that role with the
-- note set ('ok' when it did not raise); back to the SQL Editor's role afterwards
create function pg_temp.t_try_as(p_role text, p_note text, p_sql text) returns text
language plpgsql
as $$
declare
  v_state text;
begin
  perform set_config('tkd.brk_purge', p_note, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v_state := 'ok';
  exception
    when others then
      v_state := sqlstate;
  end;
  reset role;
  perform set_config('tkd.brk_purge', '', true);
  return v_state;
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

  v_a1 uuid := gen_random_uuid();   -- admin, unlocked
  v_a2 uuid := gen_random_uuid();   -- admin, PIN-locked (the unlock ran out)
  v_d1 uuid := gen_random_uuid();   -- front desk, unlocked
  v_d2 uuid := gen_random_uuid();   -- front desk, locked (never unlocked)
  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_a2 text; v_c_d1 text; v_c_d2 text;

  v_tag   text := 'zz t53 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_role  text;
  v_r     jsonb;
  v_txt   text;
  v_n     integer;
  v_bad   text;

  v_cd      date := date '2019-03-04';   -- the day of the pretend closing
  v_closing uuid;
  v_cd2     date := date '2019-03-05';   -- the day of the closes that are undone, reopened and made again (C5)
  v_closing2 uuid; v_closing3 uuid;
  v_e7 uuid; v_e8 uuid;
  v_sa1 uuid; v_sa2 uuid; v_sb1 uuid; v_sb2 uuid;
  v_pa1 uuid; v_pa2 uuid; v_pb1 uuid; v_pb2 uuid;

  v_ew uuid; v_ex uuid; v_ey uuid; v_ez uuid;   -- events
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid; v_e5 uuid; v_e6 uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_s6 uuid; v_s7 uuid; v_s8 uuid; v_s9 uuid; v_s10 uuid; v_s11 uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid; v_p7 uuid;
  v_q uuid; v_q2 uuid;
  v_ids uuid[];
  v_snap text;
  v_snap2 text;
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
  if to_regclass('public.brk_payments') is null or to_regclass('public.brk_registrations') is null
     or to_regprocedure('public.brk_mark_paid(uuid, integer, text, text)') is null then
    raise exception 'TEST SETUP: 0051 (Board breaking) must be applied first';
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = to_regclass('public.finance_day_closing_items')
                    and c.conname = 'finance_day_closing_items_source_check' and pg_get_constraintdef(c.oid) like '%board_breaking%') then
    raise exception 'TEST SETUP: 0052 must be applied first';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.brk_payments_guard()') and p.prosrc like '%brk_purge%')
     or not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.brk_delete_registration(uuid, integer)') and p.prosrc like '%closed_day%')
     or not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.brk_delete_event(uuid, integer)') and p.prosrc like '%closed_day%') then
    raise exception 'TEST SETUP: 0053 must be applied first';
  end if;
  if exists (select 1 from public.finance_day_closings c where c.day in (v_cd, v_cd2)) then
    raise exception 'TEST SETUP: a Finance closing exists on % or %; this test needs those days empty', v_cd, v_cd2;
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

  perform set_config('tkd.actor_label', 'PGlite 0053 test', true);

  -- ===================================================================
  -- D. Removing ONE student
  -- ===================================================================
  v_e1 := pg_temp.t_event(v_tag || ' D', 'worcester', 200);

  -- D1 never paid: removed, as before 0053
  v_s1 := pg_temp.t_reg(v_e1, 'D1 Never', 1000, 'cash');
  v_r := pg_temp.t_delreg(v_c_a1, v_s1);
  perform pg_temp.t_eq('D1 a student who was never paid is removed', v_r ->> 'status', 'ok');
  perform pg_temp.t_ok('D1 ... and gone', not pg_temp.t_here(v_s1));

  -- D2 paid, then undone (net 0): the student and the payment rows are removed
  v_s2 := pg_temp.t_reg(v_e1, 'D2 Undone', 1000, 'cash');
  v_p1 := pg_temp.t_mark(v_c_a1, v_s2);
  perform pg_temp.t_undo(v_c_a1, v_p1);
  perform pg_temp.t_eq('D2 setup: two rows, net 0', pg_temp.t_npay(v_s2) || '|' || pg_temp.t_net(v_s2), '2|0');
  select array_agg(p.id) into v_ids from public.brk_payments p where p.registration_id = v_s2;
  v_r := pg_temp.t_delreg(v_c_a1, v_s2);
  perform pg_temp.t_eq('D2 a paid-then-undone student is removed (net 0)', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('D2 ... the student is gone and so are both payment rows',
    pg_temp.t_here(v_s2)::text || '|' || (select count(*) from public.brk_payments p where p.id = any(v_ids)), 'false|0');
  perform pg_temp.t_eq('D2 ... and the history keeps every removed row (payment, reversal, student) with the delete action',
    (select count(*) from public.change_log c
      where c.op = 'delete' and c.action = 'brk_delete_registration'
        and ((c.table_name = 'brk_payments' and c.record_id = any(v_ids)) or (c.table_name = 'brk_registrations' and c.record_id = v_s2)))::text, '3');

  -- D3 an EDITED payment: still standing (refused); then undone too (net 0): removed
  v_s3 := pg_temp.t_reg(v_e1, 'D3 Edited', 1000, 'cash');
  v_p2 := pg_temp.t_mark(v_c_a1, v_s3);
  v_r := pg_temp.t_call(v_c_a1, format('public.brk_edit_payment(%L, %L, 1300, %L, %L)', v_p2, 'check', v_today, 'worcester'));
  perform pg_temp.t_eq('D3 setup: Edit payment ok', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('D3 setup: payment + reversal + new payment, net 1300', pg_temp.t_npay(v_s3) || '|' || pg_temp.t_net(v_s3), '3|1300');
  v_r := pg_temp.t_delreg(v_c_a1, v_s3);
  perform pg_temp.t_eq('D3 an edit chain whose new payment still stands is refused: has_payments', v_r ->> 'status', 'has_payments');
  perform pg_temp.t_eq('D3 ... nothing was removed', pg_temp.t_here(v_s3)::text || '|' || pg_temp.t_npay(v_s3) || '|' || pg_temp.t_net(v_s3), 'true|3|1300');
  perform pg_temp.t_undo(v_c_a1, (select p.id from public.brk_payments p
                                   where p.registration_id = v_s3 and p.kind = 'payment' and p.amount_cents = 1300));
  perform pg_temp.t_eq('D3 setup: the new payment undone too: 4 rows, net 0', pg_temp.t_npay(v_s3) || '|' || pg_temp.t_net(v_s3), '4|0');
  v_r := pg_temp.t_delreg(v_c_a1, v_s3);
  perform pg_temp.t_eq('D3 the edit chain that nets to 0 is removed', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('D3 ... student and all four rows gone', pg_temp.t_here(v_s3)::text || '|' || pg_temp.t_npay(v_s3), 'false|0');

  -- D4 a partly refunded payment: refused; then the refund and the payment undone (net 0): removed
  v_s4 := pg_temp.t_reg(v_e1, 'D4 Refunded', 1000, 'cash');
  v_p4 := pg_temp.t_mark(v_c_a1, v_s4);
  v_r := pg_temp.t_call(v_c_a1, format('public.brk_set_override(%L, %s, 400)', v_s4, pg_temp.t_ver(v_s4)));
  perform pg_temp.t_eq('D4 setup: price lowered to $4.00', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call(v_c_a1, format('public.brk_record_refund(%L, %s, %L, 600, %L, %L)', v_s4, pg_temp.t_ver(v_s4), 'cash', v_today, 'worcester'));
  perform pg_temp.t_eq('D4 setup: $6.00 handed back', v_r ->> 'status', 'ok');
  v_p5 := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('D4 payment 1000 and refund -600 stand: net 400', pg_temp.t_net(v_s4)::text, '400');
  v_r := pg_temp.t_delreg(v_c_a1, v_s4);
  perform pg_temp.t_eq('D4 money still standing after a partial refund: has_payments', v_r ->> 'status', 'has_payments');
  perform pg_temp.t_eq('D4 ... nothing was removed', pg_temp.t_here(v_s4)::text || '|' || pg_temp.t_npay(v_s4), 'true|2');
  v_r := pg_temp.t_call(v_c_a1, format('public.brk_undo_refund(%L)', v_p5));
  perform pg_temp.t_eq('D4 setup: the refund undone', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_delreg(v_c_a1, v_s4);
  perform pg_temp.t_eq('D4 after only the refund was undone the payment still stands (net 1000): has_payments', v_r ->> 'status', 'has_payments');
  perform pg_temp.t_undo(v_c_a1, v_p4);
  perform pg_temp.t_eq('D4 setup: refund, its reversal, payment, its reversal: 4 rows, net 0', pg_temp.t_npay(v_s4) || '|' || pg_temp.t_net(v_s4), '4|0');
  v_r := pg_temp.t_delreg(v_c_a1, v_s4);
  perform pg_temp.t_eq('D4 refund + its reversal + undone payment: removed', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('D4 ... student and all four rows gone', pg_temp.t_here(v_s4)::text || '|' || pg_temp.t_npay(v_s4), 'false|0');

  -- D5 a payment refunded IN FULL (a refund row that stands, net 0): removed
  v_s5 := pg_temp.t_reg(v_e1, 'D5 Full refund', 1000, 'cash');
  v_p6 := pg_temp.t_pay(v_s5, 'payment', 1000, 'cash', 'worcester');
  perform pg_temp.t_pay(v_s5, 'refund', -1000, 'cash', 'worcester');
  perform pg_temp.t_eq('D5 setup: payment 1000 + refund -1000 = net 0 (the refund stands)', pg_temp.t_npay(v_s5) || '|' || pg_temp.t_net(v_s5), '2|0');
  v_r := pg_temp.t_delreg(v_c_a1, v_s5);
  perform pg_temp.t_eq('D5 a payment refunded in full is removed', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('D5 ... student and both rows gone', pg_temp.t_here(v_s5)::text || '|' || pg_temp.t_npay(v_s5), 'false|0');

  -- D6 money standing: refused, nothing removed
  v_s6 := pg_temp.t_reg(v_e1, 'D6 Standing', 1000, 'cash');
  v_p7 := pg_temp.t_mark(v_c_a1, v_s6);
  v_r := pg_temp.t_delreg(v_c_a1, v_s6);
  perform pg_temp.t_eq('D6 a payment that still counts: has_payments', v_r ->> 'status', 'has_payments');
  perform pg_temp.t_eq('D6 ... the student and the payment are still there', pg_temp.t_here(v_s6)::text || '|' || pg_temp.t_npay(v_s6) || '|' || pg_temp.t_net(v_s6), 'true|1|1000');

  -- D7 stale / not found / invalid
  v_s7 := pg_temp.t_reg(v_e1, 'D7 Stale', 1000, 'cash');
  v_r := pg_temp.t_delreg(v_c_a1, v_s7, pg_temp.t_ver(v_s7) - 1);
  perform pg_temp.t_eq('D7 a stale version is refused', v_r ->> 'status', 'stale');
  perform pg_temp.t_ok('D7 ... and removes nothing', pg_temp.t_here(v_s7));
  v_r := pg_temp.t_call(v_c_a1, format('public.brk_delete_registration(%L, 1)', gen_random_uuid()));
  perform pg_temp.t_eq('D7 an unknown student: not_found', v_r ->> 'status', 'not_found');
  v_r := pg_temp.t_call(v_c_a1, 'public.brk_delete_registration(null, null)');
  perform pg_temp.t_eq('D7 no id and no version: invalid', v_r ->> 'status', 'invalid');
  v_r := pg_temp.t_call(v_c_a1, format('public.brk_delete_registration(%L, null)', v_s7));
  perform pg_temp.t_eq('D7 no version: invalid', v_r ->> 'status', 'invalid');

  -- D8 the other students of the same event are untouched by a removal
  --    (v_s6 stands, v_s7 was never paid; add one undone student and remove it)
  v_s8 := pg_temp.t_reg(v_e1, 'D8 Undone', 1000, 'cash');
  perform pg_temp.t_undo(v_c_a1, pg_temp.t_mark(v_c_a1, v_s8));
  v_snap := pg_temp.t_snap(v_e1);          -- students | rows | net | classes | exists, with D8
  v_r := pg_temp.t_delreg(v_c_a1, v_s8);
  perform pg_temp.t_eq('D8 the undone student is removed', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('D8 the event now has one student fewer and two rows fewer; its other students, their money, the class and the event are as they were',
    pg_temp.t_snap(v_e1), (split_part(v_snap, '|', 1)::integer - 1) || '|' || (split_part(v_snap, '|', 2)::integer - 2) || '|' ||
                          split_part(v_snap, '|', 3) || '|' || split_part(v_snap, '|', 4) || '|' || split_part(v_snap, '|', 5));
  perform pg_temp.t_eq('D8 the standing payment of D6 is untouched', pg_temp.t_npay(v_s6) || '|' || pg_temp.t_net(v_s6), '1|1000');

  -- ===================================================================
  -- C. Closed Finance days
  -- ===================================================================
  insert into public.finance_day_closings
    (location_code, day, kind, cash_counted_cents, checks_counted, checks_counted_cents, card_counted_cents,
     expected_count, expected_cash_cents, expected_checks, expected_checks_cents, expected_card_cents, recorded_by_name)
  values ('worcester', v_cd, 'close', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Test 0053')
  returning id into v_closing;

  -- C1 a closing item names the student's FIRST payment (chain_id): net 0, but closed_day
  v_s9 := pg_temp.t_reg(v_e1, 'C1 Chain', 1000, 'cash');
  v_p1 := pg_temp.t_mark(v_c_a1, v_s9);
  perform pg_temp.t_undo(v_c_a1, v_p1);
  insert into public.finance_day_closing_items (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
  values (v_closing, 'worcester', 'board_breaking', v_p1, v_p1, 'payment', 'cash', 1000);
  v_snap := pg_temp.t_snap(v_e1);
  v_r := pg_temp.t_delreg(v_c_a1, v_s9);
  perform pg_temp.t_eq('C1 a payment a closed day counted (by its chain id): closed_day', v_r ->> 'status', 'closed_day');
  perform pg_temp.t_eq('C1 ... nothing was removed (student, rows, event)', pg_temp.t_snap(v_e1), v_snap);

  -- C2 a closing item names only a ROW of the chain (row_id): the undone payment's reversal
  v_s10 := pg_temp.t_reg(v_e1, 'C2 Row', 1000, 'cash');
  v_p2 := pg_temp.t_mark(v_c_a1, v_s10);
  perform pg_temp.t_undo(v_c_a1, v_p2);
  insert into public.finance_day_closing_items (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
  values (v_closing, 'worcester', 'board_breaking', gen_random_uuid(),
          (select p.id from public.brk_payments p where p.registration_id = v_s10 and p.kind = 'reversal'), 'payment', 'cash', 1000);
  v_r := pg_temp.t_delreg(v_c_a1, v_s10);
  perform pg_temp.t_eq('C2 a closing item that names one of the rows (row_id): closed_day', v_r ->> 'status', 'closed_day');
  perform pg_temp.t_ok('C2 ... the student and both rows are still there', pg_temp.t_here(v_s10) and pg_temp.t_npay(v_s10) = 2);

  -- C3 an item of ANOTHER source with the same id does not block
  v_s11 := pg_temp.t_reg(v_e1, 'C3 Other', 1000, 'cash');
  v_p3 := pg_temp.t_mark(v_c_a1, v_s11);
  perform pg_temp.t_undo(v_c_a1, v_p3);
  insert into public.finance_day_closing_items (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
  values (v_closing, 'worcester', 'star', v_p3, v_p3, 'payment', 'cash', 1000);
  v_r := pg_temp.t_delreg(v_c_a1, v_s11);
  perform pg_temp.t_eq('C3 a closing item of another source with the same id does not block (the rule is about source board_breaking)', v_r ->> 'status', 'ok');

  -- C4 money standing beats closed_day (has_payments is checked first)
  v_p4 := pg_temp.t_mark(v_c_a1, pg_temp.t_reg(v_e1, 'C4 Both', 1000, 'cash'));
  insert into public.finance_day_closing_items (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
  values (v_closing, 'worcester', 'board_breaking', v_p4, v_p4, 'payment', 'cash', 1000);
  v_r := pg_temp.t_delreg(v_c_a1, (select p.registration_id from public.brk_payments p where p.id = v_p4));
  perform pg_temp.t_eq('C4 a standing payment that a closed day also counted: has_payments (checked first)', v_r ->> 'status', 'has_payments');

  -- C5. A close that was UNDONE or REOPENED counts nothing any more; a day that is closed AGAIN counts again.
  --     (An undo / reopen is a row of finance_day_closings that points at the close with reverses_closing_id.)
  --     Students A1, A2 (one by one) and two events E7, E8 (a student each), every one paid and undone (net 0).
  v_sa1 := pg_temp.t_reg(v_e1, 'C5 A1', 1000, 'cash');
  v_sa2 := pg_temp.t_reg(v_e1, 'C5 A2', 1000, 'cash');
  v_e7 := pg_temp.t_event(v_tag || ' C5 E7', 'worcester', 208);
  v_e8 := pg_temp.t_event(v_tag || ' C5 E8', 'shrewsbury', 209);
  v_sb1 := pg_temp.t_reg(v_e7, 'C5 B1', 1000, 'cash');
  v_sb2 := pg_temp.t_reg(v_e8, 'C5 B2', 1000, 'cash');
  v_pa1 := pg_temp.t_mark(v_c_a1, v_sa1);  perform pg_temp.t_undo(v_c_a1, v_pa1);
  v_pa2 := pg_temp.t_mark(v_c_a1, v_sa2);  perform pg_temp.t_undo(v_c_a1, v_pa2);
  v_pb1 := pg_temp.t_mark(v_c_a1, v_sb1);  perform pg_temp.t_undo(v_c_a1, v_pb1);
  v_pb2 := pg_temp.t_mark(v_c_a1, v_sb2);  perform pg_temp.t_undo(v_c_a1, v_pb2);
  -- a close counts all four payments
  insert into public.finance_day_closings
    (location_code, day, kind, cash_counted_cents, checks_counted, checks_counted_cents, card_counted_cents,
     expected_count, expected_cash_cents, expected_checks, expected_checks_cents, expected_card_cents, recorded_by_name)
  values ('worcester', v_cd2, 'close', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Test 0053')
  returning id into v_closing2;
  insert into public.finance_day_closing_items (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
  select v_closing2, 'worcester', 'board_breaking', x, x, 'payment', 'cash', 1000 from unnest(array[v_pa1, v_pa2, v_pb1, v_pb2]) as x;
  perform pg_temp.t_eq('C5 a student a close in force counted: closed_day', pg_temp.t_delreg(v_c_a1, v_sa1) ->> 'status', 'closed_day');
  perform pg_temp.t_eq('C5 an event with a student a close in force counted: closed_day', pg_temp.t_delev(v_c_a1, v_e7) ->> 'status', 'closed_day');
  perform pg_temp.t_ok('C5 ... nothing was removed', pg_temp.t_here(v_sa1) and pg_temp.t_snap(v_e7) = '1|2|0|1|true');
  -- an admin undoes that close: the day is open again and counts nothing
  insert into public.finance_day_closings (location_code, day, kind, reverses_closing_id, recorded_by_name)
  values ('worcester', v_cd2, 'undo', v_closing2, 'Test 0053');
  perform pg_temp.t_eq('C5 after the close was undone the student can be removed', pg_temp.t_delreg(v_c_a1, v_sa1) ->> 'status', 'ok');
  perform pg_temp.t_eq('C5 ... and so can the event', pg_temp.t_delev(v_c_a1, v_e7) ->> 'status', 'ok');
  perform pg_temp.t_ok('C5 ... they and their rows are gone', not pg_temp.t_here(v_sa1) and pg_temp.t_snap(v_e7) = '0|0|0|0|false');
  -- the day is closed AGAIN (new items for the same payments): caught again, although the first close is still undone
  insert into public.finance_day_closings
    (location_code, day, kind, cash_counted_cents, checks_counted, checks_counted_cents, card_counted_cents,
     expected_count, expected_cash_cents, expected_checks, expected_checks_cents, expected_card_cents, recorded_by_name)
  values ('worcester', v_cd2, 'close', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Test 0053')
  returning id into v_closing3;
  insert into public.finance_day_closing_items (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
  select v_closing3, 'worcester', 'board_breaking', x, x, 'payment', 'cash', 1000 from unnest(array[v_pa2, v_pb2]) as x;
  perform pg_temp.t_eq('C5 after the day was closed again: the student is caught again (closed_day)', pg_temp.t_delreg(v_c_a1, v_sa2) ->> 'status', 'closed_day');
  perform pg_temp.t_eq('C5 ... and so is the event', pg_temp.t_delev(v_c_a1, v_e8) ->> 'status', 'closed_day');
  perform pg_temp.t_ok('C5 ... nothing was removed', pg_temp.t_here(v_sa2) and pg_temp.t_snap(v_e8) = '1|2|0|1|true');
  -- a REOPEN of the second close frees them again
  insert into public.finance_day_closings (location_code, day, kind, reverses_closing_id, recorded_by_name)
  values ('worcester', v_cd2, 'reopen', v_closing3, 'Test 0053');
  perform pg_temp.t_eq('C5 after the second close was reopened the student can be removed', pg_temp.t_delreg(v_c_a1, v_sa2) ->> 'status', 'ok');
  perform pg_temp.t_eq('C5 ... and so can the event', pg_temp.t_delev(v_c_a1, v_e8) ->> 'status', 'ok');
  perform pg_temp.t_ok('C5 ... they and their rows are gone', not pg_temp.t_here(v_sa2) and pg_temp.t_snap(v_e8) = '0|0|0|0|false');

  -- ===================================================================
  -- E. Removing a whole EVENT
  -- ===================================================================
  -- E1: students never paid / undone / refunded in full / edited then undone, one class, and ANOTHER event that must not be touched
  v_ew := pg_temp.t_event(v_tag || ' E whole', 'worcester', 201);
  v_ex := pg_temp.t_event(v_tag || ' E other', 'shrewsbury', 202);
  v_s1 := pg_temp.t_reg(v_ew, 'E1 Never', 1000, 'cash');
  v_s2 := pg_temp.t_reg(v_ew, 'E1 Undone', 1000, 'cash');
  perform pg_temp.t_undo(v_c_a1, pg_temp.t_mark(v_c_a1, v_s2));
  v_s3 := pg_temp.t_reg(v_ew, 'E1 Full refund', 1000, 'cash');
  perform pg_temp.t_pay(v_s3, 'payment', 1000, 'cash', 'worcester');
  perform pg_temp.t_pay(v_s3, 'refund', -1000, 'cash', 'worcester');
  v_s4 := pg_temp.t_reg(v_ew, 'E1 Edited', 1000, 'cash');
  v_p1 := pg_temp.t_mark(v_c_a1, v_s4);
  perform pg_temp.t_call(v_c_a1, format('public.brk_edit_payment(%L, %L, 1300, %L, %L)', v_p1, 'check', v_today, 'worcester'));
  perform pg_temp.t_undo(v_c_a1, (select p.id from public.brk_payments p where p.registration_id = v_s4 and p.kind = 'payment' and p.amount_cents = 1300));
  -- the other event: one student who paid and stands, one undone
  v_s5 := pg_temp.t_reg(v_ex, 'E1 Other paid', 1000, 'cash');
  perform pg_temp.t_mark(v_c_a1, v_s5);
  v_s6 := pg_temp.t_reg(v_ex, 'E1 Other undone', 1000, 'cash');
  perform pg_temp.t_undo(v_c_a1, pg_temp.t_mark(v_c_a1, v_s6));
  select array_agg(p.id) into v_ids from public.brk_payments p where p.registration_id in (v_s1, v_s2, v_s3, v_s4);
  perform pg_temp.t_eq('E1 setup: four students, 2 + 2 + 4 rows = 8 payment rows, all netting to 0', pg_temp.t_snap(v_ew), '4|8|0|1|true');
  v_snap := pg_temp.t_snap(v_ex);
  v_r := pg_temp.t_delev(v_c_a1, v_ew);
  perform pg_temp.t_eq('E1 an event whose students all net to 0 is removed', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('E1 ... students, payment rows, class and event are all gone', pg_temp.t_snap(v_ew), '0|0|0|0|false');
  perform pg_temp.t_eq('E1 ... none of its payment rows is left anywhere', (select count(*) from public.brk_payments p where p.id = any(v_ids))::text, '0');
  perform pg_temp.t_eq('E1 ... the other event, its students and their money are untouched', pg_temp.t_snap(v_ex), v_snap);
  perform pg_temp.t_eq('E1 ... the history keeps the event, its class, its 4 students and all 8 payment rows, with the delete action',
    (select count(*) from public.change_log c
      where c.op = 'delete' and c.action = 'brk_delete_event'
        and ((c.table_name = 'brk_events' and c.record_id = v_ew)
             or (c.table_name = 'brk_event_classes' and (c.before ->> 'event_id')::uuid = v_ew)
             or (c.table_name = 'brk_registrations' and (c.before ->> 'event_id')::uuid = v_ew)
             or (c.table_name = 'brk_payments' and c.record_id = any(v_ids))))::text, '14');

  -- E2: ALL OR NOTHING - one student whose money stands: nothing at all is removed
  v_e2 := pg_temp.t_event(v_tag || ' E2', 'worcester', 203);
  v_s1 := pg_temp.t_reg(v_e2, 'E2 Undone', 1000, 'cash');
  perform pg_temp.t_undo(v_c_a1, pg_temp.t_mark(v_c_a1, v_s1));
  v_s2 := pg_temp.t_reg(v_e2, 'E2 Standing', 1000, 'cash');
  perform pg_temp.t_mark(v_c_a1, v_s2);
  v_s3 := pg_temp.t_reg(v_e2, 'E2 Never', 1000, 'cash');
  v_snap := pg_temp.t_snap(v_e2);
  v_r := pg_temp.t_delev(v_c_a1, v_e2);
  perform pg_temp.t_eq('E2 one student whose payment still counts: has_payments', v_r ->> 'status', 'has_payments');
  perform pg_temp.t_eq('E2 ... NOTHING was removed (all students, all rows, class, event)', pg_temp.t_snap(v_e2), v_snap);
  perform pg_temp.t_eq('E2 ... the undone student still has both of its rows', pg_temp.t_npay(v_s1) || '|' || pg_temp.t_net(v_s1), '2|0');
  -- ... and once the standing payment is undone too, the same call works
  perform pg_temp.t_undo(v_c_a1, (select p.id from public.brk_payments p where p.registration_id = v_s2 and p.kind = 'payment'));
  v_r := pg_temp.t_delev(v_c_a1, v_e2);
  perform pg_temp.t_eq('E2 after that payment is undone too, the event is removed', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('E2 ... everything gone', pg_temp.t_snap(v_e2), '0|0|0|0|false');

  -- E3: a closed day counted a payment of one student: closed_day, nothing removed
  v_e3 := pg_temp.t_event(v_tag || ' E3', 'worcester', 204);
  v_s1 := pg_temp.t_reg(v_e3, 'E3 Closed', 1000, 'cash');
  v_p1 := pg_temp.t_mark(v_c_a1, v_s1);
  perform pg_temp.t_undo(v_c_a1, v_p1);
  v_s2 := pg_temp.t_reg(v_e3, 'E3 Never', 1000, 'cash');
  insert into public.finance_day_closing_items (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
  values (v_closing, 'worcester', 'board_breaking', v_p1, v_p1, 'payment', 'cash', 1000);
  v_snap := pg_temp.t_snap(v_e3);
  v_r := pg_temp.t_delev(v_c_a1, v_e3);
  perform pg_temp.t_eq('E3 an event with a payment a closed day counted: closed_day', v_r ->> 'status', 'closed_day');
  perform pg_temp.t_eq('E3 ... nothing was removed', pg_temp.t_snap(v_e3), v_snap);

  -- E4: money standing AND a closed day: has_payments first
  v_e4 := pg_temp.t_event(v_tag || ' E4', 'worcester', 205);
  v_p2 := pg_temp.t_mark(v_c_a1, pg_temp.t_reg(v_e4, 'E4 Standing', 1000, 'cash'));
  insert into public.finance_day_closing_items (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
  values (v_closing, 'worcester', 'board_breaking', v_p2, v_p2, 'payment', 'cash', 1000);
  v_r := pg_temp.t_delev(v_c_a1, v_e4);
  perform pg_temp.t_eq('E4 standing money that a closed day also counted: has_payments (checked first)', v_r ->> 'status', 'has_payments');

  -- E5: an event with no students at all, and stale / not found / invalid
  v_e5 := pg_temp.t_event(v_tag || ' E5', 'shrewsbury', 206);
  v_r := pg_temp.t_delev(v_c_a1, v_e5, pg_temp.t_evv(v_e5) - 1);
  perform pg_temp.t_eq('E5 a stale event version is refused', v_r ->> 'status', 'stale');
  perform pg_temp.t_ok('E5 ... and removes nothing', exists (select 1 from public.brk_events e where e.id = v_e5));
  v_r := pg_temp.t_call(v_c_a1, format('public.brk_delete_event(%L, 1)', gen_random_uuid()));
  perform pg_temp.t_eq('E5 an unknown event: not_found', v_r ->> 'status', 'not_found');
  v_r := pg_temp.t_call(v_c_a1, 'public.brk_delete_event(null, null)');
  perform pg_temp.t_eq('E5 no id and no version: invalid', v_r ->> 'status', 'invalid');
  v_r := pg_temp.t_delev(v_c_a1, v_e5);
  perform pg_temp.t_eq('E5 an event with no students is removed', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('E5 ... with its class', pg_temp.t_snap(v_e5), '0|0|0|0|false');

  -- ===================================================================
  -- A. Access: the front desk and sessions without data access
  -- ===================================================================
  v_e6 := pg_temp.t_event(v_tag || ' A', 'worcester', 207);
  v_s1 := pg_temp.t_reg(v_e6, 'A Undone', 1000, 'cash');
  perform pg_temp.t_undo(v_c_a1, pg_temp.t_mark(v_c_a1, v_s1));
  v_snap := pg_temp.t_snap(v_e6);
  perform pg_temp.t_eq('A the front desk (role staff) may not remove a student: not_allowed',
    pg_temp.t_delreg(v_c_d1, v_s1) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('A the front desk may not remove an event: not_allowed',
    pg_temp.t_delev(v_c_d1, v_e6) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('A signed out: no_access (student)', pg_temp.t_delreg(null, v_s1) ->> 'status', 'no_access');
  perform pg_temp.t_eq('A signed out: no_access (event)', pg_temp.t_delev(null, v_e6) ->> 'status', 'no_access');
  perform pg_temp.t_eq('A a PIN-locked admin: no_access (student)', pg_temp.t_delreg(v_c_a2, v_s1) ->> 'status', 'no_access');
  perform pg_temp.t_eq('A a PIN-locked admin: no_access (event)', pg_temp.t_delev(v_c_a2, v_e6) ->> 'status', 'no_access');
  perform pg_temp.t_eq('A a locked front desk: no_access (student)', pg_temp.t_delreg(v_c_d2, v_s1) ->> 'status', 'no_access');
  perform pg_temp.t_eq('A a locked front desk: no_access (event)', pg_temp.t_delev(v_c_d2, v_e6) ->> 'status', 'no_access');
  perform pg_temp.t_eq('A ... none of those removed anything', pg_temp.t_snap(v_e6), v_snap);

  -- ===================================================================
  -- G. The guard on the payments table (as the SQL Editor's own role)
  -- ===================================================================
  -- v_s1 (A Undone) has 2 rows, net 0; v_s2 / v_s3 are in another event so a wrong note can name them
  v_s2 := pg_temp.t_reg(v_ex, 'G Other student', 1000, 'cash');
  v_p5 := pg_temp.t_mark(v_c_a1, v_s2);
  v_snap := pg_temp.t_snap(v_e6);
  perform pg_temp.t_ok('G a direct DELETE of a payment row is refused (no note)',
    pg_temp.t_fails(format('delete from public.brk_payments where registration_id = %L', v_s1)));
  perform pg_temp.t_ok('G ... also with the note empty or nonsense',
    pg_temp.t_fails_note('', format('delete from public.brk_payments where registration_id = %L', v_s1))
    and pg_temp.t_fails_note('x', format('delete from public.brk_payments where registration_id = %L', v_s1))
    and pg_temp.t_fails_note('student:', format('delete from public.brk_payments where registration_id = %L', v_s1))
    and pg_temp.t_fails_note('event:', format('delete from public.brk_payments where registration_id = %L', v_s1)));
  perform pg_temp.t_ok('G ... also with the note naming ANOTHER student',
    pg_temp.t_fails_note('student:' || v_s2::text, format('delete from public.brk_payments where registration_id = %L', v_s1)));
  perform pg_temp.t_ok('G ... also with the note naming ANOTHER event',
    pg_temp.t_fails_note('event:' || v_ex::text, format('delete from public.brk_payments where registration_id = %L', v_s1)));
  perform pg_temp.t_ok('G ... also with a student id in an event note, an event id in a student note, or the right id with a wrong word',
    pg_temp.t_fails_note('event:' || v_s1::text, format('delete from public.brk_payments where registration_id = %L', v_s1))
    and pg_temp.t_fails_note('student:' || v_e6::text, format('delete from public.brk_payments where registration_id = %L', v_s1))
    and pg_temp.t_fails_note('Student:' || v_s1::text, format('delete from public.brk_payments where registration_id = %L', v_s1))
    and pg_temp.t_fails_note(v_s1::text, format('delete from public.brk_payments where registration_id = %L', v_s1)));
  perform pg_temp.t_ok('G the right note opens the guard for THAT student only: another student''s row still fails (student note)',
    pg_temp.t_fails_note('student:' || v_s1::text, format('delete from public.brk_payments where registration_id = %L', v_s2)));
  perform pg_temp.t_ok('G ... and for THAT event only: a row of a student of another event still fails (event note)',
    pg_temp.t_fails_note('event:' || v_e6::text, format('delete from public.brk_payments where registration_id = %L', v_s2)));
  perform pg_temp.t_ok('G a payment row can never be UPDATED - not even with the right note',
    pg_temp.t_fails(format('update public.brk_payments set amount_cents = amount_cents where registration_id = %L', v_s1))
    and pg_temp.t_fails_note('student:' || v_s1::text, format('update public.brk_payments set amount_cents = amount_cents where registration_id = %L', v_s1))
    and pg_temp.t_fails_note('event:' || v_e6::text, format('update public.brk_payments set school = school where registration_id = %L', v_s1)));
  perform pg_temp.t_eq('G ... all those attempts removed and changed nothing', pg_temp.t_snap(v_e6), v_snap);
  perform pg_temp.t_eq('G ... the other student''s payment is untouched', pg_temp.t_npay(v_s2) || '|' || pg_temp.t_net(v_s2), '1|1000');
  perform pg_temp.t_eq('G the note is cleared after those attempts', coalesce(current_setting('tkd.brk_purge', true), ''), '');
  perform pg_temp.t_ok('G the INSERT rules are unchanged: a reversal must be exactly minus its payment',
    pg_temp.t_fails(format('insert into public.brk_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_by_name, reverses_payment_id)
                            values (%L, ''reversal'', -1, ''cash'', current_date, ''worcester'', ''zz'', %L)', v_s2, v_p5)));
  perform pg_temp.t_ok('G ... and a student''s rows can never add up to less than $0',
    pg_temp.t_fails(format('insert into public.brk_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
                            values (%L, ''refund'', -2500, ''cash'', current_date, ''worcester'', ''zz'')', v_s2)));
  perform pg_temp.t_ok('G the app''s logins (signed in, and anon) can not remove a payment even with the right note (no DELETE right on the table; the two Board breaking logins are checked in R)',
    pg_temp.t_try_as('authenticated', 'student:' || v_s1::text, format('delete from public.brk_payments where registration_id = %L', v_s1)) = '42501'
    and pg_temp.t_try_as('authenticated', 'event:' || v_e6::text, format('delete from public.brk_payments where registration_id = %L', v_s1)) = '42501'
    and pg_temp.t_try_as('anon', 'student:' || v_s1::text, format('delete from public.brk_payments where registration_id = %L', v_s1)) = '42501');
  perform pg_temp.t_ok('G ... nor change one (no UPDATE right)',
    pg_temp.t_try_as('authenticated', 'student:' || v_s1::text, format('update public.brk_payments set amount_cents = amount_cents where registration_id = %L', v_s1)) = '42501');
  perform pg_temp.t_eq('G ... and none of that removed anything', pg_temp.t_snap(v_e6), v_snap);
  -- the student can still be removed through the function afterwards (the guard still lets the function through)
  v_r := pg_temp.t_delreg(v_c_a1, v_s1);
  perform pg_temp.t_eq('G the function still removes the undone student after all those attempts', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('G the note is cleared after a removal by the function', coalesce(current_setting('tkd.brk_purge', true), ''), '');
  perform pg_temp.t_ok('G ... and a direct DELETE fails again right after it',
    pg_temp.t_fails(format('delete from public.brk_payments where registration_id = %L', v_s2)));
  v_r := pg_temp.t_delev(v_c_a1, v_e6);
  perform pg_temp.t_eq('G an event removal clears the note too', coalesce(current_setting('tkd.brk_purge', true), ''), '');

  -- ===================================================================
  -- Q. Square (a payment with no login)
  -- ===================================================================
  v_txt := left(gen_random_uuid()::text, 8);
  v_q  := pg_temp.t_reg(v_ex, 'Q Square undone', 975, 'card');
  v_q2 := pg_temp.t_reg(v_ex, 'Q Square standing', 975, 'card');
  update public.brk_registrations set square_order_id = 'ord-t53a-' || v_txt, square_link_url = 'https://square.link/u/t53a' where id = v_q;
  update public.brk_registrations set square_order_id = 'ord-t53b-' || v_txt, square_link_url = 'https://square.link/u/t53b' where id = v_q2;
  perform set_config('request.jwt.claims', '', true);
  v_r := public.brk_square_payment('shrewsbury', 'evt-t53a-' || v_txt, 'pay-t53a-' || v_txt, 'ord-t53a-' || v_txt, 975, 'USD', 'COMPLETED');
  perform pg_temp.t_eq('Q setup: Square''s payment for the first student is recorded', v_r ->> 'outcome', 'paid');
  v_r := public.brk_square_payment('shrewsbury', 'evt-t53b-' || v_txt, 'pay-t53b-' || v_txt, 'ord-t53b-' || v_txt, 975, 'USD', 'COMPLETED');
  perform pg_temp.t_eq('Q setup: Square''s payment for the second student is recorded', v_r ->> 'outcome', 'paid');
  perform pg_temp.t_eq('Q setup: both payments carry no login and the name Square',
    (select count(*) from public.brk_payments p where p.registration_id in (v_q, v_q2) and p.recorded_by is null and p.recorded_by_name = 'Square')::text, '2');
  v_r := pg_temp.t_delreg(v_c_a1, v_q);
  perform pg_temp.t_eq('Q a Square payment that still stands: has_payments', v_r ->> 'status', 'has_payments');
  perform pg_temp.t_undo(v_c_a1, (select p.id from public.brk_payments p where p.registration_id = v_q and p.kind = 'payment'));
  perform pg_temp.t_eq('Q setup: an admin undid it: 2 rows, net 0', pg_temp.t_npay(v_q) || '|' || pg_temp.t_net(v_q), '2|0');
  v_r := pg_temp.t_delreg(v_c_a1, v_q);
  perform pg_temp.t_eq('Q an undone Square payment (no login) lets the student be removed', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('Q ... the student and both rows are gone; the other Square student is untouched',
    pg_temp.t_here(v_q)::text || '|' || pg_temp.t_npay(v_q) || '|' || pg_temp.t_npay(v_q2) || '|' || pg_temp.t_net(v_q2), 'false|0|1|975');
  perform set_config('request.jwt.claims', '', true);
  v_r := public.brk_square_payment('shrewsbury', 'evt-t53a-' || v_txt, 'pay-t53a-' || v_txt, 'ord-t53a-' || v_txt, 975, 'USD', 'COMPLETED');
  perform pg_temp.t_eq('Q Square sends the SAME message again: a duplicate (its row was kept), no payment', v_r ->> 'outcome', 'duplicate');
  v_r := public.brk_square_payment('shrewsbury', 'evt-t53a2-' || v_txt, 'pay-t53a-' || v_txt, 'ord-t53a-' || v_txt, 975, 'USD', 'COMPLETED');
  perform pg_temp.t_eq('Q a NEW message about the same Square payment finds no student: unknown_order', v_r ->> 'outcome', 'unknown_order');
  perform pg_temp.t_eq('Q ... and no payment of that Square payment exists anywhere',
    (select count(*) from public.brk_payments p where p.square_payment_id = 'pay-t53a-' || v_txt)::text, '0');
  perform pg_temp.t_eq('Q ... the first message keeps its row (replay guard), now with no student',
    (select s.outcome || '|' || coalesce(s.registration_id::text, 'none') from public.brk_square_events s where s.square_event_id = 'evt-t53a-' || v_txt), 'paid|none');

  -- ===================================================================
  -- K. Privacy: every answer is exactly {"status": ...}
  -- ===================================================================
  select count(*) into v_n
    from t_answers a
   where a.fn like 'public.brk_delete%' and (a.r - 'status') <> '{}'::jsonb;
  perform pg_temp.t_eq('K every answer of the two functions has no key but status', v_n::text, '0');
  select string_agg(distinct a.r ->> 'status', ',' order by a.r ->> 'status') into v_txt
    from t_answers a where a.fn like 'public.brk_delete%';
  perform pg_temp.t_eq('K the words the two functions answered in this test', v_txt, 'closed_day,has_payments,invalid,no_access,not_allowed,not_found,ok,stale');
  select count(*) into v_n
    from t_answers a
   where position(v_admin::text in a.r::text) > 0 or position(v_desk::text in a.r::text) > 0;
  perform pg_temp.t_eq('K no answer holds a login id', v_n::text, '0');

  -- ===================================================================
  -- R. Rights
  -- ===================================================================
  perform pg_temp.t_eq('R the two functions: security definer, search_path empty, volatile',
    (select string_agg(p.proname || '=' || p.prosecdef::text || '/' || coalesce(array_to_string(p.proconfig, ','), '') || '/' || p.provolatile::text, ',' order by p.proname collate "C")
       from pg_proc p
      where p.oid in (to_regprocedure('public.brk_delete_registration(uuid, integer)'), to_regprocedure('public.brk_delete_event(uuid, integer)'))),
    'brk_delete_event=true/search_path=""/v,brk_delete_registration=true/search_path=""/v');
  perform pg_temp.t_eq('R the two functions: authenticated may run them; nobody else (anon, PUBLIC, service_role, the two Board breaking logins)',
    (select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute')::text
                       || has_function_privilege('anon', p.oid, 'execute')::text
                       || has_function_privilege('service_role', p.oid, 'execute')::text
                       || has_function_privilege('brk_registrar', p.oid, 'execute')::text
                       || has_function_privilege('brk_square', p.oid, 'execute')::text
                       || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)::text,
                       ',' order by p.proname collate "C")
       from pg_proc p
      where p.oid in (to_regprocedure('public.brk_delete_registration(uuid, integer)'), to_regprocedure('public.brk_delete_event(uuid, integer)'))),
    'brk_delete_event:truefalsefalsefalsefalsefalse,brk_delete_registration:truefalsefalsefalsefalsefalse');
  -- the school lock (a race with Close the day) can not be tested with one connection: prove it is in the text, before the money checks
  perform pg_temp.t_ok('R both removal functions lock the schools'' rows in share mode (the lock Close the day''s for-no-key-update conflicts with) before they look at the money',
    (select bool_and(regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~ 'perform 1 from public\.locations l order by l\.code for share;'
                     and strpos(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), 'for share;') < strpos(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), 'closed_day')
                     and strpos(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), 'for share;') < strpos(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), 'has_payments')
                     and strpos(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), 'for share;') > strpos(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), 'brk_lock_'))
       from pg_proc p
      where p.oid in (to_regprocedure('public.brk_delete_registration(uuid, integer)'), to_regprocedure('public.brk_delete_event(uuid, integer)'))));
  perform pg_temp.t_eq('R ... and the lock they take really conflicts with Close the day''s: a for-no-key-update on a school row needs the share lock released (documented mode table)',
    (select count(*)::text from pg_proc p where p.prosrc like '%for no key update%' and p.oid = to_regprocedure('public.finance_close_day(text, date, text, integer, integer, integer, integer, text)')), '1');
  perform pg_temp.t_eq('R the guard function: nobody but the owner may run it',
    (select has_function_privilege('authenticated', p.oid, 'execute')::text || has_function_privilege('anon', p.oid, 'execute')::text
            || has_function_privilege('service_role', p.oid, 'execute')::text
            || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)::text
       from pg_proc p where p.oid = to_regprocedure('public.brk_payments_guard()')), 'falsefalsefalsefalse');
  perform pg_temp.t_eq('R the guard still fires FOR EACH ROW, BEFORE insert, update and delete, and is switched on',
    (select t.tgtype::text || '/' || t.tgenabled::text from pg_trigger t
      where t.tgrelid = to_regclass('public.brk_payments') and t.tgname = 'brk_payments_guard'), '31/O');
  perform pg_temp.t_eq('R nobody in the app can write the payments table (no insert, update or delete right for authenticated, anon, service_role and the two logins)',
    (select string_agg(r.rolname || ':' || has_table_privilege(r.rolname, 'public.brk_payments', 'insert')::text
                       || has_table_privilege(r.rolname, 'public.brk_payments', 'update')::text
                       || has_table_privilege(r.rolname, 'public.brk_payments', 'delete')::text, ',' order by r.rolname collate "C")
       from pg_roles r where r.rolname in ('authenticated', 'anon', 'service_role', 'brk_registrar', 'brk_square')),
    'anon:falsefalsefalse,authenticated:falsefalsefalse,brk_registrar:falsefalsefalse,brk_square:falsefalsefalse,service_role:falsefalsefalse');
end
$$;

select 'ALL 0053 TESTS PASSED' as result, current_setting('tkd.t53') as checks;

rollback;
