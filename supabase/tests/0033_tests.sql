-- =====================================================================
-- 0033_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0033_camps_design_review.sql
--   (rulebook v0.735: Mark paid with a way to pay; v0.736: the Camper
--   history line). It checks, in this order:
--     M1  the app from BEFORE 0033: camp_mark_paid called with its 3
--         NAMED inputs (p_camper_id, p_expected_version, p_school - how
--         supabase-js sends it) and with 3 POSITIONAL inputs: both reach
--         the 4-input function with no way, pay by the camper's Paying by,
--         change nothing else, remember nothing (paying_by_before empty)
--     M2  the same way sent: the same as M1
--     M3  another way sent: the payment is that way, Paying by becomes it,
--         the payment remembers the old one; the payment and the camper's
--         change are ONE batch in the history; the answer says paying_by
--     M4  a bad way -> {"status":"invalid","field":"method"}, nothing
--         written; no session -> no_access; the desk (staff) and an admin
--         both may Mark paid with a way
--     U1  Undo payment (the desk's own, within 10 s) puts the old Paying
--         by back, in the reversal's batch
--     U2  ... but not when Paying by was changed again since
--     U3  Undo of a payment without paying_by_before changes no Paying by
--     E1  Edit payment (admin) to another way: Paying by follows, the new
--         payment remembers the family's choice; Undo of it puts it back
--     E2  Edit payment that keeps the way: Paying by stays, nothing
--         remembered
--     E3  Edit of a payment made by Mark paid by another way, to a third
--         way: the family's choice (the first Paying by) is remembered;
--         Undo puts it back
--     E5  Edit of a payment that is NOT the camper's newest, to another
--         way: Paying by follows and the new payment remembers the Paying
--         by of before the edit (Color Belt 0030's rule); Undo of it puts
--         that back; the newest payment is untouched
--     M5  Mark paid with a way: a stale double click (second call ->
--         stale, no second payment, nothing written); a withdrawn camper
--         -> withdrawn, nothing written
--     E4  Edit payment as the desk -> not_allowed
--     F1  paying_by_on_form: copied from paying_by when a camper signs up;
--         an update can't change it (no version bump, no history row);
--         it doesn't follow Paying by; the roster shows it as its LAST
--         column (the 33 columns before it unchanged) and Camper detail
--         has it
--     H1  camp_camper_history: the camper's own rows, days, extras and
--         payments, newest first, each with a batch id; the sign-up's rows
--         in EVERY sibling's history; a sibling's own rows never; no
--         check-in rows; no login ids anywhere (no actor_id, session_id or
--         *_by keys, no login uuid in any value); the signature only "on
--         file"; at most 500 rows; no_access, invalid, not_found
--     G1  rights: exactly ONE camp_mark_paid (uuid, integer, text, text);
--         the old 3-input one is gone; the app functions are security
--         definer with search_path = '', run by authenticated only (not
--         anon, PUBLIC, service_role or camps_registrar); the two helpers
--         by nobody; the new columns' read rights; the roster's options
--   It makes its own camp called "zz test 1a2b3c4d ...", so it works
--   whatever is already in the database, and on any weekday.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test camp, sign-ups, payments,
--   history rows, test sessions). NEVER change the final "rollback;" to
--   "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0027_tests.sql: a pretend login token per session in
--   request.jwt.claims. A1 = admin unlocked, D1 = desk unlocked. The
--   family form's function is called as the SQL Editor's own role (it
--   runs as its owner, so the answers are the same as for
--   camps_registrar).
--
-- BEFORE YOU RUN IT
--   1. 0013, 0017, 0022, 0027 and 0033 are applied. You need TWO
--      existing, ACTIVE staff rows: an admin and the shared front desk
--      (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Everything is rolled back.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0033 TESTS PASSED".
--   * Failed: an error starting with "TEST FAILED:" (or "TEST SETUP:")
--     saying which check broke and what came back instead. Nothing was
--     saved either way. If it failed, run   rollback;   on its own once.
-- =====================================================================

begin;

do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();
  v_amr jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60));
  v_c_a1 text;
  v_c_d1 text;

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  -- a Monday 15-21 days from now: the test camp is Mon-Wed of that week
  v_mon   date := date_trunc('week', (public.testing_today() + 14)::timestamp)::date + 7;
  v_camp  uuid;
  v_lunch uuid;

  v_r     jsonb;
  v_h     jsonb;
  v_x     jsonb;
  v_n     integer;
  v_v     integer;
  v_pay   uuid;
  v_pay2  uuid;
  v_batch text;
  v_mark  bigint;
  v_snap  text;
  v_cols  text[];
  v_fn    record;
  v_fname text;
  -- campers: one sign-up of three siblings (Ann, Ben, Cy; Paying by cash)
  -- and single children on their own sign-ups
  v_ann uuid; v_ben uuid; v_cy uuid;
  v_dan uuid; v_eve uuid; v_fin uuid; v_gil uuid; v_hal uuid; v_ivy uuid; v_jo uuid; v_kit uuid;
  v_lee uuid; v_max uuid; v_ned uuid;
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  if not exists (select 1 from public.staff s where s.id = v_admin and s.active and s.role = 'admin') then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  if not exists (select 1 from public.staff s where s.id = v_desk and s.active and s.role = 'staff') then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regprocedure('public.camp_camper_history(uuid)') is null then
    raise exception 'TEST SETUP: public.camp_camper_history is missing (is 0033 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  begin
    insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_d1, v_desk);
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr)::text;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true then raise exception 'TEST SETUP: the admin session has no data access'; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.has_data_access() is not true then raise exception 'TEST SETUP: the desk session has no data access'; end if;

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   su(camp, names[], paying_by)  one family sign-up of these children
  --                 on all 3 days, lunch on day 1 (sends the right total);
  --                 the camper ids back, in the order given
  --   cv(camper)    its version;   pb(camper)  its Paying by
  --   pay(id)       a payment row as jsonb (paying_by_before included)
  --   st(label, answer, status)     fails unless answer.status = status
  --   hist(camper)  camp_camper_history's rows (fails unless ok)
  execute $f$
    create function pg_temp.su(p_camp uuid, p_names text[], p_paying_by text) returns uuid[] language plpgsql as $b$
    declare
      v_children jsonb;
      v_r        jsonb;
      v_total    integer := 0;
      v_try      integer;
    begin
      select jsonb_agg(jsonb_build_object('first_name', n.name, 'last_name', 'Paytest', 'age', 8, 'member', true,
                         'day_ids', (select jsonb_agg(d.id order by d.day) from public.camp_days d where d.camp_id = p_camp),
                         'extras', jsonb_build_array(jsonb_build_object(
                                     'extra_id', (select e.id from public.camp_extras e where e.camp_id = p_camp and e.name = 'Lunch'),
                                     'day_ids', (select jsonb_agg(d.id) from (select d.id from public.camp_days d
                                                                                where d.camp_id = p_camp order by d.day limit 1) as d))))
                       order by n.k)
        into v_children
        from unnest(p_names) with ordinality as n(name, k);
      -- the first try sends 0 cents; the form answers price_changed with
      -- the right total, which the second try sends
      for v_try in 1 .. 2 loop
        select public.camp_public_signup(c.public_code, 'zz-0033-' || gen_random_uuid()::text, gen_random_uuid(), v_children,
                 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', p_paying_by, true,
                 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                 'camp-2026-10-18', md5(c.waiver_text), v_total)
          into v_r
          from public.camps c where c.id = p_camp;
        exit when v_r ->> 'status' = 'ok';
        if v_r ->> 'status' is distinct from 'price_changed' then
          raise exception 'TEST SETUP: sign-up of % answered %', p_names, v_r;
        end if;
        v_total := (v_r ->> 'new_total_cents')::integer;
      end loop;
      if v_r ->> 'status' is distinct from 'ok' then
        raise exception 'TEST SETUP: sign-up of % answered %', p_names, v_r;
      end if;
      return array(select c.id from public.camp_campers c join public.camp_signups s on s.id = c.signup_id
                    where s.reference = v_r ->> 'reference' order by c.position);
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.cv(p_camper uuid) returns integer language sql as $b$
      select c.version from public.camp_campers c where c.id = p_camper;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.pb(p_camper uuid) returns text language sql as $b$
      select c.paying_by from public.camp_campers c where c.id = p_camper;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.pay(p_id uuid) returns jsonb language sql as $b$
      select to_jsonb(p) from public.camp_payments p where p.id = p_id;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.st(p_label text, p_got jsonb, p_status text) returns jsonb language plpgsql as $b$
    begin
      if p_got ->> 'status' is distinct from p_status then
        raise exception 'TEST FAILED: % expected %, got %', p_label, p_status, p_got;
      end if;
      return p_got;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.hist(p_camper uuid) returns jsonb language plpgsql as $b$
    declare
      v_r jsonb;
    begin
      v_r := public.camp_camper_history(p_camper);
      if v_r ->> 'status' is distinct from 'ok' then
        raise exception 'TEST FAILED: camp_camper_history answered %', v_r;
      end if;
      return v_r -> 'rows';
    end;
    $b$;
  $f$;

  -- The test camp (admin): Mon-Wed, a per-day Lunch
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.camp_add_camp('worcester', false, v_tag, array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           public.testing_today() - 3, public.testing_today() + 5, public.testing_today() + 5, 5, 12,
           '[{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000, "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000},
             {"day_count": 2, "member_early_cents": 14000, "member_regular_cents": 15000, "nonmember_early_cents": 15000, "nonmember_regular_cents": 16000},
             {"day_count": 3, "member_early_cents": 19500, "member_regular_cents": 21000, "nonmember_early_cents": 20500, "nonmember_regular_cents": 22000}]'::jsonb,
           '[{"name": "Lunch", "price_cents": 700, "per": "day", "not_for_all_days": false}]'::jsonb,
           null, 'I agree to the camp rules.');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: camp_add_camp answered %', v_r; end if;
  v_camp := (v_r ->> 'id')::uuid;
  select e.id into v_lunch from public.camp_extras e where e.camp_id = v_camp;

  -- the family form (no login)
  perform set_config('request.jwt.claims', '', true);
  select x[1], x[2], x[3] into v_ann, v_ben, v_cy from pg_temp.su(v_camp, array['Ann', 'Ben', 'Cy'], 'cash') as x;
  v_dan := (pg_temp.su(v_camp, array['Dan'], 'cash'))[1];
  v_eve := (pg_temp.su(v_camp, array['Eve'], 'cash'))[1];
  v_fin := (pg_temp.su(v_camp, array['Fin'], 'check'))[1];
  v_gil := (pg_temp.su(v_camp, array['Gil'], 'cash'))[1];
  v_hal := (pg_temp.su(v_camp, array['Hal'], 'cash'))[1];
  v_ivy := (pg_temp.su(v_camp, array['Ivy'], 'cash'))[1];
  v_jo  := (pg_temp.su(v_camp, array['Jo'], 'cash'))[1];
  v_kit := (pg_temp.su(v_camp, array['Kit'], 'card'))[1];
  v_lee := (pg_temp.su(v_camp, array['Lee'], 'cash'))[1];
  v_max := (pg_temp.su(v_camp, array['Max'], 'cash'))[1];
  v_ned := (pg_temp.su(v_camp, array['Ned'], 'cash'))[1];
  if v_kit is null or v_cy is null then raise exception 'TEST SETUP: the sign-ups made no campers'; end if;

  -- ===================================================================
  -- F1 (first part). paying_by_on_form is the form's choice
  -- ===================================================================
  if (select c.paying_by_on_form from public.camp_campers c where c.id = v_ann) <> 'cash'
     or (select c.paying_by_on_form from public.camp_campers c where c.id = v_fin) <> 'check'
     or (select c.paying_by_on_form from public.camp_campers c where c.id = v_kit) <> 'card' then
    raise exception 'TEST FAILED: F1 paying_by_on_form is not the form''s choice (Ann cash, Fin check, Kit card)';
  end if;

  -- ===================================================================
  -- M1. The app from before 0033: 3 inputs, NAMED and POSITIONAL
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_v := pg_temp.cv(v_dan);
  v_r := pg_temp.st('M1 named 3-input call (p_camper_id, p_expected_version, p_school)',
           public.camp_mark_paid(p_camper_id => v_dan, p_expected_version => v_v, p_school => 'worcester'), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  if v_r ->> 'method' <> 'cash' or v_r ->> 'paying_by' <> 'cash' or pg_temp.pb(v_dan) <> 'cash'
     or pg_temp.pay(v_pay) ->> 'method' <> 'cash' or pg_temp.pay(v_pay) -> 'paying_by_before' <> 'null'::jsonb
     or (v_r ->> 'version')::integer <> v_v + 1 or pg_temp.cv(v_dan) <> v_v + 1
     or (select r.owes_cents from public.camp_roster r where r.id = v_dan) <> 0 then
    raise exception 'TEST FAILED: M1 named call: %, payment %', v_r, pg_temp.pay(v_pay);
  end if;
  -- the camper's update in that batch is only the version (no Paying by change)
  if exists (select 1 from public.change_log l
              where l.batch_id = (select b.batch_id from public.change_log b
                                   where b.table_name = 'camp_payments' and b.record_id = v_pay and b.op = 'insert')
                and l.table_name = 'camp_campers' and (l.after ->> 'paying_by') is not null) then
    raise exception 'TEST FAILED: M1 named call changed Paying by in the history';
  end if;
  v_v := pg_temp.cv(v_eve);
  v_r := pg_temp.st('M1 positional 3-input call', public.camp_mark_paid(v_eve, v_v, 'worcester'), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  if v_r ->> 'method' <> 'cash' or v_r ->> 'paying_by' <> 'cash' or pg_temp.pb(v_eve) <> 'cash'
     or pg_temp.pay(v_pay) -> 'paying_by_before' <> 'null'::jsonb then
    raise exception 'TEST FAILED: M1 positional call: %, payment %', v_r, pg_temp.pay(v_pay);
  end if;
  -- the old app's school refusal is unchanged
  if public.camp_mark_paid(v_fin, pg_temp.cv(v_fin), null) is distinct from '{"status": "invalid", "field": "school"}'::jsonb then
    raise exception 'TEST FAILED: M1 no school -> invalid/school';
  end if;

  -- ===================================================================
  -- M2. The same way sent
  -- ===================================================================
  v_r := pg_temp.st('M2 same way (check for a check camper)',
           public.camp_mark_paid(v_fin, pg_temp.cv(v_fin), 'worcester', 'check'), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  if v_r ->> 'method' <> 'check' or pg_temp.pb(v_fin) <> 'check' or pg_temp.pay(v_pay) -> 'paying_by_before' <> 'null'::jsonb then
    raise exception 'TEST FAILED: M2: %, payment %', v_r, pg_temp.pay(v_pay);
  end if;

  -- ===================================================================
  -- M4. Bad way, no session, desk and admin
  -- ===================================================================
  v_v := pg_temp.cv(v_gil);
  select count(*) into v_n from public.change_log;
  if public.camp_mark_paid(v_gil, v_v, 'worcester', 'gold') is distinct from '{"status": "invalid", "field": "method"}'::jsonb
     or public.camp_mark_paid(v_gil, v_v, 'worcester', '') is distinct from '{"status": "invalid", "field": "method"}'::jsonb
     or public.camp_mark_paid(p_camper_id => v_gil, p_expected_version => v_v, p_school => 'worcester', p_method => 'CARD')
          is distinct from '{"status": "invalid", "field": "method"}'::jsonb then
    raise exception 'TEST FAILED: M4 a bad way is not invalid/method';
  end if;
  if pg_temp.cv(v_gil) <> v_v or (select count(*) from public.change_log) <> v_n
     or exists (select 1 from public.camp_payments p where p.camper_id = v_gil) then
    raise exception 'TEST FAILED: M4 a refused Mark paid wrote something';
  end if;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('M4 no session', public.camp_mark_paid(v_gil, v_v, 'worcester', 'card'), 'no_access');

  -- ===================================================================
  -- M3. Another way sent (the desk): Paying by follows, one batch
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_v := pg_temp.cv(v_gil);
  v_r := pg_temp.st('M3 desk marks Gil paid by card', public.camp_mark_paid(v_gil, v_v, 'worcester', 'card'), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  if v_r ->> 'method' <> 'card' or v_r ->> 'paying_by' <> 'card' or pg_temp.pb(v_gil) <> 'card'
     or pg_temp.pay(v_pay) ->> 'method' <> 'card' or pg_temp.pay(v_pay) ->> 'paying_by_before' <> 'cash'
     or (v_r ->> 'version')::integer <> v_v + 1 or pg_temp.cv(v_gil) <> v_v + 1 then
    raise exception 'TEST FAILED: M3: %, payment %', v_r, pg_temp.pay(v_pay);
  end if;
  if (select c.paying_by_on_form from public.camp_campers c where c.id = v_gil) <> 'cash' then
    raise exception 'TEST FAILED: M3 paying_by_on_form moved with Paying by';
  end if;
  select b.batch_id::text into v_batch from public.change_log b
   where b.table_name = 'camp_payments' and b.record_id = v_pay and b.op = 'insert';
  if v_batch is null
     or not exists (select 1 from public.change_log l
                     where l.batch_id::text = v_batch and l.table_name = 'camp_campers' and l.record_id = v_gil
                       and l.op = 'update' and l.action = 'camp_mark_paid'
                       and l.before ->> 'paying_by' = 'cash' and l.after ->> 'paying_by' = 'card') then
    raise exception 'TEST FAILED: M3 the Paying by change is not logged in the payment''s batch';
  end if;
  -- an admin may too
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('M4 admin marks Hal paid by check', public.camp_mark_paid(v_hal, pg_temp.cv(v_hal), 'shrewsbury', 'check'), 'ok');
  if pg_temp.pb(v_hal) <> 'check' or v_r ->> 'school' <> 'shrewsbury'
     or pg_temp.pay((v_r ->> 'payment_id')::uuid) ->> 'paying_by_before' <> 'cash' then
    raise exception 'TEST FAILED: M4 admin with a way: %', v_r;
  end if;

  -- ===================================================================
  -- U1. Undo (the desk's own, within 10 s) puts Paying by back
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_v := pg_temp.cv(v_gil);
  v_r := pg_temp.st('U1 desk undoes Gil''s card payment', public.camp_undo_payment(v_pay), 'ok');
  if pg_temp.pb(v_gil) <> 'cash' or (v_r ->> 'version')::integer <> v_v + 1 or pg_temp.cv(v_gil) <> v_v + 1 then
    raise exception 'TEST FAILED: U1 Paying by % (want cash), %', pg_temp.pb(v_gil), v_r;
  end if;
  if not exists (select 1 from public.change_log l
                  where l.table_name = 'camp_campers' and l.record_id = v_gil and l.action = 'camp_undo_payment'
                    and l.before ->> 'paying_by' = 'card' and l.after ->> 'paying_by' = 'cash'
                    and l.batch_id = (select b.batch_id from public.change_log b
                                       where b.table_name = 'camp_payments' and b.op = 'insert'
                                         and b.after ->> 'reverses_payment_id' = v_pay::text)) then
    raise exception 'TEST FAILED: U1 the Paying by change is not logged in the reversal''s batch';
  end if;

  -- ===================================================================
  -- U2. ... not when Paying by was changed again since
  -- ===================================================================
  v_r := pg_temp.st('U2 Ivy paid by card', public.camp_mark_paid(v_ivy, pg_temp.cv(v_ivy), 'worcester', 'card'), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  -- someone changes Paying by afterwards (here: by hand, as the SQL Editor)
  perform set_config('request.jwt.claims', '', true);
  update public.camp_campers c set paying_by = 'check' where c.id = v_ivy;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('U2 admin undoes Ivy''s payment', public.camp_undo_payment(v_pay), 'ok');
  if pg_temp.pb(v_ivy) <> 'check' then
    raise exception 'TEST FAILED: U2 Paying by % (want check: it was changed since)', pg_temp.pb(v_ivy);
  end if;

  -- ===================================================================
  -- U3. A payment without paying_by_before: Undo changes no Paying by
  -- ===================================================================
  v_pay := (select p.id from public.camp_payments p where p.camper_id = v_dan and p.kind = 'payment');
  perform pg_temp.st('U3 admin undoes Dan''s payment', public.camp_undo_payment(v_pay), 'ok');
  if pg_temp.pb(v_dan) <> 'cash' then raise exception 'TEST FAILED: U3 Paying by moved'; end if;

  -- ===================================================================
  -- E1. Edit payment to another way: Paying by follows; Undo puts it back
  -- ===================================================================
  v_pay := (select p.id from public.camp_payments p where p.camper_id = v_eve and p.kind = 'payment');   -- cash, from M1
  v_r := pg_temp.st('E1 edit Eve''s cash payment to card',
           public.camp_edit_payment(v_pay, 'card', (pg_temp.pay(v_pay) ->> 'amount_cents')::integer, public.testing_today(), 'worcester'),
           'ok');
  v_pay2 := (v_r ->> 'payment_id')::uuid;
  if pg_temp.pb(v_eve) <> 'card' or pg_temp.pay(v_pay2) ->> 'paying_by_before' <> 'cash' then
    raise exception 'TEST FAILED: E1 Paying by % (want card), new payment %', pg_temp.pb(v_eve), pg_temp.pay(v_pay2);
  end if;
  if not exists (select 1 from public.change_log l
                  where l.table_name = 'camp_campers' and l.record_id = v_eve and l.action = 'camp_edit_payment'
                    and l.after ->> 'paying_by' = 'card'
                    and l.batch_id = (select b.batch_id from public.change_log b
                                       where b.table_name = 'camp_payments' and b.record_id = v_pay2 and b.op = 'insert')) then
    raise exception 'TEST FAILED: E1 the Paying by change is not logged in the edit''s batch';
  end if;
  perform pg_temp.st('E1 undo the edited payment', public.camp_undo_payment(v_pay2), 'ok');
  if pg_temp.pb(v_eve) <> 'cash' then raise exception 'TEST FAILED: E1 after Undo Paying by % (want cash)', pg_temp.pb(v_eve); end if;

  -- ===================================================================
  -- E2. Edit payment that keeps the way
  -- ===================================================================
  v_pay := (select p.id from public.camp_payments p where p.camper_id = v_fin and p.kind = 'payment');   -- check, from M2
  v_r := pg_temp.st('E2 edit Fin''s amount only',
           public.camp_edit_payment(v_pay, 'check', 1000, public.testing_today(), 'worcester'), 'ok');
  if pg_temp.pb(v_fin) <> 'check' or pg_temp.pay((v_r ->> 'payment_id')::uuid) -> 'paying_by_before' <> 'null'::jsonb then
    raise exception 'TEST FAILED: E2 Paying by % / %', pg_temp.pb(v_fin), pg_temp.pay((v_r ->> 'payment_id')::uuid);
  end if;

  -- ===================================================================
  -- E3. Edit a Mark-paid-by-another-way payment to a third way
  -- ===================================================================
  v_pay := (select p.id from public.camp_payments p where p.camper_id = v_hal and p.kind = 'payment');   -- check, before cash
  v_r := pg_temp.st('E3 edit Hal''s check payment to card',
           public.camp_edit_payment(v_pay, 'card', (pg_temp.pay(v_pay) ->> 'amount_cents')::integer, public.testing_today(), 'shrewsbury'),
           'ok');
  v_pay2 := (v_r ->> 'payment_id')::uuid;
  if pg_temp.pb(v_hal) <> 'card' or pg_temp.pay(v_pay2) ->> 'paying_by_before' <> 'cash' then
    raise exception 'TEST FAILED: E3 Paying by % (want card), new payment %', pg_temp.pb(v_hal), pg_temp.pay(v_pay2);
  end if;
  perform pg_temp.st('E3 undo', public.camp_undo_payment(v_pay2), 'ok');
  if pg_temp.pb(v_hal) <> 'cash' then raise exception 'TEST FAILED: E3 after Undo Paying by % (want cash)', pg_temp.pb(v_hal); end if;
  -- E3b. edited back to the family's own way: nothing to remember
  v_r := pg_temp.st('E3b Jo paid by card', public.camp_mark_paid(v_jo, pg_temp.cv(v_jo), 'worcester', 'card'), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.st('E3b edit Jo''s card payment to cash',
           public.camp_edit_payment(v_pay, 'cash', (pg_temp.pay(v_pay) ->> 'amount_cents')::integer, public.testing_today(), 'worcester'),
           'ok');
  if pg_temp.pb(v_jo) <> 'cash' or pg_temp.pay((v_r ->> 'payment_id')::uuid) -> 'paying_by_before' <> 'null'::jsonb then
    raise exception 'TEST FAILED: E3b Paying by % / %', pg_temp.pb(v_jo), pg_temp.pay((v_r ->> 'payment_id')::uuid);
  end if;

  -- ===================================================================
  -- E5. Edit of a payment that is NOT the camper's newest (as 0030: the
  --     way changes -> Paying by follows; the family's choice is Paying by
  --     now, because this payment remembered nothing)
  -- ===================================================================
  -- Ned (cash): pays $10 cash (Mark paid, then edited down), then the
  -- rest by card (Paying by cash -> card)
  v_r := pg_temp.st('E5 Ned paid', public.camp_mark_paid(v_ned, pg_temp.cv(v_ned), 'worcester'), 'ok');
  v_r := pg_temp.st('E5 Ned''s payment edited down to $10',
           public.camp_edit_payment((v_r ->> 'payment_id')::uuid, 'cash', 1000, public.testing_today(), 'worcester'), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;                              -- the older payment: $10 cash
  v_r := pg_temp.st('E5 Ned pays the rest by card', public.camp_mark_paid(v_ned, pg_temp.cv(v_ned), 'worcester', 'card'), 'ok');
  v_pay2 := (v_r ->> 'payment_id')::uuid;                             -- the newest: card, remembers cash
  if pg_temp.pb(v_ned) <> 'card' or pg_temp.pay(v_pay2) ->> 'paying_by_before' <> 'cash'
     or pg_temp.pay(v_pay) -> 'paying_by_before' <> 'null'::jsonb then
    raise exception 'TEST FAILED: E5 setup: Paying by %, payments % / %', pg_temp.pb(v_ned), pg_temp.pay(v_pay), pg_temp.pay(v_pay2);
  end if;
  -- edit the OLDER payment from cash to check
  v_r := pg_temp.st('E5 edit Ned''s older payment to check',
           public.camp_edit_payment(v_pay, 'check', 1000, public.testing_today(), 'worcester'), 'ok');
  if pg_temp.pb(v_ned) <> 'check' or pg_temp.pay((v_r ->> 'payment_id')::uuid) ->> 'paying_by_before' <> 'card' then
    raise exception 'TEST FAILED: E5 Paying by % (want check), new payment % (want paying_by_before card)',
      pg_temp.pb(v_ned), pg_temp.pay((v_r ->> 'payment_id')::uuid);
  end if;
  -- Undo of that new payment puts card back; the newest card payment still stands
  perform pg_temp.st('E5 undo the edited older payment', public.camp_undo_payment((v_r ->> 'payment_id')::uuid), 'ok');
  if pg_temp.pb(v_ned) <> 'card'
     or exists (select 1 from public.camp_payments x where x.reverses_payment_id = v_pay2) then
    raise exception 'TEST FAILED: E5 after Undo Paying by % (want card), or the newest payment was touched', pg_temp.pb(v_ned);
  end if;

  -- ===================================================================
  -- M5. Mark paid with a way: a double click (stale), a withdrawn camper
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_v := pg_temp.cv(v_lee);
  perform pg_temp.st('M5 Lee paid by card', public.camp_mark_paid(v_lee, v_v, 'worcester', 'card'), 'ok');
  select count(*) into v_n from public.change_log;
  perform pg_temp.st('M5 the double click (same version, check)', public.camp_mark_paid(v_lee, v_v, 'worcester', 'check'), 'stale');
  if (select count(*) from public.camp_payments p where p.camper_id = v_lee) <> 1 or pg_temp.pb(v_lee) <> 'card'
     or pg_temp.cv(v_lee) <> v_v + 1 or (select count(*) from public.change_log) <> v_n then
    raise exception 'TEST FAILED: M5 the stale double click wrote something (Paying by %)', pg_temp.pb(v_lee);
  end if;
  select public.camp_withdraw_camper(c.id, c.version) into v_r from public.camp_campers c where c.id = v_max;
  perform pg_temp.st('M5 withdraw Max', v_r, 'ok');
  v_v := pg_temp.cv(v_max);
  select count(*) into v_n from public.change_log;
  perform pg_temp.st('M5 Mark paid by card for a withdrawn camper', public.camp_mark_paid(v_max, v_v, 'worcester', 'card'), 'withdrawn');
  if exists (select 1 from public.camp_payments p where p.camper_id = v_max) or pg_temp.pb(v_max) <> 'cash'
     or pg_temp.cv(v_max) <> v_v or (select count(*) from public.change_log) <> v_n then
    raise exception 'TEST FAILED: M5 Mark paid for a withdrawn camper wrote something';
  end if;

  -- ===================================================================
  -- E4. Edit payment as the desk
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_pay := (select p.id from public.camp_payments p where p.camper_id = v_jo and p.kind = 'payment'
               and not exists (select 1 from public.camp_payments x where x.reverses_payment_id = p.id));
  perform pg_temp.st('E4 desk edit', public.camp_edit_payment(v_pay, 'card', 1000, public.testing_today(), 'worcester'),
                     'not_allowed');

  -- ===================================================================
  -- F1. paying_by_on_form can't be changed; roster and detail show it
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  v_v := pg_temp.cv(v_kit);
  select count(*) into v_n from public.change_log;
  update public.camp_campers c set paying_by_on_form = 'cash' where c.id = v_kit;
  if (select c.paying_by_on_form from public.camp_campers c where c.id = v_kit) <> 'card'
     or pg_temp.cv(v_kit) <> v_v or (select count(*) from public.change_log) <> v_n then
    raise exception 'TEST FAILED: F1 an update changed paying_by_on_form, the version or the history';
  end if;
  update public.camp_campers c set paying_by = 'check', paying_by_on_form = 'check' where c.id = v_kit;
  if (select c.paying_by_on_form from public.camp_campers c where c.id = v_kit) <> 'card' or pg_temp.pb(v_kit) <> 'check' then
    raise exception 'TEST FAILED: F1 paying_by_on_form followed a Paying by change';
  end if;
  v_cols := array(select a.attname::text from pg_attribute a
                   where a.attrelid = 'public.camp_roster'::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum);
  if v_cols is distinct from array['id', 'camp_id', 'signup_id', 'position', 'first_name', 'last_name', 'age', 'member',
       'paying_by', 'status', 'withdrawn_reason', 'withdrawn_at', 'withdrawn_by_name', 'duplicate_state', 'duplicate_of',
       'version', 'created_at', 'signup_version', 'reference', 'price_kind', 'signed_up_on', 'signed',
       'signature_deleted_at', 'base_cents', 'days', 'extras', 'total_cents', 'paid_cents', 'owes_cents', 'paid_on',
       'paid_method', 'last_payment_id', 'last_payment_recorded_at', 'paying_by_on_form'] then
    raise exception 'TEST FAILED: F1 camp_roster columns %', v_cols;
  end if;
  if (select r.paying_by_on_form from public.camp_roster r where r.id = v_kit) <> 'card' then
    raise exception 'TEST FAILED: F1 the roster''s paying_by_on_form';
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := pg_temp.st('F1 Camper detail', public.camp_camper_detail(v_kit), 'ok');
  if v_r -> 'camper' ->> 'paying_by_on_form' <> 'card' or v_r -> 'camper' ->> 'paying_by' <> 'check' then
    raise exception 'TEST FAILED: F1 Camper detail camper part %', v_r -> 'camper';
  end if;

  -- ===================================================================
  -- H1. camp_camper_history
  -- ===================================================================
  -- Ann: paid by card (desk), a check-in and its undo, the family's
  -- parent name changed (as the SQL Editor); Ben: nothing of his own
  v_r := pg_temp.st('H1 Ann paid by card', public.camp_mark_paid(v_ann, pg_temp.cv(v_ann), 'worcester', 'card'), 'ok');
  perform pg_temp.st('H1 check Ann in', public.camp_check_in(v_ann, (select d.id from public.camp_days d where d.camp_id = v_camp and d.day = v_mon)), 'ok');
  perform pg_temp.st('H1 undo Ann''s check-in', public.camp_undo_check_in(v_ann, (select d.id from public.camp_days d where d.camp_id = v_camp and d.day = v_mon)), 'ok');
  perform pg_temp.st('H1 check Ann in again', public.camp_check_in(v_ann, (select d.id from public.camp_days d where d.camp_id = v_camp and d.day = v_mon + 1)), 'ok');
  perform set_config('request.jwt.claims', '', true);
  update public.camp_signups s set parent_name = 'Pat Newname'
   where s.id = (select c.signup_id from public.camp_campers c where c.id = v_ann);
  perform set_config('request.jwt.claims', v_c_d1, true);

  v_h := pg_temp.hist(v_ann);
  -- what is there: the sign-up insert + update, Ann's insert + updates,
  -- her 3 days and 1 lunch, her payment
  if not exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_signups' and x ->> 'op' = 'insert')
     or not exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_signups' and x ->> 'op' = 'update'
                       and x -> 'after' ->> 'parent_name' = 'Pat Newname')
     or not exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_campers' and x ->> 'op' = 'insert'
                       and x -> 'after' ->> 'first_name' = 'Ann'
                       -- the strip removes login ids by NAME: paying_by and paying_by_on_form stay
                       and x -> 'after' ->> 'paying_by' = 'cash' and x -> 'after' ->> 'paying_by_on_form' = 'cash'
                       and (x -> 'after' ->> 'created_by_name') is not null)
     or (select count(*) from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_camper_days' and x ->> 'op' = 'insert') <> 3
     or (select count(*) from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_camper_extras' and x ->> 'op' = 'insert') <> 1
     or not exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_payments' and x ->> 'op' = 'insert'
                       and x -> 'after' ->> 'method' = 'card' and x -> 'after' ->> 'paying_by_before' = 'cash'
                       and x ->> 'action' = 'camp_mark_paid' and x ->> 'batch_id' is not null)
     or not exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_campers' and x ->> 'op' = 'update'
                       and x -> 'after' ->> 'paying_by' = 'card' and x -> 'before' ->> 'paying_by' = 'cash'
                       and x ->> 'action' = 'camp_mark_paid') then
    raise exception 'TEST FAILED: H1 Ann''s history misses a row: %', v_h;
  end if;
  -- no other camper's rows, no check-in rows
  if exists (select 1 from jsonb_array_elements(v_h) x
              where x ->> 'action' in ('camp_check_in', 'camp_undo_check_in')
                 or (x ->> 'table_name' = 'camp_campers' and x -> 'after' ->> 'first_name' in ('Ben', 'Cy'))
                 or (x ->> 'table_name' not in ('camp_signups', 'camp_campers', 'camp_camper_days', 'camp_camper_extras', 'camp_payments'))) then
    raise exception 'TEST FAILED: H1 Ann''s history has a check-in, a sibling''s or another table''s row: %', v_h;
  end if;
  -- newest first; every row has exactly the agreed keys
  if exists (select 1 from jsonb_array_elements(v_h) with ordinality as x(r, n)
                      join jsonb_array_elements(v_h) with ordinality as y(r, n) on y.n = x.n + 1
              where (x.r ->> 'occurred_at')::timestamptz < (y.r ->> 'occurred_at')::timestamptz)
     or exists (select 1 from jsonb_array_elements(v_h) x
                 where (select array_agg(k order by k collate "C") from jsonb_object_keys(x) as k)
                       is distinct from array['action', 'actor_name', 'after', 'batch_id', 'before', 'occurred_at', 'op', 'table_name']) then
    raise exception 'TEST FAILED: H1 order or row keys: %', v_h;
  end if;
  -- no login ids: no *_by key holding an id, no login uuid anywhere, no
  -- actor_id / session_id; the signature only "on file"
  if exists (select 1 from jsonb_array_elements(v_h) x,
                           lateral (select k from jsonb_object_keys(coalesce(nullif(x -> 'before', 'null'::jsonb), '{}'::jsonb)
                                                                    || coalesce(nullif(x -> 'after', 'null'::jsonb), '{}'::jsonb)) as k) as kk
              where kk.k in ('created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'checked_in_by', 'actor_id', 'session_id',
                             'submission_id', 'waiver_text_signed'))
     or position(v_admin::text in v_h::text) > 0 or position(v_desk::text in v_h::text) > 0
     or position(v_d1::text in v_h::text) > 0 or position(v_a1::text in v_h::text) > 0
     or position('data:image' in v_h::text) > 0
     or not exists (select 1 from jsonb_array_elements(v_h) x where x -> 'after' ->> 'signature' = 'on file') then
    raise exception 'TEST FAILED: H1 a login id or the signature in the history: %', v_h;
  end if;
  -- Ben: the family's rows (both), none of Ann's or Cy's own
  v_h := pg_temp.hist(v_ben);
  if not exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_signups' and x ->> 'op' = 'update'
                    and x -> 'after' ->> 'parent_name' = 'Pat Newname')
     or exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_payments')
     or exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_campers'
                   and x -> 'after' ->> 'first_name' in ('Ann', 'Cy'))
     or (select count(*) from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'camp_camper_days') <> 3 then
    raise exception 'TEST FAILED: H1 Ben''s history: %', v_h;
  end if;
  -- at most 500 rows, newest first (600 extra rows planted for Cy)
  perform set_config('request.jwt.claims', '', true);
  select max(l.id) into v_mark from public.change_log l;
  insert into public.change_log (actor_name, action, table_name, record_id, op, before, after)
  select 'zz 0033 test', 'zz_0033_fill', 'camp_campers', v_cy, 'update', '{"age": 8}'::jsonb, jsonb_build_object('age', 9, 'n', g)
    from generate_series(1, 600) as g;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_h := pg_temp.hist(v_cy);
  if jsonb_array_length(v_h) <> 500 or (v_h -> 0 -> 'after' ->> 'n')::integer <> 600 then
    raise exception 'TEST FAILED: H1 limit 500 newest first: % rows, first %', jsonb_array_length(v_h), v_h -> 0;
  end if;
  -- refusals
  perform pg_temp.st('H1 not_found', public.camp_camper_history(gen_random_uuid()), 'not_found');
  perform pg_temp.st('H1 invalid', public.camp_camper_history(null), 'invalid');
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('H1 no session', public.camp_camper_history(v_ann), 'no_access');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('H1 admin', public.camp_camper_history(v_ann), 'ok');

  -- ===================================================================
  -- G1. Rights
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'camp_mark_paid') <> 1
     or to_regprocedure('public.camp_mark_paid(uuid, integer, text, text)') is null
     or to_regprocedure('public.camp_mark_paid(uuid, integer, text)') is not null then
    raise exception 'TEST FAILED: G1 there must be exactly one camp_mark_paid (uuid, integer, text, text)';
  end if;
  for v_fname in select unnest(array['camp_mark_paid(uuid, integer, text, text)', 'camp_undo_payment(uuid)',
                                     'camp_edit_payment(uuid, text, integer, date, text)', 'camp_camper_history(uuid)']) loop
    select p.oid, p.prosecdef, p.proconfig, p.proacl into v_fn
      from pg_proc p where p.oid = to_regprocedure('public.' || v_fname);
    if v_fn.oid is null then raise exception 'TEST FAILED: G1 % is missing', v_fname; end if;
    if v_fn.proconfig is distinct from array['search_path=""'] or v_fn.prosecdef is not true then
      raise exception 'TEST FAILED: G1 % settings % / security definer %', v_fname, v_fn.proconfig, v_fn.prosecdef;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 0)
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 'service_role'::regrole)
       or has_function_privilege('camps_registrar', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: G1 % can be run by anon, PUBLIC, service_role or camps_registrar', v_fname;
    end if;
    if not has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: G1 authenticated can''t run %', v_fname;
    end if;
  end loop;
  for v_fname in select unnest(array['camp_history_strip(jsonb)', 'camp_campers_keep_form_choice()']) loop
    select p.oid, p.prosecdef, p.proconfig, p.proacl into v_fn
      from pg_proc p where p.oid = to_regprocedure('public.' || v_fname);
    if v_fn.oid is null then raise exception 'TEST FAILED: G1 % is missing', v_fname; end if;
    if v_fn.proconfig is distinct from array['search_path=""'] or v_fn.prosecdef then
      raise exception 'TEST FAILED: G1 % settings % / security definer %', v_fname, v_fn.proconfig, v_fn.prosecdef;
    end if;
    if exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a
                where a.grantee <> 'postgres'::regrole) then
      raise exception 'TEST FAILED: G1 someone besides postgres may run %', v_fname;
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.camp_campers', 'paying_by_on_form', 'SELECT')
     or has_column_privilege('anon', 'public.camp_campers', 'paying_by_on_form', 'SELECT')
     or has_column_privilege('authenticated', 'public.camp_payments', 'paying_by_before', 'SELECT')
     or has_column_privilege('anon', 'public.camp_payments', 'paying_by_before', 'SELECT')
     or has_column_privilege('camps_registrar', 'public.camp_payments', 'paying_by_before', 'SELECT')
     or has_column_privilege('authenticated', 'public.camp_campers', 'paying_by_on_form', 'UPDATE')
     or has_table_privilege('anon', 'public.camp_roster', 'SELECT')
     or not has_table_privilege('authenticated', 'public.camp_roster', 'SELECT')
     or has_table_privilege('authenticated', 'public.camp_roster', 'INSERT') then
    raise exception 'TEST FAILED: G1 column or roster rights';
  end if;
  if not exists (select 1 from pg_class c where c.oid = 'public.camp_roster'::regclass
                  and 'security_invoker=true' = any (c.reloptions)) then
    raise exception 'TEST FAILED: G1 camp_roster lost security_invoker = true';
  end if;
  -- the new column rules
  if not exists (select 1 from pg_constraint c where c.conname = 'camp_campers_paying_by_on_form_check')
     or not exists (select 1 from pg_constraint c where c.conname = 'camp_payments_paying_by_before_check') then
    raise exception 'TEST FAILED: G1 a column rule is missing';
  end if;
  begin
    perform set_config('tkd.action', 'zz_0033', true);
    insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name, paying_by_before)
    values (v_kit, 'payment', 100, 'card', public.testing_today(), 'worcester', 'zz', 'card');
    raise exception 'TEST FAILED: G1 a payment whose paying_by_before is its own method was accepted';
  exception
    when check_violation then null;
  end;
  perform set_config('tkd.action', '', true);
end;
$$;

select 'ALL 0033 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
