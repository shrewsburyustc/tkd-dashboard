-- =====================================================================
-- 0035_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0035 (SETUP.md 0035a),
--   and again AFTER it (0035c) and after an undo (0035e). One row:
--     old_event_is_0005    true = testing_mark_paid(uuid, integer) is
--                          exactly 0005's code (section 14i)
--     old_private_is_0014  true = testing_private_mark_paid(uuid, integer)
--                          is exactly 0014's code (section 8e)
--     old_versions         how many functions are called testing_mark_paid
--                          or testing_private_mark_paid (2 before 0035 -
--                          one each, 2 arguments; 0 after it)
--     by_functions         true = 0030's testing_mark_paid_by and
--                          testing_private_mark_paid_by are there (the
--                          app's Mark paid; 0035 refuses to run without)
--     by_bodies_are_0030   true = both are exactly 0030's tested code
--     other_users          what else in the database names the old
--                          functions (another function's code, a view,
--                          a read rule). Must be empty (NULL).
--   A body is recognised by the md5 of its code with every comment and
--   every space taken out - the same "body_md5" the fingerprint files
--   print, so a change of comments or spacing alone doesn't count.
--     0005's testing_mark_paid:              f6917e2950465a1b0ba1757084e85755
--     0014's testing_private_mark_paid:      4b683897cbe670435c5c5dd712b551f6
--     0030's testing_mark_paid_by:           d43f4bab7a1fdf970eed5a7851a4b326
--     0030's testing_private_mark_paid_by:   fb09eddf5771f5adfa3919164770f0d2
--
-- WHY
--   Before 0035: true, true, 2, true, true, NULL. Anything else - stop and
--   tell Claude (an old function changed since, or something still uses
--   it, or 0030 is not what was tested).
--   After 0035: false, false, 0, true, true, NULL.
--   After an undo: as before 0035.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0035) checks this, and its
-- answers before 0035, after it, and after the undo.
-- =====================================================================

with fn as (
  select p.proname::text as name, p.pronargs as nargs,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('testing_mark_paid', 'testing_private_mark_paid', 'testing_mark_paid_by', 'testing_private_mark_paid_by')
),
users as (
  select 'function ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as who
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and p.proname not in ('testing_mark_paid', 'testing_private_mark_paid')
     and p.prosrc ~ '(testing_mark_paid|testing_private_mark_paid)([^_a-z0-9]|$)'
  union all
  select 'view ' || v.schemaname || '.' || v.viewname
    from pg_views v
   where v.schemaname not in ('pg_catalog', 'information_schema')
     and v.definition ~ '(testing_mark_paid|testing_private_mark_paid)([^_a-z0-9]|$)'
  union all
  select 'read rule ' || pol.schemaname || '.' || pol.tablename || '.' || pol.policyname
    from pg_policies pol
   where coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')
         ~ '(testing_mark_paid|testing_private_mark_paid)([^_a-z0-9]|$)'
)
select coalesce((select bool_and(f.nargs = 2 and f.body_md5 = 'f6917e2950465a1b0ba1757084e85755') from fn f
                  where f.name = 'testing_mark_paid'), false) as old_event_is_0005,
       coalesce((select bool_and(f.nargs = 2 and f.body_md5 = '4b683897cbe670435c5c5dd712b551f6') from fn f
                  where f.name = 'testing_private_mark_paid'), false) as old_private_is_0014,
       (select count(*) from fn f where f.name in ('testing_mark_paid', 'testing_private_mark_paid'))::integer as old_versions,
       (to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer)') is not null
        and to_regprocedure('public.testing_private_mark_paid_by(uuid, integer, text, integer)') is not null) as by_functions,
       coalesce((select bool_and(case f.name when 'testing_mark_paid_by' then f.body_md5 = 'd43f4bab7a1fdf970eed5a7851a4b326'
                                             else f.body_md5 = 'fb09eddf5771f5adfa3919164770f0d2' end)
                   from fn f where f.name in ('testing_mark_paid_by', 'testing_private_mark_paid_by')), false) as by_bodies_are_0030,
       (select string_agg(u.who, ', ' order by u.who) from users u) as other_users;
