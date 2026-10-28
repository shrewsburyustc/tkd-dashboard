-- =====================================================================
-- 0031_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0031 (class ages on
--   the booking forms, v0.619; classes taught together, v0.620): is the
--   database exactly as 0031 was tested on? One row:
--     ages_table          is public.schedule_class_ages already there?
--     set_function        is schedule_set_class_ages already there?
--     groups_table        is public.form_booking_group_limits already
--                         there?
--     replaced_found      how many of the ten functions 0031 replaces
--                         exist, one each (schedule_before_write,
--                         forms_open_times, forms_public_get,
--                         forms_public_submit, prospects_open_times,
--                         forms_times, forms_submit_core, forms_duplicate,
--                         forms_set_booking, prospects_book_time)
--     replaced_as_tested  how many of those ten still have EXACTLY the
--                         code 0031 was tested against (0007's, 0009's
--                         and 0012's - body md5 without comments and
--                         spaces, as in the fingerprint files)
--
-- WHY
--   0031 replaces ten live functions with copies of their 0007 / 0009 /
--   0012 code plus its changes. If another change had replaced one of
--   them since, pasting 0031 would silently undo that change.
--     false / false / false / 10 / 10  -> go on (nothing of 0031 yet,
--                                         all as tested)
--     true  / true  / true  / 10 / 0   -> 0031 is already applied
--   Anything else: stop and tell Claude (a function changed since it was
--   tested - 0031 must be rebuilt on the newer code first).
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs checks this, and that it answers
-- false / false / false / 10 / 10 before 0031, true / true / true / 10 / 0
-- after it, and the "before" answer again after the undo.
-- =====================================================================

with f as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('schedule_before_write', 'forms_open_times', 'forms_public_get', 'forms_public_submit',
                       'prospects_open_times', 'forms_times', 'forms_submit_core', 'forms_duplicate',
                       'forms_set_booking', 'prospects_book_time')
), tested (proname, body_md5) as (
  values ('schedule_before_write', 'e468d300a2b9be9eb795de868d640445'),
         ('forms_open_times',      '5863bd654267295200b4ca36e43c0991'),
         ('forms_public_get',      'aa0f45dfe399957c8574c5169bbcbfd2'),
         ('forms_public_submit',   '3bdf941485571b68ad26aefa7856459b'),
         ('prospects_open_times',  '08ed829873638abf0cc7a0f831195afd'),
         ('forms_times',           '75588e32a3270fac1a6289c2bd68c85e'),
         ('forms_submit_core',     'ec21af5c89fb773dd35a4eba0090b531'),
         ('forms_duplicate',       'b0dc789e09af8024a43320a63300ca28'),
         ('forms_set_booking',     '8f908237fa867dae681bdbe2317df2a0'),
         ('prospects_book_time',   'f35fa3e28cf9da67d70723d069ed3065')
)
select to_regclass('public.schedule_class_ages') is not null                                as ages_table,
       to_regprocedure('public.schedule_set_class_ages(uuid, integer, integer)') is not null as set_function,
       to_regclass('public.form_booking_group_limits') is not null                          as groups_table,
       (select count(distinct f.proname)::integer from f
         where (select count(*) from f as g where g.proname = f.proname) = 1)                as replaced_found,
       (select count(*)::integer from f join tested t on t.proname = f.proname and t.body_md5 = f.body_md5) as replaced_as_tested;
