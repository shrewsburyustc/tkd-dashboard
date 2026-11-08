-- =====================================================================
-- 0048_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0048 (SETUP.md 0048a),
--   and again AFTER it and after an undo (0048e). One row:
--     csv_is_0025   true = the CSV download (bb_results_csv, 1 input) is
--                   exactly 0025's function (Shrewsbury first) - nothing
--                   else changed it since; false after 0048
--     csv_is_0048   true = it is already 0048's function (Worcester first)
--     csv_versions  how many bb_results_csv functions exist (must be 1)
--   A body is recognised by the md5 of its code with every comment and
--   every space taken out - the same "body_md5" the fingerprint files
--   print, so a change of comments or spacing alone doesn't count.
--     0025's bb_results_csv: 3bf1eb21bc8c435c695525fd27f4ec68
--     0048's bb_results_csv: 0a0e6884e67191fbd7379ca7fc40905a
--
-- WHY
--   Before 0048: true / false / 1. A false / false pair means someone
--   changed the function since 0025 - stop and tell Claude (0048 must
--   then be rebuilt on the newer code). After 0048: false / true / 1.
--   After an undo: as before 0048. After any re-run of 0025: back to
--   true / false / 1 - run 0048 again.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0048) checks this, and its
-- answers before 0048, after it, and after the undo.
-- =====================================================================

with fn as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'bb_results_csv'
)
select coalesce((select bool_and(f.body_md5 = '3bf1eb21bc8c435c695525fd27f4ec68') from fn f), false) as csv_is_0025,
       coalesce((select bool_and(f.body_md5 = '0a0e6884e67191fbd7379ca7fc40905a') from fn f), false) as csv_is_0048,
       (select count(*) from fn f)::integer as csv_versions;
