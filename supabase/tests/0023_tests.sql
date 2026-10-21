-- =====================================================================
-- 0023_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0023_star_result_texts.sql
--   (contract 0023). It checks, in this order:
--     R1  the seed: exactly the three kinds; each written by "Database
--         admin" with the action star_seed; each passes the text rules;
--         a text still at version 1 is R3's starting text word for word
--     R2  who can read: signed-in staff (desk and admin) read the three
--         rows; a locked session reads none; anon, service_role, PUBLIC
--         and the family form's login (star_registrar) have no right; the
--         login-id columns are never readable; nobody can write directly
--     R3  star_set_result_text, check order: no_access (locked, signed
--         out, idle - before any input check), not_allowed (staff, before
--         any input check), invalid (every rule of the text, before the
--         version check), stale, not_found
--     R4  star_set_result_text ok: version + 1, the saved text comes back,
--         one history row (action star_set_result_text, the admin, the
--         session, before -> after); the same text again writes nothing;
--         saving the old text back (Undo) works; the 2,000-character
--         boundary; the kind can never change; no "empty the table"
--     R5  the text rules one by one (the helper's answer codes)
--     R6  M5 (rulebook v0.504): star_update_event keeps registration
--         closed in the same call when an edit would reopen it (a
--         finished event moved into the future; a passed closing date
--         removed or moved later), and changes nothing in every other
--         case; the follow-up close of the app writes nothing
--     R8  the results CSV: candidate_id, paid_on (reversals skipped,
--         refunds never count) and sent.result_status (a re-send, then
--         its undo), staff not_allowed, the download log still written
--     R7  catalog: RLS + one read rule, the triggers, the functions'
--         settings and rights
--   It makes its own test events ("zz test 1a2b3c4d ..."), so it works
--   whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the text changes, the test
--   events, history rows, test sessions). NEVER change the final
--   "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   Same trick as 0006_tests.sql (read its header): "set local role
--   authenticated" + a pretend login token per session. Sessions:
--     A1 admin unlocked · A2 admin locked · A4 admin signed out ·
--     A7 admin idle time ran out · D1 desk unlocked
--
-- BEFORE YOU RUN IT
--   1. 0001-0006 and 0023 are applied. You need TWO existing, ACTIVE staff
--      rows: an admin and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations: the test removes
--      one text inside the transaction to check the not_found answer.
--      Everything is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0023 TESTS PASSED".
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

  v_a1 uuid := gen_random_uuid();  v_a2 uuid := gen_random_uuid();  v_a4 uuid := gen_random_uuid();
  v_a7 uuid := gen_random_uuid();  v_d1 uuid := gen_random_uuid();

  v_now_s   bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_amr_2h  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 2 * 3600));
  v_c_a1 text; v_c_a2 text; v_c_a4 text; v_c_a7 text; v_c_d1 text;

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_admin_name text;

  v_start_passed text := E'Hello,\n\n{full name} passed the {event} ({Dan}) {testing day}, with a total of {total} out of {max}, and earns {star earned}. Congratulations, {first name}!\n\nThe pass mark is {pass mark} out of {max}, with no D in any subject.\n\nThank you for all the hard work. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury';
  v_start_d text := E'Hello,\n\n{full name} took the {event} ({Dan}) {testing day}, with a total of {total} out of {max}. {first name} has a make-up to do before earning the next star.\n\nThe pass mark is {pass mark} out of {max}, with no D in any subject. {first name} received a D in {D subjects}. {below-pass-mark note}\n\nWhat to work on: {subjects to work on}. Every other grade is kept.\n\nWe’ll let you know how and when the make-up happens. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury';
  v_start_below text := E'Hello,\n\n{full name} took the {event} ({Dan}) {testing day}, with a total of {total} out of {max}. {first name} has a make-up to do before earning the next star.\n\nThe pass mark is {pass mark} out of {max}, with no D in any subject. {first name}’s total is below the pass mark.\n\nWhat to work on: {subjects to work on}. Every other grade is kept.\n\nWe’ll let you know how and when the make-up happens. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury';
  v_min_passed text := 'Hello, {total} of {pass mark}';
  v_min_makeup text := 'Hello, {total} of {pass mark}, work on {subjects to work on}';

  v_r      jsonb;
  v_n      integer;
  v_v      integer;
  v_v2     integer;
  v_i      integer;
  v_txt    text;
  v_old    text;
  v_mark   bigint;
  v_case   record;
  v_role   text;
  v_priv   text;
  v_col    text;
  v_e      uuid;
  v_ev     public.star_events;
  v_ev2    public.star_events;
  v_ca     uuid;
  v_cb     uuid;
  v_p3     uuid := gen_random_uuid();
  v_sent2  uuid := gen_random_uuid();
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  select s.role, s.full_name into v_role, v_admin_name from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role into v_role from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regclass('public.star_result_texts') is null
     or to_regprocedure('public.star_set_result_text(text, integer, text)') is null then
    raise exception 'TEST SETUP: public.star_result_texts / star_set_result_text are missing (is 0023 applied?)';
  end if;
  if pg_get_functiondef('public.star_update_event(uuid, integer, text, date, time, text, date, text)'::regprocedure)
     not like '%v_keep_closed%' then
    raise exception 'TEST SETUP: star_update_event is still 0006''s version (is 0023 applied, after any 0006 re-run?)';
  end if;

  perform set_config('request.jwt.claims', '', true);

  begin
    insert into auth.sessions (id, user_id)
    select x, v_admin from unnest(array[v_a1, v_a2, v_a7]) as x
    union all
    select v_d1, v_desk;
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),
    (v_a4, v_admin, now() + interval '30 minutes'),
    (v_a7, v_admin, to_timestamp(v_now_s - 2 * 3600) + interval '45 minutes'),
    (v_d1, v_desk,  now() + interval '30 minutes');

  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_a4 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a4, 'amr', v_amr_1m)::text;
  v_c_a7 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a7, 'amr', v_amr_2h)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;

  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true then raise exception 'TEST SETUP: A1 has no data access'; end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.has_data_access() is not true then raise exception 'TEST SETUP: D1 has no data access'; end if;
  foreach v_txt in array array[v_c_a2, v_c_a4, v_c_a7] loop
    perform set_config('request.jwt.claims', v_txt, true);
    if public.has_data_access() is not false then raise exception 'TEST SETUP: a locked / signed-out / idle session has data access'; end if;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- R1. The seed
  -- ===================================================================
  if (select array_agg(t.kind order by t.kind) from public.star_result_texts t)
     is distinct from array['makeup_below', 'makeup_d', 'passed'] then
    raise exception 'TEST FAILED: R1 expected exactly the kinds makeup_below, makeup_d, passed; found %',
      (select array_agg(t.kind order by t.kind) from public.star_result_texts t);
  end if;
  if exists (select 1 from public.star_result_texts t where t.created_by_name <> 'Database admin' or t.created_by is not null) then
    raise exception 'TEST FAILED: R1 a seeded text was not created by "Database admin"';
  end if;
  select count(*) into v_n
    from public.change_log l join public.star_result_texts t on t.id = l.record_id
   where l.table_name = 'star_result_texts' and l.op = 'insert' and l.action = 'star_seed' and l.actor_name = 'Database admin';
  if v_n <> 3 then raise exception 'TEST FAILED: R1 expected 3 star_seed history rows, found %', v_n; end if;
  if exists (select 1 from public.star_result_texts t where public.star_result_text_problem(t.kind, t.body) is not null) then
    raise exception 'TEST FAILED: R1 a stored text breaks the rules';
  end if;
  for v_case in select * from (values ('passed', v_start_passed), ('makeup_d', v_start_d), ('makeup_below', v_start_below)) as c(kind, body) loop
    if public.star_result_text_problem(v_case.kind, v_case.body) is not null then
      raise exception 'TEST FAILED: R1 the % starting text breaks the rules (%)', v_case.kind, public.star_result_text_problem(v_case.kind, v_case.body);
    end if;
    if exists (select 1 from public.star_result_texts t where t.kind = v_case.kind and t.version = 1 and t.body <> v_case.body) then
      raise exception 'TEST FAILED: R1 the % text (version 1) is not R3''s starting text', v_case.kind;
    end if;
    if exists (select 1 from public.star_result_texts t where t.kind = v_case.kind and t.version = 1 and t.body ~ chr(13)) then
      raise exception 'TEST FAILED: R1 the % text holds a carriage return', v_case.kind;
    end if;
  end loop;

  -- ===================================================================
  -- R2. Who can read
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  select count(*) into v_n from public.star_result_texts;
  if v_n <> 3 then raise exception 'TEST FAILED: R2 the desk (staff) reads % texts, expected 3', v_n; end if;
  select count(*) into v_n from (select t.id, t.kind, t.body, t.version, t.created_at, t.updated_at, t.created_by_name, t.updated_by_name
                                   from public.star_result_texts t) x;
  if v_n <> 3 then raise exception 'TEST FAILED: R2 the desk cannot read every granted column'; end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  select count(*) into v_n from public.star_result_texts;
  if v_n <> 3 then raise exception 'TEST FAILED: R2 the admin reads % texts, expected 3', v_n; end if;
  foreach v_txt in array array[v_c_a2, v_c_a4, v_c_a7] loop
    perform set_config('request.jwt.claims', v_txt, true);
    select count(*) into v_n from public.star_result_texts;
    if v_n <> 0 then raise exception 'TEST FAILED: R2 a locked / signed-out / idle session reads % texts', v_n; end if;
  end loop;
  perform set_config('request.jwt.claims', v_c_d1, true);
  begin
    perform t.created_by from public.star_result_texts t limit 1;
    raise exception 'TEST FAILED: R2 staff could read created_by (a login id)';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.star_result_texts set body = body where kind = 'passed';
    raise exception 'TEST FAILED: R2 staff could update star_result_texts directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.star_result_texts (kind, body, created_by_name, updated_by_name) values ('passed', 'x', '', '');
    raise exception 'TEST FAILED: R2 staff could insert into star_result_texts directly';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role anon;
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  begin
    perform 1 from public.star_result_texts limit 1;
    raise exception 'TEST FAILED: R2 anon could read star_result_texts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.star_set_result_text('passed', 1, v_min_passed);
    raise exception 'TEST FAILED: R2 anon could run star_set_result_text';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  foreach v_role in array array['anon', 'service_role', 'public', 'star_registrar'] loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(v_role, 'public.star_result_texts', v_priv) then
        raise exception 'TEST FAILED: R2 % has % on star_result_texts', v_role, v_priv;
      end if;
    end loop;
    if has_any_column_privilege(v_role, 'public.star_result_texts', 'SELECT') then
      raise exception 'TEST FAILED: R2 % can read a column of star_result_texts', v_role;
    end if;
    if has_function_privilege(v_role, 'public.star_set_result_text(text, integer, text)', 'EXECUTE')
       or has_function_privilege(v_role, 'public.star_result_text_problem(text, text)', 'EXECUTE') then
      raise exception 'TEST FAILED: R2 % can run a 0023 function', v_role;
    end if;
  end loop;
  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if has_table_privilege('authenticated', 'public.star_result_texts', v_priv) then
      raise exception 'TEST FAILED: R2 authenticated has table-wide % on star_result_texts', v_priv;
    end if;
  end loop;
  foreach v_priv in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
    if has_any_column_privilege('authenticated', 'public.star_result_texts', v_priv) then
      raise exception 'TEST FAILED: R2 authenticated has a column % right on star_result_texts', v_priv;
    end if;
  end loop;
  for v_col in select a.attname::text from pg_attribute a
                where a.attrelid = 'public.star_result_texts'::regclass and a.attnum > 0 and not a.attisdropped loop
    if has_column_privilege('authenticated', 'public.star_result_texts', v_col, 'SELECT')
       is distinct from (v_col = any (array['id', 'kind', 'body', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'])) then
      raise exception 'TEST FAILED: R2 authenticated SELECT on star_result_texts.% is wrong', v_col;
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.star_set_result_text(text, integer, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.star_result_text_problem(text, text)', 'EXECUTE') then
    raise exception 'TEST FAILED: R2 authenticated must run star_set_result_text and never the helper';
  end if;

  -- ===================================================================
  -- R3. star_set_result_text: the order of the checks
  -- ===================================================================
  select t.version into v_v from public.star_result_texts t where t.kind = 'passed';
  set local role authenticated;
  -- no_access comes first, even with bad arguments
  foreach v_txt in array array[v_c_a2, v_c_a4, v_c_a7] loop
    perform set_config('request.jwt.claims', v_txt, true);
    if public.star_set_result_text('passed', v_v, v_min_passed) is distinct from '{"status": "no_access"}'::jsonb
       or public.star_set_result_text(null, null, null) is distinct from '{"status": "no_access"}'::jsonb then
      raise exception 'TEST FAILED: R3 a locked / signed-out / idle session expected no_access';
    end if;
  end loop;
  -- not_allowed (staff) comes before any input check
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.star_set_result_text('passed', v_v, v_min_passed) is distinct from '{"status": "not_allowed"}'::jsonb
     or public.star_set_result_text(null, null, null) is distinct from '{"status": "not_allowed"}'::jsonb
     or public.star_set_result_text('passed', v_v + 7, '{frist name}') is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: R3 staff expected not_allowed';
  end if;
  -- invalid: every rule, always with the RIGHT version (and once with a
  -- wrong one: invalid comes before stale)
  perform set_config('request.jwt.claims', v_c_a1, true);
  for v_case in
    select * from (values
      ('kind null',              null::text,      'Hello, {total} of {pass mark}'),
      ('kind Passed (capital)',  'Passed',        'Hello, {total} of {pass mark}'),
      ('kind unknown',           'not_finished',  'Hello, {total} of {pass mark}'),
      ('body null',              'passed',        null::text),
      ('body empty',             'passed',        ''),
      ('first line empty',       'passed',        E'\nHello, {total} of {pass mark}'),
      ('first line spaces',      'passed',        E'   \nHello, {total} of {pass mark}'),
      ('first line no-break sp', 'passed',        chr(160) || E'\nHello, {total} of {pass mark}'),
      ('too long (2,001)',       'passed',        'Hello, {total} of {pass mark}' || repeat('x', 2001 - 29)),
      ('carriage return',        'passed',        'Hello, {total} of {pass mark}' || chr(13) || chr(10) || 'Bye'),
      ('tab',                    'passed',        'Hello,' || chr(9) || '{total} of {pass mark}'),
      ('control 127',            'passed',        'Hello, {total} of {pass mark}' || chr(127)),
      ('zero-width space',       'passed',        'Hello, {total} of {pass mark}' || chr(8203)),
      ('direction override',     'passed',        'Hello, {total} of {pass mark}' || chr(8238)),
      ('byte-order mark',        'passed',        'Hello, {total} of {pass mark}' || chr(65279)),
      ('unknown blank',          'passed',        'Hello, {total} of {pass mark} {frist name}'),
      ('blank wrong capitals',   'passed',        'Hello, {total} of {pass mark} {dan}'),
      ('blank with spaces',      'passed',        'Hello, { total } of {pass mark}'),
      ('empty braces',           'passed',        'Hello, {total} of {pass mark} {}'),
      ('passed + D subjects',    'passed',        'Hello, {total} of {pass mark} {D subjects}'),
      ('passed + subjects',      'passed',        'Hello, {total} of {pass mark} {subjects to work on}'),
      ('passed + note',          'passed',        'Hello, {total} of {pass mark} {below-pass-mark note}'),
      ('makeup_d + star',        'makeup_d',      'Hello, {total} of {pass mark} {subjects to work on} {star earned}'),
      ('below + star',           'makeup_below',  'Hello, {total} of {pass mark} {subjects to work on} {star earned}'),
      ('below + D subjects',     'makeup_below',  'Hello, {total} of {pass mark} {subjects to work on} {D subjects}'),
      ('below + note',           'makeup_below',  'Hello, {total} of {pass mark} {subjects to work on} {below-pass-mark note}'),
      ('stray open brace',       'passed',        'Hello, {total} of {pass mark} {first name'),
      ('stray close brace',      'passed',        'Hello, {total} of {pass mark} first name}'),
      ('double braces',          'passed',        'Hello, {{total}} of {pass mark}'),
      ('passed no total',        'passed',        'Hello, of {pass mark}'),
      ('passed no pass mark',    'passed',        'Hello, {total} of'),
      ('makeup_d no total',      'makeup_d',      'Hello, of {pass mark}, {subjects to work on}'),
      ('makeup_d no subjects',   'makeup_d',      'Hello, {total} of {pass mark}, {D subjects}'),
      ('below no pass mark',     'makeup_below',  'Hello, {total}, {subjects to work on}'),
      ('below no subjects',      'makeup_below',  'Hello, {total} of {pass mark}')
    ) as t(label, kind, body)
  loop
    select t.version into v_v2 from public.star_result_texts t where t.kind = coalesce(v_case.kind, 'passed');
    v_r := public.star_set_result_text(v_case.kind, coalesce(v_v2, 1), v_case.body);
    if v_r is distinct from '{"status": "invalid"}'::jsonb then
      raise exception 'TEST FAILED: R3 % expected invalid, got %', v_case.label, v_r;
    end if;
  end loop;
  if public.star_set_result_text('passed', null, v_min_passed) is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: R3 a null version expected invalid';
  end if;
  if public.star_set_result_text('passed', v_v + 7, '{frist name}') is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: R3 invalid must come before stale';
  end if;
  -- stale
  if public.star_set_result_text('passed', v_v - 1, v_min_passed) is distinct from '{"status": "stale"}'::jsonb
     or public.star_set_result_text('passed', v_v + 1, v_min_passed) is distinct from '{"status": "stale"}'::jsonb then
    raise exception 'TEST FAILED: R3 a wrong version expected stale';
  end if;
  reset role;
  if (select t.version from public.star_result_texts t where t.kind = 'passed') <> v_v then
    raise exception 'TEST FAILED: R3 a refused call changed the passed text';
  end if;

  -- ===================================================================
  -- R4. star_set_result_text ok
  -- ===================================================================
  select t.version, t.body into v_v, v_old from public.star_result_texts t where t.kind = 'makeup_d';
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_txt := replace(v_start_d, 'Every other grade is kept.', 'Every other grade stays.');
  v_r := public.star_set_result_text('makeup_d', v_v, v_txt);
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1, 'body', v_txt) then
    raise exception 'TEST FAILED: R4 save expected {ok, %, body}, got %', v_v + 1, v_r;
  end if;
  reset role;
  if (select t.body from public.star_result_texts t where t.kind = 'makeup_d') <> v_txt
     or (select t.updated_by from public.star_result_texts t where t.kind = 'makeup_d') is distinct from v_admin
     or (select t.updated_by_name from public.star_result_texts t where t.kind = 'makeup_d') is distinct from v_admin_name then
    raise exception 'TEST FAILED: R4 the saved row is wrong (body / updated_by / updated_by_name)';
  end if;
  select count(*) into v_n from public.change_log l where l.id > v_mark;
  if v_n <> 1 then raise exception 'TEST FAILED: R4 expected 1 history row, found %', v_n; end if;
  if not exists (select 1 from public.change_log l
                  where l.id > v_mark and l.table_name = 'star_result_texts' and l.op = 'update'
                    and l.action = 'star_set_result_text' and l.actor_id = v_admin and l.actor_name = v_admin_name
                    and l.session_id = v_a1 and l.batch_id is not null and l.location_code is null
                    and l.record_id = (select t.id from public.star_result_texts t where t.kind = 'makeup_d')
                    and l.before ->> 'body' = v_old and l.after ->> 'body' = v_txt
                    and (l.before ->> 'version')::integer = v_v and (l.after ->> 'version')::integer = v_v + 1) then
    raise exception 'TEST FAILED: R4 the history row is wrong: %',
      (select jsonb_agg(to_jsonb(l) - 'before' - 'after') from public.change_log l where l.id > v_mark);
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: R4 star_set_result_text left tkd.action / tkd.batch_id set';
  end if;
  -- the same text again: ok, nothing written, nothing logged
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_set_result_text('makeup_d', v_v + 1, v_txt);
  reset role;
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 1, 'body', v_txt)
     or exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: R4 the same text again must write nothing (got %)', v_r;
  end if;
  -- Undo = the old text saved back
  set local role authenticated;
  v_r := public.star_set_result_text('makeup_d', v_v + 1, v_old);
  reset role;
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_v + 2, 'body', v_old)
     or (select t.body from public.star_result_texts t where t.kind = 'makeup_d') <> v_old then
    raise exception 'TEST FAILED: R4 saving the old text back expected {ok, %}, got %', v_v + 2, v_r;
  end if;
  -- 2,000 characters exactly is fine; line breaks and typographic marks too
  select t.version into v_v from public.star_result_texts t where t.kind = 'passed';
  v_txt := 'Hello, {total} of {pass mark}' || repeat('x', 2000 - 29);
  set local role authenticated;
  v_r := public.star_set_result_text('passed', v_v, v_txt);
  if v_r ->> 'status' <> 'ok' or (v_r ->> 'version')::integer <> v_v + 1 then
    raise exception 'TEST FAILED: R4 a 2,000-character text expected ok, got %', v_r ->> 'status';
  end if;
  v_r := public.star_set_result_text('passed', v_v + 1, E'Hello,\n\n{full name} — {event} ({Dan}) {testing day}: {total} / {max}, pass {pass mark}, {star earned}. We’ll see you, {first name}!');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: R4 every passed blank + line breaks expected ok, got %', v_r; end if;
  select t.version into v_v2 from public.star_result_texts t where t.kind = 'makeup_below';
  v_r := public.star_set_result_text('makeup_below', v_v2, v_min_makeup);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: R4 a minimal make-up below text expected ok, got %', v_r; end if;
  select t.version into v_v2 from public.star_result_texts t where t.kind = 'makeup_d';
  v_r := public.star_set_result_text('makeup_d', v_v2,
    '{first name} {full name} {event} {Dan} {testing day} {total} {pass mark} {max} {D subjects} {subjects to work on} {below-pass-mark note}');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: R4 every make-up-with-a-D blank expected ok, got %', v_r; end if;
  reset role;
  -- the kind can never change, the rules hold even for the SQL Editor, no
  -- "empty the table"
  begin
    update public.star_result_texts set kind = 'makeup_below' where kind = 'passed';
    raise exception 'TEST FAILED: R4 the kind could be changed';
  exception when check_violation or unique_violation then null;
  end;
  begin
    update public.star_result_texts set body = 'no blanks at all' where kind = 'passed';
    raise exception 'TEST FAILED: R4 a text breaking the rules could be stored directly';
  exception when check_violation then null;
  end;
  begin
    insert into public.star_result_texts (kind, body, created_by_name, updated_by_name) values ('not_finished', v_min_passed, '', '');
    raise exception 'TEST FAILED: R4 a fourth kind could be added';
  exception when check_violation then null;
  end;
  begin
    truncate public.star_result_texts;
    raise exception 'TEST FAILED: R4 star_result_texts could be emptied with TRUNCATE';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;

  -- ===================================================================
  -- R5. The rules one by one (the helper's codes)
  -- ===================================================================
  for v_case in
    select * from (values
      ('makeup_d', null::text, 'empty'), ('x', 'Hello', 'kind'), ('passed', '', 'empty'),
      ('passed', repeat('x', 2001), 'too_long'), ('passed', 'a' || chr(13), 'bad_character'),
      ('passed', E' \n{total} {pass mark}', 'first_line'), ('passed', 'Hi {Total} {total} {pass mark}', 'unknown_blank'),
      ('passed', 'Hi {D subjects} {total} {pass mark}', 'blank_not_for_kind'),
      ('passed', 'Hi {total} {pass mark} }', 'stray_brace'), ('passed', 'Hi {total}', 'missing_required'),
      ('makeup_d', 'Hi {total} {pass mark}', 'missing_required'), ('makeup_below', 'Hi {total} {pass mark}', 'missing_required'),
      ('passed', 'Hi {total} {pass mark}', null), ('makeup_d', 'Hi {total} {pass mark} {subjects to work on}', null),
      ('makeup_below', E'Hi\n\n{total} {pass mark} {subjects to work on}\n', null)
    ) as t(kind, body, code)
  loop
    if public.star_result_text_problem(v_case.kind, v_case.body) is distinct from v_case.code then
      raise exception 'TEST FAILED: R5 star_result_text_problem(%, %) gave %, expected %', v_case.kind, left(v_case.body, 40),
        public.star_result_text_problem(v_case.kind, v_case.body), v_case.code;
    end if;
  end loop;

  -- not_found (the rows are seeded, so only a removal outside the app
  -- could cause it): removed and checked inside this transaction
  delete from public.star_result_texts where kind = 'makeup_below';
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.star_set_result_text('makeup_below', 1, v_min_makeup) is distinct from '{"status": "not_found"}'::jsonb then
    raise exception 'TEST FAILED: R3 a missing text expected not_found';
  end if;
  reset role;

  -- ===================================================================
  -- R6. M5: star_update_event keeps registration closed in one call
  -- ===================================================================
  -- a. case 2: a finished event (switch Open, no closing date) moved into
  --    the future -> one save, switch Closed, one version bump, one
  --    history row; the app's follow-up close writes nothing
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' M5 finished', v_today + 3, '10:00', 'worcester', true, null, null);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: R6a add_event answered %', v_r; end if;
  v_e := (v_r ->> 'id')::uuid;
  update public.star_events set testing_date = v_today - 2 where id = v_e;
  select * into v_ev from public.star_events e where e.id = v_e;
  if public.star_event_state(v_ev, v_today) <> 'finished' or not v_ev.registration_open then
    raise exception 'TEST SETUP: R6a the event should be finished with the switch Open';
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_update_event(v_e, v_ev.version, v_ev.name, v_today + 10, '10:00', 'worcester', null, null);
  reset role;
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_ev.version + 1) then
    raise exception 'TEST FAILED: R6a moving a finished event into the future expected {ok, %}, got %', v_ev.version + 1, v_r;
  end if;
  select * into v_ev2 from public.star_events e where e.id = v_e;
  if v_ev2.registration_open or v_ev2.testing_date <> v_today + 10 or public.star_event_state(v_ev2, v_today) <> 'closed'
     or v_ev2.first_opened_at is distinct from v_ev.first_opened_at then
    raise exception 'TEST FAILED: R6a registration must be closed by the same save (open %, state %)',
      v_ev2.registration_open, public.star_event_state(v_ev2, v_today);
  end if;
  select count(*) into v_n from public.change_log l where l.id > v_mark;
  if v_n <> 1 or not exists (select 1 from public.change_log l
                              where l.id > v_mark and l.table_name = 'star_events' and l.action = 'star_update_event'
                                and l.record_id = v_e and l.actor_id = v_admin and l.session_id = v_a1
                                and (l.before ->> 'registration_open')::boolean is true
                                and (l.after ->> 'registration_open')::boolean is false
                                and l.after ? 'testing_date') then
    raise exception 'TEST FAILED: R6a expected ONE history row with registration_open true -> false and the new date';
  end if;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_set_registration(v_e, v_ev.version + 1, false);
  reset role;
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_ev.version + 1, 'state', 'closed')
     or exists (select 1 from public.change_log l where l.id > v_mark) then
    raise exception 'TEST FAILED: R6a the app''s follow-up close must write nothing, got %', v_r;
  end if;
  -- opening stays by hand, and works
  set local role authenticated;
  v_r := public.star_set_registration(v_e, v_ev.version + 1, true);
  reset role;
  if v_r ->> 'status' <> 'ok' or v_r ->> 'state' <> 'open' then
    raise exception 'TEST FAILED: R6a opening by hand afterwards expected ok/open, got %', v_r;
  end if;

  -- a2. case 2 with a closing date still to come: a finished event
  --     (switch Open) moved into the future with a new closing date
  --     after today -> also kept closed in the same save
  set local role authenticated;
  v_r := public.star_add_event(v_tag || ' M5 finished dated', v_today + 3, '10:00', 'worcester', true, null, null);
  reset role;
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: R6a2 add_event answered %', v_r; end if;
  update public.star_events set testing_date = v_today - 2 where id = (v_r ->> 'id')::uuid;
  select * into v_ev from public.star_events e where e.id = (v_r ->> 'id')::uuid;
  if public.star_event_state(v_ev, v_today) <> 'finished' or not v_ev.registration_open then
    raise exception 'TEST SETUP: R6a2 the event should be finished with the switch Open';
  end if;
  set local role authenticated;
  v_r := public.star_update_event(v_ev.id, v_ev.version, v_ev.name, v_today + 10, '10:00', 'worcester', v_today + 2, null);
  reset role;
  select * into v_ev2 from public.star_events e where e.id = v_ev.id;
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_ev.version + 1)
     or v_ev2.registration_open or v_ev2.auto_close_on <> v_today + 2 or public.star_event_state(v_ev2, v_today) <> 'closed' then
    raise exception 'TEST FAILED: R6a2 finished event moved into the future with a closing date to come must be kept closed (got %, open %)',
      v_r, v_ev2.registration_open;
  end if;

  -- b. an OPEN event edited (rename, new date) stays open
  select * into v_ev from public.star_events e where e.id = v_e;
  set local role authenticated;
  v_r := public.star_update_event(v_e, v_ev.version, v_ev.name || ' b', v_today + 11, '10:00', 'worcester', null, null);
  reset role;
  select * into v_ev2 from public.star_events e where e.id = v_e;
  if v_r ->> 'status' <> 'ok' or not v_ev2.registration_open or public.star_event_state(v_ev2, v_today) <> 'open' then
    raise exception 'TEST FAILED: R6b an open event must stay open after an edit (got %, open %)', v_r, v_ev2.registration_open;
  end if;

  -- c. case 1: an upcoming event closed by its passed closing date
  --    (switch Open) - removing the date, or moving it later, keeps it
  --    closed in the same save
  foreach v_txt in array array['removed', 'later'] loop
    update public.star_events set auto_close_on = v_today - 1 where id = v_e;
    select * into v_ev from public.star_events e where e.id = v_e;
    if public.star_event_state(v_ev, v_today) <> 'closed_by_date' then
      raise exception 'TEST SETUP: R6c the event should be closed by its date';
    end if;
    set local role authenticated;
    v_r := public.star_update_event(v_e, v_ev.version, v_ev.name, v_ev.testing_date, '10:00', 'worcester',
                                    case when v_txt = 'later' then v_today + 2 end, null);
    reset role;
    select * into v_ev2 from public.star_events e where e.id = v_e;
    if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_ev.version + 1)
       or v_ev2.registration_open or public.star_event_state(v_ev2, v_today) <> 'closed' then
      raise exception 'TEST FAILED: R6c closing date % must keep registration closed (got %, open %)', v_txt, v_r, v_ev2.registration_open;
    end if;
    update public.star_events set registration_open = true where id = v_e;   -- back to Open for the next round
  end loop;

  -- d. the closing date kept as it was (still passed), date moved: no
  --    reopen, so nothing extra - the switch stays Open, closed by date
  update public.star_events set auto_close_on = v_today - 1 where id = v_e;
  select * into v_ev from public.star_events e where e.id = v_e;
  set local role authenticated;
  v_r := public.star_update_event(v_e, v_ev.version, v_ev.name, v_ev.testing_date + 1, '10:00', 'worcester', v_today - 1, null);
  reset role;
  select * into v_ev2 from public.star_events e where e.id = v_e;
  if v_r ->> 'status' <> 'ok' or not v_ev2.registration_open or public.star_event_state(v_ev2, v_today) <> 'closed_by_date' then
    raise exception 'TEST FAILED: R6d a kept passed closing date must leave the switch alone (got %, open %)', v_r, v_ev2.registration_open;
  end if;

  -- e. closed by hand / never opened: an edit never touches the switch
  update public.star_events set registration_open = false, auto_close_on = null, testing_date = v_today - 2 where id = v_e;
  select * into v_ev from public.star_events e where e.id = v_e;
  set local role authenticated;
  v_r := public.star_update_event(v_e, v_ev.version, v_ev.name, v_today + 12, '10:00', 'worcester', null, null);
  reset role;
  select * into v_ev2 from public.star_events e where e.id = v_e;
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_ev.version + 1)
     or v_ev2.registration_open or public.star_event_state(v_ev2, v_today) <> 'closed' then
    raise exception 'TEST FAILED: R6e a closed finished event moved into the future: got %, state %', v_r, public.star_event_state(v_ev2, v_today);
  end if;
  set local role authenticated;
  v_r := public.star_add_event(v_tag || ' M5 never', v_today + 3, '10:00', 'shrewsbury', false, null, null);
  reset role;
  v_e := (v_r ->> 'id')::uuid;
  update public.star_events set testing_date = v_today - 2 where id = v_e;
  select * into v_ev from public.star_events e where e.id = v_e;
  set local role authenticated;
  v_r := public.star_update_event(v_e, v_ev.version, v_ev.name, v_today + 4, '10:00', 'shrewsbury', null, null);
  reset role;
  select * into v_ev2 from public.star_events e where e.id = v_e;
  if v_r ->> 'status' <> 'ok' or v_ev2.registration_open or public.star_event_state(v_ev2, v_today) <> 'not_open_yet' then
    raise exception 'TEST FAILED: R6e a never-opened event moved into the future must stay not_open_yet (got %)', v_r;
  end if;

  -- f. a finished, Open event saved with the SAME values: nothing written
  --    (it stays finished, so nothing reopens)
  update public.star_events set registration_open = true, first_opened_at = now() where id = v_e;
  select * into v_ev from public.star_events e where e.id = v_e;
  update public.star_events set testing_date = v_today - 2 where id = v_e;
  select * into v_ev from public.star_events e where e.id = v_e;
  select coalesce(max(id), 0) into v_mark from public.change_log;
  set local role authenticated;
  v_r := public.star_update_event(v_e, v_ev.version, v_ev.name, v_ev.testing_date, '10:00', 'shrewsbury', null, null);
  reset role;
  if v_r is distinct from jsonb_build_object('status', 'ok', 'version', v_ev.version)
     or exists (select 1 from public.change_log l where l.id > v_mark)
     or not (select e.registration_open from public.star_events e where e.id = v_e) then
    raise exception 'TEST FAILED: R6f an unchanged save of a finished event must write nothing (got %)', v_r;
  end if;

  -- g. the old answers are unchanged for refusals (staff, stale, invalid)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.star_update_event(v_e, v_ev.version, v_ev.name, v_today + 5, '10:00', 'shrewsbury', null, null)
     is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: R6g staff expected not_allowed';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.star_update_event(v_e, v_ev.version + 1, v_ev.name, v_today + 5, '10:00', 'shrewsbury', null, null)
     is distinct from '{"status": "stale"}'::jsonb
     or public.star_update_event(v_e, v_ev.version, v_ev.name, v_today - 3, '10:00', 'shrewsbury', null, null)
     is distinct from '{"status": "invalid"}'::jsonb then
    raise exception 'TEST FAILED: R6g stale / invalid answers changed';
  end if;
  reset role;
  if (select e.registration_open from public.star_events e where e.id = v_e) is not true then
    raise exception 'TEST FAILED: R6g a refused edit changed the switch';
  end if;

  -- ===================================================================
  -- R8. star_results_csv: the three new keys (candidate_id, paid_on,
  --     sent.result_status); staff not_allowed; the download log
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_add_event(v_tag || ' CSV', v_today + 3, '10:00', 'worcester', false, null, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: R8 add_event answered %', v_r; end if;
  v_e := (v_r ->> 'id')::uuid;
  v_r := public.star_add_candidate(v_e, 'Csv', 'Alpha', (v_today - interval '30 years')::date, 'alpha@example.com', 'worcester', 1, 0, 'cash');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: R8 add_candidate A answered %', v_r; end if;
  v_ca := (v_r ->> 'id')::uuid;
  v_r := public.star_add_candidate(v_e, 'Csv', 'Beta', (v_today - interval '31 years')::date, 'beta@example.com', 'shrewsbury', 1, 0, 'cash');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: R8 add_candidate B answered %', v_r; end if;
  v_cb := (v_r ->> 'id')::uuid;
  reset role;
  -- A's payments, written directly (fixed dates and times): two payments
  -- that count, a third one reversed, then a refund (newest of all)
  insert into public.star_payments (id, candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name)
  values (gen_random_uuid(), v_ca, 'payment', 10000, 'cash',  v_today - 10, now() - interval '10 minutes', 'Staff'),
         (gen_random_uuid(), v_ca, 'payment',  6000, 'check', v_today - 5,  now() - interval '8 minutes',  'Staff');
  insert into public.star_payments (id, candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name)
  values (v_p3, v_ca, 'payment', 2000, 'card', v_today - 3, now() - interval '6 minutes', 'Staff');
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name, reverses_payment_id)
  values (v_ca, 'reversal', -2000, 'card', v_today - 2, now() - interval '4 minutes', 'Main Admin', v_p3);
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name)
  values (v_ca, 'refund', -1000, 'cash', v_today - 1, now() - interval '2 minutes', 'Main Admin');
  -- A's sends: a Make-up result sent, then a re-send of a Passed result
  insert into public.star_result_emails (candidate_id, marked_at, marked_by_name, result_status, result_total, result_needs, result_key)
  values (v_ca, now() - interval '2 days', 'Staff', 'makeup', 200, '[]', 'zz-key-1');
  insert into public.star_result_emails (id, candidate_id, marked_at, marked_by_name, result_status, result_total, result_needs, result_key)
  values (v_sent2, v_ca, now() - interval '1 day', 'Main Admin', 'passed', 280, '[]', 'zz-key-2');

  -- staff: not_allowed, and no download row
  select count(*) into v_n from public.star_downloads;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.star_results_csv(v_e, null) is distinct from '{"status": "not_allowed"}'::jsonb then
    raise exception 'TEST FAILED: R8 the desk must get not_allowed from the CSV';
  end if;
  perform set_config('request.jwt.claims', v_c_a2, true);
  if public.star_results_csv(v_e, null) is distinct from '{"status": "no_access"}'::jsonb then
    raise exception 'TEST FAILED: R8 a locked session must get no_access from the CSV';
  end if;
  reset role;
  if (select count(*) from public.star_downloads) <> v_n then raise exception 'TEST FAILED: R8 a refused CSV wrote a download row'; end if;

  -- admin: ok, one download row, the new keys
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.star_results_csv(v_e, null);
  reset role;
  if v_r ->> 'status' <> 'ok' or jsonb_array_length(v_r -> 'rows') <> 2 then
    raise exception 'TEST FAILED: R8 the CSV expected ok with 2 rows, got %', v_r ->> 'status';
  end if;
  if (select count(*) from public.star_downloads) <> v_n + 1
     or not exists (select 1 from public.star_downloads d where d.event_id = v_e and d.dan is null and d.row_count = 2
                      and d.downloaded_by = v_admin and d.downloaded_by_name = v_admin_name) then
    raise exception 'TEST FAILED: R8 the CSV must still write one download row';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'rows' -> 0) as k)
       <> array['assistant_classes', 'candidate_id', 'classes_attended', 'dan', 'date_of_birth', 'email_for_results', 'first_name',
                'is_makeup', 'last_name', 'location_code', 'needs', 'paid', 'paid_cents', 'paid_on', 'paying_by', 'result_status',
                'sent', 'stars_from', 'stars_to', 'total'] then
    raise exception 'TEST FAILED: R8 CSV row keys are %', (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'rows' -> 0) as k);
  end if;
  -- belt order: Shrewsbury (Beta) before Worcester (Alpha)
  if (v_r -> 'rows' -> 0 ->> 'candidate_id')::uuid is distinct from v_cb
     or (v_r -> 'rows' -> 1 ->> 'candidate_id')::uuid is distinct from v_ca then
    raise exception 'TEST FAILED: R8 candidate_id wrong or rows out of order: %', v_r -> 'rows';
  end if;
  -- A: paid_on = the newest payment that still counts (today - 5): the
  -- reversed one (today - 3) is skipped, the refund (today - 1) and the
  -- reversal (today - 2) never count; net 16,000 - 1,000 = 15,000
  if v_r -> 'rows' -> 1 ->> 'paid_on' is distinct from (v_today - 5)::text
     or (v_r -> 'rows' -> 1 ->> 'paid_cents')::int <> 15000 or not (v_r -> 'rows' -> 1 ->> 'paid')::boolean then
    raise exception 'TEST FAILED: R8 A paid_on / paid_cents wrong: %', v_r -> 'rows' -> 1;
  end if;
  -- A: the sent record is the re-send (passed), with its result_status
  if (select array_agg(k order by k) from jsonb_object_keys(v_r -> 'rows' -> 1 -> 'sent') as k)
       <> array['marked_at', 'marked_by_name', 'matches', 'result_status']
     or v_r -> 'rows' -> 1 -> 'sent' ->> 'result_status' <> 'passed'
     or v_r -> 'rows' -> 1 -> 'sent' ->> 'marked_by_name' <> 'Main Admin'
     or (v_r -> 'rows' -> 1 -> 'sent' ->> 'matches')::boolean then
    raise exception 'TEST FAILED: R8 A sent wrong: %', v_r -> 'rows' -> 1 -> 'sent';
  end if;
  -- B: nothing paid, nothing sent
  if v_r -> 'rows' -> 0 -> 'paid_on' <> 'null'::jsonb or (v_r -> 'rows' -> 0 ->> 'paid')::boolean
     or v_r -> 'rows' -> 0 -> 'sent' <> 'null'::jsonb then
    raise exception 'TEST FAILED: R8 B (no payment, no send) wrong: %', v_r -> 'rows' -> 0;
  end if;
  -- the re-send undone -> the earlier Make-up send shows, with its status
  update public.star_result_emails set undone_at = now(), undone_by_name = 'Main Admin' where id = v_sent2;
  -- a payment reversed while it was the newest -> paid_on falls back
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name, reverses_payment_id)
  select v_ca, 'reversal', -6000, 'check', v_today, now() - interval '1 minute', 'Main Admin', p.id
    from public.star_payments p where p.candidate_id = v_ca and p.kind = 'payment' and p.amount_cents = 6000;
  set local role authenticated;
  v_r := public.star_results_csv(v_e, 1);
  reset role;
  if v_r ->> 'status' <> 'ok' or v_r -> 'rows' -> 1 -> 'sent' ->> 'result_status' <> 'makeup'
     or v_r -> 'rows' -> 1 -> 'sent' ->> 'marked_by_name' <> 'Staff'
     or v_r -> 'rows' -> 1 ->> 'paid_on' is distinct from (v_today - 10)::text
     or (v_r -> 'rows' -> 1 ->> 'paid_cents')::int <> 9000 then
    raise exception 'TEST FAILED: R8 after undoing the re-send and reversing a payment: %', v_r -> 'rows' -> 1;
  end if;
  if (select count(*) from public.star_downloads) <> v_n + 2
     or not exists (select 1 from public.star_downloads d where d.event_id = v_e and d.dan = 1 and d.row_count = 2) then
    raise exception 'TEST FAILED: R8 the one-Dan CSV must write its own download row';
  end if;

  -- ===================================================================
  -- R7. Catalog
  -- ===================================================================
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.star_result_texts'::regclass) then
    raise exception 'TEST FAILED: R7 RLS is off on star_result_texts';
  end if;
  select count(*) into v_n from pg_policies p where p.schemaname = 'public' and p.tablename = 'star_result_texts';
  if v_n <> 1 or not exists (select 1 from pg_policies p
                              where p.schemaname = 'public' and p.tablename = 'star_result_texts'
                                and p.policyname = 'star_result_texts_select_with_access' and p.cmd = 'SELECT'
                                and p.roles = array['authenticated']::name[] and p.permissive = 'PERMISSIVE'
                                and p.qual like '%has_data_access()%' and p.with_check is null) then
    raise exception 'TEST FAILED: R7 expected exactly one has_data_access read rule on star_result_texts';
  end if;
  select string_agg(x.name, ', ') into v_txt
    from (values ('star_result_texts_before_write', 'star_before_write', 'BEFORE INSERT OR UPDATE'),
                 ('star_result_texts_log', 'change_log_write', 'AFTER INSERT OR DELETE OR UPDATE'),
                 ('star_result_texts_no_truncate', 'testing_refuse_truncate', 'BEFORE TRUNCATE')) as x(name, fn, timing)
   where not exists (select 1 from pg_trigger t
                      where t.tgrelid = 'public.star_result_texts'::regclass and t.tgname = x.name and not t.tgisinternal
                        and t.tgenabled = 'O' and t.tgfoid = ('public.' || x.fn)::regproc
                        and pg_get_triggerdef(t.oid) like '%' || x.timing || '%');
  if v_txt is not null then raise exception 'TEST FAILED: R7 missing / wrong trigger(s): %', v_txt; end if;
  if (select count(*) from pg_trigger t where t.tgrelid = 'public.star_result_texts'::regclass and not t.tgisinternal) <> 3 then
    raise exception 'TEST FAILED: R7 expected exactly 3 triggers on star_result_texts';
  end if;
  if pg_get_triggerdef((select t.oid from pg_trigger t where t.tgrelid = 'public.star_result_texts'::regclass
                         and t.tgname = 'star_result_texts_before_write')) not like '%star_before_write(''id,kind'', '''')%' then
    raise exception 'TEST FAILED: R7 star_result_texts_before_write arguments wrong';
  end if;
  for v_case in
    select p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig, p.pronargdefaults, p.provolatile, p.proowner,
           p.prorettype::regtype::text as rettype, p.proname::text as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('star_set_result_text', 'star_result_text_problem', 'star_update_event', 'star_results_csv')
  loop
    if not coalesce('search_path=""' = any (v_case.proconfig), false) or v_case.pronargdefaults <> 0
       or v_case.proowner <> (select c.relowner from pg_class c where c.oid = 'public.star_events'::regclass) then
      raise exception 'TEST FAILED: R7 % search_path / defaults / owner wrong', v_case.sig;
    end if;
    if v_case.prosecdef is distinct from (v_case.name <> 'star_result_text_problem')
       or v_case.provolatile <> (case when v_case.name = 'star_result_text_problem' then 'i' else 'v' end)
       or v_case.rettype <> (case when v_case.name = 'star_result_text_problem' then 'text' else 'jsonb' end) then
      raise exception 'TEST FAILED: R7 % security definer / volatility / return type wrong', v_case.sig;
    end if;
    if exists (select 1 from aclexplode((select p.proacl from pg_proc p where p.oid = v_case.sig::regprocedure)) a where a.grantee = 0) then
      raise exception 'TEST FAILED: R7 PUBLIC can run %', v_case.sig;
    end if;
  end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('star_set_result_text', 'star_result_text_problem', 'star_update_event', 'star_results_csv');
  if v_n <> 4 then raise exception 'TEST FAILED: R7 expected exactly one version of each 0023 function, found %', v_n; end if;
  if not has_function_privilege('authenticated', 'public.star_update_event(uuid, integer, text, date, time, text, date, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.star_update_event(uuid, integer, text, date, time, text, date, text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.star_update_event(uuid, integer, text, date, time, text, date, text)', 'EXECUTE')
     or has_function_privilege('star_registrar', 'public.star_update_event(uuid, integer, text, date, time, text, date, text)', 'EXECUTE') then
    raise exception 'TEST FAILED: R7 star_update_event rights changed';
  end if;

  raise notice 'ALL 0023 TESTS PASSED';
end
$$;

select 'ALL 0023 TESTS PASSED' as result;

rollback;
