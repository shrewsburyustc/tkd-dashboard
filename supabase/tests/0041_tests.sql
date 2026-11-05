-- =====================================================================
-- 0041_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0041_star_end_time.sql (Star
--   testing events get an optional END TIME; rulebook v0.520). It checks,
--   in this order:
--     E1  catalog: the column end_time (time, may be empty) and its table
--         rule star_events_end_time_check; signed-in staff may read it,
--         nobody may write it directly, and anon / service_role / the
--         family form's login star_registrar may not read it (anon is
--         also refused when it really tries); star_add_event and
--         star_update_event exist ONCE each, with p_end_time as their
--         last input (default empty), and the old 7- and 8-input versions
--         are gone; all five functions keep their settings, owner and
--         rights (add / update / Home: signed-in staff only; the family
--         form's star_public_event: star_registrar only; star_public_answer:
--         nobody)
--     E2  star_add_event: without an end time (by position as older tests
--         do, and by NAME without p_end_time as the live app does) ->
--         saved empty; with 12:00 after a 10:00 start -> saved; an end
--         time equal to or before the start, off the 5-minute step
--         (18:03), outside the day (22:05) or with seconds -> invalid,
--         nothing saved; the front desk -> not_allowed
--     E3  star_update_event: same values -> ok, version unchanged,
--         nothing logged (with and without p_end_time); changing ONLY the
--         end time -> version + 1 and exactly one history row (before
--         empty, after 12:00); change it, clear it; moving the start time
--         to or past the saved end time while sending that end time ->
--         invalid, nothing changed; an end time off the step / equal to
--         the start -> invalid; a call by NAME without p_end_time (the
--         old app's Edit event) clears a saved end time (known, 0041's
--         header)
--     E4  the table rule refuses a direct bad row (end = start, end
--         before start, 18:03, 22:05, a start moved past the end) and
--         keeps a good one
--     E5  the answers: star_public_event's event.end_time, star_home_today's
--         events[].end_time and star_public_answer's end_time are "HH:MM"
--         when saved and null when not
--   It makes its own test events ("zz test 1a2b3c4d ..."), so it works
--   whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test events, the candidate,
--   history rows, test sessions). NEVER change the final "rollback;" to
--   "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0006_tests.sql (read its header): "set local role
--   authenticated" + a pretend login token per session. Sessions:
--     A1 admin unlocked · D1 desk unlocked
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0023, 0028 and 0041 are applied. You need TWO existing,
--      ACTIVE staff rows: an admin and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0041 TESTS PASSED".
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

  v_a1 uuid := gen_random_uuid();  v_d1 uuid := gen_random_uuid();

  v_now_s   bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_d1 text;

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();

  v_r     jsonb;
  v_n     integer;
  v_txt   text;
  v_role  text;
  v_case  record;
  v_e     uuid;     -- the event E3 edits (10:00, no end time at first)
  v_e2    uuid;     -- today, 09:00 - 11:30 (E5)
  v_e3    uuid;     -- today, 09:30, no end time (E5)
  v_code2 text;
  v_code3 text;
  v_v     integer;
  v_c     uuid;
  v_mark  bigint;
  v_snap  text;
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
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.star_events'::regclass and a.attname = 'end_time' and not a.attisdropped) then
    raise exception 'TEST SETUP: public.star_events has no end_time column (is 0041 applied?)';
  end if;
  if public.star_start_time_is_valid('06:05') is not true then
    raise exception 'TEST SETUP: star_start_time_is_valid is still 0006''s rule (is 0028 applied?)';
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

  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true then raise exception 'TEST SETUP: A1 has no data access'; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.has_data_access() is not true then raise exception 'TEST SETUP: D1 has no data access'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- E1. Catalog: the column, its rule, the functions and their rights
  -- ===================================================================
  -- a. the column: time, may be empty; read by signed-in staff only, written by nobody
  select format_type(a.atttypid, a.atttypmod) as typ, a.attnotnull, a.atthasdef
    into v_case
    from pg_attribute a where a.attrelid = 'public.star_events'::regclass and a.attname = 'end_time';
  if v_case.typ <> 'time without time zone' or v_case.attnotnull or v_case.atthasdef then
    raise exception 'TEST FAILED: E1a end_time must be a plain time that may be empty (no default), got % notnull=% default=%',
      v_case.typ, v_case.attnotnull, v_case.atthasdef;
  end if;
  if not has_column_privilege('authenticated', 'public.star_events', 'end_time', 'SELECT') then
    raise exception 'TEST FAILED: E1a signed-in staff can''t read end_time';
  end if;
  foreach v_txt in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
    if has_column_privilege('authenticated', 'public.star_events', 'end_time', v_txt) then
      raise exception 'TEST FAILED: E1a authenticated has % on end_time', v_txt;
    end if;
  end loop;
  foreach v_role in array array['anon', 'service_role', 'star_registrar', 'testing_registrar'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role)
       and has_column_privilege(v_role, 'public.star_events', 'end_time', 'SELECT') then
      raise exception 'TEST FAILED: E1a % may read end_time', v_role;
    end if;
  end loop;
  set local role anon;
  begin
    perform e.end_time from public.star_events e limit 1;
    raise exception 'TEST FAILED: E1a anon could read star_events.end_time';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- b. the table rule
  select pg_get_constraintdef(c.oid) into v_txt
    from pg_constraint c
   where c.conrelid = 'public.star_events'::regclass and c.conname = 'star_events_end_time_check' and c.contype = 'c';
  if v_txt is null or v_txt not like '%end_time IS NULL%' or v_txt not like '%star_start_time_is_valid(end_time)%'
     or v_txt not like '%end_time > start_time%' then
    raise exception 'TEST FAILED: E1b star_events_end_time_check missing or different: %', v_txt;
  end if;

  -- c. one version each; p_end_time last, default empty; the old signatures gone
  if to_regprocedure('public.star_add_event(text, date, time, text, boolean, date, text)') is not null
     or to_regprocedure('public.star_update_event(uuid, integer, text, date, time, text, date, text)') is not null then
    raise exception 'TEST FAILED: E1c the old 7-input star_add_event or 8-input star_update_event still exists';
  end if;
  if to_regprocedure('public.star_add_event(text, date, time, text, boolean, date, text, time)') is null
     or to_regprocedure('public.star_update_event(uuid, integer, text, date, time, text, date, text, time)') is null then
    raise exception 'TEST FAILED: E1c the new 8-input star_add_event or 9-input star_update_event is missing';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('star_add_event', 'star_update_event', 'star_public_answer', 'star_home_today', 'star_public_event');
  if v_n <> 5 then raise exception 'TEST FAILED: E1c expected exactly one version of each of the five functions, found %', v_n; end if;
  for v_case in
    select p.oid::regprocedure::text as sig, p.proname::text as name, p.prosecdef, p.proconfig, p.pronargs, p.pronargdefaults,
           p.proargnames, p.provolatile, p.proowner, p.prorettype::regtype::text as rettype, p.proacl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('star_add_event', 'star_update_event', 'star_public_answer', 'star_home_today', 'star_public_event')
  loop
    if not coalesce('search_path=""' = any (v_case.proconfig), false) or v_case.rettype <> 'jsonb'
       or v_case.proowner <> (select c.relowner from pg_class c where c.oid = 'public.star_events'::regclass) then
      raise exception 'TEST FAILED: E1c % search_path / return type / owner wrong', v_case.sig;
    end if;
    if v_case.prosecdef is distinct from (v_case.name <> 'star_public_answer')
       or v_case.provolatile <> (case when v_case.name in ('star_public_answer', 'star_public_event') then 's' else 'v' end) then
      raise exception 'TEST FAILED: E1c % security definer / volatility not as before 0041', v_case.sig;
    end if;
    if v_case.name in ('star_add_event', 'star_update_event') then
      if v_case.pronargdefaults <> 1 or v_case.proargnames[v_case.pronargs] <> 'p_end_time' then
        raise exception 'TEST FAILED: E1c % must end with p_end_time, the only input with a default', v_case.sig;
      end if;
    elsif v_case.pronargdefaults <> 0 then
      raise exception 'TEST FAILED: E1c % has argument defaults', v_case.sig;
    end if;
    if exists (select 1 from aclexplode(coalesce(v_case.proacl, acldefault('f', v_case.proowner))) a where a.grantee = 0) then
      raise exception 'TEST FAILED: E1c PUBLIC can run %', v_case.sig;
    end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'star_registrar', 'testing_registrar'] loop
      if exists (select 1 from pg_roles r where r.rolname = v_role)
         and has_function_privilege(v_role, v_case.sig::regprocedure, 'EXECUTE')
             is distinct from (case v_case.name
                                 when 'star_public_event'  then v_role = 'star_registrar'
                                 when 'star_public_answer' then false
                                 else v_role = 'authenticated' end) then
        raise exception 'TEST FAILED: E1c % execute right for % is %', v_case.sig, v_role,
          has_function_privilege(v_role, v_case.sig::regprocedure, 'EXECUTE');
      end if;
    end loop;
  end loop;

  -- ===================================================================
  -- E2. star_add_event
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- a. no end time: by position (7 inputs, as 0006 / 0028 tests call it) ...
  v_r := public.star_add_event(v_tag || ' Plain', v_today + 9, '10:00', 'worcester', false, null, null);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: E2a add_event without an end time expected ok, got %', v_r; end if;
  v_e := (v_r ->> 'id')::uuid;
  -- ... and by NAME without p_end_time, exactly as the live app calls it
  v_r := public.star_add_event(p_name => v_tag || ' Named', p_testing_date => v_today + 9, p_start_time => '10:00',
                               p_where_code => 'shrewsbury', p_registration_open => false, p_auto_close_on => null, p_note => null);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: E2a add_event by name without p_end_time expected ok, got %', v_r; end if;
  -- b. with an end time after the start
  v_r := public.star_add_event(v_tag || ' Ends', v_today + 9, '10:00', 'worcester', false, null, null, '12:00');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: E2b add_event 10:00 - 12:00 expected ok, got %', v_r; end if;
  v_r := public.star_add_event(p_name => v_tag || ' Ends named', p_testing_date => v_today + 9, p_start_time => '21:55',
                               p_where_code => 'worcester', p_registration_open => false, p_auto_close_on => null, p_note => null,
                               p_end_time => '22:00');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: E2b add_event 9:55 PM - 10:00 PM by name expected ok, got %', v_r; end if;
  -- c. bad end times: equal, earlier, off the step, outside the day, seconds
  foreach v_txt in array array['10:00', '09:55', '06:00', '18:03', '22:05', '12:00:30'] loop
    v_r := public.star_add_event(v_tag || ' bad ' || v_txt, v_today + 9, '10:00', 'worcester', false, null, null, v_txt::time);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: E2c add_event 10:00 ending % expected invalid, got %', v_txt, v_r;
    end if;
  end loop;
  -- d. the front desk may not add events (unchanged by 0041)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_add_event(v_tag || ' Desk', v_today + 9, '10:00', 'worcester', false, null, null, '12:00');
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: E2d the desk''s add_event expected not_allowed, got %', v_r;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select string_agg(e.name || '=' || coalesce(left(e.end_time::text, 5), '-'), ', ' order by e.name collate "C") into v_txt
    from public.star_events e where e.name like v_tag || '%';
  if v_txt is distinct from v_tag || ' Ends=12:00, ' || v_tag || ' Ends named=22:00, ' || v_tag || ' Named=-, ' || v_tag || ' Plain=-' then
    raise exception 'TEST FAILED: E2 the saved events / end times are wrong: %', v_txt;
  end if;

  -- ===================================================================
  -- E3. star_update_event
  -- ===================================================================
  select e.version into v_v from public.star_events e where e.id = v_e;
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);

  -- a. same values (no end time, none sent; then null sent) -> ok, nothing written
  v_r := public.star_update_event(v_e, v_v, v_tag || ' Plain', v_today + 9, '10:00', 'worcester', null, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v) then
    raise exception 'TEST FAILED: E3a same values (no p_end_time) expected {ok, %}, got %', v_v, v_r;
  end if;
  v_r := public.star_update_event(p_event_id => v_e, p_expected_version => v_v, p_name => v_tag || ' Plain',
                                  p_testing_date => v_today + 9, p_start_time => '10:00', p_where_code => 'worcester',
                                  p_auto_close_on => null, p_note => null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v) then
    raise exception 'TEST FAILED: E3a same values by name (no p_end_time) expected {ok, %}, got %', v_v, v_r;
  end if;
  v_r := public.star_update_event(v_e, v_v, v_tag || ' Plain', v_today + 9, '10:00', 'worcester', null, null, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v) then
    raise exception 'TEST FAILED: E3a same values (p_end_time null) expected {ok, %}, got %', v_v, v_r;
  end if;
  reset role;
  if exists (select 1 from public.change_log l where l.id > v_mark)
     or (select e.version from public.star_events e where e.id = v_e) <> v_v then
    raise exception 'TEST FAILED: E3a a save with the same values wrote something';
  end if;

  -- b. ONLY the end time changes -> version + 1, one history row
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_update_event(v_e, v_v, v_tag || ' Plain', v_today + 9, '10:00', 'worcester', null, null, '12:00');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: E3b adding an end time expected {ok, %}, got %', v_v + 1, v_r;
  end if;
  reset role;
  select count(*) into v_n from public.change_log l where l.id > v_mark;
  if v_n <> 1 then raise exception 'TEST FAILED: E3b expected exactly 1 history row, found %', v_n; end if;
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.table_name = 'star_events' and l.op = 'update'
                    and l.action = 'star_update_event' and l.actor_id = v_admin and l.session_id = v_a1
                    and l.record_id = v_e and l.batch_id is not null
                    -- the history keeps only what changed: the end time (and the version)
                    and l.before = jsonb_build_object('version', v_v, 'end_time', null)
                    and l.after = jsonb_build_object('version', v_v + 1, 'end_time', '12:00:00')) then
    raise exception 'TEST FAILED: E3b the history row is wrong: %',
      (select jsonb_agg(to_jsonb(l)) from public.change_log l where l.id > v_mark);
  end if;
  v_v := v_v + 1;

  -- c. the same values again (end time 12:00 sent) -> nothing written
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_update_event(v_e, v_v, v_tag || ' Plain', v_today + 9, '10:00', 'worcester', null, null, '12:00');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v) then
    raise exception 'TEST FAILED: E3c same values with the end time expected {ok, %}, got %', v_v, v_r;
  end if;
  reset role;
  if exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: E3c a save with the same end time wrote history';
  end if;

  -- d. the start time moved to / past the saved end time (that end time sent) -> invalid, nothing changed;
  --    bad end times -> invalid
  select row(e.*)::text into v_snap from public.star_events e where e.id = v_e;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  foreach v_txt in array array['12:00', '12:30'] loop
    v_r := public.star_update_event(v_e, v_v, v_tag || ' Plain', v_today + 9, v_txt::time, 'worcester', null, null, '12:00');
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: E3d start % with the end 12:00 expected invalid, got %', v_txt, v_r;
    end if;
  end loop;
  foreach v_txt in array array['10:00', '09:00', '13:03', '22:05', '12:00:30'] loop
    v_r := public.star_update_event(v_e, v_v, v_tag || ' Plain', v_today + 9, '10:00', 'worcester', null, null, v_txt::time);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: E3d start 10:00 ending % expected invalid, got %', v_txt, v_r;
    end if;
  end loop;
  reset role;
  if (select row(e.*)::text from public.star_events e where e.id = v_e) is distinct from v_snap
     or exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: E3d a refused save changed the event or wrote history';
  end if;

  -- e. change the end time, then the start time together with it, then clear it
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_update_event(v_e, v_v, v_tag || ' Plain', v_today + 9, '10:00', 'worcester', null, null, '13:30');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: E3e changing the end time to 13:30 expected {ok, %}, got %', v_v + 1, v_r;
  end if;
  v_r := public.star_update_event(v_e, v_v + 1, v_tag || ' Plain', v_today + 9, '14:00', 'worcester', null, null, '15:15');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 2) then
    raise exception 'TEST FAILED: E3e moving to 14:00 - 15:15 expected {ok, %}, got %', v_v + 2, v_r;
  end if;
  reset role;
  if (select e.start_time from public.star_events e where e.id = v_e) <> time '14:00'
     or (select e.end_time from public.star_events e where e.id = v_e) is distinct from time '15:15' then
    raise exception 'TEST FAILED: E3e 14:00 - 15:15 was not saved';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_update_event(v_e, v_v + 2, v_tag || ' Plain', v_today + 9, '14:00', 'worcester', null, null, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 3) then
    raise exception 'TEST FAILED: E3e clearing the end time expected {ok, %}, got %', v_v + 3, v_r;
  end if;
  reset role;
  if (select e.end_time from public.star_events e where e.id = v_e) is not null then
    raise exception 'TEST FAILED: E3e the end time was not cleared';
  end if;
  v_v := v_v + 3;

  -- f. the old app's Edit event (by name, no p_end_time) clears a saved end time - known, 0041's header
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_update_event(v_e, v_v, v_tag || ' Plain', v_today + 9, '14:00', 'worcester', null, null, '16:00');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1) then
    raise exception 'TEST FAILED: E3f setting 16:00 expected {ok, %}, got %', v_v + 1, v_r;
  end if;
  v_r := public.star_update_event(p_event_id => v_e, p_expected_version => v_v + 1, p_name => v_tag || ' Plain',
                                  p_testing_date => v_today + 9, p_start_time => '14:00', p_where_code => 'worcester',
                                  p_auto_close_on => null, p_note => null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 2) then
    raise exception 'TEST FAILED: E3f the old app''s Edit (by name, no p_end_time) expected {ok, %}, got %', v_v + 2, v_r;
  end if;
  reset role;
  if (select e.end_time from public.star_events e where e.id = v_e) is not null then
    raise exception 'TEST FAILED: E3f the old app''s Edit did not clear the end time';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- E4. The table rule (a direct write as "postgres", past every
  --     function's checks)
  -- ===================================================================
  update public.star_events set start_time = '10:00', end_time = '12:00' where id = v_e;
  if (select e.end_time from public.star_events e where e.id = v_e) is distinct from time '12:00' then
    raise exception 'TEST FAILED: E4 the table rule refused 10:00 - 12:00';
  end if;
  foreach v_txt in array array['10:00', '09:00', '18:03', '22:05', '12:00:30'] loop
    begin
      update public.star_events set end_time = v_txt::time where id = v_e;
      raise exception 'TEST FAILED: E4 the table rule accepted 10:00 ending %', v_txt;
    exception when check_violation then null;
    end;
  end loop;
  begin
    update public.star_events set start_time = '12:30' where id = v_e;
    raise exception 'TEST FAILED: E4 the table rule accepted a start time (12:30) after the end time (12:00)';
  exception when check_violation then null;
  end;
  update public.star_events set end_time = null where id = v_e;
  if (select e.end_time from public.star_events e where e.id = v_e) is not null then
    raise exception 'TEST FAILED: E4 the table rule refused an empty end time';
  end if;

  -- ===================================================================
  -- E5. The answers: "HH:MM" when saved, null when not
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' Today ends', v_today, '09:00', 'worcester', true, null, null, '11:30');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: E5 add_event today 9:00 - 11:30 answered %', v_r; end if;
  v_e2 := (v_r ->> 'id')::uuid;  v_code2 := v_r ->> 'public_code_shrewsbury';
  v_r := public.star_add_event(v_tag || ' Today open end', v_today, '09:30', 'shrewsbury', true, null, null);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: E5 add_event today 9:30 answered %', v_r; end if;
  v_e3 := (v_r ->> 'id')::uuid;  v_code3 := v_r ->> 'public_code_worcester';

  -- a. Home's Today card (signed-in staff)
  v_r := public.star_home_today();
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: E5a star_home_today answered %', v_r; end if;
  select x into v_case from jsonb_array_elements(v_r -> 'events') as x where x ->> 'id' = v_e2::text;
  if v_case is null or v_case.x ->> 'start_time' <> '09:00' or v_case.x -> 'end_time' is distinct from '"11:30"'::jsonb then
    raise exception 'TEST FAILED: E5a Home''s event 9:00 - 11:30 expected end_time "11:30", got %', v_case;
  end if;
  select x into v_case from jsonb_array_elements(v_r -> 'events') as x where x ->> 'id' = v_e3::text;
  if v_case is null or v_case.x ->> 'start_time' <> '09:30' or v_case.x -> 'end_time' is distinct from 'null'::jsonb then
    raise exception 'TEST FAILED: E5a Home''s event with no end time expected end_time null, got %', v_case;
  end if;

  -- a candidate on the 9:00 - 11:30 event, for star_public_answer (b)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_add_candidate(v_e2, 'Eda', 'Endtime', (v_today - interval '30 years')::date, 'eda@example.com', 'shrewsbury', 1, 0, 'cash');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: E5 add_candidate answered %', v_r; end if;
  v_c := (v_r ->> 'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- b. the "You're registered" answer (internal: run here as its owner, as star_public_register does)
  v_r := public.star_public_answer(v_c);
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'start_time' <> '09:00' or v_r -> 'end_time' is distinct from '"11:30"'::jsonb then
    raise exception 'TEST FAILED: E5b star_public_answer expected start 09:00 and end_time "11:30", got %', v_r;
  end if;
  update public.star_events set end_time = null where id = v_e2;
  v_r := public.star_public_answer(v_c);
  if v_r -> 'end_time' is distinct from 'null'::jsonb or not (v_r ? 'end_time') then
    raise exception 'TEST FAILED: E5b star_public_answer with no end time expected end_time null, got %', v_r -> 'end_time';
  end if;
  update public.star_events set end_time = '11:30' where id = v_e2;

  -- c. the family form's first answer (star_registrar's function; run here as its owner)
  v_r := public.star_public_event(v_code2);
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'event' ->> 'start_time' <> '09:00'
     or v_r -> 'event' -> 'end_time' is distinct from '"11:30"'::jsonb then
    raise exception 'TEST FAILED: E5c star_public_event expected event start 09:00 and end_time "11:30", got %', v_r -> 'event';
  end if;
  v_r := public.star_public_event(v_code3);
  if v_r ->> 'status' is distinct from 'ok' or v_r -> 'event' ->> 'start_time' <> '09:30'
     or not (v_r -> 'event' ? 'end_time') or v_r -> 'event' -> 'end_time' is distinct from 'null'::jsonb then
    raise exception 'TEST FAILED: E5c star_public_event with no end time expected end_time null, got %', v_r -> 'event';
  end if;
  -- still nothing extra for the family: no ids, no counts
  if v_r -> 'event' ? 'id' or v_r ? 'counts' or v_r -> 'event' ? 'counts' then
    raise exception 'TEST FAILED: E5c star_public_event shows an id or counts';
  end if;

  raise notice 'ALL 0041 TESTS PASSED';
end
$$;

select 'ALL 0041 TESTS PASSED' as result;

rollback;
