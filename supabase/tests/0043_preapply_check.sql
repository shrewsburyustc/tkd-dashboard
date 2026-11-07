-- =====================================================================
-- 0043_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0043 (Camps Fill in,
--   rulebook v0.740 / v0.741; SETUP.md 0043a). One row:
--     old_core            is the 16-input camp_public_signup_core there?
--                         (1 before 0043, 0 after)
--     new_core            is the 18-input one there? (0 before, 1 after)
--     replaced_found      how many of the three functions 0043 replaces
--                         exist, one version each (camp_public_signup_core,
--                         camp_public_signup, camp_camper_detail): 3
--     replaced_as_tested  how many of those three still have EXACTLY the
--                         code 0043 was built on (0022's core and
--                         camp_camper_detail, 0013's camp_public_signup -
--                         body md5 without comments and spaces, as in the
--                         fingerprint files)
--     applied_as_tested   how many of them have EXACTLY 0043's code
--     new_functions       how many of camp_staff_form / camp_staff_signup
--                         exist (0 before, 2 after)
--     new_columns         how many of camp_signups.source / entered_by
--                         exist (0 before, 2 after)
--     signups             how many sign-ups there are (information only:
--                         0043 gives each one source 'form', no name)
--
-- WHY
--   0043 replaces three live functions with copies of their 0013 / 0022
--   code plus Fill in. If another change had replaced one of them since,
--   pasting 0043 would silently undo that change.
--     1 / 0 / 3 / 3 / 0 / 0 / 0 / n  -> go on (nothing of 0043 yet, all
--                                       as tested)
--     0 / 1 / 3 / 0 / 3 / 2 / 2 / n  -> 0043 is already applied
--   Anything else: stop and tell Claude (a function changed since it was
--   tested - 0043 must be rebuilt on the newer code first).
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0043) checks this, and that
-- it answers the "go on" row before 0043 and the "already applied" row
-- after it.
-- =====================================================================

with f as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('camp_public_signup_core', 'camp_public_signup', 'camp_camper_detail')
), built_on (proname, body_md5) as (
  values ('camp_public_signup_core', 'dc876c1c0b77a5019255c9201f6729b3'),     -- 0022
         ('camp_public_signup',      '191fcde75d77b7a4aed217c098b29e61'),   -- 0013
         ('camp_camper_detail',      'a2a3455a947bc38bca9dc80d93cb0600')    -- 0022
), applied (proname, body_md5) as (
  values ('camp_public_signup_core', '1f96cf44d5b09d3a5f98b3bd57510d07'),     -- 0043
         ('camp_public_signup',      'dbfec7466753e9184f6c25c31b1a829f'),   -- 0043
         ('camp_camper_detail',      'a2ea4d4c610a541ee1b26812a3c7254c')    -- 0043
)
select (to_regprocedure('public.camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)') is not null)::integer
                                                                                              as old_core,
       (to_regprocedure('public.camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer, text, text)') is not null)::integer
                                                                                              as new_core,
       (select count(distinct f.proname)::integer from f
         where (select count(*) from f as g where g.proname = f.proname) = 1)                as replaced_found,
       (select count(*)::integer from f join built_on t on t.proname = f.proname and t.body_md5 = f.body_md5) as replaced_as_tested,
       (select count(*)::integer from f join applied t on t.proname = f.proname and t.body_md5 = f.body_md5)  as applied_as_tested,
       ((to_regprocedure('public.camp_staff_form(uuid)') is not null)::integer
        + (to_regprocedure('public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)') is not null)::integer)
                                                                                              as new_functions,
       (select count(*)::integer from pg_attribute a
         where a.attrelid = to_regclass('public.camp_signups') and a.attname in ('source', 'entered_by')
           and a.atttypid <> 0)                                                          as new_columns,
       (select count(*)::integer from public.camp_signups)                                    as signups;
