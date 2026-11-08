-- =====================================================================
-- 0045_calendar_items.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   New students / Calendar: the Calendar shows every section's dated
--   things (rulebook v0.645; contract docs/Prospects/CONTRACT-0045.md;
--   plan docs/Prospects/TKD-Calendar-AllEvents-Plan.md). It ADDS one
--   read-only function and changes nothing else - no table, no rule, no
--   data, no other function, no right:
--     public.calendar_items(p_from date, p_to date)
--
-- WHY IT EXISTS
--   The Calendar screen used to show only a few things. Jeffrey
--   (2026-11-06: "B: one reader", "A: show them", "OK, build it") wants it
--   to show what every other section has on a date: Color Belt events and
--   private testings, Star events and private tests, camp days, Black Belt
--   testing days, new sign-ups, and the sections' deadlines. One function
--   gathers them all, so the Calendar makes ONE call per month or week
--   instead of one call per section (and no section's own readers change).
--
-- WHAT IT RETURNS
--   {"status":"ok","items":[ ... ]}, one item per dated thing, sorted by
--   date, then start time (all-day first), then kind, then id. Dates are
--   Massachusetts days. Every item always has the same 13 keys (null when
--   a key doesn't apply): kind, id, date, start, end, location_code,
--   title, child, what, place, opens, ref_id, event_id (checked key by
--   key in supabase/tests/0045_tests.sql).
--   The kinds: colorbelt_event, colorbelt_private, star_event,
--   star_private, camp_day, bb_day, signup, deadline.
--   Other answers: {"status":"no_access"} (not signed in, a PIN-locked
--   desk, no staff row) and {"status":"invalid"} (a missing or infinite
--   date, an end before the start, or more than 63 days: at most 62 days
--   apart).
--
-- WHAT IT NEVER RETURNS
--   Dates of birth, ages, phone numbers, emails, addresses, form answers,
--   notes, payments, last names, signatures, a child's full name, Finance.
--   A child is only ever "Ava N." (first name + the first letter of the
--   child's own last name; for a sign-up from before last names were asked,
--   the first letter of the parent's last word; the first name alone when
--   there is neither). The parent's name and the children's last names are
--   read INSIDE the function to make that one letter and never leave it.
--   Cancelled and withdrawn private tests are left out.
--
-- WHY IT IS SAFE
--   * Read only: the function is declared STABLE (Postgres itself refuses
--     any write, purge or history row inside it), and it contains no
--     insert, update or other write. It builds no SQL from text.
--   * Security definer with search_path = '' and fully qualified names;
--     has_data_access() is checked FIRST (is_admin() is not used: staff
--     and admins may both call it, like prospects_list), then the input.
--   * EXECUTE is taken from everyone and given to signed-in staff
--     ("authenticated") only - nothing for anon or the public forms'
--     logins.
--   * The answer is bounded: at most 63 days of dates.
--   * The live app keeps working: it never calls the new name. Only the
--     new Calendar does.
--   Proof before pasting: supabase/tests/0045_preapply_check.sql
--   (SETUP.md, Migration 0045, 0045a).
--
-- WHO MAY CALL IT
--   Staff and admins with data access, through the app (the Calendar).
--
-- HOW TO RUN IT
--   After 0005, 0006, 0012, 0013, 0014, 0016, 0022, 0036 and 0041 (all
--   live): it stops, and changes nothing, if a table or column it reads is
--   missing. Supabase dashboard -> SQL Editor -> New query -> paste this
--   WHOLE file -> Run. One transaction ("begin;" ... "commit;"): if any
--   statement fails, nothing is kept. Safe to run again (tested in PGlite,
--   run.mjs step0045: a second run changes no fingerprint).
--   Undo: SETUP.md, "Migration 0045", 0045e - paste
--   supabase/manual/0045u_undo.sql (it takes this one function away).
--   DEPLOY ORDER: this file must be live BEFORE the app version whose
--   Calendar calls calendar_items.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: every table and column the function reads (64 columns of
--    12 tables) must exist. Stops - and changes nothing - if one is missing.
-- ---------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  -- every table.column the function reads, checked one by one (a missing table lists all its columns)
  select string_agg(w.t || '.' || w.c, ', ') into v_missing
    from (values
      ('testing_events', 'id'), ('testing_events', 'location_code'), ('testing_events', 'name'),
      ('testing_events', 'testing_date'), ('testing_events', 'auto_close_on'), ('testing_event_classes', 'event_id'),
      ('testing_event_classes', 'start_time'), ('testing_event_classes', 'end_time'), ('testing_private', 'id'),
      ('testing_private', 'location_code'), ('testing_private', 'first_name'), ('testing_private', 'last_name'),
      ('testing_private', 'status'), ('testing_private', 'private_date'), ('testing_private', 'private_time'),
      ('star_events', 'id'), ('star_events', 'name'), ('star_events', 'testing_date'),
      ('star_events', 'start_time'), ('star_events', 'end_time'), ('star_events', 'auto_close_on'),
      ('star_candidates', 'id'), ('star_candidates', 'event_id'), ('star_candidates', 'first_name'),
      ('star_candidates', 'last_name'), ('star_candidates', 'location_code'), ('star_candidates', 'status'),
      ('star_candidates', 'private_on'), ('star_candidates', 'private_time'), ('camps', 'id'),
      ('camps', 'location_code'), ('camps', 'both_schools'), ('camps', 'name'),
      ('camps', 'start_time'), ('camps', 'end_time'), ('camps', 'signup_opens_on'),
      ('camps', 'signup_closes_on'), ('camps', 'early_until'), ('camp_days', 'camp_id'),
      ('camp_days', 'day'), ('bb_cycles', 'id'), ('bb_cycles', 'name'),
      ('bb_cycles', 'application_due'), ('bb_cycles', 'submissions_due'), ('bb_cycle_days', 'id'),
      ('bb_cycle_days', 'cycle_id'), ('bb_cycle_days', 'name'), ('bb_cycle_days', 'day_date'),
      ('bb_cycle_days', 'start_time'), ('bb_cycle_days', 'end_time'), ('bb_cycle_days', 'second_end'),
      ('bb_cycle_days', 'place_code'), ('bb_cycle_days', 'place_other'), ('forms', 'id'),
      ('forms', 'name'), ('form_submissions', 'id'), ('form_submissions', 'form_id'),
      ('form_submissions', 'location_code'), ('form_submissions', 'created_at'), ('form_submissions', 'parent_name'),
      ('prospects', 'id'), ('prospects', 'submission_id'), ('prospects', 'child_first_name'),
      ('prospects', 'child_last_name')
    ) as w(t, c)
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = to_regclass('public.' || w.t) and a.attname = w.c and a.attnum > 0);
  if v_missing is not null then
    raise exception '0045 needs migrations 0005, 0006, 0012, 0013, 0014, 0016, 0036 and 0041 first (missing: %)', v_missing;
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. calendar_items(from, to) - what the other sections have on each day
--    (rulebook v0.645)
-- ---------------------------------------------------------------------
-- Items per kind (see the contract's table):
--   colorbelt_event   testing_events: its date; start = earliest class
--                     start, end = latest class end (none -> all day)
--   colorbelt_private testing_private (active only): date + time; "Ava N."
--   star_event        star_events: date, start, end (joint: no school)
--   star_private      star_candidates with a private test (active only):
--                     date + time; "Leo N."; the Star event's id too
--   camp_day          camp_days of a camp: the camp's daily times; no
--                     school when the camp is for both
--   bb_day            bb_cycle_days: start, and the end of the second part
--                     when there is one; the day's own name; a free-text
--                     place; no school unless the place is a school
--   signup            one per child (prospect) of a new sign-up, on the
--                     Massachusetts day it was sent; "Ava N."
--   deadline          registration closes (Color Belt, Star), camp sign-up
--                     opens / closes / early price ends, Black Belt
--                     application / submissions due: that day, all day
-- Order: date, start (all-day first), kind, id. "C" collation makes kind
-- and id sort the same on every database (PGlite and Supabase differ).
-- Refused: no_access; invalid (a null date, to before from, over 63 days).
-- Ok: {"status":"ok","items":[...]}
create or replace function public.calendar_items(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
  -- infinity is checked first: subtracting it would raise an error instead of answering invalid
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'kind', s.kind, 'id', s.id, 'date', to_char(s.d, 'YYYY-MM-DD'),
             'start', to_char(s.st, 'HH24:MI'), 'end', to_char(s.en, 'HH24:MI'),
             'location_code', s.loc, 'title', s.title, 'child', s.child, 'what', s.what, 'place', s.place,
             'opens', s.opens, 'ref_id', s.ref_id, 'event_id', s.event_id)
           order by s.d, s.st nulls first, s.kind collate "C", s.id collate "C")
      from (
        -- Color Belt events (times from the event's own copy of its classes)
        select 'colorbelt_event'::text as kind, e.id::text as id, e.testing_date as d, c.st as st, c.en as en,
               e.location_code as loc, e.name as title, null::text as child, null::text as what, null::text as place,
               'colorbelt_event'::text as opens, e.id::text as ref_id, null::text as event_id
          from public.testing_events e
          left join lateral (select min(k.start_time) as st, max(k.end_time) as en
                               from public.testing_event_classes k where k.event_id = e.id) c on true
         where e.testing_date between p_from and p_to
        union all
        -- Color Belt private testings (active only)
        select 'colorbelt_private', t.id::text, t.private_date, t.private_time, null::time,
               t.location_code, 'Private',
               t.first_name || coalesce(nullif(' ' || upper(left(btrim(t.last_name), 1)) || '.', ' .'), ''),
               null, null, 'colorbelt_private', t.id::text, null
          from public.testing_private t
         where t.status = 'active' and t.private_date between p_from and p_to
        union all
        -- Star events (joint: no school)
        select 'star_event', v.id::text, v.testing_date, v.start_time, v.end_time,
               null, v.name, null, null, null, 'star_event', v.id::text, null
          from public.star_events v
         where v.testing_date between p_from and p_to
        union all
        -- Star private tests (a candidate with a private day, not withdrawn)
        select 'star_private', c.id::text, c.private_on, c.private_time, null::time,
               c.location_code, 'Private',
               c.first_name || coalesce(nullif(' ' || upper(left(btrim(c.last_name), 1)) || '.', ' .'), ''),
               null, null, 'star_private', c.id::text, c.event_id::text
          from public.star_candidates c
          join public.star_events v on v.id = c.event_id
         where c.status = 'active' and c.private_on is not null and c.private_on between p_from and p_to
        union all
        -- Camp days
        select 'camp_day', p.id::text || ':' || to_char(d.day, 'YYYY-MM-DD'), d.day, p.start_time, p.end_time,
               case when p.both_schools then null else p.location_code end, p.name, null, null, null,
               'camp', p.id::text, null
          from public.camp_days d
          join public.camps p on p.id = d.camp_id
         where d.day between p_from and p_to
        union all
        -- Black Belt testing days
        select 'bb_day', d.id::text, d.day_date, d.start_time, coalesce(d.second_end, d.end_time),
               d.place_code, y.name, null, d.name, d.place_other, 'bb_cycle', y.id::text, null
          from public.bb_cycle_days d
          join public.bb_cycles y on y.id = d.cycle_id
         where d.day_date between p_from and p_to
        union all
        -- New sign-ups: one per child, on the Massachusetts day it was sent. The child's own last
        -- name (or, for older sign-ups, the parent's last word) gives the one letter; nothing else
        -- of the sign-up leaves the function.
        select 'signup', p.id::text, (s2.created_at at time zone 'America/New_York')::date, null::time, null::time,
               s2.location_code, f.name,
               p.child_first_name || coalesce(nullif(' ' || q.ini || '.', ' .'), ''),
               null, null, 'prospect', p.id::text, null
          from public.prospects p
          join public.form_submissions s2 on s2.id = p.submission_id
          join public.forms f on f.id = s2.form_id
         cross join lateral (
               select coalesce(nullif(upper(left(btrim(coalesce(p.child_last_name, '')), 1)), ''),
                               case when btrim(s2.parent_name) ~ '\s'
                                    then upper(left((regexp_match(btrim(s2.parent_name), '(\S+)$'))[1], 1))
                                    else '' end) as ini) q
         where (s2.created_at at time zone 'America/New_York')::date between p_from and p_to
        union all
        -- Deadlines: Color Belt and Star registration closes
        select 'deadline', e.id::text || ':registration_closes', e.auto_close_on, null::time, null::time,
               e.location_code, e.name, null, 'registration_closes', null, 'colorbelt_event', e.id::text, null
          from public.testing_events e
         where e.auto_close_on between p_from and p_to
        union all
        select 'deadline', v.id::text || ':registration_closes', v.auto_close_on, null::time, null::time,
               null, v.name, null, 'registration_closes', null, 'star_event', v.id::text, null
          from public.star_events v
         where v.auto_close_on between p_from and p_to
        union all
        -- Deadlines: a camp's sign-up opens / closes and its early price ends
        select 'deadline', p.id::text || ':' || w.what, w.dt, null::time, null::time,
               case when p.both_schools then null else p.location_code end, p.name, null, w.what, null,
               'camp', p.id::text, null
          from public.camps p
         cross join lateral (values ('signup_opens', p.signup_opens_on),
                                    ('signup_closes', p.signup_closes_on),
                                    ('early_price_ends', p.early_until)) as w(what, dt)
         where w.dt between p_from and p_to
        union all
        -- Deadlines: a Black Belt cycle's applications and submissions due
        select 'deadline', y.id::text || ':' || w.what, w.dt, null::time, null::time,
               null, y.name, null, w.what, null, 'bb_cycle', y.id::text, null
          from public.bb_cycles y
         cross join lateral (values ('applications_due', y.application_due),
                                    ('submissions_due', y.submissions_due)) as w(what, dt)
         where w.dt between p_from and p_to
      ) as s), '[]'::jsonb));
end;
$$;

-- Rights: nobody, then signed-in staff only. Nothing for anon.
revoke all on function public.calendar_items(date, date) from public, anon, authenticated, service_role;
grant  execute on function public.calendar_items(date, date) to authenticated;


commit;

-- End of 0045_calendar_items.sql
