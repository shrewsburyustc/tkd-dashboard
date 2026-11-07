-- =====================================================================
-- 0030_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0030_color_belt_review.sql (Color
--   Belt design review, database half - rulebook v0.418 and v0.419). It
--   checks, in this order:
--     W1  who may call what: anon may run none of the new functions;
--         a session without data access gets no_access from every one;
--         the desk gets not_allowed from the CSV
--     M1  event Mark paid (testing_mark_paid_by): invalid / not_found /
--         stale; price_changed when the box showed another amount (and
--         nothing is written); cash, check and card; "Paying by" stays
--         when it is the same way and changes (logged, one batch) when it
--         is different; a double click -> stale, then already_paid;
--         withdrawn
--     M2  private Mark paid (testing_private_mark_paid_by): price_changed,
--         a top-up after a part payment (only the rest), already_paid,
--         stale, cancelled, every method
--     U1  Undo payment puts "Paying by" back (event + private, own undo
--         and admin undo); Undo of an old-style payment changes nothing
--         extra; a "Paying by" changed since the payment is left alone
--     O1  the old 2-argument Mark paid functions still work, side by side
--         with the new ones
--     F1  Finance's Daily report: Cash / Check / Card totals move by
--         exactly the payment, in the way it was paid
--     H1  History: newest first, payments + result + the registration's
--         own rows, no login ids (signature only "on file"), at most 500
--         rows, invalid / not_found; a moved private testing shows only
--         its own rows (the move row names the event)
--     E1  Edit payment (event + private, v0.419): a changed way changes
--         "Paying by" (logged, one batch, the version up once); edit then
--         undo gets back to the family's choice; Mark paid by another way,
--         then edit, then undo; edited to the family's own way; the same
--         way leaves "Paying by" alone (the choice carried); an old-style
--         payment is unaffected; a "Paying by" chosen since wins; Finance
--         moves by exactly the edit
--     V1  Move to private and Undo move carry paying_by_before: Undo
--         payment on the private testing puts the family's choice back;
--         Undo move brings it back to the event payment; an old-style
--         payment moves with nothing kept; Finance totals unchanged by
--         the move
--     E2  more orders: edit, edit again, undo; a private edit with a
--         top-up (the known low case: newest-first undo gets back to the
--         family's choice, the other order does not); edit of a moved-in
--         payment then undo; Undo move after an edit -> stale, nothing
--         changed
--     C1  results CSV: admins only, one download row per call (who, how
--         many), exact keys, removed / duplicate / moved students left
--         out, class + belt order; the download log can't be changed,
--         removed, emptied or written by hand
--     K1  catalog: security definer, search_path = '', rights (only
--         authenticated; the helper and the guard for nobody), nothing
--         for anon; the new column readable as each table's rule says
--         (testing_payments: nobody; testing_private_payments:
--         authenticated, 0014's "every column but the login ids")
--   It makes its own class "zz cb30 ..." and events, so it works whatever
--   is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change. NEVER change the final
--   "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   It runs before AND after 0035 (which removes the old 2-argument Mark
--   paid functions): the old-style payments go through the pg_temp helpers
--   below (before 0035 they ARE the old functions, so O1 still checks them
--   side by side), and K1 expects 13 functions instead of 15 after 0035.
--   0005, 0010, 0011, 0014, 0018 and 0030 are applied. You need two
--   ACTIVE staff rows: an admin and the shared front desk (role staff).
--   Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--   their UIDs (Authentication -> Users), paste the whole file into the
--   SQL Editor and click Run. Supabase may warn about destructive
--   operations (removals are tested to be REFUSED). Everything is rolled
--   back. Confirm.
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0030 TESTS PASSED". Failed: an error starting
--   with "TEST FAILED:" (or "TEST SETUP:") saying which check broke and
--   what came back. Nothing was saved either way. If it failed, run
--   rollback;   on its own once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Test payments (migration 0035): 0035 removed the old one-click Mark paid
-- (testing_mark_paid / testing_private_mark_paid, 2 arguments). The test
-- payments below go through these helpers, which call the old function
-- while it exists and otherwise 0030's *_by version the way the old one
-- worked: the family's "Paying by" as the way and the worked-out amount
-- (asked for with 0 cents expected first: that price_changed answer
-- writes nothing). An ok answer keeps only the old keys (status,
-- payment_id, amount_cents, method, version), so every check reads the
-- same answer as before. They run with the caller's rights (as whoever
-- t_call / "set local role" made the caller), like the call they stand in
-- for. Temporary: they vanish with the session and the rollback.
-- ---------------------------------------------------------------------

create function pg_temp.t_mark_paid(p_registration_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
as $t$
declare
  v_r   jsonb;
  v_way text;
begin
  if to_regprocedure('public.testing_mark_paid(uuid, integer)') is not null then
    execute 'select public.testing_mark_paid($1, $2)' into v_r using p_registration_id, p_expected_version;
    return v_r;
  end if;
  select x.paying_by into v_way from public.testing_registrations x where x.id = p_registration_id;
  v_way := coalesce(v_way, 'cash');
  execute 'select public.testing_mark_paid_by($1, $2, $3, 0)' into v_r using p_registration_id, p_expected_version, v_way;
  if v_r ->> 'status' = 'price_changed' then
    execute 'select public.testing_mark_paid_by($1, $2, $3, $4)' into v_r
      using p_registration_id, p_expected_version, v_way, (v_r ->> 'amount_cents')::integer;
  end if;
  if v_r ->> 'status' = 'ok' then
    v_r := v_r - 'paid_on' - 'paying_by';
  end if;
  return v_r;
end;
$t$;
-- Callable by the logged-in role too: the test calls it inside "set local role authenticated", and
-- production gives functions made by the SQL Editor's role no rights for anyone else.
grant execute on function pg_temp.t_mark_paid(uuid, integer) to public;

create function pg_temp.t_private_mark_paid(p_private_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
as $t$
declare
  v_r   jsonb;
  v_way text;
begin
  if to_regprocedure('public.testing_private_mark_paid(uuid, integer)') is not null then
    execute 'select public.testing_private_mark_paid($1, $2)' into v_r using p_private_id, p_expected_version;
    return v_r;
  end if;
  select x.paying_by into v_way from public.testing_private x where x.id = p_private_id;
  v_way := coalesce(v_way, 'cash');
  execute 'select public.testing_private_mark_paid_by($1, $2, $3, 0)' into v_r using p_private_id, p_expected_version, v_way;
  if v_r ->> 'status' = 'price_changed' then
    execute 'select public.testing_private_mark_paid_by($1, $2, $3, $4)' into v_r
      using p_private_id, p_expected_version, v_way, (v_r ->> 'amount_cents')::integer;
  end if;
  if v_r ->> 'status' = 'ok' then
    v_r := v_r - 'paid_on' - 'paying_by';
  end if;
  return v_r;
end;
$t$;
-- Callable by the logged-in role too: the test calls it inside "set local role authenticated", and
-- production gives functions made by the SQL Editor's role no rights for anyone else.
grant execute on function pg_temp.t_private_mark_paid(uuid, integer) to public;


-- ---------------------------------------------------------------------
-- Test helpers (temporary: they vanish with the session, and the
-- rollback undoes them anyway)
-- ---------------------------------------------------------------------

-- every answer a function gave during the test (for the K1 key check)
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
  perform set_config('request.jwt.claims', '', true);
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

-- t_paying(registration) / t_ppaying(private): the current "Paying by"
create function pg_temp.t_paying(p_id uuid)
returns text
language sql
as $$ select r.paying_by from public.testing_registrations r where r.id = p_id; $$;

create function pg_temp.t_ppaying(p_id uuid)
returns text
language sql
as $$ select p.paying_by from public.testing_private p where p.id = p_id; $$;

-- t_state(): everything a refused call must leave as it was
create function pg_temp.t_state()
returns text
language sql
as $$
  select (select count(*) from public.change_log)::text || '/'
      || (select count(*) from public.testing_payments)::text || '/'
      || (select count(*) from public.testing_private_payments)::text || '/'
      || (select count(*) from public.testing_downloads)::text || '/'
      || (select md5(coalesce(string_agg(r.id::text || r.version || r.paying_by, ',' order by r.id), ''))
            from public.testing_registrations r) || '/'
      || (select md5(coalesce(string_agg(p.id::text || p.version || p.paying_by, ',' order by p.id), ''))
            from public.testing_private p);
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

-- t_cents(day answer, method): that way's total on the Daily report
create function pg_temp.t_cents(p_day jsonb, p_method text)
returns integer
language sql
as $$ select (p_day -> 'totals' -> p_method ->> 'cents')::integer; $$;


do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();
  v_n1 uuid := gen_random_uuid();   -- a session that was never unlocked = no data access
  v_amr jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60));
  v_c_a1 text;
  v_c_d1 text;
  v_c_n1 text;

  v_tag   text := 'zz cb30 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_an    text;
  v_dn    text;
  v_role  text;
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  v_cls   uuid;  v_rk1 uuid;  v_rk2 uuid;
  v_e1    uuid;  v_e2  uuid;          -- E1 = today (testing-day price), E2 = in 5 days (early price)
  v_e1k1  uuid;  v_e1k2 uuid;  v_e2k1 uuid;
  v_r     jsonb;
  v_r2    jsonb;
  v_s     text;
  v_s2    text;
  v_n     integer;
  v_v     integer;
  v_p     uuid;
  v_pay   uuid;
  v_batch uuid;
  v_x     uuid;
  v_y     uuid;
  v_z     uuid;
  v_w     uuid;
  v_dup   uuid;
  v_m     uuid;
  v_priv  uuid;
  v_priv2 uuid;
  v_priv3 uuid;
  v_priv4 uuid;
  v_moved uuid;
  v_form  uuid;
  v_big   uuid;
  v_i     integer;
  v_before jsonb;
  v_after  jsonb;
  v_fn    record;
  v_ea    uuid;  v_eb  uuid;  v_ec  uuid;  v_ed  uuid;  v_ee  uuid;  v_ef  uuid;   -- E1's students
  v_pa    uuid;                                                                  -- E1's private testing
  v_ma    uuid;  v_mb  uuid;  v_mc  uuid;  v_pb  uuid;                           -- V1's students / private testing
  v_old   uuid;  v_new uuid;                                                     -- the edited / the new payment
  v_ra    uuid;  v_p1  uuid;  v_p2  uuid;                                        -- E2's student / private payments
  v_bad   text[] := array['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'cancelled_by', 'submission_id',
                          'actor_id', 'session_id', 'batch_id', 'downloaded_by'];
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
  -- (0044 gives testing_mark_paid_by a 5th input, p_school, with a default)
  if (to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer)') is null
      and to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer, text)') is null)
     or to_regclass('public.testing_downloads') is null then
    raise exception 'TEST SETUP: 0030 is not applied';
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_d1, v_desk), (v_n1, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr)::text;
  v_c_n1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_n1, 'amr', v_amr)::text;

  -- a Worcester test class: Yellow (early 65.00, day 75.00, private
  -- 85.00) -> Orange (its last rank; final award None = No new rank)
  v_cls := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_class(%L, %L, null, true)', 'worcester', v_tag)) ->> 'id')::uuid;
  v_rk1 := (pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_add_rank(%L, %L, 6500, 7500, 8500, false, %L, %L, null, 0, %L)', v_cls, 'Yellow', 'solid', 'yellow', 'yellow')) ->> 'id')::uuid;
  v_rk2 := (pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_add_rank(%L, %L, 7000, 8000, 9000, false, %L, %L, null, 0, %L)', v_cls, 'Orange', 'solid', 'orange', 'orange')) ->> 'id')::uuid;
  v_e1 := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' today', v_today,
    jsonb_build_array(jsonb_build_object('class_id', v_cls, 'start_time', '17:00', 'end_time', '18:00'))::text)) ->> 'id')::uuid;
  v_e2 := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' later', v_today + 5,
    jsonb_build_array(jsonb_build_object('class_id', v_cls, 'start_time', '17:00', 'end_time', '18:00'))::text)) ->> 'id')::uuid;
  if v_rk1 is null or v_rk2 is null or v_e1 is null or v_e2 is null then
    raise exception 'TEST SETUP: could not create the test class / ranks / events';
  end if;
  select k.id into v_e1k1 from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_e1 and k.rank_id = v_rk1;
  select k.id into v_e1k2 from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_e1 and k.rank_id = v_rk2;
  select k.id into v_e2k1 from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_e2 and k.rank_id = v_rk1;


  -- ===================================================================
  -- W1. Who may call what
  -- ===================================================================
  -- the two Mark paid functions by whichever version is there (0030's 4
  -- inputs, or 0044's 5)
  for v_fn in
    select * from (values (regexp_replace(coalesce(to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer, text)'),
                                                   to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer)'))::text,
                                          '^public\.', '')),
                          (regexp_replace(coalesce(to_regprocedure('public.testing_private_mark_paid_by(uuid, integer, text, integer, text)'),
                                                   to_regprocedure('public.testing_private_mark_paid_by(uuid, integer, text, integer)'))::text,
                                          '^public\.', '')),
                          ('testing_registration_history(uuid)'), ('testing_private_history(uuid)'),
                          ('testing_results_csv(uuid)'), ('testing_undo_payment(uuid)'),
                          ('testing_private_undo_payment(uuid)'),
                          ('testing_edit_payment(uuid, text, integer, date)'),
                          ('testing_private_edit_payment(uuid, text, integer, date)'),
                          ('testing_move_to_private(uuid, integer, date, time)'),
                          ('testing_private_undo_move(uuid, integer)')) as f(sig)
  loop
    perform pg_temp.t_eq('W1 anon may not run ' || v_fn.sig,
      has_function_privilege('anon', 'public.' || v_fn.sig, 'execute')::text, 'false');
    perform pg_temp.t_eq('W1 authenticated may run ' || v_fn.sig,
      has_function_privilege('authenticated', 'public.' || v_fn.sig, 'execute')::text, 'true');
  end loop;
  for v_fn in
    select * from (values ('testing_history_strip(jsonb)'), ('testing_downloads_guard()')) as f(sig)
  loop
    perform pg_temp.t_eq('W1 nobody in the app may run ' || v_fn.sig,
      (has_function_privilege('anon', 'public.' || v_fn.sig, 'execute')
       or has_function_privilege('authenticated', 'public.' || v_fn.sig, 'execute'))::text, 'false');
  end loop;
  -- anon really is refused (not just "no privilege" on paper)
  begin
    perform pg_temp.t_call('anon', null, format('public.testing_results_csv(%L)', v_e1));
    raise exception 'TEST FAILED: W1 anon could run testing_results_csv';
  exception
    when insufficient_privilege then null;
  end;

  v_x := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Access', 'cash');
  select p.id into v_p from (select (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'worcester', 'Cb30', 'Access', v_rk1, 'cash', v_today + 3, '17:00')) ->> 'id')::uuid as id) p;
  v_s := pg_temp.t_state();
  for v_fn in
    select * from (values (format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_x, 'cash')),
                          (format('public.testing_private_mark_paid_by(%L, 1, %L, 8500)', v_p, 'cash')),
                          (format('public.testing_registration_history(%L)', v_x)),
                          (format('public.testing_private_history(%L)', v_p)),
                          (format('public.testing_results_csv(%L)', v_e1))) as f(c)
  loop
    perform pg_temp.t_eq('W1 no data access: ' || v_fn.c, pg_temp.t_call('authenticated', v_c_n1, v_fn.c) ->> 'status', 'no_access');
  end loop;
  perform pg_temp.t_eq('W1 the desk may not download the CSV',
    pg_temp.t_call('authenticated', v_c_d1, format('public.testing_results_csv(%L)', v_e1)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('W1 the refused calls wrote nothing (no download row either)', pg_temp.t_state(), v_s);


  -- ===================================================================
  -- M1. Event Mark paid with a way to pay
  -- ===================================================================
  -- refusals that come before anything is looked at
  for v_fn in
    select * from (values (format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_x, 'bitcoin')),
                          (format('public.testing_mark_paid_by(%L, 1, null, 6500)', v_x)),
                          (format('public.testing_mark_paid_by(%L, 1, %L, null)', v_x, 'cash')),
                          (format('public.testing_mark_paid_by(%L, 1, %L, -1)', v_x, 'cash')),
                          (format('public.testing_mark_paid_by(%L, null, %L, 6500)', v_x, 'cash')),
                          (format('public.testing_mark_paid_by(null, 1, %L, 6500)', 'cash')),
                          (format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_x, 'CASH'))) as f(c)
  loop
    perform pg_temp.t_eq('M1 invalid: ' || v_fn.c, pg_temp.t_call('authenticated', v_c_d1, v_fn.c) ->> 'status', 'invalid');
  end loop;
  perform pg_temp.t_eq('M1 not_found', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 6500)', gen_random_uuid(), 'cash')) ->> 'status', 'not_found');
  perform pg_temp.t_eq('M1 stale (old version)', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 7, %L, 6500)', v_x, 'cash')) ->> 'status', 'stale');
  -- price_changed: the box showed the testing-day price, but it is still early
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 7500)', v_x, 'card'));
  perform pg_temp.t_eq('M1 price_changed answer', v_r::text, '{"status": "price_changed", "amount_cents": 6500}');
  perform pg_temp.t_eq('M1 the refusals wrote nothing (history, payments, versions, paying by)', pg_temp.t_state(), v_s);

  -- cash, the same way as "Paying by": paying by stays, nothing remembered
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_x, 'cash'));
  perform pg_temp.t_eq('M1 cash ok', (v_r ->> 'status') || ':' || (v_r ->> 'amount_cents') || ':' || (v_r ->> 'method') || ':'
    || (v_r ->> 'paid_on') || ':' || (v_r ->> 'paying_by') || ':' || (v_r ->> 'version'),
    'ok:6500:cash:' || v_today || ':cash:2');
  perform pg_temp.t_eq('M1 cash ok: exactly these keys', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k),
    'amount_cents,method,paid_on,paying_by,payment_id,status,version');
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('M1 cash payment row', (select p.kind || ':' || p.amount_cents || ':' || p.method || ':' || p.paid_on || ':'
      || coalesce(p.paying_by_before, '-') || ':' || (p.recorded_by = v_desk) || ':' || p.recorded_by_name
    from public.testing_payments p where p.id = v_pay), 'payment:6500:cash:' || v_today || ':-:true:' || v_dn);
  perform pg_temp.t_eq('M1 cash: paying by unchanged', pg_temp.t_paying(v_x), 'cash');
  perform pg_temp.t_eq('M1 cash: logged as mark_paid in one batch (payment insert + version bump)',
    (select count(*) || ':' || count(distinct l.batch_id) || ':' || string_agg(distinct l.action, ',')
       from public.change_log l
      where l.batch_id = (select i.batch_id from public.change_log i where i.table_name = 'testing_payments' and i.record_id = v_pay)),
    '2:1:mark_paid');
  -- double click with the old version -> stale; with the new one -> already_paid
  perform pg_temp.t_eq('M1 double click (old version) -> stale', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_x, 'cash')) ->> 'status', 'stale');
  perform pg_temp.t_eq('M1 again with the new version -> already_paid', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 2, %L, 6500)', v_x, 'cash')) ->> 'status', 'already_paid');

  -- card for a "cash" family: paying by becomes card (logged), the old one remembered
  v_y := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Card', 'cash');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_y, 'card'));
  perform pg_temp.t_eq('M1 card ok', (v_r ->> 'status') || ':' || (v_r ->> 'method') || ':' || (v_r ->> 'paying_by') || ':' || (v_r ->> 'version'),
    'ok:card:card:2');
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('M1 card: payment method card, paying_by_before cash',
    (select p.method || ':' || p.paying_by_before from public.testing_payments p where p.id = v_pay), 'card:cash');
  perform pg_temp.t_eq('M1 card: paying by is card now', pg_temp.t_paying(v_y), 'card');
  select i.batch_id into v_batch from public.change_log i where i.table_name = 'testing_payments' and i.record_id = v_pay;
  perform pg_temp.t_eq('M1 card: the registration row of the same batch shows paying by cash -> card',
    (select (l.before ->> 'paying_by') || '>' || (l.after ->> 'paying_by') || ':' || l.action || ':' || l.actor_name
       from public.change_log l where l.batch_id = v_batch and l.table_name = 'testing_registrations'),
    'cash>card:mark_paid:' || v_dn);

  -- check for a "cash" family
  v_z := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Check', 'cash');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_z, 'check'));
  perform pg_temp.t_eq('M1 check ok', (v_r ->> 'status') || ':' || (v_r ->> 'method') || ':' || pg_temp.t_paying(v_z),
    'ok:check:check');

  -- the testing-day price on the testing day (event E1 is today)
  v_m := pg_temp.t_reg(v_e1, v_e1k1, 'Cb30', 'Today', 'check');
  perform pg_temp.t_eq('M1 testing day: early amount shown -> price_changed with the day price', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_m, 'check'))::text, '{"status": "price_changed", "amount_cents": 7500}');
  perform pg_temp.t_eq('M1 testing day: day price ok', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 7500)', v_m, 'check')) ->> 'amount_cents', '7500');

  -- withdrawn
  v_w := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Gone', 'cash');
  perform pg_temp.t_eq('M1 setup withdraw', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_withdraw_student(%L, 1)', v_w)) ->> 'status', 'ok');
  perform pg_temp.t_eq('M1 withdrawn', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, %s, %L, 6500)', v_w, pg_temp.t_ver(v_w), 'cash')) ->> 'status', 'withdrawn');


  -- ===================================================================
  -- U1 (event). Undo payment puts "Paying by" back
  -- ===================================================================
  -- the desk's own Undo (within 10 seconds) of the card payment
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_undo_payment(%L)', v_pay));
  perform pg_temp.t_eq('U1 own undo ok, paying by back to cash',
    (v_r ->> 'status') || ':' || (v_r ->> 'version') || ':' || pg_temp.t_paying(v_y),
    'ok:3:cash');
  perform pg_temp.t_eq('U1 undo answer: the same keys as before 0030', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k),
    'status,version');
  select i.batch_id into v_batch from public.change_log i
   where i.table_name = 'testing_payments' and i.op = 'insert' and i.after ->> 'reverses_payment_id' = v_pay::text;
  perform pg_temp.t_eq('U1 the undo batch: the reversal + the registration (card -> cash), action undo_payment',
    (select string_agg(l.table_name || ':' || l.action || ':' || coalesce((l.before ->> 'paying_by') || '>' || (l.after ->> 'paying_by'), '-'),
                       ',' order by l.table_name)
       from public.change_log l where l.batch_id = v_batch),
    'testing_payments:undo_payment:-,testing_registrations:undo_payment:card>cash');
  perform pg_temp.t_eq('U1 the student is not paid again',
    (select sum(p.amount_cents)::text from public.testing_payments p where p.registration_id = v_y), '0');
  -- paid again by card, then an ADMIN undo -> cash again
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 3, %L, 6500)', v_y, 'card'));
  perform pg_temp.t_eq('U1 paid again by card', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_y), 'ok:card');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_r ->> 'payment_id'));
  perform pg_temp.t_eq('U1 admin undo ok, paying by cash', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_y), 'ok:cash');
  -- a "Paying by" changed since the payment (here by hand, in the SQL
  -- Editor) is left alone by the undo
  select p.id into v_pay from public.testing_payments p where p.registration_id = v_z and p.kind = 'payment';
  update public.testing_registrations set paying_by = 'card' where id = v_z;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_pay));
  perform pg_temp.t_eq('U1 paying by changed since -> left alone', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_z), 'ok:card');
  -- undo a cash payment for a "cash" family (nothing remembered): paying by stays
  select p.id into v_pay from public.testing_payments p where p.registration_id = v_x and p.kind = 'payment';
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_pay));
  perform pg_temp.t_eq('U1 undo of a same-way payment: paying by stays', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_x), 'ok:cash');
  -- the old refusals of Undo payment still answer the same
  perform pg_temp.t_eq('U1 undo again -> stale', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_payment(%L)', v_pay)) ->> 'status', 'stale');
  perform pg_temp.t_eq('U1 undo of a reversal -> invalid', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_payment(%L)', (select p.id from public.testing_payments p where p.reverses_payment_id = v_pay))) ->> 'status',
    'invalid');
  perform pg_temp.t_eq('U1 undo not_found', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_payment(%L)', gen_random_uuid())) ->> 'status', 'not_found');
  perform pg_temp.t_eq('U1 undo no_access', pg_temp.t_call('authenticated', v_c_n1,
    format('public.testing_undo_payment(%L)', v_pay)) ->> 'status', 'no_access');


  -- ===================================================================
  -- O1. The old 2-argument Mark paid still works, side by side
  -- ===================================================================
  v_x := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Old', 'check');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('pg_temp.t_mark_paid(%L, 1)', v_x));
  perform pg_temp.t_eq('O1 old testing_mark_paid: the way = paying by, nothing remembered, no paid_on / paying_by keys',
    (v_r ->> 'status') || ':' || (v_r ->> 'method') || ':' || (v_r ->> 'amount_cents') || ':' || (v_r ? 'paid_on') || ':' || (v_r ? 'paying_by')
      || ':' || (select coalesce(p.paying_by_before, '-') from public.testing_payments p where p.id = (v_r ->> 'payment_id')::uuid),
    'ok:check:6500:false:false:-');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_undo_payment(%L)', v_r ->> 'payment_id'));
  perform pg_temp.t_eq('O1 undo of an old-style payment: paying by stays', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_x), 'ok:check');
  -- the new function on the same student afterwards
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, %s, %L, 6500)', v_x, pg_temp.t_ver(v_x), 'cash'));
  perform pg_temp.t_eq('O1 then the new function by cash', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_x), 'ok:cash');
  perform pg_temp.t_eq('O1 then the old function -> already_paid', pg_temp.t_call('authenticated', v_c_d1,
    format('pg_temp.t_mark_paid(%L, %s)', v_x, pg_temp.t_ver(v_x))) ->> 'status', 'already_paid');


  -- ===================================================================
  -- M2 + U1 (private). Private Mark paid with a way to pay
  -- ===================================================================
  v_priv := v_p;   -- "Cb30 Access": private price 85.00, paying by cash
  v_s := pg_temp.t_state();
  perform pg_temp.t_eq('M2 invalid method', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_mark_paid_by(%L, 1, %L, 8500)', v_priv, 'venmo')) ->> 'status', 'invalid');
  perform pg_temp.t_eq('M2 not_found', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_mark_paid_by(%L, 1, %L, 8500)', gen_random_uuid(), 'cash')) ->> 'status', 'not_found');
  perform pg_temp.t_eq('M2 stale', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_mark_paid_by(%L, 9, %L, 8500)', v_priv, 'cash')) ->> 'status', 'stale');
  perform pg_temp.t_eq('M2 price_changed', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_mark_paid_by(%L, 1, %L, 8000)', v_priv, 'card'))::text, '{"status": "price_changed", "amount_cents": 8500}');
  perform pg_temp.t_eq('M2 the refusals wrote nothing', pg_temp.t_state(), v_s);
  -- a part payment of 30.00 cash already there -> Mark paid takes the rest (55.00)
  insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
  values (v_priv, 'payment', 3000, 'cash', v_today, now(), v_desk, v_dn);
  perform pg_temp.t_eq('M2 top-up: the full price shown -> price_changed with the rest', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_mark_paid_by(%L, 1, %L, 8500)', v_priv, 'card'))::text, '{"status": "price_changed", "amount_cents": 5500}');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, 1, %L, 5500)', v_priv, 'card'));
  perform pg_temp.t_eq('M2 top-up by card ok', (v_r ->> 'status') || ':' || (v_r ->> 'amount_cents') || ':' || (v_r ->> 'method') || ':'
    || (v_r ->> 'paid_on') || ':' || (v_r ->> 'paying_by') || ':' || (v_r ->> 'version'), 'ok:5500:card:' || v_today || ':card:2');
  perform pg_temp.t_eq('M2 ok answer: exactly these keys', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k),
    'amount_cents,method,paid_on,paying_by,payment_id,status,version');
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('M2 the payment: card, paying_by_before cash',
    (select p.method || ':' || p.paying_by_before || ':' || p.amount_cents from public.testing_private_payments p where p.id = v_pay), 'card:cash:5500');
  perform pg_temp.t_eq('M2 paying by card now; nothing owed', pg_temp.t_ppaying(v_priv) || ':' || public.testing_private_amount_due(v_priv), 'card:0');
  select i.batch_id into v_batch from public.change_log i where i.table_name = 'testing_private_payments' and i.record_id = v_pay;
  perform pg_temp.t_eq('M2 logged: the private row cash -> card in the same batch, private_mark_paid',
    (select (l.before ->> 'paying_by') || '>' || (l.after ->> 'paying_by') || ':' || l.action
       from public.change_log l where l.batch_id = v_batch and l.table_name = 'testing_private'), 'cash>card:private_mark_paid');
  perform pg_temp.t_eq('M2 double click -> stale', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_mark_paid_by(%L, 1, %L, 5500)', v_priv, 'card')) ->> 'status', 'stale');
  perform pg_temp.t_eq('M2 nothing owed -> already_paid', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_mark_paid_by(%L, 2, %L, 0)', v_priv, 'card')) ->> 'status', 'already_paid');
  -- own undo of the top-up -> paying by cash again, 55.00 owed again
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_undo_payment(%L)', v_pay));
  perform pg_temp.t_eq('U1 private own undo: paying by back to cash, 55.00 owed',
    (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_priv) || ':' || (v_r ->> 'version') || ':' || public.testing_private_amount_due(v_priv)
      || ':' || (v_r ? 'paying_by'), 'ok:cash:3:5500:false');
  select i.batch_id into v_batch from public.change_log i
   where i.table_name = 'testing_private_payments' and i.op = 'insert' and i.after ->> 'reverses_payment_id' = v_pay::text;
  perform pg_temp.t_eq('U1 private undo batch',
    (select string_agg(l.table_name || ':' || l.action || ':' || coalesce((l.before ->> 'paying_by') || '>' || (l.after ->> 'paying_by'), '-'),
                       ',' order by l.table_name)
       from public.change_log l where l.batch_id = v_batch),
    'testing_private:private_undo_payment:card>cash,testing_private_payments:private_undo_payment:-');
  -- every way: check for a cash private testing; admin undo puts cash back
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, 3, %L, 5500)', v_priv, 'check'));
  perform pg_temp.t_eq('M2 check ok', (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_priv), 'ok:check');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_undo_payment(%L)', v_r ->> 'payment_id'));
  perform pg_temp.t_eq('U1 private admin undo -> cash', (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_priv), 'ok:cash');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, %s, %L, 5500)', v_priv, pg_temp.t_pver(v_priv), 'cash'));
  perform pg_temp.t_eq('M2 cash (the same way) ok, nothing remembered', (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_priv) || ':'
    || (select coalesce(p.paying_by_before, '-') from public.testing_private_payments p where p.id = (v_r ->> 'payment_id')::uuid), 'ok:cash:-');
  -- cancelled
  v_priv2 := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'worcester', 'Cb30', 'Cancelled', v_rk1, 'cash', v_today + 3, '17:00')) ->> 'id')::uuid;
  perform pg_temp.t_eq('M2 setup cancel', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_private_cancel(%L, 1)', v_priv2)) ->> 'status', 'ok');
  perform pg_temp.t_eq('M2 cancelled', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_mark_paid_by(%L, 2, %L, 8500)', v_priv2, 'cash')) ->> 'status', 'cancelled');
  -- the old 2-argument private Mark paid, side by side; its undo changes nothing extra
  v_priv3 := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'worcester', 'Cb30', 'Old private', v_rk1, 'check', v_today + 3, '17:00')) ->> 'id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('pg_temp.t_private_mark_paid(%L, 1)', v_priv3));
  perform pg_temp.t_eq('O1 old testing_private_mark_paid', (v_r ->> 'status') || ':' || (v_r ->> 'method') || ':' || (v_r ->> 'amount_cents'),
    'ok:check:8500');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_undo_payment(%L)', v_r ->> 'payment_id'));
  perform pg_temp.t_eq('O1 undo of an old-style private payment: paying by stays', (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_priv3), 'ok:check');


  -- ===================================================================
  -- F1. Finance's Daily report counts the way it was paid
  -- ===================================================================
  v_before := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('F1 finance_day ok', v_before ->> 'status', 'ok');
  v_x := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Finance card', 'cash');
  perform pg_temp.t_eq('F1 card payment', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_x, 'card')) ->> 'status', 'ok');
  v_after := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('F1 card +65.00, cash and check unchanged',
    (pg_temp.t_cents(v_after, 'card') - pg_temp.t_cents(v_before, 'card')) || ':'
      || (pg_temp.t_cents(v_after, 'cash') - pg_temp.t_cents(v_before, 'cash')) || ':'
      || (pg_temp.t_cents(v_after, 'check') - pg_temp.t_cents(v_before, 'check')), '6500:0:0');
  v_before := v_after;
  v_priv4 := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'worcester', 'Cb30', 'Finance check', v_rk1, 'card', v_today + 3, '17:00')) ->> 'id')::uuid;
  perform pg_temp.t_eq('F1 private check payment', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_mark_paid_by(%L, 1, %L, 8500)', v_priv4, 'check')) ->> 'status', 'ok');
  v_after := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('F1 check +85.00, cash and card unchanged',
    (pg_temp.t_cents(v_after, 'check') - pg_temp.t_cents(v_before, 'check')) || ':'
      || (pg_temp.t_cents(v_after, 'cash') - pg_temp.t_cents(v_before, 'cash')) || ':'
      || (pg_temp.t_cents(v_after, 'card') - pg_temp.t_cents(v_before, 'card')), '8500:0:0');


  -- ===================================================================
  -- H1. History
  -- ===================================================================
  -- "Cb30 Card" (v_y): insert, paid by card, own undo, paid by card,
  -- admin undo; plus a result with a note (as the SQL Editor)
  insert into public.testing_results (registration_id, result, note) values (v_y, 'pass', 'Great kicks');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_registration_history(%L)', v_y));
  perform pg_temp.t_eq('H1 history ok', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('H1 the rows: 1 registration insert + 4 registration updates + 4 payment inserts + 1 result = 10',
    jsonb_array_length(v_r -> 'rows')::text, '10');
  perform pg_temp.t_eq('H1 every row has exactly the 7 keys',
    (select count(*)::text from jsonb_array_elements(v_r -> 'rows') e
      where (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(e) k)
            = 'action,actor_name,after,before,occurred_at,op,table_name'), '10');
  perform pg_temp.t_eq('H1 newest first: the result first, the registration''s insert last',
    (v_r -> 'rows' -> 0 ->> 'table_name') || ':' || (v_r -> 'rows' -> 9 ->> 'table_name') || ':' || (v_r -> 'rows' -> 9 ->> 'op'),
    'testing_results:testing_registrations:insert');
  perform pg_temp.t_eq('H1 occurred_at never goes up',
    (select count(*)::text from jsonb_array_elements(v_r -> 'rows') with ordinality a(e, n)
       join jsonb_array_elements(v_r -> 'rows') with ordinality b(e, n) on b.n = a.n + 1
      where (b.e ->> 'occurred_at')::timestamptz > (a.e ->> 'occurred_at')::timestamptz), '0');
  perform pg_temp.t_eq('H1 the four payment rows (2 payments, 2 reversals), all by name only',
    (select count(*)::text from jsonb_array_elements(v_r -> 'rows') e
      where e ->> 'table_name' = 'testing_payments' and e -> 'after' ? 'recorded_by_name'), '4');
  perform pg_temp.t_eq('H1 the actions in order (newest first)',
    (select string_agg(e ->> 'action', ',' order by n) from jsonb_array_elements(v_r -> 'rows') with ordinality x(e, n)),
    'manual,undo_payment,undo_payment,mark_paid,mark_paid,undo_payment,undo_payment,mark_paid,mark_paid,manual');
  perform pg_temp.t_eq('H1 no login id anywhere',
    (select count(*)::text from pg_temp.t_keys(v_r) k where k = any (v_bad)), '0');
  -- a form registration with a signature: "on file", no submission id
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
                                            submission_id, signature, signed_at, ack_version)
  values (v_e2, v_e2k1, 'Cb30', 'Signed', 'cash', true, 'form', gen_random_uuid(), v_sig, now(), 'cb-2026-10-17')
  returning id into v_form;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_registration_history(%L)', v_form));
  perform pg_temp.t_eq('H1 a signature shows only as "on file", no submission id',
    (v_r -> 'rows' -> 0 -> 'after' ->> 'signature') || ':' || (v_r -> 'rows' -> 0 -> 'after' ? 'submission_id')
      || ':' || (position('base64' in v_r::text) > 0), 'on file:false:false');
  perform pg_temp.t_eq('H1 the helper turns any signature into "on file" and removes login ids',
    public.testing_history_strip(jsonb_build_object('signature', v_sig, 'created_by', v_admin, 'withdrawn_by', v_admin,
      'cancelled_by', v_admin, 'recorded_by', v_admin, 'updated_by', v_admin, 'submission_id', v_admin, 'first_name', 'A'))::text,
    '{"signature": "on file", "first_name": "A"}');
  perform pg_temp.t_eq('H1 the helper keeps a missing signature missing and NULL NULL',
    coalesce(public.testing_history_strip('{"signature": null, "a": 1}'::jsonb)::text, '') || ':'
      || coalesce(public.testing_history_strip(null)::text, 'NULL'), '{"a": 1, "signature": null}:NULL');
  perform pg_temp.t_eq('H1 invalid', pg_temp.t_call('authenticated', v_c_d1, 'public.testing_registration_history(null)') ->> 'status', 'invalid');
  perform pg_temp.t_eq('H1 not_found', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_registration_history(%L)', gen_random_uuid())) ->> 'status', 'not_found');
  perform pg_temp.t_eq('H1 a private testing id is not a registration -> not_found', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_registration_history(%L)', v_priv)) ->> 'status', 'not_found');
  -- at most 500 rows
  v_big := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Busy', 'cash');
  for v_i in 1 .. 510 loop
    update public.testing_registrations set paying_by = case when v_i % 2 = 1 then 'check' else 'cash' end where id = v_big;
  end loop;
  perform pg_temp.t_eq('H1 at most 500 rows', jsonb_array_length(pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_registration_history(%L)', v_big)) -> 'rows')::text, '500');
  -- private history: its payments, the paying by change, by name only
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_history(%L)', v_priv));
  perform pg_temp.t_eq('H1 private history ok, only private tables',
    (v_r ->> 'status') || ':' || (select string_agg(distinct e ->> 'table_name', ',') from jsonb_array_elements(v_r -> 'rows') e),
    'ok:testing_private,testing_private_payments');
  perform pg_temp.t_eq('H1 private history: no login id anywhere', (select count(*)::text from pg_temp.t_keys(v_r) k where k = any (v_bad)), '0');
  perform pg_temp.t_eq('H1 private history: newest first (the last Mark paid first, the insert last)',
    (v_r -> 'rows' -> 0 ->> 'action') || ':' || (v_r -> 'rows' -> (jsonb_array_length(v_r -> 'rows') - 1) ->> 'op'),
    'private_mark_paid:insert');
  perform pg_temp.t_eq('H1 private invalid / not_found',
    (pg_temp.t_call('authenticated', v_c_d1, 'public.testing_private_history(null)') ->> 'status') || ':'
      || (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_history(%L)', v_y)) ->> 'status'), 'invalid:not_found');
  -- a moved private testing shows only its own rows (Q4)
  v_x := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Mover', 'cash');
  perform pg_temp.t_eq('H1 setup paid before the move', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_x, 'card')) ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, 2, %L, %L)', v_x, v_today + 4, '18:00'));
  perform pg_temp.t_eq('H1 setup move to private', v_r ->> 'status', 'ok');
  v_moved := (v_r ->> 'private_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_history(%L)', v_moved));
  perform pg_temp.t_eq('H1 moved: only its own rows (its insert + the moved-in payment)',
    (select string_agg(e ->> 'table_name' || ':' || (e ->> 'op') || ':' || (e ->> 'action'), ',' order by n)
       from jsonb_array_elements(v_r -> 'rows') with ordinality x(e, n)),
    'testing_private_payments:insert:move_to_private,testing_private:insert:move_to_private');
  perform pg_temp.t_eq('H1 moved: the move row names the event',
    v_r -> 'rows' -> 1 -> 'after' ->> 'moved_from_event_name', v_tag || ' later');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_registration_history(%L)', v_x));
  perform pg_temp.t_eq('H1 moved: the registration keeps its own rows (insert, paid, the move''s reversal and withdrawal), no private rows',
    (select string_agg(e ->> 'table_name' || ':' || (e ->> 'action'), ',' order by n)
       from jsonb_array_elements(v_r -> 'rows') with ordinality x(e, n)),
    'testing_registrations:move_to_private,testing_payments:move_to_private,testing_registrations:mark_paid,testing_payments:mark_paid,testing_registrations:manual');


  -- ===================================================================
  -- E1. Edit payment makes "Paying by" follow too (v0.419)
  -- ===================================================================
  -- (a) an old-style cash payment (the old Mark paid) edited to card by an
  --     admin: "Paying by" becomes card in the same batch, the version goes
  --     up once, the new payment keeps the family's choice (cash), and
  --     Finance moves by exactly the edit
  v_ea := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Edit old', 'cash');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('pg_temp.t_mark_paid(%L, 1)', v_ea));
  perform pg_temp.t_eq('E1 setup: an old-style cash payment', (v_r ->> 'status') || ':' || (v_r ->> 'method'), 'ok:cash');
  v_old := (v_r ->> 'payment_id')::uuid;
  v_v := pg_temp.t_ver(v_ea);
  v_before := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6500, %L)', v_old, 'card', v_today));
  perform pg_temp.t_eq('E1 edit to card: ok, the same answer keys as before 0030',
    (v_r ->> 'status') || ':' || (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k),
    'ok:payment_id,status,version');
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E1 edit to card: the version goes up exactly once, paying by is card',
    ((v_r ->> 'version')::integer - v_v) || ':' || (pg_temp.t_ver(v_ea) - v_v) || ':' || pg_temp.t_paying(v_ea), '1:1:card');
  perform pg_temp.t_eq('E1 edit to card: the new payment is card and keeps the family''s choice (cash)',
    (select p.kind || ':' || p.method || ':' || p.amount_cents || ':' || coalesce(p.paying_by_before, '-')
       from public.testing_payments p where p.id = v_new), 'payment:card:6500:cash');
  select i.batch_id into v_batch from public.change_log i where i.table_name = 'testing_payments' and i.record_id = v_new;
  perform pg_temp.t_eq('E1 edit to card: one batch - the reversal, the new payment and the registration (cash -> card), all edit_payment',
    (select string_agg(l.table_name || ':' || l.action || ':' || coalesce((l.before ->> 'paying_by') || '>' || (l.after ->> 'paying_by'), '-'),
                       ',' order by l.table_name, l.id)
       from public.change_log l where l.batch_id = v_batch),
    'testing_payments:edit_payment:-,testing_payments:edit_payment:-,testing_registrations:edit_payment:cash>card');
  v_after := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('E1 Finance: card +65.00, cash -65.00, check unchanged (exactly the edit)',
    (pg_temp.t_cents(v_after, 'card') - pg_temp.t_cents(v_before, 'card')) || ':'
      || (pg_temp.t_cents(v_after, 'cash') - pg_temp.t_cents(v_before, 'cash')) || ':'
      || (pg_temp.t_cents(v_after, 'check') - pg_temp.t_cents(v_before, 'check')), '6500:-6500:0');
  -- (b) edit, then Undo payment: back to the family's choice
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('E1 edit then undo: paying by back to cash, not paid',
    (v_r ->> 'status') || ':' || pg_temp.t_paying(v_ea) || ':'
      || (select sum(p.amount_cents) from public.testing_payments p where p.registration_id = v_ea), 'ok:cash:0');
  v_after := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('E1 Finance after the undo: card back to before, cash -65.00 (the first payment is undone too), check unchanged',
    (pg_temp.t_cents(v_after, 'card') - pg_temp.t_cents(v_before, 'card')) || ':'
      || (pg_temp.t_cents(v_after, 'cash') - pg_temp.t_cents(v_before, 'cash')) || ':'
      || (pg_temp.t_cents(v_after, 'check') - pg_temp.t_cents(v_before, 'check')), '0:-6500:0');

  -- (c) Mark paid by card for a "cash" family, then edit to check, then
  --     undo: paying by card -> check -> cash (the family's choice)
  v_eb := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Edit card', 'cash');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_eb, 'card'));
  perform pg_temp.t_eq('E1 setup: paid by card, cash remembered', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_eb), 'ok:card');
  v_old := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6500, %L)', v_old, 'check', v_today));
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E1 mark paid by card, edit to check: paying by check, the new payment keeps cash',
    (v_r ->> 'status') || ':' || pg_temp.t_paying(v_eb) || ':'
      || (select p.method || ':' || p.paying_by_before from public.testing_payments p where p.id = v_new), 'ok:check:check:cash');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('E1 mark paid by card, edit, undo: paying by back to cash', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_eb), 'ok:cash');

  -- (d) paid by card for a "cash" family, edited to cash (the family's own
  --     way): paying by cash, nothing kept (never the payment's own way);
  --     the undo leaves cash
  v_ec := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Edit back', 'cash');
  v_old := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_ec, 'card')) ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6500, %L)', v_old, 'cash', v_today));
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E1 edited to the family''s way: paying by cash, nothing kept',
    (v_r ->> 'status') || ':' || pg_temp.t_paying(v_ec) || ':'
      || (select coalesce(p.paying_by_before, '-') from public.testing_payments p where p.id = v_new), 'ok:cash:-');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('E1 ... then undo: paying by stays cash', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_ec), 'ok:cash');

  -- (e) the same way (only the amount changes): paying by is left alone;
  --     the family's choice is carried to the new payment, so the undo
  --     still puts it back
  v_ed := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Edit amount', 'cash');
  v_old := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_ed, 'card')) ->> 'payment_id')::uuid;
  v_v := pg_temp.t_ver(v_ed);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6000, %L)', v_old, 'card', v_today));
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E1 same way, new amount: paying by stays card, the version up once, cash carried',
    (v_r ->> 'status') || ':' || pg_temp.t_paying(v_ed) || ':' || (pg_temp.t_ver(v_ed) - v_v) || ':'
      || (select p.amount_cents || ':' || p.paying_by_before from public.testing_payments p where p.id = v_new), 'ok:card:1:6000:cash');
  select i.batch_id into v_batch from public.change_log i where i.table_name = 'testing_payments' and i.record_id = v_new;
  perform pg_temp.t_eq('E1 same way: the registration''s log row of the edit does not touch paying by',
    (select (l.after ? 'paying_by')::text from public.change_log l where l.batch_id = v_batch and l.table_name = 'testing_registrations'), 'false');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('E1 same way, then undo: paying by back to cash', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_ed), 'ok:cash');

  -- (f) old-style payments are unaffected when the way stays: a check
  --     payment made by the old Mark paid (the way = "Paying by") edited
  --     to another amount -> nothing kept, paying by stays; its undo
  --     changes nothing extra
  v_ee := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Edit plain', 'check');
  v_old := (pg_temp.t_call('authenticated', v_c_d1, format('pg_temp.t_mark_paid(%L, 1)', v_ee)) ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6000, %L)', v_old, 'check', v_today));
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E1 old-style, same way: paying by check, nothing kept',
    (v_r ->> 'status') || ':' || pg_temp.t_paying(v_ee) || ':'
      || (select coalesce(p.paying_by_before, '-') from public.testing_payments p where p.id = v_new), 'ok:check:-');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('E1 old-style, then undo: paying by stays check', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_ee), 'ok:check');

  -- (g) a "Paying by" chosen since the payment wins (as in Undo payment):
  --     paid by card for a "cash" family, then "Paying by" set to check
  --     (here by hand, in the SQL Editor - the app's own
  --     testing_change_paying_by refuses a paid student with already_paid,
  --     so a change "since" can only come from a direct table write), then
  --     edited to cash -> paying by cash, the new payment keeps check; the
  --     undo puts check back
  v_ef := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Edit since', 'cash');
  v_old := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_ef, 'card')) ->> 'payment_id')::uuid;
  update public.testing_registrations set paying_by = 'check' where id = v_ef;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6500, %L)', v_old, 'cash', v_today));
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E1 chosen since: paying by cash, the new payment keeps check',
    (v_r ->> 'status') || ':' || pg_temp.t_paying(v_ef) || ':'
      || (select p.paying_by_before from public.testing_payments p where p.id = v_new), 'ok:cash:check');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('E1 chosen since, then undo: paying by back to check', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_ef), 'ok:check');
  -- the old refusals still answer the same
  perform pg_temp.t_eq('E1 the desk may not edit a payment', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_edit_payment(%L, %L, 6500, %L)', v_new, 'cash', v_today)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('E1 edit of a reversed payment -> stale', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_edit_payment(%L, %L, 6500, %L)', v_new, 'cash', v_today)) ->> 'status', 'stale');

  -- (h) private Edit payment: the same rule
  v_pa := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'worcester', 'Cb30', 'Edit private', v_rk1, 'cash', v_today + 3, '17:00')) ->> 'id')::uuid;
  v_old := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, 1, %L, 8500)', v_pa, 'card')) ->> 'payment_id')::uuid;
  v_v := pg_temp.t_pver(v_pa);
  v_before := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_edit_payment(%L, %L, 8500, %L)', v_old, 'check', v_today));
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E1 private edit card -> check: ok, same keys, version up once, paying by check, cash kept',
    (v_r ->> 'status') || ':' || (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k) || ':'
      || ((v_r ->> 'version')::integer - v_v) || ':' || pg_temp.t_ppaying(v_pa) || ':'
      || (select p.method || ':' || p.paying_by_before from public.testing_private_payments p where p.id = v_new),
    'ok:payment_id,status,version:1:check:check:cash');
  select i.batch_id into v_batch from public.change_log i where i.table_name = 'testing_private_payments' and i.record_id = v_new;
  perform pg_temp.t_eq('E1 private edit: the private row card -> check in the same batch, private_edit_payment',
    (select (l.before ->> 'paying_by') || '>' || (l.after ->> 'paying_by') || ':' || l.action
       from public.change_log l where l.batch_id = v_batch and l.table_name = 'testing_private'), 'card>check:private_edit_payment');
  v_after := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('E1 private edit, Finance: check +85.00, card -85.00, cash unchanged',
    (pg_temp.t_cents(v_after, 'check') - pg_temp.t_cents(v_before, 'check')) || ':'
      || (pg_temp.t_cents(v_after, 'card') - pg_temp.t_cents(v_before, 'card')) || ':'
      || (pg_temp.t_cents(v_after, 'cash') - pg_temp.t_cents(v_before, 'cash')), '8500:-8500:0');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('E1 private edit then undo: paying by back to cash, 85.00 owed',
    (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_pa) || ':' || public.testing_private_amount_due(v_pa), 'ok:cash:8500');
  -- private, the same way (only the amount): paying by left alone, cash carried, undo puts it back
  v_old := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, %s, %L, 8500)', v_pa,
    pg_temp.t_pver(v_pa), 'card')) ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_edit_payment(%L, %L, 8000, %L)', v_old, 'card', v_today));
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E1 private same way: paying by card, cash carried, 5.00 owed',
    (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_pa) || ':'
      || (select p.paying_by_before from public.testing_private_payments p where p.id = v_new) || ':'
      || public.testing_private_amount_due(v_pa), 'ok:card:cash:500');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('E1 private same way, then undo: paying by cash', (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_pa), 'ok:cash');


  -- ===================================================================
  -- V1. Move to private and Undo move carry the family's choice (v0.419)
  -- ===================================================================
  -- (a) paid by card for a "cash" family, then moved: the private testing
  --     is paying by card, its moved-in payment keeps cash; an admin's Undo
  --     payment on the private testing puts cash back. Finance: the move
  --     changes no total (a transfer)
  v_ma := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Move card', 'cash');
  perform pg_temp.t_eq('V1 setup: paid by card', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_ma, 'card')) ->> 'status', 'ok');
  v_before := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, 2, %L, %L)', v_ma, v_today + 4, '18:00'));
  perform pg_temp.t_eq('V1 move: ok, the same answer keys as before 0030',
    (v_r ->> 'status') || ':' || (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k),
    'ok:amount_due_cents,private_id,registration_version,result_cleared,status,version');
  v_pb := (v_r ->> 'private_id')::uuid;
  perform pg_temp.t_eq('V1 move: the private testing pays by card; its payment is card, moved, keeps cash',
    pg_temp.t_ppaying(v_pb) || ':'
      || (select string_agg(p.kind || ':' || p.method || ':' || (p.moved_from_payment_id is not null) || ':' || coalesce(p.paying_by_before, '-'), ',')
            from public.testing_private_payments p where p.private_id = v_pb), 'card:payment:card:true:cash');
  v_after := pg_temp.t_call('authenticated', v_c_d1, format('public.finance_day(%L, %L)', 'worcester', v_today));
  perform pg_temp.t_eq('V1 move: Finance totals unchanged (cash, check, card)',
    (pg_temp.t_cents(v_after, 'cash') - pg_temp.t_cents(v_before, 'cash')) || ':'
      || (pg_temp.t_cents(v_after, 'check') - pg_temp.t_cents(v_before, 'check')) || ':'
      || (pg_temp.t_cents(v_after, 'card') - pg_temp.t_cents(v_before, 'card')), '0:0:0');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_undo_payment(%L)',
    (select p.id from public.testing_private_payments p where p.private_id = v_pb)));
  perform pg_temp.t_eq('V1 moved, then Undo payment on the private testing: paying by back to cash',
    (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_pb), 'ok:cash');

  -- (b) Undo move carries the kept choice back to the event payment; an
  --     admin's Undo payment there then puts cash back
  v_mb := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Move back', 'cash');
  perform pg_temp.t_eq('V1 setup: paid by card', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_mb, 'card')) ->> 'status', 'ok');
  v_pb := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, 2, %L, %L)', v_mb, v_today + 4, '18:00')) ->> 'private_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_undo_move(%L, 1)', v_pb));
  perform pg_temp.t_eq('V1 undo move: ok, the same answer keys as before 0030, the registration pays by card',
    (v_r ->> 'status') || ':' || (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k) || ':' || pg_temp.t_paying(v_mb),
    'ok:registration_id,registration_version,status:card');
  select p.id into v_new from public.testing_payments p
   where p.registration_id = v_mb and p.kind = 'payment'
     and not exists (select 1 from public.testing_payments x where x.reverses_payment_id = p.id);
  perform pg_temp.t_eq('V1 undo move: the event payment again is card, keeps cash, no "recorded by" login',
    (select p.method || ':' || p.paying_by_before || ':' || (p.recorded_by is null) from public.testing_payments p where p.id = v_new),
    'card:cash:true');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('V1 undo move, then Undo payment: paying by back to cash', (v_r ->> 'status') || ':' || pg_temp.t_paying(v_mb), 'ok:cash');

  -- (c) an old-style payment moves (and comes back) with nothing kept
  v_mc := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Move plain', 'check');
  perform pg_temp.t_eq('V1 setup: old-style check payment', pg_temp.t_call('authenticated', v_c_d1,
    format('pg_temp.t_mark_paid(%L, 1)', v_mc)) ->> 'status', 'ok');
  v_pb := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, 2, %L, %L)', v_mc, v_today + 4, '18:00')) ->> 'private_id')::uuid;
  perform pg_temp.t_eq('V1 old-style moved: paying by check, nothing kept',
    pg_temp.t_ppaying(v_pb) || ':' || (select string_agg(coalesce(p.paying_by_before, '-'), ',') from public.testing_private_payments p where p.private_id = v_pb),
    'check:-');
  perform pg_temp.t_eq('V1 old-style: undo move ok', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_undo_move(%L, 1)', v_pb)) ->> 'status', 'ok');
  perform pg_temp.t_eq('V1 old-style back: nothing kept on the event payment, paying by check',
    (select string_agg(coalesce(p.paying_by_before, '-'), ',') from public.testing_payments p
      where p.registration_id = v_mc and p.kind = 'payment'
        and not exists (select 1 from public.testing_payments x where x.reverses_payment_id = p.id)) || ':' || pg_temp.t_paying(v_mc),
    '-:check');


  -- ===================================================================
  -- E2. More Edit payment orders (the v0.419 security review's follow-ups)
  -- ===================================================================
  -- (a) event: Mark paid by card (family: cash), edit to check, edit again
  --     to cash, then undo the newest payment
  v_ra := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Edit twice', 'cash');
  v_old := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_ra, 'card')) ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E2a step 1 Mark paid by card: paying by card, the payment keeps cash',
    pg_temp.t_paying(v_ra) || ':' || (select p.paying_by_before from public.testing_payments p where p.id = v_old), 'card:cash');
  v_new := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6500, %L)', v_old, 'check', v_today)) ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E2a step 2 edit to check: paying by check, the new payment keeps cash',
    pg_temp.t_paying(v_ra) || ':' || (select p.method || ':' || p.paying_by_before from public.testing_payments p where p.id = v_new), 'check:check:cash');
  v_old := v_new;
  v_new := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6500, %L)', v_old, 'cash', v_today)) ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E2a step 3 edit again to cash (the family''s way): paying by cash, nothing kept',
    pg_temp.t_paying(v_ra) || ':' || (select p.method || ':' || coalesce(p.paying_by_before, '-') from public.testing_payments p where p.id = v_new),
    'cash:cash:-');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('E2a step 4 undo the newest: paying by stays cash (the family''s choice), not paid',
    (v_r ->> 'status') || ':' || pg_temp.t_paying(v_ra) || ':'
      || (select sum(p.amount_cents) from public.testing_payments p where p.registration_id = v_ra), 'ok:cash:0');

  -- (b) private, an edit with a top-up - THE KNOWN LOW CASE (SETUP 0030,
  --     "Not fixed"): family cash; P1 85.00 cash (the old Mark paid); the
  --     price goes up to 90.00, so the 5.00 top-up P2 is paid by card
  --     (paying by card, P2 keeps cash); then an admin edits P1 cash ->
  --     check. Today: paying by check, the new P1' keeps card (the family's
  --     choice as far as P1 can tell: "Paying by" was card). Undo newest
  --     first (P1', then P2) gets back to cash; the other order ends on
  --     card - the family's choice is lost and an admin sets it by hand.
  v_pa := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'worcester', 'Cb30', 'Top-up edit', v_rk1, 'cash', v_today + 3, '17:00')) ->> 'id')::uuid;
  v_p1 := (pg_temp.t_call('authenticated', v_c_d1, format('pg_temp.t_private_mark_paid(%L, 1)', v_pa)) ->> 'payment_id')::uuid;
  update public.testing_private set private_cents = 9000 where id = v_pa;   -- the price goes up (as the SQL Editor)
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, %s, %L, 500)', v_pa, pg_temp.t_pver(v_pa), 'card'));
  v_p2 := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E2b top-up 5.00 by card: paying by card, P2 keeps cash',
    (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_pa) || ':'
      || (select p.amount_cents || ':' || p.paying_by_before from public.testing_private_payments p where p.id = v_p2), 'ok:card:500:cash');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_edit_payment(%L, %L, 8500, %L)', v_p1, 'check', v_today));
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E2b (known low case) edit P1 cash -> check: paying by check, P1'' keeps card, nothing owed',
    (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_pa) || ':'
      || (select p.paying_by_before from public.testing_private_payments p where p.id = v_new) || ':'
      || public.testing_private_amount_due(v_pa), 'ok:check:card:0');
  -- the other order first, inside a block that is rolled back: P2 first, then P1'
  begin
    perform pg_temp.t_eq('E2b other order: undo P2 first -> paying by stays check',
      (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_undo_payment(%L)', v_p2)) ->> 'status') || ':' || pg_temp.t_ppaying(v_pa),
      'ok:check');
    perform pg_temp.t_eq('E2b other order: then undo P1'' -> card (the family''s cash is lost - the known low case)',
      (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_undo_payment(%L)', v_new)) ->> 'status') || ':' || pg_temp.t_ppaying(v_pa),
      'ok:card');
    raise exception 'E2b roll back';
  exception when raise_exception then
    if sqlerrm <> 'E2b roll back' then raise; end if;
  end;
  perform pg_temp.t_eq('E2b the other order was rolled back', pg_temp.t_ppaying(v_pa) || ':' || public.testing_private_amount_due(v_pa), 'check:0');
  -- newest first: P1', then P2 -> cash
  perform pg_temp.t_eq('E2b newest first: undo P1'' -> paying by card',
    (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_undo_payment(%L)', v_new)) ->> 'status') || ':' || pg_temp.t_ppaying(v_pa),
    'ok:card');
  -- (the call is its own statement: testing_private_amount_due is "stable", so in the same
  -- statement it would still see the rows from before the undo)
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_undo_payment(%L)', v_p2));
  perform pg_temp.t_eq('E2b newest first: then undo P2 -> paying by cash (the family''s choice), 90.00 owed',
    (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_pa) || ':' || public.testing_private_amount_due(v_pa), 'ok:cash:9000');

  -- (c) private: edit a moved-in payment, then Undo payment -> the family's choice
  v_ma := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Move edit', 'cash');
  perform pg_temp.t_eq('E2c setup: paid by card', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_ma, 'card')) ->> 'status', 'ok');
  v_pb := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, 2, %L, %L)', v_ma, v_today + 4, '18:00')) ->> 'private_id')::uuid;
  v_old := (select p.id from public.testing_private_payments p where p.private_id = v_pb);
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_edit_payment(%L, %L, 6500, %L)', v_old, 'check', v_today));
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('E2c edit the moved-in card payment to check: paying by check, the new payment keeps cash',
    (v_r ->> 'status') || ':' || pg_temp.t_ppaying(v_pb) || ':'
      || (select p.paying_by_before from public.testing_private_payments p where p.id = v_new), 'ok:check:cash');
  perform pg_temp.t_eq('E2c then Undo payment: paying by back to cash',
    (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_undo_payment(%L)', v_new)) ->> 'status') || ':' || pg_temp.t_ppaying(v_pb),
    'ok:cash');

  -- (d) Undo move after an edit: stale (0014 9b: a payment recorded here
  --     or a reversal), and nothing changes
  v_mb := pg_temp.t_reg(v_e2, v_e2k1, 'Cb30', 'Move edit undo', 'cash');
  perform pg_temp.t_eq('E2d setup: paid by card', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_mb, 'card')) ->> 'status', 'ok');
  v_pb := (pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, 2, %L, %L)', v_mb, v_today + 4, '18:00')) ->> 'private_id')::uuid;
  perform pg_temp.t_eq('E2d setup: an admin edits the moved-in payment', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_private_edit_payment(%L, %L, 6500, %L)', (select p.id from public.testing_private_payments p where p.private_id = v_pb),
           'check', v_today)) ->> 'status', 'ok');
  v_s := pg_temp.t_state();
  -- the current version (so the "anything changed since" check is the one that answers)
  perform pg_temp.t_eq('E2d undo move after the edit -> stale', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_private_undo_move(%L, %s)', v_pb, pg_temp.t_pver(v_pb))) ->> 'status', 'stale');
  perform pg_temp.t_eq('E2d ... and nothing changed', pg_temp.t_state(), v_s);
  perform pg_temp.t_eq('E2d the private testing is still there, paying by check, the registration still withdrawn',
    pg_temp.t_ppaying(v_pb) || ':' || (select r.status from public.testing_registrations r where r.id = v_mb), 'check:withdrawn');


  -- ===================================================================
  -- C1. The results CSV (event E1, today)
  -- ===================================================================
  -- E1 already has "Cb30 Today" (Yellow, paid 75.00 by check). Add:
  --   Orange "Cb30 Alpha" with a result + note (not paid)
  --   Yellow "Cb30 Removed" (withdrawn), "Cb30 Copy" (a duplicate copy),
  --   Yellow "Cb30 Moved" (moved to private) - all three left out
  v_x := pg_temp.t_reg(v_e1, v_e1k2, 'Cb30', 'Alpha', 'card');
  insert into public.testing_results (registration_id, result, note) values (v_x, 'not_passed', '=HYPERLINK("x")');
  v_w := pg_temp.t_reg(v_e1, v_e1k1, 'Cb30', 'Removed', 'cash');
  perform pg_temp.t_eq('C1 setup withdraw', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_withdraw_student(%L, 1)', v_w)) ->> 'status', 'ok');
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
                                            status, withdrawn_reason, withdrawn_at, withdrawn_by_name)
  values (v_e1, v_e1k1, 'Cb30', 'Copy', 'cash', true, 'staff', 'withdrawn', 'duplicate_copy', now(), 'Test')
  returning id into v_dup;
  v_y := pg_temp.t_reg(v_e1, v_e1k1, 'Cb30', 'Moved', 'cash');
  perform pg_temp.t_eq('C1 setup move', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_move_to_private(%L, 1, %L, %L)', v_y, v_today + 4, '18:00')) ->> 'status', 'ok');

  perform pg_temp.t_eq('C1 invalid', pg_temp.t_call('authenticated', v_c_a1, 'public.testing_results_csv(null)') ->> 'status', 'invalid');
  perform pg_temp.t_eq('C1 not_found', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_results_csv(%L)', gen_random_uuid())) ->> 'status', 'not_found');
  v_n := (select count(*) from public.testing_downloads);
  perform pg_temp.t_eq('C1 refusals wrote no download row', v_n::text, '0');

  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_results_csv(%L)', v_e1));
  perform pg_temp.t_eq('C1 ok', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('C1 answer keys', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k), 'event,rows,status');
  perform pg_temp.t_eq('C1 event', (v_r -> 'event')::text,
    jsonb_build_object('id', v_e1, 'name', v_tag || ' today', 'testing_date', v_today, 'location_code', 'worcester',
                       'location_name', (select l.name from public.locations l where l.code = 'worcester'))::text);
  perform pg_temp.t_eq('C1 two active students only (removed, duplicate copy and moved left out)',
    jsonb_array_length(v_r -> 'rows')::text, '2');
  perform pg_temp.t_eq('C1 every row has exactly these keys',
    (select count(*)::text from jsonb_array_elements(v_r -> 'rows') e
      where (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(e) k)
            = 'class_name,current_belt,end_time,first_name,last_name,note,paid,paid_cents,paid_method,paid_on,paying_by,reference,'
              || 'registration_id,result,start_time,testing_for'), '2');
  perform pg_temp.t_eq('C1 belt order: Yellow (first in the class) before Orange',
    (v_r -> 'rows' -> 0 ->> 'last_name') || ',' || (v_r -> 'rows' -> 1 ->> 'last_name'), 'Today,Alpha');
  perform pg_temp.t_eq('C1 row 1 (paid Yellow)', (v_r -> 'rows' -> 0)::text,
    jsonb_build_object('registration_id', v_m, 'reference', (select r.reference from public.testing_registrations r where r.id = v_m),
      'first_name', 'Cb30', 'last_name', 'Today', 'class_name', v_tag, 'start_time', '17:00:00', 'end_time', '18:00:00',
      'current_belt', 'Yellow', 'testing_for', 'Orange', 'result', null, 'note', null, 'paying_by', 'check', 'paid', true,
      'paid_cents', 7500, 'paid_on', v_today, 'paid_method', 'check')::text);
  perform pg_temp.t_eq('C1 row 2 (Orange: No new rank, result + note as stored, not paid)', (v_r -> 'rows' -> 1)::text,
    jsonb_build_object('registration_id', v_x, 'reference', (select r.reference from public.testing_registrations r where r.id = v_x),
      'first_name', 'Cb30', 'last_name', 'Alpha', 'class_name', v_tag, 'start_time', '17:00:00', 'end_time', '18:00:00',
      'current_belt', 'Orange', 'testing_for', null, 'result', 'not_passed', 'note', '=HYPERLINK("x")', 'paying_by', 'card',
      'paid', false, 'paid_cents', 0, 'paid_on', null, 'paid_method', null)::text);
  perform pg_temp.t_eq('C1 the reference looks like CB-3101', ((v_r -> 'rows' -> 0 ->> 'reference') ~ '^CB-[0-9]{4,}$')::text, 'true');
  perform pg_temp.t_eq('C1 no login ids or staff names in the answer',
    (select count(*)::text from pg_temp.t_keys(v_r) k where k = any (v_bad) or k like '%by_name' or k = 'signature'), '0');
  perform pg_temp.t_eq('C1 one download row: who, which event, how many rows',
    (select count(*) || ':' || min(d.event_name) || ':' || min(d.row_count) || ':' || bool_and(d.downloaded_by = v_admin) || ':'
            || min(d.downloaded_by_name) || ':' || bool_and(d.event_id = v_e1)
       from public.testing_downloads d), '1:' || v_tag || ' today:2:true:' || v_an || ':true');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_results_csv(%L)', v_e1));
  perform pg_temp.t_eq('C1 a second download, a second row',
    (v_r ->> 'status') || ':' || (select count(*) from public.testing_downloads), 'ok:2');
  perform pg_temp.t_eq('C1 the download is not in the history (change_log)',
    (select count(*)::text from public.change_log l where l.table_name = 'testing_downloads' or l.action = 'testing_results_csv'), '0');
  -- the log can't be changed, removed, emptied or written by hand - not even by the SQL Editor's role
  begin
    update public.testing_downloads set row_count = 99;
    raise exception 'TEST FAILED: C1 a download row could be changed';
  exception when check_violation then null;
  end;
  begin
    delete from public.testing_downloads;
    raise exception 'TEST FAILED: C1 a download row could be removed';
  exception when check_violation then null;
  end;
  begin
    insert into public.testing_downloads (event_id, event_name, row_count, downloaded_by_name) values (v_e1, 'fake', 0, 'x');
    raise exception 'TEST FAILED: C1 a download row could be written by hand';
  exception when check_violation then null;
  end;
  begin
    truncate public.testing_downloads;
    raise exception 'TEST FAILED: C1 the download log could be emptied';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
  perform pg_temp.t_eq('C1 the log is untouched', (select count(*)::text from public.testing_downloads), '2');
  -- the app's role can't read or write the table at all
  begin
    perform set_config('request.jwt.claims', v_c_a1, true);
    set local role authenticated;
    perform count(*) from public.testing_downloads;
    reset role;
    raise exception 'TEST FAILED: C1 authenticated could read testing_downloads';
  exception when insufficient_privilege then
    reset role;
  end;
  perform set_config('request.jwt.claims', '', true);


  -- ===================================================================
  -- K1. Catalog
  -- ===================================================================
  for v_fn in
    select p.proname, p.prosecdef, p.proconfig, p.provolatile,
           coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' order by 1)
                       from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee <> p.proowner), '') as rights
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('testing_mark_paid_by', 'testing_private_mark_paid_by', 'testing_undo_payment', 'testing_private_undo_payment',
                         'testing_edit_payment', 'testing_private_edit_payment', 'testing_move_to_private', 'testing_private_undo_move',
                         'testing_registration_history', 'testing_private_history', 'testing_results_csv',
                         'testing_history_strip', 'testing_downloads_guard', 'testing_mark_paid', 'testing_private_mark_paid')
  loop
    if not coalesce('search_path=""' = any (v_fn.proconfig), false) then
      raise exception 'TEST FAILED: K1 % has no search_path = ''''', v_fn.proname;
    end if;
    if v_fn.proname in ('testing_history_strip', 'testing_downloads_guard') then
      if v_fn.prosecdef or v_fn.rights <> '' then
        raise exception 'TEST FAILED: K1 % (definer %, rights "%") must be for nobody', v_fn.proname, v_fn.prosecdef, v_fn.rights;
      end if;
    elsif not v_fn.prosecdef or v_fn.rights <> 'authenticated:EXECUTE' then
      raise exception 'TEST FAILED: K1 % (definer %, rights "%")', v_fn.proname, v_fn.prosecdef, v_fn.rights;
    end if;
  end loop;
  perform pg_temp.t_eq('K1 each function once (the old Mark paid functions still there; the replaced ones not doubled)',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('testing_mark_paid_by', 'testing_private_mark_paid_by', 'testing_undo_payment', 'testing_private_undo_payment',
                          'testing_edit_payment', 'testing_private_edit_payment', 'testing_move_to_private', 'testing_private_undo_move',
                          'testing_registration_history', 'testing_private_history', 'testing_results_csv',
                          'testing_history_strip', 'testing_downloads_guard', 'testing_mark_paid', 'testing_private_mark_paid')),
    -- 0035 removes the two old ones (both together, never one alone)
    case when to_regprocedure('public.testing_mark_paid(uuid, integer)') is null
          and to_regprocedure('public.testing_private_mark_paid(uuid, integer)') is null then '13' else '15' end);
  perform pg_temp.t_eq('K1 the history readers are stable, the writers volatile',
    (select string_agg(p.proname || '=' || p.provolatile::text, ',' order by p.proname collate "C") from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('testing_registration_history', 'testing_private_history', 'testing_results_csv',
                                                    'testing_mark_paid_by', 'testing_private_mark_paid_by')),
    'testing_mark_paid_by=v,testing_private_history=s,testing_private_mark_paid_by=v,testing_registration_history=s,testing_results_csv=v');
  perform pg_temp.t_eq('K1 testing_downloads: RLS on, no rights, no read rules',
    (select c.relrowsecurity || ':' || coalesce((select string_agg(a.grantee::regrole::text, ',') from aclexplode(c.relacl) a
                                                  where a.grantee <> c.relowner), '') || ':'
            || (select count(*) from pg_policies pp where pp.schemaname = 'public' and pp.tablename = 'testing_downloads')
       from pg_class c where c.oid = 'public.testing_downloads'::regclass), 'true::0');
  perform pg_temp.t_eq('K1 paying_by_before on testing_payments: no column rights (0005 lists its columns)',
    (select coalesce(t.attacl::text, 'none') from pg_attribute t
      where t.attrelid = 'public.testing_payments'::regclass and t.attname = 'paying_by_before'), 'none');
  perform pg_temp.t_eq('K1 paying_by_before on testing_private_payments: SELECT for authenticated only (0014: every column but login ids)',
    (select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' order by 1) from pg_attribute t, aclexplode(t.attacl) a
      where t.attrelid = 'public.testing_private_payments'::regclass and t.attname = 'paying_by_before'), 'authenticated:SELECT');
  perform pg_temp.t_eq('K1 the app still reads the payment columns it read before',
    (has_column_privilege('authenticated', 'public.testing_payments', 'method', 'select')
     and has_column_privilege('authenticated', 'public.testing_private_payments', 'method', 'select')
     and not has_column_privilege('authenticated', 'public.testing_payments', 'paying_by_before', 'select'))::text, 'true');
  perform pg_temp.t_eq('K1 nothing new for anon, service_role or the family form on the payment tables or the log',
    (has_table_privilege('anon', 'public.testing_downloads', 'select')
     or has_table_privilege('service_role', 'public.testing_downloads', 'select')
     or has_column_privilege('anon', 'public.testing_payments', 'paying_by_before', 'select')
     or has_column_privilege('anon', 'public.testing_private_payments', 'paying_by_before', 'select')
     or has_column_privilege('service_role', 'public.testing_private_payments', 'paying_by_before', 'select')
     or has_column_privilege('testing_registrar', 'public.testing_private_payments', 'paying_by_before', 'select'))::text, 'false');
  perform pg_temp.t_eq('K1 the payment rule refuses a remembered paying by on a reversal or equal to the method',
    (select count(*)::text from pg_constraint c
      where c.conname in ('testing_payments_paying_by_before_check', 'testing_private_payments_paying_by_before_check')
        and pg_get_constraintdef(c.oid) like '%kind = ''payment''%'
        and pg_get_constraintdef(c.oid) like '%paying_by_before <> method%'), '2');
  -- and the rule really refuses it (as the SQL Editor; the guard lets inserts through)
  begin
    insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name, paying_by_before)
    values (v_m, 'payment', 100, 'cash', v_today, 'x', 'cash');
    raise exception 'TEST FAILED: K1 a payment could remember the same paying by as its method';
  exception when check_violation then null;
  end;
  -- no answer of any call in this test held a login id
  perform pg_temp.t_eq('K1 no login-id key in any answer',
    (select count(*)::text from t_answers a, lateral pg_temp.t_keys(a.r) k where k = any (v_bad)), '0');
end;
$$;

select 'ALL 0030 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
