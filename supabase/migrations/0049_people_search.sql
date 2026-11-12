-- =====================================================================
-- 0049_people_search.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Dashboard core / M16: the top-bar "Search people" (rulebook v0.12,
--   v1.031, v1.144; picture docs/Dashboard Core/Mockups/M16-people-search).
--   It ADDS one read-only function and changes nothing else - no table, no
--   rule, no data, no other function, no right:
--     public.people_search(p_query text, p_school text)
--
-- WHY IT EXISTS
--   Today every list has its own search box, and Color Belt's and Star's
--   rosters have none, so to find a family you must first know which section
--   they are in. Jeffrey (2026-11-11: "A for all") wants ONE box in the top
--   bar that finds a person in any section: Color Belt (event registrations
--   and private testings), Star, Black Belt, Camps and New students.
--
-- WHAT IT RETURNS
--   {"status":"ok","results":[ ... ]}: at most 25 people per kind, kinds in
--   this order: colorbelt, colorbelt_private, star, black_belt, camp,
--   prospect; inside a kind sorted by name, then id. Every result has the
--   same 6 keys (null when a key doesn't apply):
--     kind      one of the six above
--     id        the person's own id (what the app needs to open the summary)
--     event_id  the event / cycle / camp the person is in (null for a
--               private testing and for New students)
--     name      "Ava Chen" - or "Ava R." for New students
--     event     the event's / cycle's / camp's name (null when none)
--     school    'worcester' or 'shrewsbury' (null for a camp for both schools)
--   Other answers: {"status":"no_access"} (not signed in, a PIN-locked desk,
--   no staff row) and {"status":"invalid"} (a missing text, shorter than 2 or
--   longer than 80 characters after trimming, or a school that is not
--   'worcester', 'shrewsbury' or 'both').
--
-- WHAT IT NEVER RETURNS
--   (A New students child shows as "Ava R.": the child's own last-name
--   initial; else the initial of the LAST word of a parent name that has more
--   than one word; else just "Ava" - the same rule as the Calendar.)
--   Dates of birth, ages, phone numbers, emails, addresses, form answers,
--   notes, payments, signatures, a New students child's last name, a
--   parent's name, Finance. The text typed is matched ONLY against the name
--   that is shown (first + last name of a person; a child's first + last name
--   for New students: the last name is read inside the function to match and
--   to make the one letter "R." and never leaves it). Withdrawn and
--   cancelled people are left out. Ids are returned only to open a summary.
--
-- WHY IT IS SAFE
--   * Read only: the function is declared STABLE (Postgres itself refuses
--     any write inside it), contains no insert, update or other write, and
--     builds no SQL from text (the typed text is a pattern parameter, with %
--     _ and \ made literal).
--   * Security definer with search_path = '' and fully qualified names;
--     has_data_access() is checked FIRST (is_admin() is not used: staff and
--     admins may both call it, like prospects_list and calendar_items), then
--     the input.
--   * EXECUTE is taken from everyone and given to signed-in staff
--     ("authenticated") only - nothing for anon or the public forms' logins.
--   * The answer is bounded: at most 25 people per kind (150 in all).
--   * The live app keeps working: it never calls the new name. Only the new
--     search does.
--   Proof before pasting: supabase/tests/0049_preapply_check.sql (SETUP.md,
--   Migration 0049, 0049a).
--
-- WHO MAY CALL IT
--   Staff and admins with data access, through the app (the top-bar search).
--
-- HOW TO RUN IT
--   After 0005, 0006, 0012, 0013, 0014, 0016 and 0036 (all live): it stops,
--   and changes nothing, if a table or column it reads is missing. Supabase
--   dashboard -> SQL Editor -> New query -> paste this WHOLE file -> Run.
--   One transaction ("begin;" ... "commit;"): if any statement fails,
--   nothing is kept. Safe to run again (tested in PGlite, run.mjs step0049: a
--   second run changes no fingerprint).
--   Undo: SETUP.md, "Migration 0049", 0049e - paste
--   supabase/manual/0049u_undo.sql (it takes this one function away).
--   DEPLOY ORDER: this file must be live BEFORE the app version that has the
--   top-bar search.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: every table and column the function reads must exist.
--    Stops - and changes nothing - if one is missing.
-- ---------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(w.t || '.' || w.c, ', ') into v_missing
    from (values
      ('testing_registrations', 'id'), ('testing_registrations', 'event_id'), ('testing_registrations', 'first_name'),
      ('testing_registrations', 'last_name'), ('testing_registrations', 'status'),
      ('testing_events', 'id'), ('testing_events', 'name'), ('testing_events', 'location_code'),
      ('testing_private', 'id'), ('testing_private', 'first_name'), ('testing_private', 'last_name'),
      ('testing_private', 'location_code'), ('testing_private', 'status'),
      ('star_candidates', 'id'), ('star_candidates', 'event_id'), ('star_candidates', 'first_name'),
      ('star_candidates', 'last_name'), ('star_candidates', 'location_code'), ('star_candidates', 'status'),
      ('star_events', 'id'), ('star_events', 'name'),
      ('bb_candidates', 'id'), ('bb_candidates', 'cycle_id'), ('bb_candidates', 'first_name'),
      ('bb_candidates', 'last_name'), ('bb_candidates', 'location_code'), ('bb_candidates', 'status'),
      ('bb_cycles', 'id'), ('bb_cycles', 'name'),
      ('camp_campers', 'id'), ('camp_campers', 'camp_id'), ('camp_campers', 'first_name'),
      ('camp_campers', 'last_name'), ('camp_campers', 'status'),
      ('camps', 'id'), ('camps', 'name'), ('camps', 'location_code'), ('camps', 'both_schools'),
      ('prospects', 'id'), ('prospects', 'submission_id'), ('prospects', 'child_first_name'),
      ('prospects', 'child_last_name'), ('prospects', 'location_code'),
      ('form_submissions', 'id'), ('form_submissions', 'form_id'), ('form_submissions', 'parent_name'),
      ('forms', 'id'), ('forms', 'name')
    ) as w(t, c)
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = to_regclass('public.' || w.t) and a.attname = w.c and a.attnum > 0);
  if v_missing is not null then
    raise exception '0049 needs migrations 0005, 0006, 0012, 0013, 0014, 0016 and 0036 first (missing: %)', v_missing;
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. people_search(text, school) - find a person in any section
--    (rulebook v1.144)
-- ---------------------------------------------------------------------
-- p_school: 'worcester', 'shrewsbury' or 'both' (null or blank = both). A
-- single school keeps that school's people, and camps that are for both
-- schools.
-- Matching: the typed text anywhere in "first last" (ignoring case), with
-- % _ and \ taken literally. New students match on the child's first and
-- last name only (never the parent's name or phone).
-- Refused: no_access; invalid (text missing, under 2 or over 80 characters,
-- or an unknown school).
-- Ok: {"status":"ok","results":[...]}
create or replace function public.people_search(p_query text, p_school text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q      text;
  v_pat    text;
  v_school text;
begin
  if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;

  if p_query is null then return jsonb_build_object('status', 'invalid'); end if;
  v_q := btrim(p_query);
  if char_length(v_q) < 2 or char_length(v_q) > 80 then return jsonb_build_object('status', 'invalid'); end if;

  v_school := lower(coalesce(nullif(btrim(p_school), ''), 'both'));
  if v_school not in ('worcester', 'shrewsbury', 'both') then return jsonb_build_object('status', 'invalid'); end if;

  -- the typed text as a LIKE pattern with % _ and \ made literal (escape character is \)
  v_pat := '%' || replace(replace(replace(lower(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return jsonb_build_object(
    'status', 'ok',
    'results', coalesce((
      select jsonb_agg(
               jsonb_build_object('kind', r.kind, 'id', r.id, 'event_id', r.event_id,
                                  'name', r.name, 'event', r.event, 'school', r.school)
               order by r.rank, r.name collate "C", r.id::text collate "C")
        from (
          (select 1 as rank, 'colorbelt'::text as kind, g.id, g.event_id,
                  g.first_name || ' ' || g.last_name as name, e.name as event, e.location_code as school
             from public.testing_registrations g
             join public.testing_events e on e.id = g.event_id
            where g.status = 'active'
              and (v_school = 'both' or e.location_code = v_school)
              and lower(g.first_name || ' ' || g.last_name) like v_pat escape '\'
            order by g.first_name || ' ' || g.last_name collate "C", g.id::text collate "C"
            limit 25)
          union all
          (select 2, 'colorbelt_private', p.id, null::uuid,
                  p.first_name || ' ' || p.last_name, null::text, p.location_code
             from public.testing_private p
            where p.status = 'active'
              and (v_school = 'both' or p.location_code = v_school)
              and lower(p.first_name || ' ' || p.last_name) like v_pat escape '\'
            order by p.first_name || ' ' || p.last_name collate "C", p.id::text collate "C"
            limit 25)
          union all
          (select 3, 'star', c.id, c.event_id,
                  c.first_name || ' ' || c.last_name, e.name, c.location_code
             from public.star_candidates c
             join public.star_events e on e.id = c.event_id
            where c.status = 'active'
              and (v_school = 'both' or c.location_code = v_school)
              and lower(c.first_name || ' ' || c.last_name) like v_pat escape '\'
            order by c.first_name || ' ' || c.last_name collate "C", c.id::text collate "C"
            limit 25)
          union all
          (select 4, 'black_belt', b.id, b.cycle_id,
                  b.first_name || ' ' || b.last_name, y.name, b.location_code
             from public.bb_candidates b
             join public.bb_cycles y on y.id = b.cycle_id
            where b.status = 'active'
              and (v_school = 'both' or b.location_code = v_school)
              and lower(b.first_name || ' ' || b.last_name) like v_pat escape '\'
            order by b.first_name || ' ' || b.last_name collate "C", b.id::text collate "C"
            limit 25)
          union all
          (select 5, 'camp', m.id, m.camp_id,
                  m.first_name || ' ' || m.last_name, k.name,
                  case when k.both_schools then null else k.location_code end
             from public.camp_campers m
             join public.camps k on k.id = m.camp_id
            where m.status = 'active'
              and (v_school = 'both' or k.both_schools or k.location_code = v_school)
              and lower(m.first_name || ' ' || m.last_name) like v_pat escape '\'
            order by m.first_name || ' ' || m.last_name collate "C", m.id::text collate "C"
            limit 25)
          union all
          -- New students: "Ava R." - the child's first name + the first letter of the child's own last name; for a
          -- sign-up from before last names were asked, the first letter of the parent's last word (only when the
          -- parent's name has more than one word, exactly like the Calendar's calendar_items); the first name
          -- alone when there is neither. The last names are read here to match and to make the one letter, and never
          -- leave the function.
          (select 6, 'prospect', s.id, null::uuid,
                  s.child_first_name || coalesce(nullif(' ' || coalesce(
                    upper(left(nullif(btrim(s.child_last_name), ''), 1)),
                    case when btrim(f.parent_name) ~ '\s'
                         then upper(left((regexp_match(btrim(f.parent_name), '(\S+)$'))[1], 1)) end
                  ) || '.', ' .'), ''),
                  fm.name, s.location_code
             from public.prospects s
             join public.form_submissions f on f.id = s.submission_id
             left join public.forms fm on fm.id = f.form_id
            where (v_school = 'both' or s.location_code = v_school)
              and lower(coalesce(s.child_first_name, '') || ' ' || coalesce(s.child_last_name, '')) like v_pat escape '\'
            order by s.child_first_name collate "C", s.id::text collate "C"
            limit 25)
        ) as r(rank, kind, id, event_id, name, event, school)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.people_search(text, text) from public, anon, authenticated, service_role;
grant execute on function public.people_search(text, text) to authenticated;

commit;
