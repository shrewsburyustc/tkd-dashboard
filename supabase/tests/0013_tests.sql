-- =====================================================================
-- 0013_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0013_camps.sql (Camps: camps,
--   templates, the family sign-up form, check-in, payments). It checks,
--   in this order (contract CONTRACT-0013 §2.1):
--     T1  who may call what: anon nothing; signed-in staff only the staff
--         functions; locked / PIN-locked / signed-out / magic-link /
--         8-day-old sessions get no_access; staff vs admin
--     T2  the restricted login camps_registrar: exactly the two public
--         functions, no table rights anywhere, can't create anything, not
--         part of any role, the API login can't become it; the other two
--         form logins can't run camp functions
--     T3  prices: the shared price case table (P1-P10), every grid cell,
--         broken grids refused
--     T4  extras: once, per day, not for all-days campers, order
--     T5  snapshots and the re-price rule, Owes, overpaid, Mark paid
--     T6  dates in America/New_York at the minute boundaries, Close /
--         Reopen, a walk-in sign-up on a camp day
--     T7  check-in: staff today only, admins earlier days, never future
--     T8  "both schools" visibility (the two queries the app sends)
--     T9  payments are append-only; Undo / Edit payment
--     T10 removing a whole camp; removing days / extras in Edit camp
--     T11 the family form: same send twice, every refusal, camp_changed,
--         price_changed, bad jsonb (each refused AND counted), the rate
--         limit in Camps' own ledger
--     T12 possible duplicates: keep both, keep one, Restore, Withdraw
--     T13 signatures: the rules, the 3-year clean-up, never readable,
--         never in the history
--     T14 templates; T14a the roster actions' roles
--     T15 the history (change_log): action, actor, one batch per call
--     T16 catalog: RLS, search_path, security definer, owners, rights
--   It makes its own camps with unusual names ("zz test 1a2b3c4d ..."),
--   so it works whatever is already in the database (run it before AND
--   after the first real camp exists).
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test camps, sign-ups, payments,
--   history rows, test sessions). NEVER change the final "rollback;" to
--   "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0005_tests.sql (read its header): a pretend login token
--   per session in request.jwt.claims, and "set local role authenticated"
--   where the table / function RIGHTS are being tested. Sessions:
--     A1 admin unlocked · A2 locked ("Lock now") · A3 5 wrong PINs ·
--     A4 signed out · A5 password sign-in 8 days ago · A6 magic link ·
--     D1 desk unlocked · D2 desk locked · D3 desk magic link · anon
--   The family form's functions are called as the SQL Editor's own role:
--   they always run as their owner, so the answers are the same as for
--   camps_registrar (whose rights T2 proves from the catalog).
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0010 and 0013 are applied. You need TWO existing, ACTIVE
--      staff rows: an admin (Main Admin) and the shared front desk (Staff,
--      role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test removes its
--      own test rows and checks that some removals are REFUSED. Everything
--      is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0013 TESTS PASSED".
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
  v_c_anon text := '{"role": "anon"}';

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_rand  uuid := gen_random_uuid();
  v_rand2 uuid := gen_random_uuid();
  v_role  text;
  v_an    text;   -- the admin's and the desk's names (as the history shows them)
  v_dn    text;

  v_sig      text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  v_sig_long text := 'data:image/png;base64,' || repeat('A', 70000 - 22 + 1);
  v_sig_max  text := 'data:image/png;base64,' || repeat('A', 70000 - 22);
  v_sig_gif  text := 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  v_ack      text := 'camp-2026-10-18';

  v_r      jsonb;
  v_r2     jsonb;
  v_i      integer;
  v_j      integer;
  v_n      integer;
  v_n2     integer;
  v_v      integer;
  v_v2     integer;
  v_txt    text;
  v_bool   boolean;
  v_mark   bigint;
  v_mark0  bigint;   -- the last history row before this test run
  v_list   text[];
  v_labels text[];
  v_calls  text[];
  v_ids    uuid[];
  v_dates  date[];
  v_ts     timestamptz;
  v_d      date;
  v_j1     jsonb;
  v_admin_only integer[] := array[1, 2, 4, 5, 6, 7, 12, 16];
  v_snap   text;
  v_snap2  text;

  -- camps (A = the price case camp, R = the same with regular prices ...)
  v_ca uuid; v_ca_code text; v_cr uuid; v_cr_code text; v_ct uuid; v_ct_code text; v_cx uuid; v_cx_code text;
  v_cw uuid; v_cs uuid; v_cb uuid; v_ck uuid; v_ck_code text; v_cd uuid; v_cd_code text; v_cp uuid; v_cp_code text;
  v_cn uuid; v_cn_code text; v_cc uuid; v_cc_code text; v_co uuid; v_co_code text; v_ce uuid; v_ce_code text;
  v_cm uuid; v_cm_code text;
  -- days and extras of camp A
  v_a_d uuid[]; v_drop uuid; v_pick uuid; v_pizza uuid;
  -- sign-up references and campers
  v_ref text; v_ref2 text;
  v_mia uuid; v_ava uuid; v_ethan uuid; v_leo uuid; v_noah uuid; v_liam uuid; v_sofia uuid; v_ava9 uuid;
  v_k1 uuid; v_k2 uuid; v_k3 uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid; v_sub uuid;
  v_key text;
  v_tpl uuid; v_tplv integer;

  -- catalog
  v_fn      record;
  v_tbl     text;
  v_reg_oid oid;
  v_owner   oid;
  v_staff_fns text[] := array[
    'camp_add_camp', 'camp_update_camp', 'camp_set_signup', 'camp_delete_camp', 'camp_save_template',
    'camp_update_template', 'camp_delete_template', 'camp_update_details', 'camp_change_paying_by', 'camp_mark_paid',
    'camp_undo_payment', 'camp_edit_payment', 'camp_resolve_duplicate', 'camp_withdraw_camper', 'camp_restore_camper',
    'camp_delete_camper', 'camp_check_in', 'camp_undo_check_in', 'camp_camper_detail'];
  v_public_fns text[] := array['camp_public_camp', 'camp_public_signup'];
  v_helper_fns text[] := array[
    'camp_text_is_valid', 'camp_days_arg_is_valid', 'camp_uuid_text_is_valid', 'camp_int_text_is_valid',
    'camp_time_is_valid', 'camp_prices_arg_is_valid', 'camp_extras_arg_is_valid', 'camp_uuid_list_is_valid',
    'camp_camper_extras_arg_is_valid', 'camp_children_arg_is_valid', 'camp_template_setup_is_valid', 'camp_price_kind',
    'camps_before_write', 'camp_templates_before_write', 'camp_parts_before_write', 'camp_signups_before_write',
    'camp_campers_before_write', 'camp_camper_days_before_write', 'camp_camper_extras_before_write',
    'camp_payments_guard', 'camp_signups_log', 'camp_first_day', 'camp_last_day', 'camp_day_count',
    'camp_signup_state', 'camp_base_cents', 'camp_camper_total_cents', 'camp_camper_paid_cents',
    'camp_purge_old_signatures', 'camp_find_duplicate', 'camp_recheck_duplicate', 'camp_recheck_pointing_at',
    'camp_lock_camper', 'camp_lock_payment', 'camp_public_camp_answer', 'camp_public_signup_answer', 'camp_add_parts',
    'camp_tidy_extras', 'camp_tidy_prices', 'camp_setup_args_are_valid', 'camp_extra_rows',
    'camp_camper_extras_are_ok', 'camp_extras_cents_now', 'camp_public_signup_core'];
  v_tables text[] := array[
    'camps', 'camp_days', 'camp_prices', 'camp_extras', 'camp_templates', 'camp_signups', 'camp_campers',
    'camp_camper_days', 'camp_camper_extras', 'camp_payments', 'camp_public_attempts'];
  v_read_tables text[] := array[
    'camps', 'camp_days', 'camp_prices', 'camp_extras', 'camp_templates', 'camp_signups', 'camp_campers',
    'camp_camper_days', 'camp_camper_extras', 'camp_payments'];
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
  if to_regclass('public.camps') is null then
    raise exception 'TEST SETUP: public.camps is missing (is 0013 applied?)';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'camps_registrar') then
    raise exception 'TEST SETUP: role camps_registrar is missing (is 0013 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  select coalesce(max(l.id), 0) into v_mark0 from public.change_log l;

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

  -- Temporary helpers for this run only (pg_temp = gone at the end):
  --   grid(n)        the April Vacation Camp price grid (contract §1.20) for
  --                  n days (rows past 5 are made up)
  --   xtr()          its three extras: Early drop-off $15 a day, Late
  --                  pick-up $8 a day, Pizza party $5 once (not for
  --                  all-days campers)
  --   mk(...)        Add camp as the caller (ages 5-12, 9:00-15:00), id back
  --   xtr_ids(camp)  the camp's extras as Edit camp sends them (with ids)
  --   dy(camp, i)    the camp's i-th day id;  dys(camp, [i...]) several
  --   xid(camp, n)   the id of the camp's extra called n
  --   code(camp)     its link code
  --   ch(...)        one child for the family form; ex(extra, days) one extra
  --   su(code, key, children, total)  a family sign-up (fixed family fields)
  --   cmp(ref, pos)  the camper at position pos of sign-up ref
  --   cv(camper)     its version;  ro(camper)  its camp_roster row
  --   st(label, answer, status)  fails unless answer.status = status
  execute $f$
    create function pg_temp.grid(p_n integer) returns jsonb language sql as $b$
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
    create function pg_temp.xtr() returns jsonb language sql as $b$
      select '[{"name": "Early drop-off", "price_cents": 1500, "per": "day", "not_for_all_days": false},
               {"name": "Late pick-up", "price_cents": 800, "per": "day", "not_for_all_days": false},
               {"name": "Pizza party", "price_cents": 500, "per": "once", "not_for_all_days": true}]'::jsonb;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.mk(p_name text, p_loc text, p_both boolean, p_days date[], p_opens date, p_closes date, p_early date)
    returns uuid language plpgsql as $b$
    declare
      v_r jsonb;
    begin
      v_r := public.camp_add_camp(p_loc, p_both, p_name, p_days, '09:00', '15:00', p_opens, p_closes, p_early, 5, 12,
                                  pg_temp.grid(cardinality(p_days)), pg_temp.xtr(), 'Bring a lunch.', 'I agree to the camp rules.');
      if v_r ->> 'status' is distinct from 'ok' then
        raise exception 'TEST SETUP: camp_add_camp % answered %', p_name, v_r;
      end if;
      return (v_r ->> 'id')::uuid;
    end;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.xtr_ids(p_camp uuid) returns jsonb language sql as $b$
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'price_cents', e.price_cents,
                                                   'per', e.per, 'not_for_all_days', e.not_for_all_days) order by e.sort), '[]'::jsonb)
        from public.camp_extras e where e.camp_id = p_camp;
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
    create function pg_temp.code(p_camp uuid) returns text language sql as $b$
      select c.public_code from public.camps c where c.id = p_camp;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ch(p_first text, p_last text, p_age integer, p_member boolean, p_days uuid[], p_extras jsonb)
    returns jsonb language sql as $b$
      select jsonb_build_object('first_name', p_first, 'last_name', p_last, 'age', p_age, 'member', p_member,
                                'day_ids', to_jsonb(p_days), 'extras', p_extras);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ex(p_extra uuid, p_days uuid[]) returns jsonb language sql as $b$
      select jsonb_build_object('extra_id', p_extra, 'day_ids', to_jsonb(coalesce(p_days, '{}'::uuid[])));
    $b$;
  $f$;
  execute $f$
    create function pg_temp.su(p_code text, p_key text, p_children jsonb, p_total integer) returns jsonb language sql as $b$
      select public.camp_public_signup(p_code, p_key, gen_random_uuid(), p_children, 'Pat Parent', '5085550100', 'Mother',
               'Sam Contact', '5085550101', 'Aunt', 'cash', true,
               'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
               'camp-2026-10-18', (select md5(c.waiver_text) from public.camps c where c.public_code = p_code), p_total);
    $b$;
  $f$;
  execute $f$
    create function pg_temp.cmp(p_ref text, p_pos integer) returns uuid language sql as $b$
      select c.id from public.camp_campers c join public.camp_signups s on s.id = c.signup_id
       where s.reference = p_ref and c.position = p_pos;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.cv(p_camper uuid) returns integer language sql as $b$
      select c.version from public.camp_campers c where c.id = p_camper;
    $b$;
  $f$;
  execute $f$
    create function pg_temp.ro(p_camper uuid) returns jsonb language sql as $b$
      select to_jsonb(r) from public.camp_roster r where r.id = p_camper;
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
  -- t15(mark, action, actor name, label): the history rows written since
  -- mark all carry this action (the purge's own rows aside), this actor
  -- and ONE batch id; there is at least one
  execute $f$
    create function pg_temp.t15(p_mark bigint, p_action text, p_name text, p_label text) returns void language plpgsql as $b$
    begin
      if not exists (select 1 from public.change_log l where l.id > p_mark and l.action = p_action) then
        raise exception 'TEST FAILED: T15 % wrote no history row with action %', p_label, p_action;
      end if;
      if exists (select 1 from public.change_log l
                  where l.id > p_mark and l.action <> 'camp_purge_old_signatures'
                    and (l.action <> p_action or l.actor_name <> p_name or l.batch_id is null
                         or (l.table_name not like 'camp\_%' and l.table_name <> 'camps'))) then
        raise exception 'TEST FAILED: T15 % history rows: %', p_label,
          (select jsonb_agg(jsonb_build_object('action', l.action, 'table', l.table_name, 'actor', l.actor_name, 'batch', l.batch_id))
             from public.change_log l where l.id > p_mark);
      end if;
      if (select count(distinct l.batch_id) from public.change_log l
           where l.id > p_mark and l.action <> 'camp_purge_old_signatures') <> 1 then
        raise exception 'TEST FAILED: T15 % used more than one batch id', p_label;
      end if;
    end;
    $b$;
  $f$;

  -- The test camps (made by the admin through camp_add_camp):
  --   A  "April": the price case camp - 5 days in a row, 30 days from now,
  --      early price until 5 days from now, held at Worcester, Both schools
  --   R  the same camp with the early price already over (regular)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_dates := array(select v_today + 30 + x from generate_series(0, 4) as x);
  v_ca := pg_temp.mk(v_tag || ' April', 'worcester', true, v_dates, v_today - 1, v_today + 20, v_today + 5);
  v_cr := pg_temp.mk(v_tag || ' April Late', 'worcester', true, v_dates, v_today - 3, v_today + 20, v_today - 1);
  v_ca_code := pg_temp.code(v_ca);  v_cr_code := pg_temp.code(v_cr);
  v_a_d   := pg_temp.dys(v_ca, array[1, 2, 3, 4, 5]);   -- Mon .. Fri
  v_drop  := pg_temp.xid(v_ca, 'Early drop-off');
  v_pick  := pg_temp.xid(v_ca, 'Late pick-up');
  v_pizza := pg_temp.xid(v_ca, 'Pizza party');
  if cardinality(v_a_d) <> 5 or v_drop is null or v_pick is null or v_pizza is null then
    raise exception 'TEST SETUP: camp A has % days and extras %, %, %', cardinality(v_a_d), v_drop, v_pick, v_pizza;
  end if;

  -- ===================================================================
  -- T1. Who may call what
  -- ===================================================================

  -- The 18 staff functions + camp_camper_detail, with harmless arguments
  -- (the index matters: v_admin_only lists the admin-only ones).
  v_calls := array[
    format('public.camp_add_camp(%L, false, %L, array[%L::date], %L::time, %L::time, %L::date, %L::date, %L::date, 5, 12, %L::jsonb, %L::jsonb, null, %L)',
           'worcester', v_tag || ' gate', v_today + 1, '09:00', '15:00', v_today, v_today, v_today, pg_temp.grid(1), '[]', 'W'),
    format('public.camp_update_camp(%L::uuid, 1, %L, false, %L, array[%L::date], %L::time, %L::time, %L::date, %L::date, %L::date, 5, 12, %L::jsonb, %L::jsonb, null, %L)',
           v_rand, 'worcester', 'x', v_today + 1, '09:00', '15:00', v_today, v_today, v_today, pg_temp.grid(1), '[]', 'W'),
    format('public.camp_set_signup(%L::uuid, 1, true)', v_rand),
    format('public.camp_delete_camp(%L::uuid, 1, 0, 0)', v_rand),
    format('public.camp_save_template(%L::uuid, %L)', v_rand, 'x'),
    format('public.camp_update_template(%L::uuid, 1, %L, %L, false, 1, %L::time, %L::time, 7, 1, 7, 5, 12, %L::jsonb, %L::jsonb, null, %L)',
           v_rand, 'x', 'worcester', '09:00', '15:00', pg_temp.grid(1), '[]', 'W'),
    format('public.camp_delete_template(%L::uuid, 1)', v_rand),
    format('public.camp_update_details(%L::uuid, 1, 1, %L, %L, 8, true, array[%L::uuid], %L::jsonb, %L, %L, %L, %L, %L, %L)',
           v_rand, 'Ann', 'Lee', v_rand2, '[]', 'Pat Lee', '5085550100', 'Mother', 'Sam Lee', '5085550101', 'Aunt'),
    format('public.camp_change_paying_by(%L::uuid, 1, %L)', v_rand, 'cash'),
    format('public.camp_mark_paid(%L::uuid, 1)', v_rand),
    format('public.camp_undo_payment(%L::uuid)', v_rand),
    format('public.camp_edit_payment(%L::uuid, %L, 100, %L::date)', v_rand, 'cash', v_today),
    format('public.camp_resolve_duplicate(%L::uuid, 1, %L::uuid, 1, true)', v_rand, v_rand2),
    format('public.camp_withdraw_camper(%L::uuid, 1)', v_rand),
    format('public.camp_restore_camper(%L::uuid, 1)', v_rand),
    format('public.camp_delete_camper(%L::uuid, 1, %L::uuid[])', v_rand, '{}'),
    format('public.camp_check_in(%L::uuid, %L::uuid)', v_rand, v_rand2),
    format('public.camp_undo_check_in(%L::uuid, %L::uuid)', v_rand, v_rand2),
    format('public.camp_camper_detail(%L::uuid)', v_rand)];

  -- T1a. anon: no staff function, no public function, no table, no view
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  for v_i in 1 .. cardinality(v_calls) loop
    begin
      execute 'select ' || v_calls[v_i];
      raise exception 'TEST FAILED: T1a anon could call %', v_calls[v_i];
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin perform public.camp_public_camp('abcdefgh');
        raise exception 'TEST FAILED: T1a anon could call camp_public_camp'; exception when insufficient_privilege then null; end;
  begin perform public.camp_public_signup('abcdefgh', 'k', gen_random_uuid(), '[]'::jsonb, 'a', 'b', 'c', 'd', 'e', 'f', 'cash',
                                          true, v_sig, v_ack, 'x', 0);
        raise exception 'TEST FAILED: T1a anon could call camp_public_signup'; exception when insufficient_privilege then null; end;
  foreach v_tbl in array v_tables || array['camp_roster'] loop
    begin
      execute format('select 1 from public.%I limit 1', v_tbl);
      raise exception 'TEST FAILED: T1a anon could read %', v_tbl;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;

  -- T1b. a signed-in, unlocked admin (A1): not the public functions, the
  --      core or any helper; no direct writes; none of the never-granted
  --      columns (phones, names of the family, signature, waiver copy,
  --      submission id, login ids); not the ledger or the counters
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin perform public.camp_public_camp('abcdefgh');
        raise exception 'TEST FAILED: T1b authenticated could call camp_public_camp'; exception when insufficient_privilege then null; end;
  begin perform public.camp_public_signup('abcdefgh', 'k', gen_random_uuid(), '[]'::jsonb, 'a', 'b', 'c', 'd', 'e', 'f', 'cash',
                                          true, v_sig, v_ack, 'x', 0);
        raise exception 'TEST FAILED: T1b authenticated could call camp_public_signup'; exception when insufficient_privilege then null; end;
  begin perform public.camp_public_signup_core('abcdefgh', 'k', gen_random_uuid(), '[]'::jsonb, 'a', 'b', 'c', 'd', 'e', 'f', 'cash',
                                               true, v_sig, v_ack, 'x', 0);
        raise exception 'TEST FAILED: T1b authenticated could call camp_public_signup_core'; exception when insufficient_privilege then null; end;
  begin perform public.camp_purge_old_signatures();
        raise exception 'TEST FAILED: T1b authenticated could call camp_purge_old_signatures'; exception when insufficient_privilege then null; end;
  begin perform public.camp_signup_state(v_ca, v_today);
        raise exception 'TEST FAILED: T1b authenticated could call camp_signup_state'; exception when insufficient_privilege then null; end;
  foreach v_tbl in array v_tables loop
    begin execute format('insert into public.%I default values', v_tbl);
          raise exception 'TEST FAILED: T1b A1 could insert into %', v_tbl; exception when insufficient_privilege then null; end;
    begin execute format('update public.%I set %I = %I', v_tbl,
                         case when v_tbl = 'camp_public_attempts' then 'outcome' else 'id' end,
                         case when v_tbl = 'camp_public_attempts' then 'outcome' else 'id' end);
          raise exception 'TEST FAILED: T1b A1 could update %', v_tbl; exception when insufficient_privilege then null; end;
    begin execute format('delete from public.%I where id = %L', v_tbl, case when v_tbl = 'camp_public_attempts' then '0' else v_rand::text end);
          raise exception 'TEST FAILED: T1b A1 could delete from %', v_tbl; exception when insufficient_privilege then null; end;
    begin execute format('truncate public.%I', v_tbl);
          raise exception 'TEST FAILED: T1b A1 could truncate %', v_tbl; exception when insufficient_privilege then null; end;
  end loop;
  foreach v_txt in array array['camps', 'camp_templates', 'camp_signups', 'camp_campers', 'camp_camper_days',
                               'camp_payments', 'camp_public_attempts'] loop
    begin execute format('select * from public.%I limit 1', v_txt);
          raise exception 'TEST FAILED: T1b A1 could select * from %', v_txt; exception when insufficient_privilege then null; end;
  end loop;
  foreach v_txt in array array[
      'camps.created_by', 'camps.updated_by', 'camp_templates.created_by', 'camp_templates.updated_by',
      'camp_signups.parent_name', 'camp_signups.parent_phone', 'camp_signups.parent_relation',
      'camp_signups.emergency_name', 'camp_signups.emergency_phone', 'camp_signups.emergency_relation',
      'camp_signups.signature', 'camp_signups.waiver_text_signed', 'camp_signups.submission_id',
      'camp_signups.ack_version', 'camp_signups.created_by', 'camp_signups.created_by_name',
      'camp_campers.withdrawn_by', 'camp_campers.created_by', 'camp_campers.updated_by',
      'camp_camper_days.checked_in_by', 'camp_payments.recorded_by', 'camp_public_attempts.client_key'] loop
    begin
      execute format('select x.%I from public.%I x limit 1', split_part(v_txt, '.', 2), split_part(v_txt, '.', 1));
      raise exception 'TEST FAILED: T1b A1 could read %', v_txt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin perform nextval('public.camp_signup_ref_seq');
        raise exception 'TEST FAILED: T1b A1 could use the reference counter'; exception when insufficient_privilege then null; end;
  reset role;
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_helper_fns || v_public_fns)
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_txt is not null then raise exception 'TEST FAILED: T1b authenticated can execute helper / public function(s): %', v_txt; end if;

  -- T1c. sessions without data access get no_access from EVERY staff
  --      function (A2 locked, A3 5 wrong PINs, A4 signed out, A5 8 days,
  --      A6 magic link, D2 locked, D3 magic link) - with real ids too
  v_calls := v_calls || array[format('public.camp_set_signup(%L::uuid, 1, false)', v_ca),
                              format('public.camp_camper_detail(%L::uuid)', v_ca)];
  v_list   := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d2, v_c_d3];
  v_labels := array['A2', 'A3', 'A4', 'A5', 'A6', 'D2', 'D3'];
  set local role authenticated;
  for v_n in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_n], true);
    for v_i in 1 .. cardinality(v_calls) loop
      execute 'select ' || v_calls[v_i] into v_r;
      if v_r is distinct from '{"status": "no_access"}'::jsonb then
        raise exception 'TEST FAILED: T1c session % got % from %', v_labels[v_n], v_r, v_calls[v_i];
      end if;
    end loop;
  end loop;

  -- T1d. the desk (role staff) gets not_allowed from every admin-only
  --      function; from the others an unknown id answers not_found
  perform set_config('request.jwt.claims', v_c_d1, true);
  for v_i in 1 .. 19 loop
    execute 'select ' || v_calls[v_i] into v_r;
    if v_r ->> 'status' is distinct from (case when v_i = any (v_admin_only) then 'not_allowed' else 'not_found' end) then
      raise exception 'TEST FAILED: T1d desk got % from %', v_r, v_calls[v_i];
    end if;
  end loop;
  reset role;

  -- T1e. no data access -> no rows; A1 and D1 see what postgres sees
  v_list   := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d2, v_c_d3, v_c_a1, v_c_d1];
  v_labels := array['A2', 'A3', 'A4', 'A5', 'A6', 'D2', 'D3', 'A1', 'D1'];
  foreach v_tbl in array v_read_tables || array['camp_roster'] loop
    execute format('select count(x.id) from public.%I x', v_tbl) into v_n2;
    for v_i in 1 .. cardinality(v_list) loop
      set local role authenticated;
      perform set_config('request.jwt.claims', v_list[v_i], true);
      execute format('select count(x.id) from public.%I x', v_tbl) into v_n;
      reset role;
      if v_n <> (case when v_labels[v_i] in ('A1', 'D1') then v_n2 else 0 end) then
        raise exception 'TEST FAILED: T1e session % read % rows of % (postgres sees %)', v_labels[v_i], v_n, v_tbl, v_n2;
      end if;
    end loop;
  end loop;
  if (select count(*) from public.camps c where c.id = v_ca) <> 1 then
    raise exception 'TEST FAILED: T1e test camp A is missing';
  end if;

  -- ===================================================================
  -- T2. The restricted login camps_registrar (catalog proofs - they hold
  --     on Supabase too, where PUBLIC keeps Supabase's default rights in
  --     Supabase's own schemas)
  -- ===================================================================
  select r.oid into v_reg_oid from pg_roles r where r.rolname = 'camps_registrar';

  -- T2a. in schema public it may run exactly the two camp public
  --      functions; testing_registrar / star_registrar none of Camps'
  for v_fn in
    select p.oid, p.proname::text as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    if has_function_privilege('camps_registrar', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_public_fns)) then
      raise exception 'TEST FAILED: T2a camps_registrar execute on % is %, expected %',
        v_fn.oid::regprocedure, has_function_privilege('camps_registrar', v_fn.oid, 'EXECUTE'), (v_fn.name = any (v_public_fns));
    end if;
    if (v_fn.name like 'camp\_%' or v_fn.name like 'camps\_%')
       and (has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE')
            or (exists (select 1 from pg_roles where rolname = 'star_registrar')
                and has_function_privilege('star_registrar', v_fn.oid, 'EXECUTE'))) then
      raise exception 'TEST FAILED: T2a another form''s login can run %', v_fn.oid::regprocedure;
    end if;
  end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_public_fns);
  if v_n <> 2 then raise exception 'TEST FAILED: T2a expected exactly 2 camp public functions (one version each), found %', v_n; end if;

  -- T2b. no function in public (0001-0013; extension members excluded) is
  --      executable by PUBLIC (= every role)
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE');
  if v_txt is not null then raise exception 'TEST FAILED: T2b function(s) executable by PUBLIC: %', v_txt; end if;

  -- T2c. no right on any table, column or sequence: nothing granted to it
  --      by name anywhere, and in every schema it can reach no right at
  --      all (PUBLIC's included) - explicitly none on either ledger
  select string_agg(c.oid::regclass::text, ', ') into v_txt
    from pg_class c
   where exists (select 1 from aclexplode(c.relacl) as a where a.grantee = v_reg_oid)
      or exists (select 1 from pg_attribute t, aclexplode(t.attacl) as a
                  where t.attrelid = c.oid and a.grantee = v_reg_oid);
  if v_txt is not null then raise exception 'TEST FAILED: T2c rights granted to camps_registrar on: %', v_txt; end if;
  select string_agg(c.oid::regclass::text, ', ') into v_txt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
     and has_schema_privilege('camps_registrar', n.oid, 'USAGE')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('camps_registrar', c.oid, 'USAGE, SELECT, UPDATE')
               else has_table_privilege('camps_registrar', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                    or has_any_column_privilege('camps_registrar', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
          end);
  if v_txt is not null then raise exception 'TEST FAILED: T2c camps_registrar has rights on: %', v_txt; end if;
  foreach v_txt in array array['public.camp_public_attempts', 'public.testing_public_attempts'] loop
    if has_table_privilege('camps_registrar', v_txt, 'SELECT, INSERT, UPDATE, DELETE')
       or has_any_column_privilege('camps_registrar', v_txt, 'SELECT, INSERT, UPDATE')
       or has_table_privilege('authenticated', v_txt, 'SELECT, INSERT, UPDATE, DELETE')
       or has_any_column_privilege('authenticated', v_txt, 'SELECT, INSERT, UPDATE') then
      raise exception 'TEST FAILED: T2c camps_registrar or authenticated has a right on %', v_txt;
    end if;
  end loop;

  -- T2d. it can't create anything in any schema, nor in the database
  --      (this session's own temporary schema, made for the pg_temp
  --      helpers above, is left out - as 0006_tests.sql T2d explains)
  select string_agg(n.nspname, ', ') into v_txt
    from pg_namespace n
   where has_schema_privilege('camps_registrar', n.oid, 'CREATE')
     and n.oid <> pg_my_temp_schema();
  if v_txt is not null then raise exception 'TEST FAILED: T2d camps_registrar can CREATE in schema(s): %', v_txt; end if;
  if has_database_privilege('camps_registrar', current_database(), 'CREATE') then
    raise exception 'TEST FAILED: T2d camps_registrar can CREATE in the database';
  end if;

  -- T2e. memberships: the API login and roles can't become it; it is a
  --      member of no role; its only possible member is the tables' owner
  if exists (select 1 from pg_roles where rolname = 'authenticator')
     and pg_has_role('authenticator', 'camps_registrar', 'MEMBER') then
    raise exception 'TEST FAILED: T2e authenticator can become camps_registrar';
  end if;
  foreach v_txt in array array['anon', 'authenticated', 'service_role', 'testing_registrar'] loop
    if pg_has_role(v_txt, 'camps_registrar', 'MEMBER') then
      raise exception 'TEST FAILED: T2e % can become camps_registrar', v_txt;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'star_registrar')
     and pg_has_role('star_registrar', 'camps_registrar', 'MEMBER') then
    raise exception 'TEST FAILED: T2e star_registrar can become camps_registrar';
  end if;
  if exists (select 1 from pg_auth_members m where m.member = v_reg_oid) then
    raise exception 'TEST FAILED: T2e camps_registrar is a member of another role';
  end if;
  select c.relowner into v_owner from pg_class c where c.oid = 'public.camps'::regclass;
  if exists (select 1 from pg_auth_members m where m.roleid = v_reg_oid and m.member <> v_owner) then
    raise exception 'TEST FAILED: T2e a role other than the tables'' owner is a member of camps_registrar';
  end if;

  -- T2f. its attributes and settings (contract §1.18)
  if not exists (select 1 from pg_roles r
                  where r.rolname = 'camps_registrar'
                    and r.rolcanlogin and not r.rolinherit and not r.rolcreatedb and not r.rolcreaterole
                    and not r.rolbypassrls and not r.rolreplication and not r.rolsuper
                    and r.rolconnlimit = 5) then
    raise exception 'TEST FAILED: T2f camps_registrar attributes are not login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5';
  end if;
  select array_to_string(s.setconfig, ',') into v_txt
    from pg_db_role_setting s where s.setrole = v_reg_oid and s.setdatabase = 0;
  if v_txt is null
     or position('statement_timeout=5s' in v_txt) = 0
     or position('idle_in_transaction_session_timeout=10s' in v_txt) = 0
     or position('search_path=""' in v_txt) = 0 then
    raise exception 'TEST FAILED: T2f camps_registrar settings are %', v_txt;
  end if;

  -- T2g. every camp function and table belongs to the same owner
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
     and p.proowner <> v_owner;
  if v_txt is not null then raise exception 'TEST FAILED: T2g function(s) not owned by the tables'' owner: %', v_txt; end if;
  select string_agg(c.relname, ', ') into v_txt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = any (v_tables || array['camp_roster', 'camp_signup_ref_seq'])
     and c.relowner <> v_owner;
  if v_txt is not null then raise exception 'TEST FAILED: T2g table(s) not owned by the same owner: %', v_txt; end if;

  -- ===================================================================
  -- T3. Prices - the shared price case table (contract §1.20; the same
  --     rows are checked by src/lib/camps/checks.mjs)
  -- ===================================================================
  -- One more helper: ud(camper, first, last, age, member, days, extras,
  -- parent phone) = Edit details with the camper's current versions and
  -- fixed family fields.
  execute $f$
    create function pg_temp.ud(p_camper uuid, p_first text, p_last text, p_age integer, p_member boolean,
                               p_days uuid[], p_extras jsonb, p_phone text) returns jsonb language sql as $b$
      select public.camp_update_details(c.id, c.version, s.version, p_first, p_last, p_age, p_member, p_days, p_extras,
                                        'Pat Parent', p_phone, 'Mother', 'Sam Contact', '5085550101', 'Aunt')
        from public.camp_campers c join public.camp_signups s on s.id = c.signup_id
       where c.id = p_camper;
    $b$;
  $f$;

  -- T3a. every grid cell: day count x member x early / regular
  for v_i in 1 .. 5 loop
    foreach v_bool in array array[true, false] loop
      foreach v_txt in array array['early', 'regular'] loop
        v_n := public.camp_base_cents(v_ca, v_i, v_bool, v_txt);
        v_n2 := (pg_temp.grid(5) -> (v_i - 1) ->> (case when v_bool then 'member_' else 'nonmember_' end || v_txt || '_cents'))::integer;
        if v_n is distinct from v_n2 then
          raise exception 'TEST FAILED: T3a grid cell % days member % % is %, expected %', v_i, v_bool, v_txt, v_n, v_n2;
        end if;
      end loop;
    end loop;
  end loop;
  if public.camp_base_cents(v_ca, 6, true, 'early') is not null then
    raise exception 'TEST FAILED: T3a a 6-day row exists on a 5-day camp';
  end if;

  -- T3b. P1-P5 (early, camp A) and P6-P7 (regular, camp R) through the
  --      family form: the page's total must be what the database works out
  perform set_config('request.jwt.claims', '', true);
  v_key := v_tag || ' k-prices';
  v_r := pg_temp.st('T3b P1 Mia', pg_temp.su(v_ca_code, v_key, jsonb_build_array(
           pg_temp.ch('Mia', 'Rossi', 8, false, array[v_a_d[1], v_a_d[3]],
                      jsonb_build_array(pg_temp.ex(v_pick, array[v_a_d[1], v_a_d[3]])))), 16600), 'ok');
  v_mia := pg_temp.cmp(v_r ->> 'reference', 1);
  if (v_r ->> 'family_total_cents')::integer <> 16600 or (v_r -> 'children' -> 0 ->> 'price_kind') <> 'early'
     or (v_r -> 'children' -> 0 ->> 'base_cents')::integer <> 15000
     or (v_r -> 'children' -> 0 ->> 'day_count')::integer <> 2
     or (v_r -> 'children' -> 0 -> 'extras') <> '[{"name": "Late pick-up", "per": "day", "count": 2, "cents": 1600}]'::jsonb then
    raise exception 'TEST FAILED: T3b P1 answer %', v_r;
  end if;
  v_r := pg_temp.st('T3b P2 Ava', pg_temp.su(v_ca_code, v_key, jsonb_build_array(
           pg_temp.ch('Ava', 'Thompson', 9, true, v_a_d,
                      jsonb_build_array(pg_temp.ex(v_drop, v_a_d), pg_temp.ex(v_pick, v_a_d)))), 39000), 'ok');
  v_ava := pg_temp.cmp(v_r ->> 'reference', 1);
  v_r := pg_temp.st('T3b P3 Ethan', pg_temp.su(v_ca_code, v_key, jsonb_build_array(
           pg_temp.ch('Ethan', 'Park', 10, true, array[v_a_d[1], v_a_d[4], v_a_d[5]],
                      jsonb_build_array(pg_temp.ex(v_drop, array[v_a_d[1], v_a_d[4], v_a_d[5]]), pg_temp.ex(v_pizza, null)))), 24500), 'ok');
  v_ethan := pg_temp.cmp(v_r ->> 'reference', 1);
  v_r := pg_temp.st('T3b P4 Leo', pg_temp.su(v_ca_code, v_key, jsonb_build_array(
           pg_temp.ch('Leo', 'Kim', 7, true, v_a_d, jsonb_build_array(pg_temp.ex(v_drop, v_a_d)))), 35000), 'ok');
  v_leo := pg_temp.cmp(v_r ->> 'reference', 1);
  v_r := pg_temp.st('T3b P5 Noah', pg_temp.su(v_ca_code, v_key, jsonb_build_array(
           pg_temp.ch('Noah', 'Brown', 6, true, array[v_a_d[1], v_a_d[2], v_a_d[3]],
                      jsonb_build_array(pg_temp.ex(v_pick, array[v_a_d[1], v_a_d[2], v_a_d[3]])))), 21900), 'ok');
  v_noah := pg_temp.cmp(v_r ->> 'reference', 1);
  v_r := pg_temp.st('T3b P6 Liam', pg_temp.su(v_cr_code, v_key, jsonb_build_array(
           pg_temp.ch('Liam', 'Walsh', 11, true, pg_temp.dys(v_cr, array[1, 2, 3, 4, 5]), '[]'::jsonb)), 32500), 'ok');
  v_liam := pg_temp.cmp(v_r ->> 'reference', 1);
  if v_r -> 'children' -> 0 ->> 'price_kind' <> 'regular' then raise exception 'TEST FAILED: T3b P6 not regular: %', v_r; end if;
  v_r := pg_temp.st('T3b P7 Sofia', pg_temp.su(v_cr_code, v_key, jsonb_build_array(
           pg_temp.ch('Sofia', 'Diaz', 12, false, pg_temp.dys(v_cr, array[1, 2]), '[]'::jsonb)), 16000), 'ok');
  v_sofia := pg_temp.cmp(v_r ->> 'reference', 1);
  -- P8: all 5 days + the pizza party (not for all-days campers) -> invalid
  perform pg_temp.st('T3b P8 Ava + pizza', pg_temp.su(v_ca_code, v_key, jsonb_build_array(
           pg_temp.ch('Ava', 'Thompson', 9, true, v_a_d, jsonb_build_array(pg_temp.ex(v_pizza, null)))), 28000), 'invalid');
  -- the roster agrees with every total
  foreach v_txt in array array[v_mia || '=16600', v_ava || '=39000', v_ethan || '=24500', v_leo || '=35000',
                               v_noah || '=21900', v_liam || '=32500', v_sofia || '=16000'] loop
    v_r := pg_temp.ro(split_part(v_txt, '=', 1)::uuid);
    if (v_r ->> 'total_cents')::integer <> split_part(v_txt, '=', 2)::integer
       or (v_r ->> 'owes_cents')::integer <> split_part(v_txt, '=', 2)::integer
       or (v_r ->> 'paid_cents')::integer <> 0
       or public.camp_camper_total_cents(split_part(v_txt, '=', 1)::uuid) <> split_part(v_txt, '=', 2)::integer then
      raise exception 'TEST FAILED: T3b roster row % expected total %', v_r, split_part(v_txt, '=', 2);
    end if;
  end loop;

  -- T3c. P4: Mark paid records what is owed (35000); an admin edits it to
  --      33500 -> owes 1500
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := pg_temp.st('T3c P4 mark paid', public.camp_mark_paid(v_leo, pg_temp.cv(v_leo)), 'ok');
  if (v_r ->> 'amount_cents')::integer <> 35000 or v_r ->> 'method' <> 'cash' then
    raise exception 'TEST FAILED: T3c P4 mark paid answered %', v_r;
  end if;
  v_p1 := (v_r ->> 'payment_id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('T3c P4 edit payment', public.camp_edit_payment(v_p1, 'cash', 33500, v_today), 'ok');
  v_r := pg_temp.ro(v_leo);
  if (v_r ->> 'paid_cents')::integer <> 33500 or (v_r ->> 'owes_cents')::integer <> 1500 then
    raise exception 'TEST FAILED: T3c P4 expected paid 33500 owes 1500, got %', v_r;
  end if;

  -- T3c2. P9 overpaid: Ava Nine (all 5, drop-off + pick-up) pays 39000,
  --       then drops the drop-off -> total 31500, owes -7500 (the tag
  --       stays Paid; Camper detail says "Paid $75 more than the total")
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.st('T3c2 P9 sign-up', pg_temp.su(v_ca_code, v_key, jsonb_build_array(
           pg_temp.ch('Ava', 'Nine', 9, true, v_a_d,
                      jsonb_build_array(pg_temp.ex(v_drop, v_a_d), pg_temp.ex(v_pick, v_a_d)))), 39000), 'ok');
  v_ava9 := pg_temp.cmp(v_r ->> 'reference', 1);
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T3c2 P9 mark paid', public.camp_mark_paid(v_ava9, pg_temp.cv(v_ava9)), 'ok');
  v_r := pg_temp.st('T3c2 P9 drop the drop-off', pg_temp.ud(v_ava9, 'Ava', 'Nine', 9, true, v_a_d,
           jsonb_build_array(pg_temp.ex(v_pick, v_a_d)), '5085550100'), 'ok');
  if (v_r ->> 'total_cents')::integer <> 31500 or (v_r ->> 'owes_cents')::integer <> -7500
     or (pg_temp.ro(v_ava9) ->> 'paid_cents')::integer <> 39000
     or (pg_temp.ro(v_ava9) ->> 'owes_cents')::integer <> -7500 then
    raise exception 'TEST FAILED: T3c2 P9 expected total 31500 owes -7500, got %', v_r;
  end if;
  perform pg_temp.st('T3c2 P9 overpaid -> already paid', public.camp_mark_paid(v_ava9, pg_temp.cv(v_ava9)), 'already_paid');

  -- T3d. P10: early / regular by the sign-up DATE in Massachusetts: 11:59:59
  --      PM on Mon Apr 12 2027 is still early (7500), midnight is regular
  --      (8000) - New York is UTC-4 in April
  if public.testing_school_date('2027-04-13 03:59:59+00') <> date '2027-04-12'
     or public.testing_school_date('2027-04-13 04:00:00+00') <> date '2027-04-13'
     or public.camp_price_kind(public.testing_school_date('2027-04-13 03:59:59+00'), date '2027-04-12') <> 'early'
     or public.camp_price_kind(public.testing_school_date('2027-04-13 04:00:00+00'), date '2027-04-12') <> 'regular'
     or public.camp_base_cents(v_ca, 1, true, public.camp_price_kind(public.testing_school_date('2027-04-13 03:59:59+00'), date '2027-04-12')) <> 7500
     or public.camp_base_cents(v_ca, 1, true, public.camp_price_kind(public.testing_school_date('2027-04-13 04:00:00+00'), date '2027-04-12')) <> 8000 then
    raise exception 'TEST FAILED: T3d P10 early / regular at midnight (New York)';
  end if;

  -- T3e. a grid with a missing, an extra or a repeated row, or a bad price,
  --      is refused by Add camp (invalid) - and nothing is written
  perform set_config('request.jwt.claims', v_c_a1, true);
  select count(*) into v_n from public.camps;
  foreach v_j1 in array array[
      pg_temp.grid(1),                                                 -- missing row (2 days)
      pg_temp.grid(3),                                                 -- extra row
      jsonb_build_array(pg_temp.grid(1) -> 0, pg_temp.grid(1) -> 0),   -- day count 1 twice
      jsonb_set(pg_temp.grid(2), '{1,member_early_cents}', '7550'),    -- not whole dollars
      jsonb_set(pg_temp.grid(2), '{1,member_early_cents}', '75.5'),    -- not a whole number
      jsonb_set(pg_temp.grid(2), '{1,member_early_cents}', '"7500"'),  -- text
      jsonb_set(pg_temp.grid(2), '{1,member_early_cents}', '100100'),  -- over $1,000
      jsonb_set(pg_temp.grid(2), '{1,extra}', '1'),                    -- unknown key
      jsonb_set(pg_temp.grid(2), '{1,day_count}', '3'),                -- day count out of range
      '{"day_count": 1}'::jsonb, 'null'::jsonb] loop
    v_r := public.camp_add_camp('worcester', false, v_tag || ' bad grid', array[v_today + 40, v_today + 41], '09:00', '15:00',
                                v_today, v_today + 1, v_today, 5, 12, v_j1, '[]'::jsonb, null, 'W');
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T3e bad grid % answered %', v_j1, v_r;
    end if;
  end loop;
  if (select count(*) from public.camps) <> v_n then raise exception 'TEST FAILED: T3e a refused Add camp wrote a camp'; end if;
  -- and the other Add camp input rules
  foreach v_txt in array array[
      'days in the past', 'no days', '11 days', 'a day twice', 'closing after the last day', 'early after closing',
      'opens after closing', 'ages backwards', 'age 0', 'hours backwards', 'hours not on 5 minutes', 'unknown school',
      'empty waiver', 'long description', 'bad extras'] loop
    v_r := case v_txt
      when 'days in the past' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today - 1], '09:00', '15:00', v_today - 3, v_today - 1, v_today - 3, 5, 12, pg_temp.grid(1), '[]', null, 'W')
      when 'no days' then public.camp_add_camp('worcester', false, v_tag || ' x', '{}'::date[], '09:00', '15:00', v_today, v_today, v_today, 5, 12, '[]', '[]', null, 'W')
      when '11 days' then public.camp_add_camp('worcester', false, v_tag || ' x', array(select v_today + 40 + x from generate_series(0, 10) as x), '09:00', '15:00', v_today, v_today, v_today, 5, 12, pg_temp.grid(10), '[]', null, 'W')
      when 'a day twice' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40, v_today + 40], '09:00', '15:00', v_today, v_today, v_today, 5, 12, pg_temp.grid(2), '[]', null, 'W')
      when 'closing after the last day' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40], '09:00', '15:00', v_today, v_today + 41, v_today, 5, 12, pg_temp.grid(1), '[]', null, 'W')
      when 'early after closing' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40], '09:00', '15:00', v_today, v_today + 10, v_today + 11, 5, 12, pg_temp.grid(1), '[]', null, 'W')
      when 'opens after closing' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40], '09:00', '15:00', v_today + 11, v_today + 10, v_today, 5, 12, pg_temp.grid(1), '[]', null, 'W')
      when 'ages backwards' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40], '09:00', '15:00', v_today, v_today, v_today, 12, 5, pg_temp.grid(1), '[]', null, 'W')
      when 'age 0' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40], '09:00', '15:00', v_today, v_today, v_today, 0, 5, pg_temp.grid(1), '[]', null, 'W')
      when 'hours backwards' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40], '15:00', '09:00', v_today, v_today, v_today, 5, 12, pg_temp.grid(1), '[]', null, 'W')
      when 'hours not on 5 minutes' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40], '09:03', '15:00', v_today, v_today, v_today, 5, 12, pg_temp.grid(1), '[]', null, 'W')
      when 'unknown school' then public.camp_add_camp('nowhere', false, v_tag || ' x', array[v_today + 40], '09:00', '15:00', v_today, v_today, v_today, 5, 12, pg_temp.grid(1), '[]', null, 'W')
      when 'empty waiver' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40], '09:00', '15:00', v_today, v_today, v_today, 5, 12, pg_temp.grid(1), '[]', null, E'  \n ')
      when 'long description' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40], '09:00', '15:00', v_today, v_today, v_today, 5, 12, pg_temp.grid(1), '[]', repeat('a', 2001), 'W')
      when 'bad extras' then public.camp_add_camp('worcester', false, v_tag || ' x', array[v_today + 40], '09:00', '15:00', v_today, v_today, v_today, 5, 12, pg_temp.grid(1),
                                                  '[{"name": "A", "price_cents": 100, "per": "day", "not_for_all_days": false}, {"name": " a ", "price_cents": 100, "per": "day", "not_for_all_days": false}]', null, 'W')
    end;
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T3e Add camp with % answered %', v_txt, v_r;
    end if;
  end loop;

  -- ===================================================================
  -- T4. Extras
  -- ===================================================================
  -- T4a. the extras' order is their position in the list (0, 1, 2)
  if array(select e.name from public.camp_extras e where e.camp_id = v_ca order by e.sort)
     <> array['Early drop-off', 'Late pick-up', 'Pizza party']
     or array(select e.sort::integer from public.camp_extras e where e.camp_id = v_ca order by e.sort) <> array[0, 1, 2] then
    raise exception 'TEST FAILED: T4a extras order';
  end if;
  -- T4b. the extra rules on the form: a once extra with days, a per-day
  --      extra without days or on a day the child doesn't come -> invalid
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('T4b once extra with a day', pg_temp.su(v_ca_code, v_key, jsonb_build_array(
           pg_temp.ch('Zed', 'One', 8, true, array[v_a_d[1]], jsonb_build_array(pg_temp.ex(v_pizza, array[v_a_d[1]])))), 8000), 'invalid');
  perform pg_temp.st('T4b per-day extra without days', pg_temp.su(v_ca_code, v_key, jsonb_build_array(
           pg_temp.ch('Zed', 'One', 8, true, array[v_a_d[1]], jsonb_build_array(pg_temp.ex(v_drop, null)))), 7500), 'invalid');
  perform pg_temp.st('T4b per-day extra on another day', pg_temp.su(v_ca_code, v_key, jsonb_build_array(
           pg_temp.ch('Zed', 'One', 8, true, array[v_a_d[1]], jsonb_build_array(pg_temp.ex(v_drop, array[v_a_d[2]])))), 9000), 'invalid');
  -- T4c. the table rule refuses the same even written directly
  begin
    insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents) values (v_mia, v_pizza, v_a_d[1], 500);
    raise exception 'TEST FAILED: T4c a once extra with a day was written directly';
  exception when check_violation then null;
  end;
  begin
    insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents) values (v_mia, v_drop, v_a_d[2], 1500);
    raise exception 'TEST FAILED: T4c a per-day extra on a day the camper doesn''t come was written directly';
  exception when check_violation then null;
  end;
  begin
    insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents) values (v_ava, v_pizza, null, 500);
    raise exception 'TEST FAILED: T4c the pizza party was written directly for an all-days camper';
  exception when check_violation then null;
  end;
  begin
    insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents)
    values (v_liam, v_drop, pg_temp.dy(v_cr, 1), 1500);
    raise exception 'TEST FAILED: T4c an extra of another camp was written directly';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- T5. Snapshots, the re-price rule, Owes, overpaid
  -- ===================================================================
  -- T5a. an admin raises the 3-day member early price (195 -> 200) and the
  --      late pick-up (8 -> 10): nobody's total changes
  perform set_config('request.jwt.claims', v_c_a1, true);
  select c.version into v_v from public.camps c where c.id = v_ca;
  v_r := pg_temp.st('T5a edit prices', public.camp_update_camp(v_ca, v_v, 'worcester', true, v_tag || ' April', v_dates,
           '09:00', '15:00', v_today - 1, v_today + 20, v_today + 5, 5, 12,
           jsonb_set(pg_temp.grid(5), '{2,member_early_cents}', '20000'),
           jsonb_set(pg_temp.xtr_ids(v_ca), '{1,price_cents}', '1000'), 'Bring a lunch.', 'I agree to the camp rules.'), 'ok');
  if (v_r ->> 'version')::integer <> v_v + 1 or public.camp_base_cents(v_ca, 3, true, 'early') <> 20000
     or (select e.price_cents from public.camp_extras e where e.id = v_pick) <> 1000 then
    raise exception 'TEST FAILED: T5a the camp''s prices didn''t change: %', v_r;
  end if;
  foreach v_txt in array array[v_mia || '=16600', v_ava || '=39000', v_ethan || '=24500', v_noah || '=21900'] loop
    if public.camp_camper_total_cents(split_part(v_txt, '=', 1)::uuid) <> split_part(v_txt, '=', 2)::integer then
      raise exception 'TEST FAILED: T5a a price edit changed a camper''s total (%)', v_txt;
    end if;
  end loop;

  -- T5b. Edit details changing only names / age / family fields re-prices
  --      nothing (Mia keeps 16600 although pick-up now costs $10)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_v := pg_temp.cv(v_mia);
  v_r := pg_temp.st('T5b names only', pg_temp.ud(v_mia, 'Mia', 'Rossi-Lane', 9, false, array[v_a_d[3], v_a_d[1]],
           jsonb_build_array(pg_temp.ex(v_pick, array[v_a_d[3], v_a_d[1]])), '5085550199'), 'ok');
  if (v_r ->> 'total_cents')::integer <> 16600 or (v_r ->> 'owes_cents')::integer <> 16600
     or (v_r ->> 'camper_version')::integer <> v_v + 1
     or (select s.parent_phone from public.camp_signups s join public.camp_campers c on c.signup_id = s.id where c.id = v_mia) <> '5085550199'
     or (select x.price_cents from public.camp_camper_extras x where x.camper_id = v_mia limit 1) <> 800 then
    raise exception 'TEST FAILED: T5b a names / age / family edit re-priced: %', v_r;
  end if;

  -- T5c. a change to the days re-prices the WHOLE camper at today's prices
  --      with the sign-up's early price: Mia Mon+Wed+Thu, non-member early
  --      3 days $205 + pick-up Mon, Wed at $10 = $225
  v_r := pg_temp.st('T5c add a day', pg_temp.ud(v_mia, 'Mia', 'Rossi', 9, false, array[v_a_d[1], v_a_d[3], v_a_d[4]],
           jsonb_build_array(pg_temp.ex(v_pick, array[v_a_d[1], v_a_d[3]])), '5085550199'), 'ok');
  if (v_r ->> 'total_cents')::integer <> 22500 then raise exception 'TEST FAILED: T5c Mia re-priced to %, expected 22500', v_r; end if;
  -- the member box: Noah becomes a non-member -> 3 days non-member early
  -- $205 + pick-up x3 at $10 = $235
  v_r := pg_temp.st('T5c member box', pg_temp.ud(v_noah, 'Noah', 'Brown', 6, false, array[v_a_d[1], v_a_d[2], v_a_d[3]],
           jsonb_build_array(pg_temp.ex(v_pick, array[v_a_d[1], v_a_d[2], v_a_d[3]])), '5085550100'), 'ok');
  if (v_r ->> 'total_cents')::integer <> 23500 then raise exception 'TEST FAILED: T5c Noah re-priced to %, expected 23500', v_r; end if;
  -- the extras: Ethan adds Tue -> 4 days member early $260 + drop-off x3
  -- $45 + pizza $5 = $310
  v_r := pg_temp.st('T5c Ethan adds a day', pg_temp.ud(v_ethan, 'Ethan', 'Park', 10, true, array[v_a_d[1], v_a_d[2], v_a_d[4], v_a_d[5]],
           jsonb_build_array(pg_temp.ex(v_drop, array[v_a_d[1], v_a_d[4], v_a_d[5]]), pg_temp.ex(v_pizza, null)), '5085550100'), 'ok');
  if (v_r ->> 'total_cents')::integer <> 31000 then raise exception 'TEST FAILED: T5c Ethan re-priced to %, expected 31000', v_r; end if;
  -- all five days with the pizza party kept -> invalid; nothing changed
  v_v := pg_temp.cv(v_ethan);
  perform pg_temp.st('T5c all days + pizza', pg_temp.ud(v_ethan, 'Ethan', 'Park', 10, true, v_a_d,
           jsonb_build_array(pg_temp.ex(v_pizza, null)), '5085550100'), 'invalid');
  if pg_temp.cv(v_ethan) <> v_v or public.camp_camper_total_cents(v_ethan) <> 31000 then
    raise exception 'TEST FAILED: T5c a refused edit changed Ethan';
  end if;
  -- other refusals: a day of another camp, an extra of another camp, an
  -- unknown camper, an old version, age 0
  perform pg_temp.st('T5c a day of another camp', pg_temp.ud(v_ethan, 'Ethan', 'Park', 10, true, array[pg_temp.dy(v_cr, 1)], '[]', '5085550100'), 'invalid');
  perform pg_temp.st('T5c age 0', pg_temp.ud(v_ethan, 'Ethan', 'Park', 0, true, array[v_a_d[1]], '[]', '5085550100'), 'invalid');
  perform pg_temp.st('T5c bad phone', pg_temp.ud(v_ethan, 'Ethan', 'Park', 10, true, array[v_a_d[1]], '[]', '508555010'), 'invalid');
  perform pg_temp.st('T5c an extra of another camp', pg_temp.ud(v_ethan, 'Ethan', 'Park', 10, true, array[v_a_d[1]],
           jsonb_build_array(pg_temp.ex(pg_temp.xid(v_cr, 'Pizza party'), null)), '5085550100'), 'invalid');
  perform pg_temp.st('T5c old version', public.camp_update_details(v_ethan, v_v - 1, 1, 'Ethan', 'Park', 10, true, array[v_a_d[1]], '[]',
           'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt'), 'stale');
  perform pg_temp.st('T5c unknown camper', public.camp_update_details(v_rand, 1, 1, 'Ethan', 'Park', 10, true, array[v_a_d[1]], '[]',
           'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt'), 'not_found');

  -- T5d. Mark paid = what is owed; a double click (old version) -> stale;
  --      a second Mark paid -> already_paid; Change how they'll pay ->
  --      already_paid once paid
  v_v := pg_temp.cv(v_noah);
  v_r := pg_temp.st('T5d mark paid Noah', public.camp_mark_paid(v_noah, v_v), 'ok');
  if (v_r ->> 'amount_cents')::integer <> 23500 or (v_r ->> 'version')::integer <> v_v + 1 then
    raise exception 'TEST FAILED: T5d Mark paid answered %', v_r;
  end if;
  perform pg_temp.st('T5d double click', public.camp_mark_paid(v_noah, v_v), 'stale');
  perform pg_temp.st('T5d already paid', public.camp_mark_paid(v_noah, v_v + 1), 'already_paid');
  perform pg_temp.st('T5d change paying by once paid', public.camp_change_paying_by(v_noah, v_v + 1, 'card'), 'already_paid');
  v_r := pg_temp.st('T5d change paying by', public.camp_change_paying_by(v_sofia, pg_temp.cv(v_sofia), 'card'), 'ok');
  if (select c.paying_by from public.camp_campers c where c.id = v_sofia) <> 'card' then
    raise exception 'TEST FAILED: T5d paying by was not changed';
  end if;
  perform pg_temp.st('T5d bad paying by', public.camp_change_paying_by(v_sofia, pg_temp.cv(v_sofia), 'gold'), 'invalid');
  -- Leo owes 1500 (T3c): Mark paid $15 records exactly 1500
  v_r := pg_temp.st('T5d mark paid Leo $15', public.camp_mark_paid(v_leo, pg_temp.cv(v_leo)), 'ok');
  if (v_r ->> 'amount_cents')::integer <> 1500 or (pg_temp.ro(v_leo) ->> 'owes_cents')::integer <> 0 then
    raise exception 'TEST FAILED: T5d Leo''s $15 answered %', v_r;
  end if;

  -- T5f. a camper total over $2,000 -> invalid, on the form and in Edit
  --      details: camp X has a $1,000 day and two $1,000 extras
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('T5f camp X', public.camp_add_camp('shrewsbury', false, v_tag || ' Big', array[v_today + 30], '09:00', '15:00',
           v_today, v_today + 10, v_today + 10, 5, 12,
           '[{"day_count": 1, "member_early_cents": 100000, "member_regular_cents": 100000, "nonmember_early_cents": 100000, "nonmember_regular_cents": 100000}]',
           '[{"name": "Big A", "price_cents": 100000, "per": "once", "not_for_all_days": false},
             {"name": "Big B", "price_cents": 100000, "per": "once", "not_for_all_days": false}]', null, 'W'), 'ok');
  v_cx := (v_r ->> 'id')::uuid;  v_cx_code := v_r ->> 'public_code';
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('T5f form over $2,000', pg_temp.su(v_cx_code, v_key, jsonb_build_array(
           pg_temp.ch('Max', 'Big', 8, true, array[pg_temp.dy(v_cx, 1)],
                      jsonb_build_array(pg_temp.ex(pg_temp.xid(v_cx, 'Big A'), null), pg_temp.ex(pg_temp.xid(v_cx, 'Big B'), null)))), 300000), 'invalid');
  v_r := pg_temp.st('T5f form at exactly $2,000', pg_temp.su(v_cx_code, v_key, jsonb_build_array(
           pg_temp.ch('Max', 'Big', 8, true, array[pg_temp.dy(v_cx, 1)],
                      jsonb_build_array(pg_temp.ex(pg_temp.xid(v_cx, 'Big A'), null)))), 200000), 'ok');
  v_k1 := pg_temp.cmp(v_r ->> 'reference', 1);
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T5f edit over $2,000', pg_temp.ud(v_k1, 'Max', 'Big', 8, true, array[pg_temp.dy(v_cx, 1)],
           jsonb_build_array(pg_temp.ex(pg_temp.xid(v_cx, 'Big A'), null), pg_temp.ex(pg_temp.xid(v_cx, 'Big B'), null)), '5085550100'), 'invalid');

  -- ===================================================================
  -- T6. Dates in America/New_York (11:59:59 PM vs midnight), Close /
  --     Reopen, a walk-in sign-up on a camp day
  -- ===================================================================
  -- ny(day, time) = that moment on that day in Massachusetts
  execute $f$
    create function pg_temp.ny(p_day date, p_time time) returns timestamptz language sql as $b$
      select (p_day + p_time) at time zone 'America/New_York';
    $b$;
  $f$;
  -- T6a. camp A: opens today - 1, closes today + 20, last day today + 34,
  --      early until today + 5 (the state is checked for the school date
  --      of each moment)
  foreach v_txt in array array[
      'opens_on|23:59:59|-1|not_open_yet', 'opens_on|00:00:00|0|open',
      'closes_on|23:59:59|0|open', 'closes_on|00:00:00|1|closed',
      'last_day|23:59:59|0|closed', 'last_day|00:00:00|1|finished'] loop
    v_d := case split_part(v_txt, '|', 1)
             when 'opens_on'  then v_today - 1
             when 'closes_on' then v_today + 20
             else public.camp_last_day(v_ca) end + split_part(v_txt, '|', 3)::integer;
    v_ts := pg_temp.ny(v_d, split_part(v_txt, '|', 2)::time);
    if public.camp_signup_state(v_ca, public.testing_school_date(v_ts)) is distinct from split_part(v_txt, '|', 4) then
      raise exception 'TEST FAILED: T6a % at % (school date %) is %, expected %', split_part(v_txt, '|', 1), v_ts,
        public.testing_school_date(v_ts), public.camp_signup_state(v_ca, public.testing_school_date(v_ts)), split_part(v_txt, '|', 4);
    end if;
  end loop;
  -- the early price ends at the END of early_until
  if public.camp_price_kind(public.testing_school_date(pg_temp.ny(v_today + 5, '23:59:59')), v_today + 5) <> 'early'
     or public.camp_price_kind(public.testing_school_date(pg_temp.ny(v_today + 6, '00:00:00')), v_today + 5) <> 'regular' then
    raise exception 'TEST FAILED: T6a the early price at midnight';
  end if;
  -- November (UTC-5) and the minute itself
  if public.testing_school_date('2026-11-26 04:59:59+00') <> date '2026-11-25'
     or public.testing_school_date('2026-11-26 05:00:00+00') <> date '2026-11-26' then
    raise exception 'TEST FAILED: T6a school date in November';
  end if;

  -- T6b. Close / Reopen. Camp S: days in 3-4 days, closing date passed
  --      yesterday (closed by date)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_cs := pg_temp.mk(v_tag || ' Closed By Date', 'shrewsbury', false, array[v_today + 3, v_today + 4], v_today - 5, v_today - 1, v_today - 5);
  if public.camp_signup_state(v_cs, v_today) <> 'closed' then raise exception 'TEST FAILED: T6b camp S should be closed by date'; end if;
  v_r := public.camp_public_camp(pg_temp.code(v_cs));
  if v_r ->> 'state' <> 'closed' or (v_r ->> 'closed_on')::date <> v_today - 1 then
    raise exception 'TEST FAILED: T6b public answer closed by date %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select c.version into v_v from public.camps c where c.id = v_cs;
  perform pg_temp.st('T6b staff reopen after the closing date', public.camp_set_signup(v_cs, v_v, true), 'not_allowed');
  perform pg_temp.st('T6b old version', public.camp_set_signup(v_cs, v_v - 1, false), 'stale');
  v_r := pg_temp.st('T6b staff close', public.camp_set_signup(v_cs, v_v, false), 'ok');
  if (v_r ->> 'version')::integer <> v_v + 1 or v_r ->> 'state' <> 'closed'
     or not (select c.closed_by_hand from public.camps c where c.id = v_cs) then
    raise exception 'TEST FAILED: T6b close answered % (closed_by_hand must bump the version)', v_r;
  end if;
  v_r := public.camp_public_camp(pg_temp.code(v_cs));
  if v_r ->> 'state' <> 'closed' or v_r -> 'closed_on' <> 'null'::jsonb then
    raise exception 'TEST FAILED: T6b closed by hand must show no closing date: %', v_r;
  end if;
  v_r := pg_temp.st('T6b close again (nothing to do)', public.camp_set_signup(v_cs, v_v + 1, false), 'ok');
  if (v_r ->> 'version')::integer <> v_v + 1 then raise exception 'TEST FAILED: T6b closing twice bumped the version'; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('T6b admin reopen after the closing date', public.camp_set_signup(v_cs, v_v + 1, true), 'ok');
  if v_r ->> 'state' <> 'open'
     or (select c.signup_closes_on from public.camps c where c.id = v_cs) <> v_today + 4
     or (select c.closed_by_hand from public.camps c where c.id = v_cs) then
    raise exception 'TEST FAILED: T6b admin reopen must move the closing date to the last day: %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_v := (v_r ->> 'version')::integer;
  v_r := pg_temp.st('T6b staff close again', public.camp_set_signup(v_cs, v_v, false), 'ok');
  v_r := pg_temp.st('T6b staff reopen before the closing date', public.camp_set_signup(v_cs, (v_r ->> 'version')::integer, true), 'ok');
  if v_r ->> 'state' <> 'open' then raise exception 'TEST FAILED: T6b staff reopen answered %', v_r; end if;
  perform pg_temp.st('T6b unknown camp', public.camp_set_signup(v_rand, 1, true), 'not_found');
  perform pg_temp.st('T6b null switch', public.camp_set_signup(v_cs, 1, null), 'invalid');

  -- T6c. a finished camp (its only day was yesterday - moved there
  --      directly, as only a test can) can't be switched
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_co := pg_temp.mk(v_tag || ' Over', 'worcester', false, array[v_today + 1], v_today - 5, v_today - 2, v_today - 2);
  v_co_code := pg_temp.code(v_co);
  update public.camp_days set day = v_today - 1 where camp_id = v_co;
  select c.version into v_v from public.camps c where c.id = v_co;
  perform pg_temp.st('T6c switch a finished camp', public.camp_set_signup(v_co, v_v, true), 'finished');
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.st('T6c sign up for a finished camp', pg_temp.su(v_co_code, v_key, jsonb_build_array(
           pg_temp.ch('Fin', 'Ished', 8, true, array[pg_temp.dy(v_co, 1)], '[]'::jsonb)), 8000), 'finished');
  if public.camp_public_camp(v_co_code) ->> 'state' <> 'finished' then raise exception 'TEST FAILED: T6c public state not finished'; end if;

  -- ===================================================================
  -- T7. Check-in. Camp T has three days: yesterday, today, tomorrow (made
  --     for today .. +2, then each day moved back one directly)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_ct := pg_temp.mk(v_tag || ' Check In', 'worcester', false, array[v_today, v_today + 1, v_today + 2], v_today - 5, v_today, v_today - 5);
  v_ct_code := pg_temp.code(v_ct);
  for v_d in select d.day from public.camp_days d where d.camp_id = v_ct order by d.day loop
    update public.camp_days set day = v_d - 1 where camp_id = v_ct and day = v_d;
  end loop;
  -- T6d (walk-in on a camp day): sign-up is still open today (closing
  -- date today) - two children, regular prices: Tess all 3 days + drop-off
  -- today ($210 + $15), Tom today only ($80)
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.st('T6d walk-in sign-up on a camp day', pg_temp.su(v_ct_code, v_key, jsonb_build_array(
           pg_temp.ch('Tess', 'Gate', 8, true, pg_temp.dys(v_ct, array[1, 2, 3]),
                      jsonb_build_array(pg_temp.ex(pg_temp.xid(v_ct, 'Early drop-off'), array[pg_temp.dy(v_ct, 2)]))),
           pg_temp.ch('Tom', 'Gate', 6, true, array[pg_temp.dy(v_ct, 2)], '[]'::jsonb)), 22500 + 8000), 'ok');
  v_k1 := pg_temp.cmp(v_r ->> 'reference', 1);   -- Tess
  v_k2 := pg_temp.cmp(v_r ->> 'reference', 2);   -- Tom
  if v_r -> 'children' -> 0 ->> 'price_kind' <> 'regular' or jsonb_array_length(v_r -> 'children') <> 2
     or (v_r ->> 'family_total_cents')::integer <> 30500 or v_r ->> 'paying_by' <> 'cash' then
    raise exception 'TEST FAILED: T6d walk-in answer %', v_r;
  end if;

  -- T7a. staff: today ok (once, then "already"), yesterday not_allowed,
  --      tomorrow future_day; the camper's version never moves
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_v := pg_temp.cv(v_k1);
  select max(id) into v_mark from public.change_log;
  v_r := pg_temp.st('T7a staff today', public.camp_check_in(v_k1, pg_temp.dy(v_ct, 2)), 'ok');
  if (v_r ->> 'already')::boolean or v_r ->> 'checked_in_by_name' <> v_dn or v_r -> 'checked_in_at' = 'null'::jsonb then
    raise exception 'TEST FAILED: T7a check-in answered %', v_r;
  end if;
  perform pg_temp.t15(v_mark, 'camp_check_in', v_dn, 'check in');
  v_r := pg_temp.st('T7a staff today again', public.camp_check_in(v_k1, pg_temp.dy(v_ct, 2)), 'ok');
  if not (v_r ->> 'already')::boolean then raise exception 'TEST FAILED: T7a a second check-in must say already: %', v_r; end if;
  perform pg_temp.st('T7a staff yesterday', public.camp_check_in(v_k1, pg_temp.dy(v_ct, 1)), 'not_allowed');
  perform pg_temp.st('T7a staff tomorrow', public.camp_check_in(v_k1, pg_temp.dy(v_ct, 3)), 'future_day');
  perform pg_temp.st('T7a a day Tom did not pick', public.camp_check_in(v_k2, pg_temp.dy(v_ct, 1)), 'not_found');
  perform pg_temp.st('T7a a day of another camp', public.camp_check_in(v_k2, v_a_d[1]), 'not_found');
  perform pg_temp.st('T7a unknown camper', public.camp_check_in(v_rand, pg_temp.dy(v_ct, 2)), 'not_found');
  perform pg_temp.st('T7a no day', public.camp_check_in(v_k1, null), 'invalid');
  if pg_temp.cv(v_k1) <> v_v then raise exception 'TEST FAILED: T7a check-in bumped the camper''s version'; end if;
  v_r := pg_temp.ro(v_k1);
  if (select count(*) from jsonb_array_elements(v_r -> 'days') as x where x ->> 'checked_in_at' is not null) <> 1
     or (select x ->> 'checked_in_by_name' from jsonb_array_elements(v_r -> 'days') as x where (x ->> 'day_id')::uuid = pg_temp.dy(v_ct, 2)) <> v_dn then
    raise exception 'TEST FAILED: T7a the roster''s days don''t show the check-in: %', v_r -> 'days';
  end if;
  -- T7b. admins: yesterday ok, tomorrow still future_day
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('T7b admin yesterday', public.camp_check_in(v_k1, pg_temp.dy(v_ct, 1)), 'ok');
  perform pg_temp.st('T7b admin tomorrow', public.camp_check_in(v_k1, pg_temp.dy(v_ct, 3)), 'future_day');
  -- T7c. Undo check-in: same day rule; nothing to undo -> ok; logged
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T7c staff undo yesterday', public.camp_undo_check_in(v_k1, pg_temp.dy(v_ct, 1)), 'not_allowed');
  perform pg_temp.st('T7c staff undo tomorrow', public.camp_undo_check_in(v_k1, pg_temp.dy(v_ct, 3)), 'future_day');
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T7c staff undo today', public.camp_undo_check_in(v_k1, pg_temp.dy(v_ct, 2)), 'ok');
  perform pg_temp.t15(v_mark, 'camp_undo_check_in', v_dn, 'undo check in');
  if exists (select 1 from public.camp_camper_days cd
              where cd.camper_id = v_k1 and cd.day_id = pg_temp.dy(v_ct, 2)
                and (cd.checked_in_at is not null or cd.checked_in_by is not null or cd.checked_in_by_name is not null)) then
    raise exception 'TEST FAILED: T7c undo left check-in values';
  end if;
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T7c undo again (nothing to do)', public.camp_undo_check_in(v_k1, pg_temp.dy(v_ct, 2)), 'ok');
  if exists (select 1 from public.change_log l where l.id > v_mark) then raise exception 'TEST FAILED: T7c a no-op undo wrote history'; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('T7c admin undo yesterday', public.camp_undo_check_in(v_k1, pg_temp.dy(v_ct, 1)), 'ok');
  if pg_temp.cv(v_k1) <> v_v then raise exception 'TEST FAILED: T7c undo bumped the camper''s version'; end if;
  -- T7d. Edit details can't remove a day the camper was checked in on
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T7d check in again', public.camp_check_in(v_k1, pg_temp.dy(v_ct, 2)), 'ok');
  v_r := pg_temp.st('T7d remove a checked-in day', pg_temp.ud(v_k1, 'Tess', 'Gate', 8, true, pg_temp.dys(v_ct, array[1, 3]), '[]', '5085550100'),
                    'checked_in');
  if (v_r ->> 'day')::date <> v_today then raise exception 'TEST FAILED: T7d checked_in must name today: %', v_r; end if;
  -- removing another day keeps today's check-in (rows are diffed)
  v_r := pg_temp.st('T7d remove tomorrow', pg_temp.ud(v_k1, 'Tess', 'Gate', 8, true, pg_temp.dys(v_ct, array[1, 2]),
           jsonb_build_array(pg_temp.ex(pg_temp.xid(v_ct, 'Early drop-off'), array[pg_temp.dy(v_ct, 2)])), '5085550100'), 'ok');
  if not exists (select 1 from public.camp_camper_days cd
                  where cd.camper_id = v_k1 and cd.day_id = pg_temp.dy(v_ct, 2) and cd.checked_in_at is not null) then
    raise exception 'TEST FAILED: T7d Edit details lost a kept day''s check-in';
  end if;
  -- T7e. a withdrawn camper can't be checked in
  perform pg_temp.st('T7e withdraw Tom (staff)', public.camp_withdraw_camper(v_k2, pg_temp.cv(v_k2)), 'ok');
  perform pg_temp.st('T7e check in a withdrawn camper', public.camp_check_in(v_k2, pg_temp.dy(v_ct, 2)), 'withdrawn');
  perform pg_temp.st('T7e undo for a withdrawn camper', public.camp_undo_check_in(v_k2, pg_temp.dy(v_ct, 2)), 'withdrawn');
  perform pg_temp.st('T7e withdraw twice', public.camp_withdraw_camper(v_k2, pg_temp.cv(v_k2)), 'withdrawn');
  perform pg_temp.st('T7e Edit details of a withdrawn camper', pg_temp.ud(v_k2, 'Tom', 'Gate', 6, true, array[pg_temp.dy(v_ct, 2)], '[]', '5085550100'),
                     'withdrawn');
  perform pg_temp.st('T7e Mark paid for a withdrawn camper', public.camp_mark_paid(v_k2, pg_temp.cv(v_k2)), 'withdrawn');
  -- T14a: staff may Restore an ordinary withdrawal
  perform pg_temp.st('T7e staff restore an ordinary withdrawal', public.camp_restore_camper(v_k2, pg_temp.cv(v_k2)), 'ok');
  perform pg_temp.st('T7e restore an active camper', public.camp_restore_camper(v_k2, pg_temp.cv(v_k2)), 'invalid');
  -- T7f. the camper detail shows every day with its check-in, the phones
  --      and the price breakdown
  v_r := pg_temp.st('T7f camper detail', public.camp_camper_detail(v_k1), 'ok');
  if v_r -> 'family' ->> 'parent_phone' <> '5085550100' or v_r -> 'family' ->> 'emergency_relation' <> 'Aunt'
     or jsonb_array_length(v_r -> 'checkins') <> 2
     or (v_r -> 'checkins' -> 1 ->> 'checked_in_by_name') <> v_dn
     or (v_r -> 'breakdown' ->> 'day_count')::integer <> 2
     or (v_r -> 'breakdown' ->> 'price_kind') <> 'regular'
     or (v_r -> 'breakdown' -> 'extras' -> 0 ->> 'cents')::integer <> 1500
     or (v_r -> 'breakdown' -> 'extras' -> 0 -> 'days') <> to_jsonb(array[v_today])
     or (v_r -> 'camper' ->> 'id')::uuid <> v_k1 or v_r -> 'camper' ? 'signature' then
    raise exception 'TEST FAILED: T7f camper detail %', v_r;
  end if;
  perform pg_temp.st('T7f detail of an unknown camper', public.camp_camper_detail(v_rand), 'not_found');

  -- ===================================================================
  -- T8. Both-schools visibility: the two queries the app sends for one
  --     school (location_code = X, and both_schools = true), merged
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_cw := pg_temp.mk(v_tag || ' T8 Worcester', 'worcester', false, array[v_today + 50], v_today, v_today + 10, v_today);
  v_cn := pg_temp.mk(v_tag || ' T8 Shrewsbury', 'shrewsbury', false, array[v_today + 50], v_today, v_today + 10, v_today);
  v_cb := pg_temp.mk(v_tag || ' T8 Both', 'worcester', true, array[v_today + 50], v_today, v_today + 10, v_today);
  for v_i in 1 .. 2 loop
    set local role authenticated;
    perform set_config('request.jwt.claims', v_c_d1, true);
    foreach v_txt in array array['worcester', 'shrewsbury', 'all'] loop
      if v_txt = 'all' then
        v_ids := array(select c.id from public.camps c where c.name like v_tag || ' T8 %' order by c.id);
      else
        v_ids := array(select x.id from (select c.id from public.camps c where c.location_code = v_txt and c.name like v_tag || ' T8 %'
                                         union
                                         select c.id from public.camps c where c.both_schools and c.name like v_tag || ' T8 %') as x
                        order by x.id);
      end if;
      if v_ids is distinct from array(select x from unnest(case
               when v_txt = 'all' then array[v_cw, v_cn, v_cb]
               when v_txt = 'worcester' and v_i = 1 then array[v_cw, v_cb]
               when v_txt = 'shrewsbury' and v_i = 1 then array[v_cn, v_cb]
               when v_txt = 'worcester' then array[v_cw]
               else array[v_cn, v_cb] end) as x order by x) then
        raise exception 'TEST FAILED: T8 round % list % is %', v_i, v_txt, v_ids;
      end if;
    end loop;
    reset role;
    if v_i = 1 then
      -- an admin corrects the Both camp: held at Shrewsbury, Shrewsbury only
      perform set_config('request.jwt.claims', v_c_a1, true);
      select c.version into v_v from public.camps c where c.id = v_cb;
      v_txt := pg_temp.code(v_cb);
      perform pg_temp.st('T8 move the Both camp', public.camp_update_camp(v_cb, v_v, 'shrewsbury', false, v_tag || ' T8 Both',
               array[v_today + 50], '09:00', '15:00', v_today, v_today + 10, v_today, 5, 12, pg_temp.grid(1), pg_temp.xtr_ids(v_cb),
               'Bring a lunch.', 'I agree to the camp rules.'), 'ok');
      if pg_temp.code(v_cb) <> v_txt then raise exception 'TEST FAILED: T8 the link code changed'; end if;
    end if;
  end loop;
  -- the link code can never change, even written directly
  begin
    update public.camps set public_code = 'zzzzzzzz' where id = v_cb;
    raise exception 'TEST FAILED: T8 a camp''s link code was changed directly';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- T9. Payments: append-only; Undo / Edit payment rules
  -- ===================================================================
  -- T9a. never changed, never removed outside the two delete functions
  select p.id into v_p1 from public.camp_payments p where p.camper_id = v_noah and p.kind = 'payment' limit 1;
  begin
    update public.camp_payments set amount_cents = 1 where id = v_p1;
    raise exception 'TEST FAILED: T9a a payment was changed';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    delete from public.camp_payments where id = v_p1;
    raise exception 'TEST FAILED: T9a a payment was removed';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  v_n := 0;
  begin
    perform set_config('tkd.action', 'camp_delete_camper', true);
    delete from public.camp_payments where id = v_p1;
    get diagnostics v_n = row_count;
    raise exception 'zz undo this block';
  exception when raise_exception then
    if sqlerrm <> 'zz undo this block' then raise; end if;
  end;
  if v_n <> 1 or not exists (select 1 from public.camp_payments p where p.id = v_p1)
     or coalesce(current_setting('tkd.action', true), '') <> '' then
    raise exception 'TEST FAILED: T9a the delete-camper tag must allow a removal (and the block must undo it)';
  end if;
  begin
    insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, recorded_by_name, reverses_payment_id)
    values (v_noah, 'reversal', -1, 'cash', v_today, 'x', v_p1);
    raise exception 'TEST FAILED: T9a a reversal for the wrong amount was written';
  exception when check_violation then null;
  end;
  begin
    insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, recorded_by_name)
    values (v_noah, 'payment', 200001, 'cash', v_today, 'x');
    raise exception 'TEST FAILED: T9a a payment over $2,000 was written';
  exception when check_violation then null;
  end;
  begin
    truncate public.camp_payments;
    raise exception 'TEST FAILED: T9a camp_payments was truncated';
  exception when raise_exception then
    if sqlerrm not like '%truncated%' then raise; end if;
  end;

  -- T9b. Undo: the staff member's own payment within 10 seconds; older or
  --      someone else's -> admins only; twice / a reversal -> stale
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := pg_temp.st('T9b staff mark paid Sofia', public.camp_mark_paid(v_sofia, pg_temp.cv(v_sofia)), 'ok');
  v_p1 := (v_r ->> 'payment_id')::uuid;
  if (v_r ->> 'amount_cents')::integer <> 16000 or v_r ->> 'method' <> 'card' then
    raise exception 'TEST FAILED: T9b Mark paid Sofia answered %', v_r;
  end if;
  if (pg_temp.ro(v_sofia) ->> 'last_payment_id')::uuid <> v_p1 then raise exception 'TEST FAILED: T9b roster last_payment_id'; end if;
  v_v := pg_temp.cv(v_sofia);
  v_r := pg_temp.st('T9b staff undo own payment', public.camp_undo_payment(v_p1), 'ok');
  if (v_r ->> 'version')::integer <> v_v + 1 or (pg_temp.ro(v_sofia) ->> 'owes_cents')::integer <> 16000
     or pg_temp.ro(v_sofia) -> 'last_payment_id' <> 'null'::jsonb then
    raise exception 'TEST FAILED: T9b after undo %', pg_temp.ro(v_sofia);
  end if;
  perform pg_temp.st('T9b undo twice', public.camp_undo_payment(v_p1), 'stale');
  select p.id into v_p2 from public.camp_payments p where p.reverses_payment_id = v_p1;
  perform pg_temp.st('T9b undo a reversal', public.camp_undo_payment(v_p2), 'stale');
  -- an older payment by the desk (written directly, 11 seconds ago)
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
  values (v_sofia, 'payment', 16000, 'cash', v_today, now() - interval '11 seconds', v_desk, v_dn)
  returning id into v_p3;
  perform pg_temp.st('T9b staff undo after 10 seconds', public.camp_undo_payment(v_p3), 'not_allowed');
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('T9b admin mark paid... already paid', public.camp_mark_paid(v_sofia, pg_temp.cv(v_sofia)), 'already_paid');
  perform pg_temp.st('T9b admin undo', public.camp_undo_payment(v_p3), 'ok');
  v_r := pg_temp.st('T9b admin mark paid', public.camp_mark_paid(v_sofia, pg_temp.cv(v_sofia)), 'ok');
  v_p3 := (v_r ->> 'payment_id')::uuid;
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T9b staff undo the admin''s payment', public.camp_undo_payment(v_p3), 'not_allowed');
  perform pg_temp.st('T9b undo unknown', public.camp_undo_payment(v_rand), 'not_found');
  -- T9c. Edit payment: admins only; reversal + new payment; rules
  perform pg_temp.st('T9c staff edit payment', public.camp_edit_payment(v_p3, 'check', 15000, v_today), 'not_allowed');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('T9c amount 0', public.camp_edit_payment(v_p3, 'check', 0, v_today), 'invalid');
  perform pg_temp.st('T9c amount over $2,000', public.camp_edit_payment(v_p3, 'check', 200001, v_today), 'invalid');
  perform pg_temp.st('T9c a future date', public.camp_edit_payment(v_p3, 'check', 15000, v_today + 1), 'invalid');
  perform pg_temp.st('T9c bad method', public.camp_edit_payment(v_p3, 'gold', 15000, v_today), 'invalid');
  perform pg_temp.st('T9c unknown payment', public.camp_edit_payment(v_rand, 'check', 15000, v_today), 'not_found');
  perform pg_temp.st('T9c edit a reversal', public.camp_edit_payment(v_p2, 'check', 15000, v_today), 'invalid');
  v_r := pg_temp.st('T9c edit', public.camp_edit_payment(v_p3, 'check', 15000, v_today - 1), 'ok');
  if not exists (select 1 from public.camp_payments p where p.reverses_payment_id = v_p3 and p.amount_cents = -16000)
     or not exists (select 1 from public.camp_payments p where p.id = (v_r ->> 'payment_id')::uuid
                     and p.amount_cents = 15000 and p.method = 'check' and p.paid_on = v_today - 1)
     or (pg_temp.ro(v_sofia) ->> 'owes_cents')::integer <> 1000
     or (pg_temp.ro(v_sofia) ->> 'last_payment_id')::uuid <> (v_r ->> 'payment_id')::uuid
     or pg_temp.ro(v_sofia) ->> 'paid_method' <> 'check' then
    raise exception 'TEST FAILED: T9c Edit payment didn''t write a reversal + a new payment: %', pg_temp.ro(v_sofia);
  end if;
  perform pg_temp.st('T9c edit an already reversed payment', public.camp_edit_payment(v_p3, 'cash', 100, v_today), 'stale');

  -- ===================================================================
  -- T10. Removing days / extras in Edit camp; removing a whole camp
  -- ===================================================================
  -- Camp K: today, +1, +2; one family: K1 (days 1-2, drop-off both,
  -- pizza) $140 + $30 + $5 = $175; K2 (days 1-3, drop-off day 3, pick-up
  -- day 1) $195 + $15 + $8 = $218
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_ck := pg_temp.mk(v_tag || ' Kill', 'worcester', false, array[v_today, v_today + 1, v_today + 2], v_today - 1, v_today, v_today);
  v_ck_code := pg_temp.code(v_ck);
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.st('T10 sign-up', pg_temp.su(v_ck_code, v_key, jsonb_build_array(
           pg_temp.ch('Kay', 'One', 8, true, pg_temp.dys(v_ck, array[1, 2]),
                      jsonb_build_array(pg_temp.ex(pg_temp.xid(v_ck, 'Early drop-off'), pg_temp.dys(v_ck, array[1, 2])),
                                        pg_temp.ex(pg_temp.xid(v_ck, 'Pizza party'), null))),
           pg_temp.ch('Kay', 'Two', 9, true, pg_temp.dys(v_ck, array[1, 2, 3]),
                      jsonb_build_array(pg_temp.ex(pg_temp.xid(v_ck, 'Early drop-off'), pg_temp.dys(v_ck, array[3])),
                                        pg_temp.ex(pg_temp.xid(v_ck, 'Late pick-up'), pg_temp.dys(v_ck, array[1]))))), 17500 + 21800), 'ok');
  v_k1 := pg_temp.cmp(v_r ->> 'reference', 1);
  v_k2 := pg_temp.cmp(v_r ->> 'reference', 2);
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T10 check in K1', public.camp_check_in(v_k1, pg_temp.dy(v_ck, 1)), 'ok');
  v_r := pg_temp.st('T10 pay K1', public.camp_mark_paid(v_k1, pg_temp.cv(v_k1)), 'ok');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('T10 undo K1', public.camp_undo_payment((v_r ->> 'payment_id')::uuid), 'ok');
  perform pg_temp.st('T10 pay K1 again', public.camp_mark_paid(v_k1, pg_temp.cv(v_k1)), 'ok');
  perform pg_temp.st('T10 pay K2', public.camp_mark_paid(v_k2, pg_temp.cv(v_k2)), 'ok');

  -- T10a. removing a day an ACTIVE camper picked -> not_empty (names one,
  --       counts the others); nothing changes
  select c.version into v_v from public.camps c where c.id = v_ck;
  v_r := pg_temp.st('T10a remove day 3', public.camp_update_camp(v_ck, v_v, 'worcester', false, v_tag || ' Kill',
           array[v_today, v_today + 1], '09:00', '15:00', v_today - 1, v_today, v_today, 5, 12, pg_temp.grid(2), pg_temp.xtr_ids(v_ck),
           'Bring a lunch.', 'I agree to the camp rules.'), 'not_empty');
  if v_r ->> 'kind' <> 'day' or (v_r ->> 'day')::date <> v_today + 2 or v_r ->> 'first_name' <> 'Kay' or v_r ->> 'last_name' <> 'Two'
     or (v_r ->> 'more')::integer <> 0 then
    raise exception 'TEST FAILED: T10a not_empty answer %', v_r;
  end if;
  v_r := pg_temp.st('T10a remove day 1', public.camp_update_camp(v_ck, v_v, 'worcester', false, v_tag || ' Kill',
           array[v_today + 1, v_today + 2], '09:00', '15:00', v_today - 1, v_today, v_today, 5, 12, pg_temp.grid(2), pg_temp.xtr_ids(v_ck),
           'Bring a lunch.', 'I agree to the camp rules.'), 'not_empty');
  if v_r ->> 'last_name' <> 'One' or (v_r ->> 'more')::integer <> 1 then raise exception 'TEST FAILED: T10a not_empty "and 1 more": %', v_r; end if;
  v_r := pg_temp.st('T10a remove the pizza party', public.camp_update_camp(v_ck, v_v, 'worcester', false, v_tag || ' Kill',
           array[v_today, v_today + 1, v_today + 2], '09:00', '15:00', v_today - 1, v_today, v_today, 5, 12, pg_temp.grid(3),
           (select jsonb_agg(x) from jsonb_array_elements(pg_temp.xtr_ids(v_ck)) as x where x ->> 'name' <> 'Pizza party'),
           'Bring a lunch.', 'I agree to the camp rules.'), 'not_empty');
  if v_r ->> 'kind' <> 'extra' or v_r ->> 'extra_name' <> 'Pizza party' or (v_r ->> 'count')::integer <> 1 then
    raise exception 'TEST FAILED: T10a not_empty extra answer %', v_r;
  end if;
  if (select c.version from public.camps c where c.id = v_ck) <> v_v then raise exception 'TEST FAILED: T10a a refused edit changed the camp'; end if;

  -- T10b. withdraw K2: day 3 and the late pick-up were picked only by K2
  --       now -> removed, with K2's rows for them (logged); K2 stays in
  --       Removed with its other days
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T10b withdraw K2', public.camp_withdraw_camper(v_k2, pg_temp.cv(v_k2)), 'ok');
  perform set_config('request.jwt.claims', v_c_a1, true);
  select max(id) into v_mark from public.change_log;
  v_r := pg_temp.st('T10b remove day 3 and the pick-up', public.camp_update_camp(v_ck, v_v, 'worcester', false, v_tag || ' Kill',
           array[v_today, v_today + 1], '09:00', '15:00', v_today - 1, v_today, v_today, 5, 12, pg_temp.grid(2),
           (select jsonb_agg(x) from jsonb_array_elements(pg_temp.xtr_ids(v_ck)) as x where x ->> 'name' <> 'Late pick-up'),
           'Bring a lunch.', 'I agree to the camp rules.'), 'ok');
  if (v_r ->> 'version')::integer <> v_v + 1
     or public.camp_day_count(v_ck) <> 2
     or (select count(*) from public.camp_prices p where p.camp_id = v_ck) <> 2
     or exists (select 1 from public.camp_extras e where e.camp_id = v_ck and e.name = 'Late pick-up')
     or (select count(*) from public.camp_camper_days cd where cd.camper_id = v_k2) <> 2
     or exists (select 1 from public.camp_camper_extras x where x.camper_id = v_k2)
     or (select c.status from public.camp_campers c where c.id = v_k2) <> 'withdrawn' then
    raise exception 'TEST FAILED: T10b removing a day / extra only withdrawn campers picked: %', v_r;
  end if;
  perform pg_temp.t15(v_mark, 'camp_update_camp', v_an, 'update camp');
  if (select count(*) from public.change_log l
       where l.id > v_mark and l.op = 'delete' and l.table_name in ('camp_camper_days', 'camp_camper_extras', 'camp_days', 'camp_extras', 'camp_prices'))
     <> 1 + 2 + 1 + 1 + 1 then
    raise exception 'TEST FAILED: T10b expected 6 logged removals (1 day row, 2 extra rows, the day, the extra, a grid row)';
  end if;
  v_v := (v_r ->> 'version')::integer;

  -- T10c. Delete camp: the dialog's numbers must match (ALL campers,
  --       withdrawn too; NET payments); then everything goes, logged
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T10c staff delete camp', public.camp_delete_camp(v_ck, v_v, 2, 39300), 'not_allowed');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('T10c wrong camper count', public.camp_delete_camp(v_ck, v_v, 1, 39300), 'stale');
  perform pg_temp.st('T10c wrong payment total', public.camp_delete_camp(v_ck, v_v, 2, 56800), 'stale');
  perform pg_temp.st('T10c old version', public.camp_delete_camp(v_ck, v_v - 1, 2, 39300), 'stale');
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T10c delete camp', public.camp_delete_camp(v_ck, v_v, 2, 39300), 'ok');
  if exists (select 1 from public.camps c where c.id = v_ck)
     or exists (select 1 from public.camp_days d where d.camp_id = v_ck)
     or exists (select 1 from public.camp_prices p where p.camp_id = v_ck)
     or exists (select 1 from public.camp_extras e where e.camp_id = v_ck)
     or exists (select 1 from public.camp_signups s where s.camp_id = v_ck)
     or exists (select 1 from public.camp_campers c where c.id in (v_k1, v_k2))
     or exists (select 1 from public.camp_camper_days cd where cd.camper_id in (v_k1, v_k2))
     or exists (select 1 from public.camp_camper_extras x where x.camper_id in (v_k1, v_k2))
     or exists (select 1 from public.camp_payments p where p.camper_id in (v_k1, v_k2)) then
    raise exception 'TEST FAILED: T10c rows of the removed camp are left';
  end if;
  perform pg_temp.t15(v_mark, 'camp_delete_camp', v_an, 'delete camp');
  select string_agg(t.n || '=' || coalesce(x.cnt, 0), ', ') into v_txt
    from unnest(array['camps=1', 'camp_days=2', 'camp_prices=2', 'camp_extras=2', 'camp_signups=1', 'camp_campers=2',
                      'camp_camper_days=4', 'camp_camper_extras=3', 'camp_payments=4']) as w(s)
    cross join lateral (select split_part(w.s, '=', 1) as n, split_part(w.s, '=', 2)::integer as want) as t
    left join lateral (select count(*)::integer as cnt from public.change_log l
                        where l.id > v_mark and l.op = 'delete' and l.table_name = t.n) as x on true
   where coalesce(x.cnt, 0) <> t.want;
  if v_txt is not null then raise exception 'TEST FAILED: T10c logged removals per table differ: %', v_txt; end if;
  perform pg_temp.st('T10c delete again', public.camp_delete_camp(v_ck, v_v, 2, 39300), 'not_found');

  -- ===================================================================
  -- T11. The family form (camp_public_camp / camp_public_signup)
  -- ===================================================================
  -- Camp P: two days 10-11 days from now, open, early price, ages 5-12.
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_cp := pg_temp.mk(v_tag || ' Public', 'shrewsbury', false, array[v_today + 10, v_today + 11], v_today - 1, v_today + 5, v_today + 5);
  v_cp_code := pg_temp.code(v_cp);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n2 from public.testing_public_attempts;   -- Camps must never write here

  -- T11a. what the page gets first: exactly the contract's keys, nothing
  --       about campers; badly formed / unknown codes -> not_found
  v_r := public.camp_public_camp(v_cp_code);
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k)
       <> array['ack_version', 'camp', 'closed_on', 'opens_on', 'price_kind_today', 'state', 'status', 'waiver_version']
     or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'camp') as k)
       <> array['address', 'both_schools', 'days', 'description', 'early_until', 'end_time', 'extras', 'max_age', 'min_age',
                'name', 'prices', 'school_name', 'signup_closes_on', 'start_time', 'waiver_text']
     or v_r ->> 'state' <> 'open' or v_r -> 'closed_on' <> 'null'::jsonb or v_r ->> 'price_kind_today' <> 'early'
     or v_r ->> 'ack_version' <> v_ack
     or v_r ->> 'waiver_version' <> md5('I agree to the camp rules.')
     or v_r -> 'camp' ->> 'start_time' <> '09:00' or v_r -> 'camp' ->> 'end_time' <> '15:00'
     or jsonb_array_length(v_r -> 'camp' -> 'days') <> 2 or jsonb_array_length(v_r -> 'camp' -> 'prices') <> 2
     or (v_r -> 'camp' -> 'extras' -> 2 ->> 'not_for_all_days')::boolean is not true
     or (v_r -> 'camp' ->> 'min_age')::integer <> 5 or (v_r -> 'camp' ->> 'max_age')::integer <> 12
     or v_r::text like '%camper%' or v_r::text like '%public_code%' then
    raise exception 'TEST FAILED: T11a camp_public_camp answer %', v_r;
  end if;
  foreach v_txt in array array['ABCDEFGH', 'abcdefg', 'abcdefghj', 'abcdefgl', '', 'zz test'] loop
    if public.camp_public_camp(v_txt) is distinct from '{"status": "not_found"}'::jsonb then
      raise exception 'TEST FAILED: T11a code % should be not_found', v_txt;
    end if;
  end loop;
  if public.camp_public_camp(null) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: T11a a null code should be not_found';
  end if;

  -- T11b. the same submission id twice = one sign-up, the same answer;
  --       the same id for another camp -> invalid
  v_key := v_tag || ' k-public';
  v_sub := gen_random_uuid();
  v_j1 := jsonb_build_array(pg_temp.ch('Pia', 'Form', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb));
  v_r := pg_temp.st('T11b first send', public.camp_public_signup(v_cp_code, v_key, v_sub, v_j1, 'Pat Parent', '5085550100', 'Mother',
           'Sam Contact', '5085550101', 'Aunt', 'check', true, v_sig, v_ack, md5('I agree to the camp rules.'), 7500), 'ok');
  v_r2 := pg_temp.st('T11b second send', public.camp_public_signup(v_cp_code, v_key, v_sub, v_j1, 'Pat Parent', '5085550100', 'Mother',
           'Sam Contact', '5085550101', 'Aunt', 'check', true, v_sig, v_ack, md5('I agree to the camp rules.'), 7500), 'ok');
  if v_r <> v_r2 or (select count(*) from public.camp_signups s where s.submission_id = v_sub) <> 1 then
    raise exception 'TEST FAILED: T11b a retry made a second sign-up or another answer: % / %', v_r, v_r2;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) as k)
       <> array['camp', 'children', 'family_total_cents', 'paying_by', 'reference', 'status']
     or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'children' -> 0) as k)
       <> array['base_cents', 'day_count', 'days', 'extras', 'first_name', 'last_name', 'price_kind', 'total_cents']
     or (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'camp') as k)
       <> array['address', 'both_schools', 'days', 'description', 'end_time', 'name', 'school_name', 'start_time']
     or v_r ->> 'reference' !~ '^CP-[0-9]{4,}$' or v_r ->> 'paying_by' <> 'check' then
    raise exception 'TEST FAILED: T11b ok answer shape %', v_r;
  end if;
  v_ref := v_r ->> 'reference';
  if not exists (select 1 from public.camp_signups s
                  where s.reference = v_ref and s.signed_up_on = v_today and s.price_kind = 'early'
                    and s.waiver_text_signed = 'I agree to the camp rules.' and s.signature = v_sig
                    and s.ack_version = v_ack and s.created_by_name = 'Family form'
                    and s.parent_name = 'Pat Parent' and s.emergency_phone = '5085550101') then
    raise exception 'TEST FAILED: T11b the stored sign-up is wrong';
  end if;
  perform pg_temp.st('T11b same submission id, another camp', public.camp_public_signup(v_ca_code, v_key, v_sub, v_j1, 'Pat Parent',
           '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'check', true, v_sig, v_ack,
           md5('I agree to the camp rules.'), 7500), 'invalid');
  -- the history of a family sign-up: action camp_public_signup, "Family
  -- form", one batch; signature "on file", no submission id, no waiver copy
  select max(id) into v_mark from public.change_log;
  v_r := pg_temp.st('T11b a logged sign-up', pg_temp.su(v_cp_code, v_key, jsonb_build_array(
           pg_temp.ch('Lou', 'Logged', 8, false, array[pg_temp.dy(v_cp, 2)], '[]'::jsonb)), 8500), 'ok');
  perform pg_temp.t15(v_mark, 'camp_public_signup', 'Family form', 'family sign-up');
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.table_name = 'camp_signups' and l.op = 'insert'
                    and l.after ->> 'signature' = 'on file'
                    and not (l.after ? 'submission_id') and not (l.after ? 'waiver_text_signed')
                    and l.after ->> 'parent_phone' = '5085550100') then
    raise exception 'TEST FAILED: T11b the sign-up''s history row must show "on file", phones, and no submission id / waiver copy';
  end if;
  if exists (select 1 from public.change_log l where l.id > v_mark and l.actor_id is not null) then
    raise exception 'TEST FAILED: T11b a family sign-up was logged with a login';
  end if;
  -- a login token set by the caller is forgotten (never a staff member's)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('T11b with a staff token set', pg_temp.su(v_cp_code, v_key, jsonb_build_array(
           pg_temp.ch('Tok', 'En', 8, false, array[pg_temp.dy(v_cp, 2)], '[]'::jsonb)), 8500), 'ok');
  if (select c.created_by_name from public.camp_campers c where c.id = pg_temp.cmp(v_r ->> 'reference', 1)) <> 'Family form'
     or (select c.created_by from public.camp_campers c where c.id = pg_temp.cmp(v_r ->> 'reference', 1)) is not null then
    raise exception 'TEST FAILED: T11b a sign-up with a staff token was not "Family form"';
  end if;

  -- T11c. the states: not open yet (+ opens_on), closed by date (+ the
  --       date), closed by hand (no date), finished (T6c)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_cn := pg_temp.mk(v_tag || ' Not Yet', 'worcester', false, array[v_today + 20], v_today + 3, v_today + 10, v_today + 3);
  v_cn_code := pg_temp.code(v_cn);
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.st('T11c not open yet', pg_temp.su(v_cn_code, v_key, jsonb_build_array(
           pg_temp.ch('Nat', 'Yet', 8, false, array[pg_temp.dy(v_cn, 1)], '[]'::jsonb)), 8500), 'not_open');
  if (v_r ->> 'opens_on')::date <> v_today + 3 or public.camp_public_camp(v_cn_code) ->> 'state' <> 'not_open_yet' then
    raise exception 'TEST FAILED: T11c not_open answer %', v_r;
  end if;
  v_r := pg_temp.st('T11c camp S (reopened in T6b) takes sign-ups', pg_temp.su(pg_temp.code(v_cs), v_key, jsonb_build_array(
           pg_temp.ch('Cal', 'Closed', 8, false, array[pg_temp.dy(v_cs, 1)], '[]'::jsonb)), 9000), 'ok');
  -- (camp S was reopened by the admin in T6b; close it by hand now)
  perform set_config('request.jwt.claims', v_c_d1, true);
  select c.version into v_v from public.camps c where c.id = v_cs;
  perform pg_temp.st('T11c close S by hand', public.camp_set_signup(v_cs, v_v, false), 'ok');
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.st('T11c closed by hand', pg_temp.su(pg_temp.code(v_cs), v_key, jsonb_build_array(
           pg_temp.ch('Cal', 'Closed', 8, false, array[pg_temp.dy(v_cs, 1)], '[]'::jsonb)), 9000), 'closed');
  if v_r -> 'closed_on' <> 'null'::jsonb then raise exception 'TEST FAILED: T11c closed by hand must have closed_on null: %', v_r; end if;
  -- a camp closed by date (made with its closing date yesterday)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_cc := pg_temp.mk(v_tag || ' Closed', 'worcester', false, array[v_today + 20], v_today - 5, v_today - 1, v_today - 5);
  v_cc_code := pg_temp.code(v_cc);
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.st('T11c closed by date', pg_temp.su(v_cc_code, v_key, jsonb_build_array(
           pg_temp.ch('Cal', 'Date', 8, false, array[pg_temp.dy(v_cc, 1)], '[]'::jsonb)), 9000), 'closed');
  if (v_r ->> 'closed_on')::date <> v_today - 1 then raise exception 'TEST FAILED: T11c closed_on %', v_r; end if;
  perform pg_temp.st('T11c unknown code', pg_temp.su('zzzzzzzz', v_key, v_j1, 7500), 'not_found');
  perform pg_temp.st('T11c badly formed code', pg_temp.su('ZZZZZZZZ', v_key, v_j1, 7500), 'not_found');

  -- T11d. every other refusal -> invalid (a fresh client key, so the
  --       rate limit isn't reached here)
  v_key := v_tag || ' k-refusals';
  v_j1 := jsonb_build_array(pg_temp.ch('Ivy', 'Bad', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb));
  for v_i in 1 .. 21 loop
    v_r := case v_i
      when 1 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '508555010', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, v_ack, md5('I agree to the camp rules.'), 7500)
      when 2 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '(508) 555-0101', 'Aunt', 'cash', true, v_sig, v_ack, md5('I agree to the camp rules.'), 7500)
      when 3 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', repeat('m', 41), 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, v_ack, md5('I agree to the camp rules.'), 7500)
      when 4 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, ' ', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, v_ack, md5('I agree to the camp rules.'), 7500)
      when 5 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'gold', true, v_sig, v_ack, md5('I agree to the camp rules.'), 7500)
      when 6 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', false, v_sig, v_ack, md5('I agree to the camp rules.'), 7500)
      when 7 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', null, v_sig, v_ack, md5('I agree to the camp rules.'), 7500)
      when 8 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig_gif, v_ack, md5('I agree to the camp rules.'), 7500)
      when 9 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig_long, v_ack, md5('I agree to the camp rules.'), 7500)
      when 10 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, 'data:image/png;base64,abc$def', v_ack, md5('I agree to the camp rules.'), 7500)
      when 11 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, null, v_ack, md5('I agree to the camp rules.'), 7500)
      when 12 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, 'cb-2026-10-17', md5('I agree to the camp rules.'), 7500)
      when 13 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, v_ack, 'not-a-hash', 7500)
      when 14 then public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, v_ack, md5('I agree to the camp rules.'), null)
      when 15 then public.camp_public_signup(v_cp_code, '', gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, v_ack, md5('I agree to the camp rules.'), 7500)
      when 16 then public.camp_public_signup(v_cp_code, repeat('k', 201), gen_random_uuid(), v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, v_ack, md5('I agree to the camp rules.'), 7500)
      when 17 then public.camp_public_signup(v_cp_code, v_key, null, v_j1, 'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, v_ack, md5('I agree to the camp rules.'), 7500)
      when 18 then pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch(' ', 'Bad', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 7500)
      when 19 then pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch('Ivy', repeat('b', 61), 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 7500)
      when 20 then pg_temp.su(v_cp_code, v_key, jsonb_build_array(
                     pg_temp.ch('A', 'One', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb), pg_temp.ch('B', 'Two', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb),
                     pg_temp.ch('C', 'Three', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb), pg_temp.ch('D', 'Four', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 30000)
      else pg_temp.su(v_cp_code, v_key, '[]'::jsonb, 0)
    end;
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T11d refusal case % answered %', v_i, v_r;
    end if;
  end loop;
  -- the biggest signature allowed (70 000 characters) is fine
  perform pg_temp.st('T11d a 70 000-character signature', public.camp_public_signup(v_cp_code, v_tag || ' k-sig', gen_random_uuid(),
           jsonb_build_array(pg_temp.ch('Sig', 'Max', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)),
           'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig_max, v_ack,
           md5('I agree to the camp rules.'), 7500), 'ok');

  -- T11e. bad jsonb: each refused (invalid) AND counted (one attempt row,
  --       outcome invalid), nothing written
  v_j1 := pg_temp.ch('Jay', 'Son', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb);
  v_key := v_tag || ' k-jsonb';
  select count(*) into v_n from public.camp_signups;
  v_list := array[
    jsonb_build_array(jsonb_set(v_j1, '{day_ids}', '["not-a-uuid"]'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{day_ids}', jsonb_build_array(left(pg_temp.dy(v_cp, 1)::text, 35))))::text,
    jsonb_build_array(jsonb_set(v_j1, '{age}', '9.5'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{age}', '1e9'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{age}', '"9"'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{age}', '-1'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{member}', '"yes"'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{first_name}', '7'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{day_ids}', '"abc"'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{day_ids}', '{}'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{day_ids}', '[]'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{extras}', '{}'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{extras}', '[{"extra_id": "x", "day_ids": []}]'))::text,
    jsonb_build_array(jsonb_set(v_j1, '{extras}', jsonb_build_array(jsonb_build_object('extra_id', v_rand, 'day_ids', '[]'::jsonb, 'more', 1))))::text,
    jsonb_build_array(jsonb_set(v_j1, '{extras}', jsonb_build_array(pg_temp.ex(v_rand, null), pg_temp.ex(v_rand, null))))::text,
    jsonb_build_array(v_j1 || '{"nick": "J"}')::text,
    jsonb_build_array(v_j1 - 'member')::text,
    jsonb_build_array(jsonb_set(v_j1, '{day_ids}', to_jsonb(array(select gen_random_uuid() from generate_series(1, 11)))))::text,
    jsonb_build_array(jsonb_set(v_j1, '{day_ids}', to_jsonb(array[pg_temp.dy(v_cp, 1), pg_temp.dy(v_cp, 1)])))::text,
    jsonb_build_array(jsonb_set(v_j1, '{day_ids}', jsonb_build_array(upper(pg_temp.dy(v_cp, 1)::text), pg_temp.dy(v_cp, 1))))::text,
    '{"first_name": "Jay"}', '"x"', '[1, 2]', 'null'];
  for v_i in 1 .. cardinality(v_list) loop
    select count(*) into v_n2 from public.camp_public_attempts a where a.client_key = v_key;
    v_r := pg_temp.su(v_cp_code, v_key, v_list[v_i]::jsonb, 7500);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: T11e bad children % answered %', v_list[v_i], v_r;
    end if;
    if (select count(*) from public.camp_public_attempts a where a.client_key = v_key) <> v_n2 + 1
       or (select a.outcome from public.camp_public_attempts a where a.client_key = v_key order by a.id desc limit 1) <> 'invalid'
       or (select a.camp_id from public.camp_public_attempts a where a.client_key = v_key order by a.id desc limit 1) <> v_cp then
      raise exception 'TEST FAILED: T11e bad children % wrote no / a wrong attempt row', v_list[v_i];
    end if;
  end loop;
  -- a row also when the core fails a TABLE rule (a test-only rule here)
  alter table public.camp_campers add constraint zz_test_0013_rule check (first_name <> 'Zzfail');
  select count(*) into v_n2 from public.camp_public_attempts a where a.client_key = v_key;
  v_r := pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch('Zzfail', 'Rule', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 7500);
  alter table public.camp_campers drop constraint zz_test_0013_rule;
  if v_r is distinct from '{"status": "invalid"}'::jsonb
     or (select count(*) from public.camp_public_attempts a where a.client_key = v_key) <> v_n2 + 1 then
    raise exception 'TEST FAILED: T11e a table rule inside the core must answer invalid and count: %', v_r;
  end if;
  if (select count(*) from public.camp_signups) <> v_n then
    raise exception 'TEST FAILED: T11e a refused sign-up wrote a sign-up';
  end if;
  -- a lock that isn't free in time (lock_not_available) and a cancelled
  -- call (query_canceled) inside the core: invalid AND counted. PGlite has
  -- one connection, so a real second session holding the camp lock can't be
  -- made here; a test-only trigger raises the same two errors instead.
  create function public.zz_test_0013_raise() returns trigger language plpgsql set search_path = '' as $r$
  begin
    raise exception 'zz test' using errcode = (case when new.parent_name = 'Lock Wait' then '55P03' else '57014' end);
  end;
  $r$;
  create trigger zz_test_0013_raise before insert on public.camp_signups
    for each row execute function public.zz_test_0013_raise();
  foreach v_txt in array array['Lock Wait', 'Cancel Me'] loop
    select count(*) into v_n2 from public.camp_public_attempts a where a.client_key = v_key;
    v_r := public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(),
             jsonb_build_array(pg_temp.ch('Loc', 'Ked', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)),
             v_txt, '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, v_ack,
             md5('I agree to the camp rules.'), 7500);
    if v_r is distinct from '{"status": "invalid"}'::jsonb
       or (select count(*) from public.camp_public_attempts a where a.client_key = v_key) <> v_n2 + 1
       or (select a.outcome from public.camp_public_attempts a where a.client_key = v_key order by a.id desc limit 1) <> 'invalid' then
      raise exception 'TEST FAILED: T11e % inside the core must answer invalid and count: %', v_txt, v_r;
    end if;
  end loop;
  drop trigger zz_test_0013_raise on public.camp_signups;
  drop function public.zz_test_0013_raise();
  if (select count(*) from public.camp_signups) <> v_n then
    raise exception 'TEST FAILED: T11e a lock / cancel refusal wrote a sign-up';
  end if;
  -- the core asks for the 3-second lock wait (this transaction only)
  perform pg_temp.st('T11e an ok sign-up', pg_temp.su(v_cp_code, v_tag || ' k-lock', jsonb_build_array(
           pg_temp.ch('Loc', 'Free', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 7500), 'ok');
  if current_setting('lock_timeout') <> '3s' then
    raise exception 'TEST FAILED: T11e the sign-up core must set lock_timeout to 3s (it is %)', current_setting('lock_timeout');
  end if;
  select count(*) into v_n from public.camp_signups;
  -- an unknown code is counted too (no camp)
  perform pg_temp.su('zzzzzzzz', v_key, v_j1, 7500);
  if (select a.camp_id from public.camp_public_attempts a where a.client_key = v_key order by a.id desc limit 1) is not null
     or (select a.outcome from public.camp_public_attempts a where a.client_key = v_key order by a.id desc limit 1) <> 'not_found' then
    raise exception 'TEST FAILED: T11e an unknown code''s attempt row';
  end if;

  -- T11f. the camp changed while the family filled in the form ->
  --       camp_changed with the camp as it is now
  v_key := v_tag || ' k-changed';
  foreach v_txt in array array['day of another camp', 'extra of another camp', 'extra day of another camp',
                               'too young', 'too old', 'old waiver'] loop
    v_r := case v_txt
      when 'day of another camp' then pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch('Cam', 'Changed', 8, true, array[v_a_d[1]], '[]'::jsonb)), 7500)
      when 'extra of another camp' then pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch('Cam', 'Changed', 8, true, array[pg_temp.dy(v_cp, 1)],
                                          jsonb_build_array(pg_temp.ex(v_pizza, null)))), 8000)
      when 'extra day of another camp' then pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch('Cam', 'Changed', 8, true, array[pg_temp.dy(v_cp, 1)],
                                          jsonb_build_array(pg_temp.ex(pg_temp.xid(v_cp, 'Early drop-off'), array[v_a_d[1]])))), 9000)
      when 'too young' then pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch('Cam', 'Changed', 4, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 7500)
      when 'too old' then pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch('Cam', 'Changed', 13, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 7500)
      else public.camp_public_signup(v_cp_code, v_key, gen_random_uuid(),
             jsonb_build_array(pg_temp.ch('Cam', 'Changed', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)),
             'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig, v_ack,
             md5('an older waiver'), 7500)
    end;
    if v_r ->> 'status' is distinct from 'camp_changed' or v_r -> 'camp' ->> 'status' <> 'ok'
       or v_r -> 'camp' -> 'camp' ->> 'name' <> v_tag || ' Public' then
      raise exception 'TEST FAILED: T11f % answered %', v_txt, v_r;
    end if;
  end loop;
  -- a day removed meanwhile (nobody active picked day 2 except Lou and
  -- Tok En - withdraw them first), and a new age range
  perform set_config('request.jwt.claims', v_c_d1, true);
  for v_k3 in select c.id from public.camp_campers c join public.camp_camper_days cd on cd.camper_id = c.id
               where cd.day_id = pg_temp.dy(v_cp, 2) and c.status = 'active' loop
    perform pg_temp.st('T11f withdraw', public.camp_withdraw_camper(v_k3, pg_temp.cv(v_k3)), 'ok');
  end loop;
  v_k3 := pg_temp.dy(v_cp, 2);
  perform set_config('request.jwt.claims', v_c_a1, true);
  select c.version into v_v from public.camps c where c.id = v_cp;
  perform pg_temp.st('T11f remove day 2, ages 6-12', public.camp_update_camp(v_cp, v_v, 'shrewsbury', false, v_tag || ' Public',
           array[v_today + 10], '09:00', '15:00', v_today - 1, v_today + 5, v_today + 5, 6, 12, pg_temp.grid(1), pg_temp.xtr_ids(v_cp),
           'Bring a lunch.', 'I agree to the camp rules.'), 'ok');
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch('Cam', 'Changed', 8, true, array[v_k3], '[]'::jsonb)), 7500);
  if v_r ->> 'status' <> 'camp_changed' or jsonb_array_length(v_r -> 'camp' -> 'camp' -> 'days') <> 1 then
    raise exception 'TEST FAILED: T11f a removed day answered %', v_r;
  end if;
  v_r := pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch('Cam', 'Changed', 5, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 7500);
  if v_r ->> 'status' <> 'camp_changed' or (v_r -> 'camp' -> 'camp' ->> 'min_age')::integer <> 6 then
    raise exception 'TEST FAILED: T11f an age outside the NEW range answered %', v_r;
  end if;

  -- T11g. the price changed while the family filled in the form ->
  --       price_changed with both totals and the camp as it is now
  perform set_config('request.jwt.claims', v_c_a1, true);
  select c.version into v_v from public.camps c where c.id = v_cp;
  perform pg_temp.st('T11g raise the 1-day member early price', public.camp_update_camp(v_cp, v_v, 'shrewsbury', false, v_tag || ' Public',
           array[v_today + 10], '09:00', '15:00', v_today - 1, v_today + 5, v_today + 5, 6, 12,
           jsonb_set(pg_temp.grid(1), '{0,member_early_cents}', '8000'), pg_temp.xtr_ids(v_cp),
           'Bring a lunch.', 'I agree to the camp rules.'), 'ok');
  perform set_config('request.jwt.claims', '', true);
  v_j1 := jsonb_build_array(pg_temp.ch('Pri', 'Ce', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb));
  v_r := pg_temp.st('T11g old total', pg_temp.su(v_cp_code, v_key, v_j1, 7500), 'price_changed');
  if (v_r ->> 'new_total_cents')::integer <> 8000 or (v_r ->> 'old_total_cents')::integer <> 7500
     or (v_r -> 'camp' -> 'camp' -> 'prices' -> 0 ->> 'member_early_cents')::integer <> 8000 then
    raise exception 'TEST FAILED: T11g price_changed answer %', v_r;
  end if;
  perform pg_temp.st('T11g new total', pg_temp.su(v_cp_code, v_key, v_j1, 8000), 'ok');
  -- the early -> regular switch: camp R's early price ended yesterday
  v_r := pg_temp.st('T11g early total after the early date', pg_temp.su(v_cr_code, v_key, jsonb_build_array(
           pg_temp.ch('Ely', 'Late', 8, true, array[pg_temp.dy(v_cr, 1)], '[]'::jsonb)), 7500), 'price_changed');
  if (v_r ->> 'new_total_cents')::integer <> 8000 or v_r -> 'camp' ->> 'price_kind_today' <> 'regular' then
    raise exception 'TEST FAILED: T11g early -> regular answered %', v_r;
  end if;

  -- T11h. the rate limit: 30 tries per hour per client key, counted ONLY
  --       in camp_public_attempts (Color Belt's ledger doesn't count)
  v_key := v_tag || ' k-rate';
  insert into public.testing_public_attempts (client_key, event_id, outcome)
  select v_key, null, 'ok' from generate_series(1, 40);
  v_j1 := jsonb_build_array(pg_temp.ch('Rae', 'Limit', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb));
  perform pg_temp.st('T11h Color Belt''s rows don''t count', pg_temp.su(v_cp_code, v_key, v_j1, 8000), 'ok');
  insert into public.camp_public_attempts (client_key, camp_id, outcome)
  select v_key, v_cp, 'invalid' from generate_series(1, 28);   -- 29 with the call above
  perform pg_temp.st('T11h the 30th try', pg_temp.su(v_cp_code, v_key, v_j1, 8000), 'ok');
  perform pg_temp.st('T11h the 31st try', pg_temp.su(v_cp_code, v_key, v_j1, 8000), 'rate_limited');
  if (select a.outcome from public.camp_public_attempts a where a.client_key = v_key order by a.id desc limit 1) <> 'rate_limited' then
    raise exception 'TEST FAILED: T11h a refused try must be counted as rate_limited';
  end if;
  perform pg_temp.st('T11h another key is not limited', pg_temp.su(v_cp_code, v_key || '2', v_j1, 8000), 'ok');
  -- rows older than an hour don't count; rows older than 2 days are removed
  update public.camp_public_attempts set at = now() - interval '61 minutes' where client_key = v_key;
  perform pg_temp.st('T11h an hour later', pg_temp.su(v_cp_code, v_key, v_j1, 8000), 'ok');
  insert into public.camp_public_attempts (client_key, camp_id, at, outcome) values (v_tag || ' k-old', null, now() - interval '3 days', 'ok');
  perform pg_temp.su(v_cp_code, v_key, v_j1, 8000);
  if exists (select 1 from public.camp_public_attempts a where a.client_key = v_tag || ' k-old') then
    raise exception 'TEST FAILED: T11h an attempt row older than 2 days was kept';
  end if;
  if (select count(*) from public.testing_public_attempts a where a.client_key like v_tag || '%') <> 40 then
    raise exception 'TEST FAILED: T11h Camps wrote into testing_public_attempts';
  end if;

  -- ===================================================================
  -- T12. Possible duplicates (C4b, v0.702)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_cd := pg_temp.mk(v_tag || ' Dups', 'worcester', false, array[v_today + 12, v_today + 13], v_today - 1, v_today + 5, v_today + 5);
  v_cd_code := pg_temp.code(v_cd);
  perform set_config('request.jwt.claims', '', true);
  v_key := v_tag || ' k-dups';
  v_j1 := jsonb_build_array(pg_temp.ch('Ava', 'Dup', 8, true, array[pg_temp.dy(v_cd, 1)], '[]'::jsonb));
  v_k1 := pg_temp.cmp(pg_temp.st('T12 first', pg_temp.su(v_cd_code, v_key, v_j1, 7500), 'ok') ->> 'reference', 1);
  v_k2 := pg_temp.cmp(pg_temp.st('T12 second', pg_temp.su(v_cd_code, v_key,
            jsonb_build_array(pg_temp.ch('ava', ' DUP ', 8, true, array[pg_temp.dy(v_cd, 2)], '[]'::jsonb)), 7500), 'ok') ->> 'reference', 1);
  if (pg_temp.ro(v_k1) ->> 'duplicate_state') <> 'none'
     or (pg_temp.ro(v_k2) ->> 'duplicate_state') <> 'possible' or (pg_temp.ro(v_k2) ->> 'duplicate_of')::uuid <> v_k1 then
    raise exception 'TEST FAILED: T12a the second sign-up must be a possible duplicate of the first: % / %', pg_temp.ro(v_k1), pg_temp.ro(v_k2);
  end if;
  -- T12b. keep both (staff): both kept_both, pointing at each other
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T12b a camper of another camp',
           public.camp_resolve_duplicate(v_k1, pg_temp.cv(v_k1), v_mia, pg_temp.cv(v_mia), true), 'invalid');
  perform pg_temp.st('T12b same camper twice', public.camp_resolve_duplicate(v_k1, 1, v_k1, 1, true), 'invalid');
  perform pg_temp.st('T12b old version', public.camp_resolve_duplicate(v_k1, pg_temp.cv(v_k1) - 1, v_k2, pg_temp.cv(v_k2), true), 'stale');
  v_r := pg_temp.st('T12b keep both', public.camp_resolve_duplicate(v_k1, pg_temp.cv(v_k1), v_k2, pg_temp.cv(v_k2), true), 'ok');
  if (v_r ->> 'keep_version')::integer <> pg_temp.cv(v_k1) or (v_r ->> 'other_version')::integer <> pg_temp.cv(v_k2)
     or pg_temp.ro(v_k1) ->> 'duplicate_state' <> 'kept_both' or (pg_temp.ro(v_k1) ->> 'duplicate_of')::uuid <> v_k2
     or pg_temp.ro(v_k2) ->> 'duplicate_state' <> 'kept_both' or (pg_temp.ro(v_k2) ->> 'duplicate_of')::uuid <> v_k1 then
    raise exception 'TEST FAILED: T12b keep both answered %', v_r;
  end if;
  perform pg_temp.st('T12b the pair is no longer flagged', public.camp_resolve_duplicate(v_k1, pg_temp.cv(v_k1), v_k2, pg_temp.cv(v_k2), true), 'stale');
  -- T12c. a third Ava Dup is flagged against the oldest; she pays, then
  --       "keep one" withdraws her as a duplicate copy - her payment stays
  perform set_config('request.jwt.claims', '', true);
  v_k3 := pg_temp.cmp(pg_temp.st('T12c third', pg_temp.su(v_cd_code, v_key, v_j1, 7500), 'ok') ->> 'reference', 1);
  if (pg_temp.ro(v_k3) ->> 'duplicate_of')::uuid <> v_k1 then raise exception 'TEST FAILED: T12c third must point at the first'; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T12c the third pays', public.camp_mark_paid(v_k3, pg_temp.cv(v_k3)), 'ok');
  v_r := pg_temp.st('T12c keep one', public.camp_resolve_duplicate(v_k1, pg_temp.cv(v_k1), v_k3, pg_temp.cv(v_k3), false), 'ok');
  if pg_temp.ro(v_k3) ->> 'status' <> 'withdrawn' or pg_temp.ro(v_k3) ->> 'withdrawn_reason' <> 'duplicate_copy'
     or pg_temp.ro(v_k3) ->> 'withdrawn_by_name' <> v_dn
     or (select c.withdrawn_by from public.camp_campers c where c.id = v_k3) <> v_desk
     or (pg_temp.ro(v_k3) ->> 'paid_cents')::integer <> 7500
     or pg_temp.ro(v_k1) ->> 'duplicate_state' <> 'kept_both' then
    raise exception 'TEST FAILED: T12c keep one: % / %', pg_temp.ro(v_k3), pg_temp.ro(v_k1);
  end if;
  -- T12d. staff may Restore their own duplicate copy within 10 seconds
  --       (the toast's Undo); the restored one is flagged again
  perform pg_temp.st('T12d staff restore own copy', public.camp_restore_camper(v_k3, pg_temp.cv(v_k3)), 'ok');
  if pg_temp.ro(v_k3) ->> 'status' <> 'active' or pg_temp.ro(v_k3) ->> 'duplicate_state' <> 'possible' then
    raise exception 'TEST FAILED: T12d restore must flag the camper again: %', pg_temp.ro(v_k3);
  end if;
  perform pg_temp.st('T12d keep one again', public.camp_resolve_duplicate(v_k1, pg_temp.cv(v_k1), v_k3, pg_temp.cv(v_k3), false), 'ok');
  update public.camp_campers set withdrawn_at = now() - interval '11 seconds' where id = v_k3;   -- 11 seconds later
  perform pg_temp.st('T12d staff restore after 10 seconds', public.camp_restore_camper(v_k3, pg_temp.cv(v_k3)), 'not_allowed');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('T12d admin restore', public.camp_restore_camper(v_k3, pg_temp.cv(v_k3)), 'ok');
  perform pg_temp.st('T12d admin keep one', public.camp_resolve_duplicate(v_k1, pg_temp.cv(v_k1), v_k3, pg_temp.cv(v_k3), false), 'ok');
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T12d staff restore of the admin''s copy', public.camp_restore_camper(v_k3, pg_temp.cv(v_k3)), 'not_allowed');
  -- T12e. withdrawing the original clears the newer one's flag; deleting
  --       the one it points at clears it too
  perform set_config('request.jwt.claims', '', true);
  v_j1 := jsonb_build_array(pg_temp.ch('Bo', 'Pair', 8, true, array[pg_temp.dy(v_cd, 1)], '[]'::jsonb));
  v_p1 := pg_temp.cmp(pg_temp.su(v_cd_code, v_key, v_j1, 7500) ->> 'reference', 1);
  v_p2 := pg_temp.cmp(pg_temp.su(v_cd_code, v_key, v_j1, 7500) ->> 'reference', 1);
  if pg_temp.ro(v_p2) ->> 'duplicate_state' <> 'possible' then raise exception 'TEST FAILED: T12e setup'; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T12e withdraw the original', public.camp_withdraw_camper(v_p1, pg_temp.cv(v_p1)), 'ok');
  if pg_temp.ro(v_p2) ->> 'duplicate_state' <> 'none' or pg_temp.ro(v_p2) -> 'duplicate_of' <> 'null'::jsonb then
    raise exception 'TEST FAILED: T12e withdrawing the original must clear the flag: %', pg_temp.ro(v_p2);
  end if;
  perform pg_temp.st('T12e restore the original', public.camp_restore_camper(v_p1, pg_temp.cv(v_p1)), 'ok');
  if pg_temp.ro(v_p1) ->> 'duplicate_state' <> 'possible' then raise exception 'TEST FAILED: T12e restore must recheck'; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('T12e delete the one it points at', public.camp_delete_camper(v_p2, pg_temp.cv(v_p2), '{}'), 'ok');
  if pg_temp.ro(v_p1) ->> 'duplicate_state' <> 'none' then raise exception 'TEST FAILED: T12e deleting must clear the flag'; end if;
  -- T12f. after the camp's last day "keep one" is admin-only; "keep both"
  --       still works for staff. Camp OD: one day, moved to yesterday.
  v_ce := pg_temp.mk(v_tag || ' Dups Over', 'worcester', false, array[v_today + 1], v_today - 5, v_today, v_today);
  v_ce_code := pg_temp.code(v_ce);
  perform set_config('request.jwt.claims', '', true);
  v_j1 := jsonb_build_array(pg_temp.ch('Old', 'Dup', 8, true, array[pg_temp.dy(v_ce, 1)], '[]'::jsonb));
  v_ids := array[pg_temp.cmp(pg_temp.su(v_ce_code, v_key, v_j1, 7500) ->> 'reference', 1),
                 pg_temp.cmp(pg_temp.su(v_ce_code, v_key, v_j1, 7500) ->> 'reference', 1),
                 pg_temp.cmp(pg_temp.su(v_ce_code, v_key, v_j1, 7500) ->> 'reference', 1)];
  update public.camp_days set day = v_today - 1 where camp_id = v_ce;
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T12f staff keep one after the last day',
           public.camp_resolve_duplicate(v_ids[1], pg_temp.cv(v_ids[1]), v_ids[2], pg_temp.cv(v_ids[2]), false), 'not_allowed');
  perform pg_temp.st('T12f staff keep both after the last day',
           public.camp_resolve_duplicate(v_ids[1], pg_temp.cv(v_ids[1]), v_ids[2], pg_temp.cv(v_ids[2]), true), 'ok');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('T12f admin keep one after the last day',
           public.camp_resolve_duplicate(v_ids[1], pg_temp.cv(v_ids[1]), v_ids[3], pg_temp.cv(v_ids[3]), false), 'ok');
  perform pg_temp.st('T12f two camps', public.camp_resolve_duplicate(v_ids[1], 1, v_mia, 1, true), 'invalid');

  -- ===================================================================
  -- T13. Signatures
  -- ===================================================================
  -- T13a. never readable by the app; the roster only says "signed"
  if has_column_privilege('authenticated', 'public.camp_signups', 'signature', 'SELECT')
     or has_column_privilege('authenticated', 'public.camp_signups', 'waiver_text_signed', 'SELECT')
     or has_column_privilege('authenticated', 'public.camp_signups', 'submission_id', 'SELECT')
     or exists (select 1 from pg_attribute a where a.attrelid = 'public.camp_roster'::regclass and a.attnum > 0
                 and a.attname in ('signature', 'waiver_text_signed', 'submission_id', 'parent_phone', 'emergency_phone',
                                   'parent_name', 'emergency_name', 'withdrawn_by', 'created_by', 'recorded_by')) then
    raise exception 'TEST FAILED: T13a a signature / waiver copy / phone is readable';
  end if;
  if (pg_temp.ro(v_mia) ->> 'signed')::boolean is not true then raise exception 'TEST FAILED: T13a roster signed'; end if;
  -- T13b. the 3-year clean-up: camp OLD's only day is moved to 3 years and
  --       1 day ago, camp EDGE's to exactly 3 years ago. A family sign-up
  --       never runs the clean-up; Mark paid and Add camp do. The version
  --       doesn't move; "signed" stays true.
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_co := pg_temp.mk(v_tag || ' Old', 'worcester', false, array[v_today + 1], v_today - 1, v_today, v_today);
  v_cm := pg_temp.mk(v_tag || ' Edge', 'worcester', false, array[v_today + 1], v_today - 1, v_today, v_today);
  perform set_config('request.jwt.claims', '', true);
  v_k1 := pg_temp.cmp(pg_temp.st('T13b old sign-up', pg_temp.su(pg_temp.code(v_co), v_key, jsonb_build_array(
            pg_temp.ch('Ola', 'Old', 8, true, array[pg_temp.dy(v_co, 1)], '[]'::jsonb)), 7500), 'ok') ->> 'reference', 1);
  v_k2 := pg_temp.cmp(pg_temp.st('T13b edge sign-up', pg_temp.su(pg_temp.code(v_cm), v_key, jsonb_build_array(
            pg_temp.ch('Eda', 'Edge', 8, true, array[pg_temp.dy(v_cm, 1)], '[]'::jsonb)), 7500), 'ok') ->> 'reference', 1);
  update public.camps set signup_opens_on = (v_today - interval '3 years')::date - 10, signup_closes_on = (v_today - interval '3 years')::date - 2,
                          early_until = (v_today - interval '3 years')::date - 10
   where id in (v_co, v_cm);
  update public.camp_days set day = (v_today - interval '3 years')::date - 1 where camp_id = v_co;
  update public.camp_days set day = (v_today - interval '3 years')::date where camp_id = v_cm;
  select s.version into v_v from public.camp_signups s join public.camp_campers c on c.signup_id = s.id where c.id = v_k1;
  perform pg_temp.su(v_cp_code, v_key, jsonb_build_array(pg_temp.ch('No', 'Purge', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 8000);
  if not exists (select 1 from public.camp_signups s join public.camp_campers c on c.signup_id = s.id
                  where c.id = v_k1 and s.signature is not null) then
    raise exception 'TEST FAILED: T13b the family form ran the signature clean-up';
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T13b mark paid runs the clean-up', public.camp_mark_paid(v_mia, pg_temp.cv(v_mia)), 'ok');
  if not exists (select 1 from public.camp_signups s join public.camp_campers c on c.signup_id = s.id
                  where c.id = v_k1 and s.signature is null and s.signature_deleted_at is not null and s.version = v_v)
     or not exists (select 1 from public.camp_signups s join public.camp_campers c on c.signup_id = s.id
                     where c.id = v_k2 and s.signature is not null)
     or (pg_temp.ro(v_k1) ->> 'signed')::boolean is not true
     or pg_temp.ro(v_k1) -> 'signature_deleted_at' = 'null'::jsonb then
    raise exception 'TEST FAILED: T13b the 3-year clean-up (only strictly older than 3 years, no version bump)';
  end if;
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.action = 'camp_purge_old_signatures' and l.table_name = 'camp_signups'
                    and l.before ->> 'signature' = 'on file' and l.after ? 'signature' and l.after ->> 'signature' is null) then
    raise exception 'TEST FAILED: T13b the clean-up''s history row';
  end if;
  update public.camp_days set day = (v_today - interval '3 years')::date - 1 where camp_id = v_cm;
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.mk(v_tag || ' Purge Trigger', 'worcester', false, array[v_today + 60], v_today, v_today, v_today);
  if exists (select 1 from public.camp_signups s join public.camp_campers c on c.signup_id = s.id
              where c.id = v_k2 and s.signature is not null) then
    raise exception 'TEST FAILED: T13b Add camp must run the clean-up';
  end if;
  -- T13c. a signature can't be replaced, only removed
  begin
    update public.camp_signups s set signature = v_sig
      from public.camp_campers c where c.signup_id = s.id and c.id = v_k1;
    raise exception 'TEST FAILED: T13c a removed signature was put back';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- T14. Templates
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- (a camp whose sign-up opens more than 365 days before its first day,
  -- for T14a below)
  v_cm := pg_temp.mk(v_tag || ' Far', 'worcester', false, array[v_today + 400], v_today, v_today + 10, v_today);
  -- everything the template functions must NOT touch: the camps
  v_txt := 'select md5(coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.camps x), '''')
                    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.camp_days x), '''')
                    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.camp_prices x), '''')
                    || coalesce((select string_agg(to_jsonb(x)::text, '','' order by x.id) from public.camp_extras x), ''''))';
  execute v_txt into v_snap;
  -- T14a. Save as template from camp A: everything but dates and campers;
  --       the dates as days before the first day (first = today + 30)
  v_r := pg_temp.st('T14a save template', public.camp_save_template(v_ca, '  ' || v_tag || '   Vacation   week '), 'ok');
  v_tpl := (v_r ->> 'id')::uuid;  v_tplv := (v_r ->> 'version')::integer;
  if not exists (select 1 from public.camp_templates t
                  where t.id = v_tpl and t.name = v_tag || ' Vacation week' and t.location_code = 'worcester' and t.both_schools
                    and t.day_count = 5 and t.start_time = '09:00' and t.end_time = '15:00'
                    and t.opens_days_before = 31 and t.closes_days_before = 10 and t.early_days_before = 25
                    and t.min_age = 5 and t.max_age = 12 and t.description = 'Bring a lunch.'
                    and t.waiver_text = 'I agree to the camp rules.'
                    and jsonb_array_length(t.prices) = 5 and (t.prices -> 2 ->> 'member_early_cents')::integer = 20000
                    and t.extras = jsonb_set(pg_temp.xtr(), '{1,price_cents}', '1000')) or v_tplv <> 1 then
    raise exception 'TEST FAILED: T14a the saved template is wrong: %', (select to_jsonb(t) from public.camp_templates t where t.id = v_tpl);
  end if;
  perform pg_temp.st('T14a the same name again', public.camp_save_template(v_cr, upper(v_tag) || ' VACATION WEEK'), 'duplicate_name');
  perform pg_temp.st('T14a an unknown camp', public.camp_save_template(v_rand, v_tag || ' x'), 'not_found');
  perform pg_temp.st('T14a no name', public.camp_save_template(v_ca, ' '), 'invalid');
  -- camp "Far": its sign-up opens 400 days before its first day
  v_r := public.camp_save_template(v_cm, v_tag || ' Far tpl');
  if v_r is distinct from '{"status": "invalid", "field": "offsets"}'::jsonb then
    raise exception 'TEST FAILED: T14a offsets over 365 days answered %', v_r;
  end if;
  -- T14b. Edit template: the offsets are checked first
  for v_i in 1 .. 4 loop
    v_r := public.camp_update_template(v_tpl, v_tplv, v_tag || ' Vacation week', 'worcester', true, 5, '09:00', '15:00',
             case v_i when 1 then 366 when 2 then 1 else 10 end,
             case v_i when 1 then 0 when 2 then 5 when 3 then 5 else -366 end,
             case v_i when 1 then 0 when 2 then 5 when 3 then 4 else 0 end,
             5, 12, pg_temp.grid(5), pg_temp.xtr(), null, 'W');
    if v_r is distinct from '{"status": "invalid", "field": "offsets"}'::jsonb then
      raise exception 'TEST FAILED: T14b offsets case % answered %', v_i, v_r;
    end if;
  end loop;
  perform pg_temp.st('T14b grid for the wrong number of days', public.camp_update_template(v_tpl, v_tplv, v_tag || ' Vacation week',
           'worcester', true, 2, '09:00', '15:00', 7, 1, 7, 5, 12, pg_temp.grid(3), '[]', null, 'W'), 'invalid');
  perform pg_temp.st('T14b extras with ids', public.camp_update_template(v_tpl, v_tplv, v_tag || ' Vacation week',
           'worcester', true, 5, '09:00', '15:00', 7, 1, 7, 5, 12, pg_temp.grid(5), pg_temp.xtr_ids(v_ca), null, 'W'), 'invalid');
  perform pg_temp.st('T14b ages backwards', public.camp_update_template(v_tpl, v_tplv, v_tag || ' Vacation week',
           'worcester', true, 5, '09:00', '15:00', 7, 1, 7, 9, 8, pg_temp.grid(5), '[]', null, 'W'), 'invalid');
  v_r := pg_temp.st('T14b edit template', public.camp_update_template(v_tpl, v_tplv, v_tag || ' Summer week', 'shrewsbury', false, 2,
           '08:30', '12:00', 14, -1, 7, 8, 8, pg_temp.grid(2), '[]', E'Line 1\r\nLine 2  ', 'New waiver.'), 'ok');
  if (v_r ->> 'version')::integer <> v_tplv + 1
     or not exists (select 1 from public.camp_templates t where t.id = v_tpl and t.name = v_tag || ' Summer week'
                     and t.day_count = 2 and t.closes_days_before = -1 and t.min_age = 8 and t.max_age = 8
                     and t.description = E'Line 1\nLine 2' and t.extras = '[]'::jsonb) then
    raise exception 'TEST FAILED: T14b the edited template: %', (select to_jsonb(t) from public.camp_templates t where t.id = v_tpl);
  end if;
  v_tplv := v_tplv + 1;
  v_r := pg_temp.st('T14b the same values again', public.camp_update_template(v_tpl, v_tplv, v_tag || ' Summer week', 'shrewsbury', false, 2,
           '08:30', '12:00', 14, -1, 7, 8, 8, pg_temp.grid(2), '[]', E'Line 1\r\nLine 2  ', 'New waiver.'), 'ok');
  if (v_r ->> 'version')::integer <> v_tplv then raise exception 'TEST FAILED: T14b saving nothing new bumped the version'; end if;
  perform pg_temp.st('T14b old version', public.camp_update_template(v_tpl, v_tplv - 1, v_tag || ' Summer week', 'shrewsbury', false, 2,
           '08:30', '12:00', 14, -1, 7, 8, 8, pg_temp.grid(2), '[]', null, 'New waiver.'), 'stale');
  v_r := pg_temp.st('T14b a second template', public.camp_save_template(v_cr, v_tag || ' Late week'), 'ok');
  perform pg_temp.st('T14b rename onto another template', public.camp_update_template(v_tpl, v_tplv, v_tag || ' LATE week', 'shrewsbury',
           false, 2, '08:30', '12:00', 14, -1, 7, 8, 8, pg_temp.grid(2), '[]', null, 'New waiver.'), 'duplicate_name');
  perform pg_temp.st('T14b unknown template', public.camp_update_template(v_rand, 1, v_tag || ' Zz', 'shrewsbury',
           false, 2, '08:30', '12:00', 14, -1, 7, 8, 8, pg_temp.grid(2), '[]', null, 'New waiver.'), 'not_found');
  -- T14c. the table rule refuses broken jsonb even written directly
  foreach v_j1 in array array[pg_temp.grid(3), '[]'::jsonb, '{"day_count": 1}'::jsonb] loop
    begin
      insert into public.camp_templates (name, location_code, both_schools, day_count, start_time, end_time, opens_days_before,
                                         closes_days_before, early_days_before, min_age, max_age, waiver_text, prices, extras,
                                         created_by_name, updated_by_name)
      values (v_tag || ' direct', 'worcester', false, 2, '09:00', '15:00', 7, 1, 7, 5, 12, 'W', v_j1, '[]', '', '');
      raise exception 'TEST FAILED: T14c a template with prices % was written directly', v_j1;
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.camp_templates (name, location_code, both_schools, day_count, start_time, end_time, opens_days_before,
                                       closes_days_before, early_days_before, min_age, max_age, waiver_text, prices, extras,
                                       created_by_name, updated_by_name)
    values (v_tag || ' direct', 'worcester', false, 1, '09:00', '15:00', 1, 7, 7, 5, 12, 'W', pg_temp.grid(1),
            '[{"name": "A", "price_cents": 1, "per": "day", "not_for_all_days": false}]', '', '');
    raise exception 'TEST FAILED: T14c a template with bad offsets / extras was written directly';
  exception when check_violation then null;
  end;
  -- T14d. Delete template: old version -> stale; then gone. No camp moved.
  perform pg_temp.st('T14d old version', public.camp_delete_template(v_tpl, v_tplv - 1), 'stale');
  perform pg_temp.st('T14d delete', public.camp_delete_template(v_tpl, v_tplv), 'ok');
  if exists (select 1 from public.camp_templates t where t.id = v_tpl) then raise exception 'TEST FAILED: T14d the template is left'; end if;
  perform pg_temp.st('T14d again', public.camp_delete_template(v_tpl, v_tplv), 'not_found');
  execute v_txt into v_snap2;
  if v_snap2 is distinct from v_snap then raise exception 'TEST FAILED: T14 a template function changed a camp'; end if;

  -- ===================================================================
  -- T14a (roles of the roster actions) - who may do what, in one place
  --   (most are also exercised above: T7e staff Restore of an ordinary
  --   withdrawal, T12d staff Restore of their own copy within 10 s only,
  --   T9b/T9c Undo / Edit payment, T1d admin-only functions)
  -- ===================================================================
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.su(v_cp_code, v_tag || ' k-roles', jsonb_build_array(pg_temp.ch('Rol', 'Es', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 8000);
  v_k1 := pg_temp.cmp(v_r ->> 'reference', 1);
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.st('T14a staff withdraw', public.camp_withdraw_camper(v_k1, pg_temp.cv(v_k1)), 'ok');
  perform pg_temp.st('T14a staff restore', public.camp_restore_camper(v_k1, pg_temp.cv(v_k1)), 'ok');
  v_r := pg_temp.st('T14a staff mark paid', public.camp_mark_paid(v_k1, pg_temp.cv(v_k1)), 'ok');
  v_p1 := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.st('T14a staff edit payment', public.camp_edit_payment(v_p1, 'cash', 100, v_today), 'not_allowed');
  perform pg_temp.st('T14a staff delete permanently', public.camp_delete_camper(v_k1, pg_temp.cv(v_k1), array[v_p1]), 'not_allowed');
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('T14a delete with the wrong payment list', public.camp_delete_camper(v_k1, pg_temp.cv(v_k1), '{}'), 'stale');
  perform pg_temp.st('T14a delete with a bad payment list', public.camp_delete_camper(v_k1, pg_temp.cv(v_k1), array[v_p1, v_p1]), 'invalid');
  select s.id into v_sub from public.camp_signups s join public.camp_campers c on c.signup_id = s.id where c.id = v_k1;
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T14a admin delete permanently', public.camp_delete_camper(v_k1, pg_temp.cv(v_k1), array[v_p1]), 'ok');
  perform pg_temp.t15(v_mark, 'camp_delete_camper', v_an, 'delete camper');
  if exists (select 1 from public.camp_signups s where s.id = v_sub)
     or exists (select 1 from public.camp_payments p where p.id = v_p1)
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'camp_signups' and l.op = 'delete') then
    raise exception 'TEST FAILED: T14a deleting the sign-up''s last camper must remove the sign-up and the payment';
  end if;
  -- a sign-up with two children keeps the other one
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.su(v_cp_code, v_tag || ' k-roles', jsonb_build_array(
           pg_temp.ch('Sib', 'One', 8, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb),
           pg_temp.ch('Sib', 'Two', 6, true, array[pg_temp.dy(v_cp, 1)], '[]'::jsonb)), 16000);
  v_k1 := pg_temp.cmp(v_r ->> 'reference', 1);  v_k2 := pg_temp.cmp(v_r ->> 'reference', 2);
  perform set_config('request.jwt.claims', v_c_a1, true);
  perform pg_temp.st('T14a delete one sibling', public.camp_delete_camper(v_k1, pg_temp.cv(v_k1), '{}'), 'ok');
  if not exists (select 1 from public.camp_signups s join public.camp_campers c on c.signup_id = s.id where c.id = v_k2) then
    raise exception 'TEST FAILED: T14a deleting one sibling removed the sign-up';
  end if;

  -- ===================================================================
  -- T15. The history: every write has the function's name as action, the
  --      right actor and ONE batch id per call
  -- ===================================================================
  v_cm := pg_temp.mk(v_tag || ' History', 'worcester', false, array[v_today + 70, v_today + 71], v_today - 1, v_today + 5, v_today + 5);
  select max(id) into v_mark from public.change_log;
  v_cn := pg_temp.mk(v_tag || ' History 2', 'worcester', false, array[v_today + 70], v_today - 1, v_today + 5, v_today + 5);
  perform pg_temp.t15(v_mark, 'camp_add_camp', v_an, 'add camp');
  if (select count(*) from public.change_log l where l.id > v_mark and l.action = 'camp_add_camp') <> 1 + 1 + 1 + 3 then
    raise exception 'TEST FAILED: T15 Add camp must log the camp, its day, its price row and its 3 extras';
  end if;
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 set signup', public.camp_set_signup(v_cn, 1, false), 'ok');
  perform pg_temp.t15(v_mark, 'camp_set_signup', v_an, 'set signup');
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 save template', public.camp_save_template(v_cn, v_tag || ' History tpl'), 'ok');
  perform pg_temp.t15(v_mark, 'camp_save_template', v_an, 'save template');
  select t.id, t.version into v_tpl, v_tplv from public.camp_templates t where t.name = v_tag || ' History tpl';
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 update template', public.camp_update_template(v_tpl, v_tplv, v_tag || ' History tpl 2', 'worcester', false, 1,
           '09:00', '15:00', 7, 1, 7, 5, 12, pg_temp.grid(1), '[]', null, 'W'), 'ok');
  perform pg_temp.t15(v_mark, 'camp_update_template', v_an, 'update template');
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 delete template', public.camp_delete_template(v_tpl, v_tplv + 1), 'ok');
  perform pg_temp.t15(v_mark, 'camp_delete_template', v_an, 'delete template');
  perform set_config('request.jwt.claims', '', true);
  v_r := pg_temp.su(pg_temp.code(v_cm), v_tag || ' k-history', jsonb_build_array(
           pg_temp.ch('His', 'Tory', 8, true, pg_temp.dys(v_cm, array[1]), '[]'::jsonb)), 7500);
  v_k1 := pg_temp.cmp(v_r ->> 'reference', 1);
  v_r := pg_temp.su(pg_temp.code(v_cm), v_tag || ' k-history', jsonb_build_array(
           pg_temp.ch('His', 'Tory', 8, true, pg_temp.dys(v_cm, array[2]), '[]'::jsonb)), 7500);
  v_k2 := pg_temp.cmp(v_r ->> 'reference', 1);
  perform set_config('request.jwt.claims', v_c_d1, true);
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 update details', pg_temp.ud(v_k1, 'His', 'Tory', 9, true, pg_temp.dys(v_cm, array[1, 2]), '[]', '5085550100'), 'ok');
  perform pg_temp.t15(v_mark, 'camp_update_details', v_dn, 'update details');
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 change paying by', public.camp_change_paying_by(v_k1, pg_temp.cv(v_k1), 'check'), 'ok');
  perform pg_temp.t15(v_mark, 'camp_change_paying_by', v_dn, 'change paying by');
  select max(id) into v_mark from public.change_log;
  v_r := pg_temp.st('T15 mark paid', public.camp_mark_paid(v_k1, pg_temp.cv(v_k1)), 'ok');
  perform pg_temp.t15(v_mark, 'camp_mark_paid', v_dn, 'mark paid');
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 undo payment', public.camp_undo_payment((v_r ->> 'payment_id')::uuid), 'ok');
  perform pg_temp.t15(v_mark, 'camp_undo_payment', v_dn, 'undo payment');
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 resolve duplicate', public.camp_resolve_duplicate(v_k1, pg_temp.cv(v_k1), v_k2, pg_temp.cv(v_k2), false), 'ok');
  perform pg_temp.t15(v_mark, 'camp_resolve_duplicate', v_dn, 'resolve duplicate');
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 restore', public.camp_restore_camper(v_k2, pg_temp.cv(v_k2)), 'ok');
  perform pg_temp.t15(v_mark, 'camp_restore_camper', v_dn, 'restore');
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 withdraw', public.camp_withdraw_camper(v_k2, pg_temp.cv(v_k2)), 'ok');
  perform pg_temp.t15(v_mark, 'camp_withdraw_camper', v_dn, 'withdraw');
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := pg_temp.st('T15 mark paid (admin)', public.camp_mark_paid(v_k1, pg_temp.cv(v_k1)), 'ok');
  select max(id) into v_mark from public.change_log;
  perform pg_temp.st('T15 edit payment', public.camp_edit_payment((v_r ->> 'payment_id')::uuid, 'card', 7000, v_today), 'ok');
  perform pg_temp.t15(v_mark, 'camp_edit_payment', v_an, 'edit payment');
  -- every history row Camps wrote in this run is tagged camp_... (only
  -- the test's own direct writes are "manual"), and no row anywhere in
  -- the history contains a picture
  if exists (select 1 from public.change_log l
              where l.id > v_mark0
                and (l.table_name like 'camp\_%' or l.table_name = 'camps')
                and l.action not like 'camp\_%' and l.action <> 'manual') then
    raise exception 'TEST FAILED: T15 a camp history row has an untagged action';
  end if;
  if exists (select 1 from public.change_log l
              where coalesce(l.before::text, '') || coalesce(l.after::text, '') like '%data:image%') then
    raise exception 'TEST FAILED: T13/T15 change_log contains a picture (data:image)';
  end if;
  if exists (select 1 from public.change_log l
              where l.table_name = 'camp_signups'
                and (coalesce(l.before, '{}') ?| array['submission_id', 'waiver_text_signed']
                     or coalesce(l.after, '{}') ?| array['submission_id', 'waiver_text_signed'])) then
    raise exception 'TEST FAILED: T15 the history holds a submission id or a waiver copy';
  end if;

  -- ===================================================================
  -- T16. Catalog
  -- ===================================================================
  -- T16a. every camp function is in exactly one of the three lists; no
  --       stray or extra versions
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'camp\_%' or p.proname like 'camps\_%')
     and not (p.proname = any (v_staff_fns || v_public_fns || v_helper_fns));
  if v_txt is not null then raise exception 'TEST FAILED: T16a camp function(s) not in the lists: %', v_txt; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns);
  if v_n <> cardinality(v_staff_fns || v_public_fns || v_helper_fns) then
    raise exception 'TEST FAILED: T16a expected % camp functions (one version each), found %',
      cardinality(v_staff_fns || v_public_fns || v_helper_fns), v_n;
  end if;
  -- T16b. search_path = '' everywhere; security definer exactly on the
  --       staff and public functions and the sign-ups' history trigger
  for v_fn in
    select p.oid, p.proname::text as name, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_staff_fns || v_public_fns || v_helper_fns)
  loop
    if v_fn.proconfig is null or not ('search_path=""' = any (v_fn.proconfig)) then
      raise exception 'TEST FAILED: T16b % has no search_path = ''''', v_fn.oid::regprocedure;
    end if;
    if v_fn.prosecdef is distinct from (v_fn.name = any (v_staff_fns || v_public_fns || array['camp_signups_log'])) then
      raise exception 'TEST FAILED: T16b % security definer = %', v_fn.oid::regprocedure, v_fn.prosecdef;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE') or has_function_privilege('service_role', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: T16b anon / service_role can execute %', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_staff_fns)) then
      raise exception 'TEST FAILED: T16b authenticated execute on % is wrong', v_fn.oid::regprocedure;
    end if;
  end loop;
  -- T16c. RLS on every new table; one read rule per readable table (for
  --       authenticated, with has_data_access()); none on the ledger
  foreach v_tbl in array v_tables loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = v_tbl and c.relrowsecurity) then
      raise exception 'TEST FAILED: T16c RLS is off on %', v_tbl;
    end if;
    select count(*) into v_n from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl;
    if v_n <> (case when v_tbl = 'camp_public_attempts' then 0 else 1 end) then
      raise exception 'TEST FAILED: T16c % has % policies', v_tbl, v_n;
    end if;
    if v_tbl <> 'camp_public_attempts'
       and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl
                        and p.cmd = 'SELECT' and p.roles = array['authenticated']::name[]
                        and p.qual like '%has_data_access()%') then
      raise exception 'TEST FAILED: T16c % read rule is not "select to authenticated using has_data_access()"', v_tbl;
    end if;
  end loop;
  -- T16d. no table-wide rights for any client role (column rights only),
  --       nothing at all for anon / service_role / PUBLIC; the view is
  --       security_invoker
  select string_agg(c.relname || ':' || a.grantee::regrole::text || ':' || a.privilege_type, ', ') into v_txt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) as a
   where n.nspname = 'public'
     and c.relname = any (v_tables || array['camp_signup_ref_seq', 'camp_public_attempts_id_seq'])
     and a.grantee <> c.relowner;
  if v_txt is not null then raise exception 'TEST FAILED: T16d table-wide rights: %', v_txt; end if;
  select string_agg(c.relname || '.' || t.attname || '>' || a.grantee::regrole::text, ', ') into v_txt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute t on t.attrelid = c.oid and t.attnum > 0, aclexplode(t.attacl) as a
   where n.nspname = 'public' and c.relname = any (v_tables)
     and (a.grantee <> 'authenticated'::regrole or a.privilege_type <> 'SELECT');
  if v_txt is not null then raise exception 'TEST FAILED: T16d column rights other than authenticated SELECT: %', v_txt; end if;
  if not exists (select 1 from pg_class c where c.oid = 'public.camp_roster'::regclass
                  and 'security_invoker=true' = any (c.reloptions)) then
    raise exception 'TEST FAILED: T16d camp_roster is not security_invoker';
  end if;
  if has_table_privilege('anon', 'public.camp_roster', 'SELECT') or not has_table_privilege('authenticated', 'public.camp_roster', 'SELECT') then
    raise exception 'TEST FAILED: T16d camp_roster rights';
  end if;
  -- T16e. every logged table has a uuid "id" (change_log_write needs it),
  --       a history trigger and a no-truncate trigger
  foreach v_tbl in array v_read_tables loop
    if not exists (select 1 from pg_attribute a where a.attrelid = ('public.' || v_tbl)::regclass
                    and a.attname = 'id' and a.atttypid = 'uuid'::regtype) then
      raise exception 'TEST FAILED: T16e % has no uuid id', v_tbl;
    end if;
    if not exists (select 1 from pg_trigger t where t.tgrelid = ('public.' || v_tbl)::regclass and not t.tgisinternal
                    and t.tgfoid in ('public.change_log_write()'::regprocedure, 'public.camp_signups_log()'::regprocedure))
       or not exists (select 1 from pg_trigger t where t.tgrelid = ('public.' || v_tbl)::regclass and not t.tgisinternal
                       and t.tgfoid = 'public.testing_refuse_truncate()'::regprocedure) then
      raise exception 'TEST FAILED: T16e % is missing its history or no-truncate trigger', v_tbl;
    end if;
  end loop;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'public.camp_signups'::regclass
              and t.tgfoid = 'public.change_log_write()'::regprocedure) then
    raise exception 'TEST FAILED: T16e camp_signups must use its own history trigger only';
  end if;
  -- T16f. the keys from camper rows to the camp's days / extras are
  --       "no action" (contract §1.9 / §1.10), the rest as the contract says
  if exists (select 1 from pg_constraint k
              where k.conname in ('camp_camper_days_day_fk', 'camp_camper_extras_extra_fk', 'camp_camper_extras_day_fk')
                and k.confdeltype <> 'a')
     or exists (select 1 from pg_constraint k
                 where k.conname in ('camp_days_camp_fk', 'camp_prices_camp_fk', 'camp_extras_camp_fk', 'camp_signups_camp_fk',
                                     'camp_campers_signup_fk', 'camp_campers_camp_fk', 'camp_camper_days_camper_fk',
                                     'camp_camper_extras_camper_fk', 'camp_payments_camper_fk')
                   and k.confdeltype <> 'c')
     or not exists (select 1 from pg_constraint k where k.conname = 'camp_campers_duplicate_fk' and k.confdeltype = 'n') then
    raise exception 'TEST FAILED: T16f a foreign key has the wrong "on delete" rule';
  end if;

  reset role;
end;
$$;

select 'ALL 0013 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
