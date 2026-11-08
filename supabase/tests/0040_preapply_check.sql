-- =====================================================================
-- 0040_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0040 (the clean-up
--   after 0036: forms stop accepting a child sent as { first_name, age }
--   and an Address answer sent as one plain text; rulebook v0.640;
--   SETUP.md 0040a), and again AFTER it and after an undo (0040e). One
--   row:
--     check_is_0036    true  = forms_check_answers (one version) is
--                      exactly 0036's
--     check_is_0040    true  = it is exactly 0040's
--     submit_is_0036   true  = forms_submit_core (one version) is
--                      exactly 0036's
--     submit_is_0040   true  = it is exactly 0040's
--     profile_in       true  = 0036 is applied (prospects.child_dob is
--                      there)
--     old_shape_signups  how many saved sign-ups still hold a child in the
--                      old shape { first_name, age } (no date of birth).
--                      They are history: 0040 never touches them (the
--                      table refuses any change to a sign-up) - the count
--                      is only shown so you know it can be above 0
--   A body is recognised by the md5 of its code with every comment and
--   every space taken out - the same "body_md5" the fingerprint files
--   print, so a change of comments or spacing alone doesn't count.
--     0036's forms_check_answers: e0cfb494a50bc97364811bbfbeb727af
--     0040's forms_check_answers: 9f091ef38f440d9d812d8bce7f3fd4dc
--     0036's forms_submit_core:   0f7695175947d82bccddd0db87e66400
--     0040's forms_submit_core:   36f2025c9c15c5473f64ad498dd1e99b
--
-- WHY
--   Before 0040: true / false / true / false / true -> go on.
--   Any other answer before 0040 (a function is neither 0036's nor 0040's)
--   means someone changed it since 0036 was tested - stop and tell Claude
--   (0040 would silently undo that change).
--   After 0040: false / true / false / true / true.
--   After an undo (re-pasting 0036): as before 0040.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0040) checks this, and its
-- answers before 0040, after it, and after the undo.
-- =====================================================================

with fn as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('forms_check_answers', 'forms_submit_core')
)
select coalesce((select count(*) = 1 and bool_and(f.body_md5 = 'e0cfb494a50bc97364811bbfbeb727af') from fn f
                  where f.proname = 'forms_check_answers'), false)                          as check_is_0036,
       coalesce((select count(*) = 1 and bool_and(f.body_md5 = '9f091ef38f440d9d812d8bce7f3fd4dc') from fn f
                  where f.proname = 'forms_check_answers'), false)                          as check_is_0040,
       coalesce((select count(*) = 1 and bool_and(f.body_md5 = '0f7695175947d82bccddd0db87e66400') from fn f
                  where f.proname = 'forms_submit_core'), false)                            as submit_is_0036,
       coalesce((select count(*) = 1 and bool_and(f.body_md5 = '36f2025c9c15c5473f64ad498dd1e99b') from fn f
                  where f.proname = 'forms_submit_core'), false)                            as submit_is_0040,
       exists (select 1 from information_schema.columns c
                where c.table_schema = 'public' and c.table_name = 'prospects'
                  and c.column_name = 'child_dob')                                          as profile_in,
       (select count(*)::integer from public.form_submissions s
         where exists (select 1 from jsonb_array_elements(s.children) c where not (c ? 'dob')))  as old_shape_signups;
