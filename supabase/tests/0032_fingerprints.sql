-- =====================================================================
-- 0032_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with five rows about migration 0032 (Black Belt: testing
--   times every 5 minutes, the candidate History reader, Edit cycle's
--   Undo in one call): the ONE function 0032 replaces
--   (bb_time_is_valid) and the THREE it adds (bb_history_strip,
--   bb_candidate_history, bb_undo_cycle_edit), in 0028_fingerprints.sql's
--   format (kind, item, detail): body_md5 (an md5 of its code without
--   comments and spaces), language, volatility (i = immutable, s =
--   stable, v = volatile), return type, security definer, settings (must
--   say search_path=""), owner, and who may call it (role:EXECUTE,
--   sorted). The fifth row is the index 0032 adds on change_log
--   (kind "index", its full definition).
--
-- WHY
--   Same idea as 0028_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0032) prints these rows for the tested copy. After Jeffrey
--   pastes 0032 into the SQL Editor, he runs this file there (or Claude
--   runs it through the read-only connection) and the rows must match
--   exactly. That proves production has exactly the code and rights that
--   passed the tests.
--   Expected change elsewhere: in 0016_fingerprints.sql only the line of
--   bb_time_is_valid(p_time time) changes (its body md5) and the three
--   new functions' lines are added (0016's file lists every bb_
--   function); every other fingerprint file stays as it was.
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
   and p.proname in ('bb_time_is_valid', 'bb_history_strip', 'bb_candidate_history', 'bb_undo_cycle_edit')
union all
select 'index',
       i.tablename || '.' || i.indexname,
       i.indexdef
  from pg_indexes i
 where i.schemaname = 'public'
   and i.indexname = 'change_log_bb_candidate_child_idx'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
