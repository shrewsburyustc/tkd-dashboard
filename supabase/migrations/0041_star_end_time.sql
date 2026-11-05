-- =====================================================================
-- 0041_star_end_time.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A small migration for the Star testing section (0006, 0023 and 0028,
--   all live; rulebook v0.520). It gives every Star testing event an
--   optional END TIME, after its start time, and hands it to the screens
--   that show the testing day's time:
--     1. table public.star_events: new column end_time (time, may be
--        empty) + a table rule: empty, or a valid time (the same rule as
--        start times, star_start_time_is_valid from 0028) LATER than the
--        start time. Signed-in staff may read it (column read right).
--     2. star_add_event - REPLACED with one more input, p_end_time (last,
--        default empty). Same checks, answers, owner and rights otherwise.
--     3. star_update_event (0023's version, which keeps registration
--        closed in the same save, v0.504) - REPLACED with one more input,
--        p_end_time (last, default empty). Same otherwise.
--     4. star_public_event (what the family form shows first),
--        star_public_answer (the "You're registered" answer) and
--        star_home_today (Home's Today card) - REPLACED: each answer has
--        one more key, end_time ("HH:MM", or null when none is saved).
--        Same arguments, checks, owner and rights.
--   Nothing else changes: no other table, function or data. Events saved
--   before this file keep an empty end time until an admin adds one.
--
-- WHY IT EXISTS
--   Jeffrey, 2026-11-05: families must see the testing time "from when to
--   when so parents know when to pick them up" (rulebook v0.520). Only a
--   start time was stored, so the family form could show only that.
--
-- WHY THE OLD APP KEEPS WORKING (the database goes live first)
--   The live app calls star_add_event and star_update_event by argument
--   NAME without p_end_time. The new versions give p_end_time a default
--   (empty), so those calls still work and save no end time. Postgres
--   can't add an argument to an existing function, so the old versions
--   are removed and the new ones made, inside this one transaction (no
--   moment without them). The new answer keys are extra keys in jsonb:
--   a reader that doesn't know them ignores them.
--   Known, small: an Edit event saved from a browser tab opened BEFORE
--   the new app deployed sends no end time, so it clears one. The new
--   app always sends it.
--
-- WORDS USED BELOW
--   * "version", "stale", "security definer", search_path = '': as in
--     0003, 0005 and 0006 (read their headers).
--   * default empty: an argument the caller may leave out; it is then
--     NULL (no end time).
--
-- HOW TO RUN IT
--   After 0006, 0023 and 0028. Supabase dashboard -> SQL Editor -> New
--   query -> paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept.
--   Supabase may warn about DESTRUCTIVE OPERATIONS: "drop function" below
--   removes the two old versions of star_add_event / star_update_event
--   (made again straight after, with the new input), and "drop constraint
--   if exists" lets the file run twice. No data is removed. Confirm.
--   Safe to run again (tested in PGlite, run.mjs step0041).
--   RE-RUN ORDER: re-running 0006 or 0023 after this file would ADD their
--   old versions back next to these -> don't; if it happens, re-run this
--   file straight after.
--   Undo: SETUP.md, "Migration 0041" - supabase/manual/0041u_undo_star_end_time.sql.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0006, 0023 and 0028. Stops - and changes
--    nothing - if one is missing.
-- ---------------------------------------------------------------------
do $$
begin
  -- 0006: the table; 0023: its result-text table; 0028: the start-time rule's 10:00 PM end
  -- (0028 REPLACED 0006's function, so its body is what tells them apart).
  if to_regclass('public.star_events') is null
     or to_regclass('public.star_result_texts') is null
     or to_regprocedure('public.star_start_time_is_valid(time)') is null
     or (select p.prosrc from pg_catalog.pg_proc p
          where p.oid = to_regprocedure('public.star_start_time_is_valid(time)')) not like '%22:00%' then
    raise exception '0041 needs migrations 0006, 0023 and 0028 (Star testing) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. The column, its rule and its read right
-- ---------------------------------------------------------------------
alter table public.star_events add column if not exists end_time time null;

alter table public.star_events drop constraint if exists star_events_end_time_check;
alter table public.star_events add constraint star_events_end_time_check
  check (end_time is null
         or (public.star_start_time_is_valid(end_time) and end_time > start_time));

-- Signed-in staff read events by column (0006 section 25): add this one.
-- Nothing for anon or star_registrar (the family form reads through
-- star_public_event only).
grant select (end_time) on public.star_events to authenticated;


-- ---------------------------------------------------------------------
-- 3. star_add_event - REPLACED (0006 section 18h), one more input
--   p_end_time   empty, or 6:00 AM - 10:00 PM every 5 minutes AND later
--                than p_start_time
-- Everything else word for word as 0006 (template copy, link codes, the
-- signature clean-up). Ok: {"status":"ok","id":...,
-- "public_code_worcester":"...","public_code_shrewsbury":"...","version":1}
-- ---------------------------------------------------------------------
drop function if exists public.star_add_event(text, date, time, text, boolean, date, text);

create or replace function public.star_add_event(
  p_name              text,
  p_testing_date      date,
  p_start_time        time,
  p_where_code        text,
  p_registration_open boolean,
  p_auto_close_on     date,
  p_note              text,
  p_end_time          time default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_name       text;
  v_note       text;
  v_code_w     text;
  v_code_s     text;
  v_id         uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    v_today := public.testing_today();
    v_name  := public.testing_normalize_name(p_name);
    v_note  := public.testing_normalize_note(p_note);
    if not public.testing_name_is_valid(p_name)
       or p_testing_date is null or p_testing_date < v_today
       or not public.star_start_time_is_valid(p_start_time)
       or (p_end_time is not null
           and (not public.star_start_time_is_valid(p_end_time) or p_end_time <= p_start_time))
       or p_where_code is null
       or not exists (select 1 from public.locations l where l.code = p_where_code)
       or p_registration_open is null
       or (p_auto_close_on is not null and (p_auto_close_on < v_today or p_auto_close_on > p_testing_date))
       or (v_note is not null and not public.testing_note_is_valid(v_note)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- share-lock the template so it can't change half-way through the copy
    perform 1 from public.star_dan_settings d order by d.dan for share;
    perform 1 from public.star_grade_values v order by v.position for share;
    perform 1 from public.star_assistant_table a for share;
    perform 1 from public.star_categories k order by k.dan, k.position for share;

    -- the template must be complete
    if not exists (select 1 from public.star_dan_settings)
       or (select count(*) from public.star_grade_values) <> 7
       or not exists (select 1 from public.star_assistant_table)
       or exists (select 1 from public.star_dan_settings d
                   where not exists (select 1 from public.star_categories k where k.dan = d.dan)
                      or (select count(*) from public.star_categories k where k.dan = d.dan and k.from_class_count) <> 1) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- the name
    if exists (select 1 from public.star_events e
                where lower(public.testing_normalize_name(e.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- write
    perform set_config('tkd.action', 'star_add_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    perform pg_advisory_xact_lock(hashtext('star_public_code'));
    loop
      v_code_w := public.testing_new_public_code();
      v_code_s := public.testing_new_public_code();
      exit when v_code_w <> v_code_s
            and not exists (select 1 from public.star_events e
                             where e.public_code_worcester in (v_code_w, v_code_s)
                                or e.public_code_shrewsbury in (v_code_w, v_code_s));
    end loop;

    insert into public.star_events
      (name, testing_date, start_time, end_time, where_code, registration_open, auto_close_on, first_opened_at,
       public_code_worcester, public_code_shrewsbury, note, created_by_name, updated_by_name)
    values
      (v_name, p_testing_date, p_start_time, p_end_time, p_where_code, p_registration_open, p_auto_close_on,
       case when p_registration_open then now() end, v_code_w, v_code_s, v_note, '', '')
    returning id, version into v_id, v_version;

    perform public.star_copy_template_into_event(v_id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.star_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'id', v_id,
                              'public_code_worcester', v_code_w, 'public_code_shrewsbury', v_code_s,
                              'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_add_event(text, date, time, text, boolean, date, text, time) from public, anon, authenticated, service_role;
grant  execute on function public.star_add_event(text, date, time, text, boolean, date, text, time) to authenticated;


-- ---------------------------------------------------------------------
-- 4. star_update_event - REPLACED (0023 section 6), one more input
--   p_end_time   empty (no end time), or 6:00 AM - 10:00 PM every 5
--                minutes AND later than p_start_time
-- Everything else word for word as 0023: the v0.504 keep-closed rule,
-- the date rules, "same values -> nothing written" (now also comparing
-- the end time). Ok: {"status":"ok","version":n}
-- ---------------------------------------------------------------------
drop function if exists public.star_update_event(uuid, integer, text, date, time, text, date, text);

create or replace function public.star_update_event(
  p_event_id         uuid,
  p_expected_version integer,
  p_name             text,
  p_testing_date     date,
  p_start_time       time,
  p_where_code       text,
  p_auto_close_on    date,
  p_note             text,
  p_end_time         time default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today       date;
  v_name        text;
  v_note        text;
  v_e           public.star_events;
  v_after       public.star_events;   -- the event as it would be after the save (v0.504)
  v_keep_closed boolean := false;     -- v0.504: this save also turns the switch to Closed
  v_version     integer;
  v_constraint  text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    v_today := public.testing_today();
    v_name  := public.testing_normalize_name(p_name);
    v_note  := public.testing_normalize_note(p_note);
    if p_event_id is null or p_expected_version is null
       or not public.testing_name_is_valid(p_name)
       or p_testing_date is null
       or not public.star_start_time_is_valid(p_start_time)
       or (p_end_time is not null
           and (not public.star_start_time_is_valid(p_end_time) or p_end_time <= p_start_time))
       or p_where_code is null
       or not exists (select 1 from public.locations l where l.code = p_where_code)
       or (v_note is not null and not public.testing_note_is_valid(v_note)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_e from public.star_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    if p_testing_date is distinct from v_e.testing_date and p_testing_date < v_today then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_auto_close_on is distinct from v_e.auto_close_on and p_auto_close_on is not null
       and p_auto_close_on < v_today then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_auto_close_on is not null and p_auto_close_on > p_testing_date then
      return jsonb_build_object('status', 'invalid');
    end if;

    if exists (select 1 from public.star_events e
                where e.id <> p_event_id
                  and lower(public.testing_normalize_name(e.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- v0.504: would these dates make registration open again by
    -- themselves? (Not open before, open after -> keep it closed.)
    v_after := v_e;
    v_after.testing_date  := p_testing_date;
    v_after.auto_close_on := p_auto_close_on;
    v_keep_closed := public.star_event_state(v_e, v_today) <> 'open'
                     and public.star_event_state(v_after, v_today) = 'open';

    perform set_config('tkd.action', 'star_update_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_events e
       set name              = v_name,
           testing_date      = p_testing_date,
           start_time        = p_start_time,
           end_time          = p_end_time,
           where_code        = p_where_code,
           auto_close_on     = p_auto_close_on,
           note              = v_note,
           registration_open = case when v_keep_closed then false else e.registration_open end
     where e.id = p_event_id
       and (e.name is distinct from v_name
            or e.testing_date is distinct from p_testing_date
            or e.start_time is distinct from p_start_time
            or e.end_time is distinct from p_end_time
            or e.where_code is distinct from p_where_code
            or e.auto_close_on is distinct from p_auto_close_on
            or e.note is distinct from v_note
            or v_keep_closed)
    returning e.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_e.version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_update_event(uuid, integer, text, date, time, text, date, text, time) from public, anon, authenticated, service_role;
grant  execute on function public.star_update_event(uuid, integer, text, date, time, text, date, text, time) to authenticated;


-- ---------------------------------------------------------------------
-- 5. star_public_answer - REPLACED (0006 section 16h): + end_time
-- Internal (nobody may call it; star_public_register uses it). Same
-- rights: revoked from everyone.
-- ---------------------------------------------------------------------
create or replace function public.star_public_answer(p_candidate_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'status',         'ok',
           'reference',      c.reference,
           'first_name',     c.first_name,
           'last_name',      c.last_name,
           'dan',            c.dan,
           'dan_label',      d.label,
           'stars_from',     c.stars_from,
           'stars_to',       c.stars_from + 1,
           'standard_cents', d.standard_cents,
           'same_day_cents', d.same_day_cents,
           'paying_by',      c.paying_by,
           'event_name',     e.name,
           'testing_date',   e.testing_date,
           'start_time',     left(e.start_time::text, 5),
           'end_time',       left(e.end_time::text, 5),
           'school_name',    l.name,
           'where',          jsonb_build_object('name', w.name,
                                                'address', public.testing_location_address(e.where_code)))
    from public.star_candidates c
    join public.star_events e     on e.id = c.event_id
    join public.star_event_dans d on d.event_id = c.event_id and d.dan = c.dan
    join public.locations l       on l.code = c.location_code
    join public.locations w       on w.code = e.where_code
   where c.id = p_candidate_id;
$$;

revoke execute on function public.star_public_answer(uuid) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 6. star_home_today - REPLACED (0006 section 19), + end_time on each
-- event. Everything else word for word. Same rights.
-- ---------------------------------------------------------------------
create or replace function public.star_home_today()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today   date;
  v_events  jsonb;
  v_private jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    v_today := public.testing_today();

    select coalesce(jsonb_agg(jsonb_build_object(
                      'id',         e.id,
                      'name',       e.name,
                      'start_time', left(e.start_time::text, 5),
                      'end_time',   left(e.end_time::text, 5),
                      'where_code', e.where_code,
                      'where_name', l.name,
                      'counts', jsonb_build_object(
                                  'worcester',  (select count(*) from public.star_candidates c
                                                  where c.event_id = e.id and c.status = 'active'
                                                    and c.private_on is null and c.location_code = 'worcester'),
                                  'shrewsbury', (select count(*) from public.star_candidates c
                                                  where c.event_id = e.id and c.status = 'active'
                                                    and c.private_on is null and c.location_code = 'shrewsbury')))
                    order by e.start_time, e.name, e.id), '[]'::jsonb)
      into v_events
      from public.star_events e
      join public.locations l on l.code = e.where_code
     where e.testing_date = v_today;

    select coalesce(jsonb_agg(jsonb_build_object(
                      'candidate_id',  c.id,
                      'event_id',      c.event_id,
                      'event_name',    e.name,
                      'private_time',  left(c.private_time::text, 5),
                      'first_name',    c.first_name,
                      'last_name',     c.last_name,
                      'location_code', c.location_code,
                      'dan',           c.dan,
                      'stars_from',    c.stars_from,
                      'stars_to',      c.stars_from + 1)
                    order by c.private_time, lower(c.last_name), lower(c.first_name), c.id), '[]'::jsonb)
      into v_private
      from public.star_candidates c
      join public.star_events e on e.id = c.event_id
     where c.private_on = v_today and c.status = 'active';

    perform public.star_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'today', v_today, 'events', v_events, 'private', v_private);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_home_today() from public, anon, authenticated, service_role;
grant  execute on function public.star_home_today() to authenticated;


-- ---------------------------------------------------------------------
-- 7. star_public_event - REPLACED (0006 section 20a), + event.end_time
-- For the family form's login star_registrar ONLY. Everything else word
-- for word: no private fee, no counts, no ids.
-- ---------------------------------------------------------------------
create or replace function public.star_public_event(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e      public.star_events;
  v_school text;
  v_n      integer;
  v_state  text;
  v_aplus  numeric;
begin
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select count(*) into v_n from public.star_events e
   where e.public_code_worcester = p_code or e.public_code_shrewsbury = p_code;
  if v_n <> 1 then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_e from public.star_events e
   where e.public_code_worcester = p_code or e.public_code_shrewsbury = p_code;
  v_school := case when v_e.public_code_worcester = p_code then 'worcester' else 'shrewsbury' end;

  v_state := public.star_event_state(v_e, public.testing_today());
  select v.value into v_aplus from public.star_event_grades v where v.event_id = v_e.id and v.grade = 'A+';

  return jsonb_build_object(
    'status', 'ok',
    'state', case v_state
               when 'open' then 'open'
               when 'not_open_yet' then 'not_open'
               when 'finished' then 'finished'
               else 'closed'
             end,
    'closed_on', case when v_state = 'closed_by_date' then v_e.auto_close_on end,
    'school', jsonb_build_object('code', v_school,
                                 'name', (select l.name from public.locations l where l.code = v_school)),
    'event', jsonb_build_object(
               'name',          v_e.name,
               'testing_date',  v_e.testing_date,
               'start_time',    left(v_e.start_time::text, 5),
               'end_time',      left(v_e.end_time::text, 5),
               'note',          v_e.note,
               'auto_close_on', v_e.auto_close_on,
               'where',         jsonb_build_object(
                                  'name', (select l.name from public.locations l where l.code = v_e.where_code),
                                  'address', public.testing_location_address(v_e.where_code))),
    'dans', coalesce((
      select jsonb_agg(jsonb_build_object(
                         'dan',            d.dan,
                         'label',          d.label,
                         'star_limit',     d.star_limit,
                         'standard_cents', d.standard_cents,
                         'same_day_cents', d.same_day_cents,
                         'pass_mark',      d.pass_mark,
                         'max_score',      round(coalesce((select sum(k.credits) from public.star_event_categories k
                                                            where k.event_id = v_e.id and k.dan = d.dan), 0)
                                                 * coalesce(v_aplus, 0), 1),
                         'categories',     coalesce((select jsonb_agg(jsonb_build_object('name', k.name, 'credits', k.credits)
                                                                      order by k.position)
                                                       from public.star_event_categories k
                                                      where k.event_id = v_e.id and k.dan = d.dan), '[]'::jsonb))
                       order by d.dan)
        from public.star_event_dans d
       where d.event_id = v_e.id), '[]'::jsonb));
end;
$$;

revoke execute on function public.star_public_event(text) from public, anon, authenticated, service_role;
grant  execute on function public.star_public_event(text) to star_registrar;

commit;

-- End of 0041_star_end_time.sql
