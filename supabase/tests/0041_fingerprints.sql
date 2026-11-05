-- =====================================================================
-- 0041_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0041 (Star event end time,
--   rulebook v0.520) made or replaced, one row each, in
--   0028_fingerprints.sql's format (kind, item, detail):
--     function    the five functions it replaced (star_add_event,
--                 star_update_event, star_public_answer, star_home_today,
--                 star_public_event): body_md5 (an md5 of its code
--                 without comments and spaces), language, volatility,
--                 return type, security definer, settings (must say
--                 search_path=""), owner, and who may call it
--                 (role:EXECUTE, sorted)
--     column      star_events.end_time: type, not null, and who may
--                 read it (authenticated, SELECT only)
--     constraint  its table rule star_events_end_time_check (exact
--                 definition)
--
-- WHY
--   Same idea as 0028_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0041) prints these rows for the tested copy. After Jeffrey pastes
--   0041 into the SQL Editor, he runs this file there (or Claude runs it
--   through the read-only connection) and every row must match exactly.
--   That proves production has exactly the code, rights and rules that
--   passed the tests. (Before 0041 it lists only the five older
--   functions, with their old inputs.)
--   Expected change elsewhere: in 0006_fingerprints.sql the lines of
--   these five functions (star_add_event and star_update_event with one
--   more input, the other three only their body md5) and the star_events
--   table line (its column rights now include end_time); in
--   0023_fingerprints.sql the star_update_event line (one more input).
--   Every other line - and every other fingerprint file - stays.
--   Sorted with collate "C" (byte order), so PGlite and production list
--   the rows in the same order.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses. run.mjs checks this.
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
   and p.proname in ('star_add_event', 'star_update_event', 'star_public_answer', 'star_home_today', 'star_public_event')
union all
select 'column',
       t.attrelid::regclass::text || '.' || t.attname,
       format_type(t.atttypid, t.atttypmod) || ' notnull=' || t.attnotnull::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(t.attacl) as a), '')
  from pg_attribute t
 where t.attrelid = to_regclass('public.star_events')
   and t.attname = 'end_time'
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       c.contype::text || ' ' || pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid = to_regclass('public.star_events')
   and c.conname = 'star_events_end_time_check'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
