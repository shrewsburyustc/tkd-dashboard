-- =====================================================================
-- 0039_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0039_camps_record_refund.sql
--   (rulebook v1.039 / v1.040 / v0.743: Camps Record refund; contract
--   docs/Camps/CONTRACT-0039.md). It checks, in this order:
--     A1  no session, a signed-in user who isn't staff, and a PIN-locked
--         desk session -> no_access from camp_record_refund and
--         camp_undo_refund; nothing written
--     R1  an admin refunds part of what a camper overpaid -> ok
--         (payment_id, version and nothing else); the row: kind 'refund',
--         minus the amount, the way, the date, the school SENT (This
--         device - here not the payment's school), the admin's name; the
--         camper's version +1; exactly two history rows (the refund, the
--         version) in one batch tagged camp_record_refund, by the admin;
--         the roster: refunded_cents, paid_cents, owes_cents, and the
--         last payment unchanged
--     R2  every refusal, none writing anything: the desk (not_allowed);
--         bad input - no camper / version / way / amount / date, a card
--         refund, a made-up way, 0 or minus cents, over $10,000, a date
--         after today (invalid); no school or an unknown one
--         (invalid / school); an unknown camper (not_found); an old
--         version (stale); a date before the sign-up (invalid / date);
--         1 cent more than the overpaid amount, a camper who owes and one
--         paid exactly (refund_too_large with overpaid_cents); a withdrawn
--         camper (withdrawn)
--     R3  a second refund while still overpaid -> ok; then nothing is
--         overpaid -> refund_too_large with 0
--     R4  a refund over $2,000: the limit is 0022's $10,000, so $2,000.01
--         is accepted when that much is overpaid (1 cent more ->
--         refund_too_large)
--     N1  while a refund stands, Undo payment and Edit payment answer
--         refund_stands - an admin's, and the desk's own toast Undo
--         within 10 seconds - and write nothing (0033's own answers still
--         come first: a refund's id is stale / invalid there); so the net
--         paid stays at least the total, and no camper anywhere has a net
--         below 0
--     U1  Undo refund: the desk -> not_allowed; no id, a payment's or a
--         reversal's id -> invalid; an unknown id -> not_found; an admin
--         -> ok: a reversal of plus the refund, its way, dated today, at
--         the REFUND'S school, the version +1, exactly two history rows in
--         one batch tagged camp_undo_refund; the same refund again ->
--         stale; a withdrawn camper's refund -> withdrawn
--     P1  once no refund stands, Edit payment and Undo payment work again
--     G1  the table: a reversal of a reversal, a POSITIVE reversal of a
--         payment, and a reversal of a refund for the wrong amount, at
--         another school or of another camper -> refused
--         (camp_payments_reversal_check); a refund that points at a row, a
--         positive refund, a card refund, a refund over $10,000 and a
--         payment over $10,000 -> refused (camp_payments_kind_check); a
--         reversal of a payment while a refund stands and a refund of more
--         than the camper's net - both would bring the net below 0 ->
--         refused (camp_payments_net_check, Star's rule); a refund row
--         can't be changed or removed
--     D1  Camper detail lists a refund (and a refund's reversal) with its
--         kind and school, and its camper part has refunded_cents; a
--         camper with no refund has refunded_cents 0 (never empty)
--     H1  camp_camper_history shows the refund and its Undo (tagged
--         camp_record_refund / camp_undo_refund, by the admin's name),
--         with no login ids
--     G2  rights: camp_record_refund, camp_undo_refund, camp_undo_payment,
--         camp_edit_payment - one version each, security definer,
--         search_path = '', run by authenticated only (not anon, PUBLIC,
--         service_role or camps_registrar); camp_payments_guard internal
--         (nobody may run it); the roster: security_invoker, read by
--         authenticated only, 0033's columns then refunded_cents
--         (integer) last; the kind rule as 0039 set it (refunds cash or
--         check only); the guard holds the net rule
--   It makes its own camp called "zz test 1a2b3c4d ...", so it works
--   whatever is already in the database, and on any weekday.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test camp, sign-ups, payments,
--   refunds, history rows, test sessions). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0043_tests.sql: a pretend login token per session in
--   request.jwt.claims. A1 = admin unlocked, D1 = desk unlocked, L1 = the
--   desk PIN-locked. The family form's function is called as the SQL
--   Editor's own role with no token (it runs as its owner, so the answers
--   are the same as for camps_registrar).
--
-- BEFORE YOU RUN IT
--   1. 0013, 0022, 0027, 0033, 0043 and 0039 are applied. You need TWO
--      existing, ACTIVE staff rows: an admin and the shared front desk
--      (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Everything is rolled back.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0039 TESTS PASSED".
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
  v_l1 uuid := gen_random_uuid();
  v_amr jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60));
  v_c_a1 text;
  v_c_d1 text;
  v_c_x  text;   -- a signed-in user who is not staff
  v_c_l1 text;   -- the desk, signed in but PIN-locked (no session_unlock row)

  v_admin_name text;
  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  -- a Monday 15-21 days from now: the test camp is Mon-Wed of that week
  v_mon   date := date_trunc('week', (public.testing_today() + 14)::timestamp)::date + 7;
  v_camp  uuid;

  v_r     jsonb;
  v_x     jsonb;
  v_h     jsonb;
  v_n     bigint;
  v_n2    bigint;
  v_mark  bigint;
  v_v     integer;
  v_txt   text;
  v_batch uuid;
  v_fn    record;
  v_fname text;
  v_cols  text[];
  -- campers, each on a sign-up of their own (member, all 3 days, $195,
  -- Paying by cash)
  v_ada uuid; v_ben uuid; v_cal uuid; v_dee uuid; v_eli uuid; v_gus uuid; v_hal uuid;
  -- payments and refunds
  v_pay    uuid;   -- Ada's standing $250 payment (Mark paid $195, then edited up)
  v_pay_e  uuid;   -- Eli's standing $250 payment
  v_ref_a1 uuid;   -- Ada's first refund ($20 cash, at Shrewsbury)
  v_ref_a2 uuid;   -- Ada's second refund ($35 check, at Worcester)
  v_ref_d  uuid;   -- Dee's refund (then Dee is withdrawn)
  v_ref_e  uuid;   -- Eli's refund ($15 cash, at Worcester)
  v_rev_a1 uuid;   -- the reversal of Ada's first refund
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  select s.full_name into v_admin_name from public.staff s where s.id = v_admin and s.active and s.role = 'admin';
  if v_admin_name is null then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  if not exists (select 1 from public.staff s where s.id = v_desk and s.active and s.role = 'staff') then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regprocedure('public.camp_record_refund(uuid, integer, text, integer, date, text)') is null
     or to_regprocedure('public.camp_undo_refund(uuid)') is null then
    raise exception 'TEST SETUP: camp_record_refund / camp_undo_refund are missing (is 0039 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  begin
    insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_d1, v_desk), (v_l1, v_desk);
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr)::text;
  v_c_x  := jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'session_id', gen_random_uuid(), 'amr', v_amr)::text;
  v_c_l1 := jsonb_build_object('sub', v_desk, 'role', 'authenticated', 'session_id', v_l1, 'amr', v_amr)::text;
  perform set_config('request.jwt.claims', v_c_l1, true);
  if public.has_data_access() is not false then raise exception 'TEST SETUP: the PIN-locked desk session has data access'; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true then raise exception 'TEST SETUP: the admin session has no data access'; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.has_data_access() is not true then raise exception 'TEST SETUP: the desk session has no data access'; end if;
  perform set_config('request.jwt.claims', v_c_x, true);
  if public.has_data_access() is not false then raise exception 'TEST SETUP: the non-staff token has data access'; end if;

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   su(camp, name)       one family sign-up of this child (member, all 3
  --                        days, no extras, Paying by cash); the camper id
  --   op(camper)           an admin's Mark paid ($195 at Worcester), then
  --                        Edit payment up to $250 cash: the camper is $55
  --                        overpaid; the standing $250 payment's id
  --   cv(camper)  its version;   pay(id)  a payment row as jsonb
  --   ro(camper)  its camp_roster row as jsonb
  --   st(label, answer, status)    fails unless answer.status = status
  --   eq(label, answer, expected)  fails unless the answer is exactly that
  --   nothing(label, log, pays)    fails if change_log or camp_payments has
  --                                more rows than the counts given
  --   refused(label, sql, rule)    runs sql; fails unless the table
  --                                refuses it with that rule's name
  execute $f$
    create function pg_temp.su(p_camp uuid, p_name text) returns uuid language plpgsql as $b$
    declare
      v_children jsonb;
      v_r        jsonb;
      v_total    integer := 0;
      v_try      integer;
    begin
      v_children := jsonb_build_array(jsonb_build_object('first_name', p_name, 'last_name', 'Refundtest', 'age', 8, 'member', true,
                      'day_ids', (select jsonb_agg(d.id order by d.day) from public.camp_days d where d.camp_id = p_camp),
                      'extras', '[]'::jsonb));
      -- the first try sends 0 cents; the form answers price_changed with
      -- the right total, which the second try sends
      for v_try in 1 .. 2 loop
        select public.camp_public_signup(c.public_code, 'zz-0039-' || gen_random_uuid()::text, gen_random_uuid(), v_children,
                 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
                 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                 'camp-2026-10-18', md5(c.waiver_text), v_total)
          into v_r
          from public.camps c where c.id = p_camp;
        exit when v_r ->> 'status' = 'ok';
        if v_r ->> 'status' is distinct from 'price_changed' then
          raise exception 'TEST SETUP: sign-up of % answered %', p_name, v_r;
        end if;
        v_total := (v_r ->> 'new_total_cents')::integer;
      end loop;
      if v_r ->> 'status' is distinct from 'ok' then
        raise exception 'TEST SETUP: sign-up of % answered %', p_name, v_r;
      end if;
      return (select c.id from public.camp_campers c join public.camp_signups s on s.id = c.signup_id
               where s.reference = v_r ->> 'reference');
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.op(p_camper uuid) returns uuid language plpgsql as $b$
    declare
      v_r jsonb;
    begin
      v_r := public.camp_mark_paid(p_camper, (select c.version from public.camp_campers c where c.id = p_camper), 'worcester');
      if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'amount_cents')::integer <> 19500 then
        raise exception 'TEST SETUP: Mark paid answered %', v_r;
      end if;
      v_r := public.camp_edit_payment((v_r ->> 'payment_id')::uuid, 'cash', 25000, public.testing_today(), 'worcester');
      if v_r ->> 'status' is distinct from 'ok' then
        raise exception 'TEST SETUP: Edit payment answered %', v_r;
      end if;
      return (v_r ->> 'payment_id')::uuid;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.cv(p_camper uuid) returns integer language sql as $b$
      select c.version from public.camp_campers c where c.id = p_camper;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.pay(p_id uuid) returns jsonb language sql as $b$
      select to_jsonb(p) from public.camp_payments p where p.id = p_id;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ro(p_camper uuid) returns jsonb language sql as $b$
      select to_jsonb(r) - array['days', 'extras'] from public.camp_roster r where r.id = p_camper;
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
    create function pg_temp.eq(p_label text, p_got jsonb, p_want jsonb) returns void language plpgsql as $b$
    begin
      if p_got is distinct from p_want then
        raise exception 'TEST FAILED: % expected %, got %', p_label, p_want, p_got;
      end if;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.nothing(p_label text, p_log bigint, p_pays bigint) returns void language plpgsql as $b$
    begin
      if (select count(*) from public.change_log) <> p_log or (select count(*) from public.camp_payments) <> p_pays then
        raise exception 'TEST FAILED: % wrote something', p_label;
      end if;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.refused(p_label text, p_sql text, p_rule text) returns void language plpgsql as $b$
    declare
      v_rule text;
    begin
      begin
        execute p_sql;
      exception
        when check_violation then
          get stacked diagnostics v_rule = constraint_name;
          if v_rule is distinct from p_rule then
            raise exception 'TEST FAILED: % was refused by % (expected %)', p_label, v_rule, p_rule;
          end if;
          return;
      end;
      raise exception 'TEST FAILED: % was let through', p_label;
    end;
    $b$;
  $f$;

  -- The test camp (admin): Mon-Wed, no extras; 3 days member early = $195
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.camp_add_camp('worcester', false, v_tag, array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12,
           '[{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000, "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000},
             {"day_count": 2, "member_early_cents": 14000, "member_regular_cents": 15000, "nonmember_early_cents": 15000, "nonmember_regular_cents": 16000},
             {"day_count": 3, "member_early_cents": 19500, "member_regular_cents": 21000, "nonmember_early_cents": 20500, "nonmember_regular_cents": 22000}]'::jsonb,
           '[]'::jsonb, null, 'I agree to the camp rules.');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: camp_add_camp answered %', v_r; end if;
  v_camp := (v_r ->> 'id')::uuid;

  -- the family form (no login)
  perform set_config('request.jwt.claims', '', true);
  v_ada := pg_temp.su(v_camp, 'Ada');
  v_ben := pg_temp.su(v_camp, 'Ben');
  v_cal := pg_temp.su(v_camp, 'Cal');
  v_dee := pg_temp.su(v_camp, 'Dee');
  v_eli := pg_temp.su(v_camp, 'Eli');
  v_gus := pg_temp.su(v_camp, 'Gus');
  v_hal := pg_temp.su(v_camp, 'Hal');
  if v_ada is null or v_hal is null then raise exception 'TEST SETUP: the sign-ups made no campers'; end if;

  -- the admin: Ada, Dee, Eli and Gus pay $250 for $195 ($55 overpaid);
  -- Cal pays exactly $195; Ben pays nothing
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_pay   := pg_temp.op(v_ada);
  perform pg_temp.op(v_dee);
  v_pay_e := pg_temp.op(v_eli);
  perform pg_temp.op(v_gus);
  perform pg_temp.st('setup Cal paid exactly', public.camp_mark_paid(v_cal, pg_temp.cv(v_cal), 'worcester'), 'ok');
  -- Hal: $2,195.01 for $195 ($2,000.01 overpaid)
  v_r := pg_temp.st('setup Hal paid', public.camp_mark_paid(v_hal, pg_temp.cv(v_hal), 'worcester'), 'ok');
  perform pg_temp.st('setup Hal''s payment edited up to $2,195.01',
    public.camp_edit_payment((v_r ->> 'payment_id')::uuid, 'cash', 219501, v_today, 'worcester'), 'ok');
  if (pg_temp.ro(v_ada) ->> 'owes_cents')::integer <> -5500 or (pg_temp.ro(v_cal) ->> 'owes_cents')::integer <> 0
     or (pg_temp.ro(v_ben) ->> 'owes_cents')::integer <> 19500 or (pg_temp.ro(v_ada) ->> 'refunded_cents')::integer <> 0 then
    raise exception 'TEST SETUP: owes Ada %, Cal %, Ben % (want -5500, 0, 19500)',
      pg_temp.ro(v_ada) ->> 'owes_cents', pg_temp.ro(v_cal) ->> 'owes_cents', pg_temp.ro(v_ben) ->> 'owes_cents';
  end if;
  -- Dee: $10 refunded, then withdrawn (for the "withdrawn" refusals)
  v_r := pg_temp.st('setup Dee refunded $10', public.camp_record_refund(v_dee, pg_temp.cv(v_dee), 'cash', 1000, v_today, 'worcester'), 'ok');
  v_ref_d := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.st('setup Dee withdrawn', public.camp_withdraw_camper(v_dee, pg_temp.cv(v_dee)), 'ok');

  -- ===================================================================
  -- A1. no_access
  -- ===================================================================
  select count(*) into v_n from public.change_log;
  select count(*) into v_n2 from public.camp_payments;
  foreach v_txt in array array['', v_c_x, v_c_l1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    perform pg_temp.eq('A1 camp_record_refund without staff access',
      public.camp_record_refund(v_ada, pg_temp.cv(v_ada), 'cash', 100, v_today, 'worcester'), '{"status": "no_access"}');
    perform pg_temp.eq('A1 camp_undo_refund without staff access', public.camp_undo_refund(v_ref_d), '{"status": "no_access"}');
  end loop;
  perform pg_temp.nothing('A1 a call without staff access', v_n, v_n2);

  -- ===================================================================
  -- R1. An admin refunds $20 of Ada's $55, cash, at Shrewsbury (This
  --     device), although her payment was taken at Worcester
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_v := pg_temp.cv(v_ada);
  select max(l.id) into v_mark from public.change_log l;
  v_r := pg_temp.st('R1 admin refunds Ada $20 cash at Shrewsbury',
           public.camp_record_refund(v_ada, v_v, 'cash', 2000, v_today, 'shrewsbury'), 'ok');
  v_ref_a1 := (v_r ->> 'payment_id')::uuid;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['payment_id', 'status', 'version']
     or (v_r ->> 'version')::integer <> v_v + 1 or pg_temp.cv(v_ada) <> v_v + 1 then
    raise exception 'TEST FAILED: R1 answer % (version before: %)', v_r, v_v;
  end if;
  v_x := pg_temp.pay(v_ref_a1);
  if v_x ->> 'kind' <> 'refund' or (v_x ->> 'amount_cents')::integer <> -2000 or v_x ->> 'method' <> 'cash'
     or (v_x ->> 'paid_on')::date <> v_today or v_x ->> 'school' <> 'shrewsbury' or v_x ->> 'camper_id' <> v_ada::text
     or v_x ->> 'recorded_by_name' is distinct from v_admin_name or (v_x ->> 'recorded_by')::uuid is distinct from v_admin
     or v_x -> 'reverses_payment_id' <> 'null'::jsonb or v_x -> 'paying_by_before' <> 'null'::jsonb then
    raise exception 'TEST FAILED: R1 the refund row: %', v_x;
  end if;
  select l.batch_id into v_batch from public.change_log l
   where l.table_name = 'camp_payments' and l.record_id = v_ref_a1 and l.op = 'insert';
  if v_batch is null
     or (select count(*) from public.change_log l where l.id > v_mark) <> 2
     or exists (select 1 from public.change_log l
                 where l.id > v_mark
                   and (l.batch_id is distinct from v_batch or l.action <> 'camp_record_refund'
                        or l.actor_name is distinct from v_admin_name or l.actor_id is distinct from v_admin))
     or not exists (select 1 from public.change_log l
                     where l.id > v_mark and l.table_name = 'camp_campers' and l.record_id = v_ada and l.op = 'update'
                       and (l.after ->> 'version')::integer = v_v + 1) then
    raise exception 'TEST FAILED: R1 the history: %',
      (select jsonb_agg(to_jsonb(l) - array['before', 'after']) from public.change_log l where l.id > v_mark);
  end if;
  if current_setting('tkd.action', true) <> '' or current_setting('tkd.batch_id', true) <> '' then
    raise exception 'TEST FAILED: R1 tkd.action / tkd.batch_id left set';
  end if;
  v_x := pg_temp.ro(v_ada);
  if (v_x ->> 'refunded_cents')::integer <> 2000 or (v_x ->> 'paid_cents')::integer <> 23000
     or (v_x ->> 'owes_cents')::integer <> -3500 or (v_x ->> 'total_cents')::integer <> 19500
     or (v_x ->> 'last_payment_id')::uuid <> v_pay or v_x ->> 'paid_method' <> 'cash' then
    raise exception 'TEST FAILED: R1 the roster row: %', v_x;
  end if;

  -- ===================================================================
  -- R2. Every refusal; none writes anything
  -- ===================================================================
  select count(*) into v_n from public.change_log;
  select count(*) into v_n2 from public.camp_payments;
  v_v := pg_temp.cv(v_ada);
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.eq('R2 the desk records a refund',
    public.camp_record_refund(v_ada, v_v, 'cash', 100, v_today, 'worcester'), '{"status": "not_allowed"}');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.eq('R2 no camper', public.camp_record_refund(null, v_v, 'cash', 100, v_today, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 no version', public.camp_record_refund(v_ada, null, 'cash', 100, v_today, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 no way', public.camp_record_refund(v_ada, v_v, null, 100, v_today, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 a card refund', public.camp_record_refund(v_ada, v_v, 'card', 100, v_today, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 a made-up way', public.camp_record_refund(v_ada, v_v, 'Cash', 100, v_today, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 no amount', public.camp_record_refund(v_ada, v_v, 'cash', null, v_today, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 0 cents', public.camp_record_refund(v_ada, v_v, 'cash', 0, v_today, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 minus 1 cent', public.camp_record_refund(v_ada, v_v, 'cash', -1, v_today, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 over $10,000', public.camp_record_refund(v_ada, v_v, 'cash', 1000001, v_today, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 no date', public.camp_record_refund(v_ada, v_v, 'cash', 100, null, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 tomorrow', public.camp_record_refund(v_ada, v_v, 'cash', 100, v_today + 1, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('R2 no school', public.camp_record_refund(v_ada, v_v, 'cash', 100, v_today, null),
    '{"status": "invalid", "field": "school"}');
  perform pg_temp.eq('R2 an unknown school', public.camp_record_refund(v_ada, v_v, 'cash', 100, v_today, 'nowhere'),
    '{"status": "invalid", "field": "school"}');
  perform pg_temp.eq('R2 an unknown camper', public.camp_record_refund(gen_random_uuid(), 1, 'cash', 100, v_today, 'worcester'),
    '{"status": "not_found"}');
  perform pg_temp.eq('R2 an old version', public.camp_record_refund(v_ada, v_v - 1, 'cash', 100, v_today, 'worcester'),
    '{"status": "stale"}');
  perform pg_temp.eq('R2 the day before the sign-up', public.camp_record_refund(v_ada, v_v, 'cash', 100, v_today - 1, 'worcester'),
    '{"status": "invalid", "field": "date"}');
  perform pg_temp.eq('R2 1 cent more than the $35 still overpaid', public.camp_record_refund(v_ada, v_v, 'cash', 3501, v_today, 'worcester'),
    '{"status": "refund_too_large", "overpaid_cents": 3500}');
  perform pg_temp.eq('R2 a camper who owes', public.camp_record_refund(v_ben, pg_temp.cv(v_ben), 'cash', 100, v_today, 'worcester'),
    '{"status": "refund_too_large", "overpaid_cents": 0}');
  perform pg_temp.eq('R2 a camper paid exactly', public.camp_record_refund(v_cal, pg_temp.cv(v_cal), 'check', 1, v_today, 'worcester'),
    '{"status": "refund_too_large", "overpaid_cents": 0}');
  perform pg_temp.eq('R2 a withdrawn camper', public.camp_record_refund(v_dee, pg_temp.cv(v_dee), 'cash', 100, v_today, 'worcester'),
    '{"status": "withdrawn"}');
  perform pg_temp.nothing('R2 a refused Record refund', v_n, v_n2);
  if pg_temp.cv(v_ada) <> v_v then raise exception 'TEST FAILED: R2 a refused Record refund moved Ada''s version'; end if;

  -- ===================================================================
  -- R3. A second refund while still overpaid; then nothing is overpaid
  -- ===================================================================
  v_r := pg_temp.st('R3 Ada''s second refund, $35 by check at Worcester',
           public.camp_record_refund(v_ada, v_v, 'check', 3500, v_today, 'worcester'), 'ok');
  v_ref_a2 := (v_r ->> 'payment_id')::uuid;
  v_x := pg_temp.ro(v_ada);
  if (v_x ->> 'refunded_cents')::integer <> 5500 or (v_x ->> 'paid_cents')::integer <> 19500 or (v_x ->> 'owes_cents')::integer <> 0
     or pg_temp.pay(v_ref_a2) ->> 'method' <> 'check' or pg_temp.pay(v_ref_a2) ->> 'school' <> 'worcester'
     or (pg_temp.pay(v_ref_a2) ->> 'amount_cents')::integer <> -3500 then
    raise exception 'TEST FAILED: R3 after the second refund: roster %, refund %', v_x, pg_temp.pay(v_ref_a2);
  end if;
  perform pg_temp.eq('R3 nothing overpaid any more', public.camp_record_refund(v_ada, pg_temp.cv(v_ada), 'cash', 1, v_today, 'worcester'),
    '{"status": "refund_too_large", "overpaid_cents": 0}');

  -- ===================================================================
  -- R4. A refund over $2,000: the limit is 0022's $10,000, so Hal's
  --     $2,000.01 is accepted when that much is overpaid
  -- ===================================================================
  perform pg_temp.eq('R4 1 cent more than Hal''s $2,000.01 overpaid',
    public.camp_record_refund(v_hal, pg_temp.cv(v_hal), 'check', 200002, v_today, 'worcester'),
    '{"status": "refund_too_large", "overpaid_cents": 200001}');
  v_r := pg_temp.st('R4 Hal refunded $2,000.01 by check',
           public.camp_record_refund(v_hal, pg_temp.cv(v_hal), 'check', 200001, v_today, 'worcester'), 'ok');
  if (pg_temp.pay((v_r ->> 'payment_id')::uuid) ->> 'amount_cents')::integer <> -200001
     or (pg_temp.ro(v_hal) ->> 'refunded_cents')::integer <> 200001 or (pg_temp.ro(v_hal) ->> 'owes_cents')::integer <> 0 then
    raise exception 'TEST FAILED: R4 Hal''s refund %, roster %', pg_temp.pay((v_r ->> 'payment_id')::uuid), pg_temp.ro(v_hal);
  end if;

  -- ===================================================================
  -- N1. While a refund stands: no Undo / Edit payment; the net stays
  -- ===================================================================
  select count(*) into v_n from public.change_log;
  select count(*) into v_n2 from public.camp_payments;
  v_v := pg_temp.cv(v_ada);
  perform pg_temp.eq('N1 Undo payment while a refund stands', public.camp_undo_payment(v_pay), '{"status": "refund_stands"}');
  perform pg_temp.eq('N1 Edit payment down to 1 cent while a refund stands',
    public.camp_edit_payment(v_pay, 'cash', 1, v_today, 'worcester'), '{"status": "refund_stands"}');
  perform pg_temp.eq('N1 Edit payment to another way while a refund stands',
    public.camp_edit_payment(v_pay, 'card', 25000, v_today, 'worcester'), '{"status": "refund_stands"}');
  -- 0033's own answers come first: a refund is not a payment
  perform pg_temp.eq('N1 Undo payment of a refund (0033: stale)', public.camp_undo_payment(v_ref_a2), '{"status": "stale"}');
  perform pg_temp.eq('N1 Edit payment of a refund (0033: invalid)',
    public.camp_edit_payment(v_ref_a2, 'cash', 100, v_today, 'worcester'), '{"status": "invalid"}');
  perform pg_temp.eq('N1 Undo payment of an unknown id (0033: not_found)', public.camp_undo_payment(gen_random_uuid()),
    '{"status": "not_found"}');
  perform pg_temp.nothing('N1 a refused Undo / Edit payment', v_n, v_n2);
  if pg_temp.cv(v_ada) <> v_v or exists (select 1 from public.camp_payments x where x.reverses_payment_id = v_pay) then
    raise exception 'TEST FAILED: N1 a refused Undo / Edit payment touched Ada';
  end if;
  -- the desk's own toast Undo too: Gus gets his $55 back, then his total
  -- goes up $10 (his base price written directly, as only a test can), the
  -- desk takes the $10 and presses Undo within 10 seconds
  v_r := pg_temp.st('N1 Gus refunded $55', public.camp_record_refund(v_gus, pg_temp.cv(v_gus), 'cash', 5500, v_today, 'worcester'), 'ok');
  perform set_config('request.jwt.claims', '', true);
  update public.camp_campers c set base_cents = c.base_cents + 1000 where c.id = v_gus;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := pg_temp.st('N1 the desk takes Gus''s $10', public.camp_mark_paid(v_gus, pg_temp.cv(v_gus), 'worcester'), 'ok');
  if (v_r ->> 'amount_cents')::integer <> 1000 then raise exception 'TEST FAILED: N1 Gus''s Mark paid answered %', v_r; end if;
  select count(*) into v_n from public.change_log;
  select count(*) into v_n2 from public.camp_payments;
  perform pg_temp.eq('N1 the desk''s own toast Undo while a refund stands', public.camp_undo_payment((v_r ->> 'payment_id')::uuid),
    '{"status": "refund_stands"}');
  perform pg_temp.nothing('N1 the refused toast Undo', v_n, v_n2);
  -- the net never below the total while a refund stands - and nowhere below 0
  if (pg_temp.ro(v_ada) ->> 'paid_cents')::integer <> (pg_temp.ro(v_ada) ->> 'total_cents')::integer
     or (pg_temp.ro(v_gus) ->> 'paid_cents')::integer <> (pg_temp.ro(v_gus) ->> 'total_cents')::integer
     or exists (select 1 from public.camp_payments p group by p.camper_id having sum(p.amount_cents) < 0) then
    raise exception 'TEST FAILED: N1 a net paid below the total while a refund stands, or below 0 somewhere';
  end if;

  -- ===================================================================
  -- U1. Undo refund
  -- ===================================================================
  select count(*) into v_n from public.change_log;
  select count(*) into v_n2 from public.camp_payments;
  perform pg_temp.eq('U1 the desk undoes a refund', public.camp_undo_refund(v_ref_a1), '{"status": "not_allowed"}');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.eq('U1 no id', public.camp_undo_refund(null), '{"status": "invalid"}');
  perform pg_temp.eq('U1 an unknown id', public.camp_undo_refund(gen_random_uuid()), '{"status": "not_found"}');
  perform pg_temp.eq('U1 a payment''s id', public.camp_undo_refund(v_pay), '{"status": "invalid"}');
  perform pg_temp.eq('U1 a reversal''s id', public.camp_undo_refund(
    (select x.id from public.camp_payments x where x.camper_id = v_ada and x.kind = 'reversal' order by x.recorded_at, x.id limit 1)),
    '{"status": "invalid"}');
  perform pg_temp.eq('U1 a withdrawn camper''s refund', public.camp_undo_refund(v_ref_d), '{"status": "withdrawn"}');
  perform pg_temp.nothing('U1 a refused Undo refund', v_n, v_n2);
  -- the admin undoes Ada's first refund ($20 cash at Shrewsbury)
  v_v := pg_temp.cv(v_ada);
  select max(l.id) into v_mark from public.change_log l;
  v_r := pg_temp.st('U1 admin undoes Ada''s first refund', public.camp_undo_refund(v_ref_a1), 'ok');
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['status', 'version']
     or (v_r ->> 'version')::integer <> v_v + 1 or pg_temp.cv(v_ada) <> v_v + 1 then
    raise exception 'TEST FAILED: U1 answer % (version before: %)', v_r, v_v;
  end if;
  select to_jsonb(p) into v_x from public.camp_payments p where p.reverses_payment_id = v_ref_a1;
  v_rev_a1 := (v_x ->> 'id')::uuid;
  if v_x is null or v_x ->> 'kind' <> 'reversal' or (v_x ->> 'amount_cents')::integer <> 2000 or v_x ->> 'method' <> 'cash'
     or (v_x ->> 'paid_on')::date <> v_today or v_x ->> 'school' <> 'shrewsbury' or v_x ->> 'camper_id' <> v_ada::text
     or v_x ->> 'recorded_by_name' is distinct from v_admin_name or v_x -> 'paying_by_before' <> 'null'::jsonb then
    raise exception 'TEST FAILED: U1 the reversal row (must be +$20 cash at Shrewsbury, today): %', v_x;
  end if;
  select l.batch_id into v_batch from public.change_log l
   where l.table_name = 'camp_payments' and l.record_id = v_rev_a1 and l.op = 'insert';
  if v_batch is null
     or (select count(*) from public.change_log l where l.id > v_mark) <> 2
     or exists (select 1 from public.change_log l
                 where l.id > v_mark
                   and (l.batch_id is distinct from v_batch or l.action <> 'camp_undo_refund'
                        or l.actor_name is distinct from v_admin_name)) then
    raise exception 'TEST FAILED: U1 the history: %',
      (select jsonb_agg(to_jsonb(l) - array['before', 'after']) from public.change_log l where l.id > v_mark);
  end if;
  if current_setting('tkd.action', true) <> '' or current_setting('tkd.batch_id', true) <> '' then
    raise exception 'TEST FAILED: U1 tkd.action / tkd.batch_id left set';
  end if;
  v_x := pg_temp.ro(v_ada);
  if (v_x ->> 'refunded_cents')::integer <> 3500 or (v_x ->> 'paid_cents')::integer <> 21500 or (v_x ->> 'owes_cents')::integer <> -2000 then
    raise exception 'TEST FAILED: U1 the roster after the first Undo refund: %', v_x;
  end if;
  perform pg_temp.eq('U1 the same refund again', public.camp_undo_refund(v_ref_a1), '{"status": "stale"}');
  -- the second refund still stands: Undo payment still refused
  perform pg_temp.eq('U1 Undo payment while the second refund stands', public.camp_undo_payment(v_pay), '{"status": "refund_stands"}');
  perform pg_temp.st('U1 admin undoes Ada''s second refund', public.camp_undo_refund(v_ref_a2), 'ok');
  v_x := pg_temp.ro(v_ada);
  if (v_x ->> 'refunded_cents')::integer <> 0 or (v_x ->> 'paid_cents')::integer <> 25000 or (v_x ->> 'owes_cents')::integer <> -5500
     or (select p.school from public.camp_payments p where p.reverses_payment_id = v_ref_a2) <> 'worcester' then
    raise exception 'TEST FAILED: U1 the roster after both Undo refunds: %', v_x;
  end if;

  -- ===================================================================
  -- P1. No refund stands: Edit payment and Undo payment work again
  -- ===================================================================
  v_r := pg_temp.st('P1 Edit payment works again ($250 -> $195)', public.camp_edit_payment(v_pay, 'cash', 19500, v_today, 'worcester'), 'ok');
  perform pg_temp.st('P1 Undo payment works again', public.camp_undo_payment((v_r ->> 'payment_id')::uuid), 'ok');
  if (pg_temp.ro(v_ada) ->> 'owes_cents')::integer <> 19500 or (pg_temp.ro(v_ada) ->> 'paid_cents')::integer <> 0 then
    raise exception 'TEST FAILED: P1 Ada after the edit and the undo: %', pg_temp.ro(v_ada);
  end if;

  -- ===================================================================
  -- G1. The table (direct writes, as only the SQL Editor can)
  -- ===================================================================
  -- Eli: a standing $15 cash refund at Worcester
  v_r := pg_temp.st('G1 Eli refunded $15', public.camp_record_refund(v_eli, pg_temp.cv(v_eli), 'cash', 1500, v_today, 'worcester'), 'ok');
  v_ref_e := (v_r ->> 'payment_id')::uuid;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.refused('G1 a reversal of a reversal',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name, reverses_payment_id)
            values (%L, ''reversal'', -2000, ''cash'', %L, ''shrewsbury'', ''zz 0039'', %L)', v_ada, v_today, v_rev_a1),
    'camp_payments_reversal_check');
  perform pg_temp.refused('G1 a reversal of a refund for the wrong amount',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name, reverses_payment_id)
            values (%L, ''reversal'', 1000, ''cash'', %L, ''worcester'', ''zz 0039'', %L)', v_eli, v_today, v_ref_e),
    'camp_payments_reversal_check');
  perform pg_temp.refused('G1 a reversal of a refund at another school',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name, reverses_payment_id)
            values (%L, ''reversal'', 1500, ''cash'', %L, ''shrewsbury'', ''zz 0039'', %L)', v_eli, v_today, v_ref_e),
    'camp_payments_reversal_check');
  perform pg_temp.refused('G1 a reversal of another camper''s refund',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name, reverses_payment_id)
            values (%L, ''reversal'', 1500, ''cash'', %L, ''worcester'', ''zz 0039'', %L)', v_ben, v_today, v_ref_e),
    'camp_payments_reversal_check');
  perform pg_temp.refused('G1 a POSITIVE reversal of a payment (+$250 undoing +$250)',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name, reverses_payment_id)
            values (%L, ''reversal'', 25000, ''cash'', %L, ''worcester'', ''zz 0039'', %L)', v_eli, v_today, v_pay_e),
    'camp_payments_reversal_check');
  perform pg_temp.refused('G1 a refund that points at a payment',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name, reverses_payment_id)
            values (%L, ''refund'', -100, ''cash'', %L, ''worcester'', ''zz 0039'', %L)', v_eli, v_today, v_pay_e),
    'camp_payments_kind_check');
  perform pg_temp.refused('G1 a positive refund',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
            values (%L, ''refund'', 100, ''cash'', %L, ''worcester'', ''zz 0039'')', v_eli, v_today),
    'camp_payments_kind_check');
  -- a refund over $10,000 is refused by the kind rule itself, even when
  -- the camper's rows add up to more (else the net rule, which the guard
  -- checks first, would refuse it): Ben gets two $10,000 payments,
  -- written directly
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
  values (v_ben, 'payment', 1000000, 'cash', v_today, 'worcester', 'zz 0039'),
         (v_ben, 'payment', 1000000, 'cash', v_today, 'worcester', 'zz 0039');
  perform pg_temp.refused('G1 a refund over $10,000 (Ben''s rows add up to $20,000)',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
            values (%L, ''refund'', -1000001, ''cash'', %L, ''worcester'', ''zz 0039'')', v_ben, v_today),
    'camp_payments_kind_check');
  perform pg_temp.refused('G1 a card refund',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
            values (%L, ''refund'', -100, ''card'', %L, ''worcester'', ''zz 0039'')', v_eli, v_today),
    'camp_payments_kind_check');
  -- Star's net rule: Eli's rows add up to $235 ($250 paid, $15 refunded)
  perform pg_temp.refused('G1 a reversal of Eli''s $250 payment while his $15 refund stands (net -$15)',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name, reverses_payment_id)
            values (%L, ''reversal'', -25000, ''cash'', %L, ''worcester'', ''zz 0039'', %L)', v_eli, v_today, v_pay_e),
    'camp_payments_net_check');
  perform pg_temp.refused('G1 a refund of 1 cent more than Eli''s $235 net',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
            values (%L, ''refund'', -23501, ''cash'', %L, ''worcester'', ''zz 0039'')', v_eli, v_today),
    'camp_payments_net_check');
  perform pg_temp.refused('G1 a payment over $10,000 (0022''s limit kept)',
    format('insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
            values (%L, ''payment'', 1000001, ''cash'', %L, ''worcester'', ''zz 0039'')', v_eli, v_today),
    'camp_payments_kind_check');
  -- a refund row is append-only too
  begin
    update public.camp_payments p set amount_cents = -1 where p.id = v_ref_e;
    raise exception 'TEST FAILED: G1 a refund row was changed';
  exception
    when raise_exception then
      if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    delete from public.camp_payments p where p.id = v_ref_e;
    raise exception 'TEST FAILED: G1 a refund row was removed';
  exception
    when raise_exception then
      if sqlerrm not like '%append-only%' then raise; end if;
  end;
  if pg_temp.pay(v_ref_e) ->> 'amount_cents' <> '-1500' then
    raise exception 'TEST FAILED: G1 Eli''s refund row moved: %', pg_temp.pay(v_ref_e);
  end if;

  -- ===================================================================
  -- D1. Camper detail and the roster
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := pg_temp.st('D1 Camper detail of Eli (the desk)', public.camp_camper_detail(v_eli), 'ok');
  if (v_r -> 'camper' ->> 'refunded_cents')::integer <> 1500
     or (v_r -> 'breakdown' ->> 'paid_cents')::integer <> 23500 or (v_r -> 'breakdown' ->> 'owes_cents')::integer <> -4000
     or not exists (select 1 from jsonb_array_elements(v_r -> 'payments') as x(e)
                     where x.e ->> 'id' = v_ref_e::text and x.e ->> 'kind' = 'refund' and (x.e ->> 'amount_cents')::integer = -1500
                       and x.e ->> 'method' = 'cash' and x.e ->> 'school' = 'worcester' and (x.e ->> 'paid_on')::date = v_today
                       and x.e -> 'reverses_payment_id' = 'null'::jsonb and x.e ->> 'recorded_by_name' = v_admin_name) then
    raise exception 'TEST FAILED: D1 Eli''s Camper detail: camper %, breakdown %, payments %',
      v_r -> 'camper' -> 'refunded_cents', v_r -> 'breakdown', v_r -> 'payments';
  end if;
  v_r := pg_temp.st('D1 Camper detail of Ada', public.camp_camper_detail(v_ada), 'ok');
  if (select count(*) from jsonb_array_elements(v_r -> 'payments') as x(e) where x.e ->> 'kind' = 'refund') <> 2
     or (select count(*) from jsonb_array_elements(v_r -> 'payments') as x(e)
          where x.e ->> 'kind' = 'reversal' and x.e ->> 'reverses_payment_id' in (v_ref_a1::text, v_ref_a2::text)
            and (x.e ->> 'amount_cents')::integer > 0) <> 2
     or (v_r -> 'camper' ->> 'refunded_cents')::integer <> 0 then
    raise exception 'TEST FAILED: D1 Ada''s Camper detail must list both refunds and their two reversals: %', v_r -> 'payments';
  end if;
  if pg_temp.ro(v_ben) -> 'refunded_cents' is distinct from '0'::jsonb or pg_temp.ro(v_cal) -> 'refunded_cents' is distinct from '0'::jsonb then
    raise exception 'TEST FAILED: D1 a camper with no refund must have refunded_cents 0';
  end if;

  -- ===================================================================
  -- H1. History
  -- ===================================================================
  v_r := pg_temp.st('H1 history of Ada', public.camp_camper_history(v_ada), 'ok');
  v_h := v_r -> 'rows';
  if not exists (select 1 from jsonb_array_elements(v_h) as x(e)
                  where x.e ->> 'table_name' = 'camp_payments' and x.e ->> 'op' = 'insert' and x.e ->> 'action' = 'camp_record_refund'
                    and x.e -> 'after' ->> 'kind' = 'refund' and (x.e -> 'after' ->> 'amount_cents')::integer = -2000
                    and x.e -> 'after' ->> 'school' = 'shrewsbury' and x.e ->> 'actor_name' = v_admin_name)
     or not exists (select 1 from jsonb_array_elements(v_h) as x(e)
                     where x.e ->> 'table_name' = 'camp_payments' and x.e ->> 'op' = 'insert' and x.e ->> 'action' = 'camp_undo_refund'
                       and x.e -> 'after' ->> 'kind' = 'reversal' and (x.e -> 'after' ->> 'amount_cents')::integer = 2000
                       and x.e -> 'after' ->> 'reverses_payment_id' = v_ref_a1::text)
     or not exists (select 1 from jsonb_array_elements(v_h) as x(e)
                     where x.e ->> 'table_name' = 'camp_campers' and x.e ->> 'op' = 'update' and x.e ->> 'action' = 'camp_record_refund') then
    raise exception 'TEST FAILED: H1 Ada''s history misses the refund or its Undo';
  end if;
  if position(v_admin::text in v_h::text) > 0 or position(v_desk::text in v_h::text) > 0
     or exists (select 1 from jsonb_array_elements(v_h) as x(e)
                 where x.e ? 'actor_id' or x.e ? 'session_id'
                    or coalesce(nullif(x.e -> 'after', 'null'::jsonb), '{}'::jsonb) ? 'recorded_by') then
    raise exception 'TEST FAILED: H1 the history holds a login id';
  end if;

  -- ===================================================================
  -- G2. Rights and rules
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  for v_fname in select unnest(array['camp_record_refund(uuid, integer, text, integer, date, text)', 'camp_undo_refund(uuid)',
                                     'camp_undo_payment(uuid)', 'camp_edit_payment(uuid, text, integer, date, text)']) loop
    select p.oid, p.prosecdef, p.proconfig, p.proacl into v_fn
      from pg_proc p where p.oid = to_regprocedure('public.' || v_fname);
    if v_fn.oid is null then raise exception 'TEST FAILED: G2 % is missing', v_fname; end if;
    if v_fn.proconfig is distinct from array['search_path=""'] or v_fn.prosecdef is not true then
      raise exception 'TEST FAILED: G2 % settings % / security definer %', v_fname, v_fn.proconfig, v_fn.prosecdef;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 0)
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 'service_role'::regrole)
       or has_function_privilege('camps_registrar', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: G2 % can be run by anon, PUBLIC, service_role or camps_registrar', v_fname;
    end if;
    if not has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: G2 authenticated can''t run %', v_fname;
    end if;
  end loop;
  -- one version each (no older one next to it that could be called instead)
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('camp_record_refund', 'camp_undo_refund', 'camp_undo_payment', 'camp_edit_payment')) <> 4 then
    raise exception 'TEST FAILED: G2 there must be exactly one camp_record_refund, camp_undo_refund, camp_undo_payment and camp_edit_payment';
  end if;
  -- the guard: internal (only its trigger runs it)
  select p.oid, p.prosecdef, p.proconfig, p.proacl into v_fn
    from pg_proc p where p.oid = to_regprocedure('public.camp_payments_guard()');
  if v_fn.oid is null or v_fn.prosecdef or v_fn.proconfig is distinct from array['search_path=""']
     or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee <> 'postgres'::regrole) then
    raise exception 'TEST FAILED: G2 camp_payments_guard must be internal (not definer, search_path = '''', only its owner)';
  end if;
  -- the roster: 0033's columns, then refunded_cents (integer) last
  v_cols := array(select a.attname::text from pg_attribute a
                   where a.attrelid = 'public.camp_roster'::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum);
  if v_cols is distinct from array['id', 'camp_id', 'signup_id', 'position', 'first_name', 'last_name', 'age', 'member',
       'paying_by', 'status', 'withdrawn_reason', 'withdrawn_at', 'withdrawn_by_name', 'duplicate_state', 'duplicate_of',
       'version', 'created_at', 'signup_version', 'reference', 'price_kind', 'signed_up_on', 'signed',
       'signature_deleted_at', 'base_cents', 'days', 'extras', 'total_cents', 'paid_cents', 'owes_cents', 'paid_on',
       'paid_method', 'last_payment_id', 'last_payment_recorded_at', 'paying_by_on_form', 'refunded_cents']
     or (select a.atttypid from pg_attribute a
          where a.attrelid = 'public.camp_roster'::regclass and a.attname = 'refunded_cents') <> 'integer'::regtype then
    raise exception 'TEST FAILED: G2 camp_roster columns %', v_cols;
  end if;
  if not exists (select 1 from pg_class c where c.oid = 'public.camp_roster'::regclass
                  and 'security_invoker=true' = any (c.reloptions))
     or has_table_privilege('anon', 'public.camp_roster', 'SELECT')
     or has_table_privilege('camps_registrar', 'public.camp_roster', 'SELECT')
     or not has_table_privilege('authenticated', 'public.camp_roster', 'SELECT')
     or has_table_privilege('authenticated', 'public.camp_roster', 'INSERT') then
    raise exception 'TEST FAILED: G2 camp_roster options or rights';
  end if;
  -- the kind rule as 0039 set it: three kinds, 0022's $10,000 for each,
  -- no $2,000 limit left anywhere
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid = 'public.camp_payments'::regclass and c.conname = 'camp_payments_kind_check';
  if v_txt is null or v_txt not like '%''payment''%' or v_txt not like '%''refund''%' or v_txt not like '%''reversal''%'
     or v_txt not like '%-1000000%' or v_txt not like '%<> 0%' or v_txt like '%200000%'
     or v_txt not like '%''cash''::text, ''check''::text%' then
    raise exception 'TEST FAILED: G2 the kind rule is %', v_txt;
  end if;
  -- the guard holds Star's net rule
  if position('camp_payments_net_check' in (select p.prosrc from pg_proc p
                                             where p.oid = to_regprocedure('public.camp_payments_guard()'))) = 0 then
    raise exception 'TEST FAILED: G2 camp_payments_guard has no net rule (camp_payments_net_check)';
  end if;
end;
$$;

select 'ALL 0039 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
