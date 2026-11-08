-- =====================================================================
-- 0040_forms_old_shapes_removed.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The small clean-up migration after 0036 (New students: each child's
--   last name and date of birth, the Address question; rulebook v0.634 -
--   v0.640, rolling-check pass 1 / pass 2 clean-up item). 0036 took two
--   OLD ways of sending data during the switch to the new app:
--     * a child as { first_name, age } (the live app before 0036 sent it)
--     * an Address answer as one plain text (the old page showed a text
--       box for a question type it didn't know)
--   The new app has been live since 2026-11-04 (main a5d0e1d), more than
--   the 12 hours a kiosk page can stay open, so both are removed here.
--
-- WHAT IT CHANGES (two internal functions, nothing else)
--   1. forms_check_answers (0036's version): a child must be EXACTLY
--      { first_name, last_name, dob }; an Address answer must be an
--      object { street, city, state, zip }. The old child shape and a
--      plain-text Address are refused ("invalid"). Every other rule is
--      word for word as in 0036.
--   2. forms_submit_core (0036's version): every child has a date of
--      birth, so the "if it has one" branches go; each child is saved as
--      { first_name, last_name, dob, age }. Word for word otherwise.
--   Same arguments, same owner, security invoker, search_path = '' and
--   no rights for anyone (the revokes are re-stated). No table, column,
--   rule, grant or other function changes; nothing is granted to anon;
--   no data is read or written - sign-ups already saved with the old
--   shape (and their prospects) stay exactly as they are (0009's trigger
--   refuses any change to a sign-up, and nothing here touches one).
--
-- HOW TO RUN IT
--   After 0036 (and 0031). Supabase dashboard -> SQL Editor -> New
--   query -> paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept. Safe to run
--   again. Run supabase/tests/0040_preapply_check.sql first (SETUP
--   "Migration 0040").
--   If 0036 or 0031 is ever re-run after this file, re-run 0040 straight
--   after it: they would put back the functions that accept the old ways.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file replaces 0036's two functions, so it needs
--    0036 (the prospects columns are its marker) - stops, and changes
--    nothing, if it is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.forms_check_answers(jsonb, jsonb, jsonb, text)') is null
     or to_regprocedure('public.forms_submit_core(uuid, uuid, integer, jsonb, jsonb, jsonb, text, text, text)') is null
     or not exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public' and c.table_name = 'prospects' and c.column_name = 'child_dob') then
    raise exception '0040 needs migration 0036 (New students: last name, date of birth, Address) first.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. forms_check_answers(...) - from 0036 (section 6), word for word
-- except the lines marked "0040": the old child shape and the plain-text
-- Address are gone.
-- ---------------------------------------------------------------------
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
--     (address = { street 1-120, city 1-60, state 1-30, zip 5 digits
--     or ZIP+4 }, all four filled; 0040: no plain text any more)
--   * heading, step, children and booking take no answer here (children and
--     bookings come separately)
--   * children: 1-6 of { first_name 1-40, last_name 1-40, dob 'YYYY-MM-DD' }
--     (0040: the old { first_name, age } is gone; forms_submit_core
--     checks that child's age, 2-99, on today)
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
      -- 0040: the Address question. { street, city, state, zip } - exactly those
      -- four keys, all text, all filled (0008's text rules; the ZIP code 5 digits,
      -- or ZIP+4, written [0-9] so only the digits 0-9 count). One plain text is
      -- NOT accepted any more (0036 took it during the switch).
      when 'address' then
        if jsonb_typeof(v_val) <> 'object' then
          return 'invalid';
        elsif (select count(*) from jsonb_object_keys(v_val)) <> 4
           or not (v_val ?& array['street', 'city', 'state', 'zip'])
           or exists (select 1 from jsonb_each(v_val) x where jsonb_typeof(x.value) <> 'string')
           or not public.calendar_text_is_valid(v_val ->> 'street', 120)
           or not public.calendar_text_is_valid(v_val ->> 'city', 60)
           or not public.calendar_text_is_valid(v_val ->> 'state', 30)
           or (v_val ->> 'zip') !~ '^[0-9]{5}(-[0-9]{4})?$' then
          return 'invalid';
        end if;
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
    -- 0040: each child is EXACTLY { first_name, last_name, dob }: both names
    -- 1-40 characters (0008's text rules), dob a real 'YYYY-MM-DD' date. The
    -- old shape { first_name, age } is NOT accepted any more. The age (2-99
    -- on today) is checked by forms_submit_core: no clock here.
    if jsonb_typeof(v_c) <> 'object' then
      return 'invalid';
    end if;
    if (select count(*) from jsonb_object_keys(v_c)) <> 3
       or not (v_c ?& array['first_name', 'last_name', 'dob'])
       or jsonb_typeof(v_c -> 'first_name') <> 'string'
       or not public.calendar_text_is_valid(v_c ->> 'first_name', 40)
       or jsonb_typeof(v_c -> 'last_name') <> 'string'
       or not public.calendar_text_is_valid(v_c ->> 'last_name', 40)
       or jsonb_typeof(v_c -> 'dob') <> 'string'
       or not public.forms_date_ok(v_c ->> 'dob') then
      return 'invalid';
    end if;
  end loop;
  return 'ok';
end;
$$;

revoke execute on function public.forms_check_answers(jsonb, jsonb, jsonb, text) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. forms_submit_core(...) - from 0036 (section 7), word for word
-- except the lines marked "0040": every child has a date of birth.
-- ---------------------------------------------------------------------
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
  v_today   date;   -- the school's today, for a child's age
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
  -- 0040: every child has a date of birth (forms_check_answers refused any
  -- other shape just above): 2-99 years old on the school's today (it
  -- can't check that: it has no clock)
  v_today := public.schedule_today();
  if exists (select 1 from jsonb_array_elements(p_children) c
              where date_part('year', age(v_today::timestamp, (c ->> 'dob')::date::timestamp)) not between 2 and 99) then
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
     -- 0040: each child -> { first_name, last_name, dob, age } (the age from the date of birth on v_today)
     (select jsonb_agg(jsonb_build_object('first_name', public.testing_normalize_name(c ->> 'first_name'),
                                          'last_name', public.testing_normalize_name(c ->> 'last_name'),
                                          'dob', c ->> 'dob',
                                          'age', date_part('year', age(v_today::timestamp, (c ->> 'dob')::date::timestamp))::integer)
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



commit;

-- End of 0040_forms_old_shapes_removed.sql
