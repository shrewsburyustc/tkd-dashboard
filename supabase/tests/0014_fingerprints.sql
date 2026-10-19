-- =====================================================================
-- 0014_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0014 (Color Belt
--   phase 4: private testing), in 0010_fingerprints.sql's format (kind,
--   item, detail):
--     function   - the 2 internal helpers, the 3 new staff functions and
--                  the 9 functions 0014 replaces (14 rows), with:
--                  body_md5 (an md5 of its code without comments and
--                  spaces), security definer, settings (must say
--                  search_path=""), owner, and who may call it
--                  (role:EXECUTE, sorted)
--     column     - testing_registrations.private_date / private_time:
--                  type, nullable, and the exact rights on the column
--     constraint - the two new rules on testing_registrations, with the
--                  rule's full text
--   18 rows in all.
--
-- WHY
--   Same idea as 0005_fingerprints.sql and 0010_fingerprints.sql:
--   supabase/tests/pglite/run.mjs prints this list for the tested copy.
--   After Jeffrey pastes 0014 into the SQL Editor, Claude runs this on
--   production through the read-only connection and every line must
--   match. That proves production has exactly the code, rights and rules
--   that passed the tests.
--   (0005_fingerprints.sql and 0010_fingerprints.sql then differ ONLY in
--   the rows of the replaced functions and, for 0005, the
--   testing_registrations table row - expected; SETUP.md section 15b.)
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (removed columns are skipped
-- by their type, atttypid = 0, as in 0005_fingerprints.sql).
-- =====================================================================

with fns(name) as (
  values ('testing_private_time_is_valid'), ('testing_amount_due'),
         ('testing_set_private'), ('testing_clear_private'), ('testing_add_private_student'),
         ('testing_mark_paid'), ('testing_change_paying_by'), ('testing_purge_old_signatures'),
         ('testing_set_result'), ('testing_set_result_note'), ('testing_update_student'),
         ('testing_resolve_duplicate'), ('testing_restore_student'), ('testing_update_event')
)
select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' definer=' || p.prosecdef::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (select name from fns)
union all
select 'column',
       c.relname || '.' || t.attname,
       'type=' || format_type(t.atttypid, t.atttypmod)
         || ' nullable=' || (not t.attnotnull)::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(t.attacl) as a), '')
  from pg_attribute t
  join pg_class c on c.oid = t.attrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'testing_registrations'
   and t.attname in ('private_date', 'private_time')
   and t.attnum > 0 and t.atttypid <> 0
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid = to_regclass('public.testing_registrations')
   and c.conname in ('testing_registrations_private_pair_check', 'testing_registrations_private_time_check')
 order by 1, 2;
