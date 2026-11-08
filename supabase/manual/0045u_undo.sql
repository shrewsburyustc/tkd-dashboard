-- =====================================================================
-- 0045u_undo.sql   (UNDO of migration 0045)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0045 (the Calendar reader, rulebook v0.645) back out:
--   it removes the one function 0045 added, public.calendar_items(date,
--   date). 0045 changed nothing else - no table, rule, right or other
--   function, and the function only ever read - so nothing else needs
--   putting back and no data is touched.
--
-- WHY A SEPARATE FILE
--   0045 only adds; re-running it can't take anything away. Paste this
--   ONLY with Jeffrey's OK (SETUP.md, Migration 0045, 0045e), and only
--   after the app is back to a version whose Calendar doesn't call
--   calendar_items (with the function gone, that Calendar would only show
--   "Couldn't load the other sections' dates.").
--
-- AFTERWARDS
--   0045_fingerprints.sql answers no row, every other fingerprint file is
--   unchanged, and 0045_preapply_check.sql answers as before 0045:
--   calendar_versions 0, calendar_is_0045 false. Tested in PGlite
--   (run.mjs step0045). To redo: paste 0045 again. Running this file twice
--   is safe ("if exists"). One transaction: on any error nothing is kept.
--   Supabase will warn about a destructive operation: that is the one
--   function being removed - no data. Confirm.
-- =====================================================================

begin;

drop function if exists public.calendar_items(date, date);

commit;

-- End of 0045u_undo.sql
