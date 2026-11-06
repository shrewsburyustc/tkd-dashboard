-- =====================================================================
-- 0042_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0042 ("Copy to
--   Worcester / Shrewsbury", rulebook v0.642; SETUP.md 0042a), and again
--   AFTER it and after an undo (0042e). One row:
--     copy_versions      how many forms_copy_to_school functions exist
--                        (0 before 0042; 1 after - one version, arguments
--                        uuid + text)
--     copy_is_0042       true = the one that exists is exactly 0042's
--                        (false before 0042: there is none)
--     duplicate_is_0031  true = forms_duplicate is still exactly 0031's
--                        (section 11). 0042 copies its pattern (checks,
--                        lock, logging), so this shows the Forms functions
--                        are still the ones 0042 was built and tested
--                        next to
--     schools            how many of the two schools 0042 copies between
--                        exist in public.locations (worcester,
--                        shrewsbury): must be 2
--   A body is recognised by the md5 of its code with every comment and
--   every space taken out - the same "body_md5" the fingerprint files
--   print, so a change of comments or spacing alone doesn't count.
--     0031's forms_duplicate:      0643ad3576c681daed5e3175f41284bb
--     0042's forms_copy_to_school: 72c5c12845b75462313c8364237a403b
--
-- WHY
--   Before 0042: 0 / false / true / 2 -> go on.
--   duplicate_is_0031 = false means someone changed forms_duplicate since
--   0031 - stop and tell Claude (0042 may need the same change).
--   After 0042: 1 / true / true / 2.
--   After an undo: as before 0042.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0042) checks this, and its
-- answers before 0042, after it, and after the undo.
-- =====================================================================

with fn as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('forms_copy_to_school', 'forms_duplicate')
)
select (select count(*) from fn f where f.proname = 'forms_copy_to_school')::integer as copy_versions,
       coalesce((select bool_and(f.body_md5 = '72c5c12845b75462313c8364237a403b') from fn f
                  where f.proname = 'forms_copy_to_school'), false)                         as copy_is_0042,
       coalesce((select bool_and(f.body_md5 = '0643ad3576c681daed5e3175f41284bb') from fn f
                  where f.proname = 'forms_duplicate'), false)                              as duplicate_is_0031,
       (select count(*) from public.locations l where l.code in ('worcester', 'shrewsbury'))::integer as schools;
