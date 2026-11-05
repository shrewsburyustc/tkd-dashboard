-- =====================================================================
-- 0036_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0036 (each child's
--   last name and date of birth, the Address question; rulebook v0.634 -
--   v0.639), and again before its undo. One row:
--     new_columns          how many of prospects.child_last_name and
--                          prospects.child_dob are there (0 before 0036,
--                          2 after)
--     size_rule_4000       does form_submissions_size_check allow a
--                          children list of 4000 bytes? (false before
--                          0036: 0009's rule says 2000; true after)
--     staff_submission_columns  how many form_submissions columns the app
--                          (role authenticated) may read straight from
--                          the table (15 before 0036, as 0009 granted;
--                          4 after: id, form_id, location_code, created_at)
--     replaced_found       how many of the eight functions 0036 replaces
--                          exist, one each (forms_fields_are_valid,
--                          forms_template, forms_check_answers,
--                          forms_submit_core, prospects_from_submission,
--                          prospects_list, prospects_search,
--                          prospects_get)
--     replaced_as_tested   how many of those eight still have EXACTLY the
--                          code 0036 was tested against (0009's, 0012's
--                          and 0031's - body md5 without comments and
--                          spaces, as in the fingerprint files)
--     forms_with_address         forms with an Address question in their
--                                draft or published field list
--     signups_over_2000          sign-ups whose children list is over 2000
--                                bytes
--     prospects_with_new_details prospects with a last name or a date of
--                                birth
--     (The last three are what 0036's undo refuses on. Before 0036 they
--     are always 0: nothing could save them.)
--
-- WHY
--   0036 replaces eight live functions with copies of their 0009 / 0012
--   / 0031 code plus its changes. If another change had replaced one of
--   them since, pasting 0036 would silently undo that change.
--     0 / false / 15 / 8 / 8 / 0 / 0 / 0  -> go on (nothing of 0036 yet,
--                                            all as tested)
--     2 / true  / 4  / 8 / 0 / ...        -> 0036 is already applied
--   Anything else: stop and tell Claude (a function changed since it was
--   tested - 0036 must be rebuilt on the newer code first).
--   Before the UNDO (SETUP 0036e): the last three must all be 0, or the
--   undo file stops and changes nothing.
--   The prospects are read through to_jsonb(), so this query works
--   before 0036 too (the two columns aren't there yet).
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs checks this, and that it answers
-- 0 / false / 15 / 8 / 8 / 0 / 0 / 0 before 0036,
-- 2 / true / 4 / 8 / 0 / 0 / 0 / 0 after it, and the "before" answer
-- again after the undo.
-- =====================================================================

with f as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('forms_fields_are_valid', 'forms_template', 'forms_check_answers', 'forms_submit_core',
                       'prospects_from_submission', 'prospects_list', 'prospects_search', 'prospects_get')
), tested (proname, body_md5) as (
  values ('forms_fields_are_valid',    '47b36b561782677a95356c3ac73a5445'),   -- 0009
         ('forms_template',            '294c032b0ee94bd75ed4ffae2d530885'),   -- 0009
         ('forms_check_answers',       'b5a9f2ba80eaba105a600f7f30cca826'),   -- 0009
         ('forms_submit_core',         'bb7117a7c463101457843df41cca0317'),   -- 0031
         ('prospects_from_submission', '6ba3195fcd7f395009119a2ebaf0c39d'),   -- 0012
         ('prospects_list',            'b0f64ec2fc0eb4417c7a7ba10574d655'),   -- 0012
         ('prospects_search',          'c8404d6fe3041b0539c4c55478d2dc67'),   -- 0012
         ('prospects_get',             '7482cc4e1cd57b614b821cb3d5522765')    -- 0012
)
select (select count(*)::integer from pg_attribute a
         where a.attrelid = to_regclass('public.prospects')
           and a.attname in ('child_last_name', 'child_dob'))                                as new_columns,
       coalesce((select pg_get_constraintdef(c.oid) like '%(children)::text) <= 4000)%'
                   from pg_constraint c
                  where c.conrelid = to_regclass('public.form_submissions')
                    and c.conname = 'form_submissions_size_check'), false)                   as size_rule_4000,
       (select count(*)::integer from pg_attribute a
         where a.attrelid = to_regclass('public.form_submissions') and a.attnum > 0
           and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))         as staff_submission_columns,
       (select count(distinct f.proname)::integer from f
         where (select count(*) from f as g where g.proname = f.proname) = 1)                as replaced_found,
       (select count(*)::integer from f join tested t on t.proname = f.proname and t.body_md5 = f.body_md5) as replaced_as_tested,
       (select count(*)::integer from public.forms x
         where exists (select 1 from jsonb_array_elements(x.draft) e where e ->> 'type' = 'address')
            or exists (select 1 from jsonb_array_elements(coalesce(x.published, '[]'::jsonb)) e
                        where e ->> 'type' = 'address'))                                     as forms_with_address,
       (select count(*)::integer from public.form_submissions s
         where octet_length(s.children::text) > 2000)                                         as signups_over_2000,
       (select count(*)::integer from public.prospects p
         where to_jsonb(p) ->> 'child_last_name' is not null
            or to_jsonb(p) ->> 'child_dob' is not null)                                       as prospects_with_new_details;
