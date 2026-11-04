-- =====================================================================
-- 0034_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0034 (SETUP.md 0034a),
--   and again AFTER it and after an undo (0034e). One row:
--     body_is_0032     true = bb_candidate_history is exactly 0032's
--                      reader (no record_id), i.e. nothing else changed
--                      it since; false after 0034
--     body_is_0034     true = it is already 0034's reader (with record_id)
--     versions         how many bb_candidate_history functions exist
--                      (must be 1 - one version, argument uuid)
--     strip_helper     true = 0032's bb_history_strip is there (the
--                      reader needs it)
--   A body is recognised by the md5 of its code with every comment and
--   every space taken out - the same "body_md5" the fingerprint files
--   print, so a change of comments or spacing alone doesn't count.
--     0032's body: 1cc24c95127dd0151933efade802e46a
--     0034's body: 5f41c349f9eae85e8651d9f02d336d70
--
-- WHY
--   Before 0034: body_is_0032 true, body_is_0034 false, versions 1,
--   strip_helper true. body_is_0032 = false with body_is_0034 = false
--   means someone changed the function since 0032 - stop and tell Claude.
--   After 0034: body_is_0032 false, body_is_0034 true.
--   After an undo: as before 0034.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0034) checks this, and its
-- answers before 0034, after it, and after the undo.
-- =====================================================================

with fn as (
  select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'bb_candidate_history'
)
select coalesce((select bool_and(f.body_md5 = '1cc24c95127dd0151933efade802e46a') from fn f), false) as body_is_0032,
       coalesce((select bool_and(f.body_md5 = '5f41c349f9eae85e8651d9f02d336d70') from fn f), false) as body_is_0034,
       (select count(*) from fn)::integer as versions,
       (to_regprocedure('public.bb_history_strip(jsonb)') is not null) as strip_helper;
