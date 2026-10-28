-- =====================================================================
-- 0029_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0029_finance_reminder_5min.sql
--   (design-review F2 / M8): the close-the-day reminder time may be any
--   5-minute step from 11:00 AM to 11:00 PM (no seconds); Off stays NULL.
--   It checks, in this order:
--     R1  the rule itself: 11:00, 11:05, 22:55, 23:00 allowed (and an old
--         15-minute value, 19:30); 10:55, 23:05, 11:07, 11:05:30 and NULL
--         refused
--     R2  who may call it: nobody but its owner (not public, anon,
--         authenticated or service_role); not security definer; empty
--         search_path; immutable
--     R3  the Settings save, finance_set_reminder_time, as a signed-in
--         admin: 11:05 and 22:55 saved; 11:07, 23:05 and 11:05:30
--         refused ("invalid") and nothing saved; the front desk is
--         refused ("not_allowed")
--     R4  the table rule (finance_reminder_times_time_check): a 5-minute
--         value can be stored, an off-step value cannot, NULL (Off) can
--   Re-running 0029 and "only this one function moved" are checked in
--   supabase/tests/pglite/run.mjs (step0029), because they need a scratch
--   database. Run this in the Supabase SQL Editor AFTER 0029 is applied.
--
-- IS IT SAFE?
--   Yes. One transaction that ends with ROLLBACK: every change (the test
--   sessions, the saved times, the settings version) is undone. NEVER
--   change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0011_tests.sql: test sessions + a pretend login token. The helper
--   pg_temp.t_call(token, call) switches to the "authenticated" role, runs
--   one function call and switches back.
--     A1 admin, unlocked · D1 front desk, unlocked
--
-- BEFORE YOU RUN IT
--   Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--   the UIDs of an ACTIVE admin and the ACTIVE front-desk account
--   (Authentication -> Users).
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0029 TESTS PASSED".
--   Failed: an error starting with "TEST FAILED:" or "TEST SETUP:".
--   Nothing is saved either way. If it failed, run   rollback;   once.
-- =====================================================================

begin;

-- t_call(login token, call): run ONE function call as "authenticated"
-- with that login, then switch back to the SQL Editor's role
create function pg_temp.t_call(p_claims text, p_call text)
returns jsonb
language plpgsql
as $$
declare
  v_r jsonb;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  set local role authenticated;
  begin
    execute 'select ' || p_call into v_r;
  exception
    when others then
      reset role;
      raise;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
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


do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid(); v_d1 uuid := gen_random_uuid();
  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_d1 text;
  v_role text;
  v_fn   text := 'public.finance_reminder_time_is_valid(time)';
  v_txt  text;
  v_r    jsonb;
  v_v    integer;
  v_t    time;
  v_ok   boolean;
  v_n    integer;
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  if to_regprocedure(v_fn) is null or to_regclass('public.finance_reminder_times') is null then
    raise exception 'TEST SETUP: finance_reminder_time_is_valid / finance_reminder_times missing (is 0011 applied?)';
  end if;
  select s.role into v_role from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role into v_role from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if not exists (select 1 from public.finance_reminder_times t where t.location_code = 'worcester' and t.weekday = 1) then
    raise exception 'TEST SETUP: no Worcester Monday row in finance_reminder_times (0011 seeds one)';
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
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;


  -- -------------------------------------------------------------------
  -- R1. The rule itself
  -- -------------------------------------------------------------------
  foreach v_txt in array array['11:00', '11:05', '19:30', '22:55', '23:00'] loop
    perform pg_temp.t_eq('R1 allowed ' || v_txt, public.finance_reminder_time_is_valid(v_txt::time)::text, 'true');
  end loop;
  foreach v_txt in array array['10:55', '23:05', '11:07', '11:05:30', '00:00', '10:59:59'] loop
    perform pg_temp.t_eq('R1 refused ' || v_txt, public.finance_reminder_time_is_valid(v_txt::time)::text, 'false');
  end loop;
  perform pg_temp.t_eq('R1 NULL is false (Off is allowed by the table rule, not here)',
    public.finance_reminder_time_is_valid(null)::text, 'false');
  -- every 5-minute step from 11:00 to 23:00 (145 of them) and nothing in between
  select count(*) filter (where public.finance_reminder_time_is_valid(x::time)) into v_n
    from generate_series(timestamp '2020-01-01 00:00', timestamp '2020-01-01 23:59', interval '1 minute') as x;
  perform pg_temp.t_eq('R1 whole-minute times allowed in one day', v_n::text, '145');


  -- -------------------------------------------------------------------
  -- R2. Who may call it (only inside the database)
  -- -------------------------------------------------------------------
  if has_function_privilege('public', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute')
     or has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'TEST FAILED: R2a finance_reminder_time_is_valid must not be callable by public / anon / authenticated / service_role';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = v_fn::regprocedure and a.grantee <> p.proowner) then
    raise exception 'TEST FAILED: R2b finance_reminder_time_is_valid must have no rights for anyone but its owner';
  end if;
  perform pg_temp.t_eq('R2c security definer / settings / volatility / language',
    (select p.prosecdef::text || ' ' || array_to_string(p.proconfig, ',') || ' ' || p.provolatile::text || ' ' || l.lanname
       from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = v_fn::regprocedure),
    'false search_path="" i sql');
  perform pg_temp.t_eq('R2d owner = the Finance tables'' owner',
    ((select p.proowner from pg_proc p where p.oid = v_fn::regprocedure)
       = (select c.relowner from pg_class c where c.oid = 'public.finance_reminder_times'::regclass))::text, 'true');
  -- and the app really can't call it (permission denied as "authenticated")
  v_ok := false;
  begin
    perform pg_temp.t_call(v_c_a1, 'to_jsonb(public.finance_reminder_time_is_valid(time ''11:05''))');
  exception
    when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.t_eq('R2e an admin login can''t call it directly', v_ok::text, 'true');


  -- -------------------------------------------------------------------
  -- R3. The Settings save (finance_set_reminder_time), Worcester Monday
  -- -------------------------------------------------------------------
  select st.version into v_v from public.finance_settings st limit 1;
  -- start from Off so the first save is a real change
  v_r := pg_temp.t_call(v_c_a1, format('public.finance_set_reminder_time(%L, 1::smallint, null, %s)', 'worcester', v_v));
  perform pg_temp.t_eq('R3 setup: Worcester Monday Off', v_r ->> 'status', 'ok');
  v_v := (v_r ->> 'version')::integer;

  v_r := pg_temp.t_call(v_c_a1, format('public.finance_set_reminder_time(%L, 1::smallint, %L, %s)', 'worcester', '11:05', v_v));
  perform pg_temp.t_eq('R3a admin saves 11:05', (v_r ->> 'status') || '|' || (v_r ->> 'version'), 'ok|' || (v_v + 1));
  v_v := (v_r ->> 'version')::integer;
  perform pg_temp.t_eq('R3a 11:05 is stored', (select t.remind_at::text from public.finance_reminder_times t
    where t.location_code = 'worcester' and t.weekday = 1), '11:05:00');

  foreach v_txt in array array['11:07', '23:05', '10:55', '11:05:30'] loop
    v_r := pg_temp.t_call(v_c_a1, format('public.finance_set_reminder_time(%L, 1::smallint, %L, %s)', 'worcester', v_txt, v_v));
    perform pg_temp.t_eq('R3b admin refused ' || v_txt, v_r ->> 'status', 'invalid');
  end loop;
  perform pg_temp.t_eq('R3b refused saves stored nothing', (select t.remind_at::text from public.finance_reminder_times t
    where t.location_code = 'worcester' and t.weekday = 1), '11:05:00');
  perform pg_temp.t_eq('R3b refused saves left the version alone', (select st.version::text from public.finance_settings st limit 1), v_v::text);

  v_r := pg_temp.t_call(v_c_a1, format('public.finance_set_reminder_time(%L, 1::smallint, %L, %s)', 'worcester', '22:55', v_v));
  perform pg_temp.t_eq('R3c admin saves 22:55', v_r ->> 'status', 'ok');
  v_v := (v_r ->> 'version')::integer;

  v_r := pg_temp.t_call(v_c_d1, format('public.finance_set_reminder_time(%L, 1::smallint, %L, %s)', 'worcester', '11:10', v_v));
  perform pg_temp.t_eq('R3d the front desk can''t change it', v_r ->> 'status', 'not_allowed');


  -- -------------------------------------------------------------------
  -- R4. The table rule (written directly, as the SQL Editor's role)
  -- -------------------------------------------------------------------
  update public.finance_reminder_times t set remind_at = time '13:35'
   where t.location_code = 'shrewsbury' and t.weekday = 1
  returning t.remind_at into v_t;
  perform pg_temp.t_eq('R4a the table accepts 13:35', v_t::text, '13:35:00');
  v_ok := false;
  begin
    update public.finance_reminder_times t set remind_at = time '13:37'
     where t.location_code = 'shrewsbury' and t.weekday = 1;
  exception
    when check_violation then v_ok := true;
  end;
  perform pg_temp.t_eq('R4b the table refuses 13:37', v_ok::text, 'true');
  update public.finance_reminder_times t set remind_at = null
   where t.location_code = 'shrewsbury' and t.weekday = 1
  returning t.remind_at into v_t;
  perform pg_temp.t_eq('R4c the table accepts NULL (Off)', coalesce(v_t::text, 'off'), 'off');
end;
$$;

select 'ALL 0029 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
