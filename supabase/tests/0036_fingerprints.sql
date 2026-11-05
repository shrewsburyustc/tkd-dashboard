-- =====================================================================
-- 0036_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0036 (each child's last name
--   and date of birth, the Address question; rulebook v0.634 - v0.639)
--   made or replaced, one row each:
--     function       the eight functions it replaced
--                    (forms_fields_are_valid, forms_template,
--                    forms_check_answers, forms_submit_core,
--                    prospects_from_submission, prospects_list,
--                    prospects_search, prospects_get): body_md5 (an md5
--                    of its code without comments and spaces), security
--                    definer, settings (must say search_path=""), owner,
--                    and who may call it (role:EXECUTE, sorted; "-" would
--                    mean PUBLIC)
--     function-kind  the same eight: volatility and return type
--     column         prospects.child_last_name and prospects.child_dob:
--                    type, not null, and who may read them (nobody: the
--                    app reads them only through prospects_list /
--                    prospects_get)
--     constraint     the two new rules on prospects and the size rule of
--                    form_submissions (exact definitions)
--     table          form_submissions: RLS on, the table's rights, and the
--                    columns the app may read straight from it (after
--                    0036 only id, form_id, location_code, created_at)
--
-- WHY
--   Same idea as 0031_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints these rows for the tested copy. After Jeffrey pastes 0036 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and the rows must match. That proves production has
--   exactly the code, rights and rules that passed the tests. (Before
--   0036 it lists only the eight older functions and the old size rule:
--   compare those with the 0009 / 0012 / 0031 records - and its
--   form_submissions row then shows 0009's fifteen readable columns.)
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
         || ' definer=' || p.prosecdef::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('forms_fields_are_valid', 'forms_template', 'forms_check_answers', 'forms_submit_core',
                     'prospects_from_submission', 'prospects_list', 'prospects_search', 'prospects_get')
union all
select 'function-kind',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'volatility=' || p.provolatile::text || ' returns=' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('forms_fields_are_valid', 'forms_template', 'forms_check_answers', 'forms_submit_core',
                     'prospects_from_submission', 'prospects_list', 'prospects_search', 'prospects_get')
union all
select 'column',
       t.attrelid::regclass::text || '.' || t.attname,
       format_type(t.atttypid, t.atttypmod) || ' notnull=' || t.attnotnull::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(t.attacl) as a), '')
  from pg_attribute t
 where t.attrelid = to_regclass('public.prospects')
   and t.attname in ('child_last_name', 'child_dob')
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       c.contype::text || ' ' || pg_get_constraintdef(c.oid)
  from pg_constraint c
 where (c.conrelid = to_regclass('public.prospects') and c.conname in ('prospects_child_last_name_check', 'prospects_child_dob_check'))
    or (c.conrelid = to_regclass('public.form_submissions') and c.conname = 'form_submissions_size_check')
union all
select 'table',
       c.relname,
       'rls=' || c.relrowsecurity::text
         || ' grants=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                       order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                       from aclexplode(c.relacl) as a), '')
         || ' columns=' || coalesce((select string_agg(att.attname || ':' || array_to_string(att.attacl, ';'), ','
                                                        order by att.attname collate "C")
                                        from pg_attribute att
                                       where att.attrelid = c.oid and att.attacl is not null), '')
  from pg_class c
 where c.oid = to_regclass('public.form_submissions')
) as fp
 order by fp.kind collate "C", fp.item collate "C";
