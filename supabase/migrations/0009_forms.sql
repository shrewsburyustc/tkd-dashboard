-- =====================================================================
-- 0009_forms.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A database migration for the TKD staff dashboard. It runs after 0007
--   (Schedule) and 0008 (Calendar): free-class times come from the
--   schedule, and closures hide them. It does not change anything
--   0001-0008 made.
--
-- WHY IT EXISTS
--   The Forms section (rulebook v0.139, approved mockup
--   docs/Prospects/TKD-Forms-Mockups.html rev 1; build plan answers v0.145,
--   docs/Prospects/TKD-Forms-Build-Plan.md). Admins build forms in the
--   app (free class from social media, walk-in, event, blank); families
--   fill them in on a public page with no login, and can book a free
--   class. Staff can fill one in for a family. Sign-ups are stored here
--   from day one; the Prospects list that works them is step 4, and the
--   public page only goes live together with it (v0.145 answer 1).
--
-- WHAT IT ADDS
--   1. public.forms                 - one row per form (draft + published fields)
--   2. public.form_booking_offers   - which classes a form offers, spot limit
--                                     and booking window
--   3. public.form_booking_limits   - a different spot limit for one time
--   4. public.form_submissions      - one row per sent form, never changed
--   5. public.class_bookings        - one free-class spot per child
--   6. public.class_booking_slots   - lock rows (one per class time ever booked)
--   7. public.form_kiosk_tokens     - kiosk tokens (stored hashed)
--   8. public.form_email_results    - which emails could not be sent
--   9. public.forms_public_attempts - rate-limit log of the public page
--  10. triggers, security rules, helpers
--  11. staff functions (admins build; staff and admins fill in and read)
--  12. a restricted login, forms_registrar, that can run exactly the three
--      public functions and nothing else (the Cloudflare Function signs in
--      as it - rulebook v0.33)
--
-- PRIVACY (rulebook section 5, v0.139)
--   Sign-ups hold children's first names and ages, parents' names, phone
--   numbers and email addresses, and a drawn signature. Only signed-in,
--   UNLOCKED staff can read them (has_data_access()). The signature
--   column is granted to nobody: it is read one at a time through
--   forms_submission_signature(), and the history (change_log) stores
--   "on file" instead of the picture. The picture itself is DELETED 90 days
--   after the free class (or after signing, without a free class); the
--   sign-up keeps "Signed on <date>" (signed_at) - Jeffrey, 2026-10-18,
--   like Color Belt's family form. Deleting non-joined prospects after
--   2 years comes with step 4 (Prospects) - and must also remove the
--   copies in change_log.
--
-- HOW TO RUN IT
--   Only AFTER 0007 and 0008 are live. Supabase dashboard -> SQL Editor ->
--   New query -> paste this WHOLE file -> Run. One transaction ("begin" ...
--   "commit"): if anything fails, nothing is kept. Supabase will warn about
--   DESTRUCTIVE OPERATIONS: the words appear in rules ("on delete
--   cascade"), in functions that run later, and in "drop ... if exists"
--   lines that make re-running safe. Nothing is removed now.
--   The login forms_registrar is created WITHOUT a password; it can't sign
--   in until one is set at the go-live step (F6), as Color Belt's does.
--   Safe to run again UNTIL a later migration changes these objects.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.calendar_closures') is null or to_regclass('public.schedule_slots') is null then
    raise exception '0009 needs 0007 (Schedule) and 0008 (Calendar) first.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 1. Small rules (internal; the app has the same rules in src/lib/forms)
-- ---------------------------------------------------------------------

-- 1a. forms_bad_text() - the characters a text may never contain, as a
-- regular-expression class: control characters (line breaks allowed only
-- where p_newlines), zero-width characters and direction marks, direction
-- overrides and isolates, invisible operators and the byte-order mark -
-- the same list as Testing and the Calendar. Built with chr() so the file
-- holds no invisible characters itself.
create or replace function public.forms_bad_text(p_newlines boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select '[' || chr(1) || '-' || chr(9)
             || case when p_newlines then '' else chr(10) end
             || chr(11) || '-' || chr(31) || chr(127) || '-' || chr(159)
             || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238)
             || chr(8288) || '-' || chr(8292) || chr(8294) || '-' || chr(8297) || chr(65279) || ']';
$$;

revoke execute on function public.forms_bad_text(boolean) from public, anon, authenticated, service_role;

-- 1b. forms_long_text_ok(text, max) - a long text (waiver, notes answer):
-- 1..max characters, line breaks allowed, nothing hidden.
create or replace function public.forms_long_text_ok(p_text text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(char_length(p_text) between 1 and p_max and p_text !~ public.forms_bad_text(true), false);
$$;

revoke execute on function public.forms_long_text_ok(text, integer) from public, anon, authenticated, service_role;

-- 1c. forms_phone_ok / forms_email_ok - loose but safe checks (the page
-- checks the same while typing).
--   phone: 7-20 characters of digits, spaces, + ( ) - . and at least 7 digits
--   email: one @, a dot after it, no spaces, 3-254 characters
create or replace function public.forms_phone_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(char_length(p) between 7 and 20
                  and p ~ '^[0-9 +().-]+$'
                  and char_length(regexp_replace(p, '[^0-9]', '', 'g')) between 7 and 15, false);
$$;

revoke execute on function public.forms_phone_ok(text) from public, anon, authenticated, service_role;

create or replace function public.forms_email_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(char_length(p) between 3 and 254
                  and p ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                  and p !~ public.forms_bad_text(false), false);
$$;

revoke execute on function public.forms_email_ok(text) from public, anon, authenticated, service_role;

-- 1d. forms_signature_ok(sig) - a drawn signature as a PNG "data URL",
-- 200 to 70 000 characters (Color Belt's rule, plus a minimum so an empty
-- picture isn't accepted - security review L7).
-- The length is checked FIRST so a huge value never reaches the pattern.
create or replace function public.forms_signature_ok(p_signature text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           char_length(p_signature) between 200 and 70000
           and left(p_signature, 22) = 'data:image/png;base64,'
           and substr(p_signature, 23) ~ '^[A-Za-z0-9+/]+={0,2}$',
         false);
$$;

revoke execute on function public.forms_signature_ok(text) from public, anon, authenticated, service_role;

-- 1d2. forms_date_ok(text) - 'YYYY-MM-DD' that is a real date between 1900
-- and 2100 (Feb 30 -> false, never an error - security review M1).
create or replace function public.forms_date_ok(p_text text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_text is null or p_text !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  return p_text::date between date '1900-01-01' and date '2100-12-31' and to_char(p_text::date, 'YYYY-MM-DD') = p_text;
exception when others then
  return false;
end;
$$;

revoke execute on function public.forms_date_ok(text) from public, anon, authenticated, service_role;

-- 1e. forms_slug_ok(slug) - the editable end of the public link
-- (.../f/<slug>): 3-40 lowercase letters, digits and dashes, starting and
-- ending with a letter or digit, and not a reserved word.
create or replace function public.forms_slug_ok(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
                  and p_slug not in ('api', 'admin', 'new', 'edit', 'kiosk', 'preview', 'assets', 'static', 'forms', 'login'), false);
$$;

revoke execute on function public.forms_slug_ok(text) from public, anon, authenticated, service_role;

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
--     one of its options }
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
    -- the booking field is never required: with no times left, a family can still send (v0.139)
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
      if jsonb_typeof(v_si) <> 'object'
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

-- 1g. forms_fields_publishable(fields) - valid AND every waiver has its
-- text (v0.145 answer 4: no set wording; an empty waiver can't go out).
create or replace function public.forms_fields_publishable(p_fields jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select public.forms_fields_are_valid(p_fields)
     and not exists (select 1 from jsonb_array_elements(p_fields) e
                      where e ->> 'type' = 'waiver' and coalesce(btrim(e ->> 'text'), '') = '');
$$;

revoke execute on function public.forms_fields_publishable(jsonb) from public, anon, authenticated, service_role;

-- 1h. forms_settings_are_valid(settings) - { "thank_you": text 0-500,
-- "alert_email": email or null, "confirm_email": bool, "add_to_calendar": bool }
create or replace function public.forms_settings_are_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           jsonb_typeof(p) = 'object'
           and not exists (select 1 from jsonb_object_keys(p) k where k not in ('thank_you', 'alert_email', 'confirm_email', 'add_to_calendar'))
           and jsonb_typeof(p -> 'thank_you') = 'string'
           and char_length(p ->> 'thank_you') <= 500
           and (p ->> 'thank_you' = '' or public.forms_long_text_ok(p ->> 'thank_you', 500))
           and (jsonb_typeof(p -> 'alert_email') = 'null' or public.forms_email_ok(p ->> 'alert_email'))
           and jsonb_typeof(p -> 'confirm_email') = 'boolean'
           and jsonb_typeof(p -> 'add_to_calendar') = 'boolean',
         false);
$$;

revoke execute on function public.forms_settings_are_valid(jsonb) from public, anon, authenticated, service_role;

-- 1i. forms_template(kind) - the starting field list of a new form
-- (mockup screen 2). Templates are only starting points. The waiver starts
-- EMPTY: the school writes its own wording in the app (v0.145 answer 4).
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


-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

-- 2a. forms
--   draft       the field list as the admin is editing it (saved as you go)
--   published   the field list families see (copied from draft by Publish)
--   published_version  goes up with every Publish; a family's page sends it
--               back, so a form republished while they type answers
--               "form_changed" instead of mixing two versions
--   booking_key hidden: a fingerprint of the booking settings, so a change
--               of only those still counts as a change (version goes up)
create table if not exists public.forms (
  id                uuid        not null default gen_random_uuid(),
  location_code     text        not null,
  name              text        not null,
  slug              text        not null,
  kind              text        not null,
  status            text        not null default 'draft',
  draft             jsonb       not null,
  published         jsonb       null,
  published_version integer     not null default 0,
  published_at      timestamptz null,
  settings          jsonb       not null,
  booking_key       text        not null default '',
  version           integer     not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid        null,
  updated_by        uuid        null,
  created_by_name   text        not null,
  updated_by_name   text        not null,

  constraint forms_pkey primary key (id),
  constraint forms_id_location_key unique (id, location_code),
  constraint forms_slug_key unique (slug),
  constraint forms_location_fk foreign key (location_code) references public.locations (code),
  constraint forms_name_check check (coalesce(public.calendar_text_is_valid(name, 80) and name = public.testing_normalize_name(name), false)),
  constraint forms_slug_check check (public.forms_slug_ok(slug)),
  constraint forms_kind_check check (kind in ('free_class', 'walk_in', 'event', 'blank')),
  constraint forms_status_check check (status in ('draft', 'live', 'closed')),
  constraint forms_draft_check check (public.forms_fields_are_valid(draft)),
  constraint forms_published_check check (published is null or public.forms_fields_publishable(published)),
  constraint forms_live_published_check check (status = 'draft' or published is not null),
  constraint forms_settings_check check (public.forms_settings_are_valid(settings)),
  constraint forms_version_check check (version >= 1)
);

comment on table public.forms is
  'Forms built in the app (free class, walk-in, event, blank). Written only through the forms_* functions.';

-- 2b. form_booking_offers - a class offered by a form's "Book a class"
-- field, with the default spot limit for its times (shared by all forms,
-- the lowest wins - v0.145 answer 5) and the booking window.
create table if not exists public.form_booking_offers (
  id              uuid        not null default gen_random_uuid(),
  form_id         uuid        not null,
  location_code   text        not null,
  class_id        uuid        not null,
  default_limit   smallint    not null default 3,
  days_ahead      smallint    not null default 14,
  min_hours_ahead smallint    not null default 3,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint form_booking_offers_pkey primary key (id),
  constraint form_booking_offers_form_fk foreign key (form_id, location_code) references public.forms (id, location_code) on delete cascade,
  constraint form_booking_offers_class_fk foreign key (class_id, location_code) references public.testing_classes (id, location_code) on delete cascade,
  constraint form_booking_offers_key unique (form_id, class_id),
  constraint form_booking_offers_limit_check check (default_limit between 1 and 20),
  constraint form_booking_offers_days_check check (days_ahead between 1 and 60),
  constraint form_booking_offers_hours_check check (min_hours_ahead between 0 and 72),
  constraint form_booking_offers_version_check check (version >= 1)
);

-- 2c. form_booking_limits - one time (weekday + start) of an offered class
-- with its own limit; 0 = don't offer that time on this form.
create table if not exists public.form_booking_limits (
  id              uuid        not null default gen_random_uuid(),
  form_id         uuid        not null,
  location_code   text        not null,
  class_id        uuid        not null,
  weekday         smallint    not null,
  starts_at       time        not null,
  spot_limit      smallint    not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint form_booking_limits_pkey primary key (id),
  constraint form_booking_limits_form_fk foreign key (form_id, location_code) references public.forms (id, location_code) on delete cascade,
  constraint form_booking_limits_class_fk foreign key (class_id, location_code) references public.testing_classes (id, location_code) on delete cascade,
  constraint form_booking_limits_key unique (form_id, class_id, weekday, starts_at),
  constraint form_booking_limits_weekday_check check (weekday between 1 and 7),
  constraint form_booking_limits_limit_check check (spot_limit between 0 and 20),
  constraint form_booking_limits_version_check check (version >= 1)
);

-- 2d. form_submissions - one row per sent form. NEVER changed afterwards
-- (a trigger refuses updates). Keeps a copy of the field list it was sent
-- with, so its answers stay readable after the form is edited.
create table if not exists public.form_submissions (
  id                uuid        not null default gen_random_uuid(),
  form_id           uuid        not null,
  location_code     text        not null,
  published_version integer     not null,
  fields            jsonb       not null,
  answers           jsonb       not null,
  parent_name       text        not null,
  parent_phone      text        not null,
  parent_email      text        not null,
  children          jsonb       not null,
  signature         text        null,
  signed_at         timestamptz null,
  entered_by        text        null,
  source            text        not null,
  submission_key    uuid        not null,
  version           integer     not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid        null,
  updated_by        uuid        null,
  created_by_name   text        not null,
  updated_by_name   text        not null,

  constraint form_submissions_pkey primary key (id),
  constraint form_submissions_id_location_key unique (id, location_code),
  constraint form_submissions_form_fk foreign key (form_id, location_code) references public.forms (id, location_code) on delete restrict,
  constraint form_submissions_key unique (form_id, submission_key),
  constraint form_submissions_source_check check (source in ('public', 'kiosk', 'staff')),
  constraint form_submissions_signature_check check (signature is null or public.forms_signature_ok(signature)),
  constraint form_submissions_signed_check check (signature is null or signed_at is not null),
  constraint form_submissions_size_check check (octet_length(answers::text) <= 20000 and octet_length(children::text) <= 2000),
  constraint form_submissions_version_check check (version >= 1)
);

create index if not exists form_submissions_form_idx on public.form_submissions (form_id, created_at);
create index if not exists form_submissions_key_idx on public.form_submissions (submission_key);
create index if not exists form_submissions_signature_idx on public.form_submissions (created_at) where signature is not null;

-- 2e. class_booking_slots - one row per class time (school, class, date,
-- start) that has ever been booked. It is the row that gets LOCKED, so
-- two families racing for the last spot take turns (review High 3).
-- Holds nothing personal; not part of the history.
create table if not exists public.class_booking_slots (
  id            uuid        not null default gen_random_uuid(),
  location_code text        not null,
  class_id      uuid        not null,
  on_date       date        not null,
  starts_at     time        not null,
  created_at    timestamptz not null default now(),

  constraint class_booking_slots_pkey primary key (id),
  constraint class_booking_slots_key unique (location_code, class_id, on_date, starts_at),
  constraint class_booking_slots_location_fk foreign key (location_code) references public.locations (code)
);

-- 2f. class_bookings - one child's free class. Keeps the class name as it
-- was (a class deleted in Testing leaves the booking, flagged, v0.145
-- answer 6). status: booked | cancelled (cancelled by staff, step 4).
create table if not exists public.class_bookings (
  id              uuid        not null default gen_random_uuid(),
  submission_id   uuid        not null,
  form_id         uuid        not null,
  location_code   text        not null,
  class_id        uuid        null,
  class_name      text        not null,
  on_date         date        not null,
  starts_at       time        not null,
  ends_at         time        not null,
  child_index     smallint    not null,
  status          text        not null default 'booked',
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint class_bookings_pkey primary key (id),
  constraint class_bookings_submission_fk foreign key (submission_id, location_code) references public.form_submissions (id, location_code) on delete cascade,
  constraint class_bookings_class_fk foreign key (class_id) references public.testing_classes (id) on delete set null,
  constraint class_bookings_child_key unique (submission_id, child_index),
  constraint class_bookings_child_check check (child_index between 0 and 5),
  constraint class_bookings_status_check check (status in ('booked', 'cancelled')),
  constraint class_bookings_time_check check (ends_at > starts_at),
  constraint class_bookings_version_check check (version >= 1)
);

create index if not exists class_bookings_date_idx on public.class_bookings (location_code, on_date);
create index if not exists class_bookings_slot_idx on public.class_bookings (location_code, class_id, on_date, starts_at) where status = 'booked';

-- 2g. form_kiosk_tokens - a token handed to a tablet when kiosk mode is
-- opened (v0.145 answer 3). Only its SHA-256 is stored. 12 hours, one form.
create table if not exists public.form_kiosk_tokens (
  id            uuid        not null default gen_random_uuid(),
  form_id       uuid        not null,
  token_hash    text        not null,
  expires_at    timestamptz not null,
  created_by    uuid        null,
  created_at    timestamptz not null default now(),

  constraint form_kiosk_tokens_pkey primary key (id),
  constraint form_kiosk_tokens_hash_key unique (token_hash),
  constraint form_kiosk_tokens_form_fk foreign key (form_id) references public.forms (id) on delete cascade
);

-- 2h. form_email_results - an email the Cloudflare Function could NOT
-- send (v0.145 answer 2: a failed email never undoes a sign-up; staff see
-- it). which: family | school.
create table if not exists public.form_email_results (
  id            uuid        not null default gen_random_uuid(),
  submission_id uuid        not null,
  location_code text        not null,
  which         text        not null,
  ok            boolean     not null,
  at            timestamptz not null default now(),

  constraint form_email_results_pkey primary key (id),
  constraint form_email_results_submission_fk foreign key (submission_id, location_code) references public.form_submissions (id, location_code) on delete cascade,
  constraint form_email_results_key unique (submission_id, which),
  constraint form_email_results_which_check check (which in ('family', 'school'))
);

-- 2h2. form_signature_views - who looked at which signature, and when
-- (security review M3: the plan says signature reads are logged). Readable
-- by nobody in the app; never holds the picture.
create table if not exists public.form_signature_views (
  id            uuid        not null default gen_random_uuid(),
  submission_id uuid        not null,
  location_code text        not null,
  viewer_id     uuid        null,
  viewer_name   text        not null,
  session_id    uuid        null,
  at            timestamptz not null default now(),

  constraint form_signature_views_pkey primary key (id),
  constraint form_signature_views_submission_fk foreign key (submission_id, location_code) references public.form_submissions (id, location_code) on delete cascade
);

create index if not exists form_signature_views_submission_idx on public.form_signature_views (submission_id, at);

-- 2i. forms_public_attempts - one row per Send on the public page, for
-- the rate limit. client_key = an HMAC the Function makes (never an IP).
-- Rows older than 2 days are removed. Not logged.
create table if not exists public.forms_public_attempts (
  id         bigint      generated always as identity,
  client_key text        not null,
  form_id    uuid        null,
  kiosk      boolean     not null default false,
  at         timestamptz not null default now(),
  outcome    text        not null,

  constraint forms_public_attempts_pkey primary key (id)
);

create index if not exists forms_public_attempts_client_idx on public.forms_public_attempts (client_key, at);
create index if not exists forms_public_attempts_form_idx on public.forms_public_attempts (form_id, at);


-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

-- 3a. forms_before_write() - bookkeeping (as 0007 / 0008): version 1 on
-- insert; a real content change bumps version and sets updated_*; id,
-- school and parent rows can never change. form_submissions can't be
-- changed at all.
create or replace function public.forms_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_bookkeeping constant text[] := array['version', 'created_at', 'updated_at', 'created_by',
                                         'updated_by', 'created_by_name', 'updated_by_name'];
begin
  if tg_op = 'INSERT' then
    new.version         := 1;
    new.created_at      := now();
    new.updated_at      := now();
    new.created_by      := auth.uid();
    new.updated_by      := auth.uid();
    new.created_by_name := public.change_log_actor_name();
    new.updated_by_name := new.created_by_name;
    return new;
  end if;

  if tg_table_name = 'form_submissions' then
    -- the ONE change ever allowed: the 90-day clean-up removing the picture
    if old.signature is not null and new.signature is null
       and (to_jsonb(new) - array['signature', 'version', 'updated_at', 'updated_by', 'updated_by_name'])
           = (to_jsonb(old) - array['signature', 'version', 'updated_at', 'updated_by', 'updated_by_name']) then
      new.version         := old.version + 1;
      new.updated_at      := now();
      new.updated_by      := auth.uid();
      new.updated_by_name := public.change_log_actor_name();
      return new;
    end if;
    raise exception using errcode = '23514', constraint = 'form_submissions_immutable',
      message = 'form_submissions: a sign-up is never changed';
  end if;

  if (to_jsonb(new) ->> 'id') is distinct from (to_jsonb(old) ->> 'id')
     or (to_jsonb(new) ->> 'location_code') is distinct from (to_jsonb(old) ->> 'location_code')
     or (to_jsonb(new) ->> 'form_id') is distinct from (to_jsonb(old) ->> 'form_id')
     or (to_jsonb(new) ->> 'submission_id') is distinct from (to_jsonb(old) ->> 'submission_id')
     or (tg_table_name in ('form_booking_offers', 'form_booking_limits')
         and (to_jsonb(new) ->> 'class_id') is distinct from (to_jsonb(old) ->> 'class_id')) then
    raise exception using errcode = '23514', constraint = tg_table_name || '_immutable',
      message = tg_table_name || ': id, school and parent can''t change';
  end if;

  new.created_at      := old.created_at;
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;

  if (to_jsonb(new) - v_bookkeeping) is distinct from (to_jsonb(old) - v_bookkeeping) then
    new.version         := old.version + 1;
    new.updated_at      := now();
    new.updated_by      := auth.uid();
    new.updated_by_name := public.change_log_actor_name();
  else
    new.version         := old.version;
    new.updated_at      := old.updated_at;
    new.updated_by      := old.updated_by;
    new.updated_by_name := old.updated_by_name;
  end if;
  return new;
end;
$$;

revoke execute on function public.forms_before_write() from public, anon, authenticated, service_role;

-- 3b. forms_submissions_log() - history of sign-ups WITHOUT the picture:
-- the same row as change_log_write (0003) writes, with "signature" as
-- "on file" / null (review Medium 6; tested: no data:image in change_log).
create or replace function public.forms_submissions_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  -- the signature is never copied: "on file" or null instead
  if tg_op <> 'INSERT' then
    v_old := (to_jsonb(old) - 'signature')
             || jsonb_build_object('signature', case when old.signature is null then null else 'on file' end);
  end if;
  if tg_op <> 'DELETE' then
    v_new := (to_jsonb(new) - 'signature')
             || jsonb_build_object('signature', case when new.signature is null then null else 'on file' end);
  end if;
  insert into public.change_log
    (actor_id, actor_name, session_id, batch_id, action, table_name, record_id, location_code, op, before, after)
  values
    (auth.uid(), public.change_log_actor_name(), public.current_session_id(),
     nullif(current_setting('tkd.batch_id', true), '')::uuid,
     coalesce(nullif(current_setting('tkd.action', true), ''), 'manual'),
     tg_table_name, (coalesce(v_new, v_old) ->> 'id')::uuid, coalesce(v_new, v_old) ->> 'location_code', lower(tg_op),
     v_old, v_new);
  return null;
end;
$$;

revoke execute on function public.forms_submissions_log() from public, anon, authenticated, service_role;

-- 3c. forms_refuse_truncate() - TRUNCATE would skip the history.
create or replace function public.forms_refuse_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% can''t be truncated (it would skip the history); remove rows one by one', tg_table_name;
end;
$$;

revoke execute on function public.forms_refuse_truncate() from public, anon, authenticated, service_role;

-- 3d. Attach.
do $$
declare
  t text;
begin
  foreach t in array array['forms', 'form_booking_offers', 'form_booking_limits', 'form_submissions', 'class_bookings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_before_write', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.forms_before_write()',
                   t || '_before_write', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.forms_refuse_truncate()',
                   t || '_no_truncate', t);
    execute format('drop trigger if exists %I on public.%I', t || '_log', t);
    if t = 'form_submissions' then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.forms_submissions_log()',
                     t || '_log', t);
    else
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.change_log_write()',
                     t || '_log', t);
    end if;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Security rules: RLS + grants
-- Read: the listed columns, only while has_data_access(). Write: nobody
-- directly. The signature, hidden keys and every internal table (slots,
-- kiosk tokens, email results, attempts) are granted to nobody.
-- ---------------------------------------------------------------------
alter table public.forms                 enable row level security;
alter table public.form_booking_offers   enable row level security;
alter table public.form_booking_limits   enable row level security;
alter table public.form_submissions      enable row level security;
alter table public.class_bookings        enable row level security;
alter table public.class_booking_slots   enable row level security;
alter table public.form_kiosk_tokens     enable row level security;
alter table public.form_email_results    enable row level security;
alter table public.forms_public_attempts enable row level security;
alter table public.form_signature_views  enable row level security;

revoke all on table public.forms, public.form_booking_offers, public.form_booking_limits, public.form_submissions,
                    public.class_bookings, public.class_booking_slots, public.form_kiosk_tokens,
                    public.form_email_results, public.forms_public_attempts, public.form_signature_views
  from public, anon, authenticated, service_role;
revoke all on sequence public.forms_public_attempts_id_seq from public, anon, authenticated, service_role;

grant select (id, location_code, name, slug, kind, status, draft, published, published_version, published_at, settings,
              version, created_at, updated_at, created_by_name, updated_by_name)
  on public.forms to authenticated;
grant select (id, form_id, location_code, class_id, default_limit, days_ahead, min_hours_ahead, version)
  on public.form_booking_offers to authenticated;
grant select (id, form_id, location_code, class_id, weekday, starts_at, spot_limit, version)
  on public.form_booking_limits to authenticated;
grant select (id, form_id, location_code, published_version, fields, answers, parent_name, parent_phone, parent_email,
              children, signed_at, entered_by, source, created_at, created_by_name)
  on public.form_submissions to authenticated;
-- (form_submissions.signature and submission_key are NOT granted.)

do $$
declare
  t text;
begin
  foreach t in array array['forms', 'form_booking_offers', 'form_booking_limits', 'form_submissions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_with_access', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.has_data_access()))',
                   t || '_select_with_access', t);
  end loop;
end;
$$;
-- class_bookings: read through forms_bookings_between (child's first name
-- only); the internal tables have RLS on and no rule = nobody.


-- ---------------------------------------------------------------------
-- 5. Free-class times (internal; security invoker)
-- ---------------------------------------------------------------------

-- 5a. forms_today_now() - Massachusetts "now" as a timestamp with zone.
-- 5b. forms_slots_on(school, date) - the time slots RUNNING that day: of
-- the schedule in effect (0007), on that weekday, not cancelled by a
-- whole-day closure or by a "some classes" record that matches exactly
-- (same day, times and classes in order - like days.js recordMatches).
create or replace function public.forms_slots_on(p_location text, p_date date)
returns table (slot_id uuid, class_ids uuid[], starts_at time, ends_at time)
language sql
stable
security invoker
set search_path = ''
as $$
  with v as (
    select sv.id from public.schedule_versions sv
     where sv.location_code = p_location and sv.starts_on <= p_date
     order by sv.starts_on desc limit 1
  ), s as (
    select sl.id, sl.starts_at, sl.ends_at,
           (select array_agg(sc.class_id order by sc.position) from public.schedule_slot_classes sc where sc.slot_id = sl.id) as class_ids
      from public.schedule_slots sl
     where sl.version_id = (select id from v)
       and sl.weekday = extract(isodow from p_date)::smallint
  )
  select s.id, s.class_ids, s.starts_at, s.ends_at
    from s
   where s.class_ids is not null
     and not exists (select 1 from public.calendar_closures c
                      where c.whole_day and c.starts_on <= p_date and c.ends_on >= p_date
                        and (c.location_code is null or c.location_code = p_location))
     and not exists (select 1 from public.calendar_closures c
                       join public.calendar_closure_classes x on x.closure_id = c.id
                      where not c.whole_day and c.starts_on = p_date
                        and (c.location_code is null or c.location_code = p_location)
                        and x.location_code = p_location
                        and x.weekday = extract(isodow from p_date)::smallint
                        and x.starts_at = s.starts_at and x.ends_at = s.ends_at
                        and x.class_ids = s.class_ids);
$$;

revoke execute on function public.forms_slots_on(text, date) from public, anon, authenticated, service_role;

-- 5c. forms_spot_limit(form, school, class, date, start) - the limit of a
-- class time ON THIS FORM: this form's own limit (its time limit, else its
-- default); 0 = this form doesn't offer that time. Shared with every other
-- LIVE form that still has a booking field and offers it (v0.145 answer 5:
-- the lowest wins) - but another form's 0 only means "not on that form"
-- and is left out (security review M2). null = this form doesn't offer the
-- class.
create or replace function public.forms_spot_limit(p_form_id uuid, p_location text, p_class uuid, p_date date, p_start time)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  with own as (
    select coalesce(l.spot_limit, o.default_limit)::integer as lim
      from public.form_booking_offers o
      left join public.form_booking_limits l
        on l.form_id = o.form_id and l.class_id = o.class_id
       and l.weekday = extract(isodow from p_date)::smallint and l.starts_at = p_start
     where o.form_id = p_form_id and o.class_id = p_class and o.location_code = p_location
  ), others as (
    select coalesce(l.spot_limit, o.default_limit)::integer as lim
      from public.form_booking_offers o
      join public.forms f on f.id = o.form_id
      left join public.form_booking_limits l
        on l.form_id = o.form_id and l.class_id = o.class_id
       and l.weekday = extract(isodow from p_date)::smallint and l.starts_at = p_start
     where o.location_code = p_location and o.class_id = p_class and o.form_id <> p_form_id
       and f.status = 'live'
       and exists (select 1 from jsonb_array_elements(f.published) e where e ->> 'type' = 'booking')
       and coalesce(l.spot_limit, o.default_limit) > 0
  )
  select case
           when (select lim from own) is null then null
           when (select lim from own) = 0 then 0
           else least((select lim from own), (select min(lim) from others))
         end;
$$;

revoke execute on function public.forms_spot_limit(uuid, text, uuid, date, time) from public, anon, authenticated, service_role;

-- 5d. forms_times(form, from, to) - the free-class times this form shows
-- now: for each offered class, each day of its window (from today, at most
-- days_ahead days; within from..to), each running slot of that class,
-- not sooner than min_hours_ahead, with spots left > 0 (shared count over
-- all forms, v0.145 answer 5). Massachusetts dates and times.
create or replace function public.forms_times(p_form_id uuid, p_from date, p_to date)
returns table (class_id uuid, class_name text, on_date date, starts_at time, ends_at time, spots_left integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with f as (
    select fo.id, fo.location_code from public.forms fo where fo.id = p_form_id
  ), o as (
    select bo.class_id, bo.days_ahead, bo.min_hours_ahead, c.name as class_name
      from public.form_booking_offers bo
      join public.testing_classes c on c.id = bo.class_id
     where bo.form_id = p_form_id
  ), d as (
    select o.*, gs::date as on_date
      from o, generate_series(greatest(p_from, public.schedule_today()),
                              least(p_to, public.schedule_today() + o.days_ahead - 1), interval '1 day') as gs
  ), t as (
    select d.class_id, d.class_name, d.on_date, s.starts_at, s.ends_at, d.min_hours_ahead
      from d, f, public.forms_slots_on(f.location_code, d.on_date) s
     where d.class_id = any (s.class_ids)
  ), c as (
    select t.*,
           public.forms_spot_limit(p_form_id, (select location_code from f), t.class_id, t.on_date, t.starts_at) as lim,
           (select count(*) from public.class_bookings b
             where b.location_code = (select location_code from f) and b.class_id = t.class_id
               and b.on_date = t.on_date and b.starts_at = t.starts_at and b.status = 'booked')::integer as used
      from t
     where ((t.on_date + t.starts_at) at time zone 'America/New_York')
           >= clock_timestamp() + make_interval(hours => t.min_hours_ahead)
  )
  select c.class_id, c.class_name, c.on_date, c.starts_at, c.ends_at, (c.lim - c.used)::integer
    from c
   where c.lim is not null and c.lim - c.used > 0
   order by c.on_date, c.starts_at, c.class_name;
$$;

revoke execute on function public.forms_times(uuid, date, date) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 6. Checking a sign-up (internal)
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
    v_visible := v_si is null or jsonb_typeof(v_si) = 'null'
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

-- 6a2. forms_submission_answer(id, repeat) - what a Send answers: the
-- sign-up id and its booked times (the same for a repeated Send).
create or replace function public.forms_submission_answer(p_id uuid, p_repeat boolean)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('status', 'ok', 'id', p_id, 'repeat', p_repeat,
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('child', b.child_index, 'class_name', b.class_name,
                                                              'date', b.on_date, 'starts_at', to_char(b.starts_at, 'HH24:MI'),
                                                              'ends_at', to_char(b.ends_at, 'HH24:MI')) order by b.child_index)
                            from public.class_bookings b where b.submission_id = p_id), '[]'::jsonb));
$$;

revoke execute on function public.forms_submission_answer(uuid, boolean) from public, anon, authenticated, service_role;

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
  for v_b in
    select (b ->> 'child')::smallint as child, (b ->> 'class_id')::uuid as class_id,
           (b ->> 'date')::date as on_date, (b ->> 'starts_at')::time as starts_at
      from jsonb_array_elements(p_bookings) b
     order by (b ->> 'class_id'), (b ->> 'date'), (b ->> 'starts_at')
  loop
    insert into public.class_booking_slots (location_code, class_id, on_date, starts_at)
    values (v_form.location_code, v_b.class_id, v_b.on_date, v_b.starts_at)
    on conflict (location_code, class_id, on_date, starts_at) do nothing;
    select s.id into v_slot from public.class_booking_slots s
     where s.location_code = v_form.location_code and s.class_id = v_b.class_id
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


-- 6c. forms_purge_old_signatures() - removes the signature PICTURE of
-- every sign-up whose free class was more than 90 days ago (the latest
-- booked date), or that was signed more than 90 days ago without a free
-- class (Jeffrey, 2026-10-18). The sign-up keeps signed_at ("Signed on
-- <date>"). No pg_cron needed: it runs inside the functions that are
-- already called (the public Send, staff Fill in, reading a signature),
-- like Color Belt's 0005. Logged as "Signature clean-up".
create or replace function public.forms_purge_old_signatures()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_n integer;
  v_label text := current_setting('tkd.actor_label', true);
  v_action text := current_setting('tkd.action', true);
begin
  perform set_config('tkd.actor_label', 'Signature clean-up', true);
  perform set_config('tkd.action', 'forms_purge_signatures', true);
  update public.form_submissions s
     set signature = null
   where s.signature is not null
     and coalesce((select max(b.on_date) from public.class_bookings b where b.submission_id = s.id),
                  (s.signed_at at time zone 'America/New_York')::date) + 90 < public.schedule_today();
  get diagnostics v_n = row_count;
  perform set_config('tkd.actor_label', coalesce(v_label, ''), true);
  perform set_config('tkd.action', coalesce(v_action, ''), true);
  return v_n;
end;
$$;

revoke execute on function public.forms_purge_old_signatures() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Staff functions (security definer; the usual pattern: has_data_access
-- FIRST, then admin where needed, then input, then locks, then writes)
-- Statuses: ok, no_access, not_allowed, invalid, not_found, stale,
-- duplicate_slug, not_publishable, closed, form_changed, time_taken
-- ---------------------------------------------------------------------

-- 7a. forms_create(school, kind, name, slug) - a new Draft from a template.
create or replace function public.forms_create(p_location_code text, p_kind text, p_name text, p_slug text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_version integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_location_code is null or not exists (select 1 from public.locations l where l.code = p_location_code)
       or p_kind is null or p_kind not in ('free_class', 'walk_in', 'event', 'blank')
       or not public.calendar_text_is_valid(p_name, 80)
       or not public.forms_slug_ok(p_slug) then
      return jsonb_build_object('status', 'invalid');
    end if;
    perform 1 from public.locations l where l.code = p_location_code for no key update;
    if exists (select 1 from public.forms f where f.slug = p_slug) then
      return jsonb_build_object('status', 'duplicate_slug');
    end if;
    perform set_config('tkd.action', 'forms_create', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.forms (location_code, name, slug, kind, draft, settings)
    values (p_location_code, public.testing_normalize_name(p_name), p_slug, p_kind, public.forms_template(p_kind),
            jsonb_build_object('thank_you', 'Thank you, {parent}! We''ll see you soon.', 'alert_email', null,
                               'confirm_email', true, 'add_to_calendar', true))
    returning id, version into v_id, v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      return jsonb_build_object('status', case when v_constraint = 'forms_slug_key' then 'duplicate_slug' else 'stale' end);
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.forms_create(text, text, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.forms_create(text, text, text, text) to authenticated;

-- 7b. forms_save_draft(form, expected version, name, slug, draft, settings)
-- "Saves as you go". Families see nothing until Publish.
create or replace function public.forms_save_draft(p_form_id uuid, p_expected_version integer, p_name text, p_slug text,
                                                   p_draft jsonb, p_settings jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc text;
  v_version integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_form_id is null or p_expected_version is null
       or not public.calendar_text_is_valid(p_name, 80) or not public.forms_slug_ok(p_slug)
       or not public.forms_fields_are_valid(p_draft) or not public.forms_settings_are_valid(p_settings) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select f.location_code into v_loc from public.forms f where f.id = p_form_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    perform 1 from public.locations l where l.code = v_loc for no key update;
    select f.version into v_version from public.forms f where f.id = p_form_id for update;
    if v_version <> p_expected_version then return jsonb_build_object('status', 'stale'); end if;
    if exists (select 1 from public.forms f where f.slug = p_slug and f.id <> p_form_id) then
      return jsonb_build_object('status', 'duplicate_slug');
    end if;
    perform set_config('tkd.action', 'forms_save_draft', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.forms f
       set name = public.testing_normalize_name(p_name), slug = p_slug, draft = p_draft, settings = p_settings
     where f.id = p_form_id
    returning f.version into v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_form_id, 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      return jsonb_build_object('status', case when v_constraint = 'forms_slug_key' then 'duplicate_slug' else 'stale' end);
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.forms_save_draft(uuid, integer, text, text, jsonb, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.forms_save_draft(uuid, integer, text, text, jsonb, jsonb) to authenticated;

-- 7c. forms_publish(form, expected version) - copies the draft to what
-- families see. A Draft becomes Live; a Closed form stays Closed. An empty
-- waiver -> not_publishable (v0.145 answer 4).
create or replace function public.forms_publish(p_form_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f record;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_form_id is null or p_expected_version is null then return jsonb_build_object('status', 'invalid'); end if;
    select f.* into v_f from public.forms f where f.id = p_form_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    perform 1 from public.locations l where l.code = v_f.location_code for no key update;
    select f.* into v_f from public.forms f where f.id = p_form_id for update;
    if v_f.version <> p_expected_version then return jsonb_build_object('status', 'stale'); end if;
    if not public.forms_fields_publishable(v_f.draft) then
      return jsonb_build_object('status', 'not_publishable');
    end if;
    perform set_config('tkd.action', 'forms_publish', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.forms f
       set published = f.draft,
           published_version = f.published_version + 1,
           published_at = now(),
           status = case when f.status = 'draft' then 'live' else f.status end
     where f.id = p_form_id
    returning f.version into v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_form_id, 'version', v_version);
  exception
    when unique_violation then return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.forms_publish(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.forms_publish(uuid, integer) to authenticated;

-- 7d. forms_set_status(form, expected version, status) - Live / Closed
-- (back to Draft is not offered once published). Live needs a published
-- version.
create or replace function public.forms_set_status(p_form_id uuid, p_expected_version integer, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f record;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_form_id is null or p_expected_version is null or p_status is null or p_status not in ('live', 'closed') then
      return jsonb_build_object('status', 'invalid');
    end if;
    select f.* into v_f from public.forms f where f.id = p_form_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    perform 1 from public.locations l where l.code = v_f.location_code for no key update;
    select f.* into v_f from public.forms f where f.id = p_form_id for update;
    if v_f.version <> p_expected_version then return jsonb_build_object('status', 'stale'); end if;
    if v_f.published is null then return jsonb_build_object('status', 'not_publishable'); end if;
    perform set_config('tkd.action', 'forms_set_status', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.forms f set status = p_status where f.id = p_form_id returning f.version into v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_form_id, 'version', v_version);
  exception
    when unique_violation then return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.forms_set_status(uuid, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.forms_set_status(uuid, integer, text) to authenticated;

-- 7e. forms_duplicate(form) - a Draft copy with "Copy of" and a free slug,
-- including its booking settings. No sign-ups are copied.
create or replace function public.forms_duplicate(p_form_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f record;
  v_id uuid;
  v_version integer;
  v_slug text;
  v_i integer := 1;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_form_id is null then return jsonb_build_object('status', 'invalid'); end if;
    select f.* into v_f from public.forms f where f.id = p_form_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    perform 1 from public.locations l where l.code = v_f.location_code for no key update;
    loop
      v_slug := left(v_f.slug, 33) || '-copy' || case when v_i = 1 then '' else v_i::text end;
      exit when not exists (select 1 from public.forms f where f.slug = v_slug);
      v_i := v_i + 1;
      if v_i > 50 then return jsonb_build_object('status', 'duplicate_slug'); end if;
    end loop;
    perform set_config('tkd.action', 'forms_duplicate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.forms (location_code, name, slug, kind, draft, settings, booking_key)
    values (v_f.location_code, public.testing_normalize_name(left('Copy of ' || v_f.name, 80)), v_slug, v_f.kind, v_f.draft, v_f.settings, v_f.booking_key)
    returning id, version into v_id, v_version;
    insert into public.form_booking_offers (form_id, location_code, class_id, default_limit, days_ahead, min_hours_ahead)
    select v_id, o.location_code, o.class_id, o.default_limit, o.days_ahead, o.min_hours_ahead
      from public.form_booking_offers o where o.form_id = p_form_id;
    insert into public.form_booking_limits (form_id, location_code, class_id, weekday, starts_at, spot_limit)
    select v_id, l.location_code, l.class_id, l.weekday, l.starts_at, l.spot_limit
      from public.form_booking_limits l where l.form_id = p_form_id;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version, 'slug', v_slug);
  exception
    when unique_violation then return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.forms_duplicate(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.forms_duplicate(uuid) to authenticated;

-- 7f. forms_delete(form, expected version) - only a form with NO sign-ups
-- (otherwise Close it: every sign-up keeps its source form). Its booking
-- settings and kiosk tokens go with it.
create or replace function public.forms_delete(p_form_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f record;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_form_id is null or p_expected_version is null then return jsonb_build_object('status', 'invalid'); end if;
    select f.* into v_f from public.forms f where f.id = p_form_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    perform 1 from public.locations l where l.code = v_f.location_code for no key update;
    select f.* into v_f from public.forms f where f.id = p_form_id for update;
    if v_f.version <> p_expected_version then return jsonb_build_object('status', 'stale'); end if;
    if exists (select 1 from public.form_submissions s where s.form_id = p_form_id) then
      return jsonb_build_object('status', 'not_allowed', 'reason', 'has_signups');
    end if;
    perform set_config('tkd.action', 'forms_delete', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    delete from public.forms f where f.id = p_form_id;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok');
  exception
    when foreign_key_violation then return jsonb_build_object('status', 'not_allowed', 'reason', 'has_signups');
    when unique_violation then return jsonb_build_object('status', 'stale');
    when check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.forms_delete(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.forms_delete(uuid, integer) to authenticated;

-- 7g. forms_set_booking(form, expected version, offers, limits) - the
-- "Book a class" settings (mockup screen 4). Replaces the form's lists:
--   offers: [{ "class_id", "default_limit" 1-20, "days_ahead" 1-60, "min_hours_ahead" 0-72 }]  (0-30)
--   limits: [{ "class_id" (offered), "weekday" 1-7, "starts_at" "HH:MM", "spot_limit" 0-20 }]   (0-200)
-- Classes must be of the form's school.
create or replace function public.forms_set_booking(p_form_id uuid, p_expected_version integer, p_offers jsonb, p_limits jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f record;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_form_id is null or p_expected_version is null
       or p_offers is null or jsonb_typeof(p_offers) <> 'array' or jsonb_array_length(p_offers) > 30
       or p_limits is null or jsonb_typeof(p_limits) <> 'array' or jsonb_array_length(p_limits) > 200
       or exists (select 1 from jsonb_array_elements(p_offers) o
                   where jsonb_typeof(o) <> 'object'
                      or exists (select 1 from jsonb_object_keys(o) k where k not in ('class_id', 'default_limit', 'days_ahead', 'min_hours_ahead'))
                      or coalesce(o ->> 'class_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      or coalesce(o ->> 'default_limit', '') !~ '^\d{1,2}$' or (o ->> 'default_limit')::integer not between 1 and 20
                      or coalesce(o ->> 'days_ahead', '') !~ '^\d{1,2}$' or (o ->> 'days_ahead')::integer not between 1 and 60
                      or coalesce(o ->> 'min_hours_ahead', '') !~ '^\d{1,2}$' or (o ->> 'min_hours_ahead')::integer not between 0 and 72)
       or (select count(distinct o ->> 'class_id') from jsonb_array_elements(p_offers) o) <> jsonb_array_length(p_offers)
       or exists (select 1 from jsonb_array_elements(p_limits) l
                   where jsonb_typeof(l) <> 'object'
                      or exists (select 1 from jsonb_object_keys(l) k where k not in ('class_id', 'weekday', 'starts_at', 'spot_limit'))
                      or not exists (select 1 from jsonb_array_elements(p_offers) o where o ->> 'class_id' = l ->> 'class_id')
                      or coalesce(l ->> 'weekday', '') !~ '^[1-7]$'
                      or coalesce(l ->> 'starts_at', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
                      or coalesce(l ->> 'spot_limit', '') !~ '^\d{1,2}$' or (l ->> 'spot_limit')::integer not between 0 and 20)
       or (select count(distinct (l ->> 'class_id') || (l ->> 'weekday') || (l ->> 'starts_at')) from jsonb_array_elements(p_limits) l)
          <> jsonb_array_length(p_limits) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select f.* into v_f from public.forms f where f.id = p_form_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    perform 1 from public.locations l where l.code = v_f.location_code for no key update;
    select f.* into v_f from public.forms f where f.id = p_form_id for update;
    if v_f.version <> p_expected_version then return jsonb_build_object('status', 'stale'); end if;
    if exists (select 1 from jsonb_array_elements(p_offers) o
                where not exists (select 1 from public.testing_classes c
                                   where c.id = (o ->> 'class_id')::uuid and c.location_code = v_f.location_code)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    perform set_config('tkd.action', 'forms_set_booking', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    delete from public.form_booking_limits l where l.form_id = p_form_id;
    delete from public.form_booking_offers o where o.form_id = p_form_id;
    insert into public.form_booking_offers (form_id, location_code, class_id, default_limit, days_ahead, min_hours_ahead)
    select p_form_id, v_f.location_code, (o ->> 'class_id')::uuid, (o ->> 'default_limit')::smallint,
           (o ->> 'days_ahead')::smallint, (o ->> 'min_hours_ahead')::smallint
      from jsonb_array_elements(p_offers) o;
    insert into public.form_booking_limits (form_id, location_code, class_id, weekday, starts_at, spot_limit)
    select p_form_id, v_f.location_code, (l ->> 'class_id')::uuid, (l ->> 'weekday')::smallint,
           (l ->> 'starts_at')::time, (l ->> 'spot_limit')::smallint
      from jsonb_array_elements(p_limits) l;
    update public.forms f set booking_key = md5(p_offers::text || '|' || p_limits::text)
     where f.id = p_form_id
    returning f.version into v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_form_id, 'version', v_version);
  exception
    when unique_violation then return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.forms_set_booking(uuid, integer, jsonb, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.forms_set_booking(uuid, integer, jsonb, jsonb) to authenticated;

-- 7h. forms_staff_submit(form, key, version, answers, children, bookings,
-- signature) - "Fill in for a family" (staff and admins). Same checks as
-- the public page, no spam check; "Entered by" = the signed-in staff
-- member's name.
create or replace function public.forms_staff_submit(p_form_id uuid, p_submission_key uuid, p_published_version integer,
                                                     p_answers jsonb, p_children jsonb, p_bookings jsonb, p_signature text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_form_id is null or p_submission_key is null then return jsonb_build_object('status', 'invalid'); end if;
  perform public.forms_purge_old_signatures();
  begin
    perform set_config('tkd.action', 'forms_staff_submit', true);
    v_result := public.forms_submit_core(p_form_id, p_submission_key, p_published_version, p_answers, p_children,
                                         p_bookings, p_signature, 'staff', public.change_log_actor_name());
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
  exception
    when sqlstate 'TKD01' then v_result := jsonb_build_object('status', 'time_taken');
    when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then v_result := jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then v_result := jsonb_build_object('status', 'stale');
  end;
  return v_result;
end;
$$;

revoke execute on function public.forms_staff_submit(uuid, uuid, integer, jsonb, jsonb, jsonb, text) from public, anon, authenticated, service_role;
grant  execute on function public.forms_staff_submit(uuid, uuid, integer, jsonb, jsonb, jsonb, text) to authenticated;

-- 7i. forms_open_times(form, from, to) - the times families would see now
-- (builder preview and "Fill in"). Staff and admins.
-- Ok: {"status":"ok","times":[{class_id,class_name,date,starts_at,ends_at,spots_left}]}
create or replace function public.forms_open_times(p_form_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_form_id is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not exists (select 1 from public.forms f where f.id = p_form_id) then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'ok', 'times', coalesce((
    select jsonb_agg(jsonb_build_object('class_id', t.class_id, 'class_name', t.class_name, 'date', t.on_date,
                                        'starts_at', to_char(t.starts_at, 'HH24:MI'), 'ends_at', to_char(t.ends_at, 'HH24:MI'),
                                        'spots_left', t.spots_left))
      from public.forms_times(p_form_id, p_from, p_to) t), '[]'::jsonb));
end;
$$;

revoke execute on function public.forms_open_times(uuid, date, date) from public, anon, authenticated, service_role;
grant  execute on function public.forms_open_times(uuid, date, date) to authenticated;

-- 7j. forms_bookings_between(school or null, from, to) - free-class
-- bookings for the Calendar (v0.138): the child's FIRST name only, class,
-- time, form, status, and whether that class still runs then (false = the
-- amber "Class cancelled — call the family", v0.145 answer 6).
create or replace function public.forms_bookings_between(p_location_code text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62
     or (p_location_code is not null and not exists (select 1 from public.locations l where l.code = p_location_code)) then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'bookings', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'location_code', b.location_code, 'class_id', b.class_id, 'class_name', b.class_name,
             'date', b.on_date, 'starts_at', to_char(b.starts_at, 'HH24:MI'), 'ends_at', to_char(b.ends_at, 'HH24:MI'),
             'child_first_name', s.children -> (b.child_index::integer) ->> 'first_name',
             'form_id', b.form_id, 'form_name', f.name, 'status', b.status,
             'class_running', exists (select 1 from public.forms_slots_on(b.location_code, b.on_date) x
                                       where b.class_id = any (x.class_ids) and x.starts_at = b.starts_at))
             order by b.on_date, b.starts_at)
      from public.class_bookings b
      join public.form_submissions s on s.id = b.submission_id
      join public.forms f on f.id = b.form_id
     where b.on_date between p_from and p_to
       and (p_location_code is null or b.location_code = p_location_code)), '[]'::jsonb));
end;
$$;

revoke execute on function public.forms_bookings_between(text, date, date) from public, anon, authenticated, service_role;
grant  execute on function public.forms_bookings_between(text, date, date) to authenticated;

-- 7k. forms_submission_signature(submission) - the signature picture of
-- ONE sign-up (the column itself is granted to nobody, review Medium 6).
-- Every read is recorded in form_signature_views (who, when, which).
create or replace function public.forms_submission_signature(p_submission_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sig text;
  v_loc text;
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_submission_id is null then return jsonb_build_object('status', 'invalid'); end if;
  perform public.forms_purge_old_signatures();   -- an old picture is never shown
  select s.signature, s.location_code into v_sig, v_loc from public.form_submissions s where s.id = p_submission_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  insert into public.form_signature_views (submission_id, location_code, viewer_id, viewer_name, session_id)
  values (p_submission_id, v_loc, auth.uid(), public.change_log_actor_name(), public.current_session_id());
  return jsonb_build_object('status', 'ok', 'signature', v_sig,
                            'signed_at', (select s.signed_at from public.form_submissions s where s.id = p_submission_id));
end;
$$;

revoke execute on function public.forms_submission_signature(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.forms_submission_signature(uuid) to authenticated;

-- 7l. forms_kiosk_token(form) - "Open kiosk mode on this device" (v0.145
-- answer 3): a one-form token, 12 hours, that raises the public page's
-- rate limit for that tablet. Only its SHA-256 is kept. The app then locks
-- the dashboard on that device (Lock now). Staff and admins; Live forms.
create or replace function public.forms_kiosk_token(p_form_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_form_id is null then return jsonb_build_object('status', 'invalid'); end if;
  if not exists (select 1 from public.forms f where f.id = p_form_id and f.status = 'live') then
    return jsonb_build_object('status', 'not_found');
  end if;
  delete from public.form_kiosk_tokens t where t.expires_at < now();
  -- at most 5 live tokens per form: the oldest go first (review L4)
  delete from public.form_kiosk_tokens t
   where t.form_id = p_form_id
     and t.id not in (select k.id from public.form_kiosk_tokens k where k.form_id = p_form_id order by k.created_at desc limit 4);
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.form_kiosk_tokens (form_id, token_hash, expires_at, created_by)
  values (p_form_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '12 hours', auth.uid());
  return jsonb_build_object('status', 'ok', 'token', v_token, 'expires_in_hours', 12);
end;
$$;

revoke execute on function public.forms_kiosk_token(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.forms_kiosk_token(uuid) to authenticated;


-- 7m. forms_kiosk_revoke(form) - end kiosk mode on every tablet for this
-- form (a lost or stolen tablet). Staff and admins.
create or replace function public.forms_kiosk_revoke(p_form_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_form_id is null then return jsonb_build_object('status', 'invalid'); end if;
  delete from public.form_kiosk_tokens t where t.form_id = p_form_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('status', 'ok', 'revoked', v_n);
end;
$$;

revoke execute on function public.forms_kiosk_revoke(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.forms_kiosk_revoke(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 8. The restricted login for the public page: forms_registrar
-- Same pattern as Color Belt's testing_registrar (0005 section 13): the
-- Cloudflare Function signs in as it (its own Hyperdrive config,
-- HYPERDRIVE_FORMS) and can run exactly the three functions of section 9.
-- No rights on any table, can't create anything, member of nothing.
-- Created only if missing and WITHOUT a password (set at F6), so re-running
-- never touches an existing role.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'forms_registrar') then
    create role forms_registrar login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5;
  end if;
end;
$$;

alter role forms_registrar set statement_timeout = '5s';
alter role forms_registrar set idle_in_transaction_session_timeout = '10s';
alter role forms_registrar set search_path = '';
grant usage on schema public to forms_registrar;


-- ---------------------------------------------------------------------
-- 9. The public functions (role forms_registrar ONLY)
-- ---------------------------------------------------------------------

-- 9a. forms_public_get(slug) - what the public page needs, a FIXED short
-- list (review Low 13): the published fields + version, the school's name
-- (and phone, when Settings -> Schools has one), the thank-you text and
-- Add-to-calendar switch, and the open times with spots left. Never the
-- school's alert email or anything staff-only.
create or replace function public.forms_public_get(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_f record;
  v_school jsonb;
begin
  if p_slug is null or not public.forms_slug_ok(p_slug) then return jsonb_build_object('status', 'not_found'); end if;
  select f.* into v_f from public.forms f where f.slug = p_slug;
  if not found or v_f.status = 'draft' or v_f.published is null then return jsonb_build_object('status', 'not_found'); end if;
  select to_jsonb(l) into v_school from public.locations l where l.code = v_f.location_code;
  if v_f.status = 'closed' then
    return jsonb_build_object('status', 'closed', 'school_name', v_school ->> 'name', 'school_phone', v_school ->> 'phone');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'form_name', v_f.name,
    'fields', v_f.published,
    'published_version', v_f.published_version,
    'school_name', v_school ->> 'name',
    'school_phone', v_school ->> 'phone',
    'thank_you', v_f.settings ->> 'thank_you',
    'add_to_calendar', (v_f.settings -> 'add_to_calendar'),
    'times', coalesce((
      select jsonb_agg(jsonb_build_object('class_id', t.class_id, 'class_name', t.class_name, 'date', t.on_date,
                                          'starts_at', to_char(t.starts_at, 'HH24:MI'), 'ends_at', to_char(t.ends_at, 'HH24:MI'),
                                          'spots_left', t.spots_left))
        from public.forms_times(v_f.id, public.schedule_today(), public.schedule_today() + 60) t), '[]'::jsonb));
end;
$$;

revoke execute on function public.forms_public_get(text) from public, anon, authenticated, service_role;
grant  execute on function public.forms_public_get(text) to forms_registrar;

-- 9b. forms_public_submit(slug, client_key, submission_key,
--      published_version, answers, children, bookings, signature, kiosk_token)
--   * forgets any login token the caller might have set (a public sign-up
--     can never look like a staff member's), clears attempts older than 2
--     days
--   * rate limit: 20 sends per hour per client key; 120 with a valid kiosk
--     token for this form; more than 300 per hour for one form is only
--     logged (a flood)
--   * runs forms_submit_core (source 'kiosk' with a valid token, else
--     'public'); a table rule that still says no undoes it -> invalid
--   * THEN writes this call's attempt row - outside the part that can be
--     undone, so every call counts
-- Ok: {"status":"ok","id","bookings":[...]}
create or replace function public.forms_public_submit(
  p_slug              text,
  p_client_key        text,
  p_submission_key    uuid,
  p_published_version integer,
  p_answers           jsonb,
  p_children          jsonb,
  p_bookings          jsonb,
  p_signature         text,
  p_kiosk_token       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_form_id uuid;
  v_kiosk   boolean := false;
  v_limit   integer;
  v_n       integer;
  v_result  jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.forms_public_attempts a where a.at < now() - interval '2 days';

  if p_client_key is null or char_length(p_client_key) not between 1 and 200 or p_submission_key is null
     or p_slug is null or not public.forms_slug_ok(p_slug) then
    v_result := jsonb_build_object('status', 'invalid');
  else
    select f.id into v_form_id from public.forms f where f.slug = p_slug;
    -- one client key at a time, so the count below can't be overtaken (review L5)
    perform pg_advisory_xact_lock(hashtext('forms_public:' || p_client_key));
    if p_kiosk_token is not null and char_length(p_kiosk_token) <> 64 then
      v_result := jsonb_build_object('status', 'invalid');
    elsif p_kiosk_token is not null and v_form_id is not null then
      v_kiosk := exists (select 1 from public.form_kiosk_tokens t
                          where t.form_id = v_form_id and t.expires_at > now()
                            and t.token_hash = encode(extensions.digest(p_kiosk_token, 'sha256'), 'hex'));
      if not v_kiosk then
        v_result := jsonb_build_object('status', 'invalid');   -- a wrong or old kiosk token
      end if;
    end if;
    if v_result is null then
      select count(*) into v_n from public.forms_public_attempts a
       where a.client_key = p_client_key and a.at > now() - interval '1 hour';
      v_limit := case when v_kiosk then 120 else 20 end;
      if v_n >= v_limit then
        v_result := jsonb_build_object('status', 'rate_limited');
      end if;
    end if;
    if v_result is null and v_form_id is not null then
      select count(*) into v_n from public.forms_public_attempts a
       where a.form_id = v_form_id and a.at > now() - interval '1 hour';
      if v_n >= 300 then
        raise log 'forms_public_submit: form % had % sends in the last hour', v_form_id, v_n;
      end if;
    end if;
    if v_result is null and v_form_id is null then
      v_result := jsonb_build_object('status', 'not_found');
    end if;
    if v_result is null then
      begin
        perform set_config('tkd.actor_label', case when v_kiosk then 'Kiosk' else 'Family form' end, true);
        perform set_config('tkd.action', 'forms_public_submit', true);
        v_result := public.forms_submit_core(v_form_id, p_submission_key, p_published_version, p_answers, p_children,
                                             p_bookings, p_signature, case when v_kiosk then 'kiosk' else 'public' end, null);
      exception
        when sqlstate 'TKD01' then v_result := jsonb_build_object('status', 'time_taken');
        when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then v_result := jsonb_build_object('status', 'invalid');
        when deadlock_detected or serialization_failure or lock_not_available then v_result := jsonb_build_object('status', 'invalid');
      end;
      perform set_config('tkd.actor_label', '', true);
      perform set_config('tkd.action', '', true);
      perform set_config('tkd.batch_id', '', true);
    end if;
  end if;

  insert into public.forms_public_attempts (client_key, form_id, kiosk, outcome)
  values (coalesce(left(p_client_key, 200), ''), v_form_id, v_kiosk, coalesce(v_result ->> 'status', 'invalid'));

  perform public.forms_purge_old_signatures();

  if v_result ->> 'status' = 'time_taken' and v_form_id is not null then
    v_result := v_result || jsonb_build_object('times', coalesce((
      select jsonb_agg(jsonb_build_object('class_id', t.class_id, 'class_name', t.class_name, 'date', t.on_date,
                                          'starts_at', to_char(t.starts_at, 'HH24:MI'), 'ends_at', to_char(t.ends_at, 'HH24:MI'),
                                          'spots_left', t.spots_left))
        from public.forms_times(v_form_id, public.schedule_today(), public.schedule_today() + 60) t), '[]'::jsonb));
  end if;
  return v_result;
end;
$$;

revoke execute on function public.forms_public_submit(text, text, uuid, integer, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.forms_public_submit(text, text, uuid, integer, jsonb, jsonb, jsonb, text, text) to forms_registrar;

-- 9c. forms_public_email_result(slug, submission_key, which, ok) - the
-- Function reports an email it could not send (v0.145 answer 2). Only the
-- form the key belongs to; one row per (sign-up, which).
create or replace function public.forms_public_email_result(p_slug text, p_submission_key uuid, p_which text, p_ok boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s record;
begin
  perform set_config('request.jwt.claims', '', true);
  if p_slug is null or p_submission_key is null or p_which is null or p_which not in ('family', 'school') or p_ok is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  select s.id, s.location_code into v_s
    from public.form_submissions s join public.forms f on f.id = s.form_id
   where f.slug = p_slug and s.submission_key = p_submission_key;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  insert into public.form_email_results (submission_id, location_code, which, ok)
  values (v_s.id, v_s.location_code, p_which, p_ok)
  on conflict (submission_id, which) do update set ok = excluded.ok, at = now();
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.forms_public_email_result(text, uuid, text, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.forms_public_email_result(text, uuid, text, boolean) to forms_registrar;

commit;
