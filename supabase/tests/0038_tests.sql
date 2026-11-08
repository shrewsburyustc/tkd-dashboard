-- =====================================================================
-- 0038_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0038_star_design_review.sql (Star
--   testing design-review pass 1: Edit event's one-step Undo, payments
--   counted at the desk's school, the form's own Paying by, belt order
--   Worcester first; rulebook v1.035, v1.040, v1.047, v0.519). It checks,
--   in this order:
--     P1  catalog: the three new columns (type, not null, who may read
--         them - paying_by_before: nobody in the app), their table rules,
--         the new trigger, the guard function, ONE version of every
--         function (the old 5-input Record payment / Record refund are
--         gone; p_school is the last input, with a default), settings,
--         owner and rights of all of them (signed-in staff only, nothing
--         for anon / service_role / the family form's login), the roster
--         view (security invoker, paying_by_on_form its LAST column)
--     P2  paying_by_on_form: empty for a desk candidate, Paying by for a
--         form sign-up, never changed by a Paying by change, a direct
--         update or anything else; the roster shows it
--     P3  Record payment: by NAME without p_school (as the live app) ->
--         the candidate's school; with p_school -> that desk; a bad
--         school -> invalid, nothing written; another way than Paying by
--         also changes Paying by, remembers the old one, and is logged as
--         one batch
--     P4  Undo payment: the reversal carries the school; the old Paying by
--         is put back, but not if someone changed it since
--     P5  Edit payment (admin): both new rows carry the school; Paying by
--         follows a changed way (Color Belt 0030 / Camps 0033's rule) and
--         stays when only the amount changes
--     P6  Record refund: p_school or the candidate's school; a bad school ->
--         invalid; Undo of the refund copies the school
--     P7  the payments guard: a reversal at another school is refused, a
--         missing school is filled in, payments stay append-only
--     P8  belt order: Worcester before Shrewsbury within a star level in
--         star_event_results and star_results_csv (the CSV stays admin only)
--     P9  star_undo_event_edit: puts details, end time and the registration
--         switch back in one call; stale / not_found / not_allowed /
--         duplicate_name / finished are answered with nothing changed, and
--         a refusal in the SECOND step undoes the first
--   It makes its own test events ("zz test 1a2b3c4d ..."), so it works
--   whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test events, candidates,
--   payments, history rows, test sessions). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0006_tests.sql (read its header): "set local role
--   authenticated" + a pretend login token per session. Sessions:
--     A1 admin unlocked · D1 desk unlocked
--
-- BEFORE YOU RUN IT
--   1. 0001-0006, 0023, 0028, 0041 and 0038 are applied. You need TWO
--      existing, ACTIVE staff rows: an admin and the shared front desk
--      (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0038 TESTS PASSED".
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
  v_mark  bigint;
  v_snap  text;

  v_e     uuid;     -- the event of P2-P7 (in the future, registration closed)
  v_ev    integer;
  v_c1    uuid;  v_c1v integer;   -- desk candidate, Worcester, Paying by cash
  v_c2    uuid;  v_c2v integer;   -- form sign-up, Worcester, Paying by card
  v_c3    uuid;  v_c3v integer;   -- desk candidate, Shrewsbury, cash
  v_c4    uuid;  v_c4v integer;   -- desk candidate, Worcester, cash (the refund)
  v_p1    uuid;  v_p2  uuid;  v_p3 uuid;  v_p4 uuid;
  v_u     uuid;  v_uv  integer;   -- the event P9 edits
  v_fee   integer;                -- the standard fee of Dan 1 on the main event
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
                  where a.attrelid = 'public.star_payments'::regclass and a.attname = 'school' and not a.attisdropped) then
    raise exception 'TEST SETUP: public.star_payments has no school column (is 0038 applied?)';
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
  -- P1. Catalog
  -- ===================================================================
  -- a. the three columns
  for v_case in
    select x.tbl, x.col, x.must_notnull, x.readable, format_type(a.atttypid, a.atttypmod) as typ, a.attnotnull, a.atthasdef
      from (values ('star_payments', 'school', true, true),
                   ('star_payments', 'paying_by_before', false, false),
                   ('star_candidates', 'paying_by_on_form', false, true)) as x(tbl, col, must_notnull, readable)
      join pg_attribute a on a.attrelid = ('public.' || x.tbl)::regclass and a.attname = x.col
  loop
    if v_case.typ <> 'text' or v_case.attnotnull is distinct from v_case.must_notnull or v_case.atthasdef then
      raise exception 'TEST FAILED: P1a %.% must be text, not null = %, no default; got % % %',
        v_case.tbl, v_case.col, v_case.must_notnull, v_case.typ, v_case.attnotnull, v_case.atthasdef;
    end if;
    if has_column_privilege('authenticated', 'public.' || v_case.tbl, v_case.col, 'SELECT') is distinct from v_case.readable then
      raise exception 'TEST FAILED: P1a authenticated SELECT on %.% should be %', v_case.tbl, v_case.col, v_case.readable;
    end if;
    foreach v_txt in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_column_privilege('authenticated', 'public.' || v_case.tbl, v_case.col, v_txt) then
        raise exception 'TEST FAILED: P1a authenticated has % on %.%', v_txt, v_case.tbl, v_case.col;
      end if;
    end loop;
    foreach v_role in array array['anon', 'service_role', 'star_registrar', 'testing_registrar'] loop
      if exists (select 1 from pg_roles r where r.rolname = v_role)
         and has_column_privilege(v_role, 'public.' || v_case.tbl, v_case.col, 'SELECT') then
        raise exception 'TEST FAILED: P1a % may read %.%', v_role, v_case.tbl, v_case.col;
      end if;
    end loop;
  end loop;
  set local role anon;
  begin
    perform p.school from public.star_payments p limit 1;
    raise exception 'TEST FAILED: P1a anon could read star_payments.school';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- b. table rules, the trigger, the guard
  for v_case in
    select x.name, x.needle1, x.needle2
      from (values ('star_payments_school_fk', 'FOREIGN KEY (school) REFERENCES locations(code)', ''),
                   ('star_payments_paying_by_before_check', 'paying_by_before IS NULL', 'paying_by_before <> method'),
                   ('star_candidates_paying_by_on_form_check', 'paying_by_on_form IS NULL', 'paying_by_on_form = ANY')) as x(name, needle1, needle2)
  loop
    select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c where c.conname = v_case.name;
    if v_txt is null or v_txt not like '%' || v_case.needle1 || '%' or v_txt not like '%' || v_case.needle2 || '%' then
      raise exception 'TEST FAILED: P1b table rule % missing or different: %', v_case.name, v_txt;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'public.star_candidates'::regclass and t.tgname = 'star_candidates_before_form_choice'
                    and p.proname = 'star_candidates_keep_form_choice' and t.tgenabled = 'O' and not t.tgisinternal
                    and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16 and (t.tgtype & 1) = 1) then
    raise exception 'TEST FAILED: P1b star_candidates_before_form_choice must be a ROW trigger BEFORE INSERT OR UPDATE';
  end if;
  -- it must run before 0006's star_candidates_before_write (BEFORE triggers run in name order)
  if not ('star_candidates_before_form_choice' < 'star_candidates_before_write' collate "C") then
    raise exception 'TEST FAILED: P1b the form-choice trigger would not run first';
  end if;
  foreach v_txt in array array['star_payments_guard', 'star_payments_log', 'star_candidates_before_write', 'star_candidates_rules', 'star_candidates_log'] loop
    if not exists (select 1 from pg_trigger t where t.tgname = v_txt and t.tgenabled = 'O' and not t.tgisinternal) then
      raise exception 'TEST FAILED: P1b trigger % is missing or disabled (the backfill must switch it back on)', v_txt;
    end if;
  end loop;

  -- c. one version each; old signatures gone; p_school last, with a default
  if to_regprocedure('public.star_record_payment(uuid, integer, text, integer, date)') is not null
     or to_regprocedure('public.star_record_refund(uuid, integer, text, integer, date)') is not null then
    raise exception 'TEST FAILED: P1c the old 5-input star_record_payment or star_record_refund still exists';
  end if;
  if to_regprocedure('public.star_record_payment(uuid, integer, text, integer, date, text)') is null
     or to_regprocedure('public.star_record_refund(uuid, integer, text, integer, date, text)') is null
     or to_regprocedure('public.star_undo_event_edit(uuid, integer, text, date, time, text, date, text, time, boolean)') is null then
    raise exception 'TEST FAILED: P1c a new function signature is missing';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('star_record_payment', 'star_undo_payment', 'star_edit_payment', 'star_record_refund',
                       'star_event_results', 'star_results_csv', 'star_undo_event_edit', 'star_payments_guard',
                       'star_candidates_keep_form_choice');
  if v_n <> 9 then raise exception 'TEST FAILED: P1c expected exactly one version of each of the nine functions, found %', v_n; end if;
  for v_case in
    select p.oid::regprocedure::text as sig, p.proname::text as name, p.prosecdef, p.proconfig, p.pronargs, p.pronargdefaults,
           p.proargnames, p.provolatile, p.proowner, p.prorettype::regtype::text as rettype, p.proacl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('star_record_payment', 'star_undo_payment', 'star_edit_payment', 'star_record_refund',
                         'star_event_results', 'star_results_csv', 'star_undo_event_edit', 'star_payments_guard',
                         'star_candidates_keep_form_choice')
  loop
    if not coalesce('search_path=""' = any (v_case.proconfig), false) then
      raise exception 'TEST FAILED: P1c % has no search_path = ''''', v_case.sig;
    end if;
    if v_case.proowner <> (select c.relowner from pg_class c where c.oid = 'public.star_payments'::regclass) then
      raise exception 'TEST FAILED: P1c % owner wrong', v_case.sig;
    end if;
    if v_case.name in ('star_payments_guard', 'star_candidates_keep_form_choice') then
      if v_case.prosecdef or v_case.rettype <> 'trigger' or v_case.pronargdefaults <> 0 then
        raise exception 'TEST FAILED: P1c trigger function % must be a plain trigger function', v_case.sig;
      end if;
      foreach v_role in array array['anon', 'authenticated', 'service_role', 'star_registrar', 'testing_registrar'] loop
        if exists (select 1 from pg_roles r where r.rolname = v_role)
           and has_function_privilege(v_role, v_case.sig::regprocedure, 'EXECUTE') then
          raise exception 'TEST FAILED: P1c % may run trigger function %', v_role, v_case.sig;
        end if;
      end loop;
      continue;
    end if;
    if v_case.rettype <> 'jsonb' or not v_case.prosecdef then
      raise exception 'TEST FAILED: P1c % must be a security definer function returning jsonb', v_case.sig;
    end if;
    if v_case.provolatile <> (case when v_case.name = 'star_event_results' then 's' else 'v' end) then
      raise exception 'TEST FAILED: P1c % volatility wrong (%)', v_case.sig, v_case.provolatile;
    end if;
    if v_case.name in ('star_record_payment', 'star_record_refund') then
      if v_case.pronargdefaults <> 1 or v_case.proargnames[v_case.pronargs] <> 'p_school' then
        raise exception 'TEST FAILED: P1c % must end with p_school, the only input with a default', v_case.sig;
      end if;
    elsif v_case.pronargdefaults <> 0 then
      raise exception 'TEST FAILED: P1c % has argument defaults', v_case.sig;
    end if;
    if exists (select 1 from aclexplode(coalesce(v_case.proacl, acldefault('f', v_case.proowner))) a where a.grantee = 0) then
      raise exception 'TEST FAILED: P1c PUBLIC can run %', v_case.sig;
    end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'star_registrar', 'testing_registrar'] loop
      if exists (select 1 from pg_roles r where r.rolname = v_role)
         and has_function_privilege(v_role, v_case.sig::regprocedure, 'EXECUTE') is distinct from (v_role = 'authenticated') then
        raise exception 'TEST FAILED: P1c % execute right for % is %', v_case.sig, v_role,
          has_function_privilege(v_role, v_case.sig::regprocedure, 'EXECUTE');
      end if;
    end loop;
  end loop;

  -- d. the roster view: runs with the caller's rights; the new column is the last one; nothing for anon
  if not exists (select 1 from pg_class c where c.oid = 'public.star_roster'::regclass and 'security_invoker=true' = any (c.reloptions)) then
    raise exception 'TEST FAILED: P1d star_roster must be security_invoker = true';
  end if;
  select a.attname into v_txt from pg_attribute a
   where a.attrelid = 'public.star_roster'::regclass and a.attnum > 0 and not a.attisdropped
   order by a.attnum desc limit 1;
  if v_txt is distinct from 'paying_by_on_form' then
    raise exception 'TEST FAILED: P1d the last star_roster column is %, expected paying_by_on_form', v_txt;
  end if;
  select string_agg(a.attname, ',' order by a.attnum) into v_txt from pg_attribute a
   where a.attrelid = 'public.star_roster'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attnum >= (select a2.attnum from pg_attribute a2 where a2.attrelid = 'public.star_roster'::regclass and a2.attname = 'fee_kind');
  if v_txt is distinct from 'fee_kind,expected_fee_cents,overpaid_cents,paying_by_on_form' then
    raise exception 'TEST FAILED: P1d the tail of star_roster is %, expected fee_kind,expected_fee_cents,overpaid_cents,paying_by_on_form', v_txt;
  end if;
  foreach v_role in array array['anon', 'service_role', 'star_registrar', 'testing_registrar'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role) and has_table_privilege(v_role, 'public.star_roster', 'SELECT') then
      raise exception 'TEST FAILED: P1d % may read star_roster', v_role;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.star_roster', 'SELECT')
     or has_table_privilege('authenticated', 'public.star_roster', 'INSERT')
     or has_table_privilege('authenticated', 'public.star_roster', 'UPDATE') then
    raise exception 'TEST FAILED: P1d authenticated must have SELECT only on star_roster';
  end if;

  -- ===================================================================
  -- Test event and candidates (made by the admin / the desk)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' Main', v_today + 9, '10:00', 'worcester', false, null, null);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: add_event answered %', v_r; end if;
  v_e := (v_r ->> 'id')::uuid;
  select d.standard_cents into v_fee from public.star_event_dans d where d.event_id = v_e and d.dan = 1;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_add_candidate(v_e, 'Cora', 'Onepay', null, 'cora@example.com', 'worcester', 1, 0, 'cash');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: add_candidate 1 answered %', v_r; end if;
  v_c1 := (v_r ->> 'id')::uuid;  v_c1v := (v_r ->> 'version')::integer;
  v_r := public.star_add_candidate(v_e, 'Sam', 'Threepay', null, 'sam@example.com', 'shrewsbury', 1, 0, 'cash');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: add_candidate 3 answered %', v_r; end if;
  v_c3 := (v_r ->> 'id')::uuid;  v_c3v := (v_r ->> 'version')::integer;
  v_r := public.star_add_candidate(v_e, 'Wren', 'Fourpay', null, 'wren@example.com', 'worcester', 1, 0, 'cash');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: add_candidate 4 answered %', v_r; end if;
  v_c4 := (v_r ->> 'id')::uuid;  v_c4v := (v_r ->> 'version')::integer;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  -- a FORM sign-up (what star_public_register_core writes): added straight into the table as "postgres"
  insert into public.star_candidates
    (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, reference,
     created_by_name, updated_by_name, paying_by_on_form)
  values (v_e, 'Fern', 'Twopay', 'worcester', 1, 0, 'card', 'form', 'ST-' || nextval('public.star_candidate_ref_seq'),
          '', '', 'check')   -- a caller that tries to set the form's choice itself: ignored
  returning id, version into v_c2, v_c2v;

  -- ===================================================================
  -- P2. paying_by_on_form
  -- ===================================================================
  if (select c.paying_by_on_form from public.star_candidates c where c.id = v_c1) is not null
     or (select c.paying_by_on_form from public.star_candidates c where c.id = v_c3) is not null then
    raise exception 'TEST FAILED: P2a a candidate added at the desk must have an empty paying_by_on_form';
  end if;
  if (select c.paying_by_on_form from public.star_candidates c where c.id = v_c2) is distinct from 'card' then
    raise exception 'TEST FAILED: P2a a form sign-up must take its Paying by (card), got %',
      (select c.paying_by_on_form from public.star_candidates c where c.id = v_c2);
  end if;
  -- b. Paying by changed at the desk: the form's choice stays, one version bump, one history row
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_change_paying_by(v_c2, v_c2v, 'check');
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_c2v + 1) then
    raise exception 'TEST FAILED: P2b change_paying_by expected {ok, %}, got %', v_c2v + 1, v_r;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_c2v := v_c2v + 1;
  if (select c.paying_by from public.star_candidates c where c.id = v_c2) <> 'check'
     or (select c.paying_by_on_form from public.star_candidates c where c.id = v_c2) <> 'card' then
    raise exception 'TEST FAILED: P2b Paying by should be check and the form''s choice still card';
  end if;
  select count(*) into v_n from public.change_log l where l.id > v_mark;
  if v_n <> 1 or not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'star_candidates'
                              and l.action = 'star_change_paying_by'
                              and not (l.after ? 'paying_by_on_form') and l.after ->> 'paying_by' = 'check') then
    raise exception 'TEST FAILED: P2b expected one history row (paying_by only), got % %', v_n,
      (select jsonb_agg(to_jsonb(l)) from public.change_log l where l.id > v_mark);
  end if;
  -- c. a direct write to the form's choice changes nothing: no version bump, no history row
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  update public.star_candidates set paying_by_on_form = 'cash' where id = v_c2;
  update public.star_candidates set paying_by_on_form = null where id = v_c2;
  update public.star_candidates set paying_by_on_form = 'cash' where id = v_c1;
  if (select c.paying_by_on_form from public.star_candidates c where c.id = v_c2) <> 'card'
     or (select c.paying_by_on_form from public.star_candidates c where c.id = v_c1) is not null
     or (select c.version from public.star_candidates c where c.id = v_c2) <> v_c2v
     or exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: P2c a direct write to paying_by_on_form changed something';
  end if;
  begin
    update public.star_candidates set paying_by_on_form = 'cash' where id = v_c1;
    update public.star_candidates set paying_by = 'cash' where id = v_c2;   -- (a real change, to put the test back)
    update public.star_candidates set paying_by = 'check' where id = v_c2;
  exception when others then
    raise exception 'TEST FAILED: P2c unexpected error: %', sqlerrm;
  end;
  -- the rule: only cash / check / card or empty
  begin
    alter table public.star_candidates disable trigger star_candidates_before_form_choice;
    update public.star_candidates set paying_by_on_form = 'bitcoin' where id = v_c1;
    alter table public.star_candidates enable trigger star_candidates_before_form_choice;
    raise exception 'TEST FAILED: P2c the table rule accepted paying_by_on_form = bitcoin';
  exception when check_violation then
    alter table public.star_candidates enable trigger star_candidates_before_form_choice;
  end;
  select c.version into v_c2v from public.star_candidates c where c.id = v_c2;
  select c.version into v_c1v from public.star_candidates c where c.id = v_c1;
  -- d. the roster shows it (as signed-in staff, with the column right)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select string_agg(coalesce(r.paying_by_on_form, '-') || '/' || r.paying_by, ',' order by r.last_name collate "C") into v_txt
    from public.star_roster r where r.event_id = v_e;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  -- Fourpay (desk, cash), Onepay (desk, cash), Threepay (desk, cash), Twopay (form card, now check)
  if v_txt is distinct from '-/cash,-/cash,-/cash,card/check' then
    raise exception 'TEST FAILED: P2d the roster shows % for paying_by_on_form / paying_by', v_txt;
  end if;
  -- put c2 back to card for what follows
  update public.star_candidates set paying_by = 'card' where id = v_c2;
  select c.version into v_c2v from public.star_candidates c where c.id = v_c2;

  -- ===================================================================
  -- P3. Record payment: the school and the way
  -- ===================================================================
  -- a. by NAME without p_school (the live app's call) -> the candidate's school; same way -> Paying by untouched
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_record_payment(p_candidate_id => v_c1, p_expected_version => v_c1v, p_method => 'cash',
                                    p_amount_cents => 14000, p_paid_on => v_today);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::integer <> v_c1v + 1
     or v_r - 'payment_id' is distinct from jsonb_build_object('status', 'ok', 'version', v_c1v + 1) then
    raise exception 'TEST FAILED: P3a record_payment (no p_school) expected {ok, payment_id, version %}, got %', v_c1v + 1, v_r;
  end if;
  v_p1 := (v_r ->> 'payment_id')::uuid;  v_c1v := v_c1v + 1;
  if (select p.school from public.star_payments p where p.id = v_p1) <> 'worcester'
     or (select p.paying_by_before from public.star_payments p where p.id = v_p1) is not null
     or (select c.paying_by from public.star_candidates c where c.id = v_c1) <> 'cash' then
    raise exception 'TEST FAILED: P3a the payment should have school worcester, no paying_by_before, Paying by cash';
  end if;
  -- the history: the payment's insert row shows the school
  if not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'star_payments' and l.op = 'insert'
                  and l.after ->> 'school' = 'worcester' and l.action = 'star_record_payment') then
    raise exception 'TEST FAILED: P3a the payment''s history row is missing or has no school';
  end if;
  -- b. Undo it (the desk, within 10 seconds): the reversal has the same school
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_undo_payment(v_p1);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_c1v + 1) then
    raise exception 'TEST FAILED: P3b undo_payment expected {ok, %}, got %', v_c1v + 1, v_r;
  end if;
  v_c1v := v_c1v + 1;
  if (select p.school from public.star_payments p where p.reverses_payment_id = v_p1) is distinct from 'worcester'
     or (select c.paying_by from public.star_candidates c where c.id = v_c1) <> 'cash' then
    raise exception 'TEST FAILED: P3b the reversal should carry school worcester and Paying by stay cash';
  end if;
  -- c. another desk (p_school) AND another way (card): school stored, Paying by follows, old one remembered; one batch
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_record_payment(v_c1, v_c1v, 'card', 14000, v_today, 'shrewsbury');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok' then
    raise exception 'TEST FAILED: P3c record_payment at shrewsbury by card expected ok, got %', v_r;
  end if;
  v_p2 := (v_r ->> 'payment_id')::uuid;  v_c1v := (v_r ->> 'version')::integer;
  if (select p.school from public.star_payments p where p.id = v_p2) <> 'shrewsbury'
     or (select p.paying_by_before from public.star_payments p where p.id = v_p2) is distinct from 'cash'
     or (select c.paying_by from public.star_candidates c where c.id = v_c1) <> 'card'
     or (select c.paying_by_on_form from public.star_candidates c where c.id = v_c1) is not null then
    raise exception 'TEST FAILED: P3c expected school shrewsbury, paying_by_before cash, Paying by card (the form''s choice stays empty)';
  end if;
  select count(*), count(distinct l.batch_id) into v_n, v_ev from public.change_log l where l.id > v_mark;
  if v_n <> 2 or v_ev <> 1 or exists (select 1 from public.change_log l where l.id > v_mark and l.action <> 'star_record_payment') then
    raise exception 'TEST FAILED: P3c expected 2 history rows in one batch tagged star_record_payment, got % rows, % batches', v_n, v_ev;
  end if;
  if not exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'star_candidates' and l.op = 'update'
                  and l.before ->> 'paying_by' = 'cash' and l.after ->> 'paying_by' = 'card'
                  and not (l.after ? 'paying_by_on_form')) then
    raise exception 'TEST FAILED: P3c the candidate''s history row should show Paying by cash -> card';
  end if;
  -- d. a school that isn't one -> invalid (with the field), nothing written
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  foreach v_txt in array array['nowhere', '', 'WORCESTER'] loop
    v_r := public.star_record_payment(v_c3, v_c3v, 'cash', 14000, v_today, v_txt);
    if v_r is distinct from '{"status": "invalid", "field": "school"}'::jsonb then
      raise exception 'TEST FAILED: P3d record_payment at school "%" expected invalid / school, got %', v_txt, v_r;
    end if;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.change_log l where l.id > v_mark)
     or exists (select 1 from public.star_payments p where p.candidate_id = v_c3)
     or (select c.version from public.star_candidates c where c.id = v_c3) <> v_c3v then
    raise exception 'TEST FAILED: P3d a refused payment wrote something';
  end if;

  -- ===================================================================
  -- P4. Undo payment: the school, and Paying by put back
  -- ===================================================================
  -- a. Undo of P3c's payment (the desk, within 10 s): Paying by is back to cash
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_undo_payment(v_p2);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_c1v + 1) then
    raise exception 'TEST FAILED: P4a undo_payment expected {ok, %}, got %', v_c1v + 1, v_r;
  end if;
  v_c1v := v_c1v + 1;
  if (select c.paying_by from public.star_candidates c where c.id = v_c1) <> 'cash'
     or (select p.school from public.star_payments p where p.reverses_payment_id = v_p2) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: P4a Undo should put Paying by back to cash and carry school shrewsbury';
  end if;
  -- b. the same again, but Paying by was changed by someone since -> left alone
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_record_payment(v_c1, v_c1v, 'check', 14000, v_today, 'shrewsbury');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: P4b record_payment answered %', v_r; end if;
  v_p3 := (v_r ->> 'payment_id')::uuid;  v_c1v := (v_r ->> 'version')::integer;
  if (select c.paying_by from public.star_candidates c where c.id = v_c1) <> 'check' then
    raise exception 'TEST FAILED: P4b Paying by should be check';
  end if;
  update public.star_candidates set paying_by = 'card' where id = v_c1;   -- someone changed it since (as the database owner)
  select c.version into v_c1v from public.star_candidates c where c.id = v_c1;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_undo_payment(v_p3);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: P4b undo_payment answered %', v_r; end if;
  v_c1v := (v_r ->> 'version')::integer;
  if (select c.paying_by from public.star_candidates c where c.id = v_c1) <> 'card' then
    raise exception 'TEST FAILED: P4b Undo must leave a Paying by that someone changed since (card), got %',
      (select c.paying_by from public.star_candidates c where c.id = v_c1);
  end if;
  -- c. a payment from before 0038 (no paying_by_before): Undo touches nothing extra
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name, school)
    values (v_c1, 'payment', 5000, 'cash', v_today, 'old payment', 'worcester') returning id into v_p4;
  update public.star_candidates set paying_by = 'check' where id = v_c1;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_undo_payment(v_p4);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok'
     or (select c.paying_by from public.star_candidates c where c.id = v_c1) <> 'check' then
    raise exception 'TEST FAILED: P4c Undo of a payment without paying_by_before must not touch Paying by: %', v_r;
  end if;
  update public.star_candidates set paying_by = 'cash' where id = v_c1;
  select c.version into v_c1v from public.star_candidates c where c.id = v_c1;

  -- ===================================================================
  -- P5. Edit payment (admin): the school on both rows; Paying by follows a changed way
  -- ===================================================================
  -- c2 is a Worcester form sign-up, Paying by card. The desk records CASH at the Shrewsbury desk.
  select c.version into v_c2v from public.star_candidates c where c.id = v_c2;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_record_payment(v_c2, v_c2v, 'cash', 14000, v_today, 'shrewsbury');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: P5 record_payment answered %', v_r; end if;
  v_p1 := (v_r ->> 'payment_id')::uuid;
  if (select c.paying_by from public.star_candidates c where c.id = v_c2) <> 'cash'
     or (select p.paying_by_before from public.star_payments p where p.id = v_p1) <> 'card' then
    raise exception 'TEST FAILED: P5 expected Paying by cash and paying_by_before card';
  end if;
  -- a. Edit: same way, new amount -> Paying by stays, both rows at shrewsbury, the new payment remembers the family's choice
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_edit_payment(v_p1, 'cash', 14000, v_today);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: P5a the desk''s edit_payment expected not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_edit_payment(v_p1, 'cash', 12000, v_today);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: P5a edit_payment answered %', v_r; end if;
  v_p2 := (v_r ->> 'payment_id')::uuid;
  if (select p.school from public.star_payments p where p.reverses_payment_id = v_p1) is distinct from 'shrewsbury'
     or (select p.school from public.star_payments p where p.id = v_p2) is distinct from 'shrewsbury'
     or (select p.paying_by_before from public.star_payments p where p.id = v_p2) is distinct from 'card'
     or (select c.paying_by from public.star_candidates c where c.id = v_c2) <> 'cash' then
    raise exception 'TEST FAILED: P5a edit (same way): both rows school shrewsbury, new payment paying_by_before card, Paying by cash';
  end if;
  -- b. Edit: the way changes (cash -> check) -> Paying by becomes check, the new payment remembers card
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_edit_payment(v_p2, 'check', 12000, v_today);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: P5b edit_payment answered %', v_r; end if;
  v_p3 := (v_r ->> 'payment_id')::uuid;
  if (select c.paying_by from public.star_candidates c where c.id = v_c2) <> 'check'
     or (select p.paying_by_before from public.star_payments p where p.id = v_p3) is distinct from 'card'
     or (select p.school from public.star_payments p where p.id = v_p3) is distinct from 'shrewsbury'
     or (select p.method from public.star_payments p where p.id = v_p3) <> 'check' then
    raise exception 'TEST FAILED: P5b edit (new way): Paying by check, new payment check at shrewsbury with paying_by_before card';
  end if;
  -- c. Undo of that payment -> the family's choice (card) is back
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_undo_payment(v_p3);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok' or (select c.paying_by from public.star_candidates c where c.id = v_c2) <> 'card'
     or (select p.school from public.star_payments p where p.reverses_payment_id = v_p3) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: P5c Undo of the edited payment should bring Paying by back to card at shrewsbury: %', v_r;
  end if;

  -- ===================================================================
  -- P6. Record refund
  -- ===================================================================
  -- c4 pays the standard fee + 6000 (6000 overpaid), as the desk, at the Worcester desk
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_record_payment(v_c4, v_c4v, 'cash', v_fee + 6000, v_today, 'worcester');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: P6 record_payment answered %', v_r; end if;
  v_c4v := (v_r ->> 'version')::integer;
  -- a. staff may not refund (unchanged)
  v_r := public.star_record_refund(v_c4, v_c4v, 'cash', 1000, v_today, 'shrewsbury');
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: P6a the desk''s refund expected not_allowed, got %', v_r;
  end if;
  -- b. admin, a bad school -> invalid / school, nothing written
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_record_refund(v_c4, v_c4v, 'cash', 1000, v_today, 'nowhere');
  if v_r is distinct from '{"status": "invalid", "field": "school"}'::jsonb then
    raise exception 'TEST FAILED: P6b refund at an unknown school expected invalid / school, got %', v_r;
  end if;
  -- c. at the Shrewsbury desk for a Worcester candidate
  v_r := public.star_record_refund(v_c4, v_c4v, 'cash', 1000, v_today, 'shrewsbury');
  if v_r ->> 'status' is distinct from 'ok' or (select p.school from public.star_payments p where p.id = (v_r ->> 'payment_id')::uuid) <> 'shrewsbury' then
    raise exception 'TEST FAILED: P6c refund at shrewsbury expected ok with school shrewsbury, got %', v_r;
  end if;
  v_p1 := (v_r ->> 'payment_id')::uuid;  v_c4v := (v_r ->> 'version')::integer;
  -- d. by NAME without p_school (the live app) -> the candidate's school (worcester)
  v_r := public.star_record_refund(p_candidate_id => v_c4, p_expected_version => v_c4v, p_method => 'check',
                                   p_amount_cents => 500, p_refunded_on => v_today);
  if v_r ->> 'status' is distinct from 'ok' or (select p.school from public.star_payments p where p.id = (v_r ->> 'payment_id')::uuid) <> 'worcester' then
    raise exception 'TEST FAILED: P6d refund without p_school expected ok with school worcester, got %', v_r;
  end if;
  v_p2 := (v_r ->> 'payment_id')::uuid;  v_c4v := (v_r ->> 'version')::integer;
  -- e. too large is still refund_too_large
  v_r := public.star_record_refund(v_c4, v_c4v, 'cash', 6000, v_today, 'worcester');
  if v_r ->> 'status' is distinct from 'refund_too_large' then
    raise exception 'TEST FAILED: P6e a refund above the overpaid amount expected refund_too_large, got %', v_r;
  end if;
  -- f. Undo of the Shrewsbury refund copies its school
  v_r := public.star_undo_payment(v_p1);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: P6f undo of the refund answered %', v_r; end if;
  if (select p.school from public.star_payments p where p.id = v_p1) <> 'shrewsbury'
     or (select p.school from public.star_payments p where p.reverses_payment_id = v_p1) is distinct from 'shrewsbury'
     or (select p.school from public.star_payments p where p.id = v_p2) <> 'worcester' then
    raise exception 'TEST FAILED: P6f the refund and its reversal must both be at shrewsbury, the other refund at worcester';
  end if;
  if exists (select 1 from public.change_log l where l.id > v_mark and l.table_name = 'star_payments' and l.after ? 'paying_by_before'
                                                 and l.after ->> 'paying_by_before' is not null) then
    raise exception 'TEST FAILED: P6 a refund or reversal has paying_by_before';
  end if;

  -- ===================================================================
  -- P7. The payments guard (a direct write as "postgres")
  -- ===================================================================
  -- a. a reversal at another school than the row it reverses -> refused
  begin
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name, school, reverses_payment_id)
      values (v_c4, 'reversal', 500, 'check', v_today, 'x', 'shrewsbury', v_p2);
    raise exception 'TEST FAILED: P7a a reversal at another school was accepted';
  exception when check_violation then null;
  end;
  -- b. a reversal without a school takes its original's; a payment without a school takes the candidate's
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name, reverses_payment_id)
    values (v_c4, 'reversal', 500, 'check', v_today, 'x', v_p2) returning id into v_p3;
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name)
    values (v_c3, 'payment', 100, 'cash', v_today, 'x') returning id into v_p4;
  if (select p.school from public.star_payments p where p.id = v_p3) is distinct from 'worcester'
     or (select p.school from public.star_payments p where p.id = v_p4) is distinct from 'shrewsbury' then
    raise exception 'TEST FAILED: P7b a missing school should be filled in (reversal: its original''s worcester; payment: Sam''s shrewsbury)';
  end if;
  -- c. a school that isn't one -> foreign key; still append-only
  begin
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name, school)
      values (v_c3, 'payment', 100, 'cash', v_today, 'x', 'nowhere');
    raise exception 'TEST FAILED: P7c a payment at an unknown school was accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.star_payments set school = 'worcester' where id = v_p4;
    raise exception 'TEST FAILED: P7c a payment could be changed';
  exception when others then
    if sqlerrm not like '%append-only%' then raise exception 'TEST FAILED: P7c wrong refusal: %', sqlerrm; end if;
  end;
  -- d. paying_by_before: only on a payment, never the payment's own method
  begin
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name, school, paying_by_before)
      values (v_c3, 'payment', 100, 'cash', v_today, 'x', 'shrewsbury', 'cash');
    raise exception 'TEST FAILED: P7d paying_by_before equal to the method was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name, school, paying_by_before)
      values (v_c3, 'payment', 100, 'cash', v_today, 'x', 'shrewsbury', 'bitcoin');
    raise exception 'TEST FAILED: P7d paying_by_before = bitcoin was accepted';
  exception when check_violation then null;
  end;

  -- ===================================================================
  -- P8. Belt order, Worcester first
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' Order', v_today + 9, '10:00', 'worcester', false, null, null);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: P8 add_event answered %', v_r; end if;
  v_ev := 0;
  v_e := (v_r ->> 'id')::uuid;
  -- (last name, school, stars): 4 candidates at star 0, one at star 1
  for v_case in
    select x.fn, x.ln, x.sch, x.stars
      from (values ('Ann', 'Qzz', 'worcester', 0), ('Bob', 'Qaa', 'shrewsbury', 0), ('Cal', 'Qbb', 'worcester', 0),
                   ('Dee', 'Qcc', 'shrewsbury', 0), ('Eli', 'Qaa', 'worcester', 1)) as x(fn, ln, sch, stars)
  loop
    v_r := public.star_add_candidate(v_e, v_case.fn, v_case.ln, null, 'x@example.com', v_case.sch, 1, v_case.stars, 'cash');
    if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: P8 add_candidate % answered %', v_case.fn, v_r; end if;
  end loop;
  v_r := public.star_event_results(v_e, 1);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: P8 star_event_results answered %', v_r; end if;
  select string_agg((x ->> 'last_name') || ' ' || (x ->> 'first_name') || ' ' || left(x ->> 'location_code', 1), ', ' order by o) into v_txt
    from jsonb_array_elements(v_r -> 'rows') with ordinality as t(x, o);
  -- star 0: Worcester (Qbb Cal, Qzz Ann) then Shrewsbury (Qaa Bob, Qcc Dee); then star 1: Eli
  if v_txt is distinct from 'Qbb Cal w, Qzz Ann w, Qaa Bob s, Qcc Dee s, Qaa Eli w' then
    raise exception 'TEST FAILED: P8 star_event_results order is %', v_txt;
  end if;
  -- the counts don't depend on the order
  if (v_r -> 'counts' ->> 'candidates')::integer <> 5 then
    raise exception 'TEST FAILED: P8 star_event_results counts % ', v_r -> 'counts';
  end if;
  -- the CSV: same order, admin only
  v_r := public.star_results_csv(v_e, 1);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: P8 star_results_csv answered %', v_r; end if;
  select string_agg((x ->> 'last_name') || ' ' || (x ->> 'first_name') || ' ' || left(x ->> 'location_code', 1), ', ' order by o) into v_txt
    from jsonb_array_elements(v_r -> 'rows') with ordinality as t(x, o);
  if v_txt is distinct from 'Qbb Cal w, Qzz Ann w, Qaa Bob s, Qcc Dee s, Qaa Eli w' then
    raise exception 'TEST FAILED: P8 star_results_csv order is %', v_txt;
  end if;
  if not (v_r -> 'rows' -> 0 ? 'candidate_id' and v_r -> 'rows' -> 0 ? 'paid_on' and v_r -> 'rows' -> 0 ? 'date_of_birth') then
    raise exception 'TEST FAILED: P8 star_results_csv lost a row key';
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_results_csv(v_e, 1);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: P8 the desk''s star_results_csv expected not_allowed, got %', v_r;
  end if;
  v_r := public.star_event_results(v_e, 1);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST FAILED: P8 the desk may read the results: %', v_r; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select count(*) from public.star_downloads d where d.event_id = v_e) <> 1 then
    raise exception 'TEST FAILED: P8 star_results_csv must write one download row (and the refused call none)';
  end if;

  -- ===================================================================
  -- P9. star_undo_event_edit
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' Undo', v_today + 9, '10:00', 'worcester', true, null, 'old note', '12:00');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: P9 add_event answered %', v_r; end if;
  v_u := (v_r ->> 'id')::uuid;  v_uv := (v_r ->> 'version')::integer;
  -- the edit, as the app does it: details (name, date, times, note), then the switch
  v_r := public.star_update_event(v_u, v_uv, v_tag || ' Undo EDITED', v_today + 11, '11:00', 'shrewsbury', null, 'new note', '13:30');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: P9 update_event answered %', v_r; end if;
  v_uv := (v_r ->> 'version')::integer;
  v_r := public.star_set_registration(v_u, v_uv, false);
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: P9 set_registration answered %', v_r; end if;
  v_uv := (v_r ->> 'version')::integer;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;

  -- a. the desk may not undo; unknown event; wrong version
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.star_undo_event_edit(v_u, v_uv, v_tag || ' Undo', v_today + 9, '10:00', 'worcester', null, 'old note', '12:00', true);
  if v_r is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: P9a the desk''s undo expected not_allowed, got %', v_r;
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_undo_event_edit(gen_random_uuid(), 1, 'x', v_today + 9, '10:00', 'worcester', null, null, null, null);
  if v_r is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: P9a an unknown event expected not_found, got %', v_r;
  end if;
  v_r := public.star_undo_event_edit(v_u, v_uv - 1, v_tag || ' Undo', v_today + 9, '10:00', 'worcester', null, 'old note', '12:00', true);
  if v_r is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: P9a a wrong version expected stale, got %', v_r;
  end if;
  v_r := public.star_undo_event_edit(null, v_uv, 'x', v_today + 9, '10:00', 'worcester', null, null, null, null);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: P9a no event id expected invalid, got %', v_r;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: P9a a refused undo wrote history';
  end if;

  -- b. the first step refused (invalid time) -> that answer, nothing changed
  select row(e.*)::text into v_snap from public.star_events e where e.id = v_u;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_undo_event_edit(v_u, v_uv, v_tag || ' Undo', v_today + 9, '10:00', 'worcester', null, 'old note', '09:00', true);
  if v_r is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: P9b an end time before the start expected invalid, got %', v_r;
  end if;
  -- the first step refused (the name is another event's) -> duplicate_name
  v_r := public.star_undo_event_edit(v_u, v_uv, v_tag || ' Main', v_today + 9, '10:00', 'worcester', null, 'old note', '12:00', true);
  if v_r is distinct from '{"status": "duplicate_name"}'::jsonb then
    raise exception 'TEST FAILED: P9b a name already used expected duplicate_name, got %', v_r;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select row(e.*)::text from public.star_events e where e.id = v_u) is distinct from v_snap
     or exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: P9b a refused undo changed the event or wrote history';
  end if;

  -- c. the SECOND step refused -> the first is undone too. A finished event (its date is in the past) with the details
  --    sent unchanged except the name: details step ok, the switch is refused ("finished") -> nothing stays.
  update public.star_events set testing_date = v_today - 2, registration_open = true where id = v_u;
  select e.version into v_uv from public.star_events e where e.id = v_u;
  select row(e.*)::text into v_snap from public.star_events e where e.id = v_u;
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_undo_event_edit(v_u, v_uv, v_tag || ' Undo RENAMED', v_today - 2, '11:00', 'shrewsbury', null, 'new note', '13:30', false);
  if v_r is distinct from '{"status": "finished"}'::jsonb then
    raise exception 'TEST FAILED: P9c the switch step on a finished event expected finished, got %', v_r;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select row(e.*)::text from public.star_events e where e.id = v_u) is distinct from v_snap
     or exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: P9c a refusal in the second step left the first step''s change (or a history row) behind';
  end if;
  update public.star_events set testing_date = v_today + 11, registration_open = false where id = v_u;   -- the edited event again
  select e.version into v_uv from public.star_events e where e.id = v_u;

  -- d. the real Undo: details, end time AND the switch back, ONE call
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_undo_event_edit(v_u, v_uv, v_tag || ' Undo', v_today + 9, '10:00', 'worcester', null, 'old note', '12:00', true);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'status' is distinct from 'ok' or (v_r ->> 'version')::integer <> v_uv + 2 then
    raise exception 'TEST FAILED: P9d undo expected {ok, version %}, got %', v_uv + 2, v_r;
  end if;
  select e.name, e.testing_date, e.start_time, e.end_time, e.where_code, e.note, e.registration_open, e.version
    into v_case from public.star_events e where e.id = v_u;
  if v_case.name <> v_tag || ' Undo' or v_case.testing_date <> v_today + 9 or v_case.start_time <> time '10:00'
     or v_case.end_time is distinct from time '12:00' or v_case.where_code <> 'worcester' or v_case.note <> 'old note'
     or v_case.registration_open is not true or v_case.version <> v_uv + 2 then
    raise exception 'TEST FAILED: P9d the event is not back as it was: %', v_case;
  end if;
  select count(*) into v_n from public.change_log l where l.id > v_mark;
  if v_n <> 2 or exists (select 1 from public.change_log l where l.id > v_mark
                          and (l.table_name <> 'star_events' or l.op <> 'update' or l.record_id <> v_u or l.actor_id <> v_admin
                               or l.session_id <> v_a1 or l.action not in ('star_update_event', 'star_set_registration'))) then
    raise exception 'TEST FAILED: P9d expected exactly 2 history rows (the details, the switch), got % %', v_n,
      (select jsonb_agg(to_jsonb(l)) from public.change_log l where l.id > v_mark);
  end if;
  v_uv := v_uv + 2;

  -- e. p_open NULL (the edit never touched the switch): the switch is left alone, an end time can be cleared
  update public.star_events set registration_open = false where id = v_u;
  select e.version into v_uv from public.star_events e where e.id = v_u;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_undo_event_edit(v_u, v_uv, v_tag || ' Undo', v_today + 9, '10:00', 'worcester', null, 'old note', null, null);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_uv + 1)
     or (select e.end_time from public.star_events e where e.id = v_u) is not null
     or (select e.registration_open from public.star_events e where e.id = v_u) is not false then
    raise exception 'TEST FAILED: P9e undo with p_open NULL expected {ok, %}, no end time, switch still Closed, got % %', v_uv + 1, v_r,
      (select to_jsonb(e) from public.star_events e where e.id = v_u);
  end if;

  raise notice 'ALL 0038 TESTS PASSED';
end
$$;

select 'ALL 0038 TESTS PASSED' as result;

rollback;
