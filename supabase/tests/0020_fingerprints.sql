-- =====================================================================
-- 0020_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query, one row, about the only function migration 0020 replaces:
--   public.current_session_id(), in 0014_fingerprints.sql's format (kind,
--   item, detail). The detail has: body_md5 (an md5 of its code without
--   comments and spaces), language, volatility (s = stable), security
--   definer, settings (must say search_path=""), owner, and who may call
--   it (role:EXECUTE, sorted).
--
-- WHY
--   supabase/tests/pglite/run.mjs prints this row for the tested copy.
--   After Jeffrey pastes 0020 into the SQL Editor, Claude runs this on
--   production through the read-only connection and the row must match
--   exactly. That proves production has exactly the code and rights that
--   passed the tests. Run it BEFORE pasting too: that row is 0001's
--   version (the undo script must give it back exactly).
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses.
-- =====================================================================

select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' lang=' || l.lanname
         || ' volatility=' || p.provolatile::text
         || ' returns=' || p.prorettype::regtype::text
         || ' definer=' || p.prosecdef::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname = 'public'
   and p.proname = 'current_session_id'
 order by 1, 2;
