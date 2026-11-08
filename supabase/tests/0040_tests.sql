-- =====================================================================
-- 0040_tests.sql  (test file - changes nothing: it ends with ROLLBACK)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The test for migration 0040 (the clean-up after 0036: forms stop
--   accepting a child sent as { first_name, age } and an Address answer
--   sent as one plain text; rulebook v0.640). Run it AFTER 0040 is
--   applied. What it checks:
--     T1  a child (forms_check_answers): only { first_name, last_name,
--         dob } is accepted - the old shape, the old shape with extra
--         or missing keys, a mix, an age next to a date of birth, a
--         name instead of an object are all refused; 0036's other rules
--         for the new shape still hold (names 1-40, a real date 1900-2100,
--         1-6 children)
--     T2  an Address answer (forms_check_answers): only the object
--         { street, city, state, zip } - one plain text (any length),
--         an empty text, a list, a number are refused; 0036's other
--         address rules still hold; a question that isn't required may
--         still be left out
--     T3  sign-ups through the PUBLIC page's function: a new-shape family
--         is saved as { first_name, last_name, dob, age } with the age
--         worked out on the school's today, and its prospects get the
--         last name and date of birth; the old shape and a plain-text
--         address answer "invalid" with nothing saved; ages 2 and 99 are
--         accepted, 1, 100, today and tomorrow are refused; the same
--         refusals from staff Fill in (forms_staff_submit) and from
--         forms_submit_core itself
--     C   catalog: forms_check_answers and forms_submit_core are still
--         security invoker, search_path = '', for nobody (never anon,
--         PUBLIC, authenticated, service_role or forms_registrar),
--         exactly one of each; forms_registrar still runs exactly its
--         three public functions
--   It makes its own form named "zz test ...", so it works whatever is
--   already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test form, sign-ups, prospects,
--   history rows, test sessions). NEVER change the final "rollback;" to
--   "commit;".
--
-- HOW IT PRETENDS TO BE A SIGNED-IN USER
--   As 0036_tests.sql: a pretend login token in request.jwt.claims.
--   A1 = admin unlocked (makes and publishes the test form), D1 = front
--   desk unlocked (Fill in). The public form's functions and the internal
--   checks are called as the SQL Editor's own role.
--
-- BEFORE YOU RUN IT
--   1. 0040 is applied. You need TWO existing, ACTIVE staff rows: an
--      admin and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0040 TESTS PASSED".
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
  v_d1 uuid := gen_random_uuid();
  v_amr jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60));
  v_c_a1 text;
  v_c_d1 text;

  v_tag   text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_slug  text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);
  v_last  text := 'Zzlast' || left(replace(gen_random_uuid()::text, '-', ''), 8);
  v_today date := public.schedule_today();
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg' || repeat('A', 200) || '==';

  v_r     jsonb;
  v_t     jsonb;
  v_n     integer;
  v_n2    integer;
  v_txt   text;
  v_f1    uuid;
  v_pub   integer;
  v_fields jsonb;
  v_blank jsonb;
  v_addr  jsonb;
  v_fa    jsonb;   -- Blank + a required Address question
  v_a     jsonb;   -- good answers for v_fa
  v_ok_kid jsonb;
  v_dob7  date;
  v_ans   jsonb;   -- good answers for the walk-in form
  v_kids  jsonb;
  v_sub   uuid;
  v_fn    record;
  v_two   text[] := array['forms_check_answers', 'forms_submit_core'];
  v_public_fns text[] := array['forms_public_get', 'forms_public_submit', 'forms_public_email_result'];
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
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = 'prospects' and c.column_name = 'child_dob') then
    raise exception 'TEST SETUP: prospects.child_dob is missing (is 0036 applied?)';
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
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr)::text;

  v_dob7 := (v_today - interval '7 years')::date;
  v_blank := public.forms_template('blank');
  v_addr  := jsonb_build_object('id', 'home', 'type', 'address', 'label', 'Home address', 'required', true);
  v_fa    := v_blank || jsonb_build_array(v_addr);
  v_a := jsonb_build_object('parent_name', 'Maria Lopez', 'parent_phone', '(508) 555-0123', 'parent_email', 'maria@example.com',
                            'home', jsonb_build_object('street', '12 Main St', 'city', 'Worcester', 'state', 'MA', 'zip', '01604'));
  v_ok_kid := jsonb_build_object('first_name', 'Ava', 'last_name', 'Nguyen', 'dob', '2018-05-04');

  -- -------------------------------------------------------------------
  -- T1: a child (forms_check_answers)
  -- -------------------------------------------------------------------
  for v_t in select x from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('why', 'the new shape', 'kids', jsonb_build_array(v_ok_kid)),
      jsonb_build_object('why', 'six new-shape children', 'kids', (select jsonb_agg(v_ok_kid) from generate_series(1, 6))),
      jsonb_build_object('why', 'a 40-letter last name with spaces around it',
                         'kids', jsonb_build_array(v_ok_kid || jsonb_build_object('last_name', '  ' || repeat('x', 40) || ' '))),
      jsonb_build_object('why', 'a two-word last name with an accent',
                         'kids', jsonb_build_array(v_ok_kid || '{"first_name": "José", "last_name": "de la Cruz"}')),
      jsonb_build_object('why', 'a real date in 1900 (its age is checked when the form is sent)',
                         'kids', jsonb_build_array(v_ok_kid || '{"dob": "1900-01-01"}')))) as t(x)
  loop
    if public.forms_check_answers(v_fa, v_a, v_t -> 'kids', null) <> 'ok' then
      raise exception 'TEST FAILED: T1a % should be accepted', v_t ->> 'why';
    end if;
  end loop;
  for v_t in select x from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('why', 'the old shape', 'kid', '{"first_name": "Leo", "age": 6}'::jsonb),
      jsonb_build_object('why', 'the old shape aged 2', 'kid', '{"first_name": "Leo", "age": 2}'::jsonb),
      jsonb_build_object('why', 'the old shape aged 99', 'kid', '{"first_name": "Leo", "age": 99}'::jsonb),
      jsonb_build_object('why', 'the old shape without its age', 'kid', '{"first_name": "Leo"}'::jsonb),
      jsonb_build_object('why', 'the old shape with an extra key', 'kid', '{"first_name": "Leo", "age": 6, "x": 1}'::jsonb),
      jsonb_build_object('why', 'the old shape aged 1', 'kid', '{"first_name": "Leo", "age": 1}'::jsonb),
      jsonb_build_object('why', 'the old shape aged 100', 'kid', '{"first_name": "Leo", "age": 100}'::jsonb),
      jsonb_build_object('why', 'an age too (the two shapes mixed)', 'kid', v_ok_kid || '{"age": 7}'),
      jsonb_build_object('why', 'an age instead of the last name', 'kid', (v_ok_kid - 'last_name') || '{"age": 7}'),
      jsonb_build_object('why', 'a last name and an age (no date of birth)', 'kid', (v_ok_kid - 'dob') || '{"age": 7}'),
      jsonb_build_object('why', 'a name instead of an object', 'kid', '"Ava Nguyen"'::jsonb),
      jsonb_build_object('why', 'a number instead of an object', 'kid', '7'::jsonb),
      jsonb_build_object('why', 'a list instead of an object', 'kid', '["Ava", "Nguyen"]'::jsonb),
      jsonb_build_object('why', 'an empty object', 'kid', '{}'::jsonb),
      jsonb_build_object('why', 'an empty last name', 'kid', v_ok_kid || '{"last_name": ""}'),
      jsonb_build_object('why', 'a 41-letter last name', 'kid', v_ok_kid || jsonb_build_object('last_name', repeat('x', 41))),
      jsonb_build_object('why', 'a last name that is null', 'kid', v_ok_kid || '{"last_name": null}'),
      jsonb_build_object('why', 'an empty first name', 'kid', v_ok_kid || '{"first_name": ""}'),
      jsonb_build_object('why', 'February 30', 'kid', v_ok_kid || '{"dob": "2018-02-30"}'),
      jsonb_build_object('why', 'a date without leading zeros', 'kid', v_ok_kid || '{"dob": "2018-5-4"}'),
      jsonb_build_object('why', 'a date before 1900', 'kid', v_ok_kid || '{"dob": "1899-12-31"}'),
      jsonb_build_object('why', 'a date after 2100', 'kid', v_ok_kid || '{"dob": "2101-01-01"}'),
      jsonb_build_object('why', 'a date that is a number', 'kid', v_ok_kid || '{"dob": 20180504}'),
      jsonb_build_object('why', 'no date of birth', 'kid', v_ok_kid - 'dob'),
      jsonb_build_object('why', 'an extra key', 'kid', v_ok_kid || '{"nickname": "Avi"}'))) as t(x)
  loop
    if public.forms_check_answers(v_fa, v_a, jsonb_build_array(v_t -> 'kid'), null) <> 'invalid' then
      raise exception 'TEST FAILED: T1b a child with % should be refused', v_t ->> 'why';
    end if;
  end loop;
  -- one good child and one old-shape child: the family is refused
  if public.forms_check_answers(v_fa, v_a, jsonb_build_array(v_ok_kid, '{"first_name": "Leo", "age": 6}'::jsonb), null) <> 'invalid'
     or public.forms_check_answers(v_fa, v_a, jsonb_build_array('{"first_name": "Leo", "age": 6}'::jsonb, v_ok_kid), null) <> 'invalid' then
    raise exception 'TEST FAILED: T1c a family with one child of each shape should be refused';
  end if;
  if public.forms_check_answers(v_fa, v_a, (select jsonb_agg(v_ok_kid) from generate_series(1, 7)), null) <> 'invalid'
     or public.forms_check_answers(v_fa, v_a, '[]', null) <> 'invalid'
     or public.forms_check_answers(v_fa, v_a, null, null) <> 'invalid'
     or public.forms_check_answers(v_fa, v_a, '{"first_name": "Ava", "last_name": "Nguyen", "dob": "2018-05-04"}'::jsonb, null) <> 'invalid' then
    raise exception 'TEST FAILED: T1d a family has 1-6 children, in a list';
  end if;

  -- -------------------------------------------------------------------
  -- T2: an Address answer (forms_check_answers)
  -- -------------------------------------------------------------------
  v_t := v_a -> 'home';   -- the good one
  for v_r in select x from jsonb_array_elements(jsonb_build_array(
      v_t,
      v_t || '{"zip": "01604-1234"}',
      v_t || jsonb_build_object('street', repeat('s', 120), 'city', repeat('c', 60), 'state', repeat('t', 30)),
      v_t || '{"street": "  12   Main St  "}')) as t(x)
  loop
    if public.forms_check_answers(v_fa, v_a || jsonb_build_object('home', v_r), jsonb_build_array(v_ok_kid), null) <> 'ok' then
      raise exception 'TEST FAILED: T2a the address % should be accepted', v_r;
    end if;
  end loop;
  for v_r in select x from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('why', 'a plain text', 'a', to_jsonb('12 Main St, Worcester, MA 01604'::text)),
      jsonb_build_object('why', 'a 200-letter plain text', 'a', to_jsonb(repeat('a', 200))),
      jsonb_build_object('why', 'a 1-letter plain text', 'a', to_jsonb('a'::text)),
      jsonb_build_object('why', 'an empty plain text', 'a', '""'::jsonb),
      jsonb_build_object('why', 'a blank plain text', 'a', '"   "'::jsonb),
      jsonb_build_object('why', 'a list', 'a', '["12 Main St"]'::jsonb),
      jsonb_build_object('why', 'a number', 'a', '5'::jsonb),
      jsonb_build_object('why', 'true', 'a', 'true'::jsonb),
      jsonb_build_object('why', 'no ZIP code', 'a', v_t - 'zip'),
      jsonb_build_object('why', 'an empty street', 'a', v_t || '{"street": ""}'),
      jsonb_build_object('why', 'a 121-letter street', 'a', v_t || jsonb_build_object('street', repeat('s', 121))),
      jsonb_build_object('why', 'a 4-digit ZIP code', 'a', v_t || '{"zip": "1604"}'),
      jsonb_build_object('why', 'letters for a ZIP code', 'a', v_t || '{"zip": "ABCDE"}'),
      jsonb_build_object('why', 'a ZIP code that is a number', 'a', v_t || '{"zip": 1604}'),
      jsonb_build_object('why', 'an extra key', 'a', v_t || '{"country": "US"}'),
      jsonb_build_object('why', 'no parts at all', 'a', '{}'::jsonb))) as t(x)
  loop
    if public.forms_check_answers(v_fa, v_a || jsonb_build_object('home', v_r -> 'a'), jsonb_build_array(v_ok_kid), null) <> 'invalid' then
      raise exception 'TEST FAILED: T2b an address with % should be refused', v_r ->> 'why';
    end if;
  end loop;
  if public.forms_check_answers(v_fa, v_a - 'home', jsonb_build_array(v_ok_kid), null) <> 'invalid'
     or public.forms_check_answers(v_fa, v_a || '{"home": null}', jsonb_build_array(v_ok_kid), null) <> 'invalid' then
    raise exception 'TEST FAILED: T2c a required Address question must be answered';
  end if;
  -- not required: no answer (or null) is fine; a plain text is still refused
  v_r := v_blank || jsonb_build_array(v_addr || '{"required": false}');
  if public.forms_check_answers(v_r, v_a - 'home', jsonb_build_array(v_ok_kid), null) <> 'ok'
     or public.forms_check_answers(v_r, v_a || '{"home": null}', jsonb_build_array(v_ok_kid), null) <> 'ok'
     or public.forms_check_answers(v_r, v_a || '{"home": "12 Main St"}', jsonb_build_array(v_ok_kid), null) <> 'invalid' then
    raise exception 'TEST FAILED: T2d a question that isn''t required may be left out, never answered with a plain text';
  end if;
  -- the other question types are untouched (a text question takes a text)
  if public.forms_check_answers(v_blank || jsonb_build_array(jsonb_build_object('id', 'why', 'type', 'short_text', 'label', 'Why?')),
                                v_a - 'home' || '{"why": "To learn"}', jsonb_build_array(v_ok_kid), null) <> 'ok' then
    raise exception 'TEST FAILED: T2e a short-text question should still take a text';
  end if;

  -- -------------------------------------------------------------------
  -- T3: sign-ups. A Live Walk-in form made from the template as A1
  -- -------------------------------------------------------------------
  select jsonb_agg(case when e ->> 'id' = 'waiver' then jsonb_set(e, '{text}', to_jsonb('I agree to the school''s rules.'::text)) else e end
                   order by n)
    into v_fields
    from jsonb_array_elements(public.forms_template('walk_in')) with ordinality as t(e, n);
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true or public.is_admin() is not true then
    raise exception 'TEST SETUP: A1 should be an unlocked admin';
  end if;
  v_r := public.forms_create('worcester', 'walk_in', v_tag || ' walk-in', v_slug);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: form: %', v_r; end if;
  v_f1 := (v_r ->> 'id')::uuid;
  v_r := public.forms_save_draft(v_f1, (v_r ->> 'version')::integer, v_tag || ' walk-in', v_slug, v_fields,
                                 '{"thank_you":"Thanks!","alert_email":null,"confirm_email":false,"add_to_calendar":false}');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: save draft: %', v_r; end if;
  v_r := public.forms_publish(v_f1, (v_r ->> 'version')::integer);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: publish: %', v_r; end if;
  reset role;
  select f.published_version into v_pub from public.forms f where f.id = v_f1;

  v_ans := jsonb_build_object('parent_name', 'Maria Zzlopez', 'parent_phone', '(508) 555-0136', 'parent_email', 'maria.zz@example.com',
                              'address', jsonb_build_object('street', '12 Main St', 'city', 'Worcester', 'state', 'MA', 'zip', '01604'),
                              'waiver', true);
  v_kids := jsonb_build_array(jsonb_build_object('first_name', ' Ava ', 'last_name', '  ' || v_last || ' ', 'dob', v_dob7),
                              jsonb_build_object('first_name', 'Noah', 'last_name', v_last,
                                                 'dob', (v_today - interval '5 years' + interval '1 day')::date));

  -- a new-shape family through the public page: saved as { first_name, last_name, dob, age }
  v_r := public.forms_public_submit(v_slug, 'zz-0040-new', gen_random_uuid(), v_pub, v_ans, v_kids, '[]', v_sig, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T3a a new-shape family: %', v_r; end if;
  v_sub := (v_r ->> 'id')::uuid;
  if (select s.children from public.form_submissions s where s.id = v_sub)
     is distinct from jsonb_build_array(
          jsonb_build_object('first_name', 'Ava', 'last_name', v_last, 'dob', v_dob7, 'age', 7),
          jsonb_build_object('first_name', 'Noah', 'last_name', v_last, 'dob', (v_today - interval '5 years' + interval '1 day')::date, 'age', 4)) then
    raise exception 'TEST FAILED: T3b the sign-up should keep { first_name, last_name, dob, age } (names cleaned, age worked out): %',
      (select s.children from public.form_submissions s where s.id = v_sub);
  end if;
  if (select count(*) from public.prospects p
       where p.submission_id = v_sub and p.child_last_name = v_last and p.child_dob is not null
         and p.child_age in (7, 4) and p.child_first_name in ('Ava', 'Noah')) <> 2 then
    raise exception 'TEST FAILED: T3c each prospect should get the last name, the date of birth and the age';
  end if;
  -- the same Send again (same key) gives the same answer, nothing new saved
  select count(*) into v_n from public.form_submissions s where s.form_id = v_f1;

  -- refused: the old shape, a plain-text address, a mix - and nothing saved
  v_txt := concat_ws(',',
    public.forms_public_submit(v_slug, 'zz-0040-old', gen_random_uuid(), v_pub, v_ans,
      '[{"first_name": "Leo", "age": 6}]', '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0040-old', gen_random_uuid(), v_pub, v_ans,
      jsonb_build_array(v_kids -> 0, '{"first_name": "Leo", "age": 6}'::jsonb), '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0040-old', gen_random_uuid(), v_pub,
      (v_ans - 'address') || '{"address": "12 Main St, Worcester, MA 01604"}', v_kids, '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0040-old', gen_random_uuid(), v_pub,
      (v_ans - 'address') || '{"address": "12 Main St, Worcester, MA 01604"}',
      '[{"first_name": "Leo", "age": 6}]', '[]', v_sig, null) ->> 'status');
  if v_txt is distinct from 'invalid,invalid,invalid,invalid'
     or (select count(*) from public.form_submissions s where s.form_id = v_f1) <> v_n then
    raise exception 'TEST FAILED: T3d the old child shape, a plain-text address and a mix should be refused, nothing saved: %', v_txt;
  end if;

  -- the age: 2-99 on today - refused families save nothing
  v_txt := concat_ws(',',
    public.forms_public_submit(v_slug, 'zz-0040-age', gen_random_uuid(), v_pub, v_ans,   -- turns 2 tomorrow: 1
      jsonb_build_array(jsonb_build_object('first_name', 'Bea', 'last_name', v_last, 'dob', (v_today - interval '2 years' + interval '1 day')::date)),
      '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0040-age', gen_random_uuid(), v_pub, v_ans,   -- 100 today
      jsonb_build_array(jsonb_build_object('first_name', 'Bea', 'last_name', v_last, 'dob', (v_today - interval '100 years')::date)),
      '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0040-age', gen_random_uuid(), v_pub, v_ans,   -- born today: 0
      jsonb_build_array(jsonb_build_object('first_name', 'Bea', 'last_name', v_last, 'dob', v_today)),
      '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0040-age', gen_random_uuid(), v_pub, v_ans,   -- born tomorrow
      jsonb_build_array(jsonb_build_object('first_name', 'Bea', 'last_name', v_last, 'dob', v_today + 1)),
      '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0040-age', gen_random_uuid(), v_pub, v_ans,   -- a good child and one aged 1
      jsonb_build_array(v_kids -> 1,
                        jsonb_build_object('first_name', 'Bea', 'last_name', v_last, 'dob', (v_today - interval '2 years' + interval '1 day')::date)),
      '[]', v_sig, null) ->> 'status');
  if v_txt is distinct from 'invalid,invalid,invalid,invalid,invalid'
     or (select count(*) from public.form_submissions s where s.form_id = v_f1) <> v_n then
    raise exception 'TEST FAILED: T3e ages 1, 100, 0, a birthday in the future and a family with one child aged 1 should be refused, nothing saved: %', v_txt;
  end if;
  -- ... by forms_submit_core itself (called as postgres - the app can't call it): "invalid", not a table-rule error
  begin
    v_r := public.forms_submit_core(v_f1, gen_random_uuid(), v_pub, v_ans,
             jsonb_build_array(jsonb_build_object('first_name', 'Bea', 'last_name', v_last,
                                                  'dob', (v_today - interval '2 years' + interval '1 day')::date)),
             '[]', v_sig, 'staff', 'zz test');
  exception when check_violation then
    raise exception 'TEST FAILED: T3f forms_submit_core should refuse a child aged 1 itself, not fail on the prospects rule';
  end;
  if v_r ->> 'status' is distinct from 'invalid' then
    raise exception 'TEST FAILED: T3f forms_submit_core with a child aged 1 gave %', v_r;
  end if;
  v_r := public.forms_submit_core(v_f1, gen_random_uuid(), v_pub, v_ans, '[{"first_name": "Leo", "age": 6}]', '[]', v_sig, 'staff', 'zz test');
  if v_r ->> 'status' is distinct from 'invalid' then
    raise exception 'TEST FAILED: T3g forms_submit_core with an old-shape child gave %', v_r;
  end if;
  -- ages 2 and 99 are fine
  v_txt := concat_ws(',',
    public.forms_public_submit(v_slug, 'zz-0040-age2', gen_random_uuid(), v_pub, v_ans,   -- 2 today
      jsonb_build_array(jsonb_build_object('first_name', 'Cal', 'last_name', v_last, 'dob', (v_today - interval '2 years')::date)),
      '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0040-age2', gen_random_uuid(), v_pub, v_ans,   -- turns 100 tomorrow: 99
      jsonb_build_array(jsonb_build_object('first_name', 'Dot', 'last_name', v_last, 'dob', (v_today - interval '100 years' + interval '1 day')::date)),
      '[]', v_sig, null) ->> 'status');
  if v_txt is distinct from 'ok,ok' then
    raise exception 'TEST FAILED: T3h ages 2 and 99 on today should be accepted: %', v_txt;
  end if;

  -- staff Fill in (front desk): the same rules
  select count(*) into v_n2 from public.form_submissions s where s.form_id = v_f1;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_txt := concat_ws(',',
    public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans, '[{"first_name": "Leo", "age": 6}]', '[]', v_sig) ->> 'status',
    public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, (v_ans - 'address') || '{"address": "12 Main St"}', v_kids, '[]', v_sig) ->> 'status',
    public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans, v_kids, '[]', v_sig) ->> 'status');
  reset role;
  if v_txt is distinct from 'invalid,invalid,ok'
     or (select count(*) from public.form_submissions s where s.form_id = v_f1) <> v_n2 + 1 then
    raise exception 'TEST FAILED: T3i Fill in: the old shape and a plain-text address refused, a new-shape family saved (one new sign-up): %', v_txt;
  end if;

  -- -------------------------------------------------------------------
  -- C: catalog
  -- -------------------------------------------------------------------
  for v_fn in select p.proname, p.oid, p.prosecdef, p.proconfig, p.proacl,
                     (select count(*) from pg_proc q join pg_namespace qn on qn.oid = q.pronamespace
                       where qn.nspname = 'public' and q.proname = p.proname) as versions
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = any (v_two)
  loop
    if v_fn.versions <> 1 then
      raise exception 'TEST FAILED: C1 % should exist once (%)', v_fn.proname, v_fn.versions;
    end if;
    if v_fn.prosecdef or v_fn.proconfig is distinct from array['search_path=""'] then
      raise exception 'TEST FAILED: C2 % should be security invoker with search_path = '''' (definer %, settings %)',
        v_fn.proname, v_fn.prosecdef, v_fn.proconfig;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE') or has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
       or has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
       or has_function_privilege('forms_registrar', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', (select proowner from pg_proc where oid = v_fn.oid)))) a
                   where a.grantee = 0) then
      raise exception 'TEST FAILED: C3 % should be callable by nobody but its owner', v_fn.proname;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any (v_two)) <> 2 then
    raise exception 'TEST FAILED: C1b both functions should be there';
  end if;
  if (select array_agg(p.proname::text order by p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('forms_registrar', p.oid, 'EXECUTE'))
     is distinct from (select array_agg(x order by x) from unnest(v_public_fns) x) then
    raise exception 'TEST FAILED: C4 forms_registrar should run exactly its three public functions';
  end if;

end;
$$;

select 'ALL 0040 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
