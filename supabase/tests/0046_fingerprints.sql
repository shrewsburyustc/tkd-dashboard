-- =====================================================================
-- 0046_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with two rows about migration 0046 (Black Belt: payments
--   count at the desk's school): the TWO functions 0046 replaces,
--   bb_record_payment (now with p_school) and bb_record_refund (now with
--   p_school), in 0032_fingerprints.sql's format (kind, item, detail):
--   body_md5 (an md5 of its code without comments and spaces), language,
--   volatility (v = volatile), return type, security definer, settings
--   (must say search_path=""), owner, and who may call it (role:EXECUTE,
--   sorted). The item names the inputs, so the old 6-input / 5-input
--   versions would show as different lines.
--
-- WHY
--   Same idea as 0034_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0046) prints these rows for the tested copy. After Jeffrey pastes
--   0046 into the SQL Editor, he runs this file there (or Claude runs it
--   through the read-only connection) and the rows must match exactly.
--   That proves production has exactly the code and rights that passed
--   the tests.
--   Expected change elsewhere: in 0016_fingerprints.sql (it lists every
--   bb_ function of 0016) only these two lines change - the item (the
--   inputs) and the body md5 - and every other fingerprint file stays as
--   it was.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses. run.mjs checks this.
-- =====================================================================

select fp.* from (
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
   and p.proname in ('bb_record_payment', 'bb_record_refund')
) as fp
 order by fp.kind collate "C", fp.item collate "C";
