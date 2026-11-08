-- =====================================================================
-- 0038_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0038 (Star design-review
--   database fixes; SETUP.md 0038a), and again before its undo (0038f).
--   One row:
--     new_columns            how many of the three new columns exist
--                            (star_payments.school, star_payments.
--                            paying_by_before, star_candidates.
--                            paying_by_on_form): 0 before 0038, 3 after
--     old_signatures         how many of the OLD inputs exist:
--                            star_record_payment with 5 inputs and
--                            star_record_refund with 5 (2 before, 0 after)
--     new_signatures         how many of the NEW inputs exist:
--                            star_record_payment and star_record_refund
--                            with 6 (p_school last) and star_undo_event_edit:
--                            0 before, 3 after
--     replaced_found         how many of the seven functions 0038 replaces
--                            exist, one version each (star_record_payment,
--                            star_undo_payment, star_edit_payment,
--                            star_record_refund, star_event_results,
--                            star_results_csv, star_payments_guard): 7
--     replaced_as_tested     how many of those seven still have EXACTLY the
--                            code 0038 was built on (0006's, and 0023's
--                            star_results_csv - body md5 without comments
--                            and spaces, as in the fingerprint files)
--     applied_as_tested      how many of the nine functions 0038 makes or
--                            replaces (the seven, star_undo_event_edit and
--                            star_candidates_keep_form_choice) have EXACTLY
--                            0038's code
--     payments_elsewhere     payments taken at a school other than their
--                            candidate's school (what 0038's undo refuses on)
--     payments_with_way      payments that also changed a candidate's Paying
--                            by (paying_by_before set; the undo refuses on
--                            these too)
--   The two payment counts are read through to_jsonb(), so this query works
--   before 0038 too (the columns aren't there yet).
--
-- WHY
--   0038 replaces seven live functions with copies of their 0006 / 0023
--   code plus the new parts. If another change had replaced one of them
--   since, pasting 0038 would silently undo that change.
--     0 / 2 / 0 / 7 / 7 / 0 / 0 / 0  -> go on (nothing of 0038 yet, all as
--                                       tested)
--     3 / 0 / 3 / 7 / 0 / 9 / n / n  -> 0038 is already applied
--   Anything else: stop and tell Claude (a function changed since it was
--   tested - 0038 must be rebuilt on the newer code first).
--   Before the UNDO (SETUP 0038f): the last two numbers must be 0, or the
--   undo file stops and changes nothing.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0038) checks this, and that
-- it answers 0 / 2 / 0 / 7 / 7 / 0 / 0 / 0 before 0038,
-- 3 / 0 / 3 / 7 / 0 / 9 / 0 / 0 after it, and the "before" answer again
-- after the undo.
-- =====================================================================

with f as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('star_record_payment', 'star_undo_payment', 'star_edit_payment', 'star_record_refund',
                       'star_event_results', 'star_results_csv', 'star_payments_guard',
                       'star_undo_event_edit', 'star_candidates_keep_form_choice')
), built_on (proname, body_md5) as (
  values ('star_record_payment', 'e3c49c98057b0fb6ff80cb396b37cdbb'),   -- 0006
         ('star_undo_payment',   '62d3d5d65fb54ff45b05f263f1f41ad4'),   -- 0006
         ('star_edit_payment',   '37e72288d98c0336fb4fb15b9a0b775c'),   -- 0006
         ('star_record_refund',  '0f6993d967f98675cff1a8431983c863'),   -- 0006
         ('star_event_results',  '3dff6e9334feafe29ff1e90d0100f447'),   -- 0006
         ('star_results_csv',    'ace88c909b3377cbfdaa2d4b095838e5'),   -- 0023
         ('star_payments_guard', 'a759500f9e6edccb23358f28516443e1')    -- 0006
), applied (proname, body_md5) as (
  values ('star_record_payment',            '431c70f5097f24f9537f99de40df80a1'),   -- 0038
         ('star_undo_payment',              '0dc00bd6b208c9bd606f6ea3412e5991'),   -- 0038
         ('star_edit_payment',              '5c08d55187f9dbc6eecfabb589e35166'),   -- 0038
         ('star_record_refund',             'ef664aed576ac48acdd7078da2ca05a4'),   -- 0038
         ('star_event_results',             'c23995089fb031496f6116fd0ae637fd'),   -- 0038
         ('star_results_csv',               '2d10258952aab9a2374547a131a4313d'),   -- 0038
         ('star_payments_guard',            'ad70a9e9591445ad3bb4841898182a02'),   -- 0038
         ('star_undo_event_edit',           '3afcaaa2e7588c187616c74381f3ec8e'),   -- 0038
         ('star_candidates_keep_form_choice', '848bbf6c3c0d95a6f41d06ea6619798e')  -- 0038
)
select ((select count(*)::integer from pg_attribute a
          where a.attrelid = to_regclass('public.star_payments') and a.attname in ('school', 'paying_by_before')
            )
        + (select count(*)::integer from pg_attribute a
            where a.attrelid = to_regclass('public.star_candidates') and a.attname = 'paying_by_on_form'
            ))                                                          as new_columns,
       ((to_regprocedure('public.star_record_payment(uuid, integer, text, integer, date)') is not null)::integer
        + (to_regprocedure('public.star_record_refund(uuid, integer, text, integer, date)') is not null)::integer)
                                                                                                as old_signatures,
       ((to_regprocedure('public.star_record_payment(uuid, integer, text, integer, date, text)') is not null)::integer
        + (to_regprocedure('public.star_record_refund(uuid, integer, text, integer, date, text)') is not null)::integer
        + (to_regprocedure('public.star_undo_event_edit(uuid, integer, text, date, time, text, date, text, time, boolean)') is not null)::integer)
                                                                                                as new_signatures,
       (select count(distinct t.proname)::integer from built_on t
         where (select count(*) from f where f.proname = t.proname) = 1)                        as replaced_found,
       (select count(*)::integer from f join built_on t on t.proname = f.proname and t.body_md5 = f.body_md5) as replaced_as_tested,
       (select count(*)::integer from f join applied t on t.proname = f.proname and t.body_md5 = f.body_md5)  as applied_as_tested,
       (select count(*)::integer from public.star_payments p
          join public.star_candidates c on c.id = p.candidate_id
         where to_jsonb(p) ->> 'school' is distinct from c.location_code
           and to_jsonb(p) ->> 'school' is not null)                                            as payments_elsewhere,
       (select count(*)::integer from public.star_payments p
         where to_jsonb(p) ->> 'paying_by_before' is not null)                                  as payments_with_way;
