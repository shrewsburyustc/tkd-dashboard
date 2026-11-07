-- =====================================================================
-- 0044_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0044_color_belt_rolling_check.sql
--   (Color Belt rolling check, step A: M-01, R2-02, R1-01). It checks, in
--   this order:
--     W1  who may call what: anon may run none of the app functions; the
--         trigger functions are for nobody; the old 4-input Mark paid
--         versions are gone (one version each); a session without data
--         access gets no_access
--     F1  M-01, the family form's own "Paying by" (paying_by_on_form):
--         a form registration keeps what it sent; a desk registration
--         has none (whatever the insert sent); nobody can change it (a
--         direct update keeps it, with no version bump and no history
--         row); Change how they'll pay / Mark paid / Edit payment by
--         another way leave it alone; the roster view shows it
--     F2  M-01 on private testings: one added at the desk has none; Move
--         to private carries the registration's value (a desk
--         registration: none); Undo move leaves the registration's value
--         as it was; the private list view shows it
--     P1  R1-01, the school of the desk on event payments: the live app's
--         4-input call (by position and by name) stores the event's
--         school; p_school 'shrewsbury' is stored; blank = the event's
--         school; an unknown school -> invalid {field: school}, nothing
--         written; Undo payment and Edit payment copy it; the answer keys
--         are 0030's
--     P2  the same on private payments (empty = the private testing's
--         school), Undo / Edit copy it
--     P3  Move to private keeps each payment's school (event reversal and
--         private payment), Undo move brings it back to the event
--     P4  the table rules: a payment written without a school (the old
--         2-input Mark paid, or the SQL Editor) gets the event's /
--         private testing's school; a reversal always has its payment's
--         school (a different one is refused); a school that doesn't
--         exist is refused
--     U1  R2-02, Edit event's Undo in one call: details + switch back,
--         one call; no_access / not_allowed (the desk) / invalid /
--         not_found / stale with nothing written; a refused second step
--         (the event is finished) undoes the first; a refused first step
--         (duplicate name) writes nothing; p_open null leaves the switch
--         alone
--     K1  catalog: security definer, search_path = '', rights (only
--         authenticated; the trigger functions for nobody), the new
--         columns' rights (paying_by_on_form readable on both tables;
--         school readable on testing_private_payments only), the 4
--         triggers enabled, the 4 rules
--   It makes its own class "zz cb44 ..." and events, so it works whatever
--   is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change. NEVER change the final
--   "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   0005, 0010, 0011, 0014, 0018, 0030 and 0044 are applied (0035 may or
--   may not be). You need two ACTIVE staff rows: an admin and the shared
--   front desk (role staff). Replace <paste-admin-UID-here> and
--   <paste-desk-UID-here> below with their UIDs (Authentication -> Users),
--   paste the whole file into the SQL Editor and click Run. Everything is
--   rolled back.
--
-- HOW TO READ THE RESULT
--   Passed: one row "ALL 0044 TESTS PASSED". Failed: an error starting
--   with "TEST FAILED:" (or "TEST SETUP:") saying which check broke and
--   what came back. Nothing was saved either way. If it failed, run
--   rollback;   on its own once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Test helpers (temporary: they vanish with the session, and the
-- rollback undoes them anyway)
-- ---------------------------------------------------------------------

-- every answer a function gave during the test (for the K1 key check)
create temp table t_answers (fn text, r jsonb);

-- t_call(role, login token, call): run ONE function call as that role and
-- login, then switch back to the SQL Editor's role. Returns the answer.
create function pg_temp.t_call(p_role text, p_claims text, p_call text)
returns jsonb
language plpgsql
as $$
declare
  v_r jsonb;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  if p_role = 'anon' then
    set local role anon;
  else
    set local role authenticated;
  end if;
  begin
    execute 'select ' || p_call into v_r;
  exception
    when others then
      reset role;
      raise;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into t_answers values (p_call, v_r);
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
-- Callable by the logged-in role too: the test calls it inside "set local role authenticated", and
-- production gives functions made by the SQL Editor's role no rights for anyone else.
grant execute on function pg_temp.t_eq(text, text, text) to public;

-- t_reg(event, event rank, first, last, paying by): one desk-added
-- registration written straight into the table (as the SQL Editor)
create function pg_temp.t_reg(p_event uuid, p_rank uuid, p_first text, p_last text, p_paying_by text)
returns uuid
language sql
as $$
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (p_event, p_rank, p_first, p_last, p_paying_by, true, 'staff')
  returning id;
$$;

-- t_form(event, event rank, first, last, paying by, signature): one FAMILY
-- FORM registration written straight into the table (as the family form's
-- function writes it: source 'form' with its form fields)
create function pg_temp.t_form(p_event uuid, p_rank uuid, p_first text, p_last text, p_paying_by text, p_sig text)
returns uuid
language sql
as $$
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
                                            submission_id, signature, signed_at, ack_version)
  values (p_event, p_rank, p_first, p_last, p_paying_by, true, 'form', gen_random_uuid(), p_sig, now(), 'cb44-test')
  returning id;
$$;

create function pg_temp.t_ver(p_id uuid)
returns integer
language sql
as $$ select r.version from public.testing_registrations r where r.id = p_id; $$;

create function pg_temp.t_pver(p_id uuid)
returns integer
language sql
as $$ select p.version from public.testing_private p where p.id = p_id; $$;

create function pg_temp.t_onform(p_id uuid)
returns text
language sql
as $$ select coalesce(r.paying_by_on_form, '-') from public.testing_registrations r where r.id = p_id; $$;

create function pg_temp.t_ponform(p_id uuid)
returns text
language sql
as $$ select coalesce(p.paying_by_on_form, '-') from public.testing_private p where p.id = p_id; $$;

-- t_schools(registration) / t_pschools(private): every payment row of it,
-- in the order they were written (by their history insert row: inside
-- this one transaction every recorded_at is the same), as
-- "kind:amount:school"
create function pg_temp.t_schools(p_id uuid)
returns text
language sql
as $$
  select string_agg(p.kind || ':' || p.amount_cents || ':' || p.school, ','
                    order by (select l.id from public.change_log l
                               where l.table_name = 'testing_payments' and l.record_id = p.id and l.op = 'insert'))
    from public.testing_payments p where p.registration_id = p_id;
$$;

create function pg_temp.t_pschools(p_id uuid)
returns text
language sql
as $$
  select string_agg(x.kind || ':' || x.amount_cents || ':' || x.school, ','
                    order by (select l.id from public.change_log l
                               where l.table_name = 'testing_private_payments' and l.record_id = x.id and l.op = 'insert'))
    from public.testing_private_payments x where x.private_id = p_id;
$$;

-- t_state(): everything a refused call must leave as it was
create function pg_temp.t_state()
returns text
language sql
as $$
  select (select count(*) from public.change_log)::text || '/'
      || (select count(*) from public.testing_payments)::text || '/'
      || (select count(*) from public.testing_private_payments)::text || '/'
      || (select md5(coalesce(string_agg(r.id::text || r.version || r.paying_by || coalesce(r.paying_by_on_form, '-'), ',' order by r.id), ''))
            from public.testing_registrations r) || '/'
      || (select md5(coalesce(string_agg(p.id::text || p.version || p.paying_by || coalesce(p.paying_by_on_form, '-'), ',' order by p.id), ''))
            from public.testing_private p) || '/'
      || (select md5(coalesce(string_agg(e.id::text || e.version || e.name || e.registration_open, ',' order by e.id), ''))
            from public.testing_events e);
$$;

-- t_keys(json): every object key anywhere inside a JSON value
create function pg_temp.t_keys(p jsonb)
returns setof text
language sql
as $$
  with recursive w(v) as (
    select p
    union all
    select e.value
      from w,
           lateral (select x.value from jsonb_each(case when jsonb_typeof(w.v) = 'object' then w.v else '{}'::jsonb end) as x
                    union all
                    select y.value from jsonb_array_elements(case when jsonb_typeof(w.v) = 'array' then w.v else '[]'::jsonb end) as y) as e
  )
  select distinct k
    from w, lateral jsonb_object_keys(case when jsonb_typeof(w.v) = 'object' then w.v else '{}'::jsonb end) as k;
$$;


do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();
  v_d1 uuid := gen_random_uuid();
  v_n1 uuid := gen_random_uuid();   -- a session that was never unlocked = no data access
  v_amr jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60));
  v_c_a1 text;
  v_c_d1 text;
  v_c_n1 text;

  v_tag   text := 'zz cb44 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_role  text;
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  v_cls   uuid;  v_rk1 uuid;
  v_e     uuid;  v_ek  uuid;        -- the Worcester event in 5 days and its Yellow rank copy
  v_u     uuid;                     -- U1's event
  v_fin   uuid;                     -- U1's finished event
  v_r     jsonb;
  v_s     text;
  v_n     integer;
  v_v     integer;
  v_fn    record;
  v_f1    uuid;  v_f2  uuid;  v_f3  uuid;  v_f4  uuid;  v_f5  uuid;   -- form registrations
  v_d     uuid;  v_d2  uuid;                                          -- desk registrations
  v_p     uuid;  v_p2  uuid;  v_pm  uuid;  v_pm2 uuid;                -- private testings
  v_pay   uuid;  v_new uuid;
  v_classes jsonb;
  v_maxid bigint;
  v_bad   text[] := array['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'cancelled_by', 'submission_id',
                          'actor_id', 'session_id'];
begin
  -- ===================================================================
  -- Setup (as the SQL Editor's role)
  -- ===================================================================
  select s.role into v_role from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role into v_role from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regprocedure('public.testing_undo_event_edit(uuid, integer, text, date, jsonb, date, text, boolean)') is null
     or to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer, text)') is null then
    raise exception 'TEST SETUP: 0044 is not applied';
  end if;
  if not exists (select 1 from public.locations l where l.code = 'shrewsbury')
     or not exists (select 1 from public.locations l where l.code = 'worcester') then
    raise exception 'TEST SETUP: the schools worcester and shrewsbury must exist';
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_d1, v_desk), (v_n1, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr)::text;
  v_c_n1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_n1, 'amr', v_amr)::text;

  -- a Worcester test class: Yellow (early 65.00, day 75.00, private 85.00)
  v_cls := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_class(%L, %L, null, true)', 'worcester', v_tag)) ->> 'id')::uuid;
  v_rk1 := (pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_add_rank(%L, %L, 6500, 7500, 8500, false, %L, %L, null, 0, %L)', v_cls, 'Yellow', 'solid', 'yellow', 'yellow')) ->> 'id')::uuid;
  v_classes := jsonb_build_array(jsonb_build_object('class_id', v_cls, 'start_time', '17:00', 'end_time', '18:00'));
  v_e := (pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' later', v_today + 5, v_classes::text)) ->> 'id')::uuid;
  if v_rk1 is null or v_e is null then
    raise exception 'TEST SETUP: could not create the test class / rank / event';
  end if;
  select k.id into v_ek from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_e and k.rank_id = v_rk1;


  -- ===================================================================
  -- W1. Who may call what
  -- ===================================================================
  for v_fn in
    select * from (values ('testing_mark_paid_by(uuid, integer, text, integer, text)'),
                          ('testing_private_mark_paid_by(uuid, integer, text, integer, text)'),
                          ('testing_undo_payment(uuid)'), ('testing_private_undo_payment(uuid)'),
                          ('testing_edit_payment(uuid, text, integer, date)'),
                          ('testing_private_edit_payment(uuid, text, integer, date)'),
                          ('testing_move_to_private(uuid, integer, date, time)'),
                          ('testing_private_undo_move(uuid, integer)'),
                          ('testing_undo_event_edit(uuid, integer, text, date, jsonb, date, text, boolean)')) as f(sig)
  loop
    perform pg_temp.t_eq('W1 anon may not run ' || v_fn.sig,
      has_function_privilege('anon', 'public.' || v_fn.sig, 'execute')::text, 'false');
    perform pg_temp.t_eq('W1 service_role may not run ' || v_fn.sig,
      has_function_privilege('service_role', 'public.' || v_fn.sig, 'execute')::text, 'false');
    perform pg_temp.t_eq('W1 authenticated may run ' || v_fn.sig,
      has_function_privilege('authenticated', 'public.' || v_fn.sig, 'execute')::text, 'true');
  end loop;
  for v_fn in
    select * from (values ('testing_registrations_keep_form_choice()'), ('testing_private_keep_form_choice()'),
                          ('testing_payments_set_school()'), ('testing_private_payments_set_school()')) as f(sig)
  loop
    perform pg_temp.t_eq('W1 nobody in the app may run ' || v_fn.sig,
      (has_function_privilege('anon', 'public.' || v_fn.sig, 'execute')
       or has_function_privilege('authenticated', 'public.' || v_fn.sig, 'execute')
       or has_function_privilege('service_role', 'public.' || v_fn.sig, 'execute'))::text, 'false');
  end loop;
  perform pg_temp.t_eq('W1 the old 4-input Mark paid versions are gone, one version each is left',
    (select string_agg(p.proname || ':' || p.pronargs || ':' || p.pronargdefaults, ',' order by p.proname collate "C") from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('testing_mark_paid_by', 'testing_private_mark_paid_by', 'testing_undo_event_edit')),
    'testing_mark_paid_by:5:1,testing_private_mark_paid_by:5:1,testing_undo_event_edit:8:0');
  -- anon really is refused
  begin
    perform pg_temp.t_call('anon', null, format('public.testing_undo_event_edit(%L, 1, %L, %L, %L::jsonb, null, null, null)',
      v_e, 'x', v_today + 5, v_classes::text));
    raise exception 'TEST FAILED: W1 anon could run testing_undo_event_edit';
  exception
    when insufficient_privilege then null;
  end;
  v_d := pg_temp.t_reg(v_e, v_ek, 'Cb44', 'Access', 'cash');
  v_s := pg_temp.t_state();
  for v_fn in
    select * from (values (format('public.testing_mark_paid_by(%L, 1, %L, 6500, %L)', v_d, 'cash', 'shrewsbury')),
                          (format('public.testing_undo_event_edit(%L, 1, %L, %L, %L::jsonb, null, null, null)',
                                  v_e, v_tag || ' later', v_today + 5, v_classes::text))) as f(c)
  loop
    perform pg_temp.t_eq('W1 no data access: ' || v_fn.c, pg_temp.t_call('authenticated', v_c_n1, v_fn.c) ->> 'status', 'no_access');
  end loop;
  perform pg_temp.t_eq('W1 the refused calls wrote nothing', pg_temp.t_state(), v_s);


  -- ===================================================================
  -- F1. M-01: the family form's own "Paying by" on registrations
  -- ===================================================================
  v_f1 := pg_temp.t_form(v_e, v_ek, 'Cb44', 'Formcheck', 'check', v_sig);
  perform pg_temp.t_eq('F1 a form registration keeps its own choice', pg_temp.t_onform(v_f1), 'check');
  perform pg_temp.t_eq('F1 a desk registration has none', pg_temp.t_onform(v_d), '-');
  -- the insert row in the history has it (the History line can show it)
  perform pg_temp.t_eq('F1 the history insert row of the form registration has paying_by_on_form',
    (select l.after ->> 'paying_by_on_form' from public.change_log l
      where l.table_name = 'testing_registrations' and l.record_id = v_f1 and l.op = 'insert'), 'check');
  -- a desk insert that SENDS a value gets none
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
                                            paying_by_on_form)
  values (v_e, v_ek, 'Cb44', 'Sneaky', 'card', true, 'staff', 'card')
  returning id into v_d2;
  perform pg_temp.t_eq('F1 a desk insert that sends paying_by_on_form still has none', pg_temp.t_onform(v_d2), '-');
  -- a form insert that sends ANOTHER value gets its paying_by
  v_f2 := pg_temp.t_form(v_e, v_ek, 'Cb44', 'Formcash', 'cash', v_sig);
  perform pg_temp.t_eq('F1 form registration (cash)', pg_temp.t_onform(v_f2), 'cash');
  -- nobody can change it: a direct update keeps it, no version bump, no history row
  v_v := pg_temp.t_ver(v_f1);
  v_n := (select count(*) from public.change_log);
  update public.testing_registrations set paying_by_on_form = 'card' where id = v_f1;
  perform pg_temp.t_eq('F1 a direct update of paying_by_on_form changes nothing',
    pg_temp.t_onform(v_f1) || ':' || pg_temp.t_ver(v_f1) || ':' || ((select count(*) from public.change_log) - v_n), 'check:' || v_v || ':0');
  update public.testing_registrations set paying_by_on_form = null where id = v_f1;
  perform pg_temp.t_eq('F1 a direct update to empty changes nothing', pg_temp.t_onform(v_f1), 'check');
  -- Change how they'll pay leaves it alone (paying_by moves, the form's choice stays)
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_change_paying_by(%L, %s, %L)', v_f1, pg_temp.t_ver(v_f1), 'cash'));
  perform pg_temp.t_eq('F1 Change how they''ll pay ok', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('F1 after Change how they''ll pay: paying_by cash, the form''s choice still check',
    (select r.paying_by || ':' || r.paying_by_on_form from public.testing_registrations r where r.id = v_f1), 'cash:check');
  -- the roster view shows it as its last column, to the desk
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.t_eq('F1 the roster view shows paying_by_on_form (form: check; desk: empty)',
    (select string_agg(coalesce(v.paying_by_on_form, '-'), ',' order by v.last_name collate "C")
       from public.testing_roster v where v.id in (v_f1, v_d)), '-,check');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.t_eq('F1 paying_by_on_form is the LAST column of testing_roster',
    (select a.attname::text from pg_attribute a where a.attrelid = 'public.testing_roster'::regclass and a.attnum > 0
      order by a.attnum desc limit 1), 'paying_by_on_form');
  -- Mark paid by another way, then Edit payment by another way: still the form's choice
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, %s, %L, 6500)', v_f2, pg_temp.t_ver(v_f2), 'card'));
  perform pg_temp.t_eq('F1 Mark paid by another way ok, paying_by follows', (v_r ->> 'status') || ':' || (v_r ->> 'paying_by'), 'ok:card');
  v_pay := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6500, %L)', v_pay, 'check', v_today));
  perform pg_temp.t_eq('F1 Edit payment by another way ok', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('F1 after Mark paid + Edit payment: paying_by check, the form''s choice still cash',
    (select r.paying_by || ':' || r.paying_by_on_form from public.testing_registrations r where r.id = v_f2), 'check:cash');
  -- the rule refuses a value on a desk row (with the trigger off, as the
  -- SQL Editor's owner could do) - shown through the table rule itself
  perform pg_temp.t_eq('F1 the table rule: empty, or a form row with cash / check / card',
    (select pg_get_constraintdef(c.oid) like '%source = ''form''%' from pg_constraint c
      where c.conname = 'testing_registrations_paying_by_on_form_check')::text, 'true');


  -- ===================================================================
  -- F2. M-01 on private testings
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_add(%L, %L, %L, %L, true, %L, %L, %L)',
    'worcester', 'Cb44', 'Deskprivate', v_rk1, 'cash', v_today + 3, '17:00'));
  v_p := (v_r ->> 'id')::uuid;
  perform pg_temp.t_eq('F2 a private testing added at the desk has none', pg_temp.t_ponform(v_p), '-');
  -- move a form registration (Paying by changed at the desk to cash, the form said check)
  v_f3 := pg_temp.t_form(v_e, v_ek, 'Cb44', 'Moveform', 'check', v_sig);
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_change_paying_by(%L, %s, %L)', v_f3, pg_temp.t_ver(v_f3), 'cash'));
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, %s, %L, %L)',
    v_f3, pg_temp.t_ver(v_f3), v_today + 4, '17:00'));
  perform pg_temp.t_eq('F2 move ok', v_r ->> 'status', 'ok');
  v_pm := (v_r ->> 'private_id')::uuid;
  perform pg_temp.t_eq('F2 the moved private testing has the registration''s form choice, and its Paying by',
    (select p.paying_by || ':' || coalesce(p.paying_by_on_form, '-') from public.testing_private p where p.id = v_pm), 'cash:check');
  -- the private list view shows it as its last column
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.t_eq('F2 testing_private_list shows paying_by_on_form (moved: check; desk: empty)',
    (select string_agg(coalesce(l.paying_by_on_form, '-'), ',' order by l.last_name collate "C")
       from public.testing_private_list l where l.id in (v_p, v_pm)), '-,check');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  -- a direct update keeps it
  v_v := pg_temp.t_pver(v_pm);
  update public.testing_private set paying_by_on_form = 'card' where id = v_pm;
  perform pg_temp.t_eq('F2 a direct update of the private testing''s paying_by_on_form changes nothing',
    pg_temp.t_ponform(v_pm) || ':' || pg_temp.t_pver(v_pm), 'check:' || v_v);
  -- Undo move: the registration keeps its own value
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_undo_move(%L, %s)', v_pm, pg_temp.t_pver(v_pm)));
  perform pg_temp.t_eq('F2 undo move ok', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('F2 after Undo move the registration still has the form''s choice',
    (select r.status || ':' || r.paying_by || ':' || r.paying_by_on_form from public.testing_registrations r where r.id = v_f3), 'active:cash:check');
  -- move it again: the new private testing has it too
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, %s, %L, %L)',
    v_f3, pg_temp.t_ver(v_f3), v_today + 4, '17:00'));
  v_pm := (v_r ->> 'private_id')::uuid;
  perform pg_temp.t_eq('F2 moved again: the form''s choice again', pg_temp.t_ponform(v_pm), 'check');
  -- a moved DESK registration: none
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, %s, %L, %L)',
    v_d2, pg_temp.t_ver(v_d2), v_today + 4, '17:00'));
  v_pm2 := (v_r ->> 'private_id')::uuid;
  perform pg_temp.t_eq('F2 a moved desk registration has none', (v_r ->> 'status') || ':' || pg_temp.t_ponform(v_pm2), 'ok:-');


  -- ===================================================================
  -- P1. R1-01: the desk's school on event payments
  -- ===================================================================
  v_f4 := pg_temp.t_form(v_e, v_ek, 'Cb44', 'Schoolone', 'cash', v_sig);
  -- an unknown school: invalid, nothing written
  v_s := pg_temp.t_state();
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500, %L)', v_f4, 'cash', 'mars'));
  perform pg_temp.t_eq('P1 an unknown school -> invalid {field: school}', v_r::text, '{"field": "school", "status": "invalid"}');
  perform pg_temp.t_eq('P1 the refusal wrote nothing', pg_temp.t_state(), v_s);
  -- the live app's 4-input call, by position: the event's school
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500)', v_f4, 'cash'));
  perform pg_temp.t_eq('P1 the 4-input call still works', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('P1 the 4-input call: exactly 0030''s answer keys', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k),
    'amount_cents,method,paid_on,paying_by,payment_id,status,version');
  perform pg_temp.t_eq('P1 the 4-input call stores the event''s school', pg_temp.t_schools(v_f4), 'payment:6500:worcester');
  -- own Undo within 10 s: the reversal has the payment's school
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_undo_payment(%L)', v_r ->> 'payment_id'));
  perform pg_temp.t_eq('P1 undo ok', v_r ->> 'status', 'ok');
  -- by name, as the web API calls it, with This device = Shrewsbury
  v_r := pg_temp.t_call('authenticated', v_c_d1, format(
    'public.testing_mark_paid_by(p_registration_id => %L, p_expected_version => %s, p_method => %L, p_expected_cents => 6500, p_school => %L)',
    v_f4, pg_temp.t_ver(v_f4), 'card', 'shrewsbury'));
  perform pg_temp.t_eq('P1 by name with p_school shrewsbury ok', v_r ->> 'status', 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('P1 the payment has the desk''s school',
    (select p.school from public.testing_payments p where p.id = v_pay), 'shrewsbury');
  -- admin Edit payment: reversal + new payment at the edited payment's school
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_edit_payment(%L, %L, 6000, %L)', v_pay, 'cash', v_today));
  perform pg_temp.t_eq('P1 edit ok', v_r ->> 'status', 'ok');
  v_new := (v_r ->> 'payment_id')::uuid;
  perform pg_temp.t_eq('P1 after undo, mark paid at Shrewsbury and edit: every row''s school',
    pg_temp.t_schools(v_f4),
    'payment:6500:worcester,reversal:-6500:worcester,payment:6500:shrewsbury,reversal:-6500:shrewsbury,payment:6000:shrewsbury');
  -- admin Undo payment of the edited one: Shrewsbury
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_undo_payment(%L)', v_new));
  perform pg_temp.t_eq('P1 admin undo of the edited payment: its school',
    (v_r ->> 'status') || ':' || (select p.school from public.testing_payments p where p.reverses_payment_id = v_new), 'ok:shrewsbury');
  -- blank school = the event's
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, %s, %L, 6500, %L)', v_f4, pg_temp.t_ver(v_f4), 'cash', '  '));
  perform pg_temp.t_eq('P1 a blank school = the event''s',
    (v_r ->> 'status') || ':' || (select p.school from public.testing_payments p where p.id = (v_r ->> 'payment_id')::uuid), 'ok:worcester');


  -- ===================================================================
  -- P2. The desk's school on private payments
  -- ===================================================================
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, %s, %L, 8500, %L)', v_p, pg_temp.t_pver(v_p), 'cash', 'mars'));
  perform pg_temp.t_eq('P2 an unknown school -> invalid {field: school}', v_r::text, '{"field": "school", "status": "invalid"}');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, %s, %L, 8500)', v_p, pg_temp.t_pver(v_p), 'cash'));
  perform pg_temp.t_eq('P2 the 4-input call: the private testing''s school',
    (v_r ->> 'status') || ':' || (select x.school from public.testing_private_payments x where x.id = (v_r ->> 'payment_id')::uuid), 'ok:worcester');
  perform pg_temp.t_eq('P2 the 4-input call: exactly 0030''s answer keys', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k),
    'amount_cents,method,paid_on,paying_by,payment_id,status,version');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_undo_payment(%L)', v_r ->> 'payment_id'));
  perform pg_temp.t_eq('P2 own undo ok', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_mark_paid_by(%L, %s, %L, 8500, %L)', v_p, pg_temp.t_pver(v_p), 'check', 'shrewsbury'));
  perform pg_temp.t_eq('P2 Shrewsbury ok', v_r ->> 'status', 'ok');
  v_pay := (v_r ->> 'payment_id')::uuid;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_private_edit_payment(%L, %L, 8000, %L)', v_pay, 'check', v_today));
  perform pg_temp.t_eq('P2 edit ok', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('P2 every private row''s school',
    pg_temp.t_pschools(v_p),
    'payment:8500:worcester,reversal:-8500:worcester,payment:8500:shrewsbury,reversal:-8500:shrewsbury,payment:8000:shrewsbury');
  -- the app may read the private payments' school
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  perform pg_temp.t_eq('P2 the desk reads the private payments'' school',
    (select count(*)::text from public.testing_private_payments x where x.private_id = v_p and x.school is not null), '5');
  reset role;
  perform set_config('request.jwt.claims', '', true);


  -- ===================================================================
  -- P3. Move to private and Undo move keep each payment's school
  -- ===================================================================
  v_f5 := pg_temp.t_form(v_e, v_ek, 'Cb44', 'Schoolmove', 'cash', v_sig);
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid_by(%L, 1, %L, 6500, %L)', v_f5, 'cash', 'shrewsbury'));
  perform pg_temp.t_eq('P3 paid at Shrewsbury', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_move_to_private(%L, %s, %L, %L)',
    v_f5, pg_temp.t_ver(v_f5), v_today + 4, '17:00'));
  perform pg_temp.t_eq('P3 move ok', v_r ->> 'status', 'ok');
  v_pm := (v_r ->> 'private_id')::uuid;
  perform pg_temp.t_eq('P3 the event reversal keeps Shrewsbury', pg_temp.t_schools(v_f5), 'payment:6500:shrewsbury,reversal:-6500:shrewsbury');
  perform pg_temp.t_eq('P3 the moved private payment keeps Shrewsbury (the private testing is Worcester)',
    pg_temp.t_pschools(v_pm) || ':' || (select p.location_code from public.testing_private p where p.id = v_pm), 'payment:6500:shrewsbury:worcester');
  v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_private_undo_move(%L, %s)', v_pm, pg_temp.t_pver(v_pm)));
  perform pg_temp.t_eq('P3 undo move ok', v_r ->> 'status', 'ok');
  perform pg_temp.t_eq('P3 the event payment recorded again keeps Shrewsbury', pg_temp.t_schools(v_f5),
    'payment:6500:shrewsbury,reversal:-6500:shrewsbury,payment:6500:shrewsbury');


  -- ===================================================================
  -- P4. The table rules (as the SQL Editor: the guard lets inserts through)
  -- ===================================================================
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name)
  values (v_d, 'payment', 6500, 'cash', v_today, 'cb44 test') returning id into v_pay;
  perform pg_temp.t_eq('P4 a payment written without a school gets the event''s',
    (select p.school from public.testing_payments p where p.id = v_pay), 'worcester');
  begin
    insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name, reverses_payment_id, school)
    values (v_d, 'reversal', -6500, 'cash', v_today, 'cb44 test', v_pay, 'shrewsbury');
    raise exception 'TEST FAILED: P4 a reversal at another school than its payment was accepted';
  exception when check_violation then null;
  end;
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name, reverses_payment_id)
  values (v_d, 'reversal', -6500, 'cash', v_today, 'cb44 test', v_pay);
  perform pg_temp.t_eq('P4 a reversal written without a school gets its payment''s',
    (select p.school from public.testing_payments p where p.reverses_payment_id = v_pay), 'worcester');
  begin
    insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name, school)
    values (v_d, 'payment', 6500, 'cash', v_today, 'cb44 test', 'mars');
    raise exception 'TEST FAILED: P4 a payment at a school that doesn''t exist was accepted';
  exception when foreign_key_violation then null;
  end;
  insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_by_name)
  values (v_pm2, 'payment', 100, 'cash', v_today, 'cb44 test') returning id into v_pay;
  perform pg_temp.t_eq('P4 a private payment written without a school gets the private testing''s',
    (select x.school from public.testing_private_payments x where x.id = v_pay), 'worcester');
  begin
    insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_by_name, reverses_payment_id, school)
    values (v_pm2, 'reversal', -100, 'cash', v_today, 'cb44 test', v_pay, 'shrewsbury');
    raise exception 'TEST FAILED: P4 a private reversal at another school than its payment was accepted';
  exception when check_violation then null;
  end;
  -- the old 2-input Mark paid (only while it exists, i.e. before 0035): the event's school
  if to_regprocedure('public.testing_mark_paid(uuid, integer)') is not null then
    v_r := pg_temp.t_call('authenticated', v_c_d1, format('public.testing_mark_paid(%L, %s)', v_f1, pg_temp.t_ver(v_f1)));
    perform pg_temp.t_eq('P4 the old 2-input Mark paid stores the event''s school',
      (v_r ->> 'status') || ':' || (select p.school from public.testing_payments p where p.id = (v_r ->> 'payment_id')::uuid), 'ok:worcester');
  end if;


  -- ===================================================================
  -- U1. R2-02: Edit event's Undo in one call
  -- ===================================================================
  -- an OPEN event; the admin renames it and closes registration (the two
  -- calls the app makes today), then undoes both in one call
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, true, null, %L)',
    'worcester', v_tag || ' undo', v_today + 6, v_classes::text, 'Old note'));
  v_u := (v_r ->> 'id')::uuid;
  v_v := (v_r ->> 'version')::integer;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_update_event(%L, %s, %L, %L, %L::jsonb, null, %L)',
    v_u, v_v, v_tag || ' renamed', v_today + 6, v_classes::text, 'New note'));
  perform pg_temp.t_eq('U1 edit ok', v_r ->> 'status', 'ok');
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_set_registration(%L, %s, false)', v_u, v_r ->> 'version'));
  perform pg_temp.t_eq('U1 close ok', v_r ->> 'status', 'ok');
  v_v := (v_r ->> 'version')::integer;
  -- refusals before anything: no_access, not_allowed (the desk), invalid, not_found, stale
  v_s := pg_temp.t_state();
  perform pg_temp.t_eq('U1 the desk -> not_allowed', pg_temp.t_call('authenticated', v_c_d1,
    format('public.testing_undo_event_edit(%L, %s, %L, %L, %L::jsonb, null, %L, true)', v_u, v_v, v_tag || ' undo', v_today + 6, v_classes::text, 'Old note')) ->> 'status',
    'not_allowed');
  perform pg_temp.t_eq('U1 no id -> invalid', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_event_edit(null, %s, %L, %L, %L::jsonb, null, %L, true)', v_v, v_tag || ' undo', v_today + 6, v_classes::text, 'Old note')) ->> 'status',
    'invalid');
  perform pg_temp.t_eq('U1 no version -> invalid', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_event_edit(%L, null, %L, %L, %L::jsonb, null, %L, true)', v_u, v_tag || ' undo', v_today + 6, v_classes::text, 'Old note')) ->> 'status',
    'invalid');
  perform pg_temp.t_eq('U1 not_found', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_event_edit(%L, %s, %L, %L, %L::jsonb, null, %L, true)', gen_random_uuid(), v_v, v_tag || ' undo', v_today + 6, v_classes::text, 'Old note')) ->> 'status',
    'not_found');
  perform pg_temp.t_eq('U1 an old version -> stale', pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_event_edit(%L, %s, %L, %L, %L::jsonb, null, %L, true)', v_u, v_v - 1, v_tag || ' undo', v_today + 6, v_classes::text, 'Old note')) ->> 'status',
    'stale');
  perform pg_temp.t_eq('U1 the refusals wrote nothing', pg_temp.t_state(), v_s);
  -- the Undo: name, note and switch back, in one call
  v_maxid := (select coalesce(max(l.id), 0) from public.change_log l);
  v_r := pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_event_edit(%L, %s, %L, %L, %L::jsonb, null, %L, true)', v_u, v_v, v_tag || ' undo', v_today + 6, v_classes::text, 'Old note'));
  perform pg_temp.t_eq('U1 undo ok: the answer', (v_r ->> 'status') || ':' || (v_r ->> 'state') || ':'
    || ((v_r ->> 'version')::integer = (select e.version from public.testing_events e where e.id = v_u))::text, 'ok:open:true');
  perform pg_temp.t_eq('U1 undo ok: exactly these keys', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k),
    'state,status,version');
  perform pg_temp.t_eq('U1 after the Undo: the old name, note and switch',
    (select e.name || ':' || e.note || ':' || e.registration_open from public.testing_events e where e.id = v_u),
    v_tag || ' undo:Old note:true');
  perform pg_temp.t_eq('U1 the Undo wrote the two functions'' history rows (update_event + set_registration)',
    (select string_agg(distinct l.action, ',' order by l.action) from public.change_log l
      where l.table_name = 'testing_events' and l.record_id = v_u and l.id > v_maxid),
    'set_registration,update_event');
  -- p_open null: only the details (the switch untouched)
  v_v := (v_r ->> 'version')::integer;
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_update_event(%L, %s, %L, %L, %L::jsonb, null, %L)',
    v_u, v_v, v_tag || ' second', v_today + 6, v_classes::text, 'Old note'));
  v_r := pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_event_edit(%L, %s, %L, %L, %L::jsonb, null, %L, null)', v_u, v_r ->> 'version', v_tag || ' undo', v_today + 6, v_classes::text, 'Old note'));
  perform pg_temp.t_eq('U1 p_open null: details back, switch still open',
    (v_r ->> 'status') || ':' || (select e.name || ':' || e.registration_open from public.testing_events e where e.id = v_u),
    'ok:' || v_tag || ' undo:true');
  -- the FIRST step refused (another event has that name): nothing written
  v_v := (v_r ->> 'version')::integer;
  v_s := pg_temp.t_state();
  v_r := pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_event_edit(%L, %s, %L, %L, %L::jsonb, null, %L, false)', v_u, v_v, v_tag || ' later', v_today + 6, v_classes::text, 'Old note'));
  perform pg_temp.t_eq('U1 a refused first step answers as it came (duplicate_name)', v_r ->> 'status', 'duplicate_name');
  perform pg_temp.t_eq('U1 ... and wrote nothing (the switch was not touched either)', pg_temp.t_state(), v_s);
  -- the SECOND step refused (the event is finished): the details that went through are put back too
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' finished', v_today + 7, v_classes::text));
  v_fin := (v_r ->> 'id')::uuid;
  update public.testing_events set testing_date = v_today - 1 where id = v_fin;   -- as the SQL Editor: the testing day has passed
  v_r := pg_temp.t_call('authenticated', v_c_a1, format('public.testing_update_event(%L, %s, %L, %L, %L::jsonb, null, null)',
    v_fin, (select e.version from public.testing_events e where e.id = v_fin), v_tag || ' finished edited', v_today - 1, v_classes::text));
  perform pg_temp.t_eq('U1 the finished event''s edit ok', v_r ->> 'status', 'ok');
  v_v := (v_r ->> 'version')::integer;
  v_s := pg_temp.t_state();
  v_r := pg_temp.t_call('authenticated', v_c_a1,
    format('public.testing_undo_event_edit(%L, %s, %L, %L, %L::jsonb, null, null, true)', v_fin, v_v, v_tag || ' finished', v_today - 1, v_classes::text));
  perform pg_temp.t_eq('U1 a refused second step answers as it came (finished)', v_r ->> 'status', 'finished');
  perform pg_temp.t_eq('U1 ... and the details that went through were put back (nothing written)', pg_temp.t_state(), v_s);
  perform pg_temp.t_eq('U1 ... the name is still the edited one',
    (select e.name from public.testing_events e where e.id = v_fin), v_tag || ' finished edited');


  -- ===================================================================
  -- K1. Catalog
  -- ===================================================================
  for v_fn in
    select p.oid, p.proname, p.prosecdef, p.proconfig,
           coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' order by 1)
                       from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee <> p.proowner), '') as rights
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('testing_mark_paid_by', 'testing_private_mark_paid_by', 'testing_undo_payment', 'testing_private_undo_payment',
                         'testing_edit_payment', 'testing_private_edit_payment', 'testing_move_to_private', 'testing_private_undo_move',
                         'testing_undo_event_edit', 'testing_registrations_keep_form_choice', 'testing_private_keep_form_choice',
                         'testing_payments_set_school', 'testing_private_payments_set_school')
  loop
    if not coalesce('search_path=""' = any (v_fn.proconfig), false) then
      raise exception 'TEST FAILED: K1 % has no search_path = ''''', v_fn.oid::regprocedure;
    end if;
    if v_fn.proname in ('testing_registrations_keep_form_choice', 'testing_private_keep_form_choice',
                        'testing_payments_set_school', 'testing_private_payments_set_school') then
      if v_fn.prosecdef or v_fn.rights <> '' then
        raise exception 'TEST FAILED: K1 % (definer %, rights "%") must be for nobody', v_fn.oid::regprocedure, v_fn.prosecdef, v_fn.rights;
      end if;
    elsif not v_fn.prosecdef or v_fn.rights <> 'authenticated:EXECUTE' then
      raise exception 'TEST FAILED: K1 % (definer %, rights "%")', v_fn.oid::regprocedure, v_fn.prosecdef, v_fn.rights;
    end if;
  end loop;
  perform pg_temp.t_eq('K1 each function once',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('testing_mark_paid_by', 'testing_private_mark_paid_by', 'testing_undo_payment', 'testing_private_undo_payment',
                          'testing_edit_payment', 'testing_private_edit_payment', 'testing_move_to_private', 'testing_private_undo_move',
                          'testing_undo_event_edit', 'testing_registrations_keep_form_choice', 'testing_private_keep_form_choice',
                          'testing_payments_set_school', 'testing_private_payments_set_school')), '13');
  perform pg_temp.t_eq('K1 the 4 triggers, enabled',
    (select string_agg(t.tgname || ':' || t.tgenabled::text, ',' order by t.tgname collate "C") from pg_trigger t
      where t.tgname in ('testing_registrations_before_form_choice', 'testing_private_before_form_choice',
                         'testing_payments_school', 'testing_private_payments_school') and not t.tgisinternal),
    'testing_payments_school:O,testing_private_before_form_choice:O,testing_private_payments_school:O,testing_registrations_before_form_choice:O');
  perform pg_temp.t_eq('K1 the form-choice triggers run before 0005''s / 0014''s "before write" (name order)',
    ('testing_registrations_before_form_choice' < 'testing_registrations_before_write' collate "C"
     and 'testing_private_before_form_choice' < 'testing_private_before_write' collate "C")::text, 'true');
  perform pg_temp.t_eq('K1 the 4 rules',
    (select count(*)::text from pg_constraint c
      where c.conname in ('testing_registrations_paying_by_on_form_check', 'testing_private_paying_by_on_form_check',
                          'testing_payments_school_fk', 'testing_private_payments_school_fk')), '4');
  perform pg_temp.t_eq('K1 school is never empty on both payment tables',
    (select string_agg(a.attrelid::regclass::text || ':' || a.attnotnull, ',' order by 1) from pg_attribute a
      where a.attname = 'school' and a.attrelid in ('public.testing_payments'::regclass, 'public.testing_private_payments'::regclass)),
    'testing_payments:true,testing_private_payments:true');
  perform pg_temp.t_eq('K1 column rights: paying_by_on_form on both tables and school on private payments for authenticated; school on event payments for nobody',
    (has_column_privilege('authenticated', 'public.testing_registrations', 'paying_by_on_form', 'select')
     and has_column_privilege('authenticated', 'public.testing_private', 'paying_by_on_form', 'select')
     and has_column_privilege('authenticated', 'public.testing_private_payments', 'school', 'select')
     and not has_column_privilege('authenticated', 'public.testing_payments', 'school', 'select'))::text, 'true');
  perform pg_temp.t_eq('K1 nothing for anon, service_role or the family form on the new columns',
    (has_column_privilege('anon', 'public.testing_registrations', 'paying_by_on_form', 'select')
     or has_column_privilege('anon', 'public.testing_private', 'paying_by_on_form', 'select')
     or has_column_privilege('anon', 'public.testing_private_payments', 'school', 'select')
     or has_column_privilege('anon', 'public.testing_payments', 'school', 'select')
     or has_column_privilege('service_role', 'public.testing_registrations', 'paying_by_on_form', 'select')
     or has_column_privilege('service_role', 'public.testing_private_payments', 'school', 'select')
     or has_column_privilege('testing_registrar', 'public.testing_registrations', 'paying_by_on_form', 'select')
     or has_column_privilege('testing_registrar', 'public.testing_private_payments', 'school', 'select')
     or has_any_column_privilege('authenticated', 'public.testing_registrations', 'update')
     or has_any_column_privilege('authenticated', 'public.testing_payments', 'insert'))::text, 'false');
  perform pg_temp.t_eq('K1 the views keep security_invoker and only authenticated may read them',
    (select string_agg(c.relname || ':' || ('security_invoker=true' = any (c.reloptions))::text, ',' order by c.relname collate "C")
       from pg_class c where c.oid in ('public.testing_roster'::regclass, 'public.testing_private_list'::regclass))
    || ':' || (has_table_privilege('authenticated', 'public.testing_roster', 'select')
               and has_table_privilege('authenticated', 'public.testing_private_list', 'select')
               and not has_table_privilege('anon', 'public.testing_roster', 'select')
               and not has_table_privilege('anon', 'public.testing_private_list', 'select'))::text,
    'testing_private_list:true,testing_roster:true:true');
  -- no answer of any call in this test held a login id
  perform pg_temp.t_eq('K1 no login-id key in any answer',
    (select count(*)::text from t_answers a, lateral pg_temp.t_keys(a.r) k where k = any (v_bad)), '0');
end;
$$;

select 'ALL 0044 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
