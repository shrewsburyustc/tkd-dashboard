-- =====================================================================
-- 0031_class_ages.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A database migration for the New students part of the dashboard
--   (Schedule 0007, Forms 0009, Prospects 0012, all live; rulebook
--   v0.619). It runs AFTER 0007, 0009 and 0012 - it stops with a clear
--   message if one is missing. No later migration replaced any function
--   this file touches (checked 2026-10-28: 0015, 0019 and later only
--   CALL them).
--
-- WHY IT EXISTS
--   The booking forms' "Pick a class time" list shows each class's age
--   range, e.g. "Thu, Oct 29 - 6:00 pm - White - Ages 7-12 - 10 spots
--   left". DISPLAY ONLY: a form never hides or blocks a class because of
--   a child's age. Admins set a class's ages in the Schedule's time slot
--   dialog, under the class's Color, per school, the same way as the
--   color. Two whole numbers, From and To (0-99, From not above To); To
--   may be empty ("Ages 7+"); both empty = no ages shown.
--
-- WHAT IT ADDS
--   1. public.schedule_class_ages - one row per class that HAS an age
--      range (no row = none). Built exactly like 0007's
--      schedule_class_colors: its own id (change_log needs one), the
--      class + its school (deleting the class in Testing removes its
--      ages row too, "on delete cascade", logged like any other change),
--      version + who/when, history (change_log), no truncate, read-only
--      for unlocked staff (has_data_access()), no direct writes.
--   2. schedule_set_class_ages(class, from, to) - the ONLY way to write
--      (admins only; both empty = remove the row).
--
-- WHAT IT CHANGES (each changed line is marked "0031")
--   3. schedule_before_write() (0007's bookkeeping trigger) - one line:
--      an ages row's class can never change, like a color row's. Every
--      other line is 0007's, word for word.
--   4. The class times families and staff see gain two keys per time,
--      "age_from" and "age_to" (whole numbers, or null when the class has
--      no ages; age_to null with age_from set = "7+"). Replaced, word for
--      word except that, from 0009:
--        forms_open_times    (builder preview and "Fill in", staff)
--        forms_public_get    (the public page and the kiosk)
--        forms_public_submit (the fresh times sent back on "time_taken")
--      and from 0012:
--        prospects_open_times (Prospects -> "Book a free class", staff)
--      Same names, arguments, return types, owner, "security definer",
--      search_path = '' and rights as 0009 / 0012 (re-stated below). Nothing new
--      is granted to anon, and forms_registrar keeps exactly its three
--      public functions (they run as their owner, so it needs no right on
--      the new table).
--   NOT changed: forms_times (0009's internal list of times; its return
--   type stays, so nothing has to be dropped and re-made) - the ages are
--   looked up next to it, per time, in the four functions above.
--
-- HOW TO RUN IT
--   After 0007, 0009 and 0012. Supabase dashboard -> SQL Editor -> New query ->
--   paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept. Supabase may
--   warn about destructive operations: the "drop ... if exists" lines
--   only make re-running safe, and the removal inside
--   schedule_set_class_ages / forms_public_submit runs only later, when
--   an admin clears a class's ages / a family sends a form. This file
--   itself removes nothing. Confirm.
--   Safe to run again (tested: the second run changes no fingerprint).
--   Undo: SETUP.md, "Migration 0031", 0031e - paste
--   supabase/manual/0031u_undo_class_ages.sql.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0007 (Schedule), 0009 (Forms) and 0012
--    (Prospects). Stops
--    - and changes nothing - if one is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.schedule_class_colors') is null
     or to_regprocedure('public.schedule_before_write()') is null then
    raise exception '0031 needs migration 0007 (Schedule) first.';
  end if;
  if to_regprocedure('public.forms_open_times(uuid, date, date)') is null
     or to_regprocedure('public.forms_public_get(text)') is null
     or to_regprocedure('public.forms_public_submit(text, text, uuid, integer, jsonb, jsonb, jsonb, text, text)') is null then
    raise exception '0031 needs migration 0009 (Forms) first.';
  end if;
  if to_regprocedure('public.prospects_open_times(uuid, date, date)') is null then
    raise exception '0031 needs migration 0012 (Prospects) first.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. public.schedule_class_ages
-- A class's age range on the booking forms. A class without a row shows
-- no ages. Has its own id because change_log_write (0003) needs an "id"
-- column. The class and its school together point at testing_classes,
-- so a row can only ever belong to the class's own school.
-- ---------------------------------------------------------------------
create table if not exists public.schedule_class_ages (
  id              uuid        not null default gen_random_uuid(),
  class_id        uuid        not null,
  location_code   text        not null,
  age_from        smallint    not null,
  age_to          smallint    null,       -- empty = "and up" ("Ages 7+")
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,
  updated_by      uuid        null,
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint schedule_class_ages_pkey primary key (id),
  constraint schedule_class_ages_class_key unique (class_id),
  constraint schedule_class_ages_class_fk
    foreign key (class_id, location_code)
    references public.testing_classes (id, location_code) on delete cascade,
  constraint schedule_class_ages_from_check check (age_from between 0 and 99),
  constraint schedule_class_ages_to_check check (age_to is null or age_to between age_from and 99),
  constraint schedule_class_ages_version_check check (version >= 1)
);

comment on table public.schedule_class_ages is
  'Each class''s age range on the booking forms (display only, rulebook v0.619). No row = no ages. Written only through schedule_set_class_ages.';


-- ---------------------------------------------------------------------
-- 3. schedule_before_write() - 0007's bookkeeping trigger, now also on
-- schedule_class_ages. ONE line differs from 0007 (marked "0031"): an
-- ages row's class_id can never change, like a color row's.
-- ---------------------------------------------------------------------
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
     or (tg_table_name in ('schedule_class_colors', 'schedule_class_ages')   -- 0031: an ages row's class too
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


-- ---------------------------------------------------------------------
-- 4. Triggers on schedule_class_ages (the same three as a color row):
-- bookkeeping, history (0003's change_log_write), no truncate.
-- ---------------------------------------------------------------------
drop trigger if exists schedule_class_ages_before_write on public.schedule_class_ages;
create trigger schedule_class_ages_before_write
  before insert or update on public.schedule_class_ages
  for each row execute function public.schedule_before_write();

drop trigger if exists schedule_class_ages_log on public.schedule_class_ages;
create trigger schedule_class_ages_log
  after insert or update or delete on public.schedule_class_ages
  for each row execute function public.change_log_write();

drop trigger if exists schedule_class_ages_no_truncate on public.schedule_class_ages;
create trigger schedule_class_ages_no_truncate
  before truncate on public.schedule_class_ages
  for each statement execute function public.schedule_refuse_truncate();


-- ---------------------------------------------------------------------
-- 5. Security rules: RLS + grants (the same two layers as 0007 section 7)
-- Read: the listed columns, every row, only while has_data_access().
-- Write: nobody directly - only schedule_set_class_ages (section 6).
-- anon and service_role get nothing.
-- ---------------------------------------------------------------------
alter table public.schedule_class_ages enable row level security;

revoke all on table public.schedule_class_ages from public, anon, authenticated, service_role;

grant select (id, class_id, location_code, age_from, age_to, version,
              created_at, updated_at, created_by_name, updated_by_name)
  on public.schedule_class_ages to authenticated;
-- created_by / updated_by (login ids) are NOT granted.

drop policy if exists schedule_class_ages_select_with_access on public.schedule_class_ages;
create policy schedule_class_ages_select_with_access
  on public.schedule_class_ages for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 6. schedule_set_class_ages(p_class_id, p_age_from, p_age_to)
-- Sets a class's age range (adds the row the first time). Admins only,
-- like the class color (0007's schedule_set_class_color, whose shape this
-- copies). The same values again write nothing. Both empty (null) =
-- remove the row (nothing to do when there is none).
--   invalid   no class; To without From; From outside 0-99; To outside
--             From-99
--   not_found the class doesn't exist (or was just deleted)
-- Ok: {"status":"ok","class_id":...,"age_from":n|null,"age_to":n|null,
--      "version":n|null}   (version null = the class has no ages now)
-- ---------------------------------------------------------------------
create or replace function public.schedule_set_class_ages(
  p_class_id uuid,
  p_age_from integer,
  p_age_to   integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc     text;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_class_id is null
       or (p_age_from is null and p_age_to is not null)
       or (p_age_from is not null and p_age_from not between 0 and 99)
       or (p_age_to is not null and p_age_to not between p_age_from and 99) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select c.location_code into v_loc from public.testing_classes c where c.id = p_class_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = v_loc for no key update;

    perform 1 from public.testing_classes c where c.id = p_class_id for key share;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform set_config('tkd.action', 'schedule_set_class_ages', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_age_from is null then
      -- both empty: the class has no ages any more
      delete from public.schedule_class_ages k where k.class_id = p_class_id;
    else
      insert into public.schedule_class_ages (class_id, location_code, age_from, age_to)
      values (p_class_id, v_loc, p_age_from, p_age_to)
      on conflict (class_id) do update
        set age_from = excluded.age_from,
            age_to   = excluded.age_to
        where (public.schedule_class_ages.age_from, public.schedule_class_ages.age_to)
              is distinct from (excluded.age_from, excluded.age_to);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select k.version into v_version from public.schedule_class_ages k where k.class_id = p_class_id;

    return jsonb_build_object('status', 'ok', 'class_id', p_class_id, 'age_from', p_age_from, 'age_to', p_age_to,
                              'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.schedule_set_class_ages(uuid, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.schedule_set_class_ages(uuid, integer, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 7. The class times carry the ages (from 0009, word for word except the
-- lines marked "0031"). Each time gets "age_from" and "age_to", looked
-- up per time (a lookup inside each item, not a join, so the order of
-- the times stays exactly 0009's).
-- ---------------------------------------------------------------------

-- 7i. forms_open_times(form, from, to) - the times families would see now
-- (builder preview and "Fill in"). Staff and admins.
-- Ok: {"status":"ok","times":[{class_id,class_name,date,starts_at,ends_at,spots_left,
--      age_from,age_to}]}   (age_from / age_to: 0031)
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
                                        'spots_left', t.spots_left,
                                        -- 0031: the class's age range (display only; null = none set)
                                        'age_from', (select ca.age_from from public.schedule_class_ages ca where ca.class_id = t.class_id),
                                        'age_to', (select ca.age_to from public.schedule_class_ages ca where ca.class_id = t.class_id)))
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
                                          'spots_left', t.spots_left,
                                          -- 0031: the class's age range (display only; null = none set)
                                          'age_from', (select ca.age_from from public.schedule_class_ages ca where ca.class_id = t.class_id),
                                          'age_to', (select ca.age_to from public.schedule_class_ages ca where ca.class_id = t.class_id)))
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
                                          'spots_left', t.spots_left,
                                          -- 0031: the class's age range (display only; null = none set)
                                          'age_from', (select ca.age_from from public.schedule_class_ages ca where ca.class_id = t.class_id),
                                          'age_to', (select ca.age_to from public.schedule_class_ages ca where ca.class_id = t.class_id)))
        from public.forms_times(v_form_id, public.schedule_today(), public.schedule_today() + 60) t), '[]'::jsonb));
  end if;
  return v_result;
end;
$$;

revoke execute on function public.forms_public_submit(text, text, uuid, integer, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.forms_public_submit(text, text, uuid, integer, jsonb, jsonb, jsonb, text, text) to forms_registrar;


-- From 0012 (section 8a), word for word except the lines marked "0031".
-- 0012 grants it in a loop (its section 11); the same rights are re-stated
-- here: authenticated only.
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
                                        'spots_left', t.spots_left,
                                        -- 0031: the class's age range (display only; null = none set)
                                        'age_from', (select ca.age_from from public.schedule_class_ages ca where ca.class_id = t.class_id),
                                        'age_to', (select ca.age_to from public.schedule_class_ages ca where ca.class_id = t.class_id))
                                        order by t.on_date, t.starts_at, t.class_name)
      from (select distinct on (x.class_id, x.on_date, x.starts_at) f.id as form_id, x.*
              from public.forms f, public.forms_times(f.id, p_from, p_to) x
             where f.location_code = v_loc and f.status = 'live'
               and exists (select 1 from public.form_booking_offers o where o.form_id = f.id)
               and exists (select 1 from jsonb_array_elements(f.published) e where e ->> 'type' = 'booking')
             order by x.class_id, x.on_date, x.starts_at, x.spots_left desc, f.id) t), '[]'::jsonb));
end;
$$;

revoke execute on function public.prospects_open_times(uuid, date, date) from public, anon, authenticated, service_role;
grant  execute on function public.prospects_open_times(uuid, date, date) to authenticated;


commit;

-- End of 0031_class_ages.sql
