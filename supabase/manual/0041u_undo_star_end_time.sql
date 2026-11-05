-- =====================================================================
-- 0041u_undo_star_end_time.sql   (UNDO of migration 0041)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes Star testing back to how it was before 0041 (event end time,
--   rulebook v0.520):
--     1. refuses - changing nothing - while any Star event has an end
--        time saved (see below)
--     2. removes 0041's star_add_event (8 inputs) and star_update_event
--        (9 inputs) and puts back 0006's star_add_event (7 inputs) and
--        0023's star_update_event (8 inputs), word for word with their
--        exact rights
--     3. puts back 0006's star_public_answer, star_home_today and
--        star_public_event (no end_time key), word for word with their
--        exact rights
--     4. removes the table rule star_events_end_time_check, staff's read
--        right on end_time and the column end_time itself
--   Sections 2 and 3 are copied from 0006_star_testing.sql (sections
--   16h, 18h, 19g, 20a) and 0023_star_result_texts.sql (section 6),
--   comments included.
--
-- WHY A SEPARATE FILE
--   Re-running 0006 / 0023 would not remove 0041's versions (they have
--   one more input, so Postgres keeps both side by side) and would not
--   remove the column. Paste it ONLY with Jeffrey's OK (SETUP.md,
--   Migration 0041, 0041f), and only after the app is back to a version
--   that doesn't send p_end_time (an app that sends it would get "function
--   not found" from the old versions).
--
-- IT REFUSES WHILE AN END TIME IS SAVED
--   Removing the column would silently throw those end times away - times
--   families may already have been shown. So section 1 stops while any
--   event has one. Check first with supabase/tests/0041_preapply_check.sql
--   (events_with_end_time must be 0); clear those end times in the app
--   (Edit event -> no end time), then paste this file. (Removing them here
--   instead would be one line, but it would throw data away without
--   anyone deciding to - so this file doesn't.)
--
-- AFTERWARDS
--   Every fingerprint file (0006's and 0023's included) must equal the
--   one written down BEFORE 0041 was applied (SETUP 0041c), and
--   0041_preapply_check.sql must answer 0 / 2 / 0 / 5 / 5 / 0 / 0.
--   Tested in PGlite (run.mjs step0041). To redo: paste 0041 again. Safe
--   to paste twice. One transaction: on any error nothing is kept.
--   Supabase may warn about DESTRUCTIVE OPERATIONS: the "drop function",
--   "drop constraint" and "drop column" below are the planned removals of
--   0041's parts (section 1 has made sure the column holds nothing).
--   Confirm.
-- =====================================================================

begin;

-- Stop Star event saves while this undo runs, so no end time can be saved
-- between the check below and the column's removal.
lock table public.star_events in share mode;

-- ---------------------------------------------------------------------
-- 1. Refuse while an event has an end time saved (see above). Read
--    through to_jsonb(), so a second paste (no column any more) passes.
-- ---------------------------------------------------------------------
do $$
declare
  v_events integer;
begin
  select count(*) into v_events
    from public.star_events e
   where to_jsonb(e) ->> 'end_time' is not null;
  if v_events > 0 then
    raise exception '0041 undo refused: % Star event(s) have an end time saved. Clear them first (Edit event, no end time; 0041_preapply_check.sql counts them).',
      v_events;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. star_add_event and star_update_event: 0041's versions out, the
--    earlier ones back
-- ---------------------------------------------------------------------
drop function if exists public.star_add_event(text, date, time, text, boolean, date, text, time);
drop function if exists public.star_update_event(uuid, integer, text, date, time, text, date, text, time);

-- 0006's star_add_event (0006 section 18h), word for word:

-- 18h. star_add_event(p_name, p_testing_date, p_start_time, p_where_code,
--        p_registration_open, p_auto_close_on, p_note)   A
-- Creates an event and copies the WHOLE template into it (16g):
--   p_testing_date    today or later
--   p_start_time      8:00 AM - 8:00 PM on a 15-minute step
--   p_where_code      'worcester' or 'shrewsbury' (information only)
--   p_registration_open  true = open straight away; false = "Not open yet"
--   p_auto_close_on   NULL or from today up to the testing date
--   p_note            NULL or up to 600 characters
-- The template must be complete (every Dan has subjects and exactly one
-- Assistant Instructor) - else invalid. Two link codes are drawn (one per
-- school), never used by any other event in either column; a transaction
-- lock on a fixed number makes two Add event calls draw one after the
-- other. Last step: the signature clean-up (16a).
-- locks: the template, share (every Dan row in Dan order, the grade values
--        by position, the assistant row, the subjects by Dan and
--        position) -> the code lock
-- Ok: {"status":"ok","id":...,"public_code_worcester":"...","public_code_shrewsbury":"...","version":1}
create or replace function public.star_add_event(
  p_name              text,
  p_testing_date      date,
  p_start_time        time,
  p_where_code        text,
  p_registration_open boolean,
  p_auto_close_on     date,
  p_note              text
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
       or p_where_code is null
       or not exists (select 1 from public.locations l where l.code = p_where_code)
       or p_registration_open is null
       or (p_auto_close_on is not null and (p_auto_close_on < v_today or p_auto_close_on > p_testing_date))
       or (v_note is not null and not public.testing_note_is_valid(v_note)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. share-lock the template so it can't change half-way through the copy
    perform 1 from public.star_dan_settings d order by d.dan for share;
    perform 1 from public.star_grade_values v order by v.position for share;
    perform 1 from public.star_assistant_table a for share;
    perform 1 from public.star_categories k order by k.dan, k.position for share;

    -- 6. the template must be complete
    if not exists (select 1 from public.star_dan_settings)
       or (select count(*) from public.star_grade_values) <> 7
       or not exists (select 1 from public.star_assistant_table)
       or exists (select 1 from public.star_dan_settings d
                   where not exists (select 1 from public.star_categories k where k.dan = d.dan)
                      or (select count(*) from public.star_categories k where k.dan = d.dan and k.from_class_count) <> 1) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 7. the name
    if exists (select 1 from public.star_events e
                where lower(public.testing_normalize_name(e.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write
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
      (name, testing_date, start_time, where_code, registration_open, auto_close_on, first_opened_at,
       public_code_worcester, public_code_shrewsbury, note, created_by_name, updated_by_name)
    values
      (v_name, p_testing_date, p_start_time, p_where_code, p_registration_open, p_auto_close_on,
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

revoke execute on function public.star_add_event(text, date, time, text, boolean, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_add_event(text, date, time, text, boolean, date, text) to authenticated;

-- 0023's star_update_event (0023 section 6), word for word:

-- ---------------------------------------------------------------------
-- 6. star_update_event(...) - REPLACED (0006 section 18i; M5)
-- Identical to 0006's version - same arguments, checks, answers, owner
-- and rights - except ONE addition (rulebook v0.504, "an edit never
-- reopens registration by itself"):
--   the event's registration state is worked out before the save and as
--   it would be after it (star_event_state, today in Massachusetts). If
--   it was NOT open and the new dates would make it open - which only
--   happens with the switch Open:
--     case 1: an upcoming event closed by its passed closing date, and
--             the edit removes that date or sets a later one
--     case 2: a finished event moved into the future (no closing date,
--             or one still to come)
--   then the same update also turns the switch to Closed. One write, one
--   version bump, one history row (before -> after shows
--   registration_open true -> false), all in this one call. Opening stays
--   by hand (Open registration in the ... menu).
-- The answer is unchanged ({"status":"ok","version":n}); the app already
-- knows when this happens (starEventRules.editWouldReopen) and shows
-- "Registration stays closed". Its second call (star_set_registration
-- with Open = false) now finds the switch already closed: no write, ok.
-- Everything else as 0006:
--   testing date: a CHANGED date must be today or later (a past event may
--     keep its date; moving it into the future makes it Upcoming again)
--   closing date: a CHANGED one must not be in the past; any closing date
--     must be on or before the (new) testing date
--   The Registration switch is NOT an argument (the dialog calls
--   star_set_registration when the switch changed). The event's copy of
--   the rubrics is never touched. Same values -> nothing written.
-- locks: the event (update)
-- Ok: {"status":"ok","version":n}
-- ---------------------------------------------------------------------
create or replace function public.star_update_event(
  p_event_id         uuid,
  p_expected_version integer,
  p_name             text,
  p_testing_date     date,
  p_start_time       time,
  p_where_code       text,
  p_auto_close_on    date,
  p_note             text
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
  v_after       public.star_events;   -- the event as it would be after the save (M5)
  v_keep_closed boolean := false;     -- M5: this save also turns the switch to Closed
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

    -- M5 (v0.504): would these dates make registration open again by
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
           where_code        = p_where_code,
           auto_close_on     = p_auto_close_on,
           note              = v_note,
           registration_open = case when v_keep_closed then false else e.registration_open end
     where e.id = p_event_id
       and (e.name is distinct from v_name
            or e.testing_date is distinct from p_testing_date
            or e.start_time is distinct from p_start_time
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

-- 0006's rights, word for word ("create or replace" kept them; this makes
-- sure they are exactly these).
revoke execute on function public.star_update_event(uuid, integer, text, date, time, text, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_update_event(uuid, integer, text, date, time, text, date, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. star_public_answer, star_home_today, star_public_event: 0006's
--    versions back (no end_time key)
-- ---------------------------------------------------------------------

-- 16h. star_public_answer(candidate) - the "You're registered" answer
-- the family page shows: only what that family just sent plus the event
-- facts. No DOB, no email, no signature, nothing about anyone else -
-- and the same shape whether or not the person looks like a duplicate.
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

-- 19g. star_home_today()   S   (v0.154, v0.155)   volatile: it runs the
-- signature clean-up as its last step
-- Home's Star cards for today: the events whose testing date is today
-- (counts = ACTIVE candidates WITHOUT a private day, per school) and the
-- private testings whose day is today (active), by time. No payment,
-- DOB or email. The location switcher filters in the app.
-- Ok: {"status":"ok","today":"YYYY-MM-DD",
--      "events":[{id, name, start_time, where_code, where_name, counts:{worcester, shrewsbury}}],
--      "private":[{candidate_id, event_id, event_name, private_time, first_name, last_name,
--                  location_code, dan, stars_from, stars_to}]}
-- locks: none, except the clean-up: signature rows (update, skip locked)
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
    -- the same mapping as the write functions (section 18): a rare table
    -- rule or lock problem answers a status instead of an error, and
    -- everything this call did (for the CSV: its download row) is undone
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

-- 20a. star_public_event(p_code) - what the family page shows first. The
-- code is one of the event's two links; the column it matched sets the
-- school. An unknown or badly formed code - or one that matches more than
-- one event (should never happen; refused rather than guessing a school)
-- -> {"status":"not_found"}.
-- Ok: {"status":"ok","state":"open"|"not_open"|"closed"|"finished",
--      "closed_on":date|null,"school":{code, name},
--      "event":{name, testing_date, start_time "HH:MM", note, auto_close_on,
--               where:{name, address|null}},
--      "dans":[{dan, label, star_limit, standard_cents, same_day_cents,
--               pass_mark, max_score, categories:[{name, credits}]}]}
-- No private fee, no counts, no ids.
-- locks: none (a read)
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

-- ---------------------------------------------------------------------
-- 4. The table rule, the read right and the column
-- ---------------------------------------------------------------------
alter table public.star_events drop constraint if exists star_events_end_time_check;

do $$
begin
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'public.star_events'::regclass and a.attname = 'end_time' and not a.attisdropped) then
    revoke select (end_time) on public.star_events from authenticated;
  end if;
end
$$;

alter table public.star_events drop column if exists end_time;

commit;

-- End of 0041u_undo_star_end_time.sql
