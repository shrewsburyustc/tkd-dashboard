-- =====================================================================
-- 0046_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0046 (SETUP.md 0046a),
--   and again AFTER it and after an undo (0046e). One row:
--     payment_is_0016   true = Record payment is exactly 0016's function
--                       (bb_record_payment, 6 inputs) - nothing else
--                       changed it since; false after 0046
--     payment_is_0046   true = it is already 0046's function (7 inputs,
--                       with p_school)
--     refund_is_0016    the same for Record refund (bb_record_refund,
--                       5 inputs)
--     refund_is_0046    true = Record refund is already 0046's (6 inputs)
--     payment_versions  how many bb_record_payment functions exist (must
--                       be 1 - a second version makes every call fail as
--                       "not unique")
--     refund_versions   the same for bb_record_refund (must be 1)
--   A body is recognised by the md5 of its code with every comment and
--   every space taken out - the same "body_md5" the fingerprint files
--   print, so a change of comments or spacing alone doesn't count.
--     0016's Record payment: cdb0669362d4a0e7729f3362f6dbb2f2
--     0046's Record payment: cc4e34bd6210d2235b6a0567a1a656f0
--     0016's Record refund:  4db305703d66061fe7963499374af4d3
--     0046's Record refund:  275b129dd69fb6469d3afdd2eb86396e
--
-- WHY
--   Before 0046: payment_is_0016 true, payment_is_0046 false,
--   refund_is_0016 true, refund_is_0046 false, both versions 1.
--   A false / false pair means someone changed the function since 0016 -
--   stop and tell Claude (0046 must then be rebuilt on the newer code).
--   After 0046: payment_is_0016 false, payment_is_0046 true, refund_is_0016
--   false, refund_is_0046 true, both versions 1.
--   After an undo: as before 0046.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs (step0046) checks this, and its
-- answers before 0046, after it, and after the undo.
-- =====================================================================

with fn as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as body_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('bb_record_payment', 'bb_record_refund')
)
select coalesce((select bool_and(f.body_md5 = 'cdb0669362d4a0e7729f3362f6dbb2f2') from fn f where f.proname = 'bb_record_payment'), false) as payment_is_0016,
       coalesce((select bool_and(f.body_md5 = 'cc4e34bd6210d2235b6a0567a1a656f0') from fn f where f.proname = 'bb_record_payment'), false) as payment_is_0046,
       coalesce((select bool_and(f.body_md5 = '4db305703d66061fe7963499374af4d3') from fn f where f.proname = 'bb_record_refund'), false) as refund_is_0016,
       coalesce((select bool_and(f.body_md5 = '275b129dd69fb6469d3afdd2eb86396e') from fn f where f.proname = 'bb_record_refund'), false) as refund_is_0046,
       (select count(*) from fn f where f.proname = 'bb_record_payment')::integer as payment_versions,
       (select count(*) from fn f where f.proname = 'bb_record_refund')::integer as refund_versions;
