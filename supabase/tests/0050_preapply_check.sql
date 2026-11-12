-- =====================================================================
-- 0050_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0050 (Camps: one family
--   link and one roster per school, rulebook v0.757; SETUP.md 0050a). One
--   row:
--     old_staff_signup    is the 15-input camp_staff_signup there?
--                         (1 before 0050, 0 after)
--     new_staff_signup    is the 16-input one there? (0 before, 1 after)
--     replaced_found      how many of the three functions 0050 replaces
--                         exist, one version each (camp_public_camp,
--                         camp_public_signup, camp_staff_signup): 3
--     replaced_as_tested  how many of the FOUR things 0050 replaces still
--                         have EXACTLY what 0050 was built on: the three
--                         functions' code (0013's camp_public_camp, 0043's
--                         camp_public_signup and camp_staff_signup - body
--                         md5 without comments and spaces, as in the
--                         fingerprint files) and the camp_roster view
--                         (0039's - an md5 of its definition)
--     applied_as_tested   how many of those four have EXACTLY 0050's
--     new_functions       how many of camps_keep_public_code_2 /
--                         camp_signups_set_school exist (0 before, 2 after)
--     new_columns         how many of camp_signups.school /
--                         camps.public_code_2 exist (0 before, 2 after)
--     signups             how many sign-ups there are (information only:
--                         each takes its camp's own school)
--     both_camps          how many camps are for both schools
--                         (information only: each gets a second family
--                         link)
--
-- WHY
--   0050 replaces three live functions and the roster view with copies of
--   their 0013 / 0039 / 0043 versions plus the school. If another change
--   had replaced one of them since, pasting 0050 would silently undo that
--   change.
--     1 / 0 / 3 / 4 / 0 / 0 / 0 / n / m  -> go on (nothing of 0050 yet,
--                                           all as tested)
--     0 / 1 / 3 / 0 / 4 / 2 / 2 / n / m  -> 0050 is already applied
--   Anything else: stop and tell Claude (something changed since it was
--   tested - 0050 must be rebuilt on the newer code first).
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0050) checks this, and that
-- it answers the "go on" row before 0050 and the "already applied" row
-- after it.
-- =====================================================================

with f as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('camp_public_camp', 'camp_public_signup', 'camp_staff_signup')
), x (name, md5) as (
  select f.proname::text, f.body_md5 from f
  union all
  select 'camp_roster', md5(pg_get_viewdef(c.oid))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'camp_roster'
), built_on (name, md5) as (
  values ('camp_public_camp',   '7f1a67a98a5dfdf655eb492b19c4676a'),   -- 0013
         ('camp_public_signup', 'dbfec7466753e9184f6c25c31b1a829f'),   -- 0043
         ('camp_staff_signup',  '2c71c988778d667b8efeb94ffe22652a'),   -- 0043
         ('camp_roster',        '7d5e502cb563a572b40cfc9fdd09e3fe')    -- 0039
), applied (name, md5) as (
  values ('camp_public_camp',   '5cf26a5339f4fd29f8c47a7ea976d92b'),   -- 0050
         ('camp_public_signup', 'c3eb96a532be8ae6f9db310377693890'),   -- 0050
         ('camp_staff_signup',  '5d9a4b33459949d1ca0e1c0e90832e10'),   -- 0050
         ('camp_roster',        'e386fd0343464e7efce77c33bbea51d5')    -- 0050
)
select (to_regprocedure('public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)') is not null)::integer
                                                                                              as old_staff_signup,
       (to_regprocedure('public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer, text)') is not null)::integer
                                                                                              as new_staff_signup,
       (select count(distinct f.proname)::integer from f
         where (select count(*) from f as g where g.proname = f.proname) = 1)                as replaced_found,
       (select count(*)::integer from x join built_on t on t.name = x.name and t.md5 = x.md5) as replaced_as_tested,
       (select count(*)::integer from x join applied t on t.name = x.name and t.md5 = x.md5)  as applied_as_tested,
       ((to_regprocedure('public.camps_keep_public_code_2()') is not null)::integer
        + (to_regprocedure('public.camp_signups_set_school()') is not null)::integer)         as new_functions,
       (select count(*)::integer from pg_attribute a
         where a.atttypid <> 0
           and ((a.attrelid = to_regclass('public.camp_signups') and a.attname = 'school')
                or (a.attrelid = to_regclass('public.camps') and a.attname = 'public_code_2'))) as new_columns,
       (select count(*)::integer from public.camp_signups)                                    as signups,
       (select count(*)::integer from public.camps c where c.both_schools)                    as both_camps;
