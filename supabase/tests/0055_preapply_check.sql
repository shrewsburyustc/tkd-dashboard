-- =====================================================================
-- 0055_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0055 (Black Belt: the
--   roster gains "paid_on"), and again right after. One row:
--     roster_is_0025   true = the roster function (bb_cycle_roster, 1
--                      input) is exactly 0025's (nothing else changed it
--                      since); false after 0055
--     roster_is_0055   true = it is already 0055's function
--     roster_versions  how many bb_cycle_roster functions exist (must be 1)
--   A body is recognised by the md5 of its code with every comment and
--   every space taken out - the same "body_md5" the fingerprint files
--   print.
--     0025's bb_cycle_roster: b7bcfd84fd802df5cdacbbd10eea20d7
--     0055's bb_cycle_roster: 5e8c053932bb48deeaad4b5161bdd4d4
--   Before 0055: true / false / 1. A false / false pair means someone
--   changed the function since 0025 - stop and tell Claude (0055 must
--   then be rebuilt; its guard would refuse anyway). After 0055: false /
--   true / 1.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses (run.mjs checks that).
-- =====================================================================

with fn as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'bb_cycle_roster'
)
select coalesce((select bool_and(f.body_md5 = 'b7bcfd84fd802df5cdacbbd10eea20d7') from fn f), false) as roster_is_0025,
       coalesce((select bool_and(f.body_md5 = '5e8c053932bb48deeaad4b5161bdd4d4') from fn f), false) as roster_is_0055,
       (select count(*) from fn f)::integer as roster_versions;
