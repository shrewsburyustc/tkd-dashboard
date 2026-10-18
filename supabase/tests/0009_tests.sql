-- =====================================================================
-- 0009_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0009_forms.sql (Forms): who can
--   read forms and sign-ups (only unlocked staff sessions), who can build
--   (admins) and fill in (staff and admins), every rule of the field list
--   and of a family's answers, publishing, the free-class times (window,
--   hours ahead, closures, the SHARED spot limit, the last spot), sending
--   twice, the rate limit and the kiosk token, signatures (never readable
--   by the app, never in the history), deleting, and a catalog section
--   that checks the permissions on every object 0009 creates - including
--   the restricted login forms_registrar.
--   Run it in the Supabase SQL Editor AFTER 0009 is applied. It makes its
--   own test classes, time slots and forms named "zz test ...".
--
-- IS IT SAFE?
--   Yes. One transaction that ends with ROLLBACK: every change is undone.
--   NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same as 0003 / 0007 / 0008 (A1 admin unlocked, A2-A7 shut out in
--   different ways, D1 front desk, anon). The public page's login
--   (forms_registrar) is checked from the catalog only (P1): the public
--   functions are called here as the SQL Editor's own role, which gives
--   the same answers (they always run as their owner) - the same way as
--   Color Belt's 0005 tests.
--
-- BEFORE YOU RUN IT
--   Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--   the UIDs of an ACTIVE admin and the ACTIVE front-desk account.
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0009 TESTS PASSED".
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
  v_mark  bigint;
  v_rand  uuid := gen_random_uuid();
  v_ver   integer;

  v_cw1 uuid; v_cs1 uuid; v_vw uuid; v_slot uuid;
  v_f1 uuid; v_f1_v integer; v_f2 uuid; v_f2_v integer; v_fcopy uuid;
  v_fields jsonb; v_pub integer; v_blank jsonb;
  v_ans jsonb; v_kids jsonb; v_book jsonb;
  v_sub1 uuid; v_key1 uuid := gen_random_uuid();
  v_token text;
  v_reg_oid oid;
  v_fn record;
  v_tbl text;
  v_public_fns text[] := array['forms_public_get', 'forms_public_submit', 'forms_public_email_result'];
  v_staff_fns text[] := array['forms_create', 'forms_save_draft', 'forms_publish', 'forms_set_status', 'forms_duplicate',
                              'forms_delete', 'forms_set_booking', 'forms_staff_submit', 'forms_open_times',
                              'forms_bookings_between', 'forms_submission_signature', 'forms_kiosk_token', 'forms_kiosk_revoke'];
  v_helper_fns text[] := array['forms_bad_text', 'forms_long_text_ok', 'forms_date_ok', 'forms_submission_answer', 'forms_phone_ok', 'forms_email_ok', 'forms_signature_ok',
                               'forms_slug_ok', 'forms_fields_are_valid', 'forms_fields_publishable', 'forms_settings_are_valid',
                               'forms_template', 'forms_before_write', 'forms_submissions_log', 'forms_refuse_truncate',
                               'forms_slots_on', 'forms_spot_limit', 'forms_times', 'forms_check_answers', 'forms_submit_core'];
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
  if to_regclass('public.forms') is null or not exists (select 1 from pg_roles where rolname = 'forms_registrar') then
    raise exception 'TEST SETUP: 0009 is not applied (public.forms or forms_registrar missing)';
  end if;

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

  -- a Worcester and a Shrewsbury class, and a Worcester time slot on v_day
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_cw1 := (public.testing_add_class('worcester',  v_tag || ' w1', null, false) ->> 'id')::uuid;
  v_cs1 := (public.testing_add_class('shrewsbury', v_tag || ' s1', null, false) ->> 'id')::uuid;
  if v_cw1 is null or v_cs1 is null then raise exception 'TEST SETUP: could not add test classes'; end if;
  select v.id into v_vw from public.schedule_versions v
   where v.location_code = 'worcester' and v.starts_on <= v_day order by v.starts_on desc limit 1;
  if v_vw is null and exists (select 1 from public.schedule_versions v where v.location_code = 'worcester') then
    raise exception 'TEST SETUP: Worcester has schedules, but none in effect on %', v_day;
  end if;
  v_r := public.schedule_add_slots('worcester', v_vw, array[v_cw1], array[v_dow], '06:00', '06:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: slot: %', v_r; end if;
  v_slot := (v_r -> 'slots' -> 0 ->> 'id')::uuid;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 1: field-list rules (helpers, as postgres)
  -- -------------------------------------------------------------------
  v_fields := public.forms_template('free_class');
  v_blank := public.forms_template('blank');
  if not public.forms_fields_are_valid(v_fields) then raise exception 'TEST FAILED: 1a the free-class template should be valid'; end if;
  if public.forms_fields_publishable(v_fields) then raise exception 'TEST FAILED: 1b an empty waiver must not be publishable'; end if;
  if not public.forms_fields_are_valid(public.forms_template('walk_in')) or not public.forms_fields_are_valid(public.forms_template('event'))
     or not public.forms_fields_are_valid(public.forms_template('blank')) then
    raise exception 'TEST FAILED: 1c every template should be valid';
  end if;
  v_txt := concat_ws(',',
    public.forms_fields_are_valid(v_fields - 1),                                                          -- parent phone missing
    public.forms_fields_are_valid(v_fields || jsonb_build_array(v_fields -> 4)),                          -- duplicate id
    public.forms_fields_are_valid(v_fields || jsonb_build_array(jsonb_build_object('id', 'x', 'type', 'video', 'label', 'X'))),
    public.forms_fields_are_valid(v_fields || jsonb_build_array(jsonb_build_object('id', 'x', 'type', 'choice', 'label', 'X', 'options', jsonb_build_array('Only')))),
    public.forms_fields_are_valid(v_fields || jsonb_build_array(jsonb_build_object('id', 'x', 'type', 'short_text', 'label', 'X', 'show_if', jsonb_build_object('field', 'later', 'value', 'a')))),
    public.forms_fields_are_valid(jsonb_set(v_fields, '{0,locked}', 'false')),                           -- parent name unlocked
    public.forms_fields_are_valid(v_fields || jsonb_build_array(jsonb_build_object('id', 'x', 'type', 'short_text', 'label', 'X', 'extra', 1))),
    public.forms_fields_are_valid(v_fields || jsonb_build_array(jsonb_build_object('id', 'x', 'type', 'short_text', 'label', 'Bad' || chr(8203) || 'label'))),
    public.forms_fields_are_valid(v_fields || jsonb_build_array(jsonb_build_object('id', 'b2', 'type', 'booking', 'label', 'Again'))),
    public.forms_fields_are_valid(jsonb_set(v_fields, '{8,text}', to_jsonb('Agree' || chr(7)))),          -- control char in waiver
    public.forms_fields_are_valid(jsonb_set(v_fields, '{5,required}', 'true')));                          -- booking "required"
  if v_txt <> 'f,f,f,f,f,f,f,f,f,f,f' then
    raise exception 'TEST FAILED: 1d field-list rules gave %', v_txt;
  end if;
  -- 61 fields
  select v_fields || coalesce(jsonb_agg(jsonb_build_object('id', 'f' || g, 'type', 'heading', 'label', 'H')), '[]') into v_r
    from generate_series(1, 61 - jsonb_array_length(v_fields) + 1) g;
  if public.forms_fields_are_valid(v_r) then raise exception 'TEST FAILED: 1e more than 60 fields should be refused'; end if;
  -- the test form: the template + a choice and a field shown only for "Other"
  v_fields := jsonb_set(v_fields, '{8,text}', to_jsonb('I agree to the school''s rules.'::text))
              || jsonb_build_array(
                   jsonb_build_object('id', 'interest', 'type', 'choice', 'label', 'Interested in', 'required', true,
                                      'options', jsonb_build_array('Kids', 'Teens', 'Other')),
                   jsonb_build_object('id', 'other', 'type', 'short_text', 'label', 'What else?', 'required', true,
                                      'show_if', jsonb_build_object('field', 'interest', 'value', 'Other')));
  if not public.forms_fields_publishable(v_fields) then raise exception 'TEST FAILED: 1f the test form should be publishable'; end if;
  if public.forms_settings_are_valid('{"thank_you":"x","alert_email":"nope","confirm_email":true,"add_to_calendar":true}') then
    raise exception 'TEST FAILED: 1g a bad alert email should be refused';
  end if;

  -- -------------------------------------------------------------------
  -- Test 2: nobody without a session; no direct writes; hidden columns
  -- -------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  foreach v_tbl in array array['forms', 'form_submissions', 'class_bookings', 'form_booking_offers'] loop
    begin
      execute format('select 1 from public.%I limit 1', v_tbl);
      raise exception 'TEST FAILED: 2a anon read %', v_tbl;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin perform public.forms_create('worcester', 'blank', 'x', 'xyz'); raise exception 'TEST FAILED: 2b anon called forms_create';
  exception when insufficient_privilege then null; end;
  begin perform public.forms_public_get('xyz'); raise exception 'TEST FAILED: 2c anon called forms_public_get';
  exception when insufficient_privilege then null; end;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin insert into public.forms (location_code, name, slug, kind, draft, settings) values ('worcester', 'x', 'xyz', 'blank', '[]', '{}');
        raise exception 'TEST FAILED: 2d admin inserted a form directly'; exception when insufficient_privilege then null; end;
  begin update public.form_submissions set parent_name = 'x';
        raise exception 'TEST FAILED: 2e admin updated a sign-up directly'; exception when insufficient_privilege then null; end;
  begin perform s.signature from public.form_submissions s;
        raise exception 'TEST FAILED: 2f the signature column is readable'; exception when insufficient_privilege then null; end;
  begin perform s.submission_key from public.form_submissions s;
        raise exception 'TEST FAILED: 2g submission_key is readable'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.class_bookings;
        raise exception 'TEST FAILED: 2h class_bookings readable directly'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.form_kiosk_tokens;
        raise exception 'TEST FAILED: 2i kiosk tokens readable'; exception when insufficient_privilege then null; end;
  begin perform public.forms_public_get('xyz');
        raise exception 'TEST FAILED: 2j the app can call forms_public_get'; exception when insufficient_privilege then null; end;
  begin perform public.forms_submit_core(v_rand, v_rand, 1, '{}', '[]', '[]', null, 'staff', null);
        raise exception 'TEST FAILED: 2k the app can call forms_submit_core'; exception when insufficient_privilege then null; end;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 3: shut-out sessions get no_access and see no rows
  -- -------------------------------------------------------------------
  for v_n in 1 .. array_length(v_shut, 1) loop
    set local role authenticated;
    perform set_config('request.jwt.claims', v_shut[v_n], true);
    if (select count(*) from public.forms) <> 0 or (select count(*) from public.form_submissions) <> 0 then
      raise exception 'TEST FAILED: 3a shut-out session A% can read forms', v_n + 1;
    end if;
    v_txt := concat_ws(',',
      public.forms_create('worcester', 'blank', v_tag, v_slug) ->> 'status',
      public.forms_staff_submit(v_rand, v_rand, 1, '{}', '[]', '[]', null) ->> 'status',
      public.forms_open_times(v_rand, v_today, v_today) ->> 'status',
      public.forms_bookings_between(null, v_today, v_today) ->> 'status',
      public.forms_submission_signature(v_rand) ->> 'status',
      public.forms_kiosk_token(v_rand) ->> 'status');
    if v_txt <> 'no_access,no_access,no_access,no_access,no_access,no_access' then
      raise exception 'TEST FAILED: 3b shut-out session A% got %', v_n + 1, v_txt;
    end if;
    reset role;
  end loop;

  -- -------------------------------------------------------------------
  -- Test 4: building (admin)
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.forms_create('worcester', 'free_class', '  ' || v_tag || '  free ', v_slug);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 4a create: %', v_r; end if;
  v_f1 := (v_r ->> 'id')::uuid;
  v_f1_v := (v_r ->> 'version')::integer;
  if (select name from public.forms where id = v_f1) <> v_tag || ' free' or (select status from public.forms where id = v_f1) <> 'draft' then
    raise exception 'TEST FAILED: 4b a new form is a cleaned-up Draft';
  end if;
  v_txt := concat_ws(',',
    public.forms_create('worcester', 'free_class', 'x', v_slug) ->> 'status',               -- taken
    public.forms_create('worcester', 'free_class', 'x', 'Bad Slug') ->> 'status',
    public.forms_create('worcester', 'free_class', 'x', 'api') ->> 'status',                -- reserved
    public.forms_create('boston', 'free_class', 'x', v_slug || '-b') ->> 'status',
    public.forms_create('worcester', 'party', 'x', v_slug || '-b') ->> 'status',
    public.forms_publish(v_f1, v_f1_v) ->> 'status',                                        -- the waiver is still empty
    public.forms_set_status(v_f1, v_f1_v, 'live') ->> 'status');                             -- never published
  if v_txt <> 'duplicate_slug,invalid,invalid,invalid,invalid,not_publishable,not_publishable' then
    raise exception 'TEST FAILED: 4c build rules gave %', v_txt;
  end if;
  v_r := public.forms_save_draft(v_f1, v_f1_v, v_tag || ' free', v_slug, v_fields,
                                 '{"thank_you":"Thanks {parent}!","alert_email":"desk@example.com","confirm_email":true,"add_to_calendar":true}');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 4d save draft: %', v_r; end if;
  if public.forms_save_draft(v_f1, v_f1_v, v_tag, v_slug, v_fields, (select settings from public.forms where id = v_f1)) ->> 'status' <> 'stale' then
    raise exception 'TEST FAILED: 4e an old version should be stale';
  end if;
  v_f1_v := (v_r ->> 'version')::integer;
  v_r := public.forms_publish(v_f1, v_f1_v);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 4f publish: %', v_r; end if;
  v_f1_v := (v_r ->> 'version')::integer;
  select published_version into v_pub from public.forms where id = v_f1;
  if (select status from public.forms where id = v_f1) <> 'live' or v_pub <> 1 then
    raise exception 'TEST FAILED: 4g publishing a Draft makes it Live, version 1';
  end if;
  -- booking settings
  v_txt := concat_ws(',',
    public.forms_set_booking(v_f1, v_f1_v, jsonb_build_array(jsonb_build_object('class_id', v_cs1, 'default_limit', 2, 'days_ahead', 14, 'min_hours_ahead', 0)), '[]') ->> 'status',
    public.forms_set_booking(v_f1, v_f1_v, jsonb_build_array(jsonb_build_object('class_id', v_cw1, 'default_limit', 2, 'days_ahead', 61, 'min_hours_ahead', 0)), '[]') ->> 'status',
    public.forms_set_booking(v_f1, v_f1_v, jsonb_build_array(jsonb_build_object('class_id', v_cw1, 'default_limit', 21, 'days_ahead', 14, 'min_hours_ahead', 0)), '[]') ->> 'status',
    public.forms_set_booking(v_f1, v_f1_v, '[]', jsonb_build_array(jsonb_build_object('class_id', v_cw1, 'weekday', 1, 'starts_at', '06:00', 'spot_limit', 1))) ->> 'status');
  if v_txt <> 'invalid,invalid,invalid,invalid' then raise exception 'TEST FAILED: 4h booking rules gave %', v_txt; end if;
  v_r := public.forms_set_booking(v_f1, v_f1_v, jsonb_build_array(jsonb_build_object('class_id', v_cw1, 'default_limit', 2, 'days_ahead', 14, 'min_hours_ahead', 0)), '[]');
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> v_f1_v + 1 then raise exception 'TEST FAILED: 4i set booking: %', v_r; end if;
  v_f1_v := v_f1_v + 1;
  v_r := public.forms_open_times(v_f1, v_day, v_day);
  if v_r ->> 'status' <> 'ok'
     or not exists (select 1 from jsonb_array_elements(v_r -> 'times') t
                     where t ->> 'class_id' = v_cw1::text and t ->> 'starts_at' = '06:00' and (t ->> 'spots_left')::int = 2) then
    raise exception 'TEST FAILED: 4j the 6:00 time should be open with 2 spots: %', v_r;
  end if;
  -- the staff can't build
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_txt := concat_ws(',',
    public.forms_create('worcester', 'blank', v_tag, v_slug || '-d') ->> 'status',
    public.forms_save_draft(v_f1, v_f1_v, v_tag, v_slug, v_fields, '{}') ->> 'status',
    public.forms_publish(v_f1, v_f1_v) ->> 'status',
    public.forms_set_status(v_f1, v_f1_v, 'closed') ->> 'status',
    public.forms_set_booking(v_f1, v_f1_v, '[]', '[]') ->> 'status',
    public.forms_delete(v_f1, v_f1_v) ->> 'status',
    public.forms_duplicate(v_f1) ->> 'status');
  if v_txt <> 'not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed' then
    raise exception 'TEST FAILED: 4k staff building gave %', v_txt;
  end if;
  if public.forms_open_times(v_f1, v_day, v_day) ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 4l staff should see open times'; end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 5: the public page - reading
  -- -------------------------------------------------------------------
  v_r := public.forms_public_get(v_slug);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'published_version')::int <> v_pub
     or v_r ? 'alert_email' or v_r::text like '%desk@example.com%' then
    raise exception 'TEST FAILED: 5a public answer should be fixed and never show the alert email: %', v_r;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r) k)
     <> array['add_to_calendar', 'fields', 'form_name', 'published_version', 'school_name', 'school_phone', 'status', 'thank_you', 'times'] then
    raise exception 'TEST FAILED: 5b public answer keys are %', (select array_agg(k order by k) from jsonb_object_keys(v_r) k);
  end if;
  if public.forms_public_get('zz-no-such-form-x') ->> 'status' <> 'not_found' or public.forms_public_get('Bad Slug') ->> 'status' <> 'not_found' then
    raise exception 'TEST FAILED: 5c unknown slugs should be not_found';
  end if;

  -- -------------------------------------------------------------------
  -- Test 6: the public page - answers are checked against the published form
  -- -------------------------------------------------------------------
  v_ans := jsonb_build_object('parent_name', '  Maria  Lopez ', 'parent_phone', '(508) 555-0123', 'parent_email', 'maria@example.com',
                              'interest', 'Kids', 'waiver', true);
  v_kids := jsonb_build_array(jsonb_build_object('first_name', ' Ava ', 'age', 7), jsonb_build_object('first_name', 'Leo', 'age', 5));
  v_book := jsonb_build_array(jsonb_build_object('child', 0, 'class_id', v_cw1, 'date', v_day, 'starts_at', '06:00'));
  v_txt := concat_ws(',',
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans || '{"nope": 1}', v_kids, '[]', v_sig, null) ->> 'status',  -- unknown key
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans - 'parent_phone', v_kids, '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans || '{"parent_email": "nope"}', v_kids, '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans || '{"other": "x"}', v_kids, '[]', v_sig, null) ->> 'status',   -- hidden field answered
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans || '{"interest": "Other"}', v_kids, '[]', v_sig, null) ->> 'status', -- now required, missing
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans || '{"interest": "Adults"}', v_kids, '[]', v_sig, null) ->> 'status', -- not an option
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans - 'waiver', v_kids, '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans, v_kids, '[]', null, null) ->> 'status',                       -- no signature
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans, v_kids, '[]', 'data:image/svg+xml;base64,PHN2Zz4=', null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans, '[]', '[]', v_sig, null) ->> 'status',                         -- no child
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans, jsonb_build_array(jsonb_build_object('first_name', 'A', 'age', 1)), '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans, v_kids,
                               jsonb_build_array(jsonb_build_object('child', 2, 'class_id', v_cw1, 'date', v_day, 'starts_at', '06:00')), v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans, v_kids, v_book || v_book, v_sig, null) ->> 'status',      -- same child twice
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub + 1, v_ans, v_kids, '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans, v_kids,
                               jsonb_build_array(jsonb_build_object('child', 0, 'class_id', v_cw1, 'date', '2026-02-30', 'starts_at', '06:00')), v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-k6', gen_random_uuid(), v_pub, v_ans, v_kids, '[]', 'data:image/png;base64,AAAA', null) ->> 'status');
  if v_txt <> 'invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,form_changed,invalid,invalid' then
    raise exception 'TEST FAILED: 6a answer rules gave %', v_txt;
  end if;
  if exists (select 1 from public.form_submissions where form_id = v_f1) then
    raise exception 'TEST FAILED: 6b a refused sign-up was saved';
  end if;
  if (select count(*) from public.forms_public_attempts where client_key = 'zz-k6') <> 16 then
    raise exception 'TEST FAILED: 6c every refused send (incl. a Feb 30 date) still counts toward the rate limit';
  end if;

  -- -------------------------------------------------------------------
  -- Test 7: a sign-up with a free class; sending twice; the history
  -- -------------------------------------------------------------------
  select max(id) into v_mark from public.change_log;
  v_r := public.forms_public_submit(v_slug, 'zz-k7', v_key1, v_pub, v_ans, v_kids, v_book, v_sig, null);
  if v_r ->> 'status' <> 'ok' or jsonb_array_length(v_r -> 'bookings') <> 1 or v_r -> 'bookings' -> 0 ->> 'starts_at' <> '06:00' then
    raise exception 'TEST FAILED: 7a sign-up with a booking: %', v_r;
  end if;
  v_sub1 := (v_r ->> 'id')::uuid;
  if (select parent_name from public.form_submissions where id = v_sub1) <> 'Maria Lopez'
     or (select children -> 0 ->> 'first_name' from public.form_submissions where id = v_sub1) <> 'Ava'
     or (select source from public.form_submissions where id = v_sub1) <> 'public'
     or (select fields from public.form_submissions where id = v_sub1) <> v_fields then
    raise exception 'TEST FAILED: 7b the sign-up should keep cleaned names, source public and a copy of the fields';
  end if;
  v_r := public.forms_public_submit(v_slug, 'zz-k7', v_key1, v_pub, v_ans, v_kids, v_book, v_sig, null);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'id')::uuid <> v_sub1 or (v_r ->> 'repeat')::boolean is not true
     or jsonb_array_length(v_r -> 'bookings') <> 1
     or (select count(*) from public.class_bookings where submission_id = v_sub1) <> 1 then
    raise exception 'TEST FAILED: 7c sending twice should save once: %', v_r;
  end if;
  if exists (select 1 from public.change_log l where l.id > v_mark and (l.after::text like '%data:image%' or l.before::text like '%data:image%'))
     or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'form_submissions'
                     and l.record_id = v_sub1 and l.after ->> 'signature' = 'on file' and l.actor_name = 'Family form'
                     and l.action = 'forms_public_submit') then
    raise exception 'TEST FAILED: 7d history: signature "on file", actor Family form, never the picture';
  end if;
  begin
    update public.form_submissions set parent_name = 'Changed' where id = v_sub1;
    raise exception 'TEST FAILED: 7e a sign-up must never change';
  exception when check_violation then null;
  end;

  -- -------------------------------------------------------------------
  -- Test 8: the last spot, the shared limit, closures
  -- -------------------------------------------------------------------
  v_r := public.forms_public_submit(v_slug, 'zz-k8', gen_random_uuid(), v_pub, v_ans, v_kids, v_book, v_sig, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 8a second spot: %', v_r; end if;
  v_r := public.forms_public_submit(v_slug, 'zz-k8', gen_random_uuid(), v_pub, v_ans, v_kids, v_book, v_sig, null);
  if v_r ->> 'status' <> 'time_taken'
     or exists (select 1 from jsonb_array_elements(v_r -> 'times') t where t ->> 'class_id' = v_cw1::text and t ->> 'date' = v_day::text) then
    raise exception 'TEST FAILED: 8b the third booking should be time_taken with fresh times: %', v_r;
  end if;
  if (select count(*) from public.form_submissions where form_id = v_f1) <> 2 then
    raise exception 'TEST FAILED: 8c a time_taken sign-up must not be saved';
  end if;
  -- a second live form offering the same class with limit 1: the shared count is already 2
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.forms_create('worcester', 'blank', v_tag || ' second', v_slug || '-2');
  v_f2 := (v_r ->> 'id')::uuid;
  v_f2_v := (v_r ->> 'version')::integer;
  v_r := public.forms_save_draft(v_f2, v_f2_v, v_tag || ' second', v_slug || '-2',
                                 v_blank || jsonb_build_array(jsonb_build_object('id', 'booking', 'type', 'booking', 'label', 'Time')),
                                 (select settings from public.forms where id = v_f1));
  v_f2_v := (v_r ->> 'version')::integer;
  v_r := public.forms_set_booking(v_f2, v_f2_v, jsonb_build_array(jsonb_build_object('class_id', v_cw1, 'default_limit', 5, 'days_ahead', 14, 'min_hours_ahead', 0)), '[]');
  v_f2_v := (v_r ->> 'version')::integer;
  v_r := public.forms_publish(v_f2, v_f2_v);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: second form publish: %', v_r; end if;
  v_f2_v := (v_r ->> 'version')::integer;
  -- form 2 says 5, form 1 says 2: the lowest wins, and 2 are booked -> full on form 2 too
  if exists (select 1 from jsonb_array_elements(public.forms_open_times(v_f2, v_day, v_day) -> 'times') t where t ->> 'class_id' = v_cw1::text) then
    raise exception 'TEST FAILED: 8d the shared limit (lowest wins) should hide the full time on the other form too';
  end if;
  -- a 0 on the second form ("not on this form") must not close the time on the first (review M2)
  v_r := public.forms_set_booking(v_f2, v_f2_v, jsonb_build_array(jsonb_build_object('class_id', v_cw1, 'default_limit', 5, 'days_ahead', 14, 'min_hours_ahead', 0)),
                                  jsonb_build_array(jsonb_build_object('class_id', v_cw1, 'weekday', v_dow, 'starts_at', '06:00', 'spot_limit', 0)));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: limit 0: %', v_r; end if;
  v_f2_v := (v_r ->> 'version')::integer;
  reset role;
  if public.forms_spot_limit(v_f1, 'worcester', v_cw1, v_day, '06:00') <> 2 or public.forms_spot_limit(v_f2, 'worcester', v_cw1, v_day, '06:00') <> 0 then
    raise exception 'TEST FAILED: 8d2 a 0 on one form only hides the time on that form';
  end if;
  -- a key already used on form 1 is refused on form 2 (review L1)
  if public.forms_public_submit(v_slug || '-2', 'zz-k8b', v_key1, (select published_version from public.forms where id = v_f2),
                                v_ans - 'interest' - 'waiver', v_kids, '[]', null, null) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: 8d3 a submission key of another form should be refused';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- the booking is in the Calendar's list, class still running
  v_r := public.forms_bookings_between('worcester', v_day, v_day);
  if v_r ->> 'status' <> 'ok'
     or not exists (select 1 from jsonb_array_elements(v_r -> 'bookings') b
                     where b ->> 'child_first_name' = 'Ava' and (b ->> 'class_running')::boolean and b ->> 'starts_at' = '06:00')
     or v_r::text like '%Lopez%' or v_r::text like '%555-0123%' or v_r::text like '%maria@%' then
    raise exception 'TEST FAILED: 8e the Calendar list shows the child''s first name only, class running: %', v_r;
  end if;
  -- a closure cancels that day: the time disappears, the bookings stay, flagged
  v_r := public.calendar_add_closure('worcester', v_day, v_day, v_tag || ' storm', true, '{}');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: closure: %', v_r; end if;
  if exists (select 1 from jsonb_array_elements(public.forms_open_times(v_f1, v_day, v_day) -> 'times') t where t ->> 'date' = v_day::text) then
    raise exception 'TEST FAILED: 8f a closed day should have no open times';
  end if;
  v_r := public.forms_bookings_between('worcester', v_day, v_day);
  if (select count(*) from jsonb_array_elements(v_r -> 'bookings') b where b ->> 'form_id' = v_f1::text and not (b ->> 'class_running')::boolean) <> 2 then
    raise exception 'TEST FAILED: 8g both bookings should stay, flagged "class cancelled": %', v_r;
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- Test 9: rate limit and the kiosk token
  -- -------------------------------------------------------------------
  insert into public.forms_public_attempts (client_key, form_id, outcome)
  select 'zz-rl', v_f2, 'ok' from generate_series(1, 20);
  if public.forms_public_submit(v_slug || '-2', 'zz-rl', gen_random_uuid(), (select published_version from public.forms where id = v_f2),
                                v_ans - 'interest' - 'waiver', v_kids, '[]', null, null) ->> 'status' <> 'rate_limited' then
    raise exception 'TEST FAILED: 9a 20 sends in an hour should be rate_limited';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.forms_kiosk_token(v_f2);
  if v_r ->> 'status' <> 'ok' or char_length(v_r ->> 'token') <> 64 then raise exception 'TEST FAILED: 9b staff kiosk token: %', v_r; end if;
  v_token := v_r ->> 'token';
  reset role;
  if exists (select 1 from public.form_kiosk_tokens where token_hash = v_token) then
    raise exception 'TEST FAILED: 9c the kiosk token must be stored hashed only';
  end if;
  v_r := public.forms_public_submit(v_slug || '-2', 'zz-rl', gen_random_uuid(), (select published_version from public.forms where id = v_f2),
                                    v_ans - 'interest' - 'waiver', v_kids, '[]', null, v_token);
  if v_r ->> 'status' <> 'ok' or (select source from public.form_submissions where id = (v_r ->> 'id')::uuid) <> 'kiosk' then
    raise exception 'TEST FAILED: 9d a kiosk token raises the limit and marks the source kiosk: %', v_r;
  end if;
  if public.forms_public_submit(v_slug, 'zz-rl2', gen_random_uuid(), v_pub, v_ans, v_kids, '[]', v_sig, v_token) ->> 'status' <> 'invalid'
     or public.forms_public_submit(v_slug || '-2', 'zz-rl2', gen_random_uuid(), 1, v_ans, v_kids, '[]', null, repeat('a', 64)) ->> 'status' <> 'invalid'
     or public.forms_public_submit(v_slug || '-2', 'zz-rl3', gen_random_uuid(), 1, v_ans, v_kids, '[]', null, repeat('a', 5000)) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: 9e a token of another form, or a made-up one, is refused';
  end if;
  if (select count(*) from public.forms_public_attempts where client_key = 'zz-rl2') <> 2 then
    raise exception 'TEST FAILED: 9f refused sends still count toward the rate limit';
  end if;

  -- -------------------------------------------------------------------
  -- Test 10: staff "Fill in"; signature read; email result; delete rules
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.forms_staff_submit(v_f2, gen_random_uuid(), (select published_version from public.forms where id = v_f2),
                                   v_ans - 'interest' - 'waiver', v_kids, '[]', null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 10a staff fill in: %', v_r; end if;
  reset role;
  if (select source from public.form_submissions where id = (v_r ->> 'id')::uuid) <> 'staff'
     or (select entered_by from public.form_submissions where id = (v_r ->> 'id')::uuid) is null then
    raise exception 'TEST FAILED: 10b a staff sign-up is marked "Entered by"';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.forms_submission_signature(v_sub1) ->> 'signature' <> v_sig then
    raise exception 'TEST FAILED: 10c staff can read one signature through the function';
  end if;
  reset role;
  if (select count(*) from public.form_signature_views where submission_id = v_sub1) <> 1 then
    raise exception 'TEST FAILED: 10c2 every signature read is recorded';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  for v_n in 1 .. 6 loop perform public.forms_kiosk_token(v_f2); end loop;
  if (public.forms_kiosk_revoke(v_f2) ->> 'revoked')::int <> 5 then
    raise exception 'TEST FAILED: 10c3 at most 5 kiosk tokens per form, and revoke removes them';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.forms_delete(v_f1, v_f1_v);
  if v_r ->> 'status' <> 'not_allowed' then raise exception 'TEST FAILED: 10d a form with sign-ups can''t be deleted: %', v_r; end if;
  v_r := public.forms_duplicate(v_f1);
  if v_r ->> 'status' <> 'ok' or (select status from public.forms where id = (v_r ->> 'id')::uuid) <> 'draft'
     or (select count(*) from public.form_booking_offers where form_id = (v_r ->> 'id')::uuid) <> 1 then
    raise exception 'TEST FAILED: 10e duplicate makes a Draft copy with its booking settings: %', v_r;
  end if;
  v_fcopy := (v_r ->> 'id')::uuid;
  v_r := public.forms_delete(v_fcopy, (v_r ->> 'version')::int);
  if v_r ->> 'status' <> 'ok' or exists (select 1 from public.forms where id = v_fcopy) then
    raise exception 'TEST FAILED: 10f a form without sign-ups can be deleted: %', v_r;
  end if;
  v_r := public.forms_set_status(v_f1, v_f1_v, 'closed');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: 10g close: %', v_r; end if;
  reset role;
  if public.forms_public_get(v_slug) ->> 'status' <> 'closed'
     or public.forms_public_submit(v_slug, 'zz-k10', gen_random_uuid(), v_pub, v_ans, v_kids, '[]', v_sig, null) ->> 'status' <> 'closed' then
    raise exception 'TEST FAILED: 10h a Closed form shows "closed" and takes no sign-ups';
  end if;
  if public.forms_public_email_result(v_slug, v_key1, 'family', false) ->> 'status' <> 'ok'
     or public.forms_public_email_result(v_slug, gen_random_uuid(), 'family', false) ->> 'status' <> 'not_found'
     or public.forms_public_email_result(v_slug || '-2', v_key1, 'family', false) ->> 'status' <> 'not_found'
     or public.forms_public_email_result(v_slug, v_key1, 'sms', false) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: 10i email results only for that form''s own sign-up';
  end if;

  -- -------------------------------------------------------------------
  -- P1: the restricted login forms_registrar (catalog proofs, as 0005 T2)
  -- -------------------------------------------------------------------
  select r.oid into v_reg_oid from pg_roles r where r.rolname = 'forms_registrar';
  for v_fn in
    select p.oid, p.proname::text as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  loop
    if has_function_privilege('forms_registrar', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_public_fns)) then
      raise exception 'TEST FAILED: P1a forms_registrar execute on % is %', v_fn.oid::regprocedure, has_function_privilege('forms_registrar', v_fn.oid, 'EXECUTE');
    end if;
  end loop;
  select string_agg(c.oid::regclass::text, ', ') into v_txt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
     and has_schema_privilege('forms_registrar', n.oid, 'USAGE')
     and (case when c.relkind = 'S' then has_sequence_privilege('forms_registrar', c.oid, 'USAGE, SELECT, UPDATE')
               else has_table_privilege('forms_registrar', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                    or has_any_column_privilege('forms_registrar', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES') end);
  if v_txt is not null then raise exception 'TEST FAILED: P1b forms_registrar has rights on: %', v_txt; end if;
  select string_agg(n.nspname, ', ') into v_txt from pg_namespace n where has_schema_privilege('forms_registrar', n.oid, 'CREATE');
  if v_txt is not null or has_database_privilege('forms_registrar', current_database(), 'CREATE') then
    raise exception 'TEST FAILED: P1c forms_registrar can create in: %', coalesce(v_txt, 'the database');
  end if;
  foreach v_txt in array array['anon', 'authenticated', 'service_role'] loop
    if pg_has_role(v_txt, 'forms_registrar', 'MEMBER') then raise exception 'TEST FAILED: P1d % can become forms_registrar', v_txt; end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticator') and pg_has_role('authenticator', 'forms_registrar', 'MEMBER') then
    raise exception 'TEST FAILED: P1d authenticator can become forms_registrar';
  end if;
  if exists (select 1 from pg_auth_members m where m.member = v_reg_oid) then
    raise exception 'TEST FAILED: P1e forms_registrar is a member of another role';
  end if;
  if not exists (select 1 from pg_roles r where r.rolname = 'forms_registrar' and r.rolcanlogin and not r.rolinherit
                   and not r.rolcreatedb and not r.rolcreaterole and not r.rolbypassrls and not r.rolreplication
                   and not r.rolsuper and r.rolconnlimit = 5) then
    raise exception 'TEST FAILED: P1f forms_registrar attributes';
  end if;
  select array_to_string(s.setconfig, ',') into v_txt from pg_db_role_setting s where s.setrole = v_reg_oid and s.setdatabase = 0;
  if v_txt is null or position('statement_timeout=5s' in v_txt) = 0 or position('idle_in_transaction_session_timeout=10s' in v_txt) = 0
     or position('search_path=""' in v_txt) = 0 then
    raise exception 'TEST FAILED: P1g forms_registrar settings are %', v_txt;
  end if;

  -- -------------------------------------------------------------------
  -- Catalog: permissions on everything 0009 created
  -- -------------------------------------------------------------------
  foreach v_tbl in array array['forms', 'form_booking_offers', 'form_booking_limits', 'form_submissions', 'class_bookings',
                               'class_booking_slots', 'form_kiosk_tokens', 'form_email_results', 'forms_public_attempts', 'form_signature_views'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || v_tbl)::regclass) then
      raise exception 'TEST FAILED: C1 RLS is off on %', v_tbl;
    end if;
    if has_table_privilege('anon', 'public.' || v_tbl, 'select') or has_any_column_privilege('anon', 'public.' || v_tbl, 'select')
       or has_table_privilege('service_role', 'public.' || v_tbl, 'select') or has_any_column_privilege('service_role', 'public.' || v_tbl, 'select')
       or has_table_privilege('authenticated', 'public.' || v_tbl, 'insert') or has_table_privilege('authenticated', 'public.' || v_tbl, 'update')
       or has_table_privilege('authenticated', 'public.' || v_tbl, 'delete') or has_table_privilege('authenticated', 'public.' || v_tbl, 'truncate')
       or (v_tbl in ('class_bookings', 'class_booking_slots', 'form_kiosk_tokens', 'form_email_results', 'forms_public_attempts', 'form_signature_views')
           and has_any_column_privilege('authenticated', 'public.' || v_tbl, 'select'))
       or has_column_privilege('authenticated', 'public.' || v_tbl, 'id', 'update') then
      raise exception 'TEST FAILED: C2 wrong grants on %', v_tbl;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'public.form_submissions', 'signature', 'select')
     or has_column_privilege('authenticated', 'public.form_submissions', 'submission_key', 'select')
     or has_column_privilege('authenticated', 'public.forms', 'booking_key', 'select')
     or has_column_privilege('authenticated', 'public.forms', 'created_by', 'select') then
    raise exception 'TEST FAILED: C3 a hidden column is readable';
  end if;
  for v_fn in
    select p.proname, p.oid, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_public_fns || v_staff_fns || v_helper_fns)
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
    if v_fn.proname = any (v_public_fns) and not v_fn.prosecdef then
      raise exception 'TEST FAILED: C8 % should be security definer', v_fn.proname;
    end if;
  end loop;
  foreach v_tbl in array v_public_fns || v_staff_fns || v_helper_fns loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = v_tbl) <> 1 then
      raise exception 'TEST FAILED: C9 expected exactly one function %', v_tbl;
    end if;
  end loop;
end;
$$;

select 'ALL 0009 TESTS PASSED' as result;

rollback;
