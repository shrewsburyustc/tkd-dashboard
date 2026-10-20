-- =====================================================================
-- 0015_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0015_family_history.sql: the
--   family records (sign-ups, bookings, prospects, notes) log into their
--   own history table, family_history, and the 2-year clean-up and
--   "delete prospect" remove a family's history with the family, leaving
--   one counts-only row in change_log. change_log itself stays
--   append-only. The numbered tests follow the design note's section 5
--   (docs/Testing/Color Belt Testing/DECISION-history-purge.md, branch
--   color-belt); test 10 (0015 refuses to run when change_log already
--   holds family rows) and test 11 (fresh / upgrade / twice) are in
--   supabase/tests/pglite/run.mjs, because they need a scratch database.
--   Run it in the Supabase SQL Editor AFTER 0015 is applied.
--
-- IS IT SAFE?
--   Yes. One transaction that ends with ROLLBACK: every change is undone
--   (it even runs the 2-year clean-up - undone too). NEVER change the
--   final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same as 0012_tests.sql: A1 admin (unlocked, fresh password), D1 front
--   desk (unlocked), anon. Functions are called as the SQL Editor's own
--   role with the session claims set, so the test can look at the tables.
--
-- BEFORE YOU RUN IT
--   Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--   the UIDs of an ACTIVE admin and the ACTIVE front-desk account.
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0015 TESTS PASSED".
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

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_slug  text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_today date;
  v_day   date;
  v_dow   smallint;
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg' || repeat('A', 200) || '==';

  v_r     jsonb;
  v_n     integer;
  v_m     integer;
  v_txt   text;
  v_mark  bigint;
  v_fmark bigint;
  v_hid   bigint;
  v_ids   uuid[];
  v_cw1 uuid; v_vw uuid;
  v_f1 uuid; v_pub integer; v_fields jsonb;
  v_ans jsonb;
  v_old1 uuid; v_old2 uuid; v_recent uuid; v_joined uuid; v_mixed uuid; v_sib uuid; v_avanote uuid;
  v_p uuid; v_ava uuid; v_max uuid; v_note uuid; v_book_old uuid;
  v_st_joined uuid;
  v_fn text;
  v_who text;
  v_priv text;
  v_roles text[];

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
  if to_regclass('public.family_history') is null then raise exception 'TEST SETUP: 0015 is not applied'; end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_d1, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'), (v_d1, v_desk, now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;

  v_today := (now() at time zone 'America/New_York')::date;
  v_day   := v_today + 3;
  v_dow   := extract(isodow from v_day)::smallint;

  select max(id) into v_mark from public.change_log;
  -- a Worcester class with two times on v_day (2 free-class spots each)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_cw1 := (public.testing_add_class('worcester', v_tag || ' w1', null, false) ->> 'id')::uuid;
  if v_cw1 is null then raise exception 'TEST SETUP: could not add a test class'; end if;
  select v.id into v_vw from public.schedule_versions v
   where v.location_code = 'worcester' and v.starts_on <= v_day order by v.starts_on desc limit 1;
  -- (no schedule yet: the first time slot makes one, starting today)
  v_r := public.schedule_add_slots('worcester', v_vw, array[v_cw1], array[v_dow], '06:00', '06:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: slot 06:00: %', v_r; end if;
  select v.id into v_vw from public.schedule_versions v
   where v.location_code = 'worcester' and v.starts_on <= v_day order by v.starts_on desc limit 1;
  v_r := public.schedule_add_slots('worcester', v_vw, array[v_cw1], array[v_dow], '07:00', '07:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: slot 07:00: %', v_r; end if;

  -- a Live free-class form offering the class
  select max(id) into v_fmark from public.change_log;
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
  v_r := public.prospect_statuses_add('worcester', v_tag || ' st', 'stage', 'gray');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: status: %', v_r; end if;
  reset role;
  select published_version into v_pub from public.forms where id = v_f1;
  select id into v_st_joined from public.prospect_statuses where location_code = 'worcester' and builtin = 'joined';

  -- -------------------------------------------------------------------
  -- Test 1: change_log is still append-only - for every role, with or
  -- without any tkd.action (0003 is unchanged)
  -- -------------------------------------------------------------------
  foreach v_txt in array array['', 'manual', 'prospects_purge_old', 'prospects_delete'] loop
    perform set_config('tkd.action', v_txt, true);
    begin
      update public.change_log set actor_name = 'x' where id = (select max(id) from public.change_log);
      raise exception 'TEST FAILED: 1a change_log update allowed (tkd.action "%")', v_txt;
    exception when raise_exception then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
    end;
    begin
      delete from public.change_log where id = (select max(id) from public.change_log);
      raise exception 'TEST FAILED: 1b change_log delete allowed (tkd.action "%")', v_txt;
    exception when raise_exception then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
    end;
    begin
      truncate public.change_log;
      raise exception 'TEST FAILED: 1c change_log truncate allowed (tkd.action "%")', v_txt;
    exception when raise_exception then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
    end;
  end loop;
  perform set_config('tkd.action', '', true);
  foreach v_who in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_who, 'public.change_log', 'update') or has_table_privilege(v_who, 'public.change_log', 'delete')
       or has_table_privilege(v_who, 'public.change_log', 'truncate') or has_table_privilege(v_who, 'public.change_log', 'insert') then
      raise exception 'TEST FAILED: 1d % may write change_log', v_who;
    end if;
  end loop;

  -- -------------------------------------------------------------------
  -- Test 2: family_history - RLS on, no policy, granted to nobody
  -- -------------------------------------------------------------------
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.family_history'::regclass) then
    raise exception 'TEST FAILED: 2a RLS is off on family_history';
  end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'family_history') then
    raise exception 'TEST FAILED: 2b family_history must have no policy';
  end if;
  select array_agg(r.rolname) into v_roles from pg_roles r
   where r.rolname in ('anon', 'authenticated', 'service_role', 'forms_registrar', 'testing_registrar', 'star_registrar');
  foreach v_who in array v_roles loop
    foreach v_priv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege(v_who, 'public.family_history', v_priv) then
        raise exception 'TEST FAILED: 2c % has % on family_history', v_who, v_priv;
      end if;
    end loop;
    if has_any_column_privilege(v_who, 'public.family_history', 'select')
       or has_sequence_privilege(v_who, 'public.family_history_id_seq', 'usage') then
      raise exception 'TEST FAILED: 2d % can read family_history or use its sequence', v_who;
    end if;
  end loop;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  begin
    perform 1 from public.family_history limit 1;
    raise exception 'TEST FAILED: 2e an unlocked admin session read family_history directly';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- -------------------------------------------------------------------
  -- Test 3: family_history can't be edited or emptied; a delete only
  -- while the clean-up or "delete prospect" runs
  -- -------------------------------------------------------------------
  insert into public.family_history (actor_name, action, table_name, record_id, op, after)
  values ('zz test', 'manual', 'prospects', gen_random_uuid(), 'insert', '{"zz": true}')
  returning id into v_hid;
  begin
    update public.family_history set actor_name = 'x' where id = v_hid;
    raise exception 'TEST FAILED: 3a family_history update allowed';
  exception when raise_exception then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
  begin
    truncate public.family_history;
    raise exception 'TEST FAILED: 3b family_history truncate allowed';
  exception when raise_exception then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
  foreach v_txt in array array['', 'manual', 'forms_public_submit', 'prospects_set_status'] loop
    perform set_config('tkd.action', v_txt, true);
    begin
      delete from public.family_history where id = v_hid;
      raise exception 'TEST FAILED: 3c family_history delete allowed with tkd.action "%"', v_txt;
    exception when raise_exception then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
    end;
  end loop;
  perform set_config('tkd.action', 'prospects_delete', true);
  delete from public.family_history where id = v_hid;
  perform set_config('tkd.action', '', true);
  if exists (select 1 from public.family_history where id = v_hid) then
    raise exception 'TEST FAILED: 3d the clean-up action should be able to delete';
  end if;

  -- -------------------------------------------------------------------
  -- Test 4: family records log into family_history, not change_log
  -- -------------------------------------------------------------------
  select max(id) into v_mark from public.change_log;
  select coalesce(max(id), 0) into v_hid from public.family_history;
  perform set_config('request.jwt.claims', v_c_d1, true);
  -- the sibling family: Ava (no class) and Max (booked at 06:00)
  v_ans := jsonb_build_object('parent_name', 'Sib Zzparent', 'parent_phone', '(508) 555-0144', 'parent_email', 'sib.zz@example.com', 'waiver', true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans, '[{"first_name":"Avazz","age":10},{"first_name":"Maxzz","age":7}]',
           jsonb_build_array(jsonb_build_object('child', 1, 'class_id', v_cw1, 'date', v_day, 'starts_at', '06:00')), v_sig);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: sibling family: %', v_r; end if;
  v_sib := (v_r ->> 'id')::uuid;
  select id into v_ava from public.prospects where submission_id = v_sib and child_index = 0;
  select id into v_max from public.prospects where submission_id = v_sib and child_index = 1;
  v_r := public.prospects_add_note(v_max, 'Maxzz note: call after 3', false, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: note: %', v_r; end if;
  select id into v_note from public.prospect_notes where prospect_id = v_max;
  v_r := public.prospects_add_note(v_ava, 'Avazz note', false, null);
  select id into v_avanote from public.prospect_notes where prospect_id = v_ava;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from public.family_history h where h.id > v_hid and h.table_name = 'form_submissions' and h.record_id = v_sib
                  and h.op = 'insert' and h.after ->> 'signature' = 'on file')
     or not exists (select 1 from public.family_history h where h.id > v_hid and h.table_name = 'class_bookings'
                     and h.after ->> 'submission_id' = v_sib::text)
     or not exists (select 1 from public.family_history h where h.id > v_hid and h.table_name = 'prospects' and h.record_id = v_max)
     or not exists (select 1 from public.family_history h where h.id > v_hid and h.table_name = 'prospect_notes' and h.record_id = v_note) then
    raise exception 'TEST FAILED: 4a the sign-up, booking, prospects and note should be in family_history';
  end if;
  if exists (select 1 from public.family_history h where h.id > v_hid and (h.after::text like '%data:image%' or h.before::text like '%data:image%')) then
    raise exception 'TEST FAILED: 4b family_history must never hold the signature picture';
  end if;
  if exists (select 1 from public.change_log c where c.id > v_mark
              and c.table_name in ('form_submissions', 'class_bookings', 'prospects', 'prospect_notes')) then
    raise exception 'TEST FAILED: 4c family records must not reach change_log';
  end if;

  -- -------------------------------------------------------------------
  -- Test 5: staff settings still log to change_log
  -- -------------------------------------------------------------------
  if not exists (select 1 from public.change_log c where c.id > v_fmark and c.table_name = 'forms' and c.record_id = v_f1)
     or not exists (select 1 from public.change_log c where c.id > v_fmark and c.table_name = 'form_booking_offers')
     or not exists (select 1 from public.change_log c where c.id > v_fmark and c.table_name = 'prospect_statuses'
                     and c.after ->> 'name' = v_tag || ' st') then
    raise exception 'TEST FAILED: 5a forms, booking offers and statuses should still log to change_log';
  end if;
  if exists (select 1 from public.family_history h where h.table_name in ('forms', 'form_booking_offers', 'form_booking_limits', 'prospect_statuses')) then
    raise exception 'TEST FAILED: 5b staff settings must not log to family_history';
  end if;

  -- -------------------------------------------------------------------
  -- Test 6 + 7: the 2-year clean-up removes exactly its own families,
  -- and afterwards nothing of them is left in either history
  -- -------------------------------------------------------------------
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_ans := jsonb_build_object('parent_name', 'Oldone Zzparent', 'parent_phone', '(508) 555-0111', 'parent_email', 'old1.zz@example.com',
                              'waiver', true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans, '[{"first_name":"Oldkidzz","age":8}]',
           jsonb_build_array(jsonb_build_object('child', 0, 'class_id', v_cw1, 'date', v_day, 'starts_at', '06:00')), v_sig);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: old family 1: %', v_r; end if;
  v_old1 := (v_r ->> 'id')::uuid;
  select id into v_p from public.prospects where submission_id = v_old1;
  select id into v_book_old from public.class_bookings where submission_id = v_old1;
  v_r := public.prospects_add_note(v_p, 'Oldone note text', false, null);
  -- "Change time": the old booking row is replaced by a new one
  v_r := public.prospects_book_time(v_p, (select version from public.prospects where id = v_p), v_f1, v_cw1, v_day, '07:00');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: change time: %', v_r; end if;
  if exists (select 1 from public.class_bookings where id = v_book_old) then
    raise exception 'TEST SETUP: changing the time should replace the booking row';
  end if;
  v_ans := jsonb_build_object('parent_name', 'Oldtwo Zzparent', 'parent_phone', '(508) 555-0122', 'parent_email', 'old2.zz@example.com', 'waiver', true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans, '[{"first_name":"Oldtwokidzz","age":6},{"first_name":"Oldtwosibzz","age":9}]', '[]', v_sig);
  v_old2 := (v_r ->> 'id')::uuid;
  v_ans := jsonb_build_object('parent_name', 'Recent Zzparent', 'parent_phone', '(508) 555-0133', 'parent_email', 'recent.zz@example.com', 'waiver', true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans, '[{"first_name":"Recentkidzz","age":7}]', '[]', v_sig);
  v_recent := (v_r ->> 'id')::uuid;
  v_ans := jsonb_build_object('parent_name', 'Joined Zzparent', 'parent_phone', '(508) 555-0155', 'parent_email', 'joined.zz@example.com', 'waiver', true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans, '[{"first_name":"Joinedkidzz","age":11}]', '[]', v_sig);
  v_joined := (v_r ->> 'id')::uuid;
  -- one Joined child and one not: the family stays
  v_ans := jsonb_build_object('parent_name', 'Mixed Zzparent', 'parent_phone', '(508) 555-0166', 'parent_email', 'mixed.zz@example.com', 'waiver', true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans, '[{"first_name":"Mixjoinzz","age":12},{"first_name":"Mixnotzz","age":8}]', '[]', v_sig);
  v_mixed := (v_r ->> 'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_old2 is null or v_recent is null or v_joined is null or v_mixed is null then raise exception 'TEST SETUP: families: %', v_r; end if;
  -- three families quiet for 25 months (one of them Joined); one quiet for 1 month
  update public.prospects set last_activity_at = now() - interval '25 months' where submission_id in (v_old1, v_old2, v_joined);
  update public.prospects set last_activity_at = now() - interval '1 month' where submission_id = v_recent;
  update public.prospects set status_id = v_st_joined, joined_on = v_today, last_activity_at = now() - interval '25 months' where submission_id = v_joined;
  update public.prospects set last_activity_at = now() - interval '25 months' where submission_id = v_mixed;
  update public.prospects set status_id = v_st_joined, joined_on = v_today, last_activity_at = now() - interval '25 months'
   where submission_id = v_mixed and child_index = 0;
  -- the sibling family stays active (recent), so only old1 + old2 go

  -- every id of the two old families (sign-ups, prospects, notes, bookings - including the replaced one)
  v_ids := array[v_old1, v_old2, v_book_old]
        || (select array_agg(p.id) from public.prospects p where p.submission_id in (v_old1, v_old2))
        || coalesce((select array_agg(n.id) from public.prospect_notes n join public.prospects p on p.id = n.prospect_id
                       where p.submission_id in (v_old1, v_old2)), '{}')
        || coalesce((select array_agg(b.id) from public.class_bookings b where b.submission_id in (v_old1, v_old2)), '{}');
  if not exists (select 1 from public.family_history h where h.record_id = v_book_old) then
    raise exception 'TEST SETUP: the replaced booking should have history before the clean-up';
  end if;
  -- every OTHER family_history row (the kept families, the sibling family's booking and notes)
  select count(*) into v_m from public.family_history h where not (h.record_id = any (v_ids));
  select max(id) into v_mark from public.change_log;
  v_n := public.prospects_purge_old();
  if v_n <> 2 then raise exception 'TEST FAILED: 6a the clean-up should remove exactly 2 families, removed %', v_n; end if;
  if exists (select 1 from public.form_submissions where id in (v_old1, v_old2))
     or not exists (select 1 from public.form_submissions where id = v_recent)
     or not exists (select 1 from public.form_submissions where id = v_joined)
     or not exists (select 1 from public.form_submissions where id = v_sib)
     or not exists (select 1 from public.form_submissions where id = v_mixed) then
    raise exception 'TEST FAILED: 6b the old families go; the recent, Joined, half-Joined and active families stay';
  end if;
  if (select count(*) from public.family_history h where not (h.record_id = any (v_ids))) <> v_m then
    raise exception 'TEST FAILED: 6c every other family''s history must be untouched (% rows before, % after)',
      v_m, (select count(*) from public.family_history h where not (h.record_id = any (v_ids)));
  end if;
  if exists (select 1 from public.family_history h where h.record_id = any (v_ids)) then
    raise exception 'TEST FAILED: 7a family_history still holds rows of the removed records';
  end if;
  foreach v_txt in array array[v_old1::text, v_old2::text, 'Oldkidzz', 'Oldtwokidzz', 'Oldtwosibzz', 'Oldone Zzparent', 'Oldtwo Zzparent',
                               '555-0111', '555-0122', 'old1.zz@example.com', 'old2.zz@example.com', 'Oldone note text']
                        || (select array_agg(x::text) from unnest(v_ids) x) loop
    if exists (select 1 from public.family_history h where coalesce(h.before::text, '') || coalesce(h.after::text, '') like '%' || v_txt || '%')
       or exists (select 1 from public.change_log c where coalesce(c.before::text, '') || coalesce(c.after::text, '') like '%' || v_txt || '%') then
      raise exception 'TEST FAILED: 7b "%" is still in a history table after the clean-up', v_txt;
    end if;
  end loop;
  if (select count(*) from public.change_log c where c.id > v_mark) <> 1
     or not exists (select 1 from public.change_log c where c.id > v_mark and c.action = 'prospects_purge_old' and c.table_name = 'family_history'
                     and c.op = 'delete' and c.before is null and c.after = '{"families": 2, "children": 3}'::jsonb
                     and c.record_id <> all (v_ids)) then
    raise exception 'TEST FAILED: 7c change_log should gain exactly one counts row {families 2, children 3}: %',
      (select jsonb_agg(to_jsonb(c) - 'before') from public.change_log c where c.id > v_mark);
  end if;
  -- nothing to remove: no new row
  select max(id) into v_mark from public.change_log;
  if public.prospects_purge_old() <> 0 or exists (select 1 from public.change_log c where c.id > v_mark) then
    raise exception 'TEST FAILED: 7d a clean-up that removes nobody writes nothing';
  end if;

  -- -------------------------------------------------------------------
  -- Test 8: deleting one sibling, then the last child
  -- -------------------------------------------------------------------
  select max(id) into v_mark from public.change_log;
  v_ids := array[v_max, v_note] || coalesce((select array_agg(b.id) from public.class_bookings b where b.submission_id = v_sib and b.child_index = 1), '{}');
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.prospects_delete(v_max, (select version from public.prospects where id = v_max));
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'family_removed')::boolean then
    raise exception 'TEST FAILED: 8a deleting Max should keep the family: %', v_r;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.family_history h where h.record_id = any (v_ids))
     or exists (select 1 from public.family_history h where coalesce(h.before::text, '') || coalesce(h.after::text, '') like '%Maxzz note%') then
    raise exception 'TEST FAILED: 8b Max''s prospect, note and booking history should be gone';
  end if;
  if not exists (select 1 from public.family_history h where h.table_name = 'form_submissions' and h.record_id = v_sib)
     or not exists (select 1 from public.family_history h where h.table_name = 'prospects' and h.record_id = v_ava)
     or not exists (select 1 from public.family_history h where h.table_name = 'prospect_notes' and h.record_id = v_avanote) then
    raise exception 'TEST FAILED: 8c the sign-up, Ava and Ava''s note keep their history while Ava is there';
  end if;
  if not exists (select 1 from public.change_log c where c.id > v_mark and c.action = 'prospects_delete' and c.table_name = 'family_history'
                  and c.after = '{"families": 0, "children": 1}'::jsonb) then
    raise exception 'TEST FAILED: 8d one counts row {families 0, children 1}';
  end if;
  select max(id) into v_mark from public.change_log;
  v_ids := array[v_sib, v_ava] || coalesce((select array_agg(n.id) from public.prospect_notes n where n.prospect_id = v_ava), '{}');
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.prospects_delete(v_ava, (select version from public.prospects where id = v_ava));
  if v_r ->> 'status' <> 'ok' or not (v_r ->> 'family_removed')::boolean then
    raise exception 'TEST FAILED: 8e deleting the last child removes the family: %', v_r;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.family_history h where h.record_id = any (v_ids))
     or exists (select 1 from public.family_history h where coalesce(h.before::text, '') || coalesce(h.after::text, '') like '%' || v_sib::text || '%')
     or exists (select 1 from public.family_history h where coalesce(h.before::text, '') || coalesce(h.after::text, '') like '%Sib Zzparent%') then
    raise exception 'TEST FAILED: 8f nothing of the sibling family may stay in family_history';
  end if;
  if (select count(*) from public.change_log c where c.id > v_mark) <> 1
     or not exists (select 1 from public.change_log c where c.id > v_mark and c.action = 'prospects_delete'
                     and c.after = '{"families": 1, "children": 1}'::jsonb) then
    raise exception 'TEST FAILED: 8g one counts row {families 1, children 1}';
  end if;
  if exists (select 1 from public.change_log c where coalesce(c.before::text, '') || coalesce(c.after::text, '') like '%Sib Zzparent%') then
    raise exception 'TEST FAILED: 8h change_log must never hold the family';
  end if;

  -- -------------------------------------------------------------------
  -- Test 9: every other table's history is still in change_log
  -- -------------------------------------------------------------------
  if not exists (select 1 from public.change_log c where c.table_name = 'testing_classes' and c.record_id = v_cw1)
     or not exists (select 1 from public.change_log c where c.table_name = 'schedule_slots' and c.action = 'schedule_add_slots'
                     and c.after ->> 'version_id' = v_vw::text) then
    raise exception 'TEST FAILED: 9a Testing and Schedule writes should still be in change_log';
  end if;
  if exists (select 1 from public.family_history h
              where h.table_name not in ('form_submissions', 'class_bookings', 'prospects', 'prospect_notes')) then
    raise exception 'TEST FAILED: 9b family_history holds only the four family tables';
  end if;

  -- -------------------------------------------------------------------
  -- Catalog: who may run the new functions
  -- -------------------------------------------------------------------
  foreach v_fn in array array['family_history_write()', 'family_history_refuse_change()', 'family_history_guard_delete()',
                              'family_history_forget(uuid[], smallint, uuid[])', 'family_history_counts_row(integer, integer, text)',
                              'forms_submissions_log()', 'prospects_purge_old()'] loop
    foreach v_who in array array['public', 'anon', 'authenticated', 'service_role'] loop
      if v_who = 'public' then
        if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where p.oid = ('public.' || v_fn)::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
          raise exception 'TEST FAILED: C1 PUBLIC may run %', v_fn;
        end if;
      elsif has_function_privilege(v_who, 'public.' || v_fn, 'execute') then
        raise exception 'TEST FAILED: C1 % may run %', v_who, v_fn;
      end if;
    end loop;
  end loop;
  if not has_function_privilege('authenticated', 'public.prospects_delete(uuid, integer)', 'execute')
     or has_function_privilege('anon', 'public.prospects_delete(uuid, integer)', 'execute') then
    raise exception 'TEST FAILED: C2 prospects_delete: signed-in staff only';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('family_history_write', 'forms_submissions_log', 'prospects_delete')
         and not (p.prosecdef and p.proconfig @> array['search_path=""'])) > 0
     or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname like 'family\_history\_%'
            and not coalesce(p.proconfig @> array['search_path=""'], false)) > 0 then
    raise exception 'TEST FAILED: C3 every 0015 function sets search_path = '''' (and the writers are security definer)';
  end if;
  if (select count(*) from pg_trigger t where not t.tgisinternal
       and t.tgname in ('class_bookings_log', 'prospects_log', 'prospect_notes_log')
       and t.tgfoid = 'public.family_history_write()'::regprocedure) <> 3
     or (select count(*) from pg_trigger t where t.tgname = 'form_submissions_log'
          and t.tgfoid = 'public.forms_submissions_log()'::regprocedure) <> 1
     or (select count(*) from pg_trigger t where not t.tgisinternal
          and t.tgname in ('forms_log', 'form_booking_offers_log', 'form_booking_limits_log', 'prospect_statuses_log')
          and t.tgfoid = 'public.change_log_write()'::regprocedure) <> 4 then
    raise exception 'TEST FAILED: C4 the history triggers point at the wrong functions';
  end if;
end;
$$;

select 'ALL 0015 TESTS PASSED' as result;

rollback;
