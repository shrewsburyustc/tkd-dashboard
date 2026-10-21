-- =====================================================================
-- 0020_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0020_session_id_claims.sql (the
--   new public.current_session_id(), rulebook v0.408). It checks, in this
--   order:
--     S1  the answer for every kind of login-token setting:
--         a. request.jwt.claims with a valid session_id -> that uuid
--            (also in upper case)
--         b. ONLY the legacy request.jwt.claim has a session_id, claims
--            empty -> NULL (the planted value is ignored)
--         c. both set -> the one from request.jwt.claims
--         d. claims missing / empty / without session_id / session_id
--            null -> NULL
--         e. a session_id that is not a uuid (too short, extra text,
--            spaces, a number, a list) -> NULL
--         f. claims that are not JSON or not a JSON object -> NULL, and
--            no error
--     S2  the history: a change_log row written while ONLY the legacy
--         setting carries a session id gets session_id NULL; one written
--         with real claims gets the claims' session id
--     S3  the catalog: language sql, stable, security definer,
--         search_path = '', same owner as verify_pin, returns uuid, and
--         public / anon / authenticated can't run it
--     S4  the PIN path still works with the new function, for a signed-in
--         admin whose claims carry a session id while the legacy setting
--         carries ANOTHER one: wrong PIN counts against the claims' session
--         only, right PIN unlocks it, touch_session, Lock now, PIN again;
--         and with the session id ONLY in the legacy setting the PIN path
--         and data access refuse (password_required / false)
--   It uses a made-up test class name ("zz test 1a2b3c4d ...") and
--   made-up session ids, so it works whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (the test class, its history
--   rows, the test sessions, the throwaway PIN, counters, unlock rows).
--   NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE A SIGNED-IN USER
--   Same trick as verify_pin_tests.sql (read its header): "set local role
--   authenticated" + a pretend login token in request.jwt.claims. The
--   attack is copied by ALSO filling the legacy request.jwt.claim setting
--   with a different session id. set_config(..., true) = only until the
--   transaction ends.
--
-- BEFORE YOU RUN IT
--   1. 0001-0003 and 0020 are applied (on production also 0004-0006,
--      0010, 0011, 0014). You need ONE existing, ACTIVE admin staff row.
--   2. Replace <paste-admin-UID-here> below (one place) with that admin's
--      UID from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      The test uses its own throwaway PIN (2580) and rolls it back; your
--      real PIN is not needed and not changed. Supabase may warn about
--      destructive operations (the setup clears the admin's PIN counters
--      inside the transaction). Everything is rolled back. Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0020 TESTS PASSED".
--   * Failed: an error starting with "TEST FAILED:" (or "TEST SETUP:")
--     saying which check broke and what came back instead. Nothing was
--     saved either way. If it failed, run   rollback;   on its own once.
-- =====================================================================

begin;

do $$
declare
  -- >>> EDIT THIS LINE <<<
  v_admin uuid := '<paste-admin-UID-here>';

  v_s     uuid := gen_random_uuid();   -- the real session (in request.jwt.claims)
  v_evil  uuid := gen_random_uuid();   -- the planted one (in the legacy request.jwt.claim)
  v_now_s bigint := extract(epoch from now())::bigint;
  v_amr   jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_claims text;
  v_evil_claim text := jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'session_id', v_evil)::text;
  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_role  text;
  v_got   uuid;
  v_txt   text;
  v_n     integer;
  v_id    uuid;
  v_id2   uuid;
  v_fn    record;
  v_case  record;
begin
  -- -------------------------------------------------------------------
  -- Setup (as the "postgres" role the SQL Editor uses)
  -- -------------------------------------------------------------------
  select s.role into v_role from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  if to_regprocedure('public.current_session_id()') is null then
    raise exception 'TEST SETUP: public.current_session_id() is missing';
  end if;
  if pg_get_functiondef('public.current_session_id()'::regprocedure) not like '%pg_input_is_valid%' then
    raise exception 'TEST SETUP: current_session_id() is still the old version (is 0020 applied?)';
  end if;
  v_claims := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_s, 'amr', v_amr)::text;

  -- ===================================================================
  -- S1. The answer for every kind of setting
  -- ===================================================================
  -- a. valid claims -> that uuid (also upper case, like 0001's ~* check)
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claims', v_claims, true);
  v_got := public.current_session_id();
  if v_got is distinct from v_s then
    raise exception 'TEST FAILED: S1a valid claims gave %, expected %', v_got, v_s;
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('session_id', upper(v_s::text))::text, true);
  v_got := public.current_session_id();
  if v_got is distinct from v_s then
    raise exception 'TEST FAILED: S1a upper-case session id gave %, expected %', v_got, v_s;
  end if;

  -- b. only the legacy setting has a session id -> NULL
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim', v_evil_claim, true);
  if (auth.jwt() ->> 'session_id') is distinct from v_evil::text then
    raise exception 'TEST SETUP: S1b auth.jwt() should show the planted session id (it reads request.jwt.claim first); got %',
      auth.jwt() ->> 'session_id';
  end if;
  v_got := public.current_session_id();
  if v_got is not null then
    raise exception 'TEST FAILED: S1b the planted legacy request.jwt.claim was used: got %', v_got;
  end if;

  -- c. both set -> the claims one
  perform set_config('request.jwt.claims', v_claims, true);
  v_got := public.current_session_id();
  if v_got is distinct from v_s then
    raise exception 'TEST FAILED: S1c with both settings got %, expected the claims session %', v_got, v_s;
  end if;

  -- d. claims missing / empty / no session_id / session_id null -> NULL
  --    (the legacy setting keeps its planted value the whole time)
  for v_case in
    select * from (values
      ('empty',             ''),
      ('only spaces',       '   '),
      ('{} (no session_id)', '{}'),
      ('session_id null',   '{"session_id": null}'),
      ('session_id empty',  '{"session_id": ""}'),
      ('sub only',          '{"sub": "' || v_admin::text || '"}'),
      ('nested session_id', '{"user": {"session_id": "' || v_s::text || '"}}')
    ) as t(label, val)
  loop
    perform set_config('request.jwt.claims', v_case.val, true);
    v_got := public.current_session_id();
    if v_got is not null then
      raise exception 'TEST FAILED: S1d claims % gave %, expected NULL', v_case.label, v_got;
    end if;
  end loop;
  -- (A setting that was never set at all reads as NULL, and nullif() turns
  -- '' into NULL too, so 'empty' above takes the same path as 'missing'.
  -- Once set, a setting can't be un-set inside a transaction.)

  -- e. not a uuid -> NULL
  for v_case in
    select * from (values
      ('too short',     '{"session_id": "' || left(v_s::text, 35) || '"}'),
      ('extra text',    '{"session_id": "' || v_s::text || 'x"}'),
      ('leading space', '{"session_id": " ' || v_s::text || '"}'),
      ('no dashes',     '{"session_id": "' || replace(v_s::text, '-', '') || '"}'),
      ('braces',        '{"session_id": "{' || v_s::text || '}"}'),
      ('not hex',       '{"session_id": "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"}'),
      ('newline after', '{"session_id": "' || v_s::text || '\n"}'),
      ('a number',      '{"session_id": 12345}'),
      ('a list',        '{"session_id": ["' || v_s::text || '"]}'),
      ('an object',     '{"session_id": {"id": "' || v_s::text || '"}}'),
      ('true',          '{"session_id": true}')
    ) as t(label, val)
  loop
    perform set_config('request.jwt.claims', v_case.val, true);
    begin
      v_got := public.current_session_id();
    exception
      when others then
        raise exception 'TEST FAILED: S1e session_id % raised an error: %', v_case.label, sqlerrm;
    end;
    if v_got is not null then
      raise exception 'TEST FAILED: S1e session_id % gave %, expected NULL', v_case.label, v_got;
    end if;
  end loop;

  -- f. not JSON / not a JSON object -> NULL, no error
  for v_case in
    select * from (values
      ('plain text',      'not json'),
      ('half an object',  '{"session_id": "' || v_s::text || '"'),
      ('a bare uuid',     v_s::text),
      ('single quotes',   '{''session_id'': ''' || v_s::text || '''}'),
      ('a JSON list',     '["' || v_s::text || '"]'),
      ('a JSON string',   '"' || v_s::text || '"'),
      ('a JSON number',   '42'),
      ('JSON null',       'null'),
      ('two objects',     '{} {}')
    ) as t(label, val)
  loop
    perform set_config('request.jwt.claims', v_case.val, true);
    begin
      v_got := public.current_session_id();
    exception
      when others then
        raise exception 'TEST FAILED: S1f claims % raised an error: %', v_case.label, sqlerrm;
    end;
    if v_got is not null then
      raise exception 'TEST FAILED: S1f claims % gave %, expected NULL', v_case.label, v_got;
    end if;
  end loop;

  -- ===================================================================
  -- S2. The history (change_log) - a real logged write: a test class
  -- added straight into public.testing_classes as postgres (its trigger
  -- writes the history row with public.current_session_id()).
  -- ===================================================================
  -- a. only the legacy setting carries a session id -> the row gets NULL
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim', v_evil_claim, true);
  perform set_config('tkd.actor_label', '0020 test', true);
  insert into public.testing_classes (location_code, name, position)
  select 'worcester', v_tag || ' planted', coalesce(max(c.position), -1) + 1
    from public.testing_classes c where c.location_code = 'worcester'
  returning id into v_id;
  select count(*) into v_n
    from public.change_log l where l.table_name = 'testing_classes' and l.record_id = v_id and l.op = 'insert';
  if v_n <> 1 then
    raise exception 'TEST FAILED: S2a expected 1 history row for the test class, got %', v_n;
  end if;
  select l.session_id into v_got
    from public.change_log l where l.table_name = 'testing_classes' and l.record_id = v_id and l.op = 'insert';
  if v_got is not null then
    raise exception 'TEST FAILED: S2a the history row took the planted session id %', v_got;
  end if;

  -- b. real claims (and the planted legacy value still there) -> the
  --    claims' session id
  perform set_config('request.jwt.claims', jsonb_build_object('session_id', v_s)::text, true);
  insert into public.testing_classes (location_code, name, position)
  select 'worcester', v_tag || ' real', coalesce(max(c.position), -1) + 1
    from public.testing_classes c where c.location_code = 'worcester'
  returning id into v_id2;
  select l.session_id into v_got
    from public.change_log l where l.table_name = 'testing_classes' and l.record_id = v_id2 and l.op = 'insert';
  if v_got is distinct from v_s then
    raise exception 'TEST FAILED: S2b the history row has session id %, expected %', v_got, v_s;
  end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.actor_label', '', true);

  -- ===================================================================
  -- S3. The catalog
  -- ===================================================================
  select p.prosecdef, p.provolatile, l.lanname, p.proconfig, p.prorettype::regtype::text as rettype,
         p.proowner, p.proacl
    into v_fn
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.current_session_id()'::regprocedure;
  if not v_fn.prosecdef then
    raise exception 'TEST FAILED: S3 current_session_id must be security definer';
  end if;
  if v_fn.provolatile <> 's' then
    raise exception 'TEST FAILED: S3 current_session_id must be stable, got %', v_fn.provolatile;
  end if;
  if v_fn.lanname <> 'sql' then
    raise exception 'TEST FAILED: S3 current_session_id must be language sql, got %', v_fn.lanname;
  end if;
  if v_fn.proconfig is distinct from array['search_path=""'] then
    raise exception 'TEST FAILED: S3 current_session_id settings must be search_path="", got %', v_fn.proconfig;
  end if;
  if v_fn.rettype <> 'uuid' then
    raise exception 'TEST FAILED: S3 current_session_id must return uuid, got %', v_fn.rettype;
  end if;
  if v_fn.proowner <> (select p.proowner from pg_proc p where p.oid = 'public.verify_pin(text)'::regprocedure) then
    raise exception 'TEST FAILED: S3 current_session_id owner % differs from verify_pin''s owner', v_fn.proowner::regrole;
  end if;
  if exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) a where a.grantee = 0) then
    raise exception 'TEST FAILED: S3 PUBLIC (everyone) may run current_session_id';
  end if;
  if has_function_privilege('anon', 'public.current_session_id()', 'execute') then
    raise exception 'TEST FAILED: S3 anon may run current_session_id';
  end if;
  if has_function_privilege('authenticated', 'public.current_session_id()', 'execute') then
    raise exception 'TEST FAILED: S3 authenticated may run current_session_id';
  end if;
  -- and really refused when tried as the app's role
  perform set_config('request.jwt.claims', v_claims, true);
  set local role authenticated;
  begin
    perform public.current_session_id();
    raise exception 'TEST FAILED: S3 authenticated could call current_session_id directly';
  exception
    when insufficient_privilege then null;   -- expected: permission denied
  end;
  reset role;

  -- ===================================================================
  -- S4. The PIN path, with a planted legacy session id next to real claims
  -- ===================================================================
  -- known starting state (all rolled back): throwaway PIN 2580, no
  -- counters / unlock rows for the two test sessions; both sessions exist
  -- in Supabase Auth, so the planted one would look "real" too
  update public.staff
     set pin_hash = extensions.crypt('2580', extensions.gen_salt('bf', 10))
   where id = v_admin;
  begin
    insert into auth.sessions (id, user_id) values (v_s, v_admin), (v_evil, v_admin);
  exception
    when others then
      raise exception 'TEST SETUP: could not add test sessions to auth.sessions (%). Tell Claude.', sqlerrm;
  end;
  -- (the planted token carries the same "amr" as the real one: auth.jwt()
  -- reads the legacy setting first, so the password-age check would
  -- otherwise fail and hide what this part tests - the session id)
  perform set_config('request.jwt.claim',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_evil, 'amr', v_amr)::text, true);
  perform set_config('request.jwt.claims', v_claims, true);

  -- a. the same uuid as before: the claims' session (checked as postgres -
  --    the app's role may not call these helpers directly)
  v_got := public.current_session_id();
  if v_got is distinct from v_s then
    raise exception 'TEST FAILED: S4a current_session_id() gave %, expected the claims session %', v_got, v_s;
  end if;
  if public.session_exists() is distinct from true then
    raise exception 'TEST FAILED: S4a session_exists() should be true for the claims session';
  end if;

  set local role authenticated;
  -- b. wrong PIN counts (for the claims session only)
  v_txt := public.verify_pin('0000');
  if v_txt is distinct from 'wrong:4' then
    raise exception 'TEST FAILED: S4b wrong PIN gave %, expected wrong:4', v_txt;
  end if;
  -- c. right PIN unlocks
  v_txt := public.verify_pin('2580');
  if v_txt is distinct from 'ok' then
    raise exception 'TEST FAILED: S4c right PIN gave %, expected ok', v_txt;
  end if;
  if public.has_data_access() is distinct from true then
    raise exception 'TEST FAILED: S4c has_data_access() should be true after the right PIN';
  end if;
  v_txt := public.touch_session();
  if v_txt is distinct from 'unlocked' then
    raise exception 'TEST FAILED: S4c touch_session gave %, expected unlocked', v_txt;
  end if;
  -- d. Lock now -> no data; the PIN opens it again
  perform public.lock_session();
  if public.has_data_access() is distinct from false then
    raise exception 'TEST FAILED: S4d has_data_access() should be false after Lock now';
  end if;
  v_txt := public.touch_session();
  if v_txt is distinct from 'locked' then
    raise exception 'TEST FAILED: S4d touch_session after Lock now gave %, expected locked', v_txt;
  end if;
  v_txt := public.verify_pin('2580');
  if v_txt is distinct from 'ok' or public.has_data_access() is distinct from true then
    raise exception 'TEST FAILED: S4d PIN after Lock now gave % / access %, expected ok / true', v_txt, public.has_data_access();
  end if;
  reset role;

  -- e. the counter and the unlock row are on the claims session, nothing
  --    on the planted one
  select count(*) into v_n from public.pin_attempts a where a.session_id = v_s and a.staff_id = v_admin and a.failed = 0;
  if v_n <> 1 then
    raise exception 'TEST FAILED: S4e expected one pin_attempts row (reset to 0 by the right PIN) for the claims session, got %', v_n;
  end if;
  select count(*) into v_n from public.session_unlock u where u.session_id = v_s and u.unlocked_until > now();
  if v_n <> 1 then
    raise exception 'TEST FAILED: S4e expected the claims session to be unlocked on the server, got % row(s)', v_n;
  end if;
  select count(*) into v_n from public.pin_attempts a where a.session_id = v_evil;
  select v_n + count(*) into v_n from public.session_unlock u where u.session_id = v_evil;
  if v_n <> 0 then
    raise exception 'TEST FAILED: S4e the planted session got % pin_attempts / session_unlock row(s)', v_n;
  end if;

  -- f. claims that sign the admin in but carry NO session id, with the
  --    planted legacy session id next to them: the planted id is ignored,
  --    so there is no session = password_required (0001's version would
  --    have used the planted session, which exists in auth.sessions)
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'amr', v_amr)::text, true);
  set local role authenticated;
  v_txt := public.touch_session();
  if v_txt is distinct from 'password_required' then
    raise exception 'TEST FAILED: S4f touch_session with the session id only in the legacy setting gave %, expected password_required', v_txt;
  end if;
  v_txt := public.verify_pin('2580');
  if v_txt is distinct from 'password_required' then
    raise exception 'TEST FAILED: S4f verify_pin with the session id only in the legacy setting gave %, expected password_required', v_txt;
  end if;
  if public.has_data_access() is distinct from false then
    raise exception 'TEST FAILED: S4f has_data_access() with the session id only in the legacy setting should be false';
  end if;
  reset role;

  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select 'ALL 0020 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. Do not change this to commit.
rollback;
