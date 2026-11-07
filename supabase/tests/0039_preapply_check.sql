-- =====================================================================
-- 0039_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0039 (Camps Record
--   refund, rulebook v1.039 / v1.040 / v0.743; SETUP.md 0039a). One row:
--     replaced_found      how many of the three functions 0039 replaces
--                         exist, one version each (camp_payments_guard,
--                         camp_undo_payment, camp_edit_payment): 3
--     replaced_as_tested  how many of the FIVE things 0039 replaces still
--                         have EXACTLY what 0039 was built on: the three
--                         functions' code (0013's guard, 0033's Undo and
--                         Edit payment - body md5 without comments and
--                         spaces, as in the fingerprint files), the
--                         camp_roster view (0033's - an md5 of its
--                         definition) and the kind rule
--                         camp_payments_kind_check (0022's - an md5 of its
--                         definition)
--     applied_as_tested   how many of those five have EXACTLY 0039's
--     new_functions       how many of camp_record_refund /
--                         camp_undo_refund exist (0 before, 2 after)
--     refunds             how many refund rows exist (0 before 0039, and
--                         still 0 until the app with Record refund is live)
--     payments            how many camp_payments rows there are
--                         (information only: the new kind rule is checked
--                         against each of them when 0039 runs)
--
-- WHY
--   0039 replaces three live functions, the roster view and the kind rule
--   with copies of their 0013 / 0022 / 0033 versions plus Record refund.
--   If another change had replaced one of them since, pasting 0039 would
--   silently undo that change.
--     3 / 5 / 0 / 0 / 0 / n  -> go on (nothing of 0039 yet, all as tested)
--     3 / 0 / 5 / 2 / r / n  -> 0039 is already applied
--   Anything else: stop and tell Claude (something changed since it was
--   tested - 0039 must be rebuilt on the newer code first).
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0039) checks this, and that
-- it answers the "go on" row before 0039 and the "already applied" row
-- after it.
-- =====================================================================

with f as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('camp_payments_guard', 'camp_undo_payment', 'camp_edit_payment')
), x (name, md5) as (
  select f.proname::text, f.body_md5 from f
  union all
  select 'camp_roster', md5(pg_get_viewdef(c.oid))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'camp_roster'
  union all
  select 'camp_payments_kind_check', md5(pg_get_constraintdef(k.oid))
    from pg_constraint k
   where k.conrelid = to_regclass('public.camp_payments') and k.conname = 'camp_payments_kind_check'
), built_on (name, md5) as (
  values ('camp_payments_guard',      '87d216fa2d0e59c247a6d630fb0222bc'),   -- 0013
         ('camp_undo_payment',        '37f99490eac6c18f4b674c14143367e2'),   -- 0033
         ('camp_edit_payment',        '8e911c77457e1d2ce2409aa833ad5840'),   -- 0033
         ('camp_roster',              'd4951ac179fbbb2a3a5ab86e9628e081'),   -- 0033
         ('camp_payments_kind_check', '71eabfe95c3273aeab5a9e201ef9417f')    -- 0022
), applied (name, md5) as (
  values ('camp_payments_guard',      '95e5d491f409166c72f1a6056083fc41'),   -- 0039
         ('camp_undo_payment',        '289e1efa6ebe9973eefe6b162b2f3dfc'),   -- 0039
         ('camp_edit_payment',        'eaf25164913b1cd98c41b8dd2c3dce01'),   -- 0039
         ('camp_roster',              '7d5e502cb563a572b40cfc9fdd09e3fe'),   -- 0039
         ('camp_payments_kind_check', '8390f9106a10a0e60b9fbd18bfe51d86')    -- 0039
)
select (select count(distinct f.proname)::integer from f
         where (select count(*) from f as g where g.proname = f.proname) = 1)                as replaced_found,
       (select count(*)::integer from x join built_on t on t.name = x.name and t.md5 = x.md5) as replaced_as_tested,
       (select count(*)::integer from x join applied t on t.name = x.name and t.md5 = x.md5)  as applied_as_tested,
       ((to_regprocedure('public.camp_record_refund(uuid, integer, text, integer, date, text)') is not null)::integer
        + (to_regprocedure('public.camp_undo_refund(uuid)') is not null)::integer)            as new_functions,
       (select count(*)::integer from public.camp_payments p where p.kind = 'refund')        as refunds,
       (select count(*)::integer from public.camp_payments)                                  as payments;
