-- =====================================================================
-- 0021_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0021_prospects_not_interested_sooner.sql
--   (rulebook v0.611): the Prospects clean-up deletes a family in which
--   every child is "Not interested" 6 months after its last activity; any
--   other family without a Joined child after 2 years, as before; Joined
--   never. Re-running 0021 and "fresh = live order" are in
--   supabase/tests/pglite/run.mjs (step0021), because they need a scratch
--   database. Run it in the Supabase SQL Editor AFTER 0021 is applied.
--
-- IS IT SAFE?
--   Yes. One transaction that ends with ROLLBACK: every change is undone
--   (it runs the clean-up on its own test families - undone too). NEVER
--   change the final "rollback;" to "commit;".
--   It counts only ITS OWN families, so a real family that happens to be due
--   for the clean-up at that moment doesn't make it fail (it would be
--   deleted inside the test and then put back by the rollback).
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same as 0015_tests.sql: D1 front desk (unlocked) to add the families and
--   change a status; A1 admin to set up the form.
--
-- BEFORE YOU RUN IT
--   Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--   the UIDs of an ACTIVE admin and the ACTIVE front-desk account.
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0021 TESTS PASSED".
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
  v_sig  text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg' || repeat('A', 200) || '==';

  v_f1 uuid; v_pub integer; v_r jsonb; v_n integer; v_mark bigint; v_p uuid; v_ver integer;
  v_st_ni uuid; v_st_joined uuid; v_st_contacted uuid;
  v_ni_old uuid; v_ni_recent uuid; v_ni_mixed uuid; v_ni_both uuid; v_new_old uuid; v_new_mid uuid; v_joined uuid; v_marked uuid;
  v_ni_joinsib uuid; v_noshow uuid; v_edge_in uuid; v_edge_out uuid; v_st_noshow uuid;
  v_mine uuid[];
  v_fn text := 'public.prospects_purge_old()';
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

  -- a Live walk-in style form (no booking needed) for the test families
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.forms_create('worcester', 'free_class', v_tag || ' form', v_slug);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: create form: %', v_r; end if;
  v_f1 := (v_r ->> 'id')::uuid;
  v_r := public.forms_save_draft(v_f1, (v_r ->> 'version')::integer, v_tag || ' form', v_slug,
           jsonb_set(public.forms_template('free_class'), '{8,text}', to_jsonb('Our wording.'::text)),
           '{"thank_you":"","alert_email":null,"confirm_email":false,"add_to_calendar":false}');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: save draft: %', v_r; end if;
  v_r := public.forms_publish(v_f1, (v_r ->> 'version')::integer);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: publish: %', v_r; end if;
  select published_version into v_pub from public.forms where id = v_f1;
  select id into v_st_ni from public.prospect_statuses where location_code = 'worcester' and builtin = 'not_interested';
  select id into v_st_joined from public.prospect_statuses where location_code = 'worcester' and builtin = 'joined';
  select id into v_st_noshow from public.prospect_statuses where location_code = 'worcester' and builtin = 'no_show';
  select id into v_st_contacted from public.prospect_statuses where location_code = 'worcester' and builtin is null and kind = 'stage' order by position limit 1;
  if v_st_ni is null or v_st_joined is null or v_st_contacted is null then raise exception 'TEST SETUP: Worcester statuses missing'; end if;

  -- the families (front desk "Fill in": no booking)
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Niold Zzparent', 'parent_phone', '(508) 555-0211', 'parent_email', 'niold.zz@example.com', 'waiver', true),
           '[{"first_name":"Nioldkidzz","age":8}]', '[]', v_sig);
  v_ni_old := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Nirecent Zzparent', 'parent_phone', '(508) 555-0212', 'parent_email', 'nirecent.zz@example.com', 'waiver', true),
           '[{"first_name":"Nirecentkidzz","age":7}]', '[]', v_sig);
  v_ni_recent := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Nimixed Zzparent', 'parent_phone', '(508) 555-0213', 'parent_email', 'nimixed.zz@example.com', 'waiver', true),
           '[{"first_name":"Nimixnozz","age":9},{"first_name":"Nimixstillzz","age":6}]', '[]', v_sig);
  v_ni_mixed := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Niboth Zzparent', 'parent_phone', '(508) 555-0214', 'parent_email', 'niboth.zz@example.com', 'waiver', true),
           '[{"first_name":"Nibothonezz","age":10},{"first_name":"Nibothtwozz","age":12}]', '[]', v_sig);
  v_ni_both := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Newold Zzparent', 'parent_phone', '(508) 555-0215', 'parent_email', 'newold.zz@example.com', 'waiver', true),
           '[{"first_name":"Newoldkidzz","age":8}]', '[]', v_sig);
  v_new_old := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Newmid Zzparent', 'parent_phone', '(508) 555-0216', 'parent_email', 'newmid.zz@example.com', 'waiver', true),
           '[{"first_name":"Newmidkidzz","age":8}]', '[]', v_sig);
  v_new_mid := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Joinedni Zzparent', 'parent_phone', '(508) 555-0217', 'parent_email', 'joinedni.zz@example.com', 'waiver', true),
           '[{"first_name":"Joinedkidzz","age":11}]', '[]', v_sig);
  v_joined := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Marked Zzparent', 'parent_phone', '(508) 555-0218', 'parent_email', 'marked.zz@example.com', 'waiver', true),
           '[{"first_name":"Markedkidzz","age":8}]', '[]', v_sig);
  v_marked := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Nijoinsib Zzparent', 'parent_phone', '(508) 555-0219', 'parent_email', 'nijoinsib.zz@example.com', 'waiver', true),
           '[{"first_name":"Nijsnozz","age":9},{"first_name":"Nijsjoinedzz","age":12}]', '[]', v_sig);
  v_ni_joinsib := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Noshow Zzparent', 'parent_phone', '(508) 555-0220', 'parent_email', 'noshow.zz@example.com', 'waiver', true),
           '[{"first_name":"Noshowkidzz","age":8}]', '[]', v_sig);
  v_noshow := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Edgein Zzparent', 'parent_phone', '(508) 555-0221', 'parent_email', 'edgein.zz@example.com', 'waiver', true),
           '[{"first_name":"Edgeinkidzz","age":8}]', '[]', v_sig);
  v_edge_in := (v_r ->> 'id')::uuid;
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Edgeout Zzparent', 'parent_phone', '(508) 555-0222', 'parent_email', 'edgeout.zz@example.com', 'waiver', true),
           '[{"first_name":"Edgeoutkidzz","age":8}]', '[]', v_sig);
  v_edge_out := (v_r ->> 'id')::uuid;
  if v_ni_old is null or v_ni_recent is null or v_ni_mixed is null or v_ni_both is null or v_new_old is null
     or v_new_mid is null or v_joined is null or v_marked is null or v_ni_joinsib is null or v_noshow is null
     or v_edge_in is null or v_edge_out is null then
    raise exception 'TEST SETUP: a test family was not saved: %', v_r;
  end if;
  v_mine := array[v_ni_old, v_ni_recent, v_ni_mixed, v_ni_both, v_new_old, v_new_mid, v_joined, v_marked,
                  v_ni_joinsib, v_noshow, v_edge_in, v_edge_out];
  -- (2b below is only meaningful if the families HAVE history now)
  if not exists (select 1 from public.family_history h where h.record_id in (v_ni_old, v_ni_both, v_new_old)) then
    raise exception 'TEST SETUP: the test families should have history before the clean-up';
  end if;

  -- "Marked": quiet for 8 months, then the front desk marks it Not interested TODAY
  -- (through the app's own function): that is activity, so its 6 months start now.
  perform set_config('request.jwt.claims', '', true);
  update public.prospects set last_activity_at = now() - interval '8 months' where submission_id = v_marked;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select id, version into v_p, v_ver from public.prospects where submission_id = v_marked;
  v_r := public.prospects_set_status(v_p, v_ver, v_st_ni, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: mark Not interested: %', v_r; end if;
  if (select last_activity_at from public.prospects where id = v_p) < now() - interval '1 minute' then
    raise exception 'TEST FAILED: 0 marking someone Not interested must count as activity (restart the clock)';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ages and statuses (as the SQL Editor's role)
  update public.prospects set status_id = v_st_ni, last_activity_at = now() - interval '7 months' where submission_id = v_ni_old;
  update public.prospects set status_id = v_st_ni, last_activity_at = now() - interval '5 months' where submission_id = v_ni_recent;
  -- one child Not interested, the brother still Contacted: not "all Not interested" -> 2 years
  update public.prospects set status_id = v_st_ni, last_activity_at = now() - interval '7 months' where submission_id = v_ni_mixed and child_index = 0;
  update public.prospects set status_id = v_st_contacted, last_activity_at = now() - interval '7 months' where submission_id = v_ni_mixed and child_index = 1;
  -- both children Not interested; the family's LAST activity counts (7 months) -> goes
  update public.prospects set status_id = v_st_ni, last_activity_at = now() - interval '9 months' where submission_id = v_ni_both and child_index = 0;
  update public.prospects set status_id = v_st_ni, last_activity_at = now() - interval '7 months' where submission_id = v_ni_both and child_index = 1;
  -- not Not interested: the 2 years still apply
  update public.prospects set last_activity_at = now() - interval '25 months' where submission_id = v_new_old;
  update public.prospects set last_activity_at = now() - interval '7 months' where submission_id = v_new_mid;
  -- Joined, quiet for 3 years: never deleted
  update public.prospects set status_id = v_st_joined, joined_on = current_date - 1000, last_activity_at = now() - interval '3 years' where submission_id = v_joined;
  -- one child Not interested, the sibling Joined, both quiet 3 years: never deleted
  update public.prospects set status_id = v_st_ni, last_activity_at = now() - interval '3 years' where submission_id = v_ni_joinsib and child_index = 0;
  update public.prospects set status_id = v_st_joined, joined_on = current_date - 1000, last_activity_at = now() - interval '3 years' where submission_id = v_ni_joinsib and child_index = 1;
  -- No-show (not Not interested), quiet 7 months: the 2 years apply
  update public.prospects set status_id = v_st_noshow, last_activity_at = now() - interval '7 months' where submission_id = v_noshow;
  -- the boundary: Not interested 6 months + 1 day goes, 6 months - 1 day stays
  update public.prospects set status_id = v_st_ni, last_activity_at = now() - interval '6 months' - interval '1 day' where submission_id = v_edge_in;
  update public.prospects set status_id = v_st_ni, last_activity_at = now() - interval '6 months' + interval '1 day' where submission_id = v_edge_out;

  -- -------------------------------------------------------------------
  -- Test 1: the clean-up removes exactly the right test families
  -- -------------------------------------------------------------------
  select max(id) into v_mark from public.change_log;
  v_n := public.prospects_purge_old();
  if exists (select 1 from public.form_submissions where id in (v_ni_old, v_ni_both, v_new_old, v_edge_in)) then
    raise exception 'TEST FAILED: 1a should be deleted: all-Not-interested quiet 7 months (both kinds), 6 months + 1 day, and New quiet 25 months';
  end if;
  if (select count(*) from public.form_submissions
       where id in (v_ni_recent, v_ni_mixed, v_new_mid, v_joined, v_marked, v_ni_joinsib, v_noshow, v_edge_out)) <> 8 then
    raise exception 'TEST FAILED: 1b should be kept: NI 5 months, mixed, New 7 months, Joined, just marked, NI + Joined sibling, No-show 7 months, NI 6 months - 1 day (kept: %)',
      (select array_agg(f.parent_name) from public.form_submissions f where f.id = any (v_mine));
  end if;
  if v_n < 4 then raise exception 'TEST FAILED: 1c the clean-up reported % families, expected at least the 4 test families', v_n; end if;

  -- -------------------------------------------------------------------
  -- Test 2: nothing of them is left; one counts-only row (as 0015)
  -- -------------------------------------------------------------------
  if exists (select 1 from public.prospects where submission_id in (v_ni_old, v_ni_both, v_new_old)) then
    raise exception 'TEST FAILED: 2a their children (prospects) are still there';
  end if;
  if exists (select 1 from public.family_history h
              where h.record_id in (v_ni_old, v_ni_both, v_new_old)
                 or coalesce(h.before::text, '') || coalesce(h.after::text, '') ~ 'Niold Zzparent|Niboth Zzparent|Newold Zzparent|Nioldkidzz|Nibothonezz|Nibothtwozz|Newoldkidzz') then
    raise exception 'TEST FAILED: 2b family_history still holds the deleted families';
  end if;
  if not exists (select 1 from public.change_log c where c.id > v_mark and c.action = 'prospects_purge_old' and c.table_name = 'family_history'
                  and c.op = 'delete' and c.before is null and (c.after ->> 'families')::integer >= 4 and (c.after ->> 'children')::integer >= 5) then
    raise exception 'TEST FAILED: 2c change_log should gain one counts row (at least 4 families, 5 children): %',
      (select jsonb_agg(to_jsonb(c) - 'before') from public.change_log c where c.id > v_mark);
  end if;
  if exists (select 1 from public.change_log c where c.id > v_mark
              and coalesce(c.before::text, '') || coalesce(c.after::text, '') ~ 'Zzparent|kidzz|555-021') then
    raise exception 'TEST FAILED: 2d a name or phone of a deleted family reached change_log';
  end if;

  -- -------------------------------------------------------------------
  -- Test 3: a second run finds nothing more of ours to remove
  -- -------------------------------------------------------------------
  perform public.prospects_purge_old();
  if (select count(*) from public.form_submissions
       where id in (v_ni_recent, v_ni_mixed, v_new_mid, v_joined, v_marked, v_ni_joinsib, v_noshow, v_edge_out)) <> 8 then
    raise exception 'TEST FAILED: 3 a second clean-up removed a family it should keep';
  end if;

  -- -------------------------------------------------------------------
  -- Test 4: the boundary moves with activity - the 5-month family, made
  -- 7 months quiet, goes; the mixed family once BOTH children are Not
  -- interested goes too
  -- -------------------------------------------------------------------
  update public.prospects set last_activity_at = now() - interval '7 months' where submission_id = v_ni_recent;
  update public.prospects set status_id = v_st_ni where submission_id = v_ni_mixed and child_index = 1;
  perform public.prospects_purge_old();
  if exists (select 1 from public.form_submissions where id in (v_ni_recent, v_ni_mixed)) then
    raise exception 'TEST FAILED: 4a an all-Not-interested family quiet for 7 months should go';
  end if;
  if (select count(*) from public.form_submissions where id in (v_new_mid, v_joined, v_marked)) <> 3 then
    raise exception 'TEST FAILED: 4b New 7 months, Joined and the just-marked family must stay';
  end if;

  -- -------------------------------------------------------------------
  -- Catalog: the function is not callable by anyone in the app (as 0015)
  -- -------------------------------------------------------------------
  if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('authenticated', v_fn, 'execute')
     or has_function_privilege('public', v_fn, 'execute') or has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'TEST FAILED: C1 prospects_purge_old must not be callable directly';
  end if;
  if (select p.prosecdef from pg_proc p where p.oid = v_fn::regprocedure) is not false
     or (select p.proconfig from pg_proc p where p.oid = v_fn::regprocedure) is distinct from array['search_path=""'] then
    raise exception 'TEST FAILED: C2 prospects_purge_old must stay security invoker with an empty search_path';
  end if;
end;
$$;

select 'ALL 0021 TESTS PASSED' as result;

rollback;
