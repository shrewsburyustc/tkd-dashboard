-- =====================================================================
-- 0042_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0042_forms_copy_to_school.sql
--   ("Copy to Worcester / Shrewsbury" in a form's ⋯ menu, rulebook
--   v0.642 and v0.644). It checks, in this order:
--     W  who may copy: nobody signed in (anon) can't call it (permission
--        denied); the front desk -> not_allowed; an admin who pressed
--        Lock, and no session at all -> no_access (all checked before the
--        input)
--     R  refusals: no form, no school, a school that doesn't exist (also
--        "Shrewsbury" with a capital, and an empty text), the form's own
--        school -> invalid; an unknown form -> not_found (an unknown
--        school is answered first). Nothing is written by W or R.
--     K  the copy of a LIVE Worcester form that has booking times (two
--        offered classes, a time's own spot limit, two classes taught
--        together), a family's sign-up and a kiosk token: a Draft at
--        Shrewsbury with the same kind, draft (questions + waiver) and
--        settings, but no alert email (K2b: the original keeps its own,
--        v0.644); never published (published empty, published_version 0,
--        no published_at); booking_key ''; version 1, made by the admin;
--        exactly one new form; the answer is exactly {status, id, version,
--        slug, name} of the new row; NO booking rows, sign-ups or kiosk
--        tokens; not on the public page; the original is unchanged (its
--        row, booking times, sign-up and token) and still on the public
--        page
--     N  names: the same name when the other school has none like it;
--        "Copy of ..." when it has one - the same name, or the same with
--        other capitals; an 80-character name gets "Copy of", is cut to 80
--        and loses the space left at the cut (79 characters)
--     L  links: "<link>-<school>"; "-2" when that is taken; a 40-character
--        link with "--" where it is cut ends without a dash before the
--        school; "-2" on a long link still fits 40; both directions (to
--        Shrewsbury and to Worcester); every copy's link valid
--        (forms_slug_ok) and every name normalized; and after U (v0.644):
--        L7 a link ending in the form's own school gets the other school's
--        name instead, L8 a link too long is cut at a dash, never in a word
--     H  the history: exactly one change_log row per copy and nothing
--        else - table forms, op insert, the copy's id and school, action
--        forms_copy_to_school, the admin, its own batch id; the tags are
--        cleared afterwards
--     U  Undo (what the app's Undo calls): forms_delete(copy, version) ->
--        ok, the copy is gone (logged as forms_delete); a second time ->
--        not_found; the original untouched by the copies and the Undo; the
--        next copy takes the same name and link again
--     C  the catalog: one version; plpgsql, volatile, security definer,
--        returns jsonb, search_path = '', owner = the forms table's
--        owner; only authenticated may run it (not PUBLIC, anon,
--        service_role or the public forms' logins); no SQL built from
--        text; the code locks the other school's row before it picks the
--        name and the link (two copies at the same moment can't be tested
--        in one session)
--   It makes its own test classes and forms named "zz test ...", so it
--   works whatever is already in the database.
--
-- IS IT SAFE?
--   Yes. Everything happens inside one transaction that ends with
--   ROLLBACK, which undoes every change (test classes, forms, copies, the
--   test family and its prospect, the kiosk token, history rows, test
--   sessions). NEVER change the final "rollback;" to "commit;".
--
-- HOW IT PRETENDS TO BE SIGNED-IN USERS
--   As 0031_tests.sql: a pretend login token per session in
--   request.jwt.claims. A1 = admin unlocked, A2 = admin who pressed Lock
--   (shut out), D1 = front desk unlocked. The public form's functions are
--   called as the SQL Editor's own role (they run as their owner, so the
--   answers are the same as for forms_registrar).
--
-- BEFORE YOU RUN IT
--   1. 0009, 0031, 0036 and 0042 are applied. You need TWO existing,
--      ACTIVE staff rows: an admin and the shared front desk (role staff).
--   2. Replace <paste-admin-UID-here> and <paste-desk-UID-here> below with
--      their UIDs from Authentication -> Users.
--   3. Paste the whole file into a new SQL Editor query and click Run.
--      Supabase may warn about destructive operations (the Undo check
--      removes a test copy, inside the rolled-back transaction). Confirm.
--
-- HOW TO READ THE RESULT
--   * Passed: one row "ALL 0042 TESTS PASSED".
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
  v_claims text;

  v_tag    text := 'zz test ' || left(gen_random_uuid()::text, 8);
  v_slug   text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);   -- F's link (13 characters)
  v_slug_h text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);   -- H's link
  v_slug_i text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);   -- I's link
  v_slug_j text := 'zz-' || left(replace(gen_random_uuid()::text, '-', ''), 10);   -- J's link, before its "-shrewsbury" (v0.644)
  -- M's link: 40 characters (12 + "-" + 10 c's + "-" + 16 d's), so the cut for "-shrewsbury" (29) falls inside the d's (v0.644)
  v_slug_m text := 'zz' || left(replace(gen_random_uuid()::text, '-', ''), 10) || '-' || repeat('c', 10) || '-' || repeat('d', 16);
  v_base_g text := rpad('zz' || left(replace(gen_random_uuid()::text, '-', ''), 10), 27, 'a');   -- 27 characters
  v_slug_g text;   -- G's link: v_base_g || '--' || 11 b's = 40 characters, "--" just where a copy's link is cut
  v_long   text;   -- an 80-character name whose 72nd character is a space
  v_last   text := 'Zzcopy' || left(replace(gen_random_uuid()::text, '-', ''), 8);   -- a last name no real family has
  v_today  date := public.schedule_today();
  v_sig    text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg' || repeat('A', 200) || '==';
  v_settings jsonb := '{"thank_you":"Thank you, {parent}! See you on the mat.","alert_email":"desk@example.com","confirm_email":true,"add_to_calendar":false}';
  v_rand   uuid := gen_random_uuid();

  v_r      jsonb;
  v_txt    text;
  v_n      integer;
  v_role   text;
  v_mark   bigint;
  v_mark2  bigint;
  v_forms  integer;
  v_orig   text;     -- the original form's row, before any copy
  v_book   text;     -- its booking rows, before any copy
  v_fields jsonb;    -- the Free class template with its waiver wording
  v_pub    integer;
  v_c1     uuid;     -- two Worcester test classes
  v_c2     uuid;
  v_f      uuid;     -- F: Worcester, Free class, Live, booking times, a family, a kiosk token
  v_g      uuid;     -- G: Worcester, Blank, a 40-character link
  v_h      uuid;     -- H: Shrewsbury, Event, an 80-character name
  v_i      uuid;     -- I: Worcester, Blank, H's name in capitals
  v_k1     uuid;     -- F -> Shrewsbury
  v_k1_v   integer;
  v_k2     uuid;     -- F -> Shrewsbury again
  v_k3     uuid;     -- G -> Shrewsbury
  v_k4     uuid;     -- G -> Shrewsbury again
  v_k5     uuid;     -- H -> Worcester
  v_fn     record;
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
  if to_regprocedure('public.forms_copy_to_school(uuid, text)') is null then
    raise exception 'TEST SETUP: public.forms_copy_to_school is missing (is 0042 applied?)';
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

  v_slug_g := v_base_g || '--' || repeat('b', 11);
  v_long := rpad(v_tag || ' ', 71, 'a') || ' ' || repeat('b', 8);
  -- the Free class template (an internal helper: read as postgres) with its waiver wording
  select jsonb_agg(case when e ->> 'id' = 'waiver' then jsonb_set(e, '{text}', to_jsonb('I agree to the school''s rules.'::text)) else e end
                   order by n)
    into v_fields
    from jsonb_array_elements(public.forms_template('free_class')) with ordinality as t(e, n);

  -- Temporary helper for this run only (pg_temp = gone at the end):
  --   zzc_booking(form): a form's booking rows (offers | time limits |
  --   classes taught together) as one text, to compare before and after
  execute $f$
    create function pg_temp.zzc_booking(p_form uuid) returns text
    language sql as $b$
      select concat_ws(' | ',
        (select string_agg(to_jsonb(o)::text, ',' order by o.id) from public.form_booking_offers o where o.form_id = p_form),
        (select string_agg(to_jsonb(l)::text, ',' order by l.id) from public.form_booking_limits l where l.form_id = p_form),
        (select string_agg(to_jsonb(g)::text, ',' order by g.id) from public.form_booking_group_limits g where g.form_id = p_form));
    $b$;
  $f$;

  -- The test classes and forms, made the normal way (as A1)
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  if public.has_data_access() is not true or public.is_admin() is not true then
    raise exception 'TEST SETUP: A1 should be an unlocked admin';
  end if;
  v_c1 := (public.testing_add_class('worcester', v_tag || ' c1', null, false) ->> 'id')::uuid;
  v_c2 := (public.testing_add_class('worcester', v_tag || ' c2', null, false) ->> 'id')::uuid;
  if v_c1 is null or v_c2 is null then raise exception 'TEST SETUP: could not add the test classes'; end if;
  -- F: Live, with booking times (2 offered classes, a time limit, 2 classes taught together) and a kiosk token
  v_r := public.forms_create('worcester', 'free_class', v_tag || ' Visitor Information', v_slug);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: F: %', v_r; end if;
  v_f := (v_r ->> 'id')::uuid;
  v_r := public.forms_save_draft(v_f, (v_r ->> 'version')::integer, v_tag || ' Visitor Information', v_slug, v_fields, v_settings);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: F draft: %', v_r; end if;
  v_r := public.forms_publish(v_f, (v_r ->> 'version')::integer);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: F publish: %', v_r; end if;
  v_r := public.forms_set_booking(v_f, (v_r ->> 'version')::integer,
           jsonb_build_array(jsonb_build_object('class_id', v_c1, 'default_limit', 3, 'days_ahead', 14, 'min_hours_ahead', 3),
                             jsonb_build_object('class_id', v_c2, 'default_limit', 4, 'days_ahead', 14, 'min_hours_ahead', 3)),
           jsonb_build_array(jsonb_build_object('class_id', v_c1, 'weekday', 1, 'starts_at', '16:00', 'spot_limit', 2)),
           jsonb_build_array(jsonb_build_object('class_ids', jsonb_build_array(v_c1, v_c2), 'weekday', 3, 'starts_at', '17:00', 'spot_limit', 5)));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: F booking: %', v_r; end if;
  v_r := public.forms_kiosk_token(v_f);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: F kiosk token: %', v_r; end if;
  -- G: a 40-character link; H (Shrewsbury): an 80-character name; I (Worcester): H's name in capitals
  v_r := public.forms_create('worcester', 'blank', v_tag || ' Long link', v_slug_g);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: G: %', v_r; end if;
  v_g := (v_r ->> 'id')::uuid;
  v_r := public.forms_create('shrewsbury', 'event', v_long, v_slug_h);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: H: %', v_r; end if;
  v_h := (v_r ->> 'id')::uuid;
  v_r := public.forms_create('worcester', 'blank', upper(v_long), v_slug_i);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: I: %', v_r; end if;
  v_i := (v_r ->> 'id')::uuid;
  reset role;

  -- a family signs up on F (the public page's function, as the SQL Editor's role)
  select f.published_version into v_pub from public.forms f where f.id = v_f;
  v_r := public.forms_public_submit(v_slug, 'zz-0042-a', gen_random_uuid(), v_pub,
           jsonb_build_object('parent_name', 'Pat Zzcopy', 'parent_phone', '(508) 555-0142', 'parent_email', 'pat.zzcopy@example.com',
                              'address', jsonb_build_object('street', '12 Main St', 'city', 'Worcester', 'state', 'MA', 'zip', '01604'),
                              'waiver', true),
           jsonb_build_array(jsonb_build_object('first_name', 'Una', 'last_name', v_last, 'dob', (v_today - interval '7 years')::date)),
           '[]', v_sig, null);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: a family on F: %', v_r; end if;
  if (select count(*) from public.form_booking_offers o where o.form_id = v_f) <> 2
     or (select count(*) from public.form_booking_limits l where l.form_id = v_f) <> 1
     or (select count(*) from public.form_booking_group_limits g where g.form_id = v_f) <> 1
     or (select f.booking_key from public.forms f where f.id = v_f) = ''
     or (select f.status || '/' || f.published_version from public.forms f where f.id = v_f) <> 'live/1'
     or (select count(*) from public.form_submissions s where s.form_id = v_f) <> 1
     or (select count(*) from public.form_kiosk_tokens t where t.form_id = v_f) <> 1 then
    raise exception 'TEST SETUP: F should be Live (version 1 published) with 2 offered classes, 1 time limit, 1 group, a booking key, 1 sign-up and 1 kiosk token';
  end if;

  -- ===================================================================
  -- W. Who may copy
  -- ===================================================================
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  select count(*) into v_forms from public.forms;
  set local role anon;
  perform set_config('request.jwt.claims', v_c_anon, true);
  begin perform public.forms_copy_to_school(v_f, 'shrewsbury');
        raise exception 'TEST FAILED: W1 anon called forms_copy_to_school'; exception when insufficient_privilege then null; end;
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_txt := concat_ws(',',
    public.forms_copy_to_school(v_f, 'shrewsbury') ->> 'status',
    public.forms_copy_to_school(null, null) ->> 'status');
  if v_txt <> 'not_allowed,not_allowed' then raise exception 'TEST FAILED: W2 the front desk gave % (expected not_allowed)', v_txt; end if;
  foreach v_claims in array array[v_c_a2, ''] loop
    perform set_config('request.jwt.claims', v_claims, true);
    v_txt := concat_ws(',',
      public.forms_copy_to_school(v_f, 'shrewsbury') ->> 'status',
      public.forms_copy_to_school(null, null) ->> 'status');
    if v_txt <> 'no_access,no_access' then
      raise exception 'TEST FAILED: W3 % gave % (expected no_access, before the input check)',
        case when v_claims = '' then 'no session' else 'an admin who pressed Lock' end, v_txt;
    end if;
  end loop;

  -- ===================================================================
  -- R. Refusals (as A1); nothing written by W or R
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_txt := concat_ws(',',
    public.forms_copy_to_school(null, 'shrewsbury') ->> 'status',     -- no form
    public.forms_copy_to_school(v_f, null) ->> 'status',              -- no school
    public.forms_copy_to_school(v_f, 'boston') ->> 'status',          -- no such school
    public.forms_copy_to_school(v_f, 'Shrewsbury') ->> 'status',      -- school codes are lower case
    public.forms_copy_to_school(v_f, '') ->> 'status',
    public.forms_copy_to_school(v_f, 'worcester') ->> 'status',       -- F's own school
    public.forms_copy_to_school(v_h, 'shrewsbury') ->> 'status',      -- H's own school
    public.forms_copy_to_school(v_rand, 'shrewsbury') ->> 'status',   -- no such form
    public.forms_copy_to_school(v_rand, 'worcester') ->> 'status',
    public.forms_copy_to_school(v_rand, 'boston') ->> 'status');      -- the school is checked before the form
  reset role;
  if v_txt <> 'invalid,invalid,invalid,invalid,invalid,invalid,invalid,not_found,not_found,invalid' then
    raise exception 'TEST FAILED: R1 refusals gave %', v_txt;
  end if;
  if exists (select 1 from public.change_log l where l.id > v_mark) or (select count(*) from public.forms) <> v_forms then
    raise exception 'TEST FAILED: R2 a refusal (W or R) wrote something';
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: R3 tags left set after the refusals: action %, batch %',
      current_setting('tkd.action', true), current_setting('tkd.batch_id', true);
  end if;

  -- ===================================================================
  -- K. The copy: F (Worcester, Live) -> Shrewsbury
  -- ===================================================================
  select to_jsonb(f)::text into v_orig from public.forms f where f.id = v_f;
  v_book := pg_temp.zzc_booking(v_f);
  select coalesce(max(l.id), 0) into v_mark from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.forms_copy_to_school(v_f, 'shrewsbury');
  reset role;
  if v_r ->> 'status' is distinct from 'ok'
     or (select array_agg(k order by k) from jsonb_object_keys(v_r) as k) <> array['id', 'name', 'slug', 'status', 'version']
     or jsonb_typeof(v_r -> 'version') is distinct from 'number' then
    raise exception 'TEST FAILED: K1 the copy should answer exactly {status ok, id, version, slug, name}: %', v_r;
  end if;
  v_k1 := (v_r ->> 'id')::uuid;
  v_k1_v := (v_r ->> 'version')::integer;
  if (select count(*) from public.forms) <> v_forms + 1
     or not exists (select 1 from public.forms k, public.forms f
                     where k.id = v_k1 and f.id = v_f
                       and k.location_code = 'shrewsbury' and k.status = 'draft'
                       and k.kind = f.kind and k.kind = 'free_class'
                       and k.draft = f.draft and k.draft = v_fields
                       -- the settings without the alert email (v0.644: it's the first school's address)
                       and k.settings = jsonb_set(f.settings, '{alert_email}', 'null'::jsonb)
                       and k.settings = jsonb_set(v_settings, '{alert_email}', 'null'::jsonb)
                       and k.published is null and k.published_version = 0 and k.published_at is null
                       and k.booking_key = '' and k.version = 1 and v_k1_v = 1
                       and k.name = v_r ->> 'name' and k.slug = v_r ->> 'slug'
                       and k.created_by = v_admin and k.updated_by = v_admin) then
    raise exception 'TEST FAILED: K2 the copy should be ONE new Draft at Shrewsbury with F''s kind, draft and settings (no alert email), never published, booking_key '''', version 1, by the admin, as answered: %',
      (select to_jsonb(k) - 'draft' from public.forms k where k.id = v_k1);
  end if;
  -- K2b (v0.644): the copy has no alert email; the original keeps its own
  if (select k.settings -> 'alert_email' from public.forms k where k.id = v_k1) is distinct from 'null'::jsonb
     or (select f.settings ->> 'alert_email' from public.forms f where f.id = v_f) is distinct from 'desk@example.com' then
    raise exception 'TEST FAILED: K2b the copy should start with no alert email, the original keep desk@example.com';
  end if;
  if exists (select 1 from public.form_booking_offers o where o.form_id = v_k1)
     or exists (select 1 from public.form_booking_limits l where l.form_id = v_k1)
     or exists (select 1 from public.form_booking_group_limits g where g.form_id = v_k1) then
    raise exception 'TEST FAILED: K3 the copy should have no booking times (they are Worcester''s classes): no offers, time limits or classes taught together';
  end if;
  if exists (select 1 from public.form_submissions s where s.form_id = v_k1)
     or exists (select 1 from public.form_kiosk_tokens t where t.form_id = v_k1) then
    raise exception 'TEST FAILED: K4 the copy should have no sign-ups and no kiosk tokens';
  end if;
  if public.forms_public_get(v_r ->> 'slug') ->> 'status' is distinct from 'not_found' then
    raise exception 'TEST FAILED: K5 a Draft copy should not be on the public page';
  end if;
  if (select to_jsonb(f)::text from public.forms f where f.id = v_f) is distinct from v_orig
     or pg_temp.zzc_booking(v_f) is distinct from v_book
     or (select count(*) from public.form_submissions s where s.form_id = v_f) <> 1
     or (select count(*) from public.form_kiosk_tokens t where t.form_id = v_f) <> 1
     or public.forms_public_get(v_slug) ->> 'status' is distinct from 'ok' then
    raise exception 'TEST FAILED: K6 the original should be unchanged (its row, booking times, sign-up and kiosk token) and still on the public page';
  end if;

  -- ===================================================================
  -- N + L. Names and links
  -- ===================================================================
  -- N1 / L1: the first copy - Shrewsbury had no form called that: the same name, "<link>-shrewsbury"
  if v_r ->> 'name' is distinct from v_tag || ' Visitor Information' or v_r ->> 'slug' is distinct from v_slug || '-shrewsbury' then
    raise exception 'TEST FAILED: N1 / L1 the first copy should keep F''s name and get "<link>-shrewsbury": %', v_r;
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- N2 / L2: F again - Shrewsbury now has that name (the first copy): "Copy of ...", and "-2"
  v_r := public.forms_copy_to_school(v_f, 'shrewsbury');
  v_k2 := (v_r ->> 'id')::uuid;
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'name' is distinct from 'Copy of ' || v_tag || ' Visitor Information'
     or v_r ->> 'slug' is distinct from v_slug || '-shrewsbury-2' then
    raise exception 'TEST FAILED: N2 / L2 a second copy should be "Copy of ..." with "<link>-shrewsbury-2": %', v_r;
  end if;
  -- L3: G's 40-character link is cut to 29 characters for "-shrewsbury"; the cut ends in "--",
  -- and both dashes go (27 + 11 = 38 characters)
  v_r := public.forms_copy_to_school(v_g, 'shrewsbury');
  v_k3 := (v_r ->> 'id')::uuid;
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'name' is distinct from v_tag || ' Long link'
     or v_r ->> 'slug' is distinct from v_base_g || '-shrewsbury' or char_length(v_r ->> 'slug') <> 38 then
    raise exception 'TEST FAILED: L3 a 40-character link should be cut to fit, with no dash left before the school: %', v_r;
  end if;
  -- L4: G again: "-shrewsbury-2" (13 characters) leaves 27 of G's link: exactly 40
  v_r := public.forms_copy_to_school(v_g, 'shrewsbury');
  v_k4 := (v_r ->> 'id')::uuid;
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'name' is distinct from 'Copy of ' || v_tag || ' Long link'
     or v_r ->> 'slug' is distinct from v_base_g || '-shrewsbury-2' or char_length(v_r ->> 'slug') <> 40 then
    raise exception 'TEST FAILED: L4 a second copy of the long link should be "...-shrewsbury-2" in 40 characters: %', v_r;
  end if;
  -- N3 / L5: H (Shrewsbury) -> Worcester, which has I (H's name in capitals): "Copy of ..." cut to
  -- 80, the space left at the cut taken away (79 characters); the link "<link>-worcester"
  v_r := public.forms_copy_to_school(v_h, 'worcester');
  v_k5 := (v_r ->> 'id')::uuid;
  reset role;
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'name' is distinct from 'Copy of ' || rpad(v_tag || ' ', 71, 'a')
     or char_length(v_r ->> 'name') <> 79 or v_r ->> 'slug' is distinct from v_slug_h || '-worcester'
     or (select k.location_code || '/' || k.kind from public.forms k where k.id = v_k5) <> 'worcester/event' then
    raise exception 'TEST FAILED: N3 / L5 H at Worcester should be "Copy of" + its name cut to 79 characters, "<link>-worcester", an Event: %', v_r;
  end if;
  -- L6: every copy: a valid link ending in its own school (and a number), no dash left before the
  -- school, at most 40; a normalized name of at most 80
  if exists (select 1 from public.forms k where k.id in (v_k1, v_k2, v_k3, v_k4, v_k5)
              and (not public.forms_slug_ok(k.slug) or char_length(k.slug) > 40
                   or k.slug !~ ('[a-z0-9]-' || k.location_code || '(-[0-9]+)?$')
                   or k.name is distinct from public.testing_normalize_name(k.name) or char_length(k.name) > 80)) then
    raise exception 'TEST FAILED: L6 a copy''s link or name breaks the rules: %',
      (select string_agg(k.slug || ' / ' || k.name, '; ') from public.forms k where k.id in (v_k1, v_k2, v_k3, v_k4, v_k5));
  end if;

  -- ===================================================================
  -- H. The history: one forms insert per copy (5), nothing else
  --    (only rows of A1's test session count, so a real change made at
  --    the same moment on production can't fail this check)
  -- ===================================================================
  if (select count(*) from public.change_log l where l.id > v_mark and l.session_id = v_a1) <> 5
     or (select count(*) from public.change_log l
          where l.id > v_mark and l.session_id = v_a1
            and l.table_name = 'forms' and l.op = 'insert' and l.action = 'forms_copy_to_school'
            and l.actor_id = v_admin and l.batch_id is not null and l.before is null
            and l.record_id in (v_k1, v_k2, v_k3, v_k4, v_k5)
            and l.location_code = (select k.location_code from public.forms k where k.id = l.record_id)
            and l.after ->> 'slug' = (select k.slug from public.forms k where k.id = l.record_id)) <> 5
     or (select count(distinct l.batch_id) from public.change_log l where l.id > v_mark and l.session_id = v_a1) <> 5 then
    raise exception 'TEST FAILED: H1 each copy should write exactly one change_log row (forms, insert, its school, forms_copy_to_school, the admin, its own batch): %',
      (select string_agg(l.table_name || '/' || l.op || '/' || l.action || '/' || coalesce(l.location_code, '-'), ', ' order by l.id)
         from public.change_log l where l.id > v_mark);
  end if;
  if coalesce(current_setting('tkd.action', true), '') <> '' or coalesce(current_setting('tkd.batch_id', true), '') <> '' then
    raise exception 'TEST FAILED: H2 tags left set after the copies: action %, batch %',
      current_setting('tkd.action', true), current_setting('tkd.batch_id', true);
  end if;

  -- ===================================================================
  -- U. Undo: what the app's Undo calls (forms_delete of the copy)
  -- ===================================================================
  select coalesce(max(l.id), 0) into v_mark2 from public.change_log l;
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_txt := concat_ws(',',
    public.forms_delete(v_k1, v_k1_v) ->> 'status',
    public.forms_delete(v_k1, v_k1_v) ->> 'status');
  reset role;
  if v_txt <> 'ok,not_found' or exists (select 1 from public.forms k where k.id = v_k1) then
    raise exception 'TEST FAILED: U1 Undo (forms_delete of the copy, then again) gave % - expected ok,not_found and the copy gone', v_txt;
  end if;
  if not exists (select 1 from public.change_log l where l.id > v_mark2 and l.table_name = 'forms' and l.op = 'delete'
                    and l.action = 'forms_delete' and l.record_id = v_k1 and l.location_code = 'shrewsbury') then
    raise exception 'TEST FAILED: U2 the removed copy should be in change_log as forms_delete';
  end if;
  if (select to_jsonb(f)::text from public.forms f where f.id = v_f) is distinct from v_orig
     or pg_temp.zzc_booking(v_f) is distinct from v_book
     or (select count(*) from public.form_submissions s where s.form_id = v_f) <> 1
     or (select count(*) from public.form_kiosk_tokens t where t.form_id = v_f) <> 1 then
    raise exception 'TEST FAILED: U3 the original changed (row, booking times, sign-up or kiosk token) after the copies and the Undo';
  end if;
  -- the name and the link are free again: the next copy takes them
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.forms_copy_to_school(v_f, 'shrewsbury');
  reset role;
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'name' is distinct from v_tag || ' Visitor Information'
     or v_r ->> 'slug' is distinct from v_slug || '-shrewsbury' then
    raise exception 'TEST FAILED: U4 after the Undo the next copy should take F''s name and "<link>-shrewsbury" again: %', v_r;
  end if;

  -- ===================================================================
  -- L7 / L8 (v0.644): a link ending in the form's own school gets the
  -- other school's name instead, and a link too long is cut at a dash
  -- (after H, so its count of the five copies stays as it is)
  -- ===================================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', v_c_a1, true);
  -- J (Shrewsbury), "zz-...-shrewsbury" -> Worcester
  v_r := public.forms_create('shrewsbury', 'blank', v_tag || ' J', v_slug_j || '-shrewsbury');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: J: %', v_r; end if;
  v_txt := public.forms_copy_to_school((v_r ->> 'id')::uuid, 'worcester') ->> 'slug';
  -- M (Worcester), 40 characters -> Shrewsbury: the cut falls inside the d's
  v_r := public.forms_create('worcester', 'blank', v_tag || ' M', v_slug_m);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: M: %', v_r; end if;
  v_r := public.forms_copy_to_school((v_r ->> 'id')::uuid, 'shrewsbury');
  reset role;
  if v_txt is distinct from v_slug_j || '-worcester' then
    raise exception 'TEST FAILED: L7 a link ending in the form''s own school should get the other school''s name instead: % (expected %)',
      v_txt, v_slug_j || '-worcester';
  end if;
  if v_r ->> 'status' is distinct from 'ok' or v_r ->> 'slug' is distinct from left(v_slug_m, 23) || '-shrewsbury'
     or not public.forms_slug_ok(v_r ->> 'slug') then
    raise exception 'TEST FAILED: L8 a link too long should be cut at a dash, never inside a word: % (expected %)',
      v_r ->> 'slug', left(v_slug_m, 23) || '-shrewsbury';
  end if;

  -- ===================================================================
  -- C. The catalog
  -- ===================================================================
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'forms_copy_to_school';
  if v_n <> 1 then raise exception 'TEST FAILED: C1 expected exactly one forms_copy_to_school, found %', v_n; end if;
  select p.oid, p.prosecdef, p.proconfig, p.provolatile::text as vol, p.proowner, p.prorettype, l.lanname, p.proacl, p.prosrc into v_fn
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.forms_copy_to_school(uuid, text)'::regprocedure;
  if v_fn.lanname <> 'plpgsql' or v_fn.vol <> 'v' or v_fn.prosecdef is not true or v_fn.prorettype <> 'jsonb'::regtype then
    raise exception 'TEST FAILED: C2 forms_copy_to_school should be plpgsql, volatile, security definer, returning jsonb';
  end if;
  if v_fn.proconfig is distinct from array['search_path=""'] then
    raise exception 'TEST FAILED: C3 forms_copy_to_school settings are % (expected only search_path="")', v_fn.proconfig;
  end if;
  if v_fn.proowner <> (select c.relowner from pg_class c where c.oid = 'public.forms'::regclass) then
    raise exception 'TEST FAILED: C4 forms_copy_to_school''s owner differs from the forms table''s owner';
  end if;
  if exists (select 1 from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) a where a.grantee = 0) then
    raise exception 'TEST FAILED: C5 PUBLIC can run forms_copy_to_school';
  end if;
  foreach v_role in array array['anon', 'service_role', 'forms_registrar', 'testing_registrar', 'star_registrar', 'bb_registrar', 'camps_registrar'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role)
       and has_function_privilege(v_role, v_fn.oid, 'EXECUTE') then
      raise exception 'TEST FAILED: C6 % may run forms_copy_to_school', v_role;
    end if;
  end loop;
  if has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') is not true then
    raise exception 'TEST FAILED: C7 authenticated may not run forms_copy_to_school';
  end if;
  if v_fn.prosrc ~* '\mexecute\M' then
    raise exception 'TEST FAILED: C8 forms_copy_to_school builds and runs SQL text';
  end if;
  -- two copies at the same moment can't be tested in one session: check instead that the code
  -- still locks the other school's row before it picks the name and the link
  if v_fn.prosrc !~* 'from\s+public\.locations\s+l\s+where\s+l\.code\s*=\s*p_location_code\s+for\s+no\s+key\s+update'
     or position('for no key update' in lower(v_fn.prosrc)) > position('copy of' in lower(v_fn.prosrc)) then
    raise exception 'TEST FAILED: C9 forms_copy_to_school should lock the other school''s row (for no key update) before it picks the name and the link';
  end if;

  raise notice 'ALL 0042 TESTS PASSED';
end
$$;

select 'ALL 0042 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
