-- =====================================================================
-- 0033_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0033. One row:
--     mark_paid_3_inputs   true = the old camp_mark_paid(uuid, integer,
--                          text) is there (0033 replaces it)
--     mark_paid_4_inputs   true = 0033's 4-input one is already there
--     replaced_as_tested   how many of the 3 functions 0033 replaces still
--                          have EXACTLY the code it was built on: 0013's
--                          camp_mark_paid and camp_undo_payment, 0022's
--                          camp_edit_payment (body md5 below)
--     new_columns          how many of 0033's 2 new columns exist
--     history_function     true = camp_camper_history exists
--     campers              campers the backfill fills in (every camper)
--     campers_desk_changed campers whose Paying by was ALREADY changed at
--                          the desk (a change_log update of paying_by:
--                          Change how they'll pay, or a by-hand edit).
--                          Information only: the backfill takes each
--                          camper's form choice from their own history
--                          insert row (what the family form sent), not
--                          from today's Paying by, so these campers still
--                          get the right "on the form" / "at the desk" hint.
--     campers_without_insert_row  campers with NO readable history insert
--                          row (change_log, table camp_campers, op insert,
--                          paying_by cash / check / card). Only these get
--                          today's Paying by as "the form's choice".
--   Ready to paste: true / false / 3 / 0 / false / any / any / 0.
--   campers_without_insert_row above 0 -> tell Jeffrey before pasting
--   (Claude can list them through the connection): their hint could say
--   "on the form" for a way chosen at the desk.
--   Already applied: false / true / 0 / 2 / true (camp_undo_payment and
--   camp_edit_payment keep their names but have 0033's code, so they no
--   longer count; the 3-input camp_mark_paid is gone).
--   Anything else -> stop: a function changed since 0033 was built, and
--   0033 must be rebuilt on the newer code first (pasting it would undo
--   that change).
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs checks this, and the answers on a
-- clean database before and after 0033.
-- =====================================================================

with fn as (
  select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('camp_mark_paid', 'camp_undo_payment', 'camp_edit_payment', 'camp_camper_history')
)
select exists (select 1 from fn where fn.oid = to_regprocedure('public.camp_mark_paid(uuid, integer, text)'))       as mark_paid_3_inputs,
       exists (select 1 from fn where fn.oid = to_regprocedure('public.camp_mark_paid(uuid, integer, text, text)')) as mark_paid_4_inputs,
       (select count(*)::integer from fn
         where (fn.oid = to_regprocedure('public.camp_mark_paid(uuid, integer, text)')
                and fn.body_md5 = '20edb5634dec24c014fc538fd66ae7b9')
            or (fn.oid = to_regprocedure('public.camp_undo_payment(uuid)')
                and fn.body_md5 = '0c62f866629808ad8e23f5189575b01b')
            or (fn.oid = to_regprocedure('public.camp_edit_payment(uuid, text, integer, date, text)')
                and fn.body_md5 = '3444939cbdbe3c8f404188fa98047265'))                                                  as replaced_as_tested,
       (select count(*)::integer from pg_attribute t
         where (t.attrelid = to_regclass('public.camp_campers') and t.attname = 'paying_by_on_form')
            or (t.attrelid = to_regclass('public.camp_payments') and t.attname = 'paying_by_before')) as new_columns,
       exists (select 1 from fn where fn.proname = 'camp_camper_history')                                       as history_function,
       (select count(*)::integer from public.camp_campers)                                                      as campers,
       (select count(distinct l.record_id)::integer from public.change_log l
         where l.table_name = 'camp_campers' and l.op = 'update' and (l.after ->> 'paying_by') is not null
           and exists (select 1 from public.camp_campers c where c.id = l.record_id))                           as campers_desk_changed,
       (select count(*)::integer from public.camp_campers c
         where not exists (select 1 from public.change_log l
                            where l.table_name = 'camp_campers' and l.record_id = c.id and l.op = 'insert'
                              and (l.after ->> 'paying_by') in ('cash', 'check', 'card')))             as campers_without_insert_row;
