-- =====================================================================
-- 0053_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing the three Board breaking functions migration 0053
--   replaces: brk_payments_guard (the append-only rule of the payments
--   table), and the two functions that remove a student and remove an event
--   (their names start with brk_del). One row each, in
--   0051_fingerprints.sql's own "function" format (kind, item, detail):
--   body_md5 (an md5 of the code without comments and spaces), language,
--   volatility, return type, security definer, settings (must say
--   search_path=""), owner, and who may call it (role:EXECUTE, sorted).
--   The two staff functions are for authenticated only; the guard is for
--   nobody but the owner.
--
-- WHY
--   Same idea as the other *_fingerprints.sql files: supabase/tests/pglite/
--   run.mjs (step0053) prints these rows for the tested copy; after Jeffrey
--   pastes 0053 into the SQL Editor, Claude runs this file on production
--   through the read-only connection and all three rows must match exactly.
--   0051_fingerprints.sql lists the same three functions, so its three lines
--   change with 0053 - expected; run.mjs checks that ONLY those three
--   lines (and only their code md5) change.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses the
-- words the Supabase connection refuses (that is why the two function
-- names are found by their first letters). The rows are sorted byte by byte
-- (collate "C"), so the order is the same in PGlite and on production.
-- =====================================================================

select fp.kind, fp.item, fp.detail from (
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
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname = 'public'
   and (p.proname = 'brk_payments_guard' or p.proname like 'brk\_del%')
) as fp
 order by fp.kind collate "C", fp.item collate "C";
