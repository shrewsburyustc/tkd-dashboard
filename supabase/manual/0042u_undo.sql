-- =====================================================================
-- 0042u_undo.sql   (UNDO of migration 0042)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0042 ("Copy to Worcester / Shrewsbury", rulebook
--   v0.642) back out: it removes the one function 0042 added,
--   public.forms_copy_to_school(uuid, text). 0042 changed nothing else -
--   no table, rule, right or other function - so nothing else needs
--   putting back.
--   No data is touched: forms already copied with it stay as ordinary
--   forms at their school (the admin edits, publishes or removes them as
--   any other form), and their history rows stay in change_log.
--
-- WHY A SEPARATE FILE
--   0042 only adds; re-running it can't take anything away. Paste this
--   ONLY with Jeffrey's OK (SETUP.md, Migration 0042, 0042e), and only
--   after the app is back to a version without "Copy to Worcester /
--   Shrewsbury" (with the function gone, that menu item would only show
--   the "couldn't save" bar).
--
-- AFTERWARDS
--   0009_fingerprints.sql must equal the one written down BEFORE 0042 was
--   applied (SETUP 0042a: its two forms_copy_to_school lines are gone
--   again), 0042_fingerprints.sql answers no row, and
--   0042_preapply_check.sql answers as before 0042: copy_versions 0,
--   copy_is_0042 false. Tested in PGlite (run.mjs step0042). To redo:
--   paste 0042 again. Running this file twice is safe ("if exists").
--   One transaction: on any error nothing is kept.
--   Supabase will warn about a destructive operation: that is the one
--   function being removed - no data. Confirm.
-- =====================================================================

begin;

drop function if exists public.forms_copy_to_school(uuid, text);

commit;

-- End of 0042u_undo.sql
