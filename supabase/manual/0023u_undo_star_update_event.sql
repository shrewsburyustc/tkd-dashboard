-- =====================================================================
-- 0023u_undo_star_update_event.sql   (UNDO of migration 0023's two
--                                     replaced functions)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Puts back 0006's exact versions of the two functions 0023 replaced,
--   copied word for word from 0006_star_testing.sql with their exact
--   revoke and grant:
--     * public.star_update_event (0006 section 18i) - M5 undone: an edit
--       that moves a finished event into the future no longer closes
--       registration by itself; the app's second call
--       (star_set_registration, Open = false) closes it, as before 0023.
--     * public.star_results_csv (0006 section 18zd) - the CSV rows lose
--       candidate_id, paid_on and sent.result_status again. Put the app
--       back to a version that doesn't need those keys FIRST.
--
-- WHY A SEPARATE FILE
--   Re-running the whole 0006 file would do the same, but this touches
--   only the two functions 0023 replaced. Paste it ONLY with Jeffrey's OK
--   (supabase/SETUP.md, Migration 0023, 0023e).
--
-- WHAT IT DOES NOT UNDO (on purpose)
--   The table star_result_texts, its rule, triggers and seed, and the
--   functions star_set_result_text / star_result_text_problem stay. They
--   are harmless while the app doesn't use them (nothing else reads or
--   calls them; staff can only read the three texts). Removing them would
--   need its own reviewed script and Jeffrey's OK.
--
-- AFTERWARDS
--   0006_fingerprints.sql's star_update_event and star_results_csv lines
--   must equal the ones written down BEFORE 0023 was applied (SETUP
--   0023a). Tested in PGlite (run.mjs step0023). To redo: paste 0023
--   again. One transaction: on any error nothing is kept.
-- =====================================================================

begin;

-- 18i. star_update_event(p_event_id, p_expected_version, p_name,
--        p_testing_date, p_start_time, p_where_code, p_auto_close_on,
--        p_note)   A
-- Edit event: name, date, start time, where, closing date and note.
--   testing date: a CHANGED date must be today or later (a past event may
--     keep its date; moving it into the future makes it Upcoming again)
--   closing date: a CHANGED one must not be in the past; any closing date
--     must be on or before the (new) testing date
-- The Registration switch is NOT here: the dialog calls
-- star_set_registration afterwards when the switch changed. The event's
-- copy of the rubrics is never touched. Same values -> nothing written.
-- locks: the event (update)
-- Ok: {"status":"ok","version":n}
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
  v_today      date;
  v_name       text;
  v_note       text;
  v_e          public.star_events;
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

    perform set_config('tkd.action', 'star_update_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_events e
       set name          = v_name,
           testing_date  = p_testing_date,
           start_time    = p_start_time,
           where_code    = p_where_code,
           auto_close_on = p_auto_close_on,
           note          = v_note
     where e.id = p_event_id
       and (e.name is distinct from v_name
            or e.testing_date is distinct from p_testing_date
            or e.start_time is distinct from p_start_time
            or e.where_code is distinct from p_where_code
            or e.auto_close_on is distinct from p_auto_close_on
            or e.note is distinct from v_note)
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

revoke execute on function public.star_update_event(uuid, integer, text, date, time, text, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_update_event(uuid, integer, text, date, time, text, date, text) to authenticated;

-- 18zd. star_results_csv(p_event_id, p_dan)   A   (volatile: it writes the
-- download log)
-- The results CSV (v0.144): every ACTIVE candidate of the event (p_dan
-- NULL) or of one Dan, in belt order (Dan, star, school Shrewsbury then
-- Worcester, last name, first name), with raw values incl. DOB and email.
-- The download row (who, when, event, Dan, how many rows) is written
-- FIRST, in the same call: a refused call writes nothing, and if anything
-- fails afterwards the whole call - log row included - is undone and only
-- a status comes back (the section 18 error mapping), never rows. No action tag: it writes star_downloads, not
-- change_log. The words and the file name are the app's.
-- locks: none (the event is only read)
-- Ok: {"status":"ok","rows":[{dan, first_name, last_name, location_code,
--      stars_from, stars_to, date_of_birth, email_for_results, paying_by,
--      is_makeup, paid, paid_cents, classes_attended, assistant_classes,
--      total, result_status, needs, sent}]}
create or replace function public.star_results_csv(
  p_event_id uuid,
  p_dan      integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e    public.star_events;
  v_n    integer;
  v_rows jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_event_id is null or (p_dan is not null and p_dan < 1) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_e from public.star_events e where e.id = p_event_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if p_dan is not null
       and not exists (select 1 from public.star_event_dans d where d.event_id = p_event_id and d.dan = p_dan) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select count(*) into v_n from public.star_candidates c
     where c.event_id = p_event_id and c.status = 'active' and (p_dan is null or c.dan = p_dan);

    insert into public.star_downloads (event_id, event_name, dan, row_count, downloaded_at, downloaded_by, downloaded_by_name)
    values (p_event_id, v_e.name, p_dan, v_n, now(), auth.uid(), public.change_log_actor_name());

    select coalesce(jsonb_agg(x.row order by x.dan, x.stars_from, x.loc_order, x.last_key, x.first_key, x.id), '[]'::jsonb)
      into v_rows
      from (select c.id, c.dan, c.stars_from,
                   case c.location_code when 'shrewsbury' then 0 else 1 end as loc_order,
                   lower(c.last_name) as last_key, lower(c.first_name) as first_key,
                   jsonb_build_object(
                     'dan',               c.dan,
                     'first_name',        c.first_name,
                     'last_name',         c.last_name,
                     'location_code',     c.location_code,
                     'stars_from',        c.stars_from,
                     'stars_to',          c.stars_from + 1,
                     'date_of_birth',     c.date_of_birth,
                     'email_for_results', c.email_for_results,
                     'paying_by',         c.paying_by,
                     'is_makeup',         c.is_makeup,
                     'paid',              public.star_net_paid_cents(c.id) > 0,
                     'paid_cents',        public.star_net_paid_cents(c.id),
                     'classes_attended',  c.classes_attended,
                     'assistant_classes', c.assistant_classes,
                     'total',             r.res -> 'total',
                     'result_status',     r.res -> 'status',
                     'needs',             r.res -> 'needs',
                     'sent',              case when s.st -> 'sent' = 'null'::jsonb then null
                                               else jsonb_build_object('marked_at', s.st -> 'sent' -> 'marked_at',
                                                                       'marked_by_name', s.st -> 'sent' -> 'marked_by_name',
                                                                       'matches', s.st -> 'matches') end) as row
              from public.star_candidates c
              cross join lateral (select public.star_candidate_result(c.id) as res) as r
              cross join lateral (select public.star_sent_state(c.id, r.res) as st) as s
             where c.event_id = p_event_id and c.status = 'active' and (p_dan is null or c.dan = p_dan)) as x;

    return jsonb_build_object('status', 'ok', 'rows', v_rows);
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

revoke execute on function public.star_results_csv(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_results_csv(uuid, integer) to authenticated;


commit;
