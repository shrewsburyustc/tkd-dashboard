-- =====================================================================
-- 0031u_undo_class_ages.sql   (UNDO of migration 0031)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0031 (class ages on the booking forms, rulebook
--   v0.619, and classes taught together as one time, v0.620) back out:
--     1. puts back the exact earlier versions of the ten functions 0031
--        replaced, copied word for word with their exact rights:
--          schedule_before_write  from 0007 (section 6a)
--          forms_open_times       from 0009 (section 7i)
--          forms_public_get       from 0009 (section 9a)
--          forms_public_submit    from 0009 (section 9b)
--          prospects_open_times   from 0012 (section 8a; rights as
--                                 0012's section 11 loop gives them)
--          forms_times            from 0009 (section 5d; 0031's has more
--                                 columns, so it is dropped first)
--          forms_submit_core      from 0009 (section 6b)
--          forms_duplicate        from 0009 (section 7e)
--          forms_set_booking      from 0009 (section 7g, 4 arguments;
--                                 0031's 5-argument one is dropped)
--          prospects_book_time    from 0012 (section 8b; rights as
--                                 0012's section 11 loop gives them)
--        so the class times no longer carry "class_ids", "age_from" /
--        "age_to", and classes taught together are single times again;
--     2. removes schedule_set_class_ages, forms_booking_lock_class and
--        forms_group_class_ids_ok;
--     3. removes the tables public.schedule_class_ages WITH every age
--        range admins entered, and public.form_booking_group_limits WITH
--        every combined time's spot number (their history rows stay in
--        change_log, so the values can be read back and re-entered).
--        Bookings already made for a combined time stay, under its first
--        class, with the joined name ("White + Little Tiger").
--   The app version that shows ages and combined times must NOT be live
--   when this runs (it would fail to load the Schedule's ages and would
--   send p_groups to forms_set_booking).
--
-- WHY A SEPARATE FILE
--   Re-running 0007 / 0009 / 0012 would also put the old functions back,
--   but it re-runs everything else in those files too. This touches only
--   what 0031 made or replaced. Paste it ONLY with Jeffrey's OK
--   (supabase/SETUP.md, Migration 0031, 0031e).
--
-- AFTERWARDS
--   0007's, 0009's and 0012's fingerprints must match their records from
--   BEFORE 0031 (SETUP 0031a). Tested in PGlite (run.mjs step0031). To
--   redo: paste 0031 again. One transaction: on any error nothing is
--   kept. Supabase will warn about destructive operations: this file
--   really removes the two tables and three functions. Confirm only if you mean
--   it.
-- =====================================================================

begin;

-- 6a. schedule_before_write() - BEFORE INSERT OR UPDATE on all four
-- tables. Same bookkeeping as 0003's triggers:
--   insert: version 1; created/updated stamps = now + who
--   update: id, location_code (and a slot's version_id, a color's
--           class_id) can never change; created_* are kept; any real
--           content change bumps version and sets updated_* = now + who;
--           no change keeps everything as it was.
-- "Content" = every column except the bookkeeping ones, compared as JSON.
create or replace function public.schedule_before_write()
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

  if (to_jsonb(new) ->> 'id') is distinct from (to_jsonb(old) ->> 'id')
     or (to_jsonb(new) ->> 'location_code') is distinct from (to_jsonb(old) ->> 'location_code')
     or (tg_table_name = 'schedule_slots'
         and (to_jsonb(new) ->> 'version_id') is distinct from (to_jsonb(old) ->> 'version_id'))
     or (tg_table_name = 'schedule_class_colors'
         and (to_jsonb(new) ->> 'class_id') is distinct from (to_jsonb(old) ->> 'class_id'))
     or (tg_table_name = 'schedule_slot_classes'
         and ((to_jsonb(new) ->> 'slot_id') is distinct from (to_jsonb(old) ->> 'slot_id')
              or (to_jsonb(new) ->> 'class_id') is distinct from (to_jsonb(old) ->> 'class_id'))) then
    raise exception using
      errcode    = '23514',
      constraint = tg_table_name || '_immutable',
      message    = tg_table_name || ': id, school and parent can''t change';
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

revoke execute on function public.schedule_before_write() from public, anon, authenticated, service_role;

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

-- 8a. prospects_open_times(prospect, from, to) - the times this child can
-- be booked into: one row per class time, with the form whose limit
-- applies (the one with the most spots left) and spots left.
create or replace function public.prospects_open_times(p_prospect_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_loc text;
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  if p_prospect_id is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select p.location_code into v_loc from public.prospects p where p.id = p_prospect_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'ok', 'times', coalesce((
    select jsonb_agg(jsonb_build_object('form_id', t.form_id, 'class_id', t.class_id, 'class_name', t.class_name, 'date', t.on_date,
                                        'starts_at', to_char(t.starts_at, 'HH24:MI'), 'ends_at', to_char(t.ends_at, 'HH24:MI'),
                                        'spots_left', t.spots_left) order by t.on_date, t.starts_at, t.class_name)
      from (select distinct on (x.class_id, x.on_date, x.starts_at) f.id as form_id, x.*
              from public.forms f, public.forms_times(f.id, p_from, p_to) x
             where f.location_code = v_loc and f.status = 'live'
               and exists (select 1 from public.form_booking_offers o where o.form_id = f.id)
               and exists (select 1 from jsonb_array_elements(f.published) e where e ->> 'type' = 'booking')
             order by x.class_id, x.on_date, x.starts_at, x.spots_left desc, f.id) t), '[]'::jsonb));
end;
$$;


-- 8a (0012). 0012 grants it in a loop (its section 11): the same rights here.
revoke execute on function public.prospects_open_times(uuid, date, date) from public, anon, authenticated, service_role;
grant  execute on function public.prospects_open_times(uuid, date, date) to authenticated;


-- ---------------------------------------------------------------------
-- Part 2 (v0.620, classes taught together): 0009's and 0012's versions
-- of the five functions 0031 rebuilt, word for word.
-- ---------------------------------------------------------------------

-- forms_times: 0031's version has more columns, so it is dropped and
-- 0009's made again (nothing depends on it in the catalog).
drop function if exists public.forms_times(uuid, date, date);
-- 5d. forms_times(form, from, to) - the free-class times this form shows
-- now: for each offered class, each day of its window (from today, at most
-- days_ahead days; within from..to), each running slot of that class,
-- not sooner than min_hours_ahead, with spots left > 0 (shared count over
-- all forms, v0.241 answer 5). Massachusetts dates and times.
create function public.forms_times(p_form_id uuid, p_from date, p_to date)
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

-- forms_set_booking: 0031's 5-argument version goes; 0009's 4-argument
-- one comes back (the app calls it by argument names, without p_groups).
drop function if exists public.forms_set_booking(uuid, integer, jsonb, jsonb, jsonb);
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

-- 8b. prospects_book_time(prospect, version, form, class, date, start) -
-- book (or change to) a time. The old and the new class time are locked
-- in a fixed order and the spot is re-counted. A checked-in child can't
-- be moved.
create or replace function public.prospects_book_time(p_prospect_id uuid, p_expected_version integer, p_form_id uuid,
                                                      p_class_id uuid, p_date date, p_starts_at time)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_old record;
  v_t record;
  v_check text;
  v_version integer;
  v_had boolean;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if p_prospect_id is null or p_expected_version is null or p_form_id is null or p_class_id is null
       or p_date is null or p_starts_at is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_check := public.prospects_lock(p_prospect_id, p_expected_version);
    if v_check <> 'ok' then return jsonb_build_object('status', v_check); end if;
    select p.* into v_p from public.prospects p where p.id = p_prospect_id;
    if v_p.checked_in_at is not null then return jsonb_build_object('status', 'not_allowed'); end if;
    if not exists (select 1 from public.forms f where f.id = p_form_id and f.location_code = v_p.location_code and f.status = 'live'
                      and exists (select 1 from jsonb_array_elements(f.published) e where e ->> 'type' = 'booking')) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select b.* into v_old from public.class_bookings b
     where b.submission_id = v_p.submission_id and b.child_index = v_p.child_index for update;
    v_had := found and v_old.status = 'booked';
    -- lock the old and the new class time, in a fixed order
    if v_had and v_old.class_id is not null
       and (v_old.class_id::text, v_old.on_date, v_old.starts_at) < (p_class_id::text, p_date, p_starts_at) then
      perform public.prospects_lock_slot(v_p.location_code, v_old.class_id, v_old.on_date, v_old.starts_at);
      perform public.prospects_lock_slot(v_p.location_code, p_class_id, p_date, p_starts_at);
    elsif v_had and v_old.class_id is not null then
      perform public.prospects_lock_slot(v_p.location_code, p_class_id, p_date, p_starts_at);
      perform public.prospects_lock_slot(v_p.location_code, v_old.class_id, v_old.on_date, v_old.starts_at);
    else
      perform public.prospects_lock_slot(v_p.location_code, p_class_id, p_date, p_starts_at);
    end if;
    perform set_config('tkd.action', 'prospects_book_time', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    if v_old.id is not null then
      delete from public.class_bookings b where b.id = v_old.id;   -- its spot is free again before re-counting
    end if;
    select t.* into v_t from public.forms_times(p_form_id, p_date, p_date) t
     where t.class_id = p_class_id and t.starts_at = p_starts_at;
    if not found then
      raise exception using errcode = 'TKD01', message = 'time_taken';
    end if;
    insert into public.class_bookings (submission_id, form_id, location_code, class_id, class_name, on_date, starts_at, ends_at, child_index)
    values (v_p.submission_id, p_form_id, v_p.location_code, p_class_id, v_t.class_name, p_date, p_starts_at, v_t.ends_at, v_p.child_index);
    -- a staff-chosen status other than New / Booked stays; the trigger moved New -> Booked
    perform public.prospects_log(p_prospect_id, v_p.location_code, case when v_had then 'changed_time' else 'booked' end,
                                 jsonb_build_object('class_name', v_t.class_name, 'date', p_date, 'starts_at', to_char(p_starts_at, 'HH24:MI'),
                                                    'from', case when v_had then jsonb_build_object('class_name', v_old.class_name, 'date', v_old.on_date,
                                                                                                      'starts_at', to_char(v_old.starts_at, 'HH24:MI')) end));
    update public.prospects p set last_activity_at = now() where p.id = p_prospect_id returning p.version into v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', p_prospect_id, 'version', v_version);
  exception
    when sqlstate 'TKD01' then return jsonb_build_object('status', 'time_taken');
    when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- 8b (0012). 0012 grants it in a loop (its section 11): the same rights here.
revoke execute on function public.prospects_book_time(uuid, integer, uuid, uuid, date, time) from public, anon, authenticated, service_role;
grant  execute on function public.prospects_book_time(uuid, integer, uuid, uuid, date, time) to authenticated;


-- 0031's functions and tables (their triggers and policies go with the
-- tables). The group table goes BEFORE forms_group_class_ids_ok: its
-- check uses that function.
drop table if exists public.form_booking_group_limits;
drop function if exists public.forms_booking_lock_class(text, uuid, date, time);
drop function if exists public.forms_group_class_ids_ok(uuid[]);
drop function if exists public.schedule_set_class_ages(uuid, integer, integer);
drop table if exists public.schedule_class_ages;

commit;

-- End of 0031u_undo_class_ages.sql
