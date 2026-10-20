-- =====================================================================
-- 0019_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0019_school_phone.sql: each
--   school's optional phone (Settings -> Schools), saved together with
--   the address by settings_update_school_contact, logged in change_log,
--   readable by staff, and handed to a closed sign-up form by 0009's
--   forms_public_get. Re-running 0019 and the "0005 re-run" case are in
--   supabase/tests/pglite/run.mjs, because they need a scratch database.
--   Run it in the Supabase SQL Editor AFTER 0019 is applied.
--
-- IS IT SAFE?
--   Yes. One transaction that ends with ROLLBACK: every change is undone
--   (the schools' real address and phone are back as they were). NEVER
--   change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same as 0015_tests.sql: A1 admin (unlocked, fresh password), D1 front
--   desk (unlocked), and no sign-in at all. Functions are called as the
--   SQL Editor's own role with the session claims set.
--
-- BEFORE YOU RUN IT
--   Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--   the UIDs of an ACTIVE admin and the ACTIVE front-desk account.
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0019 TESTS PASSED".
--   Failed: an error starting with "TEST FAILED:" or "TEST SETUP:".
--   Nothing is saved either way. If it failed, run   rollback;   once.
-- =====================================================================

begin;

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
  v_tag  text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_slug text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);

  v_loc  public.locations%rowtype;
  v_row  public.locations%rowtype;
  v_ver  integer;
  v_r    jsonb;
  v_n    integer;
  v_mark bigint;
  v_txt  text;
  v_f1   uuid;
  v_fn   text := 'public.settings_update_school_contact(text, integer, text, text, text, text, text)';
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
  if to_regprocedure(v_fn) is null then raise exception 'TEST SETUP: 0019 is not applied'; end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_d1, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'), (v_d1, v_desk, now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;

  -- Start Worcester from a known state: no address, no phone (undone at the end).
  perform set_config('tkd.action', 'manual', true);
  update public.locations set address_street = null, address_city = null, address_state = null,
                              address_zip = null, phone = null
   where code = 'worcester';
  perform set_config('tkd.action', '', true);
  select * into v_loc from public.locations where code = 'worcester';

  -- -------------------------------------------------------------------
  -- Test 1: the table's phone rule (even the owner can't store a bad one)
  -- -------------------------------------------------------------------
  foreach v_txt in array array['123456', 'call 508 555 0100', ' 5085550100', '5085550100 ',
                               '1234567890123456', '+1 (508) 555-0100 x12', '(508) 555-0100 ext'] loop
    begin
      update public.locations set phone = v_txt where code = 'worcester';
      raise exception 'TEST FAILED: 1 the table took the phone "%"', v_txt;
    exception when check_violation then null;
    end;
  end loop;

  -- -------------------------------------------------------------------
  -- Test 2: who may save (front desk: not allowed; no sign-in: no access)
  -- and who may call (nobody but signed-in users; never anon)
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.settings_update_school_contact('worcester', v_loc.version, '', '', '', '', '508 555 0100');
  if v_r ->> 'status' is distinct from 'not_allowed' then raise exception 'TEST FAILED: 2a front desk saved: %', v_r; end if;
  perform set_config('request.jwt.claims', '', true);
  v_r := public.settings_update_school_contact('worcester', v_loc.version, '', '', '', '', '508 555 0100');
  if v_r ->> 'status' is distinct from 'no_access' then raise exception 'TEST FAILED: 2b no sign-in saved: %', v_r; end if;
  if (select phone from public.locations where code = 'worcester') is not null then
    raise exception 'TEST FAILED: 2c a refused save stored a phone';
  end if;
  if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('public', v_fn, 'execute')
     or has_function_privilege('service_role', v_fn, 'execute') or not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'TEST FAILED: 2d execute rights on settings_update_school_contact are wrong';
  end if;
  if has_function_privilege('authenticated', 'public.locations_phone_before_write()', 'execute')
     or has_function_privilege('anon', 'public.locations_phone_before_write()', 'execute') then
    raise exception 'TEST FAILED: 2e the trigger function can be called directly';
  end if;
  if (select p.prosecdef from pg_proc p where p.oid = v_fn::regprocedure) is not true
     or (select p.proconfig from pg_proc p where p.oid = v_fn::regprocedure) is distinct from array['search_path=""'] then
    raise exception 'TEST FAILED: 2f settings_update_school_contact is not security definer with an empty search_path';
  end if;

  -- -------------------------------------------------------------------
  -- Test 3: read rights - staff read the phone; anon reads nothing
  -- -------------------------------------------------------------------
  if not has_column_privilege('authenticated', 'public.locations', 'phone', 'select')
     or has_column_privilege('authenticated', 'public.locations', 'phone', 'update')
     or has_column_privilege('authenticated', 'public.locations', 'phone', 'insert')
     or has_column_privilege('anon', 'public.locations', 'phone', 'select')
     or has_table_privilege('anon', 'public.locations', 'select') then
    raise exception 'TEST FAILED: 3 read rights on locations.phone are wrong';
  end if;
  -- 0005's other read rights are still there
  if not has_column_privilege('authenticated', 'public.locations', 'address_street', 'select')
     or not has_column_privilege('authenticated', 'public.locations', 'version', 'select') then
    raise exception 'TEST FAILED: 3b 0005''s read rights on locations are gone';
  end if;

  -- -------------------------------------------------------------------
  -- Test 4: admin saves only a phone - trimmed, version +1, "last changed
  -- by" stamped, one change_log row
  -- -------------------------------------------------------------------
  select coalesce(max(id), 0) into v_mark from public.change_log;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.settings_update_school_contact('worcester', v_loc.version, '', '', '', '', '  (508) 555-0100  ');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 4a admin phone save: %', v_r; end if;
  select * into v_row from public.locations where code = 'worcester';
  if v_row.phone is distinct from '(508) 555-0100' or v_row.version <> v_loc.version + 1
     or (v_r ->> 'version')::integer <> v_row.version
     or v_row.updated_by is distinct from v_admin or v_row.updated_at is null then
    raise exception 'TEST FAILED: 4b after the phone save: phone %, version % (was %), answer %', v_row.phone, v_row.version, v_loc.version, v_r;
  end if;
  select count(*) into v_n from public.change_log c
   where c.id > v_mark and c.table_name = 'locations' and c.record_id = v_row.id
     and c.action = 'update_school_phone' and c.actor_id = v_admin
     and c.after ->> 'phone' = '(508) 555-0100' and c.before ->> 'phone' is null;
  if v_n <> 1 or (select count(*) from public.change_log c where c.id > v_mark) <> 1 then
    raise exception 'TEST FAILED: 4c the phone save should write exactly one change_log row (found %)', v_n;
  end if;
  v_ver := v_row.version;

  -- -------------------------------------------------------------------
  -- Test 5: the same values again write nothing
  -- -------------------------------------------------------------------
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.settings_update_school_contact('worcester', v_ver, null, null, null, null, '(508) 555-0100');
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::integer <> v_ver
     or (select version from public.locations where code = 'worcester') <> v_ver
     or exists (select 1 from public.change_log c where c.id > v_mark) then
    raise exception 'TEST FAILED: 5 saving the same values changed something: %', v_r;
  end if;

  -- -------------------------------------------------------------------
  -- Test 6: refused saves keep everything (stale, bad phone, bad address
  -- with a good phone = "both or neither", unknown school, missing version)
  -- -------------------------------------------------------------------
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.settings_update_school_contact('worcester', v_ver - 1, '', '', '', '', '508 555 0199');
  if v_r ->> 'status' is distinct from 'stale' then raise exception 'TEST FAILED: 6a old version: %', v_r; end if;
  foreach v_txt in array array['12345', 'five oh eight', '508-555-0100 ext 2', repeat('5', 21)] loop
    v_r := public.settings_update_school_contact('worcester', v_ver, '', '', '', '', v_txt);
    if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: 6b phone "%": %', v_txt, v_r; end if;
  end loop;
  v_r := public.settings_update_school_contact('worcester', v_ver, '1 Test Street', 'Worcester', 'ma', '01605', '508 555 0199');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: 6c bad state with a good phone: %', v_r; end if;
  v_r := public.settings_update_school_contact('worcester', v_ver, '1 Test Street', '', '', '', '508 555 0199');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: 6d half an address: %', v_r; end if;
  v_r := public.settings_update_school_contact('nowhere', 1, '', '', '', '', '508 555 0199');
  if v_r ->> 'status' is distinct from 'not_found' then raise exception 'TEST FAILED: 6e unknown school: %', v_r; end if;
  v_r := public.settings_update_school_contact('worcester', null, '', '', '', '', '508 555 0199');
  if v_r ->> 'status' is distinct from 'invalid' then raise exception 'TEST FAILED: 6f no version: %', v_r; end if;
  select * into v_row from public.locations where code = 'worcester';
  if v_row.phone is distinct from '(508) 555-0100' or v_row.version <> v_ver or v_row.address_street is not null
     or exists (select 1 from public.change_log c where c.id > v_mark) then
    raise exception 'TEST FAILED: 6g a refused save changed the school (phone %, version %)', v_row.phone, v_row.version;
  end if;

  -- -------------------------------------------------------------------
  -- Test 7: address + phone in one save - both stored; the version goes up
  -- by 2 (the address and the phone are written one after the other)
  -- -------------------------------------------------------------------
  select coalesce(max(id), 0) into v_mark from public.change_log;
  v_r := public.settings_update_school_contact('worcester', v_ver, '  1  Test   Street ', 'Worcester', 'MA', '01605', '+1 508.555.0123');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: 7a address + phone: %', v_r; end if;
  select * into v_row from public.locations where code = 'worcester';
  if v_row.address_street is distinct from '1 Test Street' or v_row.address_zip is distinct from '01605'
     or v_row.phone is distinct from '+1 508.555.0123' or v_row.version <> v_ver + 2
     or (v_r ->> 'version')::integer <> v_row.version then
    raise exception 'TEST FAILED: 7b after address + phone: street %, phone %, version % (was %)', v_row.address_street, v_row.phone, v_row.version, v_ver;
  end if;
  if (select count(*) from public.change_log c where c.id > v_mark and c.table_name = 'locations'
        and c.action in ('update_school_address', 'update_school_phone')) <> 2 then
    raise exception 'TEST FAILED: 7c expected one address row and one phone row in change_log';
  end if;
  v_ver := v_row.version;

  -- -------------------------------------------------------------------
  -- Test 8: an empty phone clears it; the address stays
  -- -------------------------------------------------------------------
  v_r := public.settings_update_school_contact('worcester', v_ver, '1 Test Street', 'Worcester', 'MA', '01605', '   ');
  select * into v_row from public.locations where code = 'worcester';
  if v_r ->> 'status' is distinct from 'ok' or v_row.phone is not null or v_row.address_street is distinct from '1 Test Street'
     or v_row.version <> v_ver + 1 then
    raise exception 'TEST FAILED: 8 clearing the phone: %, phone %, version %', v_r, v_row.phone, v_row.version;
  end if;
  v_ver := v_row.version;

  -- -------------------------------------------------------------------
  -- Test 9: 0005's address-only save still works and leaves the phone alone
  -- -------------------------------------------------------------------
  v_r := public.settings_update_school_contact('worcester', v_ver, '1 Test Street', 'Worcester', 'MA', '01605', '508 555 0100');
  v_ver := (v_r ->> 'version')::integer;
  v_r := public.settings_update_school_address('worcester', v_ver, '2 Test Street', 'Worcester', 'MA', '01605');
  select * into v_row from public.locations where code = 'worcester';
  if v_r ->> 'status' is distinct from 'ok' or v_row.address_street is distinct from '2 Test Street'
     or v_row.phone is distinct from '508 555 0100' or v_row.version <> v_ver + 1 then
    raise exception 'TEST FAILED: 9 the address-only save: %, street %, phone %', v_r, v_row.address_street, v_row.phone;
  end if;

  -- -------------------------------------------------------------------
  -- Test 10: a closed sign-up form hands the phone to the public page
  -- (0009's forms_public_get, unchanged)
  -- -------------------------------------------------------------------
  v_r := public.forms_create('worcester', 'free_class', v_tag || ' form', v_slug);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: create form: %', v_r; end if;
  v_f1 := (v_r ->> 'id')::uuid;
  -- (a form needs its waiver wording before it can be published)
  v_r := public.forms_save_draft(v_f1, (v_r ->> 'version')::integer, v_tag || ' form', v_slug,
           jsonb_set(public.forms_template('free_class'), '{8,text}', to_jsonb('Our wording.'::text)),
           '{"thank_you":"","alert_email":null,"confirm_email":false,"add_to_calendar":false}');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: save draft: %', v_r; end if;
  v_r := public.forms_publish(v_f1, (v_r ->> 'version')::integer);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: publish: %', v_r; end if;
  v_r := public.forms_set_status(v_f1, (v_r ->> 'version')::integer, 'closed');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: close: %', v_r; end if;
  perform set_config('request.jwt.claims', '', true);
  v_r := public.forms_public_get(v_slug);
  if v_r ->> 'status' is distinct from 'closed' or v_r ->> 'school_phone' is distinct from '508 555 0100' then
    raise exception 'TEST FAILED: 10a a closed form should answer the school phone: %', v_r;
  end if;
  perform set_config('tkd.action', 'manual', true);
  update public.locations set phone = null where code = 'worcester';
  perform set_config('tkd.action', '', true);
  v_r := public.forms_public_get(v_slug);
  if v_r ->> 'status' is distinct from 'closed' or v_r ? 'school_phone' and v_r -> 'school_phone' <> 'null'::jsonb then
    raise exception 'TEST FAILED: 10b no phone should answer null: %', v_r;
  end if;
  -- the answer carries the name and phone only - never the address or "last changed by"
  if exists (select 1 from jsonb_object_keys(v_r) k where k not in ('status', 'school_name', 'school_phone')) then
    raise exception 'TEST FAILED: 10c the closed answer has extra keys: %', v_r;
  end if;

  -- -------------------------------------------------------------------
  -- Test 11: the trigger order - phone trigger after 0005's
  -- -------------------------------------------------------------------
  if (select string_agg(t.tgname, ',' order by t.tgname) from pg_trigger t
       where t.tgrelid = 'public.locations'::regclass and not t.tgisinternal
         and t.tgname in ('locations_before_write', 'locations_phone_before_write', 'locations_log'))
     is distinct from 'locations_before_write,locations_log,locations_phone_before_write' then
    raise exception 'TEST FAILED: 11 the triggers on locations are not the expected three';
  end if;
  -- and the phone trigger is BEFORE, FOR EACH ROW, on UPDATE only, and switched on
  -- (tgtype bits: 1 = row, 2 = before, 16 = update -> 19)
  if (select t.tgtype::integer from pg_trigger t
       where t.tgrelid = 'public.locations'::regclass and t.tgname = 'locations_phone_before_write') is distinct from 19
     or (select t.tgenabled from pg_trigger t
          where t.tgrelid = 'public.locations'::regclass and t.tgname = 'locations_phone_before_write') is distinct from 'O'
     or (select t.tgfoid from pg_trigger t
          where t.tgrelid = 'public.locations'::regclass and t.tgname = 'locations_phone_before_write')
        is distinct from 'public.locations_phone_before_write()'::regprocedure then
    raise exception 'TEST FAILED: 11b locations_phone_before_write is not a BEFORE UPDATE row trigger that is on';
  end if;
end;
$$;

select 'ALL 0019 TESTS PASSED' as result;

rollback;
