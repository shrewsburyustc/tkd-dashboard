-- =====================================================================
-- 0036u_undo_new_students_profile.sql   (UNDO of migration 0036)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0036 (each child's last name and date of birth, the
--   Address question; rulebook v0.634 - v0.639) back out:
--     1. refuses - changing nothing - while anything already uses 0036
--        (see "IT REFUSES" below);
--     2. puts back the exact earlier versions of the eight functions 0036
--        replaced, copied word for word with their exact rights:
--          forms_fields_are_valid     from 0009 (section 1f)
--          forms_template             from 0009 (section 1i)
--          forms_check_answers        from 0009 (section 6a)
--          forms_submit_core          from 0031 (section 12 - the live
--                                     one before 0036, not 0009's)
--          prospects_from_submission  from 0012 (section 3c)
--          prospects_list             from 0012 (section 6a)
--          prospects_search           from 0012 (section 6b)
--          prospects_get              from 0012 (section 6c)
--        (the last three with the rights 0012's section 11 loop gives
--        them: authenticated only);
--     3. removes the two prospects columns, child_last_name and
--        child_dob, with their rules;
--     4. puts back 0009's size rule: a sign-up's children list is at most
--        2000 bytes;
--     5. puts back 0009's read rights on form_submissions exactly (the app
--        may again read the 15 columns 0009 granted, never the signature
--        or the submission key).
--   The app version that sends last names, dates of birth or addresses
--   must NOT be live when this runs.
--
-- IT REFUSES WHILE ANYTHING USES 0036
--   Postgres does NOT re-check saved rows when the function inside a
--   table rule is replaced. So without the check in section 1:
--     * a form whose field list (draft or published) has an Address
--       question would break 0009's rules forms_draft_check /
--       forms_published_check, and EVERY later save of that form (rename,
--       Publish, Close, booking settings) would then fail;
--     * a sign-up whose children list is over 2000 bytes would make
--       0009's size rule impossible to put back;
--     * a prospect with a last name or a date of birth would lose them
--       with the columns (its sign-up keeps them, but pasting 0036 again
--       does not copy them back).
--   Section 1 therefore stops - changing nothing - while any of these
--   exist. supabase/tests/0036_preapply_check.sql counts them:
--   forms_with_address, signups_over_2000 and prospects_with_new_details
--   must all be 0.
--
-- WHY A SEPARATE FILE
--   Re-running 0009 / 0012 / 0031 would put old functions back too, but
--   they re-run everything else in those files (and 0009 can't even run
--   cleanly after 0031). This touches only what 0036 made or replaced.
--   Paste it ONLY with Jeffrey's OK (supabase/SETUP.md, Migration 0036,
--   0036e).
--
-- AFTERWARDS
--   0009's, 0012's and 0031's fingerprints must match their records from
--   BEFORE 0036 (SETUP 0036a), and 0036_preapply_check.sql must answer as
--   it did then. Tested in PGlite (run.mjs step0036). To redo: paste 0036
--   again. One transaction: on any error nothing is kept. Supabase will
--   warn about destructive operations: this file really removes the two
--   columns (empty, or the check in section 1 would have stopped it) and
--   replaces the size rule. Confirm only if you mean it.
--   Safe to run twice.
-- =====================================================================

begin;

-- Stop form, sign-up and prospect saves for the moment this undo runs, so
-- nothing that uses 0036 can be saved between the check below and the swap
-- back (the same way as 0028u).
lock table public.forms, public.form_submissions, public.prospects in share mode;

-- ---------------------------------------------------------------------
-- 1. Refuse while anything uses 0036 (see above). The prospects are read
--    through to_jsonb(), so this also works when the columns are already
--    gone (a second run).
-- ---------------------------------------------------------------------
do $$
declare
  v_forms     integer;
  v_big       integer;
  v_prospects integer;
begin
  select count(*) into v_forms
    from public.forms f
   where exists (select 1 from jsonb_array_elements(f.draft) e where e ->> 'type' = 'address')
      or exists (select 1 from jsonb_array_elements(coalesce(f.published, '[]'::jsonb)) e where e ->> 'type' = 'address');
  select count(*) into v_big
    from public.form_submissions s
   where octet_length(s.children::text) > 2000;
  select count(*) into v_prospects
    from public.prospects p
   where to_jsonb(p) ->> 'child_last_name' is not null or to_jsonb(p) ->> 'child_dob' is not null;
  if v_forms > 0 or v_big > 0 or v_prospects > 0 then
    raise exception '0036 undo refused: % form(s) with an Address question, % sign-up(s) with a children list over 2000 bytes, % prospect(s) with a last name or date of birth. Nothing was changed (0036_preapply_check.sql lists the counts).',
      v_forms, v_big, v_prospects;
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. The eight functions, word for word from 0009, 0031 and 0012
-- ---------------------------------------------------------------------

-- 1f. forms_fields_are_valid(fields) - the field list of a form (jsonb):
--   [{ "id", "type", "label", "required", "help", "options", "show_if",
--      "text" (waiver) }]
--   * at most 60 fields, at most 50 000 bytes in all, unique ids
--     (1-40 of a-z 0-9 _ -)
--   * types: parent_name, parent_phone, parent_email, children (each
--     exactly once, id = the type, "locked": true - relabel, never remove),
--     short_text, long_text, phone, email, number, date, choice,
--     checkboxes, dropdown (2-30 options of 1-80 characters, no repeats),
--     heading, step, waiver (at most 1), booking (at most 1)
--   * label 1-120 characters (Testing's name rules), help 0-200
--   * show_if: null, or { "field": <an EARLIER choice or dropdown>, "value":
--     one of its options }. Never on the waiver: everyone who sends a form
--     with a waiver signs it (Jeffrey, F5 difference 8, rulebook v0.147)
--   * waiver "text": 0-5000 characters (may be empty in a draft; see 1g)
create or replace function public.forms_fields_are_valid(p_fields jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_f     jsonb;
  v_type  text;
  v_id    text;
  v_seen  jsonb := '{}'::jsonb;   -- id -> type of the fields so far
  v_opts  jsonb;
  v_si    jsonb;
  v_n     integer := 0;
  v_locked text[] := array['parent_name', 'parent_phone', 'parent_email', 'children'];
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array'
     or jsonb_array_length(p_fields) not between 4 and 60
     or octet_length(p_fields::text) > 50000 then
    return false;
  end if;
  for v_f in select x from jsonb_array_elements(p_fields) as t(x) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_f) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(v_f) k
                where k not in ('id', 'type', 'label', 'required', 'help', 'options', 'show_if', 'text', 'locked')) then
      return false;
    end if;
    v_id := v_f ->> 'id';
    v_type := v_f ->> 'type';
    if v_id is null or v_id !~ '^[a-z0-9_-]{1,40}$' or v_seen ? v_id then return false; end if;
    if v_type is null or v_type not in ('parent_name', 'parent_phone', 'parent_email', 'children', 'short_text', 'long_text',
                                        'phone', 'email', 'number', 'date', 'choice', 'checkboxes', 'dropdown',
                                        'heading', 'step', 'waiver', 'booking') then
      return false;
    end if;
    if not public.calendar_text_is_valid(v_f ->> 'label', 120) then return false; end if;
    if v_f ? 'help' and jsonb_typeof(v_f -> 'help') <> 'null'
       and (jsonb_typeof(v_f -> 'help') <> 'string' or char_length(v_f ->> 'help') > 200
            or (v_f ->> 'help') ~ public.forms_bad_text(false)) then
      return false;
    end if;
    if v_f ? 'required' and jsonb_typeof(v_f -> 'required') not in ('boolean', 'null') then return false; end if;
    -- the four fixed fields
    if v_type = any (v_locked) then
      if v_id <> v_type or (v_f -> 'locked') is distinct from 'true'::jsonb or (v_f -> 'show_if') is not null and jsonb_typeof(v_f -> 'show_if') <> 'null' then
        return false;
      end if;
    elsif v_f ? 'locked' and (v_f -> 'locked') <> 'false'::jsonb then
      return false;
    end if;
    -- options
    v_opts := v_f -> 'options';
    if v_type in ('choice', 'checkboxes', 'dropdown') then
      if v_opts is null or jsonb_typeof(v_opts) <> 'array' or jsonb_array_length(v_opts) not between 2 and 30
         or exists (select 1 from jsonb_array_elements(v_opts) o
                     where jsonb_typeof(o) <> 'string' or not public.calendar_text_is_valid(o #>> '{}', 80)
                        or o #>> '{}' <> public.testing_normalize_name(o #>> '{}'))
         or (select count(distinct lower(o #>> '{}')) from jsonb_array_elements(v_opts) o) <> jsonb_array_length(v_opts) then
        return false;
      end if;
    elsif v_opts is not null and jsonb_typeof(v_opts) <> 'null' then
      return false;
    end if;
    -- the booking field is never required: with no times left, a family can still send (v0.235)
    if v_type = 'booking' and (v_f -> 'required') = 'true'::jsonb then
      return false;
    end if;
    -- waiver text
    if v_type = 'waiver' then
      if jsonb_typeof(v_f -> 'text') is distinct from 'string' or char_length(v_f ->> 'text') > 5000
         or ((v_f ->> 'text') <> '' and not public.forms_long_text_ok(v_f ->> 'text', 5000)) then
        return false;
      end if;
    elsif v_f ? 'text' then
      return false;
    end if;
    -- show only if
    v_si := v_f -> 'show_if';
    if v_si is not null and jsonb_typeof(v_si) <> 'null' then
      if v_type = 'waiver'
         or jsonb_typeof(v_si) <> 'object'
         or not (v_seen ? (v_si ->> 'field'))
         or (v_seen ->> (v_si ->> 'field')) not in ('choice', 'dropdown')
         or jsonb_typeof(v_si -> 'value') <> 'string'
         or not exists (select 1 from jsonb_array_elements(p_fields) e, jsonb_array_elements(e -> 'options') o
                         where e ->> 'id' = v_si ->> 'field' and o #>> '{}' = v_si ->> 'value')
         or exists (select 1 from jsonb_object_keys(v_si) k where k not in ('field', 'value')) then
        return false;
      end if;
    end if;
    v_seen := v_seen || jsonb_build_object(v_id, v_type);
  end loop;
  -- each fixed field once; at most one waiver and one booking
  if (select count(*) from jsonb_array_elements(p_fields) e where e ->> 'type' = any (v_locked)) <> 4
     or (select count(distinct e ->> 'type') from jsonb_array_elements(p_fields) e where e ->> 'type' = any (v_locked)) <> 4
     or (select count(*) from jsonb_array_elements(p_fields) e where e ->> 'type' = 'waiver') > 1
     or (select count(*) from jsonb_array_elements(p_fields) e where e ->> 'type' = 'booking') > 1 then
    return false;
  end if;
  return true;
end;
$$;

revoke execute on function public.forms_fields_are_valid(jsonb) from public, anon, authenticated, service_role;

-- 1i. forms_template(kind) - the starting field list of a new form
-- (mockup screen 2). Templates are only starting points. The waiver starts
-- EMPTY: the school writes its own wording in the app (v0.241 answer 4).
create or replace function public.forms_template(p_kind text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_array(
           jsonb_build_object('id', 'parent_name', 'type', 'parent_name', 'label', 'Parent or guardian name', 'required', true, 'locked', true),
           jsonb_build_object('id', 'parent_phone', 'type', 'parent_phone', 'label', 'Phone', 'required', true, 'locked', true),
           jsonb_build_object('id', 'parent_email', 'type', 'parent_email', 'label', 'Email', 'required', true, 'locked', true),
           jsonb_build_object('id', 'children', 'type', 'children', 'label', 'Children', 'required', true, 'locked', true))
         || case p_kind
              when 'free_class' then jsonb_build_array(
                jsonb_build_object('id', 'step_2', 'type', 'step', 'label', 'Pick a free class'),
                jsonb_build_object('id', 'booking', 'type', 'booking', 'label', 'Free class time', 'required', false),
                jsonb_build_object('id', 'step_3', 'type', 'step', 'label', 'Almost done'),
                jsonb_build_object('id', 'heard', 'type', 'choice', 'label', 'How did you hear about us?', 'required', false,
                                   'options', jsonb_build_array('Instagram', 'Facebook', 'A friend', 'Google', 'Other')),
                jsonb_build_object('id', 'waiver', 'type', 'waiver', 'label', 'Waiver', 'required', true, 'text', ''))
              when 'walk_in' then jsonb_build_array(
                jsonb_build_object('id', 'heard', 'type', 'choice', 'label', 'How did you hear about us?', 'required', false,
                                   'options', jsonb_build_array('Walked by', 'A friend', 'Google', 'Social media', 'Other')),
                jsonb_build_object('id', 'waiver', 'type', 'waiver', 'label', 'Waiver', 'required', true, 'text', ''))
              when 'event' then jsonb_build_array(
                jsonb_build_object('id', 'notes', 'type', 'long_text', 'label', 'Anything we should know?', 'required', false),
                jsonb_build_object('id', 'waiver', 'type', 'waiver', 'label', 'Waiver', 'required', true, 'text', ''))
              else '[]'::jsonb
            end;
$$;

revoke execute on function public.forms_template(text) from public, anon, authenticated, service_role;

-- 6a. forms_check_answers(fields, answers, children, signature) -> 'ok' |
-- 'invalid'. Checks the answers against the PUBLISHED field list:
--   * answers is an object of { field id: value }; unknown keys refused;
--     total size <= 20 000 bytes
--   * a field hidden by "show only if" must have no answer; a visible
--     required field must have one
--   * per type: parent_name / short_text 1-200 (Testing's text rules),
--     long_text 1-1000, phone, email, number (-999999..999999), date
--     (1900-2100), choice / dropdown one of the options, checkboxes distinct
--     options, waiver = true (and then a valid signature)
--   * heading, step, children and booking take no answer here (children and
--     bookings come separately)
--   * children: 1-6 of { first_name 1-40, age 2-99 }
create or replace function public.forms_check_answers(p_fields jsonb, p_answers jsonb, p_children jsonb, p_signature text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_f       jsonb;
  v_id      text;
  v_type    text;
  v_val     jsonb;
  v_visible boolean;
  v_opts    jsonb;
  v_si      jsonb;
  v_has_waiver boolean := false;
  v_c       jsonb;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 20000 then
    return 'invalid';
  end if;
  -- unknown keys
  if exists (select 1 from jsonb_object_keys(p_answers) k
              where not exists (select 1 from jsonb_array_elements(p_fields) e
                                 where e ->> 'id' = k
                                   and e ->> 'type' not in ('heading', 'step', 'children', 'booking'))) then
    return 'invalid';
  end if;
  for v_f in select x from jsonb_array_elements(p_fields) as t(x) loop
    v_id := v_f ->> 'id';
    v_type := v_f ->> 'type';
    continue when v_type in ('heading', 'step', 'children', 'booking');
    v_si := v_f -> 'show_if';
    -- a waiver is always visible (v0.243), even if a show_if ever slipped past the table check
    v_visible := v_type = 'waiver' or v_si is null or jsonb_typeof(v_si) = 'null'
                 or (p_answers -> (v_si ->> 'field')) = (v_si -> 'value');
    v_val := p_answers -> v_id;
    if v_val is not null and jsonb_typeof(v_val) = 'null' then v_val := null; end if;
    if not v_visible then
      if v_val is not null then return 'invalid'; end if;
      continue;
    end if;
    if v_val is null then
      if v_type in ('parent_name', 'parent_phone', 'parent_email', 'waiver')
         or (v_f -> 'required') = 'true'::jsonb then
        return 'invalid';
      end if;
      continue;
    end if;
    v_opts := v_f -> 'options';
    case v_type
      when 'parent_name', 'short_text' then
        if jsonb_typeof(v_val) <> 'string' or not public.calendar_text_is_valid(v_val #>> '{}', case when v_type = 'parent_name' then 80 else 200 end) then
          return 'invalid';
        end if;
      when 'long_text' then
        if jsonb_typeof(v_val) <> 'string' or not public.forms_long_text_ok(v_val #>> '{}', 1000) then return 'invalid'; end if;
      when 'parent_phone', 'phone' then
        if jsonb_typeof(v_val) <> 'string' or not public.forms_phone_ok(v_val #>> '{}') then return 'invalid'; end if;
      when 'parent_email', 'email' then
        if jsonb_typeof(v_val) <> 'string' or not public.forms_email_ok(v_val #>> '{}') then return 'invalid'; end if;
      when 'number' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric not between -999999 and 999999 then return 'invalid'; end if;
      when 'date' then
        if jsonb_typeof(v_val) <> 'string' or not public.forms_date_ok(v_val #>> '{}') then return 'invalid'; end if;
      when 'choice', 'dropdown' then
        if jsonb_typeof(v_val) <> 'string' or not (v_opts @> jsonb_build_array(v_val)) then return 'invalid'; end if;
      when 'checkboxes' then
        if jsonb_typeof(v_val) <> 'array'
           or jsonb_array_length(v_val) > jsonb_array_length(v_opts)
           or ((v_f -> 'required') = 'true'::jsonb and jsonb_array_length(v_val) = 0)
           or exists (select 1 from jsonb_array_elements(v_val) a where jsonb_typeof(a) <> 'string' or not (v_opts @> jsonb_build_array(a)))
           or (select count(distinct a) from jsonb_array_elements(v_val) a) <> jsonb_array_length(v_val) then
          return 'invalid';
        end if;
      when 'waiver' then
        if v_val <> 'true'::jsonb then return 'invalid'; end if;
        v_has_waiver := true;
      else
        return 'invalid';
    end case;
  end loop;
  -- the signature goes with an agreed waiver, and only then
  if v_has_waiver then
    if not public.forms_signature_ok(p_signature) then return 'invalid'; end if;
  elsif p_signature is not null then
    return 'invalid';
  end if;
  -- children
  if p_children is null or jsonb_typeof(p_children) <> 'array' or jsonb_array_length(p_children) not between 1 and 6 then
    return 'invalid';
  end if;
  for v_c in select x from jsonb_array_elements(p_children) as t(x) loop
    if jsonb_typeof(v_c) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_c) k where k not in ('first_name', 'age'))
       or jsonb_typeof(v_c -> 'first_name') <> 'string'
       or not public.calendar_text_is_valid(v_c ->> 'first_name', 40)
       or jsonb_typeof(v_c -> 'age') <> 'number'
       or (v_c ->> 'age') !~ '^\d{1,2}$'
       or (v_c ->> 'age')::integer not between 2 and 99 then
      return 'invalid';
    end if;
  end loop;
  return 'ok';
end;
$$;

revoke execute on function public.forms_check_answers(jsonb, jsonb, jsonb, text) from public, anon, authenticated, service_role;

-- 6b. forms_submit_core(...) - saves one sign-up (shared by the public
-- page, the kiosk and staff "Fill in"). The caller has checked who is
-- asking. Order: form (locked) -> published version -> answers ->
-- bookings (each class time locked in a fixed order and re-counted) ->
-- save. A time no longer open raises TKD01 'time_taken', which undoes
-- everything; the caller answers {"status":"time_taken"}.
-- p_bookings: [{ "child": 0.., "class_id", "date": "YYYY-MM-DD", "starts_at": "HH:MM" }]
create or replace function public.forms_submit_core(
  p_form_id           uuid,
  p_submission_key    uuid,
  p_published_version integer,
  p_answers           jsonb,
  p_children          jsonb,
  p_bookings          jsonb,
  p_signature         text,
  p_source            text,
  p_entered_by        text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_form    record;
  v_id      uuid;
  v_b       record;
  v_slot    uuid;
  v_time    record;
  v_has_booking boolean;
begin
  select f.* into v_form from public.forms f where f.id = p_form_id for key share;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_form.status <> 'live' or v_form.published is null then
    return jsonb_build_object('status', case when v_form.status = 'closed' then 'closed' else 'not_found' end);
  end if;

  -- a key already used by ANOTHER form is refused (review L1)
  if exists (select 1 from public.form_submissions s where s.submission_key = p_submission_key and s.form_id <> p_form_id) then
    return jsonb_build_object('status', 'invalid');
  end if;
  -- sent twice (same key): the same answer as the first time (review L2)
  select s.id into v_id from public.form_submissions s where s.form_id = p_form_id and s.submission_key = p_submission_key;
  if found then
    return public.forms_submission_answer(v_id, true);
  end if;

  if p_published_version is distinct from v_form.published_version then
    return jsonb_build_object('status', 'form_changed', 'published_version', v_form.published_version);
  end if;
  if public.forms_check_answers(v_form.published, p_answers, p_children, p_signature) <> 'ok' then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- bookings: an array, at most one per child, only if the form has a booking field
  v_has_booking := exists (select 1 from jsonb_array_elements(v_form.published) e
                            where e ->> 'type' = 'booking'
                              and (e -> 'show_if' is null or jsonb_typeof(e -> 'show_if') = 'null'
                                   or (p_answers -> (e -> 'show_if' ->> 'field')) = (e -> 'show_if' -> 'value')));
  if p_bookings is null or jsonb_typeof(p_bookings) <> 'array'
     or jsonb_array_length(p_bookings) > jsonb_array_length(p_children)
     or (jsonb_array_length(p_bookings) > 0 and not v_has_booking) then
    return jsonb_build_object('status', 'invalid');
  end if;
  if exists (select 1 from jsonb_array_elements(p_bookings) b
              where jsonb_typeof(b) <> 'object'
                 or exists (select 1 from jsonb_object_keys(b) k where k not in ('child', 'class_id', 'date', 'starts_at'))
                 or coalesce(b ->> 'child', '') !~ '^[0-5]$'
                 or (b ->> 'child')::integer >= jsonb_array_length(p_children)
                 or coalesce(b ->> 'class_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 or not public.forms_date_ok(b ->> 'date')
                 or coalesce(b ->> 'starts_at', '') !~ '^([01]\d|2[0-3]):[0-5]\d$')
     or (select count(distinct b ->> 'child') from jsonb_array_elements(p_bookings) b) <> jsonb_array_length(p_bookings) then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
  begin
  insert into public.form_submissions
    (form_id, location_code, published_version, fields, answers, parent_name, parent_phone, parent_email,
     children, signature, signed_at, entered_by, source, submission_key)
  values
    (v_form.id, v_form.location_code, v_form.published_version, v_form.published, p_answers,
     public.testing_normalize_name(p_answers ->> 'parent_name'), btrim(p_answers ->> 'parent_phone'), btrim(p_answers ->> 'parent_email'),
     (select jsonb_agg(jsonb_build_object('first_name', public.testing_normalize_name(c ->> 'first_name'), 'age', (c ->> 'age')::integer)
                       order by ord)
        from jsonb_array_elements(p_children) with ordinality as t(c, ord)),
     p_signature, case when p_signature is null then null else now() end, p_entered_by, p_source, p_submission_key)
  returning id into v_id;
  exception when unique_violation then
    -- the same Send arrived twice at the same moment: the first one wins
    select s.id into v_id from public.form_submissions s where s.form_id = p_form_id and s.submission_key = p_submission_key;
    if found then
      return public.forms_submission_answer(v_id, true);
    end if;
    raise;
  end;

  -- each booking: lock its class time (fixed order: no deadlock), re-count, book
  -- 0031: the row locked is forms_booking_lock_class's (the slot's first
  -- class), and the order is that row's
  for v_b in
    select y.* from (
      select x.*, public.forms_booking_lock_class(v_form.location_code, x.class_id, x.on_date, x.starts_at) as lock_class
        from (select (b ->> 'child')::smallint as child, (b ->> 'class_id')::uuid as class_id,
                     (b ->> 'date')::date as on_date, (b ->> 'starts_at')::time as starts_at
                from jsonb_array_elements(p_bookings) b) as x) as y
     order by y.lock_class::text, y.on_date, y.starts_at, y.class_id::text
  loop
    insert into public.class_booking_slots (location_code, class_id, on_date, starts_at)
    values (v_form.location_code, v_b.lock_class, v_b.on_date, v_b.starts_at)
    on conflict (location_code, class_id, on_date, starts_at) do nothing;
    select s.id into v_slot from public.class_booking_slots s
     where s.location_code = v_form.location_code and s.class_id = v_b.lock_class
       and s.on_date = v_b.on_date and s.starts_at = v_b.starts_at
       for update;
    select t.* into v_time from public.forms_times(v_form.id, v_b.on_date, v_b.on_date) t
     where t.class_id = v_b.class_id and t.starts_at = v_b.starts_at;
    if not found then
      raise exception using errcode = 'TKD01', message = 'time_taken';
    end if;
    insert into public.class_bookings
      (submission_id, form_id, location_code, class_id, class_name, on_date, starts_at, ends_at, child_index)
    values (v_id, v_form.id, v_form.location_code, v_b.class_id, v_time.class_name, v_b.on_date, v_b.starts_at, v_time.ends_at, v_b.child);
  end loop;

  return public.forms_submission_answer(v_id, false);
end;
$$;

revoke execute on function public.forms_submit_core(uuid, uuid, integer, jsonb, jsonb, jsonb, text, text, text) from public, anon, authenticated, service_role;

-- 3c. prospects_from_submission() - AFTER INSERT on form_submissions: one
-- prospect per child, status New (the booking trigger below moves a child
-- with a free class to Booked). Public Send, kiosk and staff Fill in all
-- come through here.
create or replace function public.prospects_from_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c   jsonb;
  v_i   bigint;
  v_id  uuid;
begin
  perform public.prospects_seed_statuses(new.location_code);
  for v_c, v_i in select c, ord from jsonb_array_elements(new.children) with ordinality as t(c, ord) loop
    insert into public.prospects (location_code, submission_id, child_index, child_first_name, child_age, status_id)
    values (new.location_code, new.id, (v_i - 1)::smallint, v_c ->> 'first_name', (v_c ->> 'age')::smallint,
            public.prospects_status_of(new.location_code, 'new'))
    on conflict (submission_id, child_index) do nothing
    returning id into v_id;
    if v_id is not null then
      perform public.prospects_log(v_id, new.location_code, 'created',
                                   jsonb_build_object('source', new.source, 'entered_by', new.entered_by));
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.prospects_from_submission() from public, anon, authenticated, service_role;

-- 6a. prospects_list(school) - every prospect of one school, LIST COLUMNS
-- ONLY: child's first name, parent's name, status, follow-up, joined date,
-- the free class (date, time, class, booked/cancelled, whether it still
-- runs), checked in, "did they come?" due, opened by me, and the family
-- (sign-up) id for siblings. Never phone, email, age, answers or waiver.
create or replace function public.prospects_list(p_location_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamp := (now() at time zone 'America/New_York');
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_location_code is null or not exists (select 1 from public.locations l where l.code = p_location_code) then
    return jsonb_build_object('status', 'invalid');
  end if;
  begin
    perform public.prospects_purge_old();
  exception when deadlock_detected or lock_not_available or serialization_failure then
    null;   -- the clean-up tries again with the next list load
  end;
  perform public.prospects_seed_statuses(p_location_code);
  return jsonb_build_object('status', 'ok', 'today', public.schedule_today(), 'prospects', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'version', p.version, 'family_id', p.submission_id, 'child_first_name', p.child_first_name,
             'parent_name', s.parent_name, 'status_id', p.status_id, 'follow_up_on', p.follow_up_on, 'joined_on', p.joined_on,
             'created_at', p.created_at, 'signed_up_at', s.created_at, 'checked_in', p.checked_in_at is not null,
             'opened_by_me', exists (select 1 from public.prospect_opens o where o.prospect_id = p.id and o.staff_id = auth.uid()),
             'booking', case when b.id is null then null else jsonb_build_object(
               'id', b.id, 'status', b.status, 'class_name', b.class_name, 'date', b.on_date,
               'starts_at', to_char(b.starts_at, 'HH24:MI'), 'ends_at', to_char(b.ends_at, 'HH24:MI'),
               'class_running', b.class_id is not null and public.prospects_class_ran(b.location_code, b.class_id, b.on_date, b.starts_at)) end,
             'ask_came', b.status = 'booked' and p.checked_in_at is null
                         and coalesce(st.builtin, '') not in ('came', 'no_show', 'joined', 'not_interested')
                         and (b.on_date + b.ends_at) < v_now
                         and b.class_id is not null and public.prospects_class_ran(b.location_code, b.class_id, b.on_date, b.starts_at))
             order by s.created_at desc, p.child_index)
      from public.prospects p
      join public.form_submissions s on s.id = p.submission_id
      join public.prospect_statuses st on st.id = p.status_id
      left join public.class_bookings b on b.submission_id = p.submission_id and b.child_index = p.child_index
     where p.location_code = p_location_code), '[]'::jsonb));
end;
$$;

-- 6a (0012). 0012 grants it in a loop (its section 11): the same rights here.
revoke execute on function public.prospects_list(text) from public, anon, authenticated, service_role;
grant  execute on function public.prospects_list(text) to authenticated;

-- 6b. prospects_search(school, text) - ids of prospects whose child name or
-- parent name contains the text, or (4+ digits) whose phone digits
-- contain those digits. Returns ids only - never the number.
create or replace function public.prospects_search(p_location_code text, p_text text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text   text := lower(btrim(coalesce(p_text, '')));
  v_digits text := regexp_replace(coalesce(p_text, ''), '[^0-9]', '', 'g');
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_location_code is null or char_length(v_text) not between 2 and 80 then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'ids', coalesce((
    select jsonb_agg(p.id order by s.created_at desc)
      from public.prospects p
      join public.form_submissions s on s.id = p.submission_id
     where p.location_code = p_location_code
       and (strpos(lower(p.child_first_name), v_text) > 0
            or strpos(lower(s.parent_name), v_text) > 0
            or (char_length(v_digits) >= 4 and strpos(regexp_replace(s.parent_phone, '[^0-9]', '', 'g'), v_digits) > 0))), '[]'::jsonb));
end;
$$;

-- 6b (0012). 0012 grants it in a loop (its section 11): the same rights here.
revoke execute on function public.prospects_search(text, text) from public, anon, authenticated, service_role;
grant  execute on function public.prospects_search(text, text) to authenticated;

-- 6c. prospects_get(prospect) - the side panel: contact details, the
-- child's age, the form and every answer (as the form was), entered by,
-- signed on / signature kept, the free class, siblings, notes and the
-- timeline. Staff see all of it (v0.244 answer 6); the signature PICTURE
-- is read with 0009's forms_submission_signature() (every look recorded).
create or replace function public.prospects_get(p_prospect_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p record;
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_prospect_id is null then return jsonb_build_object('status', 'invalid'); end if;
  select p.*, s.parent_name, s.parent_phone, s.parent_email, s.fields, s.answers, s.source, s.entered_by, s.signed_at,
         s.signature is not null as has_signature, s.created_at as signed_up_at, f.name as form_name, f.id as form_id
    into v_p
    from public.prospects p
    join public.form_submissions s on s.id = p.submission_id
    join public.forms f on f.id = s.form_id
   where p.id = p_prospect_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'ok', 'prospect', jsonb_build_object(
    'id', v_p.id, 'version', v_p.version, 'location_code', v_p.location_code, 'family_id', v_p.submission_id,
    'child_first_name', v_p.child_first_name, 'child_age', v_p.child_age, 'status_id', v_p.status_id,
    'follow_up_on', v_p.follow_up_on, 'joined_on', v_p.joined_on,
    'checked_in_at', v_p.checked_in_at, 'checked_in_by_name', v_p.checked_in_by_name,
    'parent_name', v_p.parent_name, 'parent_phone', v_p.parent_phone, 'parent_email', v_p.parent_email,
    'form_id', v_p.form_id, 'form_name', v_p.form_name, 'source', v_p.source, 'entered_by', v_p.entered_by,
    'signed_up_at', v_p.signed_up_at, 'signed_at', v_p.signed_at, 'has_signature', v_p.has_signature,
    'fields', v_p.fields, 'answers', v_p.answers,
    'booking', (select jsonb_build_object('id', b.id, 'status', b.status, 'class_id', b.class_id, 'class_name', b.class_name,
                                          'date', b.on_date, 'starts_at', to_char(b.starts_at, 'HH24:MI'), 'ends_at', to_char(b.ends_at, 'HH24:MI'),
                                          'class_running', b.class_id is not null and public.prospects_class_ran(b.location_code, b.class_id, b.on_date, b.starts_at))
                  from public.class_bookings b where b.submission_id = v_p.submission_id and b.child_index = v_p.child_index),
    'siblings', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'child_first_name', x.child_first_name, 'child_age', x.child_age,
                                                              'status_id', x.status_id) order by x.child_index)
                            from public.prospects x where x.submission_id = v_p.submission_id and x.id <> v_p.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'follow_up_on', n.follow_up_on,
                                                           'created_at', n.created_at, 'created_by_name', n.created_by_name) order by n.created_at desc)
                         from public.prospect_notes n where n.prospect_id = v_p.id), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'detail', a.detail, 'created_at', a.created_at,
                                                              'created_by_name', a.created_by_name) order by a.id desc)
                            from public.prospect_activity a where a.prospect_id = v_p.id), '[]'::jsonb)));
end;
$$;

-- 6c (0012). 0012 grants it in a loop (its section 11): the same rights here.
revoke execute on function public.prospects_get(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.prospects_get(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. The two prospects columns and their rules (empty: section 1 made
--    sure of that). "if exists": a second run changes nothing.
-- ---------------------------------------------------------------------
alter table public.prospects drop constraint if exists prospects_child_last_name_check;
alter table public.prospects drop constraint if exists prospects_child_dob_check;
alter table public.prospects drop column if exists child_last_name;
alter table public.prospects drop column if exists child_dob;


-- ---------------------------------------------------------------------
-- 4. 0009's size rule again: a children list of 2000 bytes at most
--    (section 1 made sure every saved sign-up passes it). Word for word
--    as 0009's table rule.
-- ---------------------------------------------------------------------
alter table public.form_submissions drop constraint if exists form_submissions_size_check;
alter table public.form_submissions add constraint form_submissions_size_check
  check (octet_length(answers::text) <= 20000 and octet_length(children::text) <= 2000);


-- ---------------------------------------------------------------------
-- 5. 0009's read rights on form_submissions again, exactly as 0009
--    section 4 set them: the table-wide revoke (which also takes back
--    0036's four column rights), then 0009's column list.
-- ---------------------------------------------------------------------
revoke all on table public.form_submissions from public, anon, authenticated, service_role;
grant select (id, form_id, location_code, published_version, fields, answers, parent_name, parent_phone, parent_email,
              children, signed_at, entered_by, source, created_at, created_by_name)
  on public.form_submissions to authenticated;
-- (form_submissions.signature and submission_key are NOT granted.)

commit;

-- End of 0036u_undo_new_students_profile.sql
