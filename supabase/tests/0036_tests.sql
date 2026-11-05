-- =====================================================================
-- 0036_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0036_new_students_profile.sql
--   (each child's last name and date of birth, the Address question;
--   rulebook v0.634 - v0.639). It checks, in this order:
--     T1  the field list: an Address question is allowed (required or
--         not, with help and "Show only if"); two of them, options, a
--         text, "locked", a "Show only if" on a later question - refused
--     T2  the templates: Free class and Walk-in have the Address question
--         right after Email (required), Event too (not required), Blank
--         none; every other field in its place
--     T3  a child (forms_check_answers): the old shape { first_name, age }
--         and the new { first_name, last_name, dob } are accepted (also
--         one of each in a family); bad last names, bad dates, a missing,
--         extra or mixed key, the old shape without its age - refused
--     T4  an Address answer: { street, city, state, zip } and one plain
--         text (the live page's text box) accepted; a missing, empty or
--         too long part, a bad ZIP code (also full-width or Arabic-Indic
--         digits), an extra key, a part that isn't text, a list, a number
--         - refused; required / not required / "Show only if"
--     T5  sign-ups: a new-shape family (public page, with a free class)
--         is saved as { first_name, last_name, dob, age } with the age
--         worked out on today, and its prospects get the last name, date
--         of birth and age; age 2 and 99 accepted; age 1, 100, 0, a date
--         in the future, and a family with one child aged 1 refused with
--         nothing saved - by 0036's own check, not only by the prospects
--         table's rule behind it; the live page's way (the old shape and the
--         address as one text) still works, its prospect with no last
--         name or date of birth; staff Fill in with the new shape
--     T6  the 4000-byte limit: six children with 40-letter names in a
--         4-byte alphabet (over 2000 bytes) are accepted; the table rule
--         refuses a children list over 4000 bytes
--     T7  Prospects: the list has child_last_name (null for the old
--         shape) and never a date of birth, age, phone, email or answers;
--         the profile has child_last_name, child_dob and each sibling's
--         last name and date of birth (for the sibling's age today);
--         search finds a child by last name in any case (and still by
--         first name, parent name and phone); a locked session and anon
--         get nothing, and nobody reads the new columns directly
--     T8  form_submissions straight from the table (security review): the
--         front desk reads id, form_id, location_code and created_at, and
--         never the children, answers, parent's details, signature or any
--         other column
--     C   catalog: the eight replaced functions keep search_path = '',
--         security definer (the three readers and the trigger) or not,
--         and their rights (readers: authenticated only; the rest:
--         nobody; never anon, PUBLIC, service_role or forms_registrar),
--         exactly one of each; forms_registrar still runs exactly its
--         three public functions; the two columns and their rules, the
--         size rule; form_submissions: exactly four columns readable by
--         the app, nothing for anon / service_role / forms_registrar, RLS
--         and its one policy unchanged
--   It makes its own test class, time slot and form named "zz test ...",
--   so it works whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test class, slot, form,
--   sign-ups, prospects, history rows, test sessions). NEVER change the
--   final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0031_tests.sql: a pretend login token per session in
--   request.jwt.claims. A1 = admin unlocked, A2 = admin who pressed Lock
--   (shut out), D1 = front desk unlocked. The public form's functions are
--   called as the SQL Editor's own role (they run as their owner, so the
--   answers are the same as for forms_registrar). The internal checks
--   (forms_check_answers, forms_fields_are_valid, forms_template) are
--   called as the SQL Editor's role too: the app can't call them.
--
-- BEFORE YOU RUN IT
--   1. 0036 is applied. You need TWO existing, ACTIVE staff rows: an
--      admin and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0036 TESTS PASSED".
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
  v_last  text := 'Zzlast' || left(replace(gen_random_uuid()::text, '-', ''), 8);   -- a last name no real family has
  v_today date := public.schedule_today();       -- the school's today, as 0036 uses it
  v_day   date := public.schedule_today() + 3;   -- the free-class day
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg' || repeat('A', 200) || '==';
  v_big   text := repeat(chr(131072), 40);       -- 40 letters of a 4-byte alphabet (U+20000)

  v_r     jsonb;
  v_t     jsonb;
  v_n     integer;
  v_txt   text;
  v_vw    uuid;
  v_cw1   uuid;
  v_f1    uuid;
  v_pub   integer;
  v_tpl   jsonb;    -- the Free class template, as 0036 makes it
  v_fields jsonb;   -- ... with its waiver wording
  v_blank jsonb;    -- the Blank template (the four fixed fields)
  v_addr  jsonb;    -- an Address question (id "home")
  v_fa    jsonb;    -- Blank + a required Address question
  v_a     jsonb;    -- good answers for v_fa
  v_ok_kid jsonb;   -- one good new-shape child
  v_dob7  date;     -- 7 years old today
  v_dob4  date;     -- turns 5 tomorrow: 4 today
  v_ans_new  jsonb;
  v_ans_old  jsonb;
  v_kids_new jsonb;
  v_book  jsonb;
  v_sub_new uuid;
  v_sub_old uuid;
  v_p_ava  uuid;
  v_p_noah uuid;
  v_p_leo  uuid;
  v_fn    record;
  v_public_fns text[] := array['forms_public_get', 'forms_public_submit', 'forms_public_email_result'];
  v_eight text[] := array['forms_fields_are_valid', 'forms_template', 'forms_check_answers', 'forms_submit_core',
                          'prospects_from_submission', 'prospects_list', 'prospects_search', 'prospects_get'];
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
  if not exists (select 1 from pg_attribute a where a.attrelid = 'public.prospects'::regclass and a.attname = 'child_dob') then
    raise exception 'TEST SETUP: prospects.child_dob is missing (is 0036 applied?)';
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

  v_dob7 := (v_today - interval '7 years')::date;
  v_dob4 := (v_today - interval '5 years' + interval '1 day')::date;

  -- -------------------------------------------------------------------
  -- T1: the field list - the Address question (internal check, as postgres)
  -- -------------------------------------------------------------------
  v_blank := public.forms_template('blank');
  v_addr  := jsonb_build_object('id', 'home', 'type', 'address', 'label', 'Home address', 'required', true);
  v_fa    := v_blank || jsonb_build_array(v_addr);
  if not public.forms_fields_are_valid(v_fa)
     or not public.forms_fields_publishable(v_fa)
     or not public.forms_fields_are_valid(v_blank || jsonb_build_array(v_addr || '{"required": false}'))
     or not public.forms_fields_are_valid(v_blank || jsonb_build_array(v_addr - 'required'))
     or not public.forms_fields_are_valid(v_blank || jsonb_build_array(
              jsonb_build_object('id', 'where', 'type', 'choice', 'label', 'Where?', 'options', jsonb_build_array('Home', 'Away')),
              v_addr || jsonb_build_object('show_if', jsonb_build_object('field', 'where', 'value', 'Home'), 'help', 'Where you live'))) then
    raise exception 'TEST FAILED: T1a an Address question (required or not, with help and "Show only if") should be allowed';
  end if;
  for v_t in select x from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('why', 'a second Address question', 'fields', v_fa || jsonb_build_array(v_addr || '{"id": "home2"}')),
      jsonb_build_object('why', 'options', 'fields', v_blank || jsonb_build_array(v_addr || '{"options": ["A", "B"]}')),
      jsonb_build_object('why', 'a text', 'fields', v_blank || jsonb_build_array(v_addr || '{"text": "x"}')),
      jsonb_build_object('why', '"locked"', 'fields', v_blank || jsonb_build_array(v_addr || '{"locked": true}')),
      jsonb_build_object('why', 'required as a word', 'fields', v_blank || jsonb_build_array(v_addr || '{"required": "yes"}')),
      jsonb_build_object('why', 'no label', 'fields', v_blank || jsonb_build_array(v_addr - 'label')),
      jsonb_build_object('why', '"Show only if" on a later question',
                         'fields', v_blank || jsonb_build_array(v_addr || '{"show_if": {"field": "where", "value": "Home"}}',
                                     jsonb_build_object('id', 'where', 'type', 'choice', 'label', 'Where?',
                                                        'options', jsonb_build_array('Home', 'Away')))))) as t(x)
  loop
    if public.forms_fields_are_valid(v_t -> 'fields') then
      raise exception 'TEST FAILED: T1b an Address question with % should be refused', v_t ->> 'why';
    end if;
  end loop;

  -- -------------------------------------------------------------------
  -- T2: the templates (as postgres)
  -- -------------------------------------------------------------------
  if public.forms_template('free_class') -> 3 <> jsonb_build_object('id', 'address', 'type', 'address', 'label', 'Home address', 'required', true)
     or public.forms_template('walk_in') -> 3 <> jsonb_build_object('id', 'address', 'type', 'address', 'label', 'Home address', 'required', true)
     or public.forms_template('event') -> 3 <> jsonb_build_object('id', 'address', 'type', 'address', 'label', 'Home address', 'required', false) then
    raise exception 'TEST FAILED: T2a the Address question should come right after Email: required on Free class and Walk-in, not on Event';
  end if;
  select string_agg(x.k || '=' || x.ids, ' | ' order by x.k collate "C") into v_txt
    from (select k, (select string_agg(e ->> 'id', ',' order by n)
                       from jsonb_array_elements(public.forms_template(k)) with ordinality as t(e, n)) as ids
            from unnest(array['blank', 'event', 'free_class', 'walk_in']) as k) as x;
  if v_txt is distinct from 'blank=parent_name,parent_phone,parent_email,children'
                         || ' | event=parent_name,parent_phone,parent_email,address,children,notes,waiver'
                         || ' | free_class=parent_name,parent_phone,parent_email,address,children,step_2,booking,step_3,heard,waiver'
                         || ' | walk_in=parent_name,parent_phone,parent_email,address,children,heard,waiver' then
    raise exception 'TEST FAILED: T2b the templates'' fields are %', v_txt;
  end if;
  if exists (select 1 from unnest(array['blank', 'event', 'free_class', 'walk_in']) as k where not public.forms_fields_are_valid(public.forms_template(k)))
     or public.forms_template('free_class') -> 4 <> jsonb_build_object('id', 'children', 'type', 'children', 'label', 'Children', 'required', true, 'locked', true) then
    raise exception 'TEST FAILED: T2c every template should still be valid, with the Children block after the address';
  end if;

  -- -------------------------------------------------------------------
  -- T3: a child - the old and the new shape (forms_check_answers)
  -- -------------------------------------------------------------------
  v_a := jsonb_build_object('parent_name', 'Maria Lopez', 'parent_phone', '(508) 555-0123', 'parent_email', 'maria@example.com',
                            'home', jsonb_build_object('street', '12 Main St', 'city', 'Worcester', 'state', 'MA', 'zip', '01604'));
  v_ok_kid := jsonb_build_object('first_name', 'Ava', 'last_name', 'Nguyen', 'dob', '2018-05-04');
  for v_t in select x from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('why', 'the new shape', 'kids', jsonb_build_array(v_ok_kid)),
      jsonb_build_object('why', 'the old shape', 'kids', '[{"first_name": "Leo", "age": 6}]'::jsonb),
      jsonb_build_object('why', 'one child of each shape', 'kids', jsonb_build_array(v_ok_kid, '{"first_name": "Leo", "age": 6}'::jsonb)),
      jsonb_build_object('why', 'six new-shape children', 'kids', (select jsonb_agg(v_ok_kid) from generate_series(1, 6))),
      jsonb_build_object('why', 'a 40-letter last name with spaces around it',
                         'kids', jsonb_build_array(v_ok_kid || jsonb_build_object('last_name', '  ' || repeat('x', 40) || ' '))),
      jsonb_build_object('why', 'a two-word last name with an accent',
                         'kids', jsonb_build_array(v_ok_kid || '{"first_name": "José", "last_name": "de la Cruz"}')),
      jsonb_build_object('why', 'a real date in 1900 (its age is checked when the form is sent)',
                         'kids', jsonb_build_array(v_ok_kid || '{"dob": "1900-01-01"}')))) as t(x)
  loop
    if public.forms_check_answers(v_fa, v_a, v_t -> 'kids', null) <> 'ok' then
      raise exception 'TEST FAILED: T3a % should be accepted', v_t ->> 'why';
    end if;
  end loop;
  for v_t in select x from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('why', 'an empty last name', 'kid', v_ok_kid || '{"last_name": ""}'),
      jsonb_build_object('why', 'a blank last name', 'kid', v_ok_kid || '{"last_name": "   "}'),
      jsonb_build_object('why', 'a 41-letter last name', 'kid', v_ok_kid || jsonb_build_object('last_name', repeat('x', 41))),
      jsonb_build_object('why', 'a control character in the last name', 'kid', v_ok_kid || jsonb_build_object('last_name', 'Ngu' || chr(7) || 'yen')),
      jsonb_build_object('why', 'a zero-width character in the last name', 'kid', v_ok_kid || jsonb_build_object('last_name', 'Ngu' || chr(8203) || 'yen')),
      jsonb_build_object('why', 'a last name that is a number', 'kid', v_ok_kid || '{"last_name": 5}'),
      jsonb_build_object('why', 'a last name that is null', 'kid', v_ok_kid || '{"last_name": null}'),
      jsonb_build_object('why', 'an empty first name', 'kid', v_ok_kid || '{"first_name": ""}'),
      jsonb_build_object('why', 'February 30', 'kid', v_ok_kid || '{"dob": "2018-02-30"}'),
      jsonb_build_object('why', 'month 13', 'kid', v_ok_kid || '{"dob": "2018-13-01"}'),
      jsonb_build_object('why', 'a date without dashes', 'kid', v_ok_kid || '{"dob": "20180504"}'),
      jsonb_build_object('why', 'a date without leading zeros', 'kid', v_ok_kid || '{"dob": "2018-5-4"}'),
      jsonb_build_object('why', 'a date with a time', 'kid', v_ok_kid || '{"dob": "2018-05-04T00:00:00"}'),
      jsonb_build_object('why', 'an empty date', 'kid', v_ok_kid || '{"dob": ""}'),
      jsonb_build_object('why', 'a date that is a number', 'kid', v_ok_kid || '{"dob": 20180504}'),
      jsonb_build_object('why', 'a date that is null', 'kid', v_ok_kid || '{"dob": null}'),
      jsonb_build_object('why', 'a date before 1900', 'kid', v_ok_kid || '{"dob": "1899-12-31"}'),
      jsonb_build_object('why', 'a date after 2100', 'kid', v_ok_kid || '{"dob": "2101-01-01"}'),
      jsonb_build_object('why', 'no date of birth', 'kid', v_ok_kid - 'dob'),
      jsonb_build_object('why', 'no last name', 'kid', v_ok_kid - 'last_name'),
      jsonb_build_object('why', 'no first name', 'kid', v_ok_kid - 'first_name'),
      jsonb_build_object('why', 'a surname instead of a last name', 'kid', (v_ok_kid - 'last_name') || '{"surname": "Nguyen"}'),
      jsonb_build_object('why', 'an age too (the two shapes mixed)', 'kid', v_ok_kid || '{"age": 7}'),
      jsonb_build_object('why', 'an age instead of the last name', 'kid', (v_ok_kid - 'last_name') || '{"age": 7}'),
      jsonb_build_object('why', 'a last name and an age (no date of birth)', 'kid', (v_ok_kid - 'dob') || '{"age": 7}'),
      jsonb_build_object('why', 'an extra key', 'kid', v_ok_kid || '{"nickname": "Avi"}'),
      jsonb_build_object('why', 'the old shape without its age', 'kid', '{"first_name": "Leo"}'::jsonb),
      jsonb_build_object('why', 'the old shape with an extra key', 'kid', '{"first_name": "Leo", "age": 6, "x": 1}'::jsonb),
      jsonb_build_object('why', 'the old shape aged 1', 'kid', '{"first_name": "Leo", "age": 1}'::jsonb),
      jsonb_build_object('why', 'the old shape aged 100', 'kid', '{"first_name": "Leo", "age": 100}'::jsonb),
      jsonb_build_object('why', 'a name instead of an object', 'kid', '"Ava Nguyen"'::jsonb))) as t(x)
  loop
    if public.forms_check_answers(v_fa, v_a, jsonb_build_array(v_t -> 'kid'), null) <> 'invalid' then
      raise exception 'TEST FAILED: T3b a child with % should be refused', v_t ->> 'why';
    end if;
  end loop;
  if public.forms_check_answers(v_fa, v_a, (select jsonb_agg(v_ok_kid) from generate_series(1, 7)), null) <> 'invalid'
     or public.forms_check_answers(v_fa, v_a, '[]', null) <> 'invalid' then
    raise exception 'TEST FAILED: T3c a family has 1-6 children (7 or none refused)';
  end if;

  -- -------------------------------------------------------------------
  -- T4: an Address answer (forms_check_answers)
  -- -------------------------------------------------------------------
  v_t := v_a -> 'home';   -- the good one
  for v_r in select x from jsonb_array_elements(jsonb_build_array(
      v_t,
      v_t || '{"zip": "01604-1234"}',
      v_t || jsonb_build_object('street', repeat('s', 120), 'city', repeat('c', 60), 'state', repeat('t', 30)),
      v_t || '{"street": "  12   Main St  "}',
      to_jsonb('12 Main St, Worcester, MA 01604'::text),
      to_jsonb(repeat('a', 200)))) as t(x)
  loop
    if public.forms_check_answers(v_fa, v_a || jsonb_build_object('home', v_r), jsonb_build_array(v_ok_kid), null) <> 'ok' then
      raise exception 'TEST FAILED: T4a the address % should be accepted', v_r;
    end if;
  end loop;
  for v_r in select x from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('why', 'no ZIP code', 'a', v_t - 'zip'),
      jsonb_build_object('why', 'an empty street', 'a', v_t || '{"street": ""}'),
      jsonb_build_object('why', 'a blank city', 'a', v_t || '{"city": "   "}'),
      jsonb_build_object('why', 'an empty state', 'a', v_t || '{"state": ""}'),
      jsonb_build_object('why', 'a 121-letter street', 'a', v_t || jsonb_build_object('street', repeat('s', 121))),
      jsonb_build_object('why', 'a 61-letter city', 'a', v_t || jsonb_build_object('city', repeat('c', 61))),
      jsonb_build_object('why', 'a 31-letter state', 'a', v_t || jsonb_build_object('state', repeat('t', 31))),
      jsonb_build_object('why', 'a control character in the street', 'a', v_t || jsonb_build_object('street', '12 Main' || chr(7))),
      jsonb_build_object('why', 'a 4-digit ZIP code', 'a', v_t || '{"zip": "1604"}'),
      jsonb_build_object('why', 'a 6-digit ZIP code', 'a', v_t || '{"zip": "016041"}'),
      jsonb_build_object('why', 'a short ZIP+4', 'a', v_t || '{"zip": "01604-12"}'),
      jsonb_build_object('why', 'a ZIP code ending in a dash', 'a', v_t || '{"zip": "01604-"}'),
      jsonb_build_object('why', 'letters for a ZIP code', 'a', v_t || '{"zip": "ABCDE"}'),
      jsonb_build_object('why', 'a space after the ZIP code', 'a', v_t || '{"zip": "01604 "}'),
      jsonb_build_object('why', 'full-width digits', 'a', v_t || jsonb_build_object('zip', chr(65296) || chr(65297) || chr(65302) || chr(65296) || chr(65300))),
      jsonb_build_object('why', 'Arabic-Indic digits', 'a', v_t || jsonb_build_object('zip', chr(1632) || chr(1633) || chr(1638) || chr(1632) || chr(1636))),
      jsonb_build_object('why', 'an empty ZIP code', 'a', v_t || '{"zip": ""}'),
      jsonb_build_object('why', 'a ZIP code that is a number', 'a', v_t || '{"zip": 1604}'),
      jsonb_build_object('why', 'a city that is null', 'a', v_t || '{"city": null}'),
      jsonb_build_object('why', 'an extra key', 'a', v_t || '{"country": "US"}'),
      jsonb_build_object('why', 'the ZIP code named postcode', 'a', (v_t - 'zip') || '{"postcode": "01604"}'),
      jsonb_build_object('why', 'no parts at all', 'a', '{}'::jsonb),
      jsonb_build_object('why', 'a 201-letter plain text', 'a', to_jsonb(repeat('a', 201))),
      jsonb_build_object('why', 'an empty plain text', 'a', '""'::jsonb),
      jsonb_build_object('why', 'a blank plain text', 'a', '"   "'::jsonb),
      jsonb_build_object('why', 'a control character in the plain text', 'a', to_jsonb('12 Main' || chr(7))),
      jsonb_build_object('why', 'a list', 'a', '["12 Main St"]'::jsonb),
      jsonb_build_object('why', 'a number', 'a', '5'::jsonb),
      jsonb_build_object('why', 'true', 'a', 'true'::jsonb))) as t(x)
  loop
    if public.forms_check_answers(v_fa, v_a || jsonb_build_object('home', v_r -> 'a'), jsonb_build_array(v_ok_kid), null) <> 'invalid' then
      raise exception 'TEST FAILED: T4b an address with % should be refused', v_r ->> 'why';
    end if;
  end loop;
  if public.forms_check_answers(v_fa, v_a - 'home', jsonb_build_array(v_ok_kid), null) <> 'invalid'
     or public.forms_check_answers(v_fa, v_a || '{"home": null}', jsonb_build_array(v_ok_kid), null) <> 'invalid' then
    raise exception 'TEST FAILED: T4c a required Address question must be answered';
  end if;
  -- not required: no answer (or null) is fine; a wrong answer is still refused
  v_r := v_blank || jsonb_build_array(v_addr || '{"required": false}');
  if public.forms_check_answers(v_r, v_a - 'home', jsonb_build_array(v_ok_kid), null) <> 'ok'
     or public.forms_check_answers(v_r, v_a || '{"home": null}', jsonb_build_array(v_ok_kid), null) <> 'ok'
     or public.forms_check_answers(v_r, v_a || jsonb_build_object('home', v_t || '{"zip": "x"}'), jsonb_build_array(v_ok_kid), null) <> 'invalid' then
    raise exception 'TEST FAILED: T4d a question that isn''t required may be left out, never answered wrongly';
  end if;
  -- hidden by "Show only if": no answer allowed (even though required); shown: required
  v_r := v_blank || jsonb_build_array(
           jsonb_build_object('id', 'where', 'type', 'choice', 'label', 'Where?', 'options', jsonb_build_array('Home', 'Away')),
           v_addr || jsonb_build_object('show_if', jsonb_build_object('field', 'where', 'value', 'Home')));
  if public.forms_check_answers(v_r, (v_a - 'home') || '{"where": "Away"}', jsonb_build_array(v_ok_kid), null) <> 'ok'
     or public.forms_check_answers(v_r, v_a || '{"where": "Away"}', jsonb_build_array(v_ok_kid), null) <> 'invalid'
     or public.forms_check_answers(v_r, (v_a - 'home') || '{"where": "Home"}', jsonb_build_array(v_ok_kid), null) <> 'invalid'
     or public.forms_check_answers(v_r, v_a || '{"where": "Home"}', jsonb_build_array(v_ok_kid), null) <> 'ok' then
    raise exception 'TEST FAILED: T4e "Show only if" on an Address question';
  end if;
  -- an address for a form without an Address question is an unknown answer
  if public.forms_check_answers(v_blank, v_a, jsonb_build_array(v_ok_kid), null) <> 'invalid'
     or public.forms_check_answers(v_blank, v_a - 'home', jsonb_build_array(v_ok_kid), null) <> 'ok' then
    raise exception 'TEST FAILED: T4f an answer to a question the form doesn''t have should be refused';
  end if;

  -- -------------------------------------------------------------------
  -- T5: sign-ups. A Worcester class with a 6:00 time on v_day, and a Live
  -- Free class form made from the template (as A1, the normal way)
  -- -------------------------------------------------------------------
  v_tpl := public.forms_template('free_class');
  select jsonb_agg(case when e ->> 'id' = 'waiver' then jsonb_set(e, '{text}', to_jsonb('I agree to the school''s rules.'::text)) else e end
                   order by n)
    into v_fields
    from jsonb_array_elements(v_tpl) with ordinality as t(e, n);
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true or public.is_admin() is not true then
    raise exception 'TEST SETUP: A1 should be an unlocked admin';
  end if;
  v_cw1 := (public.testing_add_class('worcester', v_tag || ' w1', null, false) ->> 'id')::uuid;
  if v_cw1 is null then raise exception 'TEST SETUP: could not add a test class'; end if;
  select v.id into v_vw from public.schedule_versions v
   where v.location_code = 'worcester' and v.starts_on <= v_day order by v.starts_on desc limit 1;
  if v_vw is null and exists (select 1 from public.schedule_versions v where v.location_code = 'worcester') then
    raise exception 'TEST SETUP: Worcester has schedules, but none in effect on %', v_day;
  end if;
  v_r := public.schedule_add_slots('worcester', v_vw, array[v_cw1], array[extract(isodow from v_day)::smallint], '06:00', '06:45');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: slot: %', v_r; end if;
  v_r := public.forms_create('worcester', 'free_class', v_tag || ' free', v_slug);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: form: %', v_r; end if;
  v_f1 := (v_r ->> 'id')::uuid;
  -- a new Free class form starts as the template, with the Address question
  if (select f.draft from public.forms f where f.id = v_f1) is distinct from v_tpl then
    raise exception 'TEST FAILED: T5a a new Free class form should start as the template, with the Address question';
  end if;
  v_r := public.forms_save_draft(v_f1, (v_r ->> 'version')::integer, v_tag || ' free', v_slug, v_fields,
                                 '{"thank_you":"Thanks!","alert_email":null,"confirm_email":false,"add_to_calendar":false}');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: save draft: %', v_r; end if;
  v_r := public.forms_set_booking(v_f1, (v_r ->> 'version')::integer,
           jsonb_build_array(jsonb_build_object('class_id', v_cw1, 'default_limit', 5, 'days_ahead', 14, 'min_hours_ahead', 0)), '[]');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: booking: %', v_r; end if;
  v_r := public.forms_publish(v_f1, (v_r ->> 'version')::integer);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: publish: %', v_r; end if;
  reset role;
  select f.published_version into v_pub from public.forms f where f.id = v_f1;

  -- the public page gets the Address question
  v_r := public.forms_public_get(v_slug);
  if v_r ->> 'status' <> 'ok' or v_r -> 'fields' -> 3 ->> 'type' is distinct from 'address' then
    raise exception 'TEST FAILED: T5a2 the public page should get the Address question after Email: %', v_r -> 'fields';
  end if;

  -- a new-shape family through the public page, Ava with a free class
  v_ans_new := jsonb_build_object('parent_name', 'Maria Zzlopez', 'parent_phone', '(508) 555-0136', 'parent_email', 'maria.zz@example.com',
                                  'address', jsonb_build_object('street', '12 Main St', 'city', 'Worcester', 'state', 'MA', 'zip', '01604'),
                                  'waiver', true);
  v_kids_new := jsonb_build_array(jsonb_build_object('first_name', ' Ava ', 'last_name', '  ' || v_last || ' ', 'dob', v_dob7),
                                  jsonb_build_object('first_name', 'Noah', 'last_name', v_last, 'dob', v_dob4));
  v_book := jsonb_build_array(jsonb_build_object('child', 0, 'class_id', v_cw1, 'date', v_day, 'starts_at', '06:00'));
  v_r := public.forms_public_submit(v_slug, 'zz-0036-new', gen_random_uuid(), v_pub, v_ans_new, v_kids_new, v_book, v_sig, null);
  if v_r ->> 'status' <> 'ok' or jsonb_array_length(v_r -> 'bookings') <> 1 then
    raise exception 'TEST FAILED: T5b a new-shape family with a free class: %', v_r;
  end if;
  v_sub_new := (v_r ->> 'id')::uuid;
  if (select s.children from public.form_submissions s where s.id = v_sub_new)
     is distinct from jsonb_build_array(jsonb_build_object('first_name', 'Ava', 'last_name', v_last, 'dob', v_dob7, 'age', 7),
                                        jsonb_build_object('first_name', 'Noah', 'last_name', v_last, 'dob', v_dob4, 'age', 4)) then
    raise exception 'TEST FAILED: T5c the sign-up should keep { first_name, last_name, dob, age } (names cleaned, age worked out): %',
      (select s.children from public.form_submissions s where s.id = v_sub_new);
  end if;
  select p.id into v_p_ava from public.prospects p where p.submission_id = v_sub_new and p.child_index = 0;
  select p.id into v_p_noah from public.prospects p where p.submission_id = v_sub_new and p.child_index = 1;
  if (select p.child_first_name || '|' || p.child_last_name || '|' || p.child_dob::text || '|' || p.child_age
        from public.prospects p where p.id = v_p_ava) is distinct from 'Ava|' || v_last || '|' || v_dob7::text || '|7'
     or (select p.child_first_name || '|' || p.child_last_name || '|' || p.child_dob::text || '|' || p.child_age
           from public.prospects p where p.id = v_p_noah) is distinct from 'Noah|' || v_last || '|' || v_dob4::text || '|4' then
    raise exception 'TEST FAILED: T5d each prospect should get the last name, the date of birth and the age worked out on today';
  end if;
  if (select st.builtin from public.prospects p join public.prospect_statuses st on st.id = p.status_id where p.id = v_p_ava)
     is distinct from 'booked' then
    raise exception 'TEST FAILED: T5e Ava''s free class should make her Booked';
  end if;

  -- the age: 2-99 on today, like a typed age - refused families save nothing
  select count(*) into v_n from public.form_submissions s where s.form_id = v_f1;
  v_txt := concat_ws(',',
    public.forms_public_submit(v_slug, 'zz-0036-age', gen_random_uuid(), v_pub, v_ans_new,   -- turns 2 tomorrow: 1
      jsonb_build_array(jsonb_build_object('first_name', 'Bea', 'last_name', v_last, 'dob', (v_today - interval '2 years' + interval '1 day')::date)),
      '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0036-age', gen_random_uuid(), v_pub, v_ans_new,   -- 100 today
      jsonb_build_array(jsonb_build_object('first_name', 'Bea', 'last_name', v_last, 'dob', (v_today - interval '100 years')::date)),
      '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0036-age', gen_random_uuid(), v_pub, v_ans_new,   -- born today: 0
      jsonb_build_array(jsonb_build_object('first_name', 'Bea', 'last_name', v_last, 'dob', v_today)),
      '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0036-age', gen_random_uuid(), v_pub, v_ans_new,   -- born tomorrow
      jsonb_build_array(jsonb_build_object('first_name', 'Bea', 'last_name', v_last, 'dob', v_today + 1)),
      '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0036-age', gen_random_uuid(), v_pub, v_ans_new,   -- a good child and one aged 1
      jsonb_build_array(v_kids_new -> 1,
                        jsonb_build_object('first_name', 'Bea', 'last_name', v_last, 'dob', (v_today - interval '2 years' + interval '1 day')::date)),
      '[]', v_sig, null) ->> 'status');
  if v_txt is distinct from 'invalid,invalid,invalid,invalid,invalid'
     or (select count(*) from public.form_submissions s where s.form_id = v_f1) <> v_n then
    raise exception 'TEST FAILED: T5f ages 1, 100, 0, a birthday in the future and a family with one child aged 1 should be refused, nothing saved: %', v_txt;
  end if;
  -- ... refused by 0036's own age check, not only by the prospects table's rule behind it (which
  -- would fail the whole call): forms_submit_core itself answers "invalid" (called as postgres -
  -- the app can't call it)
  begin
    v_r := public.forms_submit_core(v_f1, gen_random_uuid(), v_pub, v_ans_new,
             jsonb_build_array(jsonb_build_object('first_name', 'Bea', 'last_name', v_last,
                                                  'dob', (v_today - interval '2 years' + interval '1 day')::date)),
             '[]', v_sig, 'staff', 'zz test');
  exception when check_violation then
    raise exception 'TEST FAILED: T5f2 forms_submit_core should refuse a child aged 1 itself, not fail on the prospects rule';
  end;
  if v_r ->> 'status' is distinct from 'invalid' then
    raise exception 'TEST FAILED: T5f2 forms_submit_core with a child aged 1 gave %', v_r;
  end if;
  v_txt := concat_ws(',',
    public.forms_public_submit(v_slug, 'zz-0036-age2', gen_random_uuid(), v_pub, v_ans_new,   -- 2 today
      jsonb_build_array(jsonb_build_object('first_name', 'Cal', 'last_name', v_last, 'dob', (v_today - interval '2 years')::date)),
      '[]', v_sig, null) ->> 'status',
    public.forms_public_submit(v_slug, 'zz-0036-age2', gen_random_uuid(), v_pub, v_ans_new,   -- turns 100 tomorrow: 99
      jsonb_build_array(jsonb_build_object('first_name', 'Dot', 'last_name', v_last, 'dob', (v_today - interval '100 years' + interval '1 day')::date)),
      '[]', v_sig, null) ->> 'status');
  if v_txt is distinct from 'ok,ok'
     or not exists (select 1 from public.prospects p join public.form_submissions s on s.id = p.submission_id
                     where s.form_id = v_f1 and p.child_first_name = 'Cal' and p.child_age = 2
                       and p.child_dob = (v_today - interval '2 years')::date)
     or not exists (select 1 from public.prospects p join public.form_submissions s on s.id = p.submission_id
                     where s.form_id = v_f1 and p.child_first_name = 'Dot' and p.child_age = 99
                       and p.child_dob = (v_today - interval '100 years' + interval '1 day')::date) then
    raise exception 'TEST FAILED: T5g ages 2 and 99 on today should be accepted: %', v_txt;
  end if;

  -- the live page's way still works: { first_name, age } and the address as one text
  v_ans_old := (v_ans_new - 'address') || '{"address": "12 Main St, Worcester, MA 01604"}';
  v_r := public.forms_public_submit(v_slug, 'zz-0036-old', gen_random_uuid(), v_pub, v_ans_old, '[{"first_name": " Leo ", "age": 6}]', '[]', v_sig, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T5h an old-shape sign-up: %', v_r; end if;
  v_sub_old := (v_r ->> 'id')::uuid;
  select p.id into v_p_leo from public.prospects p where p.submission_id = v_sub_old;
  if (select s.children from public.form_submissions s where s.id = v_sub_old) is distinct from '[{"first_name": "Leo", "age": 6}]'::jsonb
     or not exists (select 1 from public.prospects p where p.id = v_p_leo and p.child_first_name = 'Leo' and p.child_age = 6
                       and p.child_last_name is null and p.child_dob is null) then
    raise exception 'TEST FAILED: T5i an old-shape child is saved exactly as before, with no last name or date of birth';
  end if;

  -- staff Fill in, the new shape
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans_new,
           jsonb_build_array(jsonb_build_object('first_name', 'Mia', 'last_name', v_last, 'dob', v_dob7)), '[]', v_sig);
  reset role;
  if v_r ->> 'status' <> 'ok'
     or (select s.source from public.form_submissions s where s.id = (v_r ->> 'id')::uuid) <> 'staff'
     or not exists (select 1 from public.prospects p where p.submission_id = (v_r ->> 'id')::uuid
                     and p.child_last_name = v_last and p.child_dob = v_dob7 and p.child_age = 7) then
    raise exception 'TEST FAILED: T5j staff Fill in with a new-shape child: %', v_r;
  end if;

  -- -------------------------------------------------------------------
  -- T6: the 4000-byte limit
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.forms_staff_submit(v_f1, gen_random_uuid(), v_pub, v_ans_new,
           (select jsonb_agg(jsonb_build_object('first_name', v_big, 'last_name', v_big, 'dob', v_dob7)) from generate_series(1, 6)),
           '[]', v_sig);
  reset role;
  if v_r ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: T6a six children with 40-letter names in a 4-byte alphabet should be accepted: %', v_r;
  end if;
  select octet_length(s.children::text) into v_n from public.form_submissions s where s.id = (v_r ->> 'id')::uuid;
  if v_n not between 2001 and 4000
     or (select count(*) from public.prospects p where p.submission_id = (v_r ->> 'id')::uuid and p.child_last_name = v_big) <> 6 then
    raise exception 'TEST FAILED: T6b the six children should be saved: % bytes (over the old 2000, under 4000)', v_n;
  end if;
  begin
    insert into public.form_submissions (form_id, location_code, published_version, fields, answers, parent_name, parent_phone, parent_email,
                                         children, source, submission_key)
    values (v_f1, 'worcester', v_pub, '[]', '{}', 'Big Zzfamily', '5085550000', 'big.zz@example.com',
            (select jsonb_agg(jsonb_build_object('first_name', repeat('a', 700), 'age', 7)) from generate_series(1, 6)),
            'staff', gen_random_uuid());
    raise exception 'TEST FAILED: T6c a children list over 4000 bytes should break form_submissions_size_check';
  exception when check_violation then null;
  end;

  -- -------------------------------------------------------------------
  -- T7: Prospects - the list, the profile, search (as the front desk)
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.prospects_list('worcester');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: T7a the list: %', v_r; end if;
  if (select count(*) from jsonb_array_elements(v_r -> 'prospects') e
       where e ->> 'family_id' = v_sub_new::text and e ->> 'child_last_name' = v_last) <> 2
     or not exists (select 1 from jsonb_array_elements(v_r -> 'prospects') e
                     where e ->> 'family_id' = v_sub_old::text and e ? 'child_last_name' and e -> 'child_last_name' = 'null'::jsonb) then
    raise exception 'TEST FAILED: T7b each list row should have the child''s last name (null for the old shape)';
  end if;
  if exists (select 1 from jsonb_array_elements(v_r -> 'prospects') e
              where e ?| array['child_dob', 'dob', 'child_age', 'age', 'parent_phone', 'parent_email', 'answers', 'fields', 'address']) then
    raise exception 'TEST FAILED: T7c the list must never have a date of birth, age, phone, email, answers or address';
  end if;
  v_r := public.prospects_get(v_p_ava);
  if v_r ->> 'status' <> 'ok'
     or v_r -> 'prospect' ->> 'child_last_name' is distinct from v_last
     or v_r -> 'prospect' ->> 'child_dob' is distinct from v_dob7::text
     or (v_r -> 'prospect' ->> 'child_age')::integer is distinct from 7
     or jsonb_array_length(v_r -> 'prospect' -> 'siblings') <> 1
     or v_r -> 'prospect' -> 'siblings' -> 0 ->> 'child_first_name' is distinct from 'Noah'
     or v_r -> 'prospect' -> 'siblings' -> 0 ->> 'child_last_name' is distinct from v_last
     or v_r -> 'prospect' -> 'siblings' -> 0 ->> 'child_dob' is distinct from v_dob4::text then
    raise exception 'TEST FAILED: T7d the profile: last name, date of birth, age, and the sibling''s last name and date of birth: %',
      v_r -> 'prospect';
  end if;
  v_r := public.prospects_get(v_p_leo);
  if v_r ->> 'status' <> 'ok' or not (v_r -> 'prospect' ?& array['child_last_name', 'child_dob'])
     or v_r -> 'prospect' -> 'child_last_name' <> 'null'::jsonb or v_r -> 'prospect' -> 'child_dob' <> 'null'::jsonb
     or (v_r -> 'prospect' ->> 'child_age')::integer is distinct from 6 then
    raise exception 'TEST FAILED: T7e an old-shape child''s profile: no last name or date of birth, the typed age: %', v_r -> 'prospect';
  end if;
  -- search: by the child's last name (any case), and as before by first name, parent name and phone digits
  if not (public.prospects_search('worcester', lower(v_last)) -> 'ids' @> jsonb_build_array(v_p_ava, v_p_noah))
     or not (public.prospects_search('worcester', upper(substr(v_last, 4, 9))) -> 'ids' @> jsonb_build_array(v_p_ava, v_p_noah))
     or not (public.prospects_search('worcester', ' Ava ') -> 'ids' @> jsonb_build_array(v_p_ava))
     or not (public.prospects_search('worcester', 'zzlopez') -> 'ids' @> jsonb_build_array(v_p_ava, v_p_noah, v_p_leo))
     or not (public.prospects_search('worcester', '555-0136') -> 'ids' @> jsonb_build_array(v_p_ava, v_p_noah, v_p_leo))
     or (public.prospects_search('worcester', lower(v_last)) -> 'ids') @> jsonb_build_array(v_p_leo)
     or jsonb_array_length(public.prospects_search('worcester', 'zzqq' || left(md5(v_tag), 12)) -> 'ids') <> 0 then
    raise exception 'TEST FAILED: T7f search should find a child by last name (any case), and still by first name, parent name and phone';
  end if;
  -- a locked session gets nothing
  perform set_config('request.jwt.claims', v_c_a2, true);
  v_txt := concat_ws(',', public.prospects_list('worcester') ->> 'status', public.prospects_get(v_p_ava) ->> 'status',
                     public.prospects_search('worcester', lower(v_last)) ->> 'status');
  if v_txt is distinct from 'no_access,no_access,no_access' then
    raise exception 'TEST FAILED: T7g a locked session got %', v_txt;
  end if;
  -- the app can't read the new columns directly
  perform set_config('request.jwt.claims', v_c_d1, true);
  begin perform p.child_last_name from public.prospects p;
        raise exception 'TEST FAILED: T7h the app read prospects.child_last_name directly'; exception when insufficient_privilege then null; end;
  begin perform p.child_dob from public.prospects p;
        raise exception 'TEST FAILED: T7h the app read prospects.child_dob directly'; exception when insufficient_privilege then null; end;
  reset role;
  -- nobody signed in gets nothing
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform public.prospects_list('worcester');
        raise exception 'TEST FAILED: T7i anon called prospects_list'; exception when insufficient_privilege then null; end;
  begin perform public.prospects_get(v_p_ava);
        raise exception 'TEST FAILED: T7i anon called prospects_get'; exception when insufficient_privilege then null; end;
  begin perform public.prospects_search('worcester', 'xx');
        raise exception 'TEST FAILED: T7i anon called prospects_search'; exception when insufficient_privilege then null; end;
  begin perform p.child_dob from public.prospects p;
        raise exception 'TEST FAILED: T7i anon read prospects.child_dob'; exception when insufficient_privilege then null; end;
  reset role;

  -- -------------------------------------------------------------------
  -- T8: form_submissions straight from the table (security review): the
  -- app may read only id, form_id, location_code and created_at - a
  -- family's details come one family at a time through prospects_get
  -- -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if (select count(*) from public.form_submissions s where s.id in (v_sub_new, v_sub_old)) <> 2
     or not exists (select s.id, s.form_id, s.location_code, s.created_at from public.form_submissions s
                     where s.id = v_sub_new and s.form_id = v_f1 and s.location_code = 'worcester') then
    raise exception 'TEST FAILED: T8a the front desk should still read id, form_id, location_code and created_at';
  end if;
  foreach v_txt in array array['children', 'answers', 'parent_name', 'parent_phone', 'parent_email', 'signature', 'submission_key',
                               'fields', 'published_version', 'signed_at', 'entered_by', 'source', 'created_by_name'] loop
    begin
      execute format('select s.%I from public.form_submissions s limit 1', v_txt);
      raise exception 'TEST FAILED: T8b the app read form_submissions.% straight from the table', v_txt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;

  -- -------------------------------------------------------------------
  -- C: catalog
  -- -------------------------------------------------------------------
  for v_fn in
    select p.proname, p.oid, p.prosecdef, p.proconfig, p.proacl, p.proowner
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_eight)
  loop
    if v_fn.proconfig is distinct from array['search_path=""'] then
      raise exception 'TEST FAILED: C1 % settings are %', v_fn.proname, v_fn.proconfig;
    end if;
    if has_function_privilege('anon', v_fn.oid, 'EXECUTE') or has_function_privilege('forms_registrar', v_fn.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) as a where a.grantee = 0)
       or exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) as a where a.grantee = 'service_role'::regrole) then
      raise exception 'TEST FAILED: C2 % can be run by anon, PUBLIC, service_role or forms_registrar', v_fn.proname;
    end if;
    if v_fn.proname in ('prospects_list', 'prospects_search', 'prospects_get') then
      if not has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') or v_fn.prosecdef is not true then
        raise exception 'TEST FAILED: C3 % should be security definer, for authenticated', v_fn.proname;
      end if;
    elsif has_function_privilege('authenticated', v_fn.oid, 'EXECUTE')
          or v_fn.prosecdef is distinct from (v_fn.proname = 'prospects_from_submission') then
      raise exception 'TEST FAILED: C4 % should not be callable by the app (security definer: %)', v_fn.proname, v_fn.prosecdef;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any (v_eight)) <> 8 then
    raise exception 'TEST FAILED: C5 expected exactly one of each of the 8 functions (no second version)';
  end if;
  -- forms_registrar still runs exactly its three public functions (as 0009_tests.sql P1a)
  for v_fn in
    select p.oid, p.proname::text as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  loop
    if has_function_privilege('forms_registrar', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name = any (v_public_fns)) then
      raise exception 'TEST FAILED: C6 forms_registrar execute on % is %', v_fn.oid::regprocedure, has_function_privilege('forms_registrar', v_fn.oid, 'EXECUTE');
    end if;
  end loop;
  -- the two columns: nullable, the right types, readable by nobody
  if (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' order by a.attname collate "C")
        from pg_attribute a where a.attrelid = 'public.prospects'::regclass and a.attname in ('child_last_name', 'child_dob'))
     is distinct from 'child_dob:date:false,child_last_name:text:false' then
    raise exception 'TEST FAILED: C7 the two prospects columns should be child_dob date and child_last_name text, both nullable';
  end if;
  if has_column_privilege('authenticated', 'public.prospects', 'child_last_name', 'select')
     or has_column_privilege('authenticated', 'public.prospects', 'child_dob', 'select')
     or has_column_privilege('anon', 'public.prospects', 'child_dob', 'select')
     or has_column_privilege('service_role', 'public.prospects', 'child_dob', 'select')
     or has_column_privilege('forms_registrar', 'public.prospects', 'child_dob', 'select')
     or has_column_privilege('authenticated', 'public.prospects', 'child_dob', 'update') then
    raise exception 'TEST FAILED: C8 nobody may read or write the new columns directly';
  end if;
  -- form_submissions: the app reads exactly four columns; nobody else reads any
  if (select string_agg(a.attname, ',' order by a.attname collate "C") from pg_attribute a
       where a.attrelid = 'public.form_submissions'::regclass and a.attnum > 0
         and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
     is distinct from 'created_at,form_id,id,location_code'
     or has_table_privilege('authenticated', 'public.form_submissions', 'SELECT')
     or has_any_column_privilege('anon', 'public.form_submissions', 'SELECT')
     or has_any_column_privilege('service_role', 'public.form_submissions', 'SELECT')
     or has_any_column_privilege('forms_registrar', 'public.form_submissions', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.form_submissions', 'INSERT, UPDATE') then
    raise exception 'TEST FAILED: C13 form_submissions: the app should read only id, form_id, location_code, created_at; anon, service_role and forms_registrar nothing';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.form_submissions'::regclass)
     or (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'form_submissions') <> 1
     or (select p.qual from pg_policies p where p.schemaname = 'public' and p.tablename = 'form_submissions') not like '%has_data_access()%' then
    raise exception 'TEST FAILED: C14 form_submissions keeps RLS and its one has_data_access() policy';
  end if;
  -- the rules
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
       where c.conrelid = 'public.form_submissions'::regclass and c.conname = 'form_submissions_size_check')
     not like '%(answers)::text) <= 20000)%(children)::text) <= 4000)%' then
    raise exception 'TEST FAILED: C9 form_submissions_size_check should allow 20000 bytes of answers and 4000 of children';
  end if;
  if (select count(*) from pg_constraint c where c.conrelid = 'public.prospects'::regclass and c.contype = 'c'
        and c.conname in ('prospects_child_last_name_check', 'prospects_child_dob_check')) <> 2 then
    raise exception 'TEST FAILED: C10 the two prospects rules are missing';
  end if;
  begin
    update public.prospects set child_last_name = repeat('x', 41) where id = v_p_ava;
    raise exception 'TEST FAILED: C11 a 41-letter last name should break prospects_child_last_name_check';
  exception when check_violation then null;
  end;
  begin
    update public.prospects set child_last_name = 'Ngu' || chr(7) || 'yen' where id = v_p_ava;
    raise exception 'TEST FAILED: C11 a control character in a last name should break prospects_child_last_name_check';
  exception when check_violation then null;
  end;
  begin
    update public.prospects set child_dob = date '1899-12-31' where id = v_p_ava;
    raise exception 'TEST FAILED: C12 a date of birth before 1900 should break prospects_child_dob_check';
  exception when check_violation then null;
  end;
end;
$$;

select 'ALL 0036 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
