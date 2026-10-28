-- =====================================================================
-- 0031u_undo_class_ages.sql   (UNDO of migration 0031)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0031 (class ages on the booking forms, rulebook
--   v0.619) back out:
--     1. puts back the exact earlier versions of the five functions 0031
--        replaced, copied word for word with their exact rights:
--          schedule_before_write  from 0007 (section 6a)
--          forms_open_times       from 0009 (section 7i)
--          forms_public_get       from 0009 (section 9a)
--          forms_public_submit    from 0009 (section 9b)
--          prospects_open_times   from 0012 (section 8a; rights as
--                                 0012's section 11 loop gives them)
--        so the class times no longer carry "age_from" / "age_to";
--     2. removes schedule_set_class_ages;
--     3. removes the table public.schedule_class_ages WITH every age range
--        admins entered (their history rows stay in change_log, so the
--        values can be read back from there and re-entered).
--   The app version that shows ages must NOT be live when this runs (it
--   would fail to load the Schedule's ages).
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
--   really removes the table and the function. Confirm only if you mean
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


-- 0031's function and table (its triggers and policy go with the table)
drop function if exists public.schedule_set_class_ages(uuid, integer, integer);
drop table if exists public.schedule_class_ages;

commit;

-- End of 0031u_undo_class_ages.sql
