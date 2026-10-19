-- =====================================================================
-- 0012_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0012_prospects.sql (Prospects):
--   prospects made automatically from sign-ups (one per child, New or
--   Booked), who can read and work them (only unlocked staff sessions),
--   the list never showing contact details, search by phone digits,
--   status / note / follow-up rules, check in and "did they come?",
--   booking / changing / cancelling a free class from the panel (the
--   SHARED spot limit of 0009), each school's own statuses (only admins
--   delete one), deleting a prospect (admins; the family's sign-up goes
--   with its last child), the 2-year clean-up, the per-person badge, and a
--   catalog section that checks the permissions on everything 0012 adds.
--   Run it in the Supabase SQL Editor AFTER 0012 is applied.
--
-- IS IT SAFE?
--   Yes. One transaction that ends with ROLLBACK: every change is undone.
--   NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same sessions as 0009 (A1 admin unlocked, A2-A7 shut out in different
--   ways, D1 front desk, anon). The functions check the session (the
--   claims), so most tests call them as the SQL Editor's own role, which
--   can also look at the tables to check the result; the role
--   "authenticated" is used where the PERMISSIONS themselves are tested
--   (Test 2, the catalog), like 0009's public functions.
--
-- BEFORE YOU RUN IT
--   Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--   the UIDs of an ACTIVE admin and the ACTIVE front-desk account.
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0012 TESTS PASSED".
--   Failed: an error starting with "TEST FAILED:" or "TEST SETUP:".
--   Nothing is saved either way. If it failed, run   rollback;   once.
-- =====================================================================

begin;

do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid(); v_a2 uuid := gen_random_uuid(); v_a3 uuid := gen_random_uuid();
  v_a4 uuid := gen_random_uuid(); v_a5 uuid := gen_random_uuid(); v_a6 uuid := gen_random_uuid();
  v_a7 uuid := gen_random_uuid(); v_d1 uuid := gen_random_uuid();
  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_2h  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 2 * 3600));
  v_amr_8d  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 8 * 24 * 3600));
  v_amr_otp jsonb := jsonb_build_array(jsonb_build_object('method', 'otp',      'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_a2 text; v_c_a3 text; v_c_a4 text; v_c_a5 text; v_c_a6 text; v_c_a7 text; v_c_d1 text;
  v_shut  text[];
  v_c_anon text := '{"role": "anon"}';

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_slug  text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_today date;
  v_day   date;
  v_dow   smallint;
  v_role  text;
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg' || repeat('A', 200) || '==';

  v_r     jsonb;
  v_n     integer;
  v_txt   text;
  v_bool  boolean;
  v_rand  uuid := gen_random_uuid();
  v_ver   integer;
  v_prev  uuid;

  v_cw1 uuid; v_vw uuid; v_vt uuid;
  v_f1 uuid; v_f1_v integer; v_pub integer; v_fields jsonb;
  v_ans jsonb;
  v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_p0 uuid; v_p1 uuid; v_p3 uuid;
  v_st_new uuid; v_st_booked uuid; v_st_came uuid; v_st_joined uuid; v_st_noshow uuid; v_st_contacted uuid; v_st_custom uuid;
  v_fn record;
  v_tbl text;
  v_staff_fns text[] := array['prospects_list', 'prospects_search', 'prospects_get', 'prospects_badge', 'prospects_for_bookings',
                              'prospects_set_status', 'prospects_add_note', 'prospects_set_follow_up', 'prospects_mark_opened',
                              'prospects_check_in', 'prospects_undo_check_in', 'prospects_open_times', 'prospects_book_time',
                              'prospects_cancel_time', 'prospect_statuses_add', 'prospect_statuses_update', 'prospect_statuses_reorder',
                              'prospect_statuses_delete', 'prospects_delete'];
  v_helper_fns text[] := array['prospects_seed_statuses', 'prospects_status_of', 'prospects_log', 'prospects_class_ran',
                               'prospects_lock_slot', 'prospects_before_write', 'prospects_refuse_change', 'prospects_from_submission',
                               'prospects_follow_booking', 'prospects_purge_old', 'prospects_lock'];
begin
  -- -------------------------------------------------------------------
  -- Setup (as postgres)
  -- -------------------------------------------------------------------
  select s.role into v_role from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role into v_role from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regclass('public.prospects') is null then raise exception 'TEST SETUP: 0012 is not applied'; end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id)
  select x, v_admin from unnest(array[v_a1, v_a2, v_a3, v_a5, v_a6, v_a7]) as x
  union all select v_d1, v_desk;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'), (v_a2, v_admin, now() - interval '1 minute'),
    (v_a3, v_admin, now() + interval '30 minutes'), (v_a4, v_admin, now() + interval '30 minutes'),
    (v_a5, v_admin, now() + interval '30 minutes'), (v_a6, v_admin, now() + interval '30 minutes'),
    (v_a7, v_admin, to_timestamp(v_now_s - 2 * 3600) + interval '45 minutes'), (v_d1, v_desk, now() + interval '30 minutes');
  insert into public.pin_attempts (session_id, staff_id, failed, locked_at) values (v_a3, v_admin, 5, now());
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_a3 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a3, 'amr', v_amr_1m)::text;
  v_c_a4 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a4, 'amr', v_amr_1m)::text;
  v_c_a5 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a5, 'amr', v_amr_8d)::text;
  v_c_a6 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a6, 'amr', v_amr_otp)::text;
  v_c_a7 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a7, 'amr', v_amr_2h)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;
  v_shut := array[v_c_a2, v_c_a3, v_c_a4, v_c_a5, v_c_a6, v_c_a7];

  v_today := (now() at time zone 'America/New_York')::date;
  v_day   := v_today + 3;
  v_dow   := extract(isodow from v_day)::smallint;

  -- a Worcester class, a time slot on v_day, and two on TODAY (00:00 = over, 23:30 = later today)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_cw1 := (public.testing_add_class('worcester', v_tag || ' w1', null, false) ->> 'id')::uuid;
  if v_cw1 is null then raise exception 'TEST SETUP: could not add a test class'; end if;
  select v.id into v_vw from public.schedule_versions v
   where v.location_code = 'worcester' and v.starts_on <= v_day order by v.starts_on desc limit 1;
  v_r := public.schedule_add_slots('worcester', v_vw, array[v_cw1], array[v_dow], '06:00', '06:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: slot: %', v_r; end if;
  select v.id into v_vt from public.schedule_versions v
   where v.location_code = 'worcester' and v.starts_on <= v_today order by v.starts_on desc limit 1;
  if v_vt is null then raise exception 'TEST SETUP: no Worcester schedule in effect today'; end if;
  v_r := public.schedule_add_slots('worcester', v_vt, array[v_cw1], array[extract(isodow from v_today)::smallint], '00:00', '00:15');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: slot today 00:00: %', v_r; end if;
  v_r := public.schedule_add_slots('worcester', v_vt, array[v_cw1], array[extract(isodow from v_today)::smallint], '23:30', '23:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: slot today 23:30: %', v_r; end if;

  -- a Live free-class form offering the class, 2 spots a time, no notice needed
  reset role;
  v_fields := jsonb_set(public.forms_template('free_class'), '{8,text}', to_jsonb('Our wording.'::text));
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.forms_create('worcester', 'free_class', v_tag || ' form', v_slug);
  v_f1 := (v_r ->> 'id')::uuid;
  v_r := public.forms_save_draft(v_f1, (v_r ->> 'version')::integer, v_tag || ' form', v_slug, v_fields,
                                 '{"thank_you":"","alert_email":null,"confirm_email":false,"add_to_calendar":false}');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: save draft: %', v_r; end if;
  v_r := public.forms_set_booking(v_f1, (v_r ->> 'version')::integer,
           jsonb_build_array(jsonb_build_object('class_id', v_cw1, 'default_limit', 2, 'days_ahead', 14, 'min_hours_ahead', 0)), '[]');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: booking: %', v_r; end if;
  v_r := public.forms_publish(v_f1, (v_r ->> 'version')::integer);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: publish: %', v_r; end if;
  reset role;
  select published_version into v_pub from public.forms where id = v_f1;
  v_ans := jsonb_build_object('parent_name', 'Kim Zztest', 'parent_phone', '(508) 555-7731', 'parent_email', 'kim@example.com', 'waiver', true);

  -- -------------------------------------------------------------------
  -- Test 1: a sign-up makes one prospect per child (New / Booked)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans,
           '[{"first_name":"Ava","age":10},{"first_name":"Max","age":7}]',
           jsonb_build_array(jsonb_build_object('child', 0, 'class_id', v_cw1, 'date', v_day, 'starts_at', '06:00')), v_sig);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 1a staff submit: %', v_r; end if;
  v_s1 := (v_r ->> 'id')::uuid;
  reset role;
  select id into v_st_new from public.prospect_statuses where location_code = 'worcester' and builtin = 'new';
  select id into v_st_booked from public.prospect_statuses where location_code = 'worcester' and builtin = 'booked';
  select id into v_st_came from public.prospect_statuses where location_code = 'worcester' and builtin = 'came';
  select id into v_st_joined from public.prospect_statuses where location_code = 'worcester' and builtin = 'joined';
  select id into v_st_noshow from public.prospect_statuses where location_code = 'worcester' and builtin = 'no_show';
  select id into v_st_contacted from public.prospect_statuses where location_code = 'worcester' and name = 'Contacted';
  if (select count(*) from public.prospect_statuses where location_code = 'worcester' and builtin is not null) <> 6
     or (select count(*) from public.prospect_statuses where location_code = 'shrewsbury' and builtin is not null) <> 6 then
    raise exception 'TEST FAILED: 1b each school should have its own 6 built-in statuses';
  end if;
  select id into v_p0 from public.prospects where submission_id = v_s1 and child_index = 0;
  select id into v_p1 from public.prospects where submission_id = v_s1 and child_index = 1;
  if v_p0 is null or v_p1 is null
     or (select status_id from public.prospects where id = v_p0) <> v_st_booked
     or (select status_id from public.prospects where id = v_p1) <> v_st_new
     or (select child_first_name || child_age from public.prospects where id = v_p1) <> 'Max7' then
    raise exception 'TEST FAILED: 1c Ava (booked) should be Booked and Max New';
  end if;
  if not exists (select 1 from public.prospect_activity where prospect_id = v_p0 and kind = 'created') then
    raise exception 'TEST FAILED: 1d the timeline should start with "created"';
  end if;

  -- -------------------------------------------------------------------
  -- Test 2: nobody without a session; shut-out sessions; no direct reads
  -- -------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform public.prospects_list('worcester'); raise exception 'TEST FAILED: 2a anon called prospects_list';
  exception when insufficient_privilege then null; end;
  reset role;
  for v_n in 1 .. array_length(v_shut, 1) loop
    set local role authenticated;
    perform set_config('request.jwt.claims', v_shut[v_n], true);
    v_txt := concat_ws(',',
      public.prospects_list('worcester') ->> 'status', public.prospects_get(v_p0) ->> 'status',
      public.prospects_search('worcester', 'Ava') ->> 'status', public.prospects_badge(null) ->> 'status',
      public.prospects_set_status(v_p0, 1, v_st_new, null) ->> 'status', public.prospects_add_note(v_p0, 'x', false, null) ->> 'status',
      public.prospects_book_time(v_p0, 1, v_f1, v_cw1, v_day, '06:00') ->> 'status', public.prospects_delete(v_p0, 1) ->> 'status');
    if v_txt <> 'no_access,no_access,no_access,no_access,no_access,no_access,no_access,no_access' then
      raise exception 'TEST FAILED: 2b shut-out session A% got %', v_n + 1, v_txt;
    end if;
    if (select count(*) from public.prospect_statuses) <> 0 then raise exception 'TEST FAILED: 2c shut-out session reads statuses'; end if;
    reset role;
  end loop;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_tbl in array array['prospects', 'prospect_notes', 'prospect_activity', 'prospect_opens'] loop
    begin
      execute format('select 1 from public.%I limit 1', v_tbl);
      raise exception 'TEST FAILED: 2d staff can read % directly', v_tbl;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 3: the list shows list columns only; search
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.prospects_list('worcester');
  if v_r ->> 'status' <> 'ok' or not exists (select 1 from jsonb_array_elements(v_r -> 'prospects') e where (e ->> 'id')::uuid = v_p0) then
    raise exception 'TEST FAILED: 3a the list should hold Ava: %', left(v_r::text, 200);
  end if;
  if position('555-7731' in (v_r -> 'prospects')::text) > 0 or position('kim@example' in (v_r -> 'prospects')::text) > 0
     or exists (select 1 from jsonb_array_elements(v_r -> 'prospects') e where e ? 'parent_phone' or e ? 'child_age' or e ? 'answers') then
    raise exception 'TEST FAILED: 3b the list must not hold phone, email, age or answers';
  end if;
  if (select (e -> 'booking' ->> 'class_running')::boolean from jsonb_array_elements(v_r -> 'prospects') e where (e ->> 'id')::uuid = v_p0) is not true then
    raise exception 'TEST FAILED: 3c Ava''s free class still runs';
  end if;
  if (select (e ->> 'signed_up_at')::timestamptz from jsonb_array_elements(v_r -> 'prospects') e where (e ->> 'id')::uuid = v_p0)
     is distinct from (select s.created_at from public.form_submissions s join public.prospects p on p.submission_id = s.id where p.id = v_p0) then
    raise exception 'TEST FAILED: 3g the list''s signed_up_at must be the sign-up''s own time';
  end if;
  v_txt := concat_ws(',',
    (public.prospects_search('worcester', '7731') -> 'ids') @> to_jsonb(array[v_p0]),
    (public.prospects_search('worcester', '508-555-7731') -> 'ids') @> to_jsonb(array[v_p0]),
    not ((public.prospects_search('worcester', '77') -> 'ids') @> to_jsonb(array[v_p0])),                -- under 4 digits: no phone match
    (public.prospects_search('worcester', 'zztest') -> 'ids') @> to_jsonb(array[v_p0, v_p1]),
    (public.prospects_search('shrewsbury', '7731') -> 'ids') = '[]'::jsonb,
    public.prospects_search('worcester', 'x') ->> 'status');
  if v_txt <> 't,t,t,t,t,invalid' then raise exception 'TEST FAILED: 3d search gave %', v_txt; end if;
  if position('555-7731' in public.prospects_search('worcester', '7731')::text) > 0 then
    raise exception 'TEST FAILED: 3e search must never return a phone number';
  end if;
  v_r := public.prospects_get(v_p0);
  if v_r ->> 'status' <> 'ok' or v_r -> 'prospect' ->> 'parent_phone' <> '(508) 555-7731'
     or (v_r -> 'prospect' ->> 'has_signature')::boolean is not true
     or jsonb_array_length(v_r -> 'prospect' -> 'siblings') <> 1 or v_r -> 'prospect' ? 'signature' then
    raise exception 'TEST FAILED: 3f the panel: contact details, signature on file (not the picture), one sibling';
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 4: status, Joined date, notes, follow-up
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  select version into v_ver from public.prospects where id = v_p1;
  v_txt := concat_ws(',',
    public.prospects_set_status(v_p1, v_ver + 5, v_st_contacted, null) ->> 'status',                    -- stale
    public.prospects_set_status(v_p1, v_ver, v_st_joined, null) ->> 'status',                           -- Joined needs a date
    public.prospects_set_status(v_p1, v_ver, v_st_contacted, v_today) ->> 'status',                     -- only Joined has one
    public.prospects_set_status(v_p1, v_ver, v_st_joined, v_today + 1) ->> 'status',                    -- not in the future
    public.prospects_set_status(v_p1, v_ver, (select id from public.prospect_statuses where location_code = 'shrewsbury' and builtin = 'came'), null) ->> 'status');
  if v_txt <> 'stale,invalid,invalid,invalid,stale' then raise exception 'TEST FAILED: 4a status rules gave %', v_txt; end if;
  v_r := public.prospects_set_status(v_p1, v_ver, v_st_contacted, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 4b set Contacted: %', v_r; end if;
  if not exists (select 1 from public.prospect_activity where prospect_id = v_p1 and kind = 'status' and detail ->> 'to' = 'Contacted') then
    raise exception 'TEST FAILED: 4c a status change shows in the timeline';
  end if;
  v_txt := concat_ws(',',
    public.prospects_add_note(v_p1, '', false, null) ->> 'status',
    public.prospects_add_note(v_p1, repeat('x', 1001), false, null) ->> 'status',
    public.prospects_add_note(v_p1, 'Left voicemail', true, v_today - 1) ->> 'status',
    public.prospects_add_note(v_p1, 'Left voicemail', false, v_today + 2) ->> 'status',
    public.prospects_add_note(v_p1, 'Left voicemail', true, v_today + 3) ->> 'status');
  if v_txt <> 'invalid,invalid,invalid,invalid,ok' then raise exception 'TEST FAILED: 4d note rules gave %', v_txt; end if;
  if (select follow_up_on from public.prospects where id = v_p1) <> v_today + 3
     or (select created_by_name from public.prospect_notes where prospect_id = v_p1) is null then
    raise exception 'TEST FAILED: 4e a note sets the follow-up and keeps who wrote it';
  end if;
  reset role;
  begin
    update public.prospect_notes set body = 'changed' where prospect_id = v_p1;
    raise exception 'TEST FAILED: 4f a note must never change';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select version into v_ver from public.prospects where id = v_p1;
  -- (each function runs FIRST, then the result is checked: inside one "if" the
  --  database may read the table before it calls the function)
  v_r := public.prospects_set_follow_up(v_p1, v_ver, null);
  if v_r ->> 'status' <> 'ok' or (select follow_up_on from public.prospects where id = v_p1) is not null then
    raise exception 'TEST FAILED: 4g No follow-up clears the date: %', v_r;
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 5: free classes from the panel - shared limit, change, cancel
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.prospects_open_times(v_p1, v_day, v_day);
  if v_r ->> 'status' <> 'ok' or jsonb_array_length(v_r -> 'times') <> 1 or (v_r -> 'times' -> 0 ->> 'spots_left')::integer <> 1 then
    raise exception 'TEST FAILED: 5a one time with 1 spot left (Ava took one of 2): %', v_r;
  end if;
  select version into v_ver from public.prospects where id = v_p1;
  v_r := public.prospects_book_time(v_p1, v_ver, v_f1, v_cw1, v_day, '06:00');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 5b book Max: %', v_r; end if;
  if (select status_id from public.prospects where id = v_p1) <> v_st_contacted then
    raise exception 'TEST FAILED: 5c booking keeps a status staff chose (Contacted)';
  end if;
  -- a third child (another family) can't get the time: it's full
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans || '{"parent_name":"Lee Zzfamily"}', '[{"first_name":"Zoe","age":8}]', '[]', v_sig);
  v_s3 := (v_r ->> 'id')::uuid;
  select id, version into v_p3, v_ver from public.prospects where submission_id = v_s3;
  v_r := public.prospects_book_time(v_p3, v_ver, v_f1, v_cw1, v_day, '06:00');
  if v_r ->> 'status' <> 'time_taken' or exists (select 1 from public.class_bookings where submission_id = v_s3) then
    raise exception 'TEST FAILED: 5d the full time must answer time_taken and book nothing';
  end if;
  -- Ava cancels -> back to New, the spot is free; Zoe gets it (Booked)
  select version into v_ver from public.prospects where id = v_p0;
  v_r := public.prospects_cancel_time(v_p0, v_ver);
  if v_r ->> 'status' <> 'ok' or (select status_id from public.prospects where id = v_p0) <> v_st_new then
    raise exception 'TEST FAILED: 5e cancel: % / Booked should go back to New', v_r;
  end if;
  select version into v_ver from public.prospects where id = v_p3;
  v_r := public.prospects_book_time(v_p3, v_ver, v_f1, v_cw1, v_day, '06:00');
  if v_r ->> 'status' <> 'ok' or (select status_id from public.prospects where id = v_p3) <> v_st_booked then
    raise exception 'TEST FAILED: 5f the freed spot can be booked (Booked)';
  end if;
  -- Ava books again into the cancelled row's place: the time is full now
  select version into v_ver from public.prospects where id = v_p0;
  v_r := public.prospects_book_time(v_p0, v_ver, v_f1, v_cw1, v_day, '06:00');
  if v_r ->> 'status' <> 'time_taken' or (select status from public.class_bookings where submission_id = v_s1 and child_index = 0) <> 'cancelled' then
    raise exception 'TEST FAILED: 5g a failed booking leaves the old (cancelled) row untouched';
  end if;
  -- change Zoe to today 23:30 (in place of her old booking, one row per child)
  select version into v_ver from public.prospects where id = v_p3;
  v_r := public.prospects_book_time(v_p3, v_ver, v_f1, v_cw1, v_today, '23:30');
  if v_r ->> 'status' <> 'ok' and (now() at time zone 'America/New_York')::time < '23:30' then
    raise exception 'TEST FAILED: 5h change Zoe to today 23:30: %', v_r;
  end if;
  if (select count(*) from public.class_bookings where submission_id = v_s3) <> 1 then
    raise exception 'TEST FAILED: 5i still one booking row for Zoe';
  end if;
  if public.prospects_book_time(v_p1, (select version from public.prospects where id = v_p1), v_rand, v_cw1, v_day, '06:00') ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: 5j an unknown form is refused';
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 6: check in, Undo, and "did they come?"
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- Max's class is in 3 days: no check-in yet, no "did they come?" yet
  select version into v_ver from public.prospects where id = v_p1;
  v_txt := concat_ws(',',
    public.prospects_check_in(v_p1, v_ver, true, false) ->> 'status',
    public.prospects_check_in(v_p1, v_ver, false, true) ->> 'status',
    public.prospects_check_in(v_p1, v_ver, false, false) ->> 'status');
  if v_txt <> 'not_allowed,not_allowed,invalid' then raise exception 'TEST FAILED: 6a early check-in gave %', v_txt; end if;
  reset role;
  -- move Max's booking to today 23:30 (test only, as postgres)
  update public.class_bookings set on_date = v_today, starts_at = '23:30', ends_at = '23:45' where submission_id = v_s1 and child_index = 1;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select version, status_id into v_ver, v_prev from public.prospects where id = v_p1;
  v_r := public.prospects_check_in(v_p1, v_ver, true, false);
  if v_r ->> 'status' <> 'ok' or (select status_id from public.prospects where id = v_p1) <> v_st_came
     or (v_r ->> 'previous_status_id')::uuid <> v_prev then
    raise exception 'TEST FAILED: 6b check in -> Came: %', v_r;
  end if;
  if public.prospects_check_in(v_p1, (v_r ->> 'version')::integer, true, false) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: 6c checking in twice is refused';
  end if;
  if public.prospects_book_time(v_p1, (v_r ->> 'version')::integer, v_f1, v_cw1, v_day, '06:00') ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: 6d a checked-in child can''t be moved';
  end if;
  if public.prospects_undo_check_in(v_p1, (v_r ->> 'version')::integer + 9, v_prev, null) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: 6e Undo after a change is stale';
  end if;
  v_r := public.prospects_undo_check_in(v_p1, (v_r ->> 'version')::integer, v_prev, null);
  if v_r ->> 'status' <> 'ok' or (select status_id from public.prospects where id = v_p1) <> v_prev
     or (select checked_in_at from public.prospects where id = v_p1) is not null then
    raise exception 'TEST FAILED: 6f Undo puts the status back: %', v_r;
  end if;
  reset role;
  -- the class at 00:00 today is over: "did they come?" -> No-show + call back tomorrow
  update public.class_bookings set starts_at = '00:00', ends_at = '00:15' where submission_id = v_s1 and child_index = 1;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.prospects_list('worcester');
  if (select (e ->> 'ask_came')::boolean from jsonb_array_elements(v_r -> 'prospects') e where (e ->> 'id')::uuid = v_p1) is not true then
    raise exception 'TEST FAILED: 6g the list asks "did Max come?"';
  end if;
  select version into v_ver from public.prospects where id = v_p1;
  if public.prospects_check_in(v_p1, v_ver, true, false) ->> 'status' <> 'ok' then
    -- (checking in during the class day is allowed even after it ended - undo it for the next check)
    raise exception 'TEST FAILED: 6h a check-in on the class day is still allowed';
  end if;
  select version into v_ver from public.prospects where id = v_p1;
  perform public.prospects_undo_check_in(v_p1, v_ver, v_prev, null);
  select version into v_ver from public.prospects where id = v_p1;
  v_r := public.prospects_check_in(v_p1, v_ver, false, true);
  if v_r ->> 'status' <> 'ok' or (select status_id from public.prospects where id = v_p1) <> v_st_noshow
     or (select follow_up_on from public.prospects where id = v_p1) <> v_today + 1 then
    raise exception 'TEST FAILED: 6i No-show sets a call-back for tomorrow: %', v_r;
  end if;
  reset role;
  -- a cancelled class (closure) is never asked about and can't be checked in
  insert into public.calendar_closures (location_code, starts_on, ends_on, reason, whole_day, class_key)
  values ('worcester', v_today, v_today, 'zz test closure', true, '');
  perform set_config('request.jwt.claims', v_c_d1, true);
  select version into v_ver from public.prospects where id = v_p1;
  perform public.prospects_undo_check_in(v_p1, v_ver, v_prev, v_today + 3);
  v_r := public.prospects_list('worcester');
  if (select (e ->> 'ask_came')::boolean from jsonb_array_elements(v_r -> 'prospects') e where (e ->> 'id')::uuid = v_p1) is not false
     or (select (e -> 'booking' ->> 'class_running')::boolean from jsonb_array_elements(v_r -> 'prospects') e where (e ->> 'id')::uuid = v_p1) is not false then
    raise exception 'TEST FAILED: 6j a closed day: no "did they come?", class not running';
  end if;
  select version into v_ver from public.prospects where id = v_p1;
  if public.prospects_check_in(v_p1, v_ver, true, false) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: 6k no check-in for a cancelled class';
  end if;
  reset role;
  delete from public.calendar_closures where reason = 'zz test closure';

  -- a Joined child is never checked in (it would lose its protection from the clean-up)
  update public.class_bookings set on_date = v_today, starts_at = '23:30', ends_at = '23:45' where submission_id = v_s1 and child_index = 1;
  update public.prospects set status_id = v_st_joined, joined_on = v_today where id = v_p1;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.prospects_check_in(v_p1, (select version from public.prospects where id = v_p1), true, false);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: 6l a Joined child can''t be checked in: %', v_r; end if;
  update public.prospects set status_id = v_prev, joined_on = null where id = v_p1;

  -- -------------------------------------------------------------------
  -- Test 7: each school's statuses; only admins delete
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.prospect_statuses_add('worcester', '  Left   voicemail ', 'stage', 'pink');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 7a staff can add a status: %', v_r; end if;
  v_st_custom := (v_r ->> 'id')::uuid;
  v_txt := concat_ws(',',
    public.prospect_statuses_add('worcester', 'left voicemail', 'stage', 'pink') ->> 'status',
    public.prospect_statuses_add('worcester', 'Red one', 'stage', 'red') ->> 'status',
    public.prospect_statuses_add('worcester', 'Odd', 'middle', 'gray') ->> 'status',
    public.prospect_statuses_update(v_st_booked, (select version from public.prospect_statuses where id = v_st_booked), 'Booked in', 'exit', 'purple') ->> 'status',
    public.prospect_statuses_update(v_st_booked, (select version from public.prospect_statuses where id = v_st_booked), 'Booked in', 'stage', 'purple') ->> 'status',
    public.prospect_statuses_delete(v_st_custom, 1, 0, null) ->> 'status');
  if v_txt <> 'duplicate_name,invalid,invalid,not_allowed,ok,not_allowed' then
    raise exception 'TEST FAILED: 7b status rules gave %', v_txt;
  end if;
  if exists (select 1 from public.prospect_statuses where location_code = 'shrewsbury' and name = 'Left voicemail') then
    raise exception 'TEST FAILED: 7c a status belongs to one school';
  end if;
  -- reorder: the order the screen saw must still be true
  reset role;
  declare
    v_order uuid[];
    v_new_order uuid[];
  begin
    select array_agg(id order by position, id) into v_order from public.prospect_statuses where location_code = 'worcester';
    v_new_order := array[v_order[cardinality(v_order)]] || v_order[1:cardinality(v_order) - 1];
    perform set_config('request.jwt.claims', v_c_d1, true);
      v_txt := concat_ws(',', public.prospect_statuses_reorder('worcester', v_new_order, v_order) ->> 'status',
                            public.prospect_statuses_reorder('worcester', v_order, v_new_order) ->> 'status');
    if v_txt <> 'stale,ok' or (select position from public.prospect_statuses where id = v_order[cardinality(v_order)]) <> 0 then
      raise exception 'TEST FAILED: 7d reorder gave %', v_txt;
    end if;
    reset role;
  end;
  -- admin deletes the custom status, moving its people to New
  perform set_config('request.jwt.claims', v_c_d1, true);
  select version into v_ver from public.prospects where id = v_p3;
  perform public.prospects_set_status(v_p3, v_ver, v_st_custom, null);
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_txt := concat_ws(',',
    public.prospect_statuses_delete(v_st_custom, (select version from public.prospect_statuses where id = v_st_custom), 0, v_st_new) ->> 'status',
    public.prospect_statuses_delete(v_st_custom, (select version from public.prospect_statuses where id = v_st_custom), 1, null) ->> 'status',
    public.prospect_statuses_delete(v_st_new, (select version from public.prospect_statuses where id = v_st_new), 0, null) ->> 'status',
    public.prospect_statuses_delete(v_st_custom, (select version from public.prospect_statuses where id = v_st_custom), 1, v_st_new) ->> 'status');
  if v_txt <> 'stale,invalid,not_allowed,ok' or (select status_id from public.prospects where id = v_p3) <> v_st_new then
    raise exception 'TEST FAILED: 7e delete status gave % (people move to New)', v_txt;
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 8: the badge is per person
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_n := (public.prospects_badge('worcester') ->> 'count')::integer;
  v_r := public.prospects_mark_opened(v_p3);
  if v_r ->> 'status' <> 'ok' or (public.prospects_badge('worcester') ->> 'count')::integer <> v_n - 1 then
    raise exception 'TEST FAILED: 8a opening Zoe lowers the desk''s badge';
  end if;
  perform public.prospects_mark_opened(v_p3);   -- twice is fine
  perform set_config('request.jwt.claims', v_c_a1, true);
  if (public.prospects_badge('worcester') ->> 'count')::integer <> v_n then
    raise exception 'TEST FAILED: 8b the admin''s badge is their own';
  end if;
  -- the Calendar finds the prospect from a booking
  v_r := public.prospects_for_bookings(array(select id from public.class_bookings where submission_id = v_s3));
  if v_r ->> 'status' <> 'ok' or (v_r -> 'prospects' -> 0 ->> 'prospect_id')::uuid <> v_p3 then
    raise exception 'TEST FAILED: 8c prospects_for_bookings: %', v_r;
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 9: deleting (admins only; the sign-up goes with the last child)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.prospects_delete(v_p1, (select version from public.prospects where id = v_p1)) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: 9a staff can''t delete a prospect';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.prospects_delete(v_p1, (select version from public.prospects where id = v_p1));
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'family_removed')::boolean
     or not exists (select 1 from public.form_submissions where id = v_s1)
     or exists (select 1 from public.class_bookings where submission_id = v_s1 and child_index = 1) then
    raise exception 'TEST FAILED: 9b deleting Max keeps the family (Ava) and frees his booking: %', v_r;
  end if;
  v_r := public.prospects_delete(v_p0, (select version from public.prospects where id = v_p0));
  if v_r ->> 'status' <> 'ok' or not (v_r ->> 'family_removed')::boolean or exists (select 1 from public.form_submissions where id = v_s1) then
    raise exception 'TEST FAILED: 9c deleting the last child removes the sign-up: %', v_r;
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 10: the 2-year clean-up (every family that isn't Joined)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans, '[{"first_name":"Old","age":9},{"first_name":"Kid","age":5}]', '[]', v_sig);
  v_s2 := (v_r ->> 'id')::uuid;
  reset role;
  -- both families quiet for 25 months; Zoe's family has a Joined child
  update public.prospects set last_activity_at = now() - interval '25 months' where submission_id in (v_s2, v_s3);
  update public.prospects set status_id = v_st_joined, joined_on = v_today where submission_id = v_s3;
  -- one sibling still active keeps a family: first make Kid active, then quiet
  update public.prospects set last_activity_at = now() - interval '1 month' where submission_id = v_s2 and child_index = 1;
  perform public.prospects_purge_old();
  if not exists (select 1 from public.form_submissions where id = v_s2) then
    raise exception 'TEST FAILED: 10a an active sibling keeps the family';
  end if;
  update public.prospects set last_activity_at = now() - interval '25 months' where submission_id = v_s2;
  v_n := public.prospects_purge_old();
  if v_n < 1 or exists (select 1 from public.form_submissions where id = v_s2) or exists (select 1 from public.prospects where submission_id = v_s2)
     or not exists (select 1 from public.form_submissions where id = v_s3) then
    raise exception 'TEST FAILED: 10b the quiet family goes, the Joined family stays';
  end if;

  -- -------------------------------------------------------------------
  -- Catalog: permissions on everything 0012 created
  -- -------------------------------------------------------------------
  foreach v_tbl in array array['prospect_statuses', 'prospects', 'prospect_notes', 'prospect_activity', 'prospect_opens'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || v_tbl)::regclass) then
      raise exception 'TEST FAILED: C1 RLS is off on %', v_tbl;
    end if;
    if has_table_privilege('anon', 'public.' || v_tbl, 'select') or has_any_column_privilege('anon', 'public.' || v_tbl, 'select')
       or has_table_privilege('service_role', 'public.' || v_tbl, 'select') or has_any_column_privilege('service_role', 'public.' || v_tbl, 'select')
       or has_table_privilege('authenticated', 'public.' || v_tbl, 'insert') or has_table_privilege('authenticated', 'public.' || v_tbl, 'update')
       or has_table_privilege('authenticated', 'public.' || v_tbl, 'delete') or has_table_privilege('authenticated', 'public.' || v_tbl, 'truncate')
       or (v_tbl <> 'prospect_statuses' and has_any_column_privilege('authenticated', 'public.' || v_tbl, 'select')) then
      raise exception 'TEST FAILED: C2 wrong grants on %', v_tbl;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'public.prospect_statuses', 'created_by', 'select') then
    raise exception 'TEST FAILED: C3 a hidden column is readable';
  end if;
  for v_fn in
    select p.proname, p.oid, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_staff_fns || v_helper_fns)
  loop
    if v_fn.proconfig is null or not ('search_path=""' = any (v_fn.proconfig)) then
      raise exception 'TEST FAILED: C4 % has no search_path = ''''', v_fn.proname;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'execute') or has_function_privilege('service_role', v_fn.oid, 'execute')
       or has_function_privilege('public', v_fn.oid, 'execute') then
      raise exception 'TEST FAILED: C5 % can be called by anon / public / service_role', v_fn.proname;
    end if;
    v_bool := has_function_privilege('authenticated', v_fn.oid, 'execute');
    if v_fn.proname = any (v_staff_fns) then
      if not v_bool or not v_fn.prosecdef then raise exception 'TEST FAILED: C6 % should be callable by the app and security definer', v_fn.proname; end if;
    elsif v_bool then
      raise exception 'TEST FAILED: C7 the app can call %', v_fn.proname;
    end if;
  end loop;
  foreach v_tbl in array v_staff_fns || v_helper_fns loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = v_tbl) <> 1 then
      raise exception 'TEST FAILED: C8 expected exactly one function %', v_tbl;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.form_submissions'::regclass and t.tgname = 'form_submissions_make_prospects')
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.class_bookings'::regclass and t.tgname = 'class_bookings_follow_prospect') then
    raise exception 'TEST FAILED: C9 the two 0009 triggers are missing';
  end if;
end;
$$;

select 'ALL 0012 TESTS PASSED' as result;

rollback;
