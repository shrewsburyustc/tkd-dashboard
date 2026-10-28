-- =====================================================================
-- 0031_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0031_class_ages.sql (each class's
--   age range on the booking forms, set in the Schedule - rulebook
--   v0.619; display only). It checks, in this order:
--     T1  nobody signed in (anon) can't read schedule_class_ages or call
--         schedule_set_class_ages (permission denied)
--     T2  a signed-in browser can't write the table directly or read the
--         login-id columns
--     T3  admin: set (a new row, version 1, the class's own school),
--         change (version 2), the same values again (writes nothing:
--         same version, no new history row), "From only" (Ages 13+),
--         clear (both empty: the row goes; clearing again is fine)
--     T4  the history (change_log): insert / update / delete rows, tagged
--         schedule_set_class_ages, one batch each, tags cleared after
--     T5  refusals: the front desk -> not_allowed; a shut-out session ->
--         no_access; invalid inputs (From above To, 100, -1, To without
--         From, no class) -> invalid; an unknown class -> not_found.
--         Nothing is written by any of them.
--     T6  reading (RLS): the front desk sees the rows; a shut-out
--         session sees none
--     T7  the class times: forms_open_times (staff) and the public
--         form's forms_public_get carry "age_from" / "age_to" - the
--         numbers for a class with ages, null for a class without, and
--         13 / null for "13+"; forms_public_submit's "time_taken" answer
--         carries them too; nothing else in the public answer changed;
--         Prospects' "Book a free class" (prospects_open_times, 0012)
--         carries them too, in 0012's order
--     T8  deleting the class in Testing removes its ages row (logged as
--         Testing's delete_class)
--     C   catalog: RLS on, one SELECT policy using has_data_access(),
--         grants (nothing to anon / service_role / forms_registrar),
--         schedule_set_class_ages is security definer with
--         search_path = '' and only authenticated may run it; the three
--         replaced form functions keep their rights (public ones:
--         forms_registrar only; forms_open_times: authenticated only)
--   It makes its own test classes, time slot and form named
--   "zz test ...", so it works whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test classes, slot, form,
--   sign-ups, history rows, test sessions). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0007_tests.sql / 0009_tests.sql: a pretend login token per
--   session in request.jwt.claims. A1 = admin unlocked, A2 = admin who
--   pressed Lock (shut out), D1 = front desk unlocked. The public form's
--   functions are called as the SQL Editor's own role (they run as their
--   owner, so the answers are the same as for forms_registrar).
--
-- BEFORE YOU RUN IT
--   1. 0007, 0009 and 0031 are applied. You need TWO existing, ACTIVE
--      staff rows: an admin and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations (a test class is
--      really deleted, inside the rolled-back transaction). Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0031 TESTS PASSED".
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
  v_a2 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();
  v_amr jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60));
  v_c_a1 text;
  v_c_a2 text;
  v_c_d1 text;
  v_c_anon text := '{"role": "anon"}';

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_slug  text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_today date := (now() at time zone 'America/New_York')::date;
  v_day   date := (now() at time zone 'America/New_York')::date + 3;
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg' || repeat('A', 200) || '==';
  v_rand  uuid := gen_random_uuid();

  v_r     jsonb;
  v_t     jsonb;
  v_n     integer;
  v_txt   text;
  v_mark  bigint;
  v_mark2 bigint;
  v_snap  text;
  v_vw    uuid;
  v_f1    uuid;
  v_f1_v  integer;
  v_pub   integer;
  v_fields jsonb;
  v_ans   jsonb;
  v_kids  jsonb;
  v_book  jsonb;
  -- test classes: w = Worcester (on the test slot), s = Shrewsbury
  v_cw1 uuid;   -- ages 7-12
  v_cw2 uuid;   -- no ages
  v_cw3 uuid;   -- ages 13+ (From only)
  v_cs1 uuid;   -- Shrewsbury, ages set then the class is deleted
  v_prospect uuid;
  v_fn  record;
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
  if to_regclass('public.schedule_class_ages') is null
     or to_regprocedure('public.schedule_set_class_ages(uuid, integer, integer)') is null then
    raise exception 'TEST SETUP: public.schedule_class_ages / schedule_set_class_ages is missing (is 0031 applied?)';
  end if;

  perform set_config('request.jwt.claims', '', true);
  begin
    insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_a2, v_admin), (v_d1, v_desk);
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),          -- pressed Lock: shut out
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr)::text;

  -- Test classes and one Worcester time slot for w1 + w2 + w3 on v_day,
  -- made the normal way (Testing's and the Schedule's functions, as A1)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true or public.is_admin() is not true then
    raise exception 'TEST SETUP: A1 should be an unlocked admin';
  end if;
  v_cw1 := (public.testing_add_class('worcester',  v_tag || ' w1', null, false) ->> 'id')::uuid;
  v_cw2 := (public.testing_add_class('worcester',  v_tag || ' w2', null, false) ->> 'id')::uuid;
  v_cw3 := (public.testing_add_class('worcester',  v_tag || ' w3', null, false) ->> 'id')::uuid;
  v_cs1 := (public.testing_add_class('shrewsbury', v_tag || ' s1', null, false) ->> 'id')::uuid;
  if v_cw1 is null or v_cw2 is null or v_cw3 is null or v_cs1 is null then
    raise exception 'TEST SETUP: could not add test classes';
  end if;
  select v.id into v_vw from public.schedule_versions v
   where v.location_code = 'worcester' and v.starts_on <= v_day order by v.starts_on desc limit 1;
  if v_vw is null and exists (select 1 from public.schedule_versions v where v.location_code = 'worcester') then
    raise exception 'TEST SETUP: Worcester has schedules, but none in effect on %', v_day;
  end if;
  v_r := public.schedule_add_slots('worcester', v_vw, array[v_cw1, v_cw2, v_cw3], array[extract(isodow from v_day)::smallint],
                                   '05:00', '05:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: slot: %', v_r; end if;
  reset role;

  -- -------------------------------------------------------------------
  -- T1: a visitor who is NOT signed in can read nothing and call nothing
  -- -------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform 1 from public.schedule_class_ages;
        raise exception 'TEST FAILED: T1a anon read schedule_class_ages'; exception when insufficient_privilege then null; end;
  begin perform public.schedule_set_class_ages(v_cw1, 7, 12);
        raise exception 'TEST FAILED: T1b anon called schedule_set_class_ages'; exception when insufficient_privilege then null; end;
  begin perform public.forms_open_times(v_rand, v_today, v_today);
        raise exception 'TEST FAILED: T1c anon called forms_open_times'; exception when insufficient_privilege then null; end;
  begin perform public.forms_public_get('zz-nothing-here');
        raise exception 'TEST FAILED: T1d anon called forms_public_get'; exception when insufficient_privilege then null; end;
  reset role;

  -- -------------------------------------------------------------------
  -- T2: a signed-in browser can't write the table directly, or read the
  --     login-id columns
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin insert into public.schedule_class_ages (class_id, location_code, age_from, age_to) values (v_cw1, 'worcester', 7, 12);
        raise exception 'TEST FAILED: T2a admin inserted ages directly'; exception when insufficient_privilege then null; end;
  begin update public.schedule_class_ages set age_from = 1;
        raise exception 'TEST FAILED: T2b admin updated ages directly'; exception when insufficient_privilege then null; end;
  begin delete from public.schedule_class_ages;
        raise exception 'TEST FAILED: T2c admin removed ages directly'; exception when insufficient_privilege then null; end;
  begin perform k.created_by from public.schedule_class_ages k;
        raise exception 'TEST FAILED: T2d created_by is readable'; exception when insufficient_privilege then null; end;
  begin perform k.updated_by from public.schedule_class_ages k;
        raise exception 'TEST FAILED: T2e updated_by is readable'; exception when insufficient_privilege then null; end;
  reset role;

  -- -------------------------------------------------------------------
  -- T3 + T4: admin sets, changes, sets the same again, clears
  -- -------------------------------------------------------------------
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- set (new row)
  v_r := public.schedule_set_class_ages(v_cw1, 7, 12);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'class_id', v_cw1, 'age_from', 7, 'age_to', 12, 'version', 1) then
    raise exception 'TEST FAILED: T3a set 7-12 gave %', v_r;
  end if;
  if (select count(*) from public.schedule_class_ages k
       where k.class_id = v_cw1 and k.location_code = 'worcester' and k.age_from = 7 and k.age_to = 12 and k.version = 1) <> 1 then
    raise exception 'TEST FAILED: T3b the row should be Worcester, 7-12, version 1';
  end if;
  -- change
  v_r := public.schedule_set_class_ages(v_cw1, 6, 12);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'age_from')::int <> 6 or (v_r ->> 'version')::int <> 2 then
    raise exception 'TEST FAILED: T3c change to 6-12 gave %', v_r;
  end if;
  -- the same again: nothing written
  reset role;
  select coalesce(max(l.id), 0) into v_mark2 from public.change_log l;
  select to_jsonb(k)::text into v_snap from public.schedule_class_ages k where k.class_id = v_cw1;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.schedule_set_class_ages(v_cw1, 6, 12);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::int <> 2 then
    raise exception 'TEST FAILED: T3d the same values again gave %', v_r;
  end if;
  reset role;
  if (select to_jsonb(k)::text from public.schedule_class_ages k where k.class_id = v_cw1) is distinct from v_snap
     or exists (select 1 from public.change_log l where l.id > v_mark2) then
    raise exception 'TEST FAILED: T3e the same values again must write nothing (row or history)';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- back to 7-12 (for T7)
  if public.schedule_set_class_ages(v_cw1, 7, 12) ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T3f back to 7-12'; end if;
  -- From only (13+); From = To is fine too
  v_r := public.schedule_set_class_ages(v_cw3, 13, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'class_id', v_cw3, 'age_from', 13, 'age_to', null, 'version', 1) then
    raise exception 'TEST FAILED: T3g set 13+ gave %', v_r;
  end if;
  if public.schedule_set_class_ages(v_cs1, 5, 5) ->> 'status' <> 'ok'
     or (select k.location_code from public.schedule_class_ages k where k.class_id = v_cs1) <> 'shrewsbury' then
    raise exception 'TEST FAILED: T3h a Shrewsbury class''s row should be Shrewsbury''s (5-5)';
  end if;
  -- clear (both empty), then clear again (no row: still ok)
  if public.schedule_set_class_ages(v_cw2, 4, 6) ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T3i set w2'; end if;
  v_r := public.schedule_set_class_ages(v_cw2, null, null);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'class_id', v_cw2, 'age_from', null, 'age_to', null, 'version', null) then
    raise exception 'TEST FAILED: T3j clear gave %', v_r;
  end if;
  reset role;
  if exists (select 1 from public.schedule_class_ages k where k.class_id = v_cw2) then
    raise exception 'TEST FAILED: T3k clearing should remove the row';
  end if;
  select coalesce(max(l.id), 0) into v_mark2 from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.schedule_set_class_ages(v_cw2, null, null);
  if v_r ->> 'status' <> 'ok' or v_r -> 'version' <> 'null'::jsonb then
    raise exception 'TEST FAILED: T3l clearing a class with no ages gave %', v_r;
  end if;
  reset role;
  if exists (select 1 from public.change_log l where l.id > v_mark2) then
    raise exception 'TEST FAILED: T3m clearing a class with no ages must write no history';
  end if;

  -- T4: the history
  if (select string_agg(l.op, ',' order by l.id) from public.change_log l
       where l.id > v_mark and l.table_name = 'schedule_class_ages' and l.record_id is not null
         and l.action = 'schedule_set_class_ages' and l.actor_id = v_admin and l.batch_id is not null)
     is distinct from 'insert,update,update,insert,insert,insert,delete' then
    raise exception 'TEST FAILED: T4a history should be insert,update,update,insert,insert,insert,delete - got %',
      (select string_agg(l.op || ':' || l.action, ',' order by l.id) from public.change_log l
        where l.id > v_mark and l.table_name = 'schedule_class_ages');
  end if;
  if (select count(distinct l.batch_id) from public.change_log l where l.id > v_mark and l.table_name = 'schedule_class_ages') <> 7 then
    raise exception 'TEST FAILED: T4b each call should have its own batch id';
  end if;
  if exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'schedule_class_ages'
              and l.op = 'delete' and (l.before ->> 'age_from')::int <> 4) then
    raise exception 'TEST FAILED: T4c the removal should keep the old row (4-6) in "before"';
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: T4d tags left set: action %, batch %',
      current_setting('tkd.action', true), current_setting('tkd.batch_id', true);
  end if;

  -- -------------------------------------------------------------------
  -- T5: refusals - nothing written by any of them
  -- -------------------------------------------------------------------
  select coalesce(max(l.id), 0) into v_mark2 from public.change_log l;
  select string_agg(to_jsonb(k)::text, '|' order by k.class_id) into v_snap from public.schedule_class_ages k;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_txt := concat_ws(',',
    public.schedule_set_class_ages(v_cw1, 8, 10) ->> 'status',
    public.schedule_set_class_ages(v_cw1, null, null) ->> 'status');
  if v_txt <> 'not_allowed,not_allowed' then raise exception 'TEST FAILED: T5a the front desk gave %', v_txt; end if;
  perform set_config('request.jwt.claims', v_c_a2, true);
  v_txt := concat_ws(',',
    public.schedule_set_class_ages(v_cw1, 8, 10) ->> 'status',
    public.schedule_set_class_ages(v_cw1, null, null) ->> 'status');
  if v_txt <> 'no_access,no_access' then raise exception 'TEST FAILED: T5b a shut-out session gave %', v_txt; end if;
  perform set_config('request.jwt.claims', '', true);
  if public.schedule_set_class_ages(v_cw1, 8, 10) ->> 'status' <> 'no_access' then
    raise exception 'TEST FAILED: T5c no session should be no_access';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_txt := concat_ws(',',
    public.schedule_set_class_ages(v_cw1, 12, 7) ->> 'status',        -- From above To
    public.schedule_set_class_ages(v_cw1, 100, null) ->> 'status',
    public.schedule_set_class_ages(v_cw1, 7, 100) ->> 'status',
    public.schedule_set_class_ages(v_cw1, -1, 5) ->> 'status',
    public.schedule_set_class_ages(v_cw1, null, 12) ->> 'status',     -- To without From
    public.schedule_set_class_ages(null, 7, 12) ->> 'status',
    public.schedule_set_class_ages(v_cw1, 70000, null) ->> 'status',  -- beyond a smallint
    public.schedule_set_class_ages(v_rand, 7, 12) ->> 'status',       -- no such class
    public.schedule_set_class_ages(v_rand, null, null) ->> 'status');
  if v_txt <> 'invalid,invalid,invalid,invalid,invalid,invalid,invalid,not_found,not_found' then
    raise exception 'TEST FAILED: T5d refusals gave %', v_txt;
  end if;
  reset role;
  if (select string_agg(to_jsonb(k)::text, '|' order by k.class_id) from public.schedule_class_ages k) is distinct from v_snap
     or exists (select 1 from public.change_log l where l.id > v_mark2) then
    raise exception 'TEST FAILED: T5e a refusal wrote something';
  end if;

  -- -------------------------------------------------------------------
  -- T6: reading (RLS)
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select count(*) into v_n from public.schedule_class_ages k where k.class_id in (v_cw1, v_cw3, v_cs1);
  if v_n <> 3 then raise exception 'TEST FAILED: T6a the front desk should see the 3 test rows, saw %', v_n; end if;
  if (select k.age_from || '-' || k.age_to from public.schedule_class_ages k where k.class_id = v_cw1) <> '7-12' then
    raise exception 'TEST FAILED: T6b the front desk should read w1 as 7-12';
  end if;
  perform set_config('request.jwt.claims', v_c_a2, true);
  if (select count(*) from public.schedule_class_ages) <> 0 then
    raise exception 'TEST FAILED: T6c a shut-out session must see no rows';
  end if;
  reset role;

  -- -------------------------------------------------------------------
  -- T7: the class times carry the ages
  -- -------------------------------------------------------------------
  -- the free-class template (an internal helper: read as postgres)
  v_fields := jsonb_set(public.forms_template('free_class'), '{8,text}', to_jsonb('I agree to the school''s rules.'::text));
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.forms_create('worcester', 'free_class', v_tag || ' free', v_slug);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: form: %', v_r; end if;
  v_f1 := (v_r ->> 'id')::uuid;
  v_f1_v := (v_r ->> 'version')::integer;
  v_r := public.forms_save_draft(v_f1, v_f1_v, v_tag || ' free', v_slug, v_fields,
                                 '{"thank_you":"Thanks!","alert_email":"desk@example.com","confirm_email":true,"add_to_calendar":true}');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: save draft: %', v_r; end if;
  v_r := public.forms_publish(v_f1, (v_r ->> 'version')::integer);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: publish: %', v_r; end if;
  v_f1_v := (v_r ->> 'version')::integer;
  v_r := public.forms_set_booking(v_f1, v_f1_v, jsonb_build_array(
           jsonb_build_object('class_id', v_cw1, 'default_limit', 1, 'days_ahead', 14, 'min_hours_ahead', 0),
           jsonb_build_object('class_id', v_cw2, 'default_limit', 5, 'days_ahead', 14, 'min_hours_ahead', 0),
           jsonb_build_object('class_id', v_cw3, 'default_limit', 5, 'days_ahead', 14, 'min_hours_ahead', 0)), '[]');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: booking: %', v_r; end if;
  select f.published_version into v_pub from public.forms f where f.id = v_f1;

  -- staff: forms_open_times (as the front desk)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.forms_open_times(v_f1, v_day, v_day);
  reset role;
  if v_r ->> 'status' <> 'ok' or jsonb_array_length(v_r -> 'times') <> 3 then
    raise exception 'TEST FAILED: T7a forms_open_times should list the 3 test times: %', v_r;
  end if;
  select string_agg((t ->> 'class_id') || '=' || coalesce(t ->> 'age_from', 'null') || '/' || coalesce(t ->> 'age_to', 'null'), ',' order by t ->> 'class_id')
    into v_txt from jsonb_array_elements(v_r -> 'times') t;
  if v_txt is distinct from (select string_agg(x.k, ',' order by x.k) from (values (v_cw1::text || '=7/12'), (v_cw2::text || '=null/null'),
                                                                                    (v_cw3::text || '=13/null')) as x(k)) then
    raise exception 'TEST FAILED: T7b forms_open_times ages: %', v_txt;
  end if;
  if exists (select 1 from jsonb_array_elements(v_r -> 'times') t
              where (select array_agg(k order by k) from jsonb_object_keys(t) k)
                    <> array['age_from', 'age_to', 'class_id', 'class_name', 'date', 'ends_at', 'spots_left', 'starts_at']
                 or not (t ? 'age_from') or not (t ? 'age_to')) then
    raise exception 'TEST FAILED: T7c each time should have exactly 0009''s keys plus age_from / age_to: %', v_r -> 'times';
  end if;
  -- the order of the times is still 0009's (date, start, class name)
  if (select string_agg(t ->> 'class_name', ',' order by o) from jsonb_array_elements(v_r -> 'times') with ordinality as x(t, o))
     <> v_tag || ' w1,' || v_tag || ' w2,' || v_tag || ' w3' then
    raise exception 'TEST FAILED: T7d the times should still be ordered by class name';
  end if;

  -- the public page (and the kiosk): forms_public_get
  v_r := public.forms_public_get(v_slug);
  if v_r ->> 'status' <> 'ok'
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) k)
        <> array['add_to_calendar', 'fields', 'form_name', 'published_version', 'school_name', 'school_phone', 'status', 'thank_you', 'times'] then
    raise exception 'TEST FAILED: T7e the public answer''s keys changed: %', (select array_agg(k order by k) from jsonb_object_keys(v_r) k);
  end if;
  select string_agg((t ->> 'class_id') || '=' || coalesce(t ->> 'age_from', 'null') || '/' || coalesce(t ->> 'age_to', 'null'), ',' order by t ->> 'class_id')
    into v_txt from jsonb_array_elements(v_r -> 'times') t where t ->> 'date' = v_day::text and t ->> 'class_id' in (v_cw1::text, v_cw2::text, v_cw3::text);
  if v_txt is distinct from (select string_agg(x.k, ',' order by x.k) from (values (v_cw1::text || '=7/12'), (v_cw2::text || '=null/null'),
                                                                                    (v_cw3::text || '=13/null')) as x(k)) then
    raise exception 'TEST FAILED: T7f forms_public_get ages on %: %', v_day, v_txt;
  end if;
  select t into v_t from jsonb_array_elements(v_r -> 'times') t where t ->> 'class_id' = v_cw2::text limit 1;
  if not (v_t ? 'age_from') or not (v_t ? 'age_to') or v_t -> 'age_from' <> 'null'::jsonb then
    raise exception 'TEST FAILED: T7g a class without ages should still have the two keys, as null: %', v_t;
  end if;
  if exists (select 1 from jsonb_array_elements(v_r -> 'times') t
              where (select array_agg(k order by k) from jsonb_object_keys(t) k)
                    <> array['age_from', 'age_to', 'class_id', 'class_name', 'date', 'ends_at', 'spots_left', 'starts_at']) then
    raise exception 'TEST FAILED: T7h each public time should have exactly 0009''s keys plus age_from / age_to';
  end if;

  -- forms_public_submit: w1 (1 spot) is taken, the next family gets
  -- "time_taken" with fresh times - which carry the ages too
  v_ans := jsonb_build_object('parent_name', 'Maria Lopez', 'parent_phone', '(508) 555-0123', 'parent_email', 'maria@example.com',
                              'waiver', true);
  v_kids := jsonb_build_array(jsonb_build_object('first_name', 'Ava', 'age', 8));
  v_book := jsonb_build_array(jsonb_build_object('child', 0, 'class_id', v_cw1, 'date', v_day, 'starts_at', '05:00'));

  -- Prospects -> "Book a free class": prospects_open_times (0012). A
  -- family that signed up without a time becomes a prospect; staff see
  -- the same three times with their ages.
  v_r := public.forms_public_submit(v_slug, 'zz-0031-p', gen_random_uuid(), v_pub, v_ans, v_kids, '[]', v_sig, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: sign-up without a time: %', v_r; end if;
  select p.id into v_prospect from public.prospects p where p.submission_id = (v_r ->> 'id')::uuid and p.child_index = 0;
  if v_prospect is null then raise exception 'TEST SETUP: the sign-up made no prospect'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.prospects_open_times(v_prospect, v_day, v_day);
  perform set_config('request.jwt.claims', v_c_a2, true);
  v_txt := public.prospects_open_times(v_prospect, v_day, v_day) ->> 'status';
  reset role;
  if v_txt <> 'no_access' then raise exception 'TEST FAILED: T7p0 a shut-out session got % from prospects_open_times', v_txt; end if;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T7p1 prospects_open_times: %', v_r; end if;
  select string_agg((t ->> 'class_id') || '=' || coalesce(t ->> 'age_from', 'null') || '/' || coalesce(t ->> 'age_to', 'null'), ',' order by t ->> 'class_id')
    into v_txt from jsonb_array_elements(v_r -> 'times') t where t ->> 'class_id' in (v_cw1::text, v_cw2::text, v_cw3::text);
  if v_txt is distinct from (select string_agg(x.k, ',' order by x.k) from (values (v_cw1::text || '=7/12'), (v_cw2::text || '=null/null'),
                                                                                    (v_cw3::text || '=13/null')) as x(k)) then
    raise exception 'TEST FAILED: T7p2 prospects_open_times ages: %', v_txt;
  end if;
  if exists (select 1 from jsonb_array_elements(v_r -> 'times') t
              where (select array_agg(k order by k) from jsonb_object_keys(t) k)
                    <> array['age_from', 'age_to', 'class_id', 'class_name', 'date', 'ends_at', 'form_id', 'spots_left', 'starts_at']) then
    raise exception 'TEST FAILED: T7p3 each prospects time should have exactly 0012''s keys plus age_from / age_to: %', v_r -> 'times';
  end if;
  if exists (select 1 from jsonb_array_elements(v_r -> 'times') t
              where t ->> 'class_id' in (v_cw1::text, v_cw2::text, v_cw3::text) and t ->> 'form_id' <> v_f1::text) then
    raise exception 'TEST FAILED: T7p4 the test times should come from the test form';
  end if;
  -- still 0012's order (date, start, class name)
  if (select string_agg(t ->> 'class_name', ',' order by o) from jsonb_array_elements(v_r -> 'times') with ordinality as x(t, o)
       where t ->> 'class_id' in (v_cw1::text, v_cw2::text, v_cw3::text))
     <> v_tag || ' w1,' || v_tag || ' w2,' || v_tag || ' w3' then
    raise exception 'TEST FAILED: T7p5 prospects times should still be ordered by class name';
  end if;

  v_r := public.forms_public_submit(v_slug, 'zz-0031-a', gen_random_uuid(), v_pub, v_ans, v_kids, v_book, v_sig, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T7i the first booking should work: %', v_r; end if;
  v_r := public.forms_public_submit(v_slug, 'zz-0031-b', gen_random_uuid(), v_pub, v_ans, v_kids, v_book, v_sig, null);
  if v_r ->> 'status' <> 'time_taken'
     or exists (select 1 from jsonb_array_elements(v_r -> 'times') t where t ->> 'class_id' = v_cw1::text and t ->> 'date' = v_day::text) then
    raise exception 'TEST FAILED: T7j the second booking should be time_taken without w1: %', v_r;
  end if;
  select string_agg((t ->> 'class_id') || '=' || coalesce(t ->> 'age_from', 'null') || '/' || coalesce(t ->> 'age_to', 'null'), ',' order by t ->> 'class_id')
    into v_txt from jsonb_array_elements(v_r -> 'times') t where t ->> 'date' = v_day::text and t ->> 'class_id' in (v_cw2::text, v_cw3::text);
  if v_txt is distinct from (select string_agg(x.k, ',' order by x.k) from (values (v_cw2::text || '=null/null'), (v_cw3::text || '=13/null')) as x(k))
     or exists (select 1 from jsonb_array_elements(v_r -> 'times') t where not (t ? 'age_from') or not (t ? 'age_to')) then
    raise exception 'TEST FAILED: T7k time_taken times should carry the ages: %', v_r -> 'times';
  end if;

  -- -------------------------------------------------------------------
  -- T8: deleting the class in Testing removes its ages row (logged)
  -- -------------------------------------------------------------------
  select coalesce(max(l.id), 0) into v_mark2 from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.testing_delete_class(v_cs1, 1, '{}', '{}', false);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: Testing delete class: %', v_r; end if;
  reset role;
  if exists (select 1 from public.schedule_class_ages k where k.class_id = v_cs1) then
    raise exception 'TEST FAILED: T8a the ages of a deleted class remain';
  end if;
  if not exists (select 1 from public.change_log l where l.id > v_mark2 and l.table_name = 'schedule_class_ages'
                    and l.op = 'delete' and l.action = 'delete_class' and l.location_code = 'shrewsbury') then
    raise exception 'TEST FAILED: T8b the removal should be in change_log as delete_class';
  end if;

  -- -------------------------------------------------------------------
  -- C: catalog
  -- -------------------------------------------------------------------
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.schedule_class_ages'::regclass) then
    raise exception 'TEST FAILED: C1 RLS is off on schedule_class_ages';
  end if;
  if has_table_privilege('anon', 'public.schedule_class_ages', 'select')
     or has_table_privilege('anon', 'public.schedule_class_ages', 'insert')
     or has_table_privilege('service_role', 'public.schedule_class_ages', 'select')
     or has_table_privilege('service_role', 'public.schedule_class_ages', 'insert')
     or has_table_privilege('authenticated', 'public.schedule_class_ages', 'insert')
     or has_table_privilege('authenticated', 'public.schedule_class_ages', 'update')
     or has_table_privilege('authenticated', 'public.schedule_class_ages', 'delete')
     or has_table_privilege('authenticated', 'public.schedule_class_ages', 'truncate')
     or has_any_column_privilege('anon', 'public.schedule_class_ages', 'select')
     or has_any_column_privilege('service_role', 'public.schedule_class_ages', 'select')
     or has_any_column_privilege('forms_registrar', 'public.schedule_class_ages', 'select')
     or has_column_privilege('authenticated', 'public.schedule_class_ages', 'created_by', 'select')
     or has_column_privilege('authenticated', 'public.schedule_class_ages', 'updated_by', 'select')
     or not has_column_privilege('authenticated', 'public.schedule_class_ages', 'age_from', 'select')
     or not has_column_privilege('authenticated', 'public.schedule_class_ages', 'age_to', 'select') then
    raise exception 'TEST FAILED: C2 wrong grants on schedule_class_ages';
  end if;
  if (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'schedule_class_ages') <> 1
     or (select p.cmd from pg_policies p where p.schemaname = 'public' and p.tablename = 'schedule_class_ages') <> 'SELECT'
     or (select p.roles::text from pg_policies p where p.schemaname = 'public' and p.tablename = 'schedule_class_ages') <> '{authenticated}'
     or (select p.qual from pg_policies p where p.schemaname = 'public' and p.tablename = 'schedule_class_ages') not like '%has_data_access()%' then
    raise exception 'TEST FAILED: C3 the policy should be one SELECT for authenticated using has_data_access()';
  end if;
  begin
    truncate public.schedule_class_ages;
    raise exception 'TEST FAILED: C4 truncate should be refused';
  exception when raise_exception then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
  for v_fn in
    select p.proname, p.oid, p.prosecdef, p.proconfig, p.proacl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('schedule_set_class_ages', 'forms_open_times', 'forms_public_get', 'forms_public_submit', 'schedule_before_write',
                         'prospects_open_times')
  loop
    if v_fn.proconfig is distinct from array['search_path=""'] then
      raise exception 'TEST FAILED: C5 % settings are %', v_fn.proname, v_fn.proconfig;
    end if;
    if v_fn.proname <> 'schedule_before_write' and v_fn.prosecdef is not true then
      raise exception 'TEST FAILED: C6 % should be security definer', v_fn.proname;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 0)
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', 10))) as a where a.grantee = 'service_role'::regrole) then
      raise exception 'TEST FAILED: C7 % can be run by anon, PUBLIC or service_role', v_fn.proname;
    end if;
    if v_fn.proname in ('schedule_set_class_ages', 'forms_open_times', 'prospects_open_times') then
      if not has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') or has_function_privilege('forms_registrar', v_fn.oid, 'EXECUTE') then
        raise exception 'TEST FAILED: C8 % should be for authenticated only', v_fn.proname;
      end if;
    elsif v_fn.proname in ('forms_public_get', 'forms_public_submit') then
      if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') or not has_function_privilege('forms_registrar', v_fn.oid, 'EXECUTE') then
        raise exception 'TEST FAILED: C9 % should be for forms_registrar only', v_fn.proname;
      end if;
    elsif has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: C10 the app can call the trigger function %', v_fn.proname;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('schedule_set_class_ages', 'forms_open_times', 'forms_public_get', 'forms_public_submit', 'schedule_before_write',
                         'prospects_open_times')) <> 6 then
    raise exception 'TEST FAILED: C11 expected exactly one of each of the 6 functions (no leftover overloads)';
  end if;
end;
$$;

select 'ALL 0031 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
