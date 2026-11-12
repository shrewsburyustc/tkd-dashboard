-- =====================================================================
-- 0050_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0050_camps_signup_school.sql
--   (rulebook v0.757: a camp for both schools has one family link per
--   school, and every sign-up carries the school it came from; contract
--   docs/Camps/CONTRACT-0050.md). It checks, in this order:
--     B1  public_code_2: a camp for one school has none; a camp for both
--         schools has one (8 characters, different from public_code); the
--         table rules refuse a client trying to set or change it
--     B2  camp_public_camp finds the camp by EITHER code - the same answer
--         both ways - and that answer holds neither code nor a school; a
--         malformed or unknown code -> not_found
--     B3  Edit camp: both_schools false -> true makes the second code,
--         true -> false clears it, false -> true again makes one; it never
--         changes while the camp stays both-schools; a both-schools camp
--         can't move its stored school; a camp can't stop being for both
--         schools (or move) under another school's sign-ups; a one-school
--         camp can't become a both-schools camp AND move its school under
--         sign-ups that used its first link (but may when there are none);
--         a code can't equal another camp's code in the other column
--     C3  a transaction setting tkd.signup_school set beforehand is
--         overwritten: the sign-up gets the link's / the camp's school
--     D0  data already in the database (run first): every one-school camp's
--         sign-ups have its school, a camp has a second code exactly when
--         it is for both schools
--     C1  the family form: through public_code a sign-up gets the camp's
--         stored school, through public_code_2 the other school; a camp
--         for one school -> its school; the history row holds the school;
--         the attempts row still records the camp (either code)
--     C2  an unknown or malformed code -> not_found, nothing written; the
--         same submission id through the OTHER link -> the first answer
--         again, still one sign-up with its first school
--     D1  Fill in (camp_staff_signup): a 15-input call -> the camp's
--         stored school; blank -> the same; the other school on a both-
--         schools camp -> that school; an unknown school, or another
--         school on a camp for one school -> {"status":"invalid",
--         "field":"school"}, nothing written; tkd.signup_school is not
--         left set
--     E1  the roster view and Camper detail return school (read as the
--         signed-in app, role authenticated)
--     F1  a sign-up's school never changes: an update puts the old school
--         back (no version bump, no history row); the app's role can't
--         update the table; a school sent on an insert is ignored; a
--         school other than a one-school camp's is refused
--     H1  Finance is unchanged: a camper of the OTHER school paid at that
--         school's desk is counted there by finance_day (Finance reads
--         camp_payments.school)
--     G1  rights: camp_public_camp and camp_public_signup camps_registrar
--         only; camp_staff_signup (16 inputs, one version) signed-in staff
--         only; the two trigger functions nobody; the two new columns
--         (read by authenticated, nobody else), their rules, nothing for
--         anon
--   It makes its own camps called "zz test 1a2b3c4d ...", so it works
--   whatever is already in the database, and on any weekday.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test camps, sign-ups, payments,
--   history rows, attempt rows, test sessions). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0043_tests.sql: a pretend login token per session in
--   request.jwt.claims. A1 = admin unlocked, D1 = desk unlocked. The
--   family form's function is called as the SQL Editor's own role with no
--   token (it runs as its owner, so the answers are the same as for
--   camps_registrar).
--
-- BEFORE YOU RUN IT
--   1. 0013, 0022, 0027, 0033, 0043, 0039 and 0050 are applied. You need
--      TWO existing, ACTIVE staff rows: an admin and the shared front desk
--      (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Everything is rolled back.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0050 TESTS PASSED".
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

  v_admin_name text;
  v_desk_name  text;
  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  -- a Monday 15-21 days from now: the test camps are Mon-Wed of that week
  v_mon   date := date_trunc('week', (public.testing_today() + 14)::timestamp)::date + 7;
  v_prices3 jsonb := '[{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000, "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000},
                       {"day_count": 2, "member_early_cents": 14000, "member_regular_cents": 15000, "nonmember_early_cents": 15000, "nonmember_regular_cents": 16000},
                       {"day_count": 3, "member_early_cents": 19500, "member_regular_cents": 21000, "nonmember_early_cents": 20500, "nonmember_regular_cents": 22000}]';
  v_one_w uuid;   -- one school: Worcester
  v_one_s uuid;   -- one school: Shrewsbury
  v_bs    uuid;   -- both schools, stored school Shrewsbury (like the Thanksgiving camp)
  v_bw    uuid;   -- both schools, stored school Worcester
  v_tog   uuid;   -- toggled in B3
  v_mv    uuid;   -- moved in B3
  v_lo1   uuid;   -- B3b: a one-school camp with a family
  v_lo2   uuid;   -- B3b: a one-school camp with none

  v_r     jsonb;
  v_r2    jsonb;
  v_x     jsonb;
  v_n     integer;
  v_n2    integer;
  v_sub   uuid;
  v_sid   uuid;
  v_cid   uuid;
  v_code  text;
  v_code2 text;
  v_code2_before text;
  v_ver   integer;
  v_fn    record;
  v_fname text;
  v_txt   text;
  v_pay   uuid;
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
  if to_regprocedure('public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer, text)') is null
     or not exists (select 1 from pg_attribute a where a.attrelid = 'public.camps'::regclass and a.attname = 'public_code_2'
                     and a.attnum > 0 and not a.attisdropped)
     or not exists (select 1 from pg_attribute a where a.attrelid = 'public.camp_signups'::regclass and a.attname = 'school'
                     and a.attnum > 0 and not a.attisdropped) then
    raise exception 'TEST SETUP: camps.public_code_2 / camp_signups.school / the 16-input camp_staff_signup are missing (is 0050 applied?)';
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
  --   kids(camp, names[])          children on all the camp's days, age 8,
  --                                member, no extras
  --   fs(code, camp, kids, key, sub)  the family form (camp_public_signup)
  --                                with the CODE given; the first try sends
  --                                0 cents, then the total it is told
  --   ds(camp, kids, sub, school)  Fill in (camp_staff_signup, 16 inputs)
  --   st(label, answer, status)    fails unless answer.status = status
  --   signups()                    how many sign-ups exist
  --   ed(camp, school, both)       Edit camp changing only the stored school
  --                                and / or both_schools
  --   sch(sub)                     the school of the sign-up with this id
  execute $f$
    create function pg_temp.kids(p_camp uuid, p_names text[]) returns jsonb language sql as $b$
      select jsonb_agg(jsonb_build_object('first_name', n.name, 'last_name', 'Schooltest', 'age', 8, 'member', true,
                         'day_ids', (select jsonb_agg(d.id order by d.day) from public.camp_days d where d.camp_id = p_camp),
                         'extras', '[]'::jsonb)
                       order by n.k)
        from unnest(p_names) with ordinality as n(name, k);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.fs(p_code text, p_camp uuid, p_kids jsonb, p_key text, p_sub uuid) returns jsonb language plpgsql as $b$
    declare
      v_r     jsonb;
      v_total integer := 0;
      v_try   integer;
    begin
      for v_try in 1 .. 2 loop
        select public.camp_public_signup(p_code, p_key, p_sub, p_kids,
                 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
                 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                 'camp-2026-10-18', (select md5(c.waiver_text) from public.camps c where c.id = p_camp), v_total)
          into v_r;
        exit when v_r ->> 'status' is distinct from 'price_changed';
        v_total := (v_r ->> 'new_total_cents')::integer;
      end loop;
      return v_r;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ds(p_camp uuid, p_kids jsonb, p_sub uuid, p_school text) returns jsonb language plpgsql as $b$
    declare
      v_r     jsonb;
      v_total integer := 0;
      v_try   integer;
    begin
      for v_try in 1 .. 2 loop
        select public.camp_staff_signup(c.id, p_sub, p_kids,
                 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
                 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                 'camp-2026-10-18', md5(c.waiver_text), v_total, p_school)
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
  execute $f$
    create function pg_temp.ed(p_camp uuid, p_school text, p_both boolean, p_name text) returns jsonb language sql as $b$
      select public.camp_update_camp(c.id, c.version, p_school, p_both, coalesce(p_name, c.name),
                                     array(select d.day from public.camp_days d where d.camp_id = c.id order by d.day),
                                     c.start_time, c.end_time, c.signup_opens_on, c.signup_closes_on, c.early_until,
                                     c.min_age, c.max_age,
                                     '[{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000, "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000},
                                       {"day_count": 2, "member_early_cents": 14000, "member_regular_cents": 15000, "nonmember_early_cents": 15000, "nonmember_regular_cents": 16000},
                                       {"day_count": 3, "member_early_cents": 19500, "member_regular_cents": 21000, "nonmember_early_cents": 20500, "nonmember_regular_cents": 22000}]'::jsonb,
                                     '[]'::jsonb, c.description, c.waiver_text)
        from public.camps c where c.id = p_camp;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.sch(p_sub uuid) returns text language sql as $b$
      select s.school from public.camp_signups s where s.submission_id = p_sub;
    $b$;
  $f$;

  -- D0. what is already in the database (the migration's one-time fill and the
  --     triggers since): a one-school camp's sign-ups all have its school, and a
  --     camp has a second code exactly when it is for both schools. (The fill
  --     itself runs once, when 0050 is pasted - it can't be made again inside
  --     a rolled-back test because school is NOT NULL now; the PGlite run checks
  --     it on camps made before 0050.)
  if exists (select 1 from public.camp_signups s join public.camps c on c.id = s.camp_id
              where not c.both_schools and s.school <> c.location_code) then
    raise exception 'TEST FAILED: D0 a sign-up of a one-school camp has another school';
  end if;
  if exists (select 1 from public.camps c where c.both_schools is distinct from (c.public_code_2 is not null)) then
    raise exception 'TEST FAILED: D0 a camp has a second code exactly when it is for both schools';
  end if;
  if exists (select 1 from public.camps a join public.camps b on b.public_code_2 = a.public_code) then
    raise exception 'TEST FAILED: D0 a camp''s first code equals a second code';
  end if;

  -- The test camps (admin): Mon-Wed of a week 15-21 days from now, open now
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.camp_add_camp('worcester', false, v_tag || ' One W', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_one_w := (pg_temp.st('setup one-school Worcester camp', v_r, 'ok') ->> 'id')::uuid;
  v_r := public.camp_add_camp('shrewsbury', false, v_tag || ' One S', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_one_s := (pg_temp.st('setup one-school Shrewsbury camp', v_r, 'ok') ->> 'id')::uuid;
  v_r := public.camp_add_camp('shrewsbury', true, v_tag || ' Both S', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_bs := (pg_temp.st('setup both-schools camp stored Shrewsbury', v_r, 'ok') ->> 'id')::uuid;
  v_r := public.camp_add_camp('worcester', true, v_tag || ' Both W', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_bw := (pg_temp.st('setup both-schools camp stored Worcester', v_r, 'ok') ->> 'id')::uuid;
  v_r := public.camp_add_camp('worcester', false, v_tag || ' Toggle', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_tog := (pg_temp.st('setup toggle camp', v_r, 'ok') ->> 'id')::uuid;
  v_r := public.camp_add_camp('worcester', false, v_tag || ' Move', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_mv := (pg_temp.st('setup move camp', v_r, 'ok') ->> 'id')::uuid;

  -- ===================================================================
  -- B1. public_code_2
  -- ===================================================================
  if exists (select 1 from public.camps c where c.id in (v_one_w, v_one_s, v_tog, v_mv) and c.public_code_2 is not null) then
    raise exception 'TEST FAILED: B1 a camp for one school has a second code';
  end if;
  for v_cid in select unnest(array[v_bs, v_bw]) loop
    select c.public_code, c.public_code_2 into v_code, v_code2 from public.camps c where c.id = v_cid;
    if v_code2 is null or v_code2 !~ '^[a-hjkmnp-z2-9]{8}$' or v_code2 = v_code then
      raise exception 'TEST FAILED: B1 a both-schools camp''s codes are % / %', v_code, v_code2;
    end if;
  end loop;
  if (select count(distinct x) from (select c.public_code as x from public.camps c where c.id in (v_bs, v_bw, v_one_w, v_one_s)
                                     union all select c.public_code_2 from public.camps c where c.id in (v_bs, v_bw)) as y) <> 6 then
    raise exception 'TEST FAILED: B1 the six codes of the four test camps must all differ';
  end if;
  -- the add answer still names public_code (and the table holds the same)
  v_r := public.camp_add_camp('shrewsbury', true, v_tag || ' Both S2', array[v_mon, v_mon + 1], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12,
           '[{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000, "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000},
             {"day_count": 2, "member_early_cents": 14000, "member_regular_cents": 15000, "nonmember_early_cents": 15000, "nonmember_regular_cents": 16000}]'::jsonb,
           '[]'::jsonb, null, 'I agree to the camp rules.');
  perform pg_temp.st('B1 a second both-schools camp', v_r, 'ok');
  if (select c.public_code from public.camps c where c.id = (v_r ->> 'id')::uuid) is distinct from v_r ->> 'public_code' then
    raise exception 'TEST FAILED: B1 camp_add_camp''s public_code must be the camp''s public_code';
  end if;
  -- a direct write can't set or change the second code (the trigger puts it back / makes its own)
  select c.public_code_2, c.version into v_code2, v_ver from public.camps c where c.id = v_bs;
  update public.camps set public_code_2 = 'aaaaaaaa' where id = v_bs;
  if (select c.public_code_2 from public.camps c where c.id = v_bs) is distinct from v_code2
     or (select c.version from public.camps c where c.id = v_bs) <> v_ver then
    raise exception 'TEST FAILED: B1 an update changed the second code (or the version)';
  end if;
  update public.camps set public_code_2 = 'aaaaaaaa' where id = v_one_w;
  if (select c.public_code_2 from public.camps c where c.id = v_one_w) is not null then
    raise exception 'TEST FAILED: B1 a camp for one school took a second code';
  end if;
  -- the third rule: it differs from public_code (checked with the triggers out of the way)
  begin
    alter table public.camps disable trigger camps_before_public_code_2;
    update public.camps c set public_code_2 = c.public_code where c.id = v_bs;
    raise exception 'TEST FAILED: B1 the second code may equal the first';
  exception
    when check_violation then null;
  end;
  alter table public.camps enable trigger camps_before_public_code_2;

  -- ===================================================================
  -- B2. camp_public_camp by either code
  -- ===================================================================
  select c.public_code, c.public_code_2 into v_code, v_code2 from public.camps c where c.id = v_bs;
  v_r  := pg_temp.st('B2 by public_code', public.camp_public_camp(v_code), 'ok');
  v_r2 := pg_temp.st('B2 by public_code_2', public.camp_public_camp(v_code2), 'ok');
  if v_r is distinct from v_r2 or v_r -> 'camp' ->> 'name' is distinct from v_tag || ' Both S' then
    raise exception 'TEST FAILED: B2 the two links must give the same answer: % vs %', v_r, v_r2;
  end if;
  if v_r::text like '%' || v_code || '%' or v_r::text like '%' || v_code2 || '%'
     or v_r::text ~ '"school"' or v_r::text ~ 'public_code' then
    raise exception 'TEST FAILED: B2 the answer holds a code or a school key: %', v_r;
  end if;
  perform pg_temp.st('B2 one-school camp by its code', public.camp_public_camp((select c.public_code from public.camps c where c.id = v_one_w)), 'ok');
  perform pg_temp.st('B2 unknown valid-looking code', public.camp_public_camp('zzzzzzzz'), 'not_found');
  perform pg_temp.st('B2 malformed code', public.camp_public_camp('ABC'), 'not_found');
  perform pg_temp.st('B2 null code', public.camp_public_camp(null), 'not_found');

  -- ===================================================================
  -- C1. The family form: the school follows the link
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n2 from public.camp_public_attempts;
  v_sub := gen_random_uuid();
  perform pg_temp.st('C1 through public_code', pg_temp.fs(v_code, v_bs, pg_temp.kids(v_bs, array['Ann', 'Abe']), 'zz-0050-c1', v_sub), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: C1 a sign-up through public_code of the camp stored at Shrewsbury got %', pg_temp.sch(v_sub);
  end if;
  v_sid := (select s.id from public.camp_signups s where s.submission_id = v_sub);
  v_sub := gen_random_uuid();
  perform pg_temp.st('C1 through public_code_2', pg_temp.fs(v_code2, v_bs, pg_temp.kids(v_bs, array['Bea']), 'zz-0050-c1', v_sub), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'worcester' then
    raise exception 'TEST FAILED: C1 a sign-up through public_code_2 of the camp stored at Shrewsbury got %', pg_temp.sch(v_sub);
  end if;
  -- the other both-schools camp (stored Worcester): the other way round
  select c.public_code, c.public_code_2 into v_txt, v_code2_before from public.camps c where c.id = v_bw;
  v_sub := gen_random_uuid();
  perform pg_temp.st('C1 Both W public_code', pg_temp.fs(v_txt, v_bw, pg_temp.kids(v_bw, array['Cal']), 'zz-0050-c1', v_sub), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'worcester' then raise exception 'TEST FAILED: C1 Both W public_code -> %', pg_temp.sch(v_sub); end if;
  v_sub := gen_random_uuid();
  perform pg_temp.st('C1 Both W public_code_2', pg_temp.fs(v_code2_before, v_bw, pg_temp.kids(v_bw, array['Dan']), 'zz-0050-c1', v_sub), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then raise exception 'TEST FAILED: C1 Both W public_code_2 -> %', pg_temp.sch(v_sub); end if;
  -- a camp for one school: its school
  v_sub := gen_random_uuid();
  perform pg_temp.st('C1 one-school Worcester', pg_temp.fs((select c.public_code from public.camps c where c.id = v_one_w), v_one_w,
                       pg_temp.kids(v_one_w, array['Eve']), 'zz-0050-c1', v_sub), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'worcester' then raise exception 'TEST FAILED: C1 one-school Worcester -> %', pg_temp.sch(v_sub); end if;
  v_sub := gen_random_uuid();
  perform pg_temp.st('C1 one-school Shrewsbury', pg_temp.fs((select c.public_code from public.camps c where c.id = v_one_s), v_one_s,
                       pg_temp.kids(v_one_s, array['Fay']), 'zz-0050-c1', v_sub), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then raise exception 'TEST FAILED: C1 one-school Shrewsbury -> %', pg_temp.sch(v_sub); end if;
  -- the history row holds the school; the family form's marks are the same as before
  select to_jsonb(l) into v_x from public.change_log l
   where l.table_name = 'camp_signups' and l.record_id = v_sid and l.op = 'insert';
  if v_x -> 'after' ->> 'school' is distinct from 'shrewsbury' or v_x ->> 'actor_name' <> 'Family form'
     or v_x ->> 'action' <> 'camp_public_signup' then
    raise exception 'TEST FAILED: C1 the history row of the sign-up: %', v_x - array['before'];
  end if;
  -- the attempts rows name the camp, whichever code was used (each form try = 2 rows: price_changed, ok)
  if (select count(*) from public.camp_public_attempts a where a.client_key = 'zz-0050-c1' and a.camp_id = v_bs) <> 4
     or (select count(*) from public.camp_public_attempts a where a.client_key = 'zz-0050-c1' and a.camp_id = v_bw) <> 4
     or (select count(*) from public.camp_public_attempts) <> v_n2 + 12 then
    raise exception 'TEST FAILED: C1 the attempts rows (camp by either code)';
  end if;
  if current_setting('tkd.signup_school', true) is distinct from '' then
    raise exception 'TEST FAILED: C1 tkd.signup_school left set (%)', current_setting('tkd.signup_school', true);
  end if;

  -- ===================================================================
  -- C2. Unknown codes; the same submission id through the other link
  -- ===================================================================
  v_n := pg_temp.signups();
  v_sub := gen_random_uuid();
  perform pg_temp.st('C2 unknown code', pg_temp.fs('zzzzzzzz', v_bs, pg_temp.kids(v_bs, array['Gus']), 'zz-0050-c2', v_sub), 'not_found');
  perform pg_temp.st('C2 malformed code', pg_temp.fs('nope', v_bs, pg_temp.kids(v_bs, array['Gus']), 'zz-0050-c2', v_sub), 'not_found');
  if pg_temp.signups() <> v_n then raise exception 'TEST FAILED: C2 a not_found wrote a sign-up'; end if;
  -- (one attempt row per call: a not_found is not retried)
  if exists (select 1 from public.camp_public_attempts a where a.client_key = 'zz-0050-c2' and a.camp_id is not null)
     or (select count(*) from public.camp_public_attempts a where a.client_key = 'zz-0050-c2') <> 2 then
    raise exception 'TEST FAILED: C2 an unknown code writes attempt rows with no camp';
  end if;
  v_sub := gen_random_uuid();
  v_r := pg_temp.st('C2 first', pg_temp.fs(v_code, v_bs, pg_temp.kids(v_bs, array['Hal']), 'zz-0050-c2b', v_sub), 'ok');
  v_n := pg_temp.signups();
  v_r2 := pg_temp.fs(v_code2, v_bs, pg_temp.kids(v_bs, array['Hal']), 'zz-0050-c2b', v_sub);
  if v_r2 is distinct from v_r or pg_temp.signups() <> v_n or pg_temp.sch(v_sub) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: C2 the same submission id through the other link: % (first %), school %', v_r2, v_r, pg_temp.sch(v_sub);
  end if;

  -- ===================================================================
  -- D1. Fill in
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- an old, 15-input call (as the live app makes it)
  v_sub := gen_random_uuid();
  select public.camp_staff_signup(c.id, v_sub, pg_temp.kids(v_bs, array['Ivy']),
           'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
           'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
           'camp-2026-10-18', md5(c.waiver_text), 19500) into v_r
    from public.camps c where c.id = v_bs;
  perform pg_temp.st('D1 old 15-input call (price check)', v_r, 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: D1 the 15-input call must use the camp''s stored school, got %', pg_temp.sch(v_sub);
  end if;
  -- blank and null
  v_sub := gen_random_uuid();
  perform pg_temp.st('D1 blank school', pg_temp.ds(v_bw, pg_temp.kids(v_bw, array['Jon']), v_sub, ''), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'worcester' then raise exception 'TEST FAILED: D1 blank school -> %', pg_temp.sch(v_sub); end if;
  v_sub := gen_random_uuid();
  perform pg_temp.st('D1 null school', pg_temp.ds(v_bs, pg_temp.kids(v_bs, array['Kim']), v_sub, null), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then raise exception 'TEST FAILED: D1 null school -> %', pg_temp.sch(v_sub); end if;
  -- the other school on a camp for both schools (each way), and the camp's own school
  v_sub := gen_random_uuid();
  perform pg_temp.st('D1 Worcester on the Shrewsbury-stored camp', pg_temp.ds(v_bs, pg_temp.kids(v_bs, array['Lou']), v_sub, 'worcester'), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'worcester' then raise exception 'TEST FAILED: D1 explicit worcester -> %', pg_temp.sch(v_sub); end if;
  select s.id into v_sid from public.camp_signups s where s.submission_id = v_sub;
  v_sub := gen_random_uuid();
  perform pg_temp.st('D1 Shrewsbury on the Worcester-stored camp', pg_temp.ds(v_bw, pg_temp.kids(v_bw, array['Max']), v_sub, 'shrewsbury'), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then raise exception 'TEST FAILED: D1 explicit shrewsbury -> %', pg_temp.sch(v_sub); end if;
  v_sub := gen_random_uuid();
  perform pg_temp.st('D1 the camp''s own school, explicit', pg_temp.ds(v_bw, pg_temp.kids(v_bw, array['Ned']), v_sub, 'worcester'), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'worcester' then raise exception 'TEST FAILED: D1 explicit own school -> %', pg_temp.sch(v_sub); end if;
  -- one-school camp: its own school is fine, any other is refused
  v_sub := gen_random_uuid();
  perform pg_temp.st('D1 one-school camp, its school', pg_temp.ds(v_one_w, pg_temp.kids(v_one_w, array['Oda']), v_sub, 'worcester'), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'worcester' then raise exception 'TEST FAILED: D1 one-school own school -> %', pg_temp.sch(v_sub); end if;
  v_n := pg_temp.signups();
  select count(*) into v_n2 from public.change_log;
  v_r := pg_temp.ds(v_one_w, pg_temp.kids(v_one_w, array['Pam']), gen_random_uuid(), 'shrewsbury');
  if v_r is distinct from '{"status": "invalid", "field": "school"}'::jsonb then
    raise exception 'TEST FAILED: D1 another school on a one-school camp answered %', v_r;
  end if;
  v_r := pg_temp.ds(v_bs, pg_temp.kids(v_bs, array['Pam']), gen_random_uuid(), 'boston');
  if v_r is distinct from '{"status": "invalid", "field": "school"}'::jsonb then
    raise exception 'TEST FAILED: D1 an unknown school answered %', v_r;
  end if;
  if pg_temp.signups() <> v_n or (select count(*) from public.change_log) <> v_n2 then
    raise exception 'TEST FAILED: D1 a refused school wrote something';
  end if;
  -- the other answers are untouched: no access, unknown camp
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('D1 no session', pg_temp.ds(v_bs, pg_temp.kids(v_bs, array['Quin']), gen_random_uuid(), 'worcester'), 'no_access');
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('D1 unknown camp', public.camp_staff_signup(gen_random_uuid(), gen_random_uuid(), '[]'::jsonb,
           'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, 'x', 'camp-2026-10-18', 'x', 0, 'worcester'), 'not_found');
  if current_setting('tkd.signup_school', true) is distinct from '' then
    raise exception 'TEST FAILED: D1 tkd.signup_school left set (%)', current_setting('tkd.signup_school', true);
  end if;

  -- ===================================================================
  -- B3. Edit camp: the second code follows both_schools
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  select c.version into v_ver from public.camps c where c.id = v_tog;
  perform pg_temp.st('B3 false -> true', pg_temp.ed(v_tog, 'worcester', true, null), 'ok');
  select c.public_code, c.public_code_2 into v_code, v_code2 from public.camps c where c.id = v_tog;
  if v_code2 is null or v_code2 = v_code or (select c.version from public.camps c where c.id = v_tog) <> v_ver + 1 then
    raise exception 'TEST FAILED: B3 after both_schools became true: codes % / %', v_code, v_code2;
  end if;
  perform pg_temp.st('B3 the new link opens the camp', public.camp_public_camp(v_code2), 'ok');
  -- an edit that leaves both_schools alone keeps the code
  perform pg_temp.st('B3 rename', pg_temp.ed(v_tog, 'worcester', true, v_tag || ' Toggle renamed'), 'ok');
  if (select c.public_code_2 from public.camps c where c.id = v_tog) is distinct from v_code2
     or (select c.public_code from public.camps c where c.id = v_tog) is distinct from v_code then
    raise exception 'TEST FAILED: B3 a rename changed a code';
  end if;
  -- a both-schools camp can't move its stored school
  v_n2 := (select c.version from public.camps c where c.id = v_tog);
  perform pg_temp.st('B3 move a both-schools camp', pg_temp.ed(v_tog, 'shrewsbury', true, null), 'invalid');
  if (select c.location_code from public.camps c where c.id = v_tog) <> 'worcester'
     or (select c.version from public.camps c where c.id = v_tog) <> v_n2 then
    raise exception 'TEST FAILED: B3 a refused move changed the camp';
  end if;
  -- a family signs up through the second link: the camp can't stop being for both schools
  perform set_config('request.jwt.claims', '', true);
  v_sub := gen_random_uuid();
  perform pg_temp.st('B3 sign-up through the second link', pg_temp.fs(v_code2, v_tog, pg_temp.kids(v_tog, array['Rex']), 'zz-0050-b3', v_sub), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then raise exception 'TEST FAILED: B3 school of the second link -> %', pg_temp.sch(v_sub); end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('B3 true -> false with a Shrewsbury family', pg_temp.ed(v_tog, 'worcester', false, null), 'invalid');
  if (select c.both_schools from public.camps c where c.id = v_tog) is not true
     or (select c.public_code_2 from public.camps c where c.id = v_tog) is distinct from v_code2 then
    raise exception 'TEST FAILED: B3 a refused change left the camp different';
  end if;
  -- ... but a both-schools camp with only its own school's families may become a one-school camp
  perform pg_temp.st('B3 move camp: false -> true', pg_temp.ed(v_mv, 'worcester', true, null), 'ok');
  select c.public_code, c.public_code_2 into v_code, v_code2 from public.camps c where c.id = v_mv;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('B3 move camp: a Worcester family', pg_temp.fs(v_code, v_mv, pg_temp.kids(v_mv, array['Sue']), 'zz-0050-b3', gen_random_uuid()), 'ok');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('B3 true -> false (only the stored school''s families)', pg_temp.ed(v_mv, 'worcester', false, null), 'ok');
  if (select c.public_code_2 from public.camps c where c.id = v_mv) is not null
     or (select c.public_code from public.camps c where c.id = v_mv) is distinct from v_code then
    raise exception 'TEST FAILED: B3 true -> false must clear the second code and keep the first';
  end if;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('B3 the cleared link no longer opens the camp', public.camp_public_camp(v_code2), 'not_found');
  perform pg_temp.st('B3 and no longer signs up', pg_temp.fs(v_code2, v_mv, pg_temp.kids(v_mv, array['Tom']), 'zz-0050-b3', gen_random_uuid()), 'not_found');
  -- a one-school camp's school can't move under its families
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('B3 a one-school camp with a family can''t move', pg_temp.ed(v_mv, 'shrewsbury', false, null), 'invalid');
  -- ... and with no family it can (v_one_s has families too; make a fresh one)
  v_r := public.camp_add_camp('worcester', false, v_tag || ' Move2', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  perform pg_temp.st('B3 a camp with no family moves', pg_temp.ed((pg_temp.st('B3 setup', v_r, 'ok') ->> 'id')::uuid, 'shrewsbury', false, null), 'ok');
  -- false -> true again after it was cleared: a new second code
  perform pg_temp.st('B3 false -> true again', pg_temp.ed(v_mv, 'worcester', true, null), 'ok');
  if (select c.public_code_2 from public.camps c where c.id = v_mv) is null then
    raise exception 'TEST FAILED: B3 false -> true again made no second code';
  end if;

  -- B3b. a one-school camp can't become a both-schools camp AND move its
  --      school under sign-ups that used its first link; with no sign-ups it may
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.camp_add_camp('worcester', false, v_tag || ' Lo1', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_lo1 := (pg_temp.st('B3b setup camp with a family', v_r, 'ok') ->> 'id')::uuid;
  v_r := public.camp_add_camp('worcester', false, v_tag || ' Lo2', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  v_lo2 := (pg_temp.st('B3b setup camp without a family', v_r, 'ok') ->> 'id')::uuid;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('B3b a Worcester family on Lo1', pg_temp.fs((select c.public_code from public.camps c where c.id = v_lo1), v_lo1,
                       pg_temp.kids(v_lo1, array['Una']), 'zz-0050-b3b', gen_random_uuid()), 'ok');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('B3b one-school -> both AND moved, with a Worcester family', pg_temp.ed(v_lo1, 'shrewsbury', true, null), 'invalid');
  if (select c.location_code from public.camps c where c.id = v_lo1) <> 'worcester'
     or (select c.both_schools from public.camps c where c.id = v_lo1)
     or (select c.public_code_2 from public.camps c where c.id = v_lo1) is not null then
    raise exception 'TEST FAILED: B3b a refused change left the camp different';
  end if;
  -- the same school is fine (the printed link keeps meaning Worcester) ...
  perform pg_temp.st('B3b one-school -> both, same school, with a family', pg_temp.ed(v_lo1, 'worcester', true, null), 'ok');
  -- ... and with no family the camp may become a both-schools camp AND move
  perform pg_temp.st('B3b one-school -> both AND moved, no family', pg_temp.ed(v_lo2, 'shrewsbury', true, null), 'ok');
  if (select c.location_code from public.camps c where c.id = v_lo2) <> 'shrewsbury'
     or (select c.public_code_2 from public.camps c where c.id = v_lo2) is null then
    raise exception 'TEST FAILED: B3b the camp with no family did not become a both-schools camp at Shrewsbury';
  end if;

  -- B3c. a code never equals another camp's code in the other column
  select c.public_code_2 into v_code2 from public.camps c where c.id = v_bs;
  begin
    insert into public.camps (location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on,
                              early_until, min_age, max_age, waiver_text, public_code, created_by_name, updated_by_name)
    values ('worcester', false, v_tag || ' Clash', '09:00', '15:00', v_today, v_today, v_today, 5, 12,
            'I agree to the camp rules.', v_code2, '', '');
    raise exception 'TEST FAILED: B3c a camp took another camp''s second code as its own code';
  exception
    when check_violation then
      get stacked diagnostics v_txt = constraint_name;
      if v_txt is distinct from 'camps_public_codes_distinct' then
        raise exception 'TEST FAILED: B3c the refusal is % (expected camps_public_codes_distinct)', v_txt;
      end if;
  end;
  begin
    update public.camps set public_code = v_code2 where id = v_one_w;
    raise exception 'TEST FAILED: B3c a camp''s code was changed to another camp''s second code';
  exception
    when check_violation then
      get stacked diagnostics v_txt = constraint_name;
      if v_txt is distinct from 'camps_public_codes_distinct' then
        raise exception 'TEST FAILED: B3c the update refusal is % (expected camps_public_codes_distinct)', v_txt;
      end if;
  end;
  if (select c.public_code_2 from public.camps c where c.id = v_bs) is distinct from v_code2 then
    raise exception 'TEST FAILED: B3c the second code changed';
  end if;

  -- ===================================================================
  -- C3. A tkd.signup_school set beforehand is overwritten (the family form
  --     and Fill in always set it themselves)
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  select c.public_code, c.public_code_2 into v_code, v_code2 from public.camps c where c.id = v_bs;
  perform set_config('tkd.signup_school', 'worcester', true);
  v_sub := gen_random_uuid();
  perform pg_temp.st('C3 family form, Shrewsbury link of a one-school camp, pre-set worcester',
    pg_temp.fs((select c.public_code from public.camps c where c.id = v_one_s), v_one_s, pg_temp.kids(v_one_s, array['Vic']), 'zz-0050-c3', v_sub), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: C3 a pre-set worcester changed a Shrewsbury sign-up to %', pg_temp.sch(v_sub);
  end if;
  perform set_config('tkd.signup_school', 'worcester', true);
  v_sub := gen_random_uuid();
  perform pg_temp.st('C3 family form, public_code of the Shrewsbury-stored camp, pre-set worcester',
    pg_temp.fs(v_code, v_bs, pg_temp.kids(v_bs, array['Wes']), 'zz-0050-c3', v_sub), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: C3 a pre-set worcester changed the Shrewsbury link''s sign-up to %', pg_temp.sch(v_sub);
  end if;
  perform set_config('tkd.signup_school', 'shrewsbury', true);
  v_sub := gen_random_uuid();
  perform pg_temp.st('C3 family form, public_code_2, pre-set shrewsbury',
    pg_temp.fs(v_code2, v_bs, pg_temp.kids(v_bs, array['Xia']), 'zz-0050-c3', v_sub), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'worcester' then
    raise exception 'TEST FAILED: C3 a pre-set shrewsbury changed the second link''s sign-up to %', pg_temp.sch(v_sub);
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform set_config('tkd.signup_school', 'worcester', true);
  v_sub := gen_random_uuid();
  perform pg_temp.st('C3 Fill in, school null, pre-set worcester', pg_temp.ds(v_bs, pg_temp.kids(v_bs, array['Yan']), v_sub, null), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: C3 a pre-set worcester changed a Fill in sign-up (school null) to %', pg_temp.sch(v_sub);
  end if;
  perform set_config('tkd.signup_school', 'worcester', true);
  v_sub := gen_random_uuid();
  perform pg_temp.st('C3 Fill in on a one-school camp, school blank, pre-set worcester',
    pg_temp.ds(v_one_s, pg_temp.kids(v_one_s, array['Zed']), v_sub, ''), 'ok');
  if pg_temp.sch(v_sub) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: C3 a pre-set worcester changed a Fill in sign-up on a Shrewsbury camp to %', pg_temp.sch(v_sub);
  end if;
  perform set_config('tkd.signup_school', '', true);

  -- ===================================================================
  -- E1. The roster view and Camper detail
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  select c.id into v_cid from public.camp_campers c where c.camp_id = v_bs and c.first_name = 'Bea';   -- through public_code_2
  begin
    set local role authenticated;
    select r.school into v_txt from public.camp_roster r where r.id = v_cid;
    reset role;
  exception
    when others then
      reset role;
      raise exception 'TEST FAILED: E1 the app could not read camp_roster.school: %', sqlerrm;
  end;
  if v_txt is distinct from 'worcester' then raise exception 'TEST FAILED: E1 roster school of Bea is %', v_txt; end if;
  if (select string_agg(distinct r.school, ',') from public.camp_roster r where r.camp_id = v_bs) is distinct from 'shrewsbury,worcester' then
    raise exception 'TEST FAILED: E1 the camp stored at Shrewsbury has families of both schools, the roster shows %',
      (select string_agg(distinct r.school, ',') from public.camp_roster r where r.camp_id = v_bs);
  end if;
  v_r := pg_temp.st('E1 camper detail', public.camp_camper_detail(v_cid), 'ok');
  if v_r -> 'camper' ->> 'school' is distinct from 'worcester' then
    raise exception 'TEST FAILED: E1 camper detail school: %', v_r -> 'camper' ->> 'school';
  end if;
  -- the roster's last column is school (0039's refunded_cents just before it)
  select a.attname into v_txt from pg_attribute a where a.attrelid = 'public.camp_roster'::regclass and a.attnum > 0
   order by a.attnum desc limit 1;
  if v_txt is distinct from 'school' then raise exception 'TEST FAILED: E1 the roster''s last column is %', v_txt; end if;

  -- ===================================================================
  -- F1. A sign-up's school never changes
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  select s.id, s.version into v_sid, v_ver from public.camp_signups s where s.id = (select c.signup_id from public.camp_campers c where c.id = v_cid);
  select count(*) into v_n from public.change_log l where l.table_name = 'camp_signups' and l.record_id = v_sid;
  update public.camp_signups set school = 'shrewsbury' where id = v_sid;
  if (select s.school from public.camp_signups s where s.id = v_sid) <> 'worcester'
     or (select s.version from public.camp_signups s where s.id = v_sid) <> v_ver
     or (select count(*) from public.change_log l where l.table_name = 'camp_signups' and l.record_id = v_sid) <> v_n then
    raise exception 'TEST FAILED: F1 an update changed the school, the version or the history';
  end if;
  begin
    set local role authenticated;
    update public.camp_signups set school = 'shrewsbury' where id = v_sid;
    reset role;
    raise exception 'TEST FAILED: F1 the app''s role could update camp_signups';
  exception
    when insufficient_privilege then
      reset role;
  end;
  -- a school sent with an insert is ignored; a made-up school setting falls back to the camp's own;
  -- another school than a one-school camp's is refused
  perform set_config('tkd.action', 'zz_0050_test', true);
  perform set_config('tkd.signup_school', '', true);
  insert into public.camp_signups (camp_id, submission_id, parent_name, parent_relation, parent_phone, emergency_name,
                                   emergency_relation, emergency_phone, price_kind, signed_up_on, signature, signed_at,
                                   waiver_text_signed, ack_version, created_by_name, updated_by_name, school)
  values (v_bs, gen_random_uuid(), 'Pat Parent', 'Mother', '5085550100', 'Sam Contact', 'Aunt', '5085550101', 'early', v_today,
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          now(), 'I agree to the camp rules.', 'camp-2026-10-18', '', '', 'worcester')
  returning id into v_sid;
  if (select s.school from public.camp_signups s where s.id = v_sid) <> 'shrewsbury' then
    raise exception 'TEST FAILED: F1 a school sent with an insert was kept';
  end if;
  perform set_config('tkd.signup_school', 'boston', true);
  insert into public.camp_signups (camp_id, submission_id, parent_name, parent_relation, parent_phone, emergency_name,
                                   emergency_relation, emergency_phone, price_kind, signed_up_on, signature, signed_at,
                                   waiver_text_signed, ack_version, created_by_name, updated_by_name)
  values (v_bw, gen_random_uuid(), 'Pat Parent', 'Mother', '5085550100', 'Sam Contact', 'Aunt', '5085550101', 'early', v_today,
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          now(), 'I agree to the camp rules.', 'camp-2026-10-18', '', '')
  returning id into v_sid;
  if (select s.school from public.camp_signups s where s.id = v_sid) <> 'worcester' then
    raise exception 'TEST FAILED: F1 an unknown school setting must fall back to the camp''s own school';
  end if;
  perform set_config('tkd.signup_school', 'shrewsbury', true);
  begin
    insert into public.camp_signups (camp_id, submission_id, parent_name, parent_relation, parent_phone, emergency_name,
                                     emergency_relation, emergency_phone, price_kind, signed_up_on, signature, signed_at,
                                     waiver_text_signed, ack_version, created_by_name, updated_by_name)
    values (v_one_w, gen_random_uuid(), 'Pat Parent', 'Mother', '5085550100', 'Sam Contact', 'Aunt', '5085550101', 'early', v_today,
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            now(), 'I agree to the camp rules.', 'camp-2026-10-18', '', '');
    raise exception 'TEST FAILED: F1 a Shrewsbury sign-up on a camp for Worcester only was saved';
  exception
    when check_violation then null;
  end;
  perform set_config('tkd.signup_school', '', true);
  perform set_config('tkd.action', '', true);

  -- ===================================================================
  -- H1. Finance is unchanged: a camper of the other school paid at that
  --     school's desk counts there
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  select c.id, c.version into v_cid, v_ver from public.camp_campers c where c.camp_id = v_bs and c.first_name = 'Bea';
  v_r := pg_temp.st('H1 mark paid at Worcester', public.camp_mark_paid(v_cid, v_ver, 'worcester'), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('H1 Worcester daily report', public.finance_day('worcester', v_today), 'ok');
  select x into v_x from jsonb_array_elements(v_r -> 'items') as x where (x ->> 'payment_id')::uuid = v_pay;
  if v_x is null or v_x ->> 'source' <> 'camp' or v_x ->> 'state' <> 'counted' or v_x ->> 'first_name' <> 'Bea' then
    raise exception 'TEST FAILED: H1 the payment is not counted at Worcester: %', v_x;
  end if;
  v_r := pg_temp.st('H1 Shrewsbury daily report', public.finance_day('shrewsbury', v_today), 'ok');
  if exists (select 1 from jsonb_array_elements(v_r -> 'items') as x where (x ->> 'payment_id')::uuid = v_pay) then
    raise exception 'TEST FAILED: H1 the payment is also counted at Shrewsbury';
  end if;

  -- ===================================================================
  -- G1. Rights and rules
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  -- the staff function: signed-in staff only, one version
  select p.oid, p.prosecdef, p.proconfig, p.proacl into v_fn
    from pg_proc p
   where p.oid = to_regprocedure('public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer, text)');
  if v_fn.oid is null or v_fn.proconfig is distinct from array['search_path=""'] or v_fn.prosecdef is not true
     or has_function_privilege('anon', v_fn.oid, 'EXECUTE')
     or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 0)
     or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 'service_role'::regrole)
     or has_function_privilege('camps_registrar', v_fn.oid, 'EXECUTE')
     or not has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') then
    raise exception 'TEST FAILED: G1 camp_staff_signup must be security definer, search_path = '''', signed-in staff only';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'camp_staff_signup') <> 1 then
    raise exception 'TEST FAILED: G1 there must be exactly one camp_staff_signup';
  end if;
  -- the two public functions: camps_registrar only, security definer
  for v_fname in select unnest(array['camp_public_camp(text)',
                                     'camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)']) loop
    select p.oid, p.prosecdef, p.proconfig, p.proacl into v_fn from pg_proc p where p.oid = to_regprocedure('public.' || v_fname);
    if v_fn.oid is null or not v_fn.prosecdef or v_fn.proconfig is distinct from array['search_path=""']
       or not has_function_privilege('camps_registrar', v_fn.oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
       or has_function_privilege('anon', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 0)
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 'service_role'::regrole) then
      raise exception 'TEST FAILED: G1 % must stay for camps_registrar only', v_fname;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('camp_public_camp', 'camp_public_signup')) <> 2 then
    raise exception 'TEST FAILED: G1 exactly one camp_public_camp and one camp_public_signup';
  end if;
  -- the two trigger functions: internal, nobody may run them
  for v_fname in select unnest(array['camps_keep_public_code_2()', 'camp_signups_set_school()']) loop
    select p.oid, p.prosecdef, p.proconfig, p.proacl into v_fn from pg_proc p where p.oid = to_regprocedure('public.' || v_fname);
    if v_fn.oid is null or v_fn.prosecdef or v_fn.proconfig is distinct from array['search_path=""']
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee <> 'postgres'::regrole) then
      raise exception 'TEST FAILED: G1 % must be internal (not definer, search_path = '''', only its owner)', v_fname;
    end if;
  end loop;
  -- the two columns: the app reads them, nobody else, no write right for anyone
  if not has_column_privilege('authenticated', 'public.camp_signups', 'school', 'SELECT')
     or not has_column_privilege('authenticated', 'public.camps', 'public_code_2', 'SELECT')
     or has_column_privilege('anon', 'public.camp_signups', 'school', 'SELECT')
     or has_column_privilege('anon', 'public.camps', 'public_code_2', 'SELECT')
     or has_column_privilege('camps_registrar', 'public.camp_signups', 'school', 'SELECT')
     or has_column_privilege('camps_registrar', 'public.camps', 'public_code_2', 'SELECT')
     or has_column_privilege('service_role', 'public.camp_signups', 'school', 'SELECT')
     or has_column_privilege('authenticated', 'public.camp_signups', 'school', 'UPDATE')
     or has_column_privilege('authenticated', 'public.camp_signups', 'school', 'INSERT')
     or has_column_privilege('authenticated', 'public.camps', 'public_code_2', 'UPDATE')
     or has_column_privilege('authenticated', 'public.camps', 'public_code_2', 'INSERT') then
    raise exception 'TEST FAILED: G1 the rights on camp_signups.school / camps.public_code_2';
  end if;
  if (select t.attnotnull from pg_attribute t where t.attrelid = 'public.camp_signups'::regclass and t.attname = 'school') is not true
     or (select t.attnotnull from pg_attribute t where t.attrelid = 'public.camps'::regclass and t.attname = 'public_code_2') is not false then
    raise exception 'TEST FAILED: G1 school must be not null, public_code_2 may be empty';
  end if;
  if (select count(*) from pg_constraint c where c.conrelid = 'public.camps'::regclass
        and c.conname in ('camps_public_code_2_key', 'camps_public_code_2_check', 'camps_public_code_2_both_check')) <> 3
     or not exists (select 1 from pg_constraint c where c.conrelid = 'public.camp_signups'::regclass and c.conname = 'camp_signups_school_fk') then
    raise exception 'TEST FAILED: G1 the table rules of the two columns are missing';
  end if;
  -- the roster view: still security invoker, authenticated only
  if not exists (select 1 from pg_class c where c.oid = 'public.camp_roster'::regclass and 'security_invoker=true' = any (c.reloptions))
     or has_table_privilege('anon', 'public.camp_roster', 'SELECT') or has_table_privilege('camps_registrar', 'public.camp_roster', 'SELECT')
     or not has_table_privilege('authenticated', 'public.camp_roster', 'SELECT') then
    raise exception 'TEST FAILED: G1 camp_roster rights';
  end if;
end
$$;

select 'ALL 0050 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
