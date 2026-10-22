-- =====================================================================
-- 0022_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0022_camps_weekly_pricing.sql
--   (camps priced per week, camps of up to 60 days, $10,000 per camper -
--   rulebook v0.717, spec docs/Camps/TKD-Camps-Weekly-Pricing.md). It
--   checks, in this order:
--     W1  W (the most days in one Monday-Sunday week) for many day lists
--     W2  Add / Edit camp: the grid must be exactly 1 ... W; 60 days are
--         fine, 61 are not; only_on lists and children of more than 10 days
--     W3  prices through the family form: 5+5, 5+3, 2+2, one day,
--         Thanksgiving (Wed + Fri = one week of 2 days), a Sunday + the
--         Monday after (two weeks of 1 day), early / regular,
--         member / non-member; the answer's new "weeks" lines;
--         price_changed still works
--     W4  "not charged to all-days campers" per week (a per-day pizza),
--         a once extra for the whole camp, the table's own rule
--     W5  Edit details re-prices per week; Camper detail's "weeks"; a
--         grid edit after the sign-up: the stored price stays, the week
--         lines show the current grid row
--     W6  the $10,000 caps (form, Edit details, payments, Edit payment,
--         the table rules, Finance's snapshot rule)
--     W7  templates: day_count = days in a week (Save / Edit template,
--         the table rule)
--     W8  rights: anon nothing; the 4 new helpers callable by nobody;
--         camps_registrar runs exactly camp_public_camp and
--         camp_public_signup; the replaced functions keep 0013's rights,
--         security definer and search_path; no_access still first
--   (The roster's pizza count per week is worked out by the app, not by
--   the database, so it is tested there.)
--   It makes its own camps called "zz test 1a2b3c4d ...", so it works
--   whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test camps, sign-ups, payments,
--   history rows, test sessions). NEVER change the final "rollback;" to
--   "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0013_tests.sql: a pretend login token per session in
--   request.jwt.claims. A1 = admin unlocked, D1 = desk unlocked. The
--   family form's functions are called as the SQL Editor's own role (they
--   run as their owner, so the answers are the same as for
--   camps_registrar, whose rights W8 checks from the catalog).
--
-- BEFORE YOU RUN IT
--   1. 0013, 0017 and 0022 are applied. You need TWO existing, ACTIVE
--      staff rows: an admin and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations (some removals are
--      tested to be REFUSED). Everything is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0022 TESTS PASSED".
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
  -- a Monday 15-21 days from now: every test camp starts on it (or later)
  v_mon   date := date_trunc('week', (v_today + 14)::timestamp)::date + 7;
  v_key   text;

  v_r   jsonb;
  v_r2  jsonb;
  v_j   jsonb;
  v_n   integer;
  v_v   integer;
  v_txt text;
  v_ids uuid[];
  v_dates date[];

  -- camps: TW two Mon-Fri weeks (early), TR the same at regular prices,
  -- TG Thanksgiving (Wed + Fri), T1 one day, TL 60 days, TE Edit camp,
  -- TX the $10,000 camp; TS a Sunday + the Monday after (weekday-proof, 2026-10-22)
  v_tw uuid; v_tr uuid; v_tg uuid; v_t1 uuid; v_tl uuid; v_te uuid; v_tx uuid; v_ts uuid;
  v_pizza uuid; v_party uuid;
  -- campers
  v_c55 uuid; v_c53 uuid; v_c22 uuid; v_c52 uuid; v_cx uuid; v_pay uuid;
  v_tpl uuid;
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
  --   g(n)          the April camp grid of 0013_tests.sql for n rows
  --                 (rows 6 and 7 made up: 6000 / 6500 / 6800 / 7000 a day)
  --   mk(name, days, early, extras)  Add camp as the caller with grid
  --                 1 ... W of the days; id back
  --   dy / dys      the camp's i-th day id(s), in date order
  --   xid(camp, n)  the id of the camp's extra called n
  --   ch / ex / su  a child, an extra choice, a family sign-up
  --   cmp(ref)      the first camper of sign-up ref
  --   ud(...)       Edit details with the camper's current versions
  --   st(label, answer, status)  fails unless answer.status = status
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
    create function pg_temp.mk(p_name text, p_days date[], p_early date, p_extras jsonb) returns uuid language plpgsql as $b$
    declare
      v_r jsonb;
    begin
      v_r := public.camp_add_camp('worcester', false, p_name, p_days, '09:00', '15:00', public.testing_today() - 3,
                                  least(public.testing_today() + 5, (select max(x) from unnest(p_days) as x)), p_early, 5, 12,
                                  pg_temp.g(public.camp_week_size(p_days)), p_extras, null, 'I agree to the camp rules.');
      if v_r ->> 'status' is distinct from 'ok' then
        raise exception 'TEST SETUP: camp_add_camp % answered %', p_name, v_r;
      end if;
      return (v_r ->> 'id')::uuid;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.dy(p_camp uuid, p_i integer) returns uuid language sql as $b$
      select d.id from public.camp_days d where d.camp_id = p_camp order by d.day offset p_i - 1 limit 1;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.dys(p_camp uuid, p_i integer[]) returns uuid[] language sql as $b$
      select array(select pg_temp.dy(p_camp, x) from unnest(p_i) with ordinality as u(x, n) order by u.n);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.xid(p_camp uuid, p_name text) returns uuid language sql as $b$
      select e.id from public.camp_extras e where e.camp_id = p_camp and e.name = p_name;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ch(p_first text, p_member boolean, p_days uuid[], p_extras jsonb) returns jsonb language sql as $b$
      select jsonb_build_object('first_name', p_first, 'last_name', 'Weekly', 'age', 8, 'member', p_member,
                                'day_ids', to_jsonb(p_days), 'extras', p_extras);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ex(p_extra uuid, p_days uuid[]) returns jsonb language sql as $b$
      select jsonb_build_object('extra_id', p_extra, 'day_ids', to_jsonb(coalesce(p_days, '{}'::uuid[])));
    $b$;
  $f$;
  execute $f$
    create function pg_temp.su(p_camp uuid, p_key text, p_children jsonb, p_total integer) returns jsonb language sql as $b$
      select public.camp_public_signup(c.public_code, p_key, gen_random_uuid(), p_children, 'Pat Parent', '5085550100', 'Mother',
               'Sam Contact', '5085550101', 'Aunt', 'cash', true,
               'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
               'camp-2026-10-18', md5(c.waiver_text), p_total)
        from public.camps c where c.id = p_camp;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.cmp(p_ref text) returns uuid language sql as $b$
      select c.id from public.camp_campers c join public.camp_signups s on s.id = c.signup_id
       where s.reference = p_ref and c.position = 1;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ud(p_camper uuid, p_member boolean, p_days uuid[], p_extras jsonb) returns jsonb language sql as $b$
      select public.camp_update_details(c.id, c.version, s.version, c.first_name, c.last_name, c.age, p_member, p_days, p_extras,
                                        'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt')
        from public.camp_campers c join public.camp_signups s on s.id = c.signup_id
       where c.id = p_camper;
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

  -- ===================================================================
  -- W1. W = the most camp days in one Monday-Sunday week
  -- ===================================================================
  foreach v_txt in array array[
      'Mon-Fri|0,1,2,3,4|5', 'two Mon-Fri weeks|0,1,2,3,4,7,8,9,10,11|5', 'Mon-Fri + Mon-Wed|0,1,2,3,4,7,8,9|5',
      'Thanksgiving Wed + Fri|2,4|2', 'one day|3|1', 'Sat Sun Mon|5,6,7|2', 'Mon-Sun|0,1,2,3,4,5,6|7',
      'Test 2 (5 + 3 + 2 in three weeks)|0,1,2,3,4,14,15,16,21,22|5', 'Fri to Tue|4,5,6,7,8|3', 'nothing||0'] loop
    v_dates := array(select v_mon + x::integer
                       from unnest(string_to_array(nullif(split_part(v_txt, '|', 2), ''), ',')) as u(x));
    if public.camp_week_size(v_dates) <> split_part(v_txt, '|', 3)::integer then
      raise exception 'TEST FAILED: W1 W of % is %, expected %', split_part(v_txt, '|', 1),
        public.camp_week_size(v_dates), split_part(v_txt, '|', 3);
    end if;
  end loop;
  if public.camp_week_size(null) <> 0 or public.camp_week_size(array[null::date]) <> 0 then
    raise exception 'TEST FAILED: W1 W of an empty list must be 0';
  end if;

  -- ===================================================================
  -- W2. Add / Edit camp: the grid is exactly 1 ... W; 1-60 days
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_dates := array(select v_mon + x from unnest(array[0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) as x);   -- two Mon-Fri weeks
  foreach v_n in array array[1, 4, 6, 7, 10] loop
    perform pg_temp.st('W2 two weeks with a grid of ' || v_n || ' rows',
      public.camp_add_camp('worcester', false, v_tag || ' bad', v_dates, '09:00', '15:00', v_today - 3, v_today + 5, v_today + 5,
                           5, 12, pg_temp.g(v_n), '[]', null, 'W'), 'invalid');
  end loop;
  -- (the grid helper itself: 1-7 rows only)
  if public.camp_prices_arg_is_valid(pg_temp.g(8), 8) or not public.camp_prices_arg_is_valid(pg_temp.g(7), 7)
     or public.camp_template_setup_is_valid(8, pg_temp.g(8), '[]') or not public.camp_template_setup_is_valid(7, pg_temp.g(7), '[]') then
    raise exception 'TEST FAILED: W2 a grid of 7 rows is the most';
  end if;
  -- camp TW: two Mon-Fri weeks, grid 1 ... 5, a per-day pizza and a once
  -- party (both not for all-days campers) and a per-day drop-off
  v_j := '[{"name": "Pizza", "price_cents": 500, "per": "day", "not_for_all_days": true},
           {"name": "Party", "price_cents": 1000, "per": "once", "not_for_all_days": true},
           {"name": "Early drop-off", "price_cents": 1500, "per": "day", "not_for_all_days": false}]';
  v_tw := pg_temp.mk(v_tag || ' Two weeks', v_dates, v_today + 5, v_j);
  v_tr := pg_temp.mk(v_tag || ' Two weeks late', v_dates, v_today - 1, '[]');
  if (select count(*) from public.camp_prices p where p.camp_id = v_tw) <> 5
     or (select max(p.day_count) from public.camp_prices p where p.camp_id = v_tw) <> 5 then
    raise exception 'TEST FAILED: W2 camp TW must have the grid rows 1-5';
  end if;
  v_pizza := pg_temp.xid(v_tw, 'Pizza');
  v_party := pg_temp.xid(v_tw, 'Party');
  -- Thanksgiving: Wed + Fri -> grid 1 ... 2 (a grid of 1 row is refused)
  perform pg_temp.st('W2 Thanksgiving with 1 row',
    public.camp_add_camp('worcester', false, v_tag || ' bad', array[v_mon + 2, v_mon + 4], '09:00', '15:00', v_today - 3, v_today + 5,
                         v_today + 5, 5, 12, pg_temp.g(1), '[]', null, 'W'), 'invalid');
  v_tg := pg_temp.mk(v_tag || ' Thanksgiving', array[v_mon + 2, v_mon + 4], v_today + 5, '[]');
  v_t1 := pg_temp.mk(v_tag || ' One day', array[v_mon + 1], v_today + 5, '[]');
  -- 60 days are fine (grid 1 ... 7), 61 are not
  v_dates := array(select v_mon + x from generate_series(0, 59) as x);
  perform pg_temp.st('W2 61 days', public.camp_add_camp('worcester', false, v_tag || ' bad', v_dates || (v_mon + 60), '09:00', '15:00',
                       v_today - 3, v_today + 5, v_today + 5, 5, 12, pg_temp.g(7), '[]', null, 'W'), 'invalid');
  -- (with a pizza offered on 20 of the days: only_on lists may be longer than 10 now)
  v_tl := pg_temp.mk(v_tag || ' Sixty days', v_dates, v_today + 5,
            jsonb_build_array(jsonb_build_object('name', 'Pizza', 'price_cents', 500, 'per', 'day', 'not_for_all_days', true,
                                                 'only_on', to_jsonb(v_dates[1:20]))));
  if public.camp_day_count(v_tl) <> 60 or (select count(*) from public.camp_prices p where p.camp_id = v_tl) <> 7
     or (select cardinality(e.only_on) from public.camp_extras e where e.camp_id = v_tl) <> 20 then
    raise exception 'TEST FAILED: W2 the 60-day camp';
  end if;
  -- the list rules for the family form / Edit details: up to 60 days
  if not public.camp_children_arg_is_valid(jsonb_build_array(pg_temp.ch('A', true,
           array(select gen_random_uuid() from generate_series(1, 60)), '[]')))
     or public.camp_children_arg_is_valid(jsonb_build_array(pg_temp.ch('A', true,
           array(select gen_random_uuid() from generate_series(1, 61)), '[]')))
     or not public.camp_camper_extras_arg_is_valid(jsonb_build_array(pg_temp.ex(gen_random_uuid(),
           array(select gen_random_uuid() from generate_series(1, 60)))))
     or public.camp_camper_extras_arg_is_valid(jsonb_build_array(pg_temp.ex(gen_random_uuid(),
           array(select gen_random_uuid() from generate_series(1, 61)))))
     or not public.camp_dates_are_sorted_set(v_dates)
     or public.camp_dates_are_sorted_set(v_dates || (v_mon + 60))
     or not public.camp_days_arg_is_valid(v_dates)
     or public.camp_days_arg_is_valid(v_dates || (v_mon + 60)) then
    raise exception 'TEST FAILED: W2 the 60-day list rules';
  end if;
  -- Edit camp TE (no campers): Mon-Fri -> Mon-Wed: the grid must shrink to
  -- 1 ... 3 (rows 4-5 go); then two Mon-Fri weeks: 1 ... 5 again
  v_dates := array(select v_mon + 21 + x from generate_series(0, 4) as x);
  v_te := pg_temp.mk(v_tag || ' Edit me', v_dates, v_today + 5, '[]');
  select c.version into v_v from public.camps c where c.id = v_te;
  perform pg_temp.st('W2 edit to Mon-Wed with the old grid', public.camp_update_camp(v_te, v_v, 'worcester', false, v_tag || ' Edit me',
           v_dates[1:3], '09:00', '15:00', v_today - 3, v_today + 5, v_today + 5, 5, 12, pg_temp.g(5), '[]', null, 'I agree to the camp rules.'), 'invalid');
  v_r := pg_temp.st('W2 edit to Mon-Wed', public.camp_update_camp(v_te, v_v, 'worcester', false, v_tag || ' Edit me',
           v_dates[1:3], '09:00', '15:00', v_today - 3, v_today + 5, v_today + 5, 5, 12, pg_temp.g(3), '[]', null, 'I agree to the camp rules.'), 'ok');
  if (select array_agg(p.day_count order by p.day_count) from public.camp_prices p where p.camp_id = v_te) <> array[1, 2, 3]::smallint[] then
    raise exception 'TEST FAILED: W2 Edit camp kept grid rows above W';
  end if;
  v_r := pg_temp.st('W2 edit to two weeks', public.camp_update_camp(v_te, (v_r ->> 'version')::integer, 'worcester', false, v_tag || ' Edit me',
           v_dates || array(select v_mon + 28 + x from generate_series(0, 4) as x), '09:00', '15:00', v_today - 3, v_today + 5, v_today + 5,
           5, 12, pg_temp.g(5), '[]', null, 'I agree to the camp rules.'), 'ok');
  if (select count(*) from public.camp_prices p where p.camp_id = v_te) <> 5 or public.camp_day_count(v_te) <> 10 then
    raise exception 'TEST FAILED: W2 Edit camp to two weeks';
  end if;
  -- a grid row for 8 days can't be written directly
  begin
    insert into public.camp_prices (camp_id, day_count, member_early_cents, member_regular_cents, nonmember_early_cents, nonmember_regular_cents)
    values (v_tl, 8, 100, 100, 100, 100);
    raise exception 'TEST FAILED: W2 a grid row for 8 days was written directly';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- W3. Prices through the family form (each week priced on its own,
  --     added up)
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  v_key := v_tag || ' k-weekly';
  -- 5 + 5 days, member, early: 2 x $275 = $550
  v_r := pg_temp.st('W3 5+5', pg_temp.su(v_tw, v_key, jsonb_build_array(
           pg_temp.ch('Five', true, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), '[]')), 55000), 'ok');
  v_c55 := pg_temp.cmp(v_r ->> 'reference');
  -- 5 + 3 days, member, early, + the once party: $275 + $195 + $10 = $480
  v_r := pg_temp.st('W3 5+3', pg_temp.su(v_tw, v_key, jsonb_build_array(
           pg_temp.ch('Eight', true, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5, 6, 7, 8]),
                      jsonb_build_array(pg_temp.ex(v_party, null)))), 48000), 'ok');
  v_c53 := pg_temp.cmp(v_r ->> 'reference');
  if (v_r -> 'children' -> 0 ->> 'base_cents')::integer <> 47000
     or (v_r -> 'children' -> 0 ->> 'day_count')::integer <> 8
     or (v_r -> 'children' -> 0 ->> 'total_cents')::integer <> 48000
     or v_r -> 'children' -> 0 -> 'weeks' <> jsonb_build_array(
          jsonb_build_object('monday', v_mon, 'day_count', 5, 'cents', 27500),
          jsonb_build_object('monday', v_mon + 7, 'day_count', 3, 'cents', 19500)) then
    raise exception 'TEST FAILED: W3 5+3 answer %', v_r;
  end if;
  -- 2 + 2 days, non-member, early: 2 x $150 = $300
  v_r := pg_temp.st('W3 2+2', pg_temp.su(v_tw, v_key, jsonb_build_array(
           pg_temp.ch('Four', false, pg_temp.dys(v_tw, array[1, 2, 6, 7]), '[]')), 30000), 'ok');
  v_c22 := pg_temp.cmp(v_r ->> 'reference');
  -- one day: $75
  perform pg_temp.st('W3 one day of TW', pg_temp.su(v_tw, v_key, jsonb_build_array(
           pg_temp.ch('One', true, pg_temp.dys(v_tw, array[3]), '[]')), 7500), 'ok');
  -- regular prices (TR): 5 + 5 member $325 x 2; 2 + 2 non-member $160 x 2
  v_r := pg_temp.st('W3 regular 5+5', pg_temp.su(v_tr, v_key, jsonb_build_array(
           pg_temp.ch('Late', true, pg_temp.dys(v_tr, array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), '[]'),
           pg_temp.ch('Later', false, pg_temp.dys(v_tr, array[2, 3, 9, 10]), '[]')), 65000 + 32000), 'ok');
  if v_r -> 'children' -> 0 ->> 'price_kind' <> 'regular' or (v_r -> 'children' -> 1 ->> 'base_cents')::integer <> 32000 then
    raise exception 'TEST FAILED: W3 regular answer %', v_r;
  end if;
  -- Thanksgiving: Wed + Fri are ONE week of 2 days ($140); one of them $75
  perform pg_temp.st('W3 Thanksgiving both days', pg_temp.su(v_tg, v_key, jsonb_build_array(
           pg_temp.ch('Turkey', true, pg_temp.dys(v_tg, array[1, 2]), '[]'),
           pg_temp.ch('Pie', true, pg_temp.dys(v_tg, array[2]), '[]')), 14000 + 7500), 'ok');
  -- (weekday-proof, 2026-10-22) camp TS: a Sunday and the Monday right
  -- after it are TWO weeks of 1 day: grid 1 ... 1 (2 rows refused), and
  -- a camper of both days pays 2 x the 1-day price ($75 + $75), not the
  -- 2-day row ($140). Fixed dates from v_mon, so it is tested every day
  -- of the week the file is run.
  if extract(isodow from v_mon + 13) <> 7 or public.camp_week_size(array[v_mon + 13, v_mon + 14]) <> 1 then
    raise exception 'TEST FAILED: W3 a Sunday + Monday must be W = 1';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('W3 Sunday + Monday with 2 rows',
    public.camp_add_camp('worcester', false, v_tag || ' bad', array[v_mon + 13, v_mon + 14], '09:00', '15:00', v_today - 3, v_today + 5,
                         v_today + 5, 5, 12, pg_temp.g(2), '[]', null, 'W'), 'invalid');
  v_ts := pg_temp.mk(v_tag || ' Sun Mon', array[v_mon + 13, v_mon + 14], v_today + 5, '[]');
  perform set_config('request.jwt.claims', '', true);
  if (select array_agg(p.day_count order by p.day_count) from public.camp_prices p where p.camp_id = v_ts) <> array[1]::smallint[] then
    raise exception 'TEST FAILED: W3 camp TS (Sun + Mon) must have the grid row 1 only';
  end if;
  v_r := pg_temp.st('W3 Sunday + Monday old 2-day total', pg_temp.su(v_ts, v_key, jsonb_build_array(
           pg_temp.ch('Straddle', true, pg_temp.dys(v_ts, array[1, 2]), '[]')), 14000), 'price_changed');
  if (v_r ->> 'new_total_cents')::integer <> 2 * 7500 then
    raise exception 'TEST FAILED: W3 Sunday + Monday price_changed answer %', v_r;
  end if;
  v_r := pg_temp.st('W3 Sunday + Monday', pg_temp.su(v_ts, v_key, jsonb_build_array(
           pg_temp.ch('Straddle', true, pg_temp.dys(v_ts, array[1, 2]), '[]')), 2 * 7500), 'ok');
  if (v_r -> 'children' -> 0 ->> 'base_cents')::integer <> 2 * 7500
     or (v_r -> 'children' -> 0 ->> 'day_count')::integer <> 2
     or v_r -> 'children' -> 0 -> 'weeks' <> jsonb_build_array(
          jsonb_build_object('monday', v_mon + 7, 'day_count', 1, 'cents', 7500),
          jsonb_build_object('monday', v_mon + 14, 'day_count', 1, 'cents', 7500)) then
    raise exception 'TEST FAILED: W3 Sunday + Monday answer %', v_r;
  end if;
  -- a one-day camp: $75
  perform pg_temp.st('W3 one-day camp', pg_temp.su(v_t1, v_key, jsonb_build_array(
           pg_temp.ch('Solo', true, pg_temp.dys(v_t1, array[1]), '[]')), 7500), 'ok');
  -- 60 days in a row from a Monday: 8 full weeks of 7 ($420) + 4 days ($260)
  perform pg_temp.st('W3 sixty days', pg_temp.su(v_tl, v_key, jsonb_build_array(
           pg_temp.ch('Long', true, array(select d.id from public.camp_days d where d.camp_id = v_tl order by d.day), '[]')),
           8 * 42000 + 26000), 'ok');
  -- price_changed: the page showed the old rule's price -> the new total
  v_r := pg_temp.st('W3 price_changed', pg_temp.su(v_tw, v_key, jsonb_build_array(
           pg_temp.ch('Eight', true, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5, 6, 7, 8]), '[]')), 27500), 'price_changed');
  if (v_r ->> 'new_total_cents')::integer <> 47000 or (v_r ->> 'old_total_cents')::integer <> 27500 then
    raise exception 'TEST FAILED: W3 price_changed answer %', v_r;
  end if;
  -- the helper itself: unknown day id or a missing grid row -> NULL
  if public.camp_weeks_breakdown(v_tw, pg_temp.dys(v_tw, array[1, 6]), true, 'nope')
       <> jsonb_build_array(jsonb_build_object('monday', v_mon, 'day_count', 1, 'cents', null),
                            jsonb_build_object('monday', v_mon + 7, 'day_count', 1, 'cents', null))
     or public.camp_weekly_base_cents(v_tw, array[gen_random_uuid()], true, 'early') is not null
     or public.camp_weekly_base_cents(v_tw, '{}', true, 'early') is not null
     or public.camp_weekly_base_cents(v_tw, pg_temp.dys(v_tw, array[1, 6]), true, 'early') <> 15000 then
    raise exception 'TEST FAILED: W3 camp_weekly_base_cents edge cases';
  end if;

  -- ===================================================================
  -- W4. "Not charged to all-days campers", per week (R6)
  -- ===================================================================
  -- week 1 all five days + Mon/Tue of week 2: pizza on a week-2 day is
  -- fine ($275 + $140 + $5); on a week-1 day it is included -> invalid
  v_r := pg_temp.st('W4 pizza in a part week', pg_temp.su(v_tw, v_key, jsonb_build_array(
           pg_temp.ch('Part', true, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5, 6, 7]),
                      jsonb_build_array(pg_temp.ex(v_pizza, pg_temp.dys(v_tw, array[6]))))), 27500 + 14000 + 500), 'ok');
  v_c52 := pg_temp.cmp(v_r ->> 'reference');
  perform pg_temp.st('W4 pizza in a whole week', pg_temp.su(v_tw, v_key, jsonb_build_array(
           pg_temp.ch('Whole', true, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5, 6, 7]),
                      jsonb_build_array(pg_temp.ex(v_pizza, pg_temp.dys(v_tw, array[1, 6]))))), 27500 + 14000 + 1000), 'invalid');
  -- every day: no pizza anywhere, no party
  perform pg_temp.st('W4 all days + pizza', pg_temp.su(v_tw, v_key, jsonb_build_array(
           pg_temp.ch('All', true, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
                      jsonb_build_array(pg_temp.ex(v_pizza, pg_temp.dys(v_tw, array[8]))))), 55500), 'invalid');
  perform pg_temp.st('W4 all days + party', pg_temp.su(v_tw, v_key, jsonb_build_array(
           pg_temp.ch('All', true, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
                      jsonb_build_array(pg_temp.ex(v_party, null)))), 56000), 'invalid');
  -- (5 + 3 had the once party: fine, not every day of the camp - W3)
  -- the table's own rule, written directly
  begin
    insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents) values (v_c52, v_pizza, pg_temp.dy(v_tw, 2), 500);
    raise exception 'TEST FAILED: W4 a pizza in a whole week was written directly';
  exception when check_violation then null;
  end;
  begin
    insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents) values (v_c55, v_pizza, pg_temp.dy(v_tw, 9), 500);
    raise exception 'TEST FAILED: W4 a pizza for an all-days camper was written directly';
  exception when check_violation then null;
  end;
  begin
    insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents) values (v_c55, v_party, null, 1000);
    raise exception 'TEST FAILED: W4 the party for an all-days camper was written directly';
  exception when check_violation then null;
  end;
  insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents) values (v_c52, v_pizza, pg_temp.dy(v_tw, 7), 500);
  delete from public.camp_camper_extras x where x.camper_id = v_c52 and x.day_id = pg_temp.dy(v_tw, 7);
  if public.camp_comes_whole_week(v_tw, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5]), pg_temp.dy(v_tw, 6))
     or not public.camp_comes_whole_week(v_tw, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5]), pg_temp.dy(v_tw, 3))
     or public.camp_comes_whole_week(v_tw, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5]), pg_temp.dy(v_tg, 1)) then
    raise exception 'TEST FAILED: W4 camp_comes_whole_week';
  end if;
  -- Edit details: completing week 2 while keeping its pizza -> invalid
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('W4 edit: whole week 2 with its pizza', pg_temp.ud(v_c52, true, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
           jsonb_build_array(pg_temp.ex(v_pizza, pg_temp.dys(v_tw, array[6])))), 'invalid');

  -- ===================================================================
  -- W5. Edit details re-prices per week; Camper detail's "weeks"
  -- ===================================================================
  -- 5 + 3 (+ party) -> every day (the party has to go): 2 x $275
  v_r := pg_temp.st('W5 5+3 -> 5+5', pg_temp.ud(v_c53, true, pg_temp.dys(v_tw, array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), '[]'), 'ok');
  if (v_r ->> 'total_cents')::integer <> 55000 then raise exception 'TEST FAILED: W5 5+5 re-priced to %', v_r; end if;
  -- 2 + 2 non-member -> member: 2 x $140
  v_r := pg_temp.st('W5 2+2 member', pg_temp.ud(v_c22, true, pg_temp.dys(v_tw, array[1, 2, 6, 7]), '[]'), 'ok');
  if (v_r ->> 'total_cents')::integer <> 28000 then raise exception 'TEST FAILED: W5 2+2 member re-priced to %', v_r; end if;
  -- 2 + 2 -> 3 + 1 (still member): $195 + $75
  v_r := pg_temp.st('W5 3+1', pg_temp.ud(v_c22, true, pg_temp.dys(v_tw, array[1, 2, 3, 6]), '[]'), 'ok');
  if (v_r ->> 'total_cents')::integer <> 27000 then raise exception 'TEST FAILED: W5 3+1 re-priced to %', v_r; end if;
  v_r := public.camp_camper_detail(v_c22);
  if v_r -> 'breakdown' -> 'weeks' <> jsonb_build_array(
         jsonb_build_object('monday', v_mon, 'day_count', 3, 'cents', 19500),
         jsonb_build_object('monday', v_mon + 7, 'day_count', 1, 'cents', 7500))
     or (v_r -> 'breakdown' ->> 'day_count')::integer <> 4 or (v_r -> 'breakdown' ->> 'base_cents')::integer <> 27000 then
    raise exception 'TEST FAILED: W5 Camper detail breakdown %', v_r -> 'breakdown';
  end if;
  -- an admin raises the 5-day member early price ($275 -> $300): the 5+5
  -- camper keeps $550 (snapshot); the week lines show the grid's current
  -- row ($300); the 3+1 camper's lines are unchanged
  perform set_config('request.jwt.claims', v_c_a1, true);
  select c.version into v_v from public.camps c where c.id = v_tw;
  perform pg_temp.st('W5 raise row 5', public.camp_update_camp(v_tw, v_v, 'worcester', false, v_tag || ' Two weeks',
           array(select d.day from public.camp_days d where d.camp_id = v_tw order by d.day), '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, jsonb_set(pg_temp.g(5), '{4,member_early_cents}', '30000'),
           (select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'price_cents', e.price_cents, 'per', e.per,
                                                'not_for_all_days', e.not_for_all_days, 'only_on', to_jsonb(e.only_on)) order by e.sort)
              from public.camp_extras e where e.camp_id = v_tw), null, 'I agree to the camp rules.'), 'ok');
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.camp_camper_detail(v_c55);
  if (v_r -> 'breakdown' ->> 'base_cents')::integer <> 55000
     or v_r -> 'breakdown' -> 'weeks' <> jsonb_build_array(
          jsonb_build_object('monday', v_mon, 'day_count', 5, 'cents', 30000),
          jsonb_build_object('monday', v_mon + 7, 'day_count', 5, 'cents', 30000)) then
    raise exception 'TEST FAILED: W5 after a price edit the week lines must show the current row: %', v_r -> 'breakdown';
  end if;
  if (public.camp_camper_detail(v_c22) -> 'breakdown' -> 'weeks' -> 0 ->> 'cents')::integer <> 19500 then
    raise exception 'TEST FAILED: W5 the 3+1 camper''s week lines';
  end if;
  -- the camp_roster / totals still agree (55000 kept)
  if public.camp_camper_total_cents(v_c55) <> 55000 then raise exception 'TEST FAILED: W5 a price edit re-priced a camper'; end if;

  -- ===================================================================
  -- W6. $10,000 per camper (R5)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_tx := pg_temp.mk(v_tag || ' Big', array[v_mon + 3], v_today + 5,
            (select jsonb_agg(jsonb_build_object('name', 'Big ' || k, 'price_cents', 100000, 'per', 'once', 'not_for_all_days', false) order by k)
               from generate_series(1, 10) as k));
  select c.version into v_v from public.camps c where c.id = v_tx;
  perform pg_temp.st('W6 a $1,000 day', public.camp_update_camp(v_tx, v_v, 'worcester', false, v_tag || ' Big', array[v_mon + 3],
           '09:00', '15:00', v_today - 3, v_today + 5, v_today + 5, 5, 12,
           '[{"day_count": 1, "member_early_cents": 100000, "member_regular_cents": 100000, "nonmember_early_cents": 100000, "nonmember_regular_cents": 100000}]',
           (select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'price_cents', e.price_cents, 'per', e.per,
                                                'not_for_all_days', e.not_for_all_days, 'only_on', to_jsonb(e.only_on)) order by e.sort)
              from public.camp_extras e where e.camp_id = v_tx), null, 'I agree to the camp rules.'), 'ok');
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('W6 form over $10,000', pg_temp.su(v_tx, v_key, jsonb_build_array(
           pg_temp.ch('Max', true, pg_temp.dys(v_tx, array[1]),
                      (select jsonb_agg(pg_temp.ex(e.id, null) order by e.sort) from public.camp_extras e where e.camp_id = v_tx))), 1100000), 'invalid');
  v_r := pg_temp.st('W6 form at exactly $10,000', pg_temp.su(v_tx, v_key, jsonb_build_array(
           pg_temp.ch('Max', true, pg_temp.dys(v_tx, array[1]),
                      (select jsonb_agg(pg_temp.ex(e.id, null) order by e.sort) from public.camp_extras e where e.camp_id = v_tx and e.sort < 9))), 1000000), 'ok');
  v_cx := pg_temp.cmp(v_r ->> 'reference');
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('W6 edit over $10,000', pg_temp.ud(v_cx, true, pg_temp.dys(v_tx, array[1]),
           (select jsonb_agg(pg_temp.ex(e.id, null) order by e.sort) from public.camp_extras e where e.camp_id = v_tx)), 'invalid');
  v_r := pg_temp.st('W6 mark paid $10,000', public.camp_mark_paid(v_cx, (select c.version from public.camp_campers c where c.id = v_cx), 'worcester'), 'ok');
  if (v_r ->> 'amount_cents')::integer <> 1000000 then raise exception 'TEST FAILED: W6 mark paid answered %', v_r; end if;
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('W6 edit payment over $10,000', public.camp_edit_payment(v_pay, 'check', 1000001, v_today, 'worcester'), 'invalid');
  v_r := pg_temp.st('W6 edit payment to $9,999', public.camp_edit_payment(v_pay, 'check', 999900, v_today, 'worcester'), 'ok');
  if exists (select 1 from public.camp_payments p where p.camper_id = v_cx and p.kind = 'reversal' and p.amount_cents <> -1000000) then
    raise exception 'TEST FAILED: W6 the reversal of a $10,000 payment';
  end if;
  begin
    insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
    values (v_cx, 'payment', 1000001, 'cash', v_today, 'worcester', 'x');
    raise exception 'TEST FAILED: W6 a payment over $10,000 was written directly';
  exception when check_violation then null;
  end;
  begin
    update public.camp_campers c set base_cents = 1000001 where c.id = v_cx;
    raise exception 'TEST FAILED: W6 a base price over $10,000 was written directly';
  exception when check_violation then null;
  end;
  if not exists (select 1 from pg_constraint c where c.conname = 'finance_day_closing_items_amount_check'
                  and pg_get_constraintdef(c.oid) like '%-1000000%' and pg_get_constraintdef(c.oid) like '%<> 0%')
     or not exists (select 1 from pg_constraint c where c.conname = 'camp_campers_base_check'
                     and pg_get_constraintdef(c.oid) like '%1000000%') then
    raise exception 'TEST FAILED: W6 the widened table rules';
  end if;

  -- ===================================================================
  -- W7. Templates: day_count = days in a week (R7)
  -- ===================================================================
  v_r := pg_temp.st('W7 save TW as a template', public.camp_save_template(v_tw, v_tag || ' Two weeks'), 'ok');
  v_tpl := (v_r ->> 'id')::uuid;
  if (select t.day_count from public.camp_templates t where t.id = v_tpl) <> 5
     or (select jsonb_array_length(t.prices) from public.camp_templates t where t.id = v_tpl) <> 5
     or (select (t.prices -> 4 ->> 'member_early_cents')::integer from public.camp_templates t where t.id = v_tpl) <> 30000 then
    raise exception 'TEST FAILED: W7 Save as template of two Mon-Fri weeks: %', (select to_jsonb(t) from public.camp_templates t where t.id = v_tpl);
  end if;
  v_r := pg_temp.st('W7 save the 60-day camp', public.camp_save_template(v_tl, v_tag || ' Sixty'), 'ok');
  if (select t.day_count from public.camp_templates t where t.id = (v_r ->> 'id')::uuid) <> 7 then
    raise exception 'TEST FAILED: W7 the 60-day camp''s template must have 7 days a week';
  end if;
  v_r := pg_temp.st('W7 save Thanksgiving', public.camp_save_template(v_tg, v_tag || ' Turkey'), 'ok');
  if (select t.day_count from public.camp_templates t where t.id = (v_r ->> 'id')::uuid) <> 2 then
    raise exception 'TEST FAILED: W7 Thanksgiving''s template must have 2 days a week';
  end if;
  select t.version into v_v from public.camp_templates t where t.id = v_tpl;
  perform pg_temp.st('W7 edit template: 8 days a week', public.camp_update_template(v_tpl, v_v, v_tag || ' Two weeks', 'worcester', false,
           8, '09:00', '15:00', 31, 10, 25, 5, 12, pg_temp.g(8), '[]', null, 'W'), 'invalid');
  perform pg_temp.st('W7 edit template: 5 days, 4 rows', public.camp_update_template(v_tpl, v_v, v_tag || ' Two weeks', 'worcester', false,
           5, '09:00', '15:00', 31, 10, 25, 5, 12, pg_temp.g(4), '[]', null, 'W'), 'invalid');
  v_r := pg_temp.st('W7 edit template: 7 days a week', public.camp_update_template(v_tpl, v_v, v_tag || ' Two weeks', 'worcester', false,
           7, '09:00', '15:00', 31, 10, 25, 5, 12, pg_temp.g(7), '[]', null, 'W'), 'ok');
  if (select t.day_count from public.camp_templates t where t.id = v_tpl) <> 7 then raise exception 'TEST FAILED: W7 edit template day_count'; end if;
  begin
    update public.camp_templates t set day_count = 8, prices = pg_temp.g(8) where t.id = v_tpl;
    raise exception 'TEST FAILED: W7 a template of 8 days a week was written directly';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- W8. Rights
  -- ===================================================================
  -- no_access still comes first (no session)
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('W8 no session: Edit details', pg_temp.ud(v_c22, true, pg_temp.dys(v_tw, array[1]), '[]'), 'no_access');
  perform pg_temp.st('W8 no session: Camper detail', public.camp_camper_detail(v_c22), 'no_access');
  perform pg_temp.st('W8 no session: Save template', public.camp_save_template(v_tw, v_tag || ' x'), 'no_access');
  perform pg_temp.st('W8 no session: Edit payment', public.camp_edit_payment(v_pay, 'cash', 100, v_today, 'worcester'), 'no_access');
  -- the desk is not an admin
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('W8 desk: Edit camp', public.camp_update_camp(v_tw, 1, 'worcester', false, 'x', array[v_mon], '09:00', '15:00',
           v_today, v_today, v_today, 5, 12, pg_temp.g(1), '[]', null, 'W'), 'not_allowed');
  perform pg_temp.st('W8 desk: Edit template', public.camp_update_template(v_tpl, 1, 'x', 'worcester', false, 1, '09:00', '15:00',
           1, 0, 0, 5, 12, pg_temp.g(1), '[]', null, 'W'), 'not_allowed');
  perform set_config('request.jwt.claims', '', true);
  -- the catalog
  for v_fn in
    select p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('camp_week_size', 'camp_weekly_base_cents', 'camp_comes_whole_week', 'camp_weeks_breakdown',
                         'camp_days_arg_is_valid', 'camp_prices_arg_is_valid', 'camp_dates_are_sorted_set',
                         'camp_camper_extras_arg_is_valid', 'camp_children_arg_is_valid', 'camp_template_setup_is_valid',
                         'camp_setup_args_are_valid', 'camp_camper_extras_are_ok', 'camp_extras_only_on_ok',
                         'camp_camper_extras_before_write', 'camp_public_signup_answer', 'camp_public_signup_core',
                         'camp_camper_detail', 'camp_update_camp', 'camp_save_template', 'camp_update_template',
                         'camp_update_details', 'camp_edit_payment')
  loop
    if v_fn.proconfig is distinct from array['search_path=""'] then
      raise exception 'TEST FAILED: W8 % has settings %', v_fn.proname, v_fn.proconfig;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 0)
       or has_function_privilege('camps_registrar', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: W8 % can be run by anon, PUBLIC or camps_registrar', v_fn.proname;
    end if;
    if (v_fn.proname in ('camp_camper_detail', 'camp_update_camp', 'camp_save_template', 'camp_update_template',
                         'camp_update_details', 'camp_edit_payment'))
       is distinct from has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: W8 % authenticated EXECUTE is %', v_fn.proname, has_function_privilege('authenticated', v_fn.oid, 'EXECUTE');
    end if;
    if v_fn.prosecdef is distinct from (v_fn.proname in ('camp_camper_detail', 'camp_update_camp', 'camp_save_template',
                                                         'camp_update_template', 'camp_update_details', 'camp_edit_payment')) then
      raise exception 'TEST FAILED: W8 % security definer is %', v_fn.proname, v_fn.prosecdef;
    end if;
    if exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a
                where a.grantee = 'service_role'::regrole) then
      raise exception 'TEST FAILED: W8 % is granted to service_role', v_fn.proname;
    end if;
  end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('camp_week_size', 'camp_weekly_base_cents', 'camp_comes_whole_week', 'camp_weeks_breakdown');
  if v_n <> 4 then raise exception 'TEST FAILED: W8 expected exactly 4 new helpers, found %', v_n; end if;
  -- camps_registrar runs exactly the two family-form functions (of all camp ones)
  select string_agg(p.proname, ',' order by p.proname) into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'camp\_%' or p.proname like 'camps\_%')
     and has_function_privilege('camps_registrar', p.oid, 'EXECUTE');
  if v_txt is distinct from 'camp_public_camp,camp_public_signup' then
    raise exception 'TEST FAILED: W8 camps_registrar can run %', v_txt;
  end if;
  -- anon can run no camp function at all
  select string_agg(p.proname, ',') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'camp\_%' or p.proname like 'camps\_%')
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_txt is not null then raise exception 'TEST FAILED: W8 anon can run %', v_txt; end if;
end;
$$;

select 'ALL 0022 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
