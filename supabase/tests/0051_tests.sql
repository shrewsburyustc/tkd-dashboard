-- =====================================================================
-- 0051_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0051_board_breaking.sql (the
--   Board breaking section: a monthly board-breaking night per school,
--   families register through a link, staff run the roster, card payments
--   arrive from Square; contract docs/Board Breaking/CONTRACT-0051.md and
--   signature sheet SIGNATURES-0051.md; rulebook v1.300-v1.303).
--   It checks, in this order:
--     B  settings and the board chart: seed (when nothing was edited yet),
--        save settings (ranges, stale), save chart (a row per band, bad
--        band / boards / duplicates, stale, the public page follows it)
--     C  events and classes: add (copies the latest earlier event's classes,
--        or the chosen event's), update, delete (has_payments), the classes
--        editor (ids kept, new added, the rest removed, class_in_use)
--     D  the family form (brk_public_*): the page's answer, the price maths
--        (cash / check, card +25c a board, same day +100c a board from the
--        event date on, both; Child / Teen by age 12 / 13; a "Little Tiger"
--        rank uses the tiger row; a Black Belt rank ignores age), price
--        changed, a retry returns the same registration, every refusal
--        (invalid, closed, not found, rate limit) and the attempts rows,
--        the honeypot, the family's own page (registration + link)
--     E  staff: Add student (walk-ins, closed registration, same-day), Edit
--        (amount worked out again, amount below paid, the Square link
--        cleared when it can no longer be right), price override, Mark broke
--     F  payments: Mark paid (amount = owed, a different way and its Undo,
--        already paid), Undo (own payment within 10 seconds, else admin),
--        Edit payment, refunds (cash / check, too large, undo), the
--        append-only guard, deletes (has_payments), the table rules
--     G  Square (brk_square_payment): paid, replay of an event id, a second
--        event id with the same payment id, unknown order, wrong amount /
--        currency, an amount that is not what is still owed, a status that
--        is not COMPLETED, a Worcester message for a Shrewsbury student
--        (wrong_school: no payment), a cleared link, already paid, one
--        brk_square_events row per message, the "needs a look" list and
--        Dismiss
--     H  access: locked / PIN-locked / signed-out / stale-password / magic
--        link sessions read nothing and every staff function answers
--        no_access; a desk (role staff) session gets not_allowed from every
--        admin function
--     I  history and privacy: the history reader (no login ids, no Square
--        link / order, no submission id), change_log rows for the writes,
--        what staff reads never contain
--     J  rights: RLS on every table, no policy for anon, no write for any
--        app role, forbidden columns, the two new logins (brk_registrar
--        and brk_square) and exactly which function each may run
--   It makes its own events called "zz test 1a2b3c4d ...", so it works
--   whatever is already in the database, and on any weekday.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test events, registrations,
--   payments, settings, the chart, history rows, attempt rows, test
--   sessions). NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0013_tests.sql / 0050_tests.sql: a pretend login token per session
--   in request.jwt.claims. A1 = admin unlocked, D1 = desk unlocked, and
--   A2..A6, D2, D3 are the sessions that must NOT work (locked, 5 wrong
--   PINs, signed out, 8 days since the password, magic link). The family
--   form's and Square's functions are called as the SQL Editor's own role
--   with no token (they run as their owner, so the answers are the same
--   as for brk_registrar / brk_square).
--
-- BEFORE YOU RUN IT
--   1. 0051 is applied. You need TWO existing, ACTIVE staff rows: an admin
--      and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Everything is rolled back.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0051 TESTS PASSED" (and how many checks ran).
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

  v_a1 uuid := gen_random_uuid();  v_a2 uuid := gen_random_uuid();  v_a3 uuid := gen_random_uuid();
  v_a4 uuid := gen_random_uuid();  v_a5 uuid := gen_random_uuid();  v_a6 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();  v_d2 uuid := gen_random_uuid();  v_d3 uuid := gen_random_uuid();

  v_now_s   bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_8d  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600));
  v_amr_otp jsonb := jsonb_build_array(jsonb_build_object('method', 'otp',      'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_a2 text; v_c_a3 text; v_c_a4 text; v_c_a5 text; v_c_a6 text;
  v_c_d1 text; v_c_d2 text; v_c_d3 text;

  v_an    text;   -- the admin's and the desk's names (as the history shows them)
  v_dn    text;
  v_role  text;
  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_key   text := 'zz-0051-' || left(gen_random_uuid()::text, 8);

  -- ranks, taken from the chart itself (so a renamed chart doesn't break the tests)
  v_rk_child text;   -- a rank that exists in the Child AND the Teen band
  v_rk_tiger text;
  v_rk_black text;

  -- events: W1 Worcester in 14 days; W0 Worcester TODAY (same-day prices); S1 Shrewsbury in 14 days;
  --         CL registration switched off; PA event date in the past; F1..F3 far away (class copying)
  v_w1 uuid; v_w0 uuid; v_s1 uuid; v_cl uuid; v_pa uuid; v_f1 uuid; v_f2 uuid; v_f3 uuid;
  v_code_w1 text; v_code_w0 text; v_code_s1 text; v_code_cl text; v_code_pa text;
  v_w1a uuid; v_w1b uuid; v_w0a uuid; v_s1a uuid; v_cla uuid; v_paa uuid;   -- classes ("Group A" / "Group B")
  v_cj jsonb;

  v_r     jsonb;
  v_r2    jsonb;
  v_x     jsonb;
  v_h     jsonb;
  v_orig  jsonb;       -- the chart as it was
  v_set0  jsonb;       -- the settings as they were
  v_n     integer;
  v_n2    integer;
  v_n3    integer;
  v_ver   integer;
  v_txt   text;
  v_txt2  text;
  v_sub   uuid;
  v_sub2  uuid;
  v_i     integer;
  v_k     integer;
  v_list  text[];
  v_labels text[];
  v_calls text[];
  v_fn    record;
  v_tbl   text;
  v_mark  bigint;

  -- registrations
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid; v_p7 uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid;
  v_m1 uuid; v_m2 uuid;
  v_ra uuid; v_rb uuid; v_rc uuid; v_rd uuid; v_rg uuid;
  v_pay uuid; v_pay2 uuid; v_rev uuid;
  v_sub_p1 uuid; v_sub_c1 uuid; v_sub_c2 uuid; v_sub_c3 uuid;
  v_fu uuid; v_rl uuid; v_fua uuid; v_rla uuid; v_code_fu text; v_code_rl text;
  v_rmp uuid; v_rep uuid; v_shr2 uuid; v_sub_mp uuid; v_sub_ep uuid;
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  select s.role into v_role from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role into v_role from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  select s.full_name into v_an from public.staff s where s.id = v_admin;
  select s.full_name into v_dn from public.staff s where s.id = v_desk;
  if to_regclass('public.brk_events') is null or to_regclass('public.brk_registrations') is null
     or to_regclass('public.brk_payments') is null or to_regclass('public.brk_square_events') is null
     or to_regprocedure('public.brk_square_payment(text, text, text, text, integer, text, text)') is null then
    raise exception 'TEST SETUP: the Board breaking tables / functions are missing (is 0051 applied?)';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'brk_registrar')
     or not exists (select 1 from pg_roles where rolname = 'brk_square') then
    raise exception 'TEST SETUP: role brk_registrar or brk_square is missing (is 0051 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;

  begin
    insert into auth.sessions (id, user_id)
    select x, v_admin from unnest(array[v_a1, v_a2, v_a3, v_a5, v_a6]) as x
    union all
    select x, v_desk  from unnest(array[v_d1, v_d2, v_d3]) as x;
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),
    (v_a3, v_admin, now() + interval '30 minutes'),
    (v_a4, v_admin, now() + interval '30 minutes'),
    (v_a5, v_admin, now() + interval '30 minutes'),
    (v_a6, v_admin, now() + interval '30 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes'),
    (v_d2, v_desk,  now() - interval '1 minute'),
    (v_d3, v_desk,  now() + interval '30 minutes');
  insert into public.pin_attempts (session_id, staff_id, failed, locked_at) values (v_a3, v_admin, 5, now());

  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_a3 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a3, 'amr', v_amr_1m)::text;
  v_c_a4 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a4, 'amr', v_amr_1m)::text;
  v_c_a5 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a5, 'amr', v_amr_8d)::text;
  v_c_a6 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a6, 'amr', v_amr_otp)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;
  v_c_d2 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text;
  v_c_d3 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d3, 'amr', v_amr_otp)::text;

  set local role authenticated;
  v_list := array[v_c_a1, v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d1, v_c_d2, v_c_d3];
  for v_i in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_i], true);
    if public.has_data_access() is distinct from (v_i in (1, 7)) then
      raise exception 'TEST SETUP: session % of A1..A6,D1..D3 has data access %, expected %',
        v_i, public.has_data_access(), (v_i in (1, 7));
    end if;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- Temporary helpers for this run only (pg_temp = gone at the end). They are called only
  -- as the SQL Editor's own role, never under "set local role".
  --   chk(label, ok)              fails unless ok is true (and counts the check)
  --   st(label, answer, status)   fails unless answer.status = status; gives the answer back
  --   st2(label, answer, s1, s2)  the same, either of two statuses (where the sheet leaves the word open)
  --   price(t, a, card, same_day) the amount worked out HERE from the settings row
  --   exp(event, t, a, paying_by) price() for that event (same day = the event date has come)
  --   sg(code, key, sub, first, age, rank, class, t, a, paying_by, expected)  the family form
  --   bal(reg) what is still owed (owed - paid)
  --   rv(reg) version;  paid(reg) net of its payments;  npay(reg) payment rows;  regs(event) rows
  --   rr(event, reg)              the registration's row from the roster answer (as the caller)
  --   cls(event, n)               the n-th class of an event;  evv(event) the event's version
  --   regof(sub)                  the registration of a form submission
  --   fails(sql)                  true when the statement raises an error (rolled back)
  --   ed(...) / mp(...) / ov(...) Edit registration / Mark paid / Override with the CURRENT version
  --   op(event, bool)             Update event: only registration_open changes
  --   sq(...)                     brk_square_payment
  execute $f$
    create function pg_temp.chk(p_label text, p_ok boolean) returns void language plpgsql as $b$
    begin
      if p_ok is not true then
        raise exception 'TEST FAILED: %', p_label;
      end if;
      perform set_config('tkd.t51', (coalesce(nullif(current_setting('tkd.t51', true), ''), '0')::integer + 1)::text, true);
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.st(p_label text, p_got jsonb, p_status text) returns jsonb language plpgsql as $b$
    begin
      if p_got ->> 'status' is distinct from p_status then
        raise exception 'TEST FAILED: % expected %, got %', p_label, p_status, p_got;
      end if;
      perform pg_temp.chk(p_label, true);
      return p_got;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.st2(p_label text, p_got jsonb, p_status1 text, p_status2 text) returns jsonb language plpgsql as $b$
    begin
      if p_got ->> 'status' is distinct from p_status1 and p_got ->> 'status' is distinct from p_status2 then
        raise exception 'TEST FAILED: % expected % or %, got %', p_label, p_status1, p_status2, p_got;
      end if;
      perform pg_temp.chk(p_label, true);
      return p_got;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.price(p_t integer, p_a integer, p_card boolean, p_sd boolean) returns integer language sql as $b$
      select p_t * (s.tech_cents  + case when p_card then s.card_extra_cents else 0 end + case when p_sd then s.same_day_extra_cents else 0 end)
           + p_a * (s.adult_cents + case when p_card then s.card_extra_cents else 0 end + case when p_sd then s.same_day_extra_cents else 0 end)
        from public.brk_settings s;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.exp(p_ev uuid, p_t integer, p_a integer, p_pay text) returns integer language sql as $b$
      select pg_temp.price(p_t, p_a, p_pay = 'card', e.event_date <= public.testing_today())
        from public.brk_events e where e.id = p_ev;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.sg(p_code text, p_key text, p_sub uuid, p_first text, p_age integer, p_rank text, p_class uuid,
                               p_t integer, p_a integer, p_pay text, p_expected integer) returns jsonb language sql as $b$
      select public.brk_public_signup(p_code, p_key, p_sub, p_first, 'Tester', p_age, p_rank, p_class, p_t, p_a, p_pay, p_expected);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.bal(p_reg uuid) returns integer language sql as $b$
      select (coalesce(r.override_cents, r.amount_cents) - coalesce((select sum(p.amount_cents) from public.brk_payments p where p.registration_id = r.id), 0))::integer
        from public.brk_registrations r where r.id = p_reg;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.rv(p_reg uuid) returns integer language sql as $b$
      select r.version from public.brk_registrations r where r.id = p_reg;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.paid(p_reg uuid) returns integer language sql as $b$
      select coalesce(sum(p.amount_cents), 0)::integer from public.brk_payments p where p.registration_id = p_reg;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.npay(p_reg uuid) returns integer language sql as $b$
      select count(*)::integer from public.brk_payments p where p.registration_id = p_reg;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.regs(p_ev uuid) returns integer language sql as $b$
      select count(*)::integer from public.brk_registrations r where r.event_id = p_ev;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.rr(p_ev uuid, p_reg uuid) returns jsonb language sql as $b$
      select x from jsonb_array_elements(public.brk_event_roster(p_ev) -> 'registrations') as x where (x ->> 'id')::uuid = p_reg;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.cls(p_ev uuid, p_n integer) returns uuid language sql as $b$
      select c.id from public.brk_event_classes c where c.event_id = p_ev order by c.sort, c.start_time, c.id offset p_n - 1 limit 1;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.evv(p_ev uuid) returns integer language sql as $b$
      select e.version from public.brk_events e where e.id = p_ev;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.regof(p_sub uuid) returns uuid language sql as $b$
      select r.id from public.brk_registrations r where r.submission_id = p_sub;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.fails(p_sql text) returns boolean language plpgsql as $b$
    begin
      execute p_sql;
      return false;
    exception
      when others then
        return true;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ed(p_reg uuid, p_first text, p_last text, p_age integer, p_rank text, p_class uuid,
                               p_t integer, p_a integer, p_pay text) returns jsonb language sql as $b$
      select public.brk_edit_registration(p_reg, pg_temp.rv(p_reg), p_first, p_last, p_age, p_rank, p_class, p_t, p_a, p_pay);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.mp(p_reg uuid, p_school text, p_method text) returns jsonb language sql as $b$
      select public.brk_mark_paid(p_reg, pg_temp.rv(p_reg), p_school, p_method);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ov(p_reg uuid, p_cents integer) returns jsonb language sql as $b$
      select public.brk_set_override(p_reg, pg_temp.rv(p_reg), p_cents);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.op(p_ev uuid, p_open boolean) returns jsonb language sql as $b$
      select public.brk_update_event(e.id, e.version, e.name, e.event_date, p_open) from public.brk_events e where e.id = p_ev;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.sq(p_school text, p_event text, p_payment text, p_order text, p_amount integer,
                               p_currency text, p_status text) returns jsonb language sql as $b$
      select public.brk_square_payment(p_school, p_event, p_payment, p_order, p_amount, p_currency, p_status);
    $b$;
  $f$;

  -- ranks from the chart
  select c.rank_name into v_rk_child from public.brk_chart c
   where c.band = 'child' and exists (select 1 from public.brk_chart t where t.band = 'teen' and t.rank_name = c.rank_name)
   order by c.sort, c.rank_name limit 1;
  select c.rank_name into v_rk_tiger from public.brk_chart c where c.band = 'tiger' order by c.sort, c.rank_name limit 1;
  select c.rank_name into v_rk_black from public.brk_chart c where c.band = 'black' order by c.sort, c.rank_name limit 1;
  perform pg_temp.chk('setup: the chart has a rank in both Child and Teen, a Little Tiger rank and a Black Belt rank',
    v_rk_child is not null and v_rk_tiger is not null and v_rk_black is not null);

  -- ===================================================================
  -- B. Settings and the chart
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_set0 := pg_temp.st('B1 desk reads the settings', public.brk_settings_get(), 'ok');
  if (v_set0 -> 'settings' ->> 'version')::integer = 1 then
    perform pg_temp.chk('B1 the seed settings are 300 / 400 / 25 / 100 / 12',
      (v_set0 -> 'settings' ->> 'tech_cents')::integer = 300 and (v_set0 -> 'settings' ->> 'adult_cents')::integer = 400
      and (v_set0 -> 'settings' ->> 'card_extra_cents')::integer = 25 and (v_set0 -> 'settings' ->> 'same_day_extra_cents')::integer = 100
      and (v_set0 -> 'settings' ->> 'child_max_age')::integer = 12);
    -- live-page numbers (docs/Board Breaking/Board-chart-seed.md)
    perform pg_temp.chk('B1 the seed chart holds the live page''s numbers for Child White 3/0, Teen White 0/3, 1st Dan 4/3, Little Tiger 3/0',
      exists (select 1 from jsonb_array_elements(v_set0 -> 'chart') x where x ->> 'band' = 'child' and lower(x ->> 'rank_name') = 'white'
                and (x ->> 'tech_boards')::integer = 3 and (x ->> 'adult_boards')::integer = 0)
      and exists (select 1 from jsonb_array_elements(v_set0 -> 'chart') x where x ->> 'band' = 'teen' and lower(x ->> 'rank_name') = 'white'
                and (x ->> 'tech_boards')::integer = 0 and (x ->> 'adult_boards')::integer = 3)
      and exists (select 1 from jsonb_array_elements(v_set0 -> 'chart') x where x ->> 'band' = 'black' and lower(x ->> 'rank_name') = '1st dan'
                and (x ->> 'tech_boards')::integer = 4 and (x ->> 'adult_boards')::integer = 3)
      and exists (select 1 from jsonb_array_elements(v_set0 -> 'chart') x where x ->> 'band' = 'tiger'
                and (x ->> 'tech_boards')::integer = 3 and (x ->> 'adult_boards')::integer = 0));
  end if;
  perform pg_temp.chk('B1 the chart has at least one row in each of the four bands, every row has the agreed keys',
    (select count(distinct x ->> 'band') from jsonb_array_elements(v_set0 -> 'chart') x where x ->> 'band' in ('tiger', 'child', 'teen', 'black')) = 4
    and not exists (select 1 from jsonb_array_elements(v_set0 -> 'chart') x
                     where (select array_agg(k order by k collate "C") from jsonb_object_keys(x) as k)
                           is distinct from array['adult_boards', 'band', 'id', 'rank_name', 'sort', 'tech_boards', 'technique']));
  perform pg_temp.chk('B1 the settings answer has the agreed keys',
    (select array_agg(k order by k collate "C") from jsonb_object_keys(v_set0 -> 'settings') as k)
      = array['adult_cents', 'card_extra_cents', 'child_max_age', 'same_day_extra_cents', 'tech_cents', 'version']);
  perform pg_temp.chk('B1 one settings row, and nobody can add another (a copy of the row is refused)',
    (select count(*) from public.brk_settings) = 1 and pg_temp.fails('insert into public.brk_settings select * from public.brk_settings'));
  perform pg_temp.chk('B1 ... not even with a new id (the one-row rule)',
    (select count(*) from public.brk_settings) = 1
    and pg_temp.fails('insert into public.brk_settings (tech_cents, adult_cents, card_extra_cents, same_day_extra_cents, child_max_age) values (1, 1, 1, 1, 12)'));
  perform pg_temp.chk('B1 the settings rule: ages and cents inside their range (direct writes refused)',
    pg_temp.fails('update public.brk_settings set child_max_age = 0') and pg_temp.fails('update public.brk_settings set child_max_age = 100')
    and pg_temp.fails('update public.brk_settings set tech_cents = -1'));

  -- B2. save settings (admin)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_ver := (v_set0 -> 'settings' ->> 'version')::integer;
  perform pg_temp.st('B2 stale version', public.brk_save_settings(v_ver - 1, 300, 400, 25, 100, 12), 'stale');
  for v_i in 1 .. 6 loop
    v_r := public.brk_save_settings(v_ver, case v_i when 1 then -1 else 300 end, case v_i when 2 then 100001 else 400 end,
             case v_i when 3 then -1 else 25 end, case v_i when 4 then 100001 else 100 end, case v_i when 5 then 0 when 6 then 100 else 12 end);
    perform pg_temp.st('B2 out-of-range value ' || v_i, v_r, 'invalid');
  end loop;
  perform pg_temp.chk('B2 a refused save changed nothing',
    public.brk_settings_get() -> 'settings' = v_set0 -> 'settings');
  v_r := pg_temp.st('B2 save', public.brk_save_settings(v_ver, 350, 450, 30, 110, 11), 'ok');
  perform pg_temp.chk('B2 the version moved up by one and the new numbers read back',
    (v_r ->> 'version')::integer = v_ver + 1
    and (select (g -> 'settings') = jsonb_build_object('tech_cents', 350, 'adult_cents', 450, 'card_extra_cents', 30,
                                                       'same_day_extra_cents', 110, 'child_max_age', 11, 'version', v_ver + 1)
           from (select public.brk_settings_get() as g) as q));
  perform pg_temp.chk('B2 the price maths follows the settings (350 / 450 / 30 / 110: card + same day, 1 technical + 2 adult)',
    pg_temp.price(1, 2, true, true) = 1 * (350 + 30 + 110) + 2 * (450 + 30 + 110) and pg_temp.price(3, 0, false, false) = 1050);
  v_ver := (pg_temp.st('B2 restore the known numbers', public.brk_save_settings(v_ver + 1, 300, 400, 25, 100, 12), 'ok') ->> 'version')::integer;

  -- B3. save chart (admin): the whole chart is replaced
  v_orig := (select jsonb_agg(jsonb_build_object('band', x ->> 'band', 'rank_name', x ->> 'rank_name', 'sort', (x ->> 'sort')::integer,
                                                 'technique', x ->> 'technique', 'tech_boards', (x ->> 'tech_boards')::integer,
                                                 'adult_boards', (x ->> 'adult_boards')::integer)
                              order by x ->> 'band', (x ->> 'sort')::integer, x ->> 'rank_name')
               from jsonb_array_elements(public.brk_settings_get() -> 'chart') x);
  perform pg_temp.st('B3 stale version', public.brk_save_chart(v_ver - 1, v_orig), 'stale');
  perform pg_temp.st('B3 an empty chart', public.brk_save_chart(v_ver, '[]'::jsonb), 'invalid');
  perform pg_temp.st('B3 a band is missing (no black rows)', public.brk_save_chart(v_ver,
    (select jsonb_agg(x) from jsonb_array_elements(v_orig) x where x ->> 'band' <> 'black')), 'invalid');
  perform pg_temp.st('B3 an unknown band', public.brk_save_chart(v_ver,
    v_orig || jsonb_build_array(jsonb_build_object('band', 'adult', 'rank_name', 'Zed', 'sort', 1, 'technique', '', 'tech_boards', 1, 'adult_boards', 1))), 'invalid');
  perform pg_temp.st('B3 13 boards', public.brk_save_chart(v_ver,
    v_orig || jsonb_build_array(jsonb_build_object('band', 'child', 'rank_name', 'Zed', 'sort', 99, 'technique', '', 'tech_boards', 13, 'adult_boards', 0))), 'invalid');
  perform pg_temp.st('B3 -1 boards', public.brk_save_chart(v_ver,
    v_orig || jsonb_build_array(jsonb_build_object('band', 'child', 'rank_name', 'Zed', 'sort', 99, 'technique', '', 'tech_boards', 0, 'adult_boards', -1))), 'invalid');
  perform pg_temp.st('B3 the same rank twice in a band', public.brk_save_chart(v_ver,
    v_orig || jsonb_build_array(jsonb_build_object('band', 'child', 'rank_name', v_rk_child, 'sort', 99, 'technique', '', 'tech_boards', 1, 'adult_boards', 1))), 'invalid');
  perform pg_temp.chk('B3 refused saves changed nothing (same version, same rows)',
    (public.brk_settings_get() -> 'settings' ->> 'version')::integer = v_ver
    and (select count(*) from public.brk_chart) = jsonb_array_length(v_orig));
  -- a change: the child row of v_rk_child gets 2 technical + 1 adult boards and an empty technique
  v_r := pg_temp.st('B3 save a changed chart', public.brk_save_chart(v_ver,
    (select jsonb_agg(case when x ->> 'band' = 'child' and x ->> 'rank_name' = v_rk_child
                           then x || '{"tech_boards": 2, "adult_boards": 1, "technique": ""}'::jsonb else x end)
       from jsonb_array_elements(v_orig) x)), 'ok');
  perform pg_temp.chk('B3 the version moved and the row changed (an empty technique is allowed)',
    (v_r ->> 'version')::integer = v_ver + 1
    and exists (select 1 from public.brk_chart c where c.band = 'child' and c.rank_name = v_rk_child
                  and c.tech_boards = 2 and c.adult_boards = 1 and coalesce(c.technique, '') = '')
    and (select count(*) from public.brk_chart) = jsonb_array_length(v_orig));
  v_ver := (v_r ->> 'version')::integer;
  -- the bands' sort keeps their order and the unchanged rows kept their numbers
  perform pg_temp.chk('B3 the other rows are unchanged',
    not exists (select 1 from jsonb_array_elements(v_orig) x
                 where not (x ->> 'band' = 'child' and x ->> 'rank_name' = v_rk_child)
                   and not exists (select 1 from public.brk_chart c where c.band = x ->> 'band' and c.rank_name = x ->> 'rank_name'
                                     and c.tech_boards = (x ->> 'tech_boards')::integer and c.adult_boards = (x ->> 'adult_boards')::integer)));
  v_r := pg_temp.st('B3 put the chart back', public.brk_save_chart(v_ver, v_orig), 'ok');
  v_ver := (v_r ->> 'version')::integer;
  perform pg_temp.chk('B3 the chart is as it was',
    not exists (select 1 from jsonb_array_elements(v_orig) x
                 where not exists (select 1 from public.brk_chart c where c.band = x ->> 'band' and c.rank_name = x ->> 'rank_name'
                                     and c.tech_boards = (x ->> 'tech_boards')::integer and c.adult_boards = (x ->> 'adult_boards')::integer
                                     and coalesce(c.technique, '') = coalesce(x ->> 'technique', '')))
    and (select count(*) from public.brk_chart) = jsonb_array_length(v_orig));
  -- the table rules
  perform pg_temp.chk('B3 the chart rules: boards 0-12, a known band, one row per (band, rank) (direct writes refused)',
    pg_temp.fails('update public.brk_chart set tech_boards = 13') and pg_temp.fails('update public.brk_chart set adult_boards = -1')
    and pg_temp.fails('update public.brk_chart set band = ''adult''')
    and pg_temp.fails(format('update public.brk_chart set rank_name = %L where band = %L and rank_name <> %L', v_rk_child, 'child', v_rk_child)));

  -- ===================================================================
  -- C. Events and classes (admin)
  -- ===================================================================
  v_r := pg_temp.st('C1 add event W1', public.brk_add_event(v_tag || ' W1', 'worcester', v_today + 14, null), 'ok');
  v_w1 := (v_r ->> 'event_id')::uuid;
  v_code_w1 := v_r ->> 'public_code';
  perform pg_temp.chk('C1 the public code is 8 characters of the Camps alphabet and is the one stored',
    v_code_w1 ~ '^[a-hjkmnp-z2-9]{8}$' and (select e.public_code from public.brk_events e where e.id = v_w1) = v_code_w1
    and (select e.location_code from public.brk_events e where e.id = v_w1) = 'worcester');
  perform pg_temp.st('C1 open registration', pg_temp.op(v_w1, true), 'ok');
  v_cj := jsonb_build_array(jsonb_build_object('name', 'Group A', 'start_time', '09:00', 'end_time', '10:00'),
                            jsonb_build_object('name', 'Group B', 'start_time', '10:00', 'end_time', '11:00'));
  perform pg_temp.st('C1 W1 classes', public.brk_save_classes(v_w1, pg_temp.evv(v_w1), v_cj), 'ok');
  v_w1a := pg_temp.cls(v_w1, 1);
  v_w1b := pg_temp.cls(v_w1, 2);
  perform pg_temp.chk('C1 two classes in order', v_w1a is not null and v_w1b is not null and v_w1a <> v_w1b
    and (select c.name from public.brk_event_classes c where c.id = v_w1a) = 'Group A'
    and (select c.name from public.brk_event_classes c where c.id = v_w1b) = 'Group B');

  -- W0: Worcester, TODAY (the same-day price applies), classes copied from W1 (explicit)
  v_r := pg_temp.st('C1 add event W0 copying W1''s classes', public.brk_add_event(v_tag || ' W0', 'worcester', v_today + 20, v_w1), 'ok');
  v_w0 := (v_r ->> 'event_id')::uuid;
  v_code_w0 := v_r ->> 'public_code';
  perform pg_temp.chk('C1 the classes were copied (names, times, new ids)',
    (select count(*) from public.brk_event_classes c where c.event_id = v_w0) = 2
    and exists (select 1 from public.brk_event_classes c where c.event_id = v_w0 and c.name = 'Group A' and c.start_time = '09:00'::time and c.end_time = '10:00'::time)
    and exists (select 1 from public.brk_event_classes c where c.event_id = v_w0 and c.name = 'Group B')
    and not exists (select 1 from public.brk_event_classes c where c.event_id = v_w0 and c.id in (v_w1a, v_w1b)));
  perform pg_temp.st('C1 W0 now has today''s date and is open',
    public.brk_update_event(v_w0, pg_temp.evv(v_w0), v_tag || ' W0', v_today, true), 'ok');
  v_w0a := pg_temp.cls(v_w0, 1);

  -- S1: Shrewsbury in 14 days
  v_r := pg_temp.st('C1 add event S1', public.brk_add_event(v_tag || ' S1', 'shrewsbury', v_today + 14, v_w1), 'ok');
  v_s1 := (v_r ->> 'event_id')::uuid;
  v_code_s1 := v_r ->> 'public_code';
  perform pg_temp.st('C1 open S1', pg_temp.op(v_s1, true), 'ok');
  v_s1a := pg_temp.cls(v_s1, 1);
  perform pg_temp.chk('C1 an event from another school copied the classes too', v_s1a is not null
    and (select e.location_code from public.brk_events e where e.id = v_s1) = 'shrewsbury');

  -- CL: registration switched off;  PA: the event date has passed (the date moved straight in the table)
  v_r := pg_temp.st('C1 add event CL', public.brk_add_event(v_tag || ' CL', 'worcester', v_today + 15, v_w1), 'ok');
  v_cl := (v_r ->> 'event_id')::uuid; v_code_cl := v_r ->> 'public_code';
  perform pg_temp.st('C1 CL registration off', pg_temp.op(v_cl, false), 'ok');
  v_cla := pg_temp.cls(v_cl, 1);
  v_r := pg_temp.st('C1 add event PA', public.brk_add_event(v_tag || ' PA', 'worcester', v_today + 16, v_w1), 'ok');
  v_pa := (v_r ->> 'event_id')::uuid; v_code_pa := v_r ->> 'public_code';
  perform pg_temp.st('C1 PA open', pg_temp.op(v_pa, true), 'ok');
  update public.brk_events set event_date = v_today - 1 where id = v_pa;
  v_paa := pg_temp.cls(v_pa, 1);

  -- C2. add event: invalid input, the default class copy (the latest EARLIER event of the school)
  perform pg_temp.st('C2 empty name', public.brk_add_event('  ', 'worcester', v_today + 30, null), 'invalid');
  perform pg_temp.st('C2 unknown school', public.brk_add_event(v_tag || ' x', 'boston', v_today + 30, null), 'invalid');
  perform pg_temp.st('C2 no date', public.brk_add_event(v_tag || ' x', 'worcester', null, null), 'invalid');
  perform pg_temp.st2('C2 unknown copy-from event', public.brk_add_event(v_tag || ' x', 'worcester', v_today + 30, gen_random_uuid()), 'not_found', 'invalid');
  v_f1 := (pg_temp.st('C2 add F1 (far away)', public.brk_add_event(v_tag || ' F1', 'worcester', v_today + 600, null), 'ok') ->> 'event_id')::uuid;
  perform pg_temp.st('C2 F1 classes', public.brk_save_classes(v_f1, pg_temp.evv(v_f1),
    jsonb_build_array(jsonb_build_object('name', 'F class', 'start_time', '08:00', 'end_time', '09:00'))), 'ok');
  v_f2 := (pg_temp.st('C2 add F2 (after F1, no source named)', public.brk_add_event(v_tag || ' F2', 'worcester', v_today + 650, null), 'ok') ->> 'event_id')::uuid;
  perform pg_temp.chk('C2 with no source named, the new event copies the latest earlier event of the school (F1''s one class)',
    (select count(*) from public.brk_event_classes c where c.event_id = v_f2) = 1
    and exists (select 1 from public.brk_event_classes c where c.event_id = v_f2 and c.name = 'F class' and c.start_time = '08:00'::time)
    and not exists (select 1 from public.brk_event_classes c where c.event_id = v_f2 and c.id = pg_temp.cls(v_f1, 1)));
  v_f3 := (pg_temp.st('C2 add F3 (other school, copying W1)', public.brk_add_event(v_tag || ' F3', 'shrewsbury', v_today + 700, v_w1), 'ok') ->> 'event_id')::uuid;
  perform pg_temp.chk('C2 F3 has W1''s two classes', (select count(*) from public.brk_event_classes c where c.event_id = v_f3) = 2);

  -- C3. update event: stale, not found, rename / date / open, the school never changes
  v_ver := pg_temp.evv(v_f2);
  perform pg_temp.st('C3 stale', public.brk_update_event(v_f2, v_ver - 1, 'x', v_today + 650, true), 'stale');
  perform pg_temp.st('C3 not found', public.brk_update_event(gen_random_uuid(), 1, 'x', v_today + 650, true), 'not_found');
  perform pg_temp.st('C3 empty name', public.brk_update_event(v_f2, v_ver, ' ', v_today + 650, true), 'invalid');
  v_r := pg_temp.st('C3 update', public.brk_update_event(v_f2, v_ver, v_tag || ' F2 renamed', v_today + 651, true), 'ok');
  perform pg_temp.chk('C3 the version moved, the school did not',
    (v_r ->> 'version')::integer = v_ver + 1
    and (select e.name || '|' || e.event_date::text || '|' || e.registration_open::text || '|' || e.location_code
           from public.brk_events e where e.id = v_f2) = v_tag || ' F2 renamed|' || (v_today + 651)::text || '|true|worcester');
  v_txt := (select e.public_code from public.brk_events e where e.id = v_f2);
  perform pg_temp.fails(format('update public.brk_events set public_code = %L where id = %L', 'aaaaaaaa', v_f2));
  perform pg_temp.chk('C3 the public code never changes (a direct write is refused, or put back)',
    (select e.public_code from public.brk_events e where e.id = v_f2) = v_txt);

  -- C3b. an event whose date is more than a year old can still be renamed and closed (the date window applies
  --      only when the date is changed to a NEW value)
  update public.brk_events set event_date = v_today - 400 where id = v_f2;
  v_ver := pg_temp.evv(v_f2);
  perform pg_temp.st('C3b rename and close an event 400 days old (same date)',
    public.brk_update_event(v_f2, v_ver, v_tag || ' F2 old', v_today - 400, false), 'ok');
  perform pg_temp.chk('C3b ... the name and the closing were saved, the date is unchanged',
    exists (select 1 from public.brk_events e where e.id = v_f2 and e.name = v_tag || ' F2 old' and not e.registration_open and e.event_date = v_today - 400));
  v_r := pg_temp.st('C3b a NEW date outside the window is refused', public.brk_update_event(v_f2, pg_temp.evv(v_f2), v_tag || ' F2 old', v_today - 500, false), 'invalid');
  perform pg_temp.chk('C3b ... naming the date', v_r ->> 'field' = 'event_date');
  perform pg_temp.st('C3b a NEW date inside the window is fine', public.brk_update_event(v_f2, pg_temp.evv(v_f2), v_tag || ' F2 old', v_today + 651, false), 'ok');

  -- C4. the classes editor (on F2): ids kept, new added, the rest removed
  v_cj := jsonb_build_array(jsonb_build_object('id', pg_temp.cls(v_f2, 1), 'name', 'F renamed', 'start_time', '08:30', 'end_time', '09:30'),
                            jsonb_build_object('name', 'F new', 'start_time', '09:30', 'end_time', '10:30'));
  v_txt := pg_temp.cls(v_f2, 1)::text;
  v_ver := pg_temp.evv(v_f2);
  perform pg_temp.st('C4 stale', public.brk_save_classes(v_f2, v_ver - 1, v_cj), 'stale');
  perform pg_temp.st('C4 an empty class name', public.brk_save_classes(v_f2, v_ver,
    jsonb_build_array(jsonb_build_object('name', '', 'start_time', '08:00', 'end_time', '09:00'))), 'invalid');
  perform pg_temp.chk('C4 refused saves changed nothing', (select count(*) from public.brk_event_classes c where c.event_id = v_f2) = 1);
  v_r := pg_temp.st('C4 save: one kept (renamed), one new', public.brk_save_classes(v_f2, v_ver, v_cj), 'ok');
  perform pg_temp.chk('C4 the kept class has its id and new words; a second class exists; the version moved',
    (select count(*) from public.brk_event_classes c where c.event_id = v_f2) = 2
    and exists (select 1 from public.brk_event_classes c where c.id = v_txt::uuid and c.name = 'F renamed' and c.start_time = '08:30'::time)
    and exists (select 1 from public.brk_event_classes c where c.event_id = v_f2 and c.name = 'F new' and c.id <> v_txt::uuid)
    and (v_r ->> 'version')::integer = v_ver + 1);
  perform pg_temp.chk('C4 classes are listed in the order sent',
    (select array_agg(c.name order by c.sort, c.start_time) from public.brk_event_classes c where c.event_id = v_f2) = array['F renamed', 'F new']);
  v_r := pg_temp.st('C4 send only the new one: the others are removed', public.brk_save_classes(v_f2, pg_temp.evv(v_f2),
    jsonb_build_array(jsonb_build_object('name', 'Only', 'start_time', '07:00', 'end_time', '08:00'))), 'ok');
  perform pg_temp.chk('C4 exactly one class remains and it is not an old id',
    (select count(*) from public.brk_event_classes c where c.event_id = v_f2) = 1
    and not exists (select 1 from public.brk_event_classes c where c.id = v_txt::uuid));

  -- C5. delete event: F3 has no students -> ok and its classes are gone; stale / not found
  perform pg_temp.st('C5 not found', public.brk_delete_event(gen_random_uuid(), 1), 'not_found');
  perform pg_temp.st('C5 stale', public.brk_delete_event(v_f3, pg_temp.evv(v_f3) - 1), 'stale');
  perform pg_temp.st('C5 delete', public.brk_delete_event(v_f3, pg_temp.evv(v_f3)), 'ok');
  perform pg_temp.chk('C5 the event and its classes are gone',
    not exists (select 1 from public.brk_events e where e.id = v_f3)
    and not exists (select 1 from public.brk_event_classes c where c.event_id = v_f3));

  -- ===================================================================
  -- D. The family form (called as the SQL Editor's own role with no token, as the function owner)
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);

  -- D1. the page's answer
  v_r := pg_temp.st('D1 the event page', public.brk_public_event(v_code_w1), 'ok');
  perform pg_temp.chk('D1 name, school, date, open, two classes, the four prices, one age line, the chart',
    v_r -> 'event' ->> 'name' = v_tag || ' W1' and v_r -> 'event' ->> 'location_code' = 'worcester'
    and v_r -> 'event' ->> 'event_date' = (v_today + 14)::text and v_r -> 'event' ->> 'registration_state' = 'open'
    and jsonb_array_length(v_r -> 'event' -> 'classes') = 2
    and (v_r -> 'event' -> 'prices' ->> 'tech_cents')::integer = 300 and (v_r -> 'event' -> 'prices' ->> 'adult_cents')::integer = 400
    and (v_r -> 'event' -> 'prices' ->> 'card_extra_cents')::integer = 25 and (v_r -> 'event' -> 'prices' ->> 'same_day_extra_cents')::integer = 100
    and (v_r -> 'event' -> 'prices' ->> 'same_day')::boolean = false
    and (v_r -> 'event' ->> 'child_max_age')::integer = 12
    and jsonb_array_length(v_r -> 'event' -> 'chart') = jsonb_array_length(v_orig));
  perform pg_temp.chk('D1 nothing private or internal in the page''s answer (no Square, no submission, no registration)',
    v_r::text !~* 'square|submission|registration_id|recorded_by|link_url|order_id');
  perform pg_temp.chk('D1 a class has the agreed keys',
    not exists (select 1 from jsonb_array_elements(v_r -> 'event' -> 'classes') x
                 where (select array_agg(k order by k collate "C") from jsonb_object_keys(x) as k)
                       is distinct from array['end_time', 'id', 'name', 'start_time']));
  perform pg_temp.chk('D1 the same-day flag is true for the event whose date is today',
    (public.brk_public_event(v_code_w0) -> 'event' -> 'prices' ->> 'same_day')::boolean is true);
  perform pg_temp.st('D1 unknown code', public.brk_public_event('zzzzzzzz'), 'not_found');
  perform pg_temp.st('D1 malformed code', public.brk_public_event('ABC'), 'not_found');
  perform pg_temp.st('D1 null code', public.brk_public_event(null), 'not_found');
  perform pg_temp.chk('D1 registration switched off shows as closed; so does a date that has passed',
    public.brk_public_event(v_code_cl) -> 'event' ->> 'registration_state' = 'closed'
    and public.brk_public_event(v_code_pa) -> 'event' ->> 'registration_state' = 'closed');

  -- D2. the price maths: every combination, the stored row
  --   (cash / check: 300 and 400 a board; card: +25 a board; same day: +100 a board; both: +125)
  v_n := pg_temp.regs(v_w1);
  -- cash, Child (age 12 = the last Child age), 3 technical boards: 3 x 300 = 900
  v_sub_p1 := gen_random_uuid();
  v_r := pg_temp.st('D2 cash child t3 a0', pg_temp.sg(v_code_w1, v_key, v_sub_p1, 'Pia', 12, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'ok');
  v_p1 := (v_r ->> 'registration_id')::uuid;
  perform pg_temp.chk('D2 answer: amount 900, paying_by cash, not same day',
    (v_r ->> 'amount_cents')::integer = 900 and v_r ->> 'paying_by' = 'cash' and (v_r ->> 'same_day')::boolean = false);
  perform pg_temp.chk('D2 stored row: band child, boards 3/0, cash both ways, not same day, 900, source form, not broke, this event and class',
    exists (select 1 from public.brk_registrations r where r.id = v_p1 and r.band_used = 'child' and r.tech_boards = 3 and r.adult_boards = 0
              and r.paying_by = 'cash' and r.paying_by_on_form = 'cash' and r.same_day = false and r.amount_cents = 900
              and r.source = 'form' and r.broke = false and r.override_cents is null and r.event_id = v_w1 and r.class_id = v_w1a
              and r.first_name = 'Pia' and r.last_name = 'Tester' and r.age = 12 and r.rank_name = v_rk_child and r.version >= 1));
  perform pg_temp.chk('D2 a registration made by the family form is not paid and holds no payment', pg_temp.npay(v_p1) = 0);
  -- check, 1 technical + 2 adult: 300 + 800 = 1100
  v_p2 := (pg_temp.st('D2 check child t1 a2', pg_temp.sg(v_code_w1, v_key, gen_random_uuid(), 'Pam', 12, v_rk_child, v_w1a, 1, 2, 'check', 1100), 'ok') ->> 'registration_id')::uuid;
  perform pg_temp.chk('D2 check: 1100', (select r.amount_cents from public.brk_registrations r where r.id = v_p2) = 1100
    and (select r.paying_by from public.brk_registrations r where r.id = v_p2) = 'check');
  -- card: +25 a board: 3 x 325 = 975; and 1 x 325 + 2 x 425 = 1175
  v_sub_c1 := gen_random_uuid();
  v_r := pg_temp.st('D2 card child t3 a0', pg_temp.sg(v_code_w1, v_key, v_sub_c1, 'Cam', 12, v_rk_child, v_w1a, 3, 0, 'card', 975), 'ok');
  v_c1 := (v_r ->> 'registration_id')::uuid;
  perform pg_temp.chk('D2 card: 975, paying_by card', (v_r ->> 'amount_cents')::integer = 975 and v_r ->> 'paying_by' = 'card'
    and (select r.amount_cents from public.brk_registrations r where r.id = v_c1) = 975);
  v_sub_c2 := gen_random_uuid();
  v_c2 := (pg_temp.st('D2 card child t1 a2', pg_temp.sg(v_code_w1, v_key, v_sub_c2, 'Cy', 12, v_rk_child, v_w1b, 1, 2, 'card', 1175), 'ok') ->> 'registration_id')::uuid;
  perform pg_temp.chk('D2 card 1175', (select r.amount_cents from public.brk_registrations r where r.id = v_c2) = 1175);
  -- Teen at 13: band teen; 3 adult boards = 1200
  v_p3 := (pg_temp.st('D2 cash teen age 13 t0 a3', pg_temp.sg(v_code_w1, v_key, gen_random_uuid(), 'Tia', 13, v_rk_child, v_w1a, 0, 3, 'cash', 1200), 'ok') ->> 'registration_id')::uuid;
  perform pg_temp.chk('D2 age 13 is Teen (band_used teen), 1200',
    exists (select 1 from public.brk_registrations r where r.id = v_p3 and r.band_used = 'teen' and r.amount_cents = 1200));
  -- age 12 Child vs age 13 Teen with the SAME rank name: the bands differ, nothing else about the rank does
  perform pg_temp.chk('D2 age 12 gave band child',
    (select r.band_used from public.brk_registrations r where r.id = v_p1) = 'child');
  -- a Little Tiger rank uses the tiger row (any age), a Black Belt rank uses the black row (age ignored)
  v_p4 := (pg_temp.st('D2 tiger rank age 5', pg_temp.sg(v_code_w1, v_key, gen_random_uuid(), 'Tig', 5, v_rk_tiger, v_w1a, 3, 0, 'cash', 900), 'ok') ->> 'registration_id')::uuid;
  perform pg_temp.chk('D2 a Little Tiger rank: band tiger',
    (select r.band_used from public.brk_registrations r where r.id = v_p4) = 'tiger');
  v_p5 := (pg_temp.st('D2 tiger rank age 40', pg_temp.sg(v_code_w1, v_key, gen_random_uuid(), 'Tga', 40, v_rk_tiger, v_w1a, 3, 0, 'cash', 900), 'ok') ->> 'registration_id')::uuid;
  perform pg_temp.chk('D2 a Little Tiger rank at any age: band tiger',
    (select r.band_used from public.brk_registrations r where r.id = v_p5) = 'tiger');
  v_p6 := (pg_temp.st('D2 black rank age 40', pg_temp.sg(v_code_w1, v_key, gen_random_uuid(), 'Bea', 40, v_rk_black, v_w1b, 4, 3, 'cash', 2400), 'ok') ->> 'registration_id')::uuid;
  v_p7 := (pg_temp.st('D2 black rank age 9', pg_temp.sg(v_code_w1, v_key, gen_random_uuid(), 'Bob', 9, v_rk_black, v_w1b, 4, 3, 'cash', 2400), 'ok') ->> 'registration_id')::uuid;
  perform pg_temp.chk('D2 a Black Belt rank ignores age: band black at 40 and at 9, 4 x 300 + 3 x 400 = 2400',
    (select count(*) from public.brk_registrations r where r.id in (v_p6, v_p7) and r.band_used = 'black' and r.amount_cents = 2400) = 2);
  perform pg_temp.chk('D2 nine registrations on W1 so far', pg_temp.regs(v_w1) - v_n = 9);

  -- same day (W0: the event date is today): +100 a board; card too: +125
  v_m1 := (pg_temp.st('D2 same day cash t3 a0', pg_temp.sg(v_code_w0, v_key, gen_random_uuid(), 'Sam', 12, v_rk_child, v_w0a, 3, 0, 'cash', 1200), 'ok') ->> 'registration_id')::uuid;
  perform pg_temp.chk('D2 same day: 3 x 400 = 1200, same_day true',
    exists (select 1 from public.brk_registrations r where r.id = v_m1 and r.amount_cents = 1200 and r.same_day = true));
  v_r := pg_temp.st('D2 same day card t1 a2', pg_temp.sg(v_code_w0, v_key, gen_random_uuid(), 'Sue', 12, v_rk_child, v_w0a, 1, 2, 'card', 1475), 'ok');
  v_m2 := (v_r ->> 'registration_id')::uuid;
  perform pg_temp.chk('D2 same day and card: 1 x 425 + 2 x 525 = 1475, answer says same_day',
    (v_r ->> 'amount_cents')::integer = 1475 and (v_r ->> 'same_day')::boolean is true
    and exists (select 1 from public.brk_registrations r where r.id = v_m2 and r.amount_cents = 1475 and r.same_day = true));
  perform pg_temp.chk('D2 the maths helper agrees with the numbers above', pg_temp.price(3, 0, false, true) = 1200 and pg_temp.price(1, 2, true, true) = 1475
    and pg_temp.exp(v_w1, 3, 0, 'card') = 975 and pg_temp.exp(v_w0, 3, 0, 'cash') = 1200);

  -- the price follows the settings of the moment (and the Child / Teen line moves with child_max_age)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_ver := (public.brk_settings_get() -> 'settings' ->> 'version')::integer;
  perform pg_temp.st('D2 settings: 350 / 450 / 30 / 110, child age line 11', public.brk_save_settings(v_ver, 350, 450, 30, 110, 11), 'ok');
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.st('D2 age 12 is now Teen; card, t0 a3 at the new prices', pg_temp.sg(v_code_w1, v_key, gen_random_uuid(), 'Ned', 12, v_rk_child, v_w1a, 0, 3, 'card', 3 * (450 + 30)), 'ok');
  perform pg_temp.chk('D2 new prices used (3 x 480 = 1440) and age 12 -> teen with the line at 11',
    exists (select 1 from public.brk_registrations r where r.id = (v_r ->> 'registration_id')::uuid and r.amount_cents = 1440 and r.band_used = 'teen'));
  perform pg_temp.chk('D2 the old registration kept its price after the settings changed',
    (select r.amount_cents from public.brk_registrations r where r.id = v_p1) = 900);
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('D2 settings put back', public.brk_save_settings(v_ver + 1, 300, 400, 25, 100, 12), 'ok');
  perform set_config('request.jwt.claims', '', true);

  -- D3. price changed: the new number comes back, nothing is written
  v_n := pg_temp.regs(v_w1);
  v_sub := gen_random_uuid();
  v_r := pg_temp.st('D3 a wrong expected total', pg_temp.sg(v_code_w1, v_key, v_sub, 'Pru', 12, v_rk_child, v_w1a, 3, 0, 'card', 900), 'price_changed');
  perform pg_temp.chk('D3 it names the right number (975) and wrote no registration',
    (v_r ->> 'amount_cents')::integer = 975 and pg_temp.regs(v_w1) = v_n and pg_temp.regof(v_sub) is null);
  perform pg_temp.st('D3 the retry with that number works', pg_temp.sg(v_code_w1, v_key, v_sub, 'Pru', 12, v_rk_child, v_w1a, 3, 0, 'card', 975), 'ok');
  perform pg_temp.chk('D3 now one registration more', pg_temp.regs(v_w1) = v_n + 1);

  -- D4. a retry returns the same registration (idempotent on the submission id)
  v_n := pg_temp.regs(v_w1);
  v_r := pg_temp.sg(v_code_w1, v_key, v_sub_p1, 'Pia', 12, v_rk_child, v_w1a, 3, 0, 'cash', 900);
  perform pg_temp.chk('D4 the same submission again: ok, the same registration, no new row',
    v_r ->> 'status' = 'ok' and (v_r ->> 'registration_id')::uuid = v_p1 and pg_temp.regs(v_w1) = v_n);
  v_r := pg_temp.sg(v_code_w1, v_key, v_sub_p1, 'Other', 12, v_rk_child, v_w1a, 3, 0, 'cash', 900);
  perform pg_temp.chk('D4 the same submission with other words: still the first registration, its words unchanged',
    v_r ->> 'status' = 'ok' and (v_r ->> 'registration_id')::uuid = v_p1 and pg_temp.regs(v_w1) = v_n
    and (select r.first_name from public.brk_registrations r where r.id = v_p1) = 'Pia');

  -- D4b. the same child under ANOTHER submission id: duplicate (capitals and spaces ignored); a different age or
  --      class is a different child; the same submission id still returns the first registration
  v_n := pg_temp.regs(v_w1);
  v_r := pg_temp.st('D4b the same event, name, age and class under a new submission id',
    public.brk_public_signup(v_code_w1, v_key, gen_random_uuid(), ' PIA ', 'tESTER', 12, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'duplicate');
  perform pg_temp.chk('D4b a duplicate says nothing about the other row and writes nothing',
    v_r - 'status' = '{}'::jsonb and pg_temp.regs(v_w1) = v_n);
  v_r := pg_temp.sg(v_code_w1, v_key, v_sub_p1, 'Pia', 12, v_rk_child, v_w1a, 3, 0, 'cash', 900);
  perform pg_temp.chk('D4b the same submission id is still a retry (ok, the same registration), not a duplicate',
    v_r ->> 'status' = 'ok' and (v_r ->> 'registration_id')::uuid = v_p1);
  perform pg_temp.st('D4b a different class is another child', public.brk_public_signup(v_code_w1, v_key, gen_random_uuid(), 'Pia', 'Tester', 12, v_rk_child, v_w1b, 3, 0, 'cash', 900), 'ok');
  perform pg_temp.st('D4b a different age is another child', public.brk_public_signup(v_code_w1, v_key, gen_random_uuid(), 'Pia', 'Tester', 11, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'ok');
  perform pg_temp.chk('D4b the attempts row of a duplicate says duplicate',
    exists (select 1 from public.brk_public_attempts a where a.client_key = v_key and a.outcome = 'duplicate'));

  -- D5. refusals: each answers invalid, nothing is written, and every try leaves an attempts row
  v_n := pg_temp.regs(v_w1);
  v_n2 := (select count(*) from public.brk_public_attempts a where a.client_key = v_key || '-inv');
  v_r := pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', 0, v_rk_child, v_w1a, 3, 0, 'cash', 900);
  perform pg_temp.st('D5 age 0', v_r, 'invalid');
  perform pg_temp.chk('D5 an invalid answer names a field', v_r ->> 'field' is not null);
  perform pg_temp.st('D5 age 100', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', 100, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'invalid');
  perform pg_temp.st('D5 no age', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', null, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'invalid');
  perform pg_temp.st('D5 unknown rank', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', 10, 'Zzz not a rank', v_w1a, 3, 0, 'cash', 900), 'invalid');
  perform pg_temp.st('D5 a class of ANOTHER event', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', 10, v_rk_child, v_s1a, 3, 0, 'cash', 900), 'invalid');
  perform pg_temp.st('D5 no class', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', 10, v_rk_child, null, 3, 0, 'cash', 900), 'invalid');
  perform pg_temp.st('D5 0 boards in all', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', 10, v_rk_child, v_w1a, 0, 0, 'cash', 0), 'invalid');
  perform pg_temp.st('D5 13 technical boards', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', 10, v_rk_child, v_w1a, 13, 0, 'cash', 3900), 'invalid');
  perform pg_temp.st('D5 13 adult boards', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', 10, v_rk_child, v_w1a, 0, 13, 'cash', 5200), 'invalid');
  perform pg_temp.st('D5 -1 boards', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', 10, v_rk_child, v_w1a, -1, 3, 'cash', 900), 'invalid');
  perform pg_temp.st('D5 empty first name', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), '', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'invalid');
  perform pg_temp.st('D5 blank first name', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), '   ', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'invalid');
  perform pg_temp.st('D5 empty last name', public.brk_public_signup(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', '', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'invalid');
  perform pg_temp.st('D5 unknown Paying by', pg_temp.sg(v_code_w1, v_key || '-inv', gen_random_uuid(), 'Ann', 10, v_rk_child, v_w1a, 3, 0, 'bitcoin', 900), 'invalid');
  perform pg_temp.st('D5 no key', public.brk_public_signup(v_code_w1, '', gen_random_uuid(), 'Ann', 'Tester', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'invalid');
  perform pg_temp.chk('D5 fifteen refusals wrote no registration', pg_temp.regs(v_w1) = v_n);
  perform pg_temp.chk('D5 every try with the key left an attempts row, outcome invalid (14 of them; the call with an empty key is not counted under a key)',
    (select count(*) from public.brk_public_attempts a where a.client_key = v_key || '-inv') - v_n2 = 14
    and not exists (select 1 from public.brk_public_attempts a where a.client_key = v_key || '-inv' and a.outcome <> 'invalid'));
  -- unknown / malformed code
  perform pg_temp.st('D5 unknown code', pg_temp.sg('zzzzzzzz', v_key, gen_random_uuid(), 'Ann', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'not_found');
  perform pg_temp.st('D5 malformed code', pg_temp.sg('nope', v_key, gen_random_uuid(), 'Ann', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'not_found');
  -- the honeypot is the Function's job: the database has no honeypot column or input
  perform pg_temp.chk('D5 no honeypot column in any Board breaking table and no honeypot input on the public function',
    not exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname like 'brk\_%' and a.attnum > 0 and a.attname ilike '%honey%')
    and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname like 'brk\_%' and pg_get_function_arguments(p.oid) ilike '%honey%'));

  -- D6. closed: registration off, or the event date has passed (the page still answers; the signup does not)
  v_n := pg_temp.regs(v_cl) + pg_temp.regs(v_pa);
  perform pg_temp.st('D6 registration switched off', pg_temp.sg(v_code_cl, v_key, gen_random_uuid(), 'Cla', 10, v_rk_child, v_cla, 3, 0, 'cash', 900), 'closed');
  perform pg_temp.st('D6 the event date has passed', pg_temp.sg(v_code_pa, v_key, gen_random_uuid(), 'Pat', 10, v_rk_child, v_paa, 3, 0, 'cash', 900), 'closed');
  perform pg_temp.chk('D6 nothing written', pg_temp.regs(v_cl) + pg_temp.regs(v_pa) = v_n);
  -- the event date is today: still open (the last day to register is the day itself)
  perform pg_temp.chk('D6 an event whose date is today still takes registrations (W0 worked above)', v_m1 is not null);

  -- D7. the rate limit: 30 tries an hour per client key, counted in this section's own table only
  v_txt := v_key || '-rate';
  insert into public.brk_public_attempts (client_key, event_id, outcome)
  select v_txt, v_w1, 'invalid' from generate_series(1, 29);
  perform pg_temp.st('D7 the 30th try', pg_temp.sg(v_code_w1, v_txt, gen_random_uuid(), 'Rae', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'ok');
  perform pg_temp.st('D7 the 31st try', pg_temp.sg(v_code_w1, v_txt, gen_random_uuid(), 'Ray', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'rate_limited');
  perform pg_temp.chk('D7 a refused try is counted as rate_limited',
    (select a.outcome from public.brk_public_attempts a where a.client_key = v_txt order by a.id desc limit 1) = 'rate_limited');
  perform pg_temp.st('D7 another key is not limited', pg_temp.sg(v_code_w1, v_txt || '2', gen_random_uuid(), 'Ray', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'ok');
  update public.brk_public_attempts set at = now() - interval '61 minutes' where client_key = v_txt;
  perform pg_temp.st('D7 tries older than an hour do not count', pg_temp.sg(v_code_w1, v_txt, gen_random_uuid(), 'Rob', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'ok');
  insert into public.brk_public_attempts (client_key, event_id, outcome, at) values (v_txt || '-old', v_w1, 'ok', now() - interval '3 days');
  perform pg_temp.st('D7 any call...', pg_temp.sg(v_code_w1, v_txt || '3', gen_random_uuid(), 'Rod', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'ok');
  perform pg_temp.chk('D7 ...removes attempts rows older than 2 days',
    not exists (select 1 from public.brk_public_attempts a where a.client_key = v_txt || '-old'));

  -- D7b. per-client limit: tries that were themselves rate_limited are not counted
  v_txt := v_key || '-rl2';
  insert into public.brk_public_attempts (client_key, event_id, outcome) select v_txt, v_w1, 'invalid' from generate_series(1, 29);
  insert into public.brk_public_attempts (client_key, event_id, outcome) select v_txt, v_w1, 'rate_limited' from generate_series(1, 50);
  perform pg_temp.st('D7b 29 counted tries and 50 turned away: the next one is allowed', pg_temp.sg(v_code_w1, v_txt, gen_random_uuid(), 'Rhea', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'ok');
  perform pg_temp.st('D7b now 30 counted: the next is rate_limited', pg_temp.sg(v_code_w1, v_txt, gen_random_uuid(), 'Rhoda', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'rate_limited');
  perform pg_temp.st('D7b ... and a blocked client is not locked out for ever by trying again (the refused try is not counted)',
    pg_temp.sg(v_code_w1, v_txt, gen_random_uuid(), 'Rhoda', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'rate_limited');
  perform pg_temp.chk('D7b the refused tries were not counted: still 30 counted tries',
    (select count(*) from public.brk_public_attempts a where a.client_key = v_txt and a.outcome <> 'rate_limited') = 30);

  -- the two events for the 500-student cap and the 300-tries-an-event limit (made as the admin)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('D7c add the FULL event', public.brk_add_event(v_tag || ' FULL', 'worcester', v_today + 21, v_w1), 'ok');
  v_fu := (v_r ->> 'event_id')::uuid; v_code_fu := v_r ->> 'public_code';
  perform pg_temp.st('D7c FULL open', pg_temp.op(v_fu, true), 'ok');
  v_fua := pg_temp.cls(v_fu, 1);
  v_r := pg_temp.st('D7c add the RL event', public.brk_add_event(v_tag || ' RL', 'worcester', v_today + 22, v_w1), 'ok');
  v_rl := (v_r ->> 'event_id')::uuid; v_code_rl := v_r ->> 'public_code';
  perform pg_temp.st('D7c RL open', pg_temp.op(v_rl, true), 'ok');
  v_rla := pg_temp.cls(v_rl, 1);
  perform set_config('request.jwt.claims', '', true);

  -- D7d. full at 500 students
  insert into public.brk_registrations (event_id, class_id, first_name, last_name, age, rank_name, band_used, tech_boards, adult_boards,
                                        paying_by, paying_by_on_form, same_day, amount_cents, source, entered_by, created_by_name, updated_by_name)
  select v_fu, v_fua, 'Fill' || g, 'Test', 10, v_rk_child, 'child', 3, 0, 'cash', 'cash', false, 900, 'desk', 'zz test', '', ''
    from generate_series(1, 499) as g;
  perform pg_temp.chk('D7d 499 students are in the FULL event', pg_temp.regs(v_fu) = 499);
  perform pg_temp.st('D7d the 500th student is let in', pg_temp.sg(v_code_fu, v_key || '-fu', gen_random_uuid(), 'Last', 10, v_rk_child, v_fua, 3, 0, 'cash', 900), 'ok');
  v_r := pg_temp.st('D7d the 501st is turned away as full', pg_temp.sg(v_code_fu, v_key || '-fu', gen_random_uuid(), 'Over', 10, v_rk_child, v_fua, 3, 0, 'cash', 900), 'full');
  perform pg_temp.chk('D7d full writes nothing, gives no number, and is logged as an attempt',
    pg_temp.regs(v_fu) = 500 and v_r - 'status' = '{}'::jsonb
    and exists (select 1 from public.brk_public_attempts a where a.client_key = v_key || '-fu' and a.outcome = 'full'));
  perform pg_temp.st('D7d a retry with an existing submission id on a full event still answers the first registration',
    pg_temp.sg(v_code_fu, v_key || '-fu', (select r.submission_id from public.brk_registrations r where r.event_id = v_fu and r.first_name = 'Last'), 'Last', 10, v_rk_child, v_fua, 3, 0, 'cash', 900), 'ok');
  -- (the desk can still add a student to a full event: the cap is the family form's)
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('D7d the desk can still add a walk-in', public.brk_add_student(v_fu, 'Desk', 'Added', 10, v_rk_child, v_fua, 3, 0, 'cash'), 'ok');
  perform set_config('request.jwt.claims', '', true);

  -- D7e. 300 counted tries an hour per event (all client keys together); rate_limited tries are not counted
  insert into public.brk_public_attempts (client_key, event_id, outcome) select 'zz-evt-' || g, v_rl, 'invalid' from generate_series(1, 300) as g;
  v_r := pg_temp.st('D7e 300 tries at the event in the last hour', pg_temp.sg(v_code_rl, v_key || '-rl', gen_random_uuid(), 'Ann', 10, v_rk_child, v_rla, 3, 0, 'cash', 900), 'rate_limited');
  perform pg_temp.chk('D7e it was logged as rate_limited and wrote no student',
    pg_temp.regs(v_rl) = 0 and exists (select 1 from public.brk_public_attempts a where a.client_key = v_key || '-rl' and a.outcome = 'rate_limited'));
  delete from public.brk_public_attempts where client_key like 'zz-evt-%' or client_key = v_key || '-rl';
  insert into public.brk_public_attempts (client_key, event_id, outcome) select 'zz-evt-' || g, v_rl, 'invalid' from generate_series(1, 299) as g;
  insert into public.brk_public_attempts (client_key, event_id, outcome) select 'zz-evt-r' || g, v_rl, 'rate_limited' from generate_series(1, 100) as g;
  perform pg_temp.st('D7e 299 counted + 100 turned away: still allowed', pg_temp.sg(v_code_rl, v_key || '-rl', gen_random_uuid(), 'Ann', 10, v_rk_child, v_rla, 3, 0, 'cash', 900), 'ok');
  perform pg_temp.st('D7e now 300 counted: turned away', pg_temp.sg(v_code_rl, v_key || '-rl2', gen_random_uuid(), 'Bea', 10, v_rk_child, v_rla, 3, 0, 'cash', 900), 'rate_limited');
  update public.brk_public_attempts set at = now() - interval '61 minutes' where event_id = v_rl;
  perform pg_temp.st('D7e tries older than an hour do not count', pg_temp.sg(v_code_rl, v_key || '-rl3', gen_random_uuid(), 'Cal', 10, v_rk_child, v_rla, 3, 0, 'cash', 900), 'ok');
  perform pg_temp.chk('D7e the limit is per event: W1 was not affected', pg_temp.regs(v_w1) > 0);

  -- D8. the form logs as "Family form" even if a staff token was left in the session
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_sub := gen_random_uuid();
  v_r := pg_temp.st('D8 signup with a staff token set', pg_temp.sg(v_code_w1, v_key, v_sub, 'Fay', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'ok');
  perform pg_temp.chk('D8 the history says Family form, not the staff member',
    exists (select 1 from public.change_log l where l.table_name = 'brk_registrations' and l.record_id = (v_r ->> 'registration_id')::uuid
              and l.op = 'insert' and l.actor_name = 'Family form')
    and not exists (select 1 from public.change_log l where l.record_id = (v_r ->> 'registration_id')::uuid and l.actor_name in (v_an, v_dn))
    and coalesce(current_setting('request.jwt.claims', true), '') = '');
  perform set_config('request.jwt.claims', '', true);

  -- D9. the family's own page (Try again, the return page) and the Square link
  v_r := pg_temp.st('D9 the family''s page', public.brk_public_registration(v_code_w1, v_sub_c1), 'ok');
  perform pg_temp.chk('D9 registration id, 975 owed and a balance of 975, card, not paid, no link yet',
    (v_r ->> 'registration_id')::uuid = v_c1 and (v_r ->> 'amount_cents')::integer = 975 and (v_r ->> 'balance_cents')::integer = 975
    and v_r ->> 'paying_by' = 'card'
    and (v_r ->> 'paid')::boolean = false and (v_r ->> 'has_link')::boolean = false and v_r ->> 'link_url' is null);
  perform pg_temp.st('D9 a wrong submission id', public.brk_public_registration(v_code_w1, gen_random_uuid()), 'not_found');
  perform pg_temp.st('D9 the submission of ANOTHER event', public.brk_public_registration(v_code_s1, v_sub_c1), 'not_found');
  perform pg_temp.st('D9 an unknown code', public.brk_public_registration('zzzzzzzz', v_sub_c1), 'not_found');
  perform pg_temp.st('D9 the link: not found for another submission', public.brk_public_set_link(v_c1, gen_random_uuid(), 'ord-c1', 'https://square.link/u/c1', 975), 'not_found');
  perform pg_temp.st('D9 the link: unknown registration', public.brk_public_set_link(gen_random_uuid(), v_sub_c1, 'ord-c1', 'https://square.link/u/c1', 975), 'not_found');
  perform pg_temp.st('D9 a bad order id', public.brk_public_set_link(v_c1, v_sub_c1, 'bad order!', 'https://square.link/u/c1', 975), 'invalid');
  -- the amount the link was made for must be what is owed now (the balance)
  v_r := pg_temp.st('D9 a link made for 974 when 975 is owed', public.brk_public_set_link(v_c1, v_sub_c1, 'ord-c1', 'https://square.link/u/c1', 974), 'price_changed');
  perform pg_temp.chk('D9 ... answers the balance (975) and stores nothing',
    (v_r ->> 'amount_cents')::integer = 975 and (select r.square_link_url from public.brk_registrations r where r.id = v_c1) is null);
  -- the host list: only these hosts, whole host, https, no user name, no port
  foreach v_txt in array array['https://evil.example/pay/x', 'http://square.link/u/x', 'https://square.link.evil.example/u/x',
                               'https://evilsquare.link/u/x', 'https://square.link@evil.example/u/x', 'https://user@square.link/u/x',
                               'https://user:pw@square.link/u/x', 'https://square.link:443/u/x', 'https://square.link:80@evil.example/x',
                               'https://evil.example/square.link', 'https://evil.example#@square.link/x', 'ftp://square.link/u/x',
                               'javascript:alert(1)', '//square.link/u/x', 'square.link/u/x', 'https://square.link\@evil.example/x',
                               'https://sq.link/u/x', 'https://squareup.com/u/x', 'https://', ''] loop
    v_r := public.brk_public_set_link(v_c1, v_sub_c1, 'ord-c1', v_txt, 975);
    if v_r ->> 'status' is distinct from 'invalid' or v_r ->> 'field' is distinct from 'link_url' then
      raise exception 'TEST FAILED: D9 the link % must be refused as invalid / link_url, got %', v_txt, v_r;
    end if;
  end loop;
  perform pg_temp.chk('D9 the 20 wrong links were refused as invalid / link_url and none was stored',
    (select r.square_link_url from public.brk_registrations r where r.id = v_c1) is null);
  perform pg_temp.st('D9 store the link (square.link)', public.brk_public_set_link(v_c1, v_sub_c1, 'ord-c1', 'https://square.link/u/c1', 975), 'ok');
  perform pg_temp.st('D9 a second link is refused', public.brk_public_set_link(v_c1, v_sub_c1, 'ord-c1b', 'https://square.link/u/c1b', 975), 'link_exists');
  -- every host on the list is accepted (one new card registration each; the host is compared in small letters)
  v_i := 0;
  foreach v_txt in array array['https://checkout.square.site/merchant/x/checkout/y', 'https://connect.squareup.com/v2/online-checkout/z',
                               'https://sandbox.square.link/u/x', 'https://connect.squareupsandbox.com/v2/online-checkout/z',
                               'https://checkout.squareupsandbox.com/pay/x', 'https://SQUARE.LINK/u/UPPER'] loop
    v_i := v_i + 1;
    v_sub := gen_random_uuid();
    v_x := pg_temp.sg(v_code_w1, v_key || 'h', v_sub, 'Host' || v_i, 10, v_rk_child, v_w1a, 3, 0, 'card', 975);
    if v_x ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: D9 host test registration % answered %', v_i, v_x; end if;
    v_r := public.brk_public_set_link((v_x ->> 'registration_id')::uuid, v_sub, 'ord-host' || v_i, v_txt, 975);
    if v_r ->> 'status' is distinct from 'ok' then
      raise exception 'TEST FAILED: D9 the link % must be accepted, got %', v_txt, v_r;
    end if;
  end loop;
  perform pg_temp.chk('D9 all six Square hosts are accepted', true);
  perform pg_temp.chk('D9 the first link stayed',
    exists (select 1 from public.brk_registrations r where r.id = v_c1 and r.square_order_id = 'ord-c1' and r.square_link_url = 'https://square.link/u/c1'));
  v_r := public.brk_public_registration(v_code_w1, v_sub_c1);
  perform pg_temp.chk('D9 now the family''s page returns the link',
    (v_r ->> 'has_link')::boolean = true and v_r ->> 'link_url' = 'https://square.link/u/c1');
  v_sub_c3 := gen_random_uuid();
  v_c3 := (pg_temp.st('D9 a card registration to pay at the desk', pg_temp.sg(v_code_w1, v_key, v_sub_c3, 'Cid', 10, v_rk_child, v_w1a, 3, 0, 'card', 975), 'ok') ->> 'registration_id')::uuid;

  -- ===================================================================
  -- E. Staff: Add student, Edit, price override, Mark broke (the desk is a role-staff session)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := pg_temp.st('E1 desk adds a walk-in', public.brk_add_student(v_w1, 'Walt', 'Walkin', 11, v_rk_child, v_w1a, 3, 0, 'cash'), 'ok');
  v_p7 := (v_r ->> 'registration_id')::uuid;
  perform pg_temp.chk('E1 answer: amount 900, a version; row: source desk, 900, child, not same day, entered_by the desk',
    (v_r ->> 'amount_cents')::integer = 900 and (v_r ->> 'version')::integer = pg_temp.rv(v_p7)
    and exists (select 1 from public.brk_registrations r where r.id = v_p7 and r.source = 'desk' and r.amount_cents = 900
                  and r.band_used = 'child' and r.same_day = false and r.paying_by_on_form = 'cash'));
  v_r := pg_temp.st('E1 a walk-in on the same-day event, card, 1 technical + 2 adult', public.brk_add_student(v_w0, 'Wanda', 'Walkin', 11, v_rk_child, v_w0a, 1, 2, 'card'), 'ok');
  perform pg_temp.chk('E1 the same-day price from the event date on (+100 a board, +25 card): 1475',
    (v_r ->> 'amount_cents')::integer = 1475
    and exists (select 1 from public.brk_registrations r where r.id = (v_r ->> 'registration_id')::uuid and r.same_day = true and r.source = 'desk'));
  v_r := pg_temp.st('E1 a walk-in works while registration is switched off', public.brk_add_student(v_cl, 'Wes', 'Walkin', 11, v_rk_child, v_cla, 3, 0, 'check'), 'ok');
  perform pg_temp.chk('E1 ... and priced as usual (900)', (v_r ->> 'amount_cents')::integer = 900);
  perform pg_temp.st('E1 a Little Tiger rank at the desk', public.brk_add_student(v_w1, 'Wen', 'Walkin', 7, v_rk_tiger, v_w1a, 3, 0, 'cash'), 'ok');
  perform pg_temp.chk('E1 ... uses the tiger row', exists (select 1 from public.brk_registrations r where r.event_id = v_w1 and r.first_name = 'Wen' and r.band_used = 'tiger'));
  v_n := pg_temp.regs(v_w1);
  perform pg_temp.st('E1 unknown event', public.brk_add_student(gen_random_uuid(), 'Ann', 'X', 10, v_rk_child, v_w1a, 3, 0, 'cash'), 'not_found');
  perform pg_temp.st('E1 age 0', public.brk_add_student(v_w1, 'Ann', 'X', 0, v_rk_child, v_w1a, 3, 0, 'cash'), 'invalid');
  perform pg_temp.st('E1 age 100', public.brk_add_student(v_w1, 'Ann', 'X', 100, v_rk_child, v_w1a, 3, 0, 'cash'), 'invalid');
  perform pg_temp.st('E1 unknown rank', public.brk_add_student(v_w1, 'Ann', 'X', 10, 'Zzz not a rank', v_w1a, 3, 0, 'cash'), 'invalid');
  perform pg_temp.st('E1 a class of another event', public.brk_add_student(v_w1, 'Ann', 'X', 10, v_rk_child, v_s1a, 3, 0, 'cash'), 'invalid');
  perform pg_temp.st('E1 0 boards', public.brk_add_student(v_w1, 'Ann', 'X', 10, v_rk_child, v_w1a, 0, 0, 'cash'), 'invalid');
  perform pg_temp.st('E1 13 boards', public.brk_add_student(v_w1, 'Ann', 'X', 10, v_rk_child, v_w1a, 13, 0, 'cash'), 'invalid');
  perform pg_temp.st('E1 empty name', public.brk_add_student(v_w1, '', 'X', 10, v_rk_child, v_w1a, 3, 0, 'cash'), 'invalid');
  perform pg_temp.st('E1 unknown Paying by', public.brk_add_student(v_w1, 'Ann', 'X', 10, v_rk_child, v_w1a, 3, 0, 'bitcoin'), 'invalid');
  perform pg_temp.chk('E1 refused walk-ins wrote nothing', pg_temp.regs(v_w1) = v_n);

  -- E2. Edit: the amount is worked out again with the same maths
  v_r := pg_temp.st('E2 stale version', public.brk_edit_registration(v_p1, pg_temp.rv(v_p1) - 1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 3, 0, 'cash'), 'stale');
  perform pg_temp.st('E2 unknown registration', public.brk_edit_registration(gen_random_uuid(), 1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 3, 0, 'cash'), 'not_found');
  v_ver := pg_temp.rv(v_p1);
  v_r := pg_temp.st('E2 more boards', pg_temp.ed(v_p1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 3, 1, 'cash'), 'ok');
  perform pg_temp.chk('E2 3 x 300 + 1 x 400 = 1300, a new version, no link was involved',
    (v_r ->> 'amount_cents')::integer = 1300 and (v_r ->> 'version')::integer > v_ver and (v_r ->> 'link_cleared')::boolean = false
    and exists (select 1 from public.brk_registrations r where r.id = v_p1 and r.amount_cents = 1300 and r.tech_boards = 3 and r.adult_boards = 1));
  perform pg_temp.chk('E2 the roster shows owed 1300 to the desk', (pg_temp.rr(v_w1, v_p1) ->> 'owed_cents')::integer = 1300);
  -- Paying by card at the edit adds 25c a board
  v_r := pg_temp.st('E2 Paying by card', pg_temp.ed(v_p1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 3, 1, 'card'), 'ok');
  perform pg_temp.chk('E2 card: 3 x 325 + 1 x 425 = 1400 (the old page forgot this)', (v_r ->> 'amount_cents')::integer = 1400);
  v_r := pg_temp.st('E2 age 13 and a new class', pg_temp.ed(v_p1, 'Pia', 'Tester', 13, v_rk_child, v_w1b, 3, 1, 'cash'), 'ok');
  perform pg_temp.chk('E2 back to cash 1300; band teen at 13; class B; the form''s own Paying by never changes',
    exists (select 1 from public.brk_registrations r where r.id = v_p1 and r.amount_cents = 1300 and r.band_used = 'teen' and r.class_id = v_w1b
              and r.paying_by = 'cash' and r.paying_by_on_form = 'cash'));
  perform pg_temp.fails(format('update public.brk_registrations set paying_by_on_form = %L where id = %L', 'card', v_p1));
  perform pg_temp.chk('E2 paying_by_on_form can never change (a direct write is refused, or put back): still cash',
    (select r.paying_by_on_form from public.brk_registrations r where r.id = v_p1) = 'cash');
  perform pg_temp.ed(v_p1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 3, 0, 'cash');
  -- refusals
  v_n := pg_temp.rv(v_p1);
  perform pg_temp.st('E2 age 0', pg_temp.ed(v_p1, 'Pia', 'Tester', 0, v_rk_child, v_w1a, 3, 0, 'cash'), 'invalid');
  perform pg_temp.st('E2 unknown rank', pg_temp.ed(v_p1, 'Pia', 'Tester', 12, 'Zzz', v_w1a, 3, 0, 'cash'), 'invalid');
  perform pg_temp.st('E2 a class of another event', pg_temp.ed(v_p1, 'Pia', 'Tester', 12, v_rk_child, v_s1a, 3, 0, 'cash'), 'invalid');
  perform pg_temp.st('E2 0 boards', pg_temp.ed(v_p1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 0, 0, 'cash'), 'invalid');
  perform pg_temp.st('E2 13 boards', pg_temp.ed(v_p1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 13, 0, 'cash'), 'invalid');
  perform pg_temp.st('E2 empty name', pg_temp.ed(v_p1, '', 'Tester', 12, v_rk_child, v_w1a, 3, 0, 'cash'), 'invalid');
  perform pg_temp.st('E2 unknown Paying by', pg_temp.ed(v_p1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 3, 0, 'bitcoin'), 'invalid');
  perform pg_temp.chk('E2 refusals changed nothing (the version stayed)', pg_temp.rv(v_p1) = v_n
    and (select r.amount_cents from public.brk_registrations r where r.id = v_p1) = 900);

  -- E3. the Square link is cleared when it can no longer be right (v1.303)
  --   C1 card, link set in D9: a words-only edit keeps it
  v_r := pg_temp.st('E3 a name-only edit of a card registration with a link', pg_temp.ed(v_c1, 'Cam', 'Newname', 12, v_rk_child, v_w1a, 3, 0, 'card'), 'ok');
  perform pg_temp.chk('E3 the link stays (nothing about the amount changed)',
    (v_r ->> 'link_cleared')::boolean = false and (v_r ->> 'amount_cents')::integer = 975
    and exists (select 1 from public.brk_registrations r where r.id = v_c1 and r.square_order_id = 'ord-c1' and r.square_link_url = 'https://square.link/u/c1'));
  v_r := pg_temp.st('E3 a class change', pg_temp.ed(v_c1, 'Cam', 'Newname', 12, v_rk_child, v_w1b, 3, 0, 'card'), 'ok');
  perform pg_temp.chk('E3 a class change keeps the link too',
    (v_r ->> 'link_cleared')::boolean = false and (select r.square_order_id from public.brk_registrations r where r.id = v_c1) = 'ord-c1');
  --   a card registration with NO link: a boards edit has nothing to clear
  v_r := pg_temp.st('E3 a boards change with no link', pg_temp.ed(v_c3, 'Cid', 'Tester', 10, v_rk_child, v_w1a, 2, 0, 'card'), 'ok');
  perform pg_temp.chk('E3 no link to clear: link_cleared false, 2 x 325 = 650',
    (v_r ->> 'link_cleared')::boolean = false and (select r.amount_cents from public.brk_registrations r where r.id = v_c3) = 650);
  --   the boards change on a card registration with an unpaid link: cleared
  v_r := pg_temp.st('E3 an amount change on a card registration with an unpaid link', pg_temp.ed(v_c1, 'Cam', 'Newname', 12, v_rk_child, v_w1b, 3, 1, 'card'), 'ok');
  perform pg_temp.chk('E3 the link is cleared (order and url), the new amount 3 x 325 + 425 = 1400',
    (v_r ->> 'link_cleared')::boolean = true and (v_r ->> 'amount_cents')::integer = 1400
    and exists (select 1 from public.brk_registrations r where r.id = v_c1 and r.square_order_id is null and r.square_link_url is null));
  perform pg_temp.chk('E3 the cleared order id was remembered with its student (brk_cleared_links, written by the trigger)',
    exists (select 1 from public.brk_cleared_links c where c.order_id = 'ord-c1' and c.registration_id = v_c1)
    and (select count(*) from public.brk_cleared_links c where c.registration_id = v_c1) = 1);
  perform pg_temp.chk('E3 the family''s page no longer has a link',
    (public.brk_public_registration(v_code_w1, v_sub_c1) ->> 'has_link')::boolean = false);
  perform pg_temp.st('E3 a new link can be stored after it was cleared (a new order)', public.brk_public_set_link(v_c1, v_sub_c1, 'ord-c1-new', 'https://square.link/u/c1new', pg_temp.bal(v_c1)), 'ok');
  perform set_config('request.jwt.claims', v_c_d1, true);   -- (the family-form functions clear the token: put the desk's back)
  --   Paying by leaving card clears it, and card again does not bring it back
  perform pg_temp.st('E3 C2 gets a link', public.brk_public_set_link(v_c2, v_sub_c2, 'ord-c2', 'https://square.link/u/c2', pg_temp.bal(v_c2)), 'ok');
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := pg_temp.st('E3 C2 moves from card to check', pg_temp.ed(v_c2, 'Cy', 'Tester', 12, v_rk_child, v_w1b, 1, 2, 'check'), 'ok');
  perform pg_temp.chk('E3 the cleared order id of C2 was remembered too',
    exists (select 1 from public.brk_cleared_links c where c.order_id = 'ord-c2' and c.registration_id = v_c2));
  perform pg_temp.chk('E3 the link is cleared and the amount is the check price 300 + 800',
    (v_r ->> 'link_cleared')::boolean = true and (v_r ->> 'amount_cents')::integer = 1100
    and exists (select 1 from public.brk_registrations r where r.id = v_c2 and r.square_order_id is null and r.square_link_url is null
                  and r.paying_by = 'check' and r.paying_by_on_form = 'card'));
  v_r := pg_temp.st('E3 back to card', pg_temp.ed(v_c2, 'Cy', 'Tester', 12, v_rk_child, v_w1b, 1, 2, 'card'), 'ok');
  perform pg_temp.chk('E3 back to card: still no link, and nothing to clear',
    (v_r ->> 'link_cleared')::boolean = false and (select r.square_link_url from public.brk_registrations r where r.id = v_c2) is null);

  -- E4. broke: toggled, with its date; stale answers stale
  v_r := pg_temp.st('E4 mark broke', public.brk_set_broke(v_p1, pg_temp.rv(v_p1), true), 'ok');
  perform pg_temp.chk('E4 broke true with today''s date',
    v_r ->> 'broke_on' = v_today::text and exists (select 1 from public.brk_registrations r where r.id = v_p1 and r.broke = true and r.broke_on = v_today));
  v_ver := pg_temp.rv(v_p1);
  perform pg_temp.st('E4 stale', public.brk_set_broke(v_p1, v_ver - 1, false), 'stale');
  v_r := pg_temp.st('E4 undo (broke false)', public.brk_set_broke(v_p1, v_ver, false), 'ok');
  perform pg_temp.chk('E4 broke false and no date', v_r ->> 'broke_on' is null
    and exists (select 1 from public.brk_registrations r where r.id = v_p1 and r.broke = false and r.broke_on is null));
  perform pg_temp.st('E4 unknown registration', public.brk_set_broke(gen_random_uuid(), 1, true), 'not_found');

  -- E5. price override (admin): the amount owed; null clears it; a set override stays through Edit
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('E5 stale', public.brk_set_override(v_p2, pg_temp.rv(v_p2) - 1, 500), 'stale');
  perform pg_temp.st('E5 -1', pg_temp.ov(v_p2, -1), 'invalid');
  perform pg_temp.st('E5 1000001', pg_temp.ov(v_p2, 1000001), 'invalid');
  perform pg_temp.st('E5 unknown registration', public.brk_set_override(gen_random_uuid(), 1, 500), 'not_found');
  v_r := pg_temp.st('E5 override 500', pg_temp.ov(v_p2, 500), 'ok');
  perform pg_temp.chk('E5 stored; the roster owes 500 while the worked-out amount stays 1100',
    exists (select 1 from public.brk_registrations r where r.id = v_p2 and r.override_cents = 500 and r.amount_cents = 1100)
    and (pg_temp.rr(v_w1, v_p2) ->> 'owed_cents')::integer = 500 and (pg_temp.rr(v_w1, v_p2) ->> 'override_cents')::integer = 500
    and (pg_temp.rr(v_w1, v_p2) ->> 'amount_cents')::integer = 1100);
  v_r := pg_temp.st('E5 an edit with an override set', pg_temp.ed(v_p2, 'Pam', 'Tester', 12, v_rk_child, v_w1a, 2, 0, 'check'), 'ok');
  perform pg_temp.chk('E5 an edit keeps the override and recomputes the amount',
    (v_r ->> 'amount_cents')::integer = 600
    and (pg_temp.rr(v_w1, v_p2) ->> 'owed_cents')::integer = 500 and (pg_temp.rr(v_w1, v_p2) ->> 'amount_cents')::integer = 600);
  perform pg_temp.ov(v_p2, 0);
  perform pg_temp.chk('E5 an override of 0 is allowed (owed 0)', (pg_temp.rr(v_w1, v_p2) ->> 'owed_cents')::integer = 0);
  perform pg_temp.st('E5 clear the override', pg_temp.ov(v_p2, null), 'ok');
  perform pg_temp.chk('E5 cleared: owed is the worked-out amount again',
    (pg_temp.rr(v_w1, v_p2) ->> 'owed_cents')::integer = 600 and (pg_temp.rr(v_w1, v_p2) ->> 'override_cents') is null);

  -- ===================================================================
  -- F. Payments
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- F1. Mark paid: amount = owed (P1 owes 900)
  v_ver := pg_temp.rv(v_p1);
  perform pg_temp.st('F1 stale version', public.brk_mark_paid(v_p1, v_ver - 1, 'worcester', null), 'stale');
  perform pg_temp.st('F1 unknown school', public.brk_mark_paid(v_p1, v_ver, 'boston', null), 'invalid');
  perform pg_temp.st('F1 unknown way', public.brk_mark_paid(v_p1, v_ver, 'worcester', 'bitcoin'), 'invalid');
  perform pg_temp.st('F1 unknown registration', public.brk_mark_paid(gen_random_uuid(), 1, 'worcester', null), 'not_found');
  perform pg_temp.chk('F1 refusals wrote no payment', pg_temp.npay(v_p1) = 0);
  v_r := pg_temp.st('F1 mark paid (way left blank = Paying by)', public.brk_mark_paid(v_p1, v_ver, 'worcester', null), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.chk('F1 answer: 900, cash, at worcester, Paying by cash',
    (v_r ->> 'amount_cents')::integer = 900 and v_r ->> 'method' = 'cash' and v_r ->> 'school' = 'worcester' and v_r ->> 'paying_by' = 'cash'
    and (v_r ->> 'version')::integer = pg_temp.rv(v_p1));
  perform pg_temp.chk('F1 the payment row: kind payment, 900, cash, today, worcester, recorded by the desk',
    exists (select 1 from public.brk_payments p where p.id = v_pay and p.registration_id = v_p1 and p.kind = 'payment' and p.amount_cents = 900
              and p.method = 'cash' and p.paid_on = v_today and p.school = 'worcester' and p.recorded_by_name = v_dn
              and p.reverses_payment_id is null and p.square_payment_id is null));
  perform pg_temp.chk('F1 the roster: paid 900 of 900, the payment listed',
    (pg_temp.rr(v_w1, v_p1) ->> 'paid_cents')::integer = 900 and (pg_temp.rr(v_w1, v_p1) ->> 'owed_cents')::integer = 900
    and jsonb_array_length(pg_temp.rr(v_w1, v_p1) -> 'payments') = 1
    and (pg_temp.rr(v_w1, v_p1) -> 'payments' -> 0 ->> 'id')::uuid = v_pay);
  perform pg_temp.st('F1 paid twice', pg_temp.mp(v_p1, 'worcester', null), 'already_paid');
  perform pg_temp.chk('F1 still one payment', pg_temp.npay(v_p1) = 1);
  -- an edit after payment is allowed; it can't go below what was paid
  v_r := pg_temp.st('F1 edit below paid', pg_temp.ed(v_p1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 1, 0, 'cash'), 'amount_below_paid');
  perform pg_temp.chk('F1 amount_below_paid names what was paid, nothing changed',
    (v_r ->> 'paid_cents')::integer = 900 and (select r.amount_cents from public.brk_registrations r where r.id = v_p1) = 900);
  v_r := pg_temp.st('F1 edit after payment (more boards)', pg_temp.ed(v_p1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 3, 1, 'cash'), 'ok');
  perform pg_temp.chk('F1 the amount is worked out again after payment: 1300 (400 still owed)',
    (v_r ->> 'amount_cents')::integer = 1300 and (pg_temp.rr(v_w1, v_p1) ->> 'owed_cents')::integer = 1300 and pg_temp.paid(v_p1) = 900);
  perform pg_temp.ed(v_p1, 'Pia', 'Tester', 12, v_rk_child, v_w1a, 3, 0, 'cash');

  -- F2. Undo (staff: own payment within 10 seconds)
  v_r := pg_temp.st('F2 undo own payment at once', public.brk_undo_payment(v_pay), 'ok');
  perform pg_temp.chk('F2 a reversal row of exactly minus the payment; the net is 0; the version came back',
    exists (select 1 from public.brk_payments p where p.reverses_payment_id = v_pay and p.kind = 'reversal' and p.amount_cents = -900
              and p.registration_id = v_p1 and p.method = 'cash' and p.school = 'worcester')
    and pg_temp.paid(v_p1) = 0 and (v_r ->> 'version')::integer = pg_temp.rv(v_p1));
  perform pg_temp.st('F2 undo twice', public.brk_undo_payment(v_pay), 'stale');
  select p.id into v_rev from public.brk_payments p where p.reverses_payment_id = v_pay;
  perform pg_temp.st('F2 undo a reversal', public.brk_undo_payment(v_rev), 'stale');
  perform pg_temp.st('F2 unknown payment', public.brk_undo_payment(gen_random_uuid()), 'not_found');
  v_r := pg_temp.st('F2 mark paid again after the undo', pg_temp.mp(v_p1, 'worcester', null), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.chk('F2 paid again: net 900', pg_temp.paid(v_p1) = 900);
  -- an older payment of the desk's own (written straight in, 11 seconds ago): staff can't undo it; an admin can
  insert into public.brk_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_p3, 'payment', 1200, 'cash', v_today, 'worcester', now() - interval '11 seconds', v_desk, v_dn)
  returning id into v_pay2;
  perform pg_temp.chk('F2 the older payment counts toward the registration', pg_temp.paid(v_p3) = 1200);
  perform pg_temp.st('F2 staff undo after 10 seconds', public.brk_undo_payment(v_pay2), 'not_allowed');
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- an admin's payment: the desk can't undo it, the admin can
  v_r := pg_temp.st('F2 the admin marks P4 paid', pg_temp.mp(v_p4, 'worcester', null), 'ok');
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('F2 staff undo of someone else''s payment', public.brk_undo_payment((v_r ->> 'payment_id')::uuid), 'not_allowed');
  perform pg_temp.chk('F2 both refusals wrote no reversal', pg_temp.npay(v_p4) = 1 and pg_temp.npay(v_p3) = 1);
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('F2 admin undo of the desk''s older payment', public.brk_undo_payment(v_pay2), 'ok');
  perform pg_temp.st('F2 admin undo of their own payment', public.brk_undo_payment((v_r ->> 'payment_id')::uuid), 'ok');
  perform pg_temp.chk('F2 both registrations are unpaid again', pg_temp.paid(v_p3) = 0 and pg_temp.paid(v_p4) = 0);
  perform set_config('request.jwt.claims', v_c_d1, true);

  -- F3. a different way to pay: the payment's way, Paying by follows, Undo puts it back (Camps 0033)
  v_r := pg_temp.st('F3 mark P5 paid by check although it was cash', pg_temp.mp(v_p5, 'worcester', 'check'), 'ok');
  v_pay2 := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.chk('F3 the payment says check, Paying by is check now, the form''s own choice is still cash, the old way is remembered',
    v_r ->> 'method' = 'check' and v_r ->> 'paying_by' = 'check'
    and exists (select 1 from public.brk_payments p where p.id = v_pay2 and p.method = 'check' and p.paying_by_before = 'cash')
    and exists (select 1 from public.brk_registrations r where r.id = v_p5 and r.paying_by = 'check' and r.paying_by_on_form = 'cash'));
  perform pg_temp.st('F3 undo', public.brk_undo_payment(v_pay2), 'ok');
  perform pg_temp.chk('F3 Paying by is back to cash', exists (select 1 from public.brk_registrations r where r.id = v_p5 and r.paying_by = 'cash'));

  -- F4. Edit payment (admin): method, amount, date, school
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('F4 admin marks P6 paid', pg_temp.mp(v_p6, 'worcester', null), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  -- a payment date before the day the student was added is refused (and the payment is left alone)
  v_r := pg_temp.st('F4 a date before the student was added', public.brk_edit_payment(v_pay, 'cash', 2400, v_today - 1, 'worcester'), 'invalid');
  perform pg_temp.chk('F4 ... naming the date, writing nothing', v_r ->> 'field' = 'date' and pg_temp.npay(v_p6) = 1);
  perform pg_temp.st('F4 a date in the future', public.brk_edit_payment(v_pay, 'cash', 2400, v_today + 1, 'worcester'), 'invalid');
  perform pg_temp.st('F4 an invalid way', public.brk_edit_payment(v_pay, 'bitcoin', 2400, v_today, 'worcester'), 'invalid');
  perform pg_temp.st('F4 an invalid school', public.brk_edit_payment(v_pay, 'check', 2400, v_today, 'boston'), 'invalid');
  perform pg_temp.st('F4 an unknown payment', public.brk_edit_payment(gen_random_uuid(), 'check', 2400, v_today, 'worcester'), 'not_found');
  v_r := pg_temp.st('F4 edit: check, 2400, today, shrewsbury', public.brk_edit_payment(v_pay, 'check', 2400, v_today, 'shrewsbury'), 'ok');
  perform pg_temp.chk('F4 the net is still 2400 and the live payment carries the new words',
    pg_temp.paid(v_p6) = 2400
    and exists (select 1 from public.brk_payments p where p.registration_id = v_p6 and p.kind = 'payment' and p.method = 'check'
                  and p.paid_on = v_today and p.school = 'shrewsbury' and p.amount_cents = 2400
                  and not exists (select 1 from public.brk_payments q where q.reverses_payment_id = p.id)));
  perform pg_temp.st('F4 the old (corrected) payment can not be edited again', public.brk_edit_payment(v_pay, 'cash', 2400, v_today, 'worcester'), 'stale');
  v_pay := (select p.id from public.brk_payments p where p.registration_id = v_p6 and p.kind = 'payment' and p.square_payment_id is null
              and not exists (select 1 from public.brk_payments q where q.reverses_payment_id = p.id));
  perform pg_temp.st('F4 an amount of 2000', public.brk_edit_payment(v_pay, 'check', 2000, v_today, 'worcester'), 'ok');
  perform pg_temp.chk('F4 now 2000 is paid (400 short of 2400)', pg_temp.paid(v_p6) = 2000 and (pg_temp.rr(v_w1, v_p6) ->> 'paid_cents')::integer = 2000);
  perform pg_temp.st('F4 an amount of 2400 again', public.brk_edit_payment(
    (select p.id from public.brk_payments p where p.registration_id = v_p6 and p.kind = 'payment' and not exists (select 1 from public.brk_payments q where q.reverses_payment_id = p.id)),
    'check', 2400, v_today, 'worcester'), 'ok');

  -- F5. refunds (admin; cash or check; at most what was overpaid)
  --   P6 paid 2400 and owes 2400; an override of 2000 makes 400 overpaid
  perform pg_temp.st('F5 override 2000 on a paid registration', pg_temp.ov(v_p6, 2000), 'ok');
  perform pg_temp.st('F5 stale', public.brk_record_refund(v_p6, pg_temp.rv(v_p6) - 1, 'cash', 100, v_today, 'worcester'), 'stale');
  v_r := pg_temp.st('F5 401 is too much', public.brk_record_refund(v_p6, pg_temp.rv(v_p6), 'cash', 401, v_today, 'worcester'), 'refund_too_large');
  perform pg_temp.chk('F5 it names what was overpaid (400)', (v_r ->> 'overpaid_cents')::integer = 400);
  perform pg_temp.st('F5 a card refund', public.brk_record_refund(v_p6, pg_temp.rv(v_p6), 'card', 100, v_today, 'worcester'), 'invalid');
  perform pg_temp.st('F5 an invalid school', public.brk_record_refund(v_p6, pg_temp.rv(v_p6), 'cash', 100, v_today, 'boston'), 'invalid');
  perform pg_temp.st2('F5 0 cents', public.brk_record_refund(v_p6, pg_temp.rv(v_p6), 'cash', 0, v_today, 'worcester'), 'invalid', 'refund_too_large');
  perform pg_temp.st('F5 a registration that was never paid (nothing overpaid)', public.brk_record_refund(v_p4, pg_temp.rv(v_p4), 'cash', 100, v_today, 'worcester'), 'refund_too_large');
  v_r := pg_temp.st('F5 refund 400 in cash at shrewsbury', public.brk_record_refund(v_p6, pg_temp.rv(v_p6), 'cash', 400, v_today, 'shrewsbury'), 'ok');
  v_pay2 := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.chk('F5 the refund row: kind refund, minus 400, cash, at the desk that handed it back; the net is 2000',
    exists (select 1 from public.brk_payments p where p.id = v_pay2 and p.kind = 'refund' and p.amount_cents = -400 and p.method = 'cash'
              and p.school = 'shrewsbury' and p.registration_id = v_p6)
    and pg_temp.paid(v_p6) = 2000);
  perform pg_temp.st('F5 one cent more', public.brk_record_refund(v_p6, pg_temp.rv(v_p6), 'cash', 1, v_today, 'worcester'), 'refund_too_large');
  -- while the refund stands, the payment can't be undone
  v_pay := (select p.id from public.brk_payments p where p.registration_id = v_p6 and p.kind = 'payment' and not exists (select 1 from public.brk_payments q where q.reverses_payment_id = p.id));
  perform pg_temp.st('F5 undo the payment while a refund stands', public.brk_undo_payment(v_pay), 'refund_stands');
  perform pg_temp.chk('F5 ... and nothing was written', pg_temp.paid(v_p6) = 2000);
  perform pg_temp.st('F5 undo refund', public.brk_undo_refund(v_pay2), 'ok');
  perform pg_temp.chk('F5 the refund is reversed: net 2400 again (a reversal of the refund, dated and kept at its desk)',
    pg_temp.paid(v_p6) = 2400
    and exists (select 1 from public.brk_payments p where p.reverses_payment_id = v_pay2 and p.kind = 'reversal' and p.amount_cents = 400 and p.school = 'shrewsbury'));
  perform pg_temp.st2('F5 undo the refund twice', public.brk_undo_refund(v_pay2), 'stale', 'invalid');
  perform pg_temp.st2('F5 undo_refund of something that is not a refund', public.brk_undo_refund(v_pay), 'invalid', 'stale');
  perform pg_temp.st('F5 unknown payment', public.brk_undo_refund(gen_random_uuid()), 'not_found');
  perform pg_temp.ov(v_p6, null);

  -- F6. the append-only guard (direct writes as the SQL Editor's own role)
  perform pg_temp.chk('F6 a payment row can never be updated',
    pg_temp.fails(format('update public.brk_payments set amount_cents = amount_cents + 1 where registration_id = %L', v_p6)));
  perform pg_temp.chk('F6 a payment row can never be removed (outside the delete functions)',
    pg_temp.fails(format('delete from public.brk_payments where registration_id = %L', v_p6)));
  perform pg_temp.chk('F6 a reversal must be exactly minus its payment',
    pg_temp.fails(format('insert into public.brk_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_by_name, reverses_payment_id)
                          select p.registration_id, ''reversal'', -1, p.method, p.paid_on, p.school, ''zz'', p.id
                            from public.brk_payments p where p.registration_id = %L and p.kind = ''payment'' limit 1', v_p6)));
  perform pg_temp.chk('F6 a payment can be reversed once only (a second reversal row is refused)',
    pg_temp.fails(format('insert into public.brk_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_by_name, reverses_payment_id)
                          select p.registration_id, ''reversal'', 400, p.method, p.paid_on, p.school, ''zz'', p.id
                            from public.brk_payments p where p.id = %L', v_pay2)));
  perform pg_temp.chk('F6 a registration''s net can never go below $0 (a refund of everything and then some, straight in the table)',
    pg_temp.fails(format('insert into public.brk_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
                          values (%L, ''refund'', -2500, ''cash'', current_date, ''worcester'', ''zz'')', v_p6)));
  perform pg_temp.chk('F6 the rows of P6 are what the functions made (no stray rows)', pg_temp.paid(v_p6) = 2400);
  perform pg_temp.chk('F6 a registration''s rules: age 1-99, boards 0-12, a known way to pay and source, no negative amount (direct writes refused)',
    pg_temp.fails(format('update public.brk_registrations set age = 0 where id = %L', v_p1))
    and pg_temp.fails(format('update public.brk_registrations set age = 100 where id = %L', v_p1))
    and pg_temp.fails(format('update public.brk_registrations set tech_boards = 13 where id = %L', v_p1))
    and pg_temp.fails(format('update public.brk_registrations set adult_boards = -1 where id = %L', v_p1))
    and pg_temp.fails(format('update public.brk_registrations set paying_by = ''bitcoin'' where id = %L', v_p1))
    and pg_temp.fails(format('update public.brk_registrations set source = ''x'' where id = %L', v_p1))
    and pg_temp.fails(format('update public.brk_registrations set amount_cents = -1 where id = %L', v_p1)));

  -- F7. deletes: refused when a registration (or any registration of the event) has payments
  perform pg_temp.st('F7 delete a registration with payments', public.brk_delete_registration(v_p6, pg_temp.rv(v_p6)), 'has_payments');
  perform pg_temp.chk('F7 ... even when its payment was undone (the rows stay)', pg_temp.npay(v_p4) >= 2
    and public.brk_delete_registration(v_p4, pg_temp.rv(v_p4)) ->> 'status' = 'has_payments');
  perform pg_temp.st('F7 delete the event with payments', public.brk_delete_event(v_w1, pg_temp.evv(v_w1)), 'has_payments');
  perform pg_temp.chk('F7 refused deletes removed nothing', exists (select 1 from public.brk_registrations r where r.id = v_p6)
    and exists (select 1 from public.brk_events e where e.id = v_w1));
  perform pg_temp.st('F7 stale', public.brk_delete_registration(v_p7, pg_temp.rv(v_p7) - 1), 'stale');
  perform pg_temp.st('F7 unknown registration', public.brk_delete_registration(gen_random_uuid(), 1), 'not_found');
  perform pg_temp.st('F7 delete a registration with no payment (the walk-in)', public.brk_delete_registration(v_p7, pg_temp.rv(v_p7)), 'ok');
  perform pg_temp.chk('F7 it is gone', not exists (select 1 from public.brk_registrations r where r.id = v_p7));
  perform pg_temp.chk('F7 the direct delete of a registration with payments is refused by the table too (the payments stay)',
    pg_temp.fails(format('delete from public.brk_registrations where id = %L', v_p6)) and pg_temp.npay(v_p6) >= 1);
  -- an event with students but no payments can be deleted: its students go with it
  perform pg_temp.st('F7 a walk-in on F2', public.brk_add_student(v_f2, 'Fran', 'Walkin', 10, v_rk_child, pg_temp.cls(v_f2, 1), 3, 0, 'cash'), 'ok');
  perform pg_temp.st('F7 delete F2 (students, no payments)', public.brk_delete_event(v_f2, pg_temp.evv(v_f2)), 'ok');
  perform pg_temp.chk('F7 F2, its class and its student are gone',
    not exists (select 1 from public.brk_events e where e.id = v_f2)
    and not exists (select 1 from public.brk_registrations r where r.event_id = v_f2)
    and not exists (select 1 from public.brk_event_classes c where c.event_id = v_f2));

  -- F8. classes that still have students can't be removed (W1: P1 in A, P2.. in A/B)
  perform pg_temp.chk('F8 W1 has students in both classes',
    exists (select 1 from public.brk_registrations r where r.class_id = v_w1a) and exists (select 1 from public.brk_registrations r where r.class_id = v_w1b));
  v_ver := pg_temp.evv(v_w1);
  v_r := pg_temp.st('F8 drop class B (it has students)', public.brk_save_classes(v_w1, v_ver,
    jsonb_build_array(jsonb_build_object('id', v_w1a, 'name', 'Group A', 'start_time', '09:00', 'end_time', '10:00'))), 'class_in_use');
  perform pg_temp.chk('F8 it names the class and changed nothing',
    (v_r ->> 'class_id')::uuid = v_w1b and (select count(*) from public.brk_event_classes c where c.event_id = v_w1) = 2 and pg_temp.evv(v_w1) = v_ver);
  perform pg_temp.st('F8 changing the times of a class that has students is fine', public.brk_save_classes(v_w1, v_ver, jsonb_build_array(
      jsonb_build_object('id', v_w1a, 'name', 'Group A', 'start_time', '09:00', 'end_time', '10:00'),
      jsonb_build_object('id', v_w1b, 'name', 'Group B', 'start_time', '10:15', 'end_time', '11:15'))), 'ok');
  perform pg_temp.chk('F8 the id is kept and the time changed',
    (select c.start_time from public.brk_event_classes c where c.id = v_w1b) = '10:15'::time);
  perform pg_temp.chk('F8 the students are still in their classes',
    exists (select 1 from public.brk_registrations r where r.class_id = v_w1a) and exists (select 1 from public.brk_registrations r where r.class_id = v_w1b));

  -- ===================================================================
  -- G. Square: brk_square_payment (called as the SQL Editor's own role; the webhook's login runs it the same way)
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  -- registrations to play with (card, 3 technical boards = 975 each; all on W1 = Worcester)
  v_ra := (pg_temp.st('G setup Ra', pg_temp.sg(v_code_w1, v_key || 'g', gen_random_uuid(), 'Ra', 10, v_rk_child, v_w1a, 3, 0, 'card', 975), 'ok') ->> 'registration_id')::uuid;
  v_rb := (pg_temp.st('G setup Rb', pg_temp.sg(v_code_w1, v_key || 'g', gen_random_uuid(), 'Rb', 10, v_rk_child, v_w1a, 3, 0, 'card', 975), 'ok') ->> 'registration_id')::uuid;
  v_rc := (pg_temp.st('G setup Rc', pg_temp.sg(v_code_w1, v_key || 'g', gen_random_uuid(), 'Rc', 10, v_rk_child, v_w1a, 3, 0, 'card', 975), 'ok') ->> 'registration_id')::uuid;
  v_rd := (pg_temp.st('G setup Rd (cash)', pg_temp.sg(v_code_w1, v_key || 'g', gen_random_uuid(), 'Rd', 10, v_rk_child, v_w1a, 3, 0, 'cash', 900), 'ok') ->> 'registration_id')::uuid;
  v_rg := (pg_temp.st('G setup Rg', pg_temp.sg(v_code_w1, v_key || 'g', gen_random_uuid(), 'Rg', 10, v_rk_child, v_w1a, 3, 0, 'card', 975), 'ok') ->> 'registration_id')::uuid;
  update public.brk_registrations set square_order_id = 'ord-ra', square_link_url = 'https://square.link/u/ra' where id = v_ra;
  update public.brk_registrations set square_order_id = 'ord-rb', square_link_url = 'https://square.link/u/rb' where id = v_rb;
  update public.brk_registrations set square_order_id = 'ord-rc', square_link_url = 'https://square.link/u/rc' where id = v_rc;
  update public.brk_registrations set square_order_id = 'ord-rg', square_link_url = 'https://square.link/u/rg' where id = v_rg;
  -- the table rule: a Square link exists only while Paying by is Card (so a cash registration can't be given one)
  perform pg_temp.chk('G setup: a cash registration can not hold a Square link (the table refuses it)',
    pg_temp.fails(format('update public.brk_registrations set square_order_id = %L, square_link_url = %L where id = %L',
                         'ord-rd', 'https://square.link/u/rd', v_rd)));
  -- ... so the function's not_card answer (a defence: the rule and the functions already clear a link when Paying by leaves
  -- Card) is tried with the rule taken out for a moment, and put back exactly as it was
  select pg_get_constraintdef(c.oid) into v_txt2 from pg_constraint c
   where c.conrelid = 'public.brk_registrations'::regclass and c.conname = 'brk_registrations_link_card_check';
  perform pg_temp.chk('G setup: the table has the rule brk_registrations_link_card_check', v_txt2 is not null);
  alter table public.brk_registrations drop constraint brk_registrations_link_card_check;
  update public.brk_registrations set square_order_id = 'ord-rd', square_link_url = 'https://square.link/u/rd' where id = v_rd;
  -- G0. brk_cleared_links: EVERY place that clears a link leaves a row (a trigger on the students' table, not the
  --     functions, so no clearing site can forget). The edit and the Paying by site were checked in E3; here: Mark paid in
  --     a different way, Edit payment away from card; the override site is checked in G5.
  select count(*) into v_n3 from public.brk_cleared_links;
  v_sub_mp := gen_random_uuid();
  v_rmp := (pg_temp.st('G0 setup Rmp', pg_temp.sg(v_code_w1, v_key || 'g', v_sub_mp, 'Rmp', 10, v_rk_child, v_w1a, 3, 0, 'card', 975), 'ok') ->> 'registration_id')::uuid;
  perform pg_temp.st('G0 Rmp gets a link', public.brk_public_set_link(v_rmp, v_sub_mp, 'ord-mp', 'https://square.link/u/mp', 975), 'ok');
  v_sub_ep := gen_random_uuid();
  v_rep := (pg_temp.st('G0 setup Rep', pg_temp.sg(v_code_w1, v_key || 'g', v_sub_ep, 'Rep', 10, v_rk_child, v_w1a, 3, 0, 'card', 975), 'ok') ->> 'registration_id')::uuid;
  perform pg_temp.st('G0 Rep gets a link', public.brk_public_set_link(v_rep, v_sub_ep, 'ord-ep', 'https://square.link/u/ep', 975), 'ok');
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := pg_temp.st('G0 the desk takes Rmp''s money in cash although the family chose card', pg_temp.mp(v_rmp, 'worcester', 'cash'), 'ok');
  perform pg_temp.chk('G0 Mark paid in another way clears the link and remembers the order id with its student',
    exists (select 1 from public.brk_registrations r where r.id = v_rmp and r.square_order_id is null and r.square_link_url is null and r.paying_by = 'cash')
    and exists (select 1 from public.brk_cleared_links c where c.order_id = 'ord-mp' and c.registration_id = v_rmp));
  v_r := pg_temp.st('G0 the desk takes Rep''s money by card (the way the family chose)', pg_temp.mp(v_rep, 'worcester', null), 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.chk('G0 Mark paid in the same way keeps the link and remembers nothing',
    exists (select 1 from public.brk_registrations r where r.id = v_rep and r.square_order_id = 'ord-ep')
    and not exists (select 1 from public.brk_cleared_links c where c.order_id = 'ord-ep'));
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('G0 the admin changes that payment to cash (Edit payment)', public.brk_edit_payment(v_pay, 'cash', 975, v_today, 'worcester'), 'ok');
  perform pg_temp.chk('G0 Edit payment away from card clears the link and remembers the order id',
    exists (select 1 from public.brk_registrations r where r.id = v_rep and r.square_order_id is null and r.square_link_url is null and r.paying_by = 'cash')
    and exists (select 1 from public.brk_cleared_links c where c.order_id = 'ord-ep' and c.registration_id = v_rep));
  perform pg_temp.chk('G0 exactly those two orders were remembered in this block',
    (select count(*) from public.brk_cleared_links c) = v_n3 + 2);
  perform pg_temp.chk('G0 a change that clears nothing remembers nothing (a name edit of a student without a link)',
    pg_temp.ed(v_rmp, 'Rmp', 'Renamed', 10, v_rk_child, v_w1a, 3, 0, 'card') ->> 'status' = 'ok'
    and (select count(*) from public.brk_cleared_links c) = v_n3 + 2);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.brk_square_events;

  -- G1. messages that are not a payment: nothing is written, but each message is recorded
  v_r := pg_temp.st('G1 unknown order', pg_temp.sq('worcester', v_key || 'e1', 'pay-1', 'ord-nope', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G1 outcome unknown_order, no registration named', v_r ->> 'outcome' = 'unknown_order' and v_r ->> 'registration_id' is null);
  v_r := pg_temp.st('G1 wrong amount (one cent short)', pg_temp.sq('worcester', v_key || 'e2', 'pay-2', 'ord-ra', 974, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G1 outcome amount_mismatch', v_r ->> 'outcome' = 'amount_mismatch');
  v_r := pg_temp.st('G1 too much', pg_temp.sq('worcester', v_key || 'e3', 'pay-3', 'ord-ra', 1000, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G1 too much is a mismatch too', v_r ->> 'outcome' = 'amount_mismatch');
  v_r := pg_temp.st('G1 wrong currency', pg_temp.sq('worcester', v_key || 'e4', 'pay-4', 'ord-ra', 975, 'EUR', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G1 a currency that is not USD is a mismatch', v_r ->> 'outcome' = 'amount_mismatch');
  v_r := pg_temp.st('G1 status not COMPLETED', pg_temp.sq('worcester', v_key || 'e5', 'pay-5', 'ord-ra', 975, 'USD', 'PENDING'), 'ok');
  perform pg_temp.chk('G1 outcome not_completed', v_r ->> 'outcome' = 'not_completed');
  v_r := pg_temp.st('G1 a Shrewsbury message for a Worcester student', pg_temp.sq('shrewsbury', v_key || 'e6', 'pay-6', 'ord-ra', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G1 outcome wrong_school', v_r ->> 'outcome' = 'wrong_school');
  perform pg_temp.chk('G1 none of those wrote a payment, and the student is still unpaid',
    pg_temp.npay(v_ra) = 0 and pg_temp.paid(v_ra) = 0 and not exists (select 1 from public.brk_payments p where p.square_payment_id like 'pay-%'));
  perform pg_temp.chk('G1 each message left one brk_square_events row with its outcome, its school and its numbers',
    (select count(*) from public.brk_square_events) = v_n + 6
    and exists (select 1 from public.brk_square_events x where x.square_event_id = v_key || 'e1' and x.outcome = 'unknown_order' and x.school = 'worcester'
                  and x.payment_id = 'pay-1' and x.order_id = 'ord-nope' and x.amount_cents = 975)
    and exists (select 1 from public.brk_square_events x where x.square_event_id = v_key || 'e2' and x.outcome = 'amount_mismatch' and x.registration_id = v_ra and x.amount_cents = 974)
    and exists (select 1 from public.brk_square_events x where x.square_event_id = v_key || 'e5' and x.outcome = 'not_completed')
    and exists (select 1 from public.brk_square_events x where x.square_event_id = v_key || 'e6' and x.outcome = 'wrong_school' and x.school = 'shrewsbury'));
  perform pg_temp.chk('G1 a message nobody looked at starts unreviewed',
    not exists (select 1 from public.brk_square_events x where x.square_event_id like v_key || 'e%' and x.reviewed));

  -- G2. a good payment
  v_r := pg_temp.st('G2 the right amount, USD, COMPLETED', pg_temp.sq('worcester', v_key || 'e10', 'pay-10', 'ord-ra', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G2 outcome paid, naming the registration', v_r ->> 'outcome' = 'paid' and (v_r ->> 'registration_id')::uuid = v_ra);
  perform pg_temp.chk('G2 the payment row: payment, card, 975, at the event''s school, by Square, with the Square payment id',
    exists (select 1 from public.brk_payments p where p.registration_id = v_ra and p.kind = 'payment' and p.method = 'card' and p.amount_cents = 975
              and p.school = 'worcester' and p.recorded_by_name = 'Square' and p.square_payment_id = 'pay-10' and p.paid_on = v_today)
    and pg_temp.npay(v_ra) = 1 and pg_temp.paid(v_ra) = 975);
  perform pg_temp.chk('G2 an event row: paid',
    exists (select 1 from public.brk_square_events x where x.square_event_id = v_key || 'e10' and x.outcome = 'paid' and x.registration_id = v_ra));
  -- replay of the same event id: nothing changes
  select count(*) into v_n2 from public.brk_square_events;
  select count(*) into v_n3 from public.change_log;
  v_r := pg_temp.st('G2 the same event id again', pg_temp.sq('worcester', v_key || 'e10', 'pay-10', 'ord-ra', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G2 outcome duplicate; one payment still; no new event row; no history row',
    v_r ->> 'outcome' = 'duplicate' and pg_temp.npay(v_ra) = 1 and (select count(*) from public.brk_square_events) = v_n2
    and (select count(*) from public.change_log) = v_n3);
  -- a replay of an event id that earlier ended in a mismatch is also a duplicate (the primary key is the guard)
  v_r := pg_temp.st('G2 a mismatch''s event id again', pg_temp.sq('worcester', v_key || 'e2', 'pay-2', 'ord-rb', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G2 duplicate: the second try changed nothing', v_r ->> 'outcome' = 'duplicate' and pg_temp.npay(v_rb) = 0);
  -- already paid: a new event, a new payment id, the same order
  v_r := pg_temp.st('G2 paid again with a new event id', pg_temp.sq('worcester', v_key || 'e11', 'pay-11', 'ord-ra', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G2 outcome already_paid; still one payment', v_r ->> 'outcome' = 'already_paid' and pg_temp.npay(v_ra) = 1);
  -- the same Square payment id on a second event id, for ANOTHER student: no second payment is made
  begin
    v_r := pg_temp.sq('worcester', v_key || 'e12', 'pay-10', 'ord-rb', 975, 'USD', 'COMPLETED');
    perform pg_temp.chk('G2 the same payment id on a new event id: no second payment (outcome duplicate or already_paid)',
      v_r ->> 'status' = 'ok' and v_r ->> 'outcome' in ('duplicate', 'already_paid') and pg_temp.npay(v_rb) = 0);
  exception
    when unique_violation then
      perform pg_temp.chk('G2 (the unique key refused the second payment with an error)', true);
  end;
  perform pg_temp.chk('G2 Rb is still unpaid', pg_temp.npay(v_rb) = 0);
  perform pg_temp.chk('G2 the payment id is unique in the table (a second row with it is refused)',
    pg_temp.fails(format('insert into public.brk_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_by_name, square_payment_id)
                          values (%L, ''payment'', 975, ''card'', current_date, ''worcester'', ''Square'', ''pay-10'')', v_rb)));

  -- G3. the school comes from the endpoint: a Worcester message for a Shrewsbury student
  v_x := pg_temp.sg(v_code_s1, v_key || 'g', gen_random_uuid(), 'Shr', 10, v_rk_child, v_s1a, 3, 0, 'card', 975);
  perform pg_temp.chk('G3 setup: a Shrewsbury student', v_x ->> 'status' = 'ok');
  update public.brk_registrations set square_order_id = 'ord-shr', square_link_url = 'https://square.link/u/shr' where id = (v_x ->> 'registration_id')::uuid;
  v_r := pg_temp.st('G3 a Worcester message for a Shrewsbury registration', pg_temp.sq('worcester', v_key || 'e20', 'pay-20', 'ord-shr', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G3 outcome wrong_school and no payment (a Worcester Square message can never mark a Shrewsbury student paid)',
    v_r ->> 'outcome' = 'wrong_school' and pg_temp.npay((v_x ->> 'registration_id')::uuid) = 0
    and not exists (select 1 from public.brk_payments p where p.square_payment_id = 'pay-20'));
  v_r := pg_temp.st('G3 the Shrewsbury message for it', pg_temp.sq('shrewsbury', v_key || 'e21', 'pay-21', 'ord-shr', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G3 paid, at shrewsbury', v_r ->> 'outcome' = 'paid'
    and exists (select 1 from public.brk_payments p where p.square_payment_id = 'pay-21' and p.school = 'shrewsbury' and p.recorded_by_name = 'Square'));

  -- G4. an order that is not a card order any more
  v_r := pg_temp.st('G4 a message for a cash registration that holds an order', pg_temp.sq('worcester', v_key || 'e30', 'pay-30', 'ord-rd', 900, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G4 outcome not_card, no payment', v_r ->> 'outcome' = 'not_card' and pg_temp.npay(v_rd) = 0);
  update public.brk_registrations set square_order_id = null, square_link_url = null where id = v_rd;
  execute 'alter table public.brk_registrations add constraint brk_registrations_link_card_check ' || v_txt2;
  perform pg_temp.chk('G4 the table rule is back: a cash registration can not hold a link again',
    pg_temp.fails(format('update public.brk_registrations set square_order_id = %L, square_link_url = %L where id = %L', 'ord-rd', 'https://x', v_rd)));
  -- Rc: the link is cleared by an edit (Paying by leaves card): the old order can no longer pay
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := pg_temp.st('G4 Rc moves to cash (the link is cleared)', pg_temp.ed(v_rc, 'Rc', 'Tester', 10, v_rk_child, v_w1a, 3, 0, 'cash'), 'ok');
  perform pg_temp.chk('G4 link cleared', (v_r ->> 'link_cleared')::boolean = true);
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.st('G4 the old order after the link was cleared', pg_temp.sq('worcester', v_key || 'e31', 'pay-31', 'ord-rc', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G4 outcome link_cleared naming the student, no payment (someone paid an old, cleared link)',
    v_r ->> 'outcome' = 'link_cleared' and (v_r ->> 'registration_id')::uuid = v_rc and pg_temp.npay(v_rc) = 0 and pg_temp.paid(v_rc) = 0);
  perform pg_temp.chk('G4 the message was recorded with its student',
    exists (select 1 from public.brk_square_events x where x.square_event_id = v_key || 'e31' and x.outcome = 'link_cleared'
              and x.registration_id = v_rc and x.order_id = 'ord-rc' and x.school = 'worcester'));
  perform pg_temp.chk('G4 an order id nobody ever had is still unknown_order',
    pg_temp.sq('worcester', v_key || 'e31b', 'pay-31b', 'ord-never', 975, 'USD', 'COMPLETED') ->> 'outcome' = 'unknown_order');
  -- G4b. a cleared order of ANOTHER school's student: wrong_school (and the right school's message: link_cleared)
  v_x := pg_temp.sg(v_code_s1, v_key || 'g', gen_random_uuid(), 'Shr2', 10, v_rk_child, v_s1a, 3, 0, 'card', 975);
  perform pg_temp.chk('G4b setup: a second Shrewsbury student', v_x ->> 'status' = 'ok');
  v_shr2 := (v_x ->> 'registration_id')::uuid;
  update public.brk_registrations set square_order_id = 'ord-shr2', square_link_url = 'https://square.link/u/shr2' where id = v_shr2;
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('G4b Shr2 moves to cash (the link is cleared)', pg_temp.ed(v_shr2, 'Shr2', 'Tester', 10, v_rk_child, v_s1a, 3, 0, 'cash'), 'ok');
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.st('G4b a Worcester message for a cleared order of a Shrewsbury student', pg_temp.sq('worcester', v_key || 'e32', 'pay-32', 'ord-shr2', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G4b outcome wrong_school, no payment',
    v_r ->> 'outcome' = 'wrong_school' and pg_temp.npay(v_shr2) = 0 and not exists (select 1 from public.brk_payments p where p.square_payment_id = 'pay-32'));
  v_r := pg_temp.st('G4b the Shrewsbury message for it', pg_temp.sq('shrewsbury', v_key || 'e33', 'pay-33', 'ord-shr2', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G4b outcome link_cleared at its own school, no payment',
    v_r ->> 'outcome' = 'link_cleared' and (v_r ->> 'registration_id')::uuid = v_shr2 and pg_temp.npay(v_shr2) = 0);

  -- G5. the amount must be what is STILL owed (an override counts)
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('G5 override 500 on Rg', pg_temp.ov(v_rg, 500), 'ok');
  perform set_config('request.jwt.claims', '', true);
  -- the override moves what is owed, so the link made for the old amount is cleared (and remembered)
  perform pg_temp.chk('G5 the override cleared Rg''s link and remembered the order id',
    exists (select 1 from public.brk_registrations r where r.id = v_rg and r.square_order_id is null and r.square_link_url is null)
    and exists (select 1 from public.brk_cleared_links c where c.order_id = 'ord-rg' and c.registration_id = v_rg));
  perform pg_temp.st('G5 the old link can no longer pay: link_cleared', pg_temp.sq('worcester', v_key || 'e39', 'pay-39', 'ord-rg', 975, 'USD', 'COMPLETED'), 'ok');
  -- a new link for the new balance (500); a link for the old total is refused with the balance
  v_r := pg_temp.st('G5 a link for the old total', public.brk_public_set_link(v_rg, (select r.submission_id from public.brk_registrations r where r.id = v_rg), 'ord-rg2', 'https://square.link/u/rg2', 975), 'price_changed');
  perform pg_temp.chk('G5 ... answers the balance 500', (v_r ->> 'amount_cents')::integer = 500);
  perform pg_temp.st('G5 a link for the balance', public.brk_public_set_link(v_rg, (select r.submission_id from public.brk_registrations r where r.id = v_rg), 'ord-rg2', 'https://square.link/u/rg2', 500), 'ok');
  v_r := pg_temp.st('G5 the list price while 500 is owed', pg_temp.sq('worcester', v_key || 'e40', 'pay-40', 'ord-rg2', 975, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G5 amount_mismatch (it is not what is still owed); the function answered ' || v_r::text || ', payments ' || pg_temp.npay(v_rg), v_r ->> 'outcome' = 'amount_mismatch' and pg_temp.npay(v_rg) = 0);
  v_r := pg_temp.st('G5 500', pg_temp.sq('worcester', v_key || 'e41', 'pay-41', 'ord-rg2', 500, 'USD', 'COMPLETED'), 'ok');
  perform pg_temp.chk('G5 500 is paid', v_r ->> 'outcome' = 'paid' and pg_temp.paid(v_rg) = 500);

  -- G5b. a registration that is paid takes no Square link any more (the desk took Cid's money)
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('G5b the desk marks Cid paid', pg_temp.mp(v_c3, 'worcester', null), 'ok');
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('G5b a link for a paid registration', public.brk_public_set_link(v_c3, v_sub_c3, 'ord-c3', 'https://square.link/u/c3', 0), 'paid');
  perform pg_temp.chk('G5b ... stored nothing, and the family''s page says paid with a balance of 0',
    exists (select 1 from public.brk_registrations r where r.id = v_c3 and r.square_order_id is null and r.square_link_url is null)
    and (public.brk_public_registration(v_code_w1, v_sub_c3) ->> 'paid')::boolean is true
    and (public.brk_public_registration(v_code_w1, v_sub_c3) ->> 'balance_cents')::integer = 0);

  -- G5c. a PARTLY paid registration: the page says what is still owed (the balance), and a link is made for exactly that
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_pay2 := (select p.id from public.brk_payments p where p.registration_id = v_c3 and p.kind = 'payment');
  perform pg_temp.st('G5c the admin lowers the desk payment to 400 (650 is owed)', public.brk_edit_payment(v_pay2, 'card', 400, v_today, 'worcester'), 'ok');
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.st('G5c the family''s page', public.brk_public_registration(v_code_w1, v_sub_c3), 'ok');
  perform pg_temp.chk('G5c owed 650 in all, a balance of 250, not paid, no link',
    (v_r ->> 'amount_cents')::integer = 650 and (v_r ->> 'balance_cents')::integer = 250 and (v_r ->> 'paid')::boolean = false
    and (v_r ->> 'has_link')::boolean = false);
  v_r := pg_temp.st('G5c a link for the whole 650', public.brk_public_set_link(v_c3, v_sub_c3, 'ord-c3', 'https://square.link/u/c3', 650), 'price_changed');
  perform pg_temp.chk('G5c ... answers the balance 250 and stores nothing',
    (v_r ->> 'amount_cents')::integer = 250 and (select r.square_link_url from public.brk_registrations r where r.id = v_c3) is null);
  perform pg_temp.st('G5c a link for the balance', public.brk_public_set_link(v_c3, v_sub_c3, 'ord-c3', 'https://square.link/u/c3', 250), 'ok');
  perform pg_temp.chk('G5c Square paying the balance (250) is paid, and the registration is then paid in full',
    pg_temp.sq('worcester', v_key || 'e50', 'pay-50', 'ord-c3', 250, 'USD', 'COMPLETED') ->> 'outcome' = 'paid');
  perform pg_temp.chk('G5c paid 650 of 650', pg_temp.paid(v_c3) = 650);

  -- G6. what staff see: Square's payment is in the roster as "Square"; the link and order never are
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_x := pg_temp.rr(v_w1, v_ra);
  perform pg_temp.chk('G6 the roster shows Ra paid 975 with a payment recorded by Square, method card',
    (v_x ->> 'paid_cents')::integer = 975 and v_x -> 'payments' -> 0 ->> 'recorded_by_name' = 'Square' and v_x -> 'payments' -> 0 ->> 'method' = 'card'
    and v_x -> 'payments' -> 0 ->> 'school' = 'worcester');
  perform pg_temp.chk('G6 the desk can not undo Square''s payment within 10 seconds either (it is not the desk''s own)',
    public.brk_undo_payment((v_x -> 'payments' -> 0 ->> 'id')::uuid) ->> 'status' = 'not_allowed');

  -- G7. "needs a look": admins only; only unreviewed unknown_order / amount_mismatch / wrong_school; Dismiss
  v_r := public.brk_event_roster(v_w1);
  perform pg_temp.chk('G7 a non-admin gets an empty list', v_r -> 'needs_look' = '[]'::jsonb);
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.brk_event_roster(v_w1);
  perform pg_temp.chk('G7 an admin sees the unknown order and the amount mismatches of this school',
    exists (select 1 from jsonb_array_elements(v_r -> 'needs_look') x where x ->> 'square_event_id' = v_key || 'e1' and x ->> 'outcome' = 'unknown_order')
    and exists (select 1 from jsonb_array_elements(v_r -> 'needs_look') x where x ->> 'square_event_id' = v_key || 'e2' and x ->> 'outcome' = 'amount_mismatch'));
  -- (the sheet lists only unknown_order / amount_mismatch / wrong_school; the migration also shows already_paid and not_card,
  --  money that was NOT recorded as a payment - its note d - so those two are not asserted either way)
  perform pg_temp.chk('G7 ... but not the paid, duplicate or not-completed ones',
    not exists (select 1 from jsonb_array_elements(v_r -> 'needs_look') x where x ->> 'square_event_id' in (v_key || 'e10', v_key || 'e5')));
  perform pg_temp.chk('G7 the wrong_school message shows up on a roster of the school it arrived at or the event''s',
    exists (select 1 from jsonb_array_elements(v_r -> 'needs_look') x where x ->> 'square_event_id' = v_key || 'e6')
    or exists (select 1 from jsonb_array_elements(public.brk_event_roster(v_s1) -> 'needs_look') x where x ->> 'square_event_id' = v_key || 'e6'));
  perform pg_temp.chk('G7 a needs_look row has the agreed keys',
    not exists (select 1 from jsonb_array_elements(v_r -> 'needs_look') x
                 where (select array_agg(k order by k collate "C") from jsonb_object_keys(x) as k)
                       is distinct from array['amount_cents', 'first_name', 'last_name', 'order_id', 'outcome', 'received_at', 'registration_id', 'square_event_id']));
  perform pg_temp.chk('G7 a link_cleared row names the student (id, first and last name); the other rows leave those three empty',
    exists (select 1 from jsonb_array_elements(v_r -> 'needs_look') x
             where x ->> 'square_event_id' = v_key || 'e31' and x ->> 'outcome' = 'link_cleared'
               and (x ->> 'registration_id')::uuid = v_rc and x ->> 'first_name' = 'Rc' and x ->> 'last_name' = 'Tester'
               and x ->> 'order_id' = 'ord-rc' and (x ->> 'amount_cents')::integer = 975)
    and exists (select 1 from jsonb_array_elements(v_r -> 'needs_look') x where x ->> 'square_event_id' = v_key || 'e2' and x ->> 'outcome' = 'amount_mismatch')
    and not exists (select 1 from jsonb_array_elements(v_r -> 'needs_look') x
                     where x ->> 'outcome' <> 'link_cleared' and (x -> 'registration_id' <> 'null'::jsonb or x -> 'first_name' <> 'null'::jsonb or x -> 'last_name' <> 'null'::jsonb)));
  perform pg_temp.st('G7 dismiss an unknown id', public.brk_dismiss_square_event('zz-not-an-event'), 'not_found');
  perform pg_temp.st('G7 dismiss e1', public.brk_dismiss_square_event(v_key || 'e1'), 'ok');
  perform pg_temp.chk('G7 reviewed, and gone from the list; the others stay',
    exists (select 1 from public.brk_square_events x where x.square_event_id = v_key || 'e1' and x.reviewed)
    and not exists (select 1 from jsonb_array_elements(public.brk_event_roster(v_w1) -> 'needs_look') x where x ->> 'square_event_id' = v_key || 'e1')
    and exists (select 1 from jsonb_array_elements(public.brk_event_roster(v_w1) -> 'needs_look') x where x ->> 'square_event_id' = v_key || 'e2'));

  -- the cleared orders go with their student (Delete registration, no payments): Rd's 'ord-rd' was remembered in G4
  perform pg_temp.chk('G7 Rd''s cleared order is remembered', exists (select 1 from public.brk_cleared_links c where c.order_id = 'ord-rd' and c.registration_id = v_rd));
  perform pg_temp.st('G7 delete Rd (no payments)', public.brk_delete_registration(v_rd, pg_temp.rv(v_rd)), 'ok');
  perform pg_temp.chk('G7 ... and its cleared order went with it', not exists (select 1 from public.brk_cleared_links c where c.registration_id = v_rd));

  -- ===================================================================
  -- H. Access: sessions without data access, and the desk against the admin-only functions
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_cj := jsonb_build_array(jsonb_build_object('id', v_w1a, 'name', 'Group A', 'start_time', '09:00', 'end_time', '10:00'));
  -- every staff function with real ids and the CURRENT versions (so a refusal can only be about access)
  v_calls := array[
    'public.brk_settings_get()',
    format('public.brk_events_list(%L)', 'both'),
    format('public.brk_event_roster(%L::uuid)', v_w1),
    format('public.brk_registration_history(%L::uuid)', v_p1),
    format('public.brk_add_student(%L::uuid, %L, %L, 10, %L, %L::uuid, 1, 0, %L)', v_w1, 'Zed', 'Zed', v_rk_child, v_w1a, 'cash'),
    format('public.brk_edit_registration(%L::uuid, %s, %L, %L, 12, %L, %L::uuid, 3, 0, %L)', v_p1, pg_temp.rv(v_p1), 'Pia', 'Tester', v_rk_child, v_w1a, 'cash'),
    format('public.brk_set_broke(%L::uuid, %s, true)', v_p1, pg_temp.rv(v_p1)),
    format('public.brk_mark_paid(%L::uuid, %s, %L, null)', v_p1, pg_temp.rv(v_p1), 'worcester'),
    format('public.brk_undo_payment(%L::uuid)', v_pay),
    -- the admin-only ones (10 on): index 10 = add_event
    format('public.brk_add_event(%L, %L, %L::date, null)', 'zz nope', 'worcester', v_today + 400),
    format('public.brk_update_event(%L::uuid, %s, %L, %L::date, true)', v_w1, pg_temp.evv(v_w1), 'zz nope', v_today + 14),
    format('public.brk_delete_event(%L::uuid, %s)', v_s1, pg_temp.evv(v_s1)),
    format('public.brk_save_classes(%L::uuid, %s, %L::jsonb)', v_w1, pg_temp.evv(v_w1), '[]'),
    format('public.brk_set_override(%L::uuid, %s, 1)', v_p1, pg_temp.rv(v_p1)),
    format('public.brk_edit_payment(%L::uuid, %L, 900, %L::date, %L)', v_pay, 'cash', v_today, 'worcester'),
    format('public.brk_record_refund(%L::uuid, %s, %L, 100, %L::date, %L)', v_p6, pg_temp.rv(v_p6), 'cash', v_today, 'worcester'),
    format('public.brk_undo_refund(%L::uuid)', v_pay2),
    format('public.brk_delete_registration(%L::uuid, %s)', v_p5, pg_temp.rv(v_p5)),
    format('public.brk_save_settings(%s, 300, 400, 25, 100, 12)', (public.brk_settings_get() -> 'settings' ->> 'version')::integer),
    format('public.brk_save_chart(%s, %L::jsonb)', (public.brk_settings_get() -> 'settings' ->> 'version')::integer, '[]'),
    format('public.brk_dismiss_square_event(%L)', v_key || 'e2')];
  perform pg_temp.chk('H setup: 21 staff functions in the list', cardinality(v_calls) = 21);
  -- (the admin gets sensible answers from every one of them, so the refusals below mean something)
  perform set_config('request.jwt.claims', v_c_d1, true);

  -- H1. sessions without data access: no_access from EVERY staff function, with real ids
  v_list   := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d2, v_c_d3];
  v_labels := array['A2 locked', 'A3 five wrong PINs', 'A4 signed out', 'A5 eight days', 'A6 magic link', 'D2 desk locked', 'D3 desk magic link'];
  v_n := pg_temp.regs(v_w1);
  select count(*) into v_n2 from public.brk_events;
  select count(*) into v_n3 from public.brk_payments;
  set local role authenticated;
  for v_i in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_i], true);
    for v_k in 1 .. cardinality(v_calls) loop
      execute 'select ' || v_calls[v_k] into v_r;
      if v_r is distinct from '{"status": "no_access"}'::jsonb then
        raise exception 'TEST FAILED: H1 session % got % from %', v_labels[v_i], v_r, v_calls[v_k];
      end if;
    end loop;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.chk('H1 the 147 refusals changed nothing (registrations, events, payments)',
    pg_temp.regs(v_w1) = v_n and (select count(*) from public.brk_events) = v_n2 and (select count(*) from public.brk_payments) = v_n3);
  perform pg_temp.chk('H1 no session at all gets no_access too',
    (select public.brk_event_roster(v_w1)) = '{"status": "no_access"}'::jsonb and public.brk_settings_get() = '{"status": "no_access"}'::jsonb);

  -- H2. no data access -> no rows from any table the app may read; A1 and D1 see what the owner sees
  v_list   := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d2, v_c_d3, v_c_a1, v_c_d1];
  v_labels := array['A2', 'A3', 'A4', 'A5', 'A6', 'D2', 'D3', 'A1', 'D1'];
  foreach v_tbl in array array['brk_settings', 'brk_chart', 'brk_events', 'brk_event_classes', 'brk_registrations', 'brk_payments'] loop
    execute format('select count(x.id) from public.%I x', v_tbl) into v_n2;
    for v_i in 1 .. cardinality(v_list) loop
      set local role authenticated;
      perform set_config('request.jwt.claims', v_list[v_i], true);
      execute format('select count(x.id) from public.%I x', v_tbl) into v_n;
      reset role;
      if v_n <> (case when v_labels[v_i] in ('A1', 'D1') then v_n2 else 0 end) then
        raise exception 'TEST FAILED: H2 session % read % rows of % (the owner sees %)', v_labels[v_i], v_n, v_tbl, v_n2;
      end if;
    end loop;
  end loop;
  perform pg_temp.chk('H2 locked sessions read nothing, unlocked ones read everything (6 tables x 9 sessions)', true);
  perform set_config('request.jwt.claims', '', true);

  -- H3. the desk (role staff) against the admin-only functions: not_allowed (as Camps), and nothing changes
  select count(*) into v_n  from public.brk_events;
  select count(*) into v_n2 from public.brk_registrations;
  select count(*) into v_n3 from public.brk_payments;
  select md5(string_agg(to_jsonb(x)::text, ',' order by x.id)) into v_txt from public.brk_registrations x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by x.id)) into v_txt2 from public.brk_settings x;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  for v_i in 10 .. cardinality(v_calls) loop
    execute 'select ' || v_calls[v_i] into v_r;
    if v_r ->> 'status' is distinct from 'not_allowed' then
      raise exception 'TEST FAILED: H3 the desk got % from % (expected not_allowed, as Camps)', v_r, v_calls[v_i];
    end if;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.chk('H3 the desk gets not_allowed from all 12 admin functions (add / update / delete event, classes, override, edit payment, refunds, delete registration, settings, chart, dismiss)', true);
  perform pg_temp.chk('H3 ... and nothing changed (events, registrations, payments, settings)',
    (select count(*) from public.brk_events) = v_n and (select count(*) from public.brk_registrations) = v_n2
    and (select count(*) from public.brk_payments) = v_n3
    and (select md5(string_agg(to_jsonb(x)::text, ',' order by x.id)) from public.brk_registrations x) = v_txt
    and (select md5(string_agg(to_jsonb(x)::text, ',' order by x.id)) from public.brk_settings x) = v_txt2);
  -- ... while the same functions work for the admin (the calls above are well-formed)
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.chk('H3 the same admin calls are well-formed: the admin gets ok (dismiss, override, update event)',
    public.brk_dismiss_square_event(v_key || 'e2') ->> 'status' = 'ok'
    and pg_temp.ov(v_p1, null) ->> 'status' = 'ok'
    and public.brk_update_event(v_w1, pg_temp.evv(v_w1), v_tag || ' W1', v_today + 14, true) ->> 'status' = 'ok');
  perform set_config('request.jwt.claims', v_c_d1, true);

  -- H4. staff (the desk) CAN use the staff functions: events list, roster, history, settings, add student, edit, broke, mark paid, undo
  v_r := pg_temp.st('H4 the desk lists Worcester events', public.brk_events_list('worcester'), 'ok');
  perform pg_temp.chk('H4 W1 is in the Worcester list with its counts; S1 is not',
    exists (select 1 from jsonb_array_elements(v_r -> 'events') x where (x ->> 'id')::uuid = v_w1 and x ->> 'location_code' = 'worcester'
              and (x ->> 'registered')::integer = pg_temp.regs(v_w1) and x ->> 'public_code' = v_code_w1)
    and not exists (select 1 from jsonb_array_elements(v_r -> 'events') x where (x ->> 'id')::uuid = v_s1));
  v_r := pg_temp.st('H4 both schools', public.brk_events_list('both'), 'ok');
  perform pg_temp.chk('H4 both schools lists the Shrewsbury event too',
    exists (select 1 from jsonb_array_elements(v_r -> 'events') x where (x ->> 'id')::uuid = v_s1)
    and exists (select 1 from jsonb_array_elements(v_r -> 'events') x where (x ->> 'id')::uuid = v_w1));
  perform pg_temp.chk('H4 an event row has the agreed keys',
    not exists (select 1 from jsonb_array_elements(v_r -> 'events') x
                 where (select array_agg(k order by k collate "C") from jsonb_object_keys(x) as k)
                       is distinct from array['event_date', 'id', 'location_code', 'name', 'paid', 'public_code', 'registered', 'registration_open', 'version']));
  perform pg_temp.chk('H4 paid counts the registrations whose payments cover what they owe',
    (select (x ->> 'paid')::integer from jsonb_array_elements(public.brk_events_list('worcester') -> 'events') x where (x ->> 'id')::uuid = v_w1)
      = (select count(*) from public.brk_registrations r where r.event_id = v_w1
          and (select coalesce(sum(p.amount_cents), 0) from public.brk_payments p where p.registration_id = r.id) >= coalesce(r.override_cents, r.amount_cents)));
  perform pg_temp.st('H4 an unknown school code', public.brk_events_list('boston'), 'invalid');
  perform pg_temp.st('H4 the roster of an unknown event', public.brk_event_roster(gen_random_uuid()), 'not_found');
  v_r := pg_temp.st('H4 the roster', public.brk_event_roster(v_w1), 'ok');
  perform pg_temp.chk('H4 the roster: the event with its two classes and one row per registration',
    (v_r -> 'event' ->> 'id')::uuid = v_w1 and jsonb_array_length(v_r -> 'event' -> 'classes') = 2
    and jsonb_array_length(v_r -> 'registrations') = pg_temp.regs(v_w1));
  perform pg_temp.chk('H4 a registration row has exactly the agreed keys; got ' || (select string_agg(k, ',' order by k) from jsonb_object_keys(v_r -> 'registrations' -> 0) as k),
    not exists (select 1 from jsonb_array_elements(v_r -> 'registrations') x
                 where (select array_agg(k order by k collate "C") from jsonb_object_keys(x) as k)
                       is distinct from array['adult_boards', 'age', 'amount_cents', 'band_used', 'broke', 'broke_on', 'class_id', 'created_at',
                                              'first_name', 'has_link', 'id', 'last_name', 'override_cents', 'owed_cents', 'paid_cents',
                                              'paying_by', 'paying_by_on_form', 'payments', 'rank_name', 'same_day', 'source',
                                              'tech_boards', 'version']));
  perform pg_temp.chk('H4 the event part has the agreed keys; got ' || (select string_agg(k, ',' order by k) from jsonb_object_keys(v_r -> 'event') as k),
    (select array_agg(k order by k collate "C") from jsonb_object_keys(v_r -> 'event') as k)
      = array['classes', 'event_date', 'id', 'location_code', 'name', 'public_code', 'registration_open', 'version']);

  -- ===================================================================
  -- I. History and privacy
  -- ===================================================================
  -- I1. what staff reads never contain the Square link, the order, the submission id or a login id
  v_txt := public.brk_event_roster(v_w1)::text || public.brk_events_list('both')::text || public.brk_settings_get()::text;
  perform pg_temp.chk('I1 no Square link, order id, submission id, recorded_by or login id in what staff read',
    v_txt !~* 'square_link_url|square_order_id|submission_id|"recorded_by"|square\.link|ord-r|ord-c'
    and position(v_admin::text in v_txt) = 0 and position(v_desk::text in v_txt) = 0
    and not exists (select 1 from public.brk_registrations r where r.submission_id is not null and position(r.submission_id::text in v_txt) > 0));
  perform pg_temp.chk('I1 a roster row says only that there is a link (has_link), true for Rb',
    (pg_temp.rr(v_w1, v_rb) ->> 'has_link')::boolean is true and (pg_temp.rr(v_w1, v_rc) ->> 'has_link')::boolean is false);

  -- I2. the history reader
  v_r := pg_temp.st('I2 history of P1', public.brk_registration_history(v_p1), 'ok');
  v_h := v_r -> 'rows';
  perform pg_temp.chk('I2 rows exist: the sign-up (by Family form), the desk''s edits, payment, undo',
    jsonb_array_length(v_h) >= 6
    and exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'brk_registrations' and x ->> 'op' = 'insert' and x ->> 'actor_name' = 'Family form')
    and exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'brk_registrations' and x ->> 'op' = 'update' and x ->> 'actor_name' = v_dn)
    and exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'brk_payments' and x ->> 'op' = 'insert' and x ->> 'action' = 'brk_mark_paid')
    and exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'brk_payments' and x -> 'after' ->> 'kind' = 'reversal'));
  perform pg_temp.chk('I2 newest first',
    not exists (select 1 from jsonb_array_elements(v_h) with ordinality as x(r, n) join jsonb_array_elements(v_h) with ordinality as y(r, n) on y.n = x.n + 1
                 where (x.r ->> 'occurred_at')::timestamptz < (y.r ->> 'occurred_at')::timestamptz));
  perform pg_temp.chk('I2 each row has only agreed keys (and the basics)',
    not exists (select 1 from jsonb_array_elements(v_h) x
                 where not ((select array_agg(k order by k collate "C") from jsonb_object_keys(x) as k)
                            <@ array['action', 'actor_name', 'after', 'batch_id', 'before', 'occurred_at', 'op', 'record_id', 'table_name'])
                    or x -> 'table_name' is null or x -> 'op' is null or x -> 'occurred_at' is null or x -> 'actor_name' is null));
  perform pg_temp.chk('I2 no login ids anywhere in it: no recorded_by / submission_id / Square keys, no staff or session uuid',
    not exists (select 1 from jsonb_array_elements(v_h) x,
                             lateral (select k from jsonb_object_keys(coalesce(nullif(x -> 'before', 'null'::jsonb), '{}'::jsonb)
                                                                      || coalesce(nullif(x -> 'after', 'null'::jsonb), '{}'::jsonb)) as k) as kk
                 where kk.k in ('recorded_by', 'submission_id', 'square_order_id', 'square_link_url', 'actor_id', 'session_id',
                                'created_by', 'updated_by'))
    and position(v_admin::text in v_h::text) = 0 and position(v_desk::text in v_h::text) = 0
    and position(v_d1::text in v_h::text) = 0 and position(v_a1::text in v_h::text) = 0
    and position(v_sub_p1::text in v_h::text) = 0);
  -- the Square link of a card registration: never in its history
  v_h := public.brk_registration_history(v_c1) -> 'rows';
  perform pg_temp.chk('I2 the Square order and link never appear in a registration''s history',
    jsonb_array_length(v_h) >= 2 and v_h::text !~* 'ord-c1|square\.link|square_order_id|square_link_url');
  v_h := public.brk_registration_history(v_ra) -> 'rows';
  perform pg_temp.chk('I2 Square''s payment is in Ra''s history as "Square" (action brk_square_payment), no payment id of a login',
    exists (select 1 from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'brk_payments' and x ->> 'actor_name' = 'Square')
    and v_h::text !~* 'ord-ra|square\.link');
  v_h := public.brk_registration_history(v_p6) -> 'rows';
  perform pg_temp.chk('I2 the refund and its undo are in the history', exists (select 1 from jsonb_array_elements(v_h) x where x -> 'after' ->> 'kind' = 'refund')
    and (select count(*) from jsonb_array_elements(v_h) x where x ->> 'table_name' = 'brk_payments') >= 4);
  perform pg_temp.chk('I2 other registrations'' rows are not in P1''s history',
    not exists (select 1 from jsonb_array_elements(public.brk_registration_history(v_p1) -> 'rows') x
                 where x -> 'after' ->> 'first_name' in ('Ra', 'Rb', 'Cam') and x ->> 'table_name' = 'brk_registrations'));
  perform pg_temp.st('I2 not found', public.brk_registration_history(gen_random_uuid()), 'not_found');
  perform pg_temp.st('I2 invalid', public.brk_registration_history(null), 'invalid');
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('I2 no session', public.brk_registration_history(v_p1), 'no_access');

  -- I3. change_log rows exist for the writes, with the function's own action name and the right actor
  perform pg_temp.chk('I3 the sign-up: actor Family form, action brk_public_signup',
    exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_registrations' and l.record_id = v_p1 and l.op = 'insert'
              and l.actor_name = 'Family form' and l.action = 'brk_public_signup'));
  perform pg_temp.chk('I3 the walk-in: actor the desk, action brk_add_student',
    exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_registrations' and l.op = 'insert' and l.action = 'brk_add_student' and l.actor_name = v_dn));
  perform pg_temp.chk('I3 Mark paid: a payments row and a registrations update, actor the desk, one batch',
    exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_payments' and l.op = 'insert' and l.action = 'brk_mark_paid' and l.actor_name = v_dn and l.batch_id is not null));
  perform pg_temp.chk('I3 Square: the payment is logged by "Square", action brk_square_payment',
    exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_payments' and l.op = 'insert' and l.action = 'brk_square_payment' and l.actor_name = 'Square'));
  perform pg_temp.chk('I3 the admin''s writes: settings, chart, events, classes, override, refund, edit payment, dismiss',
    exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_settings' and l.action = 'brk_save_settings' and l.actor_name = v_an)
    and exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_chart' and l.action = 'brk_save_chart' and l.actor_name = v_an)
    and exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_events' and l.op = 'insert' and l.action = 'brk_add_event' and l.actor_name = v_an)
    and exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_event_classes' and l.action = 'brk_save_classes')
    and exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_registrations' and l.action = 'brk_set_override' and l.actor_name = v_an)
    and exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_payments' and l.action = 'brk_record_refund' and l.actor_name = v_an)
    and exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_payments' and l.action = 'brk_edit_payment' and l.actor_name = v_an)
    and exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'brk_square_events' and l.action = 'brk_dismiss_square_event' and l.actor_name = v_an));
  perform pg_temp.chk('I3 no history row holds a signature, a password-like field or the Square access token (none exists here at all)',
    not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name like 'brk\_%' and (l.after::text ~* 'token|signature|password' or l.before::text ~* 'token|signature|password')));

  -- ===================================================================
  -- J. Rights and rules (catalog proofs - they hold on Supabase too)
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  -- J1. tables: RLS on, no policy but "authenticated may read when has_data_access()", nothing for anon / service_role, no write for the app
  for v_tbl in select unnest(array['brk_settings', 'brk_chart', 'brk_events', 'brk_event_classes', 'brk_registrations', 'brk_payments',
                                   'brk_public_attempts', 'brk_square_events', 'brk_cleared_links']) loop
    perform pg_temp.chk('J1 ' || v_tbl || ': row level security is on',
      (select c.relrowsecurity from pg_class c where c.oid = ('public.' || v_tbl)::regclass) is true);
    perform pg_temp.chk('J1 ' || v_tbl || ': nothing for anon or service_role at all (table or column)',
      not has_any_column_privilege('anon', 'public.' || v_tbl, 'SELECT,INSERT,UPDATE,REFERENCES')
      and not has_any_column_privilege('service_role', 'public.' || v_tbl, 'SELECT,INSERT,UPDATE,REFERENCES')
      and not has_table_privilege('anon', 'public.' || v_tbl, 'DELETE,TRUNCATE,TRIGGER')
      and not has_table_privilege('service_role', 'public.' || v_tbl, 'DELETE,TRUNCATE,TRIGGER'));
    perform pg_temp.chk('J1 ' || v_tbl || ': the app (authenticated) can not write: no insert / update / delete / truncate',
      not has_any_column_privilege('authenticated', 'public.' || v_tbl, 'INSERT,UPDATE')
      and not has_table_privilege('authenticated', 'public.' || v_tbl, 'DELETE,TRUNCATE,TRIGGER,REFERENCES'));
    perform pg_temp.chk('J1 ' || v_tbl || ': neither new login (brk_registrar, brk_square) holds any right on it',
      not has_any_column_privilege('brk_registrar', 'public.' || v_tbl, 'SELECT,INSERT,UPDATE,REFERENCES')
      and not has_any_column_privilege('brk_square', 'public.' || v_tbl, 'SELECT,INSERT,UPDATE,REFERENCES')
      and not has_table_privilege('brk_registrar', 'public.' || v_tbl, 'DELETE,TRUNCATE,TRIGGER')
      and not has_table_privilege('brk_square', 'public.' || v_tbl, 'DELETE,TRUNCATE,TRIGGER'));
  end loop;
  perform pg_temp.chk('J1 the attempts table, the Square message table and the cleared links can be read by nobody in the app',
    not has_any_column_privilege('authenticated', 'public.brk_public_attempts', 'SELECT')
    and not has_any_column_privilege('authenticated', 'public.brk_square_events', 'SELECT')
    and not has_any_column_privilege('authenticated', 'public.brk_cleared_links', 'SELECT'));
  perform pg_temp.chk('J1 every policy on a Board breaking table is a SELECT policy for authenticated only, gated by has_data_access()',
    not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename like 'brk\_%'
                 and (p.cmd <> 'SELECT' or p.roles <> array['authenticated']::name[] or p.qual not like '%has_data_access%'))
    and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename like 'brk\_%') >= 1);
  perform pg_temp.chk('J1 no policy exists for anon or public',
    not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename like 'brk\_%' and (p.roles && array['anon', 'public']::name[])));
  -- the columns staff may NOT read directly
  perform pg_temp.chk('J1 authenticated can not read square_order_id, square_link_url, submission_id (registrations) or recorded_by, paying_by_before (payments)',
    not has_column_privilege('authenticated', 'public.brk_registrations', 'square_order_id', 'SELECT')
    and not has_column_privilege('authenticated', 'public.brk_registrations', 'square_link_url', 'SELECT')
    and not has_column_privilege('authenticated', 'public.brk_registrations', 'submission_id', 'SELECT')
    and not has_column_privilege('authenticated', 'public.brk_payments', 'recorded_by', 'SELECT')
    and not has_column_privilege('authenticated', 'public.brk_payments', 'paying_by_before', 'SELECT'));
  perform pg_temp.chk('J1 ... while the ordinary columns can be read (names, boards, amounts)',
    has_column_privilege('authenticated', 'public.brk_registrations', 'first_name', 'SELECT')
    and has_column_privilege('authenticated', 'public.brk_registrations', 'amount_cents', 'SELECT')
    and has_column_privilege('authenticated', 'public.brk_events', 'name', 'SELECT'));
  perform pg_temp.chk('J1 a registration has no date of birth, address, phone, email or signature column at all',
    not exists (select 1 from pg_attribute a where a.attrelid = 'public.brk_registrations'::regclass and a.attnum > 0 and not a.attisdropped
                 and a.attname ~* 'birth|dob|address|phone|email|signature|contact|medical'));
  -- no sequence is usable by the app or the new logins
  perform pg_temp.chk('J1 no Board breaking sequence is usable by anon, authenticated, service_role or the two new logins',
    not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace, unnest(array['anon', 'authenticated', 'service_role', 'brk_registrar', 'brk_square']) as r
                 where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'brk\_%'
                   and has_sequence_privilege(r, c.oid, 'USAGE,SELECT,UPDATE')));
  -- the app really is refused (as the role, with an unlocked admin token)
  perform set_config('request.jwt.claims', v_c_a1, true);
  foreach v_tbl in array array['brk_settings', 'brk_chart', 'brk_events', 'brk_event_classes', 'brk_registrations', 'brk_payments',
                               'brk_public_attempts', 'brk_square_events', 'brk_cleared_links'] loop
    foreach v_txt in array array[format('insert into public.%I default values', v_tbl),
                                 format('update public.%I set %I = default', v_tbl, case when v_tbl = 'brk_cleared_links' then 'order_id' else 'id' end),
                                 format('delete from public.%I', v_tbl)] loop
      begin
        set local role authenticated;
        execute v_txt;
        reset role;
        raise exception 'TEST FAILED: J1 the app''s role could run: %', v_txt;
      exception
        when insufficient_privilege then
          reset role;
      end;
    end loop;
  end loop;
  perform pg_temp.chk('J1 the app''s role is refused every direct insert, update and delete (27 statements)', true);
  begin
    set local role authenticated;
    perform count(x.id) from public.brk_registrations x where x.square_order_id is not null;
    reset role;
    raise exception 'TEST FAILED: J1 the app''s role could read square_order_id';
  exception
    when insufficient_privilege then
      reset role;
  end;
  begin
    set local role anon;
    perform count(*) from public.brk_events;
    reset role;
    raise exception 'TEST FAILED: J1 anon could read brk_events';
  exception
    when insufficient_privilege then
      reset role;
  end;
  perform pg_temp.chk('J1 the app can not read the Square columns; anon reads nothing', true);
  perform set_config('request.jwt.claims', '', true);

  -- J2. the two new logins
  for v_tbl in select unnest(array['brk_registrar', 'brk_square']) loop
    perform pg_temp.chk('J2 ' || v_tbl || ': a login without superuser, createdb, createrole, bypassrls, replication or inheritance',
      exists (select 1 from pg_roles r where r.rolname = v_tbl and r.rolcanlogin and not r.rolinherit and not r.rolsuper and not r.rolcreatedb
                and not r.rolcreaterole and not r.rolbypassrls and not r.rolreplication));
    perform pg_temp.chk('J2 ' || v_tbl || ': a member of no role',
      not exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.member where r.rolname = v_tbl));
    perform pg_temp.chk('J2 ' || v_tbl || ': statement_timeout 5s, idle_in_transaction_session_timeout 10s, empty search_path',
      (select r.rolconfig @> array['statement_timeout=5s', 'idle_in_transaction_session_timeout=10s', 'search_path=""']
         from pg_roles r where r.rolname = v_tbl));
    perform pg_temp.chk('J2 ' || v_tbl || ': it can not create anything in schema public',
      not has_schema_privilege(v_tbl, 'public', 'CREATE'));
  end loop;
  perform pg_temp.chk('J2 connection limits: brk_registrar 5, brk_square 3',
    (select r.rolconnlimit from pg_roles r where r.rolname = 'brk_registrar') = 5
    and (select r.rolconnlimit from pg_roles r where r.rolname = 'brk_square') = 3);

  -- J3. functions: the staff 21 for authenticated only; the public 4 for brk_registrar only; Square's one for brk_square only; nothing else
  for v_fn in
    select p.oid, p.proname::text as name, p.prosecdef, p.proconfig, p.proacl, p.proowner,
           (p.proname = any (array['brk_settings_get', 'brk_events_list', 'brk_event_roster', 'brk_registration_history', 'brk_add_event',
                                   'brk_update_event', 'brk_delete_event', 'brk_save_classes', 'brk_add_student', 'brk_edit_registration',
                                   'brk_set_override', 'brk_set_broke', 'brk_mark_paid', 'brk_undo_payment', 'brk_edit_payment',
                                   'brk_record_refund', 'brk_undo_refund', 'brk_delete_registration', 'brk_save_settings',
                                   'brk_save_chart', 'brk_dismiss_square_event'])) as is_staff,
           (p.proname = any (array['brk_public_event', 'brk_public_signup', 'brk_public_registration', 'brk_public_set_link'])) as is_public,
           (p.proname = 'brk_square_payment') as is_square
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'brk\_%'
  loop
    perform pg_temp.chk('J3 ' || v_fn.oid::regprocedure::text || ': search_path is empty',
      v_fn.proconfig is not null and v_fn.proconfig @> array['search_path=""']);
    perform pg_temp.chk('J3 ' || v_fn.oid::regprocedure::text || ': nobody but the owner and its own login may run it',
      not exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) as a where a.grantee = 0)
      and not has_function_privilege('anon', v_fn.oid, 'EXECUTE') and not has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
      and has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') = v_fn.is_staff
      and has_function_privilege('brk_registrar', v_fn.oid, 'EXECUTE') = v_fn.is_public
      and has_function_privilege('brk_square', v_fn.oid, 'EXECUTE') = v_fn.is_square);
    if v_fn.is_staff or v_fn.is_public or v_fn.is_square then
      perform pg_temp.chk('J3 ' || v_fn.oid::regprocedure::text || ': security definer', v_fn.prosecdef);
    end if;
  end loop;
  perform pg_temp.chk('J3 exactly 21 + 4 + 1 functions, one version each',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any (array['brk_settings_get', 'brk_events_list', 'brk_event_roster', 'brk_registration_history',
        'brk_add_event', 'brk_update_event', 'brk_delete_event', 'brk_save_classes', 'brk_add_student', 'brk_edit_registration', 'brk_set_override',
        'brk_set_broke', 'brk_mark_paid', 'brk_undo_payment', 'brk_edit_payment', 'brk_record_refund', 'brk_undo_refund', 'brk_delete_registration',
        'brk_save_settings', 'brk_save_chart', 'brk_dismiss_square_event', 'brk_public_event', 'brk_public_signup', 'brk_public_registration',
        'brk_public_set_link', 'brk_square_payment'])) = 26
    and (select count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname like 'brk\_%' and p.proname = any (array['brk_settings_get', 'brk_events_list', 'brk_event_roster',
            'brk_registration_history', 'brk_add_event', 'brk_update_event', 'brk_delete_event', 'brk_save_classes', 'brk_add_student',
            'brk_edit_registration', 'brk_set_override', 'brk_set_broke', 'brk_mark_paid', 'brk_undo_payment', 'brk_edit_payment',
            'brk_record_refund', 'brk_undo_refund', 'brk_delete_registration', 'brk_save_settings', 'brk_save_chart', 'brk_dismiss_square_event',
            'brk_public_event', 'brk_public_signup', 'brk_public_registration', 'brk_public_set_link', 'brk_square_payment'])) = 26);
  -- in schema public each new login runs exactly its own functions (as 0013's T2a)
  for v_fn in select p.oid, p.proname::text as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    if has_function_privilege('brk_registrar', v_fn.oid, 'EXECUTE')
         is distinct from (v_fn.name = any (array['brk_public_event', 'brk_public_signup', 'brk_public_registration', 'brk_public_set_link'])) then
      raise exception 'TEST FAILED: J3 brk_registrar execute on % is %', v_fn.oid::regprocedure, has_function_privilege('brk_registrar', v_fn.oid, 'EXECUTE');
    end if;
    if has_function_privilege('brk_square', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = 'brk_square_payment') then
      raise exception 'TEST FAILED: J3 brk_square execute on % is %', v_fn.oid::regprocedure, has_function_privilege('brk_square', v_fn.oid, 'EXECUTE');
    end if;
    -- the other forms' and sections' logins can not run Board breaking's functions
    if v_fn.name like 'brk\_%'
       and ((exists (select 1 from pg_roles where rolname = 'camps_registrar') and has_function_privilege('camps_registrar', v_fn.oid, 'EXECUTE'))
         or (exists (select 1 from pg_roles where rolname = 'testing_registrar') and has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE'))
         or (exists (select 1 from pg_roles where rolname = 'star_registrar') and has_function_privilege('star_registrar', v_fn.oid, 'EXECUTE'))) then
      raise exception 'TEST FAILED: J3 another form''s login can run %', v_fn.oid::regprocedure;
    end if;
  end loop;
  perform pg_temp.chk('J3 brk_registrar runs exactly the 4 public functions and brk_square exactly brk_square_payment (all of schema public checked)', true);
  perform pg_temp.chk('J3 the public functions and Square''s are not callable by the app''s role; the staff ones are not callable by the two logins',
    not has_function_privilege('authenticated', 'public.brk_public_signup(text, text, uuid, text, text, integer, text, uuid, integer, integer, text, integer)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.brk_square_payment(text, text, text, text, integer, text, text)', 'EXECUTE')
    and not has_function_privilege('brk_registrar', 'public.brk_square_payment(text, text, text, text, integer, text, text)', 'EXECUTE')
    and not has_function_privilege('brk_square', 'public.brk_public_signup(text, text, uuid, text, text, integer, text, uuid, integer, integer, text, integer)', 'EXECUTE')
    and not has_function_privilege('brk_registrar', 'public.brk_mark_paid(uuid, integer, text, text)', 'EXECUTE')
    and not has_function_privilege('brk_square', 'public.brk_mark_paid(uuid, integer, text, text)', 'EXECUTE'));
  perform pg_temp.chk('J3 the app (authenticated) is refused by the public functions as the role itself',
    pg_temp.fails('set local role authenticated; select public.brk_public_event(''zzzzzzzz'')')
    and pg_temp.fails('set local role anon; select public.brk_public_event(''zzzzzzzz'')')
    and pg_temp.fails('set local role anon; select public.brk_settings_get()'));
  reset role;

  perform set_config('tkd.t51_done', current_setting('tkd.t51', true), true);
end
$$;

select 'ALL 0051 TESTS PASSED' as result, current_setting('tkd.t51_done', true) as checks;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
