-- =====================================================================
-- 0049_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0049 (the top-bar
--   people search people_search, Dashboard core M16, rulebook v1.144;
--   SETUP.md 0049a), and again AFTER it and after an undo (0049e). One row:
--     people_search_versions  how many people_search functions exist
--                             (0 before 0049; 1 after - one version,
--                             arguments text + text)
--     people_search_is_0049   true = the one that exists is exactly 0049's
--                             (false before 0049: there is none)
--     needs_found             how many of the 48 columns 0049 reads exist, in
--                             the 12 tables testing_registrations,
--                             testing_events, testing_private,
--                             star_candidates, star_events, bb_candidates,
--                             bb_cycles, camp_campers, camps, prospects,
--                             form_submissions, forms (the same list the
--                             migration's guard checks; includes prospects'
--                             child_last_name (0036)). Must be 48.
--   A body is recognised by the md5 of its code with every comment and
--   every space taken out - the same "body_md5" the fingerprint files
--   print, so a change of comments or spacing alone doesn't count.
--     0049's people_search: 0f8c1fe14f3aa1d2ae6ac1ee19758db3
--
-- WHY
--   Before 0049: 0 / false / 48 -> go on.
--   needs_found below 48 means an earlier migration is missing - stop and
--   tell Claude (0049 would refuse to run anyway).
--   After 0049: 1 / true / 48.
--   After an undo: as before 0049.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0049) checks this, and its
-- answers before 0049, after it, and after the undo.
-- =====================================================================

with fn as (
  select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'people_search'
)
select (select count(*) from fn)::integer as people_search_versions,
       coalesce((select bool_and(f.body_md5 = '0f8c1fe14f3aa1d2ae6ac1ee19758db3') from fn f), false) as people_search_is_0049,
       (select count(*) from (values
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
        where exists (select 1 from pg_attribute a
                       where a.attrelid = to_regclass('public.' || w.t) and a.attname = w.c and a.attnum > 0))::integer as needs_found;
