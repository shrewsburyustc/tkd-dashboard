-- =====================================================================
-- 0014_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0014_testing_private.sql (Color
--   Belt phase 4: the Private testing tab). It checks, in this order
--   (contract 0014 §3.1):
--     V1   catalog: the 3 tables (RLS, the one read rule, column rights -
--          never a login id), the view (security_invoker), every function
--          (definer, search_path, no defaults, owner, who may call it),
--          triggers, rules; the desk can read the view's owed amount
--     V2   locked / signed-out / old / magic-link sessions see nothing and
--          get no_access; anon is refused
--     V3   Add: the copy from Classes and ranks, every refusal, the day
--          and time rules
--     V4   Edit details: names, belt re-copy and re-price, a removed rank,
--          the result cleared, the belt lock after the private day
--     V5   Change day or time: rules, graded, No show cleared, note kept,
--          unchanged = nothing written
--     V6   Money: Mark paid, a moved-in payment, $0, Undo own / admin,
--          Edit payment, Change how they'll pay, stale double click
--     V7   Cancel, Restore, Delete permanently
--     V8   Grading window from the private day
--     V9   Move to private testing (money moved, dates kept, one batch,
--          No show cleared, refusals, reversed pairs, overpaid)
--     V9b  the moved registration against the live functions
--     V10  Restore of a moved registration -> moved
--     V11  Undo move (window, who, refusals)
--     V11b guards: append-only payments, immutable columns, truncate
--     V12  the history: actions, batch ids, who; no signature picture
--   It makes its own test classes and events with unusual names ("zz test
--   1a2b3c4d ..."), so it works whatever is already in the database (run
--   it before AND after real data exists). All names are made up.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test classes, events, students,
--   private testings, payments, results, history rows, test sessions, the
--   one trigger switched off for a moment). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0005_tests.sql and 0010_tests.sql (read their headers):
--   "set local role authenticated" + a pretend login token per session:
--     A1 admin unlocked · A2 locked ("Lock now") · A3 5 wrong PINs ·
--     A4 signed out · A5 password sign-in 8 days ago · A6 magic link ·
--     D1 desk unlocked · D2 desk locked · D3 desk magic link · anon
--   Days in the past are made as the SQL Editor's role ("postgres"). The
--   10-second Undo-move window is tested by backdating the registration's
--   withdrawn_at as postgres with its stamping trigger switched off around
--   that one statement (so its version stays what the move left).
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0010 and 0014 are applied. You need TWO existing, ACTIVE
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
--   * Passed: one row "ALL 0014 TESTS PASSED".
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
  v_limit date;
  v_role  text;
  v_admin_name text;
  v_desk_name  text;
  v_start_mark bigint;

  v_r      jsonb;
  v_i      integer;
  v_n      integer;
  v_n2     integer;
  v_v      integer;
  v_v2     integer;
  v_txt    text;
  v_who    text;
  v_mark   bigint;
  v_batch  uuid;
  v_pay    uuid;
  v_pay2   uuid;
  v_list   text[];
  v_ids    uuid[];
  v_id     uuid;
  v_row    public.testing_private;

  -- test classes. Worcester: tb "B" (Blue $95 private, Free $0 private;
  -- final award None), ta "A" (Yellow, Orange - $85 private; final award
  -- tb's Blue), tc "C" (Cee $85; final award NOT SET), tr "R" (Gone $70,
  -- removed later; final award None). Shrewsbury: ts "S" (Shr).
  v_ta uuid; v_tb uuid; v_tc uuid; v_tr uuid; v_ts uuid;
  v_ta_yellow uuid; v_ta_orange uuid; v_tb_blue uuid; v_tb_free uuid; v_tc_cee uuid; v_tr_gone uuid; v_ts_shr uuid;
  v_classes jsonb;

  -- the zz test events (Worcester; testing day in 5 days) and their
  -- copies of Yellow
  v_ev uuid; v_ev2 uuid;
  v_e_yellow uuid; v_e2_yellow uuid;

  -- private testings (p...) and event registrations to move (m...)
  v_pv2 uuid; v_p3 uuid; v_p4 uuid; v_p4r uuid; v_p4b uuid; v_p4g uuid; v_p4h uuid;
  v_p5 uuid; v_p5p uuid; v_p5np uuid; v_p5n uuid; v_p5o uuid; v_p5u uuid;
  v_p6a uuid; v_p6z uuid; v_p6u uuid; v_p6v uuid; v_p6w uuid; v_p6e uuid;
  v_p7 uuid; v_p7p uuid; v_p7n uuid; v_p8 uuid;
  v_r6 uuid; v_r6b uuid; v_pm6 uuid; v_pm6b uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid; v_m5 uuid; v_m6 uuid; v_m7 uuid; v_m8 uuid; v_m9 uuid;
  v_m10 uuid; v_m11 uuid; v_m12 uuid; v_m13 uuid; v_m14 uuid; v_m15 uuid; v_md uuid;
  v_pm1 uuid; v_pm2 uuid; v_pm3 uuid; v_pm4 uuid; v_pm5 uuid; v_pm10 uuid; v_pm11 uuid;
  v_pm12 uuid; v_pm13 uuid; v_pm14 uuid; v_pm15 uuid; v_pmd uuid;
  v_m15_first uuid; v_m15_later uuid;
  v_m1_pay uuid; v_m1_rev uuid; v_m10_first uuid; v_m10_second uuid;

  -- catalog
  v_fn      record;
  v_col     text;
  v_priv    text;
  v_tbl     text;
  v_owner   oid;
  v_trigger_fns  text[] := array['testing_private_before_write', 'testing_private_results_before_write',
                                 'testing_private_payments_guard', 'testing_private_log'];
  v_helper_fns   text[] := array['testing_private_time_is_valid', 'testing_private_amount_due', 'testing_private_lock',
                                 'testing_private_lock_payment', 'testing_private_rank_copy'];
  v_staff_fns    text[] := array['testing_private_add', 'testing_private_update', 'testing_private_change_day',
                                 'testing_private_change_paying_by', 'testing_private_mark_paid', 'testing_private_undo_payment',
                                 'testing_private_edit_payment', 'testing_private_cancel', 'testing_private_restore',
                                 'testing_private_delete', 'testing_private_set_result', 'testing_private_set_result_note',
                                 'testing_move_to_private', 'testing_private_undo_move'];
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  select s.role, s.full_name into v_role, v_admin_name from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role, s.full_name into v_role, v_desk_name from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regclass('public.testing_private') is null or to_regclass('public.testing_private_list') is null then
    raise exception 'TEST SETUP: public.testing_private is missing (is 0014 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  select coalesce(max(id), 0) into v_start_mark from public.change_log;
  v_limit := (v_today + interval '1 year')::date;

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

  -- test classes, ranks and two events, made by the admin through the
  -- app's functions
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_tb := (public.testing_add_class('worcester', v_tag || ' B', null, true) ->> 'id')::uuid;
  v_tb_blue := (public.testing_add_rank(v_tb, 'Blue', 7000, 8000, 9500, true, 'solid', 'blue', null, 0, 'yellow') ->> 'id')::uuid;
  v_tb_free := (public.testing_add_rank(v_tb, 'Free', 6500, 7500, 0, true, 'solid', 'red', null, 0, 'yellow') ->> 'id')::uuid;
  v_ta := (public.testing_add_class('worcester', v_tag || ' A', v_tb_blue, false) ->> 'id')::uuid;
  v_ta_yellow := (public.testing_add_rank(v_ta, 'Yellow', 6500, 7500, 8500, false, 'solid', 'yellow', null, 0, 'yellow') ->> 'id')::uuid;
  v_ta_orange := (public.testing_add_rank(v_ta, 'Orange', 6500, 7500, 8500, false, 'solid', 'orange', null, 0, 'yellow') ->> 'id')::uuid;
  v_tc := (public.testing_add_class('worcester', v_tag || ' C', null, false) ->> 'id')::uuid;
  v_tc_cee := (public.testing_add_rank(v_tc, 'Cee', 6500, 7500, 8500, false, 'solid', 'green', null, 0, 'yellow') ->> 'id')::uuid;
  v_tr := (public.testing_add_class('worcester', v_tag || ' R', null, true) ->> 'id')::uuid;
  v_tr_gone := (public.testing_add_rank(v_tr, 'Gone', 6000, 6500, 7000, false, 'solid', 'purple', null, 0, 'yellow') ->> 'id')::uuid;
  v_ts := (public.testing_add_class('shrewsbury', v_tag || ' S', null, true) ->> 'id')::uuid;
  v_ts_shr := (public.testing_add_rank(v_ts, 'Shr', 6500, 7500, 8500, false, 'solid', 'yellow', null, 0, 'yellow') ->> 'id')::uuid;
  if v_ta_orange is null or v_tb_free is null or v_tc_cee is null or v_tr_gone is null or v_ts_shr is null then
    raise exception 'TEST SETUP: could not create the test classes and ranks';
  end if;
  v_classes := jsonb_build_array(jsonb_build_object('class_id', v_ta, 'start_time', '17:00', 'end_time', '18:00'),
                                 jsonb_build_object('class_id', v_tb, 'start_time', '18:00', 'end_time', '19:00'));
  v_ev  := (public.testing_add_event('worcester', v_tag || ' event',  v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  v_ev2 := (public.testing_add_event('worcester', v_tag || ' event2', v_today + 5, v_classes, false, null, null) ->> 'id')::uuid;
  if v_ev is null or v_ev2 is null then
    raise exception 'TEST SETUP: could not create the test events';
  end if;
  reset role;
  select k.id into v_e_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ev and k.rank_id = v_ta_yellow;
  select k.id into v_e2_yellow from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_ev2 and k.rank_id = v_ta_yellow;

  -- the event registrations (added at the desk by the admin, all Yellow)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r6  := (public.testing_add_student(v_ev, 'Mia', 'Moved', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_r6b := (public.testing_add_student(v_ev, 'Max', 'Moved', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m1  := (public.testing_add_student(v_ev, 'Moe', 'One', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m2  := (public.testing_add_student(v_ev, 'Moe', 'Two', v_e_yellow, true, 'card') ->> 'id')::uuid;
  v_m3  := (public.testing_add_student(v_ev, 'Moe', 'Three', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m4  := (public.testing_add_student(v_ev, 'Moe', 'Four', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m5  := (public.testing_add_student(v_ev, 'Moe', 'Five', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m6  := (public.testing_add_student(v_ev, 'Moe', 'Six', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m7  := (public.testing_add_student(v_ev, 'Moe', 'Seven', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m8  := (public.testing_add_student(v_ev, 'Moe', 'Eight', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m9  := (public.testing_add_student(v_ev, 'Moe', 'Nine', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m10 := (public.testing_add_student(v_ev, 'Moe', 'Ten', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m11 := (public.testing_add_student(v_ev, 'Moe', 'Eleven', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m12 := (public.testing_add_student(v_ev, 'Moe', 'Twelve', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m13 := (public.testing_add_student(v_ev, 'Moe', 'Thirteen', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m14 := (public.testing_add_student(v_ev, 'Moe', 'Fourteen', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_m15 := (public.testing_add_student(v_ev, 'Moe', 'Fifteen', v_e_yellow, true, 'cash') ->> 'id')::uuid;
  v_md  := (public.testing_add_student(v_ev2, 'Dee', 'Deleted', v_e2_yellow, true, 'cash') ->> 'id')::uuid;
  -- one private testing for the locked-session checks
  v_pv2 := (public.testing_private_add('worcester', 'Vic', 'Two', v_ta_yellow, true, 'cash', v_today + 1, time '16:00') ->> 'id')::uuid;
  reset role;
  if v_e_yellow is null or v_e2_yellow is null or v_r6 is null or v_r6b is null or v_m1 is null or v_m2 is null
     or v_m3 is null or v_m4 is null or v_m5 is null or v_m6 is null or v_m7 is null or v_m8 is null or v_m9 is null
     or v_m10 is null or v_m11 is null or v_m12 is null or v_m13 is null or v_m14 is null or v_m15 is null or v_md is null or v_pv2 is null then
    raise exception 'TEST SETUP: could not add the test students';
  end if;

  -- ===================================================================
  -- V1. Catalog
  -- ===================================================================
  select c.relowner into v_owner from pg_class c where c.oid = 'public.testing_events'::regclass;
  foreach v_tbl in array array['testing_private', 'testing_private_payments', 'testing_private_results'] loop
    if not exists (select 1 from pg_class c where c.oid = ('public.' || v_tbl)::regclass and c.relrowsecurity and c.relowner = v_owner) then
      raise exception 'TEST FAILED: V1 % must have RLS on and the owner of testing_events', v_tbl;
    end if;
    select count(*) into v_n from pg_policies p
     where p.schemaname = 'public' and p.tablename = v_tbl and p.cmd = 'SELECT'
       and p.policyname = v_tbl || '_select_with_access'
       and p.roles = array['authenticated']::name[] and p.permissive = 'PERMISSIVE' and p.qual like '%has_data_access()%';
    select count(*) into v_n2 from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl;
    if v_n <> 1 or v_n2 <> 1 then
      raise exception 'TEST FAILED: V1 expected exactly one has_data_access read rule on %, found % (of %)', v_tbl, v_n, v_n2;
    end if;
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('anon', 'public.' || v_tbl, v_priv)
         or has_table_privilege('authenticated', 'public.' || v_tbl, v_priv)
         or has_table_privilege('service_role', 'public.' || v_tbl, v_priv)
         or has_table_privilege('public', 'public.' || v_tbl, v_priv)
         or has_table_privilege('testing_registrar', 'public.' || v_tbl, v_priv) then
        raise exception 'TEST FAILED: V1 % has table-wide % for a client role', v_tbl, v_priv;
      end if;
    end loop;
    foreach v_priv in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege('authenticated', 'public.' || v_tbl, v_priv)
         or has_any_column_privilege('anon', 'public.' || v_tbl, v_priv)
         or has_any_column_privilege('service_role', 'public.' || v_tbl, v_priv)
         or has_any_column_privilege('testing_registrar', 'public.' || v_tbl, v_priv) then
        raise exception 'TEST FAILED: V1 a client role has a column % right on %', v_priv, v_tbl;
      end if;
    end loop;
    -- column reads: every column except the login ids, to authenticated only
    for v_col in
      select a.attname::text from pg_attribute a
       where a.attrelid = ('public.' || v_tbl)::regclass and a.attnum > 0 and not a.attisdropped
    loop
      if has_column_privilege('authenticated', 'public.' || v_tbl, v_col, 'SELECT')
         is distinct from (v_col not in ('created_by', 'updated_by', 'cancelled_by', 'recorded_by')) then
        raise exception 'TEST FAILED: V1 authenticated SELECT on %.% is %, not as designed',
          v_tbl, v_col, has_column_privilege('authenticated', 'public.' || v_tbl, v_col, 'SELECT');
      end if;
      if has_column_privilege('anon', 'public.' || v_tbl, v_col, 'SELECT')
         or has_column_privilege('service_role', 'public.' || v_tbl, v_col, 'SELECT')
         or has_column_privilege('testing_registrar', 'public.' || v_tbl, v_col, 'SELECT') then
        raise exception 'TEST FAILED: V1 %.% readable by anon, service_role or testing_registrar', v_tbl, v_col;
      end if;
    end loop;
  end loop;
  -- the view: security_invoker, readable by authenticated only, no login ids
  if not exists (select 1 from pg_class c where c.oid = 'public.testing_private_list'::regclass
                  and 'security_invoker=true' = any (c.reloptions)) then
    raise exception 'TEST FAILED: V1 testing_private_list must be security_invoker = true';
  end if;
  if has_table_privilege('authenticated', 'public.testing_private_list', 'SELECT') is not true
     or has_table_privilege('anon', 'public.testing_private_list', 'SELECT')
     or has_table_privilege('service_role', 'public.testing_private_list', 'SELECT')
     or has_table_privilege('testing_registrar', 'public.testing_private_list', 'SELECT')
     or has_table_privilege('authenticated', 'public.testing_private_list', 'INSERT')
     or has_table_privilege('authenticated', 'public.testing_private_list', 'UPDATE') then
    raise exception 'TEST FAILED: V1 testing_private_list rights are wrong (SELECT for authenticated only)';
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.testing_private_list'::regclass
              and a.attname in ('created_by', 'updated_by', 'cancelled_by', 'recorded_by')) then
    raise exception 'TEST FAILED: V1 testing_private_list must not show a login id';
  end if;
  -- the functions
  v_n := 0;
  for v_fn in
    select p.oid, p.proname::text as name, p.prosecdef, p.proconfig, p.proowner, p.pronargdefaults
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_trigger_fns || v_helper_fns || v_staff_fns || array['testing_restore_student'])
  loop
    v_n := v_n + 1;
    if not coalesce('search_path=""' = any (v_fn.proconfig), false) then
      raise exception 'TEST FAILED: V1 % has no search_path = ''''', v_fn.oid::regprocedure;
    end if;
    if v_fn.pronargdefaults > 0 then
      raise exception 'TEST FAILED: V1 % has argument defaults', v_fn.oid::regprocedure;
    end if;
    if v_fn.proowner <> v_owner then
      raise exception 'TEST FAILED: V1 % is not owned by the owner of testing_events', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE')
       or has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
       or has_function_privilege('testing_registrar', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce((select p.proacl from pg_proc p where p.oid = v_fn.oid),
                                                    acldefault('f', v_fn.proowner))) as a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'TEST FAILED: V1 % is executable by anon, service_role, testing_registrar or PUBLIC', v_fn.oid::regprocedure;
    end if;
    if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
       is distinct from (v_fn.name = any (v_staff_fns || array['testing_restore_student'])) then
      raise exception 'TEST FAILED: V1 authenticated execute on % is wrong', v_fn.oid::regprocedure;
    end if;
    if v_fn.prosecdef is distinct from (v_fn.name = any (v_staff_fns || array['testing_restore_student', 'testing_private_log'])) then
      raise exception 'TEST FAILED: V1 % security definer is %, not as designed', v_fn.oid::regprocedure, v_fn.prosecdef;
    end if;
  end loop;
  if v_n <> cardinality(v_trigger_fns || v_helper_fns || v_staff_fns) + 1 then
    raise exception 'TEST FAILED: V1 expected exactly % functions (one version each), found %',
      cardinality(v_trigger_fns || v_helper_fns || v_staff_fns) + 1, v_n;
  end if;
  select string_agg(x.sig, ', ') into v_txt
    from unnest(array[
      'public.testing_private_time_is_valid(time)', 'public.testing_private_amount_due(uuid)',
      'public.testing_private_lock(uuid)', 'public.testing_private_lock_payment(uuid)',
      'public.testing_private_rank_copy(text, uuid)',
      'public.testing_private_add(text, text, text, uuid, boolean, text, date, time)',
      'public.testing_private_update(uuid, integer, text, text, uuid)',
      'public.testing_private_change_day(uuid, integer, date, time)',
      'public.testing_private_change_paying_by(uuid, integer, text)',
      'public.testing_private_mark_paid(uuid, integer)',
      'public.testing_private_undo_payment(uuid)',
      'public.testing_private_edit_payment(uuid, text, integer, date)',
      'public.testing_private_cancel(uuid, integer)',
      'public.testing_private_restore(uuid, integer)',
      'public.testing_private_delete(uuid, integer, uuid[])',
      'public.testing_private_set_result(uuid, text)',
      'public.testing_private_set_result_note(uuid, text)',
      'public.testing_move_to_private(uuid, integer, date, time)',
      'public.testing_private_undo_move(uuid, integer)',
      'public.testing_restore_student(uuid, integer)']) as x(sig)
   where to_regprocedure(x.sig) is null;
  if v_txt is not null then raise exception 'TEST FAILED: V1 missing function signature(s): %', v_txt; end if;
  -- the triggers
  select string_agg(x.tbl || '.' || x.trg, ', ') into v_txt
    from (values ('testing_private', 'testing_private_before_write', 'testing_private_before_write'),
                 ('testing_private', 'testing_private_log', 'testing_private_log'),
                 ('testing_private', 'testing_private_no_truncate', 'testing_refuse_truncate'),
                 ('testing_private_payments', 'testing_private_payments_guard', 'testing_private_payments_guard'),
                 ('testing_private_payments', 'testing_private_payments_log', 'testing_private_log'),
                 ('testing_private_payments', 'testing_private_payments_no_truncate', 'testing_refuse_truncate'),
                 ('testing_private_results', 'testing_private_results_before_write', 'testing_private_results_before_write'),
                 ('testing_private_results', 'testing_private_results_log', 'testing_private_log'),
                 ('testing_private_results', 'testing_private_results_no_truncate', 'testing_refuse_truncate')) as x(tbl, trg, fn)
   where not exists (
     select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = ('public.' || x.tbl)::regclass and t.tgname = x.trg
        and p.proname = x.fn and t.tgenabled = 'O' and not t.tgisinternal);
  if v_txt is not null then raise exception 'TEST FAILED: V1 missing / wrong / disabled trigger(s): %', v_txt; end if;
  select count(*) into v_n from pg_trigger t
   where t.tgrelid in ('public.testing_private'::regclass, 'public.testing_private_payments'::regclass,
                       'public.testing_private_results'::regclass) and not t.tgisinternal;
  if v_n <> 9 then raise exception 'TEST FAILED: V1 expected exactly 9 triggers on the three tables, found %', v_n; end if;
  -- the rules
  select string_agg(x.con, ', ') into v_txt
    from (values ('testing_private', 'testing_private_pkey', 'p'), ('testing_private', 'testing_private_location_fk', 'f'),
                 ('testing_private', 'testing_private_first_name_check', 'c'), ('testing_private', 'testing_private_last_name_check', 'c'),
                 ('testing_private', 'testing_private_class_name_check', 'c'), ('testing_private', 'testing_private_rank_name_check', 'c'),
                 ('testing_private', 'testing_private_belt_check', 'c'), ('testing_private', 'testing_private_to_check', 'c'),
                 ('testing_private', 'testing_private_cents_check', 'c'), ('testing_private', 'testing_private_paying_by_check', 'c'),
                 ('testing_private', 'testing_private_stripes_check', 'c'), ('testing_private', 'testing_private_time_check', 'c'),
                 ('testing_private', 'testing_private_status_check', 'c'), ('testing_private', 'testing_private_moved_check', 'c'),
                 ('testing_private', 'testing_private_cleared_check', 'c'), ('testing_private', 'testing_private_moved_from_key', 'u'),
                 ('testing_private', 'testing_private_version_check', 'c'),
                 ('testing_private_payments', 'testing_private_payments_pkey', 'p'),
                 ('testing_private_payments', 'testing_private_payments_private_fk', 'f'),
                 ('testing_private_payments', 'testing_private_payments_reverses_fk', 'f'),
                 ('testing_private_payments', 'testing_private_payments_reverses_key', 'u'),
                 ('testing_private_payments', 'testing_private_payments_moved_from_key', 'u'),
                 ('testing_private_payments', 'testing_private_payments_kind_check', 'c'),
                 ('testing_private_payments', 'testing_private_payments_method_check', 'c'),
                 ('testing_private_payments', 'testing_private_payments_moved_from_check', 'c'),
                 ('testing_private_results', 'testing_private_results_pkey', 'p'),
                 ('testing_private_results', 'testing_private_results_private_fk', 'f'),
                 ('testing_private_results', 'testing_private_results_result_check', 'c'),
                 ('testing_private_results', 'testing_private_results_note_check', 'c'),
                 ('testing_private_results', 'testing_private_results_not_empty_check', 'c')) as x(tbl, con, typ)
   where not exists (select 1 from pg_constraint c
                      where c.conrelid = ('public.' || x.tbl)::regclass and c.conname = x.con and c.contype = x.typ);
  if v_txt is not null then raise exception 'TEST FAILED: V1 missing rule(s): %', v_txt; end if;
  if (select count(*) from pg_constraint c
       where c.conname in ('testing_private_payments_private_fk', 'testing_private_results_private_fk')
         and c.confdeltype = 'c' and c.confrelid = 'public.testing_private'::regclass) <> 2 then
    raise exception 'TEST FAILED: V1 the payments and results must point at testing_private, on delete cascade';
  end if;
  -- the desk reads the view, owed amount included (the view doesn't call
  -- the helper, which nobody may run)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select l.amount_due_cents, l.paid_cents into v_n, v_n2 from public.testing_private_list l where l.id = v_pv2;
  if v_n is distinct from 8500 or v_n2 is distinct from 0 then
    raise exception 'TEST FAILED: V1 D1 must read amount_due_cents 8500 / paid_cents 0 from testing_private_list, got % / %', v_n, v_n2;
  end if;
  reset role;

  -- ===================================================================
  -- V2. Locked sessions, anon
  -- ===================================================================
  set local role authenticated;
  v_list := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_d2, v_c_d3];
  for v_i in 1 .. cardinality(v_list) loop
    perform set_config('request.jwt.claims', v_list[v_i], true);
    v_who := 'session ' || v_i || ' of (A2,A3,A4,A5,A6,D2,D3)';
    select count(x.id) into v_n from public.testing_private x;
    select count(x.id) into v_n2 from public.testing_private_list x;
    if v_n <> 0 or v_n2 <> 0 then raise exception 'TEST FAILED: V2 % sees private testings', v_who; end if;
    select count(x.id) into v_n from public.testing_private_payments x;
    select count(x.private_id) into v_n2 from public.testing_private_results x;
    if v_n <> 0 or v_n2 <> 0 then raise exception 'TEST FAILED: V2 % sees private payments / results', v_who; end if;
    foreach v_r in array array[
      public.testing_private_add('worcester', 'Lock', 'Out', v_ta_yellow, true, 'cash', v_today + 1, time '16:00'),
      public.testing_private_update(v_pv2, 1, 'Lock', 'Out', v_ta_yellow),
      public.testing_private_change_day(v_pv2, 1, v_today + 2, time '16:00'),
      public.testing_private_change_paying_by(v_pv2, 1, 'card'),
      public.testing_private_mark_paid(v_pv2, 1),
      public.testing_private_undo_payment(gen_random_uuid()),
      public.testing_private_edit_payment(gen_random_uuid(), 'cash', 100, v_today),
      public.testing_private_cancel(v_pv2, 1),
      public.testing_private_restore(v_pv2, 1),
      public.testing_private_delete(v_pv2, 1, '{}'::uuid[]),
      public.testing_private_set_result(v_pv2, 'pass'),
      public.testing_private_set_result_note(v_pv2, 'x'),
      public.testing_move_to_private(v_m1, 1, v_today + 1, time '16:00'),
      public.testing_private_undo_move(v_pv2, 1)] loop
      if v_r ->> 'status' is distinct from 'no_access' then
        raise exception 'TEST FAILED: V2 % got % instead of no_access', v_who, v_r;
      end if;
    end loop;
  end loop;
  reset role;
  if not exists (select 1 from public.testing_private p where p.id = v_pv2 and p.version = 1 and p.paying_by = 'cash')
     or exists (select 1 from public.testing_private p where p.first_name = 'Lock')
     or not exists (select 1 from public.testing_registrations r where r.id = v_m1 and r.status = 'active') then
    raise exception 'TEST FAILED: V2 the refused calls must change nothing';
  end if;
  -- anon: every function and every table / the view refused
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform 1 from public.testing_private;
        raise exception 'TEST FAILED: V2 anon could read testing_private'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.testing_private_payments;
        raise exception 'TEST FAILED: V2 anon could read testing_private_payments'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.testing_private_results;
        raise exception 'TEST FAILED: V2 anon could read testing_private_results'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.testing_private_list;
        raise exception 'TEST FAILED: V2 anon could read testing_private_list'; exception when insufficient_privilege then null; end;
  begin perform public.testing_private_add('worcester', 'An', 'On', v_ta_yellow, true, 'cash', v_today + 1, time '16:00');
        raise exception 'TEST FAILED: V2 anon could call testing_private_add'; exception when insufficient_privilege then null; end;
  begin perform public.testing_private_mark_paid(v_pv2, 1);
        raise exception 'TEST FAILED: V2 anon could call testing_private_mark_paid'; exception when insufficient_privilege then null; end;
  begin perform public.testing_private_set_result(v_pv2, 'pass');
        raise exception 'TEST FAILED: V2 anon could call testing_private_set_result'; exception when insufficient_privilege then null; end;
  begin perform public.testing_move_to_private(v_m1, 1, v_today + 1, time '16:00');
        raise exception 'TEST FAILED: V2 anon could call testing_move_to_private'; exception when insufficient_privilege then null; end;
  begin perform public.testing_private_undo_move(v_pv2, 1);
        raise exception 'TEST FAILED: V2 anon could call testing_private_undo_move'; exception when insufficient_privilege then null; end;
  begin perform public.testing_private_amount_due(v_pv2);
        raise exception 'TEST FAILED: V2 anon could call testing_private_amount_due'; exception when insufficient_privilege then null; end;
  reset role;
  -- an unlocked admin can't call the helpers, read the login ids, nor write directly
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin perform public.testing_private_amount_due(v_pv2);
        raise exception 'TEST FAILED: V2 A1 could call testing_private_amount_due'; exception when insufficient_privilege then null; end;
  begin perform public.testing_private_lock(v_pv2);
        raise exception 'TEST FAILED: V2 A1 could call testing_private_lock'; exception when insufficient_privilege then null; end;
  begin perform public.testing_private_rank_copy('worcester', v_ta_yellow);
        raise exception 'TEST FAILED: V2 A1 could call testing_private_rank_copy'; exception when insufficient_privilege then null; end;
  begin perform p.created_by from public.testing_private p;
        raise exception 'TEST FAILED: V2 A1 could read testing_private.created_by'; exception when insufficient_privilege then null; end;
  begin perform x.recorded_by from public.testing_private_payments x;
        raise exception 'TEST FAILED: V2 A1 could read testing_private_payments.recorded_by'; exception when insufficient_privilege then null; end;
  begin update public.testing_private set first_name = 'Hack' where id = v_pv2;
        raise exception 'TEST FAILED: V2 A1 could update testing_private directly'; exception when insufficient_privilege then null; end;
  begin insert into public.testing_private_results (private_id, result) values (v_pv2, 'pass');
        raise exception 'TEST FAILED: V2 A1 could insert into testing_private_results'; exception when insufficient_privilege then null; end;
  reset role;

  -- ===================================================================
  -- V3. Add private testing (D1)
  -- ===================================================================
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_add('worcester', '  Ann ', 'Lee  Park', v_ta_yellow, true, 'check', v_today + 3, time '16:30');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 1 or (v_r ->> 'amount_due_cents')::int <> 8500 then
    raise exception 'TEST FAILED: V3 add expected {ok, version 1, amount_due_cents 8500}, got %', v_r;
  end if;
  v_p3 := (v_r ->> 'id')::uuid;
  reset role;
  select * into v_row from public.testing_private p where p.id = v_p3;
  if v_row.first_name <> 'Ann' or v_row.last_name <> 'Lee Park' or v_row.class_id <> v_ta or v_row.class_name <> v_tag || ' A'
     or v_row.rank_id <> v_ta_yellow or v_row.rank_name <> 'Yellow' or v_row.belt_pattern <> 'solid' or v_row.belt_color <> 'yellow'
     or v_row.to_kind <> 'rank' or v_row.to_name <> 'Orange' or v_row.to_belt_color <> 'orange'
     or v_row.private_cents <> 8500 or v_row.paying_by <> 'check' or not v_row.stripes_confirmed
     or v_row.private_date <> v_today + 3 or v_row.private_time <> time '16:30' or v_row.status <> 'active'
     or v_row.version <> 1 or v_row.created_by <> v_desk or v_row.created_by_name <> v_desk_name
     or v_row.moved_from_registration_id is not null or v_row.moved_cleared_no_show then
    raise exception 'TEST FAILED: V3 the added row is not the expected copy: %', to_jsonb(v_row);
  end if;
  select count(*), min(l.action), min(l.op), min(l.location_code) into v_n, v_txt, v_col, v_who
    from public.change_log l where l.id > v_mark and l.record_id = v_p3;
  if v_n <> 1 or v_txt <> 'private_add' or v_col <> 'insert' or v_who <> 'worcester' then
    raise exception 'TEST FAILED: V3 expected one private_add insert history row with the school, got % (% % %)', v_n, v_txt, v_col, v_who;
  end if;
  -- testing for: the last rank -> the final award rank; a None class -> none
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_id := (public.testing_private_add('worcester', 'Ora', 'Last', v_ta_orange, true, 'cash', v_today + 3, time '16:30') ->> 'id')::uuid;
  v_pay := (public.testing_private_add('worcester', 'Fred', 'Free', v_tb_free, true, 'cash', v_today + 3, time '16:30') ->> 'id')::uuid;
  reset role;
  if not exists (select 1 from public.testing_private p where p.id = v_id and p.to_kind = 'rank' and p.to_name = 'Blue' and p.to_belt_color = 'blue')
     or not exists (select 1 from public.testing_private p where p.id = v_pay and p.to_kind = 'none' and p.to_name is null
                     and p.to_belt_pattern is null and p.private_cents = 0) then
    raise exception 'TEST FAILED: V3 testing-for of a last rank (final award / None) is wrong';
  end if;
  -- refusals
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_r in array array[
    public.testing_private_add('boston', 'Ivy', 'Bad', v_ta_yellow, true, 'cash', v_today + 1, time '16:00'),
    public.testing_private_add(null, 'Ivy', 'Bad', v_ta_yellow, true, 'cash', v_today + 1, time '16:00'),
    public.testing_private_add('worcester', '', 'Bad', v_ta_yellow, true, 'cash', v_today + 1, time '16:00'),
    public.testing_private_add('worcester', 'Ivy', repeat('x', 61), v_ta_yellow, true, 'cash', v_today + 1, time '16:00'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', null, true, 'cash', v_today + 1, time '16:00'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, false, 'cash', v_today + 1, time '16:00'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, null, 'cash', v_today + 1, time '16:00'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, true, 'venmo', v_today + 1, time '16:00'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, true, 'cash', null, time '16:00'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, true, 'cash', v_today + 1, null),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, true, 'cash', v_today + 1, time '05:55'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, true, 'cash', v_today + 1, time '22:05'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, true, 'cash', v_today + 1, time '16:03'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, true, 'cash', v_today + 1, time '16:00:30'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ts_shr, true, 'cash', v_today + 1, time '16:00'),
    public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, true, 'cash', v_limit + 1, time '16:00')] loop
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: V3 expected invalid, got %', v_r; end if;
  end loop;
  v_r := public.testing_private_add('worcester', 'Ivy', 'Bad', gen_random_uuid(), true, 'cash', v_today + 1, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V3 missing rank expected stale, got %', v_r; end if;
  v_r := public.testing_private_add('worcester', 'Ivy', 'Bad', v_tc_cee, true, 'cash', v_today + 1, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'final_award_not_set', 'class_name', v_tag || ' C') then
    raise exception 'TEST FAILED: V3 last rank with final award Not set expected final_award_not_set, got %', v_r;
  end if;
  v_r := public.testing_private_add('worcester', 'Ivy', 'Bad', v_ta_yellow, true, 'cash', v_today - 1, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'past_day') then raise exception 'TEST FAILED: V3 yesterday expected past_day, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.testing_private p where p.first_name = 'Ivy') then
    raise exception 'TEST FAILED: V3 a refused add must insert nothing';
  end if;
  -- allowed: today, + 1 year, 06:00, 22:00
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_r in array array[
    public.testing_private_add('worcester', 'Ivo', 'Today', v_ta_yellow, true, 'cash', v_today, time '06:00'),
    public.testing_private_add('worcester', 'Ivo', 'Year', v_ta_yellow, true, 'cash', v_limit, time '22:00')] loop
    if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V3 today 06:00 / + 1 year 22:00 expected ok, got %', v_r; end if;
  end loop;
  reset role;
  -- a Classes and ranks price change afterwards doesn't change the copy
  update public.testing_ranks set private_cents = 9000 where id = v_ta_yellow;
  if not exists (select 1 from public.testing_private p where p.id = v_p3 and p.private_cents = 8500)
     or not exists (select 1 from public.testing_private_list l where l.id = v_p3 and l.amount_due_cents = 8500) then
    raise exception 'TEST FAILED: V3 a later price change in Classes and ranks must not change the copy';
  end if;
  update public.testing_ranks set private_cents = 8500 where id = v_ta_yellow;

  -- ===================================================================
  -- V4. Edit details (D1 unless said)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_p4  := (public.testing_private_add('worcester', 'Eda', 'Edit', v_ta_yellow, true, 'cash', v_today + 2, time '16:00') ->> 'id')::uuid;
  v_p4r := (public.testing_private_add('worcester', 'Rem', 'Oved', v_tr_gone, true, 'cash', v_today + 2, time '16:00') ->> 'id')::uuid;
  v_p4b := (public.testing_private_add('worcester', 'Bea', 'Pricier', v_ta_yellow, true, 'cash', v_today + 2, time '16:00') ->> 'id')::uuid;
  v_p4g := (public.testing_private_add('worcester', 'Gil', 'Graded', v_ta_yellow, true, 'cash', v_today, time '16:00') ->> 'id')::uuid;
  v_p4h := (public.testing_private_add('worcester', 'Hal', 'Over', v_ta_yellow, true, 'cash', v_today, time '16:00') ->> 'id')::uuid;
  -- names only
  v_r := public.testing_private_update(v_p4, 1, ' Eda ', 'Edited', v_ta_yellow);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2, 'amount_due_cents', 8500, 'result_cleared', false) then
    raise exception 'TEST FAILED: V4 name edit expected {ok, 2, 8500, false}, got %', v_r;
  end if;
  -- nothing changed -> nothing written
  reset role;
  select count(*) into v_n from public.change_log l where l.record_id = v_p4;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_update(v_p4, 2, 'Eda', 'Edited', v_ta_yellow);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2, 'amount_due_cents', 8500, 'result_cleared', false) then
    raise exception 'TEST FAILED: V4 nothing changed expected {ok, 2 (unchanged), 8500, false}, got %', v_r;
  end if;
  reset role;
  select count(*) into v_n2 from public.change_log l where l.record_id = v_p4;
  if v_n2 <> v_n then raise exception 'TEST FAILED: V4 an unchanged save must write no history row (% -> %)', v_n, v_n2; end if;
  -- refusals
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_update(v_p4, 2, 'Eda', 'Edited', v_ts_shr);
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V4 another school''s rank expected invalid, got %', v_r; end if;
  v_r := public.testing_private_update(v_p4, 2, 'Eda', 'Edited', gen_random_uuid());
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V4 a missing new rank expected stale, got %', v_r; end if;
  v_r := public.testing_private_update(v_p4, 2, 'Eda', 'Edited', v_tc_cee);
  if v_r ->> 'status' is distinct from 'final_award_not_set' then raise exception 'TEST FAILED: V4 a last rank with final award Not set expected final_award_not_set, got %', v_r; end if;
  v_r := public.testing_private_update(v_p4, 1, 'Eda', 'Edited', v_ta_yellow);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V4 old version expected stale, got %', v_r; end if;
  v_r := public.testing_private_update(gen_random_uuid(), 1, 'Eda', 'Edited', v_ta_yellow);
  if v_r is distinct from jsonb_build_object('status', 'not_found') then raise exception 'TEST FAILED: V4 unknown id expected not_found, got %', v_r; end if;
  v_r := public.testing_private_update(v_p4, 2, '', 'Edited', v_ta_yellow);
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V4 empty name expected invalid, got %', v_r; end if;
  -- a belt change re-copies, with the CURRENT private price (Blue $95)
  v_r := public.testing_private_update(v_p4, 2, 'Eda', 'Edited', v_tb_blue);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 3, 'amount_due_cents', 9500, 'result_cleared', false) then
    raise exception 'TEST FAILED: V4 belt change to Blue expected {ok, 3, 9500, false}, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_private p where p.id = v_p4 and p.class_id = v_tb and p.class_name = v_tag || ' B'
                  and p.rank_id = v_tb_blue and p.rank_name = 'Blue' and p.belt_color = 'blue' and p.to_kind = 'rank'
                  and p.to_name = 'Free' and p.private_cents = 9500) then
    raise exception 'TEST FAILED: V4 the belt change must re-copy class, rank, belt, testing-for and price';
  end if;
  -- a rank removed from Classes and ranks after the copy: sending the
  -- stored id back saves the names and keeps the copy (no lookup)
  delete from public.testing_ranks where id = v_tr_gone;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_update(v_p4r, 1, 'Rem', 'Renamed', v_tr_gone);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2, 'amount_due_cents', 7000, 'result_cleared', false) then
    raise exception 'TEST FAILED: V4 removed rank sent back expected {ok, 2, 7000, false}, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_private p where p.id = v_p4r and p.last_name = 'Renamed' and p.rank_id = v_tr_gone
                  and p.rank_name = 'Gone' and p.class_name = v_tag || ' R' and p.private_cents = 7000) then
    raise exception 'TEST FAILED: V4 the removed rank''s copy must stay as it was';
  end if;
  -- picking a live rank then re-copies
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_update(v_p4r, 2, 'Rem', 'Renamed', v_ta_yellow);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'amount_due_cents')::int <> 8500 then
    raise exception 'TEST FAILED: V4 a live rank after a removed one expected ok 8500, got %', v_r;
  end if;
  -- paid $85, belt to a $95 rank -> $10 owed; back to $85 -> nothing owed
  v_r := public.testing_private_mark_paid(v_p4b, 1);
  if (v_r ->> 'amount_cents')::int is distinct from 8500 then raise exception 'TEST FAILED: V4 setup mark paid 8500 expected, got %', v_r; end if;
  v_r := public.testing_private_update(v_p4b, 2, 'Bea', 'Pricier', v_tb_blue);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 3, 'amount_due_cents', 1000, 'result_cleared', false) then
    raise exception 'TEST FAILED: V4 paid $85 -> $95 rank expected {ok, 3, 1000, false}, got %', v_r;
  end if;
  v_r := public.testing_private_update(v_p4b, 3, 'Bea', 'Pricier', v_ta_yellow);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 4, 'amount_due_cents', 0, 'result_cleared', false) then
    raise exception 'TEST FAILED: V4 back to the $85 rank expected {ok, 4, 0, false}, got %', v_r;
  end if;
  -- graded + belt change -> the result is cleared, same batch
  v_r := public.testing_private_set_result(v_p4g, 'pass');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V4 setup Pass on the private day expected ok, got %', v_r; end if;
  reset role;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_update(v_p4g, 1, 'Gil', 'Graded', v_ta_orange);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2, 'amount_due_cents', 8500, 'result_cleared', true) then
    raise exception 'TEST FAILED: V4 belt change of a graded one expected {ok, 2, 8500, true}, got %', v_r;
  end if;
  reset role;
  select l.batch_id into v_batch from public.change_log l
   where l.id > v_mark and l.table_name = 'testing_private' and l.record_id = v_p4g and l.action = 'private_update';
  if v_batch is null or exists (select 1 from public.testing_private_results x where x.private_id = v_p4g)
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'testing_private_results'
                     and l.record_id = v_p4g and l.action = 'clear_result' and l.op = 'delete' and l.batch_id = v_batch) then
    raise exception 'TEST FAILED: V4 the result must be removed, logged clear_result in the same batch as private_update';
  end if;
  -- after the private day: D1 belt change of a graded one -> not_allowed, A1 ok
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_set_result(v_p4h, 'not_passed');
  reset role;
  update public.testing_private set private_date = v_today - 1 where id = v_p4h;
  select p.version into v_v from public.testing_private p where p.id = v_p4h;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_update(v_p4h, v_v, 'Hal', 'Over', v_ta_orange);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: V4 D1 belt change of a graded one after the private day expected not_allowed, got %', v_r;
  end if;
  v_r := public.testing_private_update(v_p4h, v_v, 'Hal', 'Renamed', v_ta_yellow);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'result_cleared')::boolean then
    raise exception 'TEST FAILED: V4 D1 name-only edit after the private day expected ok, result kept, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_update(v_p4h, v_v + 1, 'Hal', 'Renamed', v_ta_orange);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'result_cleared')::boolean is not true then
    raise exception 'TEST FAILED: V4 A1 belt change of a graded one after the private day expected ok, result_cleared, got %', v_r;
  end if;
  reset role;

  -- ===================================================================
  -- V5. Change day or time (D1)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_p5   := (public.testing_private_add('worcester', 'Cid', 'Change', v_ta_yellow, true, 'cash', v_today + 2, time '16:00') ->> 'id')::uuid;
  v_p5p  := (public.testing_private_add('worcester', 'Pip', 'Passed', v_ta_yellow, true, 'cash', v_today, time '16:00') ->> 'id')::uuid;
  v_p5np := (public.testing_private_add('worcester', 'Nip', 'Notpassed', v_ta_yellow, true, 'cash', v_today, time '16:00') ->> 'id')::uuid;
  v_p5n  := (public.testing_private_add('worcester', 'Ned', 'Noshow', v_ta_yellow, true, 'cash', v_today, time '16:00') ->> 'id')::uuid;
  v_p5o  := (public.testing_private_add('worcester', 'Ona', 'Note', v_ta_yellow, true, 'cash', v_today, time '16:00') ->> 'id')::uuid;
  v_p5u  := (public.testing_private_add('worcester', 'Uno', 'Same', v_ta_yellow, true, 'cash', v_today, time '10:00') ->> 'id')::uuid;
  v_r := public.testing_private_change_day(v_p5, 1, v_today - 1, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'past_day') then raise exception 'TEST FAILED: V5 yesterday expected past_day, got %', v_r; end if;
  v_r := public.testing_private_change_day(v_p5, 1, v_limit + 1, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V5 + 1 year + 1 day expected invalid, got %', v_r; end if;
  v_r := public.testing_private_change_day(v_p5, 1, v_today + 4, time '16:03');
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V5 16:03 expected invalid, got %', v_r; end if;
  v_r := public.testing_private_change_day(v_p5, 1, null, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V5 no day expected invalid, got %', v_r; end if;
  v_r := public.testing_private_change_day(v_p5, 1, v_limit, time '22:00');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2, 'private_date', to_char(v_limit, 'YYYY-MM-DD'),
                                             'private_time', '22:00', 'result_cleared', false) then
    raise exception 'TEST FAILED: V5 change to + 1 year 22:00 expected {ok, 2, ..., false}, got %', v_r;
  end if;
  v_r := public.testing_private_change_day(v_p5, 1, v_today + 4, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V5 old version expected stale, got %', v_r; end if;
  -- Pass / Not passed -> graded
  v_r := public.testing_private_set_result(v_p5p, 'pass');
  v_r := public.testing_private_set_result(v_p5np, 'not_passed');
  v_r := public.testing_private_change_day(v_p5p, 1, v_today + 1, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'graded') then raise exception 'TEST FAILED: V5 Pass expected graded, got %', v_r; end if;
  v_r := public.testing_private_change_day(v_p5np, 1, v_today + 1, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'graded') then raise exception 'TEST FAILED: V5 Not passed expected graded, got %', v_r; end if;
  -- ...and Change how they'll pay is refused after Pass / Not passed too (L5)
  v_r := public.testing_private_change_paying_by(v_p5p, 1, 'card');
  if v_r is distinct from jsonb_build_object('status', 'graded') then raise exception 'TEST FAILED: V5 change paying by after Pass expected graded, got %', v_r; end if;
  v_r := public.testing_private_change_paying_by(v_p5np, 1, 'card');
  if v_r is distinct from jsonb_build_object('status', 'graded') then raise exception 'TEST FAILED: V5 change paying by after Not passed expected graded, got %', v_r; end if;
  -- No show (+ note) -> removed, one batch
  v_r := public.testing_private_set_result(v_p5n, 'no_show');
  v_r := public.testing_private_set_result_note(v_p5n, 'Did not come');
  reset role;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_change_day(v_p5n, 1, v_today + 1, time '16:00');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2, 'private_date', to_char(v_today + 1, 'YYYY-MM-DD'),
                                             'private_time', '16:00', 'result_cleared', true) then
    raise exception 'TEST FAILED: V5 a No show expected {ok, 2, tomorrow, 16:00, true}, got %', v_r;
  end if;
  reset role;
  select l.batch_id into v_batch from public.change_log l
   where l.id > v_mark and l.table_name = 'testing_private' and l.record_id = v_p5n and l.action = 'private_change_day';
  if v_batch is null or exists (select 1 from public.testing_private_results x where x.private_id = v_p5n)
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'testing_private_results'
                     and l.record_id = v_p5n and l.action = 'clear_result' and l.op = 'delete' and l.batch_id = v_batch
                     and l.before ->> 'note' = 'Did not come') then
    raise exception 'TEST FAILED: V5 the No show and its note must be removed, logged clear_result with private_change_day''s batch';
  end if;
  -- a note only stays
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_set_result_note(v_p5o, 'Bring a belt');
  v_r := public.testing_private_change_day(v_p5o, 1, v_today + 1, time '16:00');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'result_cleared')::boolean then
    raise exception 'TEST FAILED: V5 a note only expected ok, result_cleared false, got %', v_r;
  end if;
  -- the same day and time on a No show: nothing written, nothing removed
  v_r := public.testing_private_set_result(v_p5u, 'no_show');
  reset role;
  select count(*) into v_n from public.change_log l where l.record_id = v_p5u;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_change_day(v_p5u, 1, v_today, time '10:00');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 1, 'private_date', to_char(v_today, 'YYYY-MM-DD'),
                                             'private_time', '10:00', 'result_cleared', false) then
    raise exception 'TEST FAILED: V5 the same day and time expected {ok, 1, ..., false}, got %', v_r;
  end if;
  reset role;
  select count(*) into v_n2 from public.change_log l where l.record_id = v_p5u;
  if v_n2 <> v_n or not exists (select 1 from public.testing_private_results x where x.private_id = v_p5u and x.result = 'no_show')
     or not exists (select 1 from public.testing_private_results x where x.private_id = v_p5o and x.note = 'Bring a belt') then
    raise exception 'TEST FAILED: V5 the same day and time must write and remove nothing; a note must stay';
  end if;

  -- ===================================================================
  -- V6. Money
  -- ===================================================================
  -- a moved-in payment: the mover can't undo it with the payment Undo
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_mark_paid(v_r6, 1);
  if (v_r ->> 'amount_cents')::int is distinct from 6500 then raise exception 'TEST FAILED: V6 setup event mark paid 6500 expected, got %', v_r; end if;
  v_r := public.testing_move_to_private(v_r6, 2, v_today + 1, time '16:00');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V6 setup move expected ok, got %', v_r; end if;
  v_pm6 := (v_r ->> 'private_id')::uuid;
  select x.id into v_pay from public.testing_private_payments x where x.private_id = v_pm6;
  v_r := public.testing_private_undo_payment(v_pay);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: V6 D1''s own Undo of a moved-in payment expected not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_undo_payment(v_pay);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V6 A1 Undo of a moved-in payment expected ok, got %', v_r; end if;
  -- Mark paid: the full price, then already_paid; the old version -> stale
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_p6a := (public.testing_private_add('worcester', 'Pay', 'Full', v_ta_yellow, true, 'cash', v_today + 2, time '16:00') ->> 'id')::uuid;
  v_r := public.testing_private_mark_paid(v_p6a, 1);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'amount_cents')::int <> 8500 or v_r ->> 'method' <> 'cash'
     or (v_r ->> 'version')::int <> 2 or v_r ->> 'payment_id' is null then
    raise exception 'TEST FAILED: V6 mark paid expected {ok, 8500, cash, version 2}, got %', v_r;
  end if;
  v_r := public.testing_private_mark_paid(v_p6a, 1);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V6 double mark paid with the old version expected stale, got %', v_r; end if;
  v_r := public.testing_private_mark_paid(v_p6a, 2);
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then raise exception 'TEST FAILED: V6 mark paid when paid expected already_paid, got %', v_r; end if;
  -- the difference after a move ($65 paid -> $20); Change how they'll pay
  -- while owed ok, then already_paid once paid in full
  v_r := public.testing_mark_paid(v_r6b, 1);
  v_r := public.testing_move_to_private(v_r6b, 2, v_today + 1, time '16:00');
  v_pm6b := (v_r ->> 'private_id')::uuid;
  if (v_r ->> 'amount_due_cents')::int is distinct from 2000 then raise exception 'TEST FAILED: V6 move with $65 paid expected 2000 due, got %', v_r; end if;
  v_r := public.testing_private_change_paying_by(v_pm6b, 1, 'card');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 2) then
    raise exception 'TEST FAILED: V6 change paying by while owed expected {ok, 2}, got %', v_r;
  end if;
  v_r := public.testing_private_mark_paid(v_pm6b, 2);
  if (v_r ->> 'amount_cents')::int is distinct from 2000 or v_r ->> 'method' is distinct from 'card' then
    raise exception 'TEST FAILED: V6 mark paid after a move expected the difference 2000 by card, got %', v_r;
  end if;
  v_r := public.testing_private_change_paying_by(v_pm6b, 3, 'check');
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then
    raise exception 'TEST FAILED: V6 change paying by when paid in full expected already_paid, got %', v_r;
  end if;
  -- a $0 private price: already_paid, nothing inserted
  v_p6z := (public.testing_private_add('worcester', 'Zed', 'Zero', v_tb_free, true, 'cash', v_today + 2, time '16:00') ->> 'id')::uuid;
  v_r := public.testing_private_mark_paid(v_p6z, 1);
  if v_r is distinct from jsonb_build_object('status', 'already_paid') then raise exception 'TEST FAILED: V6 $0 price expected already_paid, got %', v_r; end if;
  -- Undo: D1's own within 10 s ok
  v_p6u := (public.testing_private_add('worcester', 'Udo', 'Own', v_ta_yellow, true, 'cash', v_today + 2, time '16:00') ->> 'id')::uuid;
  v_r := public.testing_private_mark_paid(v_p6u, 1);
  v_pay := (v_r ->> 'payment_id')::uuid;
  v_r := public.testing_private_undo_payment(v_pay);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 3) then raise exception 'TEST FAILED: V6 D1 own undo expected {ok, 3}, got %', v_r; end if;
  v_r := public.testing_private_undo_payment(v_pay);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V6 undo twice expected stale, got %', v_r; end if;
  -- another user's payment -> not_allowed for D1
  v_p6v := (public.testing_private_add('worcester', 'Ulf', 'Other', v_ta_yellow, true, 'cash', v_today + 2, time '16:00') ->> 'id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_mark_paid(v_p6v, 1);
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_undo_payment(v_pay);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then raise exception 'TEST FAILED: V6 D1 undo of the admin''s payment expected not_allowed, got %', v_r; end if;
  v_p6w := (public.testing_private_add('worcester', 'Old', 'Payment', v_ta_yellow, true, 'cash', v_today + 2, time '16:00') ->> 'id')::uuid;
  v_p6e := (public.testing_private_add('worcester', 'Edi', 'Payment', v_ta_yellow, true, 'cash', v_today + 2, time '16:00') ->> 'id')::uuid;
  reset role;
  -- a payment of the desk's recorded 11 seconds ago (written as postgres)
  insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
  values (v_p6w, 'payment', 8500, 'cash', v_today, now() - interval '11 seconds', v_desk, v_desk_name)
  returning id into v_pay2;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_undo_payment(v_pay2);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then raise exception 'TEST FAILED: V6 D1 own undo after 10 s expected not_allowed, got %', v_r; end if;
  v_r := public.testing_private_undo_payment(gen_random_uuid());
  if v_r is distinct from jsonb_build_object('status', 'not_found') then raise exception 'TEST FAILED: V6 undo of an unknown payment expected not_found, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_undo_payment(v_pay2);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V6 A1 undo any time expected ok, got %', v_r; end if;
  select x.id into v_pay from public.testing_private_payments x where x.reverses_payment_id = v_pay2;
  v_r := public.testing_private_undo_payment(v_pay);
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V6 undo of a reversal expected invalid, got %', v_r; end if;
  -- Edit payment: D1 not_allowed; A1 ok on the most recent
  v_r := public.testing_private_mark_paid(v_p6e, 1);
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_edit_payment(v_pay, 'card', 8000, v_today);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then raise exception 'TEST FAILED: V6 D1 edit payment expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_edit_payment(v_pay, 'card', 8000, v_today + 1);
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V6 edit payment dated tomorrow expected invalid, got %', v_r; end if;
  v_r := public.testing_private_edit_payment(v_pay, 'card', 8000, v_today);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 3 then raise exception 'TEST FAILED: V6 A1 edit payment expected ok version 3, got %', v_r; end if;
  v_r := public.testing_private_edit_payment(v_pay, 'card', 8000, v_today);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V6 edit of an edited payment expected stale, got %', v_r; end if;
  reset role;
  if (select sum(x.amount_cents) from public.testing_private_payments x where x.private_id = v_p6e) <> 8000
     or not exists (select 1 from public.testing_private_list l where l.id = v_p6e and l.amount_due_cents = 500 and l.paid_method = 'card')
     or exists (select 1 from public.testing_private_payments x where x.private_id = v_p6z)
     or (select sum(x.amount_cents) from public.testing_private_payments x where x.private_id = v_pm6) <> 0
     or not exists (select 1 from public.testing_private_payments x where x.private_id = v_pm6b and x.amount_cents = 6500 and x.method = 'cash') then
    raise exception 'TEST FAILED: V6 the money after the money checks is wrong';
  end if;

  -- ===================================================================
  -- V7. Cancel, Restore, Delete permanently
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_p7  := (public.testing_private_add('worcester', 'Cam', 'Cancel', v_ta_yellow, true, 'cash', v_today + 1, time '16:00') ->> 'id')::uuid;
  v_p7p := (public.testing_private_add('worcester', 'Cap', 'Passed', v_ta_yellow, true, 'cash', v_today, time '16:00') ->> 'id')::uuid;
  v_p7n := (public.testing_private_add('worcester', 'Can', 'Noshow', v_ta_yellow, true, 'cash', v_today, time '16:00') ->> 'id')::uuid;
  v_r := public.testing_private_mark_paid(v_p7, 1);
  v_pay := (v_r ->> 'payment_id')::uuid;
  v_r := public.testing_private_cancel(v_p7, 2);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 3) then raise exception 'TEST FAILED: V7 D1 cancel expected {ok, 3}, got %', v_r; end if;
  v_r := public.testing_private_cancel(v_p7, 3);
  if v_r is distinct from jsonb_build_object('status', 'cancelled') then raise exception 'TEST FAILED: V7 cancel again expected cancelled, got %', v_r; end if;
  v_r := public.testing_private_set_result(v_p7p, 'pass');
  v_r := public.testing_private_cancel(v_p7p, 1);
  if v_r is distinct from jsonb_build_object('status', 'graded') then raise exception 'TEST FAILED: V7 cancel after Pass expected graded, got %', v_r; end if;
  v_r := public.testing_private_set_result(v_p7n, 'no_show');
  v_r := public.testing_private_cancel(v_p7n, 1);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V7 cancel after a No show expected ok, got %', v_r; end if;
  -- every write on a cancelled one -> cancelled
  foreach v_r in array array[
    public.testing_private_update(v_p7, 3, 'Cam', 'Cancel', v_ta_orange),
    public.testing_private_change_day(v_p7, 3, v_today + 2, time '16:00'),
    public.testing_private_change_paying_by(v_p7, 3, 'card'),
    public.testing_private_mark_paid(v_p7, 3),
    public.testing_private_undo_payment(v_pay),
    public.testing_private_set_result(v_p7, 'pass'),
    public.testing_private_set_result_note(v_p7, 'x')] loop
    if v_r is distinct from jsonb_build_object('status', 'cancelled') then
      raise exception 'TEST FAILED: V7 a write on a cancelled one expected cancelled, got %', v_r;
    end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_a1, true);
  foreach v_r in array array[public.testing_private_edit_payment(v_pay, 'card', 100, v_today), public.testing_private_undo_payment(v_pay)] loop
    if v_r is distinct from jsonb_build_object('status', 'cancelled') then
      raise exception 'TEST FAILED: V7 A1 payment change on a cancelled one expected cancelled, got %', v_r;
    end if;
  end loop;
  reset role;
  if not exists (select 1 from public.testing_private_list l where l.id = v_p7 and l.status = 'cancelled' and l.paid_cents = 8500
                  and l.cancelled_by_name = v_desk_name and l.cancelled_at is not null)
     or not exists (select 1 from public.testing_private p where p.id = v_p7 and p.cancelled_by = v_desk) then
    raise exception 'TEST FAILED: V7 a cancelled one keeps its payment and says who cancelled it';
  end if;
  -- Restore: D1 not_allowed; A1 ok while the day is ahead; active -> invalid; past_day after
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_restore(v_p7, 3);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then raise exception 'TEST FAILED: V7 D1 restore expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_restore(v_p7, 3);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', 4) then raise exception 'TEST FAILED: V7 A1 restore expected {ok, 4}, got %', v_r; end if;
  v_r := public.testing_private_restore(v_p7, 4);
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V7 restore of an active one expected invalid, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_private p where p.id = v_p7 and p.status = 'active'
                  and num_nonnulls(p.cancelled_at, p.cancelled_by_name, p.cancelled_by) = 0) then
    raise exception 'TEST FAILED: V7 restore must empty the cancel fields';
  end if;
  update public.testing_private set private_date = v_today - 1 where id = v_p7n;
  select p.version into v_v from public.testing_private p where p.id = v_p7n;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_restore(v_p7n, v_v);
  if v_r is distinct from jsonb_build_object('status', 'past_day') then raise exception 'TEST FAILED: V7 restore after the day expected past_day, got %', v_r; end if;
  reset role;
  -- Delete permanently (v_p7: one payment; a result added as postgres)
  insert into public.testing_private_results (private_id, note) values (v_p7, 'Typed in');
  select array_agg(x.id order by x.id) into v_ids from public.testing_private_payments x where x.private_id = v_p7;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_delete(v_p7, 4, v_ids);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then raise exception 'TEST FAILED: V7 D1 delete expected not_allowed, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  foreach v_r in array array[
    public.testing_private_delete(v_p7, 4, null),
    public.testing_private_delete(v_p7, 4, array[null]::uuid[]),
    public.testing_private_delete(v_p7, 4, v_ids || v_ids)] loop
    if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V7 delete with a bad id list expected invalid, got %', v_r; end if;
  end loop;
  v_r := public.testing_private_delete(v_p7, 4, array[gen_random_uuid()]);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V7 delete with the wrong payment ids expected stale, got %', v_r; end if;
  v_r := public.testing_private_delete(v_p7, 4, '{}'::uuid[]);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V7 delete with no payment ids expected stale, got %', v_r; end if;
  v_r := public.testing_private_delete(v_p7, 3, v_ids);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V7 delete with an old version expected stale, got %', v_r; end if;
  reset role;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_delete(v_p7, 4, v_ids);
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: V7 A1 delete expected ok, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.testing_private p where p.id = v_p7)
     or exists (select 1 from public.testing_private_payments x where x.private_id = v_p7)
     or exists (select 1 from public.testing_private_results x where x.private_id = v_p7) then
    raise exception 'TEST FAILED: V7 delete must remove the row, its payments and its result';
  end if;
  if (select count(distinct l.table_name) from public.change_log l
       where l.id > v_mark and l.action = 'private_delete' and l.op = 'delete' and l.batch_id is not null
         and (l.record_id = v_p7 or l.record_id = any (v_ids))) <> 3 then
    raise exception 'TEST FAILED: V7 the removed row, payment and result must each be logged private_delete';
  end if;

  -- ===================================================================
  -- V8. Grading window from the private day (both functions)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_p8 := (public.testing_private_add('worcester', 'Gus', 'Grade', v_ta_yellow, true, 'cash', v_today + 1, time '16:00') ->> 'id')::uuid;
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_r := public.testing_private_set_result(v_p8, 'pass');
    if v_r is distinct from jsonb_build_object('status', 'not_open') then raise exception 'TEST FAILED: V8 before the private day set_result expected not_open, got %', v_r; end if;
    v_r := public.testing_private_set_result_note(v_p8, 'Early');
    if v_r is distinct from jsonb_build_object('status', 'not_open') then raise exception 'TEST FAILED: V8 before the private day set_result_note expected not_open, got %', v_r; end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_change_day(v_p8, 1, v_today, time '16:00');
  foreach v_txt in array array[v_c_d1, v_c_a1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_r := public.testing_private_set_result(v_p8, case when v_txt = v_c_d1 then 'pass' else 'not_passed' end);
    if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V8 on the private day set_result expected ok, got %', v_r; end if;
    v_r := public.testing_private_set_result_note(v_p8, 'On the day');
    if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'note' is distinct from 'On the day' then
      raise exception 'TEST FAILED: V8 on the private day set_result_note expected ok, got %', v_r;
    end if;
  end loop;
  if v_r ->> 'result' is distinct from 'not_passed' or v_r ->> 'updated_by_name' is distinct from v_admin_name then
    raise exception 'TEST FAILED: V8 the admin''s later result must win, got %', v_r;
  end if;
  v_r := public.testing_private_set_result_note(v_p8, repeat('a', 201));
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V8 a 201-character note expected invalid, got %', v_r; end if;
  v_r := public.testing_private_set_result_note(v_p8, 'x' || repeat(' ', 2000));
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V8 a 2001-character text expected invalid, got %', v_r; end if;
  v_r := public.testing_private_set_result(v_p8, 'passed');
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V8 ''passed'' expected invalid, got %', v_r; end if;
  reset role;
  -- the same value again -> no history row
  select count(*) into v_n from public.change_log l where l.record_id = v_p8 and l.table_name = 'testing_private_results';
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_set_result(v_p8, 'not_passed');
  v_r := public.testing_private_set_result_note(v_p8, 'On the day');
  reset role;
  select count(*) into v_n2 from public.change_log l where l.record_id = v_p8 and l.table_name = 'testing_private_results';
  if v_n2 <> v_n then raise exception 'TEST FAILED: V8 the same value again must write no history row (% -> %)', v_n, v_n2; end if;
  -- after the private day: D1 finished, A1 ok
  update public.testing_private set private_date = v_today - 1 where id = v_p8;
  select p.version into v_v from public.testing_private p where p.id = v_p8;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_set_result(v_p8, 'pass');
  if v_r is distinct from jsonb_build_object('status', 'finished') then raise exception 'TEST FAILED: V8 D1 after the private day set_result expected finished, got %', v_r; end if;
  v_r := public.testing_private_set_result_note(v_p8, 'Late');
  if v_r is distinct from jsonb_build_object('status', 'finished') then raise exception 'TEST FAILED: V8 D1 after the private day set_result_note expected finished, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_set_result(v_p8, 'pass');
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'result' is distinct from 'pass' then raise exception 'TEST FAILED: V8 A1 after the private day expected ok pass, got %', v_r; end if;
  v_r := public.testing_private_set_result(v_p8, null);
  v_r := public.testing_private_set_result_note(v_p8, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'result', null, 'note', null, 'updated_at', null, 'updated_by_name', null) then
    raise exception 'TEST FAILED: V8 clearing both expected {ok, all null}, got %', v_r;
  end if;
  v_r := public.testing_private_set_result(gen_random_uuid(), 'pass');
  if v_r is distinct from jsonb_build_object('status', 'not_found') then raise exception 'TEST FAILED: V8 unknown id expected not_found, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_private p where p.id = v_p8 and p.version = v_v)
     or exists (select 1 from public.testing_private_results x where x.private_id = v_p8) then
    raise exception 'TEST FAILED: V8 grading must never change the version; clearing both removes the row';
  end if;

  -- ===================================================================
  -- V9. Move to private testing (event registrations, D1)
  -- ===================================================================
  -- setup as postgres: payments with old dates, testing-day results
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name)
  values (v_m1, 'payment', 6500, 'cash', v_today - 17, 'Front desk (paper)') returning id into v_m1_pay;
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name)
  values (v_m3, 'payment', 3000, 'cash', v_today - 9, 'x'), (v_m3, 'payment', 3500, 'check', v_today - 2, 'x');
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name)
  values (v_m11, 'payment', 9500, 'card', v_today - 1, 'x');
  insert into public.testing_results (registration_id, result, note) values (v_m4, 'no_show', 'Was sick');
  insert into public.testing_results (registration_id, note) values (v_m5, 'Forms need work');
  insert into public.testing_results (registration_id, result) values (v_m6, 'pass'), (v_m7, 'not_passed');
  select count(*) into v_n from public.testing_registrations r where r.event_id = v_ev and r.status = 'active';
  select coalesce(max(id), 0) into v_mark from public.change_log;
  -- paid $65 on an old day
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_move_to_private(v_m1, 1, v_today + 1, time '15:00');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::int <> 1 or (v_r ->> 'amount_due_cents')::int <> 2000
     or (v_r ->> 'result_cleared')::boolean or (v_r ->> 'registration_version')::int <> 2 then
    raise exception 'TEST FAILED: V9 move with $65 paid expected {ok, version 1, registration_version 2, 2000, false}, got %', v_r;
  end if;
  v_pm1 := (v_r ->> 'private_id')::uuid;
  reset role;
  select x.id into v_m1_rev from public.testing_payments x where x.reverses_payment_id = v_m1_pay;
  if (select sum(x.amount_cents) from public.testing_payments x where x.registration_id = v_m1) <> 0
     or not exists (select 1 from public.testing_payments x where x.id = v_m1_rev and x.kind = 'reversal' and x.amount_cents = -6500
                     and x.method = 'cash' and x.paid_on = v_today - 17 and x.recorded_by = v_desk) then
    raise exception 'TEST FAILED: V9 the event side must net 0 with a reversal dated the original day';
  end if;
  if (select count(*) from public.testing_private_payments x where x.private_id = v_pm1) <> 1
     or not exists (select 1 from public.testing_private_payments x where x.private_id = v_pm1 and x.kind = 'payment'
                     and x.amount_cents = 6500 and x.method = 'cash' and x.paid_on = v_today - 17 and x.moved_from_payment_id = v_m1_pay) then
    raise exception 'TEST FAILED: V9 the private side must have the $65 (same method, original day, moved_from_payment_id)';
  end if;
  select * into v_row from public.testing_private p where p.id = v_pm1;
  if v_row.first_name <> 'Moe' or v_row.last_name <> 'One' or v_row.location_code <> 'worcester' or v_row.class_id <> v_ta
     or v_row.class_name <> v_tag || ' A' or v_row.rank_id <> v_ta_yellow or v_row.rank_name <> 'Yellow'
     or v_row.to_kind <> 'rank' or v_row.to_name <> 'Orange' or v_row.private_cents <> 8500 or v_row.paying_by <> 'cash'
     or v_row.private_date <> v_today + 1 or v_row.private_time <> time '15:00' or v_row.version <> 1
     or v_row.moved_from_event_id <> v_ev or v_row.moved_from_registration_id <> v_m1
     or v_row.moved_from_event_name <> v_tag || ' event' or v_row.moved_cleared_no_show or v_row.moved_registration_version <> 2 then
    raise exception 'TEST FAILED: V9 the moved private testing is not the expected copy: %', to_jsonb(v_row);
  end if;
  if not exists (select 1 from public.testing_registrations r where r.id = v_m1 and r.status = 'withdrawn' and r.withdrawn_reason = 'withdrawn'
                  and r.withdrawn_by = v_desk and r.withdrawn_by_name = v_desk_name and r.withdrawn_at is not null and r.version = 2) then
    raise exception 'TEST FAILED: V9 the registration must be withdrawn by the desk';
  end if;
  select count(*) into v_n2 from public.testing_registrations r where r.event_id = v_ev and r.status = 'active';
  if v_n2 <> v_n - 1 then raise exception 'TEST FAILED: V9 the event''s active count must drop by 1 (% -> %)', v_n, v_n2; end if;
  select min(l.batch_id::text)::uuid into v_batch from public.change_log l where l.id > v_mark;
  if (select count(distinct l.batch_id) from public.change_log l where l.id > v_mark) <> 1
     or exists (select 1 from public.change_log l where l.id > v_mark and (l.action <> 'move_to_private' or l.batch_id is null))
     or (select string_agg(distinct l.table_name, ',' order by l.table_name) from public.change_log l where l.id > v_mark)
        <> 'testing_payments,testing_private,testing_private_payments,testing_registrations' then
    raise exception 'TEST FAILED: V9 every row of the move must be in one move_to_private batch (event payment, registration, private, private payment)';
  end if;
  -- not paid -> nothing moved; two payments -> both moved
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_move_to_private(v_m2, 1, v_today + 1, time '15:00');
  v_pm2 := (v_r ->> 'private_id')::uuid;
  if (v_r ->> 'amount_due_cents')::int is distinct from 8500 then raise exception 'TEST FAILED: V9 move not paid expected 8500 due, got %', v_r; end if;
  v_r := public.testing_move_to_private(v_m3, 1, v_today + 1, time '15:00');
  v_pm3 := (v_r ->> 'private_id')::uuid;
  if (v_r ->> 'amount_due_cents')::int is distinct from 2000 then raise exception 'TEST FAILED: V9 move with two payments expected 2000 due, got %', v_r; end if;
  reset role;
  if exists (select 1 from public.testing_private_payments x where x.private_id = v_pm2)
     or exists (select 1 from public.testing_payments x where x.registration_id = v_m2)
     or not exists (select 1 from public.testing_private p where p.id = v_pm2 and p.paying_by = 'card')
     or (select count(*) from public.testing_private_payments x where x.private_id = v_pm3) <> 2
     or (select sum(x.amount_cents) from public.testing_private_payments x where x.private_id = v_pm3) <> 6500
     or not exists (select 1 from public.testing_private_payments x where x.private_id = v_pm3 and x.amount_cents = 3500
                     and x.method = 'check' and x.paid_on = v_today - 2)
     or (select sum(x.amount_cents) from public.testing_payments x where x.registration_id = v_m3) <> 0 then
    raise exception 'TEST FAILED: V9 not paid moves nothing; two payments both move';
  end if;
  -- a testing-day No show is removed (one batch); a note only stays
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_move_to_private(v_m4, 1, v_today + 1, time '15:00');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'result_cleared')::boolean is not true then
    raise exception 'TEST FAILED: V9 move with a No show expected ok, result_cleared true, got %', v_r;
  end if;
  v_pm4 := (v_r ->> 'private_id')::uuid;
  v_r := public.testing_move_to_private(v_m5, 1, v_today + 1, time '15:00');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'result_cleared')::boolean then
    raise exception 'TEST FAILED: V9 move with a note only expected ok, result_cleared false, got %', v_r;
  end if;
  v_pm5 := (v_r ->> 'private_id')::uuid;
  reset role;
  if exists (select 1 from public.testing_results x where x.registration_id = v_m4)
     or not exists (select 1 from public.testing_private p where p.id = v_pm4 and p.moved_cleared_no_show)
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'testing_results' and l.record_id = v_m4
                     and l.action = 'clear_result' and l.op = 'delete' and l.before ->> 'note' = 'Was sick'
                     and l.batch_id = (select l2.batch_id from public.change_log l2 where l2.id > v_mark
                                        and l2.table_name = 'testing_private' and l2.record_id = v_pm4))
     or not exists (select 1 from public.testing_results x where x.registration_id = v_m5 and x.note = 'Forms need work')
     or exists (select 1 from public.testing_private_results x where x.private_id = v_pm5)
     or exists (select 1 from public.testing_private p where p.id = v_pm5 and p.moved_cleared_no_show) then
    raise exception 'TEST FAILED: V9 a No show is removed with the move''s batch; a note only stays with the registration';
  end if;
  -- refusals
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_withdraw_student(v_m8, 1);
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_move_to_private(v_m6, 1, v_today + 1, time '15:00');
  if v_r is distinct from jsonb_build_object('status', 'has_result') then raise exception 'TEST FAILED: V9 Pass expected has_result, got %', v_r; end if;
  v_r := public.testing_move_to_private(v_m7, 1, v_today + 1, time '15:00');
  if v_r is distinct from jsonb_build_object('status', 'has_result') then raise exception 'TEST FAILED: V9 Not passed expected has_result, got %', v_r; end if;
  v_r := public.testing_move_to_private(v_m8, 2, v_today + 1, time '15:00');
  if v_r is distinct from jsonb_build_object('status', 'withdrawn') then raise exception 'TEST FAILED: V9 a withdrawn registration expected withdrawn, got %', v_r; end if;
  v_r := public.testing_move_to_private(v_m9, 2, v_today + 1, time '15:00');
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V9 old version expected stale, got %', v_r; end if;
  v_r := public.testing_move_to_private(v_m9, 1, v_today - 1, time '15:00');
  if v_r is distinct from jsonb_build_object('status', 'past_day') then raise exception 'TEST FAILED: V9 past day expected past_day, got %', v_r; end if;
  v_r := public.testing_move_to_private(v_m9, 1, v_limit + 1, time '15:00');
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V9 too far expected invalid, got %', v_r; end if;
  v_r := public.testing_move_to_private(v_m9, 1, v_today + 1, time '15:03');
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V9 a bad time expected invalid, got %', v_r; end if;
  v_r := public.testing_move_to_private(gen_random_uuid(), 1, v_today + 1, time '15:00');
  if v_r is distinct from jsonb_build_object('status', 'not_found') then raise exception 'TEST FAILED: V9 unknown registration expected not_found, got %', v_r; end if;
  v_r := public.testing_move_to_private(v_m1, 2, v_today + 1, time '15:00');
  if v_r is distinct from jsonb_build_object('status', 'withdrawn') then raise exception 'TEST FAILED: V9 moving the same registration again expected withdrawn, got %', v_r; end if;
  -- an already-reversed pair stays; only the live payment moves
  v_r := public.testing_mark_paid(v_m10, 1);
  v_m10_first := (v_r ->> 'payment_id')::uuid;
  v_r := public.testing_undo_payment(v_m10_first);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V9 setup event undo expected ok, got %', v_r; end if;
  v_r := public.testing_mark_paid(v_m10, 3);
  v_m10_second := (v_r ->> 'payment_id')::uuid;
  v_r := public.testing_move_to_private(v_m10, 4, v_today + 1, time '15:00');
  v_pm10 := (v_r ->> 'private_id')::uuid;
  if (v_r ->> 'amount_due_cents')::int is distinct from 2000 then raise exception 'TEST FAILED: V9 move after an undone payment expected 2000 due, got %', v_r; end if;
  -- overpaid: $95 paid, $85 price -> everything moves, nothing owed
  v_r := public.testing_move_to_private(v_m11, 1, v_today + 1, time '15:00');
  v_pm11 := (v_r ->> 'private_id')::uuid;
  if (v_r ->> 'amount_due_cents')::int is distinct from 0 then raise exception 'TEST FAILED: V9 overpaid move expected 0 due, got %', v_r; end if;
  reset role;
  if (select count(*) from public.testing_private_payments x where x.private_id = v_pm10) <> 1
     or not exists (select 1 from public.testing_private_payments x where x.private_id = v_pm10 and x.moved_from_payment_id = v_m10_second)
     or (select count(*) from public.testing_payments x where x.reverses_payment_id = v_m10_first) <> 1
     or (select count(*) from public.testing_payments x where x.registration_id = v_m10) <> 4
     or (select sum(x.amount_cents) from public.testing_payments x where x.registration_id = v_m10) <> 0 then
    raise exception 'TEST FAILED: V9 a reversed pair must stay on the event; only the live payment moves';
  end if;
  if (select sum(x.amount_cents) from public.testing_private_payments x where x.private_id = v_pm11) <> 9500
     or not exists (select 1 from public.testing_private_list l where l.id = v_pm11 and l.paid and l.amount_due_cents = 0)
     or exists (select 1 from public.testing_private_payments x where x.private_id = v_pm11 and x.kind = 'reversal') then
    raise exception 'TEST FAILED: V9 an overpaid move keeps all $95, nothing owed, nothing refunded';
  end if;
  -- the order of the payments survives the move and its Undo: $65 paid
  -- 17 days ago, a $20 top-up 3 days ago (as postgres, with their own
  -- recording times) - "the most recent payment" is the $20 on both sides
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name)
  values (v_m15, 'payment', 6500, 'cash', v_today - 17, now() - interval '17 days', 'x') returning id into v_m15_first;
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name)
  values (v_m15, 'payment', 2000, 'card', v_today - 3, now() - interval '3 days', 'x') returning id into v_m15_later;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_move_to_private(v_m15, 1, v_today + 1, time '15:00');
  v_pm15 := (v_r ->> 'private_id')::uuid;
  if (v_r ->> 'amount_due_cents')::int is distinct from 0 then raise exception 'TEST FAILED: V9 setup move of $65 + $20 expected 0 due, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_private_list l
                  join public.testing_private_payments x on x.id = l.last_payment_id
                 where l.id = v_pm15 and x.moved_from_payment_id = v_m15_later
                   and l.paid_on = v_today - 3 and l.paid_method = 'card')
     or not exists (select 1 from public.testing_private_payments x
                     where x.private_id = v_pm15 and x.moved_from_payment_id = v_m15_first
                       and x.recorded_at = now() - interval '17 days') then
    raise exception 'TEST FAILED: V9 after the move the most recent payment must be the $20 (card, 3 days ago), recording times kept';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_undo_move(v_pm15, 1);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V9 undo of the $65 + $20 move expected ok, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_roster t
                  join public.testing_payments x on x.id = t.last_payment_id
                 where t.id = v_m15 and x.amount_cents = 2000 and x.recorded_at = now() - interval '3 days'
                   and t.paid_on = v_today - 3 and t.paid_method = 'card' and t.paid_cents = 8500) then
    raise exception 'TEST FAILED: V9 after Undo move the event''s most recent payment must be the $20 again (card, 3 days ago)';
  end if;
  -- the price: today's Classes and ranks price of the rank, else the event copy's
  update public.testing_ranks set private_cents = 9000 where id = v_ta_yellow;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_move_to_private(v_m12, 1, v_today + 1, time '15:00');
  v_pm12 := (v_r ->> 'private_id')::uuid;
  if (v_r ->> 'amount_due_cents')::int is distinct from 9000 then raise exception 'TEST FAILED: V9 the move must use today''s private price (9000), got %', v_r; end if;
  v_r := public.testing_private_undo_move(v_pm12, 1);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V9 setup undo move expected ok, got %', v_r; end if;
  reset role;
  update public.testing_ranks set private_cents = 8500 where id = v_ta_yellow;

  -- ===================================================================
  -- V9b. The moved registration against the live functions
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_mark_paid(v_m1, 2);
  if v_r is distinct from jsonb_build_object('status', 'withdrawn') then raise exception 'TEST FAILED: V9b live mark paid expected withdrawn, got %', v_r; end if;
  v_r := public.testing_change_paying_by(v_m1, 2, 'card');
  if v_r is distinct from jsonb_build_object('status', 'withdrawn') then raise exception 'TEST FAILED: V9b live change paying by expected withdrawn, got %', v_r; end if;
  v_r := public.testing_set_result(v_m1, 'pass');
  if v_r is distinct from jsonb_build_object('status', 'withdrawn') then raise exception 'TEST FAILED: V9b live set result expected withdrawn, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_undo_payment(v_m1_pay);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V9b live undo of the reversed original expected stale, got %', v_r; end if;
  v_r := public.testing_undo_payment(v_m1_rev);
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V9b live undo of the move''s reversal expected invalid, got %', v_r; end if;
  v_r := public.testing_edit_payment(v_m1_pay, 'card', 6500, v_today);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V9b live edit of the reversed original expected stale, got %', v_r; end if;
  v_r := public.testing_edit_payment(v_m1_rev, 'card', 6500, v_today);
  if v_r is distinct from jsonb_build_object('status', 'invalid') then raise exception 'TEST FAILED: V9b live edit of the move''s reversal expected invalid, got %', v_r; end if;
  -- removing the event after a move: the private testing and its money stay
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_mark_paid(v_md, 1);
  v_r := public.testing_move_to_private(v_md, 2, v_today + 1, time '15:00');
  v_pmd := (v_r ->> 'private_id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select e.version into v_v from public.testing_events e where e.id = v_ev2;
  v_r := public.testing_delete_event(v_ev2, v_v, 1, 0);
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: V9b delete event with the net excluding the moved money expected ok, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_undo_move(v_pmd, 1);
  if v_r is distinct from jsonb_build_object('status', 'not_found') then raise exception 'TEST FAILED: V9b undo move after the event is gone expected not_found, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_private p where p.id = v_pmd and p.moved_from_event_id = v_ev2 and p.moved_from_registration_id = v_md)
     or (select sum(x.amount_cents) from public.testing_private_payments x where x.private_id = v_pmd) <> 6500
     or exists (select 1 from public.testing_registrations r where r.id = v_md) then
    raise exception 'TEST FAILED: V9b after the event is removed the private testing keeps its money and pointers';
  end if;
  -- an admin removes a moved registration: the private money stays
  select array_agg(x.id) into v_ids from public.testing_payments x where x.registration_id = v_m11;
  select r.version into v_v from public.testing_registrations r where r.id = v_m11;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_delete_student(v_m11, v_v, v_ids);
  if v_r is distinct from jsonb_build_object('status', 'ok') then raise exception 'TEST FAILED: V9b A1 delete of the moved registration expected ok, got %', v_r; end if;
  reset role;
  if (select sum(x.amount_cents) from public.testing_private_payments x where x.private_id = v_pm11) <> 9500 then
    raise exception 'TEST FAILED: V9b the private money must stay after the registration is removed';
  end if;

  -- ===================================================================
  -- V10. Restore of a moved registration -> moved
  -- ===================================================================
  select r.version into v_v from public.testing_registrations r where r.id = v_m1;
  set local role authenticated;
  foreach v_txt in array array[v_c_a1, v_c_d1] loop
    perform set_config('request.jwt.claims', v_txt, true);
    v_r := public.testing_restore_student(v_m1, v_v);
    if v_r is distinct from jsonb_build_object('status', 'moved') then
      raise exception 'TEST FAILED: V10 restore of a moved registration (%) expected moved, got %', case when v_txt = v_c_a1 then 'A1' else 'D1' end, v_r;
    end if;
  end loop;
  -- an ordinary withdrawn registration still restores
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_restore_student(v_m8, 2);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V10 restore of an ordinary withdrawn registration expected ok, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_m1 and r.status = 'withdrawn' and r.version = v_v)
     or not exists (select 1 from public.testing_registrations r where r.id = v_m8 and r.status = 'active') then
    raise exception 'TEST FAILED: V10 the refused restore must change nothing; the ordinary one must restore';
  end if;

  -- ===================================================================
  -- V11. Undo move
  -- ===================================================================
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name)
  values (v_m12, 'payment', 6500, 'check', v_today - 3, 'x');
  select r.version into v_v from public.testing_registrations r where r.id = v_m12;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_move_to_private(v_m12, v_v, v_today + 1, time '15:00');
  v_pm12 := (v_r ->> 'private_id')::uuid;
  reset role;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_undo_move(v_pm12, 2);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V11 undo move with an old version expected stale, got %', v_r; end if;
  v_r := public.testing_private_undo_move(v_pm12, 1);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'registration_id')::uuid <> v_m12 or v_r ->> 'registration_version' is null then
    raise exception 'TEST FAILED: V11 D1 undo move within 10 s expected ok, got %', v_r;
  end if;
  reset role;
  if not exists (select 1 from public.testing_registrations r where r.id = v_m12 and r.status = 'active'
                  and num_nonnulls(r.withdrawn_reason, r.withdrawn_at, r.withdrawn_by_name, r.withdrawn_by) = 0
                  and r.version = (v_r ->> 'registration_version')::int)
     or (select sum(x.amount_cents) from public.testing_payments x where x.registration_id = v_m12) <> 6500
     or exists (select 1 from public.testing_private p where p.id = v_pm12)
     or exists (select 1 from public.testing_private_payments x where x.private_id = v_pm12) then
    raise exception 'TEST FAILED: V11 after Undo move: registration active, event net 6500, private testing gone';
  end if;
  select x.id into v_pay from public.testing_payments x
   where x.registration_id = v_m12 and x.kind = 'payment' and x.recorded_by is null and x.paid_on = v_today - 3
     and x.method = 'check' and x.recorded_by_name = v_desk_name and x.recorded_at = now();
  if v_pay is null then raise exception 'TEST FAILED: V11 the event payment must be recreated (original day, method, no recorded_by)'; end if;
  if (select count(distinct l.batch_id) from public.change_log l where l.id > v_mark) <> 1
     or exists (select 1 from public.change_log l where l.id > v_mark and (l.action <> 'undo_move_to_private' or l.batch_id is null))
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'testing_private' and l.op = 'delete')
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'testing_private_payments' and l.op = 'delete')
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'testing_payments' and l.op = 'insert')
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'testing_registrations' and l.op = 'update') then
    raise exception 'TEST FAILED: V11 Undo move must be one undo_move_to_private batch';
  end if;
  -- the recreated event payment can't be own-undone by the desk
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_undo_payment(v_pay);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then
    raise exception 'TEST FAILED: V11 D1 live undo of a recreated event payment expected not_allowed, got %', v_r;
  end if;
  -- after a Mark paid on the private side -> stale
  v_r := public.testing_mark_paid(v_m13, 1);
  v_r := public.testing_move_to_private(v_m13, 2, v_today + 1, time '15:00');
  v_pm13 := (v_r ->> 'private_id')::uuid;
  v_r := public.testing_private_mark_paid(v_pm13, 1);
  v_r := public.testing_private_undo_move(v_pm13, 2);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V11 undo move after a private payment expected stale, got %', v_r; end if;
  -- after the registration was edited (A1 renames it) -> stale
  v_r := public.testing_move_to_private(v_m14, 1, v_today + 1, time '15:00');
  v_pm14 := (v_r ->> 'private_id')::uuid;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_update_student(v_m14, 2, 'Moe', 'Renamed', v_e_yellow);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V11 setup A1 rename of the moved registration expected ok, got %', v_r; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_undo_move(v_pm14, 1);
  if v_r is distinct from jsonb_build_object('status', 'stale') then raise exception 'TEST FAILED: V11 undo move after the registration was edited expected stale, got %', v_r; end if;
  -- a move that cleared a No show -> not_allowed
  v_r := public.testing_private_undo_move(v_pm4, 1);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then raise exception 'TEST FAILED: V11 undo of a move that cleared a No show expected not_allowed, got %', v_r; end if;
  -- not the mover -> not_allowed (admins too)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_private_undo_move(v_pm2, 1);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then raise exception 'TEST FAILED: V11 A1 undo of the desk''s move expected not_allowed, got %', v_r; end if;
  -- a private testing that wasn't moved -> not_found
  v_r := public.testing_private_undo_move(v_p3, 1);
  if v_r is distinct from jsonb_build_object('status', 'not_found') then raise exception 'TEST FAILED: V11 undo move of an added one expected not_found, got %', v_r; end if;
  reset role;
  -- after 10 seconds (the registration's withdrawn_at backdated, its
  -- stamping trigger off for that one statement so the version stays)
  alter table public.testing_registrations disable trigger testing_registrations_before_write;
  update public.testing_registrations set withdrawn_at = now() - interval '11 seconds' where id = v_m5;
  alter table public.testing_registrations enable trigger testing_registrations_before_write;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.testing_private_undo_move(v_pm5, 1);
  if v_r is distinct from jsonb_build_object('status', 'not_allowed') then raise exception 'TEST FAILED: V11 D1 undo move after 10 s expected not_allowed, got %', v_r; end if;
  -- ...and the same desk within 10 seconds on a fresh move -> ok (control)
  v_r := public.testing_private_undo_move(v_pm2, 1);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: V11 D1 undo of its own fresh move expected ok, got %', v_r; end if;
  reset role;
  if not exists (select 1 from public.testing_private p where p.id = v_pm5)
     or not exists (select 1 from public.testing_private p where p.id = v_pm4)
     or not exists (select 1 from public.testing_registrations r where r.id = v_m2 and r.status = 'active') then
    raise exception 'TEST FAILED: V11 the refused undos must change nothing';
  end if;

  -- ===================================================================
  -- V11b. Guards and hygiene (as postgres)
  -- ===================================================================
  select x.id into v_pay from public.testing_private_payments x where x.private_id = v_pm3 order by x.paid_on limit 1;
  begin
    update public.testing_private_payments set amount_cents = 1 where id = v_pay;
    raise exception 'TEST FAILED: V11b a private payment was changed';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
  begin
    delete from public.testing_private_payments where id = v_pay;
    raise exception 'TEST FAILED: V11b a private payment was removed';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
  begin
    insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_by_name, reverses_payment_id)
    values (v_pm3, 'reversal', -1, 'cash', v_today, 'x', v_pay);
    raise exception 'TEST FAILED: V11b a reversal with the wrong amount was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_by_name, reverses_payment_id)
    values (v_pm1, 'reversal', -3000, 'cash', v_today, 'x', v_pay);
    raise exception 'TEST FAILED: V11b a reversal of another private testing''s payment was allowed';
  exception when check_violation then null;
  end;
  foreach v_txt in array array[
    'id = gen_random_uuid()', 'location_code = ''shrewsbury''', 'moved_from_event_id = gen_random_uuid()',
    'moved_from_registration_id = gen_random_uuid()', 'moved_from_event_name = ''x''', 'moved_cleared_no_show = true',
    'moved_registration_version = 99', 'created_at = now() - interval ''1 day''', 'created_by = null', 'created_by_name = ''x''']
  loop
    begin
      execute format('update public.testing_private set %s where id = %L', v_txt, v_pm3);
      raise exception 'TEST FAILED: V11b changing % was allowed', v_txt;
    exception when check_violation then
      get stacked diagnostics v_col = constraint_name;
      if v_col <> 'testing_private_immutable' then raise exception 'TEST FAILED: V11b changing % refused by % instead', v_txt, v_col; end if;
    end;
  end loop;
  foreach v_tbl in array array['testing_private', 'testing_private_payments', 'testing_private_results'] loop
    begin
      execute format('truncate public.%I cascade', v_tbl);
      raise exception 'TEST FAILED: V11b truncate of % was allowed', v_tbl;
    exception when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
    end;
  end loop;
  if not exists (select 1 from public.testing_private_payments x where x.id = v_pay and x.amount_cents = 3000)
     or not exists (select 1 from public.testing_private p where p.id = v_pm3) then
    raise exception 'TEST FAILED: V11b the refused changes must leave everything as it was';
  end if;

  -- ===================================================================
  -- V12. The history
  -- ===================================================================
  select string_agg(x.act, ', ') into v_txt
    from unnest(array['private_add', 'private_update', 'private_change_day', 'private_change_paying_by', 'private_mark_paid',
                      'private_undo_payment', 'private_edit_payment', 'private_cancel', 'private_restore', 'private_delete',
                      'private_set_result', 'private_set_result_note', 'move_to_private', 'undo_move_to_private',
                      'clear_result']) as x(act)
   where not exists (select 1 from public.change_log l
                      where l.id > v_start_mark and l.action = x.act and l.batch_id is not null and l.session_id is not null
                        and l.actor_name in (v_desk_name, v_admin_name));
  if v_txt is not null then raise exception 'TEST FAILED: V12 no logged row (with batch id, session and name) for: %', v_txt; end if;
  if exists (select 1 from public.change_log l
              where l.id > v_start_mark and l.table_name like 'testing_private%' and l.batch_id is null and l.action <> 'manual') then
    raise exception 'TEST FAILED: V12 every private testing history row written by a function needs a batch id';
  end if;
  if exists (select 1 from public.change_log l
              where l.id > v_start_mark and l.table_name = 'testing_private'
                and l.location_code is distinct from 'worcester') then
    raise exception 'TEST FAILED: V12 testing_private history rows must carry the school';
  end if;
  select count(*) into v_n from public.change_log l
   where coalesce(l.before::text, '') || coalesce(l.after::text, '') like '%data:image%';
  if v_n <> 0 then raise exception 'TEST FAILED: V12 % history row(s) contain data:image', v_n; end if;

  reset role;
end;
$$;

select 'ALL 0014 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
