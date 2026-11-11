-- =====================================================================
-- 0049u_undo.sql   (UNDO of migration 0049)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0049 (the top-bar people search, Dashboard core M16,
--   rulebook v1.144) back out: it removes the one function 0049 added,
--   public.people_search(text, text). 0049 changed nothing else - no
--   table, rule, right or other function, and the function only ever read -
--   so nothing else needs putting back and no data is touched.
--
-- WHY A SEPARATE FILE
--   0049 only adds; re-running it can't take anything away. Paste this
--   ONLY with Jeffrey's OK (SETUP.md, Migration 0049, 0049e), and only
--   after the app is back to a version whose top bar has no search (with
--   the function gone, that search box would only show an error).
--
-- AFTERWARDS
--   0049_fingerprints.sql answers no row, every other fingerprint file is
--   unchanged, and 0049_preapply_check.sql answers as before 0049:
--   people_search_versions 0, people_search_is_0049 false. Tested in PGlite
--   (run.mjs step0049). To redo: paste 0049 again. Running this file twice
--   is safe ("if exists"). One transaction: on any error nothing is kept.
--   Supabase will warn about a destructive operation: that is the one
--   function being removed - no data. Confirm.
-- =====================================================================

begin;

drop function if exists public.people_search(text, text);

commit;

-- End of 0049u_undo.sql
