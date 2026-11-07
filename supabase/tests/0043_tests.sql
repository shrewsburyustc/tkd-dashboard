-- =====================================================================
-- 0043_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0043_camps_fill_in.sql (rulebook
--   v0.740 / v0.741: Camps Fill in - staff sign up a walk-in family at the
--   desk; contract docs/Camps/CONTRACT-0043.md). It checks, in this order:
--     A1  no session, and a signed-in user who isn't staff ->
--         no_access from camp_staff_form and camp_staff_signup; nothing
--         written
--     B1  camp_staff_form = camp_public_camp's answer for that camp PLUS
--         fill_in / signup_state / closes_on / closed_by_hand, for an open
--         camp, one not open yet, one past its closing date, one closed by
--         hand and one that is over; not_found
--     C1  the desk (role staff) on an OPEN camp -> ok: the family form's
--         answer (reference, total, children); the sign-up saved with
--         source 'desk' and entered_by = the staff member's name; the
--         history row is theirs (actor_name), tagged camp_staff_signup,
--         and holds source / entered_by; the campers are "created by"
--         them; NO camp_public_attempts row
--     C2  the same submission id again -> exactly the first answer, still
--         one sign-up
--     C3  the duplicate check still flags (a family-form camper, then the
--         same child at the desk -> "possible")
--     C4  bad input from the desk -> invalid, nothing written
--     S1  the desk on a camp NOT OPEN YET / PAST THE CLOSING DATE / CLOSED
--         BY HAND -> {"status":"admin_only","signup_state","closes_on"},
--         nothing written; an admin -> ok on each (entered_by = the
--         admin's name)
--     S2  after the camp's last day -> finished for the desk AND an admin
--     F1  the family form is unchanged: ok with source 'form' and no
--         entered_by, logged as "Family form" (camp_public_signup), its
--         camp_public_attempts row written; on a camp not open yet still
--         not_open; the 30-an-hour client-key limit still answers
--         rate_limited - while the desk (no client key) still signs up
--     D1  camp_camper_detail has source / entered_by (desk and form)
--     H1  camp_camper_history of a desk camper: the sign-up's insert row
--         names the staff member and holds entered_by; no login ids
--     G1  rights: camp_staff_form, camp_staff_signup, camp_camper_detail
--         security definer, search_path = '', run by authenticated only
--         (not anon, PUBLIC, service_role or camps_registrar); the core
--         has 18 inputs, the old 16-input one is gone, nobody may run it;
--         camp_public_signup still camps_registrar only; the two new
--         columns (not readable by the app directly) and their rules
--   It makes its own camps called "zz test 1a2b3c4d ...", so it works
--   whatever is already in the database, and on any weekday.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test camps, sign-ups, history
--   rows, attempt rows, test sessions). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0033_tests.sql: a pretend login token per session in
--   request.jwt.claims. A1 = admin unlocked, D1 = desk unlocked. The
--   family form's function is called as the SQL Editor's own role with no
--   token (it runs as its owner, so the answers are the same as for
--   camps_registrar).
--
-- BEFORE YOU RUN IT
--   1. 0013, 0022, 0027, 0033 and 0043 are applied. You need TWO
--      existing, ACTIVE staff rows: an admin and the shared front desk
--      (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Everything is rolled back.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0043 TESTS PASSED".
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
  v_c_x  text;   -- a signed-in user who is not staff
  v_l1 uuid := gen_random_uuid();
  v_c_l1 text;   -- the desk, signed in but PIN-locked (no session_unlock row)

  v_admin_name text;
  v_desk_name  text;
  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  -- a Monday 15-21 days from now: the test camps are Mon-Wed of that week
  v_mon   date := date_trunc('week', (public.testing_today() + 14)::timestamp)::date + 7;
  v_prices3 jsonb := '[{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000, "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000},
                       {"day_count": 2, "member_early_cents": 14000, "member_regular_cents": 15000, "nonmember_early_cents": 15000, "nonmember_regular_cents": 16000},
                       {"day_count": 3, "member_early_cents": 19500, "member_regular_cents": 21000, "nonmember_early_cents": 20500, "nonmember_regular_cents": 22000}]';
  v_open  uuid;   -- sign-up open
  v_soon  uuid;   -- not open yet
  v_late  uuid;   -- past the closing date
  v_hand  uuid;   -- closed by hand
  v_over  uuid;   -- the last day was yesterday

  v_r     jsonb;
  v_r2    jsonb;
  v_x     jsonb;
  v_h     jsonb;
  v_n     integer;
  v_n2    integer;
  v_sub   uuid;
  v_sid   uuid;
  v_cid   uuid;
  v_cid2  uuid;
  v_fn    record;
  v_fname text;
  v_txt   text;
  v_state text;
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  select s.full_name into v_admin_name from public.staff s where s.id = v_admin and s.active and s.role = 'admin';
  if v_admin_name is null then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.full_name into v_desk_name from public.staff s where s.id = v_desk and s.active and s.role = 'staff';
  if v_desk_name is null then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regprocedure('public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)') is null
     or to_regprocedure('public.camp_staff_form(uuid)') is null then
    raise exception 'TEST SETUP: camp_staff_signup / camp_staff_form are missing (is 0043 applied?)';
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
  --   kids(camp, names[])         children on all the camp's days, age 8,
  --                               member, no extras
  --   fs(camp, kids, key, sub)    the family form (camp_public_signup);
  --                               the first try sends 0 cents, then the
  --                               total it is told (price_changed)
  --   ds(camp, kids, sub)         Fill in (camp_staff_signup), the same way
  --   st(label, answer, status)   fails unless answer.status = status
  --   signups()                   how many sign-ups exist
  execute $f$
    create function pg_temp.kids(p_camp uuid, p_names text[]) returns jsonb language sql as $b$
      select jsonb_agg(jsonb_build_object('first_name', n.name, 'last_name', 'Fillin', 'age', 8, 'member', true,
                         'day_ids', (select jsonb_agg(d.id order by d.day) from public.camp_days d where d.camp_id = p_camp),
                         'extras', '[]'::jsonb)
                       order by n.k)
        from unnest(p_names) with ordinality as n(name, k);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.fs(p_camp uuid, p_kids jsonb, p_key text, p_sub uuid) returns jsonb language plpgsql as $b$
    declare
      v_r     jsonb;
      v_total integer := 0;
      v_try   integer;
    begin
      for v_try in 1 .. 2 loop
        select public.camp_public_signup(c.public_code, p_key, p_sub, p_kids,
                 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
                 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                 'camp-2026-10-18', md5(c.waiver_text), v_total)
          into v_r
          from public.camps c where c.id = p_camp;
        exit when v_r ->> 'status' is distinct from 'price_changed';
        v_total := (v_r ->> 'new_total_cents')::integer;
      end loop;
      return v_r;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ds(p_camp uuid, p_kids jsonb, p_sub uuid) returns jsonb language plpgsql as $b$
    declare
      v_r     jsonb;
      v_total integer := 0;
      v_try   integer;
    begin
      for v_try in 1 .. 2 loop
        select public.camp_staff_signup(c.id, p_sub, p_kids,
                 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
                 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                 'camp-2026-10-18', md5(c.waiver_text), v_total)
          into v_r
          from public.camps c where c.id = p_camp;
        exit when v_r ->> 'status' is distinct from 'price_changed';
        v_total := (v_r ->> 'new_total_cents')::integer;
      end loop;
      return v_r;
    end;
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
    create function pg_temp.signups() returns integer language sql as $b$
      select count(*)::integer from public.camp_signups;
    $b$;
  $f$;

  -- The test camps (admin): Mon-Wed of a week 15-21 days from now
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.camp_add_camp('worcester', false, v_tag || ' Open', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_open := (pg_temp.st('setup open camp', v_r, 'ok') ->> 'id')::uuid;
  v_r := public.camp_add_camp('worcester', false, v_tag || ' Soon', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today + 3, v_today + 5, v_today + 3, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_soon := (pg_temp.st('setup not-open-yet camp', v_r, 'ok') ->> 'id')::uuid;
  v_r := public.camp_add_camp('worcester', false, v_tag || ' Late', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 5, v_today - 1, v_today - 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_late := (pg_temp.st('setup past-closing camp', v_r, 'ok') ->> 'id')::uuid;
  v_r := public.camp_add_camp('worcester', false, v_tag || ' Hand', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_hand := (pg_temp.st('setup closed-by-hand camp', v_r, 'ok') ->> 'id')::uuid;
  perform pg_temp.st('setup close by hand', public.camp_set_signup(v_hand, (v_r ->> 'version')::integer, false), 'ok');
  -- the "over" camp: its only day moved to yesterday directly, as only a
  -- test can (0013_tests T6c)
  v_r := public.camp_add_camp('worcester', false, v_tag || ' Over', array[v_today + 1], '09:00', '15:00',
           v_today - 5, v_today - 2, v_today - 2, 5, 12,
           '[{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000, "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000}]'::jsonb,
           '[]'::jsonb, null, 'I agree to the camp rules.');
  v_over := (pg_temp.st('setup over camp', v_r, 'ok') ->> 'id')::uuid;
  update public.camp_days set day = v_today - 1 where camp_id = v_over;

  for v_cid, v_state in select x.id, x.st from (values (v_open, 'open'), (v_soon, 'not_open_yet'), (v_late, 'closed'),
                                                      (v_hand, 'closed'), (v_over, 'finished')) as x(id, st) loop
    if public.camp_signup_state(v_cid, v_today) is distinct from v_state then
      raise exception 'TEST SETUP: camp % is %, expected %', v_cid, public.camp_signup_state(v_cid, v_today), v_state;
    end if;
  end loop;

  -- ===================================================================
  -- A1. no_access
  -- ===================================================================
  v_n := pg_temp.signups();
  foreach v_txt in array array['', v_c_x, v_c_l1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    if public.camp_staff_form(v_open) is distinct from '{"status": "no_access"}'::jsonb then
      raise exception 'TEST FAILED: A1 camp_staff_form without staff access answered %', public.camp_staff_form(v_open);
    end if;
    v_r := public.camp_staff_signup(v_open, gen_random_uuid(), pg_temp.kids(v_open, array['Nobody']),
             'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
             'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
             'camp-2026-10-18', 'x', 0);
    if v_r is distinct from '{"status": "no_access"}'::jsonb then
      raise exception 'TEST FAILED: A1 camp_staff_signup without staff access answered %', v_r;
    end if;
  end loop;
  if pg_temp.signups() <> v_n then raise exception 'TEST FAILED: A1 a refused call wrote a sign-up'; end if;

  -- ===================================================================
  -- B1. camp_staff_form
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  for v_cid, v_state, v_txt in
    select x.id, x.st, x.fi from (values (v_open, 'open', 'open'), (v_soon, 'not_open_yet', 'admin_only'),
                                         (v_late, 'closed', 'admin_only'), (v_hand, 'closed', 'admin_only'),
                                         (v_over, 'finished', 'finished')) as x(id, st, fi) loop
    v_r := pg_temp.st('B1 camp_staff_form', public.camp_staff_form(v_cid), 'ok');
    select public.camp_public_camp(c.public_code) into v_x from public.camps c where c.id = v_cid;
    if (v_r - array['fill_in', 'signup_state', 'closes_on', 'closed_by_hand']) is distinct from v_x then
      raise exception 'TEST FAILED: B1 camp_staff_form is not camp_public_camp''s answer plus the four keys: % vs %', v_r, v_x;
    end if;
    if v_r ->> 'fill_in' is distinct from v_txt or v_r ->> 'signup_state' is distinct from v_state
       or (v_r ->> 'closes_on')::date is distinct from (select c.signup_closes_on from public.camps c where c.id = v_cid)
       or (v_r ->> 'closed_by_hand')::boolean is distinct from (v_cid = v_hand) then
      raise exception 'TEST FAILED: B1 camp % expected fill_in % / signup_state %, got %', v_cid, v_txt, v_state,
        v_r - array['camp'];
    end if;
  end loop;
  perform pg_temp.st('B1 unknown camp', public.camp_staff_form(gen_random_uuid()), 'not_found');
  perform pg_temp.st('B1 no camp', public.camp_staff_form(null), 'not_found');
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.camp_staff_form(v_soon) ->> 'fill_in' <> 'admin_only' then
    raise exception 'TEST FAILED: B1 fill_in is the rule, the same for an admin';
  end if;

  -- ===================================================================
  -- C1. The desk on an open camp
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  select count(*) into v_n2 from public.camp_public_attempts;
  v_sub := gen_random_uuid();
  v_r := pg_temp.st('C1 desk on an open camp', pg_temp.ds(v_open, pg_temp.kids(v_open, array['Ada', 'Abe']), v_sub), 'ok');
  if v_r ->> 'reference' !~ '^CP-[0-9]{4,}$' or (v_r ->> 'family_total_cents')::integer <> 2 * 19500
     or jsonb_array_length(v_r -> 'children') <> 2 or v_r ->> 'paying_by' <> 'cash' or v_r -> 'camp' ->> 'name' is null then
    raise exception 'TEST FAILED: C1 answer %', v_r;
  end if;
  select s.id into v_sid from public.camp_signups s where s.submission_id = v_sub;
  if (select s.source from public.camp_signups s where s.id = v_sid) <> 'desk'
     or (select s.entered_by from public.camp_signups s where s.id = v_sid) is distinct from v_desk_name
     or (select s.reference from public.camp_signups s where s.id = v_sid) <> v_r ->> 'reference'
     or (select s.created_by_name from public.camp_signups s where s.id = v_sid) <> v_desk_name
     or (select s.signature is null from public.camp_signups s where s.id = v_sid) then
    raise exception 'TEST FAILED: C1 the sign-up row: %',
      (select to_jsonb(s) - array['signature', 'waiver_text_signed'] from public.camp_signups s where s.id = v_sid);
  end if;
  if exists (select 1 from public.camp_campers c where c.signup_id = v_sid and c.created_by_name <> v_desk_name)
     or (select count(*) from public.camp_campers c where c.signup_id = v_sid) <> 2 then
    raise exception 'TEST FAILED: C1 the campers must be 2, created by the desk';
  end if;
  select to_jsonb(l) into v_x from public.change_log l
   where l.table_name = 'camp_signups' and l.record_id = v_sid and l.op = 'insert';
  if v_x ->> 'actor_name' is distinct from v_desk_name or v_x ->> 'action' <> 'camp_staff_signup'
     or (v_x ->> 'actor_id')::uuid is distinct from v_desk
     or v_x -> 'after' ->> 'source' <> 'desk' or v_x -> 'after' ->> 'entered_by' is distinct from v_desk_name
     or v_x -> 'after' ->> 'signature' <> 'on file' then
    raise exception 'TEST FAILED: C1 the history row of the sign-up: %', v_x - array['before'];
  end if;
  if exists (select 1 from public.change_log l
              where l.batch_id = (v_x ->> 'batch_id')::uuid and (l.action <> 'camp_staff_signup' or l.actor_name <> v_desk_name)) then
    raise exception 'TEST FAILED: C1 every history row of the save is the desk''s, tagged camp_staff_signup';
  end if;
  if (select count(*) from public.camp_public_attempts) <> v_n2 then
    raise exception 'TEST FAILED: C1 a desk sign-up wrote a camp_public_attempts row';
  end if;
  if current_setting('tkd.action', true) <> '' or current_setting('tkd.batch_id', true) <> '' then
    raise exception 'TEST FAILED: C1 tkd.action / tkd.batch_id left set';
  end if;

  -- ===================================================================
  -- C2. The same submission id -> the first answer again
  -- ===================================================================
  v_n := pg_temp.signups();
  v_r2 := public.camp_staff_signup(v_open, v_sub, pg_temp.kids(v_open, array['Other']),
            'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'card', true,
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            'camp-2026-10-18', 'x', 1);
  if v_r2 is distinct from v_r or pg_temp.signups() <> v_n then
    raise exception 'TEST FAILED: C2 the same submission id answered % (first %)', v_r2, v_r;
  end if;
  -- ... for ANOTHER camp -> invalid, never its details
  v_r2 := public.camp_staff_signup(v_hand, v_sub, pg_temp.kids(v_hand, array['Other']),
            'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'card', true,
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            'camp-2026-10-18', 'x', 1);
  if v_r2 is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: C2 the same submission id on another camp answered %', v_r2;
  end if;

  -- ===================================================================
  -- C3. The duplicate check
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('C3 family form Dot', pg_temp.fs(v_open, pg_temp.kids(v_open, array['Dot']), 'zz-0043-c3', gen_random_uuid()), 'ok');
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_sub := gen_random_uuid();
  perform pg_temp.st('C3 desk Dot again', pg_temp.ds(v_open, pg_temp.kids(v_open, array['Dot']), v_sub), 'ok');
  if (select c.duplicate_state from public.camp_campers c join public.camp_signups s on s.id = c.signup_id
       where s.submission_id = v_sub) <> 'possible' then
    raise exception 'TEST FAILED: C3 the desk''s Dot must be a possible duplicate';
  end if;

  -- ===================================================================
  -- C4. Bad input from the desk
  -- ===================================================================
  v_n := pg_temp.signups();
  select count(*) into v_n2 from public.change_log;
  v_r := public.camp_staff_signup(v_open, gen_random_uuid(), pg_temp.kids(v_open, array['Bad']),
           'Pat Parent', '508555', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
           'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
           'camp-2026-10-18', (select md5(c.waiver_text) from public.camps c where c.id = v_open), 19500);
  perform pg_temp.st('C4 a short phone', v_r, 'invalid');
  perform pg_temp.st('C4 no children', public.camp_staff_signup(v_open, gen_random_uuid(), '[]'::jsonb,
           'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
           'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
           'camp-2026-10-18', (select md5(c.waiver_text) from public.camps c where c.id = v_open), 0), 'invalid');
  perform pg_temp.st('C4 no submission id', public.camp_staff_signup(v_open, null, pg_temp.kids(v_open, array['Bad']),
           'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
           'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
           'camp-2026-10-18', (select md5(c.waiver_text) from public.camps c where c.id = v_open), 19500), 'invalid');
  perform pg_temp.st('C4 no tick', public.camp_staff_signup(v_open, gen_random_uuid(), pg_temp.kids(v_open, array['Bad']),
           'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', false,
           'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
           'camp-2026-10-18', (select md5(c.waiver_text) from public.camps c where c.id = v_open), 19500), 'invalid');
  perform pg_temp.st('C4 an old waiver', public.camp_staff_signup(v_open, gen_random_uuid(), pg_temp.kids(v_open, array['Bad']),
           'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
           'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
           'camp-2026-10-18', md5('another waiver'), 19500), 'camp_changed');
  perform pg_temp.st('C4 unknown camp', public.camp_staff_signup(gen_random_uuid(), gen_random_uuid(), pg_temp.kids(v_open, array['Bad']),
           'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
           'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
           'camp-2026-10-18', 'x', 0), 'not_found');
  -- four children (at most 3)
  perform pg_temp.st('C4 four children', pg_temp.ds(v_open, pg_temp.kids(v_open, array['Bad', 'Bea', 'Bob', 'Bud']), gen_random_uuid()), 'invalid');
  if pg_temp.signups() <> v_n or (select count(*) from public.change_log) <> v_n2 then
    raise exception 'TEST FAILED: C4 a refused desk sign-up wrote something';
  end if;

  -- ===================================================================
  -- S1. Not open: the desk -> admin_only; an admin -> ok
  -- ===================================================================
  for v_cid, v_state in select x.id, x.st from (values (v_soon, 'not_open_yet'), (v_late, 'closed'), (v_hand, 'closed')) as x(id, st) loop
    perform set_config('request.jwt.claims', v_c_d1, true);
    v_n := pg_temp.signups();
    select count(*) into v_n2 from public.change_log;
    v_r := pg_temp.ds(v_cid, pg_temp.kids(v_cid, array['Sal']), gen_random_uuid());
    if v_r is distinct from jsonb_build_object('status', 'admin_only', 'signup_state', v_state,
                                               'closes_on', (select c.signup_closes_on from public.camps c where c.id = v_cid)) then
      raise exception 'TEST FAILED: S1 the desk on a % camp answered %', v_state, v_r;
    end if;
    if pg_temp.signups() <> v_n or (select count(*) from public.change_log) <> v_n2 then
      raise exception 'TEST FAILED: S1 admin_only wrote something';
    end if;
    perform set_config('request.jwt.claims', v_c_a1, true);
    v_sub := gen_random_uuid();
    perform pg_temp.st('S1 admin on a ' || v_state || ' camp', pg_temp.ds(v_cid, pg_temp.kids(v_cid, array['Sal']), v_sub), 'ok');
    if (select s.source || '/' || s.entered_by from public.camp_signups s where s.submission_id = v_sub) is distinct from 'desk/' || v_admin_name then
      raise exception 'TEST FAILED: S1 the admin''s sign-up must be desk / %', v_admin_name;
    end if;
  end loop;
  -- the family form stays closed whatever the desk does
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('S1 family form on the not-open-yet camp', pg_temp.fs(v_soon, pg_temp.kids(v_soon, array['Fay']), 'zz-0043-s1', gen_random_uuid()), 'not_open');
  perform pg_temp.st('S1 family form on the closed-by-hand camp', pg_temp.fs(v_hand, pg_temp.kids(v_hand, array['Fay']), 'zz-0043-s1', gen_random_uuid()), 'closed');

  -- ===================================================================
  -- S2. After the last day: nobody
  -- ===================================================================
  v_n := pg_temp.signups();
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_r := pg_temp.ds(v_over, pg_temp.kids(v_over, array['Oz']), gen_random_uuid());
    if v_r is distinct from '{"status": "finished"}'::jsonb then
      raise exception 'TEST FAILED: S2 Fill in on a camp that is over answered %', v_r;
    end if;
  end loop;
  if pg_temp.signups() <> v_n then raise exception 'TEST FAILED: S2 wrote a sign-up'; end if;

  -- ===================================================================
  -- F1. The family form is unchanged
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n2 from public.camp_public_attempts;
  v_sub := gen_random_uuid();
  perform pg_temp.st('F1 family form', pg_temp.fs(v_open, pg_temp.kids(v_open, array['Fran']), 'zz-0043-f1', v_sub), 'ok');
  select s.id into v_sid from public.camp_signups s where s.submission_id = v_sub;
  if (select s.source from public.camp_signups s where s.id = v_sid) <> 'form'
     or (select s.entered_by from public.camp_signups s where s.id = v_sid) is not null
     or (select s.created_by_name from public.camp_signups s where s.id = v_sid) <> 'Family form' then
    raise exception 'TEST FAILED: F1 a family-form sign-up must be form / no entered_by / Family form';
  end if;
  select to_jsonb(l) into v_x from public.change_log l
   where l.table_name = 'camp_signups' and l.record_id = v_sid and l.op = 'insert';
  if v_x ->> 'actor_name' <> 'Family form' or v_x ->> 'action' <> 'camp_public_signup' or v_x ->> 'actor_id' is not null
     or v_x -> 'after' ->> 'source' <> 'form' or v_x -> 'after' -> 'entered_by' <> 'null'::jsonb then
    raise exception 'TEST FAILED: F1 the family form''s history row: %', v_x - array['before'];
  end if;
  -- two tries (price_changed, then ok): two attempt rows
  if (select count(*) from public.camp_public_attempts) <> v_n2 + 2 then
    raise exception 'TEST FAILED: F1 the family form must write its attempt rows (expected 2 more)';
  end if;
  -- the client-key limit: 30 tries this hour -> rate_limited
  insert into public.camp_public_attempts (client_key, camp_id, outcome)
  select 'zz-0043-rl', v_open, 'invalid' from generate_series(1, 30);
  v_r := pg_temp.fs(v_open, pg_temp.kids(v_open, array['Rae']), 'zz-0043-rl', gen_random_uuid());
  if v_r is distinct from '{"status": "rate_limited"}'::jsonb then
    raise exception 'TEST FAILED: F1 the 31st try of a client key answered %', v_r;
  end if;
  -- the camp's tries don't stop the desk
  insert into public.camp_public_attempts (client_key, camp_id, outcome)
  select 'zz-0043-rl-' || g, v_open, 'invalid' from generate_series(1, 200) as g;
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('F1 the desk is not rate limited', pg_temp.ds(v_open, pg_temp.kids(v_open, array['Rae']), gen_random_uuid()), 'ok');

  -- ===================================================================
  -- D1. Camper detail
  -- ===================================================================
  select c.id into v_cid from public.camp_campers c where c.camp_id = v_open and c.first_name = 'Ada';
  select c.id into v_cid2 from public.camp_campers c where c.camp_id = v_open and c.first_name = 'Fran';
  v_r := pg_temp.st('D1 detail of a desk camper', public.camp_camper_detail(v_cid), 'ok');
  if v_r ->> 'source' <> 'desk' or v_r ->> 'entered_by' is distinct from v_desk_name or v_r -> 'camper' ->> 'reference' is null
     or v_r -> 'family' ->> 'parent_phone' <> '5085550100' then
    raise exception 'TEST FAILED: D1 detail of a desk camper: source %, entered_by %', v_r -> 'source', v_r -> 'entered_by';
  end if;
  v_r := pg_temp.st('D1 detail of a form camper', public.camp_camper_detail(v_cid2), 'ok');
  if v_r ->> 'source' <> 'form' or v_r -> 'entered_by' <> 'null'::jsonb then
    raise exception 'TEST FAILED: D1 detail of a form camper: source %, entered_by %', v_r -> 'source', v_r -> 'entered_by';
  end if;
  perform pg_temp.st('D1 unknown camper', public.camp_camper_detail(gen_random_uuid()), 'not_found');
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('D1 no session', public.camp_camper_detail(v_cid), 'no_access');

  -- ===================================================================
  -- H1. History of a desk camper
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('H1 history of a desk camper', public.camp_camper_history(v_cid), 'ok');
  select x.value into v_h from jsonb_array_elements(v_r -> 'rows') as x(value)
   where x.value ->> 'table_name' = 'camp_signups' and x.value ->> 'op' = 'insert';
  if v_h is null or v_h ->> 'actor_name' is distinct from v_desk_name or v_h ->> 'action' <> 'camp_staff_signup'
     or v_h -> 'after' ->> 'entered_by' is distinct from v_desk_name or v_h -> 'after' ->> 'source' <> 'desk'
     or v_h -> 'after' ->> 'reference' is null then
    raise exception 'TEST FAILED: H1 the sign-up''s insert row: %', v_h;
  end if;
  if v_r::text ~ v_desk::text or v_r::text ~ v_admin::text
     or exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x(value)
                 where x.value ? 'actor_id' or x.value ? 'session_id'
                    or coalesce(x.value -> 'after', '{}') ?| array['created_by', 'updated_by', 'submission_id', 'waiver_text_signed']) then
    raise exception 'TEST FAILED: H1 the history holds a login id';
  end if;

  -- ===================================================================
  -- G1. Rights and rules
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  for v_fname in select unnest(array['camp_staff_form(uuid)',
                                     'camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)',
                                     'camp_camper_detail(uuid)']) loop
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
  -- the core: 18 inputs, not security definer, nobody but its owner
  if to_regprocedure('public.camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)') is not null
     or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'camp_public_signup_core') <> 1 then
    raise exception 'TEST FAILED: G1 there must be exactly one camp_public_signup_core (the 18-input one)';
  end if;
  select p.oid, p.prosecdef, p.proconfig, p.proacl into v_fn
    from pg_proc p
   where p.oid = to_regprocedure('public.camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer, text, text)');
  if v_fn.oid is null or v_fn.prosecdef or v_fn.proconfig is distinct from array['search_path=""']
     or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee <> 'postgres'::regrole) then
    raise exception 'TEST FAILED: G1 the core must be internal (not definer, search_path = '''', only its owner)';
  end if;
  -- ... and a signed-in staff member can't call it to spoof a name
  select c.public_code into v_txt from public.camps c where c.id = v_open;
  v_x := pg_temp.kids(v_open, array['Spoof']);
  perform set_config('request.jwt.claims', v_c_d1, true);
  begin
    set local role authenticated;
    perform public.camp_public_signup_core(v_txt, null, gen_random_uuid(), v_x, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt',
              'cash', true, 'x', 'camp-2026-10-18', 'x', 0, 'desk', 'Spoofed');
    raise exception 'TEST FAILED: G1 authenticated could call camp_public_signup_core with a made-up name';
  exception
    when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.camp_signups s where s.entered_by = 'Spoofed') then
    raise exception 'TEST FAILED: G1 a spoofed sign-up was saved';
  end if;
  -- exactly one camp_staff_signup (no other version that could take a name)
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'camp_staff_signup') <> 1
     or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'camp_staff_form') <> 1 then
    raise exception 'TEST FAILED: G1 there must be exactly one camp_staff_signup and one camp_staff_form';
  end if;
  -- the family form's function: camps_registrar only
  select p.oid, p.prosecdef, p.proconfig into v_fn
    from pg_proc p
   where p.oid = to_regprocedure('public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)');
  if v_fn.oid is null or not v_fn.prosecdef or v_fn.proconfig is distinct from array['search_path=""']
     or not has_function_privilege('camps_registrar', v_fn.oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
     or has_function_privilege('anon', v_fn.oid, 'EXECUTE') then
    raise exception 'TEST FAILED: G1 camp_public_signup must stay for camps_registrar only';
  end if;
  -- the new columns: not readable by the app straight from the table
  if has_column_privilege('authenticated', 'public.camp_signups', 'source', 'SELECT')
     or has_column_privilege('authenticated', 'public.camp_signups', 'entered_by', 'SELECT')
     or has_column_privilege('anon', 'public.camp_signups', 'entered_by', 'SELECT')
     or has_column_privilege('camps_registrar', 'public.camp_signups', 'entered_by', 'SELECT') then
    raise exception 'TEST FAILED: G1 the new columns must be read only through the functions';
  end if;
  if (select t.attnotnull from pg_attribute t where t.attrelid = 'public.camp_signups'::regclass and t.attname = 'source') is not true
     or (select t.attnotnull from pg_attribute t where t.attrelid = 'public.camp_signups'::regclass and t.attname = 'entered_by') is not false then
    raise exception 'TEST FAILED: G1 source must be not null, entered_by may be empty';
  end if;
  -- the rules: a desk sign-up without a name, a form one with a name, another source
  select s.id into v_sid from public.camp_signups s where s.source = 'desk' limit 1;
  foreach v_txt in array array['update public.camp_signups set entered_by = null where id = $1',
                               'update public.camp_signups set source = ''form'' where id = $1',
                               'update public.camp_signups set source = ''kiosk'', entered_by = null where id = $1'] loop
    begin
      execute v_txt using v_sid;
      raise exception 'TEST FAILED: G1 the rule let through: %', v_txt;
    exception
      when check_violation then null;
    end;
  end loop;
end;
$$;

select 'ALL 0043 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
