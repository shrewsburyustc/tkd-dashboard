-- =====================================================================
-- 0003_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query that lists every function migration 0003 creates (names
--   starting testing_ or change_log_) with a "fingerprint" of it:
--     body_md5         - an md5 hash of the function's code with all
--                        comments and spaces taken out (same code = same hash)
--     security_definer - true if it runs with its owner's rights
--     settings         - its fixed settings (must say search_path="")
--     owner            - which role owns it (postgres)
--     execute_rights   - who may call it, as role:EXECUTE, sorted
--                        ("-" would mean PUBLIC = everyone)
--   (security_definer, settings, owner, execute_rights: amended after
--   security review)
--
-- WHY
--   0003 is tested in PGlite (supabase/tests/pglite/run.mjs prints the
--   same list), then Jeffrey pastes it into the Supabase SQL Editor. Claude
--   then runs this query on production through the read-only connection
--   and compares: every line must match the tested copy. That proves the
--   production functions have exactly the code, the settings and the
--   call rights that passed the tests.
--   (Comments and spaces are ignored in body_md5 so that harmless
--   reformatting by an editor can't cause a false alarm.)
--
-- CONNECTOR-SAFE: this file is a single read-only SELECT, and none of its
-- text uses the words the Supabase connection refuses.
-- =====================================================================

select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '') as settings,
       p.proowner::regrole::text as owner,
       coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                   order by a.grantee::regrole::text, a.privilege_type)
                   from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as execute_rights
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (p.proname like 'testing\_%' or p.proname like 'change\_log\_%')
 order by 1, 2;
