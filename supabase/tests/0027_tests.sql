-- =====================================================================
-- 0027_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0027_camps_edit_guard.sql (Edit
--   camp refuses a save that would leave an ACTIVE camper holding an
--   extra the camp's rules no longer allow - rulebook v0.720). It checks,
--   in this order:
--     G1  the refusals Edit camp already had still answer as before
--         (kind "day", "extra", "extra_day")
--     G2  case 1, per-day extra: removing a day nobody picked makes a
--         camper come every day of that Monday-Sunday week while they
--         have a "not for all-days campers" pizza that week -> refused
--         ("extra_included"); a camper who comes only part of the week
--         doesn't count; once that camper is WITHDRAWN the same edit
--         works; adding a day works; a normal edit works
--     G3  case 1, once extra: removing a day makes campers come every day
--         of the camp while they have a once party -> refused; the count
--         is right; works once they are withdrawn
--     G4  case 2: switching "not for all-days campers" ON for a per-day
--         and a once extra -> refused; the first extra in the camp's order
--         is named; works once the campers are withdrawn
--     G5  case 3: changing an extra's "per" (once <-> day) while an
--         active camper chose it -> refused ("extra_per"); an extra nobody
--         chose may change; works once the camper is withdrawn
--     G7  WITHDRAWN campers' rows that would no longer fit are removed
--         (and logged) by the save that breaks them: (a) a "per" change,
--         (b) "included" - per-day and once - after a day is removed,
--         (c) a narrowed only_on list; an active camper's rows stay; after
--         Restore every camper's extras pass the extra rules
--         (camp_camper_extras_are_ok)
--     G6  rights: no session -> no_access, the desk -> not_allowed; anon
--         can't run camp_update_camp, authenticated can; security
--         definer, search_path = ''
--   After every refusal it checks that NOTHING was written (the camp, its
--   days, extras, grid, campers' rows and the history are byte for byte
--   the same).
--   It makes its own camps called "zz test 1a2b3c4d ...", so it works
--   whatever is already in the database, and on any weekday (every test
--   camp starts on a Monday 15-21 days from now).
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test camps, sign-ups, history
--   rows, test sessions). NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0022_tests.sql: a pretend login token per session in
--   request.jwt.claims. A1 = admin unlocked, D1 = desk unlocked. The
--   family form's function is called as the SQL Editor's own role (it
--   runs as its owner, so the answers are the same as for
--   camps_registrar).
--
-- BEFORE YOU RUN IT
--   1. 0013, 0017, 0022 and 0027 are applied. You need TWO existing,
--      ACTIVE staff rows: an admin and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations (some removals are
--      tested to be REFUSED, others really happen to test camps).
--      Everything is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0027 TESTS PASSED".
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
  v_today date := public.testing_today();
  -- a Monday 15-21 days from now: every test camp starts on it
  v_mon   date := date_trunc('week', (public.testing_today() + 14)::timestamp)::date + 7;
  -- every test camp: two weeks of Mon-Wed (days 1-3 = week 1, 4-6 = week 2)
  v_days  date[];
  v_extras jsonb := '[{"name": "Pizza", "price_cents": 500, "per": "day", "not_for_all_days": true},
                      {"name": "Party", "price_cents": 1000, "per": "once", "not_for_all_days": true},
                      {"name": "Lunch", "price_cents": 700, "per": "day", "not_for_all_days": false},
                      {"name": "Shirt", "price_cents": 1500, "per": "once", "not_for_all_days": false}]';

  v_r    jsonb;
  v_x    jsonb;
  v_snap text;
  v_n    integer;
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid; v_e5 uuid;
  v_mark bigint;
  v_ned uuid; v_oli uuid; v_pam uuid; v_quin uuid; v_rex uuid;
  v_rex_rows uuid[];
  v_ids      uuid[];
  v_k        uuid;
  -- campers
  v_amy uuid; v_abe uuid; v_bea uuid; v_cal uuid; v_dot uuid;
  v_fay uuid; v_gus uuid; v_hal uuid; v_jo uuid; v_kim uuid;
  v_fn record;
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
  if to_regprocedure('public.camp_week_size(date[])') is null then
    raise exception 'TEST SETUP: public.camp_week_size is missing (is 0022 applied?)';
  end if;
  if extract(isodow from v_mon) <> 1 or v_mon < v_today + 15 then
    raise exception 'TEST SETUP: % is not a Monday 15+ days from now', v_mon;
  end if;
  v_days := array[v_mon, v_mon + 1, v_mon + 2, v_mon + 7, v_mon + 8, v_mon + 9];

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
  --   g(n)          0022_tests.sql's grid of n rows
  --   mk(name, days, extras)  Add camp as the caller (grid 1 ... W); id back
  --   dys(camp, i[])          the camp's i-th day ids, in date order
  --   xid(camp, n)            the id of the camp's extra called n
  --   ex(extra, day_ids)      an extra choice (no days = a once extra)
  --   su(camp, first, i[], extras)  a family sign-up of one child on the
  --                 camp's days i[] (sends the right total); camper id back
  --   ds(camp)      the camp's dates now, sorted
  --   exs(camp)     the camp's extras now, as Edit camp sends them (with id)
  --   setx(list, name, key, value)  that extra's key changed
  --   withoutx(list, name)          the list without that extra
  --   ed(camp, days, extras, name)  Edit camp with everything else as saved
  --   wd(camper)    Withdraw (as the caller)
  --   snap(camp)    an md5 of everything Edit camp could write + the history size
  --   st(label, answer, status)     fails unless answer.status = status
  --   eq(label, answer, expected)   fails unless answer = expected exactly
  execute $f$
    create function pg_temp.g(p_n integer) returns jsonb language sql as $b$
      select jsonb_agg(jsonb_build_object(
               'day_count', k,
               'member_early_cents',      case k when 1 then 7500 when 2 then 14000 when 3 then 19500 when 4 then 26000 when 5 then 27500 else k * 6000 end,
               'member_regular_cents',    case k when 1 then 8000 when 2 then 15000 when 3 then 21000 when 4 then 28000 when 5 then 32500 else k * 6500 end,
               'nonmember_early_cents',   case k when 1 then 8500 when 2 then 15000 when 3 then 20500 when 4 then 27000 when 5 then 28500 else k * 6800 end,
               'nonmember_regular_cents', case k when 1 then 9000 when 2 then 16000 when 3 then 22000 when 4 then 29000 when 5 then 33500 else k * 7000 end)
             order by k)
        from generate_series(1, p_n) as k;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.mk(p_name text, p_days date[], p_extras jsonb) returns uuid language plpgsql as $b$
    declare
      v_r jsonb;
    begin
      v_r := public.camp_add_camp('worcester', false, p_name, p_days, '09:00', '15:00', public.testing_today() - 3,
                                  least(public.testing_today() + 5, (select max(x) from unnest(p_days) as x)),
                                  public.testing_today() + 5, 5, 12,
                                  pg_temp.g(public.camp_week_size(p_days)), p_extras, null, 'I agree to the camp rules.');
      if v_r ->> 'status' is distinct from 'ok' then
        raise exception 'TEST SETUP: camp_add_camp % answered %', p_name, v_r;
      end if;
      return (v_r ->> 'id')::uuid;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.dys(p_camp uuid, p_i integer[]) returns uuid[] language sql as $b$
      select array(select d.id
                     from unnest(p_i) with ordinality as u(x, n)
                     join lateral (select d.id from public.camp_days d where d.camp_id = p_camp
                                    order by d.day offset u.x - 1 limit 1) as d on true
                    order by u.n);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.xid(p_camp uuid, p_name text) returns uuid language sql as $b$
      select e.id from public.camp_extras e where e.camp_id = p_camp and e.name = p_name;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ex(p_extra uuid, p_days uuid[]) returns jsonb language sql as $b$
      select jsonb_build_object('extra_id', p_extra, 'day_ids', to_jsonb(coalesce(p_days, '{}'::uuid[])));
    $b$;
  $f$;
  execute $f$
    create function pg_temp.su(p_camp uuid, p_first text, p_i integer[], p_extras jsonb) returns uuid language plpgsql as $b$
    declare
      v_child jsonb;
      v_r     jsonb;
      v_total integer := 0;
      v_try   integer;
    begin
      v_child := jsonb_build_array(jsonb_build_object('first_name', p_first, 'last_name', 'Guard', 'age', 8, 'member', true,
                                                      'day_ids', to_jsonb(pg_temp.dys(p_camp, p_i)), 'extras', p_extras));
      -- the first try sends 0 cents; the form answers price_changed with
      -- the right total, which the second try sends
      for v_try in 1 .. 2 loop
        select public.camp_public_signup(c.public_code, 'zz-0027-' || gen_random_uuid()::text, gen_random_uuid(), v_child,
                 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
                 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                 'camp-2026-10-18', md5(c.waiver_text), v_total)
          into v_r
          from public.camps c where c.id = p_camp;
        exit when v_r ->> 'status' = 'ok';
        if v_r ->> 'status' is distinct from 'price_changed' then
          raise exception 'TEST SETUP: sign-up of % answered %', p_first, v_r;
        end if;
        v_total := (v_r ->> 'new_total_cents')::integer;
      end loop;
      if v_r ->> 'status' is distinct from 'ok' then
        raise exception 'TEST SETUP: sign-up of % answered %', p_first, v_r;
      end if;
      return (select c.id from public.camp_campers c join public.camp_signups s on s.id = c.signup_id
               where s.reference = v_r ->> 'reference' and c.position = 1);
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ds(p_camp uuid) returns date[] language sql as $b$
      select array(select d.day from public.camp_days d where d.camp_id = p_camp order by d.day);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.exs(p_camp uuid) returns jsonb language sql as $b$
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'name', e.name, 'price_cents', e.price_cents, 'per', e.per,
               'not_for_all_days', e.not_for_all_days,
               'only_on', coalesce((select jsonb_agg(to_char(o.d, 'YYYY-MM-DD') order by o.d) from unnest(e.only_on) as o(d)),
                                   '[]'::jsonb))
             order by e.sort), '[]'::jsonb)
        from public.camp_extras e where e.camp_id = p_camp;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.setx(p_list jsonb, p_name text, p_key text, p_val jsonb) returns jsonb language sql as $b$
      select jsonb_agg(case when x.value ->> 'name' = p_name then jsonb_set(x.value, array[p_key], p_val) else x.value end
                       order by x.n)
        from jsonb_array_elements(p_list) with ordinality as x(value, n);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.withoutx(p_list jsonb, p_name text) returns jsonb language sql as $b$
      select coalesce(jsonb_agg(x.value order by x.n) filter (where x.value ->> 'name' <> p_name), '[]'::jsonb)
        from jsonb_array_elements(p_list) with ordinality as x(value, n);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ed(p_camp uuid, p_days date[], p_extras jsonb, p_name text) returns jsonb language sql as $b$
      select public.camp_update_camp(c.id, c.version, c.location_code, c.both_schools, coalesce(p_name, c.name), p_days,
                                     c.start_time, c.end_time, c.signup_opens_on, c.signup_closes_on, c.early_until,
                                     c.min_age, c.max_age, pg_temp.g(public.camp_week_size(p_days)), p_extras,
                                     c.description, c.waiver_text)
        from public.camps c where c.id = p_camp;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.wd(p_camper uuid) returns jsonb language plpgsql as $b$
    declare
      v_r jsonb;
    begin
      select public.camp_withdraw_camper(c.id, c.version) into v_r from public.camp_campers c where c.id = p_camper;
      if v_r ->> 'status' is distinct from 'ok' then
        raise exception 'TEST SETUP: withdraw answered %', v_r;
      end if;
      return v_r;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.snap(p_camp uuid) returns text language sql as $b$
      select md5(
           coalesce((select to_jsonb(c)::text from public.camps c where c.id = p_camp), '')
        || coalesce((select string_agg(to_jsonb(d)::text, ',' order by d.day) from public.camp_days d where d.camp_id = p_camp), '')
        || coalesce((select string_agg(to_jsonb(e)::text, ',' order by e.sort) from public.camp_extras e where e.camp_id = p_camp), '')
        || coalesce((select string_agg(to_jsonb(p)::text, ',' order by p.day_count) from public.camp_prices p where p.camp_id = p_camp), '')
        || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id)
                       from public.camp_camper_extras x join public.camp_campers k on k.id = x.camper_id
                      where k.camp_id = p_camp), '')
        || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id)
                       from public.camp_camper_days x join public.camp_campers k on k.id = x.camper_id
                      where k.camp_id = p_camp), '')
        || coalesce((select string_agg(to_jsonb(k)::text, ',' order by k.id) from public.camp_campers k where k.camp_id = p_camp), '')
        || (select count(*) from public.change_log)::text);
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
    create function pg_temp.xok(p_camper uuid) returns boolean language sql as $b$
      -- the camper's extra rows as Edit details would send them, through
      -- the extra rules (camp_camper_extras_are_ok, 0022)
      select public.camp_camper_extras_are_ok(k.camp_id,
               array(select cd.day_id from public.camp_camper_days cd where cd.camper_id = k.id),
               coalesce((select jsonb_agg(jsonb_build_object('extra_id', g.extra_id, 'day_ids', g.day_ids))
                           from (select x.extra_id,
                                        coalesce(jsonb_agg(x.day_id) filter (where x.day_id is not null), '[]'::jsonb) as day_ids
                                   from public.camp_camper_extras x where x.camper_id = k.id
                                  group by x.extra_id) as g), '[]'::jsonb))
        from public.camp_campers k where k.id = p_camper;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.rows(p_camper uuid) returns uuid[] language sql as $b$
      select array(select x.id from public.camp_camper_extras x where x.camper_id = p_camper order by x.id);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.logged(p_mark bigint, p_ids uuid[]) returns integer language sql as $b$
      -- removals of these camper-extra rows logged by Edit camp since p_mark, in ONE batch
      select case when count(distinct l.batch_id) = 1 then count(*)::integer else -1 end
        from public.change_log l
       where l.id > p_mark and l.table_name = 'camp_camper_extras' and l.op = 'delete'
         and l.action = 'camp_update_camp' and l.record_id = any (p_ids);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.eq(p_label text, p_got jsonb, p_want jsonb) returns jsonb language plpgsql as $b$
    begin
      if p_got is distinct from p_want then
        raise exception 'TEST FAILED: % expected %, got %', p_label, p_want, p_got;
      end if;
      return p_got;
    end;
    $b$;
  $f$;

  -- -------------------------------------------------------------------
  -- The test camps and campers (made by the admin; signed up through the
  -- family form, so the table's own R6 rule checked every choice)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_e1 := pg_temp.mk(v_tag || ' Week pizza', v_days, v_extras);
  v_e2 := pg_temp.mk(v_tag || ' Camp party', v_days, v_extras);
  v_e3 := pg_temp.mk(v_tag || ' Switch on', v_days, v_extras);
  v_e4 := pg_temp.mk(v_tag || ' Per change', v_days, v_extras);
  v_e5 := pg_temp.mk(v_tag || ' Clean up', v_days, v_extras);
  perform set_config('request.jwt.claims', '', true);
  -- E1: Amy Mon1 Tue1 Mon2 + pizza Mon1; Abe Mon1 Mon2 + pizza both days
  v_amy := pg_temp.su(v_e1, 'Amy', array[1, 2, 4], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e1, 'Pizza'), pg_temp.dys(v_e1, array[1]))));
  v_abe := pg_temp.su(v_e1, 'Abe', array[1, 4], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e1, 'Pizza'), pg_temp.dys(v_e1, array[1, 4]))));
  -- E2: Bea and Cal every day but Wed2 + the once party; Dot misses Tue2 and Wed2
  v_bea := pg_temp.su(v_e2, 'Bea', array[1, 2, 3, 4, 5], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e2, 'Party'), null)));
  v_cal := pg_temp.su(v_e2, 'Cal', array[1, 2, 3, 4, 5], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e2, 'Party'), null)));
  v_dot := pg_temp.su(v_e2, 'Dot', array[1, 2, 3, 4], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e2, 'Party'), null)));
  -- E3: Fay all of week 1 + Mon2, lunch Mon1 and Mon2; Gus every day + shirt;
  --     Hal Mon1 only, lunch + shirt
  v_fay := pg_temp.su(v_e3, 'Fay', array[1, 2, 3, 4], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e3, 'Lunch'), pg_temp.dys(v_e3, array[1, 4]))));
  v_gus := pg_temp.su(v_e3, 'Gus', array[1, 2, 3, 4, 5, 6], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e3, 'Shirt'), null)));
  v_hal := pg_temp.su(v_e3, 'Hal', array[1], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e3, 'Lunch'), pg_temp.dys(v_e3, array[1])),
                                                                pg_temp.ex(pg_temp.xid(v_e3, 'Shirt'), null)));
  -- E4: Jo Mon1 Tue1 + shirt; Kim Mon1 Tue1 + lunch both days
  v_jo  := pg_temp.su(v_e4, 'Jo', array[1, 2], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e4, 'Shirt'), null)));
  v_kim := pg_temp.su(v_e4, 'Kim', array[1, 2], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e4, 'Lunch'), pg_temp.dys(v_e4, array[1, 2]))));
  -- E5 (G7): Ned Mon1 Tue1 + shirt; Oli Mon1 Tue1 Mon2 + pizza Mon1; Pam
  --     every day but Wed1 + the once party; Quin Mon1 Tue1 + lunch both
  --     days; Rex (stays ACTIVE) Tue1 + lunch Tue1
  v_ned  := pg_temp.su(v_e5, 'Ned', array[1, 2], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e5, 'Shirt'), null)));
  v_oli  := pg_temp.su(v_e5, 'Oli', array[1, 2, 4], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e5, 'Pizza'), pg_temp.dys(v_e5, array[1]))));
  v_pam  := pg_temp.su(v_e5, 'Pam', array[1, 2, 4, 5, 6], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e5, 'Party'), null)));
  v_quin := pg_temp.su(v_e5, 'Quin', array[1, 2], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e5, 'Lunch'), pg_temp.dys(v_e5, array[1, 2]))));
  v_rex  := pg_temp.su(v_e5, 'Rex', array[2], jsonb_build_array(pg_temp.ex(pg_temp.xid(v_e5, 'Lunch'), pg_temp.dys(v_e5, array[2]))));
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- ===================================================================
  -- G1. The refusals Edit camp already had answer as before
  -- ===================================================================
  v_snap := pg_temp.snap(v_e1);
  -- removing Mon1 (Amy and Abe picked it): kind "day", Abe named first (last name, first name)
  perform pg_temp.eq('G1 remove a picked day', pg_temp.ed(v_e1, v_days[2:6], pg_temp.exs(v_e1), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'day', 'day', v_mon, 'first_name', 'Abe', 'last_name', 'Guard', 'more', 1));
  -- removing the pizza (2 active campers chose it): kind "extra"
  perform pg_temp.eq('G1 remove a chosen extra', pg_temp.ed(v_e1, v_days, pg_temp.withoutx(pg_temp.exs(v_e1), 'Pizza'), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra', 'extra_name', 'Pizza', 'count', 2));
  -- the pizza offered only from Tue1 on (both chose it on Mon1): kind "extra_day"
  perform pg_temp.eq('G1 narrow an extra''s days', pg_temp.ed(v_e1, v_days,
      pg_temp.setx(pg_temp.exs(v_e1), 'Pizza', 'only_on',
                   (select jsonb_agg(to_char(x.d, 'YYYY-MM-DD') order by x.d) from unnest(v_days[2:6]) as x(d))), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra_day', 'extra_name', 'Pizza', 'day', v_mon, 'count', 2));
  if pg_temp.snap(v_e1) <> v_snap then raise exception 'TEST FAILED: G1 a refused edit wrote something'; end if;

  -- ===================================================================
  -- G2. Case 1, per-day extra: removing a day nobody picked
  -- ===================================================================
  -- removing Wed1: Amy now comes every day of week 1 and has a pizza on
  -- Mon1 -> refused. Abe (Mon1 only that week) doesn't count.
  perform pg_temp.eq('G2 remove Wed1', pg_temp.ed(v_e1, array[v_days[1], v_days[2], v_days[4], v_days[5], v_days[6]],
                                                  pg_temp.exs(v_e1), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra_included', 'extra_name', 'Pizza', 'count', 1));
  if pg_temp.snap(v_e1) <> v_snap or not (v_mon + 2 = any (pg_temp.ds(v_e1))) then
    raise exception 'TEST FAILED: G2 the refused edit wrote something (or Wed1 is gone)';
  end if;
  -- removing Wed2 instead (nobody picked it; no pizza in week 2 becomes
  -- included - Amy and Abe come only Mon2 that week): fine
  v_r := pg_temp.st('G2 remove Wed2', pg_temp.ed(v_e1, v_days[1:5], pg_temp.exs(v_e1), null), 'ok');
  if pg_temp.ds(v_e1) <> v_days[1:5] then raise exception 'TEST FAILED: G2 Wed2 was not removed'; end if;
  -- Amy withdrawn: removing Wed1 now works (Abe comes only part of week 1)
  perform pg_temp.wd(v_amy);
  v_r := pg_temp.st('G2 remove Wed1 with Amy withdrawn',
           pg_temp.ed(v_e1, array[v_days[1], v_days[2], v_days[4], v_days[5]], pg_temp.exs(v_e1), null), 'ok');
  if pg_temp.ds(v_e1) <> array[v_days[1], v_days[2], v_days[4], v_days[5]] then
    raise exception 'TEST FAILED: G2 Wed1 was not removed';
  end if;
  -- adding a day still works (Wed1 back, and a Thursday in week 1: W = 4)
  select c.version into v_n from public.camps c where c.id = v_e1;
  v_r := pg_temp.st('G2 add days', pg_temp.ed(v_e1, array[v_days[1], v_days[2], v_days[3], v_mon + 3, v_days[4], v_days[5]],
                                               pg_temp.exs(v_e1), null), 'ok');
  if (v_r ->> 'version')::integer <> v_n + 1 or cardinality(pg_temp.ds(v_e1)) <> 6
     or (select max(p.day_count) from public.camp_prices p where p.camp_id = v_e1) <> 4 then
    raise exception 'TEST FAILED: G2 add days answered % (grid / days not as expected)', v_r;
  end if;
  -- a normal edit (a new name, the pizza's price) still works
  v_r := pg_temp.st('G2 normal edit', pg_temp.ed(v_e1, pg_temp.ds(v_e1),
           pg_temp.setx(pg_temp.exs(v_e1), 'Pizza', 'price_cents', '600'), v_tag || ' Week pizza renamed'), 'ok');
  if (select c.name from public.camps c where c.id = v_e1) <> v_tag || ' Week pizza renamed'
     or (select e.price_cents from public.camp_extras e where e.id = pg_temp.xid(v_e1, 'Pizza')) <> 600 then
    raise exception 'TEST FAILED: G2 the normal edit was not saved';
  end if;

  -- ===================================================================
  -- G3. Case 1, once extra: removing a day makes campers come every day
  --     of the camp
  -- ===================================================================
  v_snap := pg_temp.snap(v_e2);
  -- removing Wed2: Bea and Cal now come every camp day and have the party
  -- (a once "not for all-days campers" extra); Dot misses Tue2 -> 2
  perform pg_temp.eq('G3 remove Wed2', pg_temp.ed(v_e2, v_days[1:5], pg_temp.exs(v_e2), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra_included', 'extra_name', 'Party', 'count', 2));
  if pg_temp.snap(v_e2) <> v_snap then raise exception 'TEST FAILED: G3 the refused edit wrote something'; end if;
  perform pg_temp.wd(v_bea);
  v_snap := pg_temp.snap(v_e2);
  perform pg_temp.eq('G3 remove Wed2 with Bea withdrawn', pg_temp.ed(v_e2, v_days[1:5], pg_temp.exs(v_e2), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra_included', 'extra_name', 'Party', 'count', 1));
  if pg_temp.snap(v_e2) <> v_snap or cardinality(pg_temp.ds(v_e2)) <> 6 then
    raise exception 'TEST FAILED: G3 the refused edit wrote something';
  end if;
  perform pg_temp.wd(v_cal);
  perform pg_temp.st('G3 remove Wed2 with Bea and Cal withdrawn', pg_temp.ed(v_e2, v_days[1:5], pg_temp.exs(v_e2), null), 'ok');
  if pg_temp.ds(v_e2) <> v_days[1:5] then raise exception 'TEST FAILED: G3 Wed2 was not removed'; end if;

  -- ===================================================================
  -- G4. Case 2: "not for all-days campers" switched ON
  -- ===================================================================
  v_snap := pg_temp.snap(v_e3);
  -- the lunch (per day): Fay comes all of week 1 and has it on Mon1 -> 1
  -- (Hal comes only Mon1)
  perform pg_temp.eq('G4 lunch switched on', pg_temp.ed(v_e3, v_days, pg_temp.setx(pg_temp.exs(v_e3), 'Lunch', 'not_for_all_days', 'true'), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra_included', 'extra_name', 'Lunch', 'count', 1));
  -- the shirt (once): Gus comes every day -> 1 (Hal comes one day)
  perform pg_temp.eq('G4 shirt switched on', pg_temp.ed(v_e3, v_days, pg_temp.setx(pg_temp.exs(v_e3), 'Shirt', 'not_for_all_days', 'true'), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra_included', 'extra_name', 'Shirt', 'count', 1));
  -- both: the first in the camp's order (Lunch before Shirt) is named
  perform pg_temp.eq('G4 both switched on', pg_temp.ed(v_e3, v_days,
      pg_temp.setx(pg_temp.setx(pg_temp.exs(v_e3), 'Shirt', 'not_for_all_days', 'true'), 'Lunch', 'not_for_all_days', 'true'), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra_included', 'extra_name', 'Lunch', 'count', 1));
  if pg_temp.snap(v_e3) <> v_snap
     or (select bool_or(e.not_for_all_days) from public.camp_extras e where e.camp_id = v_e3 and e.name in ('Lunch', 'Shirt')) then
    raise exception 'TEST FAILED: G4 a refused edit wrote something';
  end if;
  -- withdrawn: both switches work (Hal, partial, keeps his rows)
  perform pg_temp.wd(v_fay);
  perform pg_temp.st('G4 lunch switched on with Fay withdrawn',
    pg_temp.ed(v_e3, v_days, pg_temp.setx(pg_temp.exs(v_e3), 'Lunch', 'not_for_all_days', 'true'), null), 'ok');
  perform pg_temp.wd(v_gus);
  perform pg_temp.st('G4 shirt switched on with Gus withdrawn',
    pg_temp.ed(v_e3, v_days, pg_temp.setx(pg_temp.exs(v_e3), 'Shirt', 'not_for_all_days', 'true'), null), 'ok');
  if (select bool_and(e.not_for_all_days) from public.camp_extras e where e.camp_id = v_e3 and e.name in ('Lunch', 'Shirt')) is not true
     or (select count(*) from public.camp_camper_extras x where x.camper_id = v_hal) <> 2 then
    raise exception 'TEST FAILED: G4 the switches were not saved (or Hal lost his extras)';
  end if;

  -- ===================================================================
  -- G5. Case 3: an extra's "per" changes (once <-> day)
  -- ===================================================================
  v_snap := pg_temp.snap(v_e4);
  perform pg_temp.eq('G5 shirt once -> day', pg_temp.ed(v_e4, v_days, pg_temp.setx(pg_temp.exs(v_e4), 'Shirt', 'per', '"day"'), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra_per', 'extra_name', 'Shirt', 'count', 1));
  perform pg_temp.eq('G5 lunch day -> once', pg_temp.ed(v_e4, v_days, pg_temp.setx(pg_temp.exs(v_e4), 'Lunch', 'per', '"once"'), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra_per', 'extra_name', 'Lunch', 'count', 1));
  -- "per" is checked before "included": the lunch switched to once AND
  -- "not for all-days campers" answers extra_per
  perform pg_temp.eq('G5 per before included', pg_temp.ed(v_e4, v_days,
      pg_temp.setx(pg_temp.setx(pg_temp.exs(v_e4), 'Lunch', 'per', '"once"'), 'Lunch', 'not_for_all_days', 'true'), null),
    jsonb_build_object('status', 'not_empty', 'kind', 'extra_per', 'extra_name', 'Lunch', 'count', 1));
  if pg_temp.snap(v_e4) <> v_snap
     or (select e.per from public.camp_extras e where e.id = pg_temp.xid(v_e4, 'Shirt')) <> 'once'
     or (select e.per from public.camp_extras e where e.id = pg_temp.xid(v_e4, 'Lunch')) <> 'day' then
    raise exception 'TEST FAILED: G5 a refused edit wrote something';
  end if;
  -- an extra nobody chose (the party) may change its "per"
  perform pg_temp.st('G5 party once -> day (nobody chose it)',
    pg_temp.ed(v_e4, v_days, pg_temp.setx(pg_temp.exs(v_e4), 'Party', 'per', '"day"'), null), 'ok');
  if (select e.per from public.camp_extras e where e.id = pg_temp.xid(v_e4, 'Party')) <> 'day' then
    raise exception 'TEST FAILED: G5 the party''s per was not saved';
  end if;
  -- Jo withdrawn: the shirt may change
  perform pg_temp.wd(v_jo);
  perform pg_temp.st('G5 shirt once -> day with Jo withdrawn',
    pg_temp.ed(v_e4, v_days, pg_temp.setx(pg_temp.exs(v_e4), 'Shirt', 'per', '"day"'), null), 'ok');
  if (select e.per from public.camp_extras e where e.id = pg_temp.xid(v_e4, 'Shirt')) <> 'day' then
    raise exception 'TEST FAILED: G5 the shirt''s per was not saved';
  end if;

  -- ===================================================================
  -- G7. Withdrawn campers' rows that would no longer fit go with the save
  -- ===================================================================
  perform pg_temp.wd(v_ned);
  perform pg_temp.wd(v_oli);
  perform pg_temp.wd(v_pam);
  perform pg_temp.wd(v_quin);
  v_rex_rows := pg_temp.rows(v_rex);
  if cardinality(v_rex_rows) <> 1 then raise exception 'TEST SETUP: G7 Rex should have one lunch row'; end if;
  -- (a) the shirt once -> day: Ned's (withdrawn) shirt row goes, logged
  v_ids := pg_temp.rows(v_ned);
  select max(l.id) into v_mark from public.change_log l;
  perform pg_temp.st('G7 (a) shirt once -> day', pg_temp.ed(v_e5, v_days, pg_temp.setx(pg_temp.exs(v_e5), 'Shirt', 'per', '"day"'), null), 'ok');
  if cardinality(v_ids) <> 1 or cardinality(pg_temp.rows(v_ned)) <> 0 or pg_temp.logged(v_mark, v_ids) <> 1 then
    raise exception 'TEST FAILED: G7 (a) Ned''s shirt row: before %, now %, logged %', v_ids, pg_temp.rows(v_ned), pg_temp.logged(v_mark, v_ids);
  end if;
  -- (b) Wed1 removed (nobody picked it): Oli now comes all of week 1 with
  -- a pizza on Mon1 (per-day), Pam now comes every camp day with the once
  -- party - both withdrawn, so both rows go, logged
  v_ids := pg_temp.rows(v_oli) || pg_temp.rows(v_pam);
  select max(l.id) into v_mark from public.change_log l;
  perform pg_temp.st('G7 (b) remove Wed1', pg_temp.ed(v_e5, array[v_days[1], v_days[2], v_days[4], v_days[5], v_days[6]],
                                                      pg_temp.exs(v_e5), null), 'ok');
  if cardinality(v_ids) <> 2 or cardinality(pg_temp.rows(v_oli)) <> 0 or cardinality(pg_temp.rows(v_pam)) <> 0
     or pg_temp.logged(v_mark, v_ids) <> 2 then
    raise exception 'TEST FAILED: G7 (b) Oli''s pizza / Pam''s party rows: % / %, logged %', pg_temp.rows(v_oli), pg_temp.rows(v_pam),
      pg_temp.logged(v_mark, v_ids);
  end if;
  -- (c) the lunch offered only from Tue1 on: Quin's (withdrawn) Mon1 lunch
  -- row goes, logged; his Tue1 row and Rex's (active, Tue1) stay
  v_ids := array(select x.id from public.camp_camper_extras x where x.camper_id = v_quin and x.day_id = (pg_temp.dys(v_e5, array[1]))[1]);
  select max(l.id) into v_mark from public.change_log l;
  perform pg_temp.st('G7 (c) lunch only from Tue1', pg_temp.ed(v_e5, pg_temp.ds(v_e5),
      pg_temp.setx(pg_temp.exs(v_e5), 'Lunch', 'only_on',
                   (select jsonb_agg(to_char(x.d, 'YYYY-MM-DD') order by x.d) from unnest(pg_temp.ds(v_e5)) as x(d) where x.d <> v_mon)),
      null), 'ok');
  if cardinality(v_ids) <> 1 or cardinality(pg_temp.rows(v_quin)) <> 1 or v_ids[1] = any (pg_temp.rows(v_quin))
     or pg_temp.logged(v_mark, v_ids) <> 1 then
    raise exception 'TEST FAILED: G7 (c) Quin''s lunch rows: %, logged %', pg_temp.rows(v_quin), pg_temp.logged(v_mark, v_ids);
  end if;
  if pg_temp.rows(v_rex) <> v_rex_rows then raise exception 'TEST FAILED: G7 the active camper Rex lost a row'; end if;
  -- Restore all four: each is active again and every extra row passes the rules
  foreach v_k in array array[v_ned, v_oli, v_pam, v_quin] loop
    select public.camp_restore_camper(c.id, c.version) into v_r from public.camp_campers c where c.id = v_k;
    perform pg_temp.st('G7 restore', v_r, 'ok');
    if (select c.status from public.camp_campers c where c.id = v_k) <> 'active' or pg_temp.xok(v_k) is not true then
      raise exception 'TEST FAILED: G7 restored camper % is not active or has an extra that breaks the rules', v_k;
    end if;
  end loop;
  if pg_temp.xok(v_rex) is not true then raise exception 'TEST FAILED: G7 Rex''s extras break the rules'; end if;

  -- ===================================================================
  -- G6. Rights
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('G6 no session', pg_temp.ed(v_e4, v_days, pg_temp.exs(v_e4), null), 'no_access');
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('G6 desk', pg_temp.ed(v_e4, v_days, pg_temp.exs(v_e4), null), 'not_allowed');
  perform set_config('request.jwt.claims', '', true);
  select p.oid, p.prosecdef, p.proconfig, p.proacl into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'camp_update_camp';
  if v_fn.oid is null then raise exception 'TEST FAILED: G6 camp_update_camp is missing'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'camp_update_camp') <> 1 then
    raise exception 'TEST FAILED: G6 more than one camp_update_camp';
  end if;
  if v_fn.proconfig is distinct from array['search_path=""'] or v_fn.prosecdef is not true then
    raise exception 'TEST FAILED: G6 camp_update_camp settings % / security definer %', v_fn.proconfig, v_fn.prosecdef;
  end if;
  if has_function_privilege('anon', v_fn.oid, 'EXECUTE')
     or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 0)
     or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 'service_role'::regrole)
     or has_function_privilege('camps_registrar', v_fn.oid, 'EXECUTE') then
    raise exception 'TEST FAILED: G6 camp_update_camp can be run by anon, PUBLIC, service_role or camps_registrar';
  end if;
  if not has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') then
    raise exception 'TEST FAILED: G6 authenticated can''t run camp_update_camp';
  end if;
end;
$$;

select 'ALL 0027 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
